import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireCatalogue } from '../lib/catalogue-objets.js';
import { descripteursDuType } from '../lib/parametres-objet.js';
import { planFiger, typeColonne, FIGES_PAR_DEFAUT } from '../lib/parametres-figer.js';

const CAT = lireCatalogue(
  JSON.parse(readFileSync(new URL('../objets/catalog.json', import.meta.url), 'utf8')),
  'https://exemple.test/objets/catalog.json',
);
const mat = descripteursDuType(CAT.types.find((t) => t.id === 'mat_crosse'));
const entite = (rowId, properties = {}) => ({ rowId, properties });
const base = (entites, extra = {}) => planFiger({
  entites, descripteursDe: () => mat, typeIdDe: () => 'mat_crosse', colonnes: ['nom'], table: 'Luminaires', ...extra,
});
const action = (plan, nom, col) => plan.actions.find((a) => a[0] === nom && (col === undefined || a[2] === col || a[3]?.[col]));

test('par defaut on propose de figer ce qui decrit le luminaire, pas ses horaires supposes', () => {
  assert.deepEqual([...FIGES_PAR_DEFAUT], ['puissance', 'temperatureCouleur', 'hauteurFeu']);
});

test('les colonnes manquantes sont creees, avec leur type, puis remplies', () => {
  const plan = base([entite(1), entite(2)], { choisis: ['puissance', 'statut'] });
  const ajouts = plan.actions.filter((a) => a[0] === 'AddColumn');
  const parId = Object.fromEntries(ajouts.map((a) => [a[2], a[3]]));
  assert.deepEqual([parId.puissance.type, parId.statut.type], ['Numeric', 'Choice']);
  assert.deepEqual(JSON.parse(parId.statut.widgetOptions).choices.slice(0, 2), ['functional', 'decommissioned']);
  const maj = plan.actions.find((a) => a[0] === 'BulkUpdateRecord' && a[3].puissance);
  assert.deepEqual(maj, ['BulkUpdateRecord', 'Luminaires', [1, 2], { puissance: [38, 38] }]);
  assert.equal(plan.cellules, 4);
});

test('une colonne qui existe deja n est pas recreee', () => {
  const plan = base([entite(1)], { colonnes: ['nom', 'puissance'], choisis: ['puissance'] });
  assert.equal(plan.actions.filter((a) => a[0] === 'AddColumn').length, 0);
  assert.equal(plan.candidats.find((c) => c.id === 'puissance').creer, false);
});

test('une cellule deja remplie n est jamais ecrasee', () => {
  const plan = base([entite(1, { puissance: 90 }), entite(2, { puissance: '' }), entite(3)], { colonnes: ['nom', 'puissance'], choisis: ['puissance'] });
  const maj = plan.actions.find((a) => a[0] === 'BulkUpdateRecord');
  assert.deepEqual(maj[2], [2, 3], 'la ligne 1 porte deja une puissance');
});

test('une valeur lue dans un champ de l objet n est pas dupliquee dans la table', () => {
  const plan = base([entite(1, { height: '8' }), entite(2)], { colonnes: ['nom', 'height'], choisis: ['hauteurFeu'] });
  const maj = plan.actions.find((a) => a[0] === 'BulkUpdateRecord');
  assert.deepEqual(maj[2], [2], 'la ligne 1 lit deja « height »');
});

test('un reglage de couche est fige comme une valeur, un reglage d objet aussi', () => {
  const couche = { valeurs: { mat_crosse: { puissance: 60 } } };
  const plan = base([entite(1), entite(2, { _params: { puissance: 20 } })], { couche, choisis: ['puissance'] });
  const maj = plan.actions.find((a) => a[0] === 'BulkUpdateRecord');
  assert.deepEqual(maj[3].puissance, [60, 20]);
  assert.deepEqual(plan.candidats.find((c) => c.id === 'puissance').origines, { couche: 1, objet: 1 });
});

test('un champ lie recoit les valeurs a la place du nom du parametre', () => {
  const couche = { liaisons: { puissance: 'watts' } };
  const plan = base([entite(1)], { couche, colonnes: ['nom', 'watts'], choisis: ['puissance'] });
  assert.equal(plan.actions.filter((a) => a[0] === 'AddColumn').length, 0);
  assert.deepEqual(plan.actions.find((a) => a[0] === 'BulkUpdateRecord')[3], { watts: [38] });
});

test('le comportement est un reglage d Atlas : jamais ecrit dans la table', () => {
  const couche = { valeurs: { '*': { comportement: 'toujours' } } };
  const plan = base([entite(1)], { couche });
  assert.equal(plan.candidats.some((c) => c.id === 'comportement'), false);
  assert.equal(plan.actions.some((a) => JSON.stringify(a).includes('comportement')), false);
});

test('seuls les parametres choisis sont ecrits, tous sont proposes', () => {
  const plan = base([entite(1)], { choisis: ['puissance'] });
  assert.ok(plan.candidats.length > 1);
  assert.deepEqual(plan.actions.filter((a) => a[0] === 'BulkUpdateRecord').map((a) => Object.keys(a[3])[0]), ['puissance']);
});

test('sans choix explicite, tout ce qui est candidat est planifie', () => {
  const plan = base([entite(1)]);
  assert.ok(plan.actions.filter((a) => a[0] === 'AddColumn').length >= 4);
});

test('une entite sans ligne n est pas ecrite', () => {
  const plan = base([{ rowId: null, properties: {} }, { properties: {} }, entite(7)], { choisis: ['puissance'] });
  assert.deepEqual(plan.actions.find((a) => a[0] === 'BulkUpdateRecord')[2], [7]);
});

test('une date saisie devient des secondes a minuit UTC', () => {
  const couche = { valeurs: { '*': { valideDe: '2024-05-01' } } };
  const plan = base([entite(1)], { couche, choisis: ['valideDe'] });
  assert.deepEqual(plan.actions.find((a) => a[0] === 'BulkUpdateRecord')[3], { valideDe: [1714521600] });
  assert.equal(plan.actions.find((a) => a[0] === 'AddColumn')[3].type, 'Date');
});

test('rien a figer : aucune action, sans erreur', () => {
  const plein = entite(1, { puissance: 50, temperatureCouleur: 3000, hauteurFeu: 6, statut: 'functional' });
  const plan = base([plein, ...[]], { colonnes: ['nom', 'puissance', 'temperatureCouleur', 'hauteurFeu', 'statut'], choisis: ['puissance', 'temperatureCouleur', 'hauteurFeu', 'statut'] });
  assert.equal(plan.cellules, 0);
  assert.deepEqual(plan.actions, []);
  assert.deepEqual(base([], {}).actions, []);
  assert.deepEqual(base(null, {}).candidats, []);
});

test('le type de colonne suit le type du parametre', () => {
  assert.equal(typeColonne({ kind: 'number' }), 'Numeric');
  assert.equal(typeColonne({ kind: 'choice' }), 'Choice');
  assert.equal(typeColonne({ kind: 'date' }), 'Date');
  assert.equal(typeColonne({ kind: 'heure' }), 'Text');
  assert.equal(typeColonne(null), 'Text');
});
