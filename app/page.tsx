"use client"

import { useState, useRef, useCallback, useEffect } from 'react'
import FileUpload from '@/components/FileUpload'
import PDFTools from '@/components/PDFTools'
import PDFViewer from '@/components/PDFViewer'
import VoiceCommand, { VoiceCommandType } from '@/components/VoiceCommand'
import OnboardingTour from '@/components/OnboardingTour'
import PDFHealthScore from '@/components/PDFHealthScore'
import NextStepChips from '@/components/NextStepChips'

// Maps each tool to a descriptive filename suffix, so a compressed file
// downloads as "report-compressed.pdf" rather than a vague "report-edited.pdf".
// Tools not listed fall back to "edited".
const TOOL_SUFFIX: Record<string, string> = {
  merge: 'merged',
  split: 'split',
  splitn: 'split',
  compress: 'compressed',
  rotate: 'rotated',
  crop: 'cropped',
  autocrop: 'cropped',
  rearrange: 'reordered',
  insertpage: 'pages-added',
  convert: 'converted',
  toPDF: 'converted',
  toexcel: 'tables',
  topptx: 'slides',
  totext: 'text',
  tojson: 'data',
  edit: 'annotated',
  microannot: 'annotated',
  sign: 'signed',
  watermark: 'watermarked',
  redact: 'redacted',
  addimage: 'with-image',
  pagenum: 'numbered',
  headfoot: 'with-header',
  qrcode: 'with-qr',
  metadata: 'updated',
  flatten: 'flattened',
  grayscale: 'grayscale',
  bookmarks: 'bookmarked',
  normalizesize: 'resized',
  unlock: 'unlocked',
  aesencrypt: 'encrypted',
  ocr: 'searchable',
  extractimgs: 'images',
  tilePrint: 'tiled',
}

