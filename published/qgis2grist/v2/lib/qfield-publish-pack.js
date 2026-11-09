/**
 * Publication pack QField complet — pages Carte (URL), Terrain (URL), formulaires (in-doc).
 * Réutilise grist_forms/publish.js pour les FormDef.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Q2GPublishPack = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  let Publish;
  let FormulairesTable;
  if (typeof require === 'function') {
    try { Publish = require('../../grist_forms/shared/publish.js'); } catch (e) { /* browser */ }
    try { FormulairesTable = require('../../grist_forms/shared/formulaires-table.js'); } catch (e) { /* browser */ }
  }

  function asInt(v, fallback) {
    if (v == null || v === '') return fallback == null ? null : fallback;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : (fallback == null ? null : fallback);
  }

  function formulairesRowFromPublish(def, sectionRef, version) {
    const meta = {
      statut: 'publie',
      version: asInt(version, 0) + 1,
      publishedSectionRef: asInt(sectionRef, null),
      updatedAt: Math.floor(Date.now() / 1000),
    };
    if (FormulairesTable) return FormulairesTable.rowFromFormDef(def, meta);
    if (typeof Q2GTerrain !== 'undefined' && Q2GTerrain.rowFromFormDef) {
      return Q2GTerrain.rowFromFormDef(def, meta);
    }
    return {
      Nom: def.title || def.id,
      FormId: def.id,
      Titre: def.title || '',
      TableCible: def.tableId || '',
      Version: meta.version,
      Def: JSON.stringify(def),
      Statut: meta.statut,
      PublishedSectionRef: sectionRef,
      UpdatedAt: meta.updatedAt,
    };
  }

  const WIDGET_IDS = {
    map: 'qgis2grist-v2-map',
    terrain: 'qgis2grist-terrain',
  };

  function buildUrlCustomViewOptions(params) {
    params = params || {};
    const url = params.url || '';
    const widgetId = params.widgetId || 'custom-widget';
    const widgetDef = {
      widgetId,
      name: params.name || widgetId,
      url,
      accessLevel: params.access || 'full',
    };
    const outer = {
      verticalGridlines: true,
      horizontalGridlines: true,
      zebraStripes: false,
      numFrozen: 0,
      customView: JSON.stringify({
        mode: 'url',
        url,
        access: params.access || 'full',
        widgetDef,
        widgetId,
        renderAfterReady: true,
        widgetOptions: null,
        columnsMapping: null,
      }),
    };
    return JSON.stringify(outer);
  }

  function resolveWidgetBaseUrl(href) {
    try {
      const u = new URL(href || '');
      const path = u.pathname.replace(/\/[^/]*$/, '/');
      return u.origin + path;
    } catch (e) {
      return '';
    }
  }

  function resolveGristFormsBaseUrl(widgetBaseUrl) {
    const base = String(widgetBaseUrl || '').replace(/\/?$/, '/');
    // Widget publie : .../qgis2grist/ (v1) ou .../qgis2grist/v2/ (v2) ; Form Builder est un dossier frere de qgis2grist.
    if (/\/qgis2grist\/(v2\/)?$/i.test(base)) {
      return base.replace(/qgis2grist\/(v2\/)?$/i, 'grist_forms/');
    }
    return base.replace(/\/?$/, '/') + '../grist_forms/';
  }

  function buildPackPlan(terrainPack, config) {
    terrainPack = terrainPack || {};
    config = config || {};
    const title = config.meta?.title || config.meta?.source_file || 'Projet QGIS';
    const primary = terrainPack.primaryTableId || terrainPack.forms?.[0]?.tableId || null;
    return {
      map: {
        pageName: `Carte — ${title}`,
        tableId: primary,
        widgetId: WIDGET_IDS.map,
        urlKey: 'map',
      },
      terrain: {
        pageName: `Terrain — ${title}`,
        tableId: primary,
        widgetId: WIDGET_IDS.terrain,
        urlKey: 'terrain',
      },
      forms: (terrainPack.forms || []).map(item => ({
        formDef: item.formDef,
        tableId: item.tableId,
        pageName: item.formDef?.title || item.displayName || item.tableId,
      })),
    };
  }

  function indexTableRefs(tableData) {
    const out = {};
    const ids = tableData?.id || [];
    const names = tableData?.tableId || [];
    for (let i = 0; i < ids.length; i++) {
      if (names[i]) out[names[i]] = asInt(ids[i], null);
    }
    return out;
  }

  function indexFormulairesByFormId(tableData) {
    const out = {};
    const ids = tableData?.id || [];
    const formIds = tableData?.FormId || [];
    const sectionRefs = tableData?.PublishedSectionRef || [];
    const versions = tableData?.Version || [];
    for (let i = 0; i < ids.length; i++) {
      if (!formIds[i]) continue;
      out[formIds[i]] = {
        rowId: asInt(ids[i], null),
        publishedSectionRef: sectionRefs[i] != null ? asInt(sectionRefs[i], null) : null,
        version: asInt(versions[i], 0),
      };
    }
    return out;
  }

  function extractCreateViewSectionRefs(result) {
    if (result == null) return { sectionRef: null, viewRef: null };

    function fromVal(rv) {
      if (rv == null) return { sectionRef: null, viewRef: null };
      if (typeof rv === 'object' && !Array.isArray(rv)) {
        const sectionRef = (typeof rv.sectionRef === 'number') ? rv.sectionRef
          : (typeof rv.viewSectionRef === 'number') ? rv.viewSectionRef
            : (typeof rv.id === 'number') ? rv.id : null;
        const viewRef = (typeof rv.viewRef === 'number') ? rv.viewRef : null;
        if (sectionRef != null || viewRef != null) return { sectionRef, viewRef };
        if (Array.isArray(rv.viewSections) && rv.viewSections.length) {
          return fromVal(rv.viewSections[0]);
        }
      }
      return { sectionRef: null, viewRef: null };
    }

    let found = fromVal(result);
    if (found.sectionRef != null || found.viewRef != null) return found;

    if (typeof result === 'number' && !Number.isNaN(result)) {
      return { sectionRef: result, viewRef: null };
    }
    if (typeof result === 'string' && /^\d+$/.test(result)) {
      return { sectionRef: Number(result), viewRef: null };
    }

    if (result.retValues != null) {
      const list = Array.isArray(result.retValues) ? result.retValues : [result.retValues];
      for (let i = 0; i < list.length; i++) {
        found = fromVal(list[i]);
        if (found.sectionRef != null || found.viewRef != null) return found;
        if (Array.isArray(list[i])) {
          for (let j = 0; j < list[i].length; j++) {
            found = fromVal(list[i][j]);
            if (found.sectionRef != null || found.viewRef != null) return found;
          }
        }
      }
    }

    function deepFind(obj, depth) {
      if (!obj || typeof obj !== 'object' || depth > 8) return { sectionRef: null, viewRef: null };
      const sectionRef = (typeof obj.sectionRef === 'number') ? obj.sectionRef
        : (typeof obj.viewSectionRef === 'number') ? obj.viewSectionRef : null;
      const viewRef = (typeof obj.viewRef === 'number') ? obj.viewRef : null;
      if (sectionRef != null || viewRef != null) return { sectionRef, viewRef };
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          const n = deepFind(obj[i], depth + 1);
          if (n.sectionRef != null || n.viewRef != null) return n;
        }
        return { sectionRef: null, viewRef: null };
      }
      const keys = Object.keys(obj);
      for (let k = 0; k < keys.length; k++) {
        const key = keys[k];
        const v = obj[key];
        if (typeof v === 'number' && /sectionRef/i.test(key)) {
          return { sectionRef: v, viewRef: null };
        }
        if (typeof v === 'number' && /viewRef/i.test(key)) {
          return { sectionRef: null, viewRef: v };
        }
        const nested = deepFind(v, depth + 1);
        if (nested.sectionRef != null || nested.viewRef != null) return nested;
      }
      return { sectionRef: null, viewRef: null };
    }

    return deepFind(result, 0);
  }

  /** @deprecated utiliser extractCreateViewSectionRefs */
  function extractSectionRef(result) {
    return extractCreateViewSectionRefs(result).sectionRef;
  }

  async function renameView(grist, viewRef, pageName) {
    const vid = asInt(viewRef, null);
    if (vid == null || !pageName) return;
    await applyActions(grist, [
      ['UpdateRecord', '_grist_Views', vid, { name: pageName }],
    ]);
  }

  const BULK_OPS = { BulkAddRecord: 1, BulkUpdateRecord: 1, BulkAddOrReplaceRecord: 1 };

  /** Grist Bulk*Record exige { col: [valeurs] }, pas des scalaires. */
  function normalizeUserActions(actions) {
    if (!Array.isArray(actions)) return actions;
    return actions.map((a) => {
      if (!Array.isArray(a) || a.length < 4 || !BULK_OPS[a[0]]) return a;
      const cols = a[3];
      if (!cols || typeof cols !== 'object' || Array.isArray(cols)) return a;
      const rowIds = a[2];
      let n = Array.isArray(rowIds) ? rowIds.length : 1;
      Object.keys(cols).forEach((k) => {
        if (Array.isArray(cols[k])) n = Math.max(n, cols[k].length);
      });
      if (n < 1) n = 1;
      const newRowIds = Array.isArray(rowIds) ? rowIds.slice() : [rowIds];
      while (newRowIds.length < n) newRowIds.push(null);
      const newCols = {};
      Object.keys(cols).forEach((k) => {
        const v = cols[k];
        if (Array.isArray(v)) {
          const arr = v.slice();
          while (arr.length < n) arr.push(arr.length ? arr[arr.length - 1] : null);
          newCols[k] = arr;
        } else {
          newCols[k] = Array(n).fill(v);
        }
      });
      return [a[0], a[1], newRowIds, newCols];
    });
  }

  async function applyActions(grist, actions) {
    const api = grist?.docApi;
    if (!api?.applyUserActions) throw new Error('API Grist indisponible');
    return api.applyUserActions(normalizeUserActions(actions));
  }

  async function loadTableRefs(grist) {
    const data = await grist.docApi.fetchTable('_grist_Tables');
    return indexTableRefs(data);
  }

  /** IDs de lignes existantes (null = table inaccessible). */
  async function loadRowIdSet(grist, tableName) {
    try {
      const data = await grist.docApi.fetchTable(tableName);
      const ids = data?.id || [];
      const out = new Set();
      for (let i = 0; i < ids.length; i++) {
        const id = asInt(ids[i], null);
        if (id != null) out.add(id);
      }
      return out;
    } catch (e) {
      return null;
    }
  }

  function resolveExistingRef(ref, idSet) {
    const id = asInt(ref, null);
    if (id == null) return null;
    if (idSet && !idSet.has(id)) return null;
    return id;
  }

  function requireTableRef(tableRefs, tableId) {
    const ref = asInt(tableRefs[tableId], null);
    if (ref == null) throw new Error('Table introuvable : ' + tableId);
    return ref;
  }

  async function upsertUrlPage(grist, opts) {
    const tableRef = requireTableRef(opts.tableRefs, opts.tableId);
    const optionsStr = buildUrlCustomViewOptions({
      url: opts.url,
      widgetId: opts.widgetId,
      name: opts.pageName,
    });
    let sectionRef = resolveExistingRef(opts.sectionRef, opts.validSectionIds);
    let viewRef = resolveExistingRef(opts.viewRef, opts.validViewIds);
    if (sectionRef != null) {
      await applyActions(grist, [
        ['UpdateRecord', '_grist_Views_section', sectionRef, {
          options: optionsStr,
          title: opts.pageName,
        }],
      ]);
      if (viewRef != null) await renameView(grist, viewRef, opts.pageName);
      return sectionRef;
    }
    // CreateViewSection(tableRef, viewRef, type, groupby, tableId) — le 5e arg n'est PAS le titre.
    // viewRef=0 crée une page « New page » ; on renomme ensuite _grist_Views.name.
    const createRes = await applyActions(grist, [
      ['CreateViewSection', tableRef, 0, 'custom', null, null],
    ]);
    const refs = extractCreateViewSectionRefs(createRes);
    sectionRef = asInt(refs.sectionRef, null);
    viewRef = asInt(refs.viewRef, null);
    if (sectionRef == null) throw new Error('Section non créée : ' + opts.pageName);
    if (viewRef != null) await renameView(grist, viewRef, opts.pageName);
    await applyActions(grist, [
      ['UpdateRecord', '_grist_Views_section', sectionRef, {
        options: optionsStr,
        title: opts.pageName,
      }],
    ]);
    return sectionRef;
  }

  async function loadFormBundles(fetchScript) {
    if (!fetchScript) throw new Error('fetchScript requis pour publier les formulaires');
    const pub = Publish || (typeof globalThis !== 'undefined' && globalThis.Publish);
    if (!pub) throw new Error('Publish (grist_forms) indisponible');
    const [bridgeJs, typesJs, attachmentsJs, sessionContextJs, engineJs, cssText] = await Promise.all([
      fetchScript('shared/grist-bridge.js'),
      fetchScript('shared/types.js'),
      fetchScript('shared/attachments.js'),
      fetchScript('shared/session-context.js'),
      fetchScript('runtime/engine.js'),
      fetchScript('shared/dsfr-like.css'),
    ]);
    return { pub, bridgeJs, typesJs, attachmentsJs, sessionContextJs, engineJs, cssText };
  }

  async function upsertFormPage(grist, opts) {
    const { pub, bridgeJs, typesJs, attachmentsJs, sessionContextJs, engineJs, cssText } = opts.bundles;
    const def = opts.formDef;
    const tableRef = requireTableRef(opts.tableRefs, opts.tableId);
    const fullHtml = pub.buildRuntimeDocument(def, {
      bridgeJs, typesJs, attachmentsJs, sessionContextJs, engineJs, cssText,
    });
    const { html, js } = pub.splitHtmlJs(fullHtml);
    const optionsStr = pub.buildCustomViewOptions({ html, js });
    let sectionRef = resolveExistingRef(opts.sectionRef, opts.validSectionIds);
    if (sectionRef != null) {
      await applyActions(grist, [
        ['UpdateRecord', '_grist_Views_section', sectionRef, { options: optionsStr }],
      ]);
    } else {
      const createRes = await applyActions(grist, [
        ['CreateViewSection', tableRef, 0, 'custom', null, null],
      ]);
      const refs = extractCreateViewSectionRefs(createRes);
      sectionRef = asInt(refs.sectionRef, null);
      if (sectionRef == null) throw new Error('Section formulaire non créée : ' + opts.pageName);
      const viewRef = asInt(refs.viewRef, null);
      if (viewRef != null) await renameView(grist, viewRef, opts.pageName);
      await applyActions(grist, [
        ['UpdateRecord', '_grist_Views_section', sectionRef, {
          options: optionsStr,
          title: opts.pageName,
        }],
      ]);
    }
    const nextVersion = asInt(opts.version, 0) + 1;
    let formulairesRowId = resolveExistingRef(opts.formulairesRowId, opts.validFormulairesIds);
    if (formulairesRowId != null) {
      await applyActions(grist, [[
        'UpdateRecord', 'Formulaires', formulairesRowId, {
          Version: nextVersion,
          Statut: 'publie',
          PublishedSectionRef: sectionRef,
          UpdatedAt: Math.floor(Date.now() / 1000),
          Def: JSON.stringify(def),
          Titre: def.title || '',
          Nom: def.title || def.id || '',
          TableCible: def.tableId || '',
        },
      ]]);
    } else if (def?.id) {
      await applyActions(grist, [[
        'BulkAddRecord', 'Formulaires', [null],
        formulairesRowFromPublish(def, sectionRef, opts.version || 0),
      ]]);
    }
    return sectionRef;
  }

  /**
   * @param {object} grist — instance grist ready
   * @param {object} opts
   * @param {object} opts.terrainPack — buildTerrainPack()
   * @param {object} [opts.config] — QgisWidgets config (meta, published refs)
   * @param {string} [opts.widgetBaseUrl] — base URL widgets qgis2grist
   * @param {function} [opts.fetchScript] — (relPath) => Promise<string>
   * @param {function} [opts.log] — journal
   */
  async function publishQfieldPack(grist, opts) {
    opts = opts || {};
    const log = opts.log || (() => {});
    const terrainPack = opts.terrainPack;
    if (!terrainPack?.forms?.length) {
      throw new Error('Aucun formulaire terrain — importez un projet QField d’abord');
    }

    const widgetBase = (opts.widgetBaseUrl || resolveWidgetBaseUrl(
      typeof location !== 'undefined' ? location.href : ''
    )).replace(/\/?$/, '/');

    const urls = {
      map: widgetBase + 'index_v2.html',
      terrain: widgetBase + 'terrain.html',
    };

    const config = opts.config || {};
    const published = { ...(config.published || {}) };
    const plan = buildPackPlan(terrainPack, config);
    const tableRefs = await loadTableRefs(grist);
    const validSectionIds = await loadRowIdSet(grist, '_grist_Views_section');
    const validViewIds = await loadRowIdSet(grist, '_grist_Views');

    if (!plan.map.tableId) {
      throw new Error('Table principale introuvable pour la page Carte');
    }

    await ensureFormulairesTable(grist);

    let formulairesIndex = {};
    let validFormulairesIds = null;
    try {
      const fData = await grist.docApi.fetchTable('Formulaires');
      formulairesIndex = indexFormulairesByFormId(fData);
      validFormulairesIds = new Set();
      for (const id of (fData?.id || [])) {
        const n = asInt(id, null);
        if (n != null) validFormulairesIds.add(n);
      }
    } catch (e) { /* table absente */ }

    const refCtx = { validSectionIds, validViewIds, validFormulairesIds };

    const bundles = opts.fetchScript ? await loadFormBundles(opts.fetchScript) : null;
    const result = { map: null, terrain: null, forms: {}, published };

    log('Publication page Carte…');
    result.map = await upsertUrlPage(grist, {
      ...refCtx,
      tableRefs,
      tableId: plan.map.tableId,
      pageName: plan.map.pageName,
      url: urls.map,
      widgetId: plan.map.widgetId,
      sectionRef: published.mapSectionRef,
    });
    published.mapSectionRef = result.map;

    log('Publication page Terrain…');
    result.terrain = await upsertUrlPage(grist, {
      ...refCtx,
      tableRefs,
      tableId: plan.terrain.tableId,
      pageName: plan.terrain.pageName,
      url: urls.terrain,
      widgetId: plan.terrain.widgetId,
      sectionRef: published.terrainSectionRef,
    });
    published.terrainSectionRef = result.terrain;

    published.formSectionRefs = published.formSectionRefs || {};

    for (const item of plan.forms) {
      if (!bundles) {
        log('Formulaires ignorés (bundles indisponibles) : ' + item.pageName);
        continue;
      }
      const formId = item.formDef?.id;
      const fRow = formId ? formulairesIndex[formId] : null;
      log('Publication formulaire « ' + item.pageName + ' »…');
      const sectionRef = await upsertFormPage(grist, {
        ...refCtx,
        tableRefs,
        tableId: item.tableId,
        pageName: item.pageName,
        formDef: item.formDef,
        bundles,
        formulairesRowId: fRow?.rowId ?? null,
        version: fRow?.version ?? 0,
        sectionRef: fRow?.publishedSectionRef
          ?? published.formSectionRefs?.[formId]
          ?? null,
      });
      if (formId) {
        published.formSectionRefs[formId] = sectionRef;
        result.forms[formId] = sectionRef;
      }
    }

    result.published = published;
    log('Pack QField publié (' + (1 + 1 + Object.keys(result.forms).length) + ' pages).');
    return result;
  }

  async function ensureFormulairesTable(grist) {
    if (typeof Q2GTerrain !== 'undefined' && Q2GTerrain.ensureFormulairesTable) {
      await Q2GTerrain.ensureFormulairesTable(grist);
      return;
    }
    const tables = await grist.docApi.listTables();
    if (tables.includes('Formulaires')) return;
    if (typeof require !== 'function') {
      throw new Error('Table Formulaires absente — importez d’abord un projet QField');
    }
    const FormulairesTable = require('../../grist_forms/shared/formulaires-table.js');
    await applyActions(grist, FormulairesTable.planCreateFormulairesTable());
  }

  return {
    WIDGET_IDS,
    buildUrlCustomViewOptions,
    resolveWidgetBaseUrl,
    resolveGristFormsBaseUrl,
    buildPackPlan,
    loadRowIdSet,
    resolveExistingRef,
    indexTableRefs,
    indexFormulairesByFormId,
    extractSectionRef,
    extractCreateViewSectionRefs,
    renameView,
    publishQfieldPack,
    upsertUrlPage,
    upsertFormPage,
    normalizeUserActions,
  };
});
