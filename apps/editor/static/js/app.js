/**
 * Clusterfile Editor v2.1 - Main Application
 *
 * Entry point that orchestrates all modules.
 * Supports both server mode (with backend API) and standalone mode (browser-only).
 */

// Module references
const State = window.EditorState;
const Validator = window.EditorValidator;
const Help = window.EditorHelp;
const CodeMirror = window.EditorCodeMirror;
const Form = window.EditorForm;

// Standalone mode detection
// Standalone mode is active when:
// 1. Running from file:// protocol, OR
// 2. Embedded data is present in the page (for pre-built standalone HTML)
const isStandaloneMode = (
  window.location.protocol === 'file:' ||
  !!document.getElementById('embedded-schema')
);

// API base URL (only used in server mode)
const API_BASE = window.location.origin;

// Application version (fetched from backend or embedded)
let APP_VERSION = '3.24.5';

// Embedded data for standalone mode (populated by build-standalone.sh)
let EMBEDDED_SCHEMA = null;
let EMBEDDED_SAMPLES = [];
let EMBEDDED_TEMPLATES = [];

// Platform to template mapping (all platforms use unified install-config.yaml.tpl)
const PLATFORM_TEMPLATES = {
  'baremetal': 'install-config.yaml.tpl',
  'vsphere': 'install-config.yaml.tpl',
  'aws': 'install-config.yaml.tpl',
  'azure': 'install-config.yaml.tpl',
  'gcp': 'install-config.yaml.tpl',
  'openstack': 'install-config.yaml.tpl',
  'ibmcloud': 'install-config.yaml.tpl',
  'nutanix': 'install-config.yaml.tpl',
  'kubevirt': 'kubevirt-cluster.yaml.tpl',
  'none': 'install-config.yaml.tpl'
};

// Platform to credentials template mapping
const PLATFORM_CREDS_TEMPLATES = {
  'aws': 'creds.yaml.tpl',
  'azure': 'creds.yaml.tpl',
  'gcp': 'creds.yaml.tpl',
  'vsphere': 'creds.yaml.tpl',
  'openstack': 'creds.yaml.tpl',
  'ibmcloud': 'creds.yaml.tpl',
  'nutanix': 'creds.yaml.tpl'
};

// Platform display names and descriptions
const PLATFORM_INFO = {
  'baremetal': { name: 'Bare Metal', description: 'Agent-based installer for physical servers', icon: 'server' },
  'vsphere': { name: 'VMware vSphere', description: 'IPI for vSphere/vCenter environments', icon: 'cloud' },
  'aws': { name: 'AWS', description: 'IPI for Amazon Web Services', icon: 'cloud' },
  'azure': { name: 'Azure', description: 'IPI for Microsoft Azure', icon: 'cloud' },
  'gcp': { name: 'GCP', description: 'IPI for Google Cloud Platform', icon: 'cloud' },
  'openstack': { name: 'OpenStack', description: 'IPI for OpenStack private clouds', icon: 'cloud' },
  'ibmcloud': { name: 'IBM Cloud', description: 'IPI for IBM Cloud VPC', icon: 'cloud' },
  'nutanix': { name: 'Nutanix', description: 'Agent-based installer for Nutanix AHV', icon: 'server' },
  'kubevirt': { name: 'KubeVirt', description: 'OpenShift Virtualization VM-based cluster provisioning', icon: 'server' },
  'none': { name: 'None (SNO)', description: 'Single Node OpenShift without platform integration', icon: 'server' }
};

// Flag to prevent form→editor→form sync loops
let syncingFromForm = false;
let formNeedsRefresh = false;

// Get icon SVG for template category
function getTemplateIcon(category) {
  const icons = {
    installation: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
    </svg>`,
    credentials: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>`,
    acm: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>
    </svg>`,
    configuration: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>`,
    utility: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
      <polyline points="4 17 10 11 4 5"/>
      <line x1="12" y1="19" x2="20" y2="19"/>
    </svg>`,
    other: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
    </svg>`
  };
  return icons[category] || icons.other;
}

