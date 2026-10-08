{#- @meta
name: kubevirt-cluster.yaml
description: KubeVirt VirtualMachine resources for OpenShift Virtualization cluster provisioning
type: clusterfile
category: installation
platforms:
  - baremetal
requires:
  - cluster.name
  - cluster.machine
  - hosts.<hostname>.network.interfaces
relatedTemplates:
  - kubevirt-install-iso.yaml.tpl
  - acm-ztp.yaml.tpl
  - acm-capi-m3.yaml.tpl
docs: https://docs.openshift.com/container-platform/4.20/virt/about_virt/about-virt.html
-#}
{%- set kv = plugins.kubevirt | default({}) -%}
{%- set cm = cluster.machine | default({}) -%}
{%- set controlMachine = cm.control | default({}) -%}
{%- set workerMachine  = cm.worker | default({}) -%}
{%- set kvsc = kv.storageClass | default({}) -%}
{%- set defaultSC = kvsc.default | default("lvms-vg1") -%}
{%- set kvmap = kv.storageMapping | default({}) -%}
{%- set namespace = cluster.name + "-cluster" -%}
{%- set kvnet = kv.network | default({}) -%}
{%- set netType = kvnet.type | default("cudn") -%}
{%- set vlanId = network.primary.vlan | default(kvnet.vlan | default(false), true) -%}
{%- set bridge = kvnet.linuxBridge | default("") -%}
{%- if netType == "cudn" -%}
  {%- set netName = kvnet.nad | default("cudn-vmdata-" + vlanId | string) -%}
{%- elif netType == "nad" -%}
  {%- set netName = kvnet.nad -%}
{%- else -%}
  {%- set netName = kvnet.nad | default("vmnet-" + (vlanId | string if vlanId else "trunk")) -%}
{%- endif -%}
{%- set netRef = netName if netType == "nad" and "/" in netName else namespace ~ "/" ~ netName -%}
{%- set enableTPM = cluster.tpm | default(false) -%}
{%- set performanceSC = kvsc.performance | default(defaultSC) -%}
{%- set controlCount = hosts.values() | selectattr('role', 'equalto', 'control') | list | length -%}
{%- set nsKey = kv.nodeSelector | default("") -%}
{%- set bootDelivery = bootDelivery | default("bmc") -%}
{%- set hasIsoDisk = true if bootDelivery == 'iso' else false -%}
apiVersion: v1
kind: List
metadata:
  resourceVersion: ""
items:
- kind: Namespace
  apiVersion: v1
  metadata:
    name: {{ namespace }}{% if netType == "cudn" and vlanId %}
    labels:
      vlan-{{ vlanId }}: ""{% endif %}{% if netType == "linux-bridge" %}
- kind: NetworkAttachmentDefinition
  apiVersion: k8s.cni.cncf.io/v1
  metadata:
    annotations:
      description: Linux Bridge Machine Network
    name: {{ netName }}
    namespace: {{ namespace }}
  spec:
    config: |-
      {
        "cniVersion": "0.3.1",
        "name": "{{ netName }}",
        "type": "bridge",
        "bridge": "{{ bridge }}",
        "macspoofchk": false,{% if network.primary.mtu %}
        "mtu": {{ network.primary.mtu }},{% endif %}
        "promiscMode": true
      }{% endif %}{% for name, host in hosts.items() %}
{%- set vmname  = name.replace('.', '-') -%}
{%- set role    = 'master' if host.role == 'control' else 'worker' -%}
{%- set roleMachine = controlMachine if host.role == 'control' else workerMachine -%}
{%- set hm = host.machine | default(roleMachine) -%}
{%- set hms = hm.storage | default({}) -%}
{%- set memory  = hm.memory | default(32) -%}
{%- set cores   = hm.cpus | default(8) -%}
{%- set sockets = hm.sockets | default(1) -%}
{%- set osDiskSize = hms.os | default(120) -%}
{%- set dataDisks = hms.data | default([]) -%}
{%- set roleMap = kvmap[host.role] | default({}) -%}
{%- set osClassLabel = roleMap.os | default("performance" if host.role == "control" else "default") -%}
{%- set dataClassLabel = roleMap.data | default("performance") -%}
{%- set ossc = kvsc[osClassLabel] | default(defaultSC) -%}
{%- set datasc = kvsc[dataClassLabel] | default(performanceSC) -%}
{%- set hasDataDisk = true if (host.role == 'control' and hosts | length <= 5) or (host.role != 'control' and hosts | length >= controlCount + 3) else false -%}
{%- set dataDisks = hms.data | default([]) if hasDataDisk else [] -%}
{%- set vgNode  = (loop.index - 1) % 3 + 1 %}
- kind: PersistentVolumeClaim
  apiVersion: v1
  metadata:
    name: {{ vmname }}
    namespace: {{ namespace }}
  spec:
    accessModes:
      - ReadWriteOnce
    volumeMode: Block
    resources:
      requests:
        storage: {{ osDiskSize }}Gi
    storageClassName: {{ ossc }}{% for diskSize in dataDisks %}
- kind: PersistentVolumeClaim
  apiVersion: v1
  metadata:
    name: {{ vmname }}-data-{{ loop.index0 }}
    namespace: {{ namespace }}
  spec:
    accessModes:
      - ReadWriteOnce
    volumeMode: Block
    resources:
      requests:
        storage: {{ diskSize }}Gi
    storageClassName: {{ datasc }}{% endfor %}
- kind: VirtualMachine
  apiVersion: kubevirt.io/v1
  metadata:
    name: {{ vmname }}
    namespace: {{ namespace }}
    labels:
      app.kubernetes.io/part-of: {{ cluster.name }}
      cluster: {{ cluster.name }}
  spec:
    runStrategy: RerunOnFailure{% if hasIsoDisk %}
    dataVolumeTemplates:
      - metadata:
          creationTimestamp: null
          name: {{ cluster.name }}-vm-install-iso
        spec:
          source:
            pvc:
              name: {{ cluster.name }}-install-iso
              namespace: {{ namespace }}
          storage:
            resources:
              requests:
                storage: 5Gi{% endif %}
    template:
      metadata:
        annotations:
          vm.kubevirt.io/os: rhel9
          vm.kubevirt.io/workload: server
          k8s.v1.cni.cncf.io/networks: |
            [{"name":"{{ netName }}","namespace":"{{ namespace }}","interface":"net1","interfaceRequest":"net1"}]
        labels:
          node: {{ vmname }}
          cluster: {{ cluster.name }}
          role: {{ role }}
      spec:{% if nsKey and controlCount > 1 %}
        nodeSelector:
          {{ nsKey }}: {{ nsKey }}{{ vgNode }}{% endif %}
{% if controlCount > 1 %}
        affinity:
          podAntiAffinity:
            preferredDuringSchedulingIgnoredDuringExecution:
              - weight: 100
                podAffinityTerm:
                  labelSelector:
                    matchExpressions:
                    - key: cluster
                      operator: In
                      values:
                      - {{ cluster.name }}
                    - key: role
                      operator: In
                      values:
                        - {{ role }}
                  topologyKey: "kubernetes.io/hostname"
{% endif %}
        domain:
          memory:
            guest: {{ memory }}Gi
          cpu:
            cores: {{ cores }}
            sockets: {{ sockets }}
            threads: 1
          devices:
            disks:
              - bootOrder: 2
                disk:
                  bus: virtio
                name: rootdisk{% if hasIsoDisk %}
              - bootOrder: 3
                cdrom:
                  bus: sata
                name: {{ cluster.name }}-vm-install-iso{% endif %}{% for diskSize in dataDisks %}
              - disk:
                  bus: scsi
                name: datadisk-{{ loop.index0 }}{% endfor %}
            interfaces:{% for nic in host.network.interfaces %}
              - bridge: {}
                macAddress: {{ nic.macAddress }}
                model: virtio
                name: {{ nic.name }}{% endfor %}{% if enableTPM %}
            tpm:
              persistent: true{% endif %}{% if enableTPM %}
          features:
            smm: {}
          firmware:
            bootloader:
              efi:
                persistent: true{% endif %}
          resources:
            overcommitGuestOverhead: true
            requests:
              memory: {{ (memory / 2) | int }}Gi
              cpu: 4
            limits:
              memory: {{ memory }}Gi
              cpu: {{ cores * sockets }}
        evictionStrategy: None
        networks:{% for nic in host.network.interfaces %}
          - multus:
              networkName: {{ netRef }}
            name: {{ nic.name }}{% endfor %}
        terminationGracePeriodSeconds: 180
        volumes:
          - name: rootdisk
            persistentVolumeClaim:
              claimName: {{ vmname }}{% if hasIsoDisk %}
          - name: {{ cluster.name }}-vm-install-iso
            dataVolume:
              name: {{ cluster.name }}-vm-install-iso{% endif %}{% for diskSize in dataDisks %}
          - name: datadisk-{{ loop.index0 }}
            persistentVolumeClaim:
              claimName: {{ vmname }}-data-{{ loop.index0 }}{% endfor %}
{% endfor %}
