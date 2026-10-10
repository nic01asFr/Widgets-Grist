/**
 * Trajet d'un récit : une ligne copiée, des étapes posées dessus.
 *
 * Rien ici ne touche la carte, Grist, ni le DOM. La ligne n'est pas une couche
 * de la scène : elle voyage dans l'état de chaque étape, et l'application la
 * dessine à part. `captureStoryState` ne connaît pas ce module — la photo est
 * prise d'abord, le trajet est fusionné ensuite.
 */
import { distanceMetres } from './releve.js?v=1.14.0';
import { flattenCoords2D } from './grist-rows.js?v=1.14.0';

export const VERSION = '1.0.0';

/** Marge au-delà du rayon avant que la pastille s'éteigne, en mètres. */
const HYSTERESIS_ALERTE_M = 15;
/** Il faut dépasser le milieu de l'intervalle de tant, le long de la ligne. */
const HYSTERESIS_SUIVI_M = 8;

export function estLineaire(type) {
  return type === 'LineString' || type === 'MultiLineString';
}

function pointsDistincts(coords) {
  const out = [];
  for (const c of coords || []) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const p = [Number(c[0]), Number(c[1])];
    if (!p.every(Number.isFinite)) continue;
    if (out.some((d) => distanceMetres(d, p) < 0.05)) continue;
    out.push(p);
  }
  return out;
}

function coords2d(coords) {
  return (coords || [])
    .filter((c) => Array.isArray(c) && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1])))
    .map((c) => [Number(c[0]), Number(c[1])]);
}

/**
 * Copie plane d'une ligne.
 *
 * Une `LineString` est reprise telle quelle. Une `MultiLineString` donne la
 * partie la plus proche du clic. Moins de deux points distincts : on refuse.
 * @returns {number[][]|null}
 */
export function copieLineaire(geom, clic) {
  if (!geom || !estLineaire(geom.type)) return null;
  const plat = flattenCoords2D(geom);
  let brut = null;
  if (plat.type === 'LineString') brut = plat.coordinates;
  else if (plat.type === 'MultiLineString') {
    const parties = (plat.coordinates || []).map(coords2d).filter((c) => pointsDistincts(c).length >= 2);
    if (!parties.length) return null;
    if (!clic) {
      brut = parties.reduce((a, b) => (longueurMetres(b) > longueurMetres(a) ? b : a));
    } else {
      let meilleure = null;
      for (const partie of parties) {
        const p = projeter(partie, clic);
        if (!meilleure || p.distanceMetres < meilleure.distanceMetres) {
          meilleure = { partie, distanceMetres: p.distanceMetres };
        }
      }
      brut = meilleure.partie;
    }
  }
  const coords = coords2d(brut);
  if (pointsDistincts(coords).length < 2) return null;
  return coords;
}

export function longueurMetres(coords) {
  const c = coords2d(coords);
  let n = 0;
  for (let i = 1; i < c.length; i++) n += distanceMetres(c[i - 1], c[i]);
  return n;
}

function cumuls(coords) {
  const c = coords2d(coords);
  const out = [0];
  for (let i = 1; i < c.length; i++) out.push(out[i - 1] + distanceMetres(c[i - 1], c[i]));
  return { coords: c, cum: out, total: out[out.length - 1] || 0 };
}

/** Point `[lng, lat]` à l'abscisse `t` (0 = début, 1 = fin). */
export function pointAAbscisse(coords, t) {
  const { coords: c, cum, total } = cumuls(coords);
  if (!c.length) return null;
  if (!total) return c[0].slice();
  const cible = Math.max(0, Math.min(1, Number(t) || 0)) * total;
  for (let i = 1; i < c.length; i++) {
    if (cum[i] + 1e-6 >= cible) {
      const span = cum[i] - cum[i - 1];
      const u = span ? (cible - cum[i - 1]) / span : 0;
      return [
        c[i - 1][0] + (c[i][0] - c[i - 1][0]) * u,
        c[i - 1][1] + (c[i][1] - c[i - 1][1]) * u,
      ];
    }
  }
  return c[c.length - 1].slice();
}

/**
 * Projection d'un clic sur la ligne.
 * @returns {{ abscisse: number, point: number[], distanceMetres: number }}
 */
