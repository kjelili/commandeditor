/**
 * Batch Processing Engine v2
 * Conditional rules, watch folders, and advanced workflow automation
 */

class BatchEngine {
  constructor() {
    this.rules = new Map();
    this.workflows = new Map();
    this.history = [];
    this.isRunning = false;
    this.nextId = 1;
  }

  /**
   * Create a processing rule
   */
  createRule(config) {
    const id = `rule_${this.nextId++}`;
    const rule = {
      id,
      name: config.name || `Rule ${id}`,
      enabled: config.enabled !== false,
      priority: config.priority || 0,
      conditions: config.conditions || [],
      actions: config.actions || [],
      target: config.target || { type: 'folder', path: '' },
      output: config.output || { folder: '', naming: '{original}_{timestamp}' },
      schedule: config.schedule || null,
      createdAt: new Date().toISOString(),
      runCount: 0,
      lastRun: null
    };

    this.rules.set(id, rule);
    return rule;
  }

  /**
   * Create a multi-step workflow
   */
  createWorkflow(config) {
    const id = `workflow_${this.nextId++}`;
    const workflow = {
      id,
      name: config.name || `Workflow ${id}`,
      description: config.description || '',
      steps: config.steps || [],
      enabled: config.enabled !== false,
      onError: config.onError || 'stop', // 'stop', 'skip', 'continue'
      createdAt: new Date().toISOString(),
      runCount: 0
    };

    this.workflows.set(id, workflow);
    return workflow;
  }

  /**
   * Evaluate conditions against a file
   */
  evaluateConditions(conditions, fileInfo) {
    if (!conditions.length) return true;

    return conditions.every(condition => this.evaluateCondition(condition, fileInfo));
  }

  evaluateCondition(condition, fileInfo) {
    const { field, operator, value } = condition;
    const actual = this.getFieldValue(field, fileInfo);

    switch (operator) {
      case 'equals': return actual === value;
      case 'not_equals': return actual !== value;
      case 'contains': return String(actual).includes(value);
      case 'not_contains': return !String(actual).includes(value);
      case 'starts_with': return String(actual).startsWith(value);
      case 'ends_with': return String(actual).endsWith(value);
      case 'matches': return new RegExp(value).test(String(actual));
      case 'greater_than': return Number(actual) > Number(value);
      case 'less_than': return Number(actual) < Number(value);
      case 'between': return Number(actual) >= value[0] && Number(actual) <= value[1];
      case 'in': return value.includes(actual);
      case 'not_in': return !value.includes(actual);
      case 'exists': return actual !== undefined && actual !== null;
      case 'not_exists': return actual === undefined || actual === null;
      default: return false;
    }
  }

  getFieldValue(field, fileInfo) {
    const map = {
      'filename': fileInfo.name,
      'extension': fileInfo.name?.split('.').pop()?.toLowerCase(),
      'size': fileInfo.size,
      'created': fileInfo.createdAt,
      'modified': fileInfo.modifiedAt,
      'pages': fileInfo.pageCount,
      'has_text': fileInfo.hasText,
      'is_encrypted': fileInfo.isEncrypted,
      'author': fileInfo.metadata?.author,
      'title': fileInfo.metadata?.title,
      'width': fileInfo.dimensions?.width,
      'height': fileInfo.dimensions?.height,
      'dpi': fileInfo.dpi
    };
    return map[field] ?? fileInfo[field];
  }

  /**
   * Execute actions on a file
   */
  async executeActions(actions, fileInfo, context = {}) {
    const results = [];

    for (const action of actions) {
      try {
        const result = await this.executeAction(action, fileInfo, context);
        results.push({ action: action.type, success: true, result });
      } catch (error) {
        results.push({ action: action.type, success: false, error: error.message });
        if (context.onError === 'stop') break;
      }
    }

    return results;
  }