// Changelog data - KEEP THIS UPDATED with each release
const CHANGELOG = [
  {
    version: '3.24.5',
    date: '2026-05-01',
    changes: [
      'CAPI API version corrections: Cluster and MachineDeployment reverted from v1beta2 back to v1beta1 — the v1beta2 conversion webhook has a bug (looks for CRD "metal3clusters." with missing group suffix). OpenshiftAssistedControlPlane kept at v1alpha3 with added apiGroup field (required by the v1alpha3 schema). BMH binder policy Machine lookup reverted to v1beta1 to match'
    ]
  },
  {
    version: '3.24.4',
    date: '2026-05-01',
    changes: [
      'CAPI template API version bumps: Cluster v1beta1→v1beta2, OpenshiftAssistedControlPlane v1alpha2→v1alpha3, OpenshiftAssistedConfigTemplate v1alpha1→v1alpha2, MachineDeployment v1beta1→v1beta2, worker infrastructureRef v1alpha3→v1beta1. Eliminates server-side deprecation warnings on MCE v2.11.0+',
      'BMH binder policy Machine lookup updated from v1beta1 to v1beta2'
    ]
  },
  {
    version: '3.24.3',
    date: '2026-05-01',
    changes: [
      'ACM assisted-service AUTH_TYPE default changed from "none" to "local" — fixes CAPI provisioning: the capoa-bootstrap-controller requires an api_key in the InfraEnv download URL to fetch ignition config, which the assisted-service only generates when AUTH_TYPE=local. The local-auth EC key pair is auto-generated by the infrastructure-operator so no additional setup is needed'
    ]
  },
  {
    version: '3.24.2',
    date: '2026-04-30',
    changes: [
      'CAPI BMH binding via ACM Policy: replaces v3.24.1\'s misleading static infraenvs.agent-install.openshift.io: <cluster.name> label (which never matches the per-machine InfraEnv names <cluster>-<random> the openshift-assisted CAPI bootstrap controller actually creates) with a continuously-reconciled ConfigurationPolicy. The policy walks Machines in the cluster namespace, follows each Machine bootstrap.configRef → OpenshiftAssistedConfig → InfraEnv chain, finds the BMH whose spec.consumerRef.name matches the Machine\'s Metal3Machine, and labels it with the matching per-machine InfraEnv name so the bmac controller patches the discovery ISO URL onto BMH.spec.image.url. Workaround for the missing cluster-api-provider-openshift-assisted infrastructure controller; removes cleanly when that controller is later installed (just delete the policy)',
      'New include templates/includes/capi-bmh-binder-policy.yaml.tpl emits Policy + Placement + PlacementBinding + ManagedClusterSetBinding scoped to the cluster namespace, targeting local-cluster (the hub) for execution',
      'Header comment block in acm-capi-m3.yaml.tpl documents the controller dependency and the fallback to acm-ztp when the infra controller is absent'
    ]
  },
  {
    version: '3.24.1',
    date: '2026-04-29',
    changes: [
      'CAPI fix: BareMetalHosts in the CAPI/M3 bundle now carry the infraenvs.agent-install.openshift.io: <cluster.name> label and bmac.agent-install.openshift.io/{hostname, role} annotations — the binding the bmac controller needs to inject the discovery ISO URL into BMH.spec.image. NMStateConfigs get the same label so the InfraEnv selects them for static-network config. Mirrors the ZTP pattern that has always worked'
    ]
  },
  {
    version: '3.24.0',
    date: '2026-04-29',
    changes: [
      'Agent ISO download (Q1): new POST /api/agent-iso runs `openshift-install agent create image` inside the container against the user clusterfile and streams a deploy-ready <cluster>-agent-<arch>.iso. Required new /cache mount persists openshift-install + oc binaries (~880 MB per OCP version) and the RHCOS live ISO. New Download Agent ISO button in the Rendered pane (visible when cluster.installMethod=agent) with a Building modal and state-driven disable. Disconnected installs honored via the existing cluster.mirrors / cluster.disconnected paths',
      'Browser file uploads (Q2): every x-is-file form field now has an Upload button. FileReader → in-memory map keyed by the YAML path string; sent with every render request as files: {path: content}. Resolution priority: per-request files > /content mount > <file:path> placeholder. NEVER persisted (no localStorage / sessionStorage / IndexedDB)',
      'Per-restart unlock key gating /content reads: backend prints a long random key once on startup; UI prompts for it the first time you flip File: content or click Download Agent ISO. Stored in browser memory only; regenerated on every restart',
      'Disabled rocker affordance: clicking a disabled Display/Output rocker opens a setup-help dialog with mount instructions and a one-click Enter unlock key button',
      'ACM ZTP and CAPI bundles now accept cluster.platform: none for SNO topology (was warning baremetal-only). 4 templates updated: acm-ztp, acm-capi-m3, acm-creds, acm-asc',
      'CAPI controlPlaneEndpoint host fixed to api.<cluster>.<domain> (was <cluster>.<domain> — invalid OCP DNS convention)',
      'Container base switched to ubi9-minimal (was python:3.12-slim) so nmstatectl is available — required by `openshift-install agent create image` for static-network validation. Adds tar/gzip/ca-certificates for the binary fetch + extract',
      'New /api/content-unlock and /api/agent-iso/status endpoints; render and bundle endpoints accept include_content + files map; backend gate returns 403 when /content is mounted but include_content=true is requested without a valid X-Content-Unlock header'
    ]
  },
  {
    version: '3.23.1',
    date: '2026-04-28',
    changes: [
      'Bundle vs single-template flow no longer mixes: template selector now groups templates by bundle (Agent / ACM Hub / ACM ZTP / CAPI / Utility / Single templates) with a "▸ View entire bundle" pseudo-option per group. Picking a single template exits bundle mode and clears the bundle tabs row; picking the View entire option enters bundle mode for that bundle',
      'Persistent rendered-pane mode: switching between Template/Rendered tabs preserves the active bundle tab and the renderedMode (bundle vs single) instead of always falling back to autoRenderTemplate',
      'Independent Display vs Output rockers in the rendered pane header — Display drives what is shown on screen, Output drives what Copy/Download produce. Lets you keep the screen private (path) while exporting full content, or vice versa. Both default to path; Output greys out when /content is not mounted',
      'Copy/Download fetch fresh from the API in Output mode if it differs from Display, so the export always matches the toggle even when nothing was re-rendered first'
    ]
  },
  {
    version: '3.23.0',
    date: '2026-04-28',
    changes: [
      'Generic content mount: backend resolves any load_file() reference under a /content host mount (subtree preserved — secrets/, manifests/, certs/, ...) when an opt-in toggle is on, otherwise keeps the <file:...> placeholder. Path traversal blocked. New /api/content-status endpoint reports the mount inventory; render endpoints accept include_content',
      'Rendered pane gets a "File: path / content" rocker switch next to Copy/Download — both options always visible, sliding thumb shows the active one, disabled with tooltip when /content is not mounted',
      'Start modal no longer shows phantom edits: re-baselines after stamping cluster.installMethod and cluster.clusterRole so a fresh New starts with zero changes',
      'cluster-overview.html.tpl: safe against placeholder subnet values like <subnet-cidr> — no more "list object has no element 1" preview crash on unedited starters'
    ]
  },
  {
    version: '3.22.22',
    date: '2026-04-27',
    changes: [
      'Consolidated onboarding: single Start modal merges welcome+new picker, captures topology AND install method (Agent/ACM ZTP/CAPI) on one screen',
      'New schema fields: cluster.installMethod and cluster.clusterRole — clusterfiles now self-describe their install intent',
      '15 templates tagged with bundle/clusterRole/bundleOrder metadata; new /api/render-bundle endpoint resolves the right multi-file set',
      'Tabbed install bundle in the Rendered pane — one tab per file, content swaps in the existing CodeMirror, <file:...> footer explains placeholder expansion',
      'Progressive next-step hint replaces static banner — amber for placeholders, red for validation, green for ready; always one CTA',
      'Removed the Welcome sidebar item from 3.22.21 — header New button is now the single CTA'
    ]
  },
  {
    version: '3.22.21',
    date: '2026-04-27',
    changes: [
      'Moved the welcome-modal trigger from the header to a Welcome sidebar item next to Guide — same behavior, better placement'
    ]
  },
  {
    version: '3.22.20',
    date: '2026-04-27',
    changes: [
      'Header Tour button: re-opens the welcome modal at any time; topology buttons in the modal swap the current document for the chosen starter ("start over")'
    ]
  },
  {
    version: '3.22.19',
    date: '2026-04-27',
    changes: [
      'Smart starter on first visit: opens with pre-filled SNO starter (placeholders to replace) instead of empty form',
      'Task-oriented welcome modal: rewritten to walk through what you see → how to fill → where to get help → where to render; includes inline topology switcher (SNO/Compact/Full/Blank)',
      'Ready-to-render banner: shown at top of form sections when Todo + Validation badges are both 0, with one-click jump to Templates'
    ]
  },
  {
    version: '3.22.18',
    date: '2026-04-27',
    changes: [
      'Schema descriptions: 24 platform-defaults fields now explain why the default is what it is and when to change it',
      'Covers: AWS/Azure/GCP/IBM Cloud instance types + disk types, host bootMode (UEFI vs UEFISecureBoot vs legacy), cluster.arch (x86_64/aarch64/ppc64le/s390x), operator subscription approval (Automatic vs Manual)'
    ]
  },
  {
    version: '3.22.17',
    date: '2026-04-24',
    changes: [
      'Schema docs: fixed 51 broken doc URLs (container_platform/ typo) that bounced to docs.redhat.com home page',
      'Schema docs: pinned all 90 OpenShift doc links to OCP 4.21 (main schema + cert-manager, lvm, lso, github plugin schemas)',
      'Terminology: corePassword help text updated from "master + worker" to "control-plane + worker"',
      'Known issue: docs.openshift.com 4.21 redirects drop path/anchor — users land on docs.redhat.com 4.21 root; no regression vs prior state. Next ship migrates to html-single URLs for working deep links.'
    ]
  },
  {
    version: '3.22.16',
    date: '2026-04-24',
    changes: [
      'Ironic split: plugins.baremetal.ironic.operator configures hub Metal3 (Provisioning CR); .host sets BareMetalHost defaults on managed clusters'
    ]
  },
  {
    version: '3.22.15',
    date: '2026-04-24',
    changes: [
      'Baremetal plugin form: Plugins → Platform now shows Ironic settings instead of "no configuration required"',
      'Node Labels: key-value editor with add/remove rows replaces empty fieldset'
    ]
  },
  {
    version: '3.22.14',
    date: '2026-04-24',
    changes: [
      'Ironic plugin fields renamed to API terms: inspection (boolean) and automatedCleaningMode (metadata/disabled) — match Metal3/Ironic BareMetalHost spec directly'
    ]
  },
  {
    version: '3.22.13',
    date: '2026-04-24',
    changes: [
      'Ironic flags (hardwareInspection, diskCleanup) moved from per-host to plugins.baremetal.ironic — cluster-level defaults',
      'All five Ironic settings now in plugins.baremetal.ironic — previously three were hardcoded in templates',
      'New plugins/platforms/baremetal schema: full editor UI with checkboxes and doc links for all Ironic flags'
    ]
  },
  {
    version: '3.22.12',
    date: '2026-04-23',
    changes: [
      'automatedCleaningMode: metadata is the consistent default — Ironic wipes partition tables before provisioning; set disabled to preserve disk contents'
    ]
  },
  {
    version: '3.22.11',
    date: '2026-04-23',
    changes: [
      'ironicInspect default inverted: inspection runs by default (annotation absent); set disabled to skip',
      'Guide: VMware admin translation table — maps ESXi/vCenter/OVA to bare-metal equivalents',
      'Starter cards: hardware-term descriptions with server counts and HA context',
      'Schema: BMC fields now surface iDRAC/iLO/IPMI terminology'
    ]
  },
  {
    version: '3.22.10',
    date: '2026-04-23',
    changes: [
      'ironicInspect fix: "enabled" omits inspect.metal3.io annotation so Metal3 runs inspection; "disabled" (default) emits it explicitly'
    ]
  },
  {
    version: '3.22.9',
    date: '2026-04-23',
    changes: [
      'rootDeviceHints fix: plain device path (os: /dev/sda) now wraps as deviceName mapping — was silently ignored by OpenShift as a scalar'
    ]
  },
  {
    version: '3.22.8',
    date: '2026-04-22',
    changes: [
      'DRY BMC path: extracted bmc-redfish-path.tpl — single source for vendor→Redfish system path, shared by bmc-url and pre-check templates'
    ]
  },
  {
    version: '3.22.7',
    date: '2026-04-23',
    changes: [
      'Guide rework: work from my-clusters/, repo as ../clusterfile/ sibling; no ~/ assumption — works from any directory'
    ]
  },
  {
    version: '3.22.6',
    date: '2026-04-22',
    changes: [
      'Removed ksushy BMC vendor — dropped from schema enum and bmc-url template'
    ]
  },
  {
    version: '3.22.5',
    date: '2026-04-22',
    changes: [
      'HP iLO BMC: corrected to redfish-virtualmedia:// — drops invalid ilo5-virtualmedia scheme and removes +https suffix that caused insert/eject media loop'
    ]
  },
  {
    version: '3.22.4',
    date: '2026-04-22',
    changes: [
      'HP iLO fix: hp/hpe vendor now uses ilo5-virtualmedia driver — fixes insert/eject media loop during ACM boot; hpe was also missing from bmc-url and falling through to bare address'
    ]
  },
  {
    version: '3.22.3',
    date: '2026-04-22',
    changes: [
      'Host field order: universal fields first, Baremetal group (bmc, bootMode, cleaningMode, ironicInspect, installerArgs, ignitionConfigOverride) grouped separately'
    ]
  },
  {
    version: '3.22.2',
    date: '2026-04-22',
    changes: [
      'host.zone: optional availability zone field — injects topology.kubernetes.io/zone node label via BareMetalHost annotation in ACM ZTP and CAPI-M3'
    ]
  },
  {
    version: '3.22.1',
    date: '2026-04-22',
    changes: [
      'Guide moved to top of sidebar nav',
      'guide.md CLI examples updated to use ./ relative paths',
      'New acm.clusterfile and workload.clusterfile minimal starters'
    ]
  },
  {
    version: '3.22.0',
    date: '2026-04-22',
    changes: [
      'Guide section: step-by-step onboarding with CLI examples, directory layout, and action buttons',
      'Persistent template selection across page reloads (localStorage)',
      'Schema quality pass: descriptions and doc links across host, network, and plugin fields',
      'corePassword moved to Basics group; cluster.location and network.ntpservers added to starters',
      'nmstate crash fix: split(/)[-1]|int(24) guards against placeholder subnet cidr',
      'acm-capi-m3: removed hardcoded ignition override and dead image vars'
    ]
  },
  {
    version: '3.21.1',
    date: '2026-04-21',
    changes: [
      'rootDeviceHints fix: storage.os is optional — absent hosts no longer emit rootDeviceHints: CHANGEME in ACM ZTP, CAPI-M3, and nodes-config'
    ]
  },
  {
    version: '3.21.0',
    date: '2026-04-21',
    changes: [
      'cluster.corePassword: set a file path to auto-inject SHA-512 crypt MachineConfig for the core OS user (master + worker) via operators.yaml.tpl'
    ]
  },
  {
    version: '3.20.1',
    date: '2026-04-20',
    changes: [
      'Todo items now show a Documentation ↗ link when the schema field has an x-doc-url'
    ]
  },
  {
    version: '3.20.0',
    date: '2026-04-20',
    changes: [
      'Todo Section: unfilled <placeholder> values get a dedicated sidebar panel with schema title, description, and doc links',
      'Grouped Panels: Validation, Todo, and Changes all group by schema section with colored count badges'
    ]
  },
  {
    version: '3.19.5',
    date: '2026-04-20',
    changes: [
      'cluster.fips moved to first field in Security group (above TPM and disk encryption)'
    ]
  },
  {
    version: '3.19.4',
    date: '2026-04-20',
    changes: [
      'cluster.fips: true — FIPS 140-2/140-3 support across install-config, ACM ZTP, and CAPI-M3'
    ]
  },
  {
    version: '3.19.3',
    date: '2026-04-20',
    changes: [
      'GitHub auth templates silent when auth.github not configured — no warnings, no empty YAML skeleton, no oc apply errors'
    ]
  },
  {
    version: '3.19.2',
    date: '2026-04-19',
    changes: [
      'cert-manager day2 template: dict.get() replaces Jinja2 attribute access — no warnings when plugins.operators is absent'
    ]
  },
  {
    version: '3.19.1',
    date: '2026-04-19',
    changes: [
      'cert-manager day2 template no longer emits null YAML when plugins.operators is absent',
      'New button opens starter picker modal: SNO / Compact / Full HA / Blank',
      'Example clusterfiles use secrets/ path instead of data/secrets/'
    ]
  },
  {
    version: '3.19.0',
    date: '2026-04-19',
    changes: [
      'nmstate operator auto-installed on platform: baremetal clusters',
      'New as_list filter — VIPs accept single string or array uniformly across all templates',
      'Schema defaults for OCP network constants (cluster subnet, service subnet, bond/vlan: false) — omit from clusterfiles',
      'Machine sizing defaults: cpus: 8, memory: 32 GiB for all nodes',
      'BREAKING: platform: kubevirt removed — use platform: baremetal + plugins.kubevirt instead',
      'cluster.clusterType is now optional override only — SNO derived from host count automatically',
      'Role consistency: CAPI-M3 NMStateConfig/BareMetalHost labels use role: control (was controller)',
      '19 example files replaced by 3 starter files (start-sno, start-compact, start-full) + 9 platform plugin examples'
    ]
  },
  {
    version: '3.18.19',
    date: '2026-04-18',
    changes: [
      'LVM operator channel now derives from cluster.version (stable-4.Y), matching ODF',
      'ACM default channel updated from release-2.14 to release-2.15',
      'All operators now support version field to pin startingCSV',
      'Fix Jinja2 syntax error in secondary-network-setup ipam block',
      'Secondary network type check aligned to linux-bridge (was bridge)',
      'Dead macvlan branch removed; miimon standardized to 150ms',
      'plugins.kubevirt.network.name renamed to nad',
      'Secondary network type enum trimmed (removed ethernet, ovs-bridge)'
    ]
  },
  {
    version: '3.18.18',
    date: '2026-04-17',
    changes: [
      'network.primary.mtu now sets MTU on the linux-bridge NAD CNI config in kubevirt-cluster',
      'Secondary network NNCP bridge interfaces and NAD CNI configs also carry MTU when set',
      'All conditional — field omitted when mtu is not defined'
    ]
  },
  {
    version: '3.18.17',
    date: '2026-04-17',
    changes: [
      'linuxBridge is now a plain string (the bridge device name, e.g. br-bond0-1410) — no more nested object wrapper',
      'Removes the lab-specific bridge-1410 default — bridge must be explicit',
      'linux-bridge NADs named vmnet-{vlanId}, parallel to cudn-vmdata-{vlanId}',
      'macspoofchk: false added to linux-bridge NADs to allow nested VM MAC traffic'
    ]
  },
  {
    version: '3.18.16',
    date: '2026-04-08',
    changes: [
      'cluster.disconnected is now an object — its presence enables air-gapped mode, replacing the boolean cluster.disconnected: true',
      'Set disconnected.osImageHost to your internal mirror hostname and the template derives full RHCOS ISO and rootFS paths from the cluster version automatically — no explicit URLs needed',
      'cluster.osImages removed; migration: disconnected: true → disconnected: {} (or disconnected: {osImageHost: https://...})'
    ]
  },
  {
    version: '3.18.15',
    date: '2026-04-08',
    changes: [
      'registries.conf no longer emits prefix = "" for mirrors with an empty prefix — that empty string matched all registries and broke mirror routing, causing MCS (port 22623) to never start and installation to hang at ~42%',
      'os-images-sync job is skipped in disconnected mode without disconnected.osImageHost; cluster.disconnected is now an object (presence = air-gapped mode) with an optional osImageHost field — the template derives full RHCOS paths from the version automatically'
    ]
  },
  {
    version: '3.18.14',
    date: '2026-04-08',
    changes: [
      'install-config.yaml.tpl now renders kubevirt single-node clusters as installer platform none while keeping bootstrap-in-place behavior aligned with that output',
      'Multi-node kubevirt installs continue to render as baremetal, and the template logic was simplified down to one derived install-config platform value'
    ]
  },
  {
    version: '3.18.13',
    date: '2026-04-08',
    changes: [
      'ACM ZTP now renders the generated disconnected discovery ignition override on InfraEnv, which is the path the live discovery environment actually consumes before Agent registration',
      'Explicit per-host ignition overrides still render on BareMetalHost, but the disconnected default now follows the real discovery boot path instead of the BMH fallback path'
    ]
  },
  {
    version: '3.18.12',
    date: '2026-04-07',
    changes: [
      'generate-mac-in-range.sh now derives stable deterministic MAC addresses from cluster, domain, host, and interface identity instead of shuffling random addresses',
      'The kubevirt example setup scripts now describe the generated MAC addresses as deterministic so the operator messaging matches the tool behavior'
    ]
  },
  {
    version: '3.18.11',
    date: '2026-04-07',
    changes: [
      'Generated ACM discovery ignition overrides now trust both the original source pull keys and the mirrored endpoints for disconnected installs',
      'Added decoded-policy coverage for ACM ZTP and ACM CAPI, including source registries, mirror endpoints, and mirror.prefix handling'
    ]
  },
  {
    version: '3.18.10',
    date: '2026-04-07',
    changes: [
      'ship it now explicitly follows the repo-local skills/ship-it/SKILL.md workflow instead of relying on the surfaced session skill list',
      'Documented the repo-local ship-it requirement in the release guidance and prompt audit trail so production releases follow one checked-in process'
    ]
  },
  {
    version: '3.18.9',
    date: '2026-04-07',
    changes: [
      'Merged the tested auth.github branch work into main while preserving branch history and the editor/plugin discovery changes',
      'Fixed post-merge regressions in standalone operator rendering, ACM prerelease manifests, and ACM ZTP BMC detection',
      'Restored editor processor test compatibility and re-validated the main template and processor suites after the merge'
    ]
  },
  {
    version: '3.18.8',
    date: '2026-04-06',
    changes: [
      'Added data/secrets placeholder files so bundled examples render safely without local secret material',
      'Cleaned up example clusterfiles and README guidance so the examples are easier to start from and easier to understand'
    ]
  },
  {
    version: '3.18.7',
    date: '2026-04-06',
    changes: [
      'The quay.io/dds/process container now packages lib/, uses a direct Python entrypoint, and works cleanly from a mounted working tree',
      'process.sh now overrides the image entrypoint explicitly, maps file paths safely, and the docs show the updated CLI workflow'
    ]
  },
  {
    version: '3.18.6',
    date: '2026-04-06',
    changes: [
      'install-config.yaml.tpl now preserves raw multi-document YAML for openshift-install while apply-oriented templates keep the List wrapper',
      'Added a ship-it skill that codifies testing, verification, prompt logging, changelog/version sync, image pushes, scripts, and health checks'
    ]
  },
  {
    version: '3.16.0',
    date: '2026-02-25',
    changes: [
      'Universal URL routing: every section, tab, template, and sample in sharable URL',
      'Graceful rendering: templates always render with sensible defaults for missing data',
      'Render warnings shown in Validation tab with badge count',
      'Selecting a template defaults to rendered output view'
    ]
  },
  {
    version: '3.15.0',
    date: '2026-02-25',
    changes: [
      'Deep link to template source or rendered output with sample data via URL hash params'
    ]
  },
  {
    version: '3.14.0',
    date: '2026-02-25',
    changes: [
      'Bookmarkable URLs: every section and About sub-tab gets a shareable hash URL; browser back/forward buttons work'
    ]
  },
  {
    version: '3.13.0',
    date: '2026-02-25',
    changes: [
      'New About sidebar section with tabbed marketing collateral — overview, business value, comparison, presentation, demo script with inline SVG diagrams'
    ]
  },
  {
    version: '3.12.1',
    date: '2026-02-25',
    changes: [
      'Template quality audit: fixed Jinja2 formatting across 20 templates — control blocks inline, | default() shorthand, mirror-registries include fix'
    ]
  },
  {
    version: '3.12.0',
    date: '2026-02-25',
    changes: [
      'ACM disconnected setup template: digest-based ClusterImageSet + mirror-registries ConfigMap for air-gapped environments',
      'New cluster.releaseDigest schema field — ClusterImageSet auto-switches to @sha256 digest when set'
    ]
  },
  {
    version: '3.11.0',
    date: '2026-02-24',
    changes: [
      'Collapsible form groups for Cluster and Network sections (Basics, Security, Disconnected, Advanced, Cluster Networks, Proxy & Trust)',
      'cert-manager secretStore default corrected from aws-secretsmanager to vault'
    ]
  },
  {
    version: '3.10.2',
    date: '2026-02-24',
    changes: [
      'Form fields now update when you click outside the YAML editor after manual edits'
    ]
  },
  {
    version: '3.10.1',
    date: '2026-02-24',
    changes: [
      'Fix array remove button using stale closure paths after reindexing',
      'Re-render all array items from state after add/remove for correct indices'
    ]
  },
  {
    version: '3.10.0',
    date: '2026-02-24',
    changes: [
      'Placement resource added to ACM ZTP and CAPI templates for operator PlacementBindings',
      'Automatic ODF storage node labeling via ACM Policy with smart worker/compact detection',
      'Local Storage Operator plugin: LocalVolumeSet CR, ACM 3-stage Policy, local-block StorageClass',
      'Fix form array "+ Add" button overwriting first item instead of appending',
      'Fix form→editor sync race condition (guard window increased to cover debounce)'
    ]
  },
  {
    version: '3.9.0',
    date: '2026-02-23',
    changes: [
      'Dynamic plugin integration: operators discovered by convention, no hardcoded if-blocks',
      'cert-manager CRD readiness gate added to ACM Policy (3-stage pattern)',
      'Shared Python library lib/render.py eliminates CLI/editor code duplication',
      'load_file() warns on stderr when secret files are missing'
    ]
  },
  {
    version: '3.8.2',
    date: '2026-02-21',
    changes: [
      'Derive ODF operator channel from cluster version (stable-4.X) instead of hardcoded stable-4.18'
    ]
  },
  {
    version: '3.8.1',
    date: '2026-02-21',
    changes: [
      'Fix ACM Policy readiness gate: use CRD existence check instead of generic CSV status check for ODF, LVM, ArgoCD'
    ]
  },
  {
    version: '3.8.0',
    date: '2026-02-18',
    changes: [
      'Fix ACM Policy race: add extraDependencies CSV readiness gate to ODF, LVM, ArgoCD policies'
    ]
  },
  {
    version: '3.7.1',
    date: '2026-02-18',
    changes: [
      'Video regenerated: 17 slides, 3.8 min MP4 with bigger fonts, CLI demo, click indicators'
    ]
  },
  {
    version: '3.7.0',
    date: '2026-02-18',
    changes: [
      'Video: all slide fonts min 28px, simplified layouts, cursor + click ripple on demo slides',
      'Video: CLI demo slide showing terminal-style process.py usage',
      'Video: KubeVirt TTS pronunciation fix'
    ]
  },
  {
    version: '3.6.0',
    date: '2026-02-17',
    changes: [
      'Video presentation: narrated 3.6-min MP4 with real editor screenshots, TTS narration, and data slides'
    ]
  },
  {
    version: '3.5.0',
    date: '2026-02-17',
    changes: [
      'Infographic: field counts, expansion charts, time/cost analysis (92% savings), cross-platform comparison',
      'Business value: ROI presentation — 187 fields in, 1,049 out (5.6x), 56 K8s resources from one file',
      'Collateral kit: one-pager, slide deck, demo script, architecture SVG, comparison matrix',
      'File externalization and ESO role documented across all collateral'
    ]
  },
  {
    version: '3.4.0',
    date: '2026-02-17',
    changes: [
      'Collateral kit: one-pager, slide deck, demo script, architecture SVG, comparison matrix in docs/collateral/',
      'File externalization highlighted: pull secrets, SSH keys, certs, credentials are file paths loaded at render time',
      'ESO role clarified: day-2 on-cluster operator, not part of the rendering process'
    ]
  },
  {
    version: '3.3.0',
    date: '2026-02-16',
    changes: [
      'ESO Vault config: ClusterSecretStore template for Vault/OpenBao with Kubernetes auth defaults',
      'Default cert-manager secretStore changed from aws-secretsmanager to vault',
      'External Secrets Operator enabled on all example clusterfiles'
    ]
  },
  {
    version: '3.2.1',
    date: '2026-02-16',
    changes: [
      'KubeVirt CPU request: increase VM CPU request from 2 to 4 to reduce resource contention'
    ]
  },
  {
    version: '3.2.0',
    date: '2026-02-16',
    changes: [
      'cert-manager self-check: CertManager CR with recursive nameserver defaults (8.8.8.8, 1.1.1.1) for DNS-01 preflight; conditional cnameStrategy on ClusterIssuer'
    ]
  },
  {
    version: '3.1.0',
    date: '2026-02-15',
    changes: [
      'SiteConfig KubeVirt: kubevirt platform supported in siteconfig template, maps to BareMetal platformType'
    ]
  },
  {
    version: '3.0.0',
    date: '2026-02-15',
    changes: [
      'Kubernetes List wrapper: multi-document YAML output wrapped in kind: List for kubectl apply compatibility'
    ]
  },
  {
    version: '2.15.0',
    date: '2026-02-15',
    changes: [
      'Platform plugin move: all platform templates relocated to plugins/platforms/ alongside operator plugins'
    ]
  },
  {
    version: '2.14.0',
    date: '2026-02-15',
    changes: [
      'Extract plugin schemas: 6 operator schemas moved to plugins/operators/<name>/schema.json — auto-discovered and merged at load time',
      'cert-manager LetsEncrypt: template-driven ExternalSecret, ClusterIssuer, and Certificate for DNS-01 via Route53',
      'SecretStore bootstrap: Vault ClusterSecretStore script with Kubernetes auth'
    ]
  },
  {
    version: '2.13.0',
    date: '2026-02-14',
    changes: [
      'OCP-on-OCP operators: template-driven LVM, ACM, cert-manager, ArgoCD, external-secrets (hub) and ODF (managed clusters)',
      'KubeVirt SSD udev: install-time MachineConfig forcing virtual disks to report as SSD for ODF — ZTP, CAPI, and ABI',
      'KubeVirt SNO fix: corrected broken flat network keys in example clusterfile'
    ]
  },
  {
    version: '2.12.0',
    date: '2026-02-14',
    changes: [
      'SiteConfig integration: bidirectional clusterfile ↔ ClusterInstance CR conversion templates',
      'ClusterInstance fields: clusterType, cpuPartitioningMode, diskEncryption (Tang), holdInstallation, External platform; per-host bootMode, nodeLabels, automatedCleaningMode, ironicInspect',
      'Template enrichment: ACM ZTP/CAPI consume new per-host fields; install-config cpuPartitioningMode; Tang MachineConfig',
      'DRY BMC URLs: shared bmc-url.yaml.tpl include for vendor-specific Redfish URL construction'
    ]
  },
  {
    version: '2.11.0',
    date: '2026-02-14',
    changes: [
      '6 operator plugins: LVM, ODF, ACM, cert-manager, external-secrets join ArgoCD — smart defaults, optional channel/source/approval',
      'Plugin co-location: operators restructured to plugins/operators/<name>/ with co-located schema + templates',
      'Operators UI: collapsible enable/disable fieldsets per operator in Plugins tab',
      'ACM hub example: full SNO clusterfile with LVM + ACM + cert-manager + ArgoCD (bootstrap) + external-secrets'
    ]
  },
  {
    version: '2.10.0',
    date: '2026-02-14',
    changes: [
      'Operator plugin architecture: plugins.operators with ArgoCD as first operator — argocd: {} for full setup with smart defaults',
      'Plugin isolation: operators and platforms in templates/plugins/ and schema/plugins/ — each self-contained, ready for separate repos',
      'ArgoCD ACM Policy for managed clusters (ZTP + CAPI); extra manifests for standalone (ABI)',
      'ArgoCD bootstrap: app-of-apps pattern for managing further operators from a git repo'
    ]
  },
  {
    version: '2.9.3',
    date: '2026-02-14',
    changes: [
      'Template consolidation: extract shared includes for POC banner and os-images-sync; DRY insecure registries; -69 lines duplication',
      'KubeVirt install-config: kubevirt platform includes for UPI/agent-based installs',
      'Multi-document YAML: fix multi-doc rendering in CLI and UI; wrap as YAML list',
      'Graceful errors: pre-render platform/field validation with actionable messages for CLI and UI'
    ]
  },
  {
    version: '2.9.2',
    date: '2026-02-13',
    changes: [
      'Insecure mirrors: per-mirror insecure flag for self-signed certs and HTTP mirrors',
      'Cluster overview: add TPM, disconnected, insecure, catalog sources, secondary networks, and files required sections'
    ]
  },
  {
    version: '2.9.1',
    date: '2026-02-13',
    changes: [
      'Disconnected clusters: add cluster.disconnected flag and catalogSources for air-gapped installations',
      'Disables default OperatorHub sources, configures custom CatalogSources across ZTP, CAPI, and ABI/IPI'
    ]
  },
  {
    version: '2.9.0',
    date: '2026-02-13',
    changes: [
      'Manifest filename fix: add .yaml extension to extraclustermanifests ConfigMap keys for assisted-service validation'
    ]
  },
  {
    version: '2.8.9',
    date: '2026-02-13',
    changes: [
      'ZTP troubleshoot: comprehensive 15-check diagnostic template for installation progress'
    ]
  },
  {
    version: '2.8.8',
    date: '2026-02-13',
    changes: [
      'Release script fix: use grep instead of rg, push only new release tag'
    ]
  },
  {
    version: '2.8.7',
    date: '2026-02-13',
    changes: [
      'For mirrors, always use mirror in imageContentSource template'
    ]
  },
  {
    version: '2.8.6',
    date: '2026-02-13',
    changes: [
      'ZTP fix: manifestsConfigMapRef moved from ClusterDeployment to AgentClusterInstall'
    ]
  },
  {
    version: '2.8.5',
    date: '2026-02-13',
    changes: [
      'Release script: clusterfile-editor.sh release now runs full ship-it process (sync, commit, tag, push, build, deploy, verify)'
    ]
  },
  {
    version: '2.8.4',
    date: '2026-02-13',
    changes: [
      'TPM disk encryption: updated MachineConfig with cipher options and filesystem wipe',
      'Fix ACM ZTP: moved manifestsConfigMapRef under provisioning key'
    ]
  },
  {
    version: '2.8.3',
    date: '2026-02-12',
    changes: [
      'TPM install-time only: removed ManifestWork — LUKS post-install wipes root disks',
      'POC banner: red ConsoleNotification on all managed clusters (ZTP, CAPI, ABI, IPI)'
    ]
  },
  {
    version: '2.8.2',
    date: '2026-02-12',
    changes: [
      'TPM ManifestWork for post-install delivery (reverted in v2.8.3)'
    ]
  },
  {
    version: '2.8.1',
    date: '2026-02-12',
    changes: [
      'Smart storage: control OS→performance (etcd), worker OS→default, data→performance (ODF)',
      'Compact cluster (≤5 hosts): data disks on control nodes; standard (≥3 workers): on workers',
      'Gap topology (not enough workers for ODF): no data disks provisioned'
    ]
  },
  {
    version: '2.8.0',
    date: '2026-02-12',
    changes: [
      'Cluster-level TPM: cluster.tpm replaces plugins.kubevirt.tpm as platform-agnostic master switch',
      'Enables LUKS disk encryption MachineConfig in ACM/ZTP for any platform (baremetal, kubevirt, etc.)',
      'On kubevirt, automatically adds persistent vTPM device with SMM and UEFI firmware to VMs'
    ]
  },
  {
    version: '2.7.1',
    date: '2026-02-12',
    changes: [
      'Cache busting: static asset URLs dynamically use current app version, no more stale CSS/JS after upgrades'
    ]
  },
  {
    version: '2.7.0',
    date: '2026-02-12',
    changes: [
      'KubeVirt TPM support: persistent TPM 2.0 device on VMs for LUKS disk encryption',
      'imageDigestSources: replace deprecated imageContentSources in install-config (OCP 4.19+)',
      'KubeVirt VLAN networking: VLAN support with restructured VM networking',
      'CUDN Localnet: ClusterUserDefinedNetwork CRD for proper UDN Localnet support',
      'RHCOS osImages: per-cluster osImages ConfigMaps for ZTP/CAPI',
      'osImages sync: event-driven Jobs replace CronJob polling',
      'Fix: RHCOS ISO URL corrected (rhcos-live.iso → rhcos-live-iso.iso)',
      'Fix: baremetal platform include handles SNO without VIPs'
    ]
  },
  {
    version: '2.6.6',
    date: '2026-02-09',
    changes: [
      'UDN Networking: replace linux-bridge NAD with OVN UserDefinedNetwork in kubevirt template'
    ]
  },
  {
    version: '2.6.5',
    date: '2026-02-09',
    changes: [
      'Editable filename: click header filename to rename, persists to localStorage',
      'Page title and downloads use the edited filename'
    ]
  },
  {
    version: '2.6.4',
    date: '2026-02-09',
    changes: [
      'No browser dialogs: all prompt/alert/confirm replaced with inline UI',
      'Inline host add/duplicate/rename with validation, undo toast for remove',
      'Click-twice-to-confirm for destructive actions (new document, revert all)'
    ]
  },
  {
    version: '2.6.3',
    date: '2026-02-08',
    changes: [
      'Tier map editor: uniform key-value list with enum tier name selector + Other',
      'Dynamic tier dropdowns: storageMapping auto-populates from storageClass keys',
      'x-options-from-keys schema annotation for data-driven enum fields'
    ]
  },
  {
    version: '2.6.2',
    date: '2026-02-08',
    changes: [
      'Custom storage class key-value editing with YAML persistence'
    ]
  },
  {
    version: '2.6.1',
    date: '2026-02-07',
    changes: [
      'Storage mapping enums: storageMapping tier fields use enum dropdowns',
      'Validation catches typos in tier labels'
    ]
  },
  {
    version: '2.6.0',
    date: '2026-02-07',
    changes: [
      'KubeVirt platform support: full OpenShift Virtualization cluster provisioning',
      'Machine resource specifications: per-role CPU, memory, storage defaults',
      'Storage class mapping: data-driven tier assignment in plugins.kubevirt',
      'All examples bumped to OpenShift 4.21.0'
    ]
  },
  {
    version: '2.5.8',
    date: '2026-02-06',
    changes: [
      'ACM template cross-links: all 6 ACM templates have relatedTemplates metadata',
      'Bidirectional links for template discovery in the editor UI'
    ]
  },
  {
    version: '2.5.7',
    date: '2026-02-06',
    changes: [
      'ACM ClusterImageSet template matching upstream stolostron format',
      'Mirror-aware releaseImage for disconnected environments',
      'ACM ClusterImageSets subscription template for connected auto-sync'
    ]
  },
  {
    version: '2.5.6',
    date: '2026-02-06',
    changes: [
      'Green "Local only" privacy badge in header with lock icon',
      'Privacy & Trust section: data locality, credential handling, auditable output, deployment options',
      'Enhanced file-path field tooltips reinforcing local-only processing'
    ]
  },
  {
    version: '2.5.5',
    date: '2026-02-06',
    changes: [
      'Pre-check templates restructured: body includes + composable master',
      'Check logic deduplicated into includes/pre-check/ body files',
      'Standalone modules are thin wrappers, master composes all via include'
    ]
  },
  {
    version: '2.5.4',
    date: '2026-02-06',
    changes: [
      'api-int DNS record as CNAME pointing to api record',
      'Network capacity calculations: pods/node, max nodes, service addresses, usable hosts',
      'NIC name and MAC address grouped in nested table to prevent wrapping'
    ]
  },
  {
    version: '2.5.3',
    date: '2026-02-06',
    changes: [
      'One-click Preview button in header bar for cluster overview',
      'Renders current clusterfile as HTML overview and opens in new tab'
    ]
  },
  {
    version: '2.5.2',
    date: '2026-02-06',
    changes: [
      'Self-contained HTML cluster overview with dark mode, print styles, responsive layout',
      'Preview button opens HTML templates in a new browser tab',
      'Documentation category in template dropdown'
    ]
  },
  {
    version: '2.5.1',
    date: '2026-02-06',
    changes: [
      'Restyle remaining 7 templates with YAML-leading style and whitespace flags',
      'New cluster-overview.md.tpl for customer-facing cluster documentation',
      'Adapts to platform: detailed host cards (baremetal) or compact table (IPI)'
    ]
  },
  {
    version: '2.5.0',
    date: '2026-02-06',
    changes: [
      'All 18 platform templates restyled: YAML structure leads, Jinja hides inline',
      'Robustness defaults for all controlPlane/compute templates (agent-based safe)',
      'Added ksushy and kubevirt-redfish to BMC vendor enum'
    ]
  },
  {
    version: '2.4.7',
    date: '2026-02-05',
    changes: [
      'Fix bond string values like "802.3ad" being coerced to numbers',
      'Disabled now omits the key from config instead of writing false',
      'MTU validation uses anyOf to avoid oneOf overlap'
    ]
  },
  {
    version: '2.4.6',
    date: '2026-02-05',
    changes: [
      'MTU field now uses dropdown: Default (1500), Jumbo (9000), Custom, or Disabled',
      'Custom option allows manual entry (576-9216)',
      'Disabled option omits MTU from config (uses system default)'
    ]
  },
  {
    version: '2.4.5',
    date: '2026-02-05',
    changes: [
      'Added robust schema handling utilities (safeResolveSchema, getSchemaArray)',
      'Resolve $refs in all schema accesses (renderField, renderObjectFields, etc.)',
      'Added defensive null/undefined guards throughout form rendering'
    ]
  },
  {
    version: '2.4.4',
    date: '2026-02-05',
    changes: [
      'Fix plugin forms: resolve $refs in anyOf/oneOf before type detection',
      'Fix bond/vlan toggle: mode selector now properly detects enum options with $ref',
      'Fix pull secret validation: check for .auths key instead of just valid JSON'
    ]
  },
  {
    version: '2.4.3',
    date: '2026-02-04',
    changes: [
      'Fixed CHANGELOG array in app.js to include 2.4.1 and 2.4.2 releases'
    ]
  },
  {
    version: '2.4.2',
    date: '2026-02-04',
    changes: [
      'Refactored pre-check.sh into standalone modular templates',
      'Added pre-check-files.sh.tpl for pull secret, SSH keys, trust bundle validation',
      'Added pre-check-dns.sh.tpl for DNS forward/reverse and resolver checks',
      'Added pre-check-network.sh.tpl for host, gateway, VIP, and proxy checks',
      'Added pre-check-ntp.sh.tpl, pre-check-registry.sh.tpl, pre-check-bmc.sh.tpl',
      'Master pre-check.sh.tpl now composes all modules with conditional rendering'
    ]
  },
  {
    version: '2.4.1',
    date: '2026-02-04',
    changes: [
      'Added pre-check.sh.tpl for pre-installation verification',
      'Added relatedTemplates metadata linking companion templates',
      'Fixed download filename extension for rendered templates',
      'Fixed test imports and assertions'
    ]
  },
  {
    version: '2.4.0',
    date: '2026-02-04',
    changes: [
      'Added template metadata with @meta blocks for type, category, platforms, requires, and docs',
      'Template dropdown now groups templates by category and filters to clusterfile types only',
      'Added vSphere IPI static IP support in install-config.yaml.tpl',
      'Dynamic version display in browser title and header (fetched from API)',
      'Template selection shows metadata: supported platforms, required fields, documentation links'
    ]
  },
  {
    version: '2.3.1',
    date: '2026-02-03',
    changes: [
      'Simplified Templates page with platform info display card',
      'Added "Change" link to navigate to Cluster section',
      'Added "Load Credentials Template" button for cloud platforms',
      'Updated template descriptions for unified templates'
    ]
  },
  {
    version: '2.3.0',
    date: '2026-02-03',
    changes: [
      'Consolidated 7 install-config templates into unified install-config.yaml.tpl',
      'Added dynamic platform includes for all IPI platforms',
      'Added unified creds.yaml.tpl for CCO credential generation',
      'Added Nutanix platform support',
      'Added comprehensive test suite with 57 tests'
    ]
  },
  {
    version: '2.2.2',
    date: '2026-02-03',
    changes: [
      'Added cross-navigation links between Plugins and Cluster sections',
      'Added resizable split view with localStorage persistence',
      'Filter Plugins section to show only platform-specific plugin',
      'Added support for all IPI platforms (AWS, Azure, GCP, OpenStack, IBM Cloud)',
      'Added vSphere IPI support with failure domains'
    ]
  },
  {
    version: '2.1.0',
    date: '2026-02-03',
    changes: [
      'Added Template and Rendered tabs for full-page template viewing',
      'Auto-load template source when selecting from dropdown',
      'Auto-render with parameter highlighting showing changed lines',
      'Improved Changes section with grouped changes and clickable links',
      'Fixed form focus loss when editing YAML',
      'Enhanced filename display with modification indicator',
      'Real-time validation and change badge updates'
    ]
  },
  {
    version: '2.0.0',
    date: '2026-02-03',
    changes: [
      'Complete rewrite with modern OpenShift 4.20 UI styling',
      'Schema-driven form generation from JSON Schema',
      'Two-way YAML ↔ Form synchronization',
      'Client-side AJV validation with custom formats',
      'Change tracking with baseline/current/diff comparison',
      'Browser localStorage persistence for session state',
      'Jinja2 template rendering with parameter overrides',
      'Help system with documentation links',
      'SVG icons replacing emoji for modern appearance'
    ]
  }
];

