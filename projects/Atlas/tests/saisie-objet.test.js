import test from 'node:test';
import assert from 'node:assert/strict';
import {
  creationPossible, pointDepuisClic, modificationPossible, aDesAltitudes, ligneDepuisTable, cellulesDeLigne,
  memesCellules, decisionModification, actionModification, formeValidee, libelleMesures, libelleAire, libelleLongueur, pointAccroche, cellulesPourCouche, actionCreation, rowIdCree, actionInverse, libellePoint,
} from '../lib/saisie-objet.js';
import { pontFormulaire } from '../lib/fiche-formulaire.js';
import { rangsDepuisRowIds } from '../lib/geometrie-saisie.js';

const POINTS = { sourceTable: 'Arbres', geometryType: 'Point', geometryColumn: { lat: 'latitude', lng: 'longitude' } };
const POINTS_JSON = { sourceTable: 'Bornes', geometryType: 'Point', geometryColumn: 'geometry_json' };

test('on ne crée que là où l’on peut écrire, et le refus dit pourquoi', () => {
  assert.deepEqual(creationPossible(POINTS), { ok: true });
  assert.match(creationPossible(POINTS, { viewMode: true }).raison, /lecture/);
  assert.match(creationPossible(POINTS, { peutEcrire: false }).raison, /lecture/);
  assert.match(creationPossible({ ...POINTS, sourceTable: null }).raison, /enregistrez-la en table/);
  assert.match(creationPossible({ ...POINTS, _distant: true }).raison, /distante/);
  assert.deepEqual(creationPossible({ sourceTable: 'Voirie', geometryType: 'LineString', geometryColumn: 'geometry_json' }), { ok: true });
  assert.deepEqual(creationPossible({ sourceTable: 'Parcs', geometryType: 'Polygon', geometryColumn: 'geometry_json' }), { ok: true });
  assert.match(creationPossible({ ...POINTS, geometryType: 'MultiPoint' }).raison, /QGIS/);
  assert.match(creationPossible({ ...POINTS, geometryColumn: 'wkt' }).raison, /WKT/);
  assert.equal(creationPossible(null).ok, false);
});

test('le point cliqué est arrondi à 7 décimales, et (0,0) est refusé', () => {
  const p = pointDepuisClic({ lng: 5.394745612345, lat: 43.304912398765 });
  assert.deepEqual(p, { ok: true, geometrie: { type: 'Point', coordinates: [5.3947456, 43.3049124] } });
  assert.equal(pointDepuisClic({ lng: 0, lat: 0 }).ok, false);
  assert.equal(pointDepuisClic({ lng: 200, lat: 43 }).ok, false);
  assert.equal(pointDepuisClic(null).ok, false);
});

test('les cellules suivent les colonnes de la couche', () => {
  const g = { type: 'Point', coordinates: [5.3947456, 43.3049124] };
  assert.deepEqual(cellulesPourCouche(POINTS, g), { latitude: 43.3049124, longitude: 5.3947456 });
  assert.deepEqual(cellulesPourCouche(POINTS_JSON, g), { geometry_json: '{"type":"Point","coordinates":[5.3947456,43.3049124]}' });
});

test('une seule action : les champs, puis la géométrie qui fait foi', () => {
  assert.deepEqual(actionCreation('Arbres', { nom: 'Platane', latitude: 1 }, { latitude: 43.3, longitude: 5.4 }),
    ['AddRecord', 'Arbres', null, { nom: 'Platane', latitude: 43.3, longitude: 5.4 }]);
  assert.equal(rowIdCree({ retValues: [12] }), 12);
  assert.equal(rowIdCree([null]), null);
  assert.deepEqual(actionInverse(['AddRecord', 'Arbres', null, {}], 12), ['RemoveRecord', 'Arbres', 12]);
  assert.equal(actionInverse(['UpdateRecord', 'Arbres', 3, {}], 3), null);
  assert.equal(libellePoint({ type: 'Point', coordinates: [5.3947456, 43.3049124] }), '43.3049124° N · 5.3947456° E');
});

function fauxDocApi(retour = 12) {
  const actions = [];
  return {
    actions,
    applyUserActions: (a) => { actions.push(...a); return Promise.resolve({ retValues: [retour] }); },
    fetchTable: () => Promise.resolve({}),
    getAccessToken: () => Promise.resolve({ token: 'x' }),
  };
}

