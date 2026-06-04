'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// Browsable command reference — groups every voice command by the
// category a user would look under. The phrase shown is a natural
// example; many more synonyms work (see keyword patterns below).
const COMMAND_REFERENCE: { group: string; emoji: string; items: { say: string; does: string }[] }[] = [
  {
    group: 'Core PDF operations', emoji: '⊕',
    items: [
      { say: '"merge" / "join" / "combine these"', does: 'Combine multiple PDFs into one' },
      { say: '"split" / "separate" / "extract pages"', does: 'Split a PDF into parts' },
      { say: '"split every 3 pages"', does: 'Split into fixed-size chunks' },
      { say: '"compress" / "make it smaller" / "shrink"', does: 'Reduce file size' },
      { say: '"rotate" / "turn the pages" / "fix orientation"', does: 'Rotate pages' },
      { say: '"crop" / "trim margins"', does: 'Crop or trim page edges' },
      { say: '"auto crop"', does: 'Auto-detect and trim margins' },
      { say: '"rearrange" / "reorder pages"', does: 'Reorder pages by dragging' },
      { say: '"insert page" / "add blank page"', does: 'Insert or duplicate a page' },
    ],
  },
  {
    group: 'Conversion', emoji: '⤓',
    items: [
      { say: '"export" / "to image" / "to PNG"', does: 'PDF to image (PNG/JPG)' },
      { say: '"to PDF" / "convert to PDF"', does: 'Image or document to PDF' },
      { say: '"to excel" / "spreadsheet" / "CSV"', does: 'Extract tables to Excel/CSV' },
      { say: '"to powerpoint" / "to slides"', does: 'PDF to PowerPoint' },
      { say: '"to text" / "extract text" / "to markdown"', does: 'Export readable text' },
      { say: '"OCR" / "scan to text" / "make searchable"', does: 'Recognise text in scanned PDFs' },
      { say: '"to JSON"', does: 'Structured JSON export' },
    ],
  },
  {
    group: 'Annotation & marking', emoji: '✐',
    items: [
      { say: '"annotate" / "add text" / "draw"', does: 'Add annotations & marks' },
      { say: '"micro annotations"', does: 'Precise pinpoint comments' },
      { say: '"sign" / "signature" / "e-sign"', does: 'Sign the document' },
      { say: '"watermark" / "stamp confidential"', does: 'Add a watermark' },
      { say: '"redact" / "black out" / "censor"', does: 'Permanently black out content' },
      { say: '"add image" / "add logo"', does: 'Place an image on the page' },
      { say: '"page numbers"', does: 'Auto-number pages' },
      { say: '"header" / "footer"', does: 'Add header/footer text' },
      { say: '"QR code"', does: 'Stamp a QR code' },
    ],
  },
  {
    group: 'Editing & document tools', emoji: '⊟',
    items: [
      { say: '"metadata" / "properties" / "edit info"', does: 'Edit title, author, etc.' },
      { say: '"flatten"', does: 'Rasterize / flatten the PDF' },
      { say: '"grayscale" / "black and white"', does: 'Remove colour' },
      { say: '"bookmarks"', does: 'Edit the bookmark outline' },
      { say: '"normalise sizes"', does: 'Make all pages one size' },
      { say: '"encrypt" / "protect" / "lock"', does: 'AES-256 encrypt the file' },
      { say: '"unlock" / "remove password"', does: 'Remove a known password' },
      { say: '"AES encrypt" / "strong encrypt"', does: 'AES-256 encrypt' },
      { say: '"rename"', does: 'Rename the output file' },
    ],
  },
  {
    group: 'Navigation & app control', emoji: '▶',
    items: [
      { say: '"next page" / "previous page"', does: 'Move between pages' },
      { say: '"first page" / "last page"', does: 'Jump to start/end' },
      { say: '"zoom in" / "zoom out"', does: 'Adjust zoom' },
      { say: '"select all" / "deselect all"', does: 'Select/clear all pages' },
      { say: '"how many pages"', does: 'Read out the page count' },
      { say: '"undo"', does: 'Undo the last action' },
      { say: '"download" / "save the file"', does: 'Download the result' },
      { say: '"dark mode" / "light mode"', does: 'Switch theme' },
      { say: '"start over" / "reset all"', does: 'Clear everything' },
      { say: '"help"', does: 'Show help' },
      { say: '"cancel" / "stop"', does: 'Cancel current command' },
    ],
  },
]

interface VoiceCommandProps {
  files: File[]
  onCommand: (command: VoiceCommandType) => void
  isProcessing: boolean
}

