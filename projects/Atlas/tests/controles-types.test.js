/**
 * Contrôles : chaque type de colonne Grist se contrôle, et les deux filtres
 * (entités détenues / carte seule) classent pareil.
 *
 * node --test "projects/Atlas/tests/controles-types.test.js"
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tableToGeoJSON } from '../lib/geo-tables.js';
import { featureToRowUpdate, mergeFeatureOverrides } from '../lib/grist-sync.js';
import { valeursPourMoteur } from '../lib/fiche-formulaire.js';
import { captureStoryState } from '../lib/story.js';
import {
  layerFieldNames,
  nombreDe,
  valeurTemporelle,
  valeursDeCellule,
  typeControleGrist,
  profilChamp,
  controlBounds,
  controlUniqueValues,
  buildControlPredicate,
  expressionFiltreControles,
  filtrableSurLaCarte,
  controlsPrefsPayload,
  applyControlsFromPrefs,
  applyStoryControlsToLayer,
  fmtControlValue,
  SEUIL_CATEGORIES,
} from '../lib/controls.js';
import { evaluer } from './aide-expressions.js';

/* ---------------------------------------------------------------------------
   Une table Grist qui porte chaque type de colonne, lue comme Atlas la lit.
   --------------------------------------------------------------------------- */

const J = 86400; // un jour, en secondes
const colonnes = {
  id: [1, 2, 3, 4, 5, 6],
  geometry_json: Array(6).fill('{"type":"Point","coordinates":[3.69,43.40]}'),
  nom: ['Halle', 'Théâtre', 'Mairie', 'Silo', 'Hangar', 'Café du port'],
  etat: ['Bon', '', 'Bon', 'Mauvais', 'Moyen', 'Bon'],
  usages: [['L', 'marché', 'fête'], ['L', 'spectacle'], ['L'], null, ['L', 'stockage', 'marché'], ['L', 'restauration']],
  verifie: [true, false, false, true, false, true],
  hauteur: [3.5, 8, 12.5, 18, null, 6],
  niveaux: [1, 2, 3, 3, 1, 2],
  visite: [1773446400, 1773446400 + 30 * J, null, 1773446400 + 90 * J, 1773446400 + 10 * J, 1773446400 + 60 * J],
  batiment: [12, 13, 12, 14, 15, 12],
  proprietaires: [['L', 3, 4], ['L', 4], ['L'], ['L', 5], null, ['L', 3]],
  surface_txt: ['12,5', '40', '7,25', '100', '', '63'],
  releve_fr: ['14/03/2026', '13/04/2026', '', '12/06/2026', '24/03/2026', '13/05/2026'],
};
const TYPES = {
  nom: 'Text', etat: 'Choice', usages: 'ChoiceList', verifie: 'Bool', hauteur: 'Numeric',
  niveaux: 'Int', visite: 'Date', batiment: 'Ref:Batiments', proprietaires: 'RefList:Personnes',
  surface_txt: 'Text', releve_fr: 'Text',
};

function coucheTable() {
  return {
    id: 'bati', name: 'Bâtiments', sourceTable: 'Batiments_locaux', geometryColumn: 'geometry_json',
    geojson: tableToGeoJSON(colonnes, 'geometry_json'),
    controls: [],
  };
}

/* ---------------------------------------------------------------------------
   Les listes Grist
   --------------------------------------------------------------------------- */

test('une liste Grist est lue entière — plus jamais « L »', () => {
  const [halle, theatre, mairie] = coucheTable().geojson.features;
  assert.equal(halle.properties.usages, 'marché, fête', 'lisible sur la carte');
  assert.deepEqual(halle.properties._l_usages, ['marché', 'fête'], 'entière pour les filtres');
  assert.equal(theatre.properties.usages, 'spectacle');
  assert.equal(mairie.properties.usages, '', 'une liste vide est vide');
  assert.deepEqual(halle.properties._l_proprietaires, [3, 4], 'une RefList garde ses numéros');
});

test('une liste se réécrit dans son codage Grist', () => {
  // Sans cela, déplacer un objet réécrivait « marché, fête » — ou « L »,
  // avant la correction — dans la colonne ChoiceList.
  const couche = coucheTable();
  const upd = featureToRowUpdate(couche.geojson.features[0], couche).update;
  assert.deepEqual(upd.usages, ['L', 'marché', 'fête']);
  assert.deepEqual(upd.proprietaires, ['L', 3, 4]);
  assert.equal(upd.nom, 'Halle');
});

