/**
 * CommandEditor Plugin SDK v1.0
 * Third-party extension API for CommandEditor
 * 
 * Usage:
 *   const myPlugin = {
 *     manifest: { id: 'my-plugin', name: 'My Plugin', version: '1.0.0' },
 *     activate(context) {
 *       context.commands.register('myCommand', () => {});
 *     }
 *   };
 *   PluginSDK.register(myPlugin);
 */

class PluginContext {
  constructor(manifest, api) {
    this.manifest = manifest;
    this.api = api;
    this.subscriptions = [];
    this.commands = new Map();
    this.panels = new Map();
    this.settings = new Map();
  }

  // Register a disposable resource
  push(subscription) {
    this.subscriptions.push(subscription);
    return subscription;
  }

  // Clean up all resources
  dispose() {
    this.subscriptions.forEach(s => s.dispose?.());
    this.subscriptions = [];
    this.commands.clear();
    this.panels.clear();
  }
}

class PluginAPI {
  constructor(coreAPI) {
    this.core = coreAPI;
    this.eventBus = new EventTarget();
  }

  // ─── Commands ─────────────────────────────────────────────────────────────
  registerCommand(id, handler, options = {}) {
    const fullId = `${this.manifest.id}.${id}`;
    this.core.commands.register(fullId, handler, {
      ...options,
      plugin: this.manifest.id
    });
    return {
      dispose: () => this.core.commands.unregister(fullId)
    };
  }

  // ─── UI Panels ────────────────────────────────────────────────────────────
  registerPanel(id, config) {
    const fullId = `${this.manifest.id}.${id}`;
    this.core.ui.registerPanel(fullId, {
      ...config,
      plugin: this.manifest.id
    });
    return {
      dispose: () => this.core.ui.unregisterPanel(fullId)
    };
  }

  // ─── Tools ────────────────────────────────────────────────────────────────
  registerTool(id, config) {
    const fullId = `${this.manifest.id}.${id}`;
    this.core.tools.register(fullId, {
      ...config,
      plugin: this.manifest.id
    });
    return {
      dispose: () => this.core.tools.unregister(fullId)
    };
  }

  // ─── PDF Operations ───────────────────────────────────────────────────────
  getPDFDocument() {
    return this.core.pdf.getActiveDocument();
  }

  getPage(pageNumber) {
    return this.core.pdf.getPage(pageNumber);
  }

  addAnnotation(pageNumber, annotation) {
    return this.core.pdf.addAnnotation(pageNumber, annotation);
  }

  modifyContent(pageNumber, callback) {
    return this.core.pdf.modifyContent(pageNumber, callback);
  }

  // ─── Events ───────────────────────────────────────────────────────────────
  onDocumentOpen(callback) {
    return this.core.events.on('document:open', callback);
  }

  onDocumentSave(callback) {
    return this.core.events.on('document:save', callback);
  }

  onPageChange(callback) {
    return this.core.events.on('page:change', callback);
  }

  onSelectionChange(callback) {
    return this.core.events.on('selection:change', callback);
  }

  emit(event, data) {
    this.eventBus.dispatchEvent(new CustomEvent(event, { detail: data }));
  }

  // ─── Storage ──────────────────────────────────────────────────────────────
  getStorage() {
    const key = `plugin:${this.manifest.id}`;
    return {
      get: (subkey) => this.core.storage.get(`${key}:${subkey}`),
      set: (subkey, value) => this.core.storage.set(`${key}:${subkey}`, value),
      remove: (subkey) => this.core.storage.remove(`${key}:${subkey}`),
      clear: () => this.core.storage.clear(key)
    };
  }

  // ─── Settings ─────────────────────────────────────────────────────────────
  registerSetting(key, config) {
    this.core.settings.register(`${this.manifest.id}.${key}`, {
      ...config,
      plugin: this.manifest.id
    });
  }

  getSetting(key) {
    return this.core.settings.get(`${this.manifest.id}.${key}`);
  }

  // ─── HTTP ─────────────────────────────────────────────────────────────────
  fetch(url, options = {}) {
    return this.core.http.request(url, {
      ...options,
      plugin: this.manifest.id
    });
  }

  // ─── Dialogs ──────────────────────────────────────────────────────────────
  showMessage(message, options = {}) {
    return this.core.dialogs.showMessage(message, options);
  }

