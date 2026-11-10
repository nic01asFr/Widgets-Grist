/**
 * Tests de lib/q2g-gpkg.js et lib/q2g-loaders.js.
 * sql.js n'est pas disponible en local : un adaptateur au-dessus de node:sqlite
 * (SQLite reel) reproduit l'interface sql.js (new SQL.Database(u8), exec, close).
 * La geometrie, proj4, QGS et DOMParser sont injectes sous forme de doublures.
 *
 * node --test projects/qgis2grist/tests/q2g-gpkg.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) { /* Node < 22 */ }
const SKIP_SQLITE = DatabaseSync ? false : 'node:sqlite indisponible';

const Q2GGpkg = require('../lib/q2g-gpkg.js');
const Q2GLoaders = require('../lib/q2g-loaders.js');
const FIX = path.join(__dirname, 'fixtures');

// --- Adaptateur sql.js -> node:sqlite -------------------------------------
let _seq = 0;
const FakeSQL = {
  Database: class {
    constructor(u8) {
      this.file = path.join(os.tmpdir(), `q2g-gpkg-test-${process.pid}-${_seq++}.gpkg`);
      fs.writeFileSync(this.file, u8);
      this.db = new DatabaseSync(this.file);
    }
    exec(sql) {
      const stmt = this.db.prepare(sql);
      const cols = stmt.columns().map(c => c.name);
      const rows = stmt.all();
      if (!cols.length || !rows.length) return [];
      return [{ columns: cols, values: rows.map(r => cols.map(c => r[c])) }];
    }
    close() { try { this.db.close(); } catch (e) {} try { fs.unlinkSync(this.file); } catch (e) {} }
  },
};