  async executeAction(action, fileInfo, context) {
    const { type, params = {} } = action;

    switch (type) {
      case 'compress':
        return await this.actionCompress(fileInfo, params);
      case 'ocr':
        return await this.actionOCR(fileInfo, params);
      case 'convert':
        return await this.actionConvert(fileInfo, params);
      case 'watermark':
        return await this.actionWatermark(fileInfo, params);
      case 'encrypt':
        return await this.actionEncrypt(fileInfo, params);
      case 'merge':
        return await this.actionMerge(fileInfo, params, context);
      case 'split':
        return await this.actionSplit(fileInfo, params);
      case 'rotate':
        return await this.actionRotate(fileInfo, params);
      case 'extract_images':
        return await this.actionExtractImages(fileInfo, params);
      case 'extract_text':
        return await this.actionExtractText(fileInfo, params);
      case 'redact':
        return await this.actionRedact(fileInfo, params);
      case 'optimize':
        return await this.actionOptimize(fileInfo, params);
      case 'rename':
        return await this.actionRename(fileInfo, params);
      case 'move':
        return await this.actionMove(fileInfo, params);
      case 'copy':
        return await this.actionCopy(fileInfo, params);
      case 'delete':
        return await this.actionDelete(fileInfo, params);
      case 'notify':
        return await this.actionNotify(fileInfo, params);
      case 'webhook':
        return await this.actionWebhook(fileInfo, params);
      case 'custom':
        return await params.handler(fileInfo, params, context);
      default:
        throw new Error(`Unknown action type: ${type}`);
    }
  }

  // ─── Action Implementations ───────────────────────────────────────────────

  async actionCompress(fileInfo, params) {
    const { quality = 'medium', targetSize } = params;
    return { operation: 'compress', quality, targetSize };
  }

  async actionOCR(fileInfo, params) {
    const { language = 'eng', engine = 'tesseract' } = params;
    return { operation: 'ocr', language, engine };
  }

  async actionConvert(fileInfo, params) {
    const { format = 'pdf', options = {} } = params;
    return { operation: 'convert', format, options };
  }

  async actionWatermark(fileInfo, params) {
    const { text, image, position = 'center', opacity = 0.3, pages = 'all' } = params;
    return { operation: 'watermark', text, image, position, opacity, pages };
  }

  async actionEncrypt(fileInfo, params) {
    const { password, permissions = {} } = params;
    return { operation: 'encrypt', permissions };
  }

  async actionMerge(fileInfo, params, context) {
    const { withFiles = [], outputName } = params;
    return { operation: 'merge', files: [fileInfo.name, ...withFiles], outputName };
  }

  async actionSplit(fileInfo, params) {
    const { method = 'page', value } = params;
    return { operation: 'split', method, value };
  }

  async actionRotate(fileInfo, params) {
    const { angle = 90, pages = 'all' } = params;
    return { operation: 'rotate', angle, pages };
  }

  async actionExtractImages(fileInfo, params) {
    const { format = 'png', minDPI = 72 } = params;
    return { operation: 'extract_images', format, minDPI };
  }

  async actionExtractText(fileInfo, params) {
    const { format = 'txt', pages = 'all' } = params;
    return { operation: 'extract_text', format, pages };
  }

  async actionRedact(fileInfo, params) {
    const { patterns = [], manualRegions = [] } = params;
    return { operation: 'redact', patterns, manualRegions };
  }

  async actionOptimize(fileInfo, params) {
    const { profile = 'web', colorConversion } = params;
    return { operation: 'optimize', profile, colorConversion };
  }

  async actionRename(fileInfo, params) {
    const { pattern = '{original}_{date}' } = params;
    const newName = pattern
      .replace('{original}', fileInfo.name.replace(/\.[^.]+$/, ''))
      .replace('{date}', new Date().toISOString().split('T')[0])
      .replace('{time}', Date.now())
      .replace('{ext}', fileInfo.name.split('.').pop());
    return { operation: 'rename', newName };
  }

  async actionMove(fileInfo, params) {
    const { destination } = params;
    return { operation: 'move', destination };
  }

  async actionCopy(fileInfo, params) {
    const { destination } = params;
    return { operation: 'copy', destination };
  }

  async actionDelete(fileInfo, params) {
    const { confirm = true } = params;
    return { operation: 'delete', confirmed: confirm };
  }

