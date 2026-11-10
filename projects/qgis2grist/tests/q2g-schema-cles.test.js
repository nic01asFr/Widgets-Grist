/**
 * Q2GSchema : cles venant des donnees (constructor, __proto__, toString...) traitees comme
 * de simples cles, sans changer la sortie sur les cas normaux.
 * node --test projects/qgis2grist/tests/q2g-schema-cles.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/q2g-schema.js');

const HOSTILES = ['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__'];

describe('ownGet / setOwn', () => {
  it('ownGet ne lit que les proprietes propres', () => {
    const o = { a: 1 };
    assert.equal(S.ownGet(o, 'a'), 1);
    for (const k of HOSTILES) assert.equal(S.ownGet(o, k), undefined, k);
    assert.equal(S.ownGet(null, 'a'), undefined);
    assert.equal(S.ownGet(undefined, 'a'), undefined);
    assert.equal(S.ownGet(Object.create(null), 'a'), undefined);
  });
  it('setOwn ecrit une propriete propre, y compris __proto__, sans toucher au prototype', () => {
    const o = {};
    assert.equal(S.setOwn(o, 'x', 5), 5);
    S.setOwn(o, '__proto__', { polluant: true });
    assert.equal(Object.getPrototypeOf(o), Object.prototype);
    assert.equal(o.polluant, undefined);
    assert.deepEqual(Object.getOwnPropertyDescriptor(o, '__proto__').value, { polluant: true });
    assert.deepEqual(Object.keys(o), ['x', '__proto__']);
    assert.equal(S.ownGet(o, '__proto__').polluant, true);
  });
});

describe('buildLayerFromGeojson : proprietes aux noms herites', () => {
  // JSON.parse cree une vraie propriete propre '__proto__'
  const props = JSON.parse('{"constructor":"c","toString":"t","hasOwnProperty":"h","valueOf":3,"__proto__":"p","nom":"n"}');
  const gj = { features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 43] }, properties: props },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [6, 44] }, properties: { ...props, nom: 'm' } },
  ] };

  it('chaque propriete devient une colonne et garde sa valeur', () => {
    const layer = S.buildLayerFromGeojson('Test', gj);
    const brutes = layer.fields.filter((f) => f._rawKey).map((f) => f._rawKey);
    assert.deepEqual(brutes.sort(), [...HOSTILES, 'nom'].sort());
    const parCle = Object.fromEntries(layer.fields.filter((f) => f._rawKey).map((f) => [f._rawKey, f.name]));
    const row = layer.features[0];
    assert.equal(row[parCle.constructor], 'c');
    assert.equal(row[parCle.toString], 't');
    assert.equal(row[parCle.hasOwnProperty], 'h');
    assert.equal(row[parCle.valueOf], 3);
    assert.equal(row[parCle.__proto__], 'p');
    assert.equal(layer.features[1][parCle.nom], 'm');
    assert.equal(layer.features.length, 2);
  });

  it('un jeu normal garde l ordre des colonnes (cles entieres d abord, comme un objet simple)', () => {
    const f = [{ type: 'Feature', geometry: null, properties: { zeta: 1, 10: 'b', 2: 'a', alpha: 2 } }];
    const layer = S.buildLayerFromGeojson('Ordre', { features: f });
    assert.deepEqual(layer.fields.slice(0, 4).map((x) => x._rawKey), ['2', '10', 'zeta', 'alpha']);
  });
});

describe('topoSortByRefs / buildRefLookupNeeds / resolveRefType : noms herites', () => {
  it('topoSortByRefs : une cible nommee comme une propriete heritee n est pas une couche', () => {
    const enfant = { name: 'Enfant', fields: [{ _refTargetTable: 'constructor' }, { _refTargetTable: 'toString' }] };
    assert.deepEqual(S.topoSortByRefs([enfant]).map((l) => l.name), ['Enfant']);
  });
  it('topoSortByRefs : une vraie couche nommee constructor est triee avant son enfant', () => {
    const parent = { name: 'constructor', fields: [] };
    const enfant = { name: 'Enfant', fields: [{ _refTargetTable: 'constructor' }] };
    assert.deepEqual(S.topoSortByRefs([enfant, parent]).map((l) => l.name), ['constructor', 'Enfant']);
  });
  it('buildRefLookupNeeds : tables hostiles, objet simple, cles propres', () => {
    const layers = [{ name: 'A', fields: HOSTILES.map((t) => ({ _refTargetTable: t, _refTargetField: 'code' })) }];
    const n = S.buildRefLookupNeeds(layers);
    assert.equal(Object.getPrototypeOf(n), Object.prototype);
    assert.deepEqual(Object.keys(n).sort(), [...HOSTILES].sort());
    for (const t of HOSTILES) assert.deepEqual([...Object.getOwnPropertyDescriptor(n, t).value], ['code'], t);
  });
  it('resolveRefType : le remap ne repond que pour ses propres cles', () => {
    for (const k of HOSTILES) assert.equal(S.resolveRefType('Ref:' + k, k, {}), 'Ref:' + k, k);
    assert.equal(S.resolveRefType('RefList:x', 'constructor', { constructor: 'Constructor_1' }), 'RefList:Constructor_1');
  });
});
