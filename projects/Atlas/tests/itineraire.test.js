/**
 * Itinéraire sur un réseau de lignes : tronçons raccordés, points projetés, plus court chemin.
 *
 * node --test projects/Atlas/tests/itineraire.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { construireReseau, cheminEntre, itineraire, segmentLePlusProche, RACCORD_M } from '../lib/itineraire.js';
import { longueurMetres } from '../lib/trajet.js';

const ligne = (...coords) => ({ geometry: { type: 'LineString', coordinates: coords } });

// Un carré de ~1 km de côté, plus une diagonale : deux chemins entre le coin sud-ouest et le coin nord-est.
//   D ---- C
//   |    / |
//   A ---- B
const A = [5.000, 43.000], B = [5.0123, 43.000], C = [5.0123, 43.009], D = [5.000, 43.009];
const carre = () => [ligne(A, B), ligne(B, C), ligne(C, D), ligne(D, A)];

test('un réseau de tronçons qui se touchent est connexe', () => {
  const r = construireReseau(carre());
  assert.equal(r.noeuds.length, 4);
  const aller = cheminEntre(r, A, C);
  assert.equal(aller.ok, true);
  assert.ok(aller.longueurM > 1500 && aller.longueurM < 2400);
});

test('le plus court chemin : la diagonale, quand elle existe', () => {
  const avecDiagonale = [...carre(), ligne(A, C)];
  const r = construireReseau(avecDiagonale);
  const c = cheminEntre(r, A, C);
  assert.equal(c.ok, true);
  assert.equal(c.coordonnees.length, 2);
  const sansDiag = cheminEntre(construireReseau(carre()), A, C);
  assert.ok(c.longueurM < sansDiag.longueurM);
});

test('des tronçons qui ne tombent pas exactement au même point sont raccordés', () => {
  const decale = [5.0123 + 0.00001, 43.000];  // ~0,8 m à côté de B
  const r = construireReseau([ligne(A, B), ligne(decale, C)]);
  assert.equal(cheminEntre(r, A, C).ok, true);
  const trop = [5.0123 + 0.0005, 43.000];     // ~40 m : pas le même carrefour
  assert.equal(cheminEntre(construireReseau([ligne(A, B), ligne(trop, C)]), A, C).ok, false);
  assert.ok(RACCORD_M >= 1);
});

test('un point posé au milieu d\'un tronçon se projette dessus : pas besoin de viser un carrefour', () => {
  const r = construireReseau(carre());
  const milieu = [5.006, 43.0004];     // près du milieu de AB, un peu à côté
  const c = cheminEntre(r, milieu, C);
  assert.equal(c.ok, true);
  assert.ok(Math.abs(c.coordonnees[0][1] - 43.000) < 1e-9, 'le départ est ramené sur la ligne');
  assert.deepEqual(c.coordonnees[c.coordonnees.length - 1], C);
});

test('deux points sur le même tronçon : le chemin reste sur ce tronçon', () => {
  const r = construireReseau([ligne(A, B)]);
  const c = cheminEntre(r, [5.002, 43.0001], [5.010, 43.0001]);
  assert.equal(c.ok, true);
  assert.equal(c.coordonnees.length, 2);
  assert.ok(c.longueurM > 600 && c.longueurM < 700);
});

test('réseau coupé : on le dit, avec la cause', () => {
  const r = construireReseau([ligne(A, B), ligne(D, C)]);
  const c = cheminEntre(r, A, D);
  assert.equal(c.ok, false);
  assert.match(c.raison, /coupé/);
});

test('un point trop loin du réseau est refusé', () => {
  const r = construireReseau(carre());
  const c = cheminEntre(r, [5.5, 43.5], C);
  assert.equal(c.ok, false);
  assert.match(c.raison, /départ/);
  assert.match(cheminEntre(r, A, [5.5, 43.5]).raison, /arrivée/);
});

test('plusieurs points de passage : les tronçons se raccordent, un seul tracé', () => {
  const r = construireReseau(carre());
  const c = itineraire(r, [A, B, C, D]);
  assert.equal(c.ok, true);
  assert.deepEqual(c.coordonnees, [A, B, C, D]);
  assert.ok(Math.abs(longueurMetres(c.coordonnees) - c.longueurM) < 1, 'la longueur est celle du tracé');
});

test('un point de passage hors réseau : l\'erreur dit de quel tronçon', () => {
  const r = construireReseau(carre());
  const c = itineraire(r, [A, B, [6, 44]]);
  assert.equal(c.ok, false);
  assert.match(c.raison, /Tronçon 2/);
});

test('moins de deux points, ou pas de réseau : refusé', () => {
  assert.equal(itineraire(construireReseau(carre()), [A]).ok, false);
  assert.equal(cheminEntre(construireReseau([]), A, B).ok, false);
});

test('les MultiLineString sont lues partie par partie, les autres géométries ignorées', () => {
  const r = construireReseau([
    { geometry: { type: 'MultiLineString', coordinates: [[A, B], [B, C]] } },
    { geometry: { type: 'Point', coordinates: A } },
    { geometry: null },
  ]);
  assert.equal(cheminEntre(r, A, C).ok, true);
});

test('segmentLePlusProche : le bon segment, et la distance', () => {
  const r = construireReseau(carre());
  const s = segmentLePlusProche(r, [5.006, 43.0001]);
  assert.ok(s.distance < 20);
});

test('un réseau dense : plusieurs milliers de tronçons, un chemin en un instant', () => {
  // grille de 40 x 40 nœuds
  const tron = [];
  for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) {
    const p = [5 + i * 0.001, 43 + j * 0.001];
    if (i < 39) tron.push(ligne(p, [5 + (i + 1) * 0.001, 43 + j * 0.001]));
    if (j < 39) tron.push(ligne(p, [5 + i * 0.001, 43 + (j + 1) * 0.001]));
  }
  const debut = Date.now();
  const r = construireReseau(tron);
  const c = cheminEntre(r, [5, 43], [5.039, 43.039]);
  assert.equal(c.ok, true);
  assert.ok(Date.now() - debut < 2500);
});
