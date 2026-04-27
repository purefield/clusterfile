"""Template processor for Jinja2 rendering with YAML output."""
import yaml
from jinja2 import Environment, FileSystemLoader
import os
import yamllint.config
import yamllint.linter
import jsonpath_ng
import re
from pathlib import Path
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))  # dev: repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))              # container: /app/
from lib.render import (
    IndentDumper, LoggingUndefined, base64encode, as_list, passwd_hash, set_by_path,
    resolve_path, validate_data_for_template, YAMLLINT_CONFIG, format_yaml_output,
)

# Backwards-compatible alias retained for the editor test module.
_set_by_path = set_by_path


def load_file(path: str) -> str:
    """Return a placeholder for file paths (browser context)."""
    if not path or not isinstance(path, str):
        return ""
    return f"<file:{path}>"


def apply_params(data: dict, params: list) -> dict:
    """Apply JSONPath parameter overrides to data."""
    for override in params:
        if "=" not in override:
            continue
        path_expr, val = override.split("=", 1)
        val = val.encode("utf-8").decode("unicode_escape")
        try:
            expr = jsonpath_ng.parse(path_expr)
            matches = expr.find(data)
            if matches:
                for m in matches:
                    m.full_path.update(data, val)
                continue
        except Exception:
            pass
        set_by_path(data, path_expr, val)
    return data


def process_template(config_data: dict, template_content: str, template_dir: str) -> tuple:
    """Process a Jinja2 template with the given configuration data.
    Returns (output, missing_vars) tuple.
    """
    includes_dir = os.path.join(template_dir, 'includes')
    plugins_tpl  = os.path.join(template_dir, 'plugins')
    plugins_root = os.path.join(os.path.dirname(template_dir), 'plugins')
    loader_paths = [template_dir]
    if os.path.exists(includes_dir):
        loader_paths.append(includes_dir)
    if os.path.exists(plugins_tpl):
        loader_paths.append(plugins_tpl)
    if os.path.exists(plugins_root):
        loader_paths.append(plugins_root)

    env = Environment(loader=FileSystemLoader(loader_paths), undefined=LoggingUndefined)
    env.globals["load_file"] = load_file
    env.filters["base64encode"] = base64encode
    env.filters["as_list"] = as_list
    env.filters["passwd_hash"] = passwd_hash
    env.filters["merge"] = lambda a, b: {**a, **b}

    LoggingUndefined._missing = {}
    template = env.from_string(template_content)
    output = template.render(config_data)
    return output, dict(LoggingUndefined._missing)


def render_template(yaml_text: str, template_name: str, params: list, templates_dir: Path) -> dict:
    """Render a Jinja2 template with YAML data and optional parameter overrides."""
    # Parse YAML input
    try:
        data = yaml.safe_load(yaml_text) or {}
    except yaml.YAMLError as e:
        return {"success": False, "error": f"Invalid YAML: {e}", "output": ""}

    # Apply parameter overrides
    if params:
        try:
            data = apply_params(data, params)
        except Exception as e:
            return {"success": False, "error": f"Failed to apply parameters: {e}", "output": ""}

    # Validate template path
    template_path = templates_dir / template_name
    if not template_path.exists():
        return {"success": False, "error": f"Template not found: {template_name}", "output": ""}

    # Security: prevent path traversal
    safe_name = os.path.basename(template_name)
    if safe_name != template_name or ".." in template_name:
        return {"success": False, "error": "Invalid template name", "output": ""}

    # Read template
    try:
        with open(template_path, 'r') as f:
            template_content = f.read()
    except Exception as e:
        return {"success": False, "error": f"Failed to read template: {e}", "output": ""}

    # Pre-render validation (warnings only, never blocks rendering)
    meta = parse_template_metadata(template_content)
    val_warnings, val_errors = validate_data_for_template(data, meta)
    # Demote validation errors to warnings so rendering always proceeds
    all_warnings = val_warnings + val_errors

    # Render template (LoggingUndefined prevents crashes on missing data)
    try:
        processed, missing_vars = process_template(data, template_content, str(templates_dir))
        if missing_vars:
            subs = [f"{k}={v!r}" for k, v in sorted(missing_vars.items())]
            all_warnings.append(f"Substituted defaults: {', '.join(subs)}")
    except Exception as e:
        return {"success": False, "error": f"Template rendering failed: {e}", "output": "", "warnings": all_warnings}

    # Format YAML output if applicable
    if template_name.endswith('.yaml.tpl') or template_name.endswith('.yaml.tmpl'):
        try:
            output_yaml = format_yaml_output(processed, meta)

            # Run yamllint
            config = yamllint.config.YamlLintConfig(YAMLLINT_CONFIG)
            problems = list(yamllint.linter.run(output_yaml, config))
            all_warnings += [str(p) for p in problems]

            return {
                "success": True,
                "output": output_yaml,
                "warnings": all_warnings,
                "error": ""
            }
        except Exception as e:
            return {"success": False, "error": f"YAML processing failed: {e}", "output": processed, "warnings": all_warnings}

    return {"success": True, "output": processed, "warnings": all_warnings, "error": ""}


