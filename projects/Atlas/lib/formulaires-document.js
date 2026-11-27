/**
 * Les formulaires d'un document Grist : ce qu'on en lit, et dans quel ordre.
 *
 * Sorti d'`app_v7.js`, ou cette lecture voisinait avec le reste de l'etat. Elle ne
 * depend de rien d'autre que de ses arguments : le document (`docApi`), le moteur
 * de formulaire (charge a la demande) et la fenetre ou celui-ci pose ses globales.
 * Elle rend ce qu'elle a lu ; l'appelant range le resultat dans son etat.
 *
 * ## Ce qu'elle lit
 *
 * 1. Le **schema** — les types des colonnes, donc les `Ref:` qui disent quelles
 *    tables referencent une couche, et de quoi deduire un formulaire de celles qui
 *    n'en ont pas. Sans lui il ne reste que l'enregistre.
 * 2. Les **formulaires natifs de Grist**, dans les memes metadonnees : ceux que
 *    l'equipe a deja soignes (questions, ordre, obligatoires) servent tels quels.
 *    Leur lecture est faite par le moteur (`FormDefFromGristForm`) : le moteur est
 *    donc demande ici — c'est le premier besoin d'un document ouvert.
 * 3. La table **`Formulaires`**, si le document en a une : les formulaires que
 *    l'equipe a enregistres.
 *
 * Aucune de ces lectures n'est fatale : un echec se dit dans la console et laisse
 * ce qui a deja ete lu.
 */
import { chargerMeta, schemaDepuisMeta } from './schema-grist.js?v=20261002b';
import { lireFormulaires } from './fiche-formulaire.js?v=20261003g';

/** Ce que rend la lecture quand il n'y a rien : pas de document, ou un document vide. */
export function formulairesVides() {
  return { schema: {}, formulairesGrist: [], formulaires: [], formulairesTable: false };
}

/**
 * @param {object} o
 * @param {object|null} o.docApi  `grist.docApi`, ou `null` hors document (rien n'est lu)
 * @param {() => Promise<boolean>} [o.assurerMoteur]  charge le moteur ; `false` s'il manque
 * @param {object} [o.portee]  la fenetre ou le moteur pose `FormDefFromGristForm`
 * @param {(...a: any[]) => void} [o.avertir]
 * @returns {Promise<{schema: object, formulairesGrist: any[], formulaires: any[], formulairesTable: boolean}>}
 */
export async function lireFormulairesDuDocument({
  docApi = null,
  assurerMoteur = async () => false,
  portee = globalThis,
  avertir = (...a) => console.warn(...a),
} = {}) {
  const lu = formulairesVides();
  const meta = docApi ? await chargerMeta(docApi, { vues: true }) : null;
  lu.schema = meta ? schemaDepuisMeta(meta.tables, meta.colonnes) : {};
  if (meta?.sections && await assurerMoteur() && portee.FormDefFromGristForm) {
    try { lu.formulairesGrist = portee.FormDefFromGristForm.formulairesGrist(meta); } catch (e) {
      avertir('[Atlas formulaire] formulaires Grist', e.message);
    }
  }
  if (!docApi) return lu;
  try {
    const tables = await docApi.listTables();
    if (!tables.includes('Formulaires')) return lu;
    lu.formulairesTable = true;
    lu.formulaires = lireFormulaires(await docApi.fetchTable('Formulaires'));
  } catch (e) {
    avertir('[Atlas formulaire] chargement', e.message);
  }
  return lu;
}
