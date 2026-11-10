/* Capture golden de qgis2grist (index_v2.html) dans le navigateur.
 *
 * Script classique, injecte dans la page par evaluate_script (voir README.md).
 * Il appelle les fonctions GLOBALES de la page (parseZipFile, parseQgzFile,
 * parseGpkgFile, buildLayerFromGeojson, topoSortByRefs, startImport...) par leur
 * nom : tant que ces noms et signatures sont conserves (y compris par de simples
 * enveloppes apres modularisation), la capture est comparable avant/apres.
 *
 * Expose window.__q2gGolden :
 *   run()                      -> objet complet { parse:{<fixture>:...}, unitaires:{...} }
 *   runImport(scenario)        -> { golden, brut } (pipeline d'import contre un faux Grist)
 *   envoyer(nom, objet)        -> POST vers le serveur du harnais (tests/harness/_sortie/<nom>.json)
 *   runEtEnvoyerTout()         -> run() + tous les scenarios d'import, ecrit dans _sortie/
 *   FIXTURES, SCENARIOS_IMPORT -> listes
 *
 * Sorties deterministes : cles triees, nombres arrondis a 6 decimales, listes
 * d'entites resumees (compte + 3 premieres + derniere + empreinte de hachage de
 * l'ensemble), dates et horodatages remplaces par des marqueurs.
 */
