/**
 * Le guide interactif — un récit dont le sujet est Atlas lui-même.
 *
 * Ici la donnée n'est pas le propos, elle est le support : des carrés fabriqués,
 * porteurs des attributs exacts qu'il faut pour illustrer une notion et pas une
 * de plus. C'est la différence avec la démo des Aygalades, qui raconte un
 * territoire et montre l'outil en chemin ; celle-ci ne raconte que l'outil.
 *
 * Trois raisons de fabriquer plutôt que d'extraire :
 *
 * 1. **On montre ce qu'on veut montrer.** Une graduation a besoin de valeurs
 *    étalées sur toute sa plage ; un jeu réel a des trous, des extrêmes et des
 *    valeurs manquantes qui parasitent la leçon. Ils ont leur place dans une
 *    démo de territoire, pas dans une explication.
 * 2. **Rien ne dépend d'un tiers.** Overpass a répondu 504 en série pendant la
 *    construction des Aygalades, sur trois miroirs. Un guide qui sert à
 *    apprendre l'outil ne peut pas dépendre de la charge d'un serveur public.
 * 3. **Quelques kilo-octets.** Le guide se charge instantanément, y compris
 *    depuis une page de présentation où on l'ouvre par curiosité.
 *
 * **Chaque étape invite à un geste**, et c'est ce qui en fait un guide plutôt
 * qu'un diaporama. Ces gestes ne sont possibles que parce que le récit laisse
 * la main : les pastilles de filtre, la légende cliquable et la navigation
 * restent actives pendant la lecture. Le rail d'auteur, lui, est masqué — un
 * récit s'exécute en mode lecture. Ce guide s'adresse donc à qui **regarde**
 * une scène, pas à qui la fabrique.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Marseille, parce qu'il faut bien poser les carrés quelque part. */
const CENTRE = [5.3698, 43.2965];
// ~75 m par carré : la grille entière (6 × 5) tient alors dans la vue à z15,6.
// Réglé à l'écran — à 0,0022 elle faisait 1,1 km et on n'en voyait que cinq.
const PAS = 0.0009;

/** `timeOfDay` se compte en minutes depuis minuit — écrire 14 donne 00:14. */
const heure = (h) => Math.round(h * 60);

const carre = (col, lig, props) => {
  const x = CENTRE[0] + (col - 2.5) * PAS;
  const y = CENTRE[1] + (lig - 2) * PAS;
  const d = PAS * 0.82;
  return {
    type: 'Feature',
    properties: props,
    geometry: { type: 'Polygon', coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] },
  };
};

/* ------------------------------------------------------------------ données --
 * Une seule couche de 30 carrés porte TOUS les attributs dont le guide se sert.
 * Une couche par notion aurait obligé à les faire apparaître et disparaître, et
 * le lecteur aurait suivi ce ballet au lieu de la démonstration. Ici rien ne
 * bouge : seule la façon de lire les mêmes objets change d'une étape à l'autre.
 * C'est précisément la leçon — la carte n'est pas la donnée, c'en est une vue.
 */

const FAMILLES = ['Écoles', 'Commerces', 'Bureaux', 'Logements'];
const carres = [];
let n = 0;
for (let lig = 0; lig < 5; lig++) {
  for (let col = 0; col < 6; col++) {
    n++;
    // Valeurs étalées à dessein : la graduation doit avoir de quoi montrer ses
    // quatre classes, et chacune doit être peuplée.
    const valeur = Math.round(5 + (col / 5) * 95);
    const hauteur = 6 + lig * 11;
    carres.push(carre(col, lig, {
      nom: `Îlot ${String(n).padStart(2, '0')}`,
      famille: FAMILLES[(col + lig) % FAMILLES.length],
      valeur,
      hauteur_m: hauteur,
      // Un attribut daté, pour le filtre temporel — un trimestre par colonne.
      livraison: Date.UTC(2024 + Math.floor(col / 4), (col % 4) * 3, 15),
      // Deux îlots sans valeur : le guide s'en sert pour montrer ce que devient
      // une entité que la classification ne peut pas ranger.
      ...(n === 7 || n === 19 ? { valeur: null } : {}),
    }));
  }
}

/**
 * Posés dans les allées, au milieu de la grille — pas aux coins.
 *
 * Un lampadaire fait 8 m ; à l'échelle où la grille entière tient à l'écran, il
 * en occupe huit pixels et disparaît derrière les volumes. Aux coins, il sortait
 * en plus du champ. L'étape qui les annonce doit les montrer.
 */
const REPERES = [
  { nom: 'Le point de départ', type: 'Repère', c: [CENTRE[0] - PAS * 1.6, CENTRE[1] - PAS * 0.6] },
  { nom: 'Le point d’arrivée', type: 'Repère', c: [CENTRE[0] + PAS * 1.4, CENTRE[1] + PAS * 0.4] },
];

