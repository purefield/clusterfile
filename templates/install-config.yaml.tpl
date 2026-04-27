{#- @meta
name: install-config.yaml
description: OpenShift installer configuration for IPI and agent-based installs
type: clusterfile
category: installation
platforms:
  - aws
  - azure
  - gcp
  - vsphere
  - openstack
  - ibmcloud
  - nutanix
  - baremetal
  - none
requires:
  - account.pullSecret
  - cluster.name
  - cluster.sshKeys
  - network.domain
  - network.primary.subnet
  - network.cluster.subnet
  - network.service.subnet
  - hosts
relatedTemplates:
  - agent-config.yaml.tpl
  - creds.yaml.tpl
  - mirror-registry-config.yaml.tpl
  - pre-check.sh.tpl
bundle: agent
clusterRole:
  - standalone
  - hub
bundleOrder: 1
docs: https://docs.openshift.com/container-platform/latest/installing/index.html
yamlWrapper: raw
-#}
{%- set controlCount = hosts.values() | selectattr('role', 'in', ['control', 'master']) | list | length -%}
{%- set workerCount  = hosts.values() | selectattr('role', 'equalto', 'worker') | list | length -%}
{%- set platform = cluster.platform | default('baremetal', true) -%}
{%- set isKubevirt = (plugins | default({})).kubevirt is defined -%}
{%- set installConfigPlatform = 'none' if isKubevirt and controlCount == 1 and workerCount == 0 else platform -%}
{%- set insecureMirrors = cluster.mirrors | default([]) | selectattr('insecure', 'defined') | selectattr('insecure') | list -%}
{%- set platformPlugin = (plugins | default({}))[platform] | default({}) -%}
---
apiVersion: v1
metadata:
  name: {{ cluster.name }}

baseDomain: {{ network.domain }}{% if cluster.cpuPartitioningMode is defined and cluster.cpuPartitioningMode != "None" %}

cpuPartitioningMode: {{ cluster.cpuPartitioningMode }}{% endif %}{% if cluster.fips | default(false) %}

fips: true{% endif %}

controlPlane:
  name: master
  replicas: {{ controlCount }}{% if installConfigPlatform not in ['baremetal', 'none', 'external'] %}
  platform:
{% include 'platforms/' ~ installConfigPlatform ~ '/controlPlane.yaml.tpl' %}{%- endif %}

compute:
  - name: worker
    replicas: {{ workerCount }}{% if installConfigPlatform not in ['baremetal', 'none', 'external'] %}
    platform:
{% include 'platforms/' ~ installConfigPlatform ~ '/compute.yaml.tpl' %}{%- endif %}{% if network.proxy is defined %}

proxy:
  httpProxy: {{ network.proxy.httpProxy }}
  httpsProxy: {{ network.proxy.httpsProxy }}
  noProxy: {{ network.proxy.noProxy }}{% endif %}

networking:
  networkType: {{ network.primary.type | default("OVNKubernetes", true) }}
  clusterNetwork:
    - cidr: {{ network.cluster.subnet }}
      hostPrefix: {{ network.cluster.hostPrefix | default(23, true) }}
  machineNetwork:
    - cidr: {{ network.primary.subnet }}
  serviceNetwork:
    - {{ network.service.subnet }}

platform:
{% include 'platforms/' ~ installConfigPlatform ~ '/platform.yaml.tpl' %}

publish: External
pullSecret: '{{ load_file(account.pullSecret) | trim }}'
sshKey: |{% for pubKey in cluster.sshKeys %}
  {{ load_file(pubKey) | trim }}{%- endfor %}{% if network.trustBundle is defined %}

additionalTrustBundle: |
{{ load_file(network.trustBundle) | indent(2, true) }}{%- endif %}
{%- if cluster.mirrors | default([]) | length > 0 %}

imageDigestSources:{% for mirror in cluster.mirrors %}
  - source: {{ mirror.source }}
    mirrors:{% for m in mirror.mirrors %}
      - {{ m }}{%- endfor %}{%- endfor %}{%- endif %}{% if platformPlugin.credentials is defined %}

credentialsMode: Manual
{%- endif %}
{#- SNO bootstrap disk for platform: none, including kubevirt SNO rendered as none #}
{%- if installConfigPlatform == 'none' and controlCount == 1 and (hosts.values()|first).storage is defined and (hosts.values()|first).storage.os is defined %}
{%- set bootstrapDisk = (hosts.values()|first).storage.os %}

bootstrapInPlace:
  installationDisk: {{ bootstrapDisk if bootstrapDisk is string else bootstrapDisk.deviceName }}
{%- endif %}{% if cluster.disconnected is defined %}
---
# Place in openshift/ directory for ABI/IPI
apiVersion: config.openshift.io/v1
kind: OperatorHub
metadata:
  name: cluster
spec:
  disableAllDefaultSources: true{% endif %}{% if cluster.catalogSources is defined %}{% for catalog in cluster.catalogSources %}
---
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
---
# Place in openshift/ directory for ABI/IPI
apiVersion: config.openshift.io/v1
kind: Image
metadata:
  name: cluster
spec:
  registrySources:
    insecureRegistries:{% for mirror in insecureMirrors %}{% for location in mirror.mirrors %}
      - {{ location }}{% endfor %}{% endfor %}{% endif %}{% if isKubevirt %}{%- set ssdUdev %}{% include "includes/kubevirt-ssd-udev.yaml.tpl" %}{% endset %}
---
# Place in openshift/ directory for ABI/IPI — forces virtual disks to report as SSD
{{ ssdUdev }}{% endif %}{% if (plugins | default({})).operators is defined %}
{%- set ops = plugins.operators -%}
{%- for op_name, op_config in ops.items() if op_config is mapping and op_config.enabled | default(true) %}{%- set operatorManifests %}{% include "operators/" ~ op_name ~ "/manifests.yaml.tpl" ignore missing %}{% endset %}
{{ operatorManifests }}{% endfor -%}{% endif %}
