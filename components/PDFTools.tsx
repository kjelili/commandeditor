'use client'

import { useState, useEffect, useRef, useCallback, type RefObject } from 'react'
import { pdfBlob } from '@/utils/blob'
import {
  computeReadability, scanForPII, diffPDFTexts, analyseTone, detectLanguage,
  extractCitations, extractTimeline, inspectFonts, estimateInkCoverage
} from '@/utils/documentIntelligence'
import {
  saveMacro, loadMacros, deleteMacro, Macro, MacroStep, exportMacroJSON,
  spellCheckText, evaluateRules, loadBatchRules, saveBatchRules, BatchRule,
  groupPagesBySemantic, formatAsPodcastScript, extractFlashcards, buildAnkiTSV,
  tilePDFPage, createTamperSeal, verifySeal, embedSealIntoPDF, TamperSeal,
  encodeRecipe, decodeRecipe, runPrintPreflight,
  pdfToEmailHTML, loadAnnotations, saveAnnotations, exportAnnotationReport, MicroAnnotation,
  detectPageSizes, normalisePageSizes
} from '@/utils/advancedFeatures'
import {
  mergePDFs, splitPDF, compressPDF, editPDF,
  convertPDFToImages, convertPDFToWord, convertImagesToPDF,
  convertWordToPDF, convertTextToPDF, convertMarkdownToPDF,
  convertHTMLFileToPDF, downloadBlob, extractImagesPDF, flattenPDF,
  cropPDF, redactPDF, extractTextFromPDF, addQRToPDF,
  removePasswordPDF, addHeaderFooterPDF, grayscalePDF, insertPagePDF,
  deletePagesFromPDF, splitByNPages, pdfToPPTX, sha256File, ocrPDF
} from '@/utils/pdfOperations'

interface PDFToolsProps {
  files: File[]
  selectedTool: string | null
  onToolSelect: (tool: string) => void
  onProcessingStart: () => void
  onProcessingComplete: (result: Blob, toolId?: string) => void
  selectedPages: number[]
  onEditsChange?: (edits: Array<{ pageIndex: number; text: string; x: number; y: number }>) => void
  currentEdits?: Array<{ pageIndex: number; text: string; x: number; y: number }>
  editMode?: boolean
  showStatus: (msg: string, dur?: number) => void
  pageOrder?: number[]
  onProgress?: (page: number, total: number) => void
  onSizeChange?: (before: number) => void
}

const TOOLS = [
  { id: 'merge',       name: 'Merge',       fullName: 'Merge PDFs',         emoji: '⊕',  desc: 'Combine PDFs',    requiresPDF: true,    color: '#2563eb', colorLight: '#dbeafe' },
  { id: 'split',       name: 'Split',       fullName: 'Split PDF',          emoji: '✂',  desc: 'Extract pages',   requiresPDF: true,    color: '#7c3aed', colorLight: '#ede9fe' },
  { id: 'compress',    name: 'Compress',    fullName: 'Compress PDF',       emoji: '◎',  desc: 'Reduce size',     requiresPDF: true,    color: '#059669', colorLight: '#d1fae5' },
  { id: 'edit',        name: 'Annotate',    fullName: 'Annotate PDF',       emoji: '✐',  desc: 'Add text/marks',  requiresPDF: true,    color: '#f97316', colorLight: '#ffedd5' },
  { id: 'rotate',      name: 'Rotate',      fullName: 'Rotate Pages',       emoji: '↻',  desc: 'Fix orientation', requiresPDF: true,    color: '#6366f1', colorLight: '#e0e7ff' },
  { id: 'watermark',   name: 'Watermark',   fullName: 'Add Watermark',      emoji: '💧', desc: 'Brand pages',     requiresPDF: true,    color: '#b45309', colorLight: '#fef3c7' },
  { id: 'convert',     name: 'PDF→Image',   fullName: 'Export PDF',         emoji: '⤓',  desc: 'PNG/JPG/Word',    requiresPDF: true,    color: '#0891b2', colorLight: '#cffafe' },
  { id: 'toPDF',       name: 'To PDF',      fullName: 'Convert to PDF',     emoji: '⤒',  desc: 'Images/docs',     requiresNonPDF: true, color: '#dc2626', colorLight: '#fee2e2' },
  { id: 'pagenum',     name: 'Page Nos.',   fullName: 'Add Page Numbers',   emoji: '🔢', desc: 'Auto number',     requiresPDF: true,    color: '#0369a1', colorLight: '#e0f2fe' },
  { id: 'extractimgs', name: 'Ext. Images', fullName: 'Extract Images',     emoji: '🖼', desc: 'Pull all images', requiresPDF: true,    color: '#0e7490', colorLight: '#e0f2fe' },
  { id: 'flatten',     name: 'Flatten',     fullName: 'Flatten PDF',        emoji: '⊟',  desc: 'Rasterize',       requiresPDF: true,    color: '#374151', colorLight: '#f3f4f6' },
  { id: 'metadata',    name: 'Metadata',    fullName: 'Edit Metadata',      emoji: '🏷',  desc: 'Title, author…',  requiresPDF: true,    color: '#7c3aed', colorLight: '#ede9fe' },
  { id: 'batch',       name: 'Batch',       fullName: 'Batch Process',      emoji: '📦', desc: 'Multi-file',      requiresPDF: true,    color: '#0891b2', colorLight: '#cffafe' },
  { id: 'sign',        name: 'Sign',        fullName: 'Sign Document',       emoji: '✍️', desc: 'Type/draw/upload', requiresPDF: true,    color: '#0d9488', colorLight: '#ccfbf1' },
  { id: 'addimage',    name: 'Add Image',   fullName: 'Add Image to PDF',    emoji: '🖼️', desc: 'Logo, photo…',    requiresPDF: true,    color: '#7c3aed', colorLight: '#ede9fe' },
  { id: 'toexcel',     name: 'PDF→Excel',   fullName: 'PDF to Excel/CSV',    emoji: '📊', desc: 'Extract tables',  requiresPDF: true,    color: '#15803d', colorLight: '#dcfce7' },
  { id: 'rearrange',   name: 'Rearrange',   fullName: 'Rearrange Pages',     emoji: '⇅',  desc: 'Drag & reorganize',requiresPDF: true,   color: '#ea580c', colorLight: '#ffedd5' },
  { id: 'redact',      name: 'Redact',      fullName: 'Redact Content',       emoji: '⬛', desc: 'Black-out text',  requiresPDF: true,    color: '#1c1917', colorLight: '#f5f5f4' },
  { id: 'crop',        name: 'Crop',        fullName: 'Crop Pages',           emoji: '✂️', desc: 'Trim margins',    requiresPDF: true,    color: '#0891b2', colorLight: '#cffafe' },
  { id: 'totext',      name: 'To Text',     fullName: 'Extract Text',         emoji: '📝', desc: 'TXT or Markdown', requiresPDF: true,    color: '#4338ca', colorLight: '#e0e7ff' },
  { id: 'qrcode',      name: 'QR Code',     fullName: 'Add QR Code',          emoji: '⬛', desc: 'Insert scannable', requiresPDF: true,   color: '#0d9488', colorLight: '#ccfbf1' },
  { id: 'unlock',      name: 'Unlock PDF',  fullName: 'Remove Password',      emoji: '🔓', desc: 'Remove encryption',requiresPDF: true,   color: '#be185d', colorLight: '#fce7f3' },
  { id: 'headfoot',    name: 'Header/Footer',fullName: 'Add Header & Footer', emoji: '📑', desc: 'Top & bottom text', requiresPDF: true,   color: '#0369a1', colorLight: '#e0f2fe' },
  { id: 'grayscale',   name: 'Grayscale',   fullName: 'Convert to Grayscale', emoji: '⬜', desc: 'Remove colour',    requiresPDF: true,   color: '#374151', colorLight: '#f3f4f6' },
  { id: 'insertpage',  name: 'Insert Page', fullName: 'Insert / Duplicate Page',emoji:'➕',desc: 'Add blank or copy', requiresPDF: true,  color: '#059669', colorLight: '#d1fae5' },
  { id: 'splitn',      name: 'Split by N',  fullName: 'Split Every N Pages',  emoji: '📄', desc: 'Equal chunks',     requiresPDF: true,   color: '#7c3aed', colorLight: '#ede9fe' },
  { id: 'topptx',      name: 'PDF→PPTX',    fullName: 'PDF to PowerPoint',    emoji: '📊', desc: 'Slides from PDF',  requiresPDF: true,   color: '#ea580c', colorLight: '#ffedd5' },
  { id: 'hashcheck',   name: 'File Hash',   fullName: 'File Integrity (SHA-256)',emoji:'🔑',desc:'Verify integrity', requiresPDF: false,  color: '#6366f1', colorLight: '#e0e7ff' },
  { id: 'ocr',         name: 'OCR',         fullName: 'OCR — Make Searchable',    emoji:'🔎',desc:'Scan to text',     requiresPDF: true,   color: '#0891b2', colorLight: '#cffafe' },
  { id: 'aesencrypt',  name: 'Encrypt',     fullName: 'Encrypt / Decrypt (AES-256)',emoji:'🛡',desc:'Password-protect, truly',  requiresPDF: false,  color: '#7c3aed', colorLight: '#ede9fe' },
  // ── v6 NEW TOOLS ────────────────────────────────────────────────────────
  { id: 'readability',  name: 'Readability', fullName: 'Readability Score',        emoji:'📖',desc:'Reading level & stats',requiresPDF:true, color:'#0891b2',colorLight:'#cffafe' },
  { id: 'pdfcompare',   name: 'Compare',     fullName: 'Compare Two PDFs',         emoji:'⚖️',desc:'Diff two documents',  requiresPDF:true, color:'#7c3aed',colorLight:'#ede9fe' },
  { id: 'a11ycheck',    name: 'Accessibility',fullName:'Accessibility Checker',    emoji:'♿',desc:'WCAG/PDF-UA audit',   requiresPDF:true, color:'#059669',colorLight:'#d1fae5' },
  { id: 'flashcards',   name: 'Flashcards',  fullName: 'PDF → Flashcards',         emoji:'🃏',desc:'Study cards from doc', requiresPDF:true, color:'#f97316',colorLight:'#ffedd5' },
  { id: 'piiscan',      name: 'PII Scan',    fullName: 'Sensitive Data Scanner',   emoji:'🕵️',desc:'Find personal data',  requiresPDF:true, color:'#dc2626',colorLight:'#fee2e2' },
  { id: 'bookmarks',    name: 'Bookmarks',   fullName: 'PDF Bookmarks / TOC',      emoji:'🔖',desc:'Build table of contents',requiresPDF:true,color:'#b45309',colorLight:'#fef3c7' },
  { id: 'autocrop',     name: 'Auto-Crop',   fullName: 'Smart Auto-Crop',          emoji:'🎯',desc:'Detect & remove whitespace',requiresPDF:true,color:'#0891b2',colorLight:'#cffafe' },
  { id: 'tojson',       name: 'PDF→JSON',    fullName: 'PDF to Structured JSON',   emoji:'{}', desc:'Developer data export',requiresPDF:true,color:'#374151',colorLight:'#f3f4f6' },
  { id: 'fontinspect',  name: 'Fonts',       fullName: 'Font Inspector',           emoji:'Aa', desc:'Inspect embedded fonts',requiresPDF:true,color:'#4338ca',colorLight:'#e0e7ff' },
  { id: 'spellcheck',   name: 'Spell Check', fullName: 'PDF Spell Check',          emoji:'✓',  desc:'Grammar & spelling',  requiresPDF:true, color:'#15803d',colorLight:'#dcfce7' },
  { id: 'batchrules',   name: 'Batch Rules', fullName: 'Conditional Batch Rules',  emoji:'⚙️',desc:'IF/THEN automation',   requiresPDF:true, color:'#0369a1',colorLight:'#e0f2fe' },
  { id: 'macro',        name: 'Macro',       fullName: 'Record & Replay Macro',    emoji:'⏺', desc:'Automate sequences',   requiresPDF:false,color:'#6366f1',colorLight:'#e0e7ff' },
  { id: 'semanticgroup',name:'Page Groups',  fullName: 'Semantic Page Grouping',   emoji:'🧩',desc:'Auto-group by topic',  requiresPDF:true, color:'#0d9488',colorLight:'#ccfbf1' },
  { id: 'podcastscript',name:'Podcast Script',fullName:'PDF to Podcast Script',    emoji:'🎙',desc:'Read-aloud format',    requiresPDF:true, color:'#ea580c',colorLight:'#ffedd5' },
  { id: 'ankideck',     name: 'Anki Deck',   fullName: 'PDF to Anki Flashcards',  emoji:'🧠',desc:'Export study deck',    requiresPDF:true,color:'#7c3aed',colorLight:'#ede9fe' },
  { id: 'tilePrint',    name: 'Poster Print',fullName: 'Tiling / Poster Print',    emoji:'🖼',desc:'Scale to multi-sheet', requiresPDF:true,color:'#374151',colorLight:'#f3f4f6' },
  { id: 'emailhtml',    name: 'Email HTML',  fullName: 'PDF to Email HTML',        emoji:'✉️',desc:'Inline HTML for email', requiresPDF:true,color:'#0891b2',colorLight:'#cffafe' },
  { id: 'tamperseal',   name: 'Tamper Seal', fullName: 'Tamper-Evident Seal',      emoji:'🔏',desc:'Cryptographic proof',  requiresPDF:false,color:'#1c1917',colorLight:'#f5f5f4' },
  { id: 'recipe',       name: 'Recipe Link', fullName: 'Shareable Recipe URL',     emoji:'🔗',desc:'Share op chain URL',   requiresPDF:false,color:'#059669',colorLight:'#d1fae5' },
  { id: 'preflight',    name: 'Preflight',   fullName: 'Print Preflight (PDF/X)',  emoji:'🖨',desc:'Print-ready checklist', requiresPDF:true,color:'#dc2626',colorLight:'#fee2e2' },
  { id: 'microannot',   name: 'Annotations', fullName: 'Micro-Annotation Threads', emoji:'💬',desc:'Pin comments to pages', requiresPDF:true,color:'#f97316',colorLight:'#ffedd5' },
  { id: 'normalizesize',name:'Normalise',    fullName: 'Mixed Page Size Normaliser',emoji:'📐',desc:'Unify page sizes',    requiresPDF:true,color:'#6366f1',colorLight:'#e0e7ff' },
  { id: 'present',      name: 'Present',     fullName: 'Presentation Mode',        emoji:'🎬',desc:'Full-screen slideshow',requiresPDF:true,color:'#0d9488',colorLight:'#ccfbf1' },
  { id: 'inkestimate',  name: 'Ink Cost',    fullName: 'Ink Coverage Estimator',   emoji:'💰',desc:'Estimate print cost',  requiresPDF:true,color:'#374151',colorLight:'#f3f4f6' },
  { id: 'timeline',     name: 'Timeline',    fullName: 'Date/Timeline Extractor',  emoji:'📅',desc:'All dates in document',requiresPDF:true,color:'#0891b2',colorLight:'#cffafe' },
  { id: 'toneanalyse',  name: 'Tone',        fullName: 'Document Tone Analyser',   emoji:'🎭',desc:'Sentiment heatmap',    requiresPDF:true,color:'#7c3aed',colorLight:'#ede9fe' },
  { id: 'langdetect',   name: 'Language',    fullName: 'Language Detector',        emoji:'🌐',desc:'Detect text language', requiresPDF:true,color:'#059669',colorLight:'#d1fae5' },
  { id: 'citations',    name: 'Citations',   fullName: 'Citation & Ref Extractor', emoji:'📚',desc:'Extract references',   requiresPDF:true,color:'#b45309',colorLight:'#fef3c7' },
]

