{#-
  Workaround for missing cluster-api-provider-openshift-assisted infrastructure
  controller. Walks Machines in the cluster namespace, follows each Machine's
  bootstrap.configRef → OpenshiftAssistedConfig (which owns an InfraEnv with
  the same name) and infrastructureRef → Metal3Machine. Finds the BMH whose
  spec.consumerRef.name matches that Metal3Machine and labels it with
  infraenvs.agent-install.openshift.io: <OpenshiftAssistedConfig name> so the
  bmac controller patches the discovery ISO URL onto BMH.spec.image.url.

  ACM Policy continuously reconciles, so newly-claimed BMHs get bound as soon
  as Metal3 sets consumerRef. Removes cleanly when the real infra controller
  is installed: just delete the policy.
-#}
- kind: Policy
  apiVersion: policy.open-cluster-management.io/v1
  metadata:
    name: bind-bmh-infraenvs-{{ cluster.name }}
    namespace: {{ cluster.name }}
  spec:
    remediationAction: enforce
    disabled: false
    policy-templates:
      - objectDefinition:
          apiVersion: policy.open-cluster-management.io/v1
          kind: ConfigurationPolicy
          metadata:
            name: bind-bmh-infraenvs-{{ cluster.name }}
          spec:
            remediationAction: enforce
            severity: high
            pruneObjectBehavior: None
            object-templates-raw: |
              {% raw %}{{- $machines := (lookup "cluster.x-k8s.io/v1beta1" "Machine"{% endraw %} "{{ cluster.name }}" "" "cluster.x-k8s.io/cluster-name={{ cluster.name }}"{% raw %}).items }}
              {{- $bmhs := (lookup "metal3.io/v1alpha1" "BareMetalHost"{% endraw %} "{{ cluster.name }}" ""{% raw %}).items }}
              {{- range $m := $machines }}
              {{- if and $m.spec.bootstrap.configRef $m.spec.infrastructureRef }}
              {{- $oac := $m.spec.bootstrap.configRef.name }}
              {{- $m3m := $m.spec.infrastructureRef.name }}
              {{- range $bmh := $bmhs }}
              {{- if and $bmh.spec.consumerRef (eq $bmh.spec.consumerRef.name $m3m) }}
              - complianceType: musthave
                objectDefinition:
                  apiVersion: metal3.io/v1alpha1
                  kind: BareMetalHost
                  metadata:
                    name: {{ $bmh.metadata.name }}
                    namespace: {{ $bmh.metadata.namespace }}
                    labels:
                      infraenvs.agent-install.openshift.io: {{ $oac }}
              {{- end }}
              {{- end }}
              {{- end }}
              {{- end }}{% endraw %}
- kind: Placement
  apiVersion: cluster.open-cluster-management.io/v1beta1
  metadata:
    name: bind-bmh-infraenvs-{{ cluster.name }}-pl
    namespace: {{ cluster.name }}
  spec:
    predicates:
      - requiredClusterSelector:
          labelSelector:
            matchLabels:
              local-cluster: "true"
    clusterSets:
      - default
- kind: PlacementBinding
  apiVersion: policy.open-cluster-management.io/v1
  metadata:
    name: bind-bmh-infraenvs-{{ cluster.name }}-pb
    namespace: {{ cluster.name }}
  placementRef:
    apiGroup: cluster.open-cluster-management.io
    kind: Placement
    name: bind-bmh-infraenvs-{{ cluster.name }}-pl
  subjects:
    - apiGroup: policy.open-cluster-management.io
      kind: Policy
      name: bind-bmh-infraenvs-{{ cluster.name }}
- kind: ManagedClusterSetBinding
  apiVersion: cluster.open-cluster-management.io/v1beta2
  metadata:
    name: default
    namespace: {{ cluster.name }}
  spec:
    clusterSet: default