/**
 * Initialize the application
 */
async function init() {
  console.log('Initializing Clusterfile Editor v2.1');

  // Load saved state (hash overrides localStorage section)
  const saved = State.loadFromLocalStorage();
  State.state.mode = saved.mode;
  const hashSection = getHashSection();
  // Deep link sections (templates, rendered) both map to 'templates' sidebar
  const resolvedSection = (hashSection === 'rendered') ? 'templates' : hashSection;
  State.state.currentSection = resolvedSection || saved.section;
  State.state.currentFilename = saved.filename;

  // Fetch schema
  try {
    const schema = await fetchSchema();
    State.state.schema = schema;
    const validatorInitialized = Validator.initValidator(schema);
    console.log('Validator initialized:', validatorInitialized);
    if (!validatorInitialized) {
      console.warn('Validator failed to initialize - validation will be skipped');
    }
  } catch (e) {
    console.error('Failed to load schema:', e);
    showToast('Failed to load schema', 'error');
  }

  // Fetch samples, templates, and version
  try {
    const [samples, templates, versionInfo] = await Promise.all([
      fetchSamples(),
      fetchTemplates(),
      fetchVersion()
    ]);
    State.state.samples = samples;
    State.state.templates = templates;
    if (versionInfo?.version) {
      APP_VERSION = versionInfo.version;
    }
  } catch (e) {
    console.error('Failed to load samples/templates:', e);
  }

  // Initialize UI
  initUI();

  // Detect whether the container has a /content mount and wire the toggle.
  // Render APIs default include_content=false; toggle flips it per session.
  fetchContentStatus().then(applyContentStatus);

  // Detect /cache mount + binary cache for the agent ISO download button.
  fetchAgentIsoStatus().then(applyAgentIsoStatus);

  // In-memory uploaded files (Q2): on add/remove, refresh the rendered pane
  // and the small indicator next to the bundle-info row.
  document.addEventListener('uploadedFilesChanged', () => {
    refreshUploadedFilesIndicator();
    if (typeof refreshRendered === 'function') refreshRendered();
    if (typeof refreshAgentIsoButton === 'function') refreshAgentIsoButton();
  });
  refreshUploadedFilesIndicator();

  // Update version display in header
  updateVersionDisplay();

  // Restore saved document with preserved baseline and changes
  if (saved.yaml) {
    // If we have a saved baseline, use it; otherwise use current as baseline
    const baseline = saved.baseline || saved.yaml;
    State.setBaseline(baseline);
    State.updateCurrent(saved.yaml, 'restore');
    State.state.currentFilename = saved.filename;
    CodeMirror.setEditorValue(saved.yaml, false);
    updateHeader();
    renderCurrentSection();

    // Restore scroll position after render
    if (saved.scrollPosition && saved.scrollPosition.section === saved.section) {
      setTimeout(() => {
        const formContent = document.getElementById('form-content');
        if (formContent) {
          formContent.scrollTop = saved.scrollPosition.form || 0;
        }
      }, 100);
    }
  } else {
    // First visit (or cleared storage): load SNO starter so the form is
    // not an empty {} skeleton. The welcome modal lets users switch
    // topology if they need Compact / Full / Blank instead.
    loadStarter('start-sno.clusterfile').catch(() => newDocument());
  }

  // Show welcome tour on first visit
  if (!State.isTourShown()) {
    showWelcomeTour();
  }

  // Set up auto-save (every 5 seconds for better persistence)
  setInterval(() => {
    State.saveToLocalStorage();
  }, 5000);

  // Also save on page unload
  window.addEventListener('beforeunload', () => {
    State.saveToLocalStorage();
  });

  console.log('Initialization complete');
}

/**
 * Initialize UI components
 */
function initUI() {
  // Set up navigation
  setupNavigation();

  // Set up mode toggle
  setupModeToggle();

  // Set up header actions
  setupHeaderActions();

  // Initialize YAML editor
  const editorContainer = document.getElementById('yaml-editor');
  if (editorContainer) {
    const cm = CodeMirror.initYamlEditor(editorContainer);
    CodeMirror.setupEditorSync(onYamlChange);
    // Re-render form when editor loses focus so edits are reflected
    if (cm) {
      cm.on('blur', () => {
        if (formNeedsRefresh) {
          formNeedsRefresh = false;
          renderCurrentSection();
        }
      });
    }
  }

  // Initialize template source editor (read-only)
  const templateSourceContainer = document.getElementById('template-source-editor');
  if (templateSourceContainer) {
    CodeMirror.initTemplateEditor(templateSourceContainer);
  }

  // Initialize rendered output editor (read-only)
  const renderedContainer = document.getElementById('rendered-output-editor');
  if (renderedContainer) {
    CodeMirror.initRenderedEditor(renderedContainer);
  }

  // Set up form change callback
  Form.setFormChangeCallback(onFormChange);

  // Set up file input
  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileLoad);
  }

  // Set up keyboard shortcuts
  setupKeyboardShortcuts();

  // Set up tab navigation
  setupTabs();

  // Set up resizable split view
  setupSplitView();

  // Set up template buttons (they're in static HTML)
  setupTemplateButtons();

  // Populate dropdowns
  populateSamplesDropdown();
  populateTemplatesDropdown();

  // Update header
  updateHeader();

  // Initial render
  updateModeUI();
  renderCurrentSection();
}

/**
 * Set up sidebar navigation
 */
function setupNavigation() {
  const navItems = document.querySelectorAll('.sidebar-nav__item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      if (section) {
        navigateToSection(section);
      }
    });

    // Set active state based on current section
    item.classList.toggle('sidebar-nav__item--active', item.dataset.section === State.state.currentSection);
  });
}

/**
 * Parse section (and optional sub-tab) from URL hash
 */
function getHashSection() {
  const hash = window.location.hash.replace(/^#/, '').split('?')[0];
  return hash.split('/')[0] || '';
}

function getHashSubTab() {
  const hash = window.location.hash.replace(/^#/, '').split('?')[0];
  return hash.split('/')[1] || '';
}

function getHashParams() {
  const hash = window.location.hash.replace(/^#/, '');
  const qIdx = hash.indexOf('?');
  if (qIdx === -1) return {};
  return Object.fromEntries(new URLSearchParams(hash.slice(qIdx + 1)));
}

/**
 * Build a URL hash from current app state
 * Format: #section[/tab][?template=...&sample=...]
 */
function buildEditorHash(section, tab) {
  section = section || State.state.currentSection || 'account';
  tab = tab || getActiveEditorTab();
  let hash = '#' + section;
  // Editor tabs as sub-paths (yaml is the default, no sub-path needed)
  if (section === 'templates' && tab && tab !== 'yaml') {
    hash += '/' + tab;
  }
  // About sub-tabs are handled separately in renderAboutSection
  // Append query params for template-related views
  if (section === 'templates') {
    const qp = new URLSearchParams();
    const tpl = State.state.selectedTemplate || document.getElementById('template-select')?.value;
    if (tpl) qp.set('template', tpl);
    const filename = State.state.currentFilename;
    if (filename && filename !== 'untitled.clusterfile') qp.set('sample', filename);
    const qs = qp.toString();
    if (qs) hash += '?' + qs;
  }
  return hash;
}

/**
 * Get the currently active editor tab
 */
function getActiveEditorTab() {
  const active = document.querySelector('.tabs[data-tab-group="editor"] .tab--active');
  return active?.dataset?.tab || 'yaml';
}

/**
 * Update URL hash to reflect current app state (replaceState to avoid flooding history)
 */
function updateEditorHash() {
  const hash = buildEditorHash();
  if (window.location.hash !== hash) {
    history.replaceState(null, '', hash);
  }
}

function navigateFromHash() {
  const section = getHashSection() || 'account';
  const resolvedSection = (section === 'rendered') ? 'templates' : section;
  navigateToSection(resolvedSection, { _fromHash: true });
  // Restore editor tab from sub-path
  const subTab = getHashSubTab();
  const editorTab = (section === 'rendered') ? 'rendered' : (subTab || 'yaml');
  if (editorTab && editorTab !== 'yaml') {
    const tabBtn = document.querySelector(`.tab[data-tab="${editorTab}"]`);
    if (tabBtn) tabBtn.click();
  }
}

// Back/forward button support
window.addEventListener('popstate', navigateFromHash);

/**
 * Navigate to a section
 */
function navigateToSection(section, opts = {}) {
  State.state.currentSection = section;

  // Update nav active state
  document.querySelectorAll('.sidebar-nav__item').forEach(item => {
    item.classList.toggle('sidebar-nav__item--active', item.dataset.section === section);
  });

  // Render section
  renderCurrentSection();

  // Update URL hash (skip during popstate to avoid duplicate entries)
  if (!opts._fromHash) {
    const hash = buildEditorHash(section);
    if (window.location.hash !== hash) {
      history.pushState(null, '', hash);
    }
  }

  // Save section to localStorage immediately
  localStorage.setItem(State.STORAGE_KEYS.CURRENT_SECTION, section);
}

/**
 * Set up resizable split view
 */
function setupSplitView() {
  const splitView = document.getElementById('split-view');
  const divider = document.getElementById('split-divider');
  const formPane = document.getElementById('form-pane');
  const editorPane = document.getElementById('editor-pane');

  if (!splitView || !divider || !formPane || !editorPane) {
    console.warn('Split view elements not found');
    return;
  }

  const STORAGE_KEY = 'clusterfile-editor-split-position';
  const MIN_PANE_WIDTH = 250; // Minimum width in pixels
  const DEFAULT_SPLIT = 50; // Default split percentage

  // Restore saved position
  const savedPosition = localStorage.getItem(STORAGE_KEY);
  if (savedPosition) {
    const percent = parseFloat(savedPosition);
    if (percent >= 20 && percent <= 80) {
      formPane.style.flex = `0 0 ${percent}%`;
    }
  }

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  const startDrag = (e) => {
    isDragging = true;
    startX = e.clientX || e.touches?.[0]?.clientX || 0;
    startWidth = formPane.getBoundingClientRect().width;

    splitView.classList.add('split-view--dragging');
    divider.classList.add('split-view__divider--dragging');

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('touchend', stopDrag);

    e.preventDefault();
  };

  const onDrag = (e) => {
    if (!isDragging) return;

    const clientX = e.clientX || e.touches?.[0]?.clientX || 0;
    const deltaX = clientX - startX;
    const containerWidth = splitView.getBoundingClientRect().width;
    const dividerWidth = divider.getBoundingClientRect().width;

    let newWidth = startWidth + deltaX;

    // Apply constraints
    newWidth = Math.max(MIN_PANE_WIDTH, newWidth);
    newWidth = Math.min(containerWidth - MIN_PANE_WIDTH - dividerWidth, newWidth);

    // Convert to percentage
    const percent = (newWidth / containerWidth) * 100;
    formPane.style.flex = `0 0 ${percent}%`;

    // Refresh CodeMirror editors to handle resize
    if (window.ClusterfileEditor?.CodeMirror?.refreshEditors) {
      window.ClusterfileEditor.CodeMirror.refreshEditors();
    }

    e.preventDefault();
  };

  const stopDrag = () => {
    if (!isDragging) return;

    isDragging = false;
    splitView.classList.remove('split-view--dragging');
    divider.classList.remove('split-view__divider--dragging');

    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', onDrag);
    document.removeEventListener('touchend', stopDrag);

    // Save position to localStorage
    const containerWidth = splitView.getBoundingClientRect().width;
    const formWidth = formPane.getBoundingClientRect().width;
    const percent = (formWidth / containerWidth) * 100;
    localStorage.setItem(STORAGE_KEY, percent.toFixed(1));

    // Final refresh of CodeMirror editors
    if (window.ClusterfileEditor?.CodeMirror?.refreshEditors) {
      window.ClusterfileEditor.CodeMirror.refreshEditors();
    }
  };

  // Double-click to reset to default
  divider.addEventListener('dblclick', () => {
    formPane.style.flex = `0 0 ${DEFAULT_SPLIT}%`;
    localStorage.setItem(STORAGE_KEY, DEFAULT_SPLIT.toString());
    if (window.ClusterfileEditor?.CodeMirror?.refreshEditors) {
      window.ClusterfileEditor.CodeMirror.refreshEditors();
    }
  });

  divider.addEventListener('mousedown', startDrag);
  divider.addEventListener('touchstart', startDrag, { passive: false });
}

/**
 * Set up mode toggle
 */
function setupModeToggle() {
  const guidedBtn = document.getElementById('mode-guided');
  const advancedBtn = document.getElementById('mode-advanced');

  if (guidedBtn) {
    guidedBtn.addEventListener('click', () => setMode('guided'));
  }
  if (advancedBtn) {
    advancedBtn.addEventListener('click', () => setMode('advanced'));
  }
}

/**
 * Set editor mode
 */
function setMode(mode) {
  State.state.mode = mode;
  updateModeUI();
  localStorage.setItem(State.STORAGE_KEYS.MODE, mode);
}

/**
 * Update UI based on mode
 */
function updateModeUI() {
  const mode = State.state.mode;
  const formPane = document.querySelector('.split-view__pane--form');
  const editorPane = document.querySelector('.split-view__pane--editor');

  document.getElementById('mode-guided')?.classList.toggle('mode-toggle__btn--active', mode === 'guided');
  document.getElementById('mode-advanced')?.classList.toggle('mode-toggle__btn--active', mode === 'advanced');

  if (formPane && editorPane) {
    if (mode === 'guided') {
      formPane.style.display = 'flex';
      editorPane.style.flex = '1';
    } else {
      formPane.style.display = 'none';
      editorPane.style.flex = '1';
    }
  }

  // Refresh editor when becoming visible
  setTimeout(() => CodeMirror.refreshEditor(), 100);
}

/**
 * Set up header action buttons
 */
function setupHeaderActions() {
  // New button — show starter picker modal
  document.getElementById('btn-new')?.addEventListener('click', showNewDocumentModal);

  // Load button
  document.getElementById('btn-load')?.addEventListener('click', () => {
    document.getElementById('file-input')?.click();
  });

  // Save button
  document.getElementById('btn-save')?.addEventListener('click', () => {
    State.saveToLocalStorage();
    showToast('Saved to browser storage', 'success');
  });

  // Download button
  document.getElementById('btn-download')?.addEventListener('click', downloadDocument);

  // Preview overview button
  document.getElementById('btn-preview-overview')?.addEventListener('click', previewClusterOverview);

  // Feedback button
  document.getElementById('btn-feedback')?.addEventListener('click', openFeedback);

  // Samples dropdown
  document.getElementById('btn-samples')?.addEventListener('click', (e) => {
    const dropdown = e.target.closest('.dropdown');
    dropdown?.classList.toggle('dropdown--open');
  });

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
      document.querySelectorAll('.dropdown--open').forEach(d => d.classList.remove('dropdown--open'));
    }
  });
}

