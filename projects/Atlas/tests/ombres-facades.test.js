/**
 * Ombre portée sur les façades éclairées (E7) : un mur n'est éclairé que par une source qui le voit.
 * node --test projects/Atlas/tests/ombres-facades.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { indexerAretes, rayonCoupe, cellulesEclairees } from '../lib/ombres-facades.js';
import { geometrieMurs } from '../lib/facades-eclairees.js';

/** Un bâtiment carré : anneau dans le repère local (x est, z sud), de `base` à `haut`. */
function batiment(id, x0, z0, c, haut, base = 0) {
  const a = [{ x: x0, z: z0 }, { x: x0 + c, z: z0 }, { x: x0 + c, z: z0 + c }, { x: x0, z: z0 + c }];
  return { id, anneaux: [a], base, haut };
}
const SOURCE = { x: 0, z: 0 };
const HAUTEUR_FEU = 8;

//  source (0,0)  ->  devant : bâtiment F de 10 m de haut, x de 10 à 20  ->  derrière : bâtiment B de 25 m, x de 30 à 40
const devant = () => batiment('F', 10, -5, 10, 10);
const derriere = () => batiment('B', 30, -5, 10, 25);
const murOuest = (b) => ({ p: b.anneaux[0][3], q: b.anneaux[0][0] });   // x = 30, regarde vers la source : normale (-1, 0)
const ctx = (batiments, extra = {}) => ({ sources: [SOURCE], hauteurFeu: HAUTEUR_FEU, rayon: 60, index: indexerAretes(batiments), ...extra });

test('rayonCoupe : un mur de la bonne hauteur coupe le rayon, un mur plus bas que le rayon ne le coupe pas', () => {
  const idx = indexerAretes([devant()]);
  const source = { x: 0, z: 0, y: 8 };
  assert.equal(rayonCoupe(source, { x: 30, z: 0, y: 2 }, idx), true, 'rayon bas : passe dans le bâtiment de 10 m');
  assert.equal(rayonCoupe(source, { x: 30, z: 0, y: 25 }, idx), false, 'rayon haut : passe au-dessus du toit');
  assert.equal(rayonCoupe(source, { x: 5, z: 0, y: 2 }, idx), false, 'la cible est avant le bâtiment');
  assert.equal(rayonCoupe(source, { x: 30, z: 40, y: 2 }, idx), false, 'à côté du bâtiment');
});

test('sans obstacle, un mur éclairé reste UN rectangle entier', () => {
  const b = derriere(); const { p, q } = murOuest(b);
  const c = cellulesEclairees(p, q, b.base, b.haut, { x: -1, z: 0 }, ctx([b]));
  assert.deepEqual(c, [{ t0: 0, t1: 1, y0: 0, y1: 25 }]);
});

test('un bâtiment devant le mur le met à l\'ombre en bas et le laisse éclairé en haut', () => {
  const B = derriere(); const F = devant(); const { p, q } = murOuest(B);
  const c = cellulesEclairees(p, q, B.base, B.haut, { x: -1, z: 0 }, ctx([F, B]));
  assert.ok(c.length > 0, 'le haut du mur est éclairé');
  const plusBas = Math.min(...c.map((r) => r.y0));
  assert.ok(plusBas > 9, 'rien d\'éclairé au pied du mur (premier éclairé à ' + plusBas.toFixed(1) + ' m)');
  assert.ok(Math.max(...c.map((r) => r.y1)) === 25, 'le haut est éclairé jusqu\'au toit');
  // le seuil attendu : le rayon passe au-dessus du bâtiment de 10 m à x = 10 quand y > 13,97 m ; les bandes de 25/9 m le suivent à une bande près
  for (const r of c) assert.ok((r.y0 + r.y1) / 2 > 13.97, 'bande éclairée à ' + ((r.y0 + r.y1) / 2).toFixed(1) + ' m, sous le seuil du rayon');
});

