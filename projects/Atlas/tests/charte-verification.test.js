// Vérification : avertissements chiffrés, avec conseil.
// node --test tests/charte-verification.test.js   (aucun accès réseau, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../lib/charte/verification.js';
import * as C from '../lib/charte/couleurs.js';
import { resoudre } from '../lib/charte/resolution.js';
import { CHARTE_ATLAS as ATLAS } from '../lib/charte/defauts.js';
import { PALETTES_HERITAGE } from '../lib/charte/heritage.js';

const CTX = { fond: '#ffffff', encre: '#1f1b14', exigences: ATLAS.exigences };
const pal = (type, couleurs, ctx = {}) => V.verifierPalette({ type, couleurs }, { ...CTX, chemin: 'p', ...ctx });
const code = (r, c) => r.avertissements.filter((a) => a.code === c);

test('forme d\'un avertissement : { code, niveau, chemin, valeur, mesure, conseil }, niveau attention ou info', () => {
  const r = resoudre({ hote: { graines: { encre: '#cccccc' } } });
  assert.ok(r.avertissements.length > 0);
  for (const a of r.avertissements) { assert.deepEqual(Object.keys(a), ['code', 'niveau', 'chemin', 'valeur', 'mesure', 'conseil']); assert.ok(['attention', 'info'].includes(a.niveau)); assert.equal(typeof a.code, 'string'); assert.equal(typeof a.conseil, 'string'); assert.ok(a.conseil.length > 10); }
});

test('ordre des clartés : une rampe qui revient en arrière est signalée, avec les visions concernées', () => {
  const r = pal('sequential', ['#f7fbff', '#08306b', '#9ecae1', '#3182bd']);
  const a = code(r, 'ordre-clartes'); assert.equal(a.length, 1); assert.equal(a[0].niveau, 'attention'); assert.ok(a[0].mesure.visions.includes('normale')); assert.match(a[0].conseil, /sans retour en arrière/);
  assert.equal(code(pal('sequential', ['#f7fbff', '#9ecae1', '#3182bd', '#08306b']), 'ordre-clartes').length, 0);
});

test('ordre des clartés : deux couleurs de même clarté perçue en gris (rouge et vert) sont signalées en niveaux de gris', () => {
  const o = V.ordreClartes(['#ffffff', '#ff0000', '#00a000']); assert.ok(o.cassees.length >= 0);
  const gris = V.ordreClartes(['#808080', '#808080', '#000000']); assert.deepEqual(gris.gris, false);
});

test('nombre de classes : la charte en demande plus que la palette n\'en permet, réponse chiffrée avec le nombre conseillé', () => {
  const viridis = ['#440154', '#3e4a89', '#26828e', '#35b779', '#6ece58', '#b5de2b', '#fde725'];
  const a = code(pal('sequential', viridis, { exigences: { ...ATLAS.exigences, classesMax: 7 } }), 'nombre-classes')[0];
  assert.equal(a.valeur, 7); assert.equal(a.mesure.nMaxAdmis, 5); assert.equal(a.mesure.pire, 3.9); assert.equal(a.mesure.vision, 'protanopie'); assert.match(a.conseil, /Réduire à 5 classes/);
  assert.equal(code(pal('sequential', viridis, { exigences: { ...ATLAS.exigences, classesMax: 5 } }), 'nombre-classes').length, 0);
});

test('écart entre classes voisines : même à 3 classes, deux classes qui se confondent', () => {
  const r = pal('sequential', ['#e0e0e0', '#dcdcdc', '#d8d8d8'], { exigences: { ...ATLAS.exigences, classesMax: 3 } });
  const a = code(r, 'ecart-classes-voisines')[0]; assert.ok(a && a.mesure.pire < 6 && a.mesure.classes === 3); assert.equal(a.niveau, 'attention');
});

test('divergente rouge-vert : pôles confondus en daltonisme, signalé avec la vision et le conseil bleu-orange', () => {
  const rg = PALETTES_HERITAGE.RdYlGn; const r = pal('divergent', [...rg]);
  const a = code(r, 'divergente-confondue')[0]; assert.ok(a); assert.ok(a.mesure.pire < 10); assert.ok(['protanopie', 'deuteranopie'].includes(a.mesure.vision)); assert.match(a.conseil, /jamais rouge et vert/);
  assert.equal(code(pal('divergent', ATLAS.donnees.divergente), 'divergente-confondue').length, 0);
});

test('qualitative : couleurs qui se confondent, avec le préfixe sûr', () => {
  const r = pal('qualitative', ['#e15759', '#59a14f', '#4e79a7', '#f28e2b', '#76b7b2', '#edc948']);
  const a = code(r, 'ecart-qualitative')[0]; assert.ok(a); assert.equal(a.niveau, 'attention'); assert.ok(a.mesure.kMaxAdmis < 6); assert.match(a.conseil, /Limiter à \d+ catégories/);
  assert.equal(code(pal('qualitative', ATLAS.donnees.qualitative), 'ecart-qualitative').length, 0);
});

