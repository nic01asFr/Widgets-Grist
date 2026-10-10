/**
 * Importer des données de l'IGN (BD TOPO, Admin Express) par le WFS de la Géoplateforme.
 *
 * Module PUR : il décrit ce qu'on peut importer (les jeux), construit les requêtes, normalise les objets reçus vers
 * le format de couche d'Atlas, dit d'où viennent les données (source, licence, attribution) et refuse ce qui ne doit
 * pas partir. Il n'ouvre aucune connexion et ne touche ni la carte ni la page : le client WFS (`reseau/wfs-bdtopo.js`)
 * lit, `import-lots.js` conduit l'import, `vue-import-ign.js` l'affiche.
 *
 * ## Ce qui a été vérifié, et comment
 *
 * Chaque nom de couche et d'attribut d'un jeu ci-dessous a été relevé par une requête réelle au WFS le 10/10/2026
 * (une page de quelques objets en ville, à Marseille, et à la campagne, en Ardèche ; la liste des couches par
 * `GetCapabilities`). Les réponses, réduites à quelques objets, sont les fixtures de `tests/fixtures/import-ign/` :
 * un test vérifie que chaque attribut retenu y figure, si bien qu'une faute de frappe ne passe pas.
 *
 * Ce que ces mesures ont appris, et que le module applique :
 *
 * - l'emprise se donne par `BBOX=lon,lat,lon,lat,EPSG:4326` (le filtre CQL `BBOX` renvoie zéro objet sans erreur) ;
 * - `SORTBY=cleabs` est obligatoire dès qu'on pagine ;
 * - les erreurs sont du XML (`ows:ExceptionReport`), jamais du JSON ;
 * - les positions portent une altitude (`[lon, lat, z]`) : elle est retirée ;
 * - `resultType=hits` rend le nombre d'objets sans les envoyer : c'est l'estimation avant l'import ;
 * - les « Multi » ont souvent une seule partie : on les rend simples, la géométrie reste une par objet ;
 * - `hauteur` des bâtiments n'est pas toujours renseignée (99,9 % en ville, 96,1 % à la campagne sur 1 000
 *   bâtiments) : un bâtiment sans hauteur reste importé, à plat.
 *
 * ## L'identité et la mise à jour
 *
 * `cleabs` est l'identifiant stable d'un objet de la BD TOPO d'une édition à la suivante, et `date_modification` dit
 * quand il a changé. Les deux sont gardés tels quels dans les propriétés : c'est ce qui permettra, plus tard, de
 * mettre à jour une couche déjà importée sans la refaire (comparer les clés, ne reprendre que ce qui a changé).
 *
 * ## La licence
 *
 * Les données sont sous Licence Ouverte 2.0 : citer l'IGN comme source. La couche porte sa provenance
 * (`metadonneesCouche`) et son attribution, que la carte affiche.
 */

import { compterHits, lirePages, ErreurWfs, URL_WFS } from './reseau/wfs-bdtopo.js';
import { TYPES, typeDeVoie } from './modes-voie.js?v=1.16.3';

export { URL_WFS };

/** La licence des données, et où la lire. */
export const LICENCE = Object.freeze({
  nom: 'Licence Ouverte 2.0',
  url: 'https://github.com/etalab/licence-ouverte/blob/master/LO.md',
  conditions: 'https://cartes.gouv.fr/cgu/',
});

/**
 * L'édition que le service annonçait, relevée dans son `GetCapabilities` (résumé de chaque couche BD TOPO :
 * « Bâtiments − BDTOPO® V3 2026-06-15 »). Ce n'est pas une constante du service : elle change à chaque édition. On la
 * garde pour dire AU MOINS quelque chose de daté ; l'import dit en plus, lui, la plus récente modification qu'il a vue.
 */
export const EDITION_ANNONCEE = Object.freeze({
  bdtopo: { edition: '2026-06-15', relevee: '2026-10-10' },
  admin: { edition: null, relevee: '2026-10-10' },
});

const MENTION_RETARD = 'Le WFS de la Géoplateforme sert l’édition trimestrielle de la BD TOPO avec du retard : le jeu '
  + 'téléchargeable ou le calcul d’itinéraire de la Géoplateforme peuvent être plus récents d’un trimestre.';

