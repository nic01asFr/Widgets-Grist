/**
 * Les marges de la carte (lib/bi/marges.js) : la zone utile quand l'hôte pose un panneau. Posées par la scène, par `flyTo({ marges })` ou par la méthode
 * `setMarges` de l'élément ; persistantes ; respectées par `flyTo` et `fitTo` (en `padding` de chaque déplacement, jamais par `map.setPadding`).
 * node --test projects/Atlas/tests/bi-marges.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { normaliserMarges, avecConfort, decalageDansZone, limiterPadding, MARGE_MAX } from '../lib/bi/marges.js';
import { carteSimulee, MANIFESTE, DONNEES } from './aide-carte-bi.js';

const A_DROITE = { top: 0, right: 380, bottom: 0, left: 0 };

test('normaliserMarges : côtés absents = 0, tout à zéro = pas de marges, forme invalide = erreur claire', () => {
  assert.equal(normaliserMarges(null), null); assert.equal(normaliserMarges(undefined), null); assert.equal(normaliserMarges({}), null); assert.equal(normaliserMarges({ right: 0 }), null);
  assert.deepEqual(normaliserMarges({ right: 380.4 }), A_DROITE);
  for (const mauvais of ['380', 380, [1], { right: '380' }, { right: -1 }, { right: MARGE_MAX + 1 }, { right: NaN }, { right: Infinity }, { milieu: 4 }]) assert.throws(() => normaliserMarges(mauvais), /marges/, JSON.stringify(mauvais));
  assert.deepEqual(avecConfort(A_DROITE, 60), { top: 60, right: 440, bottom: 60, left: 60 });
  assert.deepEqual(avecConfort(null, 60), { top: 60, right: 60, bottom: 60, left: 60 });
});

test('flyTo({ marges }) seul : mémorise la zone utile sans déplacer la caméra', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  assert.equal(rt.api.flyTo({ marges: A_DROITE }), true);
  assert.equal(carte.dernierVol, undefined, 'aucun déplacement');
});

test('les marges persistent : le flyTo suivant et fitTo cadrent dans la zone utile, en padding explicite, jamais par map.setPadding', async () => {
  // MapLibre 5.6.1 : `setPadding` combiné au `padding` de `fitBounds` compte la marge DEUX fois (mesuré en navigateur : 300 px retiraient ~600 px)
  const carte = carteSimulee(); const rt = attacher(carte);
  let setPaddingAppele = false; carte.setPadding = () => { setPaddingAppele = true; };
  await rt.api.setScene(MANIFESTE, DONNEES);
  rt.api.flyTo({ marges: A_DROITE });
  rt.api.flyTo({ center: [5.2, 43.3], zoom: 12 });
  assert.deepEqual(carte.dernierVol.padding, A_DROITE); assert.equal(carte.dernierVol.zoom, 12);
  rt.api.fitTo();
  assert.deepEqual(carte.optionsCadre.padding, { top: 60, right: 440, bottom: 60, left: 60 });
  assert.equal(setPaddingAppele, false, 'map.setPadding n\'est jamais appelé');
  rt.api.flyTo({ center: [5.2, 43.3], padding: { top: 5, right: 5, bottom: 5, left: 5 } });
  assert.deepEqual(carte.dernierVol.padding, { top: 5, right: 5, bottom: 5, left: 5 }, 'un padding explicite de l\'hôte l\'emporte, pour ce déplacement');
});

test('retirer les marges : null, et les cadrages reviennent à la normale', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  await rt.api.setScene(MANIFESTE, DONNEES);
  rt.api.flyTo({ marges: { left: 300 } }); rt.api.flyTo({ marges: null });
  rt.api.fitTo(); assert.equal(carte.optionsCadre.padding, 60);
  rt.api.flyTo({ center: [1, 1] }); assert.equal(carte.dernierVol.padding, undefined);
});

test('marges dans le manifeste de scène ; invalides : dites dans _avertissements, la scène se monte', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  const r = await rt.api.setScene({ ...MANIFESTE, marges: { left: 320 } }, DONNEES);
  assert.equal(r._avertissements, undefined); rt.api.fitTo(); assert.deepEqual(carte.optionsCadre.padding, { top: 60, right: 60, bottom: 60, left: 380 });
  const r2 = await rt.api.setScene({ ...MANIFESTE, marges: { left: 'beaucoup' } }, DONNEES);
  assert.equal(r2.sites, 3); assert.match(r2._avertissements._scene[0], /marges\.left/);
  assert.throws(() => rt.api.flyTo({ marges: 'x' }), /marges/, 'par flyTo, une forme invalide est une erreur franche');
});

test('decalageDansZone : une bulle sous le panneau est ramenée dans la zone utile', () => {
  const cont = { largeur: 800, hauteur: 460 };
  assert.deepEqual(decalageDansZone({ left: 100, right: 300, top: 100, bottom: 200 }, cont, A_DROITE), { dx: 0, dy: 0 }, 'déjà dans la zone');
  assert.deepEqual(decalageDansZone({ left: 300, right: 500, top: 100, bottom: 200 }, cont, A_DROITE), { dx: -88, dy: 0 }, "déborde sur le panneau : décalée vers la gauche, avec un peu d'air");
  assert.deepEqual(decalageDansZone({ left: -20, right: 150, top: -10, bottom: 80 }, cont, A_DROITE), { dx: 28, dy: 18 }, 'déborde à gauche et en haut');
  assert.deepEqual(decalageDansZone({ left: 100, right: 300, top: 400, bottom: 480 }, cont, null), { dx: 0, dy: -28 }, 'sans marges : seulement le conteneur');
  assert.deepEqual(decalageDansZone({ left: 0, right: 600, top: 0, bottom: 50 }, cont, A_DROITE), { dx: 8, dy: 8 }, 'plus large que la zone : le bord haut-gauche prime');
});

test("limiterPadding : un padding qui depasse le cadre est reduit proportionnellement, jamais laisse tel quel (MapLibre ne cadre alors rien)", () => {
  const p = { top: 60, right: 60, bottom: 272, left: 60 };   // marge basse de 212 px + confort, dans un cadre de 300 px de haut
  const r = limiterPadding(p, 1707, 300);
  assert.ok(r.top + r.bottom <= 300 * 0.8 + 1e-9, 'au moins 20 % de la hauteur reste : ' + JSON.stringify(r)); assert.ok(Math.abs(r.bottom / r.top - 272 / 60) < 1e-9, 'proportions gardees');
  assert.equal(r.left, 60); assert.equal(r.right, 60, 'la largeur suffit : intacte');
  assert.equal(limiterPadding(p, 1707, 422), p, 'assez de place : le meme objet'); assert.equal(limiterPadding(60, 800, 600), 60);
  assert.deepEqual(limiterPadding(60, 100, 100), { top: 40, right: 40, bottom: 40, left: 40 }, 'un nombre est un padding sur les quatre cotes');
  assert.equal(limiterPadding(p, 0, 0), p, 'taille inconnue : inchange'); assert.equal(limiterPadding(p, 800, 0), p);
});

test("fitTo : dans un cadre trop petit pour les marges, la carte SE CADRE quand meme (padding reduit) ; cadre masque : le cadrage est rejoue a la mise a la taille", async () => {
  const carte = carteSimulee(); let cadre = { clientWidth: 1707, clientHeight: 300 }; carte.getContainer = () => cadre;
  const rt = attacher(carte); await rt.api.setScene({ ...MANIFESTE, marges: { bottom: 212 } }, DONNEES);
  carte.optionsCadre = undefined; assert.equal(rt.api.fitTo(), true);
  const p = carte.optionsCadre.padding; assert.ok(p.top + p.bottom <= 300 * 0.8 + 1e-9, 'reduit pour tenir dans 300 px : ' + JSON.stringify(p));
  cadre = { clientWidth: 1707, clientHeight: 422 }; carte.optionsCadre = undefined; rt.api.fitTo();
  assert.deepEqual(carte.optionsCadre.padding, { top: 60, right: 60, bottom: 272, left: 60 }, 'cadre assez haut : padding intact');
  // cadre masque (0 px) : rien a cadrer pour l'instant ; au redimensionnement, le cadrage est rejoue
  const rejeux = []; carte.once = (t, f) => rejeux.push([t, f]); cadre = { clientWidth: 0, clientHeight: 0 }; carte.optionsCadre = undefined;
  assert.equal(rt.api.fitTo(), false); assert.equal(carte.optionsCadre, undefined); assert.equal(rejeux.length, 1); assert.equal(rejeux[0][0], 'resize');
  cadre = { clientWidth: 1707, clientHeight: 422 }; rejeux[0][1]();
  assert.ok(carte.optionsCadre, 'le cadrage differe a eu lieu au redimensionnement');
});
