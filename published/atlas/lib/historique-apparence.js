/**
 * Annuler, rétablir : l'historique de l'apparence d'une couche.
 *
 * Atlas enregistre l'apparence d'une couche (couleurs, tailles, classes, icônes, contrôles, visibilité…) dans les préférences
 * du document. Ce module en prend des **instantanés exacts** et tient la pile d'historique ; il ne parle ni à Grist ni à la
 * carte, qui restent l'affaire de l'appelant.
 *
 * Pourquoi un historique à soi plutôt que l'annulation de Grist (`commandApi.run('undo')`, que Grist offre aux widgets en accès
 * complet) :
 * - elle n'existe que dans le widget ; l'application et une scène locale n'ont pas de Grist autour ;
 * - elle défait « la dernière action du document », qui peut être la modification d'une cellule faite ailleurs ;
 * - elle ne dit pas s'il y a quelque chose à annuler (le bouton ne peut ni se griser ni dire « rien à annuler ») ;
 * - la relecture des préférences ne restitue pas un état exact — appliquer des préférences se **superpose** à l'état de la
 *   couche (voir \`applyLayerPrefsBinding\`) — alors qu'un instantané se remet tel quel.
 * Les saisies d'objets restent annulables dans Grist même (Ctrl+Z hors du widget).
 */
import { layerPrefsPayload } from './manifest-binding.js?v=1.16.2';

export const VERSION = '1.0.0';

/** Combien de pas on garde : de quoi défaire une séance de réglages, sans retenir la mémoire d'une session entière. */
export const PAS_MAX = 50;

function copie(v) {
  if (v === undefined) return undefined;
  try { return structuredClone(v); } catch (_) { return JSON.parse(JSON.stringify(v)); }
}

/**
 * Un instantané de l'apparence d'une couche : sa **signature** (ce qui s'enregistrerait — deux apparences de même signature
 * n'ont rien à s'écrire) et de quoi la remettre à l'identique.
 *
 * @returns {{ sig: string, visible: boolean, etat: object }}
 */
export function capturerApparence(layer) {
  const visible = layer?.visible !== false;
  return {
    sig: JSON.stringify([layerPrefsPayload(layer), visible]),
    visible,
    etat: {
      style: copie(layer?.style),
      controls: copie(layer?.controls),
      parametres: copie(layer?.parametres),
      formulaire: copie(layer?.formulaire),
      rank: layer?._rank,
      declarative: copie(layer?._declarative),
      color: layer?.color,
    },
  };
}

/** Remet la couche dans l'état d'un instantané. Ne touche ni à la carte ni à Grist : l'appelant repeint et enregistre. */
export function restaurerApparence(layer, snap) {
  if (!layer || !snap?.etat) return layer;
  const e = copie(snap.etat);
  const poser = (cle, valeur) => { if (valeur === undefined) delete layer[cle]; else layer[cle] = valeur; };
  poser('style', e.style);
  poser('controls', e.controls);
  poser('parametres', e.parametres);
  poser('formulaire', e.formulaire);
  poser('_rank', e.rank);
  poser('_declarative', e.declarative);
  if (e.color !== undefined) layer.color = e.color;
  layer.visible = snap.visible;
  return layer;
}

/** Deux instantanés disent-ils la même chose ? */
export const memeApparence = (a, b) => !!a && !!b && a.sig === b.sig;

/**
 * La pile : chaque pas retient la couche (sa clé), l'état d'avant et celui d'après. Un nouveau pas vide les pas à rétablir,
 * comme partout.
 */
export class Historique {
  constructor(max = PAS_MAX) {
    this.max = max;
    this._passes = [];
    this._refaire = [];
  }

  /** Enregistre un changement ; ne fait rien si l'apparence n'a pas changé. */
  enregistrer(cle, avant, apres) {
    if (!cle || memeApparence(avant, apres)) return false;
    this._passes.push({ cle, avant, apres });
    if (this._passes.length > this.max) this._passes.shift();
    this._refaire = [];
    return true;
  }

  peutAnnuler() { return this._passes.length > 0; }
  peutRetablir() { return this._refaire.length > 0; }

  /** Le pas à défaire (il passe du côté « à rétablir »), ou `null`. */
  annuler() {
    const p = this._passes.pop();
    if (!p) return null;
    this._refaire.push(p);
    return p;
  }

  retablir() {
    const p = this._refaire.pop();
    if (!p) return null;
    this._passes.push(p);
    return p;
  }

  /** Une couche retirée : ses pas ne disent plus rien. */
  oublier(cle) {
    this._passes = this._passes.filter((p) => p.cle !== cle);
    this._refaire = this._refaire.filter((p) => p.cle !== cle);
  }

  vider() { this._passes = []; this._refaire = []; }

  /** Pour dire ce qu'on va annuler : la clé de la couche du prochain pas. */
  prochaineAnnulation() { return this._passes.at(-1)?.cle ?? null; }
  prochainRetablissement() { return this._refaire.at(-1)?.cle ?? null; }
  get taille() { return this._passes.length; }
}