  showInput(prompt, defaultValue = '') {
    return this.core.dialogs.showInput(prompt, defaultValue);
  }

  showFilePicker(options = {}) {
    return this.core.dialogs.showFilePicker(options);
  }
}

class PluginSDK {
  constructor(coreAPI) {
    this.core = coreAPI;
    this.plugins = new Map();
    this.manifests = new Map();
    this.api = new PluginAPI(coreAPI);
  }

  // Load and validate a plugin manifest
  async loadManifest(manifestJson) {
    const manifest = typeof manifestJson === 'string' 
      ? JSON.parse(manifestJson) 
      : manifestJson;

    const required = ['id', 'name', 'version', 'main'];
    for (const field of required) {
      if (!manifest[field]) {
        throw new Error(`Plugin manifest missing required field: ${field}`);
      }
    }

    // Validate ID format
    if (!/^[a-z0-9-]+$/i.test(manifest.id)) {
      throw new Error('Plugin ID must be alphanumeric with hyphens only');
    }

    // Check for conflicts
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} is already registered`);
    }

    return manifest;
  }

  // Register a plugin
  async register(pluginModule) {
    const manifest = await this.loadManifest(pluginModule.manifest);

    // Security: sandbox evaluation
    // Bind a per-plugin view of the API so this.manifest resolves correctly
    // (the shared PluginAPI instance has no manifest of its own).
    const api = Object.create(this.api);
    api.manifest = manifest;
    const context = new PluginContext(manifest, api);

    try {
      await pluginModule.activate(context);
      this.plugins.set(manifest.id, { manifest, context, module: pluginModule });
      this.manifests.set(manifest.id, manifest);

      console.log(`[PluginSDK] Activated: ${manifest.name} v${manifest.version}`);
      return { success: true, manifest };
    } catch (error) {
      context.dispose();
      throw new Error(`Failed to activate plugin ${manifest.id}: ${error.message}`);
    }
  }

  // Unregister a plugin
  async unregister(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    plugin.context.dispose();
    if (plugin.module.deactivate) {
      await plugin.module.deactivate();
    }

    this.plugins.delete(pluginId);
    this.manifests.delete(pluginId);
    console.log(`[PluginSDK] Deactivated: ${pluginId}`);
    return true;
  }

  // Get all active plugins
  getActivePlugins() {
    return Array.from(this.plugins.values()).map(p => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      author: p.manifest.author,
      description: p.manifest.description
    }));
  }

  // Execute a plugin command
  executeCommand(commandId, ...args) {
    return this.core.commands.execute(commandId, ...args);
  }

  // Check if plugin is active
  isActive(pluginId) {
    return this.plugins.has(pluginId);
  }

  // Get plugin manifest
  getManifest(pluginId) {
    return this.manifests.get(pluginId);
  }
}

// ─── Manifest Schema (for validation) ───────────────────────────────────────

const ManifestSchema = {
  type: 'object',
  required: ['id', 'name', 'version', 'main'],
  properties: {
    id: { type: 'string', pattern: '^[a-z0-9-]+$' },
    name: { type: 'string', minLength: 1 },
    version: { type: 'string', pattern: '^\d+\.\d+\.\d+' },
    description: { type: 'string' },
    author: { type: 'string' },
    license: { type: 'string' },
    main: { type: 'string' }, // Entry point file
    contributes: {
      type: 'object',
      properties: {
        commands: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              command: { type: 'string' },
              title: { type: 'string' },
              category: { type: 'string' },
              icon: { type: 'string' },
              keybinding: { type: 'string' }
            }
          }
        },
        panels: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              icon: { type: 'string' },
              location: { type: 'string', enum: ['sidebar', 'bottom', 'floating'] }
            }
          }
        },
        tools: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              icon: { type: 'string' },
              category: { type: 'string' }
            }
          }
        },
        settings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['string', 'number', 'boolean', 'select', 'color'] },
              default: {},
              description: { type: 'string' }
            }
          }
        }
      }
    },
    permissions: {
      type: 'array',
      items: { type: 'string', enum: ['fs', 'http', 'clipboard', 'notifications', 'pdf:write'] }
    }
  }
};

export { PluginSDK, PluginContext, PluginAPI, ManifestSchema };
export default PluginSDK;
