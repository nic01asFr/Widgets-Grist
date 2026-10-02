import test from 'node:test';
import assert from 'node:assert/strict';
import {
  departsPossibles, departsValides, departsProposes, tableDePersonnes,
  valeursDeDepart, valeurPourFormulaire, aRetenir, phrasePreremplis, sansChamps, reglagesFormulaire,
} from '../lib/fiche-formulaire.js';

// Un formulaire de visite tel qu'un formulaire Grist natif le donne (01/10/2026).
const VISITE = {
  id: 'grist-form:29', tableId: 'Visites',
  sections: [{ id: 's1', label: 'Visite', fields: [
    { colId: 'Date_visite', label: 'Date de la visite', type: 'Date', widget: 'date' },
    { colId: 'Inspecteurs', label: 'Inspecteur(s)', type: 'RefList:Agents', widget: 'multiselect' },
    { colId: 'Ouvrage', label: 'Ouvrage', type: 'Ref:Ouvrages', widget: 'select' },
    { colId: 'Etat', label: 'État', type: 'Ref:Etats', widget: 'radio' },
    { colId: 'Constat', label: 'Constat', type: 'Text', widget: 'textarea' },
    { colId: 'Photo1', label: 'Photo', type: 'Attachments', widget: 'file' },
  ] }],
};
const SCHEMA = {
  Agents: [{ colId: 'Nom' }, { colId: 'Adresse_mail' }],
  Etats: [{ colId: 'Etat_possible' }, { colId: 'Couleur' }],
};

test('un champ ne propose que les départs qui ont un sens pour lui', () => {
  const [date, insp, , , , photo] = VISITE.sections[0].fields;
  assert.deepEqual(departsPossibles(date, { lie: true }), ['vide', 'aujourdhui', 'precedente', 'reprise']);
  assert.deepEqual(departsPossibles(insp, { lie: true }), ['vide', 'precedente', 'reprise']);
  assert.deepEqual(departsPossibles(insp), ['vide', 'precedente'], 'sans ligne liée, pas de reprise');
  assert.deepEqual(departsPossibles(photo, { lie: true }), ['vide'], 'une photo part toujours vide');
});

test('Atlas propose la date du jour et la dernière personne, rien d’autre', () => {
  assert.ok(tableDePersonnes(SCHEMA, 'Agents'));
  assert.ok(tableDePersonnes({ Agents_terrain: [] }, 'Agents_terrain'));
  assert.ok(tableDePersonnes({}, 'TableAgents'), 'un mot entier, même collé en casse mixte');
  assert.ok(tableDePersonnes({}, 'Équipiers'));
  // Des sous-chaînes ne sont pas des personnes : préremplir l'équipement de la
  // visite d'avant aurait écrit une valeur fausse sous un simple « Vérifiez ».
  for (const t of ['Equipements', 'Inspections', 'Operations', 'Hauteurs', 'Reagents', 'Userstories']) {
    assert.ok(!tableDePersonnes({}, t), t);
  }
  assert.ok(tableDePersonnes({ Contacts: [{ colId: 'Courriel' }] }, 'Contacts'), 'une adresse suffit');
  assert.ok(!tableDePersonnes(SCHEMA, 'Etats'));
  assert.deepEqual(departsProposes(VISITE, { schema: SCHEMA }), { Date_visite: 'aujourdhui', Inspecteurs: 'precedente' });
});

test('les valeurs de départ, dans la langue du formulaire, et ce qui a été prérempli', () => {
  const departs = { Date_visite: 'aujourdhui', Inspecteurs: 'precedente', Etat: 'reprise', Constat: 'vide' };
  const { valeurs, preremplis } = valeursDeDepart(VISITE, departs, {
    maintenant: new Date(2026, 9, 1, 23, 30),
    precedentes: { Inspecteurs: ['L', 4, 7] },
    derniere: { Etat: 2, Constat: 'fissure' },
  });
  assert.deepEqual(valeurs, { Date_visite: '2026-10-01', Inspecteurs: ['4', '7'], Etat: '2' },
    'la date est celle de la personne, pas celle de Greenwich');
  assert.deepEqual(preremplis.map((p) => p.colId), ['Date_visite', 'Inspecteurs', 'Etat']);
  assert.equal(phrasePreremplis(preremplis), 'Prérempli : Date de la visite, Inspecteur(s) et État. Vérifiez avant d’envoyer.');
  assert.equal(phrasePreremplis([]), '');
});

