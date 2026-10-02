/**
 * Créer un objet dans une couche : poser sa géométrie, remplir sa fiche, écrire
 * **une seule** ligne.
 *
 * Lot 2 du chantier d'édition géométrique (`docs/CADRAGE-EDITION-GEOMETRIES.md`),
 * limité aux points : lignes et surfaces demandent un outil de tracé (lot 3).
 *
 * L'ordre « fiche d'abord, écriture ensuite » est voulu : une ligne n'existe
 * jamais avant que ses champs obligatoires soient tenus, et « Abandonner » n'a
 * rien à défaire. Rien ici ne touche Grist, la carte ni le DOM.
 */

import {
  familleGeometrie, colonnesGeometrie, cellulesGeometrie, normaliserGeometrie, validerGeometrie,
  nomsColonnesGeometrie,
} from './geometrie-saisie.js?v=1.10.0';

/** Types qu'on sait créer aujourd'hui. */
export const FAMILLES_CREABLES = ['Point', 'LineString', 'Polygon'];

/**
 * Peut-on créer un objet dans cette couche, et sinon pourquoi.
 *
 * Le blocage se dit là où il se lit, avec sa sortie quand il en a une.
 *
 * @param {object} layer
 * @param {{ viewMode?: boolean, peutEcrire?: boolean }} ctx
 * @returns {{ ok: true } | { ok: false, raison: string }}
 */
export function creationPossible(layer, { viewMode = false, peutEcrire = true } = {}) {
  if (!layer) return { ok: false, raison: 'Couche introuvable.' };
  if (viewMode || !peutEcrire) return { ok: false, raison: 'Mode lecture : la création d’objets est réservée à l’édition.' };
  if (layer._distant) return { ok: false, raison: 'Couche distante : ses objets ne sont pas dans ce document.' };
  if (layer._raster) return { ok: false, raison: 'Couche image : elle n’a pas d’objets.' };
  if (!layer.sourceTable) return { ok: false, raison: 'Copie sans table Grist : enregistrez-la en table pour y ajouter des objets.' };
  const famille = familleGeometrie(layer.geometryType);
  if (!FAMILLES_CREABLES.includes(famille)) {
    return { ok: false, raison: 'Type de géométrie non pris en charge par l’éditeur.' };
  }
  if (layer.geometryType === 'MultiPoint') return { ok: false, raison: 'Couche de points multiples : modifiable dans QGIS.' };
  // Le WKT s'écrit depuis le 01/10/2026 (`lib/wkt.js`) : la garde qui le
  // refusait ici est levée, la table reste en WKT.
  // Une table de qgis2grist porte aussi des centroïdes, que QGIS relit : écrire
  // la forme sans eux laisserait la table incohérente. Lot 6 du chantier.
  if (layer.source === 'qgis2grist' || colonnesGeometrie(layer).centroideLat) {
    return { ok: false, raison: 'Couche importée de QGIS : ses formes se modifient dans QGIS pour l’instant (centroïdes à recalculer).' };
  }
  return { ok: true };
}

/**
 * Le point cliqué, arrondi et vérifié.
 *
 * @param {{ lng: number, lat: number }} lngLat
 * @returns {{ ok: true, geometrie: object } | { ok: false, erreur: string }}
 */
export function pointDepuisClic(lngLat) {
  const geom = normaliserGeometrie({ type: 'Point', coordinates: [Number(lngLat?.lng), Number(lngLat?.lat)] });
  const v = validerGeometrie(geom, 'Point');
  if (!geom || !v.ok) return { ok: false, erreur: v.erreurs?.[0]?.message || 'Position inutilisable.' };
  return { ok: true, geometrie: geom };
}

/**
 * Une forme tracée, arrondie, nettoyée et vérifiée pour le type de la couche.
 * L'anneau d'une surface est fermé et orienté ici, jamais par l'utilisateur.
 *
 * @returns {{ ok: true, geometrie: object } | { ok: false, erreur: string }}
 */
export function formeValidee(geom, typeCouche) {
  const g = normaliserGeometrie(geom);
  const v = validerGeometrie(g, typeCouche);
  if (!g || !v.ok) return { ok: false, erreur: v.erreurs?.[0]?.message || 'Forme inutilisable.' };
  return { ok: true, geometrie: g };
}

/**
 * Les cellules de géométrie à écrire pour cette couche.
 * @returns {object|null} `null` si la géométrie n'a pas où s'écrire
 */
export function cellulesPourCouche(layer, geometrie) {
  return cellulesGeometrie(selonTypeCouche(layer, geometrie), colonnesGeometrie(layer));
}

/**
 * Une forme dessinée prend le type de sa couche : une ligne tracée dans une
 * couche de `MultiLineString` s'écrit en `MultiLineString` d'une partie. Sans
 * cela, la table mêlerait les deux types, et l'outil qui la lit ailleurs —
 * celui de l'équipe, QGIS — n'attend qu'un seul type.
 */
