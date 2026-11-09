{%- set osDisk = storage.os -%}
apiVersion: machineconfiguration.openshift.io/v1
kind: MachineConfig
metadata:
  name: 98-{{ rootDiskRole }}-root-disk-partition
  labels:
    machineconfiguration.openshift.io/role: {{ rootDiskRole }}
spec:
  config:
    ignition:
      version: 3.4.0
    storage:
      disks:
        - device: /dev/disk/by-id/coreos-boot-disk
          wipeTable: false
          partitions:
            - label: {{ osDisk.partitionLabel | default("lvmstorage", true) }}
              number: 5
              startMiB: {{ (osDisk.sizeGiB * 1024) | int }}
              sizeMiB: 0