test('le pont de création n’a pas d’editRowId, et écrit UNE ligne avec la géométrie', async () => {
  const api = fauxDocApi(12);
  let recu;
  const p = pontFormulaire({
    couche: POINTS, docApi: api, peutEcrire: () => true,
    creation: { cellules: { latitude: 43.3049124, longitude: 5.3947456 } },
    apresEcriture: (id) => { recu = id; },
  });
  assert.equal(p.editRowId, undefined, 'sans quoi le moteur mettrait à jour au lieu de créer');
  assert.equal(typeof p.updateRow, 'undefined');
  await p.addRow('Arbres', { nom: 'Platane' });
  assert.deepEqual(api.actions, [['AddRecord', 'Arbres', null, { nom: 'Platane', latitude: 43.3049124, longitude: 5.3947456 }]]);
  assert.equal(recu, 12, 'apresEcriture reçoit la ligne créée');
});

test('le garde d’écriture est consulté à la soumission de la création', async () => {
  const api = fauxDocApi();
  let permis = true;
  const p = pontFormulaire({
    couche: POINTS, docApi: api, peutEcrire: () => permis, creation: { cellules: { latitude: 1, longitude: 1 } },
  });
  permis = false;
  await assert.rejects(() => p.addRow('Arbres', { nom: 'x' }), /lecture/);
  assert.equal(api.actions.length, 0, 'rien n’a été écrit');
});

test('après ajout et relecture, l’objet se retrouve par sa ligne, pas par son rang', () => {
  const avant = [{ properties: { _row_id: 3 } }, { properties: { _row_id: 5 } }];
  const apres = [{ properties: { _row_id: 3 } }, { properties: { _row_id: 4 } }, { properties: { _row_id: 5 } }];
  assert.deepEqual(rangsDepuisRowIds(apres, [5]), [2]);
  assert.deepEqual(rangsDepuisRowIds(avant, [5]), [1]);
});

test('une ligne ou une surface tracée est nettoyée, fermée, et refusée avec son motif', () => {
  const ligne = formeValidee({ type: 'LineString', coordinates: [[5.39, 43.30], [5.39, 43.30], [5.391, 43.301]] }, 'LineString');
  assert.equal(ligne.ok, true);
  assert.equal(ligne.geometrie.coordinates.length, 2, 'le double clic sur place ne fait pas un sommet');
  const surface = formeValidee({ type: 'Polygon', coordinates: [[[5.39, 43.30], [5.391, 43.30], [5.391, 43.301]]] }, 'Polygon');
  assert.equal(surface.ok, true);
  const anneau = surface.geometrie.coordinates[0];
  assert.deepEqual(anneau[0], anneau[anneau.length - 1], 'l’anneau est fermé à l’écriture');
  const huit = formeValidee({ type: 'Polygon', coordinates: [[[0.001, 0.001], [0.002, 0.002], [0.002, 0.001], [0.001, 0.002]]] }, 'Polygon');
  assert.match(huit.erreur, /recoupe/);
  assert.match(formeValidee({ type: 'LineString', coordinates: [[5.39, 43.3]] }, 'LineString').erreur, /sommets/);
  assert.match(formeValidee({ type: 'Point', coordinates: [5.39, 43.3] }, 'Polygon').erreur, /./);
});

test('les mesures se disent comme ailleurs dans Atlas', () => {
  assert.equal(libelleLongueur(142.4), '142 m');
  assert.equal(libelleLongueur(3400), '3,4 km');
  assert.equal(libelleAire(1240), `${(1240).toLocaleString('fr-FR')} m²`);
  assert.equal(libelleAire(12000), '1,2 ha');
  assert.equal(libelleMesures({ sommets: 0 }, 'Polygon'), 'Surface · aucun sommet');
  assert.equal(libelleMesures({ sommets: 2, longueurM: 142 }, 'LineString'), '2 sommets · 142 m');
  assert.equal(libelleMesures({ sommets: 2, aireM2: 0, perimetreM: 10 }, 'Polygon'), '2 sommets');
  assert.match(libelleMesures({ sommets: 4, aireM2: 1240, perimetreM: 142 }, 'Polygon'), /^4 sommets · .* m² · périmètre 142 m$/);
});

test('l’accroche préfère un sommet, puis un segment, dans la tolérance seulement', () => {
  const projeter = (c) => ({ x: c[0], y: c[1] });   // plan écran = coordonnées, pour le test
  const ligne = { type: 'LineString', coordinates: [[0, 0], [100, 0]] };
  assert.deepEqual(pointAccroche({ x: 3, y: 4 }, [ligne], projeter, 10), { coordonnee: [0, 0], nature: 'sommet' });
  assert.deepEqual(pointAccroche({ x: 50, y: 6 }, [ligne], projeter, 10), { coordonnee: [50, 0], nature: 'segment' });
  assert.equal(pointAccroche({ x: 50, y: 30 }, [ligne], projeter, 10), null);
  const surface = { type: 'MultiPolygon', coordinates: [[[[200, 200], [210, 200], [210, 210], [200, 200]]]] };
  assert.deepEqual(pointAccroche({ x: 209, y: 201 }, [ligne, surface], projeter, 10), { coordonnee: [210, 200], nature: 'sommet' });
  assert.deepEqual(pointAccroche({ x: 1, y: 1 }, [{ type: 'Point', coordinates: [2, 2, 35] }], projeter, 5).coordonnee, [2, 2], 'le Z est retiré');
});

