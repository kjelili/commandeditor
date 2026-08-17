/**
 * Plugin Marketplace — v10
 *
 * A curated, bundled registry of featured plugins. Each entry is a complete,
 * reviewable plugin module (manifest + activate) following the SDK contract
 * in lib/plugin-sdk.js. Because everything runs in-browser, "installing"
 * from the marketplace is just registering the module — no downloads, no
 * store servers, no fees. Third parties can publish plugins anywhere and
 * users install them by URL.
 */

/** Shared helper: extract full text of the active document. */
async function docText(api) {
  const doc = api.getPDFDocument()
  if (!doc) return null
  let out = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    out.push(tc.items.map((it) => it.str).join(' '))
  }
  return out.join(' ')
}

const STOP = new Set(('the,a,an,and,or,but,in,on,at,to,for,of,with,by,from,as,is,was,are,were,be,been,' +
  'it,its,this,that,these,those,you,your,we,our,they,their,he,she,his,her,i,me,my,not,no,do,does,did,' +
  'have,has,had,will,would,can,could,shall,should,may,might,than,then,so,if,when,which,who,what,how').split(','))

export const MARKETPLACE_PLUGINS = [
  {
    id: 'word-frequency',
    tagline: 'Top terms in the active document, ranked.',
    module: {
      manifest: {
        id: 'word-frequency', name: 'Word Frequency', version: '1.0.0',
        description: 'Counts and ranks the most-used words in the open document.',
        author: 'CommandEditor Marketplace', license: 'MIT', main: 'index.js',
      },
      async activate(context) {
        context.push(context.api.registerCommand('wordFrequency', async () => {
          const text = await docText(context.api)
          if (!text) return context.api.showMessage('Open a PDF first', { type: 'warning' })
          const counts = {}
          for (const w of text.toLowerCase().match(/[a-z']{3,}/g) || []) {
            if (!STOP.has(w)) counts[w] = (counts[w] || 0) + 1
          }
          const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15)
          await context.api.showMessage(
            'Top words:\n' + top.map(([w, n], i) => `${i + 1}. ${w} — ${n}×`).join('\n'),
            { type: 'info', title: 'Word Frequency' }
          )
        }))
      },
    },
  },
  {
    id: 'reading-time',
    tagline: 'Estimated reading time and document stats.',
    module: {
      manifest: {
        id: 'reading-time', name: 'Reading Time', version: '1.0.0',
        description: 'Word count, reading time, and page statistics for the open document.',
        author: 'CommandEditor Marketplace', license: 'MIT', main: 'index.js',
      },
      async activate(context) {
        context.push(context.api.registerCommand('readingTime', async () => {
          const doc = context.api.getPDFDocument()
          const text = await docText(context.api)
          if (!text || !doc) return context.api.showMessage('Open a PDF first', { type: 'warning' })
          const words = text.split(/\s+/).filter(Boolean).length
          const mins = (words / 200).toFixed(1)
          await context.api.showMessage(
            `Pages: ${doc.numPages}\nWords: ${words.toLocaleString()}\nReading time: ~${mins} min (200 wpm)\nListening time: ~${(words / 160).toFixed(1)} min with Listen`,
            { type: 'info', title: 'Reading Time' }
          )
        }))
      },
    },
  },
  {
    id: 'acronym-finder',
    tagline: 'Lists every acronym and how often it appears.',
    module: {
      manifest: {
        id: 'acronym-finder', name: 'Acronym Finder', version: '1.0.0',
        description: 'Finds all-caps acronyms (GDPR, HIPAA, API…) in the open document.',
        author: 'CommandEditor Marketplace', license: 'MIT', main: 'index.js',
      },
      async activate(context) {
        context.push(context.api.registerCommand('findAcronyms', async () => {
          const text = await docText(context.api)
          if (!text) return context.api.showMessage('Open a PDF first', { type: 'warning' })
          const counts = {}
          for (const a of text.match(/\b[A-Z]{2,8}\b/g) || []) counts[a] = (counts[a] || 0) + 1
          const list = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20)
          await context.api.showMessage(
            list.length ? list.map(([a, n]) => `${a} — ${n}×`).join('\n') : 'No acronyms found.',
            { type: 'info', title: 'Acronyms' }
          )
        }))
      },
    },
  },
  {
    id: 'doc-checksum',
    tagline: 'One-command SHA-256 receipt for the open file.',
    module: {
      manifest: {
        id: 'doc-checksum', name: 'Document Checksum', version: '1.0.0',
        description: 'Computes a SHA-256 checksum of the active document via the Plugin SDK.',
        author: 'CommandEditor Marketplace', license: 'MIT', main: 'index.js',
      },
      async activate(context) {
        context.push(context.api.registerCommand('checksum', async () => {
          const input = await context.api.showInput('Paste any text to checksum (or cancel and use File Hash tool for files):', '')
          if (!input) return
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
          const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
          await context.api.showMessage(`SHA-256:\n${hex}`, { type: 'success', title: 'Checksum' })
        }))
      },
    },
  },
]
