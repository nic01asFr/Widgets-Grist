/**
 * Contrôles couche — filtres / animation (temps, range, catégorie).
 * ControlDeclarative — interop Scene Manifest V0.2 / interactive_map.
 */
import {
  normalizePropertyValue,
  parsePropertyNumber,
  resolveFeaturePropertyKey,
  resolveGristFieldName,
} from './declarative-style.js?v=1.6.2';

export function layerFieldNames(layer) {
  if (layer._fields?.length) {
    return layer._fields.map((f) => f.name).filter(Boolean);
  }
  const p = layer.geojson?.features?.[0]?.properties || {};
  return Object.keys(p).filter((k) => !k.startsWith('_') && k !== 'geometry_json');
}

export function controlFieldType(layer, field) {
  const propKey = resolveFeaturePropertyKey(layer, field);
  const vals = [];
  for (const f of (layer.geojson?.features || [])) {
    const v = f.properties?.[propKey];
    if (v == null || v === '') continue;
    vals.push(normalizePropertyValue(v));
    if (vals.length >= 50) break;
  }
  if (!vals.length) return null;
  const dateRe = /^\d{4}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/;
  if (vals.every((v) => dateRe.test(String(v).trim()) && !Number.isNaN(Date.parse(v)))) return 'time';
  if (vals.every((v) => v !== '' && !Number.isNaN(Number(v)))) return 'range';
  if (new Set(vals.map(String)).size <= 20) return 'select';
  return null;
}

/**
 * Ce que le manifeste déclare pour un champ, quand Atlas ne détient pas les
 * entités qui le renseignent.
 *
 * Le contrat 0.2.2 porte `values[]` sur un contrôle `select` — reçu ici sous
 * `options`. C'est exactement l'information qu'on dérivait des entités ; elle
 * était simplement disponible plus tôt, et personne ne la lisait quand la
 * dérivation était possible.
 */
export function optionsDeclarees(layer, field) {
  const c = (layer?.controls || []).find((x) => x.field === field);
  const v = c?.options;
  return Array.isArray(v) && v.length ? v : null;
}

export function controlUniqueValues(layer, field, max = 40) {
  const propKey = resolveFeaturePropertyKey(layer, field);
  const counts = new Map();
  for (const f of (layer.geojson?.features || [])) {
    const key = normalizePropertyValue(f.properties?.[propKey]);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (counts.size) {
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, max);
  }
  // Aucune entité ici : sur une couche distante, ce n'est pas « aucune valeur »
  // mais « pas de quoi compter ». Rendre une liste vide priverait le contrôle
  // de ses choix et le rendrait décoratif — une case à cocher sans rien à
  // cocher ressemble à un filtre déjà appliqué.
  const declarees = optionsDeclarees(layer, field);
  if (!declarees) return [];
  // `count: null` et non zéro : on ne sait pas combien d'entités portent cette
  // valeur, et zéro laisserait croire qu'il n'y en a aucune.
  return declarees.slice(0, max).map((value) => ({ value, count: null }));
}

/**
 * Les classes que le style déclaratif nomme, quand on ne peut pas les compter.
 *
 * Une symbologie catégorisée **porte la liste de ses classes** : ce sont ses
 * `stops`. Sur une couche dont Atlas ne détient pas les entités, c'est la seule
 * source qui reste — et elle est exacte, puisque c'est elle qui peint la carte.
 * Les `controls[].options` complètent, pour les couches stylées autrement.
 */
function classesDeclarees(layer, field) {
  const d = layer?._declarative;
  if (d?.kind === 'categorized' && d.field === field && Array.isArray(d.stops)) {
    const vals = d.stops.map((s) => s?.value).filter((v) => v != null && v !== '');
    if (vals.length) return vals;
  }
  return optionsDeclarees(layer, field);
}

/**
 * Valeurs distinctes sur les features actuellement visibles (filtres appliqués).
 *
 * Le repli sur les classes déclarées ne vaut **que** pour une couche qui ne
 * détient pas ses entités. La distinction est celle qui compte : une couche
 * locale dont le filtre ne laisse rien doit rendre une liste vide — c'est un
 * renseignement juste, et le masquer ferait passer un filtre trop strict pour
 * une légende normale. Une couche distante, elle, n'a rien à compter : lui
 * faire dire « aucune valeur » serait affirmer une absence qu'on n'a pas
 * constatée.
 */
