/**
 * Atlas se décrit lui-même : `decrire()` rend, en un objet JSON, tout ce qu'une personne ou un agent doit savoir pour intégrer la carte sans lire le code.
 *
 * Les listes (commandes, nombre et type des arguments, événements, capacités, version du contrat) sont LUES dans `pont.js` : elles ne peuvent pas
 * diverger du contrat qui s'exécute. Seuls les textes d'explication sont écrits ici ; un test échoue si une commande ou un événement du pont n'y est
 * pas expliqué, ou l'inverse.
 *
 * Aucune commande n'est ajoutée au contrat pour cela (le client en un fichier reste identique) : on lit la description par
 * `import { decrire } from '.../lib/bi/describe.js'` ou par `await AtlasBi.decrire()` (l'élément `<atlas-bi>`, qui ne charge ce module qu'à la demande), sans iframe ni connexion.
 */
import { VERSION, VERSIONS_ACCEPTEES, COMMANDES, COMMANDES_0_3, CAPACITES, CAPACITE_DE_COMMANDE, BATCH_MAX } from './pont.js';
import { TOUS_LES_EVENEMENTS as EVENEMENTS } from './evenements-ext.js';
import { LIMITE_OCTETS, DECLARATIFS } from './declaratif.js';

/** Ce que fait chaque commande, et ce qu'elle rend. */
export const TEXTES_COMMANDES = Object.freeze({
  ping: ['Version négociée, couches montées, capacités et paquet hors ligne.', '{ version, couches, capacites, paquet }'],
  setScene: ['Monte une scène : couches, contrôles, temps. Remplace la scène précédente. Une couche refusée ne bloque pas les autres.', '{ idCouche: nombreDEntites, _erreurs?, _avertissements? }'],
  setLayerVisibility: ['Montre ou cache une couche.', 'true'],
  setFilter: ['Pose l\'état COMPLET d\'un contrôle (select : liste de valeurs ; range et time : { min, max } ; text : { texte } ; null : retire le filtre).', '{ layer, compte, total }'],
  setTime: ['Pose la valeur du temps de la scène.', '{ valeur }'],
  play: ['Lance la lecture du temps ({ parSeconde, boucle }).', 'true'],
  pause: ['Arrête la lecture du temps.', 'true'],
  select: ['Sélectionne une entité par son identifiant : un entier pour une couche de l\'hôte, le code en TEXTE pour une unité administrative (null : désélectionne).', 'l\'identifiant'],
  highlight: ['Met en évidence une liste d\'identifiants.', 'true'],
  flyTo: ['Déplace la caméra ({ center, zoom, pitch, bearing, padding, duration }).', 'true'],
  fitTo: ['Cadre une couche (identifiant de couche), une liste d\'identifiants d\'entités, ou tout (sans argument).', 'true si quelque chose est cadré'],
  setTheme: ['Applique une charte graphique ou des jetons de thème ; s\'ajoute à ce qui est déjà posé ({ remplacer: true } pour repartir de zéro).', '{ version, entree, applique, derive, ignore, avertissements, a11y }'],
  getTheme: ['La charte résolue, ce que l\'hôte a donné, ce qui a été dérivé ou écarté, les avertissements chiffrés.', 'objet'],
  setVisual: ['Change le rendu d\'une couche (cercles, proportionnel, grille, hex, etats, heat) et son style.', 'true'],
  updateFeature: ['Modifie une entité (propriétés, géométrie). Réservé à la capacité edition.', 'true'],
  setEdition: ['Autorise le déplacement d\'un point d\'une couche (l\'hôte enregistre, via l\'événement edit).', 'true'],
  setFond: ['Fond de plan : atlas, voile, uni, plan (monochrome), plan-ign, photo.', '{ mode, ignore, avertissements }'],
  getLegend: ['La légende d\'une couche (classes, couleurs, classes trop claires).', 'objet'],
  getRows: ['Les lignes d\'une couche ou d\'un choroplèthe ({ tri, ordre, limite }).', '{ layer, lignes }'],
  resize: ['À appeler quand le conteneur change de taille.', 'true'],
  addAdminLayer: ['Charge une couche d\'unités administratives (pays, région, département, commune, epci, arrondissement) depuis l\'IGN ou le jeu embarqué.', '{ layer, niveau, n, source, repli, … }'],
  removeLayer: ['Retire une couche.', 'true'],
  setChoropleth: ['Règle le choroplèthe d\'une couche administrative (méthode, classes, palette, centre).', 'true'],
  setStatistique: ['Définit la mesure peinte sur une couche administrative (n, somme, moyenne, médiane, part…).', 'objet'],
  drillDown: ['Descend d\'un niveau administratif dans une unité.', 'objet'],
  drillUp: ['Remonte d\'un niveau administratif.', 'objet'],
  setDrillAuto: ['Active la descente automatique selon le zoom.', 'objet'],
  setUnitFilter: ['Filtre une couche de points par l\'unité administrative sélectionnée.', 'objet'],
  batch: ['Exécute jusqu\'à ' + BATCH_MAX + ' ordres en un aller-retour ({ arret: \'erreur\' | \'continuer\' }).', '{ ok, ko, nonExecutes, resultats }'],
  setHorsLigne: ['Mode hors ligne : true (forcé), false, ou \'auto\' (détection).', 'objet'],
});

