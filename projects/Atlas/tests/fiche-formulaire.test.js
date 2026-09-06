import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lireFormulaires,
  formulaireOffrable,
  formulairesPourTable,
  choisirFormulaire,
  reglagesFormulaire,
  formDefPourCouche,
  inventaireFormulaires,
  valeursPourMoteur,
} from '../lib/fiche-formulaire.js';

/* ---------- ce que la table Formulaires rend, et ce qu'elle perdait ---------- */

/** Une table colonnaire comme `fetchTable` la renvoie. */
function tableFormulaires(lignes) {
  const rec = { id: [], FormId: [], Nom: [], Titre: [], TableCible: [], Version: [], Statut: [], Def: [] };
  lignes.forEach((l, i) => {
    rec.id.push(i + 1);
    rec.FormId.push(l.formId ?? null);
    rec.Nom.push(l.nom ?? null);
    rec.Titre.push(l.titre ?? null);
    rec.TableCible.push(l.tableCible ?? null);
    rec.Version.push(l.version ?? null);
    rec.Statut.push(l.statut ?? null);
    rec.Def.push(l.def === undefined ? null : JSON.stringify(l.def));
  });
  return rec;
}

const defBati = { id: 'batiments-terrain', title: 'Bâtiments — saisie', tableId: 'Batiments', sections: [] };
const defVisite = { id: 'visites', title: 'Visite', tableId: 'Visites', sections: [] };

test('le statut est lu, la ou Atlas ne gardait que la definition', () => {
  const [e] = lireFormulaires(tableFormulaires([
    { formId: 'batiments-terrain', statut: 'terrain', version: 3, def: defBati },
  ]));
  assert.equal(e.statut, 'terrain');
  assert.equal(e.version, 3);
  assert.equal(e.tableCible, 'Batiments');
  assert.equal(e.rowId, 1);
  assert.equal(e.titre, 'Bâtiments — saisie');
  assert.equal(e.def.tableId, 'Batiments');
});

test('un statut absent ou inconnu vaut brouillon, jamais mieux', () => {
  // Se tromper vers le haut exposerait a un lecteur un formulaire que personne
  // n'a declare pret.
  const lues = lireFormulaires(tableFormulaires([
    { statut: null, def: defBati },
    { statut: 'publie_hier', def: defVisite },
  ]));
  assert.deepEqual(lues.map((e) => e.statut), ['brouillon', 'brouillon']);
});

test('une definition illisible ne coute que sa propre ligne', () => {
  const rec = tableFormulaires([
    { statut: 'publie', def: defBati },
    { statut: 'publie', def: defVisite },
  ]);
  rec.Def[0] = '{ ceci n est pas du JSON';
  const lues = lireFormulaires(rec);
  assert.equal(lues.length, 1);
  assert.equal(lues[0].def.tableId, 'Visites');
});

test('une definition sans table cible n’est pas une definition', () => {
  const lues = lireFormulaires(tableFormulaires([{ statut: 'publie', def: { id: 'x', title: 'X' } }]));
  assert.deepEqual(lues, []);
});

test('une table vide ou absente ne fait pas tomber la lecture', () => {
  assert.deepEqual(lireFormulaires(null), []);
  assert.deepEqual(lireFormulaires({}), []);
  assert.deepEqual(lireFormulaires({ id: [] }), []);
});

/* ---------- ce qu'on peut offrir hors edition ---------- */

test('un brouillon se regle, il ne s’offre pas', () => {
  assert.equal(formulaireOffrable({ statut: 'brouillon' }), false);
  assert.equal(formulaireOffrable({ statut: 'publie' }), true);
  // Le statut qu'ecrit qgis2grist en important un pack QField.
  assert.equal(formulaireOffrable({ statut: 'terrain' }), true);
  assert.equal(formulaireOffrable(null), false);
});

/* ---------- lequel sert la fiche, quand il y en a plusieurs ---------- */

const troisFormulaires = [
  { formId: 'bati-brouillon', statut: 'brouillon', def: { ...defBati, id: 'bati-brouillon' } },
  { formId: 'bati-terrain', statut: 'terrain', def: { ...defBati, id: 'bati-terrain' } },
  { formId: 'visites', statut: 'publie', def: defVisite },
];

