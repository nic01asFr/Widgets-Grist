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
  const vide = { fiche: null, exposes: null, exposeHerite: false };
  assert.deepEqual(reglagesFormulaire({}), vide);
  assert.deepEqual(reglagesFormulaire(null), vide);
  // `expose` devait valoir VRAI, pas seulement etre present : une valeur
  // heritee d'un ancien enregistrement n'ouvre rien a un lecteur.
  assert.deepEqual(reglagesFormulaire({ formulaire: { expose: 'oui' } }), vide);
});

test('l’ancien booleen se relit sans rien perdre', () => {
  // `expose: true` voulait dire « la fiche de cette couche est exposee » — le
  // seul formulaire qui existait alors. On le reporte sur le principal.
  assert.deepEqual(reglagesFormulaire({ formulaire: { id: 'x', expose: true } }),
    { fiche: 'x', exposes: null, exposeHerite: true });
});

test('une liste vide n’est pas l’absence de liste', () => {
  // `null` dit « cette couche n'a jamais rien decide » ; `[]` dit « rien n'est
  // expose ». Les confondre reactiverait l'ancien booleen sur une couche qu'on
  // vient justement de vider.
  assert.deepEqual(reglagesFormulaire({ formulaire: { exposes: [], expose: true } }),
    { fiche: null, exposes: [], exposeHerite: false });
  assert.deepEqual(reglagesFormulaire({ formulaire: { fiche: 'a', exposes: ['a', 'b'] } }),
    { fiche: 'a', exposes: ['a', 'b'], exposeHerite: false });
});

