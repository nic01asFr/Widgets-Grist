'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../lib/q2g-atlas-host.js');

// ---------------------------------------------------------------------------
// Faux client Atlas : enregistre les appels, simule setScene / fusion, emet des evenements
// ---------------------------------------------------------------------------

function erreurBi(code, message, extra) {
  const e = new Error(message || code);
  e.name = 'ErreurBi';
  e.code = code;
  return Object.assign(e, extra || {});
}

function fauxClient(opts) {
  const o = opts || {};
  const appels = [];
  const ecouteurs = [];
  const scene = new Map();   // couche -> nombre d'entites
  const client = {
    appels,
    scene,
    async connecter() {
      if (o.refus) throw erreurBi(o.refus, 'refus simule');
      return {
        version: o.version || '0.3',
        versions: ['0.2', '0.3'],
        capacites: o.capacites || ['edition', 'points', 'socle', 'temps', 'territoires'],
      };
    },
    async appeler(cmd, ...args) {
      appels.push({ cmd, args });
      if (o.echec && o.echec[cmd]) {
        const m = o.echec[cmd];
        if (m.fois === undefined || m.fois-- > 0) throw erreurBi(m.code, m.message);
      }
      if (cmd === 'setScene') {
        const [manifeste, donnees] = args;
        if (!(manifeste.fusion === true && !o.ignorerFusion)) scene.clear();
        const refus = {};
        for (const def of manifeste.layers) {
          if (o.refuserCouches && o.refuserCouches.includes(def.id)) { refus[def.id] = 'capacite_absente : points'; continue; }
          scene.set(def.id, (donnees[def.id] || []).length);
        }
        const r = Object.fromEntries(scene);
        if (Object.keys(refus).length) r._erreurs = refus;
        if (o.avertissements) r._avertissements = o.avertissements;
        return r;
      }
      if (cmd === 'setFilter') return { layer: 'x', compte: 1, total: 2 };
      return true;
    },
    on(type, cb, opt) {
      const e = { type, cb, origine: (opt && opt.origine) || 'utilisateur' };
      ecouteurs.push(e);
      return () => { const i = ecouteurs.indexOf(e); if (i >= 0) ecouteurs.splice(i, 1); };
    },
    emit(type, charge, origine) {
      const og = origine || 'utilisateur';
      for (const e of [...ecouteurs]) {
        if (e.type === type && (e.origine === 'tout' || e.origine === og)) e.cb(charge, { origine: og, version: '0.3' });
      }
    },
    nbEcouteurs: () => ecouteurs.length,
    appelsDe: (cmd) => appels.filter((a) => a.cmd === cmd),
  };
  return client;
}

// ---------------------------------------------------------------------------
// Donnees : deux couches dont les ids de ligne se recouvrent
// ---------------------------------------------------------------------------

function couches() {
  return {
    Sites: {
      displayName: 'Sites',
      geomType: 'Point',
      featureCount: 3,
      _color: '#3e5de7',
      fields: [
        { name: 'nom', label: 'Nom', gType: 'Text' },
        { name: 'type', label: 'Type', gType: 'Choice' },
        { name: 'surface', label: 'Surface', gType: 'Numeric' },
      ],
      style: {
        type: 'categorizedSymbol',
        field: 'type',
        categories: [
          { value: 'a', label: 'A', color: '#ff0000' },
          { value: 'b', label: 'B', color: '#00ff00' },
        ],
      },
    },
    Zones: {
      displayName: 'Zones',
      geomType: 'Polygon',
      featureCount: 2,
      _color: '#10b981',
      fields: [{ name: 'libelle', label: 'Libelle', gType: 'Text' }],
      style: { type: 'singleSymbol', color: '#10b981' },
    },
  };
}

function lignesSites() {
  return [
    { id: 1, nom: 'Alpha', type: 'a', surface: 10, latitude: 43.3, longitude: 5.4, fill_color: '#ff0000' },
    { id: 2, nom: 'Beta', type: 'b', surface: 20, latitude: 43.31, longitude: 5.41, fill_color: '#00ff00' },
    { id: 3, nom: 'Sans geom', type: 'a', surface: 5, fill_color: '#ff0000' },
  ];
}

function lignesZones() {
  const poly = (x) => JSON.stringify({ type: 'Polygon', coordinates: [[[x, 43], [x + 0.1, 43], [x + 0.1, 43.1], [x, 43]]] });
  return [
    { id: 1, libelle: 'Z1', geometry_json: poly(5.0), fill_color: '#10b981' },
    { id: 2, libelle: 'Z2', geometry_json: poly(5.2), fill_color: '#10b981' },
  ];
}

function entree(extra) {
  return {
    couches: couches(),
    lignes: { Sites: lignesSites(), Zones: lignesZones() },
    meta: { title: 'Import test' },
    nomFichier: 'test.qgz',
    ...(extra || {}),
  };
}

async function hoteConnecte(opts, config) {
  const client = fauxClient(opts);
  const hote = H.creerHote({ client, ...(config || {}) });
  await hote.connecter();
  return { client, hote };
}

// ---------------------------------------------------------------------------
// Empreintes
// ---------------------------------------------------------------------------

test('empreinteLignes : stable, independante de l\'ordre des lignes et des colonnes', () => {
  const a = [{ id: 1, x: 'a', y: 2 }, { id: 2, x: 'b', y: 3 }];
  const b = [{ y: 3, x: 'b', id: 2 }, { y: 2, id: 1, x: 'a' }];
  assert.equal(H.empreinteLignes(a), H.empreinteLignes(b));
  assert.equal(H.empreinteLignes(a), H.empreinteLignes(a.map((r) => ({ ...r }))));
});

test('empreinteLignes : une cellule, une ligne ajoutee ou retiree changent l\'empreinte', () => {
  const base = [{ id: 1, x: 'a' }, { id: 2, x: 'b' }];
  const e0 = H.empreinteLignes(base);
  assert.notEqual(e0, H.empreinteLignes([{ id: 1, x: 'a' }, { id: 2, x: 'c' }]));
  assert.notEqual(e0, H.empreinteLignes([{ id: 1, x: 'a' }]));
  assert.notEqual(e0, H.empreinteLignes([...base, { id: 3, x: 'a' }]));
  // echange de valeurs entre deux lignes
  assert.notEqual(e0, H.empreinteLignes([{ id: 1, x: 'b' }, { id: 2, x: 'a' }]));
  assert.notEqual(H.empreinteLignes([{ id: 1, a: 'x' }]), H.empreinteLignes([{ id: 1, b: 'x' }]));
});

test('empreinteLignes : objets, tableaux, null et vide sont pris en compte sans erreur', () => {
  const e1 = H.empreinteLignes([{ id: 1, g: { type: 'Point', coordinates: [1, 2] }, l: ['L', 1, 2], n: null }]);
  const e2 = H.empreinteLignes([{ id: 1, g: { type: 'Point', coordinates: [1, 3] }, l: ['L', 1, 2], n: null }]);
  assert.notEqual(e1, e2);
  assert.match(H.empreinteLignes([]), /^0:0:0$/);
  assert.equal(H.empreinteLignes(null), H.empreinteLignes([]));
});

// ---------------------------------------------------------------------------
// Allocateur d'ids, controles, utilitaires
// ---------------------------------------------------------------------------

test('creerAllocateurIds : ids uniques dans la scene, stables, inverses, purge', () => {
  const a = H.creerAllocateurIds();
  const x1 = a.id('Sites', 1);
  const y1 = a.id('Zones', 1);
  assert.notEqual(x1, y1);
  assert.equal(a.id('Sites', 1), x1);
  assert.deepEqual(a.inverse(y1), { couche: 'Zones', ligne: 1 });
  assert.equal(a.chercher('Sites', 1), x1);
  assert.equal(a.chercher('Sites', 99), null);
  a.retenir('Sites', new Set());
  assert.equal(a.chercher('Sites', 1), null);
  assert.equal(a.inverse(x1), null);
  assert.equal(a.chercher('Zones', 1), y1);
  a.oublierCouche('Zones');
  assert.equal(a.taille(), 0);
});

test('idControle : unique par couche, champ, type et mode', () => {
  assert.equal(H.idControle('Sites', { field: 'type', type: 'select' }), 'f-Sites-type');
  assert.equal(H.idControle('Sites', { field: 'surface', type: 'range' }), 'f-Sites-surface-range');
  assert.equal(H.idControle('Z', { field: 'ht', type: 'range', mode: 'simulation' }), 'f-Z-ht-range-simulation');
});

test('necessiteCarteHeritee : panneau BigQgisMCP vers l\'ancienne carte (D2)', () => {
  assert.equal(H.necessiteCarteHeritee(null).heritee, false);
  assert.equal(H.necessiteCarteHeritee({ title: 'x' }).heritee, false);
  assert.equal(H.necessiteCarteHeritee({ interactiveMap: 'flood' }).heritee, true);
  assert.equal(H.necessiteCarteHeritee({ interactiveMap: 'temporal' }).heritee, true);
  assert.equal(H.necessiteCarteHeritee({ inferredStyles: { floodStyle: {} } }).heritee, true);
  assert.equal(H.necessiteCarteHeritee({ sliderMin: 0, sliderMax: 5 }).heritee, true);
  assert.equal(H.necessiteCarteHeritee({ sliderMin: 1, sliderMax: 1 }).heritee, false);
  assert.match(H.necessiteCarteHeritee({ interactiveMap: 'flood' }).raison, /^bigqgismcp/);
});

