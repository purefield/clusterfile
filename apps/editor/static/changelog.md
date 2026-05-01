# Clusterfile Editor Changelog

## 3.24.4
- **CAPI API version bumps** — Cluster `v1beta2`, OpenshiftAssistedControlPlane `v1alpha3`, OpenshiftAssistedConfigTemplate `v1alpha2`, MachineDeployment `v1beta2`, worker infrastructureRef `v1beta1`. Eliminates deprecation warnings on MCE v2.11.0+. BMH binder policy Machine lookup also bumped to `v1beta2`.

## 3.24.3
- **ACM assisted-service AUTH_TYPE fix** — default changed from `none` to `local`. The capoa-bootstrap-controller requires an `api_key` JWT in the InfraEnv download URL to fetch ignition config; `AUTH_TYPE=none` omits the token and blocks the entire CAPI bootstrap chain. The `local` auth mode uses the auto-generated `assisted-servicelocal-auth` EC key pair — no extra setup.

## 3.24.2
- **CAPI BMH binding via ACM Policy** — replaces v3.24.1's static `infraenvs.agent-install.openshift.io: <cluster.name>` label (which doesn't match anything: the openshift-assisted CAPI bootstrap controller creates per-machine InfraEnvs named `<cluster>-<random>`) with a continuously-reconciled ConfigurationPolicy. The policy walks Machines + BMHs in the cluster namespace and labels each claimed BMH with the InfraEnv that the Machine's bootstrap config owns, so the bmac controller patches the discovery ISO URL onto `BMH.spec.image.url`. Unblocks CAPI provisioning on hubs that don't have the (separate) cluster-api-provider-openshift-assisted infrastructure controller installed. ZTP unchanged.

## 3.24.1
- **CAPI provisioning fix**: BareMetalHosts in the CAPI/M3 bundle now carry the `infraenvs.agent-install.openshift.io: <cluster.name>` label plus `bmac.agent-install.openshift.io/hostname` and `…/role` annotations — the binding the bmac controller needs to patch the discovery ISO URL onto `BMH.spec.image` so Ironic can boot it via virtual media. NMStateConfigs get the same label so the InfraEnv selects them for static-network configuration. Mirrors the ZTP pattern that has always worked. ZTP behavior unchanged.

## 3.24.0
- **Download Agent ISO** — the editor now produces a deploy-ready `<cluster>-agent-<arch>.iso` for any OCP version, fully self-contained. `openshift-install` + `oc` are fetched on first request per version and persist in a host-mounted `/cache` so subsequent builds finish in seconds. New button in the Rendered pane appears when `cluster.installMethod=agent`; greyed out with a setup dialog when `/cache` isn't mounted, the pull secret is unresolved, or the bundle has unresolved `<file:…>` placeholders. Disconnected installs work via the existing `cluster.mirrors` / `cluster.disconnected` flow.
- **Upload secrets in the browser** — every file-path field in the form has an **Upload** button. Files are read with FileReader and held in browser memory only (no `localStorage` / `sessionStorage` / `IndexedDB`); reload wipes them. The map travels with every render request and overrides anything under `/content`. Closes the loop for users who don't want to mount a secrets directory.
- **Per-restart unlock key gating `/content` reads** — when the host directory is mounted, the editor prints a one-time long random key on startup. The UI prompts for it the first time you flip **File: content** or click **Download Agent ISO**. Stored in browser memory only; regenerated on every restart so a leaked key never outlives the running app.
- **Click a disabled rocker → setup help** — clicking a greyed-out **Display** or **Output** rocker now opens a dialog with concrete steps to enable file-content rendering (mount `/content`, upload files, paste the unlock key).
- **SNO + ACM ZTP / CAPI** — both bundles now accept `cluster.platform: none` for SNO topology without spurious "platform 'none' is not supported" warnings.
- **CAPI controlPlaneEndpoint fixed** to `api.<cluster>.<domain>` (was `<cluster>.<domain>` — wrong OCP DNS convention).
- **Container base**: ubi9-minimal (was python:3.12-slim) so `nmstatectl` is available — required by the agent ISO builder for static-network validation.

## 3.23.1
- **Bundle vs single-template flow fixed**: the template selector now groups templates by bundle (Agent / ACM Hub / ACM ZTP / CAPI / Utility / Single templates) with a `▸ View entire bundle` pseudo-option at the top of each group. Picking a single template exits bundle mode and clears the bundle tabs row; picking the View entire option enters bundle mode. No more mixed state where the dropdown shows one thing and the bundle tabs show another.
- **Switching between Template and Rendered tabs no longer reverts your selection** — the rendered pane remembers which bundle tab was active and which mode (bundle vs single) you were in.
- **Independent Display and Output rockers** in the rendered pane header. Display drives what's on screen; Output drives what Copy/Download produce. Keep the screen safe (path placeholders) while exporting full content, or vice versa. Both default to `path`; Output greys out when `/content` isn't mounted.
- **Copy/Download** re-fetch from the API when Output mode differs from Display, so the export always matches the toggle.

## 3.23.0
- **Mount your content directory and render real files**: container now honors a `/content` mount that resolves *any* `load_file()` reference — not just secrets. Lay out subdirs the way your clusterfile references them (`secrets/`, `manifests/`, `certs/`, …) and run with `-v /path/to/your/content:/content:ro,Z`. With no mount, the editor keeps rendering `<file:…>` placeholders exactly like before. Path-traversal escapes are blocked.
- **"File: path | content" rocker** in the Rendered pane next to Copy/Download. Both options are always visible — you can see the alternative without clicking. Greyed out with a tooltip when `/content` isn't mounted.
- **Start modal no longer shows phantom edits**: picking a topology + install method now re-baselines the document, so the Changes count and modified-indicator stay at zero on a fresh start.
- **Preview crash fixed**: cluster-overview no longer errors with "list object has no element 1" when subnet fields still hold `<subnet-cidr>` placeholders from an unedited starter.

## 3.22.22
- **One Start modal, one CTA**: merged the welcome tour and new-document picker into a single Start modal. Captures topology (SNO/Compact/Full HA/Blank) and install method (Agent/ACM ZTP/CAPI) on one screen with inline explanations. Welcome sidebar item from 3.22.21 removed — the header **New** button is the single entry point.
- **Cluster intent in the file**: clusterfiles now have `cluster.installMethod` and `cluster.clusterRole` so the editor knows which install bundle to render and which cluster role you're configuring. Set automatically when you pick from the Start modal.
- **Tabbed install bundle in Rendered**: when an install method is set, the Rendered tab gains a thin row of file tabs — one per file in the install bundle (e.g. Agent shows install-config / agent-config / mirror-registry / creds / operators / pre-check). Click a tab to swap files in the same editor. A small footer reminds you that `<file:…>` placeholders are expanded by the CLI at render time.
- **Smarter form hint**: replaces the static "ready to render" banner with a single state-aware next-step hint — amber when placeholders remain, red when validation errors remain, green when ready. Always one CTA, never two.
- **Template metadata**: 15 templates declare which bundle and cluster role they belong to. The new `/api/render-bundle` endpoint uses this to render the right multi-file set without hardcoding.

