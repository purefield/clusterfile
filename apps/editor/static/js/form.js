/**
 * Clusterfile Editor v2.0 - Form Renderer Module
 *
 * Schema-driven form generation with two-way sync.
 */
(function() {
'use strict';

// Get references from other modules
const State = window.EditorState || {};
const Help = window.EditorHelp || {};
const Validator = window.EditorValidator || {};

let formSyncTimeout = null;
let onFormChange = null;
const FORM_SYNC_DELAY = 300;

/**
 * Fire when the in-memory uploaded-files map changes (add/remove). Listeners
 * (app.js) refresh the Rendered pane and the uploaded-files indicator.
 */
function notifyUploadedFilesChanged() {
  document.dispatchEvent(new CustomEvent('uploadedFilesChanged'));
}

/**
 * Resolve $ref in schema
 * @param {object} schema - Schema that might contain $ref
 * @param {object} rootSchema - Root schema containing $defs
 * @returns {object} - Resolved schema with $ref replaced
 */
function resolveRef(schema, rootSchema) {
  if (!schema) return schema;

  // If schema has $ref, resolve it
  if (schema.$ref) {
    const refPath = schema.$ref;
    // Handle local refs like "#/$defs/ipv4"
    if (refPath.startsWith('#/') && rootSchema) {
      const parts = refPath.substring(2).split('/');
      let resolved = rootSchema;
      for (const part of parts) {
        resolved = resolved?.[part];
        if (!resolved) {
          console.warn(`[resolveRef] Failed to resolve path part "${part}" in $ref "${refPath}"`);
          break;
        }
      }
      if (resolved) {
        // Merge the resolved ref with any other properties (like title, description)
        const { $ref, ...rest } = schema;
        return { ...resolved, ...rest };
      }
    } else if (!rootSchema) {
      console.warn(`[resolveRef] No rootSchema provided to resolve $ref "${refPath}"`);
    }
  }

  return schema;
}

/**
 * Get the effective type of a schema (resolving $ref if needed)
 */
function getSchemaType(schema, rootSchema) {
  const resolved = resolveRef(schema, rootSchema);
  return resolved?.type;
}

/**
 * Safely resolve a schema, ensuring result is a valid object
 * @param {object} schema - Schema to resolve
 * @param {object} rootSchema - Root schema for $ref resolution
 * @returns {object} - Resolved schema or original if resolution fails
 */
function safeResolveSchema(schema, rootSchema) {
  if (!schema || typeof schema !== 'object') return { type: 'string' };
  const resolved = resolveRef(schema, rootSchema);
  return (resolved && typeof resolved === 'object') ? resolved : schema;
}

/**
 * Safely get an array property from schema
 * @param {object} schema - Schema object
 * @param {string} propName - Property name (e.g., 'enum', 'required')
 * @returns {Array} - Array value or empty array
 */
function getSchemaArray(schema, propName) {
  const prop = schema?.[propName];
  return Array.isArray(prop) ? prop : [];
}

/**
 * Check if a value is in schema enum (safely)
 * @param {*} value - Value to check
 * @param {object} schema - Schema with potential enum
 * @returns {boolean} - True if value is in enum or enum doesn't exist
 */
function isValidEnumValue(value, schema) {
  const enumValues = getSchemaArray(schema, 'enum');
  return enumValues.length === 0 || enumValues.includes(value);
}

/**
 * Get root schema from state (convenience function)
 */
function getRootSchema() {
  return State.state?.schema;
}

/**
 * Set form change callback
 */
function setFormChangeCallback(callback) {
  onFormChange = callback;
}

/**
 * Trigger form change with debounce
 */
function triggerFormChange() {
  clearTimeout(formSyncTimeout);
  formSyncTimeout = setTimeout(() => {
    if (onFormChange) {
      onFormChange();
    }
  }, FORM_SYNC_DELAY);
}

/**
 * Render a section of the form
 */
function renderSection(sectionName, container) {
  if (!State.state?.schema?.properties?.[sectionName]) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state__title">Schema not loaded</div>
      <div class="empty-state__description">Unable to render form without schema.</div>
    </div>`;
    return;
  }

  const sectionSchema = State.state.schema.properties[sectionName];
  container.innerHTML = '';

  const section = document.createElement('div');
  section.className = 'form-section';

  const title = document.createElement('h2');
  title.className = 'form-section__title';
  title.textContent = sectionSchema.title || sectionName;
  section.appendChild(title);

  if (sectionName === 'hosts') {
    renderHostsSection(section, sectionSchema);
  } else if (sectionName === 'plugins') {
    renderPluginsSection(section, sectionSchema);
  } else {
    renderObjectFields(section, sectionSchema, sectionName, State.state.currentObject?.[sectionName] || {});
  }

  container.appendChild(section);
}

/**
 * Map platform to plugin name
 * Some platforms map to the same plugin, others have no plugin
 */
const PLATFORM_TO_PLUGIN = {
  'vsphere': 'vsphere',
  'aws': 'aws',
  'azure': 'azure',
  'gcp': 'gcp',
  'openstack': 'openstack',
  'ibmcloud': 'ibmcloud',
  'nutanix': 'nutanix',
  'kubevirt': 'kubevirt',
  'baremetal': 'baremetal',
  // These platforms don't have specific plugins
  'none': null
};

/**
 * Render plugins section - only shows the plugin matching the selected platform
 */
function renderPluginsSection(container, schema) {
  const resolvedPluginsSchema = safeResolveSchema(schema, getRootSchema());

  // --- Platform subsection ---
  renderPlatformSubsection(container, resolvedPluginsSchema);

  // --- Auth subsection ---
  renderPluginGroupSubsection(container, resolvedPluginsSchema, 'auth', 'Authentication');

  // --- Operators subsection ---
  renderPluginGroupSubsection(container, resolvedPluginsSchema, 'operators', 'Operators', '24px');
}

/**
 * Render platform plugin subsection
 */
function renderPlatformSubsection(container, pluginsSchema) {
  const platform = State.state.currentObject?.cluster?.platform;
  const pluginName = PLATFORM_TO_PLUGIN[platform];

  const subtitle = document.createElement('h3');
  subtitle.className = 'form-section__subtitle';
  subtitle.textContent = 'Platform';
  subtitle.style.marginTop = '8px';
  subtitle.style.marginBottom = '12px';
  subtitle.style.color = 'var(--pf-global--Color--100)';
  subtitle.style.fontSize = '1rem';
  subtitle.style.fontWeight = '600';
  container.appendChild(subtitle);

  if (!platform) {
    const notice = document.createElement('div');
    notice.className = 'empty-state';
    notice.innerHTML = `
      <div class="empty-state__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="48" height="48">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <div class="empty-state__title">No platform selected</div>
      <div class="empty-state__description">Select a platform in the <strong>Cluster</strong> section to configure platform-specific settings.</div>
    `;
    container.appendChild(notice);
    return;
  }

  if (pluginName === null) {
    const platformBadge = document.createElement('div');
    platformBadge.className = 'plugin-platform-badge';
    platformBadge.innerHTML = `
      <span class="plugin-platform-badge__label">Platform:</span>
      <span class="plugin-platform-badge__value">${Help.escapeHtml(platform)}</span>
    `;
    container.appendChild(platformBadge);
    const notice = document.createElement('div');
    notice.className = 'empty-state';
    notice.style.padding = '12px 0';
    notice.innerHTML = `<div class="empty-state__description">The <strong>${Help.escapeHtml(platform)}</strong> platform does not require additional plugin configuration.</div>`;
    container.appendChild(notice);
    return;
  }

  const rawPluginSchema = pluginsSchema?.properties?.[pluginName];
  const pluginSchema = rawPluginSchema ? safeResolveSchema(rawPluginSchema, getRootSchema()) : null;
  if (!pluginSchema) return;

  const platformBadge = document.createElement('a');
  platformBadge.className = 'plugin-platform-badge plugin-platform-badge--link';
  platformBadge.href = '#';
  platformBadge.dataset.navSection = 'cluster';
  platformBadge.title = 'Click to change platform in Cluster section';
  platformBadge.innerHTML = `
    <span class="plugin-platform-badge__label">Platform:</span>
    <span class="plugin-platform-badge__value">${Help.escapeHtml(platform)}</span>
    <svg class="plugin-platform-badge__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15,3 21,3 21,9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  `;
  platformBadge.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.ClusterfileEditor?.navigateToSection) {
      window.ClusterfileEditor.navigateToSection('cluster');
    }
  });
  container.appendChild(platformBadge);

  const pluginData = State.state.currentObject?.plugins?.[pluginName] || {};
  const path = `plugins.${pluginName}`;
  renderObjectFields(container, pluginSchema, path, pluginData);
}

