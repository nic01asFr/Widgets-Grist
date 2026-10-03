/**
 * Les contextes de travail : des étapes du récit qu'on joue sans la séquence.
 *
 * Un contexte n'est pas un objet de plus. C'est une étape — elle porte déjà l'état
 * qu'il faut (couches et leur ordre, filtres, symbolisation, rendu à plat ou en
 * volume, caméra, ambiance, formulaires proposés) — que l'auteur propose en
 * exploitation. Il n'existe donc pas de table `Atlas_Contextes` : la **scène** est
 * l'ensemble de ses configurations, et le contexte une de ses étapes.
 *
 * Ce qui distingue une étape d'un contexte tient dans un petit bloc de son état,
 * `usage`. Il vit avec l'étape (même ligne de `Atlas_Story`, même clé stable, même
 * export) et ne demande ni colonne ni table. Aujourd'hui il dit une chose :
 * `contexte: true`. Il a vocation à porter ensuite les postures concernées, la zone
 * qui propose l'étape par GPS, l'ordre de passage et la règle de création — d'où un
 * bloc, et pas un booléen à la racine de l'état.
 *
 * Ce module ne touche ni au DOM, ni à Grist.
 */

/** Le bloc `usage` d'un état d'étape, normalisé ; jamais `null`. */
export function usageDe(etat) {
  const u = etat && typeof etat === 'object' ? etat.usage : null;
  return { contexte: !!(u && typeof u === 'object' && u.contexte === true) };
}

/**
 * L'état avec son bloc `usage` mis à jour. Rend une copie : l'état d'origine n'est
 * pas touché. `contexte: false` ne laisse pas de bloc vide derrière lui.
 *
 * @param {object} etat
 * @param {{ contexte?: boolean }} patch
 */
export function avecUsage(etat, patch = {}) {
  const sortie = { ...(etat && typeof etat === 'object' ? etat : {}) };
  const usage = { ...usageDe(etat), ...patch };
  // Les relevés proposés suivent le contexte : sans contexte, pas de règle à garder.
  const releves = 'releves' in patch ? patch.releves : relevesDe(etat);
  const tournee = 'tournee' in patch ? patch.tournee : tourneeDe(etat);
  if (usage.contexte) {
    sortie.usage = {
      contexte: true,
      ...(Array.isArray(releves) ? { releves: [...releves] } : {}),
      ...(tournee ? { tournee } : {}),
    };
  }
  else delete sortie.usage;
  return sortie;
}

/**
 * Les couches dont le relevé est proposé dans ce contexte, par clé de couche (`sourceTable`, à défaut l'identifiant).
 * `null` = le contexte ne dit rien : toutes les couches visibles gardent leur relevé, comme avant. Une liste vide dit
 * « aucun relevé ici » — c'est un choix, pas l'absence de choix.
 *
 * @returns {string[]|null}
 */
export function relevesDe(etat) {
  const u = etat && typeof etat === 'object' ? etat.usage : null;
  const r = u && typeof u === 'object' ? u.releves : null;
  return Array.isArray(r) ? r.filter((x) => typeof x === 'string' && x) : null;
}

/**
 * La tournée du contexte : sa ligne de travail (voir `lib/tournee.js`), ou `null`. Une ligne d'au moins deux points distincts ;
 * rien d'autre ne la décrit (pas de rayon : elle est incluse dans son contexte).
 *
 * @returns {{type: 'LineString', coordinates: number[][], sourceTable?: string|null, sourceRowId?: any, nom?: string}|null}
 */
export function tourneeDe(etat) {
  const u = etat && typeof etat === 'object' ? etat.usage : null;
  const t = u && typeof u === 'object' ? u.tournee : null;
  const c = t && Array.isArray(t.coordinates) ? t.coordinates : null;
  if (!c || c.length < 2) return null;
  const bons = c.filter((p) => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])));
  if (bons.length < 2) return null;
  if (!bons.some((p) => Number(p[0]) !== Number(bons[0][0]) || Number(p[1]) !== Number(bons[0][1]))) return null;
  return t;
}

/**
 * Les pastilles que l'étape offre : celles que l'auteur voyait dans son dock au moment de la capture (l'environnement et les
 * contrôles ; « Relevé », « Contexte » et « Récit » suivent leurs propres règles). `null` = l'étape n'en dit rien, et les pastilles
 * restent celles de la scène — comportement des étapes capturées avant ce réglage.
 *
 * @returns {Array<{id: string, label: string}>|null}
 */
export function pastillesDe(etat) {
  const p = etat && typeof etat === 'object' ? etat.pastilles : null;
  if (!Array.isArray(p)) return null;
  return p.filter((x) => x && typeof x.id === 'string' && x.id).map((x) => ({ id: x.id, label: String(x.label || x.id) }));
}

/** La pastille de cette clé est-elle offerte, selon la liste d'une étape (`null` : oui) ? */
export function pastilleOfferte(pastilles, cle) {
  return pastilles == null || pastilles.some((p) => p.id === cle);
}

/** Le relevé de la couche de cette clé est-il proposé, selon la liste `releves` d'un contexte (`null` : oui, sans réserve) ? */
export function releveProposeDans(releves, cle) {
  return releves == null || releves.includes(cle);
}

/**
 * La liste après avoir (dé)coché une couche. `toutes` : les clés de toutes les couches qui ont un relevé. Quand tout est
 * coché, on rend `null` : « tout » s'écrit par l'absence de règle, pour qu'une couche ajoutée plus tard soit proposée.
 *
 * @returns {string[]|null}
 */
export function basculerReleve(releves, toutes, cle, propose) {
  const base = new Set(releves == null ? toutes : releves);
  if (propose) base.add(cle); else base.delete(cle);
  const garde = toutes.filter((k) => base.has(k));
  return garde.length === toutes.length ? null : garde;
}

/**
 * Les étapes que la scène propose comme contextes, dans l'ordre du récit.
 *
 * @param {Array<{cle?:string,title?:string,text?:string,state?:object}>} recit
 * @returns {Array<{cle:string, index:number, titre:string, texte:string}>}
 *   Une étape sans clé n'est pas proposée : on ne peut pas la désigner de façon
 *   stable (les clés sont posées à la lecture et à la capture).
 */
export function contextesProposes(recit) {
  const out = [];
  (recit || []).forEach((s, index) => {
    if (!s || !s.cle || !usageDe(s.state).contexte) return;
    out.push({
      cle: s.cle,
      index,
      titre: (s.title || '').trim() || `Étape ${index + 1}`,
      texte: s.text || '',
    });
  });
  return out;
}

/** Le contexte de cette clé, ou `null` (étape retirée, ou plus proposée). */
export function contexteDeCle(recit, cle) {
  return contextesProposes(recit).find((c) => c.cle === cle) || null;
}
