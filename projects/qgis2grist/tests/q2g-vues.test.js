'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const V = require('../lib/q2g-vues.js');

const T = V.TABLE;
const maintenant = () => '2026-11-09T10:00:00.000Z';

/**
 * Faux docApi en memoire : memes formes que le docApi du plugin Grist (listTables, fetchTable colonaire,
 * applyUserActions). Il journalise les actions et refuse tout ce que le module n'a pas le droit de faire.
 */
function fauxDocApi(initial = {}) {
  const tables = {};
  for (const [nom, def] of Object.entries(initial)) {
    tables[nom] = { cols: def.cols.slice(), rows: def.rows.map((r) => ({ ...r })) };
  }
  let prochainId = 100;
  const journal = [];
  const api = {
    journal,
    tables,
    hooks: { apresFetch: null, avantApply: null },
    async listTables() { return Object.keys(tables); },
    async fetchTable(nom) {
      if (!tables[nom]) throw new Error('table inconnue ' + nom);
      const rec = { id: tables[nom].rows.map((r) => r.id) };
      for (const c of tables[nom].cols) rec[c] = tables[nom].rows.map((r) => (c in r ? r[c] : null));
      if (api.hooks.apresFetch) api.hooks.apresFetch(nom);
      return rec;
    },
    async applyUserActions(actions) {
      if (api.hooks.avantApply) api.hooks.avantApply(actions);
      const retValues = [];
      for (const a of actions) {
        journal.push(JSON.parse(JSON.stringify(a)));
        const [type, nom] = a;
        if (type === 'AddTable') {
          if (tables[nom]) throw new Error('table deja existante');
          tables[nom] = { cols: a[2].map((c) => c.id), rows: [] };
          retValues.push({ table_id: nom });
        } else if (type === 'AddColumn') {
          if (!tables[nom]) throw new Error('table inconnue');
          tables[nom].cols.push(a[2]);
          retValues.push(null);
        } else if (type === 'AddRecord') {
          if (!tables[nom]) throw new Error('table inconnue');
          const id = prochainId++;
          tables[nom].rows.push({ id, ...a[3] });
          retValues.push(id);
        } else if (type === 'UpdateRecord') {
          const r = tables[nom].rows.find((x) => x.id === a[2]);
          if (!r) throw new Error('ligne inconnue');
          Object.assign(r, a[3]);
          retValues.push(null);
        } else {
          throw new Error('action non prevue : ' + type);
        }
      }
      return { retValues };
    },
  };
  return api;
}

const COLS_ATLAS = ['ViewerJSON', 'SettingsJSON', 'ExpositionJSON', 'Miniature'];
const tableAtlas = (expo, extra = {}) => ({
  [T]: { cols: COLS_ATLAS, rows: [{ id: 1, ViewerJSON: '[{"a":1}]', SettingsJSON: '{"basemap":"x"}', ExpositionJSON: expo, Miniature: 'data:image/jpeg;base64,AAA', ...extra }] },
});

const etat1 = () => ({
  couches: ['parcelles', 'reseau'],
  filtres: { parcelles: { commune: ['Marseille'], surface: { min: 10 } } },
  cadrage: { lng: 5.4, lat: 43.3, zoom: 14, pitch: 20, bearing: 10 },
  fond: 'plan',
  selection: [{ couche: 'parcelles', id: 12 }],
});

const vues = (api, opts = {}) => V.creer({ docApi: api, maintenant, ...opts });
const bloc = (api) => JSON.parse(api.tables[T].rows[0].ExpositionJSON);

// ---------------------------------------------------------------- schema

