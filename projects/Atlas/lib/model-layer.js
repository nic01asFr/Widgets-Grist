/**
 * Couches rendues par des modèles 3D.
 *
 * Les réglages de placement (échelle, rotations, altitude, décalages) pilotent
 * une instance three.js posée sur un point : `Models3D.placement()` lit
 * `feature.geometry.coordinates` comme un couple `[lng, lat]`. Ils n'ont donc
 * aucun effet — ni aucun sens — sur une surface, une ligne ou un point rendu en
 * cercle 2D. Ce critère décide où ces réglages ont le droit d'apparaître, et où
 * ils ont le droit d'être écrits.
 */

/** La couche est-elle rendue par des modèles 3D instanciés sur des points ? */
export function isModelLayer(layer) {
  const mode = layer?.style?.mode;
  if (mode !== 'library' && mode !== 'custom') return false;
  const g = layer?.geometryType;
  return g === 'Point' || g === 'MultiPoint';
}

/**
 * Onglets de l'inspecteur d'objet.
 *
 * « Attributs » vaut pour toute couche : en écriture quand la source est une
 * table Grist, en lecture sinon. Sans lui, retirer le placement 3D laisserait un
 * inspecteur sans aucun onglet.
 *
 * @returns {string[]} liste ordonnée, éventuellement vide (multi-sélection non 3D)
 */
/**
 * Les onglets de l'inspecteur d'objet.
 *
 * « Attributs » disparaît en sélection multiple, et c'est voulu : **on n'édite
 * pas des attributs en masse**. Le corps retomberait sinon sur les valeurs d'un
 * objet arbitraire, qu'on croirait appliquer à tous.
 *
 * `revue` est le troisième cas, que le modèle n'avait pas prévu : parcourir une
 * couche objet par objet est bien une sélection multiple, mais **avec un
 * curseur**. Les attributs y portent sur l'objet courant, pas sur le groupe —
 * l'onglet revient donc, et le corps doit dire lequel il modifie.
 *
 * @param {{layer?: object, multi?: boolean, revue?: boolean}} o
 */
export function objectInspectorTabs({ layer, multi = false, revue = false } = {}) {
  const tabs = [];
  if (!multi || revue) tabs.push('Attributs');
  if (isModelLayer(layer)) tabs.push('Placement 3D');
  return tabs;
}
