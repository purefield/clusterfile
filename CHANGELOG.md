# Changelog

All notable changes to this project are documented in this file.

## Unreleased
- Tooling: `scripts/extract-doc-urls.py` walks all schemas and emits `schema/x-doc-urls.csv` (115 rows × 6 columns); `scripts/import-doc-urls.py` reads the CSV and applies non-empty `new_url` values back into the source schema files (with `--dry-run` and JSON validation). Sets up the docs.redhat.com html-single URL rewrite — fill `new_url` column then re-import.

## v3.24.2 (2026-04-30)
- **CAPI BMH binding via ACM Policy** — v3.24.1 added a static `infraenvs.agent-install.openshift.io: <cluster.name>` label on BMHs in the CAPI bundle, mirroring ZTP. Diagnosis showed that's the wrong shape for CAPI: the openshift-assisted CAPI bootstrap controller creates one `OpenshiftAssistedConfig` per Machine, each owning its own `InfraEnv` named `<cluster>-<random>`. A static `<cluster.name>` value never matches. The proper integration glue is the `cluster-api-provider-openshift-assisted` infrastructure controller, which creates `AgentMachine` resources that label claimed BMHs with the per-machine InfraEnv name. That controller isn't always installed alongside the bootstrap+control-plane providers.
- **Replacement**: new `templates/includes/capi-bmh-binder-policy.yaml.tpl` emits an ACM `Policy` + `ConfigurationPolicy` that uses hub-side Go templating (`object-templates-raw` with `lookup` + nested `range`) to:
  - List Machines in `<cluster.name>` with the `cluster.x-k8s.io/cluster-name=<cluster.name>` label
  - For each Machine, follow `spec.bootstrap.configRef.name` → `OpenshiftAssistedConfig` (whose name == owned InfraEnv name)
  - For each Machine, follow `spec.infrastructureRef.name` → `Metal3Machine`
  - Find the BMH whose `spec.consumerRef.name` equals that `Metal3Machine` name
  - Patch the BMH with `metadata.labels.infraenvs.agent-install.openshift.io: <OpenshiftAssistedConfig name>`
- The Policy targets `local-cluster` (the hub itself) via Placement + PlacementBinding + ManagedClusterSetBinding (`default` clusterset), all in the cluster namespace so they delete cleanly when the cluster manifests are removed. Continuous reconciliation — newly-claimed BMHs get bound seconds after Metal3 sets `consumerRef`. `pruneObjectBehavior: None` so removing the policy doesn't strip the labels (idempotent if you later install the real infra controller, which uses the same labels).
- **Reverted in `acm-capi-m3.yaml.tpl`**: the static `infraenvs.agent-install.openshift.io: <cluster.name>` label on `BareMetalHost` and `NMStateConfig` (the misleading shape from v3.24.1). Kept the harmless `bmac.agent-install.openshift.io/{hostname, role}` annotations — those are useful regardless of how the BMH gets bound.
- **Header comment block** added to `acm-capi-m3.yaml.tpl` documenting the controller dependency, the verification steps (`oc get crd | grep agentmachine`, `oc get pods -A | grep …infra`), and the fallback to `acm-ztp` when the infra controller is absent and the binder Policy isn't desired.

## v3.24.1 (2026-04-29)
- **CAPI provisioning fix** — `templates/acm-capi-m3.yaml.tpl` BareMetalHost section now mirrors the ZTP pattern:
  - **annotations** add `bmac.agent-install.openshift.io/hostname: <fqdn>` and `bmac.agent-install.openshift.io/role: master|worker` (assisted-installer vocabulary)
  - **labels** add `infraenvs.agent-install.openshift.io: <cluster.name>` (the binding the bmac controller needs to patch the discovery ISO URL onto `BMH.spec.image`)
  - NMStateConfig **labels** also gain `infraenvs.agent-install.openshift.io: <cluster.name>` so the InfraEnv's NMStateConfigLabelSelector selects them for static-network config
  - Root cause: the openshift-assisted CAPI provider stopped auto-labeling BMHs with the InfraEnv binding (likely on the ACM 2.10 → 2.11 GA tightening). Without the label the bmac controller never patches `BMH.spec.image.url`, Ironic never injects a boot ISO, and BMHs sit `available` forever. Adding the label/annotations defensively in the template makes us provider-version-independent — idempotent if a future provider auto-labels again. ZTP unaffected (it always emitted these).
- Test rendering: SNO (1 control), compact (2 control + 1 worker), and platform: none + baremetal — `bmac.role` correctly maps `control → master`, `worker → worker`.

