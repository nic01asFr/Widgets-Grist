import test from 'node:test';
import assert from 'node:assert/strict';
import { clePrefsCouche, saveLayerPref, applyLayerPrefs, loadLayerPrefs } from '../lib/grist-sync.js';

/* ---------- ce qui se range dans Atlas_LayerPrefs, et sous quelle cle ---------- */

const table = { source: 'qgis2grist', sourceTable: 'Batiments_locaux', manifestLayerId: 'bati', name: 'Bâti' };
const distante = { manifestLayerId: 'batiments-bdtopo', name: 'Bâtiments BD TOPO', _distant: true,
  geojson: 'https://exemple.test/features/abc?jeton=k1' };
const inline = { manifestLayerId: 'ilots', name: 'Îlots', geojson: { type: 'FeatureCollection', features: [] } };
const maquette = { name: 'Trace a la main', gristId: 7, geojson: { type: 'FeatureCollection', features: [] } };

test('une couche du manifeste a une cle, une couche dessinee n’en a pas', () => {
  assert.equal(clePrefsCouche(table), 'Batiments_locaux');
  assert.equal(clePrefsCouche(distante), 'batiments-bdtopo');
  assert.equal(clePrefsCouche(inline), 'ilots');
  // Rien ne la decrit ailleurs : elle doit emporter ses entites, donc aller
  // dans `Maquette_Layers`. C'est le seul cas qui y a sa place.
  assert.equal(clePrefsCouche(maquette), null);
});

test('`sourceTable` prime, pour ne pas perdre les prefs deja ecrites', () => {
  // Le document de non-regression porte deja `source_table: "Batiments_locaux"`.
  // Basculer sur `manifestLayerId` aurait orpheline cette ligne en silence.
  assert.equal(clePrefsCouche({ sourceTable: 'T', manifestLayerId: 'autre' }), 'T');
});

test('jamais l’URL comme cle', () => {
  // Elle change quand un jeton expire : les preferences seraient perdues au
  // renouvellement, sans que rien ne le signale.
  const cle = clePrefsCouche(distante);
  assert.ok(!String(cle).includes('http'));
  const renouvelee = { ...distante, geojson: 'https://exemple.test/features/abc?jeton=k2' };
  assert.equal(clePrefsCouche(renouvelee), cle, 'la cle survit au renouvellement du jeton');
});

test('entrees degradees : pas de cle inventee', () => {
  for (const l of [null, undefined, {}, { sourceTable: '' }, { manifestLayerId: null }]) {
    assert.equal(clePrefsCouche(l), null);
  }
});

/* ---------- la symetrie ecriture / lecture, la ou le defaut se rejouerait ---------- */

/** Faux docApi qui retient ce qui est ecrit dans Atlas_LayerPrefs. */
function faussDoc() {
  const lignes = [];
  return {
    lignes,
    async listTables() { return ['Atlas_LayerPrefs']; },
    async applyUserActions(actions) {
      for (const [verbe, tbl, arg, data] of actions) {
        assert.equal(tbl, 'Atlas_LayerPrefs', 'aucune geometrie ne part dans Maquette_Layers');
        if (verbe === 'AddRecord') lignes.push({ id: lignes.length + 1, ...data });
        if (verbe === 'UpdateRecord') Object.assign(lignes.find((l) => l.id === arg), data);
      }
      return { retValues: [lignes.length] };
    },
    async fetchTable() {
      return {
        id: lignes.map((l) => l.id),
        source_table: lignes.map((l) => l.source_table),
        StyleJSON: lignes.map((l) => l.StyleJSON),
        Visible: lignes.map((l) => l.Visible),
      };
    },
  };
}

for (const [nom, couche] of [['table', table], ['distante', distante], ['inline', inline]]) {
  test(`aller-retour d’une couche ${nom} : ce qui est ecrit est relu`, async () => {
    const doc = faussDoc();
    const l = { ...couche, visible: true, style: { symbolization: { color: { mode: 'single', value: '#abc' } } } };
    await saveLayerPref(doc, l, {});
    assert.equal(doc.lignes.length, 1, 'une ligne ecrite');
    assert.equal(doc.lignes[0].source_table, clePrefsCouche(l));

    // Relecture par une seconde instance de la couche, comme au rechargement :
    // c'est exactement la ou le pont se rompt si les deux cotes divergent.
    const prefs = await loadLayerPrefs(doc);
    const relue = { ...couche, style: {} };
    assert.ok(prefs.get(clePrefsCouche(relue)), 'la cle de lecture trouve la ligne ecrite');
    applyLayerPrefs(relue, prefs);
    assert.equal(relue.style?.symbolization?.color?.value, '#abc',
      'l’apparence enregistree revient sur la couche');
  });
}

