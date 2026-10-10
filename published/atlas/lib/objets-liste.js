/**
 * Lister et chercher les objets d'une couche : par nom, par valeur de champ, par
 * distance.
 *
 * Trois endroits énuméraient les objets chacun à sa façon — la palette (par le
 * nom), « le plus proche » (avec les filtres) et les objets alentour d'une étape
 * —, et aucun ne permettait de CHOISIR un objet sans le toucher sur la carte. Ce
 * module est la liste unique ; il ne touche ni au DOM, ni à la carte, ni à Grist.
 * L'application lui donne des entrées déjà préparées (libellés des références
 * résolus) et il répond : qui, dans quel ordre, trouvé où.
 *
 * ## Chercher dans l'enregistrement
 *
 * La palette ne cherchait que le nom : une recherche plein texte « ferait
 * remonter chaque objet qui porte "oui" ou "1" ». Le risque reste, donc :
 *
 * - **tous les mots doivent se retrouver** (« digue aulnes » = les deux), dans le
 *   nom ou dans UN champ — jamais seulement dans le bruit ;
 * - **un mot d'une seule lettre ne cherche que le début du nom** ;
 * - **le nom prime** sur un champ, et le début d'un nom sur son milieu ;
 * - **on dit où l'on a trouvé** (« Domaine : ETANG-AULNES »), pour que le résultat
 *   s'explique ;
 * - **une référence se cherche par son libellé**, jamais par son numéro.
 */
import { normaliser } from './palette-objets.js?v=1.16.1';
import { distanceMetres } from './releve.js?v=1.16.1';
import { dateCourte } from './bulle-objet.js?v=1.16.1';

/** Au-delà, un texte de champ n'est plus une valeur à retrouver mais un paragraphe. */
export const LONGUEUR_MAX_CHAMP = 160;

/** Combien de lignes une liste montre d'un coup. */
export const MAX_LIGNES = 50;

/**
 * Les champs d'un objet, sous une forme qu'on sait chercher.
 *
 * @param {object} properties  les attributs de l'entité (`_l_<champ>` = liste complète)
 * @param {Array<{colId: string, type?: string}>} colonnes  celles de la table
 * @param {object} [o]
 * @param {Record<string, Map<string,string>>} [o.libelles]  `colId` → (identifiant → libellé)
 *   pour les colonnes `Ref` et `RefList`
 * @param {(colId: string) => string} [o.libelleDe]  l'intitulé d'une colonne
 * @param {(colId: string) => boolean} [o.exclus]    colonnes qu'on n'indexe pas
 * @returns {Array<{libelle: string, texte: string, norm: string}>}
 */
export function champsDeLEntite(properties, colonnes, { libelles = {}, libelleDe = (c) => c, exclus = () => false } = {}) {
  const out = [];
  if (!properties || typeof properties !== 'object') return out;
  for (const col of colonnes || []) {
    const colId = col?.colId;
    if (!colId || exclus(colId)) continue;
    const base = String(col.type || '').replace(/:.*$/, '');
    if (base === 'Attachments' || base === 'Bool') continue;
    let texte = '';
    if (base === 'Ref') {
      const v = properties[colId];
      texte = v ? (libelles[colId]?.get(String(v)) ?? '') : '';
    } else if (base === 'RefList') {
      const liste = properties[`_l_${colId}`] ?? properties[colId];
      const ids = Array.isArray(liste) ? liste.filter((x) => x !== 'L') : [];
      texte = ids.map((id) => libelles[colId]?.get(String(id)) ?? '').filter(Boolean).join(', ');
    } else if (base === 'ChoiceList') {
      const v = properties[`_l_${colId}`] ?? properties[colId];
      texte = Array.isArray(v) ? v.filter((x) => x !== 'L').join(', ') : String(v ?? '');
    } else if (base === 'Date' || base === 'DateTime') {
      const v = properties[colId];
      texte = Number.isFinite(Number(v)) && v !== '' && v != null ? dateCourte(v) : '';
    } else {
      const v = properties[colId];
      if (v == null || typeof v === 'object' || typeof v === 'boolean') continue;
      texte = String(v);
    }
    texte = texte.trim().slice(0, LONGUEUR_MAX_CHAMP);
    if (!texte) continue;
    out.push({ libelle: libelleDe(colId), texte, norm: normaliser(texte) });
  }
  return out;
}

/** Une entrée prête à chercher. */
export function entreeObjet({ idx, rowId = null, nom = '', point = null, couleur = null, etat = '', champs = [] }) {
  return { idx, rowId, nom: String(nom || ''), norm: normaliser(nom), point, couleur, etat, champs };
}

