import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMetres, objetLePlusProche, direDistance, lignesReleve } from '../lib/releve.js';

const centre = (f) => f.geometry.coordinates;
const point = (lng, lat, nom) => ({ geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { nom } });

test('une distance au sol, en metres', () => {
  // Vieux-Port → Hotel de Ville de Marseille : environ 330 m a vol d'oiseau.
  const d = distanceMetres([5.3698, 43.2951], [5.3695, 43.2981]);
  assert.ok(d > 300 && d < 360, `obtenu ${d}`);
  assert.equal(distanceMetres([0, 0], [0, 0]), 0);
});

test('une coordonnee illisible ne classe pas l objet en tete', () => {
  // Sans cette garde, NaN comparait faux et le premier objet illisible
  // restait « le plus proche ».
  assert.equal(distanceMetres([NaN, 1], [0, 0]), Infinity);
  assert.equal(distanceMetres(null, [0, 0]), Infinity);
});

test('l objet le plus proche, et son rang dans la couche', () => {
  const feats = [point(5.40, 43.30, 'loin'), point(5.3697, 43.2952, 'pres'), point(5.38, 43.29, 'moyen')];
  const r = objetLePlusProche(feats, [5.3698, 43.2951], centre);
  assert.equal(r.idx, 1);
  assert.ok(r.distance < 20);
});

test('une entite sans position est ignoree, pas choisie', () => {
  const feats = [{ geometry: null }, point(5.37, 43.29, 'seul')];
  const r = objetLePlusProche(feats, [5.37, 43.29], (f) => f.geometry?.coordinates ?? null);
  assert.equal(r.idx, 1);
});

test('rien a proposer : null, jamais un objet au hasard', () => {
  assert.equal(objetLePlusProche([], [0, 0], centre), null);
  assert.equal(objetLePlusProche([{ geometry: null }], [0, 0], () => null), null);
});

test('une distance dite comme sur le terrain', () => {
  assert.equal(direDistance(7.4), 'à 7 m');
  assert.equal(direDistance(437), 'à 440 m');
  assert.equal(direDistance(2340), 'à 2,3 km');
  assert.equal(direDistance(15400), 'à 15 km');
  assert.equal(direDistance(Infinity), '');
});

test('la pastille liste une ligne par couche, avec ses formulaires', () => {
  const bat = { name: 'Bâtiments' };
  const lignes = lignesReleve([
    { couche: bat, formulaires: [{ titre: 'Bâtiment — relevé' }, { titre: 'Visites' }, { titre: 'Visites' }] },
    { couche: { name: 'Vide' }, formulaires: [] },
  ]);
  assert.equal(lignes.length, 1, 'une couche sans formulaire offert ne figure pas');
  assert.deepEqual(lignes[0].formulaires, ['Bâtiment — relevé', 'Visites']);
  assert.equal(lignes[0].nom, 'Bâtiments');
});
