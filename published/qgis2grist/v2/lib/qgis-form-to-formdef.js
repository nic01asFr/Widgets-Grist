/**
 * QGIS couche (qgis2grist) → FormDef (grist_forms / offre de service).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Q2GFormDef = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SKIP_COLS = new Set([
    'geometry_json', 'centroid_lat', 'centroid_lon', 'latitude', 'longitude',
    'fill_color', 'fid', 'manualsort', 'id',
  ]);

  const BASEMAP_NAME = /^(buildings|landscape|lines|osm|basemap|fond)|(?:batiment|voirie|bati|bdtopo|fond_de_plan)/i;

  const QFIELD_GPS = /^(x|y|z|horizontal_accuracy|vertical_accuracy|nr_used_satellites|fix_status|fix_status_descr|position_locked|velocity|direction|pdop|hdop|vdop)$/i;

  function slugify(s) {
    return String(s || 'form')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'form';
  }

  function resolveLayerByTable(tableKey, importedLayerData, tableNameRemap) {
    if (!importedLayerData || !tableKey) return null;
    const remapped = tableNameRemap?.[tableKey] || tableKey;
    if (importedLayerData[remapped]) return importedLayerData[remapped];
    if (importedLayerData[tableKey]) return importedLayerData[tableKey];
    return Object.values(importedLayerData).find(l =>
      l.name === tableKey || l.name === remapped || l.displayName === tableKey
    ) || null;
  }

  /** Colonne affichée pour un Ref — 1er Texte du layout QField parent. */
  // Noms de colonnes qui portent un libelle lisible, par ordre de preference (listes de valeurs QGEP : value_fr, value_en...).
  const COLONNES_LIBELLE = ['value_fr', 'libelle', 'label', 'nom', 'name', 'value_en', 'title', 'titre', 'designation', 'description'];

  /** La colonne porte-t-elle au moins une valeur non vide dans les entites lues ? (sans donnees connues : on ne sait pas, donc oui) */
  function aDesValeurs(parent, field) {
    const feats = parent && parent.features;
    if (!Array.isArray(feats) || !feats.length) return true;
    const cles = [field._rawKey, field.name].filter(Boolean);
    for (let i = 0; i < feats.length && i < 200; i++) {
      const p = (feats[i] && (feats[i].properties || feats[i])) || {};
      for (const k of cles) { const v = p[k]; if (v !== null && v !== undefined && String(v).trim() !== '') return true; }
    }
    return false;
  }

  /**
   * La colonne qui s'affiche dans une liste deroulante : un libelle lisible (value_fr, name...) qui porte des valeurs,
   * sinon la premiere colonne texte non technique qui en porte. Une colonne vide (fid des tables QGEP) rendrait la liste
   * illisible : Grist y afficherait des numeros de ligne.
   */
  function inferVisibleCol(refTargetTable, importedLayerData, tableNameRemap) {
    const parent = resolveLayerByTable(refTargetTable, importedLayerData, tableNameRemap);
    if (!parent?.fields?.length) return null;
    const byName = {};
    for (const f of parent.fields) byName[f.name] = f;
    const technique = (n) => /^uuid$|_uuid$|^id$|_id$|^fid$/i.test(n);
    for (const n of COLONNES_LIBELLE) {
      const f = byName[n];
      if (f && f.gType === 'Text' && aDesValeurs(parent, f)) return f.name;
    }
    for (const name of (parent._formFieldOrder || [])) {
      const f = byName[name];
      if (!f || f.gType !== 'Text' || technique(f.name)) continue;
      if (aDesValeurs(parent, f)) return f.name;
    }
    for (const f of parent.fields) {
      if (f.gType !== 'Text' || technique(f.name)) continue;
      if (aDesValeurs(parent, f)) return f.name;
    }
    for (const f of parent.fields) {
      if (f.gType === 'Text' && !technique(f.name)) return f.name;
    }
    return null;
  }

  function isDuplicateIdField(field, byName) {
    const m = /^(.+)_id$/i.exec(field.name);
    if (!m) return false;
    const uuidName = m[1] + '_uuid';
    const sibling = byName[uuidName];
    if (!sibling) return false;
    return !!(sibling._refTargetTable || String(sibling.gType || '').startsWith('Ref'));
  }

  function shouldSkipField(field, byName) {
    if (SKIP_COLS.has(field.name)) return true;
    if (QFIELD_GPS.test(field.name)) return true;
    if (field.name === 'uuid' && field.gType === 'Text') return true;
    if (isDuplicateIdField(field, byName)) return true;
    return false;
  }

  /**
   * La colonne est-elle vraiment de type `Attachments` dans Grist ?
   *
   * Un champ « ressource externe » de QField ne l'implique pas : l'import
   * laisse ces colonnes en texte, ou elles portent le chemin de la photo sur
   * l'appareil (`DCIM/batiment_12.jpg`). Promettre un champ fichier sur une
   * colonne texte ferait ecrire `"[1]"` — une liste d'identifiants rendue en
   * chaine, qui ne designe rien — apres avoir efface le chemin. Le formulaire
   * montre donc ce que la colonne porte reellement, tant que l'import ne sait
   * pas creer la colonne en pieces jointes.
   */
  function estPieceJointe(field) {
    return (field.gType || 'Text') === 'Attachments';
  }

  function widgetForField(field) {
    const g = field.gType || 'Text';
    if (estPieceJointe(field)) return 'file';
    if (g === 'Bool') return 'checkbox';
    if (g === 'Choice') return 'select';
    if (g.startsWith('RefList')) return 'multiselect';
    if (g.startsWith('Ref')) return 'select';
    if (g === 'Date') return 'date';
    if (g === 'DateTime') return 'datetime';
    if (g === 'Int' || g === 'Numeric') return 'number';
    return 'text';
  }

  function gTypeForForm(field) {
    if (estPieceJointe(field)) return 'Attachments';
    const g = field.gType || 'Text';
    if (g.startsWith('RefList:')) return 'RefList';
    if (g.startsWith('Ref:')) return 'Ref';
    return g;
  }

  function buildFieldOptions(field, tableNameRemap, importedLayerData) {
    const opts = {};
    if (field.widgetOptions) {
      try {
        Object.assign(opts, typeof field.widgetOptions === 'string'
          ? JSON.parse(field.widgetOptions) : field.widgetOptions);
      } catch (e) { /* ignore */ }
    }
    if (field._refTargetTable) {
      opts.refTable = tableNameRemap?.[field._refTargetTable] || field._refTargetTable;
      const vis = inferVisibleCol(field._refTargetTable, importedLayerData, tableNameRemap);
      if (vis) opts.visibleCol = vis;
    }
    if (field._externalResource && estPieceJointe(field)) {
      opts.maxFiles = opts.maxFiles || 5;
      opts.accept = opts.accept || 'image/*';
    }
    return Object.keys(opts).length ? opts : undefined;
  }

  function orderedFields(layer) {
    const byName = {};
    for (const f of (layer.fields || [])) byName[f.name] = f;
    const out = [];
    const seen = new Set();
    for (const name of (layer._formFieldOrder || [])) {
      const f = byName[name];
      if (!f || shouldSkipField(f, byName) || seen.has(f.name)) continue;
      seen.add(f.name);
      out.push(f);
    }
    for (const f of (layer.fields || [])) {
      if (shouldSkipField(f, byName) || seen.has(f.name)) continue;
      seen.add(f.name);
      out.push(f);
    }
    return out;
  }

  function isTerrainFormCandidate(layer) {
    if (!layer?.hasData) return false;
    const name = (layer.displayName || layer.name || '').toLowerCase();
    if (BASEMAP_NAME.test(name)) return false;
    if (layer.geomType === 'unknown') return false;
    const fields = orderedFields(layer);
    if (!fields.length) return false;
    const noGeom = layer.geomType === 'None' || layer.geomType === 'No geometry';
    if (noGeom) {
      return fields.some(f => f._refTargetTable || f.gType?.startsWith('Ref'));
    }
    if (!(layer._formFieldOrder || []).length) return false;
    return true;
  }

  /**
   * Une Ref dont la table cible n'a PAS ete importee (couche sans donnees, exclue) : l'import la garde en
   * texte (une Ref vers une table absente rendrait tous les ajouts de lignes impossibles dans Grist). Le
   * formulaire doit dire la meme chose : un champ texte, pas une liste deroulante vide.
   * Sans information sur les couches importees, rien n'est degrade.
   */
  function refDegradee(field, tableNameRemap, importedLayerData) {
    const cible = field && field._refTargetTable;
    if (!cible || !importedLayerData || !Object.keys(importedLayerData).length) return false;
    const reel = (tableNameRemap && tableNameRemap[cible]) || cible;
    return !(importedLayerData[reel] || importedLayerData[cible]);
  }

  function layerToFormDef(layer, tableName, tableNameRemap, importedLayerData) {
    const fields = orderedFields(layer).map(f0 => {
      const f = refDegradee(f0, tableNameRemap, importedLayerData)
        ? Object.assign({}, f0, { gType: 'Text', _refTargetTable: null, _refTargetField: null })
        : f0;
      const entry = {
        colId: f.name,
        label: f.label || f.name,
        type: gTypeForForm(f),
        widget: widgetForField(f),
        required: false,
      };
      const opts = buildFieldOptions(f, tableNameRemap, importedLayerData);
      if (opts) entry.options = opts;
      return entry;
    });

    const tid = tableName || layer.name;
    return {
      manifest_version: '1.0.0',
      id: slugify(tid) + '-terrain',
      title: (layer.displayName || tid) + ' — saisie',
      description: 'Généré depuis formulaire QField/QGIS',
      classification: 'internal',
      successMessage: 'Enregistrement envoyé ✓',
      tableId: tid,
      composeMode: 'bind',
      sections: [{
        id: 'main',
        label: layer.displayName || tid,
        fields,
      }],
      choices: {},
    };
  }

  function buildTerrainPack(importedLayerData, tableNameRemap) {
    const forms = [];
    for (const [tableName, layer] of Object.entries(importedLayerData || {})) {
      if (!isTerrainFormCandidate(layer)) continue;
      forms.push({
        tableId: tableName,
        displayName: layer.displayName || tableName,
        geomType: layer.geomType,
        formDef: layerToFormDef(layer, tableName, tableNameRemap, importedLayerData),
      });
    }
    return {
      version: 1,
      forms,
      primaryTableId: forms.find(f => f.geomType === 'Point')?.tableId
        || forms.find(f => f.geomType === 'Polygon')?.tableId
        || forms[0]?.tableId
        || null,
    };
  }

  return {
    SKIP_COLS,
    QFIELD_GPS,
    BASEMAP_NAME,
    slugify,
    inferVisibleCol,
    isTerrainFormCandidate,
    layerToFormDef,
    buildTerrainPack,
    orderedFields,
  };
});