test('bulleDepuisCouche : titre depuis le champ nom, 3 champs au plus, sans colonnes geometriques', () => {
  const b = H.bulleDepuisCouche(couches().Sites);
  assert.equal(b.titre, '{nom}');
  assert.deepEqual(b.champs.map((c) => c.champ), ['type', 'surface']);
  assert.equal(b.champs[1].format, 'nombre');
  const sans = H.bulleDepuisCouche({ displayName: 'Vide', fields: [{ name: 'geometry_json' }] });
  assert.equal(sans, null);
  const beaucoup = H.bulleDepuisCouche({ displayName: 'Big', fields: ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => ({ name: n })) });
  assert.equal(beaucoup.titre, 'Big');
  assert.equal(beaucoup.champs.length, 3);
  assert.equal(H.BULLE_CHAMPS_MAX, 3);
});

test('texteVolume : entites, apres filtre, a jour (fiche et pastille de la barre du haut)', () => {
  const t0 = 1000000;
  assert.equal(H.texteVolume({ total: 6565 }).replace(/\s/g, ' '), '6 565 entités');
  assert.equal(H.texteVolume({ total: 1 }), '1 entité');
  assert.equal(H.texteVolume({ total: 0 }), '0 entité');
  const complet = H.texteVolume({ total: 6565, filtre: 1704, filtreActif: true, derniereSync: t0, direct: true, maintenant: t0 + 3000 });
  assert.equal(complet.replace(/\s/g, ' '), '6 565 entités · 1 704 après filtre · à jour à l’instant');
  assert.match(H.texteVolume({ total: 10, derniereSync: t0, direct: true, maintenant: t0 + 12000 }), /à jour il y a 12 s$/);
  assert.match(H.texteVolume({ total: 10, derniereSync: t0, direct: true, maintenant: t0 + 190000 }), /à jour il y a 3 min$/);
  // hors direct (apercu local) : jamais « a jour »
  assert.equal(H.texteVolume({ total: 10, derniereSync: t0, direct: false, maintenant: t0 + 1000 }), '10 entités');
  // filtre inactif : pas de ligne « apres filtre »
  assert.equal(H.texteVolume({ total: 10, filtre: 4, filtreActif: false }), '10 entités');
  assert.equal(H.texteVolume({ total: NaN }), '');
  assert.equal(H.texteVolume(), '');
  assert.equal(H.formaterDepuis(t0, t0 - 5000), 'à l’instant');
});

test('partiesVolume : trois morceaux, seul l’âge change avec le temps (pastille non annoncee en continu)', () => {
  const t0 = 1000000;
  const p = H.partiesVolume({ total: 6565, filtre: 1704, filtreActif: true, derniereSync: t0, direct: true, maintenant: t0 + 12000 });
  assert.equal(p.total.replace(/\s/g, ' '), '6 565 entités');
  assert.equal(p.filtre.replace(/\s/g, ' '), '1 704 après filtre');
  assert.equal(p.age, 'à jour il y a 12 s');
  // l’âge change, le total et le filtre restent identiques d'une relecture a l'autre
  const q = H.partiesVolume({ total: 6565, filtre: 1704, filtreActif: true, derniereSync: t0, direct: true, maintenant: t0 + 17000 });
  assert.equal(q.total, p.total);
  assert.equal(q.filtre, p.filtre);
  assert.notEqual(q.age, p.age);
  // sans direct ni filtre : morceaux vides, jamais « undefined »
  assert.deepEqual(H.partiesVolume({ total: 1 }), { total: '1 entité', filtre: '', age: '' });
  assert.deepEqual(H.partiesVolume({ total: NaN }), { total: '', filtre: '', age: '' });
  assert.deepEqual(H.partiesVolume(), { total: '', filtre: '', age: '' });
  // texteVolume est la jointure des morceaux
  assert.equal(H.texteVolume({ total: 6565, filtre: 1704, filtreActif: true, derniereSync: t0, direct: true, maintenant: t0 + 12000 }), [p.total, p.filtre, p.age].join(' · '));
});

test('construireUrlAtlas : mode composant, hote exact, base configurable', () => {
  const u = new URL(H.construireUrlAtlas('https://nic01asfr.github.io/Widgets-Grist/atlas/', { hote: 'https://grist.example' }));
  assert.equal(u.searchParams.get('bi'), '1');
  assert.equal(u.searchParams.get('navbar'), 'false');
  assert.equal(u.searchParams.get('mode'), 'view');
  assert.deepEqual(u.searchParams.getAll('hote'), ['https://grist.example']);
  const u2 = new URL(H.construireUrlAtlas('https://a.example/atlas/?hote=https://grist.example', { hote: 'https://grist.example', base: 'aucune' }));
  assert.deepEqual(u2.searchParams.getAll('hote'), ['https://grist.example']);
  assert.equal(u2.searchParams.get('base'), 'aucune');
  for (const hote of [undefined, '', 'null', '*']) {
    assert.throws(() => H.construireUrlAtlas('https://a.example/', { hote }), (e) => e.code === 'connexion_refusee' && e.repli === true);
  }
  assert.throws(() => H.construireUrlAtlas('javascript:alert(1)', { hote: 'https://h.example' }), (e) => e.repli === true);
  assert.throws(() => H.construireUrlAtlas('pas une url', { hote: 'https://h.example' }), (e) => e.code === 'client_absent');
});

// ---------------------------------------------------------------------------
// Construction de la scene
// ---------------------------------------------------------------------------

test('construireScene : manifeste BI, cle de ligne, controles identifies, ids uniques dans la scene', () => {
  const s = H.construireScene(entree(), null);
  assert.equal(s.manifeste.version, undefined, 'un manifeste BI ne porte pas de version');
  assert.deepEqual(s.manifeste.layers.map((l) => l.id), ['Sites', 'Zones']);
  const sites = s.manifeste.layers[0];
  assert.equal(sites.cle, '_row_id');
  assert.equal(sites.geometry_type, 'point');
  assert.equal(sites.style.qml_source, undefined);
  assert.ok(sites.style.declarative);
  assert.deepEqual(sites.controls.map((c) => c.id), ['f-Sites-type']);
  assert.equal(sites.bulle.titre, '{nom}');
  assert.equal(s.manifeste.meta.widget, 'qgis2grist-v2');
  // la ligne 3 n'a pas de geometrie : 2 entites + 1 comptee a part
  assert.equal(s.comptes.Sites, 2);
  assert.equal(s.sansGeometrie.Sites, 1);
  assert.equal(s.comptes.Zones, 2);
  const tousIds = [...s.donnees.Sites, ...s.donnees.Zones].map((f) => f.id);
  assert.equal(new Set(tousIds).size, 4, 'ids de scene uniques malgre les ids de ligne qui se recouvrent');
  assert.ok(tousIds.every((i) => Number.isInteger(i)));
  assert.equal(s.donnees.Sites[0].properties._row_id, 1);
  assert.equal(s.donnees.Sites[0].geometry.type, 'Point');
  assert.deepEqual(s.donnees.Sites[0].geometry.coordinates, [5.4, 43.3]);
  assert.equal(s.donnees.Zones[0].geometry.type, 'Polygon');
  assert.deepEqual(s.controles, [{ id: 'f-Sites-type', couche: 'Sites', champ: 'type', type: 'select', mode: null, label: 'Type' }]);
});

test('construireScene : n\'altere ni les couches ni les lignes, et le manifeste d\'origine reste identique', () => {
  const e = entree();
  const avant = JSON.stringify(e);
  H.construireScene(e, null);
  assert.equal(JSON.stringify(e), avant);
  const Scene = require('../lib/scene-manifest.js');
  const orig = Scene.buildSceneManifest(couches(), { title: 'Import test' }, 'test.qgz');
  const bi = H.construireScene(entree(), null).manifeste;
  assert.equal(orig.layers[0].controls[0].id, undefined, 'le builder partage n\'est pas modifie');
  // seule difference voulue : une surface a couleur unique est rendue a 55 % (comme l'ancienne carte)
  const attendu = orig.layers.map((l) => (l.geometry_type === 'polygon' && l.style.declarative.kind === 'single'
    ? { ...l.style.declarative, opacity: 0.55 } : l.style.declarative));
  assert.deepEqual(bi.layers.map((l) => l.style.declarative), attendu);
});

test('construireScene : lignes masquees non envoyees, sauf demande ; garderVersion', () => {
  const e = entree();
  e.lignes.Sites[1]._map_visible = false;
  const s = H.construireScene(e, null);
  assert.equal(s.comptes.Sites, 1);
  assert.equal(s.masquees.Sites, 1);
  const s2 = H.construireScene({ ...e, options: { inclureMasquees: true, garderVersion: true } }, null);
  assert.equal(s2.comptes.Sites, 2);
  assert.ok(s2.manifeste.version);
});

test('construireScene : couches de profil C et sources externes ignorees et dites', () => {
  const e = entree();
  e.couches.Gros = { displayName: 'Gros', geomType: 'Point', featureCount: 900000, fields: [], style: { type: 'singleSymbol', color: '#111' } };
  e.couches.Ext = { displayName: 'Ext', geomType: 'Point', featureCount: 3, _lod: { profile: 'A', fetch: { mode: 'full' } }, fields: [] };
  e.lignes.Gros = [];
  const s = H.construireScene(e, null);
  assert.ok(s.ignorees.some((i) => i.couche === 'Gros' && i.raison === 'profil_c'));
  assert.ok(!s.definitions.Gros);
  assert.ok(s.definitions.Ext, 'une couche de profil A reste montee');
});

test('construireScene : couleurLigne personnalisee et palette', () => {
  const s = H.construireScene(entree({ couleurLigne: (couche, row) => '#123456' }), null);
  assert.ok(s.donnees.Sites.every((f) => f.properties._fill_color === '#123456'));
  const s2 = H.construireScene(entree(), null);
  assert.equal(s2.donnees.Sites[0].properties._fill_color, '#ff0000');
});

