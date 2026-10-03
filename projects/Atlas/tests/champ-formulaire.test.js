import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  TYPES_CHAMP, idColonneDepuisLibelle, lireChoix, planColonne, planAjoutChamp, planReleveLie,
  champDepuisPlan, defAvecChamp, defPourReleve, phraseAjoutChamp, phraseReleveLie, messageRefusChamp,
  COLONNE_OBJET, COLONNE_DATE, SOURCES_POINT, COLONNES_POINT, LIBELLES_SOURCE, sourcesRetenues,
  GEOMETRIES, SOURCES_PAR_GEOMETRIE, COLONNES_FORME, colonnesDeGeometrie, libelleSource, fuseauLocal, estTypeDate, indexDatePrincipale,
} from '../lib/champ-formulaire.js';
import { creerScene, appliquerActions, metaColonnes, metaTables } from '../lib/scene-locale.js';
import { formulairesPourCouche, departsProposes } from '../lib/fiche-formulaire.js';
import { colonnesNouvelleCouche, actionsNouvelleCouche } from '../lib/nouvelle-couche.js';
import { schemaDepuisMeta } from '../lib/schema-grist.js';

const require = createRequire(import.meta.url);
const Derivation = require('../../grist_forms/shared/formdef-from-table.js');
// Le module de fiche lit la dérivation sur `window`, comme dans la page.
globalThis.window = globalThis.window || {};
globalThis.window.FormDefFromTable = Derivation;

/* ---------- l'identifiant d'une colonne ---------- */

test('un libellé devient un identifiant Grist propre', () => {
  assert.equal(idColonneDepuisLibelle('Hauteur du fût (m)'), 'Hauteur_du_fut_m');
  assert.equal(idColonneDepuisLibelle('  état général  '), 'Etat_general');
  assert.equal(idColonneDepuisLibelle('œuf'), 'Oeuf');
});

test('un libellé sans lettre ni chiffre ne donne rien', () => {
  assert.equal(idColonneDepuisLibelle('— ? —'), '');
  assert.equal(idColonneDepuisLibelle(''), '');
});

test('un identifiant ne commence pas par un chiffre', () => {
  assert.equal(idColonneDepuisLibelle('2024 comptage'), 'Champ_2024_comptage');
});

test('les noms que Grist garde pour lui sont évités', () => {
  assert.equal(idColonneDepuisLibelle('id'), 'Champ_Id');
  assert.equal(idColonneDepuisLibelle('manualSort'), 'Champ_ManualSort');
  assert.equal(idColonneDepuisLibelle('_cache'), 'Cache');
  assert.equal(idColonneDepuisLibelle('gristHelper_x'), 'Champ_GristHelper_x');
});

test('un mot de Python reçoit un souligné', () => {
  assert.equal(idColonneDepuisLibelle('None'), 'None_');
  assert.equal(idColonneDepuisLibelle('true'), 'True_');
});

test('un identifiant déjà pris, quelle que soit la casse, reçoit un rang', () => {
  assert.equal(idColonneDepuisLibelle('Nom', ['nom']), 'Nom_2');
  assert.equal(idColonneDepuisLibelle('Nom', ['nom', 'Nom_2']), 'Nom_3');
});

test('un identifiant reste lisible : longueur bornée, pas de souligné final', () => {
  const id = idColonneDepuisLibelle('a'.repeat(100));
  assert.ok(id.length <= 60);
  assert.ok(!id.endsWith('_'));
});

/* ---------- les choix ---------- */

test('les choix se lisent un par ligne ou séparés par des points-virgules, sans doublon', () => {
  assert.deepEqual(lireChoix('Bon\nMoyen;Mauvais\n  Bon  \n\n'), ['Bon', 'Moyen', 'Mauvais']);
});

test('une virgule ne sépare pas deux choix', () => {
  assert.deepEqual(lireChoix('Bon état, à surveiller\nHors service'), ['Bon état, à surveiller', 'Hors service']);
});

test('une liste de choix est acceptée aussi en tableau', () => {
  assert.deepEqual(lireChoix(['A', 'B', 'A', '']), ['A', 'B']);
});

/* ---------- une colonne ---------- */

test('chaque type proposé produit un type Grist connu du moteur de formulaire', () => {
  const connus = new Set(['Text', 'Int', 'Numeric', 'Bool', 'Date', 'DateTime', 'Choice', 'ChoiceList', 'Attachments']);
  for (const t of TYPES_CHAMP) assert.ok(connus.has(t.gType), t.id);
});

test('un champ texte', () => {
  const p = planColonne({ libelle: 'Observations', typeId: 'texte', colonnes: [{ colId: 'nom', label: 'Nom' }] });
  assert.deepEqual(p, { ok: true, colonne: { id: 'Observations', type: 'Text', label: 'Observations' } });
});