test('un obstacle plus bas que le rayon ne fait pas d\'ombre', () => {
  const B = derriere(); const bas = batiment('bas', 10, -5, 10, 2); const { p, q } = murOuest(B);
  assert.deepEqual(cellulesEclairees(p, q, B.base, B.haut, { x: -1, z: 0 }, ctx([bas, B])), [{ t0: 0, t1: 1, y0: 0, y1: 25 }]);
});

test('un mur qui tourne le dos à la source n\'est jamais éclairé, et un mur hors de portée non plus', () => {
  const B = derriere();
  const murEst = { p: B.anneaux[0][1], q: B.anneaux[0][2] };   // x = 40, normale (+1, 0) : tourne le dos à la source
  assert.deepEqual(cellulesEclairees(murEst.p, murEst.q, B.base, B.haut, { x: 1, z: 0 }, ctx([B])), []);
  const { p, q } = murOuest(B);
  assert.deepEqual(cellulesEclairees(p, q, B.base, B.haut, { x: -1, z: 0 }, ctx([B], { rayon: 20 })), [], 'à 30 m, hors d\'un rayon de 20 m');
});

test('un mur décalé de côté de l\'obstacle reste éclairé là où le rayon passe à côté', () => {
  // F ne couvre que z de -5 à 5 ; un mur de B large de 60 m : ses extrémités sont à l'abri de l'obstacle
  const B = batiment('Large', 30, -30, 60, 25); const F = devant();
  const p = B.anneaux[0][3], q = B.anneaux[0][0];   // x = 30, z de 30 à -30
  const c = cellulesEclairees(p, q, 0, 25, { x: -1, z: 0 }, ctx([F, B]));
  const bas = c.filter((r) => r.y0 === 0);
  assert.ok(bas.length > 0, 'des cellules du pied du mur sont éclairées, hors de l\'ombre de F');
  assert.ok(bas.every((r) => r.t1 <= 0.4 || r.t0 >= 0.6), 'aucune au milieu, derrière F');
});

test('geometrieMurs avec ombres : moins de triangles qu\'avec l\'obstacle ignoré, et le même rendu sans obstacle', () => {
  const B = derriere(); const F = devant();
  const pres = (batis, ombres) => ({ sources: [SOURCE], rayon: 60, ...(ombres ? { ombres: { hauteurFeu: HAUTEUR_FEU } } : {}) });
  const sansOmbres = geometrieMurs([F, B], 0.1, () => 0, pres([F, B], false));
  const avecOmbres = geometrieMurs([F, B], 0.1, () => 0, pres([F, B], true));
  assert.ok(avecOmbres.triangles > 0);
  assert.ok(avecOmbres.triangles < sansOmbres.triangles, 'les murs de dos et à l\'ombre ne sont plus recopiés (' + avecOmbres.triangles + ' < ' + sansOmbres.triangles + ')');
  assert.equal(avecOmbres.positions.length, avecOmbres.triangles * 9);
  assert.equal(avecOmbres.normales.length, avecOmbres.triangles * 9);
  // un seul bâtiment, sans rien devant : seul le mur qui regarde la source subsiste, entier (2 triangles)
  const seul = geometrieMurs([B], 0.1, () => 0, pres([B], true));
  assert.equal(seul.triangles, 2);
});

test('les sommets recopiés restent au ras du mur, décalés vers l\'extérieur, jamais sous le sol', () => {
  const B = derriere();
  const g = geometrieMurs([B], 0.1, () => 0, { sources: [SOURCE], rayon: 60, ombres: { hauteurFeu: HAUTEUR_FEU } });
  for (let i = 0; i < g.positions.length; i += 3) {
    assert.ok(Math.abs(g.positions[i] - 29.9) < 1e-4, 'x = 30 - 0,1 (décalage extérieur)');
    assert.ok(g.positions[i + 1] >= 0 && g.positions[i + 1] <= 25);
  }
});
