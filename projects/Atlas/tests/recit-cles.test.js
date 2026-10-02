import test from 'node:test';
import assert from 'node:assert/strict';
import {
  creerCle, cleHeritee, assurerCles, lireLignesRecit, planifierEcritureRecit, baseDepuisLignes, signature,
} from '../lib/recit-cles.js';

const ligne = (id, cle, step, title, text = '', stateJson = '{}') => ({ id, cle, step, title, text, stateJson });
const etape = (cle, title, text = '', state = {}) => ({ cle, title, text, state });
const sigDe = (rang, e) => signature({ step: rang, title: e.title, text: e.text, stateJson: JSON.stringify(e.state || {}) });

test('une cle neuve ne reprend jamais une cle existante', () => {
  const vues = new Set(['e-00000000']);
  assert.notEqual(creerCle(vues, () => 0), 'e-00000000');
  assert.match(creerCle(new Set()), /^e-[0-9a-z]{8}$/);
});

test('une ligne ancienne recoit une cle deterministe : deux lecteurs donnent la meme', () => {
  assert.equal(cleHeritee(3), 'h-3');
  const a = lireLignesRecit([ligne(10, '', 1, 'A'), ligne(11, '', 2, 'B')]);
  const b = lireLignesRecit([ligne(10, '', 1, 'A'), ligne(11, '', 2, 'B')]);
  assert.deepEqual(a.lignes.map((l) => l.cle), ['h-1', 'h-2']);
  assert.deepEqual(a.lignes.map((l) => l.cle), b.lignes.map((l) => l.cle));
  assert.equal(a.sansCle, 2);
});

test('deux lignes de meme cle n en font qu une, la plus recente ; l autre est un reliquat', () => {
  const lues = lireLignesRecit([ligne(1, 'x', 1, 'vieille'), ligne(5, 'x', 1, 'recente'), ligne(2, 'y', 2, 'B')]);
  assert.deepEqual(lues.lignes.map((l) => l.title), ['recente', 'B']);
  assert.deepEqual(lues.doublons, [1]);
});

test('deux etapes ajoutees au meme rang par deux editeurs ne s effacent plus', () => {
  // L'ancienne lecture dédupliquait PAR RANG : l'une des deux disparaissait.
  const lues = lireLignesRecit([ligne(1, 'a', 1, 'A'), ligne(2, 'b', 2, 'Bob'), ligne(3, 'c', 2, 'Camille')]);
  assert.deepEqual(lues.lignes.map((l) => l.title), ['A', 'Bob', 'Camille']);
});

test('assurerCles : pose les cles manquantes et renomme les copies', () => {
  const r = [{ title: 'a' }, { cle: 'k', title: 'b' }, { cle: 'k', title: 'copie de b' }];
  assurerCles(r);
  assert.equal(new Set(r.map((s) => s.cle)).size, 3);
  assert.equal(r[1].cle, 'k', 'la premiere garde sa cle');
  assert.notEqual(r[2].cle, 'k');
});

test('rien de change : aucune ecriture', () => {
  const lignes = [ligne(1, 'a', 1, 'A', 't', '{"x":1}'), ligne(2, 'b', 2, 'B')];
  const locales = [etape('a', 'A', 't', { x: 1 }), etape('b', 'B')];
  const { actions } = planifierEcritureRecit({ locales, lignes, base: baseDepuisLignes(lignes) });
  assert.deepEqual(actions, []);
});

test('une etape modifiee ici : seul ce champ part, dans une mise a jour de SA ligne', () => {
  const lignes = [ligne(1, 'a', 1, 'A'), ligne(2, 'b', 2, 'B')];
  const { actions, ecrit } = planifierEcritureRecit({
    locales: [etape('a', 'A'), etape('b', 'B modifiee')], lignes, base: baseDepuisLignes(lignes),
  });
  assert.deepEqual(actions, [['UpdateRecord', 'Atlas_Story', 2, { Title: 'B modifiee' }]]);
  assert.equal(ecrit.modifiees, 1);
});

test('une etape ajoutee ici : ajoutee, avec sa cle et son rang', () => {
  const lignes = [ligne(1, 'a', 1, 'A')];
  const { actions } = planifierEcritureRecit({
    locales: [etape('a', 'A'), etape('n', 'Nouvelle', 'txt', { z: 1 })], lignes, base: baseDepuisLignes(lignes),
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0][0], 'BulkAddRecord');
  assert.deepEqual(actions[0][3].Cle, ['n']);
  assert.deepEqual(actions[0][3].Step, [2]);
  assert.deepEqual(actions[0][3].StateJSON, ['{"z":1}']);
});

test('une etape retiree ici : retiree, et seulement celle-la', () => {
  const lignes = [ligne(1, 'a', 1, 'A'), ligne(2, 'b', 2, 'B'), ligne(3, 'c', 3, 'C')];
  const { actions } = planifierEcritureRecit({
    locales: [etape('a', 'A'), etape('c', 'C')], lignes, base: baseDepuisLignes(lignes),
  });
  const retraits = actions.filter((a) => a[0] === 'BulkRemoveRecord');
  assert.deepEqual(retraits, [['BulkRemoveRecord', 'Atlas_Story', [2]]]);
  // C passe du rang 3 au rang 2 : son rang est mis a jour, pas sa ligne recreee.
  assert.deepEqual(actions.filter((a) => a[0] === 'UpdateRecord'), [['UpdateRecord', 'Atlas_Story', 3, { Step: 2 }]]);
});

