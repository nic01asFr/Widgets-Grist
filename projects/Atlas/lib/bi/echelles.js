/**
 * Échelles de couleur pour la dataviz : séquentielle, divergente, catégorielle ; contraste WCAG.
 *
 * Module pur. Les couleurs viennent d'un thème (jetons) fourni par l'application hôte : aucune charte n'est écrite ici.
 * Les classes (bornes) réutilisent `lib/classes.js` d'Atlas pour les seuils ; ce module ajoute les rampes continues
 * et les méthodes de découpe qui lui manquaient (quantiles, intervalles égaux).
 */
export const VERSION = '1.0.0';

/** Nombre au format français, sans zéros inutiles : 1234.5 -> « 1 234,5 ». */
export function formaterNombre(v, chiffres) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const a = Math.abs(v); const d = chiffres ?? (a >= 1000 ? 0 : a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 1 : 2);
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d });
}

export function hexVersRgb(hex) {
  let h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export const rgbVersHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** Mélange de deux couleurs (t entre 0 et 1). */
export function melanger(a, b, t) {
  const A = hexVersRgb(a), B = hexVersRgb(b); if (!A || !B) return a;
  return rgbVersHex(A.map((v, i) => v + (B[i] - v) * t));
}

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
/** Niveau WCAG pour un texte courant (AA >= 4.5, AAA >= 7) ou un élément graphique (>= 3). */
export function niveauContraste(rapport, graphique = false) {
  if (rapport == null) return 'inconnu';
  if (graphique) return rapport >= 3 ? 'AA' : 'insuffisant';
  return rapport >= 7 ? 'AAA' : rapport >= 4.5 ? 'AA' : rapport >= 3 ? 'AA-grand-texte' : 'insuffisant';
}

/** Une rampe continue : t dans [0,1] -> couleur, par interpolation linéaire entre les couleurs données. */
export function rampe(couleurs) {
  const c = (couleurs || []).filter((x) => hexVersRgb(x));
  if (!c.length) return () => '#808080';
  if (c.length === 1) return () => c[0];
  return (t) => { const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (c.length - 1), i = Math.min(c.length - 2, Math.floor(x)); return melanger(c[i], c[i + 1], x - i); };
}
/** n couleurs régulièrement prises sur une rampe. */
export function echantillonner(couleurs, n) { const f = rampe(couleurs); return Array.from({ length: n }, (_, i) => f(n === 1 ? 0.5 : i / (n - 1))); }

/** Divergente : deux rampes joignant un centre neutre. valeur dans [-1, 1]. */
export function divergente(bas, neutre, haut) { const a = rampe([bas, neutre]), b = rampe([neutre, haut]); return (v) => (v < 0 ? a(1 + Math.max(-1, v)) : b(Math.min(1, v))); }

// ---- découpe en classes ----
const propres = (vals) => (vals || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
/** Bornes internes de n classes d'effectifs voisins (quantiles). Renvoie n-1 seuils croissants sans doublon. */
export function seuilsQuantiles(valeurs, n) {
  const v = propres(valeurs); if (v.length < 2 || n < 2) return [];
  const s = []; for (let i = 1; i < n; i++) { const p = (i / n) * (v.length - 1), lo = Math.floor(p), x = v[lo] + (v[Math.min(v.length - 1, lo + 1)] - v[lo]) * (p - lo); s.push(x); }
  return [...new Set(s)];
}
/** Bornes internes de n classes d'étendue égale. */
export function seuilsEgaux(valeurs, n) {
  const v = propres(valeurs); if (v.length < 2 || n < 2) return [];
  const min = v[0], max = v[v.length - 1]; if (min === max) return [];
  return Array.from({ length: n - 1 }, (_, i) => min + ((max - min) * (i + 1)) / n);
}
/** Classe (0..seuils.length) d'une valeur : hautes inclusives, comme Atlas. */
export function classeDe(valeur, seuils) { if (!Number.isFinite(valeur)) return -1; let i = 0; while (i < seuils.length && valeur > seuils[i]) i++; return i; }
/** Stops `graduated` (format Scene Manifest) depuis des seuils et des couleurs (n seuils -> n+1 couleurs). */
export function stopsGradues(seuils, couleurs) {
  const n = seuils.length + 1; const cols = couleurs.length === n ? couleurs : echantillonner(couleurs, n);
  return cols.map((color, i) => ({ lower: i === 0 ? undefined : seuils[i - 1], upper: i === n - 1 ? undefined : seuils[i], color }));
}
