/**
 * Une grille d'altitudes pour l'hôte (commande `getElevationGrid`, contrat 0.8) : une page qui fait de l'hydrologie (écoulement, bassin versant) ou un profil en long a besoin
 * des altitudes elles-mêmes, pas d'un fichier 3D qui les contient à une résolution moyenne.
 *
 * Module pur : il ne lit ni la carte ni le réseau, il reçoit une fonction `altitudeEn(lng, lat)` (mètres, ou null quand le relief n'y est pas chargé). Le runtime l'alimente
 * avec le relief que la carte a chargé : jamais de requête de plus, jamais une grille de zéros. Sans relief, la commande refuse avec le code `relief_absent`.
 *
 * Forme de la réponse : voir `grilleDAltitudes`. Les valeurs sont rangées ligne par ligne, du NORD au SUD, de l'OUEST à l'EST, une cellule = une altitude au centre de la cellule.
 */
export const VERSION = '1.0.0';

export const CELLULES_MAX = 250000;       // 500 x 500 cellules
export const COTE_MAX = 2000;             // cellules sur un côté
export const RESOLUTION_MIN = 1;          // mètres
export const RESOLUTION_MAX = 1000;
export const SANS_DONNEE = -9999;
export const APPELS_PAR_SECONDE = 2;

/** Ce que la grille doit à sa source, dit dans chaque réponse : les altitudes ne sont pas à nous. */
export const SOURCE_RELIEF = Object.freeze({
  nom: 'Relief : Mapzen / AWS Terrain Tiles',
  url: 'https://registry.opendata.aws/terrain-tiles/',
  licence: "Sources multiples sous leurs licences propres (domaine public avec mention pour SRTM, 3DEP et ETOPO1 ; CC BY ou licences ouvertes nationales ailleurs) : attribution exigée. Détail par pays : https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
  mention: 'Relief : Mapzen / AWS Terrain Tiles',
});

const fini = (v) => typeof v === 'number' && Number.isFinite(v);
const M_PAR_DEGRE = 111320;

/** La largeur et la hauteur (mètres) d'une emprise, à sa latitude moyenne. */
export function dimensionsMetres(bbox) {
  const lat = (bbox[1] + bbox[3]) / 2;
  return { largeur: (bbox[2] - bbox[0]) * M_PAR_DEGRE * Math.cos((lat * Math.PI) / 180), hauteur: (bbox[3] - bbox[1]) * M_PAR_DEGRE };
}

/**
 * Les options de la commande, vérifiées ; lève une erreur lisible dont le code est le premier mot.
 * `defautBbox` : l'emprise de la vue, quand l'hôte n'en donne pas.
 * @returns {{ bbox:number[], resolution:number, colonnes:number, lignes:number }}
 */
export function normaliserOptionsElevation(o, defautBbox) {
  const options = o === undefined ? {} : o;
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error("getElevationGrid : un objet d'options est attendu ({ bbox, resolution })");
  for (const k of Object.keys(options)) if (!['bbox', 'resolution'].includes(k)) throw new Error('getElevationGrid : option inconnue « ' + String(k).slice(0, 30) + ' » (bbox, resolution)');
  let bbox = options.bbox;
  if (bbox === undefined) bbox = defautBbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(fini) || bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -85 || bbox[3] > 85 || !(bbox[0] < bbox[2]) || !(bbox[1] < bbox[3])) {
    throw new Error('getElevationGrid : emprise_invalide : bbox mal formée (ouest, sud, est, nord ; latitudes de -85 à 85)');
  }
  const resolution = options.resolution === undefined ? 30 : options.resolution;
  if (!fini(resolution) || resolution < RESOLUTION_MIN || resolution > RESOLUTION_MAX) throw new Error('getElevationGrid : resolution_invalide : ' + RESOLUTION_MIN + ' à ' + RESOLUTION_MAX + ' mètres');
  const { largeur, hauteur } = dimensionsMetres(bbox);
  const colonnes = Math.max(1, Math.ceil(largeur / resolution)), lignes = Math.max(1, Math.ceil(hauteur / resolution));
  if (colonnes > COTE_MAX || lignes > COTE_MAX || colonnes * lignes > CELLULES_MAX) {
    const minimale = Math.ceil(Math.sqrt((largeur * hauteur) / CELLULES_MAX) * 10) / 10;
    throw new Error('getElevationGrid : grille_trop_grande : ' + colonnes + ' x ' + lignes + ' cellules (plafond ' + CELLULES_MAX + ') ; réduire l\'emprise ou prendre une résolution d\'au moins ' + Math.max(minimale, RESOLUTION_MIN) + ' m');
  }
  return { bbox: [...bbox], resolution, colonnes, lignes };
}

