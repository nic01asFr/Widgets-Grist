/**
 * La mémoire de démarrage d'Atlas : ce qu'il faut pour que la PREMIÈRE image soit déjà la bonne, sans écran de chargement.
 *
 * Embarqué dans une page (widget Grist, composant), Atlas apprend son thème, la vue de la carte et le fond APRÈS son premier affichage : l'ordre naturel est carte, puis document, puis
 * thème. D'où un enchaînement visible à chaque ouverture (couleurs d'origine, fond de carte d'origine, vue par défaut, textes provisoires). Ce module garde, dans le stockage du
 * navigateur, le DERNIER thème appliqué (variables, mode, plan du fond) et la dernière vue, par instance hôte ; un script de tête (`index_v7.html`) les relit avant le premier
 * affichage, et la carte est créée déjà peinte. Ce qui est relu est une donnée non fiable (le stockage peut avoir été modifié) : chaque valeur est vérifiée avant d'entrer dans la page.
 *
 * Module pur : le stockage est passé en paramètre. Le script de tête de `index_v7.html` refait la même vérification en quelques lignes (un test les garde alignés).
 */
export const VERSION = '1.0.0';
export const FORMAT = 1;
export const PREFIXE = 'atlas-demarrage:';

/** Les seules variables CSS qu'on pose avant l'affichage (celles de `lib/charte/application.js`). */
export const VARIABLES_PERMISES = Object.freeze(['--mode-application', '--bg', '--surface', '--surface-muted', '--ink', '--text', '--muted', '--muted-light', '--hairline', '--hairline-strong', '--accent', '--accent-soft', '--accent2', '--sans', '--serif']);
/** Les jetons du plan du fond (`charte.fond.plan`). */
export const JETONS_PLAN = Object.freeze(['fond', 'vert', 'bati', 'eau', 'route', 'filet', 'limite', 'halo', 'texte', 'texte2', 'info']);

// pas de fonction `url(` ni `expression(` : une variable de couleur ou de police n'a aucune raison de charger quoi que ce soit
const VALEUR = /^(?![\s\S]*(?:url|expression)\s*\()[#a-zA-Z0-9 ,.()%"'_-]{1,300}$/i;
const COULEUR = /^#[0-9a-fA-F]{6}$/;
const fini = (v) => typeof v === 'number' && Number.isFinite(v);

/** La clé de stockage pour une instance hôte (son origine) ; null si Atlas n'est pas embarqué ou si l'origine est illisible. */
export function cleCache(origine) {
  if (typeof origine !== 'string') return null;
  const t = origine.trim();
  return /^https?:\/\/[A-Za-z0-9.:_-]{1,120}$/.test(t) ? PREFIXE + t : null;
}

export function assainirVariables(v) {
  const sortie = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return sortie;
  for (const nom of VARIABLES_PERMISES) if (typeof v[nom] === 'string' && VALEUR.test(v[nom])) sortie[nom] = v[nom];
  return sortie;
}

export function assainirPlan(p) {
  const sortie = {};
  if (!p || typeof p !== 'object' || Array.isArray(p)) return sortie;
  for (const nom of JETONS_PLAN) if (typeof p[nom] === 'string' && COULEUR.test(p[nom])) sortie[nom] = p[nom].toLowerCase();
  return sortie;
}

export function assainirVue(v) {
  if (!v || typeof v !== 'object') return null;
  const { lng, lat, zoom, pitch, bearing } = v;
  if (!fini(lng) || !fini(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return { lng, lat, zoom: fini(zoom) && zoom >= 0 && zoom <= 24 ? zoom : null, pitch: fini(pitch) && pitch >= 0 && pitch <= 85 ? pitch : null, bearing: fini(bearing) && bearing >= -360 && bearing <= 360 ? bearing : null };
}

/** Ce qui est gardé : `{ format, theme: { variables, mode, plan }|null, vue }`. */
export function assainirCache(brut) {
  if (!brut || typeof brut !== 'object' || brut.format !== FORMAT) return { format: FORMAT, theme: null, vue: null };
  let theme = null;
  if (brut.theme && typeof brut.theme === 'object') {
    const variables = assainirVariables(brut.theme.variables), plan = assainirPlan(brut.theme.plan);
    theme = { variables, mode: brut.theme.mode === 'sombre' ? 'sombre' : 'clair', plan };
  }
  return { format: FORMAT, theme, vue: assainirVue(brut.vue) };
}

export function lireCache(stockage, cle) {
  if (!stockage || !cle) return { format: FORMAT, theme: null, vue: null };
  try { return assainirCache(JSON.parse(stockage.getItem(cle))); } catch (e) { return { format: FORMAT, theme: null, vue: null }; }
}

/** Met à jour une partie (`theme` ou `vue`) sans perdre l'autre. Silencieux si le stockage refuse (mode privé, quota). */
export function ecrireCache(stockage, cle, partie) {
  if (!stockage || !cle || !partie) return false;
  try {
    const actuel = lireCache(stockage, cle);
    const suivant = { ...actuel };
    if ('theme' in partie) suivant.theme = partie.theme ? { variables: assainirVariables(partie.theme.variables), mode: partie.theme.mode === 'sombre' ? 'sombre' : 'clair', plan: assainirPlan(partie.theme.plan) } : null;
    if ('vue' in partie) suivant.vue = assainirVue(partie.vue);
    stockage.setItem(cle, JSON.stringify(suivant));
    return true;
  } catch (e) { return false; }
}
