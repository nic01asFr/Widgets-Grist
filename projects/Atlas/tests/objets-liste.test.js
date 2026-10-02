import test from 'node:test';
import assert from 'node:assert/strict';
import {
  champsDeLEntite, entreeObjet, listerObjets, dernieresParObjet, MAX_LIGNES,
} from '../lib/objets-liste.js';

// Forme d'une table d'ouvrages relevée dans un document réel (01/10/2026), noms reformulés.
const COLONNES = [
  { colId: 'Nom', type: 'Text' },
  { colId: 'Domaine', type: 'Ref:Domaines' },
  { colId: 'Type', type: 'Ref:Types' },
  { colId: 'Inspecteurs', type: 'RefList:Agents' },
  { colId: 'Themes', type: 'ChoiceList' },
  { colId: 'Derniere', type: 'Date' },
  { colId: 'Suivi', type: 'Bool' },
  { colId: 'Photo1', type: 'Attachments' },
  { colId: 'Description', type: 'Text' },
  { colId: 'Hauteur', type: 'Numeric' },
  { colId: 'geometry_json', type: 'Text' },
];
const LIBELLES = {
  Domaine: new Map([['1', 'ETANG-AULNES'], ['2', 'MARAIS-NORD']]),
  Type: new Map([['5', 'Passerelle bois']]),
  Inspecteurs: new Map([['7', 'Camille Martin'], ['8', 'Alex Durand']]),
};
const options = { libelles: LIBELLES, libelleDe: (c) => c.replace(/_/g, ' '), exclus: (c) => c === 'geometry_json' };

function objet(idx, props, point = null) {
  const champs = champsDeLEntite(props, COLONNES, options);
  return entreeObjet({ idx, nom: props.Nom, point, champs, couleur: '#90EE90', etat: 'A_Bon état' });
}

test('les champs : une référence se cherche par son libellé, jamais par son numéro', () => {
  const champs = champsDeLEntite({
    Nom: 'Digue sud ouest', Domaine: 1, Type: 5, Inspecteurs: ['L', 7, 8], _l_Inspecteurs: ['L', 7, 8],
    Themes: ['L', 'hydraulique', 'faune'], Derniere: 1774828800, Suivi: true, Photo1: ['L', 3],
    Description: 'Vanne à graisser', Hauteur: 2.4, geometry_json: '{"type":"Point"}',
  }, COLONNES, options);
  const parLibelle = Object.fromEntries(champs.map((c) => [c.libelle, c.texte]));
  assert.equal(parLibelle.Domaine, 'ETANG-AULNES');
  assert.equal(parLibelle.Type, 'Passerelle bois');
  assert.equal(parLibelle.Inspecteurs, 'Camille Martin, Alex Durand');
  assert.equal(parLibelle.Themes, 'hydraulique, faune');
  assert.equal(parLibelle.Derniere, '30/03/2026');
  assert.equal(parLibelle.Hauteur, '2.4');
  assert.ok(!('Suivi' in parLibelle), 'un booléen n’est pas une valeur à chercher');
  assert.ok(!('Photo1' in parLibelle), 'une pièce jointe non plus');
  assert.ok(!('geometry json' in parLibelle) && !('geometry_json' in parLibelle), 'ni une colonne exclue');
});

test('les champs : une référence dont le libellé est inconnu ne laisse pas son numéro', () => {
  const champs = champsDeLEntite({ Nom: 'X', Domaine: 99 }, COLONNES, options);
  assert.ok(!champs.some((c) => c.libelle === 'Domaine'));
});

test('les champs : un texte long est tronqué, un objet vide ne donne rien', () => {
  const champs = champsDeLEntite({ Description: 'a'.repeat(1000) }, COLONNES, options);
  assert.equal(champs[0].texte.length, 160);
  assert.deepEqual(champsDeLEntite(null, COLONNES, options), []);
  assert.deepEqual(champsDeLEntite({}, COLONNES, options), []);
});

const ENTREES = [
  objet(0, { Nom: 'Digue sud ouest', Domaine: 1, Type: 5, Description: 'Vanne à graisser' }, [4.7837, 43.585]),
  objet(1, { Nom: 'Passerelle des aulnes', Domaine: 2, Type: 5 }, [4.79, 43.59]),
  objet(2, { Nom: 'Pont du moulin', Domaine: 1 }, [4.80, 43.60]),
  objet(3, { Nom: 'Écluse 12', Domaine: 2, Inspecteurs: ['L', 7] }, null),
  objet(4, { Nom: 'Écluse 2' }, [4.78, 43.58]),
];

test('sans requête : tous, triés par nom (numérique, accents ignorés)', () => {
  const r = listerObjets(ENTREES, { tri: 'nom' });
  assert.equal(r.total, 5);
  assert.deepEqual(r.items.map((i) => i.nom), ['Digue sud ouest', 'Écluse 2', 'Écluse 12', 'Passerelle des aulnes', 'Pont du moulin']);
});

test('la recherche trouve dans un champ, et dit où', () => {
  const r = listerObjets(ENTREES, { requete: 'etang' });
  assert.deepEqual(r.items.map((i) => i.nom), ['Digue sud ouest', 'Pont du moulin']);
  assert.deepEqual(r.items[0].trouveDans, { libelle: 'Domaine', texte: 'ETANG-AULNES' });
});

