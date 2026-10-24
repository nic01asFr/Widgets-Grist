/**
 * L'environnement de la carte nue, déclaré dans le manifeste de scène : relief, bâti en volume, ciel, lumière du soleil. Brique OPTIONNELLE, chargée à la demande par
 * `setScene` seulement quand le manifeste porte `environnement` (ou pour défaire ce qu'une scène précédente avait posé) : la page maigre n'en porte pas le poids.
 *
 *   environnement: {
 *     relief:  true | { exageration?: 0.5 à 3 (1,2 par défaut), source?: 'terrarium' },
 *     bati3d:  true,
 *     ciel:    true,
 *     soleil:  { instant: '2026-06-21T17:30:00+02:00' | <millisecondes> } | { maintenant: true },
 *   }
 *
 * Ce que chaque réglage fait, et ne fait pas :
 *  - `relief` : source d'altitude « terrarium » (AWS Terrain Tiles, sans clé, service TIERS : l'adresse IP de la personne lui est visible) et relief 3D. Le relief du LiDAR HD de l'IGN
 *    demande le décodage GeoTIFF de l'application complète : il n'est pas offert ici (`source: 'ign'` est refusée et dite). Les couches de l'hôte suivent le relief.
 *  - `bati3d` : bâtiments du fond en volume (source `openmaptiles`, hauteur `render_height`). Sans effet, et dit, quand le fond montre déjà du volume (fond « atlas ») ou n'a pas de bâti
 *    (fond uni, base=aucune).
 *  - `ciel` : le ciel et la brume de la carte (utile en vue inclinée).
 *  - `soleil` : la lumière de la carte vient de la direction réelle du soleil à cet instant, au centre de la carte (algorithme NOAA, `lib/soleil.js`) ; elle nuance les faces des volumes
 *    (bâti, volumes de l'hôte). Ce ne sont PAS des ombres portées : MapLibre n'en dessine pas ; les ombres sont une fonction de l'application complète.
 * Une déclaration invalide est ignorée et dite (`ignores`), jamais une erreur : l'hôte ne perd pas sa carte pour un réglage d'ambiance.
 */
import { positionSoleil } from '../soleil.js?v=1.32.1';
import { garderDemAuRechargement } from '../terrain-base.js?v=1.32.1';
import { melanger } from '../charte/couleurs.js';

export const VERSION = '1.0.0';
export const ID_SOURCE_RELIEF = 'bi-env-dem';
export const ID_BATI = 'bi-env-bati3d';
export const EXAGERATION_DEFAUT = 1.2;
export const SOURCE_TERRARIUM = Object.freeze({ type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: 'Relief : Mapzen / AWS Terrain Tiles' });
const CLES = ['relief', 'bati3d', 'ciel', 'soleil'];
const CLES_RELIEF = ['exageration', 'source'];
const CLES_SOLEIL = ['instant', 'maintenant'];
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const borne = (x, a, b) => Math.min(b, Math.max(a, x));

/**
 * Lit la déclaration `environnement` d'un manifeste. @returns {{ relief: {exageration:number}|null, bati3d: boolean, ciel: boolean, soleil: {instantMs:number|null, maintenant:boolean}|null,
 *   ignores: {chemin:string, code:string, message:string}[] }}
 */
