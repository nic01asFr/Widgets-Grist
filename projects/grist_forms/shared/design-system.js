/*
 * design-system.js — saisir un design system dans un formulaire, sans serveur.
 *
 * Un CATALOGUE (`dsdef-catalogue/0.1`) décrit les champs d'un design system : identifiant pointé
 * (`couleurs.principal`), type, libellé et aide en français, contraintes, niveau de complétude, condition d'affichage.
 * Ce module en fait un formulaire (FormDef), rassemble les réponses en UN document (`dsdef`), le relit pour le
 * modifier, rejoue les règles croisées (contrastes, mode sombre, cibles…) et en projette un ThemeDef 1.0.
 *
 * > **Un brouillon n'est jamais refusé.** Le document s'enregistre à tout moment, incomplet ; seule la PROPOSITION
 * > passe les règles. Les règles ici sont un avertissement précis posé sous les yeux de la personne : le compilateur du
 * > kit reste le juge du thème (ce module ne compile rien).
 *
 * Le catalogue vient de l'hôte (un fichier importé, une table du document) : ce module n'en embarque aucun — hormis un
 * catalogue MINIMAL, celui d'un ThemeDef 1.0, de quoi saisir une identité sans rien importer.
 *
 * Fonctions pures, sans écran ni réseau : le seul accès au système est `empreinte` (Web Crypto, ou `crypto` de Node).
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.FormDesignSystem = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var VERSION_DOCUMENT = 'dsdef-0.1';
  /** Ce que porte la clé `dsdef` à la racine d'un document. */
  var RACINE_DOCUMENT = '0.1';
  var FORMAT_CATALOGUE = 'dsdef-catalogue/';
  var TAILLE_MAX = 400 * 1024;

  /** Les types du catalogue, vers ceux du formulaire. */
  var TYPE_GRIST = { texte: 'Text', couleur: 'Text', enum: 'Choice', entier: 'Int', nombre: 'Numeric', booleen: 'Bool' };

  // ── Le catalogue minimal : un ThemeDef 1.0 ────────────────────────────────

  function champ(id, module, niveau, obligation, type, label, aide, contraintes, extra) {
    var c = { id: id, module: module, niveau: niveau, obligation: obligation, type: type, label: label, aide: aide,
      contraintes: contraintes || {}, themedef: null, ds: null, sensible: false, si: null };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) c[k] = extra[k]; } }
    return c;
  }

  var CATALOGUE_MINIMAL = {
    _format: FORMAT_CATALOGUE + '0.1',
    _statut: 'Catalogue minimal fourni avec le Form Builder : de quoi saisir une identité (ThemeDef 1.0).',
    niveaux: [{ niveau: 0, nom: 'Identité', aide: 'Assez pour produire un thème : un nom, une couleur, des modes.' }],
    modules: [
      { id: 'identite', nom: 'Identité', aide: 'Comment s’appelle ce thème.' },
      { id: 'couleurs', nom: 'Couleurs', aide: 'La couleur qui porte l’identité, et celles qui l’accompagnent.' },
      { id: 'modes', nom: 'Modes clair et sombre', aide: 'Faut-il un mode sombre, et comment le obtenir.' },
      { id: 'exigences', nom: 'Exigences de lisibilité', aide: 'Les seuils de contraste. Vous pouvez seulement les renforcer.' }
    ],
    regles: [],
    champs: [
      champ('identite.id', 'identite', 0, 'requis', 'texte', 'Identifiant',
        'Court, en minuscules, sans espace (a-z, 0-9, tiret).', { pattern: '^[a-z][a-z0-9-]{0,39}$' }, { themedef: 'id' }),
      champ('identite.nom', 'identite', 0, 'requis', 'texte', 'Nom du thème', 'Le nom affiché.', { maxLength: 80 }, { themedef: 'nom' }),
      champ('identite.statut', 'identite', 0, 'requis', 'enum', 'Statut',
        'brouillon : en cours. proposition : à valider. valide : validé par le propriétaire.',
        { enum: ['brouillon', 'proposition', 'valide'], defaut: 'brouillon' }),
      champ('couleurs.principal', 'couleurs', 0, 'requis', 'couleur', 'Couleur principale',
        'La couleur qui porte l’identité (action, titres). Format #RRGGBB.', { pattern: '^#[0-9A-Fa-f]{6}$' }, { themedef: 'principal' }),
      champ('couleurs.secondaire', 'couleurs', 0, 'recommande', 'couleur', 'Couleur secondaire',
        'La couleur d’appui. Si elle manque, elle est dérivée.', { pattern: '^#[0-9A-Fa-f]{6}$' }, { themedef: 'secondaire' }),
      champ('couleurs.encre', 'couleurs', 0, 'recommande', 'couleur', 'Couleur du texte courant',
        'Noir ou presque noir recommandé. Contraste 4,5:1 minimum sur le fond.', { pattern: '^#[0-9A-Fa-f]{6}$' }, { themedef: 'encre' }),
      champ('couleurs.fond', 'couleurs', 0, 'recommande', 'couleur', 'Couleur de fond',
        'Fond par défaut des pages.', { pattern: '^#[0-9A-Fa-f]{6}$' }, { themedef: 'fond' }),
      champ('modes.sombre', 'modes', 0, 'requis', 'enum', 'Mode sombre',
        'aucun : pas de mode sombre. derive : calculé depuis la couleur principale.', { enum: ['aucun', 'derive'], defaut: 'derive' }),
      champ('exigences.contrasteTexte', 'exigences', 0, 'requis', 'nombre', 'Contraste minimal du texte',
        'Ratio WCAG. 4,5 par défaut ; vous pouvez seulement renforcer (7 pour AAA).', { min: 4.5, max: 21, defaut: 4.5 }),
      champ('exigences.contrasteMinimal', 'exigences', 0, 'requis', 'nombre', 'Contraste minimal des éléments graphiques',
        'Bordures de champ, icônes, focus. 3 par défaut.', { min: 3, max: 21, defaut: 3 })
    ]
  };

  // ── Lecture du catalogue ──────────────────────────────────────────────────

  function verifierCatalogue(catalogue) {
    if (!catalogue || typeof catalogue !== 'object' || String(catalogue._format || '').indexOf(FORMAT_CATALOGUE) !== 0) {
      throw new Error('Ce n’est pas un catalogue de design system (format « ' + FORMAT_CATALOGUE + '… » attendu).');
    }
    if (!Array.isArray(catalogue.champs) || !catalogue.champs.length) throw new Error('Le catalogue ne décrit aucun champ.');
    if (!Array.isArray(catalogue.modules)) throw new Error('Le catalogue ne décrit aucun module.');
    var vus = {};
    catalogue.champs.forEach(function (c) {
      if (!c || typeof c.id !== 'string' || !c.id || typeof c.type !== 'string') throw new Error('Un champ du catalogue n’a ni identifiant ni type.');
      if (vus[c.id]) throw new Error('Identifiant en double dans le catalogue : ' + c.id);
      vus[c.id] = true;
    });
    return catalogue;
  }

  /** Un identifiant pointé en nom de question : `couleurs.principal` → `couleurs_principal`. */
  function colIdDe(id) { return String(id).split('.').join('_').split('[]').join(''); }

  function aideDe(f) {
    var texte = String(f.aide || '');
    if (f.obligation === 'recommande') texte += (texte ? ' ' : '') + 'Recommandé.';
    return texte;
  }

  function motifLongueur(max) { return '^[\\s\\S]{0,' + max + '}$'; }

  /** Les options communes d'une question de texte ou de couleur : le motif et sa phrase. */
  function optionsTexte(f, type) {
    var o = {};
    var c = f.contraintes || {};
    if (type === 'couleur') return o;
    if (typeof c.pattern === 'string' && c.pattern.length <= 200) {
      o.motif = c.pattern;
      o.motifMessage = 'Ce n’est pas au bon format. ' + String(f.aide || '').split('\n')[0];
    } else if (typeof c.maxLength === 'number' && c.maxLength > 0 && c.maxLength <= 5000) {
      o.motif = motifLongueur(c.maxLength);
      o.motifMessage = 'Au plus ' + c.maxLength + ' caractères.';
    }
    return o;
  }

  /** La question d'un champ de type simple. `nom` est le colId (ou le nom court dans une ligne de groupe). */
  function questionDe(f, nom, dansGroupe) {
    var c = f.contraintes || {};
    var type = f.type;
    var q = {
      colId: nom, label: f.label || nom, type: TYPE_GRIST[type] || 'Text', required: f.obligation === 'requis',
      options: {}
    };
    var aide = aideDe(f);
    if (aide) q.description = aide;
    if (type === 'texte') {
      q.widget = (typeof c.maxLength === 'number' && c.maxLength > 120) ? 'textarea' : 'text';
      q.options = optionsTexte(f, type);
    } else if (type === 'couleur') {
      q.widget = 'couleur';
    } else if (type === 'enum') {
      q.widget = (c.enum && c.enum.length <= 4) ? 'radio' : 'select';
      // Les choix d'une question de ligne se portent par la question elle-même (`formdef.choices` ne connaît que les colonnes).
      if (dansGroupe && Array.isArray(c.enum)) q.options.choices = c.enum.slice();
    } else if (type === 'entier' || type === 'nombre') {
      q.widget = 'number';
      if (typeof c.min === 'number') q.options.min = c.min;
      if (typeof c.max === 'number') q.options.max = c.max;
      q.options.step = type === 'entier' ? '1' : 'any';
    } else if (type === 'booleen') {
      q.widget = 'ouinon';
    } else {
      q.widget = 'text';
    }
    if (!dansGroupe && c.defaut !== undefined) q.options.depart = { source: 'valeur', valeur: c.defaut };
    if (!dansGroupe && c.const !== undefined) q.options.depart = { source: 'valeur', valeur: c.const };
    return q;
  }

  /** Les listes de nombres s'écrivent en une ligne, séparées par des virgules. */
  function motifNombres(entier) {
    return entier
      ? '^ *[0-9]+( *, *[0-9]+)* *$'
      : '^ *-?[0-9]+(\\.[0-9]+)?( *, *-?[0-9]+(\\.[0-9]+)?)* *$';
  }

  /**
   * Du catalogue au formulaire.
   *
   * @param {object} catalogue `dsdef-catalogue/0.1`
   * @param {object} [opts] `{ niveau }` : jusqu'où aller (0 à 3, défaut 1)
   * @returns {{formdef:object, plan:object, avertissements:string[]}} le formulaire, et le plan qui permet d'y rassembler
   *   (`assembler`) ou d'y relire (`aplatir`) un document
   */
  function construire(catalogue, opts) {
    verifierCatalogue(catalogue);
    opts = opts || {};
    var niveau = typeof opts.niveau === 'number' ? opts.niveau : 1;
    var avertissements = [];
    var choices = {};
    var plan = { version: 'dsdef-plan/1', niveau: niveau, champs: [] };
    var parColId = {};
    var sections = [];

    function enregistrer(colId, entree) {
      if (parColId[colId]) throw new Error('Deux champs du catalogue donnent le même nom de question : ' + colId);
      parColId[colId] = entree;
      plan.champs.push(entree);
    }

    var inclus = catalogue.champs.filter(function (f) { return typeof f.niveau !== 'number' || f.niveau <= niveau; });
    var groupes = {};

    catalogue.modules.forEach(function (mod) {
      var questions = [];
      inclus.filter(function (f) { return f.module === mod.id; }).forEach(function (f) {
        var cle = f.id.indexOf('[]') !== -1 ? f.id.slice(0, f.id.indexOf('[]')) : null;
        // — une ligne d'un groupe d'objets : `couleurs.identites[].nom`
        if (cle !== null) {
          var sub = f.id.slice(f.id.indexOf('[]') + 3);
          if (!groupes[cle]) {
            var colGroupe = colIdDe(cle);
            var gq = {
              colId: colGroupe, label: '', type: 'Text', widget: 'groupe', required: false,
              options: { min: 0, max: 20, lignesDepart: 0, libelleLigne: 'Ligne', libelleAjout: 'Ajouter', champs: [] }
            };
            var entreeG = { colId: colGroupe, id: cle, kind: 'groupe-objets', sous: [] };
            groupes[cle] = { question: gq, entree: entreeG, premierChamp: f };
            enregistrer(colGroupe, entreeG);
            questions.push(gq);
          }
          var g = groupes[cle];
          var csv = f.type === 'liste';
          // Une liste dans une ligne (les variantes d'un composant) s'écrit sur une ligne, séparée par des virgules.
          var qSub = csv
            ? { colId: sub, label: f.label || sub, type: 'Text', widget: 'text', required: false, options: {},
              description: 'Les valeurs, séparées par des virgules.' }
            : questionDe(f, sub, true);
          if (f.obligation === 'requis' && !csv) qSub.required = true;
          g.question.options.champs.push(qSub);
          g.entree.sous.push({ id: sub, kind: csv ? 'csv' : f.type });
          if (!g.question.label) {
            // Le titre du groupe : le libellé du premier champ sans son suffixe (« Neutre : nom » → « Neutre »).
            var l = String(f.label || cle).split(':')[0].trim();
            g.question.label = l;
            g.question.options.libelleLigne = l;
            g.question.options.libelleAjout = 'Ajouter : ' + l.toLowerCase();
          }
          return;
        }
        var colId = colIdDe(f.id);
        // — une liste : de couleurs ou de textes (une ligne par valeur), de nombres (une ligne), de choix (des cases)
        if (f.type === 'liste') {
          var c = f.contraintes || {};
          if (c.items === 'texte' || c.items === 'couleur') {
            var maxL = Math.min(typeof c.max === 'number' ? c.max : 20, 50);
            var sq = c.items === 'couleur'
              ? { colId: 'valeur', label: f.label || 'Valeur', type: 'Text', widget: 'couleur', required: true, options: {} }
              : { colId: 'valeur', label: f.label || 'Valeur', type: 'Text', widget: 'text', required: true, options: {} };
            var qG = {
              colId: colId, label: f.label || colId, type: 'Text', widget: 'groupe', required: false,
              description: String(f.aide || '').replace(/ séparées par des virgules/g, '').replace(/ séparés par des virgules/g, '') + (f.obligation === 'recommande' ? ' Recommandé.' : ''),
              options: { min: 0, max: maxL, lignesDepart: 0, libelleLigne: 'Valeur', libelleAjout: 'Ajouter une valeur', champs: [sq] }
            };
            enregistrer(colId, { colId: colId, id: f.id, kind: 'liste-simple', items: c.items, min: c.min, max: c.max, impair: !!c.impair });
            questions.push(qG);
          } else if (c.items === 'enum' && Array.isArray(c.enum)) {
            var qE = { colId: colId, label: f.label || colId, type: 'ChoiceList', widget: 'multiselect', required: f.obligation === 'requis', options: {}, description: aideDe(f) };
            choices[colId] = c.enum.slice();
            enregistrer(colId, { colId: colId, id: f.id, kind: 'liste-choix' });
            questions.push(qE);
          } else {
            var entier = c.items === 'entier';
            var qN = {
              colId: colId, label: f.label || colId, type: 'Text', widget: 'text', required: f.obligation === 'requis',
              description: (String(f.aide || '').indexOf('virgule') !== -1 ? String(f.aide) : String(f.aide || '') + ' Séparées par des virgules.').trim(),
              options: { motif: motifNombres(entier), motifMessage: entier ? 'Des nombres entiers, séparés par des virgules (par exemple 400, 600).' : 'Des nombres, séparés par des virgules (par exemple 0.5, 1, 2).' }
            };
            enregistrer(colId, { colId: colId, id: f.id, kind: entier ? 'liste-entiers' : 'liste-nombres' });
            questions.push(qN);
          }
          return;
        }
        var q = questionDe(f, colId, false);
        if (f.type === 'enum' && f.contraintes && Array.isArray(f.contraintes.enum)) choices[colId] = f.contraintes.enum.slice();
        if (f.si) {
          var m = String(f.si).split('=');
          if (m.length === 2) q.condition = { field: colIdDe(m[0]), operator: '==', value: m[1] };
          else avertissements.push('Condition illisible ignorée : ' + f.id + ' (' + f.si + ')');
        }
        enregistrer(colId, { colId: colId, id: f.id, kind: f.type === 'booleen' ? 'booleen' : f.type });
        questions.push(q);
      });
      if (questions.length) {
        sections.push({ id: 'm_' + mod.id, label: mod.nom || mod.id, description: mod.aide || '', gate: null, condition: null, fields: questions });
      }
    });

    // Une condition qui vise une question absente de ce niveau ne peut pas se juger : la question dépendante est écartée.
    sections.forEach(function (s) {
      s.fields = s.fields.filter(function (q) {
        if (q.condition && !parColId[q.condition.field]) {
          avertissements.push('« ' + q.label + ' » dépend d’une question absente de ce niveau : écartée.');
          return false;
        }
        return true;
      });
    });
    sections = sections.filter(function (s) { return s.fields.length; });

    // Une question « Identifiant » ou un nom donne le titre du formulaire.
    var formdef = {
      manifest_version: '1.0.0',
      id: 'design-system',
      title: 'Design system',
      description: 'Renseignez ce que vous savez ; vous pourrez enregistrer un brouillon à tout moment.',
      classification: 'interne',
      tableId: 'Design_system',
      composeMode: 'ensureSchema',
      sections: sections,
      choices: choices
    };
    return { formdef: formdef, plan: plan, avertissements: avertissements };
  }

  // ── Du formulaire au document, et retour ──────────────────────────────────

  function poser(doc, chemin, valeur) {
    var courant = doc;
    for (var i = 0; i < chemin.length - 1; i++) {
      var k = chemin[i];
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
      if (!courant[k] || typeof courant[k] !== 'object') courant[k] = {};
      courant = courant[k];
    }
    var dernier = chemin[chemin.length - 1];
    if (dernier === '__proto__' || dernier === 'constructor' || dernier === 'prototype') return;
    courant[dernier] = valeur;
  }

  function lire(doc, chemin) {
    var courant = doc;
    for (var i = 0; i < chemin.length; i++) {
      if (!courant || typeof courant !== 'object' || !Object.prototype.hasOwnProperty.call(courant, chemin[i])) return undefined;
      courant = courant[chemin[i]];
    }
    return courant;
  }

  function vide(v) { return v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length); }

  function nombresDe(texte, entier) {
    return String(texte).split(',').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) {
      var n = Number(s);
      return entier ? Math.round(n) : n;
    }).filter(function (n) { return isFinite(n); });
  }

  function listeDe(brut) {
    if (Array.isArray(brut)) return brut[0] === 'L' ? brut.slice(1) : brut;
    return vide(brut) ? [] : [brut];
  }

  /**
   * Les réponses du formulaire (ce que `collectSubmitData` rend : un objet par nom de question) en UN document.
   * Une réponse vide n'écrit rien : le document ne porte que ce que la personne a donné.
   */
  function assembler(plan, data) {
    var doc = { dsdef: RACINE_DOCUMENT };
    (plan.champs || []).forEach(function (e) {
      var brut = data ? data[e.colId] : undefined;
      if (vide(brut)) return;
      var chemin = e.id.split('.');
      var v;
      switch (e.kind) {
        case 'groupe-objets':
          var lignes;
          try { lignes = typeof brut === 'string' ? JSON.parse(brut) : brut; } catch (err) { return; }
          if (!Array.isArray(lignes)) return;
          v = lignes.map(function (l) {
            var o = {};
            e.sous.forEach(function (s) {
              var x = l && l[s.id];
              if (vide(x)) return;
              o[s.id] = s.kind === 'csv' ? String(x).split(',').map(function (t) { return t.trim(); }).filter(Boolean) : x;
            });
            return o;
          }).filter(function (o) { return Object.keys(o).length; });
          if (!v.length) return;
          break;
        case 'liste-simple':
          try { v = (typeof brut === 'string' ? JSON.parse(brut) : brut).map(function (l) { return l && l.valeur; }).filter(function (x) { return !vide(x); }); } catch (err2) { return; }
          if (!v.length) return;
          break;
        case 'liste-choix':
          v = listeDe(brut);
          break;
        case 'liste-entiers':
          v = nombresDe(brut, true);
          break;
        case 'liste-nombres':
          v = nombresDe(brut, false);
          break;
        case 'couleur':
          v = String(brut).trim();
          break;
        default:
          v = brut;
      }
      if (vide(v)) return;
      poser(doc, chemin, v);
    });
    return doc;
  }

  /** Le sens inverse : un document vers les valeurs à donner au formulaire (nom de question → valeur). */
  function aplatir(plan, doc) {
    var out = {};
    (plan.champs || []).forEach(function (e) {
      var v = lire(doc, e.id.split('.'));
      if (vide(v)) return;
      switch (e.kind) {
        case 'groupe-objets':
          if (!Array.isArray(v)) return;
          out[e.colId] = v.map(function (l) {
            var o = {};
            e.sous.forEach(function (s) {
              var x = l && l[s.id];
              if (vide(x)) return;
              o[s.id] = s.kind === 'csv' && Array.isArray(x) ? x.join(', ') : x;
            });
            return o;
          });
          break;
        case 'liste-simple':
          if (Array.isArray(v)) out[e.colId] = v.map(function (x) { return { valeur: x }; });
          break;
        case 'liste-choix':
          if (Array.isArray(v)) out[e.colId] = v.slice();
          break;
        case 'liste-entiers':
        case 'liste-nombres':
          if (Array.isArray(v)) out[e.colId] = v.join(', ');
          break;
        default:
          out[e.colId] = v;
      }
    });
    return out;
  }

  // ── Les règles croisées ───────────────────────────────────────────────────

  function luminance(hex) {
    var n = parseInt(hex.slice(1), 16);
    function lin(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  }

  var HEX = /^#[0-9a-fA-F]{6}$/;

  /** Le contraste WCAG de deux couleurs #RRGGBB, ou `null` si l'une n'en est pas une. */
  function contraste(a, b) {
    if (!HEX.test(String(a)) || !HEX.test(String(b))) return null;
    var x = luminance(a);
    var y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  function lab(hex) {
    var n = parseInt(hex.slice(1), 16);
    function lin(v) { v = v / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    var r = lin((n >> 16) & 255); var g = lin((n >> 8) & 255); var b = lin(n & 255);
    var x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
    var y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    var z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    function f(t) { return t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116; }
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  }

  /** L'écart perceptif de deux couleurs (ΔE de 1976 dans l'espace Lab) : 0 pour la même, plus de 5 pour deux teintes nettement distinctes. */
  function ecart(a, b) {
    if (!HEX.test(String(a)) || !HEX.test(String(b))) return null;
    var p = lab(a); var q = lab(b);
    return Math.sqrt(Math.pow(p[0] - q[0], 2) + Math.pow(p[1] - q[1], 2) + Math.pow(p[2] - q[2], 2));
  }

  function arrondi(n) { return Math.round(n * 100) / 100; }
  function nombreOu(v, defaut) { return typeof v === 'number' && isFinite(v) ? v : defaut; }

  /** Un écart est « déclaré » quand `gouvernance.ecarts` nomme la règle. */
  function declare(doc, id) {
    var liste = lire(doc, ['gouvernance', 'ecarts']);
    if (!Array.isArray(liste)) return false;
    return liste.some(function (e) { return e && String(e.regle || '').trim().toUpperCase() === id; });
  }

  /**
   * Rejoue les règles croisées sur un document. Chaque règle dont les données manquent est SAUTÉE (jamais comptée comme
   * une erreur : un brouillon est incomplet), et une règle qui s'applique donne un constat.
   *
   * @returns {Array<{regle:string, gravite:'erreur'|'avertissement', message:string, champs:string[], declare?:boolean}>}
   */
  function controler(doc) {
    var out = [];
    function ajouter(regle, gravite, message, champs, estDeclare) {
      var c = { regle: regle, gravite: gravite, message: message, champs: champs };
      if (estDeclare) c.declare = true;
      out.push(c);
    }
    var seuilTexte = nombreOu(lire(doc, ['exigences', 'contrasteTexte']), 4.5);
    var seuilGraphique = nombreOu(lire(doc, ['exigences', 'contrasteMinimal']), 3);
    var c = lire(doc, ['couleurs']) || {};
    var r;

    r = contraste(c.encre, c.fond);
    if (r !== null && r < seuilTexte) ajouter('C1', 'erreur', 'Le texte courant a un contraste de ' + arrondi(r) + ':1 sur le fond ; il en faut au moins ' + seuilTexte + ':1.', ['couleurs.encre', 'couleurs.fond']);

    r = contraste(c.principal, c.fond);
    if (r !== null && r < seuilGraphique) {
      ajouter('C2', 'avertissement', 'La couleur principale a un contraste de ' + arrondi(r) + ':1 sur le fond ; il en faut au moins ' + seuilGraphique + ':1 pour tout usage qui n’est pas décoratif.', ['couleurs.principal', 'couleurs.fond'], declare(doc, 'C2'));
    }

    var etats = c.etats || {};
    Object.keys(etats).forEach(function (nom) {
      var re = contraste(etats[nom], c.fond);
      if (re !== null && re < seuilTexte) ajouter('C3', 'erreur', 'L’état « ' + nom + ' » a un contraste de ' + arrondi(re) + ':1 sur le fond ; il en faut au moins ' + seuilTexte + ':1.', ['couleurs.etats.' + nom, 'couleurs.fond']);
    });

    var e = ecart(c.principal, c.secondaire);
    if (e !== null && e < 5) ajouter('C4', 'erreur', 'Les couleurs principale et secondaire sont presque identiques (écart ' + arrondi(e) + ' ; il en faut au moins 5).', ['couleurs.principal', 'couleurs.secondaire']);

    if (lire(doc, ['modes', 'sombre']) === 'explicite') {
      var s = c.sombre || {};
      var manque = ['principal', 'encre', 'fond'].filter(function (k) { return !HEX.test(String(s[k])); });
      if (manque.length) {
        ajouter('M1', 'erreur', 'Le mode sombre est « explicite » : il manque ' + manque.map(function (k) { return 'la couleur ' + k; }).join(', ') + '.', manque.map(function (k) { return 'couleurs.sombre.' + k; }));
      } else {
        var rs = contraste(s.encre, s.fond);
        if (rs < seuilTexte) ajouter('M1', 'erreur', 'En mode sombre, le texte a un contraste de ' + arrondi(rs) + ':1 sur le fond ; il en faut au moins ' + seuilTexte + ':1.', ['couleurs.sombre.encre', 'couleurs.sombre.fond']);
      }
    }

    var cible = lire(doc, ['interaction', 'cibleMinPx']);
    if (typeof cible === 'number' && cible < 24) ajouter('I1', 'erreur', 'Une cible tactile de ' + cible + ' px est trop petite ; 24 px au moins (44 recommandé).', ['interaction.cibleMinPx']);
    var focus = lire(doc, ['interaction', 'focus', 'contrasteMin']);
    if (typeof focus === 'number' && focus < 3) ajouter('I2', 'erreur', 'L’anneau de focus doit avoir un contraste d’au moins 3:1.', ['interaction.focus.contrasteMin']);
    if (lire(doc, ['interaction', 'mouvement', 'respecteMouvementReduit']) === false) ajouter('I3', 'erreur', 'La préférence « mouvement réduit » doit être respectée.', ['interaction.mouvement.respecteMouvementReduit']);

    var cat = lire(doc, ['visualisation', 'categorielle']);
    var classesMax = nombreOu(lire(doc, ['exigences', 'classesMax']), 5);
    if (Array.isArray(cat) && cat.length > classesMax && lire(doc, ['visualisation', 'motifsSiDaltonisme']) !== true) {
      ajouter('V1', 'avertissement', 'La palette compte ' + cat.length + ' couleurs pour ' + classesMax + ' classes au plus ; doublez-les d’un motif ou déclarez l’écart.', ['visualisation.categorielle'], declare(doc, 'V1'));
    }
    var div = lire(doc, ['visualisation', 'divergente']);
    if (Array.isArray(div) && div.length % 2 === 0) ajouter('V2', 'erreur', 'Une rampe divergente a un nombre impair de couleurs (neutre au centre) ; elle en compte ' + div.length + '.', ['visualisation.divergente']);

    var base = lire(doc, ['typographie', 'echelle', 'base']);
    if (typeof base === 'number' && base < 16) ajouter('T1', 'avertissement', 'Un texte de base de ' + base + ' px est petit ; 16 px au moins est recommandé.', ['typographie.echelle.base'], declare(doc, 'T1'));

    var nonDeclares = out.filter(function (x) { return x.gravite === 'avertissement' && !x.declare; }).map(function (x) { return x.regle; });
    if (nonDeclares.length) {
      ajouter('G1', 'erreur', 'Avertissements non déclarés : ' + nonDeclares.join(', ') + '. Déclarez-les dans les écarts (règle, raison, mesure compensatoire).', ['gouvernance.ecarts']);
    }
    return out;
  }

  /** Ce qui empêche de PROPOSER : les constats de gravité « erreur ». Un brouillon n'est jamais empêché. */
  function bloquants(constats) {
    return (constats || []).filter(function (x) { return x.gravite === 'erreur'; });
  }

  // ── ThemeDef 1.0 ──────────────────────────────────────────────────────────

  /**
   * Le ThemeDef 1.0 qui en découle : nom, graines, mode sombre, seuils. Rien d'autre (le reste n'est pas du ThemeDef 1.0),
   * et jamais de `resolu` (le compilateur le calcule). Un mode sombre « explicite » devient « derive » : ThemeDef 1.0
   * exigerait ses 26 valeurs, que le document ne porte pas.
   *
   * @returns {{themedef:object, remarques:string[]}}
   */
  function projeterThemeDef(doc) {
    var remarques = [];
    var td = { version: 'themedef-1.0' };
    var nom = lire(doc, ['identite', 'nom']);
    if (typeof nom === 'string' && nom) td.nom = nom.slice(0, 80);
    var c = lire(doc, ['couleurs']) || {};
    var graines = {};
    ['principal', 'secondaire', 'encre', 'fond'].forEach(function (k) { if (HEX.test(String(c[k]))) graines[k] = c[k]; });
    if (graines.principal) td.graines = graines;
    else remarques.push('Pas de couleur principale : le ThemeDef n’est pas valide sans elle.');
    var sombre = lire(doc, ['modes', 'sombre']);
    if (sombre === 'explicite') {
      remarques.push('Le mode sombre « explicite » est projeté en « derive » : ThemeDef 1.0 demande ses 26 valeurs.');
      sombre = 'derive';
    }
    if (sombre === 'aucun' || sombre === 'derive') td.modes = { sombre: sombre };
    var ex = {};
    var t = lire(doc, ['exigences', 'contrasteTexte']);
    var g = lire(doc, ['exigences', 'contrasteMinimal']);
    if (typeof t === 'number' && t >= 4.5) ex.contrasteTexte = t;
    if (typeof g === 'number' && g >= 3) ex.contrasteComposant = g;
    if (Object.keys(ex).length) td.exigences = ex;
    return { themedef: td, remarques: remarques };
  }

  // ── Le stockage : la table Design_system ──────────────────────────────────

  var TABLE = 'Design_system';

  /** Les colonnes de la table, dans l'ordre : de quoi la créer (`ensureSchema`) sans rien deviner. */
  var COLONNES = [
    { id: 'cle', type: 'Text', label: 'Clé' },
    { id: 'nom', type: 'Text', label: 'Nom' },
    { id: 'statut', type: 'Choice', label: 'Statut', widgetOptions: { choices: ['brouillon', 'proposition', 'valide'] } },
    { id: 'niveau', type: 'Int', label: 'Niveau' },
    { id: 'dsdef', type: 'Text', label: 'Document' },
    { id: 'actif', type: 'Bool', label: 'Actif' },
    { id: 'version', type: 'Text', label: 'Version' },
    { id: 'maj', type: 'Numeric', label: 'Mis à jour (secondes)' },
    { id: 'hash', type: 'Text', label: 'Empreinte' }
  ];

  /** La forme canonique (clés triées, sans espace) : celle dont on prend l'empreinte. */
  function canonique(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonique).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canonique(v[k]); }).join(',') + '}';
  }

  function base64(octets) {
    var s = '';
    for (var i = 0; i < octets.length; i++) s += String.fromCharCode(octets[i]);
    if (typeof btoa === 'function') return btoa(s);
    return Buffer.from(octets).toString('base64');
  }

  /** `sha256-<base64>` de la forme canonique, ou `null` si aucun moyen de calculer. */
  function empreinte(doc) {
    var texte = canonique(doc) + '\n';
    try {
      var sub = typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
      if (sub && typeof TextEncoder !== 'undefined') {
        return sub.digest('SHA-256', new TextEncoder().encode(texte)).then(function (buf) { return 'sha256-' + base64(new Uint8Array(buf)); });
      }
      if (typeof require === 'function') {
        var h = require('crypto').createHash('sha256').update(texte, 'utf8').digest('base64');
        return Promise.resolve('sha256-' + h);
      }
    } catch (e) { /* pas de calcul possible */ }
    return Promise.resolve(null);
  }

  /** La ligne de table d'un document. `actif` reste faux : seule une personne, hors de ce module, active. */
  function ligneDeDocument(doc, cle, statut, niveau) {
    var texte = JSON.stringify(doc);
    if (texte.length > TAILLE_MAX) throw new Error('Le document dépasse ' + Math.round(TAILLE_MAX / 1024) + ' Ko.');
    return {
      cle: cle, nom: String(lire(doc, ['identite', 'nom']) || cle).slice(0, 80), statut: statut, niveau: niveau,
      dsdef: texte, actif: false, version: VERSION_DOCUMENT, maj: Math.round(Date.now() / 1000)
    };
  }

  /** Un identifiant de ligne (`^[a-z][a-z0-9-]{0,39}$`), tiré d'un nom ; « systeme » à défaut. */
  function cleDepuisNom(nom) {
    var s = String(nom || '').toLowerCase();
    if (typeof s.normalize === 'function') s = s.normalize('NFD');
    // Les accents décomposés (U+0300 à U+036F) tombent : « é » donne « e ».
    s = s.split('').filter(function (ch) { return ch.charCodeAt(0) < 768 || ch.charCodeAt(0) > 879; }).join('');
    s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    if (!s || !/^[a-z]/.test(s)) s = ('ds-' + s).replace(/-+$/g, '').slice(0, 40);
    return s || 'design-system';
  }

  return {
    VERSION: VERSION,
    VERSION_DOCUMENT: VERSION_DOCUMENT,
    CATALOGUE_MINIMAL: CATALOGUE_MINIMAL,
    TABLE: TABLE,
    COLONNES: COLONNES,
    verifierCatalogue: verifierCatalogue,
    construire: construire,
    assembler: assembler,
    aplatir: aplatir,
    controler: controler,
    bloquants: bloquants,
    projeterThemeDef: projeterThemeDef,
    contraste: contraste,
    ecart: ecart,
    canonique: canonique,
    empreinte: empreinte,
    ligneDeDocument: ligneDeDocument,
    cleDepuisNom: cleDepuisNom
  };
}));
