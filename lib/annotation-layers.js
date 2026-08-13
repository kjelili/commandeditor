/**
 * Annotation Layers System
 * Multiple independent annotation sets per document
 * Supports layer visibility, locking, filtering, and merging
 */

class AnnotationLayerManager {
  constructor(documentId) {
    this.documentId = documentId;
    this.layers = new Map();
    this.activeLayerId = null;
    this.globalVisibility = true;
    this.nextLayerId = 1;

    // Create default layer
    this.createLayer('Default', { color: '#3b82f6', locked: false });
  }

  /**
   * Create a new annotation layer
   */
  createLayer(name, options = {}) {
    const id = `layer_${this.nextLayerId++}`;
    const layer = {
      id,
      name,
      color: options.color || this.generateColor(),
      locked: options.locked || false,
      visible: options.visible !== false,
      createdAt: new Date().toISOString(),
      author: options.author || 'Anonymous',
      annotations: [],
      metadata: options.metadata || {}
    };

    this.layers.set(id, layer);
    if (!this.activeLayerId) {
      this.activeLayerId = id;
    }

    this.emit('layer:created', { layer });
    return layer;
  }

  /**
   * Delete a layer and all its annotations
   */
  deleteLayer(layerId) {
    const layer = this.layers.get(layerId);
    if (!layer) return false;
    if (layer.locked) throw new Error(`Layer "${layer.name}" is locked`);

    this.layers.delete(layerId);

    if (this.activeLayerId === layerId) {
      this.activeLayerId = this.layers.keys().next().value || null;
    }

    this.emit('layer:deleted', { layerId, layer });
    return true;
  }

  /**
   * Rename a layer
   */
  renameLayer(layerId, newName) {
    const layer = this.layers.get(layerId);
    if (!layer) return false;
    if (layer.locked) throw new Error(`Layer "${layer.name}" is locked`);

    const oldName = layer.name;
    layer.name = newName;

    this.emit('layer:renamed', { layerId, oldName, newName });
    return true;
  }

  /**
   * Toggle layer visibility
   */
  toggleVisibility(layerId) {
    const layer = this.layers.get(layerId);
    if (!layer) return false;

    layer.visible = !layer.visible;
    this.emit('layer:visibility', { layerId, visible: layer.visible });
    return true;
  }

  /**
   * Toggle layer lock
   */
  toggleLock(layerId) {
    const layer = this.layers.get(layerId);
    if (!layer) return false;

    layer.locked = !layer.locked;
    this.emit('layer:lock', { layerId, locked: layer.locked });
    return true;
  }

  /**
   * Set active layer for new annotations
   */
  setActiveLayer(layerId) {
    if (!this.layers.has(layerId)) {
      throw new Error(`Layer ${layerId} not found`);
    }
    const layer = this.layers.get(layerId);
    if (layer.locked) {
      throw new Error(`Cannot activate locked layer "${layer.name}"`);
    }

    this.activeLayerId = layerId;
    this.emit('layer:active', { layerId, layer });
    return layer;
  }

