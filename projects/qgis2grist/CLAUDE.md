# Projet : qgis2grist

Widget Grist d'import de projets QGIS (qgis2web HTML/ZIP, .qgz/.qgs, GeoPackage,
paquets QField). Crée le schéma de tables Grist et y peuple les données ; rend
ensuite une carte live-synchro (v2 : composant Atlas par défaut, MapLibre en repli ;
v1 : Leaflet).

## Contexte

L'objectif n'est pas d'afficher une carte par-dessus QGIS — c'est de **rendre
les données QGIS exploitables nativement dans Grist** : colonnes typées, choix,
relations, libellés humains. La carte est un sous-produit pour visualiser le
résultat.

## Architecture

Fichiers widget :

| Fichier | Rôle |
|---------|------|
| `index.html` | **v1.1 stable** — Leaflet ; publié dans `published/qgis2grist/` |
| `index_v2.html` | **v2 (2.1.0)** — carte du composant Atlas par défaut (MapLibre en repli) + Scene Manifest + formulaires terrain ; publié dans `published/qgis2grist/v2/` |
| `lib/qml-to-declarative.js` | QML → StyleDeclarative (F1) |
| `lib/scene-manifest.js` | Build Scene Manifest V0.2 (F2) |
| `lib/maplibre-bridge.js` | Runtime carto MapLibre (D3) |
| `lib/provenance.js` | Source Strate lite + provenance import (D8) |
| `tests/qml-to-declarative.test.js` | Tests unitaires |
| `tests/provenance.test.js` | Tests provenance D8 |

### Modules factorisés (lib/q2g-*.js)