## 3.22.21
- **Welcome sidebar item**: moved the welcome-modal trigger from the header to a **Welcome** entry in the sidebar (right next to Guide). Click it to re-read the onboarding steps or pick a topology to start over.

## 3.22.20
- **Tour button in header**: opens the welcome modal at any time. Read the onboarding steps again, or click a topology button (SNO / Compact / Full HA / Blank) to swap the current document for that starter — i.e. "start over" in one click.

## 3.22.19
- **Smart starter on first visit**: opens with a pre-filled SNO starter (placeholder values to replace) instead of an empty form — no more "blank page, where do I start?"
- **Task-oriented welcome modal**: rewrites the 4-step intro to walk through what you're looking at → how to fill it → where to get help → where to render. Includes inline topology switcher (SNO / Compact / Full HA / Blank).
- **"Ready to render" banner**: appears at the top of any form section once the Todo and Validation badges are both 0, with a one-click button to jump to Templates.

## 3.22.18
- **Better field help**: 24 platform-defaults fields now explain *why* the default is what it is and *when* to change it — covers AWS/Azure/GCP/IBM instance types and disk types, host boot mode (UEFI vs UEFISecureBoot vs legacy), cluster architecture (x86_64 vs aarch64 vs ppc64le vs s390x), and operator subscription approval mode (Automatic vs Manual)
- **Note**: Doc-link anchors still don't resolve at the target page — that fix is queued in the html-single URL migration

## 3.22.17
- **Schema docs cleanup**: fixed 51 broken documentation links (typo `container_platform/` → `container-platform/`) that were silently bouncing users to the docs.redhat.com home page instead of the relevant doc
- **OCP doc version pin**: all 90 OpenShift documentation links now point to OCP 4.21 (previously a mix of 4.16/4.20/4.21/`latest`); includes plugin schemas for cert-manager, lvm, lso, and github auth
- **Terminology**: corePassword help text now says "control-plane + worker" instead of "master + worker"
- **Known issue**: docs.openshift.com 4.21 redirects currently drop URL path and anchor — users land on the docs.redhat.com 4.21 root page. No regression vs prior state (4.20 also broken at the anchor level). Next ship will migrate to `docs.redhat.com html-single` URLs so deep links resolve again.

## 3.22.16
- **Ironic split**: `plugins.baremetal.ironic.operator` configures the Metal3 hub operator (Provisioning CR); `plugins.baremetal.ironic.host` sets BareMetalHost defaults on managed clusters

## 3.22.15
- **Baremetal plugin form**: Plugins → Platform now shows the full Ironic configuration form for baremetal clusters instead of "no configuration required"
- **Node Labels editor**: Host node labels now render as a key-value editor with add/remove rows

## 3.22.14
- **Ironic API terms**: `hardwareInspection` renamed to `inspection` (boolean); `diskCleanup` renamed to `automatedCleaningMode` (enum: `metadata`/`disabled`) — field names now match the Metal3/Ironic API directly

## 3.22.13
- **Ironic flags moved to plugin**: `hardwareInspection` and `diskCleanup` are no longer per-host fields — they now live under `plugins.baremetal.ironic` as cluster-level defaults
- **All Ironic settings in one place**: `plugins.baremetal.ironic` now holds all five flags: `hardwareInspection`, `diskCleanup`, `provisioningNetwork`, `watchAllNamespaces`, `disableVirtualMediaTLS` — previously three were hardcoded in templates
- **New schema**: `plugins.baremetal.ironic` is fully described in the editor with checkboxes and doc links

## 3.22.12
- **automatedCleaningMode**: `metadata` is now the consistent default across all templates — Ironic wipes partition tables before provisioning by default; set `disabled` to skip cleaning and preserve disk contents

## 3.22.11
- **ironicInspect default inverted**: inspection now runs by default — Metal3 inspects hardware unless you explicitly set `ironicInspect: disabled`
- **Guide**: VMware admin translation table at the top — maps ESXi/vCenter/OVA/power-on concepts to bare-metal equivalents so admins can orient quickly
- **Starter cards**: descriptions rewritten in hardware terms (server counts, HA context) instead of k8s role names
- **Schema**: BMC fields now mention iDRAC (Dell), iLO (HP/HPE), and IPMI in their descriptions

## 3.22.10
- **ironicInspect fix**: `enabled` now omits the `inspect.metal3.io` annotation entirely so Metal3 runs inspection; `disabled` (default) still emits it explicitly

## 3.22.9
- **rootDeviceHints fix**: plain device path (`os: /dev/sda`) now renders as `deviceName` mapping — OpenShift was silently ignoring the scalar form; updated doc link to OCP 4.21 agent-based installer

## 3.22.8
- **DRY BMC path**: extracted `bmc-redfish-path.tpl` as single source for vendor→Redfish system path; shared by `bmc-url` and `pre-check/bmc` templates

## 3.22.7
- **Guide rework**: working directory is `my-clusters/`, repo is a sibling at `../clusterfile/`; no `~/` assumption — works from any directory, not just home

## 3.22.6
- **Remove ksushy**: dropped `ksushy` BMC vendor from schema enum and bmc-url template

## 3.22.5
- **HP iLO BMC fix**: `hp`/`hpe` now uses `redfish-virtualmedia://` (drops invalid `ilo5-virtualmedia` and removes `+https` suffix that caused insert/eject loop)

## 3.22.4
- **HP iLO fix**: `hp`/`hpe` vendor now uses `ilo5-virtualmedia` driver instead of `redfish-virtualmedia+https` — fixes continuous insert/eject media loop during ACM-driven boot; also fixes `hpe` falling through to bare address

## 3.22.3
- **Host field order**: universal fields first (role → storage → network → zone → nodeLabels → machine), then Baremetal group (bmc → bootMode → automatedCleaningMode → ironicInspect → installerArgs → ignitionConfigOverride)

## 3.22.2
- **host.zone**: optional availability zone field per node — injects `topology.kubernetes.io/zone` node label via BareMetalHost annotation in ACM ZTP and CAPI-M3; used for ODF rack awareness and scheduler topology constraints

## 3.22.1
- **Guide first**: Guide moved to top of sidebar nav for easier onboarding
- **Relative CLI paths**: guide.md examples now use `./` relative paths (run from repo root)
- **New starters**: `data/acm.clusterfile` and `data/workload.clusterfile` added as minimal starters

