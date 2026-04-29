{#- @meta
name: acm-creds.yaml
description: ACM host inventory credentials secret for assisted installer
type: clusterfile
category: acm
platforms:
  - baremetal
  - none
requires:
  - cluster.name
  - cluster.sshKeys
  - network.domain
  - account.pullSecret
relatedTemplates:
  - acm-ztp.yaml.tpl
  - acm-capi-m3.yaml.tpl
  - acm-asc.yaml.tpl
  - acm-clusterimageset.yaml.tpl
bundle: acm-ztp,capi
clusterRole:
  - managed
bundleOrder: 2
docs: https://docs.redhat.com/en/documentation/red_hat_advanced_cluster_management_for_kubernetes/2.11/html/clusters/cluster_mce_overview
-#}
apiVersion: v1
kind: List
metadata:
  resourceVersion: ""
items:
- kind: Namespace
  apiVersion: v1
  metadata:
    name: hosted-inventory-creds
- kind: Secret
  apiVersion: v1
  type: Opaque
  metadata:
    name: {{ cluster.name }}-creds
    namespace: hosted-inventory-creds
    labels:
      cluster.open-cluster-management.io/credentials: ""
      cluster.open-cluster-management.io/type: hostinventory
  stringData:
    baseDomain: {{ network.domain }}
    pullSecret: '{{load_file(account.pullSecret)}}'
    ssh-publickey: '{{load_file(cluster.sshKeys|first)}}'