function renderPluginGroupSubsection(container, pluginsSchema, groupName, titleText, topMargin = '24px') {
  const rawGroupSchema = pluginsSchema?.properties?.[groupName];
  if (!rawGroupSchema) return;
  const groupSchema = safeResolveSchema(rawGroupSchema, getRootSchema());
  if (!groupSchema?.properties) return;

  const subtitle = document.createElement('h3');
  subtitle.className = 'form-section__subtitle';
  subtitle.textContent = titleText;
  subtitle.style.marginTop = topMargin;
  subtitle.style.marginBottom = '12px';
  subtitle.style.color = 'var(--pf-global--Color--100)';
  subtitle.style.fontSize = '1rem';
  subtitle.style.fontWeight = '600';
  container.appendChild(subtitle);

  const groupData = State.state.currentObject?.plugins?.[groupName] || {};

  for (const [pluginName, rawPluginSchema] of Object.entries(groupSchema.properties)) {
    const pluginSchema = safeResolveSchema(rawPluginSchema, getRootSchema());
    if (!pluginSchema || pluginSchema.type !== 'object') continue;

    const isEnabled = pluginName in groupData;
    const pluginData = groupData[pluginName] || {};

    const fieldset = document.createElement('fieldset');
    fieldset.className = 'form-fieldset';
    if (!isEnabled) fieldset.classList.add('form-fieldset--collapsed');

    const legend = document.createElement('legend');
    legend.className = 'form-fieldset__legend';

    // Checkbox to enable/disable
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isEnabled;
    checkbox.style.marginRight = '8px';
    checkbox.style.cursor = 'pointer';
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        if (!State.state.currentObject.plugins) State.state.currentObject.plugins = {};
        if (!State.state.currentObject.plugins[groupName]) State.state.currentObject.plugins[groupName] = {};
        State.setNestedValue(State.state.currentObject, `plugins.${groupName}.${pluginName}`, {});
        fieldset.classList.remove('form-fieldset--collapsed');
      } else {
        State.deleteNestedValue(State.state.currentObject, `plugins.${groupName}.${pluginName}`);
        fieldset.classList.add('form-fieldset--collapsed');
      }
      triggerFormChange();
      setTimeout(() => {
        const container = document.getElementById('form-content');
        if (container) renderSection('plugins', container);
      }, 150);
    });

    legend.appendChild(checkbox);

    const toggleSpan = document.createElement('span');
    toggleSpan.className = 'form-fieldset__toggle';
    toggleSpan.textContent = '\u25BC';
    legend.appendChild(toggleSpan);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = ` ${pluginSchema.title || pluginName}`;
    legend.appendChild(labelSpan);

    if (Help.createHelpIcon && pluginSchema.description) {
      legend.appendChild(Help.createHelpIcon(pluginSchema, pluginName));
    }

    legend.addEventListener('click', (e) => {
      if (e.target === checkbox) return;
      fieldset.classList.toggle('form-fieldset--collapsed');
    });

    fieldset.appendChild(legend);

    const content = document.createElement('div');
    content.className = 'form-fieldset__content';
    if (isEnabled && pluginSchema.properties) {
      const filteredSchema = { ...pluginSchema, properties: { ...pluginSchema.properties } };
      delete filteredSchema.properties.enabled;
      renderObjectFields(content, filteredSchema, `plugins.${groupName}.${pluginName}`, pluginData);
    }
    fieldset.appendChild(content);
    container.appendChild(fieldset);
  }
}

/**
 * Render hosts section with pattern properties
 */