test('sans rien de choisi, un formulaire abouti passe avant un brouillon', () => {
  const e = choisirFormulaire(troisFormulaires, { table: 'Batiments' });
  assert.equal(e.formId, 'bati-terrain');
});

test('le choix de la scene passe avant tout — c’est l’auteur qui a tranche', () => {
  const e = choisirFormulaire(troisFormulaires, { table: 'Batiments', prefereId: 'bati-brouillon' });
  assert.equal(e.formId, 'bati-brouillon');
});

test('un choix qui ne designe plus rien retombe sur la regle, pas sur null', () => {
  // Le formulaire choisi a ete supprime du document ; la fiche doit continuer
  // de s'ouvrir, sinon la scene casse pour une ligne effacee ailleurs.
  const e = choisirFormulaire(troisFormulaires, { table: 'Batiments', prefereId: 'disparu' });
  assert.equal(e.formId, 'bati-terrain');
});

test('quand tout est brouillon, on rend quand meme le premier', () => {
  const brouillons = [{ formId: 'a', statut: 'brouillon', def: defBati }];
  assert.equal(choisirFormulaire(brouillons, { table: 'Batiments' }).formId, 'a');
});

test('aucune table, aucun candidat : null, et sans jeter', () => {
  assert.equal(choisirFormulaire(troisFormulaires, { table: 'Inconnue' }), null);
  assert.equal(choisirFormulaire(troisFormulaires, {}), null);
  assert.equal(choisirFormulaire(null, { table: 'Batiments' }), null);
});

test('formulairesPourTable ne rend que ce qui vise cette table', () => {
  assert.deepEqual(formulairesPourTable(troisFormulaires, 'Batiments').map((e) => e.formId),
    ['bati-brouillon', 'bati-terrain']);
  assert.deepEqual(formulairesPourTable(troisFormulaires, 'Visites').map((e) => e.formId), ['visites']);
});

/* ---------- ce que la couche porte ---------- */

test('les reglages d’une couche sont normalises, jamais devines', () => {
  assert.deepEqual(reglagesFormulaire({}), { id: null, expose: false });
  assert.deepEqual(reglagesFormulaire(null), { id: null, expose: false });
  // `expose` doit etre vrai, pas seulement present : une valeur heritee d'un
  // ancien enregistrement ne doit pas ouvrir un formulaire a un lecteur.
  assert.deepEqual(reglagesFormulaire({ formulaire: { expose: 'oui' } }), { id: null, expose: false });
  assert.deepEqual(reglagesFormulaire({ formulaire: { id: 'x', expose: true } }), { id: 'x', expose: true });
});

test('une couche sans table n’a pas de formulaire', () => {
  assert.equal(formDefPourCouche({ name: 'Arbres importes' }, troisFormulaires), null);
});

test('deux couches d’une meme table partagent le formulaire', () => {
  const a = { sourceTable: 'Batiments', name: 'Bâti 2020' };
  const b = { sourceTable: 'Batiments', name: 'Bâti 2024' };
  assert.equal(formDefPourCouche(a, troisFormulaires).id, formDefPourCouche(b, troisFormulaires).id);
});

test('mais chacune peut en choisir un autre — c’est un reglage de scene', () => {
  const couche = { sourceTable: 'Batiments', formulaire: { id: 'bati-brouillon' } };
  assert.equal(formDefPourCouche(couche, troisFormulaires).id, 'bati-brouillon');
});

/* ---------- l'inventaire que montre le module ---------- */

const couches = [
  { id: 'l1', name: 'Bâtiments', sourceTable: 'Batiments', formulaire: { id: null, expose: true } },
  { id: 'l2', name: 'Bâti 2024', sourceTable: 'Batiments' },
  { id: 'l3', name: 'Arbres importés' },
  { id: 'l4', name: 'Voirie', sourceTable: 'Voirie' },
];

