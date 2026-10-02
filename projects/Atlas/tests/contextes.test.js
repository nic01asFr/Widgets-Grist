import test from 'node:test';
import assert from 'node:assert/strict';
import { usageDe, avecUsage, contextesProposes, contexteDeCle } from '../lib/contextes.js';

test('usageDe : jamais null, et seul `contexte: true` compte', () => {
  assert.deepEqual(usageDe(undefined), { contexte: false });
  assert.deepEqual(usageDe({}), { contexte: false });
  assert.deepEqual(usageDe({ usage: { contexte: 'oui' } }), { contexte: false });
  assert.deepEqual(usageDe({ usage: { contexte: true } }), { contexte: true });
});

test('avecUsage : copie, ne touche pas l etat d origine, ne laisse pas de bloc vide', () => {
  const etat = { camera: { zoom: 3 } };
  const oui = avecUsage(etat, { contexte: true });
  assert.deepEqual(oui.usage, { contexte: true });
  assert.equal(etat.usage, undefined, 'l etat d origine n est pas modifie');
  assert.equal(oui.camera, etat.camera, 'le reste de l etat est conserve');
  const non = avecUsage(oui, { contexte: false });
  assert.equal('usage' in non, false);
});

test('les contextes proposes : les etapes marquees, dans l ordre, avec leur cle', () => {
  const recit = [
    { cle: 'a', title: 'Ouverture', text: 'x', state: {} },
    { cle: 'b', title: 'Secteur nord', text: 'Consigne', state: { usage: { contexte: true } } },
    { cle: 'c', title: '', text: '', state: { usage: { contexte: true } } },
    { title: 'Sans cle', state: { usage: { contexte: true } } },
  ];
  assert.deepEqual(contextesProposes(recit), [
    { cle: 'b', index: 1, titre: 'Secteur nord', texte: 'Consigne' },
    { cle: 'c', index: 2, titre: 'Étape 3', texte: '' },
  ]);
});

test('retrouver un contexte par sa cle, meme si l etape a change de rang', () => {
  const recit = [
    { cle: 'b', title: 'B', state: { usage: { contexte: true } } },
    { cle: 'a', title: 'A', state: { usage: { contexte: true } } },
  ];
  assert.equal(contexteDeCle(recit, 'a').index, 1);
  recit.reverse();
  assert.equal(contexteDeCle(recit, 'a').index, 0, 'la cle suit l etape, pas son rang');
  assert.equal(contexteDeCle(recit, 'zzz'), null);
  recit[0].state = {};
  assert.equal(contexteDeCle(recit, 'a'), null, 'une etape qui n est plus un contexte ne se retrouve plus');
});

test('relevesDe : null sans règle, la liste (même vide) avec une règle', async () => {
  const { relevesDe } = await import('../lib/contextes.js');
  assert.equal(relevesDe(undefined), null);
  assert.equal(relevesDe({ usage: { contexte: true } }), null);
  assert.deepEqual(relevesDe({ usage: { contexte: true, releves: ['A', 'B'] } }), ['A', 'B']);
  assert.deepEqual(relevesDe({ usage: { contexte: true, releves: [] } }), []);
  assert.deepEqual(relevesDe({ usage: { contexte: true, releves: ['A', 3, '', null] } }), ['A']);
  assert.equal(relevesDe({ usage: { contexte: true, releves: 'A' } }), null);
});

test('releveProposeDans : sans règle, tout est proposé', async () => {
  const { releveProposeDans } = await import('../lib/contextes.js');
  assert.equal(releveProposeDans(null, 'A'), true);
  assert.equal(releveProposeDans(['A'], 'A'), true);
  assert.equal(releveProposeDans(['A'], 'B'), false);
  assert.equal(releveProposeDans([], 'A'), false);
});

test('avecUsage garde les relevés tant que le contexte l est, et les emporte avec lui', async () => {
  const etat = { camera: 1, usage: { contexte: true, releves: ['A'] } };
  const autre = avecUsage(etat, { contexte: true });
  assert.deepEqual(autre.usage, { contexte: true, releves: ['A'] });
  assert.deepEqual(avecUsage(etat, { releves: ['B'] }).usage, { contexte: true, releves: ['B'] });
  assert.deepEqual(avecUsage(etat, { releves: null }).usage, { contexte: true });
  assert.equal(avecUsage(etat, { contexte: false }).usage, undefined);
  assert.deepEqual(etat.usage, { contexte: true, releves: ['A'] });
});

test('basculerReleve : décocher écrit une liste, tout recocher rend null', async () => {
  const { basculerReleve } = await import('../lib/contextes.js');
  const toutes = ['A', 'B', 'C'];
  assert.deepEqual(basculerReleve(null, toutes, 'B', false), ['A', 'C']);
  assert.deepEqual(basculerReleve(['A', 'C'], toutes, 'B', true), null);
  assert.deepEqual(basculerReleve(['A'], toutes, 'C', true), ['A', 'C']);
  assert.deepEqual(basculerReleve(['A'], toutes, 'A', false), []);
  assert.deepEqual(basculerReleve(null, toutes, 'A', true), null);
});
