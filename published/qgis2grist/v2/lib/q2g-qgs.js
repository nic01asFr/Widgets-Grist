/**
 * Q2GQgs - lecture des projets QGIS (.qgz / .qgs) vers un schema de couches.
 *
 * Extrait de index_v2.html. Les fonctions gardent leur nom et leur signature
 * d'origine ; un parametre final optionnel `deps` permet d'injecter les
 * dependances externes (aucun acces implicite au DOM ni a window).
 *
 * Dependances (toutes optionnelles, resolues dans l'ordre : deps explicite,
 * configure(), global, module frere charge par require() sous Node) :
 *   parseXml(text) -> Document        repli : new globalThis.DOMParser()
 *   JSZip                             repli : globalThis.JSZip
 *   readGpkgWithSqlJs(ab, tableHint)  alias accepte : parseGpkgFile
 *   detectGeomTypeFromFeatures(features)
 *   flattenGeoJsonFeatures(features, fields, geomType)
 *   sanitizeTableName(name), sanitizeColName(name)   repli : Q2GSchema
 *   gpkgDs     (Q2GGpkgDs.resolveGpkgTableHint)
 *   qmlParser  (Q2GQmlParser.parseMapLayerStyle / parseQmlStyle)
 *   geomReconcile (Q2GGeomReconcile.reconcileLayerGeometry)
 *   setReadingLabel(label, step)      repli : sans effet
 *   yieldToUi()                       repli : setTimeout 0
 *
 * Usage : Q2GQgs.configure({ ... }) une fois, ou passer deps en dernier argument.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Q2GQgs = api;
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

  function _pick(name) {
    for (let i = 1; i < arguments.length; i++) {
      if (arguments[i] != null) return arguments[i];
    }
    return null;
  }

  function _resolve(deps) {
    const d = Object.assign({}, _defaults, deps || {});
    const g = root || {};
    const schema = _pick('schema', d.schema, g.Q2GSchema, _tryRequire('./q2g-schema.js')) || {};
    const gpkg = _pick('gpkg', d.gpkg, g.Q2GGpkg, _tryRequire('./q2g-gpkg.js')) || {};
    const geometry = _pick('geometry', d.geometry, g.Q2GGeometry, _tryRequire('./q2g-geometry.js')) || {};
    const imp = _pick('import', d.import, g.Q2GImport, _tryRequire('./q2g-import.js')) || {};
    return {
      parseXml: d.parseXml || null,
      JSZip: _pick('JSZip', d.JSZip, g.JSZip),
      readGpkg: _pick('readGpkg', d.readGpkgWithSqlJs, d.parseGpkgFile,
        gpkg.readGpkgWithSqlJs, g.readGpkgWithSqlJs),
      detectGeomTypeFromFeatures: _pick('detect', d.detectGeomTypeFromFeatures,
        schema.detectGeomTypeFromFeatures, geometry.detectGeomTypeFromFeatures,
        imp.detectGeomTypeFromFeatures, g.detectGeomTypeFromFeatures),
      flattenGeoJsonFeatures: _pick('flatten', d.flattenGeoJsonFeatures,
        schema.flattenGeoJsonFeatures, geometry.flattenGeoJsonFeatures,
        imp.flattenGeoJsonFeatures, g.flattenGeoJsonFeatures),
      sanitizeTableName: (n) => _need(_pick('stn', d.sanitizeTableName,
        schema.sanitizeTableName, g.sanitizeTableName), 'sanitizeTableName')(n),
      sanitizeColName: (n) => _need(_pick('scn', d.sanitizeColName,
        schema.sanitizeColName, g.sanitizeColName), 'sanitizeColName')(n),
      gpkgDs: _pick('gpkgDs', d.gpkgDs, g.Q2GGpkgDs, _tryRequire('./gpkg-datasource.js')),
      qmlParser: _pick('qml', d.qmlParser, g.Q2GQmlParser, _tryRequire('./qml-style-parser.js')),
      geomReconcile: _pick('gr', d.geomReconcile, g.Q2GGeomReconcile, _tryRequire('./geom-reconcile.js')),
      setReadingLabel: d.setReadingLabel || function () {},
      yieldToUi: d.yieldToUi || function () { return new Promise((r) => setTimeout(r, 0)); },
    };
  }

  function _need(value, name) {
    if (!value) throw new Error('Q2GQgs : dependance manquante (' + name + ').');
    return value;
  }

  function _parseXmlDoc(xmlText, R) {
    if (R.parseXml) return R.parseXml(xmlText);
    const DP = root && root.DOMParser;
    if (!DP) throw new Error('Q2GQgs : dependance manquante (parseXml ou DOMParser).');
    return new DP().parseFromString(xmlText, 'text/xml');
  }

  // ── Lecture du QGZ ───────────────────────────────────────────

  async function parseQgzFile(arrayBuffer, parentZip, qgzName, deps) {
    const R = _resolve(deps);
    const JSZipLib = _need(R.JSZip, 'JSZip');
    const qgzZip = await JSZipLib.loadAsync(arrayBuffer);
    const names = Object.keys(qgzZip.files);

    // Find .qgs XML
    const qgsEntry = names.find(n => n.endsWith('.qgs'));
    if (!qgsEntry) throw new Error('Fichier .qgs non trouvé dans le QGZ.');

    R.setReadingLabel('Lecture du XML QGIS…', qgsEntry);
    const qgsXml = await qgzZip.files[qgsEntry].async('string');

    // Check for embedded GPKG data
    const gpkgFiles = names.filter(n => n.endsWith('.gpkg'));
    const geojsonFiles = names.filter(n => n.endsWith('.geojson'));

    const combinedZip = qgzZip;
    // Si parentZip (paquet QField), acces aux fichiers externes
    const externalZip = parentZip;

    return parseQgsXml(qgsXml, combinedZip, externalZip, gpkgFiles, geojsonFiles, deps);
  }

  // ── QGS XML -> schema de couches ─────────────────────────────

  async function parseQgsXml(xmlText, internalZip, externalZip, gpkgFiles, geojsonFiles, deps) {
    const R = _resolve(deps);
    const doc = _parseXmlDoc(xmlText, R);
    const layers = [];
    const gpkgBufferCache = new Map(); // évite de re-extraire le même .gpkg par couche

    const mapLayers = doc.querySelectorAll('maplayer[type="vector"]');
    R.setReadingLabel('Analyse des couches QGIS…', `${mapLayers.length} couche(s) trouvée(s)`);

    // Index layerId → maplayer (pour résoudre les ValueRelation et <relations>)
    const layerIdMap = {};
    for (const ml of mapLayers) {
      const id = ml.querySelector('id')?.textContent?.trim();
      if (id) layerIdMap[id] = ml;
    }

    for (const ml of mapLayers) {
      await R.yieldToUi(); // laisser l'UI respirer entre couches
      const name = ml.querySelector('layername')?.textContent?.trim() || 'Couche';
      const layerId = ml.querySelector('id')?.textContent?.trim() || '';
      const geomAttr = ml.getAttribute('geometry') || '';
      const datasource = ml.querySelector('datasource')?.textContent?.trim() || '';
      const geomType = normalizeGeomType(geomAttr, ml);

      // Extract fields from <fields> or <fieldConfiguration>
      const fields = extractFieldsFromXml(ml, deps);

      let features = [];
      let featuresLoaded = false;

      // GeoJSON d'abord (rapide)
      const baseName = datasource.split('/').pop().replace(/\..*$/, '').toLowerCase();
      if (geojsonFiles && geojsonFiles.length > 0) {
        const gjMatch = geojsonFiles.find(n => n.toLowerCase().includes(baseName));
        if (gjMatch) {
          const zip = internalZip || externalZip;
          if (zip && zip.files[gjMatch]) {
            const content = await zip.files[gjMatch].async('string');
            try {
              const fc = JSON.parse(content);
              if (fc.type === 'FeatureCollection') {
                features = fc.features;
                featuresLoaded = true;
              }
            } catch (e) { /* json invalide : on retombe sur le GPKG */ }
          }
        }
      }

      // GPKG — cherche dans le QGZ d'abord, puis dans le ZIP parent
      // (cas : ZIP contenant un .qgz + des .gpkg côte à côte)
      const gpkgCandidates = [
        ...(gpkgFiles || []).map(n => ({ name: n, zip: internalZip })),
        ...(externalZip
          ? Object.keys(externalZip.files)
              .filter(n => n.endsWith('.gpkg'))
              .map(n => ({ name: n, zip: externalZip }))
          : [])
      ];
      if (!featuresLoaded && gpkgCandidates.length > 0) {
        const match = gpkgCandidates.find(s => s.name.toLowerCase().includes(baseName))
                   || (gpkgCandidates.length === 1 ? gpkgCandidates[0] : null);
        if (match && match.zip && match.zip.files[match.name]) {
          R.setReadingLabel('Lecture GPKG…', match.name.split('/').pop() + ' → ' + name);
          try {
            let gpkgAb = gpkgBufferCache.get(match.name);
            if (!gpkgAb) {
              gpkgAb = await match.zip.files[match.name].async('arraybuffer');
              gpkgBufferCache.set(match.name, gpkgAb);
            }
            const gpkgTableHint = _need(R.gpkgDs, 'gpkgDs').resolveGpkgTableHint(name, datasource);
            const gpkgFeatures = await _need(R.readGpkg, 'readGpkgWithSqlJs')(gpkgAb, gpkgTableHint);
            if (gpkgFeatures && gpkgFeatures.length > 0) {
              features = gpkgFeatures;
              featuresLoaded = true;
            }
          } catch (e) {
            console.warn('GPKG read failed:', e.message);
          }
        }
      }

      // Style depuis le renderer-v2 (catégorisé / gradué / symbole unique)
      let style = null;
      try {
        style = _need(R.qmlParser, 'qmlParser').parseMapLayerStyle(ml);
      } catch (e) { console.warn('[parseQgsXml] Style extraction failed for', name, e); }

      const reconciled = _need(R.geomReconcile, 'geomReconcile').reconcileLayerGeometry(
        geomType, fields, features, featuresLoaded,
        _need(R.detectGeomTypeFromFeatures, 'detectGeomTypeFromFeatures'),
        _need(R.flattenGeoJsonFeatures, 'flattenGeoJsonFeatures')
      );

      layers.push({
        name: R.sanitizeTableName(name),
        displayName: name,
        geomType: reconciled.geomType,
        fields: reconciled.fields,
        features: reconciled.rows,
        featureCount: featuresLoaded ? features.length : 0,
        hasData: featuresLoaded,
        datasource,
        style,
        _layerId: layerId,
        _formFieldOrder: parseFormFieldOrder(ml),
      });
    }

    // Couches raster seules : rien d'importable
    const rasterLayers = doc.querySelectorAll('maplayer[type="raster"]');
    if (rasterLayers.length > 0 && layers.length === 0) {
      throw new Error(`Ce projet ne contient que des couches raster (${rasterLayers.length}). Aucune couche vecteur importable.`);
    }

    // Index layerId → tableName Grist pour résoudre les Refs
    const layerIdToTable = {};
    for (const l of layers) layerIdToTable[l._layerId] = l.name;

    // 1. <relations> : Ref:<ParentTable> sur la table enfant
    applyQgsRelations(doc, layers, layerIdToTable, deps);

    // 2. ValueRelation : marqueurs _refTarget -> Ref:<table>
    applyValueRelationRefs(layers, layerIdToTable);

    return layers;
  }

  // Lit <relations> au niveau projet et marque les colonnes correspondantes.
  // referencingLayer.referencingField -> referencedLayer.referencedField :
  // la colonne référençante devient Ref:<TargetTable>.
  function applyQgsRelations(doc, layers, layerIdToTable, deps) {
    const R = _resolve(deps);
    const rels = doc.querySelectorAll('relations > relation');
    for (const rel of rels) {
      const refingLayer  = rel.getAttribute('referencingLayer');
      const refedLayer   = rel.getAttribute('referencedLayer');
      const fieldRef     = rel.querySelector('fieldRef');
      if (!fieldRef) continue;
      const refingField  = fieldRef.getAttribute('referencingField');
      const refedField   = fieldRef.getAttribute('referencedField');
      const targetTable  = layerIdToTable[refedLayer];
      if (!targetTable) continue; // référence vers couche raster ou non-importée

      const childLayer = layers.find(l => l._layerId === refingLayer);
      if (!childLayer) continue;
      const sanitizedFkName = R.sanitizeColName(refingField);
      const fkField = childLayer.fields.find(f => f.name === sanitizedFkName);
      if (!fkField) continue;

      fkField.gType = 'Ref:' + targetTable;
      fkField._refTargetTable = targetTable;
      fkField._refTargetField = refedField;
      fkField._isQgsRelation = true;
    }
  }

  // ValueRelation : config.Layer pointe sur un layer id, on traduit en Ref.
  // La valeur STOCKÉE dans la cellule enfant est target.Key (ex: insee),
  // pas target.Value (libellé affiché) ; l'index parent se construit sur Key.
  function applyValueRelationRefs(layers, layerIdToTable) {
    for (const layer of layers) {
      for (const f of layer.fields) {
        if (!f._refTarget || typeof f._refTarget !== 'object') continue;
        const target = f._refTarget;
        const targetLayerId = target?.Layer;
        const targetTable   = targetLayerId ? layerIdToTable[targetLayerId] : null;
        if (!targetTable) continue;
        const isMulti = target.AllowMulti === true;
        f.gType = (isMulti ? 'RefList:' : 'Ref:') + targetTable;
        f._refTargetTable = targetTable;
        f._refTargetField = target.Key || target.Value;
      }
    }
  }

  // ── Helpers XML ──────────────────────────────────────────────

  function normalizeGeomType(geomAttr, ml) {
    const g = (geomAttr || '').toLowerCase();
    if (g === 'none' || g === 'no geometry' || g === 'nogeometry') return 'No geometry';
    if (g.includes('point')) return 'Point';
    if (g.includes('line')) return 'Line';
    if (g.includes('polygon') || g.includes('surface')) return 'Polygon';
    // Essai via l'attribut wkbType
    const wkb = ml.getAttribute('wkbType') || '';
    if (wkb.includes('Point')) return 'Point';
    if (wkb.includes('Line')) return 'Line';
    if (wkb.includes('Polygon')) return 'Polygon';
    return 'Point'; // défaut
  }

  function extractFieldsFromXml(ml, deps) {
    const R = _resolve(deps);
    const fields = [];
    const seen = new Set();

    // 1. Aliases (libellés humains)
    const aliasMap = parseAliases(ml);
    // 2. Edit-widgets (ValueMap, Range, CheckBox, DateTime, ExternalResource, ValueRelation…)
    const widgetMap = parseEditWidgets(ml);

    const fieldEls = ml.querySelectorAll('fields > field, fieldConfiguration > field');
    for (const f of fieldEls) {
      const name = f.getAttribute('name') || f.getAttribute('id') || '';
      if (!name || seen.has(name) || name.startsWith('_')) continue;
      seen.add(name);

      const typeName = (f.getAttribute('typeName') || f.getAttribute('type') || 'String').toLowerCase();
      const gType = qgsTypeToGrist(typeName);
      // _rawKey : clé d'accès brute dans les properties GeoJSON (séparée du label
      // affiché qui peut être surchargé par un alias QGIS humain).
      const field = { name: R.sanitizeColName(name), _rawKey: name,
                      label: aliasMap[name] || name, qType: typeName, gType };
      enrichFieldFromWidget(field, widgetMap[name]);
      fields.push(field);
    }

    // Repli : aliases seuls (couches sans <fields> explicites)
    if (fields.length === 0) {
      for (const [name, alias] of Object.entries(aliasMap)) {
        if (seen.has(name)) continue;
        seen.add(name);
        const field = { name: R.sanitizeColName(name), _rawKey: name,
                        label: alias || name, qType: 'string', gType: 'Text' };
        enrichFieldFromWidget(field, widgetMap[name]);
        fields.push(field);
      }
    }

    return fields;
  }

  // Lit <aliases><alias field="..." name="..."/>
  function parseAliases(ml) {
    const map = {};
    for (const a of ml.querySelectorAll('aliases > alias')) {
      const f = a.getAttribute('field');
      const n = a.getAttribute('name');
      if (f && n) map[f] = n;
    }
    return map;
  }

  // Ordre des champs depuis attributeEditorForm (layout QField)
  function parseFormFieldOrder(ml) {
    const order = [];
    const form = ml.querySelector('attributeEditorForm');
    if (!form) return order;
    function walk(node) {
      for (const child of node.children) {
        const tag = child.tagName.replace(/^.*:/, '');
        if (tag === 'attributeEditorField') {
          const name = child.getAttribute('name');
          if (name) order.push(name);
        } else if (tag === 'attributeEditorContainer' || tag === 'attributeEditorForm') {
          walk(child);
        }
      }
    }
    walk(form);
    return order;
  }

  // Lit <fieldConfiguration><field name="..."><editWidget type="..."><config>…
  // Retourne { fieldName: { type, options } } (options = arbre Option parsé).
  function parseEditWidgets(ml) {
    const map = {};
    for (const f of ml.querySelectorAll('fieldConfiguration > field')) {
      const fname = f.getAttribute('name');
      if (!fname) continue;
      const w = f.querySelector('editWidget');
      if (!w) continue;
      const type = w.getAttribute('type');
      if (!type) continue;
      map[fname] = { type, options: parseOptionTree(w.querySelector('config')) };
    }
    // QGIS 2.x : <edittypes><edittype widgetv2type="..." name="...">
    for (const et of ml.querySelectorAll('edittypes > edittype')) {
      const fname = et.getAttribute('name');
      const type = et.getAttribute('widgetv2type');
      if (!fname || !type || map[fname]) continue;
      map[fname] = { type, options: parseOptionTree(et.querySelector('widgetv2config') || et) };
    }
    return map;
  }

  // Convertit récursivement la sérialisation QGIS <Option type="Map|List|...">
  // en objet JS (QgsXmlUtils::writeVariant).
  function parseOptionTree(el) {
    if (!el) return null;
    // QGIS imbrique systématiquement un <Option type="Map"> racine sans nom sous <config> :
    // on déplie ce wrapper pour exposer directement la map utile.
    if (el.tagName !== 'Option') {
      const onlyChildren = [...el.children].filter(c => c.tagName === 'Option');
      if (onlyChildren.length === 1 && onlyChildren[0].getAttribute('type') === 'Map'
          && !onlyChildren[0].getAttribute('name')) {
        return parseOptionTree(onlyChildren[0]);
      }
    }
    // Cas simple : <Option name="X" value="Y" type="QString|int|double|bool"/>
    const t = el.getAttribute('type');
    const value = el.getAttribute('value');
    if (value !== null && t && t !== 'Map' && t !== 'List') {
      return coerceOptionValue(value, t);
    }
    if (t === 'List') {
      return [...el.children].filter(c => c.tagName === 'Option').map(parseOptionTree);
    }
    // Map ou élément racine : aplatir les enfants Option en clé/valeur
    const result = {};
    for (const child of el.children) {
      if (child.tagName !== 'Option') continue;
      const cn = child.getAttribute('name');
      const ct = child.getAttribute('type');
      const cv = child.getAttribute('value');
      if (ct === 'Map' || ct === 'List') {
        // Maps anonymes conservées pour ne pas perdre d'information ; dépliées
        // au cas par cas dans enrichFieldFromWidget si nécessaire.
        if (cn) result[cn] = parseOptionTree(child);
        else Object.assign(result, parseOptionTree(child) || {});
      } else if (cn) {
        result[cn] = cv !== null ? coerceOptionValue(cv, ct) : parseOptionTree(child);
      }
    }
    return result;
  }

  function coerceOptionValue(v, type) {
    if (type === 'int' || type === 'qlonglong') { const n = parseInt(v, 10); return isNaN(n) ? v : n; }
    if (type === 'double') { const n = parseFloat(v); return isNaN(n) ? v : n; }
    if (type === 'bool') return v === 'true' || v === '1';
    return v;
  }

  // Mappe un edit-widget QGIS -> enrichissement du champ Grist.
  // Mute le champ en place (gType, widgetOptions, marqueurs).
  function enrichFieldFromWidget(field, widget) {
    if (!widget) return;
    const { type, options } = widget;
    switch (type) {
      case 'ValueMap': {
        // QGIS 3 récent : config.map = [ {label1: val1}, {label2: val2}, ... ]
        // QGIS 3 ancien / 2.x : config.map = { label1: val1, label2: val2 }
        const raw = options?.map ?? options;
        const choices = [];
        const valueToLabel = {};
        const collect = (label, val) => {
          if (label == null || label === '_') return;
          const lbl = String(label);
          if (!choices.includes(lbl)) choices.push(lbl);
          valueToLabel[String(val)] = lbl;
        };
        if (Array.isArray(raw)) {
          for (const item of raw) {
            if (!item || typeof item !== 'object') continue;
            for (const [lbl, v] of Object.entries(item)) collect(lbl, v);
          }
        } else if (raw && typeof raw === 'object') {
          for (const [lbl, v] of Object.entries(raw)) {
            if (lbl === '_') continue;
            collect(lbl, v);
          }
        }
        if (choices.length) {
          field.gType = 'Choice';
          field.widgetOptions = JSON.stringify({ choices });
          field._valueMap = valueToLabel; // utilisé pour transformer les valeurs à l'import
        }
        break;
      }
      case 'CheckBox':
        field.gType = 'Bool';
        break;
      case 'Range': {
        // Step entier -> Int sinon Numeric
        const step = options?.Step;
        const prec = options?.Precision;
        field.gType = (Number.isInteger(step) && (prec == null || prec === 0)) ? 'Int' : 'Numeric';
        if (options?.Min != null) field._rangeMin = +options.Min;
        if (options?.Max != null) field._rangeMax = +options.Max;
        break;
      }
      case 'DateTime': {
        // display_format / field_format "yyyy-MM-dd" -> Date pure
        const fmt = (options?.field_format || options?.display_format || '').toLowerCase();
        field.gType = (fmt && !fmt.includes('h') && !fmt.includes('m') && !fmt.includes('s')) ? 'Date' : 'DateTime';
        break;
      }
      case 'ExternalResource':
        // Marqueur pour la passe Attachments ; en attendant on garde Text (chemin)
        field._externalResource = options || true;
        break;
      case 'ValueRelation':
      case 'RelationReference':
        // Marqueur pour la passe Ref:Table ; en attendant on garde le type de base
        field._refTarget = options || true;
        break;
      case 'UuidGenerator':
      case 'TextEdit':
      case 'Hidden':
      case 'Color':
      case 'JsonEdit':
      default:
        // Text par défaut, déjà fixé par qgsTypeToGrist
        break;
    }
  }

  function qgsTypeToGrist(typeName) {
    const t = typeName.toLowerCase();
    if (t.includes('int') || t.includes('long')) return 'Int';
    if (t.includes('real') || t.includes('double') || t.includes('float') || t.includes('numeric')) return 'Numeric';
    if (t.includes('bool')) return 'Bool';
    // Grist accepte 'DateTime' nu (timezone du document)
    if (t.includes('date') && t.includes('time')) return 'DateTime';
    if (t.includes('date')) return 'Date';
    return 'Text';
  }

  // ── Styles QML ───────────────────────────────────────────────

  function parseQmlStyle(qmlText, deps) {
    const R = _resolve(deps);
    return _need(R.qmlParser, 'qmlParser').parseQmlStyle(qmlText);
  }

  function matchQgsRule(row, rule, layer, deps) {
    const R = _resolve(deps);
    const findField = (target) => {
      const f = layer.fields.find(x => x._rawKey === target || x.label === target || x.name === R.sanitizeColName(target));
      return f?.name || R.sanitizeColName(target);
    };
    if (rule.kind === 'eq') {
      return String(row[findField(rule.field)] ?? '') === String(rule.value);
    }
    if (rule.kind === 'range') {
      const v = parseFloat(row[findField(rule.field)]);
      return !isNaN(v) && v >= rule.lower && v < rule.upper;
    }
    return false;
  }

  return {
    configure,
    parseQgzFile,
    parseQgsXml,
    applyQgsRelations,
    applyValueRelationRefs,
    normalizeGeomType,
    extractFieldsFromXml,
    parseAliases,
    parseFormFieldOrder,
    parseEditWidgets,
    parseOptionTree,
    coerceOptionValue,
    enrichFieldFromWidget,
    qgsTypeToGrist,
    parseQmlStyle,
    matchQgsRule,
  };
});
