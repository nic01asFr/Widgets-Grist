/**
 * Habillage de la carte : ce qui se pose par-dessus la scène.
 *
 * Quatre éléments se disputaient le bas de la carte — la légende, la bulle du
 * récit, la localisation et l'attribution — et chacun y était ancré pour son
 * compte. Sur un widget Grist de 860 px, cela donnait une bulle centrée qui
 * mordait sur la colonne de la légende, une légende remontée à mi-carte pour
 * lui céder la place, et une attribution OpenStreetMap recouverte par la bulle
 * — mention que la licence impose de laisser lisible.
 *
 * Le bas de la carte devient un étage partagé : l'attribution tout en bas sur
 * toute la largeur, puis la légende dans sa colonne à gauche et la bulle à sa
 * droite. La localisation rejoint les pastilles du haut, sur mobile seulement.
 *
 * Les mesures ci-dessous doivent rester celles de `index_v7.html` (variables
 * `--etage-*` de `.map-frame`) : le seuil se calcule ici, la mise en page là.
 */

export const ETAGE = Object.freeze({
  marge: 24,
  legende: 220,
  gouttiere: 16,
  // En deçà, le texte d'une étape passe sur trop de lignes : la bulle monte
  // plus haut que la légende qu'elle était censée côtoyer.
  bulleMin: 360,
});

/** Largeur de carte à partir de laquelle légende et bulle tiennent côte à côte. */
export function largeurMinCoteACote(e = ETAGE) {
  return e.marge + e.legende + e.gouttiere + e.bulleMin + e.marge;
}

/**
 * La légende et la bulle tiennent-elles côte à côte ?
 *
 * On mesure la CARTE, pas la fenêtre : en édition, le rail et les panneaux
 * mangent la largeur, et une fenêtre de 1400 px peut ne laisser que 600 px à
 * la carte. L'ancienne règle s'en remettait à la largeur de fenêtre et laissait
 * la bulle recouvrir la légende dans ce cas.
 *
 * Sur mobile, l'étage n'existe pas : la légende s'y replie pendant le récit.
 *
 * @param {{largeurCarte?: number, mobile?: boolean}} etat
 */
export function etageCoteACote({ largeurCarte, mobile } = {}) {
  if (mobile) return false;
  const l = Number(largeurCarte);
  return Number.isFinite(l) && l >= largeurMinCoteACote();
}

/**
 * Marge basse de la caméra pendant le récit.
 *
 * Une étape enregistre un centre composé sur la carte entière ; la bulle en
 * recouvre ensuite le bas. La marge fait viser la partie de la carte qui reste
 * visible — la distance du bas de la carte au haut de la bulle, plus une
 * respiration — et la caméra y centre l'étape.
 *
 * Bornée à 60 % de la hauteur : sur une fenêtre très basse, une bulle haute
 * rejetterait sinon le centre hors de l'écran.
 *
 * @param {{basCarte?: number, hautBulle?: number, hauteurCarte?: number, respiration?: number}} mesures
 *   positions verticales en pixels d'écran (`getBoundingClientRect`)
 * @returns {number} marge en pixels, 0 quand il n'y a rien à éviter
 */
export function margeBasseRecit({ basCarte, hautBulle, hauteurCarte, respiration = 12 } = {}) {
  const b = Number(basCarte);
  const h = Number(hautBulle);
  const H = Number(hauteurCarte);
  if (![b, h, H].every(Number.isFinite) || H <= 0) return 0;
  const brut = b - h + respiration;
  if (brut <= 0) return 0;
  return Math.round(Math.min(brut, H * 0.6));
}

/**
 * Forme du bandeau d'infos carte (coordonnées, zoom, inclinaison — édition).
 *
 * Il partage l'étage du bas avec la légende : ancré à droite, il n'a que ce
 * que la colonne de la légende laisse libre. Mesuré dans une fenêtre de
 * 824 px, il passait sous la légende et en perdait les coordonnées. Quand il
 * ne tient pas, il abandonne d'abord les coordonnées — zoom et inclinaison
 * servent à composer une vue — puis se retire.
 *
 * Sur mobile, il se retire : la barre d'onglets occupe le bas, et un
 * téléphone n'est pas l'endroit où l'on compose une vue au dixième de zoom.
 *
 * @param {{largeurCarte?: number, largeurComplete?: number, largeurCompacte?: number, mobile?: boolean}} mesures
 *   largeurs du bandeau mesurées dans ses deux formes
 * @returns {'complet'|'compact'|'masque'}
 */
export function formeBandeauInfos({ largeurCarte, largeurComplete, largeurCompacte, mobile } = {}) {
  if (mobile) return 'masque';
  const dispo = Number(largeurCarte) - (ETAGE.marge + ETAGE.legende + ETAGE.gouttiere + ETAGE.marge);
  if (!Number.isFinite(dispo)) return 'complet';
  if (!(Number(largeurComplete) > dispo)) return 'complet';
  if (!(Number(largeurCompacte) > dispo)) return 'compact';
  return 'masque';
}

/**
 * Faut-il une pastille « Me localiser » ?
 *
 * Sur mobile seulement. Au bureau, la position de la machine ne dit rien du
 * terrain qu'on regarde ; sur un téléphone, c'est la première question qu'on
 * pose à une carte.
 *
 * @param {{mobile?: boolean, geolocalisation?: boolean}} etat
 */
export function pastilleLocalisationRequise({ mobile, geolocalisation } = {}) {
  return !!mobile && !!geolocalisation;
}
