/**
 * Charger a la demande : l'outil commun des modules qu'Atlas n'ouvre qu'au besoin.
 *
 * ## Pourquoi un module a part
 *
 * Tout ce que `index_v7.html` ou `app_v7.js` charge d'avance est paye par TOUS
 * les modes — page seule, `?scene=`, `?mode=view`, widget — meme quand ils ne s'en
 * servent pas. Un module specialise (le moteur de formulaire, par exemple) se
 * charge donc au moment ou l'on en a besoin ; les deux regles qui s'ensuivent
 * sont toujours les memes et se disent ici une fois :
 *
 *   - **un seul chargement**, meme si dix appelants le demandent ensemble ;
 *   - **un echec ne se memorise pas** : une coupure reseau d'une seconde ne doit
 *     pas rendre le module indisponible jusqu'au rechargement de la page.
 *
 * Aucune dependance, aucun acces global a l'import : tout se passe a l'appel,
 * avec un `document` qu'on peut remplacer — c'est ce qui rend ce module testable
 * hors navigateur.
 */

/**
 * Enveloppe un chargement pour qu'il ne s'execute qu'une fois.
 *
 * @template T
 * @param {() => Promise<T>} charger
 * @returns {() => Promise<T>} la meme promesse tant que le chargement reussit ou est en cours
 */
export function unSeulChargement(charger) {
  let promesse = null;
  return () => {
    if (!promesse) {
      promesse = Promise.resolve().then(charger).catch((e) => {
        promesse = null;   // un echec se retente au prochain appel
        throw e;
      });
    }
    return promesse;
  };
}

/**
 * Charge UN script classique et rend la main quand il a fini de s'executer.
 *
 * @param {string} url
 * @param {{document?: Document}} [o]
 * @returns {Promise<void>}
 */
export function chargerScript(url, { document: doc = globalThis.document } = {}) {
  return new Promise((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = url;
    // `async = false` : un script insere par programme est asynchrone par
    // defaut. On attend de toute facon chaque `load`, mais le dire evite qu'un
    // futur appelant en lance plusieurs d'un coup en croyant garder l'ordre.
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`script introuvable : ${url}`));
    doc.head.appendChild(s);
  });
}

/**
 * Charge des scripts classiques l'un APRES l'autre.
 *
 * Les scripts d'un meme moteur s'appuient les uns sur les autres (le second lit
 * ce que le premier a pose sur `window`) : l'ordre est celui de la liste, et le
 * suivant n'est pas insere tant que le precedent n'a pas fini. Au premier
 * echec, les suivants ne sont pas demandes.
 *
 * @param {string[]} urls
 * @param {{document?: Document, charger?: typeof chargerScript}} [o]
 * @returns {Promise<void>}
 */
export async function chargerScriptsEnOrdre(urls, { document: doc = globalThis.document, charger = chargerScript } = {}) {
  for (const url of urls) await charger(url, { document: doc });
}
