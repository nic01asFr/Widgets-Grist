/*
 * ux.js — helpers façade « questionnaire » (slug, templates, messages humains).
 * Le moteur technique (bind / ensureSchema / FormDef) reste inchangé sous le capot.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.FormUx = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Ce qu'une question peut etre, dans les mots de celle ou celui qui compose.
  // Le `widget` dit comment elle se pose, le `type` ou la reponse se range, et
  // le `kind` la couche qu'on pose par-dessus (un classement reste un choix).
  var SIMPLE_TYPES = [
    { key: 'text', type: 'Text', widget: 'text', label: 'Texte' },
    { key: 'textarea', type: 'Text', widget: 'textarea', label: 'Paragraphe' },
    { key: 'number', type: 'Int', widget: 'number', label: 'Nombre' },
    { key: 'ouinon', type: 'Bool', widget: 'ouinon', label: 'Oui / Non' },
    { key: 'choice', type: 'Choice', widget: 'select', label: 'Liste de choix' },
    { key: 'choicelist', type: 'ChoiceList', widget: 'multiselect', label: 'Cases multiples' },
    { key: 'date', type: 'Date', widget: 'date', label: 'Date' },
    { key: 'datetime', type: 'DateTime', widget: 'datetime', label: 'Date et heure' },
    { key: 'file', type: 'Attachments', widget: 'file', label: 'Fichier(s)' }
  ];

  var ADVANCED_TYPES = [
    { key: 'numeric', type: 'Numeric', widget: 'number', label: 'Nombre décimal' },
    { key: 'ref', type: 'Ref', widget: 'select', label: 'Référence (table liée)' },
    { key: 'reflist', type: 'RefList', widget: 'multiselect', label: 'Références multiples' },
    { key: 'likert', type: 'Int', widget: 'likert', label: 'Échelle 1–5' },
    { key: 'radio', type: 'Choice', widget: 'radio', label: 'Choix en boutons' },
    { key: 'classement', type: 'Choice', widget: 'classement', kind: 'classement', label: 'Classement' },
    { key: 'geo', type: 'Text', widget: 'geo', kind: 'geometrie', label: 'Lieu (position)' },
    // Un dessin arrive dans la base comme une photo : en piece jointe.
    { key: 'dessin', type: 'Attachments', widget: 'dessin', label: 'Dessin / annotation' },
    { key: 'signature', type: 'Attachments', widget: 'dessin', label: 'Signature' },
    // La case a cocher reste disponible : une acceptation de conditions n'est
    // pas une question a deux reponses, c'est un accord qu'on donne ou non.
    { key: 'bool', type: 'Bool', widget: 'checkbox', label: 'Case à cocher' }
  ];

  function slugify(text) {
    var s = String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
    if (!s) return 'Champ';
    if (/^[0-9]/.test(s)) s = 'C_' + s;
    return s.slice(0, 40);
  }

  function isValidGristIdent(id) {
    return typeof id === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(id) && id.length <= 60;
  }

  function tableNameFromTitle(title) {
    var slug = slugify(title || 'Questionnaire');
    return 'Reponses_' + slug;
  }

  function fieldTypeKey(field) {
    if (!field) return 'text';
    if (field.widget === 'textarea') return 'textarea';
    if (field.widget === 'likert') return 'likert';
    if (field.widget === 'file' || field.type === 'Attachments') return 'file';
    var all = SIMPLE_TYPES.concat(ADVANCED_TYPES);
    var i;
    // Le widget d'abord : « oui/non » et « case a cocher » ont le meme type
    // Grist, et c'est la maniere de poser la question qui les distingue.
    for (i = 0; i < all.length; i++) {
      if (all[i].type === field.type && all[i].widget === field.widget) return all[i].key;
    }
    for (i = 0; i < all.length; i++) {
      if (all[i].widget === field.widget) return all[i].key;
    }
    for (i = 0; i < all.length; i++) {
      if (all[i].type === field.type) return all[i].key;
    }
    return 'text';
  }

  function applyTypeKey(field, key) {
    var all = SIMPLE_TYPES.concat(ADVANCED_TYPES);
    var found = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].key === key) { found = all[i]; break; }
    }
    if (!found) found = SIMPLE_TYPES[0];
    field.type = found.type;
    field.widget = found.widget;
    // Le `kind` suit le choix : il n'est pas un reglage de plus a trouver.
    // Celui qu'on quitte s'en va, sauf l'echelle, qui se choisit ailleurs.
    if (found.kind) field.kind = found.kind;
    else if (field.kind && field.kind !== 'echelle') delete field.kind;
    return field;
  }

  function humanizeBindingErrors(errors) {
    return (errors || []).map(function (e) {
      var m = String(e);
      if (/choices manquants/i.test(m)) {
        return m.replace(/Champ « (.+?) » : choices manquants.*/, 'Ajoutez au moins une option pour la liste « $1 ».');
      }
      if (/refTable manquant/i.test(m)) {
        return m.replace(/Champ « (.+?) » : refTable manquant.*/, 'Choisissez la table liée pour « $1 ».');
      }
      if (/type manquant/i.test(m)) {
        return m.replace(/Champ « (.+?) » : type manquant/, 'Choisissez un type pour « $1 ».');
      }
      if (/Aucun champ avec colId/i.test(m)) {
        return 'Ajoutez au moins une question (avec un libellé).';
      }
      if (/tableId manquant/i.test(m)) {
        return 'Indiquez un nom pour la table des réponses.';
      }
      if (/type incompatible/i.test(m)) {
        return m.replace(
          /Colonne « (.+?) » : type incompatible \(existant: (.+?), attendu: (.+?)\)/,
          'La colonne « $1 » existe déjà avec un type différent ($2 au lieu de $3).'
        );
      }
      if (/identifiant invalide/i.test(m)) return m;
      return m;
    });
  }

  var OPERATORS_BY_TYPE = {
    Bool: [{ value: '==', label: 'est' }],
    Int: [
      { value: '==', label: 'égal à' }, { value: '!=', label: 'différent de' },
      { value: '>', label: 'supérieur à' }, { value: '>=', label: '≥' },
      { value: '<', label: 'inférieur à' }, { value: '<=', label: '≤' }
    ],
    Numeric: [
      { value: '==', label: 'égal à' }, { value: '!=', label: 'différent de' },
      { value: '>', label: 'supérieur à' }, { value: '>=', label: '≥' },
      { value: '<', label: 'inférieur à' }, { value: '<=', label: '≤' }
    ],
    Text: [
      { value: '==', label: 'égal à' }, { value: '!=', label: 'différent de' },
      { value: 'contains', label: 'contient' }
    ],
    Choice: [
      { value: '==', label: 'égal à' }, { value: '!=', label: 'différent de' }
    ],
    ChoiceList: [
      { value: 'contains', label: 'contient' }, { value: '==', label: 'égal à' }
    ],
    Ref: [
      { value: '==', label: 'égal à' }, { value: '!=', label: 'différent de' }
    ],
    Date: [
      { value: '==', label: 'égal à' }, { value: '!=', label: 'différent de' },
      { value: '>', label: 'après' }, { value: '<', label: 'avant' }
    ],
    DateTime: [
      { value: '==', label: 'égal à' }, { value: '!=', label: 'différent de' },
      { value: '>', label: 'après' }, { value: '<', label: 'avant' }
    ]
  };

  function operatorsForType(type) {
    var t = type || 'Text';
    if (t.indexOf('Ref:') === 0) t = 'Ref';
    if (t.indexOf('RefList:') === 0) t = 'Ref';
    return OPERATORS_BY_TYPE[t] || OPERATORS_BY_TYPE.Text;
  }

  function emptyRule() {
    return { source: 'field', field: '', path: '', operator: '==', value: '', bind: null };
  }

  function isCompoundCondition(c) {
    return !!(c && c.op && Array.isArray(c.rules));
  }

  function normalizeRule(r) {
    r = r || {};
    var source = r.source || 'field';
    var path = r.path != null ? r.path : '';
    var field = r.field || '';
    if (!path && field.indexOf('context.') === 0) {
      source = 'context';
      path = field.slice(8);
    } else if (!path && field.indexOf('audience.') === 0) {
      source = 'audience';
      path = field.slice(9);
    } else if (!path) {
      path = field;
    }
    return {
      source: source,
      field: field || (source !== 'field' ? source + '.' + path : path),
      path: path,
      operator: r.operator || '==',
      value: r.value != null ? r.value : '',
      bind: r.bind || null
    };
  }

  function normalizeToCompound(condition) {
    if (!condition) return { op: 'and', rules: [emptyRule()] };
    if (isCompoundCondition(condition)) {
      return {
        op: condition.op === 'or' ? 'or' : 'and',
        rules: (condition.rules.length ? condition.rules : [emptyRule()]).map(normalizeRule)
      };
    }
    return { op: 'and', rules: [normalizeRule(condition)] };
  }

  /** Compacte : 1 règle → forme simple ; sinon composé. Vide → null. */
  function compactCondition(compound) {
    if (!compound || !compound.rules) return null;
    var rules = compound.rules.filter(function (r) {
      return r && (r.field || r.path || r.source === 'context' || r.source === 'audience');
    }).map(normalizeRule);
    if (!rules.length) return null;
    if (rules.length === 1 && (!compound.op || compound.op === 'and')) {
      var one = rules[0];
      if (one.source === 'field' || !one.source) {
        return { field: one.field || one.path, operator: one.operator || '==', value: one.value };
      }
      return {
        source: one.source,
        field: one.field,
        path: one.path,
        operator: one.operator || '==',
        value: one.value,
        bind: one.bind
      };
    }
    return { op: compound.op === 'or' ? 'or' : 'and', rules: rules };
  }

  function summarizeCondition(condition) {
    if (!condition) return '';
    if (isCompoundCondition(condition)) {
      var joiner = condition.op === 'or' ? ' OU ' : ' ET ';
      return (condition.rules || []).map(function (r) {
        return summarizeCondition(r);
      }).filter(Boolean).join(joiner);
    }
    var src = condition.source || 'field';
    var label = condition.path || condition.field || '';
    if (src === 'context') label = 'contexte.' + (condition.path || String(condition.field || '').replace(/^context\./, ''));
    if (src === 'audience') label = 'audience.' + (condition.path || String(condition.field || '').replace(/^audience\./, ''));
    return label + ' ' + (condition.operator || '==') + ' ' + String(condition.value);
  }

  /**
   * Détecte la colonne Ref dans childTable qui pointe vers parentTable.
   * @param {Array<{colId:string,type:string}>} childColumns
   * @param {string} parentTableId
   */
  function detectRefColumn(childColumns, parentTableId) {
    if (!parentTableId || !childColumns) return '';
    var want = 'Ref:' + parentTableId;
    for (var i = 0; i < childColumns.length; i++) {
      if (childColumns[i].type === want) return childColumns[i].colId;
    }
    var lower = parentTableId.toLowerCase();
    for (var j = 0; j < childColumns.length; j++) {
      var id = childColumns[j].colId || '';
      if (id.toLowerCase() === lower || id.toLowerCase() === lower + '_id') return id;
    }
    return '';
  }

  function templates() {
    return [
      {
        id: 'contact',
        label: 'Contact',
        description: 'Nom, email, message',
        build: function () {
          return {
            title: 'Formulaire de contact',
            description: 'Laissez-nous un message',
            successMessage: 'Merci, votre message a bien été envoyé.',
            sections: [{
              id: 's1', label: 'Vos coordonnées', gate: null, condition: null,
              fields: [
                { colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text', required: true, options: {}, condition: null, cascade: null, dynamicFilter: null },
                { colId: 'Email', label: 'Email', type: 'Text', widget: 'text', required: true, options: {}, condition: null, cascade: null, dynamicFilter: null },
                { colId: 'Message', label: 'Message', type: 'Text', widget: 'textarea', required: true, options: {}, condition: null, cascade: null, dynamicFilter: null }
              ]
            }],
            choices: {}
          };
        }
      },
      {
        id: 'satisfaction',
        label: 'Satisfaction',
        description: 'Note, commentaire, recontact',
        build: function () {
          return {
            title: 'Enquête de satisfaction',
            description: 'Votre avis nous intéresse',
            successMessage: 'Merci pour votre retour !',
            sections: [
              {
                id: 's1', label: 'Votre avis', gate: null, condition: null,
                fields: [
                  { colId: 'Note', label: 'Note globale', type: 'Choice', widget: 'select', required: true, options: {}, condition: null, cascade: null, dynamicFilter: null },
                  { colId: 'Commentaire', label: 'Commentaire', type: 'Text', widget: 'textarea', required: false, options: {}, condition: null, cascade: null, dynamicFilter: null },
                  { colId: 'Recontact', label: 'Souhaitez-vous être recontacté·e ?', type: 'Bool', widget: 'checkbox', required: false, options: {}, condition: null, cascade: null, dynamicFilter: null }
                ]
              },
              {
                id: 's2', label: 'Coordonnées de recontact', gate: null,
                condition: { field: 'Recontact', operator: '==', value: true },
                fields: [
                  { colId: 'Email', label: 'Email', type: 'Text', widget: 'text', required: true, options: {}, condition: null, cascade: null, dynamicFilter: null }
                ]
              }
            ],
            choices: { Note: ['Très satisfait', 'Satisfait', 'Neutre', 'Insatisfait', 'Très insatisfait'] }
          };
        }
      },
      {
        id: 'inscription',
        label: 'Inscription',
        description: 'Nom, date, participation',
        build: function () {
          return {
            title: 'Inscription',
            description: 'Inscrivez-vous à l’événement',
            successMessage: 'Inscription enregistrée. À bientôt !',
            sections: [{
              id: 's1', label: 'Participant', gate: null, condition: null,
              fields: [
                { colId: 'Nom', label: 'Nom complet', type: 'Text', widget: 'text', required: true, options: {}, condition: null, cascade: null, dynamicFilter: null },
                { colId: 'DateParticipation', label: 'Date souhaitée', type: 'Date', widget: 'date', required: true, options: {}, condition: null, cascade: null, dynamicFilter: null },
                { colId: 'Presentiel', label: 'Participation en présentiel', type: 'Bool', widget: 'checkbox', required: false, options: {}, condition: null, cascade: null, dynamicFilter: null }
              ]
            }],
            choices: {}
          };
        }
      }
    ];
  }

  return {
    SIMPLE_TYPES: SIMPLE_TYPES,
    ADVANCED_TYPES: ADVANCED_TYPES,
    OPERATORS_BY_TYPE: OPERATORS_BY_TYPE,
    slugify: slugify,
    isValidGristIdent: isValidGristIdent,
    tableNameFromTitle: tableNameFromTitle,
    fieldTypeKey: fieldTypeKey,
    applyTypeKey: applyTypeKey,
    humanizeBindingErrors: humanizeBindingErrors,
    operatorsForType: operatorsForType,
    emptyRule: emptyRule,
    isCompoundCondition: isCompoundCondition,
    normalizeToCompound: normalizeToCompound,
    compactCondition: compactCondition,
    summarizeCondition: summarizeCondition,
    detectRefColumn: detectRefColumn,
    templates: templates
  };
}));
