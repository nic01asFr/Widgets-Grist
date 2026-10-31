/**
 * Les bâtiments du fond de carte, lus pour l'hôte (commande `getBuildings`, contrat 0.4) : une page qui pose sa propre 3D au-dessus de la carte a besoin des
 * emprises et des hauteurs, que MapLibre ne rend qu'en pixels.
 *
 * Module pur : il reçoit les entités de la source (`querySourceFeatures`), il ne lit ni la carte ni le réseau. Ce qu'il fait, d'après une mesure réelle
 * (OpenFreeMap, Marseille, zoom 15 : 155 entités lues, 146 identifiants, 9 répétés dont 5 copies strictement identiques et 4 vrais fragments) :
 *  - un bâtiment coupé par un joint de tuile est livré en plusieurs fragments de MÊME identifiant : une copie identique est retirée, et quand un identifiant garde
 *    plusieurs géométries différentes, chaque fragment porte `coupe: true` (les fragments ne sont PAS réunis : l'hôte qui extrude fragment par fragment verra des coutures) ;
 *  - seules les propriétés `render_height` (hauteur) et `render_min_height` (base) traversent, et seulement si ce sont des nombres finis : aucune chaîne d'une tuile
 *    tierce ne passe le pont. Une hauteur 0 veut dire « inconnue » chez OpenStreetMap : elle est rendue telle quelle, à l'hôte de décider.
 *
 *  - une entité de plus de SOMMETS_PAR_ENTITE_MAX sommets est ignorée (et nommée dans les avertissements), une entité qui ferait dépasser le budget de taille est sautée : une seule
 *    entité géante ne prive pas l'hôte de tous les autres bâtiments (mesuré : sans cela, 2 bâtiments rendus sur 55).
 *
 * Données dérivées d'OpenStreetMap (ODbL) : l'attribution est rendue avec la réponse et doit être affichée par l'hôte.
 */
export const VERSION = '1.0.0';

export const ZOOM_MINIMAL = 14;
export const LIMITE_DEFAUT = 2000;
export const LIMITE_MAX = 5000;
export const SOMMETS_MAX = 200000;
/** Au-delà, une entité n'est pas un bâtiment mais un ensemble (mesuré : 35 216 sommets pour un seul « bâtiment » du Vieux-Port, médiane 21, 90 % sous 300) : elle est ignorée et nommée. */
export const SOMMETS_PAR_ENTITE_MAX = 20000;
export const OCTETS_MAX = 2 * 1024 * 1024;
export const APPELS_PAR_SECONDE = 5;
export const ATTRIBUTION = '© OpenStreetMap contributors, © OpenMapTiles, OpenFreeMap';

const fini = (v) => typeof v === 'number' && Number.isFinite(v);

/** Les options de la commande, vérifiées ; lève une erreur lisible. `bbox` : [ouest, sud, est, nord] ou null. */
export function normaliserOptionsBatiments(o) {
  const options = o === undefined ? {} : o;
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('getBuildings : un objet d\'options est attendu');
  const limite = options.limite === undefined ? LIMITE_DEFAUT : options.limite;
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAX) throw new Error('getBuildings : limite hors bornes (1 à ' + LIMITE_MAX + ')');
  const hauteurMin = options.hauteurMin === undefined ? 0 : options.hauteurMin;
  if (!fini(hauteurMin) || hauteurMin < 0 || hauteurMin > 1000) throw new Error('getBuildings : hauteurMin hors bornes (0 à 1000)');
  let bbox = null;
  if (options.bbox !== undefined) {
    const b = options.bbox;
    if (!Array.isArray(b) || b.length !== 4 || !b.every(fini) || b[0] < -180 || b[2] > 180 || b[1] < -90 || b[3] > 90 || !(b[0] < b[2]) || !(b[1] < b[3])) throw new Error('getBuildings : bbox mal formée (ouest, sud, est, nord)');
    bbox = [...b];
  }
  return { limite, hauteurMin, bbox };
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

/** L'intersection de deux emprises [ouest, sud, est, nord], ou null si elle est vide. */
export function intersection(a, b) {
  const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[0] < r[2] && r[1] < r[3] ? r : null;
}

const arrondi7 = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 1e7) / 1e7, Math.round(c[1] * 1e7) / 1e7] : c.map(arrondi7));

