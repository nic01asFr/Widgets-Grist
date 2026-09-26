import test from 'node:test';
import assert from 'node:assert/strict';
import { basemapLayerIds, isAtlasLayerId, quandNouveauStyle } from '../lib/basemap-layers.js';

const styleCRESO = [
  // Fond OpenStreetMap / Liberty
  { id: 'building-3d', type: 'fill-extrusion' },
  { id: 'building-top', type: 'fill-extrusion' },
  { id: 'place-city', type: 'symbol' },
  { id: 'road-label', type: 'symbol' },
  { id: 'water', type: 'fill' },
  // Données Atlas
  { id: 'layer-scene-Batiments_3', type: 'fill-extrusion' },
  { id: 'layer-scene-Batiments_3-outline', type: 'line' },
  { id: 'layer-scene-Batiments_3-label', type: 'symbol' },
  { id: 'layer-grist-42', type: 'fill-extrusion' },
  { id: 'layer-1786000000-1234', type: 'fill-extrusion' },
];

test('le bâti en volume du fond, sans les couches Atlas', () => {
  // Le cas qui a motivé ce module : « Bâtiments 3D » du module Vues éteignait
  // aussi un bâti importé depuis Grist et rendu en volume.
  assert.deepEqual(basemapLayerIds(styleCRESO, 'fill-extrusion'), ['building-3d', 'building-top']);
});

test('les étiquettes du fond, sans celles des couches Atlas', () => {
  assert.deepEqual(basemapLayerIds(styleCRESO, 'symbol'), ['place-city', 'road-label']);
});

test('reconnaît les trois formes d’identifiant Atlas', () => {
  assert.ok(isAtlasLayerId('layer-scene-Routes_3'));      // import de manifeste
  assert.ok(isAtlasLayerId('layer-grist-42'));            // table liée
  assert.ok(isAtlasLayerId('layer-1786000000-1234'));     // import direct
  assert.ok(isAtlasLayerId('layer-scene-Routes_3-pts'));  // habillage
});

test('ne prend pas une couche de fond pour une couche Atlas', () => {
  assert.equal(isAtlasLayerId('building-3d'), false);
  assert.equal(isAtlasLayerId('sel-hl-ring'), false);
  // « layer » ailleurs que comme préfixe ne doit pas suffire.
  assert.equal(isAtlasLayerId('bike-layer-3d'), false);
});

test('entrées invalides', () => {
  assert.equal(isAtlasLayerId(null), false);
  assert.equal(isAtlasLayerId(undefined), false);
  assert.deepEqual(basemapLayerIds(null, 'symbol'), []);
  assert.deepEqual(basemapLayerIds([null, undefined], 'symbol'), []);
});

test('aucune couche du type demandé', () => {
  assert.deepEqual(basemapLayerIds(styleCRESO, 'heatmap'), []);
});

{
  const fausseCarte = (feuille) => {
    const attente = [];
    return {
      style: { stylesheet: feuille },
      once(ev, f) { if (ev === 'idle') attente.push(f); },
      idle() { const f = attente.shift(); f?.(); },
      enAttente: () => attente.length,
    };
  };

  test('quandNouveauStyle — un idle émis sur l’ancien style (image rendue pendant la requête) ne déclenche rien', () => {
    const ancienne = { nom: 'liberty' };
    const map = fausseCarte(ancienne);
    let appels = 0;
    quandNouveauStyle(map, ancienne, () => { appels++; }, { maintenant: () => 0 });
    map.idle();                                // triggerRepaint pendant la requête
    assert.equal(appels, 0);
    assert.equal(map.enAttente(), 1, 'réarmé');
    map.style.stylesheet = { nom: 'positron' }; // différence appliquée : même Style, feuille neuve
    map.idle();
    assert.equal(appels, 1);
  });

  test('quandNouveauStyle — style recréé (objet Style neuf) : reconnu aussi', () => {
    const ancienne = {};
    const map = fausseCarte(ancienne);
    let appels = 0;
    quandNouveauStyle(map, ancienne, () => { appels++; }, { maintenant: () => 0 });
    map.style = { stylesheet: {} };
    map.idle();
    assert.equal(appels, 1);
  });

  test('quandNouveauStyle — style identique (feuille inchangée) : rappel après le délai', () => {
    const ancienne = {};
    const map = fausseCarte(ancienne);
    let t = 0;
    let appels = 0;
    quandNouveauStyle(map, ancienne, () => { appels++; }, { delaiMaxMs: 5000, maintenant: () => t });
    map.idle();
    assert.equal(appels, 0);
    t = 6000;
    map.idle();
    assert.equal(appels, 1);
  });
}
