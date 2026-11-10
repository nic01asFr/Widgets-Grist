'use strict';
// Tests de lib/q2g-palettes.js : palettes par defaut issues de la charte du theme (niveau A).
// La derivation d'Atlas (projects/Atlas/lib/charte/derivation.js) est chargee en LECTURE SEULE par import dynamique.
// node --test projects/qgis2grist/tests/q2g-palettes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const P = require('../lib/q2g-palettes.js');

const ATLAS_DERIVATION = path.join(__dirname, '..', '..', 'Atlas', 'lib', 'charte', 'derivation.js');
const ATLAS_DEFAUTS = path.join(__dirname, '..', '..', 'Atlas', 'lib', 'charte', 'defauts.js');

const ORIGINE = ['#3e5de7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#f97316'];
const HEX = /^#[0-9a-f]{6}$/;
const CHARTE = { version: 'atlas-charte/0.1', nom: 'Mon theme', graines: { principal: '#0b6e4f', secondaire: '#f4a259', encre: '#1b1b1b', fond: '#fdfaf3' } };
const CHARTE_SOMBRE = { version: 'atlas-charte/0.1', nom: 'Sombre', graines: { principal: '#7aa2ff', secondaire: '#ffb86b', encre: '#f2f2f2', fond: '#14181f' } };
const CHARTE_INSTANCE = { version: 'atlas-charte/0.1', nom: 'Instance Grist', graines: { principal: '#16b378', fond: '#ffffff', encre: '#262633' } };

let atlas = null;
test.before(async () => {
  try {
    const d = await import(pathToFileURL(ATLAS_DERIVATION).href);
    const f = await import(pathToFileURL(ATLAS_DEFAUTS).href);
    atlas = { deriverDonnees: d.deriverDonnees, candidates: [...f.QUALITATIVE_ATLAS] };
  } catch (_) { atlas = null; }
});

const avec = (charte, deps) => { const p = P.create(deps); p.definirCharte(charte); return p; };

// ---------------------------------------------------------------- repli d'origine

test('sans theme : le repli d\'origine, liste historique, prefixe stable', () => {
  const p = P.create();
  assert.equal(p.source(), 'origine');
  assert.deepEqual(p.palette('qualitative', 7), ORIGINE);
  for (let n = 1; n <= 7; n++) assert.deepEqual(p.palette('qualitative', n), ORIGINE.slice(0, n));
  assert.deepEqual(P.PALETTE_ORIGINE, ORIGINE);
  assert.ok(Object.isFrozen(P.PALETTE_ORIGINE));
});

test('sans theme : couleurCyclique rend exactement LAYER_COLORS, PALETTE et les listes de 5', () => {
  const p = P.create();
  for (let i = 0; i < 30; i++) {
    assert.equal(p.couleurCyclique(i), ORIGINE[i % 7]);
    assert.equal(p.couleurCyclique(i, 6), ORIGINE.slice(0, 6)[i % 6]);
    assert.equal(p.couleurCyclique(i, 5), ORIGINE.slice(0, 5)[i % 5]);
  }
});

test('sans theme : rampes derivees de la couleur d\'action d\'origine, divergente bleu-orange d\'Atlas', () => {
  const p = P.create();
  const s = p.palette('sequentielle', 5);
  assert.equal(s.length, 5);
  assert.equal(s[2], '#3e5de7');
  assert.equal(p.palette('divergente', 7)[3], '#efefef');
});

test('definirCharte(null) ou charte inexploitable : retour au repli d\'origine', () => {
  const p = avec(CHARTE);
  assert.equal(p.source(), 'theme');
  assert.notDeepEqual(p.palette('qualitative', 7), ORIGINE);
  for (const mauvaise of [null, undefined, {}, { graines: {} }, { graines: { principal: 'rouge' } }, { graines: { principal: 'url(x)' } }, 'texte', 5, []]) {
    assert.equal(p.definirCharte(mauvaise), false);
    assert.equal(p.source(), 'origine');
    assert.deepEqual(p.palette('qualitative', 7), ORIGINE);
  }
});

// ---------------------------------------------------------------- theme actif, repli local

test('theme actif sans derivation injectee : qualitative derivee de la graine principale', () => {
  const p = avec(CHARTE);
  assert.deepEqual(p.etat(), { source: 'theme', derivation: 'locale' });
  const q = p.palette('qualitative', 7);
  assert.equal(q.length, 7);
  q.forEach((c) => assert.match(c, HEX));
  assert.equal(q[0], '#0b6e4f', 'la graine principale ouvre la palette');
  assert.equal(new Set(q).size, 7);
  assert.notDeepEqual(q, ORIGINE);
});

