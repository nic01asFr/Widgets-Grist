/*
 * session-context.js — Probe standard Grist (widget Chartreux + audience table).
 * Expose window.SessionContext / module.exports.
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.SessionContext = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function emptyContext() {
    return {
      inGristWidget: false,
      canWriteNative: false,
      isLoggedIn: false,
      userEmail: '',
      groups: []
    };
  }

  /** Heuristique Chartreux : API plugin dans une iframe widget. */
  function detectInGristWidget() {
    try {
      if (typeof window === 'undefined') return false;
      if (!window.grist) return false;
      return window.self !== window.top;
    } catch (e) {
      return false;
    }
  }

  function normalizeEmail(v) {
    if (v == null || v === '') return '';
    return String(v).trim().toLowerCase();
  }

  function audienceConfig(formDef) {
    var a = (formDef && formDef.audience) || {};
    return {
      mode: a.mode === 'bind' ? 'bind' : 'none',
      tableId: a.tableId || '',
      emailCol: a.emailCol || 'Email',
      groupCol: a.groupCol || '',
      probe: !!a.probe
    };
  }

  function rowsFromLoad(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (raw.id && typeof raw.id.length === 'number') {
      var n = raw.id.length;
      var out = [];
      for (var i = 0; i < n; i++) {
        var o = { id: raw.id[i] };
        for (var k in raw) {
          if (k === 'id') continue;
          o[k] = raw[k] ? raw[k][i] : null;
        }
        out.push(o);
      }
      return out;
    }
    return [];
  }

  function groupsForEmail(rows, emailCol, groupCol, email) {
    var want = normalizeEmail(email);
    if (!want || !groupCol) return [];
    var set = {};
    rows.forEach(function (r) {
      if (normalizeEmail(r[emailCol]) !== want) return;
      var g = r[groupCol];
      if (g == null || g === '') return;
      if (Array.isArray(g)) {
        g.forEach(function (x) { if (x != null && x !== '') set[String(x)] = true; });
      } else if (typeof g === 'string' && g.indexOf(',') !== -1) {
        g.split(',').forEach(function (x) {
          x = x.trim();
          if (x) set[x] = true;
        });
      } else {
        set[String(g)] = true;
      }
    });
    return Object.keys(set);
  }

  /**
   * Probe async. bridge: { loadTable?, addRow?, deleteRow?, getUserEmail? }
   * opts.forceContext : injecter un contexte (tests).
   */
  function probe(bridge, formDef, opts) {
    opts = opts || {};
    bridge = bridge || {};
    if (opts.forceContext) {
      return Promise.resolve(Object.assign(emptyContext(), opts.forceContext));
    }

    var ctx = emptyContext();
    ctx.inGristWidget = detectInGristWidget();

    var aud = audienceConfig(formDef);

    function finish() {
      if (ctx.userEmail) ctx.isLoggedIn = true;
      else if (ctx.inGristWidget) ctx.isLoggedIn = true; // approx. session doc
      else ctx.isLoggedIn = false;
      return ctx;
    }

    function loadAudienceThen(email) {
      if (aud.mode !== 'bind' || !aud.tableId || typeof bridge.loadTable !== 'function') {
        return Promise.resolve(finish());
      }
      return Promise.resolve(bridge.loadTable(aud.tableId)).then(function (raw) {
        var rows = rowsFromLoad(raw);
        if (email) {
          ctx.userEmail = normalizeEmail(email) || ctx.userEmail;
          ctx.groups = groupsForEmail(rows, aud.emailCol, aud.groupCol, ctx.userEmail);
        }
        return finish();
      }, function () { return finish(); });
    }

    var chain = Promise.resolve();

    if (ctx.inGristWidget) {
      chain = chain.then(function () {
        if (typeof bridge.listTables === 'function') {
          return Promise.resolve(bridge.listTables()).then(function () {
            ctx.canWriteNative = true;
          }, function () { ctx.canWriteNative = false; });
        }
        if (typeof window !== 'undefined' && window.grist && window.grist.docApi && window.grist.docApi.listTables) {
          return Promise.resolve(window.grist.docApi.listTables()).then(function () {
            ctx.canWriteNative = true;
          }, function () { /* keep */ });
        }
        return null;
      });
    }

    if (typeof bridge.getUserEmail === 'function') {
      chain = chain.then(function () {
        return Promise.resolve(bridge.getUserEmail()).then(function (em) {
          if (em) ctx.userEmail = normalizeEmail(em);
        }, function () {});
      });
    }

    // Probe optionnel : AddRecord + lecture formule user.Email + DeleteRecord
    if (aud.probe && aud.mode === 'bind' && aud.tableId && ctx.inGristWidget &&
        typeof bridge.addRow === 'function' && typeof bridge.loadTable === 'function') {
      chain = chain.then(function () {
        if (ctx.userEmail) return null;
        return Promise.resolve(bridge.addRow(aud.tableId, {})).then(function (res) {
          var id = Array.isArray(res) && res[0] && res[0].id != null ? res[0].id
            : (res && res.id != null ? res.id : null);
          return Promise.resolve(bridge.loadTable(aud.tableId)).then(function (raw) {
            var rows = rowsFromLoad(raw);
            var row = id != null ? rows.filter(function (r) { return String(r.id) === String(id); })[0] : rows[rows.length - 1];
            if (row && row[aud.emailCol]) ctx.userEmail = normalizeEmail(row[aud.emailCol]);
            if (id != null && typeof bridge.deleteRow === 'function') {
              return Promise.resolve(bridge.deleteRow(aud.tableId, id)).then(function () {}, function () {});
            }
            return null;
          });
        }, function () {});
      });
    }

    return chain.then(function () {
      return loadAudienceThen(ctx.userEmail);
    }, function () { return finish(); });
  }

  /** Sync helper tests / démo. */
  function fromDemo(overrides) {
    return Object.assign(emptyContext(), overrides || {});
  }

  return {
    emptyContext: emptyContext,
    detectInGristWidget: detectInGristWidget,
    audienceConfig: audienceConfig,
    groupsForEmail: groupsForEmail,
    normalizeEmail: normalizeEmail,
    probe: probe,
    fromDemo: fromDemo,
    rowsFromLoad: rowsFromLoad
  };
}));