test('tous les mots doivent se retrouver, dans le nom ou dans un champ', () => {
  assert.deepEqual(listerObjets(ENTREES, { requete: 'digue etang' }).items.map((i) => i.nom), ['Digue sud ouest']);
  // « Passerelle des aulnes » les a dans son nom ; « Digue sud ouest » dans son domaine et son type.
  assert.deepEqual(listerObjets(ENTREES, { requete: 'aulnes passerelle' }).items.map((i) => i.nom), ['Passerelle des aulnes', 'Digue sud ouest']);
  assert.equal(listerObjets(ENTREES, { requete: 'digue camille' }).total, 0);
});

test('le nom prime sur un champ, et son début sur son milieu', () => {
  const r = listerObjets(ENTREES, { requete: 'aulnes' });
  // « Passerelle des aulnes » : dans le nom ; « Digue sud ouest » : dans le domaine seulement.
  assert.deepEqual(r.items.map((i) => i.nom), ['Passerelle des aulnes', 'Digue sud ouest', 'Pont du moulin']);
  assert.equal(listerObjets(ENTREES, { requete: 'pon' }).items[0].nom, 'Pont du moulin');
});

test('un mot d’une seule lettre ne cherche que le début du nom', () => {
  assert.deepEqual(listerObjets(ENTREES, { requete: 'p' }).items.map((i) => i.nom).sort(), ['Passerelle des aulnes', 'Pont du moulin']);
});

test('accents et casse ne comptent pas', () => {
  assert.deepEqual(listerObjets(ENTREES, { requete: 'ECLUSE' }).items.map((i) => i.nom).sort(), ['Écluse 12', 'Écluse 2']);
  assert.equal(listerObjets(ENTREES, { requete: 'camille' }).items[0].nom, 'Écluse 12');
});

test('par distance : le plus proche d’abord, ceux sans position à la fin', () => {
  const r = listerObjets(ENTREES, { position: [4.7837, 43.585], tri: 'proche' });
  assert.deepEqual(r.items.map((i) => i.nom), ['Digue sud ouest', 'Écluse 2', 'Passerelle des aulnes', 'Pont du moulin', 'Écluse 12']);
  assert.ok(r.items[0].distance < 5);
  assert.equal(r.items.at(-1).distance, null);
});

test('sans position, « proche » retombe sur le nom', () => {
  const r = listerObjets(ENTREES, { tri: 'proche' });
  assert.equal(r.items[0].nom, 'Digue sud ouest');
  assert.ok(r.items.every((i) => i.distance === null));
});

test('les filtres de la carte : un objet masqué n’est pas proposé', () => {
  const r = listerObjets(ENTREES, { requete: 'ecluse', visible: (e) => e.idx !== 4 });
  assert.deepEqual(r.items.map((i) => i.nom), ['Écluse 12']);
});

test('une liste longue est coupée, et le total reste vrai', () => {
  const beaucoup = Array.from({ length: 120 }, (_, i) => objet(i, { Nom: `Objet ${i}` }));
  const r = listerObjets(beaucoup, { tri: 'nom' });
  assert.equal(r.total, 120);
  assert.equal(r.items.length, MAX_LIGNES);
  assert.equal(r.tronque, true);
  assert.equal(listerObjets(beaucoup, { max: 10 }).items.length, 10);
  assert.equal(listerObjets(beaucoup, { max: 0 }).items.length, 0);
});

test('le résultat reprend la couleur et l’état de l’entrée', () => {
  const [premier] = listerObjets(ENTREES, { requete: 'digue' }).items;
  assert.equal(premier.couleur, '#90EE90');
  assert.equal(premier.etat, 'A_Bon état');
});

test('dernières lignes liées : une passe, la plus récente par objet, et le nombre', () => {
  const lignes = [
    { id: 1, Ouvrage: 4, Date: 1700000000 },
    { id: 2, Ouvrage: 4, Date: 1720000000 },
    { id: 3, Ouvrage: 5, Date: 1730000000 },
    { id: 4, Ouvrage: ['R', 4], Date: 1710000000 },
    { id: 5, Ouvrage: 0, Date: 1740000000 },
    { id: 6, Ouvrage: null, Date: 1740000000 },
  ];
  const m = dernieresParObjet(lignes, 'Ouvrage', 'Date');
  assert.equal(m.size, 2);
  assert.deepEqual([m.get(4).date, m.get(4).nombre, m.get(4).ligne.id], [1720000000, 3, 2]);
  assert.deepEqual([m.get(5).date, m.get(5).nombre], [1730000000, 1]);
});

test('dernières lignes liées : sans colonne de date, la dernière créée', () => {
  const m = dernieresParObjet([{ id: 1, Ouvrage: 4 }, { id: 9, Ouvrage: 4 }, { id: 3, Ouvrage: 4 }], 'Ouvrage', null);
  assert.equal(m.get(4).ligne.id, 9);
  assert.equal(m.get(4).nombre, 3);
  assert.equal(m.get(4).date, null);
});
