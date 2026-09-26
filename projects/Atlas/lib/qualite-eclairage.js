/**
 * Qualité adaptative de l'éclairage nocturne — ce qui se décide sans three.js.
 *
 * Le budget des luminaires (vraies lumières, ombres, façades éclairées, ratio
 * de pixels) n'est plus fixe : il part d'un **palier** choisi selon l'appareil
 * (`palierInitial`), puis un **régulateur** (`creerRegulateur`) le déplace
 * d'après les images par seconde mesurées :
 *
 * - **descente rapide** : deux fenêtres de mesure consécutives sous 90 % de
 *   l'objectif suffisent (≈ 1,5 s) ;
 * - **remontée prudente** : trois fenêtres consécutives au-dessus de
 *   l'objectif + une marge, et jamais vers un palier d'où l'on vient de tomber
 *   avant un délai qui double à chaque chute ; deux chutes depuis le même
 *   palier l'interdisent pour la session. D'où : pas d'oscillation visible,
 *   au plus une remontée d'essai, puis le palier tient ;
 * - **descente inutile annulée** : si les deux fenêtres qui suivent une
 *   descente ne gagnent pas 10 % sur les deux qui l'ont déclenchée (le bruit
 *   de mesure est de ± 5 à 10 % sur Intel UHD), ce ne sont pas les lampes qui
 *   coûtent (le fond de carte,
 *   le bâti, le ratio de pixels) — on remonte aussitôt, et l'on ne redescend
 *   plus qu'à une vraie nouvelle chute (sous 85 % de la mesure d'alors).
 *   Mesuré le 24/09/2026 : à 1 440 × 900 à 1,5 sur Intel UHD, la carte seule,
 *   sans lampes, fait 52–54 images/s ; sans ce garde-fou, l'objectif de 55
 *   aurait retiré ombres et lumières pour rien.
 *
 * Mesuré le 24/09/2026 (Intel UHD, 1 440 × 900 à 1,5, rue z19,5, 95
 * luminaires) : sur une image d'environ 15 ms, MapLibre en prend la quasi-
 * totalité ; il reste 3 ms au calque three.js pour tenir 55 images/s. Au
 * téléphone émulé (390 × 844 × 3, processeur ÷ 4), MapLibre seul fait
 * 25 images/s à ratio 3, 40 à ratio 2, 57 à ratio 1,5 : le ratio de pixels est
 * le seul levier qui compte, d'où `ratioMax` aux paliers bas.
 */

export const VERSION = '0.1.0';

/**
 * Les paliers, du plus riche au plus sobre.
 * - `ombres` / `lumieres` : sources qui portent ombre / vraie lumière three.js ;
 * - `facades` : copie éclairée du bâti proche (si elle est retenue) ;
 * - `ratioMax` : plafond du ratio de pixels de la carte (`null` : celui de
 *   l'appareil). Le calque three.js partage le canvas de MapLibre : son ratio
 *   est celui de la carte, il ne se plafonne pas seul.
 *
 * Au palier `minimal`, aucune vraie lumière : les lampes (émission), leurs
 * halos et les taches calculées au sol restent — ils ne coûtent presque rien.
 */
export const PALIERS = Object.freeze([
  Object.freeze({ nom: 'haut', ombres: 4, lumieres: 16, facades: true, ratioMax: null }),
  Object.freeze({ nom: 'moyen', ombres: 2, lumieres: 8, facades: true, ratioMax: null }),
  Object.freeze({ nom: 'bas', ombres: 0, lumieres: 4, facades: false, ratioMax: 2 }),
  Object.freeze({ nom: 'minimal', ombres: 0, lumieres: 0, facades: false, ratioMax: 1.5 }),
]);

/** Indice d'un palier par son nom ; `-1` si inconnu. */
export function indicePalier(nom) {
  return PALIERS.findIndex((p) => p.nom === nom);
}

/**
 * Objectif d'images par seconde : 30 au téléphone, 55 ailleurs.
 * @param {{ mobile?: boolean }} appareil
 */
export function objectifImages(appareil) {
  return appareil?.mobile ? 30 : 55;
}

