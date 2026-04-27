{#- @meta
name: operators.yaml
description: Day-2 operator installation manifests (Subscriptions + CRs)
type: clusterfile
category: configuration
platforms:
  - baremetal
  - aws
  - azure
  - gcp
  - vsphere
  - openstack
  - ibmcloud
  - nutanix
  - none
requires:
  - plugins.operators
bundle: agent,acm-ztp,capi
clusterRole:
  - standalone
  - hub
  - managed
bundleOrder: 6
docs: https://docs.openshift.com/container-platform/latest/operators/admin/olm-adding-operators-to-cluster.html
-#}
{#- Standalone operator manifests for post-install: oc apply -f operators.yaml #}
{%- set ops = (plugins | default({})).operators | default({}) -%}
{%- if (cluster | default({})).get('corePassword') %}{% include "includes/core-user-password.yaml.tpl" %}{% endif -%}
{%- if cluster.platform == "baremetal" and "nmstate" not in ops %}{% include "operators/nmstate/manifests.yaml.tpl" %}{% endif -%}
{%- for op_name, op_config in ops.items() if op_config is mapping and op_config.enabled | default(true) %}{% include "operators/" ~ op_name ~ "/manifests.yaml.tpl" %}{% include "operators/" ~ op_name ~ "/config.yaml.tpl" ignore missing %}{% include "operators/" ~ op_name ~ "/" ~ op_name ~ ".day2-resources.yaml.tpl" ignore missing %}{% endfor -%}
