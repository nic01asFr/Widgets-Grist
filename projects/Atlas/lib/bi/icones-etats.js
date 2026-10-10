/**
 * Marqueurs à formes : l'état d'une entité se lit par la FORME, la COULEUR et un TEXTE (pas par la couleur seule).
 * Formes : cercle, carre (aux coins arrondis), losange, triangle. Dessinées sur un canevas, ajoutées comme images à la carte.
 */
export const FORMES = Object.freeze(['cercle', 'carre', 'losange', 'triangle']);

/** Trace une forme dans un contexte 2D, centrée dans un carré de 36 unités mis à l'échelle `k`. */
export function tracer(ctx, forme, k = 1) {
  const p = (x, y) => [x * k, y * k];
  ctx.beginPath();
  if (forme === 'cercle') ctx.arc(18 * k, 18 * k, 14 * k, 0, Math.PI * 2);
  else if (forme === 'carre') { const [x, y] = p(4, 4), w = 28 * k, r = 6 * k; ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + w, r); ctx.arcTo(x + w, y + w, x, y + w, r); ctx.arcTo(x, y + w, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  else if (forme === 'losange') { const a = [p(18, 2), p(34, 18), p(18, 34), p(2, 18)]; ctx.moveTo(...a[0]); for (const q of a.slice(1)) ctx.lineTo(...q); ctx.closePath(); }
  else { const a = [p(18, 3), p(35, 33), p(1, 33)]; ctx.moveTo(...a[0]); for (const q of a.slice(1)) ctx.lineTo(...q); ctx.closePath(); }
}

/** Une image prête pour `map.addImage` : { width, height, data }. `taille` en pixels CSS, `ratio` = densité. */
export function creerIcone({ forme, fill, stroke = '#ffffff', largeurTrait = 2.5, ombre = true, taille = 36, ratio = 2 }) {
  const px = Math.round(taille * ratio), c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(px, px) : Object.assign(document.createElement('canvas'), { width: px, height: px });
  const ctx = c.getContext('2d'); const k = px / 36;
  if (ombre) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 2 * k; ctx.shadowOffsetY = 1 * k; }
  tracer(ctx, forme, k); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = largeurTrait * k; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke();
  return ctx.getImageData(0, 0, px, px);
}

/**
 * La couleur du chiffre : un état peut déclarer la sienne (`texteCouleur`, jeton de charte accepté) ; sans aucune, une couleur unique.
 * @returns {string|Array} une couleur, ou une expression MapLibre `match` sur le champ d'état
 */
export function couleurTexteEtats(champEtat, etats, resoudre = (c) => c, defaut = '#000000') {
  const paires = Object.entries(etats || {}).filter(([, e]) => e && e.texteCouleur).flatMap(([cle, e]) => [cle, resoudre(e.texteCouleur)]);
  return paires.length ? ['match', ['get', champEtat || 'etat'], ...paires, defaut] : defaut;
}

/**
 * La taille du chiffre : celle de la charte par défaut ; un nombre ; ou une règle `{ normal, long, seuil = 2 }` : `long` au-delà de `seuil`
 * caractères (un pourcentage à trois chiffres tient moins bien dans la forme). Une règle illisible retombe sur la charte.
 * @returns {number|Array}
 */
export function tailleTexte(champTexte, reglage, defaut) {
  if (typeof reglage === 'number' && Number.isFinite(reglage)) return reglage;
  if (reglage && typeof reglage === 'object' && Number.isFinite(reglage.normal) && Number.isFinite(reglage.long)) {
    const seuil = Number.isFinite(reglage.seuil) ? reglage.seuil : 2;
    return ['case', ['>', ['length', ['to-string', ['coalesce', ['get', champTexte], '–']]], seuil], reglage.long, reglage.normal];
  }
  return defaut;
}

/**
 * Ajoute à la carte une image par état. Renvoie la table état -> identifiant d'image.
 * `contourDefaut` : le trait des marqueurs qui n'en déclarent pas (la charte : `marqueurs.contour`, l'encre) ; à défaut, blanc comme avant.
 */
export function ajouterIcones(map, etats, { prefixe = 'bi-ic-', resoudre = (c) => c, contourDefaut = null } = {}) {
  const ids = {};
  for (const [cle, e] of Object.entries(etats)) {
    const id = prefixe + cle; ids[cle] = id; const img = creerIcone({ forme: e.forme, fill: resoudre(e.fill), stroke: resoudre(e.stroke || contourDefaut || '#ffffff'), largeurTrait: e.largeurTrait || 2.5 });
    if (map.hasImage(id)) map.removeImage(id); map.addImage(id, img, { pixelRatio: 2 });
  }
  return ids;
}
