import test from 'node:test';
import assert from 'node:assert/strict';
import {
  idsPiecesJointes, bulleParDefaut, colonneDate, derniereLigneLiee, nombreLignesLiees,
  dateCourte, lienItineraire, couleurTexte, modeleBulle,
} from '../lib/bulle-objet.js';

// Forme d'une table d'ouvrages reelle (01/10/2026), noms reformules.
const OUVRAGES = [
  { colId: 'Domaine', type: 'Ref:Domaines' }, { colId: 'Nom', type: 'Text' },
  { colId: 'Agent_responsable', type: 'Text', isFormula: true }, { colId: 'Latitude_WGS84', type: 'Numeric' },
  { colId: 'Type', type: 'Ref:Types' }, { colId: 'Nb_visites', type: 'Numeric', isFormula: true },
  { colId: 'Description_ouvrage', type: 'Text' }, { colId: 'Etat', type: 'Text', isFormula: true },
  { colId: 'Photo1', type: 'Attachments' }, { colId: 'Photo2', type: 'Attachments' },
  { colId: 'Historique_des_modifications', type: 'Text' }, { colId: 'latitude', type: 'Numeric', isFormula: true },
  { colId: 'Inspecteurs', type: 'RefList:Agents' },
];
const VISITES = [
  { colId: 'Ouvrage', type: 'Ref:Ouvrages' }, { colId: 'Date_realise', type: 'Date' },
  { colId: 'Description', type: 'Text' }, { colId: 'Etat', type: 'Ref:Etats' },
];

test('les pieces jointes se lisent sous toutes leurs formes', () => {
  assert.deepEqual(idsPiecesJointes(['L', 45, 46]), [45, 46]);
  assert.deepEqual(idsPiecesJointes([3]), [3]);
  assert.deepEqual(idsPiecesJointes(7), [7]);
  assert.deepEqual(idsPiecesJointes(null), []);
  assert.deepEqual(idsPiecesJointes('L'), []);
  assert.deepEqual(idsPiecesJointes('1, 2'), [1, 2], 'la liste qu’Atlas range en texte');
});

test('la configuration de depart : un titre, les photos, quelques champs, sans technique', () => {
  const b = bulleParDefaut(OUVRAGES, { pastilles: ['Etat'], lien: { table: 'Visites', via: 'Ouvrage', date: 'Date_realise' } });
  assert.equal(b.titre, 'Nom');
  assert.deepEqual(b.photos, ['Photo1', 'Photo2']);
  assert.deepEqual(b.pastilles, ['Etat']);
  assert.equal(b.champs.length, 4);
  for (const c of b.champs) {
    assert.ok(!/Historique|latitude|Photo|Etat|Nom|Inspecteurs/i.test(c), c);
  }
  assert.deepEqual(b.actions, { fiche: true, visite: true, itineraire: true });
  assert.equal(bulleParDefaut(OUVRAGES).actions.visite, false, 'pas de table liee, pas de nouvelle visite');
});

test('la derniere visite : la plus recente des lignes de l’objet', () => {
  assert.equal(colonneDate(VISITES), 'Date_realise');
  const lignes = [
    { id: 1, Ouvrage: 4, Date_realise: 1700000000 },
    { id: 2, Ouvrage: 4, Date_realise: 1720000000, Description: 'fissure' },
    { id: 3, Ouvrage: 5, Date_realise: 1730000000 },
    { id: 4, Ouvrage: ['R', 4], Date_realise: 1710000000 },
  ];
  assert.equal(derniereLigneLiee(lignes, 'Ouvrage', 4, 'Date_realise').id, 2);
  assert.equal(nombreLignesLiees(lignes, 'Ouvrage', 4), 3);
  assert.equal(derniereLigneLiee(lignes, 'Ouvrage', 9, 'Date_realise'), null);
  assert.equal(dateCourte(1720000000), '03/07/2024');
  assert.equal(dateCourte(null), '');
});

test('l’itineraire : geo: dans l’application, OpenStreetMap ailleurs', () => {
  assert.equal(lienItineraire(5.4, 43.3, { application: true }), 'geo:43.300000,5.400000?q=43.300000,5.400000');
  assert.match(lienItineraire(5.4, 43.3), /^https:\/\/www\.openstreetmap\.org\/directions\?to=43\.300000%2C5\.400000/);
  assert.equal(lienItineraire(NaN, 43), null);
});

test('le texte d’une pastille reste lisible sur sa couleur', () => {
  assert.equal(couleurTexte('#FFFF00'), '#1a1a1a');
  assert.equal(couleurTexte('#0000ff'), '#ffffff');
  assert.equal(couleurTexte('#90EE90'), '#1a1a1a');
  assert.equal(couleurTexte('#000000'), '#ffffff');
});

test('le contenu d’une bulle : titre, photos, pastilles colorees, champs, derniere visite, actions', () => {
  const config = bulleParDefaut(OUVRAGES, { pastilles: ['Etat'], lien: { table: 'Visites', via: 'Ouvrage', date: 'Date_realise' } });
  const m = modeleBulle(config, {
    Nom: 'Pont du moulin', Photo1: ['L', 45], Photo2: ['L', 46, 47], Etat: 'D_État critique',
    Description_ouvrage: 'Voûte en pierre', Type: 2,
  }, {
    pastille: (c, v) => (c === 'Etat' ? { texte: v, couleur: '#FF0000' } : null),
    valeur: (c, v) => (c === 'Type' ? 'Passerelle bois' : (v == null ? '' : String(v))),
    derniere: { date: 1720000000, texte: 'fissure', nombre: 3 },
    itineraire: 'geo:43,5',
  });
  assert.equal(m.titre, 'Pont du moulin');
  assert.deepEqual(m.photos, [45, 46, 47]);
  assert.deepEqual(m.pastilles[0], { champ: 'Etat', libelle: 'Etat', texte: 'D_État critique', couleur: '#FF0000', encre: '#ffffff' });
  assert.ok(m.lignes.some((l) => l.valeur === 'Passerelle bois'), 'un Ref par son libelle');
  assert.ok(m.lignes.every((l) => l.valeur !== ''), 'un champ vide ne fait pas de ligne');
  assert.deepEqual(m.derniere, { texte: '03/07/2024 · fissure', nombre: 3 });
  assert.deepEqual(m.actions.map((a) => a.cle), ['visite', 'fiche', 'itineraire']);
  // Ce qu'Atlas lit d'une table : la liste en texte, et la vraie sous `_l_`.
  assert.deepEqual(modeleBulle(config, { Photo1: '45, 46', _l_Photo1: ['L', 45, 46] }, {}).photos, [45, 46]);
  const sans = modeleBulle(config, { Nom: 'X' }, { derniere: null });
  assert.equal(sans.derniere.texte, 'Aucune visite');
  assert.ok(!sans.actions.some((a) => a.cle === 'itineraire'), 'pas de position, pas d’itineraire');
});
