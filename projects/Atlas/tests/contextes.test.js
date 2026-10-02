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