test('l’inventaire joint les couches et les formulaires sans qu’aucun commande', () => {
  const inv = inventaireFormulaires({ couches, entrees: troisFormulaires });
  const par = Object.fromEntries(inv.map((l) => [l.table, l]));

  // Une table geo avec formulaire : les deux couches, les deux formulaires.
  assert.equal(par.Batiments.couches.length, 2);
  assert.equal(par.Batiments.formulaires.length, 2);
  assert.equal(par.Batiments.choisi.formId, 'bati-terrain');

  // Une table geo sans formulaire : c'est une occasion, pas une anomalie.
  assert.equal(par.Voirie.formulaires.length, 0);
  assert.equal(par.Voirie.choisi, null);

  // Un formulaire sans couche : normal, une table de visites n'a pas de
  // geometrie et se saisit depuis le batiment.
  assert.equal(par.Visites.couches.length, 0);
  assert.equal(par.Visites.formulaires.length, 1);

  // Une couche sans table n'a rien a faire ici.
  assert.equal(par.undefined, undefined);
  assert.equal(inv.length, 3);
});

test('l’ordre suit celui de la carte, que l’auteur a sous les yeux', () => {
  const inv = inventaireFormulaires({ couches, entrees: troisFormulaires });
  assert.deepEqual(inv.map((l) => l.table), ['Batiments', 'Voirie', 'Visites']);
});

test('une seule couche exposee suffit a dire que la table l’est', () => {
  const inv = inventaireFormulaires({ couches, entrees: troisFormulaires });
  assert.equal(inv.find((l) => l.table === 'Batiments').expose, true);
  assert.equal(inv.find((l) => l.table === 'Voirie').expose, false);
});

test('un inventaire vide est un inventaire, pas une erreur', () => {
  assert.deepEqual(inventaireFormulaires(), []);
  assert.deepEqual(inventaireFormulaires({ couches: [], entrees: [] }), []);
});

/* ---------- les valeurs de depart ---------- */

test('on ne passe que ce que le formulaire declare', () => {
  // `collectSubmitData` emet tout ce qu'il connait : lui donner une colonne
  // qu'il n'affiche pas la ferait reecrire sans que personne l'ait vue.
  const def = { sections: [{ fields: [{ colId: 'nom' }, { colId: 'etat' }] }] };
  const v = valeursPourMoteur(def, { nom: 'Halle', etat: 'bon', hauteur: 12, _row_id: 4 });
  assert.deepEqual(v, { nom: 'Halle', etat: 'bon' });
});

test('et on le passe dans la langue du champ, pas dans celle de Grist', () => {
  const def = { sections: [{ fields: [
    { colId: 'nom', type: 'Text' },
    { colId: 'visite', type: 'Date', widget: 'date' },
    { colId: 'verifie', type: 'Bool', widget: 'checkbox' },
    { colId: 'usages', type: 'ChoiceList', widget: 'multiselect' },
    { colId: 'absent', type: 'Text' },
  ] }] };
  assert.deepEqual(
    valeursPourMoteur(def, { nom: 'Halle', visite: 1773446400, verifie: 'false', usages: ['L', 'marche'] }),
    { nom: 'Halle', visite: '2026-03-14', verifie: false, usages: ['marche'] },
  );
});

/* ---------- le mode exploitation : saisir hors edition ---------- */

import { saisieHorsEdition } from '../lib/fiche-formulaire.js';

/** Le cas nominal : un lien de terrain, un formulaire publie, des droits. */
const terrain = {
  view: true,
  aDesLignes: true,
  peutEcrire: true,
  reglages: { id: null, expose: true },
  entree: { statut: 'terrain' },
  moteur: true,
};

test('le cas du terrain : lecture, formulaire publie, droits d’ecriture', () => {
  assert.equal(saisieHorsEdition(terrain), true);
});

test('en edition, la question ne se pose pas', () => {
  // Ce chemin ne decrit que ce qui reste ouvert HORS edition ; en edition,
  // c'est le garde ordinaire qui repond.
  assert.equal(saisieHorsEdition({ ...terrain, view: false }), false);
});

test('chacune des quatre conditions suffit a fermer', () => {
  // Sans ligne : on ecrirait dans un blob GeoJSON, ou rien n'a d'identite.
  assert.equal(saisieHorsEdition({ ...terrain, aDesLignes: false }), false);
  // Sans droits : on ferait remplir un formulaire pour un refus.
  assert.equal(saisieHorsEdition({ ...terrain, peutEcrire: false }), false);
  // Sans publication : tout formulaire du document deviendrait saisissable.
  assert.equal(saisieHorsEdition({ ...terrain, reglages: { expose: false } }), false);
  // Sans moteur : le repli devine les champs, il n'a rien a ecrire ici.
  assert.equal(saisieHorsEdition({ ...terrain, moteur: false }), false);
});

