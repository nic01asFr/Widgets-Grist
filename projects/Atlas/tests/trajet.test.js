import test from 'node:test';
import assert from 'node:assert/strict';
import { captureStoryState } from '../lib/story.js';
import { distanceMetres } from '../lib/releve.js';
import {
  copieLineaire,
  longueurMetres,
  pointAAbscisse,
  projeter,
  placesInitiales,
  placeDepuisVue,
  ECART_VUE_TRAJET_M,
  indicesEchange,
  trierParAbscisse,
  rayonAutour,
  alertePastille,
  suiviDoitChanger,
  dureeLongeLigneMs,
  capInterpole,
  fusionnerApresPhoto,
  etatApresRecapture,
  retirerTrace,
  objetsAutour,
} from '../lib/trajet.js';

const LIGNE = [[5, 43.3], [5.001, 43.3], [5.002, 43.3]];

test('la photo du récit ne connaît pas le trajet', () => {
  const photo = captureStoryState({
    getCenter: () => ({ toArray: () => [5, 43.3] }),
    getZoom: () => 14,
    getPitch: () => 0,
    getBearing: () => 10,
  }, { layers: [], settings: {} });
  assert.equal(photo.trace, undefined);
  assert.equal(photo.abscisse, undefined);
  assert.equal(photo.saisies, undefined);
});

test('une ligne est copiée à plat, une ligne trop courte est refusée', () => {
  const coords = copieLineaire({ type: 'LineString', coordinates: [[5, 43, 12], [5.01, 43, 4]] });
  assert.deepEqual(coords, [[5, 43], [5.01, 43]]);
  assert.equal(copieLineaire({ type: 'LineString', coordinates: [[5, 43, 1]] }), null);
  assert.equal(copieLineaire({ type: 'Point', coordinates: [5, 43] }), null);
  assert.equal(copieLineaire({
    type: 'LineString',
    coordinates: [[5, 43], [5, 43]],
  }), null);
});

test('une multiligne donne la partie la plus proche du clic', () => {
  const geom = {
    type: 'MultiLineString',
    coordinates: [
      [[5, 43.3], [5.01, 43.3]],
      [[6, 44], [6.01, 44]],
    ],
  };
  const coords = copieLineaire(geom, [6.005, 44]);
  assert.equal(coords[0][0], 6);
  assert.equal(coords[1][0], 6.01);
});

test('les places de départ uniformes restent un repli', () => {
  assert.deepEqual(placesInitiales(0), []);
  assert.deepEqual(placesInitiales(1), [0.5]);
  assert.deepEqual(placesInitiales(3), [0, 0.5, 1]);
});

test('la place d’une étape suit le centre de la vue, pas un intervalle', () => {
  const milieu = pointAAbscisse(LIGNE, 0.5);
  const surLigne = placeDepuisVue(LIGNE, milieu);
  assert.ok(Math.abs(surLigne.abscisse - 0.5) < 1e-6);
  assert.ok(surLigne.distanceMetres < 0.05);

  // Vue à l'écart : on pose quand même sur la ligne, au plus près.
  const aEcart = placeDepuisVue(LIGNE, [5.001, 43.301]);
  assert.ok(Math.abs(aEcart.abscisse - 0.5) < 0.05);
  assert.ok(aEcart.distanceMetres > ECART_VUE_TRAJET_M);

  assert.deepEqual(pointAAbscisse(LIGNE, 0), [5, 43.3]);
  assert.deepEqual(pointAAbscisse(LIGNE, 1), [5.002, 43.3]);
});

test('échanger deux voisines puis trier déplace les abscisses', () => {
  const etapes = [
    { title: 'a', state: { abscisse: 0.2 } },
    { title: 'b', state: { abscisse: 0.8 } },
  ];
  const pair = indicesEchange(etapes.map((e) => e.state.abscisse), 0, 1);
  assert.deepEqual(pair, [0, 1]);
  const [i, j] = pair;
  const tmp = etapes[i].state.abscisse;
  etapes[i].state.abscisse = etapes[j].state.abscisse;
  etapes[j].state.abscisse = tmp;
  const triees = trierParAbscisse(etapes);
  assert.equal(triees[0].title, 'b');
  assert.equal(triees[0].state.abscisse, 0.2);
  assert.equal(indicesEchange([0.2], 0, 1), null);
});

