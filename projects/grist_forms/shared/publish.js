/*
 * publish.js — Publish intra-doc du FormDef : bundle runtime (bridge + types + engine)
 * dans un document HTML autonome, puis matérialise ce bundle en options `customView`
 * pour une `_grist_Views_section` (pattern Artefactory : figé in-doc, zéro dépendance
 * GH Pages / builder au moment du fill).
 *
 * Fallback si le widget `custom-widget-builder` n'est pas déjà présent dans le doc :
 *   widgetId @berhalak/custom-widget-builder
 *   url      https://gristgouv.github.io/gristlabs-widgets/custom-widget-builder/index.html
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.Publish = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BUILDER_WIDGET_ID = '@berhalak/custom-widget-builder';
  var BUILDER_FALLBACK_URL = 'https://gristgouv.github.io/gristlabs-widgets/custom-widget-builder/index.html';

  function defaultBuilderDef() {
    return {
      widgetId: BUILDER_WIDGET_ID,
      name: 'Custom Widget Builder',
      url: BUILDER_FALLBACK_URL,
      accessLevel: 'full'
    };
  }

  // splitHtmlJs : extrait les <script>...</script> inline d'un document HTML complet
  // (même idée qu'Artefactory : le HTML va dans `_html`, le JS concaténé dans `_js`).
  // Les balises <script src="..."> (externes, ex: grist-plugin-api.js) restent en place
  // dans le HTML — seul le JS inline est déplacé.
  // sanitizeJsForScriptTag : évite qu'un `</script>` littéral dans le JS (commentaire)
  // ne ferme prématurément la balise script du custom-widget-builder.
  function sanitizeJsForScriptTag(js) {
    return String(js || '').replace(/<\/script/gi, '<\\/script');
  }

  function splitHtmlJs(fullHtml) {
    var js = [];
    var html = String(fullHtml || '').replace(
      /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi,
      function (match, body) {
        js.push(sanitizeJsForScriptTag(body));
        return '';
      }
    );
    return { html: html, js: js.join('\n') };
  }

  // CSS DSFR-like embarqué (pas de CDN) — chargé depuis le fichier voisin en Node,
  // sinon fourni via bundles.cssText (builder fetch) pour l'autonomie intra-doc.
  var DEFAULT_CSS = '';
  if (typeof require === 'function' && typeof module === 'object' && module.exports) {
    try {
      DEFAULT_CSS = require('fs').readFileSync(
        require('path').join(__dirname, 'dsfr-like.css'),
        'utf8'
      );
    } catch (e) { /* ignore */ }
  }

  // buildRuntimeDocument : document HTML autonome (CSS DSFR-like inliné + .fr-container)
  // qui embarque le FormDef figé (window.__FORM_DEF__) et concatène bridge + types + attachments + session-context + engine
  // + bootstrap (FormEngine.mount). Submit via GristBridge.addRow (ou applyUserActions).
  function buildRuntimeDocument(formDef, bundles) {
    bundles = bundles || {};
    var bridgeJs = bundles.bridgeJs || '';
    var typesJs = bundles.typesJs || '';
    var attachmentsJs = bundles.attachmentsJs || '';
    var sessionContextJs = bundles.sessionContextJs || '';
    // La carte ne pese rien tant qu'aucune question de lieu n'est posee :
    // le module ne charge MapLibre qu'au moment ou il monte une carte.
    var carteJs = bundles.carteJs || '';
    var engineJs = bundles.engineJs || '';
    var cssText = bundles.cssText || DEFAULT_CSS || '';
    var formDefJson = JSON.stringify(formDef || {});
    var title = (formDef && (formDef.title || formDef.id)) || 'Formulaire';

    var bootstrap = [
      bridgeJs,
      typesJs,
      attachmentsJs,
      sessionContextJs,
      carteJs,
      engineJs,
      '(function () {',
      '  window.__FORM_DEF__ = ' + formDefJson + ';',
      '  var editRowId = null;',
      '  function submit(data) {',
      '    var tableId = window.__FORM_DEF__.tableId;',
      '    if (editRowId != null && window.GristBridge && window.GristBridge.updateRow) {',
      '      return window.GristBridge.updateRow(tableId, editRowId, data);',
      '    }',
      '    if (window.GristBridge && window.GristBridge.addRow) {',
      '      return window.GristBridge.addRow(tableId, data);',
      '    }',
      '    return window.grist.docApi.applyUserActions([',
      "      ['BulkAddRecord', tableId, [null], Object.keys(data).reduce(function (c, k) {",
      '        c[k] = [data[k]]; return c;',
      '      }, {})]',
      '    ]);',
      '  }',
      '  function runRuntimeE2EUpload() {',
      '    try {',
      '      var def = window.__FORM_DEF__;',
      '      var att = null;',
      '      (def.sections || []).forEach(function (s) {',
      '        (s.fields || []).forEach(function (f) {',
      '          if (!att && (f.type === "Attachments" || f.widget === "file")) att = f;',
      '        });',
      '      });',
      '      if (!att) return Promise.resolve({ ok: false, error: "pas de champ Attachments" });',
      '      var file = new File(["preuve vue publiee " + new Date().toISOString()], "preuve-publiee.txt", { type: "text/plain" });',
      '      var values = { Nom: "E2E Publie", Email: "publie@test.local", Message: "upload depuis vue publiee" };',
      '      values[att.colId] = [file];',
      '      return window.FormAttachments.resolveAttachmentFields(def, values, {',
      '        getAccessToken: function (o) { return window.grist.docApi.getAccessToken(o); }',
      '      }).then(function () {',
      '        var data = window.FormEngine.collectSubmitData(def, values);',
      '        return submit(data).then(function () {',
      '          return { ok: true, written: data, tableId: def.tableId };',
      '        });',
      '      });',
      '    } catch (e) {',
      '      return Promise.resolve({ ok: false, error: (e && e.message) || String(e) });',
      '    }',
      '  }',
      '  window.addEventListener("message", function (ev) {',
      '    var d = ev && ev.data;',
      '    if (!d || d.type !== "grist-forms-runtime-e2e") return;',
      '    if (d.action !== "upload-file") return;',
      '    Promise.resolve(runRuntimeE2EUpload()).then(function (result) {',
      '      try { ev.source && ev.source.postMessage({ type: "grist-forms-runtime-e2e-result", result: result }, "*"); } catch (e2) {}',
      '      console.log("[runtime-e2e]", result);',
      '    });',
      '  });',
      '  function monter(valeurs) {',
      "    var cible = document.getElementById('app');",
      '    if (!cible) return;',
      '    window.FormEngine.mount(cible, window.__FORM_DEF__, {',
      '      submit: submit,',
      '      values: valeurs || {},',
      '      get editRowId() { return editRowId; },',
      '      getAccessToken: function (o) { return window.grist.docApi.getAccessToken(o); },',
      '      loadTable: window.GristBridge && window.GristBridge.loadTable',
      '        ? function (t) { return window.GristBridge.loadTable(t); } : null',
      '    });',
      '  }',
      '  function boot() {',
      '    try {',
      "      if (window.grist && window.grist.ready) { window.grist.ready({ requiredAccess: 'full' }); }",
      "      var mount = document.getElementById('app');",
      '      if (!window.FormEngine || !window.FormEngine.mount) {',
      "        if (mount) mount.textContent = 'Runtime indisponible (FormEngine non charge).';",
      '        return;',
      '      }',
      // Une vue « Remplir » AJOUTE une ligne. Elle ne corrige celle du curseur
      // que si le formulaire le demande, et alors elle l'affiche d'abord :
      // suivre le curseur en silence faisait écraser la ligne 1 par une
      // soumission que le bouton annonçait comme un envoi (mesuré le
      // 18/09/2026 en Grist réel).
      '      if (window.__FORM_DEF__.editerLigneSelectionnee && window.grist && window.grist.onRecord) {',
      '        var dernier = null;',
      '        window.grist.onRecord(function (rec) {',
      '          var id = rec && rec.id ? rec.id : null;',
      '          if (id === dernier) return;',
      '          dernier = id;',
      '          editRowId = id;',
      '          monter(id ? window.FormEngine.valuesFromRecord(window.__FORM_DEF__, rec) : {});',
      '        });',
      '        if (window.grist.onNewRecord) {',
      '          window.grist.onNewRecord(function () { dernier = null; editRowId = null; monter({}); });',
      '        }',
      '      }',
      '      monter({});',
      '    } catch (err) {',
      "      var mountErr = document.getElementById('app');",
      "      if (mountErr) mountErr.textContent = 'Erreur runtime : ' + ((err && err.message) || String(err));",
      '      console.error(err);',
      '    }',
      '  }',
      "  try { window.parent.postMessage({ type: 'grist-forms-runtime-ready', formId: window.__FORM_DEF__ && window.__FORM_DEF__.id }, '*'); } catch (eReady) {}",
      "  if (document.readyState === 'loading') {",
      "    document.addEventListener('DOMContentLoaded', boot);",
      '  } else { boot(); }',
      '})();'
    ].join('\n');

    return [
      '<!DOCTYPE html>',
      '<html lang="fr">',
      '<head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + title + '</title>',
      '<style>',
      cssText,
      '</style>',
      '<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>',
      '</head>',
      '<body>',
      '<div class="fr-container" id="app">Chargement…</div>',
      '<script>',
      bootstrap,
      '</script>',
      '</body>',
      '</html>'
    ].join('\n');
  }

  // buildCustomViewOptions : structure exacte Artefactory pour `options` de
  // `_grist_Views_section` — `customView` est une STRING JSON (pas un objet imbriqué).
  function buildCustomViewOptions(params) {
    params = params || {};
    var html = params.html || '';
    var js = params.js || '';
    var builderDef = params.builderDef || defaultBuilderDef();

    var outer = {
      verticalGridlines: true,
      horizontalGridlines: true,
      zebraStripes: false,
      numFrozen: 0,
      customView: JSON.stringify({
        mode: 'url',
        url: null,
        access: 'full',
        widgetDef: builderDef,
        widgetId: builderDef.widgetId,
        renderAfterReady: true,
        widgetOptions: { _html: html, _js: js },
        columnsMapping: null
      })
    };

    return JSON.stringify(outer);
  }

  // planCreateCustomPage : crée une nouvelle page/section custom liée à `tableRef`.
  // Le caller complète ensuite `options` (buildCustomViewOptions) via UpdateRecord sur
  // `_grist_Views_section` (id de la section renvoyé par la réponse de CreateViewSection).
  function planCreateCustomPage(tableRef, pageName) {
    return [
      ['CreateViewSection', tableRef, 0, 'custom', null, pageName || 'Remplir']
    ];
  }

  return {
    BUILDER_WIDGET_ID: BUILDER_WIDGET_ID,
    BUILDER_FALLBACK_URL: BUILDER_FALLBACK_URL,
    defaultBuilderDef: defaultBuilderDef,
    splitHtmlJs: splitHtmlJs,
    buildRuntimeDocument: buildRuntimeDocument,
    buildCustomViewOptions: buildCustomViewOptions,
    planCreateCustomPage: planCreateCustomPage
  };
}));
