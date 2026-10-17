/**
 * Les tables liées de la carte BI : des lignes SANS géométrie, fournies par l’hôte (`donnees.<id>` pour une couche `type: "table"`), que la bulle d’un objet
 * montre par jointure sur une clé (l’historique des cotations d’un bâtiment, les visites d’un site…).
 *
 * Module pur : aucune dépendance, aucun DOM. Les lignes viennent d’une page hôte et ne sont jamais interprétées : valeurs simples seulement (texte, nombre,
 * booléen), longueurs et effectifs bornés ; tout ce qui est écarté est dit.
 */
export const LIGNES_MAX = 2000;
export const CHAMPS_MAX_LIGNE = 20;
export const VALEUR_MAX = 200;
export const MAX_AFFICHE = 10;

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Une ligne réduite à des valeurs simples (le reste est écarté) ; `null` si ce n’est pas un objet. */
function nettoyerLigne(brut) {
  if (!estObjet(brut)) return null;
  const sortie = {}; let n = 0;
  for (const [k, v] of Object.entries(brut)) {
    if (n >= CHAMPS_MAX_LIGNE) break;
    if (typeof v === 'string') sortie[k] = v.length > VALEUR_MAX ? v.slice(0, VALEUR_MAX) : v;
    else if (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'boolean') sortie[k] = v;
    else if (v === null) sortie[k] = null;
    else continue;
    n++;
  }
  return sortie;
}

/**
 * Les lignes d’une table de l’hôte.
 * @returns {{ lignes: object[], avertissements: string[] }}
 */
export function normaliserLignes(brut) {
  const avertissements = [];
  if (brut === undefined || brut === null) return { lignes: [], avertissements };
  if (!Array.isArray(brut)) return { lignes: [], avertissements: ['table : une liste de lignes est attendue, ignorée'] };
  const lignes = []; let ecartees = 0;
  for (const b of brut) {
    if (lignes.length >= LIGNES_MAX) { ecartees++; continue; }
    const l = nettoyerLigne(b); if (l) lignes.push(l); else ecartees++;
  }
  if (ecartees) avertissements.push(`table : ${ecartees} ligne(s) écartée(s) (${LIGNES_MAX} au plus, des objets de valeurs simples attendus)`);
  return { lignes, avertissements };
}

/** Ordre de deux valeurs : nombres, puis dates lisibles, puis texte (français) ; les valeurs vides en dernier. */
export function comparer(a, b) {
  const vide = (v) => v === undefined || v === null || v === '';
  if (vide(a) || vide(b)) return vide(a) === vide(b) ? 0 : (vide(a) ? 1 : -1);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const da = typeof a === 'string' ? Date.parse(a) : NaN, db = typeof b === 'string' ? Date.parse(b) : NaN;
  if (Number.isFinite(da) && Number.isFinite(db)) return da - db;
  return String(a).localeCompare(String(b), 'fr', { numeric: true });
}

/**
 * Les lignes liées à une valeur de clé, triées, limitées.
 * @param {object[]} lignes
 * @param {{ cle: string, valeur: any, tri?: string, ordre?: 'asc'|'desc', max?: number }} o
 * @returns {{ lignes: object[], total: number }}  `total` : les lignes liées avant la limite
 */
export function lignesLiees(lignes, { cle, valeur, tri, ordre = 'desc', max = 5 }) {
  if (!Array.isArray(lignes) || valeur === undefined || valeur === null || valeur === '') return { lignes: [], total: 0 };
  const v = String(valeur);
  const liees = lignes.filter((l) => l[cle] !== undefined && l[cle] !== null && String(l[cle]) === v);
  if (tri) { const sens = ordre === 'asc' ? 1 : -1; liees.sort((x, y) => sens * comparer(x[tri], y[tri])); }
  const limite = Math.min(Math.max(1, Math.floor(max) || 5), MAX_AFFICHE);
  return { lignes: liees.slice(0, limite), total: liees.length };
}

/**
 * Met à jour la ligne d’identifiant `id` (propriété `id`), ou la CRÉE si elle n’existe pas : une seule opération pour « ajouter une cotation » et « corriger une
 * cotation ». Modifie la liste en place.
 * @returns {{ cree: boolean }}
 */
export function mettreAJour(lignes, id, patch) {
  const propre = nettoyerLigne(patch && patch.properties !== undefined ? patch.properties : patch);
  if (!propre) throw new Error('ligne : un objet de valeurs simples est attendu');
  const i = lignes.findIndex((l) => l.id !== undefined && String(l.id) === String(id));
  if (i >= 0) { lignes[i] = { ...lignes[i], ...propre, id: lignes[i].id }; return { cree: false }; }
  if (lignes.length >= LIGNES_MAX) throw new Error(`table pleine (${LIGNES_MAX} lignes au plus)`);
  lignes.push({ ...propre, id }); return { cree: true };
}
