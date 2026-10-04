/**
 * Centrage initial carte Atlas — session caméra par projet.
 */

export function cameraStorageKey(projectName, docMode = 'standalone') {
  const scope = String(projectName || docMode || 'standalone')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);
  return `atlas_v7_camera_${scope}`;
}

/** Caméra session proche de l'emprise données (sinon considérée stale / défaut Toulouse). */
export function savedCameraNearBounds(bounds, storageKey, storage = sessionStorage) {
  if (!bounds || !storageKey) return false;
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return false;
    const cam = JSON.parse(raw);
    if (typeof cam.lng !== 'number' || typeof cam.lat !== 'number') return false;
    const cx = (bounds[0][0] + bounds[1][0]) / 2;
    const cy = (bounds[0][1] + bounds[1][1]) / 2;
    const span = Math.max(
      Math.abs(bounds[1][0] - bounds[0][0]),
      Math.abs(bounds[1][1] - bounds[0][1]),
      0.01,
    );
    const tol = Math.max(span * 3, 0.05);
    return Math.abs(cam.lng - cx) <= tol && Math.abs(cam.lat - cy) <= tol;
  } catch (_) {
    return false;
  }
}

/**
 * fitBounds au premier chargement sauf si l'utilisateur a déjà navigué près des données.
 * Les prefs couche (Atlas_LayerPrefs) ne bloquent pas le centrage.
 */
export function shouldAutoFitInitialBounds(bounds, storageKey, storage = sessionStorage) {
  if (!bounds) return false;
  return !savedCameraNearBounds(bounds, storageKey, storage);
}

/* ------------------------------------------------------------------ *
 * Position de la caméra, en mètres
 * ------------------------------------------------------------------ */

/** Circonférence équatoriale de la sphère web mercator, en mètres. */
const CIRCONFERENCE_M = 40075016.686;
/** Mètres par degré sur cette sphère (π R / 180). */
const M_PAR_DEGRE = CIRCONFERENCE_M / 360;

/**
 * La caméra de MapLibre en longitude, latitude et hauteur au-dessus du sol (m).
 *
 * MapLibre 5.6.1 n'a pas `map.getFreeCameraOptions` (API Mapbox : l'appel
 * rendait `undefined`, et le niveau de détail du catalogue restait figé au
 * plus fin), et son `transform.getCameraAltitude()` rend `null` ou `NaN` en
 * projection globe (mesuré le 24/09/2026). Ce qui existe dans les deux
 * projections : `transform.getCameraLngLat()`, le point au sol sous la
 * caméra, et `transform.cameraToCenterDistance`, la distance caméra → centre
 * en pixels. La hauteur s'en déduit à l'échelle du centre de la vue.
 *
 * @param {{ lngCamera: number, latCamera: number, cameraToCenterDistance: number,
 *   zoom: number, pitchDeg: number, latCentre: number, tailleTuile?: number }} o
 * @returns {{ lng: number, lat: number, altitude: number } | null}
 */
export function positionCameraMetres(o) {
  const { lngCamera, latCamera, cameraToCenterDistance, zoom, pitchDeg, latCentre } = o || {};
  const tuile = o?.tailleTuile ?? 512;
  const pxParMetre = tuile * Math.pow(2, zoom) / (CIRCONFERENCE_M * Math.cos(latCentre * Math.PI / 180));
  const altitude = (cameraToCenterDistance / pxParMetre) * Math.cos(pitchDeg * Math.PI / 180);
  if (![lngCamera, latCamera, altitude].every(Number.isFinite)) return null;
  return { lng: lngCamera, lat: latCamera, altitude };
}

/**
 * Distance caméra → objet au sol, en mètres (projection locale
 * équirectangulaire : exacte à mieux que 0,1 % aux distances où le niveau de
 * détail se décide, quelques centaines de mètres). Sans caméra : 0, le niveau
 * le plus fin, comme avant.
 * @param {{ lng: number, lat: number, altitude: number } | null} cam
 */
export function distanceCameraObjet(cam, lng, lat) {
  if (!cam) return 0;
  const dx = (lng - cam.lng) * M_PAR_DEGRE * Math.cos(((lat + cam.lat) / 2) * Math.PI / 180);
  const dy = (lat - cam.lat) * M_PAR_DEGRE;
  return Math.hypot(dx, dy, cam.altitude);
}

/**
 * Le cadrage qu'une scène déclare (`camera` du manifeste : `center` en
 * [lon, lat], `zoom`, `pitch`, `bearing`), prêt pour `map.jumpTo`, ou `null`
 * s'il manque ou ne se lit pas. Les angles hors bornes sont ramenés dans les
 * bornes de MapLibre (inclinaison 0 à 85°) ; un zoom illisible annule tout,
 * un angle illisible est seulement omis.
 */