/** Les produits : de quoi composer la mention de source et l'avertissement. */
export const PRODUITS = Object.freeze({
  bdtopo: Object.freeze({
    id: 'bdtopo', nom: 'BD TOPO®', producteur: 'IGN', mention: '© IGN — BD TOPO® (Licence Ouverte 2.0)',
    avertissementEdition: MENTION_RETARD,
  }),
  admin: Object.freeze({
    id: 'admin', nom: 'ADMIN EXPRESS', producteur: 'IGN', mention: '© IGN — ADMIN EXPRESS (Licence Ouverte 2.0)',
    avertissementEdition: 'Dernière édition publiée sur la Géoplateforme au moment de l’import ; la population est celle du recensement indiqué sur chaque commune.',
  }),
});

/** Les types de voie (route, chemin, sentier, escalier, piste cyclable, voie ferrée) : une couleur chacun, pour ne pas confondre une allée de parc et une route. */
const categoriesTypeDeVoie = () => TYPES.map((t) => ({ valeur: t.libelle, couleur: t.couleur, libelle: t.libelle }));

/**
 * Le catalogue.
 *
 * Un jeu est un objet : `couche` (nom complet côté service), `famille` (la forme que le jeu donne à la couche :
 * `Point`, `LineString` ou `Polygon`), `attributs` (ce qu'on garde, dans cet ordre), `page` (objets par page : plus
 * petit quand chaque objet pèse lourd), `coteMaxDeg` (côté maximal de l'emprise, en degrés), `style` (déclaratif,
 * appliqué par l'interface, voir `styleDeCouche`), `ordreDeGrandeur` (ce que les mesures ont donné) et
 * `avertissements`.
 *
 * Pour ajouter un jeu : relever l'attribut et la couche sur le service, reporter les noms ici, mettre un extrait réel
 * dans `tests/fixtures/import-ign/<couche>.json` et l'ajouter à `FIXTURES` dans `tests/import-ign.test.js`.
 */
