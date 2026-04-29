# Clusterfile Template Processor

A Jinja2 template engine for generating OpenShift and Kubernetes configuration from declarative YAML clusterfiles. One data file describes your entire cluster — the processor renders installation manifests, ACM policies, operator subscriptions, and pre-flight checks.

**Web editor**: [quay.io/dds/clusterfile-editor](https://quay.io/repository/dds/clusterfile-editor) — schema-driven, offline-first UI for editing clusterfiles in a browser.

## How it works

```
clusterfile (YAML)  +  template (.yaml.tpl)  →  rendered output
```

A **clusterfile** contains all cluster parameters: name, version, platform, networking, hosts, storage, BMC credentials, operator plugins. A **template** consumes the clusterfile and produces Kubernetes-ready YAML — install configs, agent configs, ACM resources, operator manifests, shell scripts.

```bash
# Render an install-config.yaml for agent-based install
./process.py data/baremetal-bond-vlan.clusterfile templates/install-config.yaml.tpl

# Render ACM ZTP manifests for managed cluster provisioning
./process.py data/baremetal.clusterfile templates/acm-ztp.yaml.tpl

# Render all operator manifests for post-install
./process.py data/acm-hub-sno.clusterfile templates/operators.yaml.tpl
```

## Quick start

### Requirements

- Python 3.8+
- pip

### Install

```bash
pip install jinja2 pyyaml yamllint jsonpath-ng jsonschema
```

### Render your first template

```bash
# Clone and enter the repo
git clone https://github.com/purefield/jinja2-template-processor.git
cd jinja2-template-processor

# Render an install-config for a baremetal cluster
./process.py data/baremetal.clusterfile templates/install-config.yaml.tpl
```

## Use cases

### Agent-Based Install (ABI)

Generate `install-config.yaml` and `agent-config.yaml` for the OpenShift agent-based installer:

```bash
./process.py data/baremetal-bond-vlan.clusterfile templates/install-config.yaml.tpl > install-config.yaml
./process.py data/baremetal-bond-vlan.clusterfile templates/agent-config.yaml.tpl > agent-config.yaml
```

`install-config.yaml.tpl` preserves native multi-document YAML when extra manifests are present, so the first document remains valid for `openshift-install`.

### IPI (Installer Provisioned Infrastructure)

Generate platform-specific install configs for cloud providers:

```bash
# AWS
./process.py data/ipi-aws.clusterfile templates/install-config.yaml.tpl

# vSphere with static IPs
./process.py data/ipi-vsphere.clusterfile templates/install-config.yaml.tpl

# Azure, GCP, Nutanix, OpenStack, IBM Cloud — same pattern
./process.py data/ipi-azure.clusterfile templates/install-config.yaml.tpl
```

### ACM Zero Touch Provisioning (ZTP)

Generate all resources for ACM-managed bare metal provisioning — Namespace, Secrets, AgentClusterInstall, ClusterDeployment, BareMetalHosts, NMState configs, InfraEnv:

```bash
./process.py data/baremetal.clusterfile templates/acm-ztp.yaml.tpl > acm-ztp.yaml
oc apply -f acm-ztp.yaml
```

### ACM CAPI + Metal3

Generate Cluster API resources with the Metal3 provider:

```bash
./process.py data/baremetal.clusterfile templates/acm-capi-m3.yaml.tpl > acm-capi-m3.yaml
oc apply -f acm-capi-m3.yaml
```

### Day-2 Operators

Generate operator installation manifests for post-install application:

```bash
# All configured operators as standalone manifests
./process.py data/acm-hub-sno.clusterfile templates/operators.yaml.tpl > operators.yaml
oc apply -f operators.yaml
```

Operators are also automatically included as:
- **ABI extra manifests** in `install-config.yaml.tpl`
- **ACM Policies** in `acm-ztp.yaml.tpl` and `acm-capi-m3.yaml.tpl`

### SiteConfig ClusterInstance

Generate a [ClusterInstance](https://github.com/stolostron/siteconfig) CR for the SiteConfig operator. This bridges our clusterfile with the ACM SiteConfig provisioning workflow:

```bash
# Clusterfile → ClusterInstance CR (Namespace, Secrets, ClusterInstance)
./process.py data/siteconfig-sno.clusterfile templates/clusterfile2siteconfig.yaml.tpl

# Reverse: ClusterInstance CR → clusterfile
./process.py clusterinstance.yaml templates/siteconfig2clusterfile.yaml.tpl
```

New fields from the ClusterInstance data model:
- `cluster.clusterType` — SNO, HighlyAvailable, HighlyAvailableArbiter
- `cluster.cpuPartitioningMode` — None, AllNodes (workload partitioning)
- `cluster.diskEncryption` — structured disk encryption (TPM2, Tang)
- `cluster.holdInstallation` — pause provisioning for pre-flight checks
- Per-host: `bootMode`, `nodeLabels`, `automatedCleaningMode`, `ironicInspect`, `installerArgs`, `ignitionConfigOverride`

### KubeVirt (OpenShift Virtualization)

Generate VirtualMachine resources for OpenShift Virtualization clusters:

```bash
./process.py data/kubevirt.clusterfile templates/kubevirt-cluster.yaml.tpl
```

### Pre-flight Checks

Generate validation scripts for DNS, NTP, BMC, network, and registry connectivity:

```bash
# All checks
./process.py data/baremetal.clusterfile templates/pre-check.sh.tpl | bash

# Individual checks
./process.py data/baremetal.clusterfile templates/pre-check-dns.sh.tpl | bash
./process.py data/baremetal.clusterfile templates/pre-check-bmc.sh.tpl | bash
```

## Clusterfile anatomy

A clusterfile has four main sections:

```yaml
account:
  pullSecret: path/to/pull-secret.json    # Red Hat pull secret

cluster:
  name: my-cluster
  version: "4.21.0"
  platform: baremetal                       # baremetal, none, aws, azure, gcp, vsphere, ...
  arch: x86_64
  sshKeys:
    - path/to/id_rsa.pub
  location: dc1

network:
  domain: example.com
  primary:
    gateway: 10.0.0.1
    subnet: 10.0.0.0/24
  cluster:
    subnet: 10.128.0.0/14
  service:
    subnet: 172.30.0.0/16

hosts:
  node1.example.com:
    role: control                           # control or worker
    storage:
      os: { deviceName: /dev/sda }
    bmc:
      vendor: dell
      address: 10.0.1.1
      username: root
      password: bmc-password.txt
    network:
      interfaces:
        - name: eno1
          macAddress: "00:1A:2B:3C:4D:01"
      primary:
        address: 10.0.0.10
        ports: [eno1]
```

### Optional sections

```yaml
cluster:
  disconnected: true                        # Air-gapped installation
  tpm: true                                 # TPM disk encryption
  mirrors:                                  # Registry mirrors for disconnected
    - source: registry.redhat.io
      mirrors: [mirror.local/redhat]
  catalogSources:                           # Custom operator catalogs
    - name: custom-operators
      image: mirror.local/catalog:v4.21

network:
  proxy:                                    # Cluster-wide proxy
    httpProxy: http://proxy:8080
    httpsProxy: http://proxy:8080
    noProxy: .cluster.local,10.0.0.0/8
  trustBundle: /path/to/ca-bundle.pem       # Additional trust CA
  secondary:                                # Secondary networks (SR-IOV, bridges)
    - name: storage-net
      type: linux-bridge
      vlan: 100
      ports: [eth1]
      subnet: 192.168.1.0/24

plugins:
  kubevirt:                                 # Platform plugin (KubeVirt example)
    storageClass:
      default: ocs-storagecluster-ceph-rbd
      performance: lvms-vg1
    network:
      type: cudn
  operators:                                # Day-2 operator plugins
    argocd: {}                              # {} = all defaults
    lvm: {}
    acm:
      multiClusterHub:
        availabilityConfig: Basic
    cert-manager: {}
    external-secrets: {}
```

## Operator plugins

Each operator is configured under `plugins.operators.<name>`. Specify `{}` for all defaults, or override individual settings:

| Operator | Key | Default Channel | What it installs |
|----------|-----|-----------------|-----------------|
| [ArgoCD](plugins/operators/argocd/) | `argocd` | `latest` | GitOps operator + ArgoCD instance + optional bootstrap Application |
| [LVM Storage](plugins/operators/lvm/) | `lvm` | `stable` | LVMS operator + LVMCluster with deviceClasses |
| [ODF](plugins/operators/odf/) | `odf` | `stable-4.18` | ODF operator + StorageCluster + ConsolePlugin |
| [ACM](plugins/operators/acm/) | `acm` | `release-2.14` | ACM operator + MultiClusterHub + AgentServiceConfig + Provisioning |
| [cert-manager](plugins/operators/cert-manager/) | `cert-manager` | `stable-v1` | cert-manager operator (install-and-go) |
| [external-secrets](plugins/operators/external-secrets/) | `external-secrets` | `stable-v1` | external-secrets operator (global scope) |

Every operator supports these common overrides:

```yaml
plugins:
  operators:
    lvm:
      channel: stable-4.19        # OLM subscription channel
      source: my-catalog           # Catalog source (disconnected)
      approval: Manual             # InstallPlan approval (Automatic/Manual)
```

Each operator generates two template files:
- **`manifests.yaml.tpl`** — standalone YAML for `oc apply` or ABI extra manifests
- **`policy.yaml.tpl`** — ACM Policy + PlacementBinding for ZTP/CAPI managed clusters

See each operator's README for full configuration reference.

## Platform plugins

Platform plugins configure cloud-specific settings in `install-config.yaml`. They live in `plugins/platforms/` and are selected automatically based on `cluster.platform`:

| Platform | Plugin Config | Templates |
|----------|--------------|-----------|
| AWS | `plugins.aws` | platform, controlPlane, compute, creds |
| Azure | `plugins.azure` | platform, controlPlane, compute, creds |
| GCP | `plugins.gcp` | platform, controlPlane, compute, creds |
| vSphere | `plugins.vsphere` | platform, controlPlane, compute, creds |
| OpenStack | `plugins.openstack` | platform, controlPlane, compute, creds |
| IBM Cloud | `plugins.ibmcloud` | platform, controlPlane, compute, creds |
| Nutanix | `plugins.nutanix` | platform, controlPlane, compute, creds |
| KubeVirt | `plugins.kubevirt` | platform |
| Baremetal | — | platform |
| None (SNO) | — | platform |

## CLI reference

```
./process.py [data-file] [template-file] [options]
```

| Flag | Description |
|------|-------------|
| `-p key=value` | Override or create a field (dotted path: `-p cluster.name=foo`) |
| `-s schema.json` | Validate input against JSON Schema |
| `-S` | Validate both input and after `-p` overrides |

### Inline JSON

```bash
./process.py '{"cluster":{"name":"inline"}}' templates/install-config.yaml.tpl
```

### Parameter-only mode

```bash
./process.py templates/install-config.yaml.tpl -p cluster.name=test -p cluster.version=4.21.0
```

## Web editor

The Clusterfile Editor is a browser-based UI for editing clusterfiles with schema-driven forms, live YAML preview, and template rendering.

### Run from container

```bash
# Minimal — `<file:…>` references render as path placeholders.
podman run -d --name clusterfile-editor -p 8000:8000 quay.io/dds/clusterfile-editor:latest
# Open http://localhost:8000
```

### Mounting your include content (optional, but required for the agent ISO download)

Templates use `load_file()` to inline pull secrets, SSH keys, certs, BMC
passwords, extra manifests — anything referenced by an `x-is-file` schema
field. The container can substitute those references for you at render time
when you mount the directory whose layout matches the paths in your
clusterfile at `/content` (read-only). Without it, every reference renders
as its `<file:…>` placeholder.

Two complementary ways to provide content:

1. **Host mount at `/content`** — for files that live on the operator's
   host (typical for production secrets). Lay out subdirs the way your
   clusterfile references them.
2. **Per-session in-browser uploads** — every `x-is-file` field in the form
   has an **Upload** button. Files are held in memory only (no
   `localStorage`/`sessionStorage`/`IndexedDB`) and reload wipes them. No
   mount needed.

```bash
# Layout under /content mirrors the paths your clusterfile uses, e.g.:
#   /path/to/your/content/secrets/pull-secret.json
#   /path/to/your/content/secrets/id_rsa.pub
#   /path/to/your/content/manifests/extra-machineconfig.yaml
#   /path/to/your/content/certs/internal-ca.crt
podman run -d --name clusterfile-editor -p 8000:8000 \
  -v /path/to/your/content:/content:ro,Z \
  quay.io/dds/clusterfile-editor:latest
```

**Per-restart unlock key.** When `/content` is mounted, reads are gated on a
per-restart secret printed once to stdout when the app starts. The UI prompts
for it the first time you flip **File: content** or click **Download Agent
ISO**. Get it via `podman logs clusterfile-editor 2>&1 | grep -A1 "unlock key"`.
Stored in browser memory only; never written to local storage; regenerated on
every restart.

Path-traversal escapes (`../`) are blocked. The inventory endpoint returns
relative paths only, never file content.

### Mounting the agent ISO build cache (required for the agent ISO download)

The **Download Agent ISO** button runs `openshift-install agent create image`
inside the container. To avoid re-downloading `openshift-install` (~600 MB)
and the RHCOS live ISO (~1 GB) every restart, mount a writable host directory
at `/cache`:

```bash
# Create the cache dir and chown it so the container's editor user can write.
# Container user is UID 999 inside; outside the user namespace this is one of
# your subuid range. `podman unshare chown` handles the mapping for you.
mkdir -p /path/to/cache
podman unshare chown -R 999:999 /path/to/cache

podman run -d --replace --network host --name clusterfile-editor \
  -v /path/to/your/content:/content:ro,Z \
  -v /path/to/cache:/cache:Z \
  quay.io/dds/clusterfile-editor:latest
```

Cache layout (managed by the editor — don't touch):

```
/path/to/cache/
  bin/
    openshift-install/
      4.21.0/x86_64/openshift-install
      4.20.5/x86_64/openshift-install
  agent/
    image_cache/                     # RHCOS live ISO per OCP version
```

**Disconnected / air-gapped editor host.** Pre-stage on a connected machine:

```
# 1. Pre-cache openshift-install for the OCP versions you need
mkdir -p /path/to/cache/bin/openshift-install/4.21.0/x86_64
curl -sL https://mirror.openshift.com/pub/openshift-v4/clients/ocp/4.21.0/openshift-install-linux.tar.gz \
  | tar -xz -C /path/to/cache/bin/openshift-install/4.21.0/x86_64 openshift-install

# 2. Pre-cache the RHCOS live ISO matching the version
mkdir -p /path/to/cache/agent/image_cache
# (download from mirror.openshift.com per your OCP version)

# 3. Move /path/to/cache to your air-gapped host and run the editor with no internet.
```

The agent installer respects mirror configuration from your clusterfile
(`cluster.mirrors`, `cluster.disconnected`, `cluster.catalogSources`,
`network.trustBundle`), so disconnected installs Just Work once the binary
and RHCOS are cached locally.

### Build from source

```bash
# From repo root
podman build -t clusterfile-editor -f apps/editor/Containerfile .
podman run -d --name clusterfile-editor -p 8000:8000 clusterfile-editor
```

### Development mode

```bash
cd apps/editor
pip install fastapi[standard] jinja2 yamllint jsonpath-ng jsonschema pyyaml uvicorn
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Container image (CLI)

Use the CLI processor as a container:

```bash
# Build
podman build -t quay.io/dds/process:latest -f Containerfile .

# Run from the current repo checkout
podman run --rm -v "$PWD":/work:Z quay.io/dds/process:latest \
  data/baremetal.clusterfile templates/install-config.yaml.tpl
```

The image is based on Red Hat UBI Python and runs `process.py` directly, so container arguments are passed straight through to the CLI. Mount the repo at `/work` and use normal relative paths from the checkout.

For a local wrapper that handles path mapping automatically, use [`process.sh`](/home/dschimpf/Documents/project/infrastructure/openshift-installation/clusterfile/process.sh):

```bash
./process.sh data/baremetal.clusterfile templates/install-config.yaml.tpl
./process.sh templates/install-config.yaml.tpl -p cluster.name=test -p cluster.version=4.21.0
```

`process.sh` overrides the container entrypoint explicitly, so it works even if the published image still has an older shell-style entrypoint. It mounts the repo, the current working directory, and any extra file parents needed for file arguments.

## Recommended Directory Layout

The most reliable way to use the processor is to keep your clusterfile, referenced secrets, and referenced manifest files under one mounted project root.

Example project layout:

```text
my-project/
├── clusterfile/                          # This repo
│   ├── templates/
│   └── process.sh
├── clusterfiles/
│   └── my-cluster.clusterfile            # Your cluster input
├── secrets/
│   ├── pull-secret.json
│   ├── ca.crt
│   ├── id_rsa.pub
│   ├── control01-password.txt
│   └── worker01-password.txt
├── manifests/
│   ├── 99-crio-config.yaml
│   └── 99-set-core-passwd-master.yaml
```

Use paths in the clusterfile relative to that project root:

```yaml
account:
  pullSecret: secrets/pull-secret.json
cluster:
  sshKeys:
    - secrets/id_rsa.pub
  manifests:
    - name: crio-config
      file: manifests/99-crio-config.yaml
network:
  trustBundle: secrets/ca.crt
hosts:
  control01.example.com:
    bmc:
      password: secrets/control01-password.txt
```

Prefer relative paths like these over machine-specific absolute paths such as `/home/user/...`. Relative paths are portable, work better with container mounts, and make the clusterfile easier to share.

## Portable Example

A portable example clusterfile is included at [`clusterfiles/process.clusterfile`](/home/dschimpf/Documents/project/infrastructure/openshift-installation/clusterfiles/process.clusterfile). It is synthetic on purpose and does not assume a specific lab, company, hostname scheme, or filesystem outside the project root shown above.

Render `install-config.yaml`:

```bash
podman run --rm \
  -w /src \
  -v /path/to/my-project:/src:Z \
  -v /path/to/my-project/clusterfile:/clusterfile:Z \
  quay.io/dds/process:latest \
  /src/clusterfiles/my-cluster.clusterfile \
  /clusterfile/templates/install-config.yaml.tpl
```

Render ACM ZTP manifests:

```bash
podman run --rm \
  -w /src \
  -v /path/to/my-project:/src:Z \
  -v /path/to/my-project/clusterfile:/clusterfile:Z \
  quay.io/dds/process:latest \
  /src/clusterfiles/my-cluster.clusterfile \
  /clusterfile/templates/acm-ztp.yaml.tpl
```

Or use the wrapper from the repo root:

```bash
cd /path/to/my-project
IMAGE_REF=quay.io/dds/process:latest ./clusterfile/process.sh \
  clusterfiles/my-cluster.clusterfile \
  clusterfile/templates/install-config.yaml.tpl
```

## Path Rules

- The data file path and template path may live under different mounted roots.
- Relative file references inside the clusterfile are resolved from the current working directory used when running `process.py`.
- For container runs, set `-w` to the project root that matches the relative paths used in the clusterfile.
- If a referenced file is not loaded, check both:
  - whether the path is correct relative to the chosen working directory
  - whether the mounted container user can read the file
- `install-config.yaml.tpl` emits raw multi-document YAML when extra manifests are present.
- `acm-ztp.yaml.tpl` emits a Kubernetes `kind: List` for direct apply workflows.

## Example Clusterfiles

The examples in `data/` are meant to answer a small number of real questions:

- "What is the simplest starting point for this install style?"
- "How do I add one specific capability or variation?"
- "What does a cloud or platform-specific example look like?"

The goal is not to provide dozens of unrelated samples. Start from the closest baseline example, then borrow focused pieces from the variants.

### Safe Example Files

All example clusterfiles now point at placeholder files under `data/secrets/`.

- These files are intentionally fake.
- They are present so examples render without local secret files.
- They use obvious placeholder content to avoid looking like real credentials.

Use them for learning and template testing only. Replace them with your real file paths in your own clusterfiles.

### Start Here

| File | Purpose |
|------|---------|
| `data/baremetal.clusterfile` | Best general starting point for agent-based baremetal installs. Demonstrates the full baseline shape: pull secret, SSH keys, trust bundle, BMC, network, mirrors, disconnected catalogs, and operator examples. |
| `data/sno.clusterfile` | Best starting point for Single Node OpenShift. Demonstrates `platform: none`, `clusterType: SNO`, and a minimal single-node install flow. |
| `data/acm-hub-sno.clusterfile` | Best starting point for "hub on one node" workflows. Demonstrates ACM hub plus operator-driven day-2 content. |
| `data/siteconfig-sno.clusterfile` | Best starting point when your target output is SiteConfig / ClusterInstance-style content rather than a classic install-config only flow. |
| `data/kubevirt.clusterfile` | Best starting point for KubeVirt-backed clusters. Demonstrates the KubeVirt platform plugin and VM-oriented sizing/storage mappings. |

### Focused Variants

Use these when you already know the baseline and want one specific difference:

| File | Purpose |
|------|---------|
| `data/baremetal-vlan.clusterfile` | Adds VLAN-based primary networking to the baremetal baseline. |
| `data/baremetal-bond.clusterfile` | Adds bonded NICs to the baremetal baseline. |
| `data/baremetal-bond-vlan.clusterfile` | Combines bonding and VLANs. Use this when both are needed. |
| `data/baremetal-compact.clusterfile` | Shows a compact 3-node cluster with no workers. |
| `data/kubevirt-sno.clusterfile` | KubeVirt Single Node OpenShift. |
| `data/kubevirt-compact.clusterfile` | KubeVirt compact topology. |
| `data/agent-nutanix.clusterfile` | Agent-based Nutanix example. Use when Nutanix is the virtualization layer but the install style is still agent-based. |

### Cloud / IPI Examples

Use these when the platform itself is the main thing you need to learn:

| File | Purpose |
|------|---------|
| `data/ipi-aws.clusterfile` | AWS IPI baseline. |
| `data/ipi-azure.clusterfile` | Azure IPI baseline. |
| `data/ipi-gcp.clusterfile` | GCP IPI baseline. |
| `data/ipi-ibmcloud.clusterfile` | IBM Cloud IPI baseline. |
| `data/ipi-openstack.clusterfile` | OpenStack IPI baseline. |
| `data/ipi-vsphere.clusterfile` | vSphere IPI baseline with static IP handling. |
| `data/ipi-nutanix.clusterfile` | Nutanix IPI baseline. |

### Practical Guidance

- If you are new, start with `data/baremetal.clusterfile` or `data/sno.clusterfile`.
- If you need a feature, copy only the relevant section from a variant instead of starting from the most complex file.
- If you need a cloud, start with the matching `ipi-*` example rather than adapting a baremetal file.
- Treat `data/secrets/` as render-safe scaffolding, not as production input.

## Project structure

```
.
├── process.py                          # CLI template processor
├── schema/
│   └── clusterfile.schema.json         # JSON Schema for clusterfile validation
├── data/                               # Example clusterfiles
├── templates/                          # Jinja2 templates (.yaml.tpl)
│   ├── includes/                       # Reusable template fragments (nmstate, bmc, etc.)
├── plugins/
│   ├── operators/                      # Operator plugins (co-located schema + templates)
│   └── platforms/                      # Platform-specific includes (aws, vsphere, etc.)
│       ├── argocd/                     # ArgoCD operator
│       ├── lvm/                        # LVM Storage operator
│       ├── odf/                        # OpenShift Data Foundation
│       ├── acm/                        # Advanced Cluster Management
│       ├── cert-manager/               # cert-manager operator
│       └── external-secrets/           # external-secrets operator
├── apps/
│   └── editor/                         # Web editor (FastAPI + vanilla JS)
└── tests/
    └── test_templates.py               # 95 pytest tests
```

## Schema validation

The clusterfile schema (`schema/clusterfile.schema.json`) validates all sections including operator plugins. The web editor uses it for form generation; the CLI uses it with `-s`:

```bash
./process.py data/sno.clusterfile templates/install-config.yaml.tpl \
  -s schema/clusterfile.schema.json -S
```

## Tests

```bash
pip install pytest
python3 -m pytest tests/ -v
```

95 tests covering install-config, agent-config, credentials, platform includes, KubeVirt, ACM ZTP, ACM CAPI, disconnected mode, TPM, insecure mirrors, and all 6 operator plugins.

## License

MIT
