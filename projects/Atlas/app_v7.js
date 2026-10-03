// ============================================================
// Atlas v7 — Maquette 3D Territoriale (MapLibre + three.js)
// Interop qgis2grist : lecture Scene Manifest V0.2 + tables source.
// Fork propre depuis app_v6.js — v6 reste inchangée.
// ============================================================

import { urlSceneDepuisParam, chargerSceneExterne } from './lib/scene-externe.js?v=20260827a';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seuilDecoupe, cheminTranscodeur } from './lib/gltf-chargeur.js?v=20260919a';
import { lireCatalogue, resoudreObjet, choisirCatalogue } from './lib/catalogue-objets.js?v=20261002g';
import { idObjet, estIdObjet, typeDeIdObjet, fichesObjets, ficheDeId } from './lib/modele-id.js?v=20261002g';
import {
    descripteursDuType, proprietesEffectives, appliquerComportement, parametresDeCoucheValides, parametresDObjetValides,
    resoudreParametre, validerSaisie, avecReglageDeCouche, avecLiaison, champPropose, bilanParametre, phraseBilan,
    formaterValeur, libelleOrigine, groupesDeFamille,
} from './lib/parametres-objet.js?v=20261002g';
import { planFiger, FIGES_PAR_DEFAUT } from './lib/parametres-figer.js?v=20261002g';
import { instantScene, fuseauScene, fuseauValide, dateLocaleScene, dateValide, horlogeDepuisReglages, soleilMemorise } from './lib/horloge-scene.js?v=20260924v';
import { etatPointLumineux, heureLocale, instantLocal } from './lib/eclairage-profil.js?v=20260924v';
import { coucherLever, positionSoleil } from './lib/soleil.js?v=20260924a';
import { minutesDepuisPosition, positionDepuisMinutes, courbeHauteurs, geometrieArc, libelleHeure, minutesApresTouche } from './lib/arc-solaire.js?v=20260924a';
import { estPointLumineux, profilDuPoint, poseLuminaire, libelleEtat, detailEtat, resumerEtats, pastilleEtat, luminairesDessinables, penteAuPied, luminairesHorsScene } from './lib/eclairage-rendu.js?v=20261002g';
import { PALIERS, indicePalier, objectifImages, palierInitial, budgetDuPalier, ratioApplique, creerRegulateur } from './lib/qualite-eclairage.js?v=20260925c';
import { opaciteNuit, facteursNuit, creerCoucheNuit, estNonEclaire, couleurSousNuit, LUMIERE_BATI_NUIT, AMBIANCE_NUIT } from './lib/nuit-rendu.js?v=20260925a';
import { creerLuminaires3D, marquerPochoirModele } from './lib/luminaires-three.js?v=20261002g';
import { batimentsProches, geometrieMurs } from './lib/facades-eclairees.js?v=20260925b';
import { capacites, peutSAuthentifier } from './lib/data-client.js?v=20261001a';
import {
  detectDocMode,
  loadLatestSceneManifest,
  loadQgisWidgetConfig,
  loadSceneManifestLayers,
  materializeDeferredLayer,
  boundsFromVisibleLayers,
} from './lib/scene-loader.js?v=20261001a';
import { boundsFromGeoJSON, COLONNES_INTERNES_GRIST } from './lib/grist-rows.js?v=20261001a';
import {
  moteurDisponible, valeursPourMoteur, pontFormulaire,
  lireFormulaires, reglagesFormulaire, libelleFormulaire,
  saisieHorsEdition, formulairesPourCouche, formulairesOffertsEnLecture,
  raisonNonRetirable, formulairesEnPlace, COLONNES_ATLAS,
  gesteDEnregistrement, idFormulaireLibre,
  formDefCadre, nbChampsDef, champsDuFormulaire, champsDependants, colonnesHorsFormulaire,
  departsPossibles, LIBELLES_DEPART, valeursDeDepart, aRetenir, phrasePreremplis, moiDansTable, tableDePersonnes,
} from './lib/fiche-formulaire.js?v=20261002c';
import { chargerSchema, chargerMeta, schemaDepuisMeta, typeColonneDepuisValeurs, tablesReferencant } from './lib/schema-grist.js?v=20261002b';
import { pointFallbackZoom, centroidCollection, featureCentroid } from './lib/point-fallback.js?v=20260802a';
import { construireReseau, itineraire as calculerItineraire } from './lib/itineraire.js?v=20261002a';
import {
  stopsDepuisSeuils, seuilsDeStops, seuilsAutomatiques, inverserCouleurs, comptesParClasse, libelleClasse,
  stopsPourCarte, TRANSPARENT, COULEURS_PAR_DEFAUT,
} from './lib/classes.js?v=20261002a';
import {
  GRAPPES_DEFAUT, configGrappes, grappable, grappesActives, optionsGrappes, couleurGrappe, pireDisponible,
  zoomFormes, FILTRE_GRAPPE, FILTRE_ISOLE, RAYON_GRAPPE,
} from './lib/grappes.js?v=20261002a';
import { isModelLayer, objectInspectorTabs, ONGLET_3D, ONGLET_SPECS, ONGLET_FICHE } from './lib/model-layer.js?v=20261003a';
import {
  moveSequence, displayOrder, moveLayerInStack, insertionIndex, sortByRank,
  dropIndex, reorderByDrop, ancreAuDessus, layerGfxIds, SUFFIXES_HABILLAGE,
} from './lib/layer-order.js?v=20261001a';
import {
  candidatsReference, analyserReference, entreesReference, categoriesDepuisReference,
  expressionRang, expressionIcone, idImage, tableReferencee, champsAvecImages,
} from './lib/table-reference.js?v=20261001a';
import {
  bulleParDefaut, colonneDate, derniereLigneLiee, nombreLignesLiees, dateCourte,
  lienItineraire, modeleBulle, idsPiecesJointes,
} from './lib/bulle-objet.js?v=20261001a';
import { echapper, chaineJs, assainirTexte } from './lib/html.js?v=20261002c';
import { contextesProposes, contexteDeCle, usageDe, avecUsage, relevesDe, releveProposeDans, basculerReleve, tourneeDe, pastillesDe, pastilleOfferte } from './lib/contextes.js?v=20261003c';
import { ordonnerLeLong, rangDansTournee, voisinDansTournee, direLongueur } from './lib/tournee.js?v=20261003a';
import { SEUIL_VOLUME_M, marquerTailles, filtreVolume, filtreVaste } from './lib/volume-relief.js?v=20261002f';
import { nomDeTableLibre } from './lib/atlas-tables.js?v=20261002c';
import { champsDeLEntite, entreeObjet, listerObjets, dernieresParObjet } from './lib/objets-liste.js?v=20261003a';
import { decisionOuverture } from './lib/ouvrir-objet.js?v=20261002e';
import { creerDroits, apprendre, categorieTable, configurationEcrivable, posturesOffertes } from './lib/droits-tables.js?v=20261002f';
import { POSTURES, LIBELLES, postureDepuis, etatDePosture, postureParDefaut } from './lib/posture.js?v=20261002f';
import { nomDeFichier, versGeoJSON, versCsv, versKml, versGpx } from './lib/export-formats.js?v=20261002f';
import { lireFichier, natureFichier } from './lib/import-formats.js?v=20261002f';
import { capturerApparence, restaurerApparence, memeApparence, Historique } from './lib/historique-apparence.js?v=20261002g';
import { pasAffiche, rangParmiAffiches } from './lib/revue-selection.js?v=20261002g';
import { edgeScrollStep } from './lib/edge-scroll.js?v=20260806a';
import { basemapLayerIds, quandNouveauStyle } from './lib/basemap-layers.js?v=20260924x';
import {
  extrusionExpressions,
  paliersDemDifferents, altitudeOrigineStable, ecartAuSol,
  garderDemAuRechargement, optionsSourceGeojson, evenementMntArrive, cleAltitude,
} from './lib/terrain-base.js?v=20260925c';
import {
  loadLayerPrefs,
  clePrefsCouche,
  coucheAvecLignes,
  assurerColonneAtlas3d,
  applyLayerPrefs,
  saveLayerPref,
  parseGristBool,
  saveFeaturesToSource,
  startScenePolling,
  refreshLayerFromTable,
  ligneInventaireRequise,
  ligneInventaire,
  peutPasserEnTable,
  colonnesEcrivables,
  lignePrefs,
  ATLAS_PREFS_SCHEMA,
} from './lib/grist-sync.js?v=20261002c';
import {
  TYPES_COUCHE, LIBELLES_TYPE, planNouvelleCouche, colonneGeometrieNouvelleCouche,
  actionsNouvelleCouche, lireCreation, messageRefus,
} from './lib/nouvelle-couche.js?v=20260926a';
import {
  creationPossible, creationProposeeEnExploitation, pointDepuisClic, cellulesPourCouche, actionCreation, rowIdCree, libellePoint,
  formeValidee, libelleMesures, pointAccroche, actionInverse,
  modificationPossible, aDesAltitudes, ligneDepuisTable, cellulesDeLigne, decisionModification, actionModification,
} from './lib/saisie-objet.js?v=20261001a';
import {
  colonnesGeometrie,
  nomsColonnesGeometrie,
  rowIdsDepuisRangs,
  rangsDepuisRowIds,
  familleGeometrie,
  mesurerGeometrie,
} from './lib/geometrie-saisie.js?v=20261001a';
import {
  syncColorCategoriesFromFeatures,
  applyCategoryColorsToFeatures,
  syncFeatureColorsFromSymbolization,
  expressionCouleurDeclarative,
  applyDeclarativeToLayer,
  normalizePropertyValue,
  parsePropertyNumber,
  resolveFeaturePropertyKey,
  graduatedStops,
  recolorStops,
} from './lib/declarative-style.js?v=20261001a';
import {
  scanGeoTables,
  detectGeometryColumn,
  tableToGeoJSON,
  isLinkedTableLayer,
  formatGeometrie,
} from './lib/geo-tables.js?v=20261002c';
import {
  layerFieldNames,
  controlFieldType,
  controlUniqueValues,
  controlBounds,
  buildControlPredicate,
  filteredGeoJSON,
  expressionFiltreControles,
  filteredUniqueValues,
  fmtControlValue,
  isSelectValueChecked,
  normalizeSelectValuesForLayer,
  repairSelectControlFromManifest,
  applyStoryControlsToLayer,
  marquerControlesPublies,
  sanitizeBrokenSelectFilters,
  profilChamp,
  nombreValeursDistinctes,
  filtrableSurLaCarte,
  choixSansValeur,
  basculerValeurSelection,
  pasDuCurseur,
  valeurDuCurseur,
  MAX_VALEURS_LISTE,
} from './lib/controls.js?v=20261002a';
import {
  captureStoryState,
  saveStoryToGrist,
  chargerRecitGrist,
  assurerCles,
  storyToManifestFragment,
} from './lib/story.js?v=20261002f';
import {
  copieLineaire,
  estLineaire,
  longueurMetres,
  pointAAbscisse,
  projeter,
  placesInitiales,
  placeDepuisVue,
  ECART_VUE_TRAJET_M,
  indicesEchange,
  trierParAbscisse,
  rayonAutour,
  alertePastille,
  suiviDoitChanger,
  dureeLongeLigneMs,
  capInterpole,
  fusionnerApresPhoto,
  etatApresRecapture,
  retirerTrace,
  objetsAutour,
  objetsLeLong,
} from './lib/trajet.js?v=20260924a';
import {
  syncLayerDeclarative,
  declarativeFromAtlasLayer,
} from './lib/manifest-binding.js?v=20261003a';
import {
  cameraStorageKey as viewportCameraKey,
  shouldAutoFitInitialBounds,
  positionCameraMetres,
  distanceCameraObjet,
  cameraDeclaree,
  deplacementPourVoir,
  margesCarte,
  dureeRestante,
  moduleCedeALaFiche,
} from './lib/viewport.js?v=20260926a';
import {
  parseAtlasMode,
  resolveAccess,
  decodeAccessToken,
  initialsFrom,
  canWrite,
  shouldEnableLight3d,
  parseNo3dParam,
  parseNavbarParam,
  barreRetiree,
  pastilleRecitRequise,
  probeCanWriteDoc,
  sonderEcritureDoc,
  isWriteAclError,
} from './lib/view-mode.js?v=20260926a';
import { mettreAPlat } from './lib/vue-import.js?v=20260911a';
import { enTetesOsm, messageRefusOsm } from './lib/osm-requete.js?v=20260926a';
import { objetsPourPalette, nomObjet } from './lib/palette-objets.js?v=20260916a';
import { objetLePlusProche, direDistance, lignesReleve, distanceMetres } from './lib/releve.js?v=20260923b';
import { natureJson, messageNature } from './lib/ouvrir-fichier.js?v=20260916a';
import {
  etageCoteACote,
  margeBasseRecit,
  pastilleLocalisationRequise,
  formeBandeauInfos,
} from './lib/habillage-carte.js?v=20260911b';
import {
  createDefaultViewerControls,
  getViewerControl,
  setViewerExposed as setViewerExposedFn,
  parseViewerControls,
} from './lib/viewer-controls.js?v=20260730m';
import {
  loadScenePrefs,
  saveScenePrefs,
} from './lib/scene-prefs.js?v=20261002f';
import { ouvertureEffective, normaliserExposition, expositionVide } from './lib/exposition.js?v=20261002f';
import { cadrageEffectif, centreDesBornes } from './lib/cadrage.js?v=20261002f';

const $ = (id) => document.getElementById(id);
const deg2rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ============================================================
// CONFIG / STATE
// ============================================================
// Fonds : OpenFreeMap (vecteur, bâtiments 3D) + IGN Géoplateforme (raster FR)
const IGN = {
    plan:  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    ortho: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    // MNT LIDAR HD (GeoTIFF Float32) — décodé en TerrainRGB via le protocole ignmnt://
    mnt:   'ignmnt://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93&STYLES=&FORMAT=image/geotiff&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=512&HEIGHT=512',
};
/** Dernier niveau servi par la Géoplateforme en PM — vérifié : 404 au-delà. */
const IGN_ZOOM_MAX = 19;
/**
 * Un fond raster IGN, borné en zoom.
 *
 * **`maxzoom` n'est pas facultatif.** Sans lui, MapLibre demande des tuiles a
 * tous les niveaux : la Geoplateforme repond 404 au-dela de 19, et la carte
 * montre un TROU — un pan de vide couleur fond, au milieu de la photographie,
 * exactement la ou on vient de zoomer. Mesure le 16/09/2026 sur la cascade des
 * Aygalades : 404 sur tous les z20 et z21 demandes. Avec la borne, MapLibre
 * agrandit la derniere tuile servie ; l'image devient floue, ce qui est la
 * bonne facon de dire « il n'y a pas plus fin ».
 *
 * Meme famille que le `maxzoom` pose d'office sur les couches `xyz` d'une
 * scene (cf. CLAUDE.md) : un service qui ne sert pas un niveau ne le dit pas,
 * il refuse.
 */
function ignRasterStyle(tiles) {
    return { version: 8, glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: { 'ign': { type: 'raster', tiles: [tiles], tileSize: 256, maxzoom: IGN_ZOOM_MAX, attribution: '© IGN / Géoplateforme' } },
        layers: [{ id: 'ign-base', type: 'raster', source: 'ign' }] };
}
const BASEMAPS = {
    liberty:  { url: 'https://tiles.openfreemap.org/styles/liberty',  label: 'Liberty 3D', icon: '✨' },
    bright:   { url: 'https://tiles.openfreemap.org/styles/bright',   label: 'Plan',       icon: '🗺️' },
    positron: { url: 'https://tiles.openfreemap.org/styles/positron', label: 'Clair',      icon: '⬜' },
    'plan-ign':  { style: () => ignRasterStyle(IGN.plan),  label: 'Plan IGN',  icon: '🇫🇷' },
    'ortho-ign': { style: () => ignRasterStyle(IGN.ortho), label: 'Ortho IGN', icon: '🛰️' },
};

// Sources de relief (DEM) : terrarium mondial (sans clé) ou LIDAR HD IGN (France)
const TERRAIN_SOURCES = {
    terrarium: { label: 'Mondial (terrarium)', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: 'Terrain: Mapzen / AWS' },
    ign:       { label: 'LIDAR HD IGN (FR)', tiles: [IGN.mnt], encoding: 'mapbox', tileSize: 512, maxzoom: 16, attribution: '© IGN LIDAR HD' },
};

const CONFIG = {
    defaultCenter: [5.3740, 43.2951], // Marseille (Vieux-Port)
    defaultZoom: 16,
    defaultPitch: 55,
    defaultBearing: -18,
    grist: { ready: false },
    /**
     * La scène chargée par `?scene=`, ou null.
     *
     * Sa seule présence coupe l'accès au document : c'est la règle, et elle
     * n'a qu'un endroit (cf. docs/CADRAGE-SCENE-EXTERNE-ET-DECOUPLAGE.md §A).
     */
    sceneExterne: null,
    /** 'scene-manifest' | 'maquette' | null */
    docMode: null,
    // Un cycle recharge et reconvertit chaque table visible : à 5 s, une scène
    // d'analyse saturait l'onglet. 30 s suffisent au travail collaboratif, et le
    // rafraîchissement manuel par couche reste disponible.
    pollIntervalMs: 30000,
    /** Mode lecture (pas d'écriture Grist) — URL ?mode=view ou droits insuffisants */
    viewMode: false,
    /**
     * Cette personne peut-elle ecrire dans le document ?
     *
     * Orthogonal a `viewMode`, qui dit seulement si Atlas montre ses outils
     * d'auteur. Un lien de terrain (`?mode=view`) ouvre en lecture quelqu'un
     * qui a parfaitement le droit d'ecrire : c'est le cas que ce drapeau
     * existe pour servir. Faux par defaut — on n'ouvre l'ecriture qu'apres
     * l'avoir etabli.
     */
    peutSaisir: false,
    /** Réduit / coupe Models3D (mobile lent ou ?no3d=1) */
    light3d: false,
};

const STATE = {
    projectName: '',
    location: { name: 'Vieux-Port · Marseille', lat: 43.2951, lng: 5.3740 },
    /** Vrai quand quelqu'un a désigné le lieu (recherche, position, pointé, projet, manifeste) : sinon l'ancre suit les données. */
    locationChoisie: false,
    layers: [],
    story: [],
    /** Les choix de l'auteur sur l'exposition (lib/exposition.js) : par où la scène s'ouvre. */
    exposition: { ouverture: { mode: 'carte' } },
    /** La vignette de la scène dans la liste des projets (URL de données JPEG), et si elle reste à écrire. */
    miniature: '',
    _miniatureAEcrire: false,
    /** Ligne en mémoire, avant qu'une étape ne l'emporte dans le document. */
    trajet: null,
    viewerControls: createDefaultViewerControls(),
    selectedLayer: null,
    currentModule: null,
    selection: { mode: false, layerId: null, features: [], multiIndex: 0 },
    settings: {
        basemap: 'liberty',
        projection: 'globe',     // 'globe' (façon Google Earth, → mercator en zoom) | 'mercator'
        modelSet: 'colored',     // jeu de modèles 3D : 'colored' | 'mono'
        buildings3D: true,
        terrain3D: false,
        terrainSource: 'terrarium',
        terrainExaggeration: 1.2,
        labels: true,
        sky: true,
        timeOfDay: 870,          // minutes (14:30), heure locale DU SITE (fuseau ci-dessous)
        date: new Date(2026, 5, 15, 14, 30, 0),
        shadows: true,
        // Horloge de scène (décision 3 du contrat commun, lib/horloge-scene.js) :
        // l'heure se compose dans ce fuseau, pas dans celui du navigateur.
        fuseau: 'Europe/Paris',
        // 'AAAA-MM-JJ' quand la date est épinglée (mémorisée), sinon null.
        dateEpinglee: null,
    },
};

let map = null;
/**
 * Le style de base est-il posé ? Vrai dès `load`, faux le temps d'un
 * changement de fond. Sert de prérequis au montage des couches — voir
 * `mapStyleUsable()`.
 */
let _styleUsable = false;
let dirty = false;
let _scenePollTimer = null;
let _syncPaused = false;
/** @type {object|null} */
let _widgetConfig = null;
/** @type {object|null} */
let _sceneManifest = null;
let _inspObjTab = null; // résolu à l'ouverture selon les onglets disponibles
let _geoTables = [];
let _linkChoices = [];
/** Formulaire « Nouvelle couche » : ce qui a été saisi, les tables du document. */
const _nouvelleCouche = { nom: '', type: 'Point', tables: [], enCours: false };
let _storyIdx = 0;
let _storyPresenting = false;
let _contexteCle = null;   // clé de l'étape jouée comme contexte ; null = rien, ou le lecteur de récit
let _cibleTournee = null;  // clé du contexte dont on pose la tournée (choix d'une ligne, tracé sur un réseau) ; null = on pose le trajet du récit
let _tourneeVue = null;    // en édition : clé du contexte dont on montre la tournée sur la carte
let trajetPickMode = false;
let _trajetRemplace = false;
let _trajetSuivi = false;
let _trajetPause = false;
let _trajetAnim = 0;
let _alerteReleve = false;
let _alerteTexte = '';
let _trajetPoignees = [];
let _openDockPill = null;
// Localisation : le contrôle MapLibre reste posé (point bleu, suivi), mais son
// bouton est masqué — la pastille du dock le déclenche, sur mobile seulement.
let _geoloc = null;
/** Derniere position `[lng, lat]` donnee par la geolocalisation — pour « le plus proche ». */
let _dernierePosition = null;
let _suiviPosition = false;
let _sunArcDragging = false;
let _preStorySnapshot = null;
let _preStoryOrder = null;
let _preStorySettings = null;
let _persistStoryTimer = null;
let _cameraSaveTimer = null;
let _initialViewportApplied = false;

function cameraStorageKey() {
    return viewportCameraKey(STATE.projectName, CONFIG.docMode);
}

function computeLayersBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let any = false;
    for (const layer of STATE.layers) {
        const b = boundsFromGeoJSON(layer.geojson);
        if (!b) continue;
        minX = Math.min(minX, b[0][0]); minY = Math.min(minY, b[0][1]);
        maxX = Math.max(maxX, b[1][0]); maxY = Math.max(maxY, b[1][1]);
        any = true;
    }
    return any ? [[minX, minY], [maxX, maxY]] : null;
}

function markDirty() {
    if (CONFIG.viewMode) return;
    dirty = true;
    _syncPaused = true;
    $('app-header').classList.add('dirty');
    planifierEnregistrementAuto();
}

/**
 * Tout ce qui était en attente vient d'être écrit : la synchronisation reprend.
 *
 * `markDirty` suspend la relecture des tables pour ne pas écraser une saisie
 * locale. L'enregistrement de l'apparence effaçait bien l'état « modifié » mais
 * laissait la pause : après un seul réglage, Atlas cessait de refléter les
 * changements faits dans Grist jusqu'au rechargement du widget.
 */
function marquerEnregistre() {
    dirty = false;
    _syncPaused = false;
    $('app-header')?.classList.remove('dirty');
    _enregEtat = 'propre';
    majIndicateurEnregistrement();
}

// ============================================================
// ENREGISTREMENT AUTOMATIQUE, ANNULER / RÉTABLIR
// ============================================================
/**
 * L'apparence d'une couche s'enregistre seule, un instant après le dernier réglage. Ce qui s'enregistre est ce que
 * « Enregistrer l'apparence » écrirait (les préférences de la couche) : les couches **copiées** (des entités détenues par
 * Atlas, sans table) ne s'écrivent pas seules, parce que les écrire c'est réécrire leurs entités.
 *
 * Chaque enregistrement est un pas de l'historique (`lib/historique-apparence.js`) : « Annuler » remet l'instantané d'avant,
 * « Rétablir » celui d'après. Des modifications **pas encore enregistrées** s'annulent d'abord, sans rien écrire : on
 * revient au dernier état enregistré.
 */
const _historique = new Historique();
let _enregEtat = 'propre';          // propre | modifie | envoi | erreur
let _enregDernier = null;
let _enregTimer = null;
let _enregOccupe = false;
let _enregRelancer = false;
const AUTO_CLE = 'atlas_autosave';
const DELAI_ENREG_AUTO_MS = 2500;

function autoActif() { try { return localStorage.getItem(AUTO_CLE) !== '0'; } catch (_) { return true; } }
function poserAuto(actif) {
    try { localStorage.setItem(AUTO_CLE, actif ? '1' : '0'); } catch (_) { /* le choix ne sera pas retenu */ }
    if (actif && _enregEtat === 'modifie') planifierEnregistrementAuto();
    else majIndicateurEnregistrement();
}
const cleHistorique = (l) => clePrefsCouche(l) || l.id;
/** Peut-on écrire l'apparence, ici et maintenant ? */
function peutEnregistrerAuto() { return !!CONFIG.grist.ready && !CONFIG.viewMode && !_storyPresenting; }
/** Les couches dont l'apparence s'écrit seule : celles qui ont une clé de préférences. */
function couchesAuto() { return STATE.layers.filter((l) => clePrefsCouche(l)); }
/** Ce qui est enregistré pour cette couche, tel qu'on vient de le lire ou de l'écrire. */
function baselineApparence(layer) { if (clePrefsCouche(layer)) layer._apparence = capturerApparence(layer); }

function majIndicateurEnregistrement() {
    const b = $('btn-enreg');
    if (!b) return;
    const visible = !!CONFIG.grist.ready && !CONFIG.viewMode;
    b.hidden = !visible;
    if (!visible) return;
    const auto = autoActif();
    const textes = { propre: 'Enregistré', modifie: auto ? 'Modifié…' : 'Non enregistré', envoi: 'Enregistrement…', erreur: 'Échec · réessayer' };
    b.dataset.etat = _enregEtat;
    b.querySelector('.enreg-lib').textContent = textes[_enregEtat];
    const quand = _enregDernier ? ' · ' + new Date(_enregDernier).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    b.title = _enregEtat === 'propre' ? `Tout est enregistré${quand}` : textes[_enregEtat] + (auto ? '' : ' — enregistrement automatique désactivé');
    b.setAttribute('aria-label', b.title);
    majBoutonsAnnuler();
}

let _majBoutonsTimer = null;
function majBoutonsAnnuler() {
    clearTimeout(_majBoutonsTimer);
    _majBoutonsTimer = setTimeout(() => {
        const visible = !!CONFIG.grist.ready && !CONFIG.viewMode;
        const un = $('btn-annuler'); const re = $('btn-retablir');
        if (un) { un.hidden = !visible; un.disabled = !(_enregEtat !== 'propre' || _historique.peutAnnuler()); }
        if (re) { re.hidden = !visible; re.disabled = !_historique.peutRetablir() || _enregEtat === 'modifie' || _enregEtat === 'erreur'; }
    }, 60);
}

function planifierEnregistrementAuto() {
    if (!peutEnregistrerAuto()) return;
    _enregEtat = 'modifie';
    majIndicateurEnregistrement();
    if (!autoActif()) return;
    clearTimeout(_enregTimer);
    _enregTimer = setTimeout(() => { enregistrerAuto(); }, DELAI_ENREG_AUTO_MS);
}

/** Écrit l'apparence des couches qui ont changé depuis le dernier enregistrement. */
async function enregistrerAuto() {
    clearTimeout(_enregTimer);
    if (!peutEnregistrerAuto()) return;
    if (_enregOccupe) { _enregRelancer = true; return; }
    _enregOccupe = true;
    _enregEtat = 'envoi';
    majIndicateurEnregistrement();
    let echec = false;
    try {
        for (const layer of couchesAuto()) {
            const snap = capturerApparence(layer);
            const base = layer._apparence;
            if (!base) { layer._apparence = snap; continue; }
            if (memeApparence(base, snap)) continue;
            try {
                const ok = await saveLayerToGrist(layer, true, { lancer: true });
                if (!ok) throw new Error('écriture non faite');
                _historique.enregistrer(cleHistorique(layer), base, snap);
                layer._apparence = snap;
            } catch (e) { echec = true; console.warn('[Atlas] enregistrement automatique', e?.message || e); }
        }
    } finally { _enregOccupe = false; }
    if (!echec) {
        _enregDernier = Date.now();
        marquerEnregistre();
    } else {
        _enregEtat = 'erreur';
        majIndicateurEnregistrement();
    }
    if (_enregRelancer) { _enregRelancer = false; enregistrerAuto(); }
}

/** Repeint une couche dont on vient de remettre l'apparence. */
function repeindreApparence(l) {
    initSymbolization(l);
    repeindreEntites(l);
    applyLayerStyle(l);
    if (l.controls?.length) applyControls(l);
    syncLayerToMapState(l);
    reconcilePanelVisibilityToMap();
    applyLayerOrder();
    Models3D.scheduleBuild();
    updateLegend();
    renderInspector();
    refreshLayersPanelIfOpen();
    refreshControlsDock();
}

/** Des modifications pas encore enregistrées : on revient au dernier état enregistré, sans rien écrire. */
function annulerBrouillon() {
    let n = 0;
    for (const l of couchesAuto()) {
        if (l._apparence && !memeApparence(l._apparence, capturerApparence(l))) {
            restaurerApparence(l, l._apparence);
            repeindreApparence(l);
            n++;
        }
    }
    return n;
}

async function appliquerPas(pas, cote) {
    const layer = STATE.layers.find((l) => cleHistorique(l) === pas.cle);
    if (!layer) { showToast('Cette couche n’existe plus', 'warning'); return false; }
    restaurerApparence(layer, pas[cote]);
    repeindreApparence(layer);
    try {
        const ok = await saveLayerToGrist(layer, true, { lancer: true });
        if (!ok) throw new Error('écriture non faite');
        layer._apparence = pas[cote];
        _enregDernier = Date.now();
        marquerEnregistre();
    } catch (e) {
        _enregEtat = 'erreur';
        majIndicateurEnregistrement();
        showToast('Non enregistré : ' + (e?.message || e), 'error');
        return false;
    }
    return true;
}

async function annulerApparence() {
    if (!peutEnregistrerAuto()) return;
    clearTimeout(_enregTimer);
    if (annulerBrouillon()) {
        marquerEnregistre();
        showToast('Modifications non enregistrées annulées', 'info');
        return;
    }
    const pas = _historique.annuler();
    if (!pas) { showToast('Rien à annuler', 'info'); majBoutonsAnnuler(); return; }
    const nom = STATE.layers.find((l) => cleHistorique(l) === pas.cle)?.name || '';
    if (await appliquerPas(pas, 'avant')) showToast(`Annulé${nom ? ' · ' + nom : ''}`, 'info');
}

async function retablirApparence() {
    if (!peutEnregistrerAuto()) return;
    // Des modifications non enregistrées passent avant : les rétablir par-dessus les écraserait.
    if (_enregEtat === 'modifie' || _enregEtat === 'erreur') { showToast('Des modifications ne sont pas enregistrées : annulez-les ou enregistrez-les d’abord', 'warning'); return; }
    const pas = _historique.retablir();
    if (!pas) { showToast('Rien à rétablir', 'info'); majBoutonsAnnuler(); return; }
    const nom = STATE.layers.find((l) => cleHistorique(l) === pas.cle)?.name || '';
    if (await appliquerPas(pas, 'apres')) showToast(`Rétabli${nom ? ' · ' + nom : ''}`, 'info');
}

function fermerPanneauEnreg() {
    document.getElementById('panneau-enreg')?.remove();
    document.removeEventListener('pointerdown', _fermeturePanneauEnreg, true);
    document.removeEventListener('keydown', _touchePanneauEnreg, true);
}
function _fermeturePanneauEnreg(e) { if (!e.target.closest?.('#panneau-enreg, #btn-enreg')) fermerPanneauEnreg(); }
function _touchePanneauEnreg(e) { if (e.key === 'Escape') { e.stopPropagation(); fermerPanneauEnreg(); } }

/** Le réglage de l'enregistrement automatique, et l'enregistrement immédiat. */
function ouvrirPanneauEnreg(ancre) {
    if (document.getElementById('panneau-enreg')) { fermerPanneauEnreg(); return; }
    const p = document.createElement('div');
    p.id = 'panneau-enreg';
    p.className = 'posture-menu panneau-enreg';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'Enregistrement');
    const auto = autoActif();
    p.innerHTML = `<div class="posture-titre">Enregistrement</div>
        <label class="enreg-reglage"><input type="checkbox" id="enreg-auto" ${auto ? 'checked' : ''}>
            <span>Enregistrer automatiquement<small>L’apparence des couches s’écrit dans le document 2 s après le dernier réglage. Les couches copiées (sans table) s’enregistrent par « Enregistrer l’apparence ».</small></span></label>
        <button type="button" class="btn btn-soft btn-full" id="enreg-maintenant">Enregistrer maintenant</button>`;
    document.body.appendChild(p);
    p.querySelector('#enreg-auto').onchange = (e) => poserAuto(e.target.checked);
    p.querySelector('#enreg-maintenant').onclick = () => { fermerPanneauEnreg(); enregistrerAuto(); };
    if (ancre && !surTelephone()) {
        const r = ancre.getBoundingClientRect();
        p.style.top = `${Math.min(r.bottom + 8, window.innerHeight - p.offsetHeight - 12)}px`;
        p.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - p.offsetWidth - 12))}px`;
    } else { p.classList.add('posture-feuille'); }
    document.addEventListener('pointerdown', _fermeturePanneauEnreg, true);
    document.addEventListener('keydown', _touchePanneauEnreg, true);
}

/**
 * Les réglages d'apparence ne passent pas tous par `markDirty` : beaucoup ne font que repeindre. On regarde donc **après chaque
 * geste dans les panneaux** (couleur, forme, contrôles, visibilité, ordre) si une couche enregistrée diffère de son dernier état
 * enregistré — une comparaison de signatures, sans écrire. Une seule vérification par rafale de gestes.
 */
let _surveillanceTimer = null;
function surveillerApparence() {
    if (!peutEnregistrerAuto() || _enregOccupe) return;
    for (const l of couchesAuto()) {
        const base = l._apparence;
        if (!base) { baselineApparence(l); continue; }
        if (!memeApparence(base, capturerApparence(l))) { planifierEnregistrementAuto(); return; }
    }
}
for (const type of ['input', 'change', 'click', 'pointerup']) {
    document.addEventListener(type, (e) => {
        if (!e.target.closest?.('#module-panel, #insp-main, #map-controls-dock')) return;
        clearTimeout(_surveillanceTimer);
        _surveillanceTimer = setTimeout(surveillerApparence, 400);
    }, true);
}

// Ctrl/Cmd+Z annule, Ctrl/Cmd+Maj+Z ou Ctrl+Y rétablit — sauf dans un champ de saisie, qui garde le sien.
document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = String(e.key).toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    const c = e.target;
    if (c && (c.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(c.tagName))) return;
    if (!peutEnregistrerAuto()) return;
    e.preventDefault();
    if (k === 'y' || e.shiftKey) retablirApparence(); else annulerApparence();
});

// ============================================================
// PALETTES
// ============================================================
const COLOR_PALETTES = {
    Tableau10: ['#4e79a7','#f28e2c','#e15759','#76b7b2','#59a14f','#edc949','#af7aa1','#ff9da7','#9c755f','#bab0ab'],
    Set2: ['#66c2a5','#fc8d62','#8da0cb','#e78ac3','#a6d854','#ffd92f','#e5c494','#b3b3b3'],
    Verts: ['#E8F0D0','#B9D183','#7AB04A','#4A8331','#1E5219'],
    Bleus: ['#DEEBF7','#9ECAE1','#4292C6','#08519C','#08306B'],
    Oranges: ['#FFEDDA','#FDAE6B','#F16913','#A63603','#7F2704'],
    Viridis: ['#440154','#3e4a89','#26828e','#35b779','#6ece58','#b5de2b','#fde725'],
    YlOrRd: ['#ffffcc','#ffeda0','#fed976','#feb24c','#fc4e2a','#e31a1c','#800026'],
    RdYlGn: ['#d73027','#fdae61','#fee08b','#d9ef8b','#66bd63','#1a9850'],
};
const PALETTE_INFO = {
    Tableau10: { type: 'qualitative', name: 'Tableau 10' },
    Set2: { type: 'qualitative', name: 'Set 2' },
    Verts: { type: 'sequential', name: 'Verts' },
    Bleus: { type: 'sequential', name: 'Bleus' },
    Oranges: { type: 'sequential', name: 'Oranges' },
    Viridis: { type: 'sequential', name: 'Viridis' },
    YlOrRd: { type: 'sequential', name: 'Jaune-Rouge' },
    RdYlGn: { type: 'divergent', name: 'Rouge-Vert' },
};

// ============================================================
// BIBLIOTHÈQUE DE MODÈLES 3D
// ============================================================
// Catalogue 3D genere dans le repo (scripts/generate-models.js) et publie SOUS
// LE WIDGET, `published/atlas/models/`, depuis qu'il y a ete co-localise.
// Servi via GitHub Pages. Deux sets de style : 'colored' | 'mono'. Modeles en metres (scale 1).
//
// Le defaut a longtemps pointe vers `/Widgets-Grist/models/`, reste du temps ou
// le catalogue vivait a la racine — un chemin qui renvoie 404 depuis le
// deplacement. En ligne, la sonde `./models/` rattrapait l'erreur puisque le
// widget est servi depuis `/atlas/` ; hors de ce cas, aucun modele ne chargeait.
const MODEL_LIBRARY = {
    baseRoot: 'https://nic01asfr.github.io/Widgets-Grist/atlas/models/',
    set: 'colored',
    get baseUrl() { return this.baseRoot + this.set + '/'; },
    categories: {
        lighting: { icon: '💡', name: 'Éclairage', models: [
            { id: 'streetlamp', name: 'Lampadaire', icon: '🏮', file: 'Streetlamp.glb', scale: 1 },
            { id: 'streetlamp_double', name: 'Lampadaire double', icon: '🏮', file: 'StreetlampDouble.glb', scale: 1 },
            { id: 'lantern', name: 'Lanterne', icon: '🏮', file: 'Lantern.glb', scale: 1 },
            { id: 'lampball', name: 'Lampe boule', icon: '💡', file: 'Lampball.glb', scale: 1 },
            { id: 'wall_light', name: 'Applique', icon: '🔆', file: 'WallLight.glb', scale: 1 },
            { id: 'projector', name: 'Projecteur', icon: '🔦', file: 'Projector.glb', scale: 1 },
        ]},
        furniture: { icon: '🪑', name: 'Mobilier urbain', models: [
            { id: 'bench', name: 'Banc', icon: '🪑', file: 'Bench.glb', scale: 1 },
            { id: 'bench_simple', name: 'Banc simple', icon: '🪑', file: 'BenchSimple.glb', scale: 1 },
            { id: 'picnic_table', name: 'Table pique-nique', icon: '🪵', file: 'PicnicTable.glb', scale: 1 },
            { id: 'trashcan', name: 'Poubelle', icon: '🗑️', file: 'Trashcan.glb', scale: 1 },
            { id: 'bus_shelter', name: 'Abri bus', icon: '🚏', file: 'BusShelter.glb', scale: 1 },
            { id: 'bike_rack', name: 'Arceau vélo', icon: '🚲', file: 'BikeRack.glb', scale: 1 },
            { id: 'planter', name: 'Jardinière', icon: '🪴', file: 'Planter.glb', scale: 1 },
            { id: 'fountain', name: 'Fontaine', icon: '⛲', file: 'Fountain.glb', scale: 1 },
            { id: 'ev_charger', name: 'Borne recharge', icon: '⚡', file: 'EvCharger.glb', scale: 1 },
        ]},
        vegetation: { icon: '🌳', name: 'Végétation', models: [
            { id: 'tree_deciduous', name: 'Arbre feuillu', icon: '🌳', file: 'TreeDeciduous.glb', scale: 1 },
            { id: 'tree_conifer', name: 'Conifère', icon: '🌲', file: 'TreeConifer.glb', scale: 1 },
            { id: 'tree_palm', name: 'Palmier', icon: '🌴', file: 'TreePalm.glb', scale: 1 },
            { id: 'bush', name: 'Buisson', icon: '🌿', file: 'Bush.glb', scale: 1 },
            { id: 'hedge', name: 'Haie', icon: '🌳', file: 'Hedge.glb', scale: 1 },
            { id: 'flowerbed', name: 'Parterre fleuri', icon: '🌷', file: 'Flowerbed.glb', scale: 1 },
        ]},
        signalization: { icon: '🚦', name: 'Signalisation', models: [
            { id: 'traffic_light', name: 'Feu tricolore', icon: '🚦', file: 'TrafficLight.glb', scale: 1 },
            { id: 'stop_sign', name: 'Panneau stop', icon: '🛑', file: 'StopSign.glb', scale: 1 },
            { id: 'directional_sign', name: 'Panneau directionnel', icon: '🪧', file: 'DirectionalSign.glb', scale: 1 },
            { id: 'bollard', name: 'Potelet', icon: '🔶', file: 'Bollard.glb', scale: 1 },
            { id: 'barrier', name: 'Barrière', icon: '🚧', file: 'Barrier.glb', scale: 1 },
        ]},
        infrastructure: { icon: '🚧', name: 'Infrastructure', models: [
            { id: 'guardrail', name: 'Glissière', icon: '🚧', file: 'Guardrail.glb', scale: 1 },
            { id: 'stone_bollard', name: 'Borne béton', icon: '🪨', file: 'StoneBollard.glb', scale: 1 },
            { id: 'pole', name: 'Poteau', icon: '🔲', file: 'Pole.glb', scale: 1 },
            { id: 'fire_hydrant', name: 'Borne incendie', icon: '🧯', file: 'FireHydrant.glb', scale: 1 },
            { id: 'manhole', name: 'Regard', icon: '⚫', file: 'Manhole.glb', scale: 1 },
        ]},
        vehicles: { icon: '🚗', name: 'Véhicules', models: [
            { id: 'car', name: 'Voiture', icon: '🚗', file: 'Car.glb', scale: 1 },
            { id: 'van', name: 'Camionnette', icon: '🚐', file: 'Van.glb', scale: 1 },
            { id: 'bus', name: 'Bus', icon: '🚌', file: 'Bus.glb', scale: 1 },
            { id: 'bicycle', name: 'Vélo', icon: '🚲', file: 'Bicycle.glb', scale: 1 },
            { id: 'scooter', name: 'Trottinette', icon: '🛴', file: 'Scooter.glb', scale: 1 },
            { id: 'pedestrian', name: 'Piéton', icon: '🚶', file: 'Pedestrian.glb', scale: 1 },
        ]},
    },
};
// URL des modèles : override explicite (?models= / localStorage) sinon défaut
// GitHub Pages. probeLocalModels() (appelé à l'init) teste des chemins locaux et
// bascule dessus s'ils répondent — utile en dev avant déploiement gh-pages.
let MODEL_BASE_EXPLICIT = false;
(function () {
    try {
        // Application installee : le catalogue est embarque dans le paquet, et
        // c'est le seul chemin valable — aucun CDN n'est joignable hors reseau.
        if (typeof window !== 'undefined' && window.__ATLAS_MODELES__) {
            MODEL_LIBRARY.baseRoot = String(window.__ATLAS_MODELES__).replace(/\/+$/, '') + '/';
            MODEL_BASE_EXPLICIT = true;
            return;
        }
        const qp = new URLSearchParams(location.search).get('models');
        if (qp) { MODEL_LIBRARY.baseRoot = qp.replace(/\/+$/, '') + '/'; MODEL_BASE_EXPLICIT = true; return; }
        const ls = localStorage.getItem('atlas_model_base');
        if (ls) { MODEL_LIBRARY.baseRoot = ls.replace(/\/+$/, '') + '/'; MODEL_BASE_EXPLICIT = true; }
    } catch (e) {}
})();
async function probeLocalModels() {
    if (MODEL_BASE_EXPLICIT) return;
    const cands = [];
    try {
        // **Le cas publie d'abord** : les modeles sont a cote du widget. L'ordre
        // etait inverse, et le premier candidat — un chemin de developpement —
        // laissait un 404 dans la console de qui ouvre la scene EN LIGNE. Une
        // erreur reelle a cote d'une erreur normale ne se remarque plus.
        cands.push(new URL('./models/', location.href).href);
        // Depuis `projects/Atlas/`, avec la racine du repo servie : le seul
        // chemin qui permette d'essayer les modeles 3D en developpement local.
        cands.push(new URL('../../published/atlas/models/', location.href).href);
        cands.push(new URL('../models/', location.href).href);
        cands.push(new URL('../../published/models/', location.href).href); // ancien emplacement
    } catch (e) { return; }
    for (const base of cands) {
        try {
            const r = await fetch(base + 'catalog.json', { cache: 'no-store' });
            // **On s'arrête au premier qui répond, même si c'est déjà la base
            // par défaut.** Sinon la sonde continuait : en ligne, `./models/`
            // EST la base par défaut, la condition ne retenait pas, et le
            // candidat suivant — un chemin de développement — laissait un 404
            // dans la console de qui ouvre la scène publiée.
            if (!r.ok) continue;
            if (base !== MODEL_LIBRARY.baseRoot) {
                MODEL_LIBRARY.baseRoot = base;
                Models3D.gltfCache.clear(); Models3D.protoCache.clear(); Models3D.scheduleBuild();
                console.log('🧩 Atlas — modèles 3D servis localement :', base);
            }
            return;
        } catch (e) {}
    }
    console.log('🧩 Atlas — base modèles (défaut) :', MODEL_LIBRARY.baseUrl, '— aucun chemin local trouvé. Sers la racine du repo, ou règle la source dans le module Modèles.');
}
// ============================================================
// CATALOGUE D'OBJETS PARAMETRIQUES (atlas-objets/0.1)
// ============================================================
/**
 * Un catalogue d'objets generes (vegetation d'abord), POINTE par son URL.
 *
 * Contrat : `pix2hdr/docs/SPEC-ATLAS-OBJETS-0.1.md`, lecture pure dans
 * `lib/catalogue-objets.js`. Il ne remplace pas le catalogue low-poly : celui-ci
 * reste le repli (hors ligne, echec de chargement, licence refusee). Une couche
 * s'y soumet par l'affectation « Catalogue » de l'onglet Modele 3D ; toute autre
 * affectation est un choix manuel, qui l'emporte (spec §3.1).
 *
 * Source : `?objets=<url>`, sinon le dernier catalogue pointe sur ce poste,
 * sinon le catalogue livre avec Atlas (`objets/`, les luminaires EclExt
 * d'abord) — `choisirCatalogue`.
 */
const CATALOGUE_OBJETS = { url: null, cat: null, etat: 'aucun', erreur: null, origine: null };

function urlCatalogueObjetsInitiale() {
    let parametre = null, memorise = null;
    try { parametre = new URLSearchParams(location.search).get('objets'); } catch (_) {}
    try { memorise = localStorage.getItem('atlas_catalogue_objets'); } catch (_) {}
    const choix = choisirCatalogue({ parametre, memorise });
    CATALOGUE_OBJETS.origine = choix.origine;
    return choix.url;
}
/** L'URL du fichier : un dossier designe son `catalog.json`. */
function urlFichierCatalogue(url) {
    const u = String(url || '').trim();
    return !u || /\.json(\?|#|$)/i.test(u) ? u : u.replace(/\/*$/, '/') + 'catalog.json';
}
async function chargerCatalogueObjets(url) {
    const fichier = urlFichierCatalogue(url);
    Object.assign(CATALOGUE_OBJETS, { url: fichier || null, cat: null, erreur: null, etat: fichier ? 'chargement' : 'aucun' });
    if (fichier) {
        try {
            const r = await fetch(fichier, { cache: 'no-store' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const cat = lireCatalogue(await r.json(), r.url || fichier);
            if (!cat.schema) throw new Error('aucun bloc « parametric » atlas-objets/0.x');
            Object.assign(CATALOGUE_OBJETS, { cat, etat: 'pret' });
        } catch (e) {
            // Pas de repli silencieux : l'etat s'affiche dans le module Modeles.
            Object.assign(CATALOGUE_OBJETS, { etat: 'erreur', erreur: e.message });
            console.warn('Catalogue d\'objets illisible :', fichier, e.message);
        }
    }
    // Toujours apres un `await` au premier appel : `Models3D` est alors defini.
    Models3D.scheduleBuild();
}
/**
 * Contexte public (spec §3.8) : page hors Grist et hors application connectee.
 * Un fichier `usage: internal` y est refuse au profit du repli low-poly.
 */
function contextePublic() {
    try { return capacites().mode !== 'grist' && !peutSAuthentifier(); } catch (_) { return true; }
}
/**
 * D'ou vient une couche (spec §3.2) : la source est une propriete de la
 * COUCHE, l'objet ne le dit pas.
 */
function sourceDeCouche(layer) {
    if (layer.sourceTable) return { source: 'grist', nom: layer.sourceTable };
    const tn = typeof layer.geojson === 'string' && /[?&]typeNames?=BDTOPO_V3:([^&]+)/i.exec(layer.geojson);
    if (tn) return { source: 'bdtopo', nom: decodeURIComponent(tn[1]) };
    if ((layer.geojson?.features || []).some((f) => f.properties?._osmId)) return { source: 'osm', nom: layer.name };
    return { source: 'fichier', nom: layer.name };
}
/** La couche confie-t-elle le choix de ses modeles au catalogue ? */
function coucheAuCatalogue(layer) {
    return layer?.style?.mode === 'library' && layer.style.symbolization?.model?.mode === 'catalogue';
}
/**
 * Un type du catalogue d'objets est-il en jeu sur cette couche : affectation « Catalogue », ou
 * identifiant `objet:<type>` au niveau de la couche, d'une categorie ou du repli par champ ?
 * (Un `_modelId` d'objet se lit objet par objet, dans `resolutionCatalogue`.)
 */
function coucheUtiliseObjets(layer) {
    if (!CATALOGUE_OBJETS.cat || layer?.style?.mode !== 'library') return false;
    if (coucheAuCatalogue(layer)) return true;
    if (estIdObjet(layer.style.library?.modelId)) return true;
    const m = layer.style.symbolization?.model;
    return !!m && m.mode === 'categorized'
        && (estIdObjet(m.defaultModelId) || (m.categories || []).some((c) => estIdObjet(c.modelId)));
}
/**
 * Le modele d'un objet d'une couche « Catalogue », ou `null` si le catalogue
 * n'en dit rien. `resolveFeatureProps` fournit les reglages manuels que la spec
 * compose avec le tirage (§5) : echelle multipliee, azimut ajoute. Dans Atlas,
 * l'azimut est `rotationZ` (curseur « Rotation Z (azimut) ») ; `placement()` le
 * pose sur l'axe vertical de three.js.
 */
function resolutionCatalogue(layer, feature, distanceM) {
    if (!CATALOGUE_OBJETS.cat) return null;
    // Deux facons de designer un type du catalogue :
    //  - l'identifiant `objet:<type>` (couche, categorie, ou `_modelId` d'un objet) IMPOSE le type ;
    //  - l'affectation « Catalogue » le DEDUIT des champs de l'objet.
    // Un modele pose a la main sur l'objet (`_modelId`) l'emporte sur l'affectation de la couche.
    const propre = feature?.properties?._modelId;
    let typeId = null;
    if (propre) {
        typeId = typeDeIdObjet(propre);
        if (!typeId) return null;                      // un modele low-poly pose a la main
    } else {
        if (!coucheUtiliseObjets(layer)) return null;
        if (!coucheAuCatalogue(layer)) {
            typeId = typeDeIdObjet(modelIdDeEntite(feature, layer));
            if (!typeId) return null;                  // categorie low-poly d'une couche mixte
        }
    }
    const p = resolveFeatureProps(feature, layer);
    const res = resoudreEntite(layer, feature, {
        ...(typeId ? { typeId } : {}),
        set: MODEL_LIBRARY.set,
        distanceM,
        public: contextePublic(),
        echelleCouche: p.scale || 1,
        rotationCoucheDeg: p.rotationZ || 0,
    });
    // `props` : les propriétés effectives, que la pose lit (hauteur de feu, azimut).
    return res ? { ...res.r, props: res.props } : null;
}
/**
 * Une texture KTX2 n'est chargee, transcodee et televersee au GPU QU'UNE FOIS,
 * meme si vingt modeles la citent.
 *
 * Les catalogues d'objets PARTAGENT leurs textures : les GLB ne les embarquent
 * plus, ils les designent par une adresse relative (`../textures/…`). Sans ce
 * cache, le gain se perd a l'arrivee — mesure le 20/09/2026 sur le catalogue de
 * vegetation v2 : 42 requetes pour 12 fichiers, soit chaque texture chargee et
 * televersee quatre fois. GLTFLoader appelle le chargeur une fois par modele et
 * ne sait rien des autres ; c'est donc ici qu'on se souvient.
 *
 * On rend le MEME objet `Texture` a tout le monde : ce qu'en fait ensuite
 * GLTFLoader (nom, `flipY`, espace colorimetrique) ne depend que du fichier,
 * donc chaque modele y ecrit la meme chose.
 */
function partagerTextures(chargeur) {
    const cache = new Map();
    const charger = chargeur.load.bind(chargeur);
    chargeur.load = (url, onLoad, onProgress, onError) => {
        let p = cache.get(url);
        if (!p) {
            p = new Promise((ok, ko) => charger(url, ok, undefined, ko));
            cache.set(url, p);
        }
        p.then((t) => onLoad?.(t), (e) => { cache.delete(url); onError?.(e); });
        return null;   // GLTFLoader n'utilise pas la valeur de retour
    };
}

/**
 * Distance camera → objet, en metres, pour le niveau de detail (spec §7).
 * Le relief est ignore : a ces seuils (40 m, 200 m), l'ecart ne change pas le
 * niveau retenu hors cas limites.
 */
function distanceCamera(cam, lng, lat) {
    return distanceCameraObjet(cam, lng, lat);
}

/**
 * La camera en longitude, latitude et hauteur (m), ou `null`.
 * MapLibre 5.6.1 n'a pas `getFreeCameraOptions` : l'appel rendait `undefined`
 * et le niveau de detail du catalogue restait a 0 (mesure le 24/09/2026).
 */
function cameraMetres() {
    const t = map?.transform;
    const ll = t?.getCameraLngLat?.();
    if (!ll) return null;
    return positionCameraMetres({
        lngCamera: ll.lng, latCamera: ll.lat, cameraToCenterDistance: t.cameraToCenterDistance,
        zoom: map.getZoom(), pitchDeg: map.getPitch(), latCentre: map.getCenter().lat,
    });
}
chargerCatalogueObjets(urlCatalogueObjetsInitiale());

function allModels() {
    const out = [];
    for (const [catId, cat] of Object.entries(MODEL_LIBRARY.categories))
        for (const m of cat.models) out.push({ ...m, category: catId, url: MODEL_LIBRARY.baseUrl + m.file });
    return out;
}
/**
 * Un modele de la bibliotheque low-poly, OU un type du catalogue d'objets realistes.
 *
 * L'identifiant dit la famille (`lib/modele-id.js`) : `streetlamp` est low-poly,
 * `objet:applique_facade` est un type du catalogue. Les deux se presentent sous la meme forme
 * pour que chipe de couche, listes et legende n'aient pas a distinguer ; seul un objet du
 * catalogue porte `objet: true` et n'a pas d'`url` (le fichier se choisit par objet).
 */
function findModel(id) {
    if (estIdObjet(id)) return modeleObjet(ficheDeId(CATALOGUE_OBJETS.cat, id));
    return allModels().find((m) => m.id === id) || null;
}
function modeleObjet(fiche) {
    if (!fiche) return null;
    return {
        id: fiche.id, name: fiche.nom, icon: MODEL_LIBRARY.categories[fiche.categorie]?.icon || '',
        category: 'objets', objet: true, fiche, url: null, scale: 1,
    };
}
/** Les types du catalogue d'objets pointe, prets a etre proposes (vide tant qu'il n'est pas charge). */
function modelesObjets() { return fichesObjets(CATALOGUE_OBJETS.cat).map(modeleObjet); }
/** Ce que l'interface montre pour un identifiant de modele, connu ou non. */
function libelleModele(id) {
    if (!id) return { icon: '', label: 'aucun modèle', connu: false };
    const m = findModel(id);
    if (m) return { icon: m.icon || '', label: m.name, connu: true, objet: !!m.objet };
    if (estIdObjet(id)) {
        const attente = CATALOGUE_OBJETS.etat === 'chargement' || CATALOGUE_OBJETS.etat === 'aucun';
        return { icon: '', label: attente ? `objet « ${typeDeIdObjet(id)} » (catalogue en chargement)` : `objet « ${typeDeIdObjet(id)} » absent du catalogue`, connu: false, objet: true };
    }
    return { icon: '', label: id, connu: false };
}
/** Les <option> d'un choix de modele : la bibliotheque, puis les objets realistes. */
function optionsModeles(selId, { objets = true } = {}) {
    const ligne = (mm) => `<option value="${mm.id}" ${selId === mm.id ? 'selected' : ''}>${mm.icon} ${mm.name}</option>`;
    const objs = objets ? modelesObjets() : [];
    if (!objs.length) return allModels().map(ligne).join('');
    return `<optgroup label="Bibliothèque">${allModels().map(ligne).join('')}</optgroup><optgroup label="Objets réalistes">${objs.map(ligne).join('')}</optgroup>`;
}

// ============================================================
// OSM PRESETS
// ============================================================
const OSM_PRESETS = {
    lighting:        { name: 'Éclairage', icon: '🏮', category: 'lighting', model: 'streetlamp', query: 'node["highway"="street_lamp"]' },
    trees:           { name: 'Arbres', icon: '🌳', category: 'vegetation', model: 'tree_deciduous', query: 'node["natural"="tree"]' },
    benches:         { name: 'Bancs', icon: '🪑', category: 'furniture', model: 'bench', query: 'node["amenity"="bench"]' },
    waste:           { name: 'Poubelles', icon: '🗑️', category: 'furniture', model: 'trashcan', query: 'node["amenity"="waste_basket"]' },
    traffic_signals: { name: 'Feux', icon: '🚦', category: 'signalization', model: 'traffic_light', query: 'node["highway"="traffic_signals"]' },
    bus_stops:       { name: 'Arrêts bus', icon: '🚏', category: 'furniture', model: 'bus_shelter', query: 'node["highway"="bus_stop"]' },
    bicycle_parking: { name: 'Vélos', icon: '🚲', category: 'furniture', model: 'bike_rack', query: 'node["amenity"="bicycle_parking"]' },
    bollards:        { name: 'Bornes', icon: '🔶', category: 'infrastructure', model: 'bollard', query: 'node["barrier"="bollard"]' },
    roads:           { name: 'Voirie', icon: '🛤️', geomType: 'LineString', query: 'way["highway"~"primary|secondary|tertiary|residential|unclassified"]' },
    buildings:       { name: 'Bâtiments', icon: '🏢', geomType: 'Polygon', query: 'way["building"]' },
};

// ============================================================
// SYMBOLISATION — helpers (expressions compatibles MapLibre)
// ============================================================
function getUniqueValues(layer, field, max = 100) {
    const propKey = resolveFeaturePropertyKey(layer, field);
    const counts = new Map();
    (layer.geojson?.features || []).forEach((f) => {
        const key = normalizePropertyValue(f.properties?.[propKey]);
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count).slice(0, max);
}
function getNumericRange(layer, field) {
    const propKey = resolveFeaturePropertyKey(layer, field);
    let min = Infinity, max = -Infinity, count = 0;
    (layer.geojson?.features || []).forEach((f) => {
        const v = parsePropertyNumber(f.properties?.[propKey]);
        if (!Number.isFinite(v)) return;
        min = Math.min(min, v); max = Math.max(max, v); count++;
    });
    if (!count) return { min: 0, max: 100, count: 0 };
    return { min, max, count };
}
/**
 * Types Grist qui portent un nombre.
 *
 * `gType` vient du manifeste (`fields[].gType`) : c'est ce que la colonne EST,
 * pas ce que ses valeurs ont l'air d'etre. Il fait donc autorite sur l'echantillon
 * — et il repond meme quand il n'y a aucune entite a echantillonner.
 */
const G_TYPES_NUMERIQUES = new Set(['Numeric', 'Int', 'Integer', 'Any']);

function detectFieldType(layer, field) {
    const declare = (layer?._fields || []).find((f) => f.name === field || f.label === field);
    if (declare?.gType && declare.gType !== 'Any') {
        return G_TYPES_NUMERIQUES.has(declare.gType) ? 'numeric' : 'text';
    }
    const propKey = resolveFeaturePropertyKey(layer, field);
    let num = 0, total = 0;
    (layer.geojson?.features || []).slice(0, 200).forEach((f) => {
        const v = f.properties?.[propKey];
        if (v == null) return; total++;
        if (Number.isFinite(parsePropertyNumber(v))) num++;
    });
    if (!total) {
        // Aucune entite ici. « text » serait un verdict, alors qu'on n'a rien
        // regarde — et il ferait disparaitre le champ des choix d'une
        // symbologie graduee. Le style declaratif, lui, dit sur quel champ il
        // gradue : c'est une mesure, donc un nombre.
        const decl = layer?._declarative;
        if (decl?.kind === 'graduated' && (decl.field === field)) return 'numeric';
        const ctl = (layer?.controls || []).find((c) => c.field === field);
        if (ctl && (ctl.type === 'range' || ctl.type === 'time')) return 'numeric';
        return 'text';
    }
    return num / total > 0.7 ? 'numeric' : 'text';
}

/** Palette séquentielle pour gradué → _fill_color. */
function sequentialPaletteForSym(sym, layer) {
    // Un style déclaratif énonce ses propres couleurs de classes : les ignorer
    // au profit d'une rampe nommée effacerait la symbologie voulue par le récit
    // ou par le manifest.
    const stops = layer?._declarative?.stops;
    if (stops?.length) {
        const hex = stops.map((s) => s.color).filter(Boolean);
        if (hex.length) return hex;
    }
    const name = sym.colorRamp || sym.palette || 'Viridis';
    return paletteEn(name, sym.inverse);
}

/**
 * Repeint les entités après un réglage de couleur fait dans le panneau.
 *
 * Une couche déclarative se peint d'abord par le `_fill_color` de chaque
 * entité (`layerPaintColor`). Le panneau changeait la symbologie — la légende
 * suivait — mais seules les couches qgis2grist recevaient leurs nouvelles
 * couleurs : les autres restaient de l'ancienne teinte jusqu'au rechargement.
 * Les récits, eux, repeignaient déjà (`applyStoryLayerMeta`).
 *
 * La source n'est renvoyée à MapLibre que si une couleur a changé : une
 * épaisseur ou une taille ne coûte pas un `setData` de toute la couche.
 */
function repeindreEntites(layer) {
    const feats = layer?.geojson?.features;
    if (!feats?.length) return;
    if (layer.source !== 'qgis2grist' && !layer._declarative) return;
    const avant = feats.map((f) => f.properties?._fill_color);
    syncFeatureColorsFromSymbolization(layer, sequentialPaletteForSym(initSymbolization(layer).color, layer));
    if (feats.some((f, i) => f.properties?._fill_color !== avant[i])) syncLayerSourceData(layer);
}

/** Sync GeoJSON + retourne expression paint couleur (qgis2grist lit _fill_color). */
function layerPaintColor(layer) {
    // `_fill_color` porte la couleur calculée par le style déclaratif ou par la
    // symbolisation. Le critère est sa présence, pas l'origine de la couche :
    // une table Grist stylée par un récit doit se peindre comme un import.
    if (layer.source === 'qgis2grist' || layer._declarative) {
        const sym = initSymbolization(layer).color;
        const fb = sym.value || sym.defaultColor || layer.color || '#808080';
        // `_fill_color` garde la priorité : c'est ce qu'écrit la symbolisation
        // choisie dans l'interface, et l'utilisateur prime sur le manifest.
        // Derrière, l'expression déclarative plutôt qu'une couleur unique — sans
        // elle, une couche dont on ne détient pas les entités (URL, tuiles)
        // n'aurait aucun `_fill_color` et se peindrait d'un seul ton, sans que
        // rien ne le signale.
        const declaratif = expressionCouleurDeclarative(
            layer._declarative, fb, layer._fields || null
        );
        return ['coalesce', ['get', '_fill_color'], declaratif || fb];
    }
    return colorExpression(layer, layer.color);
}

/**
 * Opacité de peinture d'une couche.
 * Une opacité fixée par l'utilisateur l'emporte ; sinon on suit l'opacité
 * portée par l'entité (issue des stops du style déclaratif), et à défaut le
 * défaut de la géométrie.
 */
function layerPaintOpacity(layer) {
    const sym = initSymbolization(layer);
    if (Number.isFinite(sym.opacity)) return sym.opacity;
    return ['coalesce', ['get', '_fill_opacity'], defaultLayerOpacity(layer)];
}

/**
 * Persiste l'apparence d'une couche decrite par le manifeste (no-op hors Grist
 * / mode lecture).
 *
 * La garde portait sur `source === 'qgis2grist'`, donc sur les seules couches
 * lues dans une table. Regler l'apparence d'une couche **distante** ne
 * s'enregistrait nulle part, et sortait **en silence** : le reglage etait perdu
 * au rechargement, sans message.
 */
function saveLayerPrefIfSynced(layer) {
    if (!clePrefsCouche(layer) || !CONFIG.grist.ready) return;
    if (_storyPresenting) return;   // l'apparence affichée est celle de l'étape
    saveLayerPref(grist.docApi, layer, { viewMode: CONFIG.viewMode })
        .catch((e) => console.warn('[Atlas] préférences de couche non enregistrées —', e?.message || e));
}

/** Contour d'une surface : largeur, couleur (suit le remplissage ou fixe). */
function layerStrokePaint(layer) {
    const st = initSymbolization(layer).stroke || {};
    return {
        width: st.enabled === false ? 0 : (Number.isFinite(st.width) ? st.width : 1.5),
        color: st.mode === 'fixed' ? (st.color || layer.color)
            : st.mode === 'regle' ? couleurContourRegle(layer, st)
                : layerPaintColor(layer),
    };
}

/** La couleur d'un contour qui suit un champ : les classes de la règle, transparentes quand elles n'ont pas de couleur. */
function couleurContourRegle(layer, st) {
    const regle = st.regle;
    if (!regle?.field || !regle.stops?.length) return TRANSPARENT;
    return expressionCouleurDeclarative(
        { kind: 'graduated', field: regle.field, stops: stopsPourCarte(regle.stops) }, TRANSPARENT, layer._fields || null,
    ) || TRANSPARENT;
}

/**
 * Filtrer une couche qu'Atlas ne détient pas.
 *
 * Impossible de retrancher des entités qu'on n'a pas : on décrit à MapLibre ce
 * qu'il doit garder. L'habillage suit le remplissage — contour, étiquettes,
 * zone de clic, repli en points —, sinon on verrait le contour d'un bâtiment
 * que le filtre vient d'écarter, et on pourrait encore cliquer dessus.
 */
function appliquerFiltreDistant(layer) {
    if (!map || !layer?._distant) return;
    const expr = expressionFiltreControles(layer);
    for (const sfx of SUFFIXES_HABILLAGE) {
        const id = layer.id + sfx;
        if (!map.getLayer(id)) continue;
        // `null` retire le filtre : c'est le bon geste quand plus rien n'est actif.
        try { map.setFilter(id, expr); }
        catch (e) { console.warn('[Atlas] filtre non appliqué sur', id, '—', e.message); }
    }
}

function syncLayerSourceData(layer) {
    // Une couche distante n'a pas de données à remplacer ici : MapLibre les
    // tient. Son filtrage passe par une expression, pas par un retranchement.
    if (layer._raster) return;   // pas d'entites : rien a filtrer ni a remplacer
    if (layer._distant) { appliquerFiltreDistant(layer); return; }
    if (!map?.getSource(layer.id)) return;
    const data = sourceData(layer);
    map.getSource(layer.id).setData(data);
    // Les centres suivent le même filtrage que les surfaces.
    const pts = map.getSource(pointFallbackId(layer));
    if (pts) pts.setData(centroidCollection(data));
    const grappes = map.getSource(layer.id + '-grappes');
    if (grappes) grappes.setData(centroidCollection(data));
}
function getLayerFields(layer) {
    if (layer._fields?.length) {
        return layer._fields.map((f) => ({
            id: f.name,
            label: f.label || f.name,
            type: detectFieldType(layer, f.name),
        }));
    }
    const keys = new Set();
    (layer.geojson?.features || []).slice(0, 200).forEach((f) => {
        if (f.properties) Object.keys(f.properties).forEach((k) => { if (!k.startsWith('_')) keys.add(k); });
    });
    if (!keys.size) {
        // Pas d'entites a inspecter : la scene nomme quand meme les champs
        // dont elle se sert — celui de la symbologie, ceux des controles. Une
        // liste vide laisserait l'inspecteur proposer « — Champ — » et rien
        // d'autre, donc rendrait la couche insymbolisable.
        const decl = layer?._declarative;
        if (decl?.field) keys.add(decl.field);
        for (const c of (layer?.controls || [])) if (c?.field) keys.add(c.field);
    }
    return Array.from(keys).sort().map((k) => ({ id: k, type: detectFieldType(layer, k) }));
}
/** Une palette, éventuellement retournée : le plus foncé devient le plus clair, la première classe la dernière. */
function paletteEn(name, inverse, repli = 'Viridis') {
    const p = COLOR_PALETTES[name] || COLOR_PALETTES[repli];
    return inverse ? [...p].reverse() : p;
}
function paletteColor(name, i, total, inverse = false) {
    const p = paletteEn(name, inverse, 'Tableau10');
    if (PALETTE_INFO[name]?.type === 'qualitative') return p[i % p.length];
    // sequential/divergent: spread across palette
    const idx = total <= 1 ? 0 : Math.round((i / (total - 1)) * (p.length - 1));
    return p[clamp(idx, 0, p.length - 1)];
}
function fieldExpr(field) {
  return ['to-string', ['coalesce', ['at', 0, ['get', field]], ['get', field]]];
}
function buildColorMatch(field, categories, def) {
    const expr = ['match', fieldExpr(field)];
    const seen = new Set();
    categories.forEach((c) => { const k = String(c.value); if (!seen.has(k)) { seen.add(k); expr.push(k, c.color); } });
    expr.push(def || '#999999');
    return expr;
}
function transformedValueExpr(field, method) {
    if (method === 'log') return ['ln', ['+', ['to-number', ['get', field]], 1]];
    if (method === 'sqrt') return ['sqrt', ['to-number', ['get', field]]];
    return ['to-number', ['get', field]];
}
function transformedBounds(range, method) {
    if (method === 'log') return [Math.log(range[0] + 1), Math.log(range[1] + 1)];
    if (method === 'sqrt') return [Math.sqrt(range[0]), Math.sqrt(range[1])];
    return [range[0], range[1]];
}
function buildColorGraduated(field, range, palette, method, inverse = false) {
    const p = paletteEn(palette, inverse);
    const [inMin, inMax] = transformedBounds(range, method);
    const expr = ['interpolate', ['linear'], transformedValueExpr(field, method)];
    const step = (inMax - inMin) / (p.length - 1) || 1;
    p.forEach((c, i) => expr.push(inMin + step * i, c));
    return expr;
}
function buildNumGraduated(field, range, outRange, method) {
    const [inMin, inMax] = transformedBounds(range, method);
    return ['interpolate', ['linear'], transformedValueExpr(field, method), inMin, outRange[0], inMax, outRange[1]];
}
function interpolateValue(value, range, outRange, method) {
    let v = parseFloat(value); if (isNaN(v)) return outRange[0];
    let [inMin, inMax] = transformedBounds(range, method);
    if (method === 'log') v = Math.log(v + 1); else if (method === 'sqrt') v = Math.sqrt(v);
    const r = clamp((v - inMin) / ((inMax - inMin) || 1), 0, 1);
    return outRange[0] + r * (outRange[1] - outRange[0]);
}

/**
 * Opacité de rendu par défaut, selon la géométrie et le mode surfacique.
 *
 * **Un volume est opaque, et ce n'est pas un goût.** `fill-extrusion-opacity`
 * sous 1 fait basculer MapLibre en rendu transparent : il cesse d'écrire la
 * profondeur, et l'occlusion est perdue. Chaque bloc laisse alors voir sa face
 * arrière au travers de sa face avant — un double contour sur chaque objet —,
 * les recouvrements s'assombrissent par accumulation d'alpha, et deux couches
 * extrudées se traversent au lieu de se masquer. Sur une grille d'analyse dense,
 * le relief de l'information disparaît dans une bouillie.
 *
 * Le basculement est **binaire** : mesuré à 0,999, 0,99 et 0,95, l'artefact est
 * déjà là — seule son intensité suit l'opacité. Il n'y a donc pas de « presque
 * opaque » utilisable, et le défaut d'un volume ne peut être que 1.
 *
 * À plat, c'est l'inverse : la semi-transparence laisse lire le fond de carte
 * sous la donnée, et MapLibre drape sans problème de profondeur. D'où 0,55.
 *
 * Une opacité explicitement choisie reste respectée — on peut vouloir voir au
 * travers, en connaissance de cause.
 */
function defaultLayerOpacity(layer) {
    const g = layer.geometryType;
    if (g === 'Point' || g === 'MultiPoint') return 0.92;
    if (g === 'Polygon' || g === 'MultiPolygon') {
        return layer.style?.polygonMode === 'flat' ? 0.55 : 1;
    }
    return 0.9;
}

function initSymbolization(layer) {
    if (!layer.style) layer.style = {};
    if (!layer.style.symbolization) {
        layer.style.symbolization = {
            color: { mode: 'single', field: null, value: layer.color, palette: 'Tableau10', colorRamp: 'Viridis', categories: [], defaultColor: '#999999', method: 'linear' },
            size: { mode: 'single', field: null, value: layer.geometryType === 'Point' ? 8 : (layer.geometryType === 'Polygon' ? 12 : 4), outputRange: [4, 24], method: 'linear' },
            model: { mode: 'single', field: null, categories: [], defaultModelId: null },
            label: { enabled: false, field: null },
        };
    }
    const sym = layer.style.symbolization;
    // Réglages d'apparence introduits après coup : complétés ici pour que les
    // couches déjà enregistrées dans Atlas_LayerPrefs les reçoivent aussi.
    // `opacity: null` = suivre le défaut de la géométrie (ou l'opacité du style
    // déclaratif) ; une valeur numérique = choix explicite de l'utilisateur.
    if (!('opacity' in sym)) sym.opacity = null;
    if (!sym.stroke) {
        sym.stroke = { enabled: true, mode: 'follow', color: null, width: 1.5 };
    }
    if (!sym.extrusion) sym.extrusion = { base: 0 };
    // Icône par valeur d'un champ (onglet Icône, table de référence) : aucune
    // par défaut.
    if (!sym.icon) sym.icon = { mode: 'none', field: null, taille: 40 };
    // Comme `stroke` et `extrusion` : cree s'il manque, pas seulement complete.
    // Une couche enregistree avant l'arrivee des etiquettes — ou restauree
    // depuis une etape de recit anterieure, `applyStoryLayerMeta` remplacant
    // toute la symbolisation — arrivait sans `label`, et l'onglet Etiquette
    // lisait alors `undefined.enabled`.
    if (!sym.label) sym.label = { enabled: false, field: null };
    // Étiquette déclarée par le manifeste (`style.label`) : reprise ici, une
    // seule fois, quand la symbolisation n'en porte pas encore. Après quoi
    // c'est le réglage de la couche qui fait foi — sans quoi un manifeste
    // rejouerait sa valeur à chaque passage et empêcherait de la modifier.
    if (!sym.label.field && layer.style.label?.field) {
        sym.label = { ...sym.label, ...layer.style.label };
    }
    // Même règle pour la catégorisation de modèles : reprise du manifeste une
    // seule fois, tant que la couche n'a pas la sienne. Ensuite c'est le réglage
    // de l'utilisateur qui fait foi.
    if (sym.model && sym.model.mode !== 'categorized' && sym.model.mode !== 'catalogue' && layer.style.model?.field) {
        sym.model = { ...sym.model, ...layer.style.model };
    }
    if (sym.label.size == null) sym.label.size = 12;
    if (!sym.label.color) sym.label.color = '#2D2820';
    return sym;
}

// ============================================================
// AMBIANCE — soleil + lune (jour/crépuscule/nuit), inspiré EclExt
// ============================================================
function _lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }
function _lerpHex(c1, c2, t) {
    t = clamp(t, 0, 1);
    return '#' + [0, 1, 2].map((i) => Math.round(c1[i] + (c2[i] - c1[i]) * t).toString(16).padStart(2, '0')).join('');
}
function computeMoon(date, lat, lng) {
    if (typeof SunCalc === 'undefined') return null;
    try {
        const pos = SunCalc.getMoonPosition(date, lat, lng);
        const illum = SunCalc.getMoonIllumination(date);
        const altDeg = pos.altitude * 180 / Math.PI;
        const azDeg = ((pos.azimuth * 180 / Math.PI) + 180) % 360;
        let altFactor = altDeg > 0 ? Math.sin(altDeg * Math.PI / 180) * (altDeg < 20 ? altDeg / 20 : 1) : 0;
        const distFactor = Math.pow(384400 / (pos.distance || 384400), 2);
        const moonIntensity = Math.min(1, illum.fraction * altFactor * distFactor / 0.4);
        return { altDeg, azDeg, fraction: illum.fraction, phase: illum.phase, isUp: altDeg > 0, moonIntensity };
    } catch (e) { return null; }
}
// Renvoie les paramètres d'ambiance pour une altitude solaire donnée
function computeAmbient(altDeg, moon) {
    const DAY = [255, 255, 255], GOLD = [255, 210, 140], TWIL = [120, 110, 150];
    let sunColor, sunIntensity, ambientColor, ambientIntensity, mapColor, mapIntensity, sky, horizon;
    if (altDeg > 8) { sunColor = '#ffffff'; sunIntensity = 2.0; ambientColor = '#f3ecd9'; ambientIntensity = 1.0; mapColor = '#ffffff'; mapIntensity = 0.55; sky = '#aacbe8'; horizon = '#f3ecd9'; }
    else if (altDeg > 0) { const t = altDeg / 8; sunColor = _lerpHex(GOLD, DAY, t); sunIntensity = _lerp(1.2, 2.0, t); ambientColor = _lerpHex(GOLD, [243, 236, 217], t); ambientIntensity = _lerp(0.8, 1.0, t); mapColor = _lerpHex(GOLD, DAY, t); mapIntensity = _lerp(0.4, 0.55, t); sky = _lerpHex([230, 150, 90], [170, 203, 232], t); horizon = '#f0c89a'; }
    else if (altDeg > -6) { const t = (altDeg + 6) / 6; sunColor = _lerpHex(TWIL, GOLD, t); sunIntensity = _lerp(0.4, 1.2, t); ambientColor = _lerpHex([60, 60, 95], GOLD, t); ambientIntensity = _lerp(0.45, 0.8, t); mapColor = _lerpHex(LUMIERE_BATI_NUIT, GOLD, t); mapIntensity = _lerp(0.3, 0.4, t); sky = _lerpHex([60, 55, 90], [230, 150, 90], t); horizon = _lerpHex([70, 60, 95], [240, 200, 154], t); }
    else { const t = clamp((altDeg + 18) / 12, 0, 1); sunColor = '#1a2030'; sunIntensity = _lerp(0.06, 0.4, t); ambientColor = _lerpHex(AMBIANCE_NUIT, [60, 60, 95], t); ambientIntensity = _lerp(0.22, 0.45, t); mapColor = _lerpHex(LUMIERE_BATI_NUIT, LUMIERE_BATI_NUIT, t); mapIntensity = _lerp(0.16, 0.3, t); sky = _lerpHex([8, 11, 28], [60, 55, 90], t); horizon = _lerpHex([14, 18, 42], [70, 60, 95], t); }
    let hemiIntensity = clamp(0.2 + (altDeg + 6) / 40, 0.12, 0.55);
    // Apport lunaire la nuit
    if (moon && altDeg < -2 && moon.isUp && moon.moonIntensity > 0.05) {
        const mi = moon.moonIntensity;
        ambientIntensity += mi * 0.22; mapIntensity += mi * 0.12; hemiIntensity += mi * 0.15;
        ambientColor = _lerpHex([parseInt(ambientColor.slice(1, 3), 16), parseInt(ambientColor.slice(3, 5), 16), parseInt(ambientColor.slice(5, 7), 16)], [120, 140, 190], Math.min(0.5, mi * 0.5));
    }
    return { sunColor, sunIntensity, ambientColor, ambientIntensity, hemiIntensity, mapColor, mapIntensity, sky, horizon };
}

// ============================================================
// PROTOCOLE ignmnt:// — décodage MNT IGN (GeoTIFF Float32 → TerrainRGB)
// dans un pool de Web Workers (hors thread principal). Pool créé à la
// première utilisation (évite le coût si le relief IGN n'est pas activé).
// ============================================================
let _ignDemPool = null;
/** Dernière altitude moyenne décodée — repli d'une tuile MNT en échec. */
let _altitudeRepli = null;
function ignDemPool() {
    if (_ignDemPool) return _ignDemPool;
    const src = `
        self.importScripts('https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js');
        self.onmessage = async (e) => {
            const { id, buffer } = e.data;
            try {
                const tiff = await GeoTIFF.fromArrayBuffer(buffer);
                const image = await tiff.getImage();
                const rasters = await image.readRasters();
                const w = image.getWidth(), h = image.getHeight(), elev = rasters[0];
                const rgba = new Uint8ClampedArray(w*h*4);
                for (let i=0;i<elev.length;i++){ let v=elev[i]; if(!isFinite(v)||v<-500||v>9000)v=0; const enc=Math.round((v+10000)/0.1); rgba[i*4]=(enc>>16)&255; rgba[i*4+1]=(enc>>8)&255; rgba[i*4+2]=enc&255; rgba[i*4+3]=255; }
                let somme = 0, n = 0;
                for (let i=0;i<elev.length;i+=37){ const v=elev[i]; if(isFinite(v)&&v>-500&&v<9000){ somme+=v; n++; } }
                const c = new OffscreenCanvas(w,h); c.getContext('2d').putImageData(new ImageData(rgba,w,h),0,0);
                const b = await c.convertToBlob({type:'image/png'}); const out = new Uint8Array(await b.arrayBuffer());
                self.postMessage({ id, ok:true, data: out, moyenne: n ? somme/n : null }, [out.buffer]);
            } catch(err) { self.postMessage({ id, ok:false, error: String(err && err.message || err) }); }
        };`;
    const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
    const N = Math.min(3, navigator.hardwareConcurrency || 2);
    const workers = []; const pending = new Map(); let seq = 0, rr = 0;
    for (let i = 0; i < N; i++) {
        const w = new Worker(url);
        w.onmessage = (e) => {
            const p = pending.get(e.data.id);
            if (!p) return;
            pending.delete(e.data.id);
            // L'altitude moyenne de la dernière tuile lue sert de repli quand
            // une autre échoue : un palier au bon étage, au lieu d'une dalle au
            // niveau de la mer.
            if (e.data.ok && Number.isFinite(e.data.moyenne)) _altitudeRepli = e.data.moyenne;
            e.data.ok ? p.resolve(e.data.data) : p.reject(new Error(e.data.error));
        };
        workers.push(w);
    }
    _ignDemPool = { decode(buf) { return new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); workers[rr++ % N].postMessage({ id, buffer: buf }, [buf]); }); } };
    return _ignDemPool;
}
/**
 * Une tuile MNT plate, à l'altitude donnée.
 *
 * Repli quand la Géoplateforme refuse une tuile après nos reprises. **Elle vaut
 * la dernière altitude lue, pas zéro** : une dalle au niveau de la mer donnait
 * une falaise au bord du vide, et l'on croyait la donnée fausse. Un palier au
 * bon étage se remarque à peine, et se corrige à la tuile suivante.
 *
 * Pourquoi ne pas simplement échouer : MapLibre garde alors un état incohérent
 * dans son cache de tuiles (`_updateRetainedTiles` lève sur `tile.key`), et le
 * rendu s'arrête. Mesuré : 36 exceptions en jouant les huit étapes.
 * **Motif réexaminé le 25/09/2026** : ces exceptions venaient des sources
 * GeoJSON (corrigé par `optionsSourceGeojson`), pas du MNT ; et ce repli
 * dresse un mur plat quand une tuile basse résolution échoue. Choix à
 * arbitrer (docs/etudes-relief/VERIFICATION-RELIEF.md).
 */
let _paliers = new Map();
async function tuilePlate(alt) {
    const clef = Math.round(alt);
    if (_paliers.has(clef)) return _paliers.get(clef);
    // **512, la taille que la source déclare** (`TERRAIN_SOURCES.ign`). Le repli
    // d'origine en rendait 256 : MapLibre refusait la tuile sur « dem dimension
    // mismatch », donc le repli lui-même échouait — silencieusement.
    const size = TERRAIN_SOURCES.ign.tileSize;
    const rgba = new Uint8ClampedArray(size * size * 4);
    const enc = Math.round((clef + 10000) / 0.1);
    for (let i = 0; i < size * size; i++) {
        rgba[i * 4] = (enc >> 16) & 255;
        rgba[i * 4 + 1] = (enc >> 8) & 255;
        rgba[i * 4 + 2] = enc & 255;
        rgba[i * 4 + 3] = 255;
    }
    const c = new OffscreenCanvas(size, size);
    c.getContext('2d').putImageData(new ImageData(rgba, size, size), 0, 0);
    const png = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    if (_paliers.size > 40) _paliers = new Map();
    _paliers.set(clef, png);
    return png;
}

(function registerIGNTerrain() {
    if (typeof maplibregl === 'undefined' || typeof OffscreenCanvas === 'undefined') return;
    maplibregl.addProtocol('ignmnt', async (params, abort) => {
        const url = 'https://' + params.url.replace('ignmnt://', '');
        const lire = async () => {
            const r = await fetch(url, { signal: abort.signal, headers: { 'Accept': 'image/tiff, image/geotiff' } });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const buf = await r.arrayBuffer();
            const hd = new Uint8Array(buf, 0, 4);
            const isTiff = (hd[0] === 0x49 && hd[1] === 0x49) || (hd[0] === 0x4D && hd[1] === 0x4D);
            if (!isTiff || buf.byteLength < 100) throw new Error('réponse non TIFF');
            return { data: await ignDemPool().decode(buf) };
        };
        // Le service rend des 502 par intermittence quand les tuiles partent en
        // rafale — mesuré sur le vallon des Aygalades, 11 tuiles sur 35 au
        // premier essai. Deux reprises espacées suffisent.
        for (let essai = 0; essai < 3; essai++) {
            try {
                return await lire();
            } catch (e) {
                if (abort.signal.aborted) throw e;
                if (essai === 2) {
                    // **Jamais zéro.** Le repli d'origine posait la tuile
                    // manquante au niveau de la mer : le relief voisin se
                    // terminait en falaise sur du vide, et l'on accusait la
                    // donnée. On rend un palier à la dernière altitude lue, et
                    // on le dit dans la console.
                    console.warn('[Atlas relief] tuile MNT IGN indisponible :', e.message);
                    return { data: await tuilePlate(_altitudeRepli ?? 0) };
                }
                await new Promise((r) => setTimeout(r, 250 * (essai + 1)));
            }
        }
        return { data: await tuilePlate(_altitudeRepli ?? 0) };
    });
})();

// ============================================================
// MODÈLES 3D — custom layer three.js, rendu InstancedMesh
// (moteur inspiré d'EclExt : origine locale, instancing, fast-path
//  d'édition, culling viewport, placement sur le relief)
// ============================================================
const MAX_3D_INSTANCES = 20000;       // plafond élevé grâce à l'instancing
const MODEL3D_ZOOM_GATE = 11;          // sous ce zoom on cache la 3D si beaucoup d'objets
/** Zoom auquel MapLibre a fini de passer du globe au plan (mesure : 0 px d'ecart des z12). */
const GLOBE_MERCATOR_ZOOM = 12;
const MODEL3D_GATE_COUNT = 4000;
const SHADOW_FEATURE_CAP = 1500;       // ombres portées réelles seulement sous ce nombre d'objets visibles
const EXTRUSION_SHADOW_CAP = 650;      // casters d'ombre pour bâti extrudé MapLibre (hors GLB)

/** Ecart d'altitude a l'origine au-dela duquel la scene 3D est recalculee, en metres. */
const DERIVE_ORIGINE_M = 0.5;

/** Palier de zoom du dernier echantillonnage du relief, et son minuteur. */
let _palierDemCale = null;
let _recalageTimer = null;
/** Regroupe l'arrivee des tuiles MNT : elles tombent par dizaines, un seul recalage suffit. */
let _tuilesDemTimer = null;

const Models3D = {
    layerId: 'three-models-3d',
    scene: null, camera: null, renderer: null,
    gltfCache: new Map(),   // url -> Promise<THREE.Group|null>
    protoCache: new Map(),  // url -> [{geometry, material, mat}] | null
    groups: new Map(),      // url -> { meshes:[{im, protoMat}], items:[{layerId, idx, lng, lat}] }
    slotIndex: new Map(),   // `${layerId}:${idx}` -> { url, slot }
    extrusionShadows: [],   // Mesh[] — casters invisibles pour bâti fill-extrusion
    origin: null, originMC: null, originScale: 1, originElev: 0,
    elevCache: new Map(),
    sunDir: new THREE.Vector3(0.4, 0.7, 0.4).normalize(),
    dirLight: null, ambLight: null, hemiLight: null, groundShadow: null, _shadowFeasible: false,
    _buildTimer: null, _cullTimer: null, _driftTimer: null, _lastOriginElev: undefined,
    _wCanvas: 0, _hCanvas: 0,   // derniere taille de canvas appliquee au renderer
    _m4Origin: new THREE.Matrix4(), _m4VP: new THREE.Matrix4(),
    _mRotX: new THREE.Matrix4().makeRotationX(Math.PI / 2),
    _vScale: new THREE.Vector3(), _obj: new THREE.Object3D(), _m4: new THREE.Matrix4(),
    _cNuit: new THREE.Color(1, 1, 1),

    scheduleBuild() { clearTimeout(this._buildTimer); this._buildTimer = setTimeout(() => this.build(), 60); },
    forceBuild() { clearTimeout(this._buildTimer); this._buildTimer = null; this.build(); }, // rebuild immédiat (changement de modèle)
    // alias rétro-compat (anciens appels)
    rebuildScene() { this.build(); },
    scheduleRebuild() { this.scheduleBuild(); },

    /**
     * Centre lumière + taille du frustum d'ombre sur l'emprise **écran** visible.
     * Un ortho fixe (±400 m) créait une pastille / triangle net au pan — moche.
     */
    syncShadowRig() {
        if (!this.dirLight?.shadow || !map || !this.origin) return;
        const c = map.getCenter();
        const lmC = this.localMeters(c.lng, c.lat);
        const cx = lmC.x, cz = -lmC.y;

        // Coins + bords du canvas → lng/lat → mètres locaux (gère le pitch mieux que getBounds seul).
        const canvas = map.getCanvas();
        const w = canvas?.clientWidth || 800, h = canvas?.clientHeight || 600;
        const screenPts = [
            [0, 0], [w, 0], [0, h], [w, h],
            [w / 2, 0], [w / 2, h], [0, h / 2], [w, h / 2],
        ];
        let maxR = 0;
        for (const [sx, sy] of screenPts) {
            let ll;
            try { ll = map.unproject([sx, sy]); } catch (_) { continue; }
            if (!ll || !Number.isFinite(ll.lng)) continue;
            const lm = this.localMeters(ll.lng, ll.lat);
            maxR = Math.max(maxR, Math.hypot(lm.x - cx, (-lm.y) - cz));
        }
        // Repli : emprise géographique si unproject échoue (globe extrême).
        if (!(maxR > 10)) {
            const b = map.getBounds();
            for (const p of [
                this.localMeters(b.getWest(), b.getSouth()),
                this.localMeters(b.getWest(), b.getNorth()),
                this.localMeters(b.getEast(), b.getSouth()),
                this.localMeters(b.getEast(), b.getNorth()),
            ]) {
                maxR = Math.max(maxR, Math.hypot(p.x - cx, (-p.y) - cz));
            }
        }

        let half = Math.max(maxR * 1.3, 320);
        half = Math.min(half, 2200);

        const sh = this.dirLight.shadow;
        const cam = sh.camera;
        cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
        cam.near = 1;
        cam.far = Math.max(half * 4.5, 1400);
        cam.updateProjectionMatrix();

        const side = half > 800 ? 4096 : 2048;
        if (sh.mapSize.x !== side) {
            sh.mapSize.set(side, side);
            if (sh.map) { sh.map.dispose(); sh.map = null; }
        }

        const dist = Math.max(half * 1.5, 400);
        this.dirLight.target.position.set(cx, 0, cz);
        this.dirLight.position.set(
            cx + this.sunDir.x * dist,
            Math.max(this.sunDir.y * dist, dist * 0.4),
            cz + this.sunDir.z * dist,
        );
        this.dirLight.target.updateMatrixWorld();
        cam.updateMatrixWorld?.();
        if (this.groundShadow) this.groundShadow.position.set(cx, 0.02, cz);
    },

    makeLayer() {
        const self = this;
        return {
            id: self.layerId, type: 'custom', renderingMode: '3d',
            onAdd(m, gl) {
                self.camera = new THREE.Camera();
                self.scene = new THREE.Scene();
                self.ambLight = new THREE.AmbientLight(0xffffff, 1.0);
                self.dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
                self.dirLight.position.copy(self.sunDir).multiplyScalar(100);
                self.hemiLight = new THREE.HemisphereLight(0xbcd4e8, 0x55492f, 0.45);
                self.scene.add(self.ambLight, self.dirLight, self.hemiLight);
                self.renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
                self.renderer.autoClear = false;
                // Ombres portées (shadow maps) — actives seulement hors terrain 3D
                // (avec terrain MapLibre rend dans un FBO offscreen incompatible).
                try {
                    self.renderer.shadowMap.enabled = true;
                    self.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                    self.dirLight.castShadow = true;
                    const sh = self.dirLight.shadow;
                    sh.mapSize.set(2048, 2048);
                    sh.camera.near = 1; sh.camera.far = 2500;
                    // Frustum initial ; recalé chaque frame sur l'emprise visible (cf. syncShadowRig).
                    sh.camera.left = -600; sh.camera.right = 600; sh.camera.top = 600; sh.camera.bottom = -600;
                    sh.camera.updateProjectionMatrix();
                    sh.bias = -0.0008; sh.normalBias = 0.35;
                    self.scene.add(self.dirLight.target);
                    const g = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.ShadowMaterial({ opacity: 0.32 }));
                    g.rotation.x = -Math.PI / 2; g.position.y = 0.02; g.receiveShadow = true; g.frustumCulled = false;
                    self.groundShadow = g; self.scene.add(g);
                } catch (e) { console.warn('shadow setup', e.message); }
                self.build();
            },
            render(gl, matrix) {
                if (!self.renderer || !self.origin) {
                    self._skipReason = !self.renderer ? 'no-renderer' : 'no-origin';
                    return;
                }
                // MapLibre 5 : objet CustomRenderMethodInput.
                // Exemple officiel three.js : defaultProjectionData.mainMatrix
                // (modelViewProjectionMatrix en premier projetait hors écran).
                let arr = null;
                if (matrix) {
                    if (Array.isArray(matrix) || ArrayBuffer.isView(matrix)) arr = matrix;
                    else {
                        arr = matrix.defaultProjectionData?.mainMatrix
                            || matrix.modelViewProjectionMatrix
                            || matrix.mainMatrix
                            || matrix.matrix
                            || null;
                    }
                }
                if (!arr || !(arr.length >= 16 || arr.byteLength >= 64)) {
                    self._skipReason = 'no-matrix';
                    self._matrixHint = matrix == null ? 'null'
                        : (ArrayBuffer.isView(matrix) ? 'view'
                            : (typeof matrix === 'object' ? Object.keys(matrix).slice(0, 12).join(',') : typeof matrix));
                    return;
                }
                self._skipReason = null;
                self._renderFrames = (self._renderFrames || 0) + 1;
                // L'altitude qui translate la scene DOIT etre celle qui a servi a
                // calculer la position verticale des instances (`placement`). La
                // sonder ici a chaque frame les desynchronisait : `originElev` ne
                // se rafraichit qu'apres coup, et entre-temps la scene glissait.
                const elev = STATE.settings.terrain3D ? self.originElev : 0;
                // Sonde de derive, hors du chemin de rendu : elle ne fait que
                // declencher un recalcul ou placement et rendu repartent ensemble.
                if (STATE.settings.terrain3D) {
                    const sondee = map.queryTerrainElevation(self.origin);
                    if (Number.isFinite(sondee) && Math.abs(sondee - elev) > DERIVE_ORIGINE_M) {
                        clearTimeout(self._driftTimer);
                        self._driftTimer = setTimeout(() => self.recomputeAll(), 200);
                    }
                }
                const mc = maplibregl.MercatorCoordinate.fromLngLat(self.origin, elev);
                const s = mc.meterInMercatorCoordinateUnits();
                self._vScale.set(s, -s, s);
                self._m4Origin.makeTranslation(mc.x, mc.y, mc.z).scale(self._vScale).multiply(self._mRotX);
                // Ombres : seulement hors terrain, sous le plafond d'objets, et zoomé.
                const wantShadow = STATE.settings.shadows && !STATE.settings.terrain3D && self._shadowFeasible && self.sunDir.y > 0.05 && map.getZoom() >= 14;
                self.dirLight.castShadow = wantShadow;
                if (self.groundShadow) self.groundShadow.visible = wantShadow;
                if (wantShadow) {
                    // Frustum = emprise visible (pas un carré fixe de 400 m) :
                    // sinon une « pastille » d'ombre suit le centre et coupe net.
                    self.syncShadowRig();
                    // Soleil bas → ombres très longues = tache noire moche : adoucir.
                    if (self.groundShadow?.material) {
                        const al = Math.max(0, Math.min(1, self.sunDir.y));
                        self.groundShadow.material.opacity = 0.16 + al * 0.2;
                    }
                } else {
                    self.dirLight.position.copy(self.sunDir).multiplyScalar(300);
                }
                self._m4VP.fromArray(arr).multiply(self._m4Origin);
                self.camera.projectionMatrix.copy(self._m4VP);
                Eclairage.avantRendu();
                // Les luminaires proches portent ombre la nuit (budget, `Eclairage`) :
                // les shadow maps restent actives pour eux, soleil couché.
                //
                // Décidé APRÈS `Eclairage.avantRendu()`, qui attribue les ombres
                // (vérifié le 24/09/2026) : décidé avant, l'image où les spots
                // prennent leur ombre était rendue shadow map coupée ; three.js y
                // compilait les matériaux SANS ombre, et ne les recompile pas quand
                // `shadowMap.enabled` repasse à vrai (il ne suit que le nombre de
                // lumières ombrantes). Aucune ombre de luminaire ne s'affichait.
                // D'où, aussi, la recompilation forcée à chaque bascule.
                const ombresSpots = !STATE.settings.terrain3D && Eclairage.ombresActives();
                if (self.renderer.shadowMap.enabled !== (wantShadow || ombresSpots)) {
                    self.renderer.shadowMap.enabled = wantShadow || ombresSpots;
                    self.scene.traverse((o) => {
                        if (!o.material) return;
                        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.needsUpdate = true;
                    });
                }
                // Shadow maps des lampes : figées tant que rien ne change. Le
                // soleil, lui, a un cadre qui suit la vue (`syncShadowRig`) : ses
                // ombres se refont à chaque image. Les lampes et leurs porteurs
                // d'ombre ne bougent pas avec la caméra : on ne les refait qu'au
                // changement de sources ombrées, de scène ou de réglage (≈ 1 ms de
                // GPU par image épargnée à 4 ombres, mesuré le 24/09/2026).
                const sm = self.renderer.shadowMap;
                sm.autoUpdate = wantShadow;
                if (!wantShadow && sm.enabled) {
                    const cleOmbres = `${Eclairage.versionOmbres()}:${self._versionScene || 0}`;
                    if (cleOmbres !== self._cleOmbres) { sm.needsUpdate = true; self._cleOmbres = cleOmbres; }
                } else self._cleOmbres = null;
                self.renderer.resetState();
                // Ne PAS vider le depth buffer ici, et ne pas repasser la couche
                // en `renderingMode: '2d'`.
                //
                // Les deux avaient ete introduits ensemble contre un symptome :
                // un GLB masque sur fond raster. Mesure sur la demo Vieille-
                // Charite, etape « La matiere » (GLB seul, ortho IGN, aucune
                // couche extrudee) : sans eux le modele est **net et porte son
                // ombre** ; avec eux il perd son auto-occlusion — les faces
                // arriere se peignent par-dessus les faces avant, ce qui se lit
                // comme des normales inversees — et son ombre disparait.
                //
                // Le cas ou ils aidaient est autre : une couche extrudee de la
                // scene occupe le meme volume que le GLB (l'emprise cadastrale
                // du monument, presente dans le bati). Les faire passer devant
                // masquait cette superposition au lieu de la resoudre, et le
                // prix se payait partout ailleurs. La correction appartient a la
                // scene : ne pas montrer deux representations du meme batiment.
                // three.js releve la taille du canvas A SA CREATION et ne la
                // revoit jamais : le canvas etant celui de MapLibre, toute
                // largeur qui change ensuite — l'ouverture d'un panneau, la
                // fermeture de l'inspecteur — laisse le renderer sur son
                // ancien viewport. Les objets sont alors dessines a la mauvaise
                // echelle ET decales, ce qui se lit comme un glissement pendant
                // la navigation. D'ou le symptome : les modeles ne bougent que
                // lorsqu'un des panneaux est ouvert.
                const cv = map.getCanvas();
                if (self._wCanvas !== cv.width || self._hCanvas !== cv.height) {
                    self.renderer.setViewport(0, 0, cv.width, cv.height);
                    self._wCanvas = cv.width; self._hCanvas = cv.height;
                }
                // Pochoir : les modèles y écrivent `POCHOIR_MODELE`, la tache des
                // vraies lumières l'évite (un sol de maquette reçoit déjà ces
                // spots, lib/luminaires-three.js). Effacé d'abord : MapLibre y
                // laisse ses identifiants de tuiles.
                const pochoir = Eclairage.besoinPochoir();
                if (pochoir) self.renderer.clearStencil();
                self.renderer.render(self.scene, self.camera);
                // MapLibre garde en mémoire le masque de tuiles qu'il a posé dans
                // le pochoir : on vient de l'effacer, il doit le reposer.
                if (pochoir && map.painter) map.painter.currentStencilSource = undefined;
                Eclairage.apresRendu();
            },
            onRemove() {
                Eclairage.oublier();
                self.disposeInstances(); self.renderer?.dispose?.(); self.renderer = null; self.scene = null;
                // Le KTX2 est lie au renderer qui s'en va (et tient des workers).
                self._ktx2?.dispose?.(); self._ktx2 = null; self._chargeurGltf = null;
            },
        };
    },

    /**
     * Un chargeur glTF qui lit aussi les fichiers compresses.
     *
     * La vegetation generee (pix2hdr) arrive en `EXT_meshopt_compression` et
     * `KHR_texture_basisu` : c'est ce qui ramene un platane de 18,8 Mo a 1,9 Mo.
     * Sans decodeurs, GLTFLoader rejette le fichier et l'arbre manque, un simple
     * avertissement en console pour toute trace (mesure le 19/09/2026).
     *
     * KTX2Loader doit connaitre le renderer pour choisir le format de texture
     * que le GPU accepte (`detectSupport`). Le renderer naissant dans `onAdd`, un
     * chargeur cree avant lui n'est pas garde : le suivant aura le KTX2.
     */
    chargeurGltf() {
        if (this._chargeurGltf) return this._chargeurGltf;
        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        if (!this.renderer) return loader;
        try {
            this._ktx2 = new KTX2Loader()
                .setTranscoderPath(cheminTranscodeur(import.meta.resolve?.bind(import.meta)))
                .detectSupport(this.renderer);
            partagerTextures(this._ktx2);
            loader.setKTX2Loader(this._ktx2);
        } catch (e) { console.warn('KTX2 indisponible :', e.message); }
        this._chargeurGltf = loader;
        return loader;
    },
    async ensureGLTF(url) {
        if (!this.gltfCache.has(url)) {
            const loader = this.chargeurGltf();
            this.gltfCache.set(url, loader.loadAsync(url).then((g) => g.scene).catch((e) => { console.warn('GLTF load failed', url, e.message); return null; }));
        }
        return this.gltfCache.get(url);
    },
    /** Matériaux GLB : opaques, faces doubles (échelle Y négative mercator). */
    fixGltfMaterial(m) {
        const c = m.clone();
        c.side = THREE.DoubleSide;
        // Photogrammétrie / Sketchfab : éviter le « fantôme » (alpha / depth).
        c.transparent = false;
        c.opacity = 1;
        c.depthWrite = true;
        c.depthTest = true;
        // Mais un feuillage `alphaMode: MASK` garde sa découpe (lib/gltf-chargeur.js).
        // L'ombre la suit d'elle-même : three reprend map et alphaTest dans son
        // matériau de profondeur.
        c.alphaTest = seuilDecoupe(m);
        // Pochoir : là où un modèle se dessine, la tache calculée des vraies
        // lumières ne s'ajoute pas (lib/luminaires-three.js, point P2).
        marquerPochoirModele(c);
        if (c.map) { c.map.colorSpace = THREE.SRGBColorSpace; c.map.needsUpdate = true; }
        c.needsUpdate = true;
        // Non éclairé (KHR_materials_unlit) : la nuit passe par sa couleur,
        // les lumières ne l'atteignant pas (`setSun`, lib/nuit-rendu.js).
        if (estNonEclaire(c)) {
            c.userData.couleurJour = c.color.clone();
            this._nonEclaires.add(c);
            this.teinterNonEclaire(c);
        }
        return c;
    },
    /** Matériaux non éclairés, teintés par la nuit (bornés : un clone par URL de modèle). */
    _nonEclaires: new Set(),
    teinterNonEclaire(c) {
        const b = c.userData.couleurJour;
        if (!b) return;
        const [r, g, bl] = couleurSousNuit([b.r, b.g, b.b], [this._cNuit.r, this._cNuit.g, this._cNuit.b]);
        c.color.setRGB(r, g, bl);
    },
    // prototypes = liste de sous-mailles {geometry, material, mat(local)} pour l'instancing
    async ensureProto(url) {
        if (this.protoCache.has(url)) return this.protoCache.get(url);
        const scene = await this.ensureGLTF(url);
        if (!scene) { this.protoCache.set(url, null); return null; }
        scene.updateMatrixWorld(true);
        const parts = [];
        scene.traverse((o) => {
            if (!o.isMesh || !o.geometry) return;
            const material = Array.isArray(o.material)
                ? o.material.map((m) => this.fixGltfMaterial(m))
                : this.fixGltfMaterial(o.material);
            parts.push({ geometry: o.geometry, material, mat: o.matrixWorld.clone() });
        });
        const v = parts.length ? parts : null;
        this.protoCache.set(url, v); return v;
    },
    /** Clone de scène pour 1 monument (hors InstancedMesh — textures plus fiables). */
    async ensureMonumentRoot(url) {
        const scene = await this.ensureGLTF(url);
        if (!scene) return null;
        const root = scene.clone(true);
        root.traverse((o) => {
            if (!o.isMesh) return;
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = false;
            if (Array.isArray(o.material)) o.material = o.material.map((m) => this.fixGltfMaterial(m));
            else if (o.material) o.material = this.fixGltfMaterial(o.material);
        });
        root.matrixAutoUpdate = false;
        return root;
    },

    /**
     * Altitude de l'origine de la scene, conservee si la tuile a disparu.
     *
     * L'origine est un objet fixe, vite hors champ : le repli `|| 0` la ramenait
     * au niveau de la mer et faisait sauter toute la scene.
     */
    readOriginElev() {
        if (!STATE.settings.terrain3D || !map) return 0;
        return altitudeOrigineStable(map.queryTerrainElevation(this.origin), this.originElev);
    },
    setOrigin(lng, lat) { this.origin = [lng, lat]; this.originMC = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0); this.originScale = this.originMC.meterInMercatorCoordinateUnits(); },
    localMeters(lng, lat) { const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0), s = this.originScale; return { x: (mc.x - this.originMC.x) / s, y: -(mc.y - this.originMC.y) / s }; },
    /**
     * Altitude du sol, ou `null` si la tuile MNT n'est pas encore chargee.
     * La distinction compte : `0` est une altitude valide en bord de mer, et
     * la confondre avec « pas de donnee » collerait les entites au niveau zero
     * sans jamais les relever.
     */
    elevRaw(lng, lat) {
        if (!STATE.settings.terrain3D || !map) return null;
        // Au millionième de degré : par cases de 1e-4° (≈ 8 × 11 m), deux
        // objets voisins partageaient une altitude (cf. `cleAltitude`).
        const k = cleAltitude(lng, lat);
        if (this.elevCache.has(k)) return this.elevCache.get(k);
        const v = map.queryTerrainElevation([lng, lat]);
        if (!Number.isFinite(v)) return null; // pas de cache : la tuile viendra
        if (this.elevCache.size > 8000) this.elevCache.clear();
        this.elevCache.set(k, v); return v;
    },
    // matrice de placement (espace local mètres, Y up) pour une feature
    placement(layer, feature) {
        const p = resolveFeatureProps(feature, layer);
        const [lng, lat] = feature.geometry.coordinates;
        const lm = this.localMeters(lng, lat);
        // Altitude relative a l'origine de la scene. Quand la tuile MNT manque,
        // l'entite se cale SUR l'origine (ecart nul) et non au niveau de la mer :
        // `readOriginElev` conservant la derniere altitude connue de l'origine,
        // un repli a zero ici enfoncait tous les objets de cette altitude — sur
        // un relief a 200 m, la scene entiere disparaissait sous le sol.
        const eOff = ecartAuSol(this.elevRaw(lng, lat), this.originElev);
        const o = this._obj;
        // Couche « Catalogue » : echelle et azimut composent le reglage manuel
        // avec la mesure ou la graine de l'objet (spec §5, `resolutionCatalogue`).
        // Ils ne dependent pas de la distance : le niveau de detail est ignore ici.
        const cat = resolutionCatalogue(layer, feature, 0);
        // Un luminaire du catalogue se pose comme dans `Eclairage` (bloc `lighting` du type) : un type
        // ancre au FEU (applique, axial, projecteur) est eleve de `hauteurFeu`, sinon il serait
        // enterre au pied de son support ; un champ `azimut` l'emporte sur le tirage.
        const pose = cat?.type?.lighting ? poseLuminaire(cat.type.lighting, cat.props || feature.properties, cat.rotationDeg) : null;
        o.position.set(lm.x + (p.offsetX || 0), eOff + (p.offsetZ || 0) + (pose ? pose.elevation : 0), -lm.y - (p.offsetY || 0));
        const sc = cat ? cat.echelle : (p.scale || 1); o.scale.set(sc, sc, sc);
        const azimut = pose ? (pose.origineAzimut === 'champ' ? 180 - pose.azimutDeg : pose.azimutDeg)
            : (cat ? cat.rotationDeg : (p.rotationZ || 0));
        o.rotation.set(deg2rad(p.rotationX || 0), deg2rad(azimut), deg2rad(p.rotationY || 0), 'YXZ');
        o.updateMatrix();
        return o.matrix;
    },

    // collecte des features 3D dans l'emprise (culling viewport)
    collect() {
        const out = [];
        if (!map) return out;
        const b = map.getBounds(), buf = 0.004;
        for (const layer of STATE.layers) {
            if (layer.visible === false) continue;
            if (layer.geometryType !== 'Point' && layer.geometryType !== 'MultiPoint') continue;
            if (layer.style?.mode !== 'library' && layer.style?.mode !== 'custom') continue;
            // Les points lumineux EclExt ont leur propre rendu (`Eclairage`) :
            // instanciés ici, ils seraient dessinés deux fois, et sans lumière.
            if (coucheEclairage(layer)) continue;
            const defUrl = getLayerModelUrl(layer);
            const sym = layer.style.symbolization || {};
            const categorized = sym.model?.mode === 'categorized' && sym.model.field;
            const parObjets = coucheUtiliseObjets(layer);
            if (!defUrl && !categorized && !parObjets) continue;
            // Position de la camera, pour le niveau de detail de chaque objet (un `_modelId`
            // `objet:<type>` peut aussi venir d'un objet d'une couche low-poly).
            const cam = CATALOGUE_OBJETS.cat ? cameraMetres() : null;
            const feats = (filteredGeoJSON(layer)?.features || []);
            for (let idx = 0; idx < feats.length; idx++) {
                const f = feats[idx];
                const srcIdx = f.properties?._idx;
                if (srcIdx == null) continue;
                if (f.geometry?.type !== 'Point') continue;
                const [lng, lat] = f.geometry.coordinates;
                if (lng < b.getWest() - buf || lng > b.getEast() + buf || lat < b.getSouth() - buf || lat > b.getNorth() + buf) continue;
                let url = defUrl;
                const propre = f.properties?._modelId;
                if (cam && ((parObjets && !propre) || estIdObjet(propre))) {
                    const feature = layer.geojson?.features?.[srcIdx] || f;
                    const r = resolutionCatalogue(layer, feature, distanceCamera(cam, lng, lat));
                    // Pas de fichier (absent, licence refusee) : le repli low-poly
                    // du type ; aucun type : le modele de la couche (spec §3.4).
                    if (r) url = r.url || findModel(r.fallback)?.url || defUrl;
                    else if (categorized && !propre) { const mm = findModel(modelIdDeEntite(f, layer)); if (mm?.url) url = mm.url; }
                } else if (categorized || propre) { const mm = findModel(modelIdDeEntite(f, layer)); if (mm?.url) url = mm.url; }
                if (!url) continue;
                out.push({ layerId: layer.id, idx: srcIdx, lng, lat, url });
                if (out.length >= MAX_3D_INSTANCES) return out;
            }
        }
        return out;
    },

    /**
     * Bâti Atlas extrudé (MapLibre fill-extrusion) → volumes three.js invisibles
     * qui castent sur le même plan d'ombre que les GLB.
     * MapLibre ne projette pas d'ombres sur le fill-extrusion : sans ce pont,
     * seuls les modèles importés portent une ombre.
     */
    collectExtrusionsForShadow() {
        const out = [];
        if (!map || !STATE.settings.shadows || STATE.settings.terrain3D) return out;
        if (map.getZoom() < 14) return out;
        const b = map.getBounds(), buf = 0.004; // marge large : éviter le « trou » d'ombre au pan
        const cCenter = map.getCenter();
        const scored = [];
        for (const layer of STATE.layers) {
            if (layer.visible === false) continue;
            const gt = layer.geometryType;
            if (gt !== 'Polygon' && gt !== 'MultiPolygon') continue;
            if (layer.style?.polygonMode === 'flat') continue;
            const feats = featuresForExtrusionShadow(layer);
            for (let i = 0; i < feats.length; i++) {
                const f = feats[i];
                const c = featureCentroidLngLat(f);
                if (!c) continue;
                const [lng, lat] = c;
                if (lng < b.getWest() - buf || lng > b.getEast() + buf || lat < b.getSouth() - buf || lat > b.getNorth() + buf) continue;
                const h = featureExtrusionHeightM(f, layer);
                if (!(h > 0.5)) continue;
                // Distance en mètres approx. (pas en degrés) pour prioriser le bâti vraiment proche.
                const dx = (lng - cCenter.lng) * 85000;
                const dy = (lat - cCenter.lat) * 111000;
                const d2 = dx * dx + dy * dy;
                scored.push({ layer, feature: f, lng, lat, height: h, d2 });
            }
        }
        scored.sort((a, b2) => a.d2 - b2.d2);
        return scored.slice(0, EXTRUSION_SHADOW_CAP);
    },

    disposeExtrusionShadows() {
        if (!this.extrusionShadows?.length) { this.extrusionShadows = []; return; }
        for (const mesh of this.extrusionShadows) {
            this.scene?.remove(mesh);
            mesh.geometry?.dispose?.();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose?.());
                else mesh.material.dispose?.();
            }
        }
        this.extrusionShadows = [];
    },

    buildExtrusionShadowMeshes(items) {
        if (!this.scene || !this.origin || !items?.length) return;
        // Empreintes exactes fusionnées en un seul Mesh (même matériau que les
        // ombres GLB). Les AABB axis-alignées dépassaient / décalaieent du bâti.
        const mat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 1,
            metalness: 0,
            side: THREE.DoubleSide,
            shadowSide: THREE.DoubleSide,
            colorWrite: false,
            depthWrite: false,
        });
        const toLocal = (lng, lat) => this.localMeters(lng, lat);
        const geoms = [];
        for (const it of items) {
            const geom = extrudeFeatureToGeometry(it.feature, Math.max(it.height || 8, 2), toLocal);
            if (!geom) continue;
            // Shape XY = est/nord, +Z = hauteur → Y-up / Z=-nord
            geom.rotateX(-Math.PI / 2);
            geoms.push(geom);
        }
        if (!geoms.length) return;
        const merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
        if (!merged) {
            geoms.forEach((g) => g.dispose?.());
            return;
        }
        if (geoms.length > 1) geoms.forEach((g) => g.dispose?.());
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.extrusionShadows.push(mesh);
    },

    async build() {
        // 3D allégée (téléphone en lecture, `?no3d=1`) : pas de modèles, mais
        // les luminaires restent — lampes, halos et taches ne coûtent presque
        // rien, et sans eux une scène d'éclairage n'a plus d'objet (point P6).
        if (this._disabled || CONFIG.light3d) {
            if (this.scene && map) {
                this.disposeInstances();
                if (!this.origin) { const c = map.getCenter(); this.setOrigin(c.lng, c.lat); }
                this.originElev = this.readOriginElev();
                await Eclairage.construire();
            }
            map?.triggerRepaint();
            return;
        }
        if (!this.scene || !map) return;
        const token = (this._buildToken = (this._buildToken || 0) + 1);
        this.disposeInstances();
        this.disposeExtrusionShadows();
        // GeoJSON distant : charger le FC complet (querySourceFeatures est tuilé / incomplet).
        //
        // Mais seulement si une ombre peut en sortir. `collectExtrusionsForShadow`
        // écarte ensuite les mêmes cas — ombres coupées, relief actif, zoom trop
        // large, couche à plat — et se retrouvait donc à ne rien faire d'entités
        // qu'on venait de retélécharger. Mesuré sur une scène à plat : neuf
        // requêtes vers une couche qui ne produira jamais de caster.
        //
        // Les conditions sont celles du consommateur, et elles doivent le rester :
        // les dissocier ramènerait le téléchargement inutile sans que rien ne le
        // signale.
        const ombresPossibles = !!STATE.settings.shadows
            && !STATE.settings.terrain3D
            && map.getZoom() >= 14;
        if (ombresPossibles) {
            await Promise.all(
                STATE.layers
                    .filter((l) => l.visible !== false
                        && (l.geometryType === 'Polygon' || l.geometryType === 'MultiPolygon')
                        && l.style?.polygonMode !== 'flat')
                    .map((l) => ensureShadowFeatures(l)),
            );
        }
        if (!this.scene || token !== this._buildToken) return;
        const all = this.collect();
        const extrusions = this.collectExtrusionsForShadow();
        const z = map.getZoom();
        // Ombres : GLB sous plafond, ou bâti extrudé à proximité (même si aucun GLB).
        this._shadowFeasible = (all.length > 0 && all.length <= SHADOW_FEATURE_CAP) || extrusions.length > 0;
        if (z < GLOBE_MERCATOR_ZOOM && (STATE.settings.projection || 'globe') === 'globe') { map.triggerRepaint(); return; }

        if (!this.origin) {
            if (all[0]) this.setOrigin(all[0].lng, all[0].lat);
            else if (extrusions[0]) this.setOrigin(extrusions[0].lng, extrusions[0].lat);
            else {
                const c = map.getCenter();
                this.setOrigin(c.lng, c.lat);
            }
        }
        this.originElev = this.readOriginElev();

        const skipGltf = (z < MODEL3D_ZOOM_GATE && all.length > MODEL3D_GATE_COUNT) || all.length === 0;
        if (!skipGltf) {
            const byUrl = new Map();
            for (const it of all) { if (!byUrl.has(it.url)) byUrl.set(it.url, []); byUrl.get(it.url).push(it); }
            const urls = [...byUrl.keys()];
            if (!this.scene || token !== this._buildToken) return;

            this.slotIndex.clear();
            for (const url of urls) {
                const items = byUrl.get(url);
                // 1 exemplaire (monument GLB) : Group cloné — InstancedMesh abîme souvent
                // les textures photogrammétriques (chapelle « fantôme »).
                if (items.length === 1) {
                    const root = await this.ensureMonumentRoot(url);
                    if (!this.scene || token !== this._buildToken) return;
                    if (!root) continue;
                    const it = items[0];
                    const layer = STATE.layers.find((l) => l.id === it.layerId);
                    const feature = layer?.geojson?.features?.[it.idx];
                    if (!feature) continue;
                    const place = this.placement(layer, feature);
                    root.matrix.copy(place);
                    root.updateMatrixWorld(true);
                    this.scene.add(root);
                    this.slotIndex.set(it.layerId + ':' + it.idx, { url, slot: 0, monument: true });
                    this.groups.set(url, { meshes: [], roots: [root], items });
                    continue;
                }
                const proto = await this.ensureProto(url);
                if (!this.scene || token !== this._buildToken) return;
                if (!proto) continue;
                const meshes = proto.map((part) => {
                    const im = new THREE.InstancedMesh(part.geometry, part.material, items.length);
                    im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
                    return { im, protoMat: part.mat };
                });
                items.forEach((it, slot) => {
                    const layer = STATE.layers.find((l) => l.id === it.layerId);
                    const feature = layer?.geojson?.features?.[it.idx];
                    if (!feature) return;
                    const place = this.placement(layer, feature);
                    meshes.forEach(({ im, protoMat }) => { this._m4.multiplyMatrices(place, protoMat); im.setMatrixAt(slot, this._m4); });
                    this.slotIndex.set(it.layerId + ':' + it.idx, { url, slot });
                });
                meshes.forEach(({ im }) => { im.instanceMatrix.needsUpdate = true; this.scene.add(im); });
                this.groups.set(url, { meshes, roots: [], items });
            }
        }

        if (token !== this._buildToken) return;
        if (extrusions.length) this.buildExtrusionShadowMeshes(extrusions);
        this._versionScene = (this._versionScene || 0) + 1;
        await Eclairage.construire();
        map.triggerRepaint();
    },

    // recompute TOUTES les matrices (sans regrouper) — relief chargé / exagération
    recomputeAll() {
        if (!this.origin || !map || !this.scene) return;
        this.elevCache.clear();
        this.originElev = this.readOriginElev();
        for (const [, g] of this.groups) {
            if (g.roots?.length) {
                g.items.forEach((it, i) => {
                    const layer = STATE.layers.find((l) => l.id === it.layerId);
                    const feature = layer?.geojson?.features?.[it.idx];
                    if (!feature || !g.roots[i]) return;
                    g.roots[i].matrix.copy(this.placement(layer, feature));
                    g.roots[i].updateMatrixWorld(true);
                });
                continue;
            }
            g.items.forEach((it, slot) => {
                const layer = STATE.layers.find((l) => l.id === it.layerId);
                const feature = layer?.geojson?.features?.[it.idx];
                if (!feature) return;
                const place = this.placement(layer, feature);
                g.meshes.forEach(({ im, protoMat }) => { this._m4.multiplyMatrices(place, protoMat); im.setMatrixAt(slot, this._m4); });
            });
            g.meshes.forEach(({ im }) => { im.instanceMatrix.needsUpdate = true; });
        }
        this._versionScene = (this._versionScene || 0) + 1;
        // Les luminaires se recalent avec le reste : même cache d'altitude,
        // sinon leurs taches restaient sur l'ancien sol (point P3).
        Eclairage.recaler();
        map.triggerRepaint();
    },

    // FAST PATH — met à jour les matrices des features éditées sans rebuild
    updateEdited(layerId, indices) {
        if (!this.origin || !this.scene) { this.scheduleBuild(); return; }
        const layer = STATE.layers.find((l) => l.id === layerId); if (!layer) return;
        let touched = false, missing = false;
        for (const idx of indices) {
            const ref = this.slotIndex.get(layerId + ':' + idx);
            if (!ref) { missing = true; continue; }
            const g = this.groups.get(ref.url); if (!g) continue;
            const feature = layer.geojson.features[idx]; if (!feature) continue;
            const place = this.placement(layer, feature);
            if (ref.monument && g.roots?.[ref.slot]) {
                g.roots[ref.slot].matrix.copy(place);
                g.roots[ref.slot].updateMatrixWorld(true);
                touched = true;
                continue;
            }
            g.meshes.forEach(({ im, protoMat }) => { this._m4.multiplyMatrices(place, protoMat); im.setMatrixAt(ref.slot, this._m4); im.instanceMatrix.needsUpdate = true; });
            touched = true;
        }
        if (touched) { this._versionScene = (this._versionScene || 0) + 1; map.triggerRepaint(); }
        if (missing) this.scheduleBuild();
    },

    cull() { clearTimeout(this._cullTimer); this._cullTimer = setTimeout(() => this.build(), 200); },

    disposeInstances() {
        this.disposeExtrusionShadows();
        if (!this.scene) { this.groups.clear(); this.slotIndex.clear(); return; }
        for (const [, g] of this.groups) {
            (g.meshes || []).forEach(({ im }) => { this.scene.remove(im); im.dispose?.(); });
            (g.roots || []).forEach((r) => { this.scene.remove(r); });
        }
        this.groups.clear(); this.slotIndex.clear();
    },

    setSun(azimuthDeg, altitudeDeg, moon) {
        const az = deg2rad(azimuthDeg), al = deg2rad(Math.max(-0.1, altitudeDeg));
        // espace scène local : X=est, Y=haut, Z=-nord
        this.sunDir.set(Math.sin(az) * Math.cos(al), Math.sin(al), -Math.cos(az) * Math.cos(al)).normalize();
        if (!this.dirLight) return;
        const amb = computeAmbient(altitudeDeg, moon);
        // La nuit des modèles : le facteur de la couche `atlas-nuit`, appliqué à
        // leurs lumières. Pour un matériau diffus, c'est multiplier le pixel, ce
        // que faisait le voile CSS ; les émissions (lampes) y échappent. Le
        // facteur est donné en sRGB, comme le voile agissait sur le pixel : sa
        // valeur linéaire (≈ f^2,2) donne, une fois encodée, le même f.
        const [fr, fg, fb] = NUIT.facteurs;
        this.dirLight.color.set(amb.sunColor).multiply(this._cNuit.setRGB(fr, fg, fb, THREE.SRGBColorSpace)); this.dirLight.intensity = amb.sunIntensity * (STATE.settings.shadows ? 1.0 : 0.7);
        this.ambLight.color.set(amb.ambientColor).multiply(this._cNuit); this.ambLight.intensity = amb.ambientIntensity;
        if (this.hemiLight) {
            this.hemiLight.intensity = amb.hemiIntensity;
            this.hemiLight.color.setHex(0xbcd4e8).multiply(this._cNuit);
            this.hemiLight.groundColor.setHex(0x55492f).multiply(this._cNuit);
        }
        for (const c of this._nonEclaires) this.teinterNonEclaire(c);
        map && map.triggerRepaint();
    },
};

// ============================================================
// NUIT ET ÉCLAIRAGE PUBLIC (lots E2 et E3 du cadrage éclairage)
// ============================================================
/**
 * La nuit dans le rendu : facteur par canal de la couche `atlas-nuit`
 * (lib/nuit-rendu.js), posée juste sous le calque three.js. Calculé par
 * `updateLighting`, lu à chaque image par la couche et par `Models3D.setSun`.
 */
const NUIT = { id: 'atlas-nuit', facteurs: [1, 1, 1] };

/**
 * Pose (ou remet) la couche de nuit juste sous le calque three.js.
 *
 * Tout ce que MapLibre peint avant elle — fond, ciel, données, halos de
 * sélection — s'assombrit comme sous l'ancien voile ; ce que three.js peint
 * ensuite (modèles, lampes, taches de lumière) n'est pas multiplié. À rappeler
 * après toute remontée du calque three.js (`onStyleReady`, `applyLayerOrder`).
 */
function poserCoucheNuit() {
    if (!map || !map.getLayer(Models3D.layerId)) return;
    try {
        if (!map.getLayer(NUIT.id)) map.addLayer(creerCoucheNuit(NUIT.id, () => NUIT.facteurs), Models3D.layerId);
        else map.moveLayer(NUIT.id, Models3D.layerId);
    } catch (_) { /* style en cours de remplacement */ }
}

/**
 * Une couche de points lumineux EclExt ? Reconnue à ses entités
 * (`structure`, `support`, grandeur photométrique), sur les premières : une
 * couche de points est homogène. Mémorisé sur la couche, par nombre d'entités.
 */
function coucheEclairage(layer) {
    if (!layer || (layer.geometryType !== 'Point' && layer.geometryType !== 'MultiPoint')) return false;
    const feats = Array.isArray(layer.geojson?.features) ? layer.geojson.features : null;
    if (!feats?.length) return false;
    // Le verdict dépend aussi du modèle choisi et du catalogue : la clé le dit, sinon un changement
    // de modèle ou l'arrivée du catalogue resterait sans effet.
    const cle = `${feats.length}|${CATALOGUE_OBJETS.etat}|${signatureModeleCouche(layer)}`;
    if (layer._eclairage && layer._eclairage.cle === cle) return layer._eclairage.oui;
    const echantillon = feats.slice(0, 20);
    // Deux façons d'être une couche de luminaires : des fiches EclExt (le type se déduit), ou un type
    // d'éclairage CHOISI pour tous ses objets (identifiant `objet:<type>`) et décrit par une grandeur
    // photométrique. « Tous » : une couche mêlant luminaires et autres objets garde ses modèles.
    const oui = echantillon.some((f) => estPointLumineux(f?.properties))
        || echantillon.every((f) => pointLumineuxImpose(layer, f));
    layer._eclairage = { cle, oui };
    return oui;
}
/** Ce qui, dans le modèle d'une couche, change son verdict de couche d'éclairage. */
function signatureModeleCouche(layer) {
    const m = layer?.style?.symbolization?.model;
    return [layer?.style?.mode, layer?.style?.library?.modelId, m?.mode, m?.defaultModelId,
        (m?.categories || []).map((c) => c.modelId).join(','), JSON.stringify(layer?.parametres || null)].join('/');
}
/**
 * Le type du catalogue que l'identifiant `objet:<type>` IMPOSE à cette entité (objet, catégorie ou
 * couche), ou `null` : modèle de la bibliothèque, ou type déduit des champs (affectation « Catalogue »).
 */
function typeImposeDe(layer, feature) {
    if (layer?.style?.mode !== 'library') return null;
    const propre = feature?.properties?._modelId;
    if (propre) return typeDeIdObjet(propre);
    if (coucheAuCatalogue(layer)) return null;
    return typeDeIdObjet(modelIdDeEntite(feature, layer));
}
/** Un type du catalogue pointé, par son identifiant (`null` si le catalogue n'est pas là ou ne le connaît pas). */
function typeCatalogueDe(typeId) {
    return typeId ? (CATALOGUE_OBJETS.cat?.types.find((t) => t.id === typeId) || null) : null;
}
/**
 * Les propriétés d'une entité telles que les calculs doivent les lire : les siennes, plus chaque
 * paramètre du type résolu (champ lié, réglage de l'objet, de la couche, défaut du catalogue ou règle).
 * Sans schéma pour ce type, les propriétés sont rendues telles quelles.
 */
function parametresDeEntite(layer, feature, typeId) {
    const descripteurs = descripteursDuType(typeCatalogueDe(typeId));
    const props = feature?.properties || {};
    if (!descripteurs.length) return { props, provenance: {}, descripteurs };
    const r = proprietesEffectives(props, descripteurs, { params: props._params, couche: layer?.parametres, typeId });
    return { props: r.props, provenance: r.provenance, descripteurs };
}
/**
 * Résout le modèle d'une entité du catalogue **avec ses paramètres** : le type se choisit (imposé par
 * l'identifiant, ou déduit des champs), puis le fichier se choisit d'après les propriétés effectives —
 * une hauteur de feu réglée pour la couche choisit ainsi la classe de hauteur d'un mât.
 *
 * @returns {null | { r: object, props: object, provenance: object, typeId: string }}
 */
function resoudreEntite(layer, feature, options) {
    const cat = CATALOGUE_OBJETS.cat;
    if (!cat) return null;
    const couche = sourceDeCouche(layer);
    let typeId = options.typeId || null;
    let r0 = null;
    if (!typeId) {
        r0 = resoudreObjet(cat, couche, feature, options);
        if (!r0) return null;
        typeId = r0.type.id;
    }
    const eff = parametresDeEntite(layer, feature, typeId);
    if (!eff.descripteurs.length) {
        const r = r0 || resoudreObjet(cat, couche, feature, { ...options, typeId });
        return r ? { r, props: eff.props, provenance: eff.provenance, typeId } : null;
    }
    const r = resoudreObjet(cat, couche, { ...feature, properties: eff.props }, { ...options, typeId });
    return r ? { r, props: eff.props, provenance: eff.provenance, typeId } : null;
}
/** Une entité dont l'auteur a choisi un type d'éclairage, et qui porte de quoi l'allumer. */
function pointLumineuxImpose(layer, feature) {
    const typeId = typeImposeDe(layer, feature);
    const type = typeCatalogueDe(typeId);
    if (!type || type.family !== 'lighting') return false;
    // Les propriétés EFFECTIVES : la puissance et la couleur peuvent venir du réglage de la couche
    // ou du défaut du type, pas seulement d'un champ de l'objet.
    return estPointLumineux(parametresDeEntite(layer, feature, typeId).props, { impose: true });
}

/**
 * Les luminaires d'Atlas : les points lumineux EclExt, rendus par le
 * catalogue d'objets (famille `lighting`) ou par un luminaire de test,
 * allumés selon leur profil nocturne à l'heure de la scène.
 *
 * - **Horloge** : l'instant de la scène (`instantScene`, fuseau de la scène),
 *   le soleil NOAA de `lib/soleil.js` (décision 4), à l'**ancre** de la scène
 *   (`STATE.location`, décision 3) — pas au centre de la vue.
 * - **Rendu** : `lib/luminaires-three.js` (modèles, réservoir de vraies
 *   lumières, nappe calculée au sol avec les ombres, halos).
 * - **Qualité adaptative** (`lib/qualite-eclairage.js`) : le budget (ombres,
 *   lumières, ratio de pixels) suit un palier choisi selon l'appareil, puis
 *   ajusté aux images/s mesurées (`regulateur`). `?eclairage_palier=haut|moyen|
 *   bas|minimal` le fige ; `?eclairage_ombres=N&eclairage_lumieres=M` aussi.
 * - **Relief** : chaque luminaire est posé à l'altitude sondée de son pied,
 *   sa tache inclinée selon la pente locale ; recalé avec les modèles.
 */
const Eclairage = {
    lum: null,
    signature: null,
    etats: new Map(),
    soleil: soleilMemorise(coucherLever),

    couches() {
        return STATE.layers.filter((l) => l.visible !== false && coucheEclairage(l));
    },
    oublier() {
        this.lum = null;
        this.signature = null;
    },
    ombresActives() { return !!this.lum?.racine.visible && !!this.lum?.ombresActives(); },
    versionOmbres() { return this.lum ? this.lum.versionOmbres() : 0; },
    besoinPochoir() { return !!this.lum?.racine.visible && !!this.lum?.besoinPochoir(); },

    /* -------- Qualité adaptative -------- */
    palier: null,          // indice dans PALIERS
    regulateur: null,
    budgetFige: null,      // { ombres, lumieres } venu de l'URL : pas de régulation
    ratioApplique: null,

    /** Appareil, palier de départ, régulateur ; une fois, à la création. */
    initialiserQualite() {
        let q = null;
        try { q = new URLSearchParams(location.search); } catch (_) { /* hors navigateur */ }
        const mobile = !!document.body?.classList.contains('mobile-layout')
            || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 720);
        const appareil = {
            mobile,
            allege: !!CONFIG.light3d,
            memoireGo: typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined,
            coeurs: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined,
            ratioPixels: window.devicePixelRatio || 1,
        };
        const force = q ? indicePalier(q.get('eclairage_palier') || '') : -1;
        this.palier = force >= 0 ? force : palierInitial(appareil);
        this.appareil = appareil;
        if (q && (q.has('eclairage_ombres') || q.has('eclairage_lumieres'))) {
            this.budgetFige = {
                ombres: Number(q.get('eclairage_ombres')) || 0,
                lumieres: q.has('eclairage_lumieres') ? (Number(q.get('eclairage_lumieres')) || 0) : 16,
            };
        }
        // Figé par l'URL : pas de régulation (mesures reproductibles).
        this.regulateur = force >= 0 || this.budgetFige ? null
            : creerRegulateur({ palier: this.palier, objectif: objectifImages(appareil) });
        this.appliquerPalier();
    },

    /** Budget et ratio de pixels du palier courant, avec les réglages (Ombres, relief). */
    appliquerPalier() {
        if (!this.lum) return;
        const b = budgetDuPalier(this.palier, { ombres: STATE.settings.shadows, relief: STATE.settings.terrain3D });
        if (this.budgetFige) {
            b.ombres = STATE.settings.shadows && !STATE.settings.terrain3D ? this.budgetFige.ombres : 0;
            b.lumieres = this.budgetFige.lumieres;
            b.ratioMax = null;
        }
        this.lum.definirBudget(b);
        this.poserRatio(b.ratioMax);
    },

    /** Plafonne le ratio de pixels de la carte (le calque three.js partage son canvas). */
    poserRatio(ratioMax) {
        if (!map || typeof map.setPixelRatio !== 'function') return;
        const r = ratioApplique(window.devicePixelRatio || 1, ratioMax);
        if (r === this.ratioApplique) return;
        this.ratioApplique = r;
        try { map.setPixelRatio(r); } catch (_) { /* carte en cours de remplacement */ }
    },

    /** Après chaque image : mesure pour le régulateur, s'il y a des lampes allumées à l'écran. */
    apresRendu() {
        const lum = this.lum;
        if (!lum || !this.regulateur || !lum.racine.visible) return;
        if (!(lum.nbAllumees?.() > 0)) return;
        // Tuiles en chargement : la carte décode et téléverse, ses images/s ne
        // disent rien des lampes (mesuré au téléphone émulé : deux chutes de
        // palier pendant le seul chargement). On ne compte pas ces images.
        if (!map.areTilesLoaded()) { this.regulateur.interrompre(); return; }
        const nouveau = this.regulateur.image(performance.now());
        if (nouveau != null && nouveau !== this.palier) {
            this.palier = nouveau;
            // Hors du rendu : changer le ratio de pixels redimensionne le canvas.
            setTimeout(() => { this.appliquerPalier(); map?.triggerRepaint(); }, 0);
        }
    },

    /** L'état de la qualité, pour la mesure et le débogage. */
    qualite() {
        return {
            palier: PALIERS[this.palier]?.nom ?? null,
            regulateur: this.regulateur?.etat() ?? null,
            budget: this.lum ? { ...this.lum.budget } : null,
            ratio: this.ratioApplique,
            appareil: this.appareil ?? null,
        };
    },

    /**
     * Façades éclairées, bornées (lib/facades-eclairees.js, point P4) : murs
     * du bâti du fond à moins de 3 × la hauteur de feu d'une source à vraie
     * lumière, au zoom ≥ 17, à plat, aux paliers qui le permettent — et si
     * `?eclairage_facades=1` (mesure du 24/09/2026 : voir CLAUDE.md, non
     * retenu par défaut). Reconstruit quand la répartition change, pas plus
     * d'une fois par demi-seconde.
     */
    facadesDemandees: (() => {
        try { return new URLSearchParams(location.search).get('eclairage_facades') === '1'; } catch (_) { return false; }
    })(),
    majFacades(permis) {
        const lum = this.lum;
        const actif = this.facadesDemandees && permis && !STATE.settings.terrain3D && map.getZoom() >= 17;
        if (!actif) {
            if (this._cleFacades) { lum.definirFacades(null); this._cleFacades = null; }
            return;
        }
        const cle = lum.cleEclairantes();
        const t = performance.now();
        if (cle === this._cleFacades || t - (this._tFacades || 0) < 500) return;
        this._cleFacades = cle;
        this._tFacades = t;
        const sources = lum.sourcesEclairantes();
        if (!sources.length) { lum.definirFacades(null); return; }
        const hFeu = sources.map((s) => s.y - s.sol).sort((a, b) => a - b)[sources.length >> 1];
        const rayon = Math.min(30, Math.max(10, 3 * hFeu));
        // Le bâti du fond : les couches fill-extrusion d'une source vectorielle.
        const feats = [];
        for (const l of map.getStyle()?.layers || []) {
            if (l.type !== 'fill-extrusion' || !l['source-layer']) continue;
            if (map.getLayoutProperty(l.id, 'visibility') === 'none') continue;
            try { feats.push(...map.querySourceFeatures(l.source, { sourceLayer: l['source-layer'] })); } catch (_) { /* source absente */ }
        }
        const versLocal = (lng, lat) => { const m = Models3D.localMeters(lng, lat); return { x: m.x, z: -m.y }; };
        const bats = batimentsProches(feats, sources, rayon, versLocal);
        const g = geometrieMurs(bats, undefined, undefined, { sources, rayon });
        lum.definirFacades(g);
        this._facades = { batiments: bats.length, triangles: g.triangles, rayon };
    },

    /** Relief recalé : reposer les luminaires sur le nouveau sol. */
    recaler() {
        if (!this.lum) return;
        this.signature = null;
        this.construire();
    },

    /** L'empreinte de ce qui est affiché : on ne reconstruit que si elle change. */
    empreinte(couches) {
        const o = Models3D.origin ? Models3D.origin.map((v) => v.toFixed(7)).join(',') : '-';
        const c = couches.map((l) => {
            const f = filteredGeoJSON(l)?.features || [];
            return `${l.id}:${f.length}:${f[0]?.properties?._idx ?? ''}:${f[f.length - 1]?.properties?._idx ?? ''}:${signatureModeleCouche(l)}`;
        }).join('|');
        return `${o}#${c}#${CATALOGUE_OBJETS.etat}:${CATALOGUE_OBJETS.url || ''}#${MODEL_LIBRARY.set}#${STATE.settings.terrain3D}`;
    },

    async construire() {
        if (!Models3D.scene || !Models3D.origin) return;
        // Un changement de fond recrée la scène sans `onRemove` : les
        // luminaires resteraient dans l'ancienne, qui n'est plus rendue.
        if (luminairesHorsScene(this.lum, Models3D.scene)) this.oublier();
        const couches = this.couches();
        if (!couches.length && !this.lum) return;
        const sig = this.empreinte(couches);
        if (sig === this.signature) return;
        this.signature = sig;
        if (!this.lum) {
            this.lum = creerLuminaires3D({
                scene: Models3D.scene,
                chargerGltf: (url) => Models3D.ensureGLTF(url),
                fixMateriau: (m) => Models3D.fixGltfMaterial(m),
            });
            // Palier de qualité (et `?eclairage_*` pour la mesure).
            if (this.palier == null) this.initialiserQualite();
            else this.appliquerPalier();
        }
        const items = [];
        for (const layer of couches) {
            const p = resolveFeatureProps({ properties: {} }, layer);
            for (const f of filteredGeoJSON(layer)?.features || []) {
                if (f.geometry?.type !== 'Point') continue;
                const idx = f.properties?._idx;
                const feature = layer.geojson?.features?.[idx] || f;
                const props = feature.properties || {};
                const [lng, lat] = feature.geometry.coordinates;
                const lm = Models3D.localMeters(lng, lat);
                // Altitude au pied sondée exactement : le cache de `elevRaw` range
                // par cases de 1e-4° (≈ 8 × 11 m), soit jusqu'à 2 à 3 m d'écart
                // sur les pentes du Jarret (mesuré, 20 à 35 %) — la tache flottait
                // ou s'enfonçait. Le cache reste le repli (tuile pas encore là).
                const exacte = STATE.settings.terrain3D ? map.queryTerrainElevation([lng, lat]) : null;
                const sol = ecartAuSol(Number.isFinite(exacte) ? exacte : Models3D.elevRaw(lng, lat), Models3D.originElev);
                // Pente au pied (relief seulement) : la tache s'incline avec le sol.
                // Sondée directement : le cache d'altitude arrondit à 1e-4°
                // (≈ 10 m), plus gros que l'écart de la différence centrée.
                const pente = STATE.settings.terrain3D
                    ? penteAuPied((x, y) => map.queryTerrainElevation([x, y]), lng, lat)
                    : { x: 0, z: 0 };
                // Le catalogue d'objets choisit le modèle (famille `lighting`) ;
                // sinon, le luminaire de test (url nulle).
                // `eff` : les propriétés EFFECTIVES — celles de l'objet, plus chaque paramètre résolu
                // (champ lié, réglage de l'objet ou de la couche, défaut du type). L'état, la pose et
                // l'intensité les lisent sans savoir d'où vient chaque valeur.
                let r = null, eff = props;
                if (CATALOGUE_OBJETS.cat) {
                    const typeId = typeImposeDe(layer, feature);
                    const res = resoudreEntite(layer, feature, {
                        set: MODEL_LIBRARY.set, lod: 0, public: contextePublic(),
                        echelleCouche: 1, rotationCoucheDeg: p.rotationZ || 0,
                        ...(typeId ? { typeId } : {}),
                    });
                    if (res) { r = res.r; eff = res.props; }
                    if (r && (r.type?.family !== 'lighting' || !r.url)) r = null;
                }
                const lighting = r?.type?.lighting || null;
                const pose = poseLuminaire(lighting, eff, r ? r.rotationDeg : (p.rotationZ || 0));
                // Un azimut de champ se compte depuis le nord, et la console sort
                // selon +Z glTF : dans le repère local (Z = sud), rotation π − A.
                const rot = pose.origineAzimut === 'champ' ? Math.PI - deg2rad(pose.azimutDeg) : deg2rad(pose.azimutDeg);
                items.push({
                    id: `${layer.id}:${idx}`, props: eff, x: lm.x, y: sol + pose.elevation, z: -lm.y, sol, pente,
                    rotationRad: rot, url: r?.url || null, lighting, pose, type: r?.type?.id || null,
                });
            }
        }
        const lum = this.lum;
        await lum.construire(items);
        if (lum !== this.lum) return;
        this.mettreAJourEtats();
        map?.triggerRepaint();
    },

    /** L'état de chaque luminaire à l'heure de la scène ; appelé par `updateLighting`. */
    mettreAJourEtats() {
        if (!this.lum) return;
        const t = instantScene(STATE.settings);
        const ctx = {
            lat: STATE.location.lat, lon: STATE.location.lng,
            fuseau: fuseauScene(STATE.settings), soleil: this.soleil,
        };
        this.etats = new Map();
        for (const it of this.lum.items()) {
            const { profil, plages } = profilDuPoint(it.props);
            // Le comportement choisi (selon le soleil, toujours allumé, toujours éteint) s'applique à
            // l'état que le profil a calculé ; `soleil`, le défaut, ne change rien.
            this.etats.set(it.id, appliquerComportement(it.props.comportement,
                etatPointLumineux(it.props, profil, plages, t, ctx), it.props));
        }
        this.lum.appliquerEtats(this.etats);
        this.rafraichirAffichage();
    },

    /** Avant chaque image : budget des lumières selon la caméra, taille des halos. */
    avantRendu() {
        if (!this.lum || !map || !Models3D.originMC) return;
        // Globe sous z12 : décalés de centaines de pixels, on ne les dessine pas
        // (lib/eclairage-rendu.js). Plus de spot visible, plus d'ombre à calculer.
        const dessinables = luminairesDessinables(STATE.settings.projection, map.getZoom(), GLOBE_MERCATOR_ZOOM);
        this.lum.racine.visible = dessinables;
        if (!dessinables) return;
        // Le bouton « Ombres » et le relief s'appliquent aussi aux lampes
        // (sans effet si rien n'a changé : `definirBudget` compare).
        const b = budgetDuPalier(this.palier ?? 0, { ombres: STATE.settings.shadows, relief: STATE.settings.terrain3D });
        this.lum.definirBudget(this.budgetFige
            ? { ombres: b.ombres ? this.budgetFige.ombres : 0, lumieres: this.budgetFige.lumieres }
            : b);
        // Relief : les taches passent devant les bosses du MNT jusqu'à 2 m
        // (lib/luminaires-three.js, `uAvance`). À plat, rien.
        this.lum.definirAvanceRelief(STATE.settings.terrain3D ? 2 : 0);
        // Position de la caméra (`cameraMetres`, lib/viewport.js) : MapLibre 5
        // n'a pas `getFreeCameraOptions`, et `getCameraAltitude` rend NaN en
        // projection globe (mesuré, 5.6.1).
        const cm = cameraMetres();
        if (!cm) return;
        const c = map.getCenter();
        const pxParMetre = 512 * Math.pow(2, map.getZoom()) / (40075016.686 * Math.cos(deg2rad(c.lat)));
        const lmCam = Models3D.localMeters(cm.lng, cm.lat);
        // `altitude` se compte au-dessus du sol du centre de la vue ; sous relief,
        // ce sol n'est pas celui de l'origine de la scène (Jarret : 35 m d'écart).
        let solCentre = 0;
        if (STATE.settings.terrain3D) {
            const e = map.queryTerrainElevation(c);
            if (Number.isFinite(e) && Number.isFinite(Models3D.originElev)) solCentre = e - Models3D.originElev;
        }
        const camLocal = { x: lmCam.x, y: cm.altitude + solCentre, z: -lmCam.y };
        // Taille des halos : pixels par mètre au centre de la vue, ramenés au
        // `w` de clip du centre, pour que le shader divise par le `w` de chaque lampe.
        const lm = Models3D.localMeters(c.lng, c.lat);
        const v = this._v4 || (this._v4 = new THREE.Vector4());
        v.set(lm.x, 0, -lm.y, 1).applyMatrix4(Models3D.camera.projectionMatrix);
        // Ratio de la carte, pas de l'écran : il peut être plafonné (palier bas).
        const ratio = map.getPixelRatio?.() || window.devicePixelRatio || 1;
        const k = pxParMetre * Math.abs(v.w) * ratio;
        this.lum.avantRendu(camLocal, k);
        this.majFacades(b.facades);
    },

    /** L'état lisible d'une entité, pour la fiche : `null` hors couche d'éclairage. */
    libelle(layer, idx) {
        const e = this.etats.get(`${layer?.id}:${idx}`);
        return e ? libelleEtat(e) : null;
    },

    /**
     * Ce que la fiche dit d'un luminaire : allumé, abaissé ou éteint, **pourquoi**, et ce qu'on a
     * supposé. Le calcul savait la raison depuis toujours ; elle n'était affichée nulle part.
     */
    htmlEtat(layer, idx) {
        const d = detailEtat(this.etats.get(`${layer?.id}:${idx}`));
        if (!d) return '<span class="etat-eclairage-attente">Éclairage — état en cours de calcul…</span>';
        const classe = d.allume ? (d.abaisse ? 'abaisse' : 'allume') : 'eteint';
        const t = STATE.settings.timeOfDay;
        const heure = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
        const kelvin = d.allume && d.temperatureCouleur ? ` · ${d.temperatureCouleur} K` : '';
        const raison = d.raison ? ` — ${echapper(d.raison)}` : '';
        const hyp = d.hypotheses.length
            ? `<div class="etat-eclairage-hyp">Supposé : ${d.hypotheses.map(echapper).join(' · ')}</div>` : '';
        return `<span class="etat-eclairage-point ${classe}"></span><span class="etat-eclairage-texte"><strong>${echapper(d.libelle)}</strong> à ${heure}${kelvin}${raison}</span>${hyp}`;
    },

    /** Le bilan d'une couche pour la légende : « 8 allumés · 2 éteints », avec les raisons en infobulle. */
    htmlLegende(layer) {
        const b = resumerEtats(this.etats, layer.id);
        if (!b.total) return '';
        const parties = [];
        if (b.allumes) parties.push(`${b.allumes} allumé${b.allumes > 1 ? 's' : ''}`);
        if (b.abaisses) parties.push(`${b.abaisses} abaissé${b.abaisses > 1 ? 's' : ''}`);
        if (b.eteints) parties.push(`${b.eteints} éteint${b.eteints > 1 ? 's' : ''}`);
        const infobulle = b.raisons.length ? b.raisons.map((x) => `${x.raison} (${x.n})`).join(' ; ') : 'Éclairage à l’heure de la scène';
        return `<div class="legend-etat" title="${echapper(infobulle)}"><span class="etat-eclairage-point ${b.allumes || b.abaisses ? 'allume' : 'eteint'}"></span>${parties.join(' · ')}</div>`;
    },

    /** Remet à jour ce qui montre un état : la fiche ouverte, et la légende quand un bilan change. */
    rafraichirAffichage() {
        const el = document.getElementById('insp-etat-eclairage');
        if (el) {
            const layer = STATE.layers.find((l) => l.id === STATE.selection?.layerId);
            const idx = STATE.selection?.features?.[0];
            if (layer && idx != null) el.innerHTML = this.htmlEtat(layer, idx);
        }
        const signature = STATE.layers.filter((l) => l.visible !== false && coucheEclairage(l)).map((l) => {
            const b = resumerEtats(this.etats, l.id);
            return `${l.id}:${b.allumes}/${b.abaisses}/${b.eteints}`;
        }).join('|');
        if (signature !== this._signatureLegende) { this._signatureLegende = signature; updateLegend(); }
    },
};
try { window.__atlasEclairage = Eclairage; window.__atlasConfig = CONFIG; } catch (_) { /* hors navigateur */ }

/**
 * Entités pour ombres d'extrusion : en mémoire si Atlas les détient, sinon
 * via la source MapLibre (couches `geojson: url` distantes).
 * Préfère `_data` complet de la source GeoJSON à `querySourceFeatures`
 * (index tuilé incomplet → bâti proche souvent absent).
 */
function featuresForExtrusionShadow(layer) {
    const gj = filteredGeoJSON(layer);
    if (gj && typeof gj === 'object' && Array.isArray(gj.features)) return gj.features;
    if (layer._shadowFeatCache?.length) return layer._shadowFeatCache;
    const src = map?.getSource?.(layer.id);
    // GeoJSONSource MapLibre : `_data` = FeatureCollection entière après fetch.
    const raw = src?._data ?? src?._options?.data;
    if (raw && typeof raw === 'object' && Array.isArray(raw.features)) {
        layer._shadowFeatCache = raw.features;
        return raw.features;
    }
    if (!src) return [];
    try {
        const feats = map.querySourceFeatures(layer.id) || [];
        const seen = new Set();
        const out = [];
        for (const f of feats) {
            const id = f.id ?? f.properties?._idx ?? f.properties?._osmId
                ?? JSON.stringify(f.geometry?.coordinates?.[0]?.[0]);
            if (seen.has(id)) continue;
            seen.add(id);
            out.push(f);
        }
        return out;
    } catch (_) {
        return [];
    }
}

/** Précharge le GeoJSON distant pour les ombres bâti (une fois par couche). */
async function ensureShadowFeatures(layer) {
    if (layer._shadowFeatCache?.length) return layer._shadowFeatCache;
    const local = filteredGeoJSON(layer);
    if (local && typeof local === 'object' && Array.isArray(local.features)) {
        layer._shadowFeatCache = local.features;
        return layer._shadowFeatCache;
    }
    const fromSrc = featuresForExtrusionShadow(layer);
    if (fromSrc.length > 100) { // _data déjà peuplé
        layer._shadowFeatCache = fromSrc;
        return fromSrc;
    }
    const url = typeof layer.geojson === 'string' ? layer.geojson : null;
    if (!url) return fromSrc;
    try {
        const r = await fetch(url);
        if (!r.ok) return fromSrc;
        const gj = await r.json();
        layer._shadowFeatCache = gj.features || [];
        return layer._shadowFeatCache;
    } catch (_) {
        return fromSrc;
    }
}

/** Centroïde lng/lat grossier d'une feature polygone (ombres bâti). */
function featureCentroidLngLat(feature) {
    const g = feature?.geometry;
    if (!g) return null;
    if (g.type === 'Point') return g.coordinates;
    let ring = null;
    if (g.type === 'Polygon') ring = g.coordinates?.[0];
    else if (g.type === 'MultiPolygon') ring = g.coordinates?.[0]?.[0];
    if (!ring?.length) return null;
    let x = 0, y = 0, n = 0;
    for (const p of ring) {
        if (p?.[0] == null) continue;
        x += p[0]; y += p[1]; n++;
    }
    return n ? [x / n, y / n] : null;
}

function featureExtrusionHeightM(feature, layer) {
    const p = feature?.properties || {};
    if (layer?.heightField != null && p[layer.heightField] != null && p[layer.heightField] !== '') {
        const h = Number(p[layer.heightField]);
        if (Number.isFinite(h) && h > 0) return Math.min(h, 120);
    }
    for (const k of ['height_m', 'height', 'building:levels']) {
        if (p[k] == null || p[k] === '') continue;
        let h = Number(p[k]);
        if (k === 'building:levels' && Number.isFinite(h)) h *= 3.2;
        if (Number.isFinite(h) && h > 0) return Math.min(h, 120);
    }
    const sym = layer?.style?.symbolization?.size;
    const v = Number(sym?.value);
    return Number.isFinite(v) && v > 0 ? v : 12;
}

function simplifyRingLngLat(ring, maxPts = 28) {
    if (!ring?.length) return [];
    // drop closing duplicate
    const open = ring.length > 1
        && ring[0][0] === ring[ring.length - 1][0]
        && ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1)
        : ring.slice();
    if (open.length <= maxPts) return open;
    const step = Math.ceil(open.length / maxPts);
    const out = [];
    for (let i = 0; i < open.length; i += step) out.push(open[i]);
    const last = open[open.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return out;
}

/** Emprise approx. en mètres locaux (bbox) pour caster d'ombre bâti. */
function featureFootprintMeters(feature, toLocal) {
    const g = feature?.geometry;
    let ring = null;
    if (g?.type === 'Polygon') ring = g.coordinates?.[0];
    else if (g?.type === 'MultiPolygon') ring = g.coordinates?.[0]?.[0];
    if (!ring?.length) return { w: 8, d: 8 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of ring) {
        if (pt?.[0] == null) continue;
        const lm = toLocal(pt[0], pt[1]);
        if (lm.x < minX) minX = lm.x;
        if (lm.x > maxX) maxX = lm.x;
        if (lm.y < minY) minY = lm.y;
        if (lm.y > maxY) maxY = lm.y;
    }
    if (!Number.isFinite(minX)) return { w: 8, d: 8 };
    return { w: Math.min(maxX - minX, 80), d: Math.min(maxY - minY, 80) };
}

/**
 * Emprise GeoJSON → ExtrudeGeometry en mètres locaux (plan XY = est/nord).
 * `toLocal(lng,lat) -> {x,y}` avec y = nord.
 * Conservé pour debug / raffinement futur (casters footprint exact).
 */
function extrudeFeatureToGeometry(feature, heightM, toLocal) {
    const g = feature?.geometry;
    if (!g || !(heightM > 0)) return null;
    const polys = g.type === 'Polygon' ? [g.coordinates]
        : g.type === 'MultiPolygon' ? g.coordinates
            : null;
    if (!polys?.length) return null;
    // Plus grand anneau extérieur
    let best = null, bestArea = -1;
    for (const poly of polys) {
        const outer = poly?.[0];
        if (!outer || outer.length < 3) continue;
        let a = 0;
        for (let i = 0; i < outer.length - 1; i++) {
            a += outer[i][0] * outer[i + 1][1] - outer[i + 1][0] * outer[i][1];
        }
        a = Math.abs(a);
        if (a > bestArea) { bestArea = a; best = poly; }
    }
    if (!best) return null;
    const ring = simplifyRingLngLat(best[0]);
    if (ring.length < 3) return null;
    const shape = new THREE.Shape();
    ring.forEach((pt, i) => {
        const lm = toLocal(pt[0], pt[1]);
        if (i === 0) shape.moveTo(lm.x, lm.y);
        else shape.lineTo(lm.x, lm.y);
    });
    shape.closePath();
    // Trous (cours intérieures) — utile pour l'écrin Vieille Charité
    for (let h = 1; h < best.length; h++) {
        const holeRing = simplifyRingLngLat(best[h], 20);
        if (holeRing.length < 3) continue;
        const hole = new THREE.Path();
        holeRing.forEach((pt, i) => {
            const lm = toLocal(pt[0], pt[1]);
            if (i === 0) hole.moveTo(lm.x, lm.y);
            else hole.lineTo(lm.x, lm.y);
        });
        hole.closePath();
        shape.holes.push(hole);
    }
    try {
        return new THREE.ExtrudeGeometry(shape, {
            depth: heightM,
            bevelEnabled: false,
            curveSegments: 1,
        });
    } catch (e) {
        console.warn('[Atlas] extrusion ombre', e.message);
        return null;
    }
}

function getLayerModelUrl(layer) {
    const s = layer.style;
    if (!s) return null;
    if (s.mode === 'custom' && s.custom?.url) return s.custom.url;
    if (s.mode === 'library' && s.library?.modelId) { const m = findModel(s.library.modelId); return m?.url || null; }
    return null;
}
/**
 * L'identifiant du modele d'une entite — bibliotheque low-poly OU `objet:<type>` (lib/modele-id.js).
 * Priorite : `_modelId` de l'entite, puis la categorie de son champ, puis le repli par champ, puis
 * le modele de la couche. Une seule regle, lue partout (placement, rendu, export).
 */
function modelIdDeEntite(feature, layer) {
    const p = feature?.properties || {};
    const sym = layer?.style?.symbolization || {};
    let modelId = p._modelId ?? null;
    if (!modelId && sym.model?.mode === 'categorized' && sym.model.field) {
        const cat = sym.model.categories?.find((c2) => String(c2.value) === String(p[sym.model.field]));
        modelId = cat?.modelId ?? sym.model.defaultModelId ?? null;
    }
    if (!modelId) modelId = layer?.style?.library?.modelId ?? null;
    return modelId;
}
function resolveFeatureProps(feature, layer) {
    const p = feature.properties || {};
    const c = layer.style?.common || {};
    const sym = layer.style?.symbolization || {};
    const baseModel = layer.style?.library?.modelId ? findModel(layer.style.library.modelId) : null;
    const num = (vals, d) => { for (const v of vals) { if (v != null && v !== '') { const n = Number(v); if (!isNaN(n)) return n; } } return d; };

    let symScale = null;
    if (sym.size?.mode === 'graduated' && sym.size.field && (layer.style?.mode === 'library' || layer.style?.mode === 'custom')) {
        const r = getNumericRange(layer, sym.size.field);
        symScale = interpolateValue(p[sym.size.field], [r.min, r.max], sym.size.outputRange || [0.5, 3], sym.size.method);
    }
    const modelId = modelIdDeEntite(feature, layer);

    return {
        scale: num([p._scale, symScale, c.scale, baseModel?.scale], 1),
        rotationX: num([p._rotationX, c.rotationX], 0),
        rotationY: num([p._rotationY, c.rotationY], 0),
        rotationZ: num([p._rotationZ, c.rotationZ], 0),
        offsetX: num([p._offsetX, c.offsetX], 0),
        offsetY: num([p._offsetY, c.offsetY], 0),
        offsetZ: num([p._offsetZ, c.offsetZ], 0),
        modelId,
    };
}

// ============================================================
// MAP (MapLibre)
// ============================================================
/**
 * Le fond quand le réseau manque : un aplat. Sans lui, le style de base ne se lit jamais, la carte ne déclare jamais être
 * chargée, et les couches — qui sont sur l'appareil — ne se montent pas : une scène préparée pour le terrain s'ouvrirait sur
 * du blanc. Les glyphes restent ceux du réseau (les étiquettes manqueront, pas les données).
 */
const STYLE_HORS_RESEAU = {
    version: 8, name: 'Hors réseau',
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {},
    layers: [{ id: 'fond-hors-reseau', type: 'background', paint: { 'background-color': '#ece7da' } }],
};
let _fondDeRepli = false;

function initMap() {
    const _bm = BASEMAPS[STATE.settings.basemap] || BASEMAPS.liberty;
    // L'appareil dit déjà qu'il n'a pas de réseau : inutile d'attendre un style qui ne viendra pas.
    _fondDeRepli = typeof navigator !== 'undefined' && navigator.onLine === false;
    map = new maplibregl.Map({
        container: 'map',
        style: _fondDeRepli ? STYLE_HORS_RESEAU : (_bm.style ? _bm.style() : _bm.url),
        center: [STATE.location.lng, STATE.location.lat],
        zoom: CONFIG.defaultZoom,
        pitch: CONFIG.defaultPitch,
        bearing: CONFIG.defaultBearing,
        antialias: true,
        maxPitch: 80,
    });
    // Accès debug (couche custom / matrices MapLibre 5).
    try { window.__atlasMap = map; window.__Models3D = Models3D; } catch (_) {}

    map.on('load', onStyleReady);
    // Le style de base illisible (réseau coupé, instance injoignable) : un aplat, et les données s'affichent quand même.
    map.on('error', (e) => {
        if (_fondDeRepli || _styleUsable) return;
        const msg = String(e?.error?.message || '');
        if (!/fetch|network|load failed|failed to|timeout|offline|impossible/i.test(msg) && e?.error?.status !== 0) return;
        _fondDeRepli = true;
        try { map.setStyle(STYLE_HORS_RESEAU); } catch (_) { /* la carte reprendra au prochain essai */ }
        showToast('Fond de carte indisponible sans réseau — vos données restent affichées', 'info');
    });
    // Les icônes de catégorie se chargent quand la carte les réclame — y compris
    // après un changement de fond, qui vide les images du style.
    map.on('styleimagemissing', (e) => { if (e.id?.startsWith('atlas-ico-')) chargerIcone(e.id); });
    // Zone visible et visée : voir « Visée de caméra » plus bas.
    map.on('resize', suivreTailleCarte);
    // Sur téléphone, la barre du bas recouvre la carte dès l'ouverture.
    map.once('load', () => appliquerMarges());
    map.on('dragstart', () => { _visee = null; });
    map.on('wheel', () => { _visee = null; });

    map.on('move', updateHUD);
    map.on('moveend', majBandeauInfos);
    map.on('moveend', majEmpriseOSM);
    map.on('pitchend', () => {
        if (_openDockPill === 'view3d') renderDockSlotHost();
    });
    map.on('rotate', () => {
        $('compass-svg').style.transform = `rotate(${map.getBearing()}deg)`;
    });
    // Re-instancie les modeles dans l'emprise. Le cache d'altitude, lui, n'est
    // PAS invalide ici : il l'etait a chaque `moveend`, si bien qu'un simple
    // panoramique faisait re-sonder tous les objets — ceux dont la tuile DEM
    // n'etait pas revenue retombaient a zero et la scene sautait. Les altitudes
    // ne sont rejouees qu'au changement de palier de zoom (`recalerSiPalierDem`),
    // seul moment ou la resolution du MNT change vraiment.
    // Les tuiles du MNT arrivent apres coup, et a une resolution qui depend du
    // zoom : sur un meme point, `queryTerrainElevation` a rendu 1029,79 m a
    // z16,8 et 1034,14 m a z18,3 — 4,35 m d'ecart pour la seule finesse du
    // maillage. Les objets poses sur le releve precedent se retrouvent alors
    // au-dessus ou sous le sol, ce qui, en vue oblique, se lit comme un
    // glissement lateral. On rejoue donc le calage quand le relief lui-meme
    // change, pas seulement quand le zoom franchit un palier.
    map.on('data', (e) => {
        if (!STATE.settings.terrain3D) return;
        // Une tuile arrivée porte `tile`, pas `sourceDataType` (cf. `evenementMntArrive`).
        if (!evenementMntArrive(e)) return;
        clearTimeout(_tuilesDemTimer);
        // Le cache d'altitude n'a pas à être purgé ici : `recalerRelief` appelle
        // `Models3D.recomputeAll()`, qui le vide en entrée. Vérifié — l'origine
        // est toujours posée (à défaut de modèle, sur le centre de la carte) et
        // la scène three.js est créée inconditionnellement, donc la garde de
        // `recomputeAll` est franchie et la purge a bien lieu.
        _tuilesDemTimer = setTimeout(() => recalerRelief(0), 600);
    });

    map.on('moveend', () => {
        recalerSiPalierDem();
        Models3D.cull();
        clearTimeout(_cameraSaveTimer);
        _cameraSaveTimer = setTimeout(saveMapCamera, 400);
    });
    // Pendant le pan avec ombres : recaler les casters avant le moveend,
    // sinon l'emprise ombrée reste celle de l'arrêt précédent.
    map.on('move', () => {
        if (!STATE.settings.shadows || STATE.settings.terrain3D) return;
        clearTimeout(Models3D._shadowMoveTimer);
        Models3D._shadowMoveTimer = setTimeout(() => Models3D.cull(), 140);
    });

    try {
        _geoloc = new maplibregl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
            showAccuracyCircle: true,
        });
        map.addControl(_geoloc, 'bottom-right');
        suivreBandeAttribution();
        // La pastille s'allume tant que la carte suit la position — l'état que
        // le bouton d'origine signalait en bleu. Déplacer la carte à la main
        // rompt le suivi : MapLibre émet alors `trackuserlocationend`.
        const suivre = (actif) => { _suiviPosition = actif; refreshControlsDock(); };
        _geoloc.on('trackuserlocationstart', () => suivre(true));
        // Retenue pour la pastille « Relevé » : l'objet le plus proche se
        // calcule depuis la ou l'on se tient, pas depuis le centre de la carte.
        _geoloc.on('geolocate', (p) => {
            _dernierePosition = [p.coords.longitude, p.coords.latitude];
            if (_openDockPill === 'releve') renderDockSlotHost();
            if (_liste && $('liste-lignes')) renderListeLignes();
            if (_storyPresenting && _trajetSuivi && !_trajetPause && !$('inspector')?.classList.contains('open')) {
                const trace = traceActuelle();
                if (trace?.coordinates?.length >= 2) {
                    const proj = projeter(trace.coordinates, _dernierePosition);
                    const next = indexSuivi(proj.abscisse);
                    if (next != null && next !== _storyIdx) allerEtape(next, { suivi: true });
                }
            }
            if (_storyPresenting) majAlerteTrajet();
        });
        _geoloc.on('trackuserlocationend', () => {
            suivre(false);
            if (_storyPresenting && _trajetSuivi) {
                _trajetPause = true;
                renderStoryPresentation();
            }
        });
        _geoloc.on('error', (err) => {
            suivre(false);
            showToast(err?.code === 1
                ? 'Localisation refusée par le navigateur'
                : 'Position introuvable pour le moment', 'warning');
        });
    } catch (e) { console.warn('[Atlas] geolocate', e.message); }

    setupInteraction();
}

function applyProjection() {
    if (!map || typeof map.setProjection !== 'function') return; // MapLibre < v5
    try { map.setProjection({ type: STATE.settings.projection || 'globe' }); } catch (e) {}
}

function onStyleReady() {
    // Le style de base est en place : les couches peuvent être montées, même
    // si des sources sont encore en cours de chargement.
    _styleUsable = true;
    // Projection (globe façon Google Earth, bascule auto vers mercator en zoom)
    applyProjection();
    // 3D buildings come with the Liberty style (fill-extrusion). Toggle visibility.
    applyBuildingVisibility();
    applyLabelsVisibility();

    // Terrain (source DEM choisie : terrarium mondial ou LIDAR HD IGN)
    addTerrainSource();
    applyTerrain();
    applySky();

    // Re-add the three.js custom layer (au-dessus du fond raster / ortho).
    if (!map.getLayer(Models3D.layerId)) map.addLayer(Models3D.makeLayer());
    try {
        // Remonter en tête de pile après un setStyle (sinon l'ortho IGN
        // peut rester peinte au-dessus et masquer entièrement le GLB).
        const layers = map.getStyle()?.layers || [];
        const top = layers.length ? layers[layers.length - 1].id : null;
        if (top && top !== Models3D.layerId && map.getLayer(Models3D.layerId)) {
            map.moveLayer(Models3D.layerId);
        }
    } catch (_) { /* style encore incomplet */ }
    // La nuit, juste sous le calque three.js : un `setStyle` l'a retirée.
    poserCoucheNuit();

    // Reapply all data layers après idle (style + tuiles prêts à peindre)
    scheduleMapLayersSync(() => {
        if (STATE.layers.length && !_initialViewportApplied) {
            applyInitialViewport(computeLayersBounds());
        }
        // Remount après settle caméra (évite couches fantômes post-globe)
        if (STATE.layers.length) {
            map.once('idle', () => {
                syncAllLayersToMap();
                updateLegend();
            });
        }
    });

    updateLighting();
    updateHUD();
    rafraichirTrajet();
    let _alerteTimer = 0;
    if (!map._trajetMoveend) {
        map._trajetMoveend = true;
        map.on('moveend', () => {
            if (!_storyPresenting || !traceActuelle()) return;
            clearTimeout(_alerteTimer);
            _alerteTimer = setTimeout(majAlerteTrajet, 200);
        });
    }
}

function saveMapCamera() {
    if (!map || _storyPresenting || !_initialViewportApplied) return;
    try {
        const c = map.getCenter();
        sessionStorage.setItem(cameraStorageKey(), JSON.stringify({
            lng: c.lng,
            lat: c.lat,
            zoom: map.getZoom(),
            pitch: map.getPitch(),
            bearing: map.getBearing(),
        }));
    } catch (_) { /* quota / mode privé */ }
}

function restoreMapCamera() {
    if (!map) return false;
    try {
        const raw = sessionStorage.getItem(cameraStorageKey());
        if (!raw) return false;
        const cam = JSON.parse(raw);
        if (typeof cam.lng !== 'number' || typeof cam.lat !== 'number') return false;
        map.jumpTo({
            center: [cam.lng, cam.lat],
            zoom: cam.zoom ?? CONFIG.defaultZoom,
            pitch: cam.pitch ?? CONFIG.defaultPitch,
            bearing: cam.bearing ?? CONFIG.defaultBearing,
        });
        return true;
    } catch (_) {
        return false;
    }
}

/** fitBounds initial si pas de caméra session valide près des données. */
function shouldAutoFitBounds(bounds) {
    return shouldAutoFitInitialBounds(bounds, cameraStorageKey());
}

/** La clé stable d'une couche pour le cadrage : sa table, sinon son nom (l'identifiant change d'une ouverture à l'autre). */
const cleCadrage = (l) => l.sourceTable || l.name;
function couchesCadrage() { return STATE.layers.map((l) => ({ id: cleCadrage(l), bornes: boundsFromGeoJSON(l.geojson) })); }
function cameraCourante() {
    const c = map.getCenter();
    return { lng: c.lng, lat: c.lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
}

/** Pose le cadrage demandé ; `anime` pour un geste de l'auteur, pas pour l'ouverture. */
function poserCadrage(cible, anime) {
    const duration = anime ? 900 : 0;
    if (cible.type === 'bornes') map.fitBounds(cible.bornes, { padding: margeCadrage(), maxZoom: 16, duration });
    else if (cible.type === 'camera') {
        const o = { center: [cible.camera.lng, cible.camera.lat], zoom: cible.camera.zoom, pitch: cible.camera.pitch, bearing: cible.camera.bearing };
        if (anime) map.flyTo({ ...o, duration }); else map.jumpTo(o);
    } else {
        const o = { center: cible.centre, zoom: cible.zoom };
        if (anime) map.flyTo({ ...o, duration }); else map.jumpTo(o);
    }
}

/**
 * L'ancre de la scène (le soleil, le fuseau) suit les données tant que personne n'a désigné de lieu : une scène de Lyon ne
 * se règle plus sur le Vieux-Port de Marseille parce qu'on n'a rien dit.
 */
function ancrerSurDonnees(bornes) {
    if (STATE.locationChoisie) return;
    const c = centreDesBornes(bornes);
    if (!c) return;
    STATE.location = { ...STATE.location, name: 'Emprise des données', lat: c.lat, lng: c.lng };
    try { updateLighting(); } catch (_) { /* la scène n'est pas encore prête : l'éclairage se posera avec elle */ }
}

/** Quelqu'un vient de désigner un lieu : il devient l'ancre, et la scène s'ouvrira dessus. */
function lieuChoisi() {
    STATE.locationChoisie = true;
    const l = STATE.location;
    STATE.exposition = normaliserExposition({ ...STATE.exposition, cadrage: { mode: 'lieu', lieu: { lng: l.lng, lat: l.lat, nom: l.name } } });
    persistScenePrefsDifferee(200);
}

/**
 * Une scène qu'on vient de créer s'ouvre vide : on propose tout de suite d'y poser la première couche, plutôt que de laisser
 * une carte sans rien. Le drapeau est posé par l'écran « Nouvelle scène » et ne sert qu'une fois.
 */
async function accueilSceneNeuve() {
    try {
        const id = await grist.docApi.getDocName();
        if (!id || localStorage.getItem('atlas_nouvelle_scene') !== String(id)) return;
        localStorage.removeItem('atlas_nouvelle_scene');
        if (CONFIG.viewMode) return;
        openModule('couches');
        showToast('Scène créée — ajoutez-y une première couche', 'info');
    } catch (_) { /* sans importance : la scène s'ouvre comme n'importe quelle autre */ }
}

/** Les préférences de la scène viennent d'arriver : le cadrage de l'auteur s'applique, sauf si l'on a déjà bougé la carte. */
function appliquerCadrageDeScene() {
    const c = STATE.exposition?.cadrage;
    if (!c) return;
    if (c.mode === 'lieu') {
        STATE.location = { ...STATE.location, name: c.lieu.nom || STATE.location.name, lat: c.lieu.lat, lng: c.lieu.lng };
        STATE.locationChoisie = true;
    }
    if (!map || CONFIG.sceneExterne) return;
    try { if (sessionStorage.getItem(cameraStorageKey())) return; } catch (_) { /* stockage refusé : on applique */ }
    const cible = cadrageEffectif({ cadrage: c, couches: couchesCadrage() });
    if (cible && (cible.type !== 'bornes' || c.couche || STATE.layers.length)) { poserCadrage(cible, false); _initialViewportApplied = true; }
}

function applyInitialViewport(bounds) {
    if (_initialViewportApplied || !map) return;
    const cible = cadrageEffectif({ cadrage: STATE.exposition?.cadrage, couches: couchesCadrage() });
    // Une vue figée ou un lieu : la caméra de session, si on en a une, prime comme pour toute reprise.
    if (cible && cible.type !== 'bornes') {
        if (!restoreMapCamera()) poserCadrage(cible, false);
        _initialViewportApplied = true;
        return;
    }
    const b = cible?.bornes || bounds || computeLayersBounds();
    if (b) ancrerSurDonnees(computeLayersBounds() || b);
    if (b && shouldAutoFitBounds(b)) {
        map.fitBounds(b, { padding: margeCadrage(), maxZoom: 16, duration: 800 });
        _initialViewportApplied = true;
        console.log('[Atlas v7] fitBounds initial', b);
        return;
    }
    if (restoreMapCamera()) {
        _initialViewportApplied = true;
        console.log('[Atlas v7] caméra session restaurée');
    } else if (b) {
        map.fitBounds(b, { padding: margeCadrage(), maxZoom: 16, duration: 800 });
        _initialViewportApplied = true;
        console.log('[Atlas v7] fitBounds (caméra session stale ignorée)', b);
    }
}

/** Applique une visibilité aux couches du fond d'un type donné. */
function setBasemapLayersVisibility(type, vis) {
    for (const id of basemapLayerIds(map.getStyle().layers, type)) {
        try { map.setLayoutProperty(id, 'visibility', vis); } catch (e) { /* couche retirée */ }
    }
}

/**
 * Bâti en volume du **fond de carte**. Ne touche pas aux couches de données :
 * une couche Atlas surfacique rendue en volume est elle aussi une
 * `fill-extrusion`, mais sa visibilité appartient au panneau Couches.
 */
function applyBuildingVisibility() {
    const vis = STATE.settings.buildings3D ? 'visible' : 'none';
    setBasemapLayersVisibility('fill-extrusion', vis);
}

/** Libellés du fond (rues, villes) — pas les étiquettes des couches Atlas. */
function applyLabelsVisibility() {
    if (!map?.getStyle()?.layers) return;
    const vis = STATE.settings.labels ? 'visible' : 'none';
    setBasemapLayersVisibility('symbol', vis);
}
function addTerrainSource() {
    const cfg = TERRAIN_SOURCES[STATE.settings.terrainSource] || TERRAIN_SOURCES.terrarium;
    if (!map.getSource('terrain-dem')) {
        try {
            map.addSource('terrain-dem', { type: 'raster-dem', tiles: cfg.tiles, encoding: cfg.encoding, tileSize: cfg.tileSize, maxzoom: cfg.maxzoom, attribution: cfg.attribution });
        } catch (e) { /* ignore */ }
    }
    // MapLibre 5.6.1 laisse « reloading » à jamais une tuile MNT rechargée
    // (changement de projection, relief rallumé) : plus aucun `idle` ensuite.
    garderDemAuRechargement(map.getSource('terrain-dem'));
}
function applyTerrain() {
    if (!map.getSource('terrain-dem')) return;
    if (STATE.settings.terrain3D) map.setTerrain({ source: 'terrain-dem', exaggeration: STATE.settings.terrainExaggeration });
    else map.setTerrain(null);
    // Le relief change ce qu'un volume peut faire : les grandes surfaces passent à plat, ou en volume.
    for (const l of STATE.layers) {
        if ((l.geometryType === 'Polygon' || l.geometryType === 'MultiPolygon') && l.style?.polygonMode !== 'flat' && l._nVastes > 0) applyLayerStyle(l);
    }
}
function setTerrainSource(src) {
    STATE.settings.terrainSource = src;
    if (!map) return;
    try { map.setTerrain(null); } catch (e) {}
    if (map.getSource('terrain-dem')) { try { map.removeSource('terrain-dem'); } catch (e) {} }
    addTerrainSource();
    if (STATE.settings.terrain3D) applyTerrain();
    recalerRelief(); // le MNT doit d'abord se charger
}
function applySky() {
    if (typeof map.setSky !== 'function') return;
    if (STATE.settings.sky) {
        map.setSky({ 'sky-color': '#bcd4e8', 'horizon-color': '#f3ecd9', 'fog-color': '#f3ecd9', 'fog-ground-blend': 0.4, 'horizon-fog-blend': 0.6, 'sky-horizon-blend': 0.6 });
    } else { try { map.setSky(null); } catch (e) {} }
}

function updateHUD() {
    if (!map) return;
    const c = map.getCenter();
    $('hud-coords').textContent = `${c.lat.toFixed(4)}°N · ${c.lng.toFixed(4)}°E`;
    $('hud-zoom').textContent = `zoom ${map.getZoom().toFixed(1)}`;
    $('hud-pitch').textContent = `pitch ${Math.round(map.getPitch())}°`;
}

// ============================================================
// ÉCLAIRAGE SOLAIRE (SunCalc → MapLibre light + three.js)
// ============================================================
function sunPosition() {
    // L'instant se compose dans le fuseau DE LA SCÈNE (lib/horloge-scène.js) :
    // `setHours` le composait dans celui du navigateur, et la même scène ouverte
    // à La Réunion montrait Marseille à 14 h 30 de La Réunion. L'ambiance reste
    // prise au centre de la vue, avec SunCalc ; les comportements (luminaires)
    // prennent le soleil NOAA à l'ancre de la scène (`Eclairage`).
    const d = new Date(instantScene(STATE.settings));
    const c = map ? map.getCenter() : { lat: STATE.location.lat, lng: STATE.location.lng };
    let azimuth = 180, altitude = 45;
    if (typeof SunCalc !== 'undefined') {
        try {
            const s = SunCalc.getPosition(d, c.lat, c.lng);
            azimuth = ((s.azimuth * 180 / Math.PI) + 180) % 360;
            altitude = s.altitude * 180 / Math.PI;
        } catch (e) {}
    }
    return { azimuth, altitude, date: d };
}
function updateLighting() {
    if (!map) return;
    const { azimuth, altitude, date } = sunPosition();
    const c = map.getCenter();
    const moon = computeMoon(date, c.lat, c.lng);
    const amb = computeAmbient(altitude, moon);
    const polar = clamp(90 - altitude, 5, 88);
    try { map.setLight({ anchor: 'map', position: [1.2, azimuth, polar], color: amb.mapColor, intensity: amb.mapIntensity }); } catch (e) {}
    if (STATE.settings.sky && typeof map.setSky === 'function') {
        // atmosphere-blend : halo atmosphérique du globe en vue large, estompé en zoom
        try { map.setSky({ 'sky-color': amb.sky, 'horizon-color': amb.horizon, 'fog-color': amb.horizon, 'fog-ground-blend': 0.4, 'horizon-fog-blend': 0.6, 'sky-horizon-blend': 0.7, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 1, 9, 0] }); } catch (e) {}
    }
    // Teinte nocturne de la scène (le fond vecteur ne s'assombrit pas seul) — atténuée par la lune.
    // Elle n'est plus un voile CSS posé sur les canvas, qui aurait éteint toute
    // lampe : la couche `atlas-nuit` multiplie le rendu MapLibre sous le calque
    // three.js, et les lumières des modèles reçoivent le même facteur
    // (lib/nuit-rendu.js). De jour, le facteur vaut exactement 1 : rien ne change.
    NUIT.facteurs = facteursNuit(opaciteNuit(altitude, moon));
    Models3D.setSun(azimuth, altitude, moon);
    Eclairage.mettreAJourEtats();
    map.triggerRepaint();
    updateSunStrip();
}

function updateSunStrip() {
    const { azimuth, altitude, date } = sunPosition();
    const min = STATE.settings.timeOfDay;
    const h = Math.floor(min / 60), m = min % 60;
    const tEl = $('sun-time'), dEl = $('sun-date'), aEl = $('sun-alt');
    if (tEl) tEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (dEl) dEl.textContent = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: fuseauScene(STATE.settings) });
    if (aEl) aEl.textContent = `${altitude.toFixed(0)}°`;
    const dot = $('sun-dot');
    if (!dot) return;
    // L'arc couvre les vingt-quatre heures et suit la hauteur réelle du soleil
    // (NOAA, à l'ancre et au jour de la scène : le même soleil que les
    // luminaires). Il couvrait 6 h – 20 h : la nuit était hors d'atteinte.
    const g = geometrieArcScene();
    const chemin = $('sun-arc-path');
    if (chemin && chemin.getAttribute('d') !== g.chemin) chemin.setAttribute('d', g.chemin);
    const horizon = $('sun-arc-horizon');
    if (horizon) { horizon.setAttribute('y1', g.horizonY.toFixed(1)); horizon.setAttribute('y2', g.horizonY.toFixed(1)); }
    const p = g.point(min);
    dot.style.left = `${p.x}px`;
    dot.style.top = `${p.y - 6}px`;
    dot.classList.toggle('nuit', p.y > g.horizonY);
    const arc = $('sun-arc');
    if (arc) {
        arc.setAttribute('aria-valuenow', String(min));
        arc.setAttribute('aria-valuetext', libelleHeure(min));
    }
}

/** Géométrie de l'arc pour le jour, le fuseau et l'ancre de la scène — recalculée s'ils changent. */
let _arcSolaire = { cle: '', g: null };
function geometrieArcScene() {
    const fuseau = fuseauScene(STATE.settings);
    const jour = dateLocaleScene(STATE.settings);
    const lat = Number(STATE.location?.lat);
    const lng = Number(STATE.location?.lng);
    const cle = `${jour}|${fuseau}|${lat}|${lng}`;
    if (_arcSolaire.cle !== cle || !_arcSolaire.g) {
        const hauteurA = (m) => positionSoleil(lat, lng, instantLocal(jour, m, fuseau)).hauteur;
        // Marges de la demi-taille du point (12 px) : il reste entier dans l'arc,
        // dont le débord est masqué.
        _arcSolaire = { cle, g: geometrieArc(courbeHauteurs(hauteurA, 30), { margeHaut: 7, margeBas: 7 }) };
    }
    return _arcSolaire.g;
}

// ============================================================
// COUCHES — ajout sur la carte / styles
// ============================================================
function indexFeatures(layer) {
    (layer.geojson?.features || []).forEach((f, i) => {
        if (!f.properties) f.properties = {};
        f.properties._idx = i;
    });
    // La taille de chaque surface, pour savoir lesquelles un volume ne posera pas bien sur le relief.
    if (layer.geometryType === 'Polygon' || layer.geometryType === 'MultiPolygon') {
        layer._nVastes = marquerTailles(layer.geojson?.features).vastes;
    }
}

/** Les lignes sélectionnées sur cette couche — leur identité, pas leur rang. */
function lignesSelectionnees(layer) {
    if (!layer || STATE.selection.layerId !== layer.id || !STATE.selection.features.length) return null;
    return rowIdsDepuisRangs(layer.geojson?.features, STATE.selection.features);
}

/**
 * Après toute relecture d'une table : rangs recalculés, sélection suivie.
 *
 * Une relecture remplace les objets. `_idx` n'était recalculé que par certains
 * chemins, et `mergeFeatureOverrides` recopiait l'ancien : une ligne ajoutée
 * n'avait pas de rang — un clic la prenait pour l'objet 0, et elle n'avait pas
 * de modèle 3D. La sélection, gardée par rang, glissait sur un autre objet dès
 * qu'une ligne était ajoutée ou retirée avant elle. Elle suit maintenant la
 * ligne ; une ligne disparue ferme la sélection plutôt que d'en montrer une
 * autre. L'inspecteur n'est pas redessiné : une saisie en cours y survit.
 */
function apresRelecture(layer, lignes) {
    indexFeatures(layer);
    if (!lignes || STATE.selection.layerId !== layer.id) return;
    const rangs = rangsDepuisRowIds(layer.geojson?.features, lignes);
    if (!rangs.length) {
        exitSelectionMode();
        showToast('L’objet sélectionné n’existe plus dans la table', 'info');
        return;
    }
    STATE.selection.features = rangs;
    // Pendant un changement de fond, le halo sera reposé par la synchronisation.
    if (map && mapStyleUsable()) updateHighlight();
}
function sourceData(layer) {
    const d = filteredGeoJSON(layer);
    // Pendant qu'on modifie sa forme, l'objet n'est dessiné que par l'éditeur :
    // l'original resté dessous faisait deux formes, dont une qu'on ne bouge pas.
    const enEdition = objetEnModification(layer);
    if (enEdition == null || !Array.isArray(d?.features)) return d;
    return { ...d, features: d.features.filter((f) => f.properties?._row_id !== enEdition) };
}

/** Id de la source/couche de repli en points (cf. lib/point-fallback.js). */
function pointFallbackId(layer) { return layer.id + '-pts'; }

/**
 * Applique a une specification de couche MapLibre les bornes de zoom voulues.
 *
 * Deux sources se combinent, et la plus restrictive gagne : le seuil calcule du
 * repli en points (qui ne vaut que si Atlas detient les entites) et les bornes
 * que le manifeste declare. Prendre le maximum des deux minimums evite qu'une
 * couche remonte au-dessus de l'echelle ou son producteur la dit lisible.
 */
function poserBornesZoom(spec, layer, zFallback = null) {
    const z = layer?._zoom || {};
    const mins = [zFallback, z.minzoom].filter((v) => Number.isFinite(v));
    if (mins.length) spec.minzoom = Math.max(...mins);
    if (Number.isFinite(z.maxzoom)) spec.maxzoom = z.maxzoom;
    return spec;
}

function removeLayerGfx(layer) {
    if (!map) return;
    SUFFIXES_HABILLAGE.forEach((sfx) => {
        const id = layer.id + sfx;
        if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(layer.id)) map.removeSource(layer.id);
    if (map.getSource(pointFallbackId(layer))) map.removeSource(pointFallbackId(layer));
    if (map.getSource(layer.id + '-grappes')) map.removeSource(layer.id + '-grappes');
}

/**
 * Monte une couche de tuiles matricielles.
 *
 * Rien ne transite par Atlas : MapLibre va chercher les images au gabarit
 * d'adresse. D'ou l'absence de source GeoJSON, de symbologie et de controles —
 * un fond de plan n'a ni champ a graduer ni objet a inspecter.
 */
function addRasterLayerToMap(layer) {
    removeLayerGfx(layer);
    if (map.getSource(layer.id)) map.removeSource(layer.id);
    map.addSource(layer.id, {
        type: 'raster',
        tiles: layer._tiles,
        tileSize: layer._tileSize || 256,
        // Sans borne haute, un service qui ne sert pas au-dela d'un niveau
        // renvoie des erreurs en boucle et la carte n'atteint jamais `idle` :
        // tout ce qui attend cet etat reste suspendu.
        maxzoom: layer._zoom?.maxzoom ?? 19,
        ...(layer._attribution ? { attribution: layer._attribution } : {}),
    });
    map.addLayer(poserBornesZoom({
        id: layer.id, type: 'raster', source: layer.id,
        paint: { 'raster-opacity': Number.isFinite(layer.opacity) ? layer.opacity : 1 },
    }, layer));
    return true;
}

function addLayerToMap(layer) {
    if (!mapStyleUsable()) return false;
    if (layer._raster) {
        try { return addRasterLayerToMap(layer); }
        catch (e) { console.warn('[Atlas] tuiles non montées —', layer.name, e.message); return false; }
    }
    try {
        indexFeatures(layer);
        removeLayerGfx(layer);
        // qgis2grist : polygones à plat (évite fill-extrusion masqué / confondu avec le bâti OSM)
        if (layer.source === 'qgis2grist' && (layer.geometryType === 'Polygon' || layer.geometryType === 'MultiPolygon')) {
            layer.style = layer.style || { mode: 'mapbox' };
            if (layer.style.polygonMode == null) layer.style.polygonMode = 'flat';
        }
        const data = sourceData(layer);
        const nFeats = data?.features?.length || 0;
        // maxzoom 22 : sur relief incliné, MapLibre 5.6.1 levait au maxzoom 18
        // par défaut (`_updateRetainedTiles`, cf. `optionsSourceGeojson`).
        // Regroupement : les points se regroupent dans leur propre source ; pour une ligne ou une surface, ce sont
        // leurs centres, dans une source à part, et la forme n'apparaît qu'au-delà du zoom de regroupement.
        const symG = initSymbolization(layer);
        const cfgG = configGrappes(symG);
        const groupe = grappesActives(layer);
        const estPointG = layer.geometryType === 'Point' || layer.geometryType === 'MultiPoint';
        layer._sourceGroupee = !!(groupe && estPointG);
        layer._grappeZoom = groupe && !estPointG ? zoomFormes(cfgG) : null;
        map.addSource(layer.id, {
            ...optionsSourceGeojson(data || { type: 'FeatureCollection', features: [] }),
            ...(layer._sourceGroupee ? optionsGrappes(cfgG, symG) : {}),
        });
        if (layer._grappeZoom != null) {
            map.addSource(layer.id + '-grappes', { ...optionsSourceGeojson(centroidCollection(data)), ...optionsGrappes(cfgG, symG) });
        }
        // Surfaces menues : source de centres pour le rendu en petite échelle.
        const isFlatPolygon = (layer.geometryType === 'Polygon' || layer.geometryType === 'MultiPolygon')
            && layer.style?.polygonMode === 'flat';
        layer._pointFallbackZoom = isFlatPolygon && layer._grappeZoom == null ? pointFallbackZoom(layer.geojson) : null;
        // Nombre d'entités au moment de l'évaluation : une couche différée est
        // vide au montage, il faudra refaire le calcul quand elle se peuplera.
        layer._pointFallbackAt = layer.geojson?.features?.length || 0;
        if (layer._pointFallbackZoom != null) {
            map.addSource(pointFallbackId(layer), optionsSourceGeojson(centroidCollection(data)));
        }
        initSymbolization(layer);
        applyLayerStyle(layer);
        if (layer.visible === false) applyMapLayerVisibility(layer, false);
        else applyMapLayerVisibility(layer, true);
        if (!map.getLayer(layer.id)) {
            console.warn('[Atlas] addLayerToMap : pas de layer MapLibre pour', layer.name, '(features:', nFeats, ')');
            return false;
        }
        // La couche vient d'être empilée au sommet : remettre la pile d'aplomb.
        applyLayerOrder();
        return true;
    } catch (e) {
        console.error('[Atlas] addLayerToMap échoué:', layer.name, e);
        return false;
    }
}

function applyLayerStyle(layer) {
    if (!map || !map.getSource(layer.id)) return;
    // Un fond de tuiles n'a pas d'entites a peindre : sa seule apparence est
    // son opacite. Le faire passer par la symbologie vectorielle chercherait
    // des champs qui n'existent pas.
    if (layer._raster) {
        if (map.getLayer(layer.id)) {
            map.setPaintProperty(layer.id, 'raster-opacity',
                Number.isFinite(layer.opacity) ? layer.opacity : 1);
        }
        updateLegend();
        return;
    }
    if (layer.source === 'qgis2grist') {
        const sym = initSymbolization(layer).color;
        syncFeatureColorsFromSymbolization(layer, sequentialPaletteForSym(sym, layer));
        syncLayerSourceData(layer);
    }
    // Les habillages vont être retirés puis recréés : MapLibre les recrée au
    // sommet, visibles, sans filtre. On relève d'abord ce qu'il faudra rendre.
    const ancre = ancreAuDessus(map.getStyle().layers.map((l) => l.id), layer);
    const g = layer.geometryType;
    if (g === 'Point' || g === 'MultiPoint') applyPointStyle(layer);
    else if (g === 'LineString' || g === 'MultiLineString') applyLineStyle(layer);
    else applyPolygonStyle(layer);
    remettreEnPlace(layer, ancre);
    updateLegend();
}

/**
 * Rend à une couche restylée ce que sa recréation lui a fait perdre.
 *
 * Changer une couleur ou une épaisseur passait par un retrait puis un ajout.
 * La couche ressortait au sommet — des surfaces au fond recouvraient alors les
 * lignes, les points et le trajet —, visible même œil fermé, et une couche
 * distante perdait son filtre. L'ancre est relevée avant le retrait ; sans
 * ancre, la couche n'était pas montée et `addLayerToMap` rétablit la pile.
 */
function remettreEnPlace(layer, ancre) {
    if (ancre && map.getLayer(ancre)) {
        for (const id of layerGfxIds(layer).filter((i) => map.getLayer(i))) {
            try { map.moveLayer(id, ancre); } catch (_) { /* couche retirée entre-temps */ }
        }
    }
    if (layer.visible === false) applyMapLayerVisibility(layer, false);
    if (layer._distant) appliquerFiltreDistant(layer);
}

function colorExpression(layer, fallback) {
    const sym = initSymbolization(layer).color;
    if (sym.mode === 'categorized' && sym.field) {
        syncColorCategoriesFromFeatures(layer);
        const cats = sym.categories.length ? sym.categories
            : getUniqueValues(layer, sym.field).map((v, i) => ({ value: v.value, color: paletteColor(sym.palette, i, 99, sym.inverse), count: v.count }));
        sym.categories = cats;
        return buildColorMatch(sym.field, cats, sym.defaultColor || sym.value || fallback || layer.color);
    }
    if (sym.mode === 'graduated' && sym.field) {
        const r = getNumericRange(layer, sym.field);
        if (r.count) return buildColorGraduated(sym.field, [r.min, r.max], sym.colorRamp || sym.palette, sym.method, sym.inverse);
    }
    return sym.value || fallback || layer.color;
}

/**
 * L'ordre de dessin d'une couche dont la couleur vient d'une table de
 * référence : le plus grave par-dessus. `null` sans rang.
 */
function cleDeTriReference(layer) {
    const c = initSymbolization(layer).color;
    const rangs = c.reference?.rangs;
    if (c.mode !== 'categorized' || !c.field || !rangs || !Object.keys(rangs).length) return null;
    return expressionRang(c.field, new Map(Object.entries(rangs).map(([k, rang]) => [k, { rang }])));
}

/**
 * Les icônes d'une couche de points (onglet Icône) : une couche de symboles
 * au-dessus des cercles, qui gardent la couleur. Les images se chargent à la
 * demande (`styleimagemissing`), y compris après un changement de fond.
 */
function ajouterCoucheIcones(layer) {
    const ic = initSymbolization(layer).icon;
    if (ic?.mode !== 'reference' || !ic.field || !ic.images || !Object.keys(ic.images).length) return;
    const entrees = new Map(Object.entries(ic.images).map(([k, url]) => [k, { icone: url }]));
    for (const url of Object.values(ic.images)) ICONES.urls.set(idImage(url), url);
    const tri = cleDeTriReference(layer);
    map.addLayer({
        id: layer.id + '-icon', type: 'symbol', source: layer.id,
        ...(layer._sourceGroupee ? { filter: FILTRE_ISOLE } : {}),
        layout: {
            'icon-image': expressionIcone(ic.field, entrees),
            'icon-size': (ic.taille || 40) / 64,
            'icon-anchor': 'bottom',
            'icon-offset': [0, -4],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            ...(tri != null ? { 'symbol-sort-key': tri } : {}),
        },
    });
    // Préchargées tout de suite : `styleimagemissing` ne part pas toujours pour
    // une image désignée par expression (constaté : couche posée, aucune image
    // demandée). L'événement reste pour les changements de fond.
    for (const url of Object.values(ic.images)) chargerIcone(idImage(url));
}

function applyPointStyle(layer) {
    const s = layer.style;
    ['', '-hit', '-icon', '-label', '-grappe', '-grappe-n'].forEach((sfx) => { if (map.getLayer(layer.id + sfx)) map.removeLayer(layer.id + sfx); });
    const sym = initSymbolization(layer);

    if (s.mode === 'library' || s.mode === 'custom') {
        // 3D rendu par three.js ; petit cercle de hit discret pour clic/sélection,
        // qui s'estompe quand on zoome (là où la 3D prend le relais).
        map.addLayer({ id: layer.id, type: 'circle', source: layer.id, paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2, 15, 3, 19, 4.5],
            'circle-color': layer.color,
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.12, 16, 0.06, 18, 0.02],
            'circle-stroke-width': 0,
        }});
        Models3D.scheduleBuild();
    } else {
        // native circle
        let radius = sym.size.value || 8;
        if (sym.size.mode === 'graduated' && sym.size.field) {
            const r = getNumericRange(layer, sym.size.field);
            if (r.count) radius = buildNumGraduated(sym.size.field, [r.min, r.max], sym.size.outputRange, sym.size.method);
        }
        const stroke = layerStrokePaint(layer);
        const tri = cleDeTriReference(layer);
        map.addLayer({ id: layer.id, type: 'circle', source: layer.id,
            ...(layer._sourceGroupee ? { filter: FILTRE_ISOLE } : {}),
            ...(tri != null ? { layout: { 'circle-sort-key': tri } } : {}),
            paint: {
                'circle-radius': radius,
                'circle-color': layerPaintColor(layer),
                'circle-stroke-width': stroke.width,
                'circle-stroke-color': ['fixed', 'regle'].includes(initSymbolization(layer).stroke?.mode)
                    ? stroke.color : '#ffffff',
                'circle-opacity': layerPaintOpacity(layer),
            }});
    }
    ajouterCoucheIcones(layer);
    ajouterCouchesGrappes(layer);
    addLabelLayer(layer);
}

/**
 * Les ronds de regroupement : un par groupe, avec le nombre d'objets, et une couleur qui dit l'essentiel.
 * Pour une ligne ou une surface, ils se posent sur les centres et ne se voient que sous le zoom où la forme paraît.
 */
function ajouterCouchesGrappes(layer) {
    ['-grappe', '-grappe-n'].forEach((sfx) => { if (map.getLayer(layer.id + sfx)) map.removeLayer(layer.id + sfx); });
    if (!grappesActives(layer)) return;
    const estPoint = layer.geometryType === 'Point' || layer.geometryType === 'MultiPoint';
    const source = estPoint ? layer.id : layer.id + '-grappes';
    if (!map.getSource(source)) return;
    const sym = initSymbolization(layer);
    const cfg = configGrappes(sym);
    const sous = (spec) => { if (!estPoint && Number.isFinite(layer._grappeZoom)) spec.maxzoom = layer._grappeZoom; return spec; };
    map.addLayer(sous({ id: layer.id + '-grappe', type: 'circle', source, filter: FILTRE_GRAPPE, paint: {
        'circle-color': couleurGrappe(cfg, sym), 'circle-radius': RAYON_GRAPPE, 'circle-opacity': 0.9,
        'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } }));
    map.addLayer(sous({ id: layer.id + '-grappe-n', type: 'symbol', source, filter: FILTRE_GRAPPE,
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': true },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(31,27,20,0.85)', 'text-halo-width': 1.5 } }));
    // Un objet isolé (ni regroupé ni encore une forme) se montre en point, à la couleur de la couche.
    if (!estPoint) {
        if (map.getLayer(layer.id + '-pts')) map.removeLayer(layer.id + '-pts');
        map.addLayer(sous({ id: layer.id + '-pts', type: 'circle', source, filter: FILTRE_ISOLE, paint: {
            'circle-radius': 5, 'circle-color': layerPaintColor(layer), 'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff' } }));
    }
}

function applyLineStyle(layer) {
    if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    const sym = initSymbolization(layer);
    let width = sym.size.value || 4;
    if (sym.size.mode === 'graduated' && sym.size.field) {
        const r = getNumericRange(layer, sym.size.field);
        if (r.count) width = buildNumGraduated(sym.size.field, [r.min, r.max], sym.size.outputRange, sym.size.method);
    }
    const tri = cleDeTriReference(layer);
    const ligne = { id: layer.id, type: 'line', source: layer.id,
        layout: { 'line-cap': 'round', 'line-join': 'round', ...(tri != null ? { 'line-sort-key': tri } : {}) },
        paint: { 'line-color': layerPaintColor(layer), 'line-width': width, 'line-opacity': layerPaintOpacity(layer) } };
    if (Number.isFinite(layer._grappeZoom)) ligne.minzoom = layer._grappeZoom;
    map.addLayer(ligne);
    ajouterCouchesGrappes(layer);
    addLabelLayer(layer);
}

/**
 * Rejoue l'echantillonnage du relief quand la resolution du MNT change.
 *
 * Ne concerne que les modeles 3D : eux seuls sont places par Atlas. MapLibre
 * drape lui-meme les surfaces, les lignes et les points sur le terrain, et n'a
 * besoin de rien.
 */
function recalerSiPalierDem() {
    if (!map || !STATE.settings.terrain3D) return;
    const z = map.getZoom();
    if (!paliersDemDifferents(_palierDemCale, z)) return;
    _palierDemCale = z;
    Models3D.elevCache.clear();
    clearTimeout(_recalageTimer);
    // Le MNT du nouveau palier doit d'abord arriver : sonder trop tot ne
    // rendrait que l'ancienne resolution, et on aurait paye le calcul pour rien.
    recalerRelief(350);
}

/**
 * Recale les modeles 3D sur le relief, apres un delai.
 *
 * Point d'entree unique : il remplace les paires d'appels dispersees, qui
 * pouvaient s'entrelacer — un changement d'exageration suivi d'un changement de
 * source rejouait deux calages concurrents sur des donnees differentes.
 *
 * Le delai laisse le MNT arriver : sonder trop tot ne rend que l'ancienne
 * resolution, et le calcul est paye pour rien.
 */
function recalerRelief(delai = 250) {
    clearTimeout(_recalageTimer);
    _recalageTimer = setTimeout(() => {
        if (map) _palierDemCale = map.getZoom();
        Models3D.recomputeAll();
    }, delai);
}

function applyPolygonStyle(layer) {
    // Le repli en points aussi : laissé en place, son ajout plus bas échouait
    // (« already exists ») et les points gardaient l'ancienne couleur.
    ['', '-vaste', '-vaste-contour', '-outline', '-pts'].forEach((sfx) => { if (map.getLayer(layer.id + sfx)) map.removeLayer(layer.id + sfx); });
    const s = layer.style; const sym = initSymbolization(layer);
    const extrude = s.polygonMode !== 'flat';
    if (extrude) {
        let height = sym.size.value || 12;
        if (sym.size.mode === 'graduated' && sym.size.field) {
            const r = getNumericRange(layer, sym.size.field);
            if (r.count) height = buildNumGraduated(sym.size.field, [r.min, r.max], sym.size.outputRange, sym.size.method);
        } else if (layer.heightField) height = ['to-number', ['get', layer.heightField]];
        const base = Number.isFinite(sym.extrusion?.base) ? sym.extrusion.base : 0;
        // Rien a poser : MapLibre drape lui-meme l'extrusion sur le relief.
        const ext = extrusionExpressions(base, height);
        // Sur relief, MapLibre pose chaque extrusion comme un bloc rigide à l'altitude du MNT en son
        // centroïde (lib/volume-relief.js) : une grande surface flotte d'un côté, s'enfonce de l'autre et
        // bouge quand on déplace la carte. Les entités trop vastes sont donc posées à plat, drapées.
        const nVastes = STATE.settings.terrain3D && !layer._distant ? (layer._nVastes || 0) : 0;
        map.addLayer(poserBornesZoom({ id: layer.id, type: 'fill-extrusion', source: layer.id,
            ...(nVastes ? { filter: filtreVolume() } : {}),
            paint: {
                'fill-extrusion-color': layerPaintColor(layer),
                'fill-extrusion-height': ext.height,
                'fill-extrusion-base': ext.base,
                // 1 par défaut, comme `defaultLayerOpacity` : sous 1, MapLibre perd
                // l'écriture de profondeur et les volumes cessent de s'occulter.
                'fill-extrusion-opacity': Number.isFinite(sym.opacity) ? sym.opacity : 1,
            } }, layer));
        if (nVastes) {
            const trait = layerStrokePaint(layer);
            map.addLayer(poserBornesZoom({ id: layer.id + '-vaste', type: 'fill', source: layer.id, filter: filtreVaste(),
                paint: { 'fill-color': layerPaintColor(layer), 'fill-opacity': 0.6 } }, layer));
            map.addLayer(poserBornesZoom({ id: layer.id + '-vaste-contour', type: 'line', source: layer.id, filter: filtreVaste(),
                paint: { 'line-color': trait.color, 'line-width': Math.max(1, trait.width) } }, layer));
        }
    } else {
        const stroke = layerStrokePaint(layer);
        // Repli en points sous le seuil : les surfaces y seraient sous-pixel.
        const zFallback = layer._grappeZoom ?? layer._pointFallbackZoom;
        // Contour seul : le remplissage reste (il porte le clic et la sélection) mais ne se voit pas, et le trait
        // ne descend pas sous 2 px — sans lui, la couche s'effacerait.
        const contourSeul = sym.remplissage === 'contour';
        const fill = { id: layer.id, type: 'fill', source: layer.id, paint: {
            'fill-color': layerPaintColor(layer), 'fill-opacity': contourSeul ? 0 : layerPaintOpacity(layer) } };
        const triFill = cleDeTriReference(layer);
        if (triFill != null) fill.layout = { 'fill-sort-key': triFill };
        poserBornesZoom(fill, layer, zFallback);
        map.addLayer(fill);
        if (stroke.width > 0 || contourSeul) {
            const outline = { id: layer.id + '-outline', type: 'line', source: layer.id, paint: {
                'line-color': stroke.color, 'line-width': contourSeul ? Math.max(2, stroke.width) : stroke.width } };
            poserBornesZoom(outline, layer, zFallback);
            map.addLayer(outline);
        }
        if (zFallback != null && map.getSource(pointFallbackId(layer))) {
            map.addLayer({ id: pointFallbackId(layer), type: 'circle', source: pointFallbackId(layer),
                maxzoom: zFallback,
                paint: {
                    // **Un point ne doit pas être plus gros que la maille qu'il
                    // remplace.** Le rayon montait à 4 px — soit 8 de diamètre —
                    // juste sous le seuil de bascule, où une maille de 200 m en
                    // occupe 5. Les points se chevauchaient alors en bourrelets
                    // saturés : le repli grossissait la donnée au lieu de la
                    // représenter, et la structure de la grille disparaissait.
                    //
                    // Calé à la moitié de l'espacement : les points se touchent
                    // sans se recouvrir, la trame redevient lisible et la
                    // symbologie avec elle. Le plancher tient toujours — sous
                    // MIN_FEATURE_PX, le repli reproduirait l'invisibilité qu'il
                    // corrige.
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1.4, 8, 2, 11, 2.6],
                    'circle-color': layerPaintColor(layer),
                    // Opacité franche, et non celle de la surface. Une surface à
                    // plat est translucide pour laisser lire le fond sous elle ;
                    // un point de 2,6 px ne masque rien, et la même translucidité
                    // n'y sert qu'à délaver les classes claires jusqu'à les
                    // confondre avec la carte.
                    'circle-opacity': 0.9,
                    'circle-stroke-width': 0,
                } });
        }
    }
    ajouterCouchesGrappes(layer);
    addLabelLayer(layer);
}

function addLabelLayer(layer) {
    if (map.getLayer(layer.id + '-label')) map.removeLayer(layer.id + '-label');
    const sym = layer.style?.symbolization?.label;
    if (!sym?.enabled || !sym.field) return;
    const size = Number.isFinite(sym.size) ? sym.size : 12;
    map.addLayer({ id: layer.id + '-label', type: 'symbol', source: layer.id,
        ...(layer._sourceGroupee ? { filter: FILTRE_ISOLE } : {}),
        layout: { 'text-field': ['to-string', ['get', sym.field]], 'text-size': size, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-font': ['Noto Sans Regular'] },
        paint: { 'text-color': sym.color || '#2D2820', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 } });
}

function prepareLayerFilters(layer) {
    (layer.controls || []).forEach((c) => repairSelectControlFromManifest(layer, c));
    sanitizeBrokenSelectFilters(layer);
    layer._filterPredicate = buildControlPredicate(layer);
}

/** Aligne une couche MapLibre sur layer.visible + filtres (source de vérité = STATE.layers). */
/**
 * Le style est-il en état d'accueillir des sources et des couches ?
 *
 * `map.isStyleLoaded()` répond « le style **et toutes ses sources** sont
 * chargés » — un état que le montage d'une couche volumineuse fait retomber à
 * faux le temps d'indexer sa source. L'utiliser comme prérequis pour *ajouter*
 * une couche, dans une boucle qui ajoute des couches, revient à se couper
 * l'herbe sous le pied : tout ce qui suit la première couche lourde est
 * abandonné, et la reprogrammation rejoue le même ordre — donc le même abandon.
 *
 * Le prérequis réel de `addSource`/`addLayer` est que le style soit *défini*,
 * ce que MapLibre garantit dès l'événement `load` et jusqu'au prochain
 * `setStyle`. C'est ce que suit ce drapeau.
 */
function mapStyleUsable() {
    if (!map) return false;
    return _styleUsable || map.isStyleLoaded();
}

function syncLayerToMapState(layer) {
    if (!map) return;
    if (!mapStyleUsable()) {
        scheduleMapLayersSync();
        return;
    }
    try {
        prepareLayerFilters(layer);
        const wantVisible = layer.visible !== false;
        const hasSource = !!map.getSource(layer.id);
        const hasLayer = !!map.getLayer(layer.id);

        if (!wantVisible) {
            if (hasLayer) applyMapLayerVisibility(layer, false);
            else if (!hasSource) { /* rien à faire */ }
            else applyMapLayerVisibility(layer, false);
            return;
        }

        // Visible dans le panneau → doit être peint. Si source/layer absents ou incomplets : remount.
        if (!hasSource || !hasLayer) {
            addLayerToMap(layer);
            return;
        }

        // Couche différée qui vient de se peupler : le seuil de repli en points
        // avait été calculé sur un GeoJSON vide, il faut remonter la couche
        // pour créer la source de centres.
        const nFeats = layer.geojson?.features?.length || 0;
        if (layer._pointFallbackZoom == null && nFeats > (layer._pointFallbackAt || 0)
            && (layer.geometryType === 'Polygon' || layer.geometryType === 'MultiPolygon')) {
            // Le mode de rendu n'est pas encore fixé au premier montage d'une
            // couche différée : c'est addLayerToMap qui tranche. Remonter dès
            // qu'une surface se peuple, sans présumer du mode.
            addLayerToMap(layer);
            return;
        }

        syncLayerSourceData(layer);
        applyMapLayerVisibility(layer, true);
        // Remount style paint (catégorisé / flat) si le layer existe déjà
        applyLayerStyle(layer);
        applyMapLayerVisibility(layer, true);
    } catch (e) {
        console.error('[Atlas] syncLayerToMapState:', layer?.name, e);
    }
}

/**
 * Réconcilie panneau (STATE.visible) ↔ MapLibre.
 * Sens de vérité : STATE.layers[].visible (yeux du panneau).
 * Si œil ouvert mais pas de layer MapLibre → remount forcé.
 */
function reconcilePanelVisibilityToMap() {
    if (!mapStyleUsable()) return { ok: 0, fixed: 0, missing: [] };
    let ok = 0;
    let fixed = 0;
    const missing = [];
    for (const layer of STATE.layers) {
        const want = layer.visible !== false;
        const onMap = !!map.getLayer(layer.id);
        if (!want) {
            if (onMap) applyMapLayerVisibility(layer, false);
            continue;
        }
        if (onMap) {
            applyMapLayerVisibility(layer, true);
            ok++;
            continue;
        }
        missing.push(layer.name);
        if (addLayerToMap(layer)) fixed++;
        else console.warn('[Atlas] impossible de peindre', layer.name, '— visible dans le panneau');
    }
    if (missing.length) {
        console.warn('[Atlas] réconciliation : visibles panneau absents carte →', missing.join(', '), '| fixés:', fixed);
    }
    return { ok, fixed, missing };
}

/**
 * Glisser-déposer de l'ordre des couches — souris, doigt et stylet.
 *
 * Pointer Events plutôt que mouse + touch en double : un seul code pour tous
 * les pointeurs, et `setPointerCapture` garde le geste même si le doigt sort
 * de la poignée. `touch-action: none` sur la poignée est indispensable, sinon
 * le navigateur interprète le mouvement comme un défilement et vole le geste.
 *
 * Le glissement ne démarre qu'au-delà d'un seuil : un simple appui reste un
 * appui, et n'empêche pas de sélectionner la couche.
 */
const DRAG_SEUIL_PX = 4;
/** Appui long tactile : durée avant bascule, et tremblement toléré. */
const LONG_PRESS_MS = 450;
const LONG_PRESS_TOLERANCE_PX = 8;

/**
 * Capture du pointeur, sans faire échouer le geste si elle est refusée.
 *
 * `setPointerCapture` lève quand le pointeur n'est plus actif — relâchement
 * arrivé entre l'événement et son traitement. L'exception interromprait alors
 * le gestionnaire avant même d'avoir armé le glissement.
 */
function capturePointer(el, pointerId) {
    try { el?.setPointerCapture?.(pointerId); } catch (_) { /* pointeur déjà parti */ }
}

function wireLayerReorder(root) {
    if (!root || CONFIG.viewMode) return;
    const lignes = () => Array.from(root.querySelectorAll('.layer-item'));

    root.querySelectorAll('.layer-grip').forEach((grip) => {
        grip.addEventListener('pointerdown', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const id = grip.dataset.layer;
            const depart = lignes().findIndex((el) => el.dataset.layer === id);
            if (depart < 0) return;

            const y0 = ev.clientY;
            let actif = false;
            let cible = depart;
            let yCourant = y0;
            let boucle = 0;
            const ligne = lignes()[depart];
            const repere = document.createElement('div');
            repere.className = 'layer-drop-line';

            // Position de dépôt + repère visuel, recalculés depuis la dernière
            // ordonnée connue : le défilement automatique déplace les lignes
            // sous un pointeur immobile.
            const majCible = () => {
                const rects = lignes().map((el) => el.getBoundingClientRect());
                cible = dropIndex(rects, yCourant);
                // Repère d'insertion : sans lui, on lâche à l'aveugle.
                const ref = lignes()[cible];
                if (ref) ref.parentNode.insertBefore(repere, ref);
                else root.querySelector('.layer-list')?.appendChild(repere);
            };

            // Au doigt, aucune molette ne vient défiler pendant le glissement :
            // sans cela, une couche ne pourrait pas sortir de la portion visible.
            const defiler = () => {
                if (!actif) return;
                const pas = edgeScrollStep(root.getBoundingClientRect(), yCourant);
                if (pas) { root.scrollTop += pas; majCible(); }
                boucle = requestAnimationFrame(defiler);
            };

            const bouger = (e) => {
                yCourant = e.clientY;
                if (!actif) {
                    if (Math.abs(e.clientY - y0) < DRAG_SEUIL_PX) return;
                    actif = true;
                    ligne.classList.add('dragging');
                    boucle = requestAnimationFrame(defiler);
                }
                majCible();
            };

            const finir = () => {
                cancelAnimationFrame(boucle);
                grip.releasePointerCapture?.(ev.pointerId);
                grip.removeEventListener('pointermove', bouger);
                grip.removeEventListener('pointerup', finir);
                grip.removeEventListener('pointercancel', finir);
                repere.remove();
                ligne.classList.remove('dragging');
                if (!actif) return;
                const avant = STATE.layers.map((l) => l.id).join('|');
                STATE.layers = reorderByDrop(STATE.layers, depart, cible);
                if (STATE.layers.map((l) => l.id).join('|') === avant) return;
                applyLayerOrder();
                updateLegend();
                refreshLayersPanelIfOpen();
                // Tous les rangs : un rang partiel se relit mal (cf. sortByRank).
                STATE.layers.forEach((l, k) => { l._rank = k; saveLayerPrefIfSynced(l); });
            };

            capturePointer(grip, ev.pointerId);
            grip.addEventListener('pointermove', bouger);
            grip.addEventListener('pointerup', finir);
            grip.addEventListener('pointercancel', finir);
        });

        // Équivalent clavier — même geste, sans pointeur.
        grip.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            const id = grip.dataset.layer;
            A.moveLayerRank(id, e.key === 'ArrowUp' ? 'up' : 'down', e);
            // Le panneau est reconstruit : rendre le focus à la même poignée.
            setTimeout(() => {
                root.querySelector(`.layer-grip[data-layer="${id}"]`)?.focus();
            }, 0);
        });
    });
}

function refreshLayersPanelIfOpen() {
    if (STATE.currentModule === 'couches' || STATE.currentModule === 'symbo') {
        renderLayersPanel(STATE.currentModule);
    }
}

/** Resynchronise toutes les couches (rechargement, prefs Grist, sortie récit). */
/**
 * Rétablit l'ordre d'affichage sur la carte.
 *
 * À appeler après tout (re)montage : MapLibre ajoute au sommet, donc une couche
 * remontée passerait devant les autres. Sans cela, l'ordre dépend de
 * l'historique des clics et non de `STATE.layers`.
 */
function applyLayerOrder() {
    if (!mapStyleUsable()) return;
    for (const id of moveSequence(STATE.layers, (i) => !!map.getLayer(i))) {
        try { map.moveLayer(id); } catch (_) { /* couche retirée entre-temps */ }
    }
    // Les GLB (custom layer three.js) doivent rester AU-DESSUS du bâti MapLibre
    // et du fond ortho — sinon on ne voit que le raster / les extrusions.
    try {
        if (map.getLayer(Models3D.layerId)) map.moveLayer(Models3D.layerId);
    } catch (_) { /* ignore */ }
    poserCoucheNuit();
    releverLigneTrajet();
}

function syncAllLayersToMap() {
    if (!mapStyleUsable()) return;
    STATE.layers.forEach(syncLayerToMapState);
    applyLayerOrder();
    reconcilePanelVisibilityToMap();
    Models3D.rebuildScene();
    updateLegend();
    refreshLayersPanelIfOpen();
}

/** Attend que MapLibre soit prêt à peindre avant de monter les sources GeoJSON. */
let _mapSyncTimer = null;
/**
 * Les rappels à jouer quand le style redevient utilisable — **une file, pas un
 * slot**.
 *
 * Deux appelants peuvent attendre en même temps : `onStyleReady` qui cadre
 * depuis les entités locales, et `mountLoadedLayers` qui cadre depuis ce que le
 * manifeste déclare. Avec une variable unique, le second effaçait le premier
 * sans rien dire. Dans un document Grist l'ordre était favorable — l'ouverture
 * du document est lente, le style a le temps d'être prêt — et le défaut ne se
 * voyait pas ; une scène chargée par URL arrive avant le style, et c'est le
 * cadrage du manifeste qui se perdait. La carte s'ouvrait alors sur la position
 * par défaut, ce qui ressemble à un choix.
 */
let _mapSyncAfter = [];
function scheduleMapLayersSync(afterSync) {
    if (!map) return;
    if (typeof afterSync === 'function') _mapSyncAfter.push(afterSync);
    const run = () => {
        clearTimeout(_mapSyncTimer);
        syncAllLayersToMap();
        const files = _mapSyncAfter;
        _mapSyncAfter = [];
        // Un rappel qui lève ne doit pas emporter les suivants : ils viennent
        // d'appelants sans rapport entre eux.
        for (const cb of files) {
            try { cb(); } catch (e) { console.warn('[Atlas] rappel de montage :', e); }
        }
        // 2e passe : premier idle parfois trop tôt (style OSM / globe / pitch)
        _mapSyncTimer = setTimeout(() => {
            if (!mapStyleUsable()) return;
            syncAllLayersToMap();
            updateLegend();
        }, 500);
    };
    if (!mapStyleUsable()) {
        // `load` ne survient qu'une fois : y revenir après le démarrage — ou
        // après un changement de fond — poserait un rappel qui ne partirait
        // jamais. `idle` revient à chaque stabilisation.
        map.once('idle', run);
        return;
    }
    if (typeof map.loaded === 'function' && map.loaded()) {
        // Micro-delay : laisse setProjection / setSky / custom layer se stabiliser
        requestAnimationFrame(() => requestAnimationFrame(run));
        return;
    }
    map.once('idle', run);
}

function applyMapLayerVisibility(layer, visible) {
    if (!map) return;
    // Pendant un changement de fond, le style se reconstruit : `setLayoutProperty`
    // y laisse MapLibre avec un cache de tuiles incohérent, et son rendu s'arrête
    // sur `Cannot read properties of undefined (reading 'key')`. Mesuré en
    // enchaînant les étapes d'un récit qui change de fond : 54 exceptions.
    // La couche sera montée dans son état par la synchronisation d'après.
    if (!mapStyleUsable()) return;
    const vis = visible ? 'visible' : 'none';
    // Tous les habillages de la couche, sinon ils survivent au masquage : `-pts`
    // laisserait le repli en points à l'écran, `-hit` garderait la zone de clic
    // active sur une couche invisible.
    SUFFIXES_HABILLAGE.forEach((sfx) => {
        const lid = layer.id + sfx;
        if (map.getLayer(lid)) map.setLayoutProperty(lid, 'visibility', vis);
    });
    Models3D.scheduleBuild();
}

/**
 * Suite d'un chargement différé « froid » : la couche vient de recevoir ses
 * lignes, il faut la monter sur la carte et rafraîchir la légende.
 */
const DEFERRED_OPTS = {
    onReady: (l) => {
        if (!mapStyleUsable()) return;
        syncLayerToMapState(l);
        updateLegend();
    },
};

function setLayerVisibility(layer, visible) {
    layer.visible = visible;
    // Une couche lourde chargée en différé n'a pas encore de GeoJSON : la rendre
    // visible sans la matérialiser afficherait du vide. Vaut pour toutes les
    // origines — pastille, récit, prefs.
    // Une couche différée « froide » n'a pas encore ses lignes : la conversion
    // rend la main tout de suite et la couche se peint à l'arrivée des données.
    if (visible && layer._deferredLoad) materializeDeferredLayer(layer, DEFERRED_OPTS);
    applyMapLayerVisibility(layer, visible);
}

/** Remonte toutes les couches visibles (après récit ou bascule visibilité). */
function remountAllLayers() {
    syncAllLayersToMap();
}

function capturePreStorySnapshot() {
    // Ce que l'auteur a publié en pastille : une étape ou un contexte ne doit pas le retirer.
    marquerControlesPublies(STATE.layers);
    _preStorySnapshot = STATE.layers.map((l) => ({
        id: l.id,
        visible: l.visible !== false,
        controls: JSON.parse(JSON.stringify(l.controls || [])),
        // Le récit écrase aussi la symbolisation : sans elle dans le snapshot,
        // l'utilisateur récupère la scène habillée par la dernière étape.
        declarative: l._declarative ? JSON.parse(JSON.stringify(l._declarative)) : null,
        symbolization: l.style?.symbolization
            ? JSON.parse(JSON.stringify(l.style.symbolization))
            : null,
        // Une étape peut basculer la couche en volume : sans mémoriser le rendu
        // d'origine, la scène resterait extrudée après la présentation.
        polygonMode: l.style?.polygonMode || null,
    }));
    // Une étape peut imposer son ordre de superposition : il faut pouvoir
    // rendre à l'utilisateur celui qu'il avait réglé.
    _preStoryOrder = STATE.layers.map((l) => l.id);
    // Ambiance / fond : le récit les écrase aussi — à restituer en sortant.
    _preStorySettings = {
        timeOfDay: STATE.settings.timeOfDay,
        date: STATE.settings.date instanceof Date
            ? STATE.settings.date.toISOString()
            : STATE.settings.date,
        // Une date épinglée l'emporte sur toute autre : le récit la suspend (les
        // dates de ses étapes seraient ignorées) et la rend à la sortie.
        dateEpinglee: STATE.settings.dateEpinglee || null,
        labels: STATE.settings.labels,
        shadows: STATE.settings.shadows,
        sky: STATE.settings.sky,
        basemap: STATE.settings.basemap,
        buildings3D: STATE.settings.buildings3D,
        terrain3D: STATE.settings.terrain3D,
        terrainSource: STATE.settings.terrainSource,
        terrainExaggeration: STATE.settings.terrainExaggeration,
        projection: STATE.settings.projection,
    };
}

function restorePreStorySnapshot() {
    if (!_preStorySnapshot) return;
    for (const snap of _preStorySnapshot) {
        const l = STATE.layers.find((x) => x.id === snap.id);
        if (!l) continue;
        setLayerVisibility(l, snap.visible);
        l.controls = JSON.parse(JSON.stringify(snap.controls));
        delete l._filterPredicate;
        // Ce que la couche n'avait pas avant le récit, elle ne l'a plus après :
        // une étape peut avoir posé un rendu ou une symbolisation à une couche
        // qui n'en portait aucun.
        if (l.style) {
            if (snap.polygonMode) l.style.polygonMode = snap.polygonMode;
            else delete l.style.polygonMode;
        }
        if (snap.symbolization) {
            if (!l.style) l.style = { mode: 'mapbox' };
            l.style.symbolization = JSON.parse(JSON.stringify(snap.symbolization));
        } else if (l.style) {
            delete l.style.symbolization;
        }
        if (snap.declarative) {
            l._declarative = JSON.parse(JSON.stringify(snap.declarative));
            applyDeclarativeToLayer(l, l._declarative);
        } else {
            delete l._declarative;
        }
        if (snap.symbolization) {
            syncFeatureColorsFromSymbolization(l, sequentialPaletteForSym(l.style.symbolization.color, l));
        }
    }
    if (_preStoryOrder) {
        STATE.layers = sortByRank(STATE.layers,
            Object.fromEntries(_preStoryOrder.map((id, i) => [id, i])));
        _preStoryOrder = null;
    }
    _preStorySnapshot = null;
    if (_preStorySettings) {
        const prevBm = STATE.settings.basemap;
        const wantBm = _preStorySettings.basemap;
        const switching = !!(wantBm && BASEMAPS[wantBm] && wantBm !== prevBm);
        applyStoryEnvironment(_preStorySettings, {
            allowBasemapSwitch: true,
            onBasemapReady: () => {
                remountAllLayers();
                updateLegend();
            },
        });
        _preStorySettings = null;
        return switching;
    }
    return false;
}

/**
 * Applique l'ambiance d'une étape (ou du snapshot pré-récit).
 * Le fond (`basemap`) contourne le filtre `exposed` / allowed de la lecture :
 * rejouer une capture n'est pas une action utilisateur sur le dock.
 */
function applyStoryEnvironment(s, opts = {}) {
    if (!s) return;
    if (s.projection && s.projection !== STATE.settings.projection) {
        STATE.settings.projection = s.projection;
        applyProjection();
    }
    // Source et exagération avant l'activation : `applyTerrain` doit poser le
    // bon MNT au bon facteur, pas le précédent le temps d'un rendu.
    if (s.terrainSource && TERRAIN_SOURCES[s.terrainSource] && s.terrainSource !== STATE.settings.terrainSource) {
        setTerrainSource(s.terrainSource);
    }
    const exag = Number(s.terrainExaggeration);
    if (Number.isFinite(exag) && exag > 0 && exag !== STATE.settings.terrainExaggeration) {
        STATE.settings.terrainExaggeration = exag;
        if (STATE.settings.terrain3D) { applyTerrain(); recalerRelief(200); }
    }
    if (s.terrain3D != null && s.terrain3D !== STATE.settings.terrain3D) {
        STATE.settings.terrain3D = !!s.terrain3D;
        applyTerrain();
        _palierDemCale = null;
        recalerRelief();
    }
    if (typeof s.buildings3D === 'boolean') {
        STATE.settings.buildings3D = s.buildings3D;
        applyBuildingVisibility();
    }
    if (s.timeOfDay != null) STATE.settings.timeOfDay = Number(s.timeOfDay);
    if (s.date) STATE.settings.date = new Date(s.date);
    // Un instantané rend la date épinglée ; une étape qui porte une date la
    // suspend, sinon la date épinglée de la scène l'emporte (`dateLocaleScene`)
    // et un récit « été puis hiver » montrerait la même lumière.
    if ('dateEpinglee' in s) STATE.settings.dateEpinglee = s.dateEpinglee || null;
    else if (s.date && _storyPresenting) STATE.settings.dateEpinglee = null;
    if (typeof s.labels === 'boolean') {
        STATE.settings.labels = s.labels;
        applyLabelsVisibility();
    }
    if (typeof s.shadows === 'boolean') {
        STATE.settings.shadows = s.shadows;
        // Comme `toggleSetting` : les modèles 3D se reconstruisent avec ou sans
        // ombres, et la pastille du soleil dit l'état réel.
        Models3D.scheduleBuild();
        $('shadow-toggle')?.classList.toggle('on', s.shadows);
    }
    if (typeof s.sky === 'boolean') {
        STATE.settings.sky = s.sky;
        applySky();
    }
    updateLighting();
    map?.triggerRepaint?.();

    const want = s.basemap;
    if (!opts.allowBasemapSwitch || !want || !BASEMAPS[want] || !map) return;
    if (want === STATE.settings.basemap) return;
    STATE.settings.basemap = want;
    _styleUsable = false;
    const b = BASEMAPS[want];
    // Le vol en cours est arrêté d'abord : remplacer le style pendant qu'il
    // dure laisse MapLibre avec un cache de tuiles incohérent, et son rendu
    // s'arrête sur « Cannot read properties of undefined (reading 'key') ».
    map.stop();
    const feuilleAvant = map.style?.stylesheet;
    map.setStyle(b.style ? b.style() : b.url);
    // Au premier `idle` du NOUVEAU style (lib/basemap-layers.js) : un `idle`
    // émis pendant la requête du style perdait calque 3D, nuit et trajet, ou
    // les laissait sous les couches du nouveau fond.
    quandNouveauStyle(map, feuilleAvant, () => {
        onStyleReady();
        applyLabelsVisibility();
        updateLighting();
        map.triggerRepaint?.();
        opts.onBasemapReady?.();
    });
}

function applyControls(layer, opts = {}) {
    layer._filterPredicate = buildControlPredicate(layer);
    syncLayerSourceData(layer);
    Models3D.scheduleBuild();
    if (!opts.skipLegend) updateLegend();
    if (CONFIG.viewMode) refreshViewerControlsHud();
}

async function persistStory(immediate = false) {
    if (!CONFIG.grist.ready || CONFIG.viewMode) return;
    clearTimeout(_persistStoryTimer);
    const save = async () => {
        try {
            if ((STATE.story || []).some((s) => Number.isFinite(s?.state?.abscisse))) {
                STATE.story = trierParAbscisse(STATE.story);
            }
            await saveStoryToGrist(grist.docApi, STATE.story, { viewMode: CONFIG.viewMode });
        } catch (e) {
            console.warn('[Atlas story] save', e.message);
            enterViewModeOnWriteFail(e);
            // « Etape capturee » s'affiche des le clic, avant meme que
            // l'enregistrement ne parte. Sans ce signal, un echec restait
            // invisible et l'utilisateur croyait son recit conserve.
            showToast('Récit non enregistré — ' + e.message, 'error');
        }
    };
    if (immediate) return save();
    return new Promise((resolve) => {
        _persistStoryTimer = setTimeout(async () => {
            await save();
            resolve();
        }, 400);
    });
}

/** La ligne du récit : celle des étapes, ou celle encore seulement en mémoire. */
function traceActuelle() {
    const portee = (STATE.story || []).find((s) => s?.state?.trace?.coordinates?.length >= 2);
    return portee?.state?.trace || STATE.trajet || null;
}

function traceFigee(trace) {
    return trace ? JSON.parse(JSON.stringify(trace)) : null;
}

function lineairesDisponibles() {
    return STATE.layers.filter((layer) => layer.visible !== false
        && (layer.geojson?.features || []).some((f) => estLineaire(f.geometry?.type)));
}

function saisiesCourantes() {
    const out = [];
    for (const couche of STATE.layers) {
        if (couche.visible === false) continue;
        for (const f of offertsEnLecture(formulairesDeLaCouche(couche))) {
            out.push({
                formId: f.id,
                coucheId: couche.id,
                table: couche.sourceTable || f.tableId || null,
                titre: f.titre || f.id,
            });
        }
    }
    return out;
}

function coucheDansSaisiesEtape(layer) {
    if (!_storyPresenting || !layer) return false;
    const saisies = STATE.story[_storyIdx]?.state?.saisies || [];
    return saisies.some((s) => s.coucheId === layer.id || (s.table && s.table === layer.sourceTable));
}

function releverLigneTrajet() {
    if (!map?.getLayer?.('atlas-trajet-line')) return;
    try {
        // Sous la couche de nuit quand elle existe : le trajet s'assombrit la
        // nuit comme sous l'ancien voile, au lieu d'échapper à la nuit.
        if (map.getLayer(NUIT.id)) map.moveLayer('atlas-trajet-line', NUIT.id);
        else if (map.getLayer(Models3D.layerId)) map.moveLayer('atlas-trajet-line', Models3D.layerId);
        else map.moveLayer('atlas-trajet-line');
    } catch (_) { /* style en cours de remplacement */ }
}

function assurerCoucheTrajet() {
    if (!map || !mapStyleUsable()) return false;
    if (!map.getSource('atlas-trajet')) {
        map.addSource('atlas-trajet', optionsSourceGeojson({ type: 'FeatureCollection', features: [] }));
    }
    if (!map.getLayer('atlas-trajet-line')) {
        map.addLayer({
            id: 'atlas-trajet-line',
            type: 'line',
            source: 'atlas-trajet',
            paint: { 'line-color': '#C44536', 'line-width': 3, 'line-opacity': 0.92 },
        });
    }
    releverLigneTrajet();
    return true;
}

function retirerPoignees() {
    _trajetPoignees.forEach((m) => m.remove());
    _trajetPoignees = [];
}

/** La ligne se voit pendant la lecture du récit, et dans le panneau Récit. */
/** La tournée du contexte joué, ou `null`. */
function tourneeActive() {
    if (!_contexteCle) return null;
    return tourneeDe((STATE.story || []).find((s) => s.cle === _contexteCle)?.state);
}

/** La tournée à dessiner : celle du contexte joué ; en édition du Récit, celle du contexte qu'on règle. */
function tourneeAffichee() {
    const cle = _contexteCle || (!_storyPresenting && STATE.currentModule === 'recit' ? _tourneeVue : null);
    if (!cle) return null;
    return tourneeDe((STATE.story || []).find((s) => s.cle === cle)?.state);
}

function trajetVisible() {
    return !!traceActuelle() && (_storyPresenting || STATE.currentModule === 'recit');
}

function rafraichirTrajet() {
    retirerPoignees();
    if (!assurerCoucheTrajet()) return;
    // Pendant un contexte, seule sa tournée se montre : le trajet du récit ne le concerne pas.
    const tournee = tourneeAffichee();
    const trace = _contexteCle ? tournee : (tournee || traceActuelle());
    const montrer = tournee || (!_contexteCle && trajetVisible() && trace);
    const src = map.getSource('atlas-trajet');
    src?.setData(montrer ? {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: trace.coordinates },
    } : { type: 'FeatureCollection', features: [] });
    if (!montrer) return;
    // Une tournée se règle depuis le Récit, pas à la carte : ni poignées ni flèche de sens.
    if (tournee) return;
    const edite = STATE.currentModule === 'recit' && !CONFIG.viewMode && !_storyPresenting && canWrite(CONFIG.viewMode);
    if (!edite) return;

    // Sens du trajet : petite flèche à la fin de la ligne.
    const fin = trace.coordinates[trace.coordinates.length - 1];
    const avant = trace.coordinates[trace.coordinates.length - 2] || fin;
    if (fin && avant) {
        const elSens = document.createElement('div');
        elSens.className = 'trajet-sens';
        elSens.title = 'Sens du trajet';
        const bearing = Math.atan2(fin[0] - avant[0], fin[1] - avant[1]) * 180 / Math.PI;
        elSens.style.transform = `rotate(${bearing}deg)`;
        _trajetPoignees.push(
            new maplibregl.Marker({ element: elSens, anchor: 'center' })
                .setLngLat(fin)
                .addTo(map),
        );
    }

    // Ordre = rang sur la ligne (déjà trié par abscisse à l'enregistrement).
    const surLigne = STATE.story
        .map((step, i) => ({ step, i, a: step.state?.abscisse }))
        .filter((x) => Number.isFinite(x.a))
        .sort((x, y) => x.a - y.a);
    surLigne.forEach((item, rang) => {
        const { step } = item;
        const p = pointAAbscisse(trace.coordinates, step.state.abscisse);
        if (!p) return;
        const n = rang + 1;
        const el = document.createElement('div');
        el.className = 'trajet-poignee';
        el.textContent = String(n);
        el.title = (step.title || ('Étape ' + n)) + ' · n°' + n + ' sur le trajet';
        const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
            .setLngLat(p)
            .addTo(map);
        let start = null;
        marker.on('dragstart', () => { start = marker.getLngLat(); });
        marker.on('drag', () => {
            const ll = marker.getLngLat();
            const proj = projeter(trace.coordinates, [ll.lng, ll.lat]);
            if (proj.point) marker.setLngLat(proj.point);
        });
        marker.on('dragend', () => {
            const ll = marker.getLngLat();
            const a = start ? map.project([start.lng, start.lat]) : null;
            const b = map.project(ll);
            if (a && Math.hypot(b.x - a.x, b.y - a.y) < 4) {
                if (start) marker.setLngLat([start.lng, start.lat]);
                return;
            }
            const proj = projeter(trace.coordinates, [ll.lng, ll.lat]);
            if (!step?.state || !proj.point) return;
            step.state.abscisse = proj.abscisse;
            // La poignée déplace la place sur le trajet, pas la vue cadrée :
            // celle-ci revient intacte si on retire le trajet.
            STATE.story = trierParAbscisse(STATE.story);
            markDirty();
            persistStory();
            renderRecit();
        });
        _trajetPoignees.push(marker);
    });
}

function annulerChoixTrajet() {
    trajetPickMode = false;
    _trajetRemplace = false;
    _cibleTournee = null;
    if (map) map.getCanvas().style.cursor = '';
}

/** Pose (ou remplace) la tournée d'un contexte : une copie figée de la ligne, dans le bloc `usage` de son étape. */
function poserTourneeDepuis(cle, trace) {
    const etape = (STATE.story || []).find((s) => s.cle === cle);
    if (!etape || !usageDe(etape.state).contexte) { showToast('Ce contexte n’existe plus', 'warning'); return; }
    const remplace = !!tourneeDe(etape.state);
    etape.state = avecUsage(etape.state, { tournee: traceFigee(trace) });
    _tourneeVue = cle;
    markDirty();
    persistStory(true);
    rafraichirTrajet();
    renderRecit();
    showToast(remplace ? 'Tournée remplacée' : `Tournée posée — ${direLongueur(longueurMetres(trace.coordinates))}`, 'success');
}

function poserTrajetDepuis(choix) {
    const trace = {
        type: 'LineString',
        coordinates: choix.copie,
        sourceTable: choix.layer.sourceTable || null,
        sourceRowId: choix.feature?.properties?.id ?? choix.feature?.id ?? null,
        nom: choix.layer.name || '',
    };
    const remplacer = _trajetRemplace;
    const cibleTournee = _cibleTournee;
    annulerChoixTrajet();
    // Une tournée appartient à son contexte : elle ne place aucune étape du récit.
    if (cibleTournee) { poserTourneeDepuis(cibleTournee, trace); return; }
    // Le trajet du récit ne concerne que les étapes du récit : les contextes ont leur tournée.
    const etapes = STATE.story.filter((s) => !usageDe(s.state).contexte);
    if (!etapes.length) {
        STATE.trajet = trace;
        rafraichirTrajet();
        renderRecit();
        showToast('Trajet prêt — chaque capture se posera au plus près de la vue', 'info');
        return;
    }
    const ontPlace = etapes.every((s) => Number.isFinite(s.state?.abscisse));
    let ecartMax = 0;
    STATE.story.forEach((s) => {
        if (usageDe(s.state).contexte) return;
        const i = etapes.indexOf(s);
        let abscisse;
        if (remplacer && ontPlace) {
            // Remplacer la ligne : mêmes proportions, vues inchangées.
            abscisse = s.state.abscisse;
        } else {
            const centre = s.state?.camera?.center;
            if (Array.isArray(centre) && centre.length >= 2) {
                const place = placeDepuisVue(trace.coordinates, centre);
                abscisse = place.abscisse;
                if (Number.isFinite(place.distanceMetres)) {
                    ecartMax = Math.max(ecartMax, place.distanceMetres);
                }
            } else {
                abscisse = placesInitiales(etapes.length)[i] ?? 0.5;
            }
        }
        s.state = fusionnerApresPhoto(s.state || {}, {
            trace: traceFigee(trace),
            abscisse,
            saisies: Array.isArray(s.state?.saisies) ? s.state.saisies : saisiesCourantes(),
        });
    });
    STATE.trajet = trace;
    STATE.story = trierParAbscisse(STATE.story);
    markDirty();
    persistStory(true);
    renderRecit();
    if (remplacer) {
        showToast('Trajet remplacé — les places gardent leurs proportions', 'success');
    } else if (ecartMax >= ECART_VUE_TRAJET_M) {
        showToast(`Étapes posées sur la ligne (vue jusqu’à ${Math.round(ecartMax)} m à l’écart)`, 'info');
    } else {
        showToast('Étapes posées sur le trajet, au plus près de chaque vue', 'success');
    }
}

/* ------------------------------------------------------------------ */
/* Itinéraire sur un réseau : départ, points de passage, arrivée       */
/* ------------------------------------------------------------------ */

/** `null` hors itinéraire ; sinon `{ layerId, reseau, points, marqueurs, calcul }`. */
let _itineraire = null;
const SOURCE_ITINERAIRE = 'atlas-itineraire';

function effacerApercuItineraire() {
    if (!map) return;
    if (map.getLayer(SOURCE_ITINERAIRE)) map.removeLayer(SOURCE_ITINERAIRE);
    if (map.getSource(SOURCE_ITINERAIRE)) map.removeSource(SOURCE_ITINERAIRE);
}

function terminerItineraire() {
    if (!_itineraire) return;
    _itineraire.marqueurs.forEach((m) => m.remove());
    effacerApercuItineraire();
    _itineraire = null;
    if (map) map.getCanvas().style.cursor = '';
}

function dessinerApercuItineraire(coordonnees) {
    effacerApercuItineraire();
    if (!map || !coordonnees?.length) return;
    map.addSource(SOURCE_ITINERAIRE, optionsSourceGeojson({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coordonnees } }));
    map.addLayer({ id: SOURCE_ITINERAIRE, type: 'line', source: SOURCE_ITINERAIRE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0B6E99', 'line-width': 6, 'line-opacity': 0.9 } });
}

/** Un point de plus : on le numérote, et le chemin se retrace dès qu'il y a un départ et une arrivée. */
function itineraireClic(e) {
    const s = _itineraire;
    if (!s) return;
    const p = [e.lngLat.lng, e.lngLat.lat];
    s.points.push(p);
    const el = document.createElement('div');
    el.className = 'trajet-poignee';
    el.textContent = String(s.points.length);
    s.marqueurs.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(p).addTo(map));
    recalculerItineraire();
    if (STATE.currentModule === 'recit') renderRecit();
}

function recalculerItineraire() {
    const s = _itineraire;
    if (!s) return;
    s.calcul = s.points.length >= 2 ? calculerItineraire(s.reseau, s.points) : null;
    dessinerApercuItineraire(s.calcul?.ok ? s.calcul.coordonnees : []);
    if (s.calcul && !s.calcul.ok) showToast(s.calcul.raison, 'warning');
}

/** Les couches de lignes dont on peut tirer un réseau. */
function couchesReseau() {
    return STATE.layers.filter((l) => l.visible !== false && !l._distant && !l._raster
        && (l.geojson?.features || []).some((f) => estLineaire(f.geometry?.type)));
}

function onTrajetPick(e) {
    const clic = [e.lngLat.lng, e.lngLat.lat];
    let best = null;
    for (const layer of STATE.layers) {
        if (layer.visible === false) continue;
        for (const feature of layer.geojson?.features || []) {
            const copie = copieLineaire(feature.geometry, clic);
            if (!copie) continue;
            const proj = projeter(copie, clic);
            if (!proj.point) continue;
            const pt = map.project(proj.point);
            const px = Math.hypot(pt.x - e.point.x, pt.y - e.point.y);
            if (px > 18) continue;
            if (!best || px < best.px) best = { layer, feature, copie, px };
        }
    }
    if (!best) {
        showToast('Touchez une ligne', 'info');
        return;
    }
    poserTrajetDepuis(best);
}

function choisirTrajet(remplacer, cibleTournee = null) {
    if (!assertCanWrite(remplacer ? 'remplacer le trajet' : 'créer un trajet')) return;
    if (trajetPickMode) {
        annulerChoixTrajet();
        showToast('Choix annulé', 'info');
        if (STATE.currentModule === 'recit') renderRecit();
        return;
    }
    if (!lineairesDisponibles().length) {
        showToast('Aucune ligne visible à copier', 'info');
        return;
    }
    _trajetRemplace = !!remplacer;
    _cibleTournee = cibleTournee;
    trajetPickMode = true;
    if (map) map.getCanvas().style.cursor = 'crosshair';
    showToast(remplacer ? 'Choisissez la nouvelle ligne' : 'Choisissez une ligne sur la carte', 'info');
    if (STATE.currentModule === 'recit') renderRecit();
}

function retirerTrajet() {
    if (!assertCanWrite('retirer le trajet')) return;
    STATE.trajet = null;
    STATE.story = retirerTrace(STATE.story);
    annulerChoixTrajet();
    markDirty();
    if (STATE.story.length) persistStory(true);
    rafraichirTrajet();
    if (STATE.currentModule === 'recit') renderRecit();
    showToast('Trajet retiré — les vues d’origine sont rétablies', 'info');
}

function annulerAnimTrajet() { _trajetAnim += 1; }

function animerLeLong(trace, abscisse, camera, fini) {
    const id = ++_trajetAnim;
    const coords = trace.coordinates;
    const depart = map.getCenter();
    const a0 = projeter(coords, [depart.lng, depart.lat]).abscisse;
    const dist = Math.abs(abscisse - a0) * longueurMetres(coords);
    const duree = dureeLongeLigneMs(dist);
    const t0 = performance.now();
    const cap0 = map.getBearing();
    const cap1 = Number.isFinite(camera?.bearing) ? camera.bearing : cap0;
    const pad = mesurerEtageRecit();
    const stop = () => { if (id === _trajetAnim) _trajetAnim += 1; };
    map.once('dragstart', stop);
    map.once('wheel', stop);
    map.once('touchstart', stop);
    const frame = (now) => {
        if (id !== _trajetAnim || !_storyPresenting) return;
        const u = Math.min(1, (now - t0) / duree);
        const p = pointAAbscisse(coords, a0 + (abscisse - a0) * u);
        if (p) {
            map.jumpTo({
                center: p,
                bearing: capInterpole(cap0, cap1, u),
                padding: margesActuelles({ bulle: pad }),
            });
        }
        if (u < 1) {
            requestAnimationFrame(frame);
            return;
        }
        map.off('dragstart', stop);
        map.off('wheel', stop);
        map.off('touchstart', stop);
        map.easeTo({
            center: pointAAbscisse(coords, abscisse) || camera?.center,
            zoom: camera?.zoom,
            pitch: camera?.pitch,
            bearing: camera?.bearing,
            padding: margesActuelles({ bulle: pad }),
            duration: 400,
        });
        fini?.();
        remplirAutour();
        majAlerteTrajet();
    };
    requestAnimationFrame(frame);
}

function pauserSuiviTrajet() {
    if (!_trajetSuivi || _trajetPause) return;
    _trajetPause = true;
    if (_suiviPosition && _geoloc?.trigger) _geoloc.trigger();
}

function arreterSuiviTrajet() {
    const suivait = _trajetSuivi && _suiviPosition;
    _trajetSuivi = false;
    _trajetPause = false;
    if (suivait && _geoloc?.trigger) _geoloc.trigger();
}

function indexSuivi(abscisse) {
    const trace = traceActuelle();
    const cur = STATE.story[_storyIdx];
    if (!trace || !Number.isFinite(cur?.state?.abscisse) || !Number.isFinite(abscisse)) return null;
    const L = longueurMetres(trace.coordinates);
    const a = cur.state.abscisse;
    const prev = STATE.story[_storyIdx - 1];
    const next = STATE.story[_storyIdx + 1];
    const voisine = abscisse >= a ? next?.state?.abscisse : prev?.state?.abscisse;
    if (!Number.isFinite(voisine)) return null;
    if (!suiviDoitChanger({ abscisse, etape: a, voisine, longueurM: L })) return null;
    return abscisse >= a ? _storyIdx + 1 : _storyIdx - 1;
}

function rayonDeLetape(step) {
    const trace = traceActuelle();
    if (!trace || !Number.isFinite(step?.state?.abscisse)) return rayonAutour(null);
    const L = longueurMetres(trace.coordinates);
    const absc = (STATE.story || []).map((s) => s.state?.abscisse).filter(Number.isFinite).sort((a, b) => a - b);
    if (absc.length < 2) return rayonAutour(null);
    const i = absc.indexOf(step.state.abscisse);
    let ecart = Infinity;
    if (i > 0) ecart = Math.min(ecart, (step.state.abscisse - absc[i - 1]) * L);
    if (i >= 0 && i < absc.length - 1) ecart = Math.min(ecart, (absc[i + 1] - step.state.abscisse) * L);
    return rayonAutour(Number.isFinite(ecart) ? ecart : null);
}

function pointDuneFeature(f) {
    const c = featureCentroidLngLat(f);
    if (c) return c;
    const g = f?.geometry;
    const coords = g?.type === 'LineString' ? g.coordinates : (g?.type === 'MultiLineString' ? g.coordinates?.[0] : null);
    if (!coords?.length) return null;
    const p = coords[Math.floor(coords.length / 2)];
    return Array.isArray(p) ? [p[0], p[1]] : null;
}

function evaluerAlerte() {
    const trace = traceActuelle();
    if (!_storyPresenting || !trace) {
        _alerteReleve = false;
        return { allumee: false, texte: '' };
    }
    const pos = _dernierePosition || (map ? [map.getCenter().lng, map.getCenter().lat] : null);
    if (!pos) return { allumee: _alerteReleve, texte: _alerteTexte };
    let best = null;
    for (const s of STATE.story) {
        if (!Number.isFinite(s.state?.abscisse) || !(s.state?.saisies || []).length) continue;
        const p = pointAAbscisse(trace.coordinates, s.state.abscisse);
        if (!p) continue;
        const d = distanceMetres(pos, p);
        const rayon = rayonDeLetape(s);
        if (!best || d < best.d) best = { d, rayon };
    }
    if (!best) {
        _alerteReleve = false;
        return { allumee: false, texte: '' };
    }
    const allumee = alertePastille({ distanceM: best.d, rayonM: best.rayon, allumee: _alerteReleve });
    _alerteReleve = allumee;
    return { allumee, texte: allumee ? direDistance(best.d) : '' };
}

function majAlerteTrajet() {
    const avant = _alerteReleve;
    const avantTexte = _alerteTexte;
    const etat = evaluerAlerte();
    _alerteTexte = etat.texte || '';
    if (etat.allumee !== avant || _alerteTexte !== avantTexte) refreshControlsDock();
}

function objetsDeLetape() {
    const step = STATE.story[_storyIdx];
    const trace = traceActuelle();
    const saisies = step?.state?.saisies || [];
    if (!step || !trace || !saisies.length || !Number.isFinite(step.state?.abscisse)) {
        return { objets: [], nonCharges: false, vide: true };
    }
    const centre = pointAAbscisse(trace.coordinates, step.state.abscisse);
    const rayon = rayonDeLetape(step);
    const couches = new Map();
    for (const s of saisies) {
        const couche = STATE.layers.find((l) => l.id === s.coucheId)
            || STATE.layers.find((l) => s.table && l.sourceTable === s.table);
        if (couche) couches.set(couche.id, couche);
    }
    let nonCharges = false;
    const candidats = [];
    for (const couche of couches.values()) {
        const feats = couche.geojson?.features;
        if (!Array.isArray(feats) || !feats.length) {
            if (couche._deferredLoad || couche._distant) nonCharges = true;
            continue;
        }
        const garde = buildControlPredicate(couche);
        feats.forEach((f, idx) => {
            if (garde && !garde(f)) return;
            const point = pointDuneFeature(f);
            if (!point) return;
            candidats.push({
                point,
                idx,
                coucheId: couche.id,
                nom: nomObjet(f.properties || {}) || 'objet',
            });
        });
    }
    return {
        objets: objetsAutour(candidats, centre, rayon, 5),
        nonCharges,
        vide: false,
    };
}

function remplirAutour() {
    const hote = document.getElementById('trajet-autour');
    if (!hote) return;
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const { objets, nonCharges, vide } = objetsDeLetape();
    if (vide) { hote.innerHTML = ''; return; }
    if (!objets.length) {
        hote.innerHTML = `<div style="margin-top:8px;font-size:12px;color:#6b6256">${nonCharges ? 'Objets non chargés' : 'Aucun objet à proximité'}</div>`;
        return;
    }
    hote.innerHTML = `<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">${objets.map((o) => {
        const id = String(o.coucheId).replace(/'/g, "\\'");
        return `<button type="button" class="btn btn-soft" style="text-align:left" onclick="A.ouvrirObjetEtape('${id}',${o.idx})">${esc(o.nom)} <small>${esc(direDistance(o.distance))}</small></button>`;
    }).join('')}${nonCharges ? '<div style="font-size:11px;color:#6b6256">Objets non chargés</div>' : ''}</div>`;
}

function allerEtape(i, opts = {}) {
    if (!STATE.story.length) return;
    if (!opts.suivi) pauserSuiviTrajet();
    _storyIdx = Math.max(0, Math.min(i, STATE.story.length - 1));
    renderStoryPresentation();
    applyStoryState(cloneStoryState(STATE.story[_storyIdx].state), { camera: !opts.suivi });
    remplirAutour();
}

/**
 * Le nombre d'entités d'une couche — **`null` quand on ne le sait pas**.
 *
 * `|| 0` rendait zéro dans deux situations que rien ne distinguait ensuite :
 * une couche réellement vide, et une couche dont Atlas ne détient pas les
 * entités. Or zéro est un nombre parfaitement plausible : « 0 obj. » se lit
 * comme un renseignement, pas comme une ignorance, et on cherche alors pourquoi
 * la donnée est vide au lieu de comprendre qu'elle est ailleurs.
 */
function layerVisibleCount(layer) {
    const n = filteredGeoJSON(layer)?.features?.length;
    if (Number.isFinite(n) && n > 0) return n;
    // Rien en local : soit la couche est distante et le manifeste sait peut-être
    // compter à sa place, soit elle est vraiment vide et zéro est la réponse.
    if (layer?._distant) return Number.isFinite(layer._nFeaturesDeclare) ? layer._nFeaturesDeclare : null;
    return Number.isFinite(n) ? n : 0;
}

/**
 * Le compte tel qu'il s'affiche.
 *
 * Un compte déclaré par le manifeste et non vérifié s'annonce comme tel — le
 * « ≈ » dit qu'on rapporte au lieu de constater. Un compte inconnu ne s'affiche
 * pas du tout : mieux vaut un blanc qu'un chiffre faux.
 */
function formatLayerCount(layer) {
    const n = layerVisibleCount(layer);
    if (n == null) return '—';
    const approx = layer?._distant && !filteredGeoJSON(layer)?.features?.length;
    return (approx ? '≈' : '') + n;
}

/**
 * Couche visée par une étape de récit.
 *
 * La table source prime sur le nom : deux couches distinctes peuvent porter le
 * même libellé (« Grille d'analyse 200 m » sur deux imports différents), et
 * piloter la mauvaise appliquerait des styles et des filtres à des données qui
 * ne sont pas celles de l'étape. Le nom ne sert que de repli, pour les récits
 * enregistrés avant que sourceTable ne soit systématiquement capturé.
 */
function findStoryLayer(ls) {
    if (!ls) return null;
    return (ls.sourceTable && STATE.layers.find((x) => x.sourceTable === ls.sourceTable))
        || STATE.layers.find((x) => x.id === ls.id)
        || STATE.layers.find((x) => x.name === ls.name)
        || null;
}

function cloneStoryState(s) {
    return s ? JSON.parse(JSON.stringify(s)) : null;
}

/** Symbo + visibilité + contrôles (sans remontage carte). */
function applyStoryLayerMeta(l, ls) {
    // Rendu surfacique : porté par le style, pas par la symbolisation. Une étape
    // qui le cite peut donc montrer un bâti en volume puis le remettre à plat.
    // Posé avant l'affichage : le repli en points ne vise que les surfaces à
    // plat, il doit connaître le mode au moment où la couche se monte.
    if (ls.polygonMode) {
        if (!l.style) l.style = { mode: 'mapbox' };
        l.style.polygonMode = ls.polygonMode;
    } else if ('polygonMode' in ls && l.style) {
        // Une étape captée sans rendu déclaré rend la couche à son défaut : elle
        // ne garde pas celui de l'étape précédente.
        delete l.style.polygonMode;
    }
    setLayerVisibility(l, ls.visible);
    if (ls.symbolization) {
        if (!l.style) l.style = { mode: 'mapbox' };
        l.style.symbolization = ls.symbolization;
        if (ls.declarative) {
            l._declarative = ls.declarative;
        } else {
            syncLayerDeclarative(l);
        }
        syncFeatureColorsFromSymbolization(l, sequentialPaletteForSym(l.style.symbolization.color, l));
    } else if (ls.declarative) {
        l._declarative = ls.declarative;
        applyDeclarativeToLayer(l, ls.declarative);
    }
    l.controls = l.controls || [];
    applyStoryControlsToLayer(l, ls.controls || []);
    delete l._filterPredicate;
}

/** Remonte la couche sur la carte (comme après refresh) — évite la surcouche setData. */
function syncStoryLayerToMap(l) {
    syncLayerToMapState(l);
}

function reapplyStoryFilters(state) {
    if (!state?.layers?.length) return;
    state.layers.forEach((ls) => {
        const l = findStoryLayer(ls);
        if (!l) return;
        applyStoryControlsToLayer(l, ls.controls || []);
        syncStoryLayerToMap(l);
    });
    Models3D.rebuildScene();
    updateLegend();
    // Le dock doit suivre : une étape désactive tout contrôle qu'elle ne cite
    // pas (`applyStoryControlsToLayer`), et sans ce rafraîchissement les
    // pastilles rendues avant l'étape restaient à l'écran, devenues inertes —
    // au clic, la pastille était introuvable dans la liste et le panneau
    // s'ouvrait vide. Une pastille qui ne fait rien est pire qu'une pastille
    // absente : on la croit cassée, alors que la scène l'a éteinte.
    refreshControlsDock();
}

function applyStoryState(s, opts = {}) {
    if (!s || !map) return;
    _storyPresenting = true;

    // Une étape ne s'applique pas pendant qu'un fond se remplace.
    //
    // Enchaîner les étapes plus vite que le style ne se charge faisait tomber
    // `setLayoutProperty` au milieu de la reconstruction : MapLibre gardait un
    // cache de tuiles incohérent et son rendu s'arrêtait sur « Cannot read
    // properties of undefined (reading 'key') ». Mesuré sur un fond raster,
    // avec ou sans borne de zoom — ce n'est pas la borne qui le cause.
    // On attend la stabilisation, puis on rejoue l'étape entière.
    if (!mapStyleUsable()) {
        const attendu = cloneStoryState(s);
        // Avec les mêmes options : sans elles, le suivi GPS (`camera: false`)
        // retrouvait une caméra qui revole malgré lui.
        map.once('idle', () => { if (_storyPresenting) applyStoryState(attendu, opts); });
        return;
    }

    // L'ordre de superposition fait partie de l'étape : il est déjà enregistré
    // dans la position des couches (captureStoryState les liste dans l'ordre de
    // STATE.layers), y compris dans les récits antérieurs à cette lecture.
    if ((s.layers || []).length) {
        const rangs = {};
        s.layers.forEach((ls, i) => {
            const l = findStoryLayer(ls);
            if (l) rangs[l.sourceTable || l.id] = i;
        });
        STATE.layers = sortByRank(STATE.layers, rangs);
    }

    const cited = new Set();
    (s.layers || []).forEach((ls) => {
        const l = findStoryLayer(ls);
        if (!l) return;
        cited.add(l);
        applyStoryLayerMeta(l, ls);
    });
    // Une étape décrit l'état complet de la scène : une couche qu'elle ne cite
    // pas doit être masquée, sinon elle traverse le récit dans l'état où
    // l'utilisateur l'avait laissée. captureStoryState() enregistre toujours
    // toutes les couches — seuls les récits écrits à la main sont partiels.
    // L'état d'origine est rétabli en sortie via restorePreStorySnapshot().
    if ((s.layers || []).length) {
        STATE.layers.forEach((l) => {
            if (!cited.has(l) && l.visible !== false) setLayerVisibility(l, false);
        });
    }
    (s.layers || []).forEach((ls) => {
        const l = findStoryLayer(ls);
        if (!l) return;
        syncStoryLayerToMap(l);
    });
    // Le tri ci-dessus ne touche que `STATE.layers` ; la pile MapLibre, elle, ne
    // bouge que si une couche est remontée — ce qui n'arrive pas d'une étape à
    // l'autre quand toutes sont déjà en place. Sans cet appel, le panneau
    // affiche l'ordre de l'étape et la carte peint l'ordre précédent.
    applyLayerOrder();
    Models3D.rebuildScene();
    updateLegend();
    // Le dock suit l'étape, au même titre que la légende : celle-ci vient
    // d'être reconstruite parce que les couches ont changé, et les contrôles
    // ont changé aussi — une étape désactive tout filtre qu'elle ne cite pas.
    refreshControlsDock();

    const wantBasemap = s.basemap && BASEMAPS[s.basemap] ? s.basemap : null;
    const basemapChanging = !!(wantBasemap && wantBasemap !== STATE.settings.basemap);

    const finishCamera = () => {
        if (opts.camera === false) return;
        const run = () => {
        if (!_storyPresenting || !s.camera || !map) return;
        if (!mapStyleUsable()) { map.once('idle', run); return; }
        const snap = cloneStoryState(s);
        const reapply = () => {
            if (!_storyPresenting) return;
            applyStoryEnvironment(snap, { allowBasemapSwitch: false });
            reapplyStoryFilters(snap);
            map.triggerRepaint?.();
        };
        const trace = s.trace;
        const longe = trace?.type === 'LineString'
            && trace.coordinates?.length >= 2
            && Number.isFinite(s.abscisse);
        if (!longe) map.once('moveend', reapply);
        // L'étape a été composée sur la carte entière ; la bulle en couvre le
        // bas. La marge fait viser ce qui reste visible — nulle sans bulle, ce
        // qui efface aussi celle d'une étape précédente.
        if (longe) {
            animerLeLong(trace, s.abscisse, s.camera, reapply);
            return;
        }
        map.flyTo({
            center: s.camera.center,
            zoom: s.camera.zoom,
            pitch: s.camera.pitch,
            bearing: s.camera.bearing,
            padding: margesActuelles({ bulle: mesurerEtageRecit() }),
            duration: 1500,
        });
        };
        run();
    };

    applyStoryEnvironment(s, {
        allowBasemapSwitch: true,
        onBasemapReady: () => {
            // Après setStyle, re-synchroniser les couches de l'étape puis voler.
            (s.layers || []).forEach((ls) => {
                const l = findStoryLayer(ls);
                if (!l) return;
                applyStoryLayerMeta(l, ls);
                syncStoryLayerToMap(l);
            });
            applyLayerOrder();
            Models3D.rebuildScene();
            updateLegend();
            // La pastille du fond dit le fond de l'étape, pas celui d'avant.
            refreshControlsDock();
            finishCamera();
        },
    });

    if (!basemapChanging) finishCamera();
}

// ============================================================
// MODULES — chrome contextuel
// ============================================================
const MODULE_TITLES = {
    lieu: 'Lieu', couches: 'Couches', controles: 'Contrôles', recit: 'Récit',
    soleil: 'Soleil', vues: 'Vue & rendu', reglages: 'Catalogue 3D',
    formulaires: 'Formulaires',
};

/**
 * Les modules qu'un lecteur ne peut pas ouvrir.
 *
 * `recit` n'y figure pas — non parce qu'il se configurerait en lecture, mais
 * parce qu'un lecteur doit pouvoir **jouer** le recit. La distinction est entre
 * *jouer* et *regler*, pas entre les modules : `formulaires` regle, donc il y
 * entre, et un lecteur obtient le formulaire **sur un objet**, jamais le module
 * qui le decide.
 */
const VIEW_AUTHOR_MODULES = new Set(['lieu', 'soleil', 'vues', 'controles', 'reglages', 'couches', 'formulaires']);

function openModule(name) {
    if (CONFIG.viewMode && name === 'recit') {
        if (!(STATE.story?.length)) {
            showToast('Aucun récit publié', 'info');
            return;
        }
        A.storyPlay(0);
        return;
    }
    if (CONFIG.viewMode && VIEW_AUTHOR_MODULES.has(name)) {
        showToast('Mode lecture — utilisez la légende pour cibler', 'info');
        return;
    }
    STATE.currentModule = name;
    // Choisir un module est explicite : il revient, même s'il avait cédé la place à la fiche.
    $('module-panel').classList.remove('module-cede');
    _moduleImpose = $('inspector')?.classList.contains('open') && STATE.selection.mode;
    document.querySelectorAll('.rail-item').forEach((b) => b.classList.toggle('active', b.dataset.module === name));
    $('module-title').textContent = (MODULE_TITLES[name] || name).replace(/^[^ ]+ /, (m) => m);
    $('module-panel').classList.add('open');
    $('module-foot').style.display = 'none';
    if (document.body.classList.contains('mobile-layout')) {
        // L'onglet suit le module, d'ou qu'il vienne — palette de commandes,
        // feuille « Plus », clic sur une couche. Sans cela, retoucher l'onglet
        // ne refermait pas : la barre ignorait ce qui etait ouvert.
        allumerOngletMobile(name);
        // A mi-hauteur : la carte reste visible sous le panneau, c'est elle le
        // sujet. Une feuille deja deployee garde la hauteur qu'on lui a donnee.
        //
        // Une fiche ouverte prime (une feuille a la fois) : le module attend,
        // replie, et c'est a la fermeture de la fiche qu'il paraitra. La fiche
        // peut s'ouvrir juste apres ce bloc — `renderInspector`, en fin de
        // fonction —, d'ou la verification au moment ou la feuille est prete,
        // et non ici.
        installerFeuilleMobile().then(() => {
            if ($('inspector')?.classList.contains('open')) {
                if (feuilleAvantFiche == null) feuilleAvantFiche = 'demi';
                return;
            }
            if (feuillePosition === 'fermee') poserFeuille('demi');
        });
    }

    if (name === 'lieu') renderLieu();
    // Le scan des tables géo ne sert qu'à la liste « à afficher » de ce
    // panneau : il est fait ici, pas au chargement de la scène.
    else if (name === 'couches') { renderLayersPanel(name); refreshGeoTables(); }
    else if (name === 'symbo') renderLayersPanel(name);
    else if (name === 'controles') renderControles();
    else if (name === 'recit') renderRecit();
    else if (name === 'formulaires') renderFormulaires();
    else if (name === 'reglages') renderModelsPanel();
    else if (name === 'soleil') renderSoleil();
    else if (name === 'vues') renderVues();

    renderInspector();
}
/**
 * Annonce la scene qu'on ouvre, avant meme d'avoir ses donnees.
 *
 * Le chargement prend quelques secondes ; pendant ce temps l'en-tete affichait
 * « Nouveau projet » et la legende « Aucune couche visible », sur une carte
 * vide posee a l'ancrage par defaut. Tout disait que l'ouverture avait echoue,
 * alors qu'elle etait en cours.
 */
function annoncerOuverture(nom) {
    const t = document.getElementById('project-name');
    if (t && nom) t.textContent = nom;
    const l = document.getElementById('legend');
    const corps = document.getElementById('legend-body');
    if (corps && !corps.textContent.trim()) corps.textContent = 'Chargement…';
    if (l) l.dataset.ouverture = '1';
}
if (typeof window !== 'undefined') window.__atlasAnnoncerOuverture = annoncerOuverture;

function closeModulePanel() {
    // Une création cédée au module revient dès que le module part : sans elle,
    // la carte resterait armée sans formulaire visible.
    if (_saisieObjet) ficheCedee = false;
    if (Feuille) poserFeuille('fermee');
    $('module-panel').classList.remove('open');
    document.querySelectorAll('.rail-item').forEach((b) => b.classList.remove('active'));
    STATE.currentModule = null;
    annulerChoixTrajet();
    rafraichirTrajet();
    renderInspector();
}

// ---- Lieu ----
let searchTimer = null;
let locationPickMode = false;
/** Où la carte s'ouvre : trois façons, dont les données d'abord (lib/cadrage.js). */
function htmlCadrage() {
    const c = normaliserExposition(STATE.exposition).cadrage || null;
    const avecEmprise = STATE.layers.filter((l) => boundsFromGeoJSON(l.geojson));
    const mode = c?.mode || (avecEmprise.length ? 'donnees' : 'lieu');
    const choix = (id, titre, aide, corps = '') => `<div class="cadrage-choix${mode === id ? ' on' : ''}">
        <button type="button" role="radio" aria-checked="${mode === id}" class="cadrage-radio" onclick="A.setCadrage('${id}')"${id === 'donnees' && !avecEmprise.length ? ' disabled' : ''}>
            <span class="cadrage-nom">${titre}</span><span class="cadrage-aide">${aide}</span></button>${mode === id ? corps : ''}</div>`;
    const options = avecEmprise.map((l) => `<option value="${echapper(cleCadrage(l))}"${c?.couche === cleCadrage(l) ? ' selected' : ''}>${echapper(l.name)}</option>`).join('');
    const surDonnees = choix('donnees', 'Sur mes données',
        avecEmprise.length ? 'La carte s’ouvre sur l’emprise des couches.' : 'Aucune couche pour l’instant.',
        avecEmprise.length > 1 ? `<select class="input" aria-label="Couches cadrées" onchange="A.setCadrage('donnees', this.value)">
            <option value="">Toutes les couches</option>${options}</select>` : '');
    const l = c?.mode === 'lieu' ? c.lieu : STATE.location;
    const surLieu = choix('lieu', 'Sur un lieu précis', mode === 'lieu' ? echapper(l.nom || l.name || 'Lieu choisi') : 'Une adresse, une position, des coordonnées.', htmlOutilsLieu());
    const v = c?.mode === 'vue' ? c.vue : null;
    const surVue = choix('vue', 'Sur la vue actuelle', v ? `Figée à zoom ${v.zoom.toFixed(1)}, inclinaison ${Math.round(v.pitch)}°.` : 'Le cadrage que vous réglez sur la carte, tel quel.',
        '<button type="button" class="btn btn-soft btn-full" onclick="A.setCadrage(\'vue\')">Utiliser la vue actuelle</button>');
    return `<div class="section">
        <div class="section-title">Ouverture de la carte${infoBulle('Où la carte s’ouvre pour tout le monde. Sur les données, elle suit les couches : une scène déplacée n’a pas à être recadrée. Le soleil et le fuseau se règlent sur le centre des données, tant qu’aucun lieu n’est désigné.')}</div>
        <div class="cadrage-liste" role="radiogroup" aria-label="Ouverture de la carte">${surDonnees}${surLieu}${surVue}</div></div>`;
}

/** Les outils pour désigner un lieu : recherche, position, pointé, coordonnées. */
function htmlOutilsLieu() {
    const L = STATE.location;
    return `<div class="cadrage-outils">
        <input class="input" id="loc-search" placeholder="Adresse, ville, monument…" aria-label="Rechercher un lieu" oninput="A.searchLocation(this.value)">
        <div class="search-results" id="loc-results"></div>
        <div class="cadrage-boutons">
            <button class="btn btn-soft" onclick="A.useGeolocation()">${icTrait(IC.epingle)} Ma position</button>
            <button class="btn btn-soft" onclick="A.pickOnMap()">${icTrait(IC.carte)} Pointer</button>
        </div>
        <div class="dual">
            <div><label class="input-label">Latitude</label><input class="input" id="loc-lat" type="number" step="0.0001" value="${(L.lat ?? '').toString()}"></div>
            <div><label class="input-label">Longitude</label><input class="input" id="loc-lng" type="number" step="0.0001" value="${(L.lng ?? '').toString()}"></div>
        </div>
        <button class="btn btn-soft btn-full" onclick="A.applyManualCoords()">Aller</button>
    </div>`;
}

/**
 * La vignette de la scène dans la liste des projets : la vue actuelle de la carte, recadrée en 8:5 et réduite (JPEG, environ
 * vingt Ko), écrite dans `Atlas_ScenePrefs.Miniature`. L'auteur la choisit : une carte cadrée sur le sujet vaut mieux
 * qu'une capture prise au hasard.
 */
function capturerMiniature() {
    if (!map) return;
    if (!assertCanWrite('choisir la miniature de la scène')) return;
    // Le tampon de dessin n'est valable que pendant le rendu : on le lit dans le même tour.
    map.once('render', () => {
        try {
            const src = map.getCanvas();
            const L = 320, H = 200;
            const c = document.createElement('canvas');
            c.width = L; c.height = H;
            let sw = src.width;
            let sh = sw * H / L;
            if (sh > src.height) { sh = src.height; sw = sh * L / H; }
            c.getContext('2d').drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, L, H);
            STATE.miniature = c.toDataURL('image/jpeg', 0.72);
            STATE._miniatureAEcrire = true;
            markDirty();
            persistScenePrefsDifferee(200);
            if (STATE.currentModule === 'lieu') renderLieu();
            showToast('Miniature de la scène enregistrée', 'success');
        } catch (e) { showToast('Miniature impossible : ' + e.message, 'error'); }
    });
    map.triggerRepaint();
}

/** Le bloc « Miniature » du module Lieu. */
function htmlMiniature() {
    const m = STATE.miniature;
    return `<div class="section">
        <div class="section-title">Miniature de la scène${infoBulle('L’image qui représente la scène dans la liste des projets de l’application. Cadrez la carte sur le sujet, puis « Utiliser la vue actuelle ».')}</div>
        ${m ? `<img class="miniature-apercu" src="${escapeHtml(m)}" alt="Miniature actuelle de la scène">` : '<div class="miniature-vide">Aucune miniature : la liste montre l’initiale de la scène.</div>'}
        <button class="btn btn-soft btn-full" onclick="A.capturerMiniature()">${m ? 'Remplacer par la vue actuelle' : 'Utiliser la vue actuelle'}</button>
        ${m ? '<button type="button" class="btn-lien miniature-retirer" onclick="A.retirerMiniature()">Retirer la miniature</button>' : ''}
    </div>`;
}

function renderLieu() {
    $('module-title').textContent = 'Lieu';
    const L = STATE.location;
    $('module-body').innerHTML = `
        <div class="section loc-identite">
            <div class="section-title">Nom du projet</div>
            <input class="input" id="proj-name" placeholder="Ma maquette…" value="${STATE.projectName}" onchange="A.setProjectName(this.value)">
        </div>
        ${htmlCadrage()}
        ${htmlMiniature()}
        <div class="section">
            <div class="section-title">Ancre du soleil${infoBulle('Le point sur lequel se règlent le soleil et le fuseau de la scène. Tant qu’aucun lieu n’est désigné, c’est le centre des données.')}</div>
            <div class="loc-badge">
                <span class="ic">${icTrait(IC.epingle)}</span>
                <div class="loc-texte">
                    <div class="nm">${L.name || 'Non défini'}</div>
                    <div class="co">${(L.lat ?? 0).toFixed(4)}°N · ${(L.lng ?? 0).toFixed(4)}°E</div>
                </div>
            </div>
            <button class="btn btn-soft btn-full" onclick="A.recenter()">${icTrait(IC.cible, 16)} Recentrer la carte</button>
        </div>`;
}

// ---- Couches ----
/**
 * Métadonnées d'une table candidate. Le scan ne lit que les noms de colonnes :
 * annoncer « 0 obj. » serait faux — mieux vaut ne rien annoncer que du faux.
 */
function geoTableMeta(g) {
    const bits = [];
    if (Number.isFinite(g.count)) bits.push(`<span>${g.count} obj.</span>`);
    bits.push(`<span class="badge3d">${g.geomType || 'géo'}</span>`);
    return bits.join('');
}

async function refreshGeoTables() {
    if (!CONFIG.grist.ready) { _geoTables = []; return; }
    try { _geoTables = await scanGeoTables(grist.docApi); } catch (e) { _geoTables = []; }
    if (STATE.currentModule === 'couches') renderLayersPanel('couches');
}

function availableTablesSection() {
    if (!CONFIG.grist.ready) return '';
    const linked = new Set(STATE.layers.filter((l) => l.sourceTable).map((l) => l.sourceTable));
    const avail = _geoTables.filter((g) => !linked.has(g.table));
    if (!avail.length) return '';
    return `<div class="section"><div class="section-title">Tables du document${infoBulle('Les tables géographiques du document qui ne sont pas encore des couches. Touchez une table pour l’ajouter.')}</div><div class="table-liste">${avail.map((g) => `
        <button type="button" class="table-item" onclick="A.showGeoTable('${String(g.table).replace(/'/g, "\\'")}')" title="Afficher « ${escapeHtml(g.table)} » comme couche">
            <span class="table-nom">${escapeHtml(g.table)}</span>${Number.isFinite(g.count) ? `<span class="table-compte">${g.count} obj.</span>` : ''}
            <span class="table-plus" aria-hidden="true">${icTrait(IC.plus, 16)}</span>
        </button>`).join('')}</div></div>`;
}

    const actions = () => `
        <div class="section layer-actions">
            <div class="section-title">Ajouter une couche</div>
            <div class="actions-grille">
                ${CONFIG.grist.ready && canWrite(CONFIG.viewMode) ? `<button class="btn btn-soft" onclick="A.openNouvelleCouche()" title="Créer une couche vide, portée par une nouvelle table Grist">${icTrait(IC.plus)} Nouvelle</button>` : ''}
                <button class="btn btn-soft" onclick="document.getElementById('file-input').click()" title="Ouvrir un fichier GeoJSON">${icTrait(IC.fichier)} Fichier</button>
                <button class="btn btn-soft" onclick="A.openOSM()" title="Importer depuis OpenStreetMap">${icTrait(IC.globe)} OSM</button>
                ${CONFIG.grist.ready ? `<button class="btn btn-soft" onclick="A.openLinkTable()" title="Lier une autre table du document">${icTrait(IC.lien)} Autre table…</button>` : ''}
            </div>
        </div>`;

function renderLayersPanel(mode) {
    if (CONFIG.viewMode) {
        renderLayersPanelLecture();
        return;
    }
    $('module-title').textContent = 'Couches';
    const body = $('module-body');
    if (STATE.layers.length === 0) {
        body.innerHTML = `
            <div class="empty"><div class="ic">${icTrait(IC.dossier, 40)}</div><div class="t">Aucune couche affichée</div><div class="h">Affiche une table ci-dessous, ou importe</div></div>
            ${availableTablesSection()}
            <div class="section"><div class="drop" id="drop" onclick="document.getElementById('file-input').click()"><div class="ic">${icTrait(IC.fichier, 40)}</div><div class="t">Glissez un fichier</div><div class="h">GeoJSON, GPX, KML, CSV</div></div></div>
            ${actions()}`;
        wireDrop();
        return;
    }
    const allVis = STATE.layers.every((l) => l.visible !== false);
    body.innerHTML = `
        <div class="layer-bulk">
            <span class="layer-bulk-compte">${STATE.layers.length} couche${STATE.layers.length > 1 ? 's' : ''}</span>
            <button type="button" class="btn-lien" ${allVis ? 'aria-pressed="true"' : ''} onclick="A.toggleAllLayers(true)">Tout afficher</button>
            <button type="button" class="btn-lien" ${!STATE.layers.some((l) => l.visible !== false) ? 'aria-pressed="true"' : ''} onclick="A.toggleAllLayers(false)">Tout masquer</button>
        </div>
        <div class="layer-list">
            ${displayOrder(STATE.layers).map((l) => {
                const is3D = l.style?.mode === 'library' || l.style?.mode === 'custom';
                const visible = l.visible !== false;
                const linked = isLinkedTableLayer(l);
                const sel = STATE.selectedLayer === l.id;
                // Réordonnancement sur la seule couche sélectionnée : la ligne
                // porte déjà cinq commandes. Désactivés aux bornes plutôt que
                // masqués — la ligne garderait sinon une largeur changeante.
                // Poignée dédiée : la ligne entière porte déjà la sélection, un
                // glissement sur elle se battrait avec le clic.
                // Poignée focalisable : le glissement seul exclurait la
                // navigation au clavier (Tab pour l'atteindre, ↑/↓ pour déplacer).
                const poignee = CONFIG.viewMode ? ''
                    : `<span class="layer-grip" data-layer="${l.id}" tabindex="0" role="button"
                        aria-label="Réordonner ${echapper(l.name)} — glisser, ou flèches haut et bas"
                        title="Glisser pour réordonner (ou ↑ ↓ au clavier)">⠿</span>`;
                return `<div class="layer-item ${sel ? 'active' : ''}" data-layer="${l.id}" onclick="A.selectLayer('${l.id}')">
                    ${poignee}
                    <span class="layer-vis ${visible ? 'on' : ''}" onclick="A.toggleLayer('${l.id}', event)">${icTrait(visible ? IC.oeil : IC.oeilBarre)}</span>
                    <span class="layer-swatch" style="background:${fondPastilleCouche(l)}"></span>
                    <div class="layer-info">
                        <div class="layer-name" title="${escapeHtml(l.name)}">${echapper(l.name)}</div>
                        <div class="layer-meta"><span>${formatLayerCount(l)} obj.</span>${is3D ? '<span class="badge3d">3D</span>' : ''}${linked
                            ? '<span class="badge-saved" title="Objets liés aux lignes de ' + (l.sourceTable || 'la table') + ' — modifiables un par un">⛓ table</span>'
                            : (l.gristId ? '<span class="badge-copie" title="Géométries copiées dans le document — pas de ligne par objet, donc pas de fiche modifiable">copie</span>' : '')}</div>
                    </div>
                    <button class="layer-act layer-act-zoom" onclick="A.zoomLayer('${l.id}', event)" title="Zoomer sur la couche" aria-label="Zoomer sur ${escapeHtml(l.name)}">${icTrait(IC.cible)}</button>
                    <button class="layer-act" onclick="A.menuCouche('${l.id}', event)" title="Autres actions" aria-label="Autres actions pour ${escapeHtml(l.name)}" aria-haspopup="menu">${icTrait(IC.plusieurs)}</button>
                </div>`;
            }).join('')}
        </div>
        ${availableTablesSection()}
        ${actions()}`;
    wireLayerReorder(body);
}

/** Liste couches en lecture : légende + zoom, sans paramétrage. */
function fermerMenuCouche() {
    document.getElementById('menu-couche')?.remove();
    document.removeEventListener('pointerdown', _fermetureMenuCouche, true);
    document.removeEventListener('keydown', _toucheMenuCouche, true);
}
function _fermetureMenuCouche(e) { if (!e.target.closest?.('#menu-couche')) fermerMenuCouche(); }
function _toucheMenuCouche(e) { if (e.key === 'Escape') { e.stopPropagation(); fermerMenuCouche(); } }

/** Le menu des actions rares d'une ligne de couche : le zoom reste sur la ligne, ce qui détruit ou recharge passe ici. */
function ouvrirMenuCouche(layer, ancre) {
    fermerMenuCouche();
    const menu = document.createElement('div');
    menu.id = 'menu-couche';
    menu.className = 'posture-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `Actions pour ${layer.name}`);
    const items = [];
    if (isLinkedTableLayer(layer)) items.push({ id: 'rafraichir', nom: 'Rafraîchir depuis la table', ic: IC.rafraichir });
    items.push({ id: 'supprimer', nom: 'Supprimer la couche', ic: IC.corbeille, danger: true });
    menu.innerHTML = items.map((i) => `<button type="button" role="menuitem" class="posture-choix menu-couche-item${i.danger ? ' danger' : ''}" data-act="${i.id}">
        <span class="posture-nom">${icTrait(i.ic, 16)} ${echapper(i.nom)}</span></button>`).join('');
    document.body.appendChild(menu);
    menu.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-act]');
        if (!b) return;
        fermerMenuCouche();
        const evenement = { stopPropagation() {} };
        if (b.dataset.act === 'rafraichir') A.refreshLayer(layer.id, evenement);
        else A.deleteLayer(layer.id, evenement);
    });
    if (ancre && !surTelephone()) {
        const r = ancre.getBoundingClientRect();
        menu.style.top = `${Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 12)}px`;
        menu.style.left = `${Math.max(12, Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 12))}px`;
    } else {
        menu.classList.add('posture-feuille');
    }
    document.addEventListener('pointerdown', _fermetureMenuCouche, true);
    document.addEventListener('keydown', _toucheMenuCouche, true);
    menu.querySelector('.menu-couche-item')?.focus();
}

function renderLayersPanelLecture() {
    titreModule('Légende', 'Affichage tel que configuré par l’éditeur.');
    const body = $('module-body');
    // Même sens de lecture que le panneau d'édition : le dessus en premier.
    const visible = displayOrder(STATE.layers).filter((l) => l.visible !== false);
    if (!visible.length) {
        body.innerHTML = `<div class="empty"><div class="ic">${icTrait(IC.carte, 40)}</div><div class="t">Scène vide</div><div class="h">Aucune couche visible (configuration éditeur)</div></div>`;
        return;
    }
    body.innerHTML = `
        <div class="layer-list">${visible.map((l) => {
            const is3D = l.style?.mode === 'library' || l.style?.mode === 'custom';
            return `<div class="layer-item">
                <span class="layer-swatch" style="background:${fondPastilleCouche(l)}"></span>
                <div class="layer-info">
                    <div class="layer-name" title="${escapeHtml(l.name)}">${echapper(l.name)}</div>
                    <div class="layer-meta"><span>${formatLayerCount(l)} obj.</span>${is3D ? '<span class="badge3d">3D</span>' : ''}</div>
                </div>
                <button class="layer-act" onclick="A.zoomLayer('${l.id}', event)" title="Zoomer">${icTrait(IC.cible)}</button>
            </div>`;
        }).join('')}</div>`;
}

/**
 * Icones du dock, au trait.
 *
 * C'etaient des emoji, faute d'un glyphe Unicode present partout — un `▦`
 * s'affichait vide sur les polices systeme courantes. Mais l'emoji ne resout
 * rien : sur Android il sort en Noto couleur, a une taille que la page ne
 * controle pas, et pique des pastilles bariolees dans une interface qui n'en a
 * aucune. Un trace inline ne depend d'aucune police et suit la couleur du texte.
 */
function icTrait(d, taille = 19) {
    // L'epaisseur se reduit quand l'icone grandit, sinon une illustration d'etat
    // vide parait grossiere a cote d'un bouton de 19 px.
    const trait = taille > 32 ? 1.3 : 1.7;
    return `<svg class="ic-trait" width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="${trait}" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">${d}</svg>`;
}

/**
 * Le vocabulaire d'icones des panneaux.
 *
 * Un seul endroit ou les tracer : la meme corbeille doit etre la meme partout,
 * et une icone qui change de dessin d'un panneau a l'autre se lit comme deux
 * actions differentes.
 */
const IC = {
    oeil:      '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    oeilBarre: '<path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a18 18 0 0 1-3.1 3.9M6.6 6.7A17.9 17.9 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.2-.9"/><path d="M3 3l18 18"/>',
    cible:     '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
    corbeille: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7"/><path d="M10 11v6m4-6v6"/>',
    rafraichir:'<path d="M20 11a8 8 0 1 0-2.3 6.2"/><path d="M20 5v6h-6"/>',
    lien:      '<path d="M10 13a5 5 0 0 0 7.1.1l2.9-2.9a5 5 0 0 0-7.1-7.1L11 4.9"/><path d="M14 11a5 5 0 0 0-7.1-.1L4 13.8a5 5 0 0 0 7.1 7.1l1.8-1.8"/>',
    fichier:   '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    dossier:   '<path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3z"/>',
    globe:     '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15 0 18M12 3C9.5 5.7 9.5 18 12 21"/>',
    carte:     '<path d="m9 3-6 3v15l6-3 6 3 6-3V3l-6 3z"/><path d="M9 3v15m6-12v15"/>',
    epingle:   '<path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/>',
    loupe:     '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/>',
    soleil:    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    recit:     '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M9 7h7M9 11h5"/>',
    formulaire: '<path d="M9 3h6a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2V4a1 1 0 0 1 1-1z"/><path d="M9 11h6M9 15h4"/>',
    controles: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    reglages:  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    camera:    '<path d="M3 7h3l2-3h8l2 3h3v13H3z"/><circle cx="12" cy="13" r="3.2"/>',
    palette:   '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1-.8-1.5-.8-2.4 0-.9.7-1.5 1.6-1.5H16a5 5 0 0 0 5-5c0-4-4-7.5-9-7.5z"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.1" fill="currentColor"/><circle cx="15" cy="8.5" r="1.1" fill="currentColor"/>',
    cube:      '<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
    enregistrer:'<path d="M12 3v13M7 11l5 5 5-5M5 21h14"/>',
    exporter:  '<path d="M12 3v13M7 8l5-5 5 5M5 21h14"/>',
    plusieurs: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    crayon:    '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
    releve:    '<path d="M9 3h6v3H9z"/><path d="M7 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1"/><path d="m9 14 2 2 4-4"/>',
    image:     '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>',
    tableur:   '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
    piste:     '<path d="M4 20V7a3 3 0 0 1 6 0v10a3 3 0 0 0 6 0V4"/><path d="M17 7h4M17 4h4"/>',
    plus:      '<path d="M12 5v14M5 12h14"/>',
    pieton:    '<circle cx="12" cy="4" r="2"/><path d="M12 7v6m0 0-3 8m3-8 3 8M8 10l4-2 4 2"/>',
};



function controlTypeIcon(type) {
    // Les filtres gardent leurs emoji : ils nomment une donnee, pas une commande
    // de la carte, et l'utilisateur les repere mieux ainsi dans une rangee de
    // pastilles. Le sujet est le choix de l'auteur de la scene, pas la charte.
    if (type === 'time') return '🕑';
    if (type === 'range') return '📊';
    if (type === 'text') return '🔎';
    return '🏷️';
}

/** Le nom d'un type de contrôle, en français — l'interface disait « range », « select ». */
function controlTypeLabel(type) {
    if (type === 'time') return 'Date';
    if (type === 'range') return 'Nombre';
    if (type === 'text') return 'Texte';
    return 'Catégorie';
}

function controlVariantOptions(type) {
    if (type === 'time') {
        return [
            { value: 'time_lte', label: 'Jusqu’à une date', hint: 'Cumulatif : tout ce qui est antérieur ou égal à la date choisie. Idéal pour une chronologie « jusqu’à ».' },
            { value: 'time_between', label: 'Entre deux dates', hint: 'Fenêtre temporelle stricte entre deux dates. Idéal pour comparer une période précise.' },
        ];
    }
    if (type === 'range') {
        return [
            { value: 'range_between', label: 'Plage min/max', hint: 'Intervalle numérique complet (de … à …). Le plus polyvalent.' },
            { value: 'range_max', label: 'Maximum', hint: 'Seuil haut uniquement (≤ valeur). Utile pour « en dessous de ».' },
            { value: 'range_min', label: 'Minimum', hint: 'Seuil bas uniquement (≥ valeur). Utile pour « au-dessus de ».' },
        ];
    }
    if (type === 'text') {
        return [
            { value: 'text_contains', label: 'Contient', hint: 'Garde les objets dont la valeur contient le texte saisi, sans tenir compte des majuscules ni des accents.' },
        ];
    }
    return [
        { value: 'select_multi', label: 'Checklist', hint: 'Plusieurs catégories en parallèle. Filtre cumulatif (OU logique).' },
        { value: 'select_single', label: 'Choix unique', hint: 'Une seule catégorie à la fois. Lecture plus simple sur mobile.' },
    ];
}

/** Le type qu'une variante désigne : `range_max` → `range`. */
function typeDeVariante(variant) {
    const t = String(variant || '').split('_')[0];
    return ['time', 'range', 'select', 'text'].includes(t) ? t : null;
}

function defaultControlVariant(type) {
    if (type === 'time') return 'time_lte';
    if (type === 'range') return 'range_between';
    if (type === 'text') return 'text_contains';
    return 'select_multi';
}

function ensureControlVariant(c, type) {
    const options = new Set(controlVariantOptions(type || c.type).map((x) => x.value));
    if (!options.has(c.variant)) c.variant = defaultControlVariant(type || c.type);
}

function controlVariantHint(type, variant) {
    const opt = controlVariantOptions(type).find((x) => x.value === variant);
    return opt?.hint || '';
}

function controlVariantDockLabel(c) {
    const v = c.variant || defaultControlVariant(c.type);
    const map = {
        time_lte: 'Jusqu’à',
        time_between: 'Période',
        range_between: 'Plage',
        range_max: 'Max',
        range_min: 'Min',
        select_multi: 'Filtres',
        select_single: 'Choix',
        text_contains: 'Contient',
    };
    return map[v] || dockControlTypeTag(c.type);
}

function dockControlTypeTag(type) {
    if (type === 'time') return 'Temps';
    if (type === 'range') return 'Plage';
    if (type === 'text') return 'Recherche';
    return 'Catégories';
}

function dockPillId(layer, field) {
    return `data:${layer.id}:${field}`;
}

/** La clé d'une pastille dans ce qu'une étape retient : l'environnement par son nom, un contrôle par sa table et son champ. */
function clePastille(p) {
    return p.kind === 'data' ? `data:${p.layer.sourceTable || p.layer.id}:${p.control.field}` : p.id;
}

/** Les pastilles de l'étape jouée (contexte compris), ou `null` : rien n'est dit, la scène décide. */
function pastillesDeLetape() {
    if (!_storyPresenting) return null;
    return pastillesDe(STATE.story[_storyIdx]?.state);
}

/** Ce que l'auteur voit dans son dock à l'instant : l'environnement offert et les contrôles actifs, à retenir dans l'étape qu'il capture. */
function pastillesACapturer() {
    return listDockPills()
        .filter((p) => p.kind === 'env' || p.kind === 'sun' || p.kind === 'data')
        .map((p) => ({ id: clePastille(p), label: p.label }));
}

/** Pastilles dock : env (édition = toujours ; lecture = exposed) + données actives. */
/**
 * Les couches ou l'on peut saisir, telles que la fiche les ouvrira.
 *
 * La regle existe une fois — `saisieHorsEdition`, celle qui fait ouvrir la
 * fiche au toucher. En lecture on la prend telle quelle (`coucheEnSaisie`). En
 * edition, la pastille montre ce que le LECTEUR verra : on pose la meme
 * question en se placant de son cote, l'auteur ayant de toute facon le droit
 * d'ecrire.
 */
function couchesEnReleve() {
    const propose = relevesDuContexte();
    return couchesQuiOffrentUnReleve().filter((l) => l.visible !== false && releveProposeDans(propose, cleReleve(l)));
}

/** Les couches où un relevé est possible, visibles ou non : la règle seule, avant le contexte et la visibilité. */
function couchesQuiOffrentUnReleve() {
    return STATE.layers.filter((l) => (CONFIG.viewMode
        ? (coucheEnSaisie(l) || creationPossible(l, contexteCreation(l)).ok)
        : saisieHorsEdition({
            view: true,
            aDesLignes: coucheAvecLignes(l),
            peutEcrire: true,
            formulaires: formulairesDeLaCouche(l).filter(formulaireUtilisable),
            moteur: moteurDisponible(),
        })));
}

/** Comment une étape désigne une couche pour ses relevés : sa table, à défaut son identifiant (comme `findStoryLayer`). */
function cleReleve(layer) { return layer.sourceTable || layer.id; }

/**
 * Les couches dont le contexte actif propose le relevé, ou `null` s'il ne dit rien (pas de contexte, ou un contexte sans règle :
 * toutes les couches visibles gardent leur relevé).
 */
function relevesDuContexte() {
    if (!_contexteCle) return null;
    return relevesDe((STATE.story || []).find((s) => s.cle === _contexteCle)?.state);
}

/**
 * La localisation est-elle utilisable ici ?
 *
 * `navigator.geolocation` ne suffit pas : dans un widget Grist, l'iframe n'a
 * pas la permission, et MapLibre desactive alors son propre bouton (« Geolocation
 * support is not available »). Proposer « le plus proche » la produirait un
 * bouton qui ne fait rien. On lit donc le verdict de MapLibre, pose apres sa
 * verification.
 */
function localisationDisponible() {
    const b = _geoloc?._geolocateButton;
    return !!b && !b.disabled && typeof navigator !== 'undefined' && !!navigator.geolocation;
}

/* ------------------------------------------------------------------ */
/* Hors réseau — l'état de la synchronisation (application seulement)  */
/* ------------------------------------------------------------------ */

/** Le client hors réseau, quand l'application en a posé un ; `null` dans un widget Grist. */
function clientHorsLigne() {
    return (typeof grist !== 'undefined' && grist && grist._horsLigne) || null;
}

let _synchroDesabonner = null;
/** Le dock suit la file : une pastille qui annonce « 2 en attente » doit se corriger quand elles partent. */
function brancherSynchro() {
    const hl = clientHorsLigne();
    if (!hl || _synchroDesabonner) return;
    _synchroDesabonner = hl.abonner(() => {
        majBoutonsSynchro();
        rafraichirPanneauSynchro();
    });
    majBoutonsSynchro();
}

/**
 * Le bouton de synchronisation — dans la barre du haut, et sur la carte quand la barre est retirée : ce n'est pas une
 * information cartographique. Il n'apparaît que lorsqu'il y a quelque chose à dire (hors réseau, en attente, à vérifier) ;
 * la pastille dit la phrase : calme (rouge doux) hors réseau ou en attente, pleine quand il faut vérifier.
 */
function majBoutonsSynchro() {
    const hl = clientHorsLigne();
    const p = hl ? pastilleSynchro() : null;
    for (const id of ['btn-synchro', 'hote-synchro']) {
        const b = $(id);
        if (!b) continue;
        b.hidden = !p;
        if (!p) continue;
        b.title = p.label;
        b.setAttribute('aria-label', p.label);
        b.classList.remove('etat-alerte', 'etat-hors', 'etat-attente');
        b.classList.add(p.alerte ? 'etat-alerte' : (!hl.etat().enLigne ? 'etat-hors' : 'etat-attente'));
        const lib = b.querySelector('.synchro-lib');
        if (lib) lib.textContent = p.label;
    }
}

function fermerPanneauSynchro() {
    document.getElementById('panneau-synchro')?.remove();
    document.removeEventListener('pointerdown', _fermeturePanneauSynchro, true);
    document.removeEventListener('keydown', _touchePanneauSynchro, true);
}
function _fermeturePanneauSynchro(e) {
    if (!e.target.closest?.('#panneau-synchro, #btn-synchro, #hote-synchro')) fermerPanneauSynchro();
}
function _touchePanneauSynchro(e) { if (e.key === 'Escape') { e.stopPropagation(); fermerPanneauSynchro(); } }

/** Le contenu du panneau suit la file ; plus rien à dire, il se retire de lui-même. */
function rafraichirPanneauSynchro() {
    const panneau = document.getElementById('panneau-synchro');
    if (!panneau) return;
    if (!pastilleSynchro()) { fermerPanneauSynchro(); return; }
    panneau.innerHTML = renderSynchroDockSlotHtml();
}

/** Ce qui est parti, ce qui attend, ce qui a été refusé : le même contenu que l'ancienne pastille, posé sous le bouton. */
function ouvrirPanneauSynchro(ancre, ev) {
    ev?.stopPropagation?.();
    if (document.getElementById('panneau-synchro')) { fermerPanneauSynchro(); return; }
    if (!clientHorsLigne()) return;
    const panneau = document.createElement('div');
    panneau.id = 'panneau-synchro';
    panneau.className = 'posture-menu panneau-synchro';
    panneau.setAttribute('role', 'dialog');
    panneau.setAttribute('aria-label', 'Synchronisation');
    panneau.innerHTML = renderSynchroDockSlotHtml();
    document.body.appendChild(panneau);
    if (ancre && !surTelephone()) {
        const r = ancre.getBoundingClientRect();
        panneau.style.top = `${Math.min(r.bottom + 8, window.innerHeight - panneau.offsetHeight - 12)}px`;
        panneau.style.left = `${Math.max(12, Math.min(r.right - panneau.offsetWidth, window.innerWidth - panneau.offsetWidth - 12))}px`;
    } else {
        panneau.classList.add('posture-feuille');
    }
    document.addEventListener('pointerdown', _fermeturePanneauSynchro, true);
    document.addEventListener('keydown', _touchePanneauSynchro, true);
}

/** La pastille de synchronisation : seulement quand il y a quelque chose à dire. */
function pastilleSynchro() {
    const hl = clientHorsLigne();
    if (!hl) return null;
    const e = hl.etat();
    // Une scène faite sur l'appareil : rien ne l'attend côté réseau, mais elle n'existe encore nulle part ailleurs.
    if (e.local) {
        return {
            id: 'synchro', kind: 'synchro', alerte: false, label: 'Sur l’appareil · à envoyer',
            icon: '',
        };
    }
    if (e.enLigne && !e.enAttente && !e.incertaines && !e.refusees) return null;
    const aVerifier = e.refusees + e.incertaines;
    let label;
    if (aVerifier) label = `À vérifier · ${aVerifier}`;
    else if (!e.enLigne) label = e.enAttente ? `Hors réseau · ${e.enAttente} en attente` : 'Hors réseau';
    else label = `${e.enAttente} en attente`;
    return {
        id: 'synchro',
        kind: 'synchro',
        icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18.5 2v4h-4M5.5 22v-4h4"/></svg>',
        label,
        alerte: aVerifier > 0,
    };
}

function renderSynchroDockSlotHtml() {
    const hl = clientHorsLigne();
    if (!hl) return '';
    const e = hl.etat();
    if (e.local) {
        const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        return `<div class="dock-slot-data dock-slot-synchro">
            <div class="dock-slot-head"><span class="dock-slot-title">Scène sur cet appareil</span><span class="dock-slot-tag">à envoyer</span></div>
            <div class="dock-slot-body">
                <p class="releve-aide">« ${esc(e.nomScene)} » n’existe que sur cet appareil. Envoyez-la dans un document Grist pour la retrouver ailleurs, la partager et la sauvegarder.</p>
                <div class="releve-actions"><button type="button" class="btn btn-dark btn-sm" onclick="A.envoyerSceneLocale()">Envoyer vers Grist…</button></div>
            </div>
        </div>`;
    }
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const quand = (t) => (t ? new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
    const ETIQUETTES = { en_attente: 'en attente', en_cours: 'envoi…', incertaine: 'à vérifier', refusee: 'refusée' };
    const instantanes = hl.instantanes();
    const plusAncien = instantanes.length ? Math.min(...instantanes.map((i) => i.date)) : null;
    const phrases = [];
    if (!e.enLigne) phrases.push('Pas de réseau : vos relevés sont gardés sur l’appareil et partiront au retour du réseau.');
    if (!e.durable) phrases.push('Le stockage de l’appareil est indisponible : ces relevés seront perdus si l’application se ferme.');
    if (plusAncien && !e.enLigne) phrases.push(`Données affichées : celles de l’appareil, du ${quand(plusAncien)}.`);
    if (e.derniereSynchro) phrases.push(`Dernier envoi réussi : ${quand(e.derniereSynchro)}.`);
    const lignes = hl.entrees().map((x) => {
        const gestes = (x.etat === 'refusee' || x.etat === 'incertaine')
            ? `<button type="button" class="btn btn-soft btn-sm" onclick="A.synchroReessayer('${chaineJs(x.id)}')">${x.etat === 'incertaine' ? 'Renvoyer quand même' : 'Réessayer'}</button>
               <button type="button" class="btn btn-soft btn-sm" onclick="A.synchroAbandonner('${chaineJs(x.id)}')">Abandonner</button>`
            : '';
        return `<div class="synchro-ligne etat-${esc(x.etat)}">
            <div><span class="synchro-etat">${esc(ETIQUETTES[x.etat] || x.etat)}</span> ${esc(x.resume)}${x.pieceJointe ? ' · photo' : ''} <small>${esc(quand(x.date))}</small></div>
            ${x.raison ? `<div class="synchro-raison">${esc(x.raison)}</div>` : ''}
            ${x.etat === 'incertaine' ? '<div class="synchro-raison">L’envoi a été interrompu : la visite est peut-être déjà dans le document. Vérifiez avant de renvoyer.</div>' : ''}
            ${gestes ? `<div class="releve-actions">${gestes}</div>` : ''}
        </div>`;
    }).join('');
    return `<div class="dock-slot-data dock-slot-synchro">
        <div class="dock-slot-head"><span class="dock-slot-title">Synchronisation</span><span class="dock-slot-tag">${e.enLigne ? 'en ligne' : 'hors réseau'}</span></div>
        <div class="dock-slot-body">
            ${phrases.map((p) => `<p class="releve-aide">${esc(p)}</p>`).join('')}
            ${lignes}
            ${e.enAttente && e.enLigne ? '<div class="releve-actions"><button type="button" class="btn btn-dark btn-sm" onclick="A.synchroEnvoyer()">Envoyer maintenant</button></div>' : ''}
        </div>
    </div>`;
}

function renderReleveDockSlotHtml() {
    const lignes = lignesReleve(couchesEnReleve().map((couche) => ({
        couche,
        formulaires: offertsEnLecture(formulairesDeLaCouche(couche)),
        creation: creationPossible(couche, contexteCreation(couche)).ok,
    })));
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const geo = localisationDisponible();
    const rangees = lignes.map((l) => {
        const proche = geo && _dernierePosition ? objetProcheDeCouche(l.couche) : null;
        const nomProche = proche ? (nomObjet(proche.feature.properties || {}) || 'objet') : '';
        return `<div class="releve-couche">
            <div class="releve-nom"><span class="sw" style="background:${esc(fondPastilleCouche(l.couche) || '#888')}"></span>${esc(l.nom)}</div>
            ${l.formulaires.length ? `<div class="releve-forms">${l.formulaires.map(esc).join(' · ')}</div>` : ''}
            <div class="releve-actions">
                ${l.creation ? `<button type="button" class="btn btn-dark btn-sm" onclick="A.nouvelObjet('${chaineJs(l.couche.id)}')">＋ Ajouter un objet</button>` : ''}
                ${geo ? `<button type="button" class="btn btn-dark btn-sm" onclick="A.releveProche('${chaineJs(l.couche.id)}')">${proche
                    ? `Le plus proche : ${esc(nomProche)} <small>${esc(direDistance(proche.distance))}</small>`
                    : 'Le plus proche de moi'}</button>` : ''}
                <button type="button" class="btn btn-soft btn-sm" onclick="A.listeObjets('${chaineJs(l.couche.id)}')">Choisir un objet</button>
                <button type="button" class="btn btn-soft btn-sm" title="Cadrer la carte sur la couche"
                    onclick="A.releveCadrer('${chaineJs(l.couche.id)}')">Cadrer</button>
            </div>
        </div>`;
    }).join('');
    return `<div class="dock-slot-data dock-slot-releve">
        <div class="dock-slot-head"><span class="dock-slot-title">Relevé${infoBulle('Touchez un objet sur la carte, ou choisissez-le dans la liste. « Cadrer » centre la carte sur la couche.')}</span></div>
        <div class="dock-slot-body">
            ${rangees}
        </div>
    </div>`;
}

/**
 * L'objet de la couche le plus proche de la derniere position connue — parmi
 * ceux que les filtres laissent voir : proposer un objet masque enverrait
 * saisir sur ce qu'on a choisi de ne pas regarder.
 */
function objetProcheDeCouche(layer) {
    const feats = Array.isArray(layer?.geojson?.features) ? layer.geojson.features : [];
    if (!feats.length || !_dernierePosition) return null;
    const garde = buildControlPredicate(layer);
    const r = objetLePlusProche(feats, _dernierePosition,
        (f) => (!garde || garde(f) ? featureCentroidLngLat(f) : null));
    return r ? { ...r, feature: feats[r.idx] } : null;
}

function listDockPills() {
    const pills = [];
    const vcs = STATE.viewerControls || createDefaultViewerControls();
    // La synchronisation n'est pas une information de carte : elle vit dans la barre du haut (ou, quand la barre est
    // retirée, parmi les commandes de la carte) — voir `majBoutonsSynchro`.

    // L'interrupteur gouverne la pastille, en edition comme en lecture.
    //
    // Il ne le faisait qu'en lecture : en edition les trois pastilles
    // d'environnement s'affichaient quoi qu'il arrive, et le panneau annoncait
    // « desactive » pendant que la carte montrait le contraire. Un reglage qui
    // ne fait rien de visible est pire qu'un reglage absent — on doute de ce
    // qu'on vient de faire.
    //
    // L'auteur ne perd aucun acces : le soleil, la vue et les fonds gardent
    // leur module dans le rail lateral. La pastille dit ce que le LECTEUR
    // verra ; c'est bien ce que le libelle promet sous chaque interrupteur.
    if (getViewerControl(vcs, 'sun')?.exposed) {
        pills.push({ id: 'sun', kind: 'sun', icon: '☀', label: 'Soleil' });
    }
    // Le recit ne se lance que par cette pastille : le bouton de la barre et
    // le bouton flottant mobile sont retires (`pastilleRecitRequise`). Elle
    // vient EN TETE : c'est la seule qui lance quelque chose au lieu de
    // regler, et le lecteur doit la trouver sans chercher.
    const mobile = document.body.classList.contains('mobile-layout');
    // Le récit est une visite guidée ; un contexte est un cadrage de travail (couches, filtres, heure) qu'on choisit sans
    // séquence. Une étape marquée « contexte » sert donc le second, pas le premier : une scène dont toutes les étapes sont des
    // contextes n'a pas de récit à lire, et lui offrir « Lire le récit » à côté de « Contexte » proposait deux fois la même chose.
    const etapesDeRecit = (STATE.story || []).filter((s) => !usageDe(s.state).contexte).length;
    if (pastilleRecitRequise({
        lecture: CONFIG.viewMode,
        nbEtapes: etapesDeRecit,
        enPresentation: lecteurRecitActif(),
    })) {
        pills.unshift({
            id: 'recit',
            kind: 'action',
            icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l14 8-14 8z"/></svg>',
            label: 'Lire le récit',
            court: 'Récit',
            action: () => A.storyPlay(0),
        });
    }
    // Le releve : UNE pastille, quel que soit le nombre de formulaires offerts
    // — elle regroupe, pour ne pas charger le dock. Un formulaire publie ne
    // devenait rien de visible : le lecteur ne decouvrait qu'un objet se saisit
    // qu'en le touchant. Elle suit le recit, l'autre pastille qui agit.
    // Un contexte qui règle ses relevés décide seul : sa liste vide ne laisse pas la pastille ouverte sur du vide à cause des
    // saisies d'un trajet, qui ne le concernent pas.
    const saisiesRecit = _storyPresenting && relevesDuContexte() === null
        && (STATE.story || []).some((s) => (s.state?.saisies || []).length);
    if (couchesEnReleve().length || saisiesRecit) {
        const alerte = _storyPresenting ? evaluerAlerte() : { allumee: false, texte: '' };
        const pastilleReleve = {
            id: 'releve',
            kind: 'releve',
            icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2V4a1 1 0 0 1 1-1z"/><path d="M9 11h6M9 15h4"/></svg>',
            label: alerte.allumee && alerte.texte ? `Relevé · ${alerte.texte}` : 'Relevé',
            court: 'Relevé',
            alerte: !!alerte.allumee,
        };
        const iRecit = pills.findIndex((p) => p.id === 'recit');
        pills.splice(iRecit + 1, 0, pastilleReleve);
    }
    // Les contextes que la scène propose : en exploitation et en lecture, jamais
    // dans le lecteur de récit (qui a ses propres commandes) ni en édition (où
    // l'auteur les règle dans le module Récit).
    if (CONFIG.viewMode && !lecteurRecitActif() && contextesDisponibles().length) {
        const courant = _contexteCle ? contexteDeCle(STATE.story, _contexteCle) : null;
        const apres = Math.max(pills.findIndex((p) => p.id === 'recit'), pills.findIndex((p) => p.id === 'releve'));
        pills.splice(apres + 1, 0, {
            id: 'contexte',
            kind: 'contexte',
            icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
            label: courant ? `Contexte · ${courant.titre}` : 'Contexte',
            court: 'Contexte',
        });
    }
    // Icônes du dock : s'en tenir aux emoji, avec leur sélecteur de variante
    // (U+FE0F). Un glyphe symbolique rare — ici `▦` U+25A6 — n'existe pas dans
    // les polices système courantes, et un emoji sans sélecteur bascule en
    // rendu texte : dans les deux cas la pastille s'affiche vide, sans erreur.
    if (getViewerControl(vcs, 'view3d')?.exposed) {
        pills.push({ id: 'view3d', kind: 'env', icon: '🏙️', label: '2D / 3D' });
    }
    if (getViewerControl(vcs, 'basemap')?.exposed) {
        pills.push({ id: 'basemap', kind: 'env', icon: '🗺️', label: 'Fonds' });
    }
    for (const { layer, c } of collectPublishedControls()) {
        pills.push({
            id: dockPillId(layer, c.field),
            kind: 'data',
            icon: controlTypeIcon(c.type),
            label: (c.label || c.field).trim() || c.field,
            layer,
            control: c,
        });
    }
    // Une étape jouée offre les pastilles de sa capture : ce que l'auteur voyait dans son dock. Elle ne touche ni au relevé, ni au
    // contexte, ni au récit, qui suivent leurs règles. Une étape sans liste laisse les pastilles de la scène.
    const offertes = pastillesDeLetape();
    if (offertes) {
        for (let i = pills.length - 1; i >= 0; i--) {
            const p = pills[i];
            if ((p.kind === 'env' || p.kind === 'sun' || p.kind === 'data') && !pastilleOfferte(offertes, clePastille(p))) pills.splice(i, 1);
        }
    }
    // La localisation ferme la rangée, contre la boussole : les deux disent où
    // l'on est et vers où l'on regarde. Les contrôles de la carte viennent
    // ensuite, en s'éloignant de la boussole.
    if (pastilleLocalisationRequise({
        mobile,
        geolocalisation: !!_geoloc && typeof navigator !== 'undefined' && !!navigator.geolocation,
    })) {
        pills.push({
            id: 'localiser',
            kind: 'action',
            icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
            label: 'Me localiser',
            active: _suiviPosition,
            action: () => _geoloc?.trigger(),
        });
    }
    return pills;
}

function basemapChoicesForDock() {
    const vc = getViewerControl(STATE.viewerControls, 'basemap');
    if (!CONFIG.viewMode) return Object.keys(BASEMAPS);
    const allowed = vc?.config?.allowed || [];
    if (!allowed.length) return Object.keys(BASEMAPS);
    return allowed.filter((k) => BASEMAPS[k]);
}

function renderSunDockSlotHtml() {
    const vc = getViewerControl(STATE.viewerControls, 'sun');
    const shadowsOn = vc?.config?.shadows !== false && STATE.settings.shadows;
    return `<div class="dock-slot-sun" id="sun-strip">
        <div class="seg-inline">
            <span class="date" id="sun-date">—</span>
            <span class="time" id="sun-time">12:00</span>
        </div>
        <div class="sun-arc" id="sun-arc" tabindex="0" role="slider" aria-label="Heure de la scène"
             aria-valuemin="0" aria-valuemax="1439" aria-valuenow="${STATE.settings.timeOfDay}" aria-valuetext="${libelleHeure(STATE.settings.timeOfDay)}">
            <svg width="168" height="34" viewBox="0 0 168 34" aria-hidden="true">
                <line id="sun-arc-horizon" x1="8" x2="160" y1="${geometrieArcScene().horizonY.toFixed(1)}" y2="${geometrieArcScene().horizonY.toFixed(1)}" stroke="#C9C0A8" stroke-width="0.8" />
                <path id="sun-arc-path" d="${geometrieArcScene().chemin}" stroke="#E8A234" stroke-width="1.4" fill="none" stroke-dasharray="2 2" />
            </svg>
            <div class="sun-dot" id="sun-dot"></div>
            <span class="hlbl" style="left:2px">00h</span>
            <span class="hlbl" style="left:50%;transform:translateX(-50%)">12h</span>
            <span class="hlbl" style="right:2px">24h</span>
        </div>
        <div class="seg-inline">
            <span class="alt-lbl">Hauteur</span>
            <span class="alt-v" id="sun-alt">—</span>
        </div>
        <div class="vsep"></div>
        <button type="button" class="shadow-toggle ${shadowsOn ? 'on' : ''}" id="shadow-toggle">
            <svg class="ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2m10-10h-2M4 12H2"/></svg>
            <span>Ombres</span>
        </button>
    </div>`;
}

function renderView3dDockSlotHtml() {
    const pitch = map?.getPitch() || 0;
    const is3d = pitch > 10;
    return `<div class="dock-slot-view3d">
        <span class="dock-label">Vue</span>
        <div class="dock-seg" role="group" aria-label="Vue 2D ou 3D">
            <button type="button" class="dock-seg-btn ${!is3d ? 'active' : ''}" aria-pressed="${!is3d}" onclick="A.setView3d(false)">2D</button>
            <button type="button" class="dock-seg-btn ${is3d ? 'active' : ''}" aria-pressed="${is3d}" onclick="A.setView3d(true)">3D</button>
        </div>
    </div>`;
}

/** Une pastille de couleur pour chaque fond : de quoi le reconnaître sans lire, à la place d'un emoji propre à chaque appareil. */
const PASTILLES_FONDS = {
    liberty: 'linear-gradient(135deg, #ece6d6 50%, #f2c14e 50%)',
    bright: 'linear-gradient(135deg, #e3d3ac 50%, #9ec6e0 50%)',
    positron: 'linear-gradient(135deg, #f1f1f1 50%, #d9d9d9 50%)',
    'plan-ign': 'linear-gradient(135deg, #cfe3bf 50%, #f4f0e0 50%)',
    'ortho-ign': 'linear-gradient(135deg, #51603f 50%, #8a7d5c 50%)',
};

function renderBasemapDockSlotHtml() {
    const keys = basemapChoicesForDock();
    const cur = STATE.settings.basemap;
    return `<div class="dock-slot-basemap">
        <span class="dock-label">Fond</span>
        <div class="dock-seg" role="group" aria-label="Fond de carte">${keys.map((k) => {
            const b = BASEMAPS[k];
            const esc = String(k).replace(/'/g, "\\'");
            const lbl = String(b.label).replace(/"/g, '&quot;');
            const sw = PASTILLES_FONDS[k] || '#ddd';
            return `<button type="button" class="dock-seg-btn ${cur === k ? 'active' : ''}" aria-pressed="${cur === k}" onclick="A.setBasemap('${esc}')" title="${lbl}"><span class="dock-sw" style="background:${sw}" aria-hidden="true"></span><span>${b.label}</span></button>`;
        }).join('')}</div>
    </div>`;
}

function renderDockSlotHost() {
    const slotHost = $('dock-slot-host');
    const panel = $('dock-panel');
    if (!slotHost || !_openDockPill) return;
    const pill = listDockPills().find((p) => p.id === _openDockPill);
    if (!pill) {
        slotHost.innerHTML = '';
        return;
    }
    // Le releve liste des couches et des boutons : il lui faut la hauteur d'un
    // controle de donnees, pas celle d'un interrupteur d'environnement.
    panel?.classList.toggle('dock-panel-tall', pill.kind === 'data' || pill.kind === 'releve' || pill.kind === 'contexte' || pill.kind === 'synchro');
    if (pill.id === 'sun') {
        slotHost.innerHTML = renderSunDockSlotHtml();
        updateSunStrip();
    } else if (pill.id === 'view3d') {
        slotHost.innerHTML = renderView3dDockSlotHtml();
    } else if (pill.id === 'basemap') {
        slotHost.innerHTML = renderBasemapDockSlotHtml();
    } else if (pill.kind === 'releve') {
        slotHost.innerHTML = renderReleveDockSlotHtml();
    } else if (pill.kind === 'contexte') {
        slotHost.innerHTML = renderContexteDockSlotHtml();
    } else if (pill.kind === 'synchro') {
        slotHost.innerHTML = renderSynchroDockSlotHtml();
    } else if (pill.kind === 'data') {
        const t = controlVariantDockLabel(pill.control);
        const label = (pill.label || '').replace(/</g, '&lt;');
        const outils = htmlOutilsSelect(pill.layer, pill.control);
        const n = pill.control.type === 'select' ? controlUniqueValues(pill.layer, pill.control.field, MAX_VALEURS_LISTE).length : 0;
        slotHost.innerHTML = `<div class="dock-slot-data">
            <div class="dock-slot-head">
                <span class="dock-slot-title">${label}</span>
                <span class="dock-slot-tag">${t}</span>
            </div>
            ${outils ? `<div class="dock-ligne-outils"><span>${n} valeur${n > 1 ? 's' : ''}</span><span class="dock-outils">${outils}</span></div>` : ''}
            <div class="dock-slot-body">${renderControlBody(pill.layer, pill.control, { dock: true })}</div>
        </div>`;
    }
}

/** Dock pastilles — FABs + une capsule ouverte (env + données actives). */
function refreshControlsDock() {
    const dock = $('map-controls-dock');
    const fabsHost = $('dock-fabs');
    const slotHost = $('dock-slot-host');
    if (!dock || !fabsHost) return;

    const pills = listDockPills();
    const hasPills = pills.length > 0;
    dock.classList.toggle('has-pills', hasPills);
    if (!hasPills) {
        // Replié, pour qu'une première pastille apparaisse en pastille et non
        // sur un panneau ouvert qu'aucune n'a demandé.
        dock.classList.add('collapsed');
        fabsHost.innerHTML = '';
        if (slotHost) slotHost.innerHTML = '';
        _openDockPill = null;
        return;
    }

    if (_openDockPill && !pills.some((p) => p.id === _openDockPill)) {
        _openDockPill = null;
        dock.classList.add('collapsed');
    }

    // Sans pastille ouverte, le seul état cohérent est « replié ».
    //
    // Le CSS lie les deux moitiés du dock : `.collapsed` montre les pastilles et
    // cache le panneau, son absence fait l'inverse. Or `wireMapControlsDock` part
    // sur `collapsed = false` quand rien n'est mémorisé — le cas de toute
    // première ouverture. Le panneau, lui, ne se remplit que s'il y a une
    // pastille ouverte. Les deux moitiés se retrouvaient donc vides en même
    // temps : les pastilles rendues mais masquées par
    // `:not(.collapsed) .dock-fabs { display: none }`, le panneau affiché mais
    // sans contenu.
    //
    // À l'écran : un rectangle nu de 61 px portant le seul bouton « Replier »,
    // et des contrôles inatteignables. Le défaut est resté invisible tant
    // qu'aucune scène ne déclarait de contrôle **actif** — `listDockPills` ne
    // retenant que ceux-là, `hasPills` était faux et la fonction sortait avant
    // d'en arriver ici.
    if (!_openDockPill) dock.classList.add('collapsed');

    // Deux familles : celles qui AGISSENT (lire le récit, relever, choisir un contexte) portent leur nom ; celles qui RÈGLENT
    // (soleil, 2D/3D, fonds, filtres) restent des pastilles. Un séparateur les distingue.
    const agit = (p) => !!p.court;
    fabsHost.innerHTML = pills.map((p, i) => {
        const lbl = String(p.label).replace(/"/g, '&quot;');
        const pid = String(p.id).replace(/"/g, '&quot;');
        const isOpen = (_openDockPill === p.id && !dock.classList.contains('collapsed')) || !!p.active;
        const ic = p.id === 'sun'
            ? '<span class="sun-dot" aria-hidden="true"></span>'
            : `<span class="dock-fab-ic" aria-hidden="true">${p.icon}</span>`;
        const lib = agit(p) ? `<span class="dock-fab-lib">${String(p.court).replace(/</g, '&lt;')}</span>` : '';
        const sep = agit(p) && pills[i + 1] && !agit(pills[i + 1]) ? '<span class="dock-sep" aria-hidden="true"></span>' : '';
        return `<button type="button" class="dock-fab ${agit(p) ? 'avec-lib' : ''} ${isOpen ? 'active' : ''} ${p.alerte ? 'alerte' : ''}" data-pill="${pid}" title="${lbl}" aria-label="${lbl}">${ic}${lib}</button>${sep}`;
    }).join('');

    fabsHost.querySelectorAll('[data-pill]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.pill;
            // Toutes les pastilles devoilaient un reglage : le composant n'avait
            // que ce geste-la. Une pastille d'ACTION agit et s'arrete — sans
            // cela « Recit » aurait ouvert un panneau vide.
            const pastille = pills.find((p) => p.id === id);
            if (pastille?.action) { pastille.action(); return; }
            if (_openDockPill === id && !dock.classList.contains('collapsed')) {
                dock.classList.add('collapsed');
            } else {
                _openDockPill = id;
                dock.classList.remove('collapsed');
                renderDockSlotHost();
            }
        });
    });

    if (!dock.classList.contains('collapsed') && _openDockPill) {
        renderDockSlotHost();
    } else if (slotHost) {
        slotHost.innerHTML = '';
        $('dock-panel')?.classList.remove('dock-panel-tall');
    }
}

/**
 * Pose ce qu'une scène ou les préférences disent de l'horloge
 * (`horlogeDepuisReglages`) : fuseau, date épinglée, heure, ancre. Une date
 * épinglée devient aussi la date du sélecteur, pour que l'interface la montre.
 */
function appliquerHorlogeDeclaree(h) {
    if (!h) return;
    if (fuseauValide(h.fuseau)) STATE.settings.fuseau = h.fuseau;
    if (dateValide(h.dateEpinglee)) {
        STATE.settings.dateEpinglee = h.dateEpinglee;
        STATE.settings.date = new Date(h.dateEpinglee + 'T12:00:00');
    }
    if (Number.isFinite(h.timeOfDay)) STATE.settings.timeOfDay = h.timeOfDay;
    if (h.lieu) { STATE.location = { ...STATE.location, lat: h.lieu.lat, lng: h.lieu.lng }; STATE.locationChoisie = true; }
}

async function syncScenePrefsFromGrist() {
    if (!CONFIG.grist.ready) return;
    const prefs = await loadScenePrefs(grist.docApi);
    STATE.viewerControls = prefs.viewerControls || createDefaultViewerControls();
    STATE.exposition = prefs.exposition || expositionVide();
    STATE.miniature = prefs.miniature || '';
    appliquerCadrageDeScene();

    // Les réglages retenus la fois d'avant priment sur les défauts du code :
    // qui a choisi un fond veut le retrouver, pas repartir de « liberty ». Ils
    // ne priment pas sur une étape de récit, qui décrit un état voulu par
    // l'auteur et s'applique après.
    const s = prefs.settings;
    if (!s || !Object.keys(s).length) return;

    // Ceux que `applyStoryEnvironment` ne connaît pas, posés d'abord pour que
    // l'application du relief les voie.
    if (Number.isFinite(s.terrainExaggeration)) STATE.settings.terrainExaggeration = s.terrainExaggeration;
    if (s.terrainSource) STATE.settings.terrainSource = s.terrainSource;
    if (s.modelSet) { STATE.settings.modelSet = s.modelSet; MODEL_LIBRARY.set = s.modelSet; }
    // Horloge : fuseau de la scène, date seulement si elle a été épinglée.
    appliquerHorlogeDeclaree({ fuseau: s.fuseau, dateEpinglee: s.dateEpinglee });

    // Le reste passe par le chemin du récit, qui **applique** au lieu de se
    // contenter d'affecter : un `Object.assign` sur `STATE.settings` changerait
    // la valeur sans toucher la carte — le fond mémorisé serait lu, écrit dans
    // l'état, et la carte garderait le style déjà chargé. `setStyle` détruit
    // les couches montées ; `applyStoryEnvironment` les remonte, via
    // `onStyleReady`.
    applyStoryEnvironment(s, { allowBasemapSwitch: true });
}

/**
 * Enregistre les réglages de scène, une fois le calme revenu.
 *
 * Le débounce n'est pas un confort : l'arc solaire émet un réglage par pixel
 * parcouru, et le curseur d'exagération autant. Écrire à chaque émission
 * enverrait des dizaines d'actions à Grist pour un seul geste.
 */
let _persistPrefsTimer = null;
function persistScenePrefsDifferee(delai = 600) {
    clearTimeout(_persistPrefsTimer);
    _persistPrefsTimer = setTimeout(() => { persistScenePrefs(); }, delai);
}

async function persistScenePrefs() {
    if (!CONFIG.grist.ready || CONFIG.viewMode) return;
    if (!assertCanWrite('enregistrer les réglages de scène')) return;
    try {
        await saveScenePrefs(grist.docApi, {
            viewerControls: STATE.viewerControls,
            settings: STATE.settings,
            exposition: STATE.exposition,
            // Écrite seulement quand l'auteur vient de la changer : vingt Ko ne se réécrivent pas à chaque réglage.
            ...(STATE._miniatureAEcrire ? { miniature: STATE.miniature } : {}),
        }, { viewMode: false });
        STATE._miniatureAEcrire = false;
    } catch (e) {
        console.warn('[Atlas] saveScenePrefs', e.message);
    }
}

function renderEnvControlsSection() {
    const list = STATE.viewerControls || createDefaultViewerControls();
    const esc = (s) => String(s).replace(/'/g, "\\'");
    return list.map((vc) => {
        const on = !!vc.exposed;
        let sub = '';
        if (vc.id === 'sun' && on) {
            const sh = vc.config?.shadows !== false;
            sub = `<label class="cat-row" style="margin-top:6px;cursor:pointer">
                <input type="checkbox" ${sh ? 'checked' : ''} onchange="A.setViewerShadows(this.checked)">
                <span class="cat-value">Ombres portées</span></label>`;
        }
        if (vc.id === 'basemap' && on) {
            const allowed = new Set(vc.config?.allowed || []);
            sub = `<div class="option-cards grid2" style="margin-top:8px">${Object.entries(BASEMAPS).map(([k, b]) => `
                <div class="option-card ${allowed.has(k) ? 'active' : ''}" onclick="A.toggleViewerBasemapAllowed('${chaineJs(k)}')">
                    <div class="oc-icon">${b.icon}</div><div class="oc-label">${b.label}</div>
                </div>`).join('')}</div>`;
        }
        return `<div class="section">
            <div class="toggle-row">
                <span class="tlabel">${vc.label}</span>
                <div class="toggle ${on ? 'on' : ''}" onclick="A.setViewerExposed('${vc.id}', ${!on})" role="switch" tabindex="0" aria-checked="${on}" aria-label="Exposer ${vc.label || vc.id} en lecture" title="Visible en lecture"></div>
            </div>
            ${sub}
        </div>`;
    }).join('');
}

function renderDataControlRow(layer, field, type, c, profil) {
    const esc = (s) => escapeHtml(String(s).replace(/'/g, "\\'"));
    const typeActuel = c.type || type;
    const icon = controlTypeIcon(typeActuel);
    const sim = c.mode === 'simulation' ? ' <span class="hint" style="display:inline;padding:2px 6px;margin:0">simulation</span>' : '';
    const labelVal = escapeHtml(c.label || field);
    const active = !!c.active;
    ensureControlVariant(c, typeActuel);
    // Les formes possibles pour ce champ : un nombre à peu de valeurs se filtre
    // aussi par catégories, une catégorie se cherche aussi par texte.
    const types = [...new Set([typeActuel, ...((profil && profil.typesPossibles) || [])])];
    const option = (v) => `<option value="${v.value}" ${c.variant === v.value ? 'selected' : ''}>${v.label}</option>`;
    const options = types.length > 1
        ? types.map((t) => `<optgroup label="${controlTypeLabel(t)}">${controlVariantOptions(t).map(option).join('')}</optgroup>`).join('')
        : controlVariantOptions(typeActuel).map(option).join('');
    const variantHint = controlVariantHint(typeActuel, c.variant);
    const idVar = `ctl-var-${layer.id}-${field}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `<div class="section">
        <div class="toggle-row">
            <span class="tlabel ctl-tete"><span aria-hidden="true">${icon}</span><input class="input"
                value="${labelVal}" onchange="A.setControlLabel('${chaineJs(layer.id)}','${chaineJs(field)}',this.value)" placeholder="${escapeHtml(field)}" aria-label="Libellé du contrôle ${escapeHtml(field)}">
                <span class="ctl-type">${controlTypeLabel(typeActuel).toLowerCase()}</span>${sim}</span>
            <div class="toggle ${active ? 'on' : ''}" onclick="A.toggleControl('${chaineJs(layer.id)}','${chaineJs(field)}','${typeActuel}')" role="switch" tabindex="0" aria-checked="${active}" aria-label="Publier le contrôle ${escapeHtml(field)}" title="Afficher en lecture"></div>
        </div>
        <div class="control-variant-row">
            <select id="${idVar}" class="input control-variant-select" aria-label="Type de contrôle" onchange="A.setControlVariant('${chaineJs(layer.id)}','${chaineJs(field)}',this.value)">
                ${options}
            </select>${variantHint ? infoBulle(variantHint) : ''}
        </div>
        ${active ? renderControlBody(layer, c) : ''}
    </div>`;
}

/** « Tout » et « Aucun » d'un contrôle à valeurs multiples ; vide pour un choix unique. */
function htmlOutilsSelect(layer, c) {
    if (c.type !== 'select' || c.variant === 'select_single') return '';
    const lid = escapeHtml(String(layer.id).replace(/'/g, "\\'"));
    const fid = escapeHtml(String(c.field).replace(/'/g, "\\'"));
    return `<button type="button" class="ctl-mini" onclick="A.toutesValeursControle('${lid}','${fid}',true)">Tout</button>
        <button type="button" class="ctl-mini" onclick="A.toutesValeursControle('${lid}','${fid}',false)">Aucun</button>`;
}

function renderControlBody(layer, c, { dock = false } = {}) {
    const esc = (s) => escapeHtml(String(s).replace(/'/g, "\\'"));
    ensureControlVariant(c, c.type);
    const lid = esc(layer.id);
    const fid = esc(c.field);
    const nomLisible = escapeHtml(c.label || c.field);

    if (c.type === 'select') {
        // Dans l'ordre de la légende quand le champ colore la couche (gravité croissante d'une
        // table de référence), et non par effectif : « N-A » ne s'intercale pas entre deux états.
        const col = layer.style?.symbolization?.color;
        const brutes = controlUniqueValues(layer, c.field, MAX_VALEURS_LISTE);
        const vals = col?.mode === 'categorized' && col.field === c.field ? valeursOrdonnees(col, brutes) : brutes;
        // « (sans valeur) » est aussi un choix sur une couche distante, avec un
        // compte inconnu (`null`) : sans lui, « Tout » écartait pour de bon les
        // objets sans valeur.
        const sansValeur = choixSansValeur(layer, c.field);
        // Un filtre sans choix ressemble à un filtre déjà appliqué : on croit
        // que tout est décoché, alors qu'on n'a rien à cocher. Le dire évite de
        // chercher pourquoi la carte ne réagit pas.
        if (!vals.length && !sansValeur.offert) {
            return `<div class="range-info" style="margin-top:6px;opacity:.75">`
                 + `Aucune valeur connue pour « ${escapeHtml(c.field)} »`
                 + (layer._distant ? ` — la couche est distante et le manifeste n’en déclare pas.` : `.`)
                 + `</div>`;
        }
        const booleen = vals.length > 0 && vals.every((v) => v.value === 'true' || v.value === 'false');
        const libelle = (v) => (booleen ? (v === 'true' ? 'Oui' : 'Non') : v);
        const inputType = c.variant === 'select_single' ? 'radio' : 'checkbox';
        const nameAttr = `ctl-${layer.id}-${c.field}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        const ligne = (value, texte, count, classe = '') => `<label class="cat-row${classe}" style="cursor:pointer"><input type="${inputType}" name="${nameAttr}" ${isSelectValueChecked(c, value) ? 'checked' : ''} onchange="A.toggleControlValue('${lid}','${fid}','${chaineJs(value)}')"><span class="cat-value" title="${escapeHtml(texte)}">${escapeHtml(texte)}</span><span class="cat-count">${count == null ? '' : count}</span></label>`;
        const lignes = vals.map((v) => ligne(v.value, libelle(v.value), v.count)).join('')
            + (sansValeur.offert ? ligne('', '(sans valeur)', sansValeur.count, ' cat-row-vide') : '');
        // Dans le dock, « Tout / Aucun » est dans l'en-tête (`htmlOutilsSelect`) : une rangée de moins au-dessus de la liste.
        const outils = dock || c.variant === 'select_single' ? '' : `<div class="ctl-outils">
            <button type="button" class="ctl-mini" onclick="A.toutesValeursControle('${lid}','${fid}',true)">Tout</button>
            <button type="button" class="ctl-mini" onclick="A.toutesValeursControle('${lid}','${fid}',false)">Aucun</button>
        </div>`;
        const total = nombreValeursDistinctes(layer, c.field);
        const reste = total > vals.length
            ? `<div class="range-info" style="margin-top:6px;opacity:.8">+${total - vals.length} valeur${total - vals.length > 1 ? 's' : ''} non listée${total - vals.length > 1 ? 's' : ''} — le type « Contient » cherche parmi toutes.</div>`
            : '';
        return `${outils}<div class="cats" style="margin-top:6px">${lignes}</div>${reste}`;
    }

    if (c.type === 'text') {
        return `<input class="input" type="search" style="margin-top:6px" placeholder="Contient…"
            value="${escapeHtml(c.texte || '')}" aria-label="Rechercher dans ${nomLisible}"
            oninput="A.setControlTexte('${lid}','${fid}', this.value)">`;
    }

    const cle = escapeHtml(`${layer.id}|${c.field}`);
    const notes = [];
    if (c._bornesInconnues) notes.push('Bornes inconnues : la couche est distante et le manifeste n’en déclare pas.');
    if (layer._distant && !filtrableSurLaCarte(c)) notes.push('Sur cette couche distante, des dates écrites en texte ne se filtrent pas.');
    const note = notes.length ? `<div class="range-info" style="margin-top:6px;opacity:.8">${notes.join(' ')}</div>` : '';
    // Le pas suit l'étendue des données (minute pour quelques heures) : un pas
    // d'au moins un jour figeait le curseur d'essais-crisi au minimum.
    const step = pasDuCurseur(c);
    const valeur = (part) => `<strong data-ctl="${cle}" data-part="${part}">${fmtControlValue(c, part === 'min' ? c.min : c.max)}</strong>`;
    const curseur = (part, acc) => `<input type="range" class="rng${acc ? ' acc' : ''}" data-ctl="${cle}" data-input="${part}"
        min="${c.dataMin}" max="${c.dataMax}" step="${step}" value="${part === 'min' ? c.min : c.max}"
        aria-label="${part === 'min' ? 'Minimum' : 'Maximum'} — ${nomLisible}"
        oninput="A.setControlBound('${lid}','${fid}','${part}', this.value)">`;
    const animer = c.type === 'time'
        ? `<button class="btn btn-soft btn-full" style="margin-top:6px" onclick="A.playTime('${lid}','${fid}')">▶ Animer dans le temps</button>`
        : '';
    if (c.variant === 'time_between' || c.variant === 'range_between') {
        return `<div class="range-info" style="margin-top:6px">${valeur('min')} → ${valeur('max')}</div>${curseur('min')}${curseur('max', true)}${animer}${note}`;
    }
    if (c.variant === 'range_min') {
        return `<div class="range-info" style="margin-top:6px">≥ ${valeur('min')}</div>${curseur('min')}${note}`;
    }
    return `<div class="range-info" style="margin-top:6px">≤ ${valeur('max')}</div>${curseur('max', true)}${animer}${note}`;
}

/**
 * Les champs d'une couche qu'un contrôle peut viser.
 *
 * Les entités ne portent pas une colonne vide sur tous les objets, et le
 * manifeste peut dater d'avant son ajout : `visite` (Date, jamais renseignée)
 * n'apparaissait nulle part, pas même comme « sans valeur ». Le schéma du
 * document fait foi pour une table ; on en retire ce qui n'est pas un attribut.
 */
function champsControlables(layer) {
    const noms = layerFieldNames(layer);
    const techniques = new Set([
        'geometry_json', 'centroid_lat', 'centroid_lon', 'latitude', 'longitude', 'atlas_3d_json',
        ...COLONNES_INTERNES_GRIST, ...COLONNES_ATLAS,
        ...Object.values(layer?._manifestLayer?.source?.geometry_fields || {}),
    ]);
    for (const col of (STATE.schema?.[layer?.sourceTable] || [])) {
        const id = col?.colId;
        if (!id || id.startsWith('_') || id.startsWith('gristHelper_') || techniques.has(id) || noms.includes(id)) continue;
        if (/^(Attachments|Any|Blob|PositionNumber|ManualSortPos)$/.test(String(col.type || ''))) continue;
        noms.push(id);
    }
    return noms;
}

/**
 * Le type de colonne que Grist déclare pour ce champ, s'il le déclare.
 * Schéma du document d'abord, champs du manifeste ensuite.
 */
function typeGristDuChamp(layer, field) {
    const col = (STATE.schema?.[layer?.sourceTable] || []).find((c) => c.colId === field);
    if (col?.type) return col.type;
    const f = (layer?._fields || []).find((x) => x?.name === field);
    return f?.type || f?.gType || null;
}

/** Le contrôle d'un champ, créé s'il n'existe pas encore — inactif. */
function controleDuChamp(layer, field, type) {
    layer.controls = layer.controls || [];
    let c = layer.controls.find((x) => x.field === field);
    if (c) return c;
    const profil = profilChamp(layer, field, typeGristDuChamp(layer, field));
    c = { field, type, active: false, ...(profil.unite ? { unite: profil.unite } : {}) };
    Object.assign(c, controlBounds(layer, type, field, { unite: profil.unite }));
    c.variant = defaultControlVariant(type);
    if (type === 'range' || type === 'time') { c.min = c.dataMin; c.max = c.dataMax; }
    layer.controls.push(c);
    return c;
}

/** Change la forme d'un contrôle : ses bornes et sa sélection repartent à zéro. */
function convertirControle(layer, c, type) {
    for (const k of ['values', '_selectionTouched', 'texte', 'min', 'max', 'dataMin', 'dataMax', '_bornesInconnues', 'entier']) delete c[k];
    c.type = type;
    Object.assign(c, controlBounds(layer, type, c.field, { unite: c.unite }));
    if (type === 'range' || type === 'time') { c.min = c.dataMin; c.max = c.dataMax; }
}

/**
 * Enregistre les contrôles d'une couche, une fois le geste terminé.
 *
 * L'enregistrement ne partait que pour `source === 'qgis2grist'` — ni pour une
 * couche enregistrée en table depuis Atlas, ni pour une table liée, ni pour une
 * copie —, et jamais depuis les curseurs. Un réglage de filtre se perdait au
 * rechargement, sans message. `saveLayerToGrist` sait où ranger chaque couche.
 * En lecture, rien ne s'écrit : ce que le lecteur filtre lui appartient.
 */
function persisterControles(layer) {
    if (CONFIG.viewMode || !CONFIG.grist.ready || !layer) return;
    clearTimeout(layer._persistCtlT);
    layer._persistCtlT = setTimeout(() => { saveLayerToGrist(layer, true); }, 700);
}

/** Met à jour les valeurs affichées d'un contrôle, dans le module comme dans le dock. */
function majAffichageControle(layer, c) {
    const cle = `${layer.id}|${c.field}`;
    const sel = `[data-ctl="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(cle) : cle}"]`;
    document.querySelectorAll(sel).forEach((el) => {
        if (el.dataset.part) {
            el.textContent = fmtControlValue(c, el.dataset.part === 'min' ? c.min : c.max);
        } else if (el.dataset.input && el !== document.activeElement) {
            el.value = el.dataset.input === 'min' ? c.min : c.max;
        }
    });
}

/** Redessine ce qui montre un contrôle : le module et la pastille ouverte. */
function rafraichirVuesControle() {
    if (STATE.currentModule === 'controles' && !CONFIG.viewMode) renderControles();
    if (_openDockPill) renderDockSlotHost();
}

/** Le guide des types de contrôle, en une bulle (il occupait un bloc déroulant au-dessus des champs). */
const GUIDE_TYPES_CONTROLE = [
    'Date : « ≤ » cumule jusqu’à une date, « de/à » est une fenêtre stricte.',
    'Nombre : « Plage » est un intervalle min/max, « Max » et « Min » un seuil unique.',
    'Catégorie : « Checklist » garde plusieurs valeurs, « Choix unique » une seule.',
    'Texte : « Contient » cherche sans majuscules ni accents.',
].join('\n');

function renderControles() {
    if (CONFIG.viewMode) {
        showToast('Utilisez les contrôles sur la carte', 'info');
        closeModulePanel();
        return;
    }
    titreModule('Contrôles', 'Outils de mise en scène — activez les contrôles pour les publier en pastille sur la carte (visible en lecture). Puis capturez une étape de récit.');
    const body = $('module-body');
    const layer = STATE.layers.find((l) => l.id === STATE.selectedLayer) || STATE.layers[0];

    let html = '';

    html += `<div class="section"><div class="section-title">Environnement${infoBulle('Chaque interrupteur publie le contrôle en pastille sur la carte, visible en lecture. Pour les fonds de plan, deux ou trois au plus tiennent dans le dock de lecture.')}</div><div class="env-liste">${renderEnvControlsSection()}</div></div>`;

    if (!layer) {
        body.innerHTML = html + `<div class="empty" style="margin-top:12px"><div class="ic">${icTrait(IC.controles, 40)}</div><div class="t">Aucune couche</div><div class="h">Importez ou liez des données</div></div>`;
        return;
    }

    layer.controls = layer.controls || [];
    // Chaque champ reçoit le contrôle que son type appelle — type Grist d'abord
    // (`profilChamp`). Un champ sans valeur n'est pas écarté en silence : il
    // est nommé, pour qu'on ne cherche pas où il est passé.
    const fields = [];
    const vides = [];
    for (const field of champsControlables(layer)) {
        const profil = profilChamp(layer, field, typeGristDuChamp(layer, field));
        const existant = layer.controls.find((x) => x.field === field);
        if (existant?.type) fields.push({ field, type: existant.type, profil });
        else if (profil.type) fields.push({ field, type: profil.type, profil });
        else if (profil.vide && !layer._distant) vides.push(field);
    }
    // Contrôles déclarés sur des champs que les entités ne portent pas ici
    // (couche distante) : ils restent réglables.
    for (const c of layer.controls) {
        if (c?.type && !fields.some((x) => x.field === c.field)) {
            fields.push({ field: c.field, type: c.type, profil: { typesPossibles: [c.type] } });
        }
    }
    const noteVides = vides.length
        ? `<div class="range-info" style="margin-top:10px">${vides.length} champ${vides.length > 1 ? 's' : ''} sans valeur${infoBulle('Sans valeur, donc sans filtre possible : ' + vides.join(', ') + '.')}</div>`
        : '';

    html += `<div class="section"><div class="section-title">Données${infoBulle(GUIDE_TYPES_CONTROLE)}</div>`;
    html += STATE.layers.length > 1
        ? `<select class="input" style="margin-bottom:8px" onchange="A.controlLayer(this.value)">${STATE.layers.map((l) => `<option value="${l.id}" ${l.id === layer.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}</select>`
        : `<div class="hint" style="margin-bottom:8px">Couche <strong>${escapeHtml(layer.name)}</strong></div>`;

    if (!fields.length) {
        body.innerHTML = html + `<div class="hint">Aucun champ filtrable.</div>${noteVides}</div>`;
        return;
    }

    const activeFields = [];
    const availFields = [];
    for (const { field, type, profil } of fields) {
        const c = layer.controls.find((x) => x.field === field) || { field, type, active: false };
        if (c.active) activeFields.push({ field, type, c, profil });
        else availFields.push({ field, type, c, profil });
    }

    if (activeFields.length) {
        html += `<div class="section-title" style="margin-top:8px">Actifs</div>`;
        html += activeFields.map(({ field, type, c, profil }) => renderDataControlRow(layer, field, type, c, profil)).join('');
    }
    if (availFields.length) {
        html += `<div class="section-title" style="margin-top:${activeFields.length ? '12px' : '8px'}">Disponibles</div>`;
        html += availFields.map(({ field, type, c, profil }) => renderDataControlRow(layer, field, type, c, profil)).join('');
    }
    html += noteVides + '</div>';
    // Chaque réglage redessine le module : sans cela, on remontait en haut.
    const haut = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = haut;
}

/**
 * Le module « Formulaires » — choisir ce que le document sait saisir.
 *
 * ## Pourquoi le rail, et pas un onglet de couche
 *
 * Le partage suit la geometrie de l'interface : **le panneau de droite gere UN
 * formulaire, ce module gere L'ENSEMBLE.** Creer est un acte de document — ca
 * materialise une table — donc ca vit ici ; remplir est un acte d'objet, donc
 * ca vit a droite. L'inspecteur de couche n'a pas besoin d'onglet.
 *
 * Il rejoint la famille a laquelle il appartient : Controles et Recit sont les
 * deux choses qu'un auteur configure *pour le lecteur*. Un formulaire
 * disponible hors edition est de la meme nature.
 *
 * ## Ce qu'il ne fait pas
 *
 * **Il ne cree aucun formulaire.** Atlas n'en livre pas non plus. Un formulaire
 * derive n'existe nulle part : il se deduit des colonnes a chaque ouverture, et
 * rien n'est ecrit tant que personne ne l'ajuste. Definir appartient au
 * generateur, materialiser une table a `ensure-schema`.
 */
function renderFormulaires() {
    $('module-title').textContent = 'Formulaires';
    const body = $('module-body');

    if (!CONFIG.grist.ready) {
        body.innerHTML = `<div class="empty"><div class="ic">${icTrait(IC.formulaire, 40)}</div>
            <div class="t">Hors Grist</div>
            <div class="h">Les formulaires vivent dans le document.</div></div>`;
        return;
    }

    const couches = STATE.layers.filter((l) => l.sourceTable);
    let html = `<p class="fm-intro">Ce que la fiche d’un objet propose, couche par couche. Un formulaire activé s’ouvre aussi hors édition, en onglet sur l’objet.</p>`;

    if (!couches.length) {
        body.innerHTML = html + `<div class="empty" style="margin-top:12px"><div class="ic">${icTrait(IC.formulaire, 40)}</div>
            <div class="t">Aucune table à saisir</div>
            <div class="h">Une couche liée à une table Grist, et sa ligne apparaîtra ici.</div></div>`;
        return;
    }

    html += couches.map((couche) => blocCoucheFormulaires(couche)).join('');
    // Chaque réglage redessine le module : sans cela, basculer un champ en bas
    // de la liste renvoyait en haut du panneau.
    const haut = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = haut;
}

/**
 * Une couche, et les formulaires qui la concernent, groupes par **verbe**.
 *
 * | | |
 * |---|---|
 * | **corriger l'objet** | la table de la couche — `updateRow` |
 * | **ajouter une ligne** | une table qui la reference — `addRow` |
 *
 * Une carte par couche : l'en-tete la nomme avec sa table, les deux groupes
 * suivent, et un pied dit **ce que les bascules produisent** hors edition —
 * sans lui, on coche sans voir le resultat, et au-dela de trois onglets la
 * barre defile sans que rien ne l'ait annonce.
 *
 * > La phrase qui expliquait un groupe vide (« Aucune table ne reference
 * > celle-ci… ») etait repetee sous chaque couche et noyait les formulaires :
 * > elle tient maintenant en trois mots, le detail dans l'infobulle.
 */
function blocCoucheFormulaires(couche) {
    const esc = (s) => String(s).replace(/'/g, "\\'");
    const tous = formulairesDeLaCouche(couche, { avecRetires: true });
    const formulaires = formulairesEnPlace(tous);
    const retires = tous.filter((f) => f.retire);
    const nb = (couche.geojson?.features?.length) || 0;
    const entete = `<div class="fm-entete">
            <span class="fm-couche" title="${escapeHtml(couche.name)}">${escapeHtml(couche.name)}</span>
            <span class="fm-table">${escapeHtml(couche.sourceTable)}${nb ? ` · ${nb} obj.` : ''}</span>
        </div>`;

    if (!tous.length) {
        return `<section class="fm-carte">${entete}
            <p class="fm-vide">Aucune colonne saisissable.</p>
        </section>`;
    }

    const groupe = (titre, liste, vide) => {
        if (!liste.length && !vide) return '';
        const contenu = liste.length
            ? liste.map((f) => ligneFormulaire(couche, f, esc, tous)).join('')
            : `<p class="fm-vide" title="${escapeHtml(vide.detail)}">${vide.texte}</p>`;
        return `<div class="fm-groupe"><div class="fm-groupe-titre">${titre}</div>${contenu}</div>`;
    };

    const surLaCouche = formulaires.filter((f) => f.surLaCouche);
    const liees = formulaires.filter((f) => !f.surLaCouche);
    // Ce qui sera vraiment proposé, pas ce qui est coché : un dérivé peut
    // figurer dans la liste enregistrée — d'une version antérieure, ou d'un
    // clic d'avant qu'il perde sa bascule — sans pouvoir être offert.
    const exposes = offertsEnLecture(formulaires).length;

    return `<section class="fm-carte">${entete}
        ${groupe('Corriger l’objet', surLaCouche)}
        ${groupe('Ajouter une ligne', liees, {
            texte: 'Aucune table liée.',
            detail: `Une table avec une colonne Ref: vers ${couche.sourceTable} apparaîtrait ici.`,
        })}
        ${retires.length ? `<div class="fm-groupe fm-retires"><div class="fm-groupe-titre">Retirés de la couche</div>${retires.map((f) => ligneRetiree(couche, f, esc)).join('')}</div>` : ''}
        <div class="fm-pied${exposes ? ' on' : ''}">${exposes
            ? `Hors édition : <strong>${exposes}</strong> onglet${exposes > 1 ? 's' : ''} sur l’objet${exposes > 3 ? ' — la barre défilera' : ''}`
            : 'Hors édition : rien de proposé, la fiche reste en consultation'}</div>
    </section>`;
}

/**
 * Une ligne de la liste : ce qu'est le formulaire, et s'il est proposé.
 *
 * Un formulaire **dérivé** n'a pas de bascule. Il n'existe pas en base, donc il
 * ne peut pas être proposé : offrir un interrupteur qui ne peut rien allumer
 * aurait été une promesse creuse. On dit ce qu'il faut faire à la place.
 */
function ligneFormulaire(couche, f, esc, tous = []) {
    // Un formulaire de Grist se règle dans Grist : on dit d'où il vient, et
    // qu'il suit ce qu'on y change.
    const origine = f.source === 'grist' ? 'formulaire Grist' : libelleStatut(f.statut);
    const detail = f.surLaCouche
        ? (f.derive ? `déduit des colonnes · ${nbChamps(f)} champ${nbChamps(f) > 1 ? 's' : ''}` : `${origine}${f.version ? ` · v${f.version}` : ''}`)
        : `→ ${f.tableId} · par <code>${f.via}</code>${f.derive ? ' · déduit' : ` · ${origine}`}`;

    const geste = gesteDEnregistrement(f, STATE.formulaires);
    const commande = geste
        ? `<button class="btn btn-soft fm-commande"
            onclick="A.enregistrerFormulaire('${chaineJs(couche.id)}','${chaineJs(f.id)}')"
            title="${geste.verbe === 'composer' ? 'Créer un formulaire à partir de ces colonnes' : 'L’enregistrer pour pouvoir le proposer'}">${geste.libelle}</button>`
        : `<div class="toggle ${f.expose ? 'on' : ''}" role="switch" tabindex="0"
            aria-checked="${f.expose}"
            aria-label="Proposer ${echapper(f.titre)} hors édition"
            title="Proposé hors édition"
            onclick="A.exposerFormulaire('${chaineJs(couche.id)}','${chaineJs(f.id)}')"></div>`;

    // Le dernier formulaire en place ne se retire pas : l'objet n'aurait plus
    // de fiche. La raison est dite des qu'il y a eu un choix — une couche qui
    // n'a jamais porte que `Attributs` garde sa ligne telle qu'avant.
    const garde = raisonNonRetirable(f, tous);
    const retirer = !garde
        ? `<button type="button" class="fm-lien" onclick="A.retirerFormulaire('${chaineJs(couche.id)}','${chaineJs(f.id)}', true)"
            title="Ne plus proposer ce formulaire sur cette couche — rien n’est effacé">Retirer</button>`
        : (tous.length > 1
            ? `<span title="Retirer est impossible : l’objet n’aurait plus de fiche">${escapeHtml(garde)}</span>`
            : '');

    return `<div class="fm-ligne">
        <div class="fm-ligne-tete">
            <span class="fm-nom">${echapper(libelleFormulaire(f))}</span>
            ${commande}
        </div>
        <div class="fm-detail">${detail}${retirer ? ` · ${retirer}` : ''}</div>
        ${cadreDesChamps(couche, f, esc)}
    </div>`;
}

/** Un formulaire retiré : son nom, et le geste qui le remet. */
function ligneRetiree(couche, f, esc) {
    const cible = f.surLaCouche ? 'corriger l’objet' : `ajouter à ${escapeHtml(f.tableId)}`;
    return `<div class="fm-ligne fm-ligne-retiree">
        <div class="fm-ligne-tete">
            <span class="fm-nom">${echapper(libelleFormulaire(f))}</span>
            <button type="button" class="btn btn-soft fm-commande"
                onclick="A.retirerFormulaire('${chaineJs(couche.id)}','${chaineJs(f.id)}', false)"
                title="Le proposer à nouveau sur cette couche, tel qu’il était">Remettre</button>
        </div>
        <div class="fm-detail">${cible}</div>
    </div>`;
}

/**
 * Les listes de champs ouvertes, par couche et formulaire.
 *
 * Chaque bascule redessine le module, et un `<details>` redessiné repart
 * fermé : la liste se refermait à chaque champ coché ou décoché, et après
 * « Composer ». L'état vit donc ici, pas dans le DOM.
 */
const _champsOuverts = new Set();

/** « Moi » a un sens pour un champ qui désigne des personnes, quand on sait qui est connecté (l'application). */
function moiPossible(champ) {
    if (!CONFIG.grist.user?.email) return false;
    const m = /^Ref(?:List)?:(.+)$/.exec(String(champ?.type || ''));
    return !!(m && tableDePersonnes(STATE.schema, m[1]));
}

/**
 * Le cadrage : quels champs de ce formulaire cette scene montre.
 *
 * Il vit dans le panneau de GAUCHE, replie par defaut, et pas sur le formulaire
 * rendu a droite. Le panneau de gauche regle, celui de droite sert.
 */
function cadreDesChamps(couche, f, esc) {
    const champs = champsDuFormulaire(f.def, f.masques);
    // Un champ unique ne se cadre pas : le retirer viderait le formulaire, et
    // la case n'aurait qu'un seul effet possible.
    if (champs.length < 2) return '';
    const montres = champs.filter((c) => !c.masque).length;
    const cle = `${couche.id}|${f.id}`;
    // Un formulaire qui AJOUTE une ligne choisit d'où part chaque champ : la
    // date du jour, la dernière saisie sur l'appareil, la dernière ligne de
    // l'objet. Celui qui corrige l'objet part de la ligne elle-même.
    const typeDe = new Map((f.def?.sections || []).flatMap((sec) => sec.fields || []).map((x) => [x.colId, x]));
    const departs = f.surLaCouche ? null : (f.departs || {});
    const choixDepart = (c) => {
        if (!departs || c.masque) return '';
        const possibles = departsPossibles(typeDe.get(c.colId), { lie: true, moi: moiPossible(typeDe.get(c.colId)) });
        if (possibles.length < 2) return '';
        const actuel = departs[c.colId] || 'vide';
        return `<select class="fm-depart${actuel !== 'vide' ? ' on' : ''}" aria-label="Valeur de départ de ${echapper(c.label)}"
            title="Valeur de départ, à l’ouverture du formulaire"
            onchange="A.reglerDepart('${chaineJs(couche.id)}','${chaineJs(f.id)}','${chaineJs(c.colId)}', this.value)">
            ${possibles.map((d) => `<option value="${d}"${d === actuel ? ' selected' : ''}>${LIBELLES_DEPART[d]}</option>`).join('')}
        </select>`;
    };
    const nbPreremplis = departs ? champs.filter((c) => !c.masque && departs[c.colId] && departs[c.colId] !== 'vide').length : 0;
    const lignes = champs.map((c) => {
        const badges = [
            c.requis ? '<span class="fm-requis">obligatoire</span>' : '',
            c.verrouille ? '<span title="Un autre champ en dépend — condition ou liste liée">verrouillé</span>' : '',
        ].filter(Boolean).join(' · ');
        const bascule = c.verrouille
            ? `<div class="toggle on" role="switch" aria-checked="true" aria-disabled="true"
                title="Un autre champ en dépend — condition ou liste liée"
                style="opacity:.45;cursor:not-allowed"></div>`
            : `<div class="toggle ${c.masque ? '' : 'on'}" role="switch" tabindex="0"
                aria-checked="${!c.masque}"
                aria-label="Montrer ${echapper(c.label)} dans cette scène"
                title="${c.masque ? 'Masqué dans cette scène' : 'Montré dans cette scène'}"
                onclick="A.masquerChamp('${chaineJs(couche.id)}','${chaineJs(f.id)}','${chaineJs(c.colId)}')"></div>`;
        return `<div class="fm-champ${c.masque ? ' masque' : ''}">
            <span class="fm-champ-nom">${echapper(c.label)}${badges ? ` <span class="fm-badges">· ${badges}</span>` : ''}</span>
            ${choixDepart(c)}
            ${bascule}
        </div>`;
    }).join('');

    return `<details class="fm-champs"${_champsOuverts.has(cle) ? ' open' : ''}
            ontoggle="A.suivreChamps('${chaineJs(cle)}', this.open)">
        <summary>Champs montrés · ${montres} sur ${champs.length}${nbPreremplis ? ` · ${nbPreremplis} prérempli${nbPreremplis > 1 ? 's' : ''}` : ''}</summary>
        <div class="fm-champs-liste">${lignes}</div>
    </details>`;
}

/** Combien de champs un formulaire porte — ce que « dérivé » recouvre. */
function nbChamps(f) {
    return (f.def?.sections || []).reduce((n, s) => n + (s.fields?.length || 0), 0);
}

function libelleStatut(statut) {
    if (statut === 'terrain') return 'terrain';
    if (statut === 'publie') return 'publié';
    return 'brouillon';
}

/** Les couches de points dont on peut tirer des étapes le long du trajet. */
function couchesDePointsPourEtapes() {
    return STATE.layers.filter((l) => l.visible !== false && !l._distant && !l._raster
        && (l.geometryType === 'Point') && (l.geojson?.features || []).length);
}

/** Une étape par objet qui borde le trajet : la tournée se compose depuis les objets, sans les capturer un à un. */
function etapesLeLongHtml() {
    const couches = couchesDePointsPourEtapes();
    if (!couches.length) return '';
    const options = couches.map((l) => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)} (${l.geojson.features.length})</option>`).join('');
    return `<div class="section"><div class="section-title">Étapes depuis les objets${infoBulle('Une étape par objet situé près de la ligne, dans l’ordre du parcours : la tournée se compose d’un geste.')}</div>
        <select id="etapes-couche" class="input">${options}</select>
        <div class="dual" style="margin-top:8px">
            <div><label class="input-label" for="etapes-rayon">À moins de (m)</label>
            <input id="etapes-rayon" class="input" type="number" min="5" max="1000" step="5" value="50"></div>
        </div>
        <button class="btn btn-soft btn-full" style="margin-top:8px" onclick="A.etapesLeLong()">Créer les étapes</button>
    </div>`;
}

/** « Tracer sur un réseau » : pour un export de tronçons (BD TOPO, routes OSM), on ne choisit pas les tronçons un à un. */
function boutonItineraireHtml() {
    const couches = couchesReseau();
    if (!couches.length) return '';
    const options = couches.map((l) => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)} (${l.geojson.features.length})</option>`).join('');
    return `<div class="section-title" style="margin-top:12px">Tracer sur un réseau${infoBulle('Pour des tronçons (routes, sentiers) : posez un départ, des points de passage et une arrivée, le chemin se trace sur le réseau.')}</div>
        <select id="itineraire-couche" class="input">${options}</select>
        <button class="btn btn-soft btn-full" style="margin-top:8px" onclick="A.itineraireDemarrer()">Poser les points sur la carte</button>`;
}

function itineraireEnCoursHtml() {
    const s = _itineraire;
    const n = s.points.length;
    const ok = s.calcul?.ok;
    const etat = n === 0 ? 'Touchez le départ sur la carte.'
        : n === 1 ? 'Touchez le point suivant (arrivée, ou point de passage).'
        : ok ? `${Math.round(s.calcul.longueurM)} m · ${n} points — touchez pour ajouter un point de passage ou une arrivée.`
            : 'Le chemin ne se trace pas : voir le message, ou retirez le dernier point.';
    return `<div class="section"><div class="hint">Tracé · ${escapeHtml(etat)}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-soft" style="flex:1" ${n ? '' : 'disabled'} onclick="A.itineraireRetirerDernier()">Retirer le dernier</button>
            <button class="btn btn-soft" style="flex:1" onclick="A.itineraireAnnuler()">Annuler</button>
        </div>
        <button class="btn btn-dark btn-full" style="margin-top:8px" ${ok ? '' : 'disabled'} onclick="A.itineraireTerminer()">Terminer — en faire ${_cibleTournee ? 'la tournée' : 'le trajet'}</button>
    </div>`;
}

function barreTrajetHtml() {
    if (CONFIG.viewMode) return '';
    const trace = traceActuelle();
    const lignes = lineairesDisponibles();
    if (!trace && !lignes.length) return '';
    if (trajetPickMode) {
        return `<div class="section"><button class="btn btn-soft btn-full" onclick="A.choisirTrajet()">Annuler le choix</button></div>`;
    }
    if (_itineraire) return itineraireEnCoursHtml();
    if (!trace) {
        return `<div class="section">
            <button class="btn btn-soft btn-full" onclick="A.choisirTrajet()">Créer un trajet${infoBulle('Pour une visite guidée : chaque étape se placera sur la ligne, au point le plus proche de sa vue. Retirer le trajet rétablit les vues. Pour une ligne de travail, voir la tournée d’un contexte.')}</button>${boutonItineraireHtml()}
        </div>`;
    }
    const metres = Math.round(longueurMetres(trace.coordinates));
    return `<div class="section">
        <div class="hint">Trajet · ${metres} m${trace.nom ? ' · ' + String(trace.nom).replace(/</g, '&lt;') : ''} — lecture le long de la ligne ; la vue cadrée reste pour le retrait.</div>
        <div style="display:flex;gap:8px">
            <button class="btn btn-soft" style="flex:1" onclick="A.remplacerTrajet()">Remplacer</button>
            <button class="btn btn-soft" style="flex:1" onclick="A.retirerTrajet()">Retirer</button>
        </div>
    </div>${etapesLeLongHtml()}`;
}

/** Les pastilles retenues à la capture de l'étape, dites sous son titre : « Pastilles : Fonds · État ». Rien si l'étape n'en retient pas. */
function metaPastilles(s) {
    const p = pastillesDe(s?.state);
    if (!p) return '';
    return `<div class="layer-meta">Pastilles : ${p.length ? p.map((x) => echapper(x.label)).join(' · ') : 'aucune'} <span style="opacity:.7">(à la capture)</span></div>`;
}

function metaEtapeTrajet(s) {
    const trace = traceActuelle();
    if (!trace || !Number.isFinite(s?.state?.abscisse)) return '';
    const m = Math.round(s.state.abscisse * longueurMetres(trace.coordinates));
    const rang = STATE.story
        .filter((e) => Number.isFinite(e.state?.abscisse))
        .sort((a, b) => a.state.abscisse - b.state.abscisse)
        .indexOf(s) + 1;
    const noms = (s.state.saisies || []).map((x) => x.titre).filter(Boolean).join(' · ');
    const ordre = rang > 0 ? `n°${rang} · ` : '';
    return `<div class="layer-meta">${ordre}sur le trajet · ${m} m${noms ? ' · ' + noms.replace(/</g, '&lt;') : ''}</div>`;
}

/** Le réglage « Ouverture » du module Récit : par où la scène s'ouvre pour qui ne l'édite pas. */
function htmlOuverture(steps) {
    const o = normaliserExposition(STATE.exposition).ouverture;
    const contextes = contextesProposes(steps);
    const choix = [
        { mode: 'carte', cle: '', libelle: 'La carte' },
        { mode: 'recit', cle: '', libelle: 'Le récit, dès l’ouverture' },
        ...contextes.map((c) => ({ mode: 'contexte', cle: c.cle, libelle: 'Contexte : ' + c.titre })),
    ];
    const valeur = (c) => c.mode + '|' + c.cle;
    const courante = o.mode === 'contexte' && !contextes.some((c) => c.cle === o.cle) ? 'carte|' : o.mode + '|' + (o.cle || '');
    return `<div class="section ouverture-reglage">
        <label class="lbl" for="ouverture-select">À l’ouverture, pour qui ne l’édite pas</label>
        <select id="ouverture-select" class="input" onchange="const [m, c] = this.value.split('|'); A.ouvertureRegler(m, c)">
            ${choix.map((c) => `<option value="${echapper(valeur(c))}"${valeur(c) === courante ? ' selected' : ''}>${echapper(c.libelle)}</option>`).join('')}
        </select>
    </div>`;
}

function renderRecit() {
    titreModule('Récit', 'Capture des étapes (caméra + couches + filtres + heure) et rejoue-les en présentation.');
    const body = $('module-body');
    const steps = STATE.story || [];
    rafraichirTrajet();
    if (CONFIG.viewMode) {
        if (!steps.length) {
            body.innerHTML = `<div class="empty"><div class="ic">${icTrait(IC.recit, 40)}</div><div class="t">Pas de récit</div><div class="h">L’éditeur n’a pas publié d’étapes</div></div>`;
            return;
        }
        body.innerHTML = `
            <div class="hint">Parcours publié — lecture seule.</div>
            ${barreTrajetHtml()}
            <div class="section"><button class="btn btn-dark btn-full" onclick="A.storyPlay(0)">▶ Lancer le récit</button></div>
            <div class="layer-list">${steps.map((s, i) => `
                <div class="layer-item" onclick="A.storyPlay(${i})" style="cursor:pointer">
                    <span class="layer-vis on">▶</span>
                    <div class="layer-info">
                        <div class="layer-name">${echapper(s.title || ('Étape ' + (i + 1)))}</div>
                        ${metaEtapeTrajet(s)}
                        <div class="layer-meta">${(s.text || '').slice(0, 80).replace(/</g, '&lt;')}${ (s.text || '').length > 80 ? '…' : ''}</div>
                    </div>
                </div>`).join('')}</div>`;
        return;
    }
    let html = `<div class="section" style="display:flex;gap:8px">
            <button class="btn btn-primary" style="flex:2" onclick="A.storyCapture()">${icTrait(IC.camera)} Capturer l'étape</button>
            ${steps.length ? `<button class="btn btn-dark" style="flex:1" onclick="A.storyPlay(0)">▶ Lecture</button>` : ''}
        </div>
        ${barreTrajetHtml()}`;
    if (steps.length) html += htmlOuverture(steps);
    if (!steps.length) {
        body.innerHTML = html + `<div class="empty"><div class="ic">${icTrait(IC.recit, 40)}</div><div class="t">Aucune étape</div><div class="h">Cadre la vue puis « Capturer »</div></div>`;
        return;
    }
    html += `<div class="layer-list">${steps.map((s, i) => `
        <div class="layer-item">
            <span class="layer-vis on" onclick="A.storyPlay(${i})" title="Aller à l'étape">▶</span>
            <div class="layer-info" style="flex:1">
                ${metaEtapeTrajet(s)}
                ${metaPastilles(s)}
                <input class="input" style="font-weight:600;padding:4px 6px" value="${echapper(s.title || '')}" onchange="A.storySet(${i},'title',this.value)" placeholder="Titre étape ${i + 1}">
                <textarea class="input" style="margin-top:4px;min-height:38px;font-size:12px" onchange="A.storySet(${i},'text',this.value)" placeholder="Texte…">${echapper(s.text || '')}</textarea>
                <label class="contexte-opt" title="En exploitation, la pastille Contexte propose cette étape : elle règle la carte, et son texte sert de consigne"><input type="checkbox" ${usageDe(s.state).contexte ? 'checked' : ''} onchange="A.storyContexte(${i},this.checked)"> Proposer comme contexte</label>
                ${htmlRelevesContexte(i, s)}
                ${htmlTourneeContexte(i, s)}
            </div>
            <div style="display:flex;flex-direction:column;gap:2px">
                <button class="layer-act" onclick="A.storyMove(${i},-1)" title="Monter">▲</button>
                <button class="layer-act" onclick="A.storyRecapture(${i})" title="Re-capturer la vue">${icTrait(IC.camera)}</button>
                <button class="layer-act" onclick="A.storyMove(${i},1)" title="Descendre">▼</button>
            </div>
            <button class="layer-del" onclick="A.storyDelete(${i})" title="Supprimer">${icTrait(IC.corbeille)}</button>
        </div>`).join('')}</div>`;
    body.innerHTML = html;
}

/**
 * Les relevés qu'un contexte propose : une case par couche où un relevé est possible. Rien n'est écrit tant que tout est coché —
 * le contexte ne dit rien, et une couche ajoutée plus tard sera proposée. Hors contexte, rien à régler.
 */
function htmlRelevesContexte(i, s) {
    if (!usageDe(s.state).contexte) return '';
    const couches = couchesQuiOffrentUnReleve();
    if (!couches.length) return '';
    const propose = relevesDe(s.state);
    const cases = couches.map((l) => `<label class="contexte-opt contexte-releve"><input type="checkbox" ${releveProposeDans(propose, cleReleve(l)) ? 'checked' : ''} onchange="A.storyReleve(${i},'${chaineJs(cleReleve(l))}',this.checked)"> ${echapper(l.name || l.sourceTable || l.id)}</label>`).join('');
    return `<div class="contexte-releves">
        <div class="contexte-releves-titre">Relevés proposés${infoBulle('Ce que la pastille « Relevé » liste quand ce contexte est actif. Tout coché : toutes les couches visibles, comme sans réglage. Une couche décochée n\u2019y est plus listée ; le relevé d\u2019un objet touché sur la carte, lui, reste ouvert.')}</div>
        ${cases}
    </div>`;
}

/**
 * La tournée d'un contexte : sa ligne de travail. Posée comme un trajet — une ligne choisie sur la carte, ou tracée sur un réseau —
 * mais elle reste à son contexte et ne place aucune étape. Hors contexte, rien à régler.
 */
function htmlTourneeContexte(i, s) {
    if (!usageDe(s.state).contexte) return '';
    const trace = tourneeDe(s.state);
    const enCours = !!_cibleTournee && _cibleTournee === s.cle;
    const titre = `<div class="contexte-releves-titre">Tournée${infoBulle('La ligne de travail de ce contexte : elle s’affiche quand il est actif, et donne leur ordre aux ouvrages qu’il montre. Le trajet du récit, lui, sert une visite guidée.')}</div>`;
    let corps;
    if (enCours) {
        corps = trajetPickMode
            ? `<div class="hint">Touchez une ligne sur la carte.</div><div class="contexte-tournee-actions"><button class="btn btn-soft btn-sm" onclick="A.choisirTrajet()">Annuler le choix</button></div>`
            : '<div class="hint">Tracé en cours — suivez les indications en haut du module.</div>';
    } else if (trace) {
        corps = `<div class="hint">${direLongueur(longueurMetres(trace.coordinates))}${trace.nom ? ' · ' + echapper(trace.nom) : ''}</div>
            <div class="contexte-tournee-actions">
                <button class="btn btn-soft btn-sm" onclick="A.tourneeVoir(${i})">Voir</button>
                <button class="btn btn-soft btn-sm" onclick="A.tourneeChoisir(${i})">Remplacer</button>
                <button class="btn btn-soft btn-sm" onclick="A.tourneeRetirer(${i})">Retirer</button>
            </div>`;
    } else {
        const reseaux = couchesReseau();
        const options = reseaux.map((l) => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`).join('');
        corps = lineairesDisponibles().length
            ? `<div class="contexte-tournee-actions"><button class="btn btn-soft btn-sm" onclick="A.tourneeChoisir(${i})">Choisir une ligne</button></div>`
            : '<div class="hint">Aucune ligne visible à choisir.</div>';
        if (reseaux.length) {
            corps += `<div class="contexte-tournee-actions"><select id="tournee-couche-${i}" class="input" aria-label="Réseau de lignes">${options}</select>
                <button class="btn btn-soft btn-sm" onclick="A.itineraireDemarrer('tournee-couche-${i}', '${chaineJs(s.cle)}')">Tracer sur un réseau</button></div>`;
        }
    }
    return `<div class="contexte-releves contexte-tournee-edition">${titre}${corps}</div>`;
}

/**
 * Le moment d'une étape, tel qu'il s'affiche sous son titre.
 *
 * **L'étape peut le nommer elle-même** (`ambiance`), et c'est alors ce nom qui
 * s'affiche. Aucun découpage horaire ne peut être juste partout : 7 h est l'aube
 * en décembre et le plein jour en juin, et la latitude déplace encore les
 * bornes. Surtout, l'auteur d'un récit veut souvent dire autre chose que l'heure
 * — « avant l'ouverture », « à la sortie des classes ».
 *
 * Le découpage ci-dessous n'est qu'un **repli**, pour les étapes qui ne disent
 * rien. Il reste approximatif, et il est écrit pour ne jamais être grossièrement
 * faux : le tour de minuit appartient à la nuit, pas à l'aube.
 */
function storyAmbianceLabel(state) {
    const min = Number(state?.timeOfDay);
    const bits = [];
    const dit = typeof state?.ambiance === 'string' ? state.ambiance.trim() : '';
    if (Number.isFinite(min)) {
        const h = Math.floor(min / 60), m = min % 60;
        const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        let phase;
        if (dit) phase = dit;
        else if (min < 300) phase = 'Nuit';          // 00:00–04:59
        else if (min < 480) phase = 'Aube';          // 05:00–07:59
        else if (min < 660) phase = 'Matin';
        else if (min < 960) phase = 'Midi';
        else if (min < 1140) phase = 'Après-midi';
        else if (min < 1260) phase = 'Crépuscule';
        else phase = 'Nuit';                          // 21:00–23:59
        bits.push(phase, clock);
    } else if (dit) {
        // Une étape peut nommer son moment sans fixer d'heure — « avant
        // l'ouverture » n'a pas d'horloge. Ce qu'elle dit doit s'afficher quand
        // même, sinon déclarer une ambiance n'aurait d'effet que par accident.
        bits.push(dit);
    }
    if (state?.basemap && BASEMAPS[state.basemap]) bits.push(BASEMAPS[state.basemap].label);
    if (state?.shadows === false) bits.push('sans ombres');
    else if (state?.shadows === true) bits.push('ombres');
    if (state?.labels === true) bits.push('toponymes');
    return bits.join(' · ');
}

function renderStoryPresentation() {
    const ov = document.getElementById('story-present');
    if (!ov) return;
    const s = STATE.story[_storyIdx];
    const n = STATE.story.length;
    if (!s) return;
    const ambiance = storyAmbianceLabel(s.state);
    const trace = traceActuelle();
    const points = trace ? STATE.story.map((_, i) =>
        `<button type="button" onclick="A.storyGo(${i})" aria-label="Étape ${i + 1}" style="width:8px;height:8px;border-radius:50%;border:0;padding:0;background:${i === _storyIdx ? '#C44536' : '#d9d3cb'}"></button>`).join('') : '';
    const formulaires = (s.state?.saisies || []).map((x) => x.titre).filter(Boolean);
    const suiviBtn = trace && localisationDisponible()
        ? (_trajetSuivi && !_trajetPause
            ? `<div style="margin-top:8px;font-size:12px;color:#6b6256">Suivi en cours</div>`
            : `<div style="margin-top:8px">${_trajetPause
                ? '<button class="btn btn-dark" onclick="A.revenirTrajet()">Revenir à ma position</button>'
                : '<button class="btn btn-dark" onclick="A.suivreTrajet()">Suivre</button>'}</div>`)
        : '';
    ov.innerHTML = `<div style="display:flex;align-items:center;gap:10px">
        <button class="btn btn-soft" onclick="A.storyStep(-1)" ${_storyIdx === 0 ? 'disabled' : ''}>◀</button>
        <div style="flex:1;text-align:center"><div style="font-weight:600;font-size:15px">${echapper(s.title || ('Étape ' + (_storyIdx + 1)))}</div><div style="font-size:10px;color:#6b6256;letter-spacing:.05em">${_storyIdx + 1} / ${n}${ambiance ? ' · ' + ambiance : ''}</div></div>
        <button class="btn btn-soft" onclick="A.storyStep(1)" ${_storyIdx === n - 1 ? 'disabled' : ''}>▶</button>
        <button class="btn btn-soft" onclick="A.storyExit()" title="Quitter">✕</button>
    </div>
    ${points ? `<div style="display:flex;gap:6px;justify-content:center;margin-top:8px">${points}</div>` : ''}
    ${s.text ? `<div style="margin-top:8px;font-size:13px;line-height:1.45">${assainirTexte(s.text)}</div>` : ''}
    ${formulaires.length ? `<div style="margin-top:6px;font-size:12px;color:#6b6256">${formulaires.map((t) => String(t).replace(/</g, '&lt;')).join(' · ')}</div>` : ''}
    ${suiviBtn}
    <div id="trajet-autour"></div>`;
    mesurerEtageRecit();
    remplirAutour();
}

/**
 * Hauteur que la bulle occupe en bas de la carte, en pixels.
 *
 * Une seule mesure sert deux fois : la légende, quand elle doit s'empiler
 * au-dessus de la bulle (`--etage-recit`), et la caméra, qui cadre l'étape dans
 * ce qui reste visible. L'ancienne règle supposait 196 px ; une étape au texte
 * long dépassait, une étape sans texte laissait un trou.
 */
function mesurerEtageRecit() {
    const frame = $('map-frame');
    const ov = document.getElementById('story-present');
    if (!frame) return 0;
    if (!ov) { frame.style.removeProperty('--etage-recit'); return 0; }
    const rc = frame.getBoundingClientRect();
    const rb = ov.getBoundingClientRect();
    const marge = margeBasseRecit({ basCarte: rc.bottom, hautBulle: rb.top, hauteurCarte: rc.height });
    frame.style.setProperty('--etage-recit', marge + 'px');
    return marge;
}

/**
 * Légende et bulle côte à côte, ou empilées : on mesure la carte, pas la
 * fenêtre — en édition, rail et panneaux mangent la largeur.
 */
function majEtageCarte() {
    const frame = $('map-frame');
    if (!frame) return;
    const cote = etageCoteACote({
        largeurCarte: frame.clientWidth,
        mobile: document.body.classList.contains('mobile-layout'),
    });
    document.body.classList.toggle('etage-cote-a-cote', cote);
    if (_storyPresenting) mesurerEtageRecit();
    majBandeauInfos();
}

/**
 * Le bandeau d'infos cède à la légende : il se mesure dans ses deux formes et
 * prend la plus complète qui tient à droite de la colonne de la légende.
 * Rappelé en fin de déplacement — son texte change avec le zoom.
 */
function majBandeauInfos() {
    const frame = $('map-frame');
    const hud = $('map-hud');
    if (!frame || !hud) return;
    hud.classList.remove('hud-compact', 'hud-masque');
    const largeurComplete = hud.offsetWidth;
    hud.classList.add('hud-compact');
    const largeurCompacte = hud.offsetWidth;
    hud.classList.remove('hud-compact');
    const forme = formeBandeauInfos({
        largeurCarte: frame.clientWidth,
        largeurComplete,
        largeurCompacte,
        mobile: document.body.classList.contains('mobile-layout'),
    });
    if (forme === 'compact') hud.classList.add('hud-compact');
    else if (forme === 'masque') hud.classList.add('hud-masque');
}

/**
 * L'étage du bas se pose sur l'attribution : sa hauteur change quand elle se
 * replie en « i », se déplie, ou passe sur deux lignes (fond et relief qui
 * ajoutent chacun leur source).
 */
function suivreBandeAttribution() {
    const frame = $('map-frame');
    const attrib = map?.getContainer()?.querySelector('.maplibregl-ctrl-attrib');
    if (!frame || !attrib || typeof ResizeObserver === 'undefined') return;
    new ResizeObserver(() => {
        const h = Math.ceil(attrib.getBoundingClientRect().height);
        if (h > 0) frame.style.setProperty('--bande-attrib', h + 'px');
        if (_storyPresenting) mesurerEtageRecit();
    }).observe(attrib);
}

/**
 * Rend la caméra à la carte entière en sortie de récit, sans à-coup : la marge
 * disparaît, mais ce qui était au centre de l'écran y reste.
 */
function libererMargeRecit() {
    if (!map || typeof map.getPadding !== 'function') return;
    const p = map.getPadding();
    if (!(p.top || p.bottom || p.left || p.right)) return;
    const c = map.getContainer();
    // La marge de la bulle part ; celle des feuilles, sur téléphone, reste. Le
    // centre est pris là où la nouvelle marge le placera : l'image ne bouge pas.
    const m = margesActuelles({ bulle: 0 });
    const centre = map.unproject([
        c.clientWidth / 2 + (m.left - m.right) / 2,
        c.clientHeight / 2 + (m.top - m.bottom) / 2,
    ]);
    map.jumpTo({ center: centre, padding: m });
}

// ---- Ouverture de la scène (lib/exposition.js) ----
// L'auteur dit par où la scène s'ouvre pour qui ne l'édite pas : la carte, son récit, ou
// l'un de ses contextes. Appliquée une fois, à l'ouverture ; ce que la scène ne peut plus
// tenir retombe sur la carte.
let _ouvertureAppliquee = false;
function appliquerOuverture() {
    if (_ouvertureAppliquee || CONFIG.sceneExterne) return;
    _ouvertureAppliquee = true;
    const o = ouvertureEffective({ exposition: STATE.exposition, story: STATE.story, posture: postureDepuis(CONFIG) });
    if (o.mode === 'carte') return;
    const lancer = () => {
        try {
            if (o.mode === 'recit') A.storyPlay(0);
            else appliquerContexte(o.cle);
        } catch (e) { console.warn('[Atlas] ouverture', e); }
    };
    // Le style doit être prêt : même attente que pour une scène par adresse.
    if (map && !mapStyleUsable()) map.once('idle', () => setTimeout(lancer, 150));
    else setTimeout(lancer, 150);
}

/** L'auteur règle par où la scène s'ouvre. */
function reglerOuverture(mode, cle = null) {
    if (!assertCanWrite('régler l’ouverture de la scène')) return;
    STATE.exposition = normaliserExposition({ ouverture: { mode, cle }, cadrage: STATE.exposition?.cadrage });
    markDirty();
    persistScenePrefsDifferee(200);
}

// ---- Contextes de travail (lib/contextes.js) ----
// Un contexte est une étape du récit jouée SANS la séquence : même restitution
// (`applyStoryState`), même instantané de la scène d'avant, mais aucune des
// commandes du lecteur de récit — l'agent reste dans son travail. `_storyPresenting`
// dit « l'état affiché est celui d'une étape » (donc rien ne s'écrit comme
// préférence) ; `_contexteCle` dit que c'est un contexte et non le lecteur.

/** Le lecteur de récit joue-t-il ? Faux pendant un contexte. */
function lecteurRecitActif() { return _storyPresenting && !_contexteCle; }

function contextesDisponibles() { return contextesProposes(STATE.story); }

/** Applique le contexte de cette clé ; la scène d'avant se rend par « Scène de base ». */
function appliquerContexte(cle) {
    if (lecteurRecitActif()) { showToast('Quittez la lecture du récit pour changer de contexte', 'warning'); return; }
    const ctx = contexteDeCle(STATE.story, cle);
    if (!ctx) { showToast('Ce contexte n’est plus proposé', 'warning'); refreshControlsDock(); return; }
    // Le contexte suivant ne refait pas l'instantané : il écraserait la scène
    // d'origine par l'état du contexte précédent (même règle que la lecture).
    if (!_preStorySnapshot) capturePreStorySnapshot();
    _contexteCle = ctx.cle;
    _storyIdx = ctx.index;
    applyStoryState(cloneStoryState(STATE.story[ctx.index].state));
    refreshControlsDock();
    rafraichirTrajet();
}

/** Rend la scène de base. */
function quitterContexte() {
    if (!_contexteCle) return;
    A.storyExit();
}

/** Le panneau de la pastille « Contexte » : les contextes proposés, et la consigne de celui qui est actif. */
/**
 * Les ouvrages que le contexte actif laisse voir, dans l'ordre de sa tournée ; `null` sans tournée. Seuls comptent les objets
 * ponctuels des couches visibles, filtres du contexte appliqués : la ligne donne l'ordre, pas un périmètre. `coucheId` restreint à
 * une couche (le pas de ◀ ▶ reste sur la couche de la sélection).
 */
function ordreTournee(coucheId = null) {
    const trace = tourneeActive();
    if (!trace) return null;
    const objets = [];
    for (const layer of STATE.layers) {
        if (coucheId && layer.id !== coucheId) continue;
        if (layer.visible === false || layer._distant || layer._raster) continue;
        if (layer.geometryType !== 'Point' && layer.geometryType !== 'MultiPoint') continue;
        const feats = layer.geojson?.features;
        // Au-delà, le tri à chaque pas pèserait : on ne propose pas d'ordre sur une couche aussi dense.
        if (!Array.isArray(feats) || feats.length > 5000) continue;
        const garde = buildControlPredicate(layer);
        feats.forEach((f, idx) => {
            if (garde && !garde(f)) return;
            const point = pointDuneFeature(f);
            if (!point) return;
            objets.push({ cle: `${layer.id}:${idx}`, coucheId: layer.id, idx, point, nom: nomObjet(f.properties || {}) || `Objet ${idx + 1}` });
        });
    }
    return ordonnerLeLong(trace.coordinates, objets);
}

/** Le bloc « Tournée » du panneau « Contexte » : sa longueur, et les ouvrages dans l'ordre de la ligne. */
function htmlTourneeContexteActif() {
    const trace = tourneeActive();
    if (!trace) return '';
    const ordre = ordreTournee() || [];
    const L = longueurMetres(trace.coordinates);
    const n = ordre.length;
    const resume = `Tournée · ${direLongueur(L)} · ${n ? `${n} ouvrage${n > 1 ? 's' : ''}` : 'aucun ouvrage'}`;
    const lignes = ordre.slice(0, 150).map((o, i) => `<button type="button" class="contexte-ouvrage" onclick="A.tourneeOuvrir('${chaineJs(o.coucheId)}',${o.idx})">
        <span class="n">${i + 1}</span><span class="nm">${echapper(o.nom)}</span><span class="d">${direLongueur(o.metres)}${o.ecartM > 250 ? ' · hors ligne' : ''}</span></button>`).join('');
    return `<details class="contexte-tournee"><summary>${echapper(resume)}${trace.nom ? ` <small>${echapper(trace.nom)}</small>` : ''}</summary>
        ${n ? `<div class="contexte-ouvrages">${lignes}</div>${n > 150 ? `<div class="hint">Les 150 premiers sur ${n}.</div>` : ''}`
            : '<div class="hint">Aucun ouvrage affiché par ce contexte : un filtre ou une couche masquée les écarte.</div>'}
    </details>`;
}

function renderContexteDockSlotHtml() {
    const liste = contextesDisponibles();
    const actif = _contexteCle;
    const courant = actif ? liste.find((c) => c.cle === actif) : null;
    const choix = (cle, titre, aide, on) => `<button type="button" class="contexte-choix${on ? ' on' : ''}" aria-pressed="${on}"
        onclick="${cle === null ? 'A.contexteQuitter()' : `A.contexteAppliquer('${chaineJs(cle)}')`}">
        <span class="contexte-nom">${echapper(titre)}</span>${aide ? `<span class="contexte-aide">${echapper(aide)}</span>` : ''}
    </button>`;
    return `<div class="dock-slot-data dock-slot-contexte">
        <div class="dock-slot-head"><span class="dock-slot-title">Contexte${infoBulle('Un contexte règle la carte — couches, filtres, heure — pour un travail précis ; sa consigne s’affiche dessous. « Scène de base » rend la scène telle que l’équipe l’a réglée.')}</span></div>
        <div class="dock-slot-body">
            ${courant ? `<div class="contexte-courant">
                ${courant.texte.trim() ? `<div class="contexte-consigne">${assainirTexte(courant.texte)}</div>` : ''}
                ${htmlTourneeContexteActif()}
            </div>` : ''}
            <div class="contexte-liste">
                ${choix(null, 'Scène de base', '', !actif)}
                ${liste.map((c) => choix(c.cle, c.titre, '', c.cle === actif)).join('')}
            </div>
        </div>
    </div>`;
}

function enterStoryPresentation(i) {
    if (!STATE.story.length) { showToast('Aucune étape à jouer', 'warning'); return; }
    // Relancer la lecture pendant une lecture ne refait pas l'instantané : il
    // écraserait la scène d'origine par l'état d'une étape, et « Quitter » ne
    // la rendrait plus (relevé à l'audit du 01/10/2026).
    if (!_preStorySnapshot) capturePreStorySnapshot();
    _storyPresenting = true;
    _contexteCle = null;
    document.body.classList.add('story-presenting');
    rafraichirTrajet();
    // Sur téléphone, la légende se pose sur la bulle : repliée, elle n'y prend
    // qu'une ligne ; le lecteur la rouvre d'un toucher.
    if (document.body.classList.contains('mobile-layout')) $('legend')?.classList.add('collapsed');
    refreshControlsDock();
    _storyIdx = Math.max(0, Math.min(i || 0, STATE.story.length - 1));
    let ov = document.getElementById('story-present');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'story-present';
        // Sa place dépend de l'étage du bas (voir `#story-present` dans la
        // feuille) : elle ne se décide plus ici en style inline.
        (document.getElementById('map-frame') || document.body).appendChild(ov);
    }
    renderStoryPresentation();
    applyStoryState(cloneStoryState(STATE.story[_storyIdx].state));
}

/** Le titre d'un module, avec une explication au survol quand le module en demande une. */
function titreModule(titre, aide) {
    const h = $('module-title');
    h.textContent = titre;
    if (aide) h.insertAdjacentHTML('beforeend', infoBulle(aide));
}

// ---- Modèles 3D ----
// Module Modèles = gestion du CATALOGUE pour l'app (jeu, source, galerie).
/** Les types du catalogue d'objets pointé, avec l'identifiant à écrire dans un champ ou un manifeste. */
function galerieObjetsRealistes() {
    const objs = modelesObjets();
    if (!objs.length) return '';
    return `<div class="section"><div class="section-title">Objets réalistes · ${objs.length}${infoBulle('L\'identifiant objet:… se saisit dans le modèle d\'une couche, dans une catégorie, ou dans _modelId d\'un objet.')}</div>
        ${objs.map((mm) => {
            const f = mm.fiche;
            const infos = [f.famille, f.variantes > 1 ? `${f.variantes} variantes` : null, `${f.fichiers} fichier${f.fichiers > 1 ? 's' : ''}`, f.interne ? 'usage interne' : 'public'].filter(Boolean).join(' · ');
            return `<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><span style="font-size:18px">${mm.icon}</span>
                <div style="min-width:0"><div style="font-size:12.5px;font-weight:600">${escapeHtml(mm.name)}</div>
                <div style="font-size:11px;color:var(--muted)">${escapeHtml(infos)} · <code>${escapeHtml(mm.id)}</code></div></div></div>`;
        }).join('')}</div>`;
}
function renderModelsPanel() {
    $('module-title').textContent = 'Catalogue 3D';
    const nModels = allModels().length;
    const layer = STATE.layers.find((l) => l.id === STATE.selectedLayer);
    const isPoint = layer && (layer.geometryType === 'Point' || layer.geometryType === 'MultiPoint');
    const banner = isPoint
        ? `<div class="hint" style="border-left-color:var(--accent)">Couche sélectionnée : <strong>${echapper(layer.name)}</strong>.<button class="btn btn-primary btn-full" style="margin-top:8px" onclick="A.openLayerModel('${layer.id}')">→ Choisir le modèle de cette couche</button></div>`
        : `<div class="hint">Réglages du catalogue, valables pour toute l'app. Pour <strong>affecter un modèle à une couche</strong> : sélectionne une couche de points (module Couches) → onglet <strong>Modèle 3D</strong> de l'inspecteur.</div>`;
    $('module-body').innerHTML = banner + `
        <div class="section">
            <div class="section-title">Jeu de modèles</div>
            <div class="seg">
                <button class="${MODEL_LIBRARY.set === 'colored' ? 'active' : ''}" onclick="A.setModelSet('colored')">🎨 Coloré</button>
                <button class="${MODEL_LIBRARY.set === 'mono' ? 'active' : ''}" onclick="A.setModelSet('mono')">⬜ Maquette</button>
            </div>
        </div>
        <div class="section">
            <div class="section-title">Source des modèles (GLB)${infoBulle('Doit contenir les dossiers colored et mono, et le catalogue (catalog, au format JSON). En local : sers la racine du repo et ouvre /projects/Atlas/index.html.')}</div>
            <div class="range-info" id="model-src-info" style="word-break:break-all">${MODEL_LIBRARY.baseUrl}</div>
            <input class="input" id="model-src-input" style="margin-top:6px;font-family:var(--mono);font-size:11px" value="${MODEL_LIBRARY.baseRoot}" placeholder="https://…/models/">
            <div style="display:flex;gap:6px;margin-top:6px">
                <button class="btn btn-soft" style="flex:1" onclick="A.testModelBase()">Tester</button>
                <button class="btn btn-primary" style="flex:1" onclick="A.setModelBase(document.getElementById('model-src-input').value)">Appliquer</button>
            </div>
        </div>
        <div class="section">
            <div class="section-title">Catalogue d'objets${infoBulle('Modèles générés d\'après les champs des objets (atlas-objets/0.1). Une couche de points s\'y soumet par l\'affectation « Catalogue » de son onglet Modèle 3D ; le catalogue ci-dessus reste le repli.')}</div>
            <div class="range-info" style="word-break:break-all">${
                CATALOGUE_OBJETS.etat === 'pret' ? `✅ ${CATALOGUE_OBJETS.origine === 'integre' ? 'Catalogue d’Atlas (intégré) — ' : ''}${CATALOGUE_OBJETS.cat.types.length} type(s), ${CATALOGUE_OBJETS.cat.assets.length} fichier(s)`
                : CATALOGUE_OBJETS.etat === 'erreur' ? `❌ ${escapeHtml(CATALOGUE_OBJETS.erreur)}`
                : CATALOGUE_OBJETS.etat === 'chargement' ? '… chargement'
                : 'Aucun'}</div>
            <input class="input" id="catalogue-objets-input" style="margin-top:6px;font-family:var(--mono);font-size:11px" value="${escapeHtml(CATALOGUE_OBJETS.origine === 'integre' ? '' : (CATALOGUE_OBJETS.url || ''))}" placeholder="Catalogue d’Atlas — ou https://…/catalog.json">
            <div style="display:flex;gap:6px;margin-top:6px">
                <button class="btn btn-soft" style="flex:1" onclick="A.setCatalogueObjets('')" title="Revenir au catalogue livré avec Atlas">Catalogue d’Atlas</button>
                <button class="btn btn-primary" style="flex:1" onclick="A.setCatalogueObjets(document.getElementById('catalogue-objets-input').value)">Pointer</button>
            </div>
        </div>
        ${galerieObjetsRealistes()}
        <div class="section">
            <div class="section-title">Catalogue · ${nModels} modèles</div>
            ${Object.entries(MODEL_LIBRARY.categories).map(([k, c]) => `
                <div style="margin:10px 0 4px;font-size:10.5px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">${c.icon} ${c.name} <span style="color:var(--muted-light)">· ${c.models.length}</span></div>
                <div class="model-grid">${c.models.map((m) => `<div class="model-card" title="${m.name}" style="cursor:default"><div class="mi">${m.icon}</div><div class="mn">${m.name}</div></div>`).join('')}</div>
            `).join('')}
        </div>`;
}

// ---- Soleil / Ambiance ----
function renderSoleil() {
    $('module-title').textContent = 'Soleil';
    const min = STATE.settings.timeOfDay;
    const d = STATE.settings.date;
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const { azimuth, altitude } = sunPosition();
    const cardinal = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(azimuth / 45) % 8];
    $('module-body').innerHTML = `
        <div class="section">
            <div class="section-title">Moment de la journée</div>
            <div class="option-cards grid2">
                <div class="option-card" onclick="A.timePreset('dawn')"><div class="oc-icon" style="color:#D98C3F">${icTrait('<path d="M3 18h18M6 18a6 6 0 0 1 12 0"/><path d="M12 5v2M5.6 8.6l1.4 1.4m11.4-1.4-1.4 1.4"/><path d="M2 21h20"/>', 26)}</div><div class="oc-label">Aube</div></div>
                <div class="option-card" onclick="A.timePreset('day')"><div class="oc-icon" style="color:#E0A526">${icTrait(IC.soleil, 26)}</div><div class="oc-label">Midi</div></div>
                <div class="option-card" onclick="A.timePreset('dusk')"><div class="oc-icon" style="color:#B4593A">${icTrait('<path d="M3 18h18M8 18a4 4 0 0 1 8 0"/><path d="M12 21v-1"/><path d="M2 14h4m12 0h4"/>', 26)}</div><div class="oc-label">Soir</div></div>
                <div class="option-card" onclick="A.timePreset('night')"><div class="oc-icon" style="color:#5B6B8C">${icTrait('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>', 26)}</div><div class="oc-label">Nuit</div></div>
            </div>
        </div>
        <div class="section">
            <div class="slider-head"><span class="lbl">Heure</span><span class="val">${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}</span></div>
            <input type="range" class="rng acc" min="0" max="1439" step="5" value="${min}" oninput="A.setTime(this.value)">
        </div>
        <div class="section">
            <div class="section-title">Date${infoBulle((STATE.settings.dateEpinglee ? 'La scène rouvrira sur ce jour.' : 'Non épinglée : la date n’est pas retenue d’une visite à l’autre.') + ' Heure du site, fuseau ' + fuseauScene(STATE.settings) + ' ; l’éclairage public suit le soleil à l’ancre de la scène (' + STATE.location.lat.toFixed(4) + '°N, ' + STATE.location.lng.toFixed(4) + '°E).')}</div>
            <input class="input" type="date" value="${dateStr}" onchange="A.setSunDate(this.value)">
            <div class="toggle-row" style="margin-top:8px"><span class="tlabel">Épingler cette date</span><div class="toggle ${STATE.settings.dateEpinglee ? 'on' : ''}" onclick="A.toggleDateEpinglee()" role="switch" tabindex="0" aria-checked="${!!STATE.settings.dateEpinglee}" aria-label="Épingler cette date"></div></div>
        </div>
        <div class="section">
            <div class="range-info">Soleil : <strong>${azimuth.toFixed(0)}° ${cardinal}</strong> · Hauteur <strong>${altitude.toFixed(1)}°</strong></div>
        </div>
        <div class="section">
            <div class="toggle-row"><span class="tlabel">Ombres portées${infoBulle('Vraies ombres des modèles 3D (direction = position solaire), au zoom rue, ' + (STATE.settings.terrain3D ? 'désactivées car le relief 3D est actif' : 'jusqu’à 1500 objets visibles') + '. Le bâti n’a pas d’ombre (limite MapLibre).')}</span><div class="toggle ${STATE.settings.shadows ? 'on' : ''}" onclick="A.toggleSetting('shadows')" role="switch" tabindex="0" aria-checked="${!!STATE.settings.shadows}" aria-label="Ombres portées"></div></div>
            
        </div>`;
}

// ---- Vue & rendu ----
function renderVues() {
    $('module-title').textContent = 'Vue & rendu';
    const s = STATE.settings;
    $('module-body').innerHTML = `
        <div class="section">
            <div class="section-title">Points de vue</div>
            <div class="option-cards">
                <div class="option-card" onclick="A.viewPreset('top')"><div class="oc-icon">⬇️</div><div class="oc-label">Dessus</div></div>
                <div class="option-card" onclick="A.viewPreset('3d')"><div class="oc-icon">🎯</div><div class="oc-label">3D</div></div>
                <div class="option-card" onclick="A.viewPreset('street')"><div class="oc-icon">🚶</div><div class="oc-label">Piéton</div></div>
            </div>
        </div>
        <div class="section">
            <div class="slider-head"><span class="lbl">Inclinaison</span><span class="val" id="v-pitch">${Math.round(map?.getPitch() || 55)}°</span></div>
            <input type="range" class="rng" min="0" max="80" step="1" value="${Math.round(map?.getPitch() || 55)}" oninput="A.setPitch(this.value)">
            <div class="slider-head" style="margin-top:12px"><span class="lbl">Rotation</span><span class="val" id="v-bearing">${Math.round(map?.getBearing() || 0)}°</span></div>
            <input type="range" class="rng" min="-180" max="180" step="1" value="${Math.round(map?.getBearing() || 0)}" oninput="A.setBearing(this.value)">
        </div>
        <div class="section">
            <div class="section-title">Projection${infoBulle('Le globe (façon Google Earth) bascule automatiquement en plan une fois zoomé sur la zone.')}</div>
            <div class="seg">
                <button class="${s.projection === 'globe' ? 'active' : ''}" onclick="A.setProjection('globe')">🌍 Globe</button>
                <button class="${s.projection === 'mercator' ? 'active' : ''}" onclick="A.setProjection('mercator')">🗺️ Plan</button>
            </div>
        </div>
        <div class="section">
            <div class="section-title">Fond de carte</div>
            <div class="option-cards grid2">
                ${Object.entries(BASEMAPS).map(([k, b]) => `<div class="option-card ${s.basemap === k ? 'active' : ''}" onclick="A.setBasemap('${k}')"><div class="oc-icon">${b.icon}</div><div class="oc-label">${b.label}</div></div>`).join('')}
            </div>
        </div>
        <div class="section">
            <div class="section-title">Rendu 3D</div>
            <div class="toggle-row"><span class="tlabel">🏢 Bâti du fond de carte</span><div class="toggle ${s.buildings3D ? 'on' : ''}" onclick="A.toggleSetting('buildings3D')" role="switch" tabindex="0" aria-checked="${!!s.buildings3D}" aria-label="Bâti du fond de carte"></div></div>
            <div class="toggle-row"><span class="tlabel">⛰️ Terrain 3D</span><div class="toggle ${s.terrain3D ? 'on' : ''}" onclick="A.toggleSetting('terrain3D')" role="switch" tabindex="0" aria-checked="${!!s.terrain3D}" aria-label="Terrain 3D"></div></div>
            <label class="input-label" style="margin-top:6px">Source du relief</label>
            <select class="input" onchange="A.setTerrainSource(this.value)">
                ${Object.entries(TERRAIN_SOURCES).map(([k, t]) => `<option value="${k}" ${s.terrainSource === k ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
            <div class="slider-head" style="margin-top:8px"><span class="lbl">Exagération relief</span><span class="val" id="v-exag">${s.terrainExaggeration}×</span></div>
            <input type="range" class="rng" min="1" max="3" step="0.1" value="${s.terrainExaggeration}" oninput="A.setExag(this.value)">
            <div class="toggle-row"><span class="tlabel">🏷️ Libellés du fond</span><div class="toggle ${s.labels ? 'on' : ''}" onclick="A.toggleSetting('labels')" role="switch" tabindex="0" aria-checked="${!!s.labels}" aria-label="Libellés du fond"></div></div>
            <div class="toggle-row"><span class="tlabel">🌫️ Ciel / atmosphère</span><div class="toggle ${s.sky ? 'on' : ''}" onclick="A.toggleSetting('sky')" role="switch" tabindex="0" aria-checked="${!!s.sky}" aria-label="Ciel et atmosphère"></div></div>
        </div>
        <button class="btn btn-soft btn-full" onclick="A.resetView()">🔄 Réinitialiser la vue</button>`;
}

// ============================================================
// LEGEND
// ============================================================
function escLegend(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function legendCategoryColor(sym, value, index, total) {
    const cat = sym.categories?.find((x) => String(x.value) === String(value));
    return cat?.color || paletteColor(sym.palette || 'Tableau10', index, total, sym.inverse);
}

/** Focus légende (ciblage lecture) — session only. */
let _legendFocus = null; // { layerId, field?, value? }

function isLegendFocused(layerId, field, value) {
    if (!_legendFocus || _legendFocus.layerId !== layerId) return false;
    if (field == null) return !_legendFocus.field;
    return _legendFocus.field === field && String(_legendFocus.value) === String(value);
}

/** Les couleurs d'une couche graduée, dans l'ordre : le style déclaratif prime. */
function rampeGraduee(layer, sym) {
    const stopsDecl = (layer._declarative?.kind === 'graduated' ? layer._declarative.stops : null) || [];
    return stopsDecl.length
        ? stopsDecl.map((st) => st.color).filter(Boolean)
        : paletteEn(sym.colorRamp || sym.palette || 'Viridis', sym.inverse);
}

/**
 * Le fond de la pastille d'une couche, là où la couche est nommée.
 *
 * La légende peignait la symbolisation (dégradé, catégories) ; la liste des
 * couches, l'inspecteur et la fiche peignaient `layer.color`, sa couleur de
 * base — quasi blanche pour « Bâtiments (table du document) », rose pâle pour
 * une couche graduée orangée. Deux pastilles pour une couche, et aucune ne
 * concordait. Une seule source, désormais.
 */
function fondPastilleCouche(layer) {
    const sym = initSymbolization(layer).color;
    if (sym.mode === 'graduated' && sym.field) {
        return `linear-gradient(90deg, ${rampeGraduee(layer, sym).join(', ')})`;
    }
    if (sym.mode === 'categorized' && sym.field) {
        const cats = (sym.categories || []).map((c) => c.color).filter(Boolean).slice(0, 4);
        if (cats.length > 1) return `linear-gradient(90deg, ${cats.join(', ')})`;
        if (cats.length === 1) return cats[0];
    }
    if (sym.mode === 'single' && sym.value) return sym.value;
    return layer.color;
}

function buildLayerLegendHtml(layer) {
    const sym = initSymbolization(layer).color;
    etiqueterCategoriesRef(layer);
    const total = formatLayerCount(layer);
    const lid = escLegend(layer.id);
    const clickable = CONFIG.viewMode ? ' legend-clickable' : '';

    if (sym.mode === 'categorized' && sym.field) {
        syncColorCategoriesFromFeatures(layer);
        const vals = filteredUniqueValues(layer, sym.field, 30);
        const fieldEsc = escLegend(sym.field);
        if (!vals.length) {
            // `total` et non zéro : sur une couche dont Atlas ne détient pas les
            // entités, aucune classe n'est mesurable, mais le manifeste sait
            // combien il y en a. Écrire « 0 » ici annonçait une couche vide
            // sous une carte qui la peignait — le compte est le seul endroit
            // où le lecteur va chercher pourquoi il ne voit rien.
            return `<div class="legend-group"><div class="legend-row${clickable}" data-legend="layer" data-layer-id="${lid}"><span class="swatch" style="background:${layer.color}"></span><span class="nm">${escLegend(layer.name)}</span><span class="ct">${total}</span></div></div>`;
        }
        const catRows = valeursOrdonnees(sym, vals).map((v, i) => {
            const col = legendCategoryColor(sym, v.value, i, vals.length);
            const lib = escLegend(libelleCategorie(sym, v.value));
            const focused = isLegendFocused(layer.id, sym.field, v.value) ? ' legend-focused' : '';
            // Un compte inconnu (classe déclarée, entités absentes) s'affiche
            // « — », jamais « null » ni « 0 ».
            const ct = v.count == null ? '—' : v.count;
            return `<div class="legend-row legend-sub${clickable}${focused}" data-legend="cat" data-layer-id="${lid}" data-field="${fieldEsc}" data-value="${escLegend(v.value)}"><span class="swatch" style="background:${col}"></span><span class="nm" title="${lib}">${lib}</span><span class="ct">${ct}</span></div>`;
        }).join('');
        const headFocus = isLegendFocused(layer.id, null, null) ? ' legend-focused' : '';
        return `<div class="legend-group"><div class="legend-row legend-head-row${clickable}${headFocus}" data-legend="layer" data-layer-id="${lid}"><span class="nm legend-layer-name">${escLegend(layer.name)}</span><span class="ct">${total}</span></div>${catRows}</div>`;
    }

    if (sym.mode === 'graduated' && sym.field && sym.manuel && layer._declarative?.stops?.length) {
        return legendeClassesCouleur(layer, sym, lid, clickable, total);
    }
    if (sym.mode === 'graduated' && sym.field) {
        // Les couleurs du style déclaratif priment sur la rampe nommée — c'est
        // déjà la règle pour peindre la carte (cf. applyLayerStyle). La légende
        // s'en écartait : elle annonçait un dégradé Viridis sous une carte
        // verte. Une légende qui ne décrit pas la carte est pire qu'aucune.
        const grad = `linear-gradient(90deg, ${rampeGraduee(layer, sym).join(', ')})`;
        const focused = isLegendFocused(layer.id, null, null) ? ' legend-focused' : '';
        return `<div class="legend-group"><div class="legend-row${clickable}${focused}" data-legend="layer" data-layer-id="${lid}"><span class="swatch legend-grad" style="background:${grad}"></span><span class="nm">${escLegend(layer.name)}</span><span class="ct">${total}</span></div></div>`;
    }

    const swatch = sym.mode === 'single' ? (sym.value || layer.color) : layer.color;
    const focused = isLegendFocused(layer.id, null, null) ? ' legend-focused' : '';
    return `<div class="legend-group"><div class="legend-row${clickable}${focused}" data-legend="layer" data-layer-id="${lid}"><span class="swatch" style="background:${swatch}"></span><span class="nm">${escLegend(layer.name)}</span><span class="ct">${total}</span></div></div>`;
}

/** La légende d'un contour qui suit un champ : ce que disent les contours colorés, avec leur nombre. */
function legendeContour(layer) {
    const st = layer?.style?.symbolization?.stroke;
    if (st?.mode !== 'regle' || st.enabled === false || !st.regle?.stops?.length) return '';
    const cle = resolveFeaturePropertyKey(layer, st.regle.field);
    const { comptes } = comptesParClasse(filteredGeoJSON(layer).features, cle, st.regle.stops);
    const tries = [...st.regle.stops].sort((a, b) => Number(a.lower ?? -Infinity) - Number(b.lower ?? -Infinity));
    const lignes = tries.map((s, i) => (s.color && comptes[i])
        ? `<div class="legend-row legend-sub"><span class="swatch" style="background:transparent;border:2.5px solid ${escLegend(s.color)};border-radius:50%;box-sizing:border-box"></span><span class="nm">${escLegend(libelleClasse(st.regle.stops, i))}</span><span class="ct">${comptes[i]}</span></div>` : '').join('');
    if (!lignes) return '';
    return `<div class="legend-row legend-sub" style="margin-top:2px"><span class="nm" style="font-style:italic;color:var(--muted)">Contour · ${escLegend(st.regle.field)}</span></div>${lignes}`;
}

/** La légende d'une couleur graduée en classes posées à la main : une ligne par classe, avec son nombre. */
function legendeClassesCouleur(layer, sym, lid, clickable, total) {
    const stops = layer._declarative?.stops || [];
    const cle = resolveFeaturePropertyKey(layer, sym.field);
    const { comptes } = comptesParClasse(filteredGeoJSON(layer).features, cle, stops);
    const tries = [...stops].sort((a, b) => Number(a.lower ?? -Infinity) - Number(b.lower ?? -Infinity));
    const lignes = tries.map((s, i) => `<div class="legend-row legend-sub"><span class="swatch" style="background:${escLegend(s.color || TRANSPARENT)}"></span><span class="nm">${escLegend(libelleClasse(stops, i))}</span><span class="ct">${comptes[i]}</span></div>`).join('');
    return `<div class="legend-group"><div class="legend-row legend-head-row${clickable}" data-legend="layer" data-layer-id="${lid}"><span class="nm legend-layer-name">${escLegend(layer.name)}</span><span class="ct">${total}</span></div>${lignes}</div>`;
}

function updateLegend() {
    const body = $('legend-body');
    // La légende énumère dans le même sens que les panneaux : dessus d'abord.
    const vis = displayOrder(STATE.layers).filter((l) => l.visible !== false);
    if (vis.length === 0) { body.innerHTML = '<div class="legend-empty">Aucune couche visible</div>'; return; }
    const html = vis.map((l) => buildLayerLegendHtml(l) + legendeContour(l) + (coucheEclairage(l) ? Eclairage.htmlLegende(l) : '')).join('');
    body.innerHTML = html || '<div class="legend-empty">Aucun objet visible</div>';
}

function fitToFeatures(features) {
    if (!map || !features?.length) return false;
    const bounds = new maplibregl.LngLatBounds();
    let any = false;
    features.forEach((f) => {
        const g = f.geometry; if (!g) return;
        const coords = g.type === 'Point' ? [g.coordinates] : g.coordinates.flat(g.type.includes('Multi') ? 2 : 1);
        coords.forEach((c) => { if (Array.isArray(c) && typeof c[0] === 'number') { bounds.extend(c); any = true; } });
    });
    if (!any) return false;
    viserCadre(bounds, { padding: margeCadrage(), maxZoom: 18, duration: 800 });
    return true;
}

function featuresMatchingCategory(layer, field, value) {
    const propKey = resolveFeaturePropertyKey(layer, field);
    const want = String(value).toLowerCase();
    return (layer.geojson?.features || []).filter((f) => {
        const key = normalizePropertyValue(f.properties?.[propKey]);
        return key && String(key).toLowerCase() === want;
    });
}

/** Clic légende (lecture) : zoom couche ou catégorie. */
function onLegendClick(e) {
    if (!CONFIG.viewMode) return;
    const row = e.target.closest('[data-legend]');
    if (!row) return;
    const layerId = row.dataset.layerId;
    const layer = STATE.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const action = row.dataset.legend;

    if (action === 'layer') {
        _legendFocus = { layerId };
        fitToLayer(layer);
        updateLegend();
        showToast(`Ciblage « ${layer.name} »`, 'info');
        return;
    }
    if (action === 'cat') {
        const field = row.dataset.field;
        const value = row.dataset.value;
        if (_legendFocus?.layerId === layerId && _legendFocus.field === field && String(_legendFocus.value) === String(value)) {
            _legendFocus = null;
            fitToLayer(layer);
            updateLegend();
            showToast('Ciblage retiré', 'info');
            return;
        }
        _legendFocus = { layerId, field, value };
        const feats = featuresMatchingCategory(layer, field, value);
        if (!fitToFeatures(feats)) fitToLayer(layer);
        updateLegend();
        showToast(`Ciblage « ${value} »`, 'info');
    }
}

function wireLegendClicks() {
    const body = $('legend-body');
    if (!body || body._legendWired) return;
    body._legendWired = true;
    body.addEventListener('click', onLegendClick);
}

// ============================================================
// INSPECTOR — symbologie ou objet sélectionné
// ============================================================
let inspectorUserClosed = false;
/**
 * Sur telephone : la fiche a cede la place a un module choisi dans la barre du
 * bas. Une selection active rouvre la fiche a chaque rendu (`renderInspector`) ;
 * sans ce drapeau, toucher « Couches » pendant qu'on regarde un objet ne
 * montrerait jamais les couches. Il retombe des qu'on touche un objet.
 */
let ficheCedee = false;

function resizeMapSoon() {
    // Tout de suite d'abord : la mise en page est recalculée à la lecture des
    // dimensions, et une caméra lancée juste après vise la bonne carte. Les
    // appels différés rattrapent les transitions.
    try { map?.resize(); } catch (e) {}
    requestAnimationFrame(() => {
        try { map?.resize(); } catch (e) {}
        setTimeout(() => { try { map?.resize(); } catch (e) {} }, 180);
    });
}

/** Un module rouvert exprès pendant la fiche d'un objet : il ne cède plus jusqu'à la fermeture de la fiche. */
let _moduleImpose = false;

function openInspectorPanel() {
    const insp = $('inspector');
    if (!insp || inspectorUserClosed) return;
    if (ficheCedee && surTelephone()) return;
    // Tablette, fenêtre étroite : la fiche prime, le module attend replié et
    // revient à la fermeture de la fiche (même règle que sur téléphone).
    // Seule la fiche d'un objet (sélection, création) prime : la symbolisation
    // d'une couche accompagne le module, elle ne le remplace pas.
    const mp = $('module-panel');
    const ficheObjet = (STATE.selection.mode && STATE.selection.features.length > 0) || !!_saisieObjet;
    // Évaluée à chaque passage à la fiche d'un objet, panneau déjà ouvert ou
    // non (la symbolisation l'était peut-être) ; un module rouvert exprès
    // pendant la fiche (`_moduleImpose`) reste là.
    const ouverte = insp.classList.contains('open');
    const largeurFiche = (ouverte && insp.offsetWidth) || 360;
    const largeurCarte = ($('map-frame')?.clientWidth || 0) + (ouverte ? largeurFiche : 0);
    if (ficheObjet && !_moduleImpose && !surTelephone() && mp?.classList.contains('open')
        && !mp.classList.contains('module-cede') && moduleCedeALaFiche({ largeurCarte, largeurFiche })) {
        mp.classList.add('module-cede');
    }
    insp.classList.add('open');
    if (surTelephone()) ouvrirFicheMobile();
    resizeMapSoon();
}

function closeInspectorPanel() {
    const insp = $('inspector');
    if (!insp) return;
    const etaitOuverte = insp.classList.contains('open');
    insp.classList.remove('open');
    $('module-panel')?.classList.remove('module-cede');
    _moduleImpose = false;
    if (etaitOuverte && surTelephone()) fermerFicheMobile();
    resizeMapSoon();
}

function closeInspectorByUser() {
    // Fermer le panneau d'une création l'abandonne : sans panneau, plus
    // d'« Enregistrer », et la carte resterait armée sans le dire.
    if (_saisieObjet) { quitterSaisieObjet(messageAbandon()); }
    inspectorUserClosed = true;
    // Fermer le panneau ferme aussi la liste : elle serait sinon rouverte.
    if (_liste) { _liste = null; document.body.classList.remove('mode-liste'); }
    closeInspectorPanel();
    // Fermer la fiche d'un objet, c'est le laisser : sans cela la sélection
    // restait (halo, barre ◀ ▶), et la fiche revenait au prochain module ouvert
    // (audit des panneaux, 26/09/2026). Vaut pour le ✕, l'onglet retouché et la
    // feuille tirée vers le bas sur téléphone.
    if (STATE.selection.mode) exitSelectionMode();
}

try { localStorage.removeItem('atlas_inspector_collapsed'); } catch (e) {}

function renderInspector() {
    if (_saisieObjet) {
        renderSaisieObjet();
        openInspectorPanel();
        return;
    }
    if (STATE.selection.mode && STATE.selection.features.length > 0) {
        inspectorUserClosed = false;
        renderObjectInspector();
        openInspectorPanel();
        return;
    }
    // La liste d'objets : le panneau d'un objet quand on en choisit un, la liste
    // quand on le referme.
    if (_liste) {
        inspectorUserClosed = false;
        renderListeObjets();
        openInspectorPanel();
        return;
    }
    if (inspectorUserClosed) { closeInspectorPanel(); return; }
    // Lecture : pas d’inspecteur de symbolisation (paramétrage éditeur)
    if (CONFIG.viewMode) { closeInspectorPanel(); return; }
    if ((STATE.currentModule === 'symbo' || STATE.currentModule === 'couches') && STATE.selectedLayer) {
        const layer = STATE.layers.find((l) => l.id === STATE.selectedLayer);
        if (layer) { renderSymbologyInspector(layer); openInspectorPanel(); return; }
    }
    closeInspectorPanel();
}

/**
 * L'entree en revue objet par objet, depuis l'inspecteur de couche.
 *
 * Elle etait reservee aux couches de points, alors que l'edition fonctionne
 * pour tous les types — `enterSelectionMode` est appele au clic sans condition
 * de geometrie. Une couche de lignes ou de surfaces n'avait donc aucune
 * affordance : il fallait deviner qu'on pouvait cliquer la carte.
 *
 * Le libelle annonce ce qui s'ouvrira, parce que ce n'est pas la meme chose
 * selon que la table est decrite par un formulaire ou non.
 */
function boutonRevueObjets(layer) {
    if (!layer?.geojson?.features?.length) return '';
    // Il nommait le formulaire — « Saisir sur les objets · Bâtiment — relevé ».
    // C'etait vrai quand une couche n'en portait qu'un ; depuis qu'elle en a
    // autant que de tables qui la referencent, nommer le premier laisserait
    // croire qu'il est le seul.
    const combien = formulairesDeLaCouche(layer).length;
    const libelle = combien ? `📝 Saisir${combien > 1 ? ` · ${combien}` : ''}` : '✏️ Éditer';
    const titre = combien
        ? `Saisir sur les objets${combien > 1 ? ` (${combien} formulaires)` : ''}`
        : 'Éditer les objets un par un';
    return `<button class="btn btn-soft insp-act" title="${titre}" aria-label="${titre}"
        onclick="A.editLayerObjects('${layer.id}')">${libelle}</button>`;
}

/**
 * Le panneau de symbologie d'une couche.
 *
 * > **Il a disparu une fois, et rien ne l'a dit.** Le commit a5ce269 reecrivait
 * > `boutonRevueObjets`, juste au-dessus, et a emporte cette fonction et sa
 * > variable d'onglet avec elle. Selectionner une couche levait des lors un
 * > ReferenceError depuis un `onclick` : le panneau ne s'ouvrait plus, et
 * > l'erreur restait invisible depuis la page Grist hote, l'iframe etant d'une
 * > autre origine. `verifier-imports.mjs` ne voit que les imports, pas les
 * > references internes -- d'ou `verifier-references.mjs`.
 */
let inspSymTab = 'Couleur';
/** Les blocs ouverts de l'onglet Forme (Taille d'abord) : retenus d'une couche à l'autre, comme l'onglet. */
const blocsFormeOuverts = new Set(['Taille']);

/** L'onglet Forme : ce qui dit comment un point (ou une ligne, une surface) se dessine — taille, icône, modèle 3D. */
function symFormePanel(layer, sym, isPoint) {
    if (!isPoint) return symSizePanel(layer, sym);
    const bloc = (nom, corps) => `<details class="insp-bloc" ${blocsFormeOuverts.has(nom) ? 'open' : ''}
        ontoggle="A.setBlocForme('${nom}', this.open)"><summary>${nom}</summary><div class="insp-bloc-corps">${corps}</div></details>`;
    return bloc('Taille', symSizePanel(layer, sym)) + bloc('Icône', symIconePanel(layer, sym)) + bloc('Modèle 3D', symModelPanel(layer, sym));
}

/** Les actions sous le titre de la couche : une rangée, sans rien d'autre à faire défiler avant les réglages. */
function actionsEntete(layer) {
    const html = boutonEnTable(layer) + boutonRevueObjets(layer) + boutonNouvelObjet(layer);
    return html ? `<div class="insp-actions">${html}</div>` : '';
}

/**
 * Une explication au survol : un « i » discret, dont le texte s'affiche dans une bulle unique (`#info-bulle`) posée en
 * `fixed` — une infobulle dans le panneau serait coupée par son défilement. Au clavier (focus) et au toucher (appui)
 * comme à la souris. Ne mettre ici que ce qui explique ; ce qui avertit d'une conséquence reste écrit.
 */
function infoBulle(texte) {
    const t = escapeHtml(texte);
    return `<span class="info-i" tabindex="0" role="note" aria-label="${t}" data-info="${t}">i</span>`;
}
(function brancherInfoBulle() {
    if (typeof document === 'undefined' || window.__infoBulleBranchee) return;
    window.__infoBulleBranchee = true;
    let bulle = null;
    const cacher = () => { if (bulle) bulle.style.display = 'none'; };
    const montrer = (el) => {
        if (!bulle) {
            bulle = document.createElement('div');
            bulle.id = 'info-bulle';
            bulle.setAttribute('aria-hidden', 'true');
            document.body.appendChild(bulle);
        }
        bulle.textContent = el.dataset.info || '';
        bulle.style.display = 'block';
        const r = el.getBoundingClientRect();
        const w = Math.min(260, window.innerWidth - 16);
        bulle.style.maxWidth = w + 'px';
        const h = bulle.offsetHeight;
        const x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
        const dessous = r.bottom + 8 + h < window.innerHeight;
        bulle.style.left = x + 'px';
        bulle.style.top = (dessous ? r.bottom + 8 : Math.max(8, r.top - 8 - h)) + 'px';
    };
    const cible = (e) => e.target?.closest?.('.info-i');
    document.addEventListener('mouseover', (e) => { const c = cible(e); if (c) montrer(c); });
    document.addEventListener('mouseout', (e) => { if (cible(e)) cacher(); });
    document.addEventListener('focusin', (e) => { const c = cible(e); if (c) montrer(c); });
    document.addEventListener('focusout', (e) => { if (cible(e)) cacher(); });
    document.addEventListener('click', (e) => { const c = cible(e); if (c) { e.preventDefault(); e.stopPropagation(); montrer(c); } else cacher(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cacher(); });
})();

function renderSymbologyInspector(layer) {
    const sym = initSymbolization(layer);
    const isPoint = layer.geometryType === 'Point' || layer.geometryType === 'MultiPoint';
    // Cinq onglets au plus : Couleur, Forme (taille, icône, modèle 3D), Étiquette, Bulle, Spécifications.
    const tabs = ['Couleur', 'Forme', 'Étiquette'];
    if (layer.sourceTable && CONFIG.grist.ready) tabs.push('Bulle');
    if (isPoint && typesAvecSchema(layer).length) tabs.push('Spécifications');
    if (!tabs.includes(inspSymTab)) inspSymTab = 'Couleur';

    // Chip du modèle 3D lié à la couche (toujours visible dans l'inspecteur)
    const is3D = isPoint && (layer.style?.mode === 'library' || layer.style?.mode === 'custom');
    let modelChip = '';
    if (is3D) {
        const mm = sym.model || {};
        let label, icon = '📦';
        if (mm.mode === 'categorized' && mm.field) { label = `par champ « ${mm.field} »`; }
        else if (layer.style?.mode === 'custom' && layer.style.custom?.filename) { label = layer.style.custom.filename; }
        else { const l = libelleModele(layer.style?.library?.modelId); icon = l.icon; label = echapper(l.label); }
        modelChip = `<div style="margin-top:8px;display:flex;align-items:center;gap:8px">
            <span style="display:inline-flex;align-items:center;gap:6px;background:var(--accent-soft);border:1px solid rgba(196,69,54,0.2);border-radius:8px;padding:4px 10px;font-size:12px;color:var(--ink)"><span style="font-size:15px">${icon}</span>${label}</span>
            <button onclick="A.openLayerModel('${layer.id}')" style="background:transparent;border:none;color:var(--accent);font-size:12px;font-weight:600;cursor:pointer">changer</button>
        </div>`;
    }
    $('insp-head').innerHTML = `
        <div class="insp-eyebrow"><span class="layer-swatch" style="background:${fondPastilleCouche(layer)}"></span>Symboliser${is3D ? ' · <span style="color:var(--accent2)">3D</span>' : ''}</div>
        <div class="insp-title">${echapper(layer.name)}</div>
        <div class="insp-sub">${formatLayerCount(layer)} objets · ${layer.geometryType}</div>
        ${modelChip}
        ${actionsEntete(layer)}`;
    $('insp-tabs').innerHTML = tabs.map((t) => `<button class="insp-tab ${inspSymTab === t ? 'active' : ''}" onclick="A.setSymTab('${t}')">${t}</button>`).join('');

    const body = $('insp-body');
    if (inspSymTab === 'Couleur') body.innerHTML = symColorPanel(layer, sym);
    else if (inspSymTab === 'Forme') body.innerHTML = symFormePanel(layer, sym, isPoint);
    else if (inspSymTab === 'Spécifications') body.innerHTML = symSpecsPanel(layer);
    else if (inspSymTab === 'Bulle') body.innerHTML = symBullePanel(layer, sym);
    else body.innerHTML = symLabelPanel(layer, sym);

    $('insp-foot').innerHTML = `
        <button class="btn btn-soft" style="flex:1" onclick="A.resetSymbology('${layer.id}')">Réinitialiser</button>
        <button class="btn btn-primary" style="flex:2" onclick="A.saveLayer('${layer.id}')"
            title="Couleurs, tailles, modèle 3D et étiquettes de la couche — pas ses objets">Enregistrer l’apparence</button>`;
}

/** Ce que le sélecteur annonce d'un champ : une référence n'est pas un nombre. */
function typeAffiche(layer, f) {
    const col = layer?.sourceTable && (STATE.schema?.[layer.sourceTable] || []).find((x) => x.colId === f.id);
    if (tableReferencee(col?.type)) return 'réf.';
    return f.type === 'numeric' ? '123' : 'abc';
}
function fieldSelect(layer, param, current, type) {
    const fields = getLayerFields(layer).filter((f) => !type || f.type === type);
    return `<select class="input" onchange="A.setSymField('${layer.id}','${param}', this.value)">
        <option value="">— Champ —</option>
        ${fields.map((f) => `<option value="${f.id}" ${current === f.id ? 'selected' : ''}>${f.id} (${typeAffiche(layer, f)})</option>`).join('')}
    </select>`;
}
function modeSeg(layer, param, mode, modes) {
    const lbl = { single: 'Fixe', categorized: 'Catégorisé', graduated: 'Gradué', catalogue: 'Catalogue' };
    return `<div class="seg">${modes.map((m) => `<button class="${mode === m ? 'active' : ''}" onclick="A.setSymMode('${layer.id}','${param}','${m}')">${lbl[m]}</button>`).join('')}</div>`;
}
function methodChips(layer, param, method) {
    return `<div class="chips" style="margin-top:8px">${[['linear', 'Linéaire'], ['log', 'Log'], ['sqrt', '√']].map(([id, l]) => `<button class="chip ${method === id ? 'active' : ''}" onclick="A.setSymMethod('${layer.id}','${param}','${id}')">${l}</button>`).join('')}</div>`;
}
function paletteList(layer, param, current, type) {
    const items = Object.entries(PALETTE_INFO).filter(([, i]) => type === 'all' || i.type === type);
    return `<div class="palette-list" style="margin-top:8px">${items.map(([id, info]) => `
        <div class="palette-item ${current === id ? 'active' : ''}" onclick="A.setSymPalette('${layer.id}','${param}','${id}')">
            <div class="palette-strip">${(COLOR_PALETTES[id] || []).map((c) => `<span style="background:${c}"></span>`).join('')}</div>
            <span class="pname">${info.name}</span>
        </div>`).join('')}</div>`;
}

/** Le découpage d'une couleur graduée : réparti d'office, ou des seuils posés à la main. */
function choixDecoupage(layer, c) {
    return `<div class="section"><div class="section-title">Découpage</div><div class="seg">
        <button class="${c.manuel ? '' : 'active'}" onclick="A.setDecoupage('${layer.id}','auto')">Automatique</button>
        <button class="${c.manuel ? 'active' : ''}" onclick="A.setDecoupage('${layer.id}','manuel')">Seuils à la main</button>
    </div></div>`;
}

/** Les classes d'une cible : la couleur graduée (style déclaratif) ou le contour (règle propre). */
function classesDe(layer, cible) {
    const sym = initSymbolization(layer);
    if (cible === 'contour') return sym.stroke?.regle?.stops || [];
    return layer._declarative?.kind === 'graduated' ? (layer._declarative.stops || []) : [];
}
function champDeClasses(layer, cible) {
    const sym = initSymbolization(layer);
    return cible === 'contour' ? sym.stroke?.regle?.field : sym.color.field;
}

/**
 * L'éditeur de classes : une couleur par classe, les seuils entre elles, des comptes. Même éditeur pour la couleur
 * et pour le contour — c'est la même règle (voir lib/classes.js).
 */
function editeurClasses(layer, cible) {
    const stops = classesDe(layer, cible);
    const champ = champDeClasses(layer, cible);
    const esc = (x) => escapeHtml(String(x ?? ''));
    const numeriques = getLayerFields(layer).filter((f) => f.type === 'numeric');
    const selecteur = cible === 'contour'
        ? `<select class="input" onchange="A.setClasses('${layer.id}','contour',{field:this.value})">${['<option value="">— champ —</option>'].concat(numeriques.map((f) => `<option value="${esc(f.id)}" ${champ === f.id ? 'selected' : ''}>${esc(f.label)}</option>`)).join('')}</select>`
        : '';
    if (!champ || !stops.length) return `<div class="section"><div class="section-title">Classes</div>${selecteur}</div>`;
    const { seuils, couleurs } = seuilsDeStops(stops);
    const cle = resolveFeaturePropertyKey(layer, champ);
    const { comptes } = comptesParClasse(filteredGeoJSON(layer).features, cle, stops);
    const lignes = couleurs.map((c, i) => {
        const dernier = i === couleurs.length - 1;
        const libre = cible === 'contour';
        const coul = c ? `<input type="color" value="${esc(c)}" onchange="A.setClasses('${layer.id}','${cible}',{couleur:[${i},this.value]})" style="width:30px;height:26px;border:none;cursor:pointer">`
            : `<span title="Pas de contour pour cette classe" style="display:inline-block;width:30px;text-align:center;color:var(--muted)">∅</span>`;
        const sans = libre ? `<label title="Pas de contour pour cette classe" style="font-size:11px;color:var(--muted);cursor:pointer"><input type="checkbox" ${c ? '' : 'checked'} onchange="A.setClasses('${layer.id}','${cible}',{vide:[${i},this.checked]})"> sans</label>` : '';
        const borne = dernier
            ? `<span style="flex:1;font-size:12px">au-delà de ${esc(seuils.length ? seuils[seuils.length - 1] : '')}</span>`
            : `<span style="font-size:12px">jusqu’à</span><input class="input" type="number" step="any" value="${esc(seuils[i])}" style="width:84px" onchange="A.setClasses('${layer.id}','${cible}',{seuil:[${i},this.value]})">`;
        return `<div style="display:flex;gap:8px;align-items:center;margin-top:6px">${coul}${borne}${sans}<span style="margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--muted)">${comptes[i] ?? 0}</span></div>`;
    }).join('');
    return `<div class="section"><div class="section-title">Classes${infoBulle('Une classe va jusqu’à son seuil, inclus. La dernière prend tout ce qui le dépasse.')}</div>${selecteur}${lignes}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
            <button class="btn btn-soft btn-sm" onclick="A.setClasses('${layer.id}','${cible}',{ajouter:true})">＋ Seuil</button>
            <button class="btn btn-soft btn-sm" ${seuils.length ? '' : 'disabled'} onclick="A.setClasses('${layer.id}','${cible}',{retirer:true})">− Seuil</button>
            <button class="btn btn-soft btn-sm" onclick="A.setClasses('${layer.id}','${cible}',{inverser:true})">⇄ Inverser les couleurs</button>
        </div></div>`;
}

function caseInverser(layer, param, on) {
    return `<label class="toggle-row" style="margin-top:8px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:12px">
        <input type="checkbox" ${on ? 'checked' : ''} onchange="A.setSymInverse('${layer.id}','${param}',this.checked)"> Inverser la palette</label>`;
}

function symColorPanel(layer, sym) {
    const c = sym.color;
    let inner = '';
    if (c.mode === 'single') {
        inner = `<div class="section"><div class="section-title">Couleur</div>
            <div style="display:flex;gap:8px;align-items:center">
                <input type="color" value="${c.value || layer.color}" style="width:40px;height:34px;border:none;cursor:pointer" onchange="A.setSymColorValue('${layer.id}', this.value)">
                <input class="input" style="flex:1;font-family:var(--mono)" value="${c.value || layer.color}" onchange="A.setSymColorValue('${layer.id}', this.value)">
            </div></div>`;
    } else if (c.mode === 'categorized') {
        inner = `<div class="section"><div class="section-title">Champ source</div>${fieldSelect(layer, 'color', c.field, null)}</div>
            ${blocReferenceCouleur(layer, c)}
            ${c.field && !c.reference ? `<div class="section"><div class="section-title">Palette</div>${paletteList(layer, 'color', c.palette, 'qualitative')}${caseInverser(layer, 'color', c.inverse)}</div>` : ''}
            ${c.field ? `
            <div class="section"><div class="section-title">Catégories</div>${categoriesPreview(layer, c)}</div>` : ''}`;
    } else {
        inner = `<div class="section"><div class="section-title">Champ source</div>${fieldSelect(layer, 'color', c.field, 'numeric')}
            ${c.field ? rangeInfo(layer, c.field) : ''}</div>
            ${c.field ? choixDecoupage(layer, c) + (c.manuel
                ? editeurClasses(layer, 'couleur')
                : `<div class="section"><div class="section-title">Palette</div>${paletteList(layer, 'color', c.colorRamp || c.palette, 'sequential')}${caseInverser(layer, 'color', c.inverse)}${methodChips(layer, 'color', c.method)}</div>`) : ''}`;
    }
    return `<div class="section"><div class="section-title">Mode</div>${modeSeg(layer, 'color', c.mode, ['single', 'categorized', 'graduated'])}</div>${inner}`;
}
// ------------------------------------------------------------
// Tables de référence — couleur, gravité et icône lues dans le document
// (`lib/table-reference.js`, lot 3 du cadrage des relevés de terrain).
// ------------------------------------------------------------
const _lignesReference = new Map();   // table -> lignes { id, col: valeur }
const _referencesDetectees = new Map();   // `${couche}|${champ}|${besoin}` -> ref | null

/** Les lignes d'une table, lues une fois par session. */
async function lignesDeTable(table) {
    if (_lignesReference.has(table)) return _lignesReference.get(table);
    const cols = await grist.docApi.fetchTable(table);
    const lignes = (cols.id || []).map((id, i) => {
        const l = { id };
        for (const k of Object.keys(cols)) if (k !== 'id') l[k] = cols[k][i];
        return l;
    });
    _lignesReference.set(table, lignes);
    return lignes;
}

/**
 * La table de référence d'un champ, si le document en porte une. `besoin` :
 * `'couleur'` (couleur ou rang) ou `'icone'`. Au plus quatre petites tables
 * lues : les candidates sont choisies sur le schéma, sans rien télécharger.
 */
async function detecterReference(layer, champ, besoin) {
    const k = `${layer.id}|${champ}|${besoin}`;
    if (_referencesDetectees.has(k)) return _referencesDetectees.get(k);
    let trouvee = null;
    if (CONFIG.grist.ready && layer.sourceTable && STATE.schema && champ) {
        const valeurs = getUniqueValues(layer, champ, 500).map((v) => v.value);
        for (const cand of candidatsReference(STATE.schema, layer.sourceTable, champ).slice(0, 4)) {
            try {
                const lignes = await lignesDeTable(cand.table);
                const ref = analyserReference(STATE.schema[cand.table], lignes, valeurs, cand.parReference);
                const utile = besoin === 'icone' ? ref?.icone : (ref?.couleur || ref?.rang);
                if (utile) { trouvee = { ...ref, table: cand.table, parReference: cand.parReference }; break; }
            } catch (e) { /* table illisible : on passe à la suivante */ }
        }
    }
    _referencesDetectees.set(k, trouvee);
    return trouvee;
}

/** Relance le rendu de l'inspecteur une fois une détection arrivée. */
function detecterPuisRedessiner(layer, champ, besoin) {
    const k = `${layer.id}|${champ}|${besoin}`;
    if (_referencesDetectees.has(k)) return _referencesDetectees.get(k);
    detecterReference(layer, champ, besoin).then(() => {
        if (STATE.selectedLayer === layer.id) renderInspector();
    });
    return undefined;   // en cours
}

/** Le bloc « couleurs de la table de référence » d'une couleur par catégorie. */
function blocReferenceCouleur(layer, c) {
    if (!c.field || !layer.sourceTable) return '';
    if (c.reference) {
        const r = c.reference;
        return `<div class="section"><div class="section-title">Table de référence</div>
            <div class="hint" style="margin:0">Couleurs${r.rang ? ` et ordre de dessin (« ${escapeHtml(r.rang)} »)` : ''} lus dans <strong>${escapeHtml(r.table)}</strong>. Le plus grave est dessiné par-dessus.</div>
            <div style="display:flex;gap:6px;margin-top:6px">
                <button class="btn btn-soft" style="flex:1" onclick="A.appliquerReferenceCouleur('${layer.id}', true)">Relire</button>
                <button class="btn btn-soft" style="flex:1" onclick="A.retirerReferenceCouleur('${layer.id}')">Revenir à la palette</button>
            </div></div>`;
    }
    const ref = detecterPuisRedessiner(layer, c.field, 'couleur');
    if (ref === undefined) return '<div class="range-info" style="margin-top:6px">Recherche d’une table de référence…</div>';
    if (!ref) return '';
    const quoi = [ref.couleur && 'les couleurs', ref.rang && `l’ordre de gravité (« ${escapeHtml(ref.rang)} »)`].filter(Boolean).join(' et ');
    return `<div class="section"><div class="section-title">Table de référence</div>
        <div class="hint" style="margin:0">La table <strong>${escapeHtml(ref.table)}</strong> décrit ces valeurs : Atlas peut en reprendre ${quoi}.</div>
        <button class="btn btn-primary btn-full" style="margin-top:6px" onclick="A.appliquerReferenceCouleur('${layer.id}')">Utiliser l’apparence de « ${escapeHtml(ref.table)} »</button></div>`;
}

/**
 * Les champs d'une couche de points qui peuvent donner une icône : une présélection sur le schéma, puis la confirmation
 * (une table de référence lue, une seule fois) champ par champ. `enCours` tant qu'une confirmation est attendue.
 */
function champsIcone(layer) {
    if (!layer.sourceTable || !CONFIG.grist.ready || !STATE.schema) return { valides: [], enCours: false };
    const noms = (layer._fields?.length ? layer._fields.map((f) => f.name) : Object.keys(layer.geojson?.features?.[0]?.properties || {}))
        .filter((n) => n && !n.startsWith('_'));
    const candidats = champsAvecImages(STATE.schema, layer.sourceTable, noms);
    let enCours = false;
    const valides = candidats.filter((n) => {
        const ref = detecterPuisRedessiner(layer, n, 'icone');
        if (ref === undefined) enCours = true;
        return !!ref;
    });
    return { valides, enCours };
}

/** L'onglet Icône d'une couche de points : une image par valeur d'un champ. */
function symIconePanel(layer, sym) {
    const ic = sym.icon || {};
    const { valides, enCours } = champsIcone(layer);
    const champs = ic.field && !valides.includes(ic.field) ? [ic.field, ...valides] : valides;
    const choisi = ic.field || '';
    let corps = '';
    if (ic.mode === 'reference' && ic.field) {
        const n = Object.keys(ic.images || {}).length;
        const echecs = [...ICONES.echecs].filter((u) => Object.values(ic.images || {}).includes(u)).length;
        corps = `<div class="hint" style="margin:0">${n} image${n > 1 ? 's' : ''} lue${n > 1 ? 's' : ''} dans <strong>${escapeHtml(ic.table || '')}</strong>${echecs ? ` — ${echecs} inaccessible${echecs > 1 ? 's' : ''} (lien rompu ou refusé)` : ''}.</div>
            <div class="section"><div class="section-title">Taille · ${ic.taille || 40} px</div>
                <input type="range" min="16" max="96" step="2" value="${ic.taille || 40}" style="width:100%" oninput="A.setTailleIcone('${layer.id}', this.value)"></div>
            <div style="display:flex;gap:6px;margin-top:6px">
                <button class="btn btn-soft" style="flex:1" onclick="A.appliquerIcones('${layer.id}', '${escapeHtml(ic.field)}', true)">Relire</button>
                <button class="btn btn-soft" style="flex:1" onclick="A.retirerIcones('${layer.id}')">Retirer les icônes</button>
            </div>`;
    } else if (choisi) {
        const ref = detecterPuisRedessiner(layer, choisi, 'icone');
        corps = ref === undefined ? '<div class="range-info">Recherche d’images…</div>'
            : ref ? `<div class="hint" style="margin:0">La table <strong>${escapeHtml(ref.table)}</strong> porte une image par valeur (« ${escapeHtml(ref.icone)} »).</div>
                <button class="btn btn-primary btn-full" style="margin-top:6px" onclick="A.appliquerIcones('${layer.id}', '${escapeHtml(choisi)}')">Afficher ces icônes</button>`
            : '<div class="range-info">Aucune table du document ne donne d’image pour ce champ.</div>';
    }
    if (!champs.length) {
        return `<div class="section"><div class="section-title">Icône selon le champ</div>
            <div class="range-info">${enCours ? 'Recherche d’images dans le document…' : 'Aucun champ de cette couche ne renvoie à une table d’images.'}</div></div>`;
    }
    return `<div class="section"><div class="section-title">Icône selon le champ${infoBulle('L’icône se pose au-dessus du point, qui garde sa couleur : le type d’un ouvrage en image, son état en couleur.')}</div>
        <select class="input" onchange="A.choisirChampIcone('${layer.id}', this.value)">
            <option value="">— Champ —</option>
            ${champs.map((n) => `<option value="${escapeHtml(n)}" ${n === choisi ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}
        </select></div>
        ${corps}`;
}

/**
 * L'onglet Bulle : ce que montre un objet quand on le touche, en lecture et
 * sur le terrain. Une proposition tirée du schéma, puis des cases à cocher.
 */
function symBullePanel(layer, sym) {
    const b = sym.bulle;
    // Ni colonnes internes, ni coordonnées : elles n'ont rien à dire dans une bulle.
    const geo = new Set(nomsColonnesGeometrie(colonnesGeometrie(layer)));
    const COORD = /(^|_)(lat|latitude|lon|lng|long|longitude)(_|$)|latitude|longitude|^(wkt|geometry_json|geometry|geom)$/i;
    const cols = (STATE.schema?.[layer.sourceTable] || [])
        .filter((c) => !/^(gristHelper|manualSort$)/.test(c.colId) && !geo.has(c.colId) && !COORD.test(c.colId));
    if (!b?.actif) {
        return `<div class="hint" style="margin:0">Quand on touche un objet en lecture — au bureau ou sur le terrain —, la bulle montre l’essentiel : son nom, ses photos, son état en couleur, quelques champs, sa dernière visite, et les gestes utiles (nouvelle visite, fiche, itinéraire).</div>
            <button class="btn btn-primary btn-full" style="margin-top:8px" onclick="A.activerBulle('${layer.id}')">Activer la bulle</button>`;
    }
    const lib = (colId) => escapeHtml(libelleColonne(layer.sourceTable, colId));
    const coche = (cle, colId, actif) => `<label class="bulle-choix"><input type="checkbox" ${actif ? 'checked' : ''} onchange="A.reglerBulle('${layer.id}','${cle}','${escapeHtml(colId)}', this.checked)"> ${lib(colId)}</label>`;
    const photos = cols.filter((c) => c.type === 'Attachments');
    const autres = cols.filter((c) => c.type !== 'Attachments' && !/^RefList:/.test(c.type || ''));
    const liens = tablesReferencant(STATE.schema, layer.sourceTable);
    const a = b.actions || {};
    return `<div class="section"><div class="section-title">Titre</div>
            <select class="input" onchange="A.reglerBulle('${layer.id}','titre', this.value, true)">
                <option value="">— aucun —</option>
                ${autres.map((c) => `<option value="${escapeHtml(c.colId)}" ${b.titre === c.colId ? 'selected' : ''}>${lib(c.colId)}</option>`).join('')}
            </select></div>
        ${photos.length ? `<div class="section"><div class="section-title">Photos</div>${photos.map((c) => coche('photos', c.colId, b.photos?.includes(c.colId))).join('')}</div>` : ''}
        <div class="section"><div class="section-title">Pastilles d’état${infoBulle('Leur couleur vient de la symbologie, ou de la table de référence du champ.')}</div>
            <div class="bulle-choix-liste">${autres.map((c) => coche('pastilles', c.colId, b.pastilles?.includes(c.colId))).join('')}</div></div>
        <div class="section"><div class="section-title">Champs montrés</div>
            <div class="bulle-choix-liste">${autres.map((c) => coche('champs', c.colId, b.champs?.includes(c.colId))).join('')}</div></div>
        <div class="section"><div class="section-title">Dernière visite</div>
            <select class="input" onchange="A.reglerBulle('${layer.id}','lien', this.value, true)">
                <option value="">— aucune —</option>
                ${liens.map((l) => `<option value="${escapeHtml(l.table)}" ${b.lien?.table === l.table ? 'selected' : ''}>${escapeHtml(l.table)} (par « ${escapeHtml(l.via)} »)</option>`).join('')}
            </select></div>
        <div class="section"><div class="section-title">Gestes</div>
            <label class="bulle-choix"><input type="checkbox" ${a.visite ? 'checked' : ''} ${b.lien ? '' : 'disabled'} onchange="A.reglerBulle('${layer.id}','action','visite', this.checked)"> Nouvelle visite${b.lien ? ` (${escapeHtml(b.lien.table)})` : ''}</label>
            <label class="bulle-choix"><input type="checkbox" ${a.fiche ? 'checked' : ''} onchange="A.reglerBulle('${layer.id}','action','fiche', this.checked)"> Voir la fiche</label>
            <label class="bulle-choix"><input type="checkbox" ${a.itineraire ? 'checked' : ''} onchange="A.reglerBulle('${layer.id}','action','itineraire', this.checked)"> Itinéraire</label>
            ${etatVisiteBulle(layer, b)}</div>
        <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn btn-soft" style="flex:1" onclick="A.desactiverBulle('${layer.id}')">Désactiver</button>
            <button class="btn btn-primary" style="flex:1" onclick="A.apercuBulle('${layer.id}')">Aperçu</button>
        </div>`;
}

// Images posées sur la carte : id MapLibre -> URL, et celles qui ont échoué.
const ICONES = { urls: new Map(), echecs: new Set(), enCours: new Set() };

/**
 * Charge une icône, réduite à 64 px : les images d'un document pèsent souvent
 * plusieurs centaines de Ko, et une carte en pose des dizaines. Un lien rompu
 * reçoit une image vide — sinon MapLibre la redemanderait à chaque image — et
 * se compte dans l'onglet Icône.
 */
async function chargerIcone(id) {
    const url = ICONES.urls.get(id);
    if (!url || !map || map.hasImage(id) || ICONES.enCours.has(id)) return;
    ICONES.enCours.add(id);
    try {
        const { data } = await map.loadImage(url);
        const cote = 128;   // affichée à demi-densité : 64 px à la taille 64
        const k = Math.min(cote / data.width, cote / data.height, 1);
        const w = Math.max(1, Math.round(data.width * k)), h = Math.max(1, Math.round(data.height * k));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(data, 0, 0, w, h);
        if (!map.hasImage(id)) map.addImage(id, cv.getContext('2d').getImageData(0, 0, w, h), { pixelRatio: 2 });
    } catch (e) {
        ICONES.echecs.add(url);
        if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
    } finally {
        ICONES.enCours.delete(id);
    }
}

/**
 * Valeurs d'une catégorie dans l'ordre où les montrer : celui de la table de
 * référence (gravité croissante) quand la couleur en vient, sinon tel quel.
 */
function valeursOrdonnees(c, vals) {
    const rangs = c.reference?.rangs;
    if (!rangs || !Object.keys(rangs).length) return vals;
    // Le rang lu dans la table, pas la position dans `categories` : la relecture
    // des entités réordonne cette liste par fréquence.
    const r = (v) => (Number.isFinite(rangs[String(v.value)]) ? rangs[String(v.value)] : Infinity);
    return [...vals].sort((a, b) => r(a) - r(b) || libelleCategorie(c, a.value).localeCompare(libelleCategorie(c, b.value), 'fr'));
}
/** Le libellé d'une valeur : celui de la table de référence (un `Ref` arrive en identifiant). */
function libelleCategorie(c, value) {
    const cat = c.categories?.find((x) => String(x.value) === String(value));
    return cat?.label || c.libelles?.[String(value)] || String(value);
}

/**
 * Un champ `Ref` se catégorise par identifiant de ligne : la légende montrait
 * « 1 », « 2 ». On va chercher, une fois par couche et par champ, le libellé
 * que Grist affiche (la première colonne de texte de la table visée), gardé
 * dans `color.libelles` pour survivre aux reconstructions des catégories.
 */
const _libellesRefDemandes = new Set();
function etiqueterCategoriesRef(layer) {
    const c = layer?.style?.symbolization?.color;
    if (!c || c.mode !== 'categorized' || !c.field || !layer.sourceTable || !STATE.schema || !CONFIG.grist.ready) return;
    const k = `${layer.id}|${c.field}`;
    if (_libellesRefDemandes.has(k)) return;
    _libellesRefDemandes.add(k);
    const col = (STATE.schema[layer.sourceTable] || []).find((x) => x.colId === c.field);
    const cible = tableReferencee(col?.type);
    const colLib = cible && (STATE.schema[cible] || []).find((x) => !x.type || x.type === 'Text')?.colId;
    if (!colLib) return;
    lignesDeTable(cible).then((lignes) => {
        if (c.field !== col.colId) return;   // le champ a changé entre-temps
        c.libelles = Object.fromEntries(lignes.map((l) => [String(l.id), String(l[colLib] ?? '')]).filter(([, v]) => v));
        updateLegend();
        if (STATE.selectedLayer === layer.id) renderInspector();
    }).catch(() => { /* table illisible : les identifiants restent */ });
}

function categoriesPreview(layer, c) {
    const vals = getUniqueValues(layer, c.field, 100);
    if (!vals.length) return '<div class="range-info">Aucune valeur</div>';
    if (!c.categories.length) syncColorCategoriesFromFeatures(layer);
    return `<div class="cats">${valeursOrdonnees(c, vals).slice(0, 30).map((v, i) => {
        const cat = c.categories.find((x) => String(x.value) === String(v.value));
        const col = cat?.color || paletteColor(c.palette, i, vals.length, c.inverse);
        const lib = escapeHtml(libelleCategorie(c, v.value));
        return `<div class="cat-row"><span class="cat-swatch" style="background:${col}" onclick="A.pickCatColor('${layer.id}','${String(v.value).replace(/'/g, "\\'")}', this)"></span><span class="cat-value" title="${lib}">${lib}</span><span class="cat-count">${v.count}</span></div>`;
    }).join('')}${vals.length > 30 ? `<div class="range-info" style="margin-top:6px">+ ${vals.length - 30} autres</div>` : ''}</div>`;
}
/** Bornes qu'un contrôle du manifeste déclare pour un champ, s'il y en a un. */
function bornesDeclarees(layer, field) {
    const c = (layer?.controls || []).find((x) => x.field === field);
    const lo = Number.isFinite(c?.dataMin) ? c.dataMin : c?.min;
    const hi = Number.isFinite(c?.dataMax) ? c.dataMax : c?.max;
    return (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) ? { min: lo, max: hi } : null;
}

function rangeInfo(layer, field) {
    const r = getNumericRange(layer, field);
    if (!r.count) {
        // « Pas de valeurs numériques » est un constat, et il est faux ici : on
        // n'a rien pu regarder. Le manifeste, lui, declare peut-etre les bornes
        // observees a la production — c'est ce qui permet de graduer une couche
        // qu'on ne detient pas.
        const b = bornesDeclarees(layer, field);
        if (b) {
            return `<div class="range-info" style="margin-top:6px">Valeurs déclarées : `
                 + `<strong>${b.min}</strong> → <strong>${b.max}</strong></div>`;
        }
        if (layer?._distant) {
            return '<div class="range-info">Valeurs inconnues — la couche est distante '
                 + 'et le manifeste ne déclare pas de bornes pour ce champ.</div>';
        }
        return '<div class="range-info">⚠️ Pas de valeurs numériques</div>';
    }
    return `<div class="range-info" style="margin-top:6px">Valeurs : <strong>${r.min.toFixed(1)}</strong> → <strong>${r.max.toFixed(1)}</strong> (${r.count} obj.)</div>`;
}

/** Réglages d'apparence communs : opacité de couche et contour. */
function symAppearancePanel(layer, sym) {
    const isPolygon = layer.geometryType === 'Polygon' || layer.geometryType === 'MultiPolygon';
    const isPoint = layer.geometryType === 'Point' || layer.geometryType === 'MultiPoint';
    const is3D = isPoint && (layer.style?.mode === 'library' || layer.style?.mode === 'custom');
    const auto = !Number.isFinite(sym.opacity);
    const opVal = auto ? defaultLayerOpacity(layer) : sym.opacity;

    const opacity = `<div class="section">
        <div class="slider-head"><span class="lbl">Opacité${auto ? infoBulle('Suit l’opacité du style ; bouge le curseur pour la fixer.') : ''}</span><span class="val" id="op-val">${Math.round(opVal * 100)} %${auto ? ' (auto)' : ''}</span></div>
        <input type="range" class="rng acc" min="0" max="1" step="0.05" value="${opVal}" oninput="A.setSymOpacity('${layer.id}', this.value)">
        ${auto
            ? ''
            : `<button class="btn btn-soft btn-full" style="margin-top:6px" onclick="A.setSymOpacity('${layer.id}','auto')">↺ Revenir à l’automatique</button>`}
    </div>`;

    // Le contour n'a de sens que sur une surface à plat ou un point : une
    // extrusion n'en porte pas, et un modèle 3D est rendu par three.js.
    const flat = layer.style?.polygonMode === 'flat';
    if (is3D || (isPolygon && !flat)) return opacity;

    const st = sym.stroke || {};
    const mode = st.enabled === false ? 'none' : (st.mode === 'fixed' ? 'fixed' : st.mode === 'regle' ? 'regle' : 'follow');
    const stroke = `<div class="section"><div class="section-title">Contour</div>
        <div class="seg">
            <button class="${mode === 'none' ? 'active' : ''}" onclick="A.setStrokeMode('${layer.id}','none')">Aucun</button>
            <button class="${mode === 'follow' ? 'active' : ''}" onclick="A.setStrokeMode('${layer.id}','follow')">Suit le remplissage</button>
            <button class="${mode === 'fixed' ? 'active' : ''}" onclick="A.setStrokeMode('${layer.id}','fixed')">Couleur fixe</button>
            <button class="${mode === 'regle' ? 'active' : ''}" onclick="A.setStrokeMode('${layer.id}','regle')">Selon un champ</button>
        </div>
        ${mode === 'regle' ? editeurClasses(layer, 'contour') : ''}
        ${mode === 'none' ? '' : `
        <div class="slider-head" style="margin-top:8px"><span class="lbl">Épaisseur</span><span class="val">${st.width ?? 1.5} px</span></div>
        <input type="range" class="rng acc" min="0.5" max="8" step="0.5" value="${st.width ?? 1.5}" oninput="A.setStrokeWidth('${layer.id}', this.value)">
        ${mode === 'fixed' ? `<div style="margin-top:8px"><label class="input-label">Couleur du contour</label>
            <input class="input" type="color" value="${st.color || layer.color}" onchange="A.setStrokeColor('${layer.id}', this.value)"></div>` : ''}`}
    </div>`;
    return opacity + stroke;
}

function symSizePanel(layer, sym) {
    const s = sym.size;
    const isPoint = layer.geometryType === 'Point' || layer.geometryType === 'MultiPoint';
    const isPolygon = layer.geometryType === 'Polygon' || layer.geometryType === 'MultiPolygon';
    const is3D = isPoint && (layer.style?.mode === 'library' || layer.style?.mode === 'custom');
    const unit = is3D ? '×' : (layer.geometryType === 'Polygon' ? 'm' : 'px');
    const title = is3D ? 'Échelle' : (layer.geometryType === 'Polygon' ? 'Hauteur extrusion' : layer.geometryType === 'Point' ? 'Rayon' : 'Épaisseur');

    // Surfaces : à plat ou en volume. À plat, la hauteur d'extrusion n'a aucun
    // effet — on masque le réglage plutôt que de l'afficher inopérant.
    const flat = layer.style?.polygonMode === 'flat';
    const vastes = isPolygon && !flat && STATE.settings.terrain3D && !layer._distant ? (layer._nVastes || 0) : 0;
    const volume = isPolygon ? `<div class="section"><div class="section-title">Rendu des surfaces</div>
        <div class="seg">
            <button class="${flat ? 'active' : ''}" onclick="A.setPolygonMode('${layer.id}','flat')">▭ À plat</button>
            <button class="${!flat ? 'active' : ''}" onclick="A.setPolygonMode('${layer.id}','extruded')">◨ En volume</button>
        </div>${flat ? `<div class="section-title" style="margin-top:10px">Remplissage</div><div class="seg">
            <button class="${sym.remplissage !== 'contour' ? 'active' : ''}" onclick="A.setRemplissage('${layer.id}','plein')">▣ Plein</button>
            <button class="${sym.remplissage === 'contour' ? 'active' : ''}" onclick="A.setRemplissage('${layer.id}','contour')">▢ Contour seul</button>
        </div>` : ''}${vastes ? `<div class="hint" style="margin-top:8px">${vastes} surface${vastes > 1 ? 's' : ''} de plus de ${SEUIL_VOLUME_M} m ${vastes > 1 ? 'sont posées' : 'est posée'} à plat : sur le relief, un volume ne suit pas la pente à cette échelle.</div>` : ''}</div>` : '';
    if (isPolygon && flat) {
        return volume + symAppearancePanel(layer, sym) + symGrappesPanel(layer, sym);
    }

    const base = Number.isFinite(sym.extrusion?.base) ? sym.extrusion.base : 0;
    const basePanel = (isPolygon && !flat) ? `<div class="section">
        <div class="slider-head"><span class="lbl">Base (socle)</span><span class="val">${base} m</span></div>
        <input type="range" class="rng acc" min="0" max="100" step="1" value="${base}" oninput="A.setExtrusionBase('${layer.id}', this.value)">
    </div>` : '';

    let inner = '';
    if (s.mode === 'single') {
        inner = `<div class="section"><div class="slider-head"><span class="lbl">${title}</span><span class="val" id="sz-val">${s.value} ${unit}</span></div>
            <input type="range" class="rng acc" min="${is3D ? 0.1 : 1}" max="${is3D ? 5 : layer.geometryType === 'Polygon' ? 150 : 30}" step="${is3D ? 0.1 : 0.5}" value="${s.value}" oninput="A.setSymSizeValue('${layer.id}', this.value)"></div>`;
    } else {
        inner = `<div class="section"><div class="section-title">Champ source</div>${fieldSelect(layer, 'size', s.field, 'numeric')}${s.field ? rangeInfo(layer, s.field) : ''}</div>
            ${s.field ? `<div class="section"><div class="section-title">Méthode</div>${methodChips(layer, 'size', s.method)}</div>
            <div class="section"><div class="section-title">Plage de sortie (${unit})</div><div class="dual">
                <div><label class="input-label">Min</label><input class="input" type="number" step="0.1" value="${s.outputRange[0]}" onchange="A.setSymOutput('${layer.id}','size',0,this.value)"></div>
                <div><label class="input-label">Max</label><input class="input" type="number" step="0.1" value="${s.outputRange[1]}" onchange="A.setSymOutput('${layer.id}','size',1,this.value)"></div>
            </div></div>` : ''}`;
    }
    return volume
        + `<div class="section"><div class="section-title">Mode</div>${modeSeg(layer, 'size', s.mode, ['single', 'graduated'])}</div>`
        + inner + basePanel + symAppearancePanel(layer, sym) + (is3D ? '' : symGrappesPanel(layer, sym));
}


/** Le réglage de regroupement d'une couche : un interrupteur, puis ce qu'il faut pour le régler. */
function symGrappesPanel(layer, sym) {
    if (!grappable(layer)) return '';
    const cfg = configGrappes(sym);
    const estPoint = layer.geometryType === 'Point' || layer.geometryType === 'MultiPoint';
    const titre = estPoint ? 'Regroupement' : 'Regroupement à petite échelle';
    const aide = estPoint
        ? 'Les objets proches se regroupent en un rond qui dit leur nombre, et se défont en zoomant.'
        : 'Sous un certain zoom, les formes laissent place à des ronds qui regroupent leurs centres.';
    const reglages = cfg.enabled ? `
        ${estPoint ? `<div class="slider-head" style="margin-top:10px"><span class="lbl">Rayon de regroupement</span><span class="val">${cfg.rayon} px</span></div>
        <input type="range" class="rng acc" min="20" max="150" step="5" value="${cfg.rayon}" onchange="A.setGrappes('${layer.id}',{rayon:+this.value})">` : ''}
        <div class="slider-head" style="margin-top:10px"><span class="lbl">${estPoint ? 'Se défait à partir du zoom' : 'Les formes paraissent à partir du zoom'}</span><span class="val">${estPoint ? cfg.zoomMax : cfg.zoomMax + 1}</span></div>
        <input type="range" class="rng acc" min="3" max="18" step="1" value="${cfg.zoomMax}" onchange="A.setGrappes('${layer.id}',{zoomMax:+this.value})">
        <div class="section-title" style="margin-top:10px">Couleur du rond</div>
        <div class="seg">
            <button class="${cfg.couleur !== 'pire' ? 'active' : ''}" onclick="A.setGrappes('${layer.id}',{couleur:'couche'})">Celle de la couche</button>
            <button class="${cfg.couleur === 'pire' ? 'active' : ''}" ${pireDisponible(sym) ? '' : 'disabled title="Demande une couleur lue dans une table de référence avec un rang de gravité"'} onclick="A.setGrappes('${layer.id}',{couleur:'pire'})">Le plus grave</button>
        </div>` : '';
    return `<div class="section"><div class="section-title">${titre}${infoBulle(aide)}</div>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer">
            <input type="checkbox" ${cfg.enabled ? 'checked' : ''} onchange="A.setGrappes('${layer.id}',{enabled:this.checked})"> Regrouper</label>${reglages}</div>`;
}

// ============================================================
// SPECIFICATIONS DES OBJETS DU CATALOGUE (lib/parametres-objet.js)
// ============================================================
/*
 * Un objet réaliste est piloté par des paramètres (éclairage : puissance, couleur, hauteur de feu,
 * allumage…). Le schéma vient du type du catalogue. Pour chaque paramètre, la valeur d'un objet se
 * cherche dans l'ordre : réglage posé sur l'objet, champ de l'objet, réglage de la couche, défaut du
 * type, règle d'Atlas — et dit d'où elle vient. Les défauts sont virtuels : rien n'est écrit dans la
 * table de l'équipe.
 *
 * Les panneaux ci-dessous sont des formulaires GÉNÉRÉS depuis le schéma : une famille d'objets de plus
 * (la végétation, plus tard) est un schéma de plus, pas un écran de plus.
 */

/** Le type du catalogue d'une entité : imposé par l'identifiant, ou déduit de ses champs (affectation « Catalogue »). */
function typeIdDeEntite(layer, feature) {
    const impose = typeImposeDe(layer, feature);
    if (impose) return impose;
    if (!CATALOGUE_OBJETS.cat || !coucheAuCatalogue(layer) || feature?.properties?._modelId) return null;
    return resoudreObjet(CATALOGUE_OBJETS.cat, sourceDeCouche(layer), feature, { lod: 1 })?.type?.id || null;
}
/** Les types du catalogue dont une couche affiche des objets, et dont les paramètres sont décrits. */
function typesAvecSchema(layer) {
    if (!CATALOGUE_OBJETS.cat || layer?.style?.mode !== 'library') return [];
    const ids = new Set();
    for (const f of (layer.geojson?.features || []).slice(0, 300)) {
        const id = typeIdDeEntite(layer, f);
        if (id) ids.add(id);
    }
    // Le type choisi pour la couche compte même sans objet qui le porte encore.
    const m = layer.style.symbolization?.model;
    const ajouter = (id) => { const t = typeDeIdObjet(id); if (t) ids.add(t); };
    ajouter(layer.style.library?.modelId);
    if (m?.mode === 'categorized') { (m.categories || []).forEach((c) => ajouter(c.modelId)); ajouter(m.defaultModelId); }
    return [...ids].map(typeCatalogueDe).filter((t) => t && descripteursDuType(t).length);
}
/**
 * Le placement et les réglages d'un objet sont conservés dans la colonne technique d'Atlas : on le
 * sait AU PREMIER RÉGLAGE, pas à l'enregistrement. La colonne est créée si la table ne l'a pas ; si le
 * document refuse la modification de structure, on le dit tout de suite — sinon quelqu'un règle un objet,
 * le voit changer, et le perd sans l'avoir su.
 *
 * Mémorisé par couche : une seule tentative à la fois, et le verdict est gardé pour la session.
 */
function verifierPersistance3d(layer) {
    if (!layer?.sourceTable || !CONFIG.grist.ready || CONFIG.viewMode) return Promise.resolve(null);
    if (typeof grist === 'undefined' || typeof grist.docApi?.applyUserActions !== 'function') return Promise.resolve(null);
    if (layer._col3dPromesse) return layer._col3dPromesse;
    layer._col3dPromesse = (async () => {
        const r = await assurerColonneAtlas3d(grist.docApi, layer, colonnesDeTable(layer));
        if (r.etat === 'inconnue') { layer._col3dPromesse = null; return r; }
        layer._col3dEtat = r;
        if (r.etat === 'creee') {
            const schema = (STATE.schema = STATE.schema || {});
            (schema[layer.sourceTable] = schema[layer.sourceTable] || []).push({ colId: 'atlas_3d_json', type: 'Text' });
            showToast(`Colonne atlas_3d_json ajoutée à ${layer.sourceTable} : le placement et les réglages des objets y sont conservés`, 'success');
        } else if (r.etat === 'refusee') {
            showToast('Ce réglage ne sera pas conservé : le document ne permet pas à Atlas d’ajouter sa colonne atlas_3d_json', 'warning');
        }
        if (STATE.selection?.features?.length) renderObjectInspector();
        return r;
    })();
    return layer._col3dPromesse;
}
/** L'avertissement permanent d'un onglet de fiche quand ce qu'on y règle ne sera pas conservé. */
function htmlAvertissementPersistance(layer) {
    if (layer?._col3dEtat?.etat !== 'refusee') return '';
    return `<div class="hint" style="color:var(--accent);margin-bottom:10px"><strong>Ces réglages ne seront pas conservés.</strong> La table « ${echapper(layer.sourceTable)} » n’a pas la colonne <code>atlas_3d_json</code>, et vous n’avez pas le droit d’en modifier la structure. Une personne qui le peut doit ajouter cette colonne (texte), ou enregistrer un objet une fois depuis Atlas.</div>`;
}

/** Cette entité a-t-elle des paramètres décrits ? (l'onglet « Spécifications » de sa fiche) */
function specsOffertes(layer, feature) {
    const id = typeIdDeEntite(layer, feature);
    return !!id && descripteursDuType(typeCatalogueDe(id)).length > 0;
}

/** À qui s'appliquent les réglages affichés : à tous les types de la couche (`*`) ou à l'un d'eux. */
let _specsPortee = { layerId: null, scope: '*' };
function porteeSpecs(layer, types) {
    const memeFamille = new Set(types.map((t) => t.family)).size === 1;
    let scope = _specsPortee.layerId === layer.id ? _specsPortee.scope : '*';
    if (scope !== '*' && !types.some((t) => t.id === scope)) scope = '*';
    // Des familles différentes n'ont pas de réglage commun : on vise un type.
    if (scope === '*' && !memeFamille) scope = types[0].id;
    return { scope, memeFamille };
}

/** Une ligne du panneau de couche : la valeur de la couche, le champ à lire, et la situation en une phrase. */
function htmlLigneSpec(layer, scope, d, { bilan, champs, reglage, liaison }) {
    const lid = chaineJs(layer.id), sc = chaineJs(scope), pid = chaineJs(d.id);
    const phrase = phraseBilan(d, bilan);
    const defaut = bilan.parDefaut ? formaterValeur(d, bilan.parDefaut.valeur) : '';
    let saisie;
    if (d.kind === 'choice') {
        saisie = `<select class="input spec-saisie" onchange="A.setSpecValeur('${lid}','${sc}','${pid}', this.value)">
            <option value="">${defaut ? `Par défaut : ${echapper(defaut)}` : 'Par défaut'}</option>
            ${d.choix.map((c) => `<option value="${echapper(c.value)}" ${reglage === c.value ? 'selected' : ''}>${echapper(c.label)}</option>`).join('')}</select>`;
    } else {
        const type = d.kind === 'number' ? 'number' : d.kind === 'date' ? 'date' : 'text';
        const bornes = d.kind === 'number' ? ` min="${d.min ?? ''}" max="${d.max ?? ''}" step="${d.pas ?? 'any'}"` : '';
        saisie = `<input class="input spec-saisie" type="${type}"${bornes} value="${echapper(reglage ?? '')}" placeholder="${echapper(defaut)}" onchange="A.setSpecValeur('${lid}','${sc}','${pid}', this.value)">`;
    }
    const suggere = champPropose(d, champs);
    const lecture = champs.length
        ? `<select class="input spec-champ" title="Lire ce paramètre dans un champ de la table" onchange="A.setSpecLiaison('${lid}','${pid}', this.value)">
            <option value="">${suggere ? `Lire dans le champ : « ${echapper(suggere)} » (reconnu)` : 'Lire dans le champ : automatique'}</option>
            ${champs.map((c) => `<option value="${echapper(c)}" ${liaison === c ? 'selected' : ''}>${echapper(c)}</option>`).join('')}</select>`
        : '';
    return `<div class="spec-ligne">
        <div class="spec-nom">${echapper(d.libelle)}${d.unite ? `<span class="spec-unite">${echapper(d.unite)}</span>` : ''}</div>
        <div class="spec-saisies">${saisie}${lecture}</div>
        ${phrase.texte ? `<div class="spec-situation${phrase.alerte ? ' alerte' : ''}">${echapper(phrase.texte)}</div>` : ''}
        ${d.aide ? `<div class="spec-aide">${echapper(d.aide)}</div>` : ''}</div>`;
}

/** Le comportement jour / nuit : trois états, et de quoi le voir tout de suite. */
function htmlComportementSpec(layer, scope, reglage) {
    const lid = chaineJs(layer.id), sc = chaineJs(scope);
    const actif = reglage || 'soleil';
    const bouton = (v, libelle) => `<button class="${actif === v ? 'active' : ''}" onclick="A.setSpecValeur('${lid}','${sc}','comportement','${v === 'soleil' ? '' : v}')">${libelle}</button>`;
    return `<div class="spec-ligne">
        <div class="spec-nom">Comportement</div>
        <div class="seg">${bouton('soleil', 'Selon le soleil')}${bouton('toujours', 'Toujours allumé')}${bouton('jamais', 'Toujours éteint')}</div>
        <div class="spec-moments">
            <button class="btn btn-soft btn-sm" onclick="A.voirMoment('day')">Voir de jour</button>
            <button class="btn btn-soft btn-sm" onclick="A.voirMoment('night')">Voir de nuit</button>
        </div>
        <div class="spec-aide">Selon le soleil : allumé du coucher au lever, éteint le jour. Un point hors service reste éteint.</div></div>`;
}

/**
 * « Figer dans la table » : un geste à part, explicite. Les valeurs supposées (règle, défaut du type,
 * réglage de la couche) ne sont jamais écrites dans la table de l'équipe sans lui.
 */
let _figer = null;     // { layerId, choix: Set<string> } quand le panneau de confirmation est ouvert
function figerPossible(layer) {
    return !!layer?.sourceTable && CONFIG.grist.ready && !CONFIG.viewMode && typeof grist !== 'undefined'
        && typeof grist.docApi?.applyUserActions === 'function';
}
/** Les colonnes que la table porte, d'après le schéma du document, les colonnes écrivables et les champs lus. */
function colonnesDeTable(layer) {
    const noms = new Set((STATE.schema?.[layer.sourceTable] || []).map((c) => c.colId));
    (layer._gristColumns || []).forEach((c) => noms.add(typeof c === 'string' ? c : c?.name || c?.id));
    for (const f of (layer.geojson?.features || []).slice(0, 50)) {
        Object.keys(f.properties || {}).filter((k) => !k.startsWith('_')).forEach((k) => noms.add(k));
    }
    noms.delete(undefined);
    return noms;
}
function planFigerDeCouche(layer, choisis) {
    const entites = (layer.geojson?.features || []).map((f) => ({ rowId: f.properties?._row_id, properties: f.properties || {}, f }));
    const parType = new Map();
    const typeIdDe = (e) => typeIdDeEntite(layer, e.f);
    const descripteursDe = (e) => {
        const id = typeIdDe(e);
        if (!parType.has(id)) parType.set(id, descripteursDuType(typeCatalogueDe(id)));
        return parType.get(id);
    };
    return planFiger({
        entites, couche: layer.parametres, descripteursDe, typeIdDe, colonnes: colonnesDeTable(layer),
        choisis, table: layer.sourceTable,
    });
}
function htmlFigerSpecs(layer) {
    if (!figerPossible(layer)) return '';
    const lid = chaineJs(layer.id);
    if (!_figer || _figer.layerId !== layer.id) {
        return `<div class="section"><button class="btn btn-soft btn-full" onclick="A.figerOuvrir('${lid}')">Figer dans la table…</button>
            <div class="spec-aide">Écrit dans la table les valeurs que ces réglages ne tiennent que virtuellement (règle, défaut, réglage de la couche).</div></div>`;
    }
    const plan = planFigerDeCouche(layer, _figer.choix);
    if (!plan.candidats.length) {
        return `<div class="section"><div class="section-title">Figer dans la table</div>
            <div class="hint">Rien à figer : toutes les valeurs sont déjà dans la table.</div>
            <button class="btn btn-soft btn-full" onclick="A.figerAnnuler()">Fermer</button></div>`;
    }
    const lignes = plan.candidats.map((c) => `<label class="spec-figer-ligne">
        <input type="checkbox" ${_figer.choix.has(c.id) ? 'checked' : ''} onchange="A.figerBasculer('${chaineJs(c.id)}')">
        <span><strong>${echapper(c.libelle)}</strong> : ${c.n} cellule${c.n > 1 ? 's' : ''}, colonne « ${echapper(c.colId)} »${c.creer ? ' (à créer)' : ''}</span></label>`).join('');
    return `<div class="section"><div class="section-title">Figer dans la table</div>
        <div class="hint">Ces valeurs deviennent des données de <strong>${echapper(layer.sourceTable)}</strong>. Elles sont posées par règle ou par réglage, pas mesurées : à vérifier. Les cellules déjà remplies ne sont jamais modifiées.</div>
        ${lignes}
        <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-soft" style="flex:1" onclick="A.figerAnnuler()">Annuler</button>
            <button class="btn btn-dark" style="flex:2" ${plan.cellules ? '' : 'disabled'} onclick="A.figerEcrire('${lid}')">Écrire ${plan.cellules} cellule${plan.cellules > 1 ? 's' : ''}</button>
        </div></div>`;
}

/** L'onglet « Spécifications » d'une couche : les paramètres de ses objets, par groupe. */
function symSpecsPanel(layer) {
    const types = typesAvecSchema(layer);
    if (!types.length) {
        return `<div class="hint">Cette couche n’affiche aucun objet du catalogue décrit par des paramètres. Choisissez un objet réaliste dans l’onglet <strong>Modèle 3D</strong>.</div>`;
    }
    const { scope, memeFamille } = porteeSpecs(layer, types);
    const typeRef = scope === '*' ? types[0] : types.find((t) => t.id === scope);
    const descripteurs = descripteursDuType(typeRef);
    const parType = new Map(types.map((t) => [t.id, descripteursDuType(t)]));
    const typeIdDe = (f) => typeIdDeEntite(layer, f);
    const entites = layer.geojson?.features || [];
    const visees = (scope === '*' ? entites : entites.filter((f) => typeIdDe(f) === scope)).slice(0, 300);
    const champs = champsControlables(layer);
    const reglagesPortee = layer.parametres?.valeurs?.[scope] || {};
    const liaisons = layer.parametres?.liaisons || {};

    const portee = types.length > 1
        ? `<div class="section"><div class="section-title">Réglages pour</div>
            <select class="input" onchange="A.setSpecPortee('${chaineJs(layer.id)}', this.value)">
                ${memeFamille ? `<option value="*" ${scope === '*' ? 'selected' : ''}>Tous les types de la couche</option>` : ''}
                ${types.map((t) => `<option value="${echapper(t.id)}" ${scope === t.id ? 'selected' : ''}>${echapper(t.name || t.id)}</option>`).join('')}
            </select></div>`
        : `<div class="section"><div class="section-title">Objet</div><div class="range-info">${echapper(types[0].name || types[0].id)}</div></div>`;

    const sections = groupesDeFamille(typeRef.family).map((g) => {
        const dans = descripteurs.filter((d) => d.groupe === g.id && d.id !== 'comportement');
        const compor = g.id === 'allumage' && descripteurs.some((d) => d.id === 'comportement')
            ? htmlComportementSpec(layer, scope, reglagesPortee.comportement) : '';
        if (!dans.length && !compor) return '';
        const lignes = dans.map((d) => {
            const bilan = bilanParametre(d, visees, {
                couche: layer.parametres, typeIdDe,
                descripteurDe: (f) => parType.get(typeIdDe(f))?.find((x) => x.id === d.id) || null,
            });
            return htmlLigneSpec(layer, scope, d, { bilan, champs, reglage: reglagesPortee[d.id], liaison: liaisons[d.id] || '' });
        }).join('');
        return `<div class="section"><div class="section-title">${echapper(g.libelle)}</div>${compor}${lignes}</div>`;
    }).join('');

    const lid = chaineJs(layer.id), sc = chaineJs(scope);
    return `<div class="hint">Ces valeurs servent aux objets qui ne les portent pas dans leurs propres champs. Elles ne modifient pas votre table.</div>
        ${portee}${sections}${htmlFigerSpecs(layer)}
        <div class="section"><button class="btn btn-soft btn-full" onclick="A.resetSpecs('${lid}','${sc}')">Effacer les réglages ${scope === '*' ? 'de la couche' : 'de ce type'}</button></div>`;
}

/** L'onglet « Spécifications » de la fiche d'un objet : ses valeurs effectives, leur origine, et de quoi les régler. */
function htmlSpecsObjet(layer, feature, lectureSeule) {
    const typeId = typeIdDeEntite(layer, feature);
    const descripteurs = descripteursDuType(typeCatalogueDe(typeId));
    if (!descripteurs.length) return '<div class="hint">Cet objet n’a pas de paramètres décrits.</div>';
    const props = feature.properties || {};
    const params = props._params || {};
    const ctx = { props, params, couche: layer.parametres, typeId };
    const type = typeCatalogueDe(typeId);

    const ligne = (d) => {
        const effectif = resoudreParametre(d, ctx);
        const herite = resoudreParametre(d, { ...ctx, params: null });
        const surObjet = params[d.id];
        const pid = chaineJs(d.id);
        const phrase = effectif.valeur == null
            ? 'Aucune valeur'
            : `${formaterValeur(d, effectif.valeur)} — ${libelleOrigine(effectif.origine, effectif.champ)}${effectif.explication ? ' : ' + effectif.explication : ''}${effectif.ecartBande ? ' · ' + effectif.ecartBande : ''}`;
        const defaut = herite.valeur != null ? formaterValeur(d, herite.valeur) : '';
        if (lectureSeule) {
            return `<div class="spec-ligne"><div class="spec-nom">${echapper(d.libelle)}</div>
                <div class="spec-situation${effectif.ecartBande ? ' alerte' : ''}">${echapper(phrase)}</div></div>`;
        }
        let saisie;
        if (d.kind === 'choice') {
            saisie = `<select class="input spec-saisie" onchange="A.setObjetParam('${pid}', this.value)">
                <option value="">${defaut ? `Hérité : ${echapper(defaut)}` : 'Hérité'}</option>
                ${d.choix.map((c) => `<option value="${echapper(c.value)}" ${surObjet === c.value ? 'selected' : ''}>${echapper(c.label)}</option>`).join('')}</select>`;
        } else {
            const type2 = d.kind === 'number' ? 'number' : d.kind === 'date' ? 'date' : 'text';
            const bornes = d.kind === 'number' ? ` min="${d.min ?? ''}" max="${d.max ?? ''}" step="${d.pas ?? 'any'}"` : '';
            saisie = `<input class="input spec-saisie" type="${type2}"${bornes} value="${echapper(surObjet ?? '')}" placeholder="${echapper(defaut)}" onchange="A.setObjetParam('${pid}', this.value)">`;
        }
        const effacer = surObjet !== undefined
            ? `<button class="spec-effacer" title="Revenir à la valeur héritée" onclick="A.resetObjetParam('${pid}')">×</button>` : '';
        return `<div class="spec-ligne">
            <div class="spec-nom">${echapper(d.libelle)}${d.unite ? `<span class="spec-unite">${echapper(d.unite)}</span>` : ''}</div>
            <div class="spec-saisies${effacer ? ' avec-effacer' : ''}">${saisie}${effacer}</div>
            <div class="spec-situation${effectif.ecartBande ? ' alerte' : ''}">${echapper(phrase)}</div></div>`;
    };

    const sections = groupesDeFamille(type.family).map((g) => {
        const dans = descripteurs.filter((d) => d.groupe === g.id);
        return dans.length ? `<div class="section"><div class="section-title">${echapper(g.libelle)}</div>${dans.map(ligne).join('')}</div>` : '';
    }).join('');
    const note = lectureSeule ? '' : htmlAvertissementPersistance(layer) + `<div class="hint">Une valeur saisie ici ne vaut que pour cet objet. Laissée vide, elle est héritée du champ de l’objet, de la couche, du type ou de la règle.</div>`;
    return `<div class="section"><div class="range-info">${echapper(type.name || type.id)}</div></div>${note}${sections}`;
}

function symModelPanel(layer, sym) {
    const m = sym.model;
    const is3D = layer.style?.mode === 'library' || layer.style?.mode === 'custom';
    // Représentation de la couche : cercle 2D (Mapbox) ou modèle 3D
    const repr = `<div class="section"><div class="section-title">Représentation</div>
        <div class="seg">
            <button class="${!is3D ? 'active' : ''}" onclick="A.setRepresentation('${layer.id}','mapbox')">⬤ Cercle 2D</button>
            <button class="${is3D ? 'active' : ''}" onclick="A.setRepresentation('${layer.id}','library')">📦 Modèle 3D</button>
        </div></div>`;
    if (!is3D) return repr + `<div class="hint">Couche en cercles 2D (couleur/taille dans les onglets dédiés). Passe en « Modèle 3D » pour choisir un objet du catalogue.</div>`;

    const catRaw = layer._modelCat || 'lighting';
    const cat = MODEL_LIBRARY.categories[catRaw] ? catRaw : 'lighting';
    if (cat !== catRaw) layer._modelCat = cat;
    const grid = MODEL_LIBRARY.categories[cat].models;
    const selId = layer.style?.library?.modelId;
    let inner;
    if (m.mode === 'catalogue') {
        inner = panneauCatalogueCouche(layer, selId);
    } else if (m.mode === 'single') {
        inner = `<div class="section"><div class="section-title">Catégorie</div>
            <select class="input" onchange="A.setModelCat('${layer.id}', this.value)">${Object.entries(MODEL_LIBRARY.categories).map(([k, c]) => `<option value="${k}" ${cat === k ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}</select></div>
            <div class="section"><div class="section-title">Modèle de la couche</div>
            <div class="model-grid">${grid.map((mm) => `<div class="model-card ${selId === mm.id ? 'active' : ''}" onclick="A.pickModel('${layer.id}','${mm.id}')"><div class="mi">${mm.icon}</div><div class="mn">${mm.name}</div></div>`).join('')}</div></div>
            ${sectionObjetsRealistes(layer, selId)}`;
    } else {
        inner = `<div class="section"><div class="section-title">Champ source</div>${fieldSelect(layer, 'model', m.field, 'text')}</div>
            ${m.field ? `<div class="section"><div class="section-title">Modèle par valeur</div><div class="cats">${getUniqueValues(layer, m.field, 20).map((v) => {
                const c2 = m.categories.find((c) => String(c.value) === String(v.value));
                return `<div class="cat-row"><span class="cat-icon">${findModel(c2?.modelId)?.icon || '❓'}</span><span class="cat-value" title="${v.value}">${v.value}</span>
                    <select class="cat-select" onchange="A.setModelCategory('${layer.id}','${String(v.value).replace(/'/g, "\\'")}', this.value)"><option value="">—</option>${optionsModeles(c2?.modelId)}</select>
                    <span class="cat-count">${v.count}</span></div>`;
            }).join('')}</div></div>
            <div class="section"><div class="section-title">Modèle par défaut</div><select class="input" onchange="A.setDefaultModel('${layer.id}', this.value)"><option value="">— Aucun —</option>${optionsModeles(m.defaultModelId)}</select></div>` : ''}`;
    }
    // « Catalogue » n'est offert que si un catalogue d'objets est pointe — ou si
    // la couche l'utilise deja, pour qu'elle puisse en sortir.
    const modes = CATALOGUE_OBJETS.url || m.mode === 'catalogue' ? ['single', 'categorized', 'catalogue'] : ['single', 'categorized'];
    return repr
        + `<div class="section"><div class="section-title">Affectation</div>${modeSeg(layer, 'model', m.mode, modes)}</div>`
        + inner + commonTransform(layer);
}
/**
 * Affectation « Catalogue » : ce que le catalogue pointe fera de la couche.
 * Le modele de la couche reste choisi : c'est le repli des objets qu'aucun
 * type ne reconnait (spec §3.4).
 */
/**
 * « Objets réalistes » : les types du catalogue d'objets pointé, choisis à la main pour la couche.
 * Le choix s'écrit `style.library.modelId = 'objet:<type>'` — le même champ que la bibliothèque
 * low-poly, qui dit à lui seul la famille. Variante, classe de hauteur et niveau de détail restent
 * ceux du catalogue.
 */
function sectionObjetsRealistes(layer, selId) {
    const c = CATALOGUE_OBJETS;
    if (c.etat === 'chargement') return '<div class="section"><div class="section-title">Objets réalistes</div><div class="hint">Chargement du catalogue…</div></div>';
    if (c.etat === 'erreur') return `<div class="section"><div class="section-title">Objets réalistes</div><div class="hint">Catalogue illisible : ${escapeHtml(c.erreur)}</div></div>`;
    const objs = modelesObjets();
    if (!objs.length) return '';
    const inconnu = estIdObjet(selId) && !findModel(selId)
        ? `<div class="hint" style="margin-top:6px;color:var(--accent)">Le modèle choisi (<code>${escapeHtml(selId)}</code>) n'est pas dans ce catalogue : les objets de la couche ne s'affichent pas.</div>` : '';
    return `<div class="section"><div class="section-title">Objets réalistes · ${objs.length}${infoBulle('Un objet réaliste est choisi par type : sa classe de hauteur se lit sur hauteurFeu ou height quand l\'objet les porte.')}</div>
        <div class="model-grid">${objs.map((mm) => {
            const f = mm.fiche;
            const infos = [f.famille, f.variantes > 1 ? `${f.variantes} variantes` : null, `${f.fichiers} fichier${f.fichiers > 1 ? 's' : ''}`, f.interne ? 'usage interne' : null].filter(Boolean).join(' · ');
            return `<div class="model-card ${selId === mm.id ? 'active' : ''}" title="${escapeHtml(mm.name + ' — ' + infos + ' — ' + mm.id)}" onclick="A.pickModel('${layer.id}','${mm.id}')"><div class="mi">${mm.icon}</div><div class="mn">${escapeHtml(mm.name)}</div></div>`;
        }).join('')}</div>${inconnu}</div>`;
}
function panneauCatalogueCouche(layer, selId) {
    const c = CATALOGUE_OBJETS;
    const etat = c.etat === 'pret'
        ? `${c.cat.types.length} type(s), ${c.cat.assets.length} fichier(s) — <code>${escapeHtml(c.cat.id || c.url)}</code>`
        : c.etat === 'chargement' ? 'Chargement du catalogue…'
        : c.etat === 'erreur' ? `Catalogue illisible : ${escapeHtml(c.erreur)}`
        : 'Aucun catalogue pointé : module Modèles → Catalogue d\'objets.';
    let reconnus = 0, refuses = 0;
    if (c.cat) {
        const src = sourceDeCouche(layer);
        const pub = contextePublic();
        for (const f of layer.geojson?.features || []) {
            if (f.geometry?.type !== 'Point') continue;
            const r = resoudreObjet(c.cat, src, f, { lod: 1 });
            if (!r) continue;
            reconnus++;
            if (pub && r.asset?.licence?.usage === 'internal') refuses++;
        }
    }
    const n = (layer.geojson?.features || []).length;
    // Un refus de licence ressemble a une panne : il se dit.
    const refus = refuses ? `<div class="hint" style="margin-top:6px;color:var(--accent)">${refuses} d'entre eux restent en modèle de repli : leurs fichiers sont réservés à un usage interne, et cette page est publique (hors Grist). Ouverte depuis un document Grist ou l'application, elle les affiche.</div>` : '';
    return `<div class="section"><div class="section-title">Catalogue d'objets${infoBulle('Le modèle de chaque objet est choisi d\'après ses champs ; variante, orientation et taille sont tirées de sa position. L\'échelle et l\'azimut de la couche s\'y appliquent en plus.')}</div>
        <div class="range-info" style="word-break:break-all">${etat}</div>
        ${c.cat ? `<div class="hint" style="margin-top:6px">${reconnus} objet(s) sur ${n} reconnu(s) par un type du catalogue. Les autres gardent le modèle de repli ci-dessous.</div>` : ''}
        ${refus}</div>
        <div class="section"><div class="section-title">Repli (objets non reconnus)</div>
        <select class="input" onchange="A.pickModel('${layer.id}', this.value, true)">${allModels().map((mm) => `<option value="${mm.id}" ${selId === mm.id ? 'selected' : ''}>${mm.icon} ${mm.name}</option>`).join('')}</select></div>`;
}
function commonTransform(layer) {
    const c = layer.style.common = layer.style.common || { scale: 1, rotationX: 0, rotationY: 0, rotationZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0 };
    return `<div class="section"><div class="section-title">Transform couche</div>
        <div class="slider-head"><span class="lbl">Échelle</span><span class="val" id="ct-scale">${c.scale}×</span></div>
        <input type="range" class="rng acc" min="0.1" max="5" step="0.1" value="${c.scale}" oninput="A.setCommon('${layer.id}','scale',this.value,'ct-scale','×')">
        <div class="slider-head" style="margin-top:12px"><span class="lbl">Rotation Z (azimut)</span><span class="val" id="ct-rz">${c.rotationZ}°</span></div>
        <input type="range" class="rng acc" min="0" max="360" step="5" value="${c.rotationZ}" oninput="A.setCommon('${layer.id}','rotationZ',this.value,'ct-rz','°')">
        <div class="slider-head" style="margin-top:12px"><span class="lbl">Altitude (Z)</span><span class="val" id="ct-oz">${c.offsetZ}m</span></div>
        <input type="range" class="rng acc" min="0" max="30" step="0.5" value="${c.offsetZ}" oninput="A.setCommon('${layer.id}','offsetZ',this.value,'ct-oz','m')">
    </div>`;
}
function symLabelPanel(layer, sym) {
    const l = sym.label;
    return `<div class="section"><div class="toggle-row"><span class="tlabel">Afficher les étiquettes</span><div class="toggle ${l.enabled ? 'on' : ''}" onclick="A.toggleLabel('${layer.id}')" role="switch" tabindex="0" aria-checked="${!!l.enabled}" aria-label="Afficher les étiquettes"></div></div></div>
        ${l.enabled ? `<div class="section"><div class="section-title">Champ texte</div>${fieldSelect(layer, 'label', l.field, null)}</div>
        <div class="section">
            <div class="slider-head"><span class="lbl">Taille du texte</span><span class="val">${l.size ?? 12} px</span></div>
            <input type="range" class="rng acc" min="6" max="28" step="1" value="${l.size ?? 12}" oninput="A.setLabelSize('${layer.id}', this.value)">
            <div style="margin-top:8px"><label class="input-label">Couleur du texte</label>
                <input class="input" type="color" value="${l.color || '#2D2820'}" onchange="A.setLabelColor('${layer.id}', this.value)"></div>
        </div>` : ''}`;
}

// ---- Object inspector (selection) ----
function renderAttrFields(layer, props, opts = {}) {
    const readOnly = !!opts.readOnly;
    // Les colonnes internes de Grist ne sont pas des attributs. Les afficher
    // les rendait EDITABLES, et `manualSort` porte l'ordre des lignes : y taper
    // une valeur reordonne la table de l'utilisateur.
    const caches = ['geometry_json', 'latitude', 'longitude', 'fill_color', 'atlas_3d_json',
        ...COLONNES_INTERNES_GRIST];
    const fields = getLayerFields(layer).filter((f) => !caches.includes(f.id));
    if (!fields.length) return '<div class="hint">Aucun attribut.</div>';
    return fields.map((f) => {
        const val = props[f.id] ?? '';
        const esc = String(val).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const inputType = f.type === 'numeric' ? 'number' : 'text';
        if (readOnly) {
            return `<div class="section" style="margin-bottom:8px">
                <label class="input-label">${f.label || f.id}</label>
                <div class="input" style="opacity:.85;background:var(--surface-muted)">${esc || '—'}</div>
            </div>`;
        }
        return `<div class="section" style="margin-bottom:8px">
            <label class="input-label">${f.label || f.id}</label>
            <input class="input" type="${inputType}" value="${esc}"
                onchange="A.setFeatureAttr('${layer.id}', '${f.id.replace(/'/g, "\\'")}', this.value)">
        </div>`;
    }).join('');
}

/**
 * Monte le moteur de formulaire dans le corps de l'inspecteur d'objet.
 *
 * Le pont est passe explicitement : sans lui, le moteur retombe sur
 * `window.grist.docApi` et court-circuite le garde d'ecriture d'Atlas.
 */
/**
 * Vrai quand le moteur tient le corps du panneau.
 *
 * Le pied d'Atlas doit alors se taire : le moteur porte son propre bouton de
 * soumission, et deux « Enregistrer » dans le meme panneau feraient deux choses
 * differentes.
 *
 * Il vaut aussi quand l'onglet ne montre qu'un **message** — objet sans ligne
 * Grist, tous les champs masques. Le pied offrait alors « Enregistrer · 1
 * objet » sous une explication qui dit qu'il n'y a rien a enregistrer.
 */
let _formulaireMonte = false;

/**
 * L'en-tete d'une fiche qu'on ne peut pas editer, et la sortie quand il y en a une.
 *
 * Une couche importee (OSM, fichier) porte ses entites comme un blob dans
 * `Maquette_Layers` : aucun objet n'a de ligne Grist, donc rien a mettre a jour.
 * Le dire est necessaire ; s'arreter la ne l'est pas — `entableLayer` sait
 * exactement lever ce blocage.
 */
function enteteSansTable(layer, view) {
    const peut = peutPasserEnTable(layer, { lecture: !!view, grist: CONFIG.grist.ready });
    const msg = '<div class="hint" style="margin-bottom:10px">Attributs en lecture seule — '
        + 'les objets de cette couche ne sont pas des lignes Grist.</div>';
    if (!peut) return msg;
    const n = layer.geojson.features.length;
    return msg + `<button class="btn btn-soft btn-full" style="margin-bottom:12px"
        onclick="A.enregistrerDansGrist('${layer.id}')">Enregistrer en table Grist · ${n} objet${n > 1 ? 's' : ''}</button>`;
}

/**
 * Le passage en table, sur le panneau de la couche.
 *
 * Il n'existait que sur la fiche d'un objet : pour le trouver, il fallait
 * ouvrir « Éditer les objets un par un » sur une couche dont on ne pouvait
 * justement rien éditer. Constaté le 11/09/2026 dans un document vide : une
 * couche OSM importée, le bouton « Enregistrer » du pied pressé — qui
 * enregistre l'apparence, donc une copie dans `Maquette_Layers` —, et pas de
 * fiche, puisque rien n'avait de ligne. Le geste se pose désormais là où on
 * le cherche, tant que la couche n'est qu'une copie.
 */
function boutonEnTable(layer) {
    if (!peutPasserEnTable(layer, { lecture: CONFIG.viewMode, grist: CONFIG.grist.ready })) return '';
    const n = layer.geojson.features.length;
    return `<button class="btn btn-soft insp-act insp-act-pleine"
        onclick="A.enregistrerDansGrist('${layer.id}')">Enregistrer en table Grist · ${n} objet${n > 1 ? 's' : ''}${infoBulle('Copie dans le document : ses objets n’ont pas de ligne Grist, donc pas de fiche à remplir.')}</button>`;
}

/**
 * En revue, la selection porte toute la couche : sans ce rappel, on croirait
 * modifier les N objets alors qu'on n'ecrit que sur celui du curseur.
 *
 * Il valait pour le formulaire et pas pour le repli, alors que le risque de
 * malentendu est le meme des deux cotes — c'est la selection qui le cree, pas
 * la maniere dont les champs sont rendus.
 */
function rappelRevue(totalRevue) {
    if (!(totalRevue > 1)) return '';
    // Le rang compte les objets qu'on voit : un filtre de contexte en écarte, la revue les saute.
    const { rang, total } = rangRevue(STATE.layers.find((l) => l.id === STATE.selection.layerId));
    return `<div class="hint" style="margin-bottom:10px">Objet ${rang} sur ${total} — vous modifiez celui-ci.</div>`;
}

/**
 * Monte un formulaire dans la fiche.
 *
 * Il prend l'entree entiere et non sa seule definition, parce que `principal`
 * et `via` decident du mode : corriger la ligne cliquee, ou en ajouter une qui
 * la reference. Le pont en tire tout le reste.
 */
function monterFormulaireEntite(layer, props, formulaire, totalRevue = 0, saisieTerrain = false) {
    // Le cadrage se pose ICI, sur la definition remise au moteur, et nulle part
    // ailleurs : c'est le seul point ou un formulaire atteint FormEngine, donc
    // le seul ou un masque puisse etre a la fois complet et sans effet de bord.
    // Le masquer dans le DOM aurait laisse `validateRequired` reclamer un champ
    // invisible, et `collectSubmitData` l'ecrire quand meme.
    const formDef = formDefCadre(formulaire.def, formulaire.masques);
    const hote = $('insp-body');
    hote.innerHTML = rappelRevue(totalRevue);
    // > **Le drapeau se leve des que cet onglet tient le corps du panneau**, y
    // > compris quand il n'y montre qu'un message. Sinon le pied d'Atlas offre
    // > « Enregistrer · 1 objet » sous une explication qui dit justement qu'il
    // > n'y a rien a enregistrer — et ce bouton-la ecrit par `applySelected`,
    // > un chemin different de celui du formulaire. C'est le « deux Enregistrer
    // > qui font deux choses » que ce drapeau existe pour empecher.
    const rowId = props?._row_id;
    if (rowId == null) {
        hote.innerHTML = '<div class="hint">Objet sans ligne Grist — formulaire indisponible.</div>';
        _formulaireMonte = true;
        return;
    }
    // Tout masquer est un reglage possible, pas une erreur — mais le moteur
    // dirait « Aucune section visible », ce qui envoie chercher une condition
    // qui n'existe pas. On nomme la vraie cause.
    if (!nbChampsDef(formDef)) {
        hote.innerHTML = '<div class="hint">Tous les champs de ce formulaire sont masqués pour cette scène.</div>';
        _formulaireMonte = true;
        return;
    }
    // > **« Étape 1 sur 1 » ne renseigne rien**, et coûte 60 px mesurés sur les
    // > 360 du panneau. Le moteur rend son fil d'étapes sans condition — c'est
    // > juste, il ne sait pas où il est monté. Atlas, lui, sait combien de
    // > sections il remet : il pose la classe, la peau se tait. La decision est
    // > donc la ou l'information se trouve, et le style la ou il se decrit.
    hote.classList.toggle('forme-mono-etape', (formDef.sections || []).length <= 1);
    const bloc = document.createElement('div');
    hote.appendChild(bloc);
    let notePrerempli = null;
    const monter = (valeursDepart, preremplis = []) => {
        // La fiche a pu changer d'objet pendant la préparation.
        if (!bloc.isConnected) return;
        if (preremplis.length) {
            notePrerempli = document.createElement('div');
            notePrerempli.className = 'releve-prerempli';
            notePrerempli.textContent = phrasePreremplis(preremplis);
            bloc.before(notePrerempli);
        }
        window.FormEngine.mount(bloc, formDef,
            pontFormulaire({
                couche: layer,
                rowId,
                docApi: grist.docApi,
                formulaire,
                // Les valeurs de la ligne entrent par le pont, donc avant le
                // premier rendu. Les poser dans le DOM apres le montage ne
                // couvrait que l'etape affichee : sur un formulaire en deux
                // temps, le choix « Bon » restait decoche a l'etape 2 alors que
                // la ligne le portait.
                //
                // Un formulaire LIE part vide : il cree une ligne qui n'existe
                // pas encore, et la prealimenter avec les attributs du batiment
                // ecrirait ceux-la dans la table des visites.
                valeurs: valeursDepart,
                // `saisieTerrain` porte deja `peutSaisir` parmi ses conditions :
                // le repeter ici ecrirait la meme regle a deux endroits.
                peutEcrire: () => canWrite(CONFIG.viewMode) || saisieTerrain,
                signaler: (msg, ok) => showToast(msg, ok ? 'success' : 'error'),
                // Relit la couche depuis sa table : la carte doit montrer ce
                // qui vient d'etre ecrit, sinon on doute de l'enregistrement.
                // Un formulaire lie n'a rien change a la couche — il a ecrit
                // ailleurs — donc rien a relire.
                //
                // Un relevé lié, lui, change ce que la couche calcule souvent
                // depuis ses visites (état, nombre, dernière date) : la carte et
                // la bulle se relisent aussi, sinon le terrain ne voit pas sa
                // visite. Ce qui doit partir de la dernière saisie est retenu.
                apresEcriture: formulaire.surLaCouche
                    ? () => { A.refreshLayer(layer.id); }
                    : (_id, data) => {
                        // Envoyé : « Vérifiez avant d'envoyer » n'a plus lieu d'être.
                        notePrerempli?.remove();
                        retenirSaisie(formulaire, data);
                        _lignesReference.delete(formulaire.tableId);
                        // En silence : « Relevé ajouté » suffit à l'écran.
                        if (isLinkedTableLayer(layer)) relireCouche(layer, lignesSelectionnees(layer)).catch(() => {});
                    },
            }));
    };
    const echec = (e) => {
        console.error('[Atlas formulaire] mount', e);
        hote.innerHTML = `<div class="hint">Formulaire indisponible : ${escapeHtml(e.message)}</div>`;
    };
    _formulaireMonte = true;
    try {
        if (formulaire.surLaCouche) {
            monter(valeursPourMoteur(formDef, props));
        } else {
            // Un relevé part de ses valeurs de départ (date du jour, dernière
            // saisie…), qui peuvent demander une lecture : on la fait avant le
            // premier rendu, parce que le moteur ne relit pas ses valeurs.
            bloc.innerHTML = '<div class="hint">Préparation du relevé…</div>';
            departsDuReleve(formulaire, formDef, rowId)
                .catch(() => ({ valeurs: {}, preremplis: [] }))
                .then(({ valeurs, preremplis }) => {
                    if (!bloc.isConnected) return;
                    bloc.innerHTML = '';
                    try { monter(valeurs, preremplis); } catch (e) { echec(e); }
                });
        }
    } catch (e) {
        echec(e);
    }
}

/**
 * Les valeurs de départ d'un relevé, depuis les réglages de la scène.
 * Rien n'est lu si rien n'est demandé.
 */
async function departsDuReleve(formulaire, formDef, rowId) {
    const departs = formulaire.departs || {};
    const voulus = new Set(Object.values(departs));
    let precedentes = null;
    let derniere = null;
    if (voulus.has('precedente')) precedentes = await saisiesRetenues(formulaire.id);
    if (voulus.has('reprise') && formulaire.via) {
        const lignes = await lignesDeTable(formulaire.tableId);
        const date = colonneDate(STATE.schema?.[formulaire.tableId] || []);
        derniere = date ? derniereLigneLiee(lignes, formulaire.via, rowId, date) : null;
        if (!date) {
            // Sans date, la plus récente est la dernière créée.
            for (const l of lignes) {
                const ref = Array.isArray(l[formulaire.via]) ? l[formulaire.via][1] : l[formulaire.via];
                if (Number(ref) === Number(rowId) && (!derniere || l.id > derniere.id)) derniere = l;
            }
        }
    }
    // « Moi » : la ligne de la personne connectée dans la table des personnes que le champ désigne.
    let moi = null;
    if (voulus.has('moi') && CONFIG.grist.user?.email) {
        const champs = (formDef?.sections || []).flatMap((s) => s.fields || []);
        const parChamp = {};
        for (const [colId, d] of Object.entries(departs)) {
            if (d !== 'moi') continue;
            const m = /^Ref(List)?:(.+)$/.exec(String(champs.find((c) => c.colId === colId)?.type || ''));
            if (!m) continue;
            const id = moiDansTable(STATE.schema?.[m[2]] || [], await lignesDeTable(m[2]), CONFIG.grist.user.email);
            if (id != null) parChamp[colId] = m[1] ? ['L', id] : id;
        }
        moi = (champ) => parChamp[champ.colId];
    }
    return sansValeursPerimees(formDef, valeursDeDepart(formDef, departs, { precedentes, derniere, moi }));
}

/**
 * Une valeur reprise d'avant ne vaut que si elle existe encore : l'agent
 * déclaré hier a pu être supprimé, un choix retiré de la liste. Le moteur
 * l'enverrait quand même, et le champ n'afficherait rien de choisi : une
 * référence pendante écrite sans que personne la voie.
 */
async function sansValeursPerimees(formDef, resultat) {
    const valeurs = { ...resultat.valeurs };
    for (const c of (formDef?.sections || []).flatMap((s) => s.fields || [])) {
        if (!(c.colId in valeurs)) continue;
        let permis = null;
        if (c.options?.refTable) {
            try { permis = new Set((await lignesDeTable(c.options.refTable)).map((l) => String(l.id))); } catch (_) { continue; }
        } else if (Array.isArray(c.options?.choices) && c.options.choices.length) {
            permis = new Set(c.options.choices.map((o) => String(o && typeof o === 'object' ? o.value : o)));
        }
        if (!permis) continue;
        const v = valeurs[c.colId];
        const garde = Array.isArray(v) ? v.filter((x) => permis.has(String(x))) : (permis.has(String(v)) ? v : null);
        if (garde == null || (Array.isArray(garde) && !garde.length)) delete valeurs[c.colId];
        else valeurs[c.colId] = garde;
    }
    return { valeurs, preremplis: resultat.preremplis.filter((p) => p.colId in valeurs) };
}

/**
 * La dernière saisie d'un formulaire, sur cet appareil et pour ce document.
 * Une commodité locale : absente, effacée ou refusée, le champ part vide.
 */
let _idDocumentLocal = null;
/**
 * L'identifiant du document — pas son nom : deux documents de même nom, sous la
 * même origine de widget, partageraient leurs dernières saisies, et des
 * identifiants de référence de l'un seraient préremplis dans l'autre. Dans le
 * widget il vient du jeton ; dans l'application, de la connexion.
 */
async function idDuDocumentLocal() {
    if (_idDocumentLocal) return _idDocumentLocal;
    try {
        const tok = await grist.docApi.getAccessToken({ readOnly: true });
        const id = decodeAccessToken(tok?.token)?.docId;
        if (id) return (_idDocumentLocal = String(id));
    } catch (_) { /* application : pas de jeton */ }
    try { return (_idDocumentLocal = String((await grist.docApi.getDocName?.()) || '')); } catch (_) { return ''; }
}
async function cleSaisies(formId) {
    return `atlas_saisies|${await idDuDocumentLocal()}|${formId}`;
}
async function saisiesRetenues(formId) {
    try { return JSON.parse(localStorage.getItem(await cleSaisies(formId)) || 'null'); } catch (_) { return null; }
}
async function retenirSaisie(formulaire, data) {
    const garde = aRetenir(data, formulaire.departs);
    if (!Object.keys(garde).length) return;
    try { localStorage.setItem(await cleSaisies(formulaire.id), JSON.stringify(garde)); } catch (_) { /* stockage refusé */ }
}

/**
 * Cette couche se saisit-elle hors edition ?
 *
 * Deux endroits ont besoin de la reponse — le clic sur la carte, qui choisit
 * entre le popup et la fiche, et la fiche elle-meme, qui choisit entre montrer
 * et laisser ecrire. La regle, elle, n'existe qu'une fois : `saisieHorsEdition`.
 *
 * @param {object} layer
 * @param {{entree?: object|null}} [opts] l'entree deja resolue, si l'appelant l'a
 */
function coucheEnSaisie(layer, opts = {}) {
    if (!layer) return false;
    return saisieHorsEdition({
        view: !!CONFIG.viewMode,
        aDesLignes: coucheAvecLignes(layer),
        peutEcrire: CONFIG.peutSaisir,
        formulaires: (opts.formulaires || formulairesDeLaCouche(layer)).filter(formulaireUtilisable),
        moteur: moteurDisponible(),
    });
}

// ============================================================
// CRÉER UN OBJET — lots 2 et 3 de l'édition géométrique
// ============================================================
// Poser la forme, remplir la fiche, écrire UNE ligne. La fiche passe avant
// l'écriture : une ligne n'existe jamais avant que ses obligatoires soient
// tenus, et « Abandonner » n'a rien à défaire. Tant qu'une création est en
// cours, elle possède les clics sur la carte : c'est un état exclusif, qui
// annule à l'entrée le choix d'un lieu, d'un trajet et la sélection.
//
// Un point se pose au clic. Une ligne ou une surface se trace avec terra-draw,
// chargé au premier tracé seulement : c'est le moteur, l'interface reste celle
// d'Atlas (panneau droit, boutons, mesures, accroche aux autres couches).

/** La création en cours, ou `null`. */
let _saisieObjet = null;
/** Le dernier objet créé, tant qu'il reste sélectionné : on peut encore le défaire. */
let _derniereCreation = null;
/** La dernière forme modifiée, avec ses cellules d'origine, tant que l'objet reste sélectionné. */
let _derniereModification = null;
const SAISIE_SOURCE = 'atlas-saisie';
const COULEUR_TRACE = '#C44536';

function dessinerSaisie() {
    if (!map) return;
    const g = _saisieObjet?.geometrie;
    const data = { type: 'FeatureCollection', features: g ? [{ type: 'Feature', geometry: g, properties: {} }] : [] };
    const src = map.getSource(SAISIE_SOURCE);
    if (src) src.setData(data);
    else map.addSource(SAISIE_SOURCE, optionsSourceGeojson(data));
    if (!map.getLayer(SAISIE_SOURCE)) {
        map.addLayer({
            id: SAISIE_SOURCE, type: 'circle', source: SAISIE_SOURCE,
            paint: { 'circle-radius': 8, 'circle-color': COULEUR_TRACE, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 },
        });
    } else {
        map.moveLayer(SAISIE_SOURCE);
    }
}

function effacerSaisie() {
    if (!map) return;
    if (map.getLayer(SAISIE_SOURCE)) map.removeLayer(SAISIE_SOURCE);
    if (map.getSource(SAISIE_SOURCE)) map.removeSource(SAISIE_SOURCE);
}

/** terra-draw et son adaptateur, chargés une fois, au premier tracé. */
let _traceur = null;
function chargerTraceur() {
    if (!_traceur) {
        _traceur = Promise.all([import('terra-draw'), import('terra-draw-maplibre-gl-adapter')])
            .then(([td, ad]) => ({ ...td, Adapter: ad.TerraDrawMapLibreGLAdapter }))
            .catch((e) => { _traceur = null; throw e; });
    }
    return _traceur;
}

/**
 * L'accroche aux objets des couches visibles (Alt maintenu la suspend).
 *
 * Les formes viennent de `layer.geojson`, retrouvées par `_idx` : les
 * géométries rendues par MapLibre sont découpées aux bords des tuiles, et
 * s'y accrocher poserait des sommets qui n'existent pas dans la donnée.
 */
function accrocheAtlas(ev) {
    if (!map || ev?.heldKeys?.includes('Alt')) return undefined;
    const tol = surTelephone() ? 18 : 10;
    const ids = hitLayerIds();
    if (!ids.length) return undefined;
    const box = [[ev.containerX - tol, ev.containerY - tol], [ev.containerX + tol, ev.containerY + tol]];
    const geoms = [];
    const vues = new Set();
    for (const f of map.queryRenderedFeatures(box, { layers: ids })) {
        const layer = coucheDuRendu(f.layer.id);
        const idx = f.properties?._idx;
        if (!layer || idx == null || vues.has(`${layer.id}:${idx}`)) continue;
        vues.add(`${layer.id}:${idx}`);
        const g = layer.geojson?.features?.[idx]?.geometry;
        if (g) geoms.push(g);
    }
    const r = pointAccroche({ x: ev.containerX, y: ev.containerY }, geoms, (c) => map.project(c), tol);
    return r ? r.coordonnee : undefined;
}

/** Arme terra-draw sur la carte pour une couche de lignes ou de surfaces. */
async function demarrerTrace(s, layer) {
    let lib;
    try {
        lib = await chargerTraceur();
    } catch (e) {
        quitterSaisieObjet();
        showToast('L’outil de tracé n’a pas pu se charger : ' + e.message, 'error');
        return;
    }
    if (_saisieObjet !== s) return;   // abandonné pendant le chargement
    const famille = familleGeometrie(layer.geometryType);
    const commun = {
        snapping: { toCoordinate: true, toCustom: accrocheAtlas },
        // Échap reste à Atlas : il abandonne la création entière, avec son message.
        keyEvents: { cancel: null, finish: 'Enter' },
        pointerDistance: surTelephone() ? 22 : 10,
        showCoordinatePoints: true,
    };
    const poignees = {
        closingPointColor: '#FFFFFF', closingPointOutlineColor: COULEUR_TRACE, closingPointWidth: 6, closingPointOutlineWidth: 2,
        snappingPointColor: '#1F6FEB', snappingPointOutlineColor: '#FFFFFF', snappingPointWidth: 6, snappingPointOutlineWidth: 2,
        coordinatePointColor: COULEUR_TRACE, coordinatePointOutlineColor: '#FFFFFF', coordinatePointWidth: 4, coordinatePointOutlineWidth: 1,
    };
    const mode = famille === 'Polygon'
        ? new lib.TerraDrawPolygonMode({
            ...commun,
            // Un sommet qui ferait se recouper le contour n'est pas posé — et on
            // le dit : sans message, le clic semblait simplement ignoré
            // (constaté le 26/09/2026).
            validation: (f, ctx) => {
                if (ctx?.updateType !== 'commit' && ctx?.updateType !== 'finish') return { valid: true };
                const r = lib.ValidateNotSelfIntersecting(f);
                if (!r.valid) signalerRecoupe();
                return r;
            },
            styles: { fillColor: COULEUR_TRACE, fillOpacity: 0.18, outlineColor: COULEUR_TRACE, outlineWidth: 3, ...poignees },
        })
        : new lib.TerraDrawLineStringMode({
            ...commun,
            styles: { lineStringColor: COULEUR_TRACE, lineStringWidth: 3, ...poignees },
        });
    // Modifier une forme passe par le mode sélection de terra-draw : sommets à
    // glisser, points milieux pour en insérer, clic droit pour en retirer,
    // l'objet entier à glisser. Suppr ne supprime rien ici : supprimer un objet
    // est un autre geste, avec sa confirmation (lot 5).
    const modes = [mode];
    let selection = null;
    if (s.modification) {
        selection = new lib.TerraDrawSelectMode({
            pointerDistance: commun.pointerDistance,
            allowManualDeselection: false,
            keyEvents: { deselect: null, delete: null, rotate: null, scale: null },
            flags: {
                [mode.mode]: {
                    feature: {
                        draggable: true,
                        selfIntersectable: famille !== 'Polygon',
                        coordinates: {
                            draggable: true,
                            midpoints: true,
                            deletable: true,
                            snappable: { toCustom: accrocheAtlas },
                        },
                    },
                },
            },
            styles: {
                selectedLineStringColor: COULEUR_TRACE, selectedLineStringWidth: 3,
                selectedPolygonColor: COULEUR_TRACE, selectedPolygonFillOpacity: 0.18,
                selectedPolygonOutlineColor: COULEUR_TRACE, selectedPolygonOutlineWidth: 3,
                selectionPointColor: '#FFFFFF', selectionPointOutlineColor: COULEUR_TRACE,
                selectionPointWidth: 6, selectionPointOutlineWidth: 2,
                midPointColor: COULEUR_TRACE, midPointOutlineColor: '#FFFFFF', midPointWidth: 4, midPointOutlineWidth: 1,
            },
        });
        modes.push(selection);
    }
    const draw = new lib.TerraDraw({
        adapter: new lib.Adapter({ map, coordinatePrecision: 7, prefixId: 'atlas-dessin' }),
        modes,
        undoRedo: s.modification
            ? { sessionLevel: new lib.TerraDrawSessionUndoRedo() }
            : { modeLevel: new lib.TerraDrawModeUndoRedo() },
    });
    draw.on('change', () => majMesuresTrace());
    if (!s.modification) draw.on('finish', (id) => finTrace(id));
    draw.start();
    // Un double-clic termine une ligne dans bien des outils ; ici il zoomerait.
    s.trace = { draw, mode, famille, zoomDouble: map.doubleClickZoom.isEnabled() };
    map.doubleClickZoom.disable();
    if (s.modification) {
        const depart = s.modification.depart;
        const [r] = draw.addFeatures([{ type: 'Feature', geometry: depart, properties: { mode: mode.mode } }]);
        if (!r?.valid || r.id == null) {
            quitterSaisieObjet();
            showToast('Cette forme ne peut pas s’ouvrir dans l’éditeur' + (r?.reason ? ` : ${r.reason}` : ''), 'error');
            return;
        }
        s.trace.featureId = r.id;
        draw.selectFeature(r.id, selection.mode);
        draw.clearUndoRedoHistory();
    } else {
        draw.setMode(mode.mode);
    }
    renderSaisieObjet();
}

let _derniereRecoupe = 0;
function signalerRecoupe() {
    const t = Date.now();
    if (t - _derniereRecoupe < 1500) return;
    _derniereRecoupe = t;
    showToast('Ce sommet ferait se recouper le contour : il n’est pas posé', 'warning');
}

function arreterTrace(s) {
    if (!s?.trace) return;
    try { s.trace.draw.stop(); } catch (e) { console.warn('[Atlas tracé] arrêt', e.message); }
    if (s.trace.zoomDouble && map) map.doubleClickZoom.enable();
    s.trace = null;
}

/**
 * La forme en cours de tracé, sommets posés seulement.
 *
 * Pendant le tracé, terra-draw ajoute un sommet provisoire qui suit le
 * curseur : l'en-tête comptait « 4 sommets » pour trois clics (constaté le
 * 26/09/2026). On le retire, et les mesures disent ce qui est posé.
 */
function formeEnCours(s) {
    if (!s?.trace) return null;
    // En modification, l'objet édité est connu par son identifiant : les
    // poignées de sommets et les points milieux sont aussi dans le lot.
    if (s.trace.featureId != null) return s.trace.draw.getSnapshotFeature(s.trace.featureId)?.geometry || null;
    const feats = s.trace.draw.getSnapshot() || [];
    const g = feats.filter((f) => f.geometry?.type === s.trace.famille).pop()?.geometry || null;
    if (!g || s.trace.mode.state !== 'drawing') return g;
    if (g.type === 'LineString') return { type: 'LineString', coordinates: g.coordinates.slice(0, -1) };
    const anneau = g.coordinates?.[0] || [];
    // Anneau en cours : sommets posés, sommet provisoire, puis retour au premier.
    if (anneau.length < 3) return g;
    return { type: 'Polygon', coordinates: [[...anneau.slice(0, -2), anneau[0]]] };
}

function majMesuresTrace() {
    const s = _saisieObjet;
    if (!s?.trace || s.geometrie) return;
    const sub = document.querySelector('#insp-head .insp-sub');
    if (sub) sub.textContent = libelleMesures(mesurerGeometrie(formeEnCours(s)), s.trace.famille);
    const sortie = $('saisie-sortie');
    if (sortie) sortie.textContent = libelleSortie(s);
}

function finTrace(id) {
    const s = _saisieObjet;
    const layer = STATE.layers.find((l) => l.id === s?.layerId);
    if (!s?.trace || !layer) return;
    const f = s.trace.draw.getSnapshotFeature(id);
    const v = formeValidee(f?.geometry, layer.geometryType);
    if (!v.ok) {
        showToast(v.erreur, 'warning');
        s.trace.draw.removeFeatures([id]);
        return;
    }
    const cellules = cellulesPourCouche(layer, v.geometrie);
    if (!cellules) { showToast('Cette forme ne peut pas s’écrire dans les colonnes de la couche.', 'error'); return; }
    s.geometrie = v.geometrie;
    s.creation.cellules = cellules;
    // La forme reste affichée, et un nouveau clic ne commence pas un second tracé.
    s.trace.draw.setMode('static');
    renderSaisieObjet();
    ficheCedee = false;
    openInspectorPanel();
}

/** Ce que `creationPossible` doit savoir de la situation : posture, et ce que le document accepte pour cette table. */
function contexteCreation(layer) {
    return {
        viewMode: !!CONFIG.viewMode,
        peutEcrire: canWrite(CONFIG.viewMode),
        exploitation: postureDepuis(CONFIG) === 'exploiter',
        verdictTable: layer?.sourceTable ? DROITS.verdict(layer.sourceTable) : 'inconnu',
    };
}

function boutonNouvelObjet(layer) {
    if (!creationPossible(layer, contexteCreation(layer)).ok) return '';
    const propose = creationProposeeEnExploitation(layer);
    const reglage = CONFIG.viewMode ? '' : `<label class="insp-act-reglage">
        <input type="checkbox" ${propose ? 'checked' : ''} onchange="A.setCreationExploiter('${layer.id}', this.checked)">
        <span>Ajout possible aussi en <b>Exploiter</b>${infoBulle('Les agents peuvent ajouter un objet sur le terrain. Le document décide toujours : sans droit d’écriture sur la table, le bouton n’apparaît pas.')}</span></label>`;
    return `<button class="btn btn-soft insp-act" onclick="A.nouvelObjet('${layer.id}')">${icTrait(IC.plus, 16)} Nouvel objet</button>${reglage}`;
}

function quitterSaisieObjet(message) {
    const s = _saisieObjet;
    const layer = STATE.layers.find((l) => l.id === s?.layerId);
    arreterTrace(s);
    _saisieObjet = null;
    effacerSaisie();
    document.body.classList.remove('mode-creation');
    if (map) map.getCanvas().style.cursor = '';
    if (s?.modification && layer) {
        // L'objet était retiré de la carte pendant l'édition : il revient tel
        // qu'il était, et sa fiche se rouvre là où on l'avait laissée.
        syncLayerSourceData(layer);
        const [idx] = rangsDepuisRowIds(layer.geojson?.features, [s.modification.rowId]);
        if (idx != null) enterSelectionMode(layer.id, idx);
        else renderInspector();
    } else {
        renderInspector();
    }
    if (message) showToast(message, 'info');
}

/** Le message d'abandon, selon ce qu'on abandonnait. */
function messageAbandon() {
    const s = _saisieObjet;
    if (s?.modification) return 'Modification abandonnée — la forme d’origine est gardée';
    if (s?.serie > 0) {
        const n = s.serie;
        const deja = `${n} objet${n > 1 ? 's' : ''} créé${n > 1 ? 's' : ''}`;
        return s.geometrie || formeEnCours(s) ? `Objet en cours abandonné — ${deja}, gardé${n > 1 ? 's' : ''}` : `Série terminée — ${deja}`;
    }
    return 'Création abandonnée — rien n’a été écrit';
}

/** « Abandonner » quand il y a quelque chose à perdre, « Terminer » quand la série est à jour. */
function libelleSortie(s) {
    return s?.serie > 0 && !s.geometrie && !formeEnCours(s) ? 'Terminer la série' : 'Abandonner';
}

/** L'objet en cours de modification ne s'affiche pas deux fois : il est dans l'éditeur. */
function objetEnModification(layer) {
    const s = _saisieObjet;
    return s?.modification && s.layerId === layer?.id ? s.modification.rowId : null;
}

/** Clic sur la carte pendant une création de point. Un tracé, lui, écoute terra-draw. */
function onSaisieClic(e) {
    const s = _saisieObjet;
    const layer = STATE.layers.find((l) => l.id === s?.layerId);
    if (!layer) { quitterSaisieObjet(); return; }
    if (familleGeometrie(layer.geometryType) !== 'Point') return;
    const p = pointDepuisClic(e.lngLat);
    if (!p.ok) { showToast(p.erreur, 'warning'); return; }
    const cellules = cellulesPourCouche(layer, p.geometrie);
    if (!cellules) { showToast('Ce point ne peut pas s’écrire dans les colonnes de la couche.', 'error'); return; }
    s.geometrie = p.geometrie;
    // Le pont lit les cellules au moment de l'envoi : un second clic déplace
    // le point sans remonter la fiche, donc sans perdre ce qui y est saisi.
    s.creation.cellules = cellules;
    dessinerSaisie();
    renderSaisieObjet();
    ficheCedee = false;
    openInspectorPanel();
}

const CONSIGNES_SAISIE = {
    Point: 'Cliquez sur la carte pour placer le point.',
    LineString: 'Cliquez pour poser chaque sommet, puis « Terminer » ou Entrée. Les sommets s’accrochent aux objets proches — Alt maintenu pour l’éviter.',
    Polygon: 'Cliquez pour poser chaque sommet ; cliquez le premier sommet, « Terminer » ou Entrée pour fermer la surface. Les sommets s’accrochent aux objets proches — Alt maintenu pour l’éviter.',
};

/**
 * Le panneau de création. Idempotent : `renderInspector` le rappelle à chaque
 * changement de module, et remonter la fiche effacerait la saisie.
 */
function renderSaisieObjet() {
    const s = _saisieObjet;
    const layer = STATE.layers.find((l) => l.id === s?.layerId);
    if (!layer) { quitterSaisieObjet(); return; }
    const famille = familleGeometrie(layer.geometryType);
    if (s.modification) { renderModificationForme(s, layer, famille); return; }
    const g = s.geometrie;
    let sous;
    if (famille === 'Point') sous = g ? libellePoint(g) : `Point · table ${escapeHtml(layer.sourceTable)}`;
    else sous = libelleMesures(mesurerGeometrie(g || formeEnCours(s)), famille);
    $('insp-head').innerHTML = `
        <div class="insp-eyebrow"><span class="layer-swatch" style="background:${fondPastilleCouche(layer)}"></span>${escapeHtml(layer.name)}</div>
        <div class="insp-title">Nouvel objet</div>
        <div class="insp-sub">${sous}</div>
        ${bandeauSerie(s)}`;
    $('insp-tabs').innerHTML = '';
    const abandonner = `<button class="btn btn-soft" style="flex:1" id="saisie-sortie" onclick="A.abandonnerSaisieObjet()">${libelleSortie(s)}</button>`;
    let outils = '';
    if (famille !== 'Point') {
        outils = g
            ? `<button class="btn btn-soft" style="flex:1" onclick="A.retracerSaisieObjet()">Retracer</button>`
            : `<button class="btn btn-soft" style="flex:1" onclick="A.sommetPrecedent()" title="Retirer le dernier sommet posé">Sommet précédent</button>`
              + `<button class="btn btn-dark" style="flex:1" onclick="A.terminerTrace()">Terminer</button>`;
    }
    const hote = $('insp-body');
    const ficheEnPlace = s.formulaireMonte && hote.dataset.saisie === s.jeton;
    if (!g) {
        // Retracer garde la fiche déjà remplie : seule la forme recommence.
        if (ficheEnPlace) {
            const r = $('saisie-rappel');
            if (r) r.textContent = CONSIGNES_SAISIE[famille] || CONSIGNES_SAISIE.Point;
        } else {
            hote.innerHTML = `<div class="hint">${CONSIGNES_SAISIE[famille] || CONSIGNES_SAISIE.Point} Rien n'est écrit dans Grist avant l'envoi de la fiche.</div>`
                + (famille !== 'Point' && !s.trace ? '<div class="hint" style="margin-top:8px">Chargement de l’outil de tracé…</div>' : '');
        }
        $('insp-foot').innerHTML = abandonner + outils;
        return;
    }
    if (ficheEnPlace) {
        const r = $('saisie-rappel');
        if (r) r.textContent = famille === 'Point'
            ? 'Cliquez ailleurs sur la carte pour déplacer le point.'
            : 'Forme prête. « Retracer » la recommence sans vider la fiche.';
        if (!s.repli) $('insp-foot').innerHTML = abandonner + outils;
        else $('insp-foot').innerHTML = abandonner + outils + boutonEnregistrerRepli();
        return;
    }
    const rappel = famille === 'Point'
        ? `<div class="hint" id="saisie-rappel" style="margin-bottom:10px">Cliquez ailleurs sur la carte pour déplacer le point.</div>`
        : `<div class="hint" id="saisie-rappel" style="margin-bottom:10px">Forme prête. « Retracer » la recommence sans vider la fiche.</div>`;
    const formulaire = formulairesDeLaCouche(layer).find((f) => f.surLaCouche !== false && f.def) || null;
    const formDef = formulaire ? formDefCadre(formulaire.def, formulaire.masques) : null;
    if (formDef && nbChampsDef(formDef) && moteurDisponible()) {
        hote.innerHTML = rappel;
        hote.dataset.saisie = s.jeton;
        hote.classList.toggle('forme-mono-etape', (formDef.sections || []).length <= 1);
        try {
            const bloc = document.createElement('div');
            hote.appendChild(bloc);
            window.FormEngine.mount(bloc, formDef, pontFormulaire({
                couche: layer,
                docApi: grist.docApi,
                formulaire,
                valeurs: {},
                creation: s.creation,
                peutEcrire: () => canWrite(CONFIG.viewMode),
                signaler: (msg, ok) => showToast(msg, ok ? 'success' : 'error'),
                apresEcriture: (rowId) => { apresCreationObjet(layer, rowId); },
            }));
            s.formulaireMonte = true;
            $('insp-foot').innerHTML = abandonner + outils;
            return;
        } catch (e) {
            console.error('[Atlas création] mount', e);
        }
    }
    // Repli sans moteur de formulaire : la forme et son nom, s'il a une colonne.
    const aNom = (STATE.schema?.[layer.sourceTable] || []).some((c) => c.colId === 'nom');
    hote.innerHTML = rappel
        + (aNom ? `<label class="input-label" for="saisie-nom">Nom</label><input class="input" id="saisie-nom" maxlength="200">` : '')
        + `<div class="hint" style="margin-top:10px">Les autres champs se saisiront dans la fiche de l'objet, une fois créé.</div>`;
    hote.dataset.saisie = s.jeton;
    s.formulaireMonte = true;
    s.repli = true;
    $('insp-foot').innerHTML = abandonner + outils + boutonEnregistrerRepli();
}

const CONSIGNES_MODIFICATION = {
    Point: 'Cliquez sur la carte à la nouvelle position du point.',
    LineString: 'Glissez un sommet pour le déplacer, un point milieu pour en insérer un ; clic droit sur un sommet pour le retirer ; glissez la ligne pour la déplacer entière. Les sommets s’accrochent aux objets proches.',
    Polygon: 'Glissez un sommet pour le déplacer, un point milieu pour en insérer un ; clic droit sur un sommet pour le retirer ; glissez la surface pour la déplacer entière. Les sommets s’accrochent aux objets proches.',
};

/** Le panneau de modification de forme : ni fiche ni attributs, la forme seule. */
function renderModificationForme(s, layer, famille) {
    const g = famille === 'Point' ? s.geometrie : formeEnCours(s);
    const sous = famille === 'Point' ? libellePoint(g) : libelleMesures(mesurerGeometrie(g), famille);
    $('insp-head').innerHTML = `
        <div class="insp-eyebrow"><span class="layer-swatch" style="background:${fondPastilleCouche(layer)}"></span>${escapeHtml(layer.name)}</div>
        <div class="insp-title">Modifier la forme</div>
        <div class="insp-sub">${sous}</div>`;
    $('insp-tabs').innerHTML = '';
    $('insp-body').innerHTML = `
        <div class="hint">${CONSIGNES_MODIFICATION[famille] || CONSIGNES_MODIFICATION.Point}</div>
        <div class="hint" style="margin-top:8px">Seule la forme sera écrite dans <strong>${escapeHtml(layer.sourceTable)}</strong> ; les attributs ne changent pas.</div>
        ${famille !== 'Point' && !s.trace ? '<div class="hint" style="margin-top:8px">Chargement de l’outil de tracé…</div>' : ''}`;
    delete $('insp-body').dataset.saisie;
    $('insp-foot').innerHTML = `<button class="btn btn-soft" style="flex:1" onclick="A.abandonnerSaisieObjet()">Abandonner</button>`
        + (famille !== 'Point' ? `<button class="btn btn-soft" style="flex:1" onclick="A.gestePrecedent()" title="Défait le dernier déplacement, ajout ou retrait de sommet">Annuler le geste</button>` : '')
        + `<button class="btn btn-dark" style="flex:2" id="forme-enregistrer" onclick="A.enregistrerForme()">Enregistrer la forme</button>`;
}

/**
 * Fin d'une modification : relire la couche, rouvrir la fiche de l'objet, et
 * garder de quoi défaire l'écriture tant qu'il reste sélectionné.
 */
async function terminerModification(layer, rowId, annulable) {
    arreterTrace(_saisieObjet);
    _saisieObjet = null;
    effacerSaisie();
    document.body.classList.remove('mode-creation');
    if (map) map.getCanvas().style.cursor = '';
    try {
        await relireCouche(layer);
    } catch (e) {
        syncLayerSourceData(layer);
        showToast('Forme enregistrée, mais la couche n’a pas pu être relue : ' + e.message, 'warning');
    }
    const [idx] = rangsDepuisRowIds(layer.geojson?.features, [rowId]);
    if (idx != null) {
        enterSelectionMode(layer.id, idx);
        if (annulable) _derniereModification = { layerId: layer.id, rowId, ...annulable };
        renderInspector();
    } else {
        renderInspector();
    }
}

function boutonModifierForme(layer, feature) {
    if (!modificationPossible(layer, feature, { viewMode: !!CONFIG.viewMode, peutEcrire: canWrite(CONFIG.viewMode) }).ok) return '';
    return `<button class="btn btn-soft btn-full" style="margin-top:8px" onclick="A.modifierForme()">Modifier la forme</button>`;
}

function boutonEnregistrerRepli() {
    return `<button class="btn btn-dark" style="flex:2" id="saisie-enregistrer" onclick="A.enregistrerSaisieObjet()">Enregistrer l'objet</button>`;
}

/**
 * Après l'écriture : relire la couche, puis ouvrir la fiche du nouvel objet,
 * retrouvé par sa ligne — son rang dépend de l'ordre de la table.
 */
async function apresCreationObjet(layer, rowId) {
    // Une création en appelle souvent une autre (on relève dix arbres, pas un) :
    // la création se réarme sur la même couche, et le panneau garde de quoi
    // défaire l'ajout précédent ou ouvrir sa fiche.
    const serie = (_saisieObjet?.serie || 0) + 1;
    arreterTrace(_saisieObjet);
    _saisieObjet = null;
    effacerSaisie();
    document.body.classList.remove('mode-creation');
    if (map) map.getCanvas().style.cursor = '';
    try {
        await relireCouche(layer);
    } catch (e) {
        showToast('Objet créé, mais la couche n’a pas pu être relue : ' + e.message, 'warning');
    }
    updateLegend();
    if (STATE.currentModule === 'couches') renderLayersPanel('couches');
    A.nouvelObjet(layer.id, { suite: { rowId, table: layer.sourceTable, serie } });
}

/** Le bandeau d'une série de créations : combien, et le dernier ajout, qu'on peut défaire ou ouvrir. */
function bandeauSerie(s) {
    if (!(s?.serie > 0) || s.modification) return '';
    const n = s.serie;
    const compte = `${n} objet${n > 1 ? 's' : ''} créé${n > 1 ? 's' : ''}`;
    // Après « Annuler cet ajout », le compte reste, sans geste sur un ajout déjà défait.
    if (!s.precedente) return `<div class="hint" style="margin-top:8px">${compte} dans cette série.</div>`;
    return `<div class="hint" style="margin-top:8px">
        <div>${compte} — dernier : ligne ${s.precedente.rowId}.</div>
        <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
            <button class="btn btn-soft" onclick="A.annulerDernierAjout()">Annuler cet ajout</button>
            <button class="btn btn-soft" onclick="A.voirDernierObjet()">Voir sa fiche</button>
        </div></div>`;
}

/** Le rappel « objet créé » ou « forme modifiée », avec le geste qui le défait. */
function rappelCreation(layer, props) {
    const m = _derniereModification;
    if (m && m.layerId === layer?.id && props?._row_id === m.rowId) {
        return `<div class="hint" style="margin-top:8px;display:flex;gap:8px;align-items:center;justify-content:space-between">
            <span>Forme modifiée à l’instant.</span>
            <button class="btn btn-soft" onclick="A.annulerModification()">Annuler la modification</button></div>`;
    }
    const d = _derniereCreation;
    if (!d || d.layerId !== layer?.id || props?._row_id !== d.rowId) return '';
    return `<div class="hint" style="margin-top:8px;display:flex;gap:8px;align-items:center;justify-content:space-between">
        <span>Objet créé à l’instant.</span>
        <button class="btn btn-soft" onclick="A.annulerCreation()">Annuler la création</button></div>`;
}

function renderObjectInspector() {
    const layer = STATE.layers.find((l) => l.id === STATE.selection.layerId);
    if (!layer) return;
    const count = STATE.selection.features.length;
    const multi = count > 1;
    const idx = STATE.selection.features[multi ? STATE.selection.multiIndex : 0];
    const f = layer.geojson.features[idx];
    const props = f?.properties || {};
    // Le nom lisible se cherche comme dans la palette (`nomObjet` : name, nom,
    // libelle, titre…). La fiche ne lisait que `name` : une table française —
    // colonne `nom` — s'ouvrait sur « Objet #3 », et le numéro était l'ordre
    // de l'entité dans la couche, pas celui de sa ligne.
    const label = nomObjet(props) || props._label || props._osmId
        || (props._row_id ? `Ligne ${props._row_id}` : `Objet #${idx + 1}`);
    const r = resolveFeatureProps(f, layer);
    // « Puis-je ecrire cet objet ? » se decide sur la capacite — une table et
    // un `_row_id` —, jamais sur le producteur de la couche.
    const isQgis = coucheAvecLignes(layer);
    const view = !!CONFIG.viewMode;
    const is3D = isModelLayer(layer);
    const revue = !!STATE.selection.revue;
    // Tous les formulaires de la couche : le principal, puis ceux dont la table
    // la reference. On ne remplit pas un formulaire sur douze objets a la fois,
    // sauf en revue, ou un curseur designe l'objet courant.
    const tousFormulaires = (multi && !revue) ? [] : formulairesDeLaCouche(layer);

    // Le seul chemin d'ecriture ouvert hors edition : les attributs devines
    // restent fermes, et rien d'autre ne bouge.
    const saisieTerrain = coucheEnSaisie(layer, { formulaires: tousFormulaires });

    // En terrain, seuls les formulaires que la scene a rendus disponibles ont un
    // onglet. En edition ils sont tous la, sinon on ne pourrait pas composer
    // celui qu'on n'a pas encore expose.
    const formulaires = view ? offertsEnLecture(tousFormulaires) : tousFormulaires;
    const tabs = objectInspectorTabs({ layer, formulaires, multi, revue, specs: (!multi || revue) && !!f && specsOffertes(layer, f), consultation: view && !!f });
    if (!_inspObjTab || !tabs.some((t) => t.cle === _inspObjTab)) _inspObjTab = tabs[0]?.cle || null;
    const ongletActif = tabs.find((t) => t.cle === _inspObjTab) || null;
    const formActif = ongletActif?.formulaire || null;

    // Hors de la branche : le pied de fiche en a besoin lui aussi, et le
    // deduire une seconde fois la-bas ferait deux regles pour un seul fait.
    const attrsReadOnly = (view && !saisieTerrain) || !isQgis;

    $('insp-head').innerHTML = `
        <div class="insp-eyebrow"><span class="layer-swatch" style="background:${fondPastilleCouche(layer)}"></span>${count > 1 ? `${count} objets` : layer.name}</div>
        <div class="insp-title">${count > 1 ? 'Sélection multiple' : label}</div>
        <div class="insp-sub">${count > 1 ? `${echapper(layer.name)}` : `${layer.geometryType}${isQgis ? ' · table' : ''}${view ? (saisieTerrain ? ' · saisie' : ' · lecture') : ''}`}</div>
        ${count === 1 && coucheEclairage(layer) ? `<div id="insp-etat-eclairage" class="etat-eclairage">${Eclairage.htmlEtat(layer, idx)}</div>` : ''}
        ${count === 1 && !view ? rappelCreation(layer, props) + boutonModifierForme(layer, f) : ''}`;
    $('insp-tabs').innerHTML = tabs.map((t) =>
        `<button class="insp-tab ${_inspObjTab === t.cle ? 'active' : ''}"
            onclick="A.setInspObjTab('${chaineJs(t.cle)}')"
            title="${echapper(t.libelle)}${t.formulaire?.tableId ? ' · ' + echapper(t.formulaire.tableId) : ''}">${echapper(t.libelle)}</button>`
    ).join('');

    const slider = (id, lbl, val, min, max, step, unit, mixed) => `
        <div class="slider-row">
            <div class="slider-head"><span class="lbl">${lbl}</span><span class="val ${mixed ? 'mixed' : ''}" id="${id}-v">${mixed ? '— mixte —' : val + unit}</span></div>
            <input type="range" class="rng acc" id="${id}" min="${min}" max="${max}" step="${step}" value="${mixed ? (min + max) / 2 : val}" oninput="A.editFeature('${id}', this.value)">
        </div>`;

    const geoReadOnly = () => `
        <div class="hint" style="margin-bottom:10px">Mode lecture — géométrie 3D non modifiable.</div>
        <div class="section" style="margin-bottom:8px"><label class="input-label">Échelle</label><div class="input" style="background:var(--surface-muted)">${r.scale}×</div></div>
        <div class="section" style="margin-bottom:8px"><label class="input-label">Rotation Z</label><div class="input" style="background:var(--surface-muted)">${r.rotationZ}°</div></div>
        <div class="section" style="margin-bottom:8px"><label class="input-label">Rotation X</label><div class="input" style="background:var(--surface-muted)">${r.rotationX}°</div></div>
        <div class="section" style="margin-bottom:8px"><label class="input-label">Altitude</label><div class="input" style="background:var(--surface-muted)">${r.offsetZ}m</div></div>
        <div class="section" style="margin-bottom:8px"><label class="input-label">Décalage X / Y</label><div class="input" style="background:var(--surface-muted)">${r.offsetX}m · ${r.offsetY}m</div></div>`;

    // Le corps suit l'onglet actif. Une cascade parallèle laisserait passer les
    // réglages 3D là où l'onglet a justement été retiré (objet non qgis2grist,
    // sélection multiple, mode lecture).
    // Remis a faux avant la cascade : sans cela, passer de la fiche a l'onglet
    // « Placement 3D » laisserait le pied muet, donc sans bouton d'enregistrement.
    _formulaireMonte = false;

    if (formActif) {
        // Un formulaire LIE ajoute une ligne dans sa propre table : il ne depend
        // pas du droit de corriger l'objet. Le confondre avec le principal
        // fermerait la saisie de terrain a qui peut relever sans pouvoir
        // modifier le bati — la configuration saine, justement.
        const readOnly = formActif.surLaCouche ? attrsReadOnly : (view && !saisieTerrain);
        // Quand le document decrit cette table par un FormDef, c'est LUI la
        // fiche : widgets typés, choix, obligatoires, coercition d'ecriture.
        // `renderAttrFields` reste le repli — il devine les champs, et n'a que
        // deux types.
        if (formActif.def && !readOnly && moteurDisponible()) {
            monterFormulaireEntite(layer, props, formActif, revue && multi ? count : 0, saisieTerrain);
        } else if (!formActif.surLaCouche) {
            $('insp-body').innerHTML = rappelRevue(revue && multi ? count : 0)
                + `<div class="hint">Relevé « ${echapper(formActif.titre)} » — indisponible ici : `
                + (readOnly ? 'la saisie est fermée en lecture.' : 'le moteur de formulaire n’est pas chargé.')
                + '</div>';
        } else {
            // Constater un blocage sans donner la sortie, c'est le laisser
            // chercher. L'offre se pose donc LA ou le blocage se lit.
            const entete = readOnly
                ? (isQgis ? '' : enteteSansTable(layer, view))
                : `<div class="hint" style="margin-bottom:10px">Modifications enregistrées dans <strong>${layer.sourceTable}</strong>.</div>`;
            $('insp-body').innerHTML = rappelRevue(revue && multi ? count : 0)
                + entete + renderAttrFields(layer, props, { readOnly });
        }
    } else if (_inspObjTab === ONGLET_FICHE) {
        $('insp-body').innerHTML = ficheConsultation(layer, f);
    } else if (_inspObjTab === ONGLET_SPECS) {
        $('insp-body').innerHTML = htmlSpecsObjet(layer, f, view);
    } else if (_inspObjTab === ONGLET_3D) {
        if (view) {
            $('insp-body').innerHTML = multi
                ? `<div class="hint">Mode lecture — sélection de ${count} objets (pas d’édition).</div>`
                : geoReadOnly();
        } else if (!multi) {
            $('insp-body').innerHTML = htmlAvertissementPersistance(layer) +
                slider('f-scale', '📏 Échelle', r.scale, 0.1, 5, 0.05, '×') +
                slider('f-rotationZ', '🔄 Rotation Z (azimut)', r.rotationZ, 0, 360, 5, '°') +
                slider('f-rotationX', '↕️ Rotation X', r.rotationX, -90, 90, 5, '°') +
                slider('f-offsetZ', '⬆️ Altitude', r.offsetZ, 0, 20, 0.5, 'm') +
                slider('f-offsetX', '↔️ Décalage X', r.offsetX, -100, 100, 0.5, 'm') +
                slider('f-offsetY', '↕️ Décalage Y', r.offsetY, -100, 100, 0.5, 'm');
        } else {
            $('insp-body').innerHTML = `<div class="hint">Modifications relatives appliquées aux ${count} objets.</div>` +
                slider('m-scale', '📏 Échelle (×)', 1, 0.1, 5, 0.05, '×') +
                slider('m-rotationZ', '🔄 Rotation Z (+/-)', 0, -180, 180, 5, '°') +
                slider('m-offsetZ', '⬆️ Altitude (+/-)', 0, -5, 10, 0.5, 'm') +
                slider('m-offsetX', '↔️ Décalage X (+/-)', 0, -50, 50, 0.5, 'm') +
                slider('m-offsetY', '↕️ Décalage Y (+/-)', 0, -50, 50, 0.5, 'm');
        }
    } else if (count === 1 && f) {
        // Un seul objet et aucun formulaire à montrer — en lecture, depuis le
        // geste « Voir la fiche » d'une bulle : ses attributs, en consultation.
        // Il tombait sur le message de la sélection multiple, fiche vide.
        $('insp-body').innerHTML = ficheConsultation(layer, f);
    } else {
        // Aucun onglet : sélection multiple sur des objets sans réglage commun.
        $('insp-body').innerHTML = `<div class="hint">${count} objet${count > 1 ? 's' : ''} sélectionné${count > 1 ? 's' : ''} — aucun réglage groupé pour ce type d’objet.</div>`;
    }

    if (_formulaireMonte) {
        $('insp-foot').innerHTML = '';
    } else if (view) {
        $('insp-foot').innerHTML = `<div class="hint" style="margin:0;flex:1">Mode lecture — consultation seule</div>`;
    } else if (!tabs.length) {
        $('insp-foot').innerHTML = '';
    } else if (formActif?.surLaCouche && attrsReadOnly) {
        // « Enregistrer » promettait d'ecrire des champs que l'onglet venait
        // d'afficher en lecture seule. La sortie est dans le corps de la fiche
        // (« Enregistrer dans Grist »), la ou le blocage se lit ; le pied dit
        // seulement pourquoi il n'y a rien a enregistrer ici.
        $('insp-foot').innerHTML = `<div class="hint" style="margin:0;flex:1">Attributs non modifiables — cette couche n'a pas de lignes Grist.</div>`;
    } else {
        // « Reset » ne rétablit que les surcharges de placement 3D ; « Enregistrer »
        // persiste aussi les attributs, il reste donc dans tous les cas.
        const reset = is3D && _inspObjTab !== ONGLET_SPECS
            ? `<button class="btn btn-soft" style="flex:1" onclick="A.resetSelected()">🔄 Reset</button>`
            : '';
        $('insp-foot').innerHTML = reset
            + `<button class="btn btn-dark" style="flex:2" onclick="A.applySelected()">Enregistrer · ${count} objet${count > 1 ? 's' : ''}</button>`;
    }
}

// ============================================================
// INTERACTION (clic, hover, sélection, box-select)
// ============================================================
/** Toucher un regroupement : la carte s'approche jusqu'au zoom où il se défait. */
function zoomerSurGrappe(f) {
    const idCouche = String(f.layer.id).replace(/-grappe$/, '');
    const couche = STATE.layers.find((l) => l.id === idCouche);
    if (!couche) return;
    const estPoint = couche.geometryType === 'Point' || couche.geometryType === 'MultiPoint';
    const source = map.getSource(estPoint ? idCouche : idCouche + '-grappes');
    const centre = f.geometry?.coordinates;
    if (!source || !centre) return;
    Promise.resolve(source.getClusterExpansionZoom(f.properties.cluster_id))
        .then((z) => map.easeTo({ center: centre, zoom: Math.min((Number.isFinite(z) ? z : map.getZoom() + 2) + 0.4, 20), duration: 500 }))
        .catch(() => map.easeTo({ center: centre, zoom: map.getZoom() + 2, duration: 500 }));
}
function hitLayerIds() {
    // L'icône d'une catégorie se touche comme son point : elle se dessine
    // au-dessus de lui, et c'est elle que le doigt vise.
    return STATE.layers.filter((l) => map.getLayer(l.id))
        .flatMap((l) => [l.id, ...['-icon', '-vaste'].map((s) => l.id + s).filter((id) => map.getLayer(id))]);
}
/** La couche Atlas d'un objet rendu, icône comprise. */
function coucheDuRendu(idRendu) {
    const id = String(idRendu || '').replace(/-(icon|vaste)$/, '');
    return STATE.layers.find((l) => l.id === id);
}
function setupInteraction() {
    let boxStart = null, boxEl = null, boxing = false, boxJustEnded = false;

    map.on('mousemove', (e) => {
        // Pendant un tracé, terra-draw pose ses curseurs (fermeture, accroche).
        if (_saisieObjet) { if (!_saisieObjet.trace) map.getCanvas().style.cursor = 'crosshair'; return; }
        if (trajetPickMode || _itineraire) { map.getCanvas().style.cursor = 'crosshair'; return; }
        if (boxing || boxJustEnded || locationPickMode) return;
        const ids = hitLayerIds();
        const feats = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids }) : [];
        map.getCanvas().style.cursor = feats.length ? (STATE.selection.mode ? 'crosshair' : 'pointer') : (STATE.selection.mode ? 'crosshair' : '');
    });

    map.on('click', (e) => {
        if (boxing || boxJustEnded) return;
        // La création en cours possède les clics : en tête de la chaîne.
        if (_saisieObjet) { onSaisieClic(e); return; }
        if (locationPickMode) { onLocationPick(e); return; }
        if (trajetPickMode) { onTrajetPick(e); return; }
        if (_itineraire) { itineraireClic(e); return; }
        const idsGrappes = STATE.layers.map((l) => l.id + '-grappe').filter((id) => map.getLayer(id));
        const grappe = idsGrappes.length ? map.queryRenderedFeatures(e.point, { layers: idsGrappes })[0] : null;
        if (grappe) { zoomerSurGrappe(grappe); return; }
        const ids = hitLayerIds();
        const feats = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids }) : [];
        if (!feats.length) {
            if (CONFIG.viewMode) closeViewPopup();
            return;
        }
        const f = feats[0];
        const layer = coucheDuRendu(f.layer.id);
        if (!layer) return;
        const idx = f.properties?._idx ?? 0;

        if (_storyPresenting && coucheDansSaisiesEtape(layer)) {
            ouvrirObjet(layer, idx, { lngLat: e.lngLat, feature: f });
            return;
        }

        // Lecture : popup attributs (pas d'inspecteur édition) — sauf quand la
        // scene a publie un formulaire sur cette couche. Le popup dirait les
        // valeurs ; il ne permettrait pas de les corriger, et c'est justement ce
        // qu'on est venu faire sur le terrain. Sans cette porte, la bascule
        // « disponible hors edition » n'aurait rien change a l'ecran.
        if (CONFIG.viewMode) {
            // La bulle passe devant la fiche : elle montre l'essentiel et porte
            // les gestes (nouvelle visite, voir la fiche, itinéraire).
            // Un seul arbre de décision (lib/ouvrir-objet.js) : le toucher, la
            // recherche, « le plus proche » et la liste ouvrent de la même façon.
            ouvrirObjet(layer, idx, { lngLat: e.lngLat, feature: f });
            return;
        }

        // Une couche distante n'a pas de ligne a editer : ni table Grist
        // derriere, ni feature source a modifier. Entrer en mode selection
        // ouvrirait un inspecteur d'edition sur un objet qu'on ne peut pas
        // enregistrer — et « Enregistrer » qui echoue est pire que son absence.
        // On montre la fiche, en consultation, comme en lecture.
        if (layer._distant) {
            ouvrirObjet(layer, idx, { lngLat: e.lngLat, feature: f });
            return;
        }

        if (STATE.selection.mode && STATE.selection.layerId === layer.id) {
            if (e.originalEvent.shiftKey) toggleSelect(idx); else STATE.selection.features = [idx];
            afterSelectionChange();
        } else {
            enterSelectionMode(layer.id, idx);
        }
    });

    // Sélection rectangulaire — Maj + glisser à la souris, appui long au doigt.
    //
    // Le doigt n'a pas de touche Maj, et un simple glissement doit rester le
    // déplacement de la carte : on attend donc une pression immobile avant de
    // prendre la main. C'est le geste habituel pour « saisir » sur mobile.
    const cc = map.getCanvasContainer();
    let boxLast = null, longPress = 0, armeDepuis = null;

    const annulerAppuiLong = () => {
        clearTimeout(longPress);
        longPress = 0;
        armeDepuis = null;
    };

    const demarrerBox = (x, y, pointerId) => {
        map.dragPan.disable();
        boxing = true;
        boxStart = { x, y };
        boxLast = { x, y };
        boxEl = document.createElement('div');
        boxEl.className = 'selection-box';
        document.body.appendChild(boxEl);
        capturePointer(cc, pointerId);
    };

    cc.addEventListener('pointerdown', (e) => {
        if (CONFIG.viewMode || !STATE.selection.mode) return;
        if (!e.isPrimary) { annulerAppuiLong(); return; } // deux doigts = zoom

        if (e.pointerType === 'mouse') {
            if (!e.shiftKey) return;
            demarrerBox(e.clientX, e.clientY, e.pointerId);
            e.preventDefault();
            return;
        }

        armeDepuis = { x: e.clientX, y: e.clientY, id: e.pointerId };
        longPress = setTimeout(() => {
            if (!armeDepuis) return;
            demarrerBox(armeDepuis.x, armeDepuis.y, armeDepuis.id);
            annulerAppuiLong();
            // Le rectangle naissant est invisible : sans retour, rien ne dit que
            // le geste a basculé du déplacement vers la sélection.
            try { navigator.vibrate?.(15); } catch (_) { /* non supporté */ }
            showToast('Sélection rectangulaire — glissez', 'info');
        }, LONG_PRESS_MS);
    });

    cc.addEventListener('pointermove', (e) => {
        if (armeDepuis) {
            // Le doigt part en promenade : c'est un déplacement de carte.
            const d = Math.hypot(e.clientX - armeDepuis.x, e.clientY - armeDepuis.y);
            if (d > LONG_PRESS_TOLERANCE_PX) annulerAppuiLong();
            return;
        }
        if (!boxing || !boxEl) return;
        boxLast = { x: e.clientX, y: e.clientY };
        const x0 = Math.min(boxStart.x, e.clientX), y0 = Math.min(boxStart.y, e.clientY);
        boxEl.style.left = x0 + 'px'; boxEl.style.top = y0 + 'px';
        boxEl.style.width = Math.abs(e.clientX - boxStart.x) + 'px';
        boxEl.style.height = Math.abs(e.clientY - boxStart.y) + 'px';
    });

    // La fin lit la dernière position connue : `pointercancel` n'en porte pas.
    const endBox = () => {
        annulerAppuiLong();
        if (!boxing) return;
        // Fermer tout de suite : la capture livre le `pointerup` à `cc`, d'où il
        // remonte jusqu'à `window` — sans garde, la sélection serait rejouée.
        boxing = false;
        map.dragPan.enable();
        const rect = map.getContainer().getBoundingClientRect();
        const fin = boxLast || boxStart;
        const a = [Math.min(boxStart.x, fin.x) - rect.left, Math.min(boxStart.y, fin.y) - rect.top];
        const b = [Math.max(boxStart.x, fin.x) - rect.left, Math.max(boxStart.y, fin.y) - rect.top];
        if (boxEl) { boxEl.remove(); boxEl = null; }
        if (b[0] - a[0] > 4 && b[1] - a[1] > 4) selectInBox(a, b);
        // Le `click` de fin de geste arrive après : le laisser passer viderait
        // la sélection qu'on vient tout juste de faire.
        boxJustEnded = true;
        setTimeout(() => { boxJustEnded = false; }, 60);
    };
    cc.addEventListener('pointerup', endBox);
    cc.addEventListener('pointercancel', endBox);
    // Filet : un relâchement hors carte (fenêtre, iframe voisine) doit rendre
    // la main au déplacement plutôt que de laisser la carte figée.
    window.addEventListener('pointerup', endBox);
}

let _viewPopup = null;

function closeViewPopup() {
    if (_viewPopup) {
        try { _viewPopup.remove(); } catch (_) {}
        _viewPopup = null;
    }
}

// ============================================================
// BULLE D'OBJET — lot 4 du cadrage des relevés (`lib/bulle-objet.js`)
// ============================================================
function bulleActive(layer) {
    const b = layer?.style?.symbolization?.bulle;
    return !!(b?.actif && layer.sourceTable && CONFIG.grist.ready);
}

const _urlsPhotos = new Map();   // id de pièce jointe -> Promise<url>
/**
 * L'adresse d'une photo. Dans l'application, l'adaptateur lit le fichier avec
 * la clé ; dans le widget, le jeton du document suffit à une balise `<img>`.
 */
function urlPhoto(id) {
    if (_urlsPhotos.has(id)) return _urlsPhotos.get(id);
    const p = (async () => {
        if (typeof grist?.docApi?.urlPieceJointe === 'function') return grist.docApi.urlPieceJointe(id);
        const tok = await grist.docApi.getAccessToken({ readOnly: true });
        if (!tok?.token || !tok?.baseUrl) throw new Error('jeton du document indisponible');
        return `${tok.baseUrl}/attachments/${id}/download?auth=${encodeURIComponent(tok.token)}`;
    })();
    _urlsPhotos.set(id, p);
    p.catch(() => _urlsPhotos.delete(id));
    return p;
}

/**
 * Le libellé d'une ligne référencée, si sa table est déjà lue (bulle,
 * symbologie) : une lecture synchrone, sans requête. `null` sinon.
 */
function libelleRefConnu(cible, id) {
    const lignes = _lignesReference.get(cible);
    const colLib = (STATE.schema?.[cible] || []).find((x) => !x.type || x.type === 'Text')?.colId;
    if (!lignes || !colLib) return null;
    const l = lignes.find((x) => String(x.id) === String(id));
    return l && l[colLib] != null && l[colLib] !== '' ? String(l[colLib]) : null;
}

/** Libellés affichés par Grist pour un champ `Ref` : id -> texte. */
async function libellesDeChamp(table, champ) {
    const col = (STATE.schema?.[table] || []).find((x) => x.colId === champ);
    // Ref ou RefList ; la colonne affichée est celle que Grist a choisie pour la
    // référence (`visibleCol`), à défaut la première colonne de texte.
    const cible = /^Ref(?:List)?:(.+)$/.exec(col?.type || '')?.[1];
    const colLib = cible && (col.visibleCol || (STATE.schema?.[cible] || []).find((x) => !x.type || x.type === 'Text')?.colId);
    if (!colLib) return null;
    const lignes = await lignesDeTable(cible);
    return new Map(lignes.map((l) => [String(l.id), String(l[colLib] ?? '')]));
}

/**
 * Couleur et libellé de chaque valeur d'un champ de pastille : la couleur de
 * la symbologie si c'est le champ coloré, sinon celle de sa table de
 * référence (un second état, la sécurité des usagers, garde ainsi sa couleur).
 */
async function apparencesDeChamp(layer, champ) {
    const out = new Map();
    const c = initSymbolization(layer).color;
    if (c.mode === 'categorized' && c.field === champ) {
        for (const cat of c.categories || []) out.set(String(cat.value), { couleur: cat.color, libelle: cat.label || c.libelles?.[String(cat.value)] });
        return out;
    }
    const ref = await detecterReference(layer, champ, 'couleur');
    if (ref) {
        for (const [k, e] of entreesReference(await lignesDeTable(ref.table), ref)) out.set(k, { couleur: e.couleur, libelle: e.libelle });
    }
    return out;
}

/** La dernière ligne liée d'un objet : date, un état lisible, et leur nombre. */
async function derniereVisite(layer, rowId, lien) {
    if (!lien?.table || !lien.via) return null;
    const lignes = await lignesDeTable(lien.table);
    const colonnes = STATE.schema?.[lien.table] || [];
    const date = lien.date || colonneDate(colonnes);
    const l = date ? derniereLigneLiee(lignes, lien.via, rowId, date) : null;
    const nombre = nombreLignesLiees(lignes, lien.via, rowId);
    if (!l) return { nombre };
    // Un état dit en un mot ce que la visite a constaté.
    const etat = colonnes.find((x) => /etat|état|statut|state/i.test(x.colId) && x.colId !== lien.via);
    let texte = '';
    if (etat && l[etat.colId] != null && l[etat.colId] !== '') {
        const libs = await libellesDeChamp(lien.table, etat.colId).catch(() => null);
        texte = libs?.get(String(l[etat.colId])) || String(l[etat.colId]);
    }
    return { date: l[date], texte, nombre };
}

/** La mise en page d'une bulle (le contenu vient de `modeleBulle`). */
function htmlBulle(m) {
    const e = escapeHtml;
    return `<div class="atlas-bulle">
        ${m.photos.length ? `<div class="bulle-photos">${m.photos.map((id) => `<img data-photo="${id}" alt="" loading="lazy">`).join('')}</div>` : ''}
        ${m.titre ? `<div class="bulle-titre">${e(m.titre)}</div>` : ''}
        ${m.pastilles.length ? `<div class="bulle-pastilles">${m.pastilles.map((p) => `<span class="bulle-pastille" title="${e(p.libelle)}"${p.couleur ? ` style="background:${e(p.couleur)};color:${p.encre}"` : ''}>${e(p.texte)}</span>`).join('')}</div>` : ''}
        ${m.lignes.length ? `<dl class="bulle-champs">${m.lignes.map((l) => `<div><dt>${e(l.libelle)}</dt><dd>${e(l.valeur)}</dd></div>`).join('')}</dl>` : ''}
        ${m.derniere ? `<div class="bulle-derniere"><span>Dernière visite</span> ${e(m.derniere.texte)}${m.derniere.nombre ? ` <em>(${m.derniere.nombre})</em>` : ''}</div>` : ''}
        ${m.actions.length ? `<div class="bulle-actions">${m.actions.map((a) => `<button type="button" data-action="${a.cle}"${a.lien ? ` data-lien="${e(a.lien)}"` : ''}>${e(a.libelle)}</button>`).join('')}</div>` : ''}
    </div>`;
}

/** Le libellé d'une colonne, tel que Grist le montre. */
function libelleColonne(table, colId) {
    const c = (STATE.schema?.[table] || []).find((x) => x.colId === colId);
    return (c?.label || colId).replace(/_/g, ' ');
}

/**
 * Le formulaire qu'ouvre « Nouvelle visite », ou `null`.
 *
 * En lecture, seul un formulaire proposé hors édition peut s'ouvrir, et
 * seulement à qui peut écrire : sans cela le bouton menait à une fiche
 * fermée. On ne le montre donc pas — une bulle ne promet que ce qu'elle tient.
 */
function formulaireDeVisite(layer, cfg) {
    if (!cfg?.lien?.table) return null;
    const lies = formulairesDeLaCouche(layer).filter((x) => !x.surLaCouche && x.tableId === cfg.lien.table);
    if (!CONFIG.viewMode) return lies[0] || null;
    if (!CONFIG.peutSaisir || !moteurDisponible()) return null;
    return offertsEnLecture(lies)[0] || null;
}

/** Ce que « Nouvelle visite » ouvrira, dit à qui configure — avec la sortie s'il n'ouvre rien. */
function etatVisiteBulle(layer, b) {
    if (!b.actions?.visite || !b.lien?.table) {
        return '<div class="hint" style="margin-top:4px">« Nouvelle visite » ouvre le formulaire de la table liée.</div>';
    }
    const lies = formulairesDeLaCouche(layer).filter((x) => !x.surLaCouche && x.tableId === b.lien.table);
    const offert = offertsEnLecture(lies)[0];
    if (offert) {
        return `<div class="hint" style="margin-top:4px">Sur le terrain, « Nouvelle visite » ouvre « ${escapeHtml(offert.titre)} ».</div>`;
    }
    const candidat = lies.find((x) => !x.derive);
    return `<div class="hint" style="margin-top:4px">Aucun formulaire de ${escapeHtml(b.lien.table)} n’est proposé hors édition : en lecture, le bouton n’apparaîtra pas.</div>`
        + (candidat
            ? `<button class="btn btn-soft btn-full" style="margin-top:6px" onclick="A.exposerFormulaire('${layer.id}','${String(candidat.id).replace(/'/g, "\\'")}')">Proposer « ${escapeHtml(candidat.titre)} »</button>`
            : `<button class="btn btn-soft btn-full" style="margin-top:6px" onclick="A.openModule('formulaires')">Ouvrir les formulaires</button>`);
}

async function ouvrirBulle(layer, idx, feature, lngLat) {
    const base = initSymbolization(layer).bulle;
    const cfg = { ...base, actions: { ...(base.actions || {}), visite: !!base.actions?.visite && !!formulaireDeVisite(layer, base) } };
    const props = feature.properties || {};
    const centre = lngLat ? [lngLat.lng, lngLat.lat] : featureCentroidLngLat(feature);
    if (!centre) return;
    // Un squelette tout de suite : la bulle répond au toucher, le reste suit.
    _viewPopup = new maplibregl.Popup({ maxWidth: '320px', closeButton: true, closeOnClick: true, className: 'atlas-view-popup atlas-bulle-popup' })
        .setLngLat(centre)
        .setHTML(`<div class="atlas-bulle"><div class="bulle-titre">${escapeHtml(nomObjet(props) || layer.name)}</div><div class="range-info">…</div></div>`)
        .addTo(map);
    const popup = _viewPopup;
    const champsRef = [...new Set([cfg.titre, ...(cfg.champs || [])].filter(Boolean))];
    const [apparences, libelles, derniere] = await Promise.all([
        Promise.all((cfg.pastilles || []).map(async (c) => [c, await apparencesDeChamp(layer, c).catch(() => new Map())])),
        Promise.all(champsRef.map(async (c) => [c, await libellesDeChamp(layer.sourceTable, c).catch(() => null)])),
        derniereVisite(layer, props._row_id, cfg.lien).catch(() => null),
    ]);
    if (_viewPopup !== popup) return;   // une autre bulle a pris la place
    const parChamp = new Map(apparences);
    const libs = new Map(libelles);
    const m = modeleBulle(cfg, props, {
        libelleChamp: (c) => libelleColonne(layer.sourceTable, c),
        valeur: (c, v) => {
            if (v == null || v === '') return '';
            const l = libs.get(c)?.get(String(v));
            if (l) return l;
            if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
            const col = (STATE.schema?.[layer.sourceTable] || []).find((x) => x.colId === c);
            if (/^Date/.test(col?.type || '') && Number.isFinite(Number(v))) return dateCourte(v);
            return Array.isArray(v) ? v.filter((x) => x !== 'L').join(', ') : String(v);
        },
        pastille: (c, v) => {
            const a = parChamp.get(c)?.get(String(v));
            return a ? { texte: a.libelle || String(v), couleur: a.couleur } : null;
        },
        derniere,
        itineraire: lienItineraire(centre[0], centre[1], { application: peutSAuthentifier() }),
    });
    // Une lampe dit si elle est allumée, et pourquoi : en lecture, c'est ce qu'on vient chercher.
    if (coucheEclairage(layer)) {
        const pe = pastilleEtat(Eclairage.etats.get(`${layer.id}:${idx}`));
        if (pe) m.pastilles.unshift(pe);
    }
    popup.setHTML(htmlBulle(m));
    const el = popup.getElement();
    garderBulleVisible(el);
    // Un compteur « 1 / 3 » sur les photos : la bande défile au doigt, sans barre.
    const bande = el.querySelector('.bulle-photos');
    if (bande && m.photos.length > 1) {
        const n = document.createElement('span');
        n.className = 'bulle-photos-compte';
        n.textContent = `1 / ${m.photos.length}`;
        bande.parentElement.insertBefore(n, bande.nextSibling);
        bande.addEventListener('scroll', () => {
            n.textContent = `${Math.round(bande.scrollLeft / Math.max(1, bande.clientWidth)) + 1} / ${bande.querySelectorAll('img').length}`;
        }, { passive: true });
    }
    // Les photos arrivent une à une ; une photo illisible disparaît sans bruit.
    // Deux échecs distincts : l'adresse ne s'obtient pas (pas de jeton), ou le
    // fichier ne vient pas — constaté sur une copie de document faite sans ses
    // pièces jointes : Grist en connaît la fiche, répond 500 sur le contenu.
    const retirer = (img) => {
        img.remove();
        const bandeRestante = el.querySelector('.bulle-photos');
        const restant = bandeRestante?.querySelectorAll('img').length || 0;
        if (bandeRestante && !restant) bandeRestante.remove();
        const compte = el.querySelector('.bulle-photos-compte');
        if (compte && restant <= 1) compte.remove();
        else if (compte) compte.textContent = `1 / ${restant}`;
        garderBulleVisible(el);
    };
    for (const img of el.querySelectorAll('img[data-photo]')) {
        img.addEventListener('error', () => retirer(img), { once: true });
        urlPhoto(Number(img.dataset.photo))
            .then((u) => { img.src = u; })
            .catch(() => retirer(img));
        img.addEventListener('click', () => ouvrirPhoto(img.src));
    }
    el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-action]');
        if (!b) return;
        ev.stopPropagation();
        actionBulle(layer, idx, cfg, b.dataset.action, b.dataset.lien);
    });
}

/**
 * La bulle entière dans la zone visible : la légende, les feuilles et les
 * commandes de la carte la recouvraient (mesuré : le geste « Itinéraire » sous
 * la légende). On déplace la carte du strict nécessaire (`deplacementPourVoir`).
 */
function garderBulleVisible(el) {
    // Une photo qui échoue peut rappeler ceci après la fermeture de la bulle :
    // un élément détaché mesure 0×0 et ferait déplacer la carte sans raison.
    if (!el || !el.isConnected || !map) return;
    const c = map.getContainer();
    const carte = { largeur: c.clientWidth, hauteur: c.clientHeight };
    const contenu = el.querySelector('.atlas-bulle');
    if (contenu) contenu.style.maxHeight = '';
    // L'objet compte avec sa bulle : recaler la bulle seule poussait l'objet
    // contre le bord de la carte, à moitié caché (constaté le 01/10/2026).
    const ancre = _viewPopup?.getElement() === el ? _viewPopup.getLngLat() : null;
    const RAYON_OBJET = 24;
    const mesurer = () => {
        const rc = c.getBoundingClientRect();
        const rb = el.getBoundingClientRect();
        const emprise = { minX: rb.left - rc.left, minY: rb.top - rc.top, maxX: rb.right - rc.left, maxY: rb.bottom - rc.top };
        if (ancre) {
            const p = map.project(ancre);
            emprise.minX = Math.min(emprise.minX, p.x - RAYON_OBJET);
            emprise.maxX = Math.max(emprise.maxX, p.x + RAYON_OBJET);
            emprise.minY = Math.min(emprise.minY, p.y - RAYON_OBJET);
            emprise.maxY = Math.max(emprise.maxY, p.y + RAYON_OBJET);
        }
        return { rc, rb, emprise };
    };
    let { rc, rb, emprise } = mesurer();
    const marges = { ...margesActuelles() };
    // La légende ne compte que si elle est dépliée sous la bulle.
    const avecLegende = { ...marges };
    const leg = $('legend');
    if (leg && leg.offsetParent) {
        const rl = leg.getBoundingClientRect();
        if (rl.right > rb.left && rl.left < rb.right) avecLegende.bottom = Math.max(marges.bottom || 0, rc.bottom - rl.top);
    }
    // D'abord au-dessus de la légende ; une bulle trop haute pour cela passe
    // par-dessus (elle est au premier plan) ; trop haute pour la carte même,
    // elle se raccourcit et défile (mesuré : une petite vue de page coupait
    // le bas de la bulle, gestes compris).
    let r = deplacementPourVoir({ emprise, carte, marges: avecLegende, marge: 8 });
    if (r.cadrer) r = deplacementPourVoir({ emprise, carte, marges, marge: 8 });
    if (r.cadrer && contenu) {
        const pointe = 14;
        const dispo = carte.hauteur - (marges.top || 0) - (marges.bottom || 0) - 16 - pointe;
        contenu.style.maxHeight = Math.max(160, dispo) + 'px';
        ({ emprise } = mesurer());
        r = deplacementPourVoir({ emprise, carte, marges, marge: 8 });
    }
    if (!r.cadrer && (r.dx || r.dy)) map.panBy([r.dx, r.dy], { duration: 300 });
}

/**
 * Les attributs d'un objet, en consultation : tous, sans les colonnes
 * internes ni les coordonnées, aux libellés du schéma. Un `Ref` se lit par son
 * libellé quand Atlas l'a déjà ; une pièce jointe se compte.
 */
function ficheConsultation(layer, feature) {
    const p = feature?.properties || {};
    const table = layer.sourceTable;
    const geo = new Set(table ? nomsColonnesGeometrie(colonnesGeometrie(layer)) : []);
    const cols = table && STATE.schema?.[table]
        ? STATE.schema[table].map((c) => c.colId)
        : Object.keys(p);
    const libs = initSymbolization(layer).color.libelles || {};
    const lignes = [];
    const COORD = /(^|_)(lat|latitude|lon|lng|long|longitude)(_|$)|latitude|longitude|^(wkt|geometry_json|geometry|geom)$/i;
    for (const k of cols) {
        if (!k || k.startsWith('_') || geo.has(k) || COORD.test(k) || /^(id|manualSort|gristHelper.*)$/.test(k)) continue;
        const col = table && (STATE.schema?.[table] || []).find((x) => x.colId === k);
        let v = p[k];
        if (v == null || v === '') continue;
        if (col?.type === 'Attachments') {
            const n = idsPiecesJointes(p[`_l_${k}`] ?? v).length;
            if (!n) continue;
            v = `${n} fichier${n > 1 ? 's' : ''}`;
        } else if (typeof v === 'boolean') v = v ? 'Oui' : 'Non';
        else if (/^Date/.test(col?.type || '') && Number.isFinite(Number(v))) v = dateCourte(v);
        else if (initSymbolization(layer).color.field === k && libs[String(v)]) v = libs[String(v)];
        else if (tableReferencee(col?.type)) v = libelleRefConnu(tableReferencee(col.type), v) ?? v;
        lignes.push(`<div class="atlas-popup-row"><span class="k">${escapeHtml(libelleColonne(table, k))}</span><span class="v">${escapeHtml(String(v))}</span></div>`);
    }
    return lignes.length
        ? `<div class="atlas-popup">${lignes.join('')}</div>`
        : '<div class="hint">Aucun attribut renseigné.</div>';
}

/** Une photo en grand, par-dessus la carte ; un toucher la referme. */
function ouvrirPhoto(src) {
    if (!src) return;
    const v = document.createElement('div');
    v.className = 'bulle-visionneuse';
    v.innerHTML = `<img src="${escapeHtml(src)}" alt="">`;
    v.addEventListener('click', () => v.remove());
    document.body.appendChild(v);
}

function actionBulle(layer, idx, cfg, action, lien) {
    if (action === 'itineraire' && lien) { window.open(lien, '_blank', 'noopener'); return; }
    closeViewPopup();
    enterSelectionMode(layer.id, idx, { consultation: true });
    // « Voir la fiche » ouvre les attributs, pas le formulaire de visite : sans onglet de fiche (couche sans formulaire publié), la
    // fiche s'ouvre déjà sur eux.
    if (action === 'fiche') {
        _inspObjTab = ONGLET_FICHE;
        renderObjectInspector();
    }
    if (action === 'visite' && cfg.lien) {
        // L'onglet du formulaire de la table liée : on ajoute une visite, on ne
        // corrige pas l'objet. Faute de formulaire proposé, la fiche reste
        // sur son premier onglet.
        const f = formulaireDeVisite(layer, cfg);
        if (f) { _inspObjTab = f.id; renderObjectInspector(); }
        else showToast(`Aucun formulaire proposé pour « ${cfg.lien.table} »`, 'warning');
    }
}

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatPopupValue(v) {
    if (v == null || v === '') return '';
    if (Array.isArray(v)) {
        return v.map(formatPopupValue).filter(Boolean).join(', ');
    }
    if (typeof v === 'object') {
        if (v.name != null) return String(v.name);
        if (v.label != null) return String(v.label);
        try { return JSON.stringify(v); } catch (_) { return String(v); }
    }
    return String(v);
}

/** HTML popup lecture : template manifest si présent, sinon attributs métier. */
function buildViewPopupHtml(layer, feature, idx) {
    const props = feature?.properties || {};
    const ml = layer._manifestLayer || {};
    const template = ml.popup_template || ml.popup?.template || layer.popupTemplate || layer.popup_template;
    const title = formatPopupValue(nomObjet(props) || props._label || props.label)
        || layer.name || `Objet #${(idx ?? 0) + 1}`;

    // Le gabarit est du HTML posé tel quel — c'est voulu, et sans danger quand
    // il vient d'une table du document : l'y mettre demandait déjà le droit
    // d'écrire. Venu d'une adresse, il s'exécuterait dans une iframe qui tient
    // les droits de la personne sur son document. En scène externe, le gabarit
    // est donc rendu **comme du texte** : sa mise en forme est perdue, ses
    // valeurs restent.
    if (typeof template === 'string' && template.trim() && CONFIG.sceneExterne) {
        const texte = template.replace(/\{([^}]+)\}/g,
            (_, key) => formatPopupValue(props[key.trim()]) ?? '');
        return `<div class="atlas-popup"><div class="atlas-popup-title">${escapeHtml(title)}</div>`
             + `<div class="atlas-popup-row">${escapeHtml(texte)}</div></div>`;
    }
    if (typeof template === 'string' && template.trim()) {
        let html = template;
        html = html.replace(/\{([^}]+)\}/g, (_, key) => escapeHtml(formatPopupValue(props[key.trim()])));
        return `<div class="atlas-popup"><div class="atlas-popup-title">${escapeHtml(title)}</div>${html}</div>`;
    }

    const skip = new Set(['_idx', '_row_id', '_fill_color', '_visible', '_fill_opacity', '_line_opacity',
        '_scale', '_rotationX', '_rotationY', '_rotationZ', '_offsetX', '_offsetY', '_offsetZ', '_modelId']);
    const fields = (layer._fields || []).filter((f) => f.name && !skip.has(f.name));
    const rows = [];
    if (fields.length) {
        for (const f of fields.slice(0, 12)) {
            const key = f.name;
            const val = formatPopupValue(props[key] ?? props[f._rawKey] ?? props[f.rawKey]);
            if (!val) continue;
            rows.push([f.label || f.name, val]);
        }
    } else {
        for (const [k, v] of Object.entries(props)) {
            if (skip.has(k) || k.startsWith('_')) continue;
            const val = formatPopupValue(v);
            if (!val) continue;
            rows.push([k, val]);
            if (rows.length >= 12) break;
        }
    }
    // Une lampe dit si elle est allumée, et pourquoi (comme la bulle configurée).
    if (coucheEclairage(layer)) {
        const pe = pastilleEtat(Eclairage.etats.get(`${layer.id}:${idx}`));
        if (pe) rows.unshift([pe.libelle, pe.texte]);
    }
    if (!rows.length) {
        return `<div class="atlas-popup"><div class="atlas-popup-title">${escapeHtml(title)}</div><div class="atlas-popup-empty">Pas d’attributs</div></div>`;
    }
    const body = rows.map(([k, v]) =>
        `<div class="atlas-popup-row"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></div>`
    ).join('');
    return `<div class="atlas-popup"><div class="atlas-popup-title">${escapeHtml(title)}</div>${body}</div>`;
}

/**
 * La fiche d'un objet, au clic.
 *
 * `featureRendue` est celle que MapLibre vient de designer. Sur une couche
 * locale on lui prefere la feature source, qui porte la geometrie entiere —
 * MapLibre, lui, rend des geometries decoupees par tuile. Sur une couche
 * distante il n'y a pas de source : la feature rendue **est** tout ce qu'on
 * aura, et elle porte les attributs, qui sont ce que la fiche montre.
 */
function showViewFeaturePopup(layer, idx, lngLat, featureRendue = null) {
    if (!map || typeof maplibregl === 'undefined') return;
    const feature = layer.geojson?.features?.[idx] || featureRendue;
    if (!feature) return;
    closeViewPopup();
    if (bulleActive(layer)) { ouvrirBulle(layer, idx, feature, lngLat); return; }
    let coords = lngLat;
    if (!coords && feature.geometry?.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates;
        coords = { lng, lat };
    } else if (!coords && feature.geometry) {
        try {
            const b = boundsFromGeoJSON({ type: 'FeatureCollection', features: [feature] });
            if (b) coords = { lng: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 };
        } catch (_) {}
    }
    if (!coords) return;
    _viewPopup = new maplibregl.Popup({
        maxWidth: '300px',
        closeButton: true,
        closeOnClick: true,
        className: 'atlas-view-popup',
    })
        .setLngLat(coords)
        .setHTML(buildViewPopupHtml(layer, feature, idx))
        .addTo(map);
}

function selectInBox(a, b) {
    const layer = STATE.layers.find((l) => l.id === STATE.selection.layerId);
    if (!layer) return;
    const sw = map.unproject(a), ne = map.unproject(b);
    const minLng = Math.min(sw.lng, ne.lng), maxLng = Math.max(sw.lng, ne.lng);
    const minLat = Math.min(sw.lat, ne.lat), maxLat = Math.max(sw.lat, ne.lat);
    const set = new Set(STATE.selection.features);
    (layer.geojson.features || []).forEach((f, idx) => {
        if (f.geometry?.type !== 'Point') return;
        const [lng, lat] = f.geometry.coordinates;
        if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) set.add(idx);
    });
    STATE.selection.features = [...set];
    afterSelectionChange();
}

async function onLocationPick(e) {
    locationPickMode = false;
    map.getCanvas().style.cursor = '';
    const { lng, lat } = e.lngLat;
    STATE.location = { ...STATE.location, lat, lng, name: `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E` };
    lieuChoisi();
    if (STATE.currentModule === 'lieu') renderLieu();
    markDirty();
    showToast('Lieu défini', 'success');
    try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&lat=${lat}&lon=${lng}&accept-language=fr`, { headers: enTetesOSM({ Accept: 'application/json' }) });
        const d = await r.json();
        if (d?.display_name) { STATE.location.name = d.display_name.split(',').slice(0, 2).join(',').trim(); if (STATE.currentModule === 'lieu') renderLieu(); }
    } catch (e2) {}
}
function enterSelectionMode(layerId, idx, { consultation = false } = {}) {
    const coucheCliquee = STATE.layers.find((l) => l.id === layerId);
    const enSaisie = coucheEnSaisie(coucheCliquee) || coucheDansSaisiesEtape(coucheCliquee);
    if (_storyPresenting && _trajetSuivi) {
        const deja = _trajetPause;
        pauserSuiviTrajet();
        if (!deja) renderStoryPresentation();
    }
    // En lecture, la selection est refusee — sauf sur une couche dont la scene
    // a publie le formulaire : c'est tout l'objet du mode exploitation. Les
    // autres gardent le popup, qui montre sans permettre de corriger.
    // `consultation` : le geste « Voir la fiche » d'une bulle demande la fiche
    // en lecture seule ; sans lui, on rouvrait la bulle qu'on venait de quitter.
    if (CONFIG.viewMode && !enSaisie && !consultation) {
        const layer = STATE.layers.find((l) => l.id === layerId);
        if (layer && idx != null) showViewFeaturePopup(layer, idx);
        return;
    }
    document.body.classList.toggle('mode-saisie', enSaisie);
    // La pastille « Releve » a fait son office des qu'un objet est choisi :
    // ouverte, elle recouvrirait la barre de selection qui s'installe.
    if (_openDockPill === 'releve') $('map-controls-dock')?.classList.add('collapsed');
    STATE.selection.mode = true;
    STATE.selection.layerId = layerId;
    STATE.selection.features = idx != null ? [idx] : [];
    STATE.selection.multiIndex = 0;
    // Une selection ordinaire n'est pas une revue : le drapeau ne se leve que
    // dans `editLayerObjects`, apres cet appel.
    STATE.selection.revue = false;
    $('map-frame').classList.add('select-mode');
    $('selection-bar').classList.add('open');
    const layer = STATE.layers.find((l) => l.id === layerId);
    showToast(`Mode sélection : ${layer?.name || ''}`, 'info');
    afterSelectionChange();
    if (idx != null && !lecteurRecitActif()) flyToFeature(layer, idx);
}
function exitSelectionMode() {
    document.body.classList.remove('mode-saisie');
    const layer = STATE.layers.find((l) => l.id === STATE.selection.layerId);
    // Refermer un objet enregistrait les preferences de la couche. En mode
    // exploitation, ou l'on referme apres chaque saisie, cela ferait apparaitre
    // « Mode lecture — enregistrer les preferences indisponible » a chaque
    // objet — pour un reglage que personne n'a touche.
    if (layer && !CONFIG.viewMode) { saveLayerToGrist(layer, true); }
    STATE.selection = { mode: false, layerId: null, features: [], multiIndex: 0 };
    _derniereCreation = null;
    _derniereModification = null;
    $('map-frame').classList.remove('select-mode');
    $('selection-bar').classList.remove('open');
    clearHighlight();
    renderInspector();
}
function toggleSelect(idx) {
    const i = STATE.selection.features.indexOf(idx);
    if (i === -1) STATE.selection.features.push(idx); else STATE.selection.features.splice(i, 1);
}
function afterSelectionChange() {
    // On vient d'agir sur les objets : c'est leur fiche qu'on veut voir.
    ficheCedee = false;
    const n = STATE.selection.features.length;
    $('sel-label').innerHTML = `<strong>${n} objet${n > 1 ? 's' : ''}</strong> sélectionné${n > 1 ? 's' : ''}`;
    if (STATE.selection.multiIndex >= n) STATE.selection.multiIndex = 0;
    const rev = n > 1 ? rangRevue(STATE.layers.find((l) => l.id === STATE.selection.layerId)) : null;
    // Un objet seul, avec une tournée : son rang sur la ligne (« 4 / 12 »), puisque ◀ ▶ la suivent.
    const ordreSel = n === 1 ? ordreTournee(STATE.selection.layerId) : null;
    const rangSel = ordreSel ? rangDansTournee(ordreSel, `${STATE.selection.layerId}:${STATE.selection.features[0]}`) : null;
    $('sel-pos').textContent = rev ? `${rev.rang} / ${rev.total}` : (rangSel && rangSel.rang > 0 ? `${rangSel.rang} / ${rangSel.total}` : `${n} / ${n}`);
    multiBaseValues = null;
    updateHighlight();
    renderInspector();
}

/**
 * Couches du halo de selection, une par famille de geometrie.
 *
 * **Une couche `circle` posee sur un polygone dessine un disque par SOMMET.**
 * Le halo n'avait qu'elle : selectionner un batiment rectangulaire donnait
 * quatre pastilles de 16 px empilees, qui recouvraient entierement l'objet
 * qu'elles etaient censees designer — a z16, un batiment de 15 m fait une
 * poignee de pixels. Le halo avait ete concu pour des points, et n'avait jamais
 * ete repris pour les surfaces ni les lignes.
 *
 * Chacune est donc filtree sur le type de geometrie qu'elle sait rendre.
 */
// L'objet COURANT — celui dont la fiche est ouverte, en revue ◀ ▶ ou dans une
// sélection multiple — ressort sur les autres sélectionnés : plus opaque, trait
// plus épais, dessiné par-dessus. Tous au même halo, on ne savait pas lequel
// on était en train de modifier.
const EST_COURANT = ['==', ['get', '_courant'], true];
const HALO_SELECTION = [
    { id: 'sel-hl-fill', type: 'fill', types: ['Polygon', 'MultiPolygon'],
      paint: { 'fill-color': '#C44536', 'fill-opacity': ['case', EST_COURANT, 0.32, 0.08] } },
    { id: 'sel-hl-line', type: 'line', types: ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'],
      paint: { 'line-color': '#C44536', 'line-width': ['case', EST_COURANT, 4, 1.5],
               'line-opacity': ['case', EST_COURANT, 1, 0.55] } },
    { id: 'sel-hl-ring', type: 'circle', types: ['Point', 'MultiPoint'],
      paint: { 'circle-radius': ['case', EST_COURANT, 18, 11],
               'circle-color': ['case', EST_COURANT, 'rgba(196,69,54,0.22)', 'rgba(196,69,54,0.06)'],
               'circle-stroke-color': '#C44536', 'circle-stroke-width': ['case', EST_COURANT, 4, 1.5],
               'circle-stroke-opacity': ['case', EST_COURANT, 1, 0.55] } },
];

function updateHighlight() {
    const layer = STATE.layers.find((l) => l.id === STATE.selection.layerId);
    if (!layer) return;
    const sel = STATE.selection.features;
    const courant = sel.length > 1 ? sel[STATE.selection.multiIndex] : sel[0];
    // Copies marquées, le courant en dernier : il se dessine par-dessus les autres.
    const features = sel.filter((i) => i !== courant).concat(courant != null ? [courant] : [])
        .map((i) => layer.geojson.features[i]).filter(Boolean)
        .map((f, k, tout) => ({ ...f, properties: { ...(f.properties || {}), _courant: k === tout.length - 1 && courant != null } }));
    const data = { type: 'FeatureCollection', features };
    if (!map.getSource('sel-hl')) map.addSource('sel-hl', optionsSourceGeojson(data));
    else map.getSource('sel-hl').setData(data);
    for (const h of HALO_SELECTION) {
        if (map.getLayer(h.id)) continue;
        map.addLayer({
            id: h.id, type: h.type, source: 'sel-hl',
            filter: ['in', ['geometry-type'], ['literal', h.types]],
            paint: h.paint,
        });
    }
}
function clearHighlight() {
    for (const h of HALO_SELECTION) { if (map.getLayer(h.id)) map.removeLayer(h.id); }
    if (map.getSource('sel-hl')) map.removeSource('sel-hl');
}
/**
 * Amène un objet à la vue : un point au centre de la zone visible, une ligne ou
 * une surface dans la zone visible. Elle ne suivait que les points : en revue
 * ◀ ▶ d'une couche de surfaces, l'objet courant sortait de l'écran sans que la
 * caméra bouge (mesuré : 5/30 entièrement hors champ).
 */
function flyToFeature(layer, idx) {
    const g = layer?.geojson?.features?.[idx]?.geometry;
    if (!g || !map) return;
    if (g.type === 'Point') viserVol({ center: g.coordinates, zoom: Math.max(map.getZoom(), 17), duration: 600 });
    else garderVisible(g);
}

// Feature editing
let multiBaseValues = null;
function setFeatureOverride(layer, idx, param, value) {
    const f = layer.geojson.features[idx]; if (!f) return;
    if (!f.properties) f.properties = {};
    f.properties['_' + param] = value;
}
function clearFeatureOverrides(layer, idx) {
    const p = layer.geojson.features[idx]?.properties; if (!p) return;
    ['_scale', '_rotationX', '_rotationY', '_rotationZ', '_offsetX', '_offsetY', '_offsetZ', '_modelId'].forEach((k) => delete p[k]);
}

// ============================================================
// IMPORT — OSM (Overpass) & fichier
// ============================================================
async function openOSM() {
    titreModule('Import OSM', 'Zone importée = emprise visible, vue à plat. Zoomez pour réduire.');
    $('module-body').innerHTML = `
        <div class="range-info" id="osm-emprise" style="margin-bottom:12px">…</div>
        <div class="section"><div class="section-title">Objets prédéfinis</div>
            <div class="model-grid">${Object.entries(OSM_PRESETS).map(([k, p]) => `<div class="model-card" onclick="A.runOSM('${k}')"><div class="mi">${p.icon}</div><div class="mn">${p.name}</div></div>`).join('')}</div>
        </div>
        <div class="section"><button class="btn btn-soft btn-full" onclick="A.openModule('couches')">← Retour</button></div>`;
    majEmpriseOSM();
    // Inclinée, la vue court jusqu'à l'horizon, et l'emprise importée avec
    // elle : on importe ce qui est à l'écran, donc à plat (`lib/vue-import.js`).
    if (await mettreAPlat(map)) majEmpriseOSM();
}

/** L'emprise affichée dans le panneau d'import suit la carte. */
function majEmpriseOSM() {
    const el = $('osm-emprise');
    if (!el || !map) return;
    const b = map.getBounds();
    el.textContent = `${b.getSouth().toFixed(4)}, ${b.getWest().toFixed(4)} → ${b.getNorth().toFixed(4)}, ${b.getEast().toFixed(4)}`;
}

/**
 * Les en-têtes d'une requête OpenStreetMap (Overpass, Nominatim) : dans
 * l'application, Atlas se présente, sans quoi Overpass répond 406
 * (`lib/osm-requete.js`).
 */
function enTetesOSM(base) {
    const version = document.querySelector('meta[name="atlas-version"]')?.content || '';
    return enTetesOsm({ application: peutSAuthentifier(), version, base });
}

async function runOSM(key) {
    const preset = OSM_PRESETS[key]; if (!preset) return;
    // Inclinée depuis l'ouverture du panneau ? On remet à plat avant de lire
    // l'emprise.
    await mettreAPlat(map);
    showLoading('Interrogation OpenStreetMap…');
    try {
        const b = map.getBounds();
        const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
        const q = `[out:json][timeout:30];(${preset.query}(${bbox}););out body geom;`;
        const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: enTetesOSM({ 'Content-Type': 'application/x-www-form-urlencoded' }), body: 'data=' + encodeURIComponent(q) });
        if (!res.ok) throw new Error(messageRefusOsm(res.status));
        const data = await res.json();
        const geojson = osmToGeoJSON(data.elements || []);
        if (!geojson.features.length) { hideLoading(); showToast('Aucun résultat', 'warning'); return; }
        const geomType = preset.geomType || geojson.features[0].geometry.type;
        const layer = makeLayer(preset.name, geomType, geojson, preset.category, preset.model);
        // Un catalogue d'objets pointe qui reconnait ces objets les prend en
        // charge d'emblee ; le modele du preset devient leur repli.
        if (CATALOGUE_OBJETS.cat && layer.style.mode === 'library'
            && geojson.features.some((f) => resoudreObjet(CATALOGUE_OBJETS.cat, { source: 'osm', nom: layer.name }, f, { lod: 1 }))) {
            initSymbolization(layer).model.mode = 'catalogue';
        }
        finalizeNewLayer(layer);
        hideLoading();
        showToast(`${geojson.features.length} objets importés`, 'success');
    } catch (e) { hideLoading(); showToast('Erreur OSM : ' + e.message, 'error'); }
}
function osmToGeoJSON(elements) {
    const features = [];
    for (const el of elements) {
        let geometry = null;
        if (el.type === 'node' && el.lat != null) geometry = { type: 'Point', coordinates: [el.lon, el.lat] };
        else if (el.type === 'way' && el.geometry) {
            const coords = el.geometry.map((p) => [p.lon, p.lat]);
            const closed = coords.length > 3 && coords[0][0] === coords.at(-1)[0] && coords[0][1] === coords.at(-1)[1];
            geometry = (closed && (el.tags?.building || el.tags?.area === 'yes' || el.tags?.landuse)) ? { type: 'Polygon', coordinates: [coords] } : { type: 'LineString', coordinates: coords };
        }
        if (geometry) features.push({ type: 'Feature', geometry, properties: { _osmId: `${el.type}/${el.id}`, ...el.tags } });
    }
    return { type: 'FeatureCollection', features };
}

function makeLayer(name, geomType, geojson, category, modelId) {
    const color = randomColor();
    const is3DPoint = (geomType === 'Point' || geomType === 'MultiPoint') && modelId;
    const layer = {
        id: 'layer-' + Date.now() + '-' + Math.floor(Math.random() * 1e4),
        name, color, visible: true, geometryType: geomType,
        source: 'import', geojson,
        _modelCat: category || 'furniture',
        style: {
            mode: is3DPoint ? 'library' : 'mapbox',
            library: { modelId: modelId ? findModel(modelId)?.id : null },
            custom: {},
            common: { scale: modelId ? (findModel(modelId)?.scale || 1) : 1, rotationX: 0, rotationY: 0, rotationZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0 },
        },
    };
    initSymbolization(layer);
    return layer;
}

// ============================================================
// ENREGISTRER UNE COUCHE DANS GRIST (« entabler »)
// ============================================================
/**
 * Porte depuis `app.js` (pre-v7), ou cette fonctionnalite existait et a ete
 * perdue au passage a la v7 — sans decision, comme l'export QGIS et le modele
 * 3D en piece jointe. Le CLAUDE.md signalait ces deux-la ; celle-ci est une
 * TROISIEME perte, non documentee.
 *
 * ## Ce que ca change, et pourquoi c'est le prealable a tout le reste
 *
 * Un import OSM ou fichier depose aujourd'hui **une seule ligne** dans
 * `Maquette_Layers`, contenant tout le GeoJSON. Vingt-quatre arbres y font une
 * ligne. Aucun objet n'a donc de `_row_id`, et la fiche d'entite est en lecture
 * seule — non par choix, mais parce qu'il n'y a rien a mettre a jour.
 *
 * `entableLayer` cree une vraie table de donnees : une ligne par objet, la
 * geometrie en `geometry_json`, les attributs en colonnes typees. La couche est
 * ensuite reliee a cette table. Alors chaque objet a son `_row_id`, la fiche
 * devient editable, et le formulaire s'y applique.
 *
 * ## L'ecriture se fait par lots
 *
 * `BATCH = 200`. Un import OSM se compte en milliers d'entites ; une seule
 * `applyUserActions` avec tout dedans est un pari sur la taille de la charge
 * utile. Les lots donnent aussi un progres visible plutot qu'un long gel.
 */
function inferGristType(vals) {
    // Une chaîne qui ressemble à un nombre reste du texte : voir lib/schema-grist.js.
    return typeColonneDepuisValeurs(vals);
}

function sanitizeId(s) {
    // Les accents sont translittérés, pas supprimés : « Éclairage » donnait
    // `Atlas_clairage` (constaté le 11/09/2026), et un nom de table amputé ne
    // se retrouve plus dans la liste du document.
    const v = String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return (/^[a-zA-Z]/.test(v) ? v : '_' + v) || 'Col';
}

async function entableLayer(layer) {
    const feats = layer.geojson?.features || [];
    if (!feats.length) throw new Error('couche vide');
    const propNames = new Set();
    feats.forEach((f) => Object.keys(f.properties || {}).forEach((k) => { if (!k.startsWith('_') && k !== 'geometry_json') propNames.add(k); }));
    const attrCols = [...propNames];
    const colId = {}; attrCols.forEach((n) => colId[n] = sanitizeId(n));
    const OV = { _scale: 'scale', _rotationX: 'rotation_x', _rotationY: 'rotation_y', _rotationZ: 'rotation_z', _offsetX: 'offset_x', _offsetY: 'offset_y', _offsetZ: 'offset_z' };
    const ovMap = { scale: 'scale', rotation_x: 'rotationX', rotation_y: 'rotationY', rotation_z: 'rotationZ', offset_x: 'offsetX', offset_y: 'offsetY', offset_z: 'offsetZ' };
    const ovUsed = {};
    feats.forEach((f) => { const p = f.properties || {}; for (const k in OV) if (p[k] != null && p[k] !== '') ovUsed[OV[k]] = 1; });
    const is3D = layer.style?.mode === 'library' || layer.style?.mode === 'custom';
    const isPt = layer.geometryType === 'Point' || layer.geometryType === 'MultiPoint';
    const colDefs = [
        { id: 'geometry_json', label: 'Géométrie (GeoJSON)', type: 'Text' },
        ...attrCols.map((n) => ({ id: colId[n], label: n, type: inferGristType(feats.map((f) => f.properties?.[n])) })),
        ...Object.keys(ovUsed).map((cn) => ({ id: cn, label: cn, type: 'Numeric' })),
    ];
    if (is3D) colDefs.push({ id: 'model_id', label: 'model_id', type: 'Text' });
    // Jamais le nom d'une table d'Atlas, ni d'une table que le document a déjà :
    // une couche « Propositions » prendrait la place de la table qu'Atlas y
    // écrira un jour.
    const tableName = nomDeTableLibre(sanitizeId('Atlas_' + layer.name), Object.keys(STATE.schema || {}));
    const addRes = await grist.docApi.applyUserActions([['AddTable', tableName, colDefs]]);
    const actualTable = addRes?.retValues?.[0]?.table_id || tableName;
    if (isPt) { try { await grist.docApi.applyUserActions([['AddColumn', actualTable, 'model_glb', { type: 'Attachments', label: 'Modèle 3D (PJ)' }]]); } catch (e) {} }
    const BATCH = 200;
    for (let i = 0; i < feats.length; i += BATCH) {
        const batch = feats.slice(i, i + BATCH);
        const colData = { geometry_json: batch.map((f) => JSON.stringify(f.geometry)) };
        attrCols.forEach((n) => { colData[colId[n]] = batch.map((f) => { const v = f.properties?.[n]; return v == null ? null : (typeof v === 'object' ? JSON.stringify(v) : v); }); });
        for (const cn in ovUsed) colData[cn] = batch.map((f) => resolveFeatureProps(f, layer)[ovMap[cn]] ?? null);
        if (is3D) colData.model_id = batch.map((f) => resolveFeatureProps(f, layer).modelId || null);
        await grist.docApi.applyUserActions([['BulkAddRecord', actualTable, Array(batch.length).fill(null), colData]]);
    }
    const cols = await grist.docApi.fetchTable(actualTable);
    layer.geojson = tableToGeoJSON(cols, 'geometry_json');
    layer.kind = 'table'; layer.sourceTable = actualTable; layer.geometryColumn = 'geometry_json'; layer.source = 'grist-table';
    layer._perObjectColor = layer.geojson.features.some((f) => f.properties && f.properties.fill_color);
    indexFeatures(layer); removeLayerGfx(layer); addLayerToMap(layer); Models3D.scheduleBuild();
    // La couche est maintenant portee par une table : son apparence va dans
    // `Atlas_LayerPrefs` (cf. `clePrefsCouche`). La ligne de `Maquette_Layers`
    // reste, mais VIDEE de ses entites : elle devient l'inventaire qui dit que
    // la scene contient cette table (`ligneInventaire`). La supprimer, comme on
    // le faisait, faisait disparaitre la couche au rechargement.
    saveLayerToGrist(layer, true); markDirty();
    return layer.geojson.features.length;
}

function finalizeNewLayer(layer) {
    // Empiler au sommet mettrait un bâti importé après un réseau par-dessus lui.
    // On insère sous les géométries plus fines : surfaces, puis lignes, puis points.
    STATE.layers.splice(insertionIndex(STATE.layers, layer.geometryType), 0, layer);
    addLayerToMap(layer);
    updateRailBadge();
    fitToLayer(layer);
    markDirty();
    baselineApparence(layer);
    if (STATE.currentModule === 'couches' || STATE.currentModule === 'symbo') renderLayersPanel(STATE.currentModule);
    else openModule('couches');
    saveLayerToGrist(layer, true);
}
/**
 * Cadrer sur une couche — depuis ses entités, ou depuis ce qu'elle déclare.
 *
 * Une couche distante n'a pas ses entités ici : MapLibre les a, Atlas non. Son
 * emprise vient alors du manifeste (`bbox`), qui est justement là pour ça.
 *
 * @returns {boolean} vrai si le cadrage a eu lieu.
 */
/**
 * La marge du cadrage, bornée à la carte réelle. Avec le module et la fiche
 * ouverts, la carte ne fait qu'une centaine de pixels de large : 80 px de
 * chaque côté ne laissaient plus de place, et MapLibre refusait le cadrage sans
 * rien dire — « Zoomer sur la couche » annonçait un zoom qui n'avait pas lieu
 * (constaté le 26/09/2026).
 */
function margeCadrage() {
    const c = map?.getContainer?.();
    // Mesurée sur ce qui reste visible : sur téléphone, la feuille recouvre le
    // bas de la carte et entre dans la marge de la caméra (`margesActuelles`).
    const p = (typeof map?.getPadding === 'function' && map.getPadding()) || {};
    const largeur = (c?.clientWidth || 0) - (p.left || 0) - (p.right || 0);
    const hauteur = (c?.clientHeight || 0) - (p.top || 0) - (p.bottom || 0);
    const cote = Math.min(largeur, hauteur);
    return Math.max(0, Math.min(80, Math.floor(cote / 5)));
}

// ------------------------------------------------------------
// Visée de caméra et zone visible (audit des panneaux, 26/09/2026)
// ------------------------------------------------------------
// MapLibre fige au départ d'un vol le point d'écran où poser la cible. Un
// panneau qui s'ouvre ou se ferme en route décalait donc l'arrivée de la
// moitié de sa largeur (mesuré : +180 px à l'ouverture de la fiche, −130 px en
// fermant le module pendant « Zoomer sur la couche »). La dernière visée est
// retenue, et relancée depuis la position courante quand la carte change de
// taille avant l'arrivée.

let _visee = null;
let _tailleCarte = null;

function viserCadre(bounds, opts = {}) {
    _visee = { methode: 'fitBounds', cible: bounds, opts, debut: performance.now(), duree: opts.duration ?? 800 };
    map.fitBounds(bounds, opts);
}

function viserVol(opts = {}) {
    _visee = { methode: 'flyTo', opts, debut: performance.now(), duree: opts.duration ?? 1200 };
    map.flyTo(opts);
}

/** Relance la visée en cours, avec le temps qu'il lui restait. Rend vrai si elle l'a été. */
function relancerVisee() {
    const v = _visee;
    if (!v || !map?.isMoving()) return false;
    const reste = dureeRestante({ debut: v.debut, duree: v.duree, maintenant: performance.now() });
    if (reste < 60) return false;
    if (v.methode === 'fitBounds') viserCadre(v.cible, { ...v.opts, padding: margeCadrage(), duration: reste });
    else viserVol({ ...v.opts, duration: reste });
    return true;
}

/**
 * Ce qui recouvre la carte, comme marge de caméra : sur téléphone, la feuille
 * ouverte et la barre du bas ; en lecture de récit, la bulle. Au bureau les
 * panneaux rétrécissent la carte au lieu de la recouvrir : marge nulle.
 */
function margesActuelles({ bulle = null } = {}) {
    if (!map) return { top: 0, right: 0, bottom: 0, left: 0 };
    const c = map.getContainer();
    const tel = surTelephone();
    const feuilles = [];
    if (tel && Feuille) {
        if ($('module-panel')?.classList.contains('open')) feuilles.push(Feuille.ANCRAGES[feuillePosition] ?? 0);
        if ($('inspector')?.classList.contains('open')) feuilles.push(Feuille.ANCRAGES[fichePosition] ?? 0);
    }
    const barre = tel ? ($('mobile-nav')?.getBoundingClientRect().height || 0) : 0;
    const b = bulle ?? (_storyPresenting ? mesurerEtageRecit() : 0);
    return margesCarte({ hauteurCarte: c.clientHeight, hauteurEcran: window.innerHeight, feuilles, barreBas: barre, bulle: b });
}

/**
 * Pose la marge de caméra quand ce qui recouvre la carte change. Pendant une
 * visée, la marge est posée d'un coup et la visée relancée : l'objet arrive
 * directement dans la zone visible, sans second mouvement.
 */
/**
 * La marge demandée en dernier. On compare à elle, pas à la marge courante :
 * pendant la transition de 250 ms, la marge courante est encore l'ancienne.
 * Toucher un onglet fiche ouverte fermait la fiche (marge 56, en route) puis
 * ouvrait le module (marge 495) — égale à la marge courante, jugée inutile, et
 * la carte finissait à 56 sous une feuille de 439 px (mesuré le 26/09/2026).
 */
let _margesVisees = null;
const memesMarges = (a, b) => !!a && !!b && ['top', 'right', 'bottom', 'left'].every((k) => Math.round(a[k] || 0) === Math.round(b[k] || 0));

function appliquerMarges() {
    if (!map || typeof map.getPadding !== 'function' || _storyPresenting) return;
    const m = margesActuelles();
    const reference = _margesVisees || map.getPadding();
    if (memesMarges(reference, m) && memesMarges(map.getPadding(), m)) return;
    if (memesMarges(_margesVisees, m) && map.isMoving()) return;
    _margesVisees = m;
    if (_visee && map.isMoving()) {
        const v = _visee;
        map.setPadding(m);
        _visee = v;
        relancerVisee();
        return;
    }
    map.easeTo({ padding: m, duration: 250 });
}

function suivreTailleCarte() {
    const c = map.getContainer();
    const taille = `${c.clientWidth}x${c.clientHeight}`;
    const change = _tailleCarte !== null && taille !== _tailleCarte;
    _tailleCarte = taille;
    if (!change) return;
    if (!relancerVisee()) appliquerMarges();
}

/**
 * Amène une ligne ou une surface dans la zone visible, du plus petit
 * déplacement — ou la cadre si elle ne tient pas. Ne fait rien si elle est déjà
 * visible : un clic ne doit pas faire bouger une carte qui montre déjà ce
 * qu'on vise. Au bureau, la fiche qui s'ouvre retire 360 px à droite : un objet
 * cliqué près du bord passait dessous.
 */
function garderVisible(geometrie) {
    if (!map || !geometrie?.coordinates) return;
    // Une visée en cours vise déjà l'objet (recherche, « Zoomer ») : ne pas la couper.
    if (_visee && map.isMoving() && dureeRestante({ debut: _visee.debut, duree: _visee.duree, maintenant: performance.now() }) > 0) return;
    const coords = [];
    const collecter = (c) => {
        if (!Array.isArray(c)) return;
        if (typeof c[0] === 'number') { coords.push(c); return; }
        c.forEach(collecter);
    };
    collecter(geometrie.coordinates);
    if (!coords.length) return;
    const pas = Math.max(1, Math.ceil(coords.length / 2000));
    const emprise = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const bounds = new maplibregl.LngLatBounds();
    for (let i = 0; i < coords.length; i += pas) {
        const [lng, lat] = coords[i];
        bounds.extend([lng, lat]);
        const p = map.project([lng, lat]);
        emprise.minX = Math.min(emprise.minX, p.x); emprise.maxX = Math.max(emprise.maxX, p.x);
        emprise.minY = Math.min(emprise.minY, p.y); emprise.maxY = Math.max(emprise.maxY, p.y);
    }
    const c = map.getContainer();
    const r = deplacementPourVoir({
        emprise,
        carte: { largeur: c.clientWidth, hauteur: c.clientHeight },
        marges: map.getPadding(),
        marge: Math.min(24, margeCadrage()),
    });
    if (r.cadrer) viserCadre(bounds, { padding: margeCadrage(), maxZoom: map.getZoom(), duration: 600 });
    else if (r.dx || r.dy) map.panBy([r.dx, r.dy], { duration: 400 });
}

function fitToLayer(layer) {
    const bounds = new maplibregl.LngLatBounds();
    let any = false;
    (layer.geojson.features || []).forEach((f) => {
        const g = f.geometry; if (!g) return;
        const coords = g.type === 'Point' ? [g.coordinates] : g.coordinates.flat(g.type.includes('Multi') ? 2 : 1);
        coords.forEach((c) => { if (Array.isArray(c) && typeof c[0] === 'number') { bounds.extend(c); any = true; } });
    });
    if (any) {
        viserCadre(bounds, { padding: margeCadrage(), maxZoom: 18, duration: 800 });
        return true;
    }
    if (layer._bboxDeclaree) {
        viserCadre(layer._bboxDeclaree, { padding: margeCadrage(), maxZoom: 18, duration: 800 });
        return true;
    }
    return false;
}

function wireDrop() {
    const dz = $('drop'); if (!dz) return;
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); };
}
/** Une couche depuis un GeoJSON déjà lu ; rend le nombre d'objets ajoutés. */
function ajouterCoucheGeoJSON(nom, geojson) {
    const features = geojson.type === 'FeatureCollection' ? (geojson.features || []) : [geojson];
    if (!features.length) { showToast('GeoJSON vide : aucune couche ajoutée', 'warning'); return 0; }
    const geomType = features[0]?.geometry?.type || 'Point';
    const layer = makeLayer(nom, geomType, { type: 'FeatureCollection', features }, null, null);
    finalizeNewLayer(layer);
    return features.length;
}

/**
 * « Fichier » ajoute une couche — et dit ce qu'il a reçu quand ce n'en est pas
 * une. Un projet Atlas donné ici devenait une couche absurde, sans erreur.
 */
/** Un GPX, un KML ou un CSV devient une ou plusieurs couches ; ce qui est écarté se dit. */
function importerFichierFormat(nomFichier, contenu) {
    const res = lireFichier(nomFichier, contenu);
    let total = 0;
    for (const c of res.couches) total += ajouterCoucheGeoJSON(c.nom, c.geojson);
    if (!total) { showToast('Rien à importer dans ce fichier', 'warning'); return; }
    const ecart = res.ignorees ? ` ; ${res.ignorees} écarté${res.ignorees > 1 ? 's' : ''} (position illisible ou absente)` : '';
    showToast(`${total} élément${total > 1 ? 's' : ''} importé${total > 1 ? 's' : ''} · ${res.couches.length} couche${res.couches.length > 1 ? 's' : ''}${ecart}`, res.ignorees ? 'warning' : 'success');
}

async function processFile(file) {
    showLoading('Lecture du fichier…');
    try {
        const contenu = await file.text();
        if (natureFichier(file.name, contenu)) { hideLoading(); importerFichierFormat(file.name, contenu); return; }
        const obj = JSON.parse(contenu);
        const nature = natureJson(obj);
        hideLoading();
        if (nature !== 'geojson') { showToast(messageNature(nature), nature ? 'info' : 'error'); return; }
        const n = ajouterCoucheGeoJSON(file.name.replace(/\.[^.]+$/, ''), obj);
        if (n) showToast(`${n} élément${n > 1 ? 's' : ''} importé${n > 1 ? 's' : ''}`, 'success');
    } catch (e) { hideLoading(); showToast('Fichier illisible : ' + e.message, 'error'); }
}

/**
 * Relit une couche depuis sa table, quel que soit son producteur, et
 * resélectionne par `_row_id` ce qui l'était (`lignes`, lues AVANT la relecture).
 * @returns {Promise<number>} le nombre d'objets relus
 */
async function relireCouche(l, lignes = null) {
    if (l.source === 'qgis2grist') {
        const ml = (_sceneManifest?.layers || []).find((x) => (x.source?.table || x.id) === l.sourceTable);
        await refreshLayerFromTable(grist.docApi, l, _widgetConfig, ml);
        if (lignes) apresRelecture(l, lignes);
        syncFeatureColorsFromSymbolization(l);
        applyControls(l);
        syncLayerSourceData(l);
        Models3D.scheduleBuild();
        return l.geojson?.features?.length || 0;
    }
    const n = await reloadGenericTableLayer(l, true);
    if (lignes) apresRelecture(l, lignes);
    return n;
}

async function reloadGenericTableLayer(layer, force) {
    if (!CONFIG.grist.ready || layer.kind !== 'table' || !layer.sourceTable || !map) return 0;
    if (dirty && !force) return -1;
    const cols = await grist.docApi.fetchTable(layer.sourceTable);
    const gc = layer.geometryColumn || detectGeometryColumn(cols);
    layer.geometryFormat = formatGeometrie(cols, gc) || layer.geometryFormat || null;
    layer.geojson = tableToGeoJSON(cols, gc);
    indexFeatures(layer);
    applyControls(layer);
    if (map.getSource(layer.id)) syncLayerSourceData(layer);
    else addLayerToMap(layer);
    Models3D.scheduleBuild();
    return layer.geojson.features.length;
}

async function linkTableFromGrist(tableId, geomCol, data) {
    if (!CONFIG.grist.ready) { showToast('Grist requis', 'warning'); return; }
    if (STATE.layers.some((l) => l.sourceTable === tableId)) {
        showToast(`« ${tableId} » est déjà affichée`, 'info');
        return;
    }
    showLoading('Lecture de la table…');
    try {
        const cols = data || await grist.docApi.fetchTable(tableId);
        const gc = geomCol || detectGeometryColumn(cols);
        if (!gc) { hideLoading(); showToast('Aucune colonne géométrie', 'error'); return; }
        const fc = tableToGeoJSON(cols, gc);
        if (!fc.features.length) { hideLoading(); showToast('Table sans géométrie exploitable', 'warning'); return; }
        const layer = makeLayer(tableId, fc.features[0].geometry.type, fc, null, null);
        layer.kind = 'table';
        layer.sourceTable = tableId;
        layer.geometryColumn = gc;
        // WKT ou GeoJSON : la forme lue est celle qu'on réécrira.
        layer.geometryFormat = formatGeometrie(cols, gc);
        layer.source = 'grist-table';
        layer.controls = [];
        await finalizeNewLayer(layer);
        hideLoading();
        showToast(`« ${tableId} » liée · ${fc.features.length} objets`, 'success');
    } catch (e) {
        hideLoading();
        showToast('Erreur : ' + e.message, 'error');
    }
}

// ============================================================
// GRIST (persistance — optionnelle, mode standalone OK)
// ============================================================
const TABLE_SCHEMAS = {
    Maquette_Layers: [
        { id: 'Name', label: 'Nom', type: 'Text' },
        { id: 'Color', label: 'Couleur', type: 'Text' },
        { id: 'Visible', label: 'Visible', type: 'Bool' },
        { id: 'GeomType', label: 'Type', type: 'Text' },
        { id: 'StyleJSON', label: 'Style (JSON)', type: 'Text' },
        { id: 'GeoJSON', label: 'GeoJSON', type: 'Text' },
    ],
};
/**
 * Les FormDef du document, s'il y en a.
 *
 * Table creee a la demande par qgis2grist : absente sur la plupart des
 * documents, et c'est le cas normal. On garde une liste vide plutot que `null`
 * pour que l'appelant n'ait pas a distinguer « pas de table » de « pas de
 * formulaire pour cette couche » — les deux donnent le meme repli.
 */
async function chargerFormulaires() {
    // La pastille « Releve » depend des formulaires, qui arrivent APRES la
    // carte : sans ce rafraichissement, elle n'apparaitrait qu'au prochain
    // geste qui redessine le dock — c'est-a-dire, pour un lecteur, jamais.
    try { await lireFormulairesDuDocument(); } finally { refreshControlsDock(); }
}

async function lireFormulairesDuDocument() {
    STATE.formulaires = [];
    STATE.formulairesGrist = [];
    STATE.formulairesTable = false;
    // Le schema porte les types des colonnes, donc les `Ref:` qui disent quelles
    // tables referencent une couche, et de quoi deduire un formulaire de celles
    // qui n'en ont pas. Sans lui il ne reste que l'enregistre.
    //
    // Les memes metadonnees portent les formulaires natifs de Grist : ceux que
    // l'equipe a deja soignes (questions, ordre, obligatoires) servent tels
    // quels, sans rien recomposer ici.
    const meta = CONFIG.grist.ready ? await chargerMeta(grist.docApi, { vues: true }) : null;
    STATE.schema = meta ? schemaDepuisMeta(meta.tables, meta.colonnes) : {};
    if (meta?.sections && window.FormDefFromGristForm) {
        try { STATE.formulairesGrist = window.FormDefFromGristForm.formulairesGrist(meta); } catch (e) {
            console.warn('[Atlas formulaire] formulaires Grist', e.message);
        }
    }
    if (!CONFIG.grist.ready) return;
    try {
        const tables = await grist.docApi.listTables();
        if (!tables.includes('Formulaires')) return;
        STATE.formulairesTable = true;
        STATE.formulaires = lireFormulaires(await grist.docApi.fetchTable('Formulaires'));
    } catch (e) {
        console.warn('[Atlas formulaire] chargement', e.message);
    }
}

/**
 * Les formulaires d'une couche — le principal, puis les lies.
 *
 * Une seule porte, parce que trois endroits en ont besoin : les onglets de la
 * fiche, le clic sur la carte qui choisit entre le popup et la fiche, et le
 * module qui les liste. Les recalculer chacun de son cote aurait fait trois
 * verites pour une seule question.
 */
/** Les formulaires du document : ceux de `Formulaires`, puis ceux de Grist. */
function entreesFormulaires() {
    return [...(STATE.formulaires || []), ...(STATE.formulairesGrist || [])];
}

function formulairesDeLaCouche(layer, { avecRetires = false } = {}) {
    const tous = formulairesPourCouche({
        couche: layer,
        entrees: entreesFormulaires(),
        schema: STATE.schema,
    });
    // Seul le module Formulaires voit les retirés : c'est là qu'on les remet.
    return avecRetires ? tous : formulairesEnPlace(tous);
}

async function syncStoryFromGrist() {
    if (!CONFIG.grist.ready) return;
    // Une seule lecture rend le recit et le nombre de lignes qui le portent.
    // Les compter par un second `fetchTable` provoquait un `[Sandbox] KeyError
    // 'Atlas_Story'` a chaque chargement d'un document sans recit.
    const { recit, aReecrire } = await chargerRecitGrist(grist.docApi);
    STATE.story = recit;
    rafraichirTrajet();
    refreshStoryNavChrome();
    if (CONFIG.viewMode) return;
    // Des lignes sans cle (table ecrite avant les cles) ou des reliquats en double :
    // on met la table en ordre, ce qui pose les cles. Au mieux : un refus ici ne dit
    // rien des droits de la personne, il sera redit a la premiere vraie ecriture.
    if (aReecrire) {
        try { await saveStoryToGrist(grist.docApi, STATE.story, { viewMode: CONFIG.viewMode }); }
        catch (e) { console.warn('[Atlas story] mise en ordre', e.message); }
    }
}

function assertCanWrite(actionLabel) {
    if (canWrite(CONFIG.viewMode)) return true;
    showToast('Mode lecture — ' + actionLabel + ' indisponible', 'warning');
    return false;
}

// ---- Droits d'écriture par table (lib/droits-tables.js) ----
// Atlas n'a pas UN droit pour tout le document : Grist règle l'écriture table par
// table. Il apprend de ce qui s'est passé — une écriture réussie, un refus de
// droits sur une seule table — et n'en tire que cela.
let DROITS = creerDroits();

/** Apprend d'une écriture ; si une table de relevé refuse, son formulaire cesse d'être offert. */
function apprendreDroits(actions, erreur) {
    const a = apprendre(DROITS, { actions, erreur, estRefusDeDroits: isWriteAclError });
    if (a.change && a.verdict === 'refus' && a.attribue && categorieTable(a.tables[0]) === 'releve') {
        showToast(`Écriture refusée dans « ${a.tables[0]} » — ce formulaire n’est plus proposé`, 'warning');
        // Le dock et les modules suivent ; la fiche ouverte, elle, garde ce qu'on y a saisi.
        refreshControlsDock();
        if (STATE.currentModule === 'formulaires') renderFormulaires();
    }
    return a;
}

/**
 * Toute écriture passe par ici : le registre apprend du résultat, et l'erreur
 * revient inchangée à qui l'a causée, avec les tables qu'elle touchait
 * (`tablesAtlas`) pour que son appelant sache ce que le refus signifie.
 */
function surveillerEcritures(docApi) {
    if (!docApi || docApi._droitsSurveilles || typeof docApi.applyUserActions !== 'function') return;
    const origine = docApi.applyUserActions.bind(docApi);
    docApi.applyUserActions = async (actions, ...reste) => {
        try {
            const resultat = await origine(actions, ...reste);
            apprendreDroits(actions, null);
            return resultat;
        } catch (e) {
            const a = apprendreDroits(actions, e);
            try { if (e && typeof e === 'object') e.tablesAtlas = a.tables; } catch (_) { /* erreur figée */ }
            throw e;
        }
    };
    docApi._droitsSurveilles = true;
}

/** Un formulaire dont la table refuse n'est plus offert : il refuserait chaque fois. */
function formulaireUtilisable(f) { return DROITS.verdict(f?.tableId) !== 'refus'; }

/** Les formulaires qu'on peut proposer hors édition, sauf ceux dont la table refuse. */
function offertsEnLecture(formulaires) {
    return formulairesOffertsEnLecture(formulaires).filter(formulaireUtilisable);
}

// ---- Postures (lib/posture.js) ----
// Préparer, Exploiter, Lecture : ce que `viewMode` et `peutSaisir` disaient sans
// le nommer. La posture est DÉRIVÉE de ces deux champs (`postureDepuis`), jamais
// stockée à côté : deux vérités sur le même fait seraient une panne en attente.

/**
 * Ce que le lien d'ouverture autorise au plus. `?mode=view` plafonne à Exploiter : un
 * éditeur qui suit un lien de terrain ne retombe pas en Préparer parce que la posture
 * retenue sur son appareil, ou le repli, le proposerait. Lu une fois, à l'ouverture.
 */
const PLAFOND_LIEN = (() => {
    try { return parseAtlasMode(typeof location !== 'undefined' ? location.search : '') === 'view' ? 'exploiter' : null; } catch (_) { return null; }
})();

/** Les tables où un formulaire proposé hors édition écrit. */
function tablesDeReleve() {
    const tables = new Set();
    for (const layer of STATE.layers) {
        for (const f of formulairesOffertsEnLecture(formulairesDeLaCouche(layer))) tables.add(f.tableId);
        // Ajouter un objet est aussi un relevé : la table de la couche entre dans ce que *Exploiter* écrit.
        if (creationProposeeEnExploitation(layer) && layer.sourceTable) tables.add(layer.sourceTable);
    }
    return [...tables];
}

/** Les postures qu'on peut proposer maintenant : d'après ce qu'on sait des droits, jamais d'après ce qu'on suppose. */
function posturesDisponibles() {
    return posturesOffertes({
        droits: DROITS,
        documentOuvert: !!CONFIG.grist.ready,
        sceneExterne: !!CONFIG.sceneExterne,
        tablesDeReleve: tablesDeReleve(),
        plafond: PLAFOND_LIEN,
    });
}

/** Un choix existe-t-il ? Avec une seule posture offerte, le menu n'aurait rien à proposer. */
function peutChangerDePosture() { return posturesDisponibles().length > 1; }

/** Pourquoi une posture n'est pas offerte, dit à la personne qui la cherche. */
function raisonPostureNonOfferte(posture) {
    if (CONFIG.sceneExterne) return 'Scène ouverte par adresse : lecture seule';
    if (DROITS.lectureSeule) return 'Le document est en lecture seule pour vous';
    if (posture === 'preparer') return PLAFOND_LIEN ? 'Ce lien ouvre en exploitation : rouvrez le document sans « mode » pour régler' : 'Vos droits ne permettent pas de régler la configuration';
    return tablesDeReleve().length
        ? 'Le document refuse l’écriture dans les tables de relevé'
        : 'Aucun formulaire de relevé n’est proposé : à régler en Préparer';
}

/** La seule écriture de `viewMode` et `peutSaisir` après l'ouverture. */
function appliquerPosture(posture, { memoriser = false } = {}) {
    if (posture === 'preparer') quitterContexte();
    const etat = etatDePosture(posture);
    CONFIG.viewMode = etat.viewMode;
    CONFIG.peutSaisir = etat.peutSaisir;
    applyViewModeChrome();
    updateMobileLayout();
    if (memoriser) memoriserPosture(posture);
}

async function clePosture() { return `atlas_posture|${await idDuDocumentLocal()}`; }
async function memoriserPosture(posture) {
    try { localStorage.setItem(await clePosture(), posture); } catch (_) { /* stockage refusé : le choix ne sera pas retenu */ }
}
async function postureMemorisee() {
    try { return localStorage.getItem(await clePosture()); } catch (_) { return null; }
}

let _postureChoisie = false;
/**
 * La posture d'ouverture, une fois les couches et les formulaires connus (c'est
 * d'eux que dépend ce qu'on peut proposer) : le dernier choix de la personne, sur
 * cet appareil, s'il est encore offert ; dans l'application, Exploiter.
 */
async function choisirPostureAuDemarrage() {
    if (_postureChoisie || !CONFIG.grist.ready || CONFIG.sceneExterne) return;
    _postureChoisie = true;
    const actuelle = postureDepuis(CONFIG);
    const voulue = postureParDefaut({
        offertes: posturesDisponibles(),
        memorisee: await postureMemorisee(),
        initiale: actuelle,
        application: peutSAuthentifier(),
    });
    if (voulue !== actuelle) appliquerPosture(voulue);
}

function fermerMenuPosture() {
    document.getElementById('posture-menu')?.remove();
    document.removeEventListener('pointerdown', _fermetureMenuPosture, true);
    document.removeEventListener('keydown', _toucheMenuPosture, true);
}
function _fermetureMenuPosture(e) { if (!e.target.closest?.('#posture-menu')) fermerMenuPosture(); }
function _toucheMenuPosture(e) { if (e.key === 'Escape') { e.stopPropagation(); fermerMenuPosture(); } }

/**
 * Le choix de posture, depuis le badge, l'avatar, le bouton de la carte ou le
 * menu de l'application. Les postures non offertes restent LISIBLES, avec la
 * raison : « Préparer » qui disparaît sans un mot ferait chercher ce qui manque.
 */
function ouvrirMenuPosture(ancre = null) {
    fermerMenuPosture();
    const offertes = posturesDisponibles();
    const courante = postureDepuis(CONFIG);
    const menu = document.createElement('div');
    menu.id = 'posture-menu';
    menu.className = 'posture-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Posture');
    menu.innerHTML = `<div class="posture-titre">Que faites-vous ici ?</div>` + POSTURES.map((p) => {
        const l = LIBELLES[p];
        const offerte = offertes.includes(p);
        return `<button type="button" role="menuitemradio" class="posture-choix${p === courante ? ' on' : ''}"
            aria-checked="${p === courante}" data-posture="${p}"${offerte ? '' : ' disabled'}>
            <span class="posture-nom">${echapper(l.nom)}${p === courante ? ' <small>en cours</small>' : ''}</span>
            <span class="posture-aide">${echapper(offerte ? l.aide : raisonPostureNonOfferte(p))}</span>
        </button>`;
    }).join('');
    document.body.appendChild(menu);
    menu.addEventListener('click', (e) => {
        const b = e.target.closest('[data-posture]');
        if (!b || b.disabled) return;
        fermerMenuPosture();
        if (b.dataset.posture === courante) return;
        appliquerPosture(b.dataset.posture, { memoriser: true });
        showToast(`${LIBELLES[b.dataset.posture].nom} — ${LIBELLES[b.dataset.posture].aide}`, 'info');
    });
    // Sous l'ancre sur un écran large ; en feuille basse sur téléphone.
    if (ancre && !surTelephone()) {
        const r = ancre.getBoundingClientRect();
        menu.style.top = `${Math.min(r.bottom + 8, window.innerHeight - menu.offsetHeight - 12)}px`;
        menu.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - menu.offsetWidth - 12))}px`;
    } else {
        menu.classList.add('posture-feuille');
    }
    document.addEventListener('pointerdown', _fermetureMenuPosture, true);
    document.addEventListener('keydown', _toucheMenuPosture, true);
    menu.querySelector('.posture-choix.on, .posture-choix:not([disabled])')?.focus();
}

/** L'infobulle de tout ce qui ouvre le choix de posture. */
function titrePosture() {
    return `Changer de posture (en cours : ${LIBELLES[postureDepuis(CONFIG)].nom})`;
}

function enterViewModeOnWriteFail(err) {
    if (CONFIG.viewMode) return false;
    // Seul un refus de droits dit « vous ne pouvez pas écrire ». Une colonne
    // manquante, une table renommée, une coupure réseau ne le disent pas :
    // basculer la session en lecture sur ces erreurs-là retirait l'édition à
    // un éditeur, pour toute la session, à cause d'un défaut d'un seul geste.
    // L'appelant affiche l'erreur ; la session reste en édition.
    if (!isWriteAclError(err)) return false;
    // Un refus sur UNE table de l'équipe (corriger la forme d'un ouvrage) ne dit
    // rien de la configuration d'Atlas : l'éditeur la garde. Et un refus sur une
    // table de configuration ne la retire que si plus aucune ne se laisse écrire
    // — un refus partiel (le récit, pas les préférences) le dit à son tour.
    // Un refus qu'on ne sait pas imputer à une table vaut comme avant.
    const tables = Array.isArray(err?.tablesAtlas) ? err.tablesAtlas : [];
    if (tables.length === 1) {
        const partielle = categorieTable(tables[0]) === 'configuration' && configurationEcrivable(DROITS);
        if (categorieTable(tables[0]) === 'releve' || partielle) {
            showToast(`Écriture refusée dans « ${tables[0]} »`, 'warning');
            return false;
        }
    }
    // Un refus franc de la configuration vaut pour la session : Préparer n'est plus
    // offerte. L'agent de relevé garde Exploiter (ses tables se jugent une à une),
    // la lecture sinon.
    DROITS.refuserPreparation();
    const repli = posturesDisponibles().includes('exploiter') ? 'exploiter' : 'lecture';
    appliquerPosture(repli);
    const msg = err?.message || String(err || '');
    showToast(`Écriture refusée — passage en ${repli === 'exploiter' ? 'exploitation' : 'lecture'}` + (msg ? ` (${msg})` : ''), 'warning');
    return true;
}

/**
 * Badge de droits — dit ce qui est vrai, pas une identité inventée.
 *
 * Le jeton d'accès Grist ne livre qu'un `userId` : sans annuaire dans le
 * document, on ne peut afficher ni nom ni initiales. L'information utile et
 * disponible, c'est le droit dont on dispose sur ce document.
 *
 * Quand l'écriture est réellement autorisée, l'avatar devient la bascule
 * session lecture ↔ édition (essayage : `viewMode` bascule, `peutSaisir` non).
 */
/** L'icone de chaque posture : la meme dans la barre et sur la carte. */
const ICONES_POSTURE = Object.freeze({
    preparer: icTrait(IC.crayon, 18),
    exploiter: icTrait(IC.releve, 18),
    lecture: icTrait(IC.oeil, 18),
});

/**
 * Ce que dit la barre de ses droits : le bouton de posture (la même icône, le même nom que le bouton de la carte)
 * et, si l'on sait qui est connecté, l'avatar. L'avatar ne fait plus que dire qui : la bascule est le bouton de posture.
 *
 * Le bouton de posture est toujours là. Quand rien ne peut changer (un seul droit), il dit seulement la posture,
 * sans ouvrir de menu : « je ne peux rien écrire » et « je peux remplir les formulaires » restent deux situations
 * différentes, et c'est ici qu'on vient chercher ce qu'on a le droit de faire.
 */
function updateUserBadge() {
    const lecture = !!CONFIG.viewMode;
    const posture = postureDepuis(CONFIG);
    const bascule = peutChangerDePosture();
    const droit = { preparer: 'Édition autorisée', exploiter: 'Exploitation — relevé des formulaires publiés', lecture: 'Lecture seule' }[posture];
    const u = CONFIG.grist.user;

    const avatar = $('user-badge');
    if (avatar) {
        avatar.hidden = !u?.initiales;
        if (u?.initiales) {
            avatar.textContent = u.initiales;
            avatar.title = `${u.name || u.email} — ${droit}`;
        }
        avatar.classList.toggle('ro', lecture);
    }

    const titre = bascule ? titrePosture() : `${LIBELLES[posture].nom} — ${droit}`;
    const posee = (el) => {
        el.querySelector('.posture-ic').innerHTML = ICONES_POSTURE[posture];
        el.title = titre;
        el.setAttribute('aria-label', titre);
        el.setAttribute('aria-disabled', String(!bascule));
    };
    const barre = $('btn-posture');
    if (barre) {
        posee(barre);
        barre.querySelector('.posture-lib').textContent = LIBELLES[posture].nom;
    }
    // Barre retirée (application en lecture) : la bascule reste un bouton de la carte, pour qui peut écrire.
    const carte = $('hote-edition');
    if (carte) {
        carte.hidden = !(bascule && lecture);
        posee(carte);
    }
}

/**
 * Changer de posture : le bouton de la barre, celui de la carte et le menu de
 * l'application ouvrent le même choix. La bascule lecture ↔ édition à deux états
 * ne pouvait ni exploiter sans éditer, ni regarder en lecture un éditeur qui peut
 * écrire.
 */
function basculerLectureEditionSession(ancre = null) {
    if (!peutChangerDePosture()) return;
    ouvrirMenuPosture(ancre);
}

function wireBasculeLectureEdition() {
    // Deux vrais boutons, un seul geste : le clavier et le clic passent par `click`.
    $('btn-posture')?.addEventListener('click', (e) => basculerLectureEditionSession(e.currentTarget));
    $('hote-edition')?.addEventListener('click', (e) => basculerLectureEditionSession(e.currentTarget));
    $('btn-synchro')?.addEventListener('click', (e) => ouvrirPanneauSynchro(e.currentTarget, e));
    $('btn-enreg')?.addEventListener('click', (e) => ouvrirPanneauEnreg(e.currentTarget));
    $('btn-annuler')?.addEventListener('click', () => annulerApparence());
    $('btn-retablir')?.addEventListener('click', () => retablirApparence());
    $('hote-synchro')?.addEventListener('click', (e) => ouvrirPanneauSynchro(e.currentTarget, e));
}

/**
 * Renseigne l'identité affichée par le badge.
 *
 * Point d'entrée unique pour une future source de noms — un annuaire dans le
 * document, à la manière de TaskFlow. L'API Grist ne convient pas : mesuré le
 * 2026-08-05, `GET {baseUrl}/access` répond **403** avec un jeton de document
 * (authentifié mais hors périmètre — la gestion du partage n'en fait pas
 * partie). Voir docs/CADRAGE-IDENTITE-ACL.md §A.
 *
 * @param {{name?: string, email?: string}|null} u
 */
function setUserIdentity(u) {
    CONFIG.grist.user = u ? { ...u, initiales: initialsFrom(u.name, u.email) } : null;
    updateUserBadge();
}

/**
 * `?navbar=false` retire la barre du haut.
 *
 * Pour une integration en cadre — une page qui porte deja son titre et sa
 * navigation —, la barre d'Atlas fait doublon et prend une hauteur qu'on ne
 * recupere pas.
 *
 * > **Posee une fois, au chargement.** Elle ne depend que de l'URL, qui ne
 * > change pas : la mettre dans `updateMobileLayout` la faisait relire a chaque
 * > redimensionnement, et surtout n'arrivait qu'apres la porte d'accueil — la
 * > barre restait visible tant qu'on ne s'etait pas connecte. Une decision qui
 * > ne varie pas se prend au demarrage, pas dans une fonction de disposition
 * > dont le nom promet autre chose.
 */
const NAVBAR_DEMANDEE = parseNavbarParam(typeof location !== 'undefined' ? location.search : '');

/**
 * Retire la barre du haut quand `barreRetiree` le dit : sur demande de la page,
 * ou dans l'application en lecture. Rejouée à chaque changement de mode — la
 * lecture s'allume et s'éteint en cours de session.
 *
 * Dans l'application, ce que portait la barre passe sur la carte
 * (`#commandes-hote`) : le menu principal, la recherche, et le retour à
 * l'édition par le menu. Sans elles, une scène ouverte en lecture n'aurait
 * plus de sortie — ni changer de scène, ni repasser en édition.
 */
function appliquerBarre() {
    let application = false;
    try { application = peutSAuthentifier(); } catch (_) { /* hors application */ }
    const retiree = barreRetiree({ navbarParam: NAVBAR_DEMANDEE, application, lecture: !!CONFIG.viewMode });
    const avant = !!CONFIG.sansNavbar;
    CONFIG.sansNavbar = retiree;
    document.body.classList.toggle('sans-navbar', retiree);
    // Les commandes de remplacement ne servent que là où un hôte existe : une
    // page qui a demandé `?navbar=false` porte déjà sa propre navigation.
    document.body.classList.toggle('commandes-hote-visibles', retiree && application);
    // La carte gagne ou perd la hauteur de la barre.
    if (avant !== retiree && map) resizeMapSoon();
}
appliquerBarre();

function applyViewModeChrome() {
    // Changer de posture referme la liste : ce qu'elle ouvre n'est plus le même. Il faut aussi
    // fermer le panneau : `fermerListe({ rendre: false })` n'efface que l'état, et la liste restait
    // affichée sous Préparer (relevé à l'essai du 02/10/2026), où la recherche d'un objet rendait
    // ensuite une fiche dans un panneau resté en mode liste.
    const listeOuverte = !!_liste;
    fermerListe({ rendre: false });
    if (listeOuverte) closeInspectorPanel();
    document.body.classList.toggle('view-mode', !!CONFIG.viewMode);
    appliquerBarre();
    updateUserBadge();
    refreshViewerControlsHud();
    refreshStoryNavChrome();
    refreshControlsDock();
    if (CONFIG.viewMode) {
        // Lecture = carte + FAB récit ; jamais panneau atelier (même Récit) au boot
        closeModulePanel();
        closeInspectorPanel();
    }
}

/**
 * Récit en lecture : la pastille du dock, rien d'autre (pas de rail, pas de
 * bouton de barre). Le dock se redessine ici parce que le récit arrive souvent
 * après le premier rendu — sans cet appel, la pastille n'apparaissait qu'au
 * prochain changement de contrôle.
 */
function refreshStoryNavChrome() {
    const hasStory = (STATE.story?.length || 0) > 0;
    document.body.classList.toggle('view-has-story', !!(CONFIG.viewMode && hasStory));
    const railRecit = document.querySelector('.rail-item[data-module="recit"]');
    if (railRecit) {
        if (CONFIG.viewMode) railRecit.hidden = true;
        else railRecit.hidden = false;
    }
    if (CONFIG.viewMode && STATE.currentModule === 'recit') closeModulePanel();
    refreshControlsDock();
}

/** Contrôles canvas publiés (active) — interaction lecteur, pas config éditeur. */
function collectPublishedControls() {
    const out = [];
    for (const layer of STATE.layers) {
        for (const c of (layer.controls || [])) {
            if (c.active) out.push({ layer, c });
        }
    }
    return out;
}

/** HUD rect lecture — désactivé (dock pastilles, spec D12). T6 : pastilles données sur le dock. */
function refreshViewerControlsHud() {
    const el = $('viewer-controls');
    if (!el) return;
    el.classList.remove('has-controls', 'collapsed');
    el.innerHTML = '';
}

/* ------------------------------------------------------------------ */
/* La feuille mobile                                                    */
/* ------------------------------------------------------------------ */

let Feuille = null;              // charge a la demande : le bureau n'en a pas besoin
let feuillePosition = 'fermee';  // module : 'fermee' | 'demi' | 'pleine'
let fichePosition = 'fermee';    // fiche d'un objet (l'inspecteur), memes positions
/**
 * Ou etait la feuille des modules quand la fiche l'a repliee — pour la lui
 * rendre a la fermeture. `null` : rien a rendre.
 */
let feuilleAvantFiche = null;

async function chargerFeuille() {
    if (!Feuille) Feuille = await import('./lib/feuille-mobile.js?v=20260821a');
    return Feuille;
}

const surTelephone = () => document.body.classList.contains('mobile-layout');

/**
 * Pose une feuille a une position.
 *
 * Au repos, la feuille a la hauteur qu'on voit (`--feuille-frac`) : tout son
 * contenu est donc a portee de defilement, jusqu'au dernier bouton. La
 * translation n'intervient que PENDANT le geste (voir `installerGlissement`).
 */
function poserPanneau(p, nom) {
    if (!p || !Feuille) return;
    p.style.setProperty('--feuille-frac', String(Feuille.ANCRAGES[nom] ?? 0));
    // Repliee, une feuille garde sa bordure et son ombre : un trait d'un pixel
    // au-dessus de la barre du bas, qu'on prend pour un defaut d'affichage.
    p.classList.toggle('feuille-repliee', nom === 'fermee');
    // La caméra vise ce que la feuille laisse visible.
    appliquerMarges();
}

function poserFeuille(nom) {
    const p = $('module-panel');
    if (!p || !Feuille) return;
    feuillePosition = nom;
    poserPanneau(p, nom);
    if (nom === 'fermee') {
        document.querySelectorAll('#mobile-nav [data-mobile-tab]').forEach((b) => b.classList.remove('active'));
    }
}

/**
 * Pose la fiche. La replier tout a fait, c'est la fermer : une fiche a hauteur
 * nulle mais « ouverte » garderait la selection et tiendrait la feuille des
 * modules repliee, sans rien montrer.
 */
function poserFiche(nom) {
    const p = $('inspector');
    if (!p || !Feuille) return;
    if (nom === 'fermee') { closeInspectorByUser(); return; }
    fichePosition = nom;
    poserPanneau(p, nom);
}

/**
 * Sur telephone, UNE feuille a la fois — et la fiche prime.
 *
 * La fiche d'un objet (z 36) se posait sur la feuille des modules (z 35), qui
 * restait ouverte dessous : deux panneaux empiles, le second masquant presque
 * tout le premier. Mesure sur un ecran de 844 px : fiche de 324 a 788, feuille
 * des modules de 349 a 788. La fiche est le detail de ce qu'on regardait ; elle
 * replie donc la feuille des modules, et la lui rend en se fermant, a la
 * hauteur ou elle l'avait trouvee.
 */
async function ouvrirFicheMobile() {
    await chargerFeuille();
    const insp = $('inspector');
    if (!insp || !insp.classList.contains('open') || !surTelephone()) return;
    installerGlissement(insp, {
        corps: () => $('insp-body'),
        prise: '.feuille-poignee, .insp-head, .insp-tabs',
        position: () => fichePosition,
        poser: poserFiche,
    });
    if (feuillePosition !== 'fermee' && feuilleAvantFiche == null) {
        feuilleAvantFiche = feuillePosition;
        poserFeuille('fermee');
    }
    if (fichePosition === 'fermee') poserFiche('demi');
}

function fermerFicheMobile() {
    const insp = $('inspector');
    fichePosition = 'fermee';
    if (insp && Feuille) poserPanneau(insp, 'fermee');
    // La feuille des modules retrouve la hauteur qu'elle avait — si le module
    // est toujours la. Il a pu etre ferme entre-temps.
    const rendre = feuilleAvantFiche;
    feuilleAvantFiche = null;
    if (rendre && $('module-panel')?.classList.contains('open')) poserFeuille(rendre);
}

/** Le module et la fiche partagent la meme mecanique de glissement. */
async function installerFeuilleMobile() {
    const p = $('module-panel');
    if (!p) return;
    await chargerFeuille();
    installerGlissement(p, {
        corps: () => p.querySelector('#module-body'),
        prise: '.feuille-poignee, .module-head',
        position: () => feuillePosition,
        poser: poserFeuille,
    });
}

/**
 * Le glissement, qui remplace l'ancien onglet « Carte ».
 *
 * On n'allait pas « a la carte » : elle est dessous, en permanence. On ecarte
 * ce qui la masque — et pendant l'edition d'un recit, c'etait le seul moyen de
 * cadrer la vue, sauf que le bouton se trouvait sous la feuille a ecarter.
 *
 * Il ne servait qu'a la feuille des modules. La fiche d'un objet n'avait rien :
 * hauteur figee a 55 % de l'ecran, pas de poignee, pas de position. C'est la
 * meme mecanique, appliquee aux deux.
 *
 * @param {HTMLElement} p
 * @param {{corps: () => HTMLElement|null, prise: string,
 *          position: () => string, poser: (nom: string) => void}} o
 */
function installerGlissement(p, { corps, prise, position, poser }) {
    const F = Feuille;
    if (!p || !F || p.dataset.feuille) return;
    p.dataset.feuille = '1';

    if (!p.querySelector(':scope > .feuille-poignee')) {
        const poignee = document.createElement('div');
        poignee.className = 'feuille-poignee';
        poignee.setAttribute('aria-hidden', 'true');
        p.prepend(poignee);
    }

    let geste = null;

    p.addEventListener('pointerdown', (e) => {
        if (!surTelephone()) return;
        geste = {
            y0: e.clientY, t0: e.timeStamp, y: e.clientY, t: e.timeStamp,
            depart: position(),
            surPoignee: !!e.target.closest(prise),
            defilement: corps()?.scrollTop ?? 0,
            pris: false, id: e.pointerId,
        };
    });

    p.addEventListener('pointermove', (e) => {
        if (!geste || e.pointerId !== geste.id) return;
        const dy = e.clientY - geste.y0;
        if (!geste.pris) {
            if (Math.abs(dy) < 6) return;    // laisser passer les taps
            if (!F.gestePourLaFeuille({
                surPoignee: geste.surPoignee, defilement: geste.defilement, versLeBas: dy > 0,
            })) { geste = null; return; }
            geste.pris = true;
            // Le bord haut ne bouge pas en changeant de regime : la hauteur
            // passe a 92 %, la translation compense exactement.
            p.classList.add('feuille-glisse');
        }
        geste.y = e.clientY;
        geste.t = e.timeStamp;
        p.style.setProperty('--feuille-frac',
            String(F.fractionPendantGeste(geste.depart, dy, window.innerHeight)));
        e.preventDefault();
    }, { passive: false });

    const finir = (e) => {
        if (!geste || (e && e.pointerId !== geste.id)) return;
        const g = geste; geste = null;
        if (!g.pris) return;
        const dt = Math.max(0.016, (g.t - g.t0) / 1000);
        const vitesse = -((g.y - g.y0) / window.innerHeight) / dt;   // positif = vers le haut
        const arrivee = F.ancrageApresGeste({
            depart: g.depart,
            fraction: F.fractionPendantGeste(g.depart, g.y - g.y0, window.innerHeight),
            vitesse,
        });
        finirGlissement(p, () => poser(arrivee));
    };
    p.addEventListener('pointerup', finir);
    p.addEventListener('pointercancel', finir);
}

/**
 * Quitte le regime « glissement » sans saut, puis anime vers l'arrivee.
 *
 * Retirer `.feuille-glisse` fait passer la feuille de « 92 % translatee » a
 * « hauteur = fraction courante » : meme bord haut, donc rien ne bouge — a
 * condition qu'aucune transition ne s'en mele. On fige, on applique, on libere,
 * et seulement alors on pose la position d'arrivee, qui s'anime.
 */
function finirGlissement(p, poser) {
    p.classList.add('feuille-fige');
    p.classList.remove('feuille-glisse');
    void p.offsetHeight;                 // appliquer le changement de regime maintenant
    p.classList.remove('feuille-fige');
    poser();
}

function updateMobileLayout() {
    const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
    document.body.classList.toggle('mobile-layout', narrow);
    // Précharger la mécanique des feuilles : sans elle, le premier toucher d'un
    // onglet attendait son chargement, et un second toucher rapide tombait dans
    // le vide (menu « Plus » pas encore branché).
    if (narrow) chargerFeuille().catch(() => {});
    CONFIG.light3d = shouldEnableLight3d({
        viewMode: CONFIG.viewMode,
        no3dParam: parseNo3dParam(typeof location !== 'undefined' ? location.search : ''),
        isNarrow: narrow,
        hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8,
    });
    if (CONFIG.light3d && typeof Models3D !== 'undefined') {
        Models3D._disabled = true;
    }
    // La barre du bas apparaît ou disparaît : la caméra vise ce qui reste.
    if (map?.loaded?.()) appliquerMarges();
}

/**
 * La marque « Atlas » ouvre le menu principal — dans l'application seulement.
 *
 * Le widget n'a rien au-dessus de sa scene : la marque y reste inerte, et le
 * chevron ne s'affiche pas. C'est aussi le point ou viendront s'accrocher les
 * modules a venir, sans toucher a la carte.
 */
async function cablerMenuPrincipal() {
    const marque = document.querySelector('.brand');
    if (!marque) return;
    let hote;
    try { hote = await import('./lib/hote-ui.js?v=20261002g'); } catch (_) { return; }
    let caps;
    try {
        const dc = await import('./lib/data-client.js?v=20261001a');
        caps = dc.capacites();
    } catch (_) { return; }
    // Widget : rien au-dessus de la scene. Navigateur sans compte : le menu
    // n'aurait rien a offrir — ni liste de scenes, ni connexion possible. Une
    // marque actionnable qui ouvre un menu vide vaut moins que pas de bouton.
    if (caps.mode === 'grist' || !caps.decouverte) return;

    marque.classList.add('brand-menu');
    marque.setAttribute('role', 'button');
    marque.setAttribute('tabindex', '0');
    marque.setAttribute('aria-label', 'Menu principal');
    const ouvrir = () => {
        // En lecture, la barre est retirée et sa bascule avec elle : le menu
        // offre le retour à l'édition, quand la personne peut écrire.
        const bascule = CONFIG.viewMode && peutChangerDePosture();
        hote.ouvrirMenuPrincipal({
            scene: { nom: STATE.projectName || 'Scène en cours' },
            modifie: dirty,
            edition: bascule
                ? {
                    libelle: 'Changer de posture',
                    aide: `En cours : ${LIBELLES[postureDepuis(CONFIG)].nom}`,
                    action: () => basculerLectureEditionSession(null),
                }
                : null,
        });
    };
    marque.addEventListener('click', ouvrir);
    marque.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); }
    });
    // Le même menu, depuis la carte quand la barre est retirée (lecture).
    $('hote-menu')?.addEventListener('click', ouvrir);
}

/**
 * Allume l'onglet du module ouvert. Un module sans onglet (Lieu, Soleil, Vues,
 * Formulaires, Réglages) vient de « Plus » : c'est lui qui s'allume. Sinon la
 * barre n'affichait rien d'actif, et l'on ne savait plus d'où venait la
 * feuille ouverte.
 */
function allumerOngletMobile(module) {
    const onglets = [...document.querySelectorAll('#mobile-nav [data-mobile-tab]')];
    const direct = onglets.some((b) => b.dataset.mobileTab === module);
    const cible = !module ? null : (direct ? module : 'plus');
    onglets.forEach((b) => b.classList.toggle('active', b.dataset.mobileTab === cible));
}

/** La feuille des modules que la barre du bas ne peut pas porter. */
function ouvrirFeuilleModules() {
    const f = $('mobile-plus');
    if (!f) return;
    f.hidden = false;
    const fermer = () => {
        f.hidden = true;
        // L'onglet « Plus » ne reste pas actif : il ouvre, il ne selectionne pas.
        allumerOngletMobile(STATE.currentModule);
    };
    f.querySelector('.mp-fond').onclick = fermer;
    f.querySelectorAll('[data-module-plus]').forEach((b) => {
        // En lecture, `openModule` refuse ces modules avec un message. Les
        // laisser visibles offrirait quatre boutons qui disent tous non —
        // autant ne pas les proposer. C'est la meme regle que le rail, qui les
        // masque en mode lecture.
        b.hidden = CONFIG.viewMode && VIEW_AUTHOR_MODULES.has(b.dataset.modulePlus);
        b.onclick = () => { fermer(); openModule(b.dataset.modulePlus); };
    });
    // Enregistrer, charger, exporter : dans l'en-tete sur un ecran large, nulle
    // part sur un telephone. On pouvait donc tout modifier sans jamais rien
    // enregistrer — le pire endroit ou manquer un bouton.
    const actions = {
        enregistrer: () => saveProject(),
        charger: () => $('file-input')?.click(),
        exporter: () => exportProject(),
    };
    f.querySelectorAll('[data-action-plus]').forEach((b) => {
        b.onclick = () => { fermer(); actions[b.dataset.actionPlus]?.(); };
    });
}

function wireMobileNav() {
    document.querySelectorAll('#mobile-nav [data-mobile-tab]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const tab = btn.dataset.mobileTab;
            // Toucher l'onglet deja ouvert referme la feuille : c'est ce qui
            // remplace l'ancien onglet « Carte », sous le doigt plutot qu'a
            // l'autre bout de la barre — et sous la feuille qu'il fallait ecarter.
            const F = await chargerFeuille();
            const actif = document.querySelector('#mobile-nav [data-mobile-tab].active')?.dataset.mobileTab;
            if (tab !== 'plus' && F.ancrageApresOnglet({
                ongletActif: actif, onglet: tab, position: feuillePosition,
            }) === 'fermee') {
                closeModulePanel();
                // Une création en cours n'est pas abandonnée par un onglet : sa
                // fiche revient (`closeModulePanel` la rend). Seule une fiche
                // d'objet se referme avec la feuille.
                if (!_saisieObjet) A.closeInspector?.();
                return;
            }
            document.querySelectorAll('#mobile-nav [data-mobile-tab]').forEach((b) => {
                b.classList.toggle('active', b === btn);
            });
            // Choisir un module dans la barre, c'est vouloir le voir : la fiche
            // ouverte lui cede la place (une feuille a la fois). Elle revient
            // des qu'on touche un objet. La feuille « Plus » est un menu pose
            // par-dessus, elle ne demande rien a la fiche.
            if (tab !== 'plus' && $('inspector')?.classList.contains('open')) {
                ficheCedee = true;
                feuilleAvantFiche = null;
                closeInspectorPanel();
            }
            if (tab === 'couches') {
                if (CONFIG.viewMode) return;
                openModule('couches');
            } else if (tab === 'plus') {
                // Lieu, Soleil, Vue et Reglages n'ont pas d'onglet : le rail qui
                // les portait est masque sur telephone. Sans cette feuille, ils
                // sont simplement inatteignables — dont la source du catalogue 3D,
                // qui n'a aucun autre acces.
                ouvrirFeuilleModules();
            } else if (tab === 'controles') {
                // Filtrer sur le terrain est l'usage premier : c'est ce qui
                // permet de ne garder a l'ecran que les objets qu'on va voir.
                // En lecture, les controles exposes vivent dans le dock ; le
                // module d'auteur, lui, reste ferme.
                if (CONFIG.viewMode) {
                    showToast('Utilisez les pastilles de la carte pour filtrer', 'info');
                    return;
                }
                openModule('controles');
            } else if (tab === 'recit') {
                if (CONFIG.viewMode && !(STATE.story?.length)) {
                    showToast('Aucun récit publié', 'info');
                    return;
                }
                openModule('recit');
            }
        });
    });
}

async function initGrist() {
    // Une scène venue d'une adresse n'est pas de confiance : n'importe qui peut
    // fabriquer l'URL et la faire ouvrir, alors qu'une scène lue dans le
    // document a forcément été posée par quelqu'un qui pouvait y écrire.
    // Atlas ne lui donne donc pas le document — `grist.ready()` n'est jamais
    // appelé, `docApi` n'existe pas, et rien ne s'écrit nulle part.
    if (CONFIG.sceneExterne) {
        console.info('[Atlas] scène externe — le document n’est pas ouvert');
        return;
    }
    if (typeof grist === 'undefined') { console.log('Grist indisponible — mode standalone'); return; }
    const search = typeof location !== 'undefined' ? location.search : '';
    // Les droits transmis par Grist font autorité ; ?mode= ne peut que restreindre.
    const acc = resolveAccess({ search });
    // Grist a annoncé la lecture seule : aucune table ne s'écrit, sans discussion.
    DROITS = creerDroits({ lectureSeule: acc.reason === 'grist-readonly' });
    try {
        grist.ready({ requiredAccess: acc.requiredAccess });
        CONFIG.grist.ready = true;
        surveillerEcritures(grist.docApi);
        CONFIG.viewMode = acc.viewMode;
        // `viewMode` dit « Atlas ne montre pas ses outils d'auteur ».
        // `peutSaisir` dit « cette personne peut ecrire dans le document ».
        // Les deux se confondaient, et c'est pourquoi un formulaire expose hors
        // edition n'aurait servi a personne : le garde d'ecriture le refusait
        // avant meme de regarder les droits.
        CONFIG.peutSaisir = !acc.viewMode;
        // Sonde uniquement quand Grist n'a rien transmis (ouverture hors Grist,
        // version ancienne) : sinon on croit ce que le document annonce.
        if (acc.needsProbe) {
            // La sonde écrit dans UNE table : son verdict vaut pour elle, pas pour
            // tout le document (un agent qui n'écrit que les relevés se faisait
            // classer en lecture parce que la sonde visait `Atlas_LayerPrefs`).
            const sonde = await sonderEcritureDoc(grist.docApi);
            const writable = sonde.ecrivable;
            if (sonde.certain && sonde.table) DROITS.noter(sonde.table, writable ? 'ecriture' : 'refus');
            if (sonde.certain && !writable) DROITS.refuserPreparation();
            CONFIG.peutSaisir = writable;
            if (!writable) {
                CONFIG.viewMode = true;
                console.info('[Atlas] Accès sans écriture — mode lecture');
            }
        } else if (CONFIG.viewMode) {
            console.info('[Atlas] Mode lecture —', acc.reason);
            // Une lecture demandee par l'URL n'est PAS une privation de droits :
            // c'est le cas du lien de terrain, ou l'on veut precisement que la
            // personne remplisse un formulaire sans voir les outils d'auteur.
            //
            // > **On ne predit pas ce que Grist repondra.** Une sonde ici serait
            // > une PREDICTION du verdict des regles d'acces — et elle sondait
            // > une table choisie par `resolveProbeTableId`, pas celle de la
            // > couche : sous une ACL par table, elle aurait declare en lecture
            // > seule exactement les personnes pour qui le formulaire est
            // > expose. Le cadrage identite le dit deja : « le widget n'a pas
            // > besoin de connaitre l'email pour que les regles s'appliquent,
            // > c'est Grist qui filtre ».
            //
            // Atteindre cette branche signifie deja que Grist n'a PAS annonce la
            // lecture seule (sinon `resolveAccess` aurait rendu
            // `grist-readonly`). C'est tout ce qu'on peut savoir de vrai avant
            // d'ecrire, et c'est assez : un refus reel bascule la session par
            // `enterViewModeOnWriteFail`, avec son motif.
            CONFIG.peutSaisir = acc.reason === 'mode-view';
        }
        // Identité : le jeton livre l'userId — suffisant pour marquer l'auteur
        // d'une préférence ou d'un récit. Le nom, lui, n'est pas accessible par
        // l'API (cf. setUserIdentity et docs/CADRAGE-IDENTITE-ACL.md §A).
        try {
            const tok = await grist.docApi.getAccessToken({ readOnly: true });
            CONFIG.grist.userId = decodeAccessToken(tok?.token)?.userId ?? null;
        } catch (e) {
            CONFIG.grist.userId = null;
        }
        // Dans l'application, on se présente avec la clé : le profil dit qui est connecté (le widget, lui, ne le sait pas).
        if (grist.user?.email || grist.user?.name) setUserIdentity(grist.user);
        applyViewModeChrome();
        CONFIG.docMode = await detectDocMode(grist.docApi);
        if (CONFIG.docMode === 'scene-manifest') {
            await loadFromSceneManifest();
            startSceneManifestPolling();
        } else {
            await initGristTables();
            await loadLayersFromGrist();
        }
        await syncStoryFromGrist();
        await chargerFormulaires();
        // Ce qu'on peut proposer dépend des formulaires : la posture d'ouverture se
        // choisit maintenant (dernier choix retenu, ou Exploiter dans l'application).
        await choisirPostureAuDemarrage();
        await syncScenePrefsFromGrist();
        STATE.layers.forEach(baselineApparence);
        majIndicateurEnregistrement();
        accueilSceneNeuve();
        brancherSynchro();
        refreshControlsDock();
        appliquerOuverture();
        if (postureDepuis(CONFIG) === 'lecture') {
            showToast('Mode lecture — consultation seule', 'warning');
        }
    } catch (e) {
        console.warn('Grist init:', e.message);
        // > **`intent` n'existait plus.** La variable a ete renommee `acc` dans
        // > le `try` le 05/08/2026 ; ce `catch` a garde l'ancien nom. Il ne
        // > s'atteint que si l'initialisation a deja echoue — donc le repli en
        // > lecture, sa seule raison d'etre, levait un ReferenceError au lieu
        // > de s'executer, et emportait avec lui tout ce qui suit. Un mois en
        // > ligne sans que rien ne le dise : `node --check` valide la syntaxe,
        // > et une lecture de propriete n'est pas un appel.
        //
        // La condition d'origine — « ni lecture demandee, ni acces restreint »
        // — se dit d'un mot avec `acc` : `viewMode` est vrai exactement dans
        // ces deux cas. Redemander `read table` a une session deja en lecture
        // fermerait d'ailleurs l'ecriture au widget lui-meme, ce qui est
        // precisement le defaut corrige dans `resolveAccess`.
        //
        // > **Et il faut un document pour se replier dessus.** `reason: 'probe'`
        // > veut dire que Grist n'a RIEN transmis : pas d'hote, donc rien a lire.
        // > Reparer ce catch l'a rendu atteignable, et il a aussitot bascule la
        // > page autonome en lecture — rail masque, badge 👁 — alors que sa porte
        // > d'accueil promet exactement l'inverse : « vous pourrez charger un
        // > fichier, importer depuis OpenStreetMap et travailler localement ».
        // > Regression constatee a l'ecran le 08/09/2026, le jour meme de la
        // > correction : un repli mort depuis un mois ne se reveille pas sans
        // > qu'on regarde ou il atterrit.
        // > **Sans hote, `ready` doit retomber a faux.** Il est pose juste apres
        // > `grist.ready()`, avant le premier appel reel — or hors Grist cet
        // > appel echoue, et rien ne le remettait a faux. Les 28 chemins qui le
        // > lisent croyaient donc tenir un document : le module Formulaires
        // > affichait l'interface Grist au lieu de « Hors Grist », et la sonde
        // > tentait un `applyUserActions` dans un document inexistant. Vu dans
        // > la console de la page autonome, le 10/09/2026.
        if (acc.reason === 'probe') CONFIG.grist.ready = false;
        if (!acc.viewMode && acc.reason !== 'probe') {
            try {
                grist.ready({ requiredAccess: 'read table' });
                CONFIG.grist.ready = true;
                CONFIG.viewMode = true;
                // On est ici parce que l'acces complet a echoue : rien ne
                // s'ecrira, formulaire ou pas.
                CONFIG.peutSaisir = false;
                applyViewModeChrome();
                CONFIG.docMode = await detectDocMode(grist.docApi);
                if (CONFIG.docMode === 'scene-manifest') {
                    await loadFromSceneManifest();
                    startSceneManifestPolling();
                } else {
                    await loadLayersFromGrist();
                }
                await syncStoryFromGrist();
                showToast('Accès limité — mode lecture', 'warning');
            } catch (e2) {
                console.warn('Grist init lecture:', e2.message);
            }
        }
    }
}
async function initGristTables() {
    if (CONFIG.viewMode) return;
    if (!assertCanWrite('créer les tables maquette')) return;
    const tables = await grist.docApi.listTables();
    if (!tables.includes('Maquette_Layers')) {
        try {
            await grist.docApi.applyUserActions([['AddTable', 'Maquette_Layers', TABLE_SCHEMAS.Maquette_Layers]]);
        } catch (e) {
            enterViewModeOnWriteFail(e);
        }
    }
}

/** Monte les couches sur la carte (après chargement Grist). */
function mountLoadedLayers(bounds) {
    updateRailBadge();
    if (!map) return;
    // Le cadrage se pose **tout de suite**, hors de la file d'attente du style.
    // `fitBounds` n'a besoin que de la carte, pas de ses tuiles ; et surtout,
    // celui qui monte les couches connaît les bornes du manifeste, alors que le
    // rappel d'`onStyleReady` ne sait que les calculer depuis les entités
    // locales — qu'une couche distante n'a pas. Les laisser tous deux dans la
    // file les mettrait en concurrence : le premier servi poserait
    // `_initialViewportApplied` et l'autre n'aurait plus la main.
    applyInitialViewport(bounds || computeLayersBounds());
    scheduleMapLayersSync(() => {
        const remount = () => {
            if (!mapStyleUsable()) return;
            syncAllLayersToMap();
            const r = reconcilePanelVisibilityToMap();
            if (r.fixed) updateLegend();
            if (CONFIG.viewMode) refreshViewerControlsHud();
        };
        map.once('moveend', remount);
        map.once('idle', remount);
        setTimeout(remount, 700);
        setTimeout(remount, 1500);
    });
    if (CONFIG.viewMode) {
        applyViewModeChrome();
        refreshViewerControlsHud();
    }
}

/** Doc qgis2grist : Scene Manifest + tables métier. */
async function loadFromSceneManifest() {
    try {
        const manifest = await loadLatestSceneManifest(grist.docApi);
        if (!manifest) {
            showToast('SceneManifest vide — fallback maquette', 'warning');
            await initGristTables();
            await loadLayersFromGrist();
            return;
        }
        _sceneManifest = manifest;
        _widgetConfig = await loadQgisWidgetConfig(grist.docApi);
        const prefs = await loadLayerPrefs(grist.docApi);
        const { layers, projectName, bounds: rawBounds, echecs } = await loadSceneManifestLayers(
            grist.docApi, manifest, _widgetConfig
        );
        // Une scene amputee doit le dire. Elle s'affichait jusqu'ici comme une
        // scene complete : rien ne distinguait une couche en echec d'une couche
        // qu'on avait choisi de ne pas mettre.
        signalerCouchesManquantes(echecs);
        for (const layer of layers) {
            applyLayerPrefs(layer, prefs);
            if (layer.visible !== false && layer._deferredLoad) {
                materializeDeferredLayer(layer, DEFERRED_OPTS);
            }
        }
        STATE.layers.push(...layers);
        // Les couches ajoutées à la main — copies, tables enregistrées ou liées
        // depuis Atlas — ne sont pas dans le manifeste. Sans cette lecture,
        // elles disparaissaient au rechargement d'un document qgis2grist.
        await loadLayersFromGrist({
            monter: false,
            dejaLiees: new Set(layers.map((l) => l.sourceTable).filter(Boolean)),
            dejaNommees: new Set(layers.map((l) => l.name).filter(Boolean)),
        });
        // Rangs enregistrés : les prefs priment sur l'ordre du manifest, comme
        // pour le reste du style. Sans rang, l'ordre du manifest est conservé.
        STATE.layers = sortByRank(STATE.layers, Object.fromEntries(
            STATE.layers.filter((l) => Number.isFinite(l._rank)).map((l) => [l.sourceTable || l.id, l._rank])
        ));
        layers.forEach((layer) => {
            (layer.controls || []).forEach((c) => repairSelectControlFromManifest(layer, c));
            sanitizeBrokenSelectFilters(layer);
            prepareLayerFilters(layer);
        });
        if (projectName) {
            STATE.projectName = projectName;
            const el = $('project-name');
            if (el) el.textContent = projectName;
        }
        const bounds = boundsFromVisibleLayers(layers) || rawBounds;
        mountLoadedLayers(bounds);
        const visCount = layers.filter((l) => l.visible !== false).length;
        const hiddenBasemap = layers.filter((l) => l.visible === false);
        // Les couches ajoutées à la main comptent aussi : le toast annonçait
        // « 2 couche(s) » sur une scène qui en montrait 4.
        const ajoutees = STATE.layers.length - layers.length;
        const enPlus = ajoutees > 0 ? ` + ${ajoutees} ajoutée${ajoutees > 1 ? 's' : ''} dans Atlas` : '';
        if (hiddenBasemap.length) {
            showToast(
                `${visCount} couche(s)${enPlus} · ${hiddenBasemap.length} contexte masquée(s) (buildings…) — « Tout » pour tout voir`,
                'warning'
            );
        } else {
            showToast(`qgis2grist · ${layers.length} couche(s) du manifeste${enPlus}`, 'success');
        }
        console.log('[Atlas v7] Scene Manifest', manifest.version, layers.length, 'couches');
    } catch (e) {
        console.warn('loadFromSceneManifest:', e);
        showToast('Scene Manifest : ' + e.message, 'error');
    }
}

/**
 * Monter une scène venue d'une adresse.
 *
 * Le jumeau de `loadFromSceneManifest`, moins tout ce qui touche au document :
 * ni préférences, ni récit enregistré, ni sondage. La différence tient au
 * premier argument passé au chargeur — `null` au lieu de `docApi` —, et c'est
 * cette absence qui fait tomber les couches `source.table` dans les échecs
 * déclarés, avec le message qui envoie les publier.
 */
async function monterSceneExterne(manifest) {
    try {
        const { layers, projectName, bounds: rawBounds, echecs } =
            await loadSceneManifestLayers(null, manifest, null);
        signalerCouchesManquantes(echecs);

        STATE.layers.push(...layers);
        // Pas de préférences enregistrées ici : l'ordre est celui que le
        // manifeste déclare, et il n'y a rien d'autre pour le contredire.
        STATE.layers = sortByRank(STATE.layers, Object.fromEntries(
            STATE.layers.filter((l) => Number.isFinite(l._rank)).map((l) => [l.sourceTable || l.id, l._rank])
        ));
        layers.forEach((layer) => {
            (layer.controls || []).forEach((c) => repairSelectControlFromManifest(layer, c));
            sanitizeBrokenSelectFilters(layer);
            prepareLayerFilters(layer);
        });
        if (projectName) {
            STATE.projectName = projectName;
            const el = $('project-name');
            if (el) el.textContent = projectName;
        }

        // Ambiance déclarée dans le manifeste portable (labels, soleil…).
        // Le fond (basemap) est appliqué après le premier idle — un setStyle
        // pendant le montage faisait planter `getStyle().layers`.
        const ms = manifest.settings;
        let wantBasemap = null;
        if (ms && typeof ms === 'object') {
            if (ms.basemap && BASEMAPS[ms.basemap]) wantBasemap = ms.basemap;
            if (typeof ms.labels === 'boolean') STATE.settings.labels = ms.labels;
            if (typeof ms.shadows === 'boolean') STATE.settings.shadows = ms.shadows;
            if (typeof ms.sky === 'boolean') STATE.settings.sky = ms.sky;
            if (Number.isFinite(ms.timeOfDay)) STATE.settings.timeOfDay = ms.timeOfDay;
            appliquerHorlogeDeclaree(horlogeDepuisReglages(ms));
            if (typeof ms.terrain3D === 'boolean') STATE.settings.terrain3D = ms.terrain3D;
            // Le relief se déclare entier : sa source et son facteur. Posés avant
            // le montage, ils sont lus par `addTerrainSource` au premier style.
            if (ms.terrainSource && TERRAIN_SOURCES[ms.terrainSource]) STATE.settings.terrainSource = ms.terrainSource;
            if (Number.isFinite(ms.terrainExaggeration) && ms.terrainExaggeration > 0) {
                STATE.settings.terrainExaggeration = ms.terrainExaggeration;
            }
        }
        // Les contrôles offerts au lecteur (soleil et date, vue, fonds). Un
        // document les tient dans ses préférences ; une scène externe n'avait
        // aucun moyen de les déclarer — un lecteur ne pouvait donc pas passer
        // à la nuit, ce qui retire tout l'intérêt d'une scène d'éclairage.
        const vcDecl = manifest.viewer_controls || manifest.viewerControls || ms?.viewer_controls;
        if (Array.isArray(vcDecl)) STATE.viewerControls = parseViewerControls(vcDecl);

        // Le cadrage `camera` que la scène déclare l'emporte sur l'emprise des
        // données, et se pose d'un saut (`jumpTo`) : il n'était pas lu, et le
        // `fitBounds` animé de repli était coupé par le `setStyle` du fond
        // ci-dessous — la scène s'ouvrait au centre par défaut (vérifié le
        // 24/09/2026, scène d'essai du Jarret ouverte sur le Vieux-Port).
        // Une caméra de session proche des données (rechargement après
        // navigation) garde la main, comme pour le cadrage sur l'emprise.
        const emprise = boundsFromVisibleLayers(layers) || rawBounds;
        const camDecl = cameraDeclaree(manifest);
        if (camDecl && map && !_initialViewportApplied && (!emprise || shouldAutoFitBounds(emprise))) {
            map.jumpTo(camDecl);
            _initialViewportApplied = true;
        }
        mountLoadedLayers(emprise);
        applyLabelsVisibility();
        updateLighting();
        // Le fond du manifeste se pose **tout de suite**, pas au premier
        // `idle`.
        //
        // Attendre `idle` le faisait tomber pendant le vol de caméra de la
        // première étape du récit : le `setStyle` coupait le vol, et la scène
        // s'ouvrait à plat, sur la caméra de la session précédente. Le poser
        // ici, avant que le récit ne démarre, sert les deux cas — et il sert
        // surtout la **sortie** du récit, qui rend la scène à l'état d'avant :
        // sans lui, cet état était le fond par défaut, jamais celui que la
        // scène déclare.
        if (wantBasemap && map) {
            try {
                A.setBasemap?.(wantBasemap);
                map.once('idle', () => applyLabelsVisibility());
            } catch (_) { /* ignore */ }
        }

        if (!layers.length) {
            showToast('Scène chargée, mais aucune couche affichable', 'warning');
        } else {
            showToast(`Scène externe · ${layers.length} couche(s)`, 'success');
        }

        // Récit embarqué dans le Scene Manifest (story.steps) — pas de table Grist.
        const steps = manifest.story?.steps;
        if (Array.isArray(steps) && steps.length) {
            STATE.story = assurerCles(steps.map((s) => ({
                cle: s.cle || s.id || '',
                title: s.title || '',
                text: s.description || s.text || '',
                state: s.state || {},
            })));
            refreshStoryNavChrome();
            // Lancer quand la carte s'est stabilisée — style du manifeste
            // compris. Un délai fixe partait au milieu du changement de fond.
            const lancer = () => {
                try { A.storyPlay?.(0); } catch (e) { console.warn('[Atlas] récit externe', e); }
            };
            if (map) map.once('idle', () => setTimeout(lancer, 150));
            else setTimeout(lancer, 800);
        }

        // Pas de validation contre le schéma ici, et c'est délibéré : elle
        // écrirait dans la console de qui *regarde* la scène, alors que le
        // besoin est chez qui l'*écrit*. Celui-là dispose déjà de l'outil —
        // `node scripts/valider-schema.js <schema> <scene>` — et du schéma
        // publié à une adresse stable. Les échecs par couche, eux, sont
        // déclarés ci-dessus : c'est ce qui manquait vraiment.
    } catch (e) {
        console.warn('monterSceneExterne:', e);
        showToast('Scène externe : ' + e.message, 'error');
    }
}

function startSceneManifestPolling() {
    if (_scenePollTimer) clearInterval(_scenePollTimer);
    _scenePollTimer = startScenePolling({
        docApi: grist.docApi,
        getLayers: () => STATE.layers,
        getWidgetConfig: () => _widgetConfig,
        getManifest: () => _sceneManifest,
        intervalMs: CONFIG.pollIntervalMs,
        isPaused: () => _syncPaused || dirty || _storyPresenting,
        avantMiseAJour: (layer) => lignesSelectionnees(layer),
        onLayerUpdated(layer, lignes) {
            apresRelecture(layer, lignes);
            if (!mapStyleUsable()) return;
            syncFeatureColorsFromSymbolization(layer, sequentialPaletteForSym(initSymbolization(layer).color, layer));
            if (_storyPresenting && STATE.story[_storyIdx]?.state) {
                const stepLayer = STATE.story[_storyIdx].state.layers?.find(
                    (x) => x.sourceTable === layer.sourceTable || x.id === layer.id || x.name === layer.name
                );
                if (stepLayer) {
                    applyStoryControlsToLayer(layer, stepLayer.controls || []);
                    syncStoryLayerToMap(layer);
                }
            } else {
                applyControls(layer);
                if (map.getSource(layer.id)) syncLayerSourceData(layer);
            }
            Models3D.scheduleBuild();
            updateLegend();
        },
    });
}
/**
 * Monte les couches que `Maquette_Layers` detient.
 *
 * > **Idempotente, et il a fallu l'apprendre.** L'initialisation Grist retente
 * > en lecture quand elle echoue — mais l'echec peut survenir APRES ce
 * > chargement (`syncStoryFromGrist`, les prefs, une regle d'acces qui refuse une
 * > ecriture). La reprise rappelait alors cette fonction sans remettre
 * > `STATE.layers` a zero : chaque couche apparaissait DEUX FOIS dans le
 * > panneau, avec deux entrees de legende, pour une seule ligne en base. On
 * > accusait le document d'avoir des doublons ; ils n'etaient que dans l'ecran.
 */
/**
 * Monter les couches de `Maquette_Layers` : copies, et tables inventoriées.
 *
 * Appelée seule dans un document sans manifeste. Dans un document qgis2grist,
 * `loadFromSceneManifest` l'appelle AUSSI, sans monter (`monter: false`) : les
 * couches ajoutées à la main n'y sont pas décrites par le manifeste, et elles
 * disparaissaient au rechargement. `dejaLiees` et `dejaNommees` écartent ce que
 * le manifeste porte déjà — d'anciennes versions écrivaient ici une copie des
 * couches du manifeste, qu'il ne faut pas doubler.
 *
 * @param {{monter?: boolean, dejaLiees?: Set<string>, dejaNommees?: Set<string>}} [options]
 */
async function loadLayersFromGrist({ monter = true, dejaLiees = null, dejaNommees = null } = {}) {
    try {
        if (!monter) {
            const tables = await grist.docApi.listTables();
            if (!tables.includes('Maquette_Layers')) return;
        }
        const rec = await grist.docApi.fetchTable('Maquette_Layers');
        const ids = rec.id || [];
        const dejaMontees = new Set(STATE.layers.map((l) => l.gristId).filter((v) => v != null));
        let prefsTables = null;
        for (let i = 0; i < ids.length; i++) {
            if (dejaMontees.has(ids[i])) continue;
            let geojson, style;
            try { geojson = JSON.parse(rec.GeoJSON[i]); } catch (e) { continue; }
            try { style = JSON.parse(rec.StyleJSON[i]); } catch (e) { style = { mode: 'mapbox' }; }
            const ctrls = style?._controls;
            if (style) delete style._controls;
            const binding = style?._binding;
            if (style) delete style._binding;
            if (binding?.kind === 'table' && dejaLiees?.has(binding.sourceTable)) continue;
            if (!binding && dejaNommees?.has(rec.Name?.[i])) continue;
            const layer = {
                id: 'layer-grist-' + ids[i], gristId: ids[i],
                name: rec.Name?.[i] || 'Sans nom', color: rec.Color?.[i] || '#C44536',
                visible: parseGristBool(rec.Visible?.[i], true), geometryType: rec.GeomType?.[i] || 'Point',
                source: 'grist', geojson, style, _modelCat: 'furniture',
                controls: ctrls || [],
            };
            if (binding?.kind === 'table') {
                layer.kind = 'table';
                layer.sourceTable = binding.sourceTable;
                layer.geometryColumn = binding.geometryColumn || 'geometry_json';
                layer.source = 'grist-table';
                // Les entités vivent dans la table ; la ligne n'en garde pas de
                // copie (et une ancienne copie serait périmée). L'apparence et
                // les réglages de formulaire sont dans les prefs, comme pour une
                // couche du manifeste.
                try {
                    const cols = await grist.docApi.fetchTable(layer.sourceTable);
                    layer.geometryFormat = formatGeometrie(cols, layer.geometryColumn);
                    layer.geojson = tableToGeoJSON(cols, layer.geometryColumn);
                } catch (e) {
                    console.warn('[Atlas] table introuvable :', layer.sourceTable, e.message);
                    showToast(`Table ${layer.sourceTable} introuvable — couche « ${layer.name} » ignorée`, 'warning');
                    continue;
                }
                if (!prefsTables) prefsTables = await loadLayerPrefs(grist.docApi);
                applyLayerPrefs(layer, prefsTables);
            }
            initSymbolization(layer);
            if (layer.controls?.length) applyControls(layer);
            STATE.layers.push(layer);
        }
        // Rangs enregistrés dans les prefs : même règle qu'en mode manifeste.
        if (prefsTables) {
            STATE.layers = sortByRank(STATE.layers, Object.fromEntries(
                STATE.layers.filter((l) => Number.isFinite(l._rank)).map((l) => [l.sourceTable || l.id, l._rank])
            ));
        }
        if (monter) mountLoadedLayers(computeLayersBounds());
    } catch (e) { console.warn('loadLayers:', e.message); }
}
/** Vrai une fois `Maquette_Layers` connue presente, pour ne pas relister a chaque enregistrement. */
let _maquetteTablePrete = false;

/**
 * Garantit l'existence de `Maquette_Layers` avant d'y ecrire.
 *
 * `initGristTables` ne tourne QUE sur les documents en mode maquette : en mode
 * Scene Manifest, la scene vient du manifeste et la table n'est jamais creee.
 * Enregistrer une couche qui n'est pas issue de qgis2grist tentait donc un
 * `AddRecord` sur une table absente, et Grist repondait
 * « [Sandbox] KeyError 'Maquette_Layers' » — l'enregistrement echouait sans
 * qu'aucune retouche de l'utilisateur ne soit conservee.
 *
 * La table est creee A LA DEMANDE, au moment ou l'on enregistre vraiment : un
 * document qui n'enregistre aucune couche garde une empreinte nulle.
 */
async function ensureMaquetteLayersTable() {
    if (_maquetteTablePrete) return;
    const tables = await grist.docApi.listTables();
    if (!tables.includes('Maquette_Layers')) {
        await grist.docApi.applyUserActions([['AddTable', 'Maquette_Layers', TABLE_SCHEMAS.Maquette_Layers]]);
    }
    _maquetteTablePrete = true;
}

/** Pose ou met à jour la ligne d'inventaire d'une couche portée par une table. */
async function ecrireLigneInventaire(layer) {
    await ensureMaquetteLayersTable();
    const data = ligneInventaire(layer);
    if (layer.gristId) {
        await grist.docApi.applyUserActions([['UpdateRecord', 'Maquette_Layers', layer.gristId, data]]);
    } else {
        const r = await grist.docApi.applyUserActions([['AddRecord', 'Maquette_Layers', null, data]]);
        layer.gristId = r.retValues[0];
    }
}

async function saveLayerToGrist(layer, silent, { lancer = false } = {}) {
    if (!CONFIG.grist.ready) return false;
    // Pendant un récit, ce que la couche montre est l'état de l'étape, pas sa
    // configuration : l'écrire remplacerait les préférences par celles d'une
    // étape (fermer une sélection ou toucher un filtre suffisait). Relevé à
    // l'audit du 02/10/2026 ; les contextes réutilisent cette restitution.
    if (_storyPresenting) {
        if (!silent) showToast('Quittez le récit pour enregistrer l’apparence', 'warning');
        return false;
    }
    if (!assertCanWrite('enregistrer les préférences')) return false;
    // Une couche que le manifeste decrit n'a que son apparence a enregistrer :
    // la donnee est deja quelque part. C'est cet aiguillage qui protegeait mal
    // `Maquette_Layers` — voir `clePrefsCouche`.
    if (clePrefsCouche(layer)) {
        try {
            await saveLayerPref(grist.docApi, layer, { viewMode: CONFIG.viewMode });
            // Sans manifeste, rien d'autre ne dit que cette table fait partie de
            // la scène : sans sa ligne, elle disparaissait au rechargement.
            if (ligneInventaireRequise(layer)) await ecrireLigneInventaire(layer);
            if (!silent) showToast(`Apparence enregistrée · ${layer.name}`, 'success');
            marquerEnregistre();
            return true;
        } catch (e) {
            enterViewModeOnWriteFail(e);
            if (!silent) showToast('Grist : ' + e.message, 'error');
            if (lancer) throw e;
        }
        return false;
    }
    try {
        await ensureMaquetteLayersTable();
        const styleOut = { ...(layer.style || {}) };
        if (layer.controls?.length) styleOut._controls = layer.controls;
        if (layer.kind === 'table') {
            styleOut._binding = { kind: 'table', sourceTable: layer.sourceTable, geometryColumn: layer.geometryColumn };
        }
        const data = {
            Name: layer.name, Color: layer.color, Visible: layer.visible !== false,
            GeomType: layer.geometryType, StyleJSON: JSON.stringify(styleOut),
            GeoJSON: JSON.stringify(layer.geojson || {}),
        };
        if (layer.gristId) await grist.docApi.applyUserActions([['UpdateRecord', 'Maquette_Layers', layer.gristId, data]]);
        else { const r = await grist.docApi.applyUserActions([['AddRecord', 'Maquette_Layers', null, data]]); layer.gristId = r.retValues[0]; }
        if (!silent) showToast(`Apparence et copie enregistrées · ${layer.name}`, 'success');
    } catch (e) { if (!silent) showToast('Grist : ' + e.message, 'error'); }
}

// ============================================================
// PROJECT SAVE / LOAD (JSON) + autosave
// ============================================================
function buildProject() {
    return {
        version: '2.2-atlas-binding',
        savedAt: new Date().toISOString(),
        projectName: STATE.projectName,
        location: STATE.location,
        story: STATE.story,
        storyManifest: storyToManifestFragment(STATE.story),
        settings: { ...STATE.settings, date: STATE.settings.date.toISOString() },
        layers: STATE.layers.map((l) => ({
            id: l.id, name: l.name, color: l.color, visible: l.visible,
            geometryType: l.geometryType, source: l.source, geojson: l.geojson,
            style: l.style, _modelCat: l._modelCat, kind: l.kind,
            sourceTable: l.sourceTable, geometryColumn: l.geometryColumn,
            controls: l.controls,
            parametres: parametresDeCoucheValides(l.parametres),
            declarative: declarativeFromAtlasLayer(l),
        })),
    };
}
function saveProject() {
    const json = JSON.stringify(buildProject(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `atlas_${(STATE.projectName || STATE.location.name || 'projet').replace(/[^a-z0-9]/gi, '_')}.json`; a.click();
    URL.revokeObjectURL(url);
    try { localStorage.setItem('atlas_autosave', json); } catch (e) {}
    // « Téléchargé », pas « enregistré » : rien n'est écrit dans Grist, et le
    // même mot désignait déjà trois autres gestes (apparence, table, fiche).
    showToast('Projet téléchargé (.json)', 'success');
}
async function restoreProject(p) {
    STATE.layers.forEach((l) => removeLayerGfx(l));
    STATE.layers = [];
    if (p.projectName) { STATE.projectName = p.projectName; $('project-name').textContent = p.projectName; }
    if (p.location?.lat) { STATE.location = p.location; STATE.locationChoisie = true; map.jumpTo({ center: [p.location.lng, p.location.lat] }); }
    if (p.settings) { Object.assign(STATE.settings, p.settings); STATE.settings.date = new Date(p.settings.date || Date.now()); MODEL_LIBRARY.set = STATE.settings.modelSet || 'colored'; }
    STATE.story = assurerCles(p.story || []);
    refreshStoryNavChrome();
    (p.layers || []).forEach((ld) => {
        const layer = { ...ld, visible: ld.visible !== false, controls: ld.controls || [] };
        layer.parametres = parametresDeCoucheValides(ld.parametres) || undefined;
        initSymbolization(layer);
        STATE.layers.push(layer);
        addLayerToMap(layer);
        if (layer.controls?.length) applyControls(layer);
    });
    updateRailBadge(); Models3D.rebuildScene(); applyTerrain(); applyBuildingVisibility(); updateLighting();
    if (!CONFIG.viewMode) openModule('couches');
    else updateLegend();
    showToast(`Projet chargé · ${p.layers?.length || 0} couches`, 'success');
}
/**
 * « Ouvrir un projet » reconnaît ce qu'on lui donne (`lib/ouvrir-fichier.js`).
 *
 * Un projet se charge ; un GeoJSON s'ajoute comme couche ; une scène publiée
 * est nommée comme telle, avec la façon de l'ouvrir. Avant, tout ce qui
 * n'était pas un projet se chargeait « avec succès » comme un projet vide.
 */
function loadProject() {
    const inp = $('project-input');
    inp.onchange = async (e) => {
        const file = e.target.files[0];
        inp.value = '';
        if (!file) return;
        try {
            const contenu = await file.text();
            // « Ouvrir » reconnaît aussi un GPX, un KML ou un CSV : ils s'ajoutent comme couches.
            if (natureFichier(file.name, contenu)) { importerFichierFormat(file.name, contenu); return; }
            const obj = JSON.parse(contenu);
            const nature = natureJson(obj);
            if (nature === 'projet') await restoreProject(obj);
            else if (nature === 'geojson') {
                const n = ajouterCoucheGeoJSON(file.name.replace(/\.[^.]+$/, ''), obj);
                if (n) showToast(`${n} élément${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} comme couche`, 'success');
            } else showToast(messageNature(nature), nature ? 'info' : 'error');
        } catch (err) {
            showToast('Fichier illisible : ' + err.message, 'error');
        }
    };
    inp.click();
}
/** Remet un fichier à la personne : un lien invisible, cliqué. */
function telecharger(blob, nom) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nom; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Les couches dont on peut sortir des entités, et celles que l'on ne détient pas (distantes, tuiles). */
function couchesExportables() {
    return {
        exportables: STATE.layers.filter((l) => l.geojson?.features?.length),
        absentes: STATE.layers.filter((l) => !l.geojson?.features?.length),
    };
}

/**
 * Sort les couches choisies dans un format d'échange (`lib/export-formats.js`). Une couche distante, ou de tuiles,
 * n'a rien à exporter : ses entités sont ailleurs. Un fichier vide est un export **réussi** jusqu'à ce qu'on l'ouvre ;
 * mieux vaut ne rien produire et dire pourquoi.
 */
function exporterCouches(format, couches) {
    const { absentes } = couchesExportables();
    if (!couches.length) {
        showToast(absentes.some((l) => l._distant)
            ? 'Rien à exporter : Atlas ne détient pas ces couches, seulement leurs adresses'
            : 'Rien à exporter : aucune couche ne porte d’entités', 'warning');
        return;
    }
    const base = couches.length === 1 ? couches[0].name : (STATE.projectName || STATE.location?.name || 'atlas_export');
    let blob, ext, libelle, note = '';
    if (format === 'geojson') {
        blob = new Blob([JSON.stringify(versGeoJSON(couches), null, 2)], { type: 'application/geo+json' });
        ext = 'geojson'; libelle = 'GeoJSON';
    } else if (format === 'csv') {
        // Le BOM (U+FEFF) : sans lui, Excel lit les accents de travers.
        blob = new Blob(['\uFEFF', versCsv(couches)], { type: 'text/csv;charset=utf-8' });
        ext = 'csv'; libelle = 'CSV';
    } else if (format === 'kml') {
        blob = new Blob([versKml(couches, base)], { type: 'application/vnd.google-earth.kml+xml' });
        ext = 'kml'; libelle = 'KML';
    } else if (format === 'gpx') {
        const g = versGpx(couches, base);
        if (!g.retenues) { showToast('GPX : ces couches n’ont ni points ni lignes — un polygone n’a pas de sens pour un GPS', 'warning'); return; }
        blob = new Blob([g.xml], { type: 'application/gpx+xml' });
        ext = 'gpx'; libelle = 'GPX';
        if (g.ignorees) note = ` ; ${g.ignorees} surface${g.ignorees > 1 ? 's' : ''} écartée${g.ignorees > 1 ? 's' : ''}`;
    } else return;
    telecharger(blob, nomDeFichier(base, ext));
    // Un export partiel qui se tait ressemble à un export complet.
    const manque = absentes.length ? ` ; ${absentes.length} couche${absentes.length > 1 ? 's' : ''} non détenue${absentes.length > 1 ? 's' : ''}, absente${absentes.length > 1 ? 's' : ''} du fichier` : '';
    showToast(`Export ${libelle} — ${couches.length} couche${couches.length > 1 ? 's' : ''}${note}${manque}`, (manque || note) ? 'warning' : 'success');
}

/** L'image de la carte telle qu'elle s'affiche (sans les panneaux). */
function exporterImageCarte() {
    if (!map) return;
    // Le tampon de dessin n'est valable que pendant le rendu : on le lit dans le même tour.
    map.once('render', () => {
        map.getCanvas().toBlob((blob) => {
            if (!blob) { showToast('Image impossible à produire sur cet appareil', 'error'); return; }
            telecharger(blob, nomDeFichier(STATE.projectName || STATE.location?.name || 'atlas_carte', 'png'));
            showToast('Image de la carte (PNG)', 'success');
        }, 'image/png');
    });
    map.triggerRepaint();
}

function fermerMenuExport() {
    document.getElementById('export-menu')?.remove();
    document.removeEventListener('pointerdown', _fermetureMenuExport, true);
    document.removeEventListener('keydown', _toucheMenuExport, true);
}
function _fermetureMenuExport(e) { if (!e.target.closest?.('#export-menu')) fermerMenuExport(); }
function _toucheMenuExport(e) { if (e.key === 'Escape') { e.stopPropagation(); fermerMenuExport(); } }

/** Les formats offerts, dans l'ordre où l'on s'en sert : échanger des données, puis garder le travail. */
const FORMATS_EXPORT = [
    { id: 'geojson', nom: 'GeoJSON', aide: 'Entités et attributs — QGIS, Grist, la plupart des outils web', ic: 'fichier', donnees: true },
    { id: 'csv', nom: 'CSV', aide: 'Tableur — attributs, géométrie en WKT dans une colonne', ic: 'tableur', donnees: true },
    { id: 'kml', nom: 'KML', aide: 'Google Earth, QGIS, applications de carte', ic: 'globe', donnees: true },
    { id: 'gpx', nom: 'GPX', aide: 'GPS et randonnée — points et traces (les surfaces sont écartées)', ic: 'piste', donnees: true },
    { id: 'image', nom: 'Image de la carte', aide: 'La carte telle qu’elle s’affiche, en PNG', ic: 'image', donnees: false },
    { id: 'projet', nom: 'Projet Atlas', aide: 'Couches et réglages (.json), pour le rouvrir dans Atlas', ic: 'enregistrer', donnees: false },
];

/**
 * Le menu d'export de la barre (et de « Plus » sur téléphone). Sur quelles couches : la couche sélectionnée si l'on
 * en a une, sinon toutes celles qui portent des entités ; un choix permet d'en décider autrement.
 */
function ouvrirMenuExport(ancre = null) {
    fermerMenuExport();
    const { exportables } = couchesExportables();
    const choisie = exportables.find((l) => l.id === STATE.selectedLayer);
    const menu = document.createElement('div');
    menu.id = 'export-menu';
    menu.className = 'posture-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Exporter');
    const portee = exportables.length > 1
        ? `<label class="export-portee">Couches
            <select id="export-portee" class="input">
                <option value="*">Toutes (${exportables.length})</option>
                ${exportables.map((l) => `<option value="${echapper(l.id)}" ${choisie?.id === l.id ? 'selected' : ''}>${echapper(l.name)}</option>`).join('')}
            </select></label>`
        : '';
    menu.innerHTML = `<div class="posture-titre">Exporter</div>${portee}` + FORMATS_EXPORT.map((f) => {
        const offert = !f.donnees || exportables.length > 0;
        return `<button type="button" role="menuitem" class="posture-choix export-choix" data-export="${f.id}"${offert ? '' : ' disabled'}>
            <span class="posture-nom">${icTrait(IC[f.ic], 16)} ${echapper(f.nom)}</span>
            <span class="posture-aide">${echapper(offert ? f.aide : 'Aucune couche ne porte d’entités')}</span>
        </button>`;
    }).join('');
    document.body.appendChild(menu);
    menu.addEventListener('click', (e) => {
        const b = e.target.closest('[data-export]');
        if (!b || b.disabled) return;
        const choix = menu.querySelector('#export-portee')?.value;
        fermerMenuExport();
        const id = b.dataset.export;
        if (id === 'projet') { saveProject(); return; }
        if (id === 'image') { exporterImageCarte(); return; }
        const couches = !choix || choix === '*' ? exportables : exportables.filter((l) => l.id === choix);
        exporterCouches(id, couches);
    });
    if (ancre && !surTelephone()) {
        const r = ancre.getBoundingClientRect();
        menu.style.top = `${Math.min(r.bottom + 8, window.innerHeight - menu.offsetHeight - 12)}px`;
        menu.style.left = `${Math.max(12, Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 12))}px`;
    } else {
        menu.classList.add('posture-feuille');
    }
    document.addEventListener('pointerdown', _fermetureMenuExport, true);
    document.addEventListener('keydown', _toucheMenuExport, true);
    menu.querySelector('.export-choix:not([disabled])')?.focus();
}
function exportProject(ancre) { ouvrirMenuExport(ancre instanceof Element ? ancre : null); }

// ============================================================
// GEOCODING (Nominatim — libre, sans clé)
// ============================================================
function searchLocation(q) {
    clearTimeout(searchTimer);
    const box = $('loc-results');
    if (q.length < 3) { box.classList.remove('open'); return; }
    searchTimer = setTimeout(async () => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=fr&q=${encodeURIComponent(q)}`, { headers: enTetesOSM({ Accept: 'application/json' }) });
            const data = await res.json();
            box.innerHTML = data.map((d) => `<div class="sr-item" onclick="A.pickSearch('${chaineJs(d.display_name)}', ${Number(d.lat)}, ${Number(d.lon)})"><div class="sr-title">${echapper((d.display_name || '').split(',')[0])}</div><div class="sr-sub">${echapper(d.display_name)}</div></div>`).join('');
            box.classList.toggle('open', data.length > 0);
        } catch (e) { box.classList.remove('open'); }
    }, 350);
}

// ============================================================
// COMMAND PALETTE
// ============================================================
let cmdItems = [], cmdSel = 0;
function openCmd() {
    $('cmd-overlay').classList.add('open');
    $('cmd-input').value = ''; $('cmd-input').focus();
    buildCmdItems('');
}
function closeCmd() { $('cmd-overlay').classList.remove('open'); }
function buildCmdItems(q) {
    let base = [
        { label: 'Lieu', kind: 'module', run: () => openModule('lieu'), ic: icTrait(IC.epingle) },
        { label: 'Couches', kind: 'module', run: () => openModule('couches'), ic: icTrait(IC.dossier) },
        { label: 'Contrôles', kind: 'module', run: () => openModule('controles'), ic: icTrait(IC.controles) },
        { label: 'Récit', kind: 'module', run: () => openModule('recit'), ic: icTrait(IC.recit) },
        { label: 'Formulaires', kind: 'module', run: () => openModule('formulaires'), ic: icTrait(IC.formulaire) },
        { label: 'Catalogue 3D / Réglages', kind: 'module', run: () => openModule('reglages'), ic: icTrait(IC.reglages) },
        { label: 'Soleil', kind: 'module', run: () => openModule('soleil'), ic: icTrait(IC.soleil) },
        { label: 'Vue & rendu', kind: 'module', run: () => openModule('vues'), ic: icTrait(IC.cube) },
        { label: 'Importer depuis OSM', kind: 'action', run: () => { openModule('couches'); openOSM(); }, ic: icTrait(IC.globe) },
        { label: 'Importer un fichier', kind: 'action', run: () => $('file-input').click(), ic: icTrait(IC.fichier) },
        { label: 'Télécharger le projet (.json)', kind: 'action', run: saveProject, ic: icTrait(IC.enregistrer) },
        { label: 'Exporter… (GeoJSON, CSV, KML, GPX, image)', kind: 'action', run: () => ouvrirMenuExport(), ic: icTrait(IC.exporter) },
        { label: 'Ouvrir un projet ou un GeoJSON', kind: 'action', run: loadProject, ic: icTrait(IC.dossier) },
        { label: 'Exporter en GeoJSON', kind: 'action', run: exportProject, ic: icTrait(IC.exporter) },
        { label: 'Réinitialiser la vue', kind: 'action', run: () => A.resetView(), ic: icTrait(IC.rafraichir) },
    ];
    if (CONFIG.viewMode) {
        const hasStory = (STATE.story?.length || 0) > 0;
        base = [
            ...(hasStory ? [
                { label: 'Lancer le récit', kind: 'action', run: () => A.storyPlay(0), ic: icTrait(IC.recit) },
                { label: 'Récit', kind: 'module', run: () => openModule('recit'), ic: icTrait(IC.recit) },
            ] : []),
            { label: 'Exporter en GeoJSON', kind: 'action', run: exportProject, ic: icTrait(IC.exporter) },
            { label: 'Réinitialiser la vue', kind: 'action', run: () => A.resetView(), ic: icTrait(IC.rafraichir) },
        ];
        STATE.layers.filter((l) => l.visible !== false).forEach((l) => base.push({
            label: `Cibler « ${l.name} »`,
            kind: 'couche',
            run: () => { _legendFocus = { layerId: l.id }; fitToLayer(l); updateLegend(); },
            ic: icTrait(IC.cube),
        }));
    } else {
        STATE.layers.forEach((l) => base.push({ label: l.name, kind: 'couche', run: () => { A.selectLayer(l.id); }, ic: '▢' }));
    }
    const ql = q.toLowerCase();
    cmdItems = base.filter((i) => i.label.toLowerCase().includes(ql));
    // Ce que la barre promet : « un objet, une couche, un lieu ». Les objets
    // par leur nom, dans les couches visibles ; le lieu par géocodage, en
    // dernier recours, dès trois caractères.
    const { sortie, aPreparer } = objetsPourLaPalette(q);
    for (const o of sortie) {
        cmdItems.push({
            label: `${o.nom} — ${o.couche}${o.trouveDans ? ` · ${o.trouveDans.libelle} : ${o.trouveDans.texte}` : ''}`,
            kind: 'objet',
            run: () => allerAObjet(o.coucheId, o.idx), ic: icTrait(IC.epingle),
        });
    }
    // Les couches dont l'index n'est pas prêt répondent par le nom ; la recherche
    // dans leurs champs arrive dès qu'il l'est.
    if (aPreparer.length) {
        Promise.all(aPreparer.map((l) => indexDeCouche(l).catch(() => null))).then(() => {
            if ($('cmd-overlay')?.classList.contains('open') && $('cmd-input')?.value === q) buildCmdItems(q);
        });
    }
    // Une liste par couche : choisir sans chercher.
    if (!q.trim()) { /* la liste complète des couches est déjà proposée ci-dessus */ }
    for (const l of STATE.layers.filter((x) => x.visible !== false && Array.isArray(x.geojson?.features) && x.geojson.features.length)) {
        if (`objets ${l.name}`.toLowerCase().includes(ql) || `liste ${l.name}`.toLowerCase().includes(ql)) {
            cmdItems.push({ label: `Objets de « ${l.name} »`, kind: 'liste', run: () => ouvrirListe(l), ic: icTrait(IC.epingle) });
        }
    }
    const lieu = q.trim();
    if (lieu.length >= 3) {
        cmdItems.push({ label: `Chercher le lieu « ${lieu} »`, kind: 'lieu', run: () => allerAuLieu(lieu), ic: icTrait(IC.globe) });
    }
    cmdSel = 0; renderCmd();
}

/**
 * Aller à un objet trouvé par la palette, et l'ouvrir comme un clic l'aurait
 * fait : la fiche en édition ; en lecture, la bulle si la couche en a une,
 * la fiche de saisie si la scène la propose, le popup sinon. La recherche
 * ouvrait la fiche de saisie même quand la couche avait une bulle (constaté le
 * 01/10/2026) : le toucher et la recherche ne menaient pas au même endroit.
 */
function allerAObjet(coucheId, idx) {
    const layer = STATE.layers.find((l) => l.id === coucheId);
    const f = layer?.geojson?.features?.[idx];
    if (!f) return;
    fitToFeatures([f]);
    // La fiche s'ouvre tout de suite ; la bulle attend la fin du cadrage, pour se
    // recaler une fois la carte immobile. La règle est celle du toucher.
    if (decisionPour(layer) === 'fiche') { ouvrirObjet(layer, idx); return; }
    const c = featureCentroidLngLat(f);
    const ouvrir = () => ouvrirObjet(layer, idx, { lngLat: c ? { lng: c[0], lat: c[1] } : null });
    if (map?.isMoving()) map.once('moveend', ouvrir); else ouvrir();
}

// ============================================================
// OUVRIR UN OBJET ET LISTE D'OBJETS (02/10/2026)
// ============================================================
// Choisir un objet sans le toucher sur la carte : une liste, filtrée comme la
// carte, qu'on cherche par nom, par valeur de champ ou par distance. Les règles
// vivent dans `lib/objets-liste.js` et `lib/ouvrir-objet.js` (purs, testés) ; ce
// qui suit les relie à la carte, à Grist et aux panneaux.

/**
 * Ce qui s'ouvre pour cet objet (fiche, bulle ou popup) : une seule règle,
 * `decisionOuverture`, que le toucher, la recherche, « le plus proche » et la
 * liste partagent.
 */
function decisionPour(layer) {
    return decisionOuverture({
        lecture: !!CONFIG.viewMode,
        bulleActive: bulleActive(layer),
        enSaisie: coucheEnSaisie(layer),
        distant: !!layer?._distant,
        enPresentation: _storyPresenting,
        saisiesEtape: coucheDansSaisiesEtape(layer),
    });
}

/** Ouvre l'objet comme la règle le veut. La liste ouverte se replie : elle recouvrirait la bulle. */
function ouvrirObjet(layer, idx, { lngLat = null, feature = null } = {}) {
    if (!layer) return null;
    const decision = decisionPour(layer);
    if (decision === 'fiche') {
        closeViewPopup();
        fermerListe({ rendre: false });
        enterSelectionMode(layer.id, idx);
    } else {
        fermerListe();
        showViewFeaturePopup(layer, idx, lngLat, feature);
    }
    return decision;
}

// ---- La liste ----------------------------------------------------------

/** La liste ouverte : `{ coucheId, requete, tri, visites }`, ou `null`. */
let _liste = null;
/** L'index de recherche par couche, refait quand la couche est relue. */
const _indexListe = new Map();   // coucheId -> { geojson, entrees }

/** Les colonnes qu'on ne cherche pas : géométrie, colonnes d'Atlas, internes. */
function colonneNonIndexee(layer, colonnes) {
    const exclues = new Set([...COLONNES_ATLAS, ...colonnesHorsFormulaire(layer, colonnes), 'id', 'manualSort']);
    return (c) => exclues.has(c) || c.startsWith('_') || c.startsWith('gristHelper_');
}

/**
 * Les entrées de recherche d'une couche : nom, point, couleur, champs lisibles
 * (références résolues en libellés). Préparées une fois et gardées tant que la
 * couche n'est pas relue.
 */
async function indexDeCouche(layer) {
    const feats = layer?.geojson?.features;
    if (!Array.isArray(feats)) return [];
    const cache = _indexListe.get(layer.id);
    if (cache && cache.geojson === layer.geojson) return cache.entrees;

    const table = layer.sourceTable;
    let colonnes = (table && STATE.schema?.[table]) || [];
    if (!colonnes.length && feats[0]?.properties) {
        colonnes = Object.keys(feats[0].properties).map((colId) => ({ colId, type: 'Text' }));
    }
    const libelles = {};
    await Promise.all(colonnes
        .filter((c) => /^Ref(List)?:/.test(c.type || ''))
        .map(async (c) => {
            const m = await libellesDeChamp(table, c.colId).catch(() => null);
            if (m) libelles[c.colId] = m;
        }));
    const champEtat = initSymbolization(layer).bulle?.pastilles?.[0];
    const apparences = champEtat ? await apparencesDeChamp(layer, champEtat).catch(() => new Map()) : null;
    const exclus = colonneNonIndexee(layer, colonnes);
    const libelleDe = (colId) => libelleColonne(table, colId);

    const entrees = feats.map((f, idx) => {
        const props = f.properties || {};
        const a = champEtat ? apparences?.get(String(props[champEtat])) : null;
        return entreeObjet({
            idx,
            rowId: props._row_id ?? null,
            nom: nomObjet(props) || `Objet ${props._row_id ?? idx + 1}`,
            point: featureCentroidLngLat(f),
            couleur: a?.couleur || props._fill_color || layer.color || null,
            etat: a?.libelle || '',
            champs: champsDeLEntite(props, colonnes, { libelles, libelleDe, exclus }),
        });
    });
    _indexListe.set(layer.id, { geojson: layer.geojson, entrees });
    return entrees;
}

/**
 * La table liée où l'on relève (visites) : celle de la bulle si elle est
 * réglée, sinon la première qu'un formulaire de la couche propose.
 */
function lienDeReleve(layer) {
    const b = initSymbolization(layer).bulle;
    if (b?.lien?.table && b.lien.via) return b.lien;
    const f = formulairesDeLaCouche(layer).find((x) => !x.surLaCouche && x.via);
    return f ? { table: f.tableId, via: f.via, date: null } : null;
}

/** Le formulaire qu'ouvre « Nouvelle visite » pour cette couche, ou `null` s'il n'est pas proposé. */
function formulaireDeReleve(layer) {
    const lien = lienDeReleve(layer);
    return lien ? formulaireDeVisite(layer, { lien }) : null;
}

/** D'où l'on mesure : la position de l'appareil, sinon le centre de la carte. */
function positionDeReference() {
    if (_dernierePosition) return { point: _dernierePosition, source: 'gps' };
    const c = map?.getCenter?.();
    return c ? { point: [c.lng, c.lat], source: 'carte' } : { point: null, source: null };
}

function ouvrirListe(layer) {
    if (!layer) return;
    // Avec une tournée, la liste suit la ligne : c'est l'ordre dans lequel on travaille.
    _liste = { coucheId: layer.id, requete: '', tri: ordreTournee(layer.id)?.length ? 'tournee' : 'proche', visites: null };
    inspectorUserClosed = false;
    document.body.classList.add('mode-liste');
    $('map-controls-dock')?.classList.add('collapsed');
    renderInspector();
}

function fermerListe({ rendre = true } = {}) {
    if (!_liste) return;
    _liste = null;
    document.body.classList.remove('mode-liste');
    if (rendre) renderInspector();
}

/** Le panneau : l'en-tête, la recherche et le tri ; les lignes se redessinent seules. */
function renderListeObjets() {
    const layer = STATE.layers.find((l) => l.id === _liste?.coucheId);
    if (!layer) { fermerListe({ rendre: false }); closeInspectorPanel(); return; }
    const gps = localisationDisponible();
    $('insp-head').innerHTML = `
        <div class="insp-eyebrow"><span class="layer-swatch" style="background:${echapper(fondPastilleCouche(layer))}"></span>Objets</div>
        <div class="insp-title">${echapper(layer.name)}</div>
        <div class="insp-sub" id="liste-compte"></div>`;
    $('insp-tabs').innerHTML = '';
    $('insp-body').innerHTML = `
        <div class="liste-outils">
            <input id="liste-recherche" class="input" type="search" autocomplete="off"
                placeholder="Nom, domaine, état…" aria-label="Chercher dans les objets"
                value="${echapper(_liste.requete)}" oninput="A.listeRecherche(this.value)">
            <div class="liste-tri" role="group" aria-label="Ordre">
                ${ordreTournee(layer.id)?.length ? '<button type="button" id="liste-tri-tournee" onclick="A.listeTri(\'tournee\')">Le long de la tournée</button>' : ''}
                <button type="button" id="liste-tri-proche" onclick="A.listeTri('proche')"></button>
                <button type="button" id="liste-tri-nom" onclick="A.listeTri('nom')">A – Z</button>
                ${gps ? '<button type="button" id="liste-gps" onclick="A.listeAutourDeMoi()">Ma position</button>' : ''}
            </div>
        </div>
        <div id="liste-lignes" class="liste-lignes" role="list"><div class="hint">Chargement…</div></div>
        <div id="liste-pied" class="hint"></div>`;
    $('insp-foot').innerHTML = '<button class="btn btn-soft" style="flex:1" onclick="A.listeFermer()">Fermer la liste</button>';
    preparerListe(layer).then(() => renderListeLignes());
}

/** Les données dont les lignes ont besoin : l'index, et les dernières visites. */
async function preparerListe(layer) {
    await indexDeCouche(layer);
    const lien = lienDeReleve(layer);
    if (!lien) { if (_liste) _liste.visites = null; return; }
    try {
        const lignes = await lignesDeTable(lien.table);
        const date = lien.date || colonneDate(STATE.schema?.[lien.table] || []);
        if (_liste) _liste.visites = dernieresParObjet(lignes, lien.via, date);
    } catch (_) { if (_liste) _liste.visites = null; }
}

/** Redessine les lignes seulement : la saisie dans le champ de recherche garde son focus. */
function renderListeLignes() {
    const layer = STATE.layers.find((l) => l.id === _liste?.coucheId);
    const hote = $('liste-lignes');
    if (!layer || !hote) return;
    const cache = _indexListe.get(layer.id);
    const feats = layer.geojson?.features || [];
    const garde = buildControlPredicate(layer);
    const ref = positionDeReference();
    // La tournée du contexte actif : la place de chaque objet sur la ligne. Sortie du contexte, on retombe sur « proches ».
    const ordreT = ordreTournee(layer.id);
    const rangs = ordreT ? new Map(ordreT.map((o, i) => [o.idx, { rang: i + 1, metres: o.metres, ecartM: o.ecartM }])) : null;
    if (_liste.tri === 'tournee' && !rangs) _liste.tri = 'proche';
    const r = listerObjets(cache?.entrees || [], {
        requete: _liste.requete,
        position: ref.point,
        tri: _liste.tri,
        rangs,
        visible: (e) => !garde || garde(feats[e.idx]),
    });
    const peutVisiter = !!formulaireDeReleve(layer);
    const total = cache?.entrees.length || 0;

    $('liste-compte').textContent = r.total === total
        ? `${total} objet${total > 1 ? 's' : ''}`
        : `${r.total} sur ${total} objet${total > 1 ? 's' : ''}${garde && !_liste.requete ? ' · filtres actifs' : ''}`;
    const proche = $('liste-tri-proche');
    if (proche) {
        proche.textContent = ref.source === 'gps' ? 'Proches de moi' : 'Proches du centre';
        proche.classList.toggle('on', _liste.tri === 'proche');
    }
    $('liste-tri-nom')?.classList.toggle('on', _liste.tri === 'nom');
    $('liste-tri-tournee')?.classList.toggle('on', _liste.tri === 'tournee');

    if (!r.items.length) {
        hote.innerHTML = `<div class="hint">${_liste.requete
            ? `Aucun objet ne répond à « ${echapper(_liste.requete)} ».`
            : 'Aucun objet visible : les filtres de la carte les écartent tous.'}</div>`;
        $('liste-pied').textContent = '';
        return;
    }
    hote.innerHTML = r.items.map((o) => {
        const v = _liste.visites?.get(Number(o.rowId));
        const visite = _liste.visites
            ? (v ? `visité le ${dateCourte(v.date)}${v.nombre > 1 ? ` (${v.nombre})` : ''}` : 'jamais visité')
            : '';
        const sous = [o.etat, visite].filter(Boolean).map(echapper).join(' · ');
        const trouve = o.trouveDans ? `<div class="liste-trouve">${echapper(o.trouveDans.libelle)} : ${echapper(o.trouveDans.texte)}</div>` : '';
        // Le long de la tournée, la distance dite est celle depuis le départ de la ligne, pas celle d'où l'on se trouve.
        const dist = _liste.tri === 'tournee' && o.metres != null
            ? `${direLongueur(o.metres)}${o.ecartM > 250 ? ' · hors ligne' : ''}`
            : (o.distance != null ? direDistance(o.distance).replace(/^à /, '') : '');
        return `<div class="liste-ligne" role="listitem" tabindex="0"
                onclick="A.listeOuvrir('${chaineJs(layer.id)}', ${o.idx})"
                onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();A.listeOuvrir('${chaineJs(layer.id)}', ${o.idx});}">
            <span class="liste-pastille" style="background:${echapper(o.couleur || '#8a8174')}"></span>
            <div class="liste-texte">
                <div class="liste-nom">${echapper(o.nom)}</div>
                ${sous ? `<div class="liste-sous">${sous}</div>` : ''}
                ${trouve}
            </div>
            ${dist ? `<span class="liste-dist">${echapper(dist)}</span>` : ''}
            ${peutVisiter ? `<button type="button" class="liste-visite" title="Ajouter une visite à cet objet"
                onclick="event.stopPropagation(); A.listeVisite('${chaineJs(layer.id)}', ${o.idx})">Visite</button>` : ''}
        </div>`;
    }).join('');
    $('liste-pied').textContent = r.tronque
        ? `Les ${r.items.length} premiers sur ${r.total} — précisez la recherche pour voir les autres.`
        : '';
}

/** Les objets que la palette trouve, par nom ou par valeur de champ, dans les couches visibles. */
function objetsPourLaPalette(q) {
    const sortie = [];
    const aPreparer = [];
    if (q.trim().length < 2) return { sortie, aPreparer };
    for (const layer of STATE.layers) {
        if (layer.visible === false || !Array.isArray(layer.geojson?.features)) continue;
        const cache = _indexListe.get(layer.id);
        if (cache && cache.geojson === layer.geojson) {
            const garde = buildControlPredicate(layer);
            const feats = layer.geojson.features;
            const r = listerObjets(cache.entrees, { requete: q, tri: 'nom', max: 8, visible: (e) => !garde || garde(feats[e.idx]) });
            for (const o of r.items) {
                sortie.push({ coucheId: layer.id, idx: o.idx, nom: o.nom, couche: layer.name, trouveDans: o.trouveDans });
            }
        } else {
            // Le nom seulement, le temps que l'index de cette couche se prépare.
            for (const o of objetsPourPalette([layer], q, { max: 8 })) sortie.push({ ...o, trouveDans: null });
            aPreparer.push(layer);
        }
    }
    return { sortie: sortie.slice(0, 8), aPreparer };
}

/** Géocodage du premier résultat (Nominatim), sans changer le lieu du projet. */
async function allerAuLieu(q) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=fr&q=${encodeURIComponent(q)}`, { headers: enTetesOSM({ Accept: 'application/json' }) });
        const [d] = await res.json();
        if (!d) { showToast(`Lieu introuvable : ${q}`, 'warning'); return; }
        map?.flyTo({ center: [+d.lon, +d.lat], zoom: 16, duration: 1200 });
    } catch (e) {
        showToast('Recherche de lieu indisponible', 'error');
    }
}
function renderCmd() {
    $('cmd-list').innerHTML = cmdItems.map((i, k) => `<div class="cmd-item ${k === cmdSel ? 'sel' : ''}" data-k="${k}"><span class="cmd-ic">${i.ic}</span><span>${escapeHtml(i.label)}</span><span class="cmd-kind">${i.kind}</span></div>`).join('') || '<div class="cmd-item">Aucun résultat</div>';
    $('cmd-list').querySelectorAll('.cmd-item[data-k]').forEach((el) => el.onclick = () => runCmd(+el.dataset.k));
}
function runCmd(k) { const it = cmdItems[k]; closeCmd(); if (it) it.run(); }

// ============================================================
// UTILS
// ============================================================
function randomColor() { const c = ['#C44536', '#2E4E54', '#5B7A4F', '#E8A234', '#8E5A37', '#6E5A40', '#4292C6', '#af7aa1']; return c[Math.floor(Math.random() * c.length)]; }
function showLoading(t) { $('loading-text').textContent = t || 'Chargement…'; $('loading').classList.add('show'); }
function hideLoading() { $('loading').classList.remove('show'); }
function showToast(msg, type = 'success') {
    const ic = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };
    const el = document.createElement('div'); el.className = 'toast ' + type;
    el.innerHTML = `<span>${ic[type] || ''}</span><span>${msg}</span>`;
    $('toasts').appendChild(el); setTimeout(() => el.remove(), 4000);
}
function updateRailBadge() {
    const b = $('rail-couches-badge'); const n = STATE.layers.length;
    b.style.display = n ? 'block' : 'none'; b.textContent = n;
    // Les couches changent : tant qu'aucun lieu n'est désigné, l'ancre du soleil suit leur emprise.
    if (n && !STATE.locationChoisie) ancrerSurDonnees(computeLayersBounds());
}

// ============================================================
// GLOBAL HANDLER NAMESPACE (inline onclick → A.xxx)
// ============================================================
const A = {
    openModule, exitSelectionMode,

    // ---------- Formulaires ----------

    /**
     * Proposer — ou retirer — un formulaire hors edition.
     *
     * > **La case ne veut dire qu'une chose : visible en terrain.** En edition
     * > tous les formulaires de la couche ont leur onglet, sinon on ne pourrait
     * > pas composer celui qu'on n'a pas encore expose.
     *
     * Le reglage voyage avec la COUCHE et non avec le formulaire : une meme
     * table peut etre proposee dans une scene et pas dans une autre, alors que
     * sa definition est unique.
     *
     * Il remplace les deux actions d'avant — « publier le formulaire d'une
     * table » et « choisir lequel sert de fiche ». La premiere ne connaissait
     * qu'un formulaire par table ; la seconde n'a plus d'objet depuis que tous
     * ont leur onglet.
     */
    /**
     * Cadrer un formulaire : retirer un champ de ce que **cette scene** montre.
     *
     * Ce n'est pas une composition. Rien n'est ecrit dans `Formulaires` : le
     * FormDef reste la propriete de qui l'a fait — le builder, ou QField par
     * qgis2grist. Le masque vit avec la couche, a cote d'`exposes`, et dit
     * « cette scene ne montre pas ce champ ».
     *
     * On enregistre ce qu'on RETIRE, jamais ce qu'on garde : un formulaire
     * amont qui gagne un champ plus tard le montrera, et une colonne supprimee
     * rend son masque inerte au lieu de faux.
     */
    /** Retient qu'une liste de champs est ouverte (voir `_champsOuverts`). */
    suivreChamps(cle, ouvert) {
        if (ouvert) _champsOuverts.add(cle); else _champsOuverts.delete(cle);
    },
    async masquerChamp(layerId, formId, colId) {
        if (!assertCanWrite('régler les champs')) return;
        const couche = STATE.layers.find((l) => l.id === layerId);
        if (!couche || !formId || !colId) return;
        const vise = formulairesDeLaCouche(couche).find((f) => f.id === formId);
        if (!vise) return;
        // Un champ dont un autre depend ne se retire pas : le dependant
        // resterait coince, sans erreur et sans message.
        if (champsDependants(vise.def).has(colId)) {
            showToast('Un autre champ dépend de celui-ci', 'warning');
            return;
        }
        const masques = { ...reglagesFormulaire(couche).masques };
        // On part de ce qui est MASQUE A L'ECRAN — le defaut compris : partir de
        // l'enregistre seul aurait reaffiche d'un coup toutes les colonnes
        // d'Atlas au premier clic sur un autre champ.
        const actuels = new Set(vise.masques || []);
        const retire = !actuels.has(colId);
        if (retire) actuels.add(colId); else actuels.delete(colId);
        // L'entree est gardee meme vide : c'est une decision (« tout
        // reaffiche »), et sans elle le defaut reviendrait au rechargement.
        masques[formId] = [...actuels];
        couche.formulaire = { ...(couche.formulaire || {}), masques };

        renderFormulaires();
        renderInspector();
        await saveLayerToGrist(couche, true);
    },
    /**
     * D'où part un champ d'un formulaire d'ajout. Le choix vaut pour la scène,
     * comme les champs montrés : on enregistre la décision, même « Vide », pour
     * qu'Atlas ne revienne pas à sa proposition au rechargement.
     */
    async reglerDepart(layerId, formId, colId, depart) {
        if (!assertCanWrite('régler les valeurs de départ')) return;
        const couche = STATE.layers.find((l) => l.id === layerId);
        const vise = couche && formulairesDeLaCouche(couche).find((f) => f.id === formId);
        if (!vise || vise.surLaCouche || !colId) return;
        const departs = { ...reglagesFormulaire(couche).departs };
        departs[formId] = { ...(vise.departs || {}), [colId]: depart };
        couche.formulaire = { ...(couche.formulaire || {}), departs };
        renderFormulaires();
        renderInspector();
        await saveLayerToGrist(couche, true);
    },
    async exposerFormulaire(layerId, formId) {
        if (!assertCanWrite('proposer un formulaire')) return;
        const couche = STATE.layers.find((l) => l.id === layerId);
        if (!couche || !formId) return;
        const actuels = formulairesDeLaCouche(couche);
        const vise = actuels.find((f) => f.id === formId);
        // La ligne de la table Formulaires, pour pouvoir la publier : la liste
        // par couche ne porte pas le rowId, qui n'existe que pour un enregistre.
        const ligne = STATE.formulaires.find((e) => e.formId === formId);
        // Un dérivé n'existe pas en base : il ne peut pas être proposé, et
        // l'accepter laisserait dans la liste un identifiant que rien ne
        // pourra jamais honorer.
        if (vise?.derive) {
            showToast('Enregistrez ce formulaire avant de le proposer', 'warning');
            return;
        }
        // On repart des seuls identifiants encore honorables : ceux d'un
        // formulaire enregistré qui existe toujours. Les autres — dérivés,
        // formulaires supprimés — disparaissent à la première décision.
        const exposes = new Set(actuels.filter((f) => f.expose && !f.derive).map((f) => f.id));
        const actif = !exposes.has(formId);
        if (actif) exposes.add(formId); else exposes.delete(formId);
        // `exposes` remplace l'ancien booleen : une liste, meme vide, dit que
        // cette couche a decide — et `expose` n'a plus a etre relu.
        //
        // Les masques sont **reportes**, pas reecrits : ce sont deux reglages
        // distincts, et cette ligne remplace l'objet entier. Sans le report,
        // cocher un formulaire effacerait le cadrage de tous les autres.
        const reglagesAvant = reglagesFormulaire(couche);
        couche.formulaire = {
            fiche: reglagesAvant.fiche,
            exposes: [...exposes],
            masques: reglagesAvant.masques,
            retires: reglagesAvant.retires,
            departs: reglagesAvant.departs,
        };

        // > **Proposer, c'est publier.** Un formulaire compose ici nait
        // > brouillon — c'est juste, on vient de le deduire et personne ne l'a
        // > relu. Mais un brouillon n'est jamais offert en lecture, et Atlas
        // > n'a aucun autre endroit ou le publier : la bascule serait restee
        // > sans effet, et la personne aurait cherche pourquoi.
        //
        // Le statut dit « ce formulaire est pret » et vit dans la table
        // Formulaires ; `exposes` dit « cette scene le montre » et vit avec la
        // couche. Deux faits distincts, et c'est le meme geste qui pose le
        // premier.
        if (actif && vise?.statut === 'brouillon' && ligne?.rowId) {
            try {
                await grist.docApi.applyUserActions([['UpdateRecord', 'Formulaires', ligne.rowId, { Statut: 'publie' }]]);
                await chargerFormulaires();
            } catch (e) {
                showToast('Publication refusée : ' + e.message, 'error');
                return;
            }
        }

        renderFormulaires();
        refreshControlsDock();

        renderInspector();
        await saveLayerToGrist(couche, true);
        const nom = actuels.find((f) => f.id === formId)?.titre || formId;
        showToast(actif ? `Proposé hors édition · ${nom}` : `Retiré · ${nom}`, 'success');
    },

    /**
     * Retirer un formulaire de la couche, ou l'y remettre.
     *
     * Reversible et local a la scene : la ligne de `Formulaires` n'est pas
     * touchee, le cadrage des champs est garde. Retirer le sort aussi des
     * formulaires proposes hors edition — sinon il reviendrait expose a la
     * remise, sans qu'on l'ait redecide.
     */
    async retirerFormulaire(layerId, formId, retirer) {
        if (!assertCanWrite('retirer un formulaire')) return;
        const couche = STATE.layers.find((l) => l.id === layerId);
        const vise = couche && formulairesDeLaCouche(couche, { avecRetires: true }).find((f) => f.id === formId);
        if (!vise) return;
        // Remettre est toujours permis ; retirer, sauf le dernier en place.
        const garde = retirer
            ? raisonNonRetirable(vise, formulairesDeLaCouche(couche, { avecRetires: true }))
            : null;
        if (garde) { showToast(`Impossible de retirer « ${vise.titre} » : ${garde}`, 'error'); return; }
        const r = reglagesFormulaire(couche);
        const retires = new Set(r.retires);
        if (retirer) retires.add(formId); else retires.delete(formId);
        const suite = { ...(couche.formulaire || {}), retires: [...retires] };
        if (retirer) {
            // La liste d'exposes est reecrite depuis ce qui est vraiment
            // propose : un booleen herite designerait sinon le suivant.
            const exposes = formulairesDeLaCouche(couche)
                .filter((f) => f.expose && !f.derive && f.id !== formId)
                .map((f) => f.id);
            if (Array.isArray(r.exposes) || vise.expose) {
                suite.exposes = exposes;
                delete suite.expose;
            }
            if (r.fiche === formId) suite.fiche = null;
        }
        couche.formulaire = suite;
        if (retirer && _inspObjTab === formId) _inspObjTab = null;
        renderFormulaires();
        refreshControlsDock();
        renderInspector();
        await saveLayerToGrist(couche, true);
        showToast(retirer ? `Retiré de la couche · ${vise.titre}` : `Remis · ${vise.titre}`, 'success');
    },

    /**
     * Enregistrer un formulaire deduit — le seul chemin par lequel Atlas ecrit
     * dans `Formulaires`, et il part toujours d'un clic.
     *
     * Sur la couche le geste est **composer** : `Attributs` reste la vue
     * complete de la table, et ce qu'on cree est un formulaire distinct, qu'on
     * pourra restreindre. Sur une table liee c'est **enregistrer** : le derive
     * est deja le formulaire de cette table, l'ecrire le rend proposable.
     *
     * La definition ecrite est celle qu'on voit — meme champs, meme ordre.
     * Partir d'autre chose surprendrait.
     */
    async enregistrerFormulaire(layerId, formId) {
        if (!assertCanWrite('enregistrer un formulaire')) return;
        const couche = STATE.layers.find((l) => l.id === layerId);
        const f = couche && formulairesDeLaCouche(couche).find((x) => x.id === formId);
        const geste = gesteDEnregistrement(f, STATE.formulaires);
        if (!geste) return;

        const T = window.FormulairesTable;
        if (!T || !f.def) { showToast('Module formulaires indisponible', 'error'); return; }
        try {
            showLoading(`${geste.libelle}…`);
            // La table est creee a la demande, avec le schema partage : Atlas ne
            // decrit pas `Formulaires` de son cote, sinon deux definitions
            // divergeraient au premier changement.
            const tables = await grist.docApi.listTables();
            if (!tables.includes('Formulaires')) {
                await grist.docApi.applyUserActions(T.planCreateFormulairesTable());
            }
            const def = { ...f.def, id: idFormulaireLibre(f.tableId, STATE.formulaires), title: geste.titre };
            const champs = T.rowFromFormDef(def, { statut: 'brouillon', version: 1 });
            const colonnes = {};
            for (const [k, v] of Object.entries(champs)) colonnes[k] = [v];
            await grist.docApi.applyUserActions([['BulkAddRecord', 'Formulaires', [null], colonnes]]);
            // Le formulaire composé part du cadrage de celui dont il vient.
            //
            // Sans cela, il héritait de ce que les préférences gardaient sous
            // son identifiant : `idFormulaireLibre` évite les lignes existantes,
            // pas les réglages d'un formulaire supprimé. Constaté le 16/09/2026 —
            // un « Saisie » tout neuf arrivait avec quatre champs masqués par
            // un formulaire effacé qui portait le même nom.
            const reglages = couche.formulaire || {};
            couche.formulaire = {
                ...reglages,
                masques: { ...(reglages.masques || {}), [def.id]: [...(f.masques || [])] },
            };
            await saveLayerToGrist(couche, true);
            await chargerFormulaires();
            hideLoading();
            renderFormulaires();
            renderInspector();
            showToast(`« ${geste.titre} » enregistré — brouillon`, 'success');
        } catch (e) {
            hideLoading();
            showToast('Grist : ' + e.message, 'error');
        }
    },

    // Lieu
    recenter() { if (map) map.flyTo({ center: [STATE.location.lng, STATE.location.lat], zoom: 16, pitch: 55, duration: 1200 }); },
    searchLocation,
    /**
     * L'auteur dit où la carte s'ouvre : sur les données (toutes, ou une couche), sur un lieu, ou sur la vue actuelle.
     * Le choix vit avec la scène et vaut pour tous ; l'auteur le voit aussitôt.
     */
    setCadrage(mode, valeur) {
        if (!assertCanWrite('régler l’ouverture de la carte')) return;
        let cadrage;
        if (mode === 'donnees') cadrage = valeur ? { mode: 'donnees', couche: valeur } : { mode: 'donnees' };
        else if (mode === 'vue') cadrage = { mode: 'vue', vue: cameraCourante() };
        else {
            // Le lieu part du lieu déjà désigné, sinon de ce que la carte montre : on ne saute pas ailleurs.
            if (!STATE.locationChoisie) {
                const c = map.getCenter();
                STATE.location = { ...STATE.location, lat: c.lat, lng: c.lng, name: `${c.lat.toFixed(4)}°N, ${c.lng.toFixed(4)}°E` };
                STATE.locationChoisie = true;
            }
            const l = STATE.location;
            cadrage = { mode: 'lieu', lieu: { lng: l.lng, lat: l.lat, nom: l.name } };
        }
        STATE.exposition = normaliserExposition({ ...STATE.exposition, cadrage });
        markDirty();
        persistScenePrefsDifferee(200);
        if (mode !== 'vue' && mode !== 'lieu') {
            const cible = cadrageEffectif({ cadrage: STATE.exposition.cadrage, couches: couchesCadrage() });
            if (cible) poserCadrage(cible, true);
        }
        renderLieu();
    },
    capturerMiniature() { capturerMiniature(); },
    retirerMiniature() {
        if (!assertCanWrite('retirer la miniature de la scène')) return;
        STATE.miniature = '';
        STATE._miniatureAEcrire = true;
        markDirty();
        persistScenePrefsDifferee(200);
        renderLieu();
    },
    pickSearch(name, lat, lng) {
        STATE.location = { ...STATE.location, name, lat: +lat, lng: +lng };
        lieuChoisi();
        $('loc-results').classList.remove('open');
        $('project-name').textContent = STATE.projectName || name.split(',')[0];
        map.flyTo({ center: [+lng, +lat], zoom: 16, duration: 1200 });
        markDirty(); renderLieu();
    },
    pickOnMap() {
        locationPickMode = true;
        if (map) map.getCanvas().style.cursor = 'crosshair';
        showToast('Cliquez sur la carte pour définir le lieu (Échap pour annuler)', 'info');
    },
    useGeolocation() {
        if (!navigator.geolocation) { showToast('Géolocalisation non supportée', 'error'); return; }
        showLoading('Localisation…');
        navigator.geolocation.getCurrentPosition((pos) => {
            hideLoading();
            STATE.location = { ...STATE.location, name: 'Ma position', lat: pos.coords.latitude, lng: pos.coords.longitude };
            lieuChoisi();
            map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16, duration: 1200 });
            renderLieu(); showToast('Position détectée', 'success');
        }, () => { hideLoading(); showToast('Géolocalisation refusée', 'warning'); }, { timeout: 10000 });
    },
    applyManualCoords() {
        const lat = parseFloat($('loc-lat').value), lng = parseFloat($('loc-lng').value);
        if (isNaN(lat) || isNaN(lng)) { showToast('Coordonnées invalides', 'warning'); return; }
        STATE.location = { ...STATE.location, lat, lng, name: `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E` };
        lieuChoisi();
        map.flyTo({ center: [lng, lat], zoom: 16, duration: 1000 }); renderLieu();
    },
    setProjectName(v) { STATE.projectName = v; $('project-name').textContent = v || 'Nouveau projet'; markDirty(); },

    // Couches
    openOSM, runOSM,
    selectLayer(id) {
        if (CONFIG.viewMode) {
            A.zoomLayer(id);
            return;
        }
        inspectorUserClosed = false;
        STATE.selectedLayer = id;
        const layer = STATE.layers.find((l) => l.id === id);
        if (layer) layer._modelCat = layer._modelCat || 'furniture';
        if (STATE.currentModule !== 'couches') openModule('couches');
        else { renderLayersPanel('couches'); renderInspector(); }
    },
    /** Arme la création d'un objet dans une couche : le prochain clic sur la carte pose le point. */
    nouvelObjet(layerId, { suite = null } = {}) {
        const layer = STATE.layers.find((l) => l.id === layerId);
        const possible = creationPossible(layer, contexteCreation(layer));
        if (!possible.ok) { showToast(possible.raison, 'warning'); return; }
        if (lecteurRecitActif()) { showToast('Quittez la lecture du récit pour créer un objet', 'warning'); return; }
        // État exclusif : on sort de tout ce qui écoute aussi les clics.
        if (trajetPickMode) annulerChoixTrajet();
        locationPickMode = false;
        if (STATE.selection.mode) exitSelectionMode();
        clearHighlight();
        inspectorUserClosed = false;
        _saisieObjet = {
            layerId, geometrie: null, creation: { cellules: null },
            formulaireMonte: false, enCours: false, jeton: String(Date.now()),
            // Suite d'une série : le dernier ajout, et combien de créés.
            precedente: suite ? { rowId: suite.rowId, table: suite.table } : null,
            serie: suite ? suite.serie : 0,
        };
        _derniereCreation = null;
        document.body.classList.add('mode-creation');
        // En exploitation, la fiche de saisie ne s'affiche que sous `mode-saisie` : on l'allume le temps de la création.
        if (CONFIG.viewMode) document.body.classList.add('mode-saisie');
        // Le panneau du relevé a fait son office : ouvert, il recouvrirait la carte où l'on va poser le point.
        if (_openDockPill === 'releve') $('map-controls-dock')?.classList.add('collapsed');
        const famille = familleGeometrie(layer.geometryType);
        if (map && famille === 'Point') map.getCanvas().style.cursor = 'crosshair';
        if (!suite && layer.visible === false) showToast(`La couche « ${layer.name} » est masquée : l’objet sera créé, mais pas affiché`, 'warning');
        renderSaisieObjet();
        openInspectorPanel();
        const geste = famille === 'Point' ? 'cliquez sur la carte pour placer le point'
            : famille === 'Polygon' ? 'tracez la surface sur la carte' : 'tracez la ligne sur la carte';
        // En série, « Objet créé » vient d'être dit : on n'ajoute que la suite.
        showToast(suite ? `Suivant : ${geste}` : `${geste.charAt(0).toUpperCase()}${geste.slice(1)} · ${layer.name}`, 'info');
        if (famille !== 'Point') demarrerTrace(_saisieObjet, layer);
    },
    /** Retire la ligne du dernier objet de la série ; la création en cours continue. */
    async annulerDernierAjout() {
        const s = _saisieObjet;
        const layer = STATE.layers.find((l) => l.id === s?.layerId);
        const p = s?.precedente;
        if (!p || !layer) return;
        if (!assertCanWrite('annuler l’ajout')) return;
        const action = actionInverse(['AddRecord', p.table, null, {}], p.rowId);
        try {
            await grist.docApi.applyUserActions([action]);
        } catch (e) {
            enterViewModeOnWriteFail(e);
            showToast('Grist refuse de retirer la ligne : ' + e.message, 'error');
            return;
        }
        if (_saisieObjet !== s) return;
        s.precedente = null;
        s.serie = Math.max(0, (s.serie || 1) - 1);
        try { await relireCouche(layer); } catch (e) { /* la ligne est retirée ; la carte se relira au prochain rafraîchissement */ }
        updateLegend();
        renderSaisieObjet();
        showToast(`Ajout annulé — ligne ${p.rowId} retirée de ${p.table}`, 'info');
    },
    /** Termine la série et ouvre la fiche du dernier objet créé. */
    voirDernierObjet() {
        const s = _saisieObjet;
        const layer = STATE.layers.find((l) => l.id === s?.layerId);
        const p = s?.precedente;
        if (!p || !layer) return;
        if (s.geometrie || formeEnCours(s)) {
            showToast('Un objet est en cours : enregistrez-le ou abandonnez-le d’abord', 'warning');
            return;
        }
        quitterSaisieObjet();
        const [idx] = rangsDepuisRowIds(layer.geojson?.features, [p.rowId]);
        if (idx == null) return;
        enterSelectionMode(layer.id, idx);
        _derniereCreation = { layerId: layer.id, rowId: p.rowId, table: p.table };
        renderInspector();
    },
    /**
     * Ouvre la forme de l'objet sélectionné dans l'éditeur.
     *
     * Les cellules de géométrie sont relues dans Grist à l'ouverture : c'est ce
     * qu'« Annuler la modification » réécrira à l'identique, et ce contre quoi
     * un changement venu d'ailleurs sera détecté avant d'écrire.
     */
    async modifierForme() {
        const layer = STATE.layers.find((l) => l.id === STATE.selection.layerId);
        const idx = STATE.selection.features[STATE.selection.multiIndex || 0];
        const f = layer?.geojson?.features?.[idx];
        const possible = modificationPossible(layer, f, { viewMode: !!CONFIG.viewMode, peutEcrire: canWrite(CONFIG.viewMode) });
        if (!possible.ok) { showToast(possible.raison, 'warning'); return; }
        if (lecteurRecitActif()) { showToast('Quittez la lecture du récit pour modifier une forme', 'warning'); return; }
        const rowId = f.properties._row_id;
        let ligne;
        try {
            ligne = ligneDepuisTable(await grist.docApi.fetchTable(layer.sourceTable), rowId);
        } catch (e) {
            showToast('Lecture de la ligne impossible : ' + e.message, 'error');
            return;
        }
        if (!ligne) { showToast('Cette ligne n’existe plus dans Grist : rafraîchissez la couche', 'warning'); return; }
        const famille = familleGeometrie(layer.geometryType);
        const depart = formeValidee(f.geometry, layer.geometryType);
        if (!depart.ok) { showToast('Forme actuelle invalide : ' + depart.erreur, 'warning'); return; }
        if (aDesAltitudes(f.geometry)) showToast('Cet objet porte des altitudes : elles seront perdues à l’enregistrement', 'warning');
        if (trajetPickMode) annulerChoixTrajet();
        locationPickMode = false;
        exitSelectionMode();
        clearHighlight();
        inspectorUserClosed = false;
        _saisieObjet = {
            layerId: layer.id, geometrie: null, creation: { cellules: null },
            formulaireMonte: false, enCours: false, jeton: String(Date.now()),
            modification: { rowId, origine: cellulesDeLigne(layer, ligne), depart: depart.geometrie },
        };
        document.body.classList.add('mode-creation');
        syncLayerSourceData(layer);
        if (famille === 'Point') {
            _saisieObjet.geometrie = depart.geometrie;
            dessinerSaisie();
            if (map) map.getCanvas().style.cursor = 'crosshair';
        }
        renderSaisieObjet();
        openInspectorPanel();
        if (famille !== 'Point') demarrerTrace(_saisieObjet, layer);
    },
    /** Défait le dernier geste de la modification (déplacement, insertion, retrait de sommet). */
    gestePrecedent() {
        const t = _saisieObjet?.trace;
        if (!t) return;
        let fait = false;
        try { fait = t.draw.canUndo() && t.draw.undo(); } catch (e) { console.warn('[Atlas tracé] undo', e.message); }
        if (!fait) showToast('Aucun geste à défaire', 'info');
        renderSaisieObjet();
    },
    /** Écrit la forme modifiée, et elle seule, après avoir vérifié que la ligne n'a pas changé entre-temps. */
    async enregistrerForme() {
        const s = _saisieObjet;
        const layer = STATE.layers.find((l) => l.id === s?.layerId);
        if (!s?.modification || !layer || s.enCours) return;
        if (!assertCanWrite('modifier la forme')) return;
        const famille = familleGeometrie(layer.geometryType);
        const v = formeValidee(famille === 'Point' ? s.geometrie : formeEnCours(s), layer.geometryType);
        if (!v.ok) { showToast(v.erreur, 'warning'); return; }
        const nouvelles = cellulesPourCouche(layer, v.geometrie);
        if (!nouvelles) { showToast('Cette forme ne peut pas s’écrire dans les colonnes de la couche.', 'error'); return; }
        const { rowId, origine } = s.modification;
        s.enCours = true;
        const bouton = $('forme-enregistrer');
        if (bouton) { bouton.disabled = true; bouton.textContent = 'Envoi…'; }
        const rendre = () => { s.enCours = false; if (bouton) { bouton.disabled = false; bouton.textContent = 'Enregistrer la forme'; } };
        try {
            const actuelles = cellulesDeLigne(layer, ligneDepuisTable(await grist.docApi.fetchTable(layer.sourceTable), rowId));
            if (!actuelles) { rendre(); showToast('Cette ligne a été supprimée dans Grist entre-temps', 'error'); return; }
            const decision = decisionModification({ origine, actuelles, nouvelles });
            if (decision === 'conflit') {
                rendre();
                showToast('La forme a changé dans Grist depuis l’ouverture : abandonnez puis rouvrez la modification pour repartir de la version actuelle', 'error');
                return;
            }
            if (decision === 'inchange') {
                await terminerModification(layer, rowId, null);
                showToast('Forme inchangée — rien n’a été écrit', 'info');
                return;
            }
            await grist.docApi.applyUserActions([actionModification(layer.sourceTable, rowId, nouvelles)]);
            await terminerModification(layer, rowId, { table: layer.sourceTable, origine });
            showToast(`Forme enregistrée · ligne ${rowId}`, 'success');
        } catch (e) {
            // La forme reste dans l'éditeur : on peut réessayer sans la refaire.
            rendre();
            enterViewModeOnWriteFail(e);
            showToast('Grist refuse la modification : ' + e.message, 'error');
        }
    },
    /** Réécrit les cellules d'origine, telles que Grist les tenait à l'ouverture. */
    async annulerModification() {
        const m = _derniereModification;
        const layer = STATE.layers.find((l) => l.id === m?.layerId);
        if (!m || !layer) return;
        if (!assertCanWrite('annuler la modification')) return;
        try {
            await grist.docApi.applyUserActions([actionModification(m.table, m.rowId, m.origine)]);
        } catch (e) {
            enterViewModeOnWriteFail(e);
            showToast('Grist refuse de rétablir la forme : ' + e.message, 'error');
            return;
        }
        _derniereModification = null;
        try { await relireCouche(layer); } catch (e) { /* la ligne est rétablie ; la carte se relira au prochain rafraîchissement */ }
        const [idx] = rangsDepuisRowIds(layer.geojson?.features, [m.rowId]);
        if (idx != null) enterSelectionMode(layer.id, idx);
        renderInspector();
        showToast('Forme d’origine rétablie', 'info');
    },
    /** Retire le dernier sommet posé du tracé en cours. */
    sommetPrecedent() {
        const t = _saisieObjet?.trace;
        if (!t || _saisieObjet.geometrie) return;
        try { t.draw.undo(); } catch (e) { console.warn('[Atlas tracé] undo', e.message); }
        majMesuresTrace();
    },
    /** Achève le tracé comme la touche Entrée : le focus du clavier n'est pas toujours dans l'iframe. */
    terminerTrace() {
        const t = _saisieObjet?.trace;
        if (!t || _saisieObjet.geometrie) return;
        t.mode.onKeyUp({ key: 'Enter', heldKeys: [], preventDefault() {} });
        if (!_saisieObjet?.geometrie) {
            showToast(t.famille === 'Polygon' ? 'Une surface demande au moins trois sommets' : 'Une ligne demande au moins deux sommets', 'warning');
        }
    },
    /** Recommence la forme ; la fiche déjà remplie reste en place. */
    retracerSaisieObjet() {
        const s = _saisieObjet;
        if (!s?.trace || !s.geometrie) return;
        s.geometrie = null;
        s.creation.cellules = null;
        s.trace.draw.clear();
        s.trace.draw.setMode(s.trace.mode.mode);
        renderSaisieObjet();
    },
    /** Défait la dernière création tant que son objet est sélectionné : une seule ligne retirée. */
    async annulerCreation() {
        const d = _derniereCreation;
        const layer = STATE.layers.find((l) => l.id === d?.layerId);
        if (!d || !layer) return;
        if (!assertCanWrite('annuler la création')) return;
        const action = actionInverse(['AddRecord', d.table, null, {}], d.rowId);
        if (!action) return;
        try {
            await grist.docApi.applyUserActions([action]);
        } catch (e) {
            enterViewModeOnWriteFail(e);
            showToast('Grist refuse de retirer la ligne : ' + e.message, 'error');
            return;
        }
        _derniereCreation = null;
        exitSelectionMode();
        try { await relireCouche(layer); } catch (e) { /* la ligne est retirée ; la carte se relira au prochain rafraîchissement */ }
        updateLegend();
        if (STATE.currentModule === 'couches') renderLayersPanel('couches');
        showToast(`Création annulée — ligne ${d.rowId} retirée de ${d.table}`, 'info');
    },
    abandonnerSaisieObjet() {
        quitterSaisieObjet(messageAbandon());
    },
    /** Repli sans moteur de formulaire : écrit le point et son nom, en une action. */
    async enregistrerSaisieObjet() {
        const s = _saisieObjet;
        const layer = STATE.layers.find((l) => l.id === s?.layerId);
        if (!layer || !s.geometrie || !s.creation.cellules || s.enCours) return;
        if (!assertCanWrite('créer un objet')) return;
        const champs = {};
        const nom = $('saisie-nom')?.value?.trim();
        if (nom) champs.nom = nom;
        s.enCours = true;
        const bouton = $('saisie-enregistrer');
        if (bouton) { bouton.disabled = true; bouton.textContent = 'Envoi…'; }
        try {
            const r = await grist.docApi.applyUserActions([actionCreation(layer.sourceTable, champs, s.creation.cellules)]);
            showToast(`Objet créé · ${layer.sourceTable}`, 'success');
            await apresCreationObjet(layer, rowIdCree(r));
        } catch (e) {
            // La forme reste en mémoire : on peut réessayer sans recliquer.
            s.enCours = false;
            if (bouton) { bouton.disabled = false; bouton.textContent = 'Enregistrer l’objet'; }
            enterViewModeOnWriteFail(e);
            showToast('Grist refuse la création : ' + e.message, 'error');
        }
    },
    /**
     * « Nouvelle couche » : un nom, un type, et la table Grist qu'on créera,
     * montrée avant d'écrire. Formulaire dans le panneau du module, pas de modale.
     */
    async openNouvelleCouche() {
        if (!CONFIG.grist.ready) { showToast('Disponible seulement dans Grist', 'warning'); return; }
        if (!assertCanWrite('créer une couche')) return;
        try { _nouvelleCouche.tables = await grist.docApi.listTables(); } catch (e) { _nouvelleCouche.tables = []; }
        const body = $('module-body');
        const types = TYPES_COUCHE.map((t) => `<button type="button" class="btn ${_nouvelleCouche.type === t ? 'btn-primary' : 'btn-soft'}" style="flex:1" aria-pressed="${_nouvelleCouche.type === t}" onclick="A.nouvelleCoucheType('${t}')">${LIBELLES_TYPE[t]}</button>`).join('');
        body.innerHTML = `
            <div class="section">
                <div class="section-title">Nouvelle couche</div>
                <label class="input-label" for="nc-nom">Nom</label>
                <input class="input" id="nc-nom" maxlength="80" placeholder="Arbres remarquables" value="${escapeHtml(_nouvelleCouche.nom)}"
                    oninput="A.nouvelleCoucheApercu(this.value)" onkeydown="if(event.key==='Enter')A.creerNouvelleCouche()">
                <div class="input-label" style="margin-top:10px">Géométrie</div>
                <div style="display:flex;gap:6px" role="group" aria-label="Géométrie">${types}</div>
                <div class="layer-meta" id="nc-apercu" style="margin-top:10px" aria-live="polite"></div>
                <div class="layer-meta" style="margin-top:6px">${grist._horsLigne?.local ? 'La couche est créée avec les colonnes Nom et Géométrie, sur cet appareil ; elle ira dans Grist avec la scène.' : 'Grist ajoutera aussi une page à ce nom, avec les colonnes Nom et Géométrie.'} Les autres champs s'ajoutent ensuite, par le module Formulaires${grist._horsLigne?.local ? '' : ' ou dans Grist'}.</div>
                <div style="display:flex;gap:8px;margin-top:12px">
                    <button class="btn btn-soft" style="flex:1" onclick="A.openModule('couches')">Annuler</button>
                    <button class="btn btn-primary" style="flex:1" id="nc-creer" onclick="A.creerNouvelleCouche()">Créer la couche</button>
                </div>
            </div>`;
        A.nouvelleCoucheApercu(_nouvelleCouche.nom);
        $('nc-nom')?.focus();
    },
    nouvelleCoucheType(t) {
        if (!TYPES_COUCHE.includes(t)) return;
        _nouvelleCouche.type = t;
        _nouvelleCouche.nom = $('nc-nom')?.value ?? _nouvelleCouche.nom;
        A.openNouvelleCouche();
    },
    nouvelleCoucheApercu(nom) {
        _nouvelleCouche.nom = String(nom ?? '');
        const p = planNouvelleCouche({ nom: _nouvelleCouche.nom, type: _nouvelleCouche.type, tables: _nouvelleCouche.tables });
        const el = $('nc-apercu');
        if (el) {
            el.textContent = p.ok
                ? `Table Grist : ${p.tableId}${p.renomme ? ' (ce nom est déjà pris dans le document)' : ''}`
                : (_nouvelleCouche.nom.trim() ? p.erreur : '');
        }
        const b = $('nc-creer');
        if (b) b.disabled = !p.ok;
    },
    /**
     * Crée la table, sa ligne d'inventaire et sa ligne d'apparence en UNE
     * transaction, puis monte la couche, vide. Un refus n'écrit rien et ne fait
     * pas basculer la carte en lecture : on peut avoir le droit d'écrire des
     * lignes sans celui de créer des tables.
     */
    async creerNouvelleCouche() {
        if (_nouvelleCouche.enCours) return;
        if (!CONFIG.grist.ready || !assertCanWrite('créer une couche')) return;
        const nom = String($('nc-nom')?.value ?? _nouvelleCouche.nom).trim();
        const type = _nouvelleCouche.type;
        _nouvelleCouche.enCours = true;
        showLoading('Création de la couche…');
        try {
            const tables = await grist.docApi.listTables();
            const plan = planNouvelleCouche({ nom, type, tables });
            if (!plan.ok) { hideLoading(); showToast(plan.erreur, 'warning'); return; }
            const layer = makeLayer(nom, type, { type: 'FeatureCollection', features: [] }, null, null);
            layer.kind = 'table';
            layer.sourceTable = plan.tableId;
            layer.geometryColumn = colonneGeometrieNouvelleCouche(type);
            layer.source = 'grist-table';
            layer.controls = [];
            const { actions, indices } = actionsNouvelleCouche({
                tableId: plan.tableId, type, tables,
                inventaire: ligneInventaire(layer), prefs: lignePrefs(layer),
                schemas: { maquette: TABLE_SCHEMAS.Maquette_Layers, prefs: ATLAS_PREFS_SCHEMA },
            });
            const r = await grist.docApi.applyUserActions(actions);
            const cree = lireCreation(r?.retValues, indices, plan.tableId);
            layer.gristId = cree.gristId;
            layer._prefRowId = cree.prefRowId;
            _maquetteTablePrete = true;
            if (cree.renommee) {
                // Grist a pris un autre nom (création concurrente) : l'inventaire et
                // l'apparence doivent pointer la table réelle.
                layer.sourceTable = cree.tableId;
                const suite = [];
                if (cree.gristId) suite.push(['UpdateRecord', 'Maquette_Layers', cree.gristId, ligneInventaire(layer)]);
                if (cree.prefRowId) suite.push(['UpdateRecord', 'Atlas_LayerPrefs', cree.prefRowId, lignePrefs(layer)]);
                if (suite.length) await grist.docApi.applyUserActions(suite);
            }
            STATE.layers.splice(insertionIndex(STATE.layers, layer.geometryType), 0, layer);
            addLayerToMap(layer);
            updateRailBadge();
            _nouvelleCouche.nom = '';
            // Le schéma ne connaît pas encore la table : sans relecture, la
            // couche n'aurait pas de fiche, et le module Formulaires dirait
            // « Aucune table à saisir ».
            try { await chargerFormulaires(); } catch (e) { /* la fiche retombera sur le repli */ }
            hideLoading();
            showToast(`Couche « ${layer.name} » créée · table ${layer.sourceTable}`, 'success');
            openModule('couches');
            // Une couche vide n'a pas d'autre raison d'être que d'être remplie :
            // on arme la création du premier objet quand l'outil existe.
            if (creationPossible(layer, contexteCreation(layer)).ok) {
                A.nouvelObjet(layer.id);
            }
        } catch (e) {
            hideLoading();
            console.warn('[Atlas] création de couche refusée :', e?.message);
            showToast(messageRefus(e), 'error');
        } finally {
            _nouvelleCouche.enCours = false;
        }
    },
    openLinkTable: async function openLinkTable() {
        if (!CONFIG.grist.ready) { showToast('Disponible seulement dans Grist', 'warning'); return; }
        showLoading('Recherche des tables géo…');
        _linkChoices = await scanGeoTables(grist.docApi);
        hideLoading();
        const body = $('module-body');
        const back = `<div class="section"><button class="btn btn-soft btn-full" onclick="A.openModule('couches')">← Retour</button></div>`;
        if (!_linkChoices.length) {
            body.innerHTML = `<div class="empty"><div class="ic">${icTrait(IC.loupe, 40)}</div><div class="t">Aucune table géo trouvée</div><div class="h">Importez d'abord via QGIS → Grist</div></div>${back}`;
            return;
        }
        const already = new Set(STATE.layers.filter((l) => l.sourceTable).map((l) => l.sourceTable));
        body.innerHTML = `<div class="section-title">Tables géo détectées</div><div class="layer-list">${_linkChoices.map((g, i) => `
            <div class="layer-item" onclick="A.linkTableChoice(${i})">
                <div class="layer-info"><div class="layer-name">${g.table}${already.has(g.table) ? ' ✓' : ''}</div>
                <div class="layer-meta">${geoTableMeta(g)}</div></div>
                <button class="layer-act" title="Lier comme couche">${icTrait(IC.lien)}</button>
            </div>`).join('')}</div>${back}`;
    },
    linkTableChoice(i) { const g = _linkChoices[i]; if (g) linkTableFromGrist(g.table, g.geometryColumn, g._data); },
    showGeoTable(t) {
        const g = _geoTables.find((x) => x.table === t);
        if (g) linkTableFromGrist(g.table, g.geometryColumn, g._data);
        else linkTableFromGrist(t);
    },
    async refreshLayer(id, e) {
        if (e) e.stopPropagation();
        const l = STATE.layers.find((x) => x.id === id);
        if (!l || !isLinkedTableLayer(l)) return;
        showLoading('Rafraîchissement…');
        const lignes = lignesSelectionnees(l);
        try {
            const n = await relireCouche(l, lignes);
            hideLoading();
            showToast(`Rafraîchie · ${n} objets`, 'success');
            if (STATE.currentModule === 'couches') renderLayersPanel('couches');
        } catch (e2) {
            hideLoading();
            showToast('Erreur : ' + e2.message, 'error');
        }
    },
    controlLayer(id) { STATE.selectedLayer = id; renderControles(); },
    setViewerExposed(id, on) {
        if (!assertCanWrite('modifier les contrôles scène')) return;
        setViewerExposedFn(STATE.viewerControls, id, !!on);
        persistScenePrefs();
        refreshControlsDock();
        if (STATE.currentModule === 'controles') renderControles();
    },
    setViewerShadows(on) {
        if (!assertCanWrite('modifier les contrôles scène')) return;
        const vc = getViewerControl(STATE.viewerControls, 'sun');
        if (!vc) return;
        vc.config = { ...vc.config, shadows: !!on };
        if (STATE.settings) STATE.settings.shadows = !!on;
        updateLighting();
        persistScenePrefs();
        if (STATE.currentModule === 'controles') renderControles();
    },
    toggleViewerBasemapAllowed(key) {
        if (!assertCanWrite('modifier les contrôles scène')) return;
        const vc = getViewerControl(STATE.viewerControls, 'basemap');
        if (!vc) return;
        const allowed = [...(vc.config?.allowed || [])];
        const i = allowed.indexOf(key);
        if (i >= 0) allowed.splice(i, 1);
        else {
            if (allowed.length >= 3) {
                showToast('Maximum 3 fonds autorisés', 'warning');
                return;
            }
            allowed.push(key);
        }
        vc.config = { ...vc.config, allowed };
        persistScenePrefs();
        refreshControlsDock();
        if (STATE.currentModule === 'controles') renderControles();
    },
    setControlLabel(layerId, field, label) {
        if (CONFIG.viewMode) return;
        const l = STATE.layers.find((x) => x.id === layerId);
        if (!l) return;
        const c = (l.controls || []).find((x) => x.field === field);
        if (!c) return;
        c.label = String(label || field).trim() || field;
        markDirty();
        refreshControlsDock();
        persisterControles(l);
    },
    toggleControl(id, field, type) {
        if (CONFIG.viewMode) {
            showToast('Mode lecture — activation des contrôles réservée à l’éditeur', 'warning');
            return;
        }
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        const c = controleDuChamp(l, field, type);
        ensureControlVariant(c, c.type);
        c.active = !c.active;
        if (c.active && c.type === 'select' && !Array.isArray(c.values)) {
            c.values = controlBounds(l, 'select', c.field).values;
        }
        applyControls(l);
        renderControles();
        refreshControlsDock();
        markDirty();
        persisterControles(l);
    },
    setControlBound(id, field, which, v) {
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        const c = (l.controls || []).find((x) => x.field === field);
        if (!c) return;
        // Curseur de date poussé à fond : la borne haute des données, pas la
        // dernière position de la grille, qui tombe avant.
        c[which] = valeurDuCurseur(c, +v);
        // Les bornes ne se croisent que sur une plage : un maximum seul n'a pas
        // à déplacer un minimum qu'il n'utilise pas.
        const plage = c.variant === 'range_between' || c.variant === 'time_between';
        if (plage && c.min > c.max) { if (which === 'min') c.max = c.min; else c.min = c.max; }
        majAffichageControle(l, c);
        clearTimeout(this._ctlT);
        this._ctlT = setTimeout(() => applyControls(l), 80);
        markDirty();
        persisterControles(l);
    },
    setControlMin(id, field, v) { A.setControlBound(id, field, 'min', v); },
    setControlMax(id, field, v) { A.setControlBound(id, field, 'max', v); },
    setControlTexte(id, field, texte) {
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        const c = (l.controls || []).find((x) => x.field === field);
        if (!c) return;
        c.texte = String(texte ?? '');
        clearTimeout(this._ctlT);
        this._ctlT = setTimeout(() => applyControls(l), 150);
        markDirty();
        persisterControles(l);
    },
    setControlVariant(id, field, variant) {
        if (CONFIG.viewMode) return;
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        const nouveauType = typeDeVariante(variant);
        // Le réglage vaut aussi pour un contrôle pas encore activé : on prépare
        // sa forme avant de le publier.
        const c = controleDuChamp(l, field, nouveauType || 'select');
        if (nouveauType && nouveauType !== c.type) convertirControle(l, c, nouveauType);
        c.variant = variant;
        ensureControlVariant(c, c.type);
        if (c.type === 'select' && c.variant === 'select_single' && Array.isArray(c.values) && c.values.length > 1) {
            c.values = [c.values[0]];
            c._selectionTouched = true;
        }
        applyControls(l);
        renderControles();
        refreshControlsDock();
        if (_openDockPill) renderDockSlotHost();
        markDirty();
        persisterControles(l);
    },
    toggleControlValue(id, field, value) {
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        const c = (l.controls || []).find((x) => x.field === field);
        if (!c) return;
        ensureControlVariant(c, c.type);
        // Le clic part de ce que l'écran montre : sans sélection posée, toutes
        // les cases sont cochées, et décocher une valeur l'écarte seule.
        c.values = basculerValeurSelection(l, c, value);
        c._selectionTouched = true;
        applyControls(l);
        markDirty();
        persisterControles(l);
    },
    toutesValeursControle(id, field, tout) {
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        const c = (l.controls || []).find((x) => x.field === field);
        if (!c || c.type !== 'select') return;
        c.values = tout ? controlBounds(l, 'select', field).values : [];
        c._selectionTouched = true;
        applyControls(l);
        rafraichirVuesControle();
        markDirty();
        persisterControles(l);
    },
    playTime(id, field) {
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        const c = (l.controls || []).find((x) => x.field === field);
        if (!c || c.type !== 'time') return;
        ensureControlVariant(c, c.type);
        if (this._playT) { clearInterval(this._playT); this._playT = null; return; }
        if (c.variant === 'time_between') {
            c.min = c.dataMin;
            c.max = c.dataMin;
        } else {
            c.max = c.dataMin;
        }
        const steps = 60;
        const inc = (c.dataMax - c.dataMin) / steps;
        this._playT = setInterval(() => {
            if (c.variant === 'time_between') {
                const span = Math.max(inc * 6, (c.dataMax - c.dataMin) * 0.08);
                c.max += inc;
                c.min = Math.max(c.dataMin, c.max - span);
            } else {
                c.max += inc;
            }
            if (c.max >= c.dataMax) { c.max = c.dataMax; clearInterval(this._playT); this._playT = null; }
            applyControls(l);
            majAffichageControle(l, c);
        }, 66);
    },
    storyCapture() {
        if (!assertCanWrite('capturer le récit')) return;
        const trace = traceActuelle();
        const photo = captureStoryState(map, STATE);
        let state = { ...fusionnerApresPhoto(photo, { saisies: saisiesCourantes() }), pastilles: pastillesACapturer() };
        let ecart = 0;
        if (trace) {
            const centre = photo?.camera?.center;
            const place = Array.isArray(centre)
                ? placeDepuisVue(trace.coordinates, centre)
                : { abscisse: 0.5, distanceMetres: 0 };
            ecart = place.distanceMetres || 0;
            state = {
                ...fusionnerApresPhoto(photo, {
                    trace: traceFigee(trace),
                    abscisse: place.abscisse,
                    saisies: saisiesCourantes(),
                }),
                pastilles: pastillesACapturer(),
            };
            STATE.story.forEach((s) => { if (s.state) s.state.trace = traceFigee(trace); });
        }
        const premiere = !!(trace && !STATE.story.length);
        STATE.story.push({ title: 'Étape ' + (STATE.story.length + 1), text: '', state });
        assurerCles(STATE.story);
        if (trace) STATE.story = trierParAbscisse(STATE.story);
        markDirty();
        persistStory(true);
        renderRecit();
        if (!trace) {
            showToast('Étape capturée', 'success');
        } else if (premiere) {
            showToast('Étape posée sur le trajet — la ligne est enregistrée', 'success');
        } else if (ecart >= ECART_VUE_TRAJET_M) {
            showToast(`Étape posée sur le trajet (${Math.round(ecart)} m de la vue)`, 'info');
        } else {
            showToast('Étape posée sur le trajet', 'success');
        }
    },
    /** Une étape par objet qui borde le trajet, dans l'ordre du parcours. */
    etapesLeLong() {
        if (!assertCanWrite('composer le récit')) return;
        const trace = traceActuelle();
        const couche = STATE.layers.find((l) => l.id === $('etapes-couche')?.value);
        const rayon = Math.min(1000, Math.max(5, Number($('etapes-rayon')?.value) || 50));
        if (!trace || !couche) { showToast('Choisissez une couche de points', 'warning'); return; }
        const objets = (couche.geojson?.features || []).map((f, i) => ({
            idx: i, point: featureCentroidLngLat(f), nom: nomObjet(f.properties || {}) || '',
        })).filter((o) => Array.isArray(o.point));
        const liste = objetsLeLong(trace.coordinates, objets, rayon);
        if (!liste.length) { showToast(`Aucun objet de « ${couche.name} » à moins de ${rayon} m du trajet`, 'info'); return; }
        if (liste.length > 60 && !window.confirm(`${liste.length} objets : créer ${liste.length} étapes ?`)) return;
        const photo = captureStoryState(map, STATE);
        const dejaLa = STATE.story.length;
        liste.forEach((o, k) => {
            const state = fusionnerApresPhoto(
                { ...photo, camera: { ...(photo.camera || {}), center: o.point, zoom: Math.max(17, photo.camera?.zoom || 0) } },
                { trace: traceFigee(trace), abscisse: o.abscisse, saisies: saisiesCourantes() },
            );
            STATE.story.push({ title: o.nom || ('Étape ' + (dejaLa + k + 1)), text: '', state });
        });
        assurerCles(STATE.story);
        STATE.story.forEach((s) => { if (s.state) s.state.trace = traceFigee(trace); });
        STATE.story = trierParAbscisse(STATE.story);
        markDirty();
        persistStory(true);
        renderRecit();
        showToast(`${liste.length} étape${liste.length > 1 ? 's' : ''} créée${liste.length > 1 ? 's' : ''} le long du trajet`, 'success');
    },
    storyRecapture(i) {
        if (!assertCanWrite('re-capturer le récit')) return;
        if (STATE.story[i]) {
            const precedent = STATE.story[i].state || {};
            STATE.story[i].state = {
                ...etatApresRecapture(
                    captureStoryState(map, STATE),
                    precedent,
                    saisiesCourantes(),
                ),
                pastilles: pastillesACapturer(),
            };
            markDirty();
            persistStory(true);
            showToast(
                Number.isFinite(precedent.abscisse)
                    ? 'Vue mise à jour — place sur le trajet inchangée'
                    : 'Vue mise à jour',
                'success',
            );
            if (STATE.currentModule === 'recit') renderRecit();
        }
    },
    storySet(i, k, v) {
        if (!assertCanWrite('modifier le récit')) return;
        if (STATE.story[i]) { STATE.story[i][k] = v; markDirty(); persistStory(); }
    },
    storyMove(i, d) {
        if (!assertCanWrite('réordonner le récit')) return;
        const trace = traceActuelle();
        const places = STATE.story.map((s) => s.state?.abscisse);
        const echange = trace && places.every(Number.isFinite) ? indicesEchange(places, i, d) : null;
        if (echange) {
            const [a, b] = echange;
            const tmp = STATE.story[a].state.abscisse;
            STATE.story[a].state.abscisse = STATE.story[b].state.abscisse;
            STATE.story[b].state.abscisse = tmp;
            // Les flèches échangent la place sur la ligne, pas le cadrage.
            STATE.story = trierParAbscisse(STATE.story);
        } else {
            const j = i + d;
            if (j < 0 || j >= STATE.story.length) return;
            [STATE.story[i], STATE.story[j]] = [STATE.story[j], STATE.story[i]];
        }
        markDirty();
        persistStory();
        renderRecit();
    },
    storyDelete(i) {
        if (!assertCanWrite('supprimer une étape')) return;
        STATE.story.splice(i, 1);
        if (!STATE.story.some((s) => s.state?.trace)) STATE.trajet = null;
        markDirty();
        persistStory();
        renderRecit();
    },
    storyPlay(i) { enterStoryPresentation(i); },
    storyGo(i) { allerEtape(i); },
    storyStep(d) { allerEtape(_storyIdx + d); },
    choisirTrajet() { choisirTrajet(false); },
    /** Itinéraire sur un réseau de lignes : départ, points de passage, arrivée. */
    itineraireDemarrer(selectId = 'itineraire-couche', cibleTournee = null) {
        if (!assertCanWrite(cibleTournee ? 'régler une tournée' : 'créer un trajet')) return;
        const couche = STATE.layers.find((l) => l.id === $(selectId)?.value);
        if (!couche) { showToast('Choisissez une couche de lignes', 'warning'); return; }
        if (trajetPickMode) annulerChoixTrajet();
        _cibleTournee = cibleTournee;
        showLoading('Lecture du réseau…');
        // Le réseau se construit hors de l'événement : plusieurs milliers de tronçons prennent un instant.
        setTimeout(() => {
            try {
                const reseau = construireReseau(couche.geojson.features);
                terminerItineraire();
                _itineraire = { layerId: couche.id, reseau, points: [], marqueurs: [], calcul: null };
                if (map) map.getCanvas().style.cursor = 'crosshair';
                showToast('Touchez le départ sur la carte', 'info');
            } catch (e) {
                showToast('Réseau illisible : ' + e.message, 'error');
            } finally {
                hideLoading();
                if (STATE.currentModule === 'recit') renderRecit();
            }
        }, 30);
    },
    itineraireRetirerDernier() {
        const s = _itineraire; if (!s || !s.points.length) return;
        s.points.pop();
        s.marqueurs.pop()?.remove();
        recalculerItineraire();
        if (STATE.currentModule === 'recit') renderRecit();
    },
    itineraireAnnuler() { terminerItineraire(); _cibleTournee = null; if (STATE.currentModule === 'recit') renderRecit(); },
    itineraireTerminer() {
        const s = _itineraire;
        if (!s?.calcul?.ok) return;
        const couche = STATE.layers.find((l) => l.id === s.layerId);
        const copie = s.calcul.coordonnees;
        terminerItineraire();
        if (couche) poserTrajetDepuis({ layer: couche, feature: null, copie });
    },
    remplacerTrajet() { choisirTrajet(true); },
    retirerTrajet() { retirerTrajet(); },
    suivreTrajet() {
        if (!localisationDisponible()) {
            showToast('La localisation n’est pas disponible ici', 'warning');
            return;
        }
        _trajetSuivi = true;
        _trajetPause = false;
        if (!_suiviPosition && _geoloc?.trigger) _geoloc.trigger();
        renderStoryPresentation();
    },
    revenirTrajet() {
        if (!localisationDisponible()) return;
        _trajetSuivi = true;
        _trajetPause = false;
        if (!_suiviPosition && _geoloc?.trigger) _geoloc.trigger();
        renderStoryPresentation();
    },
    ouvrirObjetEtape(coucheId, idx) {
        if (!_storyPresenting) return;
        ouvrirObjet(STATE.layers.find((l) => l.id === coucheId), idx);
    },
    contexteAppliquer(cle) { appliquerContexte(cle); },
    ouvertureRegler(mode, cle) { reglerOuverture(mode, cle || null); renderRecit(); },
    contexteQuitter() { quitterContexte(); },
    synchroEnvoyer() { clientHorsLigne()?.envoyer(); },
    /** Envoyer la scène faite sur l'appareil dans un document Grist neuf (écran de l'accueil, `ouvrirEnvoi`). */
    async envoyerSceneLocale() {
        fermerPanneauSynchro();
        try { (await import('./lib/hote-ui.js?v=20261002g')).ouvrirEnvoi(); } catch (e) { showToast('Envoi impossible : ' + e.message, 'error'); }
    },
    async synchroReessayer(id) { await clientHorsLigne()?.reessayer(id); },
    async synchroAbandonner(id) {
        if (!window.confirm('Abandonner ce relevé ? Il ne sera pas envoyé et disparaîtra de la liste.')) return;
        await clientHorsLigne()?.abandonner(id);
    },
    /** L'auteur propose (ou non) cette étape comme contexte en exploitation. */
    tourneeChoisir(i) {
        if (!assertCanWrite('régler une tournée')) return;
        const e = STATE.story[i];
        if (!e || !usageDe(e.state).contexte) return;
        _tourneeVue = e.cle;
        if (trajetPickMode) annulerChoixTrajet();
        choisirTrajet(false, e.cle);
        rafraichirTrajet();
    },
    tourneeVoir(i) {
        const e = STATE.story[i];
        const trace = e && tourneeDe(e.state);
        if (!trace) return;
        _tourneeVue = e.cle;
        rafraichirTrajet();
        fitToFeatures([{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trace.coordinates } }]);
    },
    tourneeRetirer(i) {
        if (!assertCanWrite('retirer une tournée')) return;
        const e = STATE.story[i];
        if (!e || !tourneeDe(e.state)) return;
        e.state = avecUsage(e.state, { tournee: null });
        markDirty();
        persistStory(true);
        rafraichirTrajet();
        renderRecit();
        showToast('Tournée retirée', 'info');
    },
    /** Un ouvrage de la liste de la tournée : la carte s'y rend et sa fiche s'ouvre, comme depuis « Choisir un objet ». */
    tourneeOuvrir(coucheId, idx) {
        $('map-controls-dock')?.classList.add('collapsed');
        allerAObjet(coucheId, idx);
    },
    storyContexte(i, oui) {
        if (!assertCanWrite('proposer un contexte')) return;
        const etape = STATE.story[i];
        if (!etape) return;
        etape.state = avecUsage(etape.state, { contexte: !!oui });
        markDirty();
        persistStory();
    },
    storyReleve(i, cle, oui) {
        if (!assertCanWrite('régler les relevés d’un contexte')) return;
        const etape = STATE.story[i];
        if (!etape || !usageDe(etape.state).contexte) return;
        const toutes = couchesQuiOffrentUnReleve().map(cleReleve);
        etape.state = avecUsage(etape.state, { releves: basculerReleve(relevesDe(etape.state), toutes, cle, !!oui) });
        markDirty();
        persistStory();
        // Le contexte joué en ce moment peut être celui qu'on règle : la pastille suit.
        if (_contexteCle && etape.cle === _contexteCle) refreshControlsDock();
    },
    storyExit() {
        annulerAnimTrajet();
        arreterSuiviTrajet();
        _alerteReleve = false;
        _alerteTexte = '';
        _storyPresenting = false;
        _contexteCle = null;
        rafraichirTrajet();
        document.body.classList.remove('story-presenting');
        const ov = document.getElementById('story-present');
        if (ov) ov.remove();
        mesurerEtageRecit();
        libererMargeRecit();
        // Rend la scène telle qu'elle était avant la présentation : visibilité,
        // filtres, symbolisation et ambiance. Sans cela on sort du récit sur
        // l'état de la dernière étape.
        const basemapSwitching = restorePreStorySnapshot();
        if (!basemapSwitching) {
            remountAllLayers();
            updateLegend();
        }
        refreshControlsDock();
        if (STATE.currentModule === 'couches' || STATE.currentModule === 'symbo') {
            renderLayersPanel(STATE.currentModule);
        }
        rafraichirTrajet();
    },
    /**
     * Déplace une couche d'un cran dans la pile.
     * `direction` est visuelle : 'up' = passer au-dessus.
     */
    moveLayerRank(id, direction, e) {
        e?.stopPropagation?.();
        if (CONFIG.viewMode) {
            showToast('Mode lecture — ordre figé par l’éditeur', 'warning');
            return;
        }
        const avant = STATE.layers.map((l) => l.id).join('|');
        STATE.layers = moveLayerInStack(STATE.layers, id, direction);
        if (STATE.layers.map((l) => l.id).join('|') === avant) return; // borne
        applyLayerOrder();
        updateLegend();
        refreshLayersPanelIfOpen();
        // Enregistrer TOUS les rangs, pas seulement les deux couches échangées :
        // un rang partiel se relit mal, les couches sans rang étant reléguées
        // après celles qui en ont — donc au-dessus, ce qui inverserait la scène.
        STATE.layers.forEach((l, k) => {
            l._rank = k;
            saveLayerPrefIfSynced(l);
        });
    },

    toggleLayer(id, e) {
        if (CONFIG.viewMode) {
            e?.stopPropagation?.();
            showToast('Mode lecture — visibilité figée par l’éditeur', 'warning');
            return;
        }
        e.stopPropagation();
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        l.visible = l.visible === false ? true : false;
        if (l.visible && l._deferredLoad) {
            showToast('Chargement bâtiments…', 'warning');
            materializeDeferredLayer(l, DEFERRED_OPTS);
            if (map?.getSource(l.id)) syncLayerSourceData(l);
            else if (typeof addLayerToMap === 'function') addLayerToMap(l);
        }
        syncLayerToMapState(l);
        updateLegend();
        // Toute couche que les préférences savent ranger, pas seulement celles de
        // qgis2grist : une table affichée puis masquée doit le rester au
        // rechargement. Le refus est dit en console, plus avalé.
        saveLayerPrefIfSynced(l);
        renderLayersPanel(STATE.currentModule);
    },
    toggleAllLayers(v) {
        if (CONFIG.viewMode) {
            showToast('Mode lecture — visibilité figée par l’éditeur', 'warning');
            return;
        }
        STATE.layers.forEach((l) => {
            l.visible = v;
            if (v && l._deferredLoad) materializeDeferredLayer(l, DEFERRED_OPTS);
        });
        syncAllLayersToMap();
        updateLegend();
        STATE.layers.forEach((l) => saveLayerPrefIfSynced(l));
        renderLayersPanel(STATE.currentModule);
    },
    zoomLayer(id, e) {
        if (e) e.stopPropagation();
        const l = STATE.layers.find((x) => x.id === id);
        // « Couche vide » était dit d'une couche distante, qui ne l'est pas :
        // ses entités sont ailleurs, pas absentes. Le message envoyait chercher
        // une donnée manquante au lieu d'une emprise non déclarée. On ne décide
        // qu'après avoir essayé — `fitToLayer` sait aussi cadrer sur la `bbox`
        // du manifeste.
        if (!l) return;
        if (!l.geojson?.features?.length && !l._distant) {
            showToast('Couche vide', 'warning');
            return;
        }
        if (l.visible === false) {
            l.visible = true;
            syncLayerToMapState(l);
        }
        // Annoncer un zoom qui n'a pas eu lieu serait pire que se taire : on
        // chercherait ce qui empêche de voir la couche là où elle n'est pas.
        if (fitToLayer(l)) {
            showToast(`Zoom sur « ${l.name} »`, 'info');
        } else {
            showToast(`« ${l.name} » : pas d'emprise connue — le manifeste ne déclare pas de bbox`,
                'warning');
        }
    },
    /** Les actions rares d'une couche : rafraîchir depuis sa table, supprimer. */
    menuCouche(id, e) {
        e?.stopPropagation();
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        const ancre = e?.currentTarget;
        ouvrirMenuCouche(l, ancre);
    },
    deleteLayer(id, e) {
        e.stopPropagation();
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        if (!assertCanWrite('supprimer une couche')) return;
        if (!confirm(`Supprimer la couche « ${l.name} » ?`)) return;
        removeLayerGfx(l);
        // Le refus se dit : sinon la couche revient au rechargement sans que
        // personne sache pourquoi.
        if (CONFIG.grist.ready && l.gristId) {
            grist.docApi.applyUserActions([['RemoveRecord', 'Maquette_Layers', l.gristId]])
                .catch((err) => showToast('Suppression non enregistrée dans Grist : ' + (err?.message || err), 'error'));
        }
        _historique.oublier(cleHistorique(l));
        STATE.layers = STATE.layers.filter((x) => x.id !== id);
        if (STATE.selectedLayer === id) STATE.selectedLayer = null;
        updateRailBadge(); Models3D.rebuildScene(); renderLayersPanel(STATE.currentModule); renderInspector(); updateLegend();
        showToast('Couche supprimée', 'success');
    },
    async saveLayer(id) {
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        clearTimeout(_enregTimer);
        const base = l._apparence;
        const ok = await saveLayerToGrist(l, false);
        if (ok && clePrefsCouche(l)) {
            const snap = capturerApparence(l);
            if (base) _historique.enregistrer(cleHistorique(l), base, snap);
            l._apparence = snap;
        }
        if (ok) { _enregDernier = Date.now(); marquerEnregistre(); }
    },

    // Modèles
    setModelCat(id, cat) { const l = STATE.layers.find((x) => x.id === id); if (l) { l._modelCat = cat; renderInspector(); } },
    // Représentation de la couche : 'mapbox' (cercle 2D) ou 'library' (modèle 3D)
    setRepresentation(id, mode) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        l.style.mode = mode;
        if (mode === 'library' && !l.style.library?.modelId) {
            // Une couche peut porter une categorie que la bibliotheque ne connait
            // pas — `scene-loader` pose « landmark » pour une couche a modele
            // venue d'un manifeste. Sans ce repli, `.models[0]` leve sur undefined
            // et l'interface tombe au clic. La meme garde existe deja cote
            // inspecteur (`symModelPanel`) : elle manquait ici seulement.
            const catRaw = l._modelCat || 'lighting';
            const cat = MODEL_LIBRARY.categories[catRaw] ? catRaw : 'lighting';
            if (cat !== catRaw) l._modelCat = cat;
            const first = MODEL_LIBRARY.categories[cat].models[0];
            l.style.library = { modelId: first.id };
            l.style.common = { ...(l.style.common || {}), scale: first.scale || 1 };
        }
        applyPointStyle(l); Models3D.forceBuild(); renderInspector(); markDirty();
    },
    openLayerModel(id) { STATE.selectedLayer = id; inspSymTab = 'Forme'; blocsFormeOuverts.add('Modèle 3D'); openModule('couches'); },
    setBlocForme(nom, ouvert) { if (ouvert) blocsFormeOuverts.add(nom); else blocsFormeOuverts.delete(nom); },
    /**
     * Cree la table de donnees d'une couche importee, et l'y relie.
     *
     * Repli assume : en cas d'echec, la couche reste ce qu'elle etait — un blob
     * dans `Maquette_Layers`. On ne perd donc jamais les entites, meme si
     * l'ecriture s'arrete en cours de lots.
     */
    async enregistrerDansGrist(id) {
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        if (!assertCanWrite('enregistrer la couche')) return;
        const n = l.geojson?.features?.length || 0;
        if (!n) { showToast('Couche vide', 'warning'); return; }
        showLoading(`Enregistrement dans Grist… ${n} objets`);
        try {
            const ecrits = await entableLayer(l);
            hideLoading();
            showToast(`${ecrits} objets enregistrés · ${l.sourceTable}`, 'success');
            await chargerFormulaires();
            if (STATE.currentModule === 'couches') renderLayersPanel(STATE.currentModule);
            // Le bouton est dans le panneau de droite ; le module Formulaires
            // peut être ouvert à gauche au même moment. Il affichait encore
            // « Aucune table à saisir » alors que la table et sa fiche
            // « Attributs » venaient d'exister.
            else if (STATE.currentModule === 'formulaires') renderFormulaires();
            renderInspector();
        } catch (e) {
            hideLoading();
            console.warn('[Atlas entable]', e);
            showToast('Enregistrement impossible : ' + e.message + ' — la couche reste locale', 'error');
        }
    },

    editLayerObjects(id) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const n = l.geojson?.features?.length || 0;
        if (!n) { showToast('Aucun objet dans cette couche', 'warning'); return; }
        // Ce bouton n'ouvrait que le mode selection, VIDE, avec un toast disant
        // d'aller cliquer la carte. Il ne dispensait donc pas du clic — le
        // defaut meme qu'il est cense corriger. Il selectionne maintenant toute
        // la couche et se pose sur le premier objet : la barre « ◀ 1 / N ▶ »
        // devient une revue, et la fiche s'ouvre sans toucher la carte.
        enterSelectionMode(id);
        STATE.selection.features = l.geojson.features.map((_, i) => i);
        STATE.selection.multiIndex = 0;
        STATE.selection.revue = true;
        afterSelectionChange();
        flyToFeature(l, 0);
        showToast(`${n} objet${n > 1 ? 's' : ''} · ◀ ▶ pour parcourir`, 'info');
    },
    setModelSet(set) {
        MODEL_LIBRARY.set = set; STATE.settings.modelSet = set;
        Models3D.gltfCache.clear(); Models3D.protoCache.clear(); // recharger les GLB du nouveau set
        Models3D.forceBuild(); renderModelsPanel(); markDirty();
    },
    setModelBase(url) {
        url = (url || '').trim().replace(/\/+$/, '') + '/';
        MODEL_LIBRARY.baseRoot = url; MODEL_BASE_EXPLICIT = true;
        try { localStorage.setItem('atlas_model_base', url); } catch (e) {}
        Models3D.gltfCache.clear(); Models3D.protoCache.clear(); Models3D.forceBuild();
        renderModelsPanel(); showToast('Source modèles définie', 'success');
    },
    async setCatalogueObjets(url) {
        const u = String(url || '').trim();
        try { if (u) localStorage.setItem('atlas_catalogue_objets', u); else localStorage.removeItem('atlas_catalogue_objets'); } catch (e) {}
        // Une adresse vide ramène au catalogue livré avec Atlas.
        const choix = choisirCatalogue({ memorise: u });
        CATALOGUE_OBJETS.origine = choix.origine;
        await chargerCatalogueObjets(choix.url);
        // Le module Modeles n'est redessine que s'il est ouvert : il ecrit dans
        // le corps de module commun, qu'un autre module occupe peut-etre.
        if (document.getElementById('catalogue-objets-input')) renderModelsPanel();
        renderInspector();
        if (CATALOGUE_OBJETS.etat === 'pret') showToast(CATALOGUE_OBJETS.origine === 'integre' ? 'Catalogue d’Atlas rétabli' : 'Catalogue d\'objets pointé', 'success');
        else if (CATALOGUE_OBJETS.etat === 'erreur') showToast('Catalogue illisible : ' + CATALOGUE_OBJETS.erreur, 'error');
    },
    async testModelBase() {
        const base = ((document.getElementById('model-src-input')?.value || MODEL_LIBRARY.baseRoot).trim().replace(/\/+$/, '')) + '/';
        const el = document.getElementById('model-src-info');
        if (el) { el.textContent = '… test ' + base; el.style.color = 'var(--muted)'; }
        try {
            const r = await fetch(base + 'catalog.json', { cache: 'no-store' });
            if (r.ok) { const c = await r.json(); if (el) { el.textContent = `✅ OK — ${c.models?.length || 0} modèles · ${base}`; el.style.color = 'var(--green)'; } }
            else if (el) { el.textContent = `❌ HTTP ${r.status} · ${base}`; el.style.color = 'var(--accent)'; }
        } catch (e) { if (el) { el.textContent = `❌ ${e.message} · ${base}`; el.style.color = 'var(--accent)'; } }
    },
    pickModel(id, modelId, repliCatalogue = false) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        if (!findModel(modelId)) { showToast('Modèle inconnu : ' + modelId, 'error'); return; }
        l.style.mode = 'library'; l.style.library = { modelId };
        // Sous l'affectation « Catalogue », on ne change que le repli : le reste
        // (affectation, reglages de couche) est garde.
        if (repliCatalogue) {
            Models3D.forceBuild(); renderInspector(); markDirty();
            return;
        }
        // remplace réellement : repasse en modèle unique et purge le mode catégorisé
        // + les overrides _modelId par objet (sinon d'anciens modèles « restent »)
        const sym = initSymbolization(l);
        sym.model.mode = 'single'; sym.model.field = null; sym.model.categories = []; sym.model.defaultModelId = null;
        (l.geojson?.features || []).forEach((f) => { if (f.properties) delete f.properties._modelId; });
        const m = findModel(modelId);
        l.style.common = { ...(l.style.common || {}), scale: m?.scale || 1, rotationX: 0, rotationY: 0, rotationZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0 };
        applyLayerStyle(l); Models3D.forceBuild(); renderInspector(); markDirty();
        showToast(`Modèle « ${m?.name} » appliqué`, 'success');
    },

    // Soleil
    /** Fixe l'heure de la scène sur un moment (aube, jour, soir, nuit) sans changer de panneau. */
    poserMoment(p) {
        const c = map.getCenter();
        let min = 720;
        if (typeof SunCalc !== 'undefined') {
            try {
                const t = SunCalc.getTimes(new Date(instantScene({ ...STATE.settings, timeOfDay: 720 })), c.lat, c.lng);
                // Heures du site (fuseau de la scène), pas du navigateur.
                const mm = (d) => d && !isNaN(d.getTime()) ? heureLocale(d.getTime(), fuseauScene(STATE.settings)).minutes : 720;
                if (p === 'dawn') min = mm(t.sunrise);
                else if (p === 'day') min = mm(t.solarNoon);
                else if (p === 'dusk') min = mm(t.sunset);
                else min = (mm(t.sunset) + 90) % 1440;
            } catch (e) {}
        } else min = { dawn: 390, day: 750, dusk: 1110, night: 1380 }[p];
        STATE.settings.timeOfDay = min; updateLighting();
    },
    timePreset(p) { A.poserMoment(p); renderSoleil(); },
    voirMoment(p) { A.poserMoment(p); },

    // ---- Spécifications des objets du catalogue (couche, puis objet)
    /** Ce que change un réglage : les calculs, la lumière, les modèles, la légende. */
    appliquerSpecs(layer) {
        layer._eclairage = null;
        Eclairage.signature = null;
        Models3D.forceBuild();
        updateLegend();
        markDirty();
    },
    setSpecPortee(id, scope) { _specsPortee = { layerId: id, scope }; renderInspector(); },
    setSpecValeur(id, scope, paramId, valeur) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const type = scope === '*' ? typesAvecSchema(l)[0] : typeCatalogueDe(scope);
        const d = descripteursDuType(type).find((x) => x.id === paramId);
        if (!d) return;
        let v = valeur;
        if (!(v === '' || v == null)) {
            const r = validerSaisie(d, v);
            if (!r.ok) { showToast(`${d.libelle} : ${r.erreur}`, 'error'); renderInspector(); return; }
            v = r.valeur;
            if (r.ecartBande) showToast(`${d.libelle} : ${r.ecartBande}`, 'warning');
        }
        l.parametres = avecReglageDeCouche(l.parametres, scope, paramId, v === '' ? null : v) || undefined;
        A.appliquerSpecs(l);
        renderInspector();
    },
    setSpecLiaison(id, paramId, champ) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        l.parametres = avecLiaison(l.parametres, paramId, champ) || undefined;
        A.appliquerSpecs(l);
        renderInspector();
    },
    resetSpecs(id, scope) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const base = parametresDeCoucheValides(l.parametres);
        if (!base) return;
        delete base.valeurs[scope];
        l.parametres = parametresDeCoucheValides(base) || undefined;
        A.appliquerSpecs(l);
        renderInspector();
        showToast('Réglages effacés', 'success');
    },
    figerOuvrir(id) {
        const l = STATE.layers.find((x) => x.id === id);
        if (!l || !figerPossible(l)) return;
        const { candidats } = planFigerDeCouche(l, null);
        _figer = { layerId: id, choix: new Set(candidats.filter((c) => FIGES_PAR_DEFAUT.includes(c.id)).map((c) => c.id)) };
        renderInspector();
    },
    figerBasculer(paramId) {
        if (!_figer) return;
        if (_figer.choix.has(paramId)) _figer.choix.delete(paramId); else _figer.choix.add(paramId);
        renderInspector();
    },
    figerAnnuler() { _figer = null; renderInspector(); },
    async figerEcrire(id) {
        const l = STATE.layers.find((x) => x.id === id);
        if (!l || !_figer || !figerPossible(l)) return;
        if (!assertCanWrite('figer les valeurs')) return;
        const plan = planFigerDeCouche(l, _figer.choix);
        if (!plan.actions.length) return;
        try {
            await grist.docApi.applyUserActions(plan.actions);
        } catch (e) {
            enterViewModeOnWriteFail(e);
            showToast('Grist : ' + (e?.message || e), 'error');
            return;
        }
        // La mémoire suit la table : les colonnes créées, puis les cellules écrites. Ces valeurs sont
        // maintenant des champs de l'objet : leur origine devient « champ ».
        const parLigne = new Map((l.geojson?.features || []).map((f) => [f.properties?._row_id, f]));
        const schema = (STATE.schema = STATE.schema || {});
        const colonnes = (schema[l.sourceTable] = schema[l.sourceTable] || []);
        l._gristColumns = l._gristColumns || [];
        for (const a of plan.actions) {
            if (a[0] === 'AddColumn') {
                colonnes.push({ colId: a[2], type: a[3].type });
                if (!l._gristColumns.includes(a[2])) l._gristColumns.push(a[2]);
            } else if (a[0] === 'BulkUpdateRecord') {
                const col = Object.keys(a[3])[0];
                a[2].forEach((rowId, i) => { const f = parLigne.get(rowId); if (f) f.properties[col] = a[3][col][i]; });
            }
        }
        _figer = null;
        A.appliquerSpecs(l);
        renderInspector();
        showToast(`${plan.cellules} cellule${plan.cellules > 1 ? 's' : ''} écrite${plan.cellules > 1 ? 's' : ''} dans ${l.sourceTable}`, 'success');
    },
    setObjetParam(paramId, valeur) {
        const layer = STATE.layers.find((l) => l.id === STATE.selection.layerId); if (!layer) return;
        // L'objet courant : le seul de la sélection, ou celui que désigne le curseur de la revue.
        const sel = STATE.selection.features;
        const f = layer.geojson?.features?.[sel[sel.length > 1 ? (STATE.selection.multiIndex || 0) : 0]]; if (!f) return;
        const d = descripteursDuType(typeCatalogueDe(typeIdDeEntite(layer, f))).find((x) => x.id === paramId);
        if (!d) return;
        verifierPersistance3d(layer);
        const propres = { ...(f.properties._params || {}) };
        if (valeur === '' || valeur == null) delete propres[paramId];
        else {
            const r = validerSaisie(d, valeur);
            if (!r.ok) { showToast(`${d.libelle} : ${r.erreur}`, 'error'); renderObjectInspector(); return; }
            propres[paramId] = r.valeur;
            if (r.ecartBande) showToast(`${d.libelle} : ${r.ecartBande}`, 'warning');
        }
        const valides = parametresDObjetValides(propres);
        if (valides) f.properties._params = valides; else delete f.properties._params;
        A.appliquerSpecs(layer);
        renderObjectInspector();
    },
    resetObjetParam(paramId) { A.setObjetParam(paramId, ''); },
    setTime(v) { STATE.settings.timeOfDay = +v; updateLighting(); const h = Math.floor(v / 60), m = v % 60; const el = document.querySelector('#module-body .val'); if (el && STATE.currentModule === 'soleil') el.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; persistScenePrefsDifferee(); },
    setSunDate(v) {
        STATE.settings.date = new Date(v + 'T12:00:00');
        // Épinglée, la date suit le sélecteur : c'est ce jour-là qu'on veut retrouver.
        if (STATE.settings.dateEpinglee && dateValide(v)) { STATE.settings.dateEpinglee = v; persistScenePrefsDifferee(); }
        updateLighting(); renderSoleil();
    },
    toggleDateEpinglee() {
        STATE.settings.dateEpinglee = STATE.settings.dateEpinglee ? null : dateLocaleScene(STATE.settings);
        persistScenePrefsDifferee();
        renderSoleil();
    },
    toggleSetting(key) {
        STATE.settings[key] = !STATE.settings[key];
        if (key === 'buildings3D') applyBuildingVisibility();
        else if (key === 'terrain3D') { applyTerrain(); _palierDemCale = null; recalerRelief(); }
        else if (key === 'labels') applyLabelsVisibility();
        else if (key === 'sky') applySky();
        else if (key === 'shadows') {
            updateLighting();
            Models3D.scheduleBuild();
            $('shadow-toggle')?.classList.toggle('on', STATE.settings.shadows);
        }
        if (STATE.currentModule === 'vues') renderVues(); else if (STATE.currentModule === 'soleil') renderSoleil();
        persistScenePrefsDifferee();
    },

    // Vue
    viewPreset(p) {
        const presets = { top: { pitch: 0, bearing: 0, zoom: 17 }, '3d': { pitch: 55, bearing: -18, zoom: 16 }, street: { pitch: 78, bearing: 0, zoom: 18 } };
        map.easeTo({ ...presets[p], duration: 1000 });
    },
    setPitch(v) { map.setPitch(+v); $('v-pitch').textContent = Math.round(v) + '°'; },
    setBearing(v) { map.setBearing(+v); $('v-bearing').textContent = Math.round(v) + '°'; },
    setExag(v) { STATE.settings.terrainExaggeration = +v; $('v-exag').textContent = v + '×'; if (STATE.settings.terrain3D) { applyTerrain(); recalerRelief(200); } persistScenePrefsDifferee(); },
    setBasemap(k) {
        if (CONFIG.viewMode) {
            const allowed = basemapChoicesForDock();
            if (!allowed.includes(k)) {
                showToast('Fond non autorisé en lecture', 'warning');
                return;
            }
        }
        STATE.settings.basemap = k; renderVues();
        const b = BASEMAPS[k];
        _styleUsable = false; // le style est remplacé : plus rien à monter d'ici là
        map.stop();
        const feuilleAvant = map.style?.stylesheet;
        map.setStyle(b.style ? b.style() : b.url);
        // Au premier `idle` du NOUVEAU style (lib/basemap-layers.js) : un
        // `idle` émis pendant la requête du style (une image rendue entre-temps)
        // reposait les calques sur l'ancien, et le nouveau les effaçait ou
        // empilait ses couches par-dessus.
        quandNouveauStyle(map, feuilleAvant, onStyleReady);
        refreshControlsDock();
        // Le fond est le réglage qu'on remarque le plus en revenant sur un
        // document : le retrouver au défaut donne l'impression que rien n'a
        // été gardé, même quand tout le reste l'a été.
        persistScenePrefsDifferee(200);
    },
    setView3d(on) {
        if (!map) return;
        map.easeTo({ pitch: on ? 55 : 0, duration: 600 });
    },
    /**
     * La source du relief est un réglage comme un autre : elle s'enregistre.
     *
     * Elle ne le faisait pas — seule action de ce panneau à ne pas appeler
     * `persistScenePrefs`. On choisissait le MNT LiDAR HD, on rechargeait, et
     * le relief mondial revenait sans un mot. `terrainSource` était pourtant
     * déjà dans les clés retenues par `lib/scene-prefs.js` : le contrat était
     * écrit, l'appel manquait.
     */
    setTerrainSource(src) { setTerrainSource(src); renderVues(); persistScenePrefsDifferee(200); },
    setProjection(p) { STATE.settings.projection = p; applyProjection(); renderVues(); },
    resetView() { map.easeTo({ center: [STATE.location.lng, STATE.location.lat], zoom: 16, pitch: 55, bearing: -18, duration: 1000 }); },
    debugShowExtrusionCasters(on = true) {
        for (const mesh of Models3D.extrusionShadows || []) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((m) => {
                if (!m) return;
                m.colorWrite = !!on;
                if (on) {
                    m.color?.set?.(0xff00ff);
                    m.emissive?.set?.(0xaa00aa);
                    m.opacity = 0.4;
                    m.transparent = true;
                    m.depthTest = false;
                } else {
                    m.color?.set?.(0x111111);
                    m.emissive?.set?.(0x000000);
                    m.opacity = 1;
                    m.transparent = false;
                    m.depthTest = true;
                }
                m.needsUpdate = true;
            });
            mesh.visible = true;
            mesh.frustumCulled = false;
        }
        map?.triggerRepaint?.();
        return { n: Models3D.extrusionShadows?.length || 0, isIM: !!Models3D.extrusionShadows?.[0]?.isInstancedMesh };
    },

    /**
     * Protocole navigateur : isole le bâti (sans GLB), ombres on/off.
     * Usage : await A.validateBatiShadows()
     */
    async validateBatiShadows() {
        if (!map || !Models3D.scene) return { ok: false, err: 'map/scene absents' };
        const bati = STATE.layers.find((l) => /bati/i.test(l.id) || /bati/i.test(l.name));
        if (!bati) return { ok: false, err: 'pas de couche bâti' };

        // Figé lecture : on force quand même pour le test runtime
        bati.visible = true;
        bati.style = bati.style || {};
        bati.style.polygonMode = 'extruded';
        STATE.settings.shadows = true;
        STATE.settings.terrain3D = false;

        // Masquer tous les GLB (instances three.js)
        for (const [, g] of Models3D.groups || []) {
            (g.meshes || []).forEach(({ im }) => { if (im) im.visible = false; });
            (g.roots || []).forEach((r) => { if (r) r.visible = false; });
        }
        // Masquer les autres couches MapLibre sauf bâti (visibilité source)
        for (const l of STATE.layers) {
            if (l === bati) continue;
            try { applyMapLayerVisibility(l, false); } catch (_) {}
        }
        try { applyMapLayerVisibility(bati, true); applyLayerStyle(bati); } catch (_) {}

        // Vue rue dense près Charité, sans plonger dans le GLB
        map.jumpTo({
            center: [5.3682, 43.3008],
            zoom: 17.4,
            pitch: 58,
            bearing: -35,
        });
        await new Promise((r) => setTimeout(r, 200));
        Models3D.forceBuild();
        await new Promise((r) => setTimeout(r, 1200));
        // GLB peut revenir au rebuild — re-masquer
        for (const [, g] of Models3D.groups || []) {
            (g.meshes || []).forEach(({ im }) => { if (im) im.visible = false; });
            (g.roots || []).forEach((r) => { if (r) r.visible = false; });
        }
        map.triggerRepaint();
        await new Promise((r) => setTimeout(r, 400));

        const withShadows = Models3D.extrusionShadows?.length || 0;
        const candidates = Models3D.collectExtrusionsForShadow?.()?.length || 0;

        // Phase A : ombres ON, casters invisibles
        this.debugShowExtrusionCasters(false);
        STATE.settings.shadows = true;
        if (Models3D.renderer) Models3D.renderer.shadowMap.enabled = true;
        map.triggerRepaint();
        await new Promise((r) => setTimeout(r, 500));

        // Phase B data (l’appelant fait les screenshots entre les appels)
        return {
            ok: true,
            phase: 'shadows-on',
            withShadows,
            candidates,
            gltfHidden: [...(Models3D.groups?.values?.() || [])].every((g) =>
                (g.meshes || []).every(({ im }) => im && im.visible === false)),
            shadows: STATE.settings.shadows,
            zoom: map.getZoom(),
            center: map.getCenter()?.toArray?.(),
        };
    },

    async validateBatiShadowsOff() {
        STATE.settings.shadows = false;
        if (Models3D.renderer) Models3D.renderer.shadowMap.enabled = false;
        if (Models3D.groundShadow) Models3D.groundShadow.visible = false;
        map?.triggerRepaint?.();
        await new Promise((r) => setTimeout(r, 500));
        return { phase: 'shadows-off', shadows: false };
    },

    async validateBatiShadowsCastersVisible() {
        STATE.settings.shadows = true;
        if (Models3D.renderer) Models3D.renderer.shadowMap.enabled = true;
        if (Models3D.groundShadow) Models3D.groundShadow.visible = true;
        const r = this.debugShowExtrusionCasters(true);
        await new Promise((r2) => setTimeout(r2, 400));
        return { phase: 'casters-visible', ...r };
    },
    debugModels3D() {
        const extrusions = Models3D.collectExtrusionsForShadow?.() || [];
        const bati = STATE.layers.find((l) => /bati/i.test(l.id) || /bati/i.test(l.name));
        let queryN = null, queryErr = null, geoType = bati ? typeof bati.geojson : null;
        let queryNear80 = 0, querySample = [];
        if (bati && map) {
            try {
                const feats = map.querySourceFeatures(bati.id) || [];
                queryN = feats.length;
                for (const f of feats) {
                    const c = featureCentroidLngLat(f);
                    if (!c) continue;
                    const lm = Models3D.localMeters(c[0], c[1]);
                    const d = Math.hypot(lm.x, lm.y);
                    if (d < 80) queryNear80++;
                    if (querySample.length < 5) {
                        querySample.push({
                            d: Math.round(d),
                            h: featureExtrusionHeightM(f, bati),
                            t: f.geometry?.type,
                        });
                    }
                }
                // also sample by sorting all
                const scored = [];
                for (const f of feats) {
                    const c = featureCentroidLngLat(f);
                    if (!c) continue;
                    const lm = Models3D.localMeters(c[0], c[1]);
                    scored.push(Math.hypot(lm.x, lm.y));
                }
                scored.sort((a, b) => a - b);
                querySample = { nearest5: scored.slice(0, 5).map((d) => Math.round(d)), near80: queryNear80, n: queryN };
            } catch (e) { queryErr = e.message; }
        }
        return {
            shadowFeasible: Models3D._shadowFeasible,
            extrusionMeshes: Models3D.extrusionShadows?.length || 0,
            extrusionInstances: Models3D.extrusionShadows?.reduce((n, m) => n + (m.count || 0), 0) || 0,
            firstMatrix: (() => {
                const im = Models3D.extrusionShadows?.[0];
                if (!im?.instanceMatrix) return null;
                const m = new THREE.Matrix4();
                im.getMatrixAt(0, m);
                return Array.from(m.elements);
            })(),
            matColorWrite: Models3D.extrusionShadows?.[0]?.material?.colorWrite,
            matEmissive: Models3D.extrusionShadows?.[0]?.material?.emissive?.getHexString?.(),
            extrusionCandidates: extrusions.length,
            near80: extrusions.filter((e) => {
                const lm = Models3D.localMeters(e.lng, e.lat);
                return Math.hypot(lm.x, lm.y) < 80;
            }).length,
            nearestM: extrusions[0] ? Math.hypot(
                Models3D.localMeters(extrusions[0].lng, extrusions[0].lat).x,
                Models3D.localMeters(extrusions[0].lng, extrusions[0].lat).y,
            ) : null,
            querySample,
            shadows: STATE.settings.shadows,
            terrain3D: STATE.settings.terrain3D,
            zoom: map?.getZoom?.(),
            bati: bati ? {
                id: bati.id,
                geoType,
                poly: bati.style?.polygonMode,
                geomType: bati.geometryType,
                queryErr,
                hasSource: !!map?.getSource?.(bati.id),
            } : null,
        };
    },

    // Symbology
    setSymTab(t) { inspSymTab = t; renderInspector(); },
    activerBulle(id) {
        const l = STATE.layers.find((x) => x.id === id); if (!l?.sourceTable) return;
        const sym = initSymbolization(l);
        const c = sym.color;
        const pastilles = c.mode === 'categorized' && c.field ? [c.field] : [];
        const lien0 = tablesReferencant(STATE.schema, l.sourceTable)[0] || null;
        const lien = lien0 ? { ...lien0, date: colonneDate(STATE.schema?.[lien0.table]) } : null;
        sym.bulle = bulleParDefaut(STATE.schema?.[l.sourceTable] || [], { pastilles, lien });
        renderInspector(); markDirty();
    },
    desactiverBulle(id) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l);
        if (sym.bulle) sym.bulle.actif = false;
        closeViewPopup(); renderInspector(); markDirty();
    },
    reglerBulle(id, cle, valeur, coche) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const b = initSymbolization(l).bulle; if (!b) return;
        if (cle === 'titre') b.titre = valeur || null;
        else if (cle === 'lien') {
            const t = tablesReferencant(STATE.schema, l.sourceTable).find((x) => x.table === valeur);
            b.lien = t ? { ...t, date: colonneDate(STATE.schema?.[t.table]) } : null;
            if (!b.lien && b.actions) b.actions.visite = false;
        } else if (cle === 'action') {
            b.actions = { ...(b.actions || {}), [valeur]: !!coche };
        } else if (['photos', 'pastilles', 'champs'].includes(cle)) {
            const liste = new Set(b[cle] || []);
            if (coche) liste.add(valeur); else liste.delete(valeur);
            b[cle] = [...liste];
        }
        renderInspector(); markDirty();
        if (_viewPopup) A.apercuBulle(id);
    },
    apercuBulle(id) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        // L'objet sélectionné s'il y en a un, sinon le premier de la couche.
        const idx = (STATE.selection.layerId === id && STATE.selection.features?.[0] != null) ? STATE.selection.features[0] : 0;
        const f = l.geojson?.features?.[idx];
        if (f) ouvrirBulle(l, idx, f, null);
    },
    /**
     * Couleurs et ordre de gravité depuis la table de référence du champ.
     * `relire` : la table a pu changer dans Grist — on la relit d'abord.
     */
    async appliquerReferenceCouleur(id, relire = false) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const c = initSymbolization(l).color;
        if (!c.field) return;
        if (relire) {
            const t = c.reference?.table;
            if (t) _lignesReference.delete(t);
            _referencesDetectees.delete(`${l.id}|${c.field}|couleur`);
        }
        const ref = await detecterReference(l, c.field, 'couleur');
        if (!ref) { showToast('Aucune table de référence ne décrit ce champ', 'warning'); return; }
        const lignes = await lignesDeTable(ref.table);
        const entrees = entreesReference(lignes, ref);
        const valeurs = getUniqueValues(l, c.field, 500).map((v) => v.value);
        c.categories = categoriesDepuisReference(entrees, valeurs, c.defaultColor || '#999999')
            .map(({ value, color, label }) => ({ value, color, label }));
        const rangs = {};
        for (const [k, e] of entrees) if (Number.isFinite(e.rang)) rangs[k] = e.rang;
        c.reference = { table: ref.table, cle: ref.cle, couleur: ref.couleur, rang: ref.rang, libelle: ref.libelle, parReference: ref.parReference, rangs };
        syncLayerDeclarative(l); repeindreEntites(l); applyLayerStyle(l); renderInspector(); updateLegend(); markDirty();
        showToast(`Apparence de « ${ref.table} » appliquée`, 'success');
    },
    retirerReferenceCouleur(id) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const c = initSymbolization(l).color;
        delete c.reference;
        c.categories = [];
        regenCategories(l, 'color');
        syncLayerDeclarative(l); repeindreEntites(l); applyLayerStyle(l); renderInspector(); updateLegend(); markDirty();
    },
    choisirChampIcone(id, champ) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l);
        sym.icon = { ...(sym.icon || {}), mode: sym.icon?.field === champ ? sym.icon.mode : 'none', field: champ || null };
        renderInspector();
    },
    async appliquerIcones(id, champ, relire = false) {
        const l = STATE.layers.find((x) => x.id === id); if (!l || !champ) return;
        const sym = initSymbolization(l);
        if (relire) {
            if (sym.icon?.table) _lignesReference.delete(sym.icon.table);
            _referencesDetectees.delete(`${l.id}|${champ}|icone`);
            ICONES.echecs.clear();
        }
        const ref = await detecterReference(l, champ, 'icone');
        if (!ref) { showToast('Aucune table du document ne donne d’image pour ce champ', 'warning'); return; }
        const images = {};
        for (const [k, e] of entreesReference(await lignesDeTable(ref.table), ref)) if (e.icone) images[k] = e.icone;
        sym.icon = { mode: 'reference', field: champ, table: ref.table, colonne: ref.icone, images, taille: sym.icon?.taille || 40 };
        applyLayerStyle(l); renderInspector(); markDirty();
        showToast(`${Object.keys(images).length} icônes de « ${ref.table} »`, 'success');
    },
    retirerIcones(id) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l);
        sym.icon = { mode: 'none', field: sym.icon?.field || null, taille: sym.icon?.taille || 40 };
        applyLayerStyle(l); renderInspector(); markDirty();
    },
    setTailleIcone(id, v) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l);
        if (!sym.icon) return;
        sym.icon.taille = +v;
        if (map.getLayer(l.id + '-icon')) map.setLayoutProperty(l.id + '-icon', 'icon-size', +v / 64);
        const titre = [...document.querySelectorAll('#insp-body .section-title')].find((t) => /Taille/.test(t.textContent));
        if (titre) titre.textContent = `Taille · ${+v} px`;
        markDirty();
    },
    setSymMode(id, param, mode) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l); sym[param].mode = mode;
        if (param === 'color' && mode === 'single' && !sym.color.value) sym.color.value = l.color;
        if (mode === 'graduated' && sym[param].field) { const r = getNumericRange(l, sym[param].field); if (r.count) sym[param].inputRange = [r.min, r.max]; }
        if (mode === 'categorized' && sym[param].field) regenCategories(l, param);
        syncLayerDeclarative(l); repeindreEntites(l); applyLayerStyle(l); renderInspector();
        if (param === 'model') { Models3D.forceBuild(); markDirty(); }
    },
    setSymField(id, param, field) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l); sym[param].field = field || null;
        if (field && param === 'color' && sym.color.mode === 'categorized') regenCategories(l, 'color');
        if (field && param === 'color' && sym.color.mode === 'graduated') {
            // Sans cela, le découpage restait celui de 0 à 1 d'avant le choix du champ : toutes les valeurs dans la première classe.
            const r = getNumericRange(l, field);
            if (r.count) {
                sym.color.inputRange = [r.min, r.max];
                sym.color.manuel = false;
                l._declarative = { ...(l._declarative || {}), kind: 'graduated', field, method: sym.color.method || 'linear',
                    stops: graduatedStops(r.min, r.max, paletteEn(sym.color.colorRamp || sym.color.palette, sym.color.inverse), sym.color.method || 'linear') };
            }
        }
        if (field && param === 'model' && sym.model.mode === 'categorized') sym.model.categories = [];
        syncLayerDeclarative(l); repeindreEntites(l); applyLayerStyle(l); renderInspector();
    },
    setSymMethod(id, param, method) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l);
        sym[param].method = method;
        // La repartition est justement ce que la methode change. Des bornes
        // figees rendaient le reglage sans effet : Log et Racine affichaient la
        // meme carte que Lineaire.
        if (param === 'color' && sym.color.mode === 'graduated' && sym.color.field) {
            const r = getNumericRange(l, sym.color.field);
            const pal = paletteEn(sym.color.colorRamp || sym.color.palette, sym.color.inverse);
            if (r.count && pal.length) {
                l._declarative = {
                    ...(l._declarative || {}),
                    kind: 'graduated',
                    field: l._declarative?.field || sym.color.field,
                    method,
                    stops: graduatedStops(r.min, r.max, pal, method),
                };
            }
        }
        syncLayerDeclarative(l); repeindreEntites(l); applyLayerStyle(l); renderInspector();
    },
    setSymPalette(id, param, palette) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l); sym[param].palette = palette; if (param === 'color') sym.color.colorRamp = palette;
        if (sym[param].categories) regenCategories(l, param);
        // Le rendu gradue lit la couleur des classes du declaratif, pas la
        // rampe nommee : sans recoloriage, le choix de palette n'atteignait
        // jamais la carte — la legende passait au bleu, les mailles restaient
        // vertes. Les bornes, elles, portent le decoupage de la donnee et
        // doivent survivre au changement de couleurs.
        if (param === 'color' && l._declarative?.stops?.length) {
            l._declarative = {
                ...l._declarative,
                stops: recolorStops(l._declarative.stops, paletteEn(palette, sym.color.inverse)),
            };
        }
        syncLayerDeclarative(l); repeindreEntites(l); applyLayerStyle(l); renderInspector();
    },
    /** Inverser la palette : le plus foncé devient le plus clair. Vaut pour la couleur par catégorie et la couleur graduée. */
    setSymInverse(id, param, on) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l);
        if (!sym[param]) return;
        sym[param].inverse = !!on;
        if (sym[param].categories && !sym[param].reference) regenCategories(l, param);
        if (param === 'color' && l._declarative?.stops?.length && l._declarative.kind === 'graduated') {
            l._declarative = { ...l._declarative, stops: recolorStops(l._declarative.stops, paletteEn(sym.color.colorRamp || sym.color.palette, sym.color.inverse)) };
        }
        syncLayerDeclarative(l); repeindreEntites(l); applyLayerStyle(l); renderInspector(); updateLegend();
        markDirty(); saveLayerPrefIfSynced(l);
    },
    setSymColorValue(id, v) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l);
        sym.color.value = v;
        sym.color.mode = 'single';
        l.color = v;
        syncLayerDeclarative(l); repeindreEntites(l); applyLayerStyle(l); renderInspector(); updateLegend();
        // La pastille de la liste des couches porte cette couleur : sans ce
        // rafraîchissement, elle gardait l'ancienne jusqu'au prochain rendu.
        refreshLayersPanelIfOpen();
    },
    setSymSizeValue(id, v) { const l = STATE.layers.find((x) => x.id === id); if (!l) return; initSymbolization(l).size.value = +v; const el = $('sz-val'); if (el) el.textContent = v + (l.geometryType === 'Polygon' ? ' m' : (l.style?.mode === 'library' ? ' ×' : ' px')); applyLayerStyle(l); },
    setSymOutput(id, param, i, v) { const l = STATE.layers.find((x) => x.id === id); if (!l) return; initSymbolization(l)[param].outputRange[i] = +v; applyLayerStyle(l); },

    /** Surfaces à plat ou extrudées. Remonter en volume réactive la hauteur. */
    /** Couleur graduée : répartie d'office, ou en classes dont on pose les seuils. */
    setDecoupage(id, mode) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l);
        const c = sym.color;
        if (!c.field) return;
        const r = getNumericRange(l, c.field);
        if (mode === 'manuel') {
            // Un premier passage en manuel repart des données (seuils ronds entre le minimum et le maximum), pas des
            // classes d'avant ; ensuite, les seuils posés à la main sont respectés.
            const deja = !!c.manuel;
            c.manuel = true;
            if (!deja) { A.setClasses(id, 'couleur', { init: true }); return; }
        } else {
            c.manuel = false;
            if (r.count) {
                l._declarative = { ...(l._declarative || {}), kind: 'graduated', field: c.field, method: c.method || 'linear',
                    stops: graduatedStops(r.min, r.max, paletteEn(c.colorRamp || c.palette, c.inverse), c.method || 'linear') };
            }
        }
        syncLayerDeclarative(l); repeindreEntites(l); applyLayerStyle(l); updateLegend(); renderInspector(); markDirty(); saveLayerPrefIfSynced(l);
    },
    /** Les classes d'une règle (couleur graduée ou contour) : seuils, couleurs, champ. */
    setClasses(id, cible, patch = {}) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l);
        const contour = cible === 'contour';
        if (contour && !sym.stroke.regle) sym.stroke.regle = { field: '', stops: [] };
        if (contour && patch.field !== undefined) { sym.stroke.regle.field = patch.field || ''; if (!patch.field) sym.stroke.regle.stops = []; else patch.init = true; }
        const champ = contour ? sym.stroke.regle.field : sym.color.field;
        let { seuils, couleurs } = seuilsDeStops(classesDe(l, cible));
        if (patch.init || !couleurs.length) {
            // Un découpage de départ : des seuils ronds entre le minimum et le maximum, du vert au rouge.
            const r = champ ? getNumericRange(l, champ) : { count: 0 };
            seuils = r.count ? seuilsAutomatiques(r.min, r.max, 3) : [];
            couleurs = contour ? [COULEURS_PAR_DEFAUT[2], COULEURS_PAR_DEFAUT[1], ''] : [...COULEURS_PAR_DEFAUT];
            couleurs = couleurs.slice(0, seuils.length + 1);
            while (couleurs.length < seuils.length + 1) couleurs.push(couleurs[couleurs.length - 1] ?? COULEURS_PAR_DEFAUT[0]);
        }
        if (patch.seuil) { const v = Number(patch.seuil[1]); if (Number.isFinite(v)) seuils[patch.seuil[0]] = v; }
        if (patch.couleur) couleurs[patch.couleur[0]] = patch.couleur[1];
        if (patch.vide) { const [i, vide] = patch.vide; couleurs[i] = vide ? '' : (couleurs.find((x) => x) || COULEURS_PAR_DEFAUT[2]); }
        if (patch.ajouter) {
            const dernier = seuils.length ? seuils[seuils.length - 1] : 0;
            const pas = seuils.length > 1 ? (seuils[seuils.length - 1] - seuils[seuils.length - 2]) : 1;
            seuils.push(dernier + (pas || 1));
            couleurs.push(couleurs[couleurs.length - 1] ?? '');
        }
        if (patch.retirer && seuils.length) { seuils.pop(); couleurs.pop(); }
        if (patch.inverser) couleurs.reverse();
        const stops = stopsDepuisSeuils(seuils, couleurs);
        if (contour) {
            sym.stroke.regle = { field: champ, stops };
            sym.stroke.mode = 'regle'; sym.stroke.enabled = true;
        } else {
            sym.color.manuel = true;
            l._declarative = { ...(l._declarative || {}), kind: 'graduated', field: champ, method: sym.color.method || 'linear', stops };
            syncLayerDeclarative(l); repeindreEntites(l);
        }
        applyLayerStyle(l); updateLegend(); renderInspector(); markDirty(); saveLayerPrefIfSynced(l);
    },
    /** Proposer (ou non) aux agents d'ajouter un objet à la couche, en Exploiter. */
    setCreationExploiter(id, on) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        initSymbolization(l).creation = { exploiter: !!on };
        markDirty(); saveLayerPrefIfSynced(l);
        refreshControlsDock();
        showToast(on ? 'Les agents pourront ajouter un objet à cette couche, en Exploiter' : 'Ajout d’objet réservé à la préparation', 'info');
    },
    /** Regrouper les objets proches : réglage par couche, source reconstruite. */
    setGrappes(id, patch) {
        const l = STATE.layers.find((x) => x.id === id); if (!l || !grappable(l)) return;
        const sym = initSymbolization(l);
        sym.cluster = { ...GRAPPES_DEFAUT, ...(sym.cluster || {}), ...patch };
        addLayerToMap(l);
        updateLegend();
        renderInspector(); markDirty(); saveLayerPrefIfSynced(l);
    },
    /** Surfaces à plat : pleines, ou seulement leur contour. */
    setRemplissage(id, mode) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        initSymbolization(l).remplissage = mode === 'contour' ? 'contour' : 'plein';
        applyLayerStyle(l);
        renderInspector(); markDirty(); saveLayerPrefIfSynced(l);
    },
    setPolygonMode(id, mode) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        l.style = l.style || { mode: 'mapbox' };
        l.style.polygonMode = mode === 'flat' ? 'flat' : 'extruded';
        applyLayerStyle(l);
        Models3D.scheduleBuild();
        renderInspector(); markDirty(); saveLayerPrefIfSynced(l);
    },
    /** Opacité de couche ; 'auto' rend la main au style déclaratif. */
    setSymOpacity(id, v) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l);
        sym.opacity = v === 'auto' ? null : clamp(+v, 0, 1);
        const el = $('op-val');
        if (el && v !== 'auto') el.textContent = Math.round(+v * 100) + ' %';
        applyLayerStyle(l);
        if (v === 'auto') renderInspector();
        markDirty(); saveLayerPrefIfSynced(l);
    },
    setStrokeMode(id, mode) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const st = initSymbolization(l).stroke;
        st.enabled = mode !== 'none';
        if (mode !== 'none') st.mode = mode;
        if (mode === 'fixed' && !st.color) st.color = l.color;
        // Un contour qui porte une information se lit mieux un peu épais.
        if (mode === 'regle') { st.width = Math.max(Number.isFinite(st.width) ? st.width : 1.5, 3); if (!st.regle) A.setClasses(id, 'contour', { init: true }); }
        applyLayerStyle(l); renderInspector(); markDirty(); saveLayerPrefIfSynced(l);
    },
    setStrokeWidth(id, v) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        initSymbolization(l).stroke.width = clamp(+v, 0, 20);
        applyLayerStyle(l); markDirty(); saveLayerPrefIfSynced(l);
    },
    setStrokeColor(id, v) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const st = initSymbolization(l).stroke;
        st.color = v; st.mode = 'fixed'; st.enabled = true;
        applyLayerStyle(l); markDirty(); saveLayerPrefIfSynced(l);
    },
    setExtrusionBase(id, v) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        initSymbolization(l).extrusion.base = Math.max(0, +v || 0);
        applyLayerStyle(l); renderInspector(); markDirty(); saveLayerPrefIfSynced(l);
    },
    setLabelSize(id, v) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        initSymbolization(l).label.size = clamp(+v, 6, 40);
        applyLayerStyle(l); markDirty(); saveLayerPrefIfSynced(l);
    },
    setLabelColor(id, v) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        initSymbolization(l).label.color = v;
        applyLayerStyle(l); markDirty(); saveLayerPrefIfSynced(l);
    },
    pickCatColor(id, value, el) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const cat = l.style.symbolization.color.categories.find((c) => String(c.value) === String(value)); if (!cat) return;
        const inp = document.createElement('input'); inp.type = 'color'; inp.value = cat.color; inp.style.position = 'fixed'; inp.style.opacity = '0';
        document.body.appendChild(inp);
        inp.oninput = () => {
            cat.color = inp.value; el.style.background = inp.value;
            applyCategoryColorsToFeatures(l);
            syncLayerSourceData(l);
            applyLayerStyle(l);
        };
        inp.onchange = () => inp.remove();
        inp.click();
    },
    setModelCategory(id, value, modelId) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l); let cat = sym.model.categories.find((c) => String(c.value) === String(value));
        if (!cat) { cat = { value }; sym.model.categories.push(cat); }
        cat.modelId = modelId || null; applyLayerStyle(l); Models3D.forceBuild(); renderInspector();
    },
    setDefaultModel(id, modelId) { const l = STATE.layers.find((x) => x.id === id); if (!l) return; initSymbolization(l).model.defaultModelId = modelId || null; applyLayerStyle(l); Models3D.forceBuild(); },
    setCommon(id, param, v, elId, unit) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        l.style.common = l.style.common || {}; l.style.common[param] = +v;
        const el = $(elId); if (el) el.textContent = v + (unit || '');
        Models3D.updateEdited(id, (l.geojson?.features || []).map((_, i) => i));
    },
    toggleLabel(id) { const l = STATE.layers.find((x) => x.id === id); if (!l) return; const lab = initSymbolization(l).label; lab.enabled = !lab.enabled; applyLayerStyle(l); renderInspector(); },
    resetSymbology(id) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        delete l.style.symbolization; initSymbolization(l); repeindreEntites(l); applyLayerStyle(l); renderInspector(); showToast('Symbologie réinitialisée', 'success');
    },

    // Selection editing
    selPrev() { nav(-1); }, selNext() { nav(1); },
    /**
     * Ouvre la fiche de l'objet le plus proche. Sans position encore connue, on
     * la demande, et l'on agit a son arrivee — un bouton qui ne fait rien au
     * premier toucher donne l'impression d'etre casse.
     */
    releveProche(layerId) {
        const layer = STATE.layers.find((l) => l.id === layerId);
        if (!layer) return;
        const ouvrir = () => {
            const r = objetProcheDeCouche(layer);
            if (!r) { showToast('Aucun objet visible dans cette couche', 'info'); return; }
            $('map-controls-dock')?.classList.add('collapsed');
            // Comme le toucher : la bulle quand la couche en a une, la fiche sinon.
            allerAObjet(layer.id, r.idx);
        };
        if (_dernierePosition) { ouvrir(); return; }
        if (!localisationDisponible()) { showToast('Localisation indisponible ici', 'warning'); return; }
        // L'attente est bornee : un GPS qui ne repond pas laisserait le bouton
        // sans suite, et l'on croirait qu'il est casse.
        let fait = false;
        const delai = setTimeout(() => {
            if (!fait) showToast('Position introuvable pour le moment — touchez un objet sur la carte', 'warning');
        }, 15000);
        _geoloc.once('geolocate', () => { fait = true; clearTimeout(delai); ouvrir(); });
        showToast('Recherche de votre position…', 'info');
        if (_geoloc.trigger() === false) {
            clearTimeout(delai);
            showToast('Localisation indisponible ici', 'warning');
        }
    },
    // ---- Liste d'objets ----
    listeObjets(layerId) { ouvrirListe(STATE.layers.find((l) => l.id === layerId)); },
    listeFermer() { fermerListe(); },
    listeRecherche(valeur) {
        if (!_liste) return;
        _liste.requete = String(valeur || '');
        clearTimeout(_liste._t);
        _liste._t = setTimeout(renderListeLignes, 120);
    },
    listeTri(tri) { if (_liste) { _liste.tri = tri === 'nom' ? 'nom' : (tri === 'tournee' ? 'tournee' : 'proche'); renderListeLignes(); } },
    listeAutourDeMoi() {
        if (!_liste) return;
        if (_dernierePosition) { _liste.tri = 'proche'; renderListeLignes(); return; }
        if (!localisationDisponible()) { showToast('Localisation indisponible ici', 'warning'); return; }
        showToast('Recherche de votre position…', 'info');
        _liste.tri = 'proche';
        _geoloc.once('geolocate', () => renderListeLignes());
        if (_geoloc.trigger() === false) showToast('Localisation indisponible ici', 'warning');
    },
    listeOuvrir(coucheId, idx) {
        const layer = STATE.layers.find((l) => l.id === coucheId);
        if (!layer) return;
        $('map-controls-dock')?.classList.add('collapsed');
        allerAObjet(coucheId, idx);
    },
    /** « Visite » sur une ligne : le formulaire de relevé de cet objet, sans passer par la bulle. */
    listeVisite(coucheId, idx) {
        const layer = STATE.layers.find((l) => l.id === coucheId);
        const f = layer && formulaireDeReleve(layer);
        if (!f) { showToast('Aucun formulaire n’est proposé pour cette couche', 'warning'); return; }
        const feature = layer.geojson?.features?.[idx];
        if (feature) fitToFeatures([feature]);
        // La liste reste dessous : fermer la fiche y ramène.
        enterSelectionMode(layer.id, idx, { consultation: true });
        _inspObjTab = f.id;
        renderObjectInspector();
    },
    releveCadrer(layerId) {
        const layer = STATE.layers.find((l) => l.id === layerId);
        if (layer) fitToLayer(layer);
    },
    selAll() {
        const l = STATE.layers.find((x) => x.id === STATE.selection.layerId); if (!l) return;
        STATE.selection.features = l.geojson.features.map((_, i) => i); afterSelectionChange();
    },
    selClear() { STATE.selection.features = []; afterSelectionChange(); },
    editFeature(sliderId, value) {
        if (!assertCanWrite('éditer les objets 3D')) return;
        const layer = STATE.layers.find((l) => l.id === STATE.selection.layerId); if (!layer) return;
        verifierPersistance3d(layer);
        const v = parseFloat(value); const el = $(sliderId + '-v');
        const param = sliderId.split('-')[1];
        const multi = sliderId.startsWith('m-');
        const unit = param === 'scale' ? '×' : param.startsWith('offset') ? 'm' : '°';
        if (el) el.textContent = (multi && v >= 0 && param !== 'scale' ? '+' : '') + (param === 'scale' ? v.toFixed(2) : v) + unit;
        if (!multi) {
            const idx = STATE.selection.features[0];
            setFeatureOverride(layer, idx, param, v);
        } else {
            if (!multiBaseValues) {
                multiBaseValues = {};
                STATE.selection.features.forEach((i) => { multiBaseValues[i] = resolveFeatureProps(layer.geojson.features[i], layer); });
            }
            STATE.selection.features.forEach((i) => {
                const base = multiBaseValues[i] || {};
                if (param === 'scale') setFeatureOverride(layer, i, 'scale', (base.scale || 1) * v);
                else if (param === 'rotationZ') setFeatureOverride(layer, i, 'rotationZ', ((base.rotationZ || 0) + v + 360) % 360);
                else setFeatureOverride(layer, i, param, (base[param] || 0) + v);
            });
        }
        Models3D.updateEdited(layer.id, multi ? STATE.selection.features : [STATE.selection.features[0]]);
    },
    resetSelected() {
        if (!assertCanWrite('réinitialiser les objets')) return;
        const l = STATE.layers.find((x) => x.id === STATE.selection.layerId); if (!l) return;
        STATE.selection.features.forEach((i) => clearFeatureOverrides(l, i));
        multiBaseValues = null; Models3D.updateEdited(l.id, STATE.selection.features); renderInspector(); showToast('Réinitialisé', 'success');
    },
    applySelected() {
        const l = STATE.layers.find((x) => x.id === STATE.selection.layerId);
        multiBaseValues = null;
        if (!l) return;
        // Toute couche adossée à une table écrit ses objets dans leurs lignes —
        // la même règle que la fiche (`coucheAvecLignes`). Le critère était
        // `source === 'qgis2grist'` : une couche entablée ou liée s'éditait à
        // l'écran, affichait « enregistré », et n'écrivait que son apparence.
        if (coucheAvecLignes(l) && CONFIG.grist.ready) {
            if (!assertCanWrite('enregistrer les objets')) return;
            if (!l._gristColumns?.length) {
                // Couche liée ou entablée : sans liste de colonnes, l'écriture
                // viserait tout ce que l'objet porte, formules comprises.
                const lues = Object.keys(l.geojson?.features?.[STATE.selection.features[0]]?.properties || {})
                    .filter((k) => !k.startsWith('_'));
                l._gristColumns = colonnesEcrivables(STATE.schema?.[l.sourceTable],
                    [...lues, ...nomsColonnesGeometrie(colonnesGeometrie(l))]);
            }
            saveFeaturesToSource(grist.docApi, l, STATE.selection.features)
                .then((n) => {
                    marquerEnregistre();
                    // La colonne technique d'Atlas, créée à l'enregistrement : on le dit, c'est la table de l'équipe.
                    const creee = l.colonne3dCreee ? ' · colonne atlas_3d_json créée' : '';
                    l.colonne3dCreee = false;
                    if (l.colonne3dRefusee) {
                        // Pas le droit de modifier la structure : le reste est enregistré, pas le placement ni les réglages.
                        l.colonne3dRefusee = null;
                        showToast(`${n} enregistrement(s) · ${l.sourceTable} — placement et réglages NON enregistrés : Atlas ne peut pas ajouter la colonne atlas_3d_json (droits sur la structure)`, 'warning');
                    } else {
                        showToast(`${n} enregistrement(s) · ${l.sourceTable}${creee}`, 'success');
                    }
                })
                .catch((e) => {
                    enterViewModeOnWriteFail(e);
                    showToast('Grist : ' + e.message, 'error');
                });
            return;
        }
        markDirty();
        saveLayerToGrist(l, true);
        showToast(`${STATE.selection.features.length} objet(s) enregistré(s)`, 'success');
    },
    setInspObjTab(tab) { _inspObjTab = tab; renderObjectInspector(); },
    closeInspector() { closeInspectorByUser(); },
    setFeatureAttr(layerId, field, value) {
        if (!assertCanWrite('modifier les attributs')) return;
        const l = STATE.layers.find((x) => x.id === layerId);
        if (!l) return;
        const idx = STATE.selection.features[0];
        const f = l.geojson?.features?.[idx];
        if (!f) return;
        if (!f.properties) f.properties = {};
        const fld = getLayerFields(l).find((x) => x.id === field);
        f.properties[field] = fld?.type === 'numeric' ? (value === '' ? null : parseFloat(value)) : value;
        markDirty();
    },

    // Project
    saveProject, loadProject, restoreProject, exportProject,
};
function regenCategories(layer, param) {
    const sym = layer.style.symbolization[param];
    const vals = getUniqueValues(layer, sym.field, 100);
    if (param === 'color') {
        sym.categories = vals.map((v, i) => ({ value: v.value, color: paletteColor(sym.palette, i, vals.length, sym.inverse), count: v.count }));
        if (layer.source === 'qgis2grist') {
            applyCategoryColorsToFeatures(layer);
            syncLayerSourceData(layer);
        }
    }
}
/**
 * Le rang de l'objet courant parmi ceux que les filtres de la couche (ceux d'un contexte compris) laissent voir, et leur nombre
 * — voir `lib/revue-selection.js`.
 */
function rangRevue(layer) {
    const garde = layer ? buildControlPredicate(layer) : null;
    return rangParmiAffiches(layer?.geojson?.features, garde, STATE.selection.features, STATE.selection.multiIndex);
}

function nav(dir) {
    const layer = STATE.layers.find((l) => l.id === STATE.selection.layerId); if (!layer) return;
    const n = STATE.selection.features.length;
    if (n > 1) {
        const i = pasAffiche(layer.geojson?.features, buildControlPredicate(layer), STATE.selection.features, STATE.selection.multiIndex, dir);
        if (i == null) { showToast('Aucun objet affiché : les filtres les masquent tous', 'warning'); return; }
        STATE.selection.multiIndex = i;
        flyToFeature(layer, STATE.selection.features[i]);
        const { rang, total } = rangRevue(layer);
        $('sel-pos').textContent = `${rang} / ${total}`;
        updateHighlight();
        renderObjectInspector();
    } else {
        const total = layer.geojson.features.length;
        const cur = STATE.selection.features[0] ?? 0;
        // Avec une tournée, ◀ ▶ suivent l'ordre de la ligne ; sinon l'ordre de la couche, en sautant ce que les filtres masquent.
        const ordre = ordreTournee(layer.id);
        let next;
        if (ordre && ordre.length) {
            const cle = voisinDansTournee(ordre, `${layer.id}:${cur}`, dir);
            next = ordre.find((o) => o.cle === cle)?.idx ?? null;
        } else {
            const tous = Array.from({ length: total }, (_, k) => k);
            next = pasAffiche(layer.geojson?.features, buildControlPredicate(layer), tous, cur, dir);
        }
        if (next == null) { showToast('Aucun objet affiché : les filtres les masquent tous', 'warning'); return; }
        STATE.selection.features = [next];
        flyToFeature(layer, next); afterSelectionChange();
    }
}
window.A = A;
// Debug runtime (à retirer) : inspection Models3D depuis le navigateur
window.__Models3D = Models3D;

// ============================================================
// EVENT WIRING
// ============================================================
/**
 * La barre de sélection se pose juste sous le dock — sa rangée de pastilles, ou son panneau quand un filtre est ouvert —
 * et reste centrée. On mesure le dock plutôt que de deviner sa hauteur : elle change avec le panneau ouvert.
 */
function placerBarreSelection() {
    const frame = $('map-frame');
    const dock = $('map-controls-dock');
    if (!frame) return;
    let bas = 16;
    if (dock && getComputedStyle(dock).display !== 'none') {
        bas = dock.getBoundingClientRect().bottom - frame.getBoundingClientRect().top;
    }
    frame.style.setProperty('--sel-top', `${Math.max(16, Math.round(bas + 12))}px`);
}

function wireMapControlsDock() {
    const dock = $('map-controls-dock');
    if (!dock) return;
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(placerBarreSelection).observe(dock);
        placerBarreSelection();
    }
    const KEY = 'atlas_map_controls_collapsed';
    const apply = (collapsed) => {
        dock.classList.toggle('collapsed', !!collapsed);
        try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch (e) {}
        if (!collapsed && _openDockPill) renderDockSlotHost();
    };
    let collapsed = false;
    try { collapsed = localStorage.getItem(KEY) === '1'; } catch (e) {}
    apply(collapsed);
    $('dock-collapse')?.addEventListener('click', () => apply(true));

    const host = $('dock-slot-host');
    if (host && !host._dockWired) {
        host._dockWired = true;
        host.addEventListener('click', (e) => {
            if (e.target.closest('#shadow-toggle')) A.toggleSetting('shadows');
        });
        const arcSet = (clientX, arc) => {
            const rect = arc.getBoundingClientRect();
            STATE.settings.timeOfDay = minutesDepuisPosition((clientX - rect.left - 8) / 152);
            updateLighting();
            if (STATE.currentModule === 'soleil') renderSoleil();
            // Le débounce absorbe le geste : un glissement d'arc émet une
            // valeur par pixel parcouru, on n'écrit qu'à l'arrêt.
            persistScenePrefsDifferee();
        };
        // Pointer Events : un seul jeu d'écouteurs pour souris, doigt et stylet.
        // La capture est prise sur l'hôte, pas sur l'arc : `renderDockSlotHost`
        // peut reconstruire l'arc en cours de geste, ce qui perdrait la capture.
        host.addEventListener('pointerdown', (e) => {
            const arc = e.target.closest('.sun-arc');
            if (!arc) return;
            _sunArcDragging = true;
            capturePointer(host, e.pointerId);
            arcSet(e.clientX, arc);
            e.preventDefault();
        });
        host.addEventListener('pointermove', (e) => {
            if (!_sunArcDragging) return;
            const arc = host.querySelector('.sun-arc');
            if (arc) arcSet(e.clientX, arc);
        });
        const finArc = () => { _sunArcDragging = false; };
        host.addEventListener('pointerup', finArc);
        host.addEventListener('pointercancel', finArc);
        // Au clavier : ←/→ cinq minutes, Maj+←/→ une heure, minuit se franchit.
        host.addEventListener('keydown', (e) => {
            if (!e.target.closest?.('.sun-arc')) return;
            const m = minutesApresTouche(STATE.settings.timeOfDay, e.key, e.shiftKey);
            if (m == null) return;
            e.preventDefault();
            STATE.settings.timeOfDay = m;
            updateLighting();
            if (STATE.currentModule === 'soleil') renderSoleil();
            persistScenePrefsDifferee();
        });
    }
}

function wireEvents() {
    updateMobileLayout();
    wireMobileNav();
    wireBasculeLectureEdition();
    wireLegendClicks();
    // Les bascules sont des `div` : `tabindex` les rend atteignables, mais
    // seul un vrai bouton réagit à Espace et Entrée. On le fait ici, une fois
    // pour toutes, plutôt que sur chaque bascule.
    document.addEventListener('keydown', (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        const bascule = e.target?.closest?.('[role="switch"]');
        if (!bascule) return;
        e.preventDefault();
        bascule.click();
    });
    if (typeof window !== 'undefined' && window.matchMedia) {
        window.matchMedia('(max-width: 720px)').addEventListener('change', () => {
            updateMobileLayout();
            // La localisation n'a de pastille que sur mobile, et l'étage du bas
            // n'existe qu'au-dessus : les deux suivent le passage d'un mode à
            // l'autre.
            refreshControlsDock();
            majEtageCarte();
        });
    }
    // Les panneaux d'édition changent la largeur de la carte sans toucher à la
    // fenêtre : c'est la carte qu'on observe.
    if (typeof ResizeObserver !== 'undefined' && $('map-frame')) {
        new ResizeObserver(() => majEtageCarte()).observe($('map-frame'));
    } else {
        majEtageCarte();
    }
    document.querySelectorAll('.rail-item[data-module]').forEach((b) => {
        b.addEventListener('click', () => {
            const m = b.dataset.module;
            if (STATE.currentModule === m) closeModulePanel(); else openModule(m);
        });
    });
    $('btn-save').addEventListener('click', saveProject);
    $('btn-load').addEventListener('click', loadProject);
    $('btn-export').addEventListener('click', (e) => ouvrirMenuExport(e.currentTarget));
    cablerMenuPrincipal();
    $('cmdk-trigger').addEventListener('click', openCmd);
    $('hote-recherche')?.addEventListener('click', openCmd);
    $('compass').addEventListener('click', () => map.easeTo({ bearing: 0, duration: 600 }));

    $('file-input').addEventListener('change', (e) => { if (e.target.files[0]) processFile(e.target.files[0]); e.target.value = ''; });

    // legend collapse
    $('legend-head').addEventListener('click', () => $('legend').classList.toggle('collapsed'));
    // Sur un telephone, la legende depliee mangeait le quart de l'ecran et
    // masquait ce qu'elle decrit. Elle s'ouvre d'un doigt quand on en a besoin.
    if (document.body.classList.contains('mobile-layout')) $('legend')?.classList.add('collapsed');

    // selection bar
    $('sel-prev').addEventListener('click', () => A.selPrev());
    $('sel-next').addEventListener('click', () => A.selNext());
    $('sel-all').addEventListener('click', () => A.selAll());
    $('sel-clear').addEventListener('click', () => A.selClear());
    $('sel-exit').addEventListener('click', exitSelectionMode);

    // dock contrôles (repli style boussole)
    wireMapControlsDock();
    refreshControlsDock();

    // fermeture inspecteur (pas de pastille carte)
    $('insp-close-btn')?.addEventListener('click', () => A.closeInspector());
    // Sur telephone, le clavier prend la moitie basse de l'ecran — la ou se
    // trouve la fiche. A mi-hauteur, le champ touche passait dessous : on
    // saisissait a l'aveugle. La fiche se deploie, et le champ vient au centre
    // une fois le clavier installe.
    $('inspector')?.addEventListener('focusin', (e) => {
        if (!surTelephone()) return;
        const champ = e.target;
        if (!champ?.matches?.('textarea, input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=submit])')) return;
        if (fichePosition !== 'pleine') poserFiche('pleine');
        setTimeout(() => champ.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 320);
    });

    // command palette keyboard
    $('cmd-input').addEventListener('input', (e) => buildCmdItems(e.target.value));
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmd(); return; }
        const open = $('cmd-overlay').classList.contains('open');
        if (open) {
            if (e.key === 'Escape') closeCmd();
            else if (e.key === 'ArrowDown') { cmdSel = Math.min(cmdSel + 1, cmdItems.length - 1); renderCmd(); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { cmdSel = Math.max(cmdSel - 1, 0); renderCmd(); e.preventDefault(); }
            else if (e.key === 'Enter') runCmd(cmdSel);
            return;
        }
        if (e.key === 'Escape') {
            if (_saisieObjet) quitterSaisieObjet(messageAbandon());
            else if (_itineraire) { terminerItineraire(); showToast('Itinéraire annulé', 'info'); if (STATE.currentModule === 'recit') renderRecit(); }
            else if (trajetPickMode) { annulerChoixTrajet(); showToast('Choix annulé', 'info'); if (STATE.currentModule === 'recit') renderRecit(); }
            else if (locationPickMode) { locationPickMode = false; if (map) map.getCanvas().style.cursor = ''; showToast('Annulé', 'info'); }
            else if (STATE.selection.mode) exitSelectionMode();
            else if (_liste) fermerListe();
            else if (STATE.currentModule) closeModulePanel();
        }
    });
    $('cmd-overlay').addEventListener('click', (e) => { if (e.target.id === 'cmd-overlay') closeCmd(); });
}

// ============================================================
// INIT
// ============================================================
async function init() {
    // Mode URL avant premier paint chrome
    const bootMode = parseAtlasMode(typeof location !== 'undefined' ? location.search : '');
    if (bootMode === 'view') {
        CONFIG.viewMode = true;
        applyViewModeChrome();
    }
    updateMobileLayout();
    wireEvents();
    initMap();
    probeLocalModels();
    await initGrist();
    if (CONFIG.sceneExterne) await monterSceneExterne(CONFIG.sceneExterne);
    applyViewModeChrome();
    updateMobileLayout();
    // Autosave : standalone uniquement — pas en doc Grist (Scene Manifest charge déjà les couches)
    try {
        const auto = localStorage.getItem('atlas_autosave');
        // Pas de proposition de restauration quand une scène est demandée par
        // son adresse : `?scene=` dit exactement quoi ouvrir, et l'accepter
        // remplacerait cette scène par un travail local sans rapport. Le
        // dialogue apparaissait pourtant — il ne testait que l'absence de Grist
        // et de couches, or les couches d'une scène externe arrivent APRÈS ce
        // point. Quelqu'un qui suit un lien vers un guide se voyait proposer
        // d'écraser ce qu'il venait d'ouvrir.
        const sceneDemandee = new URLSearchParams(location.search).get('scene');
        if (auto && !sceneDemandee && !CONFIG.grist.ready && STATE.layers.length === 0) {
            const p = JSON.parse(auto);
            if (p.layers?.length && confirm(`Restaurer la sauvegarde locale (${p.layers.length} couches) ?`)) {
                restoreProject(p);
            }
        }
    } catch (e) {}
    setInterval(() => {
        if (CONFIG.grist.ready || !STATE.layers.length) return;
        try { localStorage.setItem('atlas_autosave', JSON.stringify(buildProject())); } catch (e) {}
    }, 120000);
    updateLegend();
    updateSunStrip();
}

/**
 * Demarrage — deux chemins, un seul point d'entree.
 *
 * Dans un document Grist, rien ne change : `init()` part comme avant. Ouvert
 * seul — application installee ou simple onglet — Atlas ne sait ni ou se
 * connecter ni quelle scene montrer : l'accueil le demande, puis rend la main.
 *
 * L'accueil est charge A LA DEMANDE. En widget, ce `import()` n'a jamais lieu :
 * ni le module d'accueil ni ses dependances ne sont telecharges, et le chemin
 * eprouve reste rigoureusement inchange.
 */
async function demarrer() {
    // La scène externe se décide avant tout le reste : elle change le régime
    // d'Atlas, pas seulement ce qu'il affiche. Ni accueil (il n'y a rien à
    // demander, la scène est nommée) ni document (elle n'est pas de confiance).
    const { url: urlScene, refus } = urlSceneDepuisParam(
        typeof location !== 'undefined' ? location.search : '');
    if (refus) {
        // Un refus muet enverrait chercher un bug d'Atlas là où il y a une
        // adresse mal formée. Il s'affiche, et la page s'ouvre quand même.
        console.warn('[Atlas]', refus);
        setTimeout(() => showToast(refus, 'error'), 0);
    }
    if (urlScene) {
        const { manifest, echec } = await chargerSceneExterne(urlScene);
        if (echec) {
            console.error('[Atlas] scène externe :', echec);
            // Rendre la main plutôt que laisser une page morte : Atlas s'ouvre
            // vide, mais il dit pourquoi — et il reste utilisable.
            setTimeout(() => showToast(echec, 'error'), 0);
        } else {
            CONFIG.sceneExterne = manifest;
            CONFIG.viewMode = true;   // rien à écrire : il n'y a pas de document
            return init();
        }
    }
    try {
        const { capacites } = await import('./lib/data-client.js?v=20261001a');
        if (capacites().mode === 'grist') return init();
        const { accueillir } = await import('./lib/hote-ui.js?v=20261002g');
        const pret = await accueillir();
        if (!pret) return;          // l'accueil garde l'ecran : rien a demarrer
    } catch (e) {
        // Un accueil defaillant ne doit pas empecher Atlas de s'ouvrir : hors
        // Grist il n'aura pas de donnees, mais il le dira mieux qu'une page morte.
        console.error('[Atlas] accueil :', e);
    }
    return init();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
else demarrer();

/**
 * Dire ce qui n'a pas pu être chargé.
 *
 * Le silence était le vrai défaut : une couche en échec disparaissait comme une
 * couche volontairement absente, et seul un `console.warn` en gardait trace —
 * c'est-à-dire personne, sur le terrain comme ailleurs. On préfère un message
 * qui nomme la couche et l'origine attendue : c'est ce qui permet de distinguer
 * « je ne sais pas lire cette origine » de « cette table n'existe pas ».
 */
function signalerCouchesManquantes(echecs) {
    if (!echecs || !echecs.length) return;
    for (const e of echecs) console.warn('[Atlas] couche non chargée —', e.nom, '·', e.origine, '·', e.raison);

    const n = echecs.length;
    const titre = n === 1
        ? `Couche non chargée : ${echecs[0].nom}`
        : `${n} couches non chargées`;
    // Le détail au-delà de deux noms encombrerait plus qu'il n'informerait ; la
    // console porte la liste complète.
    const detail = echecs.slice(0, 2).map((e) => `${e.nom} (${e.origine})`).join(' · ')
        + (n > 2 ? ` … et ${n - 2} autre${n - 2 > 1 ? 's' : ''}` : '');
    showToast(`${titre} — ${detail}`, 'warning');
}