export function selonTypeCouche(layer, geometrie) {
  const t = layer?.geometryType;
  if (!geometrie?.type || !/^Multi/.test(t || '') || /^Multi/.test(geometrie.type)) return geometrie;
  return t === `Multi${geometrie.type}` ? { type: t, coordinates: [geometrie.coordinates] } : geometrie;
}

/**
 * L'unique action de création : les champs de la fiche, puis la géométrie.
 *
 * La géométrie passe **après** : c'est le clic qui fait foi, pas un champ que
 * le formulaire aurait déclaré par erreur sur la même colonne.
 */
export function actionCreation(table, champs, cellules) {
  return ['AddRecord', table, null, { ...(champs || {}), ...(cellules || {}) }];
}

/** L'identifiant de la ligne créée, lu dans la réponse de Grist. */
export function rowIdCree(reponse) {
  const r = Array.isArray(reponse) ? reponse : reponse?.retValues;
  const v = Array.isArray(r) ? r[0] : null;
  return Number.isInteger(v) && v > 0 ? v : null;
}

/**
 * L'action qui défait une création. Atlas ne défait que ce qu'il vient
 * d'écrire, et le dit : il ne prétend pas annuler une écriture Grist en général.
 */
export function actionInverse(action, rowId) {
  if (Array.isArray(action) && action[0] === 'AddRecord' && Number.isInteger(rowId) && rowId > 0) {
    return ['RemoveRecord', action[1], rowId];
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Modifier la forme d'un objet existant (lot 4)
 * ------------------------------------------------------------------ */

/**
 * Peut-on modifier la forme de cet objet, et sinon pourquoi.
 * Mêmes conditions que la création, plus celles de l'objet lui-même.
 */
export function modificationPossible(layer, feature, ctx = {}) {
  const base = creationPossible(layer, ctx);
  if (!base.ok) return base;
  if (feature?.properties?._row_id == null) return { ok: false, raison: 'Objet sans ligne Grist.' };
  const g = feature.geometry;
  if (!g?.type) return { ok: false, raison: 'Objet sans forme.' };
  if (/^Multi/.test(g.type)) return { ok: false, raison: 'Objet en plusieurs parties : modifiable dans QGIS.' };
  if (familleGeometrie(g.type) !== familleGeometrie(layer.geometryType)) {
    return { ok: false, raison: 'La forme de cet objet ne correspond pas au type de la couche.' };
  }
  if (g.type === 'Polygon' && (g.coordinates?.length || 0) > 1) {
    return { ok: false, raison: 'Surface trouée : modifiable dans QGIS.' };
  }
  return { ok: true };
}

/** Vrai si un sommet porte une altitude, que l'éditeur ne garde pas. */
export function aDesAltitudes(geom) {
  const voir = (c) => Array.isArray(c) && (typeof c[0] === 'number' ? c.length > 2 : c.some(voir));
  return voir(geom?.coordinates);
}

/** La ligne `rowId` d'une table colonnaire telle que `fetchTable` la rend. */
export function ligneDepuisTable(colonnaire, rowId) {
  const ids = colonnaire?.id || [];
  const i = ids.findIndex((v) => String(v) === String(rowId));
  if (i < 0) return null;
  const ligne = {};
  for (const [k, vals] of Object.entries(colonnaire)) ligne[k] = Array.isArray(vals) ? vals[i] : undefined;
  return ligne;
}

/**
 * Les cellules de géométrie d'une ligne, **telles que Grist les tient** : c'est
 * ce qu'« Annuler la modification » réécrit, à l'octet près, et ce contre quoi
 * un changement venu d'ailleurs se détecte.
 */
export function cellulesDeLigne(layer, ligne) {
  if (!ligne) return null;
  const out = {};
  for (const c of nomsColonnesGeometrie(colonnesGeometrie(layer))) out[c] = ligne[c] ?? null;
  return out;
}

/** Deux jeux de cellules de géométrie sont-ils les mêmes ? */
export function memesCellules(a, b) {
  if (!a || !b) return false;
  const cles = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of cles) {
    const x = a[k] ?? null;
    const y = b[k] ?? null;
    if (typeof x === 'number' || typeof y === 'number') {
      if (Number(x) !== Number(y)) return false;
    } else if (String(x ?? '') !== String(y ?? '')) {
      return false;
    }
  }
  return true;
}

/**
 * Faut-il écrire ? `inchange` si la forme finale est celle d'origine ;
 * `conflit` si la ligne a changé dans Grist depuis l'ouverture de l'édition.
 *
 * @returns {'ecrire' | 'inchange' | 'conflit'}
 */
export function decisionModification({ origine, actuelles, nouvelles }) {
  if (actuelles && origine && !memesCellules(origine, actuelles)) return 'conflit';
  if (memesCellules(origine, nouvelles)) return 'inchange';
  return 'ecrire';
}

/** La seule écriture d'une modification de forme : les colonnes de géométrie, rien d'autre. */
export function actionModification(table, rowId, cellules) {
  return ['UpdateRecord', table, rowId, { ...cellules }];
}

/** « 142 m », « 3,4 km ». */
export function libelleLongueur(m) {
  if (!Number.isFinite(m)) return '';
  if (m < 1000) return `${Math.round(m).toLocaleString('fr-FR')} m`;
  return `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: m < 10000 ? 2 : 1 })} km`;
}

/** « 1 240 m² », « 1,2 ha ». */
export function libelleAire(m2) {
  if (!Number.isFinite(m2)) return '';
  if (m2 < 10000) return `${Math.round(m2).toLocaleString('fr-FR')} m²`;
  return `${(m2 / 10000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ha`;
}

/**
 * Ce que dit l'en-tête pendant un tracé : sommets, longueur ou surface.
 * @param {{ sommets: number, longueurM?: number, aireM2?: number, perimetreM?: number }} m
 */
export function libelleMesures(m, famille) {
  if (!m?.sommets) return famille === 'Polygon' ? 'Surface · aucun sommet' : 'Ligne · aucun sommet';
  const s = `${m.sommets} sommet${m.sommets > 1 ? 's' : ''}`;
  if (famille === 'Polygon') {
    return m.sommets >= 3 ? `${s} · ${libelleAire(m.aireM2)} · périmètre ${libelleLongueur(m.perimetreM)}` : s;
  }
  return m.sommets >= 2 ? `${s} · ${libelleLongueur(m.longueurM)}` : s;
}

/**
 * Le point d'accroche le plus proche du curseur, sur les objets des autres
 * couches : un sommet d'abord, sinon un point de segment.
 *
 * Les géométries viennent des couches d'Atlas, pas des tuiles de MapLibre :
 * une tuile coupe les formes à ses bords et y ajoute des sommets qui
 * n'existent pas dans la donnée.
 *
 * @param {{x: number, y: number}} curseur position écran
 * @param {object[]} geometries GeoJSON (Point, LineString, Polygon, Multi*)
 * @param {(c: number[]) => {x: number, y: number}} projeter
 * @param {number} tolerance en pixels
 * @returns {{ coordonnee: number[], nature: 'sommet'|'segment' } | null}
 */
export function pointAccroche(curseur, geometries, projeter, tolerance = 10) {
  let sommet = null;
  let segment = null;
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const t2 = tolerance * tolerance;
  const suites = [];
  const collecter = (coords, profondeur) => {
    if (profondeur === 0) { suites.push([coords]); return; }
    if (profondeur === 1) { suites.push(coords); return; }
    for (const c of coords) collecter(c, profondeur - 1);
  };
  const PROF = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };
  for (const g of geometries || []) {
    if (!g || !(g.type in PROF) || !Array.isArray(g.coordinates)) continue;
    if (g.type === 'MultiPoint') { for (const c of g.coordinates) suites.push([c]); continue; }
    collecter(g.coordinates, PROF[g.type]);
  }
  for (const suite of suites) {
    const px = suite.map((c) => projeter(c));
    for (let i = 0; i < px.length; i++) {
      const d = d2(px[i], curseur);
      if (d <= t2 && (!sommet || d < sommet.d)) sommet = { d, coordonnee: suite[i].slice(0, 2) };
      if (i === 0) continue;
      const a = px[i - 1];
      const b = px[i];
      const lx = b.x - a.x;
      const ly = b.y - a.y;
      const l2 = lx * lx + ly * ly;
      if (!l2) continue;
      const t = Math.max(0, Math.min(1, ((curseur.x - a.x) * lx + (curseur.y - a.y) * ly) / l2));
      const p = { x: a.x + t * lx, y: a.y + t * ly };
      const ds = d2(p, curseur);
      if (ds <= t2 && (!segment || ds < segment.d)) {
        const c0 = suite[i - 1];
        const c1 = suite[i];
        segment = { d: ds, coordonnee: [c0[0] + t * (c1[0] - c0[0]), c0[1] + t * (c1[1] - c0[1])] };
      }
    }
  }
  if (sommet) return { coordonnee: sommet.coordonnee, nature: 'sommet' };
  if (segment) return { coordonnee: segment.coordonnee, nature: 'segment' };
  return null;
}

/** Coordonnées lisibles d'un point : « 43.3049123° N · 5.3947456° E ». */
export function libellePoint(geometrie) {
  const [lon, lat] = geometrie?.coordinates || [];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  const ns = lat >= 0 ? 'N' : 'S';
  const eo = lon >= 0 ? 'E' : 'O';
  return `${Math.abs(lat).toFixed(7)}° ${ns} · ${Math.abs(lon).toFixed(7)}° ${eo}`;
}