export const PRESETS = Object.freeze({
  routes: {
    id: 'routes', libelle: 'Routes', icone: 'route', groupe: 'Réseaux', produit: 'bdtopo',
    description: 'Tronçons de route : type de voie (route, chemin, sentier, escalier, piste cyclable), importance, sens de circulation, nombre de voies.',
    couche: 'BDTOPO_V3:troncon_de_route', famille: 'LineString', nomCouche: 'Routes IGN',
    attributs: ['cleabs', 'nature', 'nom_collaboratif_gauche', 'nom_collaboratif_droite', 'nom_voie_ban_gauche', 'importance',
      'sens_de_circulation', 'nombre_de_voies', 'largeur_de_chaussee', 'vitesse_moyenne_vl', 'position_par_rapport_au_sol',
      'acces_vehicule_leger', 'urbain', 'cpx_numero', 'cpx_classement_administratif', 'etat_de_l_objet', 'date_modification'],
    page: 2000, coteMaxDeg: 0.5,
    // `type_de_voie` n'est pas un attribut de la BD TOPO : il est DÉRIVÉ de `nature` et de `acces_vehicule_leger` (lib/modes-voie.js). La largeur garde l'importance.
    derives: { type_de_voie: typeDeVoie },
    style: { couleur: { champ: 'type_de_voie', categories: categoriesTypeDeVoie(), defaut: '#757575' }, largeur: { champ: 'importance', plage: [7, 1.5] } },
    ordreDeGrandeur: 'Environ 700 tronçons au km² en ville (459 sur 0,6 km² à Marseille).',
    avertissements: [],
  },
  batiments: {
    id: 'batiments', libelle: 'Bâtiments', icone: 'batiment', groupe: 'Bâti', produit: 'bdtopo',
    description: 'Emprises des bâtiments, extrudées par leur hauteur.',
    couche: 'BDTOPO_V3:batiment', famille: 'Polygon', nomCouche: 'Bâtiments IGN',
    attributs: ['cleabs', 'nature', 'usage_1', 'usage_2', 'hauteur', 'nombre_d_etages', 'nombre_de_logements', 'materiaux_des_murs',
      'materiaux_de_la_toiture', 'altitude_minimale_sol', 'altitude_maximale_toit', 'identifiants_rnb', 'etat_de_l_objet', 'date_modification'],
    page: 2000, coteMaxDeg: 0.5,
    style: { polygone: 'extrude', hauteur: 'hauteur', couleur: { valeur: '#c9b8a6' } },
    ordreDeGrandeur: 'Environ 3 500 bâtiments au km² en centre-ville (2 178 sur 0,6 km² à Marseille), 2 333 sur 6 km² à la campagne.',
    avertissements: ['La hauteur (photogrammétrique) n’est pas toujours renseignée : 99,9 % en ville, 96 % à la campagne sur 1 000 bâtiments. Un bâtiment sans hauteur reste importé, à plat.'],
  },
  cours_d_eau: {
    id: 'cours_d_eau', libelle: 'Cours d’eau', icone: 'eau', groupe: 'Eau', produit: 'bdtopo',
    description: 'Cours d’eau nommés (un objet par cours d’eau, en plusieurs parties).',
    couche: 'BDTOPO_V3:cours_d_eau', famille: 'LineString', nomCouche: 'Cours d’eau IGN',
    attributs: ['cleabs', 'toponyme', 'importance', 'statut', 'code_hydrographique', 'date_modification'],
    page: 500, coteMaxDeg: 1,
    style: { couleur: { valeur: '#2b7bba' }, largeur: { valeur: 2.5 }, etiquette: 'toponyme' },
    ordreDeGrandeur: '13 cours d’eau sur 4 × 4 km en Ardèche.',
    avertissements: ['Un objet est un cours d’eau entier : sa géométrie peut dépasser l’emprise demandée.'],
  },
  plans_d_eau: {
    id: 'plans_d_eau', libelle: 'Plans d’eau', icone: 'plan_eau', groupe: 'Eau', produit: 'bdtopo',
    description: 'Lacs, étangs, réservoirs nommés.',
    couche: 'BDTOPO_V3:plan_d_eau', famille: 'Polygon', nomCouche: 'Plans d’eau IGN',
    attributs: ['cleabs', 'nature', 'toponyme', 'importance', 'code_hydrographique', 'date_modification'],
    page: 200, coteMaxDeg: 1,
    style: { polygone: 'flat', couleur: { valeur: '#4f9bd1' }, etiquette: 'toponyme' },
    ordreDeGrandeur: 'Quelques objets par zone : un seul sur le lac du Bourget et ses environs.',
    avertissements: ['Seuls les plans d’eau recensés par leur nom sont dans ce jeu ; pour toutes les surfaces en eau, voir « Surfaces en eau ».'],
  },
  surfaces_en_eau: {
    id: 'surfaces_en_eau', libelle: 'Surfaces en eau', icone: 'surface_eau', groupe: 'Eau', produit: 'bdtopo',
    description: 'Surfaces hydrographiques : rivières larges, plans d’eau, bassins.',
    couche: 'BDTOPO_V3:surface_hydrographique', famille: 'Polygon', nomCouche: 'Surfaces en eau IGN',
    attributs: ['cleabs', 'nature', 'persistance', 'statut', 'code_hydrographique', 'date_modification'],
    page: 1000, coteMaxDeg: 0.5,
    style: { polygone: 'flat', couleur: { valeur: '#6baed6' } },
    ordreDeGrandeur: '46 surfaces sur 4 × 4 km en Ardèche.',
    avertissements: [],
  },
  vegetation: {
    id: 'vegetation', libelle: 'Végétation', icone: 'arbre', groupe: 'Nature', produit: 'bdtopo',
    description: 'Zones de végétation : bois, forêts, vergers, vignes.',
    couche: 'BDTOPO_V3:zone_de_vegetation', famille: 'Polygon', nomCouche: 'Végétation IGN',
    attributs: ['cleabs', 'nature', 'date_creation', 'date_modification'],
    page: 1000, coteMaxDeg: 0.5,
    style: { polygone: 'flat', couleur: { valeur: '#7fb069' }, opacite: 0.6 },
    ordreDeGrandeur: '344 zones sur 3 × 2 km à Marseille.',
    avertissements: ['Pas d’essence fine : la « nature » distingue bois, forêts, vergers, vignes, landes.'],
  },
  voies_ferrees: {
    id: 'voies_ferrees', libelle: 'Voies ferrées', icone: 'rail', groupe: 'Réseaux', produit: 'bdtopo',
    description: 'Tronçons de voie ferrée : nature, électrification, nombre de voies.',
    couche: 'BDTOPO_V3:troncon_de_voie_ferree', famille: 'LineString', nomCouche: 'Voies ferrées IGN',
    attributs: ['cleabs', 'nature', 'electrifie', 'largeur', 'nombre_de_voies', 'usage', 'vitesse_maximale',
      'position_par_rapport_au_sol', 'etat_de_l_objet', 'date_modification'],
    page: 1000, coteMaxDeg: 1,
    style: { couleur: { valeur: '#4a4a4a' }, largeur: { valeur: 3 } },
    ordreDeGrandeur: '56 tronçons sur 2,5 × 1,2 km autour de la gare Saint-Charles à Marseille.',
    avertissements: [],
  },
  reperes: {
    id: 'reperes', libelle: 'Repères routiers', icone: 'repere', groupe: 'Réseaux', produit: 'bdtopo',
    description: 'Bornes de repérage (PR) des routes numérotées : route, numéro, abscisse.',
    couche: 'BDTOPO_V3:point_de_repere', famille: 'Point', nomCouche: 'Repères routiers IGN',
    attributs: ['cleabs', 'route', 'numero', 'abscisse', 'cote', 'type_de_pr', 'libelle', 'statut', 'gestionnaire',
      'code_insee_du_departement', 'identifiant_de_section', 'date_modification'],
    page: 1000, coteMaxDeg: 1,
    style: { couleur: { valeur: '#d35400' }, taille: { valeur: 6 }, etiquette: 'libelle' },
    ordreDeGrandeur: '62 repères sur 4 × 4 km en Ardèche.',
    avertissements: ['Autoroutes, nationales et départementales seulement : aucun repère sur les voies communales, donc rien en centre-ville.'],
  },
  communes: {
    id: 'communes', libelle: 'Communes', icone: 'commune', groupe: 'Limites administratives', produit: 'admin',
    description: 'Limites des communes (Admin Express) : nom, code INSEE, population.',
    couche: 'ADMINEXPRESS-COG-CARTO.LATEST:commune', famille: 'Polygon', nomCouche: 'Communes IGN',
    attributs: ['cleabs', 'nom_officiel', 'code_insee', 'population', 'date_du_recensement', 'superficie_cadastrale',
      'code_insee_du_departement', 'code_insee_de_la_region', 'code_siren', 'statut', 'codes_siren_des_epci'],
    page: 200, coteMaxDeg: 1,
    style: { polygone: 'flat', couleur: { valeur: '#e07a5f' }, opacite: 0.25, etiquette: 'nom_officiel' },
    ordreDeGrandeur: 'Une dizaine à quelques centaines selon la zone ; 34 877 en France.',
    avertissements: ['Un objet est une commune entière : sa géométrie peut dépasser l’emprise demandée. Paris, Lyon et Marseille sont une commune ; leurs arrondissements sont à part.'],
  },
  departements: {
    id: 'departements', libelle: 'Départements', icone: 'departement', groupe: 'Limites administratives', produit: 'admin',
    description: 'Limites des départements (Admin Express) : nom et code INSEE.',
    couche: 'ADMINEXPRESS-COG-CARTO.LATEST:departement', famille: 'Polygon', nomCouche: 'Départements IGN',
    attributs: ['cleabs', 'nom_officiel', 'code_insee', 'code_insee_de_la_region', 'code_siren'],
    page: 20, coteMaxDeg: 1,
    style: { polygone: 'flat', couleur: { valeur: '#3d405b' }, opacite: 0.15, etiquette: 'nom_officiel' },
    ordreDeGrandeur: 'Un à quelques objets : 101 en France.',
    avertissements: ['Un objet est un département entier, d’un poids de l’ordre de 100 Ko à 1 Mo chacun.'],
  },
  equipements_services: {
    id: 'equipements_services', libelle: 'Équipements et services', icone: 'equipement', groupe: 'Services', produit: 'bdtopo',
    description: 'Zones d’activité et d’intérêt : santé, enseignement, culte, administration, sport, culture.',
    couche: 'BDTOPO_V3:zone_d_activite_ou_d_interet', famille: 'Polygon', nomCouche: 'Équipements et services IGN',
    attributs: ['cleabs', 'categorie', 'nature', 'nature_detaillee', 'toponyme', 'importance', 'commune', 'insee_commune',
      'adresse_postale', 'nom_commercial', 'etat_de_l_objet', 'date_modification'],
    page: 1000, coteMaxDeg: 0.5,
    style: { polygone: 'flat', couleur: { champ: 'categorie', categories: [], defaut: '#999999' }, opacite: 0.6, etiquette: 'toponyme' },
    ordreDeGrandeur: '57 zones sur 0,6 km² à Marseille.',
    avertissements: ['Ce sont des emprises (un hôpital, une école), pas un inventaire du mobilier urbain : ni arrêts de bus fiables, ni feux, ni éclairage public.'],
  },
});