function renderHostsSection(container, schema) {
  const hostsData = State.state.currentObject?.hosts || {};
  const hostNames = Object.keys(hostsData);

  // Add host inline row
  const addRow = document.createElement('div');
  addRow.className = 'host-add-row';
  addRow.style.display = 'flex';
  addRow.style.gap = '8px';
  addRow.style.alignItems = 'center';
  addRow.style.marginBottom = '16px';

  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.className = 'form-input';
  addInput.placeholder = 'hostname.example.com';
  addInput.style.flex = '1';

  const addError = document.createElement('span');
  addError.className = 'field-error';
  addError.style.color = 'var(--pf-global--danger-color--100, #c9190b)';
  addError.style.fontSize = '0.85em';
  addError.style.display = 'none';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--primary btn--sm';
  addBtn.textContent = '+ Add Host';

  const doAddHost = () => {
    addError.style.display = 'none';
    const hostname = addInput.value.trim();
    if (!hostname) return;
    const fqdnPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
    if (!fqdnPattern.test(hostname)) {
      addError.textContent = 'Invalid FQDN';
      addError.style.display = 'inline';
      return;
    }
    if (State.state.currentObject.hosts?.[hostname]) {
      addError.textContent = 'Already exists';
      addError.style.display = 'inline';
      return;
    }
    if (!State.state.currentObject.hosts) State.state.currentObject.hosts = {};
    State.state.currentObject.hosts[hostname] = { role: 'worker', network: { interfaces: [], primary: {} } };
    State.recordChange(`hosts["${hostname}"]`, State.state.currentObject.hosts[hostname]);
    triggerFormChange();
    addInput.value = '';
    if (window.ClusterfileEditor?.refreshCurrentSection) window.ClusterfileEditor.refreshCurrentSection();
  };

  addBtn.addEventListener('click', doAddHost);
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAddHost(); });

  addRow.appendChild(addInput);
  addRow.appendChild(addBtn);
  addRow.appendChild(addError);
  container.appendChild(addRow);

  if (hostNames.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="48" height="48">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      </div>
      <div class="empty-state__title">No hosts configured</div>
      <div class="empty-state__description">Add hosts to configure your cluster nodes.</div>
    `;
    container.appendChild(empty);
    return;
  }

  const cards = document.createElement('div');
  cards.className = 'host-cards';

  // Get host schema from patternProperties
  const hostSchema = getHostSchema(schema);

  for (const hostname of hostNames) {
    const hostData = hostsData[hostname] || {};
    const card = renderHostCard(hostname, hostData, hostSchema);
    cards.appendChild(card);
  }

  container.appendChild(cards);
}

/**
 * Get host schema from patternProperties
 */
function getHostSchema(hostsSchema) {
  // Resolve $ref if hostsSchema itself is a reference
  const resolved = safeResolveSchema(hostsSchema, getRootSchema());

  if (resolved?.patternProperties && typeof resolved.patternProperties === 'object') {
    const patterns = Object.keys(resolved.patternProperties);
    if (patterns.length > 0) {
      const hostSchema = resolved.patternProperties[patterns[0]];
      // Validate and resolve the host schema
      if (hostSchema && typeof hostSchema === 'object') {
        return safeResolveSchema(hostSchema, getRootSchema());
      }
    }
  }
  return { type: 'object', properties: {} };
}

/**
 * Render a host card
 */
function renderHostCard(hostname, hostData, hostSchema) {
  const card = document.createElement('div');
  card.className = 'host-card';
  card.dataset.hostname = hostname;

  const role = hostData.role || 'worker';
  const roleClass = `host-card__role--${role}`;

  card.innerHTML = `
    <div class="host-card__header">
      <span class="host-card__toggle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6,9 12,15 18,9"/></svg>
      </span>
      <span class="host-card__hostname">${Help.escapeHtml(hostname)}</span>
      <span class="host-card__role ${roleClass}">${Help.escapeHtml(role)}</span>
      <div class="host-card__actions">
        <button class="btn btn--secondary btn--icon btn--sm" title="Duplicate" data-action="duplicate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="btn btn--secondary btn--icon btn--sm" title="Rename" data-action="rename">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn--danger btn--icon btn--sm" title="Remove" data-action="remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
    <div class="host-card__body"></div>
  `;

  // Toggle collapse
  const header = card.querySelector('.host-card__header');
  header.addEventListener('click', (e) => {
    if (e.target.closest('.host-card__actions')) return;
    card.classList.toggle('host-card--collapsed');
  });

  // Action buttons
  card.querySelector('[data-action="duplicate"]').addEventListener('click', (e) => {
    e.stopPropagation();
    duplicateHost(hostname);
  });

  card.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
    e.stopPropagation();
    renameHost(hostname);
  });

  card.querySelector('[data-action="remove"]').addEventListener('click', (e) => {
    e.stopPropagation();
    removeHost(hostname);
  });

  // Render host fields
  const body = card.querySelector('.host-card__body');
  const path = `hosts["${hostname}"]`;
  renderObjectFields(body, hostSchema, path, hostData);

  return card;
}

/**
 * Render object fields recursively
 */
function renderObjectFields(container, schema, basePath, data) {
  // Validate schema is an object with properties
  if (!schema || typeof schema !== 'object') return;

  // Resolve $ref if schema itself is a reference
  const resolvedSchema = safeResolveSchema(schema, getRootSchema());
  if (!resolvedSchema.properties || typeof resolvedSchema.properties !== 'object') return;

  // Collect fields into ordered groups (preserving encounter order)
  const groups = new Map();  // groupName -> { collapsed, fields[] }
  const ungrouped = [];

  for (const [key, rawFieldSchema] of Object.entries(resolvedSchema.properties)) {
    if (!shouldRenderField(rawFieldSchema, basePath, data)) continue;
    const path = basePath ? `${basePath}.${key}` : key;
    const value = data?.[key];
    const fieldSchema = safeResolveSchema(rawFieldSchema, getRootSchema());
    const groupName = rawFieldSchema?.['x-group'] || fieldSchema?.['x-group'];

    if (groupName) {
      if (!groups.has(groupName)) {
        const collapsed = !!(rawFieldSchema?.['x-group-collapsed'] || fieldSchema?.['x-group-collapsed']);
        groups.set(groupName, { collapsed, fields: [] });
      }
      groups.get(groupName).fields.push({ path, key, fieldSchema, value });
    } else {
      ungrouped.push({ path, key, fieldSchema, value });
    }
  }

  // If no groups, render flat (backwards compatible)
  if (groups.size === 0) {
    for (const { path, key, fieldSchema, value } of ungrouped) {
      const el = renderField(path, key, fieldSchema, value);
      if (el) container.appendChild(el);
    }
    return;
  }

  // Render grouped fields with collapsible headers
  for (const [groupName, { collapsed, fields }] of groups) {
    const section = document.createElement('div');
    section.className = 'form-group-section' + (collapsed ? ' form-group-section--collapsed' : '');

    const header = document.createElement('div');
    header.className = 'form-group-section__header';
    header.innerHTML = `<span class="form-group-section__toggle">\u25BC</span> ${Help.escapeHtml(groupName)}`;
    header.addEventListener('click', () => section.classList.toggle('form-group-section--collapsed'));
    section.appendChild(header);

    const content = document.createElement('div');
    content.className = 'form-group-section__content';
    for (const { path, key, fieldSchema, value } of fields) {
      const el = renderField(path, key, fieldSchema, value);
      if (el) content.appendChild(el);
    }
    section.appendChild(content);
    container.appendChild(section);
  }

  // Render any ungrouped fields after groups
  for (const { path, key, fieldSchema, value } of ungrouped) {
    const el = renderField(path, key, fieldSchema, value);
    if (el) container.appendChild(el);
  }
}

function shouldRenderField(schema, basePath, data) {
  const visibleWhen = schema?.['x-visible-when'];
  if (!visibleWhen) return true;

  const fieldPath = visibleWhen.field || '';
  const actual = fieldPath.includes('.')
    ? State.getNestedValue(State.state.currentObject, fieldPath)
    : data?.[fieldPath];

  if (Array.isArray(visibleWhen.in)) {
    return visibleWhen.in.includes(actual);
  }

  if (Object.prototype.hasOwnProperty.call(visibleWhen, 'equals')) {
    return actual === visibleWhen.equals;
  }

  return true;
}

/**
 * Render a single field based on schema type
 */
function renderField(path, key, schema, value) {
  // Resolve $ref first to get actual schema
  const resolvedSchema = safeResolveSchema(schema, getRootSchema());

  // Handle anyOf/oneOf (check both original and resolved)
  if (schema?.anyOf || schema?.oneOf || resolvedSchema?.anyOf || resolvedSchema?.oneOf) {
    return renderUnionField(path, key, schema, value);
  }

  const type = resolvedSchema.type;

  switch (type) {
    case 'string':
      return renderStringField(path, key, resolvedSchema, value);
    case 'integer':
    case 'number':
      return renderNumberField(path, key, resolvedSchema, value);
    case 'boolean':
      return renderBooleanField(path, key, resolvedSchema, value);
    case 'array':
      return renderArrayField(path, key, resolvedSchema, value);
    case 'object':
      return renderObjectField(path, key, resolvedSchema, value);
    default:
      return renderStringField(path, key, resolvedSchema, value);
  }
}

/**
 * Render a string input field
 */
function renderStringField(path, key, schema, value) {
  const group = createFormGroup(path, key, schema);

  // Use select for enum (safely check it's an array with values)
  const enumValues = getSchemaArray(schema, 'enum');
  if (enumValues.length > 0) {
    return renderEnumField(path, key, schema, value);
  }

  // Dynamic enum from data object keys (x-options-from-keys)
  if (schema['x-options-from-keys']) {
    const srcPath = schema['x-options-from-keys'];
    const parts = srcPath.split('.');
    let srcObj = State.state.currentObject;
    for (const p of parts) {
      srcObj = srcObj?.[p];
    }
    const dynamicKeys = (srcObj && typeof srcObj === 'object') ? Object.keys(srcObj) : [];
    if (dynamicKeys.length > 0) {
      const dynSchema = { ...schema, enum: dynamicKeys };
      return renderEnumField(path, key, dynSchema, value);
    }
  }

  // Handle x-is-file fields with special styling
  if (schema['x-is-file']) {
    const fileContainer = document.createElement('div');
    fileContainer.className = 'file-path-input';

    const fileIcon = document.createElement('span');
    fileIcon.className = 'file-path-icon';
    fileIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
    fileIcon.title = 'File path reference \u2014 the editor never reads this from your machine; the renderer resolves it at render time.';
    fileContainer.appendChild(fileIcon);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-input form-input--file-path';
    input.id = `field-${path.replace(/[.\[\]"]/g, '-')}`;
    input.value = value || '';
    input.placeholder = 'secrets/pull-secret.json';
    input.addEventListener('input', () => {
      updateFieldValue(path, input.value, schema);
      refreshBadge();
    });
    fileContainer.appendChild(input);

    // In-memory upload \u2014 FileReader stashes the file in State.uploadedFiles
    // keyed by the path string. NEVER persisted; cleared on reload.
    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'btn btn--secondary btn--sm file-path-upload';
    uploadBtn.textContent = 'Upload';
    uploadBtn.title = 'Read a file from your machine into in-memory storage. Renders use this content instead of /content for the path above. Cleared when the page reloads \u2014 never written to localStorage / sessionStorage / IndexedDB.';

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'file';
    hiddenInput.style.display = 'none';

    const badge = document.createElement('span');
    badge.className = 'file-path-badge';
    badge.style.display = 'none';
    badge.title = 'Click to clear this in-memory upload.';

    function refreshBadge() {
      const key = (input.value || '').trim();
      const map = State.state?.uploadedFiles || {};
      if (key && Object.prototype.hasOwnProperty.call(map, key)) {
        const len = (map[key] || '').length;
        badge.textContent = `\u2713 in-memory \u00b7 ${len.toLocaleString()} chars`;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }

    uploadBtn.addEventListener('click', () => {
      const key = (input.value || '').trim();
      if (!key) {
        alert('Set the path above first \u2014 that becomes the lookup key for this upload.');
        return;
      }
      hiddenInput.click();
    });

    hiddenInput.addEventListener('change', () => {
      const file = hiddenInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (!State.state.uploadedFiles) State.state.uploadedFiles = {};
        const key = (input.value || '').trim();
        State.state.uploadedFiles[key] = String(reader.result || '');
        refreshBadge();
        notifyUploadedFilesChanged();
        if (onFormChange) onFormChange();
      };
      reader.readAsText(file);
      hiddenInput.value = '';
    });

    badge.addEventListener('click', () => {
      const key = (input.value || '').trim();
      if (State.state?.uploadedFiles && key in State.state.uploadedFiles) {
        delete State.state.uploadedFiles[key];
        refreshBadge();
        notifyUploadedFilesChanged();
        if (onFormChange) onFormChange();
      }
    });

    fileContainer.appendChild(uploadBtn);
    fileContainer.appendChild(hiddenInput);
    fileContainer.appendChild(badge);

    const infoIcon = document.createElement('span');
    infoIcon.className = 'file-path-info';
    infoIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    infoIcon.title = 'Resolution at render time: in-memory upload (this session) \u2192 mounted /content \u2192 <file:path> placeholder.';
    infoIcon.style.cursor = 'help';
    fileContainer.appendChild(infoIcon);

    group.appendChild(fileContainer);
    addFieldDescription(group, schema);
    refreshBadge();
    return group;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-input';
  input.id = `field-${path.replace(/[.\[\]"]/g, '-')}`;
  input.value = value || '';
  input.placeholder = schema.default !== undefined ? String(schema.default) : '';

  input.addEventListener('input', () => {
    updateFieldValue(path, input.value, schema);
  });

  group.appendChild(input);
  addFieldDescription(group, schema);
  return group;
}

/**
 * Render an enum select field with optional "Other" input
 */
function renderEnumField(path, key, schema, value, allowCustom = true) {
  const group = createFormGroup(path, key, schema);

  // Safely get enum values
  const enumValues = getSchemaArray(schema, 'enum');

  // Check if current value is a custom value (not in enum)
  const isCustomValue = value && !enumValues.includes(value);

  // Container for select + optional input
  const container = document.createElement('div');
  container.className = 'enum-field-container';
  container.style.display = 'flex';
  container.style.gap = '8px';
  container.style.alignItems = 'center';

  const select = document.createElement('select');
  select.className = 'form-select';
  select.id = `field-${path.replace(/[.\[\]"]/g, '-')}`;
  select.style.flex = allowCustom ? '0 0 auto' : '1';

  // Add empty option
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '-- Select --';
  select.appendChild(emptyOpt);

  for (const opt of enumValues) {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt;
    if (opt === value) {
      option.selected = true;
    }
    select.appendChild(option);
  }

  // Add "Other" option if custom values allowed
  if (allowCustom) {
    const otherOpt = document.createElement('option');
    otherOpt.value = '__other__';
    otherOpt.textContent = 'Other...';
    if (isCustomValue) {
      otherOpt.selected = true;
    }
    select.appendChild(otherOpt);
  }

  container.appendChild(select);

  // Custom input field (shown when "Other" is selected)
  const customInput = document.createElement('input');
  customInput.type = 'text';
  customInput.className = 'form-input';
  customInput.placeholder = 'Enter custom value';
  customInput.style.flex = '1';
  customInput.style.display = isCustomValue ? 'block' : 'none';
  customInput.value = isCustomValue ? value : '';

  if (allowCustom) {
    container.appendChild(customInput);
  }

  // Add "Configure plugin" link for cluster.platform field
  let pluginLink = null;
  if (path === 'cluster.platform') {
    pluginLink = document.createElement('a');
    pluginLink.className = 'field-nav-link';
    pluginLink.href = '#';
    pluginLink.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <path d="M12 2v6m0 8v6M4.93 4.93l4.24 4.24m5.66 5.66l4.24 4.24M2 12h6m8 0h6M4.93 19.07l4.24-4.24m5.66-5.66l4.24-4.24"/>
      </svg>
      Configure plugin
    `;
    pluginLink.title = 'Configure platform-specific plugin settings';
    pluginLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.ClusterfileEditor?.navigateToSection) {
        window.ClusterfileEditor.navigateToSection('plugins');
      }
    });
    // Show/hide based on whether platform has a plugin
    const updatePluginLinkVisibility = () => {
      const currentPlatform = select.value;
      const hasPlugin = PLATFORM_TO_PLUGIN[currentPlatform] !== null && PLATFORM_TO_PLUGIN[currentPlatform] !== undefined;
      pluginLink.style.display = hasPlugin ? 'inline-flex' : 'none';
    };
    updatePluginLinkVisibility();
    container.appendChild(pluginLink);
  }

  select.addEventListener('change', () => {
    if (select.value === '__other__') {
      customInput.style.display = 'block';
      customInput.focus();
      // Clear the value until user types something
      if (!customInput.value) {
        updateFieldValue(path, '', schema);
      }
    } else {
      customInput.style.display = 'none';
      customInput.value = '';
      updateFieldValue(path, select.value, schema);
    }
    // Update plugin link visibility if present
    if (pluginLink && path === 'cluster.platform') {
      const currentPlatform = select.value;
      const hasPlugin = PLATFORM_TO_PLUGIN[currentPlatform] !== null && PLATFORM_TO_PLUGIN[currentPlatform] !== undefined;
      pluginLink.style.display = hasPlugin ? 'inline-flex' : 'none';
    }
  });

  customInput.addEventListener('input', () => {
    updateFieldValue(path, customInput.value, schema);
  });

  group.appendChild(container);
  addFieldDescription(group, schema);
  return group;
}

/**
 * Render a number input field
 */
function renderNumberField(path, key, schema, value) {
  const group = createFormGroup(path, key, schema);
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'form-input form-input--number';
  input.id = `field-${path.replace(/[.\[\]"]/g, '-')}`;
  input.value = value !== undefined ? value : '';

  if (schema.minimum !== undefined) {
    input.min = schema.minimum;
  }
  if (schema.maximum !== undefined) {
    input.max = schema.maximum;
  }
  if (schema.type === 'integer') {
    input.step = '1';
  }

  input.addEventListener('input', () => {
    const numVal = schema.type === 'integer' ? parseInt(input.value, 10) : parseFloat(input.value);
    updateFieldValue(path, isNaN(numVal) ? undefined : numVal, schema);
  });

  group.appendChild(input);
  addFieldDescription(group, schema);
  return group;
}

/**
 * Render a boolean select field
 */
function renderBooleanField(path, key, schema, value) {
  const group = createFormGroup(path, key, schema);
  const select = document.createElement('select');
  select.className = 'form-select';
  select.id = `field-${path.replace(/[.\[\]"]/g, '-')}`;

  const options = [
    { value: '', label: '-- Select --' },
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' }
  ];

  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if ((value === true && opt.value === 'true') || (value === false && opt.value === 'false')) {
      option.selected = true;
    }
    select.appendChild(option);
  }

  select.addEventListener('change', () => {
    const boolVal = select.value === 'true' ? true : select.value === 'false' ? false : undefined;
    updateFieldValue(path, boolVal, schema);
  });

  group.appendChild(select);
  addFieldDescription(group, schema);
  return group;
}

/**
 * Render an array field
 */
function renderArrayField(path, key, schema, value) {
  const group = document.createElement('div');
  group.className = 'form-group';
  group.dataset.path = path;
  if (State.hasChanged(path)) {
    group.classList.add('form-group--changed');
  }

  const arrayContainer = document.createElement('div');
  arrayContainer.className = 'array-field';

  const header = document.createElement('div');
  header.className = 'array-field__header';

  // Check if items are file paths
  const isFileArray = schema['x-is-file'] || schema.items?.['x-is-file'];
  const titleIcon = isFileArray ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" style="vertical-align: middle; margin-right: 4px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' : '';

  header.innerHTML = `
    <span class="array-field__title">${titleIcon}${Help.escapeHtml(schema.title || key)}</span>
  `;

  if (Help.createHelpIcon && schema.description) {
    const helpIcon = Help.createHelpIcon(schema, key);
    header.querySelector('.array-field__title').appendChild(helpIcon);
  }

  arrayContainer.appendChild(header);

  const items = document.createElement('div');
  items.className = 'array-field__items';

  const arrValue = Array.isArray(value) ? value : [];
  // Resolve $ref on items schema
  const rawItemSchema = schema.items || { type: 'string' };
  const itemSchema = safeResolveSchema(rawItemSchema, getRootSchema());

  // Re-render all array items from current state (eliminates stale closures)
  function refreshItems() {
    items.innerHTML = '';
    const currentArr = State.getNestedValue(State.state.currentObject, path) || [];
    currentArr.forEach((val, i) => {
      const itemPath = `${path}[${i}]`;
      const itemEl = renderArrayItem(itemPath, i, itemSchema, val, items);
      items.appendChild(itemEl);
    });
  }
  items._refreshArray = refreshItems;

  refreshItems();

  arrayContainer.appendChild(items);

  // Add button
  const addContainer = document.createElement('div');
  addContainer.className = 'array-field__add';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--secondary btn--sm';
  addBtn.textContent = '+ Add';
  addBtn.addEventListener('click', () => {
    const defaultVal = itemSchema.type === 'object' ? {} : '';

    // Update data — ensure array exists in state then push
    if (!Array.isArray(State.getNestedValue(State.state.currentObject, path))) {
      State.setNestedValue(State.state.currentObject, path, []);
    }
    const arr = State.getNestedValue(State.state.currentObject, path);
    arr.push(defaultVal);

    State.recordChange(path, arr);
    triggerFormChange();

    // Re-render all items with fresh closures
    refreshItems();
  });

  addContainer.appendChild(addBtn);
  arrayContainer.appendChild(addContainer);

  group.appendChild(arrayContainer);
  return group;
}

/**
 * Render a single array item
 */
function renderArrayItem(path, idx, schema, value, container) {
  if (schema.type === 'object') {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'form-fieldset';
    fieldset.dataset.path = path;

    const legend = document.createElement('legend');
    legend.className = 'form-fieldset__legend';
    legend.innerHTML = `<span class="form-fieldset__toggle">▼</span> Item ${idx + 1}`;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn--link btn--sm';
    removeBtn.textContent = '× Remove';
    removeBtn.style.marginLeft = 'auto';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeArrayItem(path, container, fieldset);
    });
    legend.appendChild(removeBtn);

    legend.addEventListener('click', (e) => {
      if (e.target === removeBtn) return;
      fieldset.classList.toggle('form-fieldset--collapsed');
    });

    fieldset.appendChild(legend);

    const content = document.createElement('div');
    content.className = 'form-fieldset__content';
    renderObjectFields(content, schema, path, value || {});
    fieldset.appendChild(content);

    return fieldset;
  }

  // Simple value item
  const item = document.createElement('div');
  item.className = 'array-field__item';
  item.dataset.path = path;

  // Check if this is a file path item
  const isFilePath = schema['x-is-file'];

  if (isFilePath) {
    const fileIcon = document.createElement('span');
    fileIcon.className = 'file-path-icon';
    fileIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
    fileIcon.title = 'File path reference \u2014 content stays local, read only at render time';
    fileIcon.style.marginRight = '8px';
    item.appendChild(fileIcon);
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = isFilePath ? 'form-input form-input--file-path array-field__item-input' : 'form-input array-field__item-input';
  input.value = value || '';
  if (isFilePath) {
    input.placeholder = '/path/to/file';
  }

  input.addEventListener('input', () => {
    updateFieldValue(path, input.value, schema);
  });

  item.appendChild(input);

  const removeBtn = document.createElement('span');
  removeBtn.className = 'array-field__item-remove';
  removeBtn.innerHTML = '×';
  removeBtn.title = 'Remove';
  removeBtn.addEventListener('click', () => {
    removeArrayItem(path, container, item);
  });

  item.appendChild(removeBtn);

  return item;
}

/**
 * Remove an array item
 */
function removeArrayItem(path, container, element) {
  const parts = State.parsePath(path);
  const idx = parts.pop();
  const arrayPath = State.buildPath(parts);

  const arr = State.getNestedValue(State.state.currentObject, arrayPath);
  if (Array.isArray(arr) && typeof idx === 'number') {
    arr.splice(idx, 1);
    State.recordChange(arrayPath, arr);
    triggerFormChange();
  }

  // Re-render all items with fresh closures and correct indices
  if (container._refreshArray) {
    container._refreshArray();
  } else {
    element.remove();
  }
}

/**
 * Render a nested object field
 */
function renderObjectField(path, key, schema, value) {
  // Tier-map: render as uniform key-value list with enum key selector
  if (schema['x-render'] === 'tier-map') {
    return renderTierMapField(path, key, schema, value);
  }

  // Free-form key-value map (additionalProperties: {type: string}, no fixed properties)
  if (schema.additionalProperties && !schema.properties) {
    return renderKVMapField(path, key, schema, value);
  }

  const fieldset = document.createElement('fieldset');
  fieldset.className = 'form-fieldset';
  if (State.hasChanged(path)) {
    fieldset.classList.add('form-group--changed');
  }

  const legend = document.createElement('legend');
  legend.className = 'form-fieldset__legend';
  legend.innerHTML = `<span class="form-fieldset__toggle">▼</span> ${Help.escapeHtml(schema.title || key)}`;

  if (Help.createHelpIcon && schema.description) {
    const helpIcon = Help.createHelpIcon(schema, key);
    legend.appendChild(helpIcon);
  }

  legend.addEventListener('click', () => {
    fieldset.classList.toggle('form-fieldset--collapsed');
  });

  fieldset.appendChild(legend);

  const content = document.createElement('div');
  content.className = 'form-fieldset__content';
  renderObjectFields(content, schema, path, value || {});
  fieldset.appendChild(content);

  return fieldset;
}

/**
 * Render a tier-map object as a uniform key-value list.
 * Each entry: [tier name select] = [StorageClassName input] [× remove]
 * Plus an add row at the bottom.
 */
function renderTierMapField(path, key, schema, value) {
  const data = value || {};
  const tierOptions = schema['x-tier-options'] || Object.keys(schema.properties || {});
  const allKeys = Object.keys(data);

  const fieldset = document.createElement('fieldset');
  fieldset.className = 'form-fieldset';

  const legend = document.createElement('legend');
  legend.className = 'form-fieldset__legend';
  legend.innerHTML = `<span class="form-fieldset__toggle">▼</span> ${Help.escapeHtml(schema.title || key)}`;
  if (Help.createHelpIcon && schema.description) {
    legend.appendChild(Help.createHelpIcon(schema, key));
  }
  legend.addEventListener('click', () => fieldset.classList.toggle('form-fieldset--collapsed'));
  fieldset.appendChild(legend);

  const content = document.createElement('div');
  content.className = 'form-fieldset__content';

  // Render each existing entry as a row
  allKeys.forEach(tierKey => {
    const row = renderTierMapRow(path, tierKey, data[tierKey], tierOptions, allKeys);
    content.appendChild(row);
  });

  // Add row: [tier select + Other] [value input] [+ button]
  const usedKeys = new Set(allKeys);
  const addRow = document.createElement('div');
  addRow.className = 'form-group tier-map-add';
  addRow.style.display = 'flex';
  addRow.style.gap = '8px';
  addRow.style.alignItems = 'center';
  addRow.style.marginTop = '8px';

  const addSelect = document.createElement('select');
  addSelect.className = 'form-select';
  addSelect.style.flex = '1';
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '+ Add tier...';
  addSelect.appendChild(emptyOpt);
  tierOptions.filter(t => !usedKeys.has(t)).forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    addSelect.appendChild(opt);
  });
  const otherOpt = document.createElement('option');
  otherOpt.value = '__other__';
  otherOpt.textContent = 'Other...';
  addSelect.appendChild(otherOpt);

  const addKeyInput = document.createElement('input');
  addKeyInput.type = 'text';
  addKeyInput.className = 'form-input';
  addKeyInput.placeholder = 'Custom tier name';
  addKeyInput.style.flex = '1';
  addKeyInput.style.display = 'none';

  const addValInput = document.createElement('input');
  addValInput.type = 'text';
  addValInput.className = 'form-input';
  addValInput.placeholder = 'StorageClassName';
  addValInput.style.flex = '2';
  addValInput.style.display = 'none';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--secondary btn--sm';
  addBtn.textContent = '+';
  addBtn.title = 'Add tier';
  addBtn.style.display = 'none';

  addSelect.addEventListener('change', () => {
    if (addSelect.value === '__other__') {
      addKeyInput.style.display = 'block';
      addValInput.style.display = 'block';
      addBtn.style.display = 'block';
      addKeyInput.focus();
    } else if (addSelect.value) {
      addKeyInput.style.display = 'none';
      addValInput.style.display = 'block';
      addBtn.style.display = 'block';
      addValInput.focus();
    } else {
      addKeyInput.style.display = 'none';
      addValInput.style.display = 'none';
      addBtn.style.display = 'none';
    }
  });

  const doAdd = () => {
    const tierName = addSelect.value === '__other__' ? addKeyInput.value.trim() : addSelect.value;
    if (!tierName) return;
    if (usedKeys.has(tierName)) return;
    const val = addValInput.value.trim();
    const entryPath = `${path}.${tierName}`;
    State.setNestedValue(State.state.currentObject, entryPath, val);
    State.recordChange(entryPath, val);
    triggerFormChange();
    if (window.ClusterfileEditor?.refreshCurrentSection) {
      window.ClusterfileEditor.refreshCurrentSection();
    }
  };

  addBtn.addEventListener('click', doAdd);
  addValInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });

  addRow.appendChild(addSelect);
  addRow.appendChild(addKeyInput);
  addRow.appendChild(addValInput);
  addRow.appendChild(addBtn);
  content.appendChild(addRow);

  fieldset.appendChild(content);
  return fieldset;
}

/**
 * Render a single tier-map entry row: [tier label] [value input] [× remove]
 */
function renderTierMapRow(basePath, tierKey, tierValue, tierOptions, allKeys) {
  const path = `${basePath}.${tierKey}`;
  const row = document.createElement('div');
  row.className = 'form-group tier-map-row';
  row.dataset.path = path;
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.style.alignItems = 'center';
  row.style.marginBottom = '6px';

  const label = document.createElement('label');
  label.className = 'form-label';
  label.textContent = tierKey;
  label.style.minWidth = '110px';
  label.style.marginBottom = '0';
  label.style.fontFamily = 'var(--pf-global--FontFamily--monospace, monospace)';
  label.style.fontWeight = '600';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-input';
  input.value = tierValue != null ? String(tierValue) : '';
  input.placeholder = 'StorageClassName';
  input.style.flex = '1';
  input.addEventListener('change', () => {
    State.setNestedValue(State.state.currentObject, path, input.value);
    State.recordChange(path, input.value);
    triggerFormChange();
  });

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn--link btn--sm';
  removeBtn.textContent = '\u00d7';
  removeBtn.title = `Remove ${tierKey}`;
  removeBtn.style.color = 'var(--pf-global--danger-color--100, #c9190b)';
  removeBtn.addEventListener('click', () => {
    State.deleteNestedValue(State.state.currentObject, path);
    State.recordChange(path, undefined);
    triggerFormChange();
    if (window.ClusterfileEditor?.refreshCurrentSection) {
      window.ClusterfileEditor.refreshCurrentSection();
    }
  });

  row.appendChild(label);
  row.appendChild(input);
  row.appendChild(removeBtn);
  return row;
}

/**
 * Render a free-form key-value map (additionalProperties: {type: string}).
 * Used for nodeLabels and similar open-ended string maps.
 */
function renderKVMapField(path, key, schema, value) {
  const data = value || {};

  const fieldset = document.createElement('fieldset');
  fieldset.className = 'form-fieldset';
  if (State.hasChanged(path)) fieldset.classList.add('form-group--changed');

  const legend = document.createElement('legend');
  legend.className = 'form-fieldset__legend';
  legend.innerHTML = `<span class="form-fieldset__toggle">▼</span> ${Help.escapeHtml(schema.title || key)}`;
  if (Help.createHelpIcon && schema.description) legend.appendChild(Help.createHelpIcon(schema, key));
  legend.addEventListener('click', () => fieldset.classList.toggle('form-fieldset--collapsed'));
  fieldset.appendChild(legend);

  const content = document.createElement('div');
  content.className = 'form-fieldset__content';

  function commitEntry(k, v) {
    if (!k) return;
    const current = State.get(path) || {};
    State.set(path, { ...current, [k]: v });
  }

  function removeEntry(k) {
    const current = { ...(State.get(path) || {}) };
    delete current[k];
    State.set(path, Object.keys(current).length ? current : undefined);
  }

  function addRow(k, v) {
    const row = document.createElement('div');
    row.className = 'form-group tier-map-add';
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:4px;';

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'form-input';
    keyInput.placeholder = 'key';
    keyInput.value = k;
    keyInput.style.flex = '1';

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'form-input';
    valInput.placeholder = 'value';
    valInput.value = v;
    valInput.style.flex = '2';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn--sm';
    removeBtn.style.cssText = 'color:var(--pf-global--danger-color--100);padding:0 6px;';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', () => {
      removeEntry(keyInput.dataset.originalKey || keyInput.value);
      row.remove();
    });

    const origKey = k;
    keyInput.dataset.originalKey = origKey;

    function save() {
      const newKey = keyInput.value.trim();
      const oldKey = keyInput.dataset.originalKey;
      if (oldKey && oldKey !== newKey) {
        removeEntry(oldKey);
        keyInput.dataset.originalKey = newKey;
      }
      if (newKey) commitEntry(newKey, valInput.value);
    }

    keyInput.addEventListener('blur', save);
    valInput.addEventListener('blur', save);

    row.appendChild(keyInput);
    row.appendChild(valInput);
    row.appendChild(removeBtn);
    return row;
  }

  Object.entries(data).forEach(([k, v]) => content.appendChild(addRow(k, String(v))));

  // Add-new row
  const addArea = document.createElement('div');
  addArea.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px;';

  const newKey = document.createElement('input');
  newKey.type = 'text';
  newKey.className = 'form-input';
  newKey.placeholder = 'key';
  newKey.style.flex = '1';

  const newVal = document.createElement('input');
  newVal.type = 'text';
  newVal.className = 'form-input';
  newVal.placeholder = 'value';
  newVal.style.flex = '2';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--secondary btn--sm';
  addBtn.textContent = '+';
  addBtn.title = 'Add entry';
  addBtn.addEventListener('click', () => {
    const k = newKey.value.trim();
    const v = newVal.value;
    if (!k) return;
    commitEntry(k, v);
    content.insertBefore(addRow(k, v), addArea);
    newKey.value = '';
    newVal.value = '';
    newKey.focus();
  });

  addArea.appendChild(newKey);
  addArea.appendChild(newVal);
  addArea.appendChild(addBtn);
  content.appendChild(addArea);
  fieldset.appendChild(content);
  return fieldset;
}

