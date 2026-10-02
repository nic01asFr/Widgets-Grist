/**
 * Ce qui est à faire, et ce qui est en retard.
 *
 * Beaucoup d'équipes tiennent, pour chaque objet, un **délai** : le temps qui reste avant la prochaine intervention
 * (visite, contrôle, entretien). Négatif, il est dépassé ; zéro, c'est maintenant. Le suivi d'ouvrages en est le cas
 * typique — une colonne calculée par Grist donne ce délai en mois.
 *
 * Une couche peut désigner ce champ : Atlas en tire une **couronne** autour de chaque point (rouge en retard,
 * ambre à faire bientôt), séparée de la couleur — qui garde son sens, l'état de l'objet — et des **comptes** dans la
 * légende et dans la pastille « Relevé ». La couronne ne remplace rien : elle s'ajoute.
 *
 * Module pur : classes, comptes et expression MapLibre.
 */

export const VERSION = '1.0.0';

export const COULEURS_ECHEANCE = Object.freeze({ retard: '#D64545', bientot: '#F0A030' });
export const LIBELLES_ECHEANCE = Object.freeze({ retard: 'En retard', bientot: 'À faire', ajour: 'À jour', inconnu: 'Sans délai' });

/** La configuration d'une couche, ou null quand elle n'a pas d'échéance. */
export function configEcheance(sym) {
  const e = sym?.echeance;
  if (!e || !e.field) return null;
  const bientot = Number(e.bientot);
  return { field: String(e.field), bientot: Number.isFinite(bientot) && bientot >= 0 ? bientot : 1 };
}

/**
 * La classe d'un délai : `retard` (< 0), `bientot` (de 0 à `bientot` inclus), `ajour` (au-delà), `inconnu` (pas de
 * nombre). Une valeur vide n'est pas zéro : un objet sans délai n'est pas « à faire ».
 */
export function classeEcheance(valeur, cfg) {
  if (!cfg) return 'inconnu';
  if (valeur === null || valeur === undefined || valeur === '') return 'inconnu';
  const n = typeof valeur === 'number' ? valeur : Number(String(valeur).replace(',', '.'));
  if (!Number.isFinite(n)) return 'inconnu';
  if (n < 0) return 'retard';
  if (n <= cfg.bientot) return 'bientot';
  return 'ajour';
}

/** Les comptes d'une liste d'entités GeoJSON. `cle` : la propriété qui porte le délai. */
export function compterEcheances(features, cfg, cle = cfg?.field) {
  const out = { retard: 0, bientot: 0, ajour: 0, inconnu: 0 };
  if (!cfg) return out;
  for (const f of features || []) out[classeEcheance(f?.properties?.[cle], cfg)]++;
  return out;
}

/** L'expression de la couleur de la couronne : transparente pour ce qui est à jour ou sans délai. */
export function expressionCouronne(cfg, cle = cfg?.field) {
  if (!cfg) return 'rgba(0,0,0,0)';
  const n = ['to-number', ['get', cle], 1e9];
  return ['case',
    ['<', n, 0], COULEURS_ECHEANCE.retard,
    ['<=', n, cfg.bientot], COULEURS_ECHEANCE.bientot,
    'rgba(0,0,0,0)'];
}

/** Une phrase pour dire les comptes : « 21 en retard · 14 à faire ». Vide s'il n'y a rien à dire. */
export function phraseEcheances(comptes) {
  const parts = [];
  if (comptes.retard) parts.push(`${comptes.retard} en retard`);
  if (comptes.bientot) parts.push(`${comptes.bientot} à faire`);
  return parts.join(' · ');
}
