/**
 * Des tables en arrière-plan, pas de pages en trop.
 *
 * Quand Atlas crée une table (couches, préférences, récit, formulaires, import), Grist
 * ajoute avec elle une page du même nom dans le volet de gauche. Ces pages ne servent
 * à rien : la table de travail d'Atlas est lue et écrite par le widget, et reste
 * consultable dans « Données source ». Le document ne doit montrer qu'une page, celle
 * d'Atlas.
 *
 * Retirer une page ne retire pas la table : `_grist_Views` supprimé, la table et sa
 * vue de données brutes restent. Vérifié en réel sur grist.numerique.gouv.fr.
 *
 * Module pur : il lit les actions envoyées et ce que Grist a rendu, il ne touche à rien.
 */

/**
 * Les pages que Grist a créées avec les tables de ce lot d'actions.
 *
 * `retValues[i]` répond à `actions[i]`. Pour un `AddTable`, c'est
 * `{ table_id, id, columns, views: [{ id, sections }] }`. Toute autre forme (client
 * hors ligne, scène locale, réponse sans `views`) ne donne rien à retirer.
 *
 * @param {Array<Array<any>>} actions   les actions envoyées à `applyUserActions`
 * @param {{ retValues?: any[] } | null | undefined} resultat  la réponse de Grist
 * @returns {number[]} identifiants de pages, sans doublon, dans l'ordre
 */
export function pagesDeTablesCreees(actions, resultat) {
  const retours = resultat && Array.isArray(resultat.retValues) ? resultat.retValues : [];
  const ids = [];
  (Array.isArray(actions) ? actions : []).forEach((action, i) => {
    if (!Array.isArray(action) || action[0] !== 'AddTable') return;
    const vues = retours[i] && Array.isArray(retours[i].views) ? retours[i].views : [];
    for (const v of vues) {
      const id = v && Number(v.id);
      if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
    }
  });
  return ids;
}

/**
 * L'action qui retire ces pages en gardant les tables, ou `null` s'il n'y en a pas.
 * @param {number[]} ids
 */
export function actionRetirerPages(ids) {
  return Array.isArray(ids) && ids.length ? ['BulkRemoveRecord', '_grist_Views', ids] : null;
}