test('un champ à choix porte ses choix en options de colonne', () => {
  const p = planColonne({ libelle: 'État', typeId: 'choix', choix: 'Bon\nMoyen\nMauvais' });
  assert.equal(p.ok, true);
  assert.equal(p.colonne.type, 'Choice');
  assert.deepEqual(JSON.parse(p.colonne.widgetOptions).choices, ['Bon', 'Moyen', 'Mauvais']);
});

test('un choix demande au moins deux valeurs', () => {
  const p = planColonne({ libelle: 'État', typeId: 'choix', choix: 'Bon' });
  assert.equal(p.ok, false);
  assert.match(p.erreur, /deux choix/);
});

test('trop de choix sont refusés', () => {
  const p = planColonne({ libelle: 'Code', typeId: 'choix', choix: Array.from({ length: 61 }, (_, i) => `c${i}`) });
  assert.equal(p.ok, false);
});

test('un nom vide, un type inconnu, un nom sans lettre sont refusés en le disant', () => {
  assert.match(planColonne({ libelle: ' ', typeId: 'texte' }).erreur, /nom au champ/);
  assert.match(planColonne({ libelle: 'x', typeId: 'bidule' }).erreur, /type/);
  assert.match(planColonne({ libelle: '???', typeId: 'texte' }).erreur, /lettre ou un chiffre/);
});

test('un champ qui existe déjà est refusé, sans tenir compte de la casse ni des accents', () => {
  const colonnes = [{ colId: 'Etat', label: 'État' }];
  assert.match(planColonne({ libelle: 'etat', typeId: 'texte', colonnes }).erreur, /existe déjà/);
  assert.match(planColonne({ libelle: 'ÉTAT', typeId: 'texte', colonnes }).erreur, /existe déjà/);
});

test('une colonne sans libellé propre est comparée par son identifiant', () => {
  const colonnes = [{ colId: 'Dist_eau_m', label: 'Dist_eau_m' }];
  assert.match(planColonne({ libelle: 'Dist eau m', typeId: 'entier', colonnes }).erreur, /existe déjà/);
});

test('un champ dont l\'identifiant serait celui d\'une colonne existante est refusé, même sous un autre libellé', () => {
  const p = planColonne({ libelle: 'Nom', typeId: 'texte', colonnes: [{ colId: 'nom', label: 'Appellation' }] });
  assert.equal(p.ok, false);
  assert.match(p.erreur, /existe déjà/);
});

/* ---------- ajouter un champ ---------- */

test('ajouter un champ : une seule AddColumn, sans formule', () => {
  const p = planAjoutChamp({ table: 'Arbres', libelle: 'Hauteur (m)', typeId: 'decimal', colonnes: [] });
  assert.equal(p.ok, true);
  assert.deepEqual(p.actions, [['AddColumn', 'Arbres', 'Hauteur_m', { type: 'Numeric', label: 'Hauteur (m)', isFormula: false }]]);
});

test('ajouter un champ sans table est refusé', () => {
  assert.equal(planAjoutChamp({ libelle: 'x', typeId: 'texte' }).ok, false);
});

/* ---------- un relevé lié ---------- */

const CHAMPS_RELEVE = [
  { libelle: 'Nombre d’insectes', typeId: 'entier' },
  { libelle: 'Météo', typeId: 'choix', choix: 'Dégagé\nCouvert\nPluie' },
  { libelle: 'Photos', typeId: 'photos' },
];

test('un relevé lié : une table, la référence à la couche, la date, puis les champs', () => {
  const p = planReleveLie({ nom: 'Relevé de nuit', coucheTable: 'Pieges', coucheNom: 'Pièges', champs: CHAMPS_RELEVE, tables: ['Pieges'] });
  assert.equal(p.ok, true);
  assert.equal(p.tableId, 'Releve_de_nuit');
  assert.equal(p.via, COLONNE_OBJET);
  assert.deepEqual(p.colonnes.map((c) => c.id), ['Objet', 'Date', 'Nombre_d_insectes', 'Meteo', 'Photos']);
  assert.equal(p.colonnes[0].type, 'Ref:Pieges');
  assert.equal(p.colonnes[0].label, 'Pièges');
  assert.equal(p.colonnes[1].type, 'Date');
  assert.equal(p.actions.length, 1);
  assert.equal(p.actions[0][0], 'AddTable');
  assert.equal(p.actions[0][1], 'Releve_de_nuit');
});

test('un relevé sans date si on ne la veut pas', () => {
  const p = planReleveLie({ nom: 'Visite', coucheTable: 'Arbres', champs: CHAMPS_RELEVE.slice(0, 1), dater: false });
  assert.deepEqual(p.colonnes.map((c) => c.id), ['Objet', 'Nombre_d_insectes']);
});