  /**
   * Add annotation to active layer
   */
  addAnnotation(annotation) {
    if (!this.activeLayerId) {
      throw new Error('No active layer');
    }

    const layer = this.layers.get(this.activeLayerId);
    if (layer.locked) {
      throw new Error(`Cannot add to locked layer "${layer.name}"`);
    }

    const enrichedAnnotation = {
      id: `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      layerId: this.activeLayerId,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      page: annotation.page || 1,
      type: annotation.type, // 'highlight', 'underline', 'strikeout', 'squiggly', 'caret', 'ink', 'stamp', 'file', 'sound', 'line', 'square', 'circle', 'polygon', 'polyline', 'freetext'
      rect: annotation.rect, // [x1, y1, x2, y2]
      color: annotation.color || layer.color,
      opacity: annotation.opacity || 1.0,
      contents: annotation.contents || '',
      author: annotation.author || layer.author,
      flags: annotation.flags || {},
      popup: annotation.popup || null,
      replies: [],
      ...annotation
    };

    layer.annotations.push(enrichedAnnotation);
    this.emit('annotation:added', { annotation: enrichedAnnotation, layer });

    return enrichedAnnotation;
  }

  /**
   * Update an annotation
   */
  updateAnnotation(annotationId, updates) {
    for (const layer of this.layers.values()) {
      const idx = layer.annotations.findIndex(a => a.id === annotationId);
      if (idx !== -1) {
        if (layer.locked) {
          throw new Error(`Cannot modify locked layer "${layer.name}"`);
        }

        const annotation = layer.annotations[idx];
        Object.assign(annotation, updates, { modifiedAt: new Date().toISOString() });

        this.emit('annotation:updated', { annotation, layer });
        return annotation;
      }
    }
    return null;
  }

  /**
   * Delete an annotation
   */
  deleteAnnotation(annotationId) {
    for (const layer of this.layers.values()) {
      const idx = layer.annotations.findIndex(a => a.id === annotationId);
      if (idx !== -1) {
        if (layer.locked) {
          throw new Error(`Cannot delete from locked layer "${layer.name}"`);
        }

        const annotation = layer.annotations.splice(idx, 1)[0];
        this.emit('annotation:deleted', { annotation, layer });
        return annotation;
      }
    }
    return null;
  }

  /**
   * Add reply to annotation
   */
  addReply(annotationId, text, author = 'Anonymous') {
    const annotation = this.findAnnotation(annotationId);
    if (!annotation) return null;

    const reply = {
      id: `reply_${Date.now()}`,
      text,
      author,
      createdAt: new Date().toISOString()
    };

    annotation.replies.push(reply);
    this.emit('annotation:reply', { annotation, reply });
    return reply;
  }

  /**
   * Get all visible annotations for a page
   */
  getVisibleAnnotations(pageNumber) {
    if (!this.globalVisibility) return [];

    const visible = [];
    for (const layer of this.layers.values()) {
      if (layer.visible) {
        visible.push(...layer.annotations.filter(a => a.page === pageNumber));
      }
    }
    return visible.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Get annotations filtered by criteria
   */
  filterAnnotations(filters = {}) {
    const results = [];

    for (const layer of this.layers.values()) {
      if (filters.layerId && layer.id !== filters.layerId) continue;
      if (filters.visibleOnly && !layer.visible) continue;

      for (const annotation of layer.annotations) {
        if (filters.type && annotation.type !== filters.type) continue;
        if (filters.author && annotation.author !== filters.author) continue;
        if (filters.page && annotation.page !== filters.page) continue;
        if (filters.dateFrom && annotation.createdAt < filters.dateFrom) continue;
        if (filters.dateTo && annotation.createdAt > filters.dateTo) continue;
        if (filters.searchText && !annotation.contents?.toLowerCase().includes(filters.searchText.toLowerCase())) continue;

        results.push({ ...annotation, layerName: layer.name, layerColor: layer.color });
      }
    }

    return results;
  }

  /**
   * Merge layers into a single layer
   */
  mergeLayers(targetLayerId, sourceLayerIds, options = {}) {
    const target = this.layers.get(targetLayerId);
    if (!target) throw new Error('Target layer not found');
    if (target.locked) throw new Error('Target layer is locked');

    for (const sourceId of sourceLayerIds) {
      if (sourceId === targetLayerId) continue;

      const source = this.layers.get(sourceId);
      if (!source) continue;
      if (source.locked && !options.force) continue;

      for (const annotation of source.annotations) {
        target.annotations.push({
          ...annotation,
          id: `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          layerId: targetLayerId,
          color: options.preserveColors ? annotation.color : target.color
        });
      }

      if (options.deleteSource) {
        this.layers.delete(sourceId);
      }
    }

    this.emit('layer:merged', { targetLayerId, sourceLayerIds });
    return target;
  }

  /**
   * Export layer to PDF annotations
   */
  exportLayer(layerId, format = 'json') {
    const layer = this.layers.get(layerId);
    if (!layer) return null;

    switch (format) {
      case 'json':
        return JSON.stringify(layer, null, 2);
      case 'fdf':
        return this.toFDF(layer);
      case 'xfdf':
        return this.toXFDF(layer);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Import annotations from external format
   */
  importAnnotations(data, format = 'json', targetLayerId = null) {
    const layerId = targetLayerId || this.activeLayerId;
    const layer = this.layers.get(layerId);
    if (!layer) throw new Error('Target layer not found');
    if (layer.locked) throw new Error('Target layer is locked');

    let annotations = [];

    switch (format) {
      case 'json':
        annotations = typeof data === 'string' ? JSON.parse(data) : data;
        break;
      case 'xfdf':
        annotations = this.fromXFDF(data);
        break;
      default:
        throw new Error(`Unsupported import format: ${format}`);
    }

    for (const annotation of annotations) {
      annotation.layerId = layerId;
      layer.annotations.push(annotation);
    }

    this.emit('layer:imported', { layerId, count: annotations.length });
    return annotations.length;
  }

  /**
   * Get layer statistics
   */
  getStats() {
    const stats = {
      totalLayers: this.layers.size,
      totalAnnotations: 0,
      annotationsByType: {},
      annotationsByLayer: {},
      annotationsByPage: {}
    };

    for (const layer of this.layers.values()) {
      stats.annotationsByLayer[layer.name] = layer.annotations.length;

      for (const annotation of layer.annotations) {
        stats.totalAnnotations++;
        stats.annotationsByType[annotation.type] = (stats.annotationsByType[annotation.type] || 0) + 1;
        stats.annotationsByPage[annotation.page] = (stats.annotationsByPage[annotation.page] || 0) + 1;
      }
    }

    return stats;
  }

  // ─── Internal Helpers ─────────────────────────────────────────────────────

  findAnnotation(annotationId) {
    for (const layer of this.layers.values()) {
      const annotation = layer.annotations.find(a => a.id === annotationId);
      if (annotation) return annotation;
    }
    return null;
  }

  generateColor() {
    const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', 
                    '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  toFDF(layer) {
    // Simplified FDF generation
    let fdf = `%FDF-1.2
1 0 obj
<< /FDF << /Annots [`;
    for (const ann of layer.annotations) {
      fdf += `<< /Type /Annot /Subtype /${ann.type} /Rect [${ann.rect.join(' ')}] /Contents (${ann.contents}) >> `;
    }
    fdf += `] >> >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF`;
    return fdf;
  }

  toXFDF(layer) {
    let xfdf = `<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">
<annots>`;
    for (const ann of layer.annotations) {
      xfdf += `
  <${ann.type} page="${ann.page}" rect="${ann.rect.join(',')}" color="${ann.color}" title="${ann.author}" date="${ann.createdAt}">`;
      xfdf += `
    <contents>${ann.contents}</contents>`;
      xfdf += `
  </${ann.type}>`;
    }
    xfdf += `
</annots>
</xfdf>`;
    return xfdf;
  }

  fromXFDF(xfdfString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xfdfString, 'application/xml');
    const annots = [];

    for (const node of doc.querySelectorAll('annots > *')) {
      annots.push({
        type: node.tagName,
        page: parseInt(node.getAttribute('page')),
        rect: node.getAttribute('rect').split(',').map(Number),
        color: node.getAttribute('color'),
        author: node.getAttribute('title'),
        createdAt: node.getAttribute('date'),
        contents: node.querySelector('contents')?.textContent || ''
      });
    }

    return annots;
  }

  emit(event, data) {
    // In production, integrate with event bus
    console.log(`[AnnotationLayers] ${event}`, data);
  }

  /**
   * Serialize entire manager state
   */
  serialize() {
    return {
      documentId: this.documentId,
      activeLayerId: this.activeLayerId,
      globalVisibility: this.globalVisibility,
      layers: Array.from(this.layers.entries())
    };
  }

  /**
   * Restore from serialized state
   */
  static deserialize(data) {
    const manager = new AnnotationLayerManager(data.documentId);
    manager.layers = new Map(data.layers);
    manager.activeLayerId = data.activeLayerId;
    manager.globalVisibility = data.globalVisibility;
    return manager;
  }
}

export { AnnotationLayerManager };
export default AnnotationLayerManager;
