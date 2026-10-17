/**
 * La zone d’interface de la carte BI : un calque posé sur la carte, DANS la zone utile (la carte moins les marges de l’hôte), qui accueille les modules
 * optionnels (légende, curseur de temps). Quatre coins et un bas-centre ; chaque module y dépose son élément et n’a pas à connaître les marges.
 *
 * Module sans dépendance : le DOM est injecté. Chargé à la demande, seulement quand la scène déclare `interface` (voir docs/EXPLOITATION-EXTERNE-BI.md).
 * Tout est thémé par les variables `--atlas-*` de la charte (lib/charte/interface.js), rien n’est figé en couleur.
 */
export const COINS = Object.freeze(['haut-gauche', 'haut-droite', 'bas-gauche', 'bas-droite', 'bas-centre']);
const STYLE_ID = 'atlas-bi-ui-style';
const ESPACE = 8;
/** Le bas laisse la place des crédits de la carte (MapLibre les pose en bas à droite, sur ~20 px) : l’interface ne les recouvre jamais. */
const ESPACE_BAS = 28;

export const FEUILLE = `
.atlas-bi-ui { position: absolute; z-index: 4; pointer-events: none; font-family: var(--atlas-police, system-ui, sans-serif); font-size: var(--atlas-taille-texte, 13px); color: var(--atlas-encre, #1f1b14); }
.atlas-bi-ui-coin { position: absolute; display: flex; flex-direction: column; gap: 8px; max-width: 100%; max-height: 100%; pointer-events: none; }
.atlas-bi-ui-coin > * { pointer-events: auto; }
.atlas-bi-ui-haut-gauche { top: 0; left: 0; } .atlas-bi-ui-haut-droite { top: 0; right: 0; align-items: flex-end; }
.atlas-bi-ui-bas-gauche { bottom: 0; left: 0; justify-content: flex-end; } .atlas-bi-ui-bas-droite { bottom: 0; right: 0; justify-content: flex-end; align-items: flex-end; }
.atlas-bi-ui-bas-centre { bottom: 0; left: 50%; transform: translateX(-50%); justify-content: flex-end; width: min(520px, 100%); }
.atlas-bi-ui-carte { background: var(--atlas-fond, #fff); color: var(--atlas-encre, #1f1b14); border: 1px solid var(--atlas-bord, #d8d6d2); border-radius: 10px; box-shadow: 0 1px 6px rgba(0,0,0,.16); padding: 8px 10px; }
.atlas-bi-ui button { font: inherit; color: inherit; }
.atlas-bi-ui button:focus-visible, .atlas-bi-ui input:focus-visible { outline: 2px solid var(--atlas-selection, #1f1b14); outline-offset: 2px; }
`;

/**
 * @param {{ document?: Document, conteneur: HTMLElement, variables?: () => Record<string,string>, appliquer?: Function }} o
 *   `conteneur` : le conteneur de la carte (position relative) ; `variables()` : les variables CSS de la charte ; `appliquer(element, variables)` les écrit.
 */
export function creerZone({ document: doc = globalThis.document, conteneur, variables = () => ({}), appliquer = null }) {
  if (!doc || !conteneur || typeof conteneur.appendChild !== 'function') throw new Error('zone d’interface : un conteneur de carte est nécessaire');
  if (doc.head && !doc.getElementById(STYLE_ID)) { const s = doc.createElement('style'); s.id = STYLE_ID; s.textContent = FEUILLE; doc.head.appendChild(s); }
  const racine = doc.createElement('div'); racine.className = 'atlas-bi-ui'; racine.setAttribute('data-atlas-bi-ui', '');
  const coins = new Map();
  for (const nom of COINS) { const c = doc.createElement('div'); c.className = 'atlas-bi-ui-coin atlas-bi-ui-' + nom; coins.set(nom, c); racine.appendChild(c); }
  conteneur.appendChild(racine);
  const ecrire = () => { if (appliquer) { try { appliquer(racine, variables()); } catch (e) { /* variables illisibles : les valeurs de repli de la feuille s’appliquent */ } } };
  ecrire();
  /** La zone suit les marges de l’hôte : `{ top, right, bottom, left }` en pixels, ou rien. */
  function ajuster(marges) {
    const m = marges || { top: 0, right: 0, bottom: 0, left: 0 };
    racine.style.top = (m.top + ESPACE) + 'px'; racine.style.right = (m.right + ESPACE) + 'px'; racine.style.bottom = (m.bottom + ESPACE_BAS) + 'px'; racine.style.left = (m.left + ESPACE) + 'px';
  }
  ajuster(null);
  return {
    racine, coin: (nom) => coins.get(COINS.includes(nom) ? nom : 'bas-gauche'), ajuster, actualiser: ecrire,
    detruire() { if (racine.parentNode && racine.parentNode.removeChild) racine.parentNode.removeChild(racine); else if (typeof racine.remove === 'function') racine.remove(); },
  };
}
