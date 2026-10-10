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
import { Trafic } from './trafic/index.js?v=20261011a';
import { sensOsm } from './itineraire.js?v=20261002a';
import { classerTroncon } from './modes-voie.js?v=20261011b';
import { creerInterpolateur, niveauDeDetail, visibles } from './trafic-rendu.js?v=20261011c';

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
const SENS_BDTOPO = Object.freeze({ direct: 'Sens direct', inverse: 'Sens inverse', double: 'Double sens' });

/** Les premières coordonnées d'une ligne, ou null (une `MultiLineString` n'est lue que par sa première ligne, comme le moteur). */
function ligneDe(geometrie) {
  if (!geometrie) return null;
  const l = geometrie.type === 'LineString' ? geometrie.coordinates : geometrie.type === 'MultiLineString' ? geometrie.coordinates[0] : null;
  return Array.isArray(l) && l.length >= 2 && l.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) ? l : null;
}

/**
 * Les entités d'une couche, au format que le moteur lit (tronçons BD TOPO). **Seules les routes ouvertes à la circulation roulent** : une allée de parc
 * (« route empierrée » à accès restreint aux ayants droit), un chemin, un sentier, un escalier, une piste cyclable, une voie ferrée, un tronçon à l'état
 * de projet ou physiquement impossible sont écartés, chacun pour son motif (`lib/modes-voie.js`). Le sens vient de `sens_de_circulation` quand il est
 * renseigné, sinon d'OpenStreetMap (`oneway`, `junction`, `highway`) ; l'importance, à défaut, de la classe OpenStreetMap.
 *
 * Une couche dont AUCUN tronçon ne dit ce qu'il est (ni `nature`, ni `highway`) — des lignes tracées à la main — est prise pour un réseau routier.
 * Dès qu'un tronçon se déclare, ceux qui ne le font pas sont écartés (`autre`).
 * @param {object[]} entites  entités GeoJSON de la couche
 * @param {{ acces?: 'libre'|'tous' }} [o]  `tous` : garde aussi les routes à accès restreint (voies privées, desserte) ; jamais les impossibles
 * @returns {{ troncons: object[], ecartes: number, motifs: Record<string, number> }}
 */
export function adapterTroncons(entites, { acces = 'libre' } = {}) {
  const troncons = []; const motifs = {};
  const ecarte = (m) => { motifs[m] = (motifs[m] || 0) + 1; };
  const liste = (entites || []).map((f, i) => ({ f, i, ligne: ligneDe(f && f.geometry), p: (f && f.properties) || {} }));
  const classes = liste.map((x) => classerTroncon(x.p));
  const aucuneClassee = classes.every((c) => c.mode === 'autre');
  liste.forEach(({ f, i, ligne, p }, k) => {
    if (!ligne) { ecarte('geometrie'); return; }
    const c = classes[k];
    let motif = c.motif;
    if (motif === 'autre' && aucuneClassee) motif = null;                       // des lignes sans attributs : un réseau tracé à la main
    if (motif === 'acces_restreint' && acces === 'tous') motif = null;
    if (motif) { ecarte(motif); return; }
    const sens = p.sens_de_circulation != null && p.sens_de_circulation !== '' ? p.sens_de_circulation : SENS_BDTOPO[sensOsm(p)];
    const importance = Number.isFinite(Number(p.importance)) && String(p.importance).trim() !== '' ? String(p.importance) : String(IMPORTANCE_OSM[String(p.highway || '').toLowerCase()] ?? 5);
    troncons.push({
      type: 'Feature',
      properties: { ...p, cleabs: p.cleabs || `atlas:${f.id ?? i}`, sens_de_circulation: sens, importance, position_par_rapport_au_sol: p.position_par_rapport_au_sol ?? '0', etat_de_l_objet: p.etat_de_l_objet || 'En service', acces_vehicule_leger: p.acces_vehicule_leger && p.acces_vehicule_leger !== 'Restreint aux ayants droit' ? p.acces_vehicule_leger : 'Libre' },
      geometry: { type: 'LineString', coordinates: ligne },
    });
  });
  const ecartes = Object.values(motifs).reduce((a, b) => a + b, 0);
  return { troncons, ecartes, motifs };
}

/** Ce que dit l'interface quand des tronçons sont écartés : « 12 écartés : 7 chemins, 5 accès restreint ». */
const LIBELLES_MOTIFS = Object.freeze({ chemin: 'chemins', sentier: 'sentiers', escalier: 'escaliers', cyclable: 'pistes cyclables', ferre: 'voies ferrées',
  acces_restreint: 'à accès restreint', acces_impossible: 'à accès impossible', projet: 'en projet', autre: 'non classés', geometrie: 'sans géométrie lisible' });