`index_v2.html` ne contient plus le parsing ni la boucle d'import : ils vivent dans des modules UMD
(`root.NomModule`, `require()` possible sous Node), sans DOM ni `window`. Les dépendances externes sont
injectées ; `index_v2.html` les branche en tête de script et garde des alias `const { ... } = window.Q2GXxx`
de même nom que les anciennes fonctions (les appels n'ont pas changé).

| Module | Global | Contenu | Dépendances injectées |
|--------|--------|---------|-----------------------|
| `lib/q2g-geometry.js` | `Q2GGeometry` | WKB/EWKB, blobs GPKG, courbes, reprojection, centroïde | `proj4fn` en paramètre de `reprojectGeom` |
| `lib/q2g-schema.js` | `Q2GSchema` | types Grist, `sanitize*`, tri des Ref, GeoJSON vers couches | `create({ geometry })` (repli : `Q2GGeometry`) |
| `lib/q2g-qgs.js` | `Q2GQgs` | lecture .qgz/.qgs, champs, widgets d'édition, relations, styles | `configure({ parseXml, JSZip, readGpkgWithSqlJs, sanitize*, setReadingLabel, ... })` ou `deps` final |
| `lib/q2g-gpkg.js` | `Q2GGpkg` | lecture GeoPackage via sql.js, CRS, enrichissements | `configure({ loadSqlJs, loadProj4, geometry, qgs, gpkgDs, parseQmlStyle, buildLayerFromGeojson, onProgress })` ou `create(deps)` |
| `lib/q2g-loaders.js` | `Q2GLoaders` | chargeurs sql.js, proj4, JSZip (seul module navigateur) | `create({ sqlJs, proj4, jszip, document })` : instance, URL ou dossier local |
| `lib/q2g-import.js` | `Q2GImport` | boucle d'import vers Grist (AddTable, lots, Ref, colonnes géométriques) | `importLayers(couches, { docApi, schema, sceneLod, makeMarkerColorFn, onProgress, onLayerStart, signal, logger })` |
| `lib/q2g-qgis2web.js` | `Q2GQgis2web` | lecture qgis2web (HTML, ZIP, GeoJSON), palettes, métadonnées BigQgisMCP | `configure({ JSZip, loadSqlJs, setReadingLabel, onMeta, ... })` ; `onMeta(meta)` remplace l'ancien effet de bord `_currentMeta` |
| `lib/q2g-atlas-host.js` | `Q2GAtlasHost` | hôte du composant Atlas : scène, synchronisation par couche, sélection, filtres, cadrage, légende, thème, fond, erreurs typées, valeurs lisibles (dates, références), liste blanche de `?atlas=` (`validerAdresseAtlas`) | `creerHote({ client, options, surSelection, surFiltre, surAvertissement, surErreur })` ; client Atlas injecté |
| `lib/q2g-theme.js` | `Q2GTheme` | thème : `Theme_document` (lecture seule) puis thème de l'instance Grist, variables `--kit-*`, charte `atlas-charte/0.1`, fond de carte, suivi à chaud, envoi à Atlas (`envoyerApparence`) | `create({ formThemeDef, atlasThemeDuDocument, lireHote?, suivreHote? })` puis `habiller(racine, docApi, { surCharte, surFond })` |
| `lib/q2g-html.js` | `Q2GHtml` | échappement HTML des valeurs non fiables (`echapper`, `couleurSure`) pour l'ancienne carte, la légende et l'aperçu | aucune |
| `lib/q2g-garde.js` | `Q2GGarde` | garde d'exclusion (`creerGardeExclusive`) : un seul import à la fois (double clic) | aucune |
| `lib/q2g-palettes.js` | `Q2GPalettes` | palettes de donnees par defaut derivees de la charte du theme (qualitative, sequentielle, divergente), repli d'origine sans theme, tons d'etat separes | `create({ deriver, candidates })` (derivation d'Atlas injectee) puis `definirCharte(charte)` |
| `lib/q2g-vues.js` | `Q2GVues` | vues enregistrees : table `Atlas_ScenePrefs`, colonne `VuesQ2G` (cle `vues_q2g`), assainissement, plafonds, relecture avant ecriture | `creer({ docApi, colonne })` ; `COLONNE_DEDIEE` |
| `lib/q2g-apercu.js` | `Q2GApercu` | apercu d'import : regroupement Cartographiques / Tables, recherche, estimation de taille et de duree | aucune |
| `lib/q2g-color.js` | `Q2GColor` | conversions de couleur factorisées (non branché ailleurs : quatre comportements divergents sur les cas limites) | aucune |

Ordre de chargement : `q2g-geometry`, `q2g-schema`, `q2g-loaders`, `q2g-gpkg`, `q2g-erreurs`, `q2g-html`, `q2g-garde`, `q2g-qgs`, `q2g-import`, puis (après `parse-remote-mcp`) `q2g-qgis2web`, (après `maplibre-bridge`) `q2g-atlas-host`, et `q2g-theme` après les scripts `grist_forms/shared` (`theme`, `theme-instance`, `derivation-valeurs`, `themedef`), `q2g-palettes` après `q2g-theme`, `q2g-apercu` et `q2g-vues` après `q2g-garde`.
Restent dans la page : interface, pré-assignation `_lod`/`_color`, sauvegarde SceneManifest/QgisWidgets,
carte. `index.html` (v1 publiée), `terrain.html` et `published/` ne sont pas concernés.
Limites connues conservées : `makeMarkerColorFn` dépend de la page (`_readField`) et est passé à l'import ;
`q2g-schema` garde des copies de repli de la géométrie (retirables) ; `q2g-import` duplique le tri des Ref du schéma.

### Carte : composant Atlas par défaut (index_v2.html)

La carte de `index_v2.html` est dessinée par le composant Atlas PUBLIÉ (iframe `bi.html`), piloté par `Q2GAtlasHost` : qgis2grist garde l'import et fabrique la scène ; Atlas est consommé tel que publié, jamais modifié (`projects/Atlas` et `published/` hors périmètre).

| Sujet | Choix (décisions de cadrage, réversibles) |
|-------|--------------------------------------------|
| Hôte du composant | l'Atlas publié `https://nic01asfr.github.io/Widgets-Grist/atlas/bi.html` (D1) ; adresse surchargeable : `?atlas=<dossier ou page>` ; `client.js` et `theme-document.js` sont importés depuis cette adresse ; l'origine de l'hôte (`location.origin`) est déclarée par `?hote=` |
| Liste blanche de `?atlas=` | le widget importe du CODE depuis cette adresse : seule l'origine `https://nic01asfr.github.io` est acceptée (constante `Q2GAtlasHost.ORIGINES_ATLAS_AUTORISEES`, modifiable) plus `localhost` / `127.0.0.1` (tout port) pour le développement ; toute autre adresse (autre origine, faux sous-domaine, identifiants, `http` hors local, protocole `javascript:`/`data:`/`file:`) est refusée avec un message (console et message à l'écran) et l'adresse par défaut est utilisée |
| Ancienne carte | `?carte=legacy` ; automatique pour les imports portant le panneau BigQgisMCP (curseur d'inondation, `hasInteractiveBigQgisUi`) ; repli automatique avec un message si le composant ne répond pas (30 s de connexion au plus, ou immédiatement par le bouton) (D2) |
| Volume | pas de refus : l'avertissement d'Atlas (50 000 entités par couche) est relayé par un message (D3) ; profil C non monté (comme avant) |
| Thème | ordre : (a) ligne active de `Theme_document`, sinon (b) thème de l'INSTANCE Grist lu comme un ThemeDef (contrat de `grist_forms/shared/theme-instance.js`, variables `--grist-theme-*` fournies au widget, repli aussi quand le document est refusé : invalide, contraste, plusieurs actifs), sinon (c) rendu d'origine. Le thème retenu pose les `--kit-*` de l'interface et envoie à Atlas une charte (`setTheme`, graines principal, fond, encre quand l'instance les donne ; pas de secondaire) ; il habille l'interface, le fond et la bulle d'Atlas, pas les couleurs des données (D4). Suivi à chaud (ligne activée ou désactivée, mode clair/sombre ou palette de l'instance, sondage 15 s). La préférence de contraste de la personne (`prefers-contrast: more`, `forced-colors`) passe avant tout : rien n'est posé. Le widget ne crée ni n'écrit jamais `Theme_document` (D5) |
| Fond de la carte | le fond d'Atlas suit TOUT thème appliqué, document ou instance : `setFond('plan', { principal })` (plan en aplats calculé par Atlas sur la couleur principale de la charte). Aucun thème : rien n'est envoyé, le fond d'origine (`liberty`) reste ; si le thème disparaît (ligne désactivée, instance indisponible) : `setFond('atlas')`. Les envois sont mis en file et mémorisés par clé (jamais deux fois la même charte ou le même fond) |
| Fiche et bulle lisibles | les colonnes Date / DateTime (secondes Unix) s'affichent en jj/mm/aaaa (heure pour un DateTime, fuseau du navigateur) et les Ref / RefList par le libellé de la ligne cible (préférence : `value_fr`, `value_en`, `name`, `nom`, `label`, `libelle`, `title`, `titre`, `description`, sinon la première colonne de texte non technique, sinon le numéro), côté hôte (`options.lisibilite`, libellés lus par `fetchTable` à l'ouverture de la carte). Cles et ids inchangés ; la valeur brute reste dans `_brut_<champ>` ; un champ dont la valeur brute sert au style ou à un filtre reste brut, un contrôle temporel suit `_brut_<champ>`. Limite : les libellés sont relus à l'ouverture de la carte, pas à chaque synchronisation |
| Profil | carte nue (`bi.html`), pas l'application complète (D6) |
| Couleurs de données | le style QML reste la vérité : style déclaratif natif gardé s'il redonne les couleurs de l'ancienne carte (98 % d'accord sur 300 entités), sinon catégorisation sur la propriété `_fill_color` (styles à règles) |
| Synchronisation | une relecture Grist par couche ; l'hôte n'envoie à Atlas que les couches dont l'empreinte change (un `setScene` `fusion`, jamais `updateFeature`) ; intervalle 5 s puis 15, 30, 60 s si rien ne change ; suspendue onglet masqué |
| Interface du widget | voir « Interface du widget (lots du 09/11/2026) » ci-dessous |

Hors périmètre : les contrôles de type `time` n'ont pas d'interface dans le widget ; les couches en mode vue (profil B) sont envoyées en entier (pas de filtrage par emprise) ; le panneau BigQgisMCP reste sur l'ancienne carte.

### Interface du widget (lots du 09/11/2026)

Structure reprise de TaskFlow (`core/taskflow-ui.css`, lecture seule : structure, pas copie), noms de jetons identiques pour qu'un socle commun puisse les partager. Décisions de Nicolas : palettes niveau A seulement (aucune modification du contrat ThemeDef) ; le style QML prime toujours ; tons d'état séparés des palettes de données ; vues dans `Atlas_ScenePrefs` (jamais de table à part) ; jetons propres à qgis2grist, option A.

| Lot | Contenu |
|-----|---------|
| 1. Jetons et barre | `--fs-2xs` à `--fs-xl`, `--sp-1` à `--sp-4`, `--ctl-h` (34 px, 44 px en tactile), `--ctl-r`, `--seg-r`, couleurs des contrôles reliées aux `--kit-*` du thème avec repli sur les variables d'origine (sans thème : rendu d'origine). Barre du haut en grille. **UNE seule ligne seulement à partir de 1700 px** (titre, couches, outils, état, actions). De 1100 à 1699 px : une ligne de contrôles et l'ÉTAT DE SYNCHRONISATION (point de couleur, « Live Grist », volume, âge) sur une seconde ligne compacte pleine largeur ; de 760 à 1099 px : titre et actions, couches et outils, puis l'état ; sous 760 px : quatre lignes courtes (le bouton de retour ne garde que la flèche sous 460 px, nom accessible conservé). L'état n'a plus de colonne à partager, donc aucune largeur ne le met à zéro (mesuré à 1500, 1250, 1000, 824 et 390 px). Sous 900 px il prend la forme compacte : point + « Live Grist » + « N entités » (+ « après filtre ») ; « à jour il y a N s » reste en infobulle et pour les lecteurs d'écran. Le point hors ligne est carré (pas de couleur seule). Focus clavier visible. |
| 2. Tiroir et couches | Un tiroir unique sous la barre (Couches, Filtres, Légende, Vues), un seul panneau à la fois, état ouvert visible (`aria-expanded` et style), Echap referme. Les couches sans géométrie sont dans le menu « Tables liées (n) ». L'ancienne carte (`?carte=legacy`) garde sa bande de couches. |
| 3. Fiche et pastille | Fiche d'entité unique : volet à droite (au-dessus de l'attribution), navigation n/m sur les entités ouvertes, sections Propriétés / Relations / Dates. La bulle d'Atlas ne montre que 3 champs (`BULLE_CHAMPS_MAX`). Pastille « N entités · M après filtre · à jour il y a … » (`Q2GAtlasHost.texteVolume`, ou `partiesVolume` pour les trois morceaux : seul l'âge est réécrit toutes les 5 s, sans région vivante ; les changements d'état réels sont annoncés par `#map-sync-annonce`). Notifications : coin bas gauche, hors attribution. |
| 4. Aperçu d'import | Regroupement Cartographiques / Tables, recherche, tout cocher / décocher (couches affichées), case à cocher dans l'en-tête de chaque couche, taille et durée estimées (indicatives). Mêmes cases `inc-<idx>` : ce qui est importé ne change pas. |
| 5. Palettes | Plus de palette en dur (`PALETTE`, `LAYER_COLORS`) : `Q2GPalettes`, charte du thème retenu (document, sinon instance), dérivation d'Atlas (`derivation.js`, `defauts.js` du composant publié) avec repli local. La palette n'est appelée que dans `layer.color \|\| couleurCouche(i)` : le style QML prime. Couleurs attribuées à l'import et mémorisées dans la config : un changement de thème ne recolore pas les couches déjà importées. Palette passée en paramètre au manifeste (le repli de `lib/scene-manifest.js` n'est pas modifié). |
| 6. Vues enregistrées | Panneau « Vues » : liste, enregistrer (couches visibles, filtres, cadrage, sélection), appliquer, renommer, supprimer (deux clics). Stockage `Atlas_ScenePrefs`, colonne `VuesQ2G` (voir ci-dessous). |

