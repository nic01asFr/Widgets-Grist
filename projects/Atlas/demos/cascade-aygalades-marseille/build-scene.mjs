/**
 * Écrit le Scene Manifest 0.2.2 et le récit de la démo Aygalades.
 *
 * Séparé de `build-from-overpass.mjs` parce que les deux ne changent pas au même
 * rythme : l'extraction OSM se rejoue quand la donnée bouge, la mise en scène se
 * retouche à chaque relecture du récit. Les mêler obligerait à réinterroger
 * Overpass pour corriger une phrase.
 *
 * Les comptes ne sont pas écrits à la main : ils sont relus dans les GeoJSON
 * produits. Un `featureCount` recopié devient faux à la première réextraction,
 * et rien ne le signale — Atlas affiche alors « ≈2820 » sur une couche qui n'en
 * a plus autant.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lire = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, n), 'utf8'));

const { bbox, cascade } = lire('_bbox.json');

const COUCHES = {
  bati: 'aygalades-bati',
  eau: 'aygalades-eau',
  voirie: 'aygalades-voirie',
  rail: 'aygalades-rail',
  emprises: 'aygalades-emprises',
  cascade: 'aygalades-cascade-3d',
  mobilier: 'aygalades-mobilier',
};

const compte = (n) => lire(n).features.length;
const N = {
  bati: compte('bati.geojson'),
  eau: compte('eau.geojson'),
  voirie: compte('voirie.geojson'),
  rail: compte('rail.geojson'),
  emprises: compte('emprises.geojson'),
  mobilier: compte('mobilier.geojson'),
};

const batiOsm = lire('bati.geojson').features
  .filter((f) => f.properties.height_source === 'osm').length;
const mobilierParType = lire('mobilier.geojson').features
  .reduce((a, f) => { a[f.properties.type] = (a[f.properties.type] || 0) + 1; return a; }, {});

const eauBusee = lire('eau.geojson').features
  .filter((f) => f.properties.couvert === 'busé').length;

/* ------------------------------------------------------------------ récit --
 * Une étape décrit l'état COMPLET de la scène : les couches qu'elle ne cite pas
 * sont masquées. C'est ce qui permet de faire disparaître le bâti pour ne
 * laisser que l'eau — et c'est aussi pourquoi chaque étape doit citer tout ce
 * qu'elle veut voir, y compris ce qui était déjà là.
 */

/**
 * `timeOfDay` se compte en MINUTES depuis minuit, pas en heures (app_v7.js:186).
 * Ecrire 14 pour « 14 h » donne 00:14 — la scene s'ouvre de nuit, et rien ne le
 * signale sinon l'ambiance sombre, qu'on met sur le compte du fond de carte.
 */
const heure = (h) => Math.round(h * 60);

/** Ambiance commune : ce qu'une etape ne declare pas, elle herite de la precedente. */
const AMBIANCE = { labels: true, sky: true, basemap: 'positron', buildings3D: false };

const etat = (id, name, visible, extra = {}) => {
  // `symbolization: null` et `declarative: null` sont REFUSES par le schema
  // 0.2.2 : il attend un objet, ou rien. Une cle absente et une cle a null se
  // ressemblent a la lecture, mais le validateur les separe — et la demo
  // Vieux-Port, qui les emet, sort avec 24 ecarts.
  const s = { id, name, sourceTable: null, visible, controls: [], controlDeclaratives: [], ...extra };
  for (const k of ['symbolization', 'declarative']) if (s[k] == null) delete s[k];
  return s;
};

/** Le fil de l'eau : busé contre à ciel ouvert. Le sujet du site, en deux couleurs. */
const EAU_COUVERT = {
  kind: 'categorized',
  field: 'couvert',
  stops: [
    { value: 'à ciel ouvert', color: '#2e8fc4', opacity: 1 },
    { value: 'busé', color: '#8a6a4f', opacity: 0.75 },
  ],
  fallback: '#6b7b8c',
};

/** Hauteurs du bâti — bornes explicites : l'étalement min/max verserait tout dans la première classe. */
/**
 * Hauteurs du bâti — bornes explicites, et **opacité 1**.
 *
 * Sous 1, MapLibre bascule `fill-extrusion` en rendu transparent : il cesse
 * d'écrire la profondeur, chaque bloc laisse voir sa face arrière au travers de
 * sa face avant, et deux couches extrudées se traversent au lieu de se masquer.
 * Le basculement est binaire — mesuré, 0,95 suffit à le déclencher. Ces stops
 * portaient 0,9 à 0,95 : la démo montrait l'artefact qu'elle aurait dû éviter.
 */
