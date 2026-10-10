/**
 * Client FACULTATIF du calcul d'itinéraire de la Géoplateforme (IGN).
 *
 *     GET https://data.geopf.fr/navigation/itineraire        sans clé, CORS ouvert (`access-control-allow-origin: *`)
 *
 * Il ne remplace pas le plus court chemin local (`calage.js`) : il ne sait ni imposer un tronçon, ni caler une
 * géométrie, ni travailler hors ligne. Il sert de **contrôle croisé indépendant** d'un chemin local, ou de solution de
 * repli à un client qui n'a pas de graphe : avec la ressource `bdtopo-pgr`, chaque étape porte le `cleabs` du tronçon.
 * Rien dans Atlas ne doit en dépendre.
 *
 * ## Les pièges du service, mesurés le 09/10/2026 (`docs/DONNEES-IGN.md`), et le garde-fou qui répond à chacun
 *
 * 1. **Un point hors réseau est accroché silencieusement au réseau le plus proche.** Un départ en mer (5,2 E ; 43,0 N)
 *    a été ramené à 5,351 E ; 43,212 N, soit ~27 km plus loin, avec HTTP 200 et un trajet de 326 km depuis ce point
 *    d'accroche. La réponse dit où elle s'est accrochée (`start` et `end`) : le client compare à la demande et refuse
 *    au-delà de `ecartMaxM` (500 m par défaut), erreur `point_hors_reseau`.
 * 2. **La ressource qui répond n'est pas toujours celle qu'on a demandée.** Une requête `bdtopo-pgr` sans contrainte ni
 *    `waysAttributes` est servie par `bdtopo-valhalla` (champ `resource` de la réponse), d'où des distances qui diffèrent
 *    de quelques mètres, et pas de `cleabs`. Le client demande toujours les attributs quand on veut les `cleabs`, relit
 *    `resource`, et rend `cleabsDisponibles: false` si la réponse n'est pas de `bdtopo-pgr`.
 * 3. **Seule `bdtopo-pgr` rend les `cleabs`.** OSRM et Valhalla n'acceptent que `waysAttributes=name` (HTTP 400 sinon).
 *    Si `bdtopo-pgr` est indisponible (5xx) ou refuse les attributs, le client retombe une fois sur `bdtopo-valhalla`
 *    (géométrie et distance seulement) et le signale : `repli: 'ressource'`.
 * 4. **Quotas contradictoires** : 5 requêtes/s (guide), 10/s (CGU), `x-ratelimit-limit-second: 1` en en-tête. Le client
 *    espace ses appels d'au moins 1 s, reprend après `Retry-After` sur un 429, et accepte un plafond d'appels
 *    (`maxAppels`) pour qu'une boucle ne vide pas le quota de la personne qui l'utilise.
 * 5. **15 points de passage au plus** (16 : HTTP 400). Refusé avant l'appel.
 * 6. **Aucun moyen d'imposer ou d'exclure un tronçon** (`constraints` sur `cleabs` : refusé) : seules des classes
 *    d'attributs peuvent être évitées ou préférées. Ce client n'expose pas les contraintes.
 *
 * Licence : le service n'annonce pas de licence propre ; les données (BD TOPO) sont en Licence Ouverte 2.0.
 * Citer l'IGN. Pas de garantie de disponibilité.
 */

import { creerRepere, dist } from './geo.js';

export const URL_ITINERAIRE = 'https://data.geopf.fr/navigation/itineraire';
export const RESSOURCES = Object.freeze({ pgr: 'bdtopo-pgr', valhalla: 'bdtopo-valhalla', osrm: 'bdtopo-osrm' });
export const POINTS_DE_PASSAGE_MAX = 15;
export const ECART_MAX_M = 500;
export const INTERVALLE_MIN_MS = 1000;
export const ATTRIBUTS_TRONCON = Object.freeze(['cleabs', 'cpx_numero', 'nom_1_gauche', 'sens_de_circulation']);

/**
 * Codes d'erreur : `parametre_invalide`, `trop_de_points_de_passage`, `point_hors_reseau`, `aucun_chemin`,
 * `requete_refusee`, `quota`, `indisponible`, `reseau`, `reponse_illisible`, `budget_epuise`, `annule`.
 */
export class ErreurItineraire extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ErreurItineraire';
    this.code = code;
    Object.assign(this, details);
  }
}

