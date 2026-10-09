/**
 * Lire la BD TOPO par le WFS de la Géoplateforme (IGN), sans clé.
 *
 * Module sans état : `fetch` et l'attente entre deux requêtes sont injectables, si bien que les tests n'ont besoin
 * d'aucun réseau. Rien ici n'est propre à un usage : le module donne des entités GeoJSON, et c'est à l'appelant d'en
 * faire un graphe (`graphe-routier.js`), une couche, un rapport.
 *
 * ## Ce que le service impose (mesuré le 09/10/2026, voir `docs/DONNEES-IGN.md`)
 *
 * - **L'emprise se donne par `BBOX=lonMin,latMin,lonMax,latMax,EPSG:4326`.** Le filtre `CQL_FILTER=BBOX(geometrie, …)`
 *   répond HTTP 200 et **zéro objet**, sans erreur (cause non établie, vraisemblablement le système de coordonnées
 *   attendu par le filtre). Ce client
 *   n'emploie donc jamais le CQL pour une emprise ; les autres critères (une route, une nature) se filtrent
 *   **côté client** (`filtre`), après lecture.
 * - **Un tri est obligatoire dès qu'on pagine.** Sans `SORTBY`, deux pages successives n'ont pas d'ordre garanti : sur
 *   la même emprise, `STARTINDEX=2` sans tri et avec `SORTBY=cleabs` ont rendu des objets différents. Sans tri, une
 *   pagination peut sauter ou répéter des objets sans rien signaler. Le client envoie toujours `SORTBY` (`cleabs`
 *   par défaut) et en vérifie l'effet (voir `dedoublonner`).
 * - **Les erreurs sont du XML.** Un type inconnu ou une emprise illisible rendent HTTP 400 et un
 *   `ows:ExceptionReport`, pas du JSON : le texte de l'exception est remonté tel quel.
 * - **Les positions portent une altitude** (`[lng, lat, z]`) : ce module les rend telles quelles, c'est le graphe qui
 *   les réduit à deux dimensions.
 * - Quota annoncé : 30 requêtes par seconde pour le WFS (CGU de cartes.gouv.fr). Une pause de 200 ms sépare les pages.
 *
 * Données en Licence Ouverte 2.0 : citer l'IGN comme source.
 */

export const URL_WFS = 'https://data.geopf.fr/wfs/ows';

/** Les couches utiles à un réseau routier. D'autres couches `BDTOPO_V3:*` se lisent de la même façon. */
export const COUCHES = Object.freeze({
  troncons: 'BDTOPO_V3:troncon_de_route',
  nonCommunication: 'BDTOPO_V3:non_communication',
  pointsDeRepere: 'BDTOPO_V3:point_de_repere',
  sectionsDeRepere: 'BDTOPO_V3:section_de_points_de_repere',
  /** Objets créés, modifiés ou détruits depuis la précédente édition trimestrielle. */
  differentielTroncons: 'BDTOPO_V3_DIFF:troncon_de_route',
});

/** Les attributs d'un tronçon que lisent le graphe et le calage. */
export const PROPRIETES_TRONCON = Object.freeze([
  'cleabs', 'nature', 'nom_collaboratif_gauche', 'nom_collaboratif_droite', 'nom_voie_ban_gauche', 'importance',
  'sens_de_circulation', 'nombre_de_voies', 'largeur_de_chaussee', 'vitesse_moyenne_vl', 'cpx_numero',
  'cpx_toponyme_route_nommee', 'cpx_classement_administratif', 'position_par_rapport_au_sol', 'acces_vehicule_leger',
  'etat_de_l_objet', 'urbain', 'fictif', 'date_creation', 'date_modification', 'date_d_apparition',
  'date_de_confirmation',
]);

const TAILLE_PAGE = 1000;
const TAILLE_PAGE_MAX = 5000;
const OBJETS_MAX = 20000;
const COTE_MAX_DEGRES = 1;

/**
 * Une erreur du client, avec un `code` stable pour que l'appelant choisisse quoi dire :
 * `emprise_invalide`, `emprise_trop_grande`, `parametre_invalide`, `reseau`, `http`, `exception_ogc`,
 * `reponse_illisible`, `trop_d_objets`, `annule`.
 */
