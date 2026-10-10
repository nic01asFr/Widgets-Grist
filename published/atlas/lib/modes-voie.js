/**
 * Les MODES de déplacement d'un tronçon : route, chemin, sentier, escalier, piste cyclable, voie ferrée.
 *
 * Un tronçon de la BD TOPO ou d'OpenStreetMap n'est pas forcément une route : l'allée d'un parc, un escalier, une piste cyclable, un sentier,
 * une voie ferrée y sont des lignes comme les autres. Ce module les DISTINGUE, d'après `nature` et `acces_vehicule_leger` (BD TOPO) ou
 * `highway`, `railway`, `access`, `motor_vehicle`, `vehicle` (OpenStreetMap), pour que chaque fonction sache ce qu'elle manipule :
 *  - l'import de l'IGN colore les routes, les chemins, les sentiers et les pistes cyclables chacun à leur façon (`type_de_voie`) ;
 *  - le trafic des véhicules ne roule que sur le mode `route`, ouvert à la circulation ;
 *  - un autre moteur (piétons, vélos, trains) lira, plus tard, le mode qui est le sien : le mode `ferre` est reconnu ici dès maintenant et n'est
 *    JAMAIS donné au trafic routier.
 *
 * Aucune dépendance : un module pur, testé sans réseau.
 */

/** Les modes, avec le libellé qu'on montre et la couleur par défaut d'une carte. */
export const MODES = Object.freeze({
  route: { id: 'route', libelle: 'Route', couleur: '#2f6fb5' },
  chemin: { id: 'chemin', libelle: 'Chemin', couleur: '#a8793f' },
  sentier: { id: 'sentier', libelle: 'Sentier', couleur: '#5f8f3a' },
  escalier: { id: 'escalier', libelle: 'Escalier', couleur: '#8a8a8a' },
  cyclable: { id: 'cyclable', libelle: 'Piste cyclable', couleur: '#169a86' },
  ferre: { id: 'ferre', libelle: 'Voie ferrée', couleur: '#454545' },
  autre: { id: 'autre', libelle: 'Autre', couleur: '#b0a58f' },
});

/**
 * Les TYPES de voie qu'on montre : un par mode, plus la route à accès restreint (allée d'un parc, voie privée, desserte réservée aux ayants droit), qui est une
 * route par sa nature et pas une route ouverte à tous. Dans l'ordre où on les range (légende, catégories).
 */
export const TYPES = Object.freeze([
  { libelle: MODES.route.libelle, couleur: MODES.route.couleur },
  { libelle: 'Route à accès restreint', couleur: '#7e57c2' },
  ...['chemin', 'sentier', 'escalier', 'cyclable', 'ferre', 'autre'].map((id) => ({ libelle: MODES[id].libelle, couleur: MODES[id].couleur })),
]);
export const TYPES_DE_VOIE = Object.freeze(TYPES.map((t) => t.libelle));

const NATURE_BDTOPO = Object.freeze({
  'Autoroute': 'route', 'Quasi-autoroute': 'route', 'Bretelle': 'route', 'Route à 2 chaussées': 'route', 'Route à 1 chaussée': 'route',
  'Rond-point': 'route', 'Route empierrée': 'route',
  'Chemin': 'chemin', 'Sentier': 'sentier', 'Escalier': 'escalier', 'Piste cyclable': 'cyclable',
  'Bac ou liaison maritime': 'autre',
  // BD TOPO, voies ferrées
  'LGV': 'ferre', 'Voie ferrée principale': 'ferre', 'Voie de service': 'ferre', 'Voie non exploitée': 'ferre', 'Funiculaire ou crémaillère': 'ferre',
  'Tramway': 'ferre', 'Métro': 'ferre',
});
const HIGHWAY_ROUTE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link',
  'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'road']);
const RAILWAY = new Set(['rail', 'light_rail', 'subway', 'tram', 'narrow_gauge', 'funicular', 'monorail', 'preserved', 'miniature']);
const ACCES_LIBRE = new Set(['yes', 'designated', 'permissive', 'official']);
const ACCES_RESTREINT = new Set(['private', 'destination', 'customers', 'delivery', 'permit', 'agricultural', 'forestry', 'residents']);

