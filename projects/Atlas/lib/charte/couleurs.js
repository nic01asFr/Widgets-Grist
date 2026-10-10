/**
 * Calculs de couleur communs : analyse stricte d'une valeur de couleur, hexadécimal et RGB, mélange, luminance et contraste WCAG,
 * Lab, écart CIEDE2000, simulation de daltonisme, niveaux de gris, interpolation perceptuelle. Module pur, sans dépendance.
 *
 * Références :
 *  - contraste : WCAG 2.x (luminance relative, seuil de linéarisation 0,03928 conservé tel que le composant BI le calculait) ;
 *  - Lab : sRGB -> XYZ (D65) -> CIE 1976 L*a*b* ;
 *  - CIEDE2000 : Sharma, Wu et Dalal (2005), kL = kC = kH = 1 ;
 *  - daltonisme : matrices de Machado, Oliveira et Fernandes (2009), sévérité 1,0, appliquées en RGB linéaire.
 *
 * `lib/bi/echelles.js` réexporte `hexVersRgb`, `rgbVersHex`, `melanger`, `luminance` et `contraste` depuis ce module : une seule
 * définition pour la dataviz du composant BI et pour la charte.
 */
export const VERSION = '1.0.0';

// ---------------------------------------------------------------------------------------------------------------- hexadécimal et RGB
/** « #rgb » ou « #rrggbb » (avec ou sans « # ») -> [r, g, b] ; null sinon. N'accepte PAS l'alpha. */
export function hexVersRgb(hex) {
  let h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export const rgbVersHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** Mélange de deux couleurs (t entre 0 et 1) : 0 donne `a`, 1 donne `b`. */
export function melanger(a, b, t) {
  const A = hexVersRgb(a), B = hexVersRgb(b); if (!A || !B) return a;
  return rgbVersHex(A.map((v, i) => v + (B[i] - v) * t));
}

// ---------------------------------------------------------------------------------------------------------------- rampes
/** Une rampe continue : t dans [0,1] -> couleur, par interpolation linéaire (sRGB) entre les couleurs données ; les couleurs illisibles sont écartées. */
export function rampe(couleurs) {
  const c = (couleurs || []).filter((x) => hexVersRgb(x));
  if (!c.length) return () => '#808080';
  if (c.length === 1) return () => c[0];
  return (t) => { const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (c.length - 1), i = Math.min(c.length - 2, Math.floor(x)); return melanger(c[i], c[i + 1], x - i); };
}
/** n couleurs régulièrement prises sur une rampe : exactement ce que le composant BI emploie pour colorer n classes. */
export function echantillonner(couleurs, n) { const f = rampe(couleurs); return Array.from({ length: n }, (_, i) => f(n === 1 ? 0.5 : i / (n - 1))); }

// ---------------------------------------------------------------------------------------------------------------- analyse stricte
/**
 * Syntaxes admises pour une couleur venue de l'extérieur, et celles-là seulement :
 *   #rgb   #rrggbb   #rrggbbaa   rgb(r, g, b)   rgb(r g b / a)   rgba(...)   hsl(h, s%, l%)   hsl(h s% l% / a)   hsla(...)
 * Rien d'autre : ni `url()`, ni `var()`, ni `expression`, ni nom de couleur, ni HTML. La longueur est bornée AVANT toute expression
 * régulière, et celles-ci n'ont ni alternance imbriquée ni quantificateur illimité.
 */
export const LONGUEUR_COULEUR_MAX = 48;
const RE_HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const SEP = '(?:\\s{0,3},\\s{0,3}|\\s{1,3})';
const ALPHA = '(?:\\s{0,3}[,/]\\s{0,3}(0|1|0?\\.\\d{1,3}|\\d{1,3}%))?';
const RE_RGB = new RegExp('^rgba?\\(\\s{0,3}(\\d{1,3})' + SEP + '(\\d{1,3})' + SEP + '(\\d{1,3})' + ALPHA + '\\s{0,3}\\)$', 'i');
const RE_HSL = new RegExp('^hsla?\\(\\s{0,3}(\\d{1,3}(?:\\.\\d{1,2})?)(?:deg)?' + SEP + '(\\d{1,3}(?:\\.\\d{1,2})?)%' + SEP + '(\\d{1,3}(?:\\.\\d{1,2})?)%' + ALPHA + '\\s{0,3}\\)$', 'i');

const alphaDe = (s) => (s === undefined ? 1 : s.endsWith('%') ? Number(s.slice(0, -1)) / 100 : Number(s));

/** hsl (h en degrés, s et l en 0..100) -> [r, g, b] 0..255. */
export function hslVersRgb(h, s, l) {
  const S = s / 100, L = l / 100, k = (n) => (n + h / 30) % 12, a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255 + 1e-9, f(8) * 255 + 1e-9, f(4) * 255 + 1e-9];
}

