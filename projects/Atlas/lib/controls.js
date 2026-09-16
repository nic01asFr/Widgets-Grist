/**
 * Contrôles couche — filtres / animation (temps, range, catégorie).
 * ControlDeclarative — interop Scene Manifest V0.2 / interactive_map.
 */
import {
  normalizePropertyValue,
  parsePropertyNumber,
  resolveFeaturePropertyKey,
  resolveGristFieldName,
} from './declarative-style.js?v=20260729m';

/**
 * Les champs d'une couche : ceux que le manifeste déclare, **puis** ceux que
 * portent les entités.
 *
 * Seule la liste déclarée était lue quand elle existait. Une colonne ajoutée
 * dans Grist après l'import — `etat`, sur `Batiments_locaux` — n'y figurait
 * pas, et devenait invisible pour les contrôles alors que chaque objet la
 * portait. Constaté le 16/09/2026.
 */
export function layerFieldNames(layer) {
  const out = [];
  const vus = new Set();
  const ajouter = (nom) => {
    if (!nom || nom.startsWith('_') || nom === 'geometry_json' || vus.has(nom)) return;
    vus.add(nom);
    out.push(nom);
  };
  (layer?._fields || []).forEach((f) => ajouter(f?.name));
  const entites = Array.isArray(layer?.geojson?.features) ? layer.geojson.features : [];
  for (const f of entites.slice(0, 200)) Object.keys(f?.properties || {}).forEach(ajouter);
  return out;
}

/* ------------------------------------------------------------------------
   Lire une cellule : nombres, dates, listes
   ------------------------------------------------------------------------ */

/** Au-delà, une catégorie devient un texte à chercher (hors type déclaré). */
export const SEUIL_CATEGORIES = 20;
/** Au-delà, même un choix déclaré (Choice, Ref) ne tient plus dans une liste. */
export const MAX_VALEURS_LISTE = 40;

/**
 * Un nombre, ou NaN. Accepte « 3,5 » ; refuse « 12 m ».
 *
 * La stricte est voulue : c'est aussi ce que fait `to-number` côté carte, et
 * les deux filtres doivent classer pareil. `parseFloat("3,5")` rendait 3.
 */
export function nombreDe(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (v == null || typeof v === 'boolean') return NaN;
  const t = normalizePropertyValue(v).trim().replace(/\s+/g, '');
  if (!/^[-+]?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?$/i.test(t)) return NaN;
  return Number(t.replace(',', '.'));
}

/**
 * Un instant en millisecondes, ou NaN.
 *
 * - `unite: 's'` : une colonne Date ou DateTime de Grist, stockée en secondes.
 *   Lue comme un nombre, elle donnait un curseur de 1,7 milliard à 1,8 milliard.
 * - « 12/03/2024 » se lit jour/mois : `Date.parse` le lisait 3 décembre.
 * - ISO `2024-03-12` (avec ou sans heure).
 */
export function valeurTemporelle(v, unite) {
  if (v == null || v === '' || typeof v === 'boolean') return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? (unite === 's' ? v * 1000 : v) : NaN;
  const t = normalizePropertyValue(v).trim();
  if (!t) return NaN;
  if (/^-?\d+(?:\.\d+)?$/.test(t)) {
    const n = Number(t);
    return unite === 's' ? n * 1000 : n;
  }
  const fr = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(t);
  if (fr) {
    const [, j, m, a] = fr.map(Number);
    if (m < 1 || m > 12 || j < 1 || j > 31) return NaN;
    return Date.UTC(a, m - 1, j);
  }
  if (RE_DATE_ISO.test(t)) return Date.parse(t);
  return NaN;
}

