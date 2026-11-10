/**
 * Q2GQgis2web - lecture des exports qgis2web / BigQgisMCP (HTML, ZIP, GeoJSON en ZIP).
 *
 * Extrait de index_v2.html. Les fonctions gardent leur nom et leur logique
 * d'origine ; un parametre final optionnel `deps` permet d'injecter les
 * dependances externes (aucun acces implicite au DOM ni a window).
 *
 * Dependances (toutes optionnelles, resolues dans l'ordre : deps explicite,
 * configure(), global, module frere charge par require() sous Node) :
 *   JSZip                         requis par parseZipFile seulement (JSZip.loadAsync)
 *   buildLayerFromGeojson(name, geojson)   repli : Q2GSchema
 *   remoteMcp                     module Q2GParseRemoteMcp (parseQgisRemoteMcpLayersData) ;
 *                                 s'il est absent, l'export QgisRemoteMCP n'est pas reconnu
 *   qgs                           module Q2GQgs (parseQgzFile, parseQgsXml) ; alias acceptes :
 *                                 deps.parseQgzFile, deps.parseQgsXml
 *   loadSqlJs()                   prechauffage de sql.js avant la lecture d'un projet QGIS
 *   setReadingLabel(label, step)  repli : sans effet
 *   yieldToUi()                   repli : setTimeout 0
 *   onMeta(meta)                  appelee avec les metadonnees BigQgisMCP quand un HTML en
 *                                 porte (la page y range _currentMeta) ; jamais appelee sinon
 *   logger                        { log, warn } ; repli : console
 *
 * Usage : Q2GQgis2web.configure({ ... }) une fois, ou passer deps en dernier argument.
 *
 * Etat : aucun. Les fonctions de lecture sont pures a l'exception des appels aux
 * dependances ; la seule sortie laterale d'origine (_currentMeta) passe par onMeta.
 * parseQgis2webHtmlWithMeta rend {layers, meta} sans aucun effet de bord.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Q2GQgis2web = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // ── Dependances ──────────────────────────────────────────────

  let _defaults = {};

  /** Fixe des dependances par defaut pour tous les appels (fusion). */
  function configure(deps) {
    _defaults = Object.assign({}, _defaults, deps || {});
    return _defaults;
  }

  const _requireCache = new Map();

  function _tryRequire(path) {
    if (_requireCache.has(path)) return _requireCache.get(path);
    let mod = null;
    if (typeof module === 'object' && typeof require === 'function') {
      try { mod = require(path); } catch (e) { /* module absent */ }
    }
    _requireCache.set(path, mod);
    return mod;
  }

  function _first() {
    for (let i = 0; i < arguments.length; i++) {
      if (arguments[i] != null) return arguments[i];
    }
    return null;
  }

  function _resolve(deps) {
    const d = Object.assign({}, _defaults, deps || {});
    const g = root || {};
    const schema = _first(d.schema, g.Q2GSchema, _tryRequire('./q2g-schema.js')) || {};
    const qgs = _first(d.qgs, g.Q2GQgs, _tryRequire('./q2g-qgs.js')) || {};
    const noop = () => {};
    return {
      JSZip: _first(d.JSZip, g.JSZip),
      buildLayerFromGeojson: _first(d.buildLayerFromGeojson, schema.buildLayerFromGeojson),
      remoteMcp: _first(d.remoteMcp, g.Q2GParseRemoteMcp, _tryRequire('./parse-remote-mcp.js')),
      parseQgzFile: _first(d.parseQgzFile, qgs.parseQgzFile),
      parseQgsXml: _first(d.parseQgsXml, qgs.parseQgsXml),
      loadSqlJs: _first(d.loadSqlJs),
      setReadingLabel: typeof d.setReadingLabel === 'function' ? d.setReadingLabel : noop,
      yieldToUi: typeof d.yieldToUi === 'function'
        ? d.yieldToUi
        : () => new Promise(r => setTimeout(r, 0)),
      onMeta: typeof d.onMeta === 'function' ? d.onMeta : null,
      logger: _first(d.logger, g.console),
    };
  }

  function _need(fn, name) {
    if (typeof fn !== 'function') throw new Error('Q2GQgis2web : dependance manquante (' + name + ')');
    return fn;
  }

  /** Journal injectable : { log, warn } ; sans logger, console ; sans console, rien. */
  function _logger(deps) {
    const l = (deps && deps.logger) || _defaults.logger || root.console || null;
    return {
      log: (...a) => { if (l && typeof l.log === 'function') l.log(...a); },
      warn: (...a) => {
        if (l && typeof l.warn === 'function') l.warn(...a);
        else if (l && typeof l.log === 'function') l.log(...a);
      },
    };
  }

  // ══════════════════════════════════════════════════════════════
  // PARSER: ZIP dispatcher
  // ══════════════════════════════════════════════════════════════
  async function parseZipFile(arrayBuffer, zipName, deps) {
    const d = _resolve(deps);
    d.setReadingLabel('Décompression ZIP…', zipName);
    await d.yieldToUi();
    const zip = await _need(d.JSZip && d.JSZip.loadAsync, 'JSZip').call(d.JSZip, arrayBuffer);
    const names = Object.keys(zip.files);

    // Detection heuristics
    const hasQgs      = names.some(n => n.endsWith('.qgs') || n.endsWith('.qgz'));
    const hasIndexHtml = names.some(n => n.endsWith('index.html'));
    const hasLayersJs  = names.some(n => n.includes('layers') && n.endsWith('.js'));
    const hasLayersDir = names.some(n => n.includes('/layers/') || n.startsWith('layers/'));
    // qgis2web exporte aussi les données dans data/*.js
    const hasDataDir   = names.some(n => /(?:^|\/)data\/[^/]+\.js$/i.test(n));

    if (hasIndexHtml || hasLayersJs || hasLayersDir || hasDataDir) {
      // qgis2web ZIP
      d.setReadingLabel('Format qgis2web détecté…', 'extraction des couches Leaflet');
      return parseQgis2webZip(zip, deps);
    } else if (hasQgs) {
      // QField package or nested QGZ
      d.setReadingLabel('Paquet QField détecté…', 'recherche du projet QGZ');
      // Prechauffage de sql.js, en parallele de la lecture du projet
      let sqlReady = Promise.resolve(null);
      if (typeof d.loadSqlJs === 'function') {
        try { sqlReady = Promise.resolve(d.loadSqlJs()).catch(() => null); } catch (e) { /* ignore */ }
      }
      // Find .qgz file inside
      const qgzEntry = names.find(n => n.endsWith('.qgz'));
      if (qgzEntry) {
        const qgzAb = await zip.files[qgzEntry].async('arraybuffer');
        await sqlReady;
        return _need(d.parseQgzFile, 'parseQgzFile')(qgzAb, zip, qgzEntry);
      }
      // Find .qgs directly
      const qgsEntry = names.find(n => n.endsWith('.qgs'));
      if (qgsEntry) {
        const qgsText = await zip.files[qgsEntry].async('string');
        await sqlReady;
        return _need(d.parseQgsXml, 'parseQgsXml')(qgsText, zip);
      }
      throw new Error('Paquet QField trouvé mais pas de fichier .qgz/.qgs lisible.');
    } else {
      // Check if any GeoJSON files
      const geojsonFiles = names.filter(n => n.endsWith('.geojson') || n.endsWith('.json'));
      if (geojsonFiles.length > 0) {
        d.setReadingLabel('Fichiers GeoJSON détectés…', 'chargement des features');
        return parseGeojsonFiles(zip, geojsonFiles, deps);
      }
      throw new Error('Contenu du ZIP non reconnu. Attendu: export qgis2web, paquet QField ou fichiers GeoJSON.');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PARSER: qgis2web HTML (standalone or from ZIP)
  // ══════════════════════════════════════════════════════════════

  /**
   * Coeur de la lecture d'un HTML qgis2web / BigQgisMCP, synchrone et sans effet de bord.
   * Rend { layers, meta } ; meta vaut null hors BigQgisMCP et pour un export QgisRemoteMCP.
   */
  function _parseHtmlCore(html, d, deps) {
    const buildLayerFromGeojson = _need(d.buildLayerFromGeojson, 'buildLayerFromGeojson');

    // QgisRemoteMCP / export_web_map : var layersData = [{name, color, geojson, legend}]
    if (d.remoteMcp && typeof d.remoteMcp.parseQgisRemoteMcpLayersData === 'function') {
      const remoteLayers = d.remoteMcp.parseQgisRemoteMcpLayersData(html, { buildLayerFromGeojson });
      if (remoteLayers) {
        return { layers: remoteLayers, meta: null };
      }
    }

    const layers = [];
    const seenFP = new Set();

    // Scan ALL "FeatureCollection" occurrences regardless of variable name.
    // Works for: qgis2web (json_* vars), BigQgisMCP flood/temporal maps (FLOOD_JSON etc.)
    let searchFrom = 0;
    const MARKER = '"FeatureCollection"';

    while (true) {
      const markerPos = html.indexOf(MARKER, searchFrom);
      if (markerPos < 0) break;
      searchFrom = markerPos + MARKER.length;

      // Walk backwards to find the enclosing '{'
      let openBrace = markerPos;
      while (openBrace > 0 && html[openBrace] !== '{') openBrace--;
      if (openBrace <= 0) continue;

      const sub = html.slice(openBrace);
      const endIdx = findMatchingBrace(sub);
      if (endIdx < 0 || endIdx < 100) continue;

      let geojson;
      try { geojson = JSON.parse(sub.slice(0, endIdx + 1)); } catch(e) { continue; }
      if (!geojson || geojson.type !== 'FeatureCollection') continue;
      const features = Array.isArray(geojson.features) ? geojson.features : [];
      if (features.length === 0) continue;

      // Fingerprint: property keys + count to deduplicate same data across re-uses
      const fp = Object.keys(features[0]?.properties || {}).sort().join(',') + '|' + features.length;
      if (seenFP.has(fp)) { searchFrom = openBrace + endIdx + 1; continue; }
      seenFP.add(fp);

      // Try to find variable name in the 120 chars before the opening brace
      const lookback = html.slice(Math.max(0, openBrace - 120), openBrace);
      const varMatch = lookback.match(/([A-Za-z][A-Za-z0-9_]*)\s*=\s*$/);
      const rawVarName = varMatch ? varMatch[1] : null;
      const layerName = rawVarName ? deriveLayerNameFromVar(rawVarName) : ('Couche ' + (layers.length + 1));
      const layer = buildLayerFromGeojson(layerName, geojson);
      layer.varName = rawVarName; // original JS variable name → needed for Grist adaptation
      layers.push(layer);
      searchFrom = openBrace + endIdx + 1;
    }

    // Associer les styles extraits (qgis2web + BigQgisMCP)
    const styleMap = extractQgis2webStyles(html);
    for (const layer of layers) {
      if (!layer.style && layer.varName) {
        // 1. Mapping direct BigQgisMCP : __var_floodData
        if (styleMap[`__var_${layer.varName}`]) {
          layer.style = styleMap[`__var_${layer.varName}`];
          continue;
        }
        // 2. qgis2web standard : json_Flooddata_0 → style_Flooddata_0_0
        const namePart = layer.varName.replace(/^json_/i, '');
        const candidates = [
          `style_${namePart}_0`,
          `style_${namePart}`,
          `style_${namePart.toLowerCase()}_0`,
          `style_${namePart.toLowerCase()}`,
        ];
        for (const fn of candidates) {
          if (styleMap[fn]) { layer.style = styleMap[fn]; break; }
        }
        // 3. Fallback préfixe commun
        if (!layer.style) {
          const prefix = `style_${namePart.split('_').slice(0, -1).join('_')}`;
          const match = Object.keys(styleMap).find(k => k.startsWith(prefix) && !k.startsWith('__var'));
          if (match) layer.style = styleMap[match];
        }
      }
    }

    // Détecte un export qgis2web multi-fichiers (données dans data/*.js ou layers/*.js externes)
    if (layers.length === 0) {
      const extRefs = [...html.matchAll(/<script[^>]+src=["']([^"']*(?:data|layers)\/[^"']+\.js)["']/gi)].map(m => m[1]);
      if (extRefs.length > 0) {
        const examples = extRefs.slice(0, 2).map(r => r.split('/').pop()).join(', ');
        throw new Error(
          `Export qgis2web multi-fichiers : les données sont dans des fichiers externes (${examples}…). ` +
          `Veuillez fournir le ZIP complet de l'export qgis2web (pas seulement l'index.html).`
        );
      }
    }

    // Extraire les métadonnées BigQgisMCP (titre, stats, slider, légende originale)
    const _meta = extractBigQgisMcpMeta(html, deps);
    // Post-traitement générique : corriger l'assignation des palettes selon le geomType réel
    // des couches parsées — agnostique au nom de fonction ou au fichier d'entrée
    if (_meta && _meta.colorScaleFns && Object.keys(_meta.colorScaleFns).length > 0) {
      // Carte varName → geomType depuis les couches déjà parsées
      const varGeom = {};
      for (const layer of layers) {
        if (layer.varName) varGeom[layer.varName] = layer.geomType;
      }
      // Pour chaque fonction de palette, trouver quelle variable GeoJSON l'appelle
      const varNames = layers.filter(l => l.varName).map(l => l.varName);
      const callerVars = findColorFnCallerVars(html, _meta.colorScaleFns, varNames);
      // Reconstruire floodStyle (Polygon) et buildingStyle (Point) par geomType réel
      // ET assigner directement le style à chaque couche dont le varName est résolu
      let resolvedPolygon = null, resolvedPoint = null;
      for (const [fnName, fnStyle] of Object.entries(_meta.colorScaleFns)) {
        const varName  = callerVars[fnName];
        const geomType = varName ? varGeom[varName] : null;
        const field    = (_meta.colorFnFields || {})[fnName] || null;
        // Assignation directe : si callerVars a résolu le varName, associer le style à la couche précise
        if (varName) {
          const layerForVar = layers.find(l => l.varName === varName);
          if (layerForVar && !layerForVar.style) {
            layerForVar.style = { ...fnStyle, field };
          }
        }
        if (geomType === 'Polygon' && !resolvedPolygon) {
          resolvedPolygon = { ...fnStyle, field };
        } else if (geomType === 'Point' && !resolvedPoint) {
          resolvedPoint   = { ...fnStyle, field };
        }
      }
      // Appliquer si au moins une palette a été résolue par geomType confirmé
      if (resolvedPolygon || resolvedPoint) {
        _meta.inferredStyles.floodStyle    = resolvedPolygon || _meta.inferredStyles.floodStyle;
        _meta.inferredStyles.buildingStyle = resolvedPoint   || _meta.inferredStyles.buildingStyle;
      }
    }
    if (_meta) {
      fixPalettesByLegend(_meta, deps); // validation finale : corrige les palettes inversées via les couleurs de légende
    }

    return { layers, meta: _meta || null };
  }

  /**
   * Lit un HTML qgis2web / BigQgisMCP. Rend les couches ; les metadonnees BigQgisMCP,
   * s'il y en a, sont confiees a deps.onMeta (la page y range _currentMeta).
   */
  async function parseQgis2webHtml(html, deps) {
    const d = _resolve(deps);
    const res = _parseHtmlCore(html, d, deps);
    if (res.meta && d.onMeta) d.onMeta(res.meta);
    return res.layers;
  }

  /** Variante sans aucun effet de bord : rend { layers, meta }. */
  async function parseQgis2webHtmlWithMeta(html, deps) {
    const d = _resolve(deps);
    return _parseHtmlCore(html, d, deps);
  }

  // ══════════════════════════════════════════════════════════════
  // STYLE EXTRACTOR : styles depuis fonctions JS qgis2web
  // ══════════════════════════════════════════════════════════════

  // rgba(R,G,B,A) CSS → "#rrggbb"
  function rgbaCssToHex(str) {
    if (!str) return null;
    if (str.startsWith('#')) return str.slice(0, 7).toLowerCase();
    const m = str.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!m) return null;
    return '#' + [m[1], m[2], m[3]].map(v => Math.round(+v).toString(16).padStart(2, '0')).join('');
  }

  // Parse le corps d'une fonction style JS → {type, field, categories} ou null
  // Supporte : qgis2web (switch/case), BigQgisMCP (if/else), dot et bracket notation
  function parseQgis2webStyleBody(body) {
    // Extraire une couleur depuis un bloc texte
    // Priorité : fillColor > \bcolor\b > return 'color' (fonctions scalaires comme buildingColor)
    function findColor(text) {
      const fillM = text.match(/\bfillColor\s*[=:]\s*['"]?(rgba?\([^)]+\)|#[0-9a-fA-F]{3,6})['"]?/);
      if (fillM) return rgbaCssToHex(fillM[1]);
      const colorM = text.match(/\bcolor\s*[=:]\s*['"]?(rgba?\([^)]+\)|#[0-9a-fA-F]{3,6})['"]?/);
      if (colorM) return rgbaCssToHex(colorM[1]);
      // return '#hex' ou return 'rgba(...)' — pour fonctions scalaires (buildingColor…)
      const retM = text.match(/\breturn\s+['"]?(#[0-9a-fA-F]{3,6}|rgba?\([^)]+\))['"]?/);
      return retM ? rgbaCssToHex(retM[1]) : null;
    }

    // Détecter le champ : feature.properties['field'] OU feature.properties.field
    let field = null;
    const fM = body.match(/feature\.properties\s*(?:\[\s*['"]([^'"]+)['"]\s*\]|\.(\w+))/);
    if (fM) field = fM[1] || fM[2];

    // ── Catégorisé : switch(String(feature.properties[...])) ──
    if (/\bswitch\b/.test(body) && field) {
      const categories = [];
      const caseRx = /case\s+['"]([^'"]*)['"]\s*:([\s\S]*?)(?=case\s+['"]|default\s*:|\})/g;
      let cm;
      while ((cm = caseRx.exec(body)) !== null) {
        const value = cm[1];
        const block = cm[2];
        if (/fillOpacity\s*:\s*0(?!\.)/.test(block)) continue;
        const color = findColor(block);
        if (color) categories.push({ value, label: value, color });
      }
      if (categories.length) return { type: 'categorizedSymbol', field, categories };
    }

    // ── Gradué : if/else avec comparaisons < ou <= ──
    if (field && /\bif\b/.test(body) && /[<>]/.test(body)) {
      const categories = [];
      let prevUpper = 0;
      // Trouver tous les blocs if/else if (condition) { ... } ou if (cond) return {...}
      const ifRx = /(?:else\s+)?if\s*\(([^{;)]+)\)\s*(?:\{([^}]*)\}|return\s*(\{[^}]*\})|([^;{}\n]+;))/g;
      let ifM;
      while ((ifM = ifRx.exec(body)) !== null) {
        const condition = ifM[1];
        const block = ifM[2] || ifM[3] || ifM[4] || '';
        const color = findColor(block);
        if (!color) continue;
        const upM  = condition.match(/[<]=?\s*([\d.]+)/);
        const lowM = condition.match(/[>]=?\s*([\d.]+)/);
        if (!upM && !lowM) continue; // ignorer les conditions non-numériques (!ht, ht===null, ht===''…)
        const lower = lowM ? parseFloat(lowM[1]) : prevUpper;
        if (upM) {
          const upper = parseFloat(upM[1]);
          categories.push({ lower, upper, value: `${lower}–${upper}`, label: `${lower}–${upper}`, color });
          prevUpper = upper;
        } else {
          categories.push({ lower, upper: Infinity, value: `>${lower}`, label: `>${lower}`, color });
        }
      }
      // Bloc else final : else { ... } ou else return { ... }
      const elseM = body.match(/\belse\s*(?:\{([^}]+)\}|return\s*(\{[^}]*\}))/);
      if (elseM && categories.length > 0 && !categories.find(c => c.upper === Infinity)) {
        const color = findColor(elseM[1] || elseM[2] || '');
        if (color) categories.push({ lower: prevUpper, upper: Infinity, value: `>${prevUpper}`, label: `>${prevUpper}`, color });
      }
      // Fallback : return 'color' final sans else (ex: buildingColor → return '#bd0026')
      if (categories.length > 0 && !categories.find(c => c.upper === Infinity)) {
        const lastRetM = body.match(/return\s+['"]?(#[0-9a-fA-F]{3,6}|rgba?\([^)]+\))['"]?\s*;?\s*$/);
        if (lastRetM) {
          const color = rgbaCssToHex(lastRetM[1]) || lastRetM[1];
          if (color) categories.push({ lower: prevUpper, upper: Infinity, value: `>${prevUpper}`, label: `>${prevUpper}`, color });
        }
      }
      if (categories.length > 1) return { type: 'graduatedSymbol', field, categories };
    }

    // ── Ternaire chaîné : fillColor: v < 0.5 ? '#a' : v < 1 ? '#b' : '#c'
    //                      OU inverse : v > 2 ? '#a' : v > 1 ? '#b' : '#c'
    if (field) {
      const ternRx = /([<>]=?)\s*([\d.]+)\s*\?\s*['"]?(#[0-9a-fA-F]{3,6}|rgba?\s*\([^)]+\))['"]?\s*:/g;
      const ternSegs = [...body.matchAll(ternRx)];
      if (ternSegs.length >= 2) {
        // Extraire couleur finale (le dernier else sans ':')
        const lastSeg = ternSegs[ternSegs.length - 1];
        const afterLast = body.slice(lastSeg.index + lastSeg[0].length);
        const finalM = afterLast.match(/^\s*['"]?(#[0-9a-fA-F]{3,6}|rgba?\s*\([^)]+\))['"]?/);
        const finalColor = finalM ? (rgbaCssToHex(finalM[1]) || finalM[1]) : null;

        const firstOp = ternSegs[0][1][0]; // '<' ou '>'
        const categories = [];

        if (firstOp === '<') {
          // Chaîne croissante : < t1 → c1, < t2 → c2, …, else → cn
          let prev = 0;
          for (const tm of ternSegs) {
            const thresh = parseFloat(tm[2]);
            const color  = rgbaCssToHex(tm[3]) || tm[3];
            if (!color || isNaN(thresh)) continue;
            categories.push({ lower: prev, upper: thresh, color, value: `${prev}–${thresh}`, label: `< ${thresh}` });
            prev = thresh;
          }
          if (finalColor) categories.push({ lower: prev, upper: Infinity, color: finalColor, value: `>${prev}`, label: `> ${prev}` });

        } else {
          // Chaîne décroissante : > t1 → c1, > t2 → c2, …, else → cn
          // Ex: v > 2 ? dark : v > 1 ? med : v > 0.5 ? light : lightest
          // → ranges [0, 0.5[ lightest, [0.5, 1[ light, [1, 2[ med, [2, ∞[ dark
          const segs = [];
          for (const tm of ternSegs) {
            const thresh = parseFloat(tm[2]);
            const color  = rgbaCssToHex(tm[3]) || tm[3];
            if (!color || isNaN(thresh)) continue;
            segs.push({ thresh, color });
          }
          // Ajouter le else final avec seuil 0
          if (finalColor) segs.push({ thresh: 0, color: finalColor });
          // Les seuils sont en ordre décroissant. Construire des ranges non-chevauchants.
          // segs = [{thresh:2, dark}, {thresh:1, med}, {thresh:0.5, light}, {thresh:0, lightest}]
          for (let i = segs.length - 1; i >= 0; i--) {
            const lower = segs[i].thresh;
            const upper = i > 0 ? segs[i - 1].thresh : Infinity;
            categories.push({ lower, upper, color: segs[i].color, value: `${lower}–${upper}`, label: `> ${lower}` });
          }
        }

        if (categories.length >= 2) return { type: 'graduatedSymbol', field, categories };
      }
    }

    // ── Symbole unique : une seule couleur dans le corps ──
    if (!/\bif\b/.test(body) || !field) {
      const color = findColor(body);
      if (color && !/fillOpacity\s*:\s*0(?!\.)/.test(body)) {
        return { type: 'singleSymbol', field: null, color, categories: [] };
      }
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════
  // PALETTE EXTRACTOR : fonctions *Color(scalaire) → graduation
  // Générique : détecte toute fonction à 1 paramètre numérique
  // qui retourne des couleurs CSS (hex / rgba).
  // ══════════════════════════════════════════════════════════════
  function extractColorScaleFns(html) {
    const result = {}; // fnName → {type, categories, field:null, _paramName}

    const fnRx = /function\s+(\w+)\s*\(\s*(\w+)\s*\)\s*\{/g;
    let m;
    while ((m = fnRx.exec(html)) !== null) {
      const fnName = m[1];
      const paramName = m[2];
      // Ignorer les fonctions avec paramètre 'feature', 'e', 'event', 'layer', 'el'…
      if (/^(feature|e|event|layer|el|map|div|node|elem|cb|fn|callback)$/.test(paramName)) continue;

      // Extraire le corps (depth-aware)
      const bodyStart = m.index + m[0].length - 1;
      let depth = 1, i = bodyStart + 1;
      while (i < html.length && depth > 0) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}') depth--;
        i++;
      }
      const body = html.slice(bodyStart + 1, i - 1);

      // Exclure : accès DOM/Grist/Leaflet/feature.properties
      if (/\bfeature\b|\bproperties\b|\bdocument\b|\bwindow\b|\bL\.\w|\bgrist\b|\.addTo\b|getElementById/.test(body)) continue;
      // Doit contenir des couleurs
      if (!/'(?:#[0-9a-fA-F]{3,6}|rgba?\s*\()/.test(body)) continue;
      // Doit utiliser le paramètre dans des comparaisons numériques
      if (!new RegExp('\\b' + paramName + '\\s*[<>=!]').test(body)) continue;

      // Astuce : remplacer le paramètre par feature.properties['__v']
      // pour réutiliser parseQgis2webStyleBody sans le réécrire
      const fakeBody = body.replace(new RegExp('\\b' + paramName + '\\b', 'g'), "feature.properties['__v']");
      const parsed = parseQgis2webStyleBody(fakeBody);
      if (parsed && parsed.categories && parsed.categories.length >= 2) {
        result[fnName] = { ...parsed, field: null, _paramName: paramName };
      }
    }
    return result;
  }

  // Résout le champ de données associé à chaque fonction de palette
  // en cherchant les sites d'appel dans le HTML (setStyle / eachLayer)
  function resolveColorFnFields(html, colorFns) {
    const fields = {}; // fnName → fieldName

    for (const fnName of Object.keys(colorFns)) {
      // Chercher un site d'APPEL réel (ignorer la définition "function fnName(")
      const callRx = new RegExp('\\b' + fnName + '\\s*\\(', 'g');
      let callIdx = -1;
      let m;
      while ((m = callRx.exec(html)) !== null) {
        const prev = html.slice(Math.max(0, m.index - 10), m.index);
        if (/\bfunction\s*$/.test(prev)) continue; // c'est la définition
        callIdx = m.index;
        break;
      }
      if (callIdx < 0) continue;

      // Contexte : 600 chars avant + 100 après l'appel
      const before = html.slice(Math.max(0, callIdx - 600), callIdx);
      const callStr = html.slice(callIdx, callIdx + 80);

      // Étape 1 : accès direct à une propriété dans l'argument de l'appel
      // fnName(p.field), fnName(feature.properties.field), fnName(Math.min(x, p.field))
      const directM = callStr.match(new RegExp(
        fnName + '\\s*\\(\\s*(?:Math\\.\\w+\\s*\\([^,)]+,\\s*)?' +
        '(?:[a-z_]+\\.(?:properties\\.)?)?([a-zA-Z_][a-zA-Z0-9_]{2,})\\s*(?:\\))?\\s*\\)'
      ));
      const capturedArg = directM ? directM[1] : null;

      if (capturedArg) {
        // Tenter de tracer ce nom si c'est une variable locale (ex: htMax → ht_max)
        // Chercher var htMax = parseFloat(p.ht_max) | .max_water_height | properties['field']
        const varDefRx = new RegExp(
          '(?:var|let|const)\\s+' + capturedArg + '\\s*=\\s*' +
          '(?:parseFloat\\s*\\(\\s*|Math\\.\\w+\\s*\\([^)]*,\\s*)?' +   // optional parseFloat( or Math.min(x,
          '(?:[a-z_]+\\.(?:properties\\.)?|\\w+\\.(?:feature\\.)?properties\\[\'"])?' +
          "([a-zA-Z_][a-zA-Z0-9_]{2,})"
        );
        const defM = before.match(varDefRx);
        if (defM && defM[1] !== capturedArg) {
          // La variable est définie depuis une propriété GeoJSON
          fields[fnName] = defM[1]; // e.g. 'ht_max'
        } else {
          // Pas de définition trouvée → utiliser le nom capturé tel quel
          // (peut être directement un nom de propriété comme 'ht_max')
          fields[fnName] = capturedArg;
        }
        continue;
      }

      // Étape 2 : fallback — trouver n'importe quel accès p.field dans le contexte proche
      const fallbackRx = /(?:p|props?|feature\.properties)\s*(?:\[\s*['"]?|\.)\s*([a-zA-Z_][a-zA-Z0-9_]{2,})/g;
      let fbM;
      while ((fbM = fallbackRx.exec(before)) !== null) {
        fields[fnName] = fbM[1];
        break;
      }
    }
    return fields;
  }

  // Trouve quelle variable GeoJSON (varName de layer) appelle chaque fonction de palette
  // Retourne { fnName → varName } — agnostique au nom de la fonction ou du fichier
  // layerVarNames : liste des varNames connus (depuis les couches parsées) — améliore la précision
  function findColorFnCallerVars(html, colorFns, layerVarNames) {
    const callerVars = {}; // fnName → varName

    // ── Approche principale (inverse) ──────────────────────────────────────────
    // Pour chaque variable GeoJSON connue, scanner le bloc L.geoJSON(varName, {...})
    // et voir quelle fonction de palette y est appelée.
    // Beaucoup plus fiable que chercher en arrière depuis l'appel.
    for (const varName of (layerVarNames || [])) {
      const safeVar = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const geoRx = new RegExp('L\\.(?:geoJson|geoJSON)\\s*\\(\\s*' + safeVar + '\\b', 'g');
      let gm;
      while ((gm = geoRx.exec(html)) !== null) {
        const braceStart = html.indexOf('{', gm.index + gm[0].length);
        if (braceStart < 0) continue;
        let depth = 1, i = braceStart + 1;
        while (i < html.length && depth > 0) {
          if (html[i] === '{') depth++;
          else if (html[i] === '}') depth--;
          i++;
        }
        const block = html.slice(braceStart + 1, i - 1);
        for (const fnName of Object.keys(colorFns)) {
          if (!callerVars[fnName] && new RegExp('\\b' + fnName + '\\s*\\(').test(block)) {
            callerVars[fnName] = varName;
          }
        }
      }
    }

    // ── Fallback : chercher en arrière depuis chaque appel ─────────────────────
    for (const fnName of Object.keys(colorFns)) {
      if (callerVars[fnName]) continue; // déjà résolu par l'approche principale
      const callRx = new RegExp('\\b' + fnName + '\\s*\\(', 'g');
      let m;
      while ((m = callRx.exec(html)) !== null) {
        const prev = html.slice(Math.max(0, m.index - 10), m.index);
        if (/\bfunction\s*$/.test(prev)) continue;
        const lookback = html.slice(Math.max(0, m.index - 4000), m.index);
        // Patron 1 : varName.features.forEach / .map / .filter
        const forEachRx = /\b([A-Za-z][A-Za-z0-9_]*)\s*\.\s*features\s*\.\s*(?:forEach|map|filter)\s*\(/g;
        let fm, lastVar1 = null;
        while ((fm = forEachRx.exec(lookback)) !== null) lastVar1 = fm[1];
        if (lastVar1) { callerVars[fnName] = lastVar1; break; }
        // Patron 2 : L.geoJSON(varName, {...}) en arrière
        const geoJsonFb = /L\.(?:geoJson|geoJSON)\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*,/g;
        let gm2, lastVar2 = null;
        while ((gm2 = geoJsonFb.exec(lookback)) !== null) lastVar2 = gm2[1];
        if (lastVar2) { callerVars[fnName] = lastVar2; break; }
        break;
      }
    }
    return callerVars;
  }

  // Correction des palettes depuis les items de légende HTML.
  // Étape 1 : reconstruction complète depuis les seuils lisibles de la légende (source de vérité).
  // Étape 2 (fallback) : swap par correspondance couleurs si la légende n'a pas de seuils parsables.
  // Appelée aussi bien après import frais qu'après restauration depuis Grist (configs sauvegardées).
  function fixPalettesByLegend(meta, deps) {
    const L = _logger(deps);
    if (!meta?.legendItems?.length || !meta.inferredStyles) return;

    // Étape 1 : reconstruire les palettes depuis les seuils de la légende
    function _thresh(label) {
      const rM  = label.match(/([\d.]+)\s*[-–—]\s*([\d.]+)/);
      const ltM = label.match(/[<≤]\s*([\d.]+)/);
      const gtM = label.match(/[>≥]\s*([\d.]+)/);
      if (rM)  return { lower: parseFloat(rM[1]), upper: parseFloat(rM[2]) };
      if (ltM) return { upper: parseFloat(ltM[1]) };
      if (gtM) return { lower: parseFloat(gtM[1]) };
      return null;
    }
    function _buildGrad(items, field) {
      const cats = []; let prev = 0;
      for (const item of items) {
        const t = _thresh(item.label);
        if (!t) continue;
        const lower = t.lower ?? prev, upper = t.upper ?? Infinity;
        cats.push({ lower, upper, color: item.color, rawColor: item.rawColor, label: item.label, value: item.label });
        if (upper !== Infinity) prev = upper;
      }
      return cats.length >= 2 ? { type: 'graduatedSymbol', field, categories: cats } : null;
    }
    // Séparer les items swatch par chaleur colorimétrique :
    // bleu/froid → flood polygons, chaud/jaune/rouge → bâtiments exposés
    function _warmth(item) {
      const h = (item.color || '').replace('#', '');
      if (h.length < 6) return 0;
      return parseInt(h.slice(0, 2), 16) - parseInt(h.slice(4, 6), 16);
    }
    const allPolyItems  = meta.legendItems.filter(i => !i.circle && _thresh(i.label));
    const coldItems = allPolyItems.filter(i => _warmth(i) <= 20);
    const warmItems = allPolyItems.filter(i => _warmth(i) >  20);
    const _floodItems    = coldItems.length >= 2 ? coldItems
                         : allPolyItems.slice(0, Math.ceil(allPolyItems.length / 2));
    const _buildingItems = warmItems.length >= 2 ? warmItems
                         : allPolyItems.slice(Math.ceil(allPolyItems.length / 2));
    let rebuilt = false;
    if (_floodItems.length >= 2) {
      const ls = _buildGrad(_floodItems, 'ht_max');
      if (ls) { meta.inferredStyles.floodStyle = ls; rebuilt = true; }
    }
    if (_buildingItems.length >= 2) {
      const ls = _buildGrad(_buildingItems, 'max_water_height');
      if (ls) { meta.inferredStyles.buildingStyle = ls; rebuilt = true; }
    }
    if (rebuilt) {
      L.log('[fixPalettesByLegend] Palettes reconstruites depuis legendItems');
      return;
    }

    // Étape 2 (fallback) : légende sans seuils numériques → tenter swap par correspondance couleurs
    const fs = meta.inferredStyles.floodStyle;
    const bs = meta.inferredStyles.buildingStyle;
    if (!fs?.categories?.length || !bs?.categories?.length) return;

    // legend-circle = bâtiments (points), legend-swatch = inondation (polygones)
    const circleColors = new Set(meta.legendItems.filter(i => i.circle).map(i => i.color));
    const swatchColors = new Set(meta.legendItems.filter(i => !i.circle).map(i => i.color));
    if (!circleColors.size || !swatchColors.size) return;

    const floodMatchCircle = fs.categories.filter(c => circleColors.has(c.color)).length;
    const floodMatchSwatch = fs.categories.filter(c => swatchColors.has(c.color)).length;

    if (floodMatchCircle > floodMatchSwatch) {
      meta.inferredStyles.floodStyle    = bs;
      meta.inferredStyles.buildingStyle = fs;
    } else if (floodMatchCircle === 0 && floodMatchSwatch === 0) {
      function avgWarmth(cats) {
        let s = 0, n = 0;
        for (const c of cats) {
          const h = (c.color || '').replace('#', '');
          if (h.length < 6) continue;
          s += parseInt(h.slice(0, 2), 16) - parseInt(h.slice(4, 6), 16);
          n++;
        }
        return n > 0 ? s / n : 0;
      }
      if (avgWarmth(fs.categories) > avgWarmth(bs.categories)) {
        meta.inferredStyles.floodStyle    = bs;
        meta.inferredStyles.buildingStyle = fs;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // META EXTRACTOR : titre, légende, slider depuis BigQgisMCP HTML
  // ══════════════════════════════════════════════════════════════
  function extractBigQgisMcpMeta(html, deps) {
    const L = _logger(deps);
    if (!html.includes('slider-panel') && !html.includes('stats-panel')) return null;

    // Titre et sous-titre
    let title = null, subtitle = null;
    const titleM = html.match(/<div[^>]*class="[^"]*map-title[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (titleM) {
      const smallM = titleM[1].match(/<small[^>]*>([\s\S]*?)<\/small>/);
      subtitle = smallM ? smallM[1].replace(/<[^>]+>/g, '').trim() : null;
      title = titleM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (subtitle) title = title.replace(subtitle, '').trim();
    }

    // Légende : chercher legend-swatch / legend-circle dans TOUT le HTML (y compris JS strings)
    // La légende BigQgisMCP est générée dynamiquement via div.innerHTML = '...', pas en HTML statique.
    const legendItems = [];
    const swatchRowRx = /legend-(swatch|circle)/gi;
    let swRM;
    while ((swRM = swatchRowRx.exec(html)) !== null) {
      const isCircle = swRM[1].toLowerCase() === 'circle';
      // Fenêtre de 400 chars à partir du match
      const win = html.slice(swRM.index, swRM.index + 400);
      // Couleur dans l'attribut style="background:..." ou style='background:...'
      const colorM = win.match(/background:\s*(#[0-9a-fA-F]{3,6}|rgba?\s*\([^)]+\))/);
      if (!colorM) continue;
      const rawColor = colorM[1].trim();
      const hexColor = rgbaCssToHex(rawColor) || rawColor;
      if (!hexColor) continue;
      // Label : texte après </span> dans la même fenêtre (gère &lt; &gt; HTML entities)
      const spCloseIdx = win.indexOf('</span>');
      if (spCloseIdx < 0) continue;
      const afterSpan = win.slice(spCloseIdx + 7);
      const labelM = afterSpan.match(/^\s*([^<'"\n\r\\]{2,120})/);
      if (!labelM) continue;
      const label = labelM[1]
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
        .replace(/\\n|\\t/g, ' ')
        .trim();
      if (!label || label.length < 2 || /^(L[eé]gende?|Legend|Titre|Title|Légende)$/i.test(label)) continue;
      if (!legendItems.find(x => x.label === label)) {
        legendItems.push({ color: hexColor, rawColor, label, circle: isCircle });
      }
    }

    // Slider : range min/max
    // Supporte : range: [0, 5]  (Leaflet-slider)
    //            range: { min: 0, max: 5 }  (noUiSlider — valeurs littérales)
    let sliderMin = 0, sliderMax = 5;
    const sliderM = html.match(/range\s*:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/)
                 || html.match(/range\s*:\s*\{[^}]*min\s*:\s*([\d.]+)[^}]*max\s*:\s*([\d.]+)[^}]*\}/)
                 || html.match(/range\s*:\s*\{[^}]*max\s*:\s*([\d.]+)[^}]*min\s*:\s*([\d.]+)[^}]*\}/);
    if (sliderM) {
      // Pour le cas max avant min dans l'objet, on s'assure que min < max
      const a = parseFloat(sliderM[1]), b = parseFloat(sliderM[2]);
      sliderMin = Math.min(a, b); sliderMax = Math.max(a, b);
    }
    // Fallback : dériver sliderMax depuis les données de la couche flood (max des ht_max)
    // Si aucun literale trouvé, on garde la valeur 5 par défaut (raisonnable pour un scénario inondation)

    // Titre du panneau stats (capturer uniquement du texte HTML, pas du JS template)
    const statsTitleM = html.match(/Statistiques\s*[—\-]\s*([\wÀ-ÿ][^<"'+\n]{1,60})/);
    const statsTitle = statsTitleM?.[1]?.trim() || 'Statistiques';

    // Source footer (idem, pas de JS)
    const srcM = html.match(/Source\s*:\s*([\wÀ-ÿ][^<"'+\n]{4,80})/);
    const source = srcM?.[1]?.trim() || null;

    // ── Palettes de couleur : fonctions *Color(scalaire) ──────────────────────
    // Source prioritaire : fonctions JS extraites (floodColor, buildingColor…)
    // Fallback : items de légende avec seuils parsés
    const inferredStyles = {};

    // Helpers pour le parsing des seuils depuis les labels de légende
    function _parseThresh(label) {
      const rM  = label.match(/([\d.]+)\s*[-–—]\s*([\d.]+)/);
      const ltM = label.match(/[<≤]\s*([\d.]+)/);
      const gtM = label.match(/[>≥]\s*([\d.]+)/);
      if (rM)  return { lower: parseFloat(rM[1]), upper: parseFloat(rM[2]) };
      if (ltM) return { upper: parseFloat(ltM[1]) };
      if (gtM) return { lower: parseFloat(gtM[1]) };
      return null;
    }
    function _itemsToGrad(items, field) {
      if (items.length < 2) return null;
      const cats = []; let prev = 0;
      for (const item of items) {
        const t = _parseThresh(item.label);
        if (!t) continue;
        const lower = t.lower ?? prev;
        const upper = t.upper ?? Infinity;
        cats.push({ lower, upper, color: item.color, rawColor: item.rawColor, label: item.label, value: item.label });
        if (upper !== Infinity) prev = upper;
      }
      return cats.length >= 2 ? { type: 'graduatedSymbol', field, categories: cats } : null;
    }

    // Extraire les fonctions de palette JS + résoudre leurs champs
    const colorScaleFns = extractColorScaleFns(html);
    const colorFnFields = resolveColorFnFields(html, colorScaleFns);

    // Associer chaque palette à flood (polygon) ou building (point)
    // Heuristique 1 : nom de la fonction
    // Heuristique 2 : ordre d'apparition (1re = flood, 2e = building)
    const fnList = Object.entries(colorScaleFns);
    for (const [fnName, fnStyle] of fnList) {
      const lname = fnName.toLowerCase();
      const field  = colorFnFields[fnName];
      const isFloodFn = /flood|water|inond|pluie|submers/.test(lname);
      const isBuildFn = /build|bati|bld|point|struct|hab|logement/.test(lname);
      if (isFloodFn && !inferredStyles.floodStyle) {
        inferredStyles.floodStyle = { ...fnStyle, field: field || 'ht_max' };
      } else if (isBuildFn && !inferredStyles.buildingStyle) {
        inferredStyles.buildingStyle = { ...fnStyle, field: field || 'max_water_height' };
      }
    }
    // Heuristique 2 : par ordre si aucun nom reconnu
    if (!inferredStyles.floodStyle && fnList.length >= 1) {
      const [fn, st] = fnList[0];
      inferredStyles.floodStyle = { ...st, field: colorFnFields[fn] || 'ht_max' };
    }
    if (!inferredStyles.buildingStyle && fnList.length >= 2) {
      const [fn, st] = fnList[1];
      inferredStyles.buildingStyle = { ...st, field: colorFnFields[fn] || 'max_water_height' };
    }

    // Sauvegarder les noms de champs AVANT le swap colorimétrique éventuel.
    // Le swap échangerait aussi les field names : si on lisait inferredStyles.floodStyle?.field
    // après le swap, on obtiendrait le nom de champ du style bâtiment (contamination).
    const _preSwapFloodField    = inferredStyles.floodStyle?.field    || 'ht_max';
    const _preSwapBuildingField = inferredStyles.buildingStyle?.field || 'max_water_height';

    // ── Correction par chaleur colorimétrique (appliquée dès l'assignation initiale) ──────────────
    // flood = froid (bleu/cyan), building = chaud (jaune/orange/rouge)
    // Plus fiable que les noms de fonctions ou l'ordre d'apparition.
    // BigQgisMCP appelle les fonctions couleur depuis applyWaterLevel() et NON depuis L.geoJSON(),
    // ce qui rend findColorFnCallerVars incapable de les résoudre par varName→geomType.
    if (inferredStyles.floodStyle?.categories?.length >= 2 && inferredStyles.buildingStyle?.categories?.length >= 2) {
      function _initAvgWarmth(cats) {
        let s = 0, n = 0;
        for (const c of cats) {
          const h = (c.color || '').replace('#', '');
          if (h.length < 6) continue;
          s += parseInt(h.slice(0, 2), 16) - parseInt(h.slice(4, 6), 16); // R − B
          n++;
        }
        return n > 0 ? s / n : 0;
      }
      const wF = _initAvgWarmth(inferredStyles.floodStyle.categories);
      const wB = _initAvgWarmth(inferredStyles.buildingStyle.categories);
      L.log(`[Palette init] floodStyle warmth=${wF.toFixed(1)}  buildingStyle warmth=${wB.toFixed(1)}`);
      L.log(`[Palette init] floodStyle colors:`, inferredStyles.floodStyle.categories.map(c => c.color));
      L.log(`[Palette init] buildingStyle colors:`, inferredStyles.buildingStyle.categories.map(c => c.color));
      if (wF > wB) {
        // floodStyle est plus chaud que buildingStyle → ils sont inversés → swap
        L.warn('[Palette init] SWAP détecté par chaleur colorimétrique');
        const tmp = inferredStyles.floodStyle;
        inferredStyles.floodStyle    = inferredStyles.buildingStyle;
        inferredStyles.buildingStyle = tmp;
      } else {
        L.log('[Palette init] Ordre OK (flood froid, building chaud)');
      }
    }

    // Source de vérité : items de légende HTML (couleurs + seuils tels qu'affichés à l'utilisateur)
    // Priorité sur les fonctions JS parsées, qui peuvent être inexactes ou inversées.
    // Les noms de champs résolus par le parsing JS sont conservés quand disponibles.
    //
    // IMPORTANT : dans BigQgisMCP, les items swatch de la légende incluent DEUX groupes distincts :
    //   1. Items flood (bleu froid)   → floodStyle  (polygones d'inondation)
    //   2. Items building (chaud)     → buildingStyle (bâtiments exposés)
    // On sépare les deux par chaleur colorimétrique (R−B) pour éviter de mélanger les gradients.
    function _itemWarmth(item) {
      const h = (item.color || '').replace('#', '');
      if (h.length < 6) return 0;
      return parseInt(h.slice(0, 2), 16) - parseInt(h.slice(4, 6), 16); // R − B
    }
    const allPolyItems  = legendItems.filter(i => !i.circle && _parseThresh(i.label));
    const coldPolyItems = allPolyItems.filter(i => _itemWarmth(i) <= 20);  // bleu/froid → flood
    const warmPolyItems = allPolyItems.filter(i => _itemWarmth(i) >  20);  // chaud → bâtiments
    // Fallback : si séparation échoue (tout est froid ou tout est chaud), prendre la première moitié/seconde moitié
    const _floodItems    = coldPolyItems.length >= 2 ? coldPolyItems
                         : allPolyItems.slice(0, Math.ceil(allPolyItems.length / 2));
    const _buildingItems = warmPolyItems.length >= 2 ? warmPolyItems
                         : allPolyItems.slice(Math.ceil(allPolyItems.length / 2));
    if (_floodItems.length >= 2) {
      const ls = _itemsToGrad(_floodItems, _preSwapFloodField);
      if (ls) inferredStyles.floodStyle = ls;
    }
    if (_buildingItems.length >= 2) {
      const ls = _itemsToGrad(_buildingItems, _preSwapBuildingField);
      if (ls) inferredStyles.buildingStyle = ls;
    }

    // ── Titre et unité du slider ──────────────────────────────────────────────
    // Chercher dans les strings JS du HTML source : les fichiers BigQgisMCP ont souvent
    // un texte du style "Hauteur d'eau simulée" ou "Water depth" près du slider.
    let sliderTitle = null, sliderUnit = '';
    // Pattern 1 : texte après l'élément slider-title ou slider-label
    const sTitleM = html.match(/id=['"]slider-title['"][^>]*>([\s\S]{4,80}?)<\//)
                 || html.match(/class=['"][^'"]*slider-title[^'"]*['"][^>]*>([\s\S]{4,80}?)<\//);
    if (sTitleM) sliderTitle = sTitleM[1].replace(/<[^>]+>/g, '').replace(/\\n|\\t/g, ' ').trim();
    // Pattern 2 : chercher dans les strings littérales JS (bigQgis génère le titre via JS)
    if (!sliderTitle) {
      const jsStrM = html.match(/slider[_-]?(?:title|label)['"]\s*[,)]\s*['"]([^'"]{4,80})['"]/i)
                  || html.match(/\.innerHTML\s*=\s*['"]([A-ZÀ-Ÿa-zà-ÿ][^'"]{4,60})['"]/);
      if (jsStrM) sliderTitle = jsStrM[1].trim();
    }
    // Unité : pattern .toFixed(1) + ' m' ou + 'm' courant dans BigQgisMCP
    const unitM = html.match(/\.toFixed\(\d\)\s*\+\s*['"](\s*[a-zA-Z°%]{1,5})['"]/);
    if (unitM) sliderUnit = unitM[1].trim();

    const interactiveMap = (html.includes('slider-panel') || html.includes('stats-panel'))
      ? (html.includes('price_m2') || html.includes('temporal') || html.includes('year-slider') ? 'temporal' : 'flood')
      : null;

    return { title, subtitle, legendItems, sliderMin, sliderMax, statsTitle, source,
             sliderTitle, sliderUnit, interactiveMap,
             inferredStyles, colorScaleFns, colorFnFields };
  }

  // Extrait les styles depuis le HTML : qgis2web (style_*) ET BigQgisMCP (L.geoJSON mapping)
  function extractQgis2webStyles(html) {
    const styles = {};
    const allFns = {}; // fnName → parsed style

    // ── Étape 1 : parser TOUTES les fonctions nommées qui prennent feature ──
    const fnRx = /function\s+(\w+)\s*\(\s*feature\b[^)]*\)/g;
    let m;
    while ((m = fnRx.exec(html)) !== null) {
      const fnName = m[1];
      const bodyStart = html.indexOf('{', m.index + m[0].length);
      if (bodyStart < 0) continue;
      let depth = 1, i = bodyStart + 1;
      while (i < html.length && depth > 0) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}') depth--;
        i++;
      }
      const body = html.slice(bodyStart + 1, i - 1);
      if (!body.includes('color') && !body.includes('Color')) continue;
      const parsed = parseQgis2webStyleBody(body);
      if (parsed) allFns[fnName] = parsed;
    }

    // ── Étape 2 : style_* standard qgis2web → exposer directement ──
    for (const [fn, parsed] of Object.entries(allFns)) {
      if (/^style_/.test(fn)) styles[fn] = parsed;
    }

    // ── Étape 3 : L.geoJSON(varName, { style: func | function(feature){} }) ──
    const geoRx = /L\.(?:geoJson|geoJSON)\s*\(\s*(\w+)\s*,\s*\{/g;
    let gm;
    while ((gm = geoRx.exec(html)) !== null) {
      const dataVar = gm[1];
      const optsStart = gm.index + gm[0].length - 1;
      let depth = 1, i = optsStart + 1;
      while (i < html.length && depth > 0) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}') depth--;
        i++;
      }
      const opts = html.slice(optsStart + 1, i - 1);

      // Référence à une fonction nommée : style: funcName
      const styleRef = opts.match(/\bstyle\s*:\s*(\w+)\b/);
      if (styleRef && allFns[styleRef[1]]) {
        styles[`__var_${dataVar}`] = allFns[styleRef[1]];
        continue;
      }
      // Fonction inline : style: function(feature) { ... }
      const inlineIdx = opts.search(/\bstyle\s*:\s*function\s*\(/);
      if (inlineIdx >= 0) {
        const fnBodyStart = opts.indexOf('{', inlineIdx);
        if (fnBodyStart >= 0) {
          let d = 1, j = fnBodyStart + 1;
          while (j < opts.length && d > 0) {
            if (opts[j] === '{') d++;
            else if (opts[j] === '}') d--;
            j++;
          }
          const body = opts.slice(fnBodyStart + 1, j - 1);
          const parsed = parseQgis2webStyleBody(body);
          if (parsed) styles[`__var_${dataVar}`] = parsed;
        }
      }

      // ── pointToLayer : pour les couches points (BigQgisMCP circleMarker) ──
      if (!styles[`__var_${dataVar}`]) {
        // Référence nommée : pointToLayer: funcName
        const ptlRef = opts.match(/\bpointToLayer\s*:\s*(\w+)\b/);
        if (ptlRef && allFns[ptlRef[1]]) {
          styles[`__var_${dataVar}`] = allFns[ptlRef[1]];
        } else {
          // Inline : pointToLayer: function(feature, latlng) { ... }
          const ptlIdx = opts.search(/\bpointToLayer\s*:\s*function\s*\(/);
          if (ptlIdx >= 0) {
            const ptlBodyStart = opts.indexOf('{', ptlIdx);
            if (ptlBodyStart >= 0) {
              let d = 1, j = ptlBodyStart + 1;
              while (j < opts.length && d > 0) {
                if (opts[j] === '{') d++;
                else if (opts[j] === '}') d--;
                j++;
              }
              const ptlBody = opts.slice(ptlBodyStart + 1, j - 1);
              const parsed = parseQgis2webStyleBody(ptlBody);
              if (parsed) styles[`__var_${dataVar}`] = parsed;
            }
          }
        }
      }
    }

    return styles;
  }

  function deriveLayerNameFromVar(varName) {
    // json_Layer_Name_0 → "Layer Name"
    // FLOOD_JSON → "Flood"   BUILDINGS_JSON → "Buildings"
    let name = varName
      .replace(/^json_/i, '')   // qgis2web prefix
      .replace(/_JSON$/i, '')   // BigQgisMCP suffix
      .replace(/_Data$/i, '')   // common suffix
      .replace(/_\d+$/, '')    // trailing index
      .replace(/_/g, ' ')
      .trim();
    // Title-case
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() || varName;
  }

  function findMatchingBrace(str) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (escape) { escape = false; continue; }
      if (c === '\\' && inString) { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
  }

  // ══════════════════════════════════════════════════════════════
  // PARSER: qgis2web ZIP
  // ══════════════════════════════════════════════════════════════
  async function parseQgis2webZip(zip, deps) {
    const d = _resolve(deps);
    const names = Object.keys(zip.files);
    const layers = [];

    // Fichiers JS de données : dossier layers/ ou data/ (deux variantes qgis2web)
    const layerJsFiles = names.filter(n =>
      /layers.*\.js$/i.test(n) ||
      /\blayers\b.*\.js$/i.test(n) ||
      /(?:^|\/)data\/[^/]+\.js$/i.test(n)
    );
    // Also check for individual GeoJSON
    const geojsonFiles = names.filter(n => n.endsWith('.geojson'));

    // Read layer JS files
    for (const fn of layerJsFiles) {
      d.setReadingLabel('Lecture des couches…', fn.split('/').pop());
      const content = await zip.files[fn].async('string');
      const htmlLayers = await parseQgis2webHtml(content, deps);
      // Avoid duplicates
      for (const l of htmlLayers) {
        if (!layers.find(x => x.name === l.name)) layers.push(l);
      }
    }

    // Individual GeoJSON files
    if (geojsonFiles.length > 0) {
      const geojsonLayers = await parseGeojsonFiles(zip, geojsonFiles, deps);
      for (const l of geojsonLayers) {
        if (!layers.find(x => x.name === l.name)) layers.push(l);
      }
    }

    // Fallback: read index.html
    if (layers.length === 0) {
      const indexEntry = names.find(n => n.endsWith('index.html'));
      if (indexEntry) {
        const html = await zip.files[indexEntry].async('string');
        const htmlLayers = await parseQgis2webHtml(html, deps);
        layers.push(...htmlLayers);
      }
    }

    return layers;
  }

  // ══════════════════════════════════════════════════════════════
  // PARSER: GeoJSON files in ZIP
  // ══════════════════════════════════════════════════════════════
  async function parseGeojsonFiles(zip, fileNames, deps) {
    const d = _resolve(deps);
    const buildLayerFromGeojson = _need(d.buildLayerFromGeojson, 'buildLayerFromGeojson');
    const layers = [];
    for (const fn of fileNames) {
      d.setReadingLabel('Lecture GeoJSON…', fn.split('/').pop());
      const content = await zip.files[fn].async('string');
      try {
        const geojson = JSON.parse(content);
        if (geojson.type === 'FeatureCollection') {
          const name = fn.split('/').pop().replace(/\.(geojson|json)$/i, '').replace(/_/g, ' ');
          layers.push(buildLayerFromGeojson(name, geojson));
        }
      } catch(e) { /* malformed json */ }
    }
    return layers;
  }

  return {
    configure,
    parseZipFile,
    parseQgis2webHtml,
    parseQgis2webHtmlWithMeta,
    parseQgis2webZip,
    parseGeojsonFiles,
    rgbaCssToHex,
    parseQgis2webStyleBody,
    extractColorScaleFns,
    resolveColorFnFields,
    findColorFnCallerVars,
    fixPalettesByLegend,
    extractBigQgisMcpMeta,
    extractQgis2webStyles,
    deriveLayerNameFromVar,
    findMatchingBrace,
  };
});