export function projeter(coords, lngLat) {
  const { coords: c, cum, total } = cumuls(coords);
  if (!c.length) return { abscisse: 0, point: null, distanceMetres: Infinity };
  if (!total || !Array.isArray(lngLat)) {
    return { abscisse: 0, point: c[0].slice(), distanceMetres: distanceMetres(c[0], lngLat) };
  }
  let best = null;
  for (let i = 0; i < c.length - 1; i++) {
    const a = c[i];
    const b = c[i + 1];
    const seg = distanceMetres(a, b);
    if (seg < 1e-4) continue;
    const lat = a[1] * Math.PI / 180;
    const kx = Math.cos(lat) * 111320;
    const ky = 110540;
    const bx = (b[0] - a[0]) * kx;
    const by = (b[1] - a[1]) * ky;
    const px = (lngLat[0] - a[0]) * kx;
    const py = (lngLat[1] - a[1]) * ky;
    const len2 = bx * bx + by * by;
    let u = len2 ? (px * bx + py * by) / len2 : 0;
    u = Math.max(0, Math.min(1, u));
    const point = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    const dist = distanceMetres(point, lngLat);
    const abscisse = (cum[i] + seg * u) / total;
    if (!best || dist < best.distanceMetres) best = { abscisse, point, distanceMetres: dist };
  }
  return best || { abscisse: 0, point: c[0].slice(), distanceMetres: distanceMetres(c[0], lngLat) };
}

/**
 * Place d'une étape sur la ligne : le point le plus proche du centre de la vue.
 *
 * La vue (caméra) et la place sur le trajet sont deux choses. Tant qu'un trajet
 * est actif, la lecture va à cette place ; la vue d'origine reste dans
 * `camera` et revient intacte si on retire le trajet. On ne réécrit donc pas
 * le centre de caméra pour coller à la ligne.
 *
 * @returns {{ abscisse: number, point: number[]|null, distanceMetres: number }}
 */
export function placeDepuisVue(coords, centreVue) {
  return projeter(coords, centreVue);
}

/** Distance au-delà de laquelle on signale que la vue est à l'écart de la ligne. */
export const ECART_VUE_TRAJET_M = 25;

/** Abscisses de départ (répartition uniforme) — repli sans centre de vue. */
export function placesInitiales(n) {
  const count = Number(n) || 0;
  if (count <= 0) return [];
  if (count === 1) return [0.5];
  return Array.from({ length: count }, (_, i) => i / (count - 1));
}

/**
 * Indices (dans le tableau d'origine) de l'étape et de sa voisine sur la ligne.
 * `direction` vaut -1 vers le début, +1 vers la fin.
 */
export function indicesEchange(abscisses, index, direction) {
  const ordre = (abscisses || []).map((a, i) => ({ a: Number(a), i }))
    .sort((x, y) => x.a - y.a);
  const pos = ordre.findIndex((x) => x.i === index);
  const autre = pos + direction;
  if (pos < 0 || autre < 0 || autre >= ordre.length) return null;
  return [ordre[pos].i, ordre[autre].i];
}

export function trierParAbscisse(etapes) {
  const liste = (etapes || []).slice();
  if (!liste.some((e) => Number.isFinite(e?.state?.abscisse))) return liste;
  return liste.sort((a, b) => (a.state?.abscisse ?? 1) - (b.state?.abscisse ?? 1));
}

/**
 * Rayon autour d'une étape : la moitié de l'écart au voisin le plus proche,
 * borné entre 30 et 80 m. Une étape seule : 40 m.
 */
export function rayonAutour(ecartMetres) {
  if (!Number.isFinite(ecartMetres)) return 40;
  return Math.min(80, Math.max(30, ecartMetres / 2));
}

/** La pastille s'allume dans le rayon et ne s'éteint que 15 m plus loin. */
export function alertePastille({ distanceM, rayonM, allumee }) {
  if (!Number.isFinite(distanceM) || !Number.isFinite(rayonM)) return false;
  return allumee ? distanceM <= rayonM + HYSTERESIS_ALERTE_M : distanceM <= rayonM;
}

/**
 * Le suivi change d'étape une fois le milieu de l'intervalle dépassé de 8 m
 * vers la voisine, le long de la ligne.
 */
