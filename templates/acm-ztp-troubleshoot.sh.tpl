{#- @meta
name: acm-ztp-troubleshoot.sh
description: Comprehensive ZTP installation progress and troubleshooting script
type: clusterfile
category: utility
platforms:
  - baremetal
requires:
  - cluster.name
  - cluster.version
  - network.domain
  - hosts
relatedTemplates:
  - acm-ztp.yaml.tpl
  - acm-clusterimageset.yaml.tpl
  - acm-asc.yaml.tpl
  - acm-creds.yaml.tpl
bundle: utility
clusterRole:
  - hub
  - managed
bundleOrder: 91
docs: https://docs.redhat.com/en/documentation/red_hat_advanced_cluster_management_for_kubernetes/2.11/html/clusters/cluster_mce_overview#ztp-intro
-#}
{%- set controlCount = hosts.values() | selectattr('role', 'equalto', 'control') | list | length -%}
{%- set workerCount  = hosts.values() | selectattr('role', 'equalto', 'worker')  | list | length -%}
{%- set enableTPM = cluster.tpm | default(false) -%}
{%- set hasExtraManifests = cluster.manifests | default(false) or cluster.mirrors | default(false) or enableTPM -%}
#!/bin/bash
# ZTP Troubleshoot: {{ cluster.name }}.{{ network.domain }}
# Cluster version: {{ cluster.version }}
# Topology: {{ controlCount }} control + {{ workerCount }} worker
set -uo pipefail

CLUSTER="{{ cluster.name }}"
DOMAIN="{{ network.domain }}"
VERSION="{{ cluster.version }}"
NS="${CLUSTER}"

PASS=0; WARN=0; FAIL=0; SECTION=""
pass() { echo -e "  \033[32m✓\033[0m $1"; ((PASS++)); }
warn() { echo -e "  \033[33m!\033[0m $1"; ((WARN++)); }
fail() { echo -e "  \033[31m✗\033[0m $1"; ((FAIL++)); }
section() { [ -n "$SECTION" ] && echo ""; SECTION="$1"; echo -e "\033[1m$1:\033[0m"; }
check_resource() {
    local kind="$1" name="$2" ns="${3:-$NS}"
    if oc get "$kind" "$name" -n "$ns" &>/dev/null; then
        pass "$kind/$name exists in $ns"
        return 0
    else
        fail "$kind/$name NOT FOUND in $ns"
        return 1
    fi
}

echo "══════════════════════════════════════════════════════"
echo "  ZTP Troubleshoot: ${CLUSTER}.${DOMAIN}"
echo "  Version: ${VERSION}  Nodes: {{ controlCount }}+{{ workerCount }}"
echo "══════════════════════════════════════════════════════"

# ─── 1. NAMESPACE & CORE RESOURCES ───────────────────────
section "1. Namespace & Core Resources"

check_resource namespace "$CLUSTER" ""
check_resource secret "pullsecret-${CLUSTER}" "$NS"
check_resource agentclusterinstall "$CLUSTER" "$NS"
check_resource clusterdeployment "$CLUSTER" "$NS"
check_resource klusterletaddonconfig "$CLUSTER" "$NS"
check_resource managedcluster "$CLUSTER" ""
check_resource infraenv "$CLUSTER" "$NS"

# ─── 2. CLUSTERIMAGESETS ─────────────────────────────────
section "2. ClusterImageSet"

IMAGESET="img{{ cluster.version }}-{{ cluster.arch | default('x86_64', true) | replace('_', '-') }}-appsub"
if oc get clusterimageset "$IMAGESET" &>/dev/null; then
    pass "ClusterImageSet $IMAGESET exists"
else
    fail "ClusterImageSet $IMAGESET NOT FOUND — cluster cannot install without it"
fi

# ─── 3. AGENTCLUSTERINSTALL STATUS ───────────────────────
section "3. AgentClusterInstall Conditions"

if oc get agentclusterinstall "$CLUSTER" -n "$NS" &>/dev/null; then
    ACI_JSON=$(oc get agentclusterinstall "$CLUSTER" -n "$NS" -o json)

    for COND in SpecSynced Validated RequirementsMet Completed Failed Stopped; do
        STATUS=$(echo "$ACI_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for c in data.get('status',{}).get('conditions',[]):
    if c['type'] == '$COND':
        print(f\"{c['status']:6s} {c.get('reason','')}: {c.get('message','')}\")
        break
else:
    print('not set')
" 2>/dev/null || echo "parse error")
        case "$COND" in
            SpecSynced|Validated|RequirementsMet)
                if echo "$STATUS" | grep -q "^True"; then
                    pass "$COND: $STATUS"
                else
                    fail "$COND: $STATUS"
                fi ;;
            Completed)
                if echo "$STATUS" | grep -q "^True"; then
                    pass "$COND: $STATUS"
                else
                    warn "$COND: $STATUS"
                fi ;;
            Failed|Stopped)
                if echo "$STATUS" | grep -q "^True"; then
                    fail "$COND: $STATUS"
                else
                    pass "$COND: $STATUS"
                fi ;;
        esac
    done

    # Installation progress
    PROGRESS=$(echo "$ACI_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
stage = data.get('status',{}).get('debugInfo',{}).get('state','unknown')
pct = data.get('status',{}).get('progress',{}).get('totalPercentage', 'n/a')
print(f'Stage: {stage}, Progress: {pct}%')
" 2>/dev/null || echo "unknown")
    echo "  → $PROGRESS"
fi{% if hasExtraManifests %}

# ─── 4. EXTRA MANIFESTS CONFIGMAP ────────────────────────
section "4. Extra Manifests ConfigMap"

if check_resource configmap "extraclustermanifests" "$NS"; then
    KEYS=$(oc get configmap extraclustermanifests -n "$NS" -o jsonpath='{.data}' | python3 -c "
import sys, json
data = json.load(sys.stdin)
for k in sorted(data.keys()):
    print(f'    {k} ({len(data[k])} bytes)')
" 2>/dev/null)
    echo "  Contents:"
    echo "$KEYS"

    # Verify ACI references it
    REF=$(oc get agentclusterinstall "$CLUSTER" -n "$NS" -o jsonpath='{.spec.manifestsConfigMapRef.name}' 2>/dev/null)
    if [ "$REF" = "extraclustermanifests" ]; then
        pass "AgentClusterInstall.manifestsConfigMapRef → extraclustermanifests"
    else
        fail "AgentClusterInstall.manifestsConfigMapRef = '$REF' (expected 'extraclustermanifests')"
    fi
fi{% endif %}{% if cluster.mirrors is defined %}
# ─── 5. MIRROR REGISTRY CONFIG ───────────────────────────
section "5. Mirror Registry ConfigMap"

check_resource configmap "mirror-registries-{{ cluster.name }}" "multicluster-engine"

MIRROR_REF=$(oc get agentclusterinstall "$CLUSTER" -n "$NS" -o jsonpath='{.spec.mirrorRegistryRef.name}' 2>/dev/null)
if [ "$MIRROR_REF" = "mirror-registries-${CLUSTER}" ]; then
    pass "AgentClusterInstall.mirrorRegistryRef → mirror-registries-${CLUSTER}"
else
    warn "AgentClusterInstall.mirrorRegistryRef = '$MIRROR_REF'"
fi{% endif %}

# ─── 6. CLUSTERDEPLOYMENT STATUS ─────────────────────────
section "6. ClusterDeployment Conditions"

if oc get clusterdeployment "$CLUSTER" -n "$NS" &>/dev/null; then
    CD_JSON=$(oc get clusterdeployment "$CLUSTER" -n "$NS" -o json)

    for COND in ProvisionFailed InstallImagesNotResolved DNSNotReady; do
        STATUS=$(echo "$CD_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for c in data.get('status',{}).get('conditions',[]):
    if c['type'] == '$COND':
        print(f\"{c['status']:6s} {c.get('reason','')}: {c.get('message','')}\")
        break
else:
    print('not set')
" 2>/dev/null || echo "parse error")
        if echo "$STATUS" | grep -q "^True"; then
            fail "$COND: $STATUS"
        else
            pass "$COND: $STATUS"
        fi
    done

    # Check ClusterInstallRef is present and NOT provisioning
    HAS_PROVISION=$(echo "$CD_JSON" | python3 -c "
import sys, json; data = json.load(sys.stdin)
print('yes' if data.get('spec',{}).get('provisioning') else 'no')
" 2>/dev/null)
    HAS_INSTALLREF=$(echo "$CD_JSON" | python3 -c "
import sys, json; data = json.load(sys.stdin)
print('yes' if data.get('spec',{}).get('clusterInstallRef') else 'no')
" 2>/dev/null)
    if [ "$HAS_INSTALLREF" = "yes" ] && [ "$HAS_PROVISION" = "no" ]; then
        pass "ClusterDeployment uses clusterInstallRef (no provisioning conflict)"
    elif [ "$HAS_INSTALLREF" = "yes" ] && [ "$HAS_PROVISION" = "yes" ]; then
        fail "ClusterDeployment has BOTH clusterInstallRef AND provisioning — mutually exclusive!"
    else
        warn "ClusterDeployment: installRef=$HAS_INSTALLREF provisioning=$HAS_PROVISION"
    fi
fi

# ─── 7. PER-HOST RESOURCES ──────────────────────────────
section "7. Per-Host Resources ({{ hosts | length }} hosts)"{% for name, host in hosts.items() %}
echo "  ── {{ name }} ({{ host.role }}) ──"
check_resource nmstateconfig "{{ name }}-nmstate" "$NS"{% if host.bmc is defined %}
check_resource secret "bmc-secret-{{ name }}" "$NS"{% endif %}
check_resource baremetalhost "{{ name }}" "$NS"{% endfor %}

# ─── 8. BAREMETALHOST STATUS ─────────────────────────────
section "8. BareMetalHost Status"

echo "  NAME                          STATE           ONLINE  ERROR"
echo "  ────────────────────────────  ──────────────  ──────  ─────"
oc get baremetalhost -n "$NS" --no-headers -o custom-columns=\
'NAME:.metadata.name,STATE:.status.provisioning.state,ONLINE:.status.poweredOn,ERROR:.status.errorMessage' 2>/dev/null | while read -r line; do
    echo "  $line"
done

# ─── 9. AGENT STATUS ────────────────────────────────────
section "9. Agents"

AGENTS=$(oc get agent -n "$NS" --no-headers 2>/dev/null | wc -l)
EXPECTED={{ hosts | length }}
if [ "$AGENTS" -ge "$EXPECTED" ]; then
    pass "$AGENTS/$EXPECTED agents registered"
else
    warn "$AGENTS/$EXPECTED agents registered (waiting for hosts to boot)"
fi

echo ""
echo "  HOSTNAME                              ROLE     STAGE           APPROVED"
echo "  ──────────────────────────────────────  ───────  ──────────────  ────────"
oc get agent -n "$NS" --no-headers -o custom-columns=\
'HOST:.spec.hostname,ROLE:.spec.role,STAGE:.status.debugInfo.state,APPROVED:.spec.approved' 2>/dev/null | while read -r line; do
    echo "  $line"
done

# ─── 10. INFRAENV & DISCOVERY ISO ────────────────────────
section "10. InfraEnv & Discovery ISO"

if oc get infraenv "$CLUSTER" -n "$NS" &>/dev/null; then
    ISO_URL=$(oc get infraenv "$CLUSTER" -n "$NS" -o jsonpath='{.status.isoDownloadURL}' 2>/dev/null)
    if [ -n "$ISO_URL" ]; then
        pass "ISO URL generated"
        echo "  → ${ISO_URL:0:80}..."
    else
        fail "No ISO URL — discovery image not yet created"
    fi

    IE_CONDS=$(oc get infraenv "$CLUSTER" -n "$NS" -o jsonpath='{.status.conditions[*].type}' 2>/dev/null)
    for COND in ImageCreated RequirementsMet; do
        STATUS=$(oc get infraenv "$CLUSTER" -n "$NS" -o jsonpath="{.status.conditions[?(@.type=='$COND')].status}" 2>/dev/null)
        MSG=$(oc get infraenv "$CLUSTER" -n "$NS" -o jsonpath="{.status.conditions[?(@.type=='$COND')].message}" 2>/dev/null)
        if [ "$STATUS" = "True" ]; then
            pass "InfraEnv $COND: $MSG"
        else
            warn "InfraEnv $COND ($STATUS): $MSG"
        fi
    done
fi

# ─── 11. OS-IMAGES SYNC JOB ─────────────────────────────
section "11. OS-Images Sync Job"

check_resource serviceaccount "os-images-sync" "$NS"
check_resource clusterrolebinding "os-images-sync-${CLUSTER}" ""

JOB_STATUS=$(oc get job os-images-sync -n "$NS" -o jsonpath='{.status.conditions[0].type}' 2>/dev/null)
case "$JOB_STATUS" in
    Complete) pass "os-images-sync job: Complete" ;;
    Failed)   fail "os-images-sync job: Failed" ;;
    *)        warn "os-images-sync job status: ${JOB_STATUS:-not found}" ;;
esac

# Show job pod logs if available
JOB_POD=$(oc get pods -n "$NS" -l job-name=os-images-sync --no-headers -o name 2>/dev/null | head -1)
if [ -n "$JOB_POD" ]; then
    echo "  Job log:"
    oc logs "$JOB_POD" -n "$NS" 2>/dev/null | while read -r line; do echo "    $line"; done
fi

# ─── 12. AGENTSERVICECONFIG ──────────────────────────────
section "12. AgentServiceConfig (Hub)"

ASC_STATUS=$(oc get agentserviceconfig agent -o jsonpath='{.status.conditions[?(@.type=="DeploymentsHealthy")].status}' 2>/dev/null)
if [ "$ASC_STATUS" = "True" ]; then
    pass "AgentServiceConfig DeploymentsHealthy"
else
    fail "AgentServiceConfig DeploymentsHealthy: $ASC_STATUS"
fi

# Check osImages includes our version
OS_IMG=$(oc get agentserviceconfig agent -o go-template='{% raw %}{{range .spec.osImages}}{{if eq .version "{% endraw %}'"$VERSION"'{% raw %}"}}found{{end}}{{end}}{% endraw %}' 2>/dev/null)
if [ "$OS_IMG" = "found" ]; then
    pass "osImage for $VERSION present in ASC"
else
    fail "osImage for $VERSION NOT FOUND in ASC — cluster cannot install"
fi

# ─── 13. ASSISTED-SERVICE HEALTH ─────────────────────────
section "13. Assisted-Service Pods"

echo "  Pod status:"
oc get pods -n multicluster-engine -l app=assisted-service --no-headers 2>/dev/null | while read -r line; do
    echo "    $line"
done
oc get pods -n multicluster-engine -l app=assisted-image-service --no-headers 2>/dev/null | while read -r line; do
    echo "    $line"
done

# Recent errors for this cluster
ERRORS=$(oc logs -n multicluster-engine -l app=assisted-service --tail=200 2>/dev/null | grep -i "error.*${CLUSTER}" | tail -5)
if [ -n "$ERRORS" ]; then
    warn "Recent assisted-service errors for ${CLUSTER}:"
    echo "$ERRORS" | while read -r line; do echo "    $line"; done
else
    pass "No recent assisted-service errors for ${CLUSTER}"
fi

# ─── 14. MANIFESTWORK (POC BANNER) ──────────────────────
section "14. ManifestWork"

check_resource manifestwork "poc-banner" "$NS"

# ─── 15. RECENT EVENTS ──────────────────────────────────
section "15. Recent Events (last 10)"

oc get events -n "$NS" --sort-by='.lastTimestamp' 2>/dev/null | tail -10 | while read -r line; do
    echo "  $line"
done

# ─── SUMMARY ────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
echo -e "  \033[32m✓\033[0m $PASS passed   \033[33m!\033[0m $WARN warnings   \033[31m✗\033[0m $FAIL failures"
echo "══════════════════════════════════════════════════════"

[ "$FAIL" -gt 0 ] && exit 1 || exit 0
