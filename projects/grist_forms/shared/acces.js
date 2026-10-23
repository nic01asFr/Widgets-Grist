/*
 * acces.js — qui voit les réponses d'un formulaire.
 *
 * Retour d'usage : « les personnes qui s'inscrivent ne doivent pas avoir accès aux réponses des autres ».
 * Un formulaire placé dans un document Grist est une page de ce document : celui qui la remplit est
 * un éditeur du document, et voit tout ce que les règles d'accès ne lui cachent pas. Exposer le
 * formulaire sans exposer les réponses se dit donc dans les règles d'accès de Grist.
 *
 * > **Une règle d'accès ne peut que RETIRER des droits.** Elle ne donne pas le droit d'écrire : les
 * > participants doivent déjà être éditeurs (ou arriver par un lien public en édition). Les règles
 * > disent ce que ces éditeurs ne peuvent PAS faire : lire les réponses des autres, les modifier, les
 * > supprimer.
 *
 * Ce module ne parle pas à Grist : il juge un FormDef et dit quelles règles poser, dans la forme des
 * tables `_grist_ACLResources` et `_grist_ACLRules`. L'écriture est un geste de la personne qui
 * gère le document, jamais un effet de bord.
 *
 * Trois réglages (`mode`) :
 *   ouvert      tout le monde voit toutes les réponses (consultation, résultats publics) : aucune règle
 *   propres     chacun ne voit que sa propre réponse (reconnue par son courriel) : il faut être connecté
 *   ajout-seul  les participants ajoutent, sans rien lire ; seules les colonnes qu'il faut pour compter
 *               les places (limites) restent lisibles, sans noms ni courriels
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) {
    module.exports = factory(require('./limites.js'));
  } else if (typeof define === 'function' && define.amd) {
    define(['./limites'], factory);
  } else {
    root.FormAcces = factory(root.FormLimites);
  }
}(typeof self !== 'undefined' ? self : this, function (Limites) {
  'use strict';

  var VERSION = '1.0.0';

  var MODES = {
    'ajout-seul': {
      libelle: 'Les participants ajoutent leur réponse, sans rien lire',
      explication: 'Personne ne voit les réponses des autres, ni les siennes après envoi. Seules les colonnes qui servent à compter les places restent lisibles, sans noms ni courriels.'
    },
    propres: {
      libelle: 'Chacun ne voit que sa propre réponse',
      explication: 'Une personne retrouve ses réponses à son courriel : elle doit être connectée à Grist, et le formulaire doit avoir une question « Courriel ».'
    },
    ouvert: {
      libelle: 'Tout le monde voit toutes les réponses',
      explication: 'Aucune règle : pour une consultation dont les résultats sont publics. À éviter dès qu’on recueille des noms ou des courriels.'
    }
  };

  var CLES_MEMO = 'form-builder:';

  function ident(s) { return typeof s === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s); }
  function courrielSur(s) { return typeof s === 'string' && /^[^\s@'"\\,\[\]]+@[^\s@'"\\,\[\]]+\.[^\s@'"\\,\[\]]{2,}$/.test(s.trim()); }

  function tousLesChamps(def) {
    var out = [];
    ((def && def.sections) || []).forEach(function (s) { (s.fields || []).forEach(function (f) { out.push(f); }); });
    return out;
  }

  /** Les tables que le formulaire lit pour proposer ses choix (références). */
  function tablesLiees(def) {
    var vues = {};
    var out = [];
    tousLesChamps(def).forEach(function (f) {
      var t = (f.options && f.options.refTable) || f.refTable || '';
      var m = /^Ref(?:List)?:(.+)$/.exec(String(f.type || ''));
      if (!t && m) t = m[1];
      if (t && t !== def.tableId && ident(t) && !vues[t]) { vues[t] = true; out.push(t); }
    });
    return out;
  }

  /** La question qui porte le courriel de la personne : par son format, ou par `meta.emailCol`. */
  function colonneCourriel(def) {
    var champs = tousLesChamps(def);
    for (var i = 0; i < champs.length; i++) {
      var f = champs[i];
      if (f.options && f.options.validation && f.options.validation.format === 'courriel' && ident(f.colId)) return f.colId;
    }
    return def && def.meta && ident(def.meta.emailCol) ? def.meta.emailCol : '';
  }

  function memoDe(def) { return CLES_MEMO + String((def && def.id) || 'formulaire').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 60); }

  /** « user.Access == OWNER or user.Email in ['a@b.fr', …] » : qui garde tous les droits. */
  function conditionGestion(gestionnaires) {
    var l = (gestionnaires || []).map(function (e) { return "'" + e.trim().toLowerCase() + "'"; });
    return l.length ? 'user.Access == OWNER or user.Email in [' + l.join(', ') + ']' : 'user.Access == OWNER';
  }

  /**
   * Grist refuse une règle placée après une règle sans condition dans la même ressource (« listed after
   * default rule », mesuré le 23/10/2026) : la règle sans condition clôt sa ressource. Cette vérification
   * garde le planificateur de produire un jeu que Grist rejetterait en bloc.
   * @returns {string[]} les fautes (vide si l'ordre est valable)
   */
  function ordreInvalide(regles) {
    var clos = {};
    var fautes = [];
    (regles || []).forEach(function (r, i) {
      var cle = r.tableId + '|' + r.colIds;
      if (clos[cle]) fautes.push('La règle ' + (i + 1) + ' (' + r.tableId + ', ' + r.colIds + ') suit une règle sans condition : Grist la refuserait.');
      if (!r.aclFormula) clos[cle] = true;
    });
    return fautes;
  }

  /**
   * Les règles à poser pour un formulaire.
   *
   * @param {object} def le FormDef
   * @param {object} opts { mode, gestionnaires: [courriels], defautRefus: bool, colIdentite }
   *   `defautRefus` : les participants ne voient AUCUNE autre table du document (en plus de celles du
   *   formulaire). Sans lui, ils voient encore les autres tables et pages : c'est à dire à la personne qui
   *   gère le document.
   * @returns {{ ok: boolean, erreurs: string[], avertissements: string[], resume: string[], regles: Array }}
   *   `regles` : [{ tableId, colIds, aclFormula, permissionsText, memo }] dans l'ordre d'évaluation :
   *   colonnes précises, puis la table, puis le reste du document.
   */
  function champsFichiers(def) {
    return ((def && def.sections) || []).some(function (s) {
      return (s.fields || []).some(function (f) { return f && (f.type === 'Attachments' || f.widget === 'file' || f.widget === 'photo'); });
    });
  }

  function planRegles(def, opts) {
    opts = opts || {};
    var out = { ok: true, erreurs: [], avertissements: [], resume: [], regles: [] };
    var mode = opts.mode || 'ajout-seul';
    if (!MODES[mode]) { out.ok = false; out.erreurs.push('Réglage inconnu : « ' + mode + ' ».'); return out; }
    if (!def || !ident(def.tableId)) { out.ok = false; out.erreurs.push('La table des réponses n’est pas choisie.'); return out; }

    var T = def.tableId;
    var gest = [];
    (opts.gestionnaires || []).forEach(function (e) {
      if (courrielSur(e)) gest.push(String(e).trim().toLowerCase());
      else out.erreurs.push('« ' + e + ' » n’est pas une adresse de courriel.');
    });
    if (out.erreurs.length) { out.ok = false; return out; }

    if (mode === 'ouvert') {
      out.resume.push('Aucune règle : toute personne qui a accès au document voit toutes les réponses.');
      out.avertissements.push('Les réponses sont lisibles par toute personne qui ouvre le document. N’y recueillez ni nom, ni courriel, ni rien de personnel.');
      return out;
    }

    // Un document partagé avec le public (personnes sans compte, rôle Éditeur) : sans « le reste caché », un
    // anonyme pourrait aussi modifier la structure des autres tables. La règle est donc posée d'office.
    var enPublic = !!opts.public;
    var defautRefus = !!opts.defautRefus || enPublic;
    var memo = memoDe(def);
    var staff = conditionGestion(gest);
    var retenu = def.limites && Limites ? Limites.normaliser(def.limites).limites : null;
    var comptees = retenu ? Limites.colonnesComptees(retenu).filter(ident) : [];
    var liees = tablesLiees(def);
    var R = out.regles;
    var regle = function (tableId, colIds, formule, perms) {
      R.push({ tableId: tableId, colIds: colIds, aclFormula: formule, permissionsText: perms, memo: memo });
    };

    // 1. Les colonnes qui servent à compter : lisibles de tous, jamais modifiables. Avant la table : le plus précis d'abord.
    if (comptees.length) regle(T, comptees.join(','), '', '+R');

    // 2. La table des réponses.
    regle(T, '*', staff, '+CRUDS');
    if (mode === 'propres') {
      var col = opts.colIdentite || colonneCourriel(def);
      if (!ident(col)) {
        out.ok = false;
        out.erreurs.push('Pour que chacun voie sa réponse, le formulaire doit avoir une question « Courriel » (format courriel) : c’est elle qui reconnaît la personne.');
        return out;
      }
      regle(T, '*', 'user.Email and rec.' + col + ' == user.Email', '+R');
      out.avertissements.push('Seule une personne connectée à Grist retrouve ses réponses : un lien public anonyme ne voit rien.');
    }
    // Une seule règle finale : Grist refuse toute règle placée après une règle sans condition (mesuré :
    // « listed after default rule »). Elle dit à la fois ce qui est permis et ce qui est refusé.
    regle(T, '*', '', '+C-RUDS');

    // 3. Les tables que le formulaire lit pour ses choix : lisibles, jamais modifiables par les participants.
    liees.forEach(function (t) {
      regle(t, '*', staff, '+CRUDS');
      regle(t, '*', '', '+R-CUDS');
    });
    if (liees.length) {
      out.avertissements.push('Les tables liées (' + liees.join(', ') + ') restent lisibles par les participants : le formulaire en a besoin pour proposer ses choix. N’y mettez rien de confidentiel.');
    }

    // 4. Le reste du document.
    if (defautRefus) {
      regle('*', '*', staff, '+CRUDS');
      regle('*', '*', '', '-CRUDS');
    } else {
      out.avertissements.push('Les autres tables et pages du document restent visibles de tout éditeur, participants compris. Cochez « cacher le reste du document » si le document n’est partagé qu’avec eux.');
    }

    var fautes = ordreInvalide(R);
    if (fautes.length) { out.ok = false; out.erreurs = out.erreurs.concat(fautes); return out; }

    // Ce que ça fait, en phrases.
    var qui = gest.length ? 'les propriétaires du document et ' + gest.length + ' personne(s) désignée(s)' : 'les propriétaires du document';
    out.resume.push('Gardent tous les droits : ' + qui + '.');
    out.resume.push(mode === 'propres'
      ? 'Les participants ajoutent une réponse et ne lisent que les leurs ; ils ne peuvent ni modifier ni supprimer.'
      : 'Les participants ajoutent une réponse ; ils ne lisent aucune réponse (ni les leurs) et ne peuvent ni modifier ni supprimer.');
    if (comptees.length) out.resume.push('Restent lisibles pour compter les places : ' + comptees.join(', ') + ' (sans noms ni courriels).');
    if (liees.length) out.resume.push('Lisibles, en lecture seule : ' + liees.join(', ') + '.');
    out.resume.push(defautRefus ? 'Tout le reste du document est caché aux participants.' : 'Le reste du document n’est pas touché.');
    if (enPublic) {
      out.avertissements.push('Accès public : personne n’est identifié, ce que la personne tape (son courriel, son nom) est déclaratif et peut être inventé. Le partage public se règle dans « Partager » de Grist, par un propriétaire : Form Builder n’y touche pas.');
      if (champsFichiers(def)) out.avertissements.push('Une question de pièce jointe est présente : un anonyme peut téléverser un fichier sans que les règles s’appliquent (mesuré) ; la limite d’instance est de 10 Mo par fichier.');
    }
    return out;
  }

  /**
   * Les actions Grist qui posent ces règles, sans jamais modifier une règle existante : des lignes nouvelles,
   * reconnaissables à leur mémo (`form-builder:<id>`), qu'on peut retirer d'un geste.
   *
   * @param {Array} regles la sortie de `planRegles`
   * @param {object} existant { ressources: [{ id, tableId, colIds }], regles: [{ id, resource, rulePos, memo, tableId, colIds }] }
   * @returns {{ ok: boolean, erreurs: string[], actions: Array }}
   */
  function actionsPose(regles, existant) {
    existant = existant || {};
    var res = existant.ressources || [];
    var rls = existant.regles || [];
    var out = { ok: true, erreurs: [], infos: [], actions: [] };
    if (!regles || !regles.length) return out;

    // Le reste du document déjà fermé aux non-propriétaires (une règle « propriétaire : tous les droits » suivie d'un
    // refus sans condition) : celle qu'on s'apprêtait à poser est déjà là, on ne la double pas et on ne la touche pas.
    var racine = res.filter(function (x) { return x.tableId === '*' && x.colIds === '*'; })[0];
    var regRacine = racine ? rls.filter(function (r) { return r.resource === racine.id; }) : [];
    var dejaFerme = regRacine.some(function (r) { return r.aclFormula === 'user.Access == OWNER' && /^\+CRUDS$/.test(r.permissionsText || ''); }) &&
      regRacine.some(function (r) { return !r.aclFormula && /^-CRUDS$/.test(r.permissionsText || ''); });
    if (dejaFerme && regles.some(function (r) { return r.tableId === '*' && r.colIds === '*'; })) {
      var gardees = regles.filter(function (r) { return !(r.tableId === '*' && r.colIds === '*'); });
      var staffAutre = regles.some(function (r) { return r.tableId === '*' && r.colIds === '*' && r.aclFormula && r.aclFormula !== 'user.Access == OWNER'; });
      if (!staffAutre) {
        regles = gardees;
        out.infos.push('Le reste du document est déjà fermé aux non-propriétaires par une règle existante : elle est gardée telle quelle.');
        if (!regles.length) return out;
      }
    }

    // Des règles étrangères déjà posées sur la même table ou sur le défaut : on ne les croise pas, on le dit.
    var visees = {};
    regles.forEach(function (r) { visees[r.tableId] = true; });
    var memoNotre = regles[0].memo;
    var etrangeres = rls.filter(function (r) {
      var rs = res.filter(function (x) { return x.id === r.resource; })[0];
      var table = (rs && rs.tableId) || r.tableId;
      return table && visees[table] && r.memo !== memoNotre && (r.aclFormula || r.permissionsText);
    });
    if (etrangeres.length) {
      var tables = {};
      etrangeres.forEach(function (r) { var rs = res.filter(function (x) { return x.id === r.resource; })[0]; tables[(rs && rs.tableId) || r.tableId] = true; });
      out.ok = false;
      out.erreurs.push('Des règles d’accès existent déjà pour ' + Object.keys(tables).map(function (t) { return '« ' + t + ' »'; }).join(', ') +
        '. Form Builder ne les modifie pas : ajoutez les règles proposées à la main dans Grist (Règles d’accès), ou retirez les anciennes.');
      return out;
    }
    if (rls.some(function (r) { return r.memo === memoNotre; })) {
      out.ok = false;
      out.erreurs.push('Les règles de ce formulaire sont déjà posées. Retirez-les d’abord pour les changer.');
      return out;
    }

    var prochainRes = res.reduce(function (m, r) { return Math.max(m, r.id); }, 0) + 1;
    var pos = rls.reduce(function (m, r) { return Math.max(m, typeof r.rulePos === 'number' ? r.rulePos : 0); }, 0);
    var ids = {};
    res.forEach(function (r) { ids[r.tableId + '|' + r.colIds] = r.id; });
    regles.forEach(function (r) {
      var cle = r.tableId + '|' + r.colIds;
      if (ids[cle] === undefined) {
        ids[cle] = prochainRes++;
        out.actions.push(['AddRecord', '_grist_ACLResources', ids[cle], { tableId: r.tableId, colIds: r.colIds }]);
      }
    });
    var prochainRegle = rls.reduce(function (m, r) { return Math.max(m, r.id); }, 0) + 1;
    regles.forEach(function (r) {
      pos += 1;
      out.actions.push(['AddRecord', '_grist_ACLRules', prochainRegle++, {
        resource: ids[r.tableId + '|' + r.colIds], aclFormula: r.aclFormula, permissionsText: r.permissionsText, rulePos: pos, memo: r.memo
      }]);
    });
    return out;
  }

  /**
   * Les actions qui retirent les règles d'un formulaire : celles qui portent son mémo, et les ressources
   * que plus aucune règle n'utilise. Une règle étrangère n'est jamais touchée.
   */
  function actionsRetrait(def, existant) {
    existant = existant || {};
    var memo = memoDe(def);
    var res = existant.ressources || [];
    var rls = existant.regles || [];
    var aRetirer = rls.filter(function (r) { return r.memo === memo; });
    var actions = aRetirer.map(function (r) { return ['RemoveRecord', '_grist_ACLRules', r.id]; });
    var restantes = {};
    rls.forEach(function (r) { if (r.memo !== memo) restantes[r.resource] = true; });
    var vues = {};
    aRetirer.forEach(function (r) {
      if (!restantes[r.resource] && !vues[r.resource]) {
        var rs = res.filter(function (x) { return x.id === r.resource; })[0];
        // Les ressources de base d'un document (la vide, ou `*`/`*` portée par d'autres règles) ne sont pas les nôtres.
        if (rs && rs.tableId) { vues[r.resource] = true; actions.push(['RemoveRecord', '_grist_ACLResources', r.resource]); }
      }
    });
    return actions;
  }

  /** Quel réglage est posé : retrouvé aux règles qui portent le mémo du formulaire. */
  function modePose(def, existant) {
    var memo = memoDe(def);
    var rls = ((existant && existant.regles) || []).filter(function (r) { return r.memo === memo; });
    if (!rls.length) return null;
    return rls.some(function (r) { return /rec\./.test(r.aclFormula || ''); }) ? 'propres' : 'ajout-seul';
  }

  return {
    VERSION: VERSION,
    MODES: MODES,
    planRegles: planRegles,
    actionsPose: actionsPose,
    actionsRetrait: actionsRetrait,
    modePose: modePose,
    ordreInvalide: ordreInvalide,
    memoDe: memoDe,
    tablesLiees: tablesLiees,
    colonneCourriel: colonneCourriel
  };
}));
