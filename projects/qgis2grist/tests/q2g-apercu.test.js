'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../lib/q2g-apercu.js');

const couche = (nom, geomType, n, extra) => ({
  name: nom, displayName: nom, geomType, featureCount: n, hasData: true,
  fields: [{ name: 'nom', label: 'Nom' }, { name: 'matériau', label: 'Matériau' }],
  features: Array.from({ length: n }, (_, i) => ({ nom: 'objet ' + i, 'matériau': 'béton', _localId: i + 1 })),
  ...(extra || {}),
});

test('classer : sans geometrie = tables, le reste = cartographiques', () => {
  assert.equal(A.classer(couche('a', 'Point', 1)), 'cartes');
  assert.equal(A.classer(couche('a', 'Polygon', 1)), 'cartes');
  assert.equal(A.classer(couche('a', 'No geometry', 1)), 'tables');
  assert.equal(A.classer(couche('a', 'None', 1)), 'tables');
  assert.equal(A.classer(couche('a', 'nogeometry', 1)), 'tables');
  assert.equal(A.classer(null), 'cartes');
});

test('grouper : Cartographiques puis Tables, indices d origine conserves, groupes vides omis', () => {
  const l = [couche('t1', 'No geometry', 3), couche('c1', 'Point', 2), couche('t2', 'None', 1), couche('c2', 'Line', 5)];
  assert.deepEqual(A.grouper(l), [
    { cle: 'cartes', titre: 'Cartographiques', indices: [1, 3] },
    { cle: 'tables', titre: 'Tables', indices: [0, 2] },
  ]);
  assert.deepEqual(A.grouper([couche('c', 'Point', 1)]), [{ cle: 'cartes', titre: 'Cartographiques', indices: [0] }]);
  assert.deepEqual(A.grouper([]), []);
  assert.deepEqual(A.grouper(undefined), []);
  // chaque indice apparait exactement une fois : le regroupement ne change jamais ce qui peut etre importe
  const tous = A.grouper(l).flatMap((g) => g.indices).sort();
  assert.deepEqual(tous, [0, 1, 2, 3]);
});

test('correspond : casse, accents et mots multiples ; requete vide = tout', () => {
  const c = couche('Reseau_EU', 'Line', 2, { displayName: 'Réseau eaux usées' });
  assert.equal(A.correspond(c, ''), true);
  assert.equal(A.correspond(c, '   '), true);
  assert.equal(A.correspond(c, 'reseau'), true);
  assert.equal(A.correspond(c, 'RÉSEAU usees'), true);
  assert.equal(A.correspond(c, 'materiau'), true, 'les champs comptent');
  assert.equal(A.correspond(c, 'eau pluviale'), false);
  assert.equal(A.correspond(null, 'x'), false);
  assert.equal(A.correspond(null, ''), true);
});

test('estimerOctets : proche de la taille reelle, 0 sans donnees, echantillon borne', () => {
  const c = couche('x', 'Point', 1000);
  const reel = c.features.reduce((s, f) => s + JSON.stringify(f).length, 0);
  const est = A.estimerOctets(c);
  assert.ok(est > reel * 0.9 && est < reel * 1.6, `${est} vs ${reel}`);
  assert.equal(A.estimerOctets(couche('v', 'Point', 0)), 0);
  assert.equal(A.estimerOctets({}), 0);
  assert.equal(A.estimerOctets(null), 0);
  // featureCount plus grand que les lignes lues : on met a l'echelle
  const partiel = { ...couche('p', 'Point', 10), featureCount: 1000 };
  assert.ok(A.estimerOctets(partiel) > A.estimerOctets(couche('p', 'Point', 10)) * 50);
  // ligne non serialisable : ne leve pas
  const cyc = {}; cyc.moi = cyc;
  assert.doesNotThrow(() => A.estimerOctets({ featureCount: 2, features: [cyc, cyc] }));
});

test('estimerDuree : croit avec le volume et le nombre de couches, valeurs invalides = 0', () => {
  assert.equal(A.estimerDuree(0, 0), 0);
  assert.ok(A.estimerDuree(0, 5) > 0);
  assert.ok(A.estimerDuree(10e6, 1) > A.estimerDuree(1e6, 1));
  assert.ok(A.estimerDuree(1e6, 4) > A.estimerDuree(1e6, 1));
  assert.equal(A.estimerDuree(NaN, NaN), 0);
  assert.equal(A.estimerDuree(-5, -1), 0);
  // ordre de grandeur des mesures : 50 000 points d'environ 100 octets = 5 Mo, une couche : de 3 a 12 s (mesure : 6,3 s)
  const d = A.estimerDuree(5e6, 1);
  assert.ok(d > 3 && d < 12, String(d));
});

test('formaterTaille et formaterDuree', () => {
  assert.equal(A.formaterTaille(0), '0 o');
  assert.equal(A.formaterTaille(500), '500 o');
  assert.equal(A.formaterTaille(2048).replace(/\s/g, ' '), '2 Ko');
  assert.match(A.formaterTaille(3.5 * 1024 * 1024), /^3,5 Mo$/);
  assert.match(A.formaterTaille(120 * 1024 * 1024), /^120 Mo$/);
  assert.equal(A.formaterTaille(NaN), '0 o');
  assert.equal(A.formaterDuree(0.5), 'moins de 2 s');
  assert.equal(A.formaterDuree(12.4), 'environ 12 s');
  assert.equal(A.formaterDuree(75), 'environ 1 min 15 s');
  assert.equal(A.formaterDuree(120), 'environ 2 min');
  assert.equal(A.formaterDuree(-1), 'moins de 2 s');
});

test('resume : texte lisible, vide quand rien n est selectionne', () => {
  const r = A.resume([couche('a', 'Point', 100), couche('b', 'No geometry', 5)]);
  assert.equal(r.n, 2);
  assert.equal(r.entites, 105);
  assert.ok(r.octets > 0 && r.secondes > 0);
  assert.match(r.texte, /^2 couches · 105 entités · ~[\d,\s]+(o|Ko|Mo) · durée /);
  assert.equal(A.resume([]).texte, 'Aucune couche sélectionnée');
  assert.equal(A.resume(undefined).n, 0);
  assert.match(A.resume([couche('a', 'Point', 1)]).texte, /^1 couche · 1 entité · /);
});

test('module pur : ni DOM ni reseau, charge en navigateur sans module.exports', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'q2g-apercu.js'), 'utf8');
  assert.doesNotMatch(src, /\bdocument\b|\bwindow\b|\bfetch\(|XMLHttpRequest|grist\./);
  const racine = {};
  new Function('module', 'globalThis', src)(undefined, racine);
  assert.equal(typeof racine.Q2GApercu.grouper, 'function');
});