## v3.24.0 (2026-04-29)
- **Q1 — Agent ISO download (Option A: backend on-demand cache)**: new module `apps/editor/app/iso_builder.py` with `ensure_installer(version, arch)` (fetches `openshift-install-linux.tar.gz` and `openshift-client-linux.tar.gz` from `mirror.openshift.com`, extracts the `openshift-install` and `oc` binaries into `/cache/bin/openshift-install/<ver>/<arch>/`, idempotent). New `POST /api/agent-iso` renders the agent bundle with `include_content=True`, stages it (`install-config.yaml`, `agent-config.yaml` at the install dir root; everything else under `openshift/`), runs `openshift-install agent create image --dir <tmp>` with `XDG_CACHE_HOME=/cache/agent` so the RHCOS live ISO is reused, and `FileResponse`-streams the resulting `<cluster.name>-agent-<arch>.iso`. Background-cleans the tmp dir after streaming; cache stays. New `GET /api/agent-iso/status` returns `{cache_mounted, cache_writable, cached_versions, rhcos_cached, container_arch, content_mounted, pull_secret_present}` so the UI can enable/disable the Download Agent ISO button. **Required new `/cache` mount** (read-write); container user is UID 999 inside, document the `podman unshare chown` step.
- **Q2 — Browser-side file uploads (Option A: in-memory only)**: every `x-is-file` schema field renders a sibling `<input type="file">` (Upload button + click-to-clear green badge showing in-memory size). FileReader stashes content in `State.state.uploadedFiles[path]` keyed by the YAML path string. NEVER persisted — no `localStorage` / `sessionStorage` / `IndexedDB` writes. The map travels with every render request as `files: {path: content}`; `_make_load_file` resolution order is per-request files > `/content` > `<file:path>` placeholder. Standalone Nunjucks `load_file` filter consults the same map. Bundle-info row shows "N file(s) uploaded in-memory" when the map is non-empty.
- **Per-restart `/content` unlock key**: `apps/editor/app/template_processor.py` generates a `secrets.token_urlsafe(32)` at module import and prints a banner once to stdout (visible via `podman logs <container> 2>&1 | grep -A1 "unlock key"`). Constant-time comparison via `secrets.compare_digest`. Backend `_check_unlock(http_request, include_content)` raises 403 when `include_content=true` is requested with `/content` mounted and the `X-Content-Unlock` header missing or wrong. UI `promptForContentUnlock()` modal asks for the key on first content flip or ISO build; stores in `State.state.contentUnlockKey` (in-memory only). Re-generated every restart so a leaked key never outlives the process.
- **Disabled-rocker setup dialog**: clicking a greyed `Display:` or `Output:` rocker opens `showEnableContentHelp()` with concrete mount + unlock instructions and a one-click "Enter unlock key" button. Hover shows "Click for setup steps" + dashed outline + cursor:help.
- **Independent rocker plumbing fix**: `wireRocker()` helper extracted; rocker flip from path → content prompts for unlock when needed and snaps back if the user cancels. Cancel is wired through to the disabled-rocker dialog's unlock CTA so the same flow works from either entry point.
- **Templates — SNO + ACM ZTP / CAPI**: 4 templates updated to accept `cluster.platform: none` (was baremetal-only): `acm-ztp.yaml.tpl`, `acm-capi-m3.yaml.tpl`, `acm-creds.yaml.tpl`, `acm-asc.yaml.tpl`. The rendered YAML was already correct for SNO (`controlCount=1` paths produce `platformType: None`, `userManagedNetworking: true`, `controlPlaneAgents: 1`, `workerAgents: 0`); only the metadata gate needed widening. `requires:` lists annotated `(baremetal only)` for `hosts.<hostname>.bmc`.
- **CAPI controlPlaneEndpoint fix** (`bef5717`, folded in): `controlPlaneEndpoint.host` from `<cluster>.<domain>` to `api.<cluster>.<domain>` in `acm-capi-m3.yaml.tpl` to match OCP DNS convention.
- **Container base switch** to `registry.access.redhat.com/ubi9-minimal:latest` (from `python:3.12-slim`): adds `nmstatectl` (required by `openshift-install agent create image` for static-network validation) plus `tar`, `gzip`, `ca-certificates`. python3.12 + pip from microdnf; symlinks for `python` / `pip` so existing app.py and pip-installed packages keep working.
- **README updates**: new sections for the `/content` mount (with the two complementary content sources — host mount and per-session in-browser uploads, the unlock-key flow, the path-traversal protection note) and the `/cache` mount (cache layout, `podman unshare chown` for the container user, air-gapped pre-stage instructions for `openshift-install` + RHCOS).
- **Run command**: `podman run -d --replace --network host --name clusterfile-editor -v /path/to/your/content:/content:ro,Z -v /path/to/cache:/cache:Z quay.io/dds/clusterfile-editor:v3.24.0`. Both mounts are required for the agent ISO download.

## v3.23.1 (2026-04-28)
- **Bundle vs single-template flow fixed**. Two parallel render paths (`autoRenderTemplate` for the dropdown selection, `renderInstallBundleTabs` → `showTab` for bundle files) were both writing to the same CodeMirror, with the tab-switch handler unconditionally calling `autoRenderTemplate` on entering the Rendered tab. Symptom: open in `acm-ztp` bundle → switch to Template tab → pick `install-config` from the dropdown → switch back to Rendered → bundle tabs still showed acm-ztp set but the active tab content had been clobbered with the install-config render. Fix: persistent `State.state.renderedMode` (`'bundle' | 'single'`) and `State.state.activeBundleIndex`, with a `refreshRendered()` dispatcher used everywhere a re-render is needed (tab switch, rocker toggle, document load).
- **Template selector now groups by bundle** instead of by category. Each bundle group leads with `▸ View entire <bundle>` (pseudo-option `__bundle__:<name>`) — picking it switches the rendered pane to bundle mode for that bundle. Picking a real template exits bundle mode, clears the bundle tabs row, and renders just that file. Trailing "Single templates (no bundle)" group catches power-user templates without a bundle.
- **Independent Display vs Output rockers** in the rendered pane header — `Display: [path|content] | Output: [path|content]`. Display drives what's shown in the editor (re-renders on flip via `refreshRendered`); Output drives what Copy/Download produce (no re-render on flip; values fetched fresh from the API at click-time). Both default to `path`. Output greys out when `/content` isn't mounted.
- **Copy/Download** now go through `getRenderedForOutput()` which re-fetches via `/api/render` (single mode) or `/api/render-bundle` (bundle mode, picks the active file) with `include_content` set from the Output rocker. When Output equals Display, the editor content is used directly to avoid an extra API call. Toast confirms which mode was exported.
- **`showTab` persists `activeBundleIndex` and `renderedMode='bundle'`** so flipping rockers and switching tabs keeps the user on the file they were looking at instead of resetting to file 0.

## v3.23.0 (2026-04-28)
- **Generic include-content mount** (Q2 architectural decision = "mounted secrets, no local storage, output-only" — broadened to any `load_file()` reference): editor backend now reads files from a `/content` host mount and substitutes them into rendered output when an opt-in toggle is on. The mount preserves subtree structure: `load_file('secrets/pull-secret.json')` resolves to `/content/secrets/pull-secret.json`, `load_file('manifests/extra.yaml')` to `/content/manifests/extra.yaml`, etc. New endpoint `GET /api/content-status` returns `{mounted, root, files}` where `files` is a sorted list of paths *relative to the mount root* (matching the form templates use); never returns content. `POST /api/render` and `POST /api/render-bundle` accept `include_content: bool` (default `false`); when `true` and `/content` is mounted, `load_file()` resolves the path under the root and returns its content (rstripped trailing newline). Path traversal escapes (`../`) are rejected via `os.path.realpath` containment check; with no mount, with the toggle off, or with a path that doesn't exist, the documented `<file:path>` placeholder is preserved.
- **UI rocker toggle** in the Rendered pane next to Copy/Download — `File: [path | content]` with a sliding thumb. Both options always visible (discoverability), click either label or use Space/Enter/← → keys to flip. Greyed out with a tooltip when `/content` isn't mounted. Toggling re-renders both the active single template and the active bundle tabs.
- **Start modal phantom-edit fix**: stamping `cluster.installMethod` / `cluster.clusterRole` after loading a starter no longer registers as user changes. The modal now re-baselines after stamping so `Changes` stays at 0 and the modified-indicator stays hidden on a fresh New.
- **cluster-overview.html.tpl crash fix**: rows that compute capacity from `subnet.split('/')[1]` are now guarded by `'/' in subnet`, so unedited starters with `<subnet-cidr>` placeholders show the raw value with `—` for capacity instead of failing the whole render with "list object has no element 1".
- **Run command**: `podman run -d --replace --network host --name clusterfile-editor -v /path/to/your/content:/content:ro,Z quay.io/dds/clusterfile-editor:v3.23.0` where `/path/to/your/content` is a directory laid out the same way your clusterfile references files (typical: `secrets/`, optionally `manifests/`, `certs/`). The `:Z` SELinux relabel is required on RHEL/Fedora hosts.
- **Recommended layout** under the content root: `secrets/` for pull secrets / SSH keys / passwords / cloud creds, `manifests/` for `cluster.manifests[].file` extras, `certs/` for `network.trustBundle`. The editor doesn't enforce subdir names — whatever path you write in your YAML resolves under `/content/<that-path>`.

