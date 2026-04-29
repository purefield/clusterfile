/**
 * Clusterfile Editor v2.0 - State Management Module
 *
 * Manages application state with baseline/current/changes tracking
 * and localStorage persistence with secret redaction.
 */
(function() {
'use strict';

// Storage keys
const STORAGE_KEYS = {
  LAST_YAML: 'CLUSTERFILE_LAST_YAML',
  BASELINE_YAML: 'CLUSTERFILE_BASELINE_YAML',
  UPLOADED_SCHEMA: 'CLUSTERFILE_UPLOADED_SCHEMA',
  TOUR_SHOWN: 'CLUSTERFILE_TOUR_SHOWN',
  MODE: 'CLUSTERFILE_MODE',
  CURRENT_SECTION: 'CLUSTERFILE_CURRENT_SECTION',
  SCROLL_POSITION: 'CLUSTERFILE_SCROLL_POSITION',
  FILENAME: 'CLUSTERFILE_FILENAME',
  SELECTED_TEMPLATE: 'CLUSTERFILE_SELECTED_TEMPLATE'
};

// Fields that should have their values redacted in storage
// NOTE: The clusterfile itself contains NO secrets - only paths to files
// All sensitive data is stored in external files read by the template processor at render time
// Therefore, no redaction is needed for localStorage
const REDACTED_PATHS = [];

/**
 * Application state object
 */
const state = {
  // Schema
  schema: null,

  // Document state
  baselineYamlText: '',
  baselineObject: {},
  currentYamlText: '',
  currentObject: {},

  // Change tracking
  changes: [],

  // UI state
  currentSection: 'account',
  mode: 'guided',

  // Editor instances
  yamlEditor: null,
  outputEditor: null,

  // Metadata
  currentFilename: 'untitled.clusterfile',

  // Validation
  validationErrors: [],
  renderWarnings: [],

  // API data
  samples: [],
  templates: [],

  // In-memory file uploads (Q2). Keyed by the path string the YAML uses
  // (e.g. "secrets/pull-secret.json"), values are file contents as strings.
  // NEVER persisted — wiped on reload/tab close. Sent with every render
  // request as `files: {path: content}`; backend resolution order is
  // request files map > /content mount > <file:path> placeholder.
  uploadedFiles: {}
};

/**
 * Check if a path matches a redaction pattern
 */
function matchesRedactionPath(path, patterns) {
  for (const pattern of patterns) {
    const patternParts = pattern.split('.');
    const pathParts = path.split('.');

    let matches = true;
    let patternIdx = 0;

    for (let pathIdx = 0; pathIdx < pathParts.length && patternIdx < patternParts.length; pathIdx++) {
      const patternPart = patternParts[patternIdx];
      const pathPart = pathParts[pathIdx];

      if (patternPart === '*') {
        patternIdx++;
        continue;
      }

      // Handle array indices in path (e.g., sshKeys[0])
      const pathBase = pathPart.replace(/\[\d+\]$/, '');

      if (patternPart !== pathBase && patternPart !== pathPart) {
        matches = false;
        break;
      }
      patternIdx++;
    }

    if (matches && patternIdx >= patternParts.length) {
      return true;
    }
  }
  return false;
}

/**
 * Redact sensitive values from an object for storage
 */
function redactSecrets(obj, path = '') {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    if (matchesRedactionPath(path, REDACTED_PATHS)) {
      return '<redacted>';
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item, idx) => redactSecrets(item, `${path}[${idx}]`));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const newPath = path ? `${path}.${key}` : key;
    result[key] = redactSecrets(value, newPath);
  }
  return result;
}

/**
 * Save current state to localStorage
 */
function saveToLocalStorage() {
  try {
    // Save current YAML
    localStorage.setItem(STORAGE_KEYS.LAST_YAML, state.currentYamlText || '');

    // Save baseline YAML (for diff/revert)
    localStorage.setItem(STORAGE_KEYS.BASELINE_YAML, state.baselineYamlText || '');

    // Save UI state
    localStorage.setItem(STORAGE_KEYS.MODE, state.mode);
    localStorage.setItem(STORAGE_KEYS.CURRENT_SECTION, state.currentSection);
    localStorage.setItem(STORAGE_KEYS.FILENAME, state.currentFilename);

    // Save scroll position of form content
    const formContent = document.getElementById('form-content');
    if (formContent) {
      localStorage.setItem(STORAGE_KEYS.SCROLL_POSITION, JSON.stringify({
        form: formContent.scrollTop,
        section: state.currentSection
      }));
    }

    return true;
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
    return false;
  }
}

