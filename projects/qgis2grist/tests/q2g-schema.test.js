'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/q2g-schema.js');

test('sanitizeTableName : accents, chiffre initial, minuscule, vide', () => {
  assert.equal(S.sanitizeTableName('Bâtiments été'), 'Batiments_ete');
  assert.equal(S.sanitizeTableName('2024 zones'), 'T2024_zones');
  assert.equal(S.sanitizeTableName('foo_bar'), 'Foo_bar');
  assert.equal(S.sanitizeTableName('  '), 'Couche');
  assert.equal(S.sanitizeTableName('***'), 'Couche');
  assert.equal(S.sanitizeTableName('a--b  c'), 'A_b_c');
  assert.equal(S.sanitizeTableName('_x_'), 'X');
});

test('sanitizeTableName : pas de deduplication (collision laissee a l appelant)', () => {
  assert.equal(S.sanitizeTableName('Rue-1'), S.sanitizeTableName('Rue 1'));
  // Ecart note : un nom purement numerique ne devient pas "Couche" mais T123.
  assert.equal(S.sanitizeTableName('123'), 'T123');
});

test('sanitizeColName : accents et caracteres speciaux', () => {
  assert.equal(S.sanitizeColName('Surface (m²)'), 'Surface_m');
  assert.equal(S.sanitizeColName('Écoulement'), 'Ecoulement');
  assert.equal(S.sanitizeColName('1er'), 'c1er');
  assert.equal(S.sanitizeColName('???'), 'col');
  assert.equal(S.sanitizeColName(''), 'col');
});

test('sanitizeColName : mots reserves Python et Grist, insensible a la casse', () => {
  assert.equal(S.sanitizeColName('class'), 'class_col');
  assert.equal(S.sanitizeColName('Class'), 'Class_col');
  assert.equal(S.sanitizeColName('id'), 'id_col');
  assert.equal(S.sanitizeColName('ID'), 'ID_col');
  assert.equal(S.sanitizeColName('manualSort'), 'manualSort_col');
  assert.equal(S.sanitizeColName('None'), 'None_col');
  assert.equal(S.sanitizeColName('from'), 'from_col');
  assert.equal(S.sanitizeColName('nom'), 'nom');
});

test('sanitizeColName : prefixe gristHelper_', () => {
  assert.equal(S.sanitizeColName('gristHelper_Display'), 'col_gristHelper_Display');
  assert.equal(S.sanitizeColName('GRISTHELPER_x'), 'col_GRISTHELPER_x');
});

test('sanitizeColName : collisions (deux noms bruts, meme nom Grist)', () => {
  assert.equal(S.sanitizeColName('a b'), S.sanitizeColName('a-b'));
  assert.equal(S.sanitizeColName('Été'), S.sanitizeColName('Ete'));
  // Ecart note : "id_" perd son underscore final puis devient reserve.
  assert.equal(S.sanitizeColName('id_'), 'id_col');
});

test('inferType / jsTypeToGrist', () => {
  assert.equal(S.inferType(null), 'string');
  assert.equal(S.inferType(undefined), 'string');
  assert.equal(S.inferType(true), 'boolean');
  assert.equal(S.inferType(3), 'integer');
  assert.equal(S.inferType(3.5), 'double');
  assert.equal(S.inferType('x'), 'string');
  assert.equal(S.inferType({}), 'string');
  assert.equal(S.jsTypeToGrist(null), 'Text');
  assert.equal(S.jsTypeToGrist(false), 'Bool');
  assert.equal(S.jsTypeToGrist(7), 'Int');
  assert.equal(S.jsTypeToGrist(7.25), 'Numeric');
  assert.equal(S.jsTypeToGrist('7'), 'Text');
  // Ecarts notes : 1.0 est entier en JS ; NaN et Infinity ne sont pas entiers.
  assert.equal(S.jsTypeToGrist(1.0), 'Int');
  assert.equal(S.jsTypeToGrist(NaN), 'Numeric');
  assert.equal(S.jsTypeToGrist(Infinity), 'Numeric');
  // Tableaux et objets : Text (sera serialise par l'appelant).
  assert.equal(S.jsTypeToGrist([1]), 'Text');
});