/**
 * Render a union type field (anyOf/oneOf)
 */
function renderUnionField(path, key, schema, value) {
  const rawOptions = schema.anyOf || schema.oneOf || [];
  const rootSchema = State.state?.schema;

  // Resolve $refs for each option before checking types
  const options = rawOptions.map(o => resolveRef(o, rootSchema) || o);

  // Check for enum + custom string pattern (use safe array check)
  const enumOption = options.find(o => Array.isArray(o?.enum) && o.enum.length > 0);
  const stringOption = options.find(o => o?.type === 'string' && !Array.isArray(o?.enum));
  const objectOption = options.find(o => o?.type === 'object');
  const boolFalseOption = rawOptions.find(o => o?.const === false); // Check raw for const
  const intOrNumOption = options.find(o => o?.type === 'integer' || o?.type === 'number');

  // Pattern: oneOf [enum/int, {const: false}] - Mode selector
  if (boolFalseOption && (enumOption || intOrNumOption)) {
    return renderModeField(path, key, schema, value, options);
  }

  // Pattern: anyOf [object, string] - Compact mode selector (like storage.os)
  if (objectOption && stringOption && !enumOption) {
    return renderObjectOrStringField(path, key, schema, value, objectOption, stringOption);
  }

  // Pattern: anyOf [enum, string] - Select with "Other" option for custom input
  if (enumOption && stringOption) {
    const mergedSchema = {
      ...enumOption,
      title: schema.title || key,
      description: schema.description || enumOption.description,
      'x-is-file': schema['x-is-file'] || stringOption['x-is-file']
    };
    // Always show enum with Other option - the renderEnumField handles custom values
    return renderEnumField(path, key, mergedSchema, value, true);
  }

  // Pattern: anyOf with only string options (e.g., different formats)
  if (stringOption && !enumOption && !objectOption) {
    const mergedSchema = {
      ...stringOption,
      title: schema.title || key,
      description: schema.description || stringOption.description,
      'x-is-file': schema['x-is-file'] || stringOption['x-is-file']
    };
    return renderStringField(path, key, mergedSchema, value);
  }

  // Default: render based on first option
  if (options.length > 0) {
    const firstOption = options[0];
    return renderField(path, key, { ...firstOption, title: schema.title, description: schema.description }, value);
  }

  return renderStringField(path, key, schema, value);
}

