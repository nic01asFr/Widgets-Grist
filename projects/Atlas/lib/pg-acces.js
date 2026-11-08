/**
 * L'accès à une passerelle PostgreSQL (pg-gateway) : un jeton `Authorization: Bearer`.
 *
 * Même règle que `dalles3d-acces.js`, dont ce module est la variante « jeton » : le jeton est demandé à la personne, gardé **en
 * mémoire de cette page seulement** (jamais dans le stockage du navigateur, jamais dans une adresse, jamais dans une ligne
 * de document Grist) et présenté à CETTE origine seule.
 *
 * Module pur : la saisie (`demander`) et le contrôle d'adresse (`adresseAdmise`) sont injectés ; il se teste sous Node.
 *
 * Règles :
 *  - l'en-tête n'est posé que vers une origine pour laquelle on a déjà un jeton, et seulement si l'adresse est admise (https, ou
 *    http sur localhost : un jeton en clair ne traverse pas un réseau) ;
 *  - un 401 alors qu'on avait présenté un jeton : il est jugé refusé et oublié, la personne est invitée à le ressaisir ;
 *  - plusieurs 401 en même temps ne posent qu'UNE question ;
 *  - une saisie annulée n'est pas redemandée tout de suite : `DELAI_REFUS_MS`.
 */
export const VERSION = '1.0.0';
export const DELAI_REFUS_MS = 30000;

const origineDe = (url) => { try { return new URL(String(url)).origin; } catch { return null; } };

/**
 * Admet une adresse pour y envoyer un jeton : https, ou http sur la machine locale.
 * @returns {string|null} `null` quand l'adresse est admise, sinon la raison du refus
 */
export function adresseAdmisePg(url) {
  let u;
  try { u = new URL(String(url)); } catch { return 'adresse illisible'; }
  if (u.protocol === 'https:') return null;
  if (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return null;
  return 'un jeton ne part que vers une adresse https (ou localhost)';
}

/**
 * @param {object} o
 * @param {(q:{origine:string, refuse:boolean}) => Promise<string|null>} o.demander  la saisie du jeton ; `null` = annulée
 * @param {(url:string) => string|null} [o.adresseAdmise]  `null` quand l'adresse est admise
 * @param {() => number} [o.maintenant]
 */
export function creerAccesPg({ demander, adresseAdmise = adresseAdmisePg, maintenant = Date.now }) {
  const connus = new Map();   // origine -> jeton
  const enCours = new Map();  // origine -> promesse de la saisie en cours
  const refusees = new Map(); // origine -> instant d'une saisie annulée

  return {
    /** Les en-têtes à poser sur une requête vers `url` : `{}` tant qu'on n'a rien pour cette origine. */
    entetes(url) {
      const origine = origineDe(url);
      if (!origine || !connus.has(origine) || adresseAdmise(url)) return {};
      return { Authorization: 'Bearer ' + connus.get(origine) };
    },

    /**
     * À appeler sur un 401. `true` : on a un (nouveau) jeton, la requête peut être rejouée une fois ; `false` : non.
     * @param {string} url
     * @param {boolean} avaitEntete  la requête refusée portait déjà un jeton
     */
    async apres401(url, avaitEntete = false) {
      const origine = origineDe(url);
      if (!origine || adresseAdmise(url)) return false;
      if (avaitEntete) connus.delete(origine);
      if (enCours.has(origine)) return enCours.get(origine);
      const t = refusees.get(origine);
      if (!avaitEntete && t !== undefined && maintenant() - t < DELAI_REFUS_MS) return false;
      const saisie = (async () => {
        let jeton = null;
        try { jeton = await demander({ origine, refuse: !!avaitEntete }); } catch { jeton = null; }
        if (typeof jeton !== 'string' || !jeton.trim()) { refusees.set(origine, maintenant()); return false; }
        connus.set(origine, jeton.trim());
        refusees.delete(origine);
        return true;
      })();
      enCours.set(origine, saisie);
      try { return await saisie; } finally { enCours.delete(origine); }
    },

    /** Oublier le jeton d'une origine (ou de toutes). */
    oublier(origine) { if (origine) connus.delete(origine); else connus.clear(); },
  };
}