/** Ce que porte chaque événement. */
export const TEXTES_EVENEMENTS = Object.freeze({
  ready: ['Le composant est prêt, ou une scène vient d\'être posée.', '{ layers, temps, capacites, paquet, erreurs?, avertissements? }'],
  error: ['Une erreur du composant (couche refusée, démarrage impossible).', '{ code, message, niveau }'],
  select: ['La personne a choisi une entité.', '{ layer, featureId, key, … }'],
  hover: ['Survol d\'une entité (featureId: null à la sortie).', '{ layer, featureId, key, … }'],
  filter: ['Un filtre a changé.', '{ controlId, value, layer, compte, total }'],
  camera: ['Fin d\'un mouvement de caméra.', '{ center, zoom, pitch, bearing }'],
  time: ['Le temps a changé.', '{ valeur, lecture }'],
  legend: ['La légende a changé.', 'objet'],
  edit: ['Un point a été déplacé (à enregistrer par l\'hôte).', '{ layer, featureId, geometry }'],
  layer: ['Une couche a été ajoutée, retirée ou modifiée.', 'objet'],
  progress: ['Avancement d\'un chargement.', '{ pages, chargees, total }'],
  drill: ['Descente ou remontée administrative.', '{ sens, niveau, parent, layer, fil }'],
  statistique: ['La mesure d\'une couche administrative a changé.', 'objet'],
  connexion: ['Passage en ligne ou hors ligne.', '{ etat, cause, automatique, fond, diagnostic? }  (diagnostic, sur un repli automatique par les tuiles : { echecs, message, statut, nom, sourceId } du dernier échec compté)'],
  action: ["La personne a cliqué un bouton de la bulle d'un objet (manifeste : layers[].bulle.actions) : à l'hôte de router.", '{ layer, featureId, key, actionId }'],
  bulle: ["La bulle d'un objet s'ouvre ou se ferme.", "{ etat: 'ouverte' | 'fermee', layer, featureId }"],
  classe: ["La personne a cliqué une classe de la légende optionnelle (interface.legende.cible: true) ; la légende ne filtre rien, l'hôte route.", "{ layer, cle, libelle, active }"],
  theme: ['La charte résolue a changé.', '{ version, entree, applique, derive, ignore, avertissements, a11y }'],
});

const TYPES = { string: 'chaîne', number: 'nombre', boolean: 'booléen', object: 'objet', array: 'tableau', any: 'toute valeur' };