test('le rayon, l’alerte et le suivi ont leurs marges', () => {
  assert.equal(rayonAutour(null), 40);
  assert.equal(rayonAutour(20), 30);
  assert.equal(rayonAutour(200), 80);
  assert.equal(rayonAutour(100), 50);
  assert.equal(alertePastille({ distanceM: 40, rayonM: 40, allumee: false }), true);
  assert.equal(alertePastille({ distanceM: 50, rayonM: 40, allumee: false }), false);
  assert.equal(alertePastille({ distanceM: 50, rayonM: 40, allumee: true }), true);
  assert.equal(alertePastille({ distanceM: 56, rayonM: 40, allumee: true }), false);

  const L = longueurMetres(LIGNE);
  const seuil = 0.5 + 8 / L;
  assert.equal(suiviDoitChanger({
    abscisse: seuil - 1 / L, etape: 0, voisine: 1, longueurM: L,
  }), false);
  assert.equal(suiviDoitChanger({
    abscisse: seuil, etape: 0, voisine: 1, longueurM: L,
  }), true);
});

test('la durée est bornée et le cap prend le plus court chemin', () => {
  assert.equal(dureeLongeLigneMs(1), 800);
  assert.equal(dureeLongeLigneMs(80), 1000);
  assert.equal(dureeLongeLigneMs(10000), 4000);
  assert.ok(Math.abs(capInterpole(350, 10, 0.5) - 0) < 1e-6);
});

test('la fusion garde la ligne et l’abscisse, la re-capture renouvelle les saisies', () => {
  const photo = { camera: { center: [1, 2], zoom: 12 } };
  const fusion = fusionnerApresPhoto(photo, {
    trace: { type: 'LineString', coordinates: LIGNE },
    abscisse: 0.3,
    saisies: [{ formId: 'f', coucheId: 'c', table: 'T', titre: 'Visite' }],
  });
  assert.equal(fusion.camera.zoom, 12);
  assert.equal(fusion.abscisse, 0.3);
  assert.equal(fusion.trace.coordinates.length, 3);
  assert.equal(fusionnerApresPhoto(photo, {}).trace, undefined);

  const apres = etatApresRecapture(
    { camera: { zoom: 16 } },
    fusion,
    [{ formId: 'g', coucheId: 'c', table: 'T', titre: 'Autre' }],
  );
  assert.equal(apres.camera.zoom, 16);
  assert.equal(apres.abscisse, 0.3);
  assert.equal(apres.trace.coordinates[0][0], 5);
  assert.equal(apres.saisies[0].formId, 'g');
});

test('re-capturer la vue garde le choix de l’auteur : l’étape reste un contexte', () => {
  const apres = etatApresRecapture({ camera: { zoom: 16 } }, { usage: { contexte: true }, camera: { zoom: 12 } }, []);
  assert.deepEqual(apres.usage, { contexte: true });
  assert.equal(etatApresRecapture({ camera: {} }, { camera: {} }, []).usage, undefined);
});

test('retirer la ligne oublie la trace et l’abscisse, pas les saisies', () => {
  const [etape] = retirerTrace([{
    title: 'a',
    state: { trace: { type: 'LineString' }, abscisse: 0.4, saisies: [{ formId: 'f' }], camera: {} },
  }]);
  assert.equal(etape.state.trace, undefined);
  assert.equal(etape.state.abscisse, undefined);
  assert.equal(etape.state.saisies[0].formId, 'f');
});

test('les objets autour sont les plus proches, cinq au plus', () => {
  const objets = [0, 1, 2, 3, 4, 5].map((i) => ({
    nom: String(i),
    point: [5 + i * 0.0001, 43.3],
  }));
  const liste = objetsAutour(objets, [5, 43.3], distanceMetres([5, 43.3], [5.001, 43.3]));
  assert.equal(liste.length, 5);
  assert.equal(liste[0].nom, '0');
  assert.ok(liste[0].distance <= liste[4].distance);
});
