/*
 * client-contrat.js — Le pont de ce dépôt, sous la forme du contrat de données.
 *
 * Le gabarit de dispositif (`donnees/CONTRAT.md`) fixe une surface d'accès aux
 * données que tout socle honore : `lireTable(table)` colonnaire,
 * `appliquer(actions, etiquette)` en UserActions Grist. `grist-bridge.js`, lui,
 * a sa propre forme (`fetchTable`, `applyUserActions`, `addRow`…). Ce module
 * traduit dans les deux sens :
 *
 *   depuisPont(pont)   un pont grist-bridge  →  un client du contrat
 *   versPont(client)   un client du contrat  →  un pont grist-bridge
 *
 * Le premier sert à monter un formulaire (`FormEngine.monter(el, def, { client })`)
 * dans un widget Grist avec le même code que sur un autre socle ; le second à
 * faire tourner ce qui parle encore « pont » (le compositeur, la publication)
 * au-dessus d'un client du contrat.
 *
 * > **Ce socle n'a pas de file hors ligne.** Le pont écrit en direct : une
 * > écriture réussit ou lève. `tailleFile()` vaut 0, `synchroniser()` n'a rien
 * > à envoyer, `fileEnEchec()` est vide — la surface est honorée, la garantie
 * > d'ordre hors ligne est celle d'un socle qui en a une, pas de celui-ci.
 *
 * Sans dépendance : Node et navigateur (`window.FormClientContrat`).
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.FormClientContrat = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Colonnaire { id: [...], col: [...] } → lignes [{ id, col }]. */
  function versLignes(d) {
    if (!d || !d.id) return [];
    var n = d.id.length;
    var out = [];
    for (var i = 0; i < n; i++) {
      var o = { id: d.id[i] };
      for (var k in d) {
        if (k !== 'id' && Object.prototype.hasOwnProperty.call(d, k)) {
          var c = d[k];
          o[k] = (c && c[i] != null) ? c[i] : null;
        }
      }
      out.push(o);
    }
    return out;
  }

  /** Ce que rend `appliquer` : toujours { retValues } ou { enfile: true }. */
  function resultat(res) {
    if (res && res.enfile) return res;
    if (Array.isArray(res)) return { retValues: res };
    if (res && Array.isArray(res.retValues)) return res;
    return { retValues: [] };
  }

  /**
   * Un pont `grist-bridge.js` vu comme un client du contrat de données.
   *
   * @param {object} [pont]  `{ fetchTable(table), applyUserActions(actions) }` ;
   *        par défaut `window.GristBridge`
   * @param {object} [opts]
   * @param {object} [opts.docApi]    `grist.docApi`, pour `listerTables` (défaut : celui de la page)
   * @param {object|function} [opts.identite]  `{ email, role }` ou une fonction qui le rend
   * @param {function} [opts.surEnregistrement]  branche `onRecord` (défaut : `grist.onRecord`)
   */
  function depuisPont(pont, opts) {
    opts = opts || {};
    pont = pont || (typeof window !== 'undefined' ? window.GristBridge : null);
    if (!pont || typeof pont.fetchTable !== 'function' || typeof pont.applyUserActions !== 'function') {
      throw new TypeError('[client-contrat] pont invalide : il faut fetchTable(table) et ' +
        'applyUserActions(actions), ceux de shared/grist-bridge.js.');
    }

    function docApi() {
      if (opts.docApi) return opts.docApi;
      return (typeof window !== 'undefined' && window.grist && window.grist.docApi) || null;
    }

    function lireTable(table) {
      // Un seul argument, comme `fetchTable` de Grist : ni colonnes, ni filtre.
      // Un socle qui en accepterait rendrait un sous-ensemble sans le dire.
      return Promise.resolve(pont.fetchTable(table));
    }

    return {
      mode: 'grist',
      init: function () { return Promise.resolve(true); },
      lireTable: lireTable,
      lireLigne: function (table, id) {
        return lireTable(table).then(function (d) {
          var i = d && d.id ? d.id.indexOf(id) : -1;
          if (i < 0) return null;
          var o = {};
          Object.keys(d).forEach(function (c) { o[c] = d[c][i]; });
          return o;
        });
      },
      listerTables: function () {
        var api = docApi();
        if (!api || typeof api.listTables !== 'function') {
          return Promise.reject(new Error('[client-contrat] listerTables : docApi.listTables est indisponible.'));
        }
        return Promise.resolve(api.listTables());
      },
      // `etiquette` nomme l'écriture dans une file ; ce socle n'en a pas.
      appliquer: function (actions, etiquette) {
        return Promise.resolve(pont.applyUserActions(actions)).then(resultat);
      },
      synchroniser: function () { return Promise.resolve({ envoyes: 0, restants: 0 }); },
      tailleFile: function () { return Promise.resolve(0); },
      surFile: function (rappel) { if (typeof rappel === 'function') rappel(0); },
      fileEnEchec: function () { return Promise.resolve([]); },
      identite: function () {
        var id = typeof opts.identite === 'function' ? opts.identite() : opts.identite;
        return Promise.resolve(id || { email: '', role: 'grist' });
      },
      urlImage: function () { return null; },
      surEnregistrement: function (rappel) {
        if (typeof opts.surEnregistrement === 'function') return opts.surEnregistrement(rappel);
        if (typeof window !== 'undefined' && window.grist && typeof window.grist.onRecord === 'function') {
          window.grist.onRecord(rappel);
        }
        return undefined;
      }
    };
  }

  /**
   * Un client du contrat vu comme un pont `grist-bridge.js`.
   *
   * Même surface que `GristBridge` (`fetchTable`, `loadTable`, `applyUserActions`,
   * `addRow`, `updateRow`, `deleteRow`) : ce qui parle « pont » tourne tel quel
   * sur un autre socle. Une écriture mise en file par le client
   * (`{ enfile: true }`) est rendue telle quelle par `applyUserActions` ;
   * `addRow` et ses voisins, qui promettent la table à jour, relisent alors
   * ce que le client sait en donner — ce qui n'inclut pas l'écriture en attente.
   */
  function versPont(client) {
    if (!client || typeof client.lireTable !== 'function' || typeof client.appliquer !== 'function') {
      throw new TypeError('[client-contrat] client invalide : il faut lireTable(table) et ' +
        'appliquer(actions, etiquette), ceux du contrat de données.');
    }

    function fetchTable(table) { return Promise.resolve(client.lireTable(table)); }
    function loadTable(table) { return fetchTable(table).then(versLignes); }
    function applyUserActions(actions, etiquette) { return Promise.resolve(client.appliquer(actions, etiquette)); }
    function applyAndFetch(actions, table) {
      return applyUserActions(actions).then(function () { return loadTable(table); });
    }

    return {
      util: { toRows: versLignes },
      fetchTable: fetchTable,
      loadTable: loadTable,
      applyUserActions: applyUserActions,
      applyAndFetch: applyAndFetch,
      // Une ligne : chaque valeur dans un tableau d'un élément, pour qu'une
      // cellule-liste (['L', 1, 2]) reste UNE cellule et non N lignes.
      addRow: function (table, fields) {
        var cols = {};
        Object.keys(fields || {}).forEach(function (k) { cols[k] = [fields[k]]; });
        // Comme `GristBridge.addRow` : la table à jour, avec l'identifiant de la ligne ajoutée en `idCree`
        // (non énumérable) pour que le formulaire relise SA ligne après l'envoi.
        return applyUserActions([['BulkAddRecord', table, [null], cols]], undefined).then(function (res) {
          var id = res && Array.isArray(res.retValues) ? res.retValues[0] : (Array.isArray(res) ? res[0] : null);
          if (Array.isArray(id)) id = id[0];
          // Relecture au mieux : la ligne est écrite, une table illisible ne doit pas faire échouer l'envoi.
          return loadTable(table).then(function (rows) { return rows; }, function () { return []; }).then(function (rows) {
            if (typeof id === 'number' && Array.isArray(rows)) Object.defineProperty(rows, 'idCree', { value: id, enumerable: false });
            return rows;
          });
        });
      },
      updateRow: function (table, id, fields) { return applyAndFetch([['UpdateRecord', table, id, fields]], table); },
      deleteRow: function (table, id) { return applyAndFetch([['RemoveRecord', table, id]], table); },
      version: 'client-contrat-1.0'
    };
  }

  return {
    depuisPont: depuisPont,
    versPont: versPont,
    versLignes: versLignes
  };
}));
