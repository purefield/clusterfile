{#- @meta
name: pre-check.sh
description: Comprehensive pre-installation verification (composes all modules)
type: clusterfile
category: utility
requires:
  - cluster.name
  - network.domain
relatedTemplates:
  - install-config.yaml.tpl
  - agent-config.yaml.tpl
  - pre-check-files.sh.tpl
  - pre-check-dns.sh.tpl
  - pre-check-network.sh.tpl
  - pre-check-ntp.sh.tpl
  - pre-check-registry.sh.tpl
  - pre-check-bmc.sh.tpl
bundle: agent
clusterRole:
  - standalone
  - hub
bundleOrder: 9
docs: https://docs.openshift.com/container-platform/latest/installing/installing_bare_metal/installing-bare-metal.html#installation-infrastructure-user-infra_installing-bare-metal
-#}
{%- include 'includes/pre-check/common.sh.tpl' %}
# ── FILES ─────────────────────────────────
{%- include 'includes/pre-check/files.sh.tpl' %}

# ── DNS ───────────────────────────────────
{%- include 'includes/pre-check/dns.sh.tpl' %}

# ── NETWORK ───────────────────────────────
{%- include 'includes/pre-check/network.sh.tpl' %}

# ── NTP ───────────────────────────────────
{%- include 'includes/pre-check/ntp.sh.tpl' %}

# ── REGISTRY ──────────────────────────────
{%- include 'includes/pre-check/registry.sh.tpl' %}

# ── BMC ───────────────────────────────────
{%- include 'includes/pre-check/bmc.sh.tpl' %}

echo ""
echo "═══════════════════════════════════════"
echo -e "  \033[32m✓\033[0m $PASS passed   \033[33m!\033[0m $WARN warnings"
echo "═══════════════════════════════════════"