## v3.22.22 (2026-04-27)
- **Consolidated onboarding**: single Start modal merges the old welcome tour and new-document picker. Captures topology (SNO/Compact/Full HA/Blank) and install method (Agent/ACM ZTP/CAPI) on one screen with inline explanations. Removes the Welcome sidebar item from v3.22.21 — the header **New** button is now the single CTA.
- **Schema**: new top-level `cluster.installMethod` (`agent | acm-ztp | capi`) and `cluster.clusterRole` (`standalone | hub | managed`) so a clusterfile self-describes its install intent. Set automatically by the Start modal.
- **Template metadata**: 15 templates now declare `bundle`, `clusterRole`, and `bundleOrder`. Bundles: `agent`, `acm-hub`, `acm-ztp`, `capi`, `utility`. Some templates participate in multiple bundles (e.g. `acm-clusterimageset` is in `acm-hub`, `acm-ztp`, `capi`).
- **Backend**: new `POST /api/render-bundle` filters templates by `bundle ∩ clusterRole`, sorts by `bundleOrder`, returns the rendered file list as `{files: [{filename, name, content, ...}]}`.
- **Tabbed bundle in Rendered pane**: when `cluster.installMethod` is set, the Rendered tab on the right gains a thin tab strip — one tab per bundle file. Clicking a tab swaps the existing CodeMirror's content (so theme, syntax highlighting, copy/download all reused). A small banner explains that `<file:...>` placeholders are expanded by the CLI at render time.
- **Progressive next-step hint**: replaces the static "ready to render" banner with a state-aware hint at the top of form sections — amber for unfilled placeholders ("X to replace — view Todo →"), red for validation errors ("Y issues — view Validation →"), green for ready ("Render <bundle> bundle — open Templates →"). One CTA per state, never competing.

## v3.22.21 (2026-04-27)
- Editor: moved the welcome-modal trigger from the header to a **Welcome** sidebar item next to Guide. Same behavior — read the onboarding steps or pick a topology to start over — but now lives where users look for orientation.

## v3.22.20 (2026-04-27)
- Editor: header now has a **Tour** button that re-opens the welcome modal at any time. Use it to re-read the onboarding steps, or to "start over" by clicking a topology button (SNO / Compact / Full HA / Blank) which swaps the current document for the chosen starter.

## v3.22.19 (2026-04-27)
- Editor onboarding: first-time visitors now land on a pre-filled SNO starter (`<placeholder>` values inline) instead of an empty `account: {}` skeleton — no more "blank page, where do I start?"
- Welcome modal rewritten to be task-oriented: walks through "you're looking at a starter SNO cluster" → sidebar → ? help → Templates. Includes inline topology switcher (SNO / Compact / Full HA / Blank) so users can pick the right starter without leaving the modal.
- Form pane now shows a "Configuration looks complete — Render a template →" banner when both the Todo and Validation badges hit 0, with one-click navigation to the Templates section.

## v3.22.18 (2026-04-27)
- Schema descriptions: added "what + when to change" guidance to 24 platform-defaults fields. Now explained: AWS instance types and rootVolume size/type; Azure VM sizes and osDisk size/type (Premium_LRS rationale, control-plane vs worker sizing); GCP machine types and pd-ssd disk types; IBM Cloud bx2 profiles and bootVolume sizes; host bootMode (UEFI/UEFISecureBoot/legacy); cluster.arch (x86_64/aarch64/ppc64le/s390x); operator subscription approval (Automatic vs Manual).

## v3.22.17 (2026-04-24)
- Schema docs: fixed 51 broken `x-doc-url` values that pointed to `docs.openshift.com/container_platform/...` (typo) — they were redirecting to the docs.redhat.com home page; now use the correct `container-platform/` form
- Schema docs: pinned all 90 OpenShift documentation links to OCP 4.21 (was a mix of 4.16/4.20/4.21/`latest`); covers main schema (73 URLs) plus 4 plugin schemas — cert-manager, lvm, lso, github auth (17 URLs); release-notes URL filename also bumped to `ocp-4-21-release-notes.html`
- Schema text: corePassword description updated from "MachineConfig (master + worker)" to "(control-plane + worker)" — aligns with current OpenShift terminology
- Known issue: docs.openshift.com 4.21 redirects drop both path and anchor (land users on docs.redhat.com 4.21 root). 4.20 redirects preserve the path but the destination Nuxt SPA does not resolve anchors either. No regression vs prior state; full fix requires migrating to `docs.redhat.com html-single` URL form (planned next).

## v3.22.16 (2026-04-24)
- `plugins.baremetal.ironic` split into `operator` (hub Metal3 Provisioning CR: provisioningNetwork, watchAllNamespaces, disableVirtualMediaTLS) and `host` (BareMetalHost defaults: inspection, automatedCleaningMode)

## v3.22.15 (2026-04-24)
- Editor: Plugins → Platform now renders the Ironic form for baremetal (was showing "no configuration required")
- Editor: Node Labels field now renders a key-value editor instead of an empty fieldset
- Schema: `plugins.baremetal` moved inline into `clusterfile.schema.json` (consistent with all other platform plugins); standalone `plugins/platforms/baremetal/schema.json` removed