test('un relevé sans champ, sans nom ou sans couche est refusé', () => {
  assert.match(planReleveLie({ nom: 'Visite', coucheTable: 'A', champs: [] }).erreur, /au moins un champ/);
  assert.match(planReleveLie({ nom: ' ', coucheTable: 'A', champs: CHAMPS_RELEVE }).erreur, /nom au formulaire/);
  assert.match(planReleveLie({ nom: 'V', champs: CHAMPS_RELEVE }).erreur, /couche/);
});

test('une date seule ne fait pas un formulaire : la date est un champ comme un autre', () => {
  const p = planReleveLie({ nom: 'Visite', coucheTable: 'A', champs: [{ libelle: 'Date', typeId: 'date' }], dater: false });
  assert.equal(p.ok, false);
  assert.match(p.erreur, /en plus de la date/);
});

test('une date saisie comme champ ordinaire part du jour, sans réglage propre au formulaire', () => {
  const p = planReleveLie({
    nom: 'Visite', coucheTable: 'Pieges', dater: false,
    champs: [{ libelle: 'Date', typeId: 'date' }, { libelle: 'Remarques', typeId: 'texte' }],
  });
  assert.equal(p.ok, true);
  assert.deepEqual(p.colonnes.map((c) => c.id), ['Objet', 'Date', 'Remarques']);
  const def = defPourReleve(p, Derivation, { id: 'visite' });
  assert.deepEqual(departsProposes(def), { Date: 'aujourdhui' });
});

test('le nom du relevé évite une table existante', () => {
  const p = planReleveLie({ nom: 'Relevés', coucheTable: 'A', champs: CHAMPS_RELEVE.slice(0, 1), tables: ['Releves', 'Releves_2'] });
  assert.equal(p.tableId, 'Releves_3');
});

test('le nom du relevé n\'est jamais une table d\'Atlas', () => {
  const p = planReleveLie({ nom: 'Atlas Story', coucheTable: 'A', champs: CHAMPS_RELEVE.slice(0, 1) });
  assert.equal(p.tableId, 'Couche_Atlas_Story');
});

test('l\'erreur d\'un champ du relevé dit lequel', () => {
  const p = planReleveLie({ nom: 'V', coucheTable: 'A', champs: [{ libelle: 'État', typeId: 'choix', choix: 'x' }] });
  assert.equal(p.ok, false);
  assert.match(p.erreur, /^État : /);
});

test('un champ appelé Date est refusé quand le relevé est daté', () => {
  const p = planReleveLie({ nom: 'V', coucheTable: 'A', champs: [{ libelle: 'Remarques', typeId: 'texte' }, { libelle: 'Date', typeId: 'date' }] });
  assert.equal(p.ok, false);
  assert.match(p.erreur, /existe déjà/);
});

/* ---------- ce que le moteur de scène locale accepte ---------- */

test('une scène locale accepte la table du relevé, la référence et les choix', () => {
  const scene = creerScene({ id: 't', nom: 'Essai' });
  appliquerActions(scene, [['AddTable', 'Pieges', colonnesNouvelleCouche('Point')]]);
  const p = planReleveLie({ nom: 'Relevé', coucheTable: 'Pieges', coucheNom: 'Pièges', champs: CHAMPS_RELEVE, tables: Object.keys(scene.tables) });
  const { retValues } = appliquerActions(scene, p.actions);
  assert.equal(retValues[0].table_id, p.tableId);
  const cols = metaColonnes(scene);
  const i = cols.colId.indexOf('Objet');
  assert.equal(cols.type[i], 'Ref:Pieges');
  const m = cols.colId.indexOf('Meteo');
  assert.deepEqual(JSON.parse(cols.widgetOptions[m]).choices, ['Dégagé', 'Couvert', 'Pluie']);
});

test('une scène locale accepte un champ ajouté à une table qui a déjà des lignes', () => {
  const scene = creerScene({ id: 't', nom: 'Essai' });
  appliquerActions(scene, [
    ['AddTable', 'Arbres', colonnesNouvelleCouche('Point')],
    ['AddRecord', 'Arbres', null, { nom: 'Chêne', latitude: 43.3, longitude: 5.39 }],
  ]);
  const p = planAjoutChamp({ table: 'Arbres', libelle: 'Hauteur', typeId: 'decimal', colonnes: [{ colId: 'nom', label: 'Nom' }] });
  appliquerActions(scene, p.actions);
  assert.deepEqual(scene.tables.Arbres.data.Hauteur, [null]);
});

