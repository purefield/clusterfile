# OpenShift Data Foundation (ODF) Operator

Ceph-based distributed storage for HA clusters with 3+ nodes and data disks. Provides block, file, and object storage via StorageCluster with configurable device sets.

## Quick start

```yaml
plugins:
  operators:
    odf: {}    # All defaults: stable-<cluster minor> channel, 3-replica StorageCluster
```

## What gets installed

| Resource | Kind | Namespace |
|----------|------|-----------|
| `openshift-storage` | Namespace | — |
| `openshift-storage-operatorgroup` | OperatorGroup | `openshift-storage` |
| `odf-operator` | Subscription | `openshift-storage` |
| `ocs-storagecluster` | StorageCluster | `openshift-storage` |
| `odf-console` | ConsolePlugin | — (optional) |

## Configuration reference

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | bool | `true` | Set `false` to skip installation |
| `channel` | string | `stable-<cluster minor>` | OLM subscription channel |
| `approval` | string | `Automatic` | InstallPlan approval: `Automatic` or `Manual` |
| `source` | string | `redhat-operators` | OLM CatalogSource name |
| `consolePlugin` | bool | `true` | Enable ODF console plugin |

### Storage cluster

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `storageCluster.name` | string | `ocs-storagecluster` | StorageCluster resource name |
| `storageCluster.monDataDirHostPath` | string | `/var/lib/rook` | Host path for Ceph monitor data |
| `storageCluster.defaultStorageClass` | bool | `true` | Mark the Ceph block pool StorageClass as cluster default |
| `storageCluster.defaultVirtualizationStorageClass` | bool | `true` | Mark the Ceph block pool StorageClass as default KubeVirt class |
| `storageCluster.storageDeviceSets` | array | *see below* | Storage device set configurations |

When `storageDeviceSets` is omitted, a single default set is created:

```yaml
storageCluster:
  storageDeviceSets:
    - name: ocs-deviceset
      count: 1
      replica: 3
      storage: 1Ti
```

Each storage device set supports:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | string | `ocs-deviceset` | Device set name |
| `count` | int | `1` | Number of devices per replica |
| `replica` | int | `3` | Replica count (typically 3 for Ceph) |
| `storage` | string | `1Ti` | PVC storage request per device |
| `storageClassName` | string | — | StorageClass for PVCs (empty = cluster default) |

## Examples

### Minimal (all defaults)

```yaml
plugins:
  operators:
    odf: {}
```

Creates a 3-replica StorageCluster with 1Ti devices using the default StorageClass.

### Custom storage cluster

```yaml
plugins:
  operators:
    odf:
      channel: stable-4.22
      storageCluster:
        name: my-storage
        storageDeviceSets:
          - name: fast-set
            count: 2
            replica: 3
            storage: 2Ti
            storageClassName: lvms-vg1
```

### Without console plugin

```yaml
plugins:
  operators:
    odf:
      consolePlugin: false
```

### Disconnected

```yaml
plugins:
  operators:
    odf:
      channel: stable-4.22
      source: my-custom-catalog
      approval: Manual
```

## Render

```bash
# Standalone manifests
./process.py data/acm-hub-sno.clusterfile templates/operators.yaml.tpl

# As ACM Policy for managed clusters
./process.py data/baremetal.clusterfile templates/acm-ztp.yaml.tpl
```

## Template files

| File | Purpose |
|------|---------|
| `manifests.yaml.tpl` | Standalone YAML: Namespace, OperatorGroup, Subscription, StorageCluster, ConsolePlugin |
| `policy.yaml.tpl` | ACM Policy + ConfigurationPolicy (subscription + storagecluster) + PlacementBinding |
