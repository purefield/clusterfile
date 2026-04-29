"""Agent-based-installer ISO builder.

Self-contained: fetches `openshift-install` for the requested OCP version into
a host-mounted cache (so we don't re-download GBs across container restarts),
renders the agent bundle from the user's clusterfile, runs `openshift-install
agent create image`, and returns the path to the generated ISO.

Required mounts at runtime:
  - /content (read-only): host directory whose subtree matches the paths the
    user's clusterfile references via load_file (e.g. secrets/, manifests/,
    certs/). Used unless the per-request `files` map overrides a path.
  - /cache (read-write): persistent install-binary + RHCOS cache.

Cache layout:
  /cache/bin/openshift-install/<version>/<arch>/openshift-install
  /cache/agent/             # XDG_CACHE_HOME for openshift-install (rhcos etc.)

Path traversal is blocked in template_processor._make_load_file. The bundle
render path here passes `include_content=True` AND the per-request files
map straight through, so a user can ship an ISO without ever mounting
/content as long as every required file was uploaded in-browser.
"""
from __future__ import annotations

import os
import platform
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

import yaml

from app.template_processor import (
    CONTENT_ROOT,
    content_status,
    list_templates,
    render_template,
)

CACHE_ROOT = Path("/cache")
INSTALL_BIN_ROOT = CACHE_ROOT / "bin" / "openshift-install"
AGENT_XDG = CACHE_ROOT / "agent"

MIRROR_BASE = "https://mirror.openshift.com/pub/openshift-v4/clients/ocp"
SUPPORTED_ARCHES = {"x86_64", "aarch64", "ppc64le", "s390x"}
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+(?:[-+].+)?$")


def container_arch() -> str:
    """Return the container's CPU architecture (matches openshift-install bin)."""
    m = platform.machine()
    # Normalize Apple/older labels to mirror.openshift.com vocabulary.
    return {"amd64": "x86_64", "arm64": "aarch64"}.get(m, m)


def cache_status() -> dict:
    """Inventory the cache for the UI/operator.

    Returns:
      cache_mounted, cache_root, cache_writable: mount-presence checks
      cached_versions: [{version, arch, size_mb}] from /cache/bin/
      rhcos_cached: ['<version>-<arch>'] heuristic from /cache/agent/image_cache/
      container_arch: what arch this container will fetch by default
    """
    info = {
        "cache_mounted": CACHE_ROOT.is_dir(),
        "cache_root": str(CACHE_ROOT),
        "cache_writable": False,
        "cached_versions": [],
        "rhcos_cached": [],
        "container_arch": container_arch(),
    }
    if info["cache_mounted"]:
        info["cache_writable"] = os.access(CACHE_ROOT, os.W_OK)
        if INSTALL_BIN_ROOT.is_dir():
            for ver_dir in sorted(INSTALL_BIN_ROOT.iterdir()):
                if not ver_dir.is_dir():
                    continue
                for arch_dir in sorted(ver_dir.iterdir()):
                    bin_path = arch_dir / "openshift-install"
                    if bin_path.is_file():
                        info["cached_versions"].append({
                            "version": ver_dir.name,
                            "arch": arch_dir.name,
                            "size_mb": round(bin_path.stat().st_size / (1024 * 1024), 1),
                        })
        # Heuristic: any file under image_cache implies RHCOS for some version.
        rhcos_dir = AGENT_XDG / "image_cache"
        if rhcos_dir.is_dir():
            for f in rhcos_dir.iterdir():
                if f.is_file():
                    info["rhcos_cached"].append(f.name)
    return info


def _validate_version(version: str) -> str:
    if not version or not SEMVER_RE.match(version):
        raise ValueError(f"cluster.version {version!r} is not a semver like 4.21.0")
    return version


def _validate_arch(arch: str) -> str:
    if arch not in SUPPORTED_ARCHES:
        raise ValueError(f"arch {arch!r} not in {sorted(SUPPORTED_ARCHES)}")
    return arch


