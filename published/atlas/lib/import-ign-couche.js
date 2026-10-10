/**
 * Fabriquer la couche d'Atlas d'un import IGN : son style par défaut, sa provenance.
 *
 * `import-ign.js` décrit le style en termes déclaratifs (`styleDeCouche`) ; ce module le POSE sur la symbolisation
 * d'une couche d'Atlas. Il est pur : la couche vient de la fonction `creerCouche` que l'application fournit
 * (`makeLayer`), si bien qu'on le teste sans carte.
 *
 * ## Ce que la couche porte en plus d'une couche OpenStreetMap
 *
 * - `style.provenance` : source, jeu, licence, attribution, édition, emprise (voir `metadonneesCouche`). Rangée dans
 *   le style parce que c'est ce qu'Atlas enregistre avec le projet et avec l'apparence de la couche ;
 * - `style.heightField` (bâtiments) : le champ qui donne la hauteur d'extrusion. Posé aussi sur la couche
 *   (`heightField`) pour le rendu courant ; le style, lui, survit à un rechargement.
 */

import { metadonneesCouche, styleDeCouche } from './import-ign.js?v=1.16.2';

/**
 * Pose un style par défaut sur la symbolisation de `couche`.
 *
 * @param {object} couche une couche d'Atlas qui a déjà sa symbolisation (`makeLayer` l'initialise)
 * @param {ReturnType<typeof styleDeCouche>} style
 */
export function appliquerStyle(couche, style) {
  const sym = couche?.style?.symbolization;
  if (!sym || !sym.color || !sym.size) throw new Error('La couche n’a pas de symbolisation : elle doit sortir de makeLayer.');
  if (style.couleur.mode === 'categorized') {
    sym.color = {
      ...sym.color, mode: 'categorized', field: style.couleur.champ, defaultColor: style.couleur.defaut,
      value: style.couleur.defaut, categories: style.couleur.categories.map((c) => ({ ...c })),
    };
    couche.color = style.couleur.defaut;
  } else {
    sym.color = { ...sym.color, mode: 'single', field: null, value: style.couleur.valeur, categories: [] };
    couche.color = style.couleur.valeur;
  }
  if (style.taille?.mode === 'graduated') {
    sym.size = { ...sym.size, mode: 'graduated', field: style.taille.champ, outputRange: [...style.taille.plage], method: 'linear' };
  } else if (style.taille) {
    sym.size = { ...sym.size, mode: 'single', field: null, value: style.taille.valeur };
  }
  if (style.polygonMode) couche.style.polygonMode = style.polygonMode;
  if (style.champHauteur) {
    couche.heightField = style.champHauteur;
    couche.style.heightField = style.champHauteur;
  }
  if (style.opacite != null) sym.opacity = style.opacite;
  if (style.etiquette) sym.label = { ...sym.label, enabled: true, field: style.etiquette };
  return couche;
}

/**
 * La couche d'un import : objets normalisés, style par défaut, provenance et attribution.
 *
 * @param {object} o
 * @param {object} o.preset le jeu (`import-ign.js`)
 * @param {object[]} o.entites les objets gardés par l'import
 * @param {number[]} o.emprise
 * @param {number|null} o.estimes
 * @param {(nom: string, geometrie: string, geojson: object, categorie: null, modele: null) => object} o.creerCouche `makeLayer` d'Atlas
 * @param {Date} [o.date]
 */
export function creerCoucheIgn({ preset, entites, emprise, estimes = null, creerCouche, date = new Date() }) {
  const geojson = { type: 'FeatureCollection', features: entites };
  const couche = creerCouche(preset.nomCouche, preset.famille, geojson, null, null);
  appliquerStyle(couche, styleDeCouche(preset, entites));
  const provenance = metadonneesCouche(preset, { emprise, importes: entites.length, estimes, entites, date });
  couche.style.provenance = provenance;
  return couche;
}
