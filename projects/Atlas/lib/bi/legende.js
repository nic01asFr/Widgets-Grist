/**
 * Modèle de légende, pur : classes, couleurs, comptes. Le même calcul sert la carte, la légende visuelle, la légende
 * textuelle (accessibilité) et `getRows()` / `getLegend()`. Aucune dépendance au DOM.
 */
export const VERSION = '1.0.0';

const nombre = (v) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const texte = (v) => (v == null || v === '' ? '' : Array.isArray(v) ? String(v[0] ?? '') : String(v));

/**
 * @param {object} decl style déclaratif ({kind:'single'|'categorized'|'graduated', field, stops, color})
 * @param {object[]} features entités à compter (déjà filtrées, ou non)
 * @returns {{couche?:string, type:string, champ:string|null, total:number, classes:{cle:string, libelle:string, couleur:string, compte:number, borne?:[number|null,number|null]}[], sansValeur:number}}
 */
export function modeleLegende(decl, features = [], { cle = null, libelleSans = '(sans valeur)', couleurSans = '#9a9a9a' } = {}) {
  const total = features.length;
  if (!decl || decl.kind === 'single') return { type: 'single', champ: null, total, classes: [{ cle: 'tous', libelle: cle || 'Tous', couleur: decl?.color || '#808080', compte: total }], sansValeur: 0 };
  const champ = decl.field || null; const classes = []; let sansValeur = 0;
  if (decl.kind === 'categorized') {
    const par = new Map(); for (const s of decl.stops || []) par.set(texte(s.value).toLowerCase(), classes.push({ cle: texte(s.value), libelle: s.label || texte(s.value), couleur: s.color, compte: 0 }) - 1);
    for (const f of features) { const v = texte(f.properties?.[champ]).toLowerCase(); if (par.has(v)) classes[par.get(v)].compte++; else sansValeur++; }
  } else if (decl.kind === 'graduated') {
    const stops = [...(decl.stops || [])].sort((a, b) => (a.lower ?? -Infinity) - (b.lower ?? -Infinity));
    for (const s of stops) classes.push({ cle: (s.lower ?? '') + '..' + (s.upper ?? ''), libelle: libelleBorne(s.lower, s.upper), couleur: s.color, compte: 0, borne: [s.lower ?? null, s.upper ?? null] });
    for (const f of features) {
      const v = nombre(f.properties?.[champ]); if (!Number.isFinite(v)) { sansValeur++; continue; }
      // hautes inclusives : ]lower, upper], la première classe sans borne basse
      const i = stops.findIndex((s) => (s.lower == null || v > s.lower) && (s.upper == null || v <= s.upper));
      if (i >= 0) classes[i].compte++; else sansValeur++;
    }
  }
  if (sansValeur) classes.push({ cle: '__sans__', libelle: libelleSans, couleur: couleurSans, compte: sansValeur });
  return { type: decl.kind, champ, total, classes, sansValeur };
}

export function libelleBorne(lower, upper, fmt = (n) => String(Math.round(n * 100) / 100)) {
  if (lower == null && upper == null) return 'Tout';
  if (lower == null) return '≤ ' + fmt(upper);
  if (upper == null) return '> ' + fmt(lower);
  return fmt(lower) + ' – ' + fmt(upper);
}

/** Tableau équivalent de la légende : une ligne par classe (pour une table accessible ou un export). */
export function lignesLegende(modele) { return modele.classes.map((c) => ({ classe: c.libelle, couleur: c.couleur, compte: c.compte, part: modele.total ? Math.round((1000 * c.compte) / modele.total) / 10 : 0 })); }

/** Texte lisible par un lecteur d'écran. */
export function resumeTexte(modele, titre = '') {
  const l = modele.classes.filter((c) => c.compte > 0).map((c) => c.libelle + ' : ' + c.compte).join(' ; ');
  return (titre ? titre + ' — ' : '') + modele.total + ' éléments' + (l ? ' (' + l + ')' : '') + '.';
}
