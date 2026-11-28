/**
 * Une table PostgreSQL « en direct » : la zone visible de la carte est relue auprès de pg-gateway à chaque déplacement.
 *
 * ## Pourquoi un `fetch` du widget et pas une adresse donnée à MapLibre
 *
 * MapLibre lit lui-même l'adresse d'une source GeoJSON, sans en-tête, et ne sait pas rejouer une requête après un 401. Ici le
 * widget lit la couche avec le jeton (`pg-passerelle.js`, qui rejoue UNE fois après avoir redemandé le jeton) puis donne les
 * données à la source (`setData`). Le jeton ne passe donc jamais par la carte.
 *
 * ## Ce que c'est, et n'est pas (phase 2)
 *  - une couche de SESSION : elle n'est écrite nulle part dans le document (ni table, ni `Maquette_Layers`, ni `SceneManifest`) ;
 *    au rechargement de la page, elle a disparu ;
 *  - elle n'est pas dans le panneau Couches d'Atlas : le panneau d'import la liste et la retire ;
 *  - lecture seule : pas de fiche d'entité, pas de symbologie.
 *
 * Une réponse arrivée après une réponse plus récente est ignorée (déplacements rapprochés). Un résultat tronqué reste affiché,
 * avec l'avertissement « zoomez » : une couche incomplète qui se croit complète ressemble à une couche complète.
 *
 * Module sans DOM : la carte, le client et le minuteur sont injectés ; il se teste sous Node.
 */

import { bboxDepuisBornes, texteErreur } from './pg-passerelle.js?v=20261122b';

export const DELAI_ANTIREBOND_MS = 400;
export const LIMITE_DIRECT = 5000;

/**
 * L'emprise [ouest, sud, est, nord] d'une liste d'entités GeoJSON (WGS84), ou `null` s'il n'y a aucune coordonnée : de quoi cadrer une couche directe sur ce qui est chargé.
 */
export function empriseEntites(entites) {
  let ouest = Infinity; let sud = Infinity; let est = -Infinity; let nord = -Infinity;
  const parcourir = (c) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) return;
      ouest = Math.min(ouest, c[0]); est = Math.max(est, c[0]); sud = Math.min(sud, c[1]); nord = Math.max(nord, c[1]);
      return;
    }
    for (const x of c) parcourir(x);
  };
  for (const e of entites || []) {
    const g = e && e.geometry;
    if (!g) continue;
    if (g.type === 'GeometryCollection') { for (const sous of g.geometries || []) parcourir(sous && sous.coordinates); } else parcourir(g.coordinates);
  }
  return Number.isFinite(ouest) ? [ouest, sud, est, nord] : null;
}

const VIDE = Object.freeze({ type: 'FeatureCollection', features: [] });
const SURFACES = ['Polygon', 'MultiPolygon'];
const LIGNES = ['LineString', 'MultiLineString'];
const POINTS = ['Point', 'MultiPoint'];

const typeIn = (types) => ['in', ['geometry-type'], ['literal', types]];

/** Les identifiants MapLibre d'une couche directe. */
export function identifiantsDirects(id) {
  const base = `pg-direct-${id}`;
  return { source: base, surface: `${base}-surface`, ligne: `${base}-ligne`, point: `${base}-point` };
}

/** Les couches MapLibre qui dessinent la source : surfaces (remplissage), contours et lignes, points. */
export function couchesDirectes(id, couleur) {
  const ids = identifiantsDirects(id);
  return [
    { id: ids.surface, type: 'fill', source: ids.source, filter: typeIn(SURFACES), paint: { 'fill-color': couleur, 'fill-opacity': 0.3 } },
    { id: ids.ligne, type: 'line', source: ids.source, filter: typeIn([...LIGNES, ...SURFACES]), paint: { 'line-color': couleur, 'line-width': 1.5 } },
    { id: ids.point, type: 'circle', source: ids.source, filter: typeIn(POINTS), paint: { 'circle-color': couleur, 'circle-radius': 4, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 } },
  ];
}

/** Le texte d'état montré à la personne. */
export function libelleEtat(etat) {
  if (etat.phase === 'lecture') return 'lecture de la zone visible…';
  if (etat.phase === 'erreur') return etat.erreur;
  if (etat.phase === 'ok') {
    if (etat.message) return etat.message; // le mode tuiles dit lui-même ce qu'il montre (zoom minimal, entités affichées)
    const n = `${Number(etat.nb).toLocaleString('fr-FR')} entité${etat.nb > 1 ? 's' : ''}`;
    return etat.tronque ? `${n} (tronqué : zoomez)` : n;
  }
  return '';
}