/** Les jeux, dans l'ordre du catalogue. */
export function listerPresets() {
  return Object.values(PRESETS);
}

/** Les jeux regroupés pour l'affichage : `[{groupe, jeux: [...]}]`, groupes dans l'ordre de première apparition. */
export function presetsParGroupe() {
  const groupes = [];
  for (const p of listerPresets()) {
    let g = groupes.find((x) => x.groupe === p.groupe);
    if (!g) groupes.push(g = { groupe: p.groupe, jeux: [] });
    g.jeux.push(p);
  }
  return groupes;
}

/** Un jeu, ou une erreur claire. */
export function presetDe(id) {
  const p = PRESETS[id];
  if (!p) throw new ErreurWfs('parametre_invalide', `Jeu de données inconnu : « ${id} ».`);
  return p;
}

/* ------------------------------------------------------------------ */
/* L'emprise                                                           */
/* ------------------------------------------------------------------ */

const arrondir5 = (v) => Math.round(v * 1e5) / 1e5;

/**
 * L'emprise du service depuis les bornes d'une carte : `[ouest, sud, est, nord]` arrondi au mètre. L'argument est ce
 * que rend `map.getBounds()` de MapLibre (`getWest()`, …) ; un tableau `[ouest, sud, est, nord]` passe tel quel.
 */
