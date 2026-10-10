// Palettes par défaut d'Atlas (charte « atlas » et « contraste-eleve »), mesurées : contraste, écarts CIEDE2000, daltonisme, gris.
// node --test tests/charte-palettes.test.js   (aucun accès réseau, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../lib/charte/couleurs.js';
import * as V from '../lib/charte/verification.js';
import { CHARTE_ATLAS as ATLAS, CHARTE_CONTRASTE_ELEVE as ELEVE, OKABE_ITO, VIRIDIS, QUALITATIVE_ATLAS } from '../lib/charte/defauts.js';

const HEX = /^#[0-9a-f]{6}$/;
const A = ATLAS.donnees, E = ELEVE.donnees, BLANC = '#ffffff';

// ---------------------------------------------------------------------------------------------------------------- qualitative : Okabe-Ito
test('qualitative d\'Atlas : les 8 couleurs publiées d\'Okabe et Ito (2008), dans un ordre où chaque préfixe reste distinct', () => {
  assert.deepEqual(OKABE_ITO, { noir: '#000000', orange: '#e69f00', cielBleu: '#56b4e9', vertBleute: '#009e73', jaune: '#f0e442', bleu: '#0072b2', vermillon: '#d55e00', pourpreRouge: '#cc79a7' });
  assert.equal(A.qualitative.length, 8); assert.deepEqual([...A.qualitative].sort(), Object.values(OKABE_ITO).sort(), 'un ordre des huit couleurs, rien d\'autre');
  assert.deepEqual(A.qualitative, QUALITATIVE_ATLAS); assert.equal(A.qualitative[7], OKABE_ITO.noir, 'le noir en dernier');
});

test('qualitative d\'Atlas : écart minimal annoncé par préfixe, pire cas sur vision normale + 3 daltonismes', () => {
  const pires = [2, 3, 4, 5, 6, 7, 8].map((k) => V.ecartsTousPairs(A.qualitative, k).pire);
  assert.deepEqual(pires, [51.4, 12.1, 11.1, 11.1, 11.1, 11.1, 11.1]);
  for (const p of pires) assert.ok(p >= V.SEUILS.deltaNet, 'toutes les paires >= 10 : ' + p);
  const m = V.verifierPalette({ type: 'qualitative', couleurs: A.qualitative }, { fond: BLANC, encre: ATLAS.graines.encre });
  assert.deepEqual(m.mesures.classes, { n: 8, kMaxNet: 8, kMaxAdmis: 8, pire: 11.1, vision: m.mesures.classes.vision, paire: m.mesures.classes.paire });
  assert.equal(m.avertissements.filter((a) => a.niveau === 'attention').length, 0);
});

test('qualitative d\'Atlas : les couleurs claires l\'annoncent (contour sombre requis), chiffres à l\'appui', () => {
  const r = V.verifierPalette({ type: 'qualitative', couleurs: A.qualitative }, { fond: BLANC, encre: ATLAS.graines.encre, chemin: 'donnees.qualitative' });
  const a = r.avertissements.find((x) => x.code === 'contraste-classe-fond');
  assert.deepEqual(Object.keys(a.mesure.rapports), ['2', '5', '7'], 'orange, ciel, jaune');
  assert.deepEqual(a.mesure.rapports, { 2: 2.25, 5: 2.31, 7: 1.32 }); assert.match(a.conseil, /Contour sombre requis sur les classes 2, 5, 7/);
});

// ---------------------------------------------------------------------------------------------------------------- séquentielle de l'accent
test('séquentielle d\'Atlas : UNE teinte, celle de l\'accent de l\'interface (--accent: #C44536)', () => {
  const s = A.sequentielles.principale; assert.equal(s.length, 9); s.forEach((c) => assert.match(c, HEX));
  assert.equal(ATLAS.graines.principal, '#c44536');
  const hue = C.teinte(ATLAS.graines.principal);
  for (const c of s.slice(1, -1)) { const d = Math.abs(C.teinte(c) - hue); assert.ok(Math.min(d, 360 - d) < 14, c + ' : ' + C.teinte(c).toFixed(1)); }
  assert.ok(s.map(C.clarte).every((x, i, t) => i === 0 || x < t[i - 1]));
});