## 3.22.0
- **Guide section**: step-by-step onboarding page with CLI examples, directory layout, and action buttons linking to Todo/Templates/Validation
- **Persistent template**: selected template is remembered across page reloads (localStorage)
- **Schema quality**: descriptions and `x-doc-url` doc links added across host, network, and operator plugin fields
- **corePassword group**: moved to Basics group alongside sshKeys
- **cluster.location**: added to schema and all starter files
- **network.ntpservers**: promoted to Basics group with improved description
- **nmstate crash fix**: `split('/')[-1]|int(24)` guards against placeholder subnet in start-compact/start-sno
- **acm-capi-m3 cleanup**: removed hardcoded ignition override and dead image vars; Metal3MachineTemplate always uses `customDeploy: install_coreos`


## 3.21.1
- **rootDeviceHints fix**: `storage.os` is now optional. `rootDeviceHints` is only emitted when the field is explicitly set — absent hosts no longer produce `rootDeviceHints: CHANGEME` (invalid object type) in ACM ZTP, CAPI-M3, and nodes-config output.

## 3.21.0
- **Core User Password**: Set `cluster.corePassword` to a file path containing the plaintext password. Rendering `operators.yaml.tpl` automatically emits two MachineConfigs (master + worker) with a SHA-512 crypt `passwordHash` — equivalent to `openssl passwd -6`. No separate template to select.

## 3.20.1
- **Todo Doc Links**: Each Todo item now shows a **Documentation ↗** link when the schema field has an `x-doc-url` — direct link to the relevant OpenShift docs page.

## 3.20.0
- **Todo Section**: Unfilled `<placeholder>` values now appear in a dedicated **Todo** sidebar panel — separate from Validation. Each item shows the field path, schema title, and full description with clickable documentation links.
- **Grouped Panels**: Validation, Todo, and Changes all group items by schema section (cluster, network, hosts, …) with colored count badges — red for errors, blue for todos, yellow for warnings/changes.

## 3.19.5
- **FIPS field order**: `cluster.fips` is now first in the Security group, above TPM and disk encryption.

## 3.19.4
- **FIPS Support**: Set `cluster.fips: true` to enable FIPS 140-2/140-3. Propagates correctly to `install-config.yaml` (direct field), ACM ZTP (`agent-install.openshift.io/install-config-overrides` annotation on `AgentClusterInstall`), and CAPI-M3 (`install-config-override` annotation JSON).

## 3.19.3
- **GitHub Auth Fix**: All four GitHub OAuth templates are now silent when `auth.github` is not configured — no warnings, no empty YAML skeletons, no `oc apply` errors.

## 3.19.2
- **cert-manager Fix (complete)**: Template now uses `dict.get()` instead of Jinja2 attribute access for optional plugins chain — no warnings emitted when `plugins.operators` is absent or unconfigured.

## 3.19.1
- **cert-manager Fix**: Day-2 resources template no longer emits `null` YAML when `plugins.operators` is absent — safe to run against any cluster configuration.
- **New Document Picker**: Clicking **New** now opens a starter picker — choose SNO, Compact (3-node), Full HA, or Blank instead of double-click confirm.
- **Secrets Path**: Example clusterfiles now reference `secrets/` instead of `data/secrets/` for a cleaner project layout.

## 3.19.0
- **nmstate Auto-Install**: nmstate operator (Namespace, OperatorGroup, Subscription, NMState CR) is automatically injected for all `platform: baremetal` clusters.
- **VIP as String or Array**: New `as_list` filter normalizes VIP input — write `api: 10.0.0.2` or `api: [10.0.0.2, fd00::2]`, both work everywhere.
- **Schema Defaults for OCP Constants**: `network.cluster.subnet` (10.128.0.0/14), `network.service.subnet` (172.30.0.0/16), `network.primary.bond/vlan` (false) are now schema defaults — omit them from clusterfiles.
- **Machine Sizing Defaults**: All nodes default to `cpus: 8`, `memory: 32` GiB — only specify when overriding.
- **BREAKING — KubeVirt Platform Model**: `platform: kubevirt` is removed. KubeVirt-hosted clusters use `platform: baremetal` + `plugins.kubevirt`. Migrate existing clusterfiles.
- **SNO from Host Count**: `cluster.clusterType: SNO` is no longer needed — templates derive SNO from a single control host automatically. Only set for `HighlyAvailableArbiter`.
- **Role Consistency**: CAPI-M3 NMStateConfig/BareMetalHost labels and selectors now use `role: control` (was `controller`).
- **Example Consolidation**: 19 overlapping example files replaced by 3 lean starter files (`start-sno`, `start-compact`, `start-full`) and 9 platform plugin examples (one per platform).

## 3.18.19
- **Operator Channel Cleanup**: LVM channel now derives from `cluster.version` (`stable-4.Y`) matching ODF. ACM default updated to `release-2.15`. All operators now accept `version` field to pin `startingCSV`.
- **Secondary Network Fixes**: Jinja2 syntax error in ipam block fixed. Type check aligned (`bridge`→`linux-bridge`). Dead macvlan branch removed. miimon standardized to 150ms.
- **Schema Cleanup**: `plugins.kubevirt.network.name` renamed to `nad`. Secondary network type enum trimmed (removed `ethernet`, `ovs-bridge`).

## 3.18.18
- **MTU Propagation**: `network.primary.mtu` now sets MTU on the linux-bridge NAD CNI config in `kubevirt-cluster`. Secondary network NNCP bridge interfaces and NAD CNI configs also carry MTU when set. All conditional — omitted when mtu is not defined.

## 3.18.17
- **linux-bridge Normalization**: `linuxBridge` is now a plain string (the bridge device name, e.g. `br-bond0-1410`). Removes the lab-specific `bridge-1410` default — bridge must be explicit. NADs are now named `vmnet-{vlanId}` (parallel to `cudn-vmdata-{vlanId}`). `macspoofchk: false` added to linux-bridge NADs for nested VM traffic.

## 3.18.16
- **Disconnected API**: `cluster.disconnected` is now an object — its presence enables air-gapped mode. Set `osImageHost: https://your-mirror` inside it and the template derives full RHCOS ISO and rootFS paths from the cluster version automatically. Replaces `cluster.disconnected: true` and `cluster.osImages`.

## 3.18.15
- **Disconnected Hang Fix**: `registries.conf` no longer emits `prefix = ""` for mirrors with an empty prefix — that empty string matched all registries and broke mirror routing, causing MCS on port 22623 to never start and installation to hang at ~42%
- **Disconnected API Change**: `cluster.disconnected` is now an object (presence = air-gapped mode); add `osImageHost: https://your-mirror` inside it and the template derives full RHCOS ISO and rootFS paths from the version automatically — no explicit URLs needed. Replaces `cluster.disconnected: true` and `cluster.osImages`.