export function empriseDepuisBornes(bornes) {
  if (Array.isArray(bornes)) return bornes.map(arrondir5);
  if (!bornes || typeof bornes.getWest !== 'function') throw new ErreurWfs('emprise_invalide', 'Les bornes de la carte sont illisibles.');
  return [bornes.getWest(), bornes.getSouth(), bornes.getEast(), bornes.getNorth()].map(arrondir5);
}

/** L'emprise écrite pour la personne : `sud, ouest → nord, est`, comme dans le panneau d'import OpenStreetMap. */
export function libelleEmprise(emprise) {
  const [o, s, e, n] = emprise;
  return `${s.toFixed(4)}, ${o.toFixed(4)} → ${n.toFixed(4)}, ${e.toFixed(4)}`;
}

/* ------------------------------------------------------------------ */
/* Les requêtes                                                        */
/* ------------------------------------------------------------------ */

/**
 * Combien d'objets ce jeu compte dans l'emprise ? (`resultType=hits`, sans rien télécharger.)
 * Une emprise sans valeur, ou trop grande pour ce jeu, est refusée AVANT toute requête.
 *
 * @param {object} preset
 * @param {number[]} emprise
 * @param {{fetch?: Function, signal?: AbortSignal, url?: string, delaiMs?: number}} [options]
 */
export async function estimer(preset, emprise, options = {}) {
  verifierEmprise(preset, emprise);
  return compterHits(preset.couche, emprise, { delaiMs: 20000, ...options });
}

/** Vérifie l'emprise pour ce jeu : jamais de requête sans emprise, jamais au-delà de `coteMaxDeg`. */
export function verifierEmprise(preset, emprise) {
  if (!emprise) throw new ErreurWfs('emprise_invalide', 'Une emprise est obligatoire : on n’importe jamais une couche entière.');
  const [x0, y0, x1, y1] = emprise;
  const max = preset.coteMaxDeg;
  if (Number.isFinite(max) && (x1 - x0 > max || y1 - y0 > max)) {
    throw new ErreurWfs('emprise_trop_grande', `Zone trop grande pour « ${preset.libelle} » (plus de ${String(max).replace('.', ',')}° de côté) : zoomez.`, { coteMaxDeg: max });
  }
  return emprise;
}

/**
 * Les pages d'un jeu dans une emprise : un itérable asynchrone de `{features, debut, numberMatched}`.
 * @param {object} preset
 * @param {number[]} emprise
 * @param {{debut?: number, fetch?: Function, signal?: AbortSignal, url?: string, attendre?: Function, pauseMs?: number, taille?: number}} [options]
 */
export function pagesDe(preset, emprise, options = {}) {
  verifierEmprise(preset, emprise);
  return lirePages(preset.couche, emprise, { taille: preset.page, coteMax: preset.coteMaxDeg, ...options });
}

/* ------------------------------------------------------------------ */
/* La normalisation                                                    */
/* ------------------------------------------------------------------ */