test('rowStoreKey : id, vide, _localId stable et sequentiel', () => {
  S._resetRowSeq();
  assert.equal(S.rowStoreKey({ id: 5 }), 5);
  assert.equal(S.rowStoreKey({ id: 0 }), 0);
  const a = {};
  assert.equal(S.rowStoreKey(a), 'L1');
  assert.equal(S.rowStoreKey(a), 'L1');
  assert.equal(S.rowStoreKey({ id: '' }), 'L2');
  assert.equal(S.rowStoreKey({ id: null }), 'L3');
  assert.equal(S.rowStoreKey({ _localId: 9 }), 9);
});

test('detectGeomTypeFromFeatures : votes et cas par defaut', () => {
  const f = (t) => ({ geometry: t ? { type: t } : null });
  assert.equal(S.detectGeomTypeFromFeatures([]), 'Polygon');
  assert.equal(S.detectGeomTypeFromFeatures([f('Point'), f('Point')]), 'Point');
  assert.equal(S.detectGeomTypeFromFeatures([f('MultiPoint')]), 'Point');
  assert.equal(S.detectGeomTypeFromFeatures([f('LineString'), f('MultiLineString')]), 'Line');
  assert.equal(S.detectGeomTypeFromFeatures([f('MultiPolygon')]), 'Polygon');
  assert.equal(S.detectGeomTypeFromFeatures([f('Point'), f('LineString'), f('Polygon')]), 'Polygon');
  assert.equal(S.detectGeomTypeFromFeatures([f('Point'), f('LineString')]), 'Line');
  assert.equal(S.detectGeomTypeFromFeatures([f(null), f(null)]), 'Polygon');
  // Seuls les 50 premiers comptent.
  const many = Array.from({ length: 50 }, () => f('Point')).concat(Array.from({ length: 100 }, () => f('Polygon')));
  assert.equal(S.detectGeomTypeFromFeatures(many), 'Point');
  // Ecart note : un type inconnu (GeometryCollection) ne vote pas.
  assert.equal(S.detectGeomTypeFromFeatures([f('GeometryCollection')]), 'Polygon');
});

test('flattenGeoJsonFeatures : polygone, arrondi 5 decimales, centroide, _localId', () => {
  const fields = [{ name: 'nom', label: 'Nom', _rawKey: 'Nom' }, { name: 'x', label: 'x' }];
  const feats = [{
    properties: { Nom: 'A', x: 1 },
    geometry: { type: 'Polygon', coordinates: [[[0, 0, 99], [2.123456789, 0], [2, 2], [0, 0]]] },
  }, { properties: null, geometry: null }];
  const rows = S.flattenGeoJsonFeatures(feats, fields, 'Polygon');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].nom, 'A');
  assert.equal(rows[0].x, 1);
  assert.equal(rows[0]._localId, 1);
  assert.equal(rows[1]._localId, 2);
  const g = JSON.parse(rows[0].geometry_json);
  assert.deepEqual(g.coordinates[0][0], [0, 0]); // Z retire
  assert.equal(g.coordinates[0][1][0], 2.12346);
  assert.equal(typeof rows[0].centroid_lat, 'number');
  // Sans geometrie : champs metier nuls, pas de colonnes geo.
  assert.equal(rows[1].nom, null);
  assert.equal('geometry_json' in rows[1], false);
});

test('flattenGeoJsonFeatures : priorite _rawKey > label > name, Point et MultiPoint', () => {
  const fields = [
    { name: 'a', _rawKey: 'raw', label: 'Alias' },
    { name: 'b', label: 'lb' },
    { name: 'c', label: 'absent' },
  ];
  const feats = [
    { properties: { raw: 1, Alias: 2, lb: 3, c: 4 }, geometry: { type: 'Point', coordinates: [5, 6] } },
    { properties: {}, geometry: { type: 'MultiPoint', coordinates: [[7, 8], [9, 10]] } },
    { properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } },
  ];
  const rows = S.flattenGeoJsonFeatures(feats, fields, 'Point');
  assert.deepEqual([rows[0].a, rows[0].b, rows[0].c], [1, 3, 4]); // c retombe sur name
  assert.equal(rows[0].latitude, 6);
  assert.equal(rows[0].longitude, 5);
  assert.equal(rows[1].latitude, 8);
  assert.equal(rows[2].latitude, null); // geometrie non ponctuelle dans une couche Point
  assert.equal(rows[2].longitude, null);
});