**Accessibilité (clavier et lecteurs d'écran).** Ouvrir un panneau du tiroir y fait entrer le focus (le tiroir suit la barre dans le DOM : sinon la tabulation traverserait toutes les actions) ; Echap ou la croix le rendent au bouton du panneau (ou au premier bouton visible si le panneau a disparu), jamais au `body`. Après enregistrer, renommer ou supprimer une vue, le panneau est reconstruit puis le focus est rendu au champ de saisie (enregistrer ; le nom tapé est restitué après un échec), à la vue renommée, ou à la vue qui prend la place de celle supprimée (sinon le champ de saisie). Renommer : Echap rend le focus au bouton « Renommer », un départ du champ ne reconstruit plus le panneau. Les filtres sont des groupes (`role=group`) nommés « couche · champ (colonne) » et chaque case ou champ de saisie porte ce préfixe dans son nom accessible (« Reaches · Level (rp_from_level) : minimum »). Le bouton « Tables liées » est un bouton de déploiement (pas de `aria-haspopup`). Régions vivantes : seulement `#toast` et `#atlas-statut` (événements réels) et `#map-sync-annonce` (changements d'état de synchronisation : connecté, hors ligne, erreur) ; l'âge « à jour il y a N s » et le volume ne sont jamais annoncés en continu.