def _fetch_archive_extract(url: str, target_dir: Path, want: tuple[str, ...]) -> None:
    """Download a tar.gz from `url` and extract just the listed binary names
    (basename match) into target_dir. Used for openshift-install and oc.
    """
    target_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        suffix=".tar.gz", dir=target_dir, delete=False
    ) as tmp:
        try:
            with urllib.request.urlopen(url, timeout=120) as resp:
                shutil.copyfileobj(resp, tmp)
        except urllib.error.HTTPError as e:
            os.unlink(tmp.name)
            raise RuntimeError(f"fetch failed for {url}: HTTP {e.code}") from e
        tmp_path = Path(tmp.name)
    try:
        with tarfile.open(tmp_path, "r:gz") as tar:
            extracted = set()
            for member in tar.getmembers():
                name = os.path.basename(member.name)
                if name in want and member.isfile() and name not in extracted:
                    member.name = name
                    tar.extract(member, target_dir, filter="data")
                    (target_dir / name).chmod(0o755)
                    extracted.add(name)
            missing = set(want) - extracted
            if missing:
                raise RuntimeError(
                    f"binaries not found in {url}: {sorted(missing)}"
                )
    finally:
        tmp_path.unlink(missing_ok=True)


def ensure_installer(version: str, arch: str) -> Path:
    """Make sure cached `openshift-install` AND `oc` (required by `agent
    create image` to extract the base ISO from the release payload) both
    exist for (version, arch). Returns the openshift-install path; `oc`
    sits next to it so prepending the dir to PATH works.

    Idempotent: returns immediately if both binaries already cached.
    First call per (version, arch) downloads from mirror.openshift.com.
    """
    version = _validate_version(version)
    arch = _validate_arch(arch)
    if not CACHE_ROOT.is_dir():
        raise RuntimeError(f"{CACHE_ROOT} not mounted — pass -v /host/cache:/cache:Z")

    target_dir = INSTALL_BIN_ROOT / version / arch
    install_path = target_dir / "openshift-install"
    oc_path = target_dir / "oc"

    arch_suffix = "" if arch == "x86_64" else f"-{arch}"
    if not install_path.is_file():
        _fetch_archive_extract(
            f"{MIRROR_BASE}/{version}/openshift-install-linux{arch_suffix}.tar.gz",
            target_dir,
            want=("openshift-install",),
        )
    if not oc_path.is_file():
        _fetch_archive_extract(
            f"{MIRROR_BASE}/{version}/openshift-client-linux{arch_suffix}.tar.gz",
            target_dir,
            want=("oc",),
        )

    if not install_path.is_file():
        raise RuntimeError(f"openshift-install missing after fetch: {install_path}")
    if not oc_path.is_file():
        raise RuntimeError(f"oc missing after fetch: {oc_path}")
    return install_path


def _agent_bundle_files(yaml_text: str, files_map: Optional[dict],
                        templates_dir: Path) -> list[dict]:
    """Render every template that belongs to the 'agent' bundle.

    Reuses the existing render_template path with include_content=True and
    the per-request files map so secrets/certs/manifests get inlined
    appropriately. Returns the same shape as /api/render-bundle.
    """
    matching = []
    for t in list_templates(templates_dir):
        bundles = [b.strip() for b in (t.get("bundle") or "").split(",") if b.strip()]
        roles = t.get("clusterRole") or []
        if "agent" in bundles and "standalone" in roles:
            matching.append(t)
    matching.sort(key=lambda t: (t.get("bundleOrder", 99), t.get("filename", "")))

    rendered = []
    for t in matching:
        result = render_template(
            yaml_text=yaml_text,
            template_name=t["filename"],
            params=[],
            templates_dir=templates_dir,
            include_content=True,
            files=files_map,
        )
        rendered.append({
            "filename": t["filename"],
            "name": t.get("name") or t["filename"],
            "bundleOrder": t.get("bundleOrder", 99),
            "success": result["success"],
            "content": result.get("output", ""),
            "error": result.get("error", ""),
        })
    return rendered


def _stage_install_dir(install_dir: Path, rendered: list[dict]) -> None:
    """Drop install-config.yaml and agent-config.yaml at the dir root; every
    other rendered file goes under openshift/ where the agent installer
    picks up extras (operator manifests, mirror config, OperatorHub patches).
    """
    install_dir.mkdir(parents=True, exist_ok=True)
    openshift_dir = install_dir / "openshift"
    openshift_dir.mkdir(exist_ok=True)
    for f in rendered:
        if not f["success"] or not f["content"]:
            continue
        out_name = f["filename"].replace(".tpl", "")
        if out_name in ("install-config.yaml", "agent-config.yaml"):
            (install_dir / out_name).write_text(f["content"])
        else:
            (openshift_dir / out_name).write_text(f["content"])