test('flattenGeoJsonFeatures : une clef a null dans properties est conservee', () => {
  const rows = S.flattenGeoJsonFeatures(
    [{ properties: { k: null }, geometry: null }], [{ name: 'k', label: 'k' }], 'Polygon');
  assert.equal(rows[0].k, null);
});

test('buildLayerFromGeojson : couche Point, champs inferes, renommage', () => {
  const gj = { features: [
    { properties: { 'Hauteur (m)': 3.5, class: 'x', ok: true, n: 1 }, geometry: { type: 'Point', coordinates: [1, 2] } },
    { properties: { 'Hauteur (m)': null, extra: 'e' }, geometry: { type: 'Point', coordinates: [3, 4] } },
  ] };
  const l = S.buildLayerFromGeojson('Arbres 2024', gj);
  assert.equal(l.name, 'Arbres_2024');
  assert.equal(l.displayName, 'Arbres 2024');
  assert.equal(l.geomType, 'Point');
  assert.equal(l.datasource, '(GeoJSON)');
  assert.equal(l.featureCount, 2);
  assert.equal(l.hasData, true);
  const byRaw = Object.fromEntries(l.fields.filter(f => f._rawKey).map(f => [f._rawKey, f]));
  assert.equal(byRaw['Hauteur (m)'].name, 'Hauteur_m');
  assert.equal(byRaw['Hauteur (m)'].gType, 'Numeric');
  assert.equal(byRaw['class'].name, 'class_col');
  assert.equal(byRaw['ok'].gType, 'Bool');
  assert.equal(byRaw['n'].gType, 'Int');
  assert.ok(byRaw['extra']); // champ vu seulement sur la 2e entite
  assert.deepEqual(l.fields.slice(-2).map(f => f.name), ['latitude', 'longitude']);
  assert.equal(l.features[0].latitude, 2);
  assert.equal(l.features[0].class_col, 'x');
});

test('buildLayerFromGeojson : polygone, vide, champs limites aux 200 premieres entites', () => {
  const l = S.buildLayerFromGeojson('zones', { features: [] });
  assert.equal(l.geomType, 'Polygon');
  assert.equal(l.hasData, false);
  assert.deepEqual(l.fields.map(f => f.name), ['geometry_json', 'centroid_lat', 'centroid_lon']);
  assert.equal(S.buildLayerFromGeojson('z', {}).featureCount, 0);

  const feats = Array.from({ length: 201 }, (_, i) => ({
    properties: i === 200 ? { tardif: 1 } : { a: i },
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  }));
  const big = S.buildLayerFromGeojson('big', { features: feats });
  assert.equal(big.fields.some(f => f._rawKey === 'tardif'), false);
  assert.equal(big.features.length, 201);
});

test('buildLayerFromGeojson : type du champ fige sur la premiere valeur non-absente', () => {
  // Ecart note : une premiere valeur null donne Text/string pour toute la colonne.
  const l = S.buildLayerFromGeojson('t', { features: [
    { properties: { v: null }, geometry: null },
    { properties: { v: 12 }, geometry: null },
  ] });
  assert.equal(l.fields.find(f => f._rawKey === 'v').gType, 'Text');
});

test('buildLayerFromGeojson : collision de noms de colonnes non resolue', () => {
  // Ecart note : "a b" et "a-b" donnent deux champs de meme name ; la 2e ligne ecrase la 1re.
  const l = S.buildLayerFromGeojson('c', { features: [
    { properties: { 'a b': 1, 'a-b': 2 }, geometry: null },
  ] });
  const names = l.fields.map(f => f.name).filter(n => n === 'a_b');
  assert.equal(names.length, 2);
  assert.equal(l.features[0].a_b, 2);
});