test('un rafraîchissement ne rend pas l’ancienne liste', () => {
  const avant = coucheTable().geojson;
  const apres = tableToGeoJSON({ ...colonnes, usages: [['L', 'marché'], ...colonnes.usages.slice(1)] }, 'geometry_json');
  mergeFeatureOverrides(avant, apres);
  assert.deepEqual(apres.features[0].properties._l_usages, ['marché']);
});

test('la fiche coche les choix de la liste', () => {
  const def = { sections: [{ fields: [{ colId: 'usages', type: 'ChoiceList', widget: 'multiselect' }] }] };
  const props = coucheTable().geojson.features[0].properties;
  assert.deepEqual(valeursPourMoteur(def, props), { usages: ['marché', 'fête'] });
});

/* ---------------------------------------------------------------------------
   Lire une valeur
   --------------------------------------------------------------------------- */

test('nombreDe : la virgule décimale, et rien de plus', () => {
  assert.equal(nombreDe('12,5'), 12.5);
  assert.equal(nombreDe(' 40 '), 40);
  assert.equal(nombreDe(8), 8);
  assert.ok(Number.isNaN(nombreDe('12 m')));
  assert.ok(Number.isNaN(nombreDe(true)));
  assert.ok(Number.isNaN(nombreDe('')));
});

test('valeurTemporelle : secondes Grist, jour/mois français, ISO', () => {
  assert.equal(valeurTemporelle(1773446400, 's'), 1773446400000);
  assert.equal(valeurTemporelle('14/03/2026'), Date.UTC(2026, 2, 14), 'jour/mois, pas mois/jour');
  assert.equal(valeurTemporelle('2026-03-14'), Date.parse('2026-03-14'));
  assert.ok(Number.isNaN(valeurTemporelle('13/14/2026')), 'pas de 14e mois');
  assert.ok(Number.isNaN(valeurTemporelle('bientôt')));
});

test('valeursDeCellule : une par choix, aucune pour une cellule vide', () => {
  const [halle, , mairie] = coucheTable().geojson.features;
  assert.deepEqual(valeursDeCellule(halle.properties, 'usages'), ['marché', 'fête']);
  assert.deepEqual(valeursDeCellule(mairie.properties, 'usages'), []);
  assert.deepEqual(valeursDeCellule({ etat: '' }, 'etat'), []);
});

/* ---------------------------------------------------------------------------
   Chaque colonne a son contrôle
   --------------------------------------------------------------------------- */

test('le type Grist décide d’abord', () => {
  assert.equal(typeControleGrist('Date'), 'time');
  assert.equal(typeControleGrist('DateTime:Europe/Paris'), 'time');
  assert.equal(typeControleGrist('Numeric'), 'range');
  assert.equal(typeControleGrist('Ref:Batiments'), 'select');
  assert.equal(typeControleGrist('ChoiceList'), 'select');
  assert.equal(typeControleGrist('Text'), null, 'un texte se juge sur ses valeurs');
});

test('chaque colonne de la table reçoit un contrôle approprié', () => {
  const c = coucheTable();
  const attendu = {
    nom: 'select', etat: 'select', usages: 'select', verifie: 'select', hauteur: 'range',
    niveaux: 'range', visite: 'time', batiment: 'select', proprietaires: 'select',
    surface_txt: 'range', releve_fr: 'time',
  };
  for (const [champ, type] of Object.entries(attendu)) {
    assert.equal(profilChamp(c, champ, TYPES[champ]).type, type, champ);
  }
});

test('une date Grist est en secondes : le contrôle le sait', () => {
  const p = profilChamp(coucheTable(), 'visite', 'Date');
  assert.equal(p.unite, 's');
  const b = controlBounds(coucheTable(), 'time', 'visite', { unite: 's' });
  assert.equal(b.dataMin, 1773446400000, 'en millisecondes, pas 1,7 milliard « de quelque chose »');
  assert.equal(fmtControlValue({ type: 'time' }, b.dataMin), '14/03/2026');
});

