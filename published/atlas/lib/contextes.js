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
  if (usage.contexte) sortie.usage = { contexte: true };
  else delete sortie.usage;
  return sortie;
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
