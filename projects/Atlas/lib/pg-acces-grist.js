/**
 * L'accès à une passerelle PostgreSQL (pg-gateway) par l'identité Grist : aucun jeton de passerelle à saisir.
 *
 * Le widget demande à Grist un jeton d'accès au document (`docApi.getAccessToken`), le présente à la passerelle
 * (`Authorization: Grist <jeton>`), et la passerelle le fait valider par Grist (voir `pg-gateway/docs/IDENTITE-GRIST.md`).
 *
 * Même interface que `pg-acces.js` (`entetes(url)` synchrone, `apres401(url, avaitEntete)` asynchrone) : le client
 * (`pg-passerelle.js`) rejoue une fois la requête après un 401, ce qui suffit pour obtenir le jeton Grist (asynchrone) sans rien changer au client.
 *
 * Module pur : la demande du jeton, la confirmation et la sonde sont injectées ; il se teste sous Node.
 *
 * Règles :
 *  - le jeton Grist n'est gardé qu'en mémoire de cette page (jamais stockage du navigateur, adresse, ni ligne de document) ;
 *  - il n'est envoyé qu'à une adresse admise (https, ou localhost) ET que la personne a confirmée, UNE fois par origine et par ouverture de la page :
 *    sans cela, une adresse de passerelle modifiée par quelqu'un recevrait en silence le jeton d'accès du document ;
 *  - un jeton en lecture seule (`readOnly`) sert la lecture ; l'écriture en demande un autre (la passerelle refuse d'écrire avec le premier) ;
 *  - un jeton est gardé jusqu'à `MARGE_MS` avant son expiration ; un 401 le fait oublier, un nouveau est demandé (une seule fois par requête) ;
 *  - une confirmation refusée n'est pas redemandée tout de suite : `DELAI_REFUS_MS` ;
 *  - une demande de jeton qui échoue est SIGNALÉE (`signaler`), jamais avalée.
 */
import { adresseAdmisePg } from './pg-acces.js?v=20261109a';

export const VERSION = '1.0.0';
export const DELAI_REFUS_MS = 30000;
export const MARGE_MS = 60000;
export const VALIDITE_DEFAUT_MS = 10 * 60 * 1000;
export const DELAI_SONDE_MS = 5000;

const origineDe = (url) => { try { return new URL(String(url)).origin; } catch { return null; } };

/**
 * Une confirmation qui retient un « oui » par origine (partagée entre le jeton de lecture et celui d'écriture : une seule question
 * par ouverture de la page) et qui ne pose qu'une question à la fois.
 * @param {(q:{origine:string}) => Promise<boolean>} demander
 * @returns {(q:{origine:string}) => Promise<boolean>}
 */
export function memoriserConfirmation(demander) {
  const oui = new Set();
  const enCours = new Map();
  return async ({ origine }) => {
    if (oui.has(origine)) return true;
    if (enCours.has(origine)) return enCours.get(origine);
    const question = (async () => {
      let reponse = false;
      try { reponse = (await demander({ origine })) === true; } catch { reponse = false; }
      if (reponse) oui.add(origine);
      return reponse;
    })();
    enCours.set(origine, question);
    try { return await question; } finally { enCours.delete(origine); }
  };
}

/**
 * @param {object} o
 * @param {() => Promise<{token:string, ttlMsecs?:number}>} o.jeton  le jeton d'accès Grist (`docApi.getAccessToken({readOnly})`)
 * @param {(q:{origine:string}) => Promise<boolean>} o.confirmer  « envoyer votre identité à cette passerelle ? »
 * @param {(texte:string) => void} [o.signaler]  une demande de jeton qui échoue
 * @param {(url:string) => string|null} [o.adresseAdmise]  `null` quand l'adresse est admise
 * @param {() => number} [o.maintenant]
 */
