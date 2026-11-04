/*
 * webmcp-entree.js — le point d'entrée navigateur de Form Builder que la vitrine injecte (fiche : `entree_webmcp`).
 *
 * Contrat : le script expose `FormsWebMCPEntree.installer()`. La vitrine ne l'appelle que sur la page du widget et n'y enregistre que les
 * commandes pures qui n'écrivent rien (ni forms_rendre ni forms_recolter, qui montent un formulaire vivant : elles restent à la démo).
 * Il charge lui-même les modules dont le registre dépend, à côté de lui, puis installe les outils WebMCP. Sans `navigator.modelContext`,
 * le repli est `window.formsWebMCP.appeler(nom, entrée)`.
 *
 * Aucun appel réseau hors des fichiers du widget publié : tout se lit relativement à ce script.
 */
(function (root) {
  'use strict';

  // L'ordre compte : le test de forms-webmcp refuse qu'il diverge de webmcp.html. Chemins relatifs au dossier de ce script.
  var SCRIPTS = [
    '../shared/types.js', '../shared/attachments.js', '../shared/session-context.js', '../shared/carte-geometrie.js', '../shared/dessin.js',
    '../shared/referentiel.js', '../shared/formats.js', '../shared/enrichir.js', '../shared/saisies.js', '../shared/prefill.js',
    '../shared/conditions.js', '../shared/limites.js', '../runtime/engine.js', '../shared/formdef-from-table.js',
    '../shared/formdef-from-grist-form.js', '../shared/survey-project.js', '../shared/ensure-schema.js', '../shared/theme.js',
    '../shared/theme-instance.js', '../shared/derivation-valeurs.js', '../shared/themedef.js', '../shared/publish.js',
    '../shared/synthese.js', '../shared/valider-schema.js', 'registre.js', 'navigateur.js'
  ];

  var base = (function () {
    var c = typeof document !== 'undefined' && document.currentScript;
    return c && c.src ? new URL('.', c.src).href : (typeof location !== 'undefined' ? new URL('.', location.href).href : '');
  }());

  function charger(chemin) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = new URL(chemin, base).href;
      s.async = false;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('script introuvable : ' + chemin)); };
      document.head.appendChild(s);
    });
  }

  /** @returns {Promise<{outils:object[], expose:boolean, appeler:function}>} */
  function installer() {
    return SCRIPTS.reduce(function (suite, chemin) { return suite.then(function () { return charger(chemin); }); }, Promise.resolve())
      .then(function () {
        return root.FormsWebMCP.installer({
          global: root,
          document: root.document,
          navigator: root.navigator,
          pures_seulement: true,
          lireJson: function (chemin) {
            return fetch(new URL(chemin, base).href).then(function (r) { if (!r.ok) throw new Error(chemin + ' : ' + r.status); return r.json(); });
          }
        });
      })
      .then(function (p) {
        root.formsWebMCP = { appeler: p.appeler };
        return { outils: p.outils, expose: p.expose, forme: p.forme, appeler: p.appeler };
      });
  }

  root.FormsWebMCPEntree = { installer: installer, SCRIPTS: SCRIPTS };
  // Nom unique que la vitrine cherche, pour tous les widgets (contrat : self.EntreeWebMCP = { installer }).
  root.EntreeWebMCP = root.FormsWebMCPEntree;
}(typeof self !== 'undefined' ? self : this));
