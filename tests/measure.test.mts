// tests/measure.test.mts — unit tests for the Measure/Scale math (node + tsx)
import {
  dist, polylineLength, polygonArea, polygonPerimeter,
  pxToPoints, unitsPerPoint, pixelsToUnits, pixelAreaToUnits,
  convertLinear, convertArea, areaUnitLabel, pretty, LINEAR_UNITS,
} from '../utils/measure'

let passed = 0, failed = 0
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}`) }
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

console.log('measure tests')

// geometry
ok(dist({x:0,y:0},{x:3,y:4}) === 5, 'dist 3-4-5')
ok(polylineLength([{x:0,y:0},{x:3,y:4},{x:3,y:4}]) === 5, 'polyline length ignores zero seg')
ok(polygonArea([{x:0,y:0},{x:4,y:0},{x:4,y:3},{x:0,y:3}]) === 12, 'rectangle area 4x3=12')
ok(polygonArea([{x:0,y:0},{x:4,y:0}]) === 0, 'area of <3 points is 0')
ok(polygonPerimeter([{x:0,y:0},{x:4,y:0},{x:4,y:3},{x:0,y:3}]) === 14, 'rectangle perimeter 14')

// winding independence
const cw = [{x:0,y:0},{x:0,y:3},{x:4,y:3},{x:4,y:0}]
ok(polygonArea(cw) === 12, 'shoelace absolute (clockwise still 12)')

// calibration + measurement round-trip
// At renderScale 2 px/pt, a 200px reference = 100pt. If that is 50 m,
// then unitsPerPoint = 0.5 m/pt.
const upp = unitsPerPoint(200, 2, 50)
ok(near(upp, 0.5), 'unitsPerPoint 200px@2 =50m -> 0.5 m/pt')
// a 400px line at same scale = 200pt = 100 m
ok(near(pixelsToUnits(400, 2, upp), 100), 'pixelsToUnits 400px -> 100 m')
// zoom-independence: same real line rendered at scale 4 (800px) must read 100 m
ok(near(pixelsToUnits(800, 4, upp), 100), 'zoom-independent distance')
// area: a 100px x 100px square at scale 2 = 50pt x 50pt = 25m x 25m = 625 m²
ok(near(pixelAreaToUnits(100*100, 2, upp), 625), 'pixelAreaToUnits 100x100px -> 625 m2')

ok(pxToPoints(144, 2) === 72, 'pxToPoints 144@2 = 72')

// unit conversion
ok(near(convertLinear(1, 'm', 'mm'), 1000), '1 m = 1000 mm')
ok(near(convertLinear(1, 'ft', 'in'), 12), '1 ft = 12 in')
ok(near(convertLinear(1, 'mi', 'm'), 1609.344), '1 mi = 1609.344 m')
ok(near(convertArea(1, 'm', 'cm'), 10000), '1 m2 = 10000 cm2')
ok(near(convertArea(1, 'yd', 'ft'), 9), '1 yd2 = 9 ft2')
ok(areaUnitLabel('ft') === 'ft²', 'area label ft2')
ok(LINEAR_UNITS.length === 8, '8 linear units')

// error guards
let threw = false
try { unitsPerPoint(0, 2, 5) } catch { threw = true }
ok(threw, 'zero-length reference throws')
threw = false
try { pxToPoints(10, 0) } catch { threw = true }
ok(threw, 'zero renderScale throws')

// pretty rounding
ok(pretty(0) === 0, 'pretty(0)=0')
ok(pretty(123.456789, 4) === 123.5, 'pretty 4 sig figs')
ok(pretty(0.00123456, 3) === 0.00123, 'pretty small value')

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
