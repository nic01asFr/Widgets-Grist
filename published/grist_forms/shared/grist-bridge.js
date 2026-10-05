/*
 * grist-bridge.js — Couche DX Grist portable, sans dépendance, distribuable en <script>.
 *
 * POURQUOI : Grist expose une API bas niveau où fetchTable renvoie du COLONNAIRE
 * ({id:[...], col:[...]}) et où les Bulk*Record attendent des valeurs en tableaux
 * alignés sur rowIds. Les LLM (et beaucoup d'humains) s'y trompent -> listes vides,
 * "IndexError list index out of range", etc. Ce module fournit une surface FOOLPROOF
 * (loadTable -> objets, addRow/updateRow/deleteRow -> liste à jour) au-dessus de
 * l'API Grist, quelle que soit sa provenance :
 *   - API Grist NATIVE (grist-plugin-api.js, vrai custom widget), OU
 *   - bridge postMessage injecté par un hôte (ex: widget Coder d'artefactory-mcp).
 * Les deux exposent window.grist.docApi.{fetchTable, applyUserActions}; ce module
 * construit les helpers par-dessus ce plus petit dénominateur commun.
 *
 * C'est la brique « couche read/write Grist standard » : ce que tout widget
 * de ce dépôt embarque pour lire et écrire dans un document.
 * L'échappement WAF (<script> -> \\u003c) et le découpage des gros lots (BatchSync)
 * vivent CÔTÉ SERVEUR (grist_coder.py) car les écritures navigateur passent en direct
 * par Grist (hors WAF) ; ce module ne porte donc que la DX client.
 *
 * Chargement : balise script src="grist-bridge.js" → window.GristBridge.
 * Version alignée sur le bridge validé E2E d'artefactory-mcp (widget.html).
 */
(function (root, factory) {
  'use strict';
  if (typeof process !== 'undefined' && process.versions && process.versions.node &&
      typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.GristBridge = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── util : conversions Grist <-> JS (les pièges classiques, une fois pour toutes) ──
  var util = {
    // Colonnaire Grist {id:[...],col:[...]} -> tableau d'objets [{id,col},...].
    toRows: function (d) {
      if (!d || !d.id) return [];
      var n = d.id.length, r = [];
      for (var i = 0; i < n; i++) {
        var o = { id: d.id[i] };
        for (var k in d) { if (k !== 'id') { var c = d[k]; o[k] = (c && c[i] != null) ? c[i] : null; } }
        r.push(o);
      }
      return r;
    },
    // Grist stocke les dates/datetimes en SECONDES Unix ; JS en millisecondes.
    toDate: function (ts) { return ts ? new Date(ts * 1000) : null; },
    fromDate: function (x) {
      if (x == null) return null;
      if (typeof x === 'string') x = new Date(x);
      return Math.floor(x.getTime() / 1000);
    },
    // RefList Grist = tableau préfixé 'L' : ['L', 3, 7]. Ref simple = entier.
    refIds: function (l) { return (l && l[0] === 'L') ? l.slice(1) : (Array.isArray(l) ? l : []); },
    toRefList: function (a) {
      return (a && a.length) ? ['L'].concat(a.map(function (i) { return parseInt(i, 10); })) : null;
    },
    // Échappement anti-XSS via textContent (pas de regex).
    esc: function (t) {
      if (typeof document === 'undefined') return String(t == null ? '' : t);
      var d = document.createElement('div');
      d.textContent = (t == null ? '' : String(t));
      return d.innerHTML;
    }
  };

  // ── Normalisation défensive des Bulk*Record : valeurs scalaires -> tableaux ──
  // Grist attend {Nom:['Dupont']} (aligné sur rowIds), les LLM écrivent {Nom:'Dupont'}.
  var BULK = { BulkAddRecord: 1, BulkUpdateRecord: 1, BulkAddOrReplaceRecord: 1 };
  function normalizeUserActions(actions) {
    if (!Array.isArray(actions)) return actions;
    return actions.map(function (a) {
      if (!Array.isArray(a) || a.length < 4 || !BULK[a[0]]) return a;
      var cols = a[3];
      if (!cols || typeof cols !== 'object' || Array.isArray(cols)) return a;
      var rowIds = a[2], keys = Object.keys(cols);
      var n = Array.isArray(rowIds) ? rowIds.length : 1;
      keys.forEach(function (k) { if (Array.isArray(cols[k])) n = Math.max(n, cols[k].length); });
      if (n < 1) n = 1;
      var newRowIds = Array.isArray(rowIds) ? rowIds.slice() : [];
      while (newRowIds.length < n) newRowIds.push(null);
      var newCols = {};
      keys.forEach(function (k) {
        var v = cols[k];
        if (Array.isArray(v)) {
          var arr = v.slice();
          while (arr.length < n) arr.push(arr.length ? arr[arr.length - 1] : null);
          newCols[k] = arr;
        } else {
          var filled = []; for (var i = 0; i < n; i++) filled.push(v);
          newCols[k] = filled;
        }
      });
      return [a[0], a[1], newRowIds, newCols];
    });
  }

  // ── Résolution de l'API Grist sous-jacente (native OU bridge hôte) ──
  function docApi() {
    if (typeof window !== 'undefined' && window.grist && window.grist.docApi) return window.grist.docApi;
    throw new Error('[grist-bridge] window.grist.docApi introuvable (ni Grist natif ni bridge hôte). '
      + 'Charge grist-plugin-api.js, ou exécute dans un hôte qui injecte le bridge.');
  }

  function fetchTable(t) { return Promise.resolve(docApi().fetchTable(t)); }

  // loadTable : la lecture prête à l'emploi -> tableau d'objets (fini le colonnaire).
  function loadTable(t) { return fetchTable(t).then(util.toRows); }

  function applyUserActions(actions) { return Promise.resolve(docApi().applyUserActions(normalizeUserActions(actions))); }

  // applyAndFetch : écrit PUIS renvoie la table à jour (objets). Refresh déterministe.
  function applyAndFetch(actions, table) {
    return applyUserActions(actions).then(function () { return fetchTable(table); }).then(util.toRows);
  }

  // CRUD foolproof : bonne UserAction construite + liste à jour renvoyée.
  // addRow = UNE ligne : on construit le colonnaire nous-mêmes en enveloppant CHAQUE
  // valeur (listes incluses) dans un tableau 1-élément -> une cellule ChoiceList/RefList
  // ['L',v1,v2] devient [['L',v1,v2]] = 1 cellule-liste, pas N lignes (sinon corruption
  // des champs multi-choix). NE PAS déléguer la mise en colonnaire à normalizeUserActions
  // qui ne peut pas distinguer « liste-cellule » de « N valeurs par ligne ».
  function addRow(table, fields) {
    var cols = {};
    for (var k in fields) { if (Object.prototype.hasOwnProperty.call(fields, k)) cols[k] = [fields[k]]; }
    return applyAndFetch([['BulkAddRecord', table, [null], cols]], table);
  }
  function updateRow(table, id, fields) { return applyAndFetch([['UpdateRecord', table, id, fields]], table); }
  function deleteRow(table, id)         { return applyAndFetch([['RemoveRecord', table, id]], table); }

  return {
    util: util,
    normalizeUserActions: normalizeUserActions,
    fetchTable: fetchTable,
    loadTable: loadTable,
    applyUserActions: applyUserActions,
    applyAndFetch: applyAndFetch,
    addRow: addRow,
    updateRow: updateRow,
    deleteRow: deleteRow,
    version: '1.0.0'
  };
}));
