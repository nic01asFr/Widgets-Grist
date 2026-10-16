/**
 * De simples données GeoJSON à une carte lisible : le manifeste est INFÉRÉ.
 *
 *   <atlas-bi src="…" donnees="/carte/sites.geojson"></atlas-bi>
 *
 * Ce que l'on déduit, et seulement cela (jamais de valeur inventée) :
 *  - une couche par entrée de `donnees` (`{ idCouche: … }`), ou une seule couche « donnees » pour une `FeatureCollection` ou un tableau de Features ;
 *  - le type de géométrie (point, ligne, surface). Des géométries mêlées dans une couche donnent une couche par type, nommées `<id>-points`, `<id>-lignes`,
 *    `<id>-surfaces` : un style de cercle sur une surface ne veut rien dire ;
 *  - des identifiants ENTIERS, uniques dans toute la scène (le contrat l'exige). Ceux de l'hôte sont gardés quand ils conviennent ; sinon ils sont
 *    numérotés et l'ancien identifiant est conservé dans la propriété `id_origine` ;
 *  - une clé métier (renvoyée dans `select.key`) : une propriété d'identifiant (`ref`, `code`, `identifiant`, `id`…) dont les valeurs sont toutes présentes et
 *    distinctes ; à défaut, l'ancien identifiant conservé dans `id_origine` ;
 *  - une classification de couleur : la première propriété texte qui n'a que 2 à 8 valeurs différentes, partagées par plusieurs entités, sur au moins
 *    80 % des entités. Sans couleur dans le style : le composant les prend dans la palette qualitative de la CHARTE de l'hôte ;
 *  - un contrôle de sélection sur cette même propriété (`setFilter` fonctionne sans que l'hôte écrive le manifeste).
 *
 * Tout ce qui est déduit est dit dans `notes` : la personne qui intègre voit ce que le composant a décidé et peut le fixer dans un manifeste
 * explicite, qui PRIME toujours sur l'inférence. Les données de l'hôte ne sont jamais modifiées : on travaille sur des copies.
 *
 * Module pur : aucune dépendance.
 */

/** Combien de valeurs différentes au plus pour qu'une propriété serve de classification. */
export const CLASSES_MAX = 8;
/** Part minimale des entités qui doivent porter la propriété. */
export const COUVERTURE_MIN = 0.8;

const CLES_METIER = ['ref', 'reference', 'code', 'identifiant', 'id_site', 'id', 'uid', 'insee', 'code_insee'];
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const entierSur = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

/** Le genre d'affichage d'une géométrie GeoJSON : point, line, polygon, ou null si illisible. */
export function genreDeGeometrie(g) {
  if (!estObjet(g)) return null;
  const t = String(g.type || '');
  if (t === 'Point' || t === 'MultiPoint') return 'point';
  if (t === 'LineString' || t === 'MultiLineString') return 'line';
  if (t === 'Polygon' || t === 'MultiPolygon') return 'polygon';
  return null;
}

/** Les Features d'une source GeoJSON (FeatureCollection, tableau, ou Feature seule). */
function featuresDe(s) {
  if (Array.isArray(s)) return s;
  if (estObjet(s) && s.type === 'FeatureCollection' && Array.isArray(s.features)) return s.features;
  if (estObjet(s) && s.type === 'Feature') return [s];
  return null;
}

/** Les sources par couche : `{ idCouche: source }`, ou une source unique rangée sous « donnees ». */
function sourcesParCouche(donnees) {
  if (featuresDe(donnees)) return { donnees };
  if (estObjet(donnees)) return donnees;
  return null;
}

const LIBELLES = { point: 'points', line: 'lignes', polygon: 'surfaces' };

/** Une propriété qui sert de clé : présente et distincte sur toutes les entités. */
function trouverCle(features) {
  if (features.length < 1) return null;
  const noms = new Set(); for (const f of features) for (const k of Object.keys(f.properties || {})) noms.add(k);
  const candidats = CLES_METIER.filter((c) => [...noms].some((n) => n.toLowerCase() === c)).map((c) => [...noms].find((n) => n.toLowerCase() === c));
  for (const k of candidats) {
    const vus = new Set(); let ok = true;
    for (const f of features) { const v = (f.properties || {})[k]; if (v === undefined || v === null || v === '') { ok = false; break; } vus.add(String(v)); }
    if (ok && vus.size === features.length) return k;
  }
  return null;
}

/** La première propriété texte à 2..CLASSES_MAX valeurs partagées, hors clé. */
function trouverClasses(features, cle) {
  const n = features.length; if (n < 3) return null;
  const noms = []; const vu = new Set();
  for (const f of features) for (const k of Object.keys(f.properties || {})) if (!vu.has(k)) { vu.add(k); noms.push(k); }
  for (const k of noms) {
    if (k === cle) continue;
    const compte = new Map(); let portees = 0, texte = true;
    for (const f of features) {
      const v = (f.properties || {})[k];
      if (v === undefined || v === null || v === '') continue;
      if (typeof v !== 'string') { texte = false; break; }
      portees++; compte.set(v, (compte.get(v) || 0) + 1);
    }
    if (!texte || portees / n < COUVERTURE_MIN) continue;
    if (compte.size < 2 || compte.size > CLASSES_MAX) continue;
    if (compte.size > portees / 2) continue;           // des valeurs presque toutes différentes : un libellé, pas une classe
    return { champ: k, valeurs: [...compte.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).map(([v]) => v) };
  }
  return null;
}