/**
 * Le palier de départ, selon l'appareil.
 *
 * - `allege` (réglage `light3d` : téléphone en lecture, `?no3d=1`, petit
 *   processeur) : `minimal` si l'appareil est aussi pauvre en mémoire ou en
 *   cœurs, sinon `bas` — les modèles y sont coupés, les lampes restent ;
 * - téléphone : `bas` (ratio plafonné à 2 : à 3, MapLibre seul tombe sous
 *   30 images/s) ; `minimal` sous 4 Go ou 4 cœurs ;
 * - ordinateur : `haut` ; `moyen` sous 4 Go, sous 4 cœurs, ou à un ratio de
 *   pixels ≥ 2,5 (un écran très dense multiplie le coût de chaque pixel).
 *
 * Une valeur inconnue (`navigator.deviceMemory` absent hors Chromium) ne
 * pénalise pas.
 * @param {{ mobile?: boolean, allege?: boolean, memoireGo?: number,
 *   coeurs?: number, ratioPixels?: number }} a
 * @returns {number} indice dans `PALIERS`
 */
export function palierInitial(a = {}) {
  const mem = Number(a.memoireGo);
  const coeurs = Number(a.coeurs);
  const pauvre = (Number.isFinite(mem) && mem > 0 && mem < 4)
    || (Number.isFinite(coeurs) && coeurs > 0 && coeurs < 4);
  if (a.allege || a.mobile) return indicePalier(pauvre ? 'minimal' : 'bas');
  const dense = Number(a.ratioPixels) >= 2.5;
  return indicePalier(pauvre || dense ? 'moyen' : 'haut');
}

/**
 * Le budget effectif d'un palier, une fois les réglages de l'utilisateur
 * appliqués : le bouton « Ombres » coupe **aussi** les ombres des lampes, et le
 * relief les coupe (les shadow maps de three.js ne savent pas revenir au
 * tampon hors écran de MapLibre sous relief).
 * @param {number} indice
 * @param {{ ombres?: boolean, relief?: boolean }} reglages
 */
export function budgetDuPalier(indice, reglages = {}) {
  const p = PALIERS[Math.min(PALIERS.length - 1, Math.max(0, indice | 0))];
  const ombresPermises = reglages.ombres !== false && !reglages.relief;
  return {
    ombres: ombresPermises ? p.ombres : 0,
    lumieres: p.lumieres,
    facades: p.facades,
    ratioMax: p.ratioMax,
  };
}

/**
 * Le ratio de pixels à appliquer à la carte : celui de l'appareil, plafonné
 * par le palier.
 */
export function ratioApplique(ratioAppareil, ratioMax) {
  const r = Number(ratioAppareil) > 0 ? Number(ratioAppareil) : 1;
  return ratioMax ? Math.min(r, ratioMax) : r;
}

/**
 * Le régulateur : alimenté à chaque image rendue (`image(t)`, en ms), il rend
 * le nouvel indice de palier quand il faut en changer, `null` sinon.
 *
 * Seules comptent les images **continues** : un intervalle de plus de
 * `trouMs` (carte immobile, rendu à la demande) clôt la fenêtre sans la
 * compter. Après chaque changement, `reposMs` sans mesure : le premier rendu
 * d'un palier recompile des matériaux et ne dit rien de son régime.
 *
 * @param {{ palier: number, objectif: number, min?: number, max?: number,
 *   fenetreMs?: number, trouMs?: number, reposMs?: number,
 *   attenteMs?: number, attenteMaxMs?: number, margeMontee?: number }} o
 *   `min` / `max` : indices extrêmes permis (0 = le plus riche).
 */