def parse_template_metadata(content: str) -> dict:
    """
    Parse @meta block from template content.

    Metadata format:
    {#- @meta
    name: template-name.yaml
    description: What this template does
    type: clusterfile|other
    category: installation|credentials|acm|configuration|utility|storage
    platforms: [list of supported platforms]
    requires: [list of required data fields]
    bundle: agent | acm-hub | acm-ztp | capi | utility (or comma-separated list of bundles)
    clusterRole: [standalone | hub | managed]  (which cluster intent this template serves)
    bundleOrder: integer (display order in tabs; lower = leftmost)
    docs: URL to documentation
    -#}
    """
    meta = {
        "name": "",
        "description": "",
        "type": "other",
        "category": "other",
        "platforms": [],
        "requires": [],
        "bundle": "",
        "clusterRole": [],
        "bundleOrder": 99,
        "docs": "",
        "yamlWrapper": "list"
    }

    # Look for @meta block
    import re
    match = re.search(r'\{#-?\s*@meta\s*\n(.*?)\n\s*-?#\}', content, re.DOTALL)
    if not match:
        return meta

    meta_text = match.group(1)
    try:
        parsed = yaml.safe_load(meta_text)
        if isinstance(parsed, dict):
            meta.update(parsed)
    except Exception:
        pass

    return meta


def list_templates(templates_dir: Path) -> list:
    """List all available templates with metadata."""
    templates = []
    if not templates_dir.exists():
        return templates

    for f in sorted(templates_dir.glob("*.tpl")):
        try:
            content = f.read_text()
            meta = parse_template_metadata(content)
            meta["filename"] = f.name
            if not meta["name"]:
                meta["name"] = f.name
            if not meta["description"]:
                meta["description"] = get_template_description(f)
            templates.append(meta)
        except Exception:
            templates.append({
                "filename": f.name,
                "name": f.name,
                "description": get_template_description(f),
                "type": "other",
                "category": "other",
                "platforms": [],
                "requires": [],
                "bundle": "",
                "clusterRole": [],
                "bundleOrder": 99,
                "docs": ""
            })

    for f in sorted(templates_dir.glob("*.tmpl")):
        try:
            content = f.read_text()
            meta = parse_template_metadata(content)
            meta["filename"] = f.name
            if not meta["name"]:
                meta["name"] = f.name
            if not meta["description"]:
                meta["description"] = get_template_description(f)
            templates.append(meta)
        except Exception:
            templates.append({
                "filename": f.name,
                "name": f.name,
                "description": get_template_description(f),
                "type": "other",
                "category": "other",
                "platforms": [],
                "requires": [],
                "bundle": "",
                "clusterRole": [],
                "bundleOrder": 99,
                "docs": ""
            })

    return templates


def get_template_description(template_path: Path) -> str:
    """Get a fallback description for a template without metadata."""
    descriptions = {
        "install-config.yaml.tpl": "OpenShift install-config.yaml (unified for all platforms)",
        "creds.yaml.tpl": "CCO credentials for cloud platforms (AWS, Azure, GCP, etc.)",
        "agent-config.yaml.tpl": "Agent-based installer agent-config.yaml with bond/VLAN",
        "acm-ztp.yaml.tpl": "ACM Zero Touch Provisioning configuration",
        "acm-capi-m3.yaml.tpl": "ACM CAPI + Metal3 configuration for MCE",
        "acm-creds.yaml.tpl": "ACM host inventory credentials",
        "acm-asc.yaml.tpl": "ACM Assisted Service ConfigMap",
        "mirror-registry-config.yaml.tpl": "Mirror registry configuration",
        "nodes-config.yaml.tpl": "Node network configuration with NMState",
        "secondary-network-setup.yaml.tpl": "Secondary network NNCP configuration",
        "infinidat-setup.yaml.tpl": "Infinidat storage configuration",
        "test-dns.sh.tpl": "DNS verification script",
    }
    return descriptions.get(template_path.name, "Jinja2 template")


def get_template_content(template_name: str, templates_dir: Path) -> dict:
    """Get the raw content of a template file."""
    safe_name = os.path.basename(template_name)
    if safe_name != template_name or ".." in template_name:
        return {"success": False, "error": "Invalid template name", "content": ""}

    template_path = templates_dir / template_name
    if not template_path.exists():
        return {"success": False, "error": f"Template not found: {template_name}", "content": ""}

    try:
        with open(template_path, 'r') as f:
            return {"success": True, "content": f.read(), "error": ""}
    except Exception as e:
        return {"success": False, "error": f"Failed to read template: {e}", "content": ""}
