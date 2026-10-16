/**
 * Les libellés accessibles de MapLibre (« Map », « Toggle attribution ») sont en français : `locale` est passé à la création de la carte.
 * node --test projects/Atlas/tests/carte-locale-fr.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(ici, '..', 'app_v7.js'), 'utf8');
// la locale vit dans lib/fonds-base.js, commune à l'application et au composant BI
const fonds = fs.readFileSync(path.join(ici, '..', 'lib', 'fonds-base.js'), 'utf8');

test('la carte est créée avec la locale française', () => {
  assert.match(src, /map = new maplibregl\.Map\(\{\s*container: 'map',\s*locale: LOCALE_CARTE,/);
});

test('la locale couvre le titre de la carte et les crédits (les deux libellés relevés en anglais)', () => {
  const bloc = /export const LOCALE_CARTE = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(fonds);
  assert.ok(bloc, 'LOCALE_CARTE introuvable');
  assert.match(bloc[1], /'Map\.Title': 'Carte'/);
  assert.match(bloc[1], /'AttributionControl\.ToggleAttribution': 'Afficher ou masquer les crédits'/);
  for (const m of bloc[1].matchAll(/: '([^']*)'/g)) assert.doesNotMatch(m[1], /\b(Toggle|Zoom in|Zoom out|Map)\b/, m[1]);
});
