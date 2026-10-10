import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { construireGraphe } from '../lib/reseau/graphe-routier.js';
import { tracer, caler, DEFAUTS } from '../lib/reseau/calage.js';
import { lancerSensUniques, contreSensDuTrace } from '../tools/mesurer-calage.mjs';
import { troncon, ligne } from './aide-reseau.js';

const cles = (r) => r.troncons.map((t) => t.cleabs).sort();

/** Une rue à sens unique (vers l'est) à y=0 et une rue à double sens à y=14, reliées à leurs bouts. */
function rues() {
  return [
    troncon('OW1', [[0, 0], [100, 0]], { sens_de_circulation: 'Sens direct' }),
    troncon('OW2', [[100, 0], [200, 0]], { sens_de_circulation: 'Sens direct' }),
    troncon('DS1', [[0, 14], [100, 14]]),
    troncon('DS2', [[100, 14], [200, 14]]),
    troncon('LIEN0', [[0, 0], [0, 14]]),
    troncon('LIEN1', [[200, 0], [200, 14]]),
  ];
}
const versOuest = (y) => ligne([[190, y], [150, y], [100, y], [50, y], [10, y]]);
const versEst = (y) => ligne([[10, y], [50, y], [100, y], [150, y], [190, y]]);

describe('reseau/calage — sens uniques : option `orientee`', () => {
  it('sans l’option, une ligne qui remonte une rue à sens unique la suit (comportement inchangé)', () => {
    const r = tracer(construireGraphe(rues()), versOuest(3), 'hmm');
    assert.deepEqual(cles(r), ['OW1', 'OW2']);
    assert.equal(r.contreSens, 0, 'rien n’est compté sans l’option');
  });

  it('avec l’option, la ligne ordonnée vers l’ouest bascule sur la rue à double sens voisine (11 m)', () => {
    const r = tracer(construireGraphe(rues()), versOuest(3), 'hmm', { orientee: true });
    assert.deepEqual(cles(r), ['DS1', 'DS2']);
    assert.equal(r.contreSens, 0);
  });

  it('dans le sens autorisé, la rue à sens unique la plus proche est gardée', () => {
    const r = tracer(construireGraphe(rues()), versEst(3), 'hmm', { orientee: true });
    assert.deepEqual(cles(r), ['OW1', 'OW2']);
    assert.equal(r.contreSens, 0);
  });

  it('la pénalité est un réglage : très faible, la rue à sens unique est de nouveau remontée, et comptée', () => {
    const r = tracer(construireGraphe(rues()), versOuest(3), 'hmm', { orientee: true, penaliteContreSens: 0.1 });
    assert.deepEqual(cles(r), ['OW1', 'OW2']);
    assert.ok(r.contreSens > 10, `observations à contre-sens : ${r.contreSens}`);
    assert.equal(DEFAUTS.penaliteContreSens, 40);
  });

  it('sans alternative : le contre-sens reste possible mais déclaré ; interdit (Infinity), la ligne ne se suit plus (ruptures)', () => {
    const seule = rues().slice(0, 2);
    const r = tracer(construireGraphe(seule), versOuest(0), 'hmm', { orientee: true });
    assert.ok(r.ok);
    assert.ok(r.contreSens > 10);
    const interdit = tracer(construireGraphe(seule), versOuest(0), 'hmm', { orientee: true, penaliteContreSens: Infinity });
    assert.equal(interdit.contreSens, 0);
    assert.ok(interdit.ruptures >= 5, 'la ligne ne peut plus être suivie sans remonter le sens : ' + interdit.ruptures + ' ruptures');
  });

  it('les transitions sont orientées : le chemin entre deux états ne remonte pas un sens unique', () => {
    const g = construireGraphe(rues());
    const r = tracer(g, ligne([[190, 3], [100, 3], [100, 11], [10, 11]]), 'hmm', { orientee: true });
    assert.equal(contreSensDuTrace(g, r.passages).contre, 0);
  });

  it('hmm+pcc orienté : le lissage ne remonte pas non plus le sens unique', () => {
    const g = construireGraphe(rues());
    const r = tracer(g, versOuest(3), 'hmm+pcc', { orientee: true });
    assert.equal(contreSensDuTrace(g, r.passages).contre, 0);
    assert.deepEqual(cles(r), ['DS1', 'DS2']);
  });

  it('pcc-ligne : `orientee` est l’alias de `oriente`', () => {
    const g = construireGraphe(rues());
    const a = tracer(g, versOuest(3), 'pcc-ligne', { orientee: true });
    const b = tracer(g, versOuest(3), 'pcc-ligne', { oriente: true });
    assert.deepEqual(cles(a), cles(b));
    assert.equal(contreSensDuTrace(g, a.passages).contre, 0);
  });

  it('une rue à double sens ne change pas : avec ou sans option, même tracé', () => {
    const g = construireGraphe(rues().filter((f) => f.properties.cleabs.startsWith('DS') || f.properties.cleabs.startsWith('LIEN')));
    assert.deepEqual(cles(tracer(g, versOuest(13), 'hmm', { orientee: true })), cles(tracer(g, versOuest(13), 'hmm')));
  });

  describe('giratoire', () => {
    // anneau en losange, sens direct = antihoraire : (50,0) -> (0,50) -> (-50,0) -> (0,-50) -> (50,0)
    const N = [[50, 0], [0, 50], [-50, 0], [0, -50]];
    const anneau = () => N.map((p, i) => troncon(`R${i}`, [p, N[(i + 1) % 4]], { nature: 'Rond-point', sens_de_circulation: 'Sens direct' }));
    const tour = (sens) => {
      const ordre = sens > 0 ? [0, 1, 2, 3, 0] : [0, 3, 2, 1, 0];
      const pts = [];
      for (let i = 0; i < 4; i++) {
        const a = N[ordre[i]];
        const b = N[ordre[i + 1]];
        for (let t = 0; t < 1; t += 0.2) pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
      return ligne(pts);
    };
    it('dans le sens du giratoire : aucun contre-sens', () => {
      const r = tracer(construireGraphe(anneau()), tour(1), 'hmm', { orientee: true });
      assert.ok(r.ok);
      assert.equal(r.contreSens, 0);
      assert.equal(r.troncons.length, 4);
    });
    it('à l’envers : le contre-sens est déclaré, ou interdit (ruptures)', () => {
      const g = construireGraphe(anneau());
      const r = tracer(g, tour(-1), 'hmm', { orientee: true });
      assert.ok(r.contreSens > 5, `contre-sens ${r.contreSens}`);
      const interdit = tracer(g, tour(-1), 'hmm', { orientee: true, penaliteContreSens: Infinity });
      assert.equal(interdit.contreSens, 0);
      assert.ok(interdit.ruptures >= 5, 'ruptures ' + interdit.ruptures);
      assert.equal(tracer(g, tour(-1), 'hmm').contreSens, 0, 'sans l’option, on ne regarde pas');
    });
  });
});

describe('reseau/calage — sens uniques réels (tronçons de la BD TOPO figés)', () => {
  const fx = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/reseau/troncons-mesure.json', import.meta.url)), 'utf8'));
  const g = construireGraphe(fx.cas['urbain-1']);
  const e = g.aretes.filter((a) => (a.sens === 'direct' || a.sens === 'inverse') && a.L > 60 && g.noeuds[a.a].inc.length > 1 && g.noeuds[a.b].inc.length > 1)[0];
  const dansLeSens = e.sens === 'direct' ? e.pts : e.pts.slice().reverse();
  const enWgs = (pts) => ({ type: 'LineString', coordinates: pts.map((p) => g.repere.depuis(p[0], p[1])) });

  it('le jeu contient des sens uniques réels', () => {
    assert.ok(e, 'un tronçon à sens unique');
    assert.ok(g.aretes.filter((a) => a.sens === 'direct' || a.sens === 'inverse').length >= 5);
  });

  it('ligne posée sur le tronçon, dans le sens de circulation : retenu, aucun contre-sens', () => {
    const r = tracer(g, enWgs(dansLeSens), 'hmm', { orientee: true, elagage: 0 });
    assert.ok(r.troncons.some((t) => t.cleabs === e.cleabs));
    assert.equal(r.contreSens, 0);
  });

  it('même ligne à l’envers : jamais remontée sans signalement ; sans l’option, remontée', () => {
    const envers = enWgs(dansLeSens.slice().reverse());
    const r = tracer(g, envers, 'hmm', { orientee: true, elagage: 0 });
    assert.ok(contreSensDuTrace(g, r.passages).contre === 0 || r.contreSens > 0);
    const sans = tracer(g, envers, 'hmm', { elagage: 0 });
    assert.ok(sans.troncons.some((t) => t.cleabs === e.cleabs));
  });

  it('banc « sens uniques » : l’option ne dégrade pas le F1 et ne produit pas plus de contre-sens', () => {
    const m = lancerSensUniques({ graines: [1] });
    for (const methode of ['hmm', 'hmm+pcc', 'pcc-ligne']) {
      const sans = m.resume['sens de la marche'][methode];
      const avec = m.resume['sens de la marche'][`${methode} orientée`];
      assert.ok(avec.f1 >= sans.f1 - 0.02, `${methode} : ${avec.f1} contre ${sans.f1}`);
      assert.ok(avec.partContreSens <= sans.partContreSens + 0.005, `${methode} contre-sens ${avec.partContreSens} / ${sans.partContreSens}`);
    }
  });
});

describe('reseau/calage — sans `orientee`, rien ne change', () => {
  it('le tracé de référence et le compteur', () => {
    const g = construireGraphe(rues());
    assert.deepEqual(cles(tracer(g, versEst(3), 'hmm')), ['OW1', 'OW2']);
    assert.equal(caler(g, versEst(3).coordinates.map(g.repere.vers)).contreSens, 0);
  });
});