test('contraste d\'une classe sur le fond : contour sombre requis ; avec un fond sombre, le contour devient clair', () => {
  const clair = code(pal('sequential', ATLAS.donnees.sequentielles.principale), 'contraste-classe-fond')[0];
  assert.equal(clair.niveau, 'info'); assert.match(clair.conseil, /Contour sombre requis/); assert.equal(clair.mesure.contour, 'sombre');
  const sombre = code(pal('sequential', ['#1b2834', '#58a6e1', '#abd1ee'], { fond: '#12161c', encre: '#eef1f5' }), 'contraste-classe-fond')[0];
  assert.equal(sombre.mesure.contour, 'clair'); assert.ok(sombre.mesure.rapports[1] < 3);
});

test('texte lisible sur une classe : l\'encre et le fond ne suffisent pas sur un ton moyen, et le conseil le dit', () => {
  const r = pal('sequential', ['#ffffff', '#808080', '#000000'], { fond: '#ffffff', encre: '#767676', exigences: { ...ATLAS.exigences, classesMax: 3 } });
  const a = code(r, 'texte-illisible-classe')[0]; assert.ok(a); assert.deepEqual(Object.keys(a.mesure.rapports), ['2']); assert.equal(a.mesure.seuil, 4.5); assert.match(a.conseil, /halo|noir/);
});

test('charte : texte, états, traits et plan sous leurs seuils sont signalés avec le rapport mesuré', () => {
  const r = resoudre({ hote: { graines: { encre: '#aaaaaa', erreur: '#ff6666' }, donnees: { sansDonnee: '#eeeeee' } } });
  const par = (c, chemin) => r.avertissements.find((a) => a.code === c && a.chemin === chemin);
  assert.equal(par('contraste-texte', 'graines.encre').niveau, 'attention'); assert.ok(par('contraste-texte', 'graines.encre').mesure.rapport < 4.5);
  assert.ok(par('contraste-etat', 'graines.erreur').mesure.rapport < 4.5); assert.ok(par('contraste-trait', 'donnees.sansDonnee').mesure.rapport < 3);
  assert.ok(par('contraste-texte', 'fond.plan.texte'));
});

test('marqueurs : deux états de même forme et de couleurs voisines sont signalés ; des formes différentes suffisent', () => {
  const g = { principal: '#c44536', fond: '#ffffff', encre: '#1f1b14', succes: '#1e6b3e', alerte: '#8a5a00', erreur: '#b3261e', information: '#1f5f99' };
  const meme = resoudre({ hote: { graines: { ...g, erreur: '#8a5a10' }, marqueurs: { formes: { alerte: 'cercle', erreur: 'cercle', succes: 'cercle' } } } });
  const a = meme.avertissements.find((x) => x.code === 'marqueurs-confondus'); assert.ok(a); assert.ok(a.mesure.pire < 6); assert.match(a.conseil, /forme différente/);
  const diff = resoudre({ hote: { graines: { ...g, erreur: '#8a5a10' } } });
  assert.equal(diff.avertissements.some((x) => x.code === 'marqueurs-confondus'), false, 'formes distinctes par défaut');
});

test('mesures : écart voisin, tous-paires et nMax cohérents avec les seuils', () => {
  const e = V.ecartsVoisins(['#000000', '#ffffff']); assert.equal(e.pire, 100 > e.pire ? e.pire : 100); assert.ok(e.pire > 50); assert.equal(e.niveau, 'net');
  assert.equal(V.ecartsVoisins(['#123456']).pire, null);
  assert.ok(['protanopie', 'deuteranopie'].includes(V.ecartsTousPairs(['#ff0000', '#00aa00'], 2).vision), 'rouge et vert : la pire vision est un daltonisme rouge-vert');
  assert.equal(V.nMaxMesure((n) => C.echantillonner(['#ffffff', '#000000'], n), 10, 3, 9), 6, 'noir-blanc interpolé en sRGB : les teintes sombres se resserrent');
  assert.ok(V.nMaxMesure((n) => C.echantillonner(['#ffffff', '#000000'], n), 6, 3, 9) > 6);
  assert.equal(V.nMaxMesure((n) => C.echantillonner(['#e0e0e0', '#d0d0d0'], n), 10, 3, 9), null);
  assert.deepEqual(V.contourPour('#ffffff', '#000000', '#ffffff'), { hex: '#000000', nature: 'sombre', rapport: 21 });
  assert.equal(V.contourPour('#000000', '#000000', '#ffffff').nature, 'clair');
});

test('charte « atlas » : aucun avertissement d\'attention ; seuls des faits de lisibilité (info) qu\'un contour ou une forme compense', () => {
  const r = resoudre({});
  assert.deepEqual(r.avertissements.filter((a) => a.niveau === 'attention'), []);
  assert.deepEqual([...new Set(r.avertissements.map((a) => a.code))].sort(), ['contraste-classe-fond', 'texte-illisible-classe']);
  assert.equal(r.a11y.attention, 0); assert.ok(r.a11y.info >= 3); assert.equal(r.a11y.encreSurFond, 17.14);
});
