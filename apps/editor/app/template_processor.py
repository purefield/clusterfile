"""Template processor for Jinja2 rendering with YAML output."""
import yaml
from jinja2 import Environment, FileSystemLoader
import os
import yamllint.config
import yamllint.linter
import jsonpath_ng
import re
from pathlib import Path
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))  # dev: repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))              # container: /app/
from lib.render import (
    IndentDumper, LoggingUndefined, base64encode, as_list, passwd_hash, set_by_path,
    resolve_path, validate_data_for_template, YAMLLINT_CONFIG, format_yaml_output,
)

# Backwards-compatible alias retained for the editor test module.
_set_by_path = set_by_path


CONTENT_ROOT = "/content"

# Per-restart unlock key gating /content reads.
#
# Generated once at module import; printed to stdout where the operator who
# started the container can see it (`podman logs <container>` for the
# detached case). The UI must echo this key back via the X-Content-Unlock
# header before the backend will read from /content. Browser-uploaded files
# (the per-request `files` map) are not gated — those are the user's own
# data uploaded via this tab's session.
#
# Re-generated on every process restart so a leaked key never outlives the
# running app.
import secrets as _secrets  # noqa: E402
import sys as _sys  # noqa: E402

CONTENT_UNLOCK_KEY = _secrets.token_urlsafe(32)


def _print_unlock_banner() -> None:
    """Print the per-restart key once, only if /content might actually serve."""
    banner = (
        "\n"
        "============================================================\n"
        " Clusterfile Editor — file-content unlock key (this restart):\n"
        f"   {CONTENT_UNLOCK_KEY}\n"
        " Paste in the editor when prompted to enable File: content.\n"
        " Required only when /content is mounted.\n"
        "============================================================\n"
    )
    print(banner, flush=True)
    try:
        _sys.stdout.flush()
    except Exception:
        pass


_print_unlock_banner()


def is_unlock_valid(provided: "str | None") -> bool:
    """Constant-time check of a presented unlock key.

    Returns True when /content is not mounted (nothing to gate). Otherwise
    the provided value must equal the per-restart key.
    """
    if not os.path.isdir(CONTENT_ROOT):
        return True
    if not isinstance(provided, str) or not provided:
        return False
    return _secrets.compare_digest(provided, CONTENT_UNLOCK_KEY)


def content_status() -> dict:
    """Inspect the mounted content directory.

    `load_file()` calls in templates use relative paths (typically
    ``secrets/pull-secret.json``, ``manifests/extra.yaml``,
    ``certs/internal-ca.crt`` — anything the operator wants to inject). Mount
    a single root at CONTENT_ROOT and the editor walks the whole subtree;
    files in the inventory are reported by their path relative to the root,
    matching the form the YAML uses.

    Returns {"mounted": bool, "root": CONTENT_ROOT, "files": [relpaths]}.
    """
    if not os.path.isdir(CONTENT_ROOT):
        return {"mounted": False, "root": CONTENT_ROOT, "files": [], "unlock_required": False}
    files = []
    try:
        for dirpath, _, filenames in os.walk(CONTENT_ROOT):
            for fn in filenames:
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, CONTENT_ROOT)
                files.append(rel)
    except OSError:
        pass
    files.sort()
    return {
        "mounted": True,
        "root": CONTENT_ROOT,
        "files": files,
        # The UI uses unlock_required to decide whether to prompt for the key
        # before flipping the Display/Output rocker to content or kicking off
        # an ISO build that needs /content.
        "unlock_required": True,
    }


def _resolve_under_root(root: str, path: str) -> str | None:
    """Resolve a relative include path under root, refusing traversal escapes."""
    normalized = os.path.normpath(path).lstrip("/")
    if not normalized or normalized.startswith(".."):
        return None
    candidate = os.path.realpath(os.path.join(root, normalized))
    root_real = os.path.realpath(root)
    if candidate != root_real and not candidate.startswith(root_real + os.sep):
        return None
    return candidate if os.path.isfile(candidate) else None


def _make_load_file(include_content: bool, files: dict | None = None):
    """Build the load_file Jinja global.

    Resolution order:
      1. Per-request ``files`` map (browser-uploaded content, in-memory only) —
         highest priority because it reflects what the user just clicked.
      2. CONTENT_ROOT mount when ``include_content`` is True and the path
         resolves under the root.
      3. Documented ``<file:path>`` placeholder.

    The trailing newline is stripped on disk reads so YAML strings stay tidy;
    in-memory uploads are returned verbatim (callers can pre-trim).
    """
    files = files or {}

    def load_file(path: str) -> str:
        if not path or not isinstance(path, str):
            return ""
        # Per-request override map wins over disk and placeholder.
        if path in files:
            val = files[path]
            return val if isinstance(val, str) else ""
        if include_content and os.path.isdir(CONTENT_ROOT):
            full = _resolve_under_root(CONTENT_ROOT, path)
            if full:
                try:
                    with open(full, "r") as f:
                        return f.read().rstrip("\n")
                except OSError:
                    pass
        return f"<file:{path}>"
    return load_file


