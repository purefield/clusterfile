{#- @meta
name: acm-asc.yaml
description: ACM Assisted Service ConfigMap for infrastructure operator settings
type: clusterfile
category: acm
platforms:
  - baremetal
  - none
requires:
  - network.proxy (optional)
relatedTemplates:
  - acm-ztp.yaml.tpl
  - acm-capi-m3.yaml.tpl
  - acm-creds.yaml.tpl
  - acm-clusterimageset.yaml.tpl
bundle: acm-hub
clusterRole:
  - hub
bundleOrder: 1
docs: https://docs.redhat.com/en/documentation/red_hat_advanced_cluster_management_for_kubernetes/2.11/html/clusters/cluster_mce_overview#enable-cim
-#}
{%- set imageArch = cluster.arch | default("x86_64", true) -%}
{%- set majorMinor = cluster.version.split('.')[:2] | join('.') -%}
{%- set bm = (((plugins | default({})).baremetal | default({})).ironic | default({})).operator | default({}) -%}
apiVersion: v1
kind: List
metadata:
  resourceVersion: ""
items:
- kind: ConfigMap
  apiVersion: v1
  metadata:
    name: assisted-service-config
    namespace: multicluster-engine
    labels:
      app: assisted-service
  data:
    LOG_LEVEL: "info"
    AUTH_TYPE: "none"
    SKIP_CERT_VERIFICATION: "True"
    ISO_IMAGE_TYPE: "full-iso"{% if network.proxy %}
    HTTP_PROXY: {{ network.proxy.httpProxy }}
    HTTPS_PROXY: {{ network.proxy.httpsProxy }}
    NO_PROXY: {{ network.proxy.noProxy }}{% endif %}
- kind: Provisioning
  apiVersion: metal3.io/v1alpha1
  metadata:
    name: provisioning-configuration
  spec:
    provisioningNetwork: "{{ bm.provisioningNetwork | default('Disabled') }}"
    watchAllNamespaces: {{ bm.watchAllNamespaces | default(true) | lower }}
    disableVirtualMediaTLS: {{ bm.disableVirtualMediaTLS | default(true) | lower }}{% if cluster.mirrors %}
- kind: ConfigMap
  apiVersion: v1
  metadata:
    name: mirror-registries
    namespace: multicluster-engine
    labels:
      app: assisted-service
  data:{% if network.trustBundle %}
    ca-bundle.crt: |
{{ load_file(network.trustBundle)|safe|indent(6,true) }}{% endif %}
    registries.conf: |{%- set registries %}{% include "includes/registries.conf.tpl" %}{% endset %}
{{ registries | indent(6,true) }}{% endif %}
- kind: AgentServiceConfig
  apiVersion: agent-install.openshift.io/v1beta1
  metadata:
   name: agent
  spec:
    databaseStorage:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 10Gi
    filesystemStorage:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 100Gi{% if cluster.mirrors %}
    mirrorRegistryRef:
      name: mirror-registries{% endif %}
    imageStorage:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 50Gi
{%- set rhcosPath = "pre-release/" + cluster.version if "-" in cluster.version else majorMinor + "/latest" %}
    osImages:
      - openshiftVersion: "{{ majorMinor }}"
        version: "{{ cluster.version }}"
        cpuArchitecture: {{ imageArch }}
        url: "https://mirror.openshift.com/pub/openshift-v4/{{ imageArch }}/dependencies/rhcos/{{ rhcosPath }}/rhcos-live-iso.{{ imageArch }}.iso"
        rootFSUrl: "https://mirror.openshift.com/pub/openshift-v4/{{ imageArch }}/dependencies/rhcos/{{ rhcosPath }}/rhcos-live-rootfs.{{ imageArch }}.img"
- kind: ClusterRole
  apiVersion: rbac.authorization.k8s.io/v1
  metadata:
    name: os-images-sync
  rules:
    - apiGroups: ["agent-install.openshift.io"]
      resources: ["agentserviceconfigs"]
      verbs: ["get", "patch"]