## v3.22.14 (2026-04-24)
- Ironic plugin fields renamed to exact Metal3/Ironic API terms: `hardwareInspection` → `inspection` (boolean, controls `inspect.metal3.io`), `diskCleanup` → `automatedCleaningMode` (enum: `metadata`/`disabled`, maps directly to BareMetalHost spec)

## v3.22.13 (2026-04-24)
- Ironic flags (`hardwareInspection`, `diskCleanup`) moved from per-host to `plugins.baremetal.ironic` — cluster-level defaults, no per-host override
- Cluster-level Ironic provisioning settings (`provisioningNetwork`, `watchAllNamespaces`, `disableVirtualMediaTLS`) moved from hardcoded values in `acm-asc.yaml.tpl` to `plugins.baremetal.ironic` — configurable via the baremetal platform plugin
- New `plugins/platforms/baremetal/schema.json` exposes all five Ironic flags in the editor UI as checkboxes
- ACM plugin `provisioning` section no longer owns Ironic settings; `acm-asc.yaml.tpl` and ACM manifests both read from `plugins.baremetal.ironic`

## v3.22.12 (2026-04-23)
- automatedCleaningMode: metadata is now the consistent default across all templates; disabled skips cleaning to preserve disk contents
- Schema: description clarifies metadata wipes partition tables, disabled preserves disks

## v3.22.11 (2026-04-23)
- ironicInspect default inverted: inspection now runs by default (annotation absent); set `disabled` to skip it
- Guide: VMware admin translation table at top — maps ESXi/vCenter/OVA concepts to bare-metal equivalents
- Starter cards: hardware-term descriptions (server counts, HA context)
- Schema: BMC field descriptions updated with iDRAC/iLO/IPMI terminology

## v3.22.10 (2026-04-23)
- Fix `ironicInspect: enabled` — omits annotation so Metal3 runs inspection; empty-string value no longer emitted

## v3.22.9 (2026-04-23)
- Fix `rootDeviceHints` string case: plain device path now wraps as `deviceName` mapping; updated doc URL to OCP 4.21 agent-based installer

## v3.22.8 (2026-04-22)
- Extract `bmc-redfish-path.tpl` — single source for vendor→Redfish system path (bmc-url + pre-check templates)

## v3.22.7 (2026-04-23)

## v3.22.6 (2026-04-22)

## v3.22.5 (2026-04-22)

## v3.22.4 (2026-04-22)

## v3.22.3 (2026-04-22)

## v3.22.2 (2026-04-22)

## v3.22.1 (2026-04-22)

## v3.22.0 (2026-04-22)

## v3.21.1 (2026-04-21)

## v3.21.0 (2026-04-21)

## v3.20.1 (2026-04-20)

## v3.20.0 (2026-04-20)

## v3.19.5 (2026-04-20)

- **fips-schema-order** — `cluster.fips` moved to first position in Security group (before TPM and diskEncryption)

## v3.19.4 (2026-04-20)

- **fips-support** — `cluster.fips: true` enables FIPS 140-2/140-3 across all install paths: top-level field in `install-config.yaml`, `agent-install.openshift.io/install-config-overrides` annotation on `AgentClusterInstall` (ZTP), and `install-config-override` annotation JSON (CAPI-M3)

## v3.19.3 (2026-04-20)

- **fix-github-auth-silent-when-unconfigured** — all four GitHub auth templates (`github-oauth-secrets`, `github-oauth`, `github-oauth-patch`, `github-oauth-app-data`) produce empty output with no warnings when `auth.github` is not configured; same `dict.get()` + if-guard pattern as cert-manager fix

## v3.19.2 (2026-04-19)

- **fix-cert-manager-logging-undefined** — cert-manager day2 template uses `dict.get()` instead of Jinja2 attribute access for optional plugins chain; eliminates spurious `operators undefined` warnings when cert-manager is not configured

## v3.19.1 (2026-04-19)

- **fix-cert-manager-null-output** — cert-manager day2 template no longer emits `null` YAML when `plugins.operators` is absent; `format_yaml_output` returns empty string instead of `null` for empty templates
- **new-doc-starter-picker** — New button opens a starter picker modal (SNO / Compact / Full HA / Blank) instead of double-click confirm; secrets paths simplified to `secrets/` in all examples

## v3.19.0 (2026-04-19)

- **nmstate-operator-auto-install** — nmstate operator Namespace/OperatorGroup/Subscription/NMState auto-injected in `operators.yaml` for `platform: baremetal` clusters
- **vip-as-list** — New `as_list` Jinja2 filter normalizes VIP input to list; supports single string or array uniformly across all platform templates and utility scripts
- **schema-network-defaults** — Schema defaults for OCP constants: `network.cluster.subnet` (10.128.0.0/14), `network.service.subnet` (172.30.0.0/16), `network.primary.bond/vlan` (false); stripped from all example files
- **machine-sizing-defaults** — Schema defaults `cpus: 8`, `memory: 32` for all nodes; kubevirt-cluster template uses same defaults
- **platform-kubevirt-to-plugins** — BREAKING: `platform: kubevirt` removed from schema enum; KubeVirt clusters now use `platform: baremetal` + `plugins.kubevirt`
- **sno-derived-from-hosts** — `cluster.clusterType` is now optional override only; templates derive SNO from host count; removed redundant `clusterType: SNO` from examples
- **role-consistency** — CAPI-M3 NMStateConfig/BareMetalHost labels and selectors use `role: control` (was `controller`)
- **example-consolidation** — 19 example files → 3 starter files (start-sno, start-compact, start-full) + 9 platform plugin examples (one per platform)

## v3.18.19 (2026-04-18)

- **operator-channel-cleanup** — LVM channel now derives from `cluster.version` (`stable-4.Y`) matching ODF; ACM default updated to `release-2.15`; all operators now accept `version` field to pin `startingCSV`
- **audit-cleanup-secondary-nad** — Fix Jinja2 syntax error in `secondary-network-setup` ipam block; align type check `bridge`→`linux-bridge`; remove dead macvlan branch; standardize miimon to 150ms; rename `plugins.kubevirt.network.name`→`nad`; trim secondary network type enum

## v3.18.18 (2026-04-17)

- **mtu-propagation** — `network.primary.mtu` now flows through to linux-bridge NAD CNI config in `kubevirt-cluster`; secondary-network-setup NNCP bridge interface and NAD CNI config also carry MTU when set

