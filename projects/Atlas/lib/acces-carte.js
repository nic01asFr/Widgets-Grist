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