export function libelleMotifs(motifs) {
  const e = Object.entries(motifs || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!e.length) return '';
  const total = e.reduce((s, [, n]) => s + n, 0);
  return `${total} tronçon${total > 1 ? 's' : ''} écarté${total > 1 ? 's' : ''} : ${e.map(([m, n]) => `${n} ${LIBELLES_MOTIFS[m] || m}`).join(', ')}`;
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

/** Des [lng, lat] vers les mètres du repère local du moteur (l'inverse de `versLngLat`). */
export function versMetres(centre, lng, lat) {
  return [(lng - centre[0]) * 111320 * Math.cos((centre[1] * Math.PI) / 180), (lat - centre[1]) * 111320];
}

/** Les véhicules du moteur, en mètres locaux : { id, x, y, cap, pl }. */
export function positions(sim) {
  const out = [];
  for (const a of sim.agents) {
    const p = sim.position(a);
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    out.push({ id: a.id, x: p[0], y: p[1], cap: Number.isFinite(p[2]) ? p[2] : 0, pl: !!a.pl });
  }
  return out;
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
 *   acces?: 'libre'|'tous', planifier?: Function, annuler?: Function, moteur?: object, surErreur?: Function,
 *   planifierImage?: Function|null, annulerImage?: Function, maintenant?: Function, rendu3d?: object|null, surFin?: Function }} o
 *   `surErreur(erreur)` : appelée une fois quand le moteur échoue trois images de suite ; le trafic est alors arrêté (une exception à chaque image figerait la carte)
 *   `acces` : `libre` (défaut) ne fait rouler que les routes ouvertes à la circulation ; `tous` ajoute les routes à accès restreint
 *   `vitesse` : 1 = temps réel ; 4 = quatre pas du moteur par image (un trafic accéléré, plus coûteux)
 *   `planifier` / `annuler` : la minuterie du MOTEUR (un pas toutes les `CADENCE_MS`) ; `planifierImage` / `annulerImage` : la boucle de DESSIN
 *   (`requestAnimationFrame` par défaut), qui montre une position entre deux pas du moteur ; sans elle (tests, Node), le dessin suit chaque pas, sans lissage
 *   `rendu3d` : { disponible(): boolean, maj(vehicules), effacer() } ; dessine des modèles 3D à partir du zoom `ZOOM_3D` quand il est disponible
 *   `surFin()` : appelée quand le dessin est entièrement retiré (après un arrêt en douceur)
 * @returns {{ demarrer: Function, arreter: Function, pause: Function, reprendre: Function, etat: Function }}
 */
