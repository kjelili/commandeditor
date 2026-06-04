'use client'

const NEXT_STEP_MAP: Record<string, Array<{ tool: string; label: string; emoji: string }>> = {
  // v6 new tools
  readability:   [{ tool: 'spellcheck', label: 'Spell Check', emoji: '✓' }, { tool: 'toneanalyse', label: 'Analyse Tone', emoji: '🎭' }, { tool: 'podcastscript', label: 'Podcast Script', emoji: '🎙' }],
  piiscan:       [{ tool: 'redact', label: 'Redact Findings', emoji: '⬛' }, { tool: 'tamperseal', label: 'Tamper Seal', emoji: '🔏' }],
  spellcheck:    [{ tool: 'readability', label: 'Readability Score', emoji: '📖' }, { tool: 'toneanalyse', label: 'Tone Analysis', emoji: '🎭' }],
  toneanalyse:   [{ tool: 'readability', label: 'Readability', emoji: '📖' }, { tool: 'citations', label: 'Extract Citations', emoji: '📚' }],
  citations:     [{ tool: 'ankideck', label: 'Make Anki Deck', emoji: '🧠' }, { tool: 'bookmarks', label: 'Add Bookmarks', emoji: '🔖' }],
  timeline:      [{ tool: 'toneanalyse', label: 'Tone Analysis', emoji: '🎭' }, { tool: 'piiscan', label: 'PII Scan', emoji: '🕵️' }],
  langdetect:    [{ tool: 'readability', label: 'Readability', emoji: '📖' }, { tool: 'podcastscript', label: 'Podcast Script', emoji: '🎙' }],
  flashcards:    [{ tool: 'ankideck', label: 'Anki Deck', emoji: '🧠' }, { tool: 'compress', label: 'Compress', emoji: '◎' }],
  ankideck:      [{ tool: 'flashcards', label: 'View Flashcards', emoji: '🃏' }, { tool: 'compress', label: 'Compress', emoji: '◎' }],
  tamperseal:    [{ tool: 'hashcheck', label: 'File Hash', emoji: '🔑' }, { tool: 'aesencrypt', label: 'Encrypt', emoji: '🛡' }],
  preflight:     [{ tool: 'fontinspect', label: 'Font Inspector', emoji: 'Aa' }, { tool: 'compress', label: 'Compress', emoji: '◎' }],
  fontinspect:   [{ tool: 'preflight', label: 'Print Preflight', emoji: '🖨' }, { tool: 'flatten', label: 'Flatten', emoji: '⊟' }],
  inkestimate:   [{ tool: 'grayscale', label: 'Convert Grayscale', emoji: '⬜' }, { tool: 'compress', label: 'Compress', emoji: '◎' }],
  semanticgroup: [{ tool: 'split', label: 'Split PDF', emoji: '✂' }, { tool: 'bookmarks', label: 'Add Bookmarks', emoji: '🔖' }],
  autocrop:      [{ tool: 'compress', label: 'Compress', emoji: '◎' }, { tool: 'tilePrint', label: 'Poster Print', emoji: '🖼' }],
  normalizesize: [{ tool: 'compress', label: 'Compress', emoji: '◎' }, { tool: 'merge', label: 'Merge', emoji: '⊕' }],
  emailhtml:     [{ tool: 'compress', label: 'Compress Original', emoji: '◎' }],
  podcastscript: [{ tool: 'readability', label: 'Readability', emoji: '📖' }, { tool: 'spellcheck', label: 'Spell Check', emoji: '✓' }],
  pdfcompare:    [{ tool: 'merge', label: 'Merge PDFs', emoji: '⊕' }, { tool: 'tamperseal', label: 'Tamper Seal', emoji: '🔏' }],
  macro:         [{ tool: 'batchrules', label: 'Batch Rules', emoji: '⚙️' }],
  batchrules:    [{ tool: 'macro', label: 'Record Macro', emoji: '⏺' }],
  microannot:    [{ tool: 'flatten', label: 'Flatten', emoji: '⊟' }, { tool: 'hashcheck', label: 'Verify Hash', emoji: '🔑' }],
  present:       [{ tool: 'compress', label: 'Compress', emoji: '◎' }, { tool: 'topptx', label: 'To PowerPoint', emoji: '📊' }],
  tilePrint:     [{ tool: 'compress', label: 'Compress', emoji: '◎' }],
  tojson:        [{ tool: 'toexcel', label: 'To Excel/CSV', emoji: '📊' }],
  compress:   [{ tool: 'watermark', label: 'Add watermark', emoji: '💧' }, { tool: 'aesencrypt', label: 'Encrypt', emoji: '🛡' }, { tool: 'headfoot', label: 'Add header', emoji: '📑' }],
  merge:      [{ tool: 'pagenum',   label: 'Add page numbers', emoji: '🔢' }, { tool: 'watermark', label: 'Watermark', emoji: '💧' }, { tool: 'compress', label: 'Compress', emoji: '◎' }],
  split:      [{ tool: 'compress',  label: 'Compress each', emoji: '◎' }, { tool: 'convert', label: 'Export as images', emoji: '⤓' }],
  sign:       [{ tool: 'aesencrypt', label: 'Encrypt', emoji: '🛡' }, { tool: 'flatten', label: 'Flatten PDF', emoji: '⊟' }],
  watermark:  [{ tool: 'compress',  label: 'Compress', emoji: '◎' }, { tool: 'aesencrypt', label: 'Encrypt', emoji: '🛡' }],
  rotate:     [{ tool: 'compress',  label: 'Compress', emoji: '◎' }, { tool: 'pagenum', label: 'Add page numbers', emoji: '🔢' }],
  pagenum:    [{ tool: 'watermark', label: 'Watermark', emoji: '💧' }, { tool: 'headfoot', label: 'Header/Footer', emoji: '📑' }],
  headfoot:   [{ tool: 'pagenum',   label: 'Page numbers', emoji: '🔢' }, { tool: 'watermark', label: 'Watermark', emoji: '💧' }],
  flatten:    [{ tool: 'compress',  label: 'Compress', emoji: '◎' }, { tool: 'hashcheck', label: 'Verify hash', emoji: '🔑' }],
  ocr:        [{ tool: 'compress',  label: 'Compress', emoji: '◎' }, { tool: 'totext', label: 'Extract text', emoji: '📝' }],
  redact:     [{ tool: 'flatten',   label: 'Flatten', emoji: '⊟' }, { tool: 'hashcheck', label: 'Verify hash', emoji: '🔑' }],
  grayscale:  [{ tool: 'compress',  label: 'Compress', emoji: '◎' }],
  topptx:     [{ tool: 'compress',  label: 'Compress original', emoji: '◎' }],
  convert:    [{ tool: 'merge',     label: 'Merge results', emoji: '⊕' }],
}

interface Props {
  lastTool: string | null
  onSelectTool: (tool: string) => void
}

export default function NextStepChips({ lastTool, onSelectTool }: Props) {
  if (!lastTool) return null
  const suggestions = NEXT_STEP_MAP[lastTool]
  if (!suggestions) return null

  return (
    <div className="animate-fade-up" style={{ animationDelay: '0.1s' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold" style={{ color: 'var(--ink-muted)' }}>Next step?</span>
        {suggestions.map(s => (
          <button key={s.tool} onClick={() => onSelectTool(s.tool)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                  style={{ background: 'var(--blue-pale)', color: 'var(--blue-vivid)', border: '1.5px solid rgba(37,99,235,0.2)' }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--blue-vivid)'; (e.currentTarget as HTMLElement).style.color = 'white' }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'var(--blue-pale)'; (e.currentTarget as HTMLElement).style.color = 'var(--blue-vivid)' }}>
            {s.emoji} {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
