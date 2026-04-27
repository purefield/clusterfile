{#- @meta
name: creds.yaml
description: Cloud Credential Operator (CCO) secrets for manual credential mode
type: clusterfile
category: credentials
platforms:
  - aws
  - azure
  - gcp
  - vsphere
  - openstack
  - ibmcloud
  - nutanix
requires:
  - cluster.platform
  - plugins.<platform>.credentials
relatedTemplates:
  - install-config.yaml.tpl
bundle: agent
clusterRole:
  - standalone
  - hub
bundleOrder: 5
docs: https://docs.openshift.com/container-platform/latest/authentication/managing_cloud_provider_credentials/about-cloud-credential-operator.html
-#}
{%- set platform = cluster.platform | default('baremetal', true) -%}
{%- set platformPlugin = (plugins | default({}))[platform] | default({}) -%}
{%- if platformPlugin.credentials is defined or platform in ['vsphere', 'nutanix', 'openstack'] -%}
{% include 'platforms/' ~ platform ~ '/creds.yaml.tpl' %}
{%- endif -%}