export function cameraDeclaree(manifest) {
  const c = manifest?.camera;
  const centre = Array.isArray(c?.center) ? c.center.map(Number) : null;
  if (!centre || centre.length < 2 || !centre.every(Number.isFinite)) return null;
  if (Math.abs(centre[0]) > 180 || Math.abs(centre[1]) > 90) return null;
  const zoom = Number(c.zoom);
  if (!Number.isFinite(zoom) || zoom < 0 || zoom > 24) return null;
  const out = { center: [centre[0], centre[1]], zoom };
  const pitch = c.pitch == null ? NaN : Number(c.pitch);
  if (Number.isFinite(pitch)) out.pitch = Math.max(0, Math.min(85, pitch));
  const bearing = c.bearing == null ? NaN : Number(c.bearing);
  if (Number.isFinite(bearing)) out.bearing = bearing;
  return out;
}

/* ------------------------------------------------------------------ *
 * La zone visible de la carte (audit des panneaux, 26/09/2026)
 * ------------------------------------------------------------------ */

const MARGES_NULLES = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

/**
 * De combien déplacer la carte (en pixels, au sens de `map.panBy`) pour qu'une
 * emprise à l'écran entre dans la zone visible — et rien si elle y est déjà :
 * un clic ne doit pas faire bouger une carte qui montre déjà ce qu'on vise.
 *
 * @param {object} p
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} p.emprise  en pixels d'écran de la carte
 * @param {{largeur:number,hauteur:number}} p.carte
 * @param {{top?:number,right?:number,bottom?:number,left?:number}} [p.marges]  ce qui recouvre la carte
 * @param {number} [p.marge]  air à garder autour de l'objet
 * @returns {{ dx: number, dy: number, cadrer: boolean }}  `cadrer` : l'objet ne tient pas, il faut dézoomer
 */
export function deplacementPourVoir({ emprise, carte, marges = MARGES_NULLES, marge = 0 } = {}) {
  const e = emprise || {};
  if (![e.minX, e.minY, e.maxX, e.maxY].every(Number.isFinite)) return { dx: 0, dy: 0, cadrer: false };
  const m = { ...MARGES_NULLES, ...marges };
  const zl = m.left + marge;
  const zr = (carte?.largeur || 0) - m.right - marge;
  const zt = m.top + marge;
  const zb = (carte?.hauteur || 0) - m.bottom - marge;
  if (zr <= zl || zb <= zt) return { dx: 0, dy: 0, cadrer: true };
  const axe = (min, max, a, b) => {
    if (max - min > b - a) return null;
    if (min < a) return min - a;
    if (max > b) return max - b;
    return 0;
  };
  const dx = axe(e.minX, e.maxX, zl, zr);
  const dy = axe(e.minY, e.maxY, zt, zb);
  if (dx === null || dy === null) return { dx: 0, dy: 0, cadrer: true };
  return { dx, dy, cadrer: false };
}

/**
 * Ce qui recouvre le bas de la carte, à donner comme `padding` à MapLibre.
 *
 * Sur téléphone la carte ne rétrécit pas : les feuilles et la barre du bas la
 * recouvrent. Sans marge, la caméra visait le centre de l'écran — sous la
 * feuille (mesuré : 88 % d'une couche cadrée cachée). La bulle du récit
 * recouvre aussi le bas : on garde la plus haute des deux, jamais leur somme,
 * puisqu'elles se superposent.
 *
 * @param {object} p
 * @param {number} p.hauteurCarte
 * @param {number} [p.hauteurEcran]   référence des fractions de feuille
 * @param {number[]} [p.feuilles]     fractions de hauteur d'écran des feuilles ouvertes
 * @param {number} [p.barreBas]       barre de navigation du bas, en pixels
 * @param {number} [p.bulle]          bulle du récit, en pixels depuis le bas de la carte
 * @param {number} [p.visibleMin]     hauteur de carte à laisser visible, quoi qu'il arrive
 */
export function margesCarte({ hauteurCarte = 0, hauteurEcran = hauteurCarte, feuilles = [], barreBas = 0, bulle = 0, visibleMin = 120 } = {}) {
  const frac = Math.max(0, ...feuilles.filter(Number.isFinite));
  const feuille = frac > 0 ? barreBas + frac * hauteurEcran : barreBas;
  const bas = Math.max(feuille, Number(bulle) || 0);
  const plafond = Math.max(0, hauteurCarte - visibleMin);
  return { top: 0, right: 0, left: 0, bottom: Math.round(Math.max(0, Math.min(bas, plafond))) };
}

