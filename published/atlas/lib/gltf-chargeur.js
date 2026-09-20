/**
 * Deux regles de chargement des modeles glTF, isolees pour etre testees hors
 * navigateur : `app_v7.js` depend de three.js par la carte d'import, que Node
 * ne connait pas.
 *
 * Elles viennent de l'accueil de la vegetation generee par pix2hdr (cadrage
 * `pix2hdr/docs/CADRAGE-GENERATEUR-VEGETATION.md`, essai du 19/09/2026 sur les
 * 885 arbres OSM de Longchamp).
 */

/**
 * Le seuil de decoupe a garder sur un materiau glTF, ou 0.
 *
 * Atlas force ses materiaux GLB en opaque, contre le « fantome » des modeles
 * photogrammetriques (`alphaMode: BLEND` mal exporte). La regle emportait aussi
 * la decoupe des feuillages (`alphaMode: MASK`), pour laquelle GLTFLoader pose
 * `alphaTest = alphaCutoff` : les cartes de feuilles s'affichaient alors
 * pleines. Le defaut ne se voit pas comme des rectangles — la couleur sous la
 * partie transparente est verte (debord de texture) — mais comme un houppier
 * sans trou de ciel et une ombre trop dense. Mesure sur le platane d'essai :
 * 58 % de chaque carte devait etre transparente.
 *
 * On garde donc le seuil que le fichier declare, et seulement lui : un
 * materiau `BLEND` n'a pas d'`alphaTest` et reste opaque comme avant. Aucun
 * modele du catalogue livre ne declare de transparence (verifie le 19/09) ;
 * rien ne change pour eux.
 *
 * @param {{alphaTest?: number}} materiau  materiau three.js issu de GLTFLoader
 * @returns {number}
 */
export function seuilDecoupe(materiau) {
  const s = Number(materiau?.alphaTest);
  return Number.isFinite(s) && s > 0 && s < 1 ? s : 0;
}

/** Repli si la carte d'import ne se laisse pas interroger. */
export const TRANSCODEUR_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/basis/';

/**
 * Le dossier du transcodeur Basis (textures KTX2), vu depuis la page.
 *
 * KTX2Loader charge `basis_transcoder.js` et `.wasm` par un chemin qu'on lui
 * donne, pas par la carte d'import. On demande donc a la carte d'import ou elle
 * envoie `three/addons/` : le CDN dans un widget, `./vendor/three-addons/` dans
 * l'application — qui doit pouvoir decoder hors reseau. Ecrire l'URL du CDN en
 * dur aurait fait echouer l'application sans connexion, et sans message.
 *
 * @param {((specifier: string) => string) | undefined} resoudre  `import.meta.resolve`
 * @returns {string}  URL terminee par `/`
 */
export function cheminTranscodeur(resoudre) {
  try {
    const u = typeof resoudre === 'function' ? resoudre('three/addons/libs/basis/') : '';
    if (typeof u === 'string' && /^(https?|capacitor|file):/.test(u)) return u.endsWith('/') ? u : u + '/';
  } catch (_) { /* carte d'import absente : repli */ }
  return TRANSCODEUR_CDN;
}
