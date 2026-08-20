/**
 * Print-to-PDF Virtual Driver
 * Intercepts print jobs and converts to PDF
 */
class PrintToPDF {
  constructor() {
    this.templates = new Map();
    this.registerDefaultTemplates();
  }

  registerDefaultTemplates() {
    this.templates.set('default', {
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 72, right: 72, bottom: 72, left: 72 },
      header: null,
      footer: null
    });

    this.templates.set('receipt', {
      pageSize: [226.77, 841.89],
      orientation: 'portrait',
      margins: { top: 18, right: 18, bottom: 18, left: 18 }
    });

    this.templates.set('label', {
      pageSize: [198.42, 283.46],
      orientation: 'portrait',
      margins: { top: 9, right: 9, bottom: 9, left: 9 }
    });
  }

  async fromHTML(html, options = {}) {
    const template = this.templates.get(options.template || 'default');

    // Sanitize/escape everything interpolated into the (same-origin) print
    // window so document-derived content can't inject executable HTML/CSS.
    const DOMPurify = (await import('dompurify')).default;
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const cssSafe = (v) => String(v == null ? '' : v).replace(/<\/?(style|script)/gi, '');
    const safeTitle = esc(options.title || 'Document');
    const safeHtml = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    const safeFontFamily = cssSafe(options.fontFamily || 'system-ui, -apple-system, sans-serif');
    const safeFontSize = cssSafe(options.fontSize || '12pt');
    const safeCustomCSS = cssSafe(options.customCSS || '');

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${safeTitle}</title>
        <style>
          @page {
            size: ${template.pageSize === 'A4' ? 'A4' : `${template.pageSize[0]}pt ${template.pageSize[1]}pt`} 
                   ${template.orientation};
            margin: ${template.margins.top}pt ${template.margins.right}pt 
                    ${template.margins.bottom}pt ${template.margins.left}pt;
          }
          body {
            font-family: ${safeFontFamily};
            font-size: ${safeFontSize};
            line-height: 1.5;
            color: #1a1a1a;
          }
          ${safeCustomCSS}
        </style>
      </head>
      <body>${safeHtml}</body>
      </html>
    `);
    printWindow.document.close();

    await new Promise(resolve => setTimeout(resolve, 500));
    printWindow.print();

    return { method: 'print_dialog', pages: 'unknown' };
  }

  async fromElement(element, options = {}) {
    if (typeof element === 'string') {
      element = document.querySelector(element);
    }
    const clone = element.cloneNode(true);
    clone.querySelectorAll('script, video, audio, .no-print').forEach(el => el.remove());
    return this.fromHTML(clone.outerHTML, options);
  }

  async mergeHTML(sources, options = {}) {
    const combined = sources.map((src, idx) => `
      <div class="print-section" data-index="${idx}">
        ${src.html || src}
      </div>
      ${idx < sources.length - 1 ? '<div class="page-break"></div>' : ''}
    `).join('');

    const css = `
      .page-break { page-break-after: always; }
      .print-section { page-break-inside: avoid; }
    `;
    return this.fromHTML(combined, { ...options, customCSS: css });
  }

  async fromImages(images, options = {}) {
    const template = this.templates.get(options.template || 'default');
    const pages = images.map(src => `
      <div style="page-break-after: always; display: flex; align-items: center; justify-content: center; height: 100vh;">
        <img src="${src}" style="max-width: 100%; max-height: 100%; object-fit: contain;">
      </div>
    `).join('');
    return this.fromHTML(pages, options);
  }

  registerTemplate(name, config) {
    this.templates.set(name, config);
  }

  async printNative(documentPath, options = {}) {
    return {
      method: 'native_print',
      documentPath,
      printer: options.printer || 'default',
      status: 'queued'
    };
  }
}

export { PrintToPDF };
