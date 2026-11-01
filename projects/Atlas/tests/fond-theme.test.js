/**
 * Le fond « Thème » : le fond de carte repeint avec la charte (celle du document, de l'instance Grist, ou celle d'Atlas qui existe toujours), bâti en volume gardé.
 * node --test projects/Atlas/tests/fond-theme.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { peintureFondTheme, estCoucheDuFond, ID_FOND } from '../lib/fond-theme.js';
import { resoudre } from '../lib/charte/resolution.js';
import { assainir } from '../lib/charte/schema.js';
import { charteDepuisThemeDef } from '../lib/charte/depuis-themedef.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(ICI, '..', 'app_v7.js'), 'utf8');

const STYLE = [
  { id: 'background', type: 'background' },
  { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park' },
  { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' },
  { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building' },
  { id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building' },
  { id: 'road_trunk_primary', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
  { id: 'label_other', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' },
  { id: 'poi_r20', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi' },
  { id: 'highway-name-major', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name' },
  { id: 'natural_earth', type: 'raster', source: 'ne2_shaded' },
  { id: 'ma-couche-de-donnees', type: 'fill', source: 'ma-couche-de-donnees' },
  { id: 'sel-hl-fill', type: 'fill', source: 'atlas-selection' },
];
const planDe = (themedef) => {
  const hote = themedef ? assainir(charteDepuisThemeDef(themedef).charte).charte : {};
  return { ...resoudre({ hote }).charte.fond.plan };
};
const parId = (rendu) => Object.fromEntries(rendu.map((r) => [r.id, r]));

test('seules les couches du fond sont touchées : jamais une couche de données ni la sélection', () => {
  assert.equal(ID_FOND, 'theme');
  const rendu = parId(peintureFondTheme(STYLE, planDe(null)));
  assert.ok(!rendu['ma-couche-de-donnees'] && !rendu['sel-hl-fill']);
  assert.equal(estCoucheDuFond(STYLE[10]), false); assert.equal(estCoucheDuFond(STYLE[1]), true); assert.equal(estCoucheDuFond(null), false);
});

test('le plan d\'Atlas existe toujours : sans aucun thème, le fond prend les jetons de la charte par défaut', () => {
  const plan = planDe(null), rendu = parId(peintureFondTheme(STYLE, plan));
  assert.equal(rendu.background.paint['background-color'], plan.fond);
  assert.equal(rendu.water.paint['fill-color'], plan.eau);
  assert.equal(rendu.park.paint['fill-color'], plan.vert);
  assert.equal(rendu.building.paint['fill-color'], plan.bati);
  assert.equal(rendu.road_trunk_primary.paint['line-color'], plan.route);
});

test('le bâti en volume est gardé et prend la couleur du bâti du thème ; sa visibilité reste au réglage de l\'application', () => {
  const plan = planDe(null), r = parId(peintureFondTheme(STYLE, plan))['building-3d'];
  assert.equal(r.visibilite, null); assert.deepEqual(r.paint, { 'fill-extrusion-color': plan.bati });
});

test('pictogrammes et relief ombré masqués ; noms de lieux et de voies gardés (visibilité au réglage « Étiquettes »)', () => {
  const rendu = parId(peintureFondTheme(STYLE, planDe(null)));
  assert.equal(rendu.poi_r20.visibilite, 'none'); assert.equal(rendu.natural_earth.visibilite, 'none');
  for (const id of ['label_other', 'highway-name-major']) { assert.equal(rendu[id].visibilite, null, id); assert.ok(rendu[id].paint['text-color'], id); }
});

test('un thème de document change les couleurs du fond : l\'accent et le fond du thème arrivent sur la carte', () => {
  const defaut = planDe(null);
  const vert = planDe({ version: 'themedef-1.0', graines: { principal: '#017c51', secondaire: '#017c51', fond: '#f2f6f4', encre: '#1f2a24' } });
  assert.notEqual(vert.fond, defaut.fond); assert.equal(vert.fond, '#f2f6f4');
  const rendu = parId(peintureFondTheme(STYLE, vert));
  assert.equal(rendu.background.paint['background-color'], '#f2f6f4');
  assert.notEqual(rendu.water.paint['fill-color'], parId(peintureFondTheme(STYLE, defaut)).water.paint['fill-color']);
});

test('un thème sombre donne un fond de carte sombre', () => {
  const sombre = planDe({ version: 'themedef-1.0', graines: { principal: '#17b378', fond: '#262633', encre: '#efefef' } });
  assert.equal(sombre.fond, '#262633');
  assert.equal(parId(peintureFondTheme(STYLE, sombre)).background.paint['background-color'], '#262633');
});

test('application : le fond Thème est le défaut, le thème de l\'instance et du document le recalculent, le réglage des étiquettes le remasque', () => {
  assert.match(app, /basemap: 'theme',/);
  assert.match(app, /theme:\s+\{ url: STYLE_BASE_URL,\s+label: 'Thème'/);
  assert.match(app, /BASEMAPS\[STATE\.settings\.basemap\] \|\| BASEMAPS\.theme/);
  assert.match(app, /_charteDuFond = r\.charte; void rafraichirFondTheme\(\);/);
  assert.match(app, /_charteDuFond = theme\.charte;/);
  assert.match(app, /setBasemapLayersVisibility\('symbol', vis\);\s*\n\s*appliquerFondTheme\(\);/);
});

test('le composant BI garde le fond Liberty d origine : le fond Thème est celui de l application, pas de la carte d un hôte', () => {
  const i = app.indexOf('async function demarrerBi()');
  assert.ok(i > 0); assert.match(app.slice(i, i + 900), /STATE\.settings\.basemap = 'liberty';/);
});
