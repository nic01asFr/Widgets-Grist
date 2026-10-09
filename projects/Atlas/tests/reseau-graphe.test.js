import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  construireGraphe, composantesConnexes, estRoutier, normaliserNom, sensDe, sensAutorises, voiesParSens,
} from '../lib/reseau/graphe-routier.js';
import { reseau, troncon, ll } from './aide-reseau.js';

const reels = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/reseau/troncons-reels-p02.json', import.meta.url)), 'utf8')).features;
const proche = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} attendu ${b}, obtenu ${a}`);

describe('reseau/graphe-routier — structure', () => {
  it('une arête par tronçon, des nœuds aux extrémités partagées', () => {
    const g = construireGraphe(reseau());
    assert.equal(g.aretes.length, 11);
    proche(g.parCleabs.get('M2').L, 50, 0.1);
    const carrefour = g.noeuds.find((n) => n.inc.length === 4); // M2, M3, X1, X2
    assert.ok(carrefour, 'carrefour à quatre branches');
    assert.deepEqual(carrefour.inc.map((i) => g.aretes[i].cleabs).sort(), ['M2', 'M3', 'X1', 'X2']);
    assert.equal(g.noeuds.length, 11); // 5+1 le long de y=0, 2 bouts de X, 1 de S, 2 de P
  });

  it('les croisements sans extrémité commune ne sont PAS des carrefours (pont au-dessus d’une route)', () => {
    const g = construireGraphe([
      troncon('SOL', [[0, 0], [200, 0]]),
      troncon('PONT', [[100, -80], [100, 80]], { position_par_rapport_au_sol: '1' }),
    ]);
    assert.equal(g.noeuds.length, 4);
    assert.ok(g.noeuds.every((n) => n.inc.length === 1));
    assert.equal(composantesConnexes(g).length, 2);
    assert.equal(g.parCleabs.get('PONT').niveau, 1);
    assert.equal(g.parCleabs.get('SOL').niveau, null);
  });

  it('attributs : sens, voies, importance, vitesse (moyenne), numéro, noms normalisés', () => {
    const g = construireGraphe(reels);
    const d537 = [...g.aretes].find((e) => e.nums.has('D537'));
    assert.ok(d537);
    assert.equal(d537.sens, 'double');
    assert.equal(d537.nombreDeVoies, 2);
    assert.equal(typeof d537.importance, 'number');
    assert.equal(d537.nature, 'Route à 1 chaussée');
    const pont = g.aretes.find((e) => e.niveau === 1);
    assert.ok(pont, 'un tronçon en pont dans l’extrait réel');
    const chemin = g.aretes.find((e) => e.nature === 'Chemin');
    assert.equal(chemin.nombreDeVoies, null, 'une valeur absente reste absente, jamais inventée');
  });

  it('composantes connexes : triées de la plus grande à la plus petite', () => {
    const sans = reseau().filter((f) => !['M3', 'P', 'C1', 'C2'].includes(f.properties.cleabs));
    const comp = composantesConnexes(construireGraphe(sans));
    assert.ok(comp.length >= 2);
    assert.ok(comp[0].length >= comp[comp.length - 1].length);
  });
});

describe('reseau/graphe-routier — ce qui est écarté, et dit', () => {
  it('sentiers, escaliers, pistes cyclables, accès impossibles et projets sont écartés (sauf option `tous`)', () => {
    const f = [
      troncon('OK', [[0, 0], [10, 0]]),
      troncon('S1', [[10, 0], [20, 0]], { nature: 'Sentier' }),
      troncon('E1', [[20, 0], [30, 0]], { nature: 'Escalier' }),
      troncon('V1', [[30, 0], [40, 0]], { nature: 'Piste cyclable' }),
      troncon('I1', [[40, 0], [50, 0]], { acces_vehicule_leger: 'Physiquement impossible' }),
      troncon('P1', [[50, 0], [60, 0]], { etat_de_l_objet: 'Projet' }),
    ];
    const g = construireGraphe(f);
    assert.equal(g.aretes.length, 1);
    assert.equal(g.ignores.nonRoutiers, 5);
    assert.equal(construireGraphe(f, { tous: true }).aretes.length, 6);
    assert.equal(estRoutier(f[0]), true);
    assert.equal(estRoutier(f[1]), false);
  });

  it('sans géométrie, point seul ou ligne dégénérée : comptés, pas de plantage', () => {
    const f = [
      { type: 'Feature', properties: { cleabs: 'A' }, geometry: null },
      { type: 'Feature', properties: { cleabs: 'B' }, geometry: { type: 'Point', coordinates: [3, 46] } },
      { type: 'Feature', properties: { cleabs: 'C' }, geometry: { type: 'LineString', coordinates: [ll([0, 0]), ll([0, 0])] } },
      { type: 'Feature', properties: { cleabs: 'D' }, geometry: { type: 'MultiLineString', coordinates: [[ll([0, 0]), ll([50, 0])], [ll([0, 10]), ll([50, 10])]] } },
    ];
    const g = construireGraphe(f);
    assert.equal(g.aretes.length, 1);
    assert.equal(g.aretes[0].cleabs, 'D');
    assert.deepEqual(g.ignores, { nonRoutiers: 0, sansGeometrie: 2, tropCourts: 1, lignesEcartees: 1 });
    const vide = construireGraphe([]);
    assert.equal(vide.aretes.length, 0);
    assert.equal(vide.repere, null);
    assert.equal(construireGraphe(null).aretes.length, 0);
  });

  it('positions en 3D (altitude) : réduites à deux dimensions', () => {
    const g = construireGraphe([{ type: 'Feature', properties: { cleabs: 'Z' }, geometry: { type: 'LineString', coordinates: [[3, 46.5, 120.5], [3.001, 46.5, 130]] } }]);
    assert.equal(g.aretes[0].pts[0].length, 2);
    proche(g.aretes[0].L, 0.001 * 111320 * Math.cos(46.5 * Math.PI / 180), 0.01);
  });

  it('sans cleabs : une identité de repli, jamais deux arêtes sous la même', () => {
    const f = ['a', 'b'].map((id, i) => ({ type: 'Feature', id, properties: {}, geometry: { type: 'LineString', coordinates: [ll([i * 100, 0]), ll([i * 100 + 50, 0])] } }));
    const g = construireGraphe(f);
    assert.deepEqual(g.aretes.map((e) => e.cleabs), ['a', 'b']);
  });
});

describe('reseau/graphe-routier — sens, voies, noms', () => {
  it('sensDe et sensAutorises', () => {
    assert.equal(sensDe('Double sens'), 'double');
    assert.equal(sensDe('Sens direct'), 'direct');
    assert.equal(sensDe('Sens inverse'), 'inverse');
    assert.equal(sensDe('Sans objet'), 'inconnu');
    assert.equal(sensDe(undefined), 'inconnu');
    assert.deepEqual(sensAutorises({ sens: 'direct' }), { direct: true, inverse: false });
    assert.deepEqual(sensAutorises({ sens: 'inverse' }), { direct: false, inverse: true });
    assert.deepEqual(sensAutorises({ sens: 'double' }), { direct: true, inverse: true });
    assert.deepEqual(sensAutorises({ sens: 'inconnu' }), { direct: true, inverse: true });
  });

  it('voiesParSens : moitié (arrondie au-dessus) sur un double sens, toutes sur un sens unique, 1 par défaut', () => {
    assert.equal(voiesParSens({ sens: 'double', nombreDeVoies: 2 }), 1);
    assert.equal(voiesParSens({ sens: 'double', nombreDeVoies: 3 }), 2);
    assert.equal(voiesParSens({ sens: 'direct', nombreDeVoies: 3 }), 3);
    assert.equal(voiesParSens({ sens: 'double', nombreDeVoies: null }), 1);
  });

  it('normaliserNom : accents, ponctuation, mots de type et articles', () => {
    assert.equal(normaliserNom('Avenue des Tests'), 'tests');
    assert.equal(normaliserNom('AV. DES TESTS'), 'tests');
    assert.equal(normaliserNom('Chemin de la Vérane'), 'verane');
    assert.equal(normaliserNom(null), '');
  });

  it('un numéro de route peut être multiple (« D1, N7 »)', () => {
    const g = construireGraphe([troncon('MULTI', [[0, 0], [10, 0]], { cpx_numero: 'D1, N7' })]);
    assert.deepEqual([...g.aretes[0].nums].sort(), ['D1', 'N7']);
  });
});
