{%- set acm = plugins.operators.acm -%}
{%- set acmEnabled = acm.enabled | default(true) -%}
{%- set mch = acm.multiClusterHub | default({}) -%}
{%- set asc = acm.agentServiceConfig | default({}) -%}
{%- set prov = acm.provisioning | default({}) -%}
{%- set bm = ((plugins.baremetal | default({})).ironic | default({})).operator | default({}) -%}
{%- set imageArch = cluster.arch | default("x86_64", true) -%}
{%- set majorMinor = cluster.version.split('.')[:2] | join('.') -%}
{%- set rhcosPath = "pre-release/" + cluster.version if "-" in cluster.version else majorMinor + "/latest" -%}
{%- if acmEnabled %}
---
apiVersion: v1
kind: Namespace
metadata:
  name: open-cluster-management
  annotations:
    openshift.io/display-name: "Advanced Cluster Management for Kubernetes"
  labels:
    openshift.io/cluster-monitoring: "true"
---
apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata:
  name: advanced-cluster-management-group
  namespace: open-cluster-management
spec:
  targetNamespaces:
    - open-cluster-management
---
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: acm-operator-subscription
  namespace: open-cluster-management
spec:
  channel: {{ acm.channel | default("release-2.17") }}
  installPlanApproval: {{ acm.approval | default("Automatic") }}
  name: advanced-cluster-management
  source: {{ acm.source | default("redhat-operators") }}
  sourceNamespace: openshift-marketplace{% if acm.version %}
  startingCSV: {{ acm.version }}{% endif %}
---
apiVersion: operator.open-cluster-management.io/v1
kind: MultiClusterHub
metadata:
  name: {{ mch.name | default("multiclusterhub") }}
  namespace: open-cluster-management
spec:
  availabilityConfig: {{ mch.availabilityConfig | default("High") }}
---
apiVersion: agent-install.openshift.io/v1beta1
kind: AgentServiceConfig
metadata:
  name: agent
spec:
  databaseStorage:
    accessModes:
      - ReadWriteOnce
    resources:
      requests:
        storage: {{ asc.databaseStorage | default("10Gi") }}
  filesystemStorage:
    accessModes:
      - ReadWriteOnce
    resources:
      requests:
        storage: {{ asc.filesystemStorage | default("100Gi") }}
  imageStorage:
    accessModes:
      - ReadWriteOnce
    resources:
      requests:
        storage: {{ asc.imageStorage | default("50Gi") }}
  osImages:
    - openshiftVersion: "{{ majorMinor }}"
      version: "{{ cluster.version }}"
      cpuArchitecture: {{ imageArch }}
      url: "https://mirror.openshift.com/pub/openshift-v4/{{ imageArch }}/dependencies/rhcos/{{ rhcosPath }}/rhcos-live-iso.{{ imageArch }}.iso"
      rootFSUrl: "https://mirror.openshift.com/pub/openshift-v4/{{ imageArch }}/dependencies/rhcos/{{ rhcosPath }}/rhcos-live-rootfs.{{ imageArch }}.img"
---
apiVersion: metal3.io/v1alpha1
kind: Provisioning
metadata:
  name: provisioning-configuration
spec:
  provisioningNetwork: "{{ bm.provisioningNetwork | default('Disabled') }}"
  watchAllNamespaces: {{ bm.watchAllNamespaces | default(true) | lower }}
  disableVirtualMediaTLS: {{ bm.disableVirtualMediaTLS | default(true) | lower }}
{%- endif -%}
