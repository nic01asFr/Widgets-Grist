import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { construireCas, evaluer, f1Compte, METHODES } from '../tools/verite-routage.mjs';
import { tirage, degrader, ecartMoyen } from '../tools/degradations-trace.mjs';
import { rng } from '../tools/mesurer-calage.mjs';
import { mesurer, agreger, niveauEcart, departementsDeTest } from '../tools/mesurer-verite-routage.mjs';
import { echantillonner, longueur } from '../lib/reseau/geo.js';

// Extrait de la vérité de routage : cinq trajets du service d'itinéraire de la Géoplateforme (bdtopo-pgr) et le réseau BD TOPO de
// leur couloir. C'est la sortie d'un moteur de routage, PAS un relevé terrain : voir tools/verite-routage.mjs.
const F = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/reseau/routage-extrait.json', import.meta.url)), 'utf8'));
const cas = F.cas.map(construireCas);
const proche = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} attendu ${b}, obtenu ${a}`);

describe('verité de routage — construction d’un cas', () => {
  it('les cinq trajets sont exploitables (au moins 90 % de la distance sur des tronçons connus du graphe)', () => {
    assert.equal(cas.length, 5);
    for (const c of cas) {
      assert.ok(c, 'cas construit');
      assert.ok(c.couverture >= 0.9, `${c.id} couverture ${c.couverture}`);
      assert.ok(c.verite.length >= 5);
    }
  });

  it('la vérité est une suite de portions de tronçons : leurs longueurs recouvrent la distance du trajet à 10 % près', () => {
    for (const c of cas) {
      const L = c.verite.reduce((a, p) => a + (p.s1 - p.s0), 0);
      assert.ok(Math.abs(L / c.distanceM - 1) < 0.1, `${c.id} : portions ${Math.round(L)} m, trajet ${Math.round(c.distanceM)} m`);
    }
  });

  it('la ligne de départ est la géométrie BD TOPO des tronçons du trajet (même longueur à 10 % près)', () => {
    for (const c of cas) assert.ok(Math.abs(longueur(c.ligne) / c.distanceM - 1) < 0.1, `${c.id} : ${Math.round(longueur(c.ligne))} / ${Math.round(c.distanceM)}`);
  });

  it('contextes : densité exclusive et étiquettes', () => {
    const par = Object.fromEntries(cas.map((c) => [c.id, c.contexte]));
    assert.equal(par['dense-33-bordeaux-5'].densite, 'urbain dense');
    assert.ok(par['dense-33-bordeaux-5'].tags.includes('giratoire') && par['dense-33-bordeaux-5'].tags.includes('sens uniques'));
    assert.equal(par['rural-24-dordogne-1'].densite, 'rural');
    assert.ok(par['rural-88-vosges-0'].tags.includes('sinueux'));
    assert.ok(par['dense-67-strasbourg-3'].tags.includes('échangeur'));
    assert.ok(par['dense-67-strasbourg-3'].tags.includes('chaussées séparées'));
  });

  it('le contrôle de la vérité : la ligne parfaite redonne la vérité (F1 ≥ 0,95 en longueur, sur les cinq cas)', () => {
    for (const c of cas) {
      const e = evaluer(c, c.ligne, { methode: 'hmm' });
      assert.ok(e.longueur.f1 >= 0.95, `${c.id} F1 ${e.longueur.f1}`);
    }
  });

  it('précision en nombre : un tronçon est juste s’il recouvre la moitié de sa propre portion', () => {
    const v = [{ cleabs: 'A', s0: 0, s1: 100 }, { cleabs: 'B', s0: 0, s1: 50 }];
    const r = f1Compte(v, [{ cleabs: 'A', s0: 0, s1: 100 }, { cleabs: 'B', s0: 30, s1: 50 }, { cleabs: 'C', s0: 0, s1: 10 }]);
    assert.equal(r.justes, 2);
    proche(r.precision, 2 / 3, 1e-9);
    proche(r.rappel, 0.5, 1e-9);
  });
});

describe('verité de routage — modèle de dégradation', () => {
  const ln = echantillonner([[0, 0], [400, 0], [400, 300]], 5);

  it('reproductible : mêmes graines, même ligne ; autres graines, autre ligne', () => {
    const a = degrader(ln, tirage(rng(3)), rng(3));
    const b = degrader(ln, tirage(rng(3)), rng(3));
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, degrader(ln, tirage(rng(4)), rng(4)));
  });

  it('tirage : bruit de 3 à 15 m, corrélation de 30 à 80 m', () => {
    for (let k = 0; k < 50; k++) {
      const p = tirage(rng(k));
      assert.ok(p.sigma >= 3 && p.sigma <= 15 && p.correlation >= 30 && p.correlation <= 80);
      assert.ok(p.derive >= 0 && p.derive <= 15 && p.decalage >= 0 && p.decalage <= 10);
    }
  });

  it('bruit corrélé : deux points voisins se trompent dans le même sens (autocorrélation forte), contrairement à un bruit blanc', () => {
    const p = { sigma: 8, correlation: 60, decalage: 0, derive: 0, lissage: 0, espacement: 0 };
    const d = degrader(ln, p, rng(11));
    const eps = d.map((q, i) => q[1] - echantillonner(ln, 5)[i][1]).slice(0, 70); // sur le premier tronçon droit, l'erreur en y
    const m = eps.reduce((a, b) => a + b, 0) / eps.length;
    let num = 0;
    let den = 0;
    for (let i = 1; i < eps.length; i++) { num += (eps[i] - m) * (eps[i - 1] - m); den += (eps[i] - m) ** 2; }
    assert.ok(num / den > 0.5, `autocorrélation au pas : ${num / den}`);
  });

  it('décalage systématique : tous les points sont déplacés du même vecteur (sans bruit)', () => {
    const p = { sigma: 0, correlation: 50, decalage: 8, derive: 0, lissage: 0, espacement: 0 };
    const d = degrader(ln, p, rng(5));
    const o = echantillonner(ln, 5);
    const dx = d.map((q, i) => q[0] - o[i][0]);
    assert.ok(Math.max(...dx) - Math.min(...dx) < 1e-6);
    proche(Math.hypot(d[10][0] - o[10][0], d[10][1] - o[10][1]), 8, 1e-6);
  });

  it('dérive : l’écart croît jusqu’à la valeur demandée en fin de ligne', () => {
    const p = { sigma: 0, correlation: 50, decalage: 0, derive: 12, lissage: 0, espacement: 0 };
    const d = degrader(ln, p, rng(5));
    const o = echantillonner(ln, 5);
    const e = (i) => Math.hypot(d[i][0] - o[i][0], d[i][1] - o[i][1]);
    assert.ok(e(0) < 0.01);
    proche(e(d.length - 1), 12, 0.5);
    assert.ok(e(Math.floor(d.length / 2)) > 4 && e(Math.floor(d.length / 2)) < 8);
  });

  it('décimation : un sommet tous les `espacement` m, extrémités gardées ; lissage : les coins sont coupés', () => {
    const dec = degrader(ln, { sigma: 0, correlation: 50, decalage: 0, derive: 0, lissage: 0, espacement: 150 }, rng(1));
    assert.equal(dec.length, Math.round(700 / 150) + 1);
    assert.deepEqual(dec[0].map(Math.round), [0, 0]);
    assert.deepEqual(dec[dec.length - 1].map(Math.round), [400, 300]);
    const lisse = degrader(ln, { sigma: 0, correlation: 50, decalage: 0, derive: 0, lissage: 60, espacement: 0 }, rng(1));
    const coin = lisse.reduce((m, q) => Math.min(m, Math.hypot(q[0] - 400, q[1] - 0)), Infinity);
    assert.ok(coin > 5, `le coin (400, 0) est coupé : le point le plus proche est à ${coin} m`);
  });

  it('écart moyen : croît avec la sévérité', () => {
    const faible = ecartMoyen(degrader(ln, { sigma: 3, correlation: 40, decalage: 0, derive: 0, lissage: 0, espacement: 0 }, rng(2)), ln);
    const fort = ecartMoyen(degrader(ln, { sigma: 15, correlation: 40, decalage: 8, derive: 10, lissage: 0, espacement: 0 }, rng(2)), ln);
    assert.ok(fort > 2 * faible, `${faible} < ${fort}`);
    assert.equal(niveauEcart(3), 'écart < 5 m');
    assert.equal(niveauEcart(7), 'écart 5-10 m');
    assert.equal(niveauEcart(12), 'écart ≥ 10 m');
  });
});

describe('verité de routage — mesure par méthode et par contexte (extrait)', () => {
  const m = mesurer(cas, { degradations: 3, graine: 7 });
  const parMethode = agreger(m.lignes, () => ['tous']).tous;

  it('cinq méthodes, 5 trajets × 3 dégradations chacune', () => {
    assert.equal(METHODES.length, 5);
    for (const [nom] of METHODES) assert.equal(parMethode[nom].essais, 15, nom);
  });

  it('le calage retrouve l’essentiel d’un trajet dégradé', () => {
    assert.ok(parMethode.hmm.f1L >= 0.8, `hmm ${parMethode.hmm.f1L}`);
    assert.ok(parMethode['mixte (hmm+pcc)'].f1L >= 0.8);
    // pcc-ligne n'est pas comparé ici : sur ces cinq trajets (surtout hors ville) la vérité est un plus court chemin, qu'il retrouve par construction
    assert.ok(parMethode['pcc-ligne'].essais === 15);
  });

  it('l’option orientée n’en dégrade pas le résultat (le trajet de vérité respecte les sens uniques)', () => {
    assert.ok(parMethode['hmm orientée'].f1L >= parMethode.hmm.f1L - 0.03);
    assert.ok(parMethode['mixte orientée'].f1L >= parMethode['mixte (hmm+pcc)'].f1L - 0.03);
  });

  it('chaque tronçon retenu produit un échantillon étiqueté (caractéristiques, juste ou faux)', () => {
    assert.ok(m.echantillons.length > 300);
    assert.ok(m.echantillons.every((e) => e.x.length === 12 && (e.juste === 0 || e.juste === 1)));
    const part = m.echantillons.reduce((a, e) => a + e.juste, 0) / m.echantillons.length;
    assert.ok(part > 0.6 && part < 1);
  });

  it('les départements de test sont fixés une fois pour toutes, un sur trois', () => {
    const t = departementsDeTest(['07', '15', '24', '32', '35', '44']);
    assert.deepEqual([...t].sort(), ['24', '44']);
  });
});