test('un booléen se filtre en catégories, et seulement ainsi', () => {
  const p = profilChamp(coucheTable(), 'verifie', 'Bool');
  assert.equal(p.type, 'select');
  assert.equal(p.booleen, true);
  assert.deepEqual(p.typesPossibles, ['select']);
});

test('un entier à peu de valeurs se filtre aussi par catégories', () => {
  const p = profilChamp(coucheTable(), 'niveaux', 'Int');
  assert.deepEqual(p.typesPossibles, ['range', 'select']);
  assert.equal(p.entier, true);
  assert.equal(controlBounds(coucheTable(), 'range', 'niveaux').entier, true, 'le curseur avance par unités');
});

test('un texte aux valeurs nombreuses se cherche au lieu d’être ignoré', () => {
  const noms = Array.from({ length: SEUIL_CATEGORIES + 5 }, (_, i) => ({
    type: 'Feature', geometry: null, properties: { nom: `Bâtiment ${i}` },
  }));
  const c = { geojson: { type: 'FeatureCollection', features: noms } };
  assert.equal(profilChamp(c, 'nom', 'Text').type, 'text', 'il n’était contrôlable d’aucune façon');
});

test('une liste compte chaque choix', () => {
  const valeurs = controlUniqueValues(coucheTable(), 'usages').map((v) => [v.value, v.count]);
  assert.deepEqual(Object.fromEntries(valeurs), { marché: 2, fête: 1, spectacle: 1, stockage: 1, restauration: 1 });
});

test('un champ sans valeur est signalé, pas deviné', () => {
  const vide = { geojson: { type: 'FeatureCollection', features: [{ properties: { visite: null } }] } };
  const p = profilChamp(vide, 'visite', 'Date');
  assert.equal(p.vide, true);
  assert.equal(p.type, null);
});

test('les champs ajoutés après le manifeste sont listés', () => {
  // Le cas constaté : `etat`, ajouté dans Grist, absent des champs déclarés.
  const c = { ...coucheTable(), _fields: [{ name: 'nom' }, { name: 'hauteur' }] };
  const champs = layerFieldNames(c);
  assert.deepEqual(champs.slice(0, 2), ['nom', 'hauteur'], 'l’ordre déclaré d’abord');
  assert.ok(champs.includes('etat'));
  assert.ok(!champs.some((x) => x.startsWith('_')), 'ni `_row_id` ni `_l_…`');
});

/* ---------------------------------------------------------------------------
   Filtrer
   --------------------------------------------------------------------------- */

function garder(couche, controles) {
  const c = { ...couche, controls: controles.map((x) => ({ active: true, ...x })) };
  const pred = buildControlPredicate(c);
  return c.geojson.features.filter(pred).map((f) => f.properties.nom);
}

test('catégorie sur une liste : l’un des choix suffit', () => {
  assert.deepEqual(garder(coucheTable(), [{ field: 'usages', type: 'select', values: ['marché'] }]), ['Halle', 'Hangar']);
});

test('sélection vide posée : rien ; pas de sélection : tout', () => {
  assert.deepEqual(garder(coucheTable(), [{ field: 'etat', type: 'select', values: [] }]), []);
  assert.equal(garder(coucheTable(), [{ field: 'etat', type: 'select' }]).length, 6);
});

test('activer une checklist ne retranche rien, pas même les objets sans valeur', () => {
  // `etat` est vide sur un bâtiment : activer le filtre l'écartait d'emblée.
  const couche = coucheTable();
  const { values } = controlBounds(couche, 'select', 'etat');
  assert.ok(values.includes(''), '« (sans valeur) » est un choix coché');
  assert.equal(garder(couche, [{ field: 'etat', type: 'select', values }]).length, 6);
  assert.deepEqual(garder(couche, [{ field: 'etat', type: 'select', values: [''] }]), ['Théâtre']);
});

test('choix unique : la première valeur seulement, sans modifier le contrôle', () => {
  const c = { field: 'etat', type: 'select', variant: 'select_single', values: ['Mauvais', 'Bon'] };
  assert.deepEqual(garder(coucheTable(), [c]), ['Silo']);
});

