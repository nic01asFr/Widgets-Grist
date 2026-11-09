/**
 * Lire TOUTE une table déclarée modifiable, page par page (`pg_gateway_lire`, paramètre `decalage`, réponse `suivant`).
 *
 * Une comparaison ou une copie synchronisable lit chaque ligne : au-delà d'une page, elle enchaîne les pages dans l'ordre de la clé.
 * Module sans DOM ni réseau propre : le client est injecté (`{commande(nom, corps)}`).
 *
 * ## Les règles
 *  - la PREMIÈRE page est demandée comme avant, sans `decalage` : une passerelle plus ancienne (qui ne connaît pas la pagination et refuserait
 *    ce paramètre) répond comme toujours ; elle ne dit pas `suivant`, on s'arrête alors et on le dit (`tronque`) ;
 *  - on ne continue que sur un `suivant` entier : jamais de saut deviné ;
 *  - au-delà de `total` lignes, on s'arrête et on le dit : une comparaison incomplète se fait passer pour complète, donc elle est refusée ;
 *  - rien n'est interprété ici : les lignes sont rendues telles que la passerelle les donne.
 */

/** Lignes demandées par page (le plafond de la passerelle, `LIMITE_MAX`, est plus haut ou égal par défaut). */
export const LIMITE_PAGE = 10000;
/** Au-delà, une copie complète n'est plus raisonnable (Grist, durée de la comparaison) : refus net, jamais une lecture partielle. */
export const LIMITE_TOTALE = 50000;

/**
 * @param {{commande: (nom: string, corps: object) => Promise<object>}} client
 * @param {{connexion: string, schema: string, table: string}} cible
 * @param {{page?: number, total?: number}} [options]
 * @returns {Promise<{lignes: object[], nb_lignes: number, tronque: boolean, pages: number}>}
 *   `tronque` : il restait des lignes qu'on n'a pas lues (table trop grande, ou passerelle sans pagination).
 */
export async function lireTout(client, cible, { page = LIMITE_PAGE, total = LIMITE_TOTALE } = {}) {
  const lignes = [];
  let decalage = null;
  let pages = 0;
  for (;;) {
    const corps = { connexion: cible.connexion, schema: cible.schema, table: cible.table, limite: page };
    if (decalage !== null) corps.decalage = decalage;
    const reponse = await client.commande('pg_gateway_lire', corps);
    pages += 1;
    lignes.push(...(reponse.lignes || []));
    if (!reponse.tronque) return { lignes, nb_lignes: lignes.length, tronque: false, pages };
    if (!Number.isInteger(reponse.suivant) || reponse.suivant <= (decalage ?? 0)) return { lignes, nb_lignes: lignes.length, tronque: true, pages };
    if (lignes.length >= total) return { lignes, nb_lignes: lignes.length, tronque: true, pages };
    decalage = reponse.suivant;
  }
}
