/**
 * Frontière entre le fond de carte et les données Atlas.
 *
 * Les réglages du module Vues — bâti en volume, étiquettes — agissent sur le
 * **fond** : le bâti OpenStreetMap du style, ses libellés de rues et de villes.
 * Ils ne doivent jamais toucher aux couches de données : leur visibilité
 * appartient au panneau Couches, et à lui seul.
 *
 * La distinction se fait sur l'identifiant. Toute couche montée par Atlas est
 * préfixée `layer-` — `layer-scene-<table>` pour un import de manifeste,
 * `layer-grist-<id>` pour une table liée, `layer-<horodatage>` pour un import
 * direct — ainsi que ses habillages (`-outline`, `-pts`, `-label`, `-hit`).
 *
 * Sans ce filtre, éteindre « Bâtiments 3D » masquerait aussi une couche de bâti
 * importée depuis Grist et rendue en volume : les deux sont des
 * `fill-extrusion` aux yeux de MapLibre. Et la rallumer ferait réapparaître une
 * couche que l'utilisateur avait masquée — deux réglages se disputant la même
 * autorité.
 */

/** Préfixe porté par toute couche montée par Atlas. */
export const ATLAS_LAYER_PREFIX = 'layer-';

/** L'identifiant désigne-t-il une couche de données Atlas ? */
export function isAtlasLayerId(id) {
  return typeof id === 'string' && id.startsWith(ATLAS_LAYER_PREFIX);
}

/**
 * Identifiants des couches **du fond** d'un type donné.
 *
 * @param {Array<{id: string, type: string}>} styleLayers `map.getStyle().layers`
 * @param {string} type type MapLibre ('fill-extrusion', 'symbol'…)
 * @returns {string[]} identifiants à piloter depuis le module Vues
 */
export function basemapLayerIds(styleLayers, type) {
  return (styleLayers || [])
    .filter((l) => l && l.type === type && !isAtlasLayerId(l.id))
    .map((l) => l.id);
}

/**
 * Appelle `rappel` au premier `idle` qui suit la pose **effective** du
 * nouveau style, pas au premier `idle` tout court.
 *
 * Un style donné par URL arrive après sa requête : jusque-là la carte porte
 * l'ancien, et si une image est rendue entre-temps (une lumière, un vol, un
 * `triggerRepaint`), MapLibre émet `idle` **sur l'ancien style**. Atlas y
 * reposait son calque three.js, sa couche de nuit et le trajet, puis le
 * nouveau style arrivait : remplacé en entier, il les effaçait (plus de
 * modèles, plus de lampes, plus de nuit) ; appliqué par différence, il
 * empilait ses couches **au-dessus** d'eux (nuit et modèles tout en bas, sol
 * de jour sur des volumes de nuit). Reproduit le 24/09/2026 :
 * `setBasemap('positron')` suivi d'un seul `triggerRepaint`, et l'étape de
 * nuit du récit de la Vieille Charité (fond Positron → Liberty).
 *
 * Le nouveau style se reconnaît à sa **feuille** : `map.style.stylesheet`
 * n'est plus l'objet d'avant, que MapLibre ait recréé le style ou appliqué
 * une différence (`setState` remplace la feuille ; mesuré en 5.6.1, style par
 * URL comme par objet). Un style identique ne change pas de feuille : passé
 * `delaiMaxMs`, on rappelle quand même au premier `idle`.
 *
 * @param {{ style: { stylesheet: object }, once: (ev: string, f: Function) => void }} map
 * @param {object} feuilleAvant `map.style.stylesheet` relevé AVANT `setStyle`
 * @param {() => void} rappel
 * @param {{ delaiMaxMs?: number, maintenant?: () => number }} [o]
 */
export function quandNouveauStyle(map, feuilleAvant, rappel, o = {}) {
  const delaiMaxMs = o.delaiMaxMs ?? 5000;
  const maintenant = o.maintenant || (() => Date.now());
  const debut = maintenant();
  const surIdle = () => {
    if (map.style?.stylesheet === feuilleAvant && maintenant() - debut < delaiMaxMs) {
      map.once('idle', surIdle);
      return;
    }
    rappel();
  };
  map.once('idle', surIdle);
}
