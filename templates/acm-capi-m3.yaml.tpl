{#- @meta
name: acm-capi-m3.yaml
description: ACM Cluster API with Metal3 provider for bare metal provisioning
type: clusterfile
category: acm
platforms:
  - baremetal
  - none
requires:
  - cluster.name
  - cluster.sshKeys
  - network.domain
  - hosts.<hostname>.bmc (baremetal only)
  - hosts.<hostname>.network
relatedTemplates:
  - acm-clusterimageset.yaml.tpl
  - acm-ztp.yaml.tpl
  - acm-asc.yaml.tpl
  - acm-creds.yaml.tpl
bundle: capi
clusterRole:
  - managed
bundleOrder: 1
docs: https://github.com/openshift-assisted/cluster-api-provider-openshift-assisted
-#}
{#-
  Requires the openshift-assisted CAPI providers running on the hub:
    - cluster-api-provider-openshift-assisted bootstrap controller (creates
      OpenshiftAssistedConfig per Machine, which spawns one InfraEnv each
      named <cluster>-<random>)
    - cluster-api-provider-openshift-assisted infrastructure controller
      (creates AgentMachine, which selects a BMH via the
      AgentMachineTemplate hostSelector and labels the BMH with the
      matching infraenvs.agent-install.openshift.io: <cluster>-<random>
      so the bmac controller patches the discovery ISO URL onto
      BMH.spec.image.url)

  Without the infrastructure controller, no AgentMachine is ever created,
  no BMH gets the InfraEnv label, and Ironic never receives a boot ISO —
  BMHs sit "available" forever. Verify with:
    oc get crd | grep agentmachine                       # CRDs installed?
    oc get pods -A | grep -E "openshift-assisted.*infra" # controller running?
  If the infra controller is absent, use the acm-ztp bundle instead.

  This template intentionally does NOT statically label BMHs with an
  infraenvs.agent-install.openshift.io value — the per-machine InfraEnv
  names (<cluster>-<random>) are generated at apply time and unknowable
  in advance, so the binding must come from the infra controller.

  openshift-machine-api.metal3.metal3-ironic, kubevirt-redfish.kubevirt-redfish - logs
-#}
{%- set imageArch = cluster.arch | default("x86_64", true) -%}
{%- set majorMinor = cluster.version.split('.')[:2] | join('.') -%}
{%- set enableTang = cluster.diskEncryption is defined and cluster.diskEncryption.type | default("none") == "tang" -%}
{%- set isKubevirt = (plugins | default({})).kubevirt is defined -%}
{%- set bmIronic = (((plugins | default({})).baremetal | default({})).ironic | default({})).host | default({}) -%}
{%- set enableDisconnected = cluster.disconnected is defined -%}
{%- set hasMirrorRegistries = cluster.mirrors | default([]) | length > 0 -%}
{%- set insecureMirrors = cluster.mirrors | default([]) | selectattr('insecure', 'defined') | selectattr('insecure') | list -%}
{%- set generatedDiscoveryIgnitionOverride = "" -%}
{%- if hasMirrorRegistries -%}
{%- set generatedDiscoveryIgnitionOverride %}{% include "includes/disconnected-discovery-ignition-override.json.tpl" %}{% endset -%}
{%- endif -%}
{%- set controlCount = hosts.values() | selectattr('role', 'equalto', 'control') | list | length -%}
{%- set workerCount  = hosts.values() | selectattr('role', 'equalto', 'worker')  | list | length -%}
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
- kind: KlusterletAddonConfig
  apiVersion: agent.open-cluster-management.io/v1
  metadata:
    name: {{ cluster.name }}
    namespace: {{ cluster.name }}
  spec:
    applicationManager: {argocdCluster: false, enabled: true}
    certPolicyController: {enabled: true}
    clusterLabels: {name: {{ cluster.name }}, cloud: Baremetal, vendor: OpenShift}
    clusterName: {{ cluster.name }}
    clusterNamespace: {{ cluster.name }}
    iamPolicyController: {enabled: true}
    policyController: {enabled: true}
    searchCollector: {enabled: true}
- kind: Cluster
  apiVersion: cluster.x-k8s.io/v1beta1
  metadata:
    name: {{ cluster.name }}
    namespace: {{ cluster.name }}
  spec:
    clusterNetwork:
      pods:
        cidrBlocks:
          - {{ network.cluster.subnet }}
      services:
        cidrBlocks:
          - {{ network.service.subnet }}
    controlPlaneRef: 
      apiVersion: controlplane.cluster.x-k8s.io/v1alpha3
      kind: OpenshiftAssistedControlPlane
      name:  {{ cluster.name }}
      namespace: {{ cluster.name }}
    infrastructureRef: 
      apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
      kind: Metal3Cluster
      name: {{ cluster.name }}
      namespace: {{ cluster.name }}
- kind: OpenshiftAssistedControlPlane
  apiVersion: controlplane.cluster.x-k8s.io/v1alpha3
  metadata:
    name: {{ cluster.name }}
    namespace: {{ cluster.name }}
    annotations: 
      controlplane.cluster.x-k8s.io/install-config-override: |
        { {% if cluster.fips | default(false) %}"fips": true, {% endif %}"networking": { "machineNetwork": [ {"cidr": "{{ network.primary.subnet }}"} ],
                          "clusterNetwork": [ {"cidr": "{{ network.cluster.subnet }}", "hostPrefix": {{ network.cluster.hostPrefix|default(23, true) }}} ] },
          "compute": [ { "name": "worker", "replicas": {{ workerCount }} } ] }
      #cluster.x-k8s.io/release-image-repository-override: registry.ci.openshift.org/ocp/release
  spec:
    openshiftAssistedConfigSpec:
      pullSecretRef:
        name: pullsecret-{{ cluster.name }}
      sshAuthorizedKey: '{{load_file(cluster.sshKeys|first)|safe}}'
      nodeRegistration:
        kubeletExtraLabels:
          - 'metal3.io/uuid="${METADATA_UUID}"'
      nmStateConfigLabelSelector: 
        matchLabels:
          role: control
    distributionVersion: {{ cluster.version }}
    config:{% if controlCount > 1 %}
      apiVIPs:{% for vip in network.primary.vips.api | as_list %}
        - {{ vip }}{% endfor %}
      ingressVIPs:{% for vip in network.primary.vips.apps | as_list %}
        - {{ vip }}{% endfor %}{% endif %}
      baseDomain: {{ network.domain }}
      pullSecretRef:
        name: pullsecret-{{ cluster.name }}
      sshAuthorizedKey: '{{load_file(cluster.sshKeys|first)|safe}}'
    machineTemplate:
      infrastructureRef:
        apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
        apiGroup: infrastructure.cluster.x-k8s.io
        kind: Metal3MachineTemplate
        name: {{ cluster.name }}-controller
        namespace: {{ cluster.name }}
    replicas: {{ controlCount }}
- kind: Secret
  apiVersion: v1
  metadata:
    name: pullsecret-{{ cluster.name }}
    namespace: {{ cluster.name }}
  type: kubernetes.io/dockerconfigjson
  stringData:
    .dockerconfigjson: '{{load_file(account.pullSecret)}}'
- kind: Metal3Cluster
  apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
  metadata:
    name: {{ cluster.name }}
    namespace: {{ cluster.name }}
  spec:
    controlPlaneEndpoint:
      host: api.{{ cluster.name }}.{{ network.domain }}
      port: 6443
    noCloudProvider: true
- kind: Metal3MachineTemplate
  apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
  metadata:
    name: {{ cluster.name }}-controller
    namespace: {{ cluster.name }}
  spec:
    nodeReuse: false
    template:
      spec:
        hostSelector:
          matchLabels:
            role: control
        automatedCleaningMode: disabled
        dataTemplate:
          name: {{ cluster.name }}-machine-template-control
        customDeploy:
          method: install_coreos
- kind: Metal3DataTemplate
  apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
  metadata:
     name: {{ cluster.name }}-machine-template-control
     namespace: {{ cluster.name }}
  spec:
    clusterName: {{ cluster.name }}{% if workerCount > 0 %}
- kind: Metal3MachineTemplate
  apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
  metadata:
    name: {{ cluster.name }}-worker
    namespace: {{ cluster.name }}
  spec:
    nodeReuse: false
    template:
      spec:
        hostSelector:
          matchLabels:
            role: worker
        automatedCleaningMode: disabled
        dataTemplate:
          name: {{ cluster.name }}-machine-template-worker
        customDeploy:
          method: install_coreos
- kind: Metal3DataTemplate
  apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
  metadata:
     name: {{ cluster.name }}-machine-template-worker
     namespace: {{ cluster.name }}
  spec:
     clusterName: {{ cluster.name }}
- kind: MachineDeployment
  apiVersion: cluster.x-k8s.io/v1beta1
  metadata:
    name: {{ cluster.name }}-worker
    namespace: {{ cluster.name }}
    labels:
      cluster.x-k8s.io/cluster-name: {{ cluster.name }}
  spec:
    clusterName: {{ cluster.name }}
    replicas: {{ workerCount }}
    selector:
      matchLabels:
        cluster.x-k8s.io/cluster-name: {{ cluster.name }}
    template:
      metadata:
        labels:
          cluster.x-k8s.io/cluster-name: {{ cluster.name }}
      spec:
        clusterName: {{ cluster.name }}
        bootstrap:
          configRef:
            name: {{ cluster.name }}-worker
            apiVersion: bootstrap.cluster.x-k8s.io/v1alpha2
            kind: OpenshiftAssistedConfigTemplate
        infrastructureRef:
          name: {{ cluster.name }}-worker
          apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
          kind: Metal3MachineTemplate
- kind: OpenshiftAssistedConfigTemplate
  apiVersion: bootstrap.cluster.x-k8s.io/v1alpha2
  metadata:
    name: {{ cluster.name }}-worker
    namespace: {{ cluster.name }}
    labels:
      cluster.x-k8s.io/cluster-name: {{ cluster.name }}
  spec:
    template:
      metadata:{% if generatedDiscoveryIgnitionOverride %}
        annotations:
          openshiftassistedconfig.cluster.x-k8s.io/discovery-ignition-override: '{{ generatedDiscoveryIgnitionOverride | trim }}'{% endif %}
      spec:
        nodeRegistration:
          kubeletExtraLabels:
            - 'metal3.io/uuid="${METADATA_UUID}"'
        nmStateConfigLabelSelector:
          matchLabels:
            role: worker
        pullSecretRef:
          name: "pullsecret-{{ cluster.name }}"
        sshAuthorizedKey: '{{load_file(cluster.sshKeys|first)|safe}}'{% endif %}{% for name,host in hosts.items() %}{% set shortname=name.split('.')[0] %}
- kind: Secret
  apiVersion: v1
  metadata:
    name: {{ shortname }}-provisioning-nmstate
    namespace: {{ cluster.name }}
  type: Opaque
  data:
    nmstate: {% set nmstate %}{% include "includes/nmstate.config.yaml.tpl" %}{% endset -%}
     {{ nmstate | base64encode }}{% if host.bmc %}
- kind: Secret
  apiVersion: v1
  stringData:
    username: '{{ host.bmc.username }}'
    password: '{{load_file(host.bmc.password)}}'
  metadata:
    name: bmc-secret-{{ name }}
    namespace: {{ cluster.name }}
    labels:
      environment.metal3.io: baremetal
  type: Opaque{% endif %}
- kind: NMStateConfig
  apiVersion: agent-install.openshift.io/v1beta1
  metadata:
    labels:
      node: {{ shortname }}
      role: {{ 'control' if host.role == 'control' else 'worker' }}
    name: {{ shortname }}-nmstate
    namespace: {{ cluster.name }}
  spec:
    config: {%- set nmstate %}{% include "includes/nmstate.yaml.tpl" %}{% endset %}
{{ nmstate | indent(4,true) }}
- kind: BareMetalHost
  apiVersion: metal3.io/v1alpha1
  {%- set hasExplicitIgnitionOverride = host.ignitionConfigOverride is defined -%}
  {%- set effectiveIgnitionOverride = host.ignitionConfigOverride if hasExplicitIgnitionOverride else generatedDiscoveryIgnitionOverride %}
  metadata:
    annotations:
      bmac.agent-install.openshift.io/hostname: {{ name }}
      bmac.agent-install.openshift.io/role: {{ 'master' if host.role == 'control' else 'worker' }}{% if not bmIronic.inspection | default(true) %}
      inspect.metal3.io: disabled{% endif %}{%- set allNodeLabels = ({"topology.kubernetes.io/zone": host.zone} if host.zone is defined else {}) | merge(host.nodeLabels | default({})) %}{% if allNodeLabels %}
      bmac.agent-install.openshift.io/node-labels: '{{ allNodeLabels | tojson }}'{% endif %}{% if hasExplicitIgnitionOverride or effectiveIgnitionOverride %}
      bmac.agent-install.openshift.io/ignition-config-overrides: '{{ effectiveIgnitionOverride | trim }}'{% endif %}
    labels:
      node: {{ shortname }}
      role: {{ 'control' if host.role == 'control' else 'worker' }}
    name: {{ name }}
    namespace: {{ cluster.name }}
  spec:
    preprovisioningNetworkDataName: {{ shortname }}-provisioning-nmstate{% if host.storage.os is string %}
    rootDeviceHints:
      deviceName: {{ host.storage.os }}{% elif host.storage.os %}
    rootDeviceHints: {{ host.storage.os }}{% endif %}{% if host.bootMode is defined %}
    bootMode: {{ host.bootMode }}{% endif %}
    automatedCleaningMode: {{ bmIronic.automatedCleaningMode | default('metadata') }}{% if host.bmc %}{%- set bmc %}{% include "includes/bmc.yaml.tpl" %}{% endset %}
    bmc:
{{ bmc | indent(6, true) }}{% endif %}{% set bootNic = host.network.interfaces | selectattr('name', 'equalto', host.network.primary.ports[0]) | first %}
    bootMACAddress: {{ bootNic.macAddress }}
    online: false{% endfor %}
{%- set pocBanner %}{% include "includes/poc-banner-manifestwork.yaml.tpl" %}{% endset %}
{{ pocBanner }}{% if isKubevirt %}
- kind: ManifestWork
  apiVersion: work.open-cluster-management.io/v1
  metadata:
    name: kubevirt-ssd-udev
    namespace: {{ cluster.name }}
  spec:
    workload:
      manifests:
        - {%- set ssdUdev %}{% include "includes/kubevirt-ssd-udev.yaml.tpl" %}{% endset %}
{{ ssdUdev | indent(10, true) }}{% endif %}{%- set insecureImageManifest %}
        - apiVersion: config.openshift.io/v1
          kind: Image
          metadata:
            name: cluster
          spec:
            registrySources:
              insecureRegistries:{% for mirror in insecureMirrors %}{% for location in mirror.mirrors %}
                - {{ location }}{% endfor %}{% endfor %}{%- endset %}{% if enableDisconnected %}
- kind: ManifestWork
  apiVersion: work.open-cluster-management.io/v1
  metadata:
    name: disconnected-operatorhub
    namespace: {{ cluster.name }}
  spec:
    workload:
      manifests:
        - apiVersion: config.openshift.io/v1
          kind: OperatorHub
          metadata:
            name: cluster
          spec:
            disableAllDefaultSources: true{% if cluster.catalogSources is defined %}{% for catalog in cluster.catalogSources %}
        - apiVersion: operators.coreos.com/v1alpha1
          kind: CatalogSource
          metadata:
            name: {{ catalog.name }}
            namespace: openshift-marketplace
          spec:
            sourceType: grpc
            image: {{ catalog.image }}
            displayName: {{ catalog.displayName | default(catalog.name) }}
            publisher: {{ catalog.publisher | default("Custom") }}{% endfor %}{% endif %}{% if insecureMirrors %}
{{ insecureImageManifest }}{% endif %}{% endif %}{% if insecureMirrors and not enableDisconnected %}
- kind: ManifestWork
  apiVersion: work.open-cluster-management.io/v1
  metadata:
    name: insecure-registries
    namespace: {{ cluster.name }}
  spec:
    workload:
      manifests:
{{ insecureImageManifest }}{% endif %}
{%- set osImagesSync %}{% include "includes/os-images-sync.yaml.tpl" %}{% endset %}
{{ osImagesSync }}
{%- set clusterImageSetSync %}{% include "includes/clusterimageset-sync.yaml.tpl" %}{% endset %}
{{ clusterImageSetSync }}
{#- Workaround for missing CAPI infra controller — see include header. -#}
{%- set bmhBinder %}{% include "includes/capi-bmh-binder-policy.yaml.tpl" %}{% endset %}
{{ bmhBinder }}{% if (plugins | default({})).operators is defined %}
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
