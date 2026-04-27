{#- @meta
name: acm-clusterimageset.yaml
description: ClusterImageSet for ACM/MCE cluster deployments (ZTP, CAPI+M3)
type: clusterfile
category: acm
platforms:
  - baremetal
  - none
requires:
  - cluster.version
relatedTemplates:
  - acm-clusterimagesets-sub.yaml.tpl
  - acm-ztp.yaml.tpl
  - acm-capi-m3.yaml.tpl
  - acm-asc.yaml.tpl
bundle: acm-hub,acm-ztp,capi
clusterRole:
  - hub
  - managed
bundleOrder: 2
docs: https://github.com/stolostron/acm-hive-openshift-releases
-#}
{%- set imageArch = cluster.arch | default("x86_64", true) | replace("-", "_") -%}
{%- set arch = imageArch | replace("_", "-") -%}
{%- set quayMirrors = (cluster.mirrors | default([])) | selectattr('source', 'equalto', 'quay.io') | list -%}
{%- set releaseBase = quayMirrors[0].mirrors[0] if quayMirrors | length > 0 else 'quay.io' -%}
apiVersion: hive.openshift.io/v1
kind: ClusterImageSet
metadata:
  labels:
    channel: fast
    visible: "true"
  name: img{{ cluster.version }}-{{ arch }}-appsub
spec:
  releaseImage: {{ releaseBase }}/openshift-release-dev/ocp-release{% if cluster.releaseDigest is defined %}@{{ cluster.releaseDigest }}{% else %}:{{ cluster.version }}-{{ imageArch }}{% endif %}
