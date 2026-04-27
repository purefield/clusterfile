{#- @meta
name: cluster-overview.html
description: Customer-facing cluster overview document (self-contained HTML)
type: clusterfile
category: documentation
platforms:
  - aws
  - azure
  - gcp
  - vsphere
  - openstack
  - ibmcloud
  - nutanix
  - baremetal
  - none
requires:
  - cluster.name
  - network.domain
relatedTemplates:
  - install-config.yaml.tpl
  - pre-check.sh.tpl
bundle: utility
clusterRole:
  - standalone
  - hub
  - managed
bundleOrder: 90
docs: https://docs.openshift.com/container-platform/latest/installing/index.html
-#}
{%- set controlHosts = hosts.values() | selectattr('role', 'in', ['control', 'master']) | list -%}
{%- set workerHosts  = hosts.values() | selectattr('role', 'equalto', 'worker') | list -%}
{%- set platform = cluster.platform | default('baremetal', true) -%}
{%- set platformNames = {
  'baremetal': 'Bare Metal (Agent-based)',
  'none': 'Single Node OpenShift',
  'aws': 'Amazon Web Services',
  'azure': 'Microsoft Azure',
  'gcp': 'Google Cloud Platform',
  'vsphere': 'VMware vSphere',
  'openstack': 'Red Hat OpenStack',
  'ibmcloud': 'IBM Cloud',
  'nutanix': 'Nutanix'
} -%}
{%- set cm = cluster.machine | default({}) -%}
{%- set controlMachine = cm.control | default({}) -%}
{%- set workerMachine  = cm.worker | default({}) -%}
{%- set detailedHosts = [] -%}
{%- set simpleHosts = [] -%}
{%- for name, host in hosts.items() -%}
{%- if host.network is defined and host.network.primary is defined and host.network.primary.address is defined -%}
{%- set _ = detailedHosts.append({'name': name, 'host': host}) -%}
{%- else -%}
{%- set _ = simpleHosts.append({'name': name, 'host': host}) -%}
{%- endif -%}
{%- endfor -%}
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ cluster.name }}.{{ network.domain }}</title>
<style>
  :root {
    --bg: #fff;
    --fg: #1d1d1f;
    --muted: #6e6e73;
    --border: #d2d2d7;
    --accent: #0066cc;
    --code-bg: #f5f5f7;
    --section-bg: #fbfbfd;
    --red: #ee0000;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1d1d1f;
      --fg: #f5f5f7;
      --muted: #a1a1a6;
      --border: #424245;
      --accent: #2997ff;
      --code-bg: #2c2c2e;
      --section-bg: #232325;
      --red: #ff453a;
    }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--fg);
    background: var(--bg);
    line-height: 1.5;
    max-width: 960px;
    margin: 0 auto;
    padding: 48px 24px;
    -webkit-font-smoothing: antialiased;
  }
  header { margin-bottom: 48px; }
  header h1 {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -0.5px;
    margin-bottom: 4px;
  }
  header p { color: var(--muted); font-size: 17px; }
  section { margin-bottom: 40px; }
  h2 {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.2px;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  h3 {
    font-size: 15px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 24px 0 10px;
  }
  h3:first-child { margin-top: 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    margin-bottom: 8px;
  }
  th {
    text-align: left;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--muted);
    padding: 8px 12px;
    border-bottom: 2px solid var(--border);
  }
  td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  td:first-child { font-weight: 500; white-space: nowrap; }
  tr:last-child td { border-bottom: none; }
  .kv td:first-child { color: var(--muted); width: 160px; }
  .kv td:last-child { font-family: "SF Mono", Menlo, monospace; font-size: 13px; }
  code {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 13px;
    background: var(--code-bg);
    padding: 2px 6px;
    border-radius: 4px;
  }
  .card {
    background: var(--section-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 12px;
  }
  .card h4 {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 10px;
  }
  .card table { margin-bottom: 0; }
  .card td:first-child { width: 120px; }
  .callout {
    background: var(--code-bg);
    border-left: 3px solid var(--accent);
    padding: 12px 16px;
    border-radius: 0 6px 6px 0;
    font-size: 14px;
    margin: 12px 0;
  }
  .tag {
    display: inline-block;
    background: var(--code-bg);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    margin-right: 4px;
  }
  ul { list-style: none; padding: 0; }
  ul li { padding: 4px 0; font-size: 14px; }
  ul li::before { content: ""; }
  footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 12px;
  }
  @media print {
    body { padding: 0; max-width: none; }
    .card { break-inside: avoid; }
  }