/**
 * Set up keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      State.saveToLocalStorage();
      showToast('Saved', 'success');
    }

    // Ctrl/Cmd + O to load
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      document.getElementById('file-input')?.click();
    }
  });
}

/**
 * Set up tab navigation
 */
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabGroup = tab.closest('.tabs')?.dataset.tabGroup;
      const tabId = tab.dataset.tab;

      if (tabGroup && tabId) {
        // Update active tab
        document.querySelectorAll(`.tabs[data-tab-group="${tabGroup}"] .tab`).forEach(t => {
          t.classList.toggle('tab--active', t.dataset.tab === tabId);
        });

        // Update active content
        document.querySelectorAll(`.tab-content[data-tab-group="${tabGroup}"]`).forEach(c => {
          c.classList.toggle('tab-content--active', c.dataset.tab === tabId);
        });

        // Refresh appropriate editor when switching tabs
        if (tabId === 'yaml') {
          setTimeout(() => CodeMirror.refreshEditor(), 100);
        } else if (tabId === 'template') {
          setTimeout(() => CodeMirror.refreshTemplateEditor(), 100);
          if (State.state.currentSection !== 'templates') {
            navigateToSection('templates');
          }
        } else if (tabId === 'rendered') {
          setTimeout(() => CodeMirror.refreshRenderedEditor(), 100);
          if (State.state.currentSection !== 'templates') {
            navigateToSection('templates');
          }
          refreshRendered();
        }
        // Always sync URL to reflect current tab
        updateEditorHash();

        // Update diff view when switching to diff tab
        if (tabId === 'diff') {
          updateDiffView();
        }
      }
    });
  });
}

/**
 * Update the diff view
 */
function updateDiffView() {
  const diffContainer = document.getElementById('diff-view');
  if (!diffContainer) return;

  const baseline = State.state.baselineYamlText;
  const current = State.state.currentYamlText;

  if (baseline === current) {
    diffContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="color: var(--pf-global--success-color--100)">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22,4 12,14.01 9,11.01"/>
          </svg>
        </div>
        <div class="empty-state__title">No changes</div>
        <div class="empty-state__description">Your document matches the baseline.</div>
      </div>
    `;
    return;
  }

  // Use diff library if available
  if (window.Diff) {
    const diff = Diff.createTwoFilesPatch(
      'baseline',
      'current',
      baseline,
      current,
      'Original',
      'Modified'
    );

    const lines = diff.split('\n');
    const html = lines.map(line => {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        return `<div class="diff-line diff-line--add">${Help.escapeHtml(line)}</div>`;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        return `<div class="diff-line diff-line--remove">${Help.escapeHtml(line)}</div>`;
      } else if (line.startsWith('@@')) {
        return `<div class="diff-line diff-line--header">${Help.escapeHtml(line)}</div>`;
      } else {
        return `<div class="diff-line">${Help.escapeHtml(line)}</div>`;
      }
    }).join('');

    diffContainer.innerHTML = html;
  } else {
    // Fallback: simple line-by-line comparison
    const baselineLines = baseline.split('\n');
    const currentLines = current.split('\n');
    let html = '';

    const maxLen = Math.max(baselineLines.length, currentLines.length);
    for (let i = 0; i < maxLen; i++) {
      const baseLine = baselineLines[i] || '';
      const currLine = currentLines[i] || '';

      if (baseLine !== currLine) {
        if (baseLine) {
          html += `<div class="diff-line diff-line--remove">- ${Help.escapeHtml(baseLine)}</div>`;
        }
        if (currLine) {
          html += `<div class="diff-line diff-line--add">+ ${Help.escapeHtml(currLine)}</div>`;
        }
      } else {
        html += `<div class="diff-line">  ${Help.escapeHtml(baseLine)}</div>`;
      }
    }

    diffContainer.innerHTML = html;
  }
}

/**
 * Render the current section
 */
function renderCurrentSection() {
  const section = State.state.currentSection;
  const container = document.getElementById('form-content');

  if (!container) return;

  if (section === 'templates') {
    renderTemplatesSection(container);
  } else if (section === 'changes') {
    renderChangesSection(container);
  } else if (section === 'validation') {
    renderValidationSection(container);
  } else if (section === 'todo') {
    renderTodoSection(container);
  } else if (section === 'changelog') {
    renderChangelogSection(container);
  } else if (section === 'privacy') {
    renderPrivacySection(container);
  } else if (section === 'guide') {
    renderGuideSection(container);
  } else if (section === 'about') {
    renderAboutSection(container);
  } else {
    Form.renderSection(section, container);
    renderReadyToRenderHint(container);
  }

  // Update badges
  updateValidationBadge();
  updateTodoBadge();
  updateChangesBadge();
}

/**
 * Inject a single "next step" hint at the top of a form section. Content
 * depends on document state — there is always exactly one CTA, never
 * two competing ones.
 *
 *   Todo > 0                      → "X placeholders left — view Todo →"
 *   Todo = 0, Validation > 0      → "All placeholders filled. Y validation issues to fix →"
 *   Both 0                        → "Ready. Render <bundle> bundle →"
 */
function renderReadyToRenderHint(container) {
  const todoCount = findPlaceholders(State.state.currentObject || {}).length;
  const validationCount = (State.state.validationErrors || []).length
    + (State.state.renderWarnings || []).length;
  const installMethod = State.getNestedValue(State.state.currentObject, 'cluster.installMethod');

  let hintClass, message, ctaLabel, ctaSection;
  if (todoCount > 0) {
    hintClass = 'next-step-hint next-step-hint--todo';
    message   = `${todoCount} placeholder${todoCount === 1 ? '' : 's'} to replace before rendering.`;
    ctaLabel  = 'View Todo →';
    ctaSection = 'todo';
  } else if (validationCount > 0) {
    hintClass = 'next-step-hint next-step-hint--validation';
    message   = `All placeholders filled. ${validationCount} validation issue${validationCount === 1 ? '' : 's'} to fix.`;
    ctaLabel  = 'View Validation →';
    ctaSection = 'validation';
  } else {
    hintClass = 'next-step-hint next-step-hint--ready';
    const bundleLabel = installMethod ? `${installMethod} bundle` : 'a template';
    message   = `Ready. Render ${bundleLabel}.`;
    ctaLabel  = 'Open Templates →';
    ctaSection = 'templates';
  }

  const hint = document.createElement('div');
  hint.className = hintClass;
  hint.innerHTML = `
    <span>${Help.escapeHtml(message)}</span>
    <button class="btn btn--primary" id="next-step-btn">${Help.escapeHtml(ctaLabel)}</button>
  `;
  container.insertBefore(hint, container.firstChild);
  document.getElementById('next-step-btn')?.addEventListener('click', () => {
    navigateToSection(ctaSection);
  });
}

/**
 * Render templates section
 */
function renderTemplatesSection(container) {
  // Get current platform from state
  const currentPlatform = State.getNestedValue(State.state.currentObject, 'cluster.platform') || '';
  const platformInfo = PLATFORM_INFO[currentPlatform];
  const hasCreds = PLATFORM_CREDS_TEMPLATES[currentPlatform];

  // Filter templates to only show clusterfile templates
  const clusterfileTemplates = State.state.templates.filter(t => t.type === 'clusterfile');

  // Group templates by bundle (templates can belong to multiple bundles —
  // list under each so picking from any group works). Templates with no
  // bundle land in a "Single templates" catch-all so power users can still
  // render arbitrary individual templates without leaving bundle mode.
  const bundleOrder = ['agent', 'acm-hub', 'acm-ztp', 'capi', 'utility'];
  const bundleLabels = {
    agent:     'Agent installer bundle',
    'acm-hub': 'ACM hub bundle',
    'acm-ztp': 'ACM ZTP managed-cluster bundle',
    capi:      'CAPI / Metal3 bundle',
    utility:   'Utility templates'
  };
  const byBundle = { __none__: [] };
  bundleOrder.forEach(b => { byBundle[b] = []; });
  clusterfileTemplates.forEach(t => {
    const bundles = (t.bundle || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!bundles.length) {
      byBundle.__none__.push(t);
    } else {
      bundles.forEach(b => {
        if (!byBundle[b]) byBundle[b] = [];
        byBundle[b].push(t);
      });
    }
  });
  // Sort each bundle by bundleOrder then filename so optgroups read in
  // pipeline order (install-config first, etc.).
  Object.keys(byBundle).forEach(b => {
    byBundle[b].sort((a, c) =>
      (a.bundleOrder ?? 99) - (c.bundleOrder ?? 99)
      || ((a.filename || a.name) > (c.filename || c.name) ? 1 : -1)
    );
  });

  // Build template options. Each bundle group leads with a "View entire
  // bundle" pseudo-option (value __bundle__:<name>) that switches the
  // Rendered pane to bundle mode. Other options pick a single template and
  // exit bundle mode (handled in templateSelect change handler).
  let templateOptions = '<option value="">— Select template or bundle —</option>';
  bundleOrder.forEach(b => {
    if (!byBundle[b].length) return;
    templateOptions += `<optgroup label="${bundleLabels[b] || b}">`;
    templateOptions += `<option value="__bundle__:${b}">▸ View entire ${bundleLabels[b] || b} (${byBundle[b].length} files)</option>`;
    byBundle[b].forEach(t => {
      const filename = t.filename || t.name;
      templateOptions += `<option value="${Help.escapeHtml(filename)}">${Help.escapeHtml(t.name)} — ${Help.escapeHtml(t.description)}</option>`;
    });
    templateOptions += '</optgroup>';
  });
  // Bundles outside the canonical list (operators etc.) still get a group.
  Object.keys(byBundle).forEach(b => {
    if (b === '__none__' || bundleOrder.includes(b) || !byBundle[b].length) return;
    templateOptions += `<optgroup label="${bundleLabels[b] || b}">`;
    templateOptions += `<option value="__bundle__:${b}">▸ View entire ${b} bundle (${byBundle[b].length} files)</option>`;
    byBundle[b].forEach(t => {
      const filename = t.filename || t.name;
      templateOptions += `<option value="${Help.escapeHtml(filename)}">${Help.escapeHtml(t.name)} — ${Help.escapeHtml(t.description)}</option>`;
    });
    templateOptions += '</optgroup>';
  });
  // Templates not in any bundle.
  if (byBundle.__none__.length) {
    templateOptions += `<optgroup label="Single templates (no bundle)">`;
    byBundle.__none__.forEach(t => {
      const filename = t.filename || t.name;
      templateOptions += `<option value="${Help.escapeHtml(filename)}">${Help.escapeHtml(t.name)} — ${Help.escapeHtml(t.description)}</option>`;
    });
    templateOptions += '</optgroup>';
  }

  // The install bundle (if cluster.installMethod is set) is rendered as
  // nested tabs inside the Rendered tab on the right pane — see
  // renderInstallBundleTabs(). The Templates form section here keeps the
  // single-template select for utility templates and power users.
  const installMethod = State.getNestedValue(State.state.currentObject, 'cluster.installMethod');
  const clusterRole   = State.getNestedValue(State.state.currentObject, 'cluster.clusterRole') || 'standalone';

  container.innerHTML = `
    <div class="template-panel">
      <div class="form-section">
        <h2 class="form-section__title">Template Selection</h2>

        <div class="form-group platform-display">
          <label class="form-label">Current Platform</label>
          <div class="platform-info-card">
            <svg class="platform-info-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              ${platformInfo?.icon === 'cloud' ? `
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
              ` : `
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                <line x1="6" y1="6" x2="6.01" y2="6"/>
                <line x1="6" y1="18" x2="6.01" y2="18"/>
              `}
            </svg>
            <div class="platform-info-card__content">
              <span class="platform-info-card__name">${platformInfo ? Help.escapeHtml(platformInfo.name) : 'Not configured'}</span>
              <span class="platform-info-card__desc">${platformInfo ? Help.escapeHtml(platformInfo.description) : 'Set platform in Cluster section'}</span>
            </div>
            <a href="#" class="platform-info-card__link" id="change-platform-link">Change</a>
          </div>
        </div>

        <div class="form-group template-select">
          <label class="form-label">Template</label>
          <select class="form-select" id="template-select">
            ${templateOptions}
          </select>
          <div class="template-meta" id="template-meta"></div>
        </div>

        <div class="form-group" id="related-templates-group" style="display: none;">
          <label class="form-label">Related Templates</label>
          <div class="related-templates" id="related-templates-list">
            <!-- Populated dynamically based on template metadata -->
          </div>
        </div>

        <div class="form-group template-params">
          <label class="form-label">Parameter Overrides</label>
          <div id="template-params-list"></div>
          <button class="btn btn--secondary btn--sm" id="add-param-btn">+ Add Parameter</button>
        </div>

        <div class="template-info" style="margin-top: 16px;">
          <div class="alert alert--info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span>Select a template and switch to "Rendered" tab to see output.</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Render the install bundle as nested tabs inside the Rendered tab pane.
  if (installMethod) {
    renderInstallBundleTabs(installMethod, clusterRole);
  } else {
    clearInstallBundleTabs();
  }

  // Set up change platform link
  document.getElementById('change-platform-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.ClusterfileEditor.navigateToSection('cluster');
  });

  // Related template click handler is set up dynamically in template change handler

  // Set up template select event listener
  const templateSelect = document.getElementById('template-select');
  const paramsContainer = document.getElementById('template-params-list');

  templateSelect?.addEventListener('change', async () => {
    const templateName = templateSelect.value;

    // "▸ View entire <bundle>" pseudo-options have value `__bundle__:<name>`.
    // Selecting one switches the Rendered pane to bundle mode for that
    // bundle, then exits without loading a single-template source.
    if (templateName && templateName.startsWith('__bundle__:')) {
      const bundle = templateName.slice('__bundle__:'.length);
      const role = State.getNestedValue(State.state.currentObject, 'cluster.clusterRole') || 'standalone';
      State.state.renderedMode = 'bundle';
      State.state.activeBundleIndex = 0;
      // Treat it as the user's chosen bundle for this session even if it
      // differs from cluster.installMethod.
      State.state.installMethod = bundle;
      State.state.clusterRole   = role;
      const renderedTab = document.querySelector('.tab[data-tab="rendered"]');
      if (renderedTab) renderedTab.click();
      renderInstallBundleTabs(bundle, role);
      // Reset selector so the pseudo-option doesn't stick as the visible value.
      templateSelect.value = '';
      return;
    }

    // Picking a real template enters single-template mode and removes the
    // bundle tabs row so the Rendered pane unambiguously shows that file.
    if (templateName) {
      State.state.renderedMode = 'single';
      clearInstallBundleTabs();
    }
    const template = State.state.templates.find(t => (t.filename || t.name) === templateName);
    const metaContainer = document.getElementById('template-meta');

    // Show template metadata
    if (template && metaContainer) {
      let metaHtml = '';
      if (template.platforms?.length) {
        metaHtml += `<div class="template-meta__item"><strong>Platforms:</strong> ${template.platforms.join(', ')}</div>`;
      }
      if (template.requires?.length) {
        metaHtml += `<div class="template-meta__item"><strong>Requires:</strong> ${template.requires.slice(0, 5).join(', ')}${template.requires.length > 5 ? '...' : ''}</div>`;
      }
      if (template.docs) {
        metaHtml += `<div class="template-meta__item"><a href="${Help.escapeHtml(template.docs)}" target="_blank" rel="noopener">Documentation ↗</a></div>`;
      }
      metaContainer.innerHTML = metaHtml;
    } else if (metaContainer) {
      metaContainer.innerHTML = '';
    }

    // Show related templates from metadata
    const relatedGroup = document.getElementById('related-templates-group');
    const relatedList = document.getElementById('related-templates-list');
    if (template?.relatedTemplates?.length && relatedGroup && relatedList) {
      relatedGroup.style.display = 'block';
      relatedList.innerHTML = template.relatedTemplates.map(rt => {
        const relatedTemplate = State.state.templates.find(t => (t.filename || t.name) === rt);
        const description = relatedTemplate?.description || rt;
        const icon = getTemplateIcon(relatedTemplate?.category || 'other');
        return `
          <button class="btn btn--secondary btn--sm related-template-btn" data-template="${Help.escapeHtml(rt)}">
            ${icon}
            <span>${Help.escapeHtml(relatedTemplate?.name || rt)}</span>
          </button>
        `;
      }).join('');

      // Add click handlers for related template buttons
      relatedList.querySelectorAll('.related-template-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const tplName = btn.dataset.template;
          const select = document.getElementById('template-select');
          if (select) {
            select.value = tplName;
            select.dispatchEvent(new Event('change'));
          }
        });
      });
    } else if (relatedGroup) {
      relatedGroup.style.display = 'none';
    }

    // Auto-load template source when selected
    if (templateName) {
      await loadTemplateSource(templateName);
      updatePreviewButton(templateName);
      // Switch to rendered tab to show output
      const renderedTab = document.querySelector('.tab[data-tab="rendered"]');
      if (renderedTab) renderedTab.click();
    }
  });

  document.getElementById('add-param-btn')?.addEventListener('click', () => {
    addParamInput(paramsContainer);
  });

  // Set up copy/download buttons in pane header
  setupTemplateButtons();

  // Deep link: if URL has ?template= param, use it instead of platform default
  const deepLinkParams = getHashParams();
  const hashSection = getHashSection();
  const hashSubTab = getHashSubTab();
  // Support both #rendered/?... (legacy) and #templates/rendered?... (new)
  const isDeepLink = deepLinkParams.template && (hashSection === 'templates' || hashSection === 'rendered');
  if (!_deepLinkApplied && isDeepLink) {
    _deepLinkApplied = true;
    const dlTemplate = deepLinkParams.template;
    const dlSample = deepLinkParams.sample;
    // Determine target tab: #rendered or #templates/rendered → rendered tab, otherwise template tab
    const dlTab = (hashSection === 'rendered' || hashSubTab === 'rendered') ? 'rendered' : 'template';

    (async () => {
      try {
        // Load sample from API if specified
        if (dlSample) {
          const resp = await fetch(`${API_BASE}/api/samples/${encodeURIComponent(dlSample)}`);
          if (resp.ok) {
            const result = await resp.json();
            State.state.currentFilename = result.filename || dlSample;
            State.setBaseline(result.content);
            State.updateCurrent(result.content, 'load');
            CodeMirror.setEditorValue(result.content, false);
            updateHeader();
          }
        }
        // Load template and sync dropdown
        await loadTemplateSource(dlTemplate);
        const sel = document.getElementById('template-select');
        if (sel) sel.value = dlTemplate;
        // Click the target tab
        document.querySelector(`.tab[data-tab="${dlTab}"]`)?.click();
      } catch (e) {
        console.error('Deep link failed:', e);
      }
    })();
  } else if (!_deepLinkApplied) {
    // Restore editor tab from URL sub-path (e.g. #templates/diff, #templates/template)
    const tabFromHash = hashSubTab || 'yaml';
    if (tabFromHash !== 'yaml') {
      const tabBtn = document.querySelector(`.tab[data-tab="${tabFromHash}"]`);
      if (tabBtn) tabBtn.click();
    }
    // Restore persisted template selection, fall back to platform default
    const savedTemplate = localStorage.getItem(State.STORAGE_KEYS.SELECTED_TEMPLATE);
    const templateToLoad = savedTemplate && State.state.templates.find(t => (t.filename || t.name) === savedTemplate)
      ? savedTemplate
      : PLATFORM_TEMPLATES[currentPlatform];
    if (templateToLoad && State.state.templates.find(t => t.name === templateToLoad || t.filename === templateToLoad)) {
      const sel = document.getElementById('template-select');
      if (sel) sel.value = templateToLoad;
      loadTemplateSource(templateToLoad);
    }
  }
}

/**
 * Select a platform and auto-configure template
 */
async function selectPlatform(platform) {
  // Update cluster.platform in state
  if (!State.state.currentObject.cluster) {
    State.state.currentObject.cluster = {};
  }
  State.state.currentObject.cluster.platform = platform;

  // Ensure plugins section exists for IPI platforms
  const ipiPlatforms = ['vsphere', 'aws', 'azure', 'gcp', 'openstack', 'ibmcloud'];
  if (ipiPlatforms.includes(platform) && !State.state.currentObject.plugins) {
    State.state.currentObject.plugins = {};
  }
  if (ipiPlatforms.includes(platform) && !State.state.currentObject.plugins[platform]) {
    State.state.currentObject.plugins[platform] = {};
  }

  // Sync to YAML
  const yaml = State.toYaml();
  State.state.currentYamlText = yaml;
  CodeMirror.setEditorValue(yaml, false);

  // Update UI
  document.querySelectorAll('.platform-card').forEach(card => {
    card.classList.toggle('platform-card--selected', card.dataset.platform === platform);
  });
  document.getElementById('platform-description').textContent =
    PLATFORM_INFO[platform]?.description || '';

  // Auto-select the recommended template
  const templateName = PLATFORM_TEMPLATES[platform];
  if (templateName) {
    const templateSelect = document.getElementById('template-select');
    if (templateSelect) {
      templateSelect.value = templateName;
      const template = State.state.templates.find(t => t.name === templateName);
      document.getElementById('template-description').textContent = template?.description || '';
    }

    // Load template source
    await loadTemplateSource(templateName);
  }

  // Update header and badges
  updateHeader();
  updateValidationBadge();
  updateTodoBadge();
  updateChangesBadge();

  // Refresh plugins section if it's currently displayed
  if (State.state.currentSection === 'plugins') {
    const formContent = document.getElementById('form-content');
    if (formContent) {
      Form.renderSection('plugins', formContent);
    }
  }

  showToast(`Platform set to ${PLATFORM_INFO[platform]?.name || platform}`, 'success');
}

/**
 * Hide the bundle tabs row and info banner inside the Rendered tab pane.
 * Called when the clusterfile has no installMethod (single-template flow).
 */
function clearInstallBundleTabs() {
  const tabsRow = document.getElementById('bundle-tabs-row');
  const infoRow = document.getElementById('bundle-info-row');
  if (tabsRow) { tabsRow.style.display = 'none'; tabsRow.innerHTML = ''; }
  if (infoRow) { infoRow.style.display = 'none'; }
  const titleEl = document.getElementById('rendered-output-title');
  if (titleEl) titleEl.textContent = 'Rendered Output';
  State.state.activeBundleFiles = [];
}

/**
 * Render the install-method bundle. Populates the tabs row at the top of
 * the Rendered tab pane and routes each tab's content into the existing
 * CodeMirror rendered-output-editor (so it inherits the editor theme,
 * syntax highlighting, line numbers — same chrome as single-template).
 */
async function renderInstallBundleTabs(bundle, role) {
  const tabsRow = document.getElementById('bundle-tabs-row');
  const infoRow = document.getElementById('bundle-info-row');
  const titleEl = document.getElementById('rendered-output-title');
  if (!tabsRow || !infoRow) return;

  // Show the row immediately with a placeholder so the user knows we're working
  tabsRow.style.display = 'flex';
  tabsRow.innerHTML = `<span class="bundle-tab" style="cursor:default;font-style:italic;">Rendering ${Help.escapeHtml(bundle)} bundle…</span>`;
  if (titleEl) titleEl.textContent = `Bundle: ${bundle} (${role})`;

  if (isStandaloneMode) {
    tabsRow.innerHTML = `<span class="bundle-tab" style="cursor:default;color:var(--pf-global--danger-color--100,#c9190b);">Bundle rendering requires the container backend</span>`;
    return;
  }

  let result;
  try {
    const resp = await fetch(`${API_BASE}/api/render-bundle`, {
      method: 'POST',
      headers: gatedHeaders(),
      body: JSON.stringify({
        yaml_text: State.state.currentYamlText || '',
        bundle: bundle,
        cluster_role: role,
        params: [],
        include_content: !!State.state.includeContent,
        files: State.state.uploadedFiles && Object.keys(State.state.uploadedFiles).length ? State.state.uploadedFiles : null
      })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    result = await resp.json();
  } catch (e) {
    tabsRow.innerHTML = `<span class="bundle-tab is-error" style="cursor:default;">Bundle render failed: ${Help.escapeHtml(e.message)}</span>`;
    return;
  }

  const files = result.files || [];
  // Cache the file list so Copy/Download can look up the active file's name
  // without re-hitting the API.
  State.state.activeBundleFiles = files;
  if (!files.length) {
    tabsRow.innerHTML = `<span class="bundle-tab" style="cursor:default;">No templates match ${Help.escapeHtml(bundle)} / ${Help.escapeHtml(role)} — change install method via New.</span>`;
    return;
  }

  // Restore the previously-active bundle tab so switching away and back, or
  // toggling the rocker, doesn't reset to file 0. Clamp if the file list
  // shrank (e.g. install method changed).
  let active = (typeof State.state.activeBundleIndex === 'number')
    ? State.state.activeBundleIndex : 0;
  if (active < 0 || active >= files.length) active = 0;

  tabsRow.innerHTML = files.map((f, i) => `
    <button class="bundle-tab${i === active ? ' is-active' : ''}${f.success ? '' : ' is-error'}"
            role="tab"
            data-tab-index="${i}"
            title="${Help.escapeHtml(f.description || '')}">
      ${Help.escapeHtml(f.name)}${f.success ? '' : ' ⚠'}
    </button>
  `).join('');
  infoRow.style.display = 'flex';

  const showTab = (i) => {
    const f = files[i];
    const content = f.success
      ? (f.content || '# (empty render)')
      : `# Render failed for ${f.filename}\n# ${f.error || '(no error message)'}`;
    CodeMirror.setRenderedValue(content);
    if (titleEl) titleEl.textContent = `Bundle: ${bundle} (${role}) — ${f.name}`;
    tabsRow.querySelectorAll('.bundle-tab').forEach((t, ti) => {
      t.classList.toggle('is-active', ti === i);
    });
    State.state.activeBundleIndex = i;
    State.state.renderedMode = 'bundle';
  };
  showTab(active);

  tabsRow.querySelectorAll('.bundle-tab').forEach(tab => {
    tab.addEventListener('click', () => showTab(parseInt(tab.dataset.tabIndex, 10)));
  });
}

