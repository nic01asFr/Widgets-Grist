/**
 * Tests Q2GImport avec un faux docApi qui enregistre les actions.
 * node --test projects/qgis2grist/tests/q2g-import.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Q2GImport = require('../lib/q2g-import.js');
const sceneLod = require('../lib/scene-lod.js');

const silent = { log() {}, warn() {}, error() {} };
const schema = {
  sanitizeColName: (n) => String(n).replace(/[^A-Za-z0-9_]/g, '_'),
};

// Faux docApi : tables existantes, rowIds incrementaux par table, journal des actions.
function fakeDocApi(opts = {}) {
  const tables = new Set(opts.existing || []);
  const counters = {};
  const actions = [];
  const stored = {}; // tableName -> { col: [] }
  return {
    actions, tables, stored,
    async listTables() { return [...tables]; },
    async applyUserActions(list) {
      const out = { retValues: [] };
      for (const a of list) {
        actions.push(a);
        if (opts.failOn && opts.failOn(a)) throw new Error('echec simule');
        if (a[0] === 'AddTable') {
          const id = opts.renameTable ? opts.renameTable(a[1]) : a[1];
          tables.add(id);
          counters[id] = 0;
          const columns = a[2].map((c) => (opts.renameCol ? opts.renameCol(c.id) : c.id));
          stored[id] = {};
          out.retValues.push({ table_id: id, columns });
        } else if (a[0] === 'BulkAddRecord') {
          const n = a[2].length;
          const ids = [];
          for (let i = 0; i < n; i++) ids.push(++counters[a[1]]);
          stored[a[1]] = stored[a[1]] || {};
          for (const [k, v] of Object.entries(a[3])) {
            stored[a[1]][k] = (stored[a[1]][k] || []).concat(v);
          }
          out.retValues.push(ids);
        } else if (a[0] === 'RemoveTable') {
          tables.delete(a[1]);
          out.retValues.push(null);
        } else {
          out.retValues.push(null);
        }
      }
      return out;
    },
    async fetchTable(name) {
      const t = stored[name] || {};
      const cols = Object.keys(t);
      const n = cols.length ? t[cols[0]].length : 0;
      const res = { id: Array.from({ length: n }, (_, i) => i + 1) };
      for (const c of cols) res[c] = t[c];
      return res;
    },
  };
}

function mkLayer(name, fields, features, extra = {}) {
  return { name, displayName: name, geomType: 'None', fields, features, _color: '#123456', ...extra };
}

describe('helpers Refs', () => {
  it('topoSortByRefs place les parents avant les enfants', () => {
    const parent = mkLayer('Parent', [], []);
    const child = mkLayer('Enfant', [{ name: 'fk', gType: 'Ref:Parent', _refTargetTable: 'Parent', _refTargetField: 'code' }], []);
    const order = Q2GImport.topoSortByRefs([child, parent]).map((l) => l.name);
    assert.deepEqual(order, ['Parent', 'Enfant']);
  });

  it('topoSortByRefs supporte un cycle sans boucler', () => {
    const a = mkLayer('A', [{ name: 'x', gType: 'Ref:B', _refTargetTable: 'B' }], []);
    const b = mkLayer('B', [{ name: 'y', gType: 'Ref:A', _refTargetTable: 'A' }], []);
    assert.equal(Q2GImport.topoSortByRefs([a, b]).length, 2);
  });

  it('resolveRefType suit le renommage de table', () => {
    assert.equal(Q2GImport.resolveRefType('Ref:P', 'P', { P: 'P_1' }), 'Ref:P_1');
    assert.equal(Q2GImport.resolveRefType('RefList:P', 'P', { P: 'P_1' }), 'RefList:P_1');
    assert.equal(Q2GImport.resolveRefType('Text', null, {}), 'Text');
  });

  it('buildRefLookupNeeds collecte les champs references', () => {
    const c = mkLayer('C', [{ name: 'fk', _refTargetTable: 'P', _refTargetField: 'code' }], []);
    const needs = Q2GImport.buildRefLookupNeeds([c]);
    assert.deepEqual([...needs.P], ['code']);
  });
});

describe('convertCellValue', () => {
  it('convertit les types scalaires et Choice', () => {
    const c = Q2GImport.convertCellValue;
    assert.equal(c({ gType: 'Int' }, '12.7', {}, {}), 12);
    assert.equal(c({ gType: 'Int' }, 'abc', {}, {}), null);
    assert.equal(c({ gType: 'Numeric' }, '1.5', {}, {}), 1.5);
    assert.equal(c({ gType: 'Bool' }, 'x', {}, {}), 1);
    assert.equal(c({ gType: 'Text' }, 5, {}, {}), '5');
    assert.equal(c({ gType: 'Choice', _valueMap: { a: 'Alpha' } }, 'a', {}, {}), 'Alpha');
    assert.equal(c({ gType: 'Text' }, null, {}, {}), null);
  });

  it('convertit Ref et RefList en rowId, 0 si parent absent', () => {
    const maps = { P: { code: { a: 3, b: 4 } } };
    const ref = { gType: 'Ref:P', _refTargetTable: 'P', _refTargetField: 'code' };
    const rl = { gType: 'RefList:P', _refTargetTable: 'P', _refTargetField: 'code' };
    assert.equal(Q2GImport.convertCellValue(ref, 'b', {}, maps), 4);
    assert.equal(Q2GImport.convertCellValue(ref, 'zz', {}, maps), 0);
    assert.deepEqual(Q2GImport.convertCellValue(rl, 'a; b,zz', {}, maps), ['L', 3, 4]);
    assert.equal(Q2GImport.convertCellValue(rl, 'zz', {}, maps), null);
    assert.equal(Q2GImport.convertCellValue(ref, 'a', {}, {}), 0);
  });
});

describe('importLayers', () => {
  const fieldsParent = () => [
    { name: 'code', gType: 'Text' },
    { name: 'nom', gType: 'Text', label: 'Nom complet' },
  ];
  const fieldsChild = () => [
    { name: 'id_p', gType: 'Ref:Parent', _refTargetTable: 'Parent', _refTargetField: 'code' },
  ];

  it('cree les tables dans l ordre topologique et convertit les FK en rowId', async () => {
    const api = fakeDocApi();
    const parent = mkLayer('Parent', fieldsParent(), [{ code: 'a', nom: 'A' }, { code: 'b', nom: 'B' }]);
    const child = mkLayer('Enfant', fieldsChild(), [{ id_p: 'b' }, { id_p: 'a' }, { id_p: 'z' }]);
    const res = await Q2GImport.importLayers([child, parent], { docApi: api, schema, sceneLod, logger: silent });
    const adds = api.actions.filter((a) => a[0] === 'AddTable').map((a) => a[1]);
    assert.deepEqual(adds, ['Parent', 'Enfant']);
    assert.deepEqual(api.stored.Enfant.id_p, [2, 1, 0]);
    assert.equal(res.allOk, true);
    assert.deepEqual(Object.keys(res.importedLayerData).sort(), ['Enfant', 'Parent']);
    // colonnes : label et fill_color
    const addParent = api.actions.find((a) => a[0] === 'AddTable' && a[1] === 'Parent');
    assert.equal(addParent[2][1].label, 'Nom complet');
    assert.deepEqual(addParent[2][2], { id: 'fill_color', type: 'Text', label: 'Couleur (auto)' });
    assert.deepEqual(api.stored.Parent.fill_color, ['#123456', '#123456']);
  });

  it('remappe les noms de tables en collision et le type Ref de l enfant', async () => {
    const api = fakeDocApi({ existing: ['Parent'] });
    const parent = mkLayer('Parent', fieldsParent(), [{ code: 'a', nom: 'A' }]);
    const child = mkLayer('Enfant', fieldsChild(), [{ id_p: 'a' }]);
    const res = await Q2GImport.importLayers([parent, child], { docApi: api, schema, sceneLod, logger: silent });
    assert.equal(res.tableNameRemap.Parent, 'Parent_1');
    const addChild = api.actions.find((a) => a[0] === 'AddTable' && a[1] === 'Enfant');
    assert.equal(addChild[2][0].type, 'Ref:Parent_1');
    assert.deepEqual(api.stored.Enfant.id_p, [1]);
    assert.ok(res.importedLayerData.Parent_1);
  });

  it('suit le renommage de table et de colonnes decide par Grist', async () => {
    const api = fakeDocApi({
      renameTable: (n) => n + 'X',
      renameCol: (c) => (c === 'latitude' ? 'latitude2' : c),
    });
    const pts = mkLayer('Pts', [
      { name: 'latitude', gType: 'Numeric' }, { name: 'longitude', gType: 'Numeric' },
    ], [{ latitude: 1, longitude: 2 }], { geomType: 'Point' });
    const res = await Q2GImport.importLayers([pts], { docApi: api, schema, sceneLod, logger: silent });
    assert.ok(api.stored.PtsX.latitude2);
    assert.deepEqual(pts._geometryCols, { lat: 'latitude2', lon: 'longitude' });
    assert.equal(pts.fields[0].name, 'latitude2');
    assert.ok(res.importedLayerData.PtsX);
  });

  it('replaceExisting supprime l homonyme avant creation', async () => {
    const api = fakeDocApi({ existing: ['Parent'] });
    const parent = mkLayer('Parent', fieldsParent(), [{ code: 'a' }]);
    const res = await Q2GImport.importLayers([parent], {
      docApi: api, schema, sceneLod, logger: silent, replaceExisting: true,
    });
    assert.equal(api.actions[0][0], 'RemoveTable');
    assert.equal(res.tableNameRemap.Parent, 'Parent');
  });

  it('decoupe en lots de 500 (attributs) et 100 (geometrie)', async () => {
    const api = fakeDocApi();
    const rows = Array.from({ length: 1200 }, (_, i) => ({ code: 'c' + i }));
    const attr = mkLayer('Attr', [{ name: 'code', gType: 'Text' }], rows);
    const geomRows = Array.from({ length: 250 }, () => ({ geometry_json: '{}' }));
    const surf = mkLayer('Surf', [{ name: 'geometry_json', gType: 'Text' }], geomRows, { geomType: 'Polygon' });
    await Q2GImport.importLayers([attr, surf], { docApi: api, schema, sceneLod, logger: silent });
    const sizes = (t) => api.actions.filter((a) => a[0] === 'BulkAddRecord' && a[1] === t).map((a) => a[2].length);
    assert.deepEqual(sizes('Attr'), [500, 500, 200]);
    assert.deepEqual(sizes('Surf'), [100, 100, 50]);
  });

  it('rapporte la progression 10, 25, 40 puis par lot, jusqu a 100 termine', async () => {
    const api = fakeDocApi();
    const l = mkLayer('L', [{ name: 'code', gType: 'Text' }], [{ code: 'a' }]);
    const calls = [];
    await Q2GImport.importLayers([l], {
      docApi: api, schema, sceneLod, logger: silent,
      onProgress: (...a) => calls.push(a),
    });
    assert.deepEqual(calls.map((c) => c[1]), [10, 25, 40, 95, 100]);
    assert.deepEqual(calls[calls.length - 1], ['L', 100, true, undefined]);
  });

  it('continue apres une erreur de couche (reprise) et signale l erreur', async () => {
    const api = fakeDocApi({ failOn: (a) => a[0] === 'AddTable' && a[1] === 'Mauvaise' });
    const bad = mkLayer('Mauvaise', [{ name: 'code', gType: 'Text' }], [{ code: 'a' }]);
    const good = mkLayer('Bonne', [{ name: 'code', gType: 'Text' }], [{ code: 'a' }]);
    const errors = [];
    const done = [];
    const prog = [];
    const res = await Q2GImport.importLayers([bad, good], {
      docApi: api, schema, sceneLod, logger: silent,
      onError: (l, e) => errors.push([l.name, e.message]),
      onLayerDone: (l, t) => done.push(t),
      onProgress: (n, p, d, e) => prog.push([n, p, d, e]),
    });
    assert.equal(res.allOk, false);
    assert.deepEqual(errors, [['Mauvaise', 'echec simule']]);
    assert.deepEqual(res.layerErrors, { Mauvaise: 'echec simule' });
    assert.deepEqual(done, ['Bonne']);
    assert.deepEqual(prog.find((p) => p[0] === 'Mauvaise' && p[3]), ['Mauvaise', 100, false, true]);
  });

  it('un enfant dont le parent a echoue recoit des Ref vides (0)', async () => {
    const api = fakeDocApi({ failOn: (a) => a[0] === 'AddTable' && a[1] === 'Parent' });
    const parent = mkLayer('Parent', fieldsParent(), [{ code: 'a' }]);
    const child = mkLayer('Enfant', fieldsChild(), [{ id_p: 'a' }]);
    const res = await Q2GImport.importLayers([parent, child], { docApi: api, schema, sceneLod, logger: silent });
    assert.deepEqual(api.stored.Enfant.id_p, [0]);
    assert.ok(res.layerErrors.Parent);
  });

  it('une Ref vers une couche non importee devient du texte (Grist refuse sinon tous les lots)', async () => {
    const api = fakeDocApi();
    // Parent absent de la selection (couche sans donnees, exclue) : le type Ref:Parent ferait
    // echouer chaque BulkAddRecord dans Grist reel, meme avec des valeurs vides.
    const fields = [
      { name: 'id_p', gType: 'Ref:Parent', _refTargetTable: 'Parent', _refTargetField: 'code' },
      { name: 'liste', gType: 'RefList:Parent', _refTargetTable: 'Parent', _refTargetField: 'code' },
    ];
    const child = mkLayer('Enfant', fields, [{ id_p: 'b', liste: 'a,b' }, { id_p: null, liste: null }]);
    const res = await Q2GImport.importLayers([child], { docApi: api, schema, sceneLod, logger: silent });
    const add = api.actions.find((a) => a[0] === 'AddTable' && a[1] === 'Enfant');
    assert.equal(add[2].find((c) => c.id === 'id_p').type, 'Text');
    assert.equal(add[2].find((c) => c.id === 'liste').type, 'Text');
    assert.deepEqual(api.stored.Enfant.id_p, ['b', null]);
    assert.deepEqual(api.stored.Enfant.liste, ['a,b', null]);
    assert.equal(res.allOk, true);
  });

  it('une Ref vers une couche importee reste une Ref', async () => {
    const api = fakeDocApi();
    const parent = mkLayer('Parent', [{ name: 'code', gType: 'Text' }], [{ code: 'a' }]);
    const child = mkLayer('Enfant', [{ name: 'id_p', gType: 'Ref:Parent', _refTargetTable: 'Parent', _refTargetField: 'code' }], [{ id_p: 'a' }]);
    await Q2GImport.importLayers([child, parent], { docApi: api, schema, sceneLod, logger: silent });
    const add = api.actions.find((a) => a[0] === 'AddTable' && a[1] === 'Enfant');
    assert.equal(add[2][0].type, 'Ref:Parent');
    assert.deepEqual(api.stored.Enfant.id_p, [1]);
  });

  it('annulation par signal : arrete avant le lot suivant', async () => {
    const api = fakeDocApi();
    const ctl = new AbortController();
    const rows = Array.from({ length: 1200 }, (_, i) => ({ code: 'c' + i }));
    const l1 = mkLayer('L1', [{ name: 'code', gType: 'Text' }], rows);
    const l2 = mkLayer('L2', [{ name: 'code', gType: 'Text' }], [{ code: 'a' }]);
    const res = await Q2GImport.importLayers([l1, l2], {
      docApi: api, schema, sceneLod, logger: silent, signal: ctl.signal,
      onProgress: (n, p) => { if (n === 'L1' && p >= 60) ctl.abort(); },
    });
    assert.equal(res.aborted, true);
    assert.equal(api.actions.filter((a) => a[0] === 'BulkAddRecord').length, 1);
    assert.ok(!api.tables.has('L2'));
  });

  it('sans signal, comportement par defaut inchange (aborted=false)', async () => {
    const api = fakeDocApi();
    const l = mkLayer('L', [{ name: 'code', gType: 'Text' }], [{ code: 'a' }]);
    const res = await Q2GImport.importLayers([l], { docApi: api, schema, sceneLod, logger: silent });
    assert.equal(res.aborted, false);
    assert.equal(res.allOk, true);
  });

  it('utilise makeMarkerColorFn fourni', async () => {
    const api = fakeDocApi();
    const l = mkLayer('L', [{ name: 'code', gType: 'Text' }], [{ code: 'a' }, { code: 'b' }]);
    await Q2GImport.importLayers([l], {
      docApi: api, schema, sceneLod, logger: silent,
      makeMarkerColorFn: () => (r) => (r.code === 'a' ? '#aaa' : '#bbb'),
    });
    assert.deepEqual(api.stored.L.fill_color, ['#aaa', '#bbb']);
  });
});

describe('repairMissingPointLon', () => {
  it('repare la longitude manquante via BulkUpdateRecord', async () => {
    const api = fakeDocApi();
    api.stored.T = { latitude: [1, 2, 3], longitude: [10, null, ''] };
    const src = [{ longitude: 10 }, { longitude: '20.5' }, { Longitude: 30 }];
    await Q2GImport.repairMissingPointLon('T', src, {}, { docApi: api, logger: silent });
    const upd = api.actions.find((a) => a[0] === 'BulkUpdateRecord');
    assert.deepEqual(upd, ['BulkUpdateRecord', 'T', [2, 3], { longitude: [20.5, 30] }]);
  });

  it('ne fait rien et ne leve pas si fetchTable echoue', async () => {
    const api = { fetchTable: async () => { throw new Error('x'); }, applyUserActions: async () => {} };
    await Q2GImport.repairMissingPointLon('T', [], {}, { docApi: api, logger: silent });
  });
});

describe('lots et lecture de reparation (options)', () => {
  const rowsN = (n) => Array.from({ length: n }, (_, i) => ({ code: 'C' + i, latitude: 43, longitude: 5 }));
  const ptFields = [{ name: 'code', gType: 'Text' }, { name: 'latitude', gType: 'Numeric' }, { name: 'longitude', gType: 'Numeric' }];
  const run = (n, extra) => {
    const api = fakeDocApi();
    const layer = mkLayer('Pts', ptFields.map((f) => ({ ...f })), rowsN(n), { geomType: 'Point', _lod: { mode: 'inline' } });
    return Q2GImport.importLayers([layer], { docApi: api, schema, sceneLod, logger: silent, ...extra })
      .then((res) => ({ api, res }));
  };
  const bulks = (api) => api.actions.filter((a) => a[0] === 'BulkAddRecord');

  it('planBatches sans option : 500 lignes sans geometrie, 100 avec', () => {
    assert.deepEqual(Q2GImport.planBatches(rowsN(1200), ptFields, false, {}).map((b) => b[1] - b[0]), [500, 500, 200]);
    assert.deepEqual(Q2GImport.planBatches(rowsN(250), ptFields, true, {}).map((b) => b[1] - b[0]), [100, 100, 50]);
  });

  it('planBatches borne par lignes et par octets, couvre tout sans trou', () => {
    const r = rowsN(1000);
    const byRows = Q2GImport.planBatches(r, ptFields, false, { batchMaxRows: 300 });
    assert.deepEqual(byRows.map((b) => b[1] - b[0]), [300, 300, 300, 100]);
    const byBytes = Q2GImport.planBatches(r, ptFields, false, { batchMaxBytes: 2000 });
    assert.equal(byBytes[0][0], 0);
    assert.equal(byBytes[byBytes.length - 1][1], 1000);
    for (let i = 1; i < byBytes.length; i++) assert.equal(byBytes[i][0], byBytes[i - 1][1]);
    assert.ok(byBytes.length > 1 && byBytes.length < 1000);
  });

  it('defaut inchange : memes appels que la taille historique', async () => {
    const { api } = await run(1200, {});
    assert.deepEqual(bulks(api).map((a) => a[2].length), [500, 500, 200]);
  });

  it('lots plus gros : memes donnees finales, moins d appels', async () => {
    const base = await run(1200, {});
    const gros = await run(1200, { batchMaxRows: 5000 });
    assert.equal(bulks(gros.api).length, 1);
    assert.deepEqual(gros.api.stored.Pts, base.api.stored.Pts);
  });

  it('pointLonRepairPossible suit la regle de repairMissingPointLon', () => {
    assert.equal(Q2GImport.pointLonRepairPossible([{ longitude: 5 }, { longitude: '' }]), false);
    assert.equal(Q2GImport.pointLonRepairPossible([{ longitude: null, lon: 'x' }]), false);
    assert.equal(Q2GImport.pointLonRepairPossible([{ longitude: null, Longitude: '5.2' }]), true);
    assert.equal(Q2GImport.pointLonRepairPossible([{ lon: 5 }]), true);
  });

  it('skipUselessRepairFetch : pas de fetchTable si rien a reparer, sinon repare comme avant', async () => {
    let fetches = 0;
    const api = fakeDocApi();
    const orig = api.fetchTable;
    api.fetchTable = async (n) => { fetches++; return orig(n); };
    const layer = mkLayer('Pts', ptFields.map((f) => ({ ...f })), rowsN(10), { geomType: 'Point', _lod: { mode: 'inline' } });
    await Q2GImport.importLayers([layer], { docApi: api, schema, sceneLod, logger: silent, skipUselessRepairFetch: true });
    assert.equal(fetches, 0);
    // une ligne reparable : la lecture a bien lieu et la longitude est corrigee
    const api2 = fakeDocApi();
    const rows = rowsN(3); rows[1] = { code: 'x', latitude: 43, longitude: null, Longitude: '5.5' };
    const l2 = mkLayer('Pts', ptFields.map((f) => ({ ...f })), rows, { geomType: 'Point', _lod: { mode: 'inline' } });
    await Q2GImport.importLayers([l2], { docApi: api2, schema, sceneLod, logger: silent, skipUselessRepairFetch: true });
    assert.ok(api2.actions.some((a) => a[0] === 'BulkUpdateRecord' && a[3].longitude[0] === 5.5));
  });
});