const minuscule = (v) => String(v ?? '').trim().toLowerCase();

/** Le mode d'un tronçon d'après ses attributs ; `autre` quand ni la BD TOPO ni OpenStreetMap ne le disent. */
export function modeDe(props) {
  const p = props || {};
  const nature = typeof p.nature === 'string' ? NATURE_BDTOPO[p.nature.trim()] : undefined;
  if (nature) return nature;
  const rail = minuscule(p.railway);
  if (rail && RAILWAY.has(rail)) return 'ferre';
  const h = minuscule(p.highway);
  if (h) {
    if (HIGHWAY_ROUTE.has(h)) return 'route';
    if (h === 'cycleway') return 'cyclable';
    if (h === 'steps') return 'escalier';
    if (h === 'track' || h === 'bridleway') return 'chemin';
    if (h === 'footway' || h === 'pedestrian' || h === 'corridor') return 'sentier';
    if (h === 'path') return minuscule(p.bicycle) === 'designated' && minuscule(p.foot) !== 'designated' ? 'cyclable' : 'sentier';
  }
  return 'autre';
}

/**
 * L'accès d'un véhicule léger : `libre`, `peage`, `restreint` (ayants droit, voie privée), `impossible`, ou `inconnu` quand rien ne le dit.
 * BD TOPO : `acces_vehicule_leger`. OpenStreetMap : `motor_vehicle`, puis `vehicle`, puis `access` (le plus précis l'emporte).
 */
export function accesVehicule(props) {
  const p = props || {};
  const bd = typeof p.acces_vehicule_leger === 'string' ? p.acces_vehicule_leger.trim() : '';
  if (bd) {
    if (bd === 'Libre') return 'libre';
    if (bd === 'A péage' || bd === 'À péage') return 'peage';
    if (bd.startsWith('Restreint')) return 'restreint';
    if (bd === 'Physiquement impossible') return 'impossible';
    return 'inconnu';
  }
  for (const cle of ['motor_vehicle', 'vehicle', 'access']) {
    const v = minuscule(p[cle]);
    if (!v) continue;
    if (v === 'no') return 'impossible';
    if (ACCES_RESTREINT.has(v)) return 'restreint';
    if (ACCES_LIBRE.has(v)) return 'libre';
  }
  return 'inconnu';
}

/**
 * Ce qu'on sait d'un tronçon pour décider ce qui peut y passer.
 * @returns {{ mode: string, libelle: string, acces: string, projet: boolean, routier: boolean, motif: string|null }}
 *   `routier` : un véhicule léger peut y circuler en général (mode route, accès libre ou à péage, pas à l'état de projet) ;
 *   `motif` : pourquoi il ne l'est pas (`chemin`, `sentier`, `escalier`, `cyclable`, `ferre`, `autre`, `acces_restreint`, `acces_impossible`, `projet`), sinon null.
 */
export function classerTroncon(props) {
  const p = props || {};
  const mode = modeDe(p);
  const acces = accesVehicule(p);
  const projet = p.etat_de_l_objet === 'Projet' || ['proposed', 'construction'].includes(minuscule(p.highway));
  let motif = null;
  if (projet) motif = 'projet';
  else if (mode !== 'route') motif = mode;
  else if (acces === 'restreint') motif = 'acces_restreint';
  else if (acces === 'impossible') motif = 'acces_impossible';
  return { mode, libelle: MODES[mode].libelle, acces, projet, routier: motif === null, motif };
}

/**
 * Le type de voie d'un tronçon (« Route », « Route à accès restreint », « Chemin », « Sentier »…), la valeur de l'attribut `type_de_voie`.
 * Une route dont l'accès est restreint ou impossible à un véhicule léger n'est pas une « Route » tout court : on ne la confond pas avec la voirie ouverte.
 */
export function typeDeVoie(props) {
  const mode = modeDe(props);
  if (mode === 'route') { const a = accesVehicule(props); if (a === 'restreint' || a === 'impossible') return TYPES[1].libelle; }
  return MODES[mode].libelle;
}