/**
 * Analyse une valeur de couleur. Renvoie `{ hex, alpha, source }` ou null.
 * `hex` : « #rrggbb » en minuscules ; `alpha` : 0 à 1 ; `source` : la syntaxe reconnue (« hex », « rgb », « hsl »).
 */
export function analyserCouleur(valeur) {
  if (typeof valeur !== 'string') return null;
  const s = valeur.trim();
  if (!s || s.length > LONGUEUR_COULEUR_MAX) return null;
  let m;
  if (s[0] === '#') {
    m = RE_HEX.exec(s); if (!m) return null;
    let h = m[1].toLowerCase(); if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    const alpha = h.length === 8 ? Math.round((parseInt(h.slice(6), 16) / 255) * 1000) / 1000 : 1;
    return { hex: '#' + h.slice(0, 6), alpha, source: 'hex' };
  }
  if ((m = RE_RGB.exec(s))) {
    const v = [m[1], m[2], m[3]].map(Number); const a = alphaDe(m[4]);
    if (v.some((x) => x > 255) || !(a >= 0 && a <= 1)) return null;
    return { hex: rgbVersHex(v), alpha: a, source: 'rgb' };
  }
  if ((m = RE_HSL.exec(s))) {
    const h = Number(m[1]), sat = Number(m[2]), lum = Number(m[3]); const a = alphaDe(m[4]);
    if (h > 360 || sat > 100 || lum > 100 || !(a >= 0 && a <= 1)) return null;
    return { hex: rgbVersHex(hslVersRgb(h % 360, sat, lum)), alpha: a, source: 'hsl' };
  }
  return null;
}

/** Forme normalisée d'une couleur : « #rrggbb », ou « #rrggbbaa » si elle est translucide ; null si la valeur n'est pas une couleur admise. */
export function normaliserCouleur(valeur) {
  const c = analyserCouleur(valeur); if (!c) return null;
  if (c.alpha >= 1) return c.hex;
  return c.hex + Math.round(c.alpha * 255).toString(16).padStart(2, '0');
}

/** Pose une couleur éventuellement translucide (« #rrggbbaa ») sur un fond opaque : « #rrggbb ». */
export function aplatir(couleur, fond = '#ffffff') {
  const c = analyserCouleur(couleur); if (!c) return null;
  return c.alpha >= 1 ? c.hex : melanger(fond, c.hex, c.alpha);
}

// ---------------------------------------------------------------------------------------------------------------- luminance et contraste
/** Luminance relative WCAG 2. */
export function luminance(hex) {
  const c = hexVersRgb(hex); if (!c) return null;
  const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Rapport de contraste WCAG entre deux couleurs (1 à 21). */
export function contraste(a, b) {
  const la = luminance(a), lb = luminance(b); if (la == null || lb == null) return null;
  const [h, l] = la >= lb ? [la, lb] : [lb, la]; return (h + 0.05) / (l + 0.05);
}

// ---------------------------------------------------------------------------------------------------------------- Lab et écarts
const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const delin = (l) => { const c = Math.max(0, Math.min(1, l)); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055); };

/** hex -> [L*, a*, b*] (illuminant D65). */
export function hexVersLab(hex) {
  const c = hexVersRgb(hex); if (!c) return null;
  const [r, g, b] = c.map(lin);
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** [L, a, b] -> hex (écrêté dans le gamut sRGB). */
export function labVersHex([L, a, b]) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const finv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const X = finv(fx) * 0.95047, Y = finv(fy), Z = finv(fz) * 1.08883;
  const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z, g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z, bl = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return rgbVersHex([delin(r), delin(g), delin(bl)]);
}