  async actionNotify(fileInfo, params) {
    const { message, title = 'Batch Processing' } = params;
    return { operation: 'notify', title, message };
  }

  async actionWebhook(fileInfo, params) {
    const { url, method = 'POST', headers = {}, body } = params;
    return { operation: 'webhook', url, method, headers };
  }

  /**
   * Run a single rule against files
   */
  async runRule(ruleId, files) {
    const rule = this.rules.get(ruleId);
    if (!rule) throw new Error(`Rule ${ruleId} not found`);
    if (!rule.enabled) return { skipped: true, reason: 'Rule disabled' };

    const results = [];

    for (const file of files) {
      const matches = this.evaluateConditions(rule.conditions, file);

      if (matches) {
        const actionResults = await this.executeActions(rule.actions, file, {
          onError: rule.onError || 'stop',
          output: rule.output
        });

        results.push({
          file: file.name,
          matched: true,
          actions: actionResults
        });
      } else {
        results.push({
          file: file.name,
          matched: false,
          actions: []
        });
      }
    }

    rule.runCount++;
    rule.lastRun = new Date().toISOString();

    this.history.push({
      type: 'rule',
      id: ruleId,
      timestamp: new Date().toISOString(),
      filesProcessed: files.length,
      results
    });

    return { rule: rule.name, processed: files.length, results };
  }

  /**
   * Run a workflow
   */
  async runWorkflow(workflowId, inputFiles) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    const results = [];
    let currentFiles = [...inputFiles];

    for (const step of workflow.steps) {
      const stepResults = [];

      for (const file of currentFiles) {
        try {
          if (step.conditions && !this.evaluateConditions(step.conditions, file)) {
            stepResults.push({ file: file.name, skipped: true });
            continue;
          }

          const actionResults = await this.executeActions(step.actions, file, {
            onError: workflow.onError,
            workflowStep: step.name
          });

          stepResults.push({
            file: file.name,
            step: step.name,
            results: actionResults
          });
        } catch (error) {
          stepResults.push({
            file: file.name,
            step: step.name,
            error: error.message
          });

          if (workflow.onError === 'stop') break;
        }
      }

      results.push({ step: step.name, results: stepResults });
    }

    workflow.runCount++;

    this.history.push({
      type: 'workflow',
      id: workflowId,
      timestamp: new Date().toISOString(),
      inputFiles: inputFiles.length,
      results
    });

    return { workflow: workflow.name, steps: workflow.steps.length, results };
  }

  /**
   * Watch folder simulation (in production, use native file watchers)
   */
  async watchFolder(folderPath, ruleIds, options = {}) {
    const { interval = 5000, recursive = false } = options;

    // In production, this would use:
    // - Node.js: chokidar
    // - Tauri: notify crate
    // - Browser: Not applicable (would need backend)

    return {
      folderPath,
      ruleIds,
      interval,
      recursive,
      status: 'watching',
      note: 'In production, integrate with native file system watchers'
    };
  }

  /**
   * Get processing history
   */
  getHistory(filters = {}) {
    let filtered = [...this.history];

    if (filters.type) {
      filtered = filtered.filter(h => h.type === filters.type);
    }
    if (filters.since) {
      filtered = filtered.filter(h => h.timestamp >= filters.since);
    }
    if (filters.limit) {
      filtered = filtered.slice(-filters.limit);
    }

    return filtered;
  }

  /**
   * Export rules and workflows
   */
  exportConfig() {
    return {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      rules: Array.from(this.rules.values()),
      workflows: Array.from(this.workflows.values())
    };
  }

  /**
   * Import rules and workflows
   */
  importConfig(config) {
    if (config.rules) {
      for (const rule of config.rules) {
        this.rules.set(rule.id, rule);
      }
    }
    if (config.workflows) {
      for (const workflow of config.workflows) {
        this.workflows.set(workflow.id, workflow);
      }
    }
    return { rulesImported: config.rules?.length || 0, workflowsImported: config.workflows?.length || 0 };
  }
}

export { BatchEngine };
export default BatchEngine;
