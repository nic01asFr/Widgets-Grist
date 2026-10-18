/*
 * conditions.js — La grammaire de conditions de FormDef, et son évaluateur.
 *
 * Extrait du moteur (`runtime/engine.js`) pour qu'un seul évaluateur serve un
 * formulaire, un bouton, un menu : le contrat est `conditions-1.0`
 * (`runtime/conditions.schema.json`, publié dans `published/schemas/`).
 *
 * Deux formes, et deux seulement :
 *
 *   règle     { source?, field | path, operator?, value?, bind? }
 *   composé   { op: 'and' | 'or' | 'not', rules: [...] }
 *
 * > **Un opérateur inconnu n'est plus « vrai ».** L'évaluateur d'origine
 * > répondait `true` à tout opérateur qu'il ne connaissait pas : une faute de
 * > frappe (`contain` pour `contains`) montrait donc la question à tout le
 * > monde, sans qu'aucune erreur ne le dise. Désormais `validerCondition`
 * > rend la liste des fautes (chemin + message qui dit quoi écrire à la place)
 * > et `evaluer` lève `ConditionInvalide`. C'est l'hôte qui décide de ce qu'il
 * > en fait ; le moteur de formulaire traite une condition invalide comme
 * > « faux » et le journalise.
 *
 * Sans dépendance : utilisable sous Node et dans un navigateur
 * (`window.FormConditions`).
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.FormConditions = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Les opérateurs de règle. Fermé : tout autre mot est une faute. */
  var OPERATEURS = [
    '==', '!=', '>', '>=', '<', '<=',
    'contains', 'in', 'notIn', 'truthy', 'empty', 'notEmpty'
  ];
  /** D'où vient la valeur comparée. Fermé. */
  var SOURCES = ['field', 'context', 'audience'];
  /** Les composés. `not` porte exactement une règle. */
  var COMPOSES = ['and', 'or', 'not'];

  var CLES_REGLE = ['source', 'field', 'path', 'operator', 'value', 'bind'];
  var CLES_COMPOSE = ['op', 'rules'];

  /** Ce qu'on écrit à tort pour dire un opérateur : la correction se propose. */
  var ALIAS_OPERATEURS = {
    '=': '==', '===': '==', 'eq': '==', 'equals': '==',
    '<>': '!=', '!==': '!=', 'ne': '!=', 'neq': '!=',
    'gt': '>', 'gte': '>=', '=>': '>=', 'lt': '<', 'lte': '<=', '=<': '<=',
    'includes': 'contains', 'contain': 'contains',
    'notin': 'notIn', 'not_in': 'notIn', 'nin': 'notIn', 'not in': 'notIn',
    'isempty': 'empty', 'is_empty': 'empty', 'vide': 'empty',
    'notempty': 'notEmpty', 'not_empty': 'notEmpty', 'nonvide': 'notEmpty'
  };

  // ── Erreur typée ─────────────────────────────────────────────────────────

  /**
   * Levée par `evaluer` (et `comparer`) devant une condition qu'on ne peut pas
   * évaluer. `erreurs` porte la liste complète, `chemin` le premier endroit
   * fautif (pointeur JSON relatif à la condition : `/rules/1/operator`).
   */
  function ConditionInvalide(erreurs) {
    var liste = Array.isArray(erreurs) ? erreurs : [erreurs];
    var premier = liste[0] || { chemin: '', message: 'condition invalide' };
    this.name = 'ConditionInvalide';
    this.erreurs = liste;
    this.chemin = premier.chemin;
    this.message = premier.message + (liste.length > 1 ? ' (+' + (liste.length - 1) + ' autre(s) faute(s))' : '');
    if (typeof Error.captureStackTrace === 'function') Error.captureStackTrace(this, ConditionInvalide);
    else this.stack = (new Error(this.message)).stack;
  }
  ConditionInvalide.prototype = Object.create(Error.prototype);
  ConditionInvalide.prototype.constructor = ConditionInvalide;

  // ── Aides ────────────────────────────────────────────────────────────────

  function aCle(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function normalizeEmail(v) {
    if (v == null || v === '') return '';
    return String(v).trim().toLowerCase();
  }

  /** Distance d'édition (Levenshtein) : assez pour rattraper une faute de frappe. */
  function distance(a, b) {
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev.push(j);
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur.push(Math.min(
          prev[j] + 1, cur[j - 1] + 1,
          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)
        ));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /** Ce qu'on a probablement voulu écrire : les candidats les plus proches. */
  function proposer(mot, candidats, alias) {
    var m = String(mot == null ? '' : mot).trim();
    if (!m) return [];
    var bas = m.toLowerCase();
    var out = [];
    if (alias && aCle(alias, bas) && candidats.indexOf(alias[bas]) !== -1) out.push(alias[bas]);
    candidats.forEach(function (c) {
      if (out.indexOf(c) !== -1) return;
      var cb = c.toLowerCase();
      if (cb === bas) { out.push(c); return; }
      // Les symboles (==, >=) ne se rattrapent pas à la distance : trop courts.
      if (c.length >= 4 && distance(bas, cb) <= 2) out.push(c);
    });
    return out;
  }

  function dire(v) {
    try { return typeof v === 'string' ? '« ' + v + ' »' : JSON.stringify(v); }
    catch (e) { return String(v); }
  }

  function faute(chemin, code, message, bloquant, propositions) {
    var e = { chemin: chemin, code: code, message: message, bloquant: bloquant !== false };
    if (propositions && propositions.length) e.propositions = propositions;
    return e;
  }

  // ── Validation structurelle ──────────────────────────────────────────────

  function analyserRegle(cond, chemin, erreurs) {
    // Source : fermée.
    if (cond.source != null && cond.source !== '') {
      if (typeof cond.source !== 'string' || SOURCES.indexOf(cond.source) === -1) {
        var ps = proposer(cond.source, SOURCES);
        erreurs.push(faute(chemin + '/source', 'source_inconnue',
          'Source ' + dire(cond.source) + ' inconnue : les sources de conditions-1.0 sont ' +
          SOURCES.join(', ') + '.' + (ps.length ? ' Vouliez-vous dire « ' + ps[0] + ' » ?' : ''),
          true, ps));
      }
    }
    // Cible : `field` ou `path` doivent exister (même vides : une règle que le
    // compositeur n'a pas encore remplie reste « vraie », comme avant).
    var aField = aCle(cond, 'field');
    var aPath = aCle(cond, 'path');
    if (!aField && !aPath) {
      erreurs.push(faute(chemin, 'cible_absente',
        'Règle sans cible : ajoutez « field » (ou « path ») pour dire quelle valeur comparer.'));
    }
    ['field', 'path'].forEach(function (k) {
      if (aCle(cond, k) && cond[k] != null && typeof cond[k] !== 'string') {
        erreurs.push(faute(chemin + '/' + k, 'type_cible',
          '« ' + k + ' » est le nom d\'une valeur : une chaîne, reçu ' + dire(cond[k]) + '.'));
      }
    });
    // Opérateur : fermé.
    var op = cond.operator;
    if (op != null && op !== '') {
      if (typeof op !== 'string' || OPERATEURS.indexOf(op) === -1) {
        var po = proposer(op, OPERATEURS, ALIAS_OPERATEURS);
        erreurs.push(faute(chemin + '/operator', 'operateur_inconnu',
          'Opérateur ' + dire(op) + ' inconnu : écrivez l\'un de ' + OPERATEURS.join(', ') + '.' +
          (po.length ? ' Vouliez-vous dire « ' + po[0] + ' » ?' : ''),
          true, po));
      }
    }
    if (cond.bind != null && (typeof cond.bind !== 'object' || Array.isArray(cond.bind))) {
      erreurs.push(faute(chemin + '/bind', 'type_bind',
        '« bind » décrit l\'audience : un objet { tableId, emailCol, groupCol, groups }, reçu ' + dire(cond.bind) + '.',
        false));
    }
    Object.keys(cond).forEach(function (k) {
      if (CLES_REGLE.indexOf(k) === -1) {
        erreurs.push(faute(chemin + '/' + k, 'cle_inconnue',
          'Clé « ' + k + ' » inconnue dans une règle (attendues : ' + CLES_REGLE.join(', ') + ').' +
          (distance(k.toLowerCase(), 'operator') <= 2 ? ' Vouliez-vous dire « operator » ?' : ''),
          false));
      }
    });
  }

  function analyserCompose(cond, chemin, erreurs) {
    var op = cond.op;
    var opValide = typeof op === 'string' && COMPOSES.indexOf(op) !== -1;
    if (!aCle(cond, 'op')) {
      erreurs.push(faute(chemin, 'op_absent',
        'Condition composée sans « op » : écrivez « and », « or » ou « not ».'));
    } else if (!opValide) {
      var pc = proposer(op, COMPOSES);
      erreurs.push(faute(chemin + '/op', 'op_inconnu',
        'Composé ' + dire(op) + ' inconnu : les composés de conditions-1.0 sont ' + COMPOSES.join(', ') + '.' +
        (pc.length ? ' Vouliez-vous dire « ' + pc[0] + ' » ?' : ''), true, pc));
    }
    if (!Array.isArray(cond.rules)) {
      erreurs.push(faute(chemin + '/rules', 'rules_absent',
        'Condition composée sans liste « rules » : un tableau de règles est attendu.'));
    } else {
      if (op === 'not' && cond.rules.length !== 1) {
        erreurs.push(faute(chemin + '/rules', 'not_arite',
          '« not » nie exactement une règle (' + cond.rules.length + ' reçue(s)) : enveloppez-les dans ' +
          '{ "op": "or", "rules": [...] } ou { "op": "and", "rules": [...] } avant de nier.'));
      }
      cond.rules.forEach(function (r, i) {
        analyser(r, chemin + '/rules/' + i, erreurs, true);
      });
    }
    Object.keys(cond).forEach(function (k) {
      if (CLES_COMPOSE.indexOf(k) === -1) {
        erreurs.push(faute(chemin + '/' + k, 'cle_inconnue',
          'Clé « ' + k + ' » inconnue dans un composé (attendues : op, rules).', false));
      }
    });
  }

  function analyser(cond, chemin, erreurs, imbrique) {
    if (cond == null) {
      // Pas de condition à la racine = toujours vrai ; dans `rules`, c'est un trou.
      if (imbrique) erreurs.push(faute(chemin, 'regle_absente', 'Règle absente (null) dans « rules ».'));
      return;
    }
    if (typeof cond !== 'object' || Array.isArray(cond)) {
      erreurs.push(faute(chemin, 'type_condition',
        'Une condition est un objet { field, operator, value } ou { op, rules }, reçu ' + dire(cond) + '.'));
      return;
    }
    // Un objet vide : l'ancien compositeur en laissait. Il vaut « pas de condition ».
    if (!Object.keys(cond).length) return;
    if (aCle(cond, 'op') || aCle(cond, 'rules')) analyserCompose(cond, chemin, erreurs);
    else analyserRegle(cond, chemin, erreurs);
  }

  /**
   * Les fautes d'une condition. Liste vide = valide.
   *
   * Chaque faute : `{ chemin, code, message, bloquant, propositions? }`.
   * Les fautes `bloquant: true` font lever `evaluer` ; les autres (clé
   * inconnue, `bind` mal typé) sont signalées mais n'empêchent pas
   * l'évaluation — `evaluer` les ignore, comme le moteur d'origine.
   *
   * @param {object|null} cond
   * @returns {Array<{chemin:string, code:string, message:string, bloquant:boolean, propositions?:string[]}>}
   */
  function validerCondition(cond) {
    var erreurs = [];
    analyser(cond, '', erreurs, false);
    return erreurs;
  }

  // ── Comparaison ──────────────────────────────────────────────────────────

  /**
   * Une valeur est vide quand la personne n'a rien répondu : `null`,
   * `undefined`, la chaîne vide, une liste vide (y compris l'encodage Grist
   * d'une liste vide, `['L']`). Zéro et `false` sont des réponses.
   */
  function estVide(v) {
    if (v == null || v === '') return true;
    if (Array.isArray(v)) return v.length === 0 || (v.length === 1 && v[0] === 'L');
    return false;
  }

  function listeDe(attendu) {
    if (Array.isArray(attendu)) return attendu;
    return (attendu != null && attendu !== '') ? [attendu] : [];
  }

  function parmi(actual, liste) {
    if (Array.isArray(actual)) {
      return actual.some(function (a) {
        return liste.some(function (e) { return String(a) === String(e); });
      });
    }
    return liste.some(function (e) { return String(actual) === String(e); });
  }

  /**
   * Compare une valeur réelle à une valeur attendue.
   *
   * Sémantique (historique, conservée telle quelle) :
   *  - `==` / `!=` : égalité LÂCHE de JavaScript (`'1' == 1`, `null == undefined`).
   *    C'est voulu : les valeurs lues dans un formulaire sont des chaînes, les
   *    conditions écrites par un humain portent des nombres. Piège : `'' == 0`,
   *    donc une réponse vide égale 0 — pour tester l'absence de réponse,
   *    utilisez `empty`.
   *  - `>`, `>=`, `<`, `<=` : comparaison numérique (`Number()`), une valeur non
   *    numérique donne `false` ; une réponse vide vaut 0. Les dates ISO ne
   *    se comparent pas (NaN).
   *  - `contains` : élément d'une liste (égalité stricte), sinon sous-chaîne.
   *  - `in` / `notIn` : appartenance par comparaison de chaînes ; `value` peut
   *    être une liste ou une valeur seule.
   *  - `truthy` : `!!valeur` (une liste vide est vraie ; `'false'` est vrai).
   *  - `empty` / `notEmpty` : voir `estVide`. `value` est ignorée.
   *
   * @throws {ConditionInvalide} opérateur inconnu
   */
  function comparer(actual, operateur, attendu) {
    switch (operateur) {
      case '==': return actual == attendu; // eslint-disable-line eqeqeq
      case '!=': return actual != attendu; // eslint-disable-line eqeqeq
      case '>': return Number(actual) > Number(attendu);
      case '>=': return Number(actual) >= Number(attendu);
      case '<': return Number(actual) < Number(attendu);
      case '<=': return Number(actual) <= Number(attendu);
      case 'contains':
        if (Array.isArray(actual)) return actual.indexOf(attendu) !== -1;
        if (actual == null) return false;
        return String(actual).indexOf(String(attendu)) !== -1;
      case 'in': return parmi(actual, listeDe(attendu));
      case 'notIn': return !parmi(actual, listeDe(attendu));
      case 'truthy': return !!actual;
      case 'empty': return estVide(actual);
      case 'notEmpty': return !estVide(actual);
      default:
        throw new ConditionInvalide(faute('/operator', 'operateur_inconnu',
          'Opérateur ' + dire(operateur) + ' inconnu : écrivez l\'un de ' + OPERATEURS.join(', ') + '.',
          true, proposer(operateur, OPERATEURS, ALIAS_OPERATEURS)));
    }
  }

  // ── Évaluation ───────────────────────────────────────────────────────────

  /**
   * Où chercher la valeur d'une règle. Le préfixe `context.` / `audience.` dans
   * `field` ou `path` reste accepté quand `source` est absente ou vaut `field` :
   * c'est une autre façon d'écrire la même chose, héritée de l'ancien compositeur.
   */
  function resoudreSource(rule) {
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

  function valeurAudience(path, context) {
    context = context || {};
    if (path === 'email' || path === 'userEmail') return normalizeEmail(context.userEmail);
    if (path === 'group' || path === 'groups') return context.groups || [];
    if (path === 'member') return !!normalizeEmail(context.userEmail);
    return context[path];
  }

  function evaluerRegle(rule, values, context) {
    var resolu = resoudreSource(rule);
    var source = resolu.source;
    var path = resolu.path;
    // Une règle que le compositeur n'a pas remplie ne cache rien.
    if (source === 'field' && !path) return true;

    var actual;
    var attendu = rule.value;
    if (source === 'context') {
      actual = context ? context[path] : undefined;
    } else if (source === 'audience') {
      actual = valeurAudience(path, context);
      if ((path === 'group' || path === 'groups') && rule.bind && Array.isArray(rule.bind.groups) && attendu == null) {
        attendu = rule.bind.groups;
      }
      if ((path === 'email' || path === 'userEmail') && attendu != null) {
        attendu = Array.isArray(attendu) ? attendu.map(normalizeEmail) : normalizeEmail(attendu);
      }
    } else {
      actual = values ? values[path] : undefined;
    }
    return comparer(actual, rule.operator || '==', attendu);
  }

  function evaluerNoeud(cond, values, context) {
    if (cond == null || !Object.keys(cond).length) return true;
    if (aCle(cond, 'op') || aCle(cond, 'rules')) {
      var rules = cond.rules;
      if (cond.op === 'not') return !evaluerNoeud(rules[0], values, context);
      if (!rules.length) return true;
      var i;
      if (cond.op === 'or') {
        for (i = 0; i < rules.length; i++) {
          if (evaluerNoeud(rules[i], values, context)) return true;
        }
        return false;
      }
      for (i = 0; i < rules.length; i++) {
        if (!evaluerNoeud(rules[i], values, context)) return false;
      }
      return true;
    }
    return evaluerRegle(cond, values, context);
  }

  /**
   * Évalue une condition.
   *
   * @param {object|null} cond      règle ou composé ; `null` = toujours vrai
   * @param {{values?:object, context?:object}} [portee]
   *        `values` : les réponses (source `field`) ; `context` : les clés de
   *        contexte (source `context`) et la personne (source `audience` :
   *        `userEmail`, `groups`)
   * @returns {boolean}
   * @throws {ConditionInvalide} la condition porte une faute bloquante
   *         (opérateur, source ou composé inconnu, règle sans cible…)
   */
  function evaluer(cond, portee) {
    var bloquantes = validerCondition(cond).filter(function (e) { return e.bloquant; });
    if (bloquantes.length) throw new ConditionInvalide(bloquantes);
    portee = portee || {};
    return evaluerNoeud(cond, portee.values || {}, portee.context || {});
  }

  return {
    VERSION: '1.0',
    OPERATEURS: OPERATEURS,
    SOURCES: SOURCES,
    COMPOSES: COMPOSES,
    ConditionInvalide: ConditionInvalide,
    validerCondition: validerCondition,
    evaluer: evaluer,
    comparer: comparer,
    estVide: estVide,
    resoudreSource: resoudreSource
  };
}));
