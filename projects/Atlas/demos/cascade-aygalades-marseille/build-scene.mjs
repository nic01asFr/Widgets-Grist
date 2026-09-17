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
  mobilier: 'aygalades-mobilier',
  arbres: 'aygalades-arbres-lidar',
};

const compte = (n) => lire(n).features.length;

/** Emprise d'une FeatureCollection de points. */
const bboxDe = (fc) => {
  const xs = fc.features.map((f) => f.geometry.coordinates[0]);
  const ys = fc.features.map((f) => f.geometry.coordinates[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

/** Orientation du relevé de la cascade, en degrés (`CASCADE_ROT` pour l'essayer sans rééditer). */
const ROTATION_CASCADE = Number(process.env.CASCADE_ROT ?? 0);
const N = {
  bati: compte('bati.geojson'),
  eau: compte('eau.geojson'),
  voirie: compte('voirie.geojson'),
  rail: compte('rail.geojson'),
  emprises: compte('emprises.geojson'),
  mobilier: compte('mobilier.geojson'),
  arbres: compte('arbres-lidar.geojson'),
};

/** Hauteurs mesurées des arbres LiDAR (`build-arbres-lidar.mjs`), relues et non recopiées. */
const ARBRES = (() => {
  const h = lire('arbres-lidar.geojson').features.map((f) => f.properties.hauteur_m);
  return { min: Math.round(Math.min(...h)), max: Math.round(Math.max(...h)) };
})();

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

/**
 * Ambiance commune : la photographie aérienne de l'IGN sur le relief LiDAR HD, à
 * l'échelle vraie.
 *
 * La première version posait tout sur `positron`, un fond clair et plat, relief
 * coupé sept étapes sur huit : le relevé de la cascade flottait sur une feuille
 * blanche, sans sol à sa mesure. Le réalisme ne vient pas du modèle, il vient de
 * ce qui l'entoure — un sol à 0,5 m et l'image de ce sol.
 *
 * `terrainSource` et `terrainExaggeration` sont déclarés à chaque étape : une
 * étape les capture désormais, et celle qui accentue le relief (7) ne doit pas
 * le laisser accentué pour la suivante.
 */
const AMBIANCE = {
  labels: false, sky: true, basemap: 'ortho-ign', buildings3D: false,
  terrain3D: true, terrainSource: 'ign', terrainExaggeration: 1,
};

/**
 * Le site de la cascade, mesuré dans le MNT LiDAR HD à 0,5 m.
 *
 * Profil radial autour du nœud OSM : 58,5 m en amont, 46,7 m au pied, la plus
 * forte pente orientée à 160° — vers le sud-sud-est. La caméra regarde donc
 * l'amont depuis l'aval.
 *
 * > **Le relevé photogrammétrique a été retiré du récit** (17/09/2026). Posé
 * > sur le sol LiDAR, il s'est révélé être un fragment de paroi sans échelle
 * > absolue : la moitié basse passait sous le terrain, et il ne soutenait pas
 * > la comparaison avec l'orthophotographie autour. Le fichier reste au dépôt
 * > (`_cascade-sketchfab.glb`, hors publication) ; un relevé propre viendra du
 * > chantier LiDAR.
 */
const CALAGE = { chute_m: '11,8', longueur_m: 6, aval_deg: 160 };
const CAMERA_CASCADE = { center: [5.36345, 43.35295], zoom: 18.1, pitch: 56, bearing: 345 };

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
  // Couleurs lisibles SUR la photographie : le bleu profond et le brun de la
  // version sur fond clair se perdaient dans la végétation et les toits.
  stops: [
    { value: 'à ciel ouvert', color: '#35c4f0', opacity: 1 },
    { value: 'busé', color: '#ff9f43', opacity: 0.95 },
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
    { value: 'Voie principale', color: '#f4efe6', opacity: 0.75 },
    { value: 'Desserte', color: '#8c8579', opacity: 0.6 },
  ],
  fallback: '#f4efe6',
};
/**
 * Voirie et rail sur la photographie : l'autoroute seule en couleur franche, les
 * dessertes dans une teinte proche de l'image (l'opacité par classe ne
 * s'applique pas aux lignes). Le gris plein de la version sur fond clair
 * couvrait l'image d'un filet, et le brun du rail s'y perdait.
 */
const RAIL = { kind: 'single', color: '#f2d16b', opacity: 0.95 };
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
        `Le quartier des Aygalades, 15ᵉ arrondissement, vu tel qu'il est : l'orthophotographie `
        + `de l'IGN posée sur le relief LiDAR HD, à l'échelle vraie. `
        + `Entre l'autoroute et le faisceau ferroviaire, rien ne signale encore qu'un `
        + `ruisseau traverse tout cela.`,
      state: {
        camera: { center: [5.3668, 43.3530], zoom: 14.3, pitch: 52, bearing: -28 },
        projection: 'mercator',
        timeOfDay: heure(14),
        shadows: false,
        ...AMBIANCE,
        layers: [
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
        + `Sur ${N.eau} tronçons cartographiés, ${eauBusee} sont busés — en orange. `
        + `Sur la photographie, le ruisseau à ciel ouvert se devine sous les arbres ; `
        + `le busé ne se voit pas du tout. C'est la donnée qui le dit, pas l'image.`,
      state: {
        camera: { center: [5.3648, 43.3538], zoom: 14.9, pitch: 38, bearing: -10 },
        projection: 'mercator',
        timeOfDay: heure(11),
        shadows: false,
        ...AMBIANCE,
        layers: [
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
        camera: { center: [5.3648, 43.3545], zoom: 14.6, pitch: 50, bearing: -18 },
        projection: 'mercator',
        timeOfDay: heure(15),
        shadows: false,
        ...AMBIANCE,
        layers: [
          etat(COUCHES.emprises, 'Emprises', true, { polygonMode: 'flat', declarative: EMPRISES }),
          etat(COUCHES.rail, 'Voies ferrées', true, { declarative: RAIL }),
          etat(COUCHES.voirie, 'Voirie', true, { declarative: VOIRIE }),
          etat(COUCHES.eau, 'Ruisseau et canal', true, { declarative: EAU_COUVERT }),
        ],
      },
    },
    {
      id: 'aygalades-4',
      title: 'Le bâti en volume — et ce qu’on en sait vraiment',
      description:
        `Bâti extrudé sur le relief, gradué par hauteur. Attention à ce que montre cette `
        + `carte : ${batiOsm} bâtiments sur ${N.bati.toLocaleString('fr-FR')} portent une hauteur dans `
        + `OSM, soit ${Math.round((batiOsm / N.bati) * 100)} %. Les autres sont dessinés à 9 m par `
        + `défaut. La classe la plus claire est donc surtout une classe d'ignorance.`,
      state: {
        camera: { center: [5.3639, 43.3536], zoom: 15.8, pitch: 60, bearing: -24 },
        projection: 'mercator',
        timeOfDay: heure(16),
        shadows: true,
        ...AMBIANCE,
        layers: [
          etat(COUCHES.bati, 'Bâti', true, { polygonMode: 'extruded', declarative: BATI_HAUTEUR }),
          etat(COUCHES.eau, 'Ruisseau et canal', true, { declarative: EAU_COUVERT }),
        ],
      },
    },
    {
      id: 'aygalades-5',
      title: 'La cascade',
      description:
        `Le ruisseau refait surface ici, dans un ravin boisé cerné d'entrepôts. `
        + `Le MNT LiDAR y mesure une chute de ${CALAGE.chute_m} m sur ${CALAGE.longueur_m} m, `
        + `vers le sud-sud-est. Les ${N.arbres} arbres sont relevés dans le même LiDAR : `
        + `hauteur mesurée (${ARBRES.min} à ${ARBRES.max} m), forme générique. La cascade `
        + `elle-même n'est pas modélisée — voir la note du dépôt.`,
      state: {
        camera: CAMERA_CASCADE,
        projection: 'mercator',
        timeOfDay: heure(17.5),
        shadows: true,
        ...AMBIANCE,
        layers: [
          etat(COUCHES.arbres, 'Arbres (LiDAR HD)', true),
          etat(COUCHES.eau, 'Ruisseau et canal', true, { declarative: EAU_COUVERT }),
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
        // Cadré sur l'alignement d'arbres et de lampadaires le plus dense de
        // l'extraction — ailleurs, 374 objets répartis sur 2 km ne se voient pas.
        camera: { center: [5.35886, 43.35555], zoom: 18.6, pitch: 62, bearing: -30 },
        projection: 'mercator',
        timeOfDay: heure(17),
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
        `Relief exagéré deux fois : les Aygalades sont un vallon, et c'est ce qui explique `
        + `le tracé du ruisseau comme celui de l'autoroute. Le bâti reste en volume — `
        + `MapLibre pose chaque bâtiment sur son sol, sommet par sommet. Les étapes `
        + `précédentes montraient le relief à l'échelle vraie ; celle-ci l'accentue, et le dit.`,
      state: {
        camera: { center: [5.3652, 43.3524], zoom: 14.9, pitch: 70, bearing: 42 },
        projection: 'mercator',
        timeOfDay: heure(9),
        shadows: false,
        ...AMBIANCE,
        terrainExaggeration: 2,
        layers: [
          etat(COUCHES.bati, 'Bâti', true, { polygonMode: 'extruded', declarative: BATI_HAUTEUR }),
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
        camera: { center: [5.3655, 43.3548], zoom: 14.5, pitch: 45, bearing: 0 },
        projection: 'mercator',
        timeOfDay: heure(18.5),
        shadows: false,
        ...AMBIANCE,
        layers: [
          etat(COUCHES.emprises, 'Emprises', true, { polygonMode: 'flat', declarative: EMPRISES }),
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
    attribution: '© OpenStreetMap contributors (ODbL) · orthophotographie et LiDAR HD : IGN',
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
      id: COUCHES.arbres,
      name: 'Arbres (LiDAR HD)',
      order: 6,
      geometry_type: 'point',
      visible: false,
      // Masquée à l'ouverture comme le mobilier : ces modèles n'ont de sens
      // qu'à l'échelle du vallon boisé.
      visibility: { defaultVisible: false, minZoom: 16 },
      style: {
        mode: 'library',
        // Chaque entité porte `_modelId`, `_scale` (hauteur mesurée / 5,9 m) et
        // `_rotationZ` ; ceci n'est que le repli.
        library: { modelId: 'tree_deciduous' },
        common: { scale: 1, rotationX: 0, rotationY: 0, rotationZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0 },
        declarative: { kind: 'single', color: '#5b8c4a', opacity: 1 },
      },
      source: { type: 'geojson', classe: 'externe' },
      // INLINE, pour la même raison que le mobilier : les instances 3D exigent
      // qu'Atlas détienne les entités.
      geojson: lire('arbres-lidar.geojson'),
      bbox: bboxDe(lire('arbres-lidar.geojson')),
      featureCount: N.arbres,
      crs: 'EPSG:4326',
      controls: [
        { field: 'hauteur_m', type: 'range', label: 'Hauteur des arbres (m)', active: false,
          min: ARBRES.min, max: ARBRES.max, dataMin: ARBRES.min, dataMax: ARBRES.max },
      ],
      popup_template: '<b>Arbre</b> — {hauteur_m} m<br><small>{source}</small>',
      fields: [
        { name: 'hauteur_m', gType: 'Numeric' },
        { name: 'source', gType: 'Text' },
      ],
    },
  ],
  // L'ambiance d'ouverture, avant que le récit ne prenne la main : sans elle,
  // la scène s'ouvre sur le fond par défaut et bascule à la première étape.
  settings: { ...AMBIANCE, timeOfDay: heure(14), shadows: false },
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
