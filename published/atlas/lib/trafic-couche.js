/**
 * Un trafic SIMULÉ sur les routes d'une couche, pour une maquette ou une démonstration (T1).
 *
 * Le moteur (`lib/trafic/`) fait rouler des véhicules individuels sur un réseau de tronçons : sens uniques, voies par sens, carrefours,
 * giratoires, files d'attente. Ici on lui donne les routes d'une couche Atlas (BD TOPO importée de l'IGN, routes OpenStreetMap, ou toute
 * ligne portant ces attributs) et on dessine les véhicules sur la carte, un point par véhicule, rafraîchi à chaque pas du moteur.
 *
 * Ce qui est VRAI et ce qui est SUPPOSÉ (à dire quand on le montre) :
 *  - vrai : la géométrie des routes, leur sens, leur nombre de voies, leur importance ;
 *  - supposé : les débits (une densité de véhicules par km, la même partout), les feux (la BD TOPO n'en porte pas, ils ne sont pas simulés ici),
 *    les destinations (tirées au hasard). Ce n'est PAS une mesure du trafic réel et cela ne dit rien d'un projet.
 *
 * Ce module ne touche à la carte que par l'objet passé (`addSource`, `addLayer`, `getSource().setData`, `removeLayer`, `removeSource`) :
 * il se teste sans navigateur.
 */
import { Trafic } from './trafic/index.js?v=1.16.0';
import { sensOsm } from './itineraire.js?v=1.16.0';

/** Véhicules par km de route : un trafic ambiant lisible, pas un embouteillage. */
export const DENSITE_DEFAUT = 8;
export const VEHICULES_MIN = 10;
export const VEHICULES_MAX = 600;
/** Un pas du moteur dure 0,2 s simulée ; une image toutes les 200 ms donne le temps réel (vitesse 1). */
export const CADENCE_MS = 200;
export const ID_SOURCE = 'atlas-trafic';

/** Importance BD TOPO (1 = la plus forte) d'une route OpenStreetMap, d'après sa classe. */
export const IMPORTANCE_OSM = Object.freeze({
  motorway: 1, trunk: 1, primary: 2, secondary: 3, tertiary: 4, motorway_link: 3, trunk_link: 3, primary_link: 3, secondary_link: 4, tertiary_link: 5,
  unclassified: 5, residential: 5, living_street: 6, service: 6,
});
/** Ce qu'un véhicule léger ne parcourt pas. */
const NATURES_EXCLUES = new Set(['Sentier', 'Escalier', 'Piste cyclable']);
const HIGHWAY_EXCLUS = new Set(['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'bridleway', 'track', 'corridor', 'proposed', 'construction']);

const SENS_BDTOPO = Object.freeze({ direct: 'Sens direct', inverse: 'Sens inverse', double: 'Double sens' });

/** Les premières coordonnées d'une ligne, ou null (une `MultiLineString` n'est lue que par sa première ligne, comme le moteur). */
function ligneDe(geometrie) {
  if (!geometrie) return null;
  const l = geometrie.type === 'LineString' ? geometrie.coordinates : geometrie.type === 'MultiLineString' ? geometrie.coordinates[0] : null;
  return Array.isArray(l) && l.length >= 2 && l.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) ? l : null;
}

/**
 * Les entités d'une couche, au format que le moteur lit (tronçons BD TOPO). Une entité qui n'est pas une route carrossable est écartée ; le
 * sens vient de `sens_de_circulation` quand il est renseigné, sinon d'OpenStreetMap (`oneway`, `junction`, `highway`) ; l'importance, à défaut,
 * de la classe OpenStreetMap.
 * @param {object[]} entites  entités GeoJSON de la couche
 * @returns {{ troncons: object[], ecartes: number }}
 */
export function adapterTroncons(entites) {
  const troncons = []; let ecartes = 0;
  (entites || []).forEach((f, i) => {
    const ligne = ligneDe(f && f.geometry);
    const p = (f && f.properties) || {};
    if (!ligne || NATURES_EXCLUES.has(p.nature) || HIGHWAY_EXCLUS.has(String(p.highway || '').toLowerCase()) || p.acces_vehicule_leger === 'Physiquement impossible' || p.etat_de_l_objet === 'Projet') { ecartes++; return; }
    const sens = p.sens_de_circulation != null && p.sens_de_circulation !== '' ? p.sens_de_circulation : SENS_BDTOPO[sensOsm(p)];
    const importance = Number.isFinite(Number(p.importance)) && String(p.importance).trim() !== '' ? String(p.importance) : String(IMPORTANCE_OSM[String(p.highway || '').toLowerCase()] ?? 5);
    troncons.push({
      type: 'Feature',
      properties: { ...p, cleabs: p.cleabs || `atlas:${f.id ?? i}`, sens_de_circulation: sens, importance, position_par_rapport_au_sol: p.position_par_rapport_au_sol ?? '0', etat_de_l_objet: p.etat_de_l_objet || 'En service', acces_vehicule_leger: p.acces_vehicule_leger || 'Libre' },
      geometry: { type: 'LineString', coordinates: ligne },
    });
  });
  return { troncons, ecartes };
}

/** Le centre de la boîte englobante des tronçons, [lng, lat]. */
export function centreDe(troncons) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of troncons) for (const [x, y] of f.geometry.coordinates) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

