/**
 * Le soleil de la scène pour l'hôte (contrat 0.7) : `setSun`, `getSun`, l'événement `sun` et le champ `soleil` de `exportScene3D`.
 * Module pur : les lectures de l'application (instant, position, lever, coucher) lui sont données, il ne touche ni la carte ni le DOM.
 *
 * Conventions rendues à l'hôte : azimut en degrés depuis le NORD, dans le sens horaire (est = 90), hauteur en degrés au-dessus de l'horizon,
 * dates en ISO 8601 UTC. L'azimut et la hauteur sont ceux qui servent à éclairer la carte (lumière du bâti, ombres des modèles).
 */
import { heureLocale } from './eclairage-profil.js?v=1.42.0';

/** Bornes d'une date acceptée : l'année 1900 à 2200 (au-delà, la position du soleil n'a plus de sens pour une scène). */
const MS_MIN = Date.UTC(1900, 0, 1), MS_MAX = Date.UTC(2200, 0, 1);
/** Un ISO 8601 complet, avec son fuseau : sans fuseau, la date serait lue dans celui de l'hôte et la même commande donnerait deux soleils. */
const ISO_AVEC_FUSEAU = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

const arrondi = (v, n) => { const k = 10 ** n; return Math.round(v * k) / k; };
const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

/**
 * Valide les arguments de `setSun` : { date: ISO 8601 avec fuseau | millisecondes, actif?: booléen }. Au moins l'un des deux.
 * @returns {{ instantMs: number|undefined, actif: boolean|undefined }}
 */
export function normaliserSetSun(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('setSun : un objet { date, actif } est attendu');
  for (const k of Object.keys(o)) if (k !== 'date' && k !== 'actif') throw new Error('setSun : option inconnue « ' + String(k).slice(0, 40) + ' » (date, actif)');
  if (o.date === undefined && o.actif === undefined) throw new Error('setSun : date ou actif est attendu');
  let instantMs;
  if (o.date !== undefined) {
    if (typeof o.date === 'number') instantMs = o.date;
    else if (typeof o.date === 'string' && ISO_AVEC_FUSEAU.test(o.date)) instantMs = Date.parse(o.date);
    else throw new Error('setSun : date doit être un ISO 8601 avec son fuseau (2026-06-21T10:30:00Z) ou des millisecondes');
    if (!Number.isFinite(instantMs) || instantMs < MS_MIN || instantMs >= MS_MAX) throw new Error('setSun : date hors bornes (années 1900 à 2199)');
  }
  if (o.actif !== undefined && typeof o.actif !== 'boolean') throw new Error('setSun : actif doit être true ou false');
  return { instantMs, actif: o.actif };
}

/** Ce que l'application règle pour un instant : le jour et l'heure DU SITE (la scène se règle dans son fuseau). */
export function reglageDepuisInstant(instantMs, fuseau) {
  return heureLocale(instantMs, fuseau);
}

/**
 * La forme rendue par `getSun`, `setSun` et l'événement `sun`.
 * @param {{ instantMs: number, actif: boolean, azimut: number, hauteur: number, lever?: number|null, coucher?: number|null }} e  lever et coucher en millisecondes, `null` sous les hautes latitudes
 */
export function etatSoleil(e) {
  return {
    date: iso(e.instantMs),
    actif: !!e.actif,
    azimut: arrondi(((e.azimut % 360) + 360) % 360, 2),
    hauteur: arrondi(e.hauteur, 2),
    lever: iso(e.lever),
    coucher: iso(e.coucher),
  };
}

/** Le bloc `soleil` d'un export 3D : de quoi éclairer le fichier comme la carte. */
export function blocSoleilExport(etat) {
  return { date: etat.date, azimut: etat.azimut, hauteur: etat.hauteur };
}

/**
 * Détecte le changement qui mérite un événement `sun` : un instant ou un état d'ombres différent du dernier signalé.
 * Le premier appel pose la référence sans rien signaler (l'ouverture de la scène n'est pas un geste).
 * @returns {{ signaler: (instantMs: number, actif: boolean) => boolean }}
 */
export function creerSignalSoleil() {
  let derniere = null;
  return {
    signaler(instantMs, actif) {
      const cle = instantMs + '|' + (actif ? 1 : 0);
      const avant = derniere;
      derniere = cle;
      return avant !== null && avant !== cle;
    },
  };
}