export function suiviDoitChanger({ abscisse, etape, voisine, longueurM }) {
  if (![abscisse, etape, voisine, longueurM].every(Number.isFinite)) return false;
  if (longueurM <= 0) return false;
  const sens = Math.sign(voisine - etape);
  if (!sens) return false;
  const milieu = (etape + voisine) / 2;
  return (abscisse - milieu) * sens * longueurM + 1e-4 >= HYSTERESIS_SUIVI_M;
}

/** Durée du déplacement le long de la ligne, entre 0,8 s et 4 s. */
export function dureeLongeLigneMs(metres) {
  const m = Number(metres);
  if (!Number.isFinite(m) || m <= 0) return 800;
  return Math.min(4000, Math.max(800, (m / 80) * 1000));
}

/** Cap le plus court, en degrés, de `a` vers `b` au paramètre `u`. */
export function capInterpole(a, b, u) {
  const d = ((((Number(b) - Number(a)) % 360) + 540) % 360) - 180;
  return ((Number(a) + d * u) % 360 + 360) % 360;
}

/**
 * La photo du récit, plus ce que le trajet doit conserver.
 * Absent de `conserve`, un champ n'est pas ajouté : une étape sans ligne
 * reste une étape sans ligne.
 */
export function fusionnerApresPhoto(photo, conserve) {
  const out = photo && typeof photo === 'object' ? { ...photo } : {};
  if (conserve?.trace) out.trace = conserve.trace;
  if (Number.isFinite(conserve?.abscisse)) out.abscisse = conserve.abscisse;
  if (Array.isArray(conserve?.saisies)) out.saisies = conserve.saisies;
  // Ce que l'auteur a décidé de l'étape (la proposer comme contexte) n'est pas une
  // photo de la carte : re-capturer la vue ne le défait pas.
  if (conserve?.usage && typeof conserve.usage === 'object') out.usage = conserve.usage;
  return out;
}

/** Re-capture : nouvelle photo et nouvelles saisies, même ligne, même abscisse. */
export function etatApresRecapture(photo, precedent, saisiesFraiches) {
  return fusionnerApresPhoto(photo, {
    trace: precedent?.trace,
    abscisse: precedent?.abscisse,
    saisies: saisiesFraiches,
    usage: precedent?.usage,
  });
}

export function retirerTrace(etapes) {
  return (etapes || []).map((e) => {
    const state = { ...(e?.state || {}) };
    delete state.trace;
    delete state.abscisse;
    return { ...e, state };
  });
}

/** Objets dans le rayon, du plus proche au plus loin, au plus `limite`. */
export function objetsAutour(objets, position, rayonM, limite = 5) {
  if (!Array.isArray(position) || !Number.isFinite(rayonM)) return [];
  return (objets || [])
    .map((o) => ({ ...o, distance: distanceMetres(position, o.point) }))
    .filter((o) => Number.isFinite(o.distance) && o.distance <= rayonM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limite);
}

/**
 * Les objets qui se trouvent le long d'une ligne, dans l'ordre du parcours.
 *
 * Une boucle de randonnée, un linéaire : les ouvrages à relever en la suivant sont ceux qui la bordent. Chacun est
 * projeté sur la ligne ; il compte s'il en est à moins de `rayonM` mètres, et sa place est son abscisse. Deux objets
 * à la même place gardent l'ordre où on les a reçus.
 *
 * @param {number[][]} coords  la ligne
 * @param {Array<{point: number[]}>} objets  des objets portant leur position `[lng, lat]`
 * @param {number} rayonM  distance maximale à la ligne
 * @returns {Array<object>} les objets, chacun avec `abscisse` (0 à 1) et `ecartM`, triés par abscisse
 */
export function objetsLeLong(coords, objets, rayonM = 50) {
  if (!Array.isArray(coords) || coords.length < 2 || !Number.isFinite(rayonM)) return [];
  return (objets || [])
    .map((o, i) => {
      if (!Array.isArray(o?.point)) return null;
      const p = projeter(coords, o.point);
      if (!Number.isFinite(p.distanceMetres) || p.distanceMetres > rayonM) return null;
      return { ...o, abscisse: p.abscisse, ecartM: p.distanceMetres, _ordre: i };
    })
    .filter(Boolean)
    .sort((a, b) => a.abscisse - b.abscisse || a._ordre - b._ordre)
    .map(({ _ordre, ...o }) => o);
}