</style>
</head>
<body>

<header>
  <h1>{{ cluster.name }}.{{ network.domain }}</h1>
  <p>OpenShift Container Platform {{ cluster.version | default('4.x') }} on {{ platformNames[platform] | default(platform) }}</p>
</header>

<section>
  <h2>Cluster Identity</h2>
  <table class="kv">
    <tr><td>Cluster Name</td><td>{{ cluster.name }}</td></tr>
    <tr><td>Base Domain</td><td>{{ network.domain }}</td></tr>
    <tr><td>FQDN</td><td>{{ cluster.name }}.{{ network.domain }}</td></tr>
    <tr><td>Platform</td><td>{{ platformNames[platform] | default(platform) }}</td></tr>
    <tr><td>Version</td><td>{{ cluster.version | default('—') }}</td></tr>{% if cluster.arch is defined %}
    <tr><td>Architecture</td><td>{{ cluster.arch }}</td></tr>{% endif %}{% if cluster.location is defined %}
    <tr><td>Location</td><td>{{ cluster.location }}</td></tr>{% endif %}{% if cluster.tpm | default(false) %}
    <tr><td>TPM Encryption</td><td>Enabled — LUKS disk encryption with TPM 2.0</td></tr>{% endif %}{% if cluster.disconnected is defined %}
    <tr><td>Disconnected</td><td>Air-gapped — default OperatorHub sources disabled</td></tr>{% endif %}
  </table>
</section>

<section>
  <h2>Topology</h2>
  <table>
    <thead><tr><th>Role</th><th>Count</th></tr></thead>
    <tbody>
      <tr><td>Control Plane</td><td>{{ controlHosts | length }}</td></tr>
      <tr><td>Worker</td><td>{{ workerHosts | length }}</td></tr>
      <tr><td><strong>Total</strong></td><td><strong>{{ hosts | length }}</strong></td></tr>
    </tbody>
  </table>{% if controlHosts | length == 1 and workerHosts | length == 0 %}
  <div class="callout">Single Node OpenShift — control plane and workloads run on one node.</div>{% endif %}{% if controlMachine.cpus is defined or workerMachine.cpus is defined %}
  <h3>Machine Resources</h3>
  <table>
    <thead><tr><th>Role</th><th>Count</th><th>Cores</th><th>Sockets</th><th>Memory</th><th>OS Disk</th><th>Data Disks</th><th>Total vCPUs</th><th>Total Memory</th><th>Total Storage</th></tr></thead>
    <tbody>{% if controlMachine.cpus is defined %}
      {%- set cCount = controlHosts | length -%}
      {%- set cSockets = controlMachine.sockets | default(1) -%}
      {%- set cVcpus = controlMachine.cpus * cSockets -%}
      {%- set cStorage = controlMachine.storage | default({}) -%}
      {%- set cDataDisks = cStorage.data | default([]) -%}
      {%- set cStoragePerNode = cStorage.os | default(0) + cDataDisks | sum -%}
      <tr>
        <td>Control Plane</td>
        <td>{{ cCount }}</td>
        <td>{{ controlMachine.cpus }}</td>
        <td>{{ cSockets }}</td>
        <td>{{ controlMachine.memory | default('—') }}{% if controlMachine.memory is defined %} GiB{% endif %}</td>
        <td>{% if cStorage.os is defined %}{{ cStorage.os }} GiB{% else %}—{% endif %}</td>
        <td>{% if cDataDisks | length > 0 %}{{ cDataDisks | length }} &times; {{ cDataDisks[0] }} GiB{% else %}—{% endif %}</td>
        <td>{{ cVcpus * cCount }}</td>
        <td>{% if controlMachine.memory is defined %}{{ controlMachine.memory * cCount }} GiB{% else %}—{% endif %}</td>
        <td>{% if cStoragePerNode > 0 %}{{ (cStoragePerNode * cCount) | int | string | reverse | batch(3) | map('join') | join(',') | reverse }} GiB{% else %}—{% endif %}</td>
      </tr>{% endif %}{% if workerMachine.cpus is defined and workerHosts | length > 0 %}
      {%- set wCount = workerHosts | length -%}
      {%- set wSockets = workerMachine.sockets | default(1) -%}
      {%- set wVcpus = workerMachine.cpus * wSockets -%}
      {%- set wStorage = workerMachine.storage | default({}) -%}
      {%- set wDataDisks = wStorage.data | default([]) -%}
      {%- set wStoragePerNode = wStorage.os | default(0) + wDataDisks | sum -%}
      <tr>
        <td>Worker</td>
        <td>{{ wCount }}</td>
        <td>{{ workerMachine.cpus }}</td>
        <td>{{ wSockets }}</td>
        <td>{{ workerMachine.memory | default('—') }}{% if workerMachine.memory is defined %} GiB{% endif %}</td>
        <td>{% if wStorage.os is defined %}{{ wStorage.os }} GiB{% else %}—{% endif %}</td>
        <td>{% if wDataDisks | length > 0 %}{{ wDataDisks | length }} &times; {{ wDataDisks[0] }} GiB{% else %}—{% endif %}</td>
        <td>{{ wVcpus * wCount }}</td>
        <td>{% if workerMachine.memory is defined %}{{ workerMachine.memory * wCount }} GiB{% else %}—{% endif %}</td>
        <td>{% if wStoragePerNode > 0 %}{{ (wStoragePerNode * wCount) | int | string | reverse | batch(3) | map('join') | join(',') | reverse }} GiB{% else %}—{% endif %}</td>
      </tr>{% endif %}
      {%- set totalCount = controlHosts | length + workerHosts | length -%}
      {%- set totalVcpus = ((controlMachine.cpus | default(0)) * (controlMachine.sockets | default(1)) * (controlHosts | length)) + ((workerMachine.cpus | default(0)) * (workerMachine.sockets | default(1)) * (workerHosts | length)) -%}
      {%- set totalMemory = ((controlMachine.memory | default(0)) * (controlHosts | length)) + ((workerMachine.memory | default(0)) * (workerHosts | length)) -%}
      {%- set cSt = controlMachine.storage | default({}) -%}
      {%- set wSt = workerMachine.storage | default({}) -%}
      {%- set totalStorage = ((cSt.os | default(0) + (cSt.data | default([]) | sum)) * (controlHosts | length)) + ((wSt.os | default(0) + (wSt.data | default([]) | sum)) * (workerHosts | length)) -%}
      <tr>
        <td><strong>Total</strong></td>
        <td><strong>{{ totalCount }}</strong></td>
        <td></td><td></td><td></td><td></td><td></td>
        <td><strong>{{ totalVcpus }}</strong></td>
        <td><strong>{% if totalMemory > 0 %}{{ totalMemory }} GiB{% else %}—{% endif %}</strong></td>
        <td><strong>{% if totalStorage > 0 %}{{ totalStorage | int | string | reverse | batch(3) | map('join') | join(',') | reverse }} GiB{% else %}—{% endif %}</strong></td>
      </tr>
    </tbody>
  </table>{% endif %}