export function creerAccesGrist({ jeton, confirmer, signaler = () => {}, adresseAdmise = adresseAdmisePg, maintenant = Date.now }) {
  const valides = new Map();  // origine -> { valeur, expire }
  const enCours = new Map();  // origine -> promesse de la demande en cours
  const refusees = new Map(); // origine -> instant d'une confirmation refusée

  async function obtenir(origine) {
    if (!(await confirmer({ origine }))) {
      refusees.set(origine, maintenant());
      signaler(`Envoi de votre identité Grist à ${origine} refusé : cette passerelle reste inaccessible tant que vous ne l’autorisez pas.`);
      return false;
    }
    refusees.delete(origine);
    let r;
    try { r = await jeton(); } catch (e) {
      signaler(`Identité Grist indisponible : ${(e && e.message) || e} (côté Grist : le widget doit avoir accès au document).`);
      return false;
    }
    const valeur = r && typeof r.token === 'string' ? r.token.trim() : '';
    if (!valeur) { signaler('Identité Grist indisponible : Grist n’a pas rendu de jeton d’accès (côté Grist).'); return false; }
    const ttl = Number.isFinite(r.ttlMsecs) && r.ttlMsecs > 0 ? r.ttlMsecs : VALIDITE_DEFAUT_MS;
    valides.set(origine, { valeur, expire: maintenant() + Math.max(0, ttl - MARGE_MS) });
    return true;
  }

  return {
    /** Les en-têtes d'une requête vers `url` : `{}` tant qu'on n'a pas de jeton valide pour cette origine. */
    entetes(url) {
      const origine = origineDe(url);
      const j = origine ? valides.get(origine) : null;
      if (!j || adresseAdmise(url) || maintenant() >= j.expire) return {};
      return { Authorization: 'Grist ' + j.valeur };
    },

    /**
     * À appeler sur un 401. `true` : un (nouveau) jeton est en main, la requête peut être rejouée une fois.
     * @param {string} url
     * @param {boolean} avaitEntete  la requête refusée portait déjà un jeton (périmé ou refusé)
     */
    async apres401(url, avaitEntete = false) {
      const origine = origineDe(url);
      if (!origine || adresseAdmise(url)) return false;
      if (avaitEntete) valides.delete(origine);
      if (enCours.has(origine)) return enCours.get(origine);
      const t = refusees.get(origine);
      if (t !== undefined && maintenant() - t < DELAI_REFUS_MS) return false;
      const demande = obtenir(origine);
      enCours.set(origine, demande);
      try { return await demande; } finally { enCours.delete(origine); }
    },

    oublier(origine) { if (origine) valides.delete(origine); else valides.clear(); },
  };
}

/**
 * La passerelle annonce-t-elle l'identité Grist ? (`GET /v1/identite`, sans jeton.)
 * @returns {Promise<boolean|null>} `null` : indéterminé (réseau, réponse illisible)
 */
export async function sonderIdentite(url, fetchImpl = (...a) => fetch(...a)) {
  const origine = origineDe(url);
  if (!origine) return null;
  try {
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(DELAI_SONDE_MS) : undefined;
    const rep = await fetchImpl(origine + '/v1/identite', { credentials: 'omit', ...(signal ? { signal } : {}) });
    if (rep.status === 404) {
      // Ni passerelle de ce mode : un ÉCHANGEUR (services/pg-echangeur) se reconnaît à `/v1/echangeur` et ne connaît que l'identité Grist.
      try {
        const e = await fetchImpl(String(url).split('/v1/')[0].replace(/\/+$/, '') + '/v1/echangeur', { credentials: 'omit', ...(signal ? { signal } : {}) });
        if (e.ok) { const j = await e.json(); if (j && j.echangeur === true) return true; }
      } catch { /* indéterminé : on s'en tient à « pas de mode Grist annoncé » */ }
      return false; // passerelle d'avant ce mode
    }
    if (!rep.ok) return null;
    const d = await rep.json();
    return !!d && d.grist === true;
  } catch { return null; }
}

/**
 * Un accès qui choisit, par passerelle : l'identité Grist si la passerelle l'annonce, sinon le jeton saisi (`pg-acces.js`).
 * Le choix se fait au premier 401 d'une origine (la requête sans en-tête), pas avant : rien n'est envoyé à une passerelle avant d'y être obligé.
 * @param {object} o
 * @param {{entetes:Function, apres401:Function}} o.jeton  `creerAccesPg(...)`
 * @param {{entetes:Function, apres401:Function}|null} o.grist  `creerAccesGrist(...)`, ou `null` hors d'un document Grist
 * @param {(url:string) => Promise<boolean|null>} [o.sonder]
 * @param {(url:string) => string|null} [o.adresseAdmise]
 */
export function creerAccesAuto({ jeton, grist, sonder = sonderIdentite, adresseAdmise = adresseAdmisePg }) {
  const modes = new Map();  // origine -> 'grist' | 'jeton'
  const sondes = new Map(); // origine -> promesse de la sonde en cours

  async function choisir(origine, url) {
    if (modes.has(origine)) return modes.get(origine);
    if (!grist) { modes.set(origine, 'jeton'); return 'jeton'; }
    if (!sondes.has(origine)) sondes.set(origine, sonder(url));
    let r;
    try { r = await sondes.get(origine); } finally { sondes.delete(origine); }
    if (r === null || r === undefined) return 'jeton'; // indéterminé : on n'enregistre pas ce choix
    const mode = r === true ? 'grist' : 'jeton';
    modes.set(origine, mode);
    return mode;
  }

  return {
    entetes(url) {
      const origine = origineDe(url);
      return origine && modes.get(origine) === 'grist' ? grist.entetes(url) : jeton.entetes(url);
    },
    async apres401(url, avaitEntete = false) {
      const origine = origineDe(url);
      if (!origine || adresseAdmise(url)) return false;
      const mode = await choisir(origine, url);
      return mode === 'grist' ? grist.apres401(url, avaitEntete) : jeton.apres401(url, avaitEntete);
    },
    /** Le mode retenu pour une origine (`null` : pas encore choisi), pour l'affichage et les tests. */
    mode(url) { const o = origineDe(url); return (o && modes.get(o)) || null; },
    oublier(origine) { jeton.oublier && jeton.oublier(origine); if (grist) grist.oublier(origine); },
  };
}