const position = (p, nom) => {
  if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) {
    throw new ErreurItineraire('parametre_invalide', `${nom} doit être [longitude, latitude] en degrés.`);
  }
  return `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
};

/**
 * L'adresse d'une requête. Les barres verticales et les virgules restent lisibles (le service les accepte).
 * @param {{depart: number[], arrivee: number[], passages?: number[][], ressource?: string, profil?: 'car'|'pedestrian',
 *   optimisation?: 'shortest'|'fastest', attributs?: string[]|null, url?: string}} o
 */
export function urlItineraire({ depart, arrivee, passages = [], ressource = RESSOURCES.pgr, profil = 'car', optimisation = 'shortest', attributs = ATTRIBUTS_TRONCON, url = URL_ITINERAIRE }) {
  if (passages.length > POINTS_DE_PASSAGE_MAX) {
    throw new ErreurItineraire('trop_de_points_de_passage', `Le service accepte ${POINTS_DE_PASSAGE_MAX} points de passage au plus (${passages.length} demandés).`);
  }
  if (!['car', 'pedestrian'].includes(profil)) throw new ErreurItineraire('parametre_invalide', `Profil inconnu : ${profil}.`);
  if (!['shortest', 'fastest'].includes(optimisation)) throw new ErreurItineraire('parametre_invalide', `Optimisation inconnue : ${optimisation}.`);
  const params = [
    ['resource', ressource], ['start', position(depart, 'Le départ')], ['end', position(arrivee, 'L’arrivée')], ['profile', profil],
    ['optimization', optimisation], ['geometryFormat', 'geojson'],
  ];
  if (passages.length) params.push(['intermediates', passages.map((p, i) => position(p, `Le point de passage ${i + 1}`)).join('|')]);
  if (attributs && attributs.length) params.push(['getSteps', 'true'], ['waysAttributes', attributs.join('|')]);
  else params.push(['getSteps', 'false']);
  const enc = (v) => encodeURIComponent(v).replace(/%2C/g, ',').replace(/%7C/g, '|');
  return `${url}?${params.map(([k, v]) => `${k}=${enc(v)}`).join('&')}`;
}

const lirePosition = (texte) => {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(texte ?? ''));
  return m ? [Number(m[1]), Number(m[2])] : null;
};

/** Distance en mètres entre deux positions WGS84 (plan local, sans dépendance au graphe). */
function ecartM(a, b) {
  const r = creerRepere(a[0], a[1]);
  return dist([0, 0], r.vers(b));
}

/**
 * Normalise une réponse JSON du service et applique les garde-fous 1 et 2.
 *
 * @param {object} json corps de la réponse
 * @param {{depart: number[], arrivee: number[], ressource?: string, ecartMaxM?: number, cleabs?: boolean}} demande
 * @returns {{distanceM: number, dureeS: number, geometrie: object, bbox: number[], ressourceDemandee: string,
 *   ressourceRepondante: string, version: string|null, cleabsDisponibles: boolean, etapes: object[], troncons: string[],
 *   depart: {demande: number[], accroche: number[]|null, ecartM: number|null},
 *   arrivee: {demande: number[], accroche: number[]|null, ecartM: number|null}, avertissements: string[]}}
 * @throws {ErreurItineraire} `reponse_illisible`, `point_hors_reseau`
 */
export function lireReponse(json, demande) {
  const { depart, arrivee, ressource = RESSOURCES.pgr, ecartMaxM = ECART_MAX_M, cleabs = true } = demande;
  if (!json || json.geometry?.type !== 'LineString' || !Array.isArray(json.geometry.coordinates) || !Number.isFinite(json.distance)) {
    throw new ErreurItineraire('reponse_illisible', 'La réponse du service d’itinéraire n’a pas la forme attendue.');
  }
  if (json.geometry.coordinates.length < 2) {
    throw new ErreurItineraire('aucun_chemin', 'Le service n’a trouvé aucun chemin (géométrie vide).');
  }
  const accrocheD = lirePosition(json.start) || json.geometry.coordinates[0]?.slice(0, 2) || null;
  const accrocheA = lirePosition(json.end) || json.geometry.coordinates[json.geometry.coordinates.length - 1]?.slice(0, 2) || null;
  const ecartD = accrocheD ? ecartM(depart, accrocheD) : null;
  const ecartA = accrocheA ? ecartM(arrivee, accrocheA) : null;
  const avertissements = [];
  if ((ecartD !== null && ecartD > ecartMaxM) || (ecartA !== null && ecartA > ecartMaxM)) {
    const qui = [ecartD > ecartMaxM ? `le départ (${Math.round(ecartD)} m)` : null, ecartA > ecartMaxM ? `l’arrivée (${Math.round(ecartA)} m)` : null].filter(Boolean).join(' et ');
    throw new ErreurItineraire(
      'point_hors_reseau',
      `Le service a accroché ${qui} au réseau routier à plus de ${ecartMaxM} m du point demandé : le point est hors réseau.`,
      { ecartDepartM: ecartD, ecartArriveeM: ecartA, accrocheDepart: accrocheD, accrocheArrivee: accrocheA },
    );
  }
  const etapes = [];
  for (const portion of json.portions || []) {
    for (const s of portion.steps || []) {
      const a = s.attributes || {};
      etapes.push({
        cleabs: a.cleabs || null,
        numero: a.cpx_numero || null,
        nom: a.nom_1_gauche || null,
        sens: a.sens_de_circulation || null,
        distanceM: s.distance ?? null,
        dureeS: s.duration ?? null,
        geometrie: s.geometry || null,
      });
    }
  }
  const ressourceRepondante = json.resource || null;
  const cleabsDisponibles = ressourceRepondante === RESSOURCES.pgr && etapes.some((e) => e.cleabs);
  if (ressourceRepondante && ressourceRepondante !== ressource) {
    avertissements.push(`ressource demandée ${ressource}, ressource répondante ${ressourceRepondante}`);
  }
  if (!cleabsDisponibles && cleabs) avertissements.push('pas de cleabs dans la réponse (seule la ressource bdtopo-pgr avec getSteps les fournit)');
  const troncons = [];
  for (const e of etapes) if (e.cleabs && troncons[troncons.length - 1] !== e.cleabs) troncons.push(e.cleabs);
  return {
    distanceM: json.distance,
    dureeS: json.duration ?? null,
    geometrie: json.geometry,
    bbox: json.bbox || null,
    ressourceDemandee: ressource,
    ressourceRepondante,
    version: json.resourceVersion || null,
    cleabsDisponibles,
    etapes,
    troncons,
    depart: { demande: depart, accroche: accrocheD, ecartM: ecartD },
    arrivee: { demande: arrivee, accroche: accrocheA, ecartM: ecartA },
    avertissements,
  };
}

/**
 * Rapproche une réponse d'un graphe local : les tronçons que le service cite et que le graphe connaît (portion
 * entière), et ceux qu'il ne connaît pas (emprise trop petite, édition différente de la BD TOPO). Sert de contrôle
 * croisé avec `f1Troncons` de `mesures-trace.js`.
 * @returns {{connus: {cleabs: string, s0: number, s1: number}[], inconnus: string[]}}
 */
export function tronconsDuGraphe(reponse, graphe) {
  const connus = [];
  const inconnus = [];
  for (const c of new Set(reponse.troncons)) {
    const e = graphe.parCleabs.get(c);
    if (e) connus.push({ cleabs: c, s0: 0, s1: e.L });
    else inconnus.push(c);
  }
  return { connus, inconnus };
}

const attenteParDefaut = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function messageDe(json, texte) {
  const m = json?.error?.message ?? json?.message;
  return String(m ?? texte ?? '').trim().slice(0, 300);
}

/**
 * Un client qui espace ses appels et compte ce qu'il consomme.
 *
 * @param {object} [o]
 * @param {Function} [o.fetch] injecté (tests, Capacitor)
 * @param {(ms: number) => Promise<void>} [o.attendre]
 * @param {() => number} [o.maintenant] horloge en ms
 * @param {number} [o.intervalleMs] écart minimal entre deux appels (1 000)
 * @param {number} [o.ecartMaxM] écart d'accroche toléré (500)
 * @param {number} [o.maxAppels] plafond d'appels pour la vie du client (aucun par défaut)
 * @param {number} [o.essais] reprises sur 429 / 5xx / panne réseau (2 essais au total par ressource)
 * @param {string} [o.url]
 */
export function creerClientItineraire({ fetch: f = globalThis.fetch, attendre = attenteParDefaut, maintenant = Date.now, intervalleMs = INTERVALLE_MIN_MS, ecartMaxM = ECART_MAX_M, maxAppels = Infinity, essais = 2, url = URL_ITINERAIRE } = {}) {
  let dernierAppel = -Infinity;
  const compteur = { appels: 0, echecs: 0, reprises: 0, replis: 0 };

  async function appeler(adresse, signal) {
    if (typeof f !== 'function') throw new ErreurItineraire('reseau', 'Aucun fetch disponible.');
    let derniere = null;
    for (let n = 0; n < essais; n++) {
      if (signal?.aborted) throw new ErreurItineraire('annule', 'Requête annulée.');
      if (compteur.appels >= maxAppels) throw new ErreurItineraire('budget_epuise', `Plafond de ${maxAppels} appels atteint.`);
      const attente = dernierAppel + intervalleMs - maintenant();
      if (attente > 0) await attendre(attente);
      dernierAppel = maintenant();
      compteur.appels++;
      let reponse;
      try {
        reponse = await f(adresse, { headers: { Accept: 'application/json' }, signal });
      } catch (e) {
        if (signal?.aborted || e?.name === 'AbortError') throw new ErreurItineraire('annule', 'Requête annulée.');
        derniere = new ErreurItineraire('reseau', `Le service d’itinéraire est injoignable : ${e?.message || e}.`);
        compteur.reprises++;
        continue;
      }
      const texte = await reponse.text();
      let json = null;
      try { json = JSON.parse(texte); } catch { /* corps non JSON */ }
      const limites = { parSeconde: reponse.headers?.get?.('x-ratelimit-limit-second') ?? null, limite: reponse.headers?.get?.('ratelimit-limit') ?? null };
      if (reponse.status === 429) {
        const reprise = Number(reponse.headers?.get?.('retry-after'));
        derniere = new ErreurItineraire('quota', 'Le service d’itinéraire limite le nombre de requêtes : réessayez dans quelques secondes.', { status: 429, limites });
        compteur.reprises++;
        await attendre(Number.isFinite(reprise) && reprise > 0 ? reprise * 1000 : 2000);
        continue;
      }
      if (reponse.status >= 500) {
        derniere = new ErreurItineraire('indisponible', `Le service d’itinéraire a répondu ${reponse.status}.`, { status: reponse.status, limites });
        compteur.reprises++;
        continue;
      }
      if (reponse.status === 404) {
        throw new ErreurItineraire('aucun_chemin', `Aucun chemin trouvé (${messageDe(json, texte) || '404'}).`, { status: 404, limites });
      }
      if (!reponse.ok) {
        throw new ErreurItineraire('requete_refusee', `Requête refusée (${reponse.status}) : ${messageDe(json, texte)}`, { status: reponse.status, limites });
      }
      if (!json) throw new ErreurItineraire('reponse_illisible', 'La réponse du service d’itinéraire n’est pas du JSON.', { status: reponse.status });
      return { json, limites };
    }
    compteur.echecs++;
    throw derniere;
  }

  return {
    compteur,
    /**
     * Un itinéraire entre deux points.
     * @param {object} o
     * @param {number[]} o.depart [lng, lat]
     * @param {number[]} o.arrivee [lng, lat]
     * @param {number[][]} [o.passages] 15 au plus
     * @param {'car'|'pedestrian'} [o.profil]
     * @param {'shortest'|'fastest'} [o.optimisation]
     * @param {boolean} [o.cleabs] demander les tronçons (vrai par défaut) ; faux = géométrie et distance seulement
     * @param {AbortSignal} [o.signal]
     * @returns {Promise<ReturnType<typeof lireReponse> & {repli: 'ressource'|null, limites: object}>}
     */
    async itineraire({ depart, arrivee, passages = [], profil = 'car', optimisation = 'shortest', cleabs = true, signal } = {}) {
      const commun = { depart, arrivee, passages, profil, optimisation, url };
      const demande = { depart, arrivee, ecartMaxM, cleabs };
      let repli = null;
      let reponse;
      const premiere = { ...commun, ressource: cleabs ? RESSOURCES.pgr : RESSOURCES.valhalla, attributs: cleabs ? ATTRIBUTS_TRONCON : null };
      try {
        reponse = await appeler(urlItineraire(premiere), signal);
        demande.ressource = premiere.ressource;
      } catch (e) {
        // seule une panne de la ressource riche justifie de retomber sur la ressource simple ; un « aucun chemin » est une réponse
        const attributsRefuses = e.code === 'requete_refusee' && /waysAttributes|attribute/i.test(e.message);
        if (!cleabs || !(e.code === 'indisponible' || e.code === 'reseau' || attributsRefuses)) throw e;
        repli = 'ressource';
        compteur.replis++;
        reponse = await appeler(urlItineraire({ ...commun, ressource: RESSOURCES.valhalla, attributs: null }), signal);
        demande.ressource = RESSOURCES.valhalla;
      }
      const lu = lireReponse(reponse.json, demande);
      if (repli) lu.avertissements.push('repli sur bdtopo-valhalla : la ressource bdtopo-pgr n’a pas répondu, pas de cleabs');
      return { ...lu, repli, limites: reponse.limites };
    },
  };
}
