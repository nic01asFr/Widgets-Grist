(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.FormulairesTable = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TABLE_NAME = 'Formulaires';

  var FORMULAIRES_SCHEMA = [
    { id: 'Nom', type: 'Text', label: 'Nom' },
    { id: 'FormId', type: 'Text', label: 'FormId' },
    { id: 'Titre', type: 'Text', label: 'Titre' },
    { id: 'TableCible', type: 'Text', label: 'Table cible' },
    { id: 'Version', type: 'Int', label: 'Version' },
    { id: 'Def', type: 'Text', label: 'Def' },
    {
      id: 'Statut',
      type: 'Choice',
      label: 'Statut',
      widgetOptions: JSON.stringify({ choices: ['brouillon', 'publie', 'terrain'] })
    },
    { id: 'PublishedSectionRef', type: 'Int', label: 'Section publiée' },
    { id: 'UpdatedAt', type: 'DateTime', label: 'Mis à jour' }
  ];

  function columnToGristSpec(col) {
    var spec = { id: col.id, type: col.type };
    if (col.label) spec.label = col.label;
    if (col.widgetOptions) spec.widgetOptions = col.widgetOptions;
    return spec;
  }

  function planCreateFormulairesTable() {
    return [[
      'AddTable',
      TABLE_NAME,
      FORMULAIRES_SCHEMA.map(columnToGristSpec)
    ]];
  }

  function asInt(v, fallback) {
    if (v == null || v === '') return fallback == null ? null : fallback;
    var n = Number(v);
    return isFinite(n) ? Math.trunc(n) : (fallback == null ? null : fallback);
  }

  /**
   * La définition débarrassée de ce qui n'appartient qu'au compositeur.
   *
   * L'écran garde des marques de travail sur ses champs (`_colIdLocked` dit
   * que l'identifiant de colonne a été choisi à la main). Elles partaient dans
   * `Def` et faisaient mentir le contrat : `formdef.schema.json` interdit toute
   * clé qu'il ne déclare pas. Un lecteur strict rejetait donc des formulaires
   * que ce dépôt avait lui-même écrits.
   */
  function defPropre(def) {
    if (!def || typeof def !== 'object') return def;
    var sansMarques = function (o) {
      var out = {};
      Object.keys(o).forEach(function (k) { if (k.charAt(0) !== '_') out[k] = o[k]; });
      return out;
    };
    var copie = sansMarques(def);
    copie.sections = (def.sections || []).map(function (s) {
      var sec = sansMarques(s);
      sec.fields = (s.fields || []).map(sansMarques);
      return sec;
    });
    return copie;
  }

  function rowFromFormDef(def, meta) {
    meta = meta || {};
    var fields = {
      Nom: def.title || def.id || '',
      FormId: def.id,
      Titre: def.title || '',
      TableCible: def.tableId || '',
      Version: asInt(meta.version, 0),
      Def: JSON.stringify(defPropre(def)),
      Statut: meta.statut || 'brouillon'
    };
    if (meta.publishedSectionRef != null) {
      fields.PublishedSectionRef = asInt(meta.publishedSectionRef, null);
    }
    if (meta.updatedAt != null) {
      fields.UpdatedAt = asInt(meta.updatedAt, null);
    }
    return fields;
  }

  return {
    TABLE_NAME: TABLE_NAME,
    FORMULAIRES_SCHEMA: FORMULAIRES_SCHEMA,
    planCreateFormulairesTable: planCreateFormulairesTable,
    defPropre: defPropre,
    rowFromFormDef: rowFromFormDef
  };
}));