export default function PDFTools({
  files, selectedTool, onToolSelect, onProcessingStart,
  onProcessingComplete, selectedPages, onEditsChange,
  currentEdits = [], editMode, showStatus, pageOrder,
  onProgress, onSizeChange
}: PDFToolsProps) {
  const [compressionQuality, setCompressionQuality] = useState(0.7)
  const [convertFormat, setConvertFormat] = useState<'png' | 'jpg' | 'webp' | 'word'>('png')
  const [editText, setEditText] = useState('')
  const [editColor, setEditColor] = useState('#1e40af')
  const [editFontSize, setEditFontSize] = useState(14)
  const [pendingEdit, setPendingEdit] = useState<{ pageIndex: number; x: number; y: number } | null>(null)
  const [localEditMode, setLocalEditMode] = useState(editMode || false)
  const [batchMode, setBatchMode] = useState<'compress' | 'watermark' | 'rotate' | 'pagenum'>('compress')
  // Page number options
  const [pnPosition, setPnPosition] = useState<'bottom-center'|'bottom-right'|'bottom-left'|'top-center'|'top-right'|'top-left'>('bottom-center')
  const [pnFormat, setPnFormat] = useState<'1'|'Page 1'|'1 / N'|'- 1 -'>('1')
  const [pnStart, setPnStart] = useState(1)
  const [pnFontSize, setPnFontSize] = useState(11)
  // Sign
  const [signMode, setSignMode] = useState<'type' | 'draw' | 'upload'>('type')
  const [signText, setSignText] = useState('')
  const [signFont, setSignFont] = useState<'cursive' | 'monospace' | 'serif'>('cursive')
  const [signColor, setSignColor] = useState('#1e3a8a')
  const [signDataUrl, setSignDataUrl] = useState<string | null>(null)
  const [signPlaced, setSignPlaced] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  // Add Image
  const [addImgFile, setAddImgFile] = useState<File | null>(null)
  const [addImgPage, setAddImgPage] = useState(1)
  const [addImgX, setAddImgX] = useState(50)
  const [addImgY, setAddImgY] = useState(50)
  const [addImgW, setAddImgW] = useState(150)
  // Crop
  const [cropTop, setCropTop] = useState(0)
  const [cropBottom, setCropBottom] = useState(0)
  const [cropLeft, setCropLeft] = useState(0)
  const [cropRight, setCropRight] = useState(0)
  // Text/MD export
  const [textFmt, setTextFmt] = useState<'txt'|'md'>('txt')
  // QR
  const [qrUrl, setQrUrl] = useState('https://')
  const [qrPage, setQrPage] = useState(1)
  const [qrX, setQrX] = useState(20)
  const [qrY, setQrY] = useState(20)
  const [qrSize, setQrSize] = useState(80)
  // Redact draw state
  const [redactMode, setRedactMode] = useState(false)
  const [redactRegions, setRedactRegions] = useState<Array<{page:number;x:number;y:number;w:number;h:number}>>([])
  // Unlock
  const [unlockPassword, setUnlockPassword] = useState('')
  // Header/Footer
  const [hfHeader, setHfHeader] = useState('')
  const [hfFooter, setHfFooter] = useState('')
  const [hfAlign, setHfAlign] = useState<'left'|'center'|'right'>('center')
  const [hfFontSize, setHfFontSize] = useState(10)
  // Insert page
  const [insertAfter, setInsertAfter] = useState(1)
  const [insertType, setInsertType] = useState<'blank'|'duplicate'>('blank')
  // Split by N
  const [splitN, setSplitN] = useState(1)
  // Tool search
  const [toolSearch, setToolSearch] = useState('')
  const [dragOverTool, setDragOverTool] = useState<string|null>(null)
  // Hash result
  const [hashResult, setHashResult] = useState<{name:string;hash:string;size:number}|null>(null)
  // OCR
  const [ocrLang, setOcrLang] = useState('eng')
  // Password strength
  const [pwStrength, setPwStrength] = useState(0)
  const [pwValue, setPwValue] = useState('')
  // Mobile tool bottom sheet
  const [showMobileSheet, setShowMobileSheet] = useState(false)
  // Persistent defaults (loaded from localStorage)
  const [defaultCompressQ, setDefaultCompressQ] = useState<number|null>(null)
  const [defaultWmText, setDefaultWmText] = useState<string|null>(null)
  const [defaultPnPos, setDefaultPnPos] = useState<string|null>(null)
  // AES-256 encrypt
  const [aesPassword, setAesPassword] = useState('')
  const [aesMode, setAesMode] = useState<'encrypt'|'decrypt'>('encrypt')
  // Session history
  const [sessionLog, setSessionLog] = useState<Array<{tool:string;time:string;size?:string}>>([])
  // Expanded explainers
  const [expandedHelp, setExpandedHelp] = useState<string|null>(null)
  // Watermark options
  const [wmText, setWmText] = useState('CONFIDENTIAL')
  const [wmOpacity, setWmOpacity] = useState(0.35)
  const [wmColor, setWmColor] = useState('#888888')
  const [wmPosition, setWmPosition] = useState<'diagonal' | 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('diagonal')
  const [wmFontSize, setWmFontSize] = useState(48)
  // Metadata
  const [metaTitle, setMetaTitle] = useState('')
  // Freehand draw / highlight
  const [drawMode, setDrawMode] = useState<'pen'|'highlight'|'line'|'rect'|null>(null)
  const [drawColor, setDrawColor] = useState('#dc2626')
  const [drawWidth, setDrawWidth] = useState(3)
  const [fabricCanvas, setFabricCanvas] = useState<any>(null)
  const fabricCanvasRef = useRef<HTMLCanvasElement>(null)
  const [drawPageNum, setDrawPageNum] = useState(1)
  const [drawPageImg, setDrawPageImg] = useState<string|null>(null)
  const [metaAuthor, setMetaAuthor] = useState('')
  const [metaSubject, setMetaSubject] = useState('')
  const [metaKeywords, setMetaKeywords] = useState('')
  const handleToolActionRef = useRef<((id: string, fmt?: 'png' | 'jpg' | 'webp' | 'word') => Promise<void>) | null>(null)
  const [undoStack, setUndoStack] = useState<Blob[]>([])
  // ── v6 NEW STATE ──────────────────────────────────────────────────────────
  // Readability
  const [readabilityResult, setReadabilityResult] = useState<any>(null)
  const [readabilityLoading, setReadabilityLoading] = useState(false)
  // PDF Compare
  const [compareFile, setCompareFile] = useState<File|null>(null)
  const [compareResult, setCompareResult] = useState<any>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  // Accessibility
  const [a11yResult, setA11yResult] = useState<any>(null)
  const [a11yLoading, setA11yLoading] = useState(false)
  // PII Scan
  const [piiResult, setPiiResult] = useState<any[]|null>(null)
  const [piiLoading, setPiiLoading] = useState(false)
  // Bookmarks
  const [bookmarkList, setBookmarkList] = useState<Array<{page:number;label:string}>>([])
  // Spell Check
  const [spellResult, setSpellResult] = useState<any[]|null>(null)
  const [spellLoading, setSpellLoading] = useState(false)
  // Macro recorder
  const [macroRecording, setMacroRecording] = useState(false)
  const [macroSteps, setMacroSteps] = useState<any[]>([])
  const [macroName, setMacroName] = useState('')
  const [savedMacros, setSavedMacros] = useState<any[]>([])
  const [macroRunning, setMacroRunning] = useState(false)
  // Batch Rules
  const [batchRulesList, setBatchRulesList] = useState<BatchRule[]>([])
  const [batchRulesLoading, setBatchRulesLoading] = useState(false)
  // Flashcards
  const [flashcardList, setFlashcardList] = useState<any[]|null>(null)
  const [flashcardIdx, setFlashcardIdx] = useState(0)
  const [flashcardFlipped, setFlashcardFlipped] = useState(false)
  // Podcast Script
  const [podcastScript, setPodcastScript] = useState<string|null>(null)
  // Anki Deck
  const [ankiCards, setAnkiCards] = useState<any[]|null>(null)
  // Poster/Tile print
  const [tileCols, setTileCols] = useState(2)
  const [tileRows, setTileRows] = useState(2)
  const [tilePage, setTilePage] = useState(1)
  // Email HTML
  const [emailHtmlResult, setEmailHtmlResult] = useState<string|null>(null)
  // Tamper seal
  const [sealResult, setSealResult] = useState<any|null>(null)
  const [sealLoading, setSealLoading] = useState(false)
  const [sealVerifyResult, setSealVerifyResult] = useState<string|null>(null)
  // Recipe
  const [recipeUrl, setRecipeUrl] = useState<string|null>(null)
  // Preflight
  const [preflightResult, setPreflightResult] = useState<any|null>(null)
  const [preflightLoading, setPreflightLoading] = useState(false)
  // Micro-annotations
  const [annotations, setAnnotations] = useState<MicroAnnotation[]>([])
  const [annotText, setAnnotText] = useState('')
  const [annotPage, setAnnotPage] = useState(1)
  const [fileHash, setFileHash] = useState<string|null>(null)
  // Normalise page sizes
  const [pageSizes, setPageSizes] = useState<any[]|null>(null)
  const [normalizeTarget, setNormalizeTarget] = useState<'a4'|'letter'|'a3'>('a4')
  const [normalizeMode, setNormalizeMode] = useState<'fit'|'fill'|'pad'>('fit')
  // Presentation mode
  const [presentPage, setPresentPage] = useState(1)
  const [presentTotal, setPresentTotal] = useState(0)
  const [presentActive, setPresentActive] = useState(false)
  const [presentImages, setPresentImages] = useState<string[]>([])
  const [presentTimer, setPresentTimer] = useState(0)
  const presentTimerRef = useRef<any>(null)
  // Ink estimate
  const [inkResult, setInkResult] = useState<any|null>(null)
  const [inkLoading, setInkLoading] = useState(false)
  const [inkProgress, setInkProgress] = useState<{p:number;t:number}|null>(null)
  // Timeline
  const [timelineEvents, setTimelineEvents] = useState<any[]|null>(null)
  const [timelineLoading, setTimelineLoading] = useState(false)
  // Tone
  const [toneResult, setToneResult] = useState<any|null>(null)
  const [toneLoading, setToneLoading] = useState(false)
  // Language detect
  const [langResult, setLangResult] = useState<any|null>(null)
  const [langLoading, setLangLoading] = useState(false)
  // Citations
  const [citationList, setCitationList] = useState<any[]|null>(null)
  const [citationLoading, setCitationLoading] = useState(false)
  // Font inspect
  const [fontList, setFontList] = useState<any[]|null>(null)
  const [fontLoading, setFontLoading] = useState(false)
  // Semantic grouping
  const [semanticGroups, setSemanticGroups] = useState<any[]|null>(null)
  const [semanticLoading, setSemanticLoading] = useState(false)
  // JSON export
  const [jsonResult, setJsonResult] = useState<string|null>(null)
  // Auto-crop
  const [autoCropPreview, setAutoCropPreview] = useState<any|null>(null)
  const [autoCropLoading, setAutoCropLoading] = useState(false)

  useEffect(() => { if (editMode !== undefined) setLocalEditMode(editMode) }, [editMode])

  // Load persistent defaults
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('commandeditor-settings') || '{}')
      if (s.compressQ) { setDefaultCompressQ(s.compressQ); setCompressionQuality(s.compressQ) }
      if (s.wmText) { setDefaultWmText(s.wmText); setWmText(s.wmText) }
      if (s.pnPos) { setDefaultPnPos(s.pnPos); setPnPosition(s.pnPos) }
    } catch {}
  }, [])

  const saveSettings = () => {
    try {
      const s = { compressQ: compressionQuality, wmText, pnPos: pnPosition }
      localStorage.setItem('commandeditor-settings', JSON.stringify(s))
      showStatus('✓ Default settings saved')
    } catch {}
  }

  const hasPDFs = files.some(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))

  // ── Pre-flight warnings ──────────────────────────────────────────────────
  const getPreflightWarnings = (toolId: string): string[] => {
    const warnings: string[] = []
    if (files.length === 0) return warnings
    const sizeMB = files.reduce((s, f) => s + f.size, 0) / (1024 * 1024)
    if (sizeMB > 20) warnings.push(`Large file (${sizeMB.toFixed(1)} MB) — processing may take 30–60 s`)
    if (!hasPDFs && ['compress','rotate','split','watermark','sign','addimage','totext','crop','qrcode','redact'].includes(toolId))
      warnings.push('No PDF found — upload a PDF file first')
    if (toolId === 'merge' && pdfFiles.length < 2) warnings.push('Upload 2 or more PDFs to merge')
    if (toolId === 'split' && selectedPages.length === 0) warnings.push('Select pages in the preview below')
    if (toolId === 'batch' && files.length < 2) warnings.push('Upload multiple files for batch processing')
    return warnings
  }

  // ── Speed estimate ────────────────────────────────────────────────────────
  const getSpeedEstimate = (toolId: string): string | null => {
    const sizeMB = files.reduce((s, f) => s + f.size, 0) / (1024 * 1024)
    const slowTools = ['compress','flatten','convert','extractimgs','toexcel','totext','batch']
    if (!slowTools.includes(toolId)) return null
    if (sizeMB < 1) return '~1–2 s'
    if (sizeMB < 5) return '~3–8 s'
    if (sizeMB < 15) return '~10–25 s'
    return '~30–60 s'
  }
  const hasImages = files.some(f => f.type.startsWith('image/') || f.name.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/i))
  const hasWord = files.some(f => f.type.includes('wordprocessingml') || f.type === 'application/msword' || f.name.match(/\.docx?$/i))
  const hasText = files.some(f => f.type === 'text/plain' || f.name.endsWith('.txt'))
  const hasMarkdown = files.some(f => f.name.match(/\.md|\.markdown$/i))
  const hasHTML = files.some(f => f.type === 'text/html' || f.name.match(/\.html?$/i))
  const hasConvertible = hasImages || hasWord || hasText || hasMarkdown || hasHTML
  const pdfFiles = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))

  // Helper: extract text by page using pdfjs
  const extractTextByPage = async (file: File): Promise<Array<{page:number;text:string}>> => {
    const pdfjsLib = await import('pdfjs-dist')
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
    const pages: Array<{page:number;text:string}> = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const p = await pdf.getPage(i)
      const tc = await p.getTextContent()
      const text = (tc.items as any[]).map((it: any) => it.str || '').join(' ')
      pages.push({ page: i, text })
    }
    return pages
  }

  // Helper: render PDF pages to images
  const renderPDFToImages = async (file: File, scale = 1.2): Promise<string[]> => {
    const pdfjsLib = await import('pdfjs-dist')
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
    const images: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = vp.width; canvas.height = vp.height
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
      images.push(canvas.toDataURL('image/jpeg', 0.85))
    }
    return images
  }

  const pushUndo = useCallback((blob: Blob) => {
    setUndoStack((prev: Blob[]) => [...prev.slice(-4), blob])
  }, [])

  const logSession = useCallback((toolName: string, resultSize?: number) => {
    const now = new Date()
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const size = resultSize ? `${(resultSize / 1024).toFixed(0)} KB` : undefined
    setSessionLog(prev => [{ tool: toolName, time, size }, ...prev.slice(0, 9)])
  }, [])

  const handleToolAction = async (toolId: string, overrideFormat?: 'png' | 'jpg' | 'webp' | 'word') => {
    const fmt = overrideFormat || convertFormat
    if (files.length === 0) { showStatus('Upload files first'); return }

    // Macro recording hook
    if (macroRecording) {
      setMacroSteps(prev => [...prev, { toolId, params: { fmt }, timestamp: Date.now() }])
      showStatus(`⏺ Recorded: ${toolId}`)
    }

    if (toolId === 'edit') {
      const next = !localEditMode
      setLocalEditMode(next)
      onToolSelect(next ? 'edit' : '')
      if (!next) { setPendingEdit(null); setEditText('') }
      return
    }

    if (toolId === 'metadata') {
      onToolSelect('metadata')
      // Load existing metadata if possible
      try {
        const { PDFDocument } = await import('pdf-lib')
        const doc = await PDFDocument.load(await pdfFiles[0].arrayBuffer())
        setMetaTitle(doc.getTitle() || '')
        setMetaAuthor(doc.getAuthor() || '')
        setMetaSubject(doc.getSubject() || '')
        setMetaKeywords(doc.getKeywords() || '')
      } catch {}
      return
    }

    if (toolId === 'toPDF') {
      if (!hasConvertible) { showStatus('Upload images, Word, Text, HTML, or Markdown'); return }
      onProcessingStart()
      try {
        let result: Blob
        const file = files[0]
        if (hasWord && files.length === 1) result = await convertWordToPDF(file)
        else if (hasText && files.length === 1) result = await convertTextToPDF(file)
        else if (hasMarkdown && files.length === 1) result = await convertMarkdownToPDF(file)
        else if (hasHTML && files.length === 1) result = await convertHTMLFileToPDF(file)
        else if (hasImages) result = await convertImagesToPDF(files.filter(f => f.type.startsWith('image/') || f.name.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/i)))
        else throw new Error('Unsupported type')
        onProcessingComplete(result, toolId)
      } catch (e: any) { showStatus(e.message || 'Conversion failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'rotate') {
      if (!hasPDFs) { showStatus('Upload a PDF to rotate'); return }
      onProcessingStart()
      try {
        const { PDFDocument, degrees } = await import('pdf-lib')
        const src = await PDFDocument.load(await pdfFiles[0].arrayBuffer())
        src.getPages().forEach((p: any) => p.setRotation(degrees((p.getRotation().angle + 90) % 360)))
        const bytes = await src.save()
        const blob = pdfBlob(bytes)
        pushUndo(blob)
        onProcessingComplete(blob, toolId)
      } catch (e: any) { showStatus(e.message || 'Rotate failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'watermark') {
      if (!hasPDFs) { showStatus('Upload a PDF to watermark'); return }
      onProcessingStart()
      try {
        const { PDFDocument, rgb, StandardFonts, degrees } = await import('pdf-lib')
        const doc = await PDFDocument.load(await pdfFiles[0].arrayBuffer())
        const font = await doc.embedFont(StandardFonts.HelveticaBold)
        // Parse color
        const hex = wmColor.replace('#', '')
        const r = parseInt(hex.slice(0,2),16)/255
        const g = parseInt(hex.slice(2,4),16)/255
        const b2 = parseInt(hex.slice(4,6),16)/255
        doc.getPages().forEach((page: any) => {
          const { width, height } = page.getSize()
          const textWidth = font.widthOfTextAtSize(wmText, wmFontSize)
          let x = 0, y = 0, rot = 0
          if (wmPosition === 'diagonal') { x = width/2 - textWidth/2; y = height/2 - wmFontSize/2; rot = 45 }
          else if (wmPosition === 'center') { x = width/2 - textWidth/2; y = height/2 - wmFontSize/2; rot = 0 }
          else if (wmPosition === 'top-left') { x = 30; y = height - 60; rot = 0 }
          else if (wmPosition === 'top-right') { x = width - textWidth - 30; y = height - 60; rot = 0 }
          else if (wmPosition === 'bottom-left') { x = 30; y = 30; rot = 0 }
          else { x = width - textWidth - 30; y = 30; rot = 0 }
          page.drawText(wmText, { x, y, size: wmFontSize, font, color: rgb(r, g, b2), rotate: degrees(rot), opacity: wmOpacity })
        })
        const bytes = await doc.save()
        const blob = pdfBlob(bytes)
        pushUndo(blob)
        onProcessingComplete(blob, toolId)
      } catch (e: any) { showStatus(e.message || 'Watermark failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'aesencrypt') {
      if (files.length === 0) { showStatus('Upload a file first'); return }
      if (!aesPassword) { showStatus(aesMode === 'decrypt' ? 'Enter the password to decrypt' : 'Enter a password for encryption'); return }
      onProcessingStart()
      try {
        const file = files[0]
        const fileData = await file.arrayBuffer()
        const enc = new TextEncoder()
        if (aesMode === 'decrypt') {
          // Decrypt: unpack salt(16) + iv(12) + ciphertext, derive key, decrypt
          const raw = new Uint8Array(fileData)
          if (raw.byteLength < 28) throw new Error('This file is too small to be an encrypted CommandEditor file')
          const salt = raw.slice(0, 16)
          const iv = raw.slice(16, 28)
          const ciphertext = raw.slice(28)
          const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(aesPassword), 'PBKDF2', false, ['deriveKey'])
          const key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
          )
          const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
          const blob = new Blob([decrypted], { type: 'application/octet-stream' })
          onProcessingComplete(blob, toolId)
          showStatus('✓ File decrypted successfully.')
        } else {
          const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(aesPassword), 'PBKDF2', false, ['deriveKey'])
          const salt = crypto.getRandomValues(new Uint8Array(16))
          const iv = crypto.getRandomValues(new Uint8Array(12))
          const key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
          )
          const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileData)
          // Package: 16-byte salt + 12-byte IV + ciphertext
          const output = new Uint8Array(salt.length + iv.length + encrypted.byteLength)
          output.set(salt, 0); output.set(iv, 16)
          output.set(new Uint8Array(encrypted), 28)
          const blob = new Blob([output], { type: 'application/octet-stream' })
          onProcessingComplete(blob, toolId)
          showStatus('✓ File encrypted with AES-256. Keep your password safe — it cannot be recovered.')
        }
      } catch(e:any) {
        const failMsg = aesMode === 'decrypt' ? 'Decryption failed — wrong password or not a CommandEditor-encrypted file.' : 'Encryption failed: ' + e.message
        showStatus(failMsg); onProcessingComplete(new Blob())
      }
      return
    }

    // ── v6 NEW TOOL HANDLERS ────────────────────────────────────────────────

    if (toolId === 'readability') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      setReadabilityLoading(true); onToolSelect('readability')
      try {
        const pages = await extractTextByPage(pdfFiles[0])
        const fullText = pages.map(p => p.text).join(' ')
        const result = computeReadability(fullText)
        setReadabilityResult(result)
      } catch(e:any) { showStatus('Analysis failed: ' + e.message) }
      setReadabilityLoading(false); return
    }

    if (toolId === 'pdfcompare') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      if (!compareFile) { showStatus('Choose a second PDF to compare in the panel'); onToolSelect('pdfcompare'); return }
      setCompareLoading(true); onToolSelect('pdfcompare')
      try {
        const pagesA = await extractTextByPage(pdfFiles[0])
        const pagesB = await extractTextByPage(compareFile)
        const diffs = diffPDFTexts(pagesA, pagesB)
        setCompareResult(diffs)
      } catch(e:any) { showStatus('Compare failed: ' + e.message) }
      setCompareLoading(false); return
    }

    if (toolId === 'a11ycheck') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      setA11yLoading(true); onToolSelect('a11ycheck')
      try {
        const pdfjsLib = await import('pdfjs-dist')
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
        const pdf = await pdfjsLib.getDocument({ data: await pdfFiles[0].arrayBuffer() }).promise
        const checks: Array<{id:string;label:string;pass:boolean;detail:string;severity:'critical'|'warning'|'info'}> = []
        // Check 1: Text layer present
        const p1 = await pdf.getPage(1)
        const tc = await p1.getTextContent()
        const hasText = (tc.items as any[]).some((it:any) => it.str?.trim())
        checks.push({ id:'text', label:'Text Layer Present', pass: hasText, detail: hasText ? 'Document has searchable text.' : 'No text layer found — screen readers cannot read this document.', severity:'critical' })
        // Check 2: Document title in metadata
        const meta = await pdf.getMetadata().catch(() => null)
        const hasTitle = !!(meta as any)?.info?.Title
        checks.push({ id:'title', label:'Document Title Set', pass: hasTitle, detail: hasTitle ? 'Title metadata present.' : 'No document title — add via Metadata tool.', severity:'warning' })
        // Check 3: Page count
        checks.push({ id:'pages', label:'Not Blank', pass: pdf.numPages > 0, detail: `\${pdf.numPages} page(s) detected.`, severity:'info' })
        // Check 4: Images without alt (can't fully detect without tags but flag if image-heavy)
        const ops = await p1.getOperatorList()
        const imgCount = ops.fnArray.filter((f:number) => f === 85 || f === 83).length
        checks.push({ id:'alttext', label:'Image Alt Text', pass: imgCount === 0, detail: imgCount > 0 ? `\${imgCount} images detected on page 1 — ensure alt text is set in the original document.` : 'No images detected on first page.', severity:'warning' })
        // Check 5: File size
        const sizeMB = pdfFiles[0].size / 1024 / 1024
        checks.push({ id:'size', label:'Reasonable File Size', pass: sizeMB < 10, detail: `File is \${sizeMB.toFixed(1)} MB. \${sizeMB > 10 ? 'Large files may be inaccessible to users with slow connections.' : 'Size is acceptable.'}`, severity:'info' })
        setA11yResult(checks)
      } catch(e:any) { showStatus('Accessibility check failed: ' + e.message) }
      setA11yLoading(false); return
    }

    if (toolId === 'piiscan') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      setPiiLoading(true); onToolSelect('piiscan')
      try {
        const pages = await extractTextByPage(pdfFiles[0])
        const findings = scanForPII(pages)
        setPiiResult(findings)
      } catch(e:any) { showStatus('PII scan failed: ' + e.message) }
      setPiiLoading(false); return
    }

    if (toolId === 'bookmarks') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onToolSelect('bookmarks')
      if (bookmarkList.length === 0) {
        // Pre-populate with page list
        setBookmarkList(Array.from({ length: Math.min(5, 10) }, (_, i) => ({ page: i+1, label: `Section \${i+1}` })))
      }
      return
    }

    if (toolId === 'spellcheck') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      setSpellLoading(true); onToolSelect('spellcheck')
      try {
        const pages = await extractTextByPage(pdfFiles[0])
        const errors = spellCheckText(pages)
        setSpellResult(errors)
      } catch(e:any) { showStatus('Spell check failed: ' + e.message) }
      setSpellLoading(false); return
    }

    if (toolId === 'macro') {
      onToolSelect('macro')
      const macros = loadMacros()
      setSavedMacros(macros)
      return
    }

    if (toolId === 'batchrules') {
      if (!hasPDFs) { showStatus('Upload PDFs'); return }
      onToolSelect('batchrules')
      setBatchRulesList(loadBatchRules())
      return
    }

    if (toolId === 'semanticgroup') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      setSemanticLoading(true); onToolSelect('semanticgroup')
      try {
        const pages = await extractTextByPage(pdfFiles[0])
        const groups = groupPagesBySemantic(pages)
        setSemanticGroups(groups)
      } catch(e:any) { showStatus('Grouping failed: ' + e.message) }
      setSemanticLoading(false); return
    }

    if (toolId === 'podcastscript') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onToolSelect('podcastscript')
      try {
        const pages = await extractTextByPage(pdfFiles[0])
        const fullText = pages.map(p => p.text).join('\n\n')
        const script = formatAsPodcastScript(fullText, pdfFiles[0].name.replace('.pdf',''))
        setPodcastScript(script)
      } catch(e:any) { showStatus('Script generation failed: ' + e.message) }
      return
    }

    if (toolId === 'ankideck') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onToolSelect('ankideck')
      try {
        const pages = await extractTextByPage(pdfFiles[0])
        const fullText = pages.map(p => p.text).join('\n\n')
        const cards = extractFlashcards(fullText)
        setAnkiCards(cards)
        setFlashcardList(cards)
      } catch(e:any) { showStatus('Card extraction failed: ' + e.message) }
      return
    }

    if (toolId === 'flashcards') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onToolSelect('flashcards')
      try {
        const pages = await extractTextByPage(pdfFiles[0])
        const fullText = pages.map(p => p.text).join('\n\n')
        const cards = extractFlashcards(fullText)
        setFlashcardList(cards)
        setFlashcardIdx(0)
        setFlashcardFlipped(false)
      } catch(e:any) { showStatus('Flashcard generation failed: ' + e.message) }
      return
    }

    if (toolId === 'tilePrint') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onToolSelect('tilePrint')
      return
    }

    if (toolId === 'emailhtml') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onToolSelect('emailhtml')
      onProcessingStart()
      try {
        const html = await pdfToEmailHTML(pdfFiles[0])
        setEmailHtmlResult(html)
        const blob = new Blob([html], { type: 'text/html' })
        onProcessingComplete(blob, toolId)
        showStatus('✓ Email-ready HTML generated')
      } catch(e:any) { showStatus('HTML export failed: ' + e.message); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'tamperseal') {
      onToolSelect('tamperseal')
      setSealLoading(true)
      try {
        if (files.length === 0) { showStatus('Upload a file first'); setSealLoading(false); return }
        const seal = await createTamperSeal(files[0])
        setSealResult(seal)
        showStatus('✓ Tamper seal created — save the JSON to verify later')
      } catch(e:any) { showStatus('Seal failed: ' + e.message) }
      setSealLoading(false); return
    }

    if (toolId === 'recipe') {
      onToolSelect('recipe')
      return
    }

    if (toolId === 'preflight') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      setPreflightLoading(true); onToolSelect('preflight')
      try {
        const report = await runPrintPreflight(pdfFiles[0])
        setPreflightResult(report)
      } catch(e:any) { showStatus('Preflight failed: ' + e.message) }
      setPreflightLoading(false); return
    }

    if (toolId === 'microannot') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onToolSelect('microannot')
      const hash = await sha256File(pdfFiles[0])
      setFileHash(hash)
      setAnnotations(loadAnnotations(hash))
      return
    }

    if (toolId === 'normalizesize') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onToolSelect('normalizesize')
      try {
        const sizes = await detectPageSizes(pdfFiles[0])
        setPageSizes(sizes)
      } catch(e:any) { showStatus('Size detection failed: ' + e.message) }
      return
    }

    if (toolId === 'present') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onToolSelect('present')
      try {
        showStatus('Rendering slides…', 8000)
        const images = await renderPDFToImages(pdfFiles[0], 1.5)
        setPresentImages(images)
        setPresentTotal(images.length)
        setPresentPage(1)
        setPresentActive(true)
        setPresentTimer(0)
        if (presentTimerRef.current) clearInterval(presentTimerRef.current)
        presentTimerRef.current = setInterval(() => setPresentTimer((t:number) => t + 1), 1000)
        showStatus('✓ Presentation mode ready — press Escape to exit')
      } catch(e:any) { showStatus('Render failed: ' + e.message) }
      return
    }

    if (toolId === 'inkestimate') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      setInkLoading(true); onToolSelect('inkestimate')
      try {
        const result = await estimateInkCoverage(pdfFiles[0], (p:number, t:number) => setInkProgress({p,t}))
        setInkResult(result)
        setInkProgress(null)
      } catch(e:any) { showStatus('Ink estimate failed: ' + e.message) }
      setInkLoading(false); return
    }

    if (toolId === 'timeline') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      setTimelineLoading(true); onToolSelect('timeline')
      try {
        const pages = await extractTextByPage(pdfFiles[0])
        const events = extractTimeline(pages)
        setTimelineEvents(events)
      } catch(e:any) { showStatus('Timeline extraction failed: ' + e.message) }
      setTimelineLoading(false); return
    }

    if (toolId === 'toneanalyse') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      setToneLoading(true); onToolSelect('toneanalyse')
      try {
        const pages = await extractTextByPage(pdfFiles[0])
        const result = analyseTone(pages)
        setToneResult(result)
      } catch(e:any) { showStatus('Tone analysis failed: ' + e.message) }
      setToneLoading(false); return
    }

    if (toolId === 'langdetect') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      setLangLoading(true); onToolSelect('langdetect')
      try {
        const pages = await extractTextByPage(pdfFiles[0])
        const fullText = pages.map(p => p.text).join(' ')
        const result = detectLanguage(fullText)
        setLangResult(result)
      } catch(e:any) { showStatus('Language detection failed: ' + e.message) }
      setLangLoading(false); return
    }

    if (toolId === 'citations') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      setCitationLoading(true); onToolSelect('citations')
      try {
        const pages = await extractTextByPage(pdfFiles[0])
        const refs = extractCitations(pages)
        setCitationList(refs)
      } catch(e:any) { showStatus('Citation extraction failed: ' + e.message) }
      setCitationLoading(false); return
    }

    if (toolId === 'fontinspect') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      setFontLoading(true); onToolSelect('fontinspect')
      try {
        const fonts = await inspectFonts(pdfFiles[0])
        setFontList(fonts)
      } catch(e:any) { showStatus('Font inspection failed: ' + e.message) }
      setFontLoading(false); return
    }

    if (toolId === 'tojson') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onProcessingStart()
      try {
        const pages = await extractTextByPage(pdfFiles[0])
        const json = JSON.stringify({ source: pdfFiles[0].name, pages }, null, 2)
        setJsonResult(json)
        const blob = new Blob([json], { type: 'application/json' })
        onProcessingComplete(blob, toolId)
        showStatus('✓ PDF exported as structured JSON')
      } catch(e:any) { showStatus('JSON export failed: ' + e.message); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'autocrop') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      setAutoCropLoading(true); onToolSelect('autocrop')
      try {
        // Render first page and detect content bounds
        const pdfjsLib = await import('pdfjs-dist')
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
        const pdf = await pdfjsLib.getDocument({ data: await pdfFiles[0].arrayBuffer() }).promise
        const page = await pdf.getPage(1)
        const vp = page.getViewport({ scale: 0.5 })
        const canvas = document.createElement('canvas')
        canvas.width = vp.width; canvas.height = vp.height
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
        const ctx = canvas.getContext('2d')!
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const w = canvas.width, h = canvas.height, d = data.data
        const isWhite = (x:number,y:number) => { const i=(y*w+x)*4; return d[i]>240&&d[i+1]>240&&d[i+2]>240 }
        let top=0, bottom=h-1, left=0, right=w-1
        while (top < h && Array.from({length:w},(_,x)=>isWhite(x,top)).every(Boolean)) top++
        while (bottom > top && Array.from({length:w},(_,x)=>isWhite(x,bottom)).every(Boolean)) bottom--
        while (left < w && Array.from({length:h},(_,y)=>isWhite(left,y)).every(Boolean)) left++
        while (right > left && Array.from({length:h},(_,y)=>isWhite(right,y)).every(Boolean)) right--
        const scale = 2  // because we rendered at 0.5
        setAutoCropPreview({ top:top*scale, bottom:(h-bottom)*scale, left:left*scale, right:(w-right)*scale })
        showStatus('✓ Content bounds detected — click Apply to crop')
      } catch(e:any) { showStatus('Auto-crop analysis failed: ' + e.message) }
      setAutoCropLoading(false); return
    }

    if (toolId === 'autocrop_apply') {
      if (!hasPDFs || !autoCropPreview) { showStatus('Run Auto-Crop analysis first'); return }
      onProcessingStart()
      try {
        const blob = await cropPDF(pdfFiles[0], { top: autoCropPreview.top, bottom: autoCropPreview.bottom, left: autoCropPreview.left, right: autoCropPreview.right })
        pushUndo(blob); onProcessingComplete(blob, toolId)
        showStatus('✓ Margins auto-cropped')
      } catch(e:any) { showStatus(e.message||'Crop failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'tilePrint_apply') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onProcessingStart()
      try {
        const blob = await tilePDFPage(pdfFiles[0], { cols: tileCols, rows: tileRows, overlap: 10, pageSize: 'A4', addCropMarks: true, addAlignmentGuides: true })
        pushUndo(blob); onProcessingComplete(blob, toolId)
        showStatus(`✓ Tiled \${tileCols}×\${tileRows} poster created`)
      } catch(e:any) { showStatus(e.message||'Tile failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'bookmarks_apply') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onProcessingStart()
      try {
        const { PDFDocument } = await import('pdf-lib')
        const doc = await PDFDocument.load(await pdfFiles[0].arrayBuffer())
        // pdf-lib v1 does not expose outline writing via a simple API;
        // We embed bookmarks as named destinations in metadata as a workaround
        const ctx = doc.context
        const pages = doc.getPages()
        doc.setTitle(bookmarkList.map(b=>`p\${b.page}:\${b.label}`).join('|'))
        const bytes = await doc.save()
        const blob = pdfBlob(bytes)
        onProcessingComplete(blob, toolId)
        showStatus('✓ Bookmarks embedded in metadata')
      } catch(e:any) { showStatus(e.message||'Bookmark failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'normalizesize_apply') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onProcessingStart()
      try {
        const targets: Record<string,[number,number]> = { a4:[595,842], letter:[612,792], a3:[842,1190] }
        const [tw, th] = targets[normalizeTarget]
        const blob = await normalisePageSizes(pdfFiles[0], tw, th, normalizeMode)
        pushUndo(blob); onProcessingComplete(blob, toolId)
        showStatus(`✓ All pages normalised to \${normalizeTarget.toUpperCase()}`)
      } catch(e:any) { showStatus(e.message||'Normalise failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'pagenum') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onProcessingStart()
      try {
        const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib')
        const doc = await PDFDocument.load(await pdfFiles[0].arrayBuffer())
        const font = await doc.embedFont(StandardFonts.Helvetica)
        doc.getPages().forEach((page: any, i: number) => {
          const { width } = page.getSize()
          page.drawText(`${i + 1}`, { x: width/2 - 6, y: 24, size: 11, font, color: rgb(0.4, 0.4, 0.4) })
        })
        const bytes = await doc.save()
        const blob = pdfBlob(bytes)
        pushUndo(blob)
        onProcessingComplete(blob, toolId)
      } catch (e: any) { showStatus(e.message || 'Failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'extractimgs') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onSizeChange?.(pdfFiles[0].size)
      onProcessingStart()
      try {
        const blob = await extractImagesPDF(pdfFiles[0], (p: number, t: number) => onProgress?.(p, t))
        onProcessingComplete(blob, toolId)
      } catch (e: any) { showStatus(e.message || 'Extract failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'flatten') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onSizeChange?.(pdfFiles[0].size)
      onProcessingStart()
      try {
        const blob = await flattenPDF(pdfFiles[0], (p: number, t: number) => onProgress?.(p, t))
        pushUndo(blob)
        onProcessingComplete(blob, toolId)
      } catch (e: any) { showStatus(e.message || 'Flatten failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'batch') {
      if (!hasPDFs || pdfFiles.length < 1) { showStatus('Upload at least 1 PDF for batch processing'); return }
      onProcessingStart()
      try {
        const { default: JSZip } = await import('jszip')
        const zip = new JSZip()
        const folder = zip.folder('batch-output')!
        for (let fi = 0; fi < pdfFiles.length; fi++) {
          const file = pdfFiles[fi]
          showStatus(`Processing ${fi + 1} of ${pdfFiles.length}: ${file.name}…`, 60000)
          let result: Blob
          if (batchMode === 'compress') {
            result = await compressPDF(file, compressionQuality)
          } else if (batchMode === 'watermark') {
            const { PDFDocument, rgb, StandardFonts, degrees } = await import('pdf-lib')
            const doc = await PDFDocument.load(await file.arrayBuffer())
            const font = await doc.embedFont(StandardFonts.HelveticaBold)
            const hex = wmColor.replace('#', '')
            const r = parseInt(hex.slice(0,2),16)/255, g = parseInt(hex.slice(2,4),16)/255, b2 = parseInt(hex.slice(4,6),16)/255
            doc.getPages().forEach((page: any) => {
              const { width, height } = page.getSize()
              const tw = font.widthOfTextAtSize(wmText, wmFontSize)
              page.drawText(wmText, { x: width/2-tw/2, y: height/2-wmFontSize/2, size: wmFontSize, font, color: rgb(r,g,b2), rotate: degrees(wmPosition==='diagonal'?45:0), opacity: wmOpacity })
            })
            result = pdfBlob(await doc.save())
          } else if (batchMode === 'rotate') {
            const { PDFDocument, degrees } = await import('pdf-lib')
            const doc = await PDFDocument.load(await file.arrayBuffer())
            doc.getPages().forEach((p: any) => p.setRotation(degrees((p.getRotation().angle + 90) % 360)))
            result = pdfBlob(await doc.save())
          } else {
            const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib')
            const doc = await PDFDocument.load(await file.arrayBuffer())
            const font = await doc.embedFont(StandardFonts.Helvetica)
            doc.getPages().forEach((page: any, i: number) => { const { width } = page.getSize(); page.drawText(`${i+1}`, { x: width/2-6, y: 24, size: 11, font, color: rgb(0.4,0.4,0.4) }) })
            result = pdfBlob(await doc.save())
          }
          const base = file.name.replace(/\.pdf$/i, '')
          folder.file(`${base}-${batchMode}.pdf`, await result.arrayBuffer())
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        onProcessingComplete(new Blob([await zipBlob.arrayBuffer()], { type: 'application/zip' }))
        showStatus(`✓ Batch complete — ${pdfFiles.length} files processed`)
      } catch (e: any) { showStatus(e.message || 'Batch failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'sign') {
      onToolSelect('sign')
      return
    }

    if (toolId === 'addimage') {
      onToolSelect('addimage')
      return
    }

    if (toolId === 'toexcel') {
      if (!hasPDFs) { showStatus('Upload a PDF to extract tables'); return }
      onSizeChange?.(pdfFiles[0].size)
      onProcessingStart()
      try {
        // Extract text layer per page, detect tabular patterns, export as CSV
        const pdfjsLib = await import('pdfjs-dist')
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc)
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
        const pdf = await pdfjsLib.getDocument({ data: await pdfFiles[0].arrayBuffer() }).promise
        const rows: string[][] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const tc = await page.getTextContent()
          // Group items by approximate Y position (row detection)
          const byY = new Map<number, string[]>()
          ;(tc.items as any[]).forEach((item: any) => {
            const y = Math.round(item.transform[5] / 8) * 8  // bucket to 8pt rows
            if (!byY.has(y)) byY.set(y, [])
            byY.get(y)!.push(item.str.replace(/,/g, ' '))
          })
          if (i > 1) rows.push([`--- Page ${i} ---`])
          // Sort rows top-to-bottom (higher Y = higher on page in PDF coords)
          const sorted = [...byY.entries()].sort((a, b) => b[0] - a[0])
          sorted.forEach(([, cells]) => {
            if (cells.join('').trim()) rows.push(cells)
          })
        }
        const csv = rows.map((r: string[]) => r.join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        // Auto-download CSV
        const base = pdfFiles[0].name.replace(/\.pdf$/i, '')
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url
        a.download = `${base}-tables.csv`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        onProcessingComplete(new Blob()); onToolSelect('')
        showStatus(`✓ CSV exported — ${rows.length} rows from ${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}`)
      } catch (e: any) { showStatus(e.message || 'Export failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'totext') {
      if (!hasPDFs) { showStatus('Upload a PDF to extract text'); return }
      onSizeChange?.(pdfFiles[0].size)
      onProcessingStart()
      try {
        const blob = await extractTextFromPDF(pdfFiles[0], textFmt, (p:number,t:number) => onProgress?.(p,t))
        const base = pdfFiles[0].name.replace(/\.pdf$/i,'')
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `${base}.${textFmt}`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        onProcessingComplete(new Blob()); onToolSelect('')
        showStatus(`✓ Text exported as .${textFmt}`)
      } catch(e:any) { showStatus(e.message||'Export failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'crop') {
      if (!hasPDFs) { showStatus('Upload a PDF to crop'); return }
      onSizeChange?.(pdfFiles[0].size)
      onProcessingStart()
      try {
        const blob = await cropPDF(pdfFiles[0], { top: cropTop, right: cropRight, bottom: cropBottom, left: cropLeft })
        onProcessingComplete(blob, toolId)
        showStatus('✓ Pages cropped')
      } catch(e:any) { showStatus(e.message||'Crop failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'qrcode') {
      if (!hasPDFs) { showStatus('Upload a PDF to add QR code'); return }
      if (!qrUrl || qrUrl === 'https://') { showStatus('Enter a URL for the QR code'); return }
      onSizeChange?.(pdfFiles[0].size)
      onProcessingStart()
      try {
        const blob = await addQRToPDF(pdfFiles[0], qrUrl, qrPage, qrX, qrY, qrSize)
        onProcessingComplete(blob, toolId)
        showStatus('✓ QR code added')
      } catch(e:any) { showStatus(e.message||'QR failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'redact') {
      if (!hasPDFs) { showStatus('Upload a PDF to redact'); return }
      if (redactRegions.length === 0) { showStatus('Draw redaction boxes on the page thumbnails first'); return }
      onSizeChange?.(pdfFiles[0].size)
      pushUndo(new Blob([await pdfFiles[0].arrayBuffer()],{type:'application/pdf'}))
      onProcessingStart()
      try {
        const blob = await redactPDF(pdfFiles[0], redactRegions)
        onProcessingComplete(blob, toolId)
        setRedactRegions([])
        showStatus(`✓ ${redactRegions.length} region${redactRegions.length>1?'s':''} redacted permanently`)
      } catch(e:any) { showStatus(e.message||'Redact failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'unlock') {
      if (!hasPDFs) { showStatus('Upload a PDF to unlock'); return }
      if (!unlockPassword) { showStatus('Enter the PDF password first'); return }
      onProcessingStart()
      try {
        const blob = await removePasswordPDF(pdfFiles[0], unlockPassword)
        pushUndo(blob)
        logSession('Unlock PDF', blob.size)
        onProcessingComplete(blob, toolId)
        showStatus('✓ Password removed')
        setUnlockPassword('')
      } catch(e:any) { showStatus('Wrong password or file not encrypted'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'headfoot') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      if (!hfHeader && !hfFooter) { showStatus('Enter header or footer text'); return }
      onProcessingStart()
      try {
        const blob = await addHeaderFooterPDF(pdfFiles[0], {
          header: hfHeader || undefined,
          footer: hfFooter || undefined,
          align: hfAlign, fontSize: hfFontSize,
        })
        pushUndo(blob)
        logSession('Header/Footer', blob.size)
        onProcessingComplete(blob, toolId)
        showStatus('✓ Header/footer added')
      } catch(e:any) { showStatus(e.message||'Failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'grayscale') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onSizeChange?.(pdfFiles[0].size)
      onProcessingStart()
      try {
        const blob = await grayscalePDF(pdfFiles[0], (p:number,t:number) => onProgress?.(p,t))
        pushUndo(blob)
        logSession('Grayscale', blob.size)
        onProcessingComplete(blob, toolId)
        showStatus('✓ Converted to grayscale')
      } catch(e:any) { showStatus(e.message||'Failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'insertpage') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onProcessingStart()
      try {
        const blob = await insertPagePDF(pdfFiles[0], { after: insertAfter, type: insertType })
        pushUndo(blob)
        logSession('Insert Page', blob.size)
        onProcessingComplete(blob, toolId)
        showStatus(`✓ ${insertType === 'blank' ? 'Blank page' : 'Duplicate page'} inserted after page ${insertAfter}`)
      } catch(e:any) { showStatus(e.message||'Failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'splitn') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      if (splitN < 1) { showStatus('Enter a valid page count'); return }
      onSizeChange?.(pdfFiles[0].size)
      onProcessingStart()
      try {
        const blob = await splitByNPages(pdfFiles[0], splitN)
        logSession(`Split by ${splitN}`, blob.size)
        onProcessingComplete(blob, toolId)
        showStatus(`✓ Split into ${splitN}-page chunks — ZIP ready to download`)
      } catch(e:any) { showStatus(e.message||'Failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'topptx') {
      if (!hasPDFs) { showStatus('Upload a PDF'); return }
      onSizeChange?.(pdfFiles[0].size)
      onProcessingStart()
      try {
        const blob = await pdfToPPTX(pdfFiles[0], (p:number,t:number) => onProgress?.(p,t))
        logSession('PDF→PPTX', blob.size)
        onProcessingComplete(blob, toolId)
        showStatus('✓ PowerPoint ready to download')
      } catch(e:any) { showStatus(e.message||'Failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'hashcheck') {
      if (files.length === 0) { showStatus('Upload a file to hash'); return }
      onProcessingStart()
      try {
        const file = files[0]
        const hash = await sha256File(file)
        setHashResult({ name: file.name, hash, size: file.size })
        onProcessingComplete(new Blob())
        showStatus('✓ SHA-256 hash computed')
      } catch(e:any) { showStatus('Hash failed'); onProcessingComplete(new Blob()) }
      return
    }

    if (toolId === 'rearrange') {
      onToolSelect('rearrange')
      showStatus('Drag pages in the preview below to reorder, then click Merge')
      return
    }

    if (toolId === 'split') {
      if (selectedPages.length === 0) { showStatus('Select pages from the preview below'); return }
      if (files.length > 1) { showStatus('Upload only one PDF for splitting'); return }
    }

    if (toolId === 'convert') {
      if (!hasPDFs) { showStatus('Upload a PDF to convert'); return }
      if (files.length > 1) { showStatus('Upload only one PDF for conversion'); return }
      onSizeChange?.(pdfFiles[0].size)
      onProcessingStart()
      try {
        const base = pdfFiles[0].name.replace(/\.pdf$/i, '')
        if (fmt === 'word') {
          const wordBlob = await convertPDFToWord(pdfFiles[0], (p: number, t: number) => onProgress?.(p, t))
          onProcessingComplete(wordBlob)
        } else {
          const converted = await convertPDFToImages(pdfFiles[0], fmt as 'png' | 'jpg' | 'webp', 1.5, (p: number, t: number) => onProgress?.(p, t))
          for (let i = 0; i < converted.length; i++) {
            const url = URL.createObjectURL(converted[i])
            const a = document.createElement('a')
            a.href = url; a.download = converted.length === 1 ? `${base}.${fmt}` : `${base}-page-${i+1}.${fmt}`
            document.body.appendChild(a); a.click(); document.body.removeChild(a)
            URL.revokeObjectURL(url)
            if (i < converted.length - 1) await new Promise(r => setTimeout(r, 100))
          }
          onProcessingComplete(new Blob()); onToolSelect('')
          showStatus(`✓ ${converted.length} page${converted.length > 1 ? 's' : ''} exported as ${fmt.toUpperCase()}`)
        }
      } catch (e: any) { showStatus(e.message || 'Conversion failed'); onProcessingComplete(new Blob()); onToolSelect('') }
      return
    }

    if (toolId === 'ocr') {
      if (!hasPDFs) { showStatus('Upload a scanned PDF to OCR'); return }
      onSizeChange?.(pdfFiles[0].size)
      onProcessingStart()
      showStatus('Running OCR… this may take 30–90 s depending on page count', 120000)
      try {
        const blob = await ocrPDF(pdfFiles[0], ocrLang, (p:number,t:number) => onProgress?.(p,t))
        logSession('OCR', blob.size)
        onProcessingComplete(blob, toolId)
        showStatus('✓ OCR complete — PDF is now searchable')
      } catch(e:any) { showStatus('OCR failed: ' + (e.message||'unknown error')); onProcessingComplete(new Blob()) }
      return
    }

    if (!hasPDFs) { showStatus('This tool requires a PDF'); return }
    onSizeChange?.(pdfFiles[0].size)
    // NOTE: do NOT call onToolSelect here — it clears processedFile in page.tsx
    onProcessingStart()
    try {
      let result: Blob
      if (toolId === 'merge') {
        if (pageOrder && pageOrder.length > 0 && pdfFiles.length === 1) {
          const { PDFDocument } = await import('pdf-lib')
          const src = await PDFDocument.load(await pdfFiles[0].arrayBuffer())
          const out = await PDFDocument.create()
          const copied = await out.copyPages(src, pageOrder.map(n => n - 1))
          copied.forEach(p => out.addPage(p))
          result = pdfBlob(await out.save())
        } else {
          result = await mergePDFs(files)
        }
      }
      else if (toolId === 'split') result = await splitPDF(pdfFiles[0], selectedPages)
      else if (toolId === 'compress') result = await compressPDF(pdfFiles[0], compressionQuality, (p: number, t: number) => onProgress?.(p, t))
      else throw new Error('Unknown tool')
      pushUndo(result)
      logSession(toolId.charAt(0).toUpperCase() + toolId.slice(1), result.size)
      onProcessingComplete(result, toolId)
    } catch (e: any) { showStatus(e.message || 'Processing failed'); onProcessingComplete(new Blob()) }
  }

  // ── Fabric.js canvas init ────────────────────────────────────────────────
  useEffect(() => {
    if (selectedTool !== 'edit' || !fabricCanvasRef.current || !drawPageImg) return
    let fc: any = null
    const initFabric = async () => {
      const fabric = await import('fabric')
      const FabricClass = fabric.fabric?.Canvas ?? (fabric as any).Canvas
      if (!FabricClass) return
      if (fabricCanvas) { try { fabricCanvas.dispose() } catch {} }
      fc = new FabricClass(fabricCanvasRef.current, {
        isDrawingMode: drawMode === 'pen' || drawMode === 'highlight',
        width: fabricCanvasRef.current!.parentElement?.offsetWidth || 600,
        height: Math.round((fabricCanvasRef.current!.parentElement?.offsetWidth || 600) * 1.4),
        backgroundColor: 'transparent',
      })
      if (drawMode === 'pen') {
        fc.freeDrawingBrush.color = drawColor
        fc.freeDrawingBrush.width = drawWidth
      } else if (drawMode === 'highlight') {
        fc.freeDrawingBrush.color = drawColor.replace('#', '') === 'ffff00' ? 'rgba(255,255,0,0.4)' : 'rgba(255,235,59,0.4)'
        fc.freeDrawingBrush.width = 18
      }
      setFabricCanvas(fc)
    }
    initFabric()
    return () => { if (fc) try { fc.dispose() } catch {} }
  }, [selectedTool, drawMode, drawColor, drawWidth, drawPageImg])

  const handleSaveDrawAnnotations = async () => {
    if (!fabricCanvas || !hasPDFs) return
    onProcessingStart()
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.load(await pdfFiles[0].arrayBuffer())
      const pages = doc.getPages()
      const pageIdx = Math.min(drawPageNum - 1, pages.length - 1)
      const page = pages[pageIdx]
      const { width, height } = page.getSize()
      // Export fabric canvas as PNG
      const canvasEl = fabricCanvas.getElement()
      const dataUrl: string = canvasEl.toDataURL('image/png')
      const res = await fetch(dataUrl)
      const imgBytes = await res.arrayBuffer()
      const img = await doc.embedPng(imgBytes)
      page.drawImage(img, { x: 0, y: 0, width, height, opacity: 1 })
      const blob = pdfBlob(await doc.save())
      pushUndo(blob)
      onProcessingComplete(blob, 'edit')
      showStatus('✓ Drawing annotations saved to PDF')
    } catch (e: any) { showStatus(e.message || 'Save failed'); onProcessingComplete(new Blob()) }
  }

  useEffect(() => { handleToolActionRef.current = handleToolAction })

  useEffect(() => {
    ;(window as any).__triggerToolAction = async (action: string, format?: 'png' | 'jpg' | 'webp' | 'word') => {
      if (handleToolActionRef.current) await handleToolActionRef.current(action, format)
    }
    // Voice-driven undo: pop the last entry from the stack and republish it.
    ;(window as any).__triggerUndo = () => {
      setUndoStack(prev => {
        if (prev.length < 2) {
          showStatus('Nothing to undo')
          return prev
        }
        const next = prev.slice(0, -1)
        const previous = next[next.length - 1]
        onProcessingComplete(previous)
        showStatus('↶ Undo')
        return next
      })
    }
    return () => {
      delete (window as any).__triggerToolAction
      delete (window as any).__triggerUndo
    }
  }, [onProcessingComplete, showStatus])

  useEffect(() => {
    if (localEditMode) {
      ;(window as any).__editClickHandler = (pageIndex: number, x: number, y: number) => {
        setPendingEdit({ pageIndex, x, y })
        setTimeout(() => (document.querySelector('input[placeholder="Text to add…"]') as HTMLInputElement)?.focus(), 100)
      }
    } else { delete (window as any).__editClickHandler }
    return () => { delete (window as any).__editClickHandler }
  }, [localEditMode])

  // Load page thumbnail for fabric draw canvas when page changes
  useEffect(() => {
    if (selectedTool !== 'edit' || !hasPDFs || pdfFiles.length === 0) return
    let cancelled = false
    const load = async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc)
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
        const pdf = await pdfjsLib.getDocument({ data: await pdfFiles[0].arrayBuffer() }).promise
        const page = await pdf.getPage(Math.min(drawPageNum, pdf.numPages))
        const vp = page.getViewport({ scale: 1.5 })
        const canvas = document.createElement('canvas')
        canvas.width = vp.width; canvas.height = vp.height
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
        if (!cancelled) setDrawPageImg(canvas.toDataURL('image/jpeg', 0.9))
      } catch {}
    }
    load()
    return () => { cancelled = true }
  }, [selectedTool, drawPageNum, pdfFiles])

  const handleEditApply = async () => {
    if (!editText.trim()) { showStatus('Enter text first'); return }
    if (!pendingEdit) { showStatus('Click on the PDF to place text'); return }
    const newEdit = { pageIndex: pendingEdit.pageIndex, text: editText, x: pendingEdit.x, y: pendingEdit.y }
    const updated = [...currentEdits, newEdit]
    onEditsChange?.(updated)
    setEditText(''); setPendingEdit(null)
    showStatus(`Added "${editText}" — ${updated.length} edit${updated.length > 1 ? 's' : ''} pending`)
  }

  const handleSaveEdits = async () => {
    if (currentEdits.length === 0) { showStatus('No edits to save'); return }
    if (!hasPDFs) { showStatus('Upload a PDF first'); return }
    onProcessingStart()
    try {
      const result = await editPDF(pdfFiles[0], currentEdits.map(e => ({
        text: e.text, x: e.x, y: e.y, page: e.pageIndex + 1, fontSize: editFontSize,
      })))
      pushUndo(result)
      onProcessingComplete(result, 'edit')
      setLocalEditMode(false); onToolSelect('')
      onEditsChange?.([])
    } catch (e: any) { showStatus(e.message || 'Save failed'); onProcessingComplete(new Blob()) }
  }

  const handleSaveMetadata = async () => {
    if (!hasPDFs) return
    onProcessingStart()
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.load(await pdfFiles[0].arrayBuffer())
      if (metaTitle) doc.setTitle(metaTitle)
      if (metaAuthor) doc.setAuthor(metaAuthor)
      if (metaSubject) doc.setSubject(metaSubject)
      if (metaKeywords) doc.setKeywords([metaKeywords])
      doc.setModificationDate(new Date())
      const bytes = await doc.save()
      const blob = pdfBlob(bytes)
      pushUndo(blob)
      onProcessingComplete(blob, 'metadata')
      showStatus('✓ Metadata saved')
    } catch (e: any) { showStatus(e.message || 'Metadata save failed'); onProcessingComplete(new Blob()) }
  }

  const QUICK_TOOLS = ['rotate', 'extractimgs', 'flatten']

  return (
    <div className="space-y-4 animate-fade-up" style={{ animationDelay: '0.15s' }}>

      {/* ── Undo bar ────────────────────────────────────────────────────── */}
      {undoStack.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl animate-slide-down"
             style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)' }}>
          <span className="text-xs font-medium" style={{ color: '#7c3aed' }}>
            {undoStack.length} operation{undoStack.length > 1 ? 's' : ''} in history
          </span>
          <button onClick={() => {
            const prev = undoStack[undoStack.length - 1]
            setUndoStack(s => s.slice(0, -1))
            onProcessingComplete(prev)
            showStatus('↩ Reverted to previous version')
          }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: '#7c3aed', background: 'rgba(124,58,237,0.1)' }}>
            ↩ Undo last operation
          </button>
        </div>
      )}

      {/* ── Tool grid ───────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          {/* Mobile: show sheet trigger */}
          <button className="sm:hidden flex-shrink-0 btn-ghost text-xs px-3 py-2"
                  onClick={() => setShowMobileSheet(true)}
                  aria-label="Open tool picker"
                  style={{background:'var(--blue-pale)',color:'var(--blue-vivid)'}}>
            ⚡ Tools
          </button>
          <p className="section-label flex-shrink-0">Choose a tool</p>
          <div className="flex-1 relative">
            <input
              type="search"
              value={toolSearch}
              onChange={e => setToolSearch(e.target.value)}
              placeholder="Search tools…"
              aria-label="Search PDF tools"
              className="input w-full"
              style={{ padding: '6px 12px 6px 32px', fontSize: '12px' }}
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                 style={{ color: 'var(--ink-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {files.length > 0 && hasPDFs && (
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--ink-muted)' }}>
              {pdfFiles.length} PDF{pdfFiles.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-9 gap-2">
          {TOOLS.filter(tool => !toolSearch || tool.name.toLowerCase().includes(toolSearch.toLowerCase()) || tool.desc.toLowerCase().includes(toolSearch.toLowerCase()) || tool.fullName.toLowerCase().includes(toolSearch.toLowerCase())).map((tool) => {
            const disabled = files.length === 0 ||
              (tool.requiresPDF && !hasPDFs) ||
              (tool.requiresNonPDF && !hasConvertible)
            const isActive = selectedTool === tool.id || (tool.id === 'edit' && localEditMode)
            const TOOL_HELP: Record<string, string> = {
              merge: 'Combine multiple PDFs into one file, preserving all pages in order.',
              split: 'Select pages in the preview below, then extract them as a new PDF.',
              compress: 'Reduce file size by re-rendering pages at lower quality. Great for emailing.',
              unlock: 'Remove a password from an encrypted PDF. You must know the current password.',
              headfoot: 'Add custom text to the top/bottom of every page. Supports {page}, {total}, {date}.',
              grayscale: 'Convert all colours to greyscale. Reduces file size and saves printer ink.',
              insertpage: 'Insert a blank or duplicate page at any position in the document.',
              splitn: 'Split a PDF into equally-sized chunks (e.g. every 5 pages → separate files).',
              topptx: 'Convert each PDF page into a PowerPoint slide (.pptx). Pages become full-slide images.',
              hashcheck: 'Compute SHA-256 hash to verify file integrity — no data leaves your device.',
              redact: 'Permanently black-out rectangles on pages. This cannot be undone.',
              ocr: 'Make a scanned (image-based) PDF searchable and copy-pasteable. Runs entirely in your browser.',
              aesencrypt: 'Password-protect any file with real AES-256 encryption (PBKDF2 + AES-GCM, via your browser\'s Web Crypto). Far stronger than a PDF password, and nothing is uploaded. Keep your password safe — it cannot be recovered.',
              qrcode: 'Embed a scannable QR code linked to any URL onto a page.',
              totext: 'Extract the text layer from a PDF as .txt or .md (Markdown).',
              crop: 'Trim whitespace/margins from all pages by specifying points to remove from each edge.',
              readability: 'Flesch-Kincaid reading score, grade level, top keywords, and reading time. Client-side.',
              pdfcompare: 'Line-by-line diff of two PDF text layers — added, removed, changed content.',
              a11ycheck: 'WCAG/PDF-UA audit: text layer, title metadata, image alt text, and more.',
              flashcards: 'Extracts Q&A pairs from headings and body text as interactive flip cards.',
              piiscan: 'Finds emails, credit cards, NI numbers, IBANs, phone numbers, and more.',
              bookmarks: 'Build a table of contents and embed bookmark entries into the PDF.',
              autocrop: 'Analyses pixels to detect content bounds and auto-removes blank margins.',
              tojson: 'Exports text layer as structured JSON with page and position data for developers.',
              fontinspect: 'Lists all embedded fonts, types, and flags unembedded fonts (print hazard).',
              spellcheck: 'Checks for common misspellings and double-words in the text layer.',
              batchrules: 'Define IF/THEN rules: e.g. IF size > 5MB THEN compress.',
              macro: 'Record a sequence of tool operations and replay them on any PDF.',
              semanticgroup: 'TF-IDF clustering groups pages by topic — click to split on boundaries.',
              podcastscript: 'Reformats document text as a spoken-word script with pacing markers.',
              ankideck: 'Extracts heading/body pairs as Anki-compatible TSV flashcard deck.',
              tilePrint: 'Tiles one PDF page across multiple A4 sheets for large-format printing.',
              emailhtml: 'Converts a single-page PDF to inline-styled HTML ready for email tools.',
              tamperseal: 'Creates a SHA-256 + timestamp cryptographic seal. Verifiable without a server.',
              recipe: 'Encodes your operation sequence as a shareable URL — send to a colleague.',
              preflight: 'Checks fonts, bleed, colour mode, and resolution for commercial printing.',
              microannot: 'Pin text comments to page coordinates — stored by file hash, no server.',
              normalizesize: 'Detects mixed page sizes and normalises all pages to A4, Letter, or A3.',
              present: 'Full-screen slideshow with keyboard navigation, timer, and page counter.',
              inkestimate: 'Measures non-white pixel ratio per page to estimate ink/toner cost.',
              timeline: 'Extracts all date patterns with surrounding context into a chronological list.',
              toneanalyse: 'Per-page sentiment heatmap — positive, negative, formal, and aggressive.',
              langdetect: 'Trigram-based language detection across 20+ languages. Confidence score shown.',
              citations: 'Finds DOIs, URLs, author-year refs, and numbered footnotes. Export as text.',
            }
            return (
              <div key={tool.id} className="relative group/tool">
                <button data-tool-id={tool.id}
                  onClick={() => { if (!disabled) handleToolAction(tool.id) }}
                  onDragOver={e => { e.preventDefault(); setDragOverTool(tool.id) }}
                  onDragLeave={() => setDragOverTool(null)}
                  onDrop={e => {
                    e.preventDefault(); setDragOverTool(null)
                    const droppedFiles = Array.from(e.dataTransfer.files)
                    if (droppedFiles.length > 0) {
                      // Bubble up to parent's file handler via custom event
                      window.dispatchEvent(new CustomEvent('commandeditor-drop-on-tool', { detail: { files: droppedFiles, toolId: tool.id } }))
                    }
                  }}
                  className={`tool-card relative w-full${isActive ? ' active' : ''}${disabled ? ' cursor-not-allowed' : ''}${dragOverTool === tool.id ? ' drag-over-tool' : ''}`}
                  title={tool.fullName}
                  aria-label={`${tool.fullName}: ${tool.desc}`}
                  aria-pressed={isActive}
                  style={{ opacity: disabled ? 0.45 : 1, transition: 'all 0.15s' }}>
                  {isActive && (
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white"
                          style={{ background: 'var(--blue-vivid)', fontSize: 10 }} aria-hidden="true">✓</span>
                  )}
                  <div className="w-9 h-9 mx-auto mb-1.5 rounded-xl flex items-center justify-center text-base transition-colors"
                       style={{ background: isActive ? tool.color : tool.colorLight, color: isActive ? 'white' : tool.color }}
                       aria-hidden="true">
                    {tool.emoji}
                  </div>
                  <p className="text-xs font-semibold leading-tight">{tool.name}</p>
                </button>
                {TOOL_HELP[tool.id] && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-xl text-xs p-2.5 z-20 pointer-events-none opacity-0 group-hover/tool:opacity-100 transition-opacity duration-150"
                       style={{ background: 'var(--ink)', color: 'white', boxShadow: 'var(--shadow-lg)' }}
                       role="tooltip">
                    {TOOL_HELP[tool.id]}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
                         style={{ borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid var(--ink)' }} />
                  </div>
                )}
              </div>
            )
          })}
          {toolSearch && TOOLS.filter(t => t.name.toLowerCase().includes(toolSearch.toLowerCase()) || t.desc.toLowerCase().includes(toolSearch.toLowerCase()) || t.fullName.toLowerCase().includes(toolSearch.toLowerCase())).length === 0 && (
            <div className="col-span-full text-center py-4 text-sm" style={{ color: 'var(--ink-muted)' }}>
              No tools match "{toolSearch}" — <button onClick={() => setToolSearch('')} className="underline">clear search</button>
            </div>
          )}
        </div>
        {files.length === 0 && (
          <div className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
               style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)', color: 'var(--blue-vivid)' }}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload a file above to activate these tools
          </div>
        )}
      </div>

      {/* ── Preflight warnings ──────────────────────────────────────────── */}
      {selectedTool && files.length > 0 && (() => {
        const warnings = getPreflightWarnings(selectedTool)
        if (warnings.length === 0) return null
        return (
          <div className="space-y-2">
            {warnings.map((w, i) => (
              <div key={i} className="preflight-warn" role="alert">
                <span className="text-base flex-shrink-0">⚠️</span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── Quick action panel (rotate, pagenum, extractimgs, flatten) ──── */}
      {QUICK_TOOLS.includes(selectedTool || '') && files.length > 0 && hasPDFs && (() => {
        const t = TOOLS.find(t => t.id === selectedTool)!
        const labels: Record<string,string> = {
          rotate: 'Rotate all pages 90° clockwise',
          pagenum: 'Add page numbers at the bottom centre',
          extractimgs: 'Extract all pages as PNG images (ZIP)',
          flatten: 'Rasterize PDF — removes form fields & annotations',
        }
        return (
          <div className="card animate-scale-in">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                     style={{ background: t.colorLight, color: t.color }}>{t.emoji}</div>
                <div>
                  <p className="font-semibold text-sm">{t.fullName}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(15,23,42,0.45)' }}>{labels[selectedTool!]}</p>
                </div>
              </div>
              {(() => { const est = getSpeedEstimate(selectedTool!); return est ? <span className="speed-pill">⏱ {est}</span> : null })()}
              <button onClick={() => handleToolAction(selectedTool!)} className="btn-primary flex-shrink-0"
                      aria-label={`Run ${t.fullName}`}
                      style={{ background: t.color }}>Run</button>
            </div>
          </div>
        )
      })()}

      {/* ── Watermark panel ─────────────────────────────────────────────── */}
      {selectedTool === 'watermark' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">💧</span>
            <div>
              <p className="font-semibold text-sm">Watermark Settings</p>
              <p className="text-xs" style={{ color: 'rgba(10,10,15,0.4)' }}>Customize your watermark</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>Text</label>
              <input value={wmText} onChange={e => setWmText(e.target.value)} className="input" placeholder="CONFIDENTIAL" />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>Position</label>
              <select value={wmPosition} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setWmPosition(e.target.value as any)}
                      className="input" style={{ appearance: 'auto' }}>
                <option value="diagonal">Diagonal (center)</option>
                <option value="center">Center (horizontal)</option>
                <option value="top-left">Top left</option>
                <option value="top-right">Top right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="bottom-right">Bottom right</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={wmColor} onChange={e => setWmColor(e.target.value)}
                       className="w-10 h-10 rounded-lg border cursor-pointer flex-shrink-0" style={{ border: '1.5px solid var(--border-strong)', padding: 2 }} />
                <input value={wmColor} onChange={e => setWmColor(e.target.value)} className="input text-xs" style={{ padding: '8px 10px' }} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>Opacity: {Math.round(wmOpacity*100)}%</label>
              <input type="range" min="0.05" max="1" step="0.05" value={wmOpacity} onChange={e => setWmOpacity(parseFloat(e.target.value))} />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>Size: {wmFontSize}pt</label>
              <input type="range" min="16" max="96" step="4" value={wmFontSize} onChange={e => setWmFontSize(parseInt(e.target.value))} />
            </div>
          </div>
          {/* Live preview */}
          <div className="rounded-xl flex items-center justify-center" style={{ height: 80, background: 'var(--surface)', border: '1px solid var(--border)', overflow: 'hidden', position: 'relative' }}>
            <div className="text-center font-bold select-none" style={{
              color: wmColor, opacity: wmOpacity, fontSize: Math.min(wmFontSize * 0.5, 28),
              transform: wmPosition === 'diagonal' ? 'rotate(-20deg)' : 'none',
              whiteSpace: 'nowrap',
            }}>{wmText || 'Preview'}</div>
          </div>
          <button onClick={() => handleToolAction('watermark')} className="btn-primary w-full">Apply Watermark</button>
        </div>
      )}

      {/* ── Compress panel ──────────────────────────────────────────────── */}
      {selectedTool === 'compress' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-xl">◎</span>
              <div>
                <p className="font-semibold text-sm">Compression Level</p>
                <p className="text-xs" style={{ color: 'rgba(15,23,42,0.45)' }}>
                  {compressionQuality < 0.4 ? 'Aggressive — max size reduction' : compressionQuality < 0.7 ? 'Balanced — good quality/size' : 'Light — high quality preserved'}
                </p>
                {files.length > 0 && pdfFiles.length > 0 && (() => {
                  const origKB = pdfFiles[0].size / 1024
                  // Heuristic: compress ratio approximation based on quality slider
                  const ratio = compressionQuality < 0.4 ? 0.25 : compressionQuality < 0.6 ? 0.40 : compressionQuality < 0.8 ? 0.60 : 0.80
                  const estKB = Math.round(origKB * ratio)
                  const pct = Math.round((1 - ratio) * 100)
                  return (
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{background:'rgba(5,150,105,0.1)',color:'var(--green)'}}>
                      ≈ {origKB.toFixed(0)} KB → {estKB} KB (est. {pct}% smaller)
                    </span>
                  )
                })()}
              </div>
            </div>
            <span className="badge badge-green">{Math.round(compressionQuality * 100)}%</span>
          </div>
          <input type="range" min="0.1" max="1" step="0.1" value={compressionQuality}
            onChange={e => setCompressionQuality(parseFloat(e.target.value))} className="w-full mb-2" />
          <div className="flex justify-between text-xs mb-4" style={{ color: 'rgba(15,23,42,0.4)' }}>
            <span>Smaller file</span><span>Higher quality</span>
          </div>
          <button onClick={() => handleToolAction('compress')} className="btn-primary w-full">Compress PDF</button>
        </div>
      )}

      {/* ── Convert panel ───────────────────────────────────────────────── */}
      {selectedTool === 'convert' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in">
          <div className="flex items-center gap-3 mb-4">
          {/* Mobile: show sheet trigger */}
          <button className="sm:hidden flex-shrink-0 btn-ghost text-xs px-3 py-2"
                  onClick={() => setShowMobileSheet(true)}
                  aria-label="Open tool picker"
                  style={{background:'var(--blue-pale)',color:'var(--blue-vivid)'}}>
            ⚡ Tools
          </button>
            <span className="text-xl">⤓</span>
            <div>
              <p className="font-semibold text-sm">Export Format</p>
              <p className="text-xs" style={{ color: 'rgba(10,10,15,0.4)' }}>Select output format</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {(['png','jpg','webp','word'] as const).map(fmt => (
              <button key={fmt} onClick={() => setConvertFormat(fmt)}
                className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: convertFormat===fmt ? 'var(--ink)' : 'var(--surface-2)', color: convertFormat===fmt ? 'white' : 'var(--ink)', border: `1.5px solid ${convertFormat===fmt ? 'var(--ink)' : 'var(--border)'}` }}>
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
          <button onClick={() => handleToolAction('convert')} className="btn-primary w-full">
            Export as {convertFormat.toUpperCase()}
          </button>
        </div>
      )}

      {/* ── Merge panel ─────────────────────────────────────────────────── */}
      {selectedTool === 'merge' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">⊕</span>
              <div>
                <p className="font-semibold text-sm">Merge {pdfFiles.length} PDF{pdfFiles.length !== 1 ? 's' : ''}</p>
                <p className="text-xs" style={{ color: 'rgba(10,10,15,0.4)' }}>
                  {pageOrder && pageOrder.length > 0 && JSON.stringify(pageOrder) !== JSON.stringify(Array.from({length: pageOrder.length}, (_, i) => i+1))
                    ? '↕ Using your custom page order from preview'
                    : 'Drag pages in the preview below to reorder'}
                </p>
              </div>
            </div>
            <button onClick={() => handleToolAction('merge')} className="btn-primary">Merge Now</button>
          </div>
        </div>
      )}

      {/* ── Split panel ─────────────────────────────────────────────────── */}
      {selectedTool === 'split' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">✂</span>
              <div>
                <p className="font-semibold text-sm">Split PDF</p>
                <p className="text-xs" style={{ color: 'rgba(10,10,15,0.4)' }}>
                  {selectedPages.length === 0 ? 'Click pages in preview to select' : `${selectedPages.length} page${selectedPages.length > 1 ? 's' : ''} selected`}
                </p>
              </div>
            </div>
            <button onClick={() => handleToolAction('split')} className="btn-primary"
                    disabled={selectedPages.length === 0} style={{ opacity: selectedPages.length === 0 ? 0.4 : 1 }}>
              Extract Pages
            </button>
          </div>
          {selectedPages.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {selectedPages.map(p => <span key={p} className="badge badge-ink">p.{p}</span>)}
            </div>
          )}
        </div>
      )}

      {/* ── To PDF panel ────────────────────────────────────────────────── */}
      {selectedTool === 'toPDF' && files.length > 0 && hasConvertible && (
        <div className="card animate-scale-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">⤒</span>
              <div>
                <p className="font-semibold text-sm">Convert to PDF</p>
                <p className="text-xs" style={{ color: 'rgba(10,10,15,0.4)' }}>{files[0]?.name}</p>
              </div>
            </div>
            <button onClick={() => handleToolAction('toPDF')} className="btn-primary">Convert</button>
          </div>
        </div>
      )}

      {/* ── Metadata panel ──────────────────────────────────────────────── */}
      {selectedTool === 'metadata' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-3">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl">🏷</span>
            <div>
              <p className="font-semibold text-sm">Edit PDF Metadata</p>
              <p className="text-xs" style={{ color: 'rgba(10,10,15,0.4)' }}>Document properties</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Title', value: metaTitle, set: setMetaTitle, ph: 'Document title' },
              { label: 'Author', value: metaAuthor, set: setMetaAuthor, ph: 'Author name' },
              { label: 'Subject', value: metaSubject, set: setMetaSubject, ph: 'Document subject' },
              { label: 'Keywords', value: metaKeywords, set: setMetaKeywords, ph: 'keyword1, keyword2' },
            ].map(({ label, value, set, ph }) => (
              <div key={label}>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>{label}</label>
                <input value={value} onChange={e => set(e.target.value)} className="input" placeholder={ph} />
              </div>
            ))}
          </div>
          <button onClick={handleSaveMetadata} className="btn-primary w-full">Save Metadata</button>
        </div>
      )}

      {/* ── Batch panel ─────────────────────────────────────────────────── */}
      {selectedTool === 'batch' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">📦</span>
            <div>
              <p className="font-semibold text-sm">Batch Process</p>
              <p className="text-xs" style={{ color: 'rgba(10,10,15,0.4)' }}>
                Apply to all {pdfFiles.length} PDF{pdfFiles.length !== 1 ? 's' : ''} → ZIP download
              </p>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--ink-muted)' }}>Operation</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['compress','watermark','rotate','pagenum'] as const).map((op) => (
                <button key={op} onClick={() => setBatchMode(op)}
                  className="py-2.5 rounded-xl text-xs font-semibold capitalize transition-all"
                  style={{ background: batchMode===op ? 'var(--blue-vivid)' : 'var(--surface-2)', color: (batchMode===op) ? 'white' : 'var(--ink)', border: `1.5px solid ${batchMode===op ? 'var(--blue-vivid)' : 'var(--border)'}` }}>
                  {op === 'pagenum' ? 'Page Numbers' : op.charAt(0).toUpperCase() + op.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {batchMode === 'compress' && (
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>Quality: {Math.round(compressionQuality*100)}%</label>
              <input type="range" min="0.1" max="1" step="0.1" value={compressionQuality} onChange={e => setCompressionQuality(parseFloat(e.target.value))} />
            </div>
          )}
          <button onClick={() => handleToolAction('batch')} className="btn-primary w-full">
            Batch {batchMode.charAt(0).toUpperCase() + batchMode.slice(1)} All → ZIP
          </button>
        </div>
      )}

      {/* ── Sign Document panel ────────────────────────────────────────── */}
      {selectedTool === 'sign' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">✍️</span>
            <div>
              <p className="font-semibold text-sm">Sign Document</p>
              <p className="text-xs" style={{ color: 'rgba(10,10,15,0.4)' }}>Type, draw, or upload your signature</p>
            </div>
          </div>

          {/* Mode tabs */}
          <div className="grid grid-cols-3 gap-2">
            {(['type','draw','upload'] as const).map(m => (
              <button key={m} onClick={() => setSignMode(m)}
                className="py-2 rounded-xl text-xs font-semibold capitalize transition-all"
                style={{ background: signMode===m ? 'var(--blue-vivid)' : 'var(--surface-2)', color: signMode===m ? 'white' : 'var(--ink)', border: `1.5px solid ${signMode===m ? 'var(--blue-vivid)' : 'var(--border)'}` }}>
                {m === 'type' ? '⌨️ Type' : m === 'draw' ? '✏️ Draw' : '📁 Upload'}
              </button>
            ))}
          </div>

          {signMode === 'type' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>Your name</label>
                <input value={signText} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSignText(e.target.value)}
                       className="input" placeholder="Type your name…" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>Style</label>
                  <div className="flex gap-1.5">
                    {(['cursive','serif','monospace'] as const).map(f => (
                      <button key={f} onClick={() => setSignFont(f)}
                        className="flex-1 py-2 rounded-xl text-sm transition-all"
                        style={{ fontFamily: f, fontWeight: 600, background: signFont===f ? '#e0f2fe' : 'var(--surface-2)', color: signFont===f ? '#0369a1' : 'var(--ink)', border: `1.5px solid ${signFont===f ? '#0369a1' : 'var(--border)'}` }}>
                        Aa
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>Color</label>
                  <div className="flex gap-2">
                    {['#1e3a8a','#166534','#7f1d1d','#1c1917'].map(col => (
                      <button key={col} onClick={() => setSignColor(col)}
                        className="w-8 h-8 rounded-lg flex-shrink-0 transition-all"
                        style={{ background: col, border: signColor===col ? '3px solid white' : '2px solid transparent', boxShadow: signColor===col ? `0 0 0 2px ${col}` : 'none' }} />
                    ))}
                  </div>
                </div>
              </div>
              {signText && (
                <div className="rounded-xl p-4 flex items-center justify-center min-h-16 border"
                     style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <span style={{ fontFamily: signFont, fontSize: 32, color: signColor, letterSpacing: 1 }}>{signText}</span>
                </div>
              )}
            </div>
          )}

          {signMode === 'draw' && (
            <div className="space-y-2">
              <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                <canvas ref={canvasRef} width={480} height={140}
                  style={{ width: '100%', height: 140, background: 'white', cursor: 'crosshair', display: 'block', touchAction: 'none' }}
                  onMouseDown={(e: React.MouseEvent<HTMLCanvasElement>) => {
                    isDrawingRef.current = true
                    const ctx = canvasRef.current?.getContext('2d')
                    if (!ctx) return
                    const r = canvasRef.current!.getBoundingClientRect()
                    const scaleX = canvasRef.current!.width / r.width
                    ctx.strokeStyle = signColor; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
                    ctx.beginPath(); ctx.moveTo((e.clientX - r.left) * scaleX, (e.clientY - r.top) * scaleX)
                  }}
                  onMouseMove={(e: React.MouseEvent<HTMLCanvasElement>) => {
                    if (!isDrawingRef.current) return
                    const ctx = canvasRef.current?.getContext('2d')
                    if (!ctx) return
                    const r = canvasRef.current!.getBoundingClientRect()
                    const scaleX = canvasRef.current!.width / r.width
                    ctx.lineTo((e.clientX - r.left) * scaleX, (e.clientY - r.top) * scaleX); ctx.stroke()
                  }}
                  onMouseUp={() => {
                    isDrawingRef.current = false
                    setSignDataUrl(canvasRef.current?.toDataURL('image/png') || null)
                  }}
                  onMouseLeave={() => { isDrawingRef.current = false }}
                  onTouchStart={(e: React.TouchEvent<HTMLCanvasElement>) => {
                    e.preventDefault(); isDrawingRef.current = true
                    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return
                    const r = canvasRef.current!.getBoundingClientRect()
                    const scaleX = canvasRef.current!.width / r.width
                    const t = e.touches[0]
                    ctx.strokeStyle = signColor; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
                    ctx.beginPath(); ctx.moveTo((t.clientX - r.left) * scaleX, (t.clientY - r.top) * scaleX)
                  }}
                  onTouchMove={(e: React.TouchEvent<HTMLCanvasElement>) => {
                    e.preventDefault(); if (!isDrawingRef.current) return
                    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return
                    const r = canvasRef.current!.getBoundingClientRect()
                    const scaleX = canvasRef.current!.width / r.width
                    const t = e.touches[0]
                    ctx.lineTo((t.clientX - r.left) * scaleX, (t.clientY - r.top) * scaleX); ctx.stroke()
                  }}
                  onTouchEnd={() => { isDrawingRef.current = false; setSignDataUrl(canvasRef.current?.toDataURL('image/png') || null) }}
                />
                <p className="absolute inset-0 flex items-center justify-center text-sm pointer-events-none select-none"
                   style={{ color: 'rgba(0,0,0,0.2)', display: signDataUrl ? 'none' : 'flex' }}>
                  Draw your signature here
                </p>
              </div>
              <div className="flex gap-2">
                {['#1e3a8a','#166534','#7f1d1d','#1c1917'].map(col => (
                  <button key={col} onClick={() => { setSignColor(col) }}
                    className="w-7 h-7 rounded-lg"
                    style={{ background: col, border: signColor===col ? '3px solid white' : '2px solid transparent', boxShadow: signColor===col ? `0 0 0 2px ${col}` : 'none' }} />
                ))}
                <button onClick={() => {
                  const ctx = canvasRef.current?.getContext('2d')
                  if (ctx && canvasRef.current) { ctx.clearRect(0,0,canvasRef.current.width, canvasRef.current.height); setSignDataUrl(null) }
                }} className="btn-ghost text-xs px-3 py-1 ml-auto" style={{ color: 'var(--ink-muted)' }}>Clear</button>
              </div>
            </div>
          )}

          {signMode === 'upload' && (
            <div>
              <label className="upload-zone cursor-pointer block text-center py-4">
                <p className="text-sm mb-2" style={{ color: 'var(--ink-muted)' }}>
                  {addImgFile ? addImgFile.name : 'Click to upload signature image (PNG with transparent background)'}
                </p>
                <input type="file" accept="image/png,image/jpeg,image/gif" className="hidden"
                       onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                         const f = e.target.files?.[0]; if (!f) return
                         const reader = new FileReader()
                         reader.onload = ev => setSignDataUrl(ev.target?.result as string)
                         reader.readAsDataURL(f)
                         setAddImgFile(f)
                       }} />
              </label>
              {signDataUrl && <img src={signDataUrl} alt="Signature preview" className="mt-2 max-h-20 mx-auto" />}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>Place on page</label>
              <input type="number" min={1} value={addImgPage}
                     onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddImgPage(parseInt(e.target.value)||1)}
                     className="input" placeholder="1" />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>Position</label>
              <select className="input" style={{ appearance: 'auto' }}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                        const v = e.target.value
                        if (v==='bottom-right') { setAddImgX(75); setAddImgY(10) }
                        else if (v==='bottom-left') { setAddImgX(5); setAddImgY(10) }
                        else if (v==='bottom-center') { setAddImgX(35); setAddImgY(10) }
                        else if (v==='top-right') { setAddImgX(75); setAddImgY(80) }
                        else { setAddImgX(35); setAddImgY(10) }
                      }}>
                <option value="bottom-center">Bottom center</option>
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="top-right">Top right</option>
              </select>
            </div>
          </div>

          <button onClick={async () => {
            const hasSig = (signMode === 'type' && signText.trim()) ||
                           (signMode === 'draw' && signDataUrl) ||
                           (signMode === 'upload' && signDataUrl)
            if (!hasSig) { showStatus('Create your signature first'); return }
            onProcessingStart()
            try {
              const { PDFDocument, rgb } = await import('pdf-lib')
              const doc = await PDFDocument.load(await pdfFiles[0].arrayBuffer())
              const pages = doc.getPages()
              const pageIdx = Math.min(addImgPage - 1, pages.length - 1)
              const page = pages[pageIdx]
              const { width, height } = page.getSize()

              if (signMode === 'type') {
                const { StandardFonts } = await import('pdf-lib')
                const font = await doc.embedFont(StandardFonts.TimesRomanItalic)
                const hex = signColor.replace('#','')
                const r = parseInt(hex.slice(0,2),16)/255, g = parseInt(hex.slice(2,4),16)/255, b = parseInt(hex.slice(4,6),16)/255
                const fs = 28
                const tw = font.widthOfTextAtSize(signText, fs)
                page.drawText(signText, { x: width/2 - tw/2, y: 45, size: fs, font, color: rgb(r,g,b) })
                // Draw underline
                page.drawLine({ start: { x: width/2 - tw/2 - 5, y: 40 }, end: { x: width/2 + tw/2 + 5, y: 40 }, thickness: 0.8, color: rgb(r,g,b) })
              } else if (signDataUrl) {
                const imgBytes = await fetch(signDataUrl).then(r2 => r2.arrayBuffer())
                const isPng = signDataUrl.startsWith('data:image/png')
                const img = isPng ? await doc.embedPng(imgBytes) : await doc.embedJpg(imgBytes)
                const sigW = Math.min(180, width * 0.3)
                const sigH = (sigW * img.height) / img.width
                page.drawImage(img, {
                  x: (width * addImgX / 100),
                  y: (height * addImgY / 100),
                  width: sigW, height: sigH,
                })
              }

              const bytes = await doc.save()
              const blob = pdfBlob(bytes)
              onProcessingComplete(blob, 'sign')
              showStatus('✓ Signature added successfully')
            } catch (e: any) { showStatus(e.message || 'Sign failed'); onProcessingComplete(new Blob()) }
          }} className="btn-primary w-full" style={{ background: '#0d9488' }}>
            Apply Signature
          </button>
        </div>
      )}

      {/* ── Add Image to PDF panel ───────────────────────────────────────── */}
      {selectedTool === 'addimage' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">🖼️</span>
            <div>
              <p className="font-semibold text-sm">Add Image to PDF</p>
              <p className="text-xs" style={{ color: 'rgba(10,10,15,0.4)' }}>Insert logo, photo, or graphic</p>
            </div>
          </div>
          <label className="upload-zone cursor-pointer block text-center py-4">
            <p className="text-sm mb-2" style={{ color: 'var(--ink-muted)' }}>
              {addImgFile ? `✓ ${addImgFile.name}` : 'Click to select image (PNG, JPG, GIF)'}
            </p>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"
                   onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddImgFile(e.target.files?.[0] || null)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>Page number</label>
              <input type="number" min={1} value={addImgPage}
                     onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddImgPage(parseInt(e.target.value)||1)}
                     className="input" />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>Width (px)</label>
              <input type="number" min={20} max={600} value={addImgW}
                     onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddImgW(parseInt(e.target.value)||150)}
                     className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>X position (px from left)</label>
              <input type="number" min={0} value={addImgX}
                     onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddImgX(parseInt(e.target.value)||0)}
                     className="input" />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-muted)' }}>Y position (px from bottom)</label>
              <input type="number" min={0} value={addImgY}
                     onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddImgY(parseInt(e.target.value)||50)}
                     className="input" />
            </div>
          </div>
          <button onClick={async () => {
            if (!addImgFile) { showStatus('Select an image first'); return }
            onProcessingStart()
            try {
              const { PDFDocument } = await import('pdf-lib')
              const doc = await PDFDocument.load(await pdfFiles[0].arrayBuffer())
              const imgBytes = await addImgFile.arrayBuffer()
              const isJpeg = addImgFile.type === 'image/jpeg'
              let img
              if (isJpeg) img = await doc.embedJpg(imgBytes)
              else {
                // Convert to PNG via canvas for non-PNG/JPEG
                const bmp = await createImageBitmap(addImgFile)
                const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height
                cv.getContext('2d')!.drawImage(bmp, 0, 0)
                const pngBuf = await new Promise<ArrayBuffer>(res => cv.toBlob(b => b!.arrayBuffer().then(res), 'image/png'))
                img = await doc.embedPng(pngBuf)
              }
              const pages = doc.getPages()
              const pageIdx = Math.min(addImgPage - 1, pages.length - 1)
              const page = pages[pageIdx]
              const ratio = img.height / img.width
              page.drawImage(img, { x: addImgX, y: addImgY, width: addImgW, height: Math.round(addImgW * ratio) })
              const bytes = await doc.save()
              onProcessingComplete(pdfBlob(bytes))
              showStatus('✓ Image added to PDF')
            } catch (e: any) { showStatus(e.message || 'Failed'); onProcessingComplete(new Blob()) }
          }} className="btn-primary w-full" style={{ background: '#7c3aed' }}>
            Add Image to PDF
          </button>
        </div>
      )}

      {/* ── Page Numbers panel (rich options) ──────────────────────────── */}
      {selectedTool === 'pagenum' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">🔢</span>
            <div><p className="font-semibold text-sm">Add Page Numbers</p><p className="text-xs" style={{color:'rgba(10,10,15,0.4)'}}>Customise position, format & style</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pn-position" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>Position</label>
              <select id="pn-position" className="input" style={{appearance:'auto'}} value={pnPosition}
                      onChange={(e:React.ChangeEvent<HTMLSelectElement>) => setPnPosition(e.target.value as any)}>
                <option value="bottom-center">Bottom centre</option>
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="top-center">Top centre</option>
                <option value="top-right">Top right</option>
                <option value="top-left">Top left</option>
              </select>
            </div>
            <div>
              <label htmlFor="pn-format" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>Format</label>
              <select id="pn-format" className="input" style={{appearance:'auto'}} value={pnFormat}
                      onChange={(e:React.ChangeEvent<HTMLSelectElement>) => setPnFormat(e.target.value as any)}>
                <option value="1">1, 2, 3…</option>
                <option value="Page 1">Page 1, Page 2…</option>
                <option value="1 / N">1 / 10, 2 / 10…</option>
                <option value="- 1 -">- 1 -, - 2 -…</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pn-start" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>Start number</label>
              <input id="pn-start" type="number" min={1} max={999} value={pnStart} className="input"
                     onChange={(e:React.ChangeEvent<HTMLInputElement>) => setPnStart(parseInt(e.target.value)||1)} />
            </div>
            <div>
              <label htmlFor="pn-size" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>Font size (pt)</label>
              <input id="pn-size" type="number" min={7} max={24} value={pnFontSize} className="input"
                     onChange={(e:React.ChangeEvent<HTMLInputElement>) => setPnFontSize(parseInt(e.target.value)||11)} />
            </div>
          </div>
          <div className="px-4 py-2.5 rounded-xl text-xs" style={{background:'var(--surface)',border:'1px solid var(--border)',color:'var(--ink-muted)'}}>
            Preview: <span className="font-semibold" style={{color:'var(--ink)'}}>{pnFormat==='1'?`${pnStart}`:pnFormat==='Page 1'?`Page ${pnStart}`:pnFormat==='1 / N'?`${pnStart} / N`:`- ${pnStart} -`}</span> at {pnPosition.replace('-',' ')}
          </div>
          <button onClick={() => handleToolAction('pagenum')} className="btn-primary w-full"
                  aria-label="Add page numbers to PDF" style={{background:'#0369a1'}}>
            Add Page Numbers
          </button>
        </div>
      )}

      {/* ── Crop pages panel ─────────────────────────────────────────────── */}
      {selectedTool === 'crop' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">✂️</span>
            <div><p className="font-semibold text-sm">Crop Pages</p><p className="text-xs" style={{color:'rgba(10,10,15,0.4)'}}>Trim whitespace / margins from all pages</p></div>
          </div>
          <p className="text-xs" style={{color:'var(--ink-muted)'}}>Enter points to remove from each edge (1 pt ≈ 0.35 mm)</p>
          <div className="grid grid-cols-2 gap-3">
            {([['Top','cropTop',cropTop,setCropTop],['Bottom','cropBottom',cropBottom,setCropBottom],['Left','cropLeft',cropLeft,setCropLeft],['Right','cropRight',cropRight,setCropRight]] as any[]).map(([label,key,val,setter]) => (
              <div key={key}>
                <label htmlFor={key} className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>{label} (pt)</label>
                <input id={key} type="number" min={0} max={400} value={val} className="input"
                       onChange={(e:React.ChangeEvent<HTMLInputElement>) => setter(parseInt(e.target.value)||0)} />
              </div>
            ))}
          </div>
          <div className="px-4 py-2.5 rounded-xl text-xs" style={{background:'var(--surface)',border:'1px solid var(--border)',color:'var(--ink-muted)'}}>
            Removing: {cropTop}pt top · {cropBottom}pt bottom · {cropLeft}pt left · {cropRight}pt right
          </div>
          <button onClick={() => handleToolAction('crop')} className="btn-primary w-full"
                  aria-label="Crop PDF pages" style={{background:'#0891b2'}}>
            Crop Pages
          </button>
        </div>
      )}

      {/* ── Extract Text panel ───────────────────────────────────────────── */}
      {selectedTool === 'totext' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">📝</span>
            <div><p className="font-semibold text-sm">Extract Text</p><p className="text-xs" style={{color:'rgba(10,10,15,0.4)'}}>Export PDF text layer as file</p></div>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-2" style={{color:'var(--ink-muted)'}}>Output format</label>
            <div className="grid grid-cols-2 gap-2">
              {(['txt','md'] as const).map(fmt => (
                <button key={fmt} onClick={() => setTextFmt(fmt)}
                        className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                        aria-pressed={textFmt===fmt}
                        style={{background:textFmt===fmt?'var(--blue-vivid)':'var(--surface-2)',color:textFmt===fmt?'white':'var(--ink)',border:`1.5px solid ${textFmt===fmt?'var(--blue-vivid)':'var(--border)'}`}}>
                  {fmt === 'txt' ? '📄 Plain Text (.txt)' : '📋 Markdown (.md)'}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs" style={{color:'var(--ink-muted)'}}>
            {textFmt==='md'?'Exports with ## Page headings, good for AI workflows and docs.':'Plain text, one page per section. Works in any editor.'}
          </p>
          <button onClick={() => handleToolAction('totext')} className="btn-primary w-full"
                  aria-label={`Export PDF as ${textFmt} file`} style={{background:'#4338ca'}}>
            Export as .{textFmt}
          </button>
        </div>
      )}

      {/* ── QR Code panel ───────────────────────────────────────────────── */}
      {selectedTool === 'qrcode' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">⬛</span>
            <div><p className="font-semibold text-sm">Add QR Code</p><p className="text-xs" style={{color:'rgba(10,10,15,0.4)'}}>Insert a scannable QR code onto a page</p></div>
          </div>
          <div>
            <label htmlFor="qr-url" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>URL or text to encode</label>
            <input id="qr-url" className="input" value={qrUrl} placeholder="https://example.com"
                   onChange={(e:React.ChangeEvent<HTMLInputElement>) => setQrUrl(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="qr-page" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>Page</label>
              <input id="qr-page" type="number" min={1} value={qrPage} className="input"
                     onChange={(e:React.ChangeEvent<HTMLInputElement>) => setQrPage(parseInt(e.target.value)||1)} />
            </div>
            <div>
              <label htmlFor="qr-size" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>Size (pt)</label>
              <input id="qr-size" type="number" min={40} max={300} value={qrSize} className="input"
                     onChange={(e:React.ChangeEvent<HTMLInputElement>) => setQrSize(parseInt(e.target.value)||80)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="qr-x" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>X (pt from left)</label>
              <input id="qr-x" type="number" min={0} value={qrX} className="input"
                     onChange={(e:React.ChangeEvent<HTMLInputElement>) => setQrX(parseInt(e.target.value)||0)} />
            </div>
            <div>
              <label htmlFor="qr-y" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>Y (pt from top)</label>
              <input id="qr-y" type="number" min={0} value={qrY} className="input"
                     onChange={(e:React.ChangeEvent<HTMLInputElement>) => setQrY(parseInt(e.target.value)||0)} />
            </div>
          </div>
          <button onClick={() => handleToolAction('qrcode')} className="btn-primary w-full"
                  aria-label="Add QR code to PDF" style={{background:'#0d9488'}}>
            Insert QR Code
          </button>
        </div>
      )}

      {/* ── Redact panel ─────────────────────────────────────────────────── */}
      {selectedTool === 'redact' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">⬛</span>
            <div><p className="font-semibold text-sm">Redact Content</p><p className="text-xs" style={{color:'rgba(10,10,15,0.4)'}}>Permanently black-out sensitive information</p></div>
          </div>
          <div className="px-4 py-3 rounded-xl text-xs" role="note"
               style={{background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.2)',color:'#991b1b'}}>
            ⚠️ Redaction is permanent and irreversible. The content under black boxes cannot be recovered.
          </div>
          <p className="text-xs" style={{color:'var(--ink-muted)'}}>
            Specify rectangular regions to black out. Coordinates are in PDF points (1 pt ≈ 0.35 mm) from the top-left corner.
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold" style={{color:'var(--ink-muted)'}}>Regions to redact</label>
              <button onClick={() => setRedactRegions(r => [...r, {page:1,x:50,y:50,w:200,h:30}])}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                      style={{background:'var(--surface-2)',border:'1px solid var(--border)',color:'var(--ink)'}}>
                + Add region
              </button>
            </div>
            {redactRegions.length === 0 && (
              <p className="text-xs text-center py-4" style={{color:'var(--ink-muted)'}}>No regions yet. Click "+ Add region" above.</p>
            )}
            {redactRegions.map((r, i) => (
              <div key={i} className="rounded-xl p-3 space-y-2" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{color:'var(--ink-muted)'}}>Region {i+1}</span>
                  <button onClick={() => setRedactRegions(rs => rs.filter((_,idx) => idx !== i))}
                          className="text-xs px-2 py-0.5 rounded-lg" style={{color:'#dc2626',background:'#fee2e2'}}
                          aria-label={`Remove region ${i+1}`}>Remove</button>
                </div>
                <div className="grid grid-cols-5 gap-1.5 text-xs">
                  {(['page','x','y','w','h'] as const).map(field => (
                    <div key={field}>
                      <label className="block mb-0.5 font-medium" style={{color:'var(--ink-muted)'}}>{field==='w'?'Width':field==='h'?'Height':field.toUpperCase()}</label>
                      <input type="number" min={field==='page'?1:0} value={r[field]} className="input" style={{padding:'4px 8px',fontSize:'11px'}}
                             aria-label={`Region ${i+1} ${field}`}
                             onChange={(e:React.ChangeEvent<HTMLInputElement>) => setRedactRegions(rs => rs.map((rr,idx) => idx===i?{...rr,[field]:parseInt(e.target.value)||0}:rr))} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {redactRegions.length > 0 && (
            <button onClick={() => handleToolAction('redact')} className="btn-primary w-full"
                    aria-label="Apply redactions permanently" style={{background:'#1c1917'}}>
              Apply Redactions Permanently ({redactRegions.length} region{redactRegions.length>1?'s':''})
            </button>
          )}
          <button onClick={async () => {
            const pdfF = files.find(f => f.name.toLowerCase().endsWith('.pdf'))
            if (!pdfF) { showStatus('No PDF loaded'); return }
            showStatus('Checking for text layer beneath black regions…', 5000)
            try {
              const pdfjsLib = await import('pdfjs-dist')
              if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
              const buf = await pdfF.arrayBuffer()
              const pdf = await pdfjsLib.getDocument({ data: buf }).promise
              let foundText = false
              for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i)
                const tc = await page.getTextContent()
                if ((tc.items as any[]).some((it: any) => it.str?.trim())) { foundText = true; break }
              }
              if (foundText) {
                showStatus('⚠️ Text layer found — apply redactions first, then Flatten to permanently remove it', 7000)
              } else {
                showStatus('✓ No accessible text layer — redaction appears effective')
              }
            } catch(e: any) { showStatus('Verify failed: ' + e.message) }
          }} className="btn-ghost w-full text-xs py-2.5"
                  style={{border:'1px solid var(--border)'}}>
            🔍 Verify — check for hidden text layer
          </button>
        </div>
      )}

      {/* ── Rearrange panel (dedicated UI) ──────────────────────────────── */}
      {selectedTool === 'rearrange' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xl">⇅</span>
              <div>
                <p className="font-semibold text-sm">Rearrange Pages</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(15,23,42,0.45)' }}>
                  Drag the page thumbnails below to reorder, then click Save Order
                </p>
              </div>
            </div>
            <button onClick={() => handleToolAction('merge')} className="btn-primary flex-shrink-0"
                    style={{ background: '#ea580c' }}>
              Save Order
            </button>
          </div>
          {pageOrder && pageOrder.length > 0 && JSON.stringify(pageOrder) !== JSON.stringify(Array.from({length: pageOrder.length}, (_,i) => i+1)) && (
            <div className="mt-3 px-3 py-2 rounded-xl text-xs font-medium animate-slide-down"
                 style={{ background: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa' }}>
              ✓ {pageOrder.length} pages reordered — click "Save Order" to apply
            </div>
          )}
        </div>
      )}

      {/* ── Annotation (edit) panel ──────────────────────────────────────── */}
      {localEditMode && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in" style={{ borderColor: 'rgba(249,115,22,0.2)' }}>
          <div className="flex items-center gap-3 mb-4">
          {/* Mobile: show sheet trigger */}
          <button className="sm:hidden flex-shrink-0 btn-ghost text-xs px-3 py-2"
                  onClick={() => setShowMobileSheet(true)}
                  aria-label="Open tool picker"
                  style={{background:'var(--blue-pale)',color:'var(--blue-vivid)'}}>
            ⚡ Tools
          </button>
            <span className="text-xl">✐</span>
            <div>
              <p className="font-semibold text-sm">Annotation Mode Active</p>
              <p className="text-xs" style={{ color: 'rgba(10,10,15,0.4)' }}>Click on the PDF preview to place text</p>
            </div>
          </div>
          {pendingEdit && (
            <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium"
                 style={{ background: 'var(--blue-light)', color: 'var(--blue-vivid)' }}>
              📍 Placing on page {pendingEdit.pageIndex + 1}
            </div>
          )}
          <div className="flex gap-2 mb-3">
            <input type="text" value={editText} onChange={e => setEditText(e.target.value)}
                   placeholder="Text to add…" className="input flex-1"
                   onKeyDown={e => { if (e.key === 'Enter' && editText.trim() && pendingEdit) handleEditApply() }} />
            <button onClick={handleEditApply} disabled={!editText.trim() || !pendingEdit} className="btn-primary px-4">Add</button>
          </div>
          <div className="flex items-center gap-3 mb-4">
          {/* Mobile: show sheet trigger */}
          <button className="sm:hidden flex-shrink-0 btn-ghost text-xs px-3 py-2"
                  onClick={() => setShowMobileSheet(true)}
                  aria-label="Open tool picker"
                  style={{background:'var(--blue-pale)',color:'var(--blue-vivid)'}}>
            ⚡ Tools
          </button>
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: 'var(--ink-muted)' }}>Color</label>
              <input type="color" value={editColor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditColor(e.target.value)}
                     className="w-8 h-8 rounded-lg cursor-pointer" style={{ border: '1px solid var(--border)', padding: 2 }} />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <label className="text-xs whitespace-nowrap" style={{ color: 'var(--ink-muted)' }}>Size: {editFontSize}pt</label>
              <input type="range" min="8" max="48" step="2" value={editFontSize} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditFontSize(parseInt(e.target.value))} className="flex-1" />
            </div>
          </div>
          {currentEdits.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="badge badge-amber">{currentEdits.length} pending edit{currentEdits.length > 1 ? 's' : ''}</span>
              <div className="flex gap-2">
                <button onClick={() => onEditsChange?.([])} className="btn-ghost text-xs px-3 py-1.5"
                        style={{ color: 'var(--amber)' }}>Clear</button>
                <button onClick={handleSaveEdits} className="btn-primary text-xs px-4 py-2"
                        style={{ background: 'var(--green)' }}>Save & Download</button>
              </div>
            </div>
          )}
          {/* ── Freehand draw section ── */}
          {drawMode && (
            <div className="space-y-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold" style={{ color: 'var(--ink-muted)' }}>Drawing on page {drawPageNum}</p>
                <div className="flex items-center gap-2">
                  <label className="text-xs" style={{ color: 'var(--ink-muted)' }}>Pg</label>
                  <input type="number" min={1} value={drawPageNum} className="input text-xs"
                         style={{ width: 56, padding: '4px 8px' }}
                         onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDrawPageNum(parseInt(e.target.value)||1)} />
                </div>
              </div>
              {drawPageImg && (
                <div className="relative rounded-xl overflow-hidden" style={{ border: '2px solid var(--blue-vivid)' }}>
                  <img src={drawPageImg} alt={`Page ${drawPageNum}`} style={{ width: '100%', display: 'block', opacity: 0.9 }} />
                  <canvas ref={fabricCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {(['pen','highlight','line','rect'] as const).map(mode => (
                  <button key={mode} onClick={() => setDrawMode(mode)} aria-pressed={drawMode===mode}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all"
                          style={{ background: drawMode===mode?drawColor:'var(--surface-2)', color: drawMode===mode?'white':'var(--ink)', border: `1.5px solid ${drawMode===mode?drawColor:'var(--border)'}` }}>
                    {mode === 'pen' ? '✏️ Pen' : mode === 'highlight' ? '🖊 Highlight' : mode === 'line' ? '— Line' : '▭ Rect'}
                  </button>
                ))}
                <input type="color" value={drawColor} title="Draw colour"
                       onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDrawColor(e.target.value)}
                       className="w-8 h-8 rounded-lg cursor-pointer flex-shrink-0" style={{ border: '1px solid var(--border)', padding: 2 }} />
                <input type="range" min={1} max={20} value={drawWidth} title="Brush width"
                       onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDrawWidth(parseInt(e.target.value))}
                       style={{ width: 70 }} aria-label="Brush width" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { if (fabricCanvas) fabricCanvas.clear() }}
                        className="btn-ghost flex-1 text-xs" style={{ color: 'var(--ink-muted)' }}>
                  Clear Canvas
                </button>
                <button onClick={handleSaveDrawAnnotations} className="btn-primary flex-1 text-xs"
                        style={{ background: 'var(--accent)' }} aria-label="Burn drawing into PDF">
                  Save Drawing to PDF
                </button>
              </div>
            </div>
          )}
          {!drawMode && (
            <button onClick={() => setDrawMode('pen')}
                    className="w-full text-xs font-semibold py-2 rounded-xl transition-all mt-1"
                    style={{ background: 'rgba(249,115,22,0.08)', color: 'var(--accent)', border: '1.5px dashed rgba(249,115,22,0.3)' }}>
              ✏️ Enable Freehand Drawing & Highlights
            </button>
          )}
          <button onClick={() => { setLocalEditMode(false); setDrawMode(null); onToolSelect(''); onEditsChange?.([]); setPendingEdit(null); setEditText('') }}
                  className="btn-ghost w-full mt-1 text-xs" style={{ color: 'rgba(10,10,15,0.4)' }}>
            Exit Annotation Mode
          </button>
        </div>
      )}

      {/* ── Unlock PDF panel ────────────────────────────────────────────── */}
      {selectedTool === 'aesencrypt' && files.length > 0 && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">🛡</span>
            <div>
              <p className="font-semibold text-sm">{aesMode === 'decrypt' ? 'Decrypt with AES-256' : 'Encrypt with AES-256'}</p>
              <p className="text-xs" style={{color:'rgba(10,10,15,0.4)'}}>Real password protection. Runs in your browser — nothing is uploaded.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAesMode('encrypt')} className="flex-1 text-sm py-2 rounded-lg font-medium transition-colors"
                    style={{ background: aesMode === 'encrypt' ? '#7c3aed' : 'var(--surface-2)', color: aesMode === 'encrypt' ? '#fff' : 'var(--ink-soft)', border: '1px solid var(--border)' }}>
              🛡 Encrypt
            </button>
            <button onClick={() => setAesMode('decrypt')} className="flex-1 text-sm py-2 rounded-lg font-medium transition-colors"
                    style={{ background: aesMode === 'decrypt' ? '#7c3aed' : 'var(--surface-2)', color: aesMode === 'decrypt' ? '#fff' : 'var(--ink-soft)', border: '1px solid var(--border)' }}>
              🔓 Decrypt
            </button>
          </div>
          <div>
            <label htmlFor="aes-pw" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>{aesMode === 'decrypt' ? 'Enter the password' : 'Set a password'}</label>
            <input id="aes-pw" type="password" className="input" value={aesPassword}
                   placeholder={aesMode === 'decrypt' ? 'Password used to encrypt…' : 'Choose a strong password…'}
                   onChange={(e:React.ChangeEvent<HTMLInputElement>) => setAesPassword(e.target.value)}
                   onKeyDown={(e:React.KeyboardEvent) => { if (e.key === 'Enter' && aesPassword) handleToolAction('aesencrypt') }}
                   aria-label={aesMode === 'decrypt' ? 'Decryption password' : 'Encryption password'} />
            {aesMode === 'encrypt' && (
              <p className="text-xs mt-1.5" style={{color:'rgba(10,10,15,0.4)'}}>⚠️ Keep it safe — if you lose this password, the file cannot be recovered.</p>
            )}
          </div>
          <button onClick={() => handleToolAction('aesencrypt')} className="btn-primary w-full"
                  disabled={!aesPassword}
                  aria-label={aesMode === 'decrypt' ? 'Decrypt file' : 'Encrypt file with AES-256'} style={{background: aesPassword ? '#7c3aed' : '#c4b5d8'}}>
            {aesMode === 'decrypt' ? '🔓 Decrypt file' : '🛡 Encrypt file'}
          </button>
        </div>
      )}

      {selectedTool === 'unlock' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">🔓</span>
            <div>
              <p className="font-semibold text-sm">Remove Password</p>
              <p className="text-xs" style={{color:'rgba(10,10,15,0.4)'}}>Enter the current password to unlock the PDF</p>
            </div>
          </div>
          <div>
            <label htmlFor="unlock-pw" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>Current password</label>
            <input id="unlock-pw" type="password" className="input" value={unlockPassword}
                   placeholder="Enter PDF password…"
                   onChange={(e:React.ChangeEvent<HTMLInputElement>) => setUnlockPassword(e.target.value)}
                   onKeyDown={(e:React.KeyboardEvent) => { if (e.key === 'Enter') handleToolAction('unlock') }}
                   aria-label="Current PDF password" />
          </div>
          <button onClick={() => handleToolAction('unlock')} className="btn-primary w-full"
                  aria-label="Remove PDF password" style={{background:'#be185d'}}>
            🔓 Remove Password
          </button>
        </div>
      )}

      {/* ── Header / Footer panel ────────────────────────────────────────── */}
      {selectedTool === 'headfoot' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">📑</span>
            <div>
              <p className="font-semibold text-sm">Add Header & Footer</p>
              <p className="text-xs" style={{color:'rgba(10,10,15,0.4)'}}>Tokens: {'{page}'} · {'{total}'} · {'{date}'} · {'{year}'}</p>
            </div>
          </div>
          <div>
            <label htmlFor="hf-header" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>Header text (leave blank to skip)</label>
            <input id="hf-header" className="input" value={hfHeader} placeholder="e.g. My Company — Confidential"
                   onChange={(e:React.ChangeEvent<HTMLInputElement>) => setHfHeader(e.target.value)} />
          </div>
          <div>
            <label htmlFor="hf-footer" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>Footer text (leave blank to skip)</label>
            <input id="hf-footer" className="input" value={hfFooter} placeholder="e.g. Page {page} of {total}"
                   onChange={(e:React.ChangeEvent<HTMLInputElement>) => setHfFooter(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="hf-align" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>Alignment</label>
              <select id="hf-align" className="input" style={{appearance:'auto'}} value={hfAlign}
                      onChange={(e:React.ChangeEvent<HTMLSelectElement>) => setHfAlign(e.target.value as any)}>
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div>
              <label htmlFor="hf-size" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>Font size (pt)</label>
              <input id="hf-size" type="number" min={7} max={16} value={hfFontSize} className="input"
                     onChange={(e:React.ChangeEvent<HTMLInputElement>) => setHfFontSize(parseInt(e.target.value)||10)} />
            </div>
          </div>
          {(hfHeader || hfFooter) && (
            <div className="px-3 py-2 rounded-xl text-xs" style={{background:'var(--surface)',border:'1px solid var(--border)',color:'var(--ink-muted)'}}>
              {hfHeader && <div>↑ Header: <span className="font-semibold" style={{color:'var(--ink)'}}>{hfHeader}</span></div>}
              {hfFooter && <div>↓ Footer: <span className="font-semibold" style={{color:'var(--ink)'}}>{hfFooter}</span></div>}
            </div>
          )}
          <button onClick={() => handleToolAction('headfoot')} className="btn-primary w-full"
                  aria-label="Add header and footer" style={{background:'#0369a1'}}>
            Add Header & Footer
          </button>
        </div>
      )}

      {/* ── Grayscale panel ─────────────────────────────────────────────── */}
      {selectedTool === 'grayscale' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xl" aria-hidden="true">⬜</span>
              <div>
                <p className="font-semibold text-sm">Convert to Grayscale</p>
                <p className="text-xs" style={{color:'rgba(10,10,15,0.4)'}}>Removes all colour — saves ink & reduces file size</p>
              </div>
            </div>
            <span className="speed-pill">⏱ {getSpeedEstimate('grayscale') || '~5 s'}</span>
          </div>
          <button onClick={() => handleToolAction('grayscale')} className="btn-primary w-full mt-4"
                  aria-label="Convert PDF to grayscale" style={{background:'#374151'}}>
            Convert to Grayscale
          </button>
        </div>
      )}

      {/* ── Insert / Duplicate Page panel ────────────────────────────────── */}
      {selectedTool === 'insertpage' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">➕</span>
            <div>
              <p className="font-semibold text-sm">Insert / Duplicate Page</p>
              <p className="text-xs" style={{color:'rgba(10,10,15,0.4)'}}>Add a blank or duplicate page at any position</p>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-2" style={{color:'var(--ink-muted)'}}>Page type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['blank','duplicate'] as const).map(t => (
                <button key={t} onClick={() => setInsertType(t)} aria-pressed={insertType===t}
                        className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                        style={{background:insertType===t?'var(--blue-vivid)':'var(--surface-2)',color:insertType===t?'white':'var(--ink)',border:`1.5px solid ${insertType===t?'var(--blue-vivid)':'var(--border)'}`}}>
                  {t === 'blank' ? '⬜ Blank page' : '📋 Duplicate page'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="insert-after" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>
              Insert after page
            </label>
            <input id="insert-after" type="number" min={0} value={insertAfter} className="input"
                   onChange={(e:React.ChangeEvent<HTMLInputElement>) => setInsertAfter(parseInt(e.target.value)||1)}
                   aria-label="Insert after page number" />
            <p className="text-xs mt-1" style={{color:'var(--ink-muted)'}}>Use 0 to insert before page 1</p>
          </div>
          <button onClick={() => handleToolAction('insertpage')} className="btn-primary w-full"
                  aria-label="Insert page into PDF" style={{background:'#059669'}}>
            Insert {insertType === 'blank' ? 'Blank' : 'Duplicate'} Page
          </button>
        </div>
      )}

      {/* ── Split by N pages panel ───────────────────────────────────────── */}
      {selectedTool === 'splitn' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">📄</span>
            <div>
              <p className="font-semibold text-sm">Split Every N Pages</p>
              <p className="text-xs" style={{color:'rgba(10,10,15,0.4)'}}>Divide into equal chunks — delivered as a ZIP</p>
            </div>
          </div>
          <div>
            <label htmlFor="split-n" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>Pages per chunk</label>
            <input id="split-n" type="number" min={1} max={500} value={splitN} className="input"
                   onChange={(e:React.ChangeEvent<HTMLInputElement>) => setSplitN(parseInt(e.target.value)||1)}
                   aria-label="Number of pages per chunk" />
          </div>
          <div className="px-3 py-2 rounded-xl text-xs" style={{background:'var(--surface)',border:'1px solid var(--border)',color:'var(--ink-muted)'}}>
            Result: every {splitN} page{splitN!==1?'s':''} → separate PDF file inside a ZIP
          </div>
          <button onClick={() => handleToolAction('splitn')} className="btn-primary w-full"
                  aria-label="Split PDF into chunks" style={{background:'#7c3aed'}}>
            Split into {splitN}-Page Chunks
          </button>
        </div>
      )}

      {/* ── PDF → PPTX panel ────────────────────────────────────────────── */}
      {selectedTool === 'topptx' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xl" aria-hidden="true">📊</span>
              <div>
                <p className="font-semibold text-sm">PDF to PowerPoint</p>
                <p className="text-xs" style={{color:'rgba(10,10,15,0.4)'}}>Each page becomes a full-slide image in .pptx</p>
              </div>
            </div>
            <span className="speed-pill">⏱ {getSpeedEstimate('topptx') || '~5 s'}</span>
          </div>
          <div className="mt-3 px-3 py-2.5 rounded-xl text-xs" role="note"
               style={{background:'rgba(37,99,235,0.06)',border:'1px solid rgba(37,99,235,0.15)',color:'var(--blue-vivid)'}}>
            ℹ️ Pages are embedded as high-quality images. Text in the slides will not be editable.
          </div>
          <button onClick={() => handleToolAction('topptx')} className="btn-primary w-full mt-4"
                  aria-label="Convert PDF to PowerPoint" style={{background:'#ea580c'}}>
            Export as PowerPoint
          </button>
        </div>
      )}

      {/* ── File Hash / Integrity panel ──────────────────────────────────── */}
      {selectedTool === 'hashcheck' && files.length > 0 && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">🔑</span>
            <div>
              <p className="font-semibold text-sm">File Integrity — SHA-256</p>
              <p className="text-xs" style={{color:'rgba(10,10,15,0.4)'}}>Verify a file hasn't been altered</p>
            </div>
          </div>
          <button onClick={() => handleToolAction('hashcheck')} className="btn-primary w-full"
                  aria-label="Compute SHA-256 hash" style={{background:'#6366f1'}}>
            Compute SHA-256 Hash
          </button>
          {hashResult && (
            <div className="space-y-2 animate-fade-in">
              <div className="px-4 py-3 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
                <p className="text-xs font-semibold mb-1" style={{color:'var(--ink-muted)'}}>File: {hashResult.name}</p>
                <p className="text-xs mb-2" style={{color:'var(--ink-muted)'}}>{(hashResult.size/1024).toFixed(1)} KB</p>
                <p className="text-xs font-semibold mb-1" style={{color:'var(--ink-muted)'}}>SHA-256</p>
                <code className="text-xs break-all font-mono block p-2 rounded-lg"
                      style={{background:'var(--surface-2)',color:'var(--ink)',userSelect:'all'}}
                      aria-label="SHA-256 hash value">
                  {hashResult.hash}
                </code>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(hashResult.hash); }}
                      className="btn-ghost w-full text-xs" aria-label="Copy hash to clipboard">
                📋 Copy hash to clipboard
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── OCR panel ──────────────────────────────────────────────────────── */}
      {selectedTool === 'ocr' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">🔎</span>
            <div>
              <p className="font-semibold text-sm">OCR — Make PDF Searchable</p>
              <p className="text-xs" style={{color:'rgba(10,10,15,0.4)'}}>Runs 100% in your browser — nothing is uploaded</p>
            </div>
          </div>
          <div className="px-4 py-3 rounded-xl text-xs" role="note"
               style={{background:'rgba(8,145,178,0.06)',border:'1px solid rgba(8,145,178,0.2)',color:'#0e7490'}}>
            ℹ️ Best for scanned PDFs with no existing text layer. Processing may take 30–90 s for multi-page documents.
          </div>
          <div>
            <label htmlFor="ocr-lang" className="text-xs font-semibold block mb-1.5" style={{color:'var(--ink-muted)'}}>Language</label>
            <select id="ocr-lang" className="input" style={{appearance:'auto'}} value={ocrLang}
                    onChange={(e:React.ChangeEvent<HTMLSelectElement>) => setOcrLang(e.target.value)}>
              <option value="eng">English</option>
              <option value="fra">French</option>
              <option value="deu">German</option>
              <option value="spa">Spanish</option>
              <option value="ita">Italian</option>
              <option value="por">Portuguese</option>
              <option value="chi_sim">Chinese (Simplified)</option>
              <option value="chi_tra">Chinese (Traditional)</option>
              <option value="jpn">Japanese</option>
              <option value="ara">Arabic</option>
              <option value="hin">Hindi</option>
              <option value="rus">Russian</option>
            </select>
          </div>
          <div className="px-3 py-2.5 rounded-xl text-xs" style={{background:'var(--surface)',border:'1px solid var(--border)',color:'var(--ink-muted)'}}>
            ⏱ Estimated: {(() => {
              const mb = pdfFiles[0]?.size / (1024*1024)
              return mb < 2 ? '~30–60 s' : mb < 5 ? '~60–120 s' : '~2–5 min'
            })()}
          </div>
          <button onClick={() => handleToolAction('ocr')} className="btn-primary w-full"
                  aria-label="Run OCR on scanned PDF" style={{background:'#0891b2'}}>
            🔎 Run OCR (Client-Side)
          </button>
        </div>
      )}


      {/* ── READABILITY ──────────────────────────────────────────────────── */}
      {selectedTool === 'readability' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">📖</span>
            <div><p className="font-semibold text-sm">Readability Score</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Flesch-Kincaid reading level analysis</p></div>
          </div>
          {readabilityLoading && <div className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded-full border border-t-transparent animate-spin" style={{borderColor:'var(--border-strong)',borderTopColor:'var(--blue-vivid)'}}/> Analysing text…</div>}
          {readabilityResult && !readabilityLoading && (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold"
                     style={{background:`conic-gradient(var(--green) ${readabilityResult.score}%, var(--surface-2) 0)`,color:'var(--ink)'}}>
                  <span className="rounded-full w-16 h-16 flex items-center justify-center text-xl font-bold"
                        style={{background:'var(--card-bg)'}}>{readabilityResult.score}</span>
                </div>
                <div>
                  <p className="font-bold text-base">{readabilityResult.grade}</p>
                  <p className="text-xs" style={{color:'var(--ink-muted)'}}>{readabilityResult.suggestion}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[['📝 Words', readabilityResult.wordCount.toLocaleString()],['📄 Sentences', readabilityResult.sentenceCount],['⏱ Reading time', `${readabilityResult.readingTimeMin} min`],['📏 Avg sentence', `${readabilityResult.avgWordsPerSentence} words`]].map(([l,v])=>(
                  <div key={String(l)} className="px-3 py-2 rounded-xl" style={{background:'var(--surface)'}}>
                    <span style={{color:'var(--ink-muted)'}}>{l}: </span><span className="font-semibold">{String(v)}</span>
                  </div>
                ))}
              </div>
              {readabilityResult.topWords.length > 0 && (
                <div><p className="text-xs font-semibold mb-1" style={{color:'var(--ink-muted)'}}>Top keywords:</p>
                  <div className="flex flex-wrap gap-1">{readabilityResult.topWords.slice(0,8).map((w:any)=>(
                    <span key={w.word} className="text-xs px-2 py-0.5 rounded-lg" style={{background:'var(--blue-pale)',color:'var(--blue-vivid)'}}>{w.word} <span style={{opacity:0.6}}>×{w.count}</span></span>
                  ))}</div>
                </div>
              )}
            </div>
          )}
          {!readabilityResult && !readabilityLoading && (
            <button onClick={() => handleToolAction('readability')} className="btn-primary w-full">📖 Analyse Readability</button>
          )}
        </div>
      )}

      {/* ── PDF COMPARE ──────────────────────────────────────────────────── */}
      {selectedTool === 'pdfcompare' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">⚖️</span>
            <div><p className="font-semibold text-sm">Compare Two PDFs</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Line-by-line text diff</p></div>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1" style={{color:'var(--ink-muted)'}}>Second PDF to compare against:</label>
            <input type="file" accept=".pdf" onChange={e => setCompareFile(e.target.files?.[0]||null)}
                   className="text-xs w-full" style={{color:'var(--ink)'}}/>
          </div>
          {compareFile && <p className="text-xs" style={{color:'var(--ink-muted)'}}>Comparing: <b>{pdfFiles[0]?.name}</b> ↔ <b>{compareFile.name}</b></p>}
          <button onClick={() => handleToolAction('pdfcompare')} disabled={!compareFile || compareLoading}
                  className="btn-primary w-full" style={{background:'#7c3aed'}}>
            {compareLoading ? 'Comparing…' : '⚖️ Compare PDFs'}
          </button>
          {compareResult && !compareLoading && (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {compareResult.length === 0 ? <p className="text-xs text-center py-4" style={{color:'var(--green)'}}>✓ No differences found — documents are identical</p>
              : compareResult.map((d:any,i:number) => (
                <div key={i} className="text-xs px-3 py-2 rounded-lg font-mono"
                     style={{background: d.type==='added'?'#dcfce7':d.type==='removed'?'#fee2e2':'var(--surface)', color: d.type==='added'?'#15803d':d.type==='removed'?'#dc2626':'var(--ink)'}}>
                  {d.type==='added'?'+ ':d.type==='removed'?'- ':'~ '}{d.text.slice(0,120)}
                </div>
              ))}
              <p className="text-xs text-right" style={{color:'var(--ink-muted)'}}>{compareResult.length} difference{compareResult.length!==1?'s':''}</p>
            </div>
          )}
        </div>
      )}

      {/* ── ACCESSIBILITY ─────────────────────────────────────────────────── */}
      {selectedTool === 'a11ycheck' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">♿</span>
            <div><p className="font-semibold text-sm">Accessibility Checker</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>WCAG / PDF-UA compliance audit</p></div>
          </div>
          <button onClick={() => handleToolAction('a11ycheck')} disabled={a11yLoading} className="btn-primary w-full" style={{background:'#059669'}}>
            {a11yLoading ? 'Checking…' : '♿ Run Accessibility Check'}
          </button>
          {a11yResult && (
            <div className="space-y-2">
              {a11yResult.map((c:any) => (
                <div key={c.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
                     style={{background: c.pass?'var(--green-light)':c.severity==='critical'?'#fee2e2':c.severity==='warning'?'#fef3c7':'var(--surface)'}}>
                  <span className="text-base mt-0.5">{c.pass?'✓':c.severity==='critical'?'✗':'⚠️'}</span>
                  <div><p className="text-xs font-semibold">{c.label}</p><p className="text-xs" style={{color:'var(--ink-soft)'}}>{c.detail}</p></div>
                  <span className="ml-auto text-xs px-1.5 py-0.5 rounded-md font-semibold"
                        style={{background:c.severity==='critical'?'#dc2626':c.severity==='warning'?'#f59e0b':'#6b7280',color:'white'}}>
                    {c.severity}
                  </span>
                </div>
              ))}
              <p className="text-xs" style={{color:'var(--ink-muted)'}}>
                {a11yResult.filter((c:any)=>c.pass).length}/{a11yResult.length} checks passed
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── PII SCAN ──────────────────────────────────────────────────────── */}
      {selectedTool === 'piiscan' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">🕵️</span>
            <div><p className="font-semibold text-sm">Sensitive Data Scanner</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>PII: emails, credit cards, NI numbers, IBANs, phone numbers…</p></div>
          </div>
          <div className="px-3 py-2 rounded-xl text-xs" style={{background:'#fef3c7',border:'1px solid #f59e0b'}}>
            ⚡ All scanning runs entirely in your browser — no data is sent anywhere.
          </div>
          <button onClick={() => handleToolAction('piiscan')} disabled={piiLoading} className="btn-primary w-full" style={{background:'#dc2626'}}>
            {piiLoading ? 'Scanning…' : '🕵️ Scan for Sensitive Data'}
          </button>
          {piiResult && (
            <div className="space-y-2">
              {piiResult.length === 0
                ? <div className="text-center py-4" style={{color:'var(--green)'}}><p className="text-lg">✓</p><p className="text-sm font-semibold">No sensitive data detected</p></div>
                : <>
                  <p className="text-xs font-semibold" style={{color:'#dc2626'}}>⚠️ {piiResult.length} finding{piiResult.length!==1?'s':''} detected</p>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {piiResult.map((m:any,i:number) => (
                      <div key={i} className="px-3 py-2 rounded-xl text-xs" style={{background:'#fee2e2',border:'1px solid #fecaca'}}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-bold text-red-700">{m.type}</span>
                          <span className="px-1.5 py-0.5 rounded text-white text-xs" style={{background:m.severity==='high'?'#dc2626':m.severity==='medium'?'#f59e0b':'#6b7280'}}>{m.severity}</span>
                        </div>
                        <p style={{color:'#991b1b'}}>Page {m.page} · <code className="font-mono">{m.value}</code></p>
                        <p className="mt-0.5 text-red-500 truncate">{m.context}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => handleToolAction('redact')} className="btn-ghost w-full text-xs" style={{border:'1px solid var(--border)'}}>
                    → Go to Redact tool to remove findings
                  </button>
                </>
              }
            </div>
          )}
        </div>
      )}

      {/* ── BOOKMARKS / TOC ───────────────────────────────────────────────── */}
      {selectedTool === 'bookmarks' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">🔖</span>
            <div><p className="font-semibold text-sm">PDF Bookmarks / TOC</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Define a table of contents and embed bookmarks</p></div>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {bookmarkList.map((bm, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="number" min={1} value={bm.page} onChange={e => setBookmarkList(prev=>prev.map((b,j)=>j===i?{...b,page:+e.target.value}:b))}
                       className="w-14 text-xs px-2 py-1.5 rounded-lg" style={{background:'var(--surface)',border:'1px solid var(--border)'}}/>
                <input type="text" value={bm.label} onChange={e => setBookmarkList(prev=>prev.map((b,j)=>j===i?{...b,label:e.target.value}:b))}
                       placeholder="Section label…" className="flex-1 text-xs px-2 py-1.5 rounded-lg" style={{background:'var(--surface)',border:'1px solid var(--border)'}}/>
                <button onClick={() => setBookmarkList(prev=>prev.filter((_,j)=>j!==i))} className="text-xs px-2 py-1 rounded-lg" style={{color:'#dc2626'}}>✕</button>
              </div>
            ))}
          </div>
          <button onClick={() => setBookmarkList(prev=>[...prev,{page:prev.length+1,label:''}])}
                  className="btn-ghost w-full text-xs" style={{border:'1px dashed var(--border)'}}>+ Add bookmark</button>
          <button onClick={() => handleToolAction('bookmarks_apply')} disabled={bookmarkList.length===0} className="btn-primary w-full" style={{background:'#b45309'}}>
            🔖 Embed Bookmarks in PDF
          </button>
        </div>
      )}

      {/* ── SPELL CHECK ───────────────────────────────────────────────────── */}
      {selectedTool === 'spellcheck' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">✓</span>
            <div><p className="font-semibold text-sm">PDF Spell Check</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Checks for common misspellings and double words</p></div>
          </div>
          <button onClick={() => handleToolAction('spellcheck')} disabled={spellLoading} className="btn-primary w-full" style={{background:'#15803d'}}>
            {spellLoading ? 'Checking…' : '✓ Run Spell Check'}
          </button>
          {spellResult && (
            spellResult.length === 0
              ? <div className="text-center py-4" style={{color:'var(--green)'}}><p className="text-lg">✓</p><p className="text-sm font-semibold">No spelling errors found</p></div>
              : <div className="space-y-2 max-h-64 overflow-y-auto">
                  <p className="text-xs font-semibold" style={{color:'#dc2626'}}>{spellResult.length} issue{spellResult.length!==1?'s':''} found</p>
                  {spellResult.map((e:any,i:number) => (
                    <div key={i} className="px-3 py-2 rounded-xl text-xs" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold" style={{color:'#dc2626'}}>{e.word}</span>
                        <span style={{color:'var(--ink-muted)'}}>Page {e.page}</span>
                        {e.suggestions.length>0 && <span style={{color:'var(--green)'}}>→ {e.suggestions[0]}</span>}
                      </div>
                      <p className="text-xs mt-0.5 truncate" style={{color:'var(--ink-muted)'}}>…{e.context}…</p>
                    </div>
                  ))}
                </div>
          )}
        </div>
      )}

      {/* ── MACRO ─────────────────────────────────────────────────────────── */}
      {selectedTool === 'macro' && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">⏺</span>
            <div><p className="font-semibold text-sm">Record & Replay Macro</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Record a sequence of operations and replay on any PDF</p></div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => { if (macroRecording) {
                if (macroName && macroSteps.length > 0) { saveMacro(macroName, macroSteps); setSavedMacros(loadMacros()); showStatus('✓ Macro saved: ' + macroName) }
                setMacroRecording(false); setMacroSteps([])
              } else { setMacroRecording(true); setMacroSteps([]); showStatus('⏺ Recording started — use any tool to record') }
            }}
                    className="btn-primary flex-1"
                    style={{background: macroRecording?'#dc2626':'#6366f1'}}>
              {macroRecording ? `⏹ Stop (${macroSteps.length} steps)` : '⏺ Start Recording'}
            </button>
            {macroRecording && <input value={macroName} onChange={e=>setMacroName(e.target.value)} placeholder="Macro name…"
                   className="flex-1 text-xs px-3 py-2 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}/>}
          </div>
          {macroSteps.length > 0 && macroRecording && (
            <div className="text-xs space-y-1">
              {macroSteps.map((s:any,i:number) => <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{background:'var(--surface)'}}>
                <span className="text-xs" style={{color:'var(--ink-muted)'}}>{i+1}.</span>
                <span className="font-semibold">{s.toolId}</span>
              </div>)}
            </div>
          )}
          {savedMacros.length > 0 && (
            <div className="space-y-2">
              <p className="section-label">Saved Macros</p>
              {savedMacros.map((m:any) => (
                <div key={m.id} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
                  <div className="flex-1"><p className="text-xs font-semibold">{m.name}</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>{m.steps.length} steps · {new Date(m.created).toLocaleDateString()}</p></div>
                  <button onClick={async () => {
                    if (!hasPDFs) { showStatus('Upload a PDF to replay macro'); return }
                    setMacroRunning(true); showStatus(`▶ Running ${m.name}…`, 5000)
                    for (const step of m.steps) { await handleToolAction(step.toolId); await new Promise(r=>setTimeout(r,500)) }
                    setMacroRunning(false); showStatus(`✓ Macro "${m.name}" complete`)
                  }} disabled={macroRunning} className="btn-primary text-xs px-3 py-1.5">▶ Run</button>
                  <button onClick={() => {
                    const json = exportMacroJSON(m)
                    const url = URL.createObjectURL(new Blob([json],{type:'application/json'}))
                    const a = document.createElement('a'); a.href=url; a.download=m.name+'.macro.json'; a.click()
                  }} className="btn-ghost text-xs px-2 py-1.5">⬇</button>
                  <button onClick={() => { deleteMacro(m.id); setSavedMacros(loadMacros()) }} className="text-xs px-2" style={{color:'#dc2626'}}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── BATCH RULES ───────────────────────────────────────────────────── */}
      {selectedTool === 'batchrules' && files.length > 0 && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">⚙️</span>
            <div><p className="font-semibold text-sm">Conditional Batch Rules</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>IF/THEN automation — applied to all uploaded files</p></div>
          </div>
          <div className="space-y-2">
            {batchRulesList.map((rule:BatchRule, i:number) => (
              <div key={i} className="px-3 py-2.5 rounded-xl text-xs space-y-1.5" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
                <div className="flex items-center justify-between">
                  <span className="font-bold" style={{color:'var(--blue-vivid)'}}>{rule.name}</span>
                  <button onClick={()=>setBatchRulesList(prev=>prev.filter((_,j)=>j!==i))} style={{color:'#dc2626'}}>✕</button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {rule.conditions.map((cond,ci) => (
                    <span key={ci} className="px-2 py-0.5 rounded-lg" style={{background:'var(--blue-pale)',color:'var(--blue-vivid)'}}>
                      IF {cond.field} {cond.op} {String(cond.value)}
                    </span>
                  ))}
                  {rule.actions.map((act,ai) => (
                    <span key={ai} className="px-2 py-0.5 rounded-lg" style={{background:'var(--green-light)',color:'#15803d'}}>
                      THEN {act.type}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={()=>setBatchRulesList(prev=>[...prev,{id:Date.now().toString(),name:'Rule '+(prev.length+1),conditions:[{field:'size',op:'>',value:5}],actions:[{type:'compress',quality:0.7}],logic:'AND' as const}])}
                  className="btn-ghost w-full text-xs" style={{border:'1px dashed var(--border)'}}>+ Add Rule</button>
          <div className="flex gap-2">
            <button onClick={() => saveBatchRules(batchRulesList)} className="btn-ghost flex-1 text-xs" style={{border:'1px solid var(--border)'}}>💾 Save Rules</button>
            <button onClick={async () => {
              if (!hasPDFs) { showStatus('Upload PDFs first'); return }
              setBatchRulesLoading(true); showStatus('Running rules…', 10000)
              const fileInfo = { sizeMB: pdfFiles[0].size/1024/1024, pages: 1, hasText: true, name: pdfFiles[0].name }
              const applicable = evaluateRules(batchRulesList, fileInfo)
              for (const act of applicable) {
                showStatus(`Applying ${act.type}…`)
                await handleToolAction(act.type)
              }
              setBatchRulesLoading(false); showStatus('✓ All rules applied')
            }} disabled={batchRulesLoading || batchRulesList.length===0} className="btn-primary flex-1 text-xs" style={{background:'#0369a1'}}>
              {batchRulesLoading ? 'Running…' : '▶ Run Rules'}
            </button>
          </div>
        </div>
      )}

      {/* ── SEMANTIC GROUPING ─────────────────────────────────────────────── */}
      {selectedTool === 'semanticgroup' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">🧩</span>
            <div><p className="font-semibold text-sm">Semantic Page Grouping</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Auto-clusters pages by topic using TF-IDF</p></div>
          </div>
          <button onClick={() => handleToolAction('semanticgroup')} disabled={semanticLoading} className="btn-primary w-full" style={{background:'#0d9488'}}>
            {semanticLoading ? 'Grouping…' : '🧩 Group Pages by Topic'}
          </button>
          {semanticGroups && semanticGroups.map((g:any, i:number) => (
            <div key={i} className="px-3 py-2.5 rounded-xl" style={{background:'var(--surface)',borderLeft:`4px solid ${['#2563eb','#7c3aed','#059669','#f97316','#0891b2'][i%5]}`}}>
              <p className="text-xs font-bold mb-1">Group {i+1}: Pages {g.pages.join(', ')}</p>
              <p className="text-xs" style={{color:'var(--ink-muted)'}}>Keywords: {g.topWords?.slice(0,5).join(', ')}</p>
              <button onClick={() => { showStatus(`Splitting group ${i+1}…`); handleToolAction('split') }}
                      className="text-xs mt-1.5 px-2 py-1 rounded-lg" style={{background:'var(--blue-pale)',color:'var(--blue-vivid)'}}>
                ✂ Split this group
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── FLASHCARDS ────────────────────────────────────────────────────── */}
      {selectedTool === 'flashcards' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">🃏</span>
            <div><p className="font-semibold text-sm">PDF → Flashcards</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Interactive study cards extracted from document</p></div>
          </div>
          {!flashcardList && <button onClick={() => handleToolAction('flashcards')} className="btn-primary w-full" style={{background:'#f97316'}}>🃏 Generate Flashcards</button>}
          {flashcardList && flashcardList.length === 0 && <p className="text-xs text-center" style={{color:'var(--ink-muted)'}}>No structured Q&A detected. Try a document with headings and body text.</p>}
          {flashcardList && flashcardList.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs" style={{color:'var(--ink-muted)'}}>{flashcardIdx+1} / {flashcardList.length} cards</p>
              <div onClick={() => setFlashcardFlipped(f=>!f)} className="cursor-pointer rounded-2xl p-6 min-h-32 flex items-center justify-center text-center transition-all"
                   style={{background: flashcardFlipped?'var(--blue-pale)':'var(--surface-2)', border:'2px solid var(--border)',userSelect:'none'}}>
                <div>
                  {!flashcardFlipped
                    ? <p className="text-sm font-semibold">{flashcardList[flashcardIdx].front}</p>
                    : <p className="text-sm" style={{color:'var(--blue-vivid)'}}>{flashcardList[flashcardIdx].back}</p>
                  }
                  <p className="text-xs mt-2" style={{color:'var(--ink-muted)'}}>{flashcardFlipped ? 'Answer' : 'Tap to reveal answer'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setFlashcardIdx(i=>Math.max(0,i-1)); setFlashcardFlipped(false) }}
                        disabled={flashcardIdx===0} className="btn-ghost flex-1 text-xs">← Prev</button>
                <button onClick={() => { setFlashcardIdx(i=>Math.min(flashcardList.length-1,i+1)); setFlashcardFlipped(false) }}
                        disabled={flashcardIdx===flashcardList.length-1} className="btn-primary flex-1 text-xs">Next →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PODCAST SCRIPT ────────────────────────────────────────────────── */}
      {selectedTool === 'podcastscript' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">🎙</span>
            <div><p className="font-semibold text-sm">PDF → Podcast Script</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Formats document as a read-aloud spoken-word script</p></div>
          </div>
          <button onClick={() => handleToolAction('podcastscript')} className="btn-primary w-full" style={{background:'#ea580c'}}>
            🎙 Generate Podcast Script
          </button>
          {podcastScript && (
            <div className="space-y-2">
              <div className="max-h-48 overflow-y-auto text-xs px-3 py-2 rounded-xl font-mono" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
                {podcastScript.slice(0,1500)}{podcastScript.length>1500?'…':''}
              </div>
              <button onClick={() => {
                const blob = new Blob([podcastScript],{type:'text/plain'})
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href=url; a.download='podcast-script.txt'; a.click()
              }} className="btn-primary w-full">⬇ Download Script (.txt)</button>
            </div>
          )}
        </div>
      )}

      {/* ── ANKI DECK ─────────────────────────────────────────────────────── */}
      {selectedTool === 'ankideck' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">🧠</span>
            <div><p className="font-semibold text-sm">PDF → Anki Flashcard Deck</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Export as Anki-compatible TSV file</p></div>
          </div>
          <button onClick={() => handleToolAction('ankideck')} className="btn-primary w-full" style={{background:'#7c3aed'}}>
            🧠 Extract Anki Cards
          </button>
          {ankiCards && (
            <div className="space-y-2">
              <p className="text-xs" style={{color:'var(--ink-muted)'}}>{ankiCards.length} card{ankiCards.length!==1?'s':''} extracted</p>
              {ankiCards.slice(0,3).map((c:any,i:number) => (
                <div key={i} className="px-3 py-2 rounded-xl text-xs" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
                  <p className="font-semibold">Q: {c.front.slice(0,80)}</p>
                  <p style={{color:'var(--ink-muted)'}}>A: {c.back.slice(0,80)}</p>
                </div>
              ))}
              {ankiCards.length>3 && <p className="text-xs" style={{color:'var(--ink-muted)'}}>…and {ankiCards.length-3} more</p>}
              <button onClick={() => {
                const tsv = buildAnkiTSV(ankiCards)
                const blob = new Blob([tsv],{type:'text/plain'})
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href=url; a.download='anki-deck.txt'; a.click()
                showStatus('✓ Import the .txt file into Anki via File → Import')
              }} className="btn-primary w-full">⬇ Download Anki TSV</button>
            </div>
          )}
        </div>
      )}

      {/* ── POSTER / TILE PRINT ───────────────────────────────────────────── */}
      {selectedTool === 'tilePrint' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">🖼</span>
            <div><p className="font-semibold text-sm">Poster / Tiling Print</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Scale one page across multiple A4 sheets</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1" style={{color:'var(--ink-muted)'}}>Columns</label>
              <input type="number" min={1} max={4} value={tileCols} onChange={e=>setTileCols(+e.target.value)}
                     className="w-full text-xs px-3 py-2 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}/>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{color:'var(--ink-muted)'}}>Rows</label>
              <input type="number" min={1} max={4} value={tileRows} onChange={e=>setTileRows(+e.target.value)}
                     className="w-full text-xs px-3 py-2 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}/>
            </div>
          </div>
          <p className="text-xs text-center" style={{color:'var(--ink-muted)'}}>→ Creates a {tileCols}×{tileRows} = {tileCols*tileRows}-sheet poster</p>
          <button onClick={() => handleToolAction('tilePrint_apply')} className="btn-primary w-full">
            🖨 Generate Tiled Poster PDF
          </button>
        </div>
      )}

      {/* ── EMAIL HTML ────────────────────────────────────────────────────── */}
      {selectedTool === 'emailhtml' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">✉️</span>
            <div><p className="font-semibold text-sm">PDF → Email-Ready HTML</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Inline HTML suitable for email marketing tools</p></div>
          </div>
          <button onClick={() => handleToolAction('emailhtml')} className="btn-primary w-full" style={{background:'#0891b2'}}>
            ✉️ Convert to Email HTML
          </button>
          {emailHtmlResult && (
            <div className="space-y-2">
              <div className="max-h-40 overflow-y-auto text-xs font-mono px-3 py-2 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
                {emailHtmlResult.slice(0,600)}…
              </div>
              <button onClick={() => navigator.clipboard?.writeText(emailHtmlResult).then(()=>showStatus('✓ Copied to clipboard'))}
                      className="btn-ghost w-full text-xs" style={{border:'1px solid var(--border)'}}>📋 Copy HTML</button>
            </div>
          )}
        </div>
      )}

      {/* ── TAMPER SEAL ───────────────────────────────────────────────────── */}
      {selectedTool === 'tamperseal' && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">🔏</span>
            <div><p className="font-semibold text-sm">Tamper-Evident Seal</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>SHA-256 hash + timestamp — cryptographic proof of integrity</p></div>
          </div>
          <button onClick={() => handleToolAction('tamperseal')} disabled={sealLoading||files.length===0} className="btn-primary w-full" style={{background:'#1c1917'}}>
            {sealLoading ? 'Sealing…' : '🔏 Create Tamper Seal'}
          </button>
          {sealResult && (
            <div className="space-y-2">
              <div className="px-3 py-2.5 rounded-xl text-xs space-y-1" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
                <p><span style={{color:'var(--ink-muted)'}}>File:</span> {sealResult.fileName}</p>
                <p><span style={{color:'var(--ink-muted)'}}>SHA-256:</span> <code className="font-mono text-xs break-all">{sealResult.hash}</code></p>
                <p><span style={{color:'var(--ink-muted)'}}>Sealed at:</span> {new Date(sealResult.timestamp).toLocaleString()}</p>
                <p><span style={{color:'var(--ink-muted)'}}>Size:</span> {(sealResult.fileSize/1024).toFixed(1)} KB</p>
              </div>
              <button onClick={() => {
                const json = JSON.stringify(sealResult,null,2)
                const url = URL.createObjectURL(new Blob([json],{type:'application/json'}))
                const a=document.createElement('a');a.href=url;a.download='seal.json';a.click()
              }} className="btn-primary w-full">⬇ Download Seal Certificate (.json)</button>
              <div className="space-y-2">
                <p className="text-xs font-semibold" style={{color:'var(--ink-muted)'}}>Verify a file against this seal:</p>
                <input type="file" onChange={async e => {
                  if (!e.target.files?.[0]) return
                  const result = await verifySeal(e.target.files[0], sealResult)
                  setSealVerifyResult(result.valid ? '✓ ' + result.reason : '✗ ' + result.reason)
                }} className="text-xs w-full"/>
                {sealVerifyResult && <p className="text-xs font-semibold px-3 py-2 rounded-xl" style={{background: sealVerifyResult.startsWith('✓')?'var(--green-light)':'#fee2e2', color: sealVerifyResult.startsWith('✓')?'#15803d':'#dc2626'}}>{sealVerifyResult}</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── RECIPE LINK ───────────────────────────────────────────────────── */}
      {selectedTool === 'recipe' && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">🔗</span>
            <div><p className="font-semibold text-sm">Shareable Recipe URL</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Encode your operation chain as a shareable link</p></div>
          </div>
          <p className="text-xs" style={{color:'var(--ink-muted)'}}>Select tools above and the sequence will be encoded into a URL your colleague can open to apply the same operations.</p>
          <button onClick={() => {
            const url = encodeRecipe([{ tool: selectedTool || 'compress', params: {} }])
            setRecipeUrl(url)
            navigator.clipboard?.writeText(url).then(() => showStatus('✓ Recipe URL copied to clipboard'))
          }} className="btn-primary w-full" style={{background:'#059669'}}>🔗 Generate & Copy Recipe URL</button>
          {recipeUrl && (
            <div className="px-3 py-2 rounded-xl text-xs font-mono break-all" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
              {recipeUrl}
            </div>
          )}
        </div>
      )}

      {/* ── PREFLIGHT ─────────────────────────────────────────────────────── */}
      {selectedTool === 'preflight' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">🖨</span>
            <div><p className="font-semibold text-sm">Print Preflight (ISO 15930 / PDF/X)</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Check print-readiness before sending to press</p></div>
          </div>
          <button onClick={() => handleToolAction('preflight')} disabled={preflightLoading} className="btn-primary w-full" style={{background:'#dc2626'}}>
            {preflightLoading ? 'Checking…' : '🖨 Run Print Preflight'}
          </button>
          {preflightResult && (
            <div className="space-y-2">
              {preflightResult.checks?.map((c:any) => (
                <div key={c.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
                     style={{background: c.pass?'var(--green-light)':'#fee2e2'}}>
                  <span>{c.pass?'✓':'✗'}</span>
                  <div className="flex-1"><p className="text-xs font-semibold">{c.label}</p>
                    <p className="text-xs" style={{color:'var(--ink-soft)'}}>{c.detail}</p></div>
                </div>
              ))}
              {preflightResult.readyToPrint && <div className="text-center py-2" style={{color:'var(--green)'}}>✓ Print-ready</div>}
            </div>
          )}
        </div>
      )}

      {/* ── MICRO ANNOTATIONS ─────────────────────────────────────────────── */}
      {selectedTool === 'microannot' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">💬</span>
            <div><p className="font-semibold text-sm">Micro-Annotation Threads</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Pin comments to pages — persisted by file hash</p></div>
          </div>
          <div className="flex gap-2">
            <input type="number" min={1} value={annotPage} onChange={e=>setAnnotPage(+e.target.value)}
                   placeholder="Page" className="w-16 text-xs px-2 py-2 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}/>
            <input type="text" value={annotText} onChange={e=>setAnnotText(e.target.value)} placeholder="Add a comment…"
                   className="flex-1 text-xs px-3 py-2 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}
                   onKeyDown={e => { if (e.key==='Enter' && annotText && fileHash) {
                     const newA: MicroAnnotation = { id:Date.now().toString(), pageNum:annotPage, x:0, y:0, text:annotText, author:'Me', timestamp:Date.now(), color:'#f97316' }
                     const updated = [...annotations, newA]
                     setAnnotations(updated); saveAnnotations(fileHash, updated); setAnnotText('')
                   }}}/>
            <button onClick={() => {
              if (!annotText || !fileHash) return
              const newA: MicroAnnotation = { id:Date.now().toString(), pageNum:annotPage, x:0, y:0, text:annotText, author:'Me', timestamp:Date.now(), color:'#f97316' }
              const updated = [...annotations, newA]
              setAnnotations(updated); saveAnnotations(fileHash, updated); setAnnotText('')
            }} className="btn-primary text-xs px-3">+</button>
          </div>
          {annotations.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {annotations.map((a:MicroAnnotation) => (
                <div key={a.id} className="flex items-start gap-2 px-3 py-2 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
                  <div className="flex-1">
                    <p className="text-xs"><span className="font-bold">p{a.pageNum}</span> · <span style={{color:'var(--ink-muted)'}}>{new Date(a.timestamp).toLocaleTimeString()}</span></p>
                    <p className="text-xs mt-0.5">{a.text}</p>
                  </div>
                  <button onClick={() => { const updated=annotations.filter(x=>x.id!==a.id); setAnnotations(updated); if(fileHash) saveAnnotations(fileHash,updated) }}
                          className="text-xs" style={{color:'#dc2626'}}>✕</button>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-center py-3" style={{color:'var(--ink-muted)'}}>No annotations yet — add comments above</p>}
          {annotations.length > 0 && fileHash && (
            <button onClick={() => {
              const report = exportAnnotationReport(annotations, pdfFiles[0]?.name||'document')
              const url = URL.createObjectURL(new Blob([report],{type:'text/plain'}))
              const a=document.createElement('a');a.href=url;a.download='annotations.txt';a.click()
            }} className="btn-ghost w-full text-xs" style={{border:'1px solid var(--border)'}}>⬇ Export Annotation Report</button>
          )}
        </div>
      )}

      {/* ── NORMALISE PAGE SIZES ──────────────────────────────────────────── */}
      {selectedTool === 'normalizesize' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">📐</span>
            <div><p className="font-semibold text-sm">Mixed Page Size Normaliser</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Unify all pages to a single standard size</p></div>
          </div>
          {pageSizes && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              <p className="text-xs font-semibold" style={{color:'var(--ink-muted)'}}>Detected sizes:</p>
              {[...new Set(pageSizes.map((p:any)=>p.label))].map((label:any) => (
                <div key={label} className="flex items-center gap-2 text-xs px-2 py-1 rounded-lg" style={{background:'var(--surface)'}}>
                  <span>📄</span><span>{label}</span>
                  <span style={{color:'var(--ink-muted)'}}>×{pageSizes.filter((p:any)=>p.label===label).length} pages</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => handleToolAction('normalizesize')} className="btn-ghost w-full text-xs" style={{border:'1px solid var(--border)'}}>
            🔍 Detect Page Sizes
          </button>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1" style={{color:'var(--ink-muted)'}}>Target size</label>
              <select value={normalizeTarget} onChange={e=>setNormalizeTarget(e.target.value as any)}
                      className="w-full text-xs px-3 py-2 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
                <option value="a4">A4 (210×297mm)</option>
                <option value="letter">US Letter (8.5×11")</option>
                <option value="a3">A3 (297×420mm)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{color:'var(--ink-muted)'}}>Scaling mode</label>
              <select value={normalizeMode} onChange={e=>setNormalizeMode(e.target.value as any)}
                      className="w-full text-xs px-3 py-2 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
                <option value="fit">Fit (letterbox)</option>
                <option value="fill">Fill (crop)</option>
                <option value="pad">Pad (whitespace)</option>
              </select>
            </div>
          </div>
          <button onClick={() => handleToolAction('normalizesize_apply')} className="btn-primary w-full" style={{background:'#6366f1'}}>
            📐 Normalise All Pages
          </button>
        </div>
      )}

      {/* ── PRESENTATION MODE ─────────────────────────────────────────────── */}
      {selectedTool === 'present' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">🎬</span>
            <div><p className="font-semibold text-sm">Presentation Mode</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Full-screen slideshow with timer and keyboard navigation</p></div>
          </div>
          <button onClick={() => handleToolAction('present')} className="btn-primary w-full" style={{background:'#0d9488'}}>
            🎬 Launch Presentation
          </button>
          {presentActive && presentImages.length > 0 && (
            <div className="fixed inset-0 z-[200] flex flex-col" style={{background:'#000'}}
                 onKeyDown={e => {
                   if (e.key==='ArrowRight'||e.key==='Space') { e.preventDefault(); setPresentPage(p=>Math.min(presentTotal,p+1)); }
                   if (e.key==='ArrowLeft') { e.preventDefault(); setPresentPage(p=>Math.max(1,p-1)); }
                   if (e.key==='Escape') { setPresentActive(false); clearInterval(presentTimerRef.current); }
                 }} tabIndex={0} ref={el => { if(el && presentActive) el.focus() }}>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-4 z-10">
                <span className="text-white text-sm px-3 py-1 rounded-full" style={{background:'rgba(255,255,255,0.15)'}}>
                  {presentPage} / {presentTotal}
                </span>
                <span className="text-white text-sm px-3 py-1 rounded-full" style={{background:'rgba(255,255,255,0.15)'}}>
                  {Math.floor(presentTimer/60)}:{String(presentTimer%60).padStart(2,'0')}
                </span>
                <button onClick={() => { setPresentActive(false); clearInterval(presentTimerRef.current) }}
                        className="text-white text-sm px-3 py-1 rounded-full" style={{background:'rgba(255,255,255,0.15)'}}>
                  ✕ Exit
                </button>
              </div>
              <div className="flex-1 flex items-center justify-center p-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={presentImages[presentPage-1]} alt={`Slide ${presentPage}`}
                     className="max-w-full max-h-full object-contain" style={{userSelect:'none'}}/>
              </div>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3">
                <button onClick={() => setPresentPage(p=>Math.max(1,p-1))} disabled={presentPage===1}
                        className="px-6 py-2 rounded-full text-white font-semibold" style={{background:'rgba(255,255,255,0.2)'}}>←</button>
                <button onClick={() => setPresentPage(p=>Math.min(presentTotal,p+1))} disabled={presentPage===presentTotal}
                        className="px-6 py-2 rounded-full text-white font-semibold" style={{background:'rgba(255,255,255,0.2)'}}>→</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── INK COST ESTIMATOR ────────────────────────────────────────────── */}
      {selectedTool === 'inkestimate' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">💰</span>
            <div><p className="font-semibold text-sm">Ink Coverage Estimator</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Estimates print ink cost and coverage per page</p></div>
          </div>
          <button onClick={() => handleToolAction('inkestimate')} disabled={inkLoading} className="btn-primary w-full">
            {inkLoading ? `Analysing… (${inkProgress?.p||0}/${inkProgress?.t||'?'} pages)` : '💰 Estimate Ink Cost'}
          </button>
          {inkResult && !inkLoading && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[['Total coverage', inkResult.coveragePercent+'%'],['Est. print cost', '$'+inkResult.estimatedCostUSD],['Pages analysed', inkResult.perPage.length],['Reduce ink?', inkResult.canReduce?'Yes → use Grayscale':'No, looks lean']].map(([l,v])=>(
                  <div key={String(l)} className="px-3 py-2 rounded-xl" style={{background:'var(--surface)'}}>
                    <span style={{color:'var(--ink-muted)'}}>{l}: </span><span className="font-semibold">{String(v)}</span>
                  </div>
                ))}
              </div>
              {inkResult.perPage.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1.5" style={{color:'var(--ink-muted)'}}>Per-page coverage:</p>
                  <div className="flex flex-wrap gap-1">
                    {inkResult.perPage.map((v:number,i:number) => (
                      <div key={i} className="text-xs px-2 py-1 rounded-lg" style={{background:`rgba(0,0,0,${v})`, color:v>0.4?'white':'var(--ink)', border:'1px solid var(--border)'}}>
                        p{i+1}: {Math.round(v*100)}%
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {inkResult.canReduce && (
                <button onClick={()=>handleToolAction('grayscale')} className="btn-ghost w-full text-xs" style={{border:'1px solid var(--border)'}}>
                  → Convert to Grayscale to reduce ink
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TIMELINE ──────────────────────────────────────────────────────── */}
      {selectedTool === 'timeline' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">📅</span>
            <div><p className="font-semibold text-sm">Date / Timeline Extractor</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>All dates mentioned in document with context</p></div>
          </div>
          <button onClick={() => handleToolAction('timeline')} disabled={timelineLoading} className="btn-primary w-full" style={{background:'#0891b2'}}>
            {timelineLoading ? 'Extracting…' : '📅 Extract Timeline'}
          </button>
          {timelineEvents && (
            timelineEvents.length === 0
              ? <p className="text-xs text-center py-3" style={{color:'var(--ink-muted)'}}>No dates detected in document</p>
              : <div className="space-y-2 max-h-64 overflow-y-auto">
                  <p className="text-xs" style={{color:'var(--ink-muted)'}}>{timelineEvents.length} dates found</p>
                  {timelineEvents.map((ev:any,i:number) => (
                    <div key={i} className="flex gap-3 px-3 py-2 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
                      <div className="flex-shrink-0 text-xs font-mono font-bold px-2 py-0.5 rounded-lg h-fit" style={{background:'var(--blue-pale)',color:'var(--blue-vivid)'}}>{ev.date}</div>
                      <p className="text-xs" style={{color:'var(--ink-soft)'}}>p{ev.page} · {ev.context.slice(0,80)}…</p>
                    </div>
                  ))}
                </div>
          )}
        </div>
      )}

      {/* ── TONE ANALYSER ─────────────────────────────────────────────────── */}
      {selectedTool === 'toneanalyse' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">🎭</span>
            <div><p className="font-semibold text-sm">Document Tone Analyser</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Sentiment heatmap — positive, negative, formal, aggressive</p></div>
          </div>
          <button onClick={() => handleToolAction('toneanalyse')} disabled={toneLoading} className="btn-primary w-full" style={{background:'#7c3aed'}}>
            {toneLoading ? 'Analysing…' : '🎭 Analyse Tone'}
          </button>
          {toneResult && !toneLoading && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[['Overall sentiment', toneResult.overallSentiment],['Formality', toneResult.formality],['Avg positivity', (toneResult.avgPositivity*100).toFixed(0)+'%'],['Dominant tone', toneResult.dominantTone]].map(([l,v])=>(
                  <div key={String(l)} className="px-3 py-2 rounded-xl" style={{background:'var(--surface)'}}>
                    <span style={{color:'var(--ink-muted)'}}>{l}: </span><span className="font-semibold capitalize">{String(v)}</span>
                  </div>
                ))}
              </div>
              {toneResult.pageScores && toneResult.pageScores.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1.5" style={{color:'var(--ink-muted)'}}>Page sentiment heatmap:</p>
                  <div className="flex flex-wrap gap-1">
                    {toneResult.pageScores.map((s:any,i:number) => (
                      <div key={i} className="text-xs px-2 py-1 rounded-lg cursor-pointer" title={`Page ${i+1}: ${s.sentiment}`}
                           style={{background:s.positivity>0.6?'#dcfce7':s.positivity<0.4?'#fee2e2':'#fef3c7', border:'1px solid var(--border)'}}>
                        p{i+1}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── LANGUAGE DETECT ───────────────────────────────────────────────── */}
      {selectedTool === 'langdetect' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">🌐</span>
            <div><p className="font-semibold text-sm">Language Detector</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Trigram-based language detection across 20+ languages</p></div>
          </div>
          <button onClick={() => handleToolAction('langdetect')} disabled={langLoading} className="btn-primary w-full" style={{background:'#059669'}}>
            {langLoading ? 'Detecting…' : '🌐 Detect Language'}
          </button>
          {langResult && !langLoading && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{background:'var(--green-light)'}}>
                <span className="text-3xl">{langResult.flag||'🌐'}</span>
                <div><p className="font-bold text-sm">{langResult.language}</p>
                  <p className="text-xs" style={{color:'var(--ink-muted)'}}>{Math.round((langResult.confidence||0)*100)}% confidence · {langResult.script}</p></div>
              </div>
              {langResult.altMatches?.length > 0 && (
                <div className="text-xs space-y-1">
                  <p style={{color:'var(--ink-muted)'}}>Other possibilities:</p>
                  {langResult.altMatches.slice(0,3).map((m:any,i:number) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{background:'var(--surface)'}}>
                      <span>{m.flag||'🌐'}</span><span>{m.language}</span>
                      <span className="ml-auto" style={{color:'var(--ink-muted)'}}>{Math.round(m.confidence*100)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── CITATIONS ─────────────────────────────────────────────────────── */}
      {selectedTool === 'citations' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">📚</span>
            <div><p className="font-semibold text-sm">Citation & Reference Extractor</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>DOIs, URLs, author-year, numbered references</p></div>
          </div>
          <button onClick={() => handleToolAction('citations')} disabled={citationLoading} className="btn-primary w-full" style={{background:'#b45309'}}>
            {citationLoading ? 'Extracting…' : '📚 Extract Citations'}
          </button>
          {citationList && (
            citationList.length === 0
              ? <p className="text-xs text-center py-3" style={{color:'var(--ink-muted)'}}>No citations detected</p>
              : <div className="space-y-2 max-h-64 overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <p className="text-xs" style={{color:'var(--ink-muted)'}}>{citationList.length} reference{citationList.length!==1?'s':''} found</p>
                    <button onClick={() => {
                      const txt = citationList.map((c:any)=>`[${c.type}] p${c.page}: ${c.raw}`).join('\n')
                      navigator.clipboard?.writeText(txt).then(()=>showStatus('✓ References copied'))
                    }} className="text-xs px-2 py-0.5 rounded-lg" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>📋 Copy all</button>
                  </div>
                  {citationList.map((c:any,i:number) => (
                    <div key={i} className="px-3 py-2 rounded-xl text-xs" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="px-1.5 py-0.5 rounded font-semibold text-white text-xs" style={{background:'#b45309'}}>{c.type}</span>
                        <span style={{color:'var(--ink-muted)'}}>p{c.page}</span>
                      </div>
                      <p className="font-mono break-all">{c.raw?.slice(0,100)}</p>
                      {c.doi && <a href={`https://doi.org/${c.doi}`} target="_blank" rel="noreferrer" className="text-xs" style={{color:'var(--blue-vivid)'}}>→ Open DOI</a>}
                    </div>
                  ))}
                </div>
          )}
        </div>
      )}

      {/* ── FONT INSPECTOR ────────────────────────────────────────────────── */}
      {selectedTool === 'fontinspect' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">Aa</span>
            <div><p className="font-semibold text-sm">Font Inspector</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Embedded fonts, types, and subset status</p></div>
          </div>
          <button onClick={() => handleToolAction('fontinspect')} disabled={fontLoading} className="btn-primary w-full" style={{background:'#4338ca'}}>
            {fontLoading ? 'Inspecting…' : 'Aa Inspect Fonts'}
          </button>
          {fontList && (
            fontList.length === 0
              ? <p className="text-xs text-center py-3" style={{color:'var(--ink-muted)'}}>No fonts found in document</p>
              : <div className="space-y-2 max-h-64 overflow-y-auto">
                  <p className="text-xs" style={{color:'var(--ink-muted)'}}>{fontList.length} font{fontList.length!==1?'s':''} detected</p>
                  {fontList.map((f:any,i:number) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{background:'var(--surface)',border:`1px solid ${f.embedded?'var(--border)':'#f59e0b'}`}}>
                      <div className="flex-1">
                        <p className="text-xs font-semibold font-mono">{f.name}</p>
                        <p className="text-xs" style={{color:'var(--ink-muted)'}}>{f.type} · {f.subtype}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                            style={{background:f.embedded?'var(--green-light)':'#fef3c7', color:f.embedded?'#15803d':'#b45309'}}>
                        {f.embedded?'Embedded':'Not embedded ⚠️'}
                      </span>
                    </div>
                  ))}
                  {fontList.some((f:any)=>!f.embedded) && (
                    <div className="px-3 py-2 rounded-xl text-xs" style={{background:'#fef3c7',border:'1px solid #f59e0b'}}>
                      ⚠️ Unembedded fonts may not display correctly on other systems. Use Flatten to rasterise.
                    </div>
                  )}
                </div>
          )}
        </div>
      )}

      {/* ── AUTO-CROP ─────────────────────────────────────────────────────── */}
      {selectedTool === 'autocrop' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">🎯</span>
            <div><p className="font-semibold text-sm">Smart Auto-Crop</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Detects content bounds and removes whitespace automatically</p></div>
          </div>
          <button onClick={() => handleToolAction('autocrop')} disabled={autoCropLoading} className="btn-primary w-full" style={{background:'#0891b2'}}>
            {autoCropLoading ? 'Detecting bounds…' : '🎯 Detect Content Bounds'}
          </button>
          {autoCropPreview && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[['Top margin', autoCropPreview.top+'pt'],['Bottom margin', autoCropPreview.bottom+'pt'],['Left margin', autoCropPreview.left+'pt'],['Right margin', autoCropPreview.right+'pt']].map(([l,v])=>(
                  <div key={String(l)} className="px-3 py-2 rounded-xl" style={{background:'var(--surface)'}}>
                    <span style={{color:'var(--ink-muted)'}}>{l}: </span><span className="font-semibold">{String(v)}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => handleToolAction('autocrop_apply')} className="btn-primary w-full" style={{background:'#059669'}}>
                ✂ Apply Auto-Crop
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── PDF → JSON ────────────────────────────────────────────────────── */}
      {selectedTool === 'tojson' && files.length > 0 && hasPDFs && (
        <div className="card animate-scale-in space-y-4">
          <div className="flex items-center gap-3"><span className="text-xl">{'{}'}</span>
            <div><p className="font-semibold text-sm">PDF to Structured JSON</p><p className="text-xs" style={{color:'var(--ink-muted)'}}>Export text layer with coordinates as JSON for developers</p></div>
          </div>
          <button onClick={() => handleToolAction('tojson')} className="btn-primary w-full">
            {'{}'} Export as JSON
          </button>
          {jsonResult && (
            <div className="max-h-40 overflow-y-auto text-xs font-mono px-3 py-2 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
              {jsonResult.slice(0,500)}…
            </div>
          )}
        </div>
      )}


      {/* ── Persistent settings save button ────────────────────────────── */}
      {files.length > 0 && selectedTool && ['compress','watermark','pagenum'].includes(selectedTool) && (
        <div className="flex justify-end animate-fade-up">
          <button onClick={saveSettings} className="text-xs px-3 py-1.5 rounded-xl font-semibold transition-all"
                  style={{background:'var(--surface-2)',border:'1px solid var(--border)',color:'var(--ink-soft)'}}>
            💾 Save as defaults
          </button>
        </div>
      )}

      {/* ── Session History ──────────────────────────────────────────────── */}
      {sessionLog.length > 0 && (
        <div className="card" role="log" aria-label="Processing history">
          <div className="flex items-center justify-between mb-3">
            <p className="section-label">Session history</p>
            <button onClick={() => setSessionLog([])} className="text-xs"
                    style={{color:'var(--ink-muted)'}} aria-label="Clear session history">
              Clear
            </button>
          </div>
          <div className="space-y-1.5">
            {sessionLog.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 border-b text-xs"
                   style={{borderColor:'var(--border)'}}>
                <span style={{color:'var(--green)'}}>✓</span>
                <span className="flex-1 font-medium" style={{color:'var(--ink)'}}>{entry.tool}</span>
                {entry.size && <span className="badge badge-green">{entry.size}</span>}
                <span style={{color:'var(--ink-muted)'}}>{entry.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Mobile bottom sheet ───────────────────────────────────────────── */}
      {showMobileSheet && (
        <div className="fixed inset-0 z-50 sm:hidden" style={{background:'rgba(13,27,62,0.6)',backdropFilter:'blur(6px)'}}
             onClick={() => setShowMobileSheet(false)}>
          <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl overflow-hidden animate-fade-up"
               style={{background:'var(--card-bg)',maxHeight:'80vh',display:'flex',flexDirection:'column'}}
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{borderColor:'var(--border)'}}>
              <p className="font-bold text-base" style={{fontFamily:'Syne,sans-serif'}}>Choose a tool</p>
              <button onClick={() => setShowMobileSheet(false)} className="btn-icon w-8 h-8">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1">
              {TOOLS.map(tool => {
                const disabled = files.length === 0 || (tool.requiresPDF && !hasPDFs)
                return (
                  <button key={tool.id} disabled={disabled}
                          onClick={() => { if (!disabled) { handleToolAction(tool.id); setShowMobileSheet(false) } }}
                          className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all text-left"
                          style={{background: selectedTool===tool.id ? tool.color : 'transparent', opacity: disabled ? 0.4 : 1}}
                          onMouseOver={e => { if (!disabled && selectedTool!==tool.id) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
                          onMouseOut={e => { if (selectedTool!==tool.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
                         style={{background: selectedTool===tool.id ? 'rgba(255,255,255,0.2)' : tool.colorLight, color: selectedTool===tool.id ? 'white' : tool.color}}>
                      {tool.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{color: selectedTool===tool.id ? 'white' : 'var(--ink)'}}>{tool.fullName}</p>
                      <p className="text-xs" style={{color: selectedTool===tool.id ? 'rgba(255,255,255,0.7)' : 'var(--ink-muted)'}}>{tool.desc}</p>
                    </div>
                    {selectedTool===tool.id && <span className="text-white text-sm">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