const arrondir7 = (v) => Math.round(v * 1e7) / 1e7;

const estPosition = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])
  && p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90;

/** Les coordonnées sans altitude, au centimètre. Rend `null` à la première position illisible. */
function sansAltitude(c) {
  if (!Array.isArray(c)) return null;
  if (typeof c[0] === 'number') return estPosition(c) ? [arrondir7(c[0]), arrondir7(c[1])] : null;
  const out = [];
  for (const x of c) {
    const r = sansAltitude(x);
    if (r === null) return null;
    out.push(r);
  }
  return out;
}

const anneauValide = (a) => Array.isArray(a) && a.length >= 4 && a[0][0] === a.at(-1)[0] && a[0][1] === a.at(-1)[1];
const ligneValide = (l) => Array.isArray(l) && l.length >= 2;

/**
 * La géométrie d'un objet, ramenée à la forme que le jeu annonce.
 *
 * - l'altitude est retirée de chaque position ;
 * - un « Multi » d'une seule partie devient simple, un « Multi » de plusieurs parties reste UN objet (on ne l'éclate
 *   jamais : une ligne par `cleabs`, ce qu'attend la table qui le portera un jour) ;
 * - une géométrie d'une autre famille, vide ou illisible est refusée avec son motif.
 *
 * @returns {{geometry: object}|{refus: {code: string, message: string}}}
 */
export function normaliserGeometrie(geometrie, famille) {
  if (!geometrie || !geometrie.type || !geometrie.coordinates) return { refus: { code: 'geometrie_absente', message: 'Objet sans géométrie.' } };
  const simple = famille;
  const multi = `Multi${famille}`;
  if (geometrie.type !== simple && geometrie.type !== multi) {
    return { refus: { code: 'geometrie_autre_famille', message: `Géométrie ${geometrie.type} au lieu de ${simple}.` } };
  }
  const c = sansAltitude(geometrie.coordinates);
  const invalide = { refus: { code: 'geometrie_invalide', message: 'Géométrie illisible ou dégénérée (positions hors du globe, trop peu de points, anneau ouvert).' } };
  if (c === null) return invalide;
  const estMulti = geometrie.type === multi;
  const parties = estMulti ? c : [c];
  if (!parties.length) return { refus: { code: 'geometrie_absente', message: 'Objet sans géométrie.' } };
  const bon = parties.every((p) => {
    if (famille === 'Point') return Array.isArray(p) && typeof p[0] === 'number';
    if (famille === 'LineString') return ligneValide(p);
    return Array.isArray(p) && p.length > 0 && p.every(anneauValide);
  });
  if (!bon) return invalide;
  if (parties.length === 1) return { geometry: { type: simple, coordinates: parties[0] } };
  return { geometry: { type: multi, coordinates: parties } };
}

/**
 * Un objet reçu du service, au format de couche d'Atlas.
 *
 * Ne garde que les attributs du jeu, dans son ordre, sans les valeurs vides (`null`, texte vide) ; `cleabs` et
 * `date_modification` sont conservés. L'identifiant du service (`batiment.49696461`) n'est PAS repris : il change
 * d'une lecture à l'autre, la clé stable est `cleabs`.
 *
 * @returns {{entite: object}|{refus: {code: string, message: string}}}
 */
export function normaliserEntite(preset, feature) {
  const props = feature?.properties || {};
  const cleabs = props.cleabs;
  if (typeof cleabs !== 'string' || !cleabs) return { refus: { code: 'identifiant_absent', message: 'Objet sans identifiant stable (cleabs).' } };
  const g = normaliserGeometrie(feature.geometry, preset.famille);
  if (g.refus) return g;
  const proprietes = {};
  for (const nom of preset.attributs) {
    const v = props[nom];
    if (v === null || v === undefined || v === '') continue;
    proprietes[nom] = v;
  }
  // Les attributs dérivés (ex. le type de voie d'un tronçon), calculés sur les propriétés d'origine.
  for (const [nom, calculer] of Object.entries(preset.derives || {})) {
    const v = calculer(props);
    if (v !== null && v !== undefined && v !== '') proprietes[nom] = v;
  }
  return { entite: { type: 'Feature', geometry: g.geometry, properties: proprietes } };
}

/** La clé qui dit qu'un objet a déjà été vu (reprise d'un import). */
export const cleDeEntite = (entite) => entite?.properties?.cleabs;

