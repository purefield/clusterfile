{#- @meta
name: mirror-registry-config.yaml
description: ImageDigestMirrorSet and ImageTagMirrorSet for disconnected registries
type: clusterfile
category: configuration
requires:
  - cluster.mirrors
bundle: agent
clusterRole:
  - standalone
  - hub
bundleOrder: 4
docs: https://docs.openshift.com/container-platform/latest/installing/disconnected_install/installing-mirroring-disconnected.html
-#}
{%- set sources %}{% include "includes/imageContentSource.yaml.tpl" %}{% endset -%}
apiVersion: v1
kind: List
metadata:
  resourceVersion: ""
items:
- kind: ImageDigestMirrorSet
  apiVersion: config.openshift.io/v1
  metadata:
    name: mirror-registries
  spec:
    imageDigestMirrors:
{{ sources | indent(8, true)}}
- kind: ImageTagMirrorSet
  apiVersion: config.openshift.io/v1
  metadata:
    name: mirror-registries
  spec:
    imageTagMirrors:
{{ sources | indent(8, true)}}
