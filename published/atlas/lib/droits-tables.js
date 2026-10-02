/**
 * Les droits d'écriture, table par table, tels qu'on les apprend.
 *
 * Atlas avait UN droit pour tout le document (`peutSaisir`), alors que Grist
 * règle l'écriture table par table : un agent qui ne peut qu'ajouter des visites
 * n'écrit ni `Atlas_LayerPrefs` ni les ouvrages. Un seul refus, sur une seule
 * table, faisait basculer toute la session en lecture ; et en lecture, un refus
 * sur un formulaire proposé ne baissait rien — le formulaire restait offert, et
 * refusait chaque fois (relevé à l'audit du 02/10/2026).
 *
 * ## Ce qu'on sait, et ce qu'on ne prétend pas savoir
 *
 * Atlas ne prédit pas ce que Grist répondra et ne lit pas ses règles d'accès
 * (le langage des règles est celui de Grist, pas le sien). Il apprend de ce qui
 * s'est vraiment passé :
 *
 * - une écriture réussie dit `ecriture` pour les tables qu'elle touche ;
 * - un refus de droits dit `refus` — **seulement si l'écriture ne touchait
 *   qu'une table**. Un lot sur plusieurs tables ne dit pas laquelle a été
 *   refusée : attribuer le refus à toutes retirerait un droit que la personne a ;
 * - tout le reste (réseau, colonne manquante) n'apprend rien : ce n'est pas un
 *   verdict sur les droits ;
 * - `inconnu` est l'état de départ, et il n'interdit rien. Grist refusera, et
 *   Atlas le saura.
 *
 * Ce module ne touche ni au DOM, ni à Grist.
 */
import { TABLES_CONFIGURATION, TABLES_INVENTAIRE } from './atlas-tables.js?v=1.10.1';

export const POSTURES = Object.freeze(['preparer', 'exploiter', 'lecture']);

export const VERDICTS = Object.freeze(['ecriture', 'refus', 'inconnu']);

/**
 * La table dit-elle la configuration d'Atlas, ou un relevé de l'équipe ?
 * La configuration se règle en *Préparer* ; le relevé s'écrit en *Exploiter*.
 */
export function categorieTable(table) {
  const t = String(table || '').toLowerCase();
  const config = [...TABLES_CONFIGURATION, ...TABLES_INVENTAIRE, 'Formulaires'].map((x) => x.toLowerCase());
  return config.includes(t) ? 'configuration' : 'releve';
}

/**
 * Les tables qu'un lot d'actions touche.
 *
 * `AddTable` touche la table qu'il crée ; `RenameTable` et `RemoveTable` la
 * leur. Les tables système (`_grist_*`) ne comptent pas : elles ne sont pas
 * celles de l'équipe.
 *
 * @param {Array<Array>} actions  `[['AddRecord', 'Visites', null, {...}], …]`
 * @returns {string[]} sans doublon
 */
export function tablesDesActions(actions) {
  const out = new Set();
  for (const a of Array.isArray(actions) ? actions : []) {
    const table = Array.isArray(a) ? a[1] : null;
    if (typeof table === 'string' && table && !table.startsWith('_')) out.add(table);
  }
  return [...out];
}

/**
 * Le registre des verdicts.
 *
 * @param {{ lectureSeule?: boolean }} [o]  Grist a annoncé la lecture seule :
 *   aucune table n'est écrivable, sans discussion.
 */