const ecrire = (nom, features) =>
  fs.writeFileSync(path.join(__dirname, nom), JSON.stringify({ type: 'FeatureCollection', features }));

ecrire('ilots.geojson', carres);
ecrire('reperes.geojson', REPERES.map((r) => ({
  type: 'Feature',
  properties: { nom: r.nom, type: r.type, _modelId: 'streetlamp' },
  geometry: { type: 'Point', coordinates: r.c },
})));

const bbox = [
  CENTRE[0] - PAS * 3.4, CENTRE[1] - PAS * 3,
  CENTRE[0] + PAS * 4, CENTRE[1] + PAS * 3.4,
];

/* ------------------------------------------------------------- symbologies -- */

const UNI = { kind: 'single', color: '#8aa4b8', opacity: 1 };
const PAR_FAMILLE = {
  kind: 'categorized',
  field: 'famille',
  stops: [
    { value: 'Écoles', color: '#c4453a', opacity: 1 },
    { value: 'Commerces', color: '#d99a2b', opacity: 1 },
    { value: 'Bureaux', color: '#3f7d8c', opacity: 1 },
    { value: 'Logements', color: '#6f9457', opacity: 1 },
  ],
  fallback: '#b9b2a7',
};
const PAR_VALEUR = {
  kind: 'graduated',
  field: 'valeur',
  stops: [
    { lower: 0, upper: 25, color: '#f2e6d4', opacity: 1 },
    { lower: 25, upper: 50, color: '#e0b877', opacity: 1 },
    { lower: 50, upper: 75, color: '#c17f4a', opacity: 1 },
    { lower: 75, upper: 100, color: '#8c4a2f', opacity: 1 },
  ],
  // Les deux îlots sans valeur tombent ici. Un gris franc, pour qu'on les
  // reconnaisse comme « non classés » et non comme une classe basse.
  fallback: '#9a938a',
};
const REPERE_STYLE = { kind: 'single', color: '#c9a227', opacity: 1 };

const COUCHES = { ilots: 'guide-ilots', reperes: 'guide-reperes' };

/* ------------------------------------------------------------------ récit -- */

const etat = (id, name, visible, extra = {}) => {
  const s = { id, name, sourceTable: null, visible, controls: [], controlDeclaratives: [], ...extra };
  for (const k of ['symbolization', 'declarative']) if (s[k] == null) delete s[k];
  return s;
};

const AMBIANCE = { labels: true, sky: true, basemap: 'positron', buildings3D: false };
const vue = (zoom, pitch, bearing) => ({ center: CENTRE, zoom, pitch, bearing });