/**
 * Refresh the Rendered pane in whichever mode the user last chose.
 *  - 'bundle': re-render the install bundle (preserves activeBundleIndex)
 *  - 'single' (default): re-render the template currently in template-select
 * Use this anywhere a re-render is needed (tab switch, rocker toggle, YAML
 * change). Calling autoRenderTemplate directly bypasses bundle mode and
 * clobbers the bundle tab content.
 */
function refreshRendered() {
  const mode = State.state.renderedMode || (State.state.installMethod ? 'bundle' : 'single');
  if (mode === 'bundle' && State.state.installMethod && State.state.clusterRole) {
    renderInstallBundleTabs(State.state.installMethod, State.state.clusterRole);
  } else {
    autoRenderTemplate();
  }
}

/**
 * Set up template copy/download buttons. Copy/Download for the rendered pane
 * always fetch fresh content honoring the Output rocker, so users can keep
 * the screen in path mode while exporting full content (or vice versa).
 */
function setupTemplateButtons() {
  document.getElementById('copy-template-btn')?.addEventListener('click', () => {
    const content = CodeMirror.getTemplateValue();
    navigator.clipboard.writeText(content).then(() => showToast('Copied', 'success'));
  });
  document.getElementById('copy-rendered-btn')?.addEventListener('click', async () => {
    try {
      const { content } = await getRenderedForOutput();
      await navigator.clipboard.writeText(content);
      const mode = State.state.includeContentForOutput ? 'content' : 'path';
      showToast(`Copied (${mode})`, 'success');
    } catch (e) {
      showToast(`Copy failed: ${e.message}`, 'error');
    }
  });
  document.getElementById('download-rendered-btn')?.addEventListener('click', async () => {
    try {
      const { content, filename } = await getRenderedForOutput();
      downloadFile(content, filename);
      const mode = State.state.includeContentForOutput ? 'content' : 'path';
      showToast(`Downloaded ${filename} (${mode})`, 'success');
    } catch (e) {
      showToast(`Download failed: ${e.message}`, 'error');
    }
  });
  document.getElementById('preview-rendered-btn')?.addEventListener('click', previewRenderedHtml);
}

/**
 * Resolve {filename, content} for the active Rendered pane in the mode
 * dictated by the Output rocker. Re-renders fresh when the Output mode
 * differs from the Display mode; otherwise reads the editor directly.
 */
