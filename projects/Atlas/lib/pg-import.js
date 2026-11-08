/**
 * Importer une couche de pg-gateway dans Grist : du `FeatureCollection` aux colonnes d'une table Atlas.
 *
 * Module pur (ni Grist, ni DOM, ni réseau) : il rend un PLAN que l'application exécute (création de la table et de son inventaire
 * par `actionsNouvelleCouche`, puis écriture des lots). Le plan ne touche jamais `SceneManifest`.
 *
 * ## La convention géographique (skills/geo-grist-convention.md)
 *  - points : `latitude` / `longitude` (WGS84) ;
 *  - lignes et surfaces : `geometry_json` (GeoJSON WGS84, en texte) + `centroid_lat` / `centroid_lon` ;
 *  - lots de 100 lignes quand la table porte une géométrie, 500 sinon.
 *
 * ## Les échecs qu'on refuse de rendre silencieux
 *  - une absence reste `null`, jamais 0 ni « » (n°6) ;
 *  - un résultat tronqué n'est pas importé : une table qui se croit complète et ne l'est pas ressemble à une table complète ;
 *  - une couche aux géométries mêlées (points et surfaces) est refusée en le disant : une couche = une table d'un seul type ;
 *  - une géométrie sans SRID, signalée par la passerelle, est répétée à la personne.
 */

import { planNomDeTable } from './nouvelle-couche.js?v=20261003f';

export const TAILLE_LOT_GEOMETRIE = 100;
export const TAILLE_LOT_SANS_GEOMETRIE = 500;

/** Les colonnes que l'import écrit lui-même : un attribut de la base ne doit pas les prendre. */
const RESERVES_POINT = ['latitude', 'longitude'];
const RESERVES_AUTRE = ['geometry_json', 'centroid_lat', 'centroid_lon'];

/**
 * L'identifiant Grist d'une colonne : accents translittérés, le reste réduit à des soulignés, jamais « id » ni un nom d'assistant
 * de Grist, jamais deux fois le même (Grist ne distingue pas la casse).
 * @param {string} nom
 * @param {Set<string>} pris  noms déjà donnés, en minuscules ; mis à jour
 */
export function identifiantColonne(nom, pris) {
  let id = String(nom == null ? '' : nom).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!id) id = 'colonne';
  if (/^[0-9]/.test(id)) id = 'c_' + id;
  if (id.toLowerCase() === 'id' || id.startsWith('gristHelper_')) id = 'pg_' + id;
  let candidat = id;
  for (let n = 2; pris.has(candidat.toLowerCase()); n++) candidat = `${id}_${n}`;
  pris.add(candidat.toLowerCase());
  return candidat;
}

const FAMILLES = {
  Point: 'Point', MultiPoint: 'Point',
  LineString: 'LineString', MultiLineString: 'LineString',
  Polygon: 'Polygon', MultiPolygon: 'Polygon',
};

/** Le type de la couche (celui d'Atlas) d'après ses entités, ou les types mêlés qui l'en empêchent. */
export function typeDeCouche(features) {
  const compte = {};
  for (const f of features) {
    const t = f && f.geometry && FAMILLES[f.geometry.type];
    if (t) compte[t] = (compte[t] || 0) + 1;
  }
  const types = Object.keys(compte);
  if (types.length === 0) return { type: null, mixte: false, compte };
  if (types.length > 1) return { type: null, mixte: true, compte };
  return { type: types[0], mixte: false, compte };
}

function sommets(coordonnees, sortie = []) {
  if (!Array.isArray(coordonnees)) return sortie;
  if (typeof coordonnees[0] === 'number') { sortie.push(coordonnees); return sortie; }
  for (const c of coordonnees) sommets(c, sortie);
  return sortie;
}

/** Un point représentatif en WGS84 : le point lui-même, ou la moyenne des sommets (centre de l'emprise pour les surfaces). */
export function centre(geometrie) {
  if (!geometrie) return null;
  const pts = sommets(geometrie.coordinates);
  if (!pts.length) return null;
  if (geometrie.type === 'Point') return { lon: pts[0][0], lat: pts[0][1] };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return { lon: (minX + maxX) / 2, lat: (minY + maxY) / 2 };
}

function enSecondes(v) {
  const t = Date.parse(v);
  return Number.isFinite(t) ? t / 1000 : null;
}

