/**
 * Q2GGeometry - tests unitaires du module de geometrie pure.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../lib/q2g-geometry.js');

function wkb(parts, le = true) {
  // parts : liste de ['u8'|'u32'|'f64', valeur]
  const size = parts.reduce((s, p) => s + (p[0] === 'u8' ? 1 : p[0] === 'u32' ? 4 : 8), 0);
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  let o = 0;
  for (const [t, x] of parts) {
    if (t === 'u8') { v.setUint8(o, x); o += 1; }
    else if (t === 'u32') { v.setUint32(o, x, le); o += 4; }
    else { v.setFloat64(o, x, le); o += 8; }
  }
  return buf;
}

describe('Q2GGeometry - exports', () => {
  it('expose les fonctions attendues', () => {
    for (const n of ['linearizeArc3', 'linearizeCircularString', 'appendLineCoords', 'curveGeomToLine',
      'WkbReader', 'parseGpkgGeom', 'reprojectGeom', 'flattenCoords2D', 'getPointCoords', 'computeCentroid']) {
      assert.ok(G[n], n);
    }
  });
});

describe('Q2GGeometry - WKB', () => {
  it('Point standard little-endian', () => {
    const b = wkb([['u8', 1], ['u32', 1], ['f64', 5.4], ['f64', 43.3]]);
    assert.deepEqual(G.parseGpkgGeom(new Uint8Array(b)), { type: 'Point', coordinates: [5.4, 43.3] });
  });
  it('Point big-endian', () => {
    const b = wkb([['u8', 0], ['u32', 1], ['f64', 1.5], ['f64', 2.5]], false);
    assert.deepEqual(G.parseGpkgGeom(b), { type: 'Point', coordinates: [1.5, 2.5] });
  });
  it('Point ISO Z (1001) : Z ignore', () => {
    const b = wkb([['u8', 1], ['u32', 1001], ['f64', 1], ['f64', 2], ['f64', 99]]);
    assert.deepEqual(G.parseGpkgGeom(b), { type: 'Point', coordinates: [1, 2] });
  });
  it('Point EWKB avec SRID et drapeau Z', () => {
    const b = wkb([['u8', 1], ['u32', (0x80000000 | 0x20000000 | 1) >>> 0], ['u32', 4326],
      ['f64', 3], ['f64', 4], ['f64', 5]]);
    assert.deepEqual(G.parseGpkgGeom(b), { type: 'Point', coordinates: [3, 4] });
  });
  it('LineString', () => {
    const b = wkb([['u8', 1], ['u32', 2], ['u32', 2], ['f64', 0], ['f64', 0], ['f64', 1], ['f64', 1]]);
    assert.deepEqual(G.parseGpkgGeom(b), { type: 'LineString', coordinates: [[0, 0], [1, 1]] });
  });
  it('Polygon', () => {
    const b = wkb([['u8', 1], ['u32', 3], ['u32', 1], ['u32', 4],
      ['f64', 0], ['f64', 0], ['f64', 1], ['f64', 0], ['f64', 1], ['f64', 1], ['f64', 0], ['f64', 0]]);
    const g = G.parseGpkgGeom(b);
    assert.equal(g.type, 'Polygon');
    assert.equal(g.coordinates[0].length, 4);
  });
  it('CompoundCurve (9) -> LineString', () => {
    const line = [['u8', 1], ['u32', 2], ['u32', 2], ['f64', 0], ['f64', 0], ['f64', 1], ['f64', 1]];
    const b = wkb([['u8', 1], ['u32', 9], ['u32', 1], ...line]);
    assert.deepEqual(G.parseGpkgGeom(b), { type: 'LineString', coordinates: [[0, 0], [1, 1]] });
  });
  it('MultiSurface (12) a un seul polygone -> Polygon', () => {
    const poly = [['u8', 1], ['u32', 3], ['u32', 1], ['u32', 4],
      ['f64', 0], ['f64', 0], ['f64', 1], ['f64', 0], ['f64', 1], ['f64', 1], ['f64', 0], ['f64', 0]];
    const b = wkb([['u8', 1], ['u32', 12], ['u32', 1], ...poly]);
    assert.equal(G.parseGpkgGeom(b).type, 'Polygon');
  });
  it('type inconnu, blob invalide ou trop court -> null', () => {
    assert.equal(G.parseGpkgGeom(wkb([['u8', 1], ['u32', 99]])), null);
    assert.equal(G.parseGpkgGeom('x'), null);
    assert.equal(G.parseGpkgGeom(new Uint8Array(3)), null);
  });
  it('en-tete GeoPackage : enveloppe sautee, drapeau vide -> null', () => {
    const point = [['u8', 1], ['u32', 1], ['f64', 7], ['f64', 8]];
    const head = new Uint8Array(8 + 32);
    head[0] = 0x47; head[1] = 0x50; head[3] = 1 << 1; // envType 1 : 32 octets
    const pt = new Uint8Array(wkb(point));
    const blob = new Uint8Array(head.length + pt.length);
    blob.set(head); blob.set(pt, head.length);
    assert.deepEqual(G.parseGpkgGeom(blob), { type: 'Point', coordinates: [7, 8] });
    const vide = new Uint8Array(blob); vide[3] |= 1 << 5;
    assert.equal(G.parseGpkgGeom(vide), null);
  });
  it('Uint8Array avec byteOffset (vue sur un buffer plus grand)', () => {
    const pt = new Uint8Array(wkb([['u8', 1], ['u32', 1], ['f64', 1], ['f64', 2]]));
    const big = new Uint8Array(pt.length + 10); big.set(pt, 10);
    assert.deepEqual(G.parseGpkgGeom(big.subarray(10)), { type: 'Point', coordinates: [1, 2] });
  });
});

describe('Q2GGeometry - courbes', () => {
  it('linearizeArc3 : segments+1 points, extremites conservees', () => {
    const pts = G.linearizeArc3([0, 0], [1, 1], [2, 0], 4);
    assert.equal(pts.length, 5);
    assert.deepEqual(pts[0], [0, 0]);
    assert.deepEqual(pts[4], [2, 0]);
  });
  it('linearizeCircularString : cas limites et jonction', () => {
    assert.deepEqual(G.linearizeCircularString([]), []);
    assert.deepEqual(G.linearizeCircularString([[0, 0], [1, 1]]), [[0, 0], [1, 1]]);
    const out = G.linearizeCircularString([[0, 0], [1, 1], [2, 0], [3, -1], [4, 0]], 2);
    assert.equal(out.length, 5); // 3 + 3 - 1 point commun
  });
  it('appendLineCoords : fusionne un point commun', () => {
    assert.deepEqual(G.appendLineCoords([[0, 0], [1, 1]], [[1, 1], [2, 2]]), [[0, 0], [1, 1], [2, 2]]);
    assert.deepEqual(G.appendLineCoords([[0, 0]], [[5, 5]]), [[0, 0], [5, 5]]);
    assert.deepEqual(G.appendLineCoords([], [[5, 5]]), [[5, 5]]);
  });
  it('curveGeomToLine', () => {
    assert.deepEqual(G.curveGeomToLine(null), []);
    assert.deepEqual(G.curveGeomToLine({ type: 'Point', coordinates: [0, 0] }), []);
    assert.deepEqual(G.curveGeomToLine({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }), [[0, 0], [1, 1]]);
  });
});

describe('Q2GGeometry - reprojection', () => {
  it('retourne tel quel pour EPSG:4326, meme CRS ou geometrie nulle', () => {
    const g = { type: 'Point', coordinates: [1, 2] };
    assert.equal(G.reprojectGeom(g, null, 'EPSG:4326', 'EPSG:4326'), g);
    assert.equal(G.reprojectGeom(g, null, 'EPSG:2154', 'EPSG:2154'), g);
    assert.equal(G.reprojectGeom(null, null, 'EPSG:3857', 'EPSG:4326'), null);
  });
  it('EPSG:3857 natif sans proj4', () => {
    const g = G.reprojectGeom({ type: 'Point', coordinates: [0, 0] }, null, 'EPSG:3857', 'EPSG:4326');
    assert.ok(Math.abs(g.coordinates[0]) < 1e-9 && Math.abs(g.coordinates[1]) < 1e-9);
    const h = G.reprojectGeom({ type: 'Point', coordinates: [20037508.34, 0] }, null, 'EPSG:3857', 'EPSG:4326');
    assert.ok(Math.abs(h.coordinates[0] - 180) < 1e-6);
  });
  it('proj4 injecte, imbrique et GeometryCollection', () => {
    const calls = [];
    const fake = (from, to, c) => { calls.push([from, to]); return [c[0] + 1, c[1] + 1]; };
    const poly = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] };
    const r = G.reprojectGeom(poly, fake, 'EPSG:2154', 'EPSG:4326');
    assert.deepEqual(r.coordinates[0][0], [1, 1]);
    const gc = G.reprojectGeom({ type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [0, 0] }] },
      fake, 'EPSG:2154', 'EPSG:4326');
    assert.deepEqual(gc.geometries[0].coordinates, [1, 1]);
    assert.equal(calls[0][0], 'EPSG:2154');
  });
  it('proj4 null : coordonnees inchangees ; entree non mutee', () => {
    const g = { type: 'Point', coordinates: [10, 20] };
    const r = G.reprojectGeom(g, null, 'EPSG:2154', 'EPSG:4326');
    assert.deepEqual(r.coordinates, [10, 20]);
    assert.notEqual(r, g);
  });
});

describe('Q2GGeometry - aplatissement, point, centroide', () => {
  it('flattenCoords2D retire Z/M a tous niveaux', () => {
    const g = { type: 'LineString', coordinates: [[1, 2, 3], [4, 5, 6, 7]] };
    assert.deepEqual(G.flattenCoords2D(g).coordinates, [[1, 2], [4, 5]]);
    const p = { type: 'Polygon', coordinates: [[[1, 2, 3], [4, 5, 6]]] };
    assert.deepEqual(G.flattenCoords2D(p).coordinates, [[[1, 2], [4, 5]]]);
    assert.equal(G.flattenCoords2D(null), null);
  });
  it('getPointCoords', () => {
    assert.deepEqual(G.getPointCoords({ type: 'Point', coordinates: [1, 2] }), [1, 2]);
    assert.deepEqual(G.getPointCoords({ type: 'MultiPoint', coordinates: [[3, 4], [5, 6]] }), [3, 4]);
    assert.equal(G.getPointCoords({ type: 'MultiPoint', coordinates: [] }), null);
    assert.equal(G.getPointCoords({ type: 'LineString', coordinates: [[0, 0]] }), null);
    assert.equal(G.getPointCoords(null), null);
  });
  it('computeCentroid : moyenne des sommets', () => {
    assert.deepEqual(G.computeCentroid({ type: 'LineString', coordinates: [[0, 0], [2, 4]] }), [1, 2]);
    assert.deepEqual(G.computeCentroid({ type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4]]] }), [2, 2]);
    assert.equal(G.computeCentroid(null), null);
    assert.equal(G.computeCentroid({ type: 'LineString', coordinates: [] }), null);
  });
});