# Backwards-compatible default: callers that import load_file directly still
# get the placeholder-only behavior.
load_file = _make_load_file(include_content=False)


def apply_params(data: dict, params: list) -> dict:
    """Apply JSONPath parameter overrides to data."""
    for override in params:
        if "=" not in override:
            continue
        path_expr, val = override.split("=", 1)
        val = val.encode("utf-8").decode("unicode_escape")
        try:
            expr = jsonpath_ng.parse(path_expr)
            matches = expr.find(data)
            if matches:
                for m in matches:
                    m.full_path.update(data, val)
                continue
        except Exception:
            pass
        set_by_path(data, path_expr, val)
    return data


def process_template(config_data: dict, template_content: str, template_dir: str,
                     include_content: bool = False, files: dict | None = None) -> tuple:
    """Process a Jinja2 template with the given configuration data.
    Returns (output, missing_vars) tuple.
    """
    includes_dir = os.path.join(template_dir, 'includes')
    plugins_tpl  = os.path.join(template_dir, 'plugins')
    plugins_root = os.path.join(os.path.dirname(template_dir), 'plugins')
    loader_paths = [template_dir]
    if os.path.exists(includes_dir):
        loader_paths.append(includes_dir)
    if os.path.exists(plugins_tpl):
        loader_paths.append(plugins_tpl)
    if os.path.exists(plugins_root):
        loader_paths.append(plugins_root)

    env = Environment(loader=FileSystemLoader(loader_paths), undefined=LoggingUndefined)
    env.globals["load_file"] = _make_load_file(include_content, files)
    env.filters["base64encode"] = base64encode
    env.filters["as_list"] = as_list
    env.filters["passwd_hash"] = passwd_hash
    env.filters["merge"] = lambda a, b: {**a, **b}

    LoggingUndefined._missing = {}
    template = env.from_string(template_content)
    output = template.render(config_data)
    return output, dict(LoggingUndefined._missing)


def render_template(yaml_text: str, template_name: str, params: list, templates_dir: Path,
                    include_content: bool = False, files: dict | None = None) -> dict:
    """Render a Jinja2 template with YAML data and optional parameter overrides."""
    # Parse YAML input
    try:
        data = yaml.safe_load(yaml_text) or {}
    except yaml.YAMLError as e:
        return {"success": False, "error": f"Invalid YAML: {e}", "output": ""}

    # Apply parameter overrides
    if params:
        try:
            data = apply_params(data, params)
        except Exception as e:
            return {"success": False, "error": f"Failed to apply parameters: {e}", "output": ""}

    # Validate template path
    template_path = templates_dir / template_name
    if not template_path.exists():
        return {"success": False, "error": f"Template not found: {template_name}", "output": ""}

    # Security: prevent path traversal
    safe_name = os.path.basename(template_name)
    if safe_name != template_name or ".." in template_name:
        return {"success": False, "error": "Invalid template name", "output": ""}

    # Read template
    try:
        with open(template_path, 'r') as f:
            template_content = f.read()
    except Exception as e:
        return {"success": False, "error": f"Failed to read template: {e}", "output": ""}

    # Pre-render validation (warnings only, never blocks rendering)
    meta = parse_template_metadata(template_content)
    val_warnings, val_errors = validate_data_for_template(data, meta)
    # Demote validation errors to warnings so rendering always proceeds
    all_warnings = val_warnings + val_errors

    # Render template (LoggingUndefined prevents crashes on missing data)
    try:
        processed, missing_vars = process_template(data, template_content, str(templates_dir),
                                                   include_content=include_content, files=files)
        if missing_vars:
            subs = [f"{k}={v!r}" for k, v in sorted(missing_vars.items())]
            all_warnings.append(f"Substituted defaults: {', '.join(subs)}")
    except Exception as e:
        return {"success": False, "error": f"Template rendering failed: {e}", "output": "", "warnings": all_warnings}

    # Format YAML output if applicable
    if template_name.endswith('.yaml.tpl') or template_name.endswith('.yaml.tmpl'):
        try:
            output_yaml = format_yaml_output(processed, meta)

            # Run yamllint
            config = yamllint.config.YamlLintConfig(YAMLLINT_CONFIG)
            problems = list(yamllint.linter.run(output_yaml, config))
            all_warnings += [str(p) for p in problems]

            return {
                "success": True,
                "output": output_yaml,
                "warnings": all_warnings,
                "error": ""
            }
        except Exception as e:
            return {"success": False, "error": f"YAML processing failed: {e}", "output": processed, "warnings": all_warnings}

    return {"success": True, "output": processed, "warnings": all_warnings, "error": ""}


