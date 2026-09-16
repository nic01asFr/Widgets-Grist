/**
 * Reconnaître un fichier JSON par ce qu'il contient.
 *
 * Trois formats se ressemblent : un **projet Atlas** (`buildProject`), une
 * **scène** (Scene Manifest 0.2.x) et un **GeoJSON**. Ils arrivaient par deux
 * portes qui ne se parlaient pas — « Charger un projet » et « Fichier » —, et
 * chacune échouait en silence sur le format de l'autre : une scène donnée à
 * « Charger un projet » ne chargeait rien, un projet donné à « Fichier »
 * devenait une couche absurde.
 *
 * Les deux portes demandent désormais d'abord ce qu'est le fichier.
 */
import { deballerScene, verifierFormeScene } from './scene-externe.js';

/**
 * @param {any} obj le JSON lu
 * @returns {'geojson'|'scene'|'projet'|null}
 */
export function natureJson(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  if (obj.type === 'FeatureCollection' || obj.type === 'Feature') return 'geojson';

  // Une scène se reconnaît à sa version lue et à ses couches nommées — la même
  // garde que `?scene=`, pour qu'un fichier accepté ici le soit aussi là.
  const scene = deballerScene(obj);
  if (scene && Array.isArray(scene.layers) && scene.version
      && !verifierFormeScene(scene).length) {
    return 'scene';
  }

  // Un projet Atlas : sa version le nomme, ou ses couches portent les clés que
  // `buildProject` écrit (`geometryType`, `geojson`).
  if (Array.isArray(obj.layers)) {
    if (/atlas/i.test(String(obj.version || ''))) return 'projet';
    if (obj.layers.some((l) => l && typeof l === 'object' && ('geometryType' in l || 'geojson' in l))) {
      return 'projet';
    }
  }
  return null;
}

/** Ce qu'on dit d'un fichier qu'on ne sait pas ouvrir ici — jamais le silence. */
export function messageNature(nature) {
  switch (nature) {
    case 'scene':
      return 'Ce fichier est une scène publiée : Atlas l’ouvre par son adresse (?scene=), pas depuis un fichier local.';
    case 'projet':
      return 'Ce fichier est un projet Atlas : ouvrez-le avec « Ouvrir un projet ».';
    case 'geojson':
      return 'Ce fichier est un GeoJSON : il s’ajoute comme couche.';
    default:
      return 'Fichier non reconnu : ni projet Atlas, ni scène, ni GeoJSON.';
  }
}