/** Chaque étape : ce qu'on montre, et ce qu'on invite à faire. */
const etapes = [
  {
    id: 'g1',
    title: 'Bienvenue — ceci est un récit',
    description:
      'Ce guide est lui-même une scène Atlas : trente carrés, deux repères, et '
      + 'dix étapes décrites dans un fichier. Rien de ce que vous allez voir n’est '
      + 'codé en dur — tout est déclaré. ▶ pour avancer, ◀ pour revenir. '
      + '👉 Essayez déjà : faites glisser la carte, elle reste à vous pendant le récit.',
    state: {
      camera: vue(15.6, 0, 0), projection: 'mercator', timeOfDay: heure(12),
      terrain3D: false, shadows: false, ...AMBIANCE,
      layers: [etat(COUCHES.ilots, 'Îlots', true, { polygonMode: 'flat', declarative: UNI })],
    },
  },
  {
    id: 'g2',
    title: 'Une couleur, une catégorie',
    description:
      'Les mêmes trente carrés, lus autrement : la couleur suit maintenant leur '
      + 'famille. La donnée n’a pas changé — la carte n’est pas la donnée, c’en est '
      + 'une vue. 👉 Cliquez sur « Écoles » dans la légende : Atlas isole cette '
      + 'classe. Cliquez encore pour tout revoir.',
    state: {
      camera: vue(15.6, 0, 0), projection: 'mercator', timeOfDay: heure(12),
      terrain3D: false, shadows: false, ...AMBIANCE,
      layers: [etat(COUCHES.ilots, 'Îlots', true, { polygonMode: 'flat', declarative: PAR_FAMILLE })],
    },
  },
  {
    id: 'g3',
    title: 'Une couleur, une mesure — et ce qu’on ne sait pas',
    description:
      'Cette fois la couleur suit une valeur numérique, rangée en quatre classes '
      + 'aux bornes choisies. Regardez les deux carrés gris : leur valeur est vide. '
      + 'Ils ne sont pas « bas », ils sont **non classés** — une carte honnête '
      + 'distingue les deux. 👉 Comparez leur position avec l’étape précédente.',
    state: {
      camera: vue(15.6, 0, 0), projection: 'mercator', timeOfDay: heure(12),
      terrain3D: false, shadows: false, ...AMBIANCE,
      layers: [etat(COUCHES.ilots, 'Îlots', true, { polygonMode: 'flat', declarative: PAR_VALEUR })],
    },
  },
  {
    id: 'g4',
    title: 'Filtrer — la carte répond',
    description:
      'Deux pastilles sont apparues en haut à droite. 📊 filtre par valeur, 🏷️ par '
      + 'famille. 👉 Ouvrez 📊 et poussez la borne basse : les carrés pâles '
      + 'disparaissent. Le filtre ne modifie rien — il choisit ce qu’on regarde.',
    state: {
      camera: vue(15.6, 0, 0), projection: 'mercator', timeOfDay: heure(12),
      terrain3D: false, shadows: false, ...AMBIANCE,
      layers: [etat(COUCHES.ilots, 'Îlots', true, { polygonMode: 'flat', declarative: PAR_VALEUR })],
    },
  },
  {
    id: 'g5',
    title: 'Le volume — une seconde variable',
    description:
      'Les carrés se lèvent : la hauteur porte un attribut, la couleur en porte un '
      + 'autre. Deux informations sur un même objet, sans le dédoubler. 👉 Faites '
      + 'un clic droit glissé pour pivoter — le volume ne se lit qu’en tournant '
      + 'autour.',
    state: {
      camera: vue(15.9, 55, -25), projection: 'mercator', timeOfDay: heure(12),
      terrain3D: false, shadows: false, ...AMBIANCE,
      layers: [etat(COUCHES.ilots, 'Îlots', true, { polygonMode: 'extruded', declarative: PAR_VALEUR })],
    },
  },
  {
    id: 'g6',
    title: 'Le soleil est daté, les ombres aussi',
    description:
      'Même scène, 17 h 30, ombres portées. L’heure n’est pas un habillage : elle '
      + 'est calculée pour ce lieu et cette date. 👉 Avancez d’une étape pour voir '
      + 'la même vue au matin — l’ombre bascule de l’autre côté.',
    state: {
      camera: vue(15.9, 58, -25), projection: 'mercator', timeOfDay: heure(17.5),
      terrain3D: false, shadows: true, ...AMBIANCE,
      layers: [etat(COUCHES.ilots, 'Îlots', true, { polygonMode: 'extruded', declarative: PAR_VALEUR })],
    },
  },
  {
    id: 'g7',
    title: 'Neuf heures — la même scène, une autre lumière',
    description:
      'Rien n’a changé sauf l’heure. C’est ce qui permet d’étudier un '
      + 'ensoleillement, ou simplement de choisir le moment où une maquette se lit '
      + 'le mieux. 👉 Revenez en arrière et comparez les deux étapes.',
    state: {
      camera: vue(15.9, 58, -25), projection: 'mercator', timeOfDay: heure(9),
      terrain3D: false, shadows: true, ...AMBIANCE,
      layers: [etat(COUCHES.ilots, 'Îlots', true, { polygonMode: 'extruded', declarative: PAR_VALEUR })],
    },
  },
  {
    id: 'g8',
    title: 'Des objets, pas seulement des formes',
    description:
      'Deux repères viennent d’apparaître, rendus par un modèle 3D du catalogue '
      + 'embarqué. Une couche ponctuelle peut être un cercle, une icône, ou un '
      + 'objet posé au sol. 👉 Cliquez sur un îlot : sa fiche s’ouvre avec ses '
      + 'attributs.',
    state: {
      // On approche : le propos de l'étape est « des objets », pas « toute la
      // grille ». À z15,9 les repères tenaient dans le champ mais faisaient huit
      // pixels, masqués par les volumes — annoncés, invisibles.
      camera: vue(17.2, 55, 20), projection: 'mercator', timeOfDay: heure(15),
      terrain3D: false, shadows: true, ...AMBIANCE,
      layers: [
        // À PLAT, et c'est une décision de conception : une étape isole une
        // notion. Des repères de 17 m posés entre des blocs de 6 à 50 m, vus en
        // oblique, sont masqués — trois cadrages successifs n'y ont rien changé.
        // Le propos ici est « une couche ponctuelle peut être un objet », pas le
        // volume, qui a eu ses deux étapes.
        etat(COUCHES.ilots, 'Îlots', true, { polygonMode: 'flat', declarative: PAR_VALEUR }),
        etat(COUCHES.reperes, 'Repères', true, { declarative: REPERE_STYLE }),
      ],
    },
  },
  {
    id: 'g9',
    title: 'La Terre est ronde',
    description:
      'Atlas peut rendre en projection globe : en dézoomant, la carte devient une '
      + 'sphère. 👉 Dézoomez à la molette — la bascule se fait toute seule vers '
      + 'z12.',
    state: {
      camera: { center: CENTRE, zoom: 9, pitch: 30, bearing: 0 },
      projection: 'globe', timeOfDay: heure(14),
      terrain3D: false, shadows: false, ...AMBIANCE,
      layers: [etat(COUCHES.ilots, 'Îlots', true, { polygonMode: 'flat', declarative: PAR_FAMILLE })],
    },
  },
  {
    id: 'g10',
    title: 'Et maintenant, la vôtre',
    description:
      'Vous avez vu l’essentiel de ce qu’Atlas montre : symboliser, filtrer, '
      + 'lever en volume, éclairer, poser des objets, raconter. Tout cela tient '
      + 'dans un fichier de scène — celui de ce guide fait quelques kilo-octets. '
      + 'Dans un document Grist, ce sont vos tables qui deviennent ces couches.',
    state: {
      camera: vue(15.4, 25, 0), projection: 'mercator', timeOfDay: heure(13),
      terrain3D: false, shadows: false, ...AMBIANCE,
      layers: [
        etat(COUCHES.ilots, 'Îlots', true, { polygonMode: 'flat', declarative: PAR_FAMILLE }),
        etat(COUCHES.reperes, 'Repères', true, { declarative: REPERE_STYLE }),
      ],
    },
  },
];

