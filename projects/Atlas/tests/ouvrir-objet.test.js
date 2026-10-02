import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionOuverture } from '../lib/ouvrir-objet.js';

test('en édition : la fiche, sauf pour une couche distante qui n’a rien à éditer', () => {
  assert.equal(decisionOuverture({ lecture: false }), 'fiche');
  assert.equal(decisionOuverture({ lecture: false, bulleActive: true }), 'fiche', 'la bulle est un geste de lecture');
  assert.equal(decisionOuverture({ lecture: false, distant: true }), 'popup');
});

test('en lecture : la bulle d’abord, puis la fiche de saisie, puis le popup', () => {
  assert.equal(decisionOuverture({ lecture: true, bulleActive: true, enSaisie: true }), 'bulle');
  assert.equal(decisionOuverture({ lecture: true, enSaisie: true }), 'fiche');
  assert.equal(decisionOuverture({ lecture: true }), 'popup');
});

test('pendant un récit, une étape qui propose des saisies ouvre la fiche, bulle ou non', () => {
  assert.equal(decisionOuverture({ lecture: true, bulleActive: true, enPresentation: true, saisiesEtape: true }), 'fiche');
  assert.equal(decisionOuverture({ lecture: true, bulleActive: true, enPresentation: true, saisiesEtape: false }), 'bulle');
  assert.equal(decisionOuverture({ lecture: true, bulleActive: true, enPresentation: false, saisiesEtape: true }), 'bulle', 'hors récit, la saisie d’étape ne compte pas');
});

test('un oubli de `lecture` se lit comme la lecture, jamais comme l’édition', () => {
  assert.equal(decisionOuverture(), 'popup');
  assert.equal(decisionOuverture({ bulleActive: true }), 'bulle');
  assert.equal(decisionOuverture({ lecture: false }), 'fiche', 'l’édition se demande explicitement');
});