async function getRenderedForOutput() {
  const out = !!State.state.includeContentForOutput;
  const mode = State.state.renderedMode
    || (State.state.installMethod ? 'bundle' : 'single');

  // Resolve the active filename for the download name.
  let filename = 'output';
  if (mode === 'bundle') {
    const idx = State.state.activeBundleIndex || 0;
    const file = (State.state.activeBundleFiles || [])[idx];
    if (file) filename = file.filename || filename;
  } else {
    filename = document.getElementById('template-select')?.value
      || State.state.selectedTemplate || filename;
  }
  filename = filename.replace(/\.(tpl|tmpl)$/, '') || 'output.yaml';

  // Output mode matches Display: editor already has the right content.
  if (out === !!State.state.includeContent) {
    return { filename, content: CodeMirror.getRenderedValue() };
  }

  // Different mode — re-render fresh with the Output flag.
  const yaml = State.state.currentYamlText || '';
  if (mode === 'bundle' && State.state.installMethod && State.state.clusterRole) {
    const r = await fetch(`${API_BASE}/api/render-bundle`, {
      method: 'POST', headers: gatedHeaders(),
      body: JSON.stringify({
        yaml_text: yaml,
        bundle: State.state.installMethod,
        cluster_role: State.state.clusterRole,
        params: [],
        include_content: out
      })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const idx = State.state.activeBundleIndex || 0;
    const file = (json.files || [])[idx];
    return { filename, content: file ? (file.content || '') : '' };
  }

  const tplName = document.getElementById('template-select')?.value
    || State.state.selectedTemplate;
  if (!tplName) {
    return { filename, content: CodeMirror.getRenderedValue() };
  }
  const r = await fetch(`${API_BASE}/api/render`, {
    method: 'POST', headers: gatedHeaders(),
    body: JSON.stringify({
      yaml_text: yaml, template_name: tplName, params: [], include_content: out
    })
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();
  return { filename, content: json.output || '' };
}

/**
 * Load template source
 */
async function loadTemplateSource(templateName) {
  try {
    let content;

    if (isStandaloneMode) {
      // Standalone mode: get from embedded data
      const template = EMBEDDED_TEMPLATES.find(t => t.name === templateName);
      if (!template || !template.content) {
        throw new Error('Template not found in embedded data');
      }
      content = template.content;
    } else {
      // Server mode: fetch from API
      const response = await fetch(`${API_BASE}/api/templates/${templateName}`);
      if (!response.ok) throw new Error('Failed to load template');
      const result = await response.json();
      content = result.content;
    }

    document.getElementById('template-name-display').textContent = templateName;
    CodeMirror.setTemplateValue(content);
    State.state.selectedTemplate = templateName;
    State.state.selectedTemplateContent = content;
    localStorage.setItem(State.STORAGE_KEYS.SELECTED_TEMPLATE, templateName);
    updateEditorHash();
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
}

/**
 * Auto-render template when switching to rendered tab
 * Renders with and without params to highlight differences
 */
async function autoRenderTemplate() {
  const templateName = document.getElementById('template-select')?.value || State.state.selectedTemplate;
  if (!templateName) {
    CodeMirror.setRenderedValue('// Select a template to render');
    return;
  }

  // Collect params
  const params = [];
  document.querySelectorAll('.template-param').forEach(param => {
    const inputs = param.querySelectorAll('input');
    const path = inputs[0]?.value;
    const value = inputs[1]?.value;
    if (path && value) {
      params.push(`${path}=${value}`);
    }
  });

  try {
    // Standalone mode: use client-side rendering with Nunjucks
    if (isStandaloneMode) {
      await renderTemplateStandalone(templateName, params);
      return;
    }

    // Server mode: use API
    // If we have params, render both with and without to show diff
    let baselineOutput = null;

    if (params.length > 0) {
      // First render without params (baseline)
      const baselineResponse = await fetch(`${API_BASE}/api/render`, {
        method: 'POST',
        headers: gatedHeaders(),
        body: JSON.stringify({
          yaml_text: State.state.currentYamlText,
          template_name: templateName,
          params: [],
          include_content: !!State.state.includeContent,
        files: State.state.uploadedFiles && Object.keys(State.state.uploadedFiles).length ? State.state.uploadedFiles : null
        })
      });

      if (baselineResponse.ok) {
        const baselineResult = await baselineResponse.json();
        baselineOutput = baselineResult.output;
      }
    }

    // Render with params
    const response = await fetch(`${API_BASE}/api/render`, {
      method: 'POST',
      headers: gatedHeaders(),
      body: JSON.stringify({
        yaml_text: State.state.currentYamlText,
        template_name: templateName,
        params,
        include_content: !!State.state.includeContent,
        files: State.state.uploadedFiles && Object.keys(State.state.uploadedFiles).length ? State.state.uploadedFiles : null
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Render failed');
    }

    const result = await response.json();
    const output = result.output || '';

    // Store render warnings in state and update validation badge
    State.state.renderWarnings = result.warnings || [];
    updateValidationBadge();
    updateTodoBadge();

    if (result.warnings?.length > 0) {
      showToast(`Rendered with ${result.warnings.length} warning(s) — see Validation tab`, 'warning');
    }

    // Show with highlights if we have params and baseline
    if (params.length > 0 && baselineOutput) {
      CodeMirror.setRenderedValueWithHighlights(output, baselineOutput);
      showToast(`Rendered with ${params.length} parameter override(s) highlighted`, 'success');
    } else {
      CodeMirror.setRenderedValue(output);
    }
  } catch (e) {
    CodeMirror.setRenderedValue(`# Error rendering template\n# ${e.message}`);
    State.state.renderWarnings = [e.message];
    updateValidationBadge();
    updateTodoBadge();
  }
}

/**
 * Render template in standalone mode using Nunjucks
 */
async function renderTemplateStandalone(templateName, params) {
  const TemplateRenderer = window.TemplateRenderer;

  if (!TemplateRenderer) {
    CodeMirror.setRenderedValue('# Error: Template renderer not available\n# Nunjucks library not loaded');
    return;
  }

  // Get template content
  let templateContent = State.state.selectedTemplateContent;
  if (!templateContent) {
    const template = EMBEDDED_TEMPLATES.find(t => t.name === templateName);
    if (!template || !template.content) {
      CodeMirror.setRenderedValue('# Error: Template not found');
      return;
    }
    templateContent = template.content;
  }

  // Parse current YAML data
  let data;
  try {
    data = jsyaml.load(State.state.currentYamlText) || {};
  } catch (e) {
    CodeMirror.setRenderedValue(`# Error parsing YAML data\n# ${e.message}`);
    return;
  }

  // Render without params for baseline (if params provided)
  let baselineOutput = null;
  if (params.length > 0) {
    const baselineResult = TemplateRenderer.render(templateContent, data, []);
    if (baselineResult.success) {
      baselineOutput = baselineResult.output;
    }
  }

  // Render with params
  const result = TemplateRenderer.render(templateContent, data, params);

  if (!result.success) {
    CodeMirror.setRenderedValue(`# Error rendering template\n# ${result.error}`);
    return;
  }

  // Show with highlights if we have params and baseline
  if (params.length > 0 && baselineOutput) {
    CodeMirror.setRenderedValueWithHighlights(result.output, baselineOutput);
    showToast(`Rendered with ${params.length} parameter override(s) highlighted (standalone mode)`, 'success');
  } else {
    CodeMirror.setRenderedValue(result.output);
  }
}

// Debounce timeout for parameter changes
let paramRenderTimeout = null;

/**
 * Add a parameter input
 */
function addParamInput(container) {
  const param = document.createElement('div');
  param.className = 'template-param';
  param.innerHTML = `
    <input type="text" class="form-input param-path" placeholder="cluster.name" style="flex: 1;">
    <span>=</span>
    <input type="text" class="form-input param-value" placeholder="value" style="flex: 1;">
    <span class="array-field__item-remove" title="Remove">&times;</span>
  `;

  // Add change listeners for real-time rendering
  const inputs = param.querySelectorAll('input');
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      triggerParamRender();
    });
  });

  param.querySelector('.array-field__item-remove').addEventListener('click', () => {
    param.remove();
    triggerParamRender();
  });

  container.appendChild(param);
}

/**
 * Trigger parameter-based re-render with debounce
 */
function triggerParamRender() {
  // Only auto-render if Rendered tab is active
  const renderedTab = document.querySelector('.tab[data-tab="rendered"]');
  if (!renderedTab?.classList.contains('tab--active')) {
    return;
  }

  // Debounce the render
  clearTimeout(paramRenderTimeout);
  paramRenderTimeout = setTimeout(() => {
    autoRenderTemplate();
  }, 500);
}

/**
 * Preview rendered HTML output in a new browser tab
 */
function previewRenderedHtml() {
  const output = CodeMirror.getRenderedValue();
  if (!output) return;
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(output);
    win.document.close();
  } else {
    showToast('Popup blocked — allow popups for this site', 'warning');
  }
}

/**
 * Render cluster-overview.html.tpl and open preview in new tab
 */
async function previewClusterOverview() {
  const yaml = State.state.currentYamlText;
  if (!yaml || !yaml.trim()) {
    showToast('Load a clusterfile first', 'warning');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/render`, {
      method: 'POST',
      headers: gatedHeaders(),
      body: JSON.stringify({
        yaml_text: yaml,
        template_name: 'cluster-overview.html.tpl',
        params: [],
        include_content: !!State.state.includeContent,
        files: State.state.uploadedFiles && Object.keys(State.state.uploadedFiles).length ? State.state.uploadedFiles : null
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Render failed');
    }

    const result = await response.json();
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(result.output);
      win.document.close();
    } else {
      showToast('Popup blocked — allow popups for this site', 'warning');
    }
  } catch (e) {
    showToast(`Preview failed: ${e.message}`, 'error');
  }
}

/**
 * Show or hide the Preview button based on whether the template produces HTML
 */
function updatePreviewButton(templateName) {
  const btn = document.getElementById('preview-rendered-btn');
  if (!btn) return;
  btn.style.display = (templateName && templateName.match(/\.html?\./)) ? '' : 'none';
}

/**
 * Group an array of items by schema section (first path segment).
 * pathFn(item) should return the dot-path string.
 */
function groupBySection(items, pathFn) {
  const groups = {};
  items.forEach(item => {
    const section = State.parsePath(pathFn(item))[0] || 'other';
    (groups[section] = groups[section] || []).push(item);
  });
  return groups;
}

/**
 * Render changes section
 */
function renderChangesSection(container) {
  const changes = State.getChanges();

  if (changes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="color: var(--pf-global--success-color--100)">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22,4 12,14.01 9,11.01"/>
          </svg>
        </div>
        <div class="empty-state__title">No changes</div>
        <div class="empty-state__description">Your document matches the baseline.</div>
      </div>
    `;
    return;
  }

  // Group changes by section
  const groupedChanges = {};
  changes.forEach(c => {
    const section = State.parsePath(c.path)[0] || 'other';
    if (!groupedChanges[section]) {
      groupedChanges[section] = [];
    }
    groupedChanges[section].push(c);
  });

  container.innerHTML = `
    <div class="changes-list">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0;">${changes.length} Change${changes.length !== 1 ? 's' : ''}</h3>
        <button class="btn btn--danger btn--sm" id="revert-all-btn">Revert All</button>
      </div>
      ${Object.entries(groupedChanges).map(([section, sectionChanges]) => `
        <div class="changes-section">
          <div class="changes-section__header">
            <a class="changes-section__link" data-section="${Help.escapeHtml(section)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
                <path d="M9 18l6-6-6-6"/>
              </svg>
              ${Help.escapeHtml(section)}
            </a>
            <span class="changes-section__count">${sectionChanges.length}</span>
          </div>
          ${sectionChanges.map(c => `
            <div class="change-item">
              <a class="change-item__path" data-nav-path="${Help.escapeHtml(c.path)}">${Help.escapeHtml(c.path)}</a>
              <a class="change-item__values" data-show-diff title="Click to view full diff">
                <span class="change-item__old" title="Old: ${Help.escapeHtml(JSON.stringify(c.oldValue))}">${formatChangeValue(c.oldValue)}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                <span class="change-item__new" title="New: ${Help.escapeHtml(JSON.stringify(c.value))}">${formatChangeValue(c.value)}</span>
              </a>
              <button class="btn btn--link btn--sm" data-revert-path="${Help.escapeHtml(c.path)}">Revert</button>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;

  // Set up revert all handler — click twice to confirm
  const revertBtn = document.getElementById('revert-all-btn');
  if (revertBtn) {
    let pendingRevert = false;
    revertBtn.addEventListener('click', () => {
      if (pendingRevert) {
        State.revertAll();
        syncEditorFromState();
        renderCurrentSection();
        updateHeader();
        showToast('All changes reverted', 'success');
        pendingRevert = false;
        revertBtn.textContent = revertBtn.dataset.originalText || 'Revert All';
        return;
      }
      pendingRevert = true;
      revertBtn.dataset.originalText = revertBtn.textContent;
      revertBtn.textContent = 'Confirm revert?';
      setTimeout(() => {
        pendingRevert = false;
        revertBtn.textContent = revertBtn.dataset.originalText || 'Revert All';
      }, 3000);
    });
  }

  // Set up section link handlers
  container.querySelectorAll('[data-section]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      navigateToSection(section);
    });
  });

  // Set up path navigation handlers
  container.querySelectorAll('[data-nav-path]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const path = link.dataset.navPath;
      const parts = State.parsePath(path);
      if (parts.length > 0) {
        navigateToSection(parts[0]);
        // Scroll to field in form and highlight in YAML editor
        setTimeout(() => {
          scrollToField(path);
          CodeMirror.goToPath(path);
        }, 150);
      }
    });
  });

  // Set up diff link handlers
  container.querySelectorAll('[data-show-diff]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      // Switch to diff tab
      const diffTab = document.querySelector('.tab[data-tab="diff"]');
      if (diffTab) diffTab.click();
    });
  });

  // Set up revert handlers
  container.querySelectorAll('[data-revert-path]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const path = btn.dataset.revertPath;
      console.log('Reverting path:', path);

      // Get baseline value and set it
      const baselineVal = State.getNestedValue(State.state.baselineObject, path);
      State.setNestedValue(State.state.currentObject, path,
        baselineVal === undefined ? undefined : JSON.parse(JSON.stringify(baselineVal)));

      // Sync to YAML and update UI
      syncEditorFromState();
      updateValidationBadge();
      updateTodoBadge();
      updateChangesBadge();
      updateHeader();
      renderCurrentSection();

      showToast('Change reverted', 'success');
    });
  });
}

/**
 * Scroll to a field in the form by path
 */
function scrollToField(path) {
  const formContent = document.getElementById('form-content');
  if (!formContent) return;

  // Try to find the field by data-path attribute (escape special chars)
  try {
    const field = formContent.querySelector(`[data-path="${CSS.escape(path)}"]`);
    if (field) {
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a brief highlight effect
      field.classList.add('field-highlight');
      setTimeout(() => field.classList.remove('field-highlight'), 2000);
      return;
    }
  } catch (e) {
    console.warn('Could not find field for path:', path);
  }

  // Try to find by partial path match (for nested fields)
  const parts = State.parsePath(path);
  for (let i = parts.length; i > 0; i--) {
    const partialPath = State.buildPath(parts.slice(0, i));
    try {
      const partialField = formContent.querySelector(`[data-path="${CSS.escape(partialPath)}"]`);
      if (partialField) {
        partialField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        partialField.classList.add('field-highlight');
        setTimeout(() => partialField.classList.remove('field-highlight'), 2000);
        return;
      }
    } catch (e) {
      // Continue trying with shorter paths
    }
  }
}

/**
 * Format a change value for display
 */
function formatChangeValue(value) {
  if (value === undefined) return '<empty>';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    return value.length > 20 ? value.substring(0, 20) + '...' : value;
  }
  const str = JSON.stringify(value);
  return str.length > 20 ? str.substring(0, 20) + '...' : str;
}

/**
 * Render validation section
 */
/**
 * Recursively find all <placeholder> values in the parsed YAML object.
 * Returns [{path, placeholder}] for each unfilled placeholder.
 */
function findPlaceholders(obj, prefix = '') {
  const results = [];
  if (!obj || typeof obj !== 'object') return results;
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string' && /^<[^>]+>$/.test(value)) {
      results.push({ path, placeholder: value });
    } else if (value && typeof value === 'object') {
      results.push(...findPlaceholders(value, path));
    }
  }
  return results;
}

/**
 * Render a description string as HTML, turning URLs into clickable links.
 */
function renderDescriptionHtml(text) {
  if (!text) return '';
  const urlRe = /(https?:\/\/[^\s<>"]+)/g;
  const parts = [];
  let last = 0, m;
  while ((m = urlRe.exec(text)) !== null) {
    parts.push(Help.escapeHtml(text.slice(last, m.index)));
    const url = m[1];
    parts.push(`<a href="${Help.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${Help.escapeHtml(url)}</a>`);
    last = m.index + url.length;
  }
  parts.push(Help.escapeHtml(text.slice(last)));
  return parts.join('');
}

/**
 * Walk the schema to get title/description for a dot-separated path.
 */
function getSchemaFieldInfo(dotPath) {
  const schema = State.state?.schema;
  if (!schema) return { title: '', description: '' };
  const parts = dotPath.split('.');
  let node = schema;
  for (const part of parts) {
    node = node?.properties?.[part] || node?.additionalProperties;
    if (!node) return { title: '', description: '' };
    // Resolve $ref
    if (node?.$ref) {
      const refPath = node.$ref.replace('#/', '').split('/');
      let resolved = schema;
      for (const seg of refPath) resolved = resolved?.[seg];
      node = resolved || node;
    }
  }
  return { title: node?.title || '', description: node?.description || '', docUrl: node?.['x-doc-url'] || '' };
}

function renderValidationSection(container) {
  const result = Validator.validateDocument(State.state.currentObject);
  State.state.validationErrors = result.errors;
  const renderWarnings = State.state.renderWarnings || [];
  const hasSchemaErrors = result.errors.length > 0;
  const hasRenderWarnings = renderWarnings.length > 0;

  if (!hasSchemaErrors && !hasRenderWarnings) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="color: var(--pf-global--success-color--100)">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22,4 12,14.01 9,11.01"/>
          </svg>
        </div>
        <div class="empty-state__title">Valid Document</div>
        <div class="empty-state__description">Your clusterfile passes all schema validations.</div>
      </div>
    `;
    return;
  }

  const total = result.errors.length + renderWarnings.length;
  const errorGroups = groupBySection(result.errors, e => e.path || '');

  const schemaHtml = hasSchemaErrors ? Object.entries(errorGroups).map(([section, errs]) => `
    <div class="changes-section">
      <div class="changes-section__header">
        <a class="changes-section__link" data-section="${Help.escapeHtml(section)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
            <path d="M9 18l6-6-6-6"/>
          </svg>
          ${Help.escapeHtml(section)}
        </a>
        <span class="changes-section__count changes-section__count--error">${errs.length}</span>
      </div>
      ${errs.map(e => `
        <div class="change-item">
          <span class="validation-item__path" data-path="${Help.escapeHtml(e.path)}">${Help.escapeHtml(e.path || '(root)')}</span>
          <span class="change-item__values">${Help.escapeHtml(e.message)}</span>
        </div>
      `).join('')}
    </div>
  `).join('') : '';

  const renderHtml = hasRenderWarnings ? `
    <div class="changes-section">
      <div class="changes-section__header">
        <span class="changes-section__link" style="cursor:default;">Render Warnings</span>
        <span class="changes-section__count">${renderWarnings.length}</span>
      </div>
      ${renderWarnings.map(w => `
        <div class="change-item">
          <span class="change-item__values">${Help.escapeHtml(w)}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  container.innerHTML = `
    <div class="changes-list">
      <h3 style="margin: 0 0 16px 0;">${total} Issue${total !== 1 ? 's' : ''}</h3>
      ${schemaHtml}${renderHtml}
    </div>`;

  container.querySelectorAll('.validation-item__path').forEach(pathEl => {
    pathEl.addEventListener('click', () => {
      const path = pathEl.dataset.path;
      if (path) {
        const parts = State.parsePath(path);
        if (parts.length > 0) navigateToSection(parts[0]);
        CodeMirror.goToPath(path);
      }
    });
  });

  container.querySelectorAll('.changes-section__link[data-section]').forEach(link => {
    link.addEventListener('click', () => navigateToSection(link.dataset.section));
  });
}

/**
 * Render Todo section — unfilled <placeholder> fields from the current document.
 */
function renderTodoSection(container) {
  const todos = findPlaceholders(State.state.currentObject || {});

  if (todos.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="color: var(--pf-global--success-color--100)">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22,4 12,14.01 9,11.01"/>
          </svg>
        </div>
        <div class="empty-state__title">All Done</div>
        <div class="empty-state__description">No placeholder values remain in this document.</div>
      </div>
    `;
    return;
  }

  const todoGroups = groupBySection(todos, t => t.path);

  const groupsHtml = Object.entries(todoGroups).map(([section, items]) => `
    <div class="changes-section">
      <div class="changes-section__header">
        <a class="changes-section__link" data-section="${Help.escapeHtml(section)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
            <path d="M9 18l6-6-6-6"/>
          </svg>
          ${Help.escapeHtml(section)}
        </a>
        <span class="changes-section__count changes-section__count--info">${items.length}</span>
      </div>
      ${items.map(t => {
        const info = getSchemaFieldInfo(t.path);
        const title = info.title || t.path.split('.').pop();
        const desc = info.description || `Fill in ${t.placeholder}`;
        const docLink = info.docUrl
          ? `<a href="${Help.escapeHtml(info.docUrl)}" target="_blank" rel="noopener noreferrer">Documentation ↗</a>`
          : '';
        return `
        <div class="change-item change-item--todo">
          <span class="validation-item__path" data-path="${Help.escapeHtml(t.path)}">${Help.escapeHtml(t.path)}</span>
          <div class="change-item__todo-detail">
            <strong>${Help.escapeHtml(title)}</strong>
            <span>${renderDescriptionHtml(desc)}</span>${docLink ? `<span>${docLink}</span>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  `).join('');

  container.innerHTML = `
    <div class="changes-list">
      <h3 style="margin: 0 0 16px 0;">${todos.length} Todo${todos.length !== 1 ? 's' : ''}</h3>
      ${groupsHtml}
    </div>`;

  container.querySelectorAll('.validation-item__path').forEach(pathEl => {
    pathEl.addEventListener('click', () => {
      const path = pathEl.dataset.path;
      if (path) {
        const parts = State.parsePath(path);
        if (parts.length > 0) navigateToSection(parts[0]);
        CodeMirror.goToPath(path);
      }
    });
  });

  container.querySelectorAll('.changes-section__link[data-section]').forEach(link => {
    link.addEventListener('click', () => navigateToSection(link.dataset.section));
  });
}

/**
 * Handle YAML editor changes
 */
function onYamlChange(yamlText) {
  // Skip if this change came from form sync (prevents loop)
  if (syncingFromForm) {
    return;
  }

  // Validate YAML syntax
  try {
    jsyaml.load(yamlText);
  } catch (e) {
    // Invalid YAML - don't sync
    return;
  }

  State.updateCurrent(yamlText, 'editor');

  // Update badges immediately - don't re-render form to avoid losing focus
  updateValidationBadge();
  updateTodoBadge();
  updateChangesBadge();
  updateHeader();
  if (typeof refreshAgentIsoButton === 'function') refreshAgentIsoButton();

  // Only re-render validation/changes/todo sections if they're active (they show dynamic content)
  const currentSection = State.state.currentSection;
  if (currentSection === 'validation' || currentSection === 'changes' || currentSection === 'todo') {
    renderCurrentSection();
  }
  // Mark that form needs refresh when editor loses focus
  formNeedsRefresh = true;
}

/**
 * Handle form changes
 */
function onFormChange() {
  // Set flag to prevent editor change from triggering form re-render
  syncingFromForm = true;

  // Sync to YAML
  const yaml = State.toYaml();
  State.state.currentYamlText = yaml;
  CodeMirror.setEditorValue(yaml, true);

  // Clear flag after editor debounce completes (300ms SYNC_DELAY + margin)
  setTimeout(() => {
    syncingFromForm = false;
  }, 400);

  updateValidationBadge();
  updateTodoBadge();
  updateChangesBadge();
  updateHeader();
  if (typeof refreshAgentIsoButton === 'function') refreshAgentIsoButton();

  // Note: Don't re-render the section here - it would destroy active form inputs
  // Change indicators are updated inline by updateFieldValue in form.js
}

/**
 * Sync editor from state
 */
function syncEditorFromState() {
  const yaml = State.toYaml();
  State.state.currentYamlText = yaml;
  CodeMirror.setEditorValue(yaml, false);
}

/**
 * Update validation badge
 */
function updateValidationBadge() {
  const result = Validator.validateDocument(State.state.currentObject);
  State.state.validationErrors = result.errors;
  const renderWarnings = State.state.renderWarnings || [];
  const total = result.errors.length + renderWarnings.length;

  const badge = document.querySelector('[data-section="validation"] .sidebar-nav__item-badge');
  if (badge) {
    badge.textContent = total;
    badge.style.display = total > 0 ? 'inline' : 'none';
  }
}

/**
 * Update todo badge count
 */
function updateTodoBadge() {
  const count = findPlaceholders(State.state.currentObject || {}).length;
  const badge = document.querySelector('[data-section="todo"] .sidebar-nav__item-badge');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline' : 'none';
  }
}

/**
 * Update changes badge
 */
function updateChangesBadge() {
  const changes = State.getChanges();
  const badge = document.querySelector('[data-section="changes"] .sidebar-nav__item-badge');
  if (badge) {
    badge.textContent = changes.length;
    badge.style.display = changes.length > 0 ? 'inline' : 'none';
  }
}

/**
 * Update header with filename and modification indicator
 */
function updateHeader() {
  const filenameEl = document.querySelector('.app-header__filename');
  const modifiedEl = document.getElementById('modified-indicator');

  if (filenameEl && !filenameEl.dataset.editing) {
    filenameEl.textContent = State.state.currentFilename || 'untitled.clusterfile';
    filenameEl.title = 'Click to rename';
    filenameEl.style.cursor = 'pointer';
    filenameEl.style.borderBottom = '1px dashed var(--pf-global--BorderColor--100, #666)';

    // Attach click handler once
    if (!filenameEl.dataset.hasClickHandler) {
      filenameEl.dataset.hasClickHandler = 'true';
      filenameEl.addEventListener('click', () => startFilenameEdit(filenameEl));
    }
  }

  // Show modification indicator if there are changes
  if (modifiedEl) {
    const hasChanges = State.getChanges().length > 0;
    modifiedEl.style.display = hasChanges ? 'inline' : 'none';
  }

  // Update page title
  document.title = (State.state.currentFilename || 'untitled.clusterfile') + ' — Clusterfile Editor';
}

/**
 * Inline filename editing in the header
 */
function startFilenameEdit(el) {
  if (el.dataset.editing) return;
  el.dataset.editing = 'true';

  const current = State.state.currentFilename || 'untitled.clusterfile';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  input.className = 'app-header__filename-input';
  input.style.cssText = 'background:transparent;border:1px solid var(--pf-global--BorderColor--100,#666);color:inherit;font:inherit;padding:1px 4px;border-radius:3px;width:' + Math.max(200, current.length * 8.5) + 'px;outline:none;';

  const commit = () => {
    const newName = input.value.trim() || 'untitled.clusterfile';
    State.state.currentFilename = newName;
    State.saveToLocalStorage();
    delete el.dataset.editing;
    el.textContent = newName;
    document.title = newName + ' — Clusterfile Editor';
  };

  const cancel = () => {
    delete el.dataset.editing;
    el.textContent = current;
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { cancel(); }
  });
  input.addEventListener('blur', commit);

  el.textContent = '';
  el.appendChild(input);
  input.select();
}

/**
 * Load a document
 */
function loadDocument(yamlText, filename = 'untitled.clusterfile', setAsBaseline = true) {
  State.state.currentFilename = filename;

  if (setAsBaseline) {
    State.setBaseline(yamlText);
  }
  State.updateCurrent(yamlText, 'load');

  CodeMirror.setEditorValue(yamlText, false);
  updateHeader();
  renderCurrentSection();

  // Update diff view if currently visible
  updateDiffView();

  // Update validation
  updateValidationBadge();
  updateTodoBadge();

  // Re-render template if Rendered tab is active
  const renderedTab = document.querySelector('.tab[data-tab="rendered"]');
  if (renderedTab?.classList.contains('tab--active')) {
    refreshRendered();
  }

  // Sync URL with new sample filename
  updateEditorHash();
}

/**
 * Create new blank document (called from "Blank" starter button).
 */
function newDocument() {
  const emptyDoc = `# Clusterfile
account: {}
cluster: {}
network:
  domain: ""
hosts: {}
`;
  loadDocument(emptyDoc, 'untitled.clusterfile', true);
}

/**
 * Load a starter clusterfile by filename. Used by both the welcome modal
 * and the New Document modal so behavior is identical from either entry.
 */
async function loadStarter(filename) {
  if (!filename) { newDocument(); return; }
  let content;
  if (isStandaloneMode) {
    const sample = EMBEDDED_SAMPLES.find(s => s.filename === filename);
    if (!sample) throw new Error(`Starter not found: ${filename}`);
    content = sample.content;
  } else {
    const resp = await fetch(`${API_BASE}/api/samples/${encodeURIComponent(filename)}`);
    if (!resp.ok) throw new Error(`Failed to load ${filename}`);
    content = (await resp.json()).content;
  }
  loadDocument(content, 'untitled.clusterfile', true);
}

/**
 * Handle file load
 */
function handleFileLoad(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target?.result;
    if (typeof content === 'string') {
      loadDocument(content, file.name, true);
      showToast(`Loaded ${file.name}`, 'success');
    }
  };
  reader.onerror = () => {
    showToast('Failed to read file', 'error');
  };
  reader.readAsText(file);

  // Reset input
  event.target.value = '';
}

/**
 * Download document
 */
function downloadDocument() {
  const yaml = State.toYaml();
  const filename = State.state.currentFilename || 'clusterfile.yaml';
  downloadFile(yaml, filename);
  showToast('Downloaded', 'success');
}

/**
 * Download a file
 */
function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Open feedback form via secure mailto
 */
function openFeedback() {
  const version = State.state.version || '2.1.0';
  const userAgent = navigator.userAgent;
  const currentUrl = window.location.href;

  // Collect non-sensitive system info for debugging
  const systemInfo = [
    `Version: ${version}`,
    `URL: ${currentUrl}`,
    `Browser: ${userAgent}`,
    `Viewport: ${window.innerWidth}x${window.innerHeight}`,
    `Timestamp: ${new Date().toISOString()}`
  ].join('\n');

  const subject = encodeURIComponent(`[Clusterfile Editor v${version}] Feedback`);
  const body = encodeURIComponent(
`--- Please describe your feedback or bug report below ---



--- System Information (for debugging) ---
${systemInfo}

--- Steps to reproduce (if bug) ---
1.
2.
3.

--- Expected behavior ---


--- Actual behavior ---

`);

  // Open mailto link
  const mailto = `mailto:dds+clusterfile-editor@redhat.com?subject=${subject}&body=${body}`;
  window.location.href = mailto;
}

/**
 * Populate samples dropdown
 */
function populateSamplesDropdown() {
  const menu = document.getElementById('samples-menu');
  if (!menu) return;

  menu.innerHTML = State.state.samples.map(s => `
    <button class="dropdown__item" data-filename="${Help.escapeHtml(s.filename)}">
      ${Help.escapeHtml(s.name)}
    </button>
  `).join('');

  menu.querySelectorAll('.dropdown__item').forEach(item => {
    item.addEventListener('click', async () => {
      const filename = item.dataset.filename;
      try {
        let content;

        if (isStandaloneMode) {
          // Standalone mode: get from embedded data
          const sample = EMBEDDED_SAMPLES.find(s => s.filename === filename);
          if (!sample || !sample.content) {
            throw new Error('Sample not found in embedded data');
          }
          content = sample.content;
        } else {
          // Server mode: fetch from API
          const response = await fetch(`${API_BASE}/api/samples/${filename}`);
          if (!response.ok) throw new Error('Failed to load sample');
          const result = await response.json();
          content = result.content;
        }

        loadDocument(content, filename, true);
        showToast(`Loaded sample: ${filename}`, 'success');
      } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
      }

      // Close dropdown
      item.closest('.dropdown')?.classList.remove('dropdown--open');
    });
  });
}

/**
 * Populate templates dropdown
 */
function populateTemplatesDropdown() {
  // Templates are populated in renderTemplatesSection
}

/**
 * Show welcome tour modal
 */
/**
 * Show new document modal with starter file choices
 */
// Topology + install method choices for the Start modal.
// Each install method maps to a bundle name (matches template metadata).
const TOPOLOGIES = [
  { id: 'sno',     filename: 'start-sno.clusterfile',     label: 'SNO',           desc: '1 server, no HA — edge or lab' },
  { id: 'compact', filename: 'start-compact.clusterfile', label: 'Compact',       desc: '3 nodes, etcd HA, no workers' },
  { id: 'full',    filename: 'start-full.clusterfile',    label: 'Full HA',       desc: '3 control + N worker — production' },
  { id: 'blank',   filename: '',                          label: 'Blank',         desc: 'Empty document' },
];
const INSTALL_METHODS = [
  { id: 'agent',   bundle: 'agent',   role: 'standalone',
    label: 'Agent-based installer',
    desc: 'Self-contained ISO. openshift-install builds an ISO; you boot each server from it. No hub cluster needed.' },
  { id: 'acm-ztp', bundle: 'acm-ztp', role: 'managed',
    label: 'ACM ZTP (Zero-Touch Provisioning)',
    desc: 'Apply manifests to an existing ACM hub. Hub boots and provisions the managed cluster via BMC virtual media.' },
  { id: 'capi',    bundle: 'capi',    role: 'managed',
    label: 'CAPI (Cluster API + Metal3)',
    desc: 'Declarative Cluster API provisioning via Metal3. Hub-driven, K8s-native. Requires ACM 2.11+.' },
];

/**
 * Single Start modal — merges the welcome tour and new-document picker.
 * Captures topology and install method together; loads the starter and
 * sets State.installMethod / clusterRole so the Templates view renders
 * the right multi-file bundle.
 */
function showStartModal() {
  const lastTopology = State.state.lastTopology || 'sno';
  const lastMethod   = State.state.lastInstallMethod || 'agent';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal--start">
      <div class="modal__header">
        <h2 class="modal__title">Start a new cluster</h2>
        <span class="modal__close">×</span>
      </div>
      <div class="modal__body">
        <div class="start-modal__section">
          <div class="start-modal__heading">1. Topology</div>
          <div class="start-modal__topology-grid">
            ${TOPOLOGIES.map(t => `
              <label class="start-modal__topology-card${t.id === lastTopology ? ' is-selected' : ''}">
                <input type="radio" name="topology" value="${t.id}" ${t.id === lastTopology ? 'checked' : ''} hidden>
                <div class="start-modal__topology-label">${Help.escapeHtml(t.label)}</div>
                <div class="start-modal__topology-desc">${Help.escapeHtml(t.desc)}</div>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="start-modal__section">
          <div class="start-modal__heading">2. Install method</div>
          <div class="start-modal__methods">
            ${INSTALL_METHODS.map(m => `
              <label class="start-modal__method${m.id === lastMethod ? ' is-selected' : ''}">
                <input type="radio" name="install-method" value="${m.id}" ${m.id === lastMethod ? 'checked' : ''}>
                <div>
                  <div class="start-modal__method-label">${Help.escapeHtml(m.label)}</div>
                  <div class="start-modal__method-desc">${Help.escapeHtml(m.desc)}</div>
                </div>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="start-modal__section start-modal__how">
          <div class="start-modal__heading">How it works</div>
          <ol class="start-modal__steps">
            <li>Replace the <code>&lt;placeholder&gt;</code> values in the form.</li>
            <li>Drive the <strong>Todo</strong> and <strong>Validation</strong> badges to 0.</li>
            <li>Open <strong>Templates</strong> — your install bundle is pre-rendered as tabs.</li>
            <li>Apply with <code>oc apply</code> (CLI expands <code>&lt;file:…&gt;</code> paths at render time).</li>
          </ol>
        </div>
      </div>
      <div class="modal__footer">
        <label style="flex: 1; display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="start-dont-show">
          Don't show on first visit
        </label>
        <button class="btn btn--secondary" id="start-cancel">Cancel</button>
        <button class="btn btn--primary" id="start-go">Start →</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Visual selection state for cards/methods
  overlay.querySelectorAll('input[name="topology"]').forEach(input => {
    input.addEventListener('change', () => {
      overlay.querySelectorAll('.start-modal__topology-card').forEach(c => c.classList.remove('is-selected'));
      input.closest('.start-modal__topology-card')?.classList.add('is-selected');
    });
  });
  overlay.querySelectorAll('input[name="install-method"]').forEach(input => {
    input.addEventListener('change', () => {
      overlay.querySelectorAll('.start-modal__method').forEach(c => c.classList.remove('is-selected'));
      input.closest('.start-modal__method')?.classList.add('is-selected');
    });
  });

  const closeModal = () => {
    if (document.getElementById('start-dont-show')?.checked) {
      State.setTourShown();
    }
    overlay.remove();
  };

  overlay.querySelector('.modal__close').addEventListener('click', closeModal);
  overlay.querySelector('#start-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  overlay.querySelector('#start-go').addEventListener('click', async () => {
    const topologyId = overlay.querySelector('input[name="topology"]:checked')?.value || 'sno';
    const methodId   = overlay.querySelector('input[name="install-method"]:checked')?.value || 'agent';
    const topology = TOPOLOGIES.find(t => t.id === topologyId) || TOPOLOGIES[0];
    const method   = INSTALL_METHODS.find(m => m.id === methodId) || INSTALL_METHODS[0];

    State.state.lastTopology = topologyId;
    State.state.lastInstallMethod = methodId;
    State.state.installMethod = method.bundle;
    State.state.clusterRole   = method.role;

    closeModal();
    try {
      await loadStarter(topology.filename);
      // Stamp the choice into the clusterfile so it persists across reloads
      // and so the Templates view knows which bundle to render.
      if (State.state.currentObject) {
        if (!State.state.currentObject.cluster) State.state.currentObject.cluster = {};
        State.state.currentObject.cluster.installMethod = method.bundle;
        State.state.currentObject.cluster.clusterRole   = method.role;
        const yaml = State.toYaml();
        State.state.currentYamlText = yaml;
        CodeMirror.setEditorValue(yaml, false);
        // Stamped install method/role are part of the starting document, not
        // user edits. Re-baseline so change tracking starts from zero.
        State.setBaseline(yaml);
        renderCurrentSection();
        updateChangesBadge();
        updateHeader();
      }
    } catch (e) {
      showToast(`Error: ${e.message}`, 'error');
    }
  });
}

// Backwards-compatible aliases for the merged Start modal.
// Kept so existing call sites (header New button, sidebar Welcome) keep
// working without renaming. Prefer `showStartModal()` in new code.
const showNewDocumentModal = showStartModal;
const showWelcomeTour      = showStartModal;

/**
 * Update version display in header
 */
function updateVersionDisplay() {
  // Update document title
  document.title = `Clusterfile Editor v${APP_VERSION}`;

  // Update header version display
  const versionEl = document.querySelector('.app-header__version');
  if (versionEl) {
    const modeIndicator = isStandaloneMode ? ' (standalone)' : '';
    versionEl.textContent = `v${APP_VERSION}${modeIndicator}`;
    versionEl.title = isStandaloneMode
      ? 'Standalone mode - running without backend server. Click for changelog.'
      : 'Click for changelog';
    versionEl.addEventListener('click', showChangelog);
  }

  // Privacy badge click
  const privacyBadge = document.getElementById('privacy-badge');
  if (privacyBadge) {
    privacyBadge.addEventListener('click', () => navigateToSection('privacy'));
  }
}

/**
 * Show changelog - navigate to changelog section
 */
function showChangelog() {
  navigateToSection('changelog');
}

/**
 * Render changelog section (full page)
 */
function renderChangelogSection(container) {
  container.innerHTML = `
    <div class="changelog-page">
      <div class="form-section">
        <h2 class="form-section__title">Changelog</h2>
        <p class="form-description" style="margin-bottom: 24px;">
          Release history and changes for Clusterfile Editor.
        </p>

        <div class="changelog-releases">
          ${CHANGELOG.map(release => `
            <div class="changelog-release">
              <div class="changelog-release__header">
                <span class="changelog-release__version">v${Help.escapeHtml(release.version)}</span>
                <span class="changelog-release__date">${Help.escapeHtml(release.date)}</span>
              </div>
              <ul class="changelog-release__changes">
                ${release.changes.map(change => `
                  <li>${Help.escapeHtml(change)}</li>
                `).join('')}
              </ul>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render privacy & trust section
 */
function renderPrivacySection(container) {
  const lockIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20" style="vertical-align:-4px;margin-right:6px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  const checkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--pf-global--success-color--100)" stroke-width="2" width="16" height="16" style="vertical-align:-3px;margin-right:6px;flex-shrink:0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>';
  const fileIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" style="vertical-align:-3px;margin-right:6px;flex-shrink:0"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
  const eyeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" style="vertical-align:-3px;margin-right:6px;flex-shrink:0"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const shieldIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" style="vertical-align:-3px;margin-right:6px;flex-shrink:0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';

  container.innerHTML = `
    <div class="changelog-page">
      <div class="form-section">
        <h2 class="form-section__title">${lockIcon}Privacy &amp; Trust</h2>
        <p class="form-description" style="margin-bottom:24px;">
          This tool is designed for enterprise environments where data privacy is non-negotiable.
          Every design decision prioritizes keeping your configuration data under your control.
        </p>

        <div style="display:flex;flex-direction:column;gap:20px;">

          <div style="background:rgba(62,134,53,0.08);border:1px solid rgba(62,134,53,0.2);border-radius:6px;padding:16px 20px;">
            <h3 style="margin:0 0 12px;font-size:15px;font-weight:600;">${shieldIcon}Data Stays Local</h3>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:14px;">
              <div>${checkIcon}<strong>No external connections</strong> &mdash; all processing happens inside this container</div>
              <div>${checkIcon}<strong>No telemetry or analytics</strong> &mdash; zero tracking, no phone-home, no usage data</div>
              <div>${checkIcon}<strong>No cloud dependencies</strong> &mdash; works fully air-gapped behind your firewall</div>
              <div>${checkIcon}<strong>No data persistence</strong> &mdash; nothing is stored server-side; browser localStorage only</div>
            </div>
          </div>

          <div style="background:var(--pf-global--BackgroundColor--200);border:1px solid var(--pf-global--BorderColor--100);border-radius:6px;padding:16px 20px;">
            <h3 style="margin:0 0 12px;font-size:15px;font-weight:600;">${fileIcon}Credential Handling</h3>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:14px;">
              <div>${checkIcon}<strong>File path references only</strong> &mdash; pull secrets, SSH keys, and trust bundles are stored as file paths, never as content</div>
              <div>${checkIcon}<strong>Read at render time</strong> &mdash; file contents are loaded by the CLI tool (<code>process.py</code>) only when generating output</div>
              <div>${checkIcon}<strong>Never transmitted</strong> &mdash; credential file contents never pass through the web editor</div>
              <div>${checkIcon}<strong>No secrets in YAML</strong> &mdash; clusterfiles contain paths like <code>secrets/pull-secret.json</code>, not the secrets themselves</div>
            </div>
          </div>

          <div style="background:var(--pf-global--BackgroundColor--200);border:1px solid var(--pf-global--BorderColor--100);border-radius:6px;padding:16px 20px;">
            <h3 style="margin:0 0 12px;font-size:15px;font-weight:600;">${eyeIcon}Auditable Output</h3>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:14px;">
              <div>${checkIcon}<strong>Human-readable scripts</strong> &mdash; pre-check scripts are plain bash using standard RHEL tools (<code>dig</code>, <code>ping</code>, <code>curl</code>, <code>jq</code>, <code>openssl</code>)</div>
              <div>${checkIcon}<strong>Review before execution</strong> &mdash; every generated script can be inspected in the Rendered tab before download</div>
              <div>${checkIcon}<strong>Non-destructive checks</strong> &mdash; pre-check scripts are read-only; they test connectivity, never modify infrastructure</div>
              <div>${checkIcon}<strong>Open source templates</strong> &mdash; all Jinja2 templates are visible, auditable, and modifiable</div>
            </div>
          </div>

          <div style="background:var(--pf-global--BackgroundColor--200);border:1px solid var(--pf-global--BorderColor--100);border-radius:6px;padding:16px 20px;">
            <h3 style="margin:0 0 12px;font-size:15px;font-weight:600;">${shieldIcon}Deployment Options</h3>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:14px;">
              <div>${checkIcon}<strong>Run locally</strong> &mdash; <code>podman run -p 8000:8000 quay.io/dds/clusterfile-editor</code></div>
              <div>${checkIcon}<strong>Air-gapped install</strong> &mdash; mirror the container image to your internal registry</div>
              <div>${checkIcon}<strong>CLI-only mode</strong> &mdash; <code>process.py</code> works without the web editor, no network needed</div>
              <div>${checkIcon}<strong>Minimal image</strong> &mdash; Python 3.12 slim base, no unnecessary packages</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;
}

/**
 * Render Guide section — step-by-step getting-started walkthrough
 */
const _guideCache = {};

function renderGuideSection(container) {
  container.innerHTML = `
    <div class="form-section">
      <h2 class="form-section__title">Getting Started</h2>
      <p class="form-description">Step-by-step guide to creating and rendering a cluster configuration.</p>
      <div id="guide-content"><em>Loading…</em></div>
    </div>`;
  loadGuideContent(container.querySelector('#guide-content'));
}

async function loadGuideContent(el) {
  if (!_guideCache.content) {
    try {
      const resp = await fetch('/static/collateral/guide.md');
      _guideCache.content = resp.ok ? await resp.text() : '# Guide unavailable';
    } catch (e) {
      _guideCache.content = '# Guide unavailable';
    }
  }
  el.innerHTML = `<div class="collateral-md guide-md">${marked.parse(_guideCache.content)}</div>`;
  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const action = btn.dataset.action;
      if (action === 'new-document') showNewDocumentModal();
      else if (action === 'goto-todo') navigateToSection('todo');
      else if (action === 'goto-templates') navigateToSection('templates');
      else if (action === 'goto-validation') navigateToSection('validation');
    });
  });
}

/**
 * Render About section with collateral tabs
 */
let _deepLinkApplied = false;
const _collateralCache = {};
const COLLATERAL_TABS = [
  { id: 'overview', label: 'Overview', file: 'one-pager.md', svgs: ['architecture.svg', 'infographic.svg'] },
  { id: 'business-value', label: 'Business Value', file: 'business-value.md' },
  { id: 'comparison', label: 'Comparison', file: 'comparison.md' },
  { id: 'presentation', label: 'Presentation', file: 'deck.md' },
  { id: 'demo-script', label: 'Demo Script', file: 'demo-script.md' }
];

function renderAboutSection(container) {
  const hashTab = getHashSubTab();
  const activeTab = (hashTab && COLLATERAL_TABS.find(t => t.id === hashTab)) ? hashTab : 'overview';

  container.innerHTML = `
    <div class="changelog-page" style="max-width:900px;">
      <div class="form-section">
        <h2 class="form-section__title">About</h2>
        <p class="form-description" style="margin-bottom:16px;">
          Product collateral and documentation for Clusterfile Editor.
        </p>
        <div class="collateral-tabs">
          ${COLLATERAL_TABS.map(t => `
            <button class="collateral-tabs__btn${t.id === activeTab ? ' collateral-tabs__btn--active' : ''}" data-tab="${t.id}">${Help.escapeHtml(t.label)}</button>
          `).join('')}
        </div>
        <div class="collateral-content" id="collateral-content">
          <div class="loading"><div class="loading__spinner"></div></div>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('.collateral-tabs__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.collateral-tabs__btn').forEach(b => b.classList.remove('collateral-tabs__btn--active'));
      btn.classList.add('collateral-tabs__btn--active');
      const hash = '#about/' + btn.dataset.tab;
      if (window.location.hash !== hash) history.pushState(null, '', hash);
      loadCollateralTab(btn.dataset.tab, container.querySelector('#collateral-content'));
    });
  });

  // Set initial hash if on default tab
  if (!hashTab && window.location.hash !== '#about') {
    history.replaceState(null, '', '#about');
  }

  loadCollateralTab(activeTab, container.querySelector('#collateral-content'));
}

