// Paris, Lyon, Marseille : polygones fournis par l'hote (`donnees[id]`), commune et arrondissements dans une meme couche ou separes.
// Documente le comportement reel du runtime (voir CONTRAT-CARTE-BI.md, section 7).
// node --test tests/bi-admin-plm.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { carteSimulee } from './aide-carte-bi.js';

const carre = (x, y, t = 0.1) => ({ type: 'Polygon', coordinates: [[[x, y], [x + t, y], [x + t, y + t], [x, y + t], [x, y]]] });
const feat = (code, nom, x, y, extra = {}) => ({ type: 'Feature', properties: { code, nom, ...extra }, geometry: carre(x, y) });
const PARIS = feat('75056', 'Paris', 2.2, 48.8, { niveau: 'commune' });
const ARR = [feat('75101', 'Paris 1er', 2.3, 48.85, { niveau: 'arrondissement', commune: '75056' }), feat('75103', 'Paris 3e', 2.35, 48.86, { niveau: 'arrondissement', commune: '75056' })];
const TABLE = { 75056: 100, 75101: 5, 75103: 7 };
const valeurs = (rt, id) => Object.fromEntries(rt.api.getRows(id, { limite: 50 }).lignes.filter((l) => l.valeur != null).map((l) => [l.code, l.valeur]));

test('PLM : commune et arrondissements dans une couche `commune` se joignent sur le code exact, sans collision', async () => {
  const rt = attacher(carteSimulee());
  const r = await rt.api.addAdminLayer('commune', { id: 'c', source: 'hote', donnees: [PARIS, ...ARR], visuel: { source: 'hote', table: TABLE, niveauTable: 'commune', classes: 3 } });
  assert.equal(r.n, 3);
  assert.deepEqual(valeurs(rt, 'c'), { 75056: 100, 75101: 5, 75103: 7 });
  const l = rt.api.getLegend('c'); assert.equal(l.renseignees, 3); assert.equal(l.max, 100, 'la valeur communale entre dans la classification : les polygones se recouvrent');
});

test('PLM : une couche `arrondissement` seule joint les arrondissements', async () => {
  const rt = attacher(carteSimulee());
  const r = await rt.api.addAdminLayer('arrondissement', { id: 'a', source: 'hote', donnees: ARR, visuel: { source: 'hote', table: { 75101: 5, 75103: 7 }, niveauTable: 'arrondissement', classes: 3 } });
  assert.equal(r.n, 2);
  assert.deepEqual(valeurs(rt, 'a'), { 75101: 5, 75103: 7 });
  assert.equal(rt.api.getLegend('a').max, 7, 'sans la valeur communale');
});
