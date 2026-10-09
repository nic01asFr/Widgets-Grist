import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { filiation, filiationDifferentiel, separerDifferentiel, nouvellesAvecOrigine, DEFAUTS } from '../lib/reseau/filiation.js';
import { projLigne } from '../lib/reseau/geo.js';
import { ll, repere } from './aide-reseau.js';

const feat = (cleabs, pts) => ({ cleabs, coordinates: pts.map(ll) });
const comp = (r, type) => r.composantes.filter((c) => c.type === type);

describe('reseau/filiation — cas synthétiques', () => {
  it('même cleabs avec une géométrie améliorée (2 m de décalage) : lien « meme_cleabs », pas de composante', () => {
    const r = filiation([feat('A', [[0, 0], [100, 0]])], [feat('A', [[0, 2], [100, 2]])]);
    assert.equal(r.resume.meme_cleabs, 1);
    assert.equal(r.composantes.length, 0);
    assert.ok(r.liens[0].recouvrement_m > 95);
  });

  it('scission : un tronçon de 200 m coupé à 150 m, deux nouveaux cleabs', () => {
    const r = filiation([feat('OLD', [[0, 0], [200, 0]])], [feat('N1', [[0, 0], [150, 0]]), feat('N2', [[150, 0], [200, 0]])]);
    const c = comp(r, 'scission');
    assert.equal(c.length, 1);
    assert.deepEqual(c[0].anciens, ['OLD']);
    assert.deepEqual(c[0].nouveaux.sort(), ['N1', 'N2']);
    assert.deepEqual(r.cleabsOrigine('N2'), ['OLD']);
  });

  it('scission où le cleabs survit sur le morceau long : N2 descend quand même de OLD', () => {
    const r = filiation([feat('OLD', [[0, 0], [200, 0]])], [feat('OLD', [[0, 0], [150, 0]]), feat('N2', [[150, 0], [200, 0]])]);
    assert.equal(r.resume.meme_cleabs, 1);
    assert.deepEqual(r.cleabsOrigine('N2'), ['OLD']);
    assert.equal(r.liens.find((l) => l.vers === 'N2').type, 'recouvrement');
  });

  it('fusion : deux tronçons deviennent un seul, nouveau cleabs', () => {
    const r = filiation([feat('A', [[0, 0], [100, 0]]), feat('B', [[100, 0], [220, 0]])], [feat('M', [[0, 0], [220, 0]])]);
    const c = comp(r, 'fusion');
    assert.equal(c.length, 1);
    assert.deepEqual(c[0].anciens.sort(), ['A', 'B']);
    assert.deepEqual(c[0].nouveaux, ['M']);
    assert.deepEqual(r.cleabsOrigine('M').sort(), ['A', 'B']);
  });

  it('remplacement : même tracé (à 3 m près) sous un nouveau cleabs', () => {
    const r = filiation([feat('A', [[0, 0], [100, 0], [100, 80]])], [feat('Z', [[0, 3], [100, 3], [103, 80]])]);
    assert.equal(comp(r, 'remplacement').length, 1);
  });

  it('remaniement : deux anciens, deux nouveaux qui se recouvrent en croix', () => {
    const r = filiation(
      [feat('A', [[0, 0], [100, 0]]), feat('B', [[100, 0], [200, 0]])],
      [feat('X', [[0, 0], [160, 0]]), feat('Y', [[100, 0], [200, 0]])],
    );
    assert.equal(comp(r, 'remaniement').length, 1);
  });

  it('suppression et création : sans voisin géométrique', () => {
    const r = filiation([feat('GONE', [[0, 0], [100, 0]])], [feat('NEW', [[0, 500], [100, 500]])]);
    assert.equal(comp(r, 'supprime').length, 1);
    assert.equal(comp(r, 'cree').length, 1);
  });

  it('une route qui en croise une autre ne crée pas de lien (cap et recouvrement)', () => {
    const r = filiation([feat('A', [[0, 0], [200, 0]])], [feat('X', [[100, -100], [100, 100]])]);
    assert.equal(r.liens.length, 0);
    assert.equal(comp(r, 'supprime').length, 1);
  });

  it('deux chaussées parallèles à 12 m ne sont pas confondues (tolérance 5 m)', () => {
    assert.equal(filiation([feat('A', [[0, 0], [200, 0]])], [feat('B', [[0, 12], [200, 12]])]).liens.length, 0);
  });

  it('limite : deux chaussées à 4 m (sous la tolérance) SERAIENT confondues — `tol` se règle selon la densité', () => {
    assert.equal(filiation([feat('A', [[0, 0], [200, 0]])], [feat('B', [[0, 4], [200, 4]])]).liens.length, 1);
    assert.equal(filiation([feat('A', [[0, 0], [200, 0]])], [feat('B', [[0, 4], [200, 4]])], { tol: 2 }).liens.length, 0);
  });

  it('un tronçon parcouru en sens inverse reste le même tronçon (le sens est ignoré)', () => {
    const r = filiation([feat('A', [[0, 0], [100, 0]])], [feat('Z', [[100, 1], [0, 1]])]);
    assert.equal(comp(r, 'remplacement').length, 1);
  });

  it('accepte aussi des Feature GeoJSON, et des listes vides', () => {
    const f = (cleabs, pts) => ({ type: 'Feature', properties: { cleabs }, geometry: { type: 'LineString', coordinates: pts.map(ll) } });
    const r = filiation([f('A', [[0, 0], [100, 0]])], [f('Z', [[0, 1], [100, 1]])]);
    assert.equal(comp(r, 'remplacement').length, 1);
    assert.deepEqual(filiation([], []).liens, []);
    assert.deepEqual(filiation([], []).cleabsOrigine('x'), []);
    assert.equal(comp(filiation([], [feat('N', [[0, 0], [10, 0]])]), 'cree').length, 1);
  });

  it('réglages invalides refusés', () => {
    assert.throws(() => filiation([], [], { tol: -1 }), /invalide/);
    assert.throws(() => filiation([], [], { capMax: NaN }), /invalide/);
    assert.equal(DEFAUTS.tol, 5);
  });
});