async function loadCollateralTab(tabId, contentEl) {
  const tab = COLLATERAL_TABS.find(t => t.id === tabId);
  if (!tab) return;

  // Show spinner only if not cached
  if (!_collateralCache[tab.file]) {
    contentEl.innerHTML = '<div class="loading"><div class="loading__spinner"></div></div>';
  }

  try {
    // Fetch and cache markdown
    if (!_collateralCache[tab.file]) {
      const resp = await fetch(`/static/collateral/${tab.file}`);
      if (!resp.ok) throw new Error(`Failed to load ${tab.file}`);
      _collateralCache[tab.file] = await resp.text();
    }

    const html = marked.parse(_collateralCache[tab.file]);
    let svgHtml = '';

    // Fetch SVGs for overview tab
    if (tab.svgs) {
      for (const svgFile of tab.svgs) {
        if (!_collateralCache[svgFile]) {
          const resp = await fetch(`/static/collateral/${svgFile}`);
          if (resp.ok) _collateralCache[svgFile] = await resp.text();
        }
        if (_collateralCache[svgFile]) {
          svgHtml += `<div class="collateral-svg">${_collateralCache[svgFile]}</div>`;
        }
      }
    }

    contentEl.innerHTML = `<div class="collateral-md">${html}</div>${svgHtml}`;
  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state"><div class="empty-state__title">Failed to load</div><div class="empty-state__description">${Help.escapeHtml(err.message)}</div></div>`;
  }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span>${Help.escapeHtml(message)}</span>
    <span class="toast__close">×</span>
  `;

  toast.querySelector('.toast__close').addEventListener('click', () => {
    toast.remove();
  });

  container.appendChild(toast);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    toast.remove();
  }, 5000);
}

/**
 * Format timestamp
 */
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

/**
 * Fetch schema from API or embedded data
 */
async function fetchSchema() {
  // Standalone mode: use embedded schema
  if (isStandaloneMode) {
    const embeddedEl = document.getElementById('embedded-schema');
    if (embeddedEl) {
      EMBEDDED_SCHEMA = JSON.parse(embeddedEl.textContent);
      return EMBEDDED_SCHEMA;
    }
    throw new Error('No embedded schema found in standalone mode');
  }

  // Server mode: fetch from API
  const response = await fetch(`${API_BASE}/api/schema`);
  if (!response.ok) throw new Error('Failed to fetch schema');
  return response.json();
}

/**
 * Fetch samples from API or embedded data
 */
async function fetchSamples() {
  // Standalone mode: use embedded samples
  if (isStandaloneMode) {
    const embeddedEl = document.getElementById('embedded-samples');
    if (embeddedEl) {
      const data = JSON.parse(embeddedEl.textContent);
      EMBEDDED_SAMPLES = data.samples || [];
      return EMBEDDED_SAMPLES;
    }
    return [];
  }

  // Server mode: fetch from API
  const response = await fetch(`${API_BASE}/api/samples`);
  if (!response.ok) throw new Error('Failed to fetch samples');
  const data = await response.json();
  return data.samples || [];
}

/**
 * Fetch templates from API or embedded data
 */
async function fetchTemplates() {
  // Standalone mode: use embedded templates
  if (isStandaloneMode) {
    const embeddedEl = document.getElementById('embedded-templates');
    if (embeddedEl) {
      const data = JSON.parse(embeddedEl.textContent);
      EMBEDDED_TEMPLATES = data.templates || [];
      return EMBEDDED_TEMPLATES;
    }
    return [];
  }

  // Server mode: fetch from API
  const response = await fetch(`${API_BASE}/api/templates`);
  if (!response.ok) throw new Error('Failed to fetch templates');
  const data = await response.json();
  return data.templates || [];
}

/**
 * Fetch version from API or return embedded version
 */
/**
 * Fetch content-mount status. Container exposes /content if mounted; the
 * backend responds with {mounted, root, files} where files is a sorted list
 * of paths relative to the mount root (e.g. "secrets/pull-secret.json",
 * "manifests/extra.yaml"). Standalone mode has no backend mount.
 */
/**
 * Update the small "N file(s) uploaded in-memory" indicator in the
 * bundle-info row. Hidden when no uploads. Click to clear all.
 */
function refreshUploadedFilesIndicator() {
  const row = document.getElementById('bundle-info-row');
  if (!row) return;
  let badge = document.getElementById('uploaded-files-indicator');
  const map = State.state.uploadedFiles || {};
  const count = Object.keys(map).length;
  if (count === 0) {
    if (badge) badge.style.display = 'none';
    return;
  }
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'uploaded-files-indicator';
    badge.className = 'uploaded-files-indicator';
    badge.title = 'In-memory file uploads from the form (this session only). Click to clear all.';
    badge.addEventListener('click', () => {
      if (!confirm(`Clear all ${Object.keys(State.state.uploadedFiles || {}).length} in-memory uploads?`)) return;
      State.state.uploadedFiles = {};
      refreshUploadedFilesIndicator();
      if (typeof refreshRendered === 'function') refreshRendered();
    });
    row.appendChild(badge);
  }
  badge.textContent = `${count} file${count === 1 ? '' : 's'} uploaded in-memory`;
  badge.style.display = 'inline-flex';
  row.style.display = '';
}

/**
 * Fetch agent-ISO status (cache mount + cached versions + content + pull
 * secret presence). Used to enable/disable the Download Agent ISO button
 * and to populate its tooltip.
 */
async function fetchAgentIsoStatus() {
  if (isStandaloneMode) return null;
  try {
    const r = await fetch(`${API_BASE}/api/agent-iso/status`);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.warn('agent-iso status fetch failed:', e);
    return null;
  }
}

/**
 * Cache the latest agent-ISO status, then refresh the button's enabled state.
 */
function applyAgentIsoStatus(status) {
  State.state.agentIsoStatus = status;
  refreshAgentIsoButton();
  // First-time wiring of the button click; safe to call repeatedly.
  const btn = document.getElementById('agent-iso-btn');
  if (btn && !btn.dataset.wired) {
    btn.dataset.wired = '1';
    btn.addEventListener('click', downloadAgentIso);
  }
}

/**
 * Show/hide and enable/disable the Download Agent ISO button based on the
 * cluster's installMethod, the /cache mount, and pull-secret resolution
 * (either the in-memory upload map or /content has it).
 */
function refreshAgentIsoButton() {
  const btn = document.getElementById('agent-iso-btn');
  if (!btn) return;
  if (isStandaloneMode) { btn.style.display = 'none'; return; }

  const installMethod = State.getNestedValue(State.state.currentObject, 'cluster.installMethod');
  if (installMethod !== 'agent') {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';

  const status = State.state.agentIsoStatus;
  const reasons = [];
  if (!status) {
    reasons.push('Backend status unavailable');
  } else {
    if (!status.cache_mounted) reasons.push('Mount /cache: -v /path/to/cache:/cache:Z');
    else if (!status.cache_writable) reasons.push('/cache mount is not writable for the editor user');
    const pullPath = State.getNestedValue(State.state.currentObject, 'account.pullSecret') || 'secrets/pull-secret.json';
    const haveUpload = !!(State.state.uploadedFiles && State.state.uploadedFiles[pullPath]);
    if (!haveUpload && !status.pull_secret_present) {
      reasons.push(`pull secret unresolved — upload "${pullPath}" via the form or place it under /content`);
    }
    const ver = State.getNestedValue(State.state.currentObject, 'cluster.version');
    if (!ver) reasons.push('cluster.version is required (e.g. 4.21.0)');
  }
  btn.disabled = reasons.length > 0;
  btn.title = reasons.length
    ? reasons.join(' · ')
    : `Build a deploy-ready agent.${status.container_arch}.iso for OCP ${State.getNestedValue(State.state.currentObject, 'cluster.version')} (cached: ${(status.cached_versions || []).map(v => v.version).join(', ') || 'none yet'}).`;
}

/**
 * POST /api/agent-iso, show a Building modal, then save the streamed ISO.
 * Sync request: long timeout (10 min) — first cold build can take minutes.
 */
async function downloadAgentIso() {
  const btn = document.getElementById('agent-iso-btn');
  if (!btn || btn.disabled) return;

  // ISO build always reads /content (when mounted) for secrets/manifests, so
  // prompt for the unlock key up-front rather than after a 403 round-trip.
  const status = State.state.contentStatus || {};
  if (status.unlock_required && !State.state.contentUnlockKey) {
    const key = await promptForContentUnlock();
    if (!key) return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal--iso">
      <div class="modal__header"><h2 class="modal__title">Building agent ISO…</h2></div>
      <div class="modal__body">
        <p>Rendering the agent bundle, fetching <code>openshift-install</code> if needed, and producing the boot ISO.</p>
        <p style="color: var(--pf-global--Color--200); font-size: var(--pf-global--FontSize--xs);">
          First build for a given OCP version downloads the installer (~600 MB) and the RHCOS live ISO (~1 GB).
          Subsequent builds reuse the cache and finish in under a minute.
        </p>
        <div class="iso-spinner" aria-hidden="true"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  btn.disabled = true;

  try {
    const body = {
      yaml_text: State.state.currentYamlText || '',
      arch: (State.state.agentIsoStatus && State.state.agentIsoStatus.container_arch) || undefined,
      files: (State.state.uploadedFiles && Object.keys(State.state.uploadedFiles).length)
        ? State.state.uploadedFiles : null,
    };
    const resp = await fetch(`${API_BASE}/api/agent-iso`, {
      method: 'POST',
      headers: gatedHeaders(),
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      let detail = `HTTP ${resp.status}`;
      try { detail = (await resp.json()).detail || detail; } catch (_) {}
      throw new Error(detail);
    }
    const blob = await resp.blob();
    const cd = resp.headers.get('Content-Disposition') || '';
    const m = /filename="?([^";]+)"?/.exec(cd);
    const filename = (m && m[1]) || 'agent.iso';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filename}`, 'success');
    // Re-fetch status so the cached-versions list updates if this was the first
    // build for this OCP version/arch.
    fetchAgentIsoStatus().then(applyAgentIsoStatus);
  } catch (e) {
    showToast(`ISO build failed: ${e.message}`, 'error');
  } finally {
    overlay.remove();
    refreshAgentIsoButton();
  }
}