/** La valeur d'une cellule selon le type Grist de sa colonne. Une absence reste `null`. */
export function convertir(v, type) {
  if (v === null || v === undefined) return null;
  if (type === 'Date' && typeof v === 'string') {
    const t = enSecondes(v.length === 10 ? v + 'T00:00:00Z' : v);
    return t === null ? v : t;
  }
  if (type === 'DateTime' && typeof v === 'string') {
    const t = enSecondes(v);
    return t === null ? v : t;
  }
  if (type === 'Int' || type === 'Numeric') return typeof v === 'number' ? v : String(v); // hors précision : gardé en texte
  if (type === 'Bool') return typeof v === 'boolean' ? v : String(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return typeof v === 'string' ? v : String(v);
}

/** Le type Grist d'une colonne d'après ses valeurs (quand la passerelle n'en dit rien). */
function typeDepuisValeurs(valeurs) {
  const lues = valeurs.filter((v) => v !== null && v !== undefined);
  if (!lues.length) return 'Text';
  if (lues.every((v) => typeof v === 'boolean')) return 'Bool';
  if (lues.every((v) => typeof v === 'number')) return lues.every(Number.isInteger) ? 'Int' : 'Numeric';
  return 'Text';
}

/**
 * Le plan d'import d'une réponse de `pg_gateway_couche`.
 *
 * @param {object} p
 * @param {object} p.couche  la réponse (FeatureCollection + `colonnes`, `tronque`, `limite`, `avertissements`)
 * @param {string} p.nom  le nom voulu pour la couche
 * @param {string[]} [p.tables]  les tables du document
 * @returns {{ok:false, erreur:string} | {ok:true, tableId:string, titre:string, geometrie:string, colonnes:object[], valeurs:object,
 *   nbLignes:number, lots:number[][], geometryColumn:(string|{lat:string,lng:string}), avertissements:string[]}}
 */
export function planImportPg({ couche, nom, tables = [] }) {
  const features = Array.isArray(couche && couche.features) ? couche.features : [];
  if (!features.length) return { ok: false, erreur: 'Aucune entité dans cette zone : rien à importer.' };
  if (couche.tronque) {
    return {
      ok: false,
      erreur: `Le résultat est tronqué à ${couche.limite} entités : la table serait incomplète. Zoomez pour réduire la zone importée.`,
    };
  }
  const { type, mixte, compte } = typeDeCouche(features);
  if (mixte) {
    const detail = Object.entries(compte).map(([t, n]) => `${n} ${t}`).join(', ');
    return { ok: false, erreur: `Géométries de types mêlés (${detail}) : une couche Atlas est d'un seul type. Importez-les séparément.` };
  }
  if (!type) return { ok: false, erreur: 'Aucune entité n’a de géométrie : rien à placer sur la carte.' };
  const nomDeTable = planNomDeTable(nom, tables);
  if (!nomDeTable.ok) return { ok: false, erreur: nomDeTable.erreur };

  const estPoint = type === 'Point';
  const pris = new Set((estPoint ? RESERVES_POINT : RESERVES_AUTRE).map((s) => s.toLowerCase()));
  const typesPasserelle = new Map((couche.colonnes || []).map((c) => [c.nom, c.type_grist]));
  const noms = [...typesPasserelle.keys()];
  for (const f of features) for (const k of Object.keys(f.properties || {})) if (!typesPasserelle.has(k) && !noms.includes(k)) noms.push(k);

  const colonnes = [];
  const valeurs = {};
  for (const n of noms) {
    const brutes = features.map((f) => (f.properties ? f.properties[n] : null));
    const typeGrist = typesPasserelle.get(n) || typeDepuisValeurs(brutes);
    const id = identifiantColonne(n, pris);
    colonnes.push({ id, type: typeGrist, label: n });
    valeurs[id] = brutes.map((v) => convertir(v, typeGrist));
  }

  let geometryColumn;
  if (estPoint) {
    const pts = features.map((f) => centre(f.geometry));
    colonnes.push({ id: 'latitude', type: 'Numeric', label: 'Latitude' }, { id: 'longitude', type: 'Numeric', label: 'Longitude' });
    valeurs.latitude = pts.map((p) => (p ? p.lat : null));
    valeurs.longitude = pts.map((p) => (p ? p.lon : null));
    geometryColumn = { lat: 'latitude', lng: 'longitude' };
  } else {
    const cs = features.map((f) => centre(f.geometry));
    colonnes.push(
      { id: 'geometry_json', type: 'Text', label: 'Géométrie (GeoJSON)' },
      { id: 'centroid_lat', type: 'Numeric', label: 'centroid_lat' },
      { id: 'centroid_lon', type: 'Numeric', label: 'centroid_lon' },
    );
    valeurs.geometry_json = features.map((f) => (f.geometry ? JSON.stringify(f.geometry) : null));
    valeurs.centroid_lat = cs.map((c) => (c ? c.lat : null));
    valeurs.centroid_lon = cs.map((c) => (c ? c.lon : null));
    geometryColumn = 'geometry_json';
  }

  const taille = TAILLE_LOT_GEOMETRIE; // la table porte toujours une géométrie ici
  const lots = [];
  for (let d = 0; d < features.length; d += taille) lots.push([d, Math.min(features.length, d + taille)]);

  return {
    ok: true,
    tableId: nomDeTable.tableId,
    titre: String(nom).trim(),
    geometrie: type,
    colonnes,
    valeurs,
    nbLignes: features.length,
    lots,
    geometryColumn,
    avertissements: [...(couche.avertissements || [])],
  };
}

/** Les colonnes d'un lot, prêtes pour `BulkAddRecord`. */
export function colonnesDuLot(plan, [debut, fin]) {
  const sortie = {};
  for (const [id, vals] of Object.entries(plan.valeurs)) sortie[id] = vals.slice(debut, fin);
  return sortie;
}

/** Le message d'un import qui échoue après la création de la table : ce qui existe, ce qui manque, pourquoi. */
export function messageImportPartiel({ table, importees, total, lot, cause }) {
  return `Table « ${table} » créée, ${importees} ligne(s) sur ${total} importée(s), échec au lot ${lot} : ${cause}`;
}