/** La plus récente `date_modification` des objets : ce que l'import a vu de plus frais (ISO, comparaison de texte). */
export function derniereModification(entites) {
  let max = null;
  for (const e of entites) {
    const d = e?.properties?.date_modification;
    if (typeof d === 'string' && (max === null || d > max)) max = d;
  }
  return max;
}

/* ------------------------------------------------------------------ */
/* La couche, sa provenance, son style                                 */
/* ------------------------------------------------------------------ */

/**
 * D'où viennent les données de la couche. Rangé dans le style de la couche (`layer.style.provenance`), qui est ce
 * qu'Atlas enregistre avec le projet et avec l'apparence : sans cela, la mention de source se perdrait au premier
 * rechargement.
 *
 * @param {object} preset
 * @param {{emprise: number[], importes: number, estimes?: number|null, entites?: object[], date?: Date}} o
 */
export function metadonneesCouche(preset, { emprise, importes, estimes = null, entites = [], date = new Date() }) {
  const produit = PRODUITS[preset.produit];
  const annoncee = EDITION_ANNONCEE[preset.produit];
  return {
    source: 'IGN',
    jeu: produit.nom,
    couche: preset.couche,
    service: URL_WFS,
    licence: { nom: LICENCE.nom, url: LICENCE.url, conditions: LICENCE.conditions },
    mention: produit.mention,
    edition: {
      annoncee: annoncee.edition,
      releveeLe: annoncee.relevee,
      derniereModificationVue: derniereModification(entites),
    },
    avertissementEdition: produit.avertissementEdition,
    cle: 'cleabs',
    champDateModification: preset.attributs.includes('date_modification') ? 'date_modification' : null,
    emprise,
    importes,
    estimes,
    importeLe: date.toISOString(),
  };
}

/**
 * Le texte d'une provenance à lire (hors HTML) : source, jeu, licence, édition.
 * @param {ReturnType<typeof metadonneesCouche>} m
 */
export function phraseProvenance(m) {
  const edition = m.edition?.annoncee
    ? `édition annoncée par le service : ${m.edition.annoncee} (relevée le ${m.edition.releveeLe})`
    : 'dernière édition publiée';
  const vue = m.edition?.derniereModificationVue ? `, objet le plus récemment modifié : ${m.edition.derniereModificationVue.slice(0, 10)}` : '';
  return `Source : ${m.source}, ${m.jeu} — ${m.licence.nom} — ${edition}${vue}.`;
}

/** Les couleurs d'une couche catégorisée dont les valeurs ne sont pas connues d'avance : distinctes, lisibles sur fond clair. */
export const PALETTE_CATEGORIES = Object.freeze(['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac']);

/** Les valeurs d'un champ, de la plus fréquente à la plus rare (à égalité, l'ordre alphabétique). */
function valeursParFrequence(entites, champ) {
  const n = new Map();
  for (const e of entites) {
    const v = e.properties?.[champ];
    if (v === null || v === undefined || v === '') continue;
    n.set(String(v), (n.get(String(v)) || 0) + 1);
  }
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).map(([v]) => v);
}

const distinctesNumeriques = (entites, champ) => {
  const vus = new Set();
  for (const e of entites) {
    const v = Number(e.properties?.[champ]);
    if (Number.isFinite(v)) vus.add(v);
    if (vus.size > 1) return vus.size;
  }
  return vus.size;
};

/**
 * Le style par défaut d'une couche importée, sous une forme que l'interface sait poser sur la symbolisation d'Atlas.
 * Il dépend des données : une largeur « par importance » n'a de sens que s'il y a au moins deux importances, et
 * Atlas refuserait une graduation dont les bornes sont égales.
 *
 * @returns {{
 *   couleur: {mode: 'single', valeur: string} | {mode: 'categorized', champ: string, categories: object[], defaut: string},
 *   taille: {mode: 'single', valeur: number} | {mode: 'graduated', champ: string, plage: number[]} | null,
 *   polygonMode: 'flat'|'extruded'|null, champHauteur: string|null, opacite: number|null, etiquette: string|null,
 * }}
 */