describe('reseau/filiation — articulation avec une migration d’ancrage (sans copier l’ancrage)', () => {
  const anciens = [feat('OLD', [[0, 0], [100, 0], [100, 100]])];
  const nouveaux = [feat('N1', [[0, 0], [100, 0], [100, 50]]), feat('N2', [[100, 50], [100, 100]])];
  const f = filiation(anciens, nouveaux);

  it('nouvellesAvecOrigine : { cleabs, geometry, cleabs_origine } pour chaque nouveau tronçon', () => {
    const n = nouvellesAvecOrigine(nouveaux, f);
    assert.deepEqual(n.map((x) => x.cleabs), ['N1', 'N2']);
    assert.deepEqual(n.map((x) => x.cleabs_origine), [['OLD'], ['OLD']]);
    assert.equal(n[1].geometry.type, 'LineString');
  });

  it('esquisse de l’usage : un repère à 170 m de OLD est repris à 20 m de N2, par les seules origines', () => {
    // Ce que fera une migration d'ancrage, réduit à l'essentiel : parmi les nouveaux qui descendent de l'ancien
    // tronçon, prendre celui qui porte le point de l'ancien tronçon à l'abscisse du repère. (L'ancrage réel — contrat,
    // côté, décalage, confiance — n'est pas dans ce module.)
    const R = repere;
    const abscisse = 170;
    const ancienPts = anciens[0].coordinates.map(R.vers);
    const [x, y] = [100, 70]; // point à 170 m le long de OLD : 100 m vers l'est puis 70 m vers le nord
    const candidats = nouvellesAvecOrigine(nouveaux, f).filter((n) => n.cleabs_origine.includes('OLD'));
    const meilleur = candidats
      .map((n) => ({ n, r: projLigne([x, y], n.geometry.coordinates.map(R.vers)) }))
      .sort((a, b) => a.r.d - b.r.d)[0];
    assert.equal(meilleur.n.cleabs, 'N2');
    assert.ok(Math.abs(meilleur.r.s - 20) < 0.5, `abscisse ${meilleur.r.s}`);
    assert.ok(ancienPts.length && abscisse === 170);
  });
});

describe('reseau/filiation — Différentiel BD TOPO (extrait réel figé)', () => {
  const d = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/reseau/diff-troncons-extrait.json', import.meta.url)), 'utf8'));
  const DEPUIS = '2026-03-01';

  it('separerDifferentiel : détruits, vivants, et parmi eux créés et modifiés selon la date', () => {
    const s = separerDifferentiel(d.emprises.rural_ardeche.features, { depuis: DEPUIS });
    assert.equal(s.detruits.length, 22);
    assert.equal(s.detruits.length + s.vivants.length, d.emprises.rural_ardeche.features.length);
    assert.equal(s.crees.length + s.modifies.length, s.vivants.length);
    assert.ok(s.crees.every((f) => f.properties.date_creation >= DEPUIS));
    assert.deepEqual(separerDifferentiel(d.emprises.rural_ardeche.features).crees, []);
  });

  it('zone rurale : 22 détruits, 13 avec un successeur, 9 supprimés — comme dans la mesure d’origine', () => {
    const r = filiationDifferentiel(d.emprises.rural_ardeche.features, { depuis: DEPUIS });
    assert.deepEqual([r.detruits, r.avecSuccesseur, r.sansSuccesseur], [22, 13, 9]);
    assert.deepEqual(r.bilan, {
      'remplacement -> modifie_cleabs_conserve': 7, supprime: 9, 'remplacement -> cree': 4, 'fusion -> modifie_cleabs_conserve': 1,
    });
    assert.equal(r.resume.meme_cleabs, 0, 'aucun cleabs détruit n’est réutilisé par un objet vivant');
  });

  it('Marseille : 49 détruits, 21 avec un successeur, dont une scission qui mêle cleabs nouveau et cleabs conservé', () => {
    const r = filiationDifferentiel(d.emprises.marseille.features, { depuis: DEPUIS });
    assert.deepEqual([r.detruits, r.avecSuccesseur, r.sansSuccesseur], [49, 21, 28]);
    assert.equal(r.bilan.supprime, 28);
    assert.equal(r.bilan['remplacement -> modifie_cleabs_conserve'], 14);
    assert.equal(r.bilan['scission -> cree+modifie_cleabs_conserve'], 1);
  });

  it('tout détruit reçoit un type : rien ne se perd entre les composantes et les détruits', () => {
    for (const e of Object.values(d.emprises)) {
      const r = filiationDifferentiel(e.features, { depuis: DEPUIS });
      const dansComposantes = new Set(r.composantes.flatMap((c) => c.anciens));
      assert.equal(dansComposantes.size, r.detruits);
    }
  });
});