(function () {
  'use strict';

  var VERSION_FORMAT = 1;
  var DECIMALES = 6;
  var LIMITE_CHAINE = 400;
  var BASE = '/tests/fixtures/';

  // ---------------------------------------------------------------- fixtures
  var FIXTURES = [
    { id: 'qfield_bees_zip',            url: BASE + 'web/qfield_bees.zip' },
    { id: 'qfield_wastewater_zip',      url: BASE + 'web/qfield_wastewater.zip' },
    { id: 'marseille4e_qgz',            url: BASE + 'qgis2grist_marseille4e.qgz' },
    { id: 'marseille4e_qgs',            url: BASE + 'qgis2grist_marseille4e.qgs' },
    { id: 'marseille4e_qfield_zip',     url: BASE + 'qgis2grist_marseille4e_qfield.zip' },
    { id: 'marseille4e_voirie_gpkg',    url: BASE + 'qgis2grist_marseille4e_voirie.gpkg' },
    { id: 'demo_points_gpkg',           url: BASE + 'demo_points.gpkg' },
    { id: 'profile_b_points_gpkg',      url: BASE + 'profile_b_points.gpkg' },
    { id: 'gam_communes_zip',           url: BASE + 'gam_communes.zip' },
    { id: 'pp_cibles_zip',              url: BASE + 'pp_cibles.zip' },
    { id: 'marseille4e_webmap_html',    url: BASE + 'qgis2grist_marseille4e_webmap.html' },
    { id: 'webmap_marseille4e_user_html', url: BASE + 'webmap_marseille4e_user.html' },
    { id: 'nimes_flood_html',           url: BASE + 'qgis2grist_nimes_flood.html' }
  ];

  var SCENARIOS_IMPORT = [
    { id: 'bees',             fixture: 'qfield_bees_zip' },
    { id: 'marseille_qfield', fixture: 'marseille4e_qfield_zip' },
    { id: 'marseille_webmap', fixture: 'marseille4e_webmap_html' },
    { id: 'nimes_flood',      fixture: 'nimes_flood_html' },
    { id: 'wastewater',       fixture: 'qfield_wastewater_zip' }
  ];

  // ------------------------------------------------------- outils de hachage
  // Hachage non cryptographique a deux voies 32 bits, sans dependance, synchrone.
  function Hacheur() { this.h1 = 0xdeadbeef | 0; this.h2 = 0x41c6ce57 | 0; this.n = 0; }
  Hacheur.prototype.maj = function (s) {
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      this.h1 = Math.imul(this.h1 ^ c, 2654435761);
      this.h2 = Math.imul(this.h2 ^ c, 1597334677);
    }
    this.n += s.length;
    // separateur : distingue ["ab","c"] de ["a","bc"]
    this.h1 = Math.imul(this.h1 ^ 0x1f, 2654435761);
    this.h2 = Math.imul(this.h2 ^ 0x1f, 1597334677);
  };
  Hacheur.prototype.digest = function () {
    var a = this.h1, b = this.h2;
    a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
    b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
    return (b >>> 0).toString(16).padStart(8, '0') + (a >>> 0).toString(16).padStart(8, '0')
      + '-' + this.n.toString(36);
  };
  function empreinte(s) { var h = new Hacheur(); h.maj(String(s)); return h.digest(); }

  // ---------------------------------------------------------- normalisation
  function arrondi(n) {
    var r = Math.round(n * Math.pow(10, DECIMALES)) / Math.pow(10, DECIMALES);
    return r === 0 ? 0 : r; // supprime -0
  }

  function normaliser(v, vus) {
    if (v === null || v === undefined) return v === undefined ? undefined : null;
    switch (typeof v) {
      case 'number':
        return Number.isFinite(v) ? arrondi(v) : { __nombre: String(v) };
      case 'string':
        return v.length > LIMITE_CHAINE
          ? { __chaine: true, longueur: v.length, debut: v.slice(0, 120), empreinte: empreinte(v) }
          : v;
      case 'boolean':
        return v;
      case 'bigint':
        return { __bigint: String(v) };
      case 'function':
        return '[fonction]';
      case 'symbol':
        return '[symbole]';
    }
    vus = vus || new WeakSet();
    if (vus.has(v)) return '[cycle]';
    if (typeof Node !== 'undefined' && v instanceof Node) return '[noeud]';
    if (v instanceof ArrayBuffer) {
      return { __octets: v.byteLength, empreinte: empreinte(Array.prototype.join.call(new Uint8Array(v), ',')) };
    }
    if (ArrayBuffer.isView(v)) {
      return { __vue: v.constructor.name, longueur: v.byteLength,
        empreinte: empreinte(Array.prototype.join.call(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), ',')) };
    }
    vus.add(v);
    var sortie;
    if (Array.isArray(v)) {
      sortie = v.map(function (x) { var n = normaliser(x, vus); return n === undefined ? null : n; });
    } else if (v instanceof Map) {
      sortie = { __map: Array.from(v.entries()).map(function (e) { return [normaliser(e[0], vus), normaliser(e[1], vus)]; }) };
    } else if (v instanceof Set) {
      sortie = { __set: Array.from(v.values()).map(function (x) { return normaliser(x, vus); }) };
    } else {
      sortie = {};
      Object.keys(v).sort().forEach(function (k) {
        var n = normaliser(v[k], vus);
        if (n !== undefined) sortie[k] = n;
      });
    }
    vus.delete(v);
    return sortie;
  }

  function resumeEntites(entites) {
    entites = entites || [];
    var h = new Hacheur();
    for (var i = 0; i < entites.length; i++) h.maj(JSON.stringify(normaliser(entites[i])));
    return {
      compte: entites.length,
      premieres: entites.slice(0, 3).map(function (e) { return normaliser(e); }),
      derniere: entites.length > 3 ? normaliser(entites[entites.length - 1]) : null,
      empreinte: h.digest()
    };
  }

  function normaliserCouche(couche) {
    if (!couche || typeof couche !== 'object') return normaliser(couche);
    var reste = {};
    Object.keys(couche).forEach(function (k) { if (k !== 'features') reste[k] = couche[k]; });
    var out = normaliser(reste);
    out.features = resumeEntites(couche.features);
    return out;
  }

  function lireGlobal(nom) {
    // les "let" de niveau script ne sont pas sur window : eval indirect
    try { return (0, eval)('typeof ' + nom + ' === "undefined" ? undefined : ' + nom); } catch (e) { return undefined; }
  }
  function ecrireGlobal(nom, valeur) {
    try { (0, eval)(nom + ' = ' + JSON.stringify(valeur === undefined ? null : valeur)); return true; } catch (e) { return false; }
  }
  // repli : les alias const issus des modules lib/q2g-*.js ne sont pas sur window
  // puis les exports des modules (la page n'aliase que ce qu'elle appelle).
  function fonction(nom) {
    if (typeof window[nom] === 'function') return window[nom];
    var v = lireGlobal(nom);
    if (typeof v === 'function') return v;
    var mods = ['Q2GSchema', 'Q2GQgs', 'Q2GGeometry', 'Q2GGpkg', 'Q2GLoaders', 'Q2GQgis2web'];
    for (var i = 0; i < mods.length; i++) {
      var m = window[mods[i]];
      if (m && typeof m[nom] === 'function') return m[nom].bind(m);
    }
    return null;
  }

  // ---------------------------------------------------------- parse fixtures
  async function chargerOctets(url) {
    var r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('fixture introuvable : ' + url + ' (' + r.status + ')');
    return r;
  }

  // Reproduit l'aiguillage par extension de handleFile (sans DOM d'etat).
  async function parserFixture(url) {
    var nom = url.split('/').pop();
    var ext = nom.split('.').pop().toLowerCase();
    var r = await chargerOctets(url);
    var couches;
    if (ext === 'html' || ext === 'htm') {
      var texte = await r.text();
      couches = await fonction('parseQgis2webHtml')(texte);
    } else if (ext === 'zip') {
      couches = await fonction('parseZipFile')(await r.arrayBuffer(), nom);
    } else if (ext === 'qgz') {
      couches = await fonction('parseQgzFile')(await r.arrayBuffer(), null, nom);
    } else if (ext === 'qgs') {
      var qgs = await r.text();
      if (fonction('loadSqlJs')) await fonction('loadSqlJs')().catch(function () { return null; });
      couches = await fonction('parseQgsXml')(qgs, null);
    } else if (ext === 'gpkg') {
      couches = await fonction('parseGpkgFile')(await r.arrayBuffer());
    } else {
      throw new Error('extension non geree : ' + ext);
    }
    return { nom: nom, ext: ext, couches: couches };
  }

  async function capturerFixture(fx) {
    ecrireGlobal('_currentMeta', null);
    var sortie = { fixture: fx.id, fichier: fx.url.replace(BASE, '') };
    try {
      var p = await parserFixture(fx.url);
      sortie.extension = p.ext;
      sortie.nbCouches = (p.couches || []).length;
      sortie.couches = (p.couches || []).map(normaliserCouche);
      sortie.meta = normaliser(lireGlobal('_currentMeta'));
      sortie.erreur = null;
    } catch (e) {
      sortie.erreur = String((e && e.message) || e);
    }
    return sortie;
  }

  // ----------------------------------------------------- cas unitaires purs
  function octetsGpkg(opts) {
    // en-tete GeoPackage (GP, version, flags, srs_id) + enveloppe optionnelle + WKB
    var env = opts.env || 0; // 0 aucune, 1 = XY (32 octets)
    var tailleEnv = [0, 32, 48, 48, 64][env];
    var wkb = opts.wkb;
    var buf = new ArrayBuffer(8 + tailleEnv + wkb.length);
    var v = new DataView(buf);
    v.setUint8(0, 0x47); v.setUint8(1, 0x50); v.setUint8(2, 0);
    v.setUint8(3, 1 | (env << 1) | (opts.vide ? 0x20 : 0));
    v.setInt32(4, 4326, true);
    new Uint8Array(buf).set(wkb, 8 + tailleEnv);
    return new Uint8Array(buf);
  }
  function wkb() { // constructeur WKB little-endian : wkb(['b',1],['u',type],['f',x],...)
    var parts = [];
    for (var i = 0; i < arguments.length; i++) parts.push(arguments[i]);
    var n = parts.reduce(function (s, p) { return s + (p[0] === 'b' ? 1 : p[0] === 'u' ? 4 : 8); }, 0);
    var buf = new ArrayBuffer(n), v = new DataView(buf), o = 0;
    parts.forEach(function (p) {
      if (p[0] === 'b') { v.setUint8(o, p[1]); o += 1; }
      else if (p[0] === 'u') { v.setUint32(o, p[1], true); o += 4; }
      else { v.setFloat64(o, p[1], true); o += 8; }
    });
    return new Uint8Array(buf);
  }
  function concat() {
    var tot = 0, i;
    for (i = 0; i < arguments.length; i++) tot += arguments[i].length;
    var out = new Uint8Array(tot), o = 0;
    for (i = 0; i < arguments.length; i++) { out.set(arguments[i], o); o += arguments[i].length; }
    return out;
  }

  function essai(nom, f) {
    var fn = fonction(nom);
    if (!fn) return { absente: true };
    try { return normaliser(f(fn)); } catch (e) { return { exception: String((e && e.message) || e) }; }
  }

  function unitaires() {
    var u = {};

    var nomsTables = ['Bâtiments 4ème', '1abc', 'foo bar', '', '__x__', 'POI (clippée)', 'élève', 'a--b', 'Voirie 4eme (clippee)', 'ça_va'];
    u.sanitizeTableName = essai('sanitizeTableName', function (f) { return nomsTables.map(function (n) { return [n, f(n)]; }); });

    var nomsCols = ['class', 'id', 'manualSort', 'gristHelper_x', '1er', 'Été', 'a b', '', 'None', 'sens de circulation', 'ID', 'Class', '__', 'x.y'];
    u.sanitizeColName = essai('sanitizeColName', function (f) { return nomsCols.map(function (n) { return [n, f(n)]; }); });

    var valeurs = [null, undefined, true, false, 0, 1, 1.5, -2, 'a', '', '12'];
    u.inferType = essai('inferType', function (f) { return valeurs.map(function (x) { return f(x); }); });
    u.jsTypeToGrist = essai('jsTypeToGrist', function (f) { return valeurs.map(function (x) { return f(x); }); });

    u.qgsTypeToGrist = essai('qgsTypeToGrist', function (f) {
      return ['integer', 'Integer64', 'long', 'double', 'real', 'float', 'numeric', 'bool', 'boolean', 'datetime', 'date', 'time', 'string', 'text', 'QString', ''].map(function (t) { return [t, f(t)]; });
    });

    u.rgbaCssToHex = essai('rgbaCssToHex', function (f) {
      return ['rgba(255,0,0,1)', 'rgb(10, 20, 30)', '#ABCDEF12', '#abc', 'rgba(1.4,2.6,3,0.5)', 'red', '', null].map(function (c) { return [c, f(c)]; });
    });

    u.resolveRefType = essai('resolveRefType', function (f) {
      return [
        ['Ref:A', 'A', {}], ['Ref:A', 'A', { A: 'A_1' }], ['RefList:A', 'A', { A: 'A_2' }],
        ['Text', null, {}], ['RefList:B', 'B', {}]
      ].map(function (c) { return [c, f(c[0], c[1], c[2])]; });
    });

    u.normalizeGeomType = essai('normalizeGeomType', function (f) {
      function ml(wkbType) { return { getAttribute: function (k) { return k === 'wkbType' ? wkbType : null; } }; }
      return [['Point', ''], ['LineString', ''], ['Polygon', ''], ['MultiPolygon', ''], ['CurvePolygon', ''], ['No geometry', ''],
        ['None', ''], ['', 'MultiPolygonZ'], ['', 'LineString25D'], ['', 'PointZ'], ['', ''], [null, null]]
        .map(function (c) { return [c, f(c[0], ml(c[1]))]; });
    });

    u.linearizeArc3 = essai('linearizeArc3', function (f) {
      return [f([0, 0], [1, 1], [2, 0]), f([0, 0], [1, 1], [2, 0], 4), f([0, 0], [1, 0], [2, 0])];
    });

    var fc = {
      points: { type: 'FeatureCollection', features: [
        { type: 'Feature', properties: { nom: 'A', n: 1, x: 1.5, ok: true, class: 'c', id: 7 }, geometry: { type: 'Point', coordinates: [5.4, 43.3] } },
        { type: 'Feature', properties: { nom: 'B', n: 2, x: null, ok: false }, geometry: { type: 'MultiPoint', coordinates: [[5.41, 43.31]] } },
        { type: 'Feature', properties: { nom: 'C' }, geometry: null }
      ] },
      polygones: { type: 'FeatureCollection', features: [
        { type: 'Feature', properties: { 'Hauteur (m)': 12.5, 'usage du sol': 'bati', 'é': 1 }, geometry: { type: 'Polygon', coordinates: [[[5.1, 43.1, 10], [5.2, 43.1, 11], [5.2, 43.2, 12], [5.1, 43.1, 10]]] } },
        { type: 'Feature', properties: { 'Hauteur (m)': 3, 'usage du sol': 'jardin' }, geometry: { type: 'MultiPolygon', coordinates: [[[[5.3, 43.3], [5.4, 43.3], [5.4, 43.4], [5.3, 43.3]]]] } }
      ] },
      lignes: { type: 'FeatureCollection', features: [
        { type: 'Feature', properties: { sens: 'double' }, geometry: { type: 'LineString', coordinates: [[5.1234567891, 43.1], [5.2, 43.2]] } },
        { type: 'Feature', properties: { sens: 'direct' }, geometry: { type: 'MultiLineString', coordinates: [[[5.1, 43.1], [5.2, 43.2]], [[5.3, 43.3], [5.4, 43.4]]] } }
      ] },
      vide: { type: 'FeatureCollection', features: [] },
      sansGeometrie: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { a: 1 }, geometry: null }] }
    };
    u.buildLayerFromGeojson = essai('buildLayerFromGeojson', function (f) {
      var out = {};
      Object.keys(fc).forEach(function (k) {
        var couche = f('Couche ' + k + ' (test)', JSON.parse(JSON.stringify(fc[k])));
        out[k] = normaliserCouche(couche);
      });
      return out;
    });
    u.detectGeomTypeFromFeatures = essai('detectGeomTypeFromFeatures', function (f) {
      return Object.keys(fc).map(function (k) { return [k, f(fc[k].features)]; });
    });
    u.flattenGeoJsonFeatures = essai('flattenGeoJsonFeatures', function (f) {
      var champs = [{ name: 'nom', _rawKey: 'nom', label: 'nom' }, { name: 'n', label: 'n' }];
      return {
        point: f(fc.points.features, champs, 'Point'),
        polygone: f(fc.polygones.features, champs, 'Polygon')
      };
    });

    function couchesRef() {
      return [
        { name: 'enfant', fields: [{ name: 'parent_id', _refTargetTable: 'parent', _refTargetField: 'code' }, { name: 'x' }] },
        { name: 'parent', fields: [{ name: 'code' }, { name: 'grand_parent', _refTargetTable: 'grand', _refTargetField: 'gid' }] },
        { name: 'grand', fields: [{ name: 'gid' }] },
        { name: 'orpheline', fields: [{ name: 'r', _refTargetTable: 'absente', _refTargetField: 'k' }] },
        { name: 'cycleA', fields: [{ name: 'b', _refTargetTable: 'cycleB', _refTargetField: 'id' }] },
        { name: 'cycleB', fields: [{ name: 'a', _refTargetTable: 'cycleA', _refTargetField: 'id' }] }
      ];
    }
    u.topoSortByRefs = essai('topoSortByRefs', function (f) { return f(couchesRef()).map(function (l) { return l.name; }); });
    u.buildRefLookupNeeds = essai('buildRefLookupNeeds', function (f) {
      var needs = f(couchesRef()); var out = {};
      Object.keys(needs).forEach(function (k) { out[k] = Array.from(needs[k]).sort(); });
      return out;
    });

    u.parseGpkgGeom = essai('parseGpkgGeom', function (f) {
      var pt = wkb(['b', 1], ['u', 1], ['f', 5.4], ['f', 43.3]);
      var ptZ = wkb(['b', 1], ['u', 1001], ['f', 5.4], ['f', 43.3], ['f', 99]);
      var ligne = wkb(['b', 1], ['u', 2], ['u', 2], ['f', 0], ['f', 0], ['f', 1], ['f', 1]);
      var poly = wkb(['b', 1], ['u', 3], ['u', 1], ['u', 4], ['f', 0], ['f', 0], ['f', 1], ['f', 0], ['f', 1], ['f', 1], ['f', 0], ['f', 0]);
      var arc = wkb(['b', 1], ['u', 8], ['u', 3], ['f', 0], ['f', 0], ['f', 1], ['f', 1], ['f', 2], ['f', 0]);
      var ewkb = wkb(['b', 1], ['u', 0x20000001], ['u', 4326], ['f', 1], ['f', 2]);
      var multiPt = concat(wkb(['b', 1], ['u', 4], ['u', 2]), pt, pt);
      return {
        point: f(octetsGpkg({ wkb: pt })),
        pointZ: f(octetsGpkg({ wkb: ptZ })),
        ligne: f(octetsGpkg({ wkb: ligne })),
        polygone: f(octetsGpkg({ wkb: poly })),
        courbeCirculaire: f(octetsGpkg({ wkb: arc })),
        ewkbAvecSrid: f(octetsGpkg({ wkb: ewkb })),
        multiPoint: f(octetsGpkg({ wkb: multiPt })),
        avecEnveloppe: f(octetsGpkg({ wkb: pt, env: 1 })),
        vide: f(octetsGpkg({ wkb: pt, vide: true })),
        tropCourt: f(new Uint8Array([1, 2, 3])),
        typeInvalide: f(octetsGpkg({ wkb: wkb(['b', 1], ['u', 99]) })),
        pasUnBuffer: f('texte')
      };
    });

    u.parseQgis2webStyleBody = essai('parseQgis2webStyleBody', function (f) {
      var categorise = "switch(String(feature.properties['usage'])) { case 'bati': style = {fillColor: '#ff0000', color:'#000'}; break; case 'jardin': style = {fillColor: 'rgba(0,255,0,1)'}; break; default: style = {fillColor:'#cccccc'}; }";
      var gradue = "var h = feature.properties.hauteur; if (h < 5) { return {fillColor: '#ffffb2'}; } else if (h < 10) { return {fillColor: '#fd8d3c'}; } else { return {fillColor: '#bd0026'}; }";
      return { categorise: f(categorise), gradue: f(gradue), vide: f('return {};'), sansChamp: f('return 1;') };
    });

    return u;
  }

  // ------------------------------------------------------------------- run()
  async function run(opts) {
    opts = opts || {};
    var ids = opts.fixtures || FIXTURES.map(function (f) { return f.id; });
    var parse = {};
    for (var i = 0; i < FIXTURES.length; i++) {
      if (ids.indexOf(FIXTURES[i].id) < 0) continue;
      parse[FIXTURES[i].id] = await capturerFixture(FIXTURES[i]);
    }
    return { versionFormat: VERSION_FORMAT, parse: parse, unitaires: unitaires() };
  }

  // ------------------------------------------------------------- faux Grist
  var COLS_JSON = { manifest_json: 1, config_json: 1, Def: 1 };
  var COLS_DATE = { created_at: 1, UpdatedAt: 1, updated_at: 1 };
  var COLS_HASH = { scene_hash: 1 };
  var CLES_DATE = { imported_at: 1, created_at: 1, generated_at: 1, updatedAt: 1, UpdatedAt: 1, createdAt: 1, exported_at: 1 };
  var RX_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

  function purgerVariable(v, cle) {
    if (v === null || typeof v !== 'object') {
      if (cle && CLES_DATE[cle]) return '<DATE>';
      if (typeof v === 'string' && RX_ISO.test(v)) return '<DATE>';
      return v;
    }
    if (Array.isArray(v)) return v.map(function (x) { return purgerVariable(x, null); });
    var o = {};
    Object.keys(v).forEach(function (k) { o[k] = purgerVariable(v[k], k); });
    return o;
  }

  function creerFauxGrist() {
    var tables = new Map();
    var journal = { actions: [], lectures: [] };

    function appliquer(a) {
      var op = a[0];
      if (op === 'AddTable') {
        var voulu = a[1], id = voulu, n = 1;
        while (tables.has(id)) { n++; id = voulu + '_' + n; }
        var cols = (a[2] || []).map(function (c) { return c.id; });
        var colonnes = {};
        cols.forEach(function (c) { colonnes[c] = []; });
        tables.set(id, { cols: cols, donnees: colonnes, ids: [], suivant: 1 });
        return { table_ref: tables.size, table_id: id, columns: cols.slice(), views: [] };
      }
      if (op === 'BulkAddRecord') {
        var t = tables.get(a[1]);
        if (!t) throw new Error('Table inconnue : ' + a[1]);
        var nb = a[2].length, ids = [];
        Object.keys(a[3]).forEach(function (c) {
          if (!t.donnees[c]) throw new Error('Colonne inconnue : ' + a[1] + '.' + c);
          if (a[3][c].length !== nb) throw new Error('Longueur de colonne incoherente : ' + c);
        });
        for (var i = 0; i < nb; i++) { ids.push(t.suivant++); t.ids.push(ids[i]); }
        t.cols.forEach(function (c) {
          var vals = a[3][c];
          for (var j = 0; j < nb; j++) t.donnees[c].push(vals ? vals[j] : null);
        });
        return ids;
      }
      if (op === 'BulkUpdateRecord') {
        var tu = tables.get(a[1]);
        if (!tu) throw new Error('Table inconnue : ' + a[1]);
        a[2].forEach(function (rid, k) {
          var idx = tu.ids.indexOf(rid);
          if (idx < 0) throw new Error('Ligne inconnue : ' + rid);
          Object.keys(a[3]).forEach(function (c) {
            if (!tu.donnees[c]) throw new Error('Colonne inconnue : ' + a[1] + '.' + c);
            tu.donnees[c][idx] = a[3][c][k];
          });
        });
        return null;
      }
      if (op === 'RemoveTable') { tables.delete(a[1]); return null; }
      throw new Error('Action non geree par le faux Grist : ' + op);
    }

    var docApi = {
      listTables: async function () { journal.lectures.push(['listTables']); return Array.from(tables.keys()); },
      fetchTable: async function (nom) {
        journal.lectures.push(['fetchTable', nom]);
        var t = tables.get(nom);
        if (!t) throw new Error('Table introuvable : ' + nom);
        var out = { id: t.ids.slice() };
        t.cols.forEach(function (c) { out[c] = t.donnees[c].slice(); });
        return out;
      },
      applyUserActions: async function (actions) {
        journal.actions.push(JSON.parse(JSON.stringify(actions)));
        return { retValues: actions.map(appliquer) };
      }
    };
    return { docApi: docApi, journal: journal, tables: tables, ready: function () {}, onRecord: function () {}, onRecords: function () {}, onOptions: function () {} };
  }

  function resumeColonne(nom, valeurs) {
    valeurs = valeurs || [];
    if (COLS_DATE[nom]) return { n: valeurs.length, valeur: '<DATE>' };
    if (COLS_HASH[nom]) return { n: valeurs.length, valeur: '<HASH>' };
    if (COLS_JSON[nom] && valeurs.length === 1 && typeof valeurs[0] === 'string') {
      try { return { n: 1, json: normaliser(purgerVariable(JSON.parse(valeurs[0]), null)) }; } catch (e) { /* repli ci-dessous */ }
    }
    var h = new Hacheur();
    valeurs.forEach(function (x) { h.maj(JSON.stringify(x === undefined ? null : x)); });
    return { n: valeurs.length, premieres: valeurs.slice(0, 3).map(function (x) { return normaliser(x); }), empreinte: h.digest() };
  }

  function normaliserAction(a) {
    var op = a[0];
    if (op === 'BulkAddRecord' || op === 'BulkUpdateRecord') {
      var cols = {};
      Object.keys(a[3]).sort().forEach(function (c) { cols[c] = resumeColonne(c, a[3][c]); });
      return { op: op, table: a[1], nbLignes: a[2].length,
        idsNuls: a[2].every(function (x) { return x === null; }),
        ordreColonnes: Object.keys(a[3]), colonnes: cols };
    }
    return normaliser(a);
  }

  // ------------------------------------------------------------- import
  async function runImport(idScenario) {
    var sc = SCENARIOS_IMPORT.filter(function (s) { return s.id === idScenario; })[0];
    if (!sc) throw new Error('scenario inconnu : ' + idScenario);
    var fx = FIXTURES.filter(function (f) { return f.id === sc.fixture; })[0];

    ecrireGlobal('_currentMeta', null);
    var p = await parserFixture(fx.url);
    var couches = p.couches;
    if (!couches || !couches.length) throw new Error('aucune couche pour ' + idScenario);

    var faux = creerFauxGrist();
    var grist0 = window.grist;
    window.grist = faux;
    ecrireGlobal('_gristAvailable', true);

    var toasts = [];
    var showToast0 = window.showToast;
    window.showToast = function (msg, type) { toasts.push([String(msg), type || '']); };
    var captureCarte = null;
    var showMap0 = window.showMap;
    window.showMap = function (donnees) {
      captureCarte = {};
      Object.keys(donnees || {}).forEach(function (t) { captureCarte[t] = normaliserCouche(donnees[t]); });
    };

    var erreur = null;
    try {
      (0, eval)('parsedLayers = null');
      window.__q2gGolden._tmp = couches;
      (0, eval)('parsedLayers = window.__q2gGolden._tmp');
      (0, eval)('fileInfo = { name: ' + JSON.stringify(p.nom) + ', size: 0, type: "" }');
      fonction('showPreview')(couches, p.nom);
      await new Promise(function (r) { setTimeout(r, 50); });
      journal0(faux); // les lectures du apercu (listTables) ne font pas partie de l'import
      await fonction('startImport')();
    } catch (e) {
      erreur = String((e && e.message) || e);
    } finally {
      window.showToast = showToast0;
      window.showMap = showMap0;
      window.grist = grist0;
    }

    var appels = faux.journal.actions.map(function (actions, i) {
      return { appel: i, actions: actions.map(normaliserAction) };
    });
    var etatTables = {};
    faux.tables.forEach(function (t, nom) {
      etatTables[nom] = { colonnes: t.cols, nbLignes: t.ids.length };
    });
    var golden = {
      versionFormat: VERSION_FORMAT,
      scenario: idScenario,
      fixture: fx.id,
      erreur: erreur,
      etatFinal: normaliser(lireGlobal('currentState')),
      nbAppelsApplyUserActions: appels.length,
      appels: appels,
      lectures: faux.journal.lectures,
      tablesFinales: etatTables,
      toasts: toasts.map(function (t) { return [t[0].replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '<DATE>'), t[1]]; }),
      carte: captureCarte
    };
    return { golden: golden, brut: { scenario: idScenario, fixture: fx.id, appels: faux.journal.actions } };
  }
  function journal0(faux) { faux.journal.lectures.length = 0; faux.journal.actions.length = 0; }

  // ------------------------------------------------------------------ envoi
  async function envoyer(nom, objet) {
    var r = await fetch('/__sortie/' + nom + '.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(objet, null, 1)
    });
    if (!r.ok) throw new Error('envoi ' + nom + ' : ' + r.status);
    return r.json();
  }

  async function runEtEnvoyerTout(opts) {
    opts = opts || {};
    var bilan = [];
    if (!opts.sansParse) {
      var g = await run();
      for (var i = 0; i < Object.keys(g.parse).length; i++) {
        var id = Object.keys(g.parse)[i];
        bilan.push(await envoyer('parse-' + id, g.parse[id]));
      }
      bilan.push(await envoyer('unitaires', g.unitaires));
    }
    if (!opts.sansImport) {
      for (var j = 0; j < SCENARIOS_IMPORT.length; j++) {
        if (opts.scenarios && opts.scenarios.indexOf(SCENARIOS_IMPORT[j].id) < 0) continue;
        var ri = await runImport(SCENARIOS_IMPORT[j].id);
        bilan.push(await envoyer('import-' + SCENARIOS_IMPORT[j].id, ri.golden));
        bilan.push(await envoyer('import-' + SCENARIOS_IMPORT[j].id + '.brut', ri.brut));
      }
    }
    return bilan;
  }

  window.__q2gGolden = {
    version: VERSION_FORMAT,
    FIXTURES: FIXTURES,
    SCENARIOS_IMPORT: SCENARIOS_IMPORT,
    run: run,
    runImport: runImport,
    envoyer: envoyer,
    runEtEnvoyerTout: runEtEnvoyerTout,
    _normaliser: normaliser,
    _empreinte: empreinte
  };
})();
