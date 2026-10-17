/**
 * Une carte de sélection de cases (retour de la Fabrique, qui remplace sa carte Leaflet par <atlas-bi>) : l'emprise visible dans l'événement `camera`, la mise à jour d'UNE
 * couche sans rejouer la scène (`fusion: true`), l'étiquette permanente d'une couche de polygones, le curseur demandé par la scène.
 * node --test projects/Atlas/tests/bi-selection-carte.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { etiquetteDeclaree, curseurDeclare, CURSEURS } from '../lib/bi/style-polygone.js';
import { carteSimulee, point } from './aide-carte-bi.js';

const case_ = (x, y, id, props = {}) => ({ type: 'Feature', id, properties: props, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 0.01, y], [x + 0.01, y + 0.01], [x, y + 0.01], [x, y]]] } });
const GRILLE = (n) => Array.from({ length: n }, (_, i) => case_(5.3 + i * 0.01, 43.2, i + 1, { etiquette: i + '/25', taux: i / 25 }));
const COUCHE_GRILLE = (extra = {}) => ({ id: 'grille', name: 'Grille', geometry_type: 'polygon', visuel: { etiquette: { champ: 'etiquette', taille: 11 } }, style: { declarative: { kind: 'graduated', field: 'taux', stops: [{ lower: 0, upper: 0.5, color: '#fee8c8' }, { lower: 0.5, upper: 1, color: '#e34a33' }] } }, ...extra });
const attendre = (ms = 160) => new Promise((r) => setTimeout(r, ms));

test('etiquetteDeclaree : un champ obligatoire, une taille bornée de 8 à 24 ; le reste est écarté', () => {
  assert.deepEqual(etiquetteDeclaree({ champ: 'etiquette' }), { champ: 'etiquette', taille: 12 }); assert.deepEqual(etiquetteDeclaree({ champ: ' n ', taille: 99 }), { champ: 'n', taille: 24 }); assert.equal(etiquetteDeclaree({ champ: 'n', taille: 2 }).taille, 8);
  for (const mauvais of [undefined, null, 'x', [], {}, { champ: '' }, { champ: 3 }]) assert.equal(etiquetteDeclaree(mauvais), null, JSON.stringify(mauvais));
});

test('curseurDeclare : seulement la liste admise, jamais une valeur libre (pas d url() ni de chaîne de style)', () => {
  assert.deepEqual(CURSEURS, ['crosshair', 'zoom-in', 'zoom-out', 'pointer', 'grab', 'cell', 'default']);
  assert.equal(curseurDeclare('crosshair'), 'crosshair'); for (const mauvais of ['url(x.png), auto', 'move', '', null, undefined, 3]) assert.equal(curseurDeclare(mauvais), null, String(mauvais));
});

test('étiquette permanente : un calque de texte par couche de polygones, lu dans le champ déclaré, jamais masqué par une collision ; rien sans déclaration', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  await rt.api.setScene({ layers: [COUCHE_GRILLE()] }, { grille: GRILLE(3) });
  const etiq = carte.calques.find((c) => c.id === 'bi-etiq-grille'); assert.ok(etiq, 'calque d étiquette'); assert.equal(etiq.type, 'symbol');
  assert.deepEqual(etiq.layout['text-field'], ['to-string', ['coalesce', ['get', 'etiquette'], '']]); assert.equal(etiq.layout['text-size'], 11);
  assert.equal(etiq.layout['text-allow-overlap'], true); assert.equal(etiq.layout['text-ignore-placement'], true);
  await rt.api.setScene({ layers: [COUCHE_GRILLE({ visuel: {} })] }, { grille: GRILLE(3) }); assert.ok(!carte.calques.some((c) => c.id === 'bi-etiq-grille'), 'sans étiquette déclarée : pas de calque');
  await rt.api.setScene({ layers: [COUCHE_GRILLE({ visuel: { etiquette: { champ: '' } } })] }, { grille: GRILLE(3) }); assert.ok(!carte.calques.some((c) => c.id === 'bi-etiq-grille'), 'étiquette invalide : écartée');
});

test('fusion: true remplace SEULEMENT les couches listées : les autres, le temps et la sélection restent', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  await rt.api.setScene({ temps: { champ: 'annee', mode: 'instant', valeur: 2024 }, layers: [COUCHE_GRILLE(), { id: 'sites', name: 'Sites', geometry_type: 'point', cle: 'ref' }] },
    { grille: GRILLE(4), sites: [point(5.3, 43.2, { ref: 'S1', annee: 2024 }, 100), point(5.31, 43.2, { ref: 'S2', annee: 2023 }, 101)] });
  assert.equal(rt.api.select(100), 100); const avant = carte.calques.filter((c) => /sites/.test(c.id)).map((c) => c.id);
  const r = await rt.api.setScene({ fusion: true, layers: [COUCHE_GRILLE()] }, { grille: GRILLE(9) });
  assert.equal(r.grille, 9, 'la couche mise à jour a ses nouvelles entités'); assert.equal(r.sites, 2, 'l autre couche est intacte et comptée');
  assert.deepEqual(carte.calques.filter((c) => /sites/.test(c.id)).map((c) => c.id), avant, 'ses calques n ont pas bougé');
  assert.equal(rt.api.getRows('grille').lignes.length, 9); assert.equal(carte.etats.get([...carte.sources.keys()].find((k) => /src-sites/.test(k)) + '|100').selected, true, 'la sélection sur l autre couche est gardée');
  assert.doesNotThrow(() => rt.api.setTime(2023), 'la dimension temporelle de la scène est gardée');
  await rt.api.setScene({ fusion: true, layers: [{ id: 'nouvelle', name: 'N', geometry_type: 'polygon' }] }, { nouvelle: GRILLE(2) }); assert.deepEqual(rt.api.ping().couches.sort(), ['grille', 'nouvelle', 'sites']);
  await rt.api.setScene({ layers: [COUCHE_GRILLE()] }, { grille: GRILLE(1) }); assert.deepEqual(rt.api.ping().couches, ['grille'], 'sans fusion : tout est remplacé, comme avant'); assert.throws(() => rt.api.setTime(2023), /aucun champ temporel/);
});

test('fusion : une couche remplacée qui était sélectionnée se désélectionne ; la fusion sans couche existante fonctionne comme une première scène', async () => {
  const rt = attacher(carteSimulee()); const r0 = await rt.api.setScene({ fusion: true, layers: [COUCHE_GRILLE()] }, { grille: GRILLE(2) }); assert.equal(r0.grille, 2);
  rt.api.select(1); const evts = []; rt.on('select', (c) => evts.push(c));
  await rt.api.setScene({ fusion: true, layers: [COUCHE_GRILLE()] }, { grille: GRILLE(3) }); assert.throws(() => rt.api.select(99), /entité inconnue/); assert.equal(rt.api.select(1), 1, 'les nouvelles entités se sélectionnent');
});

test('camera : l emprise visible (ouest, sud, est, nord) accompagne le centre et le zoom, pour qu une grille suive la vue', async () => {
  const carte = carteSimulee(); carte.getBounds = () => ({ getWest: () => 5.2, getSouth: () => 43.1, getEast: () => 5.5, getNorth: () => 43.4 });
  const rt = attacher(carte); const vus = []; rt.on('camera', (c) => vus.push(c));
  carte.emit('moveend', {}); await attendre();
  assert.equal(vus.length, 1); assert.deepEqual(vus[0].bounds, [5.2, 43.1, 5.5, 43.4]); assert.deepEqual(vus[0].center, [2.4, 46.6]); assert.equal(vus[0].zoom, 5);
  const sans = carteSimulee(); const rt2 = attacher(sans); const v2 = []; rt2.on('camera', (c) => v2.push(c)); sans.emit('moveend', {}); await attendre(); assert.equal(v2[0].bounds, undefined, 'carte sans getBounds : le champ est omis');
});

test('curseur de la scène : demandé par le manifeste, gardé hors survol, « pointer » sur un objet ; une valeur inconnue est écartée ET dite', async () => {
  global.requestAnimationFrame = (f) => { f(); return 0; };   // exécuté tout de suite ; 0 : le garde anti-rafale du survol ne reste pas armé
  try {
    const carte = carteSimulee(); const canevas = { style: { cursor: '' } }; carte.getCanvas = () => canevas; const rt = attacher(carte);
    await rt.api.setScene({ curseur: 'crosshair', layers: [COUCHE_GRILLE()] }, { grille: GRILLE(2) }); assert.equal(canevas.style.cursor, 'crosshair');
    carte.queryRenderedFeatures = () => []; carte.emit('mousemove', { point: { x: 1, y: 1 } }); assert.equal(canevas.style.cursor, 'crosshair', 'hors objet : le curseur de la scène');
    carte.queryRenderedFeatures = () => [{ id: 1, layer: { id: 'bi-fill-grille' }, source: 'bi-src-grille' }]; carte.emit('mousemove', { point: { x: 2, y: 2 } }); assert.equal(canevas.style.cursor, 'pointer', 'sur un objet : pointer');
    const r = await rt.api.setScene({ curseur: 'url(x.png), auto', layers: [COUCHE_GRILLE()] }, { grille: GRILLE(1) }); assert.match(r._avertissements._scene[0], /curseur/); assert.equal(canevas.style.cursor, '');
    await rt.api.setScene({ curseur: 'zoom-in', layers: [COUCHE_GRILLE()] }, { grille: GRILLE(1) }); await rt.api.setScene({ fusion: true, layers: [COUCHE_GRILLE()] }, { grille: GRILLE(2) }); assert.equal(canevas.style.cursor, 'zoom-in', 'une fusion sans `curseur` garde celui de la scène');
  } finally { delete global.requestAnimationFrame; }
});

test('la grille graduée : classes et comptes de getLegend, et highlight de plusieurs cases (contour de sélection piloté par l hôte)', async () => {
  const carte = carteSimulee(); const rt = attacher(carte); const taux = [0.2, 0.3, 0.6, 0.9, 0.1, 0.4];
  await rt.api.setScene({ layers: [COUCHE_GRILLE()] }, { grille: taux.map((t, i) => case_(5.3 + i * 0.01, 43.2, i + 1, { etiquette: i + '/25', taux: t })) });
  const l = rt.api.getLegend('grille'); assert.equal(l.type, 'graduated'); assert.equal(l.champ, 'taux'); assert.equal(l.total, 6); assert.deepEqual(l.classes.map((c) => c.compte), [4, 2], 'cases de 0 à 0,5 puis de 0,5 à 1 (bornes hautes incluses)');
  assert.equal(rt.api.highlight([2, 3, 4]), 3); const etat = (id) => carte.etats.get([...carte.sources.keys()].find((k) => /src-grille/.test(k)) + '|' + id);
  assert.equal(etat(2).highlight, true); assert.equal(etat(4).highlight, true); assert.equal(etat(5).highlight, false); rt.api.highlight([]); assert.equal(etat(2).highlight, false);
});