</section>

<section>
  <h2>Network</h2>{% if network.primary is defined %}
  <h3>Primary</h3>
  <table class="kv">{% if network.primary.subnet is defined %}
    {%- set primaryPrefix = network.primary.subnet.split('/')[1] | int -%}
    <tr><td>Machine Network</td><td>{{ network.primary.subnet }} <span style="color:var(--muted)">({{ 2 ** (32 - primaryPrefix) - 2 }} hosts)</span></td></tr>{% endif %}{% if network.primary.gateway is defined %}
    <tr><td>Gateway</td><td>{{ network.primary.gateway }}</td></tr>{% endif %}
    <tr><td>Network Type</td><td>{{ network.primary.type | default('OVNKubernetes') }}</td></tr>{% if network.primary.mtu %}
    <tr><td>MTU</td><td>{{ network.primary.mtu }}</td></tr>{% endif %}{% if network.primary.bond %}
    <tr><td>Bond Mode</td><td>{{ network.primary.bond }}</td></tr>{% endif %}{% if network.primary.vlan %}
    <tr><td>VLAN ID</td><td>{{ network.primary.vlan }}</td></tr>{% endif %}
  </table>{% endif %}{% if network.cluster is defined %}
  <h3>Cluster Networks</h3>
  <table>
    <thead><tr><th>Network</th><th>CIDR</th><th>Capacity</th></tr></thead>
    <tbody>{% if network.cluster.subnet is defined %}
      {%- set clusterPrefix = network.cluster.subnet.split('/')[1] | int -%}
      {%- set hostPrefix = network.cluster.hostPrefix | default(23) | int -%}
      {%- set podsPerNode = 2 ** (32 - hostPrefix) -%}
      {%- set maxNodes = 2 ** (hostPrefix - clusterPrefix) -%}
      <tr><td>Cluster (pods)</td><td><code>{{ network.cluster.subnet }}</code></td><td>{{ podsPerNode }} pods/node at /{{ hostPrefix }} ({{ maxNodes }} max nodes)</td></tr>{% endif %}{% if network.service is defined and network.service.subnet is defined %}
      {%- set svcPrefix = network.service.subnet.split('/')[1] | int -%}
      <tr><td>Service</td><td><code>{{ network.service.subnet }}</code></td><td>{{ 2 ** (32 - svcPrefix) - 2 }} addresses</td></tr>{% endif %}{% if network.primary is defined and network.primary.subnet is defined %}
      {%- set machinePrefix = network.primary.subnet.split('/')[1] | int -%}
      <tr><td>Machine</td><td><code>{{ network.primary.subnet }}</code></td><td>{{ 2 ** (32 - machinePrefix) - 2 }} usable hosts</td></tr>{% endif %}
    </tbody>
  </table>{% endif %}{% if network.primary is defined and network.primary.vips is defined %}
  <h3>Virtual IPs</h3>
  <table>
    <thead><tr><th>Purpose</th><th>Address</th></tr></thead>
    <tbody>{% for vip in network.primary.vips.api | as_list %}
      <tr><td>API</td><td><code>{{ vip }}</code></td></tr>{% endfor %}{% for vip in network.primary.vips.apps | as_list %}
      <tr><td>Ingress (*.apps)</td><td><code>{{ vip }}</code></td></tr>{% endfor %}
    </tbody>
  </table>{% endif %}{% if network.nameservers is defined %}
  <h3>DNS</h3>
  <table class="kv">
    <tr><td>Nameservers</td><td>{% for ns in network.nameservers %}<code>{{ ns }}</code>{% if not loop.last %} {% endif %}{% endfor %}</td></tr>{% if network.dnsResolver is defined and network.dnsResolver.search is defined %}
    <tr><td>Search Domains</td><td>{% for s in network.dnsResolver.search %}<code>{{ s }}</code>{% if not loop.last %} {% endif %}{% endfor %}</td></tr>{% endif %}
  </table>{% endif %}{% if network.ntpservers is defined %}
  <h3>NTP</h3>
  <table class="kv">
    <tr><td>NTP Servers</td><td>{% for ntp in network.ntpservers %}<code>{{ ntp }}</code>{% if not loop.last %} {% endif %}{% endfor %}</td></tr>
  </table>{% endif %}{% if network.proxy is defined %}
  <h3>Proxy</h3>
  <table class="kv">
    <tr><td>HTTP</td><td>{{ network.proxy.httpProxy }}</td></tr>
    <tr><td>HTTPS</td><td>{{ network.proxy.httpsProxy }}</td></tr>
    <tr><td>No Proxy</td><td style="word-break:break-all">{{ network.proxy.noProxy }}</td></tr>
  </table>{% endif %}
