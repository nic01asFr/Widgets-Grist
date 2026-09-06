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
  valeursDepuisEntite,
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
  const def = { sections: [{ fields: [{ colId: 'nom' }, { colId: 'etat' }] }] };
  const v = valeursDepuisEntite(def, { nom: 'Halle', etat: 'bon', hauteur: 12, _row_id: 4 });
  assert.deepEqual(v, { nom: 'Halle', etat: 'bon' });
});