test('une fiche envoyée pendant qu’on retrace est refusée : pas d’objet sans forme', async () => {
  const api = fauxDocApi();
  const creation = { cellules: null };
  const p = pontFormulaire({ couche: POINTS, docApi: api, peutEcrire: () => true, creation });
  await assert.rejects(() => p.addRow('Arbres', { nom: 'x' }), /Tracez la forme/);
  assert.equal(api.actions.length, 0);
  creation.cellules = { geometry_json: '{}' };
  await p.addRow('Arbres', { nom: 'x' });
  assert.equal(api.actions.length, 1, 'les cellules sont lues à l’envoi, pas à la construction');
});

const LIGNES = { sourceTable: 'Voirie', geometryType: 'LineString', geometryColumn: 'geometry_json' };
const trait = (coords) => ({ properties: { _row_id: 4 }, geometry: { type: 'LineString', coordinates: coords } });

test('modifier une forme : mêmes conditions que créer, plus celles de l’objet', () => {
  assert.deepEqual(modificationPossible(LIGNES, trait([[5.39, 43.3], [5.391, 43.301]])), { ok: true });
  assert.match(modificationPossible(LIGNES, { properties: {}, geometry: { type: 'LineString', coordinates: [] } }).raison, /ligne Grist/);
  assert.match(modificationPossible(LIGNES, { properties: { _row_id: 1 }, geometry: { type: 'MultiLineString', coordinates: [] } }).raison, /plusieurs parties/);
  assert.match(modificationPossible({ ...LIGNES, geometryType: 'Polygon' },
    { properties: { _row_id: 1 }, geometry: { type: 'Polygon', coordinates: [[], []] } }).raison, /trouée/);
  assert.match(modificationPossible(LIGNES, trait([]), { viewMode: true }).raison, /lecture/);
  // Une table de qgis2grist porte des centroïdes : pas encore, et on le dit.
  assert.match(creationPossible({ ...LIGNES, source: 'qgis2grist' }).raison, /QGIS/);
  assert.match(creationPossible({ ...LIGNES, _manifestLayer: { source: { geometry_fields: { geojson: 'g', lat: 'y', lon: 'x' } } } }).raison, /QGIS/);
  assert.equal(aDesAltitudes({ type: 'LineString', coordinates: [[5, 43, 12], [5, 43]] }), true);
  assert.equal(aDesAltitudes({ type: 'Point', coordinates: [5, 43] }), false);
});

test('les cellules d’origine sont celles de Grist, à l’octet près', () => {
  const table = { id: [3, 4], nom: ['a', 'b'], geometry_json: ['{"x":1}', '{"type":"LineString","coordinates":[[5.39,43.3],[5.391,43.301]]}'] };
  const ligne = ligneDepuisTable(table, 4);
  assert.equal(ligne.nom, 'b');
  assert.deepEqual(cellulesDeLigne(LIGNES, ligne), { geometry_json: table.geometry_json[1] });
  assert.equal(ligneDepuisTable(table, 9), null);
  const pts = cellulesDeLigne(POINTS, { id: 1, latitude: 43.3, longitude: 5.39, nom: 'x' });
  assert.deepEqual(pts, { latitude: 43.3, longitude: 5.39 });
});

test('écrire, ne rien faire, ou refuser un conflit', () => {
  const origine = { geometry_json: '{"a":1}' };
  assert.equal(decisionModification({ origine, actuelles: { geometry_json: '{"a":1}' }, nouvelles: { geometry_json: '{"a":2}' } }), 'ecrire');
  assert.equal(decisionModification({ origine, actuelles: origine, nouvelles: { geometry_json: '{"a":1}' } }), 'inchange');
  assert.equal(decisionModification({ origine, actuelles: { geometry_json: '{"a":9}' }, nouvelles: { geometry_json: '{"a":2}' } }), 'conflit');
  assert.equal(memesCellules({ latitude: 43.3 }, { latitude: '43.3' }), true, 'un nombre rangé en texte reste le même nombre');
  assert.deepEqual(actionModification('Voirie', 4, { geometry_json: 'x' }), ['UpdateRecord', 'Voirie', 4, { geometry_json: 'x' }]);
});
