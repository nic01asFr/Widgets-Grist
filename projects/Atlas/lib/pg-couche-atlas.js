/**
 * Une table PostgreSQL « en direct » comme VRAIE couche d'Atlas.
 *
 * Une couche d'Atlas porte ses entités (`layer.geojson`) : symbologie par classes, filtres, statistiques, fiche d'entité, ordre, légende, tout travaille dessus.
 * Pour une table modeste (le GeoJSON de `pg-direct.js`), la couche d'Atlas est donc alimentée par les lectures de la zone visible, au lieu que le module dessine
 * lui-même sa source : il garde les lectures, l'hôte garde la couche (`creerCoucheDirecte({ rendu })`).
 *
 * ## Ce qui n'est jamais écrit dans le document
 * Ni les entités (elles vivent en mémoire, relues à chaque déplacement), ni un jeton. Seule l'APPARENCE (style, visibilité) s'enregistre, dans `Atlas_LayerPrefs`, sous une
 * clé stable par table (`cleApparence`) : la couche retrouve son style quand on la remet sur la carte. Atlas range déjà ainsi les couches dont la donnée est ailleurs
 * (`clePrefsCouche`) ; il suffit à la couche de porter cette clé comme `manifestLayerId`.
 *
 * ## Ce que c'est, et n'est pas
 *  - lecture seule : une entité modifiée dans Atlas ne remonte pas dans PostgreSQL (« Modifier les données » écrit, lui, dans la base) et serait relue au déplacement suivant ;
 *  - la zone visible seulement : les statistiques et les classes se calculent sur ce qui est chargé, pas sur toute la table (au-delà de 20 000 lignes, le mode tuiles s'applique).
 *
 * Module pur : ni Grist, ni DOM, ni carte.
 */

const FAMILLES = {
  Point: 'Point', MultiPoint: 'Point',
  LineString: 'LineString', MultiLineString: 'LineString',
  Polygon: 'Polygon', MultiPolygon: 'Polygon',
};

/** La clé sous laquelle s'enregistre l'apparence : l'ORIGINE de l'adresse (jamais l'adresse entière, qui peut changer), la connexion, la table. */
export function cleApparence({ url, connexion, schema, table }) {
  let origine = String(url || '');
  try { origine = new URL(String(url)).origin; } catch { /* adresse illisible : on garde le texte, la clé reste stable pour elle */ }
  return `pg:${origine}:${connexion}:${schema}.${table}`;
}

/**
 * Le type de géométrie que le catalogue déclare pour une table (`geometries[0].type`, « PointZ » devient « Point »), ou `null` si on ne sait pas.
 * @param {{type?: string|null}[]} geometries
 */
export function typeDepuisCatalogue(geometries) {
  const brut = geometries && geometries[0] && geometries[0].type;
  if (!brut) return null;
  const sans = String(brut).replace(/(ZM|Z|M)$/i, '');
  return Object.prototype.hasOwnProperty.call(FAMILLES, sans) ? sans : null;
}

/**
 * Le type de géométrie d'une couche d'après ses entités : celui qui domine (une couche d'Atlas n'a qu'un type).
 * Une table mixte se dessine selon la famille la plus fréquente ; `defaut` quand il n'y a rien à lire.
 * @returns {string}
 */
export function typeDominant(entites, defaut = 'Polygon') {
  const compte = { Point: 0, LineString: 0, Polygon: 0 };
  const exacts = {};
  for (const e of entites || []) {
    const t = e && e.geometry && e.geometry.type;
    const famille = FAMILLES[t];
    if (!famille) continue;
    compte[famille]++;
    exacts[famille] = exacts[famille] || {};
    exacts[famille][t] = (exacts[famille][t] || 0) + 1;
  }
  const [famille, n] = Object.entries(compte).sort((a, b) => b[1] - a[1])[0];
  if (!n) return defaut;
  // Dans la famille retenue, le type exact le plus fréquent (Multi… ou non).
  return Object.entries(exacts[famille]).sort((a, b) => b[1] - a[1])[0][0];
}

/** Les identifiants MapLibre d'une couche d'Atlas, tels que l'édition PostgreSQL les attend : tout passe par la couche principale (surface, ligne ou point selon le type). */
export function identifiantsCoucheAtlas(layerId) {
  return { source: layerId, surface: layerId, ligne: layerId, point: layerId };
}