test('une scène locale refuse un deuxième champ du même identifiant, et le plan l\'évite', () => {
  const scene = creerScene({ id: 't', nom: 'Essai' });
  appliquerActions(scene, [['AddTable', 'Arbres', colonnesNouvelleCouche('Point')]]);
  const colonnes = () => metaColonnes(scene).colId.map((colId, i) => ({ colId, label: metaColonnes(scene).label[i] }));
  appliquerActions(scene, planAjoutChamp({ table: 'Arbres', libelle: 'Hauteur', typeId: 'decimal', colonnes: colonnes() }).actions);
  const deux = planAjoutChamp({ table: 'Arbres', libelle: 'Hauteur', typeId: 'entier', colonnes: colonnes() });
  assert.equal(deux.ok, false);
});

/* ---------- ce que la dérivation fait du résultat ---------- */

/** Le schéma que lirait la page : la vraie fonction, sur les métadonnées de la scène. */
const schemaDeLaScene = (scene) => schemaDepuisMeta(metaTables(scene), metaColonnes(scene));

test('le champ ajouté apparaît tout seul dans le formulaire « Fiche » de la couche', () => {
  const scene = creerScene({ id: 't', nom: 'Essai' });
  appliquerActions(scene, [['AddTable', 'Arbres', colonnesNouvelleCouche('Point')]]);
  const couche = { sourceTable: 'Arbres', geometryColumn: { lat: 'latitude', lng: 'longitude' } };
  const avant = formulairesPourCouche({ couche, entrees: [], schema: schemaDeLaScene(scene) });
  const champsAvant = avant[0].def.sections[0].fields.map((f) => f.colId);
  assert.deepEqual(champsAvant, ['nom']);

  const p = planAjoutChamp({ table: 'Arbres', libelle: 'État', typeId: 'choix', choix: 'Bon\nMoyen', colonnes: schemaDeLaScene(scene).Arbres });
  appliquerActions(scene, p.actions);
  const apres = formulairesPourCouche({ couche, entrees: [], schema: schemaDeLaScene(scene) });
  const champs = apres[0].def.sections[0].fields;
  assert.deepEqual(champs.map((f) => f.colId), ['nom', 'Etat']);
  assert.equal(champs[1].widget, 'select');
  assert.deepEqual(champs[1].options.choices, ['Bon', 'Moyen']);
});

test('le relevé créé apparaît tout seul sous « Ajouter une ligne », sans sa référence à l\'objet', () => {
  const scene = creerScene({ id: 't', nom: 'Essai' });
  appliquerActions(scene, [['AddTable', 'Pieges', colonnesNouvelleCouche('Point')]]);
  const p = planReleveLie({ nom: 'Relevé', coucheTable: 'Pieges', coucheNom: 'Pièges', champs: CHAMPS_RELEVE, tables: Object.keys(scene.tables) });
  appliquerActions(scene, p.actions);
  const couche = { sourceTable: 'Pieges', geometryColumn: { lat: 'latitude', lng: 'longitude' } };
  const forms = formulairesPourCouche({ couche, entrees: [], schema: schemaDeLaScene(scene) });
  const lie = forms.find((f) => !f.surLaCouche);
  assert.ok(lie, 'un formulaire lié');
  assert.equal(lie.tableId, 'Releve');
  assert.equal(lie.via, 'Objet');
  assert.equal(lie.derive, true);
  assert.deepEqual(lie.def.sections[0].fields.map((f) => f.colId), ['Date', 'Nombre_d_insectes', 'Meteo', 'Photos']);
});

/* ---------- les formulaires enregistrés ---------- */

test('un champ s\'ajoute à la fin d\'un formulaire enregistré, sans toucher l\'original', () => {
  const def = { id: 'f', title: 'F', tableId: 'Arbres', sections: [{ id: 'a', fields: [{ colId: 'nom' }] }, { id: 'b', fields: [{ colId: 'x' }] }] };
  const champ = { colId: 'Etat', label: 'État', type: 'Choice' };
  const neuf = defAvecChamp(def, champ);
  assert.deepEqual(neuf.sections[1].fields.map((f) => f.colId), ['x', 'Etat']);
  assert.deepEqual(def.sections[1].fields.map((f) => f.colId), ['x']);
});

test('un champ déjà présent n\'est pas ajouté deux fois', () => {
  const def = { id: 'f', tableId: 'A', sections: [{ id: 'a', fields: [{ colId: 'nom' }] }] };
  assert.equal(defAvecChamp(def, { colId: 'nom' }), def);
});

test('un formulaire enregistré sans section en reçoit une', () => {
  const neuf = defAvecChamp({ id: 'f', title: 'F', tableId: 'A', sections: [] }, { colId: 'Etat' });
  assert.equal(neuf.sections.length, 1);
  assert.deepEqual(neuf.sections[0].fields, [{ colId: 'Etat' }]);
});

