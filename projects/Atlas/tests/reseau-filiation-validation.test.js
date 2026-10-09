import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bilan, fenetres, fabriquer, scorer, indices } from '../tools/valider-filiation.mjs';
import { creerRepere } from '../lib/reseau/geo.js';

// Les tronçons réels figés d'un quartier urbain servent de base à l'événement synthétique : conservés = (ancienne, nouvelle) identiques
const fx = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/reseau/troncons-mesure.json', import.meta.url)), 'utf8'));
const enRecord = (f) => ({ p: f.properties, c: f.geometry.coordinates });
const toutes = [...fx.cas['urbain-1'], ...fx.cas['rural-1']].map(enRecord);
const repere = creerRepere(toutes[0].c[0][0], toutes[0].c[0][1]);

describe('validation de la filiation — bilan entre deux éditions', () => {
  it('compte conservés, détruits, créés et géométries modifiées', () => {
    const A = [
      { p: { cleabs: 'A', date_modification: '1' }, c: [[3, 46], [3.001, 46]] },
      { p: { cleabs: 'B', date_modification: '1' }, c: [[3, 46.001], [3.001, 46.001]] },
      { p: { cleabs: 'C', date_modification: '1' }, c: [[3, 46.002], [3.001, 46.002]] },
    ];
    const B = [
      { p: { cleabs: 'A', date_modification: '2' }, c: [[3, 46], [3.001, 46]] },
      { p: { cleabs: 'B', date_modification: '1' }, c: [[3, 46.001], [3.001, 46.0011]] },
      { p: { cleabs: 'N', date_modification: '2' }, c: [[3, 46.003], [3.001, 46.003]] },
    ];
    const b = bilan(A, B);
    assert.deepEqual([b.conserves, b.detruits, b.crees, b.geometrieModifiee, b.dateModificationChangee], [2, 1, 1, 1, 1]);
    assert.ok(b.deplacementMax.max > 5 && b.deplacementMax.max < 20);
  });
});

describe('validation de la filiation — vérité synthétique', () => {
  const conserves = toutes.map((x) => ({ a: x, b: x, c: x.c }));
  const indicesTous = conserves.map((_, i) => i);

  it('l’événement est fabriqué avec une vérité connue : liens et type de chaque ancien tronçon', () => {
    const cas = fabriquer(conserves, indicesTous, repere, { bruit: 0, graine: 5 });
    assert.ok(cas.anciens.length > 100);
    assert.ok(cas.verite.size > 100);
    const types = new Set(cas.types.values());
    for (const t of ['remplacement', 'scission', 'supprime']) assert.ok(types.has(t), `type ${t} présent`);
    // identités masquées : aucun cleabs d'origine ne passe
    assert.ok(cas.anciens.every((x) => /^o\d+$/.test(x.cleabs)) && cas.nouveaux.every((x) => /^n\d+$/.test(x.cleabs)));
  });

  it('même graine, même événement', () => {
    const a = fabriquer(conserves, indicesTous, repere, { bruit: 2, graine: 9 });
    const b = fabriquer(conserves, indicesTous, repere, { bruit: 2, graine: 9 });
    assert.deepEqual([...a.verite].sort(), [...b.verite].sort());
    assert.deepEqual(a.nouveaux[0].coordinates, b.nouveaux[0].coordinates);
  });

  it('sans bruit, la filiation retrouve presque tous les liens (précision et rappel ≥ 0,9)', () => {
    const cas = fabriquer(conserves, indicesTous, repere, { bruit: 0, graine: 5 });
    const s = scorer(cas);
    assert.ok(s.precision >= 0.9 && s.rappel >= 0.9, `précision ${s.precision} rappel ${s.rappel}`);
    assert.ok(s.exactitudeType >= 0.8, `type ${s.exactitudeType}`);
  });

  it('le bruit de numérisation dégrade le rappel, et resserrer la tolérance le dégrade davantage', () => {
    const net = fabriquer(conserves, indicesTous, repere, { bruit: 0, graine: 6 });
    const bruite = fabriquer(conserves, indicesTous, repere, { bruit: 4, graine: 6 });
    const sansBruit = scorer(net).f1;
    const avecBruit = scorer(bruite).f1;
    assert.ok(avecBruit < sansBruit, `${avecBruit} < ${sansBruit}`);
    assert.ok(scorer(bruite, { tol: 1 }).rappel < scorer(bruite).rappel);
  });

  it('les fenêtres découpent le département en carrés de 2 km avec assez de tronçons', () => {
    const f = fenetres(conserves, repere, { cote: 100000, min: 10, max: 100000 });
    assert.equal(f.length >= 1, true);
    assert.equal(f.reduce((a, w) => a + w.indices.length, 0) <= conserves.length, true);
  });
});

describe('validation de la filiation — plausibilité des liens réels', () => {
  it('indices : évalués seulement si les deux côtés renseignent l’attribut', () => {
    const a = { cpx_numero: 'D13', nom_collaboratif_gauche: 'Rue de la Gare', importance: '4', nature: 'Route à 1 chaussée', sens_de_circulation: 'Double sens' };
    const b = { cpx_numero: 'D13', nom_voie_ban_gauche: 'RUE DE LA GARE', importance: '5', nature: 'Route à 1 chaussée', sens_de_circulation: 'Sens direct' };
    assert.deepEqual(indices(a, b), { memeNumero: true, memeNom: true, memeImportance: false, memeNature: true, memeSens: false });
    assert.deepEqual(indices({ importance: '4' }, { nature: 'Chemin' }), {});
  });
});