def build_agent_iso(yaml_text: str, files_map: Optional[dict],
                    templates_dir: Path, arch: Optional[str] = None) -> dict:
    """Render the agent bundle and produce an ISO. Returns:
      {iso_path, cluster_name, arch, version, install_dir, log}

    Caller is responsible for streaming the ISO and cleaning up install_dir.
    The cache (binary + RHCOS) stays put.
    """
    data = yaml.safe_load(yaml_text) or {}
    cluster = data.get("cluster") or {}
    cluster_name = cluster.get("name") or "cluster"
    version = _validate_version(cluster.get("version") or "")
    install_method = cluster.get("installMethod") or "agent"
    if install_method != "agent":
        raise ValueError(
            f"cluster.installMethod={install_method!r} — agent ISO requires 'agent'"
        )
    arch = _validate_arch(arch or container_arch())

    # Render before we touch the cache, so YAML errors fail fast.
    rendered = _agent_bundle_files(yaml_text, files_map, templates_dir)
    failures = [f for f in rendered if not f["success"]]
    if failures:
        joined = "; ".join(f"{f['filename']}: {f['error']}" for f in failures)
        raise RuntimeError(f"agent bundle render failures: {joined}")

    # Verify the rendered install-config still has placeholders the installer
    # will reject — give the user a clear error rather than a cryptic openshift-
    # install failure.
    ic_text = next(
        (f["content"] for f in rendered if f["filename"] == "install-config.yaml.tpl"),
        "",
    )
    if "<file:" in ic_text:
        unresolved = sorted(set(re.findall(r"<file:[^>]+>", ic_text)))
        raise RuntimeError(
            "install-config.yaml has unresolved file references — mount /content "
            "or upload the files via the form. Missing: " + ", ".join(unresolved)
        )

    binary = ensure_installer(version, arch)

    install_dir = Path(tempfile.mkdtemp(prefix=f"agent-iso-{cluster_name}-"))
    log_lines: list[str] = []
    try:
        _stage_install_dir(install_dir, rendered)

        AGENT_XDG.mkdir(parents=True, exist_ok=True)
        # Prepend the cache dir to PATH so openshift-install can exec the
        # bundled `oc` (extracts the base ISO from the release payload).
        cache_bin = str(binary.parent)
        env = {
            **os.environ,
            "XDG_CACHE_HOME": str(AGENT_XDG),
            "HOME": str(AGENT_XDG),
            "PATH": f"{cache_bin}:{os.environ.get('PATH', '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin')}",
        }
        cmd = [str(binary), "agent", "create", "image", "--dir", str(install_dir)]
        log_lines.append("$ " + " ".join(cmd))
        proc = subprocess.run(
            cmd, env=env, capture_output=True, text=True, timeout=900
        )
        log_lines.append(proc.stdout or "")
        log_lines.append(proc.stderr or "")
        if proc.returncode != 0:
            raise RuntimeError(
                f"openshift-install agent create image failed (exit {proc.returncode}):\n"
                + (proc.stderr or proc.stdout or "(no output)")
            )

        # Output filename varies by arch: agent.x86_64.iso / agent.aarch64.iso
        candidate = install_dir / f"agent.{arch}.iso"
        if not candidate.is_file():
            # Some versions drop a generic agent.iso symlink — try that too.
            alt = install_dir / "agent.iso"
            if alt.is_file():
                candidate = alt
            else:
                raise RuntimeError(
                    f"expected ISO not found in {install_dir}: "
                    + ", ".join(p.name for p in install_dir.iterdir())
                )

        return {
            "iso_path": str(candidate),
            "cluster_name": cluster_name,
            "arch": arch,
            "version": version,
            "install_dir": str(install_dir),
            "log": "\n".join(log_lines),
        }
    except Exception:
        # Clean up tmp on error; on success the caller cleans up after streaming.
        shutil.rmtree(install_dir, ignore_errors=True)
        raise


def agent_iso_status() -> dict:
    """Combined status the UI uses to enable/disable the Download Agent ISO button."""
    cache = cache_status()
    content = content_status()
    pull_secret_present = False
    if content["mounted"]:
        pull_secret_present = (Path(content["root"]) / "secrets" / "pull-secret.json").is_file()
    return {
        **cache,
        "content_mounted": content["mounted"],
        "content_root": content["root"],
        "pull_secret_present": pull_secret_present,
    }
