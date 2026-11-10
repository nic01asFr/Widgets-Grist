/**
 * Q2GGpkg - lecture GeoPackage (sql.js) pour qgis2grist.
 *
 * Module pur : aucun acces au DOM, a window ni injection de <script>.
 * Les dependances externes sont INJECTEES (objet deps), avec repli sur les
 * globaux quand ils existent (root.Q2GGeometry, root.Q2GQgs, ...).
 *
 * Deux modes d'usage, memes fonctions, memes noms et signatures que dans
 * index_v2.html :
 *   - instance par defaut (exposee directement sur Q2GGpkg) : les deps sont
 *     resolues paresseusement sur les globaux ou via Q2GGpkg.configure(deps) ;
 *   - Q2GGpkg.create(deps) : renvoie une instance isolee (ex. pour Atlas, qui
 *     embarque ses propres bibliotheques).
 *
 * deps attendues (toutes optionnelles si un global equivalent existe) :
 *   loadSqlJs      async () => module sql.js initialise (avec .Database)
 *   SQL            alternative : module sql.js deja initialise
 *   loadProj4      async () => fonction proj4 (ou null si indisponible)
 *   proj4          alternative : fonction proj4 deja chargee
 *   geometry       { parseGpkgGeom, reprojectGeom, buildLayerFromGeojson }
 *                  (Q2GGeometry) ; buildLayerFromGeojson peut aussi etre
 *                  fourni a plat dans deps.buildLayerFromGeojson
 *   qgs            { parseAliases, parseEditWidgets, enrichFieldFromWidget }
 *                  (Q2GQgs)
 *   parseQmlStyle  (qmlText) => style ; defaut : root.Q2GQmlParser.parseQmlStyle
 *   gpkgDs         lib/gpkg-datasource.js (Q2GGpkgDs) ; require() en Node
 *   DOMParser      constructeur DOMParser (qgs embarque) ; defaut : global
 *   onProgress     (label, detail) => void ; remplace setReadingLabel
 *   logger         objet { warn } ; defaut : console
 *   schema         { flattenGeoJsonFeatures } (Q2GSchema) ; requis pour la lecture par pages
 *   gpkgOptions    options de lecture par defaut (voir ci-dessous)
 *
 * Options de lecture (opt-in ; sans elles, lecture et sortie inchangees). Dernier
 * argument de parseGpkgFile(ab, opts) et readGpkgWithSqlJs(ab, hint, opts), ou
 * deps.gpkgOptions :
 *   paged       parseGpkgFile : transforme chaque page de 5000 entites en lignes finales
 *               puis abandonne leur GeoJSON (pic memoire plus bas, meme resultat) ;
 *               readGpkgWithSqlJs : pagination par rowid et avertissement si tronque
 *   pageSize    entites par page (minimum 200, defaut 5000)
 *   keyset      false pour forcer LIMIT/OFFSET (defaut : rowid, repli automatique)
 *   maxRows     readGpkgWithSqlJs : plafond par table (defaut 50000)
 *   limits      garde de volume : true (GUARD_DEFAULTS) ou { maxFileBytes,
 *               maxFeaturesPerLayer, warnFeaturesPerLayer } ; refus = Error code Q2G_LIMITE
 *   onWarning   (message) => void ; avertissements (volume, troncature)
 *   yieldFn     () => Promise, rend la main entre deux pages (defaut setTimeout 0)
 *
 * Recoupement avec l'existant :
 *   - lib/gpkg-datasource.js (Q2GGpkgDs) : matching table/hint, REUTILISE tel
 *     quel (injecte, jamais recopie).
 *   - lib/geom-reconcile.js : colonnes geometriques / geomType, sans lien avec
 *     la lecture sql.js ; aucun doublon, non utilise ici.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Q2GGpkg = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Echappe une chaine pour SQL standard (double quote simple)
  function _sqlEsc(s) { return String(s).replace(/'/g, "''"); }

  // Identifiant SQL entre guillemets doubles (nom de table ou de colonne arbitraire)
  function _sqlIdent(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }

  // --- Garde de volume (opt-in : options.limits) ---------------------------
  const MO = 1024 * 1024;
  // limits: true applique ces valeurs. Depasser un max* refuse la lecture avec un message
  // clair (l'onglet planterait sinon) ; depasser warn* previent sans rien bloquer, ce qui
  // relaie l'avertissement du composant Atlas (50 000 entites par couche).
  const GUARD_DEFAULTS = Object.freeze({
    maxFileBytes: 300 * MO,
    maxFeaturesPerLayer: 500000,
    warnFeaturesPerLayer: 50000,
  });

  function formatMo(n) { return (n / MO).toFixed(n >= 10 * MO ? 0 : 1).replace('.', ',') + ' Mo'; }
  function formatNb(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  function limitError(message) {
    const e = new Error(message);
    e.code = 'Q2G_LIMITE';
    return e;
  }

  /**
   * Pure. info = { fileBytes, layers: [{ name, features }] } ; limits = objet ou true.
   * Renvoie { errors: [message], warnings: [message] } (listes vides si limits est faux).
   */
  function checkGpkgLimits(info, limits) {
    const out = { errors: [], warnings: [] };
    if (!limits) return out;
    const L = limits === true ? GUARD_DEFAULTS : limits;
    if (L.maxFileBytes > 0 && info.fileBytes > L.maxFileBytes) {
      out.errors.push(`Fichier GeoPackage trop volumineux pour une lecture dans le navigateur (${formatMo(info.fileBytes)} ; limite ${formatMo(L.maxFileBytes)}). `
        + `Réduisez-le dans QGIS (exporter une emprise ou moins de couches) avant de l'importer.`);
    }
    for (const l of info.layers || []) {
      if (L.maxFeaturesPerLayer > 0 && l.features > L.maxFeaturesPerLayer) {
        out.errors.push(`Couche « ${l.name} » : ${formatNb(l.features)} entités, au-delà de la limite de ${formatNb(L.maxFeaturesPerLayer)} `
          + `pour une lecture dans le navigateur. Filtrez ou découpez la couche dans QGIS.`);
      } else if (L.warnFeaturesPerLayer > 0 && l.features > L.warnFeaturesPerLayer) {
        out.warnings.push(`Couche « ${l.name} » : ${formatNb(l.features)} entités ; au-delà de ${formatNb(L.warnFeaturesPerLayer)} par couche, `
          + `l'import et la carte deviennent lents.`);
      }
    }
    return out;
  }

  // Verifie l'existence d'une table SQLite (sans throw)
  function _gpkgTableExists(db, tableName) {
    try {
      const r = db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${_sqlEsc(tableName)}'`);
      return !!(r.length && r[0].values.length);
    } catch (e) { return false; }
  }

  // Retourne { fieldName: { label?, description?, choices?: [...] } }
  function readGpkgFieldEnrichments(db, tableName) {
    const out = {};
    if (!_gpkgTableExists(db, 'gpkg_data_columns')) return out;
    try {
      // Schema standard OGC : column_name, name, title, description, mime_type, constraint_name
      const dc = db.exec(
        `SELECT column_name, name, title, description, constraint_name
         FROM gpkg_data_columns WHERE table_name='${_sqlEsc(tableName)}'`
      );
      if (dc.length) {
        for (const [col, name, title, desc, cname] of dc[0].values) {
          out[col] = out[col] || {};
          // 'title' a priorite sur 'name' (title = libelle humain, name = cle technique)
          const label = title || name;
          if (label) out[col].label = label;
          if (desc) out[col].description = desc;
          if (cname) out[col]._constraintName = cname;
        }
      }
    } catch (e) { /* table absente ou colonnes differentes */ }

    // Joindre les contraintes enum/range si presentes
    if (_gpkgTableExists(db, 'gpkg_data_column_constraints')) {
      for (const fname of Object.keys(out)) {
        const cn = out[fname]._constraintName;
        if (!cn) continue;
        try {
          const cr = db.exec(
            `SELECT constraint_type, value, min, max, description
             FROM gpkg_data_column_constraints WHERE constraint_name='${_sqlEsc(cn)}'`
          );
          if (cr.length) {
            const enums = [];
            let hasRange = false;
            for (const [ct, val] of cr[0].values) {
              if (ct === 'enum' && val !== null) enums.push(String(val));
              else if (ct === 'range') hasRange = true;
            }
            if (enums.length) out[fname].choices = enums;
            if (hasRange) out[fname]._isRange = true;
          }
        } catch (e) {}
        delete out[fname]._constraintName;
      }
    }
    return out;
  }

  /**
   * Cree une instance du lecteur GPKG liee a un jeu de dependances.
   * @param {object} [deps] voir l'en-tete du fichier
   */
  function create(deps) {
    let D = deps || {};
    const rootOf = (name) => (root && root[name]) || null;

    function cfg(extra) { D = Object.assign({}, D, extra || {}); }

    // --- Resolution paresseuse des dependances (injection, sinon global) ---
    function geometry() {
      const g = D.geometry || rootOf('Q2GGeometry');
      if (!g) throw new Error('Q2GGpkg : module de geometrie (Q2GGeometry) non injecte');
      return g;
    }
    function qgs() {
      const q = D.qgs || rootOf('Q2GQgs');
      if (!q) throw new Error('Q2GGpkg : module de lecture QGS (Q2GQgs) non injecte');
      return q;
    }
    function gpkgDs() {
      if (D.gpkgDs) return D.gpkgDs;
      const g = rootOf('Q2GGpkgDs');
      if (g) return g;
      if (typeof module === 'object' && typeof require === 'function') {
        try { return require('./gpkg-datasource.js'); } catch (e) { /* repli ci-dessous */ }
      }
      throw new Error('Q2GGpkg : Q2GGpkgDs (gpkg-datasource) non injecte');
    }
    function parseQmlStyle(qmlText) {
      if (D.parseQmlStyle) return D.parseQmlStyle(qmlText);
      const qml = D.qml || rootOf('Q2GQmlParser');
      if (qml) return qml.parseQmlStyle(qmlText);
      if (typeof module === 'object' && typeof require === 'function') {
        try { return require('./qml-style-parser.js').parseQmlStyle(qmlText); } catch (e) { /* repli */ }
      }
      throw new Error('Q2GGpkg : parseQmlStyle non injecte');
    }
    function buildLayerFromGeojson(name, geojson) {
      const fn = D.buildLayerFromGeojson || geometry().buildLayerFromGeojson;
      if (typeof fn !== 'function') throw new Error('Q2GGpkg : buildLayerFromGeojson non injecte');
      return fn(name, geojson);
    }
    function progress(label, detail) {
      if (typeof D.onProgress === 'function') D.onProgress(label, detail);
    }
    function logger() { return D.logger || console; }

    // Fournit le module sql.js (injecte, sinon charge via deps.loadSqlJs / Q2GLoaders)
    async function loadSqlJs() {
      if (D.SQL) return D.SQL;
      if (typeof D.loadSqlJs === 'function') return D.loadSqlJs();
      const L = rootOf('Q2GLoaders');
      if (L && typeof L.loadSqlJs === 'function') return L.loadSqlJs();
      throw new Error('sql.js non disponible');
    }
    async function loadProj4() {
      if (D.proj4) return D.proj4;
      if (typeof D.loadProj4 === 'function') return D.loadProj4();
      const L = rootOf('Q2GLoaders');
      if (L && typeof L.loadProj4 === 'function') return L.loadProj4();
      if (typeof root.proj4 !== 'undefined') return root.proj4;
      return null; // degradation gracieuse, comme l'original
    }

    // Helper : ouvre une DB sql.js depuis un ArrayBuffer
    async function openSqlJs(arrayBuffer) {
      const SQL = await loadSqlJs();
      if (!SQL) throw new Error('sql.js non disponible');
      return new SQL.Database(new Uint8Array(arrayBuffer));
    }

    // Helper : construit la carte CRS + charge proj4js si necessaire
    async function buildCrsContext(db) {
      const crsMap = {};
      try {
        const res = db.exec(`SELECT srs_id, organization, organization_coordsys_id, definition FROM gpkg_spatial_ref_sys`);
        if (res.length) for (const [id, org, epsg, wkt] of res[0].values)
          crsMap[id] = { epsg: epsg || id, org: org || '', wkt: wkt || '' };
      } catch (e) {}

      // Detecte si proj4js est necessaire (CRS != 4326 et != 3857)
      const srsRes = db.exec(`SELECT DISTINCT srs_id FROM gpkg_geometry_columns`);
      const srsIds = srsRes.length ? srsRes[0].values.map(r => r[0]) : [];
      const needProj4 = srsIds.some(id => {
        const epsg = crsMap[id]?.epsg ?? id;
        return epsg !== 4326 && epsg !== 0 && id !== 4326 && epsg !== 3857 && id !== 3857;
      });

      let proj4fn = null;
      if (needProj4) {
        progress('Chargement proj4js…', 'reprojection requise');
        proj4fn = await loadProj4();
        if (proj4fn) {
          for (const [id, crs] of Object.entries(crsMap))
            if (crs.wkt && crs.epsg !== 4326 && crs.epsg !== 3857)
              try { proj4fn.defs('EPSG:' + crs.epsg, crs.wkt); } catch (e) {}
        }
      }
      return { crsMap, proj4fn };
    }

    // Cherche le projet QGIS embarque (extension qgis_projects) et parse le maplayer matching.
    // Retourne { aliases, widgets } ou null.
    function readGpkgEmbeddedQgsLayer(db, tableName) {
      if (!_gpkgTableExists(db, 'qgis_projects')) return null;
      try {
        const r = db.exec(`SELECT xml FROM qgis_projects LIMIT 1`);
        if (!r.length || !r[0].values.length) return null;
        const xml = r[0].values[0][0];
        if (!xml) return null;
        const DP = D.DOMParser || rootOf('DOMParser');
        if (!DP) throw new Error('DOMParser non injecte');
        const doc = new DP().parseFromString(xml, 'text/xml');
        // Chercher le maplayer dont le datasource pointe sur tableName ou layername=tableName
        const layers = doc.querySelectorAll('maplayer[type="vector"]');
        const Q = qgs();
        for (const ml of layers) {
          const ds = ml.querySelector('datasource')?.textContent || '';
          const lname = ml.querySelector('layername')?.textContent?.trim() || '';
          if (ds.includes(`layername=${tableName}`) || ds.includes(tableName) || lname === tableName) {
            return { aliases: Q.parseAliases(ml), widgets: Q.parseEditWidgets(ml) };
          }
        }
      } catch (e) { logger().warn('[qgis_projects] parse error:', e); }
      return null;
    }

    // Applique les enrichissements GPKG (data_columns, qgis_projects) a layerObj.fields
    function applyGpkgEnrichments(layerObj, db, tableName) {
      const dataColEnrich = readGpkgFieldEnrichments(db, tableName);
      const embedded      = readGpkgEmbeddedQgsLayer(db, tableName);
      for (const f of layerObj.fields) {
        // _rawKey = cle brute dans la table SQLite (avant sanitize). Tomber sur
        // f.label fonctionne avant tout enrichissement mais devient incorrect une
        // fois le label remplace par un alias humain.
        const key = f._rawKey || f.label || f.name;
        // 1. Aliases QGIS embarques (si presents)
        if (embedded?.aliases?.[key]) f.label = embedded.aliases[key];
        // 2. Edit widgets QGIS embarques -> enrichir gType / widgetOptions
        const widget = embedded?.widgets?.[key];
        if (widget) qgs().enrichFieldFromWidget(f, widget);
        // 3. gpkg_data_columns (priorite plus forte sur label/description)
        const dc = dataColEnrich[key];
        if (dc?.label) f.label = dc.label;
        if (dc?.description) f.description = dc.description;
        if (dc?.choices?.length && f.gType !== 'Choice') {
          f.gType = 'Choice';
          f.widgetOptions = JSON.stringify({ choices: dc.choices });
        }
      }
    }

    // --- Options de lecture (opt-in) ------------------------------------------
    // Sans options, la lecture est celle d'origine, au bit pres. Les options viennent
    // du dernier argument de parseGpkgFile / readGpkgWithSqlJs, completees par
    // deps.gpkgOptions (configure({ gpkgOptions: {...} }) pour reglage une fois pour toutes).
    function readOptions(opts) { return Object.assign({}, D.gpkgOptions, opts); }

    function warnUser(O, message) {
      logger().warn('[GPKG] ' + message);
      const cb = O.onWarning || D.onWarning;
      if (typeof cb === 'function') cb(message);
    }

    function flattenFn() {
      const s = D.schema || rootOf('Q2GSchema');
      return D.flattenGeoJsonFeatures || (s && s.flattenGeoJsonFeatures) || null;
    }

    // Garde de volume AVANT l'ouverture : la base est copiee en memoire par sql.js, et le
    // tampon d'origine reste vivant en plus ; mieux vaut refuser net que planter l'onglet.
    function guardFileSize(arrayBuffer, O) {
      if (!O.limits) return;
      const { errors } = checkGpkgLimits({ fileBytes: arrayBuffer.byteLength, layers: [] }, O.limits);
      if (errors.length) throw limitError(errors[0]);
    }

    // Garde de volume APRES ouverture, sur les couches qui seront lues.
    function guardLayerCounts(O, counts) {
      if (!O.limits) return;
      const { errors, warnings } = checkGpkgLimits({ fileBytes: 0, layers: counts }, O.limits);
      if (errors.length) throw limitError(errors[0]);
      for (const w of warnings) warnUser(O, w);
    }

    function countRows(db, tableName) {
      const r = db.exec(`SELECT COUNT(*) FROM ${_sqlIdent(tableName)}`);
      return r?.[0]?.values?.[0]?.[0] || 0;
    }

    // Pagination par rowid (WHERE rowid > dernier) : lineaire, la ou LIMIT/OFFSET relit et
    // jette les lignes deja vues (cout quadratique). Repli automatique sur OFFSET si la table
    // n'a pas de rowid exploitable (WITHOUT ROWID, colonne nommee rowid non entiere).
    // next(n) renvoie { values, shift } : shift = 1 si la colonne 0 est le rowid.
    function makePager(db, tableName, colListSql, useKeyset) {
      let keyset = !!useKeyset;
      let last = null;
      let off = 0;
      const from = _sqlIdent(tableName);
      return function next(n) {
        if (keyset) {
          try {
            const where = last === null ? '' : ` WHERE rowid > ${last}`;
            const r = db.exec(`SELECT rowid, ${colListSql} FROM ${from}${where} ORDER BY rowid LIMIT ${n}`);
            const values = r.length ? r[0].values : [];
            if (values.length) {
              const lr = values[values.length - 1][0];
              if (!Number.isSafeInteger(lr)) throw new Error('rowid non entier');
              last = lr;
            }
            off += values.length;
            return { values, shift: 1 };
          } catch (e) { keyset = false; }
        }
        const r = db.exec(`SELECT ${colListSql} FROM ${from} LIMIT ${n} OFFSET ${off}`);
        const values = r.length ? r[0].values : [];
        off += values.length;
        return { values, shift: 0 };
      };
    }

    function yieldToEventLoop(O) {
      if (typeof O.yieldFn === 'function') return O.yieldFn();
      if (typeof D.yieldFn === 'function') return D.yieldFn();
      return new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Lecture d'UNE couche par pages : chaque page est transformee en lignes finales
    // (geometry_json arrondi, centroide) puis son GeoJSON est abandonne ; seul le tableau
    // de lignes grandit. Meme resultat que buildLayerFromGeojson sur l'ensemble, car les
    // champs (200 premieres entites) et le type de geometrie (50 premieres) viennent de la
    // premiere page, qui compte au moins 200 entites.
    async function readLayerPaged(db, tableName, geomCol, propCols, total, ctx) {
      const { G, needsReproj, proj4fn, fromCRS, O, flatten } = ctx;
      const pageSize = Math.max(200, Math.floor(O.pageSize || 5000));
      const colList = [_sqlIdent(geomCol), ...propCols.map(c => _sqlIdent(c.name))].join(', ');
      const next = makePager(db, tableName, colList, O.keyset !== false);
      let layerObj = null;
      let read = 0;
      for (;;) {
        const { values, shift } = next(pageSize);
        if (!values.length) break;
        const feats = new Array(values.length);
        for (let r = 0; r < values.length; r++) {
          const row = values[r];
          const props = {};
          propCols.forEach((c, i) => { props[c.name] = row[i + 1 + shift]; });
          let geometry = null;
          if (row[shift]) {
            geometry = G.parseGpkgGeom(row[shift]);
            if (geometry && needsReproj)
              geometry = G.reprojectGeom(geometry, proj4fn, fromCRS, 'EPSG:4326');
          }
          feats[r] = { type: 'Feature', geometry, properties: props };
        }
        if (!layerObj) {
          layerObj = buildLayerFromGeojson(tableName, { type: 'FeatureCollection', features: feats });
        } else {
          const rows = flatten(feats, layerObj.fields, layerObj.geomType);
          const base = layerObj.features.length;
          for (let i = 0; i < rows.length; i++) {
            rows[i]._localId = base + i + 1;
            layerObj.features.push(rows[i]);
          }
        }
        read += values.length;
        progress('Lecture GeoPackage…', `${tableName} (${read}/${Math.max(total, read)})`);
        if (values.length < pageSize) break;
        await yieldToEventLoop(O);
      }
      if (!layerObj) layerObj = buildLayerFromGeojson(tableName, { type: 'FeatureCollection', features: [] });
      layerObj.featureCount = read;
      layerObj.hasData = read > 0;
      return layerObj;
    }

    // PARSER : GPKG standalone (.gpkg) - complet avec WKB + reprojection
    // opts (optionnel) : { paged, pageSize, keyset, limits, onWarning, yieldFn } - voir en-tete.
    async function parseGpkgFile(arrayBuffer, opts) {
      const O = readOptions(opts);
      guardFileSize(arrayBuffer, O);
      progress('Lecture GeoPackage…', 'chargement sql.js');
      const db = await openSqlJs(arrayBuffer);
      try {
        // 1. Tables de features
        const contRes = db.exec(`
          SELECT gc.table_name, gc.column_name, gc.srs_id
          FROM gpkg_geometry_columns gc
          JOIN gpkg_contents c ON gc.table_name = c.table_name
          WHERE c.data_type = 'features'`);
        if (!contRes.length || !contRes[0].values.length)
          throw new Error('Aucune couche vecteur trouvée dans ce GPKG.');

        if (O.limits) {
          guardLayerCounts(O, contRes[0].values.map(([name]) => ({ name, features: countRows(db, name) })));
        }

        // 2. CRS + proj4js
        const { crsMap, proj4fn } = await buildCrsContext(db);
        const G = geometry();

        // Lecture par pages : exige la mise a plat des lignes (Q2GSchema) ; sinon lecture d'origine.
        const flatten = O.paged ? flattenFn() : null;
        if (O.paged && !flatten) {
          warnUser(O, 'lecture par pages indisponible (flattenGeoJsonFeatures non injecte) : lecture complete.');
        }

        // 3. Lecture couche par couche
        const layers = [];
        for (const [tableName, geomCol, srsId] of contRes[0].values) {
          progress('Lecture GeoPackage…', tableName);
          const epsg       = crsMap[srsId]?.epsg ?? srsId;
          const fromCRS    = `EPSG:${epsg}`;
          const needsReproj = epsg !== 4326 && srsId !== 4326 && epsg !== 0;

          // Colonnes attributaires
          const colsRes  = db.exec(`PRAGMA table_info(${_sqlIdent(tableName)})`);
          if (!colsRes.length) continue;
          const propCols = colsRes[0].values
            .map(r => ({ name: r[1], type: r[2] }))
            .filter(c => c.name !== geomCol && c.name.toLowerCase() !== 'fid');

          // Lecture par lots (GPKG peut etre volumineux)
          const total    = countRows(db, tableName);
          let layerObj;
          if (flatten) {
            layerObj = await readLayerPaged(db, tableName, geomCol, propCols, total,
              { G, needsReproj, proj4fn, fromCRS, O, flatten });
          } else {
            const BATCH    = 5000;
            const features = [];

            for (let off = 0; off < Math.max(total, 1); off += BATCH) {
              const colList = [_sqlIdent(geomCol), ...propCols.map(c => _sqlIdent(c.name))].join(', ');
              const rowsRes = db.exec(`SELECT ${colList} FROM ${_sqlIdent(tableName)} LIMIT ${BATCH} OFFSET ${off}`);
              if (!rowsRes.length || !rowsRes[0].values.length) break;

              for (const row of rowsRes[0].values) {
                const props = {};
                propCols.forEach((c, i) => { props[c.name] = row[i + 1]; });
                let geometry = null;
                if (row[0]) {
                  geometry = G.parseGpkgGeom(row[0]);
                  if (geometry && needsReproj)
                    geometry = G.reprojectGeom(geometry, proj4fn, fromCRS, 'EPSG:4326');
                }
                features.push({ type: 'Feature', geometry, properties: props });
              }
              if (total <= BATCH) break;
            }
            layerObj = buildLayerFromGeojson(tableName, { type: 'FeatureCollection', features });
          }

          // Enrichir les colonnes : gpkg_data_columns (label/desc), gpkg_data_column_constraints
          // (enum -> Choice), qgis_projects (aliases + edit widgets QGIS embarques)
          applyGpkgEnrichments(layerObj, db, tableName);

          // Lire le style depuis layer_styles si la table existe
          try {
            const styleRes = db.exec(
              `SELECT styleQML FROM layer_styles WHERE f_table_name='${_sqlEsc(tableName)}' LIMIT 1`
            );
            if (styleRes.length && styleRes[0].values.length) {
              const style = parseQmlStyle(styleRes[0].values[0][0]);
              if (style) layerObj.style = style;
            }
          } catch (e) { /* layer_styles absente ou erreur */ }

          layers.push(layerObj);
        }
        return layers;
      } finally { db.close(); }
    }

    // Describe un GeoPackage sans rien lire des entites : taille du fichier et nombre
    // d'entites par table. Sert a decider (garde de volume, avertissement) avant de lire.
    async function inspectGpkg(arrayBuffer) {
      const db = await openSqlJs(arrayBuffer);
      try {
        const types = (gpkgDs().GPKG_IMPORTABLE_DATA_TYPES || ['features', 'attributes'])
          .map(t => `'${_sqlEsc(t)}'`).join(',');
        const res = db.exec(`SELECT table_name, data_type FROM gpkg_contents WHERE data_type IN (${types})`);
        const layers = [];
        if (res.length) {
          for (const [name, dataType] of res[0].values) layers.push({ name, dataType, features: countRows(db, name) });
        }
        return { fileBytes: arrayBuffer.byteLength, layers };
      } finally { db.close(); }
    }

    // GPKG reader embarque (QField ZIP) - meme moteur WKB + reprojection
    // opts (optionnel) : { paged (pagination par rowid + avertissement si tronque), maxRows,
    // limits, onWarning } - voir en-tete. Sans opts : 50 000 lignes par table, tronquees
    // sans message, comme avant.
    async function readGpkgWithSqlJs(arrayBuffer, layerHint, opts) {
      const O = readOptions(opts);
      let db = null;
      try {
        guardFileSize(arrayBuffer, O);
        db = await openSqlJs(arrayBuffer);
        const Ds = gpkgDs();
        const G = geometry();
        const types = (Ds.GPKG_IMPORTABLE_DATA_TYPES || ['features', 'attributes'])
          .map(t => `'${t}'`).join(',');
        const tableRes = db.exec(
          `SELECT table_name, data_type FROM gpkg_contents WHERE data_type IN (${types})`
        );
        if (!tableRes.length || !tableRes[0].values.length) return null;

        const tableNames = tableRes[0].values.map(r => r[0]);
        const tableTypes = Object.fromEntries(tableRes[0].values.map(r => [r[0], r[1]]));
        let targetTables = Ds.matchGpkgTables(tableNames, layerHint);
        if (layerHint && !targetTables.length) {
          logger().warn('[GPKG] table introuvable pour', layerHint, '—', tableNames.join(', '));
          return [];
        }
        if (!layerHint && !targetTables.length && tableNames.length === 1) {
          targetTables = [tableNames[0]];
        }

        if (O.limits) {
          guardLayerCounts(O, targetTables.map(name => ({ name, features: countRows(db, name) })));
        }

        const { crsMap, proj4fn } = await buildCrsContext(db);

        const features = [];
        for (const tableName of targetTables) {
          const isAttribute = tableTypes[tableName] === 'attributes';
          const gcRes  = isAttribute ? null : db.exec(`SELECT column_name, srs_id FROM gpkg_geometry_columns WHERE table_name='${_sqlEsc(tableName)}'`);
          const geomCol = gcRes?.[0]?.values?.[0]?.[0] || 'geom';
          const srsId   = gcRes?.[0]?.values?.[0]?.[1];
          const epsg    = crsMap[srsId]?.epsg ?? srsId;
          const needsReproj = !isAttribute && epsg !== 4326 && srsId !== 4326 && epsg !== 0;

          const cols    = db.exec(`PRAGMA table_info(${_sqlIdent(tableName)})`);
          if (!cols.length) continue;
          const colNames = cols[0].values.map(r => r[1]);
          const geomIdx  = isAttribute ? -1 : colNames.indexOf(geomCol);

          const total = countRows(db, tableName);
          const BATCH = 5000;
          const MAX_ROWS = O.maxRows > 0 ? O.maxRows : 50000;

          // Une page : lignes d'une requete + decalage (1 si la colonne 0 est le rowid).
          const convertRows = (values, shift) => {
            for (const row of values) {
              const props = {};
              colNames.forEach((c, i) => { if (c !== geomCol && c.toLowerCase() !== 'fid') props[c] = row[i + shift]; });
              let geometry = null;
              if (geomIdx >= 0 && row[geomIdx + shift]) {
                geometry = G.parseGpkgGeom(row[geomIdx + shift]);
                if (geometry && needsReproj)
                  geometry = G.reprojectGeom(geometry, proj4fn, `EPSG:${epsg}`, 'EPSG:4326');
              }
              features.push({ type: 'Feature', geometry, properties: props });
            }
          };

          if (O.paged) {
            const cap = Math.min(total, MAX_ROWS);
            const next = makePager(db, tableName, '*', O.keyset !== false);
            let read = 0;
            while (read < cap) {
              const { values, shift } = next(Math.min(BATCH, cap - read));
              if (!values.length) break;
              convertRows(values, shift);
              read += values.length;
              if (layerHint) progress('Lecture GPKG…', `${tableName} (${read}/${total})`);
            }
            if (total > cap) {
              warnUser(O, `table « ${tableName} » tronquée à ${cap} lignes sur ${total}.`);
            }
          } else {
            for (let off = 0; off < Math.min(total, MAX_ROWS); off += BATCH) {
              const rows = db.exec(`SELECT * FROM ${_sqlIdent(tableName)} LIMIT ${BATCH} OFFSET ${off}`);
              if (!rows.length) break;
              convertRows(rows[0].values, 0);
              if (layerHint) progress('Lecture GPKG…', `${tableName} (${Math.min(off + BATCH, total)}/${total})`);
            }
          }
        }
        return features;
      } catch (e) {
        // Un refus de volume est un message pour la personne, pas une erreur de lecture a avaler.
        if (e && e.code === 'Q2G_LIMITE') throw e;
        logger().warn('GPKG read error:', e);
        return null;
      } finally {
        if (db) { try { db.close(); } catch (e) { /* deja ferme */ } }
      }
    }

    return {
      configure: cfg,
      openSqlJs,
      buildCrsContext,
      _sqlEsc,
      _sqlIdent,
      checkGpkgLimits,
      GUARD_DEFAULTS,
      inspectGpkg,
      _gpkgTableExists,
      readGpkgFieldEnrichments,
      readGpkgEmbeddedQgsLayer,
      applyGpkgEnrichments,
      parseGpkgFile,
      readGpkgWithSqlJs,
    };
  }

  // Instance par defaut : deps resolues sur les globaux ou via configure().
  const def = create({});
  return Object.assign({ create }, def);
});
