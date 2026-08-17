'use client'

import { useEffect, useRef, useState } from 'react'
import { extractSpeechChapters, SpeechChapter } from '@/utils/gapFillers'

interface Props {
  file: File
  onClose: () => void
  showStatus: (msg: string, dur?: number) => void
}

/**
 * Listen to PDF — v9 new niche.
 *
 * Turns any PDF into a spoken audiobook using the browser's built-in speech
 * synthesis. Zero uploads, zero cost, works offline once voices are cached.
 * Competitors either don't offer this at all or send text to a cloud TTS API
 * (a privacy break). Per-page chapter marks, speed control, voice picker,
 * and background reading so users can keep working.
 */
export default function ListenTool({ file, onClose, showStatus }: Props) {
  const [chapters, setChapters] = useState<SpeechChapter[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceURI, setVoiceURI] = useState('')
  const [rate, setRate] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [chapterIdx, setChapterIdx] = useState(0)
  const [supported] = useState(() => typeof window !== 'undefined' && 'speechSynthesis' in window)

  const utterRef = useRef<SpeechSynthesisUtterance | null>(null)
  const idxRef = useRef(0)

  useEffect(() => {
    idxRef.current = chapterIdx
  }, [chapterIdx])

  useEffect(() => {
    extractSpeechChapters(file)
      .then((chs) => {
        setChapters(chs)
        setLoading(false)
        if (chs.length === 0) showStatus('No readable text found — try OCR first')
      })
      .catch((e) => { showStatus('Could not read document: ' + e.message); setLoading(false) })

    const loadVoices = () => {
      const v = window.speechSynthesis?.getVoices() || []
      setVoices(v)
      if (v.length && !voiceURI) setVoiceURI(v.find((x) => x.lang.startsWith('en'))?.voiceURI || v[0].voiceURI)
    }
    loadVoices()
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = loadVoices

    return () => { window.speechSynthesis?.cancel() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  const speakChapter = (idx: number, chs: SpeechChapter[]) => {
    if (idx >= chs.length) { setPlaying(false); showStatus('✓ Finished reading'); return }
    setChapterIdx(idx); idxRef.current = idx
    const u = new SpeechSynthesisUtterance(chs[idx].text)
    const voice = voices.find((v) => v.voiceURI === voiceURI)
    if (voice) u.voice = voice
    u.rate = rate
    u.onend = () => { if (idxRef.current === idx) speakChapter(idx + 1, chs) }
    u.onerror = () => setPlaying(false)
    utterRef.current = u
    window.speechSynthesis.speak(u)
  }

  const play = () => {
    if (!chapters) return
    if (window.speechSynthesis.paused && playing) { window.speechSynthesis.resume(); return }
    window.speechSynthesis.cancel()
    setPlaying(true)
    speakChapter(idxRef.current, chapters)
  }

  const pause = () => { window.speechSynthesis.pause(); }
  const stop = () => { window.speechSynthesis.cancel(); setPlaying(false); setChapterIdx(0); idxRef.current = 0 }
  const jump = (idx: number) => {
    if (!chapters) return
    window.speechSynthesis.cancel()
    setChapterIdx(idx); idxRef.current = idx
    if (playing) speakChapter(idx, chapters)
  }

  const totalWords = chapters?.reduce((a, c) => a + c.words, 0) || 0
  const estMinutes = Math.round(totalWords / (160 * rate))

  if (!supported) {
    return (
      <div className="card space-y-3">
        <p className="font-semibold text-sm">🎧 Listen to PDF</p>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          Your browser does not expose speech synthesis. Try Chrome, Edge, or Safari.
        </p>
        <button onClick={onClose} className="btn-ghost text-xs px-3 py-2 self-start">Close</button>
      </div>
    )
  }

  return (
    <div className="card space-y-4 animate-scale-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🎧</span>
          <div>
            <p className="font-semibold text-sm">Listen to PDF</p>
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              Audiobook mode — read aloud, on-device, no cloud TTS
            </p>
          </div>
        </div>
        <button onClick={() => { stop(); onClose() }} className="text-xs px-2 py-1 rounded-lg"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-soft)', border: '1px solid var(--border)' }}>✕</button>
      </div>

      {loading && <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Extracting text…</p>}

      {chapters && chapters.length > 0 && (
        <>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            {chapters.length} chapters (pages) · {totalWords.toLocaleString()} words · ≈ {estMinutes} min at {rate}×
          </p>

          <div className="flex gap-2 flex-wrap">
            <button onClick={play} className="btn-primary text-xs px-4 py-2" style={{ background: '#0d9488' }}>
              {playing ? '▶ Resume' : '▶ Play'}
            </button>
            <button onClick={pause} disabled={!playing} className="btn-ghost text-xs px-3 py-2">⏸ Pause</button>
            <button onClick={stop} disabled={!playing && chapterIdx === 0} className="btn-ghost text-xs px-3 py-2">⏹ Stop</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--ink-muted)' }}>Voice</label>
              <select value={voiceURI} onChange={(e) => setVoiceURI(e.target.value)}
                      className="w-full text-xs px-2 py-2 rounded-lg"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}>
                {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--ink-muted)' }}>Speed — {rate}×</label>
              <input type="range" min={0.5} max={2} step={0.25} value={rate}
                     onChange={(e) => setRate(Number(e.target.value))} className="w-full" />
            </div>
          </div>

          <div className="max-h-44 overflow-y-auto space-y-1">
            {chapters.map((c, i) => (
              <button key={i} onClick={() => jump(i)}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs flex items-center gap-2 transition-colors"
                      style={{
                        background: i === chapterIdx ? 'var(--blue-pale)' : 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: i === chapterIdx ? 'var(--blue-vivid)' : 'var(--ink-soft)',
                      }}>
                <span className="font-semibold flex-shrink-0">p{c.page}</span>
                <span className="truncate">{c.text.slice(0, 80)}…</span>
                {i === chapterIdx && playing && <span className="ml-auto flex-shrink-0">🔊</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