export class ErreurWfs extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ErreurWfs';
    this.code = code;
    Object.assign(this, details);
  }
}

/**
 * Vérifie une emprise `[lonMin, latMin, lonMax, latMax]` en degrés WGS84. L'ordre longitude, latitude est celui de
 * GeoJSON, et c'est aussi celui qu'attend le `BBOX` du service avec `EPSG:4326`.
 * @returns {number[]} l'emprise, inchangée
 */
export function validerEmprise(emprise, { coteMax = COTE_MAX_DEGRES } = {}) {
  if (!Array.isArray(emprise) || emprise.length !== 4 || !emprise.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new ErreurWfs('emprise_invalide', 'L’emprise doit être [lonMin, latMin, lonMax, latMax], en degrés.');
  }
  const [x0, y0, x1, y1] = emprise;
  if (x0 < -180 || x1 > 180 || y0 < -90 || y1 > 90) {
    throw new ErreurWfs('emprise_invalide', `Emprise hors du globe : ${emprise.join(', ')} (ordre attendu : longitude, latitude).`);
  }
  if (x0 >= x1 || y0 >= y1) {
    throw new ErreurWfs('emprise_invalide', `Emprise vide ou inversée : ${emprise.join(', ')}.`);
  }
  if (x1 - x0 > coteMax || y1 - y0 > coteMax) {
    throw new ErreurWfs('emprise_trop_grande', `Emprise de plus de ${coteMax}° de côté : réduisez-la ou découpez-la.`);
  }
  return emprise;
}

/**
 * L'emprise d'une ou plusieurs lignes, élargie d'une marge en mètres. C'est la manière normale de charger le réseau
 * dont a besoin un calage : le couloir autour du tracé.
 * @param {number[][]|number[][][]} lignes une ligne `[[lng, lat], …]` ou une liste de lignes
 * @param {number} [margeM]
 */
export function empriseDeLignes(lignes, margeM = 150) {
  const toutes = Array.isArray(lignes[0]) && Array.isArray(lignes[0][0]) ? lignes : [lignes];
  const pts = toutes.flat().filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!pts.length) throw new ErreurWfs('emprise_invalide', 'Aucune position pour calculer l’emprise.');
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const latMoy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const dLat = margeM / 111320;
  const dLng = margeM / (111320 * Math.max(0.01, Math.cos((latMoy * Math.PI) / 180)));
  const arrondi = (v) => Math.round(v * 1e7) / 1e7;
  return [arrondi(Math.min(...xs) - dLng), arrondi(Math.min(...ys) - dLat), arrondi(Math.max(...xs) + dLng), arrondi(Math.max(...ys) + dLat)];
}

const encoder = (v) => encodeURIComponent(v).replace(/%2C/g, ',').replace(/%3A/g, ':');

/**
 * L'adresse d'une page `GetFeature`. Toujours triée (`SORTBY`), toujours avec `BBOX` et non `CQL_FILTER`.
 * @param {{couche: string, emprise?: number[], count?: number, debut?: number, tri?: string, url?: string}} o
 */
export function urlGetFeature({ couche, emprise, count = TAILLE_PAGE, debut = 0, tri = 'cleabs', url = URL_WFS }) {
  if (!couche || typeof couche !== 'string') throw new ErreurWfs('parametre_invalide', 'Nom de couche manquant.');
  if (!tri) throw new ErreurWfs('parametre_invalide', 'Un tri est obligatoire : sans lui, la pagination n’est pas fiable.');
  if (!Number.isInteger(count) || count < 1 || count > TAILLE_PAGE_MAX) {
    throw new ErreurWfs('parametre_invalide', `Taille de page hors de [1, ${TAILLE_PAGE_MAX}] : ${count}.`);
  }
  if (!Number.isInteger(debut) || debut < 0) throw new ErreurWfs('parametre_invalide', `Début de page invalide : ${debut}.`);
  const params = [
    ['SERVICE', 'WFS'], ['VERSION', '2.0.0'], ['REQUEST', 'GetFeature'], ['TYPENAMES', couche],
    ['OUTPUTFORMAT', 'application/json'], ['SRSNAME', 'EPSG:4326'], ['COUNT', count], ['STARTINDEX', debut], ['SORTBY', tri],
  ];
  if (emprise) params.push(['BBOX', `${validerEmprise(emprise).join(',')},EPSG:4326`]);
  return `${url}?${params.map(([k, v]) => `${k}=${encoder(v)}`).join('&')}`;
}

