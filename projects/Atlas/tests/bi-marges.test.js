/**
 * Les marges de la carte (lib/bi/marges.js) : la zone utile quand l'hôte pose un panneau. Posées par la scène, par `flyTo({ marges })` ou par la méthode
 * `setMarges` de l'élément ; persistantes ; respectées par `flyTo` et `fitTo`.
 * node --test projects/Atlas/tests/bi-marges.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { normaliserMarges, avecConfort, MARGE_MAX } from '../lib/bi/marges.js';
import { carteSimulee, MANIFESTE, DONNEES } from './aide-carte-bi.js';

test('normaliserMarges : côtés absents = 0, tout à zéro = pas de marges, forme invalide = erreur claire', () => {
  assert.equal(normaliserMarges(null), null); assert.equal(normaliserMarges(undefined), null); assert.equal(normaliserMarges({}), null); assert.equal(normaliserMarges({ right: 0 }), null);
  assert.deepEqual(normaliserMarges({ right: 380.4 }), { top: 0, right: 380, bottom: 0, left: 0 });
  for (const mauvais of ['380', 380, [1], { right: '380' }, { right: -1 }, { right: MARGE_MAX + 1 }, { right: NaN }, { right: Infinity }, { milieu: 4 }]) assert.throws(() => normaliserMarges(mauvais), /marges/, JSON.stringify(mauvais));
  assert.deepEqual(avecConfort({ top: 0, right: 380, bottom: 0, left: 0 }, 60), { top: 60, right: 440, bottom: 60, left: 60 });
  assert.deepEqual(avecConfort(null, 60), { top: 60, right: 60, bottom: 60, left: 60 });
});

test('flyTo({ marges }) seul : pose la zone utile sans déplacer la caméra', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  assert.equal(rt.api.flyTo({ marges: { right: 380 } }), true);
  assert.deepEqual(carte.padding, { top: 0, right: 380, bottom: 0, left: 0 }); assert.equal(carte.dernierVol, undefined, 'aucun déplacement');
});

test('les marges persistent : le flyTo suivant et fitTo cadrent dans la zone utile', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  await rt.api.setScene(MANIFESTE, DONNEES);
  rt.api.flyTo({ marges: { right: 380 } });
  rt.api.flyTo({ center: [5.2, 43.3], zoom: 12 });
  assert.deepEqual(carte.dernierVol.padding, { top: 0, right: 380, bottom: 0, left: 0 }); assert.equal(carte.dernierVol.zoom, 12);
  rt.api.fitTo();
  assert.deepEqual(carte.optionsCadre.padding, { top: 60, right: 440, bottom: 60, left: 60 });
  rt.api.flyTo({ center: [5.2, 43.3], padding: { top: 5, right: 5, bottom: 5, left: 5 } });
  assert.deepEqual(carte.dernierVol.padding, { top: 5, right: 5, bottom: 5, left: 5 }, 'un padding explicite de l\'hôte l\'emporte, pour ce déplacement');
});

test('retirer les marges : null, et les cadrages reviennent à la normale', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  await rt.api.setScene(MANIFESTE, DONNEES);
  rt.api.flyTo({ marges: { left: 300 } }); rt.api.flyTo({ marges: null });
  assert.deepEqual(carte.padding, { top: 0, right: 0, bottom: 0, left: 0 });
  rt.api.fitTo(); assert.equal(carte.optionsCadre.padding, 60);
  rt.api.flyTo({ center: [1, 1] }); assert.equal(carte.dernierVol.padding, undefined);
});

test('marges dans le manifeste de scène ; invalides : dites dans _avertissements, la scène se monte', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  const r = await rt.api.setScene({ ...MANIFESTE, marges: { left: 320 } }, DONNEES);
  assert.deepEqual(carte.padding, { top: 0, right: 0, bottom: 0, left: 320 }); assert.equal(r._avertissements, undefined);
  const r2 = await rt.api.setScene({ ...MANIFESTE, marges: { left: 'beaucoup' } }, DONNEES);
  assert.equal(r2.sites, 3); assert.match(r2._avertissements._scene[0], /marges\.left/);
  assert.throws(() => rt.api.flyTo({ marges: 'x' }), /marges/, 'par flyTo, une forme invalide est une erreur franche');
});

test('une carte sans setPadding (ancienne version de MapLibre) ne plante pas', () => {
  const carte = carteSimulee(); delete carte.setPadding; const rt = attacher(carte);
  assert.equal(rt.api.flyTo({ marges: { right: 100 } }), true);
});