/**
 * Ce qu'il reste d'une animation de caméra, pour la relancer quand la carte
 * change de taille en route : MapLibre fige au départ le point d'écran visé,
 * et un panneau qui s'ouvre pendant le vol décalait l'arrivée de la moitié de
 * sa largeur (mesuré : +180 px, −130 px).
 *
 * @returns {number} millisecondes restantes, 0 si l'animation est finie
 */
export function dureeRestante({ debut, duree, maintenant }) {
  if (![debut, duree, maintenant].every(Number.isFinite)) return 0;
  return Math.max(0, Math.round(debut + duree - maintenant));
}

/** La taille de carte pour laquelle une vue d'auteur est composée quand elle ne le dit pas : une fenêtre de bureau. */
export const ECRAN_REF = Object.freeze({ largeur: 1100, hauteur: 700 });

/**
 * Le zoom qui montre sur cet écran ce que la vue montrait sur celui de l'auteur.
 *
 * Une vue figée (ouverture de la scène, contexte, étape de récit) enregistre un centre et un zoom, composés sur une carte de bureau. Sur un
 * téléphone, le même zoom ne montre qu'une bande étroite : les entités des deux côtés sortent du cadre. On recule du rapport entre les
 * deux écrans — sur le côté le plus contraint : une carte plus petite se dézoome, une plus grande garde le zoom de l'auteur (on ne zoome
 * jamais plus qu'il ne l'a voulu).
 *
 * @param {number} zoom  le zoom de la vue
 * @param {{largeur?: number, hauteur?: number, ref?: {largeur: number, hauteur: number}|null, max?: number}} ecran
 *   `largeur`, `hauteur` : la zone visible de la carte ; `ref` : la carte de l'auteur si elle est connue ; `max` : le recul maximal, en niveaux
 * @returns {number}
 */
export function zoomPourEcran(zoom, { largeur, hauteur, ref = null, max = 3 } = {}) {
  const z = Number(zoom);
  if (!Number.isFinite(z)) return zoom;
  const l = Number(largeur);
  const h = Number(hauteur);
  if (!(l > 0) || !(h > 0)) return z;
  const r = ref && ref.largeur > 0 && ref.hauteur > 0 ? ref : ECRAN_REF;
  const rapport = Math.min(l / r.largeur, h / r.hauteur);
  if (!(rapport < 1)) return z;
  return +(z - Math.min(max, Math.log2(1 / rapport))).toFixed(2);
}

/**
 * De combien déplacer la carte pour que l'emprise (un objet et sa bulle) se retrouve **au centre** de la zone visible — celle que les feuilles
 * et les commandes du haut ne recouvrent pas. À la différence de `deplacementPourVoir`, qui ne bouge que si l'emprise sort, on recentre
 * toujours : en suivant une tournée, chaque objet doit arriver au même endroit.
 *
 * @returns {{dx: number, dy: number}} en pixels, au sens de `map.panBy`
 */
export function deplacementPourCentrer({ emprise, carte, marges = MARGES_NULLES } = {}) {
  const e = emprise || {};
  if (![e.minX, e.minY, e.maxX, e.maxY].every(Number.isFinite)) return { dx: 0, dy: 0 };
  const m = { ...MARGES_NULLES, ...marges };
  const zl = m.left;
  const zr = (carte?.largeur || 0) - m.right;
  const zt = m.top;
  const zb = (carte?.hauteur || 0) - m.bottom;
  if (zr <= zl || zb <= zt) return { dx: 0, dy: 0 };
  return { dx: Math.round((e.minX + e.maxX) / 2 - (zl + zr) / 2), dy: Math.round((e.minY + e.maxY) / 2 - (zt + zb) / 2) };
}

/**
 * Le module doit-il céder la place à la fiche ? Au-dessus de 720 px, rail,
 * module et fiche se posaient côte à côte : sur une tablette en portrait
 * (820 px) il restait 136 px de carte, légende et barre de sélection coupées.
 * On étend la règle du téléphone — une feuille à la fois, la fiche prime — dès
 * que la carte passerait sous le seuil.
 *
 * @param {object} p
 * @param {number} p.largeurCarte   largeur de la carte avant l'ouverture de la fiche
 * @param {number} p.largeurFiche
 * @param {number} [p.seuil]        carte minimale acceptable
 */
export function moduleCedeALaFiche({ largeurCarte, largeurFiche, seuil = 420 } = {}) {
  if (!Number.isFinite(largeurCarte) || !Number.isFinite(largeurFiche)) return false;
  return largeurCarte - largeurFiche < seuil;
}
