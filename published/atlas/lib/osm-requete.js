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
  return application ? { ...base, 'User-Agent': identiteAtlas(version) } : { ...base };
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
  if (status === 504 || status === 503) {
    return `Le service OpenStreetMap est surchargé (${status}) : réessayez, ou réduisez la zone.`;
  }
  return `HTTP ${status}`;
}
