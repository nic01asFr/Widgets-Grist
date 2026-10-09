/**
 * Fond de plan « en aplats » : règles de classement et de peinture, pures (aucune carte, aucun réseau).
 *
 * Idée : un fond de plan de dataviz ne doit pas rivaliser avec la donnée. On garde ce qui oriente (eau, végétation, bâti, voirie, noms
 * de lieux et de voies), en aplats sans dégradé, avec peu de couleurs fournies par la charte de l'application hôte ; on masque le reste
 * (relief, parcelles, points d'intérêt, pictogrammes, numéros de routes).
 *
 * Deux sources de tuiles vectorielles sont prises en charge :
 *  - le schéma OpenMapTiles (fond par défaut d'Atlas) : on REPEINT les couches existantes ;
 *  - le « Plan IGN » vectoriel (Géoplateforme) : on DÉRIVE un style depuis le style officiel (on garde ses sources de données et ses
 *    filtres, on remplace la peinture).
 */
import { melanger } from './echelles.js';
export const VERSION = '1.1.0';

/** Jetons du plan : des gris neutres, à remplacer par ceux de la charte graphique de l'hôte (`setTheme({ plan })`). */
export const PLAN_DEFAUT = Object.freeze({
  fond: '#F5F5F5', eau: '#DCE6EE', bati: '#E6E6E6', vert: '#E3EBDD', route: '#FFFFFF', filet: '#CFCFCF',
  texte: '#3C3C3C', texte2: '#5F5F5F', halo: '#F5F5F5', limite: '#BDBDBD', info: '#6F7F8F',
});

/**
 * Plan MONOCHROME : une couleur principale et des intensités, comme le recommandent les chartes graphiques pour un fond de carte
 * (« utiliser une couleur principale et si besoin d'en varier l'intensité »). Chaque jeton est la couleur principale
 * mélangée au fond dans une proportion fixe : plus l'élément est structurant, plus il est intense.
 * Résultat : un fond sobre sur lequel les couleurs d'état de la donnée ressortent seules.
 */
export function planMonochrome(principal, { fond = '#FFFFFF', encre = '#222222', intensites = {} } = {}) {
  const k = { vert: 0.07, bati: 0.13, eau: 0.30, filet: 0.38, limite: 0.60, ...intensites };
  const m = (t) => melanger(fond, principal, t);
  // le texte ne prend jamais la couleur principale (un orange ou un violet clair ne se lit pas) : il garde l'encre de la charte
  return { fond, vert: m(k.vert), bati: m(k.bati), eau: m(k.eau), route: fond, filet: m(k.filet), limite: m(k.limite), halo: fond, texte: encre, texte2: melanger(fond, encre, 0.82), info: principal === encre ? encre : melanger(principal, encre, 0.5) };
}

/** Rôles de couche, communs aux deux schémas. */
export const ROLES = Object.freeze(['fond', 'vert', 'eau', 'eau-ligne', 'bati', 'route', 'filet', 'rail', 'limite', 'lieu', 'voie', 'eau-nom', 'masquer']);

const a = (s, ...mots) => mots.some((m) => s.includes(m));

/** Classe une couche OpenMapTiles : { role, minzoom? }. `id` et `source-layer` suffisent. */
export function classerOMT(l) {
  const id = String(l.id || ''), sl = l['source-layer'] || l.sl || null, type = l.type;
  if (id.startsWith('bi-') || id.startsWith('layer-') || id.startsWith('atlas-')) return { role: null }; // pas du fond : on n'y touche pas
  if (type === 'background') return { role: 'fond' };
  if (type === 'raster') return { role: 'masquer' };
  if (sl === 'water') return { role: id.includes('tunnel') ? 'masquer' : 'eau' };
  if (sl === 'waterway') return { role: a(id, 'tunnel', 'label') ? 'masquer' : 'eau-ligne' };
  if (sl === 'park') return { role: type === 'fill' ? 'vert' : 'masquer' };
  if (sl === 'landcover') return { role: a(id, 'wood', 'grass', 'wetland') ? 'vert' : 'masquer' };
  if (sl === 'landuse') return { role: a(id, 'pitch', 'cemetery') ? 'vert' : 'masquer' };
  if (sl === 'building') return { role: type === 'fill-extrusion' ? 'masquer' : 'bati' };
  if (sl === 'boundary') return { role: id.includes('disputed') ? 'masquer' : 'limite' };
  if (sl === 'transportation') {
    if (type === 'symbol' || type === 'fill' || a(id, 'tunnel', 'hatching', 'area_pattern')) return { role: 'masquer' };
    if (a(id, 'rail')) return { role: 'rail' };
    if (a(id, 'casing')) return { role: 'filet' };
    return { role: 'route' };
  }
  if (sl === 'transportation_name') return { role: a(id, 'shield') ? 'masquer' : 'voie' };
  if (sl === 'place') return { role: a(id, 'country', 'state', 'continent') ? 'masquer' : 'lieu' };
  if (sl === 'water_name') return { role: 'eau-nom' };
  return { role: 'masquer' };
}