async function fetchContentStatus() {
  if (isStandaloneMode) {
    return { mounted: false, root: '', files: [] };
  }
  try {
    const r = await fetch(`${API_BASE}/api/content-status`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    console.warn('content-status fetch failed:', e);
    return { mounted: false, root: '', files: [] };
  }
}

/**
 * Help dialog explaining how to enable file-content rendering. Shown when
 * the user clicks a disabled Display/Output rocker. Tailors guidance to the
 * actual reason (no /content mount vs unlock key not yet entered).
 */
function showEnableContentHelp() {
  const status  = State.state.contentStatus || {};
  const mounted = !!status.mounted;
  const unlockable = mounted && !State.state.contentUnlockKey;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const mountSteps = `
    <p>The editor's <strong>File: content</strong> rocker substitutes real bytes
       for <code>load_file()</code> references at render time. Two equally
       supported sources:</p>
    <ol>
      <li><strong>Mount a host directory at <code>/content</code></strong> — the
          subtree should match the relative paths your clusterfile uses
          (typically <code>secrets/</code>, <code>manifests/</code>,
          <code>certs/</code>). The editor's user inside the container needs
          read access; on RHEL/Fedora add <code>:Z</code> for the SELinux relabel:
        <pre>podman run -d --replace --network host --name clusterfile-editor \\
  -v /path/to/your/content:/content:ro,Z \\
  -v /path/to/cache:/cache:Z \\
  quay.io/dds/clusterfile-editor:latest</pre>
        Then open the form, enter a path, and use the <strong>Upload</strong>
        button on each <code>x-is-file</code> field if you want to override
        what's on disk for this session only.
      </li>
      <li><strong>Per-session in-browser uploads</strong> — every file-path
          field in the form has an <strong>Upload</strong> button. Files are
          held in memory only (no localStorage / sessionStorage / IndexedDB),
          and reload wipes them. No mount required.</li>
    </ol>`;

  const unlockSteps = `
    <p><code>/content</code> is mounted at <code>${Help.escapeHtml(status.root || '/content')}</code>
       (${(status.files || []).length} files). Reading from it requires this
       restart's unlock key. Get it from the container logs:</p>
    <pre>podman logs clusterfile-editor 2&gt;&amp;1 | grep -A1 "unlock key"</pre>
    <p>Then click <strong>Enter unlock key</strong> below. The key is
       remembered in this browser tab only — never written to local
       storage. Restarting the container generates a new key.</p>`;

  overlay.innerHTML = `
    <div class="modal modal--enable-content">
      <div class="modal__header"><h2 class="modal__title">Enable file-content rendering</h2></div>
      <div class="modal__body">
        ${unlockable ? unlockSteps : mountSteps}
      </div>
      <div class="modal__footer">
        ${unlockable ? '<button class="btn btn--primary" id="help-unlock">Enter unlock key</button>' : ''}
        <button class="btn btn--secondary" id="help-close">Close</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#help-close')?.addEventListener('click', () => overlay.remove());
  overlay.querySelector('#help-unlock')?.addEventListener('click', async () => {
    overlay.remove();
    const key = await promptForContentUnlock();
    if (key) {
      // Re-evaluate rocker disabled state and refresh the rendered pane.
      const status = await fetchContentStatus();
      applyContentStatus(status);
      if (typeof refreshAgentIsoButton === 'function') refreshAgentIsoButton();
    }
  });
}

/**
 * Show a small modal asking for the per-restart unlock key. Resolves with
 * the entered key on success (also stashes it in State.state.contentUnlockKey
 * for subsequent requests), or null if the user cancels.
 *
 * Key is held in memory only; never written to localStorage / sessionStorage.
 */
async function promptForContentUnlock() {
  if (State.state.contentUnlockKey) return State.state.contentUnlockKey;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal--unlock">
        <div class="modal__header"><h2 class="modal__title">Unlock file-content reads</h2></div>
        <div class="modal__body">
          <p>The editor printed a per-restart key when it started. Get it via:</p>
          <pre style="background:var(--pf-global--BackgroundColor--200);padding:8px;border-radius:4px;font-size:var(--pf-global--FontSize--xs);">podman logs clusterfile-editor 2&gt;&amp;1 | grep -A1 "unlock key"</pre>
          <input type="password" id="unlock-key-input" class="form-input" autocomplete="off"
                 placeholder="Paste the unlock key" style="margin-top:12px;width:100%;">
          <p style="margin-top:8px;color:var(--pf-global--Color--200);font-size:var(--pf-global--FontSize--xs);">
            Stored in this browser tab only. Never persisted; reload wipes it.
          </p>
        </div>
        <div class="modal__footer">
          <button class="btn btn--secondary" id="unlock-cancel">Cancel</button>
          <button class="btn btn--primary" id="unlock-submit">Unlock</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#unlock-key-input');
    input.focus();

    const cleanup = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('#unlock-cancel').addEventListener('click', () => cleanup(null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });
    const submit = async () => {
      const key = (input.value || '').trim();
      if (!key) return;
      try {
        const r = await fetch(`${API_BASE}/api/content-unlock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key }),
        });
        if (!r.ok) throw new Error('Invalid key');
        State.state.contentUnlockKey = key;
        cleanup(key);
      } catch (e) {
        input.value = '';
        input.placeholder = 'Wrong key — try again';
      }
    };
    overlay.querySelector('#unlock-submit').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  });
}

/**
 * Build fetch headers for any endpoint that may need the unlock key.
 * Centralized so all gated callers stay consistent.
 */
function gatedHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (State.state.contentUnlockKey) h['X-Content-Unlock'] = State.state.contentUnlockKey;
  return h;
}

/**
 * Wire one rocker toggle. Drives `State.state[stateKey]` and re-renders via
 * `onChange` when flipped. Disabled when the /content mount is absent.
 */
function wireRocker(toggleId, stateKey, mounted, onChange) {
  const toggle = document.getElementById(toggleId);
  if (!toggle) return;
  if (typeof State.state[stateKey] !== 'boolean') State.state[stateKey] = false;
  const opts = toggle.querySelectorAll('.rocker__opt');
  const setMode = (mode) => {
    State.state[stateKey] = (mode === 'content');
    toggle.classList.toggle('is-content', mode === 'content');
    toggle.setAttribute('aria-checked', mode === 'content' ? 'true' : 'false');
    opts.forEach(o => o.classList.toggle('is-active', o.dataset.mode === mode));
  };
  if (!mounted) {
    State.state[stateKey] = false;
    toggle.classList.add('is-disabled');
    toggle.title = 'File content disabled — /content not mounted. Click for setup steps.';
  } else {
    toggle.classList.remove('is-disabled');
    toggle.title = 'Toggle between path placeholders and substituted file content from the mounted /content directory.';
  }
  setMode(State.state[stateKey] ? 'content' : 'path');
  if (!toggle.dataset.wired) {
    toggle.dataset.wired = '1';
    // Click on a disabled rocker (anywhere on the pill) shows the explainer
    // dialog with concrete steps to enable file-content rendering.
    toggle.addEventListener('click', (e) => {
      if (toggle.classList.contains('is-disabled')) {
        e.preventDefault();
        e.stopPropagation();
        showEnableContentHelp();
      }
    });
    const flip = async (mode) => {
      if (toggle.classList.contains('is-disabled')) return;
      const next = (mode === 'content');
      if (next === State.state[stateKey]) return;
      // Gate: flipping to "content" against a mounted /content requires the
      // per-restart unlock key. Prompt once; cancel snaps back to path.
      if (next) {
        const status = State.state.contentStatus || {};
        if (status.unlock_required && !State.state.contentUnlockKey) {
          const key = await promptForContentUnlock();
          if (!key) return;  // user cancelled; rocker stays on path
        }
      }
      setMode(mode);
      if (onChange) onChange();
    };
    opts.forEach(opt => opt.addEventListener('click', () => flip(opt.dataset.mode)));
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        flip(State.state[stateKey] ? 'path' : 'content');
      }
    });
  }
}

/**
 * Reflect content-mount state in the bundle-info row and wire both rockers.
 *  - Display rocker (#secrets-toggle) drives State.includeContent — what's
 *    shown on screen. Flipping it re-renders the active mode.
 *  - Output rocker (#output-toggle) drives State.includeContentForOutput —
 *    what Copy/Download produce. Independent so a private screen can still
 *    export full content (or vice versa). No re-render on flip.
 */
function applyContentStatus(status) {
  State.state.contentStatus = status;

  const infoRow  = document.getElementById('bundle-info-row');
  const infoText = document.getElementById('bundle-info-text');
  if (infoText) {
    if (status.mounted) {
      const sample = status.files.slice(0, 3).map(Help.escapeHtml).join(', ');
      const more = status.files.length > 3 ? `, +${status.files.length - 3} more` : '';
      infoText.innerHTML = `Content mounted at <code>${Help.escapeHtml(status.root)}</code> — ${status.files.length} file${status.files.length === 1 ? '' : 's'}${status.files.length ? ': ' + sample + more : ''}. Any <code>load_file()</code> path resolves under the mount root.`;
    } else {
      infoText.innerHTML = `<code>&lt;file:…&gt;</code> placeholders are expanded by the CLI at render time. Mount a host directory at <code>/content</code> (containing <code>secrets/</code>, <code>manifests/</code>, <code>certs/</code>, etc.) to substitute content here.`;
    }
  }
  if (infoRow && (status.mounted || State.state.installMethod)) {
    infoRow.style.display = '';
  }

  wireRocker('secrets-toggle', 'includeContent', status.mounted, refreshRendered);
  wireRocker('output-toggle', 'includeContentForOutput', status.mounted, null);
}

async function fetchVersion() {
  // Standalone mode: use embedded version
  if (isStandaloneMode) {
    const embeddedEl = document.getElementById('embedded-version');
    if (embeddedEl) {
      return JSON.parse(embeddedEl.textContent);
    }
    return { version: APP_VERSION, mode: 'standalone' };
  }

  // Server mode: fetch from API
  const response = await fetch(`${API_BASE}/healthz`);
  if (!response.ok) throw new Error('Failed to fetch version');
  return response.json();
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

// Export for debugging and cross-module access
window.ClusterfileEditor = {
  State,
  Validator,
  Help,
  CodeMirror,
  Form,
  init,
  loadDocument,
  newDocument,
  showToast,
  navigateToSection,
  refreshCurrentSection: renderCurrentSection
};
