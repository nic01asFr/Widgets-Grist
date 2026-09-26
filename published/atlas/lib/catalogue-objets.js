/**
 * Lecture d'un catalogue d'objets parametriques `atlas-objets/0.1`.
 *
 * Contrat fige le 19/09/2026 avec le generateur pix2hdr :
 * `pix2hdr/docs/SPEC-ATLAS-OBJETS-0.1.md`. Atlas ne genere rien : il POINTE un
 * catalogue, choisit pour chaque objet le modele que ses champs designent, et
 * tire la variation individuelle par une graine geographique (`graine.js`).
 *
 * Tout ici est pur — ni three.js, ni MapLibre, ni reseau — pour etre verifie
 * contre les vecteurs de reference du generateur (`tests/fixtures/`).
 *
 * Ce que ce module ne fait PAS encore (spec §10) : le semis de surfaces
 * (`mode: scatter`, exige une projection L93), l'echelle non uniforme
 * (`axis: vertical | horizontal`), le contrat de shader. Un match ou une mesure
 * qu'il ne sait pas appliquer est ignore, jamais une erreur : un catalogue plus
 * recent qu'Atlas reste affichable (§11).
 */
import { cleLatLon, variante, rotation as rotationTiree, echelle as echelleTiree } from './graine.js';

/** Les versions de schema que ce lecteur comprend. */
const SCHEMA = /^atlas-objets\/0\.\d+$/;

/**
 * Le catalogue, reduit a ce qu'Atlas exploite.
 *
 * La rigueur du schema (`additionalProperties: false`) est pour le producteur ;
 * le lecteur ignore les champs qu'il ne connait pas (§11). Un bloc `parametric`
 * absent ou d'une autre famille de schema laisse le catalogue historique seul.
 *
 * @param {object} json   contenu de `catalog.json`
 * @param {string} base   URL du catalogue (les chemins lui sont relatifs, §2)
 */
export function lireCatalogue(json, base) {
  const racine = String(base || '').replace(/[^/]*$/, '');
  const p = json?.parametric;
  const vide = { schema: null, types: [], assets: [], shaders: {}, base: racine };
  if (!p || !SCHEMA.test(String(p.schema || ''))) return vide;
  return {
    schema: p.schema,
    id: p.catalog_id || null,
    types: Array.isArray(p.types) ? p.types.filter((t) => t && t.id) : [],
    assets: Array.isArray(p.assets) ? p.assets.filter((a) => a && a.type && a.keys && a.files) : [],
    shaders: p.shaders && typeof p.shaders === 'object' ? p.shaders : {},
    base: racine,
  };
}

/**
 * Le catalogue livré avec Atlas, relatif à la page (`objets/`) : dans le
 * widget publié, dans la page de développement et dans l'application, il est
 * posé à côté de `index.html`. Il commence par les luminaires EclExt.
 */
export const CATALOGUE_INTEGRE = './objets/';

/**
 * Quel catalogue charger : l'adresse demandée (`?objets=`), puis celle retenue
 * sur ce poste, puis le catalogue intégré.
 *
 * Avant le 26/09/2026, sans l'un des deux premiers, il n'y en avait **aucun** :
 * une scène d'éclairage public s'affichait avec le luminaire de test construit
 * en three.js, alors que des modèles existaient — dans un dossier d'essai que
 * personne d'autre ne pouvait pointer.
 *
 * @param {{parametre?: string|null, memorise?: string|null}} o
 * @returns {{url: string, origine: 'parametre'|'poste'|'integre'}}
 */
export function choisirCatalogue({ parametre = null, memorise = null } = {}) {
  const p = String(parametre || '').trim();
  if (p) return { url: p, origine: 'parametre' };
  const m = String(memorise || '').trim();
  if (m) return { url: m, origine: 'poste' };
  return { url: CATALOGUE_INTEGRE, origine: 'integre' };
}

// ------------------------------------------------------------------
// Correspondance : quel type pour cet objet (§3.2 et §3.3)
// ------------------------------------------------------------------

/**
 * Un match s'applique-t-il ?
 *
 * La source est une propriete de la COUCHE, pas de l'objet (§3.2) :
 * `couche = { source: 'osm'|'bdtopo'|'grist', nom }`. `any` vaut pour toute
 * couche. Seul `mode: instance` sur des points est applique ici.
 */