/** Classe une couche du style « Plan IGN » vectoriel. */
export function classerIGN(l) {
  const id = String(l.id || ''), sl = l['source-layer'] || null, type = l.type;
  if (type === 'circle') return { role: 'masquer' };
  if (sl === 'fond_opaque' || type === 'background') return { role: 'fond' };
  if (sl === 'ocs_vegetation_surf') return { role: type === 'fill' ? 'vert' : 'masquer' };
  if (sl === 'hydro_surf') return { role: type === 'fill' ? 'eau' : 'masquer' };
  if (sl === 'hydro_reseau' || sl === 'hydro_reseau_sup') return { role: 'eau-ligne' };
  if (sl === 'bati_surf') return { role: type === 'fill' ? 'bati' : 'masquer' }; // les zones d'activité et d'emprise (bati_zai, bati_zone_surf) alourdiraient le plan
  if (sl === 'routier_surf') return { role: type === 'fill' ? 'route' : 'masquer' };
  if (sl === 'routier_route' || sl === 'routier_route_sup') {
    if (a(id, 'axe central')) return { role: 'masquer' };
    if (a(id, 'filet ext', 'filet ex')) return { role: 'filet' };
    if (a(id, 'filet int')) return { role: 'route' };
    return { role: 'masquer' };
  }
  if (sl === 'routier_chemin' || sl === 'routier_chemin_sup') {
    if (!a(id.toLowerCase(), 'pietonne', 'filet')) return { role: 'masquer' };
    return { role: a(id, 'filet ext') ? 'filet' : 'route' };
  }
  if (sl === 'routier_liaison') return { role: a(id, 'filet ext') ? 'filet' : 'route' };
  if (sl === 'ferre') return { role: type === 'line' && !a(id, 'perpendic') ? 'rail' : 'masquer' }; // les « traits perpendiculaires » (traverses) sont épais : ils écraseraient le plan
  if (sl === 'limite_lin') return { role: type === 'line' ? 'limite' : 'masquer' };
  if (sl === 'toponyme_localite_ponc') return { role: type === 'symbol' ? 'lieu' : 'masquer' };
  if (sl === 'toponyme_routier_odonyme_lin') return { role: 'voie' };
  if (sl && sl.startsWith('toponyme_hydro')) return { role: type === 'symbol' ? 'eau-nom' : 'masquer' };
  return { role: 'masquer' };
}

/** Peinture d'un rôle : { visibility, paint } ; null si rien à changer. */
export function peinture(role, type, jetons = PLAN_DEFAUT) {
  const J = { ...PLAN_DEFAUT, ...jetons };
  if (role === null) return null;
  if (role === 'masquer') return { visibility: 'none', paint: {} };
  const v = { visibility: 'visible', paint: {} }; const P = v.paint;
  if (role === 'fond') { if (type === 'fill') { P['fill-color'] = J.fond; P['fill-opacity'] = 1; } else P['background-color'] = J.fond; return v; }
  if (type === 'fill') {
    P['fill-color'] = role === 'vert' ? J.vert : role === 'eau' ? J.eau : role === 'bati' ? J.bati : J.route; P['fill-opacity'] = 1; P['fill-outline-color'] = role === 'bati' ? J.filet : role === 'route' ? J.route : P['fill-color']; return v;
  }
  if (type === 'line') {
    P['line-color'] = role === 'route' ? J.route : role === 'limite' ? J.limite : role === 'eau-ligne' ? J.filet : J.filet; P['line-opacity'] = 1;
    if (role === 'limite') { P['line-dasharray'] = [2, 2]; P['line-width'] = 0.8; }
    if (role === 'rail') { P['line-dasharray'] = [3, 2]; P['line-width'] = ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 1.4]; }
    return v;
  }
  if (type === 'symbol') {
    P['text-color'] = role === 'eau-nom' ? J.info : role === 'voie' ? J.texte2 : J.texte; P['text-halo-color'] = J.halo; P['text-halo-width'] = 1.5; P['text-halo-blur'] = 0; P['text-opacity'] = 1; return v;
  }
  return null;
}

