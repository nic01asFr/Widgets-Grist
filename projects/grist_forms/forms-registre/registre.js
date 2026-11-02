/*
 * registre.js — le registre de commandes de Form Builder (widgets auto-descriptifs, v1).
 *
 * Une liste unique de commandes `forms_*`. Chaque commande ne fait qu'appeler le noyau pur de `shared/` (aucun DOM, aucun `grist.*`) :
 * le registre ne recalcule rien, il rend le noyau appelable par un nom, une entrée et une sortie. Le CLI, le serveur MCP et la page WebMCP
 * lisent ce même registre ; la fiche de capacités (`fiche()`) en est déduite, jamais écrite à la main.
 *
 * v1 : lecture seule. Aucune commande n'écrit (`ecrit: 'rien'`) ; les plans d'écriture (schéma, publication) sont RENDUS, pas appliqués.
 * Les écritures (forms_appliquer_schema, forms_publier) viendront en v2, distinctes et refusées par défaut dans le MCP.
 *
 * Les modules du noyau et le validateur de schéma sont INJECTÉS : le registre sert tel quel dans Node (index.js) et dans une page (WebMCP).
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.FormsRegistre = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION_FICHE = 'fiche-capacites-0.1';

  var VERBES = ['presenter', 'configurer', 'creer', 'editer', 'structurer', 'personnaliser', 'publier', 'exploiter', 'recolter', 'traiter'];

  /** Ce que la fiche dit ne pas couvrir en v1 : déclaré, jamais passé sous silence. */
  var NON_COUVERTS = ['editer', 'exploiter', 'recolter'];

  var OBJET = { type: 'object' };
  var LISTE = { type: 'array' };
  var TEXTE = { type: 'string' };

  /** Définit toutes les commandes pour un jeu de modules donné. */
  function definir(m) {
    function exiger(nom) {
      if (!m[nom]) throw new Error('registre forms : le module « ' + nom + ' » manque');
      return m[nom];
    }

    return [
      {
        nom: 'forms_capacites',
        verbe: 'presenter',
        description: 'Présente Form Builder : ce qu’il sait faire (les commandes par verbe), ce qu’il ne couvre pas encore, les contrats qu’il produit et lit, ses limites. À appeler en premier.',
        entree: { type: 'object', properties: {} },
        sortie: OBJET,
        nature: 'pure',
        ecrit: 'rien',
        exemples: [{ titre: 'La fiche de capacités', entree: {} }],
        executer: function () { return null; } // remplacé par le registre : la fiche se déduit de la liste
      },
      {
        nom: 'forms_formdef_depuis_colonnes',
        verbe: 'creer',
        description: 'Déduit un FormDef des colonnes d’une table Grist (une question par colonne, hors colonnes internes). Rend `formdef: null` quand aucune colonne ne donne de question.',
        entree: { type: 'object', required: ['tableId', 'colonnes'], properties: { tableId: TEXTE, colonnes: LISTE, titre: TEXTE, ignorer: LISTE } },
        sortie: { type: 'object', required: ['formdef'] },
        nature: 'pure',
        ecrit: 'rien',
        exemples: [{
          titre: 'Une table de deux colonnes',
          entree: { tableId: 'Inscriptions', colonnes: [{ colId: 'nom', type: 'Text', label: 'Nom' }, { colId: 'age', type: 'Int', label: 'Âge' }] }
        }],
        executer: function (e) {
          return { formdef: exiger('FormDefFromTable').formDefDepuisColonnes(e) };
        }
      },
      {
        nom: 'forms_formdef_depuis_formulaire_grist',
        verbe: 'creer',
        description: 'Lit les formulaires natifs d’un document Grist et rend chacun en FormDef. L’entrée est le contenu des tables de métadonnées (tables, colonnes, vues, sections, champs), tel que fetchTable le rend.',
        entree: { type: 'object', required: ['meta'], properties: { meta: OBJET } },
        sortie: { type: 'object', required: ['formulaires'] },
        nature: 'pure',
        ecrit: 'rien',
        exemples: [{ titre: 'Un document sans formulaire natif', entree: { meta: {} } }],
        executer: function (e) {
          return { formulaires: exiger('FormDefFromGristForm').formulairesGrist(e.meta) };
        }
      },
      {
        nom: 'forms_valider_formdef',
        verbe: 'structurer',
        description: 'Contrôle un FormDef contre son contrat (formdef-1.0) et rend les écarts. Un FormDef conforme rend une liste d’écarts vide.',
        entree: { type: 'object', required: ['formdef'], properties: { formdef: OBJET } },
        sortie: { type: 'object', required: ['conforme', 'ecarts'] },
        nature: 'pure',
        ecrit: 'rien',
        exemples: [{ titre: 'Un FormDef vide', entree: { formdef: {} } }],
        executer: function (e) {
          var valider = exiger('validerSchema');
          var schema = exiger('schemaFormDef');
          var ecarts = valider(e.formdef, schema, schema);
          return { conforme: ecarts.length === 0, ecarts: ecarts };
        }
      },
      {
        nom: 'forms_valider_condition',
        verbe: 'structurer',
        description: 'Contrôle une condition d’affichage (grammaire conditions-1.0). Rend les erreurs avec leur chemin ; `bloquant` dit si la condition serait refusée. Un opérateur inconnu est une faute, jamais « vrai ».',
        entree: { type: 'object', required: ['condition'], properties: { condition: {} } },
        sortie: { type: 'object', required: ['valide', 'erreurs'] },
        nature: 'pure',
        ecrit: 'rien',
        exemples: [
          { titre: 'Une règle correcte', entree: { condition: { field: 'age', operator: '>=', value: 18 } } },
          { titre: 'Un opérateur inconnu', entree: { condition: { field: 'age', operator: 'presque', value: 18 } } }
        ],
        executer: function (e) {
          var erreurs = exiger('Conditions').validerCondition(e.condition);
          return { valide: !erreurs.some(function (x) { return x.bloquant; }), erreurs: erreurs };
        }
      },
      {
        nom: 'forms_verifier_format',
        verbe: 'structurer',
        description: 'Éprouve une valeur contre un format nommé (iban, siren, siret, codePostal, insee, heure, courriel, nom, prenom, nomComplet, telephone) et rend la forme normalisée. Un format inconnu laisse tout passer et le dit (`connu: false`).',
        entree: { type: 'object', required: ['format', 'valeur'], properties: { format: TEXTE, valeur: {} } },
        sortie: { type: 'object', required: ['connu', 'valide', 'normalise', 'message_si_invalide'] },
        nature: 'pure',
        ecrit: 'rien',
        exemples: [{ titre: 'Un code postal', entree: { format: 'codePostal', valeur: '13001' } }],
        executer: function (e) {
          var F = exiger('Formats');
          return { connu: F.connu(e.format), valide: F.valide(e.format, e.valeur), normalise: F.normalise(e.format, e.valeur), message_si_invalide: F.message(e.format) };
        }
      },
      {
        nom: 'forms_formdef_vers_manifeste_enquete',
        verbe: 'structurer',
        description: 'Convertit un FormDef en manifeste d’enquête (survey-manifest). Sens inverse : forms_manifeste_enquete_vers_formdef.',
        entree: { type: 'object', required: ['formdef'], properties: { formdef: OBJET } },
        sortie: { type: 'object', required: ['manifeste'] },
        nature: 'pure',
        ecrit: 'rien',
        exemples: [{
          titre: 'Un formulaire d’une question',
          entree: { formdef: { manifest_version: '1.0.0', id: 'exemple', title: 'Exemple', tableId: 'Exemple', composeMode: 'bind', sections: [{ id: 'main', label: 'Exemple', fields: [{ id: 'nom', colId: 'nom', type: 'Text', label: 'Nom' }] }], choices: {} } }
        }],
        executer: function (e) {
          return { manifeste: exiger('SurveyProject').formDefToSurveyManifest(e.formdef) };
        }
      },
      {
        nom: 'forms_manifeste_enquete_vers_formdef',
        verbe: 'structurer',
        description: 'Convertit un manifeste d’enquête en FormDef. Sens inverse : forms_formdef_vers_manifeste_enquete.',
        entree: { type: 'object', required: ['manifeste'], properties: { manifeste: OBJET, options: OBJET } },
        sortie: { type: 'object', required: ['formdef'] },
        nature: 'pure',
        ecrit: 'rien',
        exemples: [{
          titre: 'Un manifeste d’une question',
          entree: { manifeste: { manifest_version: '1.0.0', id: 'exemple', title: 'Exemple', sections: [{ id: 'main', label: 'Exemple', gate: null, questions: [{ colId: 'nom', label: 'Nom', type: 'text' }] }], choices: {} } }
        }],
        executer: function (e) {
          return { formdef: exiger('SurveyProject').surveyManifestToFormDef(e.manifeste, e.options) };
        }
      },
      {
        nom: 'forms_plan_schema',
        verbe: 'configurer',
        description: 'Calcule le plan d’actions Grist qui crée la table et les colonnes manquantes d’un FormDef. Il rend le plan sans l’appliquer ; il ne change jamais le type d’une colonne existante.',
        entree: { type: 'object', required: ['formdef'], properties: { formdef: OBJET, colonnes_existantes: LISTE, table_existe: { type: 'boolean' } } },
        sortie: { type: 'object', required: ['ok', 'actions'] },
        nature: 'pure',
        ecrit: 'rien',
        exemples: [{
          titre: 'Une table absente',
          entree: {
            formdef: { manifest_version: '1.0.0', id: 'exemple', title: 'Exemple', tableId: 'Exemple', composeMode: 'bind', sections: [{ id: 'main', label: 'Exemple', fields: [{ id: 'nom', colId: 'nom', type: 'Text', label: 'Nom' }] }], choices: {} },
            colonnes_existantes: [],
            table_existe: false
          }
        }],
        executer: function (e) {
          return exiger('EnsureSchema').planEnsureSchema(e.formdef, e.colonnes_existantes || [], { tableExists: e.table_existe });
        }
      },
      {
        nom: 'forms_resoudre_theme',
        verbe: 'personnaliser',
        description: 'Dérive les variables de thème (--kit-*) d’un ThemeDef 1.0 à partir de ses couleurs de départ, pour un mode clair ou sombre. Un thème illisible est refusé en entier.',
        entree: { type: 'object', required: ['themedef'], properties: { themedef: OBJET, mode: { enum: ['clair', 'sombre'] } } },
        sortie: { type: 'object', required: ['ok'] },
        nature: 'pure',
        ecrit: 'rien',
        exemples: [{ titre: 'Une seule couleur de départ', entree: { themedef: { version: 'themedef-1.0', nom: 'Exemple', graines: { principal: '#0b6e4f' } }, mode: 'clair' } }],
        executer: function (e) {
          var T = exiger('ThemeDef');
          var lu = T.lireThemeDef(e.themedef);
          if (!lu.ok) return { ok: false, erreur: lu.erreur };
          var r = T.resoudre(lu.themedef, e.mode || 'clair');
          return r.refus ? { ok: false, refus: r.refus } : { ok: true, mode: r.mode, source: r.source, vars: r.vars };
        }
      },
      {
        nom: 'forms_plan_publication',
        verbe: 'publier',
        description: 'Calcule les actions qui créent une page personnalisée liée à une table, et les options de la vue qui porte le formulaire (HTML et JS déjà assemblés). Il rend le plan sans l’appliquer.',
        entree: { type: 'object', required: ['table_ref', 'html', 'js'], properties: { table_ref: { type: 'number' }, nom_page: TEXTE, html: TEXTE, js: TEXTE } },
        sortie: { type: 'object', required: ['actions', 'options'] },
        nature: 'pure',
        ecrit: 'rien',
        exemples: [{ titre: 'Une page pour la table 1', entree: { table_ref: 1, nom_page: 'Remplir', html: '<div id="f"></div>', js: 'void 0;' } }],
        executer: function (e) {
          var P = exiger('Publish');
          return { actions: P.planCreateCustomPage(e.table_ref, e.nom_page), options: P.buildCustomViewOptions({ html: e.html, js: e.js }) };
        }
      },
      {
        nom: 'forms_synthese',
        verbe: 'traiter',
        description: 'Relit les réponses d’un formulaire avec le FormDef qui les a produites : fréquences, échelles, classements, listes. La table seule n’est pas lisible, le FormDef sait ce que chaque colonne veut dire.',
        entree: { type: 'object', required: ['formdef', 'lignes'], properties: { formdef: OBJET, lignes: LISTE } },
        sortie: OBJET,
        nature: 'pure',
        ecrit: 'rien',
        exemples: [{
          titre: 'Deux réponses',
          entree: {
            formdef: { manifest_version: '1.0.0', id: 'exemple', title: 'Exemple', tableId: 'Exemple', composeMode: 'bind', sections: [{ id: 'main', label: 'Exemple', fields: [{ id: 'avis', colId: 'avis', type: 'Choice', label: 'Votre avis', choices: ['oui', 'non'] }] }], choices: {} },
            lignes: [{ avis: 'oui' }, { avis: 'oui' }]
          }
        }],
        executer: function (e) {
          return exiger('Synthese').construire(e.formdef, e.lignes);
        }
      }
    ];
  }

  /** Une erreur typée : jamais une exception au travers d'une interface. */
  function erreur(code, message, extra) {
    var r = { ok: false, erreur: { code: code, message: message } };
    if (extra) r.erreur.details = extra;
    return r;
  }

  /**
   * Le registre : `commandes`, `appeler`, `fiche`.
   *
   * @param {object} modules FormDefFromTable, FormDefFromGristForm, Conditions, Formats, SurveyProject, EnsureSchema, ThemeDef, Publish, Synthese,
   *   plus `validerSchema(valeur, schema, racine)` et `schemaFormDef`, et `valider` (le validateur d'entrée des commandes).
   * @param {{version: string, contrats?: object}} infos version du widget et contrats déclarés
   */
  function creer(modules, infos) {
    modules = modules || {};
    infos = infos || {};
    var commandes = definir(modules);
    var parNom = {};
    commandes.forEach(function (c) { parNom[c.nom] = c; });

    function controler(c, entree) {
      if (typeof modules.valider !== 'function') return [];
      return modules.valider(entree, c.entree, c.entree);
    }

    function appeler(nom, entree) {
      var c = parNom[nom];
      if (!c) return erreur('commande-inconnue', 'Commande inconnue : ' + nom + '. forms_capacites liste ce qui existe.');
      if (c.nature !== 'pure') return erreur('exige-la-page', 'Cette commande ne s’exécute que dans une page.');
      entree = entree === undefined ? {} : entree;
      var ecarts = controler(c, entree);
      if (ecarts.length) return erreur('entree-invalide', 'L’entrée ne correspond pas au schéma de ' + nom + '.', ecarts);
      try {
        var sortie = c.nom === 'forms_capacites' ? fiche() : c.executer(entree);
        return { ok: true, sortie: sortie };
      } catch (e) {
        return erreur('echec', String(e && e.message ? e.message : e));
      }
    }

    function decrire(c) {
      return {
        nom: c.nom,
        verbe: c.verbe,
        description: c.description,
        entree: c.entree,
        sortie: c.sortie,
        nature: c.nature,
        ecrit: c.ecrit,
        exemples: c.exemples.map(function (x) {
          var r = appeler(c.nom, x.entree);
          return { titre: x.titre, entree: x.entree, sortie: r.ok ? r.sortie : r.erreur };
        })
      };
    }

    /** La fiche de capacités (fiche-capacites-0.1) : déduite des commandes, jamais saisie à part. */
    function fiche() {
      var verbes = {};
      commandes.forEach(function (c) { (verbes[c.verbe] = verbes[c.verbe] || []).push(c.nom); });
      return {
        contrat: VERSION_FICHE,
        widget: 'forms',
        version: infos.version || '0.0.0',
        presentation: {
          titre: 'Form Builder',
          resume: 'Compose un formulaire Grist, le relie à sa table, le publie dans le document et relit les réponses. Ces commandes ne font que lire et calculer : elles rendent des plans, elles n’écrivent rien dans un document.'
        },
        verbes: verbes,
        non_couverts: NON_COUVERTS.filter(function (v) { return !verbes[v]; }),
        contrats: infos.contrats || { produit: [], lit: [] },
        prerequis: { acces_grist: 'none' },
        limites: [
          'Version 1 en lecture seule : aucune commande n’écrit dans un document Grist.',
          'Appliquer un plan de schéma ou de publication n’est pas encore une commande.',
          'Le formulaire vivant (rendu, saisie, envoi) ne se pilote pas par ces commandes : il vit dans une page.',
          'Les commandes ne se connectent à aucun document : les tables et les réponses sont données en entrée.'
        ],
        exemples: commandes.filter(function (c) { return c.exemples.length; }).map(function (c) { return c.nom; })
      };
    }

    return {
      VERSION_FICHE: VERSION_FICHE,
      VERBES: VERBES,
      commandes: commandes,
      lister: function () { return commandes.map(decrire); },
      decrire: function (nom) { return parNom[nom] ? decrire(parNom[nom]) : null; },
      appeler: appeler,
      fiche: fiche
    };
  }

  return { VERSION_FICHE: VERSION_FICHE, VERBES: VERBES, NON_COUVERTS: NON_COUVERTS, creer: creer };
}));