## 3.18.14
- **KubeVirt SNO Installer Platform**: `install-config.yaml.tpl` now renders kubevirt single-node installs as `platform: none`, so installer-facing output matches the expected bootstrap-in-place behavior
- **KubeVirt Multi-Node Stays BareMetal**: Multi-node kubevirt clusters continue to render `platform: baremetal`, and the template logic was reduced to one derived platform value instead of extra helper noise

## 3.18.13
- **InfraEnv Discovery Override**: ACM ZTP now renders the generated disconnected discovery `policy.json` override on `InfraEnv`, which is the path the live discovery environment actually consumes before Agent registration
- **Host Override Precedence Kept**: Explicit per-host `ignitionConfigOverride` values still render on `BareMetalHost`, but the disconnected default now follows the real discovery boot path instead of the BMH fallback path

## 3.18.12
- **Deterministic MAC Assignment**: `generate-mac-in-range.sh` now derives stable MAC addresses from cluster, domain, host, and interface identity instead of re-randomizing every render
- **KubeVirt Script Messaging**: The kubevirt example setup scripts now describe the generated addresses as deterministic so the operator messaging matches the actual behavior

## 3.18.11
- **Disconnected Discovery Source Trust**: Generated ACM discovery ignition overrides now trust both the original source pull keys and the mirrored endpoints, so disconnected hosts can pull assisted-install content before mirror remap fully helps
- **Render Coverage Upgrade**: Added direct decoded-policy tests for both ACM ZTP and ACM CAPI, including source registries, mirror endpoints, and `mirror.prefix` handling

## 3.18.10
- **Repo-Local Ship It Enforcement**: `ship it` now explicitly points to the repo-local `skills/ship-it/SKILL.md`, so release work follows the checked-in workflow even when the session skill list is incomplete
- **Release Discipline Reminder**: Clarified that the repo-local skill is authoritative for release actions and recorded that expectation in the repo audit trail

## 3.18.9
- **GitHub Auth Merge**: Promoted the tested `auth.github` work into `main` while preserving branch history and keeping the editor/plugin discovery changes intact
- **Post-Merge Cleanup**: Fixed standalone operator rendering, ACM prerelease manifest output, and the bogus ACM ZTP `account.bmc` check so real host BMC data is handled correctly
- **Stability Check**: Restored editor processor test compatibility and re-validated the main template and processor suites after the merge

## 3.18.8
- **Safe Example Secrets**: Added `data/secrets/` with obviously fake placeholder files so example clusterfiles render without local secret material and without looking like real credentials
- **Example Cleanup**: Bundled examples now share one consistent placeholder secret path scheme and the README explains which examples to start from and what each one is meant to teach

## 3.18.7
- **Process Image Compatibility**: The `quay.io/dds/process` container now packages the shared render library and uses a direct Python entrypoint so it can run the latest repo templates and plugins cleanly from a mounted working tree
- **Wrapper + Docs Refresh**: `process.sh` now overrides the image entrypoint explicitly, maps file paths safely, and the docs show both direct container usage and the wrapper workflow

## 3.18.6
- **Installer-Compatible install-config**: `install-config.yaml.tpl` now preserves raw multi-document YAML when extra manifests are present, so `openshift-install` sees a valid install-config document instead of `kind: List`
- **Ship It Skill**: Added a `ship-it` skill documenting the repo's production release workflow, including tests, direct verification, prompt logging, changelog/version sync, image tags, runtime scripts, and health checks

## 3.16.0
- **Universal URL Routing**: Every section, editor tab, template selection, and sample load syncs to the URL (`#section/tab?template=...&sample=...`); back/forward restores full view state
- **Graceful Rendering**: Templates always render even with missing or incomplete data — undefined variables get sensible defaults (domain, subnet, macAddress, etc.) instead of crashing
- **Validation Tab Warnings**: Render warnings (substituted defaults, platform mismatches, missing fields) appear in the Validation sidebar tab with badge count
- **CLI stderr Warnings**: `process.py` prints render warnings to stderr while keeping clean output on stdout; never crashes on missing data
- **Default to Rendered**: Selecting a template now shows rendered output immediately instead of source

## 3.15.0
- **Deep Link Templates**: Share links to template source (`#templates/?template=...`) or rendered output with sample data (`#rendered/?template=...&sample=...`)

## 3.14.0
- **URL Routing**: Bookmarkable URLs — every sidebar section and About sub-tab gets a shareable hash URL (e.g. `#cluster`, `#about/comparison`); browser back/forward buttons navigate between sections

## 3.13.0
- **About & Collateral**: New About sidebar section with tabbed marketing collateral — overview, business value, comparison, presentation deck, and demo script rendered from markdown with inline SVG diagrams

## 3.12.1
- **Template Quality Audit**: Fixed Jinja2 formatting across 20 templates — control blocks moved inline, `is defined` replaced with `| default()`, mirror-registries include whitespace fix

## 3.12.0
- **ACM Disconnected Setup**: New `acm-disconnected` template generates digest-based ClusterImageSet (`@sha256:...`) + mirror-registries ConfigMap for air-gapped ACM hub clusters where IDMS/ICSP only trigger on digest pulls
- **Release Digest Field**: New `cluster.releaseDigest` schema field — existing ClusterImageSet template auto-switches to digest when set

## 3.11.0
- **Form Group Sections**: Cluster and Network forms now have collapsible groups (Basics, Security, Disconnected, Advanced, Cluster Networks, Proxy & Trust) so you see what matters first and expand the rest on demand
- **cert-manager Fix**: secretStore default corrected from `aws-secretsmanager` to `vault`

## 3.10.2
- **Editor Blur Refresh**: Form fields now update when you click outside the YAML editor after making manual edits

## 3.10.1
- **Array Remove Fix**: Fix remove button using stale paths after reindexing — re-render items with fresh closures after add/remove

## 3.10.0
- **Placement Resource**: ACM ZTP and CAPI templates now include Placement resource for operator PlacementBindings
- **ODF Node Labeling**: Automatic ODF storage node labeling via ACM Policy with smart worker/compact detection
- **Local Storage Operator**: New LSO plugin with LocalVolumeSet CR, ACM 3-stage Policy, `local-block` StorageClass for ODF
- **Array Fix**: Fix form "+ Add" button overwriting first array item instead of appending; fix form→editor sync race condition

## 3.9.0
- **Dynamic Plugin Integration**: Operators discovered by convention — no hardcoded if-blocks. Adding a new operator requires only its plugin directory, no template changes
- **cert-manager CRD Gate**: ACM Policy for cert-manager now includes CRD readiness gate (certmanagers.operator.openshift.io), matching the 3-stage pattern used by ArgoCD, LVM, and ODF
- **DRY Shared Library**: Common Python utilities (IndentDumper, base64encode, YAML validation) extracted to `lib/render.py`, eliminating duplication between CLI and web editor
- **Missing File Warnings**: `load_file()` now warns on stderr when secret files are missing or unreadable

