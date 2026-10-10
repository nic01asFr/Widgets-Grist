/**
 * Accès officiel à la carte MapLibre d'Atlas, pour les modules qui s'y attachent depuis l'extérieur d'`app_v7.js`
 * (composant carte BI, outils d'essai, scripts de mise au point).
 *
 * Avant : ces modules lisaient `window.__atlasMap`, un handle de débogage « à retirer ». Il reste en place, mais n'est plus
 * le contrat. Le contrat est :
 *
 *  - `window.__atlasCarte` : l'objet carte MapLibre, posé dès sa création (le style peut ne pas être chargé) ;
 *  - l'événement `atlas:carte-prete`, émis UNE fois sur `window` quand le style de base est en place, avec
 *    `detail.carte` ; `window.__atlasCartePrete` vaut alors `true`. Un module qui arrive après l'événement le sait
 *    en lisant ce drapeau, ou en appelant `attendreCarte`.
 *
 * Module pur : la cible (`window`) est injectée, rien ne dépend du navigateur.
 */
export const EVENEMENT_CARTE_PRETE = 'atlas:carte-prete';

/** Pose la carte à l'adresse officielle. Ne dit pas qu'elle est prête. */
export function exposerCarte(cible, carte) {
  if (!cible || !carte) return false;
  cible.__atlasCarte = carte;
  cible.__atlasCartePrete = false;
  return true;
}

/** Dit, une seule fois par carte, que le style est en place. Renvoie vrai si l'événement vient d'être émis. */
export function signalerCartePrete(cible, carte) {
  if (!cible || !carte || cible.__atlasCartePrete === true) return false;
  cible.__atlasCartePrete = true;
  const Evt = cible.CustomEvent || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
  if (Evt && typeof cible.dispatchEvent === 'function') {
    try { cible.dispatchEvent(new Evt(EVENEMENT_CARTE_PRETE, { detail: { carte } })); } catch (_) { /* un écouteur ne casse pas Atlas */ }
  }
  return true;
}

/**
 * Promesse de la carte prête (style chargé). Résout tout de suite si l'événement a déjà eu lieu.
 * @param {{delai?: number}} [opts] délai maximal en ms (défaut 20 000) ; au-delà, la promesse est rejetée. `Infinity` (ou 0) : attente
 * sans limite. Une carte dans un cadre non rendu (sous la ligne de flottaison, onglet masqué) n'émet son premier rendu qu'une fois
 * visible : le composant BI attend donc sans limite.
 */
export function attendreCarte(cible, { delai = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    if (cible && cible.__atlasCarte && cible.__atlasCartePrete === true) return resolve(cible.__atlasCarte);
    let minuterie = null;
    const fin = (e) => {
      if (minuterie) clearTimeout(minuterie);
      cible.removeEventListener(EVENEMENT_CARTE_PRETE, fin);
      resolve((e && e.detail && e.detail.carte) || cible.__atlasCarte);
    };
    cible.addEventListener(EVENEMENT_CARTE_PRETE, fin);
    if (!Number.isFinite(delai) || delai <= 0) return;
    minuterie = setTimeout(() => {
      cible.removeEventListener(EVENEMENT_CARTE_PRETE, fin);
      reject(new Error('carte Atlas indisponible après ' + delai + ' ms'));
    }, delai);
  });
}

/**
 * Une erreur de la carte rend-elle le style de base INUTILISABLE (la carte ne sera alors jamais « prête ») ? Si oui, Atlas bascule sur un aplat.
 *
 * Deux familles : le réseau manque (échec de `fetch`, délai, hors ligne : `status` 0 ou message), ou le serveur du style (ou du document
 * TileJSON d'une source) répond une erreur HTTP — 404, 503 : service arrêté, quota, panne. Seule la première bascule avant ; la seconde laissait
 * la carte sans « load », donc le composant BI muet pour toujours (l'hôte ne voyait qu'un `delai`).
 *
 * Ne sont PAS fatales : une tuile (`e.tile`), un sprite, une police — la carte se charge sans eux.
 * @param {{error?:{message?:string, status?:number, url?:string}, sourceId?:string, tile?:object}} e  évènement `error` de MapLibre
 * @param {string|null} urlStyle  adresse du style de base, quand il en a une (les fonds IGN en raster n'en ont pas)
 */
export function styleDeBaseIllisible(e, urlStyle = null) {
  const err = e && e.error; if (!err || typeof err !== 'object') return false;
  const message = String(err.message || '');
  if (/fetch|network|load failed|failed to|timeout|offline|impossible/i.test(message) || err.status === 0) return true;
  if (typeof err.status !== 'number' || err.status < 400) return false;
  if (e.tile) return false;                          // une tuile manquante n'empêche pas le style de se charger
  if (e.sourceId) return true;                       // le document TileJSON d'une source
  return !!urlStyle && err.url === urlStyle;         // le document de style lui-même
}
