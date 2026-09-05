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