/**
 * Les entrées qui répondent, dans l'ordre.
 *
 * @param {ReturnType<typeof entreeObjet>[]} entrees
 * @param {object} [o]
 * @param {string} [o.requete]
 * @param {[number, number]|null} [o.position]  `[lng, lat]` d'où l'on mesure
 * @param {'proche'|'nom'|'tournee'} [o.tri]  `tournee` : l'ordre de la ligne d'un contexte (voir `rangs`)
 * @param {Map<number, {rang: number, metres: number, ecartM: number}>|null} [o.rangs]  la place de chaque objet sur la tournée
 * @param {number} [o.max]
 * @param {(e: object) => boolean} [o.visible]  ce que les filtres laissent voir
 * @returns {{ total: number, items: object[], tronque: boolean }}
 */
export function listerObjets(entrees, { requete = '', position = null, tri = 'proche', max = MAX_LIGNES, visible = null, rangs = null } = {}) {
  const mots = normaliser(requete).split(/\s+/).filter(Boolean);
  const trouves = [];
  for (const e of entrees || []) {
    if (!e || (visible && !visible(e))) continue;
    let score = 0;
    let trouveDans = null;
    let ok = true;
    for (const mot of mots) {
      const dansNom = e.norm.indexOf(mot);
      if (dansNom === 0) { score += 3; continue; }
      if (dansNom > 0 && mot.length > 1) { score += 2; continue; }
      const champ = mot.length > 1 ? e.champs.find((c) => c.norm.includes(mot)) : null;
      if (!champ) { ok = false; break; }
      score += 1;
      if (!trouveDans) trouveDans = { libelle: champ.libelle, texte: champ.texte };
    }
    if (!ok) continue;
    const distance = position && e.point ? distanceMetres(e.point, position) : null;
    trouves.push({
      idx: e.idx,
      rowId: e.rowId,
      nom: e.nom,
      distance: Number.isFinite(distance) ? distance : null,
      trouveDans,
      couleur: e.couleur,
      etat: e.etat,
      score,
      ...(rangs?.has(e.idx) ? { rang: rangs.get(e.idx).rang, metres: rangs.get(e.idx).metres, ecartM: rangs.get(e.idx).ecartM } : {}),
    });
  }
  const parNom = (a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true, sensitivity: 'base' });
  const parDistance = (a, b) => {
    if (a.distance == null && b.distance == null) return parNom(a, b);
    if (a.distance == null) return 1;
    if (b.distance == null) return -1;
    return a.distance - b.distance || parNom(a, b);
  };
  // Le long de la tournée : l'ordre de la ligne ; un objet qu'elle ne classe pas passe après, par nom.
  const parTournee = (a, b) => {
    if (a.rang == null && b.rang == null) return parNom(a, b);
    if (a.rang == null) return 1;
    if (b.rang == null) return -1;
    return a.rang - b.rang;
  };
  const ordre = tri === 'nom' ? parNom : (tri === 'tournee' && rangs ? parTournee : parDistance);
  trouves.sort((a, b) => (mots.length && b.score !== a.score ? b.score - a.score : ordre(a, b)));
  return {
    total: trouves.length,
    items: trouves.slice(0, Math.max(0, max)).map(({ score, ...reste }) => reste),
    tronque: trouves.length > max,
  };
}

/**
 * La dernière ligne liée de chaque objet, et leur nombre — d'un seul passage.
 *
 * Une liste montre cinquante objets : relire la table liée pour chacun serait
 * cinquante parcours (`derniereLigneLiee`). Une seule fois suffit.
 *
 * @param {object[]} lignes  les lignes de la table liée (`{ id, <via>, <date>, … }`)
 * @param {string} via   la colonne qui désigne l'objet
 * @param {string|null} date  la colonne de date, ou `null`
 * @returns {Map<number, { date: number|null, nombre: number, ligne: object }>}
 */
export function dernieresParObjet(lignes, via, date) {
  const out = new Map();
  for (const l of lignes || []) {
    const brut = Array.isArray(l[via]) ? l[via][1] : l[via];
    const objet = Number(brut);
    if (!Number.isFinite(objet) || objet <= 0) continue;
    const d = date ? Number(l[date]) : NaN;
    const courant = out.get(objet);
    if (!courant) {
      out.set(objet, { date: Number.isFinite(d) ? d : null, nombre: 1, ligne: l });
      continue;
    }
    courant.nombre++;
    // La plus récente ; sans date, la dernière créée.
    const plusRecente = Number.isFinite(d)
      ? (courant.date == null || d > courant.date)
      : (courant.date == null && (l.id ?? 0) > (courant.ligne.id ?? 0));
    if (plusRecente) {
      courant.date = Number.isFinite(d) ? d : courant.date;
      courant.ligne = l;
    }
  }
  return out;
}
