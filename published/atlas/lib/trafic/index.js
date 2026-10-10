/**
 * Le moteur de trafic (`carrefour.js`, `reseau.js`, `feux.js`, `trafic.js`) comme un module.
 *
 * Les quatre fichiers sont du code « universel » (UMD) : dans un navigateur, chargés comme modules, ils se posent sur `window`
 * (`Carrefour`, `Reseau`, `Feux`, `Trafic`) dans l'ordre des imports ci-dessous ; sous Node, ils exportent par `module.exports` et
 * c'est le `default` de l'espace de noms. Ce fichier rend l'un ou l'autre sous un seul nom.
 *
 * Provenance : écrit pour Atlas à partir de principes publiés de simulation microscopique et de mesures (voir `docs/TRAFIC.md`).
 * Aucun code d'un autre projet n'y a été repris.
 */
import './carrefour.js';
import './reseau.js';
import './feux.js';
import * as moteur from './trafic.js';

/** `{ graphe, simplifier, composer, construire, creer, cheminInterne, Feux }` */
export const Trafic = globalThis.Trafic || moteur.default;