test('séquentielles par défaut : toutes ordonnées en protanopie, deutéranopie, tritanopie et niveaux de gris', () => {
  for (const [nom, ramp] of [['atlas', A.sequentielles.principale], ['viridis', A.sequentielles.continue], ['eleve', E.sequentielles.principale], ['eleve-viridis', E.sequentielles.continue]]) {
    for (let n = 3; n <= ramp.length; n++) {
      const cls = C.echantillonner(ramp, n), o = V.ordreClartes(cls);
      for (const k of ['normale', 'protanopie', 'deuteranopie', 'tritanopie', 'gris']) assert.equal(o[k], true, `${nom} n=${n} ordre perdu en ${k}`);
      const gris = cls.map(C.versGris).map(C.clarte); const pas = Math.min(...gris.slice(0, -1).map((x, i) => Math.abs(x - gris[i + 1]))); assert.ok(pas >= 3, `${nom} n=${n} pas de gris ${pas.toFixed(1)}`);
    }
  }
});

test('séquentielle d\'Atlas : 5 classes nettes, 7 admises, 9 déconseillées (écart CIEDE2000 au pire cas)', () => {
  const e = (n) => V.ecartsVoisins(C.echantillonner(A.sequentielles.principale, n));
  assert.equal(e(3).pire, 26.8); assert.equal(e(5).pire, 11.6); assert.equal(e(7).pire, 7.9); assert.equal(e(9).pire, 5.6);
  assert.equal(e(5).niveau, 'net'); assert.equal(e(7).niveau, 'admis'); assert.equal(e(9).niveau, 'deconseille');
  const m = V.verifierPalette({ type: 'sequential', couleurs: A.sequentielles.principale }, { fond: BLANC, encre: ATLAS.graines.encre, exigences: { classesMax: 9 } });
  assert.equal(m.mesures.classes.nMaxNet, 5); assert.equal(m.mesures.classes.nMaxAdmis, 8);
});

test('séquentielle d\'Atlas : les classes claires n\'atteignent pas 3:1 contre le fond, et le dit', () => {
  assert.deepEqual(A.sequentielles.principale.map((c) => Math.round(C.contraste(c, BLANC) * 100) / 100), [1.18, 1.47, 1.86, 2.4, 3.17, 4.21, 5.65, 7.73, 10.42]);
  const r = V.verifierPalette({ type: 'sequential', couleurs: A.sequentielles.principale }, { fond: BLANC, encre: ATLAS.graines.encre, exigences: ATLAS.exigences });
  const a = r.avertissements.find((x) => x.code === 'contraste-classe-fond');
  assert.deepEqual(a.mesure.rapports, { 1: 1.18, 2: 1.86 }); assert.equal(a.niveau, 'info'); assert.match(a.conseil, /Contour sombre requis sur les classes 1, 2/); assert.equal(a.mesure.contour, 'sombre');
});

test('Viridis (continue) : ordonnée partout, mais plus de 5 classes se confondent en protanopie — annoncé', () => {
  assert.deepEqual(A.sequentielles.continue, [...VIRIDIS]); assert.equal(VIRIDIS[0], '#440154'); assert.equal(VIRIDIS[6], '#fde725');
  const r = V.verifierPalette({ type: 'sequential', couleurs: A.sequentielles.continue }, { fond: BLANC, encre: ATLAS.graines.encre, exigences: { ...ATLAS.exigences, classesMax: 7 } });
  const a = r.avertissements.find((x) => x.code === 'nombre-classes');
  assert.equal(a.mesure.nMaxAdmis, 5); assert.equal(a.mesure.nMaxNet, 4); assert.equal(a.mesure.pire, 3.9); assert.equal(a.mesure.vision, 'protanopie'); assert.match(a.conseil, /Réduire à 5 classes \(4 pour des classes nettes\)/);
  assert.equal(r.avertissements.some((x) => x.code === 'ordre-clartes'), false);
});