## 3.8.2
- **ODF Auto Channel**: Derive ODF operator channel from cluster version (`stable-4.X`) instead of hardcoded `stable-4.18`

## 3.8.1
- **CRD Readiness Gate**: Fix ACM Policy readiness gate — replace generic CSV status check with CRD existence check for ODF, LVM, and ArgoCD. The CSV check matched the wrong CSV in multi-operator installs

## 3.8.0
- **Operator Policy Ordering**: Fix ACM Policy race condition — add `extraDependencies` with CSV readiness gate to ODF, LVM, and ArgoCD policies so CRs are only created after the operator is installed

## 3.7.1
- **Video Regenerated**: Full pipeline rebuilt — 17 slides, 3.8 min MP4 with all font/layout/CLI/cursor improvements baked in

## 3.7.0
- **Video Improvements**: All slide fonts scaled to minimum 28px for legibility, simplified layouts, cursor + click ripple animation on demo slides, CLI demo slide added, KubeVirt TTS pronunciation fixed

## 3.6.0
- **Video Presentation**: Narrated MP4 video (3.6 min, 1920x1080) with real editor screenshots (Playwright), TTS narration (edge-tts), data slides, and full value story walkthrough

## 3.5.0
- **Infographic**: SVG infographic with field counts, expansion charts, cross-platform comparison, time/cost analysis (92% savings at $150/hr), and expansion ratio visuals
- **Business Value**: ROI presentation with concrete numbers: 187 input fields produce 1,049 output fields (5.6x), 267 lines produce 2,579 lines (9.7x), 56 K8s resources from one clusterfile
- **Collateral Kit**: Executive one-pager, 11-slide deck, demo script, architecture SVG, comparison matrix
- **File Externalization**: Pull secrets, SSH keys, certs, credentials are file paths loaded at render time. ESO is a day-2 on-cluster operator

## 3.4.0
- **Collateral Kit**: Executive one-pager, 11-slide deck, demo script, architecture SVG, and comparison matrix in `docs/collateral/`
- **File Externalization Docs**: Collateral highlights that pull secrets, SSH keys, certificates, and credentials are externalized as file paths loaded at render time
- **ESO Clarification**: ESO documented as day-2 on-cluster operator, not part of the rendering process

## 3.3.0
- **ESO Vault Config**: ClusterSecretStore config template for Vault/OpenBao backend with Kubernetes auth. Default cert-manager secretStore changed to vault. ESO enabled on all example clusterfiles

## 3.2.1
- **KubeVirt CPU Request**: Increase VM CPU request from 2 to 4 to reduce resource contention

## 3.2.0
- **cert-manager Self-Check**: CertManager CR with `--dns01-recursive-nameservers-only` and recursive nameservers (default 8.8.8.8, 1.1.1.1) for reliable DNS-01 preflight checks. Conditional `cnameStrategy: Follow` on ClusterIssuer solver

## 3.1.0
- **SiteConfig KubeVirt**: KubeVirt platform now supported in siteconfig template — maps to BareMetal platformType in ClusterInstance CR

## 3.0.0
- **Kubernetes List Wrapper**: Multi-document YAML output (siteconfig, disconnected install-config) now wrapped in `kind: List` resource — output is directly `kubectl apply -f` / `oc apply -f` compatible. Single-doc templates unchanged

## 2.15.0
- **Platform Plugin Move**: Platform templates (aws, azure, gcp, vsphere, openstack, ibmcloud, nutanix, baremetal, kubevirt, none, external) moved from `templates/plugins/platforms/` to `plugins/platforms/` — all plugins now co-located under `plugins/`

## 2.14.0
- **Extract Plugin Schemas**: Operator schemas (ArgoCD, LVM, ODF, ACM, cert-manager, external-secrets) extracted from monolithic schema to `plugins/operators/<name>/schema.json` — auto-discovered and merged at load time
- **cert-manager LetsEncrypt**: Template-driven LetsEncrypt configuration with ExternalSecret, ClusterIssuer, and Certificate resources for DNS-01 validation via Route53
- **SecretStore Bootstrap**: Vault ClusterSecretStore bootstrap script with Kubernetes auth

## 2.13.0
- **OCP-on-OCP Operators**: Template-driven operator deployment for OCP-on-OCP demo — clusterfile operators sections for LVM, ACM, cert-manager, ArgoCD, external-secrets (hub) and ODF (managed clusters); manage-cluster.sh install phases transitioned from step scripts to template rendering
- **KubeVirt SSD Udev**: Install-time MachineConfig that forces virtual block devices to report as SSDs — included automatically for kubevirt platform via ZTP extraclustermanifests, CAPI ManifestWork, and ABI extra manifests
- **KubeVirt SNO Fix**: Fix broken flat network keys in kubevirt-sno example clusterfile

## 2.12.0
- **SiteConfig Integration**: Bidirectional conversion between clusterfiles and SiteConfig ClusterInstance CRs — `clusterfile2siteconfig.yaml.tpl` generates ClusterInstance + Namespace + Secrets; `siteconfig2clusterfile.yaml.tpl` does the reverse
- **ClusterInstance Fields**: New schema fields from ClusterInstance data model — clusterType, cpuPartitioningMode, diskEncryption (Tang), holdInstallation, External platform; per-host bootMode, nodeLabels, automatedCleaningMode, ironicInspect, installerArgs, ignitionConfigOverride
- **Template Enrichment**: ACM ZTP/CAPI templates consume all new per-host fields; install-config supports cpuPartitioningMode; Tang disk encryption MachineConfig include
- **DRY BMC URLs**: Shared `bmc-url.yaml.tpl` include for vendor-specific Redfish URL construction across all templates

## 2.11.0
- **6 Operator Plugins**: LVM, ODF, ACM, cert-manager, external-secrets join ArgoCD — each with smart defaults, optional channel/source/approval overrides, standalone manifests (ABI) and ACM Policy (ZTP/CAPI)
- **Plugin Co-location**: Operators restructured to `plugins/operators/<name>/` — schema, manifests, and policy templates co-located per operator
- **Operators UI**: New operators sub-section in Plugins tab with collapsible enable/disable fieldsets — check to enable, expand to configure
- **ACM Hub Example**: Full ACM hub SNO clusterfile with LVM + ACM + cert-manager + ArgoCD (bootstrap) + external-secrets

## 2.10.0
- **Operator Plugin Architecture**: New `plugins.operators` section with ArgoCD as first operator — just `argocd: {}` for full setup with smart defaults
- **Plugin Isolation**: Operators and platforms restructured into `templates/plugins/` and `schema/plugins/` — each plugin self-contained, ready for separate repos
- **ArgoCD ACM Policy**: Managed clusters get ArgoCD via ACM Policy (ZTP + CAPI); standalone clusters via extra manifests (ABI)
- **ArgoCD Bootstrap**: App-of-apps pattern — ArgoCD Application CR that manages further operators from a git repo with auto-sync, self-heal, and pruning