const attenteParDefaut = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function texteException(texte) {
  const m = /<ows:ExceptionText>([\s\S]*?)<\/ows:ExceptionText>/.exec(texte);
  return m ? m[1].replace(/\s+/g, ' ').trim() : texte.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

/**
 * Une requête, relue en JSON, avec reprise sur les pannes qui passent (réseau, 429, 5xx). Les erreurs de requête
 * (400, 404) ne sont pas rejouées : elles reviendraient à l'identique.
 */
async function demanderJson(adresse, { fetch: f = globalThis.fetch, attendre = attenteParDefaut, essais = 3, signal } = {}) {
  if (typeof f !== 'function') throw new ErreurWfs('reseau', 'Aucun fetch disponible.');
  let derniere = null;
  for (let n = 0; n < essais; n++) {
    if (signal?.aborted) throw new ErreurWfs('annule', 'Lecture annulée.');
    let reponse;
    try {
      reponse = await f(adresse, { headers: { Accept: 'application/json' }, signal });
    } catch (e) {
      if (signal?.aborted || e?.name === 'AbortError') throw new ErreurWfs('annule', 'Lecture annulée.');
      derniere = new ErreurWfs('reseau', `Le service WFS est injoignable : ${e?.message || e}.`);
      if (n < essais - 1) await attendre(1000 * (n + 1));
      continue;
    }
    const texte = await reponse.text();
    if (reponse.status === 429 || reponse.status >= 500) {
      const reprise = Number(reponse.headers?.get?.('retry-after'));
      derniere = new ErreurWfs('http', `Le service WFS a répondu ${reponse.status}.`, { status: reponse.status, extrait: texte.slice(0, 200) });
      if (n < essais - 1) await attendre(Number.isFinite(reprise) && reprise > 0 ? reprise * 1000 : 1000 * (n + 1));
      continue;
    }
    if (texte.trimStart().startsWith('<')) {
      throw new ErreurWfs('exception_ogc', `Le service WFS refuse la requête (${reponse.status}) : ${texteException(texte)}`, { status: reponse.status });
    }
    let json;
    try {
      json = JSON.parse(texte);
    } catch {
      throw new ErreurWfs('reponse_illisible', `Réponse du service WFS illisible (${reponse.status}).`, { status: reponse.status, extrait: texte.slice(0, 200) });
    }
    if (!reponse.ok) {
      throw new ErreurWfs('http', `Le service WFS a répondu ${reponse.status}.`, { status: reponse.status, extrait: texte.slice(0, 200) });
    }
    return json;
  }
  throw derniere;
}

/** Retire les objets déjà vus (même `id`, à défaut même `cleabs`) : une pagination interrompue puis reprise en répète. */
export function dedoublonner(features) {
  const vus = new Set();
  const out = [];
  for (const f of features) {
    const k = f.id ?? f.properties?.cleabs;
    if (k !== undefined && k !== null) {
      if (vus.has(k)) continue;
      vus.add(k);
    }
    out.push(f);
  }
  return out;
}

/**
 * Un échantillon régulier et reproductible de `n` objets au plus (pas de hasard : mêmes entrées, même échantillon).
 */
export function echantillonner(liste, n) {
  if (!Number.isInteger(n) || n < 1) throw new ErreurWfs('parametre_invalide', `Taille d’échantillon invalide : ${n}.`);
  if (liste.length <= n) return liste.slice();
  const out = [];
  for (let k = 0; k < n; k++) out.push(liste[Math.floor((k * liste.length) / n)]);
  return out;
}

/** Ne garde de chaque objet que les attributs listés (réduit le poids d'un jeu à conserver ou à enregistrer). */
export function garderProprietes(features, noms = PROPRIETES_TRONCON) {
  return features.map((f) => ({
    ...f,
    properties: Object.fromEntries(noms.filter((k) => f.properties?.[k] !== undefined && f.properties[k] !== null).map((k) => [k, f.properties[k]])),
  }));
}

function predicat(filtre) {
  if (!filtre) return null;
  if (typeof filtre === 'function') return filtre;
  const criteres = Object.entries(filtre);
  return (f) => criteres.every(([k, v]) => (Array.isArray(v) ? v.includes(f.properties?.[k]) : f.properties?.[k] === v));
}

/**
 * Combien d'objets dans l'emprise, sans les télécharger : `numberMatched` d'une page d'un seul objet.
 */
export async function compter(couche, emprise, options = {}) {
  const json = await demanderJson(urlGetFeature({ couche, emprise, count: 1, url: options.url }), options);
  const n = json?.numberMatched ?? json?.totalFeatures;
  if (!Number.isInteger(n)) throw new ErreurWfs('reponse_illisible', 'Le service n’a pas indiqué le nombre d’objets.');
  return n;
}

/**
 * Lit une couche dans une emprise, page après page.
 *
 * @param {string} couche nom complet (`BDTOPO_V3:…`), voir `COUCHES`
 * @param {number[]} emprise `[lonMin, latMin, lonMax, latMax]`
 * @param {object} [o]
 * @param {number} [o.taille] objets par page (1 000 par défaut, 5 000 au plus)
 * @param {number} [o.max] plafond d'objets lus (20 000) : au-delà, `trop_d_objets` si `tronquer` est faux, sinon on s'arrête là
 * @param {boolean} [o.tronquer] accepter un résultat partiel (signalé par `tronque: true`) plutôt qu'une erreur
 * @param {string} [o.tri] attribut de tri (`cleabs`)
 * @param {Function|Object} [o.filtre] critère CÔTÉ CLIENT : une fonction `(feature) => boolean`, ou `{ attribut: valeur | [valeurs] }`
 * @param {number} [o.echantillon] ne garder qu'un échantillon régulier de ce nombre d'objets, après filtre
 * @param {number} [o.pauseMs] pause entre deux pages (200)
 * @param {Function} [o.fetch] `fetch` injecté
 * @param {Function} [o.attendre] `(ms) => Promise`, injecté
 * @param {AbortSignal} [o.signal]
 * @returns {Promise<{features: object[], numberMatched: number|null, lus: number, pages: number, tronque: boolean}>}
 *   `lus` = objets reçus avant filtre ; `numberMatched` = ce que le service dit contenir l'emprise
 */
export async function lireCouche(couche, emprise, o = {}) {
  const taille = o.taille ?? TAILLE_PAGE;
  const max = o.max ?? OBJETS_MAX;
  const garde = predicat(o.filtre);
  const attendre = o.attendre || attenteParDefaut;
  const pauseMs = o.pauseMs ?? 200;
  validerEmprise(emprise);
  const recus = [];
  let debut = 0;
  let correspondants = null;
  let pages = 0;
  let tronque = false;
  for (;;) {
    const json = await demanderJson(urlGetFeature({ couche, emprise, count: taille, debut, tri: o.tri, url: o.url }), o);
    if (json?.type !== 'FeatureCollection' || !Array.isArray(json.features)) {
      throw new ErreurWfs('reponse_illisible', 'La réponse du service n’est pas une collection d’objets.');
    }
    pages++;
    if (correspondants === null && Number.isInteger(json.numberMatched)) {
      correspondants = json.numberMatched;
      if (correspondants > max && !o.tronquer) {
        throw new ErreurWfs('trop_d_objets', `L’emprise contient ${correspondants} objets (plafond ${max}) : réduisez-la ou acceptez un résultat partiel.`, { numberMatched: correspondants, max });
      }
    }
    recus.push(...json.features);
    debut += json.features.length;
    if (recus.length >= max && (correspondants === null || correspondants > recus.length)) {
      recus.length = Math.min(recus.length, max);
      tronque = correspondants === null ? true : correspondants > recus.length;
      break;
    }
    const fini = json.features.length === 0 || (correspondants !== null ? debut >= correspondants : json.features.length < taille);
    if (fini) break;
    await attendre(pauseMs);
  }
  let features = dedoublonner(recus);
  if (garde) features = features.filter(garde);
  if (o.echantillon) features = echantillonner(features, o.echantillon);
  return { features, numberMatched: correspondants, lus: recus.length, pages, tronque };
}

/** Les tronçons de route d'une emprise (`BDTOPO_V3:troncon_de_route`). */
export function lireTroncons(emprise, o = {}) {
  return lireCouche(COUCHES.troncons, emprise, o);
}
