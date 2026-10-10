// Dérivation depuis les graines : déterminisme, valeurs de référence, propriétés des rampes.
// node --test tests/charte-derivation.test.js   (aucun accès réseau, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as D from '../lib/charte/derivation.js';
import * as C from '../lib/charte/couleurs.js';
import { CHARTE_ATLAS, QUALITATIVE_ATLAS, OKABE_ITO } from '../lib/charte/defauts.js';
import { planMonochrome as planBi } from '../lib/bi/fond-plan.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(join(ICI, 'fixtures/charte/derivation-reference.json'), 'utf8'));
const GRAINES_ATLAS = { principal: CHARTE_ATLAS.graines.principal, secondaire: CHARTE_ATLAS.graines.secondaire, encre: CHARTE_ATLAS.graines.encre, fond: CHARTE_ATLAS.graines.fond };
const HEX = /^#[0-9a-f]{6}$/;

// ---------------------------------------------------------------------------------------------------------------- valeurs de référence
test('référence : la dérivation des graines d\'exemple reproduit chaque hexadécimal publié (neutre et sombre)', () => {
  for (const nom of ['neutre', 'sombre']) {
    const r = REF[nom], g = r.graines;
    const obtenu = { graines: g, ...D.deriverDonnees(g, { candidates: QUALITATIVE_ATLAS }), plan: D.planDepuis({ principal: g.principal, fond: g.fond, encre: g.encre }) };
    const { commentaire, ...attendu } = { ...r }; void commentaire;
    assert.deepEqual(obtenu, attendu, nom);
  }
});

test('référence : la charte « atlas » est ce que ses règles calculent depuis l\'accent, l\'encre et le fond de l\'interface', () => {
  const A = CHARTE_ATLAS.donnees, g = GRAINES_ATLAS;
  assert.deepEqual(D.sequentielleDepuis(g, 9), A.sequentielles.principale);
  assert.deepEqual(D.divergenteEntre(OKABE_ITO.vermillon, OKABE_ITO.bleu, g, 3), A.divergente);
  assert.equal(D.sansDonneeDepuis(g), A.sansDonnee);
  const t = D.traitsDepuis(g); assert.equal(t.selection, A.selection); assert.equal(t.halo, A.halo); assert.equal(t.survol, A.survol); assert.equal(t.contour, A.contour);
  assert.equal(C.normaliserCouleur(g.principal), g.principal);
});

test('déterminisme : mêmes graines, mêmes valeurs, à l\'appel suivant et sur des graines équivalentes', () => {
  const a = D.deriverDonnees(GRAINES_ATLAS, { candidates: QUALITATIVE_ATLAS });
  assert.deepEqual(D.deriverDonnees(GRAINES_ATLAS, { candidates: QUALITATIVE_ATLAS }), a);
  assert.deepEqual(D.deriverDonnees({ ...GRAINES_ATLAS }, { candidates: [...QUALITATIVE_ATLAS] }), a);
});

// ---------------------------------------------------------------------------------------------------------------- chemin Lab
test('chemin Lab : extrémités exactes, pas réguliers en L*, monotone, sous-échantillonnage cohérent', () => {
  const a = ['#f8e9e7', '#c44536', '#692e23'];
  const r = D.cheminLab(a, 9); assert.equal(r[0], a[0]); assert.equal(r[8], a[2]);
  const L = r.map(C.clarte); const pas = L.slice(1).map((x, i) => L[i] - x);
  assert.ok(pas.every((p) => p > 0)); assert.ok(Math.max(...pas) - Math.min(...pas) < 1.0, 'pas : ' + pas.map((p) => p.toFixed(2)));
  assert.deepEqual(D.cheminLab(a, 5), [r[0], r[2], r[4], r[6], r[8]]);
  r.forEach((c) => assert.match(c, HEX));
});

test('chemin Lab : croissant ou décroissant, refuse un retour en arrière et une rampe sans clarté', () => {
  const sombreVersClair = D.cheminLab(['#12161c', '#4e8ec1', '#abd1ee'], 5); assert.ok(sombreVersClair.map(C.clarte).every((x, i, t) => i === 0 || x > t[i - 1]));
  assert.throws(() => D.cheminLab(['#ffffff', '#222222', '#dddddd'], 4), /strictement monotones/);
  assert.throws(() => D.cheminLab(['#777777', '#777777'], 4), /même clarté/);
  assert.throws(() => D.cheminLab(['#292574'], 4), /deux ancres/);
});