export function environnementDeclare(e) {
  const r = { relief: null, bati3d: false, ciel: false, soleil: null, ignores: [] };
  const ignorer = (chemin, code, message) => r.ignores.push({ chemin, code, message });
  if (e === undefined || e === null) return r;
  if (!estObjet(e)) { ignorer('environnement', 'type', '`environnement` doit être un objet : ignoré.'); return r; }
  for (const k of Object.keys(e)) if (!CLES.includes(k)) ignorer('environnement.' + k, 'cle-inconnue', 'clé « ' + k.slice(0, 30) + ' » inconnue : ignorée (' + CLES.join(', ') + ').');
  if (e.relief !== undefined && e.relief !== false) {
    if (e.relief === true) r.relief = { exageration: EXAGERATION_DEFAUT };
    else if (estObjet(e.relief)) {
      for (const k of Object.keys(e.relief)) if (!CLES_RELIEF.includes(k)) ignorer('environnement.relief.' + k, 'cle-inconnue', 'clé « ' + k.slice(0, 30) + ' » inconnue : ignorée.');
      if (e.relief.source !== undefined && e.relief.source !== 'terrarium') ignorer('environnement.relief.source', 'source-non-offerte', 'la source « ' + String(e.relief.source).slice(0, 20) + ' » n\'est pas offerte à la carte nue (relief IGN : application complète) : le relief mondial est utilisé.');
      const x = e.relief.exageration;
      if (x !== undefined && !(typeof x === 'number' && Number.isFinite(x))) ignorer('environnement.relief.exageration', 'type', '`exageration` doit être un nombre : ' + EXAGERATION_DEFAUT + ' utilisé.');
      else if (x !== undefined && (x < 0.5 || x > 3)) ignorer('environnement.relief.exageration', 'hors-bornes', '`exageration` est bornée de 0,5 à 3 : ramenée.');
      r.relief = { exageration: typeof x === 'number' && Number.isFinite(x) ? borne(x, 0.5, 3) : EXAGERATION_DEFAUT };
    } else ignorer('environnement.relief', 'type', '`relief` doit être true ou un objet : ignoré.');
  }
  if (e.bati3d !== undefined) { if (typeof e.bati3d === 'boolean') r.bati3d = e.bati3d; else ignorer('environnement.bati3d', 'type', '`bati3d` doit être true ou false : ignoré.'); }
  if (e.ciel !== undefined) { if (typeof e.ciel === 'boolean') r.ciel = e.ciel; else ignorer('environnement.ciel', 'type', '`ciel` doit être true ou false : ignoré.'); }
  if (e.soleil !== undefined && e.soleil !== false) {
    if (!estObjet(e.soleil)) ignorer('environnement.soleil', 'type', '`soleil` doit être un objet { instant } ou { maintenant: true } : ignoré.');
    else {
      for (const k of Object.keys(e.soleil)) if (!CLES_SOLEIL.includes(k)) ignorer('environnement.soleil.' + k, 'cle-inconnue', 'clé « ' + k.slice(0, 30) + ' » inconnue : ignorée.');
      const i = e.soleil.instant;
      const ms = typeof i === 'number' && Number.isFinite(i) ? i : (typeof i === 'string' ? Date.parse(i) : NaN);
      if (e.soleil.maintenant === true) r.soleil = { instantMs: null, maintenant: true };
      else if (Number.isFinite(ms) && ms > -2.2e12 && ms < 4.1e12) r.soleil = { instantMs: ms, maintenant: false };
      else ignorer('environnement.soleil.instant', 'instant-illisible', '`soleil.instant` doit être une date ISO 8601 avec fuseau (« 2026-06-21T17:30:00+02:00 ») ou des millisecondes : soleil ignoré.');
    }
  }
  return r;
}

/**
 * La lumière MapLibre d'un instant et d'un lieu : direction du soleil, teinte et intensité qui suivent sa hauteur (jour franc, crépuscule, nuit). Pure.
 * @returns {{ azimut: number, hauteur: number, position: [number, number, number], intensite: number, couleur: string }}
 */
export function lumiereSolaire(lat, lng, instantMs) {
  const { azimut, hauteur } = positionSoleil(lat, lng, instantMs);
  const polaire = borne(90 - hauteur, 5, 88);
  let intensite, couleur;
  if (hauteur >= 20) { intensite = 0.55; couleur = '#fff7e8'; }
  else if (hauteur >= 0) { const t = hauteur / 20; intensite = 0.35 + 0.2 * t; couleur = melanger('#ffb070', '#fff7e8', t); }
  else if (hauteur > -6) { intensite = 0.25; couleur = '#9fb0d8'; }
  else { intensite = 0.18; couleur = '#7f8fbf'; }
  return { azimut, hauteur, position: [1.2, azimut, polaire], intensite, couleur };
}

const LUMIERE_DEFAUT = Object.freeze({ anchor: 'viewport', position: [1.15, 210, 30], intensity: 0.5, color: '#ffffff' });

