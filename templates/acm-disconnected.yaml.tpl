{#- @meta
name: acm-disconnected.yaml
description: ACM hub-side disconnected setup (digest-based ClusterImageSet + mirror-registries ConfigMap)
type: clusterfile
category: acm
platforms:
  - baremetal
  - none
requires:
  - cluster.version
  - cluster.releaseDigest
  - cluster.mirrors
relatedTemplates:
  - acm-clusterimageset.yaml.tpl
  - acm-ztp.yaml.tpl
  - acm-capi-m3.yaml.tpl
bundle: acm-hub,acm-ztp
clusterRole:
  - hub
  - managed
bundleOrder: 4
docs: https://docs.openshift.com/container-platform/4.20/installing/disconnected_install/index-disconnected.html
-#}
{%- set imageArch = cluster.arch | default("x86_64", true) | replace("-", "_") -%}
{%- set arch = imageArch | replace("_", "-") -%}
{%- set quayMirrors = (cluster.mirrors | default([])) | selectattr('source', 'equalto', 'quay.io') | list -%}
{%- set releaseBase = quayMirrors[0].mirrors[0] if quayMirrors | length > 0 else 'quay.io' -%}
apiVersion: v1
kind: List
metadata:
  resourceVersion: ""
items:
- apiVersion: hive.openshift.io/v1
  kind: ClusterImageSet
  metadata:
    name: img{{ cluster.version }}-{{ arch }}-appsub
    labels:
      channel: fast
      visible: "true"
  spec:
    releaseImage: {{ releaseBase }}/openshift-release-dev/ocp-release@{{ cluster.releaseDigest }}{% if cluster.mirrors %}{% include "includes/mirror-registries-configmap.yaml.tpl" %}{% endif %}