test('repli local : contraste minimal de 3:1 sur le fond clair, pour chaque couleur', () => {
  for (const charte of [CHARTE, CHARTE_INSTANCE]) {
    const p = avec(charte);
    const fond = charte.graines.fond;
    p.palette('qualitative', 12).forEach((c) => assert.ok(P.contraste(c, fond) >= 3 - 0.01, c + ' sur ' + fond + ' : ' + P.contraste(c, fond).toFixed(2)));
  }
});

test('repli local : contraste minimal de 3:1 aussi sur un fond sombre', () => {
  const p = avec(CHARTE_SOMBRE);
  p.palette('qualitative', 8).forEach((c) => assert.ok(P.contraste(c, '#14181f') >= 3 - 0.01, c));
});

test('repli local : ecart de teinte d\'au moins 28 degres entre categories chromatiques', () => {
  const q = avec(CHARTE).palette('qualitative', 12);
  for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) {
    const e = P.ecartTeinte(q[i], q[j]);
    if (e !== null) assert.ok(e >= 28, q[i] + ' / ' + q[j] + ' : ' + e.toFixed(1));
  }
});

test('sequentielle : n couleurs, extremites pres du fond puis de l\'encre, clarte monotone', () => {
  const p = avec(CHARTE);
  for (const n of [2, 3, 5, 9, 24]) {
    const s = p.palette('sequentielle', n);
    assert.equal(s.length, n);
    s.forEach((c) => assert.match(c, HEX));
    const lum = s.map((c) => P.contraste(c, '#000000'));
    for (let i = 1; i < lum.length; i++) assert.ok(lum[i] <= lum[i - 1] + 1e-9, 'rampe non monotone a ' + i + ' pour n=' + n);
  }
  assert.ok(P.contraste(p.palette('sequentielle', 9)[0], '#fdfaf3') < 1.5, 'le ton faible est proche du fond');
  assert.equal(p.palette('sequentielle', 1).length, 1);
});

test('divergente : longueur impaire <= n, neutre au centre, deux poles de teintes distinctes', () => {
  const p = avec(CHARTE);
  for (const n of [3, 5, 7, 9]) {
    const d = p.palette('divergente', n);
    assert.equal(d.length, n);
    const centre = d[(n - 1) / 2];
    assert.ok(P.contraste(centre, '#fdfaf3') < 1.3, 'le centre est neutre (proche du fond)');
    const e = P.ecartTeinte(d[0], d[n - 1]);
    assert.ok(e === null || e >= 28, 'poles confondus');
  }
  assert.equal(p.palette('divergente', 4).length, 3);
  assert.equal(p.palette('divergente', 6).length, 5);
  assert.equal(p.palette('divergente', 2).length, 2);
  assert.equal(p.palette('divergente', 1).length, 1);
});

test('charte sans secondaire (instance Grist) : divergente bleu-orange d\'Atlas conservee, qualitative derivee', () => {
  const p = avec(CHARTE_INSTANCE);
  const d = p.palette('divergente', 7);
  assert.equal(d[0], '#b15104');
  assert.equal(d[6], '#0072b2');
  assert.equal(p.palette('qualitative', 7)[0], p.palette('qualitative', 1)[0]);
  assert.ok(P.contraste(p.palette('qualitative', 1)[0], '#ffffff') >= 3 - 0.01);
});

test('charte avec section donnees explicite : reprise telle quelle (qualitative, sequentielle par defaut, divergente)', () => {
  const charte = {
    graines: CHARTE.graines,
    donnees: {
      qualitative: ['#111111', '#222222', '#333333'],
      sequentielles: { a: ['#ffffff', '#000000'], b: ['#ff0000', '#00ff00', '#0000ff'] },
      sequentielleDefaut: 'b',
      divergente: ['#ff0000', '#ffffff', '#0000ff'],
    },
  };
  const p = avec(charte);
  assert.deepEqual(p.palette('sequentielle', 3), ['#ff0000', '#00ff00', '#0000ff']);
  assert.equal(p.palette('sequentielle', 5).length, 5);
  assert.deepEqual(p.palette('divergente', 3), ['#ff0000', '#ffffff', '#0000ff']);
  const q = p.palette('qualitative', 7);
  assert.deepEqual(q.slice(0, 3), ['#111111', '#222222', '#333333']);
  assert.equal(q.length, 7, 'completee jusqu\'a 7 categories distinctes');
});

