/**
 * ControlDeclarative[] depuis couche importée + meta BigQgisMCP.
 * Aligné Atlas v7 / Scene Manifest V0.2 (extension controls).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Q2GControls = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function resolveFieldName(fields, fieldRef) {
    if (!fieldRef) return fieldRef;
    const q = String(fieldRef);
    const ql = q.toLowerCase();
    const list = fields || [];
    const hit = list.find((f) =>
      f.name === q || f._rawKey === q || f.label === q
      || (f.name && f.name.toLowerCase() === ql)
    );
    return hit?.name || fieldRef;
  }

  function fieldLabel(fields, name) {
    const f = (fields || []).find((x) => x.name === name);
    return f?.label || name;
  }

  function numericBoundsFromStops(stops) {
    let min = Infinity;
    let max = -Infinity;
    for (const s of (stops || [])) {
      if (s.lower != null && Number.isFinite(+s.lower)) min = Math.min(min, +s.lower);
      if (s.upper != null && Number.isFinite(+s.upper)) max = Math.max(max, +s.upper);
    }
    if (!Number.isFinite(min)) return null;
    if (min === max) max = min + 1;
    return { min, max };
  }

  /** Gradué QGIS / declarative → control range. */
  function rangeFromGraduated(declarative, layer) {
    if (!declarative || declarative.kind !== 'graduated' || !declarative.field) return null;
    let bounds = numericBoundsFromStops(declarative.stops);
    if (!bounds && layer.style?.categories?.length) {
      bounds = numericBoundsFromStops(layer.style.categories);
    }
    if (!bounds) return null;
    const field = resolveFieldName(layer.fields, declarative.field);
    return {
      field,
      type: 'range',
      label: fieldLabel(layer.fields, field),
      min: bounds.min,
      max: bounds.max,
      dataMin: bounds.min,
      dataMax: bounds.max,
      active: false,
    };
  }

  /** Catégorisé → control select. */
  function selectFromCategorized(declarative, layer) {
    // Un style gradue donne deja une plage sur ce champ : pas de liste de selection en doublon.
    if (declarative && declarative.kind === 'graduated') return null;
    let styleField = declarative?.field || null;
    let valueSources = declarative?.stops || [];

    if ((!styleField || !valueSources.length) && layer.style?.type === 'categorizedSymbol') {
      styleField = layer.style.field || styleField;
      valueSources = (layer.style.categories || []).map(c => ({
        value: c.value,
        label: c.label,
      }));
    }

    if (!styleField) return null;
    const field = resolveFieldName(layer.fields, styleField);
    const values = valueSources
      .map((s) => (s.value != null && s.value !== '' ? s.value : s.label))
      .filter((v) => v != null && v !== '');
    if (!values.length) return null;
    return {
      field,
      type: 'select',
      label: fieldLabel(layer.fields, field),
      values: [...new Set(values.map(String))],
      active: false,
    };
  }

  /** Premier champ date/datetime du schéma couche. */
  function timeFromFields(layer) {
    const f = (layer.fields || []).find((x) => x.gType === 'Date' || x.gType === 'DateTime');
    if (!f) return null;
    return {
      field: f.name,
      type: 'time',
      label: f.label || f.name,
      active: false,
    };
  }

  function hasBigQgisInteractive(meta) {
    if (!meta) return false;
    if (meta.interactiveMap === 'flood' || meta.interactiveMap === 'temporal') return true;
    const inf = meta.inferredStyles;
    if (inf && (inf.floodStyle || inf.buildingStyle)) return true;
    return !!(meta.sliderMax != null && meta.sliderMax !== meta.sliderMin);
  }

  /** BigQgisMCP slider → control simulation (sémantique distincte du filtre range). */
  function bigQgisControls(layer, meta, tableName) {
    if (!hasBigQgisInteractive(meta)) return [];

    const sliderMin = meta.sliderMin ?? 0;
    const sliderMax = meta.sliderMax ?? (sliderMin + 1);
    const label = meta.sliderTitle || 'Niveau simulé';
    const out = [];

    if (meta.interactiveMap === 'temporal') {
      const t = timeFromFields(layer);
      if (t) out.push({ ...t, label: meta.sliderTitle || t.label, active: false });
      return out;
    }

    const inf = meta.inferredStyles || {};
    const isPoint = String(layer.geomType || '').toLowerCase() === 'point';
    const dname = String(layer.displayName || tableName || '').toLowerCase();
    const isBuilding = /build|bati|logement|struct|hab/.test(dname);

    let field = null;
    if (!isPoint && inf.floodStyle) {
      field = resolveFieldName(layer.fields, 'ht_min') || 'ht_min';
    } else if (isPoint && (inf.buildingStyle || isBuilding)) {
      field = resolveFieldName(layer.fields, inf.buildingStyle?.field || 'max_water_height');
    } else if (inf.floodStyle) {
      field = resolveFieldName(layer.fields, inf.floodStyle.field || 'ht_max');
    }

    if (field) {
      out.push({
        field,
        type: 'range',
        mode: 'simulation',
        label,
        min: sliderMin,
        max: sliderMax,
        dataMin: sliderMin,
        dataMax: sliderMax,
        active: false,
      });
    }
    return out;
  }

  /** Widget Range QGIS (champ sans renderer gradué) → control range. */
  function rangeFromFieldWidgets(layer) {
    const out = [];
    for (const f of layer.fields || []) {
      let min = f._rangeMin;
      let max = f._rangeMax;
      if (min == null || max == null) {
        try {
          const o = typeof f.widgetOptions === 'string' ? JSON.parse(f.widgetOptions) : f.widgetOptions;
          if (o?.Min != null) min = +o.Min;
          if (o?.Max != null) max = +o.Max;
        } catch (_) { /* ignore */ }
      }
      if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max)) continue;
      if (min === max) max = min + 1;
      const field = resolveFieldName(layer.fields, f.name) || f.name;
      out.push({
        field,
        type: 'range',
        label: fieldLabel(layer.fields, field),
        min,
        max,
        dataMin: min,
        dataMax: max,
        active: false,
      });
    }
    return out;
  }

  /**
   * Déduit les ControlDeclarative pour une couche importée.
   * @param {object} layer
   * @param {object|null} meta
   * @param {string} tableName
   * @param {object|null} declarative - StyleDeclarative déjà calculé
   */
  function inferLayerControls(layer, meta, tableName, declarative) {
    const out = [];
    const seen = new Set();

    function add(c) {
      if (!c || !c.field || !c.type) return;
      const key = `${c.field}:${c.type}:${c.mode || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(c);
    }

    add(rangeFromGraduated(declarative, layer));
    add(selectFromCategorized(declarative, layer));
    rangeFromFieldWidgets(layer).forEach(add);

    const bq = bigQgisControls(layer, meta, tableName);
    if (bq.length) {
      bq.forEach(add);
    } else {
      add(timeFromFields(layer));
    }

    return out;
  }

  /**
   * Restauration : la config sauvegardee (QgisWidgets) ne garde pas les bornes `_rangeMin`/`_rangeMax`
   * des champs a widget Range QGIS ; les controles de plage du manifeste sauvegarde les portent encore.
   * Les remet sur les champs (sans ecraser une borne deja connue) pour que les controles deduits a la
   * restauration soient les memes qu'a l'import. Modifie `fields` en place et le rend.
   * @param {object[]} fields
   * @param {object[]} controls  controles du manifeste sauvegarde pour la couche
   */
  function hydrateRangeBounds(fields, controls) {
    const list = fields || [];
    for (const c of (controls || [])) {
      if (!c || c.type !== 'range' || c.mode || c.min == null || c.max == null) continue;
      const f = list.find((x) => x.name === c.field);
      if (!f || f._rangeMin != null || f._rangeMax != null) continue;
      f._rangeMin = +c.min;
      f._rangeMax = +c.max;
    }
    return list;
  }

  return {
    resolveFieldName,
    hydrateRangeBounds,
    inferLayerControls,
    rangeFromGraduated,
    selectFromCategorized,
    rangeFromFieldWidgets,
    bigQgisControls,
  };
});