def parse_template_metadata(content: str) -> dict:
    """
    Parse @meta block from template content.

    Metadata format:
    {#- @meta
    name: template-name.yaml
    description: What this template does
    type: clusterfile|other
    category: installation|credentials|acm|configuration|utility|storage
    platforms: [list of supported platforms]
    requires: [list of required data fields]
    bundle: agent | acm-hub | acm-ztp | capi | utility (or comma-separated list of bundles)
    clusterRole: [standalone | hub | managed]  (which cluster intent this template serves)
    bundleOrder: integer (display order in tabs; lower = leftmost)
    docs: URL to documentation
    -#}
    """
    meta = {
        "name": "",
        "description": "",
        "type": "other",
        "category": "other",
        "platforms": [],
        "requires": [],
        "bundle": "",
        "clusterRole": [],
        "bundleOrder": 99,
        "docs": "",
        "yamlWrapper": "list"
    }

    # Look for @meta block
    import re
    match = re.search(r'\{#-?\s*@meta\s*\n(.*?)\n\s*-?#\}', content, re.DOTALL)
    if not match:
        return meta

    meta_text = match.group(1)
    try:
        parsed = yaml.safe_load(meta_text)
        if isinstance(parsed, dict):
            meta.update(parsed)
    except Exception:
        pass

    return meta


def list_templates(templates_dir: Path) -> list:
    """List all available templates with metadata."""
    templates = []
    if not templates_dir.exists():
        return templates

    for f in sorted(templates_dir.glob("*.tpl")):
        try:
            content = f.read_text()
            meta = parse_template_metadata(content)
            meta["filename"] = f.name
            if not meta["name"]:
                meta["name"] = f.name
            if not meta["description"]:
                meta["description"] = get_template_description(f)
            templates.append(meta)
        except Exception:
            templates.append({
                "filename": f.name,
                "name": f.name,
                "description": get_template_description(f),
                "type": "other",
                "category": "other",
                "platforms": [],
                "requires": [],
                "bundle": "",
                "clusterRole": [],
                "bundleOrder": 99,
                "docs": ""
            })

    for f in sorted(templates_dir.glob("*.tmpl")):
        try:
            content = f.read_text()
            meta = parse_template_metadata(content)
            meta["filename"] = f.name
            if not meta["name"]:
                meta["name"] = f.name
            if not meta["description"]:
                meta["description"] = get_template_description(f)
            templates.append(meta)
        except Exception:
            templates.append({
                "filename": f.name,
                "name": f.name,
                "description": get_template_description(f),
                "type": "other",
                "category": "other",
                "platforms": [],
                "requires": [],
                "bundle": "",
                "clusterRole": [],
                "bundleOrder": 99,
                "docs": ""
            })

    return templates


def get_template_description(template_path: Path) -> str:
    """Get a fallback description for a template without metadata."""
    descriptions = {
        "install-config.yaml.tpl": "OpenShift install-config.yaml (unified for all platforms)",
        "creds.yaml.tpl": "CCO credentials for cloud platforms (AWS, Azure, GCP, etc.)",
        "agent-config.yaml.tpl": "Agent-based installer agent-config.yaml with bond/VLAN",
        "acm-ztp.yaml.tpl": "ACM Zero Touch Provisioning configuration",
        "acm-capi-m3.yaml.tpl": "ACM CAPI + Metal3 configuration for MCE",
        "acm-creds.yaml.tpl": "ACM host inventory credentials",
        "acm-asc.yaml.tpl": "ACM Assisted Service ConfigMap",
        "mirror-registry-config.yaml.tpl": "Mirror registry configuration",
        "nodes-config.yaml.tpl": "Node network configuration with NMState",
        "secondary-network-setup.yaml.tpl": "Secondary network NNCP configuration",
        "infinidat-setup.yaml.tpl": "Infinidat storage configuration",
        "test-dns.sh.tpl": "DNS verification script",
    }
    return descriptions.get(template_path.name, "Jinja2 template")


def get_template_content(template_name: str, templates_dir: Path) -> dict:
    """Get the raw content of a template file."""
    safe_name = os.path.basename(template_name)
    if safe_name != template_name or ".." in template_name:
        return {"success": False, "error": "Invalid template name", "content": ""}

    template_path = templates_dir / template_name
    if not template_path.exists():
        return {"success": False, "error": f"Template not found: {template_name}", "content": ""}

    try:
        with open(template_path, 'r') as f:
            return {"success": True, "content": f.read(), "error": ""}
    except Exception as e:
        return {"success": False, "error": f"Failed to read template: {e}", "content": ""}
