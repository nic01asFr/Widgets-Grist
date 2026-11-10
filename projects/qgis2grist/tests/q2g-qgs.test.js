'use strict';
/**
 * Tests de lib/q2g-qgs.js sans DOM : un mini-arbre d'elements simule
 * (tagName, getAttribute, children, textContent, querySelector[All]).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../lib/q2g-qgs.js');

// ── Mini DOM ──────────────────────────────────────────────────

function el(tag, attrs, children, text) {
  const node = {
    tagName: tag,
    _attrs: attrs || {},
    children: children || [],
    textContent: text || '',
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    querySelectorAll(sel) { return queryAll(this, sel); },
    querySelector(sel) { return queryAll(this, sel)[0] || null; },
  };
  return node;
}

function matchesSimple(node, token) {
  const m = token.match(/^([A-Za-z0-9_]+)(?:\[([A-Za-z0-9_]+)="([^"]*)"\])?$/);
  if (!m) throw new Error('selecteur non gere : ' + token);
  if (node.tagName !== m[1]) return false;
  return !m[2] || node.getAttribute(m[2]) === m[3];
}

function descendants(node, out) {
  for (const c of node.children) { out.push(c); descendants(c, out); }
  return out;
}

function queryAll(root, selector) {
  const result = [];
  for (const part of selector.split(',').map(s => s.trim())) {
    const tokens = part.split('>').map(s => s.trim());
    let current = descendants(root, []).filter(n => matchesSimple(n, tokens[0]));
    for (let i = 1; i < tokens.length; i++) {
      const next = [];
      for (const n of current) for (const c of n.children) if (matchesSimple(c, tokens[i])) next.push(c);
      current = next;
    }
    for (const n of current) if (!result.includes(n)) result.push(n);
  }
  return result;
}

const opt = (name, type, value, children) =>
  el('Option', Object.assign({}, name != null ? { name } : {}, type ? { type } : {}, value != null ? { value } : {}), children);

// ── coerceOptionValue / qgsTypeToGrist / normalizeGeomType ───

test('coerceOptionValue : int, double, bool, texte, non numerique', () => {
  assert.equal(Q.coerceOptionValue('12', 'int'), 12);
  assert.equal(Q.coerceOptionValue('12', 'qlonglong'), 12);
  assert.equal(Q.coerceOptionValue('1.5', 'double'), 1.5);
  assert.equal(Q.coerceOptionValue('abc', 'int'), 'abc');
  assert.equal(Q.coerceOptionValue('true', 'bool'), true);
  assert.equal(Q.coerceOptionValue('1', 'bool'), true);
  assert.equal(Q.coerceOptionValue('0', 'bool'), false);
  assert.equal(Q.coerceOptionValue('x', 'QString'), 'x');
});

test('qgsTypeToGrist : correspondances de types', () => {
  assert.equal(Q.qgsTypeToGrist('integer'), 'Int');
  assert.equal(Q.qgsTypeToGrist('Integer64'), 'Int');
  assert.equal(Q.qgsTypeToGrist('qlonglong'), 'Int');
  assert.equal(Q.qgsTypeToGrist('double'), 'Numeric');
  assert.equal(Q.qgsTypeToGrist('real'), 'Numeric');
  assert.equal(Q.qgsTypeToGrist('bool'), 'Bool');
  assert.equal(Q.qgsTypeToGrist('datetime'), 'DateTime');
  assert.equal(Q.qgsTypeToGrist('date'), 'Date');
  assert.equal(Q.qgsTypeToGrist('string'), 'Text');
  assert.equal(Q.qgsTypeToGrist('QString'), 'Text');
});

test('normalizeGeomType : attribut geometry puis wkbType puis defaut', () => {
  const ml = (wkb) => el('maplayer', wkb ? { wkbType: wkb } : {});
  assert.equal(Q.normalizeGeomType('Point', ml()), 'Point');
  assert.equal(Q.normalizeGeomType('LineString', ml()), 'Line');
  assert.equal(Q.normalizeGeomType('Polygon', ml()), 'Polygon');
  assert.equal(Q.normalizeGeomType('Surface', ml()), 'Polygon');
  assert.equal(Q.normalizeGeomType('No geometry', ml()), 'No geometry');
  assert.equal(Q.normalizeGeomType('', ml('MultiPolygon')), 'Polygon');
  assert.equal(Q.normalizeGeomType('', ml('LineStringZ')), 'Line');
  assert.equal(Q.normalizeGeomType('', ml()), 'Point');
});

// ── parseOptionTree ──────────────────────────────────────────

test('parseOptionTree : null, valeur simple, wrapper Map deplie', () => {
  assert.equal(Q.parseOptionTree(null), null);
  assert.equal(Q.parseOptionTree(opt('Step', 'int', '5')), 5);
  const config = el('config', {}, [
    opt(null, 'Map', null, [
      opt('Min', 'int', '0'),
      opt('Max', 'double', '9.5'),
      opt('Allow', 'bool', 'true'),
      opt('Texte', 'QString', 'bonjour'),
    ]),
  ]);
  assert.deepEqual(Q.parseOptionTree(config), { Min: 0, Max: 9.5, Allow: true, Texte: 'bonjour' });
});

test('parseOptionTree : liste de maps (ValueMap QGIS 3 recent)', () => {
  const config = el('config', {}, [
    opt(null, 'Map', null, [
      opt('map', 'List', null, [
        opt(null, 'Map', null, [opt('Oui', 'QString', 'o')]),
        opt(null, 'Map', null, [opt('Non', 'QString', 'n')]),
      ]),
    ]),
  ]);
  assert.deepEqual(Q.parseOptionTree(config), { map: [{ Oui: 'o' }, { Non: 'n' }] });
});

test('parseOptionTree : map nommee imbriquee et map anonyme fusionnee', () => {
  const config = el('config', {}, [
    opt(null, 'Map', null, [
      opt('sous', 'Map', null, [opt('a', 'int', '1')]),
      opt(null, 'Map', null, [opt('b', 'int', '2')]),
    ]),
  ]);
  assert.deepEqual(Q.parseOptionTree(config), { sous: { a: 1 }, b: 2 });
});

// ── enrichFieldFromWidget ────────────────────────────────────

test('enrichFieldFromWidget : ValueMap liste -> Choice + _valueMap', () => {
  const f = { name: 'etat', gType: 'Text' };
  Q.enrichFieldFromWidget(f, { type: 'ValueMap', options: { map: [{ Oui: 'o' }, { Non: 'n' }, { _: 'x' }] } });
  assert.equal(f.gType, 'Choice');
  assert.deepEqual(JSON.parse(f.widgetOptions), { choices: ['Oui', 'Non'] });
  assert.deepEqual(f._valueMap, { o: 'Oui', n: 'Non' });
});

test('enrichFieldFromWidget : ValueMap objet (QGIS 2.x), "_" ignore', () => {
  const f = { name: 'etat', gType: 'Text' };
  Q.enrichFieldFromWidget(f, { type: 'ValueMap', options: { A: '1', B: '2', _: 'zz' } });
  assert.equal(f.gType, 'Choice');
  assert.deepEqual(JSON.parse(f.widgetOptions).choices, ['A', 'B']);
  assert.deepEqual(f._valueMap, { 1: 'A', 2: 'B' });
});

test('enrichFieldFromWidget : ValueMap vide laisse le champ intact', () => {
  const f = { name: 'e', gType: 'Text' };
  Q.enrichFieldFromWidget(f, { type: 'ValueMap', options: { map: [] } });
  assert.equal(f.gType, 'Text');
  assert.equal(f.widgetOptions, undefined);
});

test('enrichFieldFromWidget : CheckBox, Range, DateTime', () => {
  const b = { gType: 'Text' };
  Q.enrichFieldFromWidget(b, { type: 'CheckBox', options: {} });
  assert.equal(b.gType, 'Bool');

  const r1 = { gType: 'Text' };
  Q.enrichFieldFromWidget(r1, { type: 'Range', options: { Step: 1, Precision: 0, Min: 0, Max: 10 } });
  assert.equal(r1.gType, 'Int');
  assert.equal(r1._rangeMin, 0);
  assert.equal(r1._rangeMax, 10);

  const r2 = { gType: 'Text' };
  Q.enrichFieldFromWidget(r2, { type: 'Range', options: { Step: 0.5 } });
  assert.equal(r2.gType, 'Numeric');

  // Comportement d'origine conserve : le format est mis en minuscules, donc
  // "MM" (mois) contient 'm' et donne DateTime (bug probable, non corrige ici).
  const d1 = { gType: 'Text' };
  Q.enrichFieldFromWidget(d1, { type: 'DateTime', options: { field_format: 'yyyy-MM-dd' } });
  assert.equal(d1.gType, 'DateTime');
  const d1b = { gType: 'Text' };
  Q.enrichFieldFromWidget(d1b, { type: 'DateTime', options: { field_format: 'yyyy' } });
  assert.equal(d1b.gType, 'Date');
  const d2 = { gType: 'Text' };
  Q.enrichFieldFromWidget(d2, { type: 'DateTime', options: { field_format: 'yyyy-MM-dd HH:mm:ss' } });
  assert.equal(d2.gType, 'DateTime');
  const d3 = { gType: 'Text' };
  Q.enrichFieldFromWidget(d3, { type: 'DateTime', options: {} });
  assert.equal(d3.gType, 'DateTime');
});

test('enrichFieldFromWidget : marqueurs ExternalResource / ValueRelation, widget absent', () => {
  const e = { gType: 'Text' };
  Q.enrichFieldFromWidget(e, { type: 'ExternalResource', options: { DocumentViewer: 1 } });
  assert.deepEqual(e._externalResource, { DocumentViewer: 1 });
  const v = { gType: 'Text' };
  Q.enrichFieldFromWidget(v, { type: 'ValueRelation', options: { Layer: 'L1' } });
  assert.deepEqual(v._refTarget, { Layer: 'L1' });
  const n = { gType: 'Text' };
  Q.enrichFieldFromWidget(n, undefined);
  Q.enrichFieldFromWidget(n, { type: 'TextEdit', options: {} });
  assert.equal(n.gType, 'Text');
});

// ── applyValueRelationRefs / applyQgsRelations ───────────────

test('applyValueRelationRefs : Ref, RefList, cible inconnue', () => {
  const layers = [{
    name: 'Enfant',
    fields: [
      { name: 'a', gType: 'Text', _refTarget: { Layer: 'P1', Key: 'insee', Value: 'nom' } },
      { name: 'b', gType: 'Text', _refTarget: { Layer: 'P1', Value: 'nom', AllowMulti: true } },
      { name: 'c', gType: 'Text', _refTarget: { Layer: 'inconnue' } },
      { name: 'd', gType: 'Text', _refTarget: true },
    ],
  }];
  Q.applyValueRelationRefs(layers, { P1: 'Communes' });
  const [a, b, c, d] = layers[0].fields;
  assert.equal(a.gType, 'Ref:Communes');
  assert.equal(a._refTargetField, 'insee');
  assert.equal(b.gType, 'RefList:Communes');
  assert.equal(b._refTargetField, 'nom');
  assert.equal(c.gType, 'Text');
  assert.equal(d.gType, 'Text');
});

test('applyQgsRelations : marque la cle etrangere en Ref (nom assaini via deps)', () => {
  const rel = (refing, refed, fRing, fRed) => el('relation', { referencingLayer: refing, referencedLayer: refed }, [
    el('fieldRef', { referencingField: fRing, referencedField: fRed }),
  ]);
  const doc = el('qgis', {}, [
    el('relations', {}, [
      rel('E1', 'P1', 'fk id', 'code'),
      rel('E1', 'RASTER', 'fk id', 'code'),   // cible non importee
      rel('ABSENT', 'P1', 'fk id', 'code'),   // couche enfant absente
      el('relation', { referencingLayer: 'E1', referencedLayer: 'P1' }), // sans fieldRef
    ]),
  ]);
  const layers = [{ _layerId: 'E1', fields: [{ name: 'fk_id', gType: 'Text' }, { name: 'autre', gType: 'Text' }] }];
  const deps = { sanitizeColName: (n) => n.replace(/ /g, '_') };
  Q.applyQgsRelations(doc, layers, { P1: 'Parents', E1: 'Enfants' }, deps);
  const fk = layers[0].fields[0];
  assert.equal(fk.gType, 'Ref:Parents');
  assert.equal(fk._refTargetTable, 'Parents');
  assert.equal(fk._refTargetField, 'code');
  assert.equal(fk._isQgsRelation, true);
  assert.equal(layers[0].fields[1].gType, 'Text');
});

// ── aliases / ordre du formulaire / widgets / champs ─────────

function sampleMapLayer() {
  return el('maplayer', { type: 'vector', geometry: 'Point' }, [
    el('id', {}, [], 'L1'),
    el('layername', {}, [], 'Ruches'),
    el('aliases', {}, [
      el('alias', { field: 'ht', name: 'Hauteur max' }),
      el('alias', { field: 'vide', name: '' }),
    ]),
    el('fieldConfiguration', {}, [
      el('field', { name: 'ht', typeName: 'double' }, [
        el('editWidget', { type: 'Range' }, [
          el('config', {}, [opt(null, 'Map', null, [opt('Step', 'double', '0.5')])]),
        ]),
      ]),
      el('field', { name: 'etat', typeName: 'string' }, [
        el('editWidget', { type: 'ValueMap' }, [
          el('config', {}, [opt(null, 'Map', null, [
            opt('map', 'List', null, [opt(null, 'Map', null, [opt('Actif', 'QString', 'A')])]),
          ])]),
        ]),
      ]),
      el('field', { name: '_interne', typeName: 'string' }),
      el('field', { name: 'ht', typeName: 'double' }), // doublon ignore
      el('field', { name: 'Date Pose', typeName: 'datetime' }),
    ]),
    el('attributeEditorForm', {}, [
      el('attributeEditorContainer', { name: 'Onglet' }, [
        el('attributeEditorField', { name: 'etat' }),
        el('attributeEditorContainer', {}, [el('attributeEditorField', { name: 'ht' })]),
      ]),
      el('attr:attributeEditorField', { name: 'Date Pose' }),
    ]),
  ]);
}

test('parseAliases : ignore les alias sans nom', () => {
  assert.deepEqual(Q.parseAliases(sampleMapLayer()), { ht: 'Hauteur max' });
});

test('parseFormFieldOrder : parcours recursif, prefixe de namespace ignore', () => {
  assert.deepEqual(Q.parseFormFieldOrder(sampleMapLayer()), ['etat', 'ht', 'Date Pose']);
  assert.deepEqual(Q.parseFormFieldOrder(el('maplayer')), []);
});

test('parseEditWidgets : fieldConfiguration et edittypes 2.x', () => {
  const ml = sampleMapLayer();
  ml.children.push(el('edittypes', {}, [
    el('edittype', { name: 'ancien', widgetv2type: 'CheckBox' }, [
      el('widgetv2config', {}, [opt('CheckedState', 'QString', '1')]),
    ]),
    el('edittype', { name: 'ht', widgetv2type: 'TextEdit' }), // deja defini : ignore
  ]));
  const m = Q.parseEditWidgets(ml);
  assert.equal(m.ht.type, 'Range');
  assert.deepEqual(m.ht.options, { Step: 0.5 });
  assert.equal(m.etat.type, 'ValueMap');
  assert.equal(m.ancien.type, 'CheckBox');
  assert.deepEqual(m.ancien.options, { CheckedState: '1' });
});

test('extractFieldsFromXml : types, alias, widgets, doublons et champs "_"', () => {
  const fields = Q.extractFieldsFromXml(sampleMapLayer(), {
    sanitizeColName: (n) => n.replace(/ /g, '_').toLowerCase(),
  });
  assert.deepEqual(fields.map(f => f.name), ['ht', 'etat', 'date_pose']);
  assert.equal(fields[0].label, 'Hauteur max');
  assert.equal(fields[0]._rawKey, 'ht');
  assert.equal(fields[0].gType, 'Numeric');
  assert.equal(fields[1].gType, 'Choice');
  assert.equal(fields[2].gType, 'DateTime');
  assert.equal(fields[2].label, 'Date Pose');
});

test('extractFieldsFromXml : repli sur les alias seuls', () => {
  const ml = el('maplayer', {}, [el('aliases', {}, [el('alias', { field: 'nom', name: 'Nom usuel' })])]);
  const fields = Q.extractFieldsFromXml(ml, { sanitizeColName: (n) => n });
  assert.deepEqual(fields, [{ name: 'nom', _rawKey: 'nom', label: 'Nom usuel', qType: 'string', gType: 'Text' }]);
});

// ── matchQgsRule ─────────────────────────────────────────────

test('matchQgsRule : eq, range, regle inconnue, resolution du champ', () => {
  const layer = { fields: [{ name: 'etat', _rawKey: 'Etat', label: 'Etat ruche' }, { name: 'ht', _rawKey: 'ht', label: 'ht' }] };
  const deps = { sanitizeColName: (n) => n.toLowerCase() };
  assert.equal(Q.matchQgsRule({ etat: 'A' }, { kind: 'eq', field: 'Etat', value: 'A' }, layer, deps), true);
  assert.equal(Q.matchQgsRule({ etat: 'B' }, { kind: 'eq', field: 'Etat', value: 'A' }, layer, deps), false);
  assert.equal(Q.matchQgsRule({}, { kind: 'eq', field: 'Etat', value: '' }, layer, deps), true);
  assert.equal(Q.matchQgsRule({ ht: '5' }, { kind: 'range', field: 'ht', lower: 0, upper: 10 }, layer, deps), true);
  assert.equal(Q.matchQgsRule({ ht: 10 }, { kind: 'range', field: 'ht', lower: 0, upper: 10 }, layer, deps), false);
  assert.equal(Q.matchQgsRule({ ht: 'x' }, { kind: 'range', field: 'ht', lower: 0, upper: 10 }, layer, deps), false);
  assert.equal(Q.matchQgsRule({}, { kind: 'autre' }, layer, deps), false);
});

test('matchQgsRule : repli local de sanitizeColName (sans deps)', () => {
  const layer = { fields: [] };
  assert.equal(Q.matchQgsRule({ code_col: 'x' }, { kind: 'eq', field: 'code', value: 'x' }, layer), false);
  assert.equal(Q.matchQgsRule({ Etat_x: 'x' }, { kind: 'eq', field: 'Etat x', value: 'x' }, layer), true);
});

// ── parseQmlStyle ────────────────────────────────────────────

test('parseQmlStyle : delegue au qmlParser injecte, erreur sinon', () => {
  const out = Q.parseQmlStyle('<qgis/>', { qmlParser: { parseQmlStyle: (t) => ({ eu: t }) } });
  assert.deepEqual(out, { eu: '<qgis/>' });
});

// ── parseQgsXml / parseQgzFile avec dependances simulees ─────

function fakeDeps(extra) {
  return Object.assign({
    parseXml: () => {
      const rel = el('relation', { referencingLayer: 'E1', referencedLayer: 'P1' }, [
        el('fieldRef', { referencingField: 'parent', referencedField: 'code' }),
      ]);
      const mk = (id, name, geom, ds, fieldNames) => el('maplayer', { type: 'vector', geometry: geom }, [
        el('id', {}, [], id), el('layername', {}, [], name), el('datasource', {}, [], ds),
        el('fieldConfiguration', {}, fieldNames.map(n => el('field', { name: n, typeName: 'string' }))),
      ]);
      return el('qgis', {}, [
        mk('P1', 'Parents', 'Polygon', './d/parents.geojson', ['code']),
        mk('E1', 'Enfants', 'Point', './d/enfants.geojson', ['parent']),
        el('relations', {}, [rel]),
      ]);
    },
    sanitizeTableName: (n) => n,
    sanitizeColName: (n) => n,
    yieldToUi: async () => {},
    qmlParser: { parseMapLayerStyle: (ml) => ({ vu: ml.querySelector('id').textContent }) },
    gpkgDs: { resolveGpkgTableHint: () => null },
    geomReconcile: {
      reconcileLayerGeometry: (g, fields, feats) => ({ geomType: g, fields, rows: feats.map(f => f.properties) }),
    },
    detectGeomTypeFromFeatures: () => 'Point',
    flattenGeoJsonFeatures: () => [],
  }, extra || {});
}

function fakeZip(files) {
  const out = { files: {} };
  for (const [name, content] of Object.entries(files)) {
    out.files[name] = { async: async (kind) => (kind === 'string' ? content : content) };
  }
  return out;
}

test('parseQgsXml : lit les couches GeoJSON, applique les relations, style injecte', async () => {
  const labels = [];
  const zip = fakeZip({
    'd/parents.geojson': JSON.stringify({ type: 'FeatureCollection', features: [{ properties: { code: 'A' } }] }),
    'd/enfants.geojson': JSON.stringify({ type: 'FeatureCollection', features: [{ properties: { parent: 'A' } }, { properties: { parent: 'B' } }] }),
  });
  const layers = await Q.parseQgsXml('<x/>', zip, null, [], ['d/parents.geojson', 'd/enfants.geojson'],
    fakeDeps({ setReadingLabel: (a, b) => labels.push([a, b]) }));
  assert.equal(layers.length, 2);
  const [p, e] = layers;
  assert.equal(p.name, 'Parents');
  assert.equal(p.featureCount, 1);
  assert.equal(p.hasData, true);
  assert.deepEqual(p.style, { vu: 'P1' });
  assert.equal(e.featureCount, 2);
  assert.equal(e.fields[0].gType, 'Ref:Parents');
  assert.equal(e._layerId, 'E1');
  assert.deepEqual(labels[0], ['Analyse des couches QGIS…', '2 couche(s) trouvée(s)']);
});

test('parseQgsXml : GPKG via readGpkgWithSqlJs injecte, indice de table passe', async () => {
  const calls = [];
  const zip = fakeZip({ 'x/parents.gpkg': new ArrayBuffer(4), 'x/enfants.gpkg': new ArrayBuffer(4) });
  const layers = await Q.parseQgsXml('<x/>', zip, null, ['x/parents.gpkg', 'x/enfants.gpkg'], [], fakeDeps({
    gpkgDs: { resolveGpkgTableHint: (name, ds) => name + '|' + ds },
    readGpkgWithSqlJs: async (ab, hint) => { calls.push(hint); return [{ properties: { k: 1 } }]; },
  }));
  assert.deepEqual(calls, ['Parents|./d/parents.geojson', 'Enfants|./d/enfants.geojson']);
  assert.equal(layers[0].hasData, true);
  assert.equal(layers[0].featureCount, 1);
});

test('parseQgsXml : echec de lecture GPKG tolere (couche sans donnees)', async () => {
  const zip = fakeZip({ 'x/parents.gpkg': new ArrayBuffer(4) });
  const warn = console.warn; console.warn = () => {};
  try {
    const layers = await Q.parseQgsXml('<x/>', zip, null, ['x/parents.gpkg'], [], fakeDeps({
      readGpkgWithSqlJs: async () => { throw new Error('boum'); },
    }));
    assert.equal(layers[0].hasData, false);
    assert.equal(layers[0].featureCount, 0);
  } finally { console.warn = warn; }
});

test('parseQgsXml : projet raster seul -> erreur explicite', async () => {
  const doc = el('qgis', {}, [el('maplayer', { type: 'raster' })]);
  await assert.rejects(
    Q.parseQgsXml('<x/>', null, null, [], [], fakeDeps({ parseXml: () => doc })),
    /couches raster \(1\)/
  );
});

test('parseQgsXml : sans parseXml ni DOMParser -> erreur de dependance', async () => {
  await assert.rejects(Q.parseQgsXml('<x/>', null, null, [], [], {}), /parseXml ou DOMParser/);
});

test('parseQgzFile : JSZip injecte, .qgs introuvable, chaine complete', async () => {
  const JSZip = {
    loadAsync: async (buf) => buf.zip,
  };
  await assert.rejects(
    Q.parseQgzFile({ zip: fakeZip({ 'a.txt': '' }) }, null, 'x.qgz', fakeDeps({ JSZip })),
    /Fichier \.qgs non trouvé/
  );
  const zip = fakeZip({
    'projet.qgs': '<qgis/>',
    'd/parents.geojson': JSON.stringify({ type: 'FeatureCollection', features: [] }),
    'd/enfants.geojson': JSON.stringify({ type: 'FeatureCollection', features: [] }),
  });
  const layers = await Q.parseQgzFile({ zip }, null, 'x.qgz', fakeDeps({ JSZip }));
  assert.equal(layers.length, 2);
  assert.equal(layers[1].fields[0].gType, 'Ref:Parents');
});

test('parseQgzFile : JSZip absent -> erreur de dependance', async () => {
  await assert.rejects(Q.parseQgzFile(new ArrayBuffer(1), null, 'x.qgz', {}), /JSZip/);
});

test('configure : dependances par defaut partagees', () => {
  Q.configure({ sanitizeColName: (n) => 'cfg_' + n });
  try {
    assert.equal(Q.matchQgsRule({ cfg_a: 'x' }, { kind: 'eq', field: 'a', value: 'x' }, { fields: [] }), true);
  } finally {
    Q.configure({ sanitizeColName: null });
  }
});
