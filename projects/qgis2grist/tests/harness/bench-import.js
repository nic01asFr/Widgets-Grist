/**
 * Mesure de l'import (Q2GImport) contre un faux docApi, sur des couches synthetiques.
 *
 *   node tests/harness/bench-import.js [nbPoints] [nbPolygones] [--json]
 *
 * Rapporte, par scenario : temps CPU cote widget (mediane de 5 passes), nombre
 * d'appels a applyUserActions et fetchTable, octets envoyes. Le faux docApi n'a
 * aucune latence : le cout reseau reel se deduit des appels et des octets.
 * Options de l'import passees via BENCH_OPTS (JSON), ex :
 *   BENCH_OPTS='{"batchMaxBytes":1000000}' node tests/harness/bench-import.js
 * N'ecrit rien sur le disque.
 */
'use strict';
const path = require('path');
const lib = (n) => require(path.join(__dirname, '..', '..', 'lib', n));
const Q2GImport = lib('q2g-import.js');
const Q2GSchema = lib('q2g-schema.js');
const sceneLod = lib('scene-lod.js');

const silent = { log() {}, warn() {}, error() {} };
const nbPoints = parseInt(process.argv[2], 10) || 50000;
const nbPolys = parseInt(process.argv[3], 10) || 5000;
const extra = process.env.BENCH_OPTS ? JSON.parse(process.env.BENCH_OPTS) : {};

function mkFields(geomType) {
  const f = [
    { name: 'code', label: 'Code', gType: 'Text' },
    { name: 'valeur', label: 'Valeur', gType: 'Numeric' },
    { name: 'rang', label: 'Rang', gType: 'Int' },
    { name: 'actif', label: 'Actif', gType: 'Bool' },
    { name: 'classe', label: 'Classe', gType: 'Choice', _valueMap: { A: 'Alpha', B: 'Beta', C: 'Gamma' } },
    { name: 'parent_code', label: 'Parent', gType: 'Ref:Parents', _refTargetTable: 'Parents', _refTargetField: 'code' },
  ];
  if (geomType === 'Point') {
    f.push({ name: 'latitude', gType: 'Numeric' }, { name: 'longitude', gType: 'Numeric' });
  } else {
    f.push({ name: 'geometry_json', gType: 'Text' }, { name: 'centroid_lat', gType: 'Numeric' },
      { name: 'centroid_lon', gType: 'Numeric' });
  }
  return f;
}

function mkParents(n) {
  const features = [];
  for (let i = 0; i < n; i++) features.push({ code: 'P' + i, nom: 'Parent ' + i });
  return {
    name: 'Parents', displayName: 'Parents', geomType: 'None', _color: '#111111',
    fields: [{ name: 'code', gType: 'Text' }, { name: 'nom', gType: 'Text' }],
    features,
  };
}

function mkPoints(n) {
  const features = [];
  for (let i = 0; i < n; i++) {
    features.push({
      code: 'C' + i, valeur: i * 0.37, rang: i, actif: i % 2, classe: 'ABC'[i % 3],
      parent_code: 'P' + (i % 200), latitude: 43 + (i % 1000) / 1000, longitude: 5 + (i % 997) / 997,
    });
  }
  return { name: 'Points', displayName: 'Points', geomType: 'Point', _color: '#222222',
    fields: mkFields('Point'), features };
}

function mkPolys(n) {
  const features = [];
  for (let i = 0; i < n; i++) {
    const ring = [];
    for (let k = 0; k < 40; k++) ring.push([5 + (i % 100) / 100 + k * 0.0001, 43 + k * 0.0001]);
    features.push({
      code: 'Z' + i, valeur: i * 0.5, rang: i, actif: 1, classe: 'A', parent_code: 'P' + (i % 200),
      geometry_json: JSON.stringify({ type: 'Polygon', coordinates: [ring] }),
      centroid_lat: 43.1, centroid_lon: 5.1,
    });
  }
  return { name: 'Zones', displayName: 'Zones', geomType: 'Polygon', _color: '#333333',
    fields: mkFields('Polygon'), features };
}

function fakeDocApi(countBytes) {
  const counters = {};
  const st = { applyCalls: 0, fetchCalls: 0, fetchRows: 0, bytes: 0, bulkCalls: 0, stored: {} };
  const api = {
    st,
    async listTables() { return Object.keys(counters); },
    async applyUserActions(list) {
      st.applyCalls++;
      const out = { retValues: [] };
      for (const a of list) {
        if (a[0] === 'AddTable') {
          counters[a[1]] = 0;
          st.stored[a[1]] = {};
          out.retValues.push({ table_id: a[1], columns: a[2].map((c) => c.id) });
        } else if (a[0] === 'BulkAddRecord') {
          st.bulkCalls++;
          const n = a[2].length;
          const ids = new Array(n);
          for (let i = 0; i < n; i++) ids[i] = ++counters[a[1]];
          const t = st.stored[a[1]];
          for (const k of Object.keys(a[3])) (t[k] = t[k] || []).push(...a[3][k]);
          out.retValues.push(ids);
        } else out.retValues.push(null);
        if (countBytes) st.bytes += JSON.stringify(a).length;
      }
      return out;
    },
    async fetchTable(name) {
      st.fetchCalls++;
      const t = api.st.stored[name] || {};
      const cols = Object.keys(t);
      const n = cols.length ? t[cols[0]].length : 0;
      st.fetchRows += n;
      const res = { id: Array.from({ length: n }, (_, i) => i + 1) };
      for (const c of cols) res[c] = t[c];
      return res;
    },
  };
  return api;
}

async function run(layers, countBytes) {
  const docApi = fakeDocApi(countBytes);
  const copy = layers.map((l) => Object.assign({}, l, { fields: l.fields.map((f) => Object.assign({}, f)) }));
  copy.forEach((l) => { l._lod = { mode: 'inline' }; });
  const t0 = process.hrtime.bigint();
  const res = await Q2GImport.importLayers(copy, Object.assign({
    docApi, schema: Q2GSchema, sceneLod, logger: silent,
  }, extra));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { ms, st: docApi.st, res };
}

(async () => {
  const parents = mkParents(200);
  const scenarios = {
    ['points_' + nbPoints]: [parents, mkPoints(nbPoints)],
    ['polygones_' + nbPolys]: [parents, mkPolys(nbPolys)],
  };
  const sortie = {};
  for (const [nom, layers] of Object.entries(scenarios)) {
    const temps = [];
    let last;
    for (let i = 0; i < 5; i++) { last = await run(layers, false); temps.push(last.ms); }
    temps.sort((a, b) => a - b);
    const octets = (await run(layers, true)).st.bytes;
    sortie[nom] = {
      msMediane: Math.round(temps[2]), msMin: Math.round(temps[0]),
      appelsApplyUserActions: last.st.applyCalls, appelsBulkAdd: last.st.bulkCalls,
      appelsFetchTable: last.st.fetchCalls, lignesLuesParFetch: last.st.fetchRows,
      octetsEnvoyes: octets,
      ok: last.res.allOk,
    };
  }
  console.log(JSON.stringify(sortie, null, 2));
})();