/**
 * @param {any} donnees  FeatureCollection, tableau de Features, ou `{ idCouche: source }`
 * @returns {{ manifeste: { layers: object[] }, donnees: Record<string, object[]>, notes: string[] }}
 * @throws {Error} message en clair quand rien n'est lisible
 */
export function inferer(donnees) {
  const sources = sourcesParCouche(donnees);
  if (!sources) throw new Error('inférence : les données doivent être une FeatureCollection, un tableau de Features ou un objet { idCouche: Features }');
  const notes = [], layers = [], sortie = {};
  const reservees = new Set();   // identifiants entiers déjà pris dans la scène
  const entrees = [];            // [idCouche, features]
  for (const [id, source] of Object.entries(sources)) {
    const feats = featuresDe(source);
    if (!feats) throw new Error(`inférence : la couche « ${id} » n'est pas une FeatureCollection ni un tableau de Features`);
    entrees.push([id, feats]);
    for (const f of feats) if (estObjet(f) && entierSur(f.id)) reservees.add(f.id);
  }
  if (!entrees.length) throw new Error('inférence : aucune donnée');
  let prochain = 1; const libre = () => { while (reservees.has(prochain)) prochain++; reservees.add(prochain); return prochain; };
  const utilises = new Set();

  for (const [id, feats] of entrees) {
    const valides = feats.filter((f) => estObjet(f) && estObjet(f.geometry) && genreDeGeometrie(f.geometry));
    if (valides.length < feats.length) notes.push(`« ${id} » : ${feats.length - valides.length} entité(s) sans géométrie lisible écartée(s)`);
    if (!valides.length) { notes.push(`« ${id} » : aucune entité à dessiner`); continue; }
    const parGenre = new Map();
    for (const f of valides) { const g = genreDeGeometrie(f.geometry); if (!parGenre.has(g)) parGenre.set(g, []); parGenre.get(g).push(f); }
    const mixte = parGenre.size > 1;
    if (mixte) notes.push(`« ${id} » mêle ${[...parGenre.keys()].map((g) => LIBELLES[g]).join(', ')} : une couche par type`);
    for (const [genre, groupe] of parGenre) {
      const idCouche = mixte ? `${id}-${LIBELLES[genre]}` : id;
      // identifiants : ceux de l'hôte s'ils sont entiers, uniques dans toute la scène ; sinon numérotation, ancien identifiant gardé
      const propres = groupe.every((f) => entierSur(f.id)) && new Set(groupe.map((f) => f.id)).size === groupe.length && groupe.every((f) => !utilises.has(f.id));
      let renumerote = false;
      const copies = groupe.map((f) => {
        const props = estObjet(f.properties) ? { ...f.properties } : {};
        let fid = f.id;
        if (!propres) {
          renumerote = true;
          if (f.id !== undefined && f.id !== null && props.id_origine === undefined) props.id_origine = f.id;
          fid = libre();
        }
        utilises.add(fid);
        return { type: 'Feature', id: fid, properties: props, geometry: f.geometry };
      });
      if (renumerote) notes.push(`« ${idCouche} » : identifiants numérotés de 1 à N (l'identifiant d'origine, s'il existait, est dans la propriété id_origine)`);
      const def = { id: idCouche, name: idCouche === 'donnees' ? 'Données' : idCouche, geometry_type: genre };
      // la clé la plus parlante : une propriété d'identifiant de l'hôte, à défaut l'ancien identifiant conservé
      const cle = trouverCle(copies) || ((renumerote && copies.some((f) => f.properties.id_origine !== undefined)) ? 'id_origine' : null);
      if (cle) { def.cle = cle; notes.push(`« ${idCouche} » : clé métier « ${cle} »`); }
      const classes = trouverClasses(copies, cle);
      if (classes) {
        def.style = { declarative: { kind: 'categorized', field: classes.champ, stops: classes.valeurs.map((value) => ({ value, label: value })) } };
        def.controls = [{ id: `f-${classes.champ}`, field: classes.champ, type: 'select' }];
        notes.push(`« ${idCouche} » : couleurs par « ${classes.champ} » (${classes.valeurs.length} valeurs), filtre « f-${classes.champ} »`);
      }
      layers.push(def); sortie[idCouche] = copies;
    }
  }
  if (!layers.length) throw new Error('inférence : aucune entité à dessiner dans les données');
  return { manifeste: { layers }, donnees: sortie, notes };
}