const BATI_HAUTEUR = {
  kind: 'graduated',
  field: 'height_m',
  stops: [
    { lower: 0, upper: 9, color: '#e8dcc8', opacity: 1 },
    { lower: 9, upper: 15, color: '#d4b483', opacity: 1 },
    { lower: 15, upper: 25, color: '#c17f4a', opacity: 1 },
    { lower: 25, upper: 200, color: '#8c4a2f', opacity: 1 },
  ],
  fallback: '#cfc7bb',
};

const BATI_UNI = { kind: 'single', color: '#cabfae', opacity: 1 };
const VOIRIE = {
  kind: 'categorized',
  field: 'rang',
  stops: [
    { value: 'Autoroute', color: '#c4453a', opacity: 0.95 },
    { value: 'Voie principale', color: '#7a8290', opacity: 0.85 },
    { value: 'Desserte', color: '#9aa2ad', opacity: 0.6 },
  ],
  fallback: '#9aa2ad',
};
const RAIL = { kind: 'single', color: '#4a4038', opacity: 0.9 };
const MOBILIER = {
  kind: 'categorized',
  field: 'type',
  stops: [
    { value: 'Arbre', color: '#5b8c4a', opacity: 1 },
    { value: 'Lampadaire', color: '#c9a227', opacity: 1 },
    { value: 'Banc', color: '#a0724a', opacity: 1 },
    { value: 'Arrêt de bus', color: '#4a7fa0', opacity: 1 },
  ],
  fallback: '#8a8478',
};
const EMPRISES = {
  kind: 'categorized',
  field: 'usage',
  stops: [
    { value: 'Activité', color: '#b08968', opacity: 0.5 },
    { value: 'Ferroviaire', color: '#7d7466', opacity: 0.45 },
    { value: 'Espace vert', color: '#6f9457', opacity: 0.5 },
  ],
  fallback: '#a8a29a',
};