test('construireScene : dependances injectees (faux builder / faux rowToFeature)', () => {
  const vus = [];
  const deps = {
    sceneManifest: { buildSceneManifest: () => ({ title: 't', classification: 'c', layers: [{ id: 'L', name: 'L', geometry_type: 'point', source: { type: 'grist' }, profile: 'A', controls: [], style: { declarative: { kind: 'single', color: '#000' } } }], meta: {} }) },
    carte: { rowToFeature: (row) => { vus.push(row.id); return { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }; } },
  };
  const s = H.construireScene({ couches: { L: { fields: [] } }, lignes: { L: [{ id: 7 }, { id: 8 }] } }, deps);
  assert.deepEqual(vus, [7, 8]);
  assert.equal(s.comptes.L, 2);
});

// ---------------------------------------------------------------------------
// Connexion et erreurs typees
// ---------------------------------------------------------------------------

test('classerErreur : codes du client Atlas vers erreurs typees et repli', () => {
  const t = (code, ctx) => H.classerErreur(erreurBi(code, 'm'), ctx);
  assert.equal(t('origine').code, 'connexion_refusee');
  assert.equal(t('origine').repli, true);
  assert.equal(t('composant').code, 'connexion_refusee');
  assert.equal(t('version').code, 'version_non_negociee');
  assert.equal(t('version').repli, true);
  assert.equal(t('capacite_absente').code, 'capacite_absente');
  assert.equal(t('deconnecte').repli, true);
  assert.equal(t('delai').repli, false);
  assert.equal(t('delai', { connexion: true }).repli, true);
  assert.equal(t('argument').code, 'commande');
  assert.equal(t('argument').repli, false);
  const deja = new H.ErreurHoteAtlas('commande', 'x');
  assert.equal(H.classerErreur(deja), deja);
  assert.equal(H.classerErreur('texte brut').code, 'commande');
});

test('connecter : client absent -> erreur typee avec repli', async () => {
  const hote = H.creerHote({});
  await assert.rejects(() => hote.connecter(), (e) => e instanceof H.ErreurHoteAtlas && e.code === 'client_absent' && e.repli === true);
  await assert.rejects(() => hote.poserScene(entree()), (e) => e.code === 'client_absent' && e.repli === true);
});

test('connecter : connexion refusee, delai, version non negociee -> repli', async () => {
  for (const [refus, code] of [['origine', 'connexion_refusee'], ['composant', 'connexion_refusee'], ['version', 'version_non_negociee'], ['delai', 'delai'], ['deconnecte', 'deconnecte']]) {
    const hote = H.creerHote({ client: fauxClient({ refus }) });
    await assert.rejects(() => hote.connecter(), (e) => e.code === code && e.repli === true, refus);
  }
});

test('connecter : version negociee trop ancienne ou capacite manquante -> repli', async () => {
  await assert.rejects(() => H.creerHote({ client: fauxClient({ version: '0.2' }) }).connecter(), (e) => e.code === 'version_non_negociee' && e.repli);
  await assert.rejects(() => H.creerHote({ client: fauxClient({ capacites: ['socle', 'temps'] }) }).connecter(), (e) => e.code === 'capacite_absente' && e.capacite === 'points' && e.repli);
  await assert.rejects(() => H.creerHote({ client: fauxClient({ capacites: ['points'] }) }).connecter(), (e) => e.code === 'capacite_absente' && e.capacite === 'socle');
  // 0.4 est accepte
  await H.creerHote({ client: fauxClient({ version: '0.4' }) }).connecter();
});

test('poserScene avant connecter : erreur sans repli', async () => {
  const hote = H.creerHote({ client: fauxClient() });
  await assert.rejects(() => hote.poserScene(entree()), (e) => e.code === 'commande' && e.repli === false);
});

test('commande refusee en cours de session : erreur typee, repli selon le code', async () => {
  const { hote } = await hoteConnecte({ echec: { fitTo: { code: 'argument', message: 'mauvais argument' } } });
  await hote.poserScene(entree());
  await assert.rejects(() => hote.cadrer(), (e) => e.code === 'commande' && e.repli === false && /fitTo/.test(e.message));
  const { hote: h2 } = await hoteConnecte({ echec: { flyTo: { code: 'deconnecte', message: 'coupe' } } });
  await h2.poserScene(entree());
  await assert.rejects(() => h2.voler({ center: [5, 43], zoom: 10 }), (e) => e.code === 'deconnecte' && e.repli === true);
});

test('poserScene : toutes les couches refusees -> scene_refusee avec repli', async () => {
  const { hote } = await hoteConnecte({ refuserCouches: ['Sites', 'Zones'] });
  await assert.rejects(() => hote.poserScene(entree()), (e) => e.code === 'scene_refusee' && e.repli === true && e.details.length === 2);
  assert.equal(hote.etat().scenePosee, false);
});

test('poserScene : une couche refusee seule n\'empeche pas le reste et n\'est pas synchronisee', async () => {
  const { hote, client } = await hoteConnecte({ refuserCouches: ['Zones'] });
  const r = await hote.poserScene(entree());
  assert.equal(r.erreurs.length, 1);
  assert.equal(r.erreurs[0].couche, 'Zones');
  assert.deepEqual(hote.etat().refusees, ['Zones']);
  const sync = await hote.synchroniser({ Zones: [] });
  assert.deepEqual(sync.inconnues, ['Zones']);
  assert.equal(client.appelsDe('setScene').length, 1);
});

// ---------------------------------------------------------------------------
// Scene : envoi, comptes, avertissements
// ---------------------------------------------------------------------------

test('poserScene : un setScene complet, comptes par couche, ids de scene dans les donnees', async () => {
  const { hote, client } = await hoteConnecte();
  const r = await hote.poserScene(entree());
  const sc = client.appelsDe('setScene');
  assert.equal(sc.length, 1);
  assert.equal(sc[0].args[0].fusion, undefined);
  assert.deepEqual(sc[0].args[0].layers.map((l) => l.id), ['Sites', 'Zones']);
  assert.deepEqual(r.comptes, { Sites: 2, Zones: 2 });
  assert.deepEqual(r.depasseSeuil, []);
  assert.equal(r.controles.length, 1);
  assert.deepEqual(hote.etat().comptes, { Sites: 2, Zones: 2 });
  assert.equal(hote.etat().scenePosee, true);
  assert.deepEqual(Object.keys(hote.etat().empreintes).sort(), ['Sites', 'Zones']);
});

test('poserScene : l\'avertissement d\'Atlas est relaye, sans refus (D3)', async () => {
  const recus = [];
  const { hote } = await hoteConnecte(
    { avertissements: { Sites: ['plus de 50 000 entites dans une couche : agreger', 'second'], _scene: 'curseur inconnu' } },
    { surAvertissement: (a) => recus.push(a) },
  );
  const r = await hote.poserScene(entree());
  assert.equal(r.avertissements.length, 3);
  assert.deepEqual(recus[0], { couche: 'Sites', message: 'plus de 50 000 entites dans une couche : agreger' });
  assert.deepEqual(recus[2], { couche: '_scene', message: 'curseur inconnu' });
  assert.equal(hote.etat().scenePosee, true);
});

test('poserScene : depasseSeuil signale (information locale) les couches de plus de 50 000 entites', async () => {
  const { hote } = await hoteConnecte();
  const e = entree();
  e.lignes.Sites = Array.from({ length: H.SEUIL_VOLUME + 1 }, (_, i) => ({ id: i + 1, nom: 'n' + i, type: 'a', surface: 1, latitude: 43, longitude: 5 }));
  const r = await hote.poserScene(e);
  assert.deepEqual(r.depasseSeuil, ['Sites']);
  assert.equal(r.comptes.Sites, H.SEUIL_VOLUME + 1);
});

test('poserScene : theme et fond retenus sont envoyes avant la scene', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.appliquerTheme({ principal: '#0b6e4f' }, { remplacer: true });
  await hote.definirFond('uni', { fond: '#fafafa' });
  await hote.poserScene(entree());
  const ordre = client.appels.map((a) => a.cmd);
  assert.deepEqual(ordre, ['setTheme', 'setFond', 'setTheme', 'setFond', 'setScene']);
  assert.deepEqual(client.appels[2].args, [{ principal: '#0b6e4f' }, { remplacer: true }]);
  assert.deepEqual(client.appels[3].args, ['uni', { fond: '#fafafa' }]);
});

// ---------------------------------------------------------------------------
// Synchronisation incrementale
// ---------------------------------------------------------------------------

test('synchroniser : lignes identiques -> aucun appel', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  const avant = client.appels.length;
  const r = await hote.synchroniser({ Sites: lignesSites(), Zones: lignesZones() });
  assert.deepEqual(r.envoyees, []);
  assert.deepEqual(r.inchangees.sort(), ['Sites', 'Zones']);
  assert.equal(client.appels.length, avant);
});

test('synchroniser : seule la couche modifiee part, en setScene fusion, jamais updateFeature', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  const sites = lignesSites();
  sites[0].nom = 'Alpha modifie';
  const r = await hote.synchroniser({ Sites: sites, Zones: lignesZones() });
  assert.deepEqual(r.envoyees, ['Sites']);
  assert.deepEqual(r.inchangees, ['Zones']);
  const sc = client.appelsDe('setScene');
  assert.equal(sc.length, 2);
  const [manifeste, donnees] = sc[1].args;
  assert.equal(manifeste.fusion, true);
  assert.deepEqual(manifeste.layers.map((l) => l.id), ['Sites']);
  assert.deepEqual(Object.keys(donnees), ['Sites']);
  assert.equal(donnees.Sites[0].properties.nom, 'Alpha modifie');
  assert.equal(client.appelsDe('updateFeature').length, 0);
  assert.equal(manifeste.layers[0].cle, '_row_id');
  // l'empreinte est a jour : une deuxieme passe n'envoie plus rien
  const r2 = await hote.synchroniser({ Sites: sites });
  assert.deepEqual(r2.envoyees, []);
  assert.equal(client.appelsDe('setScene').length, 2);
});