export type VoiceCommandType = {
  action: 'merge' | 'split' | 'compress' | 'edit' | 'convert' | 'toPDF'
        | 'rotate' | 'watermark' | 'password' | 'pagenum' | 'extractimgs' | 'flatten'
        | 'metadata' | 'batch' | 'sign' | 'addimage' | 'toexcel' | 'rearrange'
        | 'redact' | 'crop' | 'totext' | 'qrcode'
        | 'unlock' | 'headfoot' | 'grayscale' | 'insertpage' | 'splitn' | 'topptx' | 'hashcheck' | 'ocr'
        | 'aesencrypt'
        | 'startover' | 'rename'
        | 'readability' | 'pdfcompare' | 'a11ycheck' | 'flashcards' | 'piiscan'
        | 'bookmarks' | 'autocrop' | 'tojson' | 'fontinspect' | 'spellcheck'
        | 'batchrules' | 'macro' | 'semanticgroup' | 'podcastscript' | 'ankideck'
        | 'tilePrint' | 'emailhtml' | 'tamperseal' | 'recipe' | 'preflight'
        | 'microannot' | 'normalizesize' | 'present' | 'inkestimate' | 'timeline'
        | 'toneanalyse' | 'langdetect' | 'citations' | 'fontinspect'
        | 'download' | 'upload'
        // ── New voice actions (v1.0 launch) ───────────────────────────────
        | 'darkmode' | 'lightmode' | 'toggletheme'
        | 'help' | 'shortcuts'
        | 'undo'
        | 'nextpage' | 'prevpage' | 'firstpage' | 'lastpage'
        | 'selectall' | 'deselectall'
        | 'zoomin' | 'zoomout'
        | 'pagecount'
        | 'install'
        | 'cancel'
        | 'unknown'
  format?: 'png' | 'jpg' | 'webp' | 'word'
  /** Page number for 'gotopage' style commands; -1 means none. */
  pageNumber?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPREHENSIVE SYNONYM MAP
// Every tool has its canonical keywords PLUS every natural language synonym,
// phrase, and accent-variant a user might say. Designed to be maximally
// permissive so that intent is captured regardless of phrasing.
// ─────────────────────────────────────────────────────────────────────────────
const COMMAND_MAP: Array<{
  action: VoiceCommandType['action']
  label: string
  emoji: string
  keywords: RegExp
  format?: 'png' | 'jpg' | 'webp' | 'word'
}> = [
  // ── DOWNLOAD / SAVE ──────────────────────────────────────────────────────
  {
    action: 'download', label: 'Download file', emoji: '⬇️',
    keywords: /\b(download|save|export( the)? file|get( the)? file|grab( the)? file|fetch( the)? file|store|keep|preserve|dawnload|downlod|downlad|safe the|daonload|get it|take it|retrieve)\b/i,
  },

  // ── MERGE ─────────────────────────────────────────────────────────────────
  // Synonyms: join, combine, unite, glue, attach, append, add, put together,
  // stitch, link, bundle, group, connect, assemble, aggregate, fuse, blend,
  // pool, consolidate, incorporate, gather, collect, pile, stack
  {
    action: 'merge', label: 'Merge PDFs', emoji: '⊕',
    keywords: /\b(merge|merj|marge|merg|join|joine|joyn|combine|combain|combin|unite|unify|unification|glue|attach|append|add( together| files| documents| pdfs)?|put together|stitch|link|bundle|group|connect|assemble|aggregate|fuse|blend|pool|consolidate|incorporate|gather|collect|pile|stack|bring together|tie together|lump together)\b/i,
  },

  // ── SPLIT ─────────────────────────────────────────────────────────────────
  // Synonyms: separate, divide, cut, break, extract pages, pull apart,
  // detach, isolate, partition, segment, section, slice, chop, carve, sever
  {
    action: 'split', label: 'Split PDF', emoji: '✂',
    keywords: /\b(split|splet|spleet|spliit|separate|separat|separeit|separrate|divide|division|cut( up| apart)?|break( up| apart)?|extract pages?|pull apart|detach|isolate|partition|segment|section|slice|chop|carve|sever|take out pages?|remove pages?|get page|pull out)\b/i,
  },

  // ── COMPRESS ─────────────────────────────────────────────────────────────
  // Synonyms: reduce, shrink, squash, squeeze, minimise, minimise size,
  // make smaller, cut size, optimise, optimize, deflate, compact, downsize,
  // lighten, slim down, trim size
  {
    action: 'compress', label: 'Compress PDF', emoji: '◎',
    keywords: /\b(compress|compres|comprees|kompres|kompress|reduce( size| file)?|shrink|shreenk|shreynk|squash|squeeze|squish|minimise|minimize|make( it)? smaller|cut( the)? size|optimis[e]|optimiz[e]|deflate|compact|downsize|lighten|slim( down)?|trim( the)? size|decrease size|lower size|save space|shrink file|pack|zip)\b/i,
  },

  // ── ROTATE ───────────────────────────────────────────────────────────────
  // Synonyms: turn, flip, spin, tilt, orient, orientate, fix orientation,
  // straighten, right-side up, landscape, portrait
  {
    action: 'rotate', label: 'Rotate pages', emoji: '↻',
    keywords: /\b(rotat|roteit|rootate|rowtat|turn( the)? pages?|flip( the)? pages?|spin( the)? pages?|tilt|orient|orientat|fix orientation|straighten|right.?side up|landscape|portrait mode|turn around|turn it)\b/i,
  },

  // ── WATERMARK ────────────────────────────────────────────────────────────
  // Synonyms: stamp, mark, brand, label, overlay, imprint, inscribe,
  // tag, badge, seal, logo overlay, add text overlay, confidential mark
  {
    action: 'watermark', label: 'Add watermark', emoji: '💧',
    keywords: /\b(watermark|wotermark|watermaark|wattermark|stamp|mark( as)?|brand|label|overlay|imprint|inscribe|tag( the)?|badge|seal|logo overlay|text overlay|confidential( mark)?|add( a)? mark|draft( stamp)?|classified)\b/i,
  },

  // ── SIGN ─────────────────────────────────────────────────────────────────
  // Synonyms: signature, autograph, e-sign, digitally sign, put name,
  // write name, initial, countersign, authenticate, endorse, approve,
  // sign off, ink, execute (legal)
  {
    action: 'sign', label: 'Sign document', emoji: '✍️',
    keywords: /\b(sign|sain|sine|signature|signachur|signichar|signachar|autograph|e.?sign|esign|digitally sign|put( my)? name|write( my)? name|initial|countersign|authenticate|endorse|approve|sign off|ink( it)?|execute|put signature|add signature|legally binding)\b/i,
  },

  // ── ADD IMAGE ────────────────────────────────────────────────────────────
  // Synonyms: insert image, add logo, add photo, place picture,
  // embed image, put image, add graphic, insert graphic, add picture,
  // attach photo, overlay image
  {
    action: 'addimage', label: 'Add image to PDF', emoji: '🖼️',
    keywords: /\b(add image|insert image|add logo|add photo|place (picture|image|photo)|embed image|put image|add graphic|insert graphic|add picture|attach photo|overlay image|put (a )?(photo|picture|logo|graphic)|insert (a )?(photo|picture|logo|graphic|image))\b/i,
  },

  // ── PDF TO EXCEL / CSV ──────────────────────────────────────────────────
  // Synonyms: extract table, get data, spreadsheet, export data,
  // to csv, table data, data extraction, convert to spreadsheet
  {
    action: 'toexcel', label: 'PDF to Excel/CSV', emoji: '📊',
    keywords: /\b(excel|eksell|excell|excal|csv|spreadsheet|spredsheet|table( data)?|to excel|extract table|get data|export data|data extraction|convert to spreadsheet|to google sheets?|tabular|rows and columns)\b/i,
  },

  // ── REARRANGE ────────────────────────────────────────────────────────────
  // Synonyms: reorder, reorganize, sort pages, move pages, shuffle,
  // rearrange order, change order, swap pages, arrange
  {
    action: 'rearrange', label: 'Rearrange pages', emoji: '⇅',
    keywords: /\b(rearrange|rearange|rearanje|reorder|reorda|reorganize|reorganise|sort pages?|move pages?|shuffle( pages?)?|change( the)? order|swap pages?|arrange( pages?)?|drag pages?|page order)\b/i,
  },

  // ── BATCH ────────────────────────────────────────────────────────────────
  // Synonyms: bulk, all files, process all, multiple files, en masse,
  // wholesale, all at once, mass process, do all
  {
    action: 'batch', label: 'Batch process', emoji: '📦',
    keywords: /\b(batch|bulk|all files?|process all|multiple files?|many files?|en masse|wholesale|all at once|mass process|do all|process (them |the )?all|bulk process|automate)\b/i,
  },

  // ── REDACT ───────────────────────────────────────────────────────────────
  // Synonyms: black out, hide, censor, obscure, mask, cover, remove text,
  // delete text, anonymise, anonymize, blank out, suppress, conceal
  {
    action: 'redact', label: 'Redact content', emoji: '⬛',
    keywords: /\b(redact|black out|blackout|hide( text| content)?|censor|obscure|mask( out)?|cover( up)?|remove text|delete text|anonymis[e]|anonymiz[e]|blank out|suppress|conceal|scrub|cross out|block out)\b/i,
  },

  // ── CROP ─────────────────────────────────────────────────────────────────
  // Synonyms: trim, clip, cut margins, remove margins, resize page,
  // trim whitespace, narrow, frame, boundary
  {
    action: 'crop', label: 'Crop pages', emoji: '✂️',
    keywords: /\b(crop|trim( margins?)?|clip|cut margins?|remove margins?|resize page|trim whitespace|narrow|frame the page|page boundary|shrink margins?|adjust margins?|cut (the )?(border|edge|margin|whitespace))\b/i,
  },

  // ── TO TEXT / MARKDOWN ──────────────────────────────────────────────────
  // Synonyms: extract text, get text, copy text, plain text, to markdown,
  // text version, readable format, export text, text only
  {
    action: 'totext', label: 'Export as Text', emoji: '📝',
    keywords: /\b(to text|extract text|get text|copy text|plain text|to markdown|text version|readable format|export text|text only|text file|as text|convert to text|to txt|to md|text export|pull text)\b/i,
  },

  // ── OCR ──────────────────────────────────────────────────────────────────
  // Synonyms: optical character recognition, scan to text, recognise text,
  // make searchable, read the scan, digitise, image to text, extract from scan
  {
    action: 'ocr', label: 'OCR — Make Searchable', emoji: '🔎',
    keywords: /\b(ocr|o c r|optical character recognition|optical recognition|scan to text|scan text|recogni[sz]e text|text recognition|make( it)? searchable|searchable pdf|read( the)? scan|digiti[sz]e|image to text|extract( text)? from scan|scanned( document)? to text|convert scan)\b/i,
  },

  // ── QR CODE ──────────────────────────────────────────────────────────────
  // Synonyms: add QR, insert QR, generate QR, QR stamp, barcode,
  // add link, scannable, QR image
  {
    action: 'qrcode', label: 'Add QR code', emoji: '⬛',
    keywords: /\b(qr code?|qrcode|add qr|insert qr|generate qr|qr stamp|barcode|bar code|add link|scannable|qr image|add (a )?qr)\b/i,
  },

  // ── METADATA ─────────────────────────────────────────────────────────────
  // Synonyms: properties, document info, title, author, edit info,
  // document properties, file info, tags, attributes
  {
    action: 'metadata', label: 'Edit metadata', emoji: '🏷',
    keywords: /\b(metadata|meta data|metadat|properties|document info|title|author|edit info|document properties|file info|tags|attributes|subject|keywords|creator|producer)\b/i,
  },

  // ── PASSWORD ─────────────────────────────────────────────────────────────
  // ── (Password tool removed — use AES-256 for real encryption) ────────────

  // ── UNLOCK / REMOVE PASSWORD ─────────────────────────────────────────────
  {
    action: 'unlock', label: 'Remove password', emoji: '🔓',
    keywords: /(unlock|remove password|unprotect|decrypt|open locked|strip password|clear password|unsecure|un-protect|remove encryption|unlock pdf)/i,
  },

  // ── HEADER & FOOTER ───────────────────────────────────────────────────────
  {
    action: 'headfoot', label: 'Add header/footer', emoji: '📑',
    keywords: /(header|footer|head(er)?( and | & )?foot(er)?|add header|add footer|top text|bottom text|running head|running footer|stamp top|stamp bottom)/i,
  },

  // ── GRAYSCALE ────────────────────────────────────────────────────────────
  {
    action: 'grayscale', label: 'Convert to grayscale', emoji: '⬜',
    keywords: /(gra(y|e)scale|grey ?scale|black and white|black & white|remove colou?r|desaturate|monochrome|b&w|b and w|make (it )?grey|make (it )?gray|no colou?r)/i,
  },

  // ── INSERT PAGE ───────────────────────────────────────────────────────────
  {
    action: 'insertpage', label: 'Insert page', emoji: '➕',
    keywords: /(insert page|add (a |blank )?page|duplicate page|copy page|add blank|new page|empty page|insert blank|add empty page|append page)/i,
  },

  // ── SPLIT BY N ────────────────────────────────────────────────────────────
  {
    action: 'splitn', label: 'Split every N pages', emoji: '📄',
    keywords: /(split (every|by|into) \d* ?pages?|split (in )?chunks?|split equally|equal split|divide equally|chunk (the )?pdf|split (by|every) n)/i,
  },

  // ── PDF TO POWERPOINT ─────────────────────────────────────────────────────
  {
    action: 'topptx', label: 'PDF to PowerPoint', emoji: '📊',
    keywords: /(powerpoint|power point|pptx|to (pptx|slides?|presentation)|pdf to slides?|pdf to pptx|make slides?|convert to presentation|export (as |to )?slides?)/i,
  },

  // ── FILE HASH / INTEGRITY ─────────────────────────────────────────────────
  {
    action: 'hashcheck', label: 'File integrity hash', emoji: '🔑',
    keywords: /(hash|sha.?256|sha256|file integrity|check integrity|verify file|checksum|fingerprint|file hash|digest|verify (the )?file)/i,
  },

  // AES-256 ENCRYPT (also catches password/protect/lock/secure — the real
  // encryption tool, since there is no separate password feature)
  {
    action: 'aesencrypt' as any, label: 'Encrypt (AES-256)', emoji: '🛡',
    keywords: /\b(aes|aes.?256|true encrypt|strong encrypt|military encrypt|encrypt( the)?( file)?|256.?bit|advanced encrypt|password|pasword|passowrd|protect|lock( the)?|secure|restrict|add password|make private|access control|privati[sz]e|guard)\b/i,
  },

  // START OVER
  {
    action: 'startover' as any, label: 'Start over', emoji: '↺',
    keywords: /(start over|start again|restart|reset all|clear all|new document|begin again|fresh start|start fresh|clear everything)/i,
  },

  // RENAME OUTPUT
  {
    action: 'rename' as any, label: 'Rename output file', emoji: '✎',
    keywords: /(rename|change the name|rename the file|rename output|change filename)/i,
  },
  // READABILITY
  { action: 'readability' as any, label: 'Readability Score', emoji: '📖',
    keywords: /(readability|reading level|flesch|reading score|reading grade|how readable|text complexity|grade level|reading ease)/i },

  // PDF COMPARE
  { action: 'pdfcompare' as any, label: 'Compare Two PDFs', emoji: '⚖️',
    keywords: /(compare|diff|compare pdfs|find differences|what changed|document diff|pdf diff|compare documents|versus|vs pdf)/i },

  // ACCESSIBILITY
  { action: 'a11ycheck' as any, label: 'Accessibility Check', emoji: '♿',
    keywords: /(accessibility|accessible|wcag|screen reader|a11y|pdf ua|aria|alt text check|disability|accessible pdf)/i },

  // FLASHCARDS
  { action: 'flashcards' as any, label: 'Generate Flashcards', emoji: '🃏',
    keywords: /(flashcards|flash cards|study cards|study mode|quiz cards|revision cards|make cards|flip cards)/i },

  // PII SCAN
  { action: 'piiscan' as any, label: 'Scan for Sensitive Data', emoji: '🕵️',
    keywords: /(pii|sensitive data|personal data|scan for data|find emails|credit card scan|private info|data leak|sensitive information|privacy scan)/i },

  // BOOKMARKS
  { action: 'bookmarks' as any, label: 'PDF Bookmarks / TOC', emoji: '🔖',
    keywords: /(bookmarks|table of contents|toc|add bookmark|pdf outline|navigation|contents page|chapter links)/i },

  // SMART AUTO-CROP
  { action: 'autocrop' as any, label: 'Smart Auto-Crop', emoji: '🎯',
    keywords: /(auto crop|autocrop|auto.?crop|remove whitespace|smart crop|detect margins|trim whitespace|auto trim|content bounds)/i },

  // PDF TO JSON
  { action: 'tojson' as any, label: 'PDF to JSON', emoji: '{}',
    keywords: /(to json|json export|export json|structured data|pdf to json|developer export|json format|api format)/i },

  // FONT INSPECTOR
  { action: 'fontinspect' as any, label: 'Font Inspector', emoji: 'Aa',
    keywords: /(fonts|font inspector|inspect fonts|embedded fonts|font check|font list|typeface|font names|font types)/i },

  // SPELL CHECK
  { action: 'spellcheck' as any, label: 'Spell Check', emoji: '✓',
    keywords: /(spell check|spellcheck|spelling|grammar|check spelling|spell errors|typos|misspellings|double words)/i },

  // BATCH RULES
  { action: 'batchrules' as any, label: 'Batch Rules', emoji: '⚙️',
    keywords: /(batch rules|rules engine|automation|if then|conditional|auto process|workflow rules|batch automation)/i },

  // MACRO
  { action: 'macro' as any, label: 'Record Macro', emoji: '⏺',
    keywords: /(macro|record macro|record steps|replay|record actions|automate steps|sequence|workflow macro|replay macro)/i },

  // SEMANTIC GROUPING
  { action: 'semanticgroup' as any, label: 'Group Pages by Topic', emoji: '🧩',
    keywords: /(group pages|semantic group|topics|cluster pages|page groups|topic detection|group by topic|auto group)/i },

  // PODCAST SCRIPT
  { action: 'podcastscript' as any, label: 'PDF to Podcast Script', emoji: '🎙',
    keywords: /(podcast script|read aloud|spoken word|podcast|voice script|narration script|audio script|read out loud)/i },

  // ANKI DECK
  { action: 'ankideck' as any, label: 'PDF to Anki Deck', emoji: '🧠',
    keywords: /(anki|anki deck|flashcard deck|spaced repetition|study deck|anki cards|export anki|memory cards)/i },

  // POSTER/TILE PRINT
  { action: 'tilePrint' as any, label: 'Poster Tile Print', emoji: '🖼',
    keywords: /(poster print|tile print|tiling|large format|poster|multi.?sheet|tile pdf|poster layout|big print)/i },

  // EMAIL HTML
  { action: 'emailhtml' as any, label: 'PDF to Email HTML', emoji: '✉️',
    keywords: /(email html|html email|email export|newsletter html|html export|email format|to html|email ready)/i },

  // TAMPER SEAL
  { action: 'tamperseal' as any, label: 'Tamper-Evident Seal', emoji: '🔏',
    keywords: /(tamper seal|tamper.?proof|seal|cryptographic proof|integrity seal|document seal|verify authenticity|notarise|notarize)/i },

  // RECIPE LINK
  { action: 'recipe' as any, label: 'Shareable Recipe', emoji: '🔗',
    keywords: /(recipe|share link|shareable|operation chain|share recipe|workflow link|share workflow|recipe url)/i },

  // PREFLIGHT
  { action: 'preflight' as any, label: 'Print Preflight', emoji: '🖨',
    keywords: /(preflight|print ready|print check|press ready|pdf x|iso 15930|print quality|bleed marks|cmyk check)/i },

  // MICRO ANNOTATIONS
  { action: 'microannot' as any, label: 'Micro Annotations', emoji: '💬',
    keywords: /(annotate|annotations|comments|add comment|pin comment|sticky note|comment thread|page comment|review)/i },

  // NORMALISE PAGE SIZES
  { action: 'normalizesize' as any, label: 'Normalise Page Sizes', emoji: '📐',
    keywords: /(normalise|normalize|page size|mixed pages|unify pages|same size|standard size|fix page size|page dimensions)/i },

  // PRESENTATION MODE
  { action: 'present' as any, label: 'Presentation Mode', emoji: '🎬',
    keywords: /(present|slideshow|presentation mode|full.?screen|present pdf|slide show|screen mode|keynote mode)/i },

  // INK COST
  { action: 'inkestimate' as any, label: 'Ink Cost Estimator', emoji: '💰',
    keywords: /(ink cost|ink estimate|print cost|ink coverage|printing cost|how much ink|toner cost|ink usage)/i },

  // TIMELINE
  { action: 'timeline' as any, label: 'Timeline Extractor', emoji: '📅',
    keywords: /(timeline|dates|extract dates|chronology|date finder|when|all dates|date list)/i },

  // TONE ANALYSER
  { action: 'toneanalyse' as any, label: 'Document Tone', emoji: '🎭',
    keywords: /(tone|sentiment|tone analysis|mood|document tone|positive negative|emotional tone|sentiment analysis)/i },

  // LANGUAGE DETECT
  { action: 'langdetect' as any, label: 'Language Detector', emoji: '🌐',
    keywords: /(language|detect language|what language|identify language|translation language|language check|lang detect)/i },

  // CITATIONS
  { action: 'citations' as any, label: 'Citation Extractor', emoji: '📚',
    keywords: /(citations|references|bibliography|extract references|doi|academic references|footnotes|cite|bibtex)/i },

  // ── PAGE NUMBERS ─────────────────────────────────────────────────────────
  // Synonyms: number pages, numbering, paginate, add numbers, folio,
  // auto number, sequential numbers, index pages
  {
    action: 'pagenum', label: 'Add page numbers', emoji: '🔢',
    keywords: /\b(page numbers?|pyj numbers?|add numbers?|number( the)? pages?|numbering|pagination|paginate|folio|auto number|sequential numbers?|index pages?|number them|page count)\b/i,
  },

  // ── EXTRACT IMAGES ───────────────────────────────────────────────────────
  // Synonyms: pull images, get images, save images, export images,
  // grab images, take out images, images from pdf, retrieve images, picture extraction
  {
    action: 'extractimgs', label: 'Extract images', emoji: '🖼',
    keywords: /\b(extract images?|ekstrakt images?|estract images?|pull images?|get images?|save images?|export images?|grab images?|take out images?|images from pdf|retrieve images?|picture extraction|pictures from pdf|photos from pdf)\b/i,
  },

  // ── FLATTEN ──────────────────────────────────────────────────────────────
  // Synonyms: rasterize, remove fields, burn in, bake, render,
  // make static, remove form, remove annotations, finalise, finalize
  {
    action: 'flatten', label: 'Flatten PDF', emoji: '⊟',
    keywords: /\b(flatten|flaaten|flattin|flaten|rasterize|rasterise|rasteriz|remove fields?|burn in|bake( it)?|render( flat)?|make static|remove form|remove annotations?|finali[sz]e|make (it )?static|lock content)\b/i,
  },

  // ── CONVERT FROM PDF ─────────────────────────────────────────────────────
  // Synonyms: export, save as, convert to image, pdf to png etc.
  {
    action: 'convert', label: 'Export PDF', emoji: '⤓', format: 'png',
    keywords: /\b(pdf to (image|png|jpg|jpeg|webp|word|doc)|convert (to|as) (image|png|jpg|jpeg|webp|word|doc)|export (as|to) (image|png|jpg|jpeg|webp|word|doc)|save as (image|png|jpg|jpeg|webp|word|doc)|to (image|png|jpg|jpeg|webp|word|doc))\b/i,
  },

  // ── CONVERT TO PDF ───────────────────────────────────────────────────────
  // Synonyms: make pdf, create pdf, turn into pdf, as pdf, into pdf,
  // pdf format, save to pdf, generate pdf, produce pdf
  {
    action: 'toPDF', label: 'Convert to PDF', emoji: '⤒',
    keywords: /\b(to pdf|as pdf|make pdf|create pdf|convert to pdf|into pdf|pee dee ef|pdf format|save to pdf|generate pdf|produce pdf|turn into pdf|make it pdf|make a pdf)\b/i,
  },

  // ── ANNOTATE / EDIT ──────────────────────────────────────────────────────
  // Synonyms: edit, draw, highlight, write on, mark up, add text,
  // annotate, comment, note, underline, doodle, sketch, pen
  {
    action: 'edit', label: 'Annotate PDF', emoji: '✐',
    keywords: /\b(edit|annotate|add text|write on|markup|mark up|draw|highlight|comment|note|underline|doodle|sketch|pen|pencil|scribble|inscribe|add note|add comment)\b/i,
  },

  // ── UPLOAD ───────────────────────────────────────────────────────────────
  // Synonyms: open file, browse, choose file, load file, pick file,
  // select file, add file, import, bring in
  {
    action: 'upload', label: 'Upload file', emoji: '📤',
    keywords: /\b(upload|open file|browse|choose file|load file|pick file|select file|add file|import|bring in|fetch file|open document|add document)\b/i,
  },

  // ─── NEW VOICE COMMANDS (v1.0 launch) ────────────────────────────────────
  // These are application-level actions: theme, navigation, viewer
  // controls, accessibility. Order matters in scoring — more specific
  // patterns appear before more general ones (e.g. "lightmode" before
  // "lights") so the right action wins.

  // ── DARK MODE ────────────────────────────────────────────────────────────
  {
    action: 'darkmode' as any, label: 'Dark mode', emoji: '🌙',
    keywords: /\b(dark mode|night mode|dark theme|go dark|turn (it )?dark|enable dark|switch to dark)\b/i,
  },

  // ── LIGHT MODE ───────────────────────────────────────────────────────────
  {
    action: 'lightmode' as any, label: 'Light mode', emoji: '☀️',
    keywords: /\b(light mode|day mode|light theme|go light|turn (it )?light|enable light|switch to light|bright mode)\b/i,
  },

  // ── TOGGLE THEME ─────────────────────────────────────────────────────────
  {
    action: 'toggletheme' as any, label: 'Toggle theme', emoji: '🌓',
    keywords: /\b(toggle (theme|mode|dark)|switch theme|change theme|flip theme|invert colors?|invert colours?)\b/i,
  },

  // ── HELP / SHORTCUTS ─────────────────────────────────────────────────────
  {
    action: 'help' as any, label: 'Show help', emoji: '❓',
    keywords: /\b(help|what can you do|how do i|what are the (commands|shortcuts)|show shortcuts|keyboard shortcuts|show help|i need help|tutorial|guide me|how does this work)\b/i,
  },

  // ── UNDO ─────────────────────────────────────────────────────────────────
  {
    action: 'undo' as any, label: 'Undo last action', emoji: '↶',
    keywords: /\b(undo|undue|go back|step back|reverse|revert|take back|previous version|last version|backwards)\b/i,
  },

  // ── NEXT PAGE ────────────────────────────────────────────────────────────
  {
    action: 'nextpage' as any, label: 'Next page', emoji: '▶',
    keywords: /\b(next page|forward (one )?page|page forward|go forward|move next|skip forward|page next|advance)\b/i,
  },

  // ── PREVIOUS PAGE ────────────────────────────────────────────────────────
  {
    action: 'prevpage' as any, label: 'Previous page', emoji: '◀',
    keywords: /\b(previous page|prev page|back (one )?page|page back|go back (one|a) page|page before|prior page|last page back)\b/i,
  },

  // ── FIRST PAGE ───────────────────────────────────────────────────────────
  {
    action: 'firstpage' as any, label: 'First page', emoji: '⏮',
    keywords: /\b(first page|page one|beginning|start of (the )?(document|pdf)|top of (the )?document|go to start|jump to start)\b/i,
  },

  // ── LAST PAGE ────────────────────────────────────────────────────────────
  {
    action: 'lastpage' as any, label: 'Last page', emoji: '⏭',
    keywords: /\b(last page|final page|end of (the )?(document|pdf)|jump to end|go to end|skip to end|bottom of (the )?document)\b/i,
  },

  // ── SELECT ALL PAGES ─────────────────────────────────────────────────────
  {
    action: 'selectall' as any, label: 'Select all pages', emoji: '☰',
    keywords: /\b(select all|select every page|pick all|highlight all|mark all|all pages|every page|whole document|entire document)\b/i,
  },

  // ── DESELECT ─────────────────────────────────────────────────────────────
  {
    action: 'deselectall' as any, label: 'Deselect all', emoji: '☐',
    keywords: /\b(deselect|deselect all|clear selection|unselect|nothing selected|clear all selection|clear pages)\b/i,
  },

  // ── ZOOM IN ──────────────────────────────────────────────────────────────
  {
    action: 'zoomin' as any, label: 'Zoom in', emoji: '🔍',
    keywords: /\b(zoom in|magnify|larger thumbnails|bigger pages|enlarge|make bigger|increase size|zoom up|closer)\b/i,
  },

  // ── ZOOM OUT ─────────────────────────────────────────────────────────────
  {
    action: 'zoomout' as any, label: 'Zoom out', emoji: '🔎',
    keywords: /\b(zoom out|smaller thumbnails|shrink view|reduce thumbnails|tinier|further away|zoom down|see more|fit more)\b/i,
  },

  // ── PAGE COUNT ───────────────────────────────────────────────────────────
  {
    action: 'pagecount' as any, label: 'How many pages', emoji: '#',
    keywords: /\b(how many pages|page count|count (the )?pages|number of pages|total pages|pages total|how long is (it|this)|document length)\b/i,
  },

  // ── INSTALL APP (PWA) ────────────────────────────────────────────────────
  {
    action: 'install' as any, label: 'Install app', emoji: '⬇',
    keywords: /\b(install (the )?app|install commandeditor|add to (home screen|desktop)|install pwa|make it an app|pin app)\b/i,
  },

  // ── CANCEL / STOP ────────────────────────────────────────────────────────
  // Note: this also covers the "stop listening" intent. The voice
  // component itself recognises the literal phrase before dispatching.
  {
    action: 'cancel' as any, label: 'Cancel / stop', emoji: '⊘',
    keywords: /\b(cancel|stop|stop listening|quit|abort|never mind|nevermind|forget it|do nothing|halt|enough)\b/i,
  },
]

// ── Phonetic normaliser (accent-robust pre-processing) ────────────────────
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/\bpee\s*dee\s*(ef|eff|fee)\b/gi, 'pdf')
    .replace(/\bpea\s*day\s*eff\b/gi, 'pdf')
    .replace(/\bhey\s*(ed\w*|editor?)\b/gi, '')
    .replace(/\bok(ay)?\s*(ed\w*|editor?)\b/gi, '')
    .replace(/\bhello\s*(ed\w*|editor?)\b/gi, '')
    .replace(/\b(please|can you|could you|i want to|i need to|i'?d like to|would you|will you)\s*/gi, '')
    .replace(/\bkompres\b/gi, 'compress')
    .replace(/\bkompress\b/gi, 'compress')
    .replace(/\bspelet\b/gi, 'split')
    .replace(/\bmerj\b/gi, 'merge')
    .replace(/\bsafe\s+the\b/gi, 'save the')
    .replace(/\bdownlod\b/gi, 'download')
    .replace(/\bdawnload\b/gi, 'download')
    .trim()
}

// ── Levenshtein distance for fuzzy word matching ──────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

// ── Score transcript against all commands ─────────────────────────────────
function scoreCandidates(raw: string): Array<{
  action: VoiceCommandType; label: string; emoji: string; score: number
}> {
  const norm = normalise(raw)
  const results: Array<{ action: VoiceCommandType; label: string; emoji: string; score: number }> = []

  for (const cmd of COMMAND_MAP) {
    if (cmd.keywords.test(norm)) {
      const actionObj: VoiceCommandType = { action: cmd.action }
      // Detect format from transcript for convert actions
      if (cmd.action === 'convert') {
        if (/\b(word|doc)\b/i.test(norm)) actionObj.format = 'word'
        else if (/\b(jpg|jpeg)\b/i.test(norm)) actionObj.format = 'jpg'
        else if (/\bwebp\b/i.test(norm)) actionObj.format = 'webp'
        else actionObj.format = 'png'
      } else if (cmd.format) {
        actionObj.format = cmd.format
      }
      results.push({ action: actionObj, label: cmd.label, emoji: cmd.emoji, score: 0.95 })
    }
  }
  if (results.length > 0) return results.slice(0, 3)

  // Fuzzy fallback: character-level similarity
  const words = norm.split(/\s+/).filter(w => w.length > 2)
  const fuzzy: typeof results = []
  for (const cmd of COMMAND_MAP) {
    const kwSrc = cmd.keywords.source
      .replace(/\\b|\(|\)|[?*+]|\[.*?\]/g, ' ')
      .split(/[\s|]+/).filter(w => w.length > 3)
    let bestScore = 0
    for (const word of words) {
      for (const kw of kwSrc) {
        const dist = levenshtein(word.toLowerCase(), kw.toLowerCase())
        const sim = 1 - dist / Math.max(word.length, kw.length)
        if (sim > bestScore) bestScore = sim
      }
    }
    if (bestScore > 0.65) {
      fuzzy.push({
        action: { action: cmd.action, format: cmd.format },
        label: cmd.label, emoji: cmd.emoji, score: bestScore,
      })
    }
  }
  return fuzzy.sort((a, b) => b.score - a.score).slice(0, 3)
}

const SpeechRecognition = typeof window !== 'undefined'
  ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  : null

const LANG_CANDIDATES = ['en-GB','en-US','en-AU','en-IN','en-NG','en-ZA','en-CA']
const LANG_LABELS: Record<string, string> = {
  'en-GB': '🇬🇧 British', 'en-US': '🇺🇸 American', 'en-AU': '🇦🇺 Australian',
  'en-IN': '🇮🇳 Indian', 'en-NG': '🇳🇬 Nigerian', 'en-ZA': '🇿🇦 S. African', 'en-CA': '🇨🇦 Canadian',
}

export default function VoiceCommand({ files, onCommand, isProcessing }: VoiceCommandProps) {
  const [isListening, setIsListening] = useState(false)
  const [isAwake, setIsAwake] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [status, setStatus] = useState<'idle'|'listening'|'awake'|'success'|'error'|'confirm'>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [isSupported, setIsSupported] = useState(false)
  const [pendingCandidates, setPendingCandidates] = useState<Array<{action:VoiceCommandType;label:string;emoji:string;score:number}>>([])
  const [selectedLang, setSelectedLang] = useState('en-GB')
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [heardText, setHeardText] = useState('')
  const [showCommandRef, setShowCommandRef] = useState(false)
  const [refSearch, setRefSearch] = useState('')

  const recognitionRef = useRef<any>(null)
  const awakeTimeoutRef = useRef<NodeJS.Timeout|null>(null)
  const confirmTimeoutRef = useRef<NodeJS.Timeout|null>(null)
  const isAwakeRef = useRef(false)
  const isListeningRef = useRef(false)
  const statusRef = useRef<typeof status>('idle')
  const onCommandRef = useRef(onCommand)
  const pendingRef = useRef(pendingCandidates)

  useEffect(() => { isAwakeRef.current = isAwake }, [isAwake])
  useEffect(() => { isListeningRef.current = isListening }, [isListening])
  useEffect(() => { statusRef.current = status }, [status])
  useEffect(() => { onCommandRef.current = onCommand }, [onCommand])
  useEffect(() => { pendingRef.current = pendingCandidates }, [pendingCandidates])
  useEffect(() => { setIsSupported(!!SpeechRecognition) }, [])

  const checkWakeWord = useCallback((text: string): boolean => {
    return /\b(hey|ok(ay)?|hello|hi|a|eh)\s*(ed\w{2,})\b|\beditor\b|\bhey\s*edit\b/i.test(text)
  }, [])

  const executeCommand = useCallback((cmd: VoiceCommandType, label: string) => {
    setStatus('success')
    setStatusMessage(`✓ ${label}…`)
    onCommandRef.current(cmd)
    setPendingCandidates([])
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
    setTimeout(() => {
      setIsAwake(false); isAwakeRef.current = false
      setTranscript(''); setStatus('listening')
      setStatusMessage('Say "Hey Editor"'); setHeardText('')
    }, 2800)
  }, [])

  const processCommand = useCallback((raw: string) => {
    if (raw.trim().length < 2) return
    setHeardText(raw)
    const candidates = scoreCandidates(raw)
    if (candidates.length === 0) {
      setStatus('confirm'); setPendingCandidates([])
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
      confirmTimeoutRef.current = setTimeout(() => {
        setStatus('listening'); setIsAwake(false); isAwakeRef.current = false
        setStatusMessage('Say "Hey Editor"'); setHeardText('')
      }, 9000)
      return
    }
    const top = candidates[0]
    if (top.score >= 0.9 && candidates.length === 1) {
      executeCommand(top.action, top.label); return
    }
    setStatus('confirm'); setPendingCandidates(candidates)
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
    confirmTimeoutRef.current = setTimeout(() => {
      setStatus('listening'); setIsAwake(false); isAwakeRef.current = false
      setStatusMessage('Say "Hey Editor"'); setPendingCandidates([]); setHeardText('')
    }, 10000)
  }, [executeCommand])

  const handleConfirmVoice = useCallback((text: string) => {
    const t = text.toLowerCase()
    const current = pendingRef.current
    if (/\b(yes|yeah|yep|correct|that'?s?( it| right)?|right|ok(ay)?|confirm|go|do it|aye|ja|yep|sure|affirmative|proceed)\b/i.test(t)) {
      if (current[0]) executeCommand(current[0].action, current[0].label)
      return
    }
    if (/\b(no|nope|cancel|wrong|not that|neither|none|stop|dismiss|never mind|nevermind|abort)\b/i.test(t)) {
      setStatus('listening'); setIsAwake(false); isAwakeRef.current = false
      setStatusMessage('Say "Hey Editor"'); setPendingCandidates([]); setHeardText('')
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
      return
    }
    if (/\b(first|one|1|number one|option one)\b/i.test(t) && current[0]) { executeCommand(current[0].action, current[0].label); return }
    if (/\b(second|two|2|number two|option two)\b/i.test(t) && current[1]) { executeCommand(current[1].action, current[1].label); return }
    if (/\b(third|three|3|number three|option three)\b/i.test(t) && current[2]) { executeCommand(current[2].action, current[2].label); return }
  }, [executeCommand])

  const startListening = useCallback(() => {
    if (!SpeechRecognition || isProcessing) return
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = selectedLang
    recognition.maxAlternatives = 3

    recognition.onstart = () => {
      setIsListening(true); isListeningRef.current = true
      setStatus('listening'); setStatusMessage('Say "Hey Editor"')
    }
    recognition.onresult = (event: any) => {
      let final = '', interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript
        else interim += event.results[i][0].transcript
      }
      const current = final || interim
      setTranscript(current)
      if (statusRef.current === 'confirm' && final) { handleConfirmVoice(final); return }
      if (!isAwakeRef.current && checkWakeWord(current)) {
        setIsAwake(true); isAwakeRef.current = true
        setStatus('awake'); setStatusMessage('Listening! Say your command…')
        if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current)
        awakeTimeoutRef.current = setTimeout(() => {
          if (statusRef.current !== 'confirm') {
            setIsAwake(false); isAwakeRef.current = false; setStatusMessage('Say "Hey Editor"')
          }
        }, 15000)
        return
      }
      if (isAwakeRef.current && final) {
        let cmd = final.toLowerCase()
          .replace(/\b(hey|ok(ay)?|hello|hi)\s*ed\w+\b/gi, '').replace(/\beditor\b/gi, '')
          .replace(/^(please|can you|could you|i want to|i need to|i'?d like to)\s*/i, '').trim()
        if (cmd.length > 0) processCommand(cmd)
      }
    }
    recognition.onerror = (e: any) => {
      if (e.error === 'not-allowed') { setStatus('error'); setStatusMessage('Mic access denied') }
    }
    recognition.onend = () => {
      if (isListeningRef.current) setTimeout(() => { try { recognition.start() } catch {} }, 120)
    }
    recognitionRef.current = recognition
    try { recognition.start() } catch { setStatus('error'); setStatusMessage('Could not start mic') }
  }, [isProcessing, selectedLang, checkWakeWord, processCommand, handleConfirmVoice])

  const stopListening = useCallback(() => {
    isListeningRef.current = false; setIsListening(false)
    recognitionRef.current?.stop(); recognitionRef.current = null
    setIsAwake(false); isAwakeRef.current = false
    setStatus('idle'); setStatusMessage(''); setTranscript('')
    setPendingCandidates([]); setHeardText('')
    if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current)
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
  }, [])

  useEffect(() => () => {
    recognitionRef.current?.stop()
    if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current)
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
  }, [])

  if (!isSupported) return (
    <div className="card h-full animate-fade-up flex flex-col justify-center" style={{ animationDelay: '0.1s' }}>
      <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--ink-muted)' }}>
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        Voice commands require Chrome or Edge
      </div>
    </div>
  )

  const isActive = isListening && isAwake
  const isConfirming = status === 'confirm'

  return (
    <div className="card h-full animate-fade-up flex flex-col" style={{ animationDelay: '0.1s' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${isActive || isConfirming ? 'voice-pulse' : ''}`}
               style={{ background: isConfirming ? '#f59e0b' : isActive ? 'var(--accent)' : isListening ? 'linear-gradient(135deg,var(--blue-bright),var(--blue-vivid))' : 'var(--surface-2)' }}>
            <svg className="w-5 h-5" style={{ color: isListening || isConfirming ? 'white' : 'var(--ink-muted)' }}
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold">Voice Commands</h2>
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              {isConfirming ? 'Confirm command' : isListening ? (isAwake ? "I'm listening!" : 'Say "Hey Editor"') : 'Click to activate'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCommandRef(s => !s)}
                  aria-label="Show all voice commands"
                  aria-expanded={showCommandRef}
                  className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                  style={{ background: showCommandRef ? 'var(--blue-pale)' : 'var(--surface-2)', color: showCommandRef ? 'var(--blue-vivid)' : 'var(--ink-soft)', border: '1px solid var(--border)' }}>
            {showCommandRef ? '✕ Close' : '📖 Commands'}
          </button>
          <div className="relative">
            <button onClick={() => setShowLangPicker(s => !s)} aria-label="Change accent model"
                    className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                    style={{ background: 'var(--surface-2)', color: 'var(--ink-soft)', border: '1px solid var(--border)' }}>
              {selectedLang.split('-')[1]} 🌍
            </button>
            {showLangPicker && (
              <div className="absolute right-0 top-9 z-30 rounded-xl overflow-hidden animate-slide-down"
                   style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', minWidth: 170 }}>
                {LANG_CANDIDATES.map(lang => (
                  <button key={lang} onClick={() => { setSelectedLang(lang); setShowLangPicker(false) }}
                          className="w-full text-left px-4 py-2.5 text-xs font-medium"
                          style={{ background: selectedLang === lang ? 'var(--blue-pale)' : 'transparent', color: selectedLang === lang ? 'var(--blue-vivid)' : 'var(--ink-soft)' }}>
                    {LANG_LABELS[lang]}{selectedLang === lang ? ' ✓' : ''}
                  </button>
                ))}
                <div className="px-4 py-2 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--ink-muted)' }}>
                  Sets the STT model. Synonyms &amp; fuzzy matching also active.
                </div>
              </div>
            )}
          </div>
          <button onClick={isListening ? stopListening : startListening} disabled={isProcessing}
                  aria-label={isListening ? 'Stop voice recognition' : 'Start voice recognition'}
                  className={isListening ? 'btn-ghost text-xs px-3 py-2' : 'btn-primary text-xs px-3 py-2'}
                  style={isListening ? { background: 'var(--surface-2)', color: 'var(--ink)' } : {}}>
            {isListening ? 'Stop' : '🎤 Start'}
          </button>
        </div>
      </div>

      {/* Command reference panel */}
      {showCommandRef && (
        <div className="animate-slide-down mb-3 rounded-xl overflow-hidden"
             style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
             role="region" aria-label="Voice command reference">
          <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <input
              type="text"
              value={refSearch}
              onChange={e => setRefSearch(e.target.value)}
              placeholder="Search commands… e.g. compress, sign, excel"
              aria-label="Search voice commands"
              className="w-full text-sm px-3 py-2 rounded-lg outline-none"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {COMMAND_REFERENCE.map(cat => {
              const q = refSearch.trim().toLowerCase()
              const items = q
                ? cat.items.filter(it => it.say.toLowerCase().includes(q) || it.does.toLowerCase().includes(q))
                : cat.items
              if (items.length === 0) return null
              return (
                <div key={cat.group} className="mb-3 last:mb-1">
                  <p className="section-label px-2 mb-1.5 flex items-center gap-1.5">
                    <span aria-hidden="true">{cat.emoji}</span>{cat.group}
                  </p>
                  <div className="space-y-0.5">
                    {items.map(it => (
                      <div key={it.say} className="flex items-start gap-3 px-2 py-1.5 rounded-lg"
                           style={{ background: 'transparent' }}>
                        <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--blue-vivid)', minWidth: '42%' }}>
                          {it.say}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                          {it.does}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {refSearch.trim() && COMMAND_REFERENCE.every(cat =>
              cat.items.every(it => {
                const q = refSearch.trim().toLowerCase()
                return !it.say.toLowerCase().includes(q) && !it.does.toLowerCase().includes(q)
              })
            ) && (
              <p className="text-xs text-center py-6" style={{ color: 'var(--ink-muted)' }}>
                No command matches “{refSearch}”. Try a simpler word, or just tap the tool directly.
              </p>
            )}
          </div>
          <div className="px-3 py-2 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--ink-muted)' }}>
            Every command also accepts many synonyms &amp; handles accents. Just speak naturally.
          </div>
        </div>
      )}

      {/* Status bar */}
      {isListening && !isConfirming && (
        <div className={`px-4 py-3 rounded-xl text-sm mb-3 flex items-center gap-2 ${status === 'success' ? 'text-green-700' : status === 'error' ? 'text-red-600' : ''}`}
             style={{ background: status === 'success' ? 'var(--green-light)' : status === 'error' ? '#fee2e2' : isAwake ? 'rgba(232,100,42,0.08)' : 'var(--surface)', border: `1px solid ${isAwake ? 'rgba(232,100,42,0.2)' : 'var(--border)'}` }}
             role="status" aria-live="polite">
          {(status === 'listening' || status === 'awake') && (
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isAwake ? 'bg-orange-400' : 'bg-blue-400'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isAwake ? 'bg-orange-500' : 'bg-blue-500'}`} />
            </span>
          )}
          <span className="truncate">{transcript ? `"${transcript}"` : statusMessage || 'Ready'}</span>
        </div>
      )}

      {/* Confirm panel */}
      {isConfirming && (
        <div className="animate-scale-in space-y-3 mb-3" role="dialog" aria-label="Confirm voice command">
          <div className="px-4 py-2.5 rounded-xl text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--ink-muted)' }}>I heard:</p>
            <p className="font-medium" style={{ color: 'var(--ink)' }}>"{heardText}"</p>
          </div>
          {pendingCandidates.length > 0 ? (
            <>
              <p className="text-xs font-semibold" style={{ color: 'var(--ink-muted)' }}>
                Did you mean? Say "yes", "first", "second"… or tap:
              </p>
              <div className="space-y-2">
                {pendingCandidates.map((c, i) => (
                  <button key={c.label} onClick={() => executeCommand(c.action, c.label)}
                          aria-label={`Confirm ${c.label}`}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                          style={{ background: i === 0 ? 'var(--blue-pale)' : 'var(--surface)', border: `1.5px solid ${i === 0 ? 'var(--blue-vivid)' : 'var(--border)'}` }}>
                    <span className="text-xl flex-shrink-0">{c.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: i === 0 ? 'var(--blue-vivid)' : 'var(--ink)' }}>
                        {i === 0 ? '✓ ' : ''}{c.label}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                        {Math.round(c.score * 100)}% match · say "{['yes','second','third'][i]}"
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="px-4 py-3 rounded-xl" style={{ background: '#fee2e2', border: '1px solid #fecaca' }} role="alert">
              <p className="text-sm font-semibold text-red-700 mb-1">Command not recognised</p>
              <p className="text-xs text-red-600">Try rephrasing, or tap a tool directly in the panel.</p>
            </div>
          )}
          <button onClick={() => {
            setStatus('listening'); setIsAwake(false); isAwakeRef.current = false
            setStatusMessage('Say "Hey Editor"'); setPendingCandidates([]); setHeardText('')
            if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
          }} className="w-full text-center text-xs py-2 rounded-xl"
                  style={{ color: 'var(--ink-muted)', background: 'var(--surface-2)' }}>
            ✕ Cancel
          </button>
        </div>
      )}

      {/* Example chips */}
      {!isListening && (
        <div className="flex-1 flex flex-col justify-end">
          <p className="section-label mb-3">Example commands</p>
          <div className="flex flex-wrap gap-1.5">
            {['"join the PDFs"','"squish it"','"stamp confidential"',
              '"compare pdfs"','"spell check"','"flashcards"','"podcast script"',
              '"PII scan"','"ink cost"','"timeline"','"anki deck"','"present"',
              '"tone analysis"','"detect language"','"citations"','"record macro"',
              '"start over"','"AES encrypt"',
            ].map(cmd => (
              <span key={cmd} className="text-xs px-2 py-1 rounded-lg font-mono"
                    style={{ background: 'var(--surface-2)', color: 'var(--ink-muted)', border: '1px solid var(--border)' }}>
                {cmd}
              </span>
            ))}
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--ink-muted)' }}>
            25+ synonyms per command · British, American, Australian, Indian, Nigerian &amp; South African accents · Fuzzy matching · AES-256 encrypt · Start over · Rename
          </p>
        </div>
      )}
    </div>
  )
}
