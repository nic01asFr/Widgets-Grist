/**
 * Le curseur de temps de la carte BI, en module optionnel : un curseur, un bouton lecture/pause et la valeur courante, pour la dimension temporelle déclarée par
 * la scène (`temps: { champ, mode, pas, valeur }`). Déclaré par `interface: { temps: true }` ou `{ temps: { position: 'bas-centre' } }`.
 *
 * Il pilote le temps de la carte comme le ferait l’hôte (`setTime`, `play`, `pause`) et le dit à l’hôte par l’événement `time` (origine « utilisateur » quand c’est la
 * personne qui le déplace). Clavier : flèches du curseur, Espace sur le bouton. Annoncé aux lecteurs d’écran (`role="group"`, valeur lisible). Module sans
 * dépendance : le DOM, la zone et l’état du temps sont injectés.
 */
const STYLE_ID = 'atlas-bi-temps-style';
export const FEUILLE = `
.atlas-bi-temps { display: flex; align-items: center; gap: 10px; }
.atlas-bi-temps-bouton { flex: none; width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--atlas-accent-lisible, #c44536); background: var(--atlas-accent, #c44536); color: var(--atlas-sur-accent, #fff); cursor: pointer; font-size: 14px; line-height: 1; }
.atlas-bi-temps-bouton:hover { filter: brightness(.94); }
.atlas-bi-temps-curseur { flex: 1; min-width: 80px; accent-color: var(--atlas-accent, #c44536); }
.atlas-bi-temps-valeur { flex: none; min-width: 3.5em; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
`;

/**
 * @param {{ document?: Document, zone: object, etat: () => { champ: string|null, min: number|null, max: number|null, valeur: number|null, pas: number, enLecture: boolean },
 *   poser: (valeur: number) => void, lire: () => void, pauser: () => void, position?: string, formater?: (valeur: number) => string }} o
 */
export function creerTemps({ document: doc = globalThis.document, zone, etat, poser, lire, pauser, position = 'bas-centre', formater = (v) => String(Math.round(v * 100) / 100) }) {
  if (doc.head && !doc.getElementById(STYLE_ID)) { const s = doc.createElement('style'); s.id = STYLE_ID; s.textContent = FEUILLE; doc.head.appendChild(s); }
  const racine = doc.createElement('div'); racine.className = 'atlas-bi-ui-carte atlas-bi-temps'; racine.setAttribute('role', 'group'); racine.setAttribute('aria-label', 'Temps');
  const bouton = doc.createElement('button'); bouton.type = 'button'; bouton.className = 'atlas-bi-temps-bouton';
  const curseur = doc.createElement('input'); curseur.type = 'range'; curseur.className = 'atlas-bi-temps-curseur'; curseur.setAttribute('aria-label', 'Valeur du temps');
  const valeur = doc.createElement('output'); valeur.className = 'atlas-bi-temps-valeur'; valeur.setAttribute('aria-live', 'off');
  racine.appendChild(bouton); racine.appendChild(curseur); racine.appendChild(valeur);
  zone.coin(position).appendChild(racine);
  bouton.addEventListener('click', () => { const e = etat(); if (e.enLecture) pauser(); else lire(); rafraichir(); });
  curseur.addEventListener('input', () => { const e = etat(); if (e.enLecture) pauser(); poser(Number(curseur.value)); rafraichir(); });

  /** Redessine d’après l’état du temps ; le module disparaît quand la scène n’a pas de dimension temporelle. */
  function rafraichir() {
    const e = etat();
    const actif = !!e.champ && Number.isFinite(e.min) && Number.isFinite(e.max);
    racine.style.display = actif ? '' : 'none';
    if (!actif) return false;
    curseur.min = String(e.min); curseur.max = String(e.max); curseur.step = String(e.pas > 0 ? e.pas : 1);
    const v = Number.isFinite(e.valeur) ? e.valeur : e.max;
    curseur.value = String(v); valeur.textContent = formater(v); curseur.setAttribute('aria-valuetext', formater(v));
    bouton.textContent = e.enLecture ? '❚❚' : '▶'; bouton.setAttribute('aria-label', e.enLecture ? 'Pause' : 'Lecture');
    return true;
  }
  rafraichir();
  return { racine, rafraichir, detruire() { if (racine.parentNode && racine.parentNode.removeChild) racine.parentNode.removeChild(racine); } };
}