test('sans saisie précédente ni ligne passée, rien n’est inventé', () => {
  const { valeurs, preremplis } = valeursDeDepart(VISITE, { Inspecteurs: 'precedente', Etat: 'reprise' }, {});
  assert.deepEqual(valeurs, {});
  assert.deepEqual(preremplis, []);
});

test('on ne retient que ce qui doit partir de la dernière saisie', () => {
  const data = { Date_visite: 1790000000, Inspecteurs: ['L', 4], Constat: 'RAS' };
  assert.deepEqual(aRetenir(data, { Date_visite: 'aujourdhui', Inspecteurs: 'precedente' }), { Inspecteurs: ['L', 4] });
  assert.deepEqual(aRetenir(data, {}), {});
});

test('les départs enregistrés sont relus avec prudence', () => {
  assert.deepEqual(departsValides({ f: { A: 'aujourdhui', B: 'inconnu', C: 'vide' }, g: {} }),
    { f: { A: 'aujourdhui', C: 'vide' }, g: {} });
  assert.deepEqual(departsValides(['x']), {});
  assert.deepEqual(reglagesFormulaire({ formulaire: { departs: { f: { A: 'reprise' } } } }).departs, { f: { A: 'reprise' } });
});

test('un formulaire lié ne montre pas la référence que le clic porte', () => {
  const sans = sansChamps(VISITE, ['Ouvrage']);
  assert.ok(!sans.sections[0].fields.some((c) => c.colId === 'Ouvrage'));
  assert.equal(sansChamps(VISITE, ['Absent']), VISITE, 'rien à ôter, même objet');
  assert.equal(VISITE.sections[0].fields.length, 6, 'l’original est intact');
});

test('le formulaire Grist d’une table liée sert le relevé, sans sa référence, avec ses départs', async () => {
  const { formulairesPourCouche } = await import('../lib/fiche-formulaire.js');
  const schema = {
    Ouvrages: [{ colId: 'Nom', type: 'Text' }],
    Visites: VISITE.sections[0].fields.map((c) => ({ colId: c.colId, type: c.type })),
    ...SCHEMA,
  };
  const natif = { formId: VISITE.id, titre: 'Ajout d’une visite', tableCible: 'Visites', statut: 'publie', source: 'grist', def: VISITE };
  const liees = formulairesPourCouche({ couche: { sourceTable: 'Ouvrages' }, entrees: [natif], schema })
    .filter((f) => !f.surLaCouche);
  assert.equal(liees.length, 1, 'le natif remplace le formulaire déduit');
  const [f] = liees;
  assert.equal(f.source, 'grist');
  assert.equal(f.via, 'Ouvrage');
  assert.ok(!f.def.sections[0].fields.some((c) => c.colId === 'Ouvrage'));
  assert.deepEqual(f.departs, { Date_visite: 'aujourdhui', Inspecteurs: 'precedente' });
  const decide = formulairesPourCouche({
    couche: { sourceTable: 'Ouvrages', formulaire: { departs: { [VISITE.id]: {} } } }, entrees: [natif], schema,
  }).find((x) => !x.surLaCouche);
  assert.deepEqual(decide.departs, {}, 'une décision « rien » l’emporte sur la proposition');
});

test('une colonne DateTime avec fuseau est une date : « Aujourd’hui » est offert et rempli', () => {
  const def = { sections: [{ fields: [
    { colId: 'Passage', label: 'Passage', type: 'DateTime:Europe/Paris', widget: 'datetime' },
  ] }] };
  assert.deepEqual(departsPossibles(def.sections[0].fields[0], { lie: true }), ['vide', 'aujourdhui', 'precedente', 'reprise']);
  const { valeurs } = valeursDeDepart(def, { Passage: 'aujourdhui' }, { maintenant: new Date(2026, 9, 2, 14, 30) });
  assert.deepEqual(valeurs, { Passage: '2026-10-02T14:30' });
  assert.equal(valeurPourFormulaire(def.sections[0].fields[0], 1790951400).genre, 'date');
});

test('un réglage nommé __proto__ ne touche pas le prototype', () => {
  const brut = JSON.parse('{"__proto__":{"A":"vide"},"f":{"__proto__":"vide","B":"vide"}}');
  const r = departsValides(brut);
  assert.deepEqual(Object.keys(r), ['f']);
  assert.deepEqual(r.f, { B: 'vide' });
  assert.equal({}.A, undefined);
});