test('texte : sans majuscules ni accents', () => {
  assert.deepEqual(garder(coucheTable(), [{ field: 'nom', type: 'text', texte: 'THEATRE' }]), ['Théâtre']);
  assert.equal(garder(coucheTable(), [{ field: 'nom', type: 'text', texte: '  ' }]).length, 6, 'vide : aucun filtre');
});

test('nombre : plage, minimum seul, maximum seul', () => {
  const base = { field: 'hauteur', type: 'range', min: 6, max: 12.5 };
  assert.deepEqual(garder(coucheTable(), [{ ...base, variant: 'range_between' }]), ['Théâtre', 'Mairie', 'Hangar', 'Café du port']);
  assert.deepEqual(garder(coucheTable(), [{ ...base, variant: 'range_min' }]), ['Théâtre', 'Mairie', 'Silo', 'Hangar', 'Café du port']);
  assert.deepEqual(garder(coucheTable(), [{ ...base, variant: 'range_max' }]), ['Halle', 'Théâtre', 'Mairie', 'Hangar', 'Café du port']);
  assert.deepEqual(garder(coucheTable(), [{ ...base, variant: 'range_between', requireValue: true }]), ['Théâtre', 'Mairie', 'Café du port']);
});

test('nombre à virgule décimale', () => {
  assert.deepEqual(garder(coucheTable(), [{ field: 'surface_txt', type: 'range', min: 10, max: 50 }]), ['Halle', 'Théâtre', 'Hangar']);
});

test('date Grist, jusqu’à une date et entre deux dates', () => {
  const debut = Date.UTC(2026, 2, 14);
  const lte = { field: 'visite', type: 'time', unite: 's', variant: 'time_lte', min: debut, max: debut + 30 * J * 1000 };
  assert.deepEqual(garder(coucheTable(), [lte]), ['Halle', 'Théâtre', 'Mairie', 'Hangar']);
  const entre = { ...lte, variant: 'time_between', min: debut + 5 * J * 1000 };
  assert.deepEqual(garder(coucheTable(), [entre]), ['Théâtre', 'Mairie', 'Hangar']);
});

test('date française, jour/mois', () => {
  const avril = { field: 'releve_fr', type: 'time', variant: 'time_lte', max: Date.UTC(2026, 3, 30) };
  assert.deepEqual(garder(coucheTable(), [avril]), ['Halle', 'Théâtre', 'Mairie', 'Hangar']);
});

/* ---------------------------------------------------------------------------
   Les deux filtres classent pareil
   --------------------------------------------------------------------------- */

/** Une couche distante : GeoJSON brut, sans listes Grist ni accents à retirer. */
const distante = {
  id: 'd', name: 'Distante',
  geojson: {
    type: 'FeatureCollection',
    features: [
      { properties: { nom: 'halle', etat: 'Bon', hauteur: 3.5, visite: 1773446400 } },
      { properties: { nom: 'theatre', etat: '', hauteur: 8, visite: 1773446400 + 30 * J } },
      { properties: { nom: 'mairie', etat: 'bon', hauteur: 12.5, visite: null } },
      { properties: { nom: 'silo', etat: 'Mauvais', hauteur: 18, visite: 1773446400 + 90 * J } },
      { properties: { nom: 'hangar', etat: 'Moyen', hauteur: null, visite: 1773446400 + 10 * J } },
      { properties: { nom: 'cafe du port', etat: 'Bon', hauteur: '6', visite: 1773446400 + 60 * J } },
    ],
  },
};

