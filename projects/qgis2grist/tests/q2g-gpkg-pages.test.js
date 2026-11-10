/**
 * Q2GGpkg : lecture par pages (opt-in), garde de volume, echappement SQL, fermeture de la base.
 * Utilise de vrais GeoPackages synthetiques (node:sqlite) et la vraie geometrie / le vrai schema.
 *
 * node --test projects/qgis2grist/tests/q2g-gpkg-pages.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const H = require('./q2g-gpkg-synth.helpers.js');
const Q2GGpkg = require('../lib/q2g-gpkg.js');
const Q2GGeometry = require('../lib/q2g-geometry.js');
const Q2GSchema = require('../lib/q2g-schema.js');
const gpkgDs = require('../lib/gpkg-datasource.js');

const SKIP = H.DatabaseSync ? false : 'node:sqlite indisponible';
const FIX = path.join(__dirname, 'fixtures');
const readFix = (n) => { const b = fs.readFileSync(path.join(FIX, n)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

function mk(extra) {
  const compteur = {}; const warns = []; const alertes = []; const progres = [];
  const deps = Object.assign({
    SQL: H.makeFakeSql(compteur),
    geometry: Q2GGeometry,
    schema: Q2GSchema,
    buildLayerFromGeojson: Q2GSchema.buildLayerFromGeojson,
    gpkgDs,
    qgs: { parseAliases: () => ({}), parseEditWidgets: () => ({}), enrichFieldFromWidget() {} },
    parseQmlStyle: () => null,
    onProgress: (l, d) => progres.push([l, d]),
    logger: { warn: (...a) => warns.push(a) },
    yieldFn: async () => {},
  }, extra || {});
  return { g: Q2GGpkg.create(deps), compteur, warns, alertes, progres, deps };
}

describe('Q2GGpkg - garde de volume (fonction pure)', () => {
  it('checkGpkgLimits : faux => rien ; true => valeurs par defaut', () => {
    assert.deepEqual(Q2GGpkg.checkGpkgLimits({ fileBytes: 1e12, layers: [{ name: 'a', features: 1e9 }] }, false), { errors: [], warnings: [] });
    const r = Q2GGpkg.checkGpkgLimits({
      fileBytes: 400 * 1024 * 1024,
      layers: [{ name: 'a', features: 600000 }, { name: 'b', features: 60000 }, { name: 'c', features: 10 }],
    }, true);
    assert.equal(r.errors.length, 2);
    assert.match(r.errors[0], /trop volumineux.*400 Mo.*300 Mo/);
    assert.match(r.errors[1], /« a » : 600 000 entités.*500 000/);
    assert.equal(r.warnings.length, 1);
    assert.match(r.warnings[0], /« b » : 60 000 entités/);
  });
  it('checkGpkgLimits : limites partielles, seules les cles donnees comptent', () => {
    const r = Q2GGpkg.checkGpkgLimits({ fileBytes: 5e9, layers: [{ name: 'a', features: 5e9 }] }, { warnFeaturesPerLayer: 10 });
    assert.deepEqual(r.errors, []);
    assert.equal(r.warnings.length, 1);
  });
  it('GUARD_DEFAULTS est fige et coherent avec la limite du navigateur de scene-lod', () => {
    assert.ok(Object.isFrozen(Q2GGpkg.GUARD_DEFAULTS));
    const lod = require('../lib/scene-lod.js');
    assert.ok(Q2GGpkg.GUARD_DEFAULTS.maxFileBytes <= lod.FILE_MAX_BYTES);
  });
  it('_sqlIdent double les guillemets', () => {
    assert.equal(Q2GGpkg._sqlIdent('a"b'), '"a""b"');
    assert.equal(Q2GGpkg._sqlIdent("l'arbre"), '"l\'arbre"');
  });
});

describe('Q2GGpkg - lecture par pages = lecture complete', { skip: SKIP }, () => {
  const CAS = [
    { rows: 0, vertices: 12 },
    { rows: 1, vertices: 12 },
    { rows: 199, vertices: 12 },
    { rows: 200, vertices: 12 },
    { rows: 201, vertices: 0 },
    { rows: 1234, vertices: 12, nullGeomEvery: 7 },
    { rows: 5000, vertices: 0 },
    { rows: 5001, vertices: 6 },
    { rows: 12345, vertices: 4 },
  ];
  for (const cas of CAS) {
    it(`parseGpkgFile paged identique : ${JSON.stringify(cas)}`, async () => {
      const buf = H.makeSyntheticGpkg(cas);
      const a = await mk().g.parseGpkgFile(buf);
      const b = await mk().g.parseGpkgFile(buf, { paged: true });
      assert.equal(JSON.stringify(b), JSON.stringify(a));
      assert.equal(b[0].featureCount, cas.rows);
      assert.equal(b[0].hasData, cas.rows > 0);
    });
  }

  it('tailles de page variees, minimum 200 impose, OFFSET force', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 2500, vertices: 5 });
    const ref = JSON.stringify(await mk().g.parseGpkgFile(buf));
    for (const o of [{ pageSize: 200 }, { pageSize: 777 }, { pageSize: 1 }, { pageSize: 5000 }, { pageSize: 300, keyset: false }]) {
      const r = await mk().g.parseGpkgFile(buf, { paged: true, ...o });
      assert.equal(JSON.stringify(r), ref, JSON.stringify(o));
    }
  });

  it('fixtures reelles : memes couches en lecture complete et par pages', async () => {
    for (const f of ['demo_points.gpkg', 'profile_b_points.gpkg', 'qgis2grist_marseille4e_voirie.gpkg']) {
      const proj4 = Object.assign((a, b, c) => c, { defs() {} });
      const buf = readFix(f);
      const a = await mk({ proj4 }).g.parseGpkgFile(buf);
      const b = await mk({ proj4 }).g.parseGpkgFile(buf, { paged: true });
      assert.equal(JSON.stringify(b), JSON.stringify(a), f);
    }
  });

  it('le GeoJSON n est jamais tenu en entier : premiere page seulement, pages suivantes mises a plat', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 12000, vertices: 8 });
    const tailles = []; const plat = [];
    const { g } = mk({
      buildLayerFromGeojson: (n, gj) => { tailles.push(gj.features.length); return Q2GSchema.buildLayerFromGeojson(n, gj); },
      flattenGeoJsonFeatures: (f, fields, gt) => { plat.push(f.length); return Q2GSchema.flattenGeoJsonFeatures(f, fields, gt); },
    });
    const layers = await g.parseGpkgFile(buf, { paged: true });
    assert.deepEqual(tailles, [5000]);
    assert.deepEqual(plat, [5000, 2000]);
    assert.equal(layers[0].features.length, 12000);
    // _localId continu
    assert.deepEqual([layers[0].features[0]._localId, layers[0].features[5000]._localId, layers[0].features[11999]._localId], [1, 5001, 12000]);
  });

  it('rend la main entre les pages et rapporte la progression', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 1000, vertices: 4 });
    let rendues = 0;
    const { g, progres } = mk();
    await g.parseGpkgFile(buf, { paged: true, pageSize: 300, yieldFn: async () => { rendues++; } });
    assert.equal(rendues, 3); // 4 pages (300,300,300,100) : on cede apres chaque page pleine
    assert.ok(progres.some(([, d]) => /\(1000\/1000\)/.test(d)));
  });

  it('keyset : requetes WHERE rowid, aucun OFFSET ; repli OFFSET sur WITHOUT ROWID, meme resultat', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 900, vertices: 4 });
    const k = mk();
    const ra = await k.g.parseGpkgFile(buf, { paged: true, pageSize: 300 });
    const q = k.compteur.requetes.filter((s) => /FROM "zones"/.test(s));
    assert.ok(q.some((s) => /WHERE rowid >/.test(s)));
    assert.ok(!q.some((s) => /OFFSET/.test(s)));

    const sr = H.makeSyntheticGpkg({ rows: 900, vertices: 4, withoutRowid: true });
    const w = mk();
    const rb = await w.g.parseGpkgFile(sr, { paged: true, pageSize: 300 });
    assert.ok(w.compteur.requetes.some((s) => /OFFSET/.test(s)));
    assert.equal(JSON.stringify(rb), JSON.stringify(ra));
  });

  it('sans flattenGeoJsonFeatures injecte : repli sur la lecture complete avec un avertissement', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 300, vertices: 4 });
    const alertes = [];
    const { g } = mk({ schema: {} });
    const prev = globalThis.Q2GSchema; delete globalThis.Q2GSchema;
    try {
      const r = await g.parseGpkgFile(buf, { paged: true, onWarning: (m) => alertes.push(m) });
      assert.equal(r[0].features.length, 300);
      assert.equal(alertes.length, 1);
      assert.match(alertes[0], /flattenGeoJsonFeatures non injecte/);
    } finally { if (prev) globalThis.Q2GSchema = prev; }
  });

  it('options par defaut via configure({ gpkgOptions })', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 1000, vertices: 4 });
    const tailles = [];
    const { g } = mk({ buildLayerFromGeojson: (n, gj) => { tailles.push(gj.features.length); return Q2GSchema.buildLayerFromGeojson(n, gj); } });
    g.configure({ gpkgOptions: { paged: true, pageSize: 400 } });
    await g.parseGpkgFile(buf);
    assert.deepEqual(tailles, [400]);
  });
});

describe('Q2GGpkg - garde de volume a la lecture', { skip: SKIP }, () => {
  it('fichier trop gros : refus net AVANT d ouvrir la base (pas de copie en memoire)', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 50, vertices: 4 });
    const { g, compteur } = mk();
    await assert.rejects(() => g.parseGpkgFile(buf, { limits: { maxFileBytes: 1000 } }),
      (e) => e.code === 'Q2G_LIMITE' && /trop volumineux/.test(e.message));
    assert.equal(compteur.ouvertes || 0, 0);
  });

  it('couche trop grande : refus avec le nom de la couche, base refermee', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 500, vertices: 4 });
    const { g, compteur } = mk();
    await assert.rejects(() => g.parseGpkgFile(buf, { limits: { maxFeaturesPerLayer: 100 } }),
      (e) => e.code === 'Q2G_LIMITE' && /« zones » : 500 entités/.test(e.message));
    assert.equal(compteur.fermees, compteur.ouvertes);
  });

  it('seuil d avertissement : prevenir sans bloquer, et lire quand meme', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 500, vertices: 4 });
    const alertes = [];
    const { g, warns } = mk();
    const r = await g.parseGpkgFile(buf, { limits: { warnFeaturesPerLayer: 100 }, onWarning: (m) => alertes.push(m) });
    assert.equal(r[0].features.length, 500);
    assert.equal(alertes.length, 1);
    assert.match(alertes[0], /500 entités/);
    assert.equal(warns.length, 1);
  });

  it('limits: true et petit fichier : aucun message', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 50, vertices: 4 });
    const alertes = [];
    const r = await mk().g.parseGpkgFile(buf, { limits: true, onWarning: (m) => alertes.push(m) });
    assert.equal(r[0].features.length, 50);
    assert.deepEqual(alertes, []);
  });

  it('readGpkgWithSqlJs : un refus de volume est propage, pas avale en null', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 500, vertices: 4 });
    const { g, compteur } = mk();
    await assert.rejects(() => g.readGpkgWithSqlJs(buf, 'zones', { limits: { maxFeaturesPerLayer: 10 } }),
      (e) => e.code === 'Q2G_LIMITE');
    assert.equal(compteur.fermees, compteur.ouvertes);
  });

  it('inspectGpkg : taille et nombre d entites par table, base refermee', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 321, vertices: 4 });
    const { g, compteur } = mk();
    const info = await g.inspectGpkg(buf);
    assert.equal(info.fileBytes, buf.byteLength);
    assert.deepEqual(info.layers, [{ name: 'zones', dataType: 'features', features: 321 }]);
    assert.equal(compteur.fermees, 1);
  });
});

describe('Q2GGpkg - readGpkgWithSqlJs', { skip: SKIP }, () => {
  it('par pages = lecture complete (resultat identique)', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 7777, vertices: 5, nullGeomEvery: 11 });
    const a = await mk().g.readGpkgWithSqlJs(buf, 'zones');
    const b = await mk().g.readGpkgWithSqlJs(buf, 'zones', { paged: true });
    assert.equal(a.length, 7777);
    assert.equal(JSON.stringify(b), JSON.stringify(a));
  });

  it('plafond exact et avertissement quand paged ; lecture d origine inchangee sans options', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 1200, vertices: 0 });
    const alertes = [];
    const b = await mk().g.readGpkgWithSqlJs(buf, 'zones', { paged: true, maxRows: 500, onWarning: (m) => alertes.push(m) });
    assert.equal(b.length, 500);
    assert.equal(alertes.length, 1);
    assert.match(alertes[0], /« zones » tronquée à 500 lignes sur 1200/);
    // sans options : tout est lu (sous 50 000), aucun message
    const a = await mk().g.readGpkgWithSqlJs(buf, 'zones');
    assert.equal(a.length, 1200);
  });

  it('la base est refermee meme si la lecture echoue (fuite corrigee)', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 10, vertices: 0 });
    const casse = { ...gpkgDs, matchGpkgTables() { throw new Error('panne'); } };
    const { g, compteur, warns } = mk({ gpkgDs: casse });
    const r = await g.readGpkgWithSqlJs(buf, 'zones');
    assert.equal(r, null);
    assert.equal(warns.length, 1);
    assert.equal(compteur.ouvertes, 1);
    assert.equal(compteur.fermees, 1);
  });

  it('table introuvable : [] et base refermee une seule fois', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 10, vertices: 0 });
    const { g, compteur } = mk();
    assert.deepEqual(await g.readGpkgWithSqlJs(buf, 'inconnue'), []);
    assert.equal(compteur.fermees, 1);
  });
});

describe('Q2GGpkg - noms de table avec apostrophe et guillemet', { skip: SKIP }, () => {
  const NOM = `zone d'étude "nord"`;

  it('readGpkgWithSqlJs lit une table dont le nom porte apostrophe et guillemet', async () => {
    const buf = H.makeSyntheticGpkg({ table: NOM, rows: 40, vertices: 0 });
    const { g, warns } = mk();
    const feats = await g.readGpkgWithSqlJs(buf, NOM);
    assert.ok(Array.isArray(feats), 'erreur : ' + JSON.stringify(warns.map((w) => String(w[1] || w[0]))));
    assert.equal(feats.length, 40);
    assert.equal(feats[4].properties['colonne "x"'], 'à "citer"');
    assert.equal(feats[0].geometry.type, 'Point');
  });

  it('parseGpkgFile lit la meme table, en lecture complete et par pages', async () => {
    const buf = H.makeSyntheticGpkg({ table: NOM, rows: 40, vertices: 4 });
    const a = await mk().g.parseGpkgFile(buf);
    const b = await mk().g.parseGpkgFile(buf, { paged: true });
    assert.equal(a[0].displayName, NOM);
    assert.equal(a[0].features.length, 40);
    assert.equal(JSON.stringify(b), JSON.stringify(a));
  });

  it('colonnes : le nom de colonne avec guillemet survit a la lecture', async () => {
    const buf = H.makeSyntheticGpkg({ rows: 12, vertices: 0 });
    const a = await mk().g.parseGpkgFile(buf);
    assert.ok(a[0].fields.some((f) => f._rawKey === 'colonne "x"'));
    assert.equal(a[0].features.length, 12);
  });
});