export function filteredUniqueValues(layer, field, max = 40) {
  const gj = filteredGeoJSON(layer);
  const propKey = resolveFeaturePropertyKey(layer, field);
  const counts = new Map();
  for (const f of (gj?.features || [])) {
    const key = normalizePropertyValue(f.properties?.[propKey]);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (!counts.size && !Array.isArray(layer?.geojson?.features)) {
    const declarees = classesDeclarees(layer, field);
    // `count: null` et non zéro : on ignore combien d'entités portent cette
    // classe, et zéro se lirait comme « aucune », ce qu'on n'a pas vérifié.
    if (declarees) return declarees.slice(0, max).map((value) => ({ value, count: null }));
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

export function controlBounds(layer, type, field) {
  if (type === 'select') {
    return { values: controlUniqueValues(layer, field, 40).map((v) => v.value) };
  }
  const propKey = resolveFeaturePropertyKey(layer, field);
  let lo = Infinity;
  let hi = -Infinity;
  for (const f of (layer.geojson?.features || [])) {
    const raw = f.properties?.[propKey];
    if (raw == null || raw === '') continue;
    const s = normalizePropertyValue(raw);
    const n = type === 'time' ? Date.parse(s) : Number(s);
    if (!Number.isNaN(n)) { lo = Math.min(lo, n); hi = Math.max(hi, n); }
  }
  if (lo === Infinity) {
    // Rien à mesurer ici. Le manifeste, lui, sait peut-être : `dataMin`/`dataMax`
    // sont les bornes observées à la production, `min`/`max` celles du curseur.
    const c = (layer?.controls || []).find((x) => x.field === field);
    const dmin = Number.isFinite(c?.dataMin) ? c.dataMin : c?.min;
    const dmax = Number.isFinite(c?.dataMax) ? c.dataMax : c?.max;
    if (Number.isFinite(dmin) && Number.isFinite(dmax) && dmax > dmin) {
      return { dataMin: dmin, dataMax: dmax,
               min: Number.isFinite(c?.min) ? c.min : dmin,
               max: Number.isFinite(c?.max) ? c.max : dmax };
    }
    // Ni mesure ni déclaration. 0–1 est un intervalle *plausible* : un curseur
    // de hauteur irait de 0 à 1 m sans que rien ne signale l'ignorance. Le
    // drapeau permet à l'interface de le dire plutôt que de le montrer.
    return { dataMin: 0, dataMax: 1, min: 0, max: 1, _bornesInconnues: true };
  }
  return { dataMin: lo, dataMax: hi, min: lo, max: hi };
}

/** Ensemble des valeurs cochées (minuscules) pour un select. */
export function selectValuesLowerSet(c) {
  return new Set((c.values || []).map((v) => String(v).toLowerCase()));
}

/** Case cochée dans l'UI ? */
export function isSelectValueChecked(c, value) {
  if (!Array.isArray(c.values)) {
    return true;
  }
  if (!c.values.length) return false;
  return selectValuesLowerSet(c).has(String(value).toLowerCase());
}

/**
 * Valeurs sélectionnées normalisées sur les labels réels des features (capture récit).
 */
export function captureSelectControlValues(layer, c) {
  if (!Array.isArray(c.values) || !c.values.length) return [];
  const allowed = selectValuesLowerSet(c);
  return controlUniqueValues(layer, c.field, 40)
    .filter((v) => allowed.has(String(v.value).toLowerCase()))
    .map((v) => v.value);
}

/**
 * Restaure une sélection sauvegardée (accepte labels Grist ou values manifest).
 */
export function normalizeSelectValuesForLayer(layer, field, savedValues) {
  if (!Array.isArray(savedValues) || !savedValues.length) return [];
  const allowed = new Set(savedValues.map((v) => String(v).toLowerCase()));
  return controlUniqueValues(layer, field, 40)
    .filter((v) => allowed.has(String(v.value).toLowerCase()))
    .map((v) => v.value);
}

/** Répare select pollué par import manifest (options confondues avec sélection). */
export function repairSelectControlFromManifest(layer, c) {
  if (c.type !== 'select' || c._selectionTouched || !c.options?.length) return;
  if (!Array.isArray(c.values) || !c.values.length) return;
  const opt = new Set(c.options.map((v) => String(v).toLowerCase()));
  const allOptsSelected = c.values.length === c.options.length
    && c.values.every((v) => opt.has(String(v).toLowerCase()));
  if (allOptsSelected) {
    delete c.values;
  }
}

export function buildControlPredicate(layer) {
  const ctrls = (layer.controls || []).filter((c) => c.active);
  if (!ctrls.length) return null;
  return (f) => {
    const p = f.properties || {};
    for (const c of ctrls) {
      const propKey = resolveFeaturePropertyKey(layer, c.field);
      const raw = p[propKey];
      if (c.type === 'select') {
        const key = normalizePropertyValue(raw);
        const variant = c.variant || 'select_multi';
        if (!c.active) continue;
        if (!c._selectionTouched && !Array.isArray(c.values)) continue;
        if (Array.isArray(c.values) && !c.values.length) return false;
        if (!Array.isArray(c.values)) continue;
        if (variant === 'select_single' && c.values.length > 1) {
          c.values = [c.values[0]];
        }
        if (!selectValuesLowerSet(c).has(String(key).toLowerCase())) return false;
      } else {
        // `requireValue` : une entité dépourvue de la donnée filtrée est écartée
        // au lieu d'être laissée passer. Indispensable quand l'attribut n'est
        // renseigné que sur une partie des objets — sinon les entités muettes
        // dominent la carte thématique. Absent par défaut : les filtres
        // existants gardent leur tolérance.
        if (raw == null || raw === '') {
          if (c.requireValue) return false;
          continue;
        }
        const s = normalizePropertyValue(raw);
        const n = c.type === 'time' ? Date.parse(s) : parsePropertyNumber(s);
        if (Number.isNaN(n)) {
          if (c.requireValue) return false;
          continue;
        }
        const variant = c.variant || (c.type === 'time' ? 'time_lte' : 'range_between');
        if (variant === 'time_lte' || variant === 'range_max') {
          if (n > c.max) return false;
        } else if (variant === 'range_min') {
          if (n < c.min) return false;
        } else if (n < c.min || n > c.max) {
          return false;
        }
      }
    }
    return true;
  };
}

export function filteredGeoJSON(layer) {
  const pred = layer._filterPredicate || buildControlPredicate(layer);
  if (!pred || !layer.geojson) return layer.geojson;
  // Une couche distante porte une **adresse** dans `geojson`, pas des entités.
  // Filtrer « ce qu'on a » revenait alors à rendre une collection vide, donc à
  // effacer la couche au premier contrôle activé — un filtre qui supprime tout
  // ressemble à un filtre trop strict, et on cherche l'erreur dans ses bornes.
  // Le filtrage de ces couches est dit à MapLibre (`expressionFiltreControles`).
  if (typeof layer.geojson !== 'object' || !Array.isArray(layer.geojson.features)) {
    return layer.geojson;
  }
  return {
    type: 'FeatureCollection',
    features: layer.geojson.features.filter(pred),
  };
}

/**
 * Les contrôles actifs, dits à MapLibre au lieu d'être appliqués aux entités.
 *
 * Le pendant de `buildControlPredicate` pour les couches qu'Atlas ne détient
 * pas. Les deux doivent classer pareil : c'est la même scène, la même
 * symbologie et les mêmes bornes, et un écart donnerait deux cartes selon
 * l'origine de la donnée.
 *
 * @returns {any[]|null} expression MapLibre, ou null si rien n'est à filtrer.
 */
export function expressionFiltreControles(layer) {
  const ctrls = (layer?.controls || []).filter((c) => c.active);
  if (!ctrls.length) return null;
  const clauses = [];

  for (const c of ctrls) {
    const champ = ['get', c.field];

    if (c.type === 'select') {
      const sel = Array.isArray(c.values) ? c.values.filter((v) => v != null && v !== '') : [];
      // Pas de sélection = pas de restriction, comme côté prédicat : un select
      // qu'on vient d'activer sans rien cocher ne doit pas vider la carte.
      if (!sel.length) continue;
      // La comparaison est insensible à la casse des deux côtés, comme le fait
      // `normalizePropertyValue` : un « Résidentiel » déclaré doit retrouver un
      // « résidentiel » stocké.
      clauses.push(['in',
        ['downcase', ['to-string', ['coalesce', champ, '']]],
        ['literal', sel.map((v) => String(v).toLowerCase())]]);
      continue;
    }

    // range et time : bornes numériques. `to-number` échoue sur une valeur non
    // numérique, d'où le repli sur un repère hors domaine — le même choix, et
    // pour la même raison, que dans la symbologie graduée.
    const HORS = -1e38;
    const val = ['to-number', ['coalesce', champ, '—'], HORS];
    const min = Number.isFinite(c.min) ? c.min : null;
    const max = Number.isFinite(c.max) ? c.max : null;
    if (min == null && max == null) continue;

    if (c.requireValue) {
      // Sans valeur exploitable, l'entité est écartée. C'est l'inverse de la
      // tolérance par défaut, et c'est ce qui évite qu'une couche muette
      // recouvre une thématique (cf. le contrôle `requireValue` du récit).
      clauses.push(['!=', val, HORS]);
    }
    if (min != null) clauses.push(['any', ['==', val, HORS], ['>=', val, min]]);
    if (max != null) clauses.push(['any', ['==', val, HORS], ['<=', val, max]]);
  }

  if (!clauses.length) return null;
  return clauses.length === 1 ? clauses[0] : ['all', ...clauses];
}

export function fmtControlValue(c, n) {
  return c.type === 'time' ? new Date(n).toLocaleDateString('fr-FR') : (Math.round(n * 100) / 100);
}

/** ControlDeclarative[] ← état Atlas layer.controls. */
export function controlDeclarativesFromAtlasLayer(layer) {
  return (layer.controls || []).map((c) => ({
    field: resolveGristFieldName(layer._fields, c.field) || c.field,
    type: c.type,
    label: c.label || c.field,
    min: c.min,
    max: c.max,
    values: c.options
      || (c.type === 'select'
        ? controlUniqueValues(layer, c.field, 40).map((v) => v.value)
        : c.values),
    active: !!c.active,
    dataMin: c.dataMin,
    dataMax: c.dataMax,
    variant: c.variant,
    mode: c.mode,
  }));
}

/**
 * ControlDeclarative[] → layer.controls (manifest ou prefs).
 * @param {{ activateDefaults?: boolean }} [opts]
 */
export function applyControlDeclarativesToLayer(layer, declarations, opts = {}) {
  if (!declarations?.length) return;
  layer.controls = layer.controls || [];
  for (const decl of declarations) {
    const field = resolveGristFieldName(layer._fields, decl.field) || decl.field;
    const type = decl.type || controlFieldType(layer, field);
    if (!type) continue;
    let c = layer.controls.find((x) => x.field === field);
    if (!c) {
      c = { field, type, active: false };
      if (type === 'select') {
        /* sélection initialisée à l'activation utilisateur, pas à l'import manifest */
      } else {
        Object.assign(c, controlBounds(layer, type, field));
      }
      layer.controls.push(c);
    }
    if (decl.label) c.label = decl.label;
    if (decl.dataMin != null) c.dataMin = decl.dataMin;
    if (decl.dataMax != null) c.dataMax = decl.dataMax;
    if (decl.min != null) c.min = decl.min;
    if (decl.max != null) c.max = decl.max;
    if (decl.values) c.options = decl.values;
    if (decl.mode) c.mode = decl.mode;
    if (decl.variant) c.variant = decl.variant;
    if (decl.active || opts.activateDefaults) c.active = true;
    repairSelectControlFromManifest(layer, c);
  }
}

/** Contrôle à inclure dans une étape Récit (sélection explicite, pas options manifest). */
export function shouldCaptureControl(layer, c) {
  if (!c?.active) return false;
  if (c.type === 'select') {
    if (c._selectionTouched) return true;
    if (!Array.isArray(c.values) || !c.values.length) return false;
    const all = controlUniqueValues(layer, c.field, 40).map((v) => v.value);
    if (!all.length) return false;
    const sel = selectValuesLowerSet(c);
    const allSelected = all.every((v) => sel.has(String(v).toLowerCase()));
    return !allSelected;
  }
  if (c.type === 'range' || c.type === 'time') {
    if (c.min == null || c.max == null) return false;
    if (c.dataMin != null && c.dataMax != null) {
      if (c.type === 'time') {
        const span = c.dataMax - c.dataMin;
        if (span > 86400000 && c.min <= 1 && c.max <= 1) return false;
      }
      if (c.min === c.dataMin && c.max === c.dataMax) return false;
    }
    return true;
  }
  return true;
}

/** Répare un filtre select actif qui masquerait toute la couche (prefs corrompues). */
export function sanitizeBrokenSelectFilters(layer) {
  for (const c of (layer.controls || [])) {
    if (c.type !== 'select' || !c.active) continue;
    if (c._selectionTouched && Array.isArray(c.values) && !c.values.length) {
      c.active = false;
      delete c._selectionTouched;
      delete c.values;
    }
  }
}

/** Restaure les contrôles d'une étape Récit sur une couche. */
export function applyStoryControlsToLayer(layer, stepControls) {
  layer.controls = layer.controls || [];
  const stepFields = new Set((stepControls || []).map((c) => c.field));

  for (const sc of (stepControls || [])) {
    let c = layer.controls.find((x) => x.field === sc.field);
    if (!c) {
      c = { field: sc.field, type: sc.type, active: false };
      if (sc.type !== 'select') Object.assign(c, controlBounds(layer, sc.type, sc.field));
      layer.controls.push(c);
    }
    c.active = true;
    // Exigence de valeur portée par l'étape : sans elle, une vue thématique
    // laisse passer les entités dépourvues de l'attribut filtré.
    if (sc.requireValue != null) c.requireValue = !!sc.requireValue;
    if (sc.type === 'select') {
      const restored = normalizeSelectValuesForLayer(layer, sc.field, sc.values);
      c.values = restored.length ? restored : (Array.isArray(sc.values) ? [...sc.values] : []);
      c._selectionTouched = true;
    } else {
      if (sc.min != null) c.min = sc.min;
      if (sc.max != null) c.max = sc.max;
      if (sc.values) c.values = sc.values;
    }
  }
  layer.controls.forEach((c) => { if (!stepFields.has(c.field)) c.active = false; });
}

/** Marque les sélections partielles avant capture récit (fiabilise l'enregistrement). */
export function markStoryCaptureControls(layers) {
  for (const layer of (layers || [])) {
    for (const c of (layer.controls || [])) {
      if (shouldCaptureControl(layer, c)) c._selectionTouched = true;
    }
  }
}

/**
 * Restaure layer.controls depuis Atlas_LayerPrefs (sélection utilisateur, pas options manifest).
 */
export function applyControlsFromPrefs(layer, declarations) {
  if (!declarations?.length) return;
  layer.controls = layer.controls || [];
  for (const decl of declarations) {
    const field = resolveGristFieldName(layer._fields, decl.field) || decl.field;
    const type = decl.type || controlFieldType(layer, field);
    if (!type) continue;
    let c = layer.controls.find((x) => x.field === field);
    if (!c) {
      c = { field, type, active: false };
      if (type !== 'select') Object.assign(c, controlBounds(layer, type, field));
      layer.controls.push(c);
    }
    if (decl.label) c.label = decl.label;
    if (decl.options) c.options = decl.options;
    if (decl.dataMin != null) c.dataMin = decl.dataMin;
    if (decl.dataMax != null) c.dataMax = decl.dataMax;
    if (decl.min != null) c.min = decl.min;
    if (decl.max != null) c.max = decl.max;
    if (decl.mode) c.mode = decl.mode;
    if (decl.active != null) c.active = !!decl.active;

    if (type === 'select') {
      if (Array.isArray(decl.selection)) {
        c.values = normalizeSelectValuesForLayer(layer, field, decl.selection);
        c._selectionTouched = true;
      } else if (decl._selectionTouched && Array.isArray(decl.values)) {
        c.values = normalizeSelectValuesForLayer(layer, field, decl.values);
        c._selectionTouched = true;
      } else if (Array.isArray(decl.values) && decl.values.length) {
        // Legacy Atlas_LayerPrefs (avant v20260729e) : values = options manifest, pas sélection
        c.options = decl.options || decl.values;
        delete c.values;
        delete c._selectionTouched;
      } else {
        delete c.values;
        delete c._selectionTouched;
      }
      if (c.active && c._selectionTouched && Array.isArray(c.values) && !c.values.length) {
        /* sélection vide explicite */
      } else if (c.active && !c._selectionTouched && !Array.isArray(c.values)) {
        /* actif sans sélection → pas de filtre catégorie (toutes les features) */
      }
    }

    repairSelectControlFromManifest(layer, c);
  }
}

/** Payload prefs — exporte sélection réelle (pas confondre avec options manifest). */
export function controlsPrefsPayload(layer) {
  return (layer.controls || []).map((c) => ({
    field: resolveGristFieldName(layer._fields, c.field) || c.field,
    type: c.type,
    label: c.label || c.field,
    active: !!c.active,
    min: c.min,
    max: c.max,
    dataMin: c.dataMin,
    dataMax: c.dataMax,
    mode: c.mode,
    options: c.options,
    selection: c.type === 'select' && Array.isArray(c.values) ? [...c.values] : undefined,
    _selectionTouched: !!c._selectionTouched,
  }));
}
