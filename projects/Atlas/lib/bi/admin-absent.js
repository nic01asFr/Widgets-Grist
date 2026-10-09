/**
 * Emplacement des couches administratives dans le composant BI : sans elles (`admin-runtime.js` absent de cette version),
 * le runtime reste complet pour les points, lignes et surfaces ; les commandes administratives répondent par une erreur
 * explicite au lieu de disparaître.
 */
const indisponible = (nom) => () => { throw new Error(nom + ' : couches administratives indisponibles dans cette version'); };
export function creerAdmin() {
  const api = Object.fromEntries(['addAdminLayer', 'removeLayer', 'setChoropleth', 'setStatistique', 'drillDown', 'drillUp', 'setDrillAuto', 'setUnitFilter'].map((n) => [n, indisponible(n)]));
  return { api, pile: [], monter() {}, surVueChangee() {}, assurer() {}, infosUnite: () => ({}), legende: indisponible('getLegend'), lignes: indisponible('getRows') };
}
