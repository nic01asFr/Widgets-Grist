/*
 * liens-table.js — un formulaire qui ajoute une ligne rattachée à une autre.
 *
 * ## Le motif, et pourquoi il n'a rien de cartographique
 *
 * Atlas sait déjà faire cela : une table dont une colonne référence celle de la
 * couche, et dont chaque ligne est un relevé de l'objet. Mais le motif ne parle
 * pas de carte. C'est le même geste qui porte les heures d'une tâche, les
 * dépenses d'une catégorie, les visites d'un ouvrage, les occupants d'un
 * logement, et les points dessinés d'une enquête — qui aujourd'hui ne portent
 * rien parce que personne ne leur a donné de table.
 *
 * Ce module ne touche ni Grist ni le DOM : il rend des identifiants, des
 * actions et des refus. L'appelant envoie.
 *
 * ## Quatre faits mesurés en Grist réel (1.7.18, 04/10/2026)
 *
 * 1. **Un lot d'actions est atomique.** Un lot dont la seconde action échoue ne
 *    laisse rien de la première. On peut donc créer la table et sa colonne
 *    inverse d'un seul envoi.
 * 2. **Une ligne créée dans un lot ne peut pas y être désignée** : son
 *    identifiant n'est rendu qu'au retour. Le parent s'écrit donc avant ses
 *    enfants, en deux envois — jamais l'inverse, qui produirait des orphelins.
 * 3. **Écrire cinq lignes d'un coup coûte cinq fois moins cher** que cinq
 *    écritures (105 ms contre 535 ms). D'où `planLignesLiees`, qui groupe.
 * 4. **La colonne inverse est un garde-fou, pas seulement un confort.** Sans
 *    elle, Grist accepte un rattachement vers une ligne inexistante (`999`
 *    reste écrit tel quel) ; avec elle, il le refuse. Et le parent liste ses
 *    enfants nativement, sans formule ni widget — ce que la règle « rien
 *    d'illisible sans le formulaire » demande.
 *
 * Ce que ce module ne fait pas : supprimer une table, retyper une colonne,
 * créer quoi que ce soit sans qu'on l'ait demandé. L'empreinte laissée dans le
 * document de quelqu'un d'autre est un sujet en soi.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.LiensTable = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Le nom par défaut de la colonne de rattachement — celui qu'Atlas pose déjà. */
  var VIA_DEFAUT = 'Objet';

  /** Tables que Grist tient pour lui, et celles que ce dépôt pose à côté des données. */
  var TABLES_HORS_DONNEES = /^(_grist_|GristSummary_|GristHidden_)/;

  function estTableSysteme(tableId) {
    return TABLES_HORS_DONNEES.test(String(tableId || ''));
  }

  function identifiantValide(id) {
    return typeof id === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(id) && id.length <= 60;
  }

  function sansAccents(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[æÆ]/g, 'ae').replace(/[œŒ]/g, 'oe');
  }

  /**
   * Un identifiant de table depuis un nom lisible, jamais déjà pris.
   *
   * @param {string} nom
   * @param {string[]} [tables] les tables du document
   */
  function nomDeTableLibre(nom, tables) {
    var v = sansAccents(nom).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!v) return '';
    if (/^\d/.test(v)) v = 'T_' + v;
    v = v.slice(0, 60).replace(/_+$/, '');
    v = v.charAt(0).toUpperCase() + v.slice(1);
    var pris = {};
    (tables || []).forEach(function (t) { pris[String(t).toLowerCase()] = true; });
    var id = v;
    for (var i = 2; pris[id.toLowerCase()]; i++) id = v + '_' + i;
    return id;
  }

  /**
   * Les tables qui rattachent leurs lignes à celle-ci.
   *
   * Une colonne à formule ne compte pas : elle calcule un lien, elle ne le
   * porte pas, et y écrire n'aurait aucun effet.
   *
   * @param {Record<string, Array<{colId: string, type: string, isFormula?: boolean}>>} schema
   * @param {string} tableId
   * @returns {Array<{table: string, via: string}>}
   */
  function tablesLiees(schema, tableId) {
    if (!schema || !tableId) return [];
    var attendu = 'Ref:' + tableId;
    var out = [];
    Object.keys(schema).forEach(function (autre) {
      if (autre === tableId || estTableSysteme(autre)) return;
      var colonnes = schema[autre] || [];
      for (var i = 0; i < colonnes.length; i++) {
        var c = colonnes[i];
        if (c && c.type === attendu && !c.isFormula) { out.push({ table: autre, via: c.colId }); return; }
      }
    });
    return out;
  }

  /**
   * Le plan d'une table liée : une colonne de rattachement, les champs, et la
   * colonne inverse qui fait voir au parent ses lignes.
   *
   * Les deux actions partent ensemble : le lot est atomique, donc il n'existe
   * pas d'état où la table serait créée sans son garde-fou.
   *
   * @param {object} o
   * @param {string} o.nom           ce que la personne appelle ces lignes (« Visites »)
   * @param {string} o.tableParent   la table à laquelle elles se rattachent
   * @param {Array<{id: string, type: string, label?: string, widgetOptions?: string}>} o.champs
   * @param {string} [o.libelleParent] libellé de la colonne de rattachement
   * @param {string[]} [o.tables]    les tables du document, pour ne pas prendre un nom pris
   * @param {string} [o.via]         le nom de la colonne de rattachement
   * @param {boolean} [o.colonneInverse=true]
   * @returns {{ok: true, tableId: string, via: string, colonnes: object[], actions: any[][]}
   *          | {ok: false, erreur: string}}
   */
  function planTableLiee(o) {
    o = o || {};
    var nom = String(o.nom == null ? '' : o.nom).replace(/\s+/g, ' ').trim();
    if (!nom) return { ok: false, erreur: 'Donnez un nom à ces lignes.' };
    if (!o.tableParent) return { ok: false, erreur: 'Aucune table à laquelle les rattacher.' };
    if (!identifiantValide(o.tableParent)) {
      return { ok: false, erreur: 'Identifiant de table invalide : « ' + o.tableParent + ' ».' };
    }
    var champs = o.champs || [];
    if (!champs.length) return { ok: false, erreur: 'Ajoutez au moins un champ.' };

    var via = o.via || VIA_DEFAUT;
    if (!identifiantValide(via)) return { ok: false, erreur: 'Nom de rattachement invalide : « ' + via + ' ».' };

    var tableId = nomDeTableLibre(nom, o.tables);
    if (!tableId) return { ok: false, erreur: 'Le nom doit contenir au moins une lettre ou un chiffre.' };

    // La colonne de rattachement vient en premier : un champ qui porterait son
    // nom ne doit pas la remplacer, il doit être refusé.
    var colonnes = [{ id: via, type: 'Ref:' + o.tableParent, label: o.libelleParent || o.tableParent }];
    var pris = {};
    pris[via.toLowerCase()] = true;
    for (var i = 0; i < champs.length; i++) {
      var c = champs[i];
      if (!c || !identifiantValide(c.id)) {
        return { ok: false, erreur: 'Identifiant de colonne invalide : « ' + (c && c.id) + ' ».' };
      }
      if (pris[c.id.toLowerCase()]) {
        return { ok: false, erreur: 'Deux colonnes porteraient le nom « ' + c.id + ' ».' };
      }
      pris[c.id.toLowerCase()] = true;
      var def = { id: c.id, type: c.type || 'Text' };
      if (c.label) def.label = c.label;
      if (c.widgetOptions) def.widgetOptions = c.widgetOptions;
      colonnes.push(def);
    }

    var actions = [['AddTable', tableId, colonnes]];
    if (o.colonneInverse !== false) actions.push(['AddReverseColumn', tableId, via]);
    return { ok: true, tableId: tableId, via: via, colonnes: colonnes, actions: actions };
  }

  /**
   * Les lignes à écrire sous un parent, en une seule action.
   *
   * Le rattachement n'est pas une question : c'est le contexte qui le porte —
   * l'objet qu'on a ouvert, la ligne où est le curseur. Sans lui, on refuse
   * plutôt que d'écrire des lignes rattachées à rien : `0` est une valeur que
   * Grist accepte sans broncher, et personne ne retrouverait ces lignes.
   *
   * @param {object} o
   * @param {string} o.tableId
   * @param {string} o.via
   * @param {number} o.parentId
   * @param {Array<Record<string, any>>} o.lignes valeurs déjà converties pour Grist
   * @returns {{ok: true, actions: any[][]} | {ok: false, erreur: string}}
   */
  function planLignesLiees(o) {
    o = o || {};
    var lignes = o.lignes || [];
    if (!o.tableId) return { ok: false, erreur: 'Aucune table où écrire.' };
    if (!o.via) return { ok: false, erreur: 'Aucune colonne de rattachement.' };
    var parentId = Number(o.parentId);
    if (!isFinite(parentId) || parentId <= 0) {
      return { ok: false, erreur: 'Aucune ligne à laquelle rattacher la saisie.' };
    }
    if (!lignes.length) return { ok: true, actions: [] };

    var colonnes = {};
    lignes.forEach(function (ligne) {
      Object.keys(ligne || {}).forEach(function (k) { if (k !== o.via) colonnes[k] = true; });
    });
    var cles = Object.keys(colonnes);
    var paquet = {};
    paquet[o.via] = lignes.map(function () { return parentId; });
    cles.forEach(function (k) {
      paquet[k] = lignes.map(function (l) {
        return Object.prototype.hasOwnProperty.call(l || {}, k) ? l[k] : null;
      });
    });
    var ids = lignes.map(function () { return null; });
    // Une écriture groupée plutôt qu'une par ligne : mesuré cinq fois plus rapide.
    return { ok: true, actions: [['BulkAddRecord', o.tableId, ids, paquet]] };
  }

  /**
   * Ce qu'un refus de Grist veut dire, dans les mots de la personne.
   *
   * Les formes sont celles que Grist rend réellement (mesurées le 04/10/2026) :
   * `KeyError 'X'` pour une colonne ou une table absente, `AssertionError …
   * non-existent record #N` pour une ligne parente disparue entre l'ouverture
   * du formulaire et son envoi.
   */
  function messageRefus(erreur) {
    var msg = String((erreur && erreur.message) || erreur || '');
    if (/non-existent record/i.test(msg)) {
      return 'La ligne à laquelle cette saisie se rattache n’existe plus. Rouvrez-la et recommencez.';
    }
    if (/KeyError/i.test(msg)) {
      return 'Le document ne contient pas ce que le formulaire attendait. Rechargez-le et réessayez.';
    }
    if (/not allowed|access denied|forbidden/i.test(msg)) {
      return 'Grist refuse : vos droits ne permettent pas d’écrire dans cette table.';
    }
    return 'Grist refuse : ' + (msg || 'erreur inconnue');
  }

  return {
    VIA_DEFAUT: VIA_DEFAUT,
    estTableSysteme: estTableSysteme,
    identifiantValide: identifiantValide,
    nomDeTableLibre: nomDeTableLibre,
    tablesLiees: tablesLiees,
    planTableLiee: planTableLiee,
    planLignesLiees: planLignesLiees,
    messageRefus: messageRefus
  };
}));
