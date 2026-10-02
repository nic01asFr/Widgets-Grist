import test from 'node:test';
import assert from 'node:assert/strict';
import { LIBELLES, postureDepuis, etatDePosture, postureParDefaut, POSTURES } from '../lib/posture.js';
import { creerDroits, configurationEcrivable, posturesOffertes } from '../lib/droits-tables.js';

test('les deux booléens disent une posture, et chaque posture dit les deux booléens', () => {
  assert.equal(postureDepuis({ viewMode: false, peutSaisir: true }), 'preparer');
  assert.equal(postureDepuis({ viewMode: true, peutSaisir: true }), 'exploiter');
  assert.equal(postureDepuis({ viewMode: true, peutSaisir: false }), 'lecture');
  for (const p of POSTURES) assert.equal(postureDepuis(etatDePosture(p)), p, `aller-retour ${p}`);
  assert.deepEqual(etatDePosture('inconnue'), { viewMode: true, peutSaisir: false }, 'le doute est la lecture');
});

test('chaque posture est nommée et expliquée', () => {
  for (const p of POSTURES) {
    assert.ok(LIBELLES[p].nom && LIBELLES[p].badge && LIBELLES[p].aide, p);
  }
});

test('l’ouverture : le choix retenu d’abord, s’il est encore offert', () => {
  assert.equal(postureParDefaut({ offertes: ['preparer', 'exploiter', 'lecture'], memorisee: 'lecture', initiale: 'preparer' }), 'lecture');
  assert.equal(postureParDefaut({ offertes: ['exploiter', 'lecture'], memorisee: 'preparer', initiale: 'lecture' }), 'lecture',
    'un choix retenu ne rouvre jamais une posture que les droits ne proposent plus');
});

test('l’ouverture : dans l’application, Exploiter si elle est offerte', () => {
  assert.equal(postureParDefaut({ offertes: ['preparer', 'exploiter', 'lecture'], initiale: 'preparer', application: true }), 'exploiter');
  assert.equal(postureParDefaut({ offertes: ['preparer', 'lecture'], initiale: 'preparer', application: true }), 'preparer',
    'rien à exploiter : l’ouverture reste ce qu’elle était');
  assert.equal(postureParDefaut({ offertes: ['preparer', 'exploiter', 'lecture'], initiale: 'preparer', application: false }), 'preparer',
    'dans le widget, l’ouverture est respectée');
});

test('l’ouverture : sans rien d’offert, ou avec du douteux, la lecture', () => {
  assert.equal(postureParDefaut({ offertes: [] }), 'lecture');
  assert.equal(postureParDefaut({ offertes: ['x'], memorisee: 'x' }), 'lecture');
  assert.equal(postureParDefaut({ offertes: ['exploiter', 'lecture'], initiale: 'preparer' }), 'exploiter', 'première offerte');
});

test('un refus franc de la sonde retire Préparer, et laisse Exploiter aux agents de relevé', () => {
  const d = creerDroits();
  d.refuserPreparation();   // la sonde de départ a été refusée
  assert.equal(configurationEcrivable(d), false);
  assert.deepEqual(posturesOffertes({ droits: d, documentOuvert: true, tablesDeReleve: ['Visites'] }), ['exploiter', 'lecture']);
  // Sans formulaire proposé, rien à exploiter : Lecture seule.
  assert.deepEqual(posturesOffertes({ droits: d, documentOuvert: true, tablesDeReleve: [] }), ['lecture']);
});

test('une écriture réussie dans la configuration lève le refus de préparation', () => {
  const d = creerDroits();
  d.refuserPreparation();
  d.noter('Visites', 'ecriture');
  assert.equal(d.preparationRefusee, true, 'un relevé ne dit rien de la configuration');
  d.noter('Atlas_LayerPrefs', 'ecriture');
  assert.equal(d.preparationRefusee, false);
  assert.equal(configurationEcrivable(d), true);
});

test('un lien ?mode=view plafonne les postures : il retire Préparer, il n’ajoute rien', () => {
  const d = creerDroits();
  const base = { droits: d, documentOuvert: true, tablesDeReleve: ['Visites'] };
  assert.deepEqual(posturesOffertes({ ...base }), ['preparer', 'exploiter', 'lecture']);
  assert.deepEqual(posturesOffertes({ ...base, plafond: 'exploiter' }), ['exploiter', 'lecture']);
  assert.deepEqual(posturesOffertes({ ...base, plafond: 'lecture' }), ['lecture']);
  // Sans rien à exploiter, le plafond ne rouvre pas Préparer : Lecture seule.
  assert.deepEqual(posturesOffertes({ ...base, tablesDeReleve: [], plafond: 'exploiter' }), ['lecture']);
  // Et il n'ajoute jamais : une personne sans droit de relevé n'obtient pas Exploiter.
  const ferme = creerDroits({ lectureSeule: true });
  assert.deepEqual(posturesOffertes({ ...base, droits: ferme, plafond: 'exploiter' }), ['lecture']);
});

test('l ouverture sous plafond ne retombe pas en Préparer, même avec un choix retenu', () => {
  const offertes = ['exploiter', 'lecture'];
  assert.equal(postureParDefaut({ offertes, memorisee: 'preparer', initiale: 'exploiter' }), 'exploiter');
  // Rien d'exploitable : la lecture, jamais l'édition que le lien écartait.
  assert.equal(postureParDefaut({ offertes: ['lecture'], memorisee: 'preparer', initiale: 'exploiter' }), 'lecture');
});