test('une liste d’exposes filtre ce qui n’est pas un identifiant', () => {
  assert.deepEqual(reglagesFormulaire({ formulaire: { exposes: ['a', 3, null, 'b'] } }).exposes, ['a', 'b']);
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

/** Le cas nominal : un lien de terrain, un formulaire offert, des droits. */
const offert = { id: 'visites', statut: 'terrain', expose: true, derive: false };
const terrain = { view: true, aDesLignes: true, peutEcrire: true, moteur: true, formulaires: [offert] };

test('le cas du terrain : lecture, formulaire offert, droits d’ecriture', () => {
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
  // Sans moteur : le repli devine les champs, il n'a rien a ecrire ici.
  assert.equal(saisieHorsEdition({ ...terrain, moteur: false }), false);
  // Aucun formulaire offert : rien a saisir.
  assert.equal(saisieHorsEdition({ ...terrain, formulaires: [] }), false);
});

test('un formulaire non expose ne suffit pas, meme pret', () => {
  assert.equal(saisieHorsEdition({ ...terrain, formulaires: [{ ...offert, expose: false }] }), false);
});

test('un brouillon expose par erreur ne part pas au terrain', () => {
  assert.equal(saisieHorsEdition({ ...terrain, formulaires: [{ ...offert, statut: 'brouillon' }] }), false);
});

test('un derive n’est jamais offert : il n’existe pas en base', () => {
  // L'exposer demande d'abord de l'enregistrer, ce qui est un geste et pas un
  // effet de bord.
  assert.equal(saisieHorsEdition({ ...terrain, formulaires: [{ ...offert, derive: true, statut: null }] }), false);
});

test('un seul formulaire offert parmi plusieurs suffit', () => {
  const liste = [{ ...offert, expose: false }, { id: 'd', statut: 'publie', expose: true, derive: false }];
  assert.equal(saisieHorsEdition({ ...terrain, formulaires: liste }), true);
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

/* ---------- les formulaires d'une couche ---------- */

import { createRequire } from 'node:module';
import {
  formulairesPourCouche,
  colonnesHorsFormulaire,
  formulairesOffertsEnLecture,
  libelleFormulaire,
} from '../lib/fiche-formulaire.js';
import { schemaDepuisMeta } from '../lib/schema-grist.js';

// La dérivation est chargée en UMD par la page ; en test on la pose comme la
// page le ferait, sinon `formulairesPourCouche` ne rendrait que l'enregistré.
const requis = createRequire(import.meta.url);
globalThis.window = globalThis.window || {};
globalThis.window.FormDefFromTable = requis('../../grist_forms/shared/formdef-from-table.js');

const SCHEMA = schemaDepuisMeta(
  { id: [1, 2, 3], tableId: ['Batiments_locaux', 'Visites', 'Desordres'] },
  {
    id: [1, 2, 3, 4, 5, 6, 7],
    parentId: [1, 1, 2, 2, 3, 3, 1],
    colId: ['geometry_json', 'nom', 'batiment', 'etat', 'bati', 'gravite', 'atlas_3d_json'],
    type: ['Text', 'Text', 'Ref:Batiments_locaux', 'Choice', 'Ref:Batiments_locaux', 'Int', 'Text'],
    label: ['', '', '', '', '', '', ''],
    isFormula: [false, false, false, false, false, false, false],
    widgetOptions: ['', '', '', '', '', '', ''],
  },
);

const COUCHE = { id: 'l1', name: 'Bâtiments', sourceTable: 'Batiments_locaux', geometryColumn: 'geometry_json' };

test('la table de la couche d’abord, puis les liees — c’est l’ordre des onglets', () => {
  const liste = formulairesPourCouche({ couche: COUCHE, entrees: [], schema: SCHEMA });
  assert.deepEqual(liste.map((f) => f.tableId), ['Batiments_locaux', 'Visites', 'Desordres']);
  assert.deepEqual(liste.map((f) => f.surLaCouche), [true, false, false]);
  assert.deepEqual(liste.map((f) => f.via), [null, 'batiment', 'bati']);
});

test('« surLaCouche » dit la table visee, pas le rang', () => {
  // Une table peut porter plusieurs formulaires, et ils corrigent tous l'objet.
  const entrees = [
    { formId: 'a', titre: 'Relevé A', statut: 'publie', def: { id: 'a', tableId: 'Batiments_locaux', sections: [] } },
    { formId: 'b', titre: 'Relevé B', statut: 'publie', def: { id: 'b', tableId: 'Batiments_locaux', sections: [] } },
  ];
  const liste = formulairesPourCouche({ couche: COUCHE, entrees, schema: SCHEMA });
  assert.deepEqual(liste.filter((f) => f.surLaCouche).map((f) => f.id),
    ['derive:Batiments_locaux', 'a', 'b']);
});

test('tous les enregistres d’une table ont leur onglet, pas seulement un', () => {
  // La regle « un onglet par formulaire » n'etait pas tenue : le code appelait
  // choisirFormulaire, qui tranche.
  const entrees = [
    { formId: 'a', titre: 'Relevé A', statut: 'publie', def: { id: 'a', tableId: 'Visites', sections: [] } },
    { formId: 'b', titre: 'Relevé B', statut: 'terrain', def: { id: 'b', tableId: 'Visites', sections: [] } },
  ];
  const liste = formulairesPourCouche({ couche: COUCHE, entrees, schema: SCHEMA });
  assert.deepEqual(liste.filter((f) => f.tableId === 'Visites').map((f) => f.id), ['a', 'b']);
});

test('le derive de la couche ne disparait jamais, meme avec un formulaire importe', () => {
  // Un formulaire importe montre ce que son auteur a choisi, pas ce que la
  // table contient. La vue « tous les attributs » ne doit pas s'evaporer.
  const entrees = [{ formId: 'releve', titre: 'Bâtiment — relevé', statut: 'terrain', def: { id: 'releve', tableId: 'Batiments_locaux', sections: [] } }];
  const liste = formulairesPourCouche({ couche: COUCHE, entrees, schema: SCHEMA });
  assert.deepEqual(liste.filter((f) => f.surLaCouche).map((f) => f.id),
    ['derive:Batiments_locaux', 'releve']);
  assert.deepEqual(liste.filter((f) => f.surLaCouche).map(libelleFormulaire),
    ['Attributs', 'Bâtiment — relevé']);
});

test('mais pour une table liee, le derive n’est qu’un repli', () => {
  const entrees = [{ formId: 'v', titre: 'Visite', statut: 'publie', def: { id: 'v', tableId: 'Visites', sections: [] } }];
  const liste = formulairesPourCouche({ couche: COUCHE, entrees, schema: SCHEMA });
  assert.deepEqual(liste.filter((f) => f.tableId === 'Visites').map((f) => f.id), ['v']);
  // Desordres n'a rien d'enregistre : son derive reste.
  assert.deepEqual(liste.filter((f) => f.tableId === 'Desordres').map((f) => f.id), ['derive:Desordres']);
});

test('un enregistre porte SON nom, jamais « Attributs »', () => {
  // L'afficher comme « Attributs » effacerait ce que son auteur a ecrit, et
  // laisserait croire qu'il montre toutes les colonnes.
  assert.equal(libelleFormulaire({ derive: true, surLaCouche: true, titre: 'Attributs' }), 'Attributs');
  assert.equal(libelleFormulaire({ derive: false, surLaCouche: true, titre: 'Bâtiment — relevé' }), 'Bâtiment — relevé');
  assert.equal(libelleFormulaire({ derive: true, surLaCouche: false, titre: 'Desordres' }), 'Desordres');
  assert.equal(libelleFormulaire(null), '');
});

test('sans formulaire enregistre, tout est derive — et rien n’est ecrit', () => {
  const liste = formulairesPourCouche({ couche: COUCHE, entrees: [], schema: SCHEMA });
  assert.deepEqual(liste.map((f) => f.derive), [true, true, true]);
  assert.deepEqual(liste.map((f) => f.id), ['derive:Batiments_locaux', 'derive:Visites', 'derive:Desordres']);
});

test('un enregistre s’ajoute, et sur une table liee il remplace le repli', () => {
  // C'est ainsi qu'un pack QField, ou un formulaire compose ici, prend sa place
  // sans qu'aucun chemin ne soit privilegie.
  const entrees = [
    { formId: 'bati-terrain', titre: 'Bâtiment — relevé', statut: 'terrain', def: { id: 'bati-terrain', tableId: 'Batiments_locaux', sections: [] } },
    { formId: 'visite-v2', titre: 'Visite', statut: 'publie', def: { id: 'visite-v2', tableId: 'Visites', sections: [] } },
  ];
  const liste = formulairesPourCouche({ couche: COUCHE, entrees, schema: SCHEMA });
  assert.deepEqual(liste.map((f) => f.id),
    ['derive:Batiments_locaux', 'bati-terrain', 'visite-v2', 'derive:Desordres']);
  assert.deepEqual(liste.map((f) => f.derive), [true, false, false, true]);
});

test('la geometrie et la memoire d’Atlas ne se saisissent pas', () => {
  // La geometrie se dessine, elle ne se tape pas. Les offrir ferait editer a la
  // main ce que la carte regle.
  assert.deepEqual(colonnesHorsFormulaire(COUCHE), ['atlas_3d_json', 'geometry_json']);
  assert.deepEqual(colonnesHorsFormulaire({ geometryColumn: { lat: 'latitude', lng: 'longitude' } }),
    ['atlas_3d_json', 'latitude', 'longitude']);
  assert.deepEqual(colonnesHorsFormulaire(null), ['atlas_3d_json']);

  const principal = formulairesPourCouche({ couche: COUCHE, entrees: [], schema: SCHEMA })[0];
  assert.deepEqual(principal.def.sections[0].fields.map((f) => f.colId), ['nom']);
});

test('la colonne qui porte la reference n’est pas une saisie', () => {
  // C'est le clic qui la remplit : la montrer ferait choisir l'objet qu'on
  // vient de choisir.
  const visite = formulairesPourCouche({ couche: COUCHE, entrees: [], schema: SCHEMA })[1];
  assert.deepEqual(visite.def.sections[0].fields.map((f) => f.colId), ['etat']);
});

test('sans schema, il ne reste que ce qui est enregistre sur la table geo', () => {
  const entrees = [{ formId: 'b', titre: 'B', statut: 'publie', def: { id: 'b', tableId: 'Batiments_locaux', sections: [] } }];
  const liste = formulairesPourCouche({ couche: COUCHE, entrees });
  assert.deepEqual(liste.map((f) => f.id), ['b']);
});

test('une couche sans table n’a aucun formulaire', () => {
  assert.deepEqual(formulairesPourCouche({ couche: { name: 'Arbres importés' }, schema: SCHEMA }), []);
  assert.deepEqual(formulairesPourCouche(), []);
});

test('l’exposition se decide par identifiant', () => {
  const couche = { ...COUCHE, formulaire: { exposes: ['derive:Visites'] } };
  const liste = formulairesPourCouche({ couche, entrees: [], schema: SCHEMA });
  assert.deepEqual(liste.map((f) => f.expose), [false, true, false]);
});

test('l’ancien booleen se reporte sur le principal, et sur lui seul', () => {
  const couche = { ...COUCHE, formulaire: { expose: true } };
  const liste = formulairesPourCouche({ couche, entrees: [], schema: SCHEMA });
  assert.deepEqual(liste.map((f) => f.expose), [true, false, false]);
});

test('un derive expose reste hors lecture — l’exposer demande de l’enregistrer', () => {
  const couche = { ...COUCHE, formulaire: { exposes: ['derive:Visites'] } };
  const liste = formulairesPourCouche({ couche, entrees: [], schema: SCHEMA });
  assert.deepEqual(formulairesOffertsEnLecture(liste), []);
});

test('un enregistre publie et expose, lui, est offert', () => {
  const entrees = [{ formId: 'visite-v2', titre: 'Visite', statut: 'terrain', def: { id: 'visite-v2', tableId: 'Visites', sections: [] } }];
  const couche = { ...COUCHE, formulaire: { exposes: ['visite-v2'] } };
  const liste = formulairesPourCouche({ couche, entrees, schema: SCHEMA });
  assert.deepEqual(formulairesOffertsEnLecture(liste).map((f) => f.id), ['visite-v2']);
});

/* ---------- le pont : corriger l'objet, ou ajouter une ligne qui le référence ---------- */

import { pontFormulaire } from '../lib/fiche-formulaire.js';

/** Un faux `docApi` qui retient ce qu'on lui demande d'écrire. */
function fauxDocApi() {
  const actions = [];
  return {
    actions,
    applyUserActions: (a) => { actions.push(...a); return Promise.resolve({ retValues: [1] }); },
    fetchTable: () => Promise.resolve({}),
    getAccessToken: () => Promise.resolve({ token: 'x' }),
  };
}

const COUCHE_PONT = { sourceTable: 'Batiments_locaux' };

test('sans formulaire designe, le pont corrige l’objet — le defaut d’avant les lies', async () => {
  const api = fauxDocApi();
  const p = pontFormulaire({ couche: COUCHE_PONT, rowId: 3, docApi: api, peutEcrire: () => true });
  assert.equal(p.editRowId, 3);
  assert.equal(typeof p.addRow, 'undefined');
  await p.updateRow('ignoré', 3, { nom: 'Mairie' });
  assert.deepEqual(api.actions[0], ['UpdateRecord', 'Batiments_locaux', 3, { nom: 'Mairie' }]);
});

test('un formulaire lie N’A PAS d’editRowId — c’est la condition, pas un oubli', async () => {
  // `defaultSubmit` teste editRowId AVANT addRow et ne discute pas : le porter
  // ici ferait corriger le batiment au lieu d'ajouter la visite.
  const api = fauxDocApi();
  const p = pontFormulaire({
    couche: COUCHE_PONT, rowId: 3, docApi: api, peutEcrire: () => true,
    formulaire: { surLaCouche: false, tableId: 'Visites', via: 'batiment' },
  });
  assert.equal(p.editRowId, undefined);
  assert.equal(typeof p.updateRow, 'undefined');
  assert.equal(typeof p.addRow, 'function');
});

test('la reference entre par le pont, jamais par le formulaire', async () => {
  // C'est le clic qui fait foi. Un formulaire herite de QField n'expose pas
  // forcement son Ref : sans injection, la ligne serait rattachee a rien.
  const api = fauxDocApi();
  const p = pontFormulaire({
    couche: COUCHE_PONT, rowId: 7, docApi: api, peutEcrire: () => true,
    formulaire: { surLaCouche: false, tableId: 'Visites', via: 'batiment' },
  });
  await p.addRow('Visites', { etat: 'Bon' });
  assert.deepEqual(api.actions[0], ['AddRecord', 'Visites', null, { etat: 'Bon', batiment: 7 }]);
});

test('un formulaire lie sans colonne de reference refuse plutot que d’orpheliner', async () => {
  const api = fauxDocApi();
  const p = pontFormulaire({
    couche: COUCHE_PONT, rowId: 7, docApi: api, peutEcrire: () => true,
    formulaire: { surLaCouche: false, tableId: 'Visites', via: null },
  });
  await assert.rejects(() => p.addRow('Visites', { etat: 'Bon' }), /référence/);
  assert.equal(api.actions.length, 0, 'rien n’a été écrit');
});

test('le garde d’ecriture vaut pour les deux modes', async () => {
  // Consulte a CHAQUE soumission, pas a la construction : les droits peuvent
  // avoir change entre l'ouverture de la fiche et l'envoi.
  const api = fauxDocApi();
  const lie = pontFormulaire({
    couche: COUCHE_PONT, rowId: 3, docApi: api, peutEcrire: () => false,
    formulaire: { surLaCouche: false, tableId: 'Visites', via: 'batiment' },
  });
  await assert.rejects(() => lie.addRow('Visites', {}), /lecture/);

  const principal = pontFormulaire({ couche: COUCHE_PONT, rowId: 3, docApi: api, peutEcrire: () => false });
  await assert.rejects(() => principal.updateRow('x', 3, {}), /lecture/);
  assert.equal(api.actions.length, 0);
});

test('les valeurs de depart passent par le pont dans les deux modes', () => {
  const api = fauxDocApi();
  const v = { etat: 'Bon' };
  assert.deepEqual(pontFormulaire({ couche: COUCHE_PONT, rowId: 1, docApi: api, valeurs: v }).values, v);
  assert.deepEqual(pontFormulaire({
    couche: COUCHE_PONT, rowId: 1, docApi: api, valeurs: v,
    formulaire: { surLaCouche: false, tableId: 'Visites', via: 'batiment' },
  }).values, v);
  assert.deepEqual(pontFormulaire({ couche: COUCHE_PONT, rowId: 1, docApi: api }).values, {});
});

/* ---------- ce qu'un formulaire de couche n'offre jamais ---------- */

test('la geometrie est ecartee meme quand la couche ne la porte pas', () => {
  // Selon le chemin qui l'a montee, `geometryColumn` peut etre absent — et le
  // formulaire offrait alors `geometry_json` en champ texte, entre le nom et la
  // hauteur.
  const sansGeom = { sourceTable: 'Batiments_locaux' };
  const liste = formulairesPourCouche({ couche: sansGeom, entrees: [], schema: SCHEMA });
  const attributs = liste.find((f) => f.surLaCouche);
  assert.deepEqual(attributs.def.sections[0].fields.map((f) => f.colId), ['nom']);
});

test('colonnesHorsFormulaire redemande la geometrie au schema', () => {
  assert.deepEqual(colonnesHorsFormulaire({}, SCHEMA.Batiments_locaux),
    ['atlas_3d_json', 'geometry_json']);
  // Et la couche prime quand elle la connait : c'est elle qui a raison.
  assert.deepEqual(colonnesHorsFormulaire({ geometryColumn: 'geom' }, SCHEMA.Batiments_locaux),
    ['atlas_3d_json', 'geom']);
  // Sans schema ni couche, il ne reste que la memoire d'Atlas.
  assert.deepEqual(colonnesHorsFormulaire({}), ['atlas_3d_json']);
});
