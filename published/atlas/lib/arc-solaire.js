/**
 * L'arc de la pastille Soleil : les vingt-quatre heures, pas seulement le jour.
 *
 * L'arc couvrait 6 h à 20 h (`360 + r × 840` minutes) : la nuit était
 * inaccessible depuis la pastille — celle que voit un lecteur, le module Soleil
 * étant réservé à l'auteur. Or c'est la nuit que vit l'éclairage public.
 *
 * L'arc suit la **hauteur réelle du soleil** au jour et au lieu de la scène :
 * au-dessus d'une ligne d'horizon le jour, dessous la nuit, avec le coucher et
 * le lever marqués. Rien ici ne touche le DOM ni la carte : le module rend des
 * nombres et un chemin SVG, `app_v7.js` les pose.
 */

export const MINUTES_JOUR = 1440;

/** Position sur l'arc (0 à 1) → minutes depuis minuit, à la minute, 0 à 1439. */
export function minutesDepuisPosition(r) {
  const x = Number(r);
  if (!Number.isFinite(x)) return 0;
  const m = Math.round(Math.max(0, Math.min(1, x)) * MINUTES_JOUR);
  return Math.min(MINUTES_JOUR - 1, m);
}

/** Minutes depuis minuit → position sur l'arc (0 à 1). */
export function positionDepuisMinutes(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m)) return 0;
  return (((m % MINUTES_JOUR) + MINUTES_JOUR) % MINUTES_JOUR) / MINUTES_JOUR;
}

/**
 * La hauteur du soleil échantillonnée sur la journée.
 * @param {(minutes: number) => number} hauteurA hauteur en degrés à une minute du jour
 * @param {number} [pas] minutes entre deux échantillons (le dernier tombe à 1440)
 * @returns {{ minutes: number, hauteur: number }[]}
 */
export function courbeHauteurs(hauteurA, pas = 30) {
  const out = [];
  for (let m = 0; m <= MINUTES_JOUR; m += pas) {
    const h = Number(hauteurA(Math.min(m, MINUTES_JOUR - 1)));
    out.push({ minutes: m, hauteur: Number.isFinite(h) ? h : 0 });
  }
  return out;
}

/**
 * Géométrie de l'arc dans une boîte `largeur × hauteur` (pixels SVG).
 *
 * L'horizon est une ligne horizontale ; la hauteur solaire est mise à
 * l'échelle pour que le point culminant touche le haut et que la nuit la plus
 * basse (bornée à −18°, fin du crépuscule astronomique) touche le bas.
 *
 * @returns {{ chemin: string, horizonY: number, point: (minutes: number) => {x: number, y: number} }}
 */
export function geometrieArc(courbe, { largeur = 168, hauteur = 34, marge = 8, margeHaut = 4, margeBas = 4 } = {}) {
  const hMax = Math.max(1, ...courbe.map((p) => p.hauteur));
  const hMin = Math.min(-1, ...courbe.map((p) => Math.max(-18, p.hauteur)));
  const haut = margeHaut;
  const bas = hauteur - margeBas;
  // Horizon placé proportionnellement : le jour prend la part que lui donne le ciel.
  const horizonY = haut + (bas - haut) * (hMax / (hMax - hMin));
  const x = (m) => marge + (largeur - 2 * marge) * (m / MINUTES_JOUR);
  const y = (h) => {
    const hb = Math.max(-18, h);
    return hb >= 0
      ? horizonY - (horizonY - haut) * (hb / hMax)
      : horizonY + (bas - horizonY) * (hb / hMin);
  };
  const pts = courbe.map((p) => `${x(p.minutes).toFixed(1)} ${y(p.hauteur).toFixed(1)}`);
  const chemin = pts.length ? `M${pts[0]} L${pts.slice(1).join(' L')}` : '';
  const point = (minutes) => {
    const m = Math.max(0, Math.min(MINUTES_JOUR, Number(minutes) || 0));
    // Interpolation linéaire entre échantillons.
    let i = courbe.findIndex((p) => p.minutes >= m);
    if (i <= 0) i = 1;
    const a = courbe[i - 1] || courbe[0];
    const b = courbe[i] || a;
    const u = b.minutes === a.minutes ? 0 : (m - a.minutes) / (b.minutes - a.minutes);
    return { x: x(m), y: y(a.hauteur + (b.hauteur - a.hauteur) * u) };
  };
  return { chemin, horizonY, point };
}

/** Libellé hh:mm d'une minute du jour. */
export function libelleHeure(minutes) {
  const m = ((Math.round(Number(minutes) || 0) % MINUTES_JOUR) + MINUTES_JOUR) % MINUTES_JOUR;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Un pas clavier sur l'arc : ←/→ 5 minutes, Maj+←/→ une heure, boucle sur minuit. */
export function minutesApresTouche(minutes, touche, maj = false) {
  const pas = maj ? 60 : 5;
  const d = touche === 'ArrowRight' || touche === 'ArrowUp' ? pas
    : touche === 'ArrowLeft' || touche === 'ArrowDown' ? -pas : 0;
  if (!d) return null;
  return ((Number(minutes) + d) % MINUTES_JOUR + MINUTES_JOUR) % MINUTES_JOUR;
}
