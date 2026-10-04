(function (root, factory) {
  'use strict';
  // Ne pas prendre la branche CommonJS dans l'iframe custom-widget-builder
  // (certains hôtes exposent `module` sans `require` résolvable).
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../shared/types.js'),
      require('../shared/attachments.js'),
      require('../shared/session-context.js')
    );
  } else if (typeof define === 'function' && define.amd) {
    define(['../shared/types', '../shared/attachments', '../shared/session-context'], factory);
  } else {
    root.FormEngine = factory(root.FormTypes, root.FormAttachments, root.SessionContext);
  }
}(typeof self !== 'undefined' ? self : this, function (Types, Attachments, SessionContext) {
  'use strict';

  Attachments = Attachments || {};
  SessionContext = SessionContext || {};

  function normalizeEmail(v) {
    if (SessionContext.normalizeEmail) return SessionContext.normalizeEmail(v);
    if (v == null || v === '') return '';
    return String(v).trim().toLowerCase();
  }

  function resolveRuleSource(rule) {
    var source = rule.source || 'field';
    var path = rule.path != null && rule.path !== '' ? rule.path : (rule.field || '');
    if ((!rule.source || rule.source === 'field') && path.indexOf('context.') === 0) {
      return { source: 'context', path: path.slice(8) };
    }
    if ((!rule.source || rule.source === 'field') && path.indexOf('audience.') === 0) {
      return { source: 'audience', path: path.slice(9) };
    }
    return { source: source, path: path };
  }

  function compareValues(actual, operator, expected) {
    switch (operator) {
      case '==': return actual == expected;
      case '!=': return actual != expected;
      case '>': return Number(actual) > Number(expected);
      case '>=': return Number(actual) >= Number(expected);
      case '<': return Number(actual) < Number(expected);
      case '<=': return Number(actual) <= Number(expected);
      case 'contains':
        if (Array.isArray(actual)) return actual.indexOf(expected) !== -1;
        if (actual == null) return false;
        return String(actual).indexOf(String(expected)) !== -1;
      case 'in': {
        var list = Array.isArray(expected) ? expected : (expected != null && expected !== '' ? [expected] : []);
        if (Array.isArray(actual)) {
          return actual.some(function (a) {
            return list.some(function (e) { return String(a) === String(e); });
          });
        }
        return list.some(function (e) { return String(actual) === String(e); });
      }
      case 'notIn': {
        var listN = Array.isArray(expected) ? expected : (expected != null && expected !== '' ? [expected] : []);
        if (Array.isArray(actual)) {
          return !actual.some(function (a) {
            return listN.some(function (e) { return String(a) === String(e); });
          });
        }
        return !listN.some(function (e) { return String(actual) === String(e); });
      }
      case 'truthy': return !!actual;
      default: return true;
    }
  }

  function resolveAudienceActual(path, rule, context) {
    context = context || {};
    if (path === 'email' || path === 'userEmail') {
      return normalizeEmail(context.userEmail);
    }
    if (path === 'group' || path === 'groups') {
      return context.groups || [];
    }
    if (path === 'member') {
      return !!normalizeEmail(context.userEmail);
    }
    return context[path];
  }

  /** Règle atomique { field|path, operator, value, source?, bind? }. */
  function evaluateRule(rule, values, context) {
    if (!rule) return true;
    var resolved = resolveRuleSource(rule);
    var source = resolved.source;
    var path = resolved.path;
    if (source === 'field' && !path) return true;

    var actual;
    var expected = rule.value;
    if (source === 'context') {
      actual = context ? context[path] : undefined;
    } else if (source === 'audience') {
      actual = resolveAudienceActual(path, rule, context);
      if ((path === 'group' || path === 'groups') && rule.bind && Array.isArray(rule.bind.groups) && expected == null) {
        expected = rule.bind.groups;
      }
      if ((path === 'email' || path === 'userEmail') && expected != null) {
        if (Array.isArray(expected)) expected = expected.map(normalizeEmail);
        else expected = normalizeEmail(expected);
      }
    } else {
      actual = values[path];
    }
    return compareValues(actual, rule.operator || '==', expected);
  }

  /**
   * Condition simple ou composé { op, rules }.
   * @param {object|null} condition
   * @param {object} values réponses
   * @param {object} [context] SessionContext
   */
  function evaluateCondition(condition, values, context) {
    if (!condition) return true;
    if (condition.op && Array.isArray(condition.rules)) {
      var rules = condition.rules;
      if (!rules.length) return true;
      if (condition.op === 'or') {
        for (var i = 0; i < rules.length; i++) {
          if (evaluateCondition(rules[i], values, context)) return true;
        }
        return false;
      }
      for (var j = 0; j < rules.length; j++) {
        if (!evaluateCondition(rules[j], values, context)) return false;
      }
      return true;
    }
    return evaluateRule(condition, values, context);
  }

  /** gate Bool (legacy) ou condition complète (parité v3 / chemins). */
  function isSectionVisible(section, values, context) {
    if (!section) return true;
    if (section.condition) return evaluateCondition(section.condition, values, context);
    if (!section.gate) return true;
    return !!values[section.gate];
  }

  function isFieldVisible(field, values, context) {
    if (!field || !field.condition) return true;
    return evaluateCondition(field.condition, values, context);
  }

  /** Les types où omettre la colonne revient à y écrire 0 (mesuré en Grist réel). */
  var TYPES_A_VIDER = { Int: true, Numeric: true, Date: true, DateTime: true, Ref: true };

  /**
   * Ce qui part dans Grist.
   *
   * > **Omettre une colonne numérique, c'est y écrire 0.** Mesuré sur les deux
   * > instances : une colonne `Int` absente de l'action vaut 0, et `AVERAGE`
   * > ignore le vide mais compte les zéros. Une question jamais posée tirait
   * > donc les moyennes vers le bas, sans que rien ne le signale — on l'a vu
   * > dans les réponses de l'enquête du 4ᵉ.
   *
   * À la **création**, une question masquée ou sans réponse s'écrit donc
   * `null` explicitement. À la **correction** d'une ligne, non : le formulaire
   * ne montre pas tout, et vider ce qu'il ne montre pas effacerait des données
   * qu'il n'a jamais eu à connaître.
   *
   * @param {object} [opts] `{ creation: true }` pour écrire les vides
   */
  function collectSubmitData(formDef, values, context, opts) {
    opts = opts || {};
    var out = {};
    var sections = (formDef && formDef.sections) || [];
    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      var sectionVisible = isSectionVisible(section, values, context);
      var fields = section.fields || [];
      for (var j = 0; j < fields.length; j++) {
        var field = fields[j];
        var visible = sectionVisible && isFieldVisible(field, values, context);
        if (!visible) {
          if (opts.creation && TYPES_A_VIDER[Types.normalizeGristType(field.type)]) out[field.colId] = null;
          continue;
        }
        var brut = values[field.colId];
        // « Non concerné » est une réponse ; la colonne, elle, reste vide.
        out[field.colId] = brut === VALEUR_NON_CONCERNE ? null : Types.coerceForWrite(field, brut);
      }
    }
    return out;
  }

  function sameRefValue(a, b) {
    if (a == null || b == null || a === '' || b === '') return false;
    return String(a) === String(b);
  }

  function filterCascadeOptions(choices, refRecords, parentRefCol, parentValue) {
    if (!choices || !choices.length) return [];
    if (parentValue == null || parentValue === '') return [];
    if (!refRecords || !refRecords.id) return choices.slice();
    var ids = refRecords.id;
    var parentCol = refRecords[parentRefCol];
    if (!parentCol) return choices.slice();
    var parentById = {};
    for (var i = 0; i < ids.length; i++) {
      parentById[String(ids[i])] = parentCol[i];
    }
    return choices.filter(function (choice) {
      return sameRefValue(parentById[String(choice.value)], parentValue);
    });
  }

  /** Filtre dynamique : colonne de la table liée == valeur du champ parent. */
  function filterDynamicOptions(choices, refRecords, filterColumn, parentValue) {
    if (!choices || !choices.length) return [];
    if (parentValue == null || parentValue === '') return [];
    if (!refRecords || !refRecords.id || !filterColumn) return choices.slice();
    var col = refRecords[filterColumn];
    if (!col) return choices.slice();
    var byId = {};
    for (var i = 0; i < refRecords.id.length; i++) {
      byId[String(refRecords.id[i])] = col[i];
    }
    return choices.filter(function (choice) {
      return sameRefValue(byId[String(choice.value)], parentValue);
    });
  }

  function findFieldInFormDef(formDef, colId) {
    if (!formDef || !colId) return null;
    var sections = formDef.sections || [];
    for (var s = 0; s < sections.length; s++) {
      var fields = sections[s].fields || [];
      for (var i = 0; i < fields.length; i++) {
        if (fields[i].colId === colId) return fields[i];
      }
    }
    return null;
  }

  /**
   * Valeur utilisée pour filtrer les options Ref (cas A / cas C).
   * - parentResolve absent ou "value" → values[parentField] (Choice/Texte/Bool)
   * - parentResolve "refRow" → lit parentValueColumn sur la ligne Ref parent
   */
  function resolveParentFilterValue(field, values, formDef, refRecords) {
    var df = field && field.dynamicFilter;
    if (!df || !df.parentField) return null;
    values = values || {};
    var raw = values[df.parentField];
    if (raw == null || raw === '') return null;

    var resolve = df.parentResolve || 'value';
    if (resolve !== 'refRow') return raw;

    var parentCol = df.parentValueColumn;
    if (!parentCol) return null;

    var parentMeta = findFieldInFormDef(formDef, df.parentField);
    var parentTable = resolveRefTable(parentMeta);
    if (!parentTable || !refRecords || !refRecords[parentTable]) return null;

    var records = refRecords[parentTable];
    if (!records.id || !records[parentCol]) return null;
    for (var i = 0; i < records.id.length; i++) {
      if (sameRefValue(records.id[i], raw)) {
        var v = records[parentCol][i];
        return v == null || v === '' ? null : v;
      }
    }
    return null;
  }

  // ── Rendu DOM DSFR (runtime UI) ──────────────────────────────────────────
  // Échappement XSS sans littéraux « < » / entités HTML dans le source
  // (évite la casse si le JS est réinjecté via innerHTML / srcdoc).
  function escapeHtml(value) {
    if (value == null) return '';
    var s = String(value);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '&') out += '&' + 'amp;';
      else if (c === '\x3c') out += '&' + 'lt;';
      else if (c === '\x3e') out += '&' + 'gt;';
      else if (c === '"') out += '&' + 'quot;';
      else if (c === "'") out += '&#' + '39;';
      else out += c;
    }
    return out;
  }

  function normalizeOption(o) {
    if (o && typeof o === 'object') {
      return { value: o.value, label: o.label != null ? o.label : o.value };
    }
    return { value: o, label: o };
  }

  function resolveOptions(field, optionsList) {
    if (Array.isArray(optionsList)) return optionsList.map(normalizeOption);
    var raw = field && field.options && field.options.choices;
    if (Array.isArray(raw)) return raw.map(normalizeOption);
    return [];
  }

  function sameValue(a, b) {
    if (a == null || b == null) return false;
    return String(a) === String(b);
  }

  function fieldId(field) { return 'field-' + field.colId; }

  function requiredHint(field) {
    return field.required ? ' <span class="fr-hint-text">(obligatoire)</span>' : '';
  }

  /**
   * L'aide d'un champ, sous son libellé : une consigne que l'auteur du
   * formulaire a écrite (« photos légères de préférence »). Dans le libellé,
   * comme le veut le DSFR, pour être lue avec lui par un lecteur d'écran.
   */
  function descriptionHint(field) {
    var d = field && typeof field.description === 'string' ? field.description.trim() : '';
    return d ? '<span class="fr-hint-text">' + escapeHtml(d).replace(/\n/g, '<br>') + '</span>' : '';
  }

  function renderLabel(field, forId) {
    return '<label class="fr-label" for="' + escapeHtml(forId) + '">' +
      escapeHtml(field.label) + requiredHint(field) + descriptionHint(field) + '</label>';
  }

  function renderLegend(field) {
    return '<legend class="fr-fieldset__legend">' + escapeHtml(field.label) + requiredHint(field) +
      descriptionHint(field) + '</legend>';
  }

  function safeImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    var u = url.trim();
    if (/^https?:\/\//i.test(u) || /^data:image\//i.test(u)) return u;
    return '';
  }

  function renderBrandImg(url, alt, cssClass) {
    var safe = safeImageUrl(url);
    if (!safe) return '';
    return '<div class="' + (cssClass || 'fr-form__brand') + '">' +
      '<img src="' + escapeHtml(safe) + '" alt="' + escapeHtml(alt || '') + '" />' +
      '</div>';
  }

  function placeholderAttr(field) {
    var ph = field && field.options && field.options.placeholder;
    if (ph == null || ph === '') return '';
    return ' placeholder="' + escapeHtml(String(ph)) + '"';
  }

  function renderTextLike(field, value, multiline) {
    var id = fieldId(field);
    var val = value == null ? '' : value;
    var reqAttr = field.required ? ' required' : '';
    var phAttr = placeholderAttr(field);
    var control = multiline
      ? '<textarea class="fr-input" id="' + id + '" name="' + escapeHtml(field.colId) + '"' + reqAttr + phAttr + '>' +
        escapeHtml(val) + '</textarea>'
      : '<input class="fr-input" type="text" id="' + id + '" name="' + escapeHtml(field.colId) +
        '" value="' + escapeHtml(val) + '"' + reqAttr + phAttr + ' />';
    return '<div class="fr-input-group" data-colid="' + escapeHtml(field.colId) + '">' +
      renderLabel(field, id) + control + '</div>';
  }

  function renderNumber(field, value) {
    var id = fieldId(field);
    var val = value == null ? '' : value;
    var step = (field.options && field.options.step) || 'any';
    var reqAttr = field.required ? ' required' : '';
    var phAttr = placeholderAttr(field);
    return '<div class="fr-input-group" data-colid="' + escapeHtml(field.colId) + '">' +
      renderLabel(field, id) +
      '<input class="fr-input" type="number" id="' + id + '" name="' + escapeHtml(field.colId) +
      '" value="' + escapeHtml(val) + '" step="' + escapeHtml(step) + '"' + reqAttr + phAttr + ' />' +
      '</div>';
  }

  function renderCheckbox(field, value) {
    var id = fieldId(field);
    var checked = value ? ' checked' : '';
    return '<div class="fr-checkbox-group" data-colid="' + escapeHtml(field.colId) + '">' +
      '<input type="checkbox" id="' + id + '" name="' + escapeHtml(field.colId) + '"' + checked + ' />' +
      '<label class="fr-label" for="' + id + '">' + escapeHtml(field.label) + '</label>' +
      '</div>';
  }

  function renderDateLike(field, value, inputType) {
    var id = fieldId(field);
    var val = value == null ? '' : value;
    var reqAttr = field.required ? ' required' : '';
    return '<div class="fr-input-group" data-colid="' + escapeHtml(field.colId) + '">' +
      renderLabel(field, id) +
      '<input class="fr-input" type="' + inputType + '" id="' + id + '" name="' + escapeHtml(field.colId) +
      '" value="' + escapeHtml(val) + '"' + reqAttr + ' />' +
      '</div>';
  }

  function renderSelect(field, value, optionsList) {
    var id = fieldId(field);
    var options = resolveOptions(field, optionsList);
    var reqAttr = field.required ? ' required' : '';
    var placeholder = '<option value="">' + (field.required ? 'Choisir…' : '(aucun)') + '</option>';
    var optsHtml = placeholder + options.map(function (o) {
      var sel = sameValue(value, o.value) ? ' selected' : '';
      return '<option value="' + escapeHtml(o.value) + '"' + sel + '>' + escapeHtml(o.label) + '</option>';
    }).join('');
    return '<div class="fr-select-group" data-colid="' + escapeHtml(field.colId) + '">' +
      renderLabel(field, id) +
      '<select class="fr-select" id="' + id + '" name="' + escapeHtml(field.colId) + '"' + reqAttr + '>' +
      optsHtml + '</select>' +
      '</div>';
  }

  function renderRadio(field, value, optionsList) {
    var options = resolveOptions(field, optionsList);
    var itemsHtml = options.map(function (o, i) {
      var oid = fieldId(field) + '-' + i;
      var checked = sameValue(value, o.value) ? ' checked' : '';
      return '<div class="fr-radio-group">' +
        '<input type="radio" id="' + oid + '" name="' + escapeHtml(field.colId) + '" value="' + escapeHtml(o.value) + '"' + checked + ' />' +
        '<label class="fr-label" for="' + oid + '">' + escapeHtml(o.label) + '</label>' +
        '</div>';
    }).join('');
    return '<fieldset class="fr-fieldset" data-colid="' + escapeHtml(field.colId) + '" data-widget="radio">' +
      renderLegend(field) + '<div class="fr-fieldset__content">' + itemsHtml + '</div></fieldset>';
  }

  function renderMultiselect(field, value, optionsList) {
    var options = resolveOptions(field, optionsList);
    var selected = Array.isArray(value) ? value.map(String) : [];
    var itemsHtml = options.map(function (o, i) {
      var oid = fieldId(field) + '-' + i;
      var checked = selected.indexOf(String(o.value)) !== -1 ? ' checked' : '';
      return '<div class="fr-checkbox-group">' +
        '<input type="checkbox" id="' + oid + '" name="' + escapeHtml(field.colId) + '" value="' + escapeHtml(o.value) + '"' + checked + ' />' +
        '<label class="fr-label" for="' + oid + '">' + escapeHtml(o.label) + '</label>' +
        '</div>';
    }).join('');
    return '<fieldset class="fr-fieldset" data-colid="' + escapeHtml(field.colId) + '" data-widget="multiselect">' +
      renderLegend(field) + '<div class="fr-fieldset__content">' + itemsHtml + '</div></fieldset>';
  }

  /**
   * « Non concerné » : une réponse, pas une absence de réponse.
   *
   * Elle s'écrit vide dans la colonne — un entier ne sait pas porter ce sens —
   * mais elle vaut réponse à la validation, et elle se distingue d'une question
   * jamais posée tant que le formulaire déclare une colonne pour la recueillir
   * (`meta.nspCol`). Sans elle, les deux se confondent dans le vide, ce qui
   * reste préférable au 0 que Grist écrirait si on omettait la colonne.
   */
  var VALEUR_NON_CONCERNE = 'NSP';

  /** L'échelle d'un champ, telle que le formulaire la déclare, avec ses défauts. */
  function echelleDe(formDef, field) {
    var id = field && field.options && field.options.echelle;
    var e = (formDef && formDef.echelles && formDef.echelles[id]) || {};
    var min = Number.isFinite(e.min) ? e.min : 1;
    var max = Number.isFinite(e.max) ? e.max : 5;
    return {
      min: min,
      max: max > min ? max : min + 4,
      libelles: Array.isArray(e.libelles) && e.libelles.length === 2 ? e.libelles : null,
      nonConcerne: !!e.nonConcerne
    };
  }

  /** Les boutons d'une échelle — partagés par le champ seul et la matrice. */
  function boutonsEchelle(field, value, e) {
    var html = '';
    for (var n = e.min; n <= e.max; n++) {
      var oid = fieldId(field) + '-' + n;
      var coche = sameValue(value, n) ? ' checked' : '';
      html += '<div class="fr-radio-group fr-echelle__cran">' +
        '<input type="radio" id="' + oid + '" name="' + escapeHtml(field.colId) + '" value="' + n + '"' + coche + ' />' +
        '<label class="fr-label" for="' + oid + '">' + n + '</label></div>';
    }
    if (e.nonConcerne) {
      var nid = fieldId(field) + '-nsp';
      var cocheNsp = value === VALEUR_NON_CONCERNE ? ' checked' : '';
      html += '<div class="fr-radio-group fr-echelle__nsp">' +
        '<input type="radio" id="' + nid + '" name="' + escapeHtml(field.colId) + '" value="' +
        VALEUR_NON_CONCERNE + '"' + cocheNsp + ' />' +
        '<label class="fr-label" for="' + nid + '">Non concerné</label></div>';
    }
    return '<div class="fr-echelle__crans">' + html + '</div>';
  }

  /** Les deux libellés d'extrémité : ce qui dit ce que « 1 » et « 5 » veulent dire. */
  function ancresEchelle(e) {
    if (!e.libelles) return '';
    return '<div class="fr-echelle__ancres">' +
      '<span>' + e.min + ' · ' + escapeHtml(e.libelles[0]) + '</span>' +
      '<span>' + escapeHtml(e.libelles[1]) + ' · ' + e.max + '</span></div>';
  }

  function renderEchelle(field, value, optionsList, formDef) {
    var e = echelleDe(formDef, field);
    return '<fieldset class="fr-fieldset fr-echelle" data-colid="' + escapeHtml(field.colId) + '" data-widget="echelle">' +
      renderLegend(field) +
      '<div class="fr-fieldset__content">' + boutonsEchelle(field, value, e) + ancresEchelle(e) + '</div>' +
      '</fieldset>';
  }

  /**
   * Une matrice : plusieurs affirmations qui partagent une échelle.
   *
   * Ce n'est pas un type, c'est une mise en page — les champs restent des
   * échelles ordinaires, chacun dans sa colonne. L'échelle n'est annoncée
   * qu'une fois, en tête, au lieu d'être répétée sous chaque ligne.
   */
  function renderMatrice(groupe, values, formDef, champsEnErreur) {
    var e = echelleDe(formDef, groupe.fields[0]);
    var lignes = groupe.fields.map(function (f) {
      var erreur = champsEnErreur && champsEnErreur.indexOf(f.colId) !== -1
        ? '<p class="fr-error-text" data-error-for="' + escapeHtml(f.colId) + '">Ce champ est obligatoire.</p>'
        : '';
      return '<div class="fr-matrice__ligne" data-colid="' + escapeHtml(f.colId) + '">' +
        '<span class="fr-matrice__intitule">' + escapeHtml(f.label) + requiredHint(f) + '</span>' +
        boutonsEchelle(f, values[f.colId], e) + erreur + '</div>';
    }).join('');
    return '<fieldset class="fr-fieldset fr-matrice" data-matrice="' + escapeHtml(groupe.matrice) + '">' +
      (groupe.titre ? '<legend class="fr-fieldset__legend">' + escapeHtml(groupe.titre) + '</legend>' : '') +
      ancresEchelle(e) + '<div class="fr-fieldset__content">' + lignes + '</div></fieldset>';
  }

  /**
   * Les champs d'une étape, regroupés : les échelles qui se suivent et partagent
   * une matrice forment un bloc, le reste va seul.
   */
  function grouperParMatrice(fields) {
    var groupes = [];
    var courant = null;
    (fields || []).forEach(function (f) {
      var m = f.options && f.options.matrice;
      if (m && courant && courant.matrice === m) { courant.fields.push(f); return; }
      if (m) { courant = { matrice: m, fields: [f] }; groupes.push(courant); return; }
      courant = null;
      groupes.push({ fields: [f] });
    });
    return groupes;
  }

  function renderLikert(field, value) {
    var itemsHtml = '';
    for (var i = 1; i <= 5; i++) {
      var oid = fieldId(field) + '-' + i;
      var checked = sameValue(value, i) ? ' checked' : '';
      itemsHtml += '<div class="fr-radio-group fr-radio-rich">' +
        '<input type="radio" id="' + oid + '" name="' + escapeHtml(field.colId) + '" value="' + i + '"' + checked + ' />' +
        '<label class="fr-label" for="' + oid + '">' + i + '</label>' +
        '</div>';
    }
    return '<fieldset class="fr-fieldset fr-likert" data-colid="' + escapeHtml(field.colId) + '" data-widget="likert">' +
      renderLegend(field) + '<div class="fr-fieldset__content fr-likert__scale">' + itemsHtml + '</div></fieldset>';
  }

  /** Un appareil a doigt, donc probablement un appareil photo sous la main. */
  function prefereAppareilPhoto() {
    try {
      return typeof window !== 'undefined' && !!window.matchMedia &&
        window.matchMedia('(pointer: coarse)').matches;
    } catch (e) { return false; }
  }

  function renderFile(field, value) {
    var id = fieldId(field);
    var reqAttr = field.required ? ' required' : '';
    var accept = (field.options && field.options.accept) || '';
    var maxFiles = (field.options && field.options.maxFiles) || 5;
    var acceptAttr = accept ? ' accept="' + escapeHtml(accept) + '"' : '';
    var names = [];
    if (Attachments.filesFromValue) {
      names = Attachments.filesFromValue(value).map(function (f) { return f.name; });
    }
    if (!names.length && Attachments.idsFromValue) {
      var ids = Attachments.idsFromValue(value);
      if (ids.length) names = ids.map(function (x) { return 'fichier #' + x; });
    }
    var hint = names.length
      ? '<p class="fr-hint-text">' + escapeHtml(names.join(', ')) + '</p>'
      : '<p class="fr-hint-text">Jusqu\'à ' + maxFiles + ' fichier(s)</p>';
    // Sur un appareil tactile, un champ qui accepte des images propose aussi la
    // prise de vue. Sans l'attribut `capture`, le telephone n'ouvre qu'un
    // selecteur de fichiers : on devait photographier ailleurs, puis retrouver
    // la photo dans la galerie. Les deux champs portent le meme nom et se lisent
    // ensemble (`readFieldValue`). Sur ordinateur, `capture` n'a pas d'effet :
    // le second bouton n'y serait qu'un doublon, il n'est pas rendu.
    var accepteImages = !accept || /image/i.test(accept);
    var camera = accepteImages && prefereAppareilPhoto()
      ? '<input class="fr-upload fr-upload--camera" type="file" id="' + id + '-camera" name="' +
        escapeHtml(field.colId) + '" accept="image/*" capture="environment" />' +
        '<label class="fr-btn fr-btn--secondary fr-btn--sm fr-upload-camera" for="' + id + '-camera">' +
        'Prendre une photo</label>'
      : '';
    return '<div class="fr-upload-group" data-colid="' + escapeHtml(field.colId) + '" data-widget="file">' +
      renderLabel(field, id) +
      '<input class="fr-upload" type="file" id="' + id + '" name="' + escapeHtml(field.colId) +
      '" multiple' + acceptAttr + reqAttr + ' />' + camera + hint + '</div>';
  }

  var WIDGET_RENDERERS = {
    text: function (f, v) { return renderTextLike(f, v, false); },
    textarea: function (f, v) { return renderTextLike(f, v, true); },
    number: renderNumber,
    checkbox: renderCheckbox,
    date: function (f, v) { return renderDateLike(f, v, 'date'); },
    datetime: function (f, v) { return renderDateLike(f, v, 'datetime-local'); },
    select: function (f, v, opts) { return renderSelect(f, v, opts); },
    radio: function (f, v, opts) { return renderRadio(f, v, opts); },
    multiselect: function (f, v, opts) { return renderMultiselect(f, v, opts); },
    likert: function (f, v) { return renderLikert(f, v); },
    echelle: function (f, v, opts, def) { return renderEchelle(f, v, opts, def); },
    file: function (f, v) { return renderFile(f, v); }
  };

  // renderFieldHtml : field → chaîne HTML échappée, DSFR (fr-input, fr-select, ...).
  /**
   * Un widget inconnu retombe sur celui que son type Grist appelle, pas sur du
   * texte.
   *
   * C'est la règle de dégradation : un formulaire composé avec une saisie que
   * ce moteur ne connaît pas encore — une copie figée, embarquée ailleurs —
   * doit rendre une question utilisable. Un `Bool` devient une case, pas un
   * champ texte où la personne écrirait « oui ».
   */
  function renderFieldHtml(field, values, optionsList, formDef) {
    values = values || {};
    var value = values[field.colId];
    var parDefaut = Types && Types.defaultWidget ? Types.defaultWidget(field && field.type) : 'text';
    var renderer = WIDGET_RENDERERS[field && field.widget] ||
      WIDGET_RENDERERS[parDefaut] || WIDGET_RENDERERS.text;
    return renderer(field, value, optionsList, formDef);
  }

  // ── mount : runtime navigateur — étapes visibles, validation requise, submit ──
  function getVisibleSections(formDef, values, context) {
    var sections = (formDef && formDef.sections) || [];
    var out = [];
    for (var i = 0; i < sections.length; i++) {
      if (isSectionVisible(sections[i], values, context)) out.push(sections[i]);
    }
    return out;
  }

  function getVisibleFields(section, values, context) {
    var fields = (section && section.fields) || [];
    var out = [];
    for (var i = 0; i < fields.length; i++) {
      if (isFieldVisible(fields[i], values, context)) out.push(fields[i]);
    }
    return out;
  }

  function optionsForField(field, formDef) {
    var key = (field.options && field.options.choicesKey) || field.colId;
    var fromDef = formDef && formDef.choices && formDef.choices[key];
    if (Array.isArray(fromDef)) return fromDef;
    if (field.options && Array.isArray(field.options.choices)) return field.options.choices;
    return null;
  }

  function readFieldValue(rootEl, field, previous) {
    if (field.widget === 'checkbox') {
      var cb = rootEl.querySelector('[name="' + field.colId + '"]');
      return cb ? !!cb.checked : false;
    }
    if (field.widget === 'radio' || field.widget === 'likert' || field.widget === 'echelle') {
      var checkedRadio = rootEl.querySelector('input[name="' + field.colId + '"]:checked');
      return checkedRadio ? checkedRadio.value : null;
    }
    if (field.widget === 'multiselect') {
      var checkedBoxes = rootEl.querySelectorAll('input[name="' + field.colId + '"]:checked');
      var arr = [];
      for (var i = 0; i < checkedBoxes.length; i++) arr.push(checkedBoxes[i].value);
      return arr;
    }
    if (field.widget === 'file') {
      // Deux champs peuvent porter ce nom : la selection de fichiers et la
      // prise de vue. On lit les deux.
      var selecteur = 'input[type="file"][name="' + field.colId + '"]';
      var champs = typeof rootEl.querySelectorAll === 'function'
        ? Array.prototype.slice.call(rootEl.querySelectorAll(selecteur))
        : [rootEl.querySelector(selecteur)];
      var choisis = [];
      champs.forEach(function (c) {
        if (c && c.files && c.files.length) choisis = choisis.concat(Array.prototype.slice.call(c.files));
      });
      if (choisis.length) return choisis;
      // Re-render recrée l'input vide : conserver la sélection précédente
      return previous != null ? previous : null;
    }
    var el = rootEl.querySelector('[name="' + field.colId + '"]');
    return el ? el.value : null;
  }

  function readSectionValues(rootEl, fields, values) {
    for (var i = 0; i < fields.length; i++) {
      values[fields[i].colId] = readFieldValue(rootEl, fields[i], values[fields[i].colId]);
    }
    return values;
  }

  function validateRequired(fields, values) {
    var missing = [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f.required) continue;
      var v = values[f.colId];
      var empty;
      if (f.widget === 'checkbox') empty = v !== true;
      else empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
      if (empty) missing.push(f.colId);
    }
    return missing;
  }

  // defaultSubmit : bridge.submit | updateRow si editRowId | addRow | BulkAddRecord
  function defaultSubmit(bridge, formDef, data) {
    var editId = (bridge && bridge.editRowId) || (formDef && formDef.editRowId) || null;
    if (editId != null && bridge && typeof bridge.updateRow === 'function') {
      return Promise.resolve(bridge.updateRow(formDef.tableId, editId, data));
    }
    if (bridge && typeof bridge.submit === 'function') {
      return Promise.resolve(bridge.submit(data));
    }
    if (bridge && typeof bridge.addRow === 'function') {
      return Promise.resolve(bridge.addRow(formDef.tableId, data));
    }
    if (typeof window !== 'undefined' && window.grist && window.grist.docApi && window.grist.docApi.applyUserActions) {
      if (editId != null) {
        return Promise.resolve(window.grist.docApi.applyUserActions([
          ['UpdateRecord', formDef.tableId, editId, data]
        ]));
      }
      var cols = {};
      for (var k in data) { if (Object.prototype.hasOwnProperty.call(data, k)) cols[k] = [data[k]]; }
      return Promise.resolve(window.grist.docApi.applyUserActions([
        ['BulkAddRecord', formDef.tableId, [null], cols]
      ]));
    }
    return Promise.reject(new Error('[Engine.mount] aucun mécanisme de soumission (bridge.submit / bridge.addRow / grist.docApi)'));
  }

  /**
   * `Ref` ou `RefList`, que le type soit nu ou complet (`Ref:Domaines`).
   *
   * Un formulaire déduit d'une table porte le type complet de Grist. Le moteur
   * ne reconnaissait que le type nu : il ne chargeait pas la table visée, et la
   * liste n'offrait que « (aucun) » — constaté le 01/10/2026 dans la fiche
   * d'Atlas, en Grist réel, sur une colonne remplie. Enregistrer aurait vidé
   * la référence.
   */
  function typeRef(type) {
    var t = Types && Types.normalizeGristType ? Types.normalizeGristType(type) : type;
    return (t === 'Ref' || t === 'RefList') ? t : '';
  }

  function resolveRefTable(field) {
    if (!field) return '';
    if (field.refTable) return field.refTable;
    if (field.options && field.options.refTable) return field.options.refTable;
    var m = /^Ref(?:List)?:(.+)$/.exec(String(field.type || ''));
    return m ? m[1] : '';
  }

  /**
   * La colonne qui nomme une ligne de la table visée, quand le formulaire ne la
   * déclare pas : `Nom` si elle existe, sinon la première colonne dont les
   * valeurs sont du texte non vide, sinon aucune (les choix montrent l'id).
   */
  function colonneLibelle(records) {
    if (!records) return null;
    var n = (records.id || []).length;
    var cles = Object.keys(records).filter(function (k) {
      return k !== 'id' && k !== 'manualSort' && k.indexOf('gristHelper_') !== 0 && Array.isArray(records[k]);
    });
    // Un nom qui dit « libellé » prime sur l'ordre des colonnes : avec `Code`
    // avant `Libelle`, la liste affichait les codes.
    var nommee = cles.filter(function (k) { return /^(nom|name|libell?e|titre|label)(_|$)/i.test(k); });
    var candidates = nommee.concat(cles.filter(function (k) { return nommee.indexOf(k) === -1; }));
    for (var i = 0; i < candidates.length; i++) {
      var col = records[candidates[i]];
      var textes = 0;
      for (var j = 0; j < n; j++) {
        var v = col[j];
        // Du texte à lire : ni adresse web, ni courriel, ni suite de chiffres (un code).
        if (typeof v === 'string' && v.trim() && v.indexOf('://') === -1 &&
            !/^\S+@\S+$/.test(v.trim()) && !/^\d+$/.test(v.trim())) textes++;
      }
      if (n && textes / n >= 0.8) return candidates[i];
    }
    return null;
  }

  function rowsToColumnar(rows) {
    var out = { id: [] };
    if (!rows || !rows.length) return out;
    Object.keys(rows[0]).forEach(function (k) { out[k] = []; });
    rows.forEach(function (row) {
      Object.keys(out).forEach(function (k) { out[k].push(row[k]); });
    });
    return out;
  }

  function choicesFromRefRecords(records, visibleCol) {
    if (!records || !records.id) return [];
    var col = visibleCol && records[visibleCol] ? visibleCol : colonneLibelle(records);
    var labels = col ? records[col] : null;
    var out = [];
    for (var i = 0; i < records.id.length; i++) {
      out.push({ value: records.id[i], label: labels ? labels[i] : String(records.id[i]) });
    }
    return out;
  }

  function collectRefTableIds(formDef) {
    var seen = {};
    var out = [];
    (formDef.sections || []).forEach(function (sec) {
      (sec.fields || []).forEach(function (f) {
        if (!typeRef(f.type)) return;
        var t = resolveRefTable(f);
        if (t && !seen[t]) { seen[t] = true; out.push(t); }
      });
    });
    return out;
  }

  // mount : multi-étapes + cascade Ref (loadTable) + editRowId (UpdateRecord) + context.
  /**
   * Valeurs de depart, filtrees par ce que le formulaire declare.
   *
   * `mount` ouvrait sur `{}` en dur : `editRowId` faisait ECRIRE dans une ligne
   * existante, jamais LIRE la sienne. Et `collectSubmitData` emet TOUS les
   * champs visibles — ouvrir un objet, cocher une case et enregistrer effacait
   * donc son nom et sa hauteur. Le chemin etait cable depuis toujours et jamais
   * exerce : son seul consommateur, l'app terrain, ne fait que de la creation.
   *
   * Un consommateur qui edite avait tente d'amorcer le DOM apres le montage.
   * Cela ne tient pas : un formulaire multi-etapes ne rend que l'etape
   * courante, et les champs des suivantes n'existent pas encore. Les valeurs
   * doivent donc entrer ICI, avant le premier rendu.
   *
   * On ne retient que ce que le formulaire declare — une valeur qu'il ignore
   * n'a rien a faire dans `values`.
   */
  function initialValues(formDef, fournies) {
    var out = {};
    if (!fournies) return out;
    var sections = (formDef && formDef.sections) || [];
    for (var i = 0; i < sections.length; i++) {
      var fields = sections[i].fields || [];
      for (var j = 0; j < fields.length; j++) {
        var colId = fields[j].colId;
        if (Object.prototype.hasOwnProperty.call(fournies, colId)) out[colId] = fournies[colId];
      }
    }
    return out;
  }

  /**
   * Le sens inverse de `Types.coerceForWrite` : une ligne Grist telle qu'elle
   * arrive (`onRecord`, `fetchTable`) vers les valeurs que les champs rendent.
   *
   * > **L'écriture existait, la lecture non.** Chaque hôte qui ouvrait un
   * > formulaire sur une ligne existante la réécrivait pour lui : Atlas en a
   * > fait `valeurPourFormulaire`, la vue publiée ne l'a jamais fait — et
   * > montrait donc des champs vides sur une ligne pleine. Enregistrer vidait
   * > la ligne.
   *
   * Les dates sont le point délicat : Grist les garde en **secondes**. Une
   * `Date` est minuit UTC et se rend telle quelle (`AAAA-MM-JJ` en UTC) ; un
   * `DateTime` est un instant, qui se rend dans l'heure de la personne —
   * c'est ainsi que `coerceForWrite` le relira.
   */
  function valuesFromRecord(formDef, record) {
    var out = {};
    if (!record) return out;
    var sections = (formDef && formDef.sections) || [];
    for (var i = 0; i < sections.length; i++) {
      var fields = sections[i].fields || [];
      for (var j = 0; j < fields.length; j++) {
        var field = fields[j];
        if (!Object.prototype.hasOwnProperty.call(record, field.colId)) continue;
        var v = valueFromCell(field, record[field.colId]);
        if (v !== undefined) out[field.colId] = v;
      }
    }
    return out;
  }

  function deuxChiffres(n) { return (n < 10 ? '0' : '') + n; }

  /** Secondes Unix, millisecondes ou `Date` → `Date`, sinon `null`. */
  function versDate(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v === 'number' && isFinite(v)) {
      // 1e11 secondes tombe en l'an 5138, 1e11 millisecondes en 1973 : le seuil sépare sans ambiguïté.
      return new Date(Math.abs(v) < 1e11 ? v * 1000 : v);
    }
    var d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
  }

  function valueFromCell(field, raw) {
    if (raw === undefined || raw === null || raw === '') return undefined;
    var t = Types && Types.normalizeGristType ? Types.normalizeGristType(field.type) : field.type;
    if (t === 'Date' || t === 'DateTime') {
      var d = versDate(raw);
      if (!d) return undefined;
      if (t === 'Date') return d.toISOString().slice(0, 10);
      return d.getFullYear() + '-' + deuxChiffres(d.getMonth() + 1) + '-' + deuxChiffres(d.getDate()) +
        'T' + deuxChiffres(d.getHours()) + ':' + deuxChiffres(d.getMinutes());
    }
    if (t === 'Attachments') return raw;
    if (Array.isArray(raw)) {
      var items = (raw[0] === 'L' ? raw.slice(1) : raw);
      return items.length ? items.map(String) : undefined;
    }
    if (t === 'Bool') return raw === true || raw === 1 || String(raw).toLowerCase() === 'true';
    // Une référence vide vaut 0 côté Grist : ce n'est pas une ligne.
    if (t === 'Ref') return Number(raw) > 0 ? raw : undefined;
    return raw;
  }

  function mount(rootEl, formDef, bridge) {
    if (!rootEl) return null;
    bridge = bridge || {};
    var values = initialValues(formDef, bridge.values);
    var stepIndex = 0;
    var errorFields = [];
    var submitting = false;
    var submitError = '';
    var refRecords = bridge.refRecords || {};
    // Un changement de champ redessine le formulaire : conditions, cascades et
    // filtres dynamiques en dependent. Mais pour un champ texte, `change` part
    // quand on le quitte — c'est-a-dire a l'instant ou l'on appuie sur
    // « Enregistrer ». Redessiner a ce moment remplacait le bouton entre
    // l'appui et le relachement : le navigateur n'emettait pas de clic, et il
    // fallait cliquer deux fois. Constate le 11/09/2026 dans la fiche d'Atlas,
    // en Grist reel. Au clavier, Tab perdait le focus pour la meme raison.
    //
    // Le rendu attend donc que le pointeur soit relache, passe au tour suivant
    // sinon, et rend le focus au champ qui l'avait.
    var renduEnAttente = false;
    var pointeurEnfonce = false;
    if (typeof rootEl.addEventListener === 'function') {
      rootEl.addEventListener('pointerdown', function () {
        var doc = rootEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
        if (!doc || typeof doc.addEventListener !== 'function') return;
        pointeurEnfonce = true;
        // Sur le document : le doigt peut se lever hors du formulaire.
        doc.addEventListener('pointerup', relacherPointeur, { capture: true, once: true });
        doc.addEventListener('pointercancel', relacherPointeur, { capture: true, once: true });
      }, true);
    }
    var context = (SessionContext.emptyContext && SessionContext.emptyContext()) || {
      inGristWidget: false, canWriteNative: false, isLoggedIn: false, userEmail: '', groups: []
    };
    if (bridge.context) {
      Object.keys(bridge.context).forEach(function (k) { context[k] = bridge.context[k]; });
    }

    function loader() {
      if (typeof bridge.loadTable === 'function') return bridge.loadTable.bind(bridge);
      if (typeof window !== 'undefined' && window.GristBridge && window.GristBridge.loadTable) {
        return window.GristBridge.loadTable;
      }
      return null;
    }

    function resolveOptionsForField(field) {
      var base = optionsForField(field, formDef);
      var refTable = resolveRefTable(field);
      if (typeRef(field.type) && refTable && refRecords[refTable]) {
        var vis = field.options && field.options.visibleCol;
        base = choicesFromRefRecords(refRecords[refTable], vis);
      }
      var normalized = Array.isArray(base) ? base.map(normalizeOption) : [];
      if (field.cascade && field.cascade.parentField && field.cascade.parentRefCol && refTable && refRecords[refTable]) {
        normalized = filterCascadeOptions(
          normalized, refRecords[refTable], field.cascade.parentRefCol, values[field.cascade.parentField]
        );
      } else if (field.dynamicFilter && field.dynamicFilter.parentField && field.dynamicFilter.filterColumn &&
                 refTable && refRecords[refTable]) {
        var resolvedParent = resolveParentFilterValue(field, values, formDef, refRecords);
        normalized = filterDynamicOptions(
          normalized, refRecords[refTable], field.dynamicFilter.filterColumn, resolvedParent
        );
      }
      // L'ordre des choix que l'auteur a demandé — alphabétique pour une liste
      // de personnes, par exemple. Sans demande, l'ordre de la table.
      var ordre = field.options && field.options.sortOrder;
      if ((ordre === 'ascending' || ordre === 'descending') && normalized.length > 1) {
        normalized = normalized.slice().sort(function (a, b) {
          var c = String(a.label).localeCompare(String(b.label), 'fr', { sensitivity: 'base', numeric: true });
          return ordre === 'descending' ? -c : c;
        });
      }
      return normalized.length ? normalized : (optionsForField(field, formDef) || null);
    }

    /** Invalide valeurs Ref hors liste filtrée (cascade ou dynamicFilter). */
    function pruneInvalidFilteredValues() {
      (formDef.sections || []).forEach(function (sec) {
        (sec.fields || []).forEach(function (field) {
          if (!(field.cascade && field.cascade.parentField) &&
              !(field.dynamicFilter && field.dynamicFilter.parentField)) return;
          var cur = values[field.colId];
          if (cur == null || cur === '') return;
          var opts = resolveOptionsForField(field) || [];
          var ok = opts.some(function (o) { return sameRefValue(o.value, cur); });
          if (!ok) {
            values[field.colId] = typeRef(field.type) === 'RefList' ? [] : null;
          }
        });
      });
    }

    function planifierRendu() {
      renduEnAttente = true;
      if (!pointeurEnfonce) setTimeout(rendreEnAttente, 0);
    }

    function relacherPointeur() {
      pointeurEnfonce = false;
      // Apres le tour courant : le clic suit le relachement dans la meme tache.
      if (renduEnAttente) setTimeout(rendreEnAttente, 0);
    }

    function rendreEnAttente() {
      if (!renduEnAttente) return;
      renduEnAttente = false;
      // Le clic a lance l'envoi : son propre rendu fait foi.
      if (submitting) return;
      var doc = rootEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
      var actif = doc && doc.activeElement;
      var idActif = actif && typeof rootEl.contains === 'function' && rootEl.contains(actif)
        ? actif.id : '';
      render();
      if (idActif && doc && typeof doc.getElementById === 'function') {
        var cible = doc.getElementById(idActif);
        if (cible && typeof cible.focus === 'function') cible.focus();
      }
    }

    function render() {
      var sections = getVisibleSections(formDef, values, context);
      if (!sections.length) {
        rootEl.innerHTML = '<div class="fr-alert fr-alert--info"><p>Aucune section visible.</p></div>';
        return;
      }
      if (stepIndex >= sections.length) stepIndex = sections.length - 1;
      if (stepIndex < 0) stepIndex = 0;
      var section = sections[stepIndex];
      var fields = getVisibleFields(section, values, context);
      var isLast = stepIndex === sections.length - 1;
      var editId = bridge.editRowId || formDef.editRowId;
      var editHint = editId
        ? '<p class="fr-text--sm">Modification de la ligne #' + escapeHtml(editId) + '</p>'
        : '';

      var brand = formDef.branding || {};
      var logoHtml = renderBrandImg(brand.logoUrl, brand.logoAlt, 'fr-form__brand fr-form__brand--logo');
      var headerHtml = '';
      if (stepIndex === 0 && (formDef.title || formDef.description || logoHtml)) {
        headerHtml = '<header class="fr-form__header">' +
          logoHtml +
          (formDef.title ? '<h1 class="fr-h4">' + escapeHtml(formDef.title) + '</h1>' : '') +
          (formDef.description ? '<p class="fr-text--sm">' + escapeHtml(formDef.description) + '</p>' : '') +
          '</header>';
      }

      var stepperHtml = '<nav class="fr-stepper" aria-label="Étapes du formulaire">' +
        '<p class="fr-stepper__title">' + escapeHtml(section.label) +
        '<span class="fr-stepper__state">Étape ' + (stepIndex + 1) + ' sur ' + sections.length + '</span></p>' +
        '</nav>';

      // Les échelles qui se suivent et partagent une matrice sont rendues
      // ensemble : l'échelle n'est annoncée qu'une fois, pas sous chaque ligne.
      var fieldsHtml = grouperParMatrice(fields).map(function (groupe) {
        if (groupe.matrice && groupe.fields.length > 1) {
          return renderMatrice(groupe, values, formDef, errorFields);
        }
        var f = groupe.fields[0];
        var opts = resolveOptionsForField(f);
        var html = renderFieldHtml(f, values, opts, formDef);
        if (errorFields.indexOf(f.colId) !== -1) {
          html += '<p class="fr-error-text" data-error-for="' + escapeHtml(f.colId) + '">Ce champ est obligatoire.</p>';
        }
        return html;
      }).join('');

      var errorHtml = submitError
        ? '<div class="fr-alert fr-alert--error" role="alert"><p>' + escapeHtml(submitError) + '</p></div>'
        : '';

      var navHtml = '<div class="fr-btns-group fr-btns-group--inline">' +
        (stepIndex > 0 ? '<button type="button" class="fr-btn fr-btn--secondary" data-action="prev">Précédent</button>' : '') +
        (isLast
          ? '<button type="button" class="fr-btn" data-action="submit"' + (submitting ? ' disabled' : '') + '>' +
            (submitting ? 'Envoi…' : (editId ? 'Enregistrer' : 'Envoyer')) + '</button>'
          : '<button type="button" class="fr-btn" data-action="next">Suivant</button>') +
        '</div>';

      rootEl.innerHTML = '<form class="fr-form" novalidate>' + editHint + headerHtml + stepperHtml + errorHtml + fieldsHtml + navHtml + '</form>';
      wireEvents(fields);
    }

    function wireEvents(fields) {
      if (typeof rootEl.querySelectorAll !== 'function') return;
      var inputs = rootEl.querySelectorAll('input, select, textarea');
      for (var i = 0; i < inputs.length; i++) {
        if (typeof inputs[i].addEventListener === 'function') {
          inputs[i].addEventListener('change', function () {
            readSectionValues(rootEl, fields, values);
            pruneInvalidFilteredValues();
            planifierRendu();
          });
        }
      }
      var prevBtn = rootEl.querySelector('[data-action="prev"]');
      if (prevBtn && typeof prevBtn.addEventListener === 'function') {
        prevBtn.addEventListener('click', function () {
          readSectionValues(rootEl, fields, values);
          stepIndex -= 1; errorFields = []; render();
        });
      }
      var nextBtn = rootEl.querySelector('[data-action="next"]');
      if (nextBtn && typeof nextBtn.addEventListener === 'function') {
        nextBtn.addEventListener('click', function () {
          readSectionValues(rootEl, fields, values);
          var missing = validateRequired(fields, values);
          if (missing.length) { errorFields = missing; render(); return; }
          errorFields = []; stepIndex += 1; render();
        });
      }
      var submitBtn = rootEl.querySelector('[data-action="submit"]');
      if (submitBtn && typeof submitBtn.addEventListener === 'function') {
        submitBtn.addEventListener('click', function () {
          readSectionValues(rootEl, fields, values);
          var missing = validateRequired(fields, values);
          if (missing.length) { errorFields = missing; render(); return; }
          errorFields = []; submitting = true; submitError = ''; render();
          var resolveAtt = Attachments.resolveAttachmentFields
            ? Attachments.resolveAttachmentFields(formDef, values, {
                // Un hôte qui sait envoyer lui-même le fait : c'est le seul
                // chemin possible hors du navigateur (application empaquetée).
                uploadFile: bridge.uploadFile,
                getAccessToken: bridge.getAccessToken ||
                  (typeof window !== 'undefined' && window.grist && window.grist.docApi
                    ? function (opts) { return window.grist.docApi.getAccessToken(opts); }
                    : null),
                fetch: bridge.fetch
              })
            : Promise.resolve(values);
          Promise.resolve(resolveAtt).then(function () {
            var enCreation = !(bridge.editRowId || formDef.editRowId);
            var data = collectSubmitData(formDef, values, context, { creation: enCreation });
            return defaultSubmit(bridge, formDef, data);
          }).then(function () {
            submitting = false;
            var brandDone = formDef.branding || {};
            var successImg = renderBrandImg(
              brandDone.successImageUrl,
              brandDone.successImageAlt,
              'fr-form__brand fr-form__brand--success'
            );
            rootEl.innerHTML = '<div class="fr-form__success" role="status">' +
              successImg +
              (formDef.title ? '<p class="fr-text--sm">' + escapeHtml(formDef.title) + '</p>' : '') +
              '<div class="fr-alert fr-alert--success"><p>' +
              escapeHtml(formDef.successMessage || 'Formulaire envoyé avec succès.') +
              '</p></div></div>';
          }, function (err) {
            submitting = false;
            submitError = (err && err.message) || 'Erreur lors de l\'envoi.';
            render();
          });
        });
      }
    }

    function boot() {
      var load = loader();
      var tables = collectRefTableIds(formDef);
      var aud = SessionContext.audienceConfig ? SessionContext.audienceConfig(formDef) : { mode: 'none', probe: false };
      if (SessionContext.detectInGristWidget) {
        context.inGristWidget = SessionContext.detectInGristWidget();
        if (context.inGristWidget && !context.userEmail) context.isLoggedIn = true;
      }

      function afterContext(ctx) {
        if (ctx) {
          Object.keys(ctx).forEach(function (k) { context[k] = ctx[k]; });
        }
        if (!load || !tables.length) { render(); return; }
        Promise.all(tables.map(function (t) {
          if (refRecords[t]) return Promise.resolve();
          return Promise.resolve(load(t)).then(function (rows) {
            refRecords[t] = Array.isArray(rows) ? rowsToColumnar(rows) : rows;
          }, function () {});
        })).then(function () {
          bridge.refRecords = refRecords;
          render();
        });
      }

      var needsAsyncProbe = !bridge.skipProbe && (
        !!bridge.getUserEmail ||
        aud.mode === 'bind' ||
        aud.probe ||
        !!bridge.forceProbe
      );

      if (!needsAsyncProbe) {
        afterContext(bridge.context || context);
        return;
      }

      var probeFn = SessionContext.probe || function () { return Promise.resolve(context); };
      var probeBridge = {
        loadTable: load,
        listTables: bridge.listTables ||
          (typeof window !== 'undefined' && window.grist && window.grist.docApi
            ? function () { return window.grist.docApi.listTables(); } : null),
        addRow: bridge.addRow || (typeof window !== 'undefined' && window.GristBridge && window.GristBridge.addRow
          ? window.GristBridge.addRow : null),
        deleteRow: bridge.deleteRow || (typeof window !== 'undefined' && window.GristBridge && window.GristBridge.deleteRow
          ? window.GristBridge.deleteRow : null),
        getUserEmail: bridge.getUserEmail || null
      };
      Promise.resolve(probeFn(probeBridge, formDef, bridge.context ? { forceContext: Object.assign({}, context, bridge.context) } : {}))
        .then(afterContext, function () { afterContext(context); });
    }

    boot();
    return { getValues: function () { return values; }, getContext: function () { return context; }, render: render };
  }

  return {
    evaluateCondition: evaluateCondition,
    evaluateRule: evaluateRule,
    isSectionVisible: isSectionVisible,
    isFieldVisible: isFieldVisible,
    collectSubmitData: collectSubmitData,
    filterCascadeOptions: filterCascadeOptions,
    filterDynamicOptions: filterDynamicOptions,
    resolveParentFilterValue: resolveParentFilterValue,
    escapeHtml: escapeHtml,
    renderFieldHtml: renderFieldHtml,
    valuesFromRecord: valuesFromRecord,
    // Ce que le moteur sait rendre, dit par lui-même : une page de couverture
    // ou un compositeur n'ont pas à en tenir une copie, qui vieillirait.
    WIDGETS: Object.keys(WIDGET_RENDERERS),
    KINDS: ['echelle'],
    VALEUR_NON_CONCERNE: VALEUR_NON_CONCERNE,
    echelleDe: echelleDe,
    grouperParMatrice: grouperParMatrice,
    mount: mount
  };
}));
