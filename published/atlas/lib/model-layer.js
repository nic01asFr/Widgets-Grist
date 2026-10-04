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
import { libelleFormulaire } from './fiche-formulaire.js?v=1.13.0';

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
 * « Fiche » vaut pour toute couche : en écriture quand la source est une
 * table Grist, en lecture sinon. Sans lui, retirer le placement 3D laisserait un
 * inspecteur sans aucun onglet.
 *
 * @returns {string[]} liste ordonnée, éventuellement vide (multi-sélection non 3D)
 */
/**
 * Les onglets de l'inspecteur d'objet.
 *
 * « Fiche » disparaît en sélection multiple, et c'est voulu : **on n'édite
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
/** L'onglet de placement 3D, qui n'est pas un formulaire. */
export const ONGLET_3D = 'Placement 3D';

/** L'onglet des paramètres d'un objet du catalogue (puissance, hauteur de feu…) : généré depuis le schéma de son type. */
export const ONGLET_SPECS = 'Spécifications';
/** Les attributs de l'objet, en consultation : l'onglet que « Voir la fiche » ouvre, là où seuls des formulaires ont un onglet. */
export const ONGLET_FICHE = 'Fiche';

/**
 * Les onglets de la fiche d'un objet.
 *
 * > **Un onglet par formulaire**, et `Fiche` en est un : c'est le formulaire
 * > déduit des colonnes de la table de la couche. Le tenir à part en aurait
 * > fait une exception, alors qu'il fait la même chose que les autres — rendre
 * > un FormDef. La liste des formulaires décide donc du nombre d'onglets, et
 * > l'ordre ne varie pas : le premier fait toujours la même chose.
 * >
 * > Le libellé vient de `libelleFormulaire` : un formulaire enregistré porte
 * > **son nom**, pas « Fiche » — l'afficher ainsi effacerait ce que son
 * > auteur a écrit.
 *
 * Deux exclusions, chacune pour une raison :
 *
 * - **sélection multiple hors revue** : on ne remplit pas un formulaire sur
 *   douze objets à la fois ; la revue, elle, garde un objet courant ;
 * - **le placement 3D** n'est pas un formulaire, il vient après, et seulement
 *   sur une couche de modèles.
 *
 * @param {{layer: object, formulaires?: object[], multi?: boolean, revue?: boolean}} o
 * @returns {Array<{cle: string, libelle: string, formulaire: object|null}>}
 */
export function objectInspectorTabs({ layer, formulaires = [], multi = false, revue = false, specs = false, consultation = false } = {}) {
  const tabs = [];
  if (!multi || revue) {
    for (const f of formulaires) {
      if (!f || !f.id) continue;
      tabs.push({ cle: f.id, libelle: libelleFormulaire(f), formulaire: f });
    }
  }
  // Hors édition, seuls les formulaires publiés ont un onglet : « Voir la fiche » tombait sur le formulaire de visite, le même
  // qu'ouvre « Nouvelle visite ». La fiche en consultation est un onglet à part, **après** les formulaires — celui d'un toucher
  // pour relever reste le premier. Sans formulaire, le corps de la fiche montre déjà les attributs : pas d'onglet seul.
  // Une Fiche **modifiable** (le formulaire de l'objet, proposé sur le terrain) tient déjà cette place : lui ajouter l'onglet de
  // consultation ferait deux « Fiche » côte à côte.
  const ficheDejaLa = tabs.some((t) => t.libelle === ONGLET_FICHE);
  if (consultation && (!multi || revue) && tabs.length && !ficheDejaLa) tabs.push({ cle: ONGLET_FICHE, libelle: ONGLET_FICHE, formulaire: null });
  if (isModelLayer(layer)) tabs.push({ cle: ONGLET_3D, libelle: ONGLET_3D, formulaire: null });
  // Les paramètres du type de l'objet : seulement s'il en a. Sur une sélection multiple, jamais — sauf en
  // revue, où un curseur désigne un seul objet (comme pour l'onglet des attributs).
  if (specs && (!multi || revue)) tabs.push({ cle: ONGLET_SPECS, libelle: ONGLET_SPECS, formulaire: null });
  return tabs;
}
