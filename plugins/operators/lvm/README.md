# LVM Storage (LVMS) Operator

Local volume management for SNO and compact clusters using TopoLVM. Creates volume groups from local disks with thin provisioning support.

## Quick start

```yaml
plugins:
  operators:
    lvm: {}    # All defaults: stable channel, single vg1 with thin pool
```

## What gets installed

| Resource | Kind | Namespace |
|----------|------|-----------|
| `openshift-storage` | Namespace | — |
| `openshift-storage-operatorgroup` | OperatorGroup | `openshift-storage` |
| `lvms-operator` | Subscription | `openshift-storage` |
| `lvmcluster` | LVMCluster | `openshift-storage` |

## Configuration reference

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | bool | `true` | Set `false` to skip installation |
| `channel` | string | `stable-<cluster minor>` | OLM subscription channel (e.g. `stable-4.22`) |
| `approval` | string | `Automatic` | InstallPlan approval: `Automatic` or `Manual` |
| `source` | string | `redhat-operators` | OLM CatalogSource name |
| `deviceClasses` | array | *see below* | LVM volume group device class configurations |

### Device classes

When `deviceClasses` is omitted, a single default device class is created:

```yaml
deviceClasses:
  - name: vg1
    default: true
    fstype: xfs
    thinPoolConfig:
      name: thin-pool-1
      sizePercent: 90
      overprovisionRatio: 10
```

Each device class supports:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | string | `vg1` | Volume group name |
| `default` | bool | `true` (first) | Set as default StorageClass |
| `fstype` | string | `xfs` | Filesystem type: `xfs` or `ext4` |
| `thinPoolConfig.name` | string | `thin-pool-1` | Thin pool name |
| `thinPoolConfig.sizePercent` | int | `90` | Percentage of VG for thin pool (1-100) |
| `thinPoolConfig.overprovisionRatio` | int | `10` | Thin pool overprovisioning ratio |
| `deviceSelector.paths` | array | — | Explicit device paths (e.g. `/dev/vdb`) |
| `deviceSelector.optionalPaths` | array | — | Optional device paths (used if present) |
| `deviceSelector.forceWipeDevicesAndDestroyAllData` | bool | `false` | Wipe devices before use |

## Examples

### Minimal (all defaults)

```yaml
plugins:
  operators:
    lvm: {}
```

Uses all available disks in a single `vg1` volume group with a thin pool.

### Custom device classes

```yaml
plugins:
  operators:
    lvm:
      deviceClasses:
        - name: vg-fast
          default: true
          fstype: xfs
          thinPoolConfig:
            name: thin-pool-fast
            sizePercent: 90
            overprovisionRatio: 5
          deviceSelector:
            paths:
              - /dev/nvme0n1
              - /dev/nvme1n1
        - name: vg-bulk
          default: false
          fstype: xfs
          deviceSelector:
            paths:
              - /dev/sdb
              - /dev/sdc
```

### Disconnected with specific channel

```yaml
plugins:
  operators:
    lvm:
      channel: stable-4.22
      source: my-custom-catalog
      approval: Manual
```

## Render

```bash
# Standalone manifests
./process.py data/sno.clusterfile templates/operators.yaml.tpl

# As ABI extra manifests
./process.py data/sno.clusterfile templates/install-config.yaml.tpl

# As ACM Policy for managed clusters
./process.py data/baremetal.clusterfile templates/acm-ztp.yaml.tpl
```

## Template files

| File | Purpose |
|------|---------|
| `manifests.yaml.tpl` | Standalone YAML: Namespace, OperatorGroup, Subscription, LVMCluster |
| `policy.yaml.tpl` | ACM Policy + ConfigurationPolicy (subscription + lvmcluster) + PlacementBinding |
