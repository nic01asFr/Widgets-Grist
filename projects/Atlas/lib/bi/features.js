/**
 * Les géométries d'une couche, lues pour l'hôte (commande `getFeatures`, contrat 0.5) : une page qui redessine ou extrude la figure (vue éclatée, aperçu en réalité augmentée)
 * a besoin des géométries et des propriétés que la carte ne rend qu'en pixels. `getRows` ne donne que les attributs ; `getBuildings` ne lit que le bâti du fond.
 *
 * Module pur : il reçoit les entités de la couche, il ne lit ni la carte ni le réseau. Mêmes plafonds que `getBuildings` : une entité de plus de SOMMETS_PAR_ENTITE_MAX
 * sommets est ignorée et nommée, une entité qui ferait dépasser le budget de taille est sautée, la réponse dit `tronque` et pourquoi. Les coordonnées sont arrondies à 7
 * décimales (environ 1 cm) ; les propriétés traversent telles qu'elles sont dans la couche (ce sont les données de l'hôte ou de l'utilisateur, pas celles d'une tuile tierce).
 */
export const VERSION = '1.0.0';

export const LIMITE_DEFAUT = 2000;
export const LIMITE_MAX = 5000;
export const SOMMETS_MAX = 200000;
export const SOMMETS_PAR_ENTITE_MAX = 20000;
export const OCTETS_MAX = 2 * 1024 * 1024;
export const APPELS_PAR_SECONDE = 5;

const fini = (v) => typeof v === 'number' && Number.isFinite(v);
const TYPES = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']);

/** Les options de la commande, vérifiées ; lève une erreur lisible. `bbox` : [ouest, sud, est, nord] ou null. */
export function normaliserOptionsFeatures(o) {
  const options = o === undefined ? {} : o;
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error("getFeatures : un objet d'options est attendu");
  const limite = options.limite === undefined ? LIMITE_DEFAUT : options.limite;
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAX) throw new Error('getFeatures : limite hors bornes (1 à ' + LIMITE_MAX + ')');
  let bbox = null;
  if (options.bbox !== undefined) {
    const b = options.bbox;
    if (!Array.isArray(b) || b.length !== 4 || !b.every(fini) || b[0] < -180 || b[2] > 180 || b[1] < -90 || b[3] > 90 || !(b[0] < b[2]) || !(b[1] < b[3])) throw new Error('getFeatures : bbox mal formée (ouest, sud, est, nord)');
    bbox = [...b];
  }
  return { limite, bbox };
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

const arrondi7 = (c) => (typeof c[0] === 'number' ? c.map((v) => (fini(v) ? Math.round(v * 1e7) / 1e7 : v)) : c.map(arrondi7));

function emprise(coordonnees) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, sommets = 0, sain = true;
  const v = (c) => {
    if (!Array.isArray(c)) { sain = false; return; }
    if (typeof c[0] === 'number') {
      if (!fini(c[0]) || !fini(c[1])) { sain = false; return; }
      if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; sommets++;
    } else for (const e of c) v(e);
  };
  v(coordonnees);
  return { boite: [x0, y0, x1, y1], sommets, sain: sain && sommets > 0 };
}

/** Les propriétés d'une entité, rendues sérialisables (clonage par JSON : une fonction ou un cycle n'a rien à faire dans un message). */
function proprietes(p) {
  if (!p || typeof p !== 'object') return {};
  try { return JSON.parse(JSON.stringify(p)); } catch (e) { return {}; }
}

/**
 * @param {{id?:any, geometry:{type:string, coordinates:any}, properties?:object}[]} entites
 * @param {{bbox: number[]|null, limite: number}} o
 * @returns {{features:object[], total:number, tronque:boolean, avertissements:string[]}}
 */
export function featuresDeEntites(entites, { bbox, limite }) {
  const avertissements = [];
  let sansGeometrie = 0;
  const retenus = [];
  for (const f of Array.isArray(entites) ? entites : []) {
    const g = f && f.geometry;
    if (!g || !TYPES.has(g.type) || !Array.isArray(g.coordinates)) { sansGeometrie++; continue; }
    const { boite, sommets, sain } = emprise(g.coordinates);
    if (!sain) { sansGeometrie++; continue; }
    if (bbox && !(boite[2] >= bbox[0] && boite[0] <= bbox[2] && boite[3] >= bbox[1] && boite[1] <= bbox[3])) continue;
    retenus.push({ f, sommets });
  }
  if (sansGeometrie) avertissements.push('entites-ignorees : ' + sansGeometrie + ' entité(s) sans géométrie lisible');
  const geants = retenus.filter((r) => r.sommets > SOMMETS_PAR_ENTITE_MAX);
  if (geants.length) avertissements.push('geometrie-trop-grande : ' + geants.length + ' entité(s) de plus de ' + SOMMETS_PAR_ENTITE_MAX + ' sommets ignorée(s)');
  const gardes = retenus.filter((r) => r.sommets <= SOMMETS_PAR_ENTITE_MAX);
  let sommets = 0, octets = 0, tronque = false, tailleSignalee = false;
  const features = [];
  for (const r of gardes) {
    if (features.length >= limite) { tronque = true; avertissements.push('limite : ' + limite + ' entités rendues sur ' + gardes.length); break; }
    const props = proprietes(r.f.properties), coordonnees = arrondi7(r.f.geometry.coordinates);
    const taille = JSON.stringify(coordonnees).length + JSON.stringify(props).length + 80;
    if (sommets + r.sommets > SOMMETS_MAX || octets + taille > OCTETS_MAX) {
      tronque = true; if (!tailleSignalee) { tailleSignalee = true; avertissements.push('taille : plafond de ' + SOMMETS_MAX + ' sommets ou de ' + (OCTETS_MAX / 1048576) + ' Mo atteint'); }
      continue;
    }
    sommets += r.sommets; octets += taille;
    const id = (typeof r.f.id === 'number' && Number.isFinite(r.f.id)) || (typeof r.f.id === 'string' && r.f.id !== '') ? r.f.id : undefined;
    features.push({ type: 'Feature', ...(id !== undefined ? { id } : {}), geometry: { type: r.f.geometry.type, coordinates: coordonnees }, properties: props });
  }
  return { features, total: gardes.length, tronque, avertissements };
}
