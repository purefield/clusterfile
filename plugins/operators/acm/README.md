# Advanced Cluster Management (ACM) Operator

Sets up a full ACM hub ready for ZTP and CAPI deployments. Installs the operator, MultiClusterHub, AgentServiceConfig for assisted installation, and Provisioning for bare metal management.

## Quick start

```yaml
plugins:
  operators:
    acm: {}    # All defaults: release-2.17 channel, High availability
```

## What gets installed

| Resource | Kind | Namespace |
|----------|------|-----------|
| `open-cluster-management` | Namespace | — |
| `advanced-cluster-management-group` | OperatorGroup | `open-cluster-management` |
| `acm-operator-subscription` | Subscription | `open-cluster-management` |
| `multiclusterhub` | MultiClusterHub | `open-cluster-management` |
| `agent` | AgentServiceConfig | — |
| `provisioning-configuration` | Provisioning | — |

## Configuration reference

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | bool | `true` | Set `false` to skip installation |
| `channel` | string | `release-2.17` | OLM subscription channel |
| `approval` | string | `Automatic` | InstallPlan approval: `Automatic` or `Manual` |
| `source` | string | `redhat-operators` | OLM CatalogSource name |

### MultiClusterHub

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `multiClusterHub.name` | string | `multiclusterhub` | MultiClusterHub resource name |
| `multiClusterHub.availabilityConfig` | string | `High` | `High` for production, `Basic` for SNO/lab |

### AgentServiceConfig

Controls storage for the assisted-service that manages cluster installations:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `agentServiceConfig.databaseStorage` | string | `10Gi` | Database PVC size |
| `agentServiceConfig.filesystemStorage` | string | `100Gi` | Filesystem PVC size (ISOs, logs) |
| `agentServiceConfig.imageStorage` | string | `50Gi` | Image PVC size (OS images) |

### Provisioning

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `provisioning.watchAllNamespaces` | bool | `true` | Allow bare metal provisioning in all namespaces |

## Examples

### Minimal (all defaults)

```yaml
plugins:
  operators:
    acm: {}
```

### SNO hub with Basic availability

```yaml
plugins:
  operators:
    acm:
      multiClusterHub:
        availabilityConfig: Basic
      agentServiceConfig:
        databaseStorage: 10Gi
        filesystemStorage: 50Gi
        imageStorage: 30Gi
```

### Full ACM hub (with companion operators)

A typical ACM hub SNO combines ACM with LVM for storage, ArgoCD for GitOps-managed clusters, cert-manager for TLS, and external-secrets for credential sync:

```yaml
plugins:
  operators:
    acm:
      multiClusterHub:
        availabilityConfig: Basic
    lvm: {}
    argocd:
      bootstrap:
        repoURL: https://gitea.example.com/org/cluster-config.git
        path: operators
    cert-manager: {}
    external-secrets: {}
```

### Disconnected

```yaml
plugins:
  operators:
    acm:
      channel: release-2.16
      source: my-custom-catalog
      approval: Manual
```

## Render

```bash
# Standalone manifests (for hub installation)
./process.py data/acm-hub-sno.clusterfile templates/operators.yaml.tpl

# As ABI extra manifests (install-time)
./process.py data/acm-hub-sno.clusterfile templates/install-config.yaml.tpl
```

## SiteConfig / ClusterInstance

For provisioning managed clusters using the SiteConfig operator (stolostron/siteconfig), use the `clusterfile2siteconfig.yaml.tpl` template to generate a ClusterInstance CR from a clusterfile:

```bash
./process.py data/siteconfig-sno.clusterfile templates/clusterfile2siteconfig.yaml.tpl
```

This generates a complete set of resources (Namespace, pull-secret, BMC Secrets, ClusterInstance CR) ready for `oc apply` on an ACM hub.

## ACM Policy note

The `policy.yaml.tpl` for ACM is a stub. ACM hub is self-managed and should not be pushed to clusters via ACM Policy. The file exists for architectural consistency with other operators but produces no output.

## Template files

| File | Purpose |
|------|---------|
| `manifests.yaml.tpl` | Standalone YAML: Namespace, OperatorGroup, Subscription, MultiClusterHub, AgentServiceConfig, Provisioning |
| `policy.yaml.tpl` | Stub (ACM hub is self-managed, not pushed via ACM Policy) |