test('injection de la geometrie via create()', () => {
  const calls = [];
  const inst = S.create({ geometry: {
    flattenCoords2D: (g) => { calls.push('f'); return { type: g.type, coordinates: 'X' }; },
    computeCentroid: () => { calls.push('c'); return [10, 20]; },
    getPointCoords: () => [1, 2],
  } });
  const rows = inst.flattenGeoJsonFeatures(
    [{ properties: {}, geometry: { type: 'Polygon', coordinates: [] } }], [], 'Polygon');
  assert.equal(rows[0].geometry_json, '{"type":"Polygon","coordinates":"X"}');
  assert.equal(rows[0].centroid_lat, 20);
  assert.equal(rows[0].centroid_lon, 10);
  assert.deepEqual(calls, ['f', 'c']);
});

test('topoSortByRefs : parents avant enfants, ordre stable, cible absente ignoree', () => {
  const A = { name: 'A', fields: [{ _refTargetTable: 'B' }] };
  const B = { name: 'B', fields: [{ _refTargetTable: 'C' }] };
  const C = { name: 'C', fields: [] };
  assert.deepEqual(S.topoSortByRefs([A, B, C]).map(l => l.name), ['C', 'B', 'A']);
  assert.deepEqual(S.topoSortByRefs([C, B, A]).map(l => l.name), ['C', 'B', 'A']);
  const D = { name: 'D', fields: [{ _refTargetTable: 'Inconnue' }] };
  assert.deepEqual(S.topoSortByRefs([D]).map(l => l.name), ['D']);
  assert.deepEqual(S.topoSortByRefs([]), []);
});

test('topoSortByRefs : cycle et auto-reference sans boucle infinie, rien de perdu', () => {
  const A = { name: 'A', fields: [{ _refTargetTable: 'B' }] };
  const B = { name: 'B', fields: [{ _refTargetTable: 'A' }] };
  const r = S.topoSortByRefs([A, B]).map(l => l.name);
  assert.deepEqual(r, ['B', 'A']); // le cycle est casse a la premiere couche visitee
  const E = { name: 'E', fields: [{ _refTargetTable: 'E' }] };
  assert.deepEqual(S.topoSortByRefs([E]).map(l => l.name), ['E']);
});

test('topoSortByRefs : noms dupliques, seule la derniere couche est retenue (ecart note)', () => {
  const a1 = { name: 'A', fields: [], tag: 1 };
  const a2 = { name: 'A', fields: [], tag: 2 };
  const r = S.topoSortByRefs([a1, a2]);
  // byName pointe sur a2 ; a1 est visite d'abord puis marque, a2 est ignore.
  assert.equal(r.length, 1);
});

test('buildRefLookupNeeds', () => {
  const layers = [
    { name: 'A', fields: [{ _refTargetTable: 'P', _refTargetField: 'code' }, { _refTargetTable: 'P', _refTargetField: 'nom' }] },
    { name: 'B', fields: [{ _refTargetTable: 'P', _refTargetField: 'code' }, { _refTargetTable: 'Q' }, { x: 1 }] },
    { name: 'C', fields: [{ _refTargetTable: 'Q', _refTargetField: 'id2' }] },
  ];
  const n = S.buildRefLookupNeeds(layers);
  assert.deepEqual([...n.P].sort(), ['code', 'nom']);
  assert.deepEqual([...n.Q], ['id2']);
  assert.deepEqual(S.buildRefLookupNeeds([]), {});
});

test('resolveRefType : sans cible, Ref, RefList, remap', () => {
  assert.equal(S.resolveRefType('Text', null, {}), 'Text');
  assert.equal(S.resolveRefType('Text', '', {}), 'Text');
  assert.equal(S.resolveRefType('Ref:Old', 'Old', {}), 'Ref:Old');
  assert.equal(S.resolveRefType('Ref:Old', 'Old', { Old: 'Old_1' }), 'Ref:Old_1');
  assert.equal(S.resolveRefType('RefList:Old', 'Old', { Old: 'Old_1' }), 'RefList:Old_1');
  assert.equal(S.resolveRefType('RefList:Old', 'Old', {}), 'RefList:Old');
  // Ecart note : tout autre gType avec cible devient Ref, meme "Text".
  assert.equal(S.resolveRefType('Text', 'T', {}), 'Ref:T');
  // Le remap est cherche par la cible, pas par le gType.
  assert.equal(S.resolveRefType('Ref:Zzz', 'Old', { Old: 'N', Zzz: 'Q' }), 'Ref:N');
});
