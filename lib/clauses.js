/**
 * Legal Contract Clause Extractor
 * Pattern-based extraction of common legal provisions
 */
class ContractClauseExtractor {
  constructor() {
    this.clauseTypes = {
      termination: {
        patterns: [
          /(?:termination|terminate)[\s\S]{0,200}(?:notice|period|days|immediately|for cause|without cause)/i,
          /(?:may|shall|must)\s+(?:terminate|end|cancel)[\s\S]{0,150}(?:upon|with|by giving|effective)/i
        ],
        keywords: ['termination', 'terminate', 'expiration', 'renewal', 'cancel'],
        importance: 'high'
      },
      indemnification: {
        patterns: [
          /indemnif(?:y|ication)[\s\S]{0,300}(?:hold harmless|defend|losses|damages|claims)/i,
          /(?:shall|will)\s+indemnify[\s\S]{0,200}(?:against|from|for)/i
        ],
        keywords: ['indemnify', 'indemnification', 'hold harmless', 'defend'],
        importance: 'critical'
      },
      liability: {
        patterns: [
          /liability[\s\S]{0,250}(?:limit|cap|aggregate|consequential|indirect|damages)/i,
          /(?:not\s+)?liable\s+for[\s\S]{0,200}(?:damages|loss|consequential|incidental)/i
        ],
        keywords: ['liability', 'limitation', 'cap', 'consequential', 'damages'],
        importance: 'critical'
      },
      governing_law: {
        patterns: [
          /governed\s+by[\s\S]{0,100}(?:laws?\s+of|jurisdiction)/i,
          /(?:governing\s+law|choice\s+of\s+law)[\s\S]{0,150}(?:state|commonwealth|laws)/i
        ],
        keywords: ['governing law', 'jurisdiction', 'venue', 'arbitration'],
        importance: 'high'
      },
      confidentiality: {
        patterns: [
          /confidential[\s\S]{0,300}(?:disclose|disclosure|proprietary|trade secret)/i,
          /(?:non-disclosure|nda|confidentiality)[\s\S]{0,200}(?:agreement|obligation)/i
        ],
        keywords: ['confidential', 'non-disclosure', 'proprietary', 'trade secret'],
        importance: 'high'
      },
      payment: {
        patterns: [
          /(?:payment|payable|fee|compensation)[\s\S]{0,200}(?:amount|schedule|terms|net|days)/i,
          /(?:invoic|bill)[\s\S]{0,150}(?:days|upon|receipt|monthly|annually)/i
        ],
        keywords: ['payment', 'fee', 'compensation', 'invoice', 'remuneration'],
        importance: 'high'
      },
      ip_assignment: {
        patterns: [
          /(?:intellectual\s+property|ip|work\s+product)[\s\S]{0,300}(?:assign|transfer|own|retain)/i,
          /(?:hereby\s+)?assign[\s\S]{0,200}(?:all\s+right|title|interest)/i
        ],
        keywords: ['intellectual property', 'assignment', 'work for hire', 'moral rights'],
        importance: 'critical'
      },
      non_compete: {
        patterns: [
          /(?:non-compete|noncompete|competition)[\s\S]{0,250}(?:restrict|period|territory|industry)/i,
          /(?:shall\s+not|agrees\s+not\s+to)[\s\S]{0,200}(?:compete|competing|solicit)/i
        ],
        keywords: ['non-compete', 'solicit', 'restriction', 'covenant'],
        importance: 'medium'
      },
      force_majeure: {
        patterns: [
          /force\s+majeure[\s\S]{0,300}(?:beyond|control|act\s+of\s+god|pandemic|war|strike)/i
        ],
        keywords: ['force majeure', 'act of god', 'unforeseen', 'excuse'],
        importance: 'medium'
      },
      warranty: {
        patterns: [
          /warrant(?:y|ies)[\s\S]{0,250}(?:represent|merchantable|fitness|as is|disclaim)/i,
          /(?:disclaim|exclude)[\s\S]{0,150}(?:warranty|warranties|representations)/i
        ],
        keywords: ['warranty', 'disclaimer', 'as is', 'represent'],
        importance: 'high'
      }
    };
  }

  async extract(document) {
    const fullText = await this.extractText(document);
    const clauses = [];

    for (const [type, config] of Object.entries(this.clauseTypes)) {
      const matches = this.findClauses(fullText, type, config);
      clauses.push(...matches);
    }

    return {
      documentType: 'contract',
      clauses: clauses.sort((a, b) => this.importanceScore(b.importance) - this.importanceScore(a.importance)),
      summary: this.generateSummary(clauses),
      riskFlags: this.identifyRisks(clauses)
    };
  }

  findClauses(text, type, config) {
    const found = [];
    const seen = new Set();

    for (const pattern of config.patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const excerpt = match[0];
        const key = `${type}_${excerpt.slice(0, 50)}`;

        if (seen.has(key)) continue;
        seen.add(key);

        found.push({
          id: `clause_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          type,
          title: this.formatTitle(type),
          excerpt: this.sanitizeExcerpt(excerpt),
          position: match.index,
          importance: config.importance,
          keywordsFound: config.keywords.filter(k => excerpt.toLowerCase().includes(k)),
          wordCount: excerpt.split(/\s+/).length
        });
      }
      pattern.lastIndex = 0;
    }

    return found;
  }

  identifyRisks(clauses) {
    const risks = [];
    const hasClause = (type) => clauses.some(c => c.type === type);

    if (!hasClause('liability')) {
      risks.push({ severity: 'high', message: 'No liability limitation clause detected' });
    }
    if (!hasClause('termination')) {
      risks.push({ severity: 'medium', message: 'No termination clause clearly identified' });
    }
    if (!hasClause('governing_law')) {
      risks.push({ severity: 'medium', message: 'Governing law not specified' });
    }

    const liability = clauses.find(c => c.type === 'liability');
    if (liability && !liability.excerpt.match(/mutual|reciprocal|both\s+parties/i)) {
      risks.push({ severity: 'medium', message: 'Liability clause may be one-sided' });
    }

    return risks;
  }

  generateSummary(clauses) {
    const byType = {};
    for (const c of clauses) {
      byType[c.type] = (byType[c.type] || 0) + 1;
    }

    return {
      totalClauses: clauses.length,
      uniqueTypes: Object.keys(byType).length,
      byType,
      criticalClauses: clauses.filter(c => c.importance === 'critical').length,
      highClauses: clauses.filter(c => c.importance === 'high').length
    };
  }

  formatTitle(type) {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  sanitizeExcerpt(text) {
    return text.replace(/\s+/g, ' ').trim().slice(0, 500);
  }

  importanceScore(level) {
    return { critical: 3, high: 2, medium: 1, low: 0 }[level] || 0;
  }

  async extractText(document) {
    let text = '';
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n\n';
    }
    return text;
  }

  exportToReport(extraction) {
    let report = `# Contract Analysis Report\n\n`;
    report += `Generated: ${new Date().toLocaleString()}\n`;
    report += `Total Clauses: ${extraction.summary.totalClauses}\n`;
    report += `Critical Clauses: ${extraction.summary.criticalClauses}\n\n`;

    report += `## Risk Flags\n`;
    for (const risk of extraction.riskFlags) {
      report += `- [${risk.severity.toUpperCase()}] ${risk.message}\n`;
    }
    report += `\n`;

    report += `## Extracted Clauses\n`;
    for (const clause of extraction.clauses) {
      report += `### ${clause.title} (${clause.importance})\n`;
      report += `> ${clause.excerpt}\n\n`;
    }

    return report;
  }
}

export { ContractClauseExtractor };
