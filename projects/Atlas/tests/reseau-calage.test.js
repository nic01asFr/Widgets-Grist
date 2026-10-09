import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { construireGraphe } from '../lib/reseau/graphe-routier.js';
import { tracer, caler, plusCourtChemin, concordance, DEFAUTS, METHODES, elaguer, sousLigne } from '../lib/reseau/calage.js';
import { hausdorff, frechet } from '../lib/reseau/geo.js';
import { metriques, f1Troncons, statistiques, partProche } from '../lib/reseau/mesures-trace.js';
import { lancer, DEGRADATIONS, rng } from '../tools/mesurer-calage.mjs';
import { reseau, troncon, ligne, ll } from './aide-reseau.js';

const cles = (r) => r.troncons.map((t) => t.cleabs).sort();
const graphe = (feats = reseau()) => construireGraphe(feats);
const proche = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} attendu ${b}, obtenu ${a}`);

describe('reseau/geo — Hausdorff et Fréchet', () => {
  it('deux lignes parallèles à 10 m, quel que soit le sens de la seconde', () => {
    const a = [[0, 0], [100, 0]];
    const b = [[0, 10], [100, 10]];
    proche(hausdorff([a], [b], 5), 10, 0.01);
    proche(frechet(a, b, 5), 10, 0.01);
    proche(frechet(a, b.slice().reverse(), 5), 10, 0.01, 'le sens de B est libre');
  });
});

describe('reseau/calage — calage HMM', () => {
  it('suit la route malgré un bruit de 6 m et la chaussée voisine à 20 m', () => {
    const g = graphe();
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
    const pts = [];
    for (let x = 10; x <= 490; x += 10) pts.push([x, 3 + 12 * rnd()]);
    const r = tracer(g, ligne(pts), 'hmm', { ref: { numero: 'D1' } });
    assert.ok(r.ok);
    assert.deepEqual(cles(r), ['M1', 'M2', 'M3', 'M4', 'M5']);
    assert.equal(r.composantes, 1);
    assert.equal(r.ruptures, 0);
  });

  it('le sens de la ligne est indifférent (même jeu de tronçons)', () => {
    const g = graphe();
    const pts = [[20, 1], [120, -1], [250, 1], [350, 0], [450, 1]];
    assert.deepEqual(cles(tracer(g, ligne(pts), 'hmm')), cles(tracer(g, ligne(pts.slice().reverse()), 'hmm')));
  });

  it('portion parcourue : une ligne qui couvre 60 % de M3 donne une abscisse de fin d’environ 90 m', () => {
    const r = tracer(graphe(), ligne([[150, 0], [240, 0]]), 'hmm', { elagage: 0 });
    const m3 = r.troncons.find((t) => t.cleabs === 'M3');
    assert.ok(m3);
    proche(m3.s0, 0, 1);
    proche(m3.s1, 90, 1.5);
    proche(m3.part, 0.6, 0.02);
  });

  it('faux positif de carrefour : l’impasse de 6 m et la queue de 2 m sur M4 sont écartées', () => {
    const r = tracer(graphe(), ligne([[30, 0], [150, 0], [302, 0]]), 'hmm');
    assert.ok(!cles(r).includes('S'));
    assert.ok(!cles(r).includes('M4'), 'M4 n’est parcouru que sur 2 m : élagué');
    assert.deepEqual(cles(r), ['M1', 'M2', 'M3']);
  });

  it('l’élagage est un réglage : sans lui, la queue de 2 m sur M4 est conservée', () => {
    assert.ok(cles(tracer(graphe(), ligne([[30, 0], [150, 0], [302, 0]]), 'hmm', { elagage: 0 })).includes('M4'));
    const p = [{ lo: 0, hi: 2 }, { lo: 0, hi: 90 }, { lo: 0, hi: 3 }];
    assert.equal(elaguer(p, 10).length, 1);
    assert.equal(elaguer([{ lo: 0, hi: 2 }], 10).length, 1, 'jamais vidé');
  });

  it('ligne décalée de 12 m : retrouve la route et non la chaussée voisine à 20 m', () => {
    const g = graphe();
    const decalee = [[20, 12], [120, 12], [250, 12], [350, 12], [450, 12]]; // à 12 m de M, à 8 m de P
    const r = tracer(g, ligne(decalee), 'hmm', { ref: { numero: 'D1' } });
    assert.deepEqual(cles(r), ['M1', 'M2', 'M3', 'M4', 'M5']);
  });

  it('ligne hors réseau (à plus de 30 m) : échec déclaré, aucun tracé inventé', () => {
    const r = tracer(graphe(), ligne([[0, 200], [200, 200]]), 'hmm');
    assert.equal(r.ok, false);
    assert.equal(r.troncons.length, 0);
    assert.equal(r.geometrie, null);
    assert.deepEqual(r.raisons, ['aucun_candidat']);
  });

  it('coupure du réseau : le calage se rompt au lieu de relier de force', () => {
    const sans = reseau().filter((f) => !['M3', 'P', 'C1', 'C2'].includes(f.properties.cleabs));
    const pts = [];
    for (let x = 20; x <= 480; x += 10) pts.push([x, 0]);
    const r = tracer(graphe(sans), ligne(pts), 'hmm');
    assert.ok(r.ruptures >= 1, `ruptures ${r.ruptures}`);
    assert.ok(r.composantes >= 2);
    assert.ok(!cles(r).includes('M3'));
  });

  it('limite connue : si la route manque et qu’une chaussée voisine à 20 m la double, le calage bascule dessus sans rupture', () => {
    const sans = reseau().filter((f) => f.properties.cleabs !== 'M3');
    const pts = [];
    for (let x = 20; x <= 480; x += 10) pts.push([x, 0]);
    const r = tracer(graphe(sans), ligne(pts), 'hmm');
    assert.ok(cles(r).includes('P'), `bascule sur la voisine : ${cles(r).join(',')}`);
    assert.ok(r.couvertureObs > 0.9);
  });

  it('...et la même ligne, route manquante ET voisine à plus de 30 m : rupture ou échec, pas de faux tracé', () => {
    const sans = reseau().filter((f) => !['M3', 'P'].includes(f.properties.cleabs));
    const pts = [];
    for (let x = 160; x <= 290; x += 10) pts.push([x, 0]);
    const r = tracer(graphe(sans), ligne(pts), 'hmm', { elagage: 0 });
    assert.ok(!cles(r).includes('M3'));
    assert.ok(r.couvertureObs < 0.5, `seules les extrémités ont un candidat : couverture ${r.couvertureObs}`);
  });

  it('deux lignes (MultiLineString) : un tracé par ligne', () => {
    const geo = { type: 'MultiLineString', coordinates: [[[10, 0], [90, 0]], [[310, 0], [390, 0]]].map((l) => l.map(ll)) };
    const r = tracer(graphe(), geo, 'hmm', { elagage: 0 });
    assert.equal(r.nbLignes, 2);
    assert.equal(r.composantes, 2);
    assert.deepEqual(cles(r), ['M1', 'M4']);
    assert.equal(r.geometrie.coordinates.length, 2);
  });

  it('la géométrie rendue est du GeoJSON WGS84 qui suit la ligne', () => {
    const r = tracer(graphe(), ligne([[150, 0], [240, 0]]), 'hmm', { elagage: 0 });
    assert.equal(r.geometrie.type, 'MultiLineString');
    const [lng, lat] = r.geometrie.coordinates[0][0];
    proche(lng, ll([150, 0])[0], 1e-6);
    proche(lat, ll([150, 0])[1], 1e-6);
  });
});

describe('reseau/calage — plus court chemin', () => {
  it('borné au numéro de route, même si la chaussée voisine est aussi courte', () => {
    const r = tracer(graphe(), ligne([[10, 10], [490, 10]]), 'pcc-ligne', { ref: { numero: 'D1' } });
    assert.deepEqual(cles(r), ['M1', 'M2', 'M3', 'M4', 'M5']);
    assert.equal(r.repli, null);
  });

  it('repli signalé quand aucun chemin ne respecte le numéro', () => {
    const r = tracer(graphe(), ligne([[150, 100], [150, -100]]), 'pcc-ligne', { ref: { numero: 'D1' } });
    assert.ok(r.ok);
    assert.equal(r.repli, 'hors_nom_numero');
    assert.deepEqual(cles(r), ['X1', 'X2']);
  });

  it('entre deux repères imposés (pcc-ext) : la géométrie n’est pas lue', () => {
    const r = tracer(graphe(), ligne([[0, 0], [1, 0]]), 'pcc-ext', { ref: { numero: 'D1' }, extremites: [ll([120, 0]), ll([320, 0])], elagage: 0 });
    assert.ok(r.ok);
    assert.deepEqual(cles(r), ['M2', 'M3', 'M4']);
    proche(r.troncons.reduce((a, t) => a + t.parcouru, 0), 200, 1);
    assert.throws(() => tracer(graphe(), ligne([[0, 0], [1, 0]]), 'pcc-ext', {}), /extremites/);
  });

  it('un point hors réseau est refusé, non accroché au loin', () => {
    const g = graphe();
    const r = plusCourtChemin(g, [0, 500], [100, 0]);
    assert.equal(r.ok, false);
    assert.equal(r.raison, 'extremite_hors_reseau');
  });

  it('extrémités sur deux morceaux séparés du réseau : « non connectées »', () => {
    const f = [troncon('A', [[0, 0], [100, 0]]), troncon('B', [[0, 500], [100, 500]])];
    const r = plusCourtChemin(graphe(f), [50, 1], [50, 501]);
    assert.equal(r.ok, false);
    assert.equal(r.raison, 'extremites_non_connectees');
  });

  describe('sens uniques', () => {
    // boucle de 100 m de côté ; E1 et E2 en sens direct vers l'est puis le nord, retour par R1 et R2 en double sens
    const sensUnique = () => [
      troncon('SUD', [[0, 0], [100, 0]], { sens_de_circulation: 'Sens direct' }),
      troncon('EST', [[100, 0], [100, 100]], { sens_de_circulation: 'Sens direct' }),
      troncon('NORD', [[0, 100], [100, 100]]), // double sens
      troncon('OUEST', [[0, 0], [0, 100]]), // double sens
    ];
    it('non orienté : le chemin le plus court remonte le sens unique', () => {
      const r = plusCourtChemin(graphe(sensUnique()), [100, 90], [100, 10]);
      assert.deepEqual(r.passages.map((p) => graphe(sensUnique()).aretes[p.arete].cleabs), ['EST']);
    });
    it('orienté : il fait le tour par les tronçons à double sens, et ne descend jamais EST', () => {
      const g = graphe(sensUnique());
      const r = plusCourtChemin(g, [100, 90], [100, 10], { oriente: true });
      assert.ok(r.ok);
      const parcourus = r.passages.map((p) => g.aretes[p.arete].cleabs);
      assert.ok(parcourus.includes('NORD') && parcourus.includes('OUEST') && parcourus.includes('SUD'), parcourus.join(','));
      for (const p of r.passages) {
        if (g.aretes[p.arete].cleabs === 'EST') assert.ok(p.s1 >= p.s0, `EST parcouru à rebours : ${p.s0} -> ${p.s1}`);
      }
      assert.ok(r.cout >= 280 && r.cout <= 340, `le tour complet (~320 m) : ${r.cout}`);
    });
    it('orienté : aller dans le sens autorisé coûte la distance directe', () => {
      const g = graphe(sensUnique());
      const r = plusCourtChemin(g, [100, 10], [100, 90], { oriente: true });
      assert.ok(r.ok);
      proche(r.cout, 80, 2);
    });
    it('orienté : aucun chemin si tout est à sens unique contraire', () => {
      const f = [troncon('U', [[0, 0], [100, 0]], { sens_de_circulation: 'Sens direct' })];
      assert.equal(plusCourtChemin(graphe(f), [90, 0], [10, 0], { oriente: true }).ok, false);
      assert.equal(plusCourtChemin(graphe(f), [10, 0], [90, 0], { oriente: true }).ok, true);
      assert.equal(plusCourtChemin(graphe(f), [90, 0], [10, 0]).ok, true, 'non orienté : possible');
    });
    it('orienté, sur un seul tronçon : le sens inverse est refusé aussi', () => {
      const f = [troncon('U', [[0, 0], [100, 0]], { sens_de_circulation: 'Sens inverse' })];
      assert.equal(plusCourtChemin(graphe(f), [10, 0], [90, 0], { oriente: true }).ok, false);
      assert.equal(plusCourtChemin(graphe(f), [90, 0], [10, 0], { oriente: true }).ok, true);
    });
  });
});

describe('reseau/calage — combinaison, préférence de route, validations', () => {
  it('hmm+pcc : mêmes tronçons que le calage sur un cas simple, sans éperon', () => {
    const g = graphe();
    const pts = [[20, 2], [120, -2], [200, 2], [290, 0], [350, 1], [450, 0]];
    assert.deepEqual(cles(tracer(g, ligne(pts), 'hmm')), cles(tracer(g, ligne(pts), 'hmm+pcc')));
  });

  it('préférence de nom ou de numéro : un tronçon qui contredit est pénalisé', () => {
    const g = graphe();
    const conc = concordance({ nom: 'Avenue des Tests' });
    assert.equal(conc(g.parCleabs.get('M1')), 'ok');
    assert.equal(conc(g.parCleabs.get('P')), 'ko');
    assert.equal(concordance({ numero: 'D1' })(g.parCleabs.get('P')), 'ko');
    assert.equal(concordance({})(g.parCleabs.get('P')), 'inconnu');
  });

  it('méthode inconnue : erreur ; graphe vide : échec déclaré', () => {
    assert.throws(() => tracer(graphe(), ligne([[0, 0], [10, 0]]), 'magique'), /méthode inconnue/);
    const r = tracer(construireGraphe([]), ligne([[0, 0], [10, 0]]), 'hmm');
    assert.equal(r.ok, false);
    assert.deepEqual(r.raisons, ['graphe_vide']);
    assert.deepEqual(METHODES, ['hmm', 'pcc-ligne', 'hmm+pcc', 'pcc-ext']);
  });

  it('les réglages par défaut sont ceux qui ont été mesurés', () => {
    assert.equal(DEFAUTS.rayon, 30);
    assert.equal(DEFAUTS.pas, 10);
    assert.equal(DEFAUTS.elagage, 10);
  });

  it('caler directement : passages ordonnés avec abscisses', () => {
    const g = graphe();
    const r = caler(g, ligne([[120, 0], [320, 0]]).coordinates.map(g.repere.vers));
    assert.ok(r.ok);
    assert.deepEqual(r.passages.map((p) => g.aretes[p.arete].cleabs), ['M2', 'M3', 'M4']);
  });

  it('sousLigne : un morceau de tronçon dans le sens demandé', () => {
    const g = graphe();
    const E = g.parCleabs.get('M1');
    const s = sousLigne(E, 80, 20);
    proche(s[0][0] - E.pts[0][0], 80, 0.01);
    proche(s[s.length - 1][0] - E.pts[0][0], 20, 0.01);
  });
});

describe('reseau/mesures-trace', () => {
  it('une ligne bien calée : rappel et précision de 1, Hausdorff et Fréchet quasi nuls', () => {
    const g = graphe();
    const geo = ligne([[20, 0], [120, 0], [250, 0]]);
    const r = tracer(g, geo, 'hmm', { elagage: 0 });
    const m = metriques(r, [geo.coordinates.map(g.repere.vers)]);
    assert.equal(m.echec, false);
    assert.ok(m.rappel15m > 0.99 && m.precision15m > 0.7);
    assert.ok(m.hausdorffM < 25, `${m.hausdorffM}`);
    assert.ok(m.frechetM < 25);
    assert.equal(m.nbLignes, 1);
  });

  it('un tracé vide est un échec', () => {
    const g = graphe();
    const geo = ligne([[0, 200], [200, 200]]);
    const m = metriques(tracer(g, geo, 'hmm'), [geo.coordinates.map(g.repere.vers)]);
    assert.equal(m.echec, true);
    assert.equal(m.rappel15m, 0);
  });

  it('F1 pondéré par la longueur : une portion juste vaut mieux qu’un tronçon entier à moitié faux', () => {
    const verite = [{ cleabs: 'A', s0: 0, s1: 50 }];
    const entier = f1Troncons(verite, [{ cleabs: 'A', s0: 0, s1: 100 }]);
    const portion = f1Troncons(verite, [{ cleabs: 'A', s0: 0, s1: 50 }]);
    assert.equal(portion.f1, 1);
    assert.ok(entier.precision === 0.5 && entier.rappel === 1);
    assert.equal(f1Troncons([], []).f1, 0);
  });

  it('statistiques et partProche', () => {
    assert.deepEqual(statistiques([]), { n: 0 });
    const s = statistiques([1, 2, 3, null, NaN, 4]);
    assert.equal(s.n, 4);
    assert.equal(s.max, 4);
    assert.equal(partProche([[[0, 0], [100, 0]]], [[[0, 5], [50, 5]]], 15, 5) > 0.4, true);
    assert.equal(partProche([], [], 15), null);
  });
});

describe('reseau/calage — mesure avec vérité synthétique (tronçons réels figés, hors réseau)', () => {
  const m = lancer();

  it('cinq voisinages réels, une vérité de 0,9 à 3 km chacun', () => {
    assert.equal(m.cas.filter((c) => c.retenu).length, 5);
    assert.ok(m.cas.every((c) => c.longueurM >= 500 && c.longueurM <= 3000));
  });

  it('bruit de 6 m et décalage de 12 m : le calage retrouve la vérité (F1 ≥ 0,95), jamais sans résultat', () => {
    for (const d of ['bruit 6 m', 'décalage 12 m']) {
      for (const meth of ['hmm', 'hmm+pcc']) {
        assert.ok(m.resume[d][meth].f1 >= 0.95, `${d} ${meth} ${m.resume[d][meth].f1}`);
        assert.equal(m.resume[d][meth].sansResultat, 0);
      }
    }
  });

  it('limite mesurée : une ligne décimée à 6 sommets sur une route sinueuse sort du rayon de 30 m, le calage en perd', () => {
    const hmm = m.resume['décimée (6 sommets)'].hmm.f1;
    const pcc = m.resume['décimée (6 sommets)']['pcc-ligne'].f1;
    assert.ok(hmm < 0.95, `${hmm}`);
    assert.ok(hmm > 0.6, `${hmm}`);
    assert.ok(pcc >= 0.95, 'le plus court chemin entre extrémités, lui, ne lit pas les sommets intermédiaires');
  });

  it('les dégradations sont reproductibles (même graine, même ligne)', () => {
    const ln = [[0, 0], [100, 0], [200, 50]];
    const a = DEGRADATIONS['bruit 6 m'](ln, rng(5));
    const b = DEGRADATIONS['bruit 6 m'](ln, rng(5));
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, DEGRADATIONS['bruit 6 m'](ln, rng(6)));
  });
});