const story = {
  version: '0.2.1',
  steps: [
    {
      id: 'aygalades-1',
      title: 'Un vallon au nord de Marseille',
      description:
        `Le quartier des Aygalades, 15ᵉ arrondissement. ${N.bati.toLocaleString('fr-FR')} bâtiments `
        + `extraits d'OpenStreetMap, entre l'autoroute et le faisceau ferroviaire. `
        + `Rien ici ne signale encore qu'un ruisseau traverse tout cela.`,
      state: {
        camera: { center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2], zoom: 13.6, pitch: 0, bearing: 0 },
        projection: 'mercator',
        timeOfDay: heure(14),
        terrain3D: false,
        shadows: false,
        ...AMBIANCE,
        layers: [
          etat(COUCHES.bati, 'Bâti', true, { polygonMode: 'flat', declarative: BATI_UNI }),
          etat(COUCHES.voirie, 'Voirie', true, { declarative: VOIRIE }),
          etat(COUCHES.rail, 'Voies ferrées', true, { declarative: RAIL }),
        ],
      },
    },
    {
      id: 'aygalades-2',
      title: 'Le ruisseau, et là où il disparaît',
      description:
        `Le ruisseau des Aygalades et la sous-dérivation du canal de Marseille. `
        + `Sur ${N.eau} tronçons cartographiés, ${eauBusee} sont busés — en brun. `
        + `Un cours d'eau busé n'est pas absent : il est invisible, et c'est la donnée `
        + `qui le dit, pas la carte qui le devine.`,
      state: {
        camera: { center: [5.3648, 43.3540], zoom: 14.4, pitch: 0, bearing: 0 },
        projection: 'mercator',
        timeOfDay: heure(11),
        terrain3D: false,
        shadows: false,
        ...AMBIANCE,
        layers: [
          etat(COUCHES.bati, 'Bâti', true, { polygonMode: 'flat', declarative: { kind: 'single', color: '#ded7cb', opacity: 0.4 } }),
          etat(COUCHES.eau, 'Ruisseau et canal', true, { declarative: EAU_COUVERT }),
        ],
      },
    },
    {
      id: 'aygalades-3',
      title: 'Ce qui est passé par-dessus',
      description:
        `Emprises d'activité, faisceau ferroviaire, autoroute A7. La Savonnerie du Midi `
        + `et Artizanord occupent le fond de vallon ; deux lignes ferroviaires et une `
        + `autoroute le franchissent. Le ruisseau reste affiché : il passe dessous.`,
      state: {
        camera: { center: [5.3648, 43.3545], zoom: 14.2, pitch: 42, bearing: -18 },
        projection: 'mercator',
        timeOfDay: heure(15),
        terrain3D: false,
        shadows: false,
        ...AMBIANCE,
        layers: [
          etat(COUCHES.emprises, 'Emprises', true, { polygonMode: 'flat', declarative: EMPRISES }),
          etat(COUCHES.bati, 'Bâti', true, { polygonMode: 'flat', declarative: { kind: 'single', color: '#ded7cb', opacity: 0.45 } }),
          etat(COUCHES.rail, 'Voies ferrées', true, { declarative: RAIL }),
          etat(COUCHES.voirie, 'Voirie', true, { declarative: VOIRIE }),
          etat(COUCHES.eau, 'Ruisseau et canal', true, { declarative: EAU_COUVERT }),
        ],
      },
    },
    {
      id: 'aygalades-4',
      title: 'Le bâti en volume — et ce qu\'on en sait vraiment',
      description:
        `Bâti extrudé, gradué par hauteur. Attention à ce que montre cette carte : `
        + `${batiOsm} bâtiments sur ${N.bati.toLocaleString('fr-FR')} portent une hauteur dans OSM, soit `
        + `${Math.round((batiOsm / N.bati) * 100)} %. Les autres sont dessinés à 9 m par défaut. `
        + `La classe la plus claire est donc surtout une classe d'ignorance.`,
      state: {
        camera: { center: [5.3639, 43.3536], zoom: 15.6, pitch: 58, bearing: -24 },
        projection: 'mercator',
        timeOfDay: heure(16),
        terrain3D: false,
        shadows: true,
        ...AMBIANCE,
        layers: [
          etat(COUCHES.bati, 'Bâti', true, { polygonMode: 'extruded', declarative: BATI_HAUTEUR }),
          etat(COUCHES.voirie, 'Voirie', true, { declarative: VOIRIE }),
          etat(COUCHES.eau, 'Ruisseau et canal', true, { declarative: EAU_COUVERT }),
        ],
      },
    },
    {
      id: 'aygalades-5',
      title: 'La cascade',
      description:
        `Relevé photogrammétrique de la cascade, posé à ses coordonnées réelles `
        + `(nœud OSM 789366740). Soleil de fin d'après-midi : le modèle reçoit `
        + `l'éclairage et projette son ombre, comme le bâti autour de lui.`,
      state: {
        // Cadrage regle a l'ecran : a z18.4 le releve tient dans une poignee de
        // pixels, et le bati voisin (10 m au nord) le masque aux azimuts est.
        camera: { center: cascade, zoom: 19.3, pitch: 56, bearing: 250 },
        projection: 'mercator',
        timeOfDay: heure(17.5),
        terrain3D: false,
        shadows: true,
        ...AMBIANCE,
        layers: [
          etat(COUCHES.bati, 'Bâti', true, { polygonMode: 'extruded', declarative: BATI_UNI }),
          etat(COUCHES.eau, 'Ruisseau et canal', true, { declarative: EAU_COUVERT }),
          etat(COUCHES.cascade, 'Cascade (relevé 3D)', true),
        ],
      },
    },
    {
      id: 'aygalades-6',
      title: 'Le catalogue, posé sur de vraies données',
      description:
        `${N.mobilier} objets de mobilier relevés dans OSM — `
        + `${mobilierParType['Lampadaire'] || 0} lampadaires, ${mobilierParType['Arbre'] || 0} arbres, `
        + `${mobilierParType['Banc'] || 0} bancs, ${mobilierParType['Arrêt de bus'] || 0} arrêts de bus. `
        + `Chacun choisit son modèle dans le catalogue embarqué d'Atlas : une seule `
        + `couche, quatre modèles, décidés par la donnée et non par la couche.`,
      state: {
        camera: { center: [5.3639, 43.3534], zoom: 18.3, pitch: 62, bearing: -30 },
        projection: 'mercator',
        timeOfDay: heure(17),
        terrain3D: false,
        shadows: true,
        ...AMBIANCE,
        layers: [
          etat(COUCHES.bati, 'Bâti', true, { polygonMode: 'extruded', declarative: BATI_UNI }),
          etat(COUCHES.voirie, 'Voirie', true, { declarative: VOIRIE }),
          etat(COUCHES.eau, 'Ruisseau et canal', true, { declarative: EAU_COUVERT }),
          etat(COUCHES.mobilier, 'Mobilier urbain', true, { declarative: MOBILIER }),
        ],
      },
    },
    {
      id: 'aygalades-7',
      title: 'Le vallon a une forme',
      description:
        `Relief activé : les Aygalades sont un vallon, et c'est ce qui explique le `
        + `tracé du ruisseau comme celui de l'autoroute. Le bâti est ici posé à plat : `
        + `MapLibre le drape sur le terrain, entité par entité. En volume il aurait `
        + `fallu une altitude par bâtiment — Atlas ne détient pas ces entités, il `
        + `n'en connaît qu'une pour toute la couche, et le relief varie de 220 m sur `
        + `cette emprise.`,
      state: {
        camera: { center: [5.3652, 43.3524], zoom: 15, pitch: 68, bearing: 42 },
        projection: 'mercator',
        timeOfDay: heure(9),
        terrain3D: true,
        shadows: false,
        ...AMBIANCE,
        layers: [
          // A PLAT, et c'est le sujet de l'etape : une surface drapee suit le sol
          // par construction. En volume, `fill-extrusion-base` se compte depuis le
          // niveau de la mer, et Atlas ne peut poser qu'UNE altitude pour toute une
          // couche dont il ne detient pas les entites (`solConstantDeCouche`).
          // Mesure sur ce vallon : sol reel de 53 a 273 m, altitude posee 136,9 m —
          // le bati flotte de 57 m a la cascade et s'enfonce de 148 m sur le coteau
          // est. Une nappe plate suspendue au-dessus d'un terrain qui, lui, ondule.
          etat(COUCHES.bati, 'Bâti', true, { polygonMode: 'flat', declarative: BATI_HAUTEUR }),
          etat(COUCHES.emprises, 'Emprises', true, { polygonMode: 'flat', declarative: EMPRISES }),
          etat(COUCHES.eau, 'Ruisseau et canal', true, { declarative: EAU_COUVERT }),
          etat(COUCHES.voirie, 'Voirie', true, { declarative: VOIRIE }),
        ],
      },
    },
    {
      id: 'aygalades-8',
      title: 'Ce qui reste ouvert',
      description:
        `Les espaces verts déjà là — parcs Brégante, de l'Oasis, Varella — et le fond `
        + `de vallon industriel, emprise du futur parc des Aygalades. La carte ne dit `
        + `pas ce qui va advenir ; elle dit ce qu'il y a, et où il y a de la place.`,
      state: {
        camera: { center: [5.3655, 43.3548], zoom: 14, pitch: 30, bearing: 0 },
        projection: 'mercator',
        timeOfDay: heure(18.5),
        terrain3D: false,
        shadows: false,
        ...AMBIANCE,
        layers: [
          etat(COUCHES.emprises, 'Emprises', true, { polygonMode: 'flat', declarative: EMPRISES }),
          etat(COUCHES.bati, 'Bâti', true, { polygonMode: 'flat', declarative: { kind: 'single', color: '#ded7cb', opacity: 0.5 } }),
          etat(COUCHES.eau, 'Ruisseau et canal', true, { declarative: EAU_COUVERT }),
        ],
      },
    },
  ],
};