export function creerDroits({ lectureSeule = false } = {}) {
  const parTable = new Map();   // minuscules -> { table, verdict }
  const cle = (t) => String(t || '').toLowerCase();
  return {
    lectureSeule,

    /**
     * La sonde de départ a été refusée : cette personne n'écrit pas la
     * configuration. La sonde écrit dans UNE table, mais un refus franc dit assez
     * pour ne pas offrir *Préparer* ; *Exploiter* dépend des tables de relevé,
     * pas de celle-là. Une écriture réussie dans la configuration lève ce refus.
     */
    preparationRefusee: false,
    refuserPreparation() { this.preparationRefusee = true; },
    autoriserPreparation() { this.preparationRefusee = false; },

    /** `ecriture`, `refus` ou `inconnu`. */
    verdict(table) {
      if (lectureSeule) return 'refus';
      return parTable.get(cle(table))?.verdict || 'inconnu';
    },

    /** Enregistre un verdict ; rend `true` s'il change quelque chose. */
    noter(table, verdict) {
      if (!table || !VERDICTS.includes(verdict) || verdict === 'inconnu') return false;
      const avant = parTable.get(cle(table))?.verdict;
      if (verdict === 'ecriture' && categorieTable(table) === 'configuration') this.autoriserPreparation();
      if (avant === verdict) return false;
      parTable.set(cle(table), { table, verdict });
      return true;
    },

    /** Les tables dont on sait qu'elles refusent. */
    refusees() {
      return new Set([...parTable.values()].filter((e) => e.verdict === 'refus').map((e) => e.table));
    },

    /** Ce qu'on sait, pour le diagnostic et les tests. */
    instantane() {
      return Object.fromEntries([...parTable.values()].map((e) => [e.table, e.verdict]));
    },
  };
}

/**
 * Apprend d'une écriture : succès ou refus de droits.
 *
 * @param {ReturnType<typeof creerDroits>} droits
 * @param {{ actions: Array<Array>, erreur?: unknown, estRefusDeDroits?: (e: unknown) => boolean }} o
 * @returns {{ tables: string[], verdict: 'ecriture'|'refus'|null, attribue: boolean, change: boolean }}
 *   `attribue` est faux quand le refus ne peut pas être imputé à une table
 */
export function apprendre(droits, { actions, erreur = null, estRefusDeDroits = () => false } = {}) {
  const tables = tablesDesActions(actions);
  if (!tables.length) return { tables, verdict: null, attribue: false, change: false };
  if (!erreur) {
    let change = false;
    for (const t of tables) change = droits.noter(t, 'ecriture') || change;
    return { tables, verdict: 'ecriture', attribue: true, change };
  }
  if (!estRefusDeDroits(erreur)) return { tables, verdict: null, attribue: false, change: false };
  if (tables.length !== 1) return { tables, verdict: 'refus', attribue: false, change: false };
  return { tables, verdict: 'refus', attribue: true, change: droits.noter(tables[0], 'refus') };
}

/**
 * La configuration d'Atlas peut-elle s'écrire ?
 *
 * Faux seulement quand on sait des tables de configuration qu'elles refusent
 * ET qu'aucune ne s'est laissé écrire : un refus partiel (le récit, pas les
 * préférences) laisse *Préparer* utile, et le geste refusé le dit à son tour.
 */
export function configurationEcrivable(droits) {
  if (droits.lectureSeule || droits.preparationRefusee) return false;
  const verdicts = TABLES_CONFIGURATION.map((t) => droits.verdict(t)).filter((v) => v !== 'inconnu');
  if (!verdicts.length) return true;
  return verdicts.some((v) => v === 'ecriture');
}

/**
 * Les postures qu'on peut proposer. *Lecture* l'est toujours ; les autres
 * dépendent de ce qu'on sait — jamais de ce qu'on suppose.
 *
 * @param {object} o
 * @param {ReturnType<typeof creerDroits>} o.droits
 * @param {boolean} o.documentOuvert    un document Grist est ouvert
 * @param {boolean} [o.sceneExterne]    scène venue d'une adresse : lecture seule
 * @param {string[]} [o.tablesDeReleve]  les tables où un formulaire proposé écrit
 * @param {'exploiter'|'lecture'|null} [o.plafond]  ce que le lien d'ouverture autorise au plus
 *   (`?mode=view` donne `exploiter`). Comme tout ce qui n'est pas Grist, il ne fait que
 *   RESTREINDRE : il retire des postures, il n'en ajoute jamais.
 * @returns {Array<'preparer'|'exploiter'|'lecture'>}
 */
export function posturesOffertes({ droits, documentOuvert, sceneExterne = false, tablesDeReleve = [], plafond = null } = {}) {
  const offertes = ['lecture'];
  if (!documentOuvert || sceneExterne || droits.lectureSeule || plafond === 'lecture') return offertes;
  if (tablesDeReleve.some((t) => droits.verdict(t) !== 'refus')) offertes.unshift('exploiter');
  if (plafond !== 'exploiter' && configurationEcrivable(droits)) offertes.unshift('preparer');
  return offertes;
}
