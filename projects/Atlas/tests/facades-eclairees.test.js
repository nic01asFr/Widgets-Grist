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

/* ---- index en grille des sources (E7) : même résultat que la comparaison exhaustive, bien moins de comparaisons ---- */
import { indexerSources, distance2Segment } from '../lib/facades-eclairees.js';

function graine(n) { let s = n >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

test('indexerSources : mêmes réponses que la comparaison exhaustive, sur des segments et des sources tirés au hasard', () => {
  const alea = graine(42);
  const sources = Array.from({ length: 300 }, () => ({ x: alea() * 1000 - 500, z: alea() * 1000 - 500 }));
  const rayon = 25; const r2 = rayon * rayon;
  const index = indexerSources(sources, rayon);
  let proches = 0;
  for (let n = 0; n < 2000; n++) {
    const p = { x: alea() * 1200 - 600, z: alea() * 1200 - 600 };
    const q = { x: p.x + (alea() - 0.5) * 80, z: p.z + (alea() - 0.5) * 80 };
    const attendu = sources.some((s) => distance2Segment(s, p, q) <= r2);
    assert.equal(index.proche(p, q), attendu, 'segment ' + n);
    if (attendu) proches++;
  }
  assert.ok(proches > 100 && proches < 1900, 'le tirage couvre les deux cas (' + proches + ' proches sur 2000)');
  assert.ok(index.comparaisons < 2000 * sources.length * 0.05, 'moins de 5 % des comparaisons exhaustives (' + index.comparaisons + ')');
});

test('indexerSources : une source exactement à la distance limite est proche, un mètre de plus ne l\'est pas ; coordonnées négatives', () => {
  const idx = indexerSources([{ x: -50, z: -50 }], 10);
  const seg = (dx) => [{ x: -50 + dx, z: -80 }, { x: -50 + dx, z: -60 }];
  assert.equal(idx.proche(...seg(0)), true, 'à 10 m exactement (segment à z=-60)');
  assert.equal(indexerSources([{ x: -50, z: -50 }], 10).proche({ x: -50, z: -61 }, { x: -50, z: -90 }), false, 'à 11 m');
  assert.equal(indexerSources([], 10).proche({ x: 0, z: 0 }, { x: 1, z: 1 }), false, 'aucune source');
  assert.equal(indexerSources(undefined, 10).proche({ x: 0, z: 0 }, { x: 1, z: 1 }), false, 'sources absentes');
});

test('batimentsProches et geometrieMurs donnent la même chose avec l\'index que sans (sélection et triangles)', () => {
  const alea = graine(7);
  const sources = Array.from({ length: 40 }, () => ({ x: alea() * 400, z: alea() * 400 }));
  const batis = Array.from({ length: 150 }, (_, i) => carre(i, alea() * 400, alea() * 400, 6 + alea() * 14, 5 + alea() * 20));
  const rayon = 20;
  const naif = batis.filter((b) => {
    const a = b.geometry.coordinates[0].map(([x, z]) => ({ x, z }));
    return a.some((p, i) => sources.some((s) => distance2Segment(s, p, a[(i + 1) % a.length]) <= rayon * rayon));
  }).map((b) => b.id);
  const proches = batimentsProches(batis, sources, rayon, identite);
  assert.deepEqual(proches.map((b) => b.id).sort((a, b) => a - b), naif.sort((a, b) => a - b));
  const g = geometrieMurs(proches, DECALAGE_M, () => 0, { sources, rayon });
  assert.ok(g.triangles > 0);
  assert.equal(g.positions.length, g.triangles * 9);
});
