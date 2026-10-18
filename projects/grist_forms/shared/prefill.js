/*
 * prefill.js — des valeurs reçues par l'adresse de la page.
 *
 * Un QR code collé sur un lampadaire ouvre le formulaire avec l'objet déjà
 * désigné : l'identifiant voyage dans l'adresse (`?objet=123`). Ce module lit
 * l'adresse ; il ne touche à aucun écran.
 *
 * > **Rien ne se remplit sans que le formulaire l'ait déclaré.** Une valeur
 * > n'est reprise de l'adresse que si la question porte `options.prefill`
 * > (`{ param, verrouille?, libelleParam? }`). Sans cela, n'importe quel lien
 * > pourrait pré-écrire n'importe quelle question, et la personne enverrait
 * > sans le savoir ce qu'un tiers a choisi.
 *
 * Ce que le module décide ici n'est pas une sécurité : l'adresse se fabrique à
 * la main, et la clé d'un formulaire natif écrit n'importe quelle colonne. Une
 * valeur reçue est donc une commodité, à contrôler ensuite dans la table (une
 * référence à un objet qui n'existe pas, par exemple, se repère par formule).
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.FormPrefill = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var PARAM = /^[a-z][a-z0-9_]{0,31}$/;
  var LONGUEUR_MAX = 200;

  /** Une valeur d'adresse n'est ni longue ni faite de caractères de commande. */
  function nettoyer(brut) {
    return String(brut)
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, LONGUEUR_MAX);
  }

  function typeDe(field) {
    var t = String((field && field.type) || 'Text');
    if (t.indexOf('Ref:') === 0 || t.indexOf('RefList:') === 0) return t.indexOf('RefList') === 0 ? 'RefList' : 'Ref';
    return t.split(':')[0];
  }

  /** Une valeur reçue, convertie vers ce que la question attend, ou refusée avec sa raison. */
  function convertir(field, texte) {
    var t = typeDe(field);
    if (t === 'Int') {
      return /^-?\d{1,15}$/.test(texte) ? { ok: true, valeur: Number(texte) } : { ok: false, raison: 'entier attendu' };
    }
    if (t === 'Numeric') {
      var n = Number(texte.replace(',', '.'));
      return texte !== '' && Number.isFinite(n) ? { ok: true, valeur: n } : { ok: false, raison: 'nombre attendu' };
    }
    if (t === 'Ref') {
      return /^[1-9]\d{0,9}$/.test(texte) ? { ok: true, valeur: Number(texte) } : { ok: false, raison: 'identifiant attendu' };
    }
    if (t === 'Bool') {
      var s = texte.toLowerCase();
      if (s === '1' || s === 'true' || s === 'oui') return { ok: true, valeur: true };
      if (s === '0' || s === 'false' || s === 'non') return { ok: true, valeur: false };
      return { ok: false, raison: 'oui ou non attendu' };
    }
    if (t === 'Choice') {
      var choix = (field.options && field.options.choices) || [];
      return choix.indexOf(texte) !== -1 ? { ok: true, valeur: texte } : { ok: false, raison: 'hors de la liste' };
    }
    if (t === 'Text') return { ok: true, valeur: texte };
    return { ok: false, raison: 'type non repris depuis l’adresse' };
  }

  /** Les paramètres que le formulaire déclare, pour les documenter ou construire un lien. */
  function parametresDeclares(formDef) {
    var out = [];
    ((formDef && formDef.sections) || []).forEach(function (s) {
      (s.fields || []).forEach(function (f) {
        var p = f.options && f.options.prefill;
        if (p && typeof p.param === 'string' && PARAM.test(p.param)) {
          out.push({ colId: f.colId, param: p.param, verrouille: !!p.verrouille, libelleParam: p.libelleParam || null });
        }
      });
    });
    return out;
  }

  /**
   * Lire l'adresse de la page.
   * @param {object} formDef
   * @param {string} search  `location.search`, avec ou sans `?`
   * @returns {{ values: object, verrouilles: string[], libelles: object, ignores: object[] }}
   */
  function lire(formDef, search) {
    var out = { values: {}, verrouilles: [], libelles: {}, ignores: [] };
    var params;
    try {
      params = new URLSearchParams(String(search || ''));
    } catch (e) {
      return out;
    }
    ((formDef && formDef.sections) || []).forEach(function (s) {
      (s.fields || []).forEach(function (f) {
        var p = f.options && f.options.prefill;
        if (!p || typeof p.param !== 'string') return;
        if (!PARAM.test(p.param)) {
          out.ignores.push({ colId: f.colId, param: p.param, raison: 'nom de paramètre invalide' });
          return;
        }
        var brut = params.get(p.param);
        if (brut === null) return;
        var texte = nettoyer(brut);
        if (texte === '') return;
        var r = convertir(f, texte);
        if (!r.ok) {
          out.ignores.push({ colId: f.colId, param: p.param, raison: r.raison });
          return;
        }
        out.values[f.colId] = r.valeur;
        if (p.verrouille) out.verrouilles.push(f.colId);
        if (typeof p.libelleParam === 'string' && PARAM.test(p.libelleParam)) {
          var l = params.get(p.libelleParam);
          if (l !== null && nettoyer(l) !== '') out.libelles[f.colId] = nettoyer(l);
        }
      });
    });
    return out;
  }

  return { VERSION: VERSION, PARAM: PARAM, lire: lire, parametresDeclares: parametresDeclares, convertir: convertir };
}));
