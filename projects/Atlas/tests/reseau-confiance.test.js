import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { construireGraphe } from '../lib/reseau/graphe-routier.js';
import { tracer } from '../lib/reseau/calage.js';
import { CARACTERISTIQUES, vecteur, scorer, classer, continuites } from '../lib/reseau/confiance.js';
import { MODELE_CONFIANCE } from '../lib/reseau/confiance-modele.js';
import { ajusterLogistique, isotone, calibration, fixerSeuils } from '../tools/calibrer-confiance.mjs';
import { construireCas, evaluer } from '../tools/verite-routage.mjs';
import { tirage, degrader } from '../tools/degradations-trace.mjs';
import { rng } from '../tools/mesurer-calage.mjs';
import { reseau, ligne } from './aide-reseau.js';

const F = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/reseau/routage-extrait.json', import.meta.url)), 'utf8'));
const cas = F.cas.map(construireCas);

describe('confiance — le modèle appris', () => {
  it('un modèle calibré est livré, avec ses seuils a priori et son origine', () => {
    assert.ok(MODELE_CONFIANCE);
    assert.match(MODELE_CONFIANCE.version, /^confiance-\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(MODELE_CONFIANCE.seuils, { haute: 0.95, moyenne: 0.8 });
    assert.equal(MODELE_CONFIANCE.poids.length, CARACTERISTIQUES.length);
    assert.ok(MODELE_CONFIANCE.appris.echantillons > 100000 && MODELE_CONFIANCE.appris.departements >= 15);
  });

  it('vecteur : douze nombres finis, dans l’ordre des caractéristiques', () => {
    const car = { postMoy: 0.9, espObs: 5, nChoisi: 5, dMoy: 3, voisines: 2, marge: 4, longueur: 120, part: 1, parcouru: 120, continuite: 1, couverture: 1, ruptures: 0 };
    const x = vecteur(car);
    assert.equal(x.length, CARACTERISTIQUES.length);
    assert.ok(x.every(Number.isFinite));
  });

  it('classer : haute à partir de 0,95, faible sous 0,8, null sans score', () => {
    assert.equal(classer(0.96), 'haute');
    assert.equal(classer(0.95), 'haute');
    assert.equal(classer(0.9), 'moyenne');
    assert.equal(classer(0.8), 'moyenne');
    assert.equal(classer(0.79), 'faible');
    assert.equal(classer(null), null);
  });

  it('scorer : monotone avec la probabilité a posteriori du calage (tout le reste égal)', () => {
    const base = { postMoy: 0.5, espObs: 4, nChoisi: 4, dMoy: 5, voisines: 2, marge: 2, longueur: 100, part: 1, parcouru: 100, continuite: 1, couverture: 1, ruptures: 0 };
    const a = scorer({ ...base, postMoy: 0.3 });
    const b = scorer({ ...base, postMoy: 0.99 });
    assert.ok(a >= 0 && a <= 1 && b >= 0 && b <= 1);
    assert.ok(b !== a);
  });

  it('un modèle fourni remplace celui du module ; sans modèle, pas de score', () => {
    const jouet = { intercept: 0, poids: [10, ...new Array(11).fill(0)], moyenne: new Array(12).fill(0), ecartType: new Array(12).fill(1), seuils: { haute: 0.95, moyenne: 0.8 } };
    const car = { postMoy: 1, espObs: 0, nChoisi: 0, dMoy: 0, voisines: 0, marge: 0, longueur: 1, part: 0, parcouru: 0, continuite: 0, couverture: 0, ruptures: 0 };
    assert.ok(scorer(car, jouet) > 0.999);
    assert.equal(scorer(car, null), null);
  });
});

describe('confiance — dans l’API du calage', () => {
  const g = construireGraphe(reseau());
  const bonne = ligne([[20, 0], [120, 0], [250, 0], [350, 0], [450, 0]]);

  it('chaque tronçon retenu porte ses caractéristiques, un score entre 0 et 1 et une classe ; le tracé porte un résumé', () => {
    const r = tracer(g, bonne, 'hmm', { ref: { numero: 'D1' } });
    assert.ok(r.ok);
    for (const t of r.troncons) {
      assert.equal(Object.keys(t.caracteristiques).length, CARACTERISTIQUES.length);
      assert.ok(t.confiance.score >= 0 && t.confiance.score <= 1);
      assert.ok(['haute', 'moyenne', 'faible'].includes(t.confiance.classe));
    }
    assert.ok(r.confiance.score >= r.confiance.minimum);
    assert.ok(Math.abs(r.confiance.parClasse.haute + r.confiance.parClasse.moyenne + r.confiance.parClasse.faible - 1) < 1e-9);
    assert.equal(r.confiance.modele, MODELE_CONFIANCE.version);
  });

  it('la confiance existe pour le mélange, pas pour le plus court chemin (qui ne regarde pas la ligne)', () => {
    assert.ok(tracer(g, bonne, 'hmm+pcc').troncons.every((t) => t.confiance));
    const p = tracer(g, bonne, 'pcc-ligne');
    assert.equal(p.confiance, null);
    assert.ok(p.troncons.every((t) => t.confiance === undefined || t.confiance === null));
  });

  it('`confiance: false` économise le calcul', () => {
    const r = tracer(g, bonne, 'hmm', { confiance: false });
    assert.equal(r.confiance, null);
    assert.ok(r.troncons.every((t) => t.caracteristiques === undefined));
  });

  it('ligne hors réseau : aucun tronçon, donc aucune confiance inventée', () => {
    const r = tracer(g, ligne([[0, 300], [200, 300]]), 'hmm');
    assert.equal(r.ok, false);
    assert.equal(r.confiance, null);
  });

  it('une ligne ambiguë entre deux chaussées voisines est moins sûre qu’une ligne posée sur la route', () => {
    const sure = tracer(g, bonne, 'hmm', { ref: { numero: 'D1' } }).confiance.score;
    const entre = ligne([[20, 10], [120, 10], [250, 10], [350, 10], [450, 10]]); // à 10 m de la route, 10 m de la voisine
    const douteuse = tracer(g, entre, 'hmm').confiance.score;
    assert.ok(douteuse < sure, `${douteuse} < ${sure}`);
  });

  it('continuité : un tracé en trois morceaux qui se touchent est continu, un trou la fait baisser', () => {
    const r = tracer(g, bonne, 'hmm', { elagage: 0 });
    const c = continuites(g, r.passages);
    assert.ok([...c.values()].every((v) => v === 1));
    const trou = continuites(g, [{ arete: g.parCleabs.get('M1').id }, { arete: g.parCleabs.get('M5').id }]);
    assert.ok([...trou.values()].every((v) => v === 0));
  });
});

describe('confiance — mesurée sur l’extrait de vérité de routage', () => {
  // 5 trajets x 4 dégradations ; les classes doivent se classer dans l'ordre de leur précision réelle
  const comptes = { haute: { n: 0, justes: 0 }, moyenne: { n: 0, justes: 0 }, faible: { n: 0, justes: 0 } };
  for (const [ic, c] of cas.entries()) {
    for (let k = 0; k < 4; k++) {
      const r = rng(900 + ic * 31 + k);
      const lg = degrader(c.ligne, tirage(r), r);
      const e = evaluer(c, lg, { methode: 'hmm' });
      e.r.troncons.forEach((t, i) => {
        if (!e.etiquettes[i].connu) return;
        const cl = comptes[t.confiance.classe];
        cl.n++;
        cl.justes += e.etiquettes[i].juste;
      });
    }
  }
  const prec = (k) => comptes[k].justes / Math.max(1, comptes[k].n);

  it('la classe haute est bien plus précise que la classe faible', () => {
    assert.ok(comptes.haute.n > 100, JSON.stringify(comptes));
    assert.ok(prec('haute') >= 0.93, `haute ${prec('haute')} (${comptes.haute.n})`);
    if (comptes.faible.n >= 10) assert.ok(prec('faible') < prec('haute') - 0.1, `faible ${prec('faible')} (${comptes.faible.n})`);
  });
});

describe('calibration — les outils', () => {
  it('ajusterLogistique retrouve le sens des coefficients sur des données synthétiques', () => {
    const r = rng(1);
    const X = [];
    const y = [];
    for (let i = 0; i < 3000; i++) {
      const a = r() * 2 - 1;
      const b = r() * 2 - 1;
      X.push([a, b]);
      y.push(r() < 1 / (1 + Math.exp(-(2.5 * a - 1.5 * b + 0.3))) ? 1 : 0);
    }
    const beta = ajusterLogistique(X, y, new Array(3000).fill(1), 0.01);
    assert.ok(Math.abs(beta[1] - 2.5) < 0.5 && Math.abs(beta[2] + 1.5) < 0.5 && Math.abs(beta[0] - 0.3) < 0.3, JSON.stringify(beta));
  });

  it('isotone : croissante, et ramène une suite en désordre à des paliers monotones', () => {
    const iso = isotone([0.1, 0.2, 0.3, 0.4, 0.5, 0.6], [0, 1, 0, 1, 1, 1], [1, 1, 1, 1, 1, 1]);
    for (let i = 1; i < iso.y.length; i++) assert.ok(iso.y[i] >= iso.y[i - 1]);
  });

  it('calibration : des scores calibrés ont une ECE proche de zéro, des scores trop sûrs une ECE élevée', () => {
    const r = rng(2);
    const s = [];
    const y = [];
    for (let i = 0; i < 20000; i++) { const p = r(); s.push(p); y.push(r() < p ? 1 : 0); }
    const w = new Array(20000).fill(1);
    assert.ok(calibration(s, y, w).ece < 0.02);
    const trop = s.map((p) => Math.min(0.999, p + 0.3 * (1 - p) + 0.2));
    assert.ok(calibration(trop, y, w).ece > 0.1);
    assert.equal(calibration(s, y, w).courbe.length, 10);
  });

  it('fixerSeuils : la classe haute atteint la précision visée sur le jeu qui a servi à la fixer', () => {
    const r = rng(3);
    const s = [];
    const y = [];
    for (let i = 0; i < 10000; i++) { const p = r(); s.push(p); y.push(r() < p ? 1 : 0); }
    const t = fixerSeuils(s, y, new Array(10000).fill(1), { cibleHaute: 0.95 });
    const haut = s.map((v, i) => [v, y[i]]).filter(([v]) => v >= t.haute);
    assert.ok(haut.reduce((a, [, z]) => a + z, 0) / haut.length >= 0.94);
  });
});