## v3.18.17 (2026-04-17)

- **linux-bridge-normalize** — `linuxBridge` is now a plain string (bridge device name); removes lab-specific `bridge-1410` default; NAD named `vmnet-{vlanId}` parallel to `cudn-vmdata-{vlanId}`; `macspoofchk: false` on linux-bridge NADs for nested VM traffic

## v3.18.16 (2026-04-08)
- **disconnected-osImageHost** — `cluster.disconnected` is now an object (presence = disconnected mode) with an optional `osImageHost` field (scheme+host only); the template derives the full RHCOS ISO and rootFS paths from `cluster.version` using the same directory structure as mirror.openshift.com, eliminating the need for explicit URL inputs. Replaces the former `cluster.disconnected: true` boolean and `cluster.osImages` field.

## v3.18.15 (2026-04-08)
- **disconnected-os-images-fix** — Fix two disconnected hang bugs: (1) `registries.conf` no longer emits `prefix = ""` for empty mirror prefixes (catch-all that broke mirror routing → MCS couldn't start); (2) `os-images-sync` job is skipped in disconnected mode when no `cluster.osImages` URLs are provided (mirror.openshift.com unreachable); custom `cluster.osImages.isoUrl`/`rootFSUrl` fields added to schema for disconnected OS image registration

## v3.18.14 (2026-04-08)
- **kubevirt-install-config-platform** — `install-config.yaml.tpl` now treats kubevirt SNO as installer `platform: none` while preserving `platform: baremetal` for multi-node kubevirt clusters, with focused render coverage for both cases and simplified template logic

## v3.18.13 (2026-04-08)
- **ztp-discovery-infraenv-override** — ACM ZTP now renders the generated disconnected discovery ignition override on `InfraEnv.spec.ignitionConfigOverride`, while leaving explicit per-host ignition overrides on `BareMetalHost`; this matches the live discovery boot path and fixes the pre-registration `policy.json` gap that kept hosts from becoming `Agent` inventory

## v3.18.12 (2026-04-07)
- **deterministic-mac-generation** — `generate-mac-in-range.sh` now assigns stable deterministic MAC addresses per cluster/host/interface identity instead of shuffling random addresses, and the kubevirt example scripts now describe that behavior accurately

## v3.18.11 (2026-04-07)
- **disconnected-discovery-policy-source-trust** — Generated disconnected discovery ignition overrides now trust both the source pull keys and mirror endpoints from `cluster.mirrors`, so ACM discovery hosts can pull mirrored content before mirror remap fully helps

## v3.18.10 (2026-04-07)
- **ship-it-enforcement** — Make the repo-local `skills/ship-it/SKILL.md` mandatory whenever the user says `ship it`, so release behavior follows the repo workflow even if the skill is not surfaced by the session

## v3.18.9 (2026-04-07)
- **github-auth-merge** — Merge the long-lived `auth.github` branch into `main` while preserving branch history and the tested GitHub auth integration work
- **post-merge-cleanup** — Fix post-merge regressions in standalone operator rendering, ACM prerelease manifests, and ACM ZTP BMC detection
- **editor-compatibility** — Restore editor template processor compatibility for the current test suite and confirm the main template and processor suites pass after the merge

## v3.18.8 (2026-04-06)
- **example-secrets-placeholders** — Add `data/secrets/` with obviously fake placeholder files so bundled examples render safely without local secret material and without tripping secret scanners with realistic-looking values
- **example-path-cleanup** — Repoint bundled example clusterfiles to use the shared placeholder files under `data/secrets/` instead of scattered host-specific paths
- **example-docs-purpose** — Consolidate the README example guidance around a smaller set of meaningful starting points and document the purpose of the examples and placeholder secret files

## v3.18.7 (2026-04-06)
- **process-image-cli** — Fix the `quay.io/dds/process` container contract so it can run the latest repo templates and plugins reliably: package `lib/`, use a direct Python entrypoint, and default to a mounted working directory
- **process-wrapper** — Make `process.sh` independent of the published image entrypoint by overriding the container entrypoint explicitly, mounting repo/current working tree paths safely, and mapping file arguments into the container
- **process-docs** — Update CLI container documentation to show direct mounted-worktree usage and the `process.sh` wrapper path

## v3.18.6 (2026-04-06)
- **install-config-raw-multidoc** — Preserve native multi-document YAML for `install-config.yaml.tpl` so `openshift-install` receives a real install-config document instead of an unsupported `kind: List` wrapper; keep apply-oriented templates wrapped for `oc apply -f` compatibility
- **ship-it-skill** — Add a `ship-it` skill that captures the repo's production release discipline: testing, direct verification, prompt logging, changelog/version sync, tags, image pushes, runtime scripts, and health checks

## v3.16.0 (2026-02-25)
- **universal-url-routing** — Every section, editor tab, template, and sample in the URL hash; back/forward restores full state
- **graceful-render** — Templates always render with sensible defaults for missing data; LoggingUndefined substitutes domain, subnet, macAddress, etc.
- **render-warnings-validation** — Render warnings (substituted defaults, platform mismatches) shown in Validation tab with badge; CLI prints to stderr
- **template-default-rendered** — Selecting a template defaults to rendered output view

## v3.15.0 (2026-02-25)
- **deep-link-templates** — Deep link to template source (`#templates/?template=...`) or rendered output (`#rendered/?template=...&sample=...`); auto-loads sample, selects template, switches to correct tab

## v3.14.0 (2026-02-25)
- **url-routing** — Hash-based URL routing: every section and collateral sub-tab is bookmarkable/shareable; back/forward buttons work between sections

## v3.13.0 (2026-02-25)
- **about-collateral** — Add About sidebar section with tabbed marketing collateral (overview, business value, comparison, presentation, demo script); markdown rendered via marked.js with inline SVG diagrams

## v3.12.1 (2026-02-25)
- **template-formatting-audit** — Fix Jinja2 formatting across 11 templates: move all control blocks inline per style rules; fix missing JSON comma in secondary-network-setup
- **concise-defaults** — Replace verbose `is defined` guards with `| default()` shorthand across 9 templates
- **mirror-registries-include-fix** — Fix mirror-registries include whitespace: remove self-guard, callers add `{% if %}` inline

## v3.12.0 (2026-02-25)
- **acm-disconnected-digest** — New `acm-disconnected.yaml.tpl` template for ACM hub-side disconnected setup: digest-based ClusterImageSet (`@sha256:...`) + mirror-registries ConfigMap; add `cluster.releaseDigest` schema field; make existing `acm-clusterimageset.yaml.tpl` digest-aware; DRY-extract mirror-registries ConfigMap to shared include; 10 new tests

## v3.11.0 (2026-02-24)
- **fix-cert-manager-secretstore** — Fix cert-manager secretStore default from `aws-secretsmanager` to `vault`
- **x-group-form-sections** — Schema-driven collapsible form groups using `x-group` and `x-group-collapsed` annotations; Cluster groups: Basics, Security, Disconnected, Advanced; Network groups: Basics, Cluster Networks, Proxy & Trust, Advanced; collapsed groups reduce form clutter while keeping all fields accessible

## v3.10.2 (2026-02-24)
- **editor-blur-refresh** — Re-render form when YAML editor loses focus so manual YAML edits are reflected in form fields immediately

## v3.10.1 (2026-02-24)
- **fix-editor-array-remove** — Fix array remove using stale closure paths: re-render all items from state after add/remove, eliminating stale closures

## v3.10.0 (2026-02-24)
- **add-placement-resource** — Add Placement resource to ACM ZTP and CAPI templates so operator PlacementBindings can target managed clusters
- **odf-node-labels** — Add automatic ODF storage node labeling via ACM Policy; smart node selection labels workers when present, all nodes for compact clusters; 4-stage pipeline with dual dependencies on StorageCluster
- **operator-lso** — Local Storage Operator plugin: Namespace, OperatorGroup, Subscription, LocalVolumeSet CR with block-mode discovery on ODF-labeled nodes; ACM 3-stage Policy (subscription → CRD gate → CR) + PlacementBinding; default StorageClass `local-block` for ODF consumption; 5 new tests
- **fix-editor-array-add** — Fix form array "+ Add" button using stale closure length: new items overwrote index 0 instead of appending; also fix form→editor sync race condition (50ms guard vs 300ms debounce)
- **fix-editor-array-remove** — Fix array remove using stale closure paths: after removing an item, remaining items' input and remove handlers still referenced old indices. Now re-renders all array items from state after add/remove, eliminating stale closures entirely

## v3.9.0 (2026-02-23)
- **dynamic-plugin-integration** — Replace 4x6 hardcoded operator if-blocks with convention-based for-loops in templates. Plugins are now self-sufficient and discovered by convention. Config templates self-guard internally
- **cert-manager-crd-gate** — Add CRD readiness gate (`certmanagers.operator.openshift.io`) to cert-manager ACM Policy, matching the 3-stage pattern used by ArgoCD, LVM, and ODF
- **lib-render-dry** — Extract shared Python module `lib/render.py` from duplicated code in `process.py` and `template_processor.py`: IndentDumper, base64encode, set_by_path, validate_data_for_template, YAMLLINT_CONFIG
- **test-consolidation** — Consolidate 6 duplicated operator_data() test methods into shared helpers; strengthen ACM policy assertions (remediationAction, policy-templates count, PlacementBinding structure, CRD names)
- **load-file-warning** — Add stderr warning in load_file() when secret files are missing or unreadable

## v3.8.2 (2026-02-21)
- **odf-auto-channel** — Derive ODF operator channel from `cluster.version` (`stable-4.X`) instead of hardcoded `stable-4.18`. Fixes ODF installation failure on OCP 4.21+ where the `stable-4.18` channel doesn't exist

## v3.8.1 (2026-02-21)
- **crd-readiness-gate** — Fix ACM Policy readiness gate: replace generic CSV status check with CRD existence check (`CustomResourceDefinition`) for ODF (`storageclusters.ocs.openshift.io`), LVM (`lvmclusters.lvm.topolvm.io`), and ArgoCD (`argocds.argoproj.io`). The CSV check matched the wrong CSV in multi-operator installs like ODF

## v3.8.0 (2026-02-18)
- **operator-policy-ordering** — Fix ACM Policy race condition: add `extraDependencies` with CSV readiness gate to ODF, LVM, and ArgoCD policy templates so operator CRs are only created after the operator is fully installed (2026-02-18)

## v3.3.0 (2026-02-16)
- **eso-vault-config** — Add Vault ClusterSecretStore config template to ESO plugin with Kubernetes auth defaults; change cert-manager secretStore default to vault; enable ESO on all example clusterfiles

## v3.2.1 (2026-02-16)
- **kubevirt-cpu-request** — Increase KubeVirt VM CPU request from 2 to 4 to reduce resource contention

## v3.2.0 (2026-02-16)
- **cert-manager-selfcheck** — Add CertManager CR with recursive nameserver defaults (8.8.8.8:53, 1.1.1.1:53) for DNS-01 self-check; conditional cnameStrategy flag on ClusterIssuer solver

## v3.1.0 (2026-02-15)
- **siteconfig-kubevirt-platform** — Allow kubevirt platform in siteconfig template, mapping to BareMetal platformType in ClusterInstance CR

## v3.0.0 (2026-02-15)
- **kubernetes-list-wrapper** — Wrap multi-document YAML output in `kind: List` resource for `kubectl apply -f` compatibility. Single-doc templates unchanged

## v2.15.0 (2026-02-15)
- **platform-plugin-move** — Move platform plugins from `templates/plugins/platforms/` to `plugins/platforms/`, co-locating all plugins under `plugins/`. Update template include paths and README

## v2.14.0 (2026-02-15)
- **extract-plugin-schemas** — Extract 6 operator schemas (ArgoCD, LVM, ODF, ACM, cert-manager, external-secrets) from monolithic clusterfile.schema.json to `plugins/operators/<name>/schema.json`. Auto-discover and merge at load time in process.py, editor API, and standalone build. Shrinks main schema ~600 lines. 4 new tests
- **cert-manager-letsencrypt** — Template-driven LetsEncrypt configuration: ExternalSecret (Route53 credentials via external-secrets), ClusterIssuer (ACME DNS-01 with Route53), Certificate (auto-derived dnsNames from cluster.name + network.domain). Eliminates DNS zone-swap hack via permanent BIND delegation. Schema addition for letsencrypt config under cert-manager operator. 5 new tests

## v2.13.0 (2026-02-14)
- **ocp-on-ocp-operators** — Enhance OCP-on-OCP demo with template-driven operators: add operators sections to ocp-acm (LVM, ACM, cert-manager, ArgoCD, external-secrets), ocp-cluster2/3 (ODF); fix ocp-acm network from flat bridge to CUDN; transition manage-cluster.sh install phases from step scripts to template rendering; add operator manifest rendering to sno.setup.sh; fix kubevirt-sno.clusterfile broken flat network keys
- **kubevirt-ssd-udev** — SSD udev MachineConfig for KubeVirt VMs: forces virtual block devices to report as SSDs (rotational=0) so ODF/Ceph classifies them correctly. Included at install time via ZTP extraclustermanifests, CAPI ManifestWork, and ABI/IPI extra manifests — only when platform is kubevirt. 6 new tests

## v2.12.0 (2026-02-14)
- **siteconfig-schema** — Add ClusterInstance-inspired fields to clusterfile schema: cluster.clusterType, cluster.cpuPartitioningMode, cluster.diskEncryption (Tang), cluster.installConfigOverrides, cluster.holdInstallation, External platform; per-host bootMode, nodeLabels, automatedCleaningMode, ironicInspect, installerArgs, ignitionConfigOverride
- **siteconfig-templates** — Bidirectional conversion templates: clusterfile2siteconfig.yaml.tpl (generates ClusterInstance CR + Namespace + Secrets) and siteconfig2clusterfile.yaml.tpl (reverse mapping). Tang disk encryption MachineConfig include
- **siteconfig-template-updates** — ACM ZTP/CAPI templates consume new per-host fields (bootMode, configurable automatedCleaningMode/ironicInspect, installerArgs, ignitionConfigOverride annotations); holdInstallation in AgentClusterInstall; cpuPartitioningMode in install-config.yaml.tpl
- **siteconfig-tests** — 23 new tests: cpuPartitioningMode in install-config, per-host bootMode/automatedCleaningMode/ironicInspect/installerArgs/ignitionConfigOverride in ZTP BareMetalHost, holdInstallation in ACI, Tang disk encryption, ClusterInstance template (SNO, HA, fields, secrets)
- **siteconfig-examples** — SNO clusterfile with clusterType/cpuPartitioningMode; baremetal with bootMode/nodeLabels; new siteconfig-sno.clusterfile example; README + ACM README updated with ClusterInstance use case
- **siteconfig-template-fixes** — Fix regex_replace crash in siteconfig2clusterfile (use Jinja2 string ops); DRY BMC URL into shared bmc-url.yaml.tpl include; add External platform include; fix missing default on bmc.version; remove default-value noise from examples

## v2.11.0 (2026-02-14)
- **plugin-colocation** — Restructure operator plugins: move schema + templates from scattered `schema/plugins/` and `templates/plugins/` to co-located `plugins/operators/<name>/` directory. Each operator is self-contained with schema.json, manifests.yaml.tpl, and policy.yaml.tpl
- **operator-lvm** — LVM Storage (LVMS) operator plugin: Namespace, OperatorGroup, Subscription, LVMCluster CR with configurable deviceClasses, thinPoolConfig, deviceSelector. ACM Policy template for managed clusters
- **operator-odf** — OpenShift Data Foundation operator plugin: Subscription, StorageCluster CR with configurable storageDeviceSets, ConsolePlugin. ACM Policy template for managed clusters
- **operator-acm** — Advanced Cluster Management hub operator plugin: Namespace, OperatorGroup, Subscription, MultiClusterHub, AgentServiceConfig (storage sizes), Provisioning CR
- **operator-cert-manager** — cert-manager operator plugin: Namespace, OperatorGroup, Subscription. ACM Policy template for managed clusters
- **operator-external-secrets** — external-secrets operator plugin: Subscription (global scope, openshift-operators). ACM Policy template for managed clusters
- **operator-integration** — All 6 operators integrated into operators.yaml.tpl (standalone), install-config.yaml.tpl (ABI/IPI extra manifests), acm-ztp.yaml.tpl and acm-capi-m3.yaml.tpl (ACM Policy). All operators support optional channel, source, and approval override
- **operator-ui** — Operators sub-menu in plugins UI section with collapsible enable/disable fieldsets per operator
- **operator-tests** — 23 new tests covering all operators: defaults, custom channels/sources, disabled state, device classes (LVM), storage clusters (ODF), ACM hub config, ACM ZTP policies, multi-operator rendering
- **example-clusterfiles** — ACM hub SNO example with LVM + ACM + cert-manager + ArgoCD (bootstrap) + external-secrets; updated SNO example with LVM + ArgoCD

## v2.10.0 (2026-02-14)
- **operator-schema** — Operator plugin schema (`schema/plugins/operators/argocd.schema.json`) with ArgoCD properties and smart defaults; referenced from main clusterfile schema
- **operator-argocd-templates** — ArgoCD DRY includes: manifests.yaml.tpl (Namespace, OperatorGroup, Subscription, ArgoCD CR) and policy.yaml.tpl (ACM Policy + ConfigurationPolicy + PlacementBinding)
- **operator-integration** — ArgoCD operator integrated into install-config.yaml.tpl (extra manifests), acm-ztp.yaml.tpl and acm-capi-m3.yaml.tpl (ACM Policy); standalone operators.yaml.tpl for direct apply
- **operator-tests** — 11 tests for ArgoCD operator plugin covering defaults, customization, RBAC, disabled state, install-config, ACM ZTP policy, and bootstrap
- **plugin-restructure** — Move operators and platforms into `templates/plugins/` and `schema/plugins/` for clear isolation; each plugin self-contained in its own directory, ready for future extraction into separate repos
- **argocd-bootstrap** — App-of-apps pattern: ArgoCD Application CR that bootstraps further operators from a git repo; works in standalone manifests (ABI) and ACM Policy (ZTP/CAPI); supports autoSync with self-heal and pruning

## v2.9.3 (2026-02-14)
- **template-consolidation** — Extract shared includes for POC banner ManifestWork and os-images-sync (SA + CRB + Job); DRY insecure registries Image config in acm-capi-m3; net -69 lines of duplication
- **kubevirt-install-config** — Add kubevirt platform includes for install-config.yaml.tpl; maps to baremetal (VIPs) or none (SNO) for UPI/agent-based installs
- **multi-doc-yaml** — Fix multi-document YAML handling in CLI and web app; wrap multiple documents as a YAML list for single-document output
- **graceful-errors** — Pre-render validation for platform compatibility and required fields; transform raw Jinja2 UndefinedError into actionable messages with field hints for both CLI and UI
- **design-principles** — Add DRY, small functions, smart defaults design principles to CLAUDE.md

## v2.9.2 (2026-02-13)
- **insecure-mirrors** — Add per-mirror `insecure` flag for registries with self-signed certs or plain HTTP; sets `insecure = true` in registries.conf and generates `image.config.openshift.io/cluster` with `insecureRegistries` list via ACM ZTP extraclustermanifests, ACM CAPI ManifestWork, and ABI/IPI manifests
- **cluster-overview-update** — Add TPM, disconnected, insecure mirrors, catalog sources, secondary networks, and files required sections to cluster overview preview

## v2.9.1 (2026-02-13)
- **disconnected-operatorhub** — Add `cluster.disconnected` flag and `cluster.catalogSources` for air-gapped clusters; disables default OperatorHub sources and configures custom CatalogSources via ACM ZTP extraclustermanifests, ACM CAPI ManifestWork, and ABI/IPI manifests
- **fix-tpm-test-keys** — Fix pre-existing test assertions for v2.9.0 `.yaml` extension on ConfigMap keys

## v2.9.0 (2026-02-13)
- **manifest-yaml-ext** — Add `.yaml` extension to extraclustermanifests ConfigMap data keys; assisted-service requires `.json`, `.yaml`, or `.yml` extensions on manifest filenames

## v2.8.9 (2026-02-13)
- **ztp-troubleshoot** — ZTP troubleshooting template with 15 diagnostic checks for installation progress, resource validation, and assisted-service health

## v2.8.8 (2026-02-13)
- **fix-release-script** — Fix `rg` dependency (use `grep`) and push only new release tag instead of all tags

## v2.8.7 (2026-02-13)
- **mirrors-fix** — For mirrors, always use mirror in imageContentSource template
- **release-script-fix** — Fix `rg` dependency (use `grep`), push only new tag instead of all tags

## v2.8.6 (2026-02-13)
- **fix-manifestsconfigmapref** — Move `manifestsConfigMapRef` from ClusterDeployment to AgentClusterInstall; `provisioning` and `clusterInstallRef` are mutually exclusive in the Hive CRD

## v2.8.5 (2026-02-13)
- **release-script** — Updated `clusterfile-editor.sh release` to match full "ship it" process: sync all 5 version locations, commit, tag, push, build, deploy, restart, verify healthz

## v2.8.4 (2026-02-13)
- **tpm-disk-encryption** — Updated MachineConfig with AES-CBC-ESSIV cipher, volume wipe, and XFS root filesystem
- **ztp-manifestsconfigmapref** — Fix ACM ZTP `manifestsConfigMapRef` moved under `provisioning` key

## v2.8.3 (2026-02-12)

- **tpm-install-only** — Remove ManifestWork for TPM; LUKS disk encryption is install-time only via `extraclustermanifests` (post-install wipes root disks)
- **poc-banner** — Red "Proof of Concept" ConsoleNotification banner on all managed clusters; ManifestWork in ACM ZTP/CAPI, standalone `poc-banner.yaml.tpl` for ABI/IPI

## v2.8.2 (2026-02-12)

- **tpm-install-only** — Remove ManifestWork for TPM; LUKS disk encryption is install-time only via `extraclustermanifests`. Applying LUKS MachineConfig post-install wipes root disks and reboots all nodes — too destructive for auto-delivery. TPM remains correctly handled at install time for both ZTP and CAPI flows.
- **poc-banner** — Add POC banner to all install methods: ManifestWork in ACM ZTP and CAPI templates delivers `ConsoleNotification` to managed clusters; standalone `poc-banner.yaml.tpl` for ABI/IPI (place in `manifests/` dir or `oc apply`)

## v2.8.1 (2026-02-12)

- **smart-storage** — Topology-aware storage class and data disk assignment: control OS→performance (etcd), worker OS→default, data→performance (ODF); compact cluster (≤5 hosts) puts data disks on control, standard cluster (≥3 workers) puts data disks on workers

## v2.8.0 (2026-02-12)

- **cluster-tpm** — Promote TPM from `plugins.kubevirt.tpm` to `cluster.tpm` as platform-agnostic master switch; auto-propagates to kubevirt VM hardware and ACM ZTP disk encryption manifests for any platform
- **kubevirt-tpm-tests** — Add test suite for KubeVirt TPM feature: enabled, disabled, omitted, and VM structure validation
- **acm-ztp-tpm-tests** — Add ACM ZTP template tests for TPM manifest generation across baremetal and kubevirt platforms

## v2.7.1 (2026-02-12)

- **cache-bust** — Dynamic cache-busting: backend injects current version into static asset URLs at serve time (`e86ffbe`)

## v2.7.0 (2026-02-12)

### Features

- **kubevirt-tpm** — Add TPM 2.0 support to KubeVirt plugin for LUKS disk encryption (`4c03fc0`)
  - Persistent TPM device, SMM features, and UEFI firmware on VMs
  - Inline MachineConfig for Clevis TPM2-based LUKS encryption in acm-ztp extraclustermanifests
- **imageDigestSources** — Replace deprecated `imageContentSources` with `imageDigestSources` in install-config (`2f0d0de`)
- **kubevirt-vlan** — Add VLAN support and restructure kubevirt VM networking (`d49c104`)
- **osimages-sync** — Replace CronJob polling with event-driven Jobs for osImages sync (`c2ba769`)
- **rhcos-osimages** — Add RHCOS osImages to ASC and per-cluster osImages ConfigMaps to ZTP/CAPI (`8893d16`)
- **kubevirt-cudn** — Use ClusterUserDefinedNetwork CRD for proper UDN Localnet support (`75de7a2`)

### Fixes

- **rhcos-iso-fix** — Fix RHCOS ISO URL: `rhcos-live.iso` -> `rhcos-live-iso.iso` (`de0e560`)
- **sno-fix** — Fix baremetal platform include to handle SNO without VIPs (`184de11`)

## v2.6.6 (2026-02-09)

- Fix UDN validation: disable IPAM for externally-managed VM IPs
- UDN networking for kubevirt
- Replace linux-bridge NAD with OVN UserDefinedNetwork in kubevirt template
- Fix arch normalization in ACM templates for RFC 1123 compliance