/** Applique le classement à une liste de couches OpenMapTiles : renvoie [{id, role, visibility, paint}]. */
export function planOMT(couches, jetons = PLAN_DEFAUT) {
  return couches.map((l) => { const { role } = classerOMT(l); const p = peinture(role, l.type, jetons); return p ? { id: l.id, role, ...p } : null; }).filter(Boolean);
}

/**
 * Dérive un style depuis le style officiel « Plan IGN » : mêmes sources et filtres, peinture et sélection de couches remplacées.
 * @param {object} style style MapLibre (JSON)
 * @param {object} jetons
 * @param {{prefixe?:string, sansSprite?:boolean}} opts
 */
export function deriverStyleIGN(style, jetons = PLAN_DEFAUT, { prefixe = 'fond-', sansSprite = true } = {}) {
  const gardees = []; const vus = new Set();
  for (const l of style.layers || []) {
    const { role } = classerIGN(l); if (role === 'masquer' || role === null) continue;
    const p = peinture(role, l.type, jetons); if (!p) continue;
    let id = prefixe + l.id; while (vus.has(id)) id += '_'; vus.add(id);
    const copie = { ...l, id, paint: { ...p.paint }, layout: { ...(l.layout || {}) } };
    // les paramètres de largeur / pointillé d'origine sont gardés sauf si le rôle impose les siens
    if (l.type === 'line') for (const k of ['line-width', 'line-cap', 'line-join', 'line-gap-width']) if (l.paint && l.paint[k] !== undefined && copie.paint[k] === undefined) copie.paint[k] = l.paint[k];
    if (l.type === 'line' && role === 'rail' && l.paint && l.paint['line-width'] !== undefined) copie.paint['line-width'] = l.paint['line-width'];
    if (l.type === 'symbol') { delete copie.layout['icon-image']; delete copie.layout['icon-size']; copie.layout['icon-allow-overlap'] = false; if (copie.layout['visibility'] === 'none') copie.layout['visibility'] = 'visible'; }
    copie.layout.visibility = 'visible';
    delete copie.metadata; gardees.push(copie);
  }
  const sources = {}; for (const [k, s] of Object.entries(style.sources || {})) sources[prefixe + k] = s;
  for (const c of gardees) if (c.source) c.source = prefixe + c.source;
  return { version: 8, glyphs: style.glyphs, sprite: sansSprite ? undefined : style.sprite, sources, layers: gardees };
}

/** Compte les couches par rôle (pour un contrôle ou un rapport). */
export function bilanRoles(couches, classer = classerOMT) { const r = {}; for (const l of couches) { const { role } = classer(l); const k = role === null ? 'hors-fond' : role; r[k] = (r[k] || 0) + 1; } return r; }

/** Fonds proposés : nom, libellé, ce qu'ils exigent. */
export const FONDS = Object.freeze({
  atlas: { libelle: 'Fond d\'Atlas (inchangé)', reseau: true },
  voile: { libelle: 'Fond d\'Atlas atténué (voile)', reseau: true },
  plan: { libelle: 'Plan en aplats (tuiles OpenMapTiles)', reseau: true },
  'plan-ign': { libelle: 'Plan en aplats (Plan IGN vectoriel)', reseau: true },
  photo: { libelle: 'Photographie aérienne (IGN)', reseau: true },
  uni: { libelle: 'Fond uni (hors ligne)', reseau: false },
});