</section>
{% if detailedHosts | length > 0 %}
<section>
  <h2>Hosts</h2>{% for item in detailedHosts %}
  <div class="card">
    <h4>{{ item.name }}</h4>
    <table class="kv">
      <tr><td>Role</td><td>{{ 'Control Plane' if item.host.role in ['control', 'master'] else 'Worker' }}</td></tr>
      <tr><td>IP Address</td><td>{{ item.host.network.primary.address }}</td></tr>{% if item.host.bmc is defined %}
      <tr><td>BMC</td><td>{{ item.host.bmc.address }} <span class="tag">{{ item.host.bmc.vendor }}{% if item.host.bmc.version is defined %} v{{ item.host.bmc.version }}{% endif %}</span></td></tr>{% endif %}{% if item.host.storage is defined and item.host.storage.os is defined %}
      <tr><td>Boot Disk</td><td>{% if item.host.storage.os is mapping %}{% for k, v in item.host.storage.os.items() %}{{ k }}: <code>{{ v }}</code>{% if not loop.last %}, {% endif %}{% endfor %}{% else %}<code>{{ item.host.storage.os }}</code>{% endif %}</td></tr>{% endif %}
      {%- set hostRole = 'control' if item.host.role in ['control', 'master'] else 'worker' -%}
      {%- set roleMachine = controlMachine if hostRole == 'control' else workerMachine -%}
      {%- set hm = item.host.machine if item.host.machine is defined else roleMachine if roleMachine.cpus is defined else {} -%}
      {%- set hmAnnotation = '' if (item.host.machine is defined) else ' <span style="color:var(--muted)">(role default)</span>' if roleMachine.cpus is defined else '' -%}
      {%- if hm.cpus is defined %}
      {%- set hmSockets = hm.sockets | default(1) -%}
      <tr><td>vCPUs</td><td>{{ hm.cpus * hmSockets }} <span style="color:var(--muted)">({{ hm.cpus }} cores &times; {{ hmSockets }} sockets)</span>{{ hmAnnotation }}</td></tr>{% if hm.memory is defined %}
      <tr><td>Memory</td><td>{{ hm.memory }} GiB{{ hmAnnotation }}</td></tr>{% endif %}{% if hm.storage is defined and hm.storage.os is defined %}
      <tr><td>OS Disk</td><td>{{ hm.storage.os }} GiB{{ hmAnnotation }}</td></tr>{% endif %}{% if hm.storage is defined and hm.storage.data is defined %}
      <tr><td>Data Disks</td><td>{{ hm.storage.data | length }} &times; {{ hm.storage.data[0] }} GiB{{ hmAnnotation }}</td></tr>{% endif %}{% endif %}{% if item.host.network.interfaces is defined %}
      <tr><td>NICs</td><td><table style="margin:0;border:none"><tbody>{% for iface in item.host.network.interfaces %}<tr style="border:none"><td style="border:none;padding:2px 8px 2px 0"><code>{{ iface.name }}</code></td><td style="border:none;padding:2px 0"><span class="tag">{{ iface.macAddress }}</span></td></tr>{% endfor %}</tbody></table></td></tr>{% endif %}{% if item.host.network.primary.ports is defined %}
      <tr><td>Bond Ports</td><td>{% for p in item.host.network.primary.ports %}<code>{{ p }}</code>{% if not loop.last %}, {% endif %}{% endfor %}</td></tr>{% endif %}
    </table>
  </div>{% endfor %}
