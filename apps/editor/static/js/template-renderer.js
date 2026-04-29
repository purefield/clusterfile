/**
 * Clusterfile Editor - Template Renderer
 *
 * Client-side Jinja2-compatible template rendering using Nunjucks.
 * Used in standalone/browser-only mode when no backend is available.
 */

(function() {
  'use strict';

  // Skip if nunjucks isn't loaded (server mode)
  if (typeof nunjucks === 'undefined') {
    console.log('Nunjucks not loaded - template rendering will use server API');
    window.TemplateRenderer = null;
    return;
  }

  // Configure nunjucks environment
  const env = new nunjucks.Environment(null, {
    autoescape: false,
    throwOnUndefined: false,
    trimBlocks: true,
    lstripBlocks: true
  });

  // Custom filter: base64encode (matches Python implementation)
  env.addFilter('base64encode', function(str) {
    if (str === null || str === undefined) return '';
    try {
      // Handle UTF-8 properly
      return btoa(unescape(encodeURIComponent(String(str))));
    } catch (e) {
      console.warn('base64encode failed:', e);
      return '';
    }
  });

  // Custom filter: load_file (resolves from in-memory uploads in standalone)
  // Browser mode can't read host files; the uploaded-files map (Q2) provides
  // per-session content. Resolution: in-memory map > <file:path> placeholder.
  env.addFilter('load_file', function(path) {
    if (path === null || path === undefined) return '';
    const map = (window.EditorState && window.EditorState.state &&
                 window.EditorState.state.uploadedFiles) || {};
    if (Object.prototype.hasOwnProperty.call(map, path)) {
      return String(map[path] || '');
    }
    return `<file:${path}>`;
  });

  // Custom filter: default (Jinja2 compatibility)
  env.addFilter('d', function(value, defaultValue) {
    if (value === null || value === undefined || value === '') {
      return defaultValue !== undefined ? defaultValue : '';
    }
    return value;
  });

  // Custom filter: to_yaml (convert object to YAML string)
  env.addFilter('to_yaml', function(obj) {
    if (typeof jsyaml !== 'undefined') {
      return jsyaml.dump(obj, { lineWidth: -1 });
    }
    return JSON.stringify(obj, null, 2);
  });

  // Custom filter: to_json
  env.addFilter('to_json', function(obj, indent) {
    return JSON.stringify(obj, null, indent || 0);
  });

  // Custom filter: to_nice_json
  env.addFilter('to_nice_json', function(obj) {
    return JSON.stringify(obj, null, 2);
  });

  // Custom filter: regex_replace
  env.addFilter('regex_replace', function(str, pattern, replacement) {
    if (!str) return str;
    try {
      const regex = new RegExp(pattern, 'g');
      return String(str).replace(regex, replacement || '');
    } catch (e) {
      console.warn('regex_replace failed:', e);
      return str;
    }
  });

  // Custom filter: indent
  env.addFilter('indent', function(str, width, first, blank) {
    if (!str) return str;
    width = width || 4;
    const indentStr = ' '.repeat(width);
    const lines = String(str).split('\n');
    return lines.map((line, i) => {
      if (i === 0 && !first) return line;
      if (line.trim() === '' && !blank) return line;
      return indentStr + line;
    }).join('\n');
  });

  /**
   * Apply JSONPath-style parameter overrides to data object
   * @param {Object} data - The data object to modify
   * @param {Array} params - Array of "path=value" strings
   * @returns {Object} Modified data object
   */
  function applyParams(data, params) {
    if (!params || params.length === 0) return data;

    // Deep clone to avoid mutation
    const result = JSON.parse(JSON.stringify(data));

    params.forEach(param => {
      const eqIndex = param.indexOf('=');
      if (eqIndex === -1) return;

      const path = param.substring(0, eqIndex);
      let value = param.substring(eqIndex + 1);

      // Try to parse value as JSON for objects/arrays/numbers/booleans
      try {
        value = JSON.parse(value);
      } catch (e) {
        // Keep as string
      }

      // Set nested value
      setNestedValue(result, path, value);
    });

    return result;
  }

  /**
   * Set a nested value in an object using dot notation path
   * @param {Object} obj - The object to modify
   * @param {string} path - Dot notation path (e.g., "cluster.name")
   * @param {*} value - Value to set
   */
  function setNestedValue(obj, path, value) {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Render a Jinja2 template using Nunjucks
   * @param {string} template - Template content
   * @param {Object} data - Data object to render with
   * @param {Array} params - Optional parameter overrides
   * @returns {Object} Result with output or error
   */
  function render(template, data, params) {
    try {
      // Apply parameter overrides
      const contextData = applyParams(data || {}, params || []);

      // Render template
      const output = env.renderString(template, contextData);

      return {
        success: true,
        output: output,
        warnings: []
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: e.message,
        warnings: []
      };
    }
  }

  /**
   * Pre-process template to handle Jinja2-specific syntax
   * Nunjucks is mostly compatible but has some differences
   */
  function preprocessTemplate(template) {
    let processed = template;

    // Handle Jinja2's ~ string concatenation (Nunjucks uses +)
    // Be careful not to break other uses of ~
    // This is a simple heuristic - may need refinement
    processed = processed.replace(/\{\{([^}]*?)\s+~\s+([^}]*?)\}\}/g, '{{ $1 + $2 }}');

    // Handle loop.index0 vs loop.index0 (same in both)
    // Handle loop.first, loop.last (same in both)

    return processed;
  }

  // Export the renderer
  window.TemplateRenderer = {
    render: function(template, data, params) {
      const processed = preprocessTemplate(template);
      return render(processed, data, params);
    },
    applyParams: applyParams,
    env: env
  };

  console.log('TemplateRenderer initialized (browser-only mode available)');
})();
