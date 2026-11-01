/**
 * Se présenter aux services d'OpenStreetMap (Overpass, Nominatim).
 *
 * Mesuré le 26/09/2026 sur `overpass-api.de` : une requête qui n'a **ni
 * Referer ni User-Agent identifiant l'application** reçoit
 * `406 Not Acceptable` — curl, okhttp, Dalvik, et même un User-Agent de Chrome
 * sans Referer. Un navigateur passe, parce qu'il envoie de lui-même le Referer
 * de la page. L'application, elle, émet ses requêtes par le client natif de
 * Capacitor (`CapacitorHttp`), qui n'en envoie pas : tout import OSM y
 * échouait en 406. Nominatim pose la même règle dans sa politique d'usage.
 *
 * La réponse est celle que ces services demandent : un User-Agent qui nomme
 * l'application et dit où la trouver. Il n'est posé **que dans
 * l'application** — dans un navigateur, l'en-tête est refusé ou déclenche un
 * contrôle préalable CORS, et le Referer suffit déjà.
 */

export const PAGE_ATLAS = 'https://nic01asfr.github.io/Widgets-Grist/w/atlas/';

/**
 * `Atlas/<version> (+<page>)`. Un en-tête HTTP n'admet que l'ASCII : le repère
 * de version du paquet (« e9571dd · 2026-09-26 ») est réduit à son premier
 * mot, et tout caractère hors ASCII imprimable est retiré.
 * @param {string} [version]
 */
export function identiteAtlas(version = '') {
  const v = String(version || '').trim().split(/\s+/)[0].replace(/[^\x21-\x7e]/g, '') || 'app';
  return `Atlas/${v} (+${PAGE_ATLAS})`;
}

/**
 * Les en-têtes d'une requête vers OpenStreetMap.
 * @param {{application?: boolean, version?: string, base?: Record<string,string>}} o
 */
export function enTetesOsm({ application = false, version = '', base = {} } = {}) {
  return application ? { ...base, 'User-Agent': identiteAtlas(version), Referer: PAGE_ATLAS } : { ...base };
}

/**
 * Ce qu'un refus veut dire, pour la personne qui a cliqué.
 *
 * « HTTP 406 » n'apprend rien : on cherche la panne dans sa zone ou sa
 * connexion. Les trois codes que ces services renvoient réellement ont chacun
 * leur cause, et deux d'entre eux se règlent en attendant.
 * @param {number} status
 */
export function messageRefusOsm(status) {
  if (status === 406 || status === 403) {
    return `OpenStreetMap a refusé la requête (${status}) : Atlas ne s’est pas présenté au service.`;
  }
  if (status === 429) return 'OpenStreetMap limite le nombre de requêtes : réessayez dans une minute.';
  if (status === 502 || status === 504 || status === 503) {
    return `Le service OpenStreetMap est surchargé ou indisponible (${status}) : réessayez dans un instant, ou réduisez la zone.`;
  }
  return `HTTP ${status}`;
}

/** Les refus qui passent en attendant : le service public est surchargé ou son relais ne joint pas son serveur. */
export const REFUS_PASSAGERS = Object.freeze([429, 502, 503, 504]);

/**
 * Une requête vers un service d'OpenStreetMap, REPRISE quand le service est passagèrement indisponible. Mesuré le 01/11/2026 : `overpass-api.de` répond par séries
 * de 502 puis de 200 pour la même requête ; une seule tentative échouait une fois sur deux. `envoyer()` rend une réponse (`{ ok, status }`) ; un refus passager
 * est repris après `delai` ms (doublé à chaque reprise), au plus `essais` fois au total. Toute autre réponse, bonne ou mauvaise, est rendue telle quelle ; une erreur
 * réseau est reprise de même, et relancée si elle persiste.
 * @param {() => Promise<{ok: boolean, status: number}>} envoyer
 * @param {{essais?: number, delai?: number, attendre?: (ms: number) => Promise<void>, surReprise?: (n: number, status: number|null) => void}} [o]
 */
export async function avecReprises(envoyer, { essais = 3, delai = 1500, attendre = (ms) => new Promise((ok) => setTimeout(ok, ms)), surReprise } = {}) {
  let derniere = null;
  for (let n = 1; n <= essais; n++) {
    let rep = null, erreur = null;
    try { rep = await envoyer(); } catch (e) { erreur = e; }
    if (rep && !REFUS_PASSAGERS.includes(rep.status)) return rep;
    derniere = rep;
    if (n === essais) { if (erreur) throw erreur; return rep; }
    if (surReprise) surReprise(n, rep ? rep.status : null);
    await attendre(delai * 2 ** (n - 1));
  }
  return derniere;
}

/**
 * Une requête vers OpenStreetMap depuis l'application. Le client natif de Capacitor émet l'identité d'Atlas (User-Agent et Referer) ; si le service la refuse quand même (406
 * ou 403 : relevé sur un téléphone le 01/11/2026), la même requête repart par le moteur web de la page (`repli`, le `fetch` d'origine que Capacitor met de côté), qui présente celui
 * d'un navigateur (son User-Agent et le Referer de la page) : c'est ce chemin que le service accepte pour les pages web. Sans `repli` (navigateur), la réponse est rendue telle quelle.
 * @param {string} url
 * @param {{headers?: Record<string,string>, [k: string]: any}} init
 * @param {{fetch: (u: string, i: object) => Promise<any>, repli?: ((u: string, i: object) => Promise<any>)|null}} o
 */
export async function requeteOsm(url, init, { fetch: natif, repli = null }) {
  const rep = await natif(url, init);
  if (!repli || (rep.status !== 406 && rep.status !== 403)) return rep;
  const { 'User-Agent': _ua, Referer: _ref, ...entetes } = init?.headers || {};
  return repli(url, { ...init, headers: entetes });
}

/** Le `fetch` d'origine de la page, que Capacitor met de côté avant de le remplacer par son client natif ; null hors application. */
export function repliWeb(portee = globalThis) {
  const f = portee?.CapacitorWebFetch;
  return typeof f === 'function' ? f.bind(portee) : null;
}
