/**
 * Aides de test : fabrique un GeoPackage synthetique avec node:sqlite, et un adaptateur
 * qui reproduit l'interface de sql.js (new SQL.Database(u8), exec, close) au dessus.
 * Pas un test (ne se termine pas par .test.js).
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) { /* Node < 22 */ }

let _seq = 0;

/** Adaptateur sql.js -> node:sqlite. `compteur` (optionnel) recoit les requetes executees. */
function makeFakeSql(compteur) {
  return {
    Database: class {
      constructor(u8) {
        this.file = path.join(os.tmpdir(), `q2g-synth-${process.pid}-${_seq++}.gpkg`);
        fs.writeFileSync(this.file, u8);
        this.db = new DatabaseSync(this.file);
        this.closed = false;
        if (compteur) compteur.ouvertes = (compteur.ouvertes || 0) + 1;
      }
      exec(sql) {
        if (this.closed) throw new Error('Database closed');
        if (compteur) (compteur.requetes = compteur.requetes || []).push(sql);
        const stmt = this.db.prepare(sql);
        const cols = stmt.columns().map(c => c.name);
        const rows = stmt.all();
        if (!cols.length || !rows.length) return [];
        return [{ columns: cols, values: rows.map(r => cols.map(c => r[c])) }];
      }
      close() {
        if (this.closed) return;
        this.closed = true;
        if (compteur) compteur.fermees = (compteur.fermees || 0) + 1;
        try { this.db.close(); } catch (e) {}
        try { fs.unlinkSync(this.file); } catch (e) {}
      }
    },
  };
}

function wkbPolygon(ring) {
  const b = Buffer.alloc(1 + 4 + 4 + 4 + ring.length * 16);
  let o = 0;
  b.writeUInt8(1, o); o += 1;
  b.writeUInt32LE(3, o); o += 4;
  b.writeUInt32LE(1, o); o += 4;
  b.writeUInt32LE(ring.length, o); o += 4;
  for (const [x, y] of ring) { b.writeDoubleLE(x, o); o += 8; b.writeDoubleLE(y, o); o += 8; }
  return b;
}

function wkbPoint(x, y) {
  const b = Buffer.alloc(1 + 4 + 16);
  b.writeUInt8(1, 0); b.writeUInt32LE(1, 1); b.writeDoubleLE(x, 5); b.writeDoubleLE(y, 13);
  return b;
}

function gpkgBlob(wkb, srsId) {
  const h = Buffer.alloc(8);
  h.write('GP', 0, 'latin1'); h.writeUInt8(0, 2); h.writeUInt8(1, 3); h.writeInt32LE(srsId, 4);
  return Buffer.concat([h, wkb]);
}

function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

/**
 * Cree un GeoPackage et renvoie son ArrayBuffer.
 * opts : { table, rows, vertices (0 = points), srs, withoutRowid, nullGeomEvery,
 * colonneGuillemet (false : colonne 'note' au lieu de 'colonne "x"') }
 */
function makeSyntheticGpkg(opts) {
  if (!DatabaseSync) throw new Error('node:sqlite indisponible');
  const o = Object.assign({ table: 'zones', rows: 1000, vertices: 12, srs: 4326, withoutRowid: false, nullGeomEvery: 0 }, opts);
  const file = path.join(os.tmpdir(), `q2g-synth-build-${process.pid}-${_seq++}.gpkg`);
  const db = new DatabaseSync(file);
  const typeGeom = o.vertices > 0 ? 'POLYGON' : 'POINT';
  const T = `"${String(o.table).replace(/"/g, '""')}"`;
  const COL = o.colonneGuillemet === false ? 'note' : '"colonne ""x"""';
  db.exec(`
    CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT, srs_id INTEGER PRIMARY KEY, organization TEXT,
      organization_coordsys_id INTEGER, definition TEXT, description TEXT);
    INSERT INTO gpkg_spatial_ref_sys VALUES ('WGS 84', 4326, 'EPSG', 4326, 'GEOGCS["WGS 84"]', 'WGS 84');
    CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY, data_type TEXT, identifier TEXT, description TEXT,
      last_change DATETIME, min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER);
    CREATE TABLE gpkg_geometry_columns (table_name TEXT PRIMARY KEY, column_name TEXT, geometry_type_name TEXT,
      srs_id INTEGER, z TINYINT, m TINYINT);
    CREATE TABLE ${T} (fid INTEGER PRIMARY KEY, geom BLOB, nom TEXT, valeur REAL, rang INTEGER, ${COL} TEXT)${o.withoutRowid ? ' WITHOUT ROWID' : ''};
  `);
  db.prepare(`INSERT INTO gpkg_contents VALUES (?, 'features', ?, '', '2026-01-01', 0, 0, 1, 1, ?)`).run(o.table, o.table, o.srs);
  db.prepare(`INSERT INTO gpkg_geometry_columns VALUES (?, 'geom', ?, ?, 0, 0)`).run(o.table, typeGeom, o.srs);
  const ins = db.prepare(`INSERT INTO ${T} (fid, geom, nom, valeur, rang, ${COL}) VALUES (?, ?, ?, ?, ?, ?)`);
  const r = rng(11);
  db.exec('BEGIN');
  for (let i = 1; i <= o.rows; i++) {
    let blob = null;
    if (!(o.nullGeomEvery && i % o.nullGeomEvery === 0)) {
      if (o.vertices > 0) {
        const cx = 5 + r(); const cy = 43 + r();
        const ring = [];
        for (let k = 0; k < o.vertices - 1; k++) {
          const a = (k / (o.vertices - 1)) * Math.PI * 2;
          ring.push([cx + Math.cos(a) * 0.001, cy + Math.sin(a) * 0.001]);
        }
        ring.push(ring[0]);
        blob = gpkgBlob(wkbPolygon(ring), o.srs);
      } else {
        blob = gpkgBlob(wkbPoint(5 + r(), 43 + r()), o.srs);
      }
    }
    ins.run(i * 2, blob, i % 13 === 0 ? null : 'Zone ' + i, r() * 100, i, i % 5 === 0 ? 'à "citer"' : 'x');
  }
  db.exec('COMMIT');
  db.close();
  const buf = fs.readFileSync(file);
  try { fs.unlinkSync(file); } catch (e) {}
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

module.exports = { DatabaseSync, makeFakeSql, makeSyntheticGpkg, wkbPolygon, wkbPoint, gpkgBlob, rng };
