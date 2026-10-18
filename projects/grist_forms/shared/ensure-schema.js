/*
 * ensure-schema.js — Dual du bind : FormDef complet → plan d'actions schéma Grist.
 *
 * Si le binding est complet (colId + type (+ refTable / choices si besoin)), on peut
 * matérialiser la table et/ou les colonnes manquantes. Jamais d'overwrite de type
 * incompatible.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.EnsureSchema = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalizeGristType(t) {
    if (!t) return 'Text';
    if (t.startsWith('RefList:')) return 'RefList';
    if (t.startsWith('Ref:')) return 'Ref';
    return t;
  }

  /**
   * La table cible d'une référence, par ordre de préférence :
   * `options.refTable` (la voie canonique), puis l'ancien `refTable` du champ,
   * puis le suffixe du type (`Ref:Lampadaires`) — que le schéma décrit comme
   * valide et que cette fonction ignorait : la table se perdait en silence.
   */
  function resolveRefTable(field) {
    if (!field) return '';
    if (field.options && field.options.refTable) return field.options.refTable;
    if (field.refTable) return field.refTable;
    var m = /^Ref(?:List)?:(.+)$/.exec(String(field.type || ''));
    return m ? m[1] : '';
  }

  function fieldToGristType(field) {
    var t = field.type || 'Text';
    var ref = resolveRefTable(field);
    // `Ref:Ancien` avec une table donnée ailleurs : la voie canonique l'emporte.
    var base = String(t).split(':')[0];
    if ((base === 'Ref' || base === 'RefList') && ref) return base + ':' + ref;
    return t;
  }

  function typesCompatible(existingType, expectedType) {
    if (normalizeGristType(existingType) !== normalizeGristType(expectedType)) return false;
    if (normalizeGristType(existingType) === 'Ref' || normalizeGristType(existingType) === 'RefList') {
      return existingType === expectedType;
    }
    return true;
  }

  function collectFields(formDef) {
    var fields = [];
    var seen = {};
    (formDef.sections || []).forEach(function (section) {
      (section.fields || []).forEach(function (field) {
        if (!field.colId || seen[field.colId]) return;
        seen[field.colId] = true;
        fields.push(field);
      });
    });
    return fields;
  }

  function choiceListFor(formDef, field) {
    var key = field.colId;
    if (formDef.choices && Array.isArray(formDef.choices[key]) && formDef.choices[key].length) {
      return formDef.choices[key];
    }
    if (field.options && Array.isArray(field.options.choices) && field.options.choices.length) {
      return field.options.choices;
    }
    return null;
  }

  function buildColumnDef(formDef, field) {
    var def = {
      id: field.colId,
      type: fieldToGristType(field)
    };
    if (field.label) def.label = field.label;
    var t = normalizeGristType(field.type);
    if (t === 'Choice' || t === 'ChoiceList') {
      var choices = choiceListFor(formDef, field);
      if (choices) {
        def.widgetOptions = JSON.stringify({ choices: choices });
      }
    }
    if ((t === 'Ref' || t === 'RefList') && field.options && field.options.visibleCol) {
      // Intention runtime (choicesFromRefRecords) ; la méta Grist est posée ensuite
      // via planVisibleColUpdates (id de colonne dans la table référencée).
      var wo = {};
      try {
        if (def.widgetOptions) wo = JSON.parse(def.widgetOptions);
      } catch (e) { wo = {}; }
      wo.widget = t === 'RefList' ? 'ReferenceList' : 'Reference';
      wo.visibleCol = field.options.visibleCol;
      def.widgetOptions = JSON.stringify(wo);
    }
    return def;
  }

  /**
   * Ce qu'une source de référentiel sait donner, avec le type Grist de chaque
   * sens — lu dans le module qui la connaît, pas recopié ici : deux listes de
   * types finissent toujours par diverger.
   *
   * Cherché à l'appel et pas au chargement : sous Node c'est un `require`, dans
   * un navigateur c'est le global posé par `referentiel.js`, qui doit alors être
   * chargé avant qu'on projette quoi que ce soit.
   */
  function sensDuReferentiel(field) {
    var o = field && field.options && field.options.referentiel;
    if (!o || !o.source) return {};
    var api = null;
    try {
      if (typeof module === 'object' && module.exports && typeof require === 'function') {
        api = require('./referentiel.js');
      }
    } catch (e) { api = null; }
    if (!api) {
      var global = typeof self !== 'undefined' ? self : null;
      api = (global && global.FormReferentiel) || null;
    }
    return api && api.annexesDe ? api.annexesDe(o.source) : {};
  }

  /**
   * Les sens qu'un lieu sait remplir (adresse, commune, bâtiment, altitude…) et
   * leur type : du texte pour un code, un nombre pour l'altitude. Cherché à
   * l'appel, comme `sensDuReferentiel`.
   */
  function sensDeLEnrichissement() {
    var api = null;
    try {
      if (typeof module === 'object' && module.exports && typeof require === 'function') {
        api = require('./enrichir.js');
      }
    } catch (e) { api = null; }
    if (!api) {
      var global = typeof self !== 'undefined' ? self : null;
      api = (global && global.FormEnrichir) || null;
    }
    return api && api.SENS ? api.SENS : {};
  }

  function copyDef(def) {
    var out = {};
    Object.keys(def).forEach(function (k) { out[k] = def[k]; });
    return out;
  }

  function rangLabel(i) {
    return i === 0 ? '1re place' : (i + 1) + 'e place';
  }

  /**
   * Les colonnes qu'un champ implique — pas toujours celle de son colId.
   *
   * > **Une saisie range parfois sa réponse ailleurs que sous son nom.** Un
   * > classement n'écrit que dans la colonne de chacun de ses rangs, et rien
   * > sous son propre `colId` ; une réponse « Autre » écrit sa précision dans
   * > une colonne à part. La projection créait pourtant UNE colonne par champ,
   * > celle du `colId` : le formulaire créé automatiquement ne pouvait pas
   * > enregistrer ce que le moteur écrit, et créait une colonne que personne
   * > n'écrit jamais.
   *
   * La règle est celle du moteur (`collectSubmitData`), recopiée ici et non
   * inventée : ce que le moteur écrit, la projection le crée.
   */
  function columnsOfField(formDef, field) {
    var cols = (field.options && field.options.colonnes) || {};
    var base = buildColumnDef(formDef, field);
    var label = field.label || field.colId;

    if (field.kind === 'classement') {
      return (cols.rangs || []).map(function (id, i) {
        var def = copyDef(base);
        def.id = id;
        def.label = label + ' — ' + rangLabel(i);
        return def;
      });
    }

    var out = [];
    if (cols.valeur && cols.valeur !== field.colId) base.id = cols.valeur;
    out.push(base);
    if (cols.autre) {
      out.push({ id: cols.autre, type: 'Text', label: 'Précision — ' + label });
    }
    // Un référentiel range, à côté du texte, ce que la source sait de la chose
    // choisie : un code postal est du texte, une coordonnée un nombre.
    // Un lieu range, à côté de sa géométrie, ce que les services en ont su.
    var enr = field.options && field.options.enrichir && field.options.enrichir.colonnes;
    if (enr) {
      var sensE = sensDeLEnrichissement();
      Object.keys(enr).forEach(function (cle) {
        if (!enr[cle] || !sensE[cle]) return;
        out.push({ id: enr[cle], type: sensE[cle], label: cle + ' — ' + label });
      });
    }
    // La precision d'un releve GPS : un nombre de metres entiers, a cote du point.
    if (field.options && field.options.precisionCol) {
      out.push({ id: field.options.precisionCol, type: 'Int', label: 'Précision du GPS (m) — ' + label });
    }
    if (field.kind === 'referentiel') {
      var sens = sensDuReferentiel(field);
      Object.keys(cols.annexes || {}).forEach(function (cle) {
        var id = cols.annexes[cle];
        if (!id || !sens[cle]) return;
        out.push({ id: id, type: sens[cle].type, label: sens[cle].label + ' — ' + label });
      });
    }
    return out;
  }

  /**
   * Projection pure FormDef → colonnes (inverse conceptuel du bind).
   * Exige un binding complet pour un résultat fiable.
   *
   * Deux questions qui nomment la même colonne ne la créent qu'une fois : la
   * première l'emporte, et le plan ne se contredit pas.
   */
  function columnsFromFormDef(formDef) {
    var seen = {};
    var cols = [];
    collectFields(formDef).forEach(function (field) {
      columnsOfField(formDef, field).forEach(function (col) {
        if (seen[col.id]) return;
        seen[col.id] = true;
        cols.push(col);
      });
    });
    // Les colonnes que personne ne remplit a la main : quand, combien de temps, qui.
    var meta = (formDef && formDef.meta) || {};
    [
      ['timestampCol', 'DateTime', 'Reçue le'],
      ['durationCol', 'Int', 'Durée de remplissage (s)'],
      ['emailCol', 'Text', 'Courriel de la personne']
    ].forEach(function (m) {
      var id = meta[m[0]];
      if (!id || seen[id]) return;
      seen[id] = true;
      cols.push({ id: id, type: m[1], label: m[2] });
    });
    return cols;
  }

  /**
   * Binding « complet » pour pouvoir driver le schéma depuis le formulaire.
   */
  function isValidGristIdent(id) {
    return typeof id === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(id) && id.length <= 60;
  }

  function bindingIsComplete(formDef) {
    var errors = [];
    if (!formDef || !formDef.tableId) {
      errors.push('tableId manquant');
    } else if (!isValidGristIdent(formDef.tableId)) {
      errors.push('identifiant invalide pour la table « ' + formDef.tableId +
        ' » (lettres, chiffres, _ ; commencer par une lettre)');
    }
    var fields = collectFields(formDef || {});
    if (!fields.length) {
      errors.push('Aucun champ avec colId');
    }
    fields.forEach(function (field) {
      if (!field.colId) {
        errors.push('Champ sans colId');
        return;
      }
      if (!isValidGristIdent(field.colId)) {
        errors.push('identifiant invalide pour la colonne « ' + field.colId + ' »');
        return;
      }
      if (!field.type) {
        errors.push('Champ « ' + field.colId + ' » : type manquant');
        return;
      }
      var t = normalizeGristType(field.type);
      if ((t === 'Ref' || t === 'RefList') && !resolveRefTable(field)) {
        errors.push('Champ « ' + field.colId + ' » : refTable manquant pour ' + t);
      }
      // Des étiquettes libres n'ont pas de liste à déclarer : les choix ne sont que des suggestions.
      if ((t === 'Choice' || t === 'ChoiceList') && field.widget !== 'etiquettes' && !choiceListFor(formDef, field)) {
        errors.push('Champ « ' + field.colId + ' » : choices manquants pour ' + t);
      }

      // Les colonnes où la saisie range sa réponse sont des colonnes comme les
      // autres : un nom que Grist refuserait, ou un classement qui n'en nomme
      // aucune (il n'écrirait alors nulle part), se disent avant d'agir.
      var cols = (field.options && field.options.colonnes) || {};
      if (field.kind === 'classement' && !(cols.rangs && cols.rangs.length)) {
        errors.push('Champ « ' + field.colId + ' » : un classement doit nommer la colonne de chaque rang ' +
          '(options.colonnes.rangs)');
      }
      var annexes = cols.annexes || {};
      var nommees = (cols.rangs || []).concat(cols.autre ? [cols.autre] : [])
        .concat(cols.valeur && cols.valeur !== field.colId ? [cols.valeur] : [])
        .concat(Object.keys(annexes).map(function (cle) { return annexes[cle]; }).filter(Boolean));
      if (field.kind === 'referentiel') {
        // Un sens que la source ne donne pas ne créerait aucune colonne, sans le
        // dire : on le dit. Une source inconnue ne peut pas être jugée.
        var sens = sensDuReferentiel(field);
        var connus = Object.keys(sens);
        if (connus.length) {
          Object.keys(annexes).forEach(function (cle) {
            if (!sens[cle]) {
              errors.push('Champ « ' + field.colId + ' » : « ' + cle + ' » n’est pas un sens que la source ' +
                'sait donner (' + connus.join(', ') + ')');
            }
          });
        }
      }
      nommees.forEach(function (id) {
        if (!isValidGristIdent(id)) {
          errors.push('identifiant invalide pour la colonne « ' + id + ' » (champ « ' + field.colId + ' »)');
        }
      });
    });
    return { ok: errors.length === 0, errors: errors };
  }

  /**
   * @param {object} formDef
   * @param {Array<{id:string,type:string}>} existingColumns — vide si table absente
   * @param {{ tableExists?: boolean }} [opts] — défaut tableExists=true si existingColumns fourni
   */
  function planEnsureSchema(formDef, existingColumns, opts) {
    opts = opts || {};
    var tableExists = opts.tableExists;
    if (tableExists === undefined) {
      tableExists = true;
    }

    var bind = bindingIsComplete(formDef);
    if (!bind.ok) {
      return { ok: false, errors: bind.errors, actions: [] };
    }

    var errors = [];
    var actions = [];
    var tableId = formDef.tableId;
    var columns = columnsFromFormDef(formDef);

    if (!tableExists) {
      actions.push(['AddTable', tableId, columns]);
      return { ok: true, errors: [], actions: actions };
    }

    var existingById = {};
    (existingColumns || []).forEach(function (col) {
      existingById[col.id] = col.type;
    });

    columns.forEach(function (col) {
      var existingType = existingById[col.id];
      if (existingType === undefined) {
        var addDef = { type: col.type };
        if (col.label) addDef.label = col.label;
        if (col.widgetOptions) addDef.widgetOptions = col.widgetOptions;
        actions.push(['AddColumn', tableId, col.id, addDef]);
      } else if (!typesCompatible(existingType, col.type)) {
        errors.push(
          'Colonne « ' + col.id + ' » : type incompatible (existant: ' +
          existingType + ', attendu: ' + col.type + ')'
        );
      }
    });

    return { ok: errors.length === 0, errors: errors, actions: actions };
  }

  /**
   * Après AddTable/AddColumn : pose visibleCol méta Grist (id colonne affichée
   * dans la table référencée) à partir de field.options.visibleCol (nom colId).
   * @param {object} formDef
   * @param {Array<{id:number,tableId:string}>} tables
   * @param {Array<{id:number,parentId:number,colId:string,visibleCol?:number}>} columns
   */
  function planVisibleColUpdates(formDef, tables, columns) {
    var actions = [];
    if (!formDef || !formDef.tableId) return { ok: true, actions: actions };

    var tableRefById = {};
    (tables || []).forEach(function (t) {
      if (t && t.tableId != null) tableRefById[t.tableId] = t.id;
    });
    var colsByParent = {};
    (columns || []).forEach(function (c) {
      if (!c || c.parentId == null) return;
      if (!colsByParent[c.parentId]) colsByParent[c.parentId] = [];
      colsByParent[c.parentId].push(c);
    });

    var targetRef = tableRefById[formDef.tableId];
    if (targetRef == null) return { ok: true, actions: actions };

    collectFields(formDef).forEach(function (field) {
      var t = normalizeGristType(field.type);
      if (t !== 'Ref' && t !== 'RefList') return;
      var visName = field.options && field.options.visibleCol;
      if (!visName || typeof visName !== 'string') return;
      var refTable = resolveRefTable(field);
      var refTableRef = tableRefById[refTable];
      if (refTableRef == null) return;

      var displayCol = (colsByParent[refTableRef] || []).find(function (c) {
        return c.colId === visName;
      });
      var ourCol = (colsByParent[targetRef] || []).find(function (c) {
        return c.colId === field.colId;
      });
      if (!displayCol || !ourCol) return;
      if (ourCol.visibleCol === displayCol.id) return;

      actions.push([
        'UpdateRecord',
        '_grist_Tables_column',
        ourCol.id,
        { visibleCol: displayCol.id }
      ]);
    });

    return { ok: true, actions: actions };
  }

  return {
    planEnsureSchema: planEnsureSchema,
    columnsFromFormDef: columnsFromFormDef,
    bindingIsComplete: bindingIsComplete,
    fieldToGristType: fieldToGristType,
    normalizeGristType: normalizeGristType,
    planVisibleColUpdates: planVisibleColUpdates
  };
}));
