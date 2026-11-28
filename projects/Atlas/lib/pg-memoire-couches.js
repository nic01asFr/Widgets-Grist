/**
 * Les tables PostgreSQL affichées sur la carte, retrouvées à la réouverture du document.
 *
 * Une couche PostgreSQL n'est pas dans le projet (ses entités sont celles de la base, relues à chaque déplacement) : sans mémoire, elle disparaît
 * au rechargement et il faut la remettre à la main. La liste de ce qui est affiché est donc gardée dans le document, dans UNE ligne `pgCouches` de la
 * table `Atlas_Config` (Cle, Valeur), en JSON : pour chaque table, l'adresse, la connexion, le schéma, la table, la couleur et la visibilité.
 * L'apparence (style) reste dans `Atlas_LayerPrefs`, comme avant.
 *
 * ## Ce qui n'y est jamais
 * Ni entité, ni jeton, ni identité. Une liste lue dans un document est une DONNÉE : seules les tables de l'adresse du document, et de la connexion
 * qu'on vient d'ouvrir, sont remises sur la carte (et seulement après la confirmation d'identité du panneau) ; les autres sont conservées telles quelles.
 *
 * ## Rien n'est perdu en silence
 * Une table qui n'est plus lisible (supprimée, ou plus accessible à CETTE personne) reste dans la liste du document, et le dit : elle ne devient pas
 * une absence pour tout le monde parce qu'une personne n'y a pas accès.
 *
 * Module pur : ni Grist, ni DOM, ni réseau.
 */

export const CLE_COUCHES = 'pgCouches';

const COULEUR = /^#[0-9a-fA-F]{3,8}$/;
const texte = (v) => (typeof v === 'string' ? v.trim() : '');
const cle = (c) => `${c.url}|${c.connexion}|${c.schema}|${c.table}`;

/**
 * Lire la valeur enregistrée.
 * @param {string|null|undefined} brut  la valeur de la ligne `pgCouches`
 * @returns {{couches: object[], refus: string|null, ignorees: number}}
 *   `refus` : une valeur présente mais illisible (à dire, et à ne pas écraser) ; `ignorees` : entrées incomplètes écartées
 */
export function lireCouches(brut) {
  if (brut === undefined || brut === null || String(brut).trim() === '') return { couches: [], refus: null, ignorees: 0 };
  let valeur;
  try { valeur = JSON.parse(String(brut)); } catch { return { couches: [], refus: 'la liste des couches PostgreSQL de ce document est illisible (ligne pgCouches de la table Atlas_Config)', ignorees: 0 }; }
  if (!Array.isArray(valeur)) return { couches: [], refus: 'la liste des couches PostgreSQL de ce document n’est pas une liste (ligne pgCouches de la table Atlas_Config)', ignorees: 0 };
  const couches = [];
  const vues = new Set();
  let ignorees = 0;
  for (const e of valeur) {
    const c = e && typeof e === 'object' ? {
      url: texte(e.url).replace(/\/+$/, ''), connexion: texte(e.connexion), schema: texte(e.schema), table: texte(e.table),
      couleur: COULEUR.test(texte(e.couleur)) ? texte(e.couleur) : null, visible: e.visible !== false,
    } : null;
    if (!c || !c.url || !c.connexion || !c.schema || !c.table || vues.has(cle(c))) { ignorees++; continue; }
    vues.add(cle(c));
    couches.push(c);
  }
  return { couches, refus: null, ignorees };
}

/**
 * Séparer ce qu'on remet maintenant de ce qu'on conserve : seules les tables de CETTE adresse et de CETTE connexion sont remises.
 * @returns {{ici: object[], ailleurs: object[]}}
 */
export function repartir(couches, { url, connexion }) {
  const adresse = texte(url).replace(/\/+$/, '');
  const ici = [];
  const ailleurs = [];
  for (const c of couches || []) (c.url === adresse && c.connexion === connexion ? ici : ailleurs).push(c);
  return { ici, ailleurs };
}

/**
 * La valeur à écrire : ce qui est posé sur la carte, puis ce qu'on n'a pas pu remettre, puis ce qui concerne une autre adresse ou connexion.
 * @param {{posees: object[], manquantes?: object[], ailleurs?: object[]}} p
 * @returns {string}  le JSON de la liste
 */
export function listeAEnregistrer({ posees, manquantes = [], ailleurs = [] }) {
  const vues = new Set();
  const liste = [];
  for (const c of [...(posees || []), ...manquantes, ...ailleurs]) {
    if (vues.has(cle(c))) continue;
    vues.add(cle(c));
    liste.push({ url: c.url, connexion: c.connexion, schema: c.schema, table: c.table, couleur: c.couleur || null, visible: c.visible !== false });
  }
  return JSON.stringify(liste);
}
