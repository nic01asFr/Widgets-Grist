/**
 * Position du soleil — traduction fidèle de la référence de pix2hdr
 * (`pix2hdr/src/pairs/sun.py`, `solar_position`, algorithme NOAA).
 *
 * Décision commune du 24/09/2026 (contrat Atlas ↔ pix2hdr, décision 4) : le
 * soleil des **comportements** (allumage de l'éclairage public, fenêtres) est
 * celui de cette référence, pas SunCalc — mesuré, SunCalc s'en écarte jusqu'à
 * 0,21° et décale le coucher de 10 s à 3 min à Marseille. SunCalc reste
 * employé pour l'ambiance de la carte.
 *
 * Fidélité : `%` de Python rend un reste du signe du diviseur, `//` arrondit
 * vers le bas. Les deux sont reproduits (`mod`, `Math.floor`) ; les écarts
 * restants viennent des fonctions trigonométriques des deux langages, d'où des
 * vecteurs de test à tolérance (1e-9°), et des comportements vérifiés au bit
 * près **à soleil donné**.
 */

export const VERSION = '1.0.0';

/** Hauteur du soleil au coucher et au lever apparents (EclExt `CS`, `LS`). */
export const HAUTEUR_COUCHER_DEG = -0.833;

const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;
/** Reste à la manière de Python : du signe du diviseur. */
const mod = (a, n) => ((a % n) + n) % n;

/**
 * Azimut (0 = nord, sens horaire) et hauteur du soleil, en degrés.
 * @param {number} latDeg
 * @param {number} lonDeg
 * @param {number} instantMs instant absolu (millisecondes depuis l'époque, UTC)
 * @returns {{ azimut: number, hauteur: number }}
 */
export function positionSoleil(latDeg, lonDeg, instantMs) {
  const t = new Date(instantMs);
  let y = t.getUTCFullYear();
  let m = t.getUTCMonth() + 1;
  const jourMois = t.getUTCDate();
  const h = t.getUTCHours();
  const mi = t.getUTCMinutes();
  // `datetime` de Python porte des microsecondes : on garde la fraction de seconde.
  const s = t.getUTCSeconds() + t.getUTCMilliseconds() / 1000;

  // jour julien
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  const dayFrac = (h + mi / 60.0 + s / 3600.0) / 24.0;
  const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + jourMois + dayFrac + b - 1524.5;
  const jc = (jd - 2451545.0) / 36525.0;

  // géométrie solaire moyenne
  const gml = mod(280.46646 + jc * (36000.76983 + jc * 0.0003032), 360.0);
  const gma = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const ecc = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const gmaR = rad(gma);
  const ctr = Math.sin(gmaR) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
    + Math.sin(2 * gmaR) * (0.019993 - 0.000101 * jc)
    + Math.sin(3 * gmaR) * 0.000289;
  const trueLong = gml + ctr;
  const omega = 125.04 - 1934.136 * jc;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));

  // obliquité
  const seconds = 21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813));
  const oblique = 23.0 + (26.0 + seconds / 60.0) / 60.0;
  const obliqueCorr = oblique + 0.00256 * Math.cos(rad(omega));

  const decl = deg(Math.asin(Math.sin(rad(obliqueCorr)) * Math.sin(rad(appLong))));

  // équation du temps (minutes)
  const varY = Math.tan(rad(obliqueCorr / 2.0)) ** 2;
  const gmlR = rad(gml);
  const eot = 4.0 * deg(
    varY * Math.sin(2 * gmlR)
    - 2 * ecc * Math.sin(gmaR)
    + 4 * ecc * varY * Math.sin(gmaR) * Math.cos(2 * gmlR)
    - 0.5 * varY * varY * Math.sin(4 * gmlR)
    - 1.25 * ecc * ecc * Math.sin(2 * gmaR),
  );

  const minutes = h * 60.0 + mi + s / 60.0;
  const trueSolar = mod(minutes + eot + 4.0 * lonDeg, 1440.0);
  const hourAngle = trueSolar / 4.0 >= 0 ? trueSolar / 4.0 - 180.0 : trueSolar / 4.0 + 180.0;

  const latR = rad(latDeg);
  const declR = rad(decl);
  const haR = rad(hourAngle);
  const zenith = deg(Math.acos(Math.max(-1.0, Math.min(1.0,
    Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR) * Math.cos(haR)))));
  const hauteur = 90.0 - zenith;

  let azimut;
  const denom = Math.cos(latR) * Math.sin(rad(zenith));
  if (Math.abs(denom) > 1e-9) {
    const cosAz = (Math.sin(latR) * Math.cos(rad(zenith)) - Math.sin(declR)) / denom;
    const az = deg(Math.acos(Math.max(-1.0, Math.min(1.0, cosAz))));
    azimut = hourAngle > 0 ? mod(az + 180.0, 360.0) : mod(540.0 - az, 360.0);
  } else {
    azimut = latDeg > 0 ? 180.0 : 0.0;
  }
  return { azimut, hauteur };
}

/**
 * Instant où la hauteur du soleil franchit `seuil` entre `debutMs` et `finMs`,
 * dans le sens demandé, à la seconde. `null` s'il ne le franchit pas.
 *
 * Balayage par pas de 10 minutes, puis dichotomie : la hauteur varie
 * régulièrement à ces échelles, et le franchissement le plus proche du début
 * est retenu.
 */
export function franchissement(latDeg, lonDeg, debutMs, finMs, seuil, sens) {
  const PAS = 10 * 60 * 1000;
  const f = (tMs) => positionSoleil(latDeg, lonDeg, tMs).hauteur - seuil;
  let t0 = debutMs;
  let v0 = f(t0);
  for (let t1 = debutMs + PAS; t1 <= finMs + PAS; t1 += PAS) {
    const tt = Math.min(t1, finMs);
    const v1 = f(tt);
    const monte = v0 < 0 && v1 >= 0;
    const descend = v0 >= 0 && v1 < 0;
    if ((sens === 'montant' && monte) || (sens === 'descendant' && descend)) {
      let a = t0;
      let b = tt;
      while (b - a > 1000) {
        const m = Math.floor((a + b) / 2);
        const vm = f(m);
        if ((vm < 0) === (v0 < 0)) a = m; else b = m;
      }
      return Math.round(b / 1000) * 1000;
    }
    if (tt >= finMs) break;
    t0 = tt;
    v0 = v1;
  }
  return null;
}

/**
 * Coucher et lever apparents (−0,833°) autour d'un midi local, à la seconde.
 * Forme attendue par `lib/eclairage-profil.js` (`soleil`).
 *
 * Le lever est cherché dans les 12 h qui précèdent le midi, le coucher dans les
 * 12 h qui suivent. Sous les hautes latitudes (nuit ou jour polaire), l'un ou
 * l'autre peut manquer : il vaut alors `null`.
 */
export function coucherLever(midiMs, latDeg, lonDeg, seuil = HAUTEUR_COUCHER_DEG) {
  const DEMI = 12 * 3600 * 1000;
  return {
    lever: franchissement(latDeg, lonDeg, midiMs - DEMI, midiMs, seuil, 'montant'),
    coucher: franchissement(latDeg, lonDeg, midiMs, midiMs + DEMI, seuil, 'descendant'),
  };
}