/**
 * Render a field that can be either an object or a string (compact mode)
 */
function renderObjectOrStringField(path, key, schema, value, objectSchema, stringSchema) {
  const group = createFormGroup(path, key, schema);

  // Get current value from state (always fresh)
  const getCurrentValue = () => State.getNestedValue(State.state.currentObject, path);

  // Determine current mode based on actual value type
  const getMode = (val) => {
    if (val !== null && typeof val === 'object') return 'advanced';
    return 'simple';
  };

  const container = document.createElement('div');
  container.className = 'object-or-string-field';

  // Mode selector
  const modeContainer = document.createElement('div');
  modeContainer.className = 'object-or-string-field__mode';
  modeContainer.style.display = 'flex';
  modeContainer.style.gap = '8px';
  modeContainer.style.marginBottom = '8px';

  const modeSelect = document.createElement('select');
  modeSelect.className = 'form-select';
  modeSelect.style.width = 'auto';

  const simpleOpt = document.createElement('option');
  simpleOpt.value = 'simple';
  simpleOpt.textContent = 'Simple (string)';
  modeSelect.appendChild(simpleOpt);

  const advancedOpt = document.createElement('option');
  advancedOpt.value = 'advanced';
  advancedOpt.textContent = 'Advanced (options)';
  modeSelect.appendChild(advancedOpt);

  modeSelect.value = getMode(value);
  modeContainer.appendChild(modeSelect);

  container.appendChild(modeContainer);

  // Content container
  const contentContainer = document.createElement('div');
  contentContainer.className = 'object-or-string-field__content';
  container.appendChild(contentContainer);

  // Render function - always reads fresh value from state
  const renderContent = (mode) => {
    contentContainer.innerHTML = '';
    const currentValue = getCurrentValue();

    if (mode === 'simple') {
      // Simple string input
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-input';
      input.placeholder = stringSchema.description || 'e.g., /dev/sda or wwn-...';
      input.value = typeof currentValue === 'string' ? currentValue : '';

      input.addEventListener('input', () => {
        updateFieldValue(path, input.value || undefined, stringSchema);
      });

      contentContainer.appendChild(input);
    } else {
      // Advanced object with compact grid layout
      const grid = document.createElement('div');
      grid.className = 'compact-object-grid';
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
      grid.style.gap = '8px';

      const objValue = (currentValue !== null && typeof currentValue === 'object') ? currentValue : {};
      const properties = objectSchema.properties || {};
      const rootSchema = State.state?.schema;

      for (const [propKey, rawPropSchema] of Object.entries(properties)) {
        // Resolve $ref if present
        const propSchema = resolveRef(rawPropSchema, rootSchema) || rawPropSchema || {};
        const propType = propSchema.type || 'string';
        const propValue = objValue[propKey];

        const fieldWrapper = document.createElement('div');
        fieldWrapper.className = 'compact-field';

        const label = document.createElement('label');
        label.className = 'compact-field__label';
        label.textContent = propSchema.title || rawPropSchema.title || propKey;
        label.style.fontSize = '0.75rem';
        label.style.color = 'var(--pf-global--Color--200)';
        label.style.display = 'block';
        label.style.marginBottom = '2px';
        fieldWrapper.appendChild(label);

        let input;
        if (propType === 'boolean') {
          input = document.createElement('select');
          input.className = 'form-select form-select--compact';
          input.innerHTML = `
            <option value="">--</option>
            <option value="true" ${propValue === true ? 'selected' : ''}>Yes</option>
            <option value="false" ${propValue === false ? 'selected' : ''}>No</option>
          `;
          input.addEventListener('change', () => {
            const boolVal = input.value === 'true' ? true : input.value === 'false' ? false : undefined;
            updateCompactObjectField(path, propKey, boolVal, objectSchema);
          });
        } else if (propType === 'number' || propType === 'integer') {
          input = document.createElement('input');
          input.type = 'number';
          input.className = 'form-input form-input--compact';
          input.value = propValue !== undefined ? propValue : '';
          if (propSchema.minimum !== undefined) input.min = propSchema.minimum;
          if (propSchema.maximum !== undefined) input.max = propSchema.maximum;
          input.addEventListener('input', () => {
            const numVal = propType === 'integer' ? parseInt(input.value, 10) : parseFloat(input.value);
            updateCompactObjectField(path, propKey, isNaN(numVal) ? undefined : numVal, objectSchema);
          });
        } else if (propType === 'array') {
          input = document.createElement('input');
          input.type = 'text';
          input.className = 'form-input form-input--compact';
          input.placeholder = 'comma-separated';
          input.value = Array.isArray(propValue) ? propValue.join(', ') : '';
          input.addEventListener('input', () => {
            const arrVal = input.value ? input.value.split(',').map(s => s.trim()).filter(s => s) : undefined;
            updateCompactObjectField(path, propKey, arrVal, objectSchema);
          });
        } else {
          input = document.createElement('input');
          input.type = 'text';
          input.className = 'form-input form-input--compact';
          input.value = propValue || '';
          input.placeholder = propSchema.description ? propSchema.description.substring(0, 30) + '...' : '';
          input.addEventListener('input', () => {
            updateCompactObjectField(path, propKey, input.value || undefined, objectSchema);
          });
        }

        input.style.padding = '4px 8px';
        input.style.fontSize = '0.85rem';
        fieldWrapper.appendChild(input);
        grid.appendChild(fieldWrapper);
      }

      contentContainer.appendChild(grid);
    }
  };

  // Initial render
  renderContent(modeSelect.value);

  // Mode change handler - clears value when switching modes to prevent data corruption
  modeSelect.addEventListener('change', () => {
    const newMode = modeSelect.value;
    const currentValue = getCurrentValue();
    const currentMode = getMode(currentValue);

    // Only clear/convert if actually changing modes
    if (newMode !== currentMode) {
      if (newMode === 'simple') {
        // Switching to simple: extract best identifier or clear
        let simpleValue = '';
        if (currentValue && typeof currentValue === 'object') {
          // Priority: wwn > byId > deviceName (preserve the most specific identifier)
          simpleValue = currentValue.wwn || currentValue.byId || currentValue.deviceName || '';
        }
        updateFieldValue(path, simpleValue || undefined, stringSchema);
      } else {
        // Switching to advanced: start with empty object (don't guess field names)
        updateFieldValue(path, {}, objectSchema);
      }
    }
    renderContent(newMode);
  });

  group.appendChild(container);
  addFieldDescription(group, schema);
  return group;
}