// ---------------------------------------------------------------------------------------------------------------- séquentielle
test('séquentielle dérivée : une teinte, du clair au foncé, ordre conservé en daltonisme et en gris, pas de gris réguliers', () => {
  const g = GRAINES_ATLAS, hue = C.teinte(g.principal);
  for (const n of [3, 5, 7, 9]) {
    const r = D.sequentielleDepuis(g, n); assert.equal(r.length, n); r.forEach((c) => assert.match(c, HEX));
    for (const mode of [(c) => c, ...C.TYPES_DALTONISME.map((t) => (c) => C.simulerDaltonisme(c, t))]) { const L = r.map((c) => C.clarte(mode(c))); assert.ok(L.every((x, i) => i === 0 || x < L[i - 1]), n + ' ' + L.map((x) => x.toFixed(1))); }
    const gris = r.map((c) => C.luminance(c)); assert.ok(gris.every((x, i) => i === 0 || x < gris[i - 1]));
    if (n >= 5) for (const c of r.slice(1, -1)) { const d = Math.abs(C.teinte(c) - hue); assert.ok(Math.min(d, 360 - d) < 14, 'teinte ' + c + ' : ' + C.teinte(c).toFixed(1) + ' contre ' + hue.toFixed(1)); }
  }
  const L9 = D.sequentielleDepuis(g, 9).map(C.clarte), pas = L9.slice(1).map((x, i) => L9[i] - x); assert.ok(Math.min(...pas) >= 7, 'plus petit pas de L* : ' + Math.min(...pas));
});

test('séquentielle dérivée : sur fond sombre, la rampe va du fond vers le clair (le sens suit l\'encre)', () => {
  const g = REF.sombre.graines, r = D.sequentielleDepuis(g, 9), L = r.map(C.clarte);
  assert.ok(L.every((x, i) => i === 0 || x > L[i - 1]), L.map((x) => x.toFixed(1)).join(' ')); assert.ok(C.contraste(r[0], g.fond) < 1.4); assert.ok(C.contraste(r[8], g.fond) > 7);
});

test('séquentielle dérivée : fond et encre de même clarté ne donnent pas de rampe ; une graine confondue avec le fond donne une rampe de gris', () => {
  const gris = D.sequentielleDepuis({ principal: '#ffffff', fond: '#ffffff', encre: '#222222' });
  assert.equal(gris.length, 9); assert.ok(gris.every((c) => C.chroma(c) < 2)); assert.equal(gris[0], '#ffffff');
  assert.equal(D.sequentielleDepuis({ principal: '#336699', fond: '#777777', encre: '#777777' }), null);
  assert.equal(D.sequentielleDepuis({ principal: '#222222', fond: '#ffffff', encre: '#222222' }).length, 9, 'principal = encre : le mélange vers l\'encre est écarté, la rampe existe');
});

// ---------------------------------------------------------------------------------------------------------------- divergente
test('divergente dérivée : 2k+1 couleurs, neutre au centre, extrêmes à la même clarté, pas égaux de chaque côté', () => {
  const g = GRAINES_ATLAS;
  for (const k of [1, 2, 3, 4]) {
    const d = D.divergenteEntre(OKABE_ITO.vermillon, OKABE_ITO.bleu, g, k), n = 2 * k + 1; assert.equal(d.length, n); d.forEach((c) => assert.match(c, HEX));
    assert.equal(d[k], D.neutreDepuis(g));
    assert.ok(Math.abs(C.clarte(d[0]) - C.clarte(d[n - 1])) < 0.5, 'extrêmes k=' + k);
    const L = d.map(C.clarte); for (let i = 1; i <= k; i++) assert.ok(L[i] > L[i - 1] && L[n - 1 - i] > L[n - i], 'clarté croissante vers le centre');
    for (let i = 0; i < k; i++) assert.ok(Math.abs(L[i] - L[n - 1 - i]) < 0.6, 'miroir ' + i);
  }
});

test('divergente dérivée : la teinte de chaque pôle est conservée, rouge-vert refusé par la mesure (pas par la règle)', () => {
  const d = D.divergenteEntre(OKABE_ITO.vermillon, OKABE_ITO.bleu, GRAINES_ATLAS, 3);
  assert.ok(C.teinte(d[1]) > 30 && C.teinte(d[1]) < 80, 'côté orange'); assert.ok(C.teinte(d[5]) > 250 && C.teinte(d[5]) < 300, 'côté bleu');
  // un pôle qui ne se détache pas du neutre ne donne pas de divergente
  assert.equal(D.divergenteEntre('#f0f0f0', '#0072b2', GRAINES_ATLAS, 3), null);
});

