import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tableReferencee, candidatsReference, analyserReference, entreesReference,
  categoriesDepuisReference, expressionRang, expressionIcone, idImage,
} from '../lib/table-reference.js';

// Forme d'un document reel de suivi d'ouvrages (01/10/2026), valeurs reformulees.
const SCHEMA = {
  Ouvrages: [
    { colId: 'Nom', type: 'Text' }, { colId: 'Type', type: 'Ref:Types' },
    { colId: 'Etat', type: 'Text', isFormula: true }, { colId: 'Latitude_WGS84', type: 'Numeric' },
  ],
  Etats: [
    { colId: 'Etat_possible', type: 'Text' }, { colId: 'Url_etat', type: 'Text' },
    { colId: 'Couleur_libelle', type: 'Text' }, { colId: 'Png_etat', type: 'Attachments' },
    { colId: 'Gravite', type: 'Numeric' },
  ],
  Types: [{ colId: 'Type_possible', type: 'Text' }, { colId: 'Url_schema', type: 'Text' }, { colId: 'Periode', type: 'Text' }],
  Agents: [{ colId: 'Agent', type: 'Text' }],
  Atlas_LayerPrefs: [{ colId: 'Color', type: 'Text' }],
};
const ETATS = [
  { id: 1, Etat_possible: 'A_Bon état', Url_etat: '', Couleur_libelle: '#90EE90', Gravite: 0 },
  { id: 2, Etat_possible: 'B_État moyen', Url_etat: '', Couleur_libelle: '#FFFF00', Gravite: 1 },
  { id: 3, Etat_possible: 'D_État critique', Url_etat: 'https://img.exemple/critique.png', Couleur_libelle: '#FF0000', Gravite: 3 },
  { id: 4, Etat_possible: 'E_Travaux', Url_etat: 'https://img.exemple/travaux.png', Couleur_libelle: '#0000ff', Gravite: 5 },
];
const TYPES = [
  { id: 1, Type_possible: 'Pont maçonnerie', Url_schema: 'https://img.exemple/pont.png', Periode: '12' },
  { id: 2, Type_possible: 'Passerelle bois', Url_schema: 'https://img.exemple/passerelle.png', Periode: '12' },
];

test('un Ref designe sa table ; un texte, les tables qui parlent couleur, rang ou image', () => {
  assert.equal(tableReferencee('Ref:Types'), 'Types');
  assert.equal(tableReferencee('RefList:Types'), null);
  assert.deepEqual(candidatsReference(SCHEMA, 'Ouvrages', 'Type'), [{ table: 'Types', parReference: true }]);
  const parTexte = candidatsReference(SCHEMA, 'Ouvrages', 'Etat').map((c) => c.table);
  assert.ok(parTexte.includes('Etats') && parTexte.includes('Types'));
  assert.ok(!parTexte.includes('Agents'), 'rien qui parle apparence');
  assert.ok(!parTexte.includes('Atlas_LayerPrefs'), 'jamais une table d’Atlas');
});

test('par libelle : la colonne cle couvre les valeurs, et l’on trouve couleur, gravite, image', () => {
  const ref = analyserReference(SCHEMA.Etats, ETATS, ['A_Bon état', 'D_État critique', 'E_Travaux'], false);
  assert.equal(ref.cle, 'Etat_possible');
  assert.equal(ref.couleur, 'Couleur_libelle');
  assert.equal(ref.rang, 'Gravite');
  assert.equal(ref.icone, 'Url_etat', 'une image sur deux suffit');
  assert.equal(analyserReference(SCHEMA.Etats, ETATS, ['Autre chose', 'Encore autre'], false), null, 'ne couvre pas');
});

test('par reference : la cle est l’identifiant, le libelle la premiere colonne de texte', () => {
  const ref = analyserReference(SCHEMA.Types, TYPES, [1, 2], true);
  assert.equal(ref.cle, 'id');
  assert.equal(ref.icone, 'Url_schema');
  assert.equal(ref.libelle, 'Type_possible');
  assert.equal(ref.couleur, null);
  const e = entreesReference(TYPES, ref);
  assert.equal(e.get('1').libelle, 'Pont maçonnerie');
  assert.equal(e.get('2').icone, 'https://img.exemple/passerelle.png');
});

test('les categories se rangent par gravite, et portent leur libelle', () => {
  // Une valeur sur quatre absente : la table couvre 75 %, sous le seuil — on
  // l'analyse sur les valeurs qu'elle connait, l'inconnue garde le repli.
  assert.equal(analyserReference(SCHEMA.Etats, ETATS, ['E_Travaux', 'A_Bon état', 'D_État critique', 'Inconnu'], false), null);
  const ref = analyserReference(SCHEMA.Etats, ETATS, ['E_Travaux', 'A_Bon état', 'D_État critique'], false);
  const cats = categoriesDepuisReference(entreesReference(ETATS, ref), ['E_Travaux', 'A_Bon état', 'D_État critique', 'Inconnu']);
  assert.deepEqual(cats.map((c) => c.value), ['A_Bon état', 'D_État critique', 'E_Travaux', 'Inconnu']);
  assert.equal(cats[1].color, '#FF0000');
  assert.equal(cats[3].color, '#999999', 'une valeur absente de la table garde le repli');
});

test('MapLibre recoit le rang et l’icone par valeur', () => {
  const ref = analyserReference(SCHEMA.Etats, ETATS, ['A_Bon état', 'E_Travaux'], false);
  const e = entreesReference(ETATS, ref);
  const rang = expressionRang('Etat', e);
  assert.deepEqual(rang.slice(0, 2), ['match', ['to-string', ['get', 'Etat']]]);
  assert.equal(rang[rang.indexOf('E_Travaux') + 1], 5);
  assert.equal(rang[rang.length - 1], -1, 'sans rang : dessous');
  const ico = expressionIcone('Etat', e);
  assert.equal(ico[ico.indexOf('D_État critique') + 1], idImage('https://img.exemple/critique.png'));
  assert.equal(ico[ico.length - 1], '');
  assert.equal(idImage('https://a/b.png'), idImage('https://a/b.png'));
  assert.match(idImage('https://a/b.png'), /^atlas-ico-[0-9a-f]+$/);
  assert.equal(expressionIcone('Etat', new Map()), '', 'aucune image : pas d’icone');
});