## 2.9.3
- **Template Consolidation**: Extract shared includes for POC banner ManifestWork and os-images-sync; DRY insecure registries; net -69 lines of duplication
- **KubeVirt Install Config**: Add kubevirt platform includes for install-config.yaml.tpl — maps to baremetal (VIPs) or none (SNO) for UPI/agent-based installs
- **Multi-Document YAML**: Fix multi-doc rendering in CLI and UI; wrap multiple documents as YAML list
- **Graceful Errors**: Pre-render validation for platform compatibility and required fields; actionable error messages for both CLI and UI

## 2.9.2
- **Insecure Mirrors**: Per-mirror `insecure` flag for self-signed certs and HTTP mirrors — sets `insecure=true` in registries.conf, generates `image.config.openshift.io/cluster` insecureRegistries across ZTP, CAPI, and ABI/IPI
- **Cluster Overview Update**: Add TPM encryption, disconnected, insecure mirrors, catalog sources, secondary networks, and files required sections to cluster overview preview

## 2.9.1
- **Disconnected Clusters**: Add `cluster.disconnected` flag and `cluster.catalogSources` for air-gapped installations — disables default OperatorHub sources, configures custom CatalogSources across all install methods (ZTP, CAPI, ABI/IPI)

## 2.9.0
- **Manifest Filename Fix**: Add `.yaml` extension to extraclustermanifests ConfigMap keys — assisted-service requires valid file extensions

## 2.8.9
- **ZTP Troubleshoot**: Comprehensive troubleshooting template — 15 checks for resources, conditions, agents, ISO, sync jobs, and assisted-service health

## 2.8.8
- **Release Script Fix**: Use `grep` instead of `rg`, push only new tag

## 2.8.7
- For mirrors, always use mirror


## 2.8.6
- **ZTP Fix**: Move `manifestsConfigMapRef` from ClusterDeployment to AgentClusterInstall — `provisioning` and `clusterInstallRef` are mutually exclusive

## 2.8.5
- **Release Script**: Updated `clusterfile-editor.sh release` to full ship-it process — syncs all version locations, commits, tags, pushes, builds, deploys, restarts, and verifies health

## 2.8.4
- **TPM Disk Encryption**: Updated MachineConfig with AES-CBC-ESSIV cipher, volume wipe, and XFS root filesystem
- **ZTP Fix**: Moved `manifestsConfigMapRef` under `provisioning` key


## 2.8.3
- **TPM Install-Time Only**: Removed ManifestWork — LUKS post-install wipes root disks
- **POC Banner**: Red "Proof of Concept" ConsoleNotification on all managed cluster consoles
  - ACM ZTP/CAPI: auto-delivered via ManifestWork
  - ABI/IPI: standalone `poc-banner.yaml.tpl` for `manifests/` dir or `oc apply`

## 2.8.2
- **TPM Install-Time Only**: LUKS disk encryption via `extraclustermanifests` at install time only
  - Removed ManifestWork — applying LUKS MachineConfig post-install wipes root disks (destructive)
  - TPM correctly handled at install time for ZTP (extraclustermanifests ConfigMap)
  - For running clusters, TPM encryption must be applied manually with full awareness of data loss
- **POC Banner**: Red "Proof of Concept" banner on all managed cluster consoles
  - ACM ZTP and CAPI: ManifestWork delivers ConsoleNotification to managed clusters automatically
  - ABI/IPI: Standalone `poc-banner.yaml.tpl` template — place in `manifests/` dir or `oc apply`
  - All install methods covered: ACM ZTP, ACM CAPI, ABI, IPI

## 2.8.1
- **Smart Storage**: Topology-aware storage class and data disk assignment
  - Control plane OS disks use performance storage class (fast I/O for etcd)
  - Worker OS disks use default storage class (capacity-oriented)
  - Data disks always use performance storage class (ODF/Ceph)
  - Compact cluster (≤5 hosts): data disks on control nodes (ODF collocated)
  - Standard cluster (≥3 workers): data disks on worker nodes (dedicated ODF)
  - Gap topology: no data disks when insufficient nodes for ODF

## 2.8.0
- **Cluster-Level TPM**: `cluster.tpm` replaces `plugins.kubevirt.tpm` as platform-agnostic master switch
  - Enables LUKS disk encryption MachineConfig in ACM/ZTP for any platform (baremetal, kubevirt, etc.)
  - On kubevirt, automatically adds persistent vTPM device with SMM and UEFI firmware to VMs
  - Schema updated: `cluster.tpm` boolean (default: false); removed from `plugins.kubevirt`

## 2.7.1
- **Cache Busting**: Static asset URLs (`?v=`) now dynamically use the current app version
  - Backend replaces hardcoded `?v=` params in index.html at serve time
  - No more stale CSS/JS after upgrades

## 2.7.0
- **KubeVirt TPM Support**: Persistent TPM 2.0 device on VMs for LUKS disk encryption
  - `tpm: persistent: true` in domain.devices, SMM features, UEFI firmware with persistent EFI
  - Inline MachineConfig for Clevis TPM2-based LUKS encryption in acm-ztp extraclustermanifests
  - `plugins.kubevirt.tpm` boolean in schema (default: false)
- **imageDigestSources**: Replace deprecated `imageContentSources` with `imageDigestSources` in install-config
  - Deprecated in OCP 4.14, warning from 4.19 onward
- **KubeVirt VLAN Networking**: VLAN support with restructured kubevirt VM networking
- **CUDN Localnet**: ClusterUserDefinedNetwork CRD for proper UDN Localnet support with linux-bridge fallback
- **RHCOS osImages**: RHCOS osImages in ASC and per-cluster osImages ConfigMaps for ZTP/CAPI
- **osImages Sync**: Event-driven Jobs replace CronJob polling for osImages sync
- **Fix**: RHCOS ISO URL corrected (`rhcos-live.iso` → `rhcos-live-iso.iso`)
- **Fix**: Baremetal platform include handles SNO without VIPs

## 2.6.6
- **UDN Networking**: Replace linux-bridge NAD with OVN UserDefinedNetwork in kubevirt template
  - No node-level bridge configuration needed — OVN handles the overlay
  - Removed `bridge` field from schema and sample clusterfiles

## 2.6.5
- **Editable Filename**: Click the filename in the header to rename
  - Inline input with Enter to save, Escape to cancel
  - Persists to localStorage, used in page title and downloads
  - Works for new documents, loaded files, and samples

