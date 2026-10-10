/**
 * Figer dans la table : écrire, à la demande, les valeurs que les paramètres d'un objet ne tiennent
 * que virtuellement.
 *
 * Les valeurs par défaut (règle d'Atlas, défaut du type, réglage de la couche) ne sont **jamais**
 * écrites dans la table de l'équipe : une valeur supposée ne doit pas passer pour une donnée. Mais
 * quelqu'un peut vouloir en faire des données — pour les partager, les corriger une à une dans Grist,
 * ou publier la table. Ce module planifie ce geste, et seulement lui :
 *
 * - **jamais écraser** : une cellule déjà remplie n'est pas touchée ;
 * - **jamais dupliquer** : une valeur lue dans un champ de l'objet est déjà dans la table ;
 * - **colonnes créées au besoin**, sous le nom du paramètre (ou du champ qu'on lui a lié) ;
 * - **ce qu'on écrit est dit** : combien de cellules, dans quelles colonnes, lesquelles à créer.
 *
 * Tout ici est pur : il rend des actions Grist, il ne les exécute pas.
 */
import { resoudreParametre } from './parametres-objet.js?v=1.14.1';

/** Ce qui est un réglage d'Atlas, et non une donnée du point lumineux : jamais écrit dans la table. */
const NON_FIGEABLES = new Set(['comportement']);

/** Les origines qui ne sont pas encore des données de la table. */
const ORIGINES_VIRTUELLES = new Set(['objet', 'couche', 'catalogue', 'regle']);

/** Ce qu'on propose de figer d'emblée : ce qui décrit le luminaire, pas ses horaires supposés. */
export const FIGES_PAR_DEFAUT = Object.freeze(['puissance', 'temperatureCouleur', 'hauteurFeu']);

const vide = (v) => v == null || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && Number.isNaN(v));

/** Le type de colonne Grist d'un paramètre. */
export function typeColonne(descripteur) {
  switch (descripteur?.kind) {
    case 'number': return 'Numeric';
    case 'choice': return 'Choice';
    case 'date': return 'Date';
    default: return 'Text';
  }
}

/** La valeur telle que la table la porte : une date devient des secondes à minuit UTC. */
function valeurPourTable(descripteur, valeur) {
  if (descripteur.kind === 'date') {
    const t = Date.parse(`${valeur}T00:00:00Z`);
    return Number.isFinite(t) ? t / 1000 : null;
  }
  return valeur;
}

/**
 * Ce qu'il y aurait à écrire, et les actions Grist qui l'écrivent.
 *
 * @param {object} o
 * @param {Array<{rowId: number, properties?: object}>} o.entites    les objets de la couche, avec leur ligne
 * @param {object|null} [o.couche]                                    le réglage de la couche (`parametres`)
 * @param {(entite: object) => object[]} o.descripteursDe             les paramètres du type de l'objet
 * @param {(entite: object) => string|null} [o.typeIdDe]              le type de l'objet
 * @param {Iterable<string>} o.colonnes                               les colonnes de la table
 * @param {Iterable<string>|null} [o.choisis]                         les paramètres à figer ; tous si omis
 * @param {string} o.table
 * @returns {{
 *   candidats: Array<{id: string, libelle: string, colId: string, creer: boolean, type: string, n: number,
 *                     exemple: *, origines: Object<string, number>}>,
 *   actions: Array<Array<*>>,
 *   cellules: number
 * }}
 */
export function planFiger({ entites, couche = null, descripteursDe, typeIdDe = null, colonnes, choisis = null, table }) {
  const existantes = colonnes instanceof Set ? colonnes : new Set(colonnes || []);
  const parParam = new Map();

  for (const e of entites || []) {
    if (!Number.isInteger(e?.rowId)) continue;
    const props = e.properties || {};
    const typeId = typeIdDe ? typeIdDe(e) : null;
    for (const d of descripteursDe(e) || []) {
      if (NON_FIGEABLES.has(d.id)) continue;
      const r = resoudreParametre(d, { props, params: props._params, couche, typeId });
      if (r.valeur == null || !ORIGINES_VIRTUELLES.has(r.origine)) continue;
      const colId = couche?.liaisons?.[d.id] || d.id;
      // Une cellule remplie est une donnée de l'équipe : on n'y touche pas.
      if (existantes.has(colId) && !vide(props[colId])) continue;
      const valeur = valeurPourTable(d, r.valeur);
      if (valeur == null) continue;
      let p = parParam.get(d.id);
      if (!p) {
        p = { d, colId, rowIds: [], valeurs: [], origines: {}, exemple: valeur };
        parParam.set(d.id, p);
      }
      p.rowIds.push(e.rowId);
      p.valeurs.push(valeur);
      p.origines[r.origine] = (p.origines[r.origine] || 0) + 1;
    }
  }

  const candidats = [...parParam.values()].map((p) => ({
    id: p.d.id, libelle: p.d.libelle, colId: p.colId, creer: !existantes.has(p.colId),
    type: typeColonne(p.d), n: p.rowIds.length, exemple: p.exemple, origines: p.origines,
  }));

  const retenus = choisis ? new Set(choisis) : null;
  const actions = [];
  let cellules = 0;
  for (const p of parParam.values()) {
    if (retenus && !retenus.has(p.d.id)) continue;
    if (!existantes.has(p.colId)) {
      const options = { type: typeColonne(p.d), label: p.d.libelle };
      if (p.d.kind === 'choice') options.widgetOptions = JSON.stringify({ choices: p.d.choix.map((c) => c.value) });
      actions.push(['AddColumn', table, p.colId, options]);
    }
    actions.push(['BulkUpdateRecord', table, p.rowIds, { [p.colId]: p.valeurs }]);
    cellules += p.rowIds.length;
  }
  return { candidats, actions, cellules };
}