test('synchroniser : plusieurs couches modifiees -> un seul setScene fusion', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  const sites = lignesSites().slice(0, 2);
  const zones = lignesZones();
  zones[1].libelle = 'Z2 bis';
  const r = await hote.synchroniser({ Sites: sites, Zones: zones });
  assert.deepEqual(r.envoyees.sort(), ['Sites', 'Zones']);
  const sc = client.appelsDe('setScene');
  assert.equal(sc.length, 2);
  assert.deepEqual(sc[1].args[0].layers.map((l) => l.id), ['Sites', 'Zones']);
  assert.deepEqual(r.comptes, { Sites: 2, Zones: 2 });
});

test('synchroniser : les ids de scene des lignes inchangees restent stables, les nouvelles lignes en recoivent', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  const idsAvant = Object.fromEntries(client.appelsDe('setScene')[0].args[1].Sites.map((f) => [f.properties._row_id, f.id]));
  const sites = lignesSites();
  sites.push({ id: 4, nom: 'Delta', type: 'b', surface: 1, latitude: 43.2, longitude: 5.3 });
  await hote.synchroniser({ Sites: sites });
  const apres = client.appelsDe('setScene')[1].args[1].Sites;
  for (const f of apres) {
    if (idsAvant[f.properties._row_id] !== undefined) assert.equal(f.id, idsAvant[f.properties._row_id]);
  }
  const nouvelle = apres.find((f) => f.properties._row_id === 4);
  assert.ok(nouvelle && !Object.values(idsAvant).includes(nouvelle.id));
  const toutes = new Set(client.appelsDe('setScene')[0].args[1].Zones.map((f) => f.id));
  assert.ok(!toutes.has(nouvelle.id), 'pas de collision avec l\'autre couche');
});

test('synchroniser : couche inconnue signalee, sans appel', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  const r = await hote.synchroniser({ Fantome: [{ id: 1 }] });
  assert.deepEqual(r.inconnues, ['Fantome']);
  assert.equal(client.appelsDe('setScene').length, 1);
});

test('synchroniser : avant poserScene -> erreur', async () => {
  const { hote } = await hoteConnecte();
  assert.throws(() => hote.synchroniser({ Sites: [] }), (e) => e.code === 'commande');
});

test('synchroniser : un setScene fusion qui echoue laisse l\'etat intact et le lot est repris', async () => {
  const client = fauxClient();
  const hote = H.creerHote({ client });
  await hote.connecter();
  await hote.poserScene(entree());
  const empreinteAvant = hote.etat().empreintes.Sites;
  const sites = lignesSites();
  sites[0].nom = 'Alpha 2';
  // a partir de maintenant le prochain setScene echoue une fois
  const original = client.appeler;
  let echoue = false;
  client.appeler = async (cmd, ...args) => {
    if (cmd === 'setScene' && !echoue) { echoue = true; throw erreurBi('delai', 'pas de reponse'); }
    return original.call(client, cmd, ...args);
  };
  await assert.rejects(() => hote.synchroniser({ Sites: sites }), (e) => e.code === 'delai' && e.repli === false);
  assert.equal(hote.etat().empreintes.Sites, empreinteAvant);
  assert.deepEqual(hote.etat().enAttente, ['Sites'], 'lot remis en file');
  const r = await hote.synchroniser({});
  assert.deepEqual(r.envoyees, ['Sites']);
  assert.notEqual(hote.etat().empreintes.Sites, empreinteAvant);
});

test('synchroniser : appels concurrents regroupes, la derniere version des lignes l\'emporte', async () => {
  const client = fauxClient();
  const hote = H.creerHote({ client });
  await hote.connecter();
  await hote.poserScene(entree());
  const v1 = lignesSites(); v1[0].nom = 'v1';
  const v2 = lignesSites(); v2[0].nom = 'v2';
  const v3 = lignesSites(); v3[0].nom = 'v3';
  const p1 = hote.synchroniser({ Sites: v1 });
  const p2 = hote.synchroniser({ Sites: v2 });
  const p3 = hote.synchroniser({ Sites: v3 });
  await Promise.all([p1, p2, p3]);
  const fusions = client.appelsDe('setScene').filter((a) => a.args[0].fusion);
  assert.ok(fusions.length <= 2, 'au plus une passe en cours + une passe regroupee');
  const derniere = fusions[fusions.length - 1].args[1].Sites;
  assert.equal(derniere.find((f) => f.properties._row_id === 1).properties.nom, 'v3');
});

test('suspendre / reprendre : rien n\'est envoye pendant la suspension, la derniere version part a la reprise', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  hote.suspendre();
  assert.equal(hote.estSuspendu(), true);
  const a = lignesSites(); a[0].nom = 'a';
  const b = lignesSites(); b[0].nom = 'b';
  const r1 = await hote.synchroniser({ Sites: a });
  const r2 = await hote.synchroniser({ Sites: b });
  assert.equal(r1.suspendu, true);
  assert.deepEqual(r2.enAttente, ['Sites']);
  assert.equal(client.appelsDe('setScene').length, 1);
  const r = await hote.reprendre();
  assert.deepEqual(r.envoyees, ['Sites']);
  const fusions = client.appelsDe('setScene').filter((x) => x.args[0].fusion);
  assert.equal(fusions.length, 1);
  assert.equal(fusions[0].args[1].Sites.find((f) => f.properties._row_id === 1).properties.nom, 'b');
  assert.equal(hote.estSuspendu(), false);
  assert.deepEqual(hote.etat().enAttente, []);
});

test('reprendre : sans rien en attente, aucun appel', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  hote.suspendre();
  const r = await hote.reprendre();
  assert.deepEqual(r.envoyees, []);
  assert.equal(client.appelsDe('setScene').length, 1);
});

test('synchroniser : un Atlas qui ignore fusion -> scene rejouee en entier, puis synchronisation par scene complete', async () => {
  const erreurs = [];
  const { hote, client } = await hoteConnecte({ ignorerFusion: true }, { surErreur: (e) => erreurs.push(e) });
  await hote.poserScene(entree());
  const sites = lignesSites(); sites[0].nom = 'x';
  await hote.synchroniser({ Sites: sites });
  const sc = client.appelsDe('setScene');
  // fusion tentee, constat que Zones a disparu, scene complete rejouee
  assert.equal(sc.length, 3);
  assert.equal(sc[1].args[0].fusion, true);
  assert.equal(sc[2].args[0].fusion, undefined);
  assert.deepEqual(sc[2].args[0].layers.map((l) => l.id), ['Sites', 'Zones']);
  assert.equal(client.scene.get('Zones'), 2, 'la couche non modifiee est de nouveau la');
  assert.equal(hote.etat().fusion, false);
  assert.equal(erreurs[0].code, 'fusion_absente');
  // prochaine modification : directement la scene complete, sans tentative de fusion
  const zones = lignesZones(); zones[0].libelle = 'zz';
  await hote.synchroniser({ Zones: zones });
  const sc2 = client.appelsDe('setScene');
  assert.equal(sc2.length, 4);
  assert.equal(sc2[3].args[0].fusion, undefined);
});

test('synchroniser : une fusion respectee est confirmee', async () => {
  const { hote } = await hoteConnecte();
  await hote.poserScene(entree());
  assert.equal(hote.etat().fusion, null);
  const sites = lignesSites(); sites[0].nom = 'y';
  await hote.synchroniser({ Sites: sites });
  assert.equal(hote.etat().fusion, true);
});

test('synchroniser : l\'etat des filtres, les couches masquees et la selection survivent a la remontee de couche', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  await hote.filtrer({ couche: 'Sites', champ: 'type' }, ['a']);
  await hote.definirVisibilite('Sites', false);
  await hote.selectionner('Sites', 2);
  client.appels.length = 0;
  const sites = lignesSites(); sites[1].surface = 99;
  await hote.synchroniser({ Sites: sites });
  const cmds = client.appels.map((a) => a.cmd);
  assert.deepEqual(cmds, ['setScene', 'setLayerVisibility', 'select']);
  const ctrl = client.appels[0].args[0].layers[0].controls[0];
  assert.equal(ctrl.active, true);
  assert.deepEqual(ctrl.values, ['a']);
  assert.deepEqual(client.appels[1].args, ['Sites', false]);
  const feat = client.appels[0].args[1].Sites.find((f) => f.properties._row_id === 2);
  assert.deepEqual(client.appels[2].args, [feat.id]);
});

test('synchroniser : selection d\'une ligne disparue -> pas de select', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  await hote.selectionner('Sites', 2);
  client.appels.length = 0;
  await hote.synchroniser({ Sites: [lignesSites()[0]] });
  assert.deepEqual(client.appels.map((a) => a.cmd), ['setScene']);
  assert.equal(hote.etat().selection, null);
});

test('synchroniser : une couche refusee a la fusion n\'est plus synchronisee', async () => {
  const client = fauxClient();
  const hote = H.creerHote({ client });
  await hote.connecter();
  await hote.poserScene(entree());
  client.refuserFutur = true;
  const orig = client.appeler;
  client.appeler = async (cmd, ...args) => {
    const r = await orig.call(client, cmd, ...args);
    if (cmd === 'setScene' && args[0].fusion) r._erreurs = { Sites: 'capacite_absente : points' };
    return r;
  };
  const sites = lignesSites(); sites[0].nom = 'q';
  const r = await hote.synchroniser({ Sites: sites });
  assert.deepEqual(r.envoyees, []);
  assert.equal(r.erreurs[0].couche, 'Sites');
  assert.deepEqual(hote.etat().refusees, ['Sites']);
});