/** Un manifeste minimal par cas, et la séquence de commandes pour y arriver. */
export const EXEMPLES = Object.freeze({
  points: {
    titre: 'Des points avec un filtre',
    manifeste: { layers: [{ id: 'sites', name: 'Sites', geometry_type: 'point', cle: 'ref', controls: [{ id: 'f-type', field: 'type', type: 'select' }] }] },
    donnees: { sites: [{ type: 'Feature', id: 1, properties: { nom: 'Alpha', ref: 'A', type: 'x' }, geometry: { type: 'Point', coordinates: [5.1, 43.2] } }] },
    sequence: ['setScene(manifeste, donnees)', 'setFilter("f-type", ["x"])', 'select(1)'],
  },
  administrative: {
    titre: 'Un choroplèthe par département',
    manifeste: { layers: [{ id: 'dep', name: 'Départements', geometry_type: 'polygon', admin: { niveau: 'departement' }, visuel: { type: 'choroplethe', niveau: 'departement', source: 'hote', champ: 'valeur', table: { '13': 12, '83': 7 } } }] },
    sequence: ['setScene(manifeste)'],
  },
  donnees: {
    titre: 'Une ligne : des données GeoJSON, le manifeste est inféré',
    html: '<atlas-bi src="https://nic01asfr.github.io/Widgets-Grist/atlas/" donnees="/carte/sites.geojson"></atlas-bi>',
  },
  bulle: {
    titre: "Une bulle d'objet avec des actions qui reviennent à l'hôte",
    manifeste: { layers: [{ id: 'sites', name: 'Sites', geometry_type: 'point', cle: 'ref', bulle: { titre: 'Site {nom}', champs: [{ champ: 'commune', libelle: 'Commune' }, { champ: 'effectif', libelle: 'Effectif', format: 'nombre' }], actions: [{ id: 'ouvrir-fiche', libelle: 'Ouvrir la fiche' }] } }] },
    donnees: { sites: [{ type: 'Feature', id: 1, properties: { nom: 'Alpha', ref: 'A', commune: 'Aix', effectif: 1200 }, geometry: { type: 'Point', coordinates: [5.1, 43.2] } }] },
    sequence: ['setScene(manifeste, donnees)', 'écouter atlas-bi-action : { layer, featureId, key, actionId }', 'select(1) ouvre la bulle, select(null) la ferme'],
  },
  declaratif: {
    titre: 'Sans code : tout en attributs',
    html: '<atlas-bi src="https://nic01asfr.github.io/Widgets-Grist/atlas/" manifeste="/carte/manifeste.json" charte="/carte/charte.json" fond="plan"></atlas-bi>',
  },
});

/** Un guide court pour une personne ou un agent qui découvre Atlas. */
export const GUIDE = Object.freeze([
  'Commencez par <atlas-bi src="https://nic01asfr.github.io/Widgets-Grist/atlas/"> : l\'élément ajoute lui-même bi=1, navbar=false, mode=view et l\'origine de votre page.',
  'Une ligne : `donnees="sites.geojson"` suffit, le manifeste est inféré (géométrie, identifiants, clé, couleurs par classe, filtre) et ce qui a été décidé est dit dans `inference` de atlas-bi-configure ; un manifeste explicite prime.',
  'Aux couleurs de votre page : `charte="herite"` lit couleurs et police de la page (ou les variables `--atlas-principal`, `--atlas-fond`, `--atlas-encre`, `--atlas-police`) et suit le mode sombre.',
  "Le canevas d'Atlas (interface, 3D, modèles) comme composant : `profil=\"complet\"` avec `src=\".../index.html\"` ; `setScene` y accepte aussi une scène Atlas 0.2.x (https, 4 Mo, 64 couches, `bbox` pour une couche distante) ; la carte seule (`bi.html`) reste le choix léger. Une couche `type: \"dalles3d\"` désigne une maquette en dalles 3D par l'adresse https de son manifeste de grille. `base=\"aucune\"` crée la carte sans aucun fond de plan (aucun service tiers).",
  "Interface optionnelle : `interface: { legende: true, temps: true }` dans le manifeste affiche une légende (d'après getLegend) et un curseur de temps, thémés par la charte, sans code côté page ; une couche `type: \"table\"` et `bulle.liste` montrent l'historique d'un objet (lignes liées par clé, triées, mises à jour par updateFeature). Carte de sélection : camera.bounds, setScene({ fusion: true }), visuel.etiquette, curseur.",
  'Sans code : donnez manifeste (et donnees, charte, fond) en attributs ou en blocs <script type="application/json" data-atlas="…"> ; la carte se monte à la connexion et se cadre sur ses entités (cadrage="aucun" pour garder la caméra).',
  'Avec du code : attendez `await carte.pret`, puis `await carte.setScene(manifeste, donnees)` ; chaque commande du contrat est une méthode de l\'élément.',
  'Données : un tableau de Features GeoJSON par couche, avec un `id` ENTIER stable et unique dans toute la scène ; ordre des coordonnées [longitude, latitude].',
  'Lisez le résultat de setScene : `_erreurs` (couche refusée) et `_avertissements` (couche montée avec un défaut) disent quoi corriger.',
  'Après un rechargement de l\'iframe, la carte est vide : renvoyez setScene (la configuration déclarative, elle, se rejoue seule).',
  'Écoutez atlas-bi-select pour savoir ce que la personne choisit ; les événements provoqués par vos propres commandes ne sont pas livrés (attribut evenements-api pour les recevoir).',
  'Sur téléphone, plafonnez la finesse du dessin avec ratio-max="2" (ou 1) si la carte est lente.',
  'Un démarrage qui échoue le dit dans le voile et par l\'événement atlas-bi-erreur ; délai de connexion réglable par delai-connexion.',
  'Le contrat reste ' + VERSION + ' ; toute évolution est additive et notée dans docs/CONTRAT-CARTE-BI.md (§14).',
]);