test('une couche sans cle n’ecrit rien dans les prefs', async () => {
  const doc = faussDoc();
  await saveLayerPref(doc, { ...maquette, visible: true, style: {} }, {});
  assert.equal(doc.lignes.length, 0, 'elle releve de Maquette_Layers, pas des prefs');
});

test('mode lecture : aucune ecriture', async () => {
  const doc = faussDoc();
  await saveLayerPref(doc, { ...distante, visible: true, style: {} }, { viewMode: true });
  assert.equal(doc.lignes.length, 0);
});

/* ---------- document sans manifeste : la couche en table garde sa place ---------- */

import { ligneInventaireRequise, ligneInventaire } from '../lib/grist-sync.js';

const entablee = {
  kind: 'table', source: 'grist-table', sourceTable: 'Atlas_Eclairage', geometryColumn: 'geometry_json',
  name: 'Éclairage', color: '#2E4E54', geometryType: 'Point', visible: true,
  style: { mode: 'library' },
  geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: { _row_id: 1 } }] },
};

test('une couche en table que rien ne decrit garde sa ligne d’inventaire', () => {
  // Sans elle, la couche disparaissait au rechargement : `loadLayersFromGrist`
  // ne lit que `Maquette_Layers`, et les prefs ne disent pas qu'elle existe.
  assert.equal(ligneInventaireRequise(entablee), true);
});

test('dans un document qgis2grist aussi : le manifeste ne connait pas cette couche', () => {
  // Le mode du document ne decide plus : c'est l'excluait qui faisait perdre
  // les couches ajoutees a la main dans un document a manifeste.
  assert.equal(ligneInventaireRequise(entablee, 'scene-manifest'), true);
});

test('une couche que le manifeste decrit n’a pas de ligne : pas de doublon', () => {
  assert.equal(ligneInventaireRequise({ ...entablee, manifestLayerId: 'eclairage' }), false);
});

test('une couche sans table emporte ses entites par l’autre chemin', () => {
  assert.equal(ligneInventaireRequise(maquette), false);
  assert.equal(ligneInventaireRequise(null), false);
});

test('la ligne dit ou retrouver la couche, sans copier ses entites', () => {
  const ligne = ligneInventaire(entablee);
  assert.equal(ligne.GeoJSON, '{}', 'aucune copie des entites');
  assert.equal(ligne.Name, 'Éclairage');
  assert.equal(ligne.Visible, true);
  const style = JSON.parse(ligne.StyleJSON);
  assert.deepEqual(style._binding, { kind: 'table', sourceTable: 'Atlas_Eclairage', geometryColumn: 'geometry_json' });
  assert.equal(style.mode, 'library', 'le style de la couche est conserve');
});

test('la colonne de geometrie par defaut est celle qu’ecrit l’enregistrement en table', () => {
  const ligne = ligneInventaire({ ...entablee, geometryColumn: undefined });
  assert.equal(JSON.parse(ligne.StyleJSON)._binding.geometryColumn, 'geometry_json');
});

/* ---------- « Enregistrer en table » : seulement pour une copie ---------- */

import { peutPasserEnTable } from '../lib/grist-sync.js';

const copieOsm = {
  name: 'Arbres', gristId: 2,
  geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: {} }] },
};

test('une copie peut passer en table', () => {
  assert.equal(peutPasserEnTable(copieOsm), true);
});

test('une table du manifeste n’est pas une copie, même sans `kind`', () => {
  // Le cas constaté : « Bâtiments (table du document) » proposait « Enregistrer
  // en table » sous son badge « table ».
  const duManifeste = { ...copieOsm, sourceTable: 'Batiments_locaux', manifestLayerId: 'Batiments_locaux', source: 'qgis2grist' };
  assert.equal(peutPasserEnTable(duManifeste), false);
  assert.equal(peutPasserEnTable({ ...copieOsm, kind: 'table', sourceTable: 'Atlas_Arbres' }), false);
});

test('ni en lecture, ni hors Grist, ni pour une couche distante ou vide', () => {
  assert.equal(peutPasserEnTable(copieOsm, { lecture: true }), false);
  assert.equal(peutPasserEnTable(copieOsm, { grist: false }), false);
  assert.equal(peutPasserEnTable({ ...copieOsm, _distant: true }), false);
  assert.equal(peutPasserEnTable({ ...copieOsm, geojson: { features: [] } }), false);
  assert.equal(peutPasserEnTable(null), false);
});
