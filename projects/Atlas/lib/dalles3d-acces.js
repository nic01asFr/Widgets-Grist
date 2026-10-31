/**
 * L'accès à une maquette en dalles 3D qui demande un identifiant (en-tête `Authorization: Basic`).
 *
 * Une maquette est servie comme un fond de carte ; quand son serveur refuse sans identifiant (HTTP 401), Atlas demande à la personne un identifiant et un mot
 * de passe, les garde **en mémoire de cette page seulement** (jamais dans le stockage du navigateur, jamais dans une adresse, jamais dans la scène que l'hôte
 * voit) et les présente à CETTE origine seule.
 *
 * Module pur : la saisie (`demander`) et le contrôle d'adresse (`adresseAdmise`) sont injectés ; il se teste sous Node.
 *
 * Règles :
 *  - l'en-tête n'est posé que vers une origine pour laquelle on a déjà un identifiant, et seulement si l'adresse est admise (https, ou http sur localhost :
 *    un identifiant en clair ne traverse pas un réseau) ;
 *  - un 401 alors qu'on avait présenté un identifiant : il est jugé refusé et oublié, la personne est invitée à le ressaisir ;
 *  - plusieurs 401 en même temps (des dalles chargées trois à la fois) ne posent qu'UNE question ;
 *  - une saisie annulée n'est pas redemandée tout de suite : `DELAI_REFUS_MS` laisse la carte se taire au lieu de rouvrir la boîte à chaque dalle.
 */
export const VERSION = '1.0.0';
export const DELAI_REFUS_MS = 30000;

/** « identifiant:mot de passe » en UTF-8, puis en base64 (le codage de Basic). */
export function enteteBasic(identifiant, motDePasse) {
  const octets = new TextEncoder().encode(String(identifiant) + ':' + String(motDePasse));
  let bin = '';
  for (const o of octets) bin += String.fromCharCode(o);
  return 'Basic ' + btoa(bin);
}

const origineDe = (url) => { try { return new URL(String(url)).origin; } catch { return null; } };

/**
 * @param {object} o
 * @param {(q:{origine:string, refuse:boolean}) => Promise<{identifiant:string, motDePasse:string}|null>} o.demander  la saisie ; `null` = annulée
 * @param {(url:string) => string|null} o.adresseAdmise  `null` quand l'adresse est admise (même contrat que lib/scene-externe.js)
 * @param {() => number} [o.maintenant]
 */
export function creerAccesDalles({ demander, adresseAdmise, maintenant = Date.now }) {
  const connus = new Map();      // origine -> en-tête Authorization
  const enCours = new Map();     // origine -> promesse de la saisie en cours
  const refusees = new Map();    // origine -> instant d'une saisie annulée

  return {
    /** Les en-têtes à poser sur une requête vers `url` : `{}` tant qu'on n'a rien pour cette origine. */
    entetes(url) {
      const origine = origineDe(url);
      if (!origine || !connus.has(origine) || adresseAdmise(url)) return {};
      return { Authorization: connus.get(origine) };
    },

    /**
     * À appeler sur un 401. `true` : on a (de nouveaux) identifiants, la requête peut être rejouée une fois ; `false` : non.
     * @param {string} url
     * @param {boolean} avaitEntete  la requête refusée portait déjà un identifiant
     */
    async apres401(url, avaitEntete = false) {
      const origine = origineDe(url);
      if (!origine || adresseAdmise(url)) return false;
      if (avaitEntete) connus.delete(origine);   // refusé : on ne le présente plus
      if (enCours.has(origine)) return enCours.get(origine);
      const t = refusees.get(origine);
      if (!avaitEntete && t !== undefined && maintenant() - t < DELAI_REFUS_MS) return false;
      const saisie = (async () => {
        let r = null;
        try { r = await demander({ origine, refuse: !!avaitEntete }); } catch { r = null; }
        if (!r || typeof r.identifiant !== 'string' || typeof r.motDePasse !== 'string' || !r.identifiant) { refusees.set(origine, maintenant()); return false; }
        connus.set(origine, enteteBasic(r.identifiant, r.motDePasse));
        refusees.delete(origine);
        return true;
      })();
      enCours.set(origine, saisie);
      try { return await saisie; } finally { enCours.delete(origine); }
    },

    /** Oublier les identifiants d'une origine (ou de toutes). */
    oublier(origine) { if (origine) connus.delete(origine); else connus.clear(); },
  };
}
