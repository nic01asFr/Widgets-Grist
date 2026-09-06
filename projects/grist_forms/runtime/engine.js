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

  function collectSubmitData(formDef, values, context) {
    var out = {};
    var sections = (formDef && formDef.sections) || [];
    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      if (!isSectionVisible(section, values, context)) continue;
      var fields = section.fields || [];
      for (var j = 0; j < fields.length; j++) {
        var field = fields[j];
        if (!isFieldVisible(field, values, context)) continue;
        out[field.colId] = Types.coerceForWrite(field, values[field.colId]);
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

  function renderLabel(field, forId) {
    return '<label class="fr-label" for="' + escapeHtml(forId) + '">' +
      escapeHtml(field.label) + requiredHint(field) + '</label>';
  }

  function renderLegend(field) {
    return '<legend class="fr-fieldset__legend">' + escapeHtml(field.label) + requiredHint(field) + '</legend>';
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
    return '<div class="fr-upload-group" data-colid="' + escapeHtml(field.colId) + '" data-widget="file">' +
      renderLabel(field, id) +
      '<input class="fr-upload" type="file" id="' + id + '" name="' + escapeHtml(field.colId) +
      '" multiple' + acceptAttr + reqAttr + ' />' + hint + '</div>';
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
    file: function (f, v) { return renderFile(f, v); }
  };

  // renderFieldHtml : field → chaîne HTML échappée, DSFR (fr-input, fr-select, ...).
  function renderFieldHtml(field, values, optionsList) {
    values = values || {};
    var value = values[field.colId];
    var renderer = WIDGET_RENDERERS[field && field.widget] || WIDGET_RENDERERS.text;
    return renderer(field, value, optionsList);
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
    if (field.widget === 'radio' || field.widget === 'likert') {
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
      var fileInput = rootEl.querySelector('input[type="file"][name="' + field.colId + '"]');
      if (fileInput && fileInput.files && fileInput.files.length) {
        return Array.prototype.slice.call(fileInput.files);
      }
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

  function resolveRefTable(field) {
    if (!field) return '';
    if (field.refTable) return field.refTable;
    if (field.options && field.options.refTable) return field.options.refTable;
    return '';
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
    var labels = visibleCol && records[visibleCol] ? records[visibleCol] : null;
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
        if (f.type !== 'Ref' && f.type !== 'RefList') return;
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

  function mount(rootEl, formDef, bridge) {
    if (!rootEl) return null;
    bridge = bridge || {};
    var values = initialValues(formDef, bridge.values);
    var stepIndex = 0;
    var errorFields = [];
    var submitting = false;
    var submitError = '';
    var refRecords = bridge.refRecords || {};
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
      if ((field.type === 'Ref' || field.type === 'RefList') && refTable && refRecords[refTable]) {
        var vis = (field.options && field.options.visibleCol) || 'Nom';
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
            values[field.colId] = field.type === 'RefList' ? [] : null;
          }
        });
      });
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

      var fieldsHtml = fields.map(function (f) {
        var opts = resolveOptionsForField(f);
        var html = renderFieldHtml(f, values, opts);
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
            render();
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
                getAccessToken: bridge.getAccessToken ||
                  (typeof window !== 'undefined' && window.grist && window.grist.docApi
                    ? function (opts) { return window.grist.docApi.getAccessToken(opts); }
                    : null),
                fetch: bridge.fetch
              })
            : Promise.resolve(values);
          Promise.resolve(resolveAtt).then(function () {
            var data = collectSubmitData(formDef, values, context);
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
    mount: mount
  };
}));