// ---------------------------------------------------------------------------
// Evenements
// ---------------------------------------------------------------------------

test('select : evenement Atlas -> couche et id de ligne Grist (ids de ligne recouvrants)', async () => {
  const recus = [];
  const { hote, client } = await hoteConnecte({}, { surSelection: (s) => recus.push(s) });
  await hote.poserScene(entree());
  const donnees = client.appelsDe('setScene')[0].args[1];
  const zone2 = donnees.Zones.find((f) => f.properties._row_id === 2);
  const site1 = donnees.Sites.find((f) => f.properties._row_id === 1);
  client.emit('select', { layer: 'Zones', featureId: zone2.id, key: 2, properties: { libelle: 'Z2' } });
  client.emit('select', { layer: 'Sites', featureId: site1.id, key: 1 });
  assert.equal(recus[0].couche, 'Zones');
  assert.equal(recus[0].ligneId, 2);
  assert.deepEqual(recus[0].proprietes, { libelle: 'Z2' });
  assert.equal(recus[1].couche, 'Sites');
  assert.equal(recus[1].ligneId, 1);
  assert.deepEqual(hote.etat().selection, { couche: 'Sites', ligneId: 1 });
  client.emit('select', { layer: null, featureId: null });
  assert.equal(recus[2].couche, null);
  assert.equal(recus[2].ligneId, null);
  assert.equal(hote.etat().selection, null);
});

test('select : id inconnu retombe sur la cle metier _row_id', async () => {
  const recus = [];
  const { hote, client } = await hoteConnecte({}, { surSelection: (s) => recus.push(s) });
  await hote.poserScene(entree());
  client.emit('select', { layer: 'Sites', featureId: 99999, key: 7 });
  assert.equal(recus[0].couche, 'Sites');
  assert.equal(recus[0].ligneId, 7);
});

test('hover et action : transformes en rappels du widget', async () => {
  const surv = [];
  const act = [];
  const { hote, client } = await hoteConnecte({}, { surSurvol: (s) => surv.push(s), surAction: (a) => act.push(a) });
  await hote.poserScene(entree());
  const f = client.appelsDe('setScene')[0].args[1].Sites[1];
  client.emit('hover', { layer: 'Sites', featureId: f.id, key: 2 });
  client.emit('hover', { layer: null, featureId: null });
  client.emit('action', { layer: 'Sites', featureId: f.id, key: 2, actionId: 'ouvrir-fiche' });
  assert.equal(surv[0].ligneId, 2);
  assert.equal(surv[1].couche, null);
  assert.equal(act[0].actionId, 'ouvrir-fiche');
  assert.equal(act[0].ligneId, 2);
});

test('filter : evenement Atlas -> rappel avec couche, champ, valeur ; l\'etat est retenu', async () => {
  const recus = [];
  const { hote, client } = await hoteConnecte({}, { surFiltre: (f) => recus.push(f) });
  await hote.poserScene(entree());
  client.emit('filter', { controlId: 'f-Sites-type', value: ['b'], layer: 'Sites', compte: 1, total: 2 });
  assert.deepEqual(recus[0], { couche: 'Sites', controleId: 'f-Sites-type', champ: 'type', type: 'select', valeur: ['b'], compte: 1, total: 2, origine: 'utilisateur' });
  // une fusion reporte ce filtre
  const sites = lignesSites(); sites[0].nom = 'zz';
  await hote.synchroniser({ Sites: sites });
  assert.equal(hote.listerControles()[0].id, 'f-Sites-type');
  client.emit('filter', { controlId: 'f-Sites-type', value: null, layer: 'Sites', compte: 2, total: 2 });
  assert.equal(recus[1].valeur, null);
  client.emit('filter', { controlId: 'inconnu', value: [] });
  assert.equal(recus.length, 2);
});

test('evenements de l\'api (origine api) ne sont pas livres par defaut : pas de boucle', async () => {
  const recus = [];
  const { hote, client } = await hoteConnecte({}, { surSelection: (s) => recus.push(s) });
  await hote.poserScene(entree());
  client.emit('select', { layer: 'Sites', featureId: 1, key: 1 }, 'api');
  assert.equal(recus.length, 0);
});

test('fermer : desinscrit les ecouteurs', async () => {
  const { hote, client } = await hoteConnecte();
  assert.ok(client.nbEcouteurs() > 0);
  hote.fermer();
  assert.equal(client.nbEcouteurs(), 0);
  assert.equal(hote.etat().scenePosee, false);
});

test('ready d\'amorcage (iframe rechargee) : la scene est rejouee, pas l\'autre ready', async () => {
  const erreurs = [];
  const { hote, client } = await hoteConnecte({}, { surErreur: (e) => erreurs.push(e) });
  // avant la scene : un ready d'amorcage ne fait rien
  client.emit('ready', { runtime: true, version: '0.3' }, 'api');
  assert.equal(client.appelsDe('setScene').length, 0);
  await hote.poserScene(entree());
  await hote.appliquerTheme({ principal: '#123456' });
  client.emit('ready', { layers: { Sites: 2 } }, 'api');   // ready de scene : ignore
  assert.equal(client.appelsDe('setScene').length, 1);
  client.emit('ready', { runtime: true, version: '0.3' }, 'api');
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(client.appelsDe('setScene').length, 2);
  assert.equal(client.appelsDe('setTheme').length, 2, 'le theme est renvoye avant la scene rejouee');
  assert.deepEqual(erreurs, []);
});

// ---------------------------------------------------------------------------
// Commandes : cadrage, visibilite, filtres, apparence
// ---------------------------------------------------------------------------

test('cadrer : toute la scene, une couche, ou des lignes Grist traduites en ids de scene', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  await hote.cadrer();
  await hote.cadrer('Zones');
  await hote.cadrer({ couche: 'Zones', lignes: [2, 1, 999] });
  const f = client.appelsDe('fitTo');
  assert.deepEqual(f[0].args, []);
  assert.deepEqual(f[1].args, ['Zones']);
  const zones = client.appelsDe('setScene')[0].args[1].Zones;
  assert.deepEqual(f[2].args[0], [zones[1].id, zones[0].id]);
  await assert.rejects(() => hote.cadrer('Fantome'), (e) => e.code === 'commande');
  await assert.rejects(() => hote.cadrer({ couche: 'Zones', lignes: [999] }), (e) => e.code === 'commande');
  await assert.rejects(() => hote.cadrer(42), (e) => e.code === 'commande');
});

test('voler : flyTo transmis tel quel ; camera invalide refusee', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  await hote.voler({ center: [5.4, 43.3], zoom: 12 });
  assert.deepEqual(client.appelsDe('flyTo')[0].args, [{ center: [5.4, 43.3], zoom: 12 }]);
  await assert.rejects(() => hote.voler(null), (e) => e.code === 'commande');
});

test('selectionner / surligner : traduisent la ligne Grist en id de scene', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  const sites = client.appelsDe('setScene')[0].args[1].Sites;
  await hote.selectionner('Sites', 2);
  assert.deepEqual(client.appelsDe('select')[0].args, [sites[1].id]);
  await hote.selectionner(null);
  assert.deepEqual(client.appelsDe('select')[1].args, [null]);
  await assert.rejects(() => hote.selectionner('Sites', 999), (e) => e.code === 'commande');
  await hote.surligner('Sites', [1, 2]);
  assert.deepEqual(client.appelsDe('highlight')[0].args, [[sites[0].id, sites[1].id]]);
  await hote.surligner('Sites', []);
  assert.deepEqual(client.appelsDe('highlight')[1].args, [[]]);
});

test('definirVisibilite : setLayerVisibility, couche inconnue refusee', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  await hote.definirVisibilite('Zones', false);
  assert.deepEqual(client.appelsDe('setLayerVisibility')[0].args, ['Zones', false]);
  await hote.definirVisibilite('Zones', true);
  await assert.rejects(() => hote.definirVisibilite('Fantome', true), (e) => e.code === 'commande');
});

test('filtrer : par id ou par {couche, champ}, retrait, controle inconnu refuse', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  const r = await hote.filtrer('f-Sites-type', ['a']);
  assert.deepEqual(r, { layer: 'x', compte: 1, total: 2 });
  await hote.filtrer({ couche: 'Sites', champ: 'type', type: 'select' }, ['a', 'b']);
  await hote.retirerFiltre('f-Sites-type');
  const f = client.appelsDe('setFilter');
  assert.deepEqual(f[0].args, ['f-Sites-type', ['a']]);
  assert.deepEqual(f[1].args, ['f-Sites-type', ['a', 'b']]);
  assert.deepEqual(f[2].args, ['f-Sites-type', null]);
  await assert.rejects(() => hote.filtrer('nope', []), (e) => e.code === 'commande');
  await assert.rejects(() => hote.filtrer({ couche: 'Sites', champ: 'x' }, []), (e) => e.code === 'commande');
  assert.equal(hote.listerControles().length, 1);
});

test('filtrer : un filtre pose est reporte a la remontee de couche, retire il ne l\'est plus', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  await hote.filtrer('f-Sites-type', ['b']);
  const s1 = lignesSites(); s1[0].nom = 'm1';
  await hote.synchroniser({ Sites: s1 });
  let ctrl = client.appelsDe('setScene').pop().args[0].layers[0].controls[0];
  assert.equal(ctrl.active, true);
  assert.deepEqual(ctrl.values, ['b']);
  await hote.retirerFiltre('f-Sites-type');
  const s2 = lignesSites(); s2[0].nom = 'm2';
  await hote.synchroniser({ Sites: s2 });
  ctrl = client.appelsDe('setScene').pop().args[0].layers[0].controls[0];
  assert.equal(ctrl.active, false);
});