// ---------------------------------------------------------------------------------------------------------------- divergente bleu-orange
test('divergente d\'Atlas : bleu et orange, jamais rouge et vert ; extrêmes de même clarté ; paires miroir distinctes en daltonisme', () => {
  const d = A.divergente; assert.equal(d.length, 7);
  assert.ok(C.teinte(d[1]) > 30 && C.teinte(d[1]) < 80, 'orange'); assert.ok(C.teinte(d[5]) > 250 && C.teinte(d[5]) < 300, 'bleu');
  assert.ok(Math.abs(C.clarte(d[0]) - C.clarte(d[6])) < 0.5);
  const r = V.verifierPalette({ type: 'divergent', couleurs: d }, { fond: BLANC, encre: ATLAS.graines.encre });
  assert.ok(r.mesures.miroir.pire >= 20, 'pire miroir : ' + r.mesures.miroir.pire);
  assert.equal(r.avertissements.some((a) => a.code === 'divergente-confondue' || a.code === 'ecart-classes-voisines'), false);
  assert.equal(V.ecartsVoisins(d).pire, 12.4); assert.equal(V.ecartsVoisins(d).niveau, 'net');
});

test('divergente d\'Atlas : 3, 5 et 7 classes nettes, 9 classes admises (mesuré sur la dérivation)', async () => {
  const { divergenteEntre } = await import('../lib/charte/derivation.js');
  const pires = [1, 2, 3, 4].map((k) => V.ecartsVoisins(divergenteEntre(OKABE_ITO.vermillon, OKABE_ITO.bleu, ATLAS.graines, k)).pire);
  assert.deepEqual(pires, [39.9, 19.7, 12.4, 9.1]); assert.ok(pires[3] >= 6 && pires[3] < 10);
});

// ---------------------------------------------------------------------------------------------------------------- encre, états, traits
test('encre, états et traits d\'Atlas : texte à 17:1, états à plus de 4,5:1, sans donnée et sélection à plus de 3:1 ; aucun avertissement d\'attention', () => {
  const g = ATLAS.graines; assert.ok(C.contraste(g.encre, g.fond) > 17);
  for (const e of ['succes', 'alerte', 'erreur', 'information']) assert.ok(C.contraste(g[e], g.fond) >= 4.5, e);
  assert.ok(C.contraste(A.sansDonnee, g.fond) >= 3); assert.ok(C.contraste(A.selection, g.fond) >= 3);
  assert.ok(C.contraste(A.sansDonnee, A.sequentielles.principale[0]) > 2, 'distinct de la première classe');
});

test('charte « contraste-eleve » : encre noire, états à plus de 7:1, qualitative >= 4,5:1 et distincte, rampe dont la première classe atteint 3:1', () => {
  const g = ELEVE.graines; assert.equal(C.contraste(g.encre, g.fond), 21);
  for (const e of ['succes', 'alerte', 'erreur', 'information']) assert.ok(C.contraste(g[e], g.fond) >= 7, e);
  for (const c of E.qualitative) assert.ok(C.contraste(c, g.fond) >= 4.5, c);
  for (const k of [2, 3, 4, 5, 6, 7]) assert.ok(V.ecartsTousPairs(E.qualitative, k).pire >= 10, 'k=' + k);
  assert.ok(C.contraste(E.sequentielles.principale[0], g.fond) >= 3);
  assert.ok(C.contraste(E.sansDonnee, g.fond) >= 4.5); assert.ok(C.contraste(E.contour, g.fond) >= 7);
  assert.deepEqual(V.ecartsVoisins(C.echantillonner(E.sequentielles.principale, 5)).pire, 8.1);
  assert.ok(V.ecartsVoisins(E.divergente).pire >= 10);
});

test('chartes nommées : toutes les couleurs sont des #rrggbb, les rampes ont leurs bornes, les états ont des formes distinctes', () => {
  for (const c of [ATLAS, ELEVE]) {
    const toutes = JSON.stringify(c).match(/#[0-9a-fA-F]{3,8}\b/g); assert.ok(toutes.length > 40); for (const h of toutes) assert.match(h, HEX, c.nom);
    assert.equal(new Set(Object.values(c.marqueurs.formes)).size, 4, 'quatre formes distinctes'); assert.ok(Object.isFrozen(c) && Object.isFrozen(c.donnees.qualitative));
    assert.ok(c.donnees.sequentielles[c.donnees.sequentielleDefaut]);
  }
});
