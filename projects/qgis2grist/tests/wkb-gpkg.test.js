/**
 * WKB GPKG — MultiSurface, courbes ISO (types 8–10)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function linearizeArc3(p0, p1, p2, segments = 12) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, mt = 1 - t;
    pts.push([
      mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
      mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
    ]);
  }
  return pts;
}

function linearizeCircularString(coords, segments = 12) {
  if (!coords?.length) return [];
  if (coords.length < 3) return coords.slice();
  const out = [];
  for (let i = 0; i + 2 < coords.length; i += 2) {
    const seg = linearizeArc3(coords[i], coords[i + 1], coords[i + 2], segments);
    if (!out.length) out.push(...seg);
    else out.push(...seg.slice(1));
  }
  return out;
}

function appendLineCoords(all, seg) {
  if (!seg?.length) return all;
  if (all.length) {
    const a = all[all.length - 1], b = seg[0];
    if (a[0] === b[0] && a[1] === b[1]) all.push(...seg.slice(1));
    else all.push(...seg);
  } else all.push(...seg);
  return all;
}

function curveGeomToLine(g) {
  if (!g) return [];
  if (g.type === 'LineString') return g.coordinates;
  if (g.type === 'CircularString') return linearizeCircularString(g.coordinates);
  return [];
}

class WkbReader {
  constructor(view, pos = 0) { this.v = view; this.p = pos; }
  u8() { return this.v.getUint8(this.p++); }
  u32() { const v = this.v.getUint32(this.p, this.le); this.p += 4; return v; }
  f64() { const v = this.v.getFloat64(this.p, this.le); this.p += 8; return v; }
  coord(z, m) {
    const x = this.f64(), y = this.f64();
    if (z) this.f64(); if (m) this.f64();
    return [x, y];
  }
  coords(n, z, m) { const a = []; for (let i = 0; i < n; i++) a.push(this.coord(z, m)); return a; }
  ring(z, m) { return this.coords(this.u32(), z, m); }
  geom() {
    this.le = this.u8() === 1;
    let t = this.u32();
    const ez = !!(t & 0x80000000), em = !!(t & 0x40000000), es = !!(t & 0x20000000);
    t &= 0x1FFFFFFF;
    let z = ez, m = em;
    if (t > 3000) { z = m = true; t -= 3000; }
    else if (t > 2000) { m = true; t -= 2000; }
    else if (t > 1000) { z = true; t -= 1000; }
    if (es) this.p += 4;
    switch (t) {
      case 1: return { type: 'Point', coordinates: this.coord(z, m) };
      case 2: return { type: 'LineString', coordinates: this.coords(this.u32(), z, m) };
      case 3: { const n = this.u32(), r = []; for (let i = 0; i < n; i++) r.push(this.ring(z, m)); return { type: 'Polygon', coordinates: r }; }
      case 5: { const n = this.u32(), a = []; for (let i = 0; i < n; i++) a.push(this.geom().coordinates); return { type: 'MultiLineString', coordinates: a }; }
      case 8: return { type: 'CircularString', coordinates: this.coords(this.u32(), z, m) };
      case 9: {
        const n = this.u32();
        let all = [];
        for (let i = 0; i < n; i++) all = appendLineCoords(all, curveGeomToLine(this.geom()));
        return { type: 'LineString', coordinates: all };
      }
      case 10: {
        const n = this.u32(), rings = [];
        for (let i = 0; i < n; i++) rings.push(curveGeomToLine(this.geom()));
        return { type: 'Polygon', coordinates: rings };
      }
      case 11: {
        const n = this.u32(), lines = [];
        for (let i = 0; i < n; i++) {
          const g = this.geom();
          if (g?.type === 'LineString') lines.push(g.coordinates);
          else if (g?.type === 'CircularString') {
            const line = linearizeCircularString(g.coordinates);
            if (line.length >= 2) lines.push(line);
          }
        }
        return lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines };
      }
      case 12: {
        const n = this.u32(), polys = [];
        for (let i = 0; i < n; i++) {
          const g = this.geom();
          if (g?.type === 'Polygon') polys.push(g.coordinates);
        }
        return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
      }
      default: return null;
    }
  }
}

function parseGpkgGeom(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.byteLength < 5) return null;
  let wkbStart = 0;
  if (view.getUint8(0) === 0x47 && view.getUint8(1) === 0x50) {
    const flags = view.getUint8(3);
    if ((flags >> 5) & 1) return null;
    const envType = (flags >> 1) & 7;
    wkbStart = 8 + [0, 32, 48, 48, 64][Math.min(envType, 4)];
  }
  return new WkbReader(view, wkbStart).geom();
}

function writeWkb(type, writeBody) {
  const parts = [new Uint8Array([1])]; // LE
  const typeBuf = new ArrayBuffer(4);
  new DataView(typeBuf).setUint32(0, type, true);
  parts.push(new Uint8Array(typeBuf));
  const body = writeBody();
  if (body) parts.push(body);
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function writeCoords(points) {
  const buf = new ArrayBuffer(4 + points.length * 16);
  const view = new DataView(buf);
  view.setUint32(0, points.length, true);
  let off = 4;
  for (const [x, y] of points) {
    view.setFloat64(off, x, true); off += 8;
    view.setFloat64(off, y, true); off += 8;
  }
  return new Uint8Array(buf);
}

describe('WKB courbes ISO', () => {
  it('CircularString (8) → linéarisé', () => {
    const wkb = writeWkb(8, () => writeCoords([[0, 0], [1, 2], [2, 0]]));
    const g = new WkbReader(new DataView(wkb.buffer)).geom();
    assert.equal(g.type, 'CircularString');
    const line = linearizeCircularString(g.coordinates);
    assert.ok(line.length >= 3);
    assert.equal(line[0][0], 0);
    assert.equal(line[line.length - 1][0], 2);
  });

  it('CompoundCurve (9) → LineString', () => {
    const lineWkb = writeWkb(2, () => writeCoords([[0, 0], [1, 0]]));
    const circWkb = writeWkb(8, () => writeCoords([[1, 0], [2, 1], [3, 0]]));
    const body = new Uint8Array(4 + lineWkb.length + circWkb.length);
    new DataView(body.buffer).setUint32(0, 2, true);
    body.set(lineWkb, 4);
    body.set(circWkb, 4 + lineWkb.length);
    const wkb = writeWkb(9, () => body);
    const g = new WkbReader(new DataView(wkb.buffer)).geom();
    assert.equal(g.type, 'LineString');
    assert.ok(g.coordinates.length >= 4);
  });

  it('CurvePolygon (10) → Polygon', () => {
    const ringWkb = writeWkb(2, () => writeCoords([[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]));
    const body = new Uint8Array(4 + ringWkb.length);
    new DataView(body.buffer).setUint32(0, 1, true);
    body.set(ringWkb, 4);
    const wkb = writeWkb(10, () => body);
    const g = new WkbReader(new DataView(wkb.buffer)).geom();
    assert.equal(g.type, 'Polygon');
    assert.equal(g.coordinates[0].length, 5);
  });
});

describe('WKB GPKG QField', () => {
  it('MultiSurface batiments → Polygon', () => {
    const py = path.join(__dirname, 'extract_gpkg_blob.py');
    if (!fs.existsSync(py)) {
      fs.writeFileSync(py, `import zipfile,sqlite3,tempfile,os,sys
z=zipfile.ZipFile(sys.argv[1])
path=tempfile.mktemp(suffix='.gpkg')
open(path,'wb').write(z.read(sys.argv[2]))
conn=sqlite3.connect(path)
blob=conn.execute('SELECT geom FROM batiments_4eme LIMIT 1').fetchone()[0]
sys.stdout.buffer.write(blob)
conn.close(); os.unlink(path)
`);
    }
    const zip = path.join(__dirname, 'fixtures', 'qgis2grist_marseille4e_qfield.zip');
    const blob = execFileSync('python', [py, zip, 'data/batiments_4eme.gpkg']);
    const geom = parseGpkgGeom(blob);
    assert.ok(geom);
    assert.equal(geom.type, 'Polygon');
    assert.ok(Array.isArray(geom.coordinates[0][0]));
    assert.ok(Number.isFinite(geom.coordinates[0][0][0]));
  });
});