const readFix = (n) => { const b = fs.readFileSync(path.join(FIX, n)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

// --- Doublures -------------------------------------------------------------
// Decode un point WKB (little endian) derriere un en-tete GPKG ; sinon renvoie un marqueur.
const geometryStub = {
  parseGpkgGeom(blob) {
    const u8 = new Uint8Array(blob);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let o = 0; // WKB brut (fixture demo) ou blob GPKG avec en-tete GP
    if (u8[0] === 0x47 && u8[1] === 0x50) o = 8 + [0, 32, 48, 48, 64][Math.min((u8[3] >> 1) & 7, 4)];
    if ((dv.getUint32(o + 1, true) & 0xff) === 1) return { type: 'Point', coordinates: [dv.getFloat64(o + (dv.getUint32(o + 1, true) & 0x20000000 ? 9 : 5), true), dv.getFloat64(o + (dv.getUint32(o + 1, true) & 0x20000000 ? 17 : 13), true)] };
    return { type: 'Opaque', coordinates: [] };
  },
  reprojectGeom(geom, proj4fn, from, to) {
    if (!geom || geom.type !== 'Point') return geom;
    const c = proj4fn ? proj4fn(from, to, geom.coordinates) : geom.coordinates;
    return { ...geom, coordinates: c };
  },
  buildLayerFromGeojson(name, gj) {
    const keys = gj.features.length ? Object.keys(gj.features[0].properties) : [];
    return { name, features: gj.features, fields: keys.map(k => ({ name: k, label: k, _rawKey: k, gType: 'Text' })) };
  },
};

function mkDeps(extra) {
  const log = []; const warns = [];
  const deps = Object.assign({
    SQL: FakeSQL,
    geometry: geometryStub,
    qgs: { parseAliases: () => ({}), parseEditWidgets: () => ({}), enrichFieldFromWidget() {} },
    parseQmlStyle: (q) => ({ qml: String(q).length }),
    onProgress: (l, d) => log.push([l, d]),
    logger: { warn: (...a) => warns.push(a) },
  }, extra || {});
  return { deps, log, warns };
}

describe('Q2GGpkg - fonctions pures', () => {
  it('exporte les noms attendus', () => {
    for (const n of ['openSqlJs', 'buildCrsContext', '_sqlEsc', '_gpkgTableExists', 'readGpkgFieldEnrichments',
      'readGpkgEmbeddedQgsLayer', 'applyGpkgEnrichments', 'parseGpkgFile', 'readGpkgWithSqlJs', 'create', 'configure'])
      assert.equal(typeof Q2GGpkg[n], 'function', n);
  });
  it('_sqlEsc double les apostrophes', () => {
    assert.equal(Q2GGpkg._sqlEsc("l'arbre"), "l''arbre");
    assert.equal(Q2GGpkg._sqlEsc(12), '12');
  });
  it('_gpkgTableExists tolere un db qui leve', () => {
    assert.equal(Q2GGpkg._gpkgTableExists({ exec() { throw new Error('x'); } }, 't'), false);
    assert.equal(Q2GGpkg._gpkgTableExists({ exec: () => [] }, 't'), false);
    assert.equal(Q2GGpkg._gpkgTableExists({ exec: () => [{ values: [[1]] }] }, 't'), true);
  });
  it('openSqlJs sans sql.js leve une erreur explicite', async () => {
    const g = Q2GGpkg.create({});
    await assert.rejects(() => g.openSqlJs(new ArrayBuffer(1)), /sql\.js non disponible/);
  });
  it('readGpkgFieldEnrichments : enum, range, title prioritaire', () => {
    const rows = {
      gpkg_data_columns: [['a', 'nom_a', 'Titre A', 'desc A', 'c1'], ['b', 'nom_b', null, null, 'c2'], ['c', null, null, null, null]],
      gpkg_data_column_constraints: { c1: [['enum', 'x'], ['enum', 'y'], ['enum', null]], c2: [['range', null]] },
    };
    const db = {
      exec(sql) {
        if (/sqlite_master/.test(sql)) return [{ values: [[1]] }];
        if (/FROM gpkg_data_columns/.test(sql)) return [{ values: rows.gpkg_data_columns }];
        const m = sql.match(/constraint_name='([^']*)'/);
        return [{ values: rows.gpkg_data_column_constraints[m[1]] }];
      },
    };
    const out = Q2GGpkg.readGpkgFieldEnrichments(db, 't');
    assert.deepEqual(out.a, { label: 'Titre A', description: 'desc A', choices: ['x', 'y'] });
    assert.deepEqual(out.b, { label: 'nom_b', _isRange: true });
    assert.deepEqual(out.c, {});
  });
  it('readGpkgFieldEnrichments sans gpkg_data_columns renvoie {}', () => {
    assert.deepEqual(Q2GGpkg.readGpkgFieldEnrichments({ exec: () => [] }, 't'), {});
  });
  it('applyGpkgEnrichments : alias QGS, widget, puis data_columns prioritaire', () => {
    const calls = [];
    const { deps } = mkDeps({
      qgs: { parseAliases: () => ({}), parseEditWidgets: () => ({}), enrichFieldFromWidget: (f, w) => calls.push([f.name, w]) },
    });
    const g = Q2GGpkg.create(deps);
    // db factice : data_columns presentes, qgis_projects absent
    const db = {
      exec(sql) {
        if (/sqlite_master/.test(sql)) return /gpkg_data_columns/.test(sql) && !/constraints/.test(sql) ? [{ values: [[1]] }] : [];
        return [{ values: [['k', 'n', 'Libelle', 'Desc', null]] }];
      },
    };
    const layer = { fields: [{ name: 'k', label: 'k', _rawKey: 'k', gType: 'Text' }, { name: 'z', label: 'z', gType: 'Text' }] };
    g.applyGpkgEnrichments(layer, db, 't');
    assert.equal(layer.fields[0].label, 'Libelle');
    assert.equal(layer.fields[0].description, 'Desc');
    assert.equal(layer.fields[1].label, 'z');
    assert.equal(calls.length, 0);
  });
  it('readGpkgEmbeddedQgsLayer : alias/widgets via QGS et DOMParser injectes', () => {
    const ml = { querySelector: (s) => (s === 'datasource' ? { textContent: './a.gpkg|layername=area' } : { textContent: 'Area' }) };
    class FakeDP { parseFromString() { return { querySelectorAll: () => [ml] }; } }
    const { deps } = mkDeps({
      DOMParser: FakeDP,
      qgs: { parseAliases: (m) => (m === ml ? { f: 'Champ' } : {}), parseEditWidgets: () => ({ f: { type: 'T' } }), enrichFieldFromWidget() {} },
    });
    const g = Q2GGpkg.create(deps);
    const db = { exec: (sql) => (/sqlite_master/.test(sql) ? [{ values: [[1]] }] : [{ values: [['<qgis/>']] }]) };
    assert.deepEqual(g.readGpkgEmbeddedQgsLayer(db, 'area'), { aliases: { f: 'Champ' }, widgets: { f: { type: 'T' } } });
    assert.equal(g.readGpkgEmbeddedQgsLayer(db, 'autre_table_inexistante_zz'), null);
    assert.equal(g.readGpkgEmbeddedQgsLayer({ exec: () => [] }, 'area'), null);
  });
});

describe('Q2GGpkg - sur vrais GeoPackages (node:sqlite)', { skip: SKIP_SQLITE }, () => {
  it('buildCrsContext : 4326 ne charge pas proj4', async () => {
    let loaded = 0;
    const { deps } = mkDeps({ loadProj4: async () => { loaded++; return null; } });
    const g = Q2GGpkg.create(deps);
    const db = await g.openSqlJs(readFix('demo_points.gpkg'));
    const { crsMap, proj4fn } = await g.buildCrsContext(db);
    db.close();
    assert.equal(loaded, 0);
    assert.equal(proj4fn, null);
    assert.equal(crsMap[4326].epsg, 4326);
  });
  it('buildCrsContext : 2154 charge proj4 injecte et declare les defs', async () => {
    const defs = [];
    const proj4 = Object.assign((f, t, c) => c, { defs: (k, w) => defs.push(k) });
    const { deps, log } = mkDeps({ proj4 });
    const g = Q2GGpkg.create(deps);
    const db = await g.openSqlJs(readFix('qgis2grist_marseille4e_voirie.gpkg'));
    const { proj4fn } = await g.buildCrsContext(db);
    db.close();
    assert.equal(proj4fn, proj4);
    assert.ok(defs.includes('EPSG:2154'));
    assert.ok(log.some(l => /proj4js/.test(l[0])));
  });
  it('parseGpkgFile : couche, features, enrichissements data_columns, style', async () => {
    const { deps, log } = mkDeps();
    const g = Q2GGpkg.create(deps);
    const layers = await g.parseGpkgFile(readFix('demo_points.gpkg'));
    assert.equal(layers.length, 1);
    assert.equal(layers[0].name, 'demo_points');
    assert.ok(layers[0].features.length > 0);
    assert.equal(layers[0].features[0].geometry.type, 'Point');
    assert.ok(log.some(l => l[0] === 'Lecture GeoPackage…'));
    const db = await g.openSqlJs(readFix('demo_points.gpkg'));
    const hasStyle = db.exec(`SELECT 1 FROM layer_styles WHERE f_table_name='demo_points'`).length > 0;
    db.close();
    assert.equal(!!layers[0].style, hasStyle);
  });
  it('parseGpkgFile : reprojection 2154 via proj4 injecte', async () => {
    const seen = [];
    const proj4 = Object.assign((from, to, c) => { seen.push([from, to]); return [c[0] / 1e5, c[1] / 1e5]; }, { defs() {} });
    const stub = { ...geometryStub, parseGpkgGeom: () => ({ type: 'Point', coordinates: [892000, 6247000] }) };
    const { deps } = mkDeps({ proj4, geometry: stub });
    // La fixture voirie est vide : on lui ajoute une ligne (copie temporaire).
    const tmp = path.join(os.tmpdir(), `q2g-voirie-${process.pid}.gpkg`);
    fs.copyFileSync(path.join(FIX, 'qgis2grist_marseille4e_voirie.gpkg'), tmp);
    const w = new DatabaseSync(tmp);
    // Les triggers rtree utilisent des fonctions SpatiaLite absentes de node:sqlite.
    for (const t of w.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all()) w.exec(`DROP TRIGGER "${t.name}"`);
    w.exec("INSERT INTO qgis2grist_marseille4e_voirie (geom) VALUES (x'47500001000000000000')");
    w.close();
    const b = fs.readFileSync(tmp); fs.unlinkSync(tmp);
    const layers = await Q2GGpkg.create(deps).parseGpkgFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    assert.ok(layers[0].features.length > 0);
    assert.deepEqual(seen[0], ['EPSG:2154', 'EPSG:4326']);
  });
  it('readGpkgWithSqlJs : hint exact, hint absent => [], sans hint multi-table => null ou features', async () => {
    const { deps, warns } = mkDeps({ gpkgDs: require('../lib/gpkg-datasource.js') });
    const g = Q2GGpkg.create(deps);
    const f = await g.readGpkgWithSqlJs(readFix('profile_b_points.gpkg'), 'profile_b_points');
    assert.ok(Array.isArray(f) && f.length > 0);
    assert.equal(f[0].type, 'Feature');
    assert.ok(!('fid' in f[0].properties));
    assert.ok(!('geom' in f[0].properties));
    const none = await g.readGpkgWithSqlJs(readFix('profile_b_points.gpkg'), 'inconnue_zz');
    assert.deepEqual(none, []);
    assert.equal(warns.length, 1);
    const single = await g.readGpkgWithSqlJs(readFix('profile_b_points.gpkg'), '');
    assert.equal(single.length, f.length);
  });
  it('readGpkgWithSqlJs : buffer invalide => null (erreur avalee comme l\'original)', async () => {
    const { deps, warns } = mkDeps({ gpkgDs: require('../lib/gpkg-datasource.js') });
    const r = await Q2GGpkg.create(deps).readGpkgWithSqlJs(new ArrayBuffer(64), 'x');
    assert.equal(r, null);
    assert.equal(warns.length, 1);
  });
});

describe('Q2GLoaders', () => {
  function fakeRoot(onScript) {
    const r = {};
    r.document = {
      head: { appendChild(s) { setImmediate(() => onScript(s, r)); } },
      createElement: () => ({}),
    };
    return r;
  }
  it('exporte les trois chargeurs et les URL par defaut', () => {
    for (const n of ['loadSqlJs', 'loadProj4', 'loadJSZip', 'create']) assert.equal(typeof Q2GLoaders[n], 'function');
    assert.match(Q2GLoaders.SQLJS_BASE, /cdnjs.*sql\.js/);
  });
  it('instances fournies : aucun script injecte', async () => {
    let injected = 0;
    const L = Q2GLoaders.create({
      document: { head: { appendChild() { injected++; } }, createElement: () => ({}) },
      sqlJs: { instance: { Database: class {} } }, proj4: { instance: () => 1 }, jszip: { instance: class {} },
    });
    assert.ok((await L.loadSqlJs()).Database);
    assert.equal(typeof (await L.loadProj4()), 'function');
    assert.equal(typeof (await L.loadJSZip()), 'function');
    assert.equal(injected, 0);
  });
  it('proj4 : echec de chargement => null (degradation gracieuse)', async () => {
    const L = Q2GLoaders.create({ document: { head: { appendChild(s) { setImmediate(() => s.onerror()); } }, createElement: () => ({}) } });
    assert.equal(await L.loadProj4(), null);
    assert.equal(await L.loadJSZip(), null);
  });
  it('sql.js : baseUrl personnalisee, locateFile et cache', async () => {
    const urls = []; let located = null;
    const R = {};
    R.document = {
      head: { appendChild(s) { urls.push(s.src); setImmediate(() => { R.initSqlJs = async (o) => { located = o.locateFile('sql-wasm.wasm'); return { Database: class {} }; }; s.onload(); }); } },
      createElement: () => ({}),
    };
    // create lit root = globalThis ; on injecte le document, initSqlJs est pose sur globalThis pour le test
    const L = Q2GLoaders.create({ document: R.document, sqlJs: { baseUrl: './vendor/sql' } });
    const prev = globalThis.initSqlJs;
    R.document.head.appendChild = function (s) { urls.push(s.src); setImmediate(() => { globalThis.initSqlJs = async (o) => { located = o.locateFile('sql-wasm.wasm'); return { Database: class {} }; }; s.onload(); }); };
    try {
      const a = await L.loadSqlJs(); const b = await L.loadSqlJs();
      assert.equal(a, b);
      assert.deepEqual(urls, ['./vendor/sql/sql-wasm.js']);
      assert.equal(located, './vendor/sql/sql-wasm.wasm');
    } finally { if (prev === undefined) delete globalThis.initSqlJs; else globalThis.initSqlJs = prev; }
  });
});