test('divergente dérivée : le côté le plus pâle est prolongé vers l\'encre pour égaler le poids de l\'autre', () => {
  const g = GRAINES_ATLAS, d = D.divergenteEntre('#ffa040', '#00306a', g, 3);
  assert.ok(Math.abs(C.clarte(d[0]) - C.clarte(d[6])) < 0.5);
  assert.ok(C.clarte(d[0]) < C.clarte('#ffa040') - 10, 'l\'extrême orange est plus sombre que la graine orange');
});

// ---------------------------------------------------------------------------------------------------------------- qualitative
test('qualitative dérivée : principal puis secondaire, puis des candidates distinctes de tout ce qui précède (CIEDE2000 >= 10 au pire cas)', () => {
  const g = REF.neutre.graines, q = D.qualitativeDepuis(g, QUALITATIVE_ATLAS, 8);
  assert.equal(q[0], g.principal); assert.equal(q[1], g.secondaire);
  for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) assert.ok(D.ecartPireCas(q[i], q[j]) >= D.ECART_QUALITATIVE, q[i] + ' ' + q[j]);
  assert.ok(q.length >= 5);
  assert.deepEqual(D.qualitativeDepuis({ principal: '#336699' }, [], 8), ['#336699']);
  assert.equal(D.qualitativeDepuis(g, QUALITATIVE_ATLAS, 3).length, 3);
});

test('qualitative dérivée : une candidate invisible sur le fond est écartée (noir sur fond sombre, jaune sur blanc)', () => {
  const sombre = D.qualitativeDepuis(REF.sombre.graines, QUALITATIVE_ATLAS, 8), clair = D.qualitativeDepuis(REF.neutre.graines, QUALITATIVE_ATLAS, 8);
  assert.ok(!sombre.includes('#000000')); assert.ok(!clair.includes(OKABE_ITO.jaune));
  for (const c of sombre.slice(2)) assert.ok(C.contraste(c, REF.sombre.graines.fond) >= D.CONTRASTE_QUALITATIVE);
});

// ---------------------------------------------------------------------------------------------------------------- traits, plan
test('sans donnée : un gris à 3,2:1 du fond au moins, jamais la couleur d\'une classe ; traits : sélection = encre, halo = fond', () => {
  for (const g of [REF.neutre.graines, REF.sombre.graines, GRAINES_ATLAS]) {
    const s = D.sansDonneeDepuis(g); assert.ok(C.contraste(s, g.fond) >= 3.2); assert.ok(C.chroma(s) < 6, 'neutre');
    const t = D.traitsDepuis(g); assert.equal(t.selection, g.encre); assert.equal(t.halo, g.fond); assert.equal(t.contour, g.fond); assert.ok(C.contraste(t.survol, g.fond) >= 3);
  }
});

test('plan : monochrome depuis la couleur principale, intensités fixes, texte à l\'encre — identique à celui du composant BI', () => {
  const p = D.planMonochrome('#292574', { fond: '#FFFFFF', encre: '#26312B' });
  assert.deepEqual(p, planBi('#292574', { fond: '#FFFFFF', encre: '#26312B' }));
  assert.equal(p.texte, '#26312B'); assert.equal(p.eau, C.melanger('#FFFFFF', '#292574', 0.3)); assert.equal(p.vert, C.melanger('#FFFFFF', '#292574', 0.07)); assert.equal(p.route, '#FFFFFF');
  assert.ok(C.contraste(p.limite, p.fond) >= 3, 'limite indigo : ' + C.contraste(p.limite, p.fond));
  assert.ok(C.contraste(p.texte, p.fond) >= 4.5 && C.contraste(p.texte2, p.fond) >= 4.5);
  assert.deepEqual(D.INTENSITES_PLAN, { vert: 0.07, bati: 0.13, eau: 0.30, filet: 0.38, limite: 0.60 });
});

test('plan d\'une charte : végétation colorée à intensité fixe, jetons explicites par-dessus, intensités réglables', () => {
  const base = { principal: '#2e4e54', fond: '#ffffff', encre: '#1f1b14' };
  assert.equal(D.planDepuis(base).vert, C.melanger('#ffffff', '#2e4e54', 0.07));
  assert.equal(D.planDepuis({ ...base, vegetation: '#4f8a4b' }).vert, C.melanger('#ffffff', '#4f8a4b', D.INTENSITE_VEGETATION));
  assert.equal(D.planDepuis({ ...base, vegetation: 'monochrome' }).vert, C.melanger('#ffffff', '#2e4e54', 0.07));
  assert.equal(D.planDepuis({ ...base, plan: { eau: '#cfe0ea' } }).eau, '#cfe0ea');
  assert.equal(D.planDepuis({ ...base, intensites: { limite: 0.9 } }).limite, C.melanger('#ffffff', '#2e4e54', 0.9));
});
