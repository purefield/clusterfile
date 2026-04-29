{#- @meta
name: acm-ztp.yaml
description: ACM Zero Touch Provisioning manifests (InfraEnv, ClusterDeployment, NMState)
type: clusterfile
category: acm
platforms:
  - baremetal
  - none
requires:
  - account.pullSecret
  - cluster.name
  - cluster.sshKeys
  - network.domain
  - hosts.<hostname>.bmc (baremetal only)
  - hosts.<hostname>.network
relatedTemplates:
  - acm-clusterimageset.yaml.tpl
  - acm-capi-m3.yaml.tpl
  - acm-asc.yaml.tpl
  - acm-creds.yaml.tpl
bundle: acm-ztp
clusterRole:
  - managed
bundleOrder: 1
docs: https://docs.redhat.com/en/documentation/red_hat_advanced_cluster_management_for_kubernetes/2.11/html/clusters/cluster_mce_overview#ztp-intro
-#}
{%- set imageArch = cluster.arch | default("x86_64", true) -%}
{%- set majorMinor = cluster.version.split('.')[:2] | join('.') -%}
{%- set controlCount = hosts.values() | selectattr('role', 'equalto', 'control') | list | length -%}
{%- set workerCount  = hosts.values() | selectattr('role', 'equalto', 'worker')  | list | length -%}
{%- set enableTPM = cluster.tpm | default(false) -%}
{%- set enableTang = cluster.diskEncryption is defined and cluster.diskEncryption.type | default("none") == "tang" -%}
{%- set isKubevirt = (plugins | default({})).kubevirt is defined -%}
{%- set bmIronic = (((plugins | default({})).baremetal | default({})).ironic | default({})).host | default({}) -%}
{%- set disc = cluster.disconnected | default({}) -%}
{%- set enableDisconnected = cluster.disconnected is defined -%}
{%- set osImageHost = disc.osImageHost | default("") -%}
{%- set hasMirrorRegistries = cluster.mirrors | default([]) | length > 0 -%}
{%- set insecureMirrors = cluster.mirrors | default([]) | selectattr('insecure', 'defined') | selectattr('insecure') | list -%}
{%- set generatedDiscoveryIgnitionOverride = "" -%}
{%- if hasMirrorRegistries -%}
{%- set generatedDiscoveryIgnitionOverride %}{% include "includes/disconnected-discovery-ignition-override.json.tpl" %}{% endset -%}
{%- endif -%}
apiVersion: v1
kind: List
metadata:
  resourceVersion: ""
items:
- kind: Namespace
  apiVersion: v1
  metadata:
    name: {{ cluster.name }}
  spec: {}
- kind: Secret
  apiVersion: v1
  metadata:
    name: pullsecret-{{ cluster.name }}
    namespace: {{ cluster.name }}
    labels:
      agent-install.openshift.io/watch: "true"
      cluster.open-cluster-management.io/backup: "true"
  type: kubernetes.io/dockerconfigjson
  stringData:
    .dockerconfigjson: '{{load_file(account.pullSecret)}}'
- kind: AgentClusterInstall
  apiVersion: extensions.hive.openshift.io/v1beta1
  metadata:
    name: {{ cluster.name }}
    namespace: {{ cluster.name }}
    labels:
      cluster-name: {{ cluster.name }}{% if cluster.fips | default(false) %}
    annotations:
      agent-install.openshift.io/install-config-overrides: '{"fips": true}'{% endif %}
  spec:{%- if cluster.holdInstallation | default(false) %}
    holdInstallation: true{% endif %}{%- if network.proxy %}
    proxy: {{ network.proxy }}{% endif %}
    clusterDeploymentRef:
      name: {{ cluster.name }}
    imageSetRef:
      name: img{{ cluster.version }}-{{ cluster.arch | default("x86_64", true) | replace("_", "-") }}-appsub{% if cluster.mirrors %}
    mirrorRegistryRef:
      name: mirror-registries-{{ cluster.name }}
      namespace: multicluster-engine{% endif %}
    platformType: {% if controlCount > 1 %}BareMetal
    apiVIPs:{% for vip in network.primary.vips.api | as_list %}
      - {{ vip }}{% endfor %}
    ingressVIPs:{% for vip in network.primary.vips.apps | as_list %}
      - {{ vip }}{% endfor %}{% else %}None{% endif %}
    networking:
      userManagedNetworking: {{ false if controlCount > 1 else true }}
      networkType: {{ network.primary.type|default("OVNKubernetes", true) }}
      clusterNetwork:
        - cidr: {{ network.cluster.subnet }}
          hostPrefix: {{ network.cluster.hostPrefix|default(23, true) }}
      machineNetwork:
        - cidr: {{ network.primary.subnet }}
      serviceNetwork:
      - {{ network.service.subnet }}
    provisionRequirements:
      controlPlaneAgents: {{ controlCount }}
      workerAgents: {{ workerCount }}
    sshPublicKey: '{{load_file(cluster.sshKeys|first)|safe}}'{% if cluster.manifests or cluster.mirrors or enableTPM or enableTang or isKubevirt or enableDisconnected or insecureMirrors %}
    manifestsConfigMapRef:
      name: extraclustermanifests{% endif %}{% if cluster.mirrors %}{% include "includes/mirror-registries-configmap.yaml.tpl" %}{% endif %}{% if cluster.manifests or cluster.mirrors or enableTPM or enableTang or isKubevirt or enableDisconnected or insecureMirrors %}
- kind: ConfigMap
  apiVersion: v1
  metadata:
    name: extraclustermanifests
    namespace: {{ cluster.name }}
  data:{% if cluster.manifests %}{% for manifest in cluster.manifests %}
    99-{{ manifest.name }}.yaml: |
{{ load_file(manifest.file )|safe|indent(8,true) }}{% endfor %}{% endif %}{% if enableTPM %}{%- set tpmManifest %}{% include "includes/tpm-disk-encryption.yaml.tpl" %}{% endset %}
    99-tpm-disk-encryption.yaml: |
{{ tpmManifest | indent(8, true) }}{% endif %}{% if enableTang %}{%- set tangManifest %}{% include "includes/tang-machineconfig.yaml.tpl" %}{% endset %}
    99-tang-disk-encryption.yaml: |
{{ tangManifest | indent(8, true) }}{% endif %}{% if isKubevirt %}{%- set ssdUdev %}{% include "includes/kubevirt-ssd-udev.yaml.tpl" %}{% endset %}
    99-ssd-rotational.yaml: |
{{ ssdUdev | indent(8, true) }}{% endif %}{% if cluster.mirrors %}{%- set sources %}{% include "includes/imageContentSource.yaml.tpl" %}{% endset %}
    99-image-digest-mirror-set.yaml: |
      kind: ImageDigestMirrorSet
      apiVersion: config.openshift.io/v1
      metadata:
        name: mirror-registries
      spec:
        imageDigestMirrors:
{{ sources | indent(10, true)}}
    99-image-tag-mirror-set.yaml: |
      kind: ImageTagMirrorSet
      apiVersion: config.openshift.io/v1
      metadata:
        name: mirror-registries
      spec:
        imageTagMirrors:
{{ sources | indent(10, true)}}{% endif %}{% if enableDisconnected %}{%- set operatorHub %}{% include "includes/disconnected.yaml.tpl" %}{% endset %}
    99-operatorhub.yaml: |
{{ operatorHub | indent(8, true) }}{% endif %}{% if cluster.catalogSources is defined %}{% for catalog in cluster.catalogSources %}
    99-catalogsource-{{ catalog.name }}.yaml: |
      apiVersion: operators.coreos.com/v1alpha1
      kind: CatalogSource
      metadata:
        name: {{ catalog.name }}
        namespace: openshift-marketplace
      spec:
        sourceType: grpc
        image: {{ catalog.image }}
        displayName: {{ catalog.displayName | default(catalog.name) }}
        publisher: {{ catalog.publisher | default("Custom") }}{% endfor %}{% endif %}{% if insecureMirrors %}
    99-insecure-registries.yaml: |
      apiVersion: config.openshift.io/v1
      kind: Image
      metadata:
        name: cluster
      spec:
        registrySources:
          insecureRegistries:{% for mirror in insecureMirrors %}{% for location in mirror.mirrors %}
            - {{ location }}{% endfor %}{% endfor %}{% endif %}{% endif %}
- kind: ClusterDeployment
  apiVersion: hive.openshift.io/v1
  metadata:
    name: {{ cluster.name }}
    namespace: {{ cluster.name }}
    labels:
      cluster.open-cluster-management.io/clusterset: default
      hive.openshift.io/cluster-platform: agent-baremetal
    annotations:
      agentBareMetal-cpuArchitecture: x86_64
      agentclusterinstalls.extensions.hive.openshift.io/location: {{ cluster.location }}
  spec:
    clusterName: {{ cluster.name }}
    baseDomain: {{ network.domain }}
    clusterInstallRef:
      version: v1beta1
      kind: AgentClusterInstall
      name: {{ cluster.name }}
      group: extensions.hive.openshift.io
    controlPlaneConfig:
      servingCertificates: {}
    platform:
      agentBareMetal: 
        agentSelector:
          matchLabels:
            cluster-name: "{{ cluster.name }}"
    pullSecretRef:
      name: pullsecret-{{ cluster.name }}
- kind: KlusterletAddonConfig
  apiVersion: agent.open-cluster-management.io/v1
  metadata:
    name: {{ cluster.name }}
    namespace: {{ cluster.name }}
  spec:
    applicationManager:
      argocdCluster: false
      enabled: true
    certPolicyController:
      enabled: true
    clusterLabels:
      name: {{ cluster.name }}
      cloud: Baremetal
      vendor: OpenShift
    clusterName: {{ cluster.name }}
    clusterNamespace: {{ cluster.name }}
    iamPolicyController:
      enabled: true
    policyController:
      enabled: true
    searchCollector:
      enabled: true
- kind: ManagedCluster
  apiVersion: cluster.open-cluster-management.io/v1
  metadata:
    name: {{ cluster.name }}
    namespace: {{ cluster.name }}
    labels:
      name: {{ cluster.name }}
      cloud: BareMetal
      vendor: OpenShift
      location: {{ cluster.location }}
  spec:
    hubAcceptsClient: true
    leaseDurationSeconds: 60
# https://nmstate.io/examples.html
# https://access.redhat.com/solutions/7011711{% for name,host in hosts.items() %}
- apiVersion: agent-install.openshift.io/v1beta1
  kind: NMStateConfig
  metadata:
    labels:
      agent-install.openshift.io/bmh: {{ name }}
      infraenvs.agent-install.openshift.io: {{ cluster.name }}
    name: {{ name }}-nmstate
    namespace: {{ cluster.name }}
  spec:
    config: {%- set nmstate %}{% include "includes/nmstate.yaml.tpl" %}{% endset %}
{{ nmstate | indent(4,true) }}{% if host.bmc %}
- apiVersion: v1
  stringData:
    username: '{{ host.bmc.username }}'
    password: '{{load_file(host.bmc.password)}}'
  kind: Secret
  metadata:
    name: bmc-secret-{{ name }}
    namespace: {{ cluster.name }}
    labels:
      environment.metal3.io: baremetal
  type: Opaque{% endif %}
- apiVersion: metal3.io/v1alpha1
  kind: BareMetalHost
  metadata:
    annotations:
      bmac.agent-install.openshift.io/hostname: {{ name }}
      bmac.agent-install.openshift.io/role: {{ 'master' if host.role == 'control' else 'worker' }}{% if not bmIronic.inspection | default(true) %}
      inspect.metal3.io: disabled{% endif %}{%- set allNodeLabels = ({"topology.kubernetes.io/zone": host.zone} if host.zone is defined else {}) | merge(host.nodeLabels | default({})) %}{% if allNodeLabels %}
      bmac.agent-install.openshift.io/node-labels: '{{ allNodeLabels | tojson }}'{% endif %}{% if host.installerArgs is defined %}
      bmac.agent-install.openshift.io/installer-args: '{{ host.installerArgs }}'{% endif %}{% if host.ignitionConfigOverride is defined %}
      bmac.agent-install.openshift.io/ignition-config-overrides: '{{ host.ignitionConfigOverride | trim }}'{% endif %}
    labels:
      infraenvs.agent-install.openshift.io: {{ cluster.name }}
    name: {{ name }}
    namespace: {{ cluster.name }}
  spec:{% if host.storage.os is string %}
    rootDeviceHints:
      deviceName: {{ host.storage.os }}{% elif host.storage.os %}
    rootDeviceHints: {{ host.storage.os }}{% endif %}{% if host.bootMode is defined %}
    bootMode: {{ host.bootMode }}{% endif %}
    automatedCleaningMode: {{ bmIronic.automatedCleaningMode | default('metadata') }}{% if host.bmc %}{%- set bmc %}{% include "includes/bmc.yaml.tpl" %}{% endset %}
    bmc:
{{ bmc | indent(6, true) }}{% endif %}{% set bootNic = host.network.interfaces | selectattr('name', 'equalto', host.network.primary.ports[0]) | first %}
    bootMACAddress: {{ bootNic.macAddress }}
    online: true
    customDeploy:
      method: start_assisted_install{% endfor %}
- kind: InfraEnv
  apiVersion: agent-install.openshift.io/v1beta1
  metadata:
    name: {{ cluster.name }}
    namespace: {{ cluster.name }}
    labels:
      agentclusterinstalls.extensions.hive.openshift.io/location: {{ cluster.location }}
      networkType: static
    annotations:{% if hosts.values() | selectattr('bmc', 'defined') | list %}
      infraenv.agent-install.openshift.io/enable-ironic-agent: "true"{% endif %}
  spec:{%- if network.proxy %}
    proxy: {{ network.proxy }}{% endif %}{% if network.trustBundle %}
    additionalTrustBundle: |
{{ load_file(network.trustBundle)|safe|indent(6,true) }}{% endif %}{% if generatedDiscoveryIgnitionOverride %}
    ignitionConfigOverride: '{{ generatedDiscoveryIgnitionOverride | trim }}'{% endif %}
    additionalNTPSources: {{ network.ntpservers }}
    agentLabels:
      agentclusterinstalls.extensions.hive.openshift.io/location: {{ cluster.location }}
    cpuArchitecture: x86_64
    ipxeScriptType: DiscoveryImageAlways
    imageType: full-iso
    nmStateConfigLabelSelector:
      matchLabels:
        infraenvs.agent-install.openshift.io: {{ cluster.name }}
    pullSecretRef:
      name: pullsecret-{{ cluster.name }}
    sshAuthorizedKey: '{{load_file(cluster.sshKeys|first)|safe}}'
    clusterRef:
      name: {{ cluster.name }}
      namespace: {{ cluster.name }}{% if cluster.mirrors %}
    mirrorRegistryRef:
      name: mirror-registries-{{ cluster.name }}
      namespace: multicluster-engine{% endif %}
    agentLabelSelector:
      matchLabels:
        cluster-name: {{ cluster.name }}
{%- set pocBanner %}{% include "includes/poc-banner-manifestwork.yaml.tpl" %}{% endset %}
{{ pocBanner }}{% if not enableDisconnected or osImageHost %}
{%- set osImagesSync %}{% include "includes/os-images-sync.yaml.tpl" %}{% endset %}
{{ osImagesSync }}{% endif %}
{%- set clusterImageSetSync %}{% include "includes/clusterimageset-sync.yaml.tpl" %}{% endset %}
{{ clusterImageSetSync }}{% if (plugins | default({})).operators is defined %}
{%- set ops = plugins.operators %}
- kind: ManagedClusterSetBinding
  apiVersion: cluster.open-cluster-management.io/v1beta2
  metadata:
    name: default
    namespace: {{ cluster.name }}
  spec:
    clusterSet: default
- kind: Placement
  apiVersion: cluster.open-cluster-management.io/v1beta1
  metadata:
    name: {{ cluster.name }}
    namespace: {{ cluster.name }}
  spec:
    predicates:
      - requiredClusterSelector:
          labelSelector:
            matchLabels:
              name: {{ cluster.name }}
    clusterSets:
      - default
{%- for op_name, op_config in ops.items() if op_config is mapping and op_config.enabled | default(true) %}{%- set opPolicy %}{% include "operators/" ~ op_name ~ "/policy.yaml.tpl" ignore missing %}{% endset %}
{{ opPolicy }}{% endfor -%}
{% endif %}