/** Écart de couleur CIE76 (distance euclidienne dans Lab). */
export function deltaE76(a, b) {
  const A = hexVersLab(a), B = hexVersLab(b); if (!A || !B) return null;
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

/** Écart de couleur CIEDE2000 entre deux couleurs hexadécimales. */
export function deltaE2000(c1, c2) {
  const A = hexVersLab(c1), B = hexVersLab(c2); if (!A || !B) return null;
  return deltaE2000Lab(A, B);
}

/** CIEDE2000 entre deux couleurs données en Lab ([L, a, b]) : formulation de Sharma, Wu et Dalal (2005). */
export function deltaE2000Lab(A, B) {
  const [L1, a1, b1] = A, [L2, a2, b2] = B;
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (b, a) => { if (a === 0 && b === 0) return 0; const t = Math.atan2(b, a) * deg; return t < 0 ? t + 360 : t; };
  const h1p = h(b1, a1p), h2p = h(b2, a2p);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);
  const Lpm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) { hpm = Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) / 2 : (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2; }
  const T = 1 - 0.17 * Math.cos((hpm - 30) * rad) + 0.24 * Math.cos(2 * hpm * rad) + 0.32 * Math.cos((3 * hpm + 6) * rad) - 0.2 * Math.cos((4 * hpm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2), Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

// ---------------------------------------------------------------------------------------------------------------- daltonisme, gris
/** Matrices de Machado et al. (2009), sévérité 1,0, à appliquer en RGB linéaire. */
export const MATRICES_DALTONISME = Object.freeze({
  protanopie: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopie: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopie: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
});
export const TYPES_DALTONISME = Object.freeze(['protanopie', 'deuteranopie', 'tritanopie']);

/** Couleur telle que la perçoit un daltonien (type : protanopie | deuteranopie | tritanopie). */
export function simulerDaltonisme(hex, type) {
  const M = MATRICES_DALTONISME[type]; const c = hexVersRgb(hex); if (!M || !c) return hex;
  const v = c.map(lin);
  return rgbVersHex(M.map((l) => delin(l[0] * v[0] + l[1] * v[1] + l[2] * v[2])));
}

/** Niveau de gris (impression noir et blanc) : luminance relative convertie en gris sRGB. */
export function versGris(hex) { const Y = luminance(hex); if (Y == null) return hex; const v = Math.round(delin(Y)); return rgbVersHex([v, v, v]); }

/** Clarté perceptuelle L* (0 à 100). */
export const clarte = (hex) => hexVersLab(hex)[0];

/** Teinte (degrés) et chroma d'une couleur dans Lab. */
export function teinte(hex) { const [, a, b] = hexVersLab(hex); const t = Math.atan2(b, a) * 180 / Math.PI; return t < 0 ? t + 360 : t; }
export const chroma = (hex) => { const [, a, b] = hexVersLab(hex); return Math.hypot(a, b); };

/** Interpolation dans Lab entre plusieurs ancres (perceptuellement plus régulière que dans sRGB). t entre 0 et 1. */
export function interpolerLab(ancres, t) {
  const L = ancres.map(hexVersLab); const n = L.length - 1;
  const x = Math.max(0, Math.min(1, t)) * n, i = Math.min(n - 1, Math.floor(x)), f = x - i;
  return labVersHex(L[i].map((v, k) => v + (L[i + 1][k] - v) * f));
}

/** Choisit l'encre la plus lisible sur un aplat parmi des candidates : { hex, rapport, ok45, ok3 }. */
export function encreSur(fond, candidates = ['#ffffff', '#000000']) {
  let meilleur = null;
  for (const hex of candidates) { const r = contraste(hex, fond); if (r != null && (!meilleur || r > meilleur.rapport)) meilleur = { hex, rapport: r }; }
  return meilleur && { ...meilleur, ok45: meilleur.rapport >= 4.5, ok3: meilleur.rapport >= 3 };
}
