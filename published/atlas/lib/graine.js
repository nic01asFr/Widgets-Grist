/**
 * La graine d'un objet : ce qui fait que deux arbres voisins ne sont pas le
 * meme arbre, et que le meme arbre reste le meme d'une ouverture a l'autre.
 *
 * Contrat partage avec le generateur pix2hdr (catalogue d'objets parametriques
 * `atlas-objets/0.1`) : la meme fonction tourne en Python cote Blender, pour
 * que la maquette et Atlas posent la meme variante au meme arbre. D'ou des
 * choix qui ne sont pas des gouts :
 *
 * - **FNV-1a 32 bits sur l'UTF-8** : entier, sans flottant, identique au bit
 *   pres dans les deux langages.
 * - **Clé lat/lon en microdegres ENTIERS**, `floor(x * 1e6 + 0.5)`. Un format
 *   `%.6f` divergeait : Python ecrit `-0.000000`, JavaScript `0.000000`, et les
 *   demi-cas s'arrondissent differemment (mesure le 19/09/2026).
 * - **Les operations dans cet ordre, et pas un autre** (`u * (2 * Math.PI)`,
 *   `0.9 + 0.2 * u`) : ainsi le resultat se compare sans tolerance.
 *
 * Deplacer un point change son tirage : c'est le prix d'une graine
 * geographique, valable pour toute source (OSM, BD TOPO, Grist).
 */

const ENCODEUR = new TextEncoder();

/** FNV-1a 32 bits, sur les octets UTF-8 de la chaine. */
export function fnv1a32(texte) {
  let h = 0x811c9dc5;
  for (const octet of ENCODEUR.encode(String(texte))) {
    h ^= octet;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Un angle en degres, en microdegres entiers. */
export function microdegres(x) {
  return Math.floor(x * 1e6 + 0.5);
}

/**
 * La cle canonique d'un point : `ll:<lat>,<lon>` en microdegres.
 * @returns {string|null}  `null` si la position est illisible
 */
export function cleLatLon(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return `ll:${String(microdegres(lat))},${String(microdegres(lon))}`;
}

/** Un tirage dans [0, 1), propre a une cle et a un flux (`variant`, `rot`…). */
export function tirage(cle, flux) {
  return fnv1a32(cle + '#' + flux) / 4294967296;
}

/** L'indice de variante parmi `k`. */
export function variante(cle, k) {
  return Math.floor(tirage(cle, 'variant') * k);
}

/** Une rotation autour de la verticale, en radians. */
export function rotation(cle) {
  return tirage(cle, 'rot') * (2 * Math.PI);
}

/** Un facteur d'echelle dans [0.9, 1.1), quand aucune hauteur n'est mesuree. */
export function echelle(cle) {
  return 0.9 + 0.2 * tirage(cle, 'scale');
}

/** La cle d'une maille de semis : `cell:<type>:<ix>,<iy>`. */
export function cleMaille(type, ix, iy) {
  return `cell:${type}:${String(ix)},${String(iy)}`;
}

/**
 * Le point semé dans une maille, en Lambert-93 (metres).
 *
 * Il vient des indices ENTIERS de la maille, jamais d'une projection : les
 * fonctions trigonometriques ne sont pas arrondies pareil en JS et en Python,
 * et une cle tiree d'une coordonnee projetee divergerait au dernier bit. La
 * projection ne sert qu'apres, pour tester l'appartenance a la zone et
 * afficher.
 */
export function pointMaille(type, ix, iy, pasM) {
  const cle = cleMaille(type, ix, iy);
  return {
    cle,
    x: (ix + tirage(cle, 'x')) * pasM,
    y: (iy + tirage(cle, 'y')) * pasM,
  };
}

/**
 * Garder ou non un objet a la densite `f` dans [0, 1]. Les ensembles sont
 * emboites : en baissant `f`, des objets disparaissent, aucun ne se deplace.
 */
export function garde(cle, f) {
  return tirage(cle, 'keep') < f;
}