test('le champ d\'un plan est celui que la dérivation fabriquerait', () => {
  const p = planColonne({ libelle: 'État', typeId: 'choix', choix: 'Bon\nMoyen' });
  const champ = champDepuisPlan(p.colonne, Derivation);
  assert.equal(champ.colId, 'Etat');
  assert.equal(champ.widget, 'select');
  assert.deepEqual(champ.options.choices, ['Bon', 'Moyen']);
});

test('la définition d\'un relevé neuf ne montre pas la référence à l\'objet', () => {
  const p = planReleveLie({ nom: 'Relevé de nuit', coucheTable: 'Pieges', champs: CHAMPS_RELEVE });
  const def = defPourReleve(p, Derivation, { id: 'releve-de-nuit' });
  assert.equal(def.id, 'releve-de-nuit');
  assert.equal(def.title, 'Relevé de nuit');
  assert.equal(def.tableId, p.tableId);
  assert.deepEqual(def.sections[0].fields.map((f) => f.colId), ['Date', 'Nombre_d_insectes', 'Meteo', 'Photos']);
});

/* ---------- les champs obligatoires ---------- */

test('un champ marqué obligatoire l\'est dans la définition du formulaire, pas dans la colonne', () => {
  const p = planReleveLie({
    nom: 'Visite', coucheTable: 'Pieges', dater: false,
    champs: [{ libelle: 'Date', typeId: 'date' }, { libelle: 'Remarques', typeId: 'texte', requis: true }, { libelle: 'Durée', typeId: 'entier' }],
  });
  assert.deepEqual(p.requis, ['Remarques']);
  assert.equal(p.colonnes.find((c) => c.id === 'Remarques').required, undefined, 'la colonne ne porte pas l\'obligation');
  const def = defPourReleve(p, Derivation, { id: 'visite' });
  const champs = def.sections[0].fields;
  assert.equal(champs.find((f) => f.colId === 'Remarques').required, true);
  assert.equal(champs.find((f) => f.colId === 'Duree').required, false);
  assert.equal(champs.find((f) => f.colId === 'Date').required, false);
});

test('sans champ obligatoire, la définition est celle que la dérivation donne', () => {
  const p = planReleveLie({ nom: 'Visite', coucheTable: 'Pieges', dater: false, champs: [{ libelle: 'Remarques', typeId: 'texte' }] });
  assert.deepEqual(p.requis, []);
  const def = defPourReleve(p, Derivation, { id: 'visite' });
  assert.ok(def.sections[0].fields.every((f) => f.required === false));
});

test('ajouter un champ obligatoire à un formulaire enregistré', () => {
  const p = planAjoutChamp({ table: 'Visites', libelle: 'Gravité', typeId: 'choix', choix: 'Mineur\nMajeur', requis: true });
  assert.equal(p.requis, true);
  const champ = champDepuisPlan(p.colonne, Derivation, { requis: p.requis });
  assert.equal(champ.required, true);
  const def = defAvecChamp({ id: 'f', tableId: 'Visites', sections: [{ id: 'main', fields: [] }] }, champ);
  assert.equal(def.sections[0].fields[0].required, true);
});

test('par défaut, un champ n\'est pas obligatoire', () => {
  const p = planAjoutChamp({ table: 'Visites', libelle: 'Remarques', typeId: 'texte' });
  assert.equal(p.requis, false);
  assert.equal(champDepuisPlan(p.colonne, Derivation).required, false);
});

/* ---------- la géométrie d'une ligne : une couche liée ---------- */

const CHAMPS_DESORDRE = [{ libelle: 'Date', typeId: 'date' }, { libelle: 'Gravité', typeId: 'choix', choix: 'Mineur\nMajeur' }, { libelle: 'Photo', typeId: 'photos' }];

test('les façons de poser un point sont trois, avec leurs mots', () => {
  assert.deepEqual([...SOURCES_POINT], ['carte', 'position', 'centre']);
  assert.deepEqual(Object.keys(LIBELLES_SOURCE), [...SOURCES_POINT]);
});

test('les sources retenues sont celles qui existent, sans doublon, dans l\'ordre proposé', () => {
  assert.deepEqual(sourcesRetenues(['centre', 'carte', 'carte', 'telepathie']), ['carte', 'centre']);
  assert.deepEqual(sourcesRetenues(undefined), []);
});

test('une géométrie par ligne ajoute les colonnes d\'un point, avant les champs', () => {
  const p = planReleveLie({ nom: 'Désordre', coucheTable: 'Ouvrages', dater: false, champs: CHAMPS_DESORDRE, geometrie: 'Point', sources: ['carte', 'position'] });
  assert.equal(p.ok, true);
  assert.deepEqual(p.colonnes.map((c) => c.id), ['Objet', 'latitude', 'longitude', 'Date', 'Gravite', 'Photo']);
  assert.equal(p.geometrie, 'Point');
  assert.deepEqual(p.sources, ['carte', 'position']);
  assert.deepEqual(p.colonnesGeometrie, ['latitude', 'longitude']);
});

