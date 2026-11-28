/**
 * Les panneaux d'Atlas sur telephone : des feuilles qu'on fait glisser.
 *
 * L'onglet « Carte » n'etait pas une destination, c'etait « referme ce qui
 * masque la carte » — deguise en onglet. Le defaut se voyait a l'edition d'un
 * recit : pour cadrer la vue avant de capturer une etape, il fallait atteindre
 * un bouton place sous la feuille qui, precisement, recouvrait la carte.
 *
 * Sur une carte, on ne va pas a la carte : elle est toujours la, dessous. On
 * ecarte ce qui la cache. La feuille a donc trois positions — fermee, a
 * mi-hauteur, pleine — et le geste decide, comme dans n'importe quelle
 * application de cartographie.
 *
 * La position intermediaire n'est pas un ornement : c'est elle qui permet de
 * garder le panneau du recit sous la main tout en voyant la carte qu'on cadre.
 *
 * Ce module ne touche pas au DOM. Il repond a une question — ou doit aller la
 * feuille — pour que cette reponse se verifie sans navigateur.
 */

export const VERSION = '1.0.0';

/** Part de la hauteur d'ecran occupee par la feuille, par position. */
export const ANCRAGES = Object.freeze({ fermee: 0, demi: 0.52, pleine: 0.92 });

/** L'ordre dans lequel un geste franc fait passer d'une position a l'autre. */
const ORDRE = ['fermee', 'demi', 'pleine'];

/**
 * Un geste vif compte plus que la distance : c'est ce qui distingue le coup de
 * pouce qui referme d'un deplacement lent qui cherche une hauteur precise.
 * En fraction de hauteur d'ecran par seconde.
 */
export const VITESSE_FRANCHE = 0.9;

/**
 * Ou la feuille doit-elle s'arreter ?
 *
 * @param {object} g
 * @param {string} g.depart      position au debut du geste
 * @param {number} g.fraction    part de hauteur visible a la fin du geste (0..1)
 * @param {number} g.vitesse     fraction de hauteur par seconde ; negatif = vers le bas
 * @returns {string} la position d'arrivee
 */
export function ancrageApresGeste({ depart = 'demi', fraction = 0, vitesse = 0 } = {}) {
  const i = Math.max(0, ORDRE.indexOf(depart));
  // Un geste franc deplace d'un cran, quelle que soit la distance parcourue :
  // c'est l'intention qui est lue, pas le trajet.
  if (vitesse <= -VITESSE_FRANCHE) return ORDRE[Math.max(0, i - 1)];
  if (vitesse >= VITESSE_FRANCHE) return ORDRE[Math.min(ORDRE.length - 1, i + 1)];
  return ancragePlusProche(fraction);
}

/** La position dont la hauteur est la plus proche de celle atteinte. */
export function ancragePlusProche(fraction) {
  let meilleur = 'fermee';
  let ecart = Infinity;
  for (const nom of ORDRE) {
    const d = Math.abs(ANCRAGES[nom] - fraction);
    if (d < ecart) { ecart = d; meilleur = nom; }
  }
  return meilleur;
}

/**
 * La hauteur visible pendant le geste, bornee.
 *
 * On autorise un depassement vers le bas — la feuille suit le doigt jusqu'a
 * disparaitre — mais pas vers le haut : rien au-dessus de la position pleine,
 * sinon la feuille se decolle du bord de l'ecran.
 */
export function fractionPendantGeste(depart, deltaY, hauteurEcran) {
  if (!hauteurEcran) return ANCRAGES[depart] ?? 0;
  const base = ANCRAGES[depart] ?? 0;
  return Math.min(ANCRAGES.pleine, Math.max(0, base - deltaY / hauteurEcran));
}

/**
 * Le geste appartient-il a la feuille, ou au contenu qu'elle porte ?
 *
 * Une liste de couches se fait defiler ; si la feuille interceptait ce geste,
 * elle se refermerait au premier essai de lecture. Elle ne prend la main que
 * depuis la poignee, ou quand le contenu est deja en haut et qu'on tire vers
 * le bas — la ou le defilement n'a plus rien a offrir.
 */
export function gestePourLaFeuille({ surPoignee = false, defilement = 0, versLeBas = true } = {}) {
  if (surPoignee) return true;
  return defilement <= 0 && versLeBas;
}

/**
 * Que devient la feuille quand on touche l'onglet deja actif ?
 *
 * Rouvrir ce qui est ouvert ne veut rien dire ; refermer, si. C'est ce qui
 * remplace l'ancien onglet « Carte » : le meme doigt, un geste de moins.
 */
export function ancrageApresOnglet({ ongletActif, onglet, position }) {
  if (onglet !== ongletActif) return 'demi';
  return position === 'fermee' ? 'demi' : 'fermee';
}

/**
 * Où doit se tenir la fiche quand on attend un toucher sur la carte ?
 *
 * Toucher un champ déploie la fiche en pleine hauteur, pour que le clavier ne
 * masque pas la saisie. Mais après « Envoyer », en série, Atlas redemande de
 * toucher la carte pour placer l'objet suivant : restée en pleine hauteur, la
 * fiche la recouvre tout entière et on ne peut plus rien poser sans la replier
 * à la main. La pleine hauteur redescend donc à mi-hauteur ; les autres
 * positions ne bougent pas.
 */
export function ancrageAvantPoseSurCarte(position) {
  return position === 'pleine' ? 'demi' : position;
}

/**
 * Dit « touchez » où le texte dit « cliquez », quand l'écran se commande au doigt.
 * Les consignes sont écrites pour la souris ; sur un téléphone, « Cliquez sur la
 * carte » sonne comme une consigne qui n'est pas pour soi.
 */
export function pourLeDoigt(texte, tactile) {
  if (!tactile || typeof texte !== 'string') return texte;
  return texte
    .replace(/\bCliquez sur /g, 'Touchez ').replace(/\bcliquez sur /g, 'touchez ')
    .replace(/\bCliquez\b/g, 'Touchez').replace(/\bcliquez\b/g, 'touchez');
}