export function matchApplicable(match, couche, props, geometrie) {
  if (!match || match.mode !== 'instance') return false;
  if (match.geometry && match.geometry !== geometrie) return false;
  const source = match.source || 'any';
  if (source !== 'any' && source !== couche?.source) return false;
  if (match.layer != null && source !== 'osm' && match.layer !== couche?.nom) return false;
  for (const [cle, attendu] of Object.entries(match.tags || {})) {
    const v = props?.[cle];
    if (v == null) return false;
    const valeurs = Array.isArray(attendu) ? attendu : [attendu];
    if (!valeurs.some((a) => String(a) === String(v))) return false;
  }
  return true;
}

/**
 * Le type retenu pour un objet, ou `null`.
 * Departage (§3.3) : priorite, puis specificite (nombre de tags), puis ORDRE
 * DANS LE CATALOGUE — obligatoire pour que deux lecteurs s'accordent.
 */
export function choisirType(types, couche, props, geometrie) {
  let meilleur = null;
  types.forEach((type, rang) => {
    for (const m of type.matches || []) {
      if (!matchApplicable(m, couche, props, geometrie)) continue;
      const cand = {
        type,
        priorite: Number.isFinite(type.priority) ? type.priority : 0,
        specificite: Object.keys(m.tags || {}).length,
        rang,
      };
      if (!meilleur
        || cand.priorite > meilleur.priorite
        || (cand.priorite === meilleur.priorite && cand.specificite > meilleur.specificite)) {
        meilleur = cand;
      }
    }
  });
  return meilleur ? meilleur.type : null;
}

// ------------------------------------------------------------------
// Mesures (§5)
// ------------------------------------------------------------------

/**
 * Une longueur a la maniere d'OSM : `12`, `12.5`, `12 m`, `12,5 m`.
 * Tout le reste (pieds, plages, texte) est refuse : `null`. Un nombre nu est
 * dans l'unite declaree par la mesure ; un suffixe `m` impose le metre.
 * @returns {{valeur: number, metres: boolean}|null}
 */
export function lireLongueurOsm(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? { valeur: v, metres: false } : null;
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(m)?\s*$/.exec(String(v ?? ''));
  if (!m) return null;
  return { valeur: Number(m[1].replace(',', '.')), metres: Boolean(m[2]) };
}

const UNITES = { m: 1, cm: 0.01, mm: 0.001, km: 1000 };

/** La valeur d'une mesure pour un objet, en unites SI et bornee, ou `null`. */
export function lireMesure(mesure, props) {
  const facteur = UNITES[mesure?.unit || 'm'];
  if (facteur === undefined) return null;
  for (const champ of mesure.from || []) {
    const brut = props?.[champ];
    if (brut == null || brut === '') continue;
    let v = null;
    if (mesure.parse === 'osm_length') {
      const l = lireLongueurOsm(brut);
      if (l) v = l.metres ? l.valeur : l.valeur * facteur;
    } else {
      const n = typeof brut === 'number' ? brut : Number(String(brut).replace(',', '.'));
      if (Number.isFinite(n)) v = n * facteur;
    }
    if (v == null || !Number.isFinite(v)) continue;   // illisible : champ suivant
    const [min, max] = Array.isArray(mesure.clamp) ? mesure.clamp : [-Infinity, Infinity];
    return Math.min(Math.max(v, min ?? -Infinity), max ?? Infinity);
  }
  return null;
}

/** Le seuil franchi par une valeur (`[[0.6, "young"], [null, "old"]]`, borne sup exclue). */
export function selonSeuils(valeur, seuils) {
  for (const [borne, cle] of seuils || []) {
    if (borne == null || valeur < borne) return cle;
  }
  return null;
}

/**
 * Les mesures d'un type appliquees a un objet.
 * @returns {{hauteur: number|null, cles: object, uniforms: object}}
 */
