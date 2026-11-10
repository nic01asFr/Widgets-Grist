/**
 * Q2GImport : profil de performance (lots par octets), estimateur, cles hostiles.
 * node --test projects/qgis2grist/tests/q2g-import-perf.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Q2GImport = require('../lib/q2g-import.js');
const Q2GSchema = require('../lib/q2g-schema.js');
const sceneLod = require('../lib/scene-lod.js');

const silent = { log() {}, warn() {}, error() {} };

// Faux docApi : enregistre les actions et le poids JSON de chaque BulkAddRecord.
function fakeDocApi() {
  const counters = {};
  const api = {
    calls: 0, fetches: 0, bulks: [], stored: {},
    async listTables() { return Object.keys(counters); },
    async applyUserActions(list) {
      api.calls++;
      const out = { retValues: [] };
      for (const a of list) {
        if (a[0] === 'AddTable') {
          counters[a[1]] = 0; api.stored[a[1]] = {};
          out.retValues.push({ table_id: a[1], columns: a[2].map((c) => c.id) });
        } else if (a[0] === 'BulkAddRecord') {
          const ids = [];
          for (let i = 0; i < a[2].length; i++) ids.push(++counters[a[1]]);
          const t = api.stored[a[1]];
          for (const k of Object.keys(a[3])) (t[k] = t[k] || []).push(...a[3][k]);
          api.bulks.push({ table: a[1], rows: a[2].length, bytes: Buffer.byteLength(JSON.stringify(a)) });
          out.retValues.push(ids);
        } else out.retValues.push(null);
      }
      return out;
    },
    async fetchTable(name) {
      api.fetches++;
      const t = api.stored[name] || {};
      const cols = Object.keys(t);
      const n = cols.length ? t[cols[0]].length : 0;
      const res = { id: Array.from({ length: n }, (_, i) => i + 1) };
      for (const c of cols) res[c] = t[c];
      return res;
    },
  };
  return api;
}

// Generateur deterministe.
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

const MOTS = ['École', 'rue de la République', 'Marché "central"', "Château d'If", 'été\\hiver', 'ligne\nbrisée', 'plain'];

function champs(geom) {
  const f = [
    { name: 'code', gType: 'Text' }, { name: 'nom', gType: 'Text' },
    { name: 'valeur', gType: 'Numeric' }, { name: 'rang', gType: 'Int' }, { name: 'actif', gType: 'Bool' },
    { name: 'classe', gType: 'Choice', _valueMap: { A: 'Alpha, un libelle nettement plus long', B: 'Beta', C: 'Gamma' } },
    { name: 'parent_code', gType: 'Ref:Parents', _refTargetTable: 'Parents', _refTargetField: 'code' },
  ];
  if (geom === 'Point') f.push({ name: 'latitude', gType: 'Numeric' }, { name: 'longitude', gType: 'Numeric' });
  else f.push({ name: 'geometry_json', gType: 'Text' }, { name: 'centroid_lat', gType: 'Numeric' }, { name: 'centroid_lon', gType: 'Numeric' });
  return f;
}

function couche(nom, geom, n, sommets, accents) {
  const r = rng(7);
  const features = [];
  for (let i = 0; i < n; i++) {
    const row = {
      code: 'C' + i, nom: accents ? MOTS[i % MOTS.length].repeat(1 + (i % 7)) : 'Nom ' + i,
      valeur: r() * 1000, rang: i, actif: i % 2, classe: 'ABC'[i % 3], parent_code: 'P' + (i % 50),
    };
    if (geom === 'Point') { row.latitude = 43 + r(); row.longitude = 5 + r(); }
    else {
      const ring = [];
      for (let k = 0; k < sommets; k++) ring.push([Math.round((5 + r()) * 1e5) / 1e5, Math.round((43 + r()) * 1e5) / 1e5]);
      row.geometry_json = JSON.stringify({ type: 'Polygon', coordinates: [ring] });
      row.centroid_lat = 43.123456789012; row.centroid_lon = 5.123456789012;
    }
    features.push(row);
  }
  return { name: nom, displayName: nom, geomType: geom, _color: '#112233', fields: champs(geom), features, _lod: { mode: 'inline' } };
}

const parents = () => ({
  name: 'Parents', displayName: 'Parents', geomType: 'None', _color: '#111111', _lod: { mode: 'inline' },
  fields: [{ name: 'code', gType: 'Text' }, { name: 'nom', gType: 'Text' }],
  features: Array.from({ length: 50 }, (_, i) => ({ code: 'P' + i, nom: 'Parent ' + i })),
});

async function importer(layer, extra) {
  const api = fakeDocApi();
  const copie = JSON.parse(JSON.stringify(layer));
  copie._lod = { mode: 'inline' };
  const res = await Q2GImport.importLayers([parents(), copie], Object.assign({
    docApi: api, schema: Q2GSchema, sceneLod, logger: silent,
  }, extra));
  return { api, res };
}

describe('profil de performance', () => {
  it('PERF_RAPIDE est fige et resolvePerfOptions applique la priorite aux options explicites', () => {
    assert.ok(Object.isFrozen(Q2GImport.PERF_RAPIDE));
    const rien = Q2GImport.resolvePerfOptions({});
    assert.deepEqual(rien, { batchMaxRows: undefined, batchMaxBytes: undefined, skipUselessRepairFetch: false });
    assert.deepEqual(Q2GImport.resolvePerfOptions({ perf: 'rapide' }), { ...Q2GImport.PERF_RAPIDE });
    assert.deepEqual(Q2GImport.resolvePerfOptions({ perf: true }), { ...Q2GImport.PERF_RAPIDE });
    const mix = Q2GImport.resolvePerfOptions({ perf: 'rapide', batchMaxRows: 10, skipUselessRepairFetch: false });
    assert.equal(mix.batchMaxRows, 10);
    assert.equal(mix.batchMaxBytes, Q2GImport.PERF_RAPIDE.batchMaxBytes);
    assert.equal(mix.skipUselessRepairFetch, false);
    // profil inconnu : ignore, comportement historique
    assert.deepEqual(Q2GImport.resolvePerfOptions({ perf: 'autre' }), rien);
  });

  it('sans option, aucun changement : lots historiques et relecture des points', async () => {
    const { api } = await importer(couche('Pts', 'Point', 1200, 0), {});
    assert.deepEqual(api.bulks.filter((b) => b.table === 'Pts').map((b) => b.rows), [500, 500, 200]);
    assert.equal(api.fetches, 1);
  });

  const JEUX = [
    ['points', () => couche('Pts', 'Point', 6000, 0)],
    ['polygones moyens', () => couche('Zon', 'Polygon', 1500, 40)],
    ['polygones lourds', () => couche('Gro', 'Polygon', 120, 1500)],
    ['texte accentue et echappe', () => couche('Txt', 'Point', 3000, 0, true)],
  ];
  for (const [nom, fabrique] of JEUX) {
    it(`rapide : memes donnees finales, aucun lot au dessus de 700 Ko reels (${nom})`, async () => {
      const layer = fabrique();
      const base = await importer(layer, {});
      const rapide = await importer(layer, { perf: 'rapide' });
      assert.deepEqual(rapide.api.stored[layer.name], base.api.stored[layer.name]);
      assert.deepEqual(rapide.api.stored.Parents, base.api.stored.Parents);
      assert.deepEqual(rapide.res.tableNameRemap, base.res.tableNameRemap);
      const max = Math.max(...rapide.api.bulks.map((b) => b.bytes));
      assert.ok(max <= 700000, 'lot de ' + max + ' octets');
      assert.equal(rapide.api.fetches, 0);
    });
  }

  it('rapide : beaucoup moins d appels sur des lignes legeres', async () => {
    const layer = couche('Pts', 'Point', 20000, 0);
    const base = await importer(layer, {});
    const rapide = await importer(layer, { perf: 'rapide' });
    assert.ok(rapide.api.calls * 5 < base.api.calls, `${rapide.api.calls} contre ${base.api.calls}`);
  });

  it('lignes tres lourdes : plafonne l octet par lot la ou le decoupage historique envoie des dizaines de Mo', async () => {
    const layer = couche('Gro', 'Polygon', 100, 8000);
    const base = await importer(layer, {});
    const rapide = await importer(layer, { perf: 'rapide' });
    const maxBase = Math.max(...base.api.bulks.map((b) => b.bytes));
    const maxRapide = Math.max(...rapide.api.bulks.map((b) => b.bytes));
    assert.ok(maxBase > 5e6, 'historique : ' + maxBase);
    assert.ok(maxRapide < 700000, 'rapide : ' + maxRapide);
  });
});

describe('estimateur de poids des lots', () => {
  for (const [nom, fabrique] of [
    ['points', () => couche('Pts', 'Point', 3000, 0)],
    ['polygones', () => couche('Zon', 'Polygon', 800, 60)],
    ['accents et echappements', () => couche('Txt', 'Point', 2000, 0, true)],
  ]) {
    it(`ne sous-estime jamais un lot reel et reste sous 2 fois le reel (${nom})`, async () => {
      const layer = fabrique();
      const plan = Q2GImport.planBatches(layer.features, layer.fields, true, Q2GImport.PERF_RAPIDE);
      const est = Q2GImport.makeRowEstimator(layer.fields);
      const { api } = await importer(layer, { perf: 'rapide' });
      const reels = api.bulks.filter((b) => b.table === layer.name);
      assert.equal(reels.length, plan.length);
      plan.forEach(([a, b], i) => {
        let e = est.lot;
        for (let k = a; k < b; k++) e += est.estimate(layer.features[k]);
        assert.ok(e >= reels[i].bytes, `lot ${i} : estime ${e} < reel ${reels[i].bytes}`);
        assert.ok(e <= reels[i].bytes * 2, `lot ${i} : estime ${e} > 2 x reel ${reels[i].bytes}`);
      });
    });
  }

  it('couvre toutes les lignes sans trou ni chevauchement, au moins une ligne par lot', () => {
    const layer = couche('Gro', 'Polygon', 50, 3000);
    const plan = Q2GImport.planBatches(layer.features, layer.fields, true, { batchMaxBytes: 10 });
    assert.equal(plan.length, 50);
    const plan2 = Q2GImport.planBatches(layer.features, layer.fields, true, Q2GImport.PERF_RAPIDE);
    assert.equal(plan2[0][0], 0);
    assert.equal(plan2[plan2.length - 1][1], 50);
    for (let i = 1; i < plan2.length; i++) assert.equal(plan2[i][0], plan2[i - 1][1]);
    assert.deepEqual(Q2GImport.planBatches([], layer.fields, true, Q2GImport.PERF_RAPIDE), []);
  });

  it('un libelle Choice plus long que le code compte dans le poids', () => {
    const f = [{ name: 'c', gType: 'Choice', _valueMap: { a: 'x'.repeat(500) } }];
    const e = Q2GImport.makeRowEstimator(f);
    assert.ok(e.estimate({ c: 'a' }) > 500);
    assert.ok(e.estimate({ c: 'inconnu' }) < 60); // valeur hors table : reste telle quelle
  });
});

describe('cles hostiles (constructor, __proto__, toString)', () => {
  const CLES = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];

  it('convertCellValue : une Ref vers une cle heritee vaut 0, pas une fonction', () => {
    const ref = { gType: 'Ref:P', _refTargetTable: 'P', _refTargetField: 'code' };
    const rl = { gType: 'RefList:P', _refTargetTable: 'P', _refTargetField: 'code' };
    const maps = { P: { code: { a: 1 } } };
    for (const k of CLES) {
      assert.equal(Q2GImport.convertCellValue(ref, k, {}, maps), 0, k);
      assert.equal(Q2GImport.convertCellValue(rl, k, {}, maps), null, k);
    }
    // un parent nomme comme une propriete heritee n'est pas confondu avec elle
    assert.equal(Q2GImport.convertCellValue(ref, 'a', { constructor: 'zzz' }, { constructor: { code: { a: 7 } } }), 0);
    assert.equal(Q2GImport.convertCellValue(ref, 'a', {}, { constructor: { code: { a: 7 } } }), 0);
  });

  it('import : des valeurs de cle hostiles sont de vraies cles de recherche', async () => {
    const api = fakeDocApi();
    const parent = {
      name: 'Parent', displayName: 'Parent', geomType: 'None', _color: '#000000', _lod: { mode: 'inline' },
      fields: [{ name: 'code', gType: 'Text' }],
      features: CLES.map((c) => ({ code: c })).concat([{ code: 'normal' }]),
    };
    const enfant = {
      name: 'Enfant', displayName: 'Enfant', geomType: 'None', _color: '#000000', _lod: { mode: 'inline' },
      fields: [
        { name: 'fk', gType: 'Ref:Parent', _refTargetTable: 'Parent', _refTargetField: 'code' },
        { name: 'fks', gType: 'RefList:Parent', _refTargetTable: 'Parent', _refTargetField: 'code' },
      ],
      features: CLES.concat(['normal', 'inconnu']).map((c) => ({ fk: c, fks: c + ',normal' })),
    };
    const res = await Q2GImport.importLayers([enfant, parent], { docApi: api, schema: Q2GSchema, sceneLod, logger: silent });
    assert.equal(res.allOk, true);
    // rowIds du parent : 1..5 pour CLES, 6 pour normal
    assert.deepEqual(api.stored.Enfant.fk, [1, 2, 3, 4, 5, 6, 0]);
    assert.deepEqual(api.stored.Enfant.fks, [
      ['L', 1, 6], ['L', 2, 6], ['L', 3, 6], ['L', 4, 6], ['L', 5, 6], ['L', 6, 6], ['L', 6],
    ]);
    // aucune valeur n'est une fonction
    for (const v of api.stored.Enfant.fk) assert.equal(typeof v, 'number');
  });

  it('import : une couche nommee comme une propriete heritee garde son nom et son remap', async () => {
    const api = fakeDocApi();
    const p = { name: 'toString', displayName: 'toString', geomType: 'None', _color: '#000', _lod: { mode: 'inline' },
      fields: [{ name: 'code', gType: 'Text' }], features: [{ code: 'a' }] };
    const e = { name: 'Enfant', displayName: 'Enfant', geomType: 'None', _color: '#000', _lod: { mode: 'inline' },
      fields: [{ name: 'fk', gType: 'Ref:toString', _refTargetTable: 'toString', _refTargetField: 'code' }],
      features: [{ fk: 'a' }] };
    const res = await Q2GImport.importLayers([e, p], { docApi: api, schema: Q2GSchema, sceneLod, logger: silent });
    assert.equal(res.allOk, true);
    assert.equal(Object.getOwnPropertyDescriptor(res.tableNameRemap, 'toString').value, 'toString');
    assert.deepEqual(api.stored.Enfant.fk, [1]);
    const addE = api.stored.Enfant;
    assert.ok(addE);
  });

  it('la sortie reste un objet simple pour tableNameRemap (compatibilite)', async () => {
    const { res } = await importer(couche('Pts', 'Point', 5, 0), {});
    assert.equal(Object.getPrototypeOf(res.tableNameRemap), Object.prototype);
    assert.equal(res.tableNameRemap.Pts, 'Pts');
  });
});