test('appliquerFiltres : range, time et text', () => {
  const def = { controls: [
    { id: 'r', type: 'range', min: 0, max: 100, active: false },
    { id: 't', type: 'text', active: false },
    { id: 'd', type: 'time', active: false },
  ] };
  const f = new Map([['r', { min: 10 }], ['t', { texte: 'abc' }], ['d', { min: 1, max: 2 }]]);
  const out = H.appliquerFiltres(def, f);
  assert.deepEqual(out.controls[0], { id: 'r', type: 'range', min: 10, max: 100, active: true });
  assert.equal(out.controls[1].texte, 'abc');
  assert.deepEqual([out.controls[2].min, out.controls[2].max, out.controls[2].active], [1, 2, true]);
  assert.equal(H.appliquerFiltres(def, new Map()), def);
  assert.equal(def.controls[0].active, false, 'definition d\'origine non modifiee');
});

test('legende, theme, fond, redimensionner : commandes transmises', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  await hote.legende('Sites');
  await hote.legende();
  await hote.appliquerTheme({ principal: '#0b6e4f' });
  await hote.definirFond('plan');
  await hote.redimensionner();
  assert.deepEqual(client.appelsDe('getLegend').map((a) => a.args), [['Sites'], []]);
  assert.deepEqual(client.appelsDe('setTheme')[0].args, [{ principal: '#0b6e4f' }]);
  assert.deepEqual(client.appelsDe('setFond')[0].args, ['plan']);
  assert.equal(client.appelsDe('resize').length, 1);
});

test('rejouer : renvoie theme, fond, scene, visibilites cachees et selection', async () => {
  const { hote, client } = await hoteConnecte();
  await hote.poserScene(entree());
  await hote.appliquerTheme({ principal: '#0b6e4f' });
  await hote.definirFond('uni');
  await hote.definirVisibilite('Zones', false);
  await hote.selectionner('Sites', 1);
  client.appels.length = 0;
  await hote.rejouer();
  assert.deepEqual(client.appels.map((a) => a.cmd), ['setTheme', 'setFond', 'setScene', 'setLayerVisibility', 'select']);
});

// ---------------------------------------------------------------------------
// Clients de forme differente
// ---------------------------------------------------------------------------

test('client a methodes directes (sans appeler) : commandes appelees par leur nom', async () => {
  const appels = [];
  const client = {
    async connecter() { return { version: '0.3', capacites: ['socle', 'points'] }; },
    async setScene(m, d) { appels.push('setScene'); return Object.fromEntries(m.layers.map((l) => [l.id, d[l.id].length])); },
    async fitTo(...a) { appels.push(['fitTo', a]); return true; },
  };
  const hote = H.creerHote({ client });
  await hote.connecter();
  await hote.poserScene(entree());
  await hote.cadrer('Sites');
  assert.deepEqual(appels, ['setScene', ['fitTo', ['Sites']]]);
  await assert.rejects(() => hote.legende(), (e) => e.code === 'commande' && /non disponible/.test(e.message));
});

test('depuisElement : presente un element <atlas-bi> comme un client', async () => {
  const trace = [];
  const el = {
    pret: Promise.resolve({ version: '0.3', capacites: ['socle', 'points'] }),
    client: {
      appeler: async (cmd, ...a) => { trace.push([cmd, a]); return cmd === 'setScene' ? { Sites: 2, Zones: 2 } : true; },
      on: (t, cb, o) => { trace.push(['on', t]); return () => {}; },
      deconnecter: () => trace.push(['deconnecter']),
    },
  };
  const c = H.depuisElement(el);
  const hote = H.creerHote({ client: c });
  const info = await hote.connecter();
  assert.equal(info.version, '0.3');
  await hote.poserScene(entree());
  assert.ok(trace.some((t) => t[0] === 'on' && t[1] === 'select'));
  assert.ok(trace.some((t) => t[0] === 'setScene'));
  hote.fermer({ deconnecter: true });
  assert.ok(trace.some((t) => t[0] === 'deconnecter'));
  assert.throws(() => H.depuisElement(null), (e) => e.code === 'client_absent' && e.repli === true);
  const sansClient = H.depuisElement({ pret: Promise.resolve({}) });
  await assert.rejects(async () => sansClient.appeler('ping'), (e) => e.code === 'client_absent');
});

test('module : ne touche ni DOM ni reseau (charge sans window)', () => {
  assert.equal(typeof window, 'undefined');
  assert.equal(typeof H.creerHote, 'function');
  assert.equal(H.SEUIL_VOLUME, 50000);
});

// ---------------------------------------------------------------------------
// Couleurs de donnees : style natif garde ou categorisation sur _fill_color
// ---------------------------------------------------------------------------

function feats(liste) {
  return liste.map((p, i) => ({ type: 'Feature', id: i + 1, geometry: null, properties: p }));
}

test('ajusterStyleDeclaratif : un style categorise qui redonne les couleurs est garde', () => {
  const def = { id: 'A', style: { declarative: { kind: 'categorized', field: 'type', stops: [
    { value: 'a', label: 'A', color: '#ff0000' }, { value: 'b', label: 'B', color: '#00ff00' }] } } };
  const f = feats([{ type: 'a', _fill_color: '#FF0000' }, { type: 'b', _fill_color: '#00ff00' }, { type: 'a', _fill_color: '#ff0000' }]);
  assert.equal(H.ajusterStyleDeclaratif(def, f), def);
});

test('ajusterStyleDeclaratif : un style a regles (champ nul) devient une categorisation sur _fill_color avec libelles', () => {
  const def = { id: 'A', style: { declarative: { kind: 'categorized', field: null, stops: [
    { value: 'Regle 1', label: 'Regle 1', color: '#ffffff' }, { value: 'Regle 2', label: 'Regle 2', color: '#123456' }] } } };
  const f = feats([{ _fill_color: '#ffffff' }, { _fill_color: '#123456' }, { _fill_color: '#999999' }]);
  const r = H.ajusterStyleDeclaratif(def, f);
  assert.notEqual(r, def);
  assert.equal(r.style.declarative.kind, 'categorized');
  assert.equal(r.style.declarative.field, '_fill_color');
  const parCouleur = Object.fromEntries(r.style.declarative.stops.map((s) => [s.value, s.label]));
  assert.equal(parCouleur['#ffffff'], 'Regle 1');
  assert.equal(parCouleur['#123456'], 'Regle 2');
  assert.equal(parCouleur['#999999'], '#999999');
  assert.deepEqual(def.style.declarative.stops.length, 2, 'entree non alteree');
});

test('ajusterStyleDeclaratif : une seule couleur -> style single ; sans entite -> definition inchangee', () => {
  const def = { id: 'A', style: { declarative: { kind: 'categorized', field: null, stops: [] } } };
  const r = H.ajusterStyleDeclaratif(def, feats([{ _fill_color: '#abcdef' }, { _fill_color: '#ABCDEF' }]));
  assert.deepEqual(r.style.declarative, { kind: 'single', color: '#abcdef' });
  assert.equal(H.ajusterStyleDeclaratif(def, []), def);
});

test('ajusterStyleDeclaratif : un gradue en desaccord avec les couleurs est remplace, un gradue d\'accord est garde', () => {
  const grad = { kind: 'graduated', field: 'h', stops: [
    { lower: 0, upper: 1, color: '#0000ff' }, { lower: 1, upper: 2, color: '#ff0000' }] };
  const def = { id: 'A', style: { declarative: grad } };
  const ok = feats([{ h: 0.5, _fill_color: '#0000ff' }, { h: 1.5, _fill_color: '#ff0000' }]);
  assert.equal(H.ajusterStyleDeclaratif(def, ok), def);
  const ko = feats([{ h: 0.5, _fill_color: '#00ff00' }, { h: 1.5, _fill_color: '#ffff00' }]);
  assert.equal(H.ajusterStyleDeclaratif(def, ko).style.declarative.field, '_fill_color');
});

test('construireScene : le style ajuste suit les couleurs de ligne fournies par couleurLigne', () => {
  const lignes = { Sites: lignesSites(), Zones: lignesZones() };
  const sc = H.construireScene({
    couches: couches(), lignes, meta: null, nomFichier: 'x.gpkg',
    couleurLigne: (couche, row) => (row.id === 1 ? '#111111' : '#222222'),
  }, undefined, undefined);
  const d = sc.manifeste.layers.find((l) => l.id === 'Sites').style.declarative;
  assert.equal(d.field, '_fill_color');
  assert.equal(sc.stylesBase.Sites.declarative.field, 'type');
});

// ---------------------------------------------------------------------------
// Couleur d'une ligne : les points gardent la colonne fill_color (parite avec l'ancienne carte)
// ---------------------------------------------------------------------------

test('couleurDeLigne : un point prend fill_color, meme quand le style ne reconnait pas la valeur', () => {
  const calculer = () => '#f59e0b';   // makeMarkerColorFn : couleur par defaut (libelle Grist absent du QML)
  const point = { geomType: 'Point', _color: '#f59e0b' };
  assert.equal(H.couleurDeLigne(point, { fill_color: '#2da4ff', bee_species: 'Buckfast bee' }, calculer), '#2da4ff');
});

test('couleurDeLigne : lignes et surfaces gardent la couleur du style', () => {
  const calculer = () => '#112233';
  assert.equal(H.couleurDeLigne({ geomType: 'Line', _color: '#aaaaaa' }, { fill_color: '#f59e0b' }, calculer), '#112233');
  assert.equal(H.couleurDeLigne({ geomType: 'Polygon', _color: '#aaaaaa' }, { fill_color: '#f59e0b' }, calculer), '#112233');
});