</section>
{% elif simpleHosts | length > 0 %}
<section>
  <h2>Hosts</h2>
  <table>
    <thead><tr><th>Hostname</th><th>Role</th></tr></thead>
    <tbody>{% for item in simpleHosts %}
      <tr><td>{{ item.name }}</td><td>{{ 'Control Plane' if item.host.role in ['control', 'master'] else 'Worker' }}</td></tr>{% endfor %}
    </tbody>
  </table>
</section>
{% endif %}{% if cluster.mirrors is defined and cluster.mirrors | length > 0 %}
<section>
  <h2>Registry Mirrors</h2>
  <table>
    <thead><tr><th>Source</th><th>Mirror</th><th>Insecure</th></tr></thead>
    <tbody>{% for mirror in cluster.mirrors %}
      <tr><td><code>{{ mirror.source }}</code></td><td>{% for m in mirror.mirrors %}<code>{{ m }}</code>{% if not loop.last %}<br>{% endif %}{% endfor %}</td><td>{% if mirror.insecure | default(false) %}<span style="color:var(--red)">Yes</span>{% else %}No{% endif %}</td></tr>{% endfor %}
    </tbody>
  </table>
</section>
{% endif %}{% if cluster.catalogSources is defined and cluster.catalogSources | length > 0 %}
<section>
  <h2>Catalog Sources</h2>
  <p style="color:var(--muted);font-size:14px;margin-bottom:12px">Custom operator catalogs for disconnected OperatorHub.</p>
  <table>
    <thead><tr><th>Name</th><th>Image</th><th>Publisher</th></tr></thead>
    <tbody>{% for catalog in cluster.catalogSources %}
      <tr><td><code>{{ catalog.name }}</code></td><td><code>{{ catalog.image }}</code></td><td>{{ catalog.publisher | default('Custom') }}</td></tr>{% endfor %}
    </tbody>
  </table>
</section>
{% endif %}{% if network.secondary is defined and network.secondary | length > 0 %}
<section>
  <h2>Secondary Networks</h2>
  <table>
    <thead><tr><th>Name</th><th>Type</th><th>VLAN</th><th>Subnet</th><th>Namespace</th></tr></thead>
    <tbody>{% for net in network.secondary %}
      <tr><td><code>{{ net.name }}</code></td><td>{{ net.type | default('—') }}</td><td>{% if net.vlan %}{{ net.vlan }}{% else %}—{% endif %}</td><td>{{ net.subnet | default('—') }}</td><td>{{ net.namespace | default('—') }}</td></tr>{% endfor %}
    </tbody>
  </table>
</section>
{% endif %}{% if network.trustBundle is defined %}
<section>
  <h2>Trust</h2>
  <table class="kv">
    <tr><td>CA Bundle</td><td>{{ network.trustBundle }}</td></tr>
  </table>