test('un brouillon publie par erreur ne part pas au terrain', () => {
  assert.equal(saisieHorsEdition({ ...terrain, entree: { statut: 'brouillon' } }), false);
  assert.equal(saisieHorsEdition({ ...terrain, entree: null }), false);
});

test('« expose » doit valoir vrai, pas seulement etre la', () => {
  assert.equal(saisieHorsEdition({ ...terrain, reglages: { expose: 'oui' } }), false);
  assert.equal(saisieHorsEdition({ ...terrain, reglages: {} }), false);
  assert.equal(saisieHorsEdition({ ...terrain, reglages: null }), false);
});

test('sans argument, on ne saisit rien', () => {
  assert.equal(saisieHorsEdition(), false);
});

/* ---------- ce qu'un champ rendu attend, depuis ce que Grist stocke ---------- */

import { valeurPourFormulaire } from '../lib/fiche-formulaire.js';

test('une date Grist est en SECONDES — l’input la veut en AAAA-MM-JJ', () => {
  // 2026-03-14T00:00:00Z. Sans conversion, `el.value = "1773446400"` laisse le
  // champ vide, sans la moindre erreur : la personne ressaisit et ne sait pas
  // pourquoi.
  const champ = { colId: 'visite', type: 'Date', widget: 'date' };
  assert.deepEqual(valeurPourFormulaire(champ, 1773446400), { genre: 'date', valeur: '2026-03-14' });
});

test('des millisecondes se reconnaissent au seuil, pas au hasard', () => {
  const champ = { colId: 'visite', type: 'Date' };
  assert.equal(valeurPourFormulaire(champ, 1773446400000).valeur, '2026-03-14');
});

test('une date deja lisible n’est pas retraduite', () => {
  const champ = { colId: 'visite', widget: 'date' };
  assert.equal(valeurPourFormulaire(champ, '2026-03-14').valeur, '2026-03-14');
});

test('un DateTime garde son heure, la date seule la laisse', () => {
  assert.equal(valeurPourFormulaire({ type: 'DateTime' }, 1773446400).valeur, '2026-03-14T00:00');
  assert.equal(valeurPourFormulaire({ type: 'Date' }, 1773446400).valeur, '2026-03-14');
});

test('une date illisible ne pose rien plutot que n’importe quoi', () => {
  assert.equal(valeurPourFormulaire({ type: 'Date' }, 'la semaine derniere'), null);
});

test('une liste Grist perd son marqueur « L », qui n’est pas un choix', () => {
  const r = valeurPourFormulaire({ colId: 'usages', type: 'ChoiceList' }, ['L', 'bureau', 'commerce']);
  assert.deepEqual(r, { genre: 'liste', valeur: ['bureau', 'commerce'] });
  // Une liste vide n'a rien a cocher.
  assert.equal(valeurPourFormulaire({ type: 'ChoiceList' }, ['L']), null);
});

test('un booleen se lit dans toutes ses ecritures', () => {
  const champ = { colId: 'verifie', type: 'Bool' };
  assert.deepEqual(valeurPourFormulaire(champ, true), { genre: 'coche', valeur: true });
  assert.deepEqual(valeurPourFormulaire(champ, false), { genre: 'coche', valeur: false });
  // Atlas ecrasait les types Grist en deux et renvoyait la chaine « false » :
  // la lire comme vraie cochait la case a l'envers.
  assert.deepEqual(valeurPourFormulaire(champ, 'false'), { genre: 'coche', valeur: false });
  assert.deepEqual(valeurPourFormulaire(champ, 0), { genre: 'coche', valeur: false });
  assert.deepEqual(valeurPourFormulaire(champ, 'true'), { genre: 'coche', valeur: true });
});

test('le reste part en texte, et rien ne part du vide', () => {
  assert.deepEqual(valeurPourFormulaire({ colId: 'nom' }, 'Mairie'), { genre: 'valeur', valeur: 'Mairie' });
  assert.deepEqual(valeurPourFormulaire({ colId: 'hauteur' }, 12.5), { genre: 'valeur', valeur: '12.5' });
  for (const rien of [undefined, null, '']) {
    assert.equal(valeurPourFormulaire({ colId: 'nom' }, rien), null);
  }
});