/**
 * Update a property within a compact object field
 */
function updateCompactObjectField(basePath, propKey, value, schema) {
  let currentObj = State.getNestedValue(State.state.currentObject, basePath);
  if (!currentObj || typeof currentObj !== 'object') {
    currentObj = {};
  }

  if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    delete currentObj[propKey];
  } else {
    currentObj[propKey] = value;
  }

  // Clean empty object
  const hasValues = Object.keys(currentObj).length > 0;
  State.setNestedValue(State.state.currentObject, basePath, hasValues ? currentObj : undefined);
  State.recordChange(basePath, hasValues ? currentObj : undefined);
  triggerFormChange();
}

/**
 * Render a mode selector field (enabled/disabled pattern)
 * Supports: enum only, integer only, or enum+integer (presets + custom)
 */
function renderModeField(path, key, schema, value, options) {
  const group = createFormGroup(path, key, schema);

  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.gap = '8px';
  container.style.alignItems = 'center';

  // Resolve $refs in options first
  const resolvedOptions = options.map(o => safeResolveSchema(o, getRootSchema()));
  const enumOption = resolvedOptions.find(o => Array.isArray(o?.enum) && o.enum.length > 0);
  // Find integer option WITHOUT enum (for custom input)
  const customIntOption = resolvedOptions.find(o =>
    (o?.type === 'integer' || o?.type === 'number') && !Array.isArray(o?.enum)
  );
  const enumValues = getSchemaArray(enumOption, 'enum');
  const hasPresets = enumValues.length > 0;
  const hasCustom = !!customIntOption;

  // Mode/value dropdown
  const modeSelect = document.createElement('select');
  modeSelect.className = 'form-select';
  modeSelect.style.width = 'auto';

  // Add preset enum values with descriptive labels
  if (hasPresets) {
    for (const val of enumValues) {
      const opt = document.createElement('option');
      opt.value = `preset:${val}`;
      // Nice labels for known MTU values
      if (val === 1500) opt.textContent = 'Default (1500)';
      else if (val === 9000) opt.textContent = 'Jumbo (9000)';
      else opt.textContent = String(val);
      modeSelect.appendChild(opt);
    }
  }

  // Add Custom option if integer type available
  if (hasCustom) {
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = 'Custom';
    modeSelect.appendChild(customOpt);
  }

  // Add Disabled option
  const disabledOpt = document.createElement('option');
  disabledOpt.value = 'disabled';
  disabledOpt.textContent = 'Disabled';
  modeSelect.appendChild(disabledOpt);

  // Determine current selection
  const getCurrentMode = (val) => {
    if (val === false || val === undefined || val === null) return 'disabled';
    if (hasPresets && enumValues.includes(val)) return `preset:${val}`;
    if (hasCustom && typeof val === 'number') return 'custom';
    if (hasPresets) return `preset:${enumValues[0]}`;
    if (hasCustom) return 'custom';
    return 'disabled';
  };
  modeSelect.value = getCurrentMode(value);

  container.appendChild(modeSelect);

  // Custom value input (only shown when Custom is selected)
  let customInput = null;
  if (hasCustom) {
    customInput = document.createElement('input');
    customInput.type = 'number';
    customInput.className = 'form-input form-input--number';
    customInput.style.flex = '1';
    customInput.style.display = modeSelect.value === 'custom' ? '' : 'none';
    if (modeSelect.value === 'custom' && typeof value === 'number') {
      customInput.value = value;
    }
    if (customIntOption.minimum !== undefined) customInput.min = customIntOption.minimum;
    if (customIntOption.maximum !== undefined) customInput.max = customIntOption.maximum;
    if (customIntOption.type === 'integer') customInput.step = '1';

    container.appendChild(customInput);

    customInput.addEventListener('change', () => {
      if (modeSelect.value === 'custom') {
        updateFieldValue(path, State.coerceValue(customInput.value, customIntOption.type, customIntOption), schema);
      }
    });
  }

  // Handle mode changes
  modeSelect.addEventListener('change', () => {
    const mode = modeSelect.value;
    if (customInput) {
      customInput.style.display = mode === 'custom' ? '' : 'none';
    }

    if (mode === 'disabled') {
      updateFieldValue(path, undefined, schema);
    } else if (mode === 'custom') {
      // Set to minimum or current value
      const newVal = customIntOption.minimum !== undefined ? customIntOption.minimum : 0;
      if (customInput) customInput.value = newVal;
      updateFieldValue(path, newVal, schema);
    } else if (mode.startsWith('preset:')) {
      const raw = mode.split(':')[1];
      // Coerce to number if the enum contains numbers, otherwise keep as string
      const presetVal = (enumOption?.type === 'integer' || enumOption?.type === 'number')
        ? parseInt(raw, 10) : raw;
      updateFieldValue(path, presetVal, schema);
    }
  });

  group.appendChild(container);
  addFieldDescription(group, schema);
  return group;
}

