// OpenCV.js-backed document detection (edge/contour based). Loaded lazily and
// on-device (cached after first use). Unlike a brightness/Otsu approach, Canny
// edge detection locks onto the PAPER BORDER, so it works even when the page is
// against a bright/white background (e.g. a webcam pointed at a wall).
//
// Everything degrades gracefully: if OpenCV isn't ready/available, callers fall
// back to the self-contained detector, so scanning never breaks.
import type { Pt } from './docScan'

const CV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0/dist/opencv.js'
let loading: Promise<boolean> | null = null
let ready = false

export function isCVReady(): boolean { return ready }

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-cv="1"]')) return resolve()
    const s = document.createElement('script')
    s.src = src; s.async = true; s.setAttribute('data-cv', '1')
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('opencv load failed'))
    document.head.appendChild(s)
  })
}

const w = (): any => window as any

export function ensureOpenCV(): Promise<boolean> {
  if (ready) return Promise.resolve(true)
  if (!loading) {
    loading = (async () => {
      try {
        await loadScript(CV_URL)
        let cv: any = w().cv
        if (cv && typeof cv.then === 'function') { cv = await cv; w().cv = cv }
        else if (cv && !cv.Mat && typeof cv === 'object') {
          await new Promise<void>((res) => {
            const prev = cv.onRuntimeInitialized
            cv.onRuntimeInitialized = () => { try { prev && prev() } catch {}; res() }
            setTimeout(res, 12000)
          })
        }
        // Final poll in case init style differs.
        if (!(w().cv && w().cv.Mat)) {
          await new Promise<void>((res) => {
            const t0 = Date.now()
            const iv = setInterval(() => {
              if ((w().cv && w().cv.Mat) || Date.now() - t0 > 12000) { clearInterval(iv); res() }
            }, 100)
          })
        }
        ready = !!(w().cv && w().cv.Mat)
        return ready
      } catch { ready = false; return false }
    })()
  }
  return loading
}

// Order 4 points as [TL, TR, BR, BL].
function order(pts: Pt[]): Pt[] {
  let tl = pts[0], br = pts[0], tr = pts[0], bl = pts[0]
  let tlS = Infinity, brS = -Infinity, trD = -Infinity, blD = Infinity
  for (const p of pts) {
    const s = p.x + p.y, d = p.x - p.y
    if (s < tlS) { tlS = s; tl = p }
    if (s > brS) { brS = s; br = p }
    if (d > trD) { trD = d; tr = p }
    if (d < blD) { blD = d; bl = p }
  }
  return [tl, tr, br, bl]
}

// Detect the document quad via Canny edges + largest 4-point contour.
export function detectCornersCV(canvas: HTMLCanvasElement): Pt[] | null {
  const cv: any = w().cv
  if (!ready || !cv || !cv.Mat) return null
  let src: any, gray: any, edges: any, kernel: any, contours: any, hierarchy: any, best: any = null
  try {
    src = cv.imread(canvas)
    gray = new cv.Mat()
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0)
    edges = new cv.Mat()
    cv.Canny(gray, edges, 60, 160)
    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5))
    cv.dilate(edges, edges, kernel)
    contours = new cv.MatVector()
    hierarchy = new cv.Mat()
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    const imgArea = canvas.width * canvas.height
    let bestArea = 0
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i)
      const area = cv.contourArea(c)
      if (area < imgArea * 0.15) { c.delete(); continue }
      const peri = cv.arcLength(c, true)
      const approx = new cv.Mat()
      cv.approxPolyDP(c, approx, 0.02 * peri, true)
      if (approx.rows === 4 && area > bestArea) {
        if (best) best.delete()
        best = approx; bestArea = area
      } else {
        approx.delete()
      }
      c.delete()
    }
    if (!best) return null
    const pts: Pt[] = []
    for (let i = 0; i < 4; i++) pts.push({ x: best.data32S[i * 2], y: best.data32S[i * 2 + 1] })
    return order(pts)
  } catch {
    return null
  } finally {
    for (const m of [src, gray, edges, kernel, contours, hierarchy, best]) { try { m && m.delete() } catch {} }
  }
}
