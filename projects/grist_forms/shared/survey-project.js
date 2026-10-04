(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.SurveyProject = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalizeGristType(t) {
    if (!t) return 'Text';
    if (t.startsWith('RefList:')) return 'RefList';
    if (t.startsWith('Ref:')) return 'Ref';
    return t;
  }

  function resolveRefTable(field) {
    if (!field) return '';
    if (field.refTable) return field.refTable;
    if (field.options && field.options.refTable) return field.options.refTable;
    return '';
  }

  /** Profil ou type Grist → type Survey Manifest. */
  function mapQuestionType(field, echelles) {
    if (field.profile === 'likert5' || field.widget === 'likert') return 'likert5';
    // Une échelle de 1 à 5 est l'échelle d'enquête que le Survey Manifest
    // connaît ; au-delà, il n'a que « nombre », et l'échelle reste décrite à
    // côté pour que rien ne se perde.
    if (field.kind === 'echelle') {
      var e = (echelles && echelles[field.options && field.options.echelle]) || {};
      var min = typeof e.min === 'number' ? e.min : 1;
      var max = typeof e.max === 'number' ? e.max : 5;
      return (min === 1 && max === 5) ? 'likert5' : 'number';
    }
    var t = normalizeGristType(field.type);
    var map = {
      ChoiceList: 'choice_list',
      Choice: 'choice',
      Bool: 'bool',
      DateTime: 'datetime',
      Date: 'date',
      Int: 'number',
      Numeric: 'number',
      Attachments: 'attachment',
      Text: 'text'
    };
    if (map[t]) return map[t];
    if (t === 'Ref' || t === 'RefList') return 'text';
    return 'text';
  }

  function mapQuestion(field, echelles) {
    var q = {
      colId: field.colId,
      label: field.label,
      type: mapQuestionType(field, echelles)
    };
    if (field.kind === 'echelle') {
      var ech = (echelles && echelles[field.options && field.options.echelle]) || null;
      if (ech) {
        q.echelle = { min: ech.min, max: ech.max };
        if (ech.libelles) q.echelle.libelles = ech.libelles;
        if (ech.nonConcerne) q.echelle.nonConcerne = true;
      }
      if (field.options && field.options.matrice) q.matrice = field.options.matrice;
    }
    if (field.required) q.required = true;
    if (field.condition) q.condition = field.condition;
    if (field.profile) q.profile = field.profile;
    if (field.theme) q.theme = field.theme;
    if (field.polarity) q.polarity = field.polarity;
    if (field.options && typeof field.options === 'object') {
      var opts = {};
      if (field.options.accept) opts.accept = field.options.accept;
      if (field.options.maxFiles != null) opts.maxFiles = field.options.maxFiles;
      if (Object.keys(opts).length) q.options = opts;
    }
    var t = normalizeGristType(field.type);
    if (t === 'Ref' || t === 'RefList') {
      q.grist = {
        type: t,
        refTable: resolveRefTable(field) || undefined,
        visibleCol: field.options && field.options.visibleCol
      };
    }
    return q;
  }

  function formDefToSurveyManifest(def) {
    if (!def) return null;
    return {
      manifest_version: def.manifest_version || '1.0.0',
      id: def.id,
      title: def.title,
      description: def.description || undefined,
      classification: def.classification,
      sections: (def.sections || []).map(function (section) {
        var sec = {
          id: section.id,
          label: section.label,
          gate: section.gate != null ? section.gate : null,
          questions: (section.fields || []).map(function (f) { return mapQuestion(f, def.echelles); })
        };
        if (section.condition) sec.condition = section.condition;
        return sec;
      }),
      choices: def.choices || {}
    };
  }

  var SM_TO_FORM = {
    text: { type: 'Text', widget: 'text' },
    choice: { type: 'Choice', widget: 'select' },
    choice_list: { type: 'ChoiceList', widget: 'multiselect' },
    bool: { type: 'Bool', widget: 'checkbox' },
    datetime: { type: 'DateTime', widget: 'datetime' },
    date: { type: 'Date', widget: 'date' },
    number: { type: 'Int', widget: 'number' },
    likert5: { type: 'Int', widget: 'likert', profile: 'likert5' },
    attachment: { type: 'Attachments', widget: 'file' }
  };

  /**
   * Inverse partielle SM → FormDef (types supportés).
   * Ignore / ne reconstruit pas les Ref riches hors `grist` meta.
   */
  function surveyManifestToFormDef(sm, opts) {
    opts = opts || {};
    if (!sm) return null;
    var sections = (sm.sections || []).map(function (section) {
      return {
        id: section.id,
        label: section.label,
        gate: section.gate != null ? section.gate : null,
        condition: section.condition || null,
        fields: (section.questions || section.fields || []).map(function (q) {
          var mapped = SM_TO_FORM[q.type] || SM_TO_FORM.text;
          var field = {
            colId: q.colId,
            label: q.label,
            type: mapped.type,
            widget: mapped.widget,
            required: !!q.required,
            options: q.options ? Object.assign({}, q.options) : {},
            condition: q.condition || null,
            cascade: null,
            dynamicFilter: null,
            profile: q.profile || mapped.profile || null,
            theme: q.theme || null,
            polarity: q.polarity || ''
          };
          if (q.grist && (q.grist.type === 'Ref' || q.grist.type === 'RefList')) {
            field.type = q.grist.type;
            field.widget = q.grist.type === 'RefList' ? 'multiselect' : 'select';
            if (q.grist.refTable) {
              field.refTable = q.grist.refTable;
              field.options.refTable = q.grist.refTable;
            }
            if (q.grist.visibleCol) field.options.visibleCol = q.grist.visibleCol;
          }
          return field;
        })
      };
    });
    return {
      manifest_version: sm.manifest_version || '1.0.0',
      id: sm.id,
      title: sm.title,
      description: sm.description || '',
      classification: sm.classification || '',
      successMessage: opts.successMessage || 'Merci !',
      tableId: opts.tableId || ('Reponses_' + String(sm.id || 'Form').replace(/[^A-Za-z0-9_]/g, '_')),
      composeMode: opts.composeMode || 'ensureSchema',
      sections: sections,
      choices: sm.choices || {}
    };
  }

  return {
    formDefToSurveyManifest: formDefToSurveyManifest,
    surveyManifestToFormDef: surveyManifestToFormDef,
    mapQuestionType: mapQuestionType
  };
}));