export default function Home() {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [selectedTool, setSelectedTool] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [processedFile, setProcessedFile] = useState<Blob | null>(null)
  const [selectedPages, setSelectedPages] = useState<number[]>([])
  const [edits, setEdits] = useState<Array<{ pageIndex: number; text: string; x: number; y: number }>>([])
  const [editMode, setEditMode] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [darkMode, setDarkMode] = useState(false)
  const [progress, setProgress] = useState<{ page: number; total: number } | null>(null)
  const [pageOrder, setPageOrder] = useState<number[]>([])
  const [originalSize, setOriginalSize] = useState<number | undefined>()
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [recentFiles, setRecentFiles] = useState<Array<{name:string;size:number;ts:number}>>([])
  const [pwaPrompt, setPwaPrompt] = useState<any>(null)
  const statusTimerRef = useRef<NodeJS.Timeout | null>(null)
  const processedFileRef = useRef<Blob | null>(null)
  // New UX states
  const [showTour, setShowTour] = useState(false)
  const [lastCompletedTool, setLastCompletedTool] = useState<string | null>(null)
  const [smartSuggestions, setSmartSuggestions] = useState<string[]>([])
  const [outputFileName, setOutputFileName] = useState('')
  const [editingFileName, setEditingFileName] = useState(false)
  const [thumbSize, setThumbSize] = useState(3) // 1=large, 3=medium, 5=small (grid cols)
  const [showProvenanceLog, setShowProvenanceLog] = useState(false)
  const [provenanceLog, setProvenanceLog] = useState<Array<{op:string;ts:string;inKB:number;outKB?:number}>>([])
  const [memoryCleared, setMemoryCleared] = useState(false)
  const [pwStrength, setPwStrength] = useState(0) // 0-4

  // ── Dark mode init from localStorage ───────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('commandeditor-dark')
    if (saved === 'true') { setDarkMode(true); document.documentElement.setAttribute('data-theme', 'dark') }
    // Recent files
    try {
      const rf = JSON.parse(localStorage.getItem('commandeditor-recent') || '[]')
      setRecentFiles(rf)
    } catch {}
    // Onboarding tour (show once)
    if (!localStorage.getItem('commandeditor-tour-done')) {
      setTimeout(() => setShowTour(true), 800)
    }
    // PWA install prompt
    const pwaHandler = (e: Event) => { e.preventDefault(); setPwaPrompt(e) }
    window.addEventListener('beforeinstallprompt', pwaHandler)
    // Memory wipe on tab close
    const unloadHandler = () => {
      // Null all refs
      processedFileRef.current = null
      setMemoryCleared(true)
    }
    window.addEventListener('beforeunload', unloadHandler)
    // Deep-link tool
    const params = new URLSearchParams(window.location.search)
    const tool = params.get('tool')
    if (tool) {
      setTimeout(() => {
        document.getElementById('app-section')?.scrollIntoView({ behavior: 'smooth' })
        setSelectedTool(tool)
      }, 600)
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', pwaHandler)
      window.removeEventListener('beforeunload', unloadHandler)
    }
  }, [])

  const toggleDark = () => {
    const next = !darkMode
    setDarkMode(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : '')
    localStorage.setItem('commandeditor-dark', String(next))
  }

  // Ref so keyboard handler can always call latest handleToolSelect
  const handleToolSelectRef = useRef<((tool: string) => void) | null>(null)

  // ── Global keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
      if (e.key === '?') { setShowShortcuts(s => !s); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); toggleDark(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && processedFileRef.current && processedFileRef.current.size > 0) {
        e.preventDefault()
        const btn = document.querySelector('[data-download-btn]') as HTMLButtonElement
        btn?.click(); return
      }
      if (e.key === 'Escape') { setShowShortcuts(false); return }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const toolKeys: Record<string, string> = {
          'm': 'merge', 's': 'split', 'c': 'compress', 'r': 'rotate',
          'w': 'watermark', 'n': 'pagenum', 'u': 'unlock', 'h': 'headfoot',
          'g': 'grayscale', 'x': 'totext', 't': 'topptx', 'f': 'hashcheck',
        }
        const tool = toolKeys[e.key.toLowerCase()]
        if (tool && uploadedFiles.length > 0) { e.preventDefault(); handleToolSelectRef.current?.(tool); return }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [darkMode, uploadedFiles])

  const showStatus = useCallback((msg: string, duration = 3500) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    setStatusMsg(msg)
    if (duration < 60000) statusTimerRef.current = setTimeout(() => setStatusMsg(null), duration)
  }, [])

  const handleFilesUpload = (files: File[]) => {
    setUploadedFiles(files)
    setProcessedFile(null); processedFileRef.current = null
    setSelectedPages([]); setEdits([]); setSelectedTool(null)
    setEditMode(false); setProgress(null); setPageOrder([])
    setOriginalSize(files[0]?.size)
    setLastCompletedTool(null)
    setSmartSuggestions([])
    setOutputFileName(files[0]?.name.replace(/\.[^.]+$/, '') + '-edited' || 'output')
    if (files.length > 0) {
      showStatus(`${files.length} file${files.length > 1 ? 's' : ''} loaded`)
      try {
        const existing: Array<{name:string;size:number;ts:number}> = JSON.parse(localStorage.getItem('commandeditor-recent') || '[]')
        const newEntries = files.map(f => ({ name: f.name, size: f.size, ts: Date.now() }))
        const merged = [...newEntries, ...existing.filter(e => !files.some(f => f.name === e.name))]
        localStorage.setItem('commandeditor-recent', JSON.stringify(merged.slice(0, 5)))
        setRecentFiles(merged.slice(0, 5))
      } catch {}
    }
  }

  const handleToolSelect = (tool: string, clearResult = true) => {
    setSelectedTool(prev => {
      // Only clear processedFile if user is picking a genuinely different tool
      if (clearResult && tool && tool !== prev) {
        setProcessedFile(null)
        processedFileRef.current = null
      }
      return tool || null
    })
    if (tool !== 'edit') setEditMode(false)
    else setEditMode(true)
    setProgress(null)
    // Update URL for deep-linking
    const url = new URL(window.location.href)
    if (tool) url.searchParams.set('tool', tool)
    else url.searchParams.delete('tool')
    window.history.replaceState({}, '', url.toString())
  }
  // Keep ref in sync
  handleToolSelectRef.current = handleToolSelect

  const handleProcessingComplete = (result: Blob, toolName?: string) => {
    setProcessedFile(result); processedFileRef.current = result
    setProcessing(false); setProgress(null)
    if (result.size > 0) {
      const kb = (result.size / 1024).toFixed(1)
      const diff = originalSize ? Math.round(((originalSize - result.size) / originalSize) * 100) : null
      showStatus(diff && diff > 2 ? `✓ Done — ${kb} KB (${diff}% smaller)` : `✓ Done — ${kb} KB ready to download`)
      // Rename output to reflect the operation, e.g. "report-compressed".
      // Prefer the toolId passed from the completion call (reliable) over
      // selectedTool state (can be stale inside a closure).
      const op = toolName || selectedTool
      if (op) {
        const suffix = TOOL_SUFFIX[op] || 'edited'
        const original = uploadedFiles[0]?.name.replace(/\.[^.]+$/, '') || 'output'
        setOutputFileName(`${original}-${suffix}`)
      }
      // Provenance log
      if (op) {
        const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        setProvenanceLog(prev => [...prev, {
          op,
          ts,
          inKB: Math.round((originalSize || 0) / 1024),
          outKB: Math.round(result.size / 1024),
        }])
        setLastCompletedTool(op)
      }
    }
  }

  const handleProcessingStart = () => { setProcessing(true); setStatusMsg(null); setProgress(null) }
  const handleProgress = (page: number, total: number) => setProgress({ page, total })

  // ── Drag files onto tool cards ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { files: droppedFiles, toolId } = (e as CustomEvent).detail
      if (!droppedFiles || droppedFiles.length === 0) return
      handleFilesUpload(droppedFiles)
      setTimeout(() => {
        handleToolSelect(toolId)
        setTimeout(() => {
          const trigger = (window as any).__triggerToolAction
          if (trigger && ['compress','rotate','watermark','flatten','grayscale','topptx','extractimgs'].includes(toolId)) {
            trigger(toolId)
          }
        }, 300)
      }, 100)
    }
    window.addEventListener('commandeditor-drop-on-tool', handler)
    return () => window.removeEventListener('commandeditor-drop-on-tool', handler)
  }, [])

  const handleEditClick = (pageIndex: number, x: number, y: number) => {
    const handler = (window as any).__editClickHandler
    if (handler) handler(pageIndex, x, y)
  }

  const handleVoiceCommand = useCallback((command: VoiceCommandType) => {
    if (command.action === 'upload') {
      const btn = document.querySelector('[data-upload-btn]') as HTMLButtonElement
      if (btn) { btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); btn.click() }
      return
    }
    if (command.action === 'download') {
      const btn = document.querySelector('[data-download-btn]') as HTMLButtonElement
      if (btn) { btn.click(); return }
      const blob = processedFileRef.current
      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'commandeditor-output.pdf'
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        showStatus('Downloading…')
      } else showStatus('No processed file to download yet')
      return
    }
    if (command.action === 'redact') { handleToolSelect('redact'); return }
    if (command.action === 'crop') { handleToolSelect('crop'); return }
    if (command.action === 'totext') { handleToolSelect('totext'); return }
    if (command.action === 'qrcode') { handleToolSelect('qrcode'); return }
    if (command.action === 'unlock') { handleToolSelect('unlock'); return }
    if (command.action === 'headfoot') { handleToolSelect('headfoot'); return }
    if (command.action === 'grayscale') { handleToolSelect('grayscale'); return }
    if (command.action === 'insertpage') { handleToolSelect('insertpage'); return }
    if (command.action === 'splitn') { handleToolSelect('splitn'); return }
    if (command.action === 'topptx') { handleToolSelect('topptx'); return }
    if (command.action === 'hashcheck') { handleToolSelect('hashcheck'); return }
    if (command.action === 'ocr') { handleToolSelect('ocr'); return }
    if (command.action === 'startover') {
      handleFilesUpload([]); setSelectedTool(null); setProcessedFile(null); processedFileRef.current = null
      showStatus('✓ Cleared — ready for a new document'); return
    }
    if (command.action === 'rename') {
      setEditingFileName(true)
      setTimeout(() => document.getElementById('output-filename')?.focus(), 100)
      return
    }
    // v6 new tool voice triggers — all route to handleToolSelect
    const v6Tools = ['readability','pdfcompare','a11ycheck','flashcards','piiscan',
      'bookmarks','autocrop','tojson','fontinspect','spellcheck','batchrules','macro',
      'semanticgroup','podcastscript','ankideck','tilePrint','emailhtml','tamperseal',
      'recipe','preflight','microannot','normalizesize','present','inkestimate',
      'timeline','toneanalyse','langdetect','citations']
    if (v6Tools.includes(command.action)) { handleToolSelect(command.action); return }
    if (uploadedFiles.length === 0) { showStatus('Upload a file first'); return }
    const toolTrigger = (window as any).__triggerToolAction
    if (toolTrigger) toolTrigger(command.action, command.format)
  }, [uploadedFiles, showStatus])

  const scrollToApp = () => document.getElementById('app-section')?.scrollIntoView({ behavior: 'smooth' })

  const progressPct = progress ? Math.round((progress.page / progress.total) * 100) : 0

  const ALL_FEATURES = [
    'Merge PDFs', 'Split PDF', 'Compress PDF', 'Sign Document', 'Rotate Pages',
    'Add Watermark', 'PDF→Images', 'PDF→Excel', 'Add Image to PDF',
  ]

  return (
    <div className="min-h-screen">

      {/* ===== ONBOARDING TOUR ===== */}
      {showTour && (
        <OnboardingTour onComplete={() => {
          setShowTour(false)
          localStorage.setItem('commandeditor-tour-done', '1')
        }} />
      )}

      {/* ===== NAV ===== */}
      <nav style={{ background: 'var(--navy)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
           className="sticky top-0 z-40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, var(--blue-bright), var(--blue-vivid))' }}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="font-bold text-lg tracking-tight text-white" style={{ fontFamily: 'Syne, sans-serif' }}>CommandEditor</span>
            <span className="badge text-xs" style={{ background: 'rgba(96,165,250,0.15)', color: 'var(--blue-glow)', fontSize: '10px' }}>v6</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge hidden sm:inline-flex" style={{ background: 'rgba(5,150,105,0.15)', color: '#34d399' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              100% Private
            </span>
            {/* Dark mode toggle */}
            <button onClick={toggleDark} className="btn-icon w-9 h-9" title="Toggle dark mode (Ctrl+D)"
                    style={{ color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.08)' }}>
              {darkMode
                ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" /></svg>
                : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
              }
            </button>
            {/* Shortcuts hint */}
            <button onClick={() => setShowShortcuts(true)} className="btn-icon w-9 h-9 hidden sm:flex"
                    title="Keyboard shortcuts (?)"
                    style={{ color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.08)' }}>
              <span className="font-mono text-xs font-bold">?</span>
            </button>
            <button onClick={() => setShowTour(true)} className="btn-icon w-9 h-9 hidden md:flex"
                    title="Replay onboarding tour"
                    style={{ color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.08)' }}>
              <span className="text-xs">👋</span>
            </button>
            {uploadedFiles.length > 0 && (
              <button onClick={() => {
                handleFilesUpload([])
                setSelectedTool(null)
                setProcessedFile(null); processedFileRef.current = null
                setLastCompletedTool(null)
                setProvenanceLog([])
                document.getElementById('app-section')?.scrollIntoView({ behavior: 'smooth' })
              }} className="btn-ghost text-sm px-4 py-2"
                      style={{ color: 'rgba(255,255,255,0.65)', background: 'rgba(255,255,255,0.08)' }}
                      title="Clear everything and start fresh">
                ↺ Start over
              </button>
            )}
            <button onClick={scrollToApp} className="btn-primary text-sm px-5 py-2.5">Get Started</button>
          </div>
        </div>
      </nav>

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden"
               style={{ background: 'linear-gradient(160deg, var(--navy) 0%, var(--navy-mid) 45%, var(--navy-light) 100%)', minHeight: '88vh', display: 'flex', alignItems: 'center' }}>
        <div className="hero-dots absolute inset-0" style={{ opacity: 0.6 }} />
        <div className="absolute animate-glow" style={{ top: '-8%', right: '5%', width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(37,99,235,0.25) 0%, rgba(37,99,235,0.08) 50%, transparent 70%)', pointerEvents: 'none' }} />
        <div className="absolute animate-glow" style={{ animationDelay: '1.5s', bottom: '-10%', left: '-5%', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, rgba(99,102,241,0.06) 50%, transparent 70%)', pointerEvents: 'none' }} />
        {/* Floating cards */}
        <div className="absolute hidden lg:flex flex-col gap-4" style={{ top: '50%', right: '4%', transform: 'translateY(-50%)' }}>
          {[
            { icon: '🔒', title: 'Zero uploads', sub: 'Files stay on your device', delay: '0s', bg: 'rgba(96,165,250,0.2)' },
            { icon: '⚡', title: 'Instant processing', sub: 'Runs in your browser', delay: '0.8s', bg: 'rgba(249,115,22,0.2)' },
            { icon: '🌙', title: 'Dark mode', sub: 'Easy on the eyes', delay: '1.4s', bg: 'rgba(124,58,237,0.2)' },
          ].map(c => (
            <div key={c.title} className="animate-float rounded-2xl px-5 py-4 flex items-center gap-3"
                 style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(20px)', animationDelay: c.delay }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: c.bg }}>
                <span className="text-lg">{c.icon}</span>
              </div>
              <div>
                <p className="font-semibold text-white text-sm">{c.title}</p>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{c.sub}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 md:py-0 w-full">
          <div className="max-w-2xl lg:max-w-3xl">
            <div className="inline-flex items-center gap-2 mb-8 animate-fade-up">
              <span className="badge" style={{ background: 'rgba(249,115,22,0.15)', color: 'var(--accent-light)', border: '1px solid rgba(249,115,22,0.25)' }}>
                Privacy-first · No server uploads · Free forever
              </span>
            </div>
            <h1 className="text-5xl md:text-7xl mb-7 animate-fade-up"
                style={{ animationDelay: '0.08s', fontFamily: 'Syne, sans-serif', fontWeight: 800, lineHeight: 1.08, color: 'white' }}>
              Document work,<br />
              <span style={{ background: 'linear-gradient(100deg, #93c5fd 0%, #818cf8 55%, #c4b5fd 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'brightness(1.15)' }}>
                by voice.
              </span>
            </h1>
            <p className="text-lg md:text-xl mb-10 max-w-xl animate-fade-up"
               style={{ color: 'rgba(255,255,255,0.75)', animationDelay: '0.16s', lineHeight: 1.7 }}>
              The first voice-controlled PDF toolkit — 50+ hands-free commands and 50+ tools.
              Everything runs in your browser. Your documents never touch a server.
            </p>
            <div className="flex flex-wrap items-center gap-4 animate-fade-up" style={{ animationDelay: '0.24s' }}>
              <button onClick={scrollToApp} className="btn-primary px-8 py-4 text-base" style={{ boxShadow: 'var(--shadow-blue)' }}>
                Start editing — it's free
              </button>
              <button onClick={scrollToApp}
                      className="inline-flex items-center gap-2 px-6 py-4 rounded-xl text-base font-semibold transition-all duration-200"
                      style={{ color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)' }}
                      onMouseOver={(e: React.MouseEvent) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)'}
                      onMouseOut={(e: React.MouseEvent) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'}>
                See all tools ↓
              </button>
            </div>
            <div className="flex flex-wrap gap-10 mt-16 animate-fade-up" style={{ animationDelay: '0.32s' }}>
              {[{ val: '50+', label: 'PDF tools' }, { val: '50+', label: 'Voice commands' }, { val: '0', label: 'Server uploads' }, { val: '∞', label: 'File size limit' }].map(s => (
                <div key={s.label}>
                  <div className="text-3xl font-bold mb-1" style={{ fontFamily: 'Syne, sans-serif', background: 'linear-gradient(90deg, white, var(--blue-glow))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.val}</div>
                  <div className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0" style={{ lineHeight: 0 }}>
          <svg viewBox="0 0 1440 60" preserveAspectRatio="none" style={{ width: '100%', height: '60px', display: 'block' }}>
            <path d="M0,60 C360,20 1080,20 1440,60 L1440,60 L0,60 Z" fill="var(--surface)" />
          </svg>
        </div>
      </section>

      {/* ===== FEATURES STRIP ===== */}
      <section style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>
            {ALL_FEATURES.map(f => (
              <div key={f} className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--blue-vivid)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </div>
            ))}
            <span style={{ color: 'var(--border-strong)' }}>+14 more</span>
          </div>
        </div>
      </section>

      {/* ===== APP SECTION ===== */}
      <section id="app-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3" id="upload-zone">
            <FileUpload onFilesUpload={handleFilesUpload} uploadedFiles={uploadedFiles} />
          </div>
          <div className="lg:col-span-2" id="voice-btn">
            <VoiceCommand files={uploadedFiles} onCommand={handleVoiceCommand} isProcessing={processing} />
          </div>
        </div>

        {/* PDF Health Score */}
        {uploadedFiles.length > 0 && (() => {
          const pdf = uploadedFiles.find(f => f.name.toLowerCase().endsWith('.pdf'))
          return pdf ? (
            <PDFHealthScore
              file={pdf}
              onSuggestTools={(tools) => setSmartSuggestions(tools)}
            />
          ) : null
        })()}

        {/* Smart suggestions */}
        {smartSuggestions.length > 0 && !selectedTool && (
          <div className="flex items-center gap-3 flex-wrap animate-fade-up px-1">
            <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--ink-muted)' }}>Suggested</span>
            {smartSuggestions.map((tool: string) => {
              const lookup: Record<string, { emoji: string; label: string }> = {
                ocr: { emoji: '🔎', label: 'Run OCR' },
                compress: { emoji: '◎', label: 'Compress' },
                split: { emoji: '✂', label: 'Split' },
              }
              const t = lookup[tool] || { emoji: '🔧', label: tool }
              return (
                <button key={tool} onClick={() => handleToolSelect(tool)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                        style={{ background: 'rgba(249,115,22,0.08)', color: 'var(--accent)', border: '1.5px solid rgba(249,115,22,0.2)' }}
                        onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'white' }}
                        onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(249,115,22,0.08)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}>
                  {t.emoji} {t.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Recent files */}
        {recentFiles.length > 0 && uploadedFiles.length === 0 && (
          <div className="animate-fade-up">
            <p className="section-label mb-3">Recent files</p>
            <div className="flex flex-wrap gap-2">
              {recentFiles.map((rf, i) => (
                <div key={i} className="recent-chip" role="button" tabIndex={0}
                     aria-label={`Recent file: ${rf.name}`}
                     onClick={() => { const input = document.getElementById('file-input') as HTMLInputElement; if (input) input.click() }}
                     onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') { const input = document.getElementById('file-input') as HTMLInputElement; if (input) input.click() } }}>
                  <span>📄</span>
                  <span className="max-w-32 truncate">{rf.name}</span>
                  <span style={{ color: 'var(--ink-muted)', fontSize: '10px' }}>{(rf.size/1024).toFixed(0)} KB</span>
                </div>
              ))}
              <button onClick={() => { localStorage.removeItem('commandeditor-recent'); setRecentFiles([]) }}
                      className="text-xs px-3 py-1.5 rounded-xl transition-colors"
                      style={{ color: 'var(--ink-muted)', background: 'var(--surface-2)' }}
                      aria-label="Clear recent files history">Clear history</button>
            </div>
          </div>
        )}

        <PDFTools
          files={uploadedFiles}
          selectedTool={selectedTool}
          onToolSelect={handleToolSelect}
          onProcessingStart={handleProcessingStart}
          onProcessingComplete={handleProcessingComplete}
          selectedPages={selectedPages}
          onEditsChange={setEdits}
          currentEdits={edits}
          editMode={editMode}
          showStatus={showStatus}
          pageOrder={pageOrder}
          onProgress={handleProgress}
          onSizeChange={setOriginalSize}
        />

        {/* Next step chips after processing */}
        {processedFile && processedFile.size > 0 && (
          <div className="space-y-3 animate-fade-up">
            {/* Output filename + download */}
            <div id="download-btn" className="card flex flex-wrap items-center gap-3">
              <div className="flex-1 flex items-center gap-3 min-w-0">
                <svg className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--green)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {editingFileName ? (
                  <input id="output-filename" className="input text-sm" value={outputFileName}
                         onChange={e => setOutputFileName(e.target.value)}
                         onBlur={() => setEditingFileName(false)}
                         onKeyDown={e => { if (e.key === 'Enter') setEditingFileName(false) }}
                         style={{ maxWidth: 280 }} />
                ) : (
                  <button onClick={() => setEditingFileName(true)}
                          className="text-sm font-semibold truncate max-w-xs text-left"
                          style={{ color: 'var(--ink)' }} title="Click to rename">
                    {outputFileName || 'output'} <span className="text-xs ml-1" style={{ color: 'var(--ink-muted)' }}>✎</span>
                  </button>
                )}
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--ink-muted)' }}>
                  {(processedFile.size / 1024).toFixed(1)} KB
                </span>
              </div>
              <button data-download-btn onClick={() => {
                const f = processedFile
                if (!f) return
                const ext = f.type.includes('zip') ? '.zip'
                  : f.type.includes('presentation') ? '.pptx'
                  : f.type.includes('csv') ? '.csv'
                  : f.type.includes('octet-stream') ? '.enc'
                  : '.pdf'
                const url = URL.createObjectURL(f)
                const a = document.createElement('a'); a.href = url
                a.download = (outputFileName || 'output') + ext
                document.body.appendChild(a); a.click(); document.body.removeChild(a)
                setTimeout(() => URL.revokeObjectURL(url), 5000)
                showStatus(`⬇ Downloading ${a.download}`)
              }} className="btn-primary flex-shrink-0" style={{ background: 'var(--green)' }}>
                ⬇ Download
              </button>
            </div>
            <NextStepChips lastTool={lastCompletedTool} onSelectTool={handleToolSelect} />
          </div>
        )}

        {/* Thumbnail size slider */}
        {uploadedFiles.length > 0 && (
          <div className="flex items-center gap-3 px-1">
            <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>🔲 Page size</span>
            <input type="range" min={1} max={5} step={1} value={thumbSize}
                   onChange={e => setThumbSize(parseInt(e.target.value))}
                   style={{ width: 100 }} aria-label="Thumbnail size" />
            <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>{thumbSize === 1 ? 'Large' : thumbSize <= 2 ? 'Medium' : thumbSize <= 3 ? 'Normal' : thumbSize <= 4 ? 'Small' : 'Compact'}</span>
          </div>
        )}

        <div id="pdf-viewer-section">
        {uploadedFiles.length > 0 && (
          <PDFViewer
            files={uploadedFiles}
            processedFile={processedFile}
            selectedPages={selectedPages}
            onPagesSelect={setSelectedPages}
            editMode={editMode}
            onEditClick={handleEditClick}
            edits={edits}
            onPageOrderChange={setPageOrder}
            originalSize={originalSize}
            thumbColsOverride={thumbSize}
            outputName={outputFileName}
            onDeletePages={async (pagesToDel: number[]) => {
              const pdfFile = uploadedFiles.find(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
              if (!pdfFile) return
              try {
                const { deletePagesFromPDF } = await import('@/utils/pdfOperations')
                handleProcessingComplete(await deletePagesFromPDF(pdfFile, pagesToDel))
                showStatus(`✓ ${pagesToDel.length} page${pagesToDel.length > 1 ? 's' : ''} deleted`)
              } catch (e: any) { showStatus('Delete failed: ' + (e as any).message) }
            }}
            onRotatePage={async (pageNum: number, direction: 'cw' | 'ccw') => {
              const pdfFile = uploadedFiles.find(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
              if (!pdfFile) return
              try {
                const { PDFDocument, degrees } = await import('pdf-lib')
                const { pdfBlob } = await import('@/utils/blob')
                const doc = await PDFDocument.load(await pdfFile.arrayBuffer())
                const page = doc.getPages()[pageNum - 1]
                if (page) page.setRotation(degrees((page.getRotation().angle + (direction === 'cw' ? 90 : -90)) % 360))
                const blob = pdfBlob(await doc.save())
                handleProcessingComplete(blob)
                showStatus(`✓ Page ${pageNum} rotated ${direction === 'cw' ? '90°CW' : '90°CCW'}`)
              } catch (e: any) { showStatus('Rotation failed: ' + (e as any).message) }
            }}
          />
        )}
        </div>

        {/* Provenance / audit log */}
        {provenanceLog.length > 0 && (
          <div className="card animate-fade-up">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setShowProvenanceLog(s => !s)}
                      className="flex items-center gap-2 text-sm font-semibold"
                      style={{ color: 'var(--ink)' }}>
                <span>{showProvenanceLog ? '▾' : '▸'}</span>
                📋 File provenance ({provenanceLog.length} operation{provenanceLog.length > 1 ? 's' : ''})
              </button>
              <button onClick={() => {
                const lines = provenanceLog.map(e => `[${e.ts}] ${e.op} — ${e.inKB} KB → ${e.outKB || '?'} KB`)
                const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = 'provenance.txt'
                document.body.appendChild(a); a.click(); document.body.removeChild(a)
                URL.revokeObjectURL(url)
              }} className="text-xs px-3 py-1.5 rounded-xl font-semibold"
                      style={{ background: 'var(--surface-2)', color: 'var(--ink-soft)' }}>
                Export .txt
              </button>
            </div>
            {showProvenanceLog && (
              <div className="space-y-1.5 animate-fade-up">
                {provenanceLog.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b"
                       style={{ borderColor: 'var(--border)' }}>
                    <span style={{ color: 'var(--green)' }}>✓</span>
                    <span className="font-semibold" style={{ color: 'var(--ink)' }}>{e.op}</span>
                    <span style={{ color: 'var(--ink-muted)' }}>{e.inKB} KB → {e.outKB || '?'} KB</span>
                    <span className="ml-auto" style={{ color: 'var(--ink-muted)' }}>{e.ts}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Zero-knowledge privacy banner */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-xs"
             style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.15)' }}>
          <span className="text-base">🔒</span>
          <span style={{ color: 'var(--green)' }}>
            <strong>Zero-knowledge guarantee:</strong> Your files never touch a server. All processing runs in your browser.{' '}
            <a href="https://github.com/kjelili/commandeditor" target="_blank" rel="noopener noreferrer"
               style={{ color: 'var(--green)', textDecoration: 'underline' }}>
              Open source — verify it yourself
            </a>
          </span>
        </div>

      </section>

      {/* ===== ALL TOOLS ===== */}
      <section className="py-20 border-t" style={{ borderColor: 'var(--border)', background: 'var(--card-bg)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="section-label mb-3">Everything included</p>
            <h2 className="text-4xl md:text-5xl mb-4">50+ tools. Zero cost.</h2>
            <p className="text-base max-w-xl mx-auto" style={{ color: 'var(--ink-muted)' }}>
              Every tool runs entirely in your browser. No sign-up, no subscriptions, no limits.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { emoji: '⊕', name: 'Merge', desc: 'Combine PDFs', color: '#2563eb', bg: '#dbeafe', tool: 'merge' },
              { emoji: '✂', name: 'Split', desc: 'Extract pages', color: '#7c3aed', bg: '#ede9fe', tool: 'split' },
              { emoji: '◎', name: 'Compress', desc: 'Reduce size', color: '#059669', bg: '#d1fae5', tool: 'compress' },
              { emoji: '✐', name: 'Annotate', desc: 'Add text/marks', color: '#f97316', bg: '#ffedd5', tool: 'edit' },
              { emoji: '↻', name: 'Rotate', desc: 'Fix orientation', color: '#6366f1', bg: '#e0e7ff', tool: 'rotate' },
              { emoji: '⇅', name: 'Rearrange', desc: 'Drag & reorder', color: '#ea580c', bg: '#ffedd5', tool: 'rearrange' },
              { emoji: '💧', name: 'Watermark', desc: 'Custom brand', color: '#b45309', bg: '#fef3c7', tool: 'watermark' },
              { emoji: '✍️', name: 'Sign', desc: 'Legally binding', color: '#0d9488', bg: '#ccfbf1', tool: 'sign' },
              { emoji: '⤓', name: 'PDF→Image', desc: 'PNG/JPG/WEBP', color: '#0891b2', bg: '#cffafe', tool: 'convert' },
              { emoji: '📝', name: 'PDF→Word', desc: 'Export DOCX', color: '#4338ca', bg: '#e0e7ff', tool: 'convert' },
              { emoji: '📊', name: 'PDF→Excel', desc: 'Extract tables', color: '#15803d', bg: '#dcfce7', tool: 'toexcel' },
              { emoji: '⤒', name: 'To PDF', desc: 'Any file', color: '#dc2626', bg: '#fee2e2', tool: 'toPDF' },
              { emoji: '🖼️', name: 'Add Image', desc: 'Logo, photo…', color: '#7c3aed', bg: '#ede9fe', tool: 'addimage' },
              { emoji: '🛡', name: 'Encrypt', desc: 'AES-256', color: '#7c3aed', bg: '#ede9fe', tool: 'aesencrypt' },
              { emoji: '🔢', name: 'Page Nos.', desc: 'Auto number', color: '#0369a1', bg: '#e0f2fe', tool: 'pagenum' },
              { emoji: '🖼', name: 'Extract Imgs', desc: 'Pull images', color: '#0e7490', bg: '#e0f2fe', tool: 'extractimgs' },
              { emoji: '⊟', name: 'Flatten', desc: 'Rasterize', color: '#374151', bg: '#f3f4f6', tool: 'flatten' },
              { emoji: '🏷', name: 'Metadata', desc: 'Edit properties', color: '#7c3aed', bg: '#ede9fe', tool: 'metadata' },
              { emoji: '📦', name: 'Batch', desc: 'Multi-file ops', color: '#0891b2', bg: '#cffafe', tool: 'batch' },
              { emoji: '⬛', name: 'Redact', desc: 'Black-out text', color: '#1c1917', bg: '#f5f5f4', tool: 'redact' },
              { emoji: '✂️', name: 'Crop', desc: 'Trim margins', color: '#0891b2', bg: '#cffafe', tool: 'crop' },
              { emoji: '📝', name: 'To Text', desc: 'TXT/Markdown', color: '#4338ca', bg: '#e0e7ff', tool: 'totext' },
              { emoji: '⬛', name: 'QR Code', desc: 'Scannable link', color: '#0d9488', bg: '#ccfbf1', tool: 'qrcode' },
              { emoji: '🔓', name: 'Unlock', desc: 'Remove password', color: '#be185d', bg: '#fce7f3', tool: 'unlock' },
              { emoji: '📑', name: 'Header/Footer', desc: 'Top & bottom text', color: '#0369a1', bg: '#e0f2fe', tool: 'headfoot' },
              { emoji: '⬜', name: 'Grayscale', desc: 'Remove colour', color: '#374151', bg: '#f3f4f6', tool: 'grayscale' },
              { emoji: '➕', name: 'Insert Page', desc: 'Blank or copy', color: '#059669', bg: '#d1fae5', tool: 'insertpage' },
              { emoji: '📄', name: 'Split by N', desc: 'Equal chunks', color: '#7c3aed', bg: '#ede9fe', tool: 'splitn' },
              { emoji: '🎯', name: 'PDF→PPTX', desc: 'PowerPoint slides', color: '#ea580c', bg: '#ffedd5', tool: 'topptx' },
              { emoji: '🔑', name: 'File Hash', desc: 'SHA-256 verify', color: '#6366f1', bg: '#e0e7ff', tool: 'hashcheck' },
              { emoji: '🔎', name: 'OCR', desc: 'Make searchable', color: '#0891b2', bg: '#cffafe', tool: 'ocr' },
            ].map((tool, i) => (
              <button key={tool.name + i} onClick={() => { scrollToApp(); setTimeout(() => setSelectedTool(tool.tool), 700) }}
                className="rounded-2xl p-4 text-left transition-all duration-200 animate-fade-up group"
                style={{ animationDelay: `${i * 0.03}s`, background: 'var(--card-bg)', border: '1.5px solid var(--border)' }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = tool.color; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${tool.color}22` }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base mb-3 transition-transform group-hover:scale-110"
                     style={{ background: tool.bg, color: tool.color }}>{tool.emoji}</div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--ink)' }}>{tool.name}</p>
                <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{tool.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="py-20 border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="section-label mb-3">Trusted by users worldwide</p>
            <h2 className="text-4xl md:text-5xl mb-4">What people are saying</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'Sarah K.', role: 'Paralegal', avatar: '👩‍💼', rating: 5, text: "CommandEditor has replaced Adobe Acrobat for me entirely. The redaction and signature tools work flawlessly and I love that nothing leaves my computer. The voice commands are a game-changer." },
              { name: 'James O.', role: 'Freelance Designer', avatar: '🧑‍🎨', rating: 5, text: "I use it every week to merge client briefs, add watermarks, and export pages as images. The before/after comparison after compression is exactly what I needed. Incredibly fast too." },
              { name: 'Priya M.', role: 'Academic Researcher', avatar: '👩‍🔬', rating: 5, text: "The PDF to Markdown export is perfect for my workflow — I can pull text from papers straight into my notes. The search inside PDF previews is also excellent. Highly recommend." },
            ].map((t, i) => (
              <div key={t.name} className="testimonial-card animate-fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                       style={{ background: 'var(--surface-2)' }} aria-hidden="true">{t.avatar}</div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{t.name}</p>
                    <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{t.role}</p>
                  </div>
                  <div className="ml-auto flex" aria-label={`${t.rating} out of 5 stars`}>
                    {Array.from({ length: t.rating }).map((_, si) => (
                      <svg key={si} className="w-4 h-4" style={{ color: '#f59e0b' }} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>"{t.text}"</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-24 border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="section-label mb-4">How it works</p>
            <h2 className="text-4xl md:text-5xl">Three steps to done.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { n: '01', title: 'Upload', desc: 'Drag & drop or browse for PDFs, images, Word docs, or text files.', emoji: '📤', color: 'var(--blue-vivid)', bg: 'var(--blue-pale)' },
              { n: '02', title: 'Transform', desc: 'Pick any tool. Adjust settings. Everything runs instantly in your browser.', emoji: '⚙️', color: 'var(--accent)', bg: '#ffedd5' },
              { n: '03', title: 'Download', desc: 'Save your processed file. Nothing ever left your device.', emoji: '💾', color: 'var(--green)', bg: 'var(--green-light)' },
            ].map((step, i) => (
              <div key={step.n} className="card animate-fade-up" style={{ animationDelay: `${i * 0.12}s` }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl mb-5" style={{ background: step.bg }}>{step.emoji}</div>
                <span className="section-label mb-2 block">{step.n}</span>
                <h3 className="text-xl mb-3">{step.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer style={{ background: 'var(--navy)', borderTop: '1px solid rgba(255,255,255,0.08)' }} className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, var(--blue-bright), var(--blue-vivid))' }}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>CommandEditor</span>
          </div>
          <div className="flex flex-wrap gap-6 text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
            <span>Privacy-first document processing</span>
            <span>·</span>
            <span>All processing runs in your browser</span>
            <span>·</span>
            <span>© 2026 CommandEditor</span>
          </div>
        </div>
      </footer>

      {/* ===== PWA INSTALL BANNER ===== */}
      {pwaPrompt && (
        <div className="pwa-banner" role="complementary" aria-label="Install CommandEditor app">
          <span className="text-xl" aria-hidden="true">📲</span>
          <div className="flex-1">
            <p className="font-semibold text-sm">Install CommandEditor</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Use it like a native app, offline too</p>
          </div>
          <button onClick={async () => { pwaPrompt.prompt(); const { outcome } = await pwaPrompt.userChoice; if (outcome === 'accepted') setPwaPrompt(null) }}
                  className="btn-primary text-xs px-4 py-2" style={{ background: 'var(--blue-vivid)' }}
                  aria-label="Install CommandEditor as app">
            Install
          </button>
          <button onClick={() => setPwaPrompt(null)} className="btn-icon w-8 h-8"
                  style={{ color: 'rgba(255,255,255,0.5)' }} aria-label="Dismiss install prompt">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* ===== PROCESSING MODAL ===== */}
      {processing && (
        <div className="modal-overlay animate-fade-in">
          <div className="card animate-scale-in text-center" style={{ minWidth: 320 }}>
            <div className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center" style={{ background: 'var(--blue-pale)' }}>
              <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
                   style={{ borderColor: 'var(--blue-pale)', borderTopColor: 'var(--blue-vivid)' }} />
            </div>
            <h3 className="text-lg mb-1">Processing your document</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--ink-muted)' }}>Running entirely in your browser — no uploads</p>
            {progress && (
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--ink-muted)' }}>
                  <span>Page {progress.page} of {progress.total}</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}
            {!progress && (
              <div className="flex items-center justify-center gap-1.5" style={{ color: 'var(--blue-bright)' }}>
                <span className="dot" /><span className="dot" /><span className="dot" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== STATUS BAR ===== */}
      {statusMsg && (
        <div className="status-bar">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {statusMsg}
        </div>
      )}

      {/* ===== KEYBOARD SHORTCUTS MODAL ===== */}
      {showShortcuts && (
        <div className="modal-overlay animate-fade-in" onClick={() => setShowShortcuts(false)}>
          <div className="modal-box animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="btn-icon">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              {[
                { keys: ['Ctrl', 'F'], desc: 'Search text in PDF (in viewer)' },
                { keys: ['Ctrl', 'S'], desc: 'Download processed file' },
                { keys: ['Ctrl', 'D'], desc: 'Toggle dark mode' },
                { keys: ['?'], desc: 'Show/hide this shortcuts panel' },
                { keys: ['Esc'], desc: 'Close modals & panels' },
                { keys: ['M'], desc: 'Merge PDFs' },
                { keys: ['S'], desc: 'Split PDF' },
                { keys: ['C'], desc: 'Compress PDF' },
                { keys: ['R'], desc: 'Rotate pages' },
                { keys: ['W'], desc: 'Watermark' },
                { keys: ['N'], desc: 'Page numbers' },
                { keys: ['U'], desc: 'Unlock PDF (remove password)' },
                { keys: ['H'], desc: 'Header & Footer' },
                { keys: ['G'], desc: 'Grayscale' },
                { keys: ['X'], desc: 'Export as Text' },
                { keys: ['T'], desc: 'PDF → PowerPoint' },
                { keys: ['F'], desc: 'File integrity hash' },
              ].map(({ keys, desc }) => (
                <div key={desc} className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{desc}</span>
                  <div className="flex items-center gap-1">
                    {keys.map((k, i) => (
                      <span key={i}>
                        <span className="kbd">{k}</span>
                        {i < keys.length - 1 && <span className="text-xs mx-0.5" style={{ color: 'var(--ink-muted)' }}>+</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs mt-4" style={{ color: 'var(--ink-muted)' }}>
              Press <span className="kbd">?</span> anytime to open this panel · Voice commands: say "Hey Editor"
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