const RE_DATE_ISO = /^\d{4}-\d{1,2}-\d{1,2}(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const RE_DATE_FR = /^\d{1,2}[/.]\d{1,2}[/.]\d{4}$/;

/**
 * Les valeurs d'une cellule, en texte — plusieurs pour une liste Grist.
 * Une cellule vide n'en a aucune.
 */
export function valeursDeCellule(properties, propKey) {
  const liste = properties?.[`_l_${propKey}`];
  if (Array.isArray(liste)) {
    return liste.map((x) => normalizePropertyValue(x)).filter((x) => x !== '');
  }
  const v = normalizePropertyValue(properties?.[propKey]);
  return v === '' ? [] : [v];
}

/** Minuscules, sans accents : pour chercher dans un texte. */
export function normaliserTexte(t) {
  return String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/* ------------------------------------------------------------------------
   Quel contrôle pour quel champ
   ------------------------------------------------------------------------ */

/** Le contrôle qu'un type de colonne Grist appelle, ou null s'il faut lire les valeurs. */
export function typeControleGrist(typeGrist) {
  const t = String(typeGrist || '').split(':')[0];
  if (t === 'Date' || t === 'DateTime') return 'time';
  if (t === 'Int' || t === 'Numeric') return 'range';
  if (t === 'Bool' || t === 'Choice' || t === 'ChoiceList' || t === 'Ref' || t === 'RefList') return 'select';
  return null;
}

/**
 * Ce qu'on sait d'un champ pour le contrôler.
 *
 * Le type déclaré par Grist prime : une date y est un nombre de secondes, une
 * référence un numéro de ligne, et les valeurs seules les feraient passer pour
 * des nombres quelconques. Sans type déclaré, on lit les valeurs.
 *
 * `typesPossibles` dit les autres formes raisonnables : un nombre à peu de
 * valeurs (un niveau 1 à 5) se filtre aussi par catégories, une catégorie se
 * cherche aussi par texte.
 *
 * @returns {{type: string|null, typesPossibles: string[], vide: boolean,
 *   distinct: number, entier: boolean, booleen: boolean, unite?: 's'}}
 */
export function profilChamp(layer, field, typeGrist) {
  const decl = typeControleGrist(typeGrist);
  const tg = String(typeGrist || '').split(':')[0];
  const unite = decl === 'time' ? 's' : undefined;
  const propKey = resolveFeaturePropertyKey(layer, field);
  const valeurs = [];
  const distinct = new Set();
  const entites = Array.isArray(layer?.geojson?.features) ? layer.geojson.features : [];
  for (const f of entites) {
    for (const v of valeursDeCellule(f.properties, propKey)) {
      valeurs.push(v);
      distinct.add(v.toLowerCase());
    }
    if (valeurs.length >= 5000) break;
  }
  const base = { distinct: distinct.size, entier: false, booleen: false, ...(unite ? { unite } : {}) };
  if (!valeurs.length) return { ...base, type: null, typesPossibles: [], vide: true };

  const booleen = tg === 'Bool' || valeurs.every((v) => v === 'true' || v === 'false');
  const nombres = valeurs.every((v) => !Number.isNaN(nombreDe(v)));
  const entier = nombres && valeurs.every((v) => Number.isInteger(nombreDe(v)));
  const dates = !decl && valeurs.every((v) => RE_DATE_ISO.test(v.trim()) || RE_DATE_FR.test(v.trim()));

  let type;
  if (decl === 'time' || dates) type = 'time';
  else if (booleen) type = 'select';
  else if (decl === 'range' || (!decl && nombres)) type = 'range';
  else if (distinct.size <= (decl === 'select' ? MAX_VALEURS_LISTE : SEUIL_CATEGORIES)) type = 'select';
  else type = 'text';

  const typesPossibles = [type];
  if (type === 'range' && distinct.size <= SEUIL_CATEGORIES) typesPossibles.push('select');
  if (type === 'select' && !booleen) typesPossibles.push('text');
  return { ...base, type, typesPossibles, vide: false, entier, booleen };
}

export function controlFieldType(layer, field, typeGrist) {
  return profilChamp(layer, field, typeGrist).type;
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

export function controlUniqueValues(layer, field, max = MAX_VALEURS_LISTE) {
  const propKey = resolveFeaturePropertyKey(layer, field);
  const counts = new Map();
  for (const f of (Array.isArray(layer?.geojson?.features) ? layer.geojson.features : [])) {
    for (const key of valeursDeCellule(f.properties, propKey)) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
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
 * Combien d'objets n'ont aucune valeur pour ce champ.
 *
 * Une checklist ne proposait que les valeurs présentes : l'activer écartait
 * d'emblée tous les objets sans valeur — 4 bâtiments sur 5 pour `etat` sur
 * `Batiments_locaux`. Le choix « (sans valeur) » s'écrit `''` dans la sélection.
 */
export function nombreSansValeur(layer, field) {
  const propKey = resolveFeaturePropertyKey(layer, field);
  let n = 0;
  for (const f of (Array.isArray(layer?.geojson?.features) ? layer.geojson.features : [])) {
    if (!valeursDeCellule(f.properties, propKey).length) n += 1;
  }
  return n;
}

/** Combien de valeurs distinctes un champ porte (au-delà de la liste affichée). */
export function nombreValeursDistinctes(layer, field) {
  const propKey = resolveFeaturePropertyKey(layer, field);
  const vues = new Set();
  for (const f of (Array.isArray(layer?.geojson?.features) ? layer.geojson.features : [])) {
    for (const key of valeursDeCellule(f.properties, propKey)) vues.add(key);
  }
  return vues.size || (optionsDeclarees(layer, field)?.length ?? 0);
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
    for (const key of valeursDeCellule(f.properties, propKey)) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
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

export function controlBounds(layer, type, field, opts = {}) {
  if (type === 'select') {
    // Tout coché, « sans valeur » compris : activer ne retranche rien.
    const values = controlUniqueValues(layer, field, MAX_VALEURS_LISTE).map((v) => v.value);
    if (nombreSansValeur(layer, field) > 0) values.push('');
    return { values };
  }
  if (type === 'text') return { texte: '' };
  const propKey = resolveFeaturePropertyKey(layer, field);
  let lo = Infinity;
  let hi = -Infinity;
  let entier = true;
  for (const f of (Array.isArray(layer?.geojson?.features) ? layer.geojson.features : [])) {
    const raw = f.properties?.[propKey];
    if (raw == null || raw === '') continue;
    const n = type === 'time' ? valeurTemporelle(raw, opts.unite) : nombreDe(raw);
    if (Number.isNaN(n)) continue;
    lo = Math.min(lo, n);
    hi = Math.max(hi, n);
    if (!Number.isInteger(n)) entier = false;
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
  return { dataMin: lo, dataMax: hi, min: lo, max: hi, ...(type === 'range' && entier ? { entier: true } : {}) };
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
  const out = controlUniqueValues(layer, c.field, 40)
    .filter((v) => allowed.has(String(v.value).toLowerCase()))
    .map((v) => v.value);
  if (allowed.has('')) out.push('');
  return out;
}

/**
 * Restaure une sélection sauvegardée (accepte labels Grist ou values manifest).
 */
export function normalizeSelectValuesForLayer(layer, field, savedValues) {
  if (!Array.isArray(savedValues) || !savedValues.length) return [];
  const allowed = new Set(savedValues.map((v) => String(v ?? '').toLowerCase()));
  const out = controlUniqueValues(layer, field, 40)
    .filter((v) => allowed.has(String(v.value).toLowerCase()))
    .map((v) => v.value);
  if (allowed.has('')) out.push('');
  return out;
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
      if (c.type === 'select') {
        // Actif sans sélection posée : pas de restriction. Sélection vide
        // posée : rien ne passe — c'est ce qu'on a demandé.
        if (!Array.isArray(c.values)) continue;
        if (!c.values.length) return false;
        const choix = c.variant === 'select_single' ? c.values.slice(0, 1) : c.values;
        const retenus = new Set(choix.map((v) => String(v ?? '').toLowerCase()));
        // Une liste Grist passe si l'un de ses choix est retenu ; un objet sans
        // valeur passe si « (sans valeur) » — `''` — l'est.
        const vals = valeursDeCellule(p, propKey);
        if (!(vals.length ? vals : ['']).some((v) => retenus.has(v.toLowerCase()))) return false;
        continue;
      }
      if (c.type === 'text') {
        const q = normaliserTexte(c.texte).trim();
        if (!q) continue;
        if (!normaliserTexte(valeursDeCellule(p, propKey).join(' ')).includes(q)) return false;
        continue;
      }
      const raw = p[propKey];
      // `requireValue` : une entité dépourvue de la donnée filtrée est écartée
      // au lieu d'être laissée passer. Indispensable quand l'attribut n'est
      // renseigné que sur une partie des objets — sinon les entités muettes
      // dominent la carte thématique. Absent par défaut : les filtres
      // existants gardent leur tolérance.
      const n = c.type === 'time' ? valeurTemporelle(raw, c.unite) : nombreDe(raw);
      if (Number.isNaN(n)) {
        if (c.requireValue) return false;
        continue;
      }
      const variant = c.variant || (c.type === 'time' ? 'time_lte' : 'range_between');
      const avecMin = variant !== 'time_lte' && variant !== 'range_max';
      const avecMax = variant !== 'range_min';
      if (avecMax && Number.isFinite(c.max) && n > c.max) return false;
      if (avecMin && Number.isFinite(c.min) && n < c.min) return false;
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
  const texteDuChamp = (champ) => ['downcase', ['to-string', ['coalesce', champ, '']]];

  for (const c of ctrls) {
    const champ = ['get', c.field];

    if (c.type === 'select') {
      // Mêmes règles que le prédicat : pas de sélection posée, pas de
      // restriction ; sélection vide posée, rien ne passe. L'expression
      // laissait tout passer dans le second cas — une carte pleine là où la
      // même scène, détenue localement, était vide.
      if (!Array.isArray(c.values)) continue;
      // `''` reste : c'est le choix « (sans valeur) », et `coalesce` rend ''
      // pour un attribut absent — les deux côtés le lisent pareil.
      const choix = (c.variant === 'select_single' ? c.values.slice(0, 1) : c.values)
        .filter((v) => v != null);
      if (!choix.length) { clauses.push(['==', 1, 0]); continue; }
      // Insensible à la casse des deux côtés, comme `normalizePropertyValue`.
      clauses.push(['in', texteDuChamp(champ), ['literal', choix.map((v) => String(v).toLowerCase())]]);
      continue;
    }

    if (c.type === 'text') {
      const q = String(c.texte ?? '').trim().toLowerCase();
      if (!q) continue;
      // MapLibre ne retire pas les accents : « cafe » ne trouve pas « café »
      // sur une couche distante, alors qu'il le trouve sur une couche locale.
      clauses.push(['in', q, texteDuChamp(champ)]);
      continue;
    }

    // Une date **textuelle** ne se lit pas côté carte : MapLibre n'a pas de
    // conversion de date. Seules les dates en secondes (colonnes Grist) se
    // comparent. Le filtre temporel d'une couche distante à dates ISO est donc
    // inopérant — limite connue, que `filtrableSurLaCarte` permet de dire.
    if (c.type === 'time' && c.unite !== 's') continue;
    const facteur = c.type === 'time' ? 1000 : 1;

    // range et time : bornes numériques. `to-number` échoue sur une valeur non
    // numérique, d'où le repli sur un repère hors domaine — le même choix, et
    // pour la même raison, que dans la symbologie graduée.
    const HORS = -1e38;
    const val = ['to-number', ['coalesce', champ, '—'], HORS];
    const variant = c.variant || (c.type === 'time' ? 'time_lte' : 'range_between');
    const min = variant !== 'time_lte' && variant !== 'range_max' && Number.isFinite(c.min) ? c.min / facteur : null;
    const max = variant !== 'range_min' && Number.isFinite(c.max) ? c.max / facteur : null;
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

/** Le filtre de ce contrôle peut-il s'appliquer à une couche que la carte lit seule ? */
export function filtrableSurLaCarte(c) {
  return !(c?.type === 'time' && c.unite !== 's');
}

export function fmtControlValue(c, n) {
  if (c.type === 'time') {
    return Number.isFinite(n) ? new Date(n).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '—';
  }
  return c.entier ? Math.round(n) : (Math.round(n * 100) / 100);
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
      c = { field: sc.field, type: sc.type, active: false, ...(sc.unite ? { unite: sc.unite } : {}) };
      if (sc.type !== 'select') Object.assign(c, controlBounds(layer, sc.type, sc.field, { unite: sc.unite }));
      layer.controls.push(c);
    }
    c.active = true;
    // L'étape rejoue la forme du contrôle, pas seulement ses bornes.
    if (sc.type) c.type = sc.type;
    if (sc.variant) c.variant = sc.variant;
    if (sc.unite) c.unite = sc.unite;
    if (sc.type === 'text') c.texte = String(sc.texte ?? '');
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
    if (decl.variant) c.variant = decl.variant;
    if (decl.unite) c.unite = decl.unite;
    if (decl.entier) c.entier = true;
    if (decl.requireValue) c.requireValue = true;
    if (type === 'text') c.texte = String(decl.texte ?? '');
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
    // La variante, l'unité et le texte faisaient défaut : après rechargement,
    // un « maximum » redevenait une plage et une date Grist se relisait en
    // millisecondes.
    variant: c.variant,
    unite: c.unite,
    entier: c.entier || undefined,
    requireValue: c.requireValue || undefined,
    texte: c.type === 'text' ? (c.texte || '') : undefined,
    selection: c.type === 'select' && Array.isArray(c.values) ? [...c.values] : undefined,
    _selectionTouched: !!c._selectionTouched,
  }));
}
