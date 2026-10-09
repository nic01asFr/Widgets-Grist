import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  creerRepere, lignesDe, projSeg, projLigne, cumul, pointA, echantillonner, longueur, distPtLignes, cap, ecartCap,
} from '../lib/reseau/geo.js';

const proche = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} attendu ${b}, obtenu ${a}`);

describe('reseau/geo — plan local en mètres', () => {
  it('le repère est réversible, et un degré de latitude vaut ~111 km', () => {
    const r = creerRepere(5.4, 43.3);
    const p = [5.41, 43.31];
    const [x, y] = r.vers(p);
    proche(y, 0.01 * 111320, 0.01);
    const retour = r.depuis(x, y);
    proche(retour[0], p[0], 1e-9);
    proche(retour[1], p[1], 1e-9);
  });

  it('lignesDe : LineString, MultiLineString, collection ; le reste ne donne rien', () => {
    const l = [[0, 0], [1, 1]];
    assert.equal(lignesDe({ type: 'LineString', coordinates: l }).length, 1);
    assert.equal(lignesDe({ type: 'MultiLineString', coordinates: [l, l] }).length, 2);
    assert.equal(lignesDe({ type: 'GeometryCollection', geometries: [{ type: 'LineString', coordinates: l }, { type: 'Point', coordinates: [0, 0] }] }).length, 1);
    assert.deepEqual(lignesDe({ type: 'Polygon', coordinates: [] }), []);
    assert.deepEqual(lignesDe(null), []);
  });

  it('projection : pied sur le segment, abscisse, cap dans le sens de la ligne', () => {
    const ln = [[0, 0], [100, 0], [100, 100]];
    const r = projLigne([60, 5], ln);
    proche(r.d, 5, 1e-9);
    proche(r.s, 60, 1e-9);
    proche(r.cap, 90, 1e-9);
    const r2 = projLigne([103, 70], ln);
    proche(r2.s, 170, 1e-9);
    proche(r2.cap, 0, 1e-9);
    assert.equal(projLigne([0, 0], [[0, 0]]), null);
    assert.equal(projSeg([5, 5], [0, 0], [0, 0]).t, 0);
  });

  it('abscisse, point à l’abscisse, échantillonnage aux extrémités', () => {
    const ln = [[0, 0], [100, 0], [100, 100]];
    const c = cumul(ln);
    assert.deepEqual(c, [0, 100, 200]);
    assert.deepEqual(pointA(ln, c, 150), [100, 50]);
    assert.deepEqual(pointA(ln, c, 999), [100, 100]);
    const e = echantillonner(ln, 50);
    assert.equal(e.length, 5);
    assert.deepEqual(e[0], [0, 0]);
    assert.deepEqual(e[4], [100, 100]);
    assert.equal(longueur(ln), 200);
    proche(distPtLignes([50, 30], [ln, [[0, 40], [100, 40]]]), 10, 1e-9);
  });

  it('caps : du nord, écart minimal sur le cercle', () => {
    proche(cap([0, 0], [0, 10]), 0, 1e-9);
    proche(cap([0, 0], [10, 0]), 90, 1e-9);
    proche(ecartCap(350, 10), 20, 1e-9);
    proche(ecartCap(0, 180), 180, 1e-9);
  });
});