/**
 * @param {object} o
 * @param {object} o.carte  carte MapLibre (`on`, `off`, `getBounds`, `getSource`, `addSource`, `addLayer`, `getLayer`, `removeLayer`, `removeSource`)
 * @param {{couche: (e:object)=>Promise<object>}} o.client  le client de la passerelle (`pg-passerelle.js`)
 * @param {{connexion:string, schema:string, table:string}} o.params
 * @param {string} o.id  identifiant unique de la couche
 * @param {string} [o.couleur]
 * @param {number} [o.limite]
 * @param {number} [o.delai]  anti-rebond, en ms
 * @param {{set: Function, clear: Function}} [o.minuteur]
 * @param {(etat: object) => void} [o.surEtat]
 */
export function creerCoucheDirecte({
  carte, client, params, id, couleur = '#d62728', limite = LIMITE_DIRECT, delai = DELAI_ANTIREBOND_MS,
  minuteur = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) }, surEtat = () => {}, rendu = null,
}) {
  // `rendu` : l'hôte porte une VRAIE couche (symbologie, fiche, ordre : pg-couche-atlas.js). Le module garde les lectures, l'hôte dessine :
  // `rendu.surDonnees(entites)` remplace `setData`, `rendu.ids` remplace les identifiants MapLibre, et `arreter` ne retire rien de la carte.
  const ids = rendu ? rendu.ids : identifiantsDirects(id);
  const etat = { phase: 'repos', nb: 0, tronque: false, avertissements: [], erreur: '' };
  let sequence = 0;
  let attente = null;
  let actif = false;
  let dernieres = []; // les entités de la dernière lecture réussie : de quoi cadrer la couche

  const publier = () => surEtat({ ...etat, avertissements: [...etat.avertissements] });

  function monter() {
    if (rendu) return;
    if (!carte.getSource(ids.source)) carte.addSource(ids.source, { type: 'geojson', data: VIDE });
    for (const c of couchesDirectes(id, couleur)) if (!carte.getLayer(c.id)) carte.addLayer(c);
  }

  async function lire() {
    const mienne = ++sequence;
    etat.phase = 'lecture';
    publier();
    try {
      const fc = await client.couche({ ...params, bbox: bboxDepuisBornes(carte.getBounds()), limite });
      if (!actif || mienne !== sequence) return; // arrêtée, ou dépassée par une lecture plus récente
      dernieres = fc.features || [];
      if (rendu) rendu.surDonnees(dernieres, { tronque: !!fc.tronque });
      else {
        monter();
        carte.getSource(ids.source).setData({ type: 'FeatureCollection', features: dernieres });
      }
      etat.phase = 'ok';
      etat.nb = fc.nb_entites != null ? fc.nb_entites : (fc.features || []).length;
      etat.tronque = !!fc.tronque;
      etat.avertissements = fc.avertissements || [];
      etat.erreur = '';
    } catch (e) {
      if (!actif || mienne !== sequence) return;
      // Les données déjà affichées restent : une panne passagère n'efface pas la carte, elle se dit.
      etat.phase = 'erreur';
      etat.erreur = texteErreur(e);
    }
    publier();
  }

  function planifier() {
    if (attente !== null) minuteur.clear(attente);
    attente = minuteur.set(() => { attente = null; lire(); }, delai);
  }

  // Un changement de fond de plan recrée le style : la source et les couches sont à reposer.
  function apresStyle() {
    if (!actif) return;
    monter();
    lire();
  }

  return {
    id,
    params,
    etat,
    ids,
    /** Dessine la couche et lit la zone visible. */
    demarrer() {
      if (actif) return lire();
      actif = true;
      monter();
      carte.on('moveend', planifier);
      carte.on('style.load', apresStyle);
      return lire();
    },
    /** Relit tout de suite (après une erreur, par exemple). */
    relire: lire,
    /** Les entités de la dernière lecture réussie (pour cadrer la couche). */
    entites: () => dernieres,
    /** Retire la couche de la carte : plus de lecture, plus d'écouteur. */
    arreter() {
      actif = false;
      sequence++; // une réponse en vol sera ignorée
      if (attente !== null) { minuteur.clear(attente); attente = null; }
      carte.off('moveend', planifier);
      carte.off('style.load', apresStyle);
      if (rendu) return; // la couche est celle de l'hôte : c'est lui qui la retire
      for (const c of [ids.point, ids.ligne, ids.surface]) if (carte.getLayer(c)) carte.removeLayer(c);
      if (carte.getSource(ids.source)) carte.removeSource(ids.source);
    },
  };
}
