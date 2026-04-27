{#- @meta
name: acm-clusterimagesets-sub.yaml
description: ACM Channel subscription for automatic ClusterImageSet updates
type: clusterfile
category: acm
platforms:
  - baremetal
  - none
  - aws
  - azure
  - gcp
  - vsphere
  - openstack
  - ibmcloud
  - nutanix
requires:
  - cluster.name
relatedTemplates:
  - acm-clusterimageset.yaml.tpl
  - acm-ztp.yaml.tpl
  - acm-capi-m3.yaml.tpl
  - acm-asc.yaml.tpl
bundle: acm-hub
clusterRole:
  - hub
bundleOrder: 3
docs: https://github.com/stolostron/acm-hive-openshift-releases/tree/backplane-2.10/subscribe
-#}
{%- set operators = plugins.operators | default({}) -%}
{%- set acm = operators.acm | default({}) -%}
{%- set channel = cluster.channel | default("fast", true) -%}
{%- set imageSetBranch = acm.channel | default("release-2.14", true) | replace("release-", "backplane-") -%}
apiVersion: v1
kind: List
metadata:
  resourceVersion: ""
items:
- apiVersion: v1
  kind: Namespace
  metadata:
    name: hive-clusterimagesets
- apiVersion: app.k8s.io/v1beta1
  kind: Application
  metadata:
    name: hive-clusterimagesets
    namespace: hive-clusterimagesets
  spec:
    selector:
      matchLabels:
        app: hive-clusterimagesets
- apiVersion: apps.open-cluster-management.io/v1
  kind: Channel
  metadata:
    name: acm-hive-openshift-releases-chn-0
    namespace: hive-clusterimagesets
  spec:
    pathname: https://github.com/stolostron/acm-hive-openshift-releases.git
    type: Git
- apiVersion: apps.open-cluster-management.io/v1
  kind: Subscription
  metadata:
    name: hive-clusterimagesets-subscription-{{ channel }}-0
    namespace: hive-clusterimagesets
    labels:
      app: hive-clusterimagesets
    annotations:
      apps.open-cluster-management.io/git-branch: {{ imageSetBranch }}
      apps.open-cluster-management.io/git-path: clusterImageSets/{{ channel }}
  spec:
    channel: hive-clusterimagesets/acm-hive-openshift-releases-chn-0
    placement:
      local: true