test('graines invalides ignorees : jamais de valeur CSS arbitraire en sortie', () => {
  const p = avec({ graines: { principal: '#0b6e4f', secondaire: 'url(javascript:1)', encre: 'red', fond: '#fff; x', succes: 'expression(1)' } });
  for (const t of ['qualitative', 'sequentielle', 'divergente']) p.palette(t, 7).forEach((c) => assert.match(c, HEX));
  Object.values(p.tonsEtat()).forEach((e) => assert.match(e.couleur, HEX));
  assert.match(p.couleurAutres(), HEX);
});

// ---------------------------------------------------------------- derivation injectee (Atlas)

test('derivation d\'Atlas injectee : sa qualitative, sa sequentielle et sa divergente sont rendues telles quelles', (t) => {
  if (!atlas) return t.skip('derivation d\'Atlas non chargeable');
  const p = avec(CHARTE, { deriver: atlas.deriverDonnees, candidates: atlas.candidates });
  assert.deepEqual(p.etat(), { source: 'theme', derivation: 'injectee' });
  const g = CHARTE.graines;
  const ref = atlas.deriverDonnees(g, { candidates: atlas.candidates, nQualitative: 8, nSequentielle: 5, kDivergente: 2 });
  assert.deepEqual(p.palette('qualitative', 7), ref.qualitative.slice(0, 7));
  assert.deepEqual(p.palette('sequentielle', 5), ref.sequentielles.principale);
  assert.deepEqual(p.palette('divergente', 5), ref.divergente);
  assert.equal(p.couleurAutres(), ref.sansDonnee);
});

test('derivation d\'Atlas : au moins 7 categories, contraste d\'au moins 2:1 pour les couleurs ajoutees au-dela des graines', (t) => {
  if (!atlas) return t.skip('derivation d\'Atlas non chargeable');
  for (const charte of [CHARTE, CHARTE_SOMBRE, CHARTE_INSTANCE]) {
    const p = avec(charte, { deriver: atlas.deriverDonnees, candidates: atlas.candidates });
    const q = p.palette('qualitative', 7);
    assert.equal(q.length, 7);
    assert.equal(new Set(q).size, 7);
    q.slice(2).forEach((c) => assert.ok(P.contraste(c, charte.graines.fond) >= 2 - 0.01, c));
  }
});

test('derivation injectee qui leve une erreur ou rend une forme inexploitable : repli local, identique au repli sans injection', () => {
  const local = avec(CHARTE);
  for (const mauvais of [() => { throw new Error('indisponible'); }, () => null, () => 'x', () => ({ qualitative: 'non', sequentielles: 3, divergente: [1] })]) {
    const p = avec(CHARTE, { deriver: mauvais });
    for (const t of ['qualitative', 'sequentielle', 'divergente']) assert.deepEqual(p.palette(t, 7), local.palette(t, 7), t);
    assert.equal(p.couleurAutres(), local.couleurAutres());
    assert.match(p.etat().derivation, /^locale/);
  }
  const leve = avec(CHARTE, { deriver: () => { throw new Error('x'); } });
  assert.equal(leve.etat().derivation, 'injectee', 'rien n a encore ete derive');
  leve.palette('qualitative', 3);
  assert.equal(leve.etat().derivation, 'locale-par-repli');
});

test('definirDeriveur : remplace la derivation et vide le cache', () => {
  const p = avec(CHARTE);
  const avant = p.palette('qualitative', 3);
  p.definirDeriveur(() => ({ qualitative: ['#010101', '#020202', '#030303', '#040404', '#050505', '#060606', '#070707'], sansDonnee: '#999999' }));
  assert.deepEqual(p.palette('qualitative', 3), ['#010101', '#020202', '#030303']);
  assert.equal(p.couleurAutres(), '#999999');
  p.definirDeriveur(null);
  assert.deepEqual(p.palette('qualitative', 3), avant);
});

// ---------------------------------------------------------------- bornes

test('bornes de n : jamais plus de n, [] pour n invalide, plafond a 24', () => {
  const p = avec(CHARTE);
  const q0 = P.create();
  for (const pal of [p, q0]) {
    for (const t of ['qualitative', 'sequentielle', 'divergente']) {
      for (const n of [0, -1, NaN, Infinity, -Infinity, null, undefined, 'x', '', {}, [], true]) assert.deepEqual(pal.palette(t, n), [], t + ' n=' + String(n));
      for (let n = 1; n <= 24; n++) assert.ok(pal.palette(t, n).length <= n && pal.palette(t, n).length >= 1, t + ' n=' + n);
      assert.ok(pal.palette(t, 25).length <= 24);
      assert.ok(pal.palette(t, 1000).length <= 24);
      assert.ok(pal.palette(t, 3.9).length <= 3);
    }
    assert.equal(pal.palette('sequentielle', 24).length, 24);
    assert.equal(pal.palette('sequentielle', '5').length, 5);
  }
});

