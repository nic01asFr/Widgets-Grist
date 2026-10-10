/**
 * Regrouper les objets d'une couche quand ils se recouvrent.
 *
 * À l'échelle d'un département, cent points se superposent : la carte ne dit plus rien. Une couche peut
 * donc demander que ses objets proches soient remplacés par un rond qui dit leur nombre, et qui se défait
 * en zoomant.
 *
 * Ce que « regrouper » veut dire dépend de la géométrie :
 * - **points** : MapLibre regroupe les points eux-mêmes, dans la source de la couche ;
 * - **lignes et surfaces** : on ne regroupe pas des formes, on regroupe leurs **centres**, et la forme
 *   n'apparaît qu'au-delà d'un zoom (en dessous, des milliers de tronçons n'étaient de toute façon qu'un
 *   écheveau).
 *
 * Le rond d'un regroupement prend la couleur de la couche, ou — quand la couleur vient d'une table de
 * référence avec un rang de gravité — celle de **l'objet le plus grave** qu'il contient : un regroupement
 * ne cache pas un état critique derrière un vert.
 *
 * Ce module est pur : il construit des options et des expressions MapLibre, il ne touche pas à la carte.
 */

import { expressionRang } from './table-reference.js?v=1.13.2';

export const VERSION = '1.0.0';

export const GRAPPES_DEFAUT = Object.freeze({ enabled: false, rayon: 50, zoomMax: 14, couleur: 'couche' });

const borner = (v, min, max, repli) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : repli;
};

/** La configuration d'une couche, complétée et bornée. */
export function configGrappes(sym) {
  const c = sym?.cluster || {};
  return {
    enabled: !!c.enabled,
    rayon: Math.round(borner(c.rayon, 20, 150, GRAPPES_DEFAUT.rayon)),
    zoomMax: Math.round(borner(c.zoomMax, 3, 18, GRAPPES_DEFAUT.zoomMax)),
    couleur: c.couleur === 'pire' ? 'pire' : 'couche',
  };
}

const EST_POINT = (g) => g === 'Point' || g === 'MultiPoint';

/** Une couche se regroupe-t-elle ? Pas un fond de tuiles, pas une couche distante, pas un modèle 3D. */
export function grappable(layer) {
  if (!layer || layer._raster || layer._distant) return false;
  if (EST_POINT(layer.geometryType)) {
    const mode = layer.style?.mode;
    return mode !== 'library' && mode !== 'custom';
  }
  return ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(layer.geometryType);
}

/** La couche demande-t-elle des regroupements, et peut-elle en avoir ? */
export function grappesActives(layer) {
  return grappable(layer) && configGrappes(layer.style?.symbolization).enabled;
}

/** Les rangs de gravité que la couleur de la couche tient d'une table de référence, ou null. */
export function rangsDeLaCouche(sym) {
  const c = sym?.color;
  const rangs = c?.reference?.rangs;
  if (c?.mode !== 'categorized' || !c.field || !rangs || !Object.keys(rangs).length) return null;
  return rangs;
}

/** « Le plus grave » est-il possible pour cette couche ? */
export function pireDisponible(sym) { return !!rangsDeLaCouche(sym); }

/** Les options à ajouter à une source GeoJSON pour qu'elle regroupe. */
export function optionsGrappes(cfg, sym) {
  const out = { cluster: true, clusterRadius: cfg.rayon, clusterMaxZoom: cfg.zoomMax };
  const rangs = cfg.couleur === 'pire' ? rangsDeLaCouche(sym) : null;
  if (rangs) {
    const entrees = new Map(Object.entries(rangs).map(([k, rang]) => [k, { rang }]));
    out.clusterProperties = { pire: ['max', expressionRang(sym.color.field, entrees)] };
  }
  return out;
}

export const FILTRE_GRAPPE = ['has', 'point_count'];
export const FILTRE_ISOLE = ['!', ['has', 'point_count']];

/** Le rayon du rond, selon le nombre d'objets qu'il regroupe. */
export const RAYON_GRAPPE = ['step', ['get', 'point_count'], 15, 10, 19, 50, 24, 200, 30];

/** La couleur du rond : celle de la couche, ou celle de l'objet le plus grave du groupe. */
export function couleurGrappe(cfg, sym, couleurCouche = '#2D2820') {
  const rangs = cfg.couleur === 'pire' ? rangsDeLaCouche(sym) : null;
  if (!rangs) {
    return sym?.color?.mode === 'single' && sym.color.value ? sym.color.value : couleurCouche;
  }
  // rang → couleur de la catégorie qui le porte ; un rang partagé garde la première couleur rencontrée
  const parRang = new Map();
  for (const cat of sym.color.categories || []) {
    const r = rangs[String(cat.value)];
    if (Number.isFinite(r) && cat.color && !parRang.has(r)) parRang.set(r, cat.color);
  }
  if (!parRang.size) return couleurCouche;
  const expr = ['match', ['get', 'pire']];
  for (const [r, c] of [...parRang.entries()].sort((a, b) => a[0] - b[0])) expr.push(r, c);
  expr.push(couleurCouche);
  return expr;
}

/** Le zoom au-delà duquel les formes (lignes, surfaces) remplacent leurs centres regroupés. */
export function zoomFormes(cfg) { return cfg.zoomMax + 1; }