function emprise(coordonnees) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, sommets = 0;
  const v = (c) => { if (typeof c[0] === 'number') { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; sommets++; } else for (const e of c) v(e); };
  v(coordonnees);
  return { boite: [x0, y0, x1, y1], sommets };
}

const geometrieValide = (g) => !!g && (g.type === 'Polygon' || g.type === 'MultiPolygon') && Array.isArray(g.coordinates) && g.coordinates.length > 0;

/**
 * Les bâtiments d'une liste d'entités de la source.
 * @param {{id?:any, geometry:{type:string, coordinates:any}, properties?:object}[]} entites
 * @param {{bbox:number[], limite:number, hauteurMin:number}} o  `bbox` : l'emprise utile (déjà intersectée avec la vue)
 * @returns {{features:object[], total:number, tronque:boolean, avertissements:string[]}}
 */
export function batimentsDeEntites(entites, { bbox, limite, hauteurMin }) {
  const avertissements = [];
  const vus = new Map();        // identifiant -> ensemble des géométries distinctes (en texte)
  const retenus = [];
  let ignores = 0;
  for (const f of Array.isArray(entites) ? entites : []) {
    if (!f || !geometrieValide(f.geometry)) { ignores++; continue; }
    const p = f.properties || {};
    const hauteur = fini(p.render_height) ? p.render_height : null, base = fini(p.render_min_height) ? p.render_min_height : 0;
    const { boite, sommets } = emprise(f.geometry.coordinates);
    if (!(boite[2] >= bbox[0] && boite[0] <= bbox[2] && boite[3] >= bbox[1] && boite[1] <= bbox[3])) continue;   // hors de l'emprise utile
    if (hauteurMin > 0 && !(hauteur !== null && hauteur >= hauteurMin)) continue;
    const coordonnees = arrondi7(f.geometry.coordinates), texte = JSON.stringify(coordonnees);
    const id = (typeof f.id === 'number' && Number.isFinite(f.id)) || (typeof f.id === 'string' && f.id !== '') ? f.id : undefined;
    const cle = id === undefined ? null : id;
    if (cle !== null) {
      if (!vus.has(cle)) vus.set(cle, new Set());
      if (vus.get(cle).has(texte)) continue;                 // la copie identique d'une autre tuile
      vus.get(cle).add(texte);
    } else if (retenus.some((r) => r.texte === texte)) continue;
    retenus.push({ id, cle, texte, type: f.geometry.type, coordonnees, hauteur, base, sommets });
  }
  if (ignores) avertissements.push('entites-ignorees : ' + ignores + ' entité(s) sans géométrie de surface');
  const geants = retenus.filter((r) => r.sommets > SOMMETS_PAR_ENTITE_MAX);
  if (geants.length) avertissements.push('geometrie-trop-grande : ' + geants.length + ' entité(s) de plus de ' + SOMMETS_PAR_ENTITE_MAX + ' sommets ignorée(s)' + (geants.some((g) => g.id !== undefined) ? ' (identifiants : ' + geants.filter((g) => g.id !== undefined).slice(0, 5).map((g) => g.id).join(', ') + ')' : ''));
  const gardes = retenus.filter((r) => r.sommets <= SOMMETS_PAR_ENTITE_MAX);
  let sommets = 0, octets = 0, tronque = false, tailleSignalee = false;
  const features = [];
  for (const r of gardes) {
    if (features.length >= limite) { tronque = true; avertissements.push('limite : ' + limite + ' bâtiments rendus sur ' + gardes.length); break; }
    if (sommets + r.sommets > SOMMETS_MAX || octets + r.texte.length + 80 > OCTETS_MAX) {   // cette entité ferait dépasser le budget : on la saute, les suivantes peuvent être plus petites
      tronque = true; if (!tailleSignalee) { tailleSignalee = true; avertissements.push('taille : plafond de ' + SOMMETS_MAX + ' sommets ou de ' + (OCTETS_MAX / 1048576) + ' Mo atteint'); }
      continue;
    }
    sommets += r.sommets; octets += r.texte.length + 80;
    const coupe = r.cle !== null && vus.get(r.cle).size > 1;
    features.push({ type: 'Feature', ...(r.id !== undefined ? { id: r.id } : {}), geometry: { type: r.type, coordinates: r.coordonnees }, properties: { hauteur: r.hauteur, base: r.base, coupe } });
  }
  return { features, total: gardes.length, tronque, avertissements };
}