test('type inconnu : []; les noms du schema d\'Atlas (sequential, divergent) sont admis', () => {
  const p = avec(CHARTE);
  for (const t of ['', 'autre', null, undefined, 3, 'QUALITATIVE', '__proto__']) assert.deepEqual(p.palette(t, 5), []);
  assert.deepEqual(p.palette('sequential', 5), p.palette('sequentielle', 5));
  assert.deepEqual(p.palette('divergent', 5), p.palette('divergente', 5));
});

// ---------------------------------------------------------------- stabilite

test('stabilite : meme entree, meme sortie, entre appels, instances et prefixes', () => {
  const a = avec(CHARTE), b = avec(CHARTE), c = avec(CHARTE, { deriver: atlas ? atlas.deriverDonnees : null });
  for (const t of ['qualitative', 'sequentielle', 'divergente']) {
    for (const n of [1, 2, 5, 7, 12, 24]) {
      assert.deepEqual(a.palette(t, n), a.palette(t, n));
      assert.deepEqual(a.palette(t, n), b.palette(t, n));
      if (atlas) assert.deepEqual(c.palette(t, n), c.palette(t, n));
    }
  }
  // Prefixe stable : changer n ne recolore pas les premieres categories
  for (const pal of [a, c, P.create()]) {
    const g = pal.palette('qualitative', 7);
    for (let n = 1; n <= 7; n++) assert.deepEqual(pal.palette('qualitative', n), g.slice(0, n));
  }
});

test('stabilite : modifier le tableau rendu ne change pas l\'appel suivant', () => {
  const p = avec(CHARTE);
  const premier = p.palette('qualitative', 5);
  const copie = premier.slice();
  premier[0] = '#000000'; premier.push('#ffffff');
  assert.deepEqual(p.palette('qualitative', 5), copie);
  const o = P.create();
  o.palette('qualitative', 3)[0] = '#000000';
  assert.deepEqual(o.palette('qualitative', 3), ORIGINE.slice(0, 3));
  assert.ok(Object.isFrozen(P.PALETTE_ORIGINE));
});

test('stabilite : relire la meme charte redonne la meme palette; une autre charte la change', () => {
  const p = avec(CHARTE);
  const q1 = p.palette('qualitative', 7);
  p.definirCharte(CHARTE_SOMBRE);
  const q2 = p.palette('qualitative', 7);
  assert.notDeepEqual(q1, q2);
  p.definirCharte(JSON.parse(JSON.stringify(CHARTE)));
  assert.deepEqual(p.palette('qualitative', 7), q1);
});

// ---------------------------------------------------------------- regroupement en autres

test('couleurPour : jusqu\'a 7 categories, une couleur chacune, deja prises dans la palette', () => {
  for (const p of [P.create(), avec(CHARTE), avec(CHARTE, { deriver: atlas ? atlas.deriverDonnees : null })]) {
    for (let n = 1; n <= 7; n++) {
      const pal = p.palette('qualitative', n);
      for (let i = 0; i < n; i++) assert.equal(p.couleurPour(i, n), pal[i]);
    }
  }
});

test('couleurPour : au-dela de 7 categories distinctes, le reste est regroupe en autres (couleur neutre)', () => {
  for (const p of [P.create(), avec(CHARTE), avec(CHARTE_SOMBRE)]) {
    const autres = p.couleurAutres();
    assert.match(autres, HEX);
    const q = p.palette('qualitative', 7);
    assert.ok(!q.includes(autres), 'autres ne reprend aucune couleur de la palette');
    for (const n of [8, 12, 100]) {
      const vues = new Set();
      for (let i = 0; i < n; i++) {
        const c = p.couleurPour(i, n);
        if (i < 7) assert.equal(c, q[i]); else assert.equal(c, autres);
        vues.add(c);
      }
      assert.equal(vues.size, 8, 'sept couleurs distinctes plus autres');
    }
    assert.equal(p.couleurPour(-1, 5), autres);
    assert.equal(p.couleurPour(5, 5), autres);
    assert.equal(p.couleurPour(0.5, 5), autres);
    assert.equal(p.couleurPour(NaN, 5), autres);
    assert.equal(p.couleurPour(0, 0), autres);
    assert.equal(p.couleurPour(0, NaN), autres);
  }
  assert.deepEqual(P.create().regroupement(10), { distinctes: 7, autres: 3 });
  assert.deepEqual(P.create().regroupement(4), { distinctes: 4, autres: 0 });
  assert.deepEqual(P.create().regroupement(-3), { distinctes: 0, autres: 0 });
});