/**
 * Create a form group wrapper
 */
function createFormGroup(path, key, schema) {
  const group = document.createElement('div');
  group.className = 'form-group';
  group.dataset.path = path;

  if (State.hasChanged(path)) {
    group.classList.add('form-group--changed');
  }

  const label = document.createElement('label');
  label.className = 'form-label';
  label.htmlFor = `field-${path.replace(/[.\[\]"]/g, '-')}`;

  label.innerHTML = Help.escapeHtml(schema.title || key);

  // Required indicator
  if (State.state?.schema?.required?.includes(key)) {
    label.innerHTML += ' <span class="form-label__required">*</span>';
  }

  // Note: x-is-file fields show icon in the input, not a badge in the label

  // Help icon
  if (Help.createHelpIcon && schema.description) {
    const helpIcon = Help.createHelpIcon(schema, key);
    label.appendChild(helpIcon);
  }

  // Revert button (shown for changed fields)
  if (State.hasChanged(path)) {
    const revertBtn = document.createElement('span');
    revertBtn.className = 'revert-btn';
    revertBtn.innerHTML = '↩ Revert';
    revertBtn.title = 'Revert to original value';
    revertBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      // Get baseline value and set it directly
      const baselineVal = State.getNestedValue(State.state.baselineObject, path);
      State.setNestedValue(State.state.currentObject, path,
        baselineVal === undefined ? undefined : JSON.parse(JSON.stringify(baselineVal)));

      // Trigger form change to sync YAML
      if (onFormChange) {
        onFormChange();
      }

      // Re-render the section to show the reverted value
      // Use a small delay to allow the YAML sync to complete
      setTimeout(() => {
        const container = document.getElementById('form-content');
        if (container && window.ClusterfileEditor) {
          window.ClusterfileEditor.State.state.currentSection &&
            renderSection(window.ClusterfileEditor.State.state.currentSection, container);
        }
      }, 100);
    });
    label.appendChild(revertBtn);
  }

  group.appendChild(label);
  return group;
}