test('couleurDeLigne : replis (fill_color absent ou invalide, style sans couleur)', () => {
  const point = { geomType: 'Point', _color: '#3e5de7' };
  assert.equal(H.couleurDeLigne(point, { fill_color: '' }, () => '#abcdef'), '#abcdef');
  assert.equal(H.couleurDeLigne(point, { fill_color: 'rouge' }, null), '#3e5de7');
  assert.equal(H.couleurDeLigne({ geomType: 'Line' }, {}, () => null), '#808080');
  assert.equal(H.couleurDeLigne({ geomType: 'Line', _color: '#101010' }, { fill_color: '#202020' }, () => null), '#202020');
});

test('definitionCouche : une surface a couleur unique est rendue a 55 % comme l\'ancienne carte', () => {
  const base = { id: 'Limite', geometry_type: 'polygon', style: { declarative: { kind: 'single', color: '#000000', opacity: 1 } } };
  const d = H.definitionCouche(base, { geomType: 'Polygon', displayName: 'Limite', fields: [] }, { bulle: false });
  assert.equal(d.style.declarative.opacity, 0.55);
  assert.equal(base.style.declarative.opacity, 1, 'le manifeste d\'origine n\'est pas modifie');
  const ligne = H.definitionCouche({ ...base, geometry_type: 'line' }, { geomType: 'Line', fields: [] }, { bulle: false });
  assert.equal(ligne.style.declarative.opacity, 1);
  const cat = { id: 'B', geometry_type: 'polygon', style: { declarative: { kind: 'categorized', field: 'a', stops: [{ value: 'x', color: '#111111' }] } } };
  assert.equal(H.definitionCouche(cat, { geomType: 'Polygon', fields: [] }, { bulle: false }).style.declarative.opacity, undefined);
  const choisie = { ...base, style: { declarative: { kind: 'single', color: '#000000', opacity: 0.3 } } };
  assert.equal(H.definitionCouche(choisie, { geomType: 'Polygon', fields: [] }, { bulle: false }).style.declarative.opacity, 0.3);
});

// ---------------------------------------------------------------------------
// Fiche et bulle lisibles : dates (secondes Unix) et references (libelle de la ligne cible)
// ---------------------------------------------------------------------------

test('formaterDate : Date en jj/mm/aaaa (UTC), DateTime avec l heure, fuseau, valeurs illisibles', () => {
  assert.equal(H.formaterDate(1628597653, false), '10/08/2021');
  assert.equal(H.formaterDate(1628597653, true), '10/08/2021 12:14:13');
  assert.equal(H.formaterDate(1628597640, true), '10/08/2021 12:14');
  assert.equal(H.formaterDate(1628597640, true, 'Europe/Paris'), '10/08/2021 14:14');
  assert.equal(H.formaterDate(1628597640, true, 'Fuseau/Inconnu'), '10/08/2021 12:14');
  assert.equal(H.formaterDate('1628597653', false), '10/08/2021');
  assert.equal(H.formaterDate(0, false), '01/01/1970');
  assert.equal(H.formaterDate(1.6e12, false), null, 'des millisecondes ne sont pas des secondes');
  assert.equal(H.formaterDate('2021-08-10', false), null);
  assert.equal(H.formaterDate(NaN, true), null);
  assert.equal(H.formaterDate(null, true), null);
});

test('choisirColonneLibelle : nom prefere (sans casse), sinon premiere colonne de texte non technique', () => {
  assert.equal(H.choisirColonneLibelle({ id: [1], Value_FR: ['Ouvert'], name: ['x'] }), 'Value_FR');
  assert.equal(H.choisirColonneLibelle({ id: [1], description: ['d'], label: ['l'], name: ['n'] }), 'name');
  assert.equal(H.choisirColonneLibelle({ id: [1, 2], description: ['d', 'e'], label: ['l', 'm'] }), 'label');
  assert.equal(H.choisirColonneLibelle({ id: [1, 2], code: [3, 4], manualSort: [1, 2], zone: ['', 'Nord'], autre: ['a', 'b'] }), 'zone');
  assert.equal(H.choisirColonneLibelle({ id: [1], n: [3] }), null);
  assert.equal(H.choisirColonneLibelle(null), null);
});

test('libellesDeTable : id -> libelle, libelles vides ignores', () => {
  const m = H.libellesDeTable({ id: [1, 2, 3], name: ['Ouvert', '', 'Ferme'] });
  assert.equal(m.get(1), 'Ouvert');
  assert.equal(m.has(2), false);
  assert.equal(m.get(3), 'Ferme');
  assert.equal(H.libellesDeTable({ id: [1], n: [2] }).size, 0);
});

test('formaterReference : un libelle, une liste, repli sur le numero, rien si rien n est resolu', () => {
  const lib = new Map([[8, 'Ouvert'], [9, 'Ferme']]);
  assert.equal(H.formaterReference(8, lib), 'Ouvert');
  assert.equal(H.formaterReference(['L', 8, 9], lib), 'Ouvert, Ferme');
  assert.equal(H.formaterReference(['L', 8, 77], lib), 'Ouvert, 77');
  assert.equal(H.formaterReference(77, lib), null);
  assert.equal(H.formaterReference(0, lib), null);
  assert.equal(H.formaterReference(['L'], lib), null);
  assert.equal(H.formaterReference(8, { 8: 'Obj' }), 'Obj');
  assert.equal(H.formaterReference(8, null), null);
});

function coucheLisible(styleField) {
  return {
    displayName: 'Releves',
    geomType: 'Point',
    featureCount: 2,
    _color: '#3e5de7',
    fields: [
      { name: 'nom', label: 'Nom', gType: 'Text' },
      { name: 'date_obs', label: 'Date', gType: 'Date' },
      { name: 'heure_obs', label: 'Heure', gType: 'DateTime' },
      { name: 'statut', label: 'Statut', gType: 'Ref:Status' },
      { name: 'tags', label: 'Tags', gType: 'RefList:Status' },
      { name: 'surface', label: 'Surface', gType: 'Numeric' },
    ],
    style: styleField
      ? { type: 'categorizedSymbol', field: styleField, categories: [{ value: 8, label: 'A', color: '#ff0000' }] }
      : { type: 'singleSymbol', color: '#3e5de7' },
  };
}
const lignesLisibles = () => [
  { id: 1, nom: 'A', date_obs: 1628597653, heure_obs: 1628597653, statut: 8, tags: ['L', 8, 9], surface: 10, latitude: 43.3, longitude: 5.4 },
  { id: 2, nom: 'B', date_obs: 1628597653, statut: 0, surface: 20, latitude: 43.31, longitude: 5.41 },
];
const LIB = new Map([[8, 'Ouvert'], [9, 'Ferme']]);
const lisibilite = (extra) => ({ libelles: (champ) => (champ === 'statut' || champ === 'tags' ? LIB : null), ...(extra || {}) });

test('fiche lisible : dates et references remplacees, cles et ids inchangees, valeur brute gardee a part', () => {
  const e = { couches: { Releves: coucheLisible() }, lignes: { Releves: lignesLisibles() }, options: { lisibilite: lisibilite() } };
  const s = H.construireScene(e, null);
  const p = s.donnees.Releves[0].properties;
  assert.equal(p.date_obs, '10/08/2021');
  assert.equal(p.heure_obs, '10/08/2021 12:14:13');
  assert.equal(p.statut, 'Ouvert');
  assert.equal(p.tags, 'Ouvert, Ferme');
  assert.equal(p.surface, 10);
  assert.equal(p.nom, 'A');
  assert.equal(p._brut_date_obs, 1628597653);
  assert.equal(p._brut_statut, 8);
  assert.deepEqual(p._brut_tags, ['L', 8, 9]);
  assert.equal(p._row_id, 1);
  assert.equal(s.donnees.Releves[0].id, s.donnees.Releves[0].id);
  assert.equal(s.definitions.Releves.cle, '_row_id');
  // reference vide (0) : affichee vide (pas de « 0 » qui ressemble a une valeur), la valeur brute reste a part
  const q = s.donnees.Releves[1].properties;
  assert.equal(q.statut, '');
  assert.equal(q._brut_statut, 0);
  assert.equal(q.date_obs, '10/08/2021');
});

test('fiche lisible : sans option lisibilite, comportement d origine strictement identique', () => {
  const e = { couches: { Releves: coucheLisible() }, lignes: { Releves: lignesLisibles() } };
  const sans = H.construireScene(e, null);
  const p = sans.donnees.Releves[0].properties;
  assert.equal(p.date_obs, 1628597653);
  assert.equal(p.statut, 8);
  assert.equal('_brut_statut' in p, false);
  const bulle = sans.definitions.Releves.bulle;
  assert.ok(bulle.champs.some((c) => c.champ === 'date_obs' && c.format === 'date'));
});

test('fiche lisible : la bulle ne redemande plus le format date aux champs deja mis en forme', () => {
  const e = { couches: { Releves: coucheLisible() }, lignes: { Releves: lignesLisibles() }, options: { lisibilite: lisibilite() } };
  const b = H.construireScene(e, null).definitions.Releves.bulle;
  assert.ok(b.champs.some((c) => c.champ === 'date_obs'));
  assert.ok(b.champs.every((c) => c.format !== 'date'));
});

test('fiche lisible : un champ dont la valeur brute sert au style reste brut (couleurs et filtres intacts)', () => {
  const e = { couches: { Releves: coucheLisible('statut') }, lignes: { Releves: lignesLisibles() }, options: { lisibilite: lisibilite() } };
  const s = H.construireScene(e, null);
  const p = s.donnees.Releves[0].properties;
  assert.equal(p.statut, 8, 'champ du style : brut');
  assert.equal(p.date_obs, '10/08/2021');
  assert.deepEqual([...H.champsLisibles(coucheLisible('statut'), s.definitions.Releves, { lisibilite: {} })].sort(), ['date_obs', 'heure_obs', 'tags']);
});