</section>
{% endif %}{% if cluster.manifests is defined and cluster.manifests | length > 0 %}
<section>
  <h2>Additional Manifests</h2>
  <table>
    <thead><tr><th>Name</th><th>File</th></tr></thead>
    <tbody>{% for manifest in cluster.manifests %}
      <tr><td><code>{{ manifest.name }}</code></td><td>{{ manifest.file }}</td></tr>{% endfor %}
    </tbody>
  </table>
</section>
{% endif %}
{%- set hasDnsRecords = (network.primary is defined and network.primary.vips is defined) or detailedHosts | length > 0 -%}
{% if hasDnsRecords %}
<section>
  <h2>DNS Records Required</h2>
  <p style="color:var(--muted);font-size:14px;margin-bottom:12px">Create these records before installation.</p>
  <table>
    <thead><tr><th>Record</th><th>Type</th><th>Value</th></tr></thead>
    <tbody>{% if network.primary is defined and network.primary.vips is defined %}{% for vip in network.primary.vips.api | as_list %}
      <tr><td><code>api.{{ cluster.name }}.{{ network.domain }}</code></td><td>A</td><td><code>{{ vip }}</code></td></tr>{% endfor %}
      <tr><td><code>api-int.{{ cluster.name }}.{{ network.domain }}</code></td><td>CNAME</td><td><code>api.{{ cluster.name }}.{{ network.domain }}</code></td></tr>{% for vip in network.primary.vips.apps | as_list %}
      <tr><td><code>*.apps.{{ cluster.name }}.{{ network.domain }}</code></td><td>A</td><td><code>{{ vip }}</code></td></tr>{% endfor %}{% endif %}{% for item in detailedHosts %}
      <tr><td><code>{{ item.name }}</code></td><td>A</td><td><code>{{ item.host.network.primary.address }}</code></td></tr>{% endfor %}
    </tbody>
  </table>
</section>
{% endif %}
{%- set files = [] -%}
{%- if account.pullSecret is defined -%}{%- set _ = files.append({'purpose': 'Pull Secret', 'path': account.pullSecret}) -%}{%- endif -%}
{%- if cluster.sshKeys is defined -%}{%- for key in cluster.sshKeys -%}{%- set _ = files.append({'purpose': 'SSH Public Key', 'path': key}) -%}{%- endfor -%}{%- endif -%}
{%- if network.trustBundle is defined -%}{%- set _ = files.append({'purpose': 'CA Trust Bundle', 'path': network.trustBundle}) -%}{%- endif -%}
{%- for name, host in hosts.items() -%}
{%- if host.bmc is defined and host.bmc.password is defined -%}{%- set _ = files.append({'purpose': 'BMC Password (' ~ name ~ ')', 'path': host.bmc.password}) -%}{%- endif -%}
{%- endfor -%}
{%- if cluster.manifests is defined -%}{%- for manifest in cluster.manifests -%}{%- set _ = files.append({'purpose': 'Manifest: ' ~ manifest.name, 'path': manifest.file}) -%}{%- endfor -%}{%- endif -%}
{%- if plugins is defined -%}
{%- set platformPlugin = plugins[platform] | default({}) -%}
{%- if platformPlugin.credentials is defined -%}{%- set _ = files.append({'purpose': 'Platform Credentials', 'path': platformPlugin.credentials}) -%}{%- endif -%}
{%- if platformPlugin.vcenter is defined and platformPlugin.vcenter.password is defined -%}{%- set _ = files.append({'purpose': 'vCenter Password', 'path': platformPlugin.vcenter.password}) -%}{%- endif -%}
{%- if platformPlugin.prismCentral is defined and platformPlugin.prismCentral.password is defined -%}{%- set _ = files.append({'purpose': 'Prism Central Password', 'path': platformPlugin.prismCentral.password}) -%}{%- endif -%}
{%- endif -%}
{% if files | length > 0 %}
<section>
  <h2>Files Required</h2>
  <p style="color:var(--muted);font-size:14px;margin-bottom:12px">These files must be present when rendering templates.</p>
  <table>
    <thead><tr><th>Purpose</th><th>Path</th></tr></thead>
    <tbody>{% for f in files %}
      <tr><td>{{ f.purpose }}</td><td><code>{{ f.path }}</code></td></tr>{% endfor %}
    </tbody>
  </table>
</section>
{% endif %}
<footer>Generated from clusterfile configuration. Verify all values before installation.</footer>

</body>
</html>
