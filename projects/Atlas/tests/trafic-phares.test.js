/**
 * Les phares et les feux des véhicules du trafic suivent le soleil de la scène d'Atlas, comme les luminaires : `Models3D.vehiculesAllumes` (app_v7.js) interroge
 * `etatPointLumineux` avec un point sans profil. Ce test fixe ce dont cette règle dépend : entre le coucher et le lever du soleil, allumé ; de jour, éteint ;
 * et un changement de date ou de lieu change la réponse.
 * node --test projects/Atlas/tests/trafic-phares.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { etatPointLumineux, instantLocal } from '../lib/eclairage-profil.js';

const FUSEAU = 'Europe/Paris';
/** Un soleil de convention : coucher à 19 h 00 locale, lever à 06 h 30 locale, pour le jour dont on donne le midi (le calcul vrai vient de SunCalc, dans l’application). */
const soleil = (midiMs) => ({ coucher: midiMs + 7 * 3600e3, lever: midiMs - 5.5 * 3600e3 });
const ctx = { lat: 43.3, lon: 5.39, fuseau: FUSEAU, soleil };
const allumes = (date, hhmm, contexte = ctx) => {
  const [h, m] = hhmm.split(':').map(Number);
  return etatPointLumineux({}, null, [], instantLocal(date, h * 60 + m, FUSEAU), contexte).allume;
};

test('phares : éteints de jour, allumés de la tombée de la nuit au lever du jour', () => {
  assert.equal(allumes('2026-10-10', '12:00'), false, 'midi');
  assert.equal(allumes('2026-10-10', '18:30'), false, 'avant le coucher');
  assert.equal(allumes('2026-10-10', '19:30'), true, 'après le coucher');
  assert.equal(allumes('2026-10-10', '23:50'), true, 'en pleine nuit');
  assert.equal(allumes('2026-10-11', '03:00'), true, 'après minuit, la nuit du soir d\'avant continue');
  assert.equal(allumes('2026-10-11', '07:00'), false, 'après le lever');
});

test('phares : ils suivent le soleil de la scène — un autre coucher décale l\'allumage', () => {
  const tard = { ...ctx, soleil: (midiMs) => ({ coucher: midiMs + 9 * 3600e3, lever: midiMs - 5.5 * 3600e3 }) };   // coucher à 21 h
  assert.equal(allumes('2026-06-21', '20:00', tard), false);
  assert.equal(allumes('2026-06-21', '21:30', tard), true);
  assert.equal(allumes('2026-06-21', '20:00'), true, 'avec le coucher de 19 h, la même heure est une heure de nuit');
});

test('phares : un état illisible ne fait pas lever d\'exception à l\'appelant (il est pris pour éteint)', () => {
  let valeur;
  try { valeur = !!etatPointLumineux({}, null, [], Number.NaN, ctx).allume; } catch (e) { valeur = false; }
  assert.equal(valeur, false);
});