/* --------------------------------------------------------------- manifeste */

const geo = (id, name, order, type, geojson, n, decl, extra = {}) => ({
  id,
  name,
  order,
  geometry_type: type,
  visible: extra.visible !== false,
  // Explicite et non deduit : sans `defaultVisible`, Atlas masque d'office toute
  // couche de plus de 2 500 entites (`isBasemapLayer`) — le bati disparaitrait.
  visibility: { defaultVisible: extra.visible !== false },
  style: { ...(extra.polygonMode ? { polygonMode: extra.polygonMode } : {}), declarative: decl },
  source: { type: 'geojson', classe: 'externe' },
  geojson,
  bbox,
  featureCount: n,
  crs: 'EPSG:4326',
  ...(extra.height_field ? { height_field: extra.height_field } : {}),
  ...(extra.fields ? { fields: extra.fields } : {}),
  ...(extra.controls ? { controls: extra.controls } : {}),
  // Le gabarit est rendu COMME DU TEXTE quand la scene vient d'une adresse :
  // les valeurs sont echappees, le gabarit ne l'est pas, et une scene chargee
  // par URL n'est pas de confiance. Il n'y a donc rien d'executable ici.
  ...(extra.popup ? { popup_template: extra.popup } : {}),
});

const scene = {
  version: '0.2.2',
  // `title` est la cle NORMATIVE du contrat 0.2.2, et la seule qu'Atlas lise
  // (scene-loader.js:606). `project_name` n'est pas au schema : une scene qui
  // ne porte que lui s'affiche « Import QGIS », le libelle de repli — un nom
  // plausible, donc qu'on ne songe pas a mettre en doute.
  title: 'Cascade des Aygalades — Marseille 15ᵉ',
  subtitle: 'Un ruisseau busé, une friche, et ce qui refait surface',
  project_name: 'Cascade des Aygalades — Marseille 15ᵉ',
  provenance: {
    producer: 'atlas-demo/overpass',
    attribution: '© OpenStreetMap contributors (ODbL) · modèle 3D : M.Dailly (CC BY 4.0)',
    extracted_at: new Date().toISOString(),
    bbox,
  },
  layers: [
    geo(COUCHES.emprises, 'Emprises', 0, 'polygon', './emprises.geojson', N.emprises, EMPRISES, {
      polygonMode: 'flat',
      controls: [
        { field: 'usage', type: 'select', label: 'Usage du sol', active: false,
          values: ['Activité', 'Ferroviaire', 'Espace vert'] },
      ],
      popup: '<b>{name}</b><br>{usage} — {detail}',
      fields: [
        { name: 'name', gType: 'Text' },
        { name: 'usage', gType: 'Text' },
        { name: 'detail', gType: 'Text' },
      ],
    }),
    geo(COUCHES.bati, 'Bâti', 1, 'polygon', './bati.geojson', N.bati, BATI_UNI, {
      polygonMode: 'flat',
      height_field: 'height_m',
      controls: [
        // `dataMin`/`dataMax` sont les bornes OBSERVEES : Atlas ne detient pas
        // les entites d'une couche servie par URL, il ne peut pas les mesurer.
        // Sans elles, le curseur s'ouvrirait de 0 a 1.
        // `active: true` : seuls les controles actifs deviennent des pastilles
        // manipulables (app_v7.js, listDockPills). A `false` — le defaut du
        // schema, « un controle propose n'est pas un controle applique » — le
        // lecteur d'une scene publiee ne les voit jamais, puisque le mode
        // vitrine lui refuse aussi le rail d'auteur. Les bornes couvrent toute
        // la plage : le filtre est donc visible sans rien retrancher tant qu'on
        // n'y touche pas.
        { field: 'height_m', type: 'range', label: 'Hauteur (m)', active: true,
          min: 3, max: 71, dataMin: 3.2, dataMax: 70.4 },
        { field: 'height_source', type: 'select', label: 'Origine de la hauteur',
          active: false, values: ['osm', 'defaut'] },
      ],
      popup: '<b>{name}</b><br>Hauteur : {height_m} m ({height_source})<br><small>OSM {osm_id}</small>',
      fields: [
        { name: 'name', gType: 'Text' },
        { name: 'building', gType: 'Text' },
        { name: 'height_m', gType: 'Numeric' },
        { name: 'height_source', gType: 'Text' },
        { name: 'levels', gType: 'Text' },
      ],
    }),
    geo(COUCHES.rail, 'Voies ferrées', 2, 'line', './rail.geojson', N.rail, RAIL, {
      fields: [{ name: 'name', gType: 'Text' }, { name: 'railway', gType: 'Text' }],
    }),
    geo(COUCHES.voirie, 'Voirie', 3, 'line', './voirie.geojson', N.voirie, VOIRIE, {
      fields: [
        { name: 'name', gType: 'Text' },
        { name: 'highway', gType: 'Text' },
        { name: 'rang', gType: 'Text' },
      ],
    }),
    geo(COUCHES.eau, 'Ruisseau et canal', 4, 'line', './eau.geojson', N.eau, EAU_COUVERT, {
      controls: [
        { field: 'couvert', type: 'select', label: 'Tracé', active: true,
          values: ['à ciel ouvert', 'busé'] },
      ],
      popup: '<b>{name}</b><br>{nature} — {couvert}<br><small>OSM {osm_id}</small>',
      fields: [
        { name: 'name', gType: 'Text' },
        { name: 'nature', gType: 'Text' },
        { name: 'couvert', gType: 'Text' },
      ],
    }),
    {
      id: COUCHES.mobilier,
      name: 'Mobilier urbain',
      order: 5,
      geometry_type: 'point',
      visible: false,
      // Masquee a l'ouverture : 374 modeles 3D instancies n'ont aucun sens en
      // vue d'ensemble, ou chacun mesure moins d'un pixel. Le recit l'allume au
      // moment ou l'echelle le permet.
      visibility: { defaultVisible: false, minZoom: 16 },
      style: {
        // `library` : les modeles viennent du catalogue embarque d'Atlas, pas
        // d'un fichier livre avec la scene. `modelId` ici n'est qu'un REPLI —
        // chaque entite porte le sien dans `_modelId`, lu en priorite.
        mode: 'library',
        library: { modelId: 'streetlamp' },
        common: { scale: 1, rotationX: 0, rotationY: 0, rotationZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0 },
        declarative: MOBILIER,
      },
      source: { type: 'geojson', classe: 'externe' },
      // INLINE, et ce n'est pas un detail de poids : les instances 3D sont
      // construites en iterant `filteredGeoJSON(layer).features` et en lisant
      // `feature.geometry.coordinates` (app_v7.js). Sur une couche servie par
      // URL, Atlas ne detient pas les entites — MapLibre les a, lui, mais Atlas
      // n'y accede pas — donc la liste est vide et RIEN n'est instancie. La
      // couche s'affiche dans la legende, avec son compte declare, et la carte
      // reste nue : un echec parfaitement silencieux. 76 Ko dans le manifeste.
      geojson: lire('mobilier.geojson'),
      bbox,
      featureCount: N.mobilier,
      crs: 'EPSG:4326',
      controls: [
        { field: 'type', type: 'select', label: 'Type de mobilier', active: false,
          values: ['Arbre', 'Lampadaire', 'Banc', 'Arrêt de bus'] },
      ],
      popup_template: '<b>{type}</b><br>{name}<br><small>OSM {osm_id}</small>',
      fields: [
        { name: 'type', gType: 'Text' },
        { name: 'name', gType: 'Text' },
        { name: 'osm_id', gType: 'Text' },
      ],
    },
    {
      id: COUCHES.cascade,
      name: 'Cascade (relevé 3D)',
      order: 6,
      geometry_type: 'point',
      visible: true,
      visibility: { defaultVisible: true },
      gltf_url: './cascade.glb',
      style: {
        mode: 'custom',
        custom: { url: './cascade.glb', filename: 'cascade.glb' },
        // L'echelle du releve est arbitraire (photogrammetrie Metashape sans
        // point de reference) : 1 unite glTF n'est pas 1 metre. Le facteur est
        // regle a l'oeil sur la cascade reelle, ~10 m de haut.
        common: { scale: 1.8, rotationX: 0, rotationY: 0, rotationZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0 },
        declarative: { kind: 'single', color: '#8fa8b5', opacity: 1 },
      },
      source: { type: 'geojson', classe: 'externe' },
      geojson: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {
            name: 'Cascade des Aygalades',
            osm_id: 'node/789366740',
            releve: 'photogrammétrie (Agisoft Metashape)',
            auteur: 'M.Dailly',
            licence: 'CC BY 4.0',
            source_modele: 'https://sketchfab.com/3d-models/la-cascade-820f7441157546949d07e3ce52b2287a',
          },
          geometry: { type: 'Point', coordinates: cascade },
        }],
      },
      bbox: [cascade[0], cascade[1], cascade[0], cascade[1]],
      featureCount: 1,
      crs: 'EPSG:4326',
      fields: [
        { name: 'name', gType: 'Text' },
        { name: 'releve', gType: 'Text' },
        { name: 'auteur', gType: 'Text' },
        { name: 'licence', gType: 'Text' },
      ],
    },
  ],
  story,
  camera: story.steps[0].state.camera,
};

fs.writeFileSync(path.join(__dirname, 'scene.json'), JSON.stringify(scene, null, 2));

console.log(JSON.stringify({
  couches: scene.layers.length,
  etapes: story.steps.length,
  comptes: N,
  batiAvecHauteurOsm: batiOsm,
  eauBusee,
  scene: 'scene.json',
}, null, 2));
