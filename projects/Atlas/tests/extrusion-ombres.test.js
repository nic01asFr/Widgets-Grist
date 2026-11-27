import test from 'node:test';
import assert from 'node:assert/strict';
import {
  simplifierAnneau, plusGrandPolygone, extruderEntite, creerCasters, POINTS_ANNEAU,
} from '../lib/extrusion-ombres.js';

/** Un three.js de poche : il enregistre ce qu'on lui demande. */
function fauxThree({ echecExtrusion = false } = {}) {
  const journal = [];
  class Chemin {
    constructor() { this.pts = []; this.ferme = false; }
    moveTo(x, y) { this.pts.push(['m', x, y]); }
    lineTo(x, y) { this.pts.push(['l', x, y]); }
    closePath() { this.ferme = true; }
  }
  class Shape extends Chemin { constructor() { super(); this.holes = []; } }
  class ExtrudeGeometry {
    constructor(forme, options) {
      if (echecExtrusion) throw new Error('earcut');
      this.forme = forme; this.options = options; this.rotations = []; this.liberee = false;
      journal.push(this);
    }
    rotateX(a) { this.rotations.push(a); return this; }
    dispose() { this.liberee = true; }
  }
  class MeshStandardMaterial { constructor(o) { this.options = o; } }
  class Mesh { constructor(g, m) { this.geometry = g; this.material = m; } }
  return { THREE: { Shape, Path: Chemin, ExtrudeGeometry, MeshStandardMaterial, Mesh, DoubleSide: 2 }, journal };
}

const versLocal = (lng, lat) => ({ x: lng * 100, y: lat * 100 });
const carre = (x0, y0, c) => [[x0, y0], [x0 + c, y0], [x0 + c, y0 + c], [x0, y0 + c], [x0, y0]];
const polygone = (...anneaux) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: anneaux }, properties: {} });

/* ---------- simplifierAnneau ---------- */

test('simplifierAnneau : retire le point de fermeture, garde tel quel un anneau court', () => {
  assert.deepEqual(simplifierAnneau(carre(0, 0, 1)), [[0, 0], [1, 0], [1, 1], [0, 1]]);
});

test('simplifierAnneau : un anneau sans fermeture n est pas tronque', () => {
  const ouvert = [[0, 0], [1, 0], [1, 1], [0, 1]];
  assert.deepEqual(simplifierAnneau(ouvert), ouvert);
});

test('simplifierAnneau : au-dela du maximum, un point sur pas, le dernier est garde', () => {
  const anneau = Array.from({ length: 101 }, (_, i) => [i, i * 2]);
  const s = simplifierAnneau(anneau, 10);
  assert.ok(s.length <= 12, `trop de points : ${s.length}`);
  assert.deepEqual(s.at(-1), [100, 200]);
  assert.deepEqual(s[0], [0, 0]);
});

test('simplifierAnneau : vide ou absent -> []', () => {
  assert.deepEqual(simplifierAnneau(null), []);
  assert.deepEqual(simplifierAnneau([]), []);
  assert.equal(POINTS_ANNEAU, 28);
});

/* ---------- plusGrandPolygone ---------- */

test('plusGrandPolygone : le multipolygone rend celui dont l anneau exterieur est le plus grand', () => {
  const petit = [carre(0, 0, 1)];
  const grand = [carre(10, 10, 5)];
  const f = { geometry: { type: 'MultiPolygon', coordinates: [petit, grand] } };
  assert.equal(plusGrandPolygone(f), grand);
});

test('plusGrandPolygone : ni geometrie, ni polygone, ni anneau de 3 points -> null', () => {
  assert.equal(plusGrandPolygone(null), null);
  assert.equal(plusGrandPolygone({ geometry: { type: 'Point', coordinates: [0, 0] } }), null);
  assert.equal(plusGrandPolygone({ geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] } }), null);
});

/* ---------- extruderEntite ---------- */

test('extruderEntite : trace l anneau en metres locaux, extrusion sur la hauteur, sans biseau', () => {
  const { THREE, journal } = fauxThree();
  const g = extruderEntite(THREE, polygone(carre(1, 2, 1)), 12, versLocal);
  assert.equal(g, journal[0]);
  assert.deepEqual(g.options, { depth: 12, bevelEnabled: false, curveSegments: 1 });
  assert.deepEqual(g.forme.pts, [['m', 100, 200], ['l', 200, 200], ['l', 200, 300], ['l', 100, 300]]);
  assert.equal(g.forme.ferme, true);
});