test('fiche lisible : libelle inconnu (table cible illisible) laisse le numero', () => {
  const e = { couches: { Releves: coucheLisible() }, lignes: { Releves: lignesLisibles() }, options: { lisibilite: { libelles: () => null } } };
  const p = H.construireScene(e, null).donnees.Releves[0].properties;
  assert.equal(p.statut, 8);
  assert.equal(p.date_obs, '10/08/2021');
});

test('valeurLisible : pour la fiche du widget, memes regles que les proprietes envoyees', () => {
  const ctx = { libelles: () => LIB, fuseau: 'UTC' };
  assert.equal(H.valeurLisible({ name: 'd', gType: 'Date' }, 1628597653, ctx), '10/08/2021');
  assert.equal(H.valeurLisible({ name: 'r', gType: 'Ref:Status' }, 9, ctx), 'Ferme');
  assert.equal(H.valeurLisible({ name: 'n', gType: 'Numeric' }, 9, ctx), undefined);
  assert.equal(H.valeurLisible({ name: 'd', gType: 'Date' }, null, ctx), undefined);
});

test('fiche lisible : la synchronisation par couche garde les valeurs lisibles et le filtre cle _row_id', async () => {
  const client = fauxClient();
  const hote = H.creerHote({ client, options: { lisibilite: lisibilite() } });
  await hote.connecter();
  await hote.poserScene({ couches: { Releves: coucheLisible() }, lignes: { Releves: lignesLisibles() }, meta: { title: 't' }, nomFichier: 'f.qgz' });
  const apres = lignesLisibles();
  apres[0].nom = 'A2';
  await hote.synchroniser({ Releves: apres });
  const envois = client.appelsDe('setScene');
  const dernier = envois[envois.length - 1];
  const feats = dernier.args[1].Releves;
  assert.equal(dernier.args[0].fusion, true);
  assert.equal(feats[0].properties.statut, 'Ouvert');
  assert.equal(feats[0].properties.date_obs, '10/08/2021');
  assert.equal(feats[0].properties._row_id, 1);
});

test('fiche lisible : le controle temporel suit la copie brute, son identifiant ne change pas', () => {
  const sans = H.construireScene({ couches: { Releves: coucheLisible() }, lignes: { Releves: lignesLisibles() } }, null);
  const avec = H.construireScene({ couches: { Releves: coucheLisible() }, lignes: { Releves: lignesLisibles() }, options: { lisibilite: lisibilite() } }, null);
  const t0 = sans.definitions.Releves.controls.find((c) => c.type === 'time');
  const t1 = avec.definitions.Releves.controls.find((c) => c.type === 'time');
  assert.ok(t0 && t1, 'un controle temporel est deduit du premier champ date');
  assert.equal(t0.field, 'date_obs');
  assert.equal(t1.field, '_brut_date_obs');
  assert.equal(t1.id, t0.id);
  assert.equal(avec.donnees.Releves[0].properties._brut_date_obs, 1628597653);
});

// ---------------------------------------------------------------------------
// Liste blanche de ?atlas=
// ---------------------------------------------------------------------------

const DEFAUT_ATLAS = 'https://nic01asfr.github.io/Widgets-Grist/atlas/bi.html';
const valider = (v, o) => H.validerAdresseAtlas(v, { defaut: DEFAUT_ATLAS, ...(o || {}) });

test('validerAdresseAtlas : absente ou vide, adresse par defaut sans refus', () => {
  for (const v of [undefined, null, '']) {
    const r = valider(v);
    assert.deepEqual(r, { adresse: DEFAUT_ATLAS, refusee: false, message: null });
  }
});

test('validerAdresseAtlas : l origine par defaut est acceptee (dossier ou page)', () => {
  assert.equal(valider('https://nic01asfr.github.io/Widgets-Grist/atlas/').adresse, 'https://nic01asfr.github.io/Widgets-Grist/atlas/bi.html');
  const r = valider('https://nic01asfr.github.io/Widgets-Grist/atlas/bi.html?x=1');
  assert.equal(r.refusee, false);
  assert.equal(r.adresse, 'https://nic01asfr.github.io/Widgets-Grist/atlas/bi.html?x=1');
});

test('validerAdresseAtlas : localhost et 127.0.0.1 acceptes pour le developpement, tout port, http ou https', () => {
  for (const v of ['http://localhost:8080/atlas/', 'http://127.0.0.1:8711/bi.html', 'https://localhost/atlas/bi.html']) {
    const r = valider(v);
    assert.equal(r.refusee, false, v);
    assert.ok(r.adresse.startsWith(v.split('/').slice(0, 3).join('/')), v);
  }
});

test('validerAdresseAtlas : toute autre adresse est refusee avec un message, repli sur le defaut', () => {
  const mauvaises = [
    'https://evil.example.com/atlas/bi.html',
    'http://nic01asfr.github.io/Widgets-Grist/atlas/',               // http hors local
    'https://nic01asfr.github.io.evil.com/atlas/',                   // faux sous-domaine
    'https://nic01asfr.github.io@evil.com/atlas/',                   // identifiants trompeurs
    'https://user:pw@nic01asfr.github.io/atlas/',
    'https://autre.github.io/Widgets-Grist/atlas/',
    'http://192.168.0.5/atlas/',
    'http://localhost.evil.com/atlas/',
    'javascript:alert(1)',
    'file:///C:/atlas/bi.html',
    'data:text/html,<script>1</script>',
    'pas une adresse',
    '//evil.com/atlas/',
  ];
  for (const v of mauvaises) {
    const r = valider(v);
    assert.equal(r.refusee, true, v);
    assert.equal(r.adresse, DEFAUT_ATLAS, v);
    assert.match(r.message, /refusée/);
  }
});

test('validerAdresseAtlas : la liste blanche est modifiable (constante et option)', () => {
  assert.deepEqual([...H.ORIGINES_ATLAS_AUTORISEES], ['https://nic01asfr.github.io']);
  assert.deepEqual([...H.HOTES_DEVELOPPEMENT_ATLAS], ['localhost', '127.0.0.1']);
  const r = valider('https://atlas.exemple.fr/bi.html', { origines: ['https://atlas.exemple.fr'] });
  assert.equal(r.refusee, false);
  assert.equal(valider('https://nic01asfr.github.io/atlas/', { origines: ['https://atlas.exemple.fr'] }).refusee, true);
  assert.equal(valider('http://localhost:1/', { hotesDev: [] }).refusee, true);
});

// ---------------------------------------------------------------------------
// Vues enregistrees : camera annoncee par Atlas et instantane de l'etat (hote.vue)
// ---------------------------------------------------------------------------

test('camera : evenement Atlas retenu (aussi sur demande de l API) et rappel surCamera', async () => {
  const recus = [];
  const { hote, client } = await hoteConnecte({}, { surCamera: (c) => recus.push(c) });
  await hote.poserScene(entree());
  assert.equal(hote.vue().camera, null, 'aucune camera tant qu Atlas n en a pas annonce');
  client.emit('camera', { center: [5.4, 43.3], zoom: 14.2, pitch: 10, bearing: -20, bounds: [5, 43, 6, 44] }, 'api');
  assert.deepEqual(recus[0], { center: [5.4, 43.3], zoom: 14.2, pitch: 10, bearing: -20 });
  assert.deepEqual(hote.vue().camera, { center: [5.4, 43.3], zoom: 14.2, pitch: 10, bearing: -20 });
  // charge inexploitable : ignoree, l ancienne camera reste
  client.emit('camera', { center: [500, 43.3], zoom: 14 });
  client.emit('camera', { center: 'x', zoom: 14 });
  client.emit('camera', null);
  assert.equal(recus.length, 1);
  assert.deepEqual(hote.vue().camera.center, [5.4, 43.3]);
  // le rappel recoit une copie
  recus[0].center[0] = 0;
  assert.equal(hote.vue().camera.center[0], 5.4);
});

test('camerasure : bornes et valeurs par defaut', () => {
  assert.deepEqual(H.camerasure({ center: [1, 2], zoom: 3 }), { center: [1, 2], zoom: 3, pitch: 0, bearing: 0 });
  assert.equal(H.camerasure({ center: [1, 95], zoom: 3 }), null);
  assert.equal(H.camerasure({ center: [1, 2], zoom: 30 }), null);
  assert.equal(H.camerasure({ center: [1, 2], zoom: NaN }), null);
  assert.equal(H.camerasure(undefined), null);
  assert.equal(H.camerasure({ center: [1, 2], zoom: 5, pitch: 120, bearing: 900 }).pitch, 0);
});

test('vue : couches masquees, filtres actifs et selection, en copies', async () => {
  const { hote } = await hoteConnecte({});
  await hote.poserScene(entree());
  assert.deepEqual(hote.vue(), { masquees: [], filtres: {}, camera: null, selection: null });
  await hote.definirVisibilite('Zones', false);
  const ctl = hote.listerControles()[0];
  assert.ok(ctl, 'au moins un controle');
  await hote.filtrer(ctl.id, ctl.type === 'select' ? ['A'] : (ctl.type === 'text' ? { texte: 'a' } : { min: 1, max: 2 }));
  const v = hote.vue();
  assert.deepEqual(v.masquees, ['Zones']);
  assert.ok(ctl.id in v.filtres);
  v.filtres[ctl.id] = 'altere';
  v.masquees.push('Autre');
  assert.deepEqual(hote.vue().masquees, ['Zones'], 'copies : l etat de l hote n est pas modifie');
  assert.notEqual(hote.vue().filtres[ctl.id], 'altere');
});