## 2.6.4
- **No Browser Dialogs**: All `prompt()`, `alert()`, `confirm()` replaced with inline UI
  - Add host: inline FQDN input with validation errors
  - Duplicate/rename host: inline input replaces hostname label (Enter/Escape)
  - Remove host: immediate delete with undo toast
  - New document and revert all: click-twice-to-confirm pattern

## 2.6.3
- **Tier Map Editor**: `storageClass` rendered as uniform key-value list with enum tier selector
  - Each row: `[tier name]` `[StorageClassName input]` `[× remove]`
  - Add row: dropdown with predefined tiers (default, performance) + Other for custom names
  - Tier keys shown in monospace for clear identification
- **Dynamic Tier Dropdowns**: `storageMapping` os/data fields auto-populate from `storageClass` keys
  - `x-options-from-keys` schema annotation resolves dropdown options from live data
  - Adding a custom tier in `storageClass` immediately appears in tier selection dropdowns
  - Enum + Other pattern for consistent UX across tier definition and usage

## 2.6.2
- **Custom Storage Class Editor**: `storageClass` inline key-value editing with YAML persistence

## 2.6.1
- **Storage Mapping Enums**: `storageMapping` os/data tier fields now use `enum: ["default", "performance"]`
  - Editor renders dropdowns instead of free-text inputs
  - Validation catches typos in tier labels

## 2.6.0
- **KubeVirt Platform Support**: Full OpenShift Virtualization cluster provisioning
  - `kubevirt-cluster.yaml.tpl` generates Namespace, NetworkAttachmentDefinition, PVCs, and VirtualMachines
  - `kubevirt-install-iso.yaml.tpl` generates DataVolume for discovery ISO boot
  - Three sample clusterfiles: full (3+2), compact (3 control), SNO
  - kubevirt-redfish BMC vendor for virtual BMC emulation
- **Machine Resource Specifications**: Platform-agnostic `cluster.machine` with per-role defaults
  - `cluster.machine.control` / `cluster.machine.worker` for CPU, sockets, memory, storage
  - Per-host `hosts.<name>.machine` overrides for exceptions
  - Schema `$defs/machineSpec` reusable definition
  - vSphere and Nutanix templates updated with `cluster.machine` fallback
- **Storage Class Mapping**: Data-driven storage tier assignment in `plugins.kubevirt`
  - `storageClass.default` / `storageClass.performance` define available tiers
  - `storageMapping` maps roles to tiers for OS and data disks
  - Control plane gets performance (etcd), workers get default (capacity)
- **Editor Integration**: KubeVirt in plugin page, template page, and platform selector
- **All examples bumped to OpenShift 4.21.0**

## 2.5.8
- **ACM Template Cross-Links**: All 6 ACM templates now include `relatedTemplates` metadata
  - acm-ztp, acm-capi-m3, acm-asc, acm-creds, acm-clusterimageset, acm-clusterimagesets-sub
  - Full bidirectional links for template discovery in the editor UI
  - Added `docs` URLs for upstream documentation references

## 2.5.7
- **ACM ClusterImageSet Template**: Version management for ACM/MCE cluster deployments
  - Matches stolostron/acm-hive-openshift-releases upstream format exactly
  - Mirror-aware releaseImage for disconnected environments
  - Name convention matches ZTP imageSetRef (`img{version}-{arch}-appsub`)
- **ACM ClusterImageSets Subscription**: Auto-sync template for connected environments
  - Namespace, Application, Channel, Subscription resources
  - Points to backplane-2.10 branch of acm-hive-openshift-releases
  - Configurable channel (fast/stable/candidate)

## 2.5.6
- **Privacy & Trust Indicators**: Enterprise trust signals for security-conscious environments
  - Green "Local only" badge in header with lock icon — always visible
  - Dedicated Privacy & Trust section with four detail panels:
    - Data Stays Local — no external connections, telemetry, or cloud dependencies
    - Credential Handling — file path references only, never transmitted
    - Auditable Output — human-readable scripts, review before execution
    - Deployment Options — local, air-gapped, CLI-only modes
  - Enhanced file-path field tooltips reinforcing local-only processing

## 2.5.5
- **Pre-Check Template Restructure**: Modular body includes with composable master
  - Check logic in `includes/pre-check/` body files (files, dns, network, ntp, registry, bmc)
  - Standalone modules are thin wrappers: common + body + summary
  - Master `pre-check.sh.tpl` composes all bodies via include — no duplicated logic
  - 91 render combinations tested (13 clusterfiles x 7 templates)

## 2.5.4
- **Cluster Overview Enhancements**: Network capacity calculations and DNS improvements
  - api-int DNS record now CNAME pointing to api record
  - Cluster network: pods per node and max nodes from host prefix
  - Service network: usable address count
  - Machine network: usable host count
  - NIC table: name and MAC grouped in nested table to prevent wrapping

## 2.5.3
- **Preview Button in Header**: One-click cluster overview preview from top menu bar
  - Eye icon button renders cluster-overview.html.tpl and opens in new tab
  - Works with any loaded clusterfile — no template selection needed

## 2.5.2
- **Cluster Overview HTML**: Self-contained HTML document replaces markdown version
  - Opens directly in any browser — no markdown viewer needed
  - Dark mode, print-friendly, responsive layout with inline CSS
  - Host cards for baremetal, compact table for IPI platforms
- **Preview Button**: HTML templates show a Preview button in the rendered output pane
  - Opens rendered HTML in a new browser tab for live preview
- **Documentation Category**: New dropdown group for documentation templates

## 2.5.1
- **Template Restyle Complete**: Remaining 7 templates restyled with YAML-leading style and Jinja whitespace flags
  - install-config, secondary-network-setup, mirror-registry-config, ACM templates, includes
  - All `if/endif/for/endfor` moved inline; whitespace flags (`{%-`/`-%}`) for tight output
- **Cluster Overview Document**: New `cluster-overview.md.tpl` template for customer-facing documentation
  - Renders clean markdown from any clusterfile (baremetal, IPI, SNO)
  - Sections: identity, topology, network, hosts, mirrors, trust, DNS records
  - Adapts layout to platform (detailed host cards vs compact table)

## 2.5.0
- **Template Restyle**: All 18 platform include templates now follow YAML-leading style
  - Every line starts with output structure; Jinja directives appended inline
  - Closing directives attach to previous YAML lines, never on their own line
  - Templates are now human-scannable — you see the YAML shape at a glance
- **Robustness Defaults**: All controlPlane/compute templates use `| default({})` for optional sub-sections
  - Agent-based clusterfiles no longer crash when IPI-specific data is absent
  - Nutanix platform guards prismCentral/prismElements/subnetUUIDs behind `is defined`
- **BMC Vendor Enum**: Added `ksushy` and `kubevirt-redfish` to schema BMC vendor enum