/**
 * Load state from localStorage
 */
function loadFromLocalStorage() {
  try {
    const savedYaml = localStorage.getItem(STORAGE_KEYS.LAST_YAML);
    const savedBaseline = localStorage.getItem(STORAGE_KEYS.BASELINE_YAML);
    const savedMode = localStorage.getItem(STORAGE_KEYS.MODE);
    const savedSchema = localStorage.getItem(STORAGE_KEYS.UPLOADED_SCHEMA);
    const savedSection = localStorage.getItem(STORAGE_KEYS.CURRENT_SECTION);
    const savedFilename = localStorage.getItem(STORAGE_KEYS.FILENAME);
    const savedScrollStr = localStorage.getItem(STORAGE_KEYS.SCROLL_POSITION);

    if (savedMode) {
      state.mode = savedMode;
    }

    if (savedSection) {
      state.currentSection = savedSection;
    }

    if (savedFilename) {
      state.currentFilename = savedFilename;
    }

    if (savedSchema) {
      try {
        state.schema = JSON.parse(savedSchema);
      } catch (e) {
        console.warn('Failed to parse saved schema:', e);
      }
    }

    let scrollPosition = null;
    if (savedScrollStr) {
      try {
        scrollPosition = JSON.parse(savedScrollStr);
      } catch (e) {
        console.warn('Failed to parse saved scroll position:', e);
      }
    }

    return {
      yaml: savedYaml || '',
      baseline: savedBaseline || '',
      mode: savedMode || 'guided',
      section: savedSection || 'account',
      filename: savedFilename || 'untitled.clusterfile',
      scrollPosition: scrollPosition,
      hasSchema: !!savedSchema
    };
  } catch (e) {
    console.warn('Failed to load from localStorage:', e);
    return { yaml: '', baseline: '', mode: 'guided', section: 'account', filename: 'untitled.clusterfile', scrollPosition: null, hasSchema: false };
  }
}

/**
 * Check if tour has been shown
 */
function isTourShown() {
  return localStorage.getItem(STORAGE_KEYS.TOUR_SHOWN) === 'true';
}

/**
 * Mark tour as shown
 */
function setTourShown() {
  localStorage.setItem(STORAGE_KEYS.TOUR_SHOWN, 'true');
}

/**
 * Clear tour shown flag (for testing)
 */
function resetTourShown() {
  localStorage.removeItem(STORAGE_KEYS.TOUR_SHOWN);
}

/**
 * Set baseline from YAML text
 */
function setBaseline(yamlText) {
  state.baselineYamlText = yamlText;
  try {
    state.baselineObject = jsyaml.load(yamlText) || {};
  } catch (e) {
    state.baselineObject = {};
  }
  state.changes = [];
}

/**
 * Update current document
 */
function updateCurrent(yamlText, source = 'unknown') {
  const previousObject = JSON.parse(JSON.stringify(state.currentObject || {}));
  state.currentYamlText = yamlText;
  try {
    state.currentObject = jsyaml.load(yamlText) || {};
    // Record changes by comparing with baseline
    if (source === 'editor') {
      detectAndRecordChanges(previousObject, state.currentObject);
    }
  } catch (e) {
    // Keep previous object if parse fails
    console.warn('Failed to parse YAML:', e);
  }
}

/**
 * Detect changes between previous and current state, and record them
 */
function detectAndRecordChanges(previous, current, path = '') {
  const allKeys = new Set([
    ...Object.keys(previous || {}),
    ...Object.keys(current || {})
  ]);

  for (const key of allKeys) {
    const newPath = path ? `${path}.${key}` : key;
    const prevVal = previous?.[key];
    const currVal = current?.[key];

    if (prevVal === currVal) continue;

    if (typeof currVal === 'object' && currVal !== null && !Array.isArray(currVal) &&
        typeof prevVal === 'object' && prevVal !== null && !Array.isArray(prevVal)) {
      // Recurse into nested objects
      detectAndRecordChanges(prevVal, currVal, newPath);
    } else if (JSON.stringify(prevVal) !== JSON.stringify(currVal)) {
      // Record the change if different from baseline
      if (hasChanged(newPath)) {
        recordChange(newPath, currVal);
      }
    }
  }
}