**Contraste et cibles (mesurés par `tests/harness/mesures-ui.js`, couleurs composées, jusqu'au fond réel).** Boutons de couche du tiroir : le TEXTE prend l'encre du thème (`--ctl-texte`), la couleur de donnée devient une marque dont la FORME suit la géométrie (rond, trait, carré arrondi) avec un contour neutre ; couche affichée = fond teinté et bord plein, couche masquée = bord en tirets et marque creuse, couche non montée = bord pointillé (l'état ne repose pas sur la couleur) ; cible de 44 px au pointeur grossier. Avant : « Reaches » en `#f59e0b` sur `#f1f5f9` = 1,96:1, « Wastewater structures » en `#ef4444` = 3,44:1. Texte secondaire : `--text-muted` `#64748b` (4,34:1 sur `--surface2`) devient `#586a7e` (5,07:1, 4,51:1 sur `--surface3`), `--text-dim` `#94a3b8` devient `#5f6f85` (4,68:1) ; plus aucune police sous 11 px (`--fs-2xs` 0,6875 rem ; les 9 et 10 px de l'aperçu, de la légende et des panneaux BigQgisMCP passent à 11 px). Toasts : texte d'encre (le vert `#10b981` du texte « Carte prête » donnait 2,32:1, le rouge 3,44:1), l'état est porté par un bord épais coloré ; « Confirmer ? » (suppression d'une vue) idem. Résultat mesuré, tiroir ouvert sur chacun des quatre panneaux plus les deux toasts : 0 paire sous 4,5:1 sans thème, avec un `Theme_document` vert (essai en mémoire, faux `docApi`, aucune écriture) et avec le thème d'instance GristLight de la DINUM.

**Ouverture de la carte (chemin critique jusqu'au toast « Carte prête »).** Profil mesuré (`tests/harness/mesure-carte.js`, QField Wastewater, aperçu local, onglet neuf entre deux mesures, Atlas publié sur github.io) : le temps est dominé par l'iframe du composant (connexion, environ 1,5 s) et la scène (environ 230 ms) ; la construction de l'interface du widget pèse moins de 10 ms. Le surcoût de 0,5 s relevé entre `327a5734` et `0f77e511` n'est **pas reproduit** en aperçu local (médiane de 5 : `327a5734` 1811 ms, avant correctif 1824 ms, après 1778 ms) ; il ne peut venir que du mode Grist (lectures de libellés, lecture des vues, thème), que l'aperçu n'exerce pas. Corrigé dans ce chemin : (1) le composant (iframe et client), la lecture des lignes de chaque couche et la lecture des libellés de références partent EN PARALLÈLE (avant : l'une après l'autre) ; (2) les libellés sont lus en parallèle, une lecture par table cible (avant : une lecture attendue par champ Ref, soit 23 allers-retours en file sur Wastewater) ; (3) la légende (une lecture par couche, maintenant simultanées) et la lecture des vues partent après le toast (`apresAffichage` : `requestIdleCallback`, 400 ms au plus) ; (4) le panneau Filtres est construit à sa première ouverture (`preparerFiltresAtlas` ne règle que le bouton). Mode « Grist simulé » (faux `docApi` à 60 ms par appel, 24 tables cibles de Ref, n = 3) : `327a5734` 2100 ms, avant correctif 2140 ms, après 1917 ms. Seconde série (même jour, `327a5734` servi par `git archive` sur un autre port, onglet neuf entre chaque mesure, viewport par défaut 824 px, Atlas publié sur github.io, 5 mesures chacun, valeurs triées) : `327a5734` 2049, 2122, 2310, 2331, 3724 ms (médiane 2310) ; HEAD 1891, 2001, 2143, 2192, 3829 ms (médiane 2143). Le réseau domine et fait des valeurs aberrantes (3,7 s des deux côtés) : la médiane de HEAD reste sous celle de `327a5734` + 150 ms. Non mesuré en Grist réel : l'onglet Grist de l'utilisateur n'était pas accessible depuis le navigateur de test (redirigé vers la connexion ProConnect), donc rien de ce chapitre ne vaut pour le mode Grist.

**Vues : écart avec la décision d'origine.** La décision était « clé dédiée du bloc JSON » d'`Atlas_ScenePrefs`. Atlas réécrit `ExpositionJSON` normalisé à chaque enregistrement de ses préférences (`lib/exposition.js`, `lib/scene-prefs.js`) et perd les clés inconnues : les vues y seraient effacées. Elles vont donc sous la clé `vues_q2g` d'une colonne `VuesQ2G` de la MÊME table (créée avec les colonnes d'Atlas si elle n'existe pas, colonne ajoutée sinon). Retour en arrière : `Q2GVues.creer({ colonne: 'ExpositionJSON' })` si Atlas préserve un jour les clés inconnues.

**Vues et Atlas : ce qu'Atlas fait de la table (relevé en lecture seule le 09/11/2026, `projects/Atlas/lib/scene-prefs.js`, `lib/exposition.js`, `lib/decouverte.js`, `app_v7.js` `syncScenePrefsFromGrist` / `persistScenePrefs`).** Le stockage des vues n'a PAS été changé (décision de Nicolas en attente).
- Atlas ne lit QUE la première ligne de `Atlas_ScenePrefs` (`ids[0]`, première cellule de chaque colonne) et ne connaît que quatre colonnes : `ViewerJSON`, `SettingsJSON`, `ExpositionJSON`, `Miniature`. qgis2grist lit aussi la première ligne : tant qu'il n'y a qu'une ligne, les deux outils partagent la même.
- Ligne dont les quatre colonnes d'Atlas sont vides (cas d'une ligne qui n'a que `VuesQ2G`) : aucune erreur, lue comme « aucune préférence ». `ViewerJSON` vide devient `'[]'` donc les trois contrôles par défaut, non exposés (soleil, 2D/3D, fonds) ; `SettingsJSON` vide donne `{}` et `syncScenePrefsFromGrist` s'arrête là, sans rien appliquer ; `ExpositionJSON` vide donne `{ ouverture: { mode: 'carte' } }` sans cadrage ; `Miniature` vide donne `''`. Un JSON invalide dans l'une d'elles retombe de même sur la valeur par défaut. Lecture REST de la miniature (liste des scènes, `lireMiniature`) : la première ligne, `''` si vide.
- Colonne inconnue (`VuesQ2G`) : ignorée en lecture ; à l'écriture Atlas fait un `UpdateRecord` qui ne nomme que ses propres colonnes, donc il n'efface pas `VuesQ2G` ; `ensureScenePrefsTable` n'ajoute que les colonnes manquantes de son schéma et ne retire rien. La table est dans les « tables de configuration » d'Atlas (`atlas-tables.js`) : elle n'est pas proposée comme couche.
- Risques consignés, non corrigés : (1) deux lignes. Si Atlas a chargé le document alors que la table était vide ou absente (il garde alors `_prefRowId = null`) et que qgis2grist crée ensuite la première ligne (`VuesQ2G` seule), Atlas ajoute SA propre ligne (`AddRecord`) à son prochain enregistrement ; au rechargement il relit la ligne 1, celle de qgis2grist, et ses réglages (fond, heure, contrôles exposés, ouverture, cadrage, miniature) paraissent perdus alors qu'ils sont intacts sur la ligne 2. L'ordre inverse (Atlas d'abord) ne pose rien. (2) Le schéma d'Atlas est recopié dans `Q2GVues` (`SCHEMA_ATLAS`) : si Atlas change ses colonnes, la table créée par qgis2grist diverge jusqu'à ce qu'Atlas ajoute les manquantes (il le fait). (3) Atlas range `Atlas_ScenePrefs` parmi les tables de configuration et note un verdict de droits par table (`droits-tables.js`) : des droits qui refusent l'écriture de cette table bloquent aussi l'enregistrement des vues par qgis2grist (message d'erreur côté widget). Non essayé en Grist réel ; le lien exact entre la sonde d'Atlas et cette table n'a été lu que dans `droits-tables.js` et ses tests. (4) Une ligne `VuesQ2G` seule est visible dans la table pour qui l'ouvre. Pistes (à trancher avec le stockage) : créer la ligne avec des valeurs neutres d'Atlas, ou ranger les vues dans la table `QgisWidgets` déjà propre à qgis2grist.

Limites connues : le fond de carte n'a pas de réglage dans le widget (il suit le thème) : il n'est pas enregistré dans les vues ; les contrôles de type `time` n'ont toujours pas d'interface ; `lib/terrain-app.js` garde sa palette de 5 couleurs (mode terrain, hors `index_v2.html`) ; l'aperçu d'import estime la taille sur un échantillon de lignes.

### Vérification de non-régression

```
node --test tests/*.test.js          # unitaires (1 échec préexistant : binding marseille webmap)
node tests/harness/serveur.mjs       # http://127.0.0.1:8711/index_v2.html
# capture navigateur (voir tests/harness/README.md), puis :
node tests/harness/comparer.mjs      # attendu : 19/19 identiques (14 parse + 5 import)
```

Le golden (`tests/golden/`) fige les sorties de parsing sur 13 fixtures (plus les fonctions pures) et 5 scénarios d'import contre un faux Grist (`bees`, `marseille_qfield`, `marseille_webmap`, `nimes_flood`, `wastewater`) : 19 captures.
Tout changement de `index_v2.html` ou de `lib/q2g-*.js` doit rendre un écart nul (vérifier la fraîcheur des captures par leur horodatage).
**Ce que le golden ne couvre PAS** : l'interface de la carte Atlas (iframe, `setScene`, `setTheme`, `setFond`, tiroir, barre du haut, fiche, filtres, légende, vues, aperçu d'import), car `showMap` y est un espion ; ces parties sont couvertes par les tests Node de `q2g-atlas-host.test.js` et `q2g-theme.test.js` (faux client Atlas) et se vérifient à la main dans un navigateur. Le détail est dans `tests/harness/README.md`.

Paramètres d'URL de `index_v2.html` : `?carte=legacy` (ancienne carte MapLibre), `?atlas=<adresse>` (composant Atlas, liste blanche, voir plus haut), `?hote=<origine>`, `?perf=standard` (lots d'import d'origine, voir « Import : options de performance »), `?perf=rapide` (lecture GeoPackage par pages, non mesurée). La forme des sorties (Scene Manifest,
tables et colonnes créées dont `geometry_json`, `latitude`, `longitude`, `fill_color`) est consommée par Atlas : ne pas la changer.

Spec binding v2 : `docs/BINDING-QGIS-GRIST-CEREMA-v2.md`.
**Gate v2** : `docs/CADRAGE-v2.md` — D1–D10 actés (2026-07-26) ; Phases 1–2 autorisées.

### Machine d'états

```
drop → reading → preview → importing → map ↔ original
                                             ↓
                                          error
```

État courant dans `currentState`. Transitions via `setState(name)`.

### Pipeline de parsing

| Format | Entry point | Sortie commune |
|---|---|---|
| qgis2web HTML | `parseQgis2webHtml(html)` | `[layer, ...]` |
| qgis2web ZIP | `parseQgis2webZip(zip)` | idem |
| QGZ | `parseQgzFile(ab, parentZip, name)` | idem (delègue à `parseQgsXml`) |
| GeoPackage standalone | `parseGpkgFile(ab)` | idem |
| GeoJSON dans ZIP | `parseGeojsonFiles(zip, names)` | idem |

`layer` = `{name, displayName, geomType, fields, features, featureCount, hasData,
datasource, style, _layerId?}`.

`fields[]` = `{name, _rawKey, label, qType, gType, widgetOptions?, description?,
_valueMap?, _refTargetTable?, _refTargetField?, _externalResource?}`.

### Pipeline d'import Grist

`startImport()` :
1. Tri topologique `topoSortByRefs` — parents avant enfants pour les Refs.
2. Pour chaque couche, dans l'ordre :
   - `listTables()` → générer un nom unique.
   - `AddTable` avec `label`, `widgetOptions`, `description`.
   - Boucle `BulkAddRecord` par lots (100 si Polygon/Line, 500 si Point).
   - Capture des nouveaux rowIds via `result.retValues[0]`.
   - Si la couche est référencée par d'autres : indexer `valeur → rowId`
     dans `parentMaps[tableName][refField]`.
3. Lors de l'insertion d'une couche enfant, transformer chaque FK en rowId
   via `parentMaps`.

### Métadonnées de colonne (passes 1b + 2)

| Source QGIS | → Grist |
|---|---|
| `<aliases><alias>` | `label` |
| `<editWidget type="ValueMap">` | `Choice` + `widgetOptions.choices` + `_valueMap` (transform à l'import) |
| `<editWidget type="Range">` | `Numeric` (ou `Int` si Step entier sans Precision) |
| `<editWidget type="CheckBox">` | `Bool` |
| `<editWidget type="DateTime">` | `Date` ou `DateTime` selon `field_format` |
| `<editWidget type="ValueRelation">` | `Ref:` ou `RefList:` (passe 3) |
| `<editWidget type="ExternalResource">` | marqueur `_externalResource` ; la colonne reste `Text` (chemin de la photo), le formulaire ne promet un champ fichier que sur une vraie colonne `Attachments` |
| `<relations><relation>` | `Ref:<TargetTable>` sur le champ référençant |
| GPKG `gpkg_data_columns.title/description` | `label`/`description` |
| GPKG `gpkg_data_column_constraints type='enum'` | `Choice` |
| GPKG `qgis_projects.xml` | `.qgs` complet → aliases + editWidgets si pas déjà lus |

### Persistance

Une table `QgisWidgets` (auto-créée) stocke un JSON de config par import. Permet
restauration au prochain chargement du widget. Schéma : `widget_name`,
`source_file`, `config_json`, `created_at`. Le `config_json` contient meta
BigQgisMCP, fields enrichis, refs, styles.

Pas de `setOption()` ici : on veut que la config survive à un duplicata du
document (la table fait partie du document, l'option non).

## Conventions spécifiques

### Géométrie

- Point : colonnes `latitude`, `longitude` (Numeric).
- Line / Polygon : colonnes `geometry_json` (Text, JSON GeoJSON arrondi à 5
  décimales ≈ 1 m), `centroid_lat`, `centroid_lon`.
- Pas de `Ref:Geometry` Grist — la géométrie est sérialisée.

**Collision de noms** : si la source porte déjà un champ `latitude` /
`geometry_json` / `fill_color`, Grist suffixe la colonne que nous ajoutons
(`latitude2`). Les données partent au bon endroit (`colIdByFieldName` est
capturé depuis `AddTable`), mais un consommateur qui applique la convention
lirait la colonne source homonyme — souvent vide ou à 0. L'import mémorise donc
les colIds effectifs dans `layer._geometryCols`, et le manifest les publie dans
`source.geometry_fields` (émis seulement en cas d'écart). Atlas lit ce champ en
priorité ; à défaut il retombe sur la convention puis sur les variantes
numérotées. Extension additive à V0.2.1, à valider côté
`cerema-offre-de-service`.

### LOD zoom (`lib/scene-lod.js`)

Aucune contrainte de zoom en **Profil A** : la couche tient en mémoire, la
brider ne ferait que la rendre invisible. À partir du Profil B, `minZoom` suit
la géométrie (Point 8 / Line 9 / Polygon 10) et une grille voit son plancher
relevé à `GRID_MIN_ZOOM` (11). Jamais de `maxZoom` : une maille 200 m est
illisible en petite échelle, pas en grande — l'inverse ferait disparaître la
couche quand on zoome dessus.

### Couleur par feature

Colonne auto `fill_color` (Text) calculée à l'import via le QML / les fonctions
qgis2web. Permet à n'importe quelle vue Grist de récupérer la couleur sans
re-parser le style. **Inconvénient** : si l'utilisateur édite la valeur de
classification, `fill_color` n'est pas recalculé. À documenter pour l'utilisateur.

### `_rawKey` vs `label` vs `name`

- `_rawKey` = clé brute dans les properties GeoJSON (ex: `ht_max`).
- `label` = libellé humain affiché (alias QGIS / `gpkg_data_columns.title` /
  ou `_rawKey` à défaut).
- `name` = id Grist sanitisé (ex: `ht_max`, ou `Hauteur_d_eau` si caractères
  spéciaux).

`flattenGeoJsonFeatures` cherche `props[_rawKey]` en priorité.
`makeMarkerColorFn` (style) cherche dans cet ordre : `_rawKey`, `label`, `name`.

## État actuel

### v1.1 (`index.html`) — stable

Fait :
- Parsers qgis2web HTML/ZIP, QGZ/QGS, GPKG (avec sql.js + WKB pur JS), GeoJSON.
- Reprojection EPSG:3857 native, autres CRS via proj4js on-demand.
- QML (categorized/graduated/single) extraction couleurs.
- BigQgisMCP : titre, slider, palettes flood/building, légende dynamique.
- Import : labels, widgetOptions Choice, relations Ref:, FK → rowId, GPKG
  metadata.
- Carte Leaflet live-synchro (polling Grist 5 s) + bandeau restauration.

À faire / limites connues :
- **ExternalResource → Attachments** : marqueur posé (`_externalResource`), mais
  la colonne reste **du texte** — elle porte le chemin de la photo sur
  l'appareil. Le FormDef déclare donc le type réel de la colonne (18/09/2026) :
  un champ fichier n'est promis que sur une vraie colonne `Attachments`. Sans
  cette garde, enregistrer la fiche écrivait `"[1]"` dans la colonne, après
  avoir effacé le chemin.
  **Reste à arbitrer** : que faire des photos d'un paquet QField — créer la
  colonne en `Attachments` et verser les fichiers du paquet (le chemin est alors
  perdu), ou garder deux colonnes, le chemin et les pièces jointes.
- **QGIS 2.x** : `<edittypes>` legacy détectés mais leur format `widgetv2config`
  (avec `<value key= value=>`) n'est pas parsé — ValueMap dégradé en Text.
- **Polling 5 s sans backoff** : sur grosse table c'est coûteux. Pas de pause
  quand l'onglet est en arrière-plan.
- **`adaptHtmlForGrist` / `renderAsWidget` / storage local** : supprimés en v2 Phase 1 (`index_v2.html`).

### v2 (`index_v2.html`) — 2.1.0, publiée

- **Carte du composant Atlas** (iframe, par défaut) et **MapLibre GL JS** en repli (`?carte=legacy`), Scene Manifest, config v3
- **Provenance D8** : `meta.sources[]`, `meta.provenance`, `source_info` (config + manifest)
- Restauration provenance depuis config ou table `SceneManifest`
- **Thème** : `Theme_document`, sinon thème de l'instance Grist, sinon mise en page d'origine ; le fond de carte et les palettes par défaut le suivent (le style QML prime toujours).
- **Vues enregistrées** de la carte (colonne `VuesQ2G` de `Atlas_ScenePrefs`).
- **Formulaires terrain QField** : `lib/qgis-form-to-formdef.js` produit un FormDef par couche ; un champ lié à une table non importée est dégradé en texte, la colonne affichée d'une liste liée est un libellé (`value_fr`, `name`…, jamais `fid`) ; « Publier le pack » crée les pages Carte, Terrain et une page de saisie par formulaire.
- **Contrôles** : un style gradué ne donne qu'une plage (pas de liste de sélection en doublon sur le même champ).
- **Classification par défaut** : `internal` (aucune mention d'organisation dans le code, les tests ni les fixtures).
- Tests : `node --test` sur `tests/*.test.js` (585) et 19 cas de référence du harnais (`tests/harness/README.md`).

Phases suivantes : import `.grist` (Phase 4), tests manuels §8.

## Points d'attention

### Les entités sont libérées après l'import

À la fin de l'import, `index_v2.html` vide `layer.features` (mémoire). Tout code exécuté ensuite, en
particulier « Publier le pack » (`buildTerrainPack`, `inferVisibleCol`), ne voit plus les données : il doit
fonctionner avec le seul schéma. Les 19 cas de référence capturent l'état AVANT cette libération : un défaut
qui n'apparaît qu'à la publication se vérifie dans un vrai Grist (import « Remplacer », puis « Publier le pack »).

### Essai en local depuis Grist

Un widget servi sur `http://127.0.0.1:<port>` reste « pending » dans Chrome tant que l'accès au réseau local
n'est pas autorisé pour la page Grist (invite dans la barre d'adresse) : ouvrir la fenêtre Chrome, autoriser,
recharger. Le sélecteur de fichier ne fonctionne pas à travers l'iframe : utiliser les liens « Dev localhost »
(visibles seulement sur `localhost` / `127.0.0.1`).

### `BulkAddRecord` retVal capture

`result.retValues[0]` contient le tableau des nouveaux rowIds. Cette capture
est essentielle pour les Refs ; sans elle on ne peut pas indexer les parents.

### Tri topologique

Cycles ignorés via `visiting`/`visited`. Si A référence B et B référence A,
les deux sont émis dans l'ordre de découverte ; les Refs cycliques ne seront
pas résolues correctement (acceptable, c'est un cas exotique en QGIS).

### Réimport du même fichier

`startImport` (protégé contre le double clic par `Q2GGarde` : un seul import à la fois, bouton désactivé) génère un nom unique en suffixant (`Batiments_1`, `_2`…) : quatre
imports du même GPKG produisent quatre jeux de tables et quatre lignes
`SceneManifest`, sans que rien n'indique lequel fait foi. La prévisualisation
signale donc les tables homonymes déjà présentes (`renderReimportHint`) et offre
une case « Remplacer les tables existantes » — décochée par défaut, car un
remplacement détruit aussi les vues et les préférences de style (`Atlas_LayerPrefs`)
attachées à ces tables.

### Renommage de table en cas de collision

`tableNameRemap[layer.name] = tableName` enregistre la correspondance avant
`AddTable`. `resolveRefType` traduit ensuite `Ref:OldName` → `Ref:NewName` à
la création des colonnes Refs des enfants.

### `_valueMap` et le label Grist

Les valeurs catégorisées QGIS sont transformées en LABELS Choice à l'import.
Si l'utilisateur ajoute une nouvelle valeur dans Grist qui n'existe pas dans
`_valueMap`, elle sera stockée telle quelle. C'est OK : Grist accepte les
valeurs hors-`choices` (elles sont marquées invalides en UI mais persistées).

## Patterns réutilisables

- `parseOptionTree(el)` : parser récursif de `<Option type="Map|List|...">`,
  format de sérialisation `QgsXmlUtils::writeVariant`. Réutilisable pour
  d'autres outils QGIS web.
- `WkbReader` : parser WKB/EWKB/ISO Z·M·ZM pur JS, ~50 lignes.
- `topoSortByRefs(layers)` : tri topologique générique sur graphes de Refs.

## Documentation binding (v2)

- Spec : `docs/BINDING-QGIS-GRIST-CEREMA-v2.md`
- **Cadrage (gate)** : `docs/CADRAGE-v2.md` — D1–D10 actés ; Phases 1–2 autorisées
- v1 : `index.html` (Leaflet) · v2 : `index_v2.html` (carte du composant Atlas par défaut, MapLibre en repli)

## Publication

```bash
node scripts/promote-qgis2grist.js --out <dossier>   # promotion d'essai : published/ n'est pas touché
npm run promote:qgis2grist                            # → published/qgis2grist/v2/ + package.json dual
npm run manifest
```

La promotion :
- copie tout `lib/*.js` et embarque dans `v2/vendor/grist_forms/` les dépendances de Form Builder (moteur, pont,
  types… et les 4 fichiers du thème : `theme`, `theme-instance`, `derivation-valeurs`, `themedef`) en réécrivant leurs chemins ;
- versionne tous les scripts `lib/` (`?v=<version>`) : changer `VER` dans le script à chaque publication, sinon un
  navigateur garde l'ancien module ;
- **échoue** si le paquet contient le nom de l'organisation (décision de Nicolas : jamais dans ce qui est publié) ;
- ne régénère pas les pages sans rapport : `npm run manifest` et `scripts/generate-vitrine.js` réécrivent des dates
  dans d'autres widgets, à ne pas commiter.

Publier par pull request (jamais de push direct sur `main`, qui déploie GitHub Pages). Essayer le paquet promu dans un
vrai Grist avant : import « Remplacer », « Publier le pack », saisie par les formulaires.

| Widget ID | URL | Contenu |
|-----------|-----|---------|
| `qgis2grist` | `…/qgis2grist/` | **v1** Leaflet (stable) |
| `qgis2grist-v2` | `…/qgis2grist/v2/` | **v2 2.1.0** carte Atlas (MapLibre en repli) + Scene Manifest + terrain |

`terrain.html` + deps `grist_forms` vendorisées sous `v2/vendor/grist_forms/`.

## Tests manuels

Fixtures : `tests/fixtures/web/qfield_bees.zip`, flood HTML.
Automatisés (échantillon) : `node --test projects/qgis2grist/tests/`

Vérifier dans Grist :
- Labels humains présents sur les colonnes.
- `Choice` avec choix valides pour ValueMap.
- `Ref:Parent` cliquable sur les FK (le widget Grist doit afficher la ligne parent).
- Restauration après reload du widget.
- **v2** : table `SceneManifest`, toast Atlas-ready, pack terrain.

## Import : options de performance (Q2GImport.importLayers)

**Lots d'import : ACTIFS par défaut** depuis la validation en Grist réel (09/11/2026) : profil `perf: 'rapide'` (lots de 5000 lignes ou 700 Ko estimés, sans relecture inutile de la table). `index_v2.html?perf=standard` revient aux lots d'origine (100 lignes avec géométrie, 500 sinon, relecture après chaque couche de points).

Mesures en Grist réel (docs.getgrist.com, document anonyme, widget local relié par un pont, tables relues et comparées) :

| Cas synthétique | lots d'origine | profil rapide | tables obtenues |
|---|---|---|---|
| 50 000 points | 19,0 s | 6,3 s | identiques (lignes, ids, colonnes, schéma) |
| 5 000 polygones (40 sommets) | 8,3 s | 3,4 s | identiques |

- Limite mesurée d'une requête `applyUserActions` : 32,75 Mo acceptés en un appel (33 554 lignes de 1 000 caractères) ; débit d'environ 1,5 Mo/s, latence fixe par appel de l'ordre de 40 ms. Un essai à 64 Mo n'a pas abouti (onglet perdu, résultat inconnu) : la limite réelle est donc comprise entre 32 et 64 Mo ou plus, mais non établie.
- Le plus gros appel émis par le profil rapide fait moins de 0,6 Mo (essais sur 50 000 points, 3 000 polygones de 2 000 sommets, 3 000 textes de 10 Ko) : marge de 50 sous la limite mesurée. Des lots plus gros (20 000 lignes, 4 Mo) ne vont pas plus vite (7,4 s et 3,5 s) : le gain vient du nombre d'appels, pas de la taille.
- Instance DINUM/autre : limite non mesurée (le pont d'essai passe par l'API interne de la page Grist, pas par l'iframe d'un widget) ; un proxy qui limiterait la taille des messages WebSocket est le seul risque connu, d'où `?perf=standard`.

Options non activées par défaut :

- `batchMaxRows`, `batchMaxBytes` : lots bornés en lignes et en octets estimés (l'emportent sur `perf`).
- `skipUselessRepairFetch` : ne relit pas la table si aucune longitude n'est réparable (inclus dans le profil rapide).
- Lecture GeoPackage : `Q2GGpkg.configure({ gpkgOptions: { paged, pageSize, keyset, maxRows, limits, onWarning } })` (pages sans garder le GeoJSON complet, garde de volume 300 Mo / 500 000 entités par couche, avertissement à 50 000). Activée par `index_v2.html?perf=rapide` seulement : non mesurée en Grist réel, elle refuse au-delà de la garde.

**Correctif NON appliqué (la sortie d'import changerait)** : `enrichFieldFromWidget` met le format de date en minuscules, donc le `MM` (mois) d'un format `yyyy-MM-dd` vaut des minutes et donne une colonne `DateTime` au lieu de `Date` (7 champs des fixtures Bees et Wastewater, donc 2 golden d'import et 2 golden de parse). Le correctif (`formatHasTime` sensible à la casse) est écrit mais non appliqué ; à décider avec Nicolas.