export function appliquerMesures(type, props) {
  const cles = { ...(type.defaults || {}) };
  const uniforms = {};
  let hauteur = null;
  for (const m of type.measure || []) {
    const v = lireMesure(m, props);
    if (v == null) continue;
    if (m.mode === 'scale' && (m.axis || 'uniform') === 'uniform' && m.param === 'height') hauteur = v;
    else if (m.mode === 'select' && m.key) {
      const c = selonSeuils(v, m.thresholds);
      if (c != null) cles[m.key] = c;
    } else if (m.mode === 'uniform' && m.param) uniforms[m.param] = v;
    // `axis: vertical | horizontal` : exige une evolution d'Atlas (§5), ignore.
  }
  return { hauteur, cles, uniforms };
}

// ------------------------------------------------------------------
// Fichier (§3.7)
// ------------------------------------------------------------------

/**
 * Le fichier d'un type pour des cles, une variante et un niveau de detail.
 *
 * Degradation (§3.7) : variante voulue, puis variante 0, au niveau de detail
 * voulu ; puis le niveau le plus proche (a egalite, le plus DETAILLE, indice le
 * plus petit), meme ordre de variantes. Les autres cles (`age_class`…) doivent
 * etre egales. `null` : le lecteur prend le `fallback` low-poly.
 */
export function choisirFichier(assets, typeId, cles, variant, lod) {
  const autres = Object.entries(cles || {}).filter(([k]) => k !== 'variant' && k !== 'lod');
  const compatibles = assets.filter((a) => a.type === typeId
    && autres.every(([k, v]) => a.keys?.[k] === v));
  if (!compatibles.length) return null;
  const lods = [...new Set(compatibles.map((a) => a.keys.lod))]
    .sort((a, b) => (Math.abs(a - lod) - Math.abs(b - lod)) || (a - b));
  for (const l of lods) {
    for (const v of variant === 0 ? [0] : [variant, 0]) {
      const a = compatibles.find((x) => x.keys.lod === l && x.keys.variant === v);
      if (a) return a;
    }
  }
  return null;
}

/** Le niveau de detail voulu a une distance, d'apres `lod_distances_m` (§7). */
export function niveauPourDistance(distances, metres) {
  const seuils = Array.isArray(distances) ? distances : [];
  let n = 0;
  while (n < seuils.length && metres >= seuils[n]) n++;
  return n;
}

// ------------------------------------------------------------------
// Tout ensemble, pour un objet
// ------------------------------------------------------------------

/**
 * Le modele d'un objet ponctuel, d'apres le catalogue, ou `null` (l'objet
 * garde alors le comportement d'Atlas, §3.4).
 *
 * @param {object} cat     `lireCatalogue(...)`
 * @param {object} couche  `{ source, nom }`
 * @param {object} feature GeoJSON Point
 * @param {object} o       `{ set, lod | distanceM, public, echelleCouche, rotationCoucheDeg }`
 * @returns {null | {type, asset, url, fallback, echelle, rotationDeg, cle}}
 */
export function resoudreObjet(cat, couche, feature, o = {}) {
  const g = feature?.geometry;
  if (!g || g.type !== 'Point' || !cat?.types?.length) return null;
  const props = feature.properties || {};
  const type = choisirType(cat.types, couche, props, 'point');
  if (!type) return null;

  const [lon, lat] = g.coordinates || [];
  const cle = seedKey(type, props, lat, lon);
  if (cle == null) return null;
  const { hauteur, cles } = appliquerMesures(type, props);
  const k = Number.isInteger(type.variants) && type.variants > 0 ? type.variants : 1;
  const v = variante(cle, k);
  // Le niveau de detail se lit a la distance camera → objet, avec les seuils
  // du TYPE (§7) ; un niveau impose par l'appelant l'emporte.
  const lod = Number.isInteger(o.lod) ? o.lod
    : niveauPourDistance(type.lod_distances_m, Number.isFinite(o.distanceM) ? o.distanceM : 0);
  let asset = choisirFichier(cat.assets, type.id, cles, v, lod);
  if (asset && o.public && asset.licence?.usage === 'internal') asset = null;   // §3.8

  const set = o.set || 'colored';
  const fichier = asset ? (asset.files[set] || Object.values(asset.files)[0]) : null;
  const echelleCouche = Number.isFinite(o.echelleCouche) ? o.echelleCouche : 1;
  // Decision 6 du contrat commun (24/09/2026) : un luminaire n'est jamais
  // tire en echelle — une lanterne de 8 m n'est pas une lanterne de 4 m
  // agrandie, c'est la classe de hauteur qui choisit le fichier. Le type le
  // dit par `scale_draw: false` (ajout prevu a la 0.2, A6) ; la famille
  // `lighting` le vaut d'office, pour un catalogue qui ne le dirait pas.
  const sansTirage = type.scale_draw === false || type.family === 'lighting';
  const propre = asset && hauteur != null && asset.height_m > 0
    ? hauteur / asset.height_m
    : (sansTirage ? 1 : echelleTiree(cle));
  return {
    type,
    asset,
    url: fichier ? cat.base + fichier : null,
    fallback: type.fallback || null,
    // §5 : la mesure REMPLACE le tirage, et les deux se MULTIPLIENT par la couche.
    echelle: echelleCouche * propre,
    // §5 : la rotation tiree S'AJOUTE a la rotation manuelle.
    rotationDeg: (o.rotationCoucheDeg || 0) + rotationTiree(cle) * 180 / Math.PI,
    cle,
  };
}