test('autres : un gris lisible sur le fond (3:1) avec un theme, #808080 sans theme', () => {
  assert.equal(P.create().couleurAutres(), '#808080');
  const p = avec(CHARTE);
  assert.ok(P.contraste(p.couleurAutres(), CHARTE.graines.fond) >= 3);
  assert.ok(P.ecartTeinte(p.couleurAutres(), '#0b6e4f') === null, 'neutre : pas de teinte');
});

// ---------------------------------------------------------------- tons d'etat

test('tons d\'etat : cinq tons, formes distinctes, 4,5:1 sur le fond, jamais la couleur seule', () => {
  for (const [charte, fond] of [[null, '#ffffff'], [CHARTE, '#fdfaf3'], [CHARTE_SOMBRE, '#14181f']]) {
    const p = avec(charte);
    const e = p.tonsEtat();
    assert.deepEqual(Object.keys(e), ['ok', 'attention', 'alerte', 'info', 'neutre']);
    Object.values(e).forEach((t) => {
      assert.match(t.couleur, HEX);
      assert.ok(P.contraste(t.couleur, fond) >= 4.5 - 0.01, t.couleur + ' sur ' + fond);
      assert.ok(t.forme && t.libelle);
    });
    assert.equal(new Set(Object.values(e).map((t) => t.forme)).size, 5);
    assert.equal(new Set(Object.values(e).map((t) => t.couleur)).size, 5);
  }
});

test('tons d\'etat : separes des palettes de donnees (independants de la graine principale, absents des palettes)', () => {
  const nu = P.create().tonsEtat();
  const autre = { graines: { principal: '#d63384', secondaire: '#0dcaf0', encre: '#1b1b1b', fond: '#ffffff' } };
  const a = avec({ graines: { principal: '#0b6e4f', secondaire: '#f4a259', encre: '#1b1b1b', fond: '#ffffff' } });
  const b = avec(autre);
  assert.deepEqual(a.tonsEtat(), nu, 'un theme ne recolore pas les etats');
  assert.deepEqual(b.tonsEtat(), a.tonsEtat());
  const couleursEtat = Object.values(nu).map((t) => t.couleur);
  for (const p of [P.create(), a, b, avec(autre, { deriver: atlas ? atlas.deriverDonnees : null })]) {
    for (const t of ['qualitative', 'sequentielle', 'divergente']) {
      p.palette(t, 24).forEach((c) => assert.ok(!couleursEtat.includes(c), 'un ton d\'etat figure dans la palette ' + t + ' : ' + c));
    }
  }
  // Changer la palette de donnees (derivation injectee) ne touche pas aux etats
  a.definirDeriveur(() => ({ qualitative: couleursEtat.concat(['#010101', '#020202']), sansDonnee: '#999999' }));
  assert.deepEqual(a.tonsEtat(), nu);
});

test('tons d\'etat : les graines d\'etat de la charte les remplacent, ramenees a 4,5:1', () => {
  const p = avec({ graines: Object.assign({ succes: '#007a33', erreur: '#ffcc00' }, CHARTE.graines, { fond: '#ffffff' }) });
  const e = p.tonsEtat();
  assert.equal(e.ok.couleur, '#007a33');
  assert.ok(P.contraste(e.alerte.couleur, '#ffffff') >= 4.5 - 0.01, 'jaune clair assombri');
  assert.equal(e.info.couleur, P.TONS_ETAT_DEFAUT.info.couleur);
  assert.equal(p.tonsEtat('#000000').neutre.couleur !== e.neutre.couleur, true, 'le fond passe en argument est respecte');
  assert.ok(P.contraste(p.tonsEtat('#000000').neutre.couleur, '#000000') >= 4.5 - 0.01);
});

// ---------------------------------------------------------------- module

test('module : instance partagee, constantes gelees, pas d\'acces global', () => {
  assert.equal(typeof P.create, 'function');
  assert.equal(typeof P.palette, 'function');
  assert.equal(P.MAX_DISTINCTES, 7);
  assert.equal(P.N_MAX, 24);
  assert.ok(Object.isFrozen(P.TONS_ETAT_DEFAUT));
  assert.deepEqual(P.palette('qualitative', 7), ORIGINE);
  assert.equal(P.source(), 'origine');
  const brut = require('node:fs').readFileSync(path.join(__dirname, '..', 'lib', 'q2g-palettes.js'), 'utf8');
  assert.ok(!/\b(document|window|fetch|localStorage|Date\.now|Math\.random)\b/.test(brut.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'module pur');
});