/** Une limite d'appels par seconde, sans horloge globale : `creerLimiteur(maintenant)()` rend vrai si l'appel passe. */
export function creerLimiteur(maintenant = () => Date.now(), parSeconde = APPELS_PAR_SECONDE) {
  const instants = [];
  return () => {
    const t = maintenant();
    while (instants.length && t - instants[0] >= 1000) instants.shift();
    if (instants.length >= parSeconde) return false;
    instants.push(t); return true;
  };
}

/** La résolution d'une tuile d'altitude (mètres par pixel, tuiles de 256 px) au zoom `z` à la latitude `lat`. */
export const metresParPixelTuile256 = (z, lat) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

/**
 * @param {{ bbox:number[], resolution:number, colonnes:number, lignes:number }} opt  options normalisées
 * @param {(lng:number, lat:number) => (number|null)} altitudeEn  l'altitude en mètres, ou null quand le relief n'y est pas chargé
 * @param {{ pasNatifM?: (number|null), exageration?: number, zoomRelief?: (number|null) }} [contexte]
 * @returns {object} la réponse de la commande
 */
export function grilleDAltitudes(opt, altitudeEn, contexte = {}) {
  const { bbox, colonnes, lignes } = opt;
  const dLng = (bbox[2] - bbox[0]) / colonnes, dLat = (bbox[3] - bbox[1]) / lignes;
  const valeurs = new Array(colonnes * lignes);
  let min = Infinity, max = -Infinity, vides = 0;
  for (let j = 0; j < lignes; j++) {
    const lat = bbox[3] - (j + 0.5) * dLat;
    for (let i = 0; i < colonnes; i++) {
      const lng = bbox[0] + (i + 0.5) * dLng;
      const a = altitudeEn(lng, lat);
      if (!fini(a)) { valeurs[j * colonnes + i] = SANS_DONNEE; vides++; continue; }
      const v = Math.round(a * 100) / 100;
      valeurs[j * colonnes + i] = v;
      if (v < min) min = v; if (v > max) max = v;
    }
  }
  const total = colonnes * lignes;
  const dims = dimensionsMetres(bbox);
  const avertissements = [];
  if (vides === total) throw new Error("getElevationGrid : relief_non_charge : aucune altitude lisible dans l'emprise (les tuiles d'altitude ne sont pas chargées ici : cadrer la carte sur la zone, attendre le chargement, puis redemander)");
  if (vides) avertissements.push('sans-donnee : ' + vides + ' cellule(s) sur ' + total + " sans altitude chargée (valeur " + SANS_DONNEE + ') ; cadrer la carte sur la zone pour les charger');
  if (contexte.pasNatifM && contexte.pasNatifM > opt.resolution * 1.5) avertissements.push('resolution-plus-fine-que-le-relief : le relief chargé a un pas natif d\'environ ' + Math.round(contexte.pasNatifM) + ' m, plus grossier que les ' + opt.resolution + ' m demandés (zoomer la carte sur la zone donne un relief plus fin, jusqu\'à environ 10 m)');
  return {
    format: 'grille-altitudes/1',
    colonnes, lignes,
    bbox: [...bbox],
    pas: { x_m: Math.round((dims.largeur / colonnes) * 100) / 100, y_m: Math.round((dims.hauteur / lignes) * 100) / 100, x_deg: dLng, y_deg: dLat },
    resolution_demandee_m: opt.resolution,
    pas_natif_m: contexte.pasNatifM ? Math.round(contexte.pasNatifM * 10) / 10 : null,
    unite: 'm',
    sans_donnee: SANS_DONNEE,
    repere: { horizontal: 'EPSG:4326 (WGS 84), longitude puis latitude', vertical: 'altitude au-dessus du niveau moyen de la mer (modèle des tuiles Terrarium), exagération du relief retirée', ordre: 'ligne par ligne du nord au sud, de l\'ouest à l\'est ; une valeur par centre de cellule' },
    source: { ...SOURCE_RELIEF, zoom: contexte.zoomRelief === undefined ? null : contexte.zoomRelief },
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null,
    sans_donnee_nb: vides,
    valeurs,
    avertissements,
  };
}