/**
 * Pose l'environnement sur la carte. @param {object} map  la carte MapLibre ; @param {ReturnType<typeof environnementDeclare>} env ;
 * @param {{ theme?: object, maintenant?: () => number }} o
 * @returns {{ etat: { relief: boolean, bati3d: boolean, ciel: boolean, soleil: boolean }, avertissements: string[] }}  `etat` : ce qui a été posé, pour le défaire
 */
export function appliquerEnvironnement(map, env, { theme = null, maintenant = () => Date.now() } = {}) {
  const etat = { relief: false, bati3d: false, ciel: false, soleil: false }, avertissements = env.ignores.map((i) => 'environnement : ' + i.message);
  const essayer = (nom, f) => { try { f(); } catch (e) { avertissements.push('environnement.' + nom + ' : ' + String((e && e.message) || e).slice(0, 120)); } };
  if (env.relief) essayer('relief', () => {
    if (!map.getSource(ID_SOURCE_RELIEF)) map.addSource(ID_SOURCE_RELIEF, { ...SOURCE_TERRARIUM, tiles: [...SOURCE_TERRARIUM.tiles] });
    garderDemAuRechargement(map.getSource(ID_SOURCE_RELIEF));   // MapLibre 5.6.1 laisse une tuile d'altitude rechargée « reloading » à jamais : plus aucun `idle`
    map.setTerrain({ source: ID_SOURCE_RELIEF, exaggeration: env.relief.exageration });
    etat.relief = true;
  });
  if (env.bati3d) essayer('bati3d', () => {
    const couches = (map.getStyle() && map.getStyle().layers) || [];
    const dejaEnVolume = couches.some((l) => l.type === 'fill-extrusion' && !/^bi-/.test(l.id) && (!l.layout || l.layout.visibility !== 'none'));
    if (dejaEnVolume) { avertissements.push('environnement.bati3d : le fond montre déjà le bâti en volume : rien à ajouter.'); return; }
    if (!map.getSource('openmaptiles')) { avertissements.push('environnement.bati3d : ce fond n\'a pas de bâti (source absente) : ignoré.'); return; }
    const premier = couches.find((l) => /^bi-/.test(l.id));
    const couleur = (theme && theme.plan && theme.plan.bati) || '#d9d6d0';
    map.addLayer({ id: ID_BATI, type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
      paint: { 'fill-extrusion-color': couleur, 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 0], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 1 } }, premier ? premier.id : undefined);
    etat.bati3d = true;
  });
  if (env.ciel) essayer('ciel', () => {
    if (typeof map.setSky !== 'function') { avertissements.push('environnement.ciel : cette version de MapLibre n\'a pas de ciel.'); return; }
    map.setSky({ 'sky-color': '#bcd4e8', 'horizon-color': '#f3ecd9', 'fog-color': '#f3ecd9', 'fog-ground-blend': 0.4, 'horizon-fog-blend': 0.6, 'sky-horizon-blend': 0.6 });
    etat.ciel = true;
  });
  if (env.soleil) essayer('soleil', () => {
    const c = map.getCenter(), l = lumiereSolaire(c.lat, c.lng, env.soleil.maintenant ? maintenant() : env.soleil.instantMs);
    map.setLight({ anchor: 'map', position: l.position, color: l.couleur, intensity: l.intensite });
    etat.soleil = true;
  });
  return { etat, avertissements };
}

/** Défait ce qu'une scène précédente avait posé (`etat` rendu par `appliquerEnvironnement`) : la carte retrouve le relief plat, le ciel et la lumière d'origine. */
export function reinitialiserEnvironnement(map, etat) {
  if (!etat) return;
  const essayer = (f) => { try { f(); } catch (e) { /* la carte garde ce qu'elle a : jamais d'erreur pour une ambiance */ } };
  if (etat.relief) essayer(() => { map.setTerrain(null); if (map.getSource(ID_SOURCE_RELIEF)) map.removeSource(ID_SOURCE_RELIEF); });
  if (etat.bati3d) essayer(() => { if (map.getLayer(ID_BATI)) map.removeLayer(ID_BATI); });
  if (etat.ciel) essayer(() => { if (typeof map.setSky === 'function') map.setSky(null); });
  if (etat.soleil) essayer(() => map.setLight({ ...LUMIERE_DEFAUT, position: [...LUMIERE_DEFAUT.position] }));
}
