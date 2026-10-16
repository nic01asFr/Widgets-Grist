/**
 * Ce que l'hôte passe à `setScene` est vérifié AVANT le montage : une erreur de forme se dit en clair, au lieu de ressortir en message JavaScript brut
 * (« features.forEach is not a function ») ou, pire, de réussir en silence avec une carte vide.
 *
 * Constats du 15/10/2026 (essai « une balise, cinq minutes ») : une `FeatureCollection` passée à la place du tableau de Features donnait le message brut
 * ci-dessus ; des coordonnées hors plage ou une entité sans géométrie étaient acceptées sans un mot.
 *
 * Module pur : aucune dépendance, aucun accès à la carte. Deux sorties :
 *  - `erreur` : la couche est REFUSÉE (seule : les autres se montent), avec ce qu'il faut corriger ;
 *  - `avertissements` : la couche se monte, mais l'hôte est prévenu (`_avertissements` du résultat, `avertissements` de l'événement `ready`).
 */

/** Combien d'exemples un avertissement cite au plus. */
const EXEMPLES = 3;

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Les paires [lng, lat] d'une géométrie (tous types), à plat. */
function positions(g, sortie = []) {
  if (!g || typeof g !== 'object') return sortie;
  if (g.type === 'GeometryCollection') { for (const x of g.geometries || []) positions(x, sortie); return sortie; }
  const c = g.coordinates;
  const descendre = (a) => {
    if (!Array.isArray(a)) return;
    if (a.length >= 2 && typeof a[0] === 'number' && typeof a[1] === 'number') { sortie.push(a); return; }
    for (const x of a) descendre(x);
  };
  descendre(c);
  return sortie;
}

/**
 * @param {{ id: string }} def  la couche du manifeste
 * @param {any} source          ce que l'hôte a passé pour cette couche (`donnees[def.id]`) ou `def.geojson.features`
 * @returns {{ erreur: string|null, avertissements: string[] }}
 */
export function diagnostiquerCouche(def, source) {
  const id = (def && def.id) || '?';
  const avertissements = [];
  if (source === undefined || source === null) return { erreur: null, avertissements };   // aucune donnée fournie : couche vide, comme avant
  if (!Array.isArray(source)) {
    if (estObjet(source) && source.type === 'FeatureCollection') {
      return { erreur: `donnees["${id}"] doit être un TABLEAU de Features ; une FeatureCollection a été reçue : passez \`collection.features\``, avertissements };
    }
    return { erreur: `donnees["${id}"] doit être un tableau de Features GeoJSON (reçu : ${source === null ? 'null' : typeof source})`, avertissements };
  }
  let sansGeometrie = 0, horsPlage = 0, doublons = 0, nonFeature = 0;   // une entité sans `id` reçoit un numéro d'ordre (contrat) : pas un avertissement
  const exemplesHors = [], vus = new Set();
  source.forEach((f, i) => {
    if (!estObjet(f)) { nonFeature++; return; }
    if (f.id !== undefined && f.id !== null) { if (vus.has(f.id)) doublons++; else vus.add(f.id); }
    const g = f.geometry;
    if (!estObjet(g) || (g.type !== 'GeometryCollection' && !Array.isArray(g.coordinates))) { sansGeometrie++; return; }
    for (const [x, y] of positions(g)) {
      if (!(x >= -180 && x <= 180 && y >= -90 && y <= 90)) { horsPlage++; if (exemplesHors.length < EXEMPLES) exemplesHors.push(`entité ${i + 1} : [${x}, ${y}]`); break; }
    }
  });
  if (nonFeature) return { erreur: `donnees["${id}"] contient ${nonFeature} élément(s) qui ne sont pas des Features (objets GeoJSON attendus)`, avertissements };
  if (sansGeometrie) avertissements.push(`${sansGeometrie} entité(s) sans géométrie lisible : elles ne seront pas dessinées`);
  if (horsPlage) avertissements.push(`${horsPlage} entité(s) avec des coordonnées hors plage (longitude entre -180 et 180, latitude entre -90 et 90) : ${exemplesHors.join(' ; ')} ; ordre [longitude, latitude] respecté ?`);
  if (doublons) avertissements.push(`${doublons} identifiant(s) en double : \`select\` et \`updateFeature\` n'atteindront que la dernière entité de chaque identifiant`);
  return { erreur: null, avertissements };
}