const REGLAGES = {
  'catégorie, deux valeurs': [{ field: 'etat', type: 'select', values: ['Bon', 'Moyen'] }],
  'catégorie, casse différente': [{ field: 'etat', type: 'select', values: ['BON'] }],
  'catégorie, sélection vide': [{ field: 'etat', type: 'select', values: [] }],
  'catégorie, pas de sélection': [{ field: 'etat', type: 'select' }],
  'catégorie, sans valeur retenue': [{ field: 'etat', type: 'select', values: ['', 'Moyen'] }],
  'choix unique': [{ field: 'etat', type: 'select', variant: 'select_single', values: ['Mauvais', 'Bon'] }],
  'texte': [{ field: 'nom', type: 'text', texte: 'du' }],
  'plage': [{ field: 'hauteur', type: 'range', variant: 'range_between', min: 5, max: 13 }],
  'minimum seul': [{ field: 'hauteur', type: 'range', variant: 'range_min', min: 8, max: 9 }],
  'maximum seul': [{ field: 'hauteur', type: 'range', variant: 'range_max', min: 7, max: 9 }],
  'plage, valeur exigée': [{ field: 'hauteur', type: 'range', min: 0, max: 100, requireValue: true }],
  'date Grist jusqu’à': [{ field: 'visite', type: 'time', unite: 's', variant: 'time_lte', min: 0, max: (1773446400 + 45 * J) * 1000 }],
  'date Grist entre': [{ field: 'visite', type: 'time', unite: 's', variant: 'time_between', min: (1773446400 + 5 * J) * 1000, max: (1773446400 + 70 * J) * 1000 }],
  'deux contrôles': [
    { field: 'etat', type: 'select', values: ['Bon'] },
    { field: 'hauteur', type: 'range', min: 5, max: 20 },
  ],
};

for (const [nom, controles] of Object.entries(REGLAGES)) {
  test(`même classement sur la carte et en local : ${nom}`, () => {
    const couche = { ...distante, controls: controles.map((c) => ({ active: true, ...c })) };
    const pred = buildControlPredicate(couche);
    const expr = expressionFiltreControles(couche);
    for (const f of couche.geojson.features) {
      const local = pred(f);
      const carte = expr == null ? true : !!evaluer(expr, f.properties);
      assert.equal(carte, local, `${f.properties.nom} : carte ${carte}, local ${local}`);
    }
  });
}

test('une date textuelle ne se filtre pas sur la carte, et on peut le dire', () => {
  assert.equal(filtrableSurLaCarte({ type: 'time' }), false);
  assert.equal(filtrableSurLaCarte({ type: 'time', unite: 's' }), true);
  assert.equal(filtrableSurLaCarte({ type: 'range' }), true);
});

/* ---------------------------------------------------------------------------
   Rien ne se perd
   --------------------------------------------------------------------------- */

test('la forme complète d’un contrôle survit au rechargement', () => {
  const avant = coucheTable();
  avant.controls = [
    { field: 'hauteur', type: 'range', active: true, variant: 'range_max', min: 3.5, max: 10, dataMin: 3.5, dataMax: 18, requireValue: true },
    { field: 'visite', type: 'time', active: true, variant: 'time_between', unite: 's', min: 1, max: 2, dataMin: 0, dataMax: 3 },
    { field: 'nom', type: 'text', active: true, variant: 'text_contains', texte: 'port' },
    { field: 'niveaux', type: 'range', active: false, entier: true, min: 1, max: 3, dataMin: 1, dataMax: 3 },
  ];
  const payload = JSON.parse(JSON.stringify(controlsPrefsPayload(avant)));
  const apres = coucheTable();
  applyControlsFromPrefs(apres, payload);
  const par = Object.fromEntries(apres.controls.map((c) => [c.field, c]));
  assert.equal(par.hauteur.variant, 'range_max');
  assert.equal(par.hauteur.requireValue, true);
  assert.equal(par.visite.unite, 's');
  assert.equal(par.visite.variant, 'time_between');
  assert.equal(par.nom.type, 'text');
  assert.equal(par.nom.texte, 'port');
  assert.equal(par.niveaux.entier, true);
});

test('une étape de récit rejoue la forme du contrôle', () => {
  const couche = coucheTable();
  couche.visible = true;
  couche.style = {};
  couche.controls = [
    { field: 'hauteur', type: 'range', active: true, variant: 'range_max', min: 3.5, max: 10, dataMin: 3.5, dataMax: 18 },
    { field: 'nom', type: 'text', active: true, variant: 'text_contains', texte: 'port' },
  ];
  const etape = captureStoryState(null, { settings: { projection: 'globe', timeOfDay: 0, date: new Date() }, layers: [couche] });
  const ctrl = etape.layers[0].controls;
  const cible = coucheTable();
  applyStoryControlsToLayer(cible, ctrl);
  const par = Object.fromEntries(cible.controls.map((c) => [c.field, c]));
  assert.equal(par.hauteur.variant, 'range_max');
  assert.equal(par.nom.texte, 'port');
});