## 2.4.7
- **Fix Mode Field Regressions**: Bond, VLAN, and MTU toggle fixes
  - Fix bond string values like "802.3ad" being coerced to numbers
  - Disabled now omits the key from config instead of writing `false`
  - Undefined/null values default to Disabled state
  - MTU validation uses anyOf to avoid oneOf overlap between presets and custom range

## 2.4.6
- **MTU Toggle**: MTU field now uses dropdown with Default (1500), Jumbo (9000), Custom, or Disabled
  - Presets: Default (1500) for standard frames, Jumbo (9000) for high-throughput networks
  - Custom option allows manual entry (576-9216)
  - Disabled option omits MTU from config (uses system default)
  - Applies to both primary and secondary network MTU fields

## 2.4.5
- **Robust Schema Handling**: Added utility functions for safe schema resolution
  - `safeResolveSchema()` - Validates and resolves $ref with fallback
  - `getSchemaArray()` - Safely access array properties (enum, required)
  - `getRootSchema()` - Convenience accessor for root schema
- **Fix All $ref Resolutions**: Resolve $refs in all schema accesses
  - `renderField()` - Resolve before type checking
  - `renderObjectFields()` - Resolve both schema and field schemas
  - `getHostSchema()` - Resolve patternProperties
  - `renderPluginsSection()` - Resolve plugin schemas
  - `renderModeField()` - Resolve options for value input
  - `renderArrayField()` - Resolve items schema
- **Defensive Null Checks**: Added proper null/undefined guards throughout

## 2.4.4
- **Fix Plugin Forms**: Resolve $refs in anyOf/oneOf before type detection for nested objects
- **Fix Bond/VLAN Toggle**: Mode selector now properly detects enum options with $ref
- **Fix Pull Secret Validation**: Check for `.auths` key instead of just valid JSON

## 2.4.3
- **Changelog Sync**: Fixed CHANGELOG array in app.js to include 2.4.1 and 2.4.2 releases

## 2.4.2
- **Modular Pre-Check Templates**: Refactored pre-check.sh into standalone modules
  - `pre-check-files.sh.tpl` - Validate pull secret, SSH keys, trust bundle, manifests
  - `pre-check-dns.sh.tpl` - DNS forward/reverse lookups and resolver checks
  - `pre-check-network.sh.tpl` - Host connectivity, gateway, VIP availability, proxy
  - `pre-check-ntp.sh.tpl` - NTP server connectivity
  - `pre-check-registry.sh.tpl` - Container registry connectivity with auth
  - `pre-check-bmc.sh.tpl` - BMC ping and Redfish API checks
- **Comprehensive Master Template**: `pre-check.sh.tpl` now composes all modules inline
- **Conditional Rendering**: Each section only renders when relevant data exists

## 2.4.1
- **Pre-Check Script**: Added `pre-check.sh.tpl` template for pre-installation verification
  - Tests DNS forward/reverse lookups, NTP, DNS resolvers, registry access, host connectivity, BMC
  - Only includes sections when data exists (minimal output for minimal configs)
  - Warns instead of fails - documents gaps without blocking
- **Related Templates**: Templates now link to commonly-used companions via `relatedTemplates` metadata
  - Dynamic related templates section in editor UI with category icons
- **Download Fix**: Rendered template download now uses correct file extension (.yaml, .sh)
- **Test Fixes**: Fixed test imports and assertions for template API

## 2.4.0
- **Template Metadata**: Added `@meta` blocks to all templates with type, category, platforms, requires, and docs
- **Smart Template Filtering**: Template dropdown now only shows clusterfile-type templates, grouped by category
- **Template Info Display**: Selected template shows supported platforms, required fields, and documentation link
- **vSphere Static IPs**: Added support for static IP configuration in vSphere IPI (TechPreview in OCP 4.17+)
- **Dynamic Version**: Browser title and header now show version fetched from API
- **Updated vSphere Example**: Example clusterfile now demonstrates static IP configuration

## 2.3.1
- **Templates Page Simplified**: Replaced 9 platform selection buttons with single platform info card
- **Platform Info Card**: Shows current platform icon, name, and description
- **Navigation Link**: Added "Change" link to navigate directly to Cluster section for platform changes
- **Credentials Button**: Added "Load Credentials Template" button for cloud platforms (AWS, Azure, GCP, vSphere, OpenStack, IBM Cloud, Nutanix)
- **UI Polish**: Reduced platform icon size from 32px to 20px for cleaner appearance
- **Updated Template Descriptions**: install-config.yaml.tpl and creds.yaml.tpl now show proper descriptions

## 2.3.0
- **Template Consolidation**: Replaced 7 platform-specific install-config templates with unified `install-config.yaml.tpl`
- **Dynamic Includes**: Created platform-specific includes under `templates/includes/platforms/{platform}/`
  - Each IPI platform has: controlPlane.yaml.tpl, compute.yaml.tpl, platform.yaml.tpl, creds.yaml.tpl
  - Supported platforms: aws, azure, gcp, vsphere, openstack, ibmcloud, nutanix, baremetal, none
- **Credentials Template**: Added unified `creds.yaml.tpl` for CCO (Cloud Credential Operator) credential generation
- **Nutanix Support**: Added full Nutanix IPI platform support with all includes
- **Test Suite**: Added comprehensive test suite with 57 tests
  - `tests/run_tests.py` - Standalone runner (no pytest dependency)
  - `tests/test_templates.py` - Full pytest-based test suite
  - Covers all platforms, configuration options, includes, and edge cases
- **Sample Data**: Added `customer.example.nutanix-ipi.clusterfile` sample
- **Whitespace Fix**: Fixed Jinja2 `{%- set %}` whitespace stripping that broke YAML indentation

## 2.2.2
- **Cross-Navigation**: Added links between Plugins and Cluster sections for platform configuration
- **Resizable Split View**: Added draggable divider between form and editor panes with localStorage persistence
- **Plugin Filtering**: Plugins section now shows only the plugin matching cluster.platform
- **Platform Selector**: Added platform buttons with auto-template selection on Templates page
- **IPI Platforms**: Added support for AWS, Azure, GCP, OpenStack, IBM Cloud platforms
- **vSphere IPI**: Added vSphere IPI support with failure domains

## 2.2.1
- Bug fixes and stability improvements

## 2.2.0
- Enhanced form editor with real-time validation
- Improved YAML editor with syntax highlighting
- Added diff view for change tracking

## 2.1.0
- Added Template and Rendered tabs for full-page template viewing
- Auto-load template source when selecting from dropdown
- Auto-render with parameter highlighting showing changed lines
- Improved Changes section with grouped changes and clickable links
- Fixed form focus loss when editing YAML
- Enhanced filename display with modification indicator
- Real-time validation and change badge updates

## 2.0.0
- Complete UI redesign with PatternFly styling
- Split view with form editor and YAML editor
- JSON Schema-driven form generation
- Live template rendering
- Sample clusterfile loading
