// Self-contained document scanner: find the page in a photo and flatten it.
// Pure functions (no DOM) so they can be unit-tested; the component wraps the
// results in a canvas. Everything runs on-device — no libraries, no CDN.

export interface Pt { x: number; y: number }

/**
 * Detect the four corners of the dominant bright quadrilateral (a page) in an
 * RGBA image. Returns corners ordered [TL, TR, BR, BL] in source-pixel space,
 * or null when no confident page is found (caller then keeps the full frame).
 */
export function detectDocumentCorners(data: Uint8ClampedArray, w: number, h: number): Pt[] | null {
  // 1) Downscale (grayscale) for fast detection.
  const maxDim = 440
  const scale = Math.min(1, maxDim / Math.max(w, h))
  const dw = Math.max(1, Math.round(w * scale))
  const dh = Math.max(1, Math.round(h * scale))
  const gray = new Uint8Array(dw * dh)
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(h - 1, Math.round(y / scale))
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(w - 1, Math.round(x / scale))
      const i = (sy * w + sx) * 4
      gray[y * dw + x] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0
    }
  }

  // 2) Otsu threshold -> bright (paper) mask.
  const hist = new Array(256).fill(0)
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++
  const total = gray.length
  let sumAll = 0
  for (let t = 0; t < 256; t++) sumAll += t * hist[t]
  let sumB = 0, wB = 0, maxVar = -1, thr = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sumAll - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > maxVar) { maxVar = between; thr = t }
  }
  const mask = new Uint8Array(dw * dh)
  for (let i = 0; i < gray.length; i++) mask[i] = gray[i] > thr ? 1 : 0

  // 3) Largest connected bright component (4-connectivity, iterative flood fill).
  const label = new Int32Array(dw * dh)
  let bestLabel = 0, bestSize = 0, cur = 0
  const stack: number[] = []
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start]) continue
    cur++
    let size = 0
    stack.length = 0
    stack.push(start)
    label[start] = cur
    while (stack.length) {
      const p = stack.pop() as number
      size++
      const px = p % dw, py = (p / dw) | 0
      if (px > 0)      { const q = p - 1;  if (mask[q] && !label[q]) { label[q] = cur; stack.push(q) } }
      if (px < dw - 1) { const q = p + 1;  if (mask[q] && !label[q]) { label[q] = cur; stack.push(q) } }
      if (py > 0)      { const q = p - dw; if (mask[q] && !label[q]) { label[q] = cur; stack.push(q) } }
      if (py < dh - 1) { const q = p + dw; if (mask[q] && !label[q]) { label[q] = cur; stack.push(q) } }
    }
    if (size > bestSize) { bestSize = size; bestLabel = cur }
  }
  if (bestSize < dw * dh * 0.15) return null // page too small / not found

  // 4) Corners = extremes of (x+y) and (x-y) over the component.
  let tl = 0, tr = 0, br = 0, bl = 0
  let tlV = Infinity, brV = -Infinity, trV = -Infinity, blV = Infinity
  for (let p = 0; p < label.length; p++) {
    if (label[p] !== bestLabel) continue
    const x = p % dw, y = (p / dw) | 0
    const spd = x + y, dif = x - y
    if (spd < tlV) { tlV = spd; tl = p }
    if (spd > brV) { brV = spd; br = p }
    if (dif > trV) { trV = dif; tr = p }
    if (dif < blV) { blV = dif; bl = p }
  }
  const toPt = (p: number): Pt => ({ x: (p % dw) / scale, y: ((p / dw) | 0) / scale })
  const c = [toPt(tl), toPt(tr), toPt(br), toPt(bl)]

  // 5) Reject degenerate detections (edges too short).
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
  const minEdge = Math.min(dist(c[0], c[1]), dist(c[1], c[2]), dist(c[2], c[3]), dist(c[3], c[0]))
  if (minEdge < Math.min(w, h) * 0.15) return null
  return c
}

// Solve an 8x8 linear system (Gaussian elimination with partial pivoting).
function solve8(A: number[][], b: number[]): number[] {
  const n = 8
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    ;[M[col], M[piv]] = [M[piv], M[col]]
    const d = M[col][col] || 1e-12
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col] / d
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k]
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12))
}

// Homography (9 values) mapping src[i] -> dst[i].
function homography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = [], b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], X = dst[i].x, Y = dst[i].y
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X)
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y)
  }
  const h = solve8(A, b)
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
}

/**
 * Flatten the quadrilateral given by corners [TL,TR,BR,BL] into an upright
 * rectangle, bilinearly sampled. Returns raw RGBA + dimensions.
 */
export function warpToImageData(
  data: Uint8ClampedArray, w: number, h: number, corners: Pt[]
): { data: Uint8ClampedArray; width: number; height: number } {
  const [tl, tr, br, bl] = corners
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
  const outW = Math.max(1, Math.round((dist(tl, tr) + dist(bl, br)) / 2))
  const outH = Math.max(1, Math.round((dist(tl, bl) + dist(tr, br)) / 2))
  const dst: Pt[] = [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }]
  // Map output-rect coords -> source coords, so we can inverse-sample.
  const H = homography(dst, corners)
  const out = new Uint8ClampedArray(outW * outH * 4)
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const den = H[6] * x + H[7] * y + H[8]
      const sx = (H[0] * x + H[1] * y + H[2]) / den
      const sy = (H[3] * x + H[4] * y + H[5]) / den
      const oi = (y * outW + x) * 4
      if (sx >= 0 && sx < w - 1 && sy >= 0 && sy < h - 1) {
        const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0
        const i00 = (y0 * w + x0) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4
        for (let cc = 0; cc < 3; cc++) {
          const top = data[i00 + cc] * (1 - fx) + data[i10 + cc] * fx
          const bot = data[i01 + cc] * (1 - fx) + data[i11 + cc] * fx
          out[oi + cc] = top * (1 - fy) + bot * fy
        }
        out[oi + 3] = 255
      } else {
        out[oi] = out[oi + 1] = out[oi + 2] = 255; out[oi + 3] = 255
      }
    }
  }
  return { data: out, width: outW, height: outH }
}