test('schema : la copie du schema Atlas est identique a la source (lecture seule)', () => {
  const src = path.join(__dirname, '..', '..', 'Atlas', 'lib', 'scene-prefs.js');
  if (!fs.existsSync(src)) return;
  const txt = fs.readFileSync(src, 'utf8');
  const m = txt.match(/SCENE_PREFS_SCHEMA = \[([\s\S]*?)\n\];/);
  assert.ok(m, 'schema introuvable dans Atlas');
  const lus = [...m[1].matchAll(/\{ id: '([^']+)', label: '([^']+)', type: '([^']+)' \}/g)]
    .map((x) => ({ id: x[1], label: x[2], type: x[3] }));
  assert.deepEqual(V.SCHEMA_ATLAS.map((c) => ({ ...c })), lus);
  assert.match(txt, /ATLAS_SCENE_PREFS_TABLE = 'Atlas_ScenePrefs'/);
});

// ---------------------------------------------------------------- creation de table

test('creation : sans table, AddTable avec les colonnes d Atlas puis ecriture, rien d autre', async () => {
  const api = fauxDocApi();
  const v = vues(api);
  assert.deepEqual(await v.lister(), [], 'lister ne cree rien');
  assert.equal(api.journal.length, 0);
  const r = await v.enregistrer('Vue  du   centre', etat1());
  assert.equal(r.nom, 'Vue du centre');
  assert.deepEqual(Object.keys(api.tables), [T], 'aucune table a part');
  assert.equal(api.journal[0][0], 'AddTable');
  assert.deepEqual(api.journal[0][2].map((c) => c.id), ['ViewerJSON', 'SettingsJSON', 'ExpositionJSON', 'Miniature']);
  assert.deepEqual(api.journal[0][2], V.SCHEMA_ATLAS.map((c) => ({ ...c })));
  assert.equal(api.journal.length, 2);
  assert.equal(api.journal[1][0], 'AddRecord');
  assert.deepEqual(Object.keys(api.journal[1][3]), ['ExpositionJSON']);
  const b = bloc(api);
  assert.equal(b.vues_q2g.version, 1);
  assert.equal(b.vues_q2g.vues[0].nom, 'Vue du centre');
  assert.deepEqual(await v.appliquer('vue du centre'), etat1());
});

test('creation : table presente mais vide de lignes -> AddRecord seulement', async () => {
  const api = fauxDocApi({ [T]: { cols: COLS_ATLAS, rows: [] } });
  await vues(api).enregistrer('A', etat1());
  assert.deepEqual(api.journal.map((a) => a[0]), ['AddRecord']);
});

test('creation : table ancienne sans ExpositionJSON -> AddColumn au libelle d Atlas, puis UpdateRecord', async () => {
  const api = fauxDocApi({ [T]: { cols: ['ViewerJSON'], rows: [{ id: 1, ViewerJSON: '[]' }] } });
  await vues(api).enregistrer('A', etat1());
  assert.deepEqual(api.journal.map((a) => a[0]), ['AddColumn', 'UpdateRecord']);
  assert.deepEqual(api.journal[0].slice(1), [T, 'ExpositionJSON', { label: 'Exposition (JSON)', type: 'Text' }]);
  assert.equal(api.tables[T].rows[0].ViewerJSON, '[]', 'les autres colonnes restent intactes');
});

test('creation : table creee par un autre outil entre la lecture et l ecriture -> on repart de l etat reel', async () => {
  const api = fauxDocApi();
  let fait = false;
  api.hooks.avantApply = () => {
    if (fait) return;
    fait = true;
    // l autre outil cree la table (avec un cadrage) juste avant notre AddTable : notre action echoue
    api.tables[T] = { cols: COLS_ATLAS.slice(), rows: [{ id: 5, ViewerJSON: '[]', SettingsJSON: '{}', ExpositionJSON: '{"cadrage":{"mode":"donnees"}}', Miniature: '' }] };
  };
  await vues(api).enregistrer('A', etat1());
  const b = JSON.parse(api.tables[T].rows[0].ExpositionJSON);
  assert.deepEqual(b.cadrage, { mode: 'donnees' });
  assert.equal(b.vues_q2g.vues.length, 1);
  assert.equal(api.tables[T].rows.length, 1);
});

// ---------------------------------------------------------------- fusion prudente

test('fusion : le bloc d Atlas (ouverture, cadrage) et les autres colonnes sont conserves', async () => {
  const expo = { ouverture: { mode: 'contexte', cle: 'ctx-1' }, cadrage: { mode: 'vue', vue: { lng: 1, lat: 2, zoom: 3, pitch: 0, bearing: 0 } }, inconnue: { x: [1, 2] } };
  const api = fauxDocApi(tableAtlas(JSON.stringify(expo)));
  const avant = { ...api.tables[T].rows[0] };
  await vues(api).enregistrer('Vue A', etat1());
  await vues(api).enregistrer('Vue B', etat1());
  await vues(api).supprimer('Vue A');
  const ligne = api.tables[T].rows[0];
  for (const c of ['ViewerJSON', 'SettingsJSON', 'Miniature']) assert.equal(ligne[c], avant[c], c);
  const b = JSON.parse(ligne.ExpositionJSON);
  assert.deepEqual(b.ouverture, expo.ouverture);
  assert.deepEqual(b.cadrage, expo.cadrage);
  assert.deepEqual(b.inconnue, expo.inconnue);
  assert.deepEqual(b.vues_q2g.vues.map((x) => x.nom), ['Vue B']);
  // n ecrit que la colonne du bloc
  for (const a of api.journal) assert.deepEqual(Object.keys(a[3]), ['ExpositionJSON']);
});

test('fusion : supprimer la derniere vue retire la cle et laisse le reste du bloc', async () => {
  const api = fauxDocApi(tableAtlas('{"ouverture":{"mode":"recit"}}'));
  const v = vues(api);
  await v.enregistrer('A', etat1());
  assert.equal(await v.supprimer('A'), true);
  assert.deepEqual(bloc(api), { ouverture: { mode: 'recit' } });
});

test('fusion : Atlas relit son bloc sans y perdre le cadrage ni l ouverture (lecture seule d Atlas)', async (t) => {
  const src = path.join(__dirname, '..', '..', 'Atlas', 'lib', 'exposition.js');
  if (!fs.existsSync(src)) return t.skip('Atlas absent');
  let expo;
  try { expo = await import(pathToFileURL(src).href); } catch (e) { return t.skip('import Atlas impossible : ' + e.message); }
  const cadrage = { mode: 'vue', vue: { lng: 5.4, lat: 43.3, zoom: 14, pitch: 0, bearing: 0 } };
  const api = fauxDocApi(tableAtlas(JSON.stringify({ ouverture: { mode: 'recit' }, cadrage })));
  await vues(api).enregistrer('A', etat1());
  const lu = expo.expositionDepuisJSON(api.tables[T].rows[0].ExpositionJSON);
  assert.deepEqual(lu.ouverture, { mode: 'recit' });
  assert.deepEqual(lu.cadrage, cadrage);
});

test('fusion : une cle dangereuse du bloc existant n est pas executee ni propagee comme prototype', async () => {
  const api = fauxDocApi(tableAtlas('{"__proto__":{"pollue":true},"ouverture":{"mode":"carte"}}'));
  await vues(api).enregistrer('A', etat1());
  assert.equal({}.pollue, undefined);
  assert.equal(Object.prototype.pollue, undefined);
  const lu = await vues(api).lister();
  assert.equal(lu.length, 1);
});

// ---------------------------------------------------------------- operations

test('operations : enregistrer remplace a nom egal (casse ignoree), appliquer renvoie une copie', async () => {
  const api = fauxDocApi(tableAtlas('{}'));
  const v = vues(api);
  await v.enregistrer('Ma vue', etat1());
  await v.enregistrer('MA VUE', { couches: ['x'] });
  const liste = await v.lister();
  assert.equal(liste.length, 1);
  assert.equal(liste[0].nom, 'MA VUE');
  assert.deepEqual(liste[0].etat, { couches: ['x'] });
  const e = await v.appliquer('ma vue');
  e.couches.push('mutation');
  assert.deepEqual((await v.appliquer('ma vue')).couches, ['x'], 'la copie rendue ne touche pas au stockage');
  assert.equal(await v.appliquer('absente'), null);
  assert.equal(await v.appliquer(42), null);
});

test('operations : renommer', async () => {
  const api = fauxDocApi(tableAtlas('{}'));
  const v = vues(api);
  await v.enregistrer('A', etat1());
  await v.enregistrer('B', etat1());
  assert.equal(await v.renommer('A', 'C'), true);
  assert.deepEqual((await v.lister()).map((x) => x.nom), ['C', 'B'], 'l ordre est conserve');
  await assert.rejects(() => v.renommer('C', 'b'), { code: 'nom_existe' });
  await assert.rejects(() => v.renommer('C', '   '), { code: 'nom_invalide' });
  await assert.rejects(() => v.renommer('C', '__proto__'), { code: 'nom_invalide' });
  assert.equal(await v.renommer('inconnue', 'Z'), false);
  assert.equal(await v.renommer('C', 'c'), true, 'changer la casse seule est permis');
  assert.deepEqual((await v.lister()).map((x) => x.nom), ['c', 'B']);
});

test('operations : supprimer une vue absente n ecrit rien', async () => {
  const api = fauxDocApi(tableAtlas('{}'));
  const v = vues(api);
  await v.enregistrer('A', etat1());
  const n = api.journal.length;
  assert.equal(await v.supprimer('absente'), false);
  assert.equal(await v.supprimer('A'), true);
  assert.equal(api.journal.length, n + 1);
});

test('operations : mode lecture seule refuse toute ecriture, sans toucher au docApi', async () => {
  const api = fauxDocApi(tableAtlas('{}'));
  const v = vues(api, { lectureSeule: true });
  await assert.rejects(() => v.enregistrer('A', etat1()), { code: 'lecture_seule' });
  await assert.rejects(() => v.supprimer('A'), { code: 'lecture_seule' });
  assert.equal(api.journal.length, 0);
  assert.deepEqual(await v.lister(), []);
});

test('operations : docApi absent -> erreur typee', async () => {
  await assert.rejects(() => V.creer({}).lister(), { code: 'docapi_absent' });
});

// ---------------------------------------------------------------- plafonds et assainissement

test('plafonds : au plus 20 vues, remplacer une existante reste permis', async () => {
  const api = fauxDocApi(tableAtlas('{}'));
  const v = vues(api);
  for (let i = 0; i < 20; i++) await v.enregistrer('v' + i, { couches: ['a'] });
  await assert.rejects(() => v.enregistrer('v20', { couches: ['a'] }), { code: 'plafond_vues' });
  await v.enregistrer('V3', { couches: ['b'] });
  assert.equal((await v.lister()).length, 20);
  assert.equal(V.LIMITES.MAX_VUES, 20);
});

test('plafonds : un bloc ecrit ailleurs avec 50 vues est lu tronque a 20 et reecrit tronque', async () => {
  const beaucoup = Array.from({ length: 50 }, (_, i) => ({ nom: 'n' + i, etat: { couches: ['a'] } }));
  const api = fauxDocApi(tableAtlas(JSON.stringify({ vues_q2g: { version: 1, vues: beaucoup } })));
  const v = vues(api);
  assert.equal((await v.lister()).length, 20);
  await v.supprimer('n0');
  assert.equal(bloc(api).vues_q2g.vues.length, 19);
});

test('plafonds : etat trop gros refuse, listes et selections tronquees', async () => {
  const api = fauxDocApi(tableAtlas('{}'));
  const v = vues(api);
  const enorme = {};
  for (let i = 0; i < 50; i++) enorme['k' + i] = Array.from({ length: 200 }, () => 'x'.repeat(400));
  await assert.rejects(() => v.enregistrer('gros', { filtres: enorme }), { code: 'etat_trop_gros' });
  await assert.rejects(() => v.enregistrer('', etat1()), { code: 'nom_invalide' });
  await assert.rejects(() => v.enregistrer('ok', 'pas un objet'), { code: 'etat_invalide' });
  const r = await v.enregistrer('long', {
    couches: Array.from({ length: 500 }, (_, i) => 'c' + i),
    selection: Array.from({ length: 500 }, (_, i) => i),
  });
  assert.equal(r.etat.couches.length, 200);
  assert.equal(r.etat.selection.length, 200);
});

test('assainissement : noms nettoyes et bornes, noms interdits refuses', async () => {
  assert.equal(V.nettoyerNom('  a\u0000b‮ c\n\td  '), 'a b c d');
  assert.equal(V.nettoyerNom('x'.repeat(200)).length, 60);
  assert.equal(V.nettoyerNom('<img src=x onerror=1>'), '<img src=x onerror=1>', 'pas d echappement HTML ici : c est le rendu qui echappe (Q2GHtml)');
  for (const n of ['__proto__', 'Constructor', 'prototype', '', '   ', null, 5, {}]) assert.equal(V.nettoyerNom(n), null, String(n));
  const api = fauxDocApi(tableAtlas('{}'));
  await assert.rejects(() => vues(api).enregistrer('__proto__', etat1()), { code: 'nom_invalide' });
});

test('assainissement : etat en liste blanche, cles interdites et valeurs hors bornes ecartees', () => {
  const sale = JSON.parse('{"couches":["a","a",5,"__proto__"],"intrus":1,"filtres":{"__proto__":{"x":1},"constructor":2,"ok":{"n":null,"s":"v","a":[1,{"__proto__":1}]}},"cadrage":{"lng":5,"lat":95,"zoom":3},"fond":"  plan\\u0000 ","selection":[{"couche":"c","id":"7"},{"id":null},3,{"couche":"__proto__","id":1}]}');
  sale.filtres.ok.nan = NaN;
  sale.filtres.ok.inf = Infinity;
  const e = V.nettoyerEtat(sale);
  assert.deepEqual(e.couches, ['a']);
  assert.equal('intrus' in e, false);
  assert.equal(Object.prototype.hasOwnProperty.call(e.filtres, '__proto__'), false);
  assert.equal('constructor' in Object.keys(e.filtres).reduce((o, k) => ({ ...o, [k]: 1 }), {}), true, 'cle propre uniquement');
  assert.equal(Object.keys(e.filtres).includes('constructor'), false);
  assert.deepEqual(e.filtres.ok, { n: null, s: 'v', a: [1, {}] }, 'NaN et Infinity ecartes');
  assert.equal('cadrage' in e, false, 'latitude hors bornes : cadrage ecarte');
  assert.equal(e.fond, 'plan');
  assert.deepEqual(e.selection, [{ id: '7', couche: 'c' }, { id: 3 }, { id: 1 }]);
  assert.equal(V.nettoyerEtat([]), null);
  assert.equal(V.nettoyerEtat(null), null);
  assert.deepEqual(V.nettoyerEtat({ cadrage: { bornes: [[5, 43], [6, 44]] } }), { cadrage: { bornes: [[5, 43], [6, 44]] } });
  assert.deepEqual(V.nettoyerEtat({ cadrage: { lng: 5, lat: 43, zoom: 30 } }), {}, 'zoom hors bornes');
  assert.deepEqual(V.nettoyerEtat({ cadrage: { lng: 5, lat: 43, zoom: 9, pitch: 200 } }).cadrage, { lng: 5, lat: 43, zoom: 9, pitch: 0, bearing: 0 });
});

// ---------------------------------------------------------------- JSON corrompu

test('corrompu : une entree invalide est ignoree sans casser les autres vues', async () => {
  const brut = JSON.stringify({ vues_q2g: { version: 1, vues: [
    { nom: 'bonne', etat: { couches: ['a'] }, maj: '2026-01-01T00:00:00.000Z' },
    'texte', null, 7, { nom: '', etat: {} }, { nom: 'sans etat' }, { nom: '__proto__', etat: {} },
    { nom: 'Bonne', etat: { couches: ['doublon'] } },
    { nom: 'aussi bonne', etat: { fond: 'plan' }, maj: 'pas une date' },
  ] } });
  const api = fauxDocApi(tableAtlas(brut));
  const liste = await vues(api).lister();
  assert.deepEqual(liste.map((x) => x.nom), ['bonne', 'aussi bonne']);
  assert.equal(liste[1].maj, '');
  assert.deepEqual(liste[0].etat, { couches: ['a'] });
});

test('corrompu : structure du bloc incorrecte (non objet, vues non tableau) -> aucune vue, pas d exception', async () => {
  for (const brut of ['{"vues_q2g":5}', '{"vues_q2g":{"vues":"x"}}', '{"vues_q2g":[1,2]}', '{}', '', '   ', null]) {
    const api = fauxDocApi(tableAtlas(brut));
    assert.deepEqual(await vues(api).lister(), [], String(brut));
  }
});

test('corrompu : JSON invalide lu comme vide, mais jamais ecrase sans accord explicite', async () => {
  for (const brut of ['{pas du json', '[1,2,3]', '"texte"', 'null', 12]) {
    const api = fauxDocApi(tableAtlas(brut));
    const v = vues(api);
    assert.deepEqual(await v.lister(), [], String(brut));
    await assert.rejects(() => v.enregistrer('A', etat1()), { code: 'bloc_illisible' });
    assert.equal(api.journal.length, 0, 'rien d ecrit');
    assert.equal(api.tables[T].rows[0].ExpositionJSON, brut);
  }
  const api = fauxDocApi(tableAtlas('{pas du json'));
  await vues(api, { ecraserIllisible: true }).enregistrer('A', etat1());
  assert.equal(bloc(api).vues_q2g.vues.length, 1);
});

test('corrompu : cellule demesuree ignoree', async () => {
  const api = fauxDocApi(tableAtlas('{"a":"' + 'x'.repeat(V.LIMITES.MAX_BRUT_OCTETS) + '"}'));
  assert.deepEqual(await vues(api).lister(), []);
  await assert.rejects(() => vues(api).enregistrer('A', etat1()), { code: 'bloc_illisible' });
});

// ---------------------------------------------------------------- concurrence

test('concurrence : un autre auteur ecrit entre la lecture et la relecture -> sa valeur est reprise, pas ecrasee', async () => {
  const api = fauxDocApi(tableAtlas('{"ouverture":{"mode":"carte"}}'));
  let fetchs = 0;
  api.hooks.apresFetch = () => {
    fetchs++;
    // apres le premier fetch de l ecriture, un autre outil ajoute un cadrage a la ligne
    if (fetchs === 1) api.tables[T].rows[0].ExpositionJSON = '{"ouverture":{"mode":"carte"},"cadrage":{"mode":"donnees"}}';
  };
  await vues(api).enregistrer('A', etat1());
  const b = bloc(api);
  assert.deepEqual(b.cadrage, { mode: 'donnees' }, 'la modification concurrente est conservee');
  assert.equal(b.vues_q2g.vues[0].nom, 'A');
});

test('concurrence : une ligne qui ne cesse de changer -> erreur conflit, rien d ecrit', async () => {
  const api = fauxDocApi(tableAtlas('{}'));
  let n = 0;
  api.hooks.apresFetch = () => { api.tables[T].rows[0].ExpositionJSON = JSON.stringify({ n: n++ }); };
  await assert.rejects(() => vues(api).enregistrer('A', etat1()), { code: 'conflit' });
  assert.equal(api.journal.length, 0);
});

test('concurrence : deux enregistrements simultanes d une meme instance sont serialises, aucune vue perdue', async () => {
  const api = fauxDocApi(tableAtlas('{}'));
  const v = vues(api);
  await Promise.all([v.enregistrer('A', etat1()), v.enregistrer('B', etat1()), v.enregistrer('C', etat1())]);
  assert.deepEqual((await v.lister()).map((x) => x.nom).sort(), ['A', 'B', 'C']);
});

test('concurrence : deux instances sur le meme document, ecritures alternees, aucune vue perdue', async () => {
  const api = fauxDocApi(tableAtlas('{}'));
  const v1 = vues(api);
  const v2 = vues(api);
  await v1.enregistrer('A', etat1());
  await v2.enregistrer('B', etat1());
  await v1.supprimer('B');
  await v2.enregistrer('C', etat1());
  assert.deepEqual((await v1.lister()).map((x) => x.nom), ['A', 'C']);
});

test('concurrence : l echec d une ecriture ne bloque pas la file', async () => {
  const api = fauxDocApi(tableAtlas('{}'));
  const v = vues(api);
  const faux = v.enregistrer('', etat1()).catch((e) => e.code);
  const bon = v.enregistrer('A', etat1());
  assert.equal(await faux, 'nom_invalide');
  assert.equal((await bon).nom, 'A');
});

test('colonne dediee : option colonne, le bloc d Atlas n est alors pas touche', async () => {
  const api = fauxDocApi(tableAtlas('{"ouverture":{"mode":"recit"}}'));
  await vues(api, { colonne: 'VuesQ2G' }).enregistrer('A', etat1());
  assert.equal(api.tables[T].rows[0].ExpositionJSON, '{"ouverture":{"mode":"recit"}}');
  assert.equal(JSON.parse(api.tables[T].rows[0].VuesQ2G).vues_q2g.vues[0].nom, 'A');
  assert.equal(api.journal[0][0], 'AddColumn');
});

test('colonne dediee : sans table, AddTable (colonnes d Atlas) puis AddColumn puis ecriture', async () => {
  const api = fauxDocApi();
  await vues(api, { colonne: V.COLONNE_DEDIEE }).enregistrer('A', etat1());
  assert.deepEqual(api.journal.map((a) => a[0]), ['AddTable', 'AddColumn', 'AddRecord']);
  assert.deepEqual(api.journal[0][2].map((c) => c.id), ['ViewerJSON', 'SettingsJSON', 'ExpositionJSON', 'Miniature']);
  assert.equal(JSON.parse(api.tables[T].rows[0].VuesQ2G).vues_q2g.vues[0].nom, 'A');
  const l = await vues(api, { colonne: V.COLONNE_DEDIEE }).lister();
  assert.equal(l.length, 1);
});

test('syntaxe : le module charge en navigateur (sans module.exports)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'q2g-vues.js'), 'utf8');
  const racine = {};
  new Function('module', 'globalThis', src)(undefined, racine);
  assert.equal(typeof racine.Q2GVues.creer, 'function');
});
