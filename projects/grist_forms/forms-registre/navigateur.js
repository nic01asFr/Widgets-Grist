/*
 * navigateur.js — les commandes de Form Builder dans une page : WebMCP (navigator.modelContext) pour les agents du navigateur.
 *
 * La page expose les MÊMES commandes pures que le registre, avec les mêmes noms, schémas et sorties, plus deux commandes qui n'existent que dans
 * une page, parce qu'elles montent le formulaire vivant : forms_rendre et forms_recolter (nature `exige-la-page`). Rien n'est écrit dans un
 * document : la page n'est connectée à aucun document, et l'envoi d'un formulaire y est simulé.
 *
 * `installer(env)` reçoit tout ce dont il dépend (l'espace global qui porte les modules du noyau, `navigator`, un lecteur de JSON, le conteneur du
 * formulaire) : la même installation se rejoue sans navigateur pour éprouver la parité avec le registre.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FormsWebMCP = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function texte(valeur) { return JSON.stringify(valeur); }

  function resultat(ok, valeur) { return { content: [{ type: 'text', text: texte(valeur) }], isError: !ok }; }

  /**
   * @param {object} env
   * @param {object} env.global        porte FormDefFromTable, FormDefFromGristForm, FormConditions, FormFormats, SurveyProject, EnsureSchema,
   *                                   FormThemeDef, Publish, FormSynthese, ValiderSchema, FormsRegistre, et FormEngine pour le rendu
   * @param {object} [env.navigator]   expose `modelContext` quand le navigateur sait WebMCP
   * @param {function} env.lireJson    (chemin) -> Promise du JSON lu (schéma du FormDef, fiche de capacités)
   * @param {Element} [env.conteneur]  où monter le formulaire (forms_rendre)
   * @returns {Promise<{outils:object[], registre:object, expose:boolean, appeler:function}>}
   */
  function installer(env) {
    var g = env.global;
    return Promise.all([env.lireJson('../runtime/formdef.schema.json'), env.lireJson('fiche-capacites.json')]).then(function (lus) {
      var schemaFormDef = lus[0];
      var ficheVersionnee = lus[1];
      var modules = {
        FormDefFromTable: g.FormDefFromTable,
        FormDefFromGristForm: g.FormDefFromGristForm,
        Conditions: g.FormConditions,
        Formats: g.FormFormats,
        SurveyProject: g.SurveyProject,
        EnsureSchema: g.EnsureSchema,
        ThemeDef: g.FormThemeDef,
        Publish: g.Publish,
        Synthese: g.FormSynthese,
        valider: g.ValiderSchema.valider,
        validerSchema: g.ValiderSchema.valider,
        schemaFormDef: schemaFormDef
      };
      var registre = g.FormsRegistre.creer(modules, { version: ficheVersionnee.version, contrats: ficheVersionnee.contrats });
      // La fiche que la page rend doit être celle qui est versionnée : sinon la page et le dépôt se contredisent.
      var fraiche = texte(registre.fiche());
      if (fraiche !== texte(ficheVersionnee)) throw new Error('fiche-capacites.json ne correspond pas aux commandes de la page : relancer generer-fiche.js');

      var derniere = { envoye: false, valeurs: null };

      var commandesPage = [
        {
          nom: 'forms_rendre',
          verbe: 'exploiter',
          description: 'Monte dans la page le formulaire décrit par un FormDef, avec des valeurs de départ facultatives. La personne (ou l’agent) le remplit dans la page. Aucun document n’est connecté : l’envoi est simulé. Refuse un FormDef non conforme.',
          entree: { type: 'object', required: ['formdef'], properties: { formdef: { type: 'object' }, valeurs: { type: 'object' } } },
          sortie: { type: 'object', required: ['rendu'] },
          nature: 'exige-la-page',
          ecrit: 'rien',
          executer: function (e) {
            if (!env.conteneur || !g.FormEngine) return { ok: false, erreur: { code: 'page-sans-moteur', message: 'Cette page ne porte pas le moteur de formulaire.' } };
            var ecarts = modules.valider(e.formdef, schemaFormDef, schemaFormDef);
            if (ecarts.length) return { ok: false, erreur: { code: 'formdef-invalide', message: 'Le FormDef ne respecte pas son contrat.', details: ecarts } };
            derniere = { envoye: false, valeurs: null };
            g.FormEngine.mount(env.conteneur, e.formdef, {
              skipProbe: true,
              values: e.valeurs || {},
              submit: function (donnees) { derniere = { envoye: true, valeurs: donnees }; return Promise.resolve(); }
            });
            return { ok: true, sortie: { rendu: true, tableId: e.formdef.tableId } };
          }
        },
        {
          nom: 'forms_recolter',
          verbe: 'recolter',
          description: 'Rend ce qui a été envoyé dans le formulaire monté par forms_rendre (envoi simulé : rien n’est écrit dans un document). `envoye: false` tant que le formulaire n’a pas été envoyé.',
          entree: { type: 'object', properties: {} },
          sortie: { type: 'object', required: ['envoye'] },
          nature: 'exige-la-page',
          ecrit: 'rien',
          executer: function () { return { ok: true, sortie: { envoye: derniere.envoye, valeurs: derniere.valeurs } }; }
        }
      ];

      function appeler(nom, entree) {
        var page = commandesPage.filter(function (c) { return c.nom === nom; })[0];
        if (page) {
          var ecarts = modules.valider(entree === undefined ? {} : entree, page.entree, page.entree);
          if (ecarts.length) return { ok: false, erreur: { code: 'entree-invalide', message: 'L’entrée ne correspond pas au schéma de ' + nom + '.', details: ecarts } };
          return page.executer(entree === undefined ? {} : entree);
        }
        return registre.appeler(nom, entree);
      }

      var outils = registre.commandes.concat(commandesPage).map(function (c) {
        return {
          name: c.nom,
          description: c.description,
          inputSchema: c.entree,
          annotations: { readOnlyHint: c.ecrit === 'rien', destructiveHint: false },
          execute: function (args) {
            var r = appeler(c.nom, args);
            return Promise.resolve(resultat(r.ok, r.ok ? r.sortie : r.erreur));
          }
        };
      });

      var mc = env.navigator && env.navigator.modelContext;
      var expose = false;
      if (mc && typeof mc.provideContext === 'function') { mc.provideContext({ tools: outils }); expose = true; }
      else if (mc && typeof mc.registerTool === 'function') { outils.forEach(function (o) { mc.registerTool(o); }); expose = true; }

      return { outils: outils, registre: registre, expose: expose, appeler: appeler, commandesPage: commandesPage };
    });
  }

  return { installer: installer };
}));