/**
 * Get a nested value from an object using dot notation
 * Supports both dot notation (cluster.name) and bracket notation (hosts["hostname"])
 */
function getNestedValue(obj, path) {
  if (!path || !obj) return undefined;

  const parts = parsePath(path);
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Set a nested value in an object using dot notation
 */
function setNestedValue(obj, path, value) {
  if (!path || !obj) return;

  const parts = parsePath(path);
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextPart = parts[i + 1];

    if (current[part] === undefined || current[part] === null) {
      // Create array or object based on next part
      current[part] = typeof nextPart === 'number' ? [] : {};
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];
  if (value === undefined) {
    delete current[lastPart];
  } else {
    current[lastPart] = value;
  }
}

/**
 * Delete a nested value from an object
 */
function deleteNestedValue(obj, path) {
  if (!path || !obj) return;

  const parts = parsePath(path);
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined || current[part] === null) {
      return;
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];
  if (Array.isArray(current) && typeof lastPart === 'number') {
    current.splice(lastPart, 1);
  } else {
    delete current[lastPart];
  }
}

/**
 * Parse a path string into parts
 * Handles both dot notation and bracket notation
 */
function parsePath(path) {
  const parts = [];
  let current = '';
  let inBracket = false;
  let bracketContent = '';

  for (let i = 0; i < path.length; i++) {
    const char = path[i];

    if (char === '[' && !inBracket) {
      if (current) {
        parts.push(current);
        current = '';
      }
      inBracket = true;
      bracketContent = '';
    } else if (char === ']' && inBracket) {
      inBracket = false;
      // Check if it's a number (array index) or string (object key)
      const num = parseInt(bracketContent, 10);
      if (!isNaN(num) && bracketContent === String(num)) {
        parts.push(num);
      } else {
        // Remove quotes if present
        const cleaned = bracketContent.replace(/^["']|["']$/g, '');
        parts.push(cleaned);
      }
    } else if (char === '.' && !inBracket) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else if (inBracket) {
      bracketContent += char;
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Build a path string from parts
 */
function buildPath(parts) {
  return parts.map((part, idx) => {
    if (typeof part === 'number') {
      return `[${part}]`;
    }
    // Use bracket notation for keys with special characters
    if (/[.\[\]"]/.test(part) || /^\d/.test(part)) {
      return idx === 0 ? `["${part}"]` : `["${part}"]`;
    }
    return idx === 0 ? part : `.${part}`;
  }).join('');
}

/**
 * Check if a value has changed from baseline
 */
function hasChanged(path) {
  const baselineVal = getNestedValue(state.baselineObject, path);
  const currentVal = getNestedValue(state.currentObject, path);

  return JSON.stringify(baselineVal) !== JSON.stringify(currentVal);
}

/**
 * Record a change
 */
function recordChange(path, value) {
  const existing = state.changes.findIndex(c => c.path === path);
  if (existing >= 0) {
    state.changes[existing] = { path, value, timestamp: Date.now() };
  } else {
    state.changes.push({ path, value, timestamp: Date.now() });
  }

  // Remove from changes if reverted to baseline
  if (!hasChanged(path)) {
    state.changes = state.changes.filter(c => c.path !== path);
  }
}

/**
 * Get all changes by comparing baseline to current
 */
function getChanges() {
  const changes = [];
  computeChanges(state.baselineObject, state.currentObject, '', changes);
  return changes;
}

/**
 * Recursively compute all changed paths between baseline and current
 */
function computeChanges(baseline, current, path, changes) {
  const baselineKeys = Object.keys(baseline || {});
  const currentKeys = Object.keys(current || {});
  const allKeys = new Set([...baselineKeys, ...currentKeys]);

  for (const key of allKeys) {
    const newPath = path ? `${path}.${key}` : key;
    const baseVal = baseline?.[key];
    const currVal = current?.[key];

    // Skip if identical
    if (JSON.stringify(baseVal) === JSON.stringify(currVal)) continue;

    // If both are objects (not arrays), recurse
    if (typeof baseVal === 'object' && baseVal !== null && !Array.isArray(baseVal) &&
        typeof currVal === 'object' && currVal !== null && !Array.isArray(currVal)) {
      computeChanges(baseVal, currVal, newPath, changes);
    } else {
      // Record as change
      changes.push({
        path: newPath,
        oldValue: baseVal,
        value: currVal,
        timestamp: Date.now()
      });
    }
  }
}

/**
 * Revert a specific path to baseline value
 */
function revertPath(path) {
  const baselineVal = getNestedValue(state.baselineObject, path);
  setNestedValue(state.currentObject, path,
    baselineVal === undefined ? undefined : JSON.parse(JSON.stringify(baselineVal)));
  state.changes = state.changes.filter(c => c.path !== path);
}

/**
 * Revert all changes in a section
 */
function revertSection(section) {
  const sectionChanges = state.changes.filter(c => c.path.startsWith(section + '.') || c.path === section);
  for (const change of sectionChanges) {
    revertPath(change.path);
  }
}

/**
 * Revert all changes
 */
function revertAll() {
  state.currentObject = JSON.parse(JSON.stringify(state.baselineObject));
  state.currentYamlText = state.baselineYamlText;
  state.changes = [];
}

/**
 * Clean empty values from object while preserving baseline keys
 */
function cleanObject(obj, baseline = {}, path = '') {
  if (obj === null || obj === undefined) {
    return undefined;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    const cleaned = obj
      .map((item, idx) => cleanObject(item, baseline?.[idx], `${path}[${idx}]`))
      .filter(item => item !== undefined && item !== null && item !== '');
    return cleaned.length > 0 ? cleaned : undefined;
  }

  // Get ordered keys - baseline keys first, then new keys
  const baselineKeys = Object.keys(baseline || {});
  const currentKeys = Object.keys(obj);
  const allKeys = [...baselineKeys];
  for (const key of currentKeys) {
    if (!allKeys.includes(key)) {
      allKeys.push(key);
    }
  }

  const result = {};
  for (const key of allKeys) {
    if (!(key in obj)) continue;

    const value = obj[key];
    const baselineValue = baseline?.[key];
    const newPath = path ? `${path}.${key}` : key;

    const cleaned = cleanObject(value, baselineValue, newPath);

    // Keep if: has value, or baseline had a value (including empty string)
    if (cleaned !== undefined && cleaned !== null && cleaned !== '') {
      result[key] = cleaned;
    } else if (baselineValue === '') {
      result[key] = '';
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Convert current object to YAML with baseline ordering
 */
function toYaml() {
  const cleaned = cleanObject(state.currentObject, state.baselineObject);
  return jsyaml.dump(cleaned || {}, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false
  });
}

/**
 * Coerce a value to match schema type
 */
function coerceValue(value, schemaType, schema) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  // Handle anyOf/oneOf
  if (schema?.anyOf || schema?.oneOf) {
    const options = schema.anyOf || schema.oneOf;
    for (const option of options) {
      const coerced = coerceValue(value, option.type, option);
      if (coerced !== undefined) {
        // Validate against const if present
        if (option.const !== undefined && coerced !== option.const) {
          continue;
        }
        return coerced;
      }
    }
    return value;
  }

  switch (schemaType) {
    case 'integer':
      const intVal = parseInt(value, 10);
      return isNaN(intVal) ? undefined : intVal;

    case 'number':
      const numVal = parseFloat(value);
      return isNaN(numVal) ? undefined : numVal;

    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return undefined;

    case 'string':
      return String(value);

    default:
      return value;
  }
}

// Export for use in other modules
window.EditorState = {
  state,
  STORAGE_KEYS,
  saveToLocalStorage,
  loadFromLocalStorage,
  isTourShown,
  setTourShown,
  resetTourShown,
  setBaseline,
  updateCurrent,
  getNestedValue,
  setNestedValue,
  deleteNestedValue,
  parsePath,
  buildPath,
  hasChanged,
  recordChange,
  getChanges,
  revertPath,
  revertSection,
  revertAll,
  cleanObject,
  toYaml,
  coerceValue,
  redactSecrets
};

})(); // End IIFE