test('extruderEntite : les trous (cours interieures) deviennent des Path de la forme', () => {
  const { THREE } = fauxThree();
  const g = extruderEntite(THREE, polygone(carre(0, 0, 10), carre(2, 2, 2)), 8, versLocal);
  assert.equal(g.forme.holes.length, 1);
  assert.equal(g.forme.holes[0].ferme, true);
  assert.equal(g.forme.holes[0].pts.length, 4);
});

test('extruderEntite : un trou de moins de trois points est ignore', () => {
  const { THREE } = fauxThree();
  const g = extruderEntite(THREE, polygone(carre(0, 0, 10), [[1, 1], [2, 2]]), 8, versLocal);
  assert.equal(g.forme.holes.length, 0);
});

test('extruderEntite : sans hauteur, sans geometrie ou sans anneau exploitable -> null', () => {
  const { THREE } = fauxThree();
  assert.equal(extruderEntite(THREE, polygone(carre(0, 0, 1)), 0, versLocal), null);
  assert.equal(extruderEntite(THREE, polygone(carre(0, 0, 1)), NaN, versLocal), null);
  assert.equal(extruderEntite(THREE, { properties: {} }, 5, versLocal), null);
  assert.equal(extruderEntite(THREE, { geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }, 5, versLocal), null);
});

test('extruderEntite : un echec de three est signale et rend null', () => {
  const { THREE } = fauxThree({ echecExtrusion: true });
  const avertis = [];
  const g = extruderEntite(THREE, polygone(carre(0, 0, 1)), 5, versLocal, (...a) => avertis.push(a.join(' ')));
  assert.equal(g, null);
  assert.match(avertis[0], /extrusion ombre earcut/);
});

/* ---------- creerCasters ---------- */

const item = (x, h) => ({ feature: polygone(carre(x, 0, 1)), height: h });

test('creerCasters : une seule emprise, pas de fusion ; le mesh ne peint rien et projette', () => {
  const { THREE, journal } = fauxThree();
  let fusions = 0;
  const mesh = creerCasters({ THREE, mergeGeometries: () => { fusions++; } }, [item(0, 10)], versLocal);
  assert.equal(fusions, 0);
  assert.equal(mesh.geometry, journal[0]);
  assert.deepEqual(journal[0].rotations, [-Math.PI / 2]);
  assert.equal(mesh.castShadow, true);
  assert.equal(mesh.receiveShadow, false);
  assert.equal(mesh.frustumCulled, false);
  assert.equal(mesh.material.options.colorWrite, false);
  assert.equal(mesh.material.options.depthWrite, false);
});

test('creerCasters : plusieurs emprises fusionnees en un mesh, geometries d origine liberees', () => {
  const { THREE, journal } = fauxThree();
  let recu = null;
  const fusion = { id: 'fusion' };
  const mesh = creerCasters({ THREE, mergeGeometries: (gs, groupes) => { recu = { gs, groupes }; return fusion; } },
    [item(0, 10), item(5, 20), item(9, 30)], versLocal);
  assert.equal(mesh.geometry, fusion);
  assert.equal(recu.gs.length, 3);
  assert.equal(recu.groupes, false);
  assert.ok(journal.every((g) => g.liberee));
});

test('creerCasters : fusion en echec -> null, geometries liberees', () => {
  const { THREE, journal } = fauxThree();
  const mesh = creerCasters({ THREE, mergeGeometries: () => null }, [item(0, 10), item(5, 10)], versLocal);
  assert.equal(mesh, null);
  assert.ok(journal.every((g) => g.liberee));
});

test('creerCasters : la hauteur absente vaut 8 m, et jamais moins de 2 m', () => {
  const { THREE, journal } = fauxThree();
  creerCasters({ THREE, mergeGeometries: () => ({}) }, [{ feature: polygone(carre(0, 0, 1)) }, item(5, 0.5)], versLocal);
  assert.deepEqual(journal.map((g) => g.options.depth), [8, 2]);   // absente -> 8 ; 0.5 -> max(0.5, 2) = 2
});

test('creerCasters : rien d exploitable -> null', () => {
  const { THREE } = fauxThree();
  assert.equal(creerCasters({ THREE, mergeGeometries: () => ({}) }, [], versLocal), null);
  assert.equal(creerCasters({ THREE, mergeGeometries: () => ({}) }, [{ feature: { geometry: null } }], versLocal), null);
  assert.equal(creerCasters({ THREE, mergeGeometries: () => ({}) }, null, versLocal), null);
});
