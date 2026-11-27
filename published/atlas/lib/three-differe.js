/**
 * three.js et tout ce qui en depend, charges A LA DEMANDE.
 *
 * ## Avant
 *
 * `app_v7.js` importait three.js et quatre de ses extensions en tete de fichier :
 * 1,5 Mo (320 Ko compresses) a telecharger, analyser et executer AVANT que la
 * premiere ligne d'Atlas ne tourne — pour toutes les pages, y compris celles qui
 * n'affichent aucun objet 3D (page seule, scene sans modele, zoom large). Un module
 * ES statique bloque tout le graphe : la carte attendait three.js.
 *
 * ## Maintenant
 *
 * `app_v7.js` demande ce module quand une scene en a besoin — modeles 3D,
 * luminaires, ombres portees du bati (`Models3D.besoin3D`) — et jamais avant. Le
 * calque three.js reste declare dans le style (les couches s'ordonnent autour de
 * lui) mais ne cree son moteur qu'a ce moment.
 *
 * Les specificateurs nus (`three`, `three/addons/...`) sont ceux de la carte
 * d'import de `index_v7.html`, qui porte aussi leur empreinte SHA-384 : un
 * `import()` dynamique passe par la meme carte, donc par le meme controle.
 *
 * ## Contrat
 *
 * `chargerThree()` rend, en une seule fois et une seule execution :
 *   `{ THREE, GLTFLoader, KTX2Loader, MeshoptDecoder, mergeGeometries,
 *      creerLuminaires3D, marquerPochoirModele, creerCasters }`.
 * Un echec n'est pas memorise (`lib/chargement-paresseux.js`) : l'appel suivant
 * retente — une coupure reseau ne prive pas la page de 3D jusqu'au rechargement.
 */
import { unSeulChargement } from './chargement-paresseux.js';

/** Les importations par defaut : des litteraux, pour que la carte d'import les voie. */
export const IMPORTS_THREE = Object.freeze({
  three: () => import('three'),
  gltf: () => import('three/addons/loaders/GLTFLoader.js'),
  ktx2: () => import('three/addons/loaders/KTX2Loader.js'),
  meshopt: () => import('three/addons/libs/meshopt_decoder.module.js'),
  utils: () => import('three/addons/utils/BufferGeometryUtils.js'),
  luminaires: () => import('./luminaires-three.js?v=1.46.0'),
  casters: () => import('./extrusion-ombres.js?v=1.46.0'),
});

/**
 * Fabrique le chargeur. `importer` se remplace pour tester hors navigateur.
 *
 * @param {Record<string, () => Promise<any>>} [importer]
 * @returns {() => Promise<{THREE: any, GLTFLoader: any, KTX2Loader: any, MeshoptDecoder: any,
 *   mergeGeometries: any, creerLuminaires3D: any, marquerPochoirModele: any, creerCasters: any}>}
 */
export function creerChargeurThree(importer = IMPORTS_THREE) {
  return unSeulChargement(async () => {
    const [three, gltf, ktx2, meshopt, utils, luminaires, casters] = await Promise.all([
      importer.three(), importer.gltf(), importer.ktx2(), importer.meshopt(),
      importer.utils(), importer.luminaires(), importer.casters(),
    ]);
    return {
      THREE: three,
      GLTFLoader: gltf.GLTFLoader,
      KTX2Loader: ktx2.KTX2Loader,
      MeshoptDecoder: meshopt.MeshoptDecoder,
      mergeGeometries: utils.mergeGeometries,
      creerLuminaires3D: luminaires.creerLuminaires3D,
      marquerPochoirModele: luminaires.marquerPochoirModele,
      creerCasters: casters.creerCasters,
    };
  });
}

/** Le chargeur de la page. */
export const chargerThree = creerChargeurThree();