test('sans géométrie, rien ne change : pas de colonnes de position, pas de source', () => {
  const p = planReleveLie({ nom: 'Visite', coucheTable: 'Pieges', dater: false, champs: CHAMPS_DESORDRE });
  assert.equal(p.geometrie, null);
  assert.deepEqual(p.sources, []);
  assert.deepEqual(p.colonnesGeometrie, []);
  assert.ok(!p.colonnes.some((c) => c.id === 'latitude'));
});

test('un champ nommé Latitude ne prend pas l\'identifiant de la position', () => {
  const p = planReleveLie({ nom: 'V', coucheTable: 'A', dater: false, geometrie: 'Point', champs: [{ libelle: 'Latitude', typeId: 'texte' }] });
  assert.equal(p.ok, false);
  assert.match(p.erreur, /existe déjà/);
});

test('une géométrie demande au moins une façon de la poser, et doit être connue', () => {
  const c = { nom: 'V', coucheTable: 'A', dater: false, champs: CHAMPS_DESORDRE };
  assert.match(planReleveLie({ ...c, geometrie: 'Point', sources: [] }).erreur, /au moins une façon/);
  assert.match(planReleveLie({ ...c, geometrie: 'Polygon', sources: ['position'] }).erreur, /au moins une façon/, 'ma position ne trace pas une surface');
  assert.match(planReleveLie({ ...c, geometrie: 'Cercle', sources: ['carte'] }).erreur, /point, une ligne ou une surface/);
});

test('la définition d\'un formulaire à géométrie ne montre ni la référence ni la position', () => {
  const p = planReleveLie({ nom: 'Désordre', coucheTable: 'Ouvrages', dater: false, champs: CHAMPS_DESORDRE, geometrie: 'Point', sources: ['carte'] });
  const def = defPourReleve(p, Derivation, { id: 'desordre' });
  assert.deepEqual(def.sections[0].fields.map((f) => f.colId), ['Date', 'Gravite', 'Photo']);
});

test('la table d\'un formulaire à géométrie se crée comme une couche, avec ses propres colonnes', () => {
  const p = planReleveLie({ nom: 'Désordre', coucheTable: 'Ouvrages', dater: false, champs: CHAMPS_DESORDRE, geometrie: 'Point', sources: ['carte'] });
  const { actions, indices } = actionsNouvelleCouche({
    tableId: p.tableId, type: 'Point', tables: ['Ouvrages'], colonnes: p.colonnes,
    inventaire: { Name: 'Désordre' }, prefs: { source_table: p.tableId },
    schemas: { maquette: [{ id: 'Name', type: 'Text' }], prefs: [{ id: 'source_table', type: 'Text' }] },
  });
  assert.deepEqual(actions[indices.table][2].map((c) => c.id), ['Objet', 'latitude', 'longitude', 'Date', 'Gravite', 'Photo']);
  assert.ok(!actions[indices.table][2].some((c) => c.id === 'nom'), 'pas de colonne Nom d\'office');
  // Une scène sur l'appareil accepte l'ensemble : table, inventaire, apparence.
  const scene = creerScene({ id: 't', nom: 'Essai' });
  appliquerActions(scene, [['AddTable', 'Ouvrages', colonnesNouvelleCouche('Point')]]);
  const { retValues } = appliquerActions(scene, actions);
  assert.equal(retValues[indices.table].table_id, p.tableId);
});

test('la phrase d\'un formulaire à géométrie le dit : la table est aussi une couche', () => {
  const p = planReleveLie({ nom: 'Désordre', coucheTable: 'Ouvrages', dater: false, champs: CHAMPS_DESORDRE, geometrie: 'Point', sources: ['carte'] });
  assert.equal(phraseReleveLie(p, { coucheTable: 'Ouvrages', expose: true }),
    'Table Desordre : une colonne Objet vers Ouvrages, la date et 2 champs ; un point par ligne, donc la table est aussi une couche ; le formulaire sera proposé sur le terrain.');
});

test('les colonnes de position sont celles que lit une couche de points', () => {
  assert.deepEqual(COLONNES_POINT.map((c) => c.id), ['latitude', 'longitude']);
  assert.ok(COLONNES_POINT.every((c) => c.type === 'Numeric'));
});

/* ---------- la ligne et la surface ---------- */