/* -------------------------------------------------------------- manifeste -- */

const scene = {
  version: '0.2.2',
  title: 'Atlas — guide interactif',
  subtitle: 'Dix étapes pour prendre l’outil en main',
  layers: [
    {
      id: COUCHES.ilots,
      name: 'Îlots',
      order: 0,
      geometry_type: 'polygon',
      visible: true,
      visibility: { defaultVisible: true },
      height_field: 'hauteur_m',
      style: { polygonMode: 'flat', declarative: UNI },
      source: { type: 'geojson', classe: 'externe' },
      // INLINE, et c'est une décision de guide : servie par URL, la couche
      // afficherait « Écoles — » au lieu de « Écoles 8 », Atlas ne détenant pas
      // les entités pour les compter. Une étape qui invite à cliquer une classe
      // ne peut pas laisser son effectif dans le flou. 12 Ko.
      geojson: JSON.parse(fs.readFileSync(path.join(__dirname, 'ilots.geojson'), 'utf8')),
      bbox,
      featureCount: carres.length,
      crs: 'EPSG:4326',
      controls: [
        // Actifs : sans cela le lecteur ne les voit pas — seul un contrôle actif
        // devient une pastille, et le mode vitrine lui refuse le rail d'auteur.
        { field: 'valeur', type: 'range', label: 'Valeur', active: true, min: 0, max: 100, dataMin: 5, dataMax: 100 },
        { field: 'famille', type: 'select', label: 'Famille', active: true, values: FAMILLES },
      ],
      popup_template: '<b>{nom}</b><br>{famille} · valeur {valeur}<br>hauteur {hauteur_m} m',
      fields: [
        { name: 'nom', gType: 'Text' },
        { name: 'famille', gType: 'Text' },
        { name: 'valeur', gType: 'Numeric' },
        { name: 'hauteur_m', gType: 'Numeric' },
        { name: 'livraison', gType: 'Date' },
      ],
    },
    {
      id: COUCHES.reperes,
      name: 'Repères',
      order: 1,
      geometry_type: 'point',
      visible: false,
      visibility: { defaultVisible: false },
      // INLINE : les instances 3D se construisent en parcourant les entités.
      // Servie par URL, la couche s'afficherait dans la légende sans que rien
      // ne soit posé sur la carte.
      style: {
        mode: 'library',
        library: { modelId: 'streetlamp' },
        common: { scale: 2.2, rotationX: 0, rotationY: 0, rotationZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0 },
        declarative: REPERE_STYLE,
      },
      source: { type: 'geojson', classe: 'externe' },
      geojson: JSON.parse(fs.readFileSync(path.join(__dirname, 'reperes.geojson'), 'utf8')),
      bbox,
      featureCount: REPERES.length,
      crs: 'EPSG:4326',
      popup_template: '<b>{nom}</b><br>{type}',
      fields: [{ name: 'nom', gType: 'Text' }, { name: 'type', gType: 'Text' }],
    },
  ],
  story: { version: '0.2.1', steps: etapes },
  camera: etapes[0].state.camera,
};

fs.writeFileSync(path.join(__dirname, 'scene.json'), JSON.stringify(scene, null, 2));

console.log(JSON.stringify({
  ilots: carres.length,
  reperes: REPERES.length,
  etapes: etapes.length,
  poids_ko: Math.round(fs.statSync(path.join(__dirname, 'scene.json')).size / 1024),
}, null, 2));
