{#- @meta
name: agent-config.yaml
description: Agent-based installer configuration with NMState network config
type: clusterfile
category: installation
platforms:
  - baremetal
  - none
requires:
  - cluster.name
  - network.ntpservers
  - hosts.<hostname>.role
  - hosts.<hostname>.network.interfaces
  - hosts.<hostname>.network.primary.address
relatedTemplates:
  - install-config.yaml.tpl
  - mirror-registry-config.yaml.tpl
  - pre-check.sh.tpl
bundle: agent
clusterRole:
  - standalone
  - hub
bundleOrder: 2
docs: https://docs.openshift.com/container-platform/latest/installing/installing_with_agent_based_installer/preparing-to-install-with-agent-based-installer.html
-#}
{# Supports bond, vlan, or direct interface configurations #}
{% set firstHostName,firstHost = hosts.items() | first %}
{% set enabledFalse='{"enabled":false}' %}
---
apiVersion: v1alpha1
kind: AgentConfig
metadata:
  name: {{ cluster.name }}
rendezvousIP: {{ firstHost.network.primary.address }}
additionalNTPSources: {{ network.ntpservers }}
hosts:{% for name,host in hosts.items() %}
  - hostname: {{ name }}{% if host.storage.os is string %}
    rootDeviceHints:
      deviceName: {{ host.storage.os }}{% elif host.storage.os %}
    rootDeviceHints: {{ host.storage.os }}{% endif %}
    networkConfig:{%- set nmstate %}{% include "includes/nmstate.yaml.tpl" %}{% endset -%}
{{ nmstate | indent(4,true) }}{% endfor %}