/** @returns {object} la description complète, JSON pur */
export function decrire() {
  const commandes = Object.keys(COMMANDES).map((nom) => ({
    nom,
    depuis: COMMANDES_0_3.includes(nom) ? '0.3' : '0.2',
    capacite: CAPACITE_DE_COMMANDE[nom] || 'socle',
    arguments: COMMANDES[nom].map(([type, obligatoire]) => ({ type: TYPES[type] || type, obligatoire: !!obligatoire })),
    description: (TEXTES_COMMANDES[nom] || [''])[0],
    resultat: (TEXTES_COMMANDES[nom] || ['', ''])[1],
  }));
  const evenements = EVENEMENTS.map((nom) => ({ nom, description: (TEXTES_EVENEMENTS[nom] || [''])[0], charge: (TEXTES_EVENEMENTS[nom] || ['', ''])[1] }));
  return {
    contrat: { version: VERSION, versionsAcceptees: [...VERSIONS_ACCEPTEES], capacites: [...CAPACITES] },
    commandes,
    evenements,
    declaratif: {
      attributs: [...DECLARATIFS],
      autres: ['src', 'hote', 'delai', 'delai-connexion', 'ratio-max', 'profil', 'base', 'evenements-api', 'title'],
      blocs: DECLARATIFS.filter((n) => n !== 'fond' && n !== 'cadrage').map((n) => `<script type="application/json" data-atlas="${n}">`),
      evenementsDom: ['atlas-bi-pret', 'atlas-bi-configure', 'atlas-bi-herite', 'atlas-bi-erreur', ...EVENEMENTS.map((e) => 'atlas-bi-' + e)],
    },
    limites: {
      ordresParBatch: BATCH_MAX,
      fichierDeclareOctets: LIMITE_OCTETS,
      couchesParEntites: 'au-delà de 50 000 entités dans une couche, un avertissement conseille d\'agréger',
      charte: 'jamais chargée par adresse par Atlas : c\'est la page hôte qui la lit et la passe',
      polices: 'embarquées ; aucune police distante',
      horsLigne: 'repli sur un fond uni ; setHorsLigne(true | false | \'auto\')',
    },
    exemples: EXEMPLES,
    guide: [...GUIDE],
    documents: { contrat: 'docs/CONTRAT-CARTE-BI.md', exploitation: 'docs/EXPLOITATION-EXTERNE-BI.md', charte: 'docs/CONTRAT-CHARTE-ATLAS.md', dependances: 'docs/INVENTAIRE-DEPENDANCES.md' },
  };
}
