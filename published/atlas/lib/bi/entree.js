/**
 * Point d'entrée de la page maigre du composant BI (`bi.html`) : la carte nue, puis le runtime qui s'y attache.
 * `index.html?bi=1` y mène (redirection de la page de l'application), pour qu'aucun hôte n'ait à changer d'adresse.
 */
import { creerCarteNue } from './carte-nue.js';
import { demarrer } from './montage.js?v=1.28.1';

/** Crée la carte, puis attend qu'elle soit prête et monte le composant. Rend le montage (`{ runtime, … }`, voir `lib/bi/liaison.js`). */
export async function lancer(fenetre = window) {
  creerCarteNue({ fenetre });
  return demarrer(fenetre);
}
