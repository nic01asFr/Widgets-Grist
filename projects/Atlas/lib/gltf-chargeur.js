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

/**
 * Le chargeur glTF d'une maquette en dalles 3D : meshopt toujours, et le KTX2 (textures `KHR_texture_basisu`) dès que le moteur de rendu est connu.
 *
 * Les dalles de pix2hdr arrivent compressées (`EXT_meshopt_compression`, `KHR_texture_basisu`, `KHR_mesh_quantization`, `EXT_mesh_gpu_instancing`). Le chargeur des dalles
 * ne branchait que meshopt : un GLB à textures KTX2 est refusé par `GLTFLoader` (« setKTX2Loader must be called before loading KTX2 textures »). `KTX2Loader` doit connaître
 * le moteur de rendu pour choisir le format de texture que le GPU accepte (`detectSupport`) : la couche le passe donc à la création du chargeur.
 *
 * Pure : les classes de three, le moteur de rendu et le chemin du transcodeur sont injectés ; il se teste sous Node avec des doubles.
 * @param {{GLTFLoader: Function, MeshoptDecoder: any, KTX2Loader?: Function, renderer?: any, chemin: string, journal?: {warn: Function}}} o
 * @returns {object} un GLTFLoader, avec `liberer()` qui rend les ressources du transcodeur
 */
export function chargeurDalles({ GLTFLoader, MeshoptDecoder, KTX2Loader, renderer, chemin, journal = console }) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.liberer = () => {};
  if (!renderer || typeof KTX2Loader !== 'function') return loader;
  try {
    const ktx2 = new KTX2Loader().setTranscoderPath(chemin).detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
    loader.liberer = () => { try { if (ktx2.dispose) ktx2.dispose(); } catch (_) { /* déjà libéré */ } };
  } catch (e) { journal.warn('KTX2 indisponible pour les dalles : ' + (e && e.message ? e.message : e)); }
  return loader;
}