export function styleDeCouche(preset, entites = []) {
  const s = preset.style || {};
  const c = s.couleur || {};
  const couleur = c.champ
    ? { mode: 'categorized', champ: c.champ, defaut: c.defaut || '#999999', categories: c.categories?.length
        ? c.categories.map((x) => ({ value: x.valeur, color: x.couleur, label: x.libelle }))
        // Valeurs inconnues d'avance (la catégorie d'un équipement) : tirées des données, une couleur chacune. Atlas ne le
        // ferait pas à la pose du style et peindrait tout du ton par défaut.
        : valeursParFrequence(entites, c.champ).map((v, i) => ({ value: v, color: PALETTE_CATEGORIES[i % PALETTE_CATEGORIES.length] })) }
    : { mode: 'single', valeur: c.valeur || '#808080' };
  let taille = null;
  if (s.largeur?.champ) {
    taille = distinctesNumeriques(entites, s.largeur.champ) > 1
      ? { mode: 'graduated', champ: s.largeur.champ, plage: [...s.largeur.plage] }
      : { mode: 'single', valeur: s.largeur.plage[1] + (s.largeur.plage[0] - s.largeur.plage[1]) / 3 };
  } else if (s.largeur) taille = { mode: 'single', valeur: s.largeur.valeur };
  else if (s.taille) taille = { mode: 'single', valeur: s.taille.valeur };
  const surfacique = preset.famille === 'Polygon';
  return {
    couleur,
    taille,
    polygonMode: surfacique ? (s.polygone === 'extrude' ? 'extruded' : 'flat') : null,
    champHauteur: s.polygone === 'extrude' ? (s.hauteur || null) : null,
    opacite: Number.isFinite(s.opacite) ? s.opacite : null,
    etiquette: s.etiquette || null,
  };
}

/* ------------------------------------------------------------------ */
/* Ce qu'on dit quand ça ne va pas                                     */
/* ------------------------------------------------------------------ */

/** Une erreur du client WFS, dite en français à la personne qui a cliqué (jamais « HTTP 400 » seul). */
export function messageErreurImport(e) {
  switch (e?.code) {
    case 'emprise_invalide': return `La zone visible n’est pas utilisable pour l’IGN : ${e.message}`;
    case 'emprise_trop_grande': return e.message.startsWith('Zone trop grande') ? e.message : 'La zone est trop grande : zoomez avant d’importer.';
    case 'exception_ogc': return `Le service de l’IGN a refusé la requête : ${String(e.message).replace(/^Le service WFS refuse la requête \(\d+\) : /, '')}`;
    case 'delai': return 'Le service de l’IGN met trop de temps à répondre : réduisez la zone, ou réessayez dans un moment.';
    case 'reseau': return 'Le service de l’IGN est injoignable : vérifiez la connexion, puis réessayez.';
    case 'http': return e.status === 429
      ? 'Le service de l’IGN limite le nombre de requêtes : patientez une minute, puis réessayez.'
      : `Le service de l’IGN est momentanément indisponible (${e.status ?? 'erreur'}) : réessayez dans un moment.`;
    case 'reponse_illisible': return 'La réponse du service de l’IGN est illisible : réessayez, ou réduisez la zone.';
    case 'trop_d_objets': return 'Le service a renvoyé bien plus d’objets que prévu : import interrompu, zoomez et recommencez.';
    case 'annule': return 'Import annulé.';
    default: return `Erreur : ${e?.message || e}`;
  }
}

/**
 * Peut-on lancer l'import ? Combine l'estimation et les seuils : rend `{ok, niveau, message}`.
 * @param {{niveau: string, message: string}} evaluation ce que rend `evaluerVolume`
 */
export function decisionImport(evaluation) {
  if (evaluation.niveau === 'refuser') return { ok: false, niveau: 'refuser', message: evaluation.message };
  if (evaluation.niveau === 'vide') return { ok: false, niveau: 'vide', message: evaluation.message };
  if (evaluation.niveau === 'inconnu') return { ok: false, niveau: 'inconnu', message: 'Le nombre d’objets n’a pas pu être établi : réessayez.' };
  return { ok: true, niveau: evaluation.niveau, message: evaluation.message };
}

/**
 * Une durée d'import attendue, d'après le nombre d'objets et la taille de page. Valeurs mesurées en navigateur (voir
 * `docs/IMPORT-IGN.md`) : une pause entre deux pages, un temps par page, un temps par objet.
 */
export function estimerDuree(n, page, { msParPage = 200, msParObjet = 0.2, pauseMs = 200 } = {}) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const pages = Math.ceil(n / Math.max(1, page));
  return (pages * (msParPage + pauseMs) + n * msParObjet) / 1000;
}
