/**
 * Ce que le fond de plan de base et la carte ont de commun entre l'application (app_v7.js) et le composant carte BI (lib/bi/carte-nue.js) :
 * un seul endroit, pour que les deux démarrent la même carte.
 */

/** Le style de base d'Atlas (OpenFreeMap « Liberty »). */
export const STYLE_BASE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Le fond quand le réseau manque : un aplat. Sans lui, le style de base ne se lit jamais, la carte ne déclare jamais être
 * chargée, et les couches — qui sont sur l'appareil — ne se montent pas : une scène préparée pour le terrain s'ouvrirait sur
 * du blanc. Les glyphes restent ceux du réseau (les étiquettes manqueront, pas les données).
 */
export const STYLE_HORS_RESEAU = {
    version: 8, name: 'Hors réseau',
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {},
    layers: [{ id: 'fond-hors-reseau', type: 'background', paint: { 'background-color': '#ece7da' } }],
};

/**
 * Un fond « aucun » : un seul aplat blanc, sans source ni service tiers. Pour un hôte qui n'affiche que ses données (`base=aucune`) : la carte ne demande
 * rien à personne au démarrage. Le calque se nomme `background`, comme dans le style de base : le fond uni (`setFond('uni')`) le repeint.
 */
export const STYLE_AUCUN_FOND = {
    version: 8, name: 'Aucun fond',
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#ffffff' } }],
};

// Libellés accessibles de MapLibre (étiquettes ARIA, infobulles des contrôles) : en français, comme le reste d'Atlas ; MapLibre ignore une clé qu'il ne connaît pas.
export const LOCALE_CARTE = Object.freeze({
    'Map.Title': 'Carte',
    'AttributionControl.ToggleAttribution': 'Afficher ou masquer les crédits',
    'AttributionControl.MapFeedback': 'Signaler un problème de carte',
    'LogoControl.Title': 'Logo MapLibre',
    'NavigationControl.ZoomIn': 'Zoom avant',
    'NavigationControl.ZoomOut': 'Zoom arrière',
    'NavigationControl.ResetBearing': 'Orienter la carte vers le nord',
    'GeolocateControl.FindMyLocation': 'Afficher ma position',
    'GeolocateControl.LocationNotAvailable': 'Position indisponible',
    'FullscreenControl.Enter': 'Passer en plein écran',
    'FullscreenControl.Exit': 'Quitter le plein écran',
});