test('les trois géométries et leurs façons de les poser', () => {
  assert.deepEqual([...GEOMETRIES], ['Point', 'LineString', 'Polygon']);
  assert.deepEqual([...SOURCES_PAR_GEOMETRIE.Point], ['carte', 'position', 'centre']);
  assert.deepEqual([...SOURCES_PAR_GEOMETRIE.LineString], ['carte', 'centre']);
  assert.deepEqual([...SOURCES_PAR_GEOMETRIE.Polygon], ['carte', 'centre']);
});

test('les sources retenues dépendent de la forme : la position ne trace ni ligne ni surface', () => {
  assert.deepEqual(sourcesRetenues(['position', 'centre', 'carte'], 'Point'), ['carte', 'position', 'centre']);
  assert.deepEqual(sourcesRetenues(['position', 'centre', 'carte'], 'LineString'), ['carte', 'centre']);
  assert.deepEqual(sourcesRetenues(['position'], 'Polygon'), []);
});

test('les mots d\'une source suivent la forme : on touche un point, on trace une ligne', () => {
  assert.equal(libelleSource('carte', 'Point'), 'Sur la carte');
  assert.equal(libelleSource('carte', 'Polygon'), 'Tracer sur la carte');
  assert.equal(libelleSource('centre', 'Point'), 'Au centre de l’objet');
  assert.equal(libelleSource('centre', 'LineString'), 'Celle de l’objet');
  assert.equal(libelleSource('position', 'Point'), 'Ma position');
});

test('une ligne ou une surface par ligne s\'écrit en GeoJSON, dans une seule colonne', () => {
  for (const g of ['LineString', 'Polygon']) {
    const p = planReleveLie({ nom: 'Parcours', coucheTable: 'Sites', dater: false, champs: CHAMPS_DESORDRE, geometrie: g, sources: ['carte'] });
    assert.equal(p.ok, true, g);
    assert.deepEqual(p.colonnesGeometrie, ['geometry_json']);
    assert.deepEqual(p.colonnes.map((c) => c.id), ['Objet', 'geometry_json', 'Date', 'Gravite', 'Photo']);
    assert.equal(p.colonnes[1].type, 'Text');
    const def = defPourReleve(p, Derivation, { id: 'p' });
    assert.ok(!def.sections[0].fields.some((f) => f.colId === 'geometry_json'), 'la forme ne se saisit pas dans le formulaire');
  }
  assert.deepEqual(colonnesDeGeometrie('Point'), COLONNES_POINT);
  assert.deepEqual(colonnesDeGeometrie('Polygon'), COLONNES_FORME);
});

test('la phrase dit la forme de chaque ligne', () => {
  const champs = [{ libelle: 'Date', typeId: 'date' }, { libelle: 'Notes', typeId: 'texte' }];
  const phrase = (g) => phraseReleveLie(planReleveLie({ nom: 'Parcours', coucheTable: 'Sites', dater: false, champs, geometrie: g, sources: ['carte'] }), { coucheTable: 'Sites' });
  assert.match(phrase('LineString'), /un tracé par ligne, donc la table est aussi une couche/);
  assert.match(phrase('Polygon'), /une surface par ligne/);
  assert.match(phrase('Point'), /un point par ligne/);
});

test('la table d\'un parcours se crée comme une couche de lignes, avec sa colonne GeoJSON', () => {
  const p = planReleveLie({ nom: 'Parcours', coucheTable: 'Sites', dater: false, champs: CHAMPS_DESORDRE, geometrie: 'LineString', sources: ['carte'] });
  const { actions, indices } = actionsNouvelleCouche({
    tableId: p.tableId, type: 'LineString', tables: ['Sites'], colonnes: p.colonnes,
    inventaire: { Name: 'Parcours' }, prefs: { source_table: p.tableId },
    schemas: { maquette: [{ id: 'Name', type: 'Text' }], prefs: [{ id: 'source_table', type: 'Text' }] },
  });
  const scene = creerScene({ id: 't', nom: 'Essai' });
  appliquerActions(scene, [['AddTable', 'Sites', colonnesNouvelleCouche('Polygon')]]);
  appliquerActions(scene, actions);
  assert.ok(scene.tables[p.tableId].cols.some((c) => c.id === 'geometry_json'));
  assert.ok(!scene.tables[p.tableId].cols.some((c) => c.id === 'nom'));
  assert.ok(indices.table >= 0);
});

/* ---------- date et heure ---------- */

test('« Date et heure » crée un DateTime dans le fuseau donné', () => {
  const p = planColonne({ libelle: 'Passage', typeId: 'date_heure', fuseau: 'Europe/Paris' });
  assert.equal(p.ok, true);
  assert.equal(p.colonne.type, 'DateTime:Europe/Paris');
  assert.equal(p.colonne.id, 'Passage');
});

