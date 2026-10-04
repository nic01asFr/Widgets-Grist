import test from 'node:test';
import assert from 'node:assert/strict';
import { tourneeValide, ordonnerLeLong, rangDansTournee, voisinDansTournee, direLongueur, departDeTournee } from '../lib/tournee.js';
import { tourneeDe, avecUsage, usageDe } from '../lib/contextes.js';

// Une ligne de ~1,1 km d'ouest en est, vers 43,3° N.
const ligne = [[5.40, 43.30], [5.41, 43.30], [5.42, 43.30]];
const objet = (cle, lng, lat) => ({ cle, point: [lng, lat] });

test('tourneeValide : deux points distincts au moins', () => {
  assert.equal(tourneeValide({ coordinates: ligne }), true);
  assert.equal(tourneeValide({ coordinates: [[5.4, 43.3]] }), false);
  assert.equal(tourneeValide({ coordinates: [[5.4, 43.3], [5.4, 43.3]] }), false);
  assert.equal(tourneeValide({ coordinates: [[5.4, 43.3], ['x', 3]] }), false);
  assert.equal(tourneeValide(null), false);
});

test('ordonnerLeLong : l\'ordre est celui de la ligne, pas celui de réception', () => {
  const r = ordonnerLeLong(ligne, [objet('c', 5.419, 43.3001), objet('a', 5.401, 43.3001), objet('b', 5.410, 43.2999)]);
  assert.deepEqual(r.map((o) => o.cle), ['a', 'b', 'c']);
  assert.ok(r[0].abscisse < r[1].abscisse && r[1].abscisse < r[2].abscisse);
  assert.ok(r[0].metres < r[1].metres);
  assert.ok(r.every((o) => o.ecartM < 30));
});

test('ordonnerLeLong : à la même place, l\'ordre de réception est gardé', () => {
  const r = ordonnerLeLong(ligne, [objet('x', 5.41, 43.3001), objet('y', 5.41, 43.3001)]);
  assert.deepEqual(r.map((o) => o.cle), ['x', 'y']);
});

test('ordonnerLeLong : un objet éloigné passe après ceux que la ligne longe, avec son écart', () => {
  const r = ordonnerLeLong(ligne, [objet('loin', 5.401, 43.32), objet('pres', 5.419, 43.3001)], 250);
  assert.deepEqual(r.map((o) => o.cle), ['pres', 'loin']);
  assert.ok(r[1].ecartM > 1000);
});

test('ordonnerLeLong : sans ligne ni position valide, rien', () => {
  assert.deepEqual(ordonnerLeLong([[5.4, 43.3]], [objet('a', 5.4, 43.3)]), []);
  assert.deepEqual(ordonnerLeLong(ligne, [{ cle: 'a' }, { cle: 'b', point: ['x', 1] }]), []);
});

test('rang et voisin : on boucle, et un objet hors liste rejoint le début ou la fin', () => {
  const ordre = ['a', 'b', 'c'].map((cle) => ({ cle }));
  assert.deepEqual(rangDansTournee(ordre, 'b'), { rang: 2, total: 3 });
  assert.deepEqual(rangDansTournee(ordre, 'z'), { rang: 0, total: 3 });
  assert.equal(voisinDansTournee(ordre, 'a', 1), 'b');
  assert.equal(voisinDansTournee(ordre, 'c', 1), 'a');
  assert.equal(voisinDansTournee(ordre, 'a', -1), 'c');
  assert.equal(voisinDansTournee(ordre, 'z', 1), 'a');
  assert.equal(voisinDansTournee(ordre, 'z', -1), 'c');
  assert.equal(voisinDansTournee([], 'a', 1), null);
});

test('direLongueur', () => {
  assert.equal(direLongueur(850), '850 m');
  assert.equal(direLongueur(3200), '3,2 km');
  assert.equal(direLongueur(-1), '');
});

test('tourneeDe : null sans ligne valide, la ligne sinon', () => {
  assert.equal(tourneeDe(undefined), null);
  assert.equal(tourneeDe({ usage: { contexte: true } }), null);
  assert.equal(tourneeDe({ usage: { contexte: true, tournee: { coordinates: [[1, 1]] } } }), null);
  const t = { type: 'LineString', coordinates: ligne, nom: 'Boucle' };
  assert.deepEqual(tourneeDe({ usage: { contexte: true, tournee: t } }), t);
});

test('avecUsage garde la tournée avec le contexte, la remplace, la retire, et ne la garde pas hors contexte', () => {
  const t = { type: 'LineString', coordinates: ligne, nom: 'Boucle' };
  const etat = { camera: 1, usage: { contexte: true, releves: ['A'], tournee: t } };
  assert.deepEqual(avecUsage(etat, { contexte: true }).usage, { contexte: true, releves: ['A'], tournee: t });
  assert.deepEqual(avecUsage(etat, { releves: ['B'] }).usage, { contexte: true, releves: ['B'], tournee: t });
  assert.deepEqual(avecUsage(etat, { tournee: null }).usage, { contexte: true, releves: ['A'] });
  const autre = { ...t, nom: 'Autre' };
  assert.deepEqual(avecUsage(etat, { tournee: autre }).usage.tournee, autre);
  assert.equal(avecUsage(etat, { contexte: false }).usage, undefined);
  assert.deepEqual(avecUsage({ camera: 1 }, { contexte: true, tournee: t }).usage, { contexte: true, tournee: t });
  assert.deepEqual(usageDe(etat), { contexte: true });
});

test('par ou commencer : le premier sans position, le premier devant soi avec elle', () => {
  const ordre = [
    { abscisse: 0.1, ecartM: 5 }, { abscisse: 0.4, ecartM: 8 }, { abscisse: 0.7, ecartM: 3 }, { abscisse: 0.95, ecartM: 900 },
  ];
  assert.equal(departDeTournee(ordre), 0);
  assert.equal(departDeTournee(ordre, null), 0);
  assert.equal(departDeTournee(ordre, 0.05), 0);
  assert.equal(departDeTournee(ordre, 0.3), 1);
  assert.equal(departDeTournee(ordre, 0.6), 2);
  // Sur l'ouvrage meme : on ne le saute pas (un pas en arriere tolere : 25 m sur 1 000 m).
  assert.equal(departDeTournee(ordre, 0.41, { totalM: 1000 }), 1);
  assert.equal(departDeTournee(ordre, 0.41), 2);
  // Passe le dernier ouvrage de la ligne, ou devant un seul ouvrage hors ligne : on recommence.
  assert.equal(departDeTournee(ordre, 0.9), 0);
  assert.equal(departDeTournee([], 0.2), -1);
  assert.equal(departDeTournee(null), -1);
});