export function creerTrafic({ carte, entites, densite = DENSITE_DEFAUT, graine = 1, vitesse = 1, acces = 'libre', idSource = ID_SOURCE, planifier = setInterval, annuler = clearInterval, moteur = Trafic, surErreur = null,
  planifierImage = typeof requestAnimationFrame === 'function' ? (f) => requestAnimationFrame(f) : null, annulerImage = typeof cancelAnimationFrame === 'function' ? (i) => cancelAnimationFrame(i) : () => {},
  maintenant = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), rendu3d = null, surFin = null } = {}) {
  const { troncons, ecartes, motifs } = adapterTroncons(entites, { acces });
  if (!troncons.length) throw new Error('aucune route ouverte à la circulation dans cette couche' + (ecartes ? ` (${ecartes} tronçons écartés : ${Object.entries(motifs).map(([m, n]) => `${n} ${m.replace('_', ' ')}`).join(', ')})` : ' (il faut des lignes : BD TOPO, routes OpenStreetMap)'));
  const centre = centreDe(troncons);
  const graphe = moteur.construire(troncons, centre, {});
  if (!graphe.externes || !graphe.externes.length) throw new Error('le réseau de cette couche ne donne aucun tronçon roulant');
  const N = nombreDeVehicules(longueurKm(troncons, centre), densite);
  const sim = moteur.creer(graphe, { graine, N });
  const pas = Math.max(1, Math.min(8, Math.round(vitesse)));
  const lisse = typeof planifierImage === 'function';   // dessin lissé entre deux pas, à chaque image de la carte
  const interp = creerInterpolateur();
  let minuterie = null, actif = false, pose = false, boucle = null, sortie = false, niveau = null, tDessin = -Infinity, images = 0;

  function poser() {
    if (pose) return;
    carte.addSource(idSource, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    carte.addLayer({ id: idSource, type: 'circle', source: idSource, paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 1.6, 16, 3.5, 19, 7],
      // une voiture blanche cerclée de sombre, un poids lourd orange : lisibles sur une route bleue comme sur un fond clair
      'circle-color': ['case', ['get', 'pl'], '#e07b00', '#ffffff'],
      'circle-opacity': ['get', 'o'], 'circle-stroke-opacity': ['get', 'o'],
      'circle-stroke-color': '#16233b', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 0.6, 18, 1.4],
      'circle-pitch-alignment': 'map',
    } });
    pose = true;
  }
  function pointsDe(liste) {
    return { type: 'FeatureCollection', features: liste.map((v) => ({ type: 'Feature', properties: { pl: v.pl, cap: Math.round(v.cap), o: +v.o.toFixed(2) }, geometry: { type: 'Point', coordinates: versLngLat(centre, v.x, v.y) } })) };
  }
  /** La boîte visible de la carte, en mètres locaux (null quand la carte ne la donne pas). */
  function boiteVisible() {
    try {
      const b = carte.getBounds && carte.getBounds(); if (!b) return null;
      const [x0, y0] = versMetres(centre, b.getWest(), b.getSouth()), [x1, y1] = versMetres(centre, b.getEast(), b.getNorth());
      return Number.isFinite(x0 + y0 + x1 + y1) ? { x0, y0, x1, y1 } : null;
    } catch (e) { return null; }
  }
  function ecrire(liste) {
    const s = carte.getSource && carte.getSource(idSource);
    if (s && s.setData) s.setData(pointsDe(liste));
  }
  /** Ce que montre la carte à cet instant : le niveau de détail dépend du zoom, et seuls les véhicules visibles sont envoyés. */
  function dessiner(t, direct) {
    const zoom = carte.getZoom ? carte.getZoom() : NaN;
    const avec3d = !!(rendu3d && rendu3d.disponible && rendu3d.disponible());
    const n = direct ? 'points' : niveauDeDetail(zoom, { avec3d });
    if (n !== niveau) {   // un changement de niveau vide ce qui n'est plus montré
      if (n !== '3d' && rendu3d && niveau === '3d') rendu3d.effacer();
      if (n !== 'points') ecrire([]);
      niveau = n;
    }
    if (n === 'aucun') return;
    const liste = direct ? positions(sim).map((v) => ({ ...v, o: 1 })) : visibles(interp.echantillonner(t), boiteVisible());
    if (n === '3d') {
      rendu3d.maj(liste.map((v) => ({ ...v, lnglat: versLngLat(centre, v.x, v.y) })));
      if (carte.triggerRepaint) carte.triggerRepaint();
    } else ecrire(liste);
    images++;
  }
  function pasMoteur() {
    for (let i = 0; i < pas; i++) sim.pas();
    interp.pousser(maintenant(), positions(sim));
  }
  function boucleDessin() {
    boucle = null;
    if (!actif && !sortie) return;
    const t = maintenant();
    // 30 images par seconde suffisent à un mouvement fluide et laissent à la carte le temps de ses propres rendus
    if (t - tDessin >= 30) { tDessin = t; try { dessiner(t, false); } catch (e) { fin(e); return; } }
    if (sortie && interp.taille === 0) { retirer(); return; }
    boucle = planifierImage(boucleDessin);
  }
  function lancerBoucle() { if (lisse && boucle == null) boucle = planifierImage(boucleDessin); }
  function arretBoucle() { if (boucle != null) { annulerImage(boucle); boucle = null; } }

  let echecs = 0, derniereErreur = null;
  function fin(e) { derniereErreur = e; api.arreter(); if (surErreur) surErreur(e); }
  function image() {
    try {
      pasMoteur();
      if (!lisse) dessiner(maintenant(), true);
      echecs = 0;
    } catch (e) {
      // une exception à chaque image (cinq par seconde) saturerait la console et la page : au troisième échec de suite, on arrête et on le dit
      derniereErreur = e; echecs++;
      if (echecs >= 3) { api.arreter(); if (surErreur) surErreur(e); }
    }
  }
  function retirer() {
    arretBoucle(); sortie = false; interp.vider(); niveau = null;
    if (rendu3d) { try { rendu3d.effacer(); } catch (e) { /* rendu 3D déjà libéré */ } }
    if (pose) { try { if (carte.getLayer && carte.getLayer(idSource)) carte.removeLayer(idSource); if (carte.getSource && carte.getSource(idSource)) carte.removeSource(idSource); } catch (e) { /* carte déjà retirée */ } pose = false; }
    if (surFin) surFin();
  }
  const api = {
    demarrer() { if (actif) return api.etat(); poser(); actif = true; sortie = false; image(); lancerBoucle(); minuterie = planifier(image, CADENCE_MS); return api.etat(); },
    pause() { if (minuterie != null) { annuler(minuterie); minuterie = null; } actif = false; arretBoucle(); return api.etat(); },
    reprendre() { if (actif) return api.etat(); poser(); actif = true; lancerBoucle(); minuterie = planifier(image, CADENCE_MS); return api.etat(); },
    /** @param {{ doucement?: boolean }} [o]  `doucement` : les véhicules s'effacent en fondu avant que la couche soit retirée */
    arreter({ doucement = false } = {}) {
      if (minuterie != null) { annuler(minuterie); minuterie = null; }
      const etaitActif = actif; actif = false;
      if (doucement && lisse && pose && etaitActif && niveau !== 'aucun') { sortie = true; interp.tousSortent(maintenant()); lancerBoucle(); return api.etat(); }
      retirer();
      return api.etat();
    },
    etat() {
      const r = graphe.resume || {};
      return { actif, simule: true, erreur: derniereErreur ? String(derniereErreur.message || derniereErreur) : null, vehicules: sim.agents.length, temps: Math.round(sim.t), densite, acces, ecartes, motifs, ecartesTexte: libelleMotifs(motifs),
        rendu: niveau, images,
        reseau: { troncons: troncons.length, carrefours: r.carrefours ?? null, giratoires: r.anneaux ?? null, kmVoie: r.kmVoie != null ? +r.kmVoie.toFixed(1) : null } };
    },
    /** Pour les tests et la mesure : le moteur et son centre. */
    _sim: sim, _centre: centre,
  };
  return api;
}
