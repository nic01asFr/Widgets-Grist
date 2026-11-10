/**
 * Q2GGeometry - geometrie pure (aucun DOM, aucune dependance de chargement).
 *
 * - Lecture WKB / EWKB / ISO Z-M-ZM et blobs GeoPackage (WkbReader, parseGpkgGeom)
 * - Linearisation des courbes (CircularString, CompoundCurve, CurvePolygon...)
 * - Reprojection (EPSG:3857 natif ; proj4 injecte pour les autres CRS)
 * - Aplatissement 2D, coordonnees de point, centroide
 *
 * Dependance injectee : proj4 (fonction proj4(from, to, [x, y])) passee en
 * parametre de reprojectGeom. Si le parametre vaut undefined, repli sur le
 * global proj4 quand il existe ; si null, aucune reprojection hors 3857
 * (comportement d'origine : degradation gracieuse).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Q2GGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Linearise un arc (triplet start-mid-end) en LineString
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
    if (coords.length % 2 === 0) {
      const last = coords[coords.length - 1];
      const prev = out[out.length - 1];
      if (!prev || prev[0] !== last[0] || prev[1] !== last[1]) out.push(last);
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
    u8()  { return this.v.getUint8(this.p++); }
    u32() { const v = this.v.getUint32(this.p, this.le); this.p += 4; return v; }
    f64() { const v = this.v.getFloat64(this.p, this.le); this.p += 8; return v; }
    coord(z, m) {
      const x = this.f64(), y = this.f64();
      if (z) this.f64();
      if (m) this.f64();
      return [x, y];
    }
    coords(n, z, m) { const a = []; for (let i = 0; i < n; i++) a.push(this.coord(z, m)); return a; }
    ring(z, m)      { return this.coords(this.u32(), z, m); }
    geom() {
      this.le = this.u8() === 1;
      let t = this.u32();
      // Drapeaux EWKB (PostGIS)
      const ez = !!(t & 0x80000000), em = !!(t & 0x40000000), es = !!(t & 0x20000000);
      t &= 0x1FFFFFFF;
      // Variantes ISO SQL/MM Z, M, ZM
      let z = ez, m = em;
      if      (t > 3000) { z = m = true; t -= 3000; }
      else if (t > 2000) { m = true;     t -= 2000; }
      else if (t > 1000) { z = true;     t -= 1000; }
      if (es) this.p += 4; // SRID embarque ignore
      switch (t) {
        case 1: return { type: 'Point',       coordinates: this.coord(z, m) };
        case 2: return { type: 'LineString',  coordinates: this.coords(this.u32(), z, m) };
        case 3: { const n = this.u32(), r = []; for (let i = 0; i < n; i++) r.push(this.ring(z, m));
                  return { type: 'Polygon', coordinates: r }; }
        case 4: { const n = this.u32(), a = []; for (let i = 0; i < n; i++) a.push(this.geom().coordinates);
                  return { type: 'MultiPoint', coordinates: a }; }
        case 5: { const n = this.u32(), a = []; for (let i = 0; i < n; i++) a.push(this.geom().coordinates);
                  return { type: 'MultiLineString', coordinates: a }; }
        case 6: { const n = this.u32(), a = []; for (let i = 0; i < n; i++) a.push(this.geom().coordinates);
                  return { type: 'MultiPolygon', coordinates: a }; }
        case 7: { const n = this.u32(), a = []; for (let i = 0; i < n; i++) a.push(this.geom());
                  return { type: 'GeometryCollection', geometries: a }; }
        case 8: { // CircularString
          const coords = this.coords(this.u32(), z, m);
          return { type: 'CircularString', coordinates: coords };
        }
        case 9: { // CompoundCurve -> LineString
          const n = this.u32();
          let all = [];
          for (let i = 0; i < n; i++) all = appendLineCoords(all, curveGeomToLine(this.geom()));
          if (all.length < 2) return null;
          return { type: 'LineString', coordinates: all };
        }
        case 10: { // CurvePolygon -> Polygon
          const n = this.u32(), rings = [];
          for (let i = 0; i < n; i++) rings.push(curveGeomToLine(this.geom()));
          if (!rings.length || !rings[0].length) return null;
          return { type: 'Polygon', coordinates: rings };
        }
        // ISO SQL/MM - frequent dans les GPKG QField (MULTICURVE / MULTISURFACE)
        case 11: { // MultiCurve -> MultiLineString
          const n = this.u32(), lines = [];
          for (let i = 0; i < n; i++) {
            const g = this.geom();
            if (!g) continue;
            if (g.type === 'LineString') lines.push(g.coordinates);
            else if (g.type === 'MultiLineString') lines.push(...g.coordinates);
            else if (g.type === 'CircularString') {
              const line = linearizeCircularString(g.coordinates);
              if (line.length >= 2) lines.push(line);
            }
          }
          if (!lines.length) return null;
          if (lines.length === 1) return { type: 'LineString', coordinates: lines[0] };
          return { type: 'MultiLineString', coordinates: lines };
        }
        case 12: { // MultiSurface -> MultiPolygon / Polygon
          const n = this.u32(), polys = [];
          for (let i = 0; i < n; i++) {
            const g = this.geom();
            if (!g) continue;
            if (g.type === 'Polygon') polys.push(g.coordinates);
            else if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
          }
          if (!polys.length) return null;
          if (polys.length === 1) return { type: 'Polygon', coordinates: polys[0] };
          return { type: 'MultiPolygon', coordinates: polys };
        }
        default: return null;
      }
    }
  }

  // Parse un blob GPKG (en-tete GP + enveloppe optionnelle + WKB)
  function parseGpkgGeom(blob) {
    let ab;
    if (blob instanceof Uint8Array)  ab = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength);
    else if (blob instanceof ArrayBuffer) ab = blob;
    else return null;
    const view = new DataView(ab);
    if (view.byteLength < 5) return null;
    let wkbStart = 0;
    if (view.getUint8(0) === 0x47 && view.getUint8(1) === 0x50) { // magic 'GP'
      const flags   = view.getUint8(3);
      if ((flags >> 5) & 1) return null; // drapeau geometrie vide
      const envType = (flags >> 1) & 7;
      wkbStart = 8 + [0, 32, 48, 48, 64][Math.min(envType, 4)];
    }
    try { const r = new WkbReader(view, wkbStart); return r.geom(); } catch (e) { return null; }
  }

  // Reprojection : EPSG:3857 natif, proj4 injecte sinon.
  // proj4fn : fonction proj4(from, to, [x, y]) ; undefined => global proj4 s'il existe ;
  // null => pas de reprojection hors 3857.
  function reprojectGeom(geom, proj4fn, from, to) {
    if (!geom || from === to || from === 'EPSG:4326') return geom;
    if (proj4fn === undefined && typeof proj4 !== 'undefined') proj4fn = proj4; // eslint-disable-line no-undef
    function reproj(c) {
      if (from === 'EPSG:3857') { // Web Mercator -> WGS84 (pas besoin de proj4)
        const R = 6378137;
        return [c[0] / R * (180 / Math.PI), (2 * Math.atan(Math.exp(c[1] / R)) - Math.PI / 2) * (180 / Math.PI)];
      }
      return proj4fn ? proj4fn(from, to, [c[0], c[1]]) : c;
    }
    function walk(c) {
      if (!Array.isArray(c)) return c;
      return typeof c[0] === 'number' ? reproj(c) : c.map(walk);
    }
    if (geom.type === 'GeometryCollection')
      return { ...geom, geometries: geom.geometries.map(g => reprojectGeom(g, proj4fn, from, to)) };
    return { ...geom, coordinates: walk(geom.coordinates) };
  }

  /** Retire Z/M des coordonnees (QGIS -> MapLibre). */
  function flattenCoords2D(geom) {
    if (!geom?.coordinates) return geom;
    function walk(c) {
      if (typeof c[0] === 'number') return [c[0], c[1]];
      return c.map(walk);
    }
    return { type: geom.type, coordinates: walk(geom.coordinates) };
  }

  function getPointCoords(geom) {
    if (!geom) return null;
    if (geom.type === 'Point') return geom.coordinates;
    if (geom.type === 'MultiPoint' && geom.coordinates.length) return geom.coordinates[0];
    return null;
  }

  function computeCentroid(geom) {
    if (!geom) return null;
    try {
      let coords = [];
      function collectCoords(c) {
        if (typeof c[0] === 'number') { coords.push(c); }
        else c.forEach(collectCoords);
      }
      collectCoords(geom.coordinates);
      if (!coords.length) return null;
      const lon = coords.reduce((s, c) => s + c[0], 0) / coords.length;
      const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
      return [lon, lat];
    } catch (e) { return null; }
  }

  return {
    linearizeArc3,
    linearizeCircularString,
    appendLineCoords,
    curveGeomToLine,
    WkbReader,
    parseGpkgGeom,
    reprojectGeom,
    flattenCoords2D,
    getPointCoords,
    computeCentroid,
  };
});
