import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEUIL_VOLUME_M, PROP_TAILLE, tailleEmpriseM, marquerTailles, filtreVolume, filtreVaste, estTropVaste,
} from '../lib/volume-relief.js';

// Un rectangle de `l` m de large sur `h` m de haut, vers 43,3 °N.
function rectangle(lMetres, hMetres, lng = 5.4, lat = 43.3) {
  const dLng = lMetres / (111320 * Math.cos((lat * Math.PI) / 180));
  const dLat = hMetres / 110574;
  return { type: 'Polygon', coordinates: [[[lng, lat], [lng + dLng, lat], [lng + dLng, lat + dLat], [lng, lat + dLat], [lng, lat]]] };
}

test('la taille d une emprise est sa diagonale, en metres', () => {
  const t = tailleEmpriseM(rectangle(30, 40));
  assert.ok(Math.abs(t - 50) < 0.5, `3-4-5 : ${t}`);
});

test('une longitude se rapproche avec la latitude : 100 m restent 100 m a Marseille comme a Oslo', () => {
  const marseille = tailleEmpriseM(rectangle(100, 0.0001, 5.4, 43.3));
  const oslo = tailleEmpriseM(rectangle(100, 0.0001, 10.7, 59.9));
  assert.ok(Math.abs(marseille - 100) < 1);
  assert.ok(Math.abs(oslo - 100) < 1);
});

test('ce qui n est pas une surface n a pas de taille', () => {
  assert.equal(tailleEmpriseM(null), null);
  assert.equal(tailleEmpriseM({ type: 'Point', coordinates: [5, 43] }), null);
  assert.equal(tailleEmpriseM({ type: 'LineString', coordinates: [[5, 43], [5.1, 43]] }), null);
  assert.equal(tailleEmpriseM({ type: 'Polygon', coordinates: [] }), null);
});

test('un MultiPolygon se mesure d un bloc : son emprise englobe toutes ses parties', () => {
  const a = rectangle(30, 30, 5.4, 43.3).coordinates;
  const b = rectangle(30, 30, 5.401, 43.3).coordinates;
  const t = tailleEmpriseM({ type: 'MultiPolygon', coordinates: [a, b] });
  const seul = tailleEmpriseM({ type: 'Polygon', coordinates: a });
  assert.ok(t > seul);
});

test('marquerTailles pose la taille et compte les entites trop vastes', () => {
  const entites = [
    { geometry: rectangle(20, 20), properties: {} },       // un batiment
    { geometry: rectangle(2000, 1500), properties: {} },   // un domaine
    { geometry: { type: 'Point', coordinates: [5, 43] }, properties: {} },
  ];
  const r = marquerTailles(entites);
  assert.deepEqual(r, { total: 2, vastes: 1 });
  assert.ok(entites[0].properties[PROP_TAILLE] < SEUIL_VOLUME_M);
  assert.ok(entites[1].properties[PROP_TAILLE] > SEUIL_VOLUME_M);
  assert.equal(PROP_TAILLE in entites[2].properties, false, 'un point n a pas de taille');
  assert.equal(estTropVaste(entites[0]), false);
  assert.equal(estTropVaste(entites[1]), true);
});

test('une forme modifiee est recalculee : la taille suit la geometrie, pas l entite', () => {
  const f = { geometry: rectangle(20, 20), properties: {} };
  marquerTailles([f]);
  const avant = f.properties[PROP_TAILLE];
  f.geometry = rectangle(2000, 2000);
  marquerTailles([f]);
  assert.ok(f.properties[PROP_TAILLE] > avant * 10);
});

test('une entite sans taille reste un volume : le doute ne change pas le rendu', () => {
  // Une couche distante (adresse) n'a pas ses entites en memoire : rien n'est marque.
  assert.deepEqual(filtreVolume(), ['<=', ['coalesce', ['get', PROP_TAILLE], 0], SEUIL_VOLUME_M]);
  assert.deepEqual(filtreVaste(), ['>', ['coalesce', ['get', PROP_TAILLE], 0], SEUIL_VOLUME_M]);
  assert.equal(estTropVaste({ properties: {} }), false);
  assert.equal(estTropVaste(null), false);
});
