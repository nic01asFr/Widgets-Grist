/**
 * Échelles de couleur pour la dataviz : séquentielle, divergente, catégorielle ; contraste WCAG.
 *
 * Module pur. Les couleurs viennent d'un thème (jetons) fourni par l'application hôte : aucune charte n'est écrite ici.
 * Les classes (bornes) réutilisent `lib/classes.js` d'Atlas pour les seuils ; ce module ajoute les rampes continues
 * et les méthodes de découpe qui lui manquaient (quantiles, intervalles égaux).
 */
// Calculs de couleur : UNE seule définition, partagée avec la charte (lib/charte/couleurs.js) et réexportée ici pour le composant BI.
import { hexVersRgb, rgbVersHex, melanger, luminance, contraste, rampe, echantillonner } from '../charte/couleurs.js';
export { hexVersRgb, rgbVersHex, melanger, luminance, contraste, rampe, echantillonner };

export const VERSION = '1.0.0';

/** Nombre au format français, sans zéros inutiles : 1234.5 -> « 1 234,5 ». */
export function formaterNombre(v, chiffres) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const a = Math.abs(v); const d = chiffres ?? (a >= 1000 ? 0 : a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 1 : 2);
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d });
}

/** Niveau WCAG pour un texte courant (AA >= 4.5, AAA >= 7) ou un élément graphique (>= 3). */
export function niveauContraste(rapport, graphique = false) {
  if (rapport == null) return 'inconnu';
  if (graphique) return rapport >= 3 ? 'AA' : 'insuffisant';
  return rapport >= 7 ? 'AAA' : rapport >= 4.5 ? 'AA' : rapport >= 3 ? 'AA-grand-texte' : 'insuffisant';
}

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

/** La couleur d'un aplat telle qu'on la VOIT : mélangée au fond selon l'opacité de remplissage (un aplat à 88 % est plus proche du fond que sa couleur pleine). */
export function couleurVue(couleur, fond, opacite = 1) { return melanger(fond, couleur, opacite); }

/**
 * Une couleur est « pâle » quand, vue sur le fond, elle tombe sous le contraste minimal d'un élément graphique (3:1 par défaut, WCAG 1.4.11) : son bord
 * ne se distingue plus du fond, il faut un trait qui tranche. Une couleur ou un fond illisibles ne sont jamais pâles (rien à comparer).
 */
export function estPale(couleur, fond, { opacite = 1, seuil = 3 } = {}) {
  if (!hexVersRgb(couleur) || !hexVersRgb(fond)) return false;
  const r = contraste(couleurVue(couleur, fond, opacite), fond);
  return r !== null && r < seuil;
}
