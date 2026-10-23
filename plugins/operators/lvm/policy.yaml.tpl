{%- set lvm = plugins.operators.lvm -%}
{%- set lvmEnabled = lvm.enabled | default(true) -%}
{%- set lvmChannel = lvm.channel | default("stable-" + cluster.version.split(".")[:2] | join(".")) -%}
{%- if lvmEnabled %}
- kind: Policy
  apiVersion: policy.open-cluster-management.io/v1
  metadata:
    name: operator-lvm
    namespace: {{ cluster.name }}
    annotations:
      policy.open-cluster-management.io/standards: NIST SP 800-53
      policy.open-cluster-management.io/categories: CM Configuration Management
      policy.open-cluster-management.io/controls: CM-2 Baseline Configuration
  spec:
    remediationAction: enforce
    disabled: false
    policy-templates:
      - objectDefinition:
          apiVersion: policy.open-cluster-management.io/v1
          kind: ConfigurationPolicy
          metadata:
            name: lvm-subscription
          spec:
            remediationAction: enforce
            severity: high
            object-templates:
              - complianceType: musthave
                objectDefinition:
                  apiVersion: v1
                  kind: Namespace
                  metadata:
                    name: openshift-storage
              - complianceType: musthave
                objectDefinition:
                  apiVersion: operators.coreos.com/v1
                  kind: OperatorGroup
                  metadata:
                    name: openshift-storage-operatorgroup
                    namespace: openshift-storage
                  spec:
                    targetNamespaces:
                      - openshift-storage
              - complianceType: musthave
                objectDefinition:
                  apiVersion: operators.coreos.com/v1alpha1
                  kind: Subscription
                  metadata:
                    name: lvms-operator
                    namespace: openshift-storage
                  spec:
                    channel: {{ lvmChannel }}
                    installPlanApproval: {{ lvm.approval | default("Automatic") }}
                    name: lvms-operator
                    source: {{ lvm.source | default("redhat-operators") }}
                    sourceNamespace: openshift-marketplace
      - extraDependencies:
          - apiVersion: policy.open-cluster-management.io/v1
            kind: ConfigurationPolicy
            name: lvm-subscription
            compliance: Compliant
        objectDefinition:
          apiVersion: policy.open-cluster-management.io/v1
          kind: ConfigurationPolicy
          metadata:
            name: lvm-operator-ready
          spec:
            remediationAction: inform
            severity: medium
            object-templates:
              - complianceType: musthave
                objectDefinition:
                  apiVersion: apiextensions.k8s.io/v1
                  kind: CustomResourceDefinition
                  metadata:
                    name: lvmclusters.lvm.topolvm.io
      - extraDependencies:
          - apiVersion: policy.open-cluster-management.io/v1
            kind: ConfigurationPolicy
            name: lvm-operator-ready
            compliance: Compliant
        objectDefinition:
          apiVersion: policy.open-cluster-management.io/v1
          kind: ConfigurationPolicy
          metadata:
            name: lvm-cluster
          spec:
            remediationAction: enforce
            severity: medium
            object-templates:
              - complianceType: musthave
                objectDefinition:
                  apiVersion: lvm.topolvm.io/v1alpha1
                  kind: LVMCluster
                  metadata:
                    name: lvmcluster
                    namespace: openshift-storage
                  spec:
                    storage:
                      deviceClasses:{% if lvm.deviceClasses is defined %}{% for dc in lvm.deviceClasses %}
                        - name: {{ dc.name | default("vg1") }}{% if dc.default is defined %}
                          default: {{ dc.default | lower }}{% elif loop.first %}
                          default: true{% endif %}
                          fstype: {{ dc.fstype | default("xfs") }}{% if dc.thinPoolConfig is defined %}
                          thinPoolConfig:
                            name: {{ dc.thinPoolConfig.name | default("thin-pool-1") }}
                            sizePercent: {{ dc.thinPoolConfig.sizePercent | default(90) }}
                            overprovisionRatio: {{ dc.thinPoolConfig.overprovisionRatio | default(10) }}{% endif %}{% endfor %}{% else %}
                        - name: vg1
                          default: true
                          fstype: xfs
                          thinPoolConfig:
                            name: thin-pool-1
                            sizePercent: 90
                            overprovisionRatio: 10{% endif %}
- kind: PlacementBinding
  apiVersion: policy.open-cluster-management.io/v1
  metadata:
    name: operator-lvm
    namespace: {{ cluster.name }}
  placementRef:
    name: {{ cluster.name }}
    kind: Placement
    apiGroup: cluster.open-cluster-management.io
  subjects:
    - name: operator-lvm
      kind: Policy
      apiGroup: policy.open-cluster-management.io
{%- endif -%}