export function creerRegulateur(o) {
  const objectif = Number(o.objectif) || 55;
  const min = o.min ?? 0;
  const max = o.max ?? PALIERS.length - 1;
  const fenetreMs = o.fenetreMs ?? 750;
  const trouMs = o.trouMs ?? 250;
  const reposMs = o.reposMs ?? 1000;
  const attenteInitiale = o.attenteMs ?? 20000;
  const attenteMax = o.attenteMaxMs ?? 120000;
  const seuilBas = objectif * 0.9;
  const seuilHaut = objectif + (o.margeMontee ?? Math.max(3, objectif * 0.06));

  let palier = Math.min(max, Math.max(min, o.palier | 0));
  let debut = null;      // début de la fenêtre courante
  let precedent = null;  // dernière image
  let images = 0;
  let mauvaises = 0;
  let bonnes = 0;
  let reposJusqua = -Infinity;
  const chutes = new Map();     // palier quitté par le bas → nombre de chutes
  const interdit = new Map();   // palier → instant avant lequel on n'y remonte pas
  let derniere = null;          // dernière mesure (images/s)
  let essai = null;             // { depuis, fpsAvant, apres: [] } : descente à juger
  let dernieresBasses = [];     // mesures des fenêtres sous le seuil (les deux dernières)
  let refSansGain = null;       // mesure sous laquelle redescendre (après une descente vaine)

  function changer(nouveau, t) {
    palier = nouveau;
    debut = null;
    precedent = null;
    images = 0;
    mauvaises = 0;
    bonnes = 0;
    reposJusqua = t + reposMs;
    return palier;
  }

  function fenetre(fps, t) {
    derniere = fps;
    if (essai) {
      essai.apres.push(fps);
      if (essai.apres.length < 2) return null;
      const e = essai;
      essai = null;
      const gain = (e.apres[0] + e.apres[1]) / 2;
      if (gain < e.fpsAvant * 1.1) {
        // Rien gagné : ce palier n'était pas en cause. On y revient.
        chutes.set(e.depuis, Math.max(0, (chutes.get(e.depuis) || 1) - 1));
        interdit.delete(e.depuis);
        refSansGain = e.fpsAvant;
        return changer(e.depuis, t);
      }
    }
    const seuil = refSansGain != null ? Math.min(seuilBas, refSansGain * 0.85) : seuilBas;
    if (fps < seuil) {
      bonnes = 0;
      mauvaises += 1;
      dernieresBasses = dernieresBasses.concat(fps).slice(-2);
      if (mauvaises >= 2 && palier < max) {
        const n = (chutes.get(palier) || 0) + 1;
        chutes.set(palier, n);
        interdit.set(palier, n >= 2 ? Infinity : t + Math.min(attenteMax, attenteInitiale * 2 ** (n - 1)));
        const depuis = palier;
        const fpsAvant = dernieresBasses.reduce((a, b) => a + b, 0) / dernieresBasses.length;
        changer(palier + 1, t);
        dernieresBasses = [];
        essai = { depuis, fpsAvant, apres: [] };
        return palier;
      }
      return null;
    }
    mauvaises = 0;
    dernieresBasses = [];
    if (fps >= seuilHaut) {
      bonnes += 1;
      const cible = palier - 1;
      if (bonnes >= 3 && cible >= min && t >= (interdit.get(cible) ?? -Infinity)) {
        return changer(cible, t);
      }
      return null;
    }
    bonnes = 0;
    return null;
  }

  return {
    /** Une image vient d'être rendue à l'instant `t` (ms). */
    image(t) {
      if (t < reposJusqua) return null;
      if (precedent != null && t - precedent > trouMs) {
        // Carte immobile un moment : la fenêtre s'arrête là, sans ce trou.
        debut = null;
        images = 0;
      }
      precedent = t;
      if (debut == null) { debut = t; images = 0; return null; }
      images += 1;
      const duree = t - debut;
      if (duree < fenetreMs) return null;
      const fps = (images * 1000) / duree;
      debut = t;
      images = 0;
      return fenetre(fps, t);
    },
    /** Ces images-là ne comptent pas (chargement) : la fenêtre en cours est abandonnée. */
    interrompre() { debut = null; precedent = null; images = 0; },
    /** Force un palier (réglage de l'utilisateur, `?eclairage_palier=`). */
    fixer(indice, t = 0) { return changer(Math.min(max, Math.max(min, indice | 0)), t); },
    get palier() { return palier; },
    etat() {
      return {
        palier, nom: PALIERS[palier]?.nom, objectif, derniere,
        chutes: Object.fromEntries(chutes),
        refSansGain,
      };
    },
  };
}