/**
 * Add field description
 */
function addFieldDescription(group, schema) {
  if (schema.description) {
    const desc = document.createElement('div');
    desc.className = 'form-description';
    // Truncate long descriptions
    const text = schema.description.length > 200
      ? schema.description.substring(0, 200) + '...'
      : schema.description;
    desc.textContent = text;
    group.appendChild(desc);
  }
}

/**
 * Update field value in state
 */
function updateFieldValue(path, value, schema) {
  const coercedValue = State.coerceValue(value, schema?.type, schema);

  if (coercedValue === undefined || coercedValue === '') {
    State.deleteNestedValue(State.state.currentObject, path);
  } else {
    State.setNestedValue(State.state.currentObject, path, coercedValue);
  }

  State.recordChange(path, coercedValue);
  triggerFormChange();

  if (schema?.['x-rerender-on-change']) {
    setTimeout(() => {
      const container = document.getElementById('form-content');
      const sectionName = window.ClusterfileEditor?.State?.state?.currentSection;
      if (container && sectionName) {
        renderSection(sectionName, container);
      }
    }, 0);
  }

  // Update form group changed state - use CSS.escape for paths with special chars
  try {
    const group = document.querySelector(`[data-path="${CSS.escape(path)}"]`);
    if (group) {
      if (State.hasChanged(path)) {
        group.classList.add('form-group--changed');
      } else {
        group.classList.remove('form-group--changed');
      }
    }
  } catch (e) {
    // Ignore selector errors for complex paths
    console.warn('Could not update form group style for path:', path, e);
  }
}

/**
 * Shared FQDN validation
 */
const FQDN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

function validateHostname(name, exclude) {
  if (!name) return 'Enter a hostname';
  if (!FQDN_PATTERN.test(name)) return 'Invalid FQDN';
  if (name !== exclude && State.state.currentObject.hosts?.[name]) return 'Already exists';
  return null;
}

/**
 * Duplicate a host — shows inline input replacing hostname label
 */
function duplicateHost(hostname) {
  const card = document.querySelector(`[data-hostname="${CSS.escape(hostname)}"]`);
  if (!card) return;
  const headerLabel = card.querySelector('.host-card__hostname');
  if (!headerLabel || headerLabel.dataset.editing) return;

  const original = headerLabel.textContent;
  headerLabel.dataset.editing = 'true';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-input form-input--sm';
  input.value = hostname + '-copy';
  input.style.width = '100%';
  input.style.fontSize = 'inherit';

  const error = document.createElement('span');
  error.className = 'field-error';
  error.style.color = 'var(--pf-global--danger-color--100, #c9190b)';
  error.style.fontSize = '0.8em';
  error.style.display = 'none';

  const commit = () => {
    const newName = input.value.trim();
    const err = validateHostname(newName);
    if (err) { error.textContent = err; error.style.display = 'inline'; return; }
    const orig = State.state.currentObject.hosts[hostname];
    State.state.currentObject.hosts[newName] = JSON.parse(JSON.stringify(orig));
    State.recordChange(`hosts["${newName}"]`, State.state.currentObject.hosts[newName]);
    triggerFormChange();
    if (window.ClusterfileEditor?.refreshCurrentSection) window.ClusterfileEditor.refreshCurrentSection();
  };

  const cancel = () => {
    headerLabel.textContent = original;
    delete headerLabel.dataset.editing;
    error.remove();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  });
  input.addEventListener('blur', cancel);

  headerLabel.textContent = '';
  headerLabel.appendChild(input);
  headerLabel.appendChild(error);
  input.select();
}

/**
 * Rename a host — shows inline input replacing hostname label
 */
function renameHost(hostname) {
  const card = document.querySelector(`[data-hostname="${CSS.escape(hostname)}"]`);
  if (!card) return;
  const headerLabel = card.querySelector('.host-card__hostname');
  if (!headerLabel || headerLabel.dataset.editing) return;

  headerLabel.dataset.editing = 'true';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-input form-input--sm';
  input.value = hostname;
  input.style.width = '100%';
  input.style.fontSize = 'inherit';

  const error = document.createElement('span');
  error.className = 'field-error';
  error.style.color = 'var(--pf-global--danger-color--100, #c9190b)';
  error.style.fontSize = '0.8em';
  error.style.display = 'none';

  const commit = () => {
    const newName = input.value.trim();
    if (newName === hostname) { cancel(); return; }
    const err = validateHostname(newName, hostname);
    if (err) { error.textContent = err; error.style.display = 'inline'; return; }
    const hostData = State.state.currentObject.hosts[hostname];
    delete State.state.currentObject.hosts[hostname];
    State.state.currentObject.hosts[newName] = hostData;
    State.recordChange(`hosts["${hostname}"]`, undefined);
    State.recordChange(`hosts["${newName}"]`, hostData);
    triggerFormChange();
    if (window.ClusterfileEditor?.refreshCurrentSection) window.ClusterfileEditor.refreshCurrentSection();
  };

  const cancel = () => {
    headerLabel.textContent = hostname;
    delete headerLabel.dataset.editing;
    error.remove();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  });
  input.addEventListener('blur', () => setTimeout(cancel, 150));

  headerLabel.textContent = '';
  headerLabel.appendChild(input);
  headerLabel.appendChild(error);
  input.select();
}

/**
 * Remove a host — immediate with undo toast
 */
function removeHost(hostname) {
  const hostData = JSON.parse(JSON.stringify(State.state.currentObject.hosts[hostname]));
  delete State.state.currentObject.hosts[hostname];
  State.recordChange(`hosts["${hostname}"]`, undefined);
  triggerFormChange();

  // Show undo toast
  const existing = document.querySelector('.undo-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'undo-toast';
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--pf-global--BackgroundColor--dark-100,#151515);color:#fff;padding:10px 20px;border-radius:6px;display:flex;gap:12px;align-items:center;z-index:9999;font-size:0.9em;box-shadow:0 4px 12px rgba(0,0,0,0.3)';
  toast.innerHTML = `<span>Removed <strong>${Help.escapeHtml(hostname)}</strong></span>`;

  const undoBtn = document.createElement('button');
  undoBtn.style.cssText = 'background:none;border:1px solid #fff;color:#fff;padding:2px 10px;border-radius:4px;cursor:pointer;font-size:0.9em';
  undoBtn.textContent = 'Undo';
  undoBtn.addEventListener('click', () => {
    if (!State.state.currentObject.hosts) State.state.currentObject.hosts = {};
    State.state.currentObject.hosts[hostname] = hostData;
    State.recordChange(`hosts["${hostname}"]`, hostData);
    triggerFormChange();
    toast.remove();
    if (window.ClusterfileEditor?.refreshCurrentSection) window.ClusterfileEditor.refreshCurrentSection();
  });
  toast.appendChild(undoBtn);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);

  if (window.ClusterfileEditor?.refreshCurrentSection) window.ClusterfileEditor.refreshCurrentSection();
}

// Export for use in other modules
window.EditorForm = {
  renderSection,
  renderHostsSection,
  renderPluginsSection,
  renderObjectFields,
  renderField,
  setFormChangeCallback,
  triggerFormChange,
  duplicateHost,
  renameHost,
  removeHost
};

})(); // End IIFE