/** La longueur des tronçons, en km (approximation plane autour du centre). */
export function longueurKm(troncons, centre = centreDe(troncons)) {
  const kx = 111320 * Math.cos((centre[1] * Math.PI) / 180), ky = 110574; let m = 0;
  for (const f of troncons) { const c = f.geometry.coordinates; for (let i = 1; i < c.length; i++) m += Math.hypot((c[i][0] - c[i - 1][0]) * kx, (c[i][1] - c[i - 1][1]) * ky); }
  return m / 1000;
}

/** Le nombre de véhicules pour une longueur de route et une densité (véhicules par km), borné. */
export function nombreDeVehicules(km, densite = DENSITE_DEFAUT) {
  const d = Number.isFinite(densite) && densite > 0 ? densite : DENSITE_DEFAUT;
  return Math.max(VEHICULES_MIN, Math.min(VEHICULES_MAX, Math.round(km * d)));
}

/** Des mètres du repère local du moteur (x est, y nord, autour de `centre`) vers [lng, lat]. */
export function versLngLat(centre, x, y) {
  return [centre[0] + x / (111320 * Math.cos((centre[1] * Math.PI) / 180)), centre[1] + y / 111320];
}

/** L'état instantané du moteur en points GeoJSON : un par véhicule, avec sa classe (`pl`) et son cap en degrés. */
export function instantane(sim, centre) {
  const features = [];
  for (const a of sim.agents) {
    const p = sim.position(a);
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    features.push({ type: 'Feature', properties: { pl: !!a.pl, cap: Number.isFinite(p[2]) ? Math.round(p[2]) : 0 }, geometry: { type: 'Point', coordinates: versLngLat(centre, p[0], p[1]) } });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Lance un trafic simulé sur des entités de routes.
 * @param {{ carte: object, entites: object[], densite?: number, graine?: number, vitesse?: number, idSource?: string,
 *   planifier?: Function, annuler?: Function, moteur?: object }} o
 *   `vitesse` : 1 = temps réel ; 4 = quatre pas du moteur par image (un trafic accéléré, plus coûteux)
 * @returns {{ demarrer: Function, arreter: Function, pause: Function, reprendre: Function, etat: Function }}
 */
export function creerTrafic({ carte, entites, densite = DENSITE_DEFAUT, graine = 1, vitesse = 1, idSource = ID_SOURCE, planifier = setInterval, annuler = clearInterval, moteur = Trafic } = {}) {
  const { troncons, ecartes } = adapterTroncons(entites);
  if (!troncons.length) throw new Error('aucune route exploitable dans cette couche (il faut des lignes : BD TOPO, routes OpenStreetMap)');
  const centre = centreDe(troncons);
  const graphe = moteur.construire(troncons, centre, {});
  if (!graphe.externes || !graphe.externes.length) throw new Error('le réseau de cette couche ne donne aucun tronçon roulant');
  const N = nombreDeVehicules(longueurKm(troncons, centre), densite);
  const sim = moteur.creer(graphe, { graine, N });
  const pas = Math.max(1, Math.min(8, Math.round(vitesse)));
  let minuterie = null, actif = false, pose = false;

  function poser() {
    if (pose) return;
    carte.addSource(idSource, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    carte.addLayer({ id: idSource, type: 'circle', source: idSource, paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 1.6, 16, 3.5, 19, 7],
      'circle-color': ['case', ['get', 'pl'], '#e07b00', '#1f5fd6'],
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 18, 1.2],
      'circle-pitch-alignment': 'map',
    } });
    pose = true;
  }
  function image() {
    for (let i = 0; i < pas; i++) sim.pas();
    const s = carte.getSource && carte.getSource(idSource);
    if (s && s.setData) s.setData(instantane(sim, centre));
  }
  const api = {
    demarrer() { if (actif) return api.etat(); poser(); actif = true; image(); minuterie = planifier(image, CADENCE_MS); return api.etat(); },
    pause() { if (minuterie != null) { annuler(minuterie); minuterie = null; } actif = false; return api.etat(); },
    reprendre() { if (actif) return api.etat(); poser(); actif = true; minuterie = planifier(image, CADENCE_MS); return api.etat(); },
    arreter() {
      if (minuterie != null) { annuler(minuterie); minuterie = null; }
      actif = false;
      if (pose) { try { if (carte.getLayer && carte.getLayer(idSource)) carte.removeLayer(idSource); if (carte.getSource && carte.getSource(idSource)) carte.removeSource(idSource); } catch (e) { /* carte déjà retirée */ } pose = false; }
      return api.etat();
    },
    etat() {
      const r = graphe.resume || {};
      return { actif, simule: true, vehicules: sim.agents.length, temps: Math.round(sim.t), densite, ecartes,
        reseau: { troncons: troncons.length, carrefours: r.carrefours ?? null, giratoires: r.anneaux ?? null, kmVoie: r.kmVoie != null ? +r.kmVoie.toFixed(1) : null } };
    },
    /** Pour les tests et la mesure : le moteur et son centre. */
    _sim: sim, _centre: centre,
  };
  return api;
}