/** La cle de graine d'un objet selon le type (§4) ; `ll` par defaut. */
function seedKey(type, props, lat, lon) {
  if (type.seed === 'osm' && props._osmId) return 'osm:' + props._osmId;
  if (type.seed === 'ref' && typeof type.seed_ref === 'string') {
    // « <referentiel>:<champ> » ; le referentiel peut lui-meme contenir des « : ».
    const i = type.seed_ref.lastIndexOf(':');
    const referentiel = type.seed_ref.slice(0, i), champ = type.seed_ref.slice(i + 1);
    if (i > 0 && champ && props[champ] != null && props[champ] !== '') {
      return `ref:${referentiel}:${props[champ]}`;
    }
  }
  return cleLatLon(lat, lon);   // defaut, et repli si l'identifiant manque
}

// ------------------------------------------------------------------
// Saison (§8, contrat atlas-vegetation-season/0.1)
// ------------------------------------------------------------------

/** Rampe de la spec, bornes egales comprises. */
export function rampe(d, a, b) {
  if (a === b) return d < a ? 0 : 1;
  if (d <= a) return 0;
  if (d >= b) return 1;
  return (d - a) / (b - a);
}

/**
 * `uFoliage` et `uAutumn` pour un type de feuilles, un calendrier et un jour.
 * Memes operations, dans le meme ordre, que `gn_lib/objseason.py`. Un type de
 * feuilles inconnu donne l'arbre en pleine feuille : pas d'erreur (§3.9).
 */
export function uniformsSaison(typeFeuilles, phen, d) {
  if (typeFeuilles === 'persistant' || !phen) return { uFoliage: 1, uAutumn: 0 };
  const { budburst: bb, full_leaf: fl, colour_start: cs, colour_full: cf, fall_start: fs, fall_end: fe } = phen;
  if (typeFeuilles === 'marcescent') {
    if (d < bb) return { uFoliage: 1, uAutumn: 1 };
    return { uFoliage: rampe(d, bb, fl), uAutumn: rampe(d, cs, cf) };
  }
  let feuillage = rampe(d, bb, fl) * (1 - rampe(d, fs, fe));
  let automne = d < bb ? 0 : rampe(d, cs, cf);
  if (typeFeuilles === 'semi_persistant') {
    feuillage = Math.max(0.5, feuillage);
    automne = Math.min(0.5, automne);
  } else if (typeFeuilles !== 'caduc') {
    return { uFoliage: 1, uAutumn: 0 };
  }
  return { uFoliage: feuillage, uAutumn: automne };
}

/** Le jour de l'annee d'une date (1er janvier = 1), fraction comprise. */
export function jourDeLAnnee(date) {
  const t = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(t.getTime())) return null;
  // En UTC sur l'heure LOCALE : sans cela, le passage a l'heure d'ete decale
  // d'une heure tous les jours qui suivent.
  const ici = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds());
  return 1 + (ici - Date.UTC(t.getFullYear(), 0, 1)) / 86400000;
}
