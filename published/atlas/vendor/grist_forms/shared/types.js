(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.FormTypes = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalizeGristType(t) {
    if (!t) return 'Text';
    if (t.startsWith('RefList:')) return 'RefList';
    if (t.startsWith('Ref:')) return 'Ref';
    return t;
  }

  function defaultWidget(t) {
    var map = {
      Text: 'text', Int: 'number', Numeric: 'number', Bool: 'checkbox',
      Date: 'date', DateTime: 'datetime', Choice: 'select', ChoiceList: 'multiselect',
      Ref: 'select', RefList: 'multiselect', Attachments: 'file'
    };
    return map[normalizeGristType(t)] || 'text';
  }

  function coerceForWrite(field, raw) {
    var t = normalizeGristType(field.type);
    if (raw === '' || raw == null) return null;
    if (t === 'Attachments') {
      var ids;
      if (Array.isArray(raw) && raw[0] === 'L') {
        ids = raw.slice(1).map(function (x) { return parseInt(x, 10); })
          .filter(function (n) { return Number.isFinite(n); });
      } else {
        ids = (Array.isArray(raw) ? raw : [raw])
          .map(function (x) { return parseInt(x, 10); })
          .filter(function (n) { return Number.isFinite(n); });
      }
      return ids.length ? ['L'].concat(ids) : null;
    }
    if (t === 'Bool') {
      if (raw === true || raw === 1) return true;
      if (raw === false || raw === 0) return false;
      if (typeof raw === 'string') {
        var s = raw.trim().toLowerCase();
        if (s === 'false' || s === '0' || s === 'non' || s === 'no' || s === '') return false;
        if (s === 'true' || s === '1' || s === 'oui' || s === 'yes') return true;
      }
      return !!raw;
    }
    if (t === 'Int' || t === 'Numeric' || t === 'Ref') {
      var n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    if (t === 'Date' || t === 'DateTime') {
      var d = typeof raw === 'string' ? new Date(raw) : raw;
      return Number.isFinite(d.getTime()) ? Math.floor(d.getTime() / 1000) : null;
    }
    if (t === 'ChoiceList') {
      var arr = Array.isArray(raw) ? raw : [raw];
      return arr.length ? ['L'].concat(arr) : null;
    }
    if (t === 'RefList') {
      var ids = (Array.isArray(raw) ? raw : [raw])
        .map(function (x) { return parseInt(x, 10); })
        .filter(function (n) { return Number.isFinite(n); });
      return ids.length ? ['L'].concat(ids) : null;
    }
    return raw;
  }

  return {
    normalizeGristType: normalizeGristType,
    defaultWidget: defaultWidget,
    coerceForWrite: coerceForWrite
  };
}));
