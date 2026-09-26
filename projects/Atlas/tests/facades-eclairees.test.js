/**
 * Façades éclairées, bornées (lib/facades-eclairees.js) — point P4.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { hauteursBatiment, anneauxExterieurs, batimentsProches, geometrieMurs, DECALAGE_M } from '../lib/facades-eclairees.js';

test('hauteurs lues comme MapLibre : render_height / render_min_height, plancher 0,5 m', () => {
  assert.deepEqual(hauteursBatiment({ render_height: 12, render_min_height: 3 }), { base: 3, haut: 12 });
  assert.deepEqual(hauteursBatiment({ render_height: 0.2 }), { base: 0, haut: 0.5 });
  assert.equal(hauteursBatiment({}), null, 'pas de hauteur inventée');
  assert.equal(hauteursBatiment({ render_height: 5, render_min_height: 5 }), null);
});

test('anneaux extérieurs : trous ignorés, multipolygones lus', () => {
  const ext = [[0, 0], [1, 0], [1, 1], [0, 0]];
  const trou = [[0.2, 0.2], [0.3, 0.2], [0.3, 0.3], [0.2, 0.2]];
  assert.equal(anneauxExterieurs({ type: 'Polygon', coordinates: [ext, trou] }).length, 1);
  assert.equal(anneauxExterieurs({ type: 'MultiPolygon', coordinates: [[ext], [ext, trou]] }).length, 2);
  assert.deepEqual(anneauxExterieurs({ type: 'Point', coordinates: [0, 0] }), []);
});

const carre = (id, x0, z0, c, h = 10) => ({
  id, properties: { render_height: h },
  geometry: { type: 'Polygon', coordinates: [[[x0, z0], [x0 + c, z0], [x0 + c, z0 + c], [x0, z0 + c], [x0, z0]]] },
});
const identite = (lng, lat) => ({ x: lng, z: lat });

test('seuls les bâtiments proches d’une source sont recopiés, sans doublon de tuile', () => {
  const b = [carre(1, 0, 0, 10), carre(1, 0, 0, 10), carre(2, 100, 100, 10), carre(3, 25, 0, 10)];
  const r = batimentsProches(b, [{ x: 15, z: 5 }], 20, identite);
  assert.deepEqual(r.map((x) => x.id), [1, 3]);
  assert.deepEqual(batimentsProches(b, [], 20, identite), []);
});

test('murs : deux triangles par arête, normales sortantes, décalés de 10 cm', () => {
  const [b] = batimentsProches([carre(1, 0, 0, 10, 8)], [{ x: 5, z: 5 }], 50, identite);
  const g = geometrieMurs([b]);
  // Anneau fermé de 5 points : 5 arêtes dont une nulle → 4 murs, 8 triangles.
  assert.equal(g.triangles, 8);
  // Chaque normale pointe hors du carré (centre 5, 5).
  for (let i = 0; i < g.positions.length; i += 3) {
    const x = g.positions[i]; const z = g.positions[i + 2];
    const nx = g.normales[i]; const nz = g.normales[i + 2];
    assert.ok((x - 5) * nx + (z - 5) * nz > 0, 'normale sortante');
    assert.equal(g.normales[i + 1], 0);
  }
  // Décalage : aucun sommet à l'intérieur ni sur le mur d'origine.
  const xs = []; for (let i = 0; i < g.positions.length; i += 3) xs.push(g.positions[i]);
  assert.ok(Math.min(...xs) <= -DECALAGE_M + 1e-9 && Math.max(...xs) >= 10 + DECALAGE_M - 1e-9);
  // Hauteurs : de 0 à 8 m.
  const ys = []; for (let i = 1; i < g.positions.length; i += 3) ys.push(g.positions[i]);
  assert.equal(Math.min(...ys), 0);
  assert.equal(Math.max(...ys), 8);
});

test('murs : le sens de l’anneau ne change pas l’extérieur', () => {
  const inverse = carre(1, 0, 0, 10);
  inverse.geometry.coordinates[0].reverse();
  const g = geometrieMurs(batimentsProches([inverse], [{ x: 5, z: 5 }], 50, identite));
  for (let i = 0; i < g.positions.length; i += 3) {
    assert.ok((g.positions[i] - 5) * g.normales[i] + (g.positions[i + 2] - 5) * g.normales[i + 2] > 0);
  }
});

test('murs : seules les arêtes proches d’une source sont gardées (îlot fusionné)', () => {
  const [b] = batimentsProches([carre(1, 0, 0, 100)], [{ x: 50, z: -5 }], 20, identite);
  const g = geometrieMurs([b], DECALAGE_M, () => 0, { sources: [{ x: 50, z: -5 }], rayon: 20 });
  assert.equal(g.triangles, 2, 'la seule arête à moins de 20 m');
});
