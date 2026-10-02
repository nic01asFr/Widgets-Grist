import test from 'node:test';
import assert from 'node:assert/strict';
import { captureStoryState } from '../lib/story.js';

/**
 * Deux etapes d'un meme recit doivent pouvoir montrer LA MEME couche sous deux
 * representations differentes : categorisee ici, graduee la. Cela suppose que
 * chaque etape emporte sa propre copie de la symbolisation — une reference
 * partagee ferait que la derniere configuration ecrase toutes les etapes.
 */

const carteFactice = {
  getCenter: () => ({ toArray: () => [9.25, 46.8] }),
  getZoom: () => 16, getPitch: () => 55, getBearing: () => -20,
};

const scene = (symbolisation) => ({
  settings: { projection: 'globe', timeOfDay: 720, date: '2026-08-18T12:00:00.000Z', terrain3D: true },
  layers: [{
    id: 'layer-1', name: 'Parcelles', sourceTable: 'Parcelles', visible: true,
    geometryType: 'Polygon', controls: [],
    style: { mode: 'mapbox', symbolization: symbolisation },
  }],
});

test('chaque etape emporte sa propre symbolisation', () => {
  const categorise = { color: { mode: 'categorized', field: 'usage', stops: [{ value: 'agricole', color: '#41ab5d' }] } };
  const s = scene(categorise);

  const etape1 = captureStoryState(carteFactice, s);

  // L'utilisateur reconfigure la couche, puis capture une seconde etape.
  s.layers[0].style.symbolization = { color: { mode: 'graduated', field: 'surface', stops: [{ lower: 0, upper: 10, color: '#deebf7' }] } };
  const etape2 = captureStoryState(carteFactice, s);

  assert.equal(etape1.layers[0].symbolization.color.mode, 'categorized');
  assert.equal(etape2.layers[0].symbolization.color.mode, 'graduated');
});

test('modifier la couche apres coup ne reecrit pas les etapes deja capturees', () => {
  // Le piege : `symbolization` stockee par reference. La couche vivante et
  // l'etape pointeraient alors sur le meme objet, et tout reglage ulterieur
  // reecrirait le passe du recit.
  const s = scene({ color: { mode: 'categorized', field: 'usage' } });
  const etape = captureStoryState(carteFactice, s);

  s.layers[0].style.symbolization.color.mode = 'graduated';
  s.layers[0].style.symbolization.color.field = 'surface';

  assert.equal(etape.layers[0].symbolization.color.mode, 'categorized',
    'l etape a suivi la couche : la capture partage sa reference');
  assert.equal(etape.layers[0].symbolization.color.field, 'usage');
});

test('deux captures successives ne partagent pas leur objet', () => {
  const s = scene({ color: { mode: 'categorized', field: 'usage' } });
  const a = captureStoryState(carteFactice, s);
  const b = captureStoryState(carteFactice, s);
  a.layers[0].symbolization.color.mode = 'graduated';
  assert.equal(b.layers[0].symbolization.color.mode, 'categorized');
});

test('une couche sans symbolisation ne fabrique pas d etat fantome', () => {
  const s = scene(undefined);
  const etape = captureStoryState(carteFactice, s);
  assert.equal(etape.layers[0].symbolization, null);
});

test('le rendu surfacique est capture a part, et vaut null quand il n est pas defini', () => {
  // `polygonMode` vit hors symbolization : sans lui, une etape ne saurait pas
  // montrer un bati en volume puis le remettre a plat. Capte a plat, il doit
  // etre ecrit (`null`) pour remettre a plat ce qu'une etape d'avant a extrude.
  const s = scene({ color: { mode: 'single' } });
  assert.equal(captureStoryState(carteFactice, s).layers[0].polygonMode, null);
  s.layers[0].style.polygonMode = 'flat';
  assert.equal(captureStoryState(carteFactice, s).layers[0].polygonMode, 'flat');
});

/* ---------- etiquettes ---------- */

test('les etiquettes font partie de l etape', () => {
  // `label` vit dans `symbolization` : une etape peut donc montrer une couche
  // etiquetee, puis la meme sans etiquettes.
  const s = scene({
    color: { mode: 'single' },
    label: { enabled: true, field: 'nom', size: 14, color: '#2D2820' },
  });
  const avec = captureStoryState(carteFactice, s);

  s.layers[0].style.symbolization.label.enabled = false;
  const sans = captureStoryState(carteFactice, s);

  assert.equal(avec.layers[0].symbolization.label.enabled, true);
  assert.equal(avec.layers[0].symbolization.label.field, 'nom');
  assert.equal(avec.layers[0].symbolization.label.size, 14);
  assert.equal(sans.layers[0].symbolization.label.enabled, false,
    'l etape sans etiquettes a suivi celle qui en a');
});

test('changer le champ d etiquette n affecte pas l etape precedente', () => {
  const s = scene({ color: { mode: 'single' }, label: { enabled: true, field: 'nom' } });
  const etape = captureStoryState(carteFactice, s);
  s.layers[0].style.symbolization.label.field = 'code';
  assert.equal(etape.layers[0].symbolization.label.field, 'nom');
});