test('une etape ajoutee par un autre depuis notre lecture n est jamais touchee', () => {
  const lu = [ligne(1, 'a', 1, 'A')];
  const base = baseDepuisLignes(lu);
  const doc = [...lu, ligne(2, 'autre', 2, 'Ajoutee ailleurs')];
  const { actions } = planifierEcritureRecit({ locales: [etape('a', 'A modifiee')], lignes: doc, base });
  assert.deepEqual(actions, [['UpdateRecord', 'Atlas_Story', 1, { Title: 'A modifiee' }]],
    'ni retrait ni ecrasement de l etape d un autre');
});

test('une etape modifiee ailleurs et pas ici garde la modification de l autre', () => {
  const lu = [ligne(1, 'a', 1, 'A'), ligne(2, 'b', 2, 'B')];
  const base = baseDepuisLignes(lu);
  const doc = [ligne(1, 'a', 1, 'A'), ligne(2, 'b', 2, 'B corrigee par un autre')];
  const { actions } = planifierEcritureRecit({ locales: [etape('a', 'A changee ici'), etape('b', 'B')], lignes: doc, base });
  assert.deepEqual(actions, [['UpdateRecord', 'Atlas_Story', 1, { Title: 'A changee ici' }]]);
});

test('modifiee des deux cotes : la notre l emporte', () => {
  const lu = [ligne(1, 'a', 1, 'A')];
  const base = baseDepuisLignes(lu);
  const doc = [ligne(1, 'a', 1, 'A par un autre')];
  const { actions } = planifierEcritureRecit({ locales: [etape('a', 'A par nous')], lignes: doc, base });
  assert.deepEqual(actions, [['UpdateRecord', 'Atlas_Story', 1, { Title: 'A par nous' }]]);
});

test('retiree ici mais modifiee ailleurs depuis : elle reste', () => {
  const lu = [ligne(1, 'a', 1, 'A'), ligne(2, 'b', 2, 'B')];
  const base = baseDepuisLignes(lu);
  const doc = [ligne(1, 'a', 1, 'A'), ligne(2, 'b', 2, 'B retouchee')];
  const { actions } = planifierEcritureRecit({ locales: [etape('a', 'A')], lignes: doc, base });
  assert.deepEqual(actions, []);
});

test('retiree ailleurs et pas changee ici : on respecte ce retrait ; changee ici : elle revient', () => {
  const lu = [ligne(1, 'a', 1, 'A'), ligne(2, 'b', 2, 'B')];
  const base = baseDepuisLignes(lu);
  const doc = [ligne(1, 'a', 1, 'A')];
  const intacte = planifierEcritureRecit({ locales: [etape('a', 'A'), etape('b', 'B')], lignes: doc, base });
  assert.deepEqual(intacte.actions, []);
  const changee = planifierEcritureRecit({ locales: [etape('a', 'A'), etape('b', 'B retouchee')], lignes: doc, base });
  assert.equal(changee.actions[0][0], 'BulkAddRecord');
  assert.deepEqual(changee.actions[0][3].Cle, ['b']);
});

test('base inconnue : on ecrit ce qui differe, on ne retire jamais rien', () => {
  const doc = [ligne(1, 'a', 1, 'A'), ligne(2, 'b', 2, 'B')];
  const { actions } = planifierEcritureRecit({ locales: [etape('a', 'A2')], lignes: doc, base: null });
  assert.deepEqual(actions, [['UpdateRecord', 'Atlas_Story', 1, { Title: 'A2' }]]);
});

test('migration : les lignes sans cle recoivent la leur, sans toucher a leur contenu', () => {
  const doc = [ligne(1, '', 1, 'A'), ligne(2, '', 2, 'B')];
  const base = baseDepuisLignes(doc);
  const lues = lireLignesRecit(doc);
  const locales = lues.lignes.map((l) => etape(l.cle, l.title));
  const { actions } = planifierEcritureRecit({ locales, lignes: doc, base, colonneCle: true });
  assert.deepEqual(actions, [
    ['UpdateRecord', 'Atlas_Story', 1, { Cle: 'h-1' }],
    ['UpdateRecord', 'Atlas_Story', 2, { Cle: 'h-2' }],
  ]);
});

test('la colonne Cle absente est ajoutee, dans le meme lot', () => {
  const doc = [ligne(1, '', 1, 'A')];
  const { actions } = planifierEcritureRecit({
    locales: [etape('h-1', 'A')], lignes: doc, base: baseDepuisLignes(doc), colonneCle: false,
  });
  assert.deepEqual(actions[0], ['AddColumn', 'Atlas_Story', 'Cle', { type: 'Text', label: 'Clé' }]);
  assert.deepEqual(actions[1], ['UpdateRecord', 'Atlas_Story', 1, { Cle: 'h-1' }]);
});

test('les reliquats en double sont retires', () => {
  const doc = [ligne(1, 'a', 1, 'vieille'), ligne(4, 'a', 1, 'A')];
  const { actions } = planifierEcritureRecit({ locales: [etape('a', 'A')], lignes: doc, base: baseDepuisLignes(doc) });
  assert.deepEqual(actions, [['BulkRemoveRecord', 'Atlas_Story', [1]]]);
});

test('la base apres ecriture suit ce qui a ete ecrit', () => {
  const doc = [ligne(1, 'a', 1, 'A'), ligne(2, 'b', 2, 'B')];
  const e1 = etape('a', 'A2');
  const { base } = planifierEcritureRecit({ locales: [e1], lignes: doc, base: baseDepuisLignes(doc) });
  assert.equal(base.get('a'), sigDe(1, e1));
  assert.equal(base.has('b'), false, 'retiree : plus dans la base');
});