test('sans fuseau donné, celui de l\'appareil ; un fuseau douteux devient UTC', () => {
  const local = planColonne({ libelle: 'Passage', typeId: 'date_heure' });
  assert.equal(local.colonne.type, `DateTime:${fuseauLocal()}`);
  assert.equal(planColonne({ libelle: 'P', typeId: 'date_heure', fuseau: 'Europe/Paris; DROP' }).colonne.type, 'DateTime:UTC');
  assert.match(fuseauLocal(), /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+)*$/);
});

test('une date seule garde son type, sans fuseau', () => {
  assert.equal(planColonne({ libelle: 'Jour', typeId: 'date' }).colonne.type, 'Date');
});

test('une date et heure est une date : elle ne compte pas comme champ de plus, et part du jour', () => {
  assert.equal(estTypeDate('date'), true);
  assert.equal(estTypeDate('date_heure'), true);
  assert.equal(estTypeDate('texte'), false);
  const seule = planReleveLie({ nom: 'V', coucheTable: 'A', dater: false, champs: [{ libelle: 'Passage', typeId: 'date_heure' }] });
  assert.match(seule.erreur, /en plus de la date/);
  const p = planReleveLie({
    nom: 'Visite', coucheTable: 'Pieges', dater: false, fuseau: 'Europe/Paris',
    champs: [{ libelle: 'Passage', typeId: 'date_heure' }, { libelle: 'Remarques', typeId: 'texte' }],
  });
  assert.equal(p.colonnes.find((c) => c.id === 'Passage').type, 'DateTime:Europe/Paris');
  const def = defPourReleve(p, Derivation, { id: 'visite' });
  assert.equal(def.sections[0].fields.find((f) => f.colId === 'Passage').widget, 'datetime');
  assert.deepEqual(departsProposes(def), { Passage: 'aujourdhui' });
});

test('la phrase d\'un champ date et heure le nomme', () => {
  const a = planAjoutChamp({ table: 'Visites', libelle: 'Passage', typeId: 'date_heure', fuseau: 'Europe/Paris' });
  assert.equal(phraseAjoutChamp(a, { table: 'Visites' }), 'Colonne « Passage » (date et heure) ajoutée à la table Visites.');
});

test('un champ de date peut être ajouté avant celui qui lui donne un sens : la règle vaut pour le formulaire entier', () => {
  const champs = [{ libelle: 'Date', typeId: 'date' }, { libelle: 'Passage', typeId: 'date_heure' }];
  assert.match(planReleveLie({ nom: 'V', coucheTable: 'A', dater: false, champs }).erreur, /en plus de la date/);
  assert.equal(planReleveLie({ nom: 'V', coucheTable: 'A', dater: false, champs, complet: false }).ok, true);
});

test('un seul champ date le formulaire : celui dont le nom le dit, sinon le premier', () => {
  assert.equal(indexDatePrincipale([{ libelle: 'Notes', typeId: 'texte' }, { libelle: 'Date', typeId: 'date' }, { libelle: 'Passage', typeId: 'date_heure' }]), 1);
  assert.equal(indexDatePrincipale([{ libelle: 'Échéance', typeId: 'date' }, { libelle: 'Relevé fait le', typeId: 'date_heure' }]), 0);
  assert.equal(indexDatePrincipale([{ libelle: 'Heure', typeId: 'date_heure' }, { libelle: 'Passage', typeId: 'date_heure' }]), 1);
  assert.equal(indexDatePrincipale([{ libelle: 'Notes', typeId: 'texte' }]), -1);
  assert.equal(indexDatePrincipale([]), -1);
});

/* ---------- les phrases ---------- */

test('les phrases disent ce qui sera écrit', () => {
  const a = planAjoutChamp({ table: 'Arbres', libelle: 'Hauteur', typeId: 'decimal' });
  assert.equal(phraseAjoutChamp(a, { table: 'Arbres', formulaire: 'Fiche' }),
    'Colonne « Hauteur » (nombre décimal) ajoutée à la table Arbres et au formulaire « Fiche ».');
  const r = planReleveLie({ nom: 'Relevé', coucheTable: 'Pieges', champs: CHAMPS_RELEVE });
  assert.equal(phraseReleveLie(r, { coucheTable: 'Pieges', expose: true }),
    'Table Releve : une colonne Objet vers Pieges, la date et 3 champs ; le formulaire sera proposé sur le terrain.');
  assert.equal(phraseReleveLie({ ok: false }), '');
});

test('un refus de structure est dit comme tel', () => {
  assert.match(messageRefusChamp(new Error('Blocked by table schema access rules')), /pas sa structure/);
  assert.match(messageRefusChamp(new Error('boum'), { releve: true }), /boum/);
  assert.equal(COLONNE_DATE, 'Date');
});
