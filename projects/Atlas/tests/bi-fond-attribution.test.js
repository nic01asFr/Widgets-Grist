// Fond « plan IGN » : les sources du plan portent la mention IGN, sans quoi la carte n'affiche aucune attribution pour des données IGN.
// node --test tests/bi-fond-attribution.test.js   (aucun accès réseau : le style IGN est injecté)
import test from 'node:test';
import assert from 'node:assert/strict';
import { creerFond } from '../lib/bi/fond.js';
import { carteSimulee } from './aide-carte-bi.js';

const STYLE_IGN = {
  version: 8, glyphs: 'https://exemple/{fontstack}/{range}.pbf', sprite: 'https://exemple/sprite',
  sources: { plan_ign: { type: 'vector', tiles: ['https://exemple/{z}/{x}/{y}.pbf'], maxzoom: 16 } },
  layers: [
    { id: 'bckgrd', type: 'background', paint: {} },
    { id: 'eau', type: 'fill', source: 'plan_ign', 'source-layer': 'hydro_surf', paint: { 'fill-color': '#00f' } },
    { id: 'Routier a niveau - filet extérieur - route locale', type: 'line', source: 'plan_ign', 'source-layer': 'routier_route', paint: { 'line-color': '#000' } },
  ],
};

test('plan-ign : chaque source ajoutée porte la mention IGN, et elle disparaît au retour au fond d\'Atlas', async () => {
  const carte = carteSimulee();
  carte.getStyle = () => ({ layers: [{ id: 'background', type: 'background' }], glyphs: '' });
  carte.setGlyphs = () => {};
  const fond = creerFond(carte, { fetchStyle: async () => STYLE_IGN });
  const r = await fond.appliquer('plan-ign', {});
  assert.equal(r.mode, 'plan-ign');
  const sources = [...carte.sources.entries()].filter(([id]) => id.startsWith('fond-'));
  assert.ok(sources.length >= 1, 'une source IGN est ajoutée');
  for (const [id, s] of sources) assert.match(s.attribution || '', /IGN/, 'la source ' + id + ' n\'a pas de mention IGN');
  fond.retablir();
  assert.equal([...carte.sources.keys()].filter((id) => id.startsWith('fond-')).length, 0);
});
