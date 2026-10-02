import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POSTURES, categorieTable, tablesDesActions, creerDroits, apprendre,
  configurationEcrivable, posturesOffertes,
} from '../lib/droits-tables.js';
import { isWriteAclError } from '../lib/view-mode.js';

const REFUS = new Error('Blocked by table update access rules');

test('les tables d’Atlas disent la configuration, les autres un relevé', () => {
  for (const t of ['Atlas_LayerPrefs', 'Atlas_ScenePrefs', 'Atlas_Story', 'Maquette_Layers', 'Formulaires', 'atlas_story']) {
    assert.equal(categorieTable(t), 'configuration', t);
  }
  for (const t of ['Visites', 'Ouvrages', 'Atlas_Digues']) assert.equal(categorieTable(t), 'releve', t);
});

test('les tables d’un lot d’actions : sans doublon, sans les tables système', () => {
  assert.deepEqual(tablesDesActions([
    ['AddRecord', 'Visites', null, {}], ['UpdateRecord', 'Visites', 3, {}],
    ['AddRecord', 'Agents', null, {}], ['UpdateRecord', '_grist_Tables', 1, {}],
  ]), ['Visites', 'Agents']);
  assert.deepEqual(tablesDesActions([['AddTable', 'Atlas_Digues', []]]), ['Atlas_Digues']);
  assert.deepEqual(tablesDesActions(null), []);
  assert.deepEqual(tablesDesActions([null, [], 'x']), []);
});

test('au départ on ne sait rien, et cela n’interdit rien', () => {
  const d = creerDroits();
  assert.equal(d.verdict('Visites'), 'inconnu');
  assert.equal(d.refusees().size, 0);
});

test('une écriture réussie : écriture pour chaque table touchée', () => {
  const d = creerDroits();
  const r = apprendre(d, { actions: [['AddRecord', 'Visites', null, {}], ['AddRecord', 'Agents', null, {}]] });
  assert.deepEqual([r.verdict, r.attribue, r.change], ['ecriture', true, true]);
  assert.equal(d.verdict('Visites'), 'ecriture');
  assert.equal(d.verdict('Agents'), 'ecriture');
  assert.equal(apprendre(d, { actions: [['AddRecord', 'Visites', null, {}]] }).change, false, 'rien de nouveau');
});

test('un refus de droits sur UNE table : cette table refuse', () => {
  const d = creerDroits();
  const r = apprendre(d, { actions: [['AddRecord', 'Visites', null, {}]], erreur: REFUS, estRefusDeDroits: isWriteAclError });
  assert.deepEqual([r.verdict, r.attribue, r.change], ['refus', true, true]);
  assert.equal(d.verdict('Visites'), 'refus');
  assert.deepEqual([...d.refusees()], ['Visites']);
});

test('un refus sur plusieurs tables ne se met sur aucune : on ne sait pas laquelle', () => {
  const d = creerDroits();
  const r = apprendre(d, {
    actions: [['AddRecord', 'Visites', null, {}], ['AddRecord', 'Agents', null, {}]],
    erreur: REFUS, estRefusDeDroits: isWriteAclError,
  });
  assert.deepEqual([r.verdict, r.attribue, r.change], ['refus', false, false]);
  assert.equal(d.verdict('Visites'), 'inconnu');
  assert.equal(d.verdict('Agents'), 'inconnu');
});

test('une erreur qui n’est pas un refus d’accès n’apprend rien', () => {
  const d = creerDroits();
  for (const e of [new Error('Failed to fetch'), new Error('KeyError: Photo9'), new Error('HTTP 500')]) {
    const r = apprendre(d, { actions: [['AddRecord', 'Visites', null, {}]], erreur: e, estRefusDeDroits: isWriteAclError });
    assert.equal(r.verdict, null, e.message);
  }
  assert.equal(d.verdict('Visites'), 'inconnu');
});

test('un verdict se corrige : un refus ancien cède à une écriture réussie', () => {
  const d = creerDroits();
  apprendre(d, { actions: [['AddRecord', 'Visites', null, {}]], erreur: REFUS, estRefusDeDroits: isWriteAclError });
  assert.equal(d.verdict('Visites'), 'refus');
  apprendre(d, { actions: [['AddRecord', 'Visites', null, {}]] });
  assert.equal(d.verdict('Visites'), 'ecriture', 'les règles ont pu changer');
  assert.equal(d.refusees().size, 0);
});

test('la casse des noms ne compte pas, comme dans Grist', () => {
  const d = creerDroits();
  d.noter('Visites', 'refus');
  assert.equal(d.verdict('visites'), 'refus');
});

test('une lecture seule annoncée par Grist refuse tout, sans discussion', () => {
  const d = creerDroits({ lectureSeule: true });
  assert.equal(d.verdict('Visites'), 'refus');
  assert.equal(configurationEcrivable(d), false);
  assert.deepEqual(posturesOffertes({ droits: d, documentOuvert: true, tablesDeReleve: ['Visites'] }), ['lecture']);
});

test('la configuration : écrivable tant qu’une table de configuration se laisse écrire', () => {
  const d = creerDroits();
  assert.equal(configurationEcrivable(d), true, 'on ne sait rien');
  d.noter('Atlas_LayerPrefs', 'refus');
  assert.equal(configurationEcrivable(d), false, 'tout ce qu’on sait refuse');
  d.noter('Atlas_Story', 'ecriture');
  assert.equal(configurationEcrivable(d), true, 'un refus partiel laisse Préparer utile');
});

test('les postures offertes : lecture toujours, le reste d’après ce qu’on sait', () => {
  const d = creerDroits();
  const offertes = (o = {}) => posturesOffertes({ droits: d, documentOuvert: true, tablesDeReleve: ['Visites'], ...o });
  assert.deepEqual(offertes(), ['preparer', 'exploiter', 'lecture']);
  assert.deepEqual(offertes({ documentOuvert: false }), ['lecture']);
  assert.deepEqual(offertes({ sceneExterne: true }), ['lecture']);
  assert.deepEqual(offertes({ tablesDeReleve: [] }), ['preparer', 'lecture'], 'sans formulaire proposé, rien à exploiter');
  d.noter('Visites', 'refus');
  assert.deepEqual(offertes(), ['preparer', 'lecture'], 'la table de relevé refuse : plus d’exploitation');
  assert.deepEqual(offertes({ tablesDeReleve: ['Visites', 'Observations'] }), ['preparer', 'exploiter', 'lecture'], 'une autre table reste');
});

test('un agent qui n’écrit que les relevés : Exploiter reste offert, Préparer s’efface', () => {
  const d = creerDroits();
  // La sonde de départ vise une table de configuration et se fait refuser.
  d.noter('Atlas_LayerPrefs', 'refus');
  d.noter('Atlas_Story', 'refus');
  d.noter('Atlas_ScenePrefs', 'refus');
  assert.deepEqual(posturesOffertes({ droits: d, documentOuvert: true, tablesDeReleve: ['Visites'] }), ['exploiter', 'lecture']);
});

test('les trois postures sont nommées', () => {
  assert.deepEqual([...POSTURES], ['preparer', 'exploiter', 'lecture']);
});
