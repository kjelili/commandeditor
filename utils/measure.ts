// utils/measure.ts — pure geometry + scale math for the Measure / Scale tool.
//
// All calibration is expressed in PDF *points* (1/72"), so a calibration stays
// valid even if the on-screen render zoom changes — the component only needs to
// track the current render scale (canvas pixels per PDF point).
//
// Nothing here touches the DOM, so it is fully unit-testable under node/tsx.

export type Pt = { x: number; y: number }

export type LinearUnit = 'mm' | 'cm' | 'm' | 'km' | 'in' | 'ft' | 'yd' | 'mi'

export const LINEAR_UNITS: LinearUnit[] = ['mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi']

// Metres per one of each unit — the single source of truth for conversions.
const METRES_PER: Record<LinearUnit, number> = {
  mm: 1e-3,
  cm: 1e-2,
  m: 1,
  km: 1000,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144,
  mi: 1609.344,
}

/** Euclidean distance between two points (same coordinate space as inputs). */
export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Total length of an open polyline through the given points. */
export function polylineLength(pts: Pt[]): number {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i])
  return total
}

/** Absolute area of a closed polygon via the shoelace formula. */
export function polygonArea(pts: Pt[]): number {
  if (pts.length < 3) return 0
  let acc = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    acc += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(acc) / 2
}

/** Perimeter of a closed polygon (polyline length + closing segment). */
export function polygonPerimeter(pts: Pt[]): number {
  if (pts.length < 2) return 0
  return polylineLength(pts) + dist(pts[pts.length - 1], pts[0])
}

/** Convert canvas pixels to PDF points given the render scale (px per point). */
export function pxToPoints(px: number, renderScale: number): number {
  if (renderScale <= 0) throw new Error('renderScale must be > 0')
  return px / renderScale
}

/**
 * Derive the calibration constant: real-world units represented by one PDF point.
 *
 * @param refPixelLength  length of the reference line drawn on the canvas, in px
 * @param renderScale     canvas pixels per PDF point at the time it was drawn
 * @param realLength      how long that reference line is in the real world
 */
export function unitsPerPoint(refPixelLength: number, renderScale: number, realLength: number): number {
  if (refPixelLength <= 0) throw new Error('reference line has zero length')
  if (realLength <= 0) throw new Error('real length must be > 0')
  const refPoints = pxToPoints(refPixelLength, renderScale)
  return realLength / refPoints
}

/** Real-world length of a pixel distance, in the calibration unit. */
export function pixelsToUnits(px: number, renderScale: number, unitsPerPt: number): number {
  return pxToPoints(px, renderScale) * unitsPerPt
}

/** Real-world area of a pixel area, in (calibration unit)². */
export function pixelAreaToUnits(pxArea: number, renderScale: number, unitsPerPt: number): number {
  const s = pxToPoints(1, renderScale) // points per pixel, linear
  return pxArea * s * s * unitsPerPt * unitsPerPt
}

/** Convert a linear measurement between units. */
export function convertLinear(value: number, from: LinearUnit, to: LinearUnit): number {
  return (value * METRES_PER[from]) / METRES_PER[to]
}

/** Convert an area measurement between the squares of two linear units. */
export function convertArea(value: number, from: LinearUnit, to: LinearUnit): number {
  const f = METRES_PER[from] / METRES_PER[to]
  return value * f * f
}

/** Human label for an area unit, e.g. "m²". */
export function areaUnitLabel(u: LinearUnit): string {
  return `${u}²`
}

/** Round to a sensible number of significant figures for display. */
export function pretty(value: number, sig = 4): number {
  if (!isFinite(value) || value === 0) return 0
  const digits = sig - Math.floor(Math.log10(Math.abs(value))) - 1
  const f = Math.pow(10, Math.max(0, digits))
  return Math.round(value * f) / f
}
