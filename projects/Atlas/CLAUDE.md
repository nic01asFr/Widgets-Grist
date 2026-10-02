# Projet : Atlas — Maquette 3D Territoriale

## Contexte

Widget Grist de maquette territoriale 3D (MapLibre + three.js), direction UX **Atlas**.
Cible : construire et présenter une scène (import, symbolisation, contrôles, récit, modèles 3D).

Interop Cerema : lecture **Scene Manifest V0.2.2** produit par qgis2grist, prefs utilisateur
`Atlas_LayerPrefs`, récit `Atlas_Story`.

## Architecture des fichiers

```
Atlas/
├── index_v7.html          # Entrée courante (v7) — source de publication
├── app_v7.js              # Logique v7 (ES module)
├── lib/                   # 67 modules ES, sans dépendance à app_v7.js (voir familles ci-dessous)
├── docs/                  # cadrages (CADRAGE-*.md), BINDING-*, CARTE-DES-EXPOSITIONS, BILAN-*, études-*
├── tests/                 # node --test (88 fichiers, 1241 tests au 02/10/2026)
├── tools/                 # verifier-imports.mjs, verifier-references.mjs, livrable-autoportant.mjs
└── CLAUDE.md
```

Familles de `lib/` (état du 02/10/2026) :

| Famille | Modules |
|---|---|
| Scène et manifeste | `scene-loader`, `scene-externe`, `scene-prefs`, `manifest-binding`, `declarative-style`, `controls`, `viewer-controls`, `story`, `recit-cles`, `contextes`, `trajet` |
| Grist (lecture, écriture, droits) | `grist-adapter`, `grist-sync`, `grist-rows`, `grist-bool`, `geo-tables`, `schema-grist`, `atlas-tables`, `table-reference`, `droits-tables`, `data-client`, `view-mode`, `posture`, `exposition` |
| Fiche, formulaires, relevé | `fiche-formulaire`, `formulaire-atlas.css`, `saisie-objet`, `releve`, `ouvrir-objet`, `objets-liste`, `bulle-objet` |
| Géométrie et dessin | `geometrie-saisie`, `nouvelle-couche`, `wkt`, `point-fallback`, `volume-relief`, `terrain-base`, `viewport` |
| Objets 3D et catalogue | `model-layer`, `catalogue-objets`, `modele-id`, `palette-objets`, `gltf-chargeur`, `parametres-objet`, `parametres-figer` |
| Éclairage et soleil | `eclairage-profil`, `eclairage-rendu`, `luminaires-three`, `facades-eclairees`, `nuit-rendu`, `qualite-eclairage`, `soleil`, `arc-solaire`, `horloge-scene` |
| Hôte, interface, import | `hote`, `hote-ui`, `habillage-carte`, `feuille-mobile`, `edge-scroll`, `layer-order`, `ouvrir-fichier`, `osm-requete`, `vue-import`, `basemap-layers`, `decouverte`, `graine`, `html` |

> **`projects/Atlas/app.js` sur `origin/main` — ne pas écraser.**
> Cette entrée pré-v7 (3 110 lignes) porte des fonctionnalités **absentes de la
> v7 et de la version en ligne** : l'export QGIS (`layerToQML`, `qgisSymbol`,
> `hexToQgisColor`, `downloadFile`) et le modèle 3D par objet en pièce jointe
> Grist (`model_glb`, colonne `Attachments`).
>
> **Elles étaient trois, pas deux.** `entableLayer` — écrire une couche importée
> dans une vraie table Grist, une ligne par objet, par lots de 200 — s'y trouvait
> aussi, et n'avait jamais été signalée. Sans elle, un import OSM dépose une
> **seule ligne** dans `Maquette_Layers` avec tout le GeoJSON : aucun objet n'a de
> `_row_id`, et la fiche d'entité est en lecture seule faute de ligne à mettre à
> jour. **Récupérée le 05/09/2026** sur la branche `atlas-formulaire-entite`
> (voir `docs/CADRAGE-FICHE-ENTITE.md`). La leçon vaut pour les deux qui restent :
> l'inventaire de ce fichier n'était pas complet, et rien ne dit qu'il l'est
> maintenant. Elles ont quitté le widget lors du
> passage à la v7, le 30 juillet 2026 — sans décision explicite : la v7 a été
> développée sur une branche qui ignorait cette lignée.
>
> Tant qu'elles ne sont pas portées dans la v7, ce fichier est leur **dernière
> copie**. Les versions de travail pré-v7 ont été retirées du poste
> (sauvegarde : `backups/atlas-prev7/`) parce qu'un `git add projects/Atlas/`
> aurait remplacé la version complète par une copie tronquée de 2 371 lignes.
>
> Portage : l'export QGIS ≈ 108 lignes, quatre fonctions isolables en
> `lib/qgis-export.js` — mais le QML doit alors être **généré depuis le
> StyleDeclarative**, pas depuis l'état interne, pour respecter
> `BINDING-QGIS-GRIST-CEREMA-v2.md` §5.2. Pour `model_glb`, arbitrer d'abord la
> coexistence avec le catalogue partagé (`catalog.json`) : pièce jointe par objet
> > `gltf_url` de couche > catalogue > cercle 2D.

**Publication** : `published/atlas/` = copie de `index_v7.html` → `index.html`, `app_v7.js` → `app.js`, + `lib/`.

## Décisions techniques

1. **MapLibre GL JS v5** (globe) — plus de Mapbox.
2. **Modèles 3D** : custom layer three.js / InstancedMesh (`Models3D`).
3. **Fonds** : OpenFreeMap + IGN Géoplateforme.
4. **Binding** : Scene Manifest → style + controls ; prefs Atlas prioritaires (voir `docs/BINDING-ATLAS-v7.md`).
5. **Inspecteur droit** : ouvert au clic couche ; fermeture via ✕ (pas de pastille flottante).
6. **Dock soleil** : barre compacte ancrée à gauche de la boussole, repliable en pastille soleil.

## Modules UI

Lieu · Couches · Soleil · Vues · Contrôles · Récit · Réglages (+ symboliser via inspecteur).

## État actuel — fonctionne

**En ligne : v1.10.2** (`published/atlas/`, GitHub Pages, 02/10/2026, commit `cefce59` sur `main`). La 1.10.1 a corrigé les pastilles de contrôle retirées par un contexte ; la 1.10.2 fait lire les contrôles publiés en entier (voir « Les contrôles publiés se lisent en entier »). L'APK 1.10.2 est publié en release `atlas-v1.10.2` (Latest, asset `atlas.apk`) ; le bouton de la vitrine le sert. Le fil du forum n'est pas mis à jour.
Contenu de la 1.10.0 : relevés de terrain (droits par table, postures, récit à clé, contextes, bulle d'objet, liste d'objets, tables de référence, WKT), identifiant de modèle `objet:<type>`, paramètres d'objet à trois niveaux et panneau « Spécifications », éclairage qui dit son état, colonne `atlas_3d_json` fiable. Bilan : `docs/BILAN-02-10-2026.md`.
Tests : 1241 verts.

- Chargement Scene Manifest / tables qgis2grist (cas Bee Farming validé).
- Symbolisation (fixe / catégorisé / gradué), récit, export JSON `2.2-atlas-binding`.
- **Contrôles par type de colonne Grist** : dates, nombres, catégories, listes,
  recherche texte ; « (sans valeur) » est un choix ; publiés en pastilles.
- **Fiche d'objet = formulaire** (`grist_forms`), saisie hors édition ; module
  Formulaires avec composition, cadrage des champs, **retrait et remise** par couche.
- **Fonds IGN** : orthophotographie bornée au zoom 19, relief LiDAR HD ; une étape
  de récit capture la source du relief et son exagération.
- **Scène externe** (`?scene=`) : manifeste publié, sans document ; démos
  `cascade-aygalades-marseille` et `osm-marseille-vieux-port` publiées.
- Dock soleil haut-droite (repli style boussole) ; inspecteur fermable.
- Couches fond (buildings/landscape/lines) masquées par défaut à l’import.
- **Objets réalistes réglés comme une couche** (non publié) : panneau « Spécifications »,
  trois niveaux (objet > champ > couche > catalogue > règle), provenance affichée, « figer dans
  la table » ; éclairage allumé selon statut et soleil, état dit en fiche, légende et bulle.
- **Postures** Préparer / Exploiter / Lecture sous un plafond fixé par le lien ; droits lus table par table.
- **Mode lecture** : `?mode=view` ou accès Grist `read table` ; badge Lecture ; pas d’écriture prefs/story/features.
- **Mobile ≤720px** : bottom nav Carte / Couches / Récit ; panneaux en sheet ; géolocalisation ; `?no3d=1` / light3d.

## Points d’attention

- **Fiche d'entité = formulaire (06/09/2026)** :
  `docs/CADRAGE-FICHE-ENTITE.md` — la fiche d'objet est le moteur de
  `grist_forms`, alimenté par le FormDef que qgis2grist extrait de QField.
  Éprouvé en Grist réel ; en ligne depuis la 1.7.0.

  Trois surfaces : la fiche d'objet, le **module « Formulaires »** du rail (après
  Récit — liste par table, choix, bascule « disponible hors édition »), et le
  générateur, qui reste hors d'Atlas. **Atlas ne crée aucun formulaire** et n'en
  livre aucun : c'est l'utilisateur qui bâtit le sien, comme il écrit son récit.

  Le **mode exploitation** : en lecture, un clic sur un objet ouvre la fiche au
  lieu du popup quand la scène a publié le formulaire — `saisieHorsEdition`
  (`lib/fiche-formulaire.js`) porte la règle, `coucheEnSaisie` (`app_v7.js`) en
  est la seule porte. `CONFIG.peutSaisir` est **orthogonal** à `viewMode` :
  l'un dit « on ne montre pas les outils d'auteur », l'autre « cette personne
  peut écrire ».

  Deux acquis à ne pas redécouvrir. **On ne prédit pas ce que Grist répondra** :
  une sonde d'écriture au chargement interroge une table arbitraire
  (`resolveProbeTableId`), pas celle qu'on veut écrire — c'est Grist qui filtre,
  et un refus réel se nomme. Et **Grist impose son thème au widget en style EN
  LIGNE** sur `<html>` : `color-scheme: light` exige `!important`, sans quoi les
  contrôles natifs sont peints en sombre.

  **Retirer un formulaire** (16/09/2026, étendu le 24/09/2026) : chaque
  formulaire d'une couche, `Attributs` compris, porte « Retirer ». C'est un
  réglage de la scène (`formulaire.retires` dans les prefs), réversible : la
  ligne de `Formulaires` reste, le cadrage des champs aussi, et « Remettre » le
  rend tel qu'il était. Retirer le sort des formulaires proposés hors édition.
  Auparavant un formulaire composé ne pouvait que s'ajouter — « Saisie »,
  « Saisie 2 », « Saisie 3 » s'empilaient dans la fiche.
  **Une seule garde : le dernier formulaire en place ne se retire pas**
  (`raisonNonRetirable`, `lib/fiche-formulaire.js`) — sinon l'objet n'aurait
  plus de fiche. Le module dit alors « dernier formulaire de la couche » au
  lieu de « Retirer » (rien du tout sur une couche qui n'a jamais porté
  qu'`Attributs`), et `formulairesPourCouche` tient la même garde à la
  relecture : des réglages qui retireraient tout laissent le premier en place.
  Une scène peut donc n'offrir qu'un formulaire personnalisé : `Attributs`
  retiré, la fiche s'ouvre sur le premier restant et son onglet disparaît.

### Dans l'application, le schéma du document ne passe pas par la même porte

`chargerSchema` lit `_grist_Tables` et `_grist_Tables_column`. L'API plugin les
sert comme n'importe quelle table ; l'**API REST non** — son point `/records` ne
connaît que les tables de l'utilisateur. Le client REST les lit donc par `/sql`,
qui les sert (`ClientRest._fetchMeta`).

> **Sans ce détour, le schéma est vide dans l'application.** Et un schéma vide,
> c'est : plus de formulaire déduit (« Attributs »), plus de formulaire lié —
> `tablesReferencant` n'a plus rien à parcourir —, donc une fiche d'objet qui
> paraît n'offrir aucun formulaire. Rien ne le signale : c'est une lecture qui
> échoue, pas une fonction absente. Constaté sur le téléphone le 18/09/2026.

Corollaire : tout ce qui lit des métadonnées marche dans les deux mondes —
`scanGeoTables` compris.

### Les photos d'une fiche : c'est Atlas qui verse, pas le moteur (18/09/2026)

Une colonne `Attachments` donne un champ fichier dans la fiche. Le moteur ne
l'envoie plus lui-même : le pont lui passe `uploadFile`, et
`televerserPieceJointe` (`lib/data-client.js`) choisit la façon de se présenter
selon l'endroit où Atlas tourne. **Les deux passent**, vérifié dans le document
de non-régression :

| Où | Comment il se présente |
|---|---|
| Widget dans un document | jeton signé (`?auth=`) **+ `X-Requested-With: XMLHttpRequest`** |
| Application de terrain | clé d'API en en-tête `Authorization`, émise par `CapacitorHttp` |

> **Une erreur de diagnostic à ne pas refaire.** On a cru, mesure à l'appui, que
> l'instance refusait l'envoi depuis l'origine d'un widget : la requête revenait
> en `net::ERR_FAILED` et rien n'était créé. Il manquait `X-Requested-With`,
> qu'exige la protection CSRF de Grist sur toute requête sans session. L'instance
> répondait donc 401 — une erreur **sans en-têtes CORS**, que le navigateur masque
> exactement comme un refus d'origine. Même symptôme, cause opposée. L'en-tête
> ajouté, la photo est arrivée (`photo_essai.jpg`, pièce jointe n° 1). La solution
> était déjà écrite dans SURFAC²E (`atlas_bati`, `materialiserPJObjet`).
>
> Le raccourci trompeur : « pas d'en-tête = requête simple = pas de CORS ». C'est
> vrai du navigateur, et sans objet ici — le refus venait du serveur.

**Le corps multipart est construit par Atlas** (`corpsMultipart`), pas confié à
un `FormData`. Dans l'application, Capacitor 6.2 reconstruit un `FormData` en
Java et ajoute `Content-Transfer-Encoding: binary` à chaque fichier ; le lecteur
de Grist **plante** dessus. Reproduit le 18/09/2026, même corps, même fichier :
avec l'en-tête **500 Internal Server Error**, sans lui 200. Atlas écrit donc les
octets lui-même et les confie à un `File` — le seul corps binaire que Capacitor
transmet tel quel (un `Uint8Array` y serait décodé en texte). Le nom du fichier
part en UTF-8, comme depuis un navigateur. Le garde d'écriture est consulté avant l'envoi — verser
un fichier **est** une écriture. Et `uploadFile` est `async` : un refus lancé de
façon synchrone sortirait de la chaîne de promesses du moteur, et la fiche
resterait figée sur « Envoi… ». Un échec sans réponse s'affiche en clair plutôt
qu'en « Failed to fetch », sans prétendre en connaître la cause.

L'application embarque désormais le moteur de formulaire (`scripts/vendoriser.mjs`
copie les six scripts de `grist_forms`, comme `promote-atlas.js`). Sans cela, la
fiche retombait sur les champs devinés dans le paquet — et c'est justement là que
la saisie de terrain a le plus de sens.

  Reste : la couche `-hit`, le mode consultation du moteur, et l'ACL dérivée
  du FormDef. Le vendoring de `grist_forms` est réglé : `scripts/promote-atlas.js`
  copie les six scripts (liste `VENDOR`) dans `published/atlas/vendor/` et
  réécrit les `<script src>` de la page — plus rien ne bloque la fusion.

- **Cadrage portable / partage iframe (26/08/2026)** :
  `docs/CADRAGE-PORTABLE-PARTAGE-IFRAME.md` — Grist = socle droits ; Atlas
  portable = Scene Manifest existant ; embed privé = session document + ACL /
  link keys ; Component Manifest hub hors contrat Atlas.

- **Colonnes géométriques** : `source.geometry_fields` du manifest prime sur la
  convention `latitude`/`longitude`/`geometry_json`. Sans lui (imports anciens),
  repli sur les variantes suffixées (`latitude2`) quand lat/lon valent 0 —
  collision qgis2grist. `(0, 0)` est traité comme « pas de coordonnée ».
- **Visibilité par défaut** : sans `visibility.defaultVisible` explicite,
  `isBasemapLayer` masque toute couche de plus de 2 500 entités. Une couche
  d’analyse volumineuse doit donc porter `defaultVisible: true` dans le manifest.
- **Chargement différé** : une couche masquée de plus de `DEFER_FEATURE_THRESHOLD`
  entités n’est convertie en GeoJSON qu’à son activation (`materializeDeferredLayer`).
  Le critère est le volume seul — pas le nom de la couche. La matérialisation est
  portée par `setLayerVisibility`, donc valable quelle que soit l’origine de
  l’activation (pastille, récit, prefs).
- **Bornes de zoom du manifeste** : appliquées (voir « Les bornes de zoom du
  manifeste sont appliquées », plus bas). Cette ligne a longtemps dit le
  contraire.

- **Zone de travail retirée du panneau Lieu.** `setRadius` stockait la valeur et
  redessinait le panneau ; `STATE.location.radius` n’était lu nulle part ailleurs.
  Quatre boutons sans effet. Ne pas la remettre sans lui donner un rôle réel —
  emprise d’import OSM, cadrage caméra, ou cercle sur la carte.

## Apparence des couches

Réglages portés par `style.symbolization` (persistés dans `Atlas_LayerPrefs`) :

| Réglage | Clé | Défaut |
|---|---|---|
| Opacité de couche | `opacity` | `null` = suit l’entité puis la géométrie (point 0.92 · ligne 0.9 · surface plate 0.55 · volume 0.85) |
| Contour | `stroke: {enabled, mode, color, width}` | actif, `mode:'follow'` (suit le remplissage), 1.5 px |
| Base d’extrusion | `extrusion.base` | 0 |
| Étiquette | `label: {size, color}` | 12 px, `#2D2820` |
| Rendu surfacique | `style.polygonMode` | `'flat'` pour les imports qgis2grist |

- **Un volume est opaque, et ce n'est pas un goût.** `fill-extrusion-opacity`
  sous 1 fait basculer MapLibre en rendu transparent : il cesse d'écrire la
  profondeur, et l'occlusion est perdue. Chaque bloc laisse alors voir sa face
  arrière au travers de sa face avant — un double contour sur chaque objet —,
  les recouvrements s'assombrissent par accumulation d'alpha, et **deux couches
  extrudées se traversent** au lieu de se masquer. Sur une grille d'analyse
  dense, le relief de l'information disparaît dans une bouillie.

  Le basculement est **binaire** : éprouvé à 0,999, 0,99 et 0,95 sur deux
  couches superposées, l'artefact est déjà là — seule son intensité suit
  l'opacité. Il n'existe pas de « presque opaque » utilisable. Le défaut d'un
  volume est donc **1**, dans `defaultLayerOpacity` comme dans le repli en dur
  d'`applyPolygonStyle`.

  À plat, c'est l'inverse : la semi-transparence laisse lire le fond sous la
  donnée, et MapLibre drape sans problème de profondeur — d'où 0,55.

  > Une opacité explicitement choisie reste respectée : on peut vouloir voir au
  > travers, en connaissance de cause. Mais une scène qui déclare `opacity: 0.9`
  > sur du bâti extrudé demande l'artefact sans le savoir — c'était le cas de la
  > démo des Aygalades avant correction.

- **Ordre de priorité de l’opacité** : valeur fixée par l’utilisateur → `_fill_opacity`
  de l’entité (issue des `stops[].opacity` du style déclaratif, lue par
  `opacityFnFromDeclarative`) → défaut de la géométrie.
- `_fill_opacity` n’est posé sur une entité **que** si une opacité est déclarée ;
  sinon il reste absent pour que le `coalesce` retombe sur l’opacité de couche.
- Le contour en mode `follow` réutilise `layerPaintColor`, donc il suit la
  symbolisation (catégorisée ou graduée) au lieu d’une couleur unique.
- Sur une surface **à plat**, l’onglet Taille masque « Hauteur extrusion » —
  le réglage serait sans effet. La bascule « À plat / En volume » le réactive.
- **`polygonMode` par défaut** : `’flat’` n’est posé d’office que pour les imports
  `qgis2grist`. Toute autre couche surfacique part donc **en volume** (`extrude =
  polygonMode !== ‘flat’`), ce qui la rend invisible en vue régionale (sous-pixel,
  et le repli en points ne vise que les surfaces à plat) et coûte très cher au
  rendu. Une grille d’analyse doit déclarer `polygonMode: ‘flat’`.
- **`_fill_color` fait foi dès qu’un style déclaratif existe** (`layerPaintColor`),
  plus seulement pour `qgis2grist` : une table Grist stylée par un récit se peint
  comme un import.
- **Les couleurs du déclaratif priment sur la rampe nommée**
  (`sequentialPaletteForSym`). Sans cela `applyLayerStyle` recoloriait les couches
  `qgis2grist` depuis `colorRamp` et effaçait la symbologie du récit.
- **Une valeur hors classification prend le repli, jamais une classe.**
  `expressionCouleurDeclarative` est un `case`, pas un `step` : `step` ne compare
  qu'en `>=`, or les classes d'une graduation sont **hautes inclusives** (règle
  de QGIS, et celle qu'applique `stops.find()` côté peinture par entité). Une
  valeur posée sur une borne partagée — 50 entre `[0,50]` et `[50,200]`, cas
  courant puisque les bornes sont rondes — changeait de classe selon qu'Atlas
  détient ses entités ou non. Corollaires : un attribut absent, à `null` ou
  portant la chaîne `'NULL'` (fréquent en sortie de base — un bâtiment sur 400
  à Sète) tombe au repli au lieu de se lire comme une mesure basse ; et le
  repère hors-classe est **fini**, car `-Infinity` s'écrit `null` en JSON et
  `to-number(null)` vaut **0** — une expression réenregistrée dans
  `Atlas_LayerPrefs` aurait reclassé toutes les entités muettes dans la classe
  qui contient zéro, à la seconde ouverture seulement.
- **Classes graduées bornées** : si les `stops` portent `lower`/`upper`, ils sont
  appliqués tels quels ; l’étalement linéaire min→max n’est qu’un repli. Sur une
  distribution asymétrique (mailles à 1–2 bâtiments, maximum à 134) l’étalement
  verse la quasi-totalité dans la première classe.
- **`label` est créé s’il manque**, comme `stroke` et `extrusion`.
  `initSymbolization` se contentait de le compléter : une couche enregistrée
  avant l’arrivée des étiquettes — ou restaurée depuis une étape de récit
  ancienne, `applyStoryLayerMeta` remplaçant toute la symbolisation — arrivait
  sans `label`, et l’onglet Étiquette lisait `undefined.enabled`.
- `applyLayerPrefsBinding` restaure l’apparence **en plus** du style déclaratif
  (`mergeAppearancePrefs`) : un `declarative` dans les prefs ne doit pas effacer
  opacité, contour ni base d’extrusion.

## Ce que seul un vrai document révèle (05/09/2026)

`?scene=` n'appelle jamais `grist.ready()` : tout ce qui touche à l'écriture, aux
droits et au mode édition lui est **hors de portée**. C'est pourquoi le mode
édition n'avait jamais été examiné. Une session dans le document de
non-régression, widget servi en https local, a sorti trois défauts en une heure.

### Un halo `circle` sur un polygone dessine un disque par sommet

`updateHighlight` versait la géométrie entière dans une source et la peignait
avec **une seule couche `circle`**. Sélectionner un bâtiment rectangulaire
donnait quatre pastilles de 16 px empilées, qui **recouvraient entièrement**
l'objet qu'elles désignaient — à z16 un bâtiment de 15 m fait une poignée de
pixels. Le halo avait été conçu pour des points et jamais repris.

`HALO_SELECTION` porte désormais trois couches filtrées sur `['geometry-type']` :
remplissage et contour pour les surfaces, contour pour les lignes, anneau pour
les points. Les trois sont dans `SYSTEM_TOP_IDS`, sinon le contour d'un objet
sélectionné passerait sous la couche qui le porte.

### Le halo, éprouvé sur les trois familles

Vérifié dans le widget sur une couche mêlant volontairement les trois
géométries : 5 surfaces → rectangles sur leur emprise, 1 point → **un** anneau,
1 ligne → une polyligne suivant ses sommets. C'est le seul contrôle qui vaille,
puisque `?scene=` ne donne pas accès au mode sélection.

> **Au passage** : une `LineString` dans une couche `polygonMode: 'volume'` est
> **fermée en anneau et extrudée** par MapLibre — trois sommets donnaient un
> grand triangle translucide sur tout un pâté de maisons. Rien ne le signale.
> Une table mêlant les géométries est un cas de saisie plausible ; Atlas n'a
> aujourd'hui ni garde ni avertissement pour cela.

### `manualSort` était un attribut éditable, et il repartait en base

La même règle — « ces colonnes appartiennent à Grist » — était écrite en
**quatre endroits**, et ils divergeaient :

| Site | `id` | `manualSort` |
|---|:-:|:-:|
| `tableToGeoJSON` (chemin maquette) | ✓ | ✓ |
| **`rowToFeature`** (chemin manifeste — celui qui compte) | ✓ | ✗ |
| `SKIP_PROPS` (écriture) | ✗ | ✗ |
| `renderAttrFields` (inspecteur) | ✗ | ✗ |

Conséquence mesurée en Grist réel, charge utile d'un enregistrement :

```json
["UpdateRecord","Batiments_locaux",3,{"manualSort":3,"hauteur":12.5,"nom":"Mairie",…}]
```

`manualSort` porte l'ordre des lignes. Exposé comme attribut, il devenait un
champ **éditable** : y taper une valeur réordonne la table de l'utilisateur,
sans rapport avec quoi que ce soit de géographique. `COLONNES_INTERNES_GRIST`
(dans `lib/grist-rows.js`) est maintenant la liste unique, lue par les quatre.

### Une erreur attendue qui s'affiche comme une vraie use la vigilance

`syncStoryFromGrist` relisait `Atlas_Story` par un `fetchTable` direct, **sans
vérifier que la table existe**, pour compter ses lignes brutes — alors que
`loadStoryFromGrist` venait de le faire proprement. Sur tout document sans
récit, cela produisait un `[Sandbox] KeyError 'Atlas_Story'` dans la console **à
chaque chargement**, avalé par un `catch` muet.

`chargerRecitGrist` rend maintenant `{ recit, lignesBrutes }` en une seule
lecture. Le comptage garde son rôle — `normalizeStoryRows` déduplique par étape,
donc un écart signale des lignes à nettoyer.

> **À savoir** : `listTables()` coûte un `fetchTable('_grist_Tables')` complet,
> et il est appelé **six fois** au chargement d'une scène. Ce n'est pas corrigé.
> C'est la même famille que le scan des tables géo (126 Mo → 27 Mo), en beaucoup
> moins grave.

## Placement 3D réservé aux couches à modèles (`lib/model-layer.js`)

`isModelLayer(layer)` = mode `library`/`custom` **et** géométrie ponctuelle. Les
réglages de placement (échelle, rotations, altitude, décalages) pilotent une
instance three.js posée sur un point — `Models3D.placement()` lit
`feature.geometry.coordinates` comme `[lng, lat]` — donc ils n'ont ni effet ni sens
sur une surface, une ligne ou un point rendu en cercle 2D.

- L'inspecteur d'objet compose ses onglets via `objectInspectorTabs()` :
  « Attributs » pour tout objet unique (édition si `qgis2grist`, lecture sinon),
  « Placement 3D » seulement si `isModelLayer`. Une sélection multiple non 3D
  n'a aucun onglet et affiche un état vide.
- **Le corps de l'inspecteur suit l'onglet actif.** Il avait auparavant sa propre
  cascade de conditions : retirer l'onglet sans toucher au corps aurait laissé les
  curseurs 3D visibles pour les objets non `qgis2grist`, en sélection multiple et
  en mode lecture.
- **`atlas_3d_json` n'est sérialisé que pour une couche à modèles**
  (`featureToRowUpdate`). C'est la seule garde qui protège la donnée : sans elle,
  des surcharges héritées — ou une couche ayant changé de mode — écriraient des
  transformations 3D sur des objets qui ne seront jamais rendus ainsi.
- « Reset » ne rétablit que les surcharges de placement : il n'apparaît qu'avec
  l'onglet 3D. « Enregistrer » reste, car `applySelected` persiste aussi les
  attributs.
- La règle est réécrite à la main en **8 points** d'`app_v7.js` (les numéros
  autrefois notés ici étaient périmés — le fichier a gagné 900 lignes). Audit du
  04/09/2026 : la dette est **cosmétique**, pas fonctionnelle. Cinq sites
  omettent la condition ponctuelle, mais quatre sont protégés par un aiguillage
  en amont — `applyPointStyle` n'est appelée que sur des points, l'onglet
  « Modèle 3D » n'apparaît que si `isPoint`, `resolveFeatureProps` ne sert qu'aux
  instances. Restent `renderLayersPanel` et `renderLayersPanelLecture`, qui
  posent un **badge « 3D »** sur une couche non ponctuelle déclarant un
  `gltf_url` — et seulement en édition, le panneau Couches étant refusé en mode
  vitrine. Vérifié sur une scène d'essai : un polygone portant un `gltf_url` est
  bien rendu en surface, jamais en cercles.

## Modèles glTF compressés et feuillages découpés (19/09/2026)

Préalable à la végétation générée par pix2hdr (cadrage
`pix2hdr/docs/CADRAGE-GENERATEUR-VEGETATION.md`). Deux règles, dans
`lib/gltf-chargeur.js` (testées) :

- **`fixGltfMaterial` garde le seuil de découpe d'un matériau `alphaMode: MASK`**
  (`seuilDecoupe`). Le reste est inchangé : `BLEND` reste forcé en opaque contre
  le « fantôme » des modèles photogrammétriques. Aucun modèle du catalogue livré
  ne déclare de transparence. Symptôme de l'ancien comportement, mesuré sur le
  platane d'essai : **pas de rectangles** — la couleur sous la partie
  transparente est verte (débord de texture), les cartes se fondent en houppier
  plein, sans trou de ciel, avec une ombre trop dense. À l'œil, rien ne signale
  le défaut : le vérifier par la mesure.
- **Le chargeur lit `EXT_meshopt_compression` et `KHR_texture_basisu`**
  (`Models3D.chargeurGltf`). KTX2Loader exige `detectSupport(renderer)` : le
  chargeur n'est gardé qu'une fois le renderer créé (`onAdd`), et libéré avec
  lui (`onRemove`). Le transcodeur Basis se charge par un chemin, pas par un
  import : `cheminTranscodeur` le demande à la carte d'import
  (`import.meta.resolve`), donc CDN dans le widget, `./vendor/three-addons/`
  dans l'application. Écrit en dur, il aurait échoué hors réseau sans message.
  `packages/atlas-app/scripts/vendoriser.mjs` embarque KTX2Loader, WorkerPool,
  ktx-parse, zstddec, meshopt et le transcodeur (`.js` + `.wasm`).

Éprouvé le 19/09/2026 : 885 arbres OSM de Longchamp en platane compressé
(1,9 Mo, contre 18,8 Mo non compressé), feuilles découpées, dans le widget
**et** dans le paquet de l'application, décodeurs lus en local. Un échec de
chargement ne laisse encore qu'un avertissement en console (`GLTF load failed`).

**Essai sans toucher au catalogue** : la liste des modèles est codée en dur
(`MODEL_LIBRARY.categories`) ; `catalog.json` n'est lu que pour vérifier la
source. On essaie donc un modèle par **substitution** : un dossier
`<base>/catalog.json` + `<base>/colored/TreeDeciduous.glb`, désigné par
`?models=<base>` (ou le champ Source du module Modèles). Dans l'application,
`window.__ATLAS_MODELES__` passe avant `?models=`.

## Catalogue d'objets paramétriques — `atlas-objets/0.1` (19/09/2026)

Contrat figé avec le générateur pix2hdr : `pix2hdr/docs/SPEC-ATLAS-OBJETS-0.1.md`.
Atlas **pointe** un catalogue et choisit, pour chaque objet, le modèle que ses champs
désignent ; il ne génère rien. Le catalogue low-poly reste le repli.

- **Lecture pure et testée** : `lib/catalogue-objets.js` (type par `matches`, départage
  priorité → spécificité → ordre du catalogue, mesures `osm_length`, seuils, fichier avec
  dégradation variante → variante 0 → niveau de détail le plus proche, saison) et
  `lib/graine.js` (FNV-1a sur la clé `ll:<microdegrés>`). Les deux passent **au bit près**
  les vecteurs du générateur, copiés tels quels dans `tests/fixtures/`
  (`graine-vecteurs.json`, `saison-vecteurs.json`) : ne pas les régénérer ici, c'est
  l'implémentation Python qui fait foi.
- **Pointer** : `?objets=<url>` ou module Modèles → « Catalogue d'objets » (mémorisé
  sur le poste, `atlas_catalogue_objets`). Un dossier désigne son `catalog.json`.
- **Sinon, le catalogue d'Atlas** (26/09/2026) : `objets/` (`CATALOGUE_INTEGRE`,
  `choisirCatalogue`), les dix luminaires EclExt du générateur (voir
  `objets/README.md`). Copié par `promote-atlas.js` (fichiers déclarés seulement,
  chacun vérifié) et embarqué par `vendoriser.mjs`. `tests/catalogue-integre.test.js`
  garde octets, md5, usage public et reconnaissance des fiches. « Catalogue
  d'Atlas » dans le module Modèles y ramène. **Licence des modèles à fixer avant
  publication.**
- **Une couche s'y soumet** par une 3ᵉ affectation de l'onglet Modèle 3D, « Catalogue »
  (`symbolization.model.mode === 'catalogue'`). Ce n'est **pas** un nouveau
  `style.mode` : de nombreux endroits reconnaissent un modèle 3D à `style.mode ===
  'library'`. Un import OSM la prend d'office si le catalogue reconnaît au moins un
  objet. Le modèle de la couche est le repli des objets non reconnus.
- **Composition (§5)** : échelle = échelle de couche × (hauteur mesurée / `height_m`,
  sinon tirage) ; azimut = azimut de couche + tirage. **L'azimut d'Atlas est
  `rotationZ`** (posé sur l'axe vertical de three.js par `placement()`), pas
  `rotationY` comme l'écrivait la spec.
- **Contexte public (§3.8)** : hors Grist et hors application connectée
  (`contextePublic()`), un fichier `usage: internal` est refusé → repli. Le panneau de
  la couche le **dit** : sans cela, on croit à une panne (vécu à l'essai).
- **Niveau de détail** : distance caméra → objet à la construction (`distanceCamera`),
  seuils du type ; pas d'hystérésis encore.

Éprouvé à Notre-Dame-du-Mont (Marseille, 1 332 arbres OSM) : platanes en 4 variantes,
orientés et dimensionnés par la graine. **Constat bloquant pour l'usage réel** : OSM
écrit `species` de sept façons (`Platanus x hispanica`, `× hispanica 'Vallis Clausa'`,
`×acerifolia`…), la comparaison exacte n'en reconnaît que 14 sur ~210 ; un opérateur de
correspondance est demandé pour la 0.2. Pas encore faits : shader de saison, semis de
surfaces (projection L93), échelle non uniforme.

## Éclairage EclExt et soleil de référence — modules posés (24/09/2026)

Contrat commun avec pix2hdr : `docs/PROPOSITION-CONTRAT-COMMUN-OBJETS.md`,
réponse et décisions actées (GO du 24/09/2026) :
`docs/etudes-pix2hdr/REPONSE-PIX2HDR-CONTRAT-COMMUN.md` §7. Cadrage :
`docs/CADRAGE-ECLAIRAGE-OBJETS-LUMINEUX.md`. Deux modules purs, branchés
depuis le 24/09/2026 (voir ci-dessous) :

- `lib/soleil.js` — traduction fidèle de `pix2hdr/src/pairs/sun.py` (NOAA) :
  `positionSoleil`, `coucherLever` (−0,833°, à la seconde, `null` en nuit ou
  jour polaire). C'est le soleil des **comportements** ; SunCalc reste celui de
  l'ambiance (il s'écarte jusqu'à 0,21°). `%` et `//` de Python reproduits.
  Écart mesuré à la référence : 1,6e-12° au plus, 20 cas sur 84 identiques au
  bit près — d'où des vecteurs **à tolérance** (1e-9°), provisoires
  (`tests/fixtures/soleil-noaa-vecteurs.json`, produits en exécutant la
  référence) jusqu'à ce que pix2hdr publie les siens.
- `lib/eclairage-profil.js` — heures EclExt (`HL`, `TU`, `MN`, `CS`, `LS`),
  heure locale **du site** dans un fuseau IANA (changements d'heure compris),
  état d'un point lumineux à un instant (allumé, facteurs de flux et de
  puissance, température de couleur, plages, hypothèses dites). Le soleil et le
  milieu de nuit y sont **injectés** : les comportements se vérifient au bit
  près à soleil donné.

### Luminaires allumés selon l'heure — premier affichage (24/09/2026)

Branché dans l'interface. Logique pure et testée dans `lib/`
(`tests/eclairage-scene.test.js`), rendu three.js dans `lib/luminaires-three.js`,
colle dans `app_v7.js` (`NUIT`, `poserCoucheNuit`, `coucheEclairage`, `Eclairage`).

- **Horloge de scène** (`lib/horloge-scene.js`, décision 3). `sunPosition()`
  compose l'instant dans le **fuseau de la scène** (`STATE.settings.fuseau`,
  défaut `Europe/Paris`) et non plus du navigateur (`setHours`). Date épinglable
  (`dateEpinglee`, 'AAAA-MM-JJ', interrupteur dans le module Soleil) : retenue
  dans les préférences **seulement si épinglée** (`null` ne s'écrit pas) ; la
  règle de `scene-prefs.js` qui écarte `date` reste le défaut. Une scène
  déclare `settings.horloge = { instant, fuseau, lieu: [lon, lat],
  date_epinglee }` (ou `fuseau` / `dateEpinglee` à plat) ; `lieu` devient
  `STATE.location`. L'**ambiance** reste SunCalc au centre de la vue ; les
  **comportements** prennent `coucherLever` (NOAA) à l'**ancre**
  (`STATE.location`), mémorisé (`soleilMemorise`). Préréglages Aube/Soir en heure
  du site. Non fait : l'écriture du bloc `horloge` à l'export (`blocHorloge`
  existe, testé, pas appelé) ; une étape de récit qui porte une `date` ne
  l'emporte pas sur une date épinglée.
- **La nuit dans le rendu** (lot E2, `lib/nuit-rendu.js`). Le voile CSS
  `#night-tint` (multiply au-dessus des canvas) est **retiré** de
  `index_v7.html`. À sa place, la couche MapLibre `atlas-nuit` : un quad plein
  écran en `blendFunc(DST_COLOR, ZERO)`, facteur `Cb·(1 − a + a·Cs)` —
  **exactement** l'opération du voile, même formule d'opacité
  (`opaciteNuit`), même teinte. Posée **juste sous** `three-models-3d`
  (`poserCoucheNuit`, rappelée par `onStyleReady` et `applyLayerOrder` ; le
  trajet va **sous** elle dans `releverLigneTrajet`). Les modèles three.js
  reçoivent le même facteur sur leurs lumières (`Models3D.setSun`, en sRGB) ; les
  émissions (lampes, taches) y échappent. De jour le facteur vaut `[1, 1, 1]` :
  la couche ne dessine rien et les couleurs des lumières sont multipliées par 1.
  Mesuré (captures `essais-eclairage/captures/nuit-avant-*` = published, voile
  CSS ; `nuit-apres-*` = nouveau, luminaires masqués ; 15 juin, même vue) :
  12 h et 20 h **99,7 % et 99,4 % des pixels identiques** (le reste : modèles
  de lampadaire différents), 23 h écart moyen **0,56/255**, 99ᵉ centile 2/255.
  Différence connue : les marqueurs HTML ne sont plus assombris.
- **Luminaires** (lot E3). Une couche de points est **d'éclairage** si ses
  entités portent `structure`, `support` et `temperatureCouleur` ou `puissance`
  (`estPointLumineux`) ; `Models3D.collect` l'ignore, `Eclairage` la rend.
  Modèle : catalogue d'objets (`?objets=`), type de famille `lighting`, sinon
  luminaire de test construit en three.js. **Pas de tirage d'échelle** pour un
  luminaire (`scale_draw: false` ou famille `lighting`, `resoudreObjet`,
  décision 6, testé). Pose (`poseLuminaire`) : `ancrage: 'pied'` au sol,
  `ancrage: 'feu'` élevé de `hauteurFeu` ; azimut par champ `azimut` /
  `orientation` (rotation π − A : la console sort selon +Z glTF), sinon tirage
  — **provisoire** pour les appliques et projecteurs (la façade la plus proche
  n'est pas calculée). Émetteurs : les `SpotLight` que GLTFLoader crée depuis
  `emetteur_<k>` sont **lues** (position, axe −Z, `angle`, `penumbra`), jamais
  rendues ; `intensity` du fichier ignorée (décision 7). Couleur :
  `kelvinVersRvb` (Tanner Helland). Intensité : `cd = flux / 2π(1 − cos θ_ext)`
  (**provisoire**, écrite dans `lib/eclairage-rendu.js`), flux =
  `fluxLuminaire`, sinon `puissance × efficacité type` (LED 110 lm/W, autres
  provisoires), × facteurs flux et puissance du profil, × `EXPOSITION_NUIT`
  (0,12, réglage d'œil : three.js r160 éclaire en unités physiques). État :
  `etatPointLumineux` à `instantScene`, recalculé par `updateLighting` (heure,
  date). Vitre `eclairage_vitre` : émission **par instance** (couleur
  d'instance détournée vers `totalEmissiveRadiance`).
- **Budget** (`repartirSources`) : réservoir fixe de `SpotLight` attribué aux
  sources allumées les plus proches de la caméra (4 ombrantes, 16 lumières ;
  `?eclairage_ombres=N&eclairage_lumieres=M`) ; réattribué quand la caméra
  bouge de plus de 2 m. Le nombre de lumières ne change qu'avec le nombre de
  sources allumées : pas de recompilation en navigation. Les ombres ne vont
  qu'aux sources qui **éclairent le sol** (`eclaireLeSol`) : un projecteur
  tourné vers le ciel reste une lumière, sans ombre. Position caméra :
  `positionCameraMetres` (`lib/viewport.js`), depuis
  `transform.getCameraLngLat()` et `cameraToCenterDistance` —
  `getFreeCameraOptions` n'existe pas dans MapLibre et `getCameraAltitude()`
  rend `null` en globe (mesuré). Le niveau de détail du catalogue
  (`distanceCamera`) la lit aussi : il restait figé à 0 jusqu'au 24/09/2026.
- **Lumière au sol** : récepteur lambertien **aveugle** au soleil, au ciel et
  à l'ambiance (chunk `lights_fragment_begin` patché), fusion additive, borné
  à l'emprise des vraies lumières : tache et ombres des 16. Sources restantes :
  **nappe calculée**, un quad instancié par source (E = I·spot·cos/d², même
  cône et même atténuation que three.js), qui se raccorde à l'œil. Halo additif
  par lampe allumée. **Relief désactivé seulement** : le sol est un plan.
  *(Remplacé le 25/09/2026 : plus de récepteur, tout passe par la nappe, relief
  compris — voir « Passe réalisme et performance ».)*
- **Mesures** — *fausses pour les ombres* : aucune ombre de spot ne se
  rendait alors (vérification du 24/09/2026 ci-dessous). (Intel UHD, 1 280 × 800 à 1,5, scène d'essai, 95 luminaires,
  balayage de cap, images/s) : sans luminaires 59,8 · 0 lumière (lampes, halos,
  nappe) 60 · 1 ombrée 51,7 · 4 ombrées 46,2 · 4 ombrées / 8 lumières 42,4 ·
  8 ombrées 40,7 · 4 ombrées / 16 lumières (défaut) 41,7 · 16 ombrées 32,8.
  **Impasse mesurée** : une nappe en un seul plan qui boucle sur toutes les
  sources (texture flottante) ramenait la carte à 32 images/s avec 79
  sources ; un quad par source ne coûte plus rien de mesurable.
- **Scène d'essai** : `essais-eclairage/` (hors git) — `fabriquer.mjs` lit
  le banc Ville de Marseille 2023 (93 points dans l'emprise du Jarret, dont 81
  mâts et 12 poteaux), attributs **posés par règle** (`statutValeurs: regle`,
  dit dans `note`) : LANT, MAT/POT, 6,75 m, 3 000 K, LED 36 W, profil voirie
  (`+0CS` → `+0LS`, 50 % de 23:30HL à 05:30HL), et deux projecteurs FICTIFS B1
  (extinction 01:00HL). Ouvrir :
  `index_v7.html?scene=https://localhost:8443/projects/Atlas/essais-eclairage/scene.json&objets=https://localhost:8443/projects/Atlas/essais-eclairage/catalogue/`
  (fenêtre large : en mode lecture et étroit, `light3d` coupe la 3D **pour la
  session**). Le cadrage `camera` du manifeste n'est pas appliqué : se placer
  à la main (corrigé le 24/09/2026 : `camera` est lu, voir plus bas). Captures janvier et juin, 14 h, 19 h, 22 h, 01 h 30, 02 h dans
  `essais-eclairage/captures/`.

Reste ouvert : cône
translucide ; état dans la fiche et la légende (`Eclairage.libelle` existe, non
affiché) ; mention « état simulé » (O5) ; façade la plus proche pour orienter
appliques et projecteurs ; relief (récepteur calé sur le MNT, lot E5) ;
comparaison aux mesures (E4) ; halo de taille fixe en mètres, sans occultation
fine.

### Vérification du 24/09/2026 — ce qui a été corrigé

Rapport complet, mesures et arbitrages : `docs/etudes-eclairage/VERIFICATION-NUIT-LUMIERES.md`.

- **Ombres des spots : jamais rendues avant ce jour.** `shadowMap.enabled`
  se décidait avant `Eclairage.avantRendu()` ; three.js compilait alors les
  matériaux sans ombre et ne les recompile pas quand `enabled` repasse à vrai
  (il ne suit que le nombre de lumières ombrantes). Décision **après**
  `avantRendu`, et `needsUpdate` sur les matériaux à chaque bascule. Coût réel
  du défaut 4/16 à l'échelle de la rue : 39–51 images/s contre 51–59 sans.
- **Heure de la scène** : `Intl.DateTimeFormat` mémorisé par fuseau —
  un cran du curseur passe de 60 ms à 5,7 ms (95 luminaires).
- **Cadrage `camera` d'une scène `?scene=`** : lu (`cameraDeclaree`) et posé
  d'un `jumpTo`. Le `fitBounds` animé de repli était arrêté par le `map.stop()`
  de `setBasemap`.
- **Changement de fond** : `quandNouveauStyle` (`lib/basemap-layers.js`)
  attend l'`idle` du **nouveau** style (feuille `map.style.stylesheet`
  remplacée). Un `idle` émis pendant la requête du style faisait perdre
  calque 3D, nuit et trajet, ou les laissait sous le nouveau fond (étape
  « Nuit sur le Panier » de la Vieille Charité).
- **Modèles non éclairés** (`KHR_materials_unlit`, photogrammétrie) : leur
  couleur reçoit le facteur de nuit (`estNonEclaire`) — la chapelle restait
  en plein jour la nuit.
- **Globe sous z12** : les luminaires ne se dessinent plus
  (`luminairesDessinables`), ils y étaient décalés de 312 à 798 px.
- **Téléphone** : sous 480 px la date quitte la pastille Soleil, sinon l'arc
  perdait 16 h 30 → 24 h.
- **À savoir** : le récepteur plat s'ajoute au sol d'une maquette GLB
  (+49/255, double apport) ; relief activé, les taches se peignent sur les
  toits ; le bâti MapLibre (fond et couches extrudées) ne reçoit pas la lumière
  des lampes (prototype de façades mesuré à −23 % d'images/s, non intégré) ;
  les avertissements « READ-usage buffer » de la console viennent du globe de
  MapLibre (`_renderErrorTexture`), pas d'Atlas.

### Passe réalisme et performance (25/09/2026)

Rapport chiffré : `docs/etudes-eclairage/VERIFICATION-NUIT-LUMIERES.md`, section
du même nom ; captures `essais-eclairage/realisme/`.

- **Plus de récepteur plan.** Toute la lumière au sol passe par la **nappe** :
  un quadrilatère instancié par source qui n'évalue que sa source ; deux nappes
  (`nappeReelle` pour les sources à vraie lumière, qui lit l'ombre de son
  `SpotLight` — PCF doux de three.js recopié, index 0 à 3 dans `iS.w`, uniformes
  posés dans `onBeforeRender` — et `nappeCalculee` pour les autres). Les vraies
  lumières n'éclairent plus que les modèles three.js. GPU du calque à 4 / 16 :
  5,3–6,9 ms → 1,4 ms. **Ne pas remettre un plan où chaque pixel évalue toutes
  les lumières.**
- **Shadow maps des lampes figées** : `shadowMap.autoUpdate = wantShadow` (le
  soleil seul) ; `needsUpdate` quand `Eclairage.versionOmbres()` ou
  `Models3D._versionScene` change (build, `recomputeAll`, `updateEdited`).
  Toute nouvelle source de changement des porteurs d'ombre doit incrémenter
  `_versionScene`.
- **Qualité adaptative** (`lib/qualite-eclairage.js`) : paliers haut 4/16,
  moyen 2/8, bas 0/4 (ratio de pixels de la carte ≤ 2), minimal 0/0 (≤ 1,5) ;
  départ selon l'appareil, régulateur sur les images/s (objectif 55, 30 au
  téléphone), images de chargement ignorées, descente sans gain de 10 %
  annulée. Le ratio se plafonne par `map.setPixelRatio` : le calque three.js
  partage le canvas, il n'a pas de ratio à lui. `Eclairage.qualite()` pour
  lire l'état ; `?eclairage_palier=haut|moyen|bas|minimal` fige ;
  `?eclairage_ombres=N&eclairage_lumieres=M` aussi (sans régulation). Le
  bouton « Ombres » et le relief coupent les ombres des lampes.
- **`light3d`** (téléphone en lecture, `?no3d=1`) ne coupe plus les
  luminaires : `Models3D.build` saute les modèles mais construit `Eclairage`.
- **Hystérésis** : `repartirSources(sources, cam, budget, precedente)` —
  `MARGE_HYSTERESIS` (rang + 2, distance × 1,3 + 5 m).
- **Pochoir** : `fixGltfMaterial` marque les matériaux (`marquerPochoirModele`,
  valeur 1) ; la nappe des vraies lumières teste ≠ 1. Le calque efface le
  pochoir avant `renderer.render` et remet `map.painter.currentStencilSource`
  à `undefined` après (MapLibre croirait son masque de tuiles encore posé).
- **Relief** : pied sondé par `queryTerrainElevation` (pas le cache
  `elevRaw`, qui arrondit à 1e-4°), pente par `penteAuPied`, tache inclinée et
  avancée de 2 m vers la caméra **en profondeur seulement** (`uAvance`,
  `gl_FragDepth`) ; `recomputeAll` appelle `Eclairage.recaler()`. La position
  locale de la caméra ajoute le sol du centre de la vue.
- **Façades bornées** (`lib/facades-eclairees.js`) : écrites et mesurées
  (−5,5 % sans ombres, −10 % avec), gain visuel quasi nul → derrière
  `?eclairage_facades=1`. Le bâti OpenFreeMap arrive **fusionné par hauteur**
  (un multipolygone de 32 000 arêtes) : filtrer par arête, jamais par entité.
- **Nuit du bâti** : `LUMIERE_BATI_NUIT` / `AMBIANCE_NUIT` (`lib/nuit-rendu.js`)
  remplacent le bleu presque noir sous −6° : bâti 38/40/45 → 45/47/63, sol et
  taches inchangés, jour intact.
- Halos : taille au ratio **de la carte** (`map.getPixelRatio()`), pas de l'écran.
- Pastille Soleil sous 400 px : « Hauteur » masqué, la valeur reste (l'arc
  tient à 375 px).
- **Limites mesurées** : à 1 440 × 900 × 1,5 sur Intel UHD, la carte seule fait
  43–53 images/s — l'objectif de 55 dépend du fond, plus de l'éclairage (8 à
  12 % de l'image). Au téléphone, 30 images/s ne tiennent qu'avec le ratio
  plafonné.

## La pastille Soleil couvre les vingt-quatre heures (24/09/2026)

L'arc de la pastille couvrait 6 h – 20 h (`360 + r × 840` minutes) : la nuit
était hors d'atteinte du **lecteur**, le module Soleil étant réservé à
l'auteur — or c'est la nuit que vit l'éclairage public. `lib/arc-solaire.js`
(testé) : l'arc va de 0 h à 24 h, sa forme suit la **hauteur réelle du soleil**
(NOAA, à l'ancre, au jour et dans le fuseau de la scène — le même soleil que
les luminaires), sous une ligne d'horizon la nuit ; le point passe au bleu la
nuit et reste entier dans la boîte (marges de 7 px). Au clavier : ←/→ cinq
minutes, Maj une heure, minuit se franchit ; `role="slider"` et valeurs ARIA.

**Une scène externe déclare ses contrôles de lecteur** : `viewer_controls`
(même forme que les préférences, lue par `parseViewerControls`). Sans cela,
une scène `?scene=` n'offrait jamais la pastille Soleil, et un lecteur ne
pouvait pas passer à la nuit.

## Scène 3D — trois causes distinctes de décalage

Les modèles « bougeaient avec la carte ». Trois défauts indépendants s’y
mêlaient, et seuls les deux premiers se voient au banc de mesure
(`tests/manuel/projection-3d.html`, qui compare en pixels la position du cube
three.js à celle que MapLibre donne pour les mêmes coordonnées).

**1. Le viewport du renderer — la cause principale.** three.js relève la taille
du canvas **à sa création** et ne la revoit jamais. Ce canvas étant celui de
MapLibre, l’ouverture d’un panneau rétrécit la carte sans que le renderer le
sache : les objets sont dessinés à la mauvaise échelle **et** décalés, ce qui en
navigation se lit comme un glissement latéral. Repère décisif, donné par
l’utilisateur : *le défaut n’apparaît que lorsqu’un panneau est ouvert*. Le
viewport est resynchronisé dans `render()` dès que `canvas.width/height` change.
Un banc sans panneau ne peut pas voir ce défaut, et une mesure portant sur la
matrice de projection non plus — elle est correcte.

**2. La projection globe.** Le custom layer pose une translation **plane** là où
MapLibre projette sur une **sphère**. Écart mesuré :

    z3 → 570 px · z6 → 1692 px · z9 → 2248 px · z11 → 2337 px · z12 → 0 px

Rien n’est à sa place sous z12.

> **Toujours vrai en MapLibre 5.6.1 — re-mesuré le 05/09/2026** au banc
> (`tests/manuel/projection-3d.html`), et reproduit au pixel : 569,7 · 1693,8 ·
> 2250,7 · 2341,7, puis **0 dès z12**. La falaise est nette entre z11,9
> (2365 px) et z12 : c'est là que MapLibre bascule son globe en mercator. Le
> seuil `GLOBE_MERCATOR_ZOOM = 12` tombe donc exactement au bon endroit.
>
> **Impasse à ne pas refaire : `defaultProjectionData.fallbackMatrix`.** Elle
> donne 0 px partout dans le balayage standard du banc, ce qui donne
> irrésistiblement envie de retirer la garde. C'est un artefact : les points du
> banc tiennent dans ±0,0015° **au centre de l'écran**, là où mercator et globe
> coïncident par construction. En éloignant la caméra, la mesure se retourne —
>
> | vue (globe, z3) | `mainMatrix` | `fallbackMatrix` |
> |---|--:|--:|
> | centre | 334 px | **0** |
> | +20° est | 169 px | 29,6 px |
> | **bord du globe** | 220 px | **253 px — pire** |
>
> `fallbackMatrix` **est** la matrice mercator : MapLibre la fournit pour ce qui
> ne sait pas dessiner sur une sphère. Elle ne vaut qu'au voisinage du centre de
> projection. Il n'y a pas de matrice toute faite qui sauve un custom layer
> plan sur un globe.
>
> **Portée réelle de la garde**, pour ne pas la surestimer : sous z12 un
> lampadaire de 6 m mesure **0,1 px** — le masquage ne retire rien de visible.
> Seul un modèle fortement mis à l'échelle est concerné (`monument-glb` est à
> `scale: 28`, soit plusieurs pixels dès z11), et seulement en projection
> **globe** : la garde lit `STATE.settings.projection`, donc une scène en
> mercator n'est jamais concernée. Aucune démo actuelle ne tombe dans ce cas. `MODEL3D_ZOOM_GATE` ne s’appliquait qu’au-delà de
4 000 objets : une couche de quinze lampadaires s’affichait donc grossièrement
décalée en vue régionale. Sous `GLOBE_MERCATOR_ZOOM` (12) et en projection globe,
les modèles ne sont plus rendus — à ces échelles un lampadaire mesure de toute
façon moins d’un pixel.

**3. Le relief échantillonné trop tôt.** `queryTerrainElevation` dépend de la
finesse du maillage, donc du zoom : sur un même point, **1029,79 m à z16,8** et
**1034,14 m à z18,3**. Les tuiles arrivant après coup, les objets sont posés sur
un relevé grossier puis le sol bouge sous eux — en vue oblique, encore un
glissement latéral. Atlas écoute donc `data` sur `terrain-dem` et rejoue le
calage, groupé sur 600 ms, en plus du recalage par palier de zoom
(`paliersDemDifferents`).

> **Ce recalage n'avait jamais eu lieu avant le 25/09/2026.** Le filtre
> attendait `sourceDataType === 'content'`, que MapLibre 5.6.1 n'émet pas à
> l'arrivée d'une tuile `raster-dem` (l'événement porte `tile`, sans
> `sourceDataType`). `evenementMntArrive` (`lib/terrain-base.js`, testé) :
> Aygalades étape 6, 65 modèles sur 232 à plus de 50 cm de leur sol (jusqu'à
> 2,16 m, durablement) → 0 après 6 s. Le cache d'altitude se range désormais
> au millionième de degré (`cleAltitude`) : par cases de 1e-4°, deux objets
> voisins partageaient une altitude (1,45 m d'écart résiduel mesuré).

- Le cache d’altitude n’est **plus vidé à chaque `moveend`** : un simple
  panoramique faisait re-sonder tous les objets, et ceux dont la tuile n’était
  pas revenue retombaient à zéro.
- `readOriginElev` conserve la dernière altitude connue de l’origine plutôt que
  de retomber au niveau de la mer (`altitudeOrigineStable`). **Symétrie
  obligatoire** : `placement()` doit alors caler une entité sans altitude **sur
  l’origine**, pas sur zéro — sinon toute la scène s’enfonce de la hauteur de
  l’origine.
- `recalerRelief()` est le point d’entrée unique : modèles et surfaces lisent le
  même cache, les recaler séparément les ferait diverger.

## Calage vertical par type d'objet — éprouvé le 04/09/2026

Transect de neuf points à travers le vallon des Aygalades, 89 m de dénivelé,
tous les types d'objets aux mêmes coordonnées :

| Type d'objet | Couche `inline` / `table` | Couche **distante** (URL) |
|---|---|---|
| Surface à plat | drapée par MapLibre, exacte | idem — le drapage ne dépend pas d'Atlas |
| Ligne | drapée, exacte | idem |
| Point en cercle 2D | drapé, exact | idem |
| **Surface en volume** | drapée par MapLibre, exacte | idem — le drapage ne dépend pas d'Atlas |
| **Modèle 3D** | **exact au décimètre** ✓ | ✗ rien n'est instancié — Atlas n'a pas les entités |

Mesure des modèles 3D : altitudes locales de −12,3 à +76,9 m pour une amplitude
de terrain de 89 m — **89,2 m d'amplitude rendue**, et chaque objet à moins de
50 cm de son sol (91,7 contre 92 ; 119,8 contre 120 ; 180,9 contre 181).

> **Ce tableau a d'abord été lu de travers.** Les colonnes « surface en volume »
> disaient alors `_sol` par entité d'un côté, altitude unique de l'autre — un
> mécanisme d'Atlas qui n'aurait jamais dû exister (voir la section suivante).
> Éprouvé à nouveau le 05/09/2026 : le drapage ne dépend pas d'Atlas, donc
> l'origine de la donnée ne change rien pour tout ce que MapLibre rend
> lui-même. Seuls les **modèles 3D** distinguent encore les deux colonnes,
> parce qu'eux seuls sont placés par Atlas — et il lui faut les entités pour
> cela.

### Le relief, c'est MapLibre qui s'en charge (05/09/2026)

**MapLibre pose lui-même sur le terrain tout ce qu'il rend** — surfaces à plat,
lignes, cercles, et aussi les **extrusions**, sommet par sommet. Sur relief
actif, `fill-extrusion-base` et `fill-extrusion-height` se comptent depuis le
**sol**, pas depuis le niveau de la mer.

Atlas ajoutait par-dessus l'altitude qu'il sondait lui-même (`_sol`). Elle était
donc **comptée deux fois**, et chaque volume soulevé de sa propre altitude — de
85 m en fond de vallon à 245 m sur le coteau, sur le transect des Aygalades.
C'était la cause, unique, des « volumes qui flottent ».

Trois observations concordantes, à l'écran :

| Épreuve | Ce qu'elle montre |
|---|---|
| `_sol = 0` sur une dalle, à z17,2 | elle se pose **au sol** — avec `_sol` (179,75 m) elle était 238 px plus haut, la conversion exacte de 179,75 m à cette échelle |
| Neutralisation à **caméra fixe** | tous les blocs **redescendent** sur le terrain, rien d'autre ne change |
| Dalle de 6 m sur 23 m de dénivelé | elle **épouse la pente**, paroi plus haute en aval — le drapage est par sommet |

Conséquences, toutes des simplifications :

- `extrusionExpressions(base, height)` ne compose plus rien : les hauteurs
  déclarées sont déjà des hauteurs au-dessus du sol. Restent l'épaisseur
  plancher et l'inclusion de la base dans le sommet ;
- `_sol`, l'échantillonnage par entité et son coût (**1,1 s pour 42 182
  mailles**) disparaissent, avec `applyTerrainBase`, `clearTerrainBase`,
  `needsTerrainBase`, `pointsSondes` et `margeRelief` ;
- **une couche distante extrudée n'est plus un cas à part** : plus de « nappe
  plate suspendue », plus de `solConstant` sondé au centre de la bbox ;
- rien à rejouer quand le relief change d'état, de source ou d'exagération pour
  les surfaces. Seuls les **modèles 3D** three.js — rendus dans un custom layer
  que MapLibre ne connaît pas — interrogent encore le MNT.

> **`height` est une épaisseur, et le sommet inclut la base.** Les deux branches
> d'origine ne s'accordaient pas : sans relief le sommet valait `height` seul,
> avec relief `base + height`. Une entité à base 3 et hauteur 12 mesurait donc
> 9 m à plat et 12 m sur relief. La seconde lecture est retenue partout. Sans
> base déclarée — le cas courant — les deux se confondent, ce qui explique que
> l'écart soit passé inaperçu.

### Ce que cette erreur a coûté, et pourquoi

Le défaut a survécu à **deux corrections** qui l'ont chacune un peu réduit sans
le voir :

1. caler sur le point **culminant** (l'origine) — les grandes mailles lévitent ;
2. caler selon la **hauteur** du volume — mieux, mais le décalage restait, et la
   marge anti-scintillement pouvait à elle seule porter une dalle de 6 m
   au-dessus du point culminant.

Les deux réglaient la **répartition** d'un décalage qui n'aurait pas dû exister.
Aucune mesure ne pouvait le dire : les chiffres validaient à chaque fois, parce
qu'ils mesuraient la conformité au modèle, pas la justesse du modèle. Le
`CLAUDE.md` affirmait le contraire de la réalité, et cette affirmation était le
point de départ de tout raisonnement — c'est ce qui l'a rendue si coûteuse à
remettre en cause.

> **Ce qui a fini par trancher** : neutraliser la variable suspecte et regarder.
> Pas la raffiner. Quand deux corrections successives d'un même mécanisme
> laissent le symptôme, c'est le mécanisme qu'il faut mettre à zéro pour voir ce
> qui se passe sans lui.

C'était sans doute vrai d'une version antérieure de MapLibre — la note d'origine
décrivait un vrai symptôme. Rien ne garantissait que ce soit encore vrai en
5.6.1, et rien ne l'avait revérifié.

## Montage des couches — `isStyleLoaded()` n’est pas le bon prérequis

`map.isStyleLoaded()` signifie « le style **et toutes ses sources** sont
chargés ». Le montage d’une couche volumineuse (42 182 polygones, cas CRESO) le
fait retomber à faux le temps d’indexer sa source. L’utiliser comme garde pour
*ajouter* une couche, dans une boucle qui ajoute des couches, **fait abandonner
tout ce qui suit la première couche lourde** — et la reprogrammation rejoue le
même ordre, donc le même abandon. Résultat observé : sur sept couches, une seule
peinte, la légende annonçant trois couches visibles que la carte ne montrait pas.

- `mapStyleUsable()` remplace ce garde partout où l’on monte ou réordonne des
  couches. Elle suit `_styleUsable`, posé par `onStyleReady` (donc sur `load` et
  après chaque `setStyle`) et levé juste avant un changement de fond.
- **`map.once('load', …)` posé après le démarrage ne part jamais** : `load` ne
  survient qu’une fois. `scheduleMapLayersSync` attend désormais `idle`, qui
  revient à chaque stabilisation — sans quoi la reprise était définitivement
  perdue après un changement de fond.
- Le garde-fou `reconcilePanelVisibilityToMap` était lui-même désarmé par le
  même test : il ne voyait rien à réparer. C’est ce qui a laissé le défaut
  invisible.

Repère : le défaut ne se manifeste que si une couche est assez lourde pour
occuper le style d’une passe à l’autre. Sur une scène légère, tout finit par
monter — d’où des années sans le voir.

## Scan des tables géo — métadonnées seulement

`scanGeoTables` détecte les colonnes géométriques dans `_grist_Tables_column`,
**jamais en lisant les données**. Télécharger chaque table pour y chercher un nom
de colonne rapatriait le document entier : **≈ 126 Mo mesurés** sur la scène
CRESO, dont 68 Mo pour une table pourtant déclarée masquée, et le balayage était
répété deux à trois fois. Après correction : **≈ 27 Mo**, et plus aucune table
non géographique.

- Conséquence assumée : le scan ne connaît ni le nombre d’entités ni le type de
  géométrie. `geoTableMeta()` ne les affiche donc pas — annoncer « 0 obj. »
  serait faux. `linkTableFromGrist` charge la table au clic, seul moment où elle
  est nécessaire.
- Le scan ne tourne plus au chargement de scène : il ne sert qu’à la liste
  « tables géo du document · à afficher » du panneau Couches, et se déclenche à
  son ouverture.
- Tests : `tests/geo-tables-scan.test.js` — le faux `docApi` **lève** si on lit
  autre chose que les deux tables de métadonnées. C’est la garde anti-régression.

## Ordre des couches (`lib/layer-order.js`, `lib/edge-scroll.js`)

MapLibre empile dans l’ordre d’ajout et Atlas ajoute toujours au sommet : sans
remise en ordre, une couche remontée (bascule de visibilité, chargement différé,
changement de style, repli en points) repasse **devant** les autres. L’ordre
observé dépendait donc de l’historique des clics.

- **Sens** : la **dernière** couche de `STATE.layers` est peinte **au-dessus**.
  C’est la sémantique historique — la redéfinir inverserait la superposition de
  toutes les scènes déjà enregistrées. Seul l’**affichage** est retourné
  (`displayOrder`), pour respecter l’usage des SIG : le dessus en premier.
- `applyLayerOrder()` rejoue `moveSequence` après tout (re)montage. Les
  habillages d’une couche (`-outline`, `-pts`, `-label`) se déplacent **d’un
  bloc** : séparés, un contour passerait sous son propre remplissage.
- **Restyler n’est pas remonter** (24/09/2026). Chaque réglage d’apparence
  passe par `applyLayerStyle`, qui retire puis recrée les habillages : MapLibre
  les reposait au sommet, **visibles** et **sans filtre**. Une surface au fond
  recouvrait les lignes, les points et le trajet dès qu’on changeait sa couleur.
  `ancreAuDessus` relève le voisin du dessus **avant** le retrait,
  `remettreEnPlace` y repose le groupe, puis rétablit l’œil fermé et le filtre
  d’une couche distante. Pas d’`applyLayerOrder` ici : rejouer toute la pile à
  chaque cran de curseur coûterait pour rien.
- **Couleur d’une couche déclarative** : la carte peint d’abord le `_fill_color`
  de chaque entité. Un réglage de couleur doit donc repeindre les entités
  (`repeindreEntites`) avant `applyLayerStyle` — sinon la légende change et la
  carte garde l’ancienne teinte. Seul qgis2grist le faisait.
- **Persistance** : `rank` dans le StyleJSON des prefs, relu par `sortByRank`.
  Une couche sans rang se range **après** celles qui en ont un — d’où
  l’enregistrement de **tous** les rangs à chaque déplacement, pas seulement des
  couches déplacées. Un rang partiel donne un ordre faux au rechargement.
- `insertionIndex` place une nouvelle couche au-dessus des géométries de même
  rang ou plus grossier, sous les plus fines (surface < ligne < point) — sinon un
  bâti importé recouvre la voirie.
- **Glisser-déposer** : poignée ⠿ (`.layer-grip`), Pointer Events avec capture,
  seuil de 4 px avant bascule, repère d’insertion, équivalent clavier ↑ ↓ sur la
  poignée focalisable. `edgeScrollStep` fait défiler le panneau quand le pointeur
  approche d’un bord : au doigt, aucune molette ne vient défiler pendant le
  geste, et une couche ne pourrait pas sortir de la portion visible.

## Gestes tactiles

Tout passe par les **Pointer Events** — un seul jeu d’écouteurs pour la souris,
le doigt et le stylet, avec `setPointerCapture` (via `capturePointer`, qui avale
l’exception si le pointeur est déjà parti) plutôt que des écouteurs `window`.

| Geste | Souris | Doigt |
|---|---|---|
| Ordre des couches | glisser la poignée (ou ↑ ↓) | idem + défilement de bord |
| Arc solaire | glisser | idem, `touch-action: none` sur `.sun-arc` |
| Sélection rectangulaire | **Maj** + glisser | **appui long** immobile puis glisser |

- L’appui long (`LONG_PRESS_MS`, `LONG_PRESS_TOLERANCE_PX`) est le seul moyen de
  distinguer « sélectionner » de « déplacer la carte » sans touche Maj. Un
  mouvement avant l’échéance, ou un second doigt (zoom), annule.
- Le rectangle naissant étant invisible, la bascule s’annonce par une vibration
  et un toast — sans quoi rien ne dit que le geste a changé de nature.
- `boxJustEnded` (et non `boxing`) absorbe le `click` de fin de geste : la garde
  doit fermer `boxing` **immédiatement**, car la capture livre le `pointerup` à
  `cc` d’où il remonte jusqu’à `window` — sinon la sélection est rejouée.

## La pastille « Relevé » (18/09/2026)

Un contrôle publié devient une pastille ; un formulaire publié ne devenait
**rien de visible**. Le lecteur ne découvrait qu'un objet se saisit qu'en le
touchant — sur le terrain, c'est ce qu'il faut savoir en arrivant. Prévu dès le
9/09 (canevas « pastille Formulaires »), resté « à décider » ; tranché le
18/09 : **une seule pastille**, qui regroupe, pour ne pas charger le dock.

| | |
|---|---|
| Quand | au moins une couche visible où `saisieHorsEdition` ouvrirait la fiche. En lecture, `coucheEnSaisie` telle quelle ; en édition, la même règle posée du côté du lecteur (ce qu'il verra) |
| Où | dans le dock, juste après « Lire le récit » — les deux pastilles qui agissent |
| Panneau | une rangée par couche : ses formulaires offerts, « Le plus proche de moi », « Voir la couche » |
| Le plus proche | parmi les objets **que les filtres laissent voir** ; distance dite au terrain (« à 40 m ») — `lib/releve.js`, testé |
| Après le choix | le panneau se replie : il recouvrirait la barre de sélection |

> **« Le plus proche » n'est proposé que si la localisation marche.** Dans un
> widget Grist, l'iframe n'en a pas la permission et MapLibre désactive son
> propre bouton : Atlas lit ce verdict (`localisationDisponible`) plutôt que
> `navigator.geolocation`, présent mais inutilisable. C'est donc une fonction de
> l'**application** et du navigateur, pas du widget. L'attente de position est
> bornée à 15 s, et l'échec se dit.

Le dock se redessine quand les formulaires arrivent (`chargerFormulaires`, après
la carte) et quand l'auteur en propose ou en retire un : sans cela la pastille
n'apparaissait qu'au geste suivant.

## Les feuilles sur téléphone — une à la fois (18/09/2026)

Sur téléphone, le panneau des modules et la fiche d'un objet sont des
**feuilles** : poignée, trois positions (repliée, mi-hauteur, pleine),
glissement. Une seule mécanique pour les deux (`installerGlissement`, règles
pures dans `lib/feuille-mobile.js`).

Quatre défauts corrigés ensemble, mesurés sur un écran de 844 px :

| Défaut | Mesure | Correction |
|---|---|---|
| Deux feuilles empilées | fiche de 324 à 788, modules de 349 à 788 | **une feuille à la fois, la fiche prime** : elle replie les modules et les leur rend, à la même hauteur, en se fermant |
| La fiche n'était pas une feuille | hauteur figée à 55 %, ni poignée ni position | même mécanique que les modules |
| Le bas des feuilles hors d'atteinte | à mi-hauteur, 282 px du panneau des modules sous le bord de l'écran | **au repos, la feuille a la hauteur qu'on voit** ; la translation ne sert que pendant le geste |
| Bande morte en lecture | fiche posée 56 px au-dessus d'une barre du bas absente | en lecture, la fiche touche le bas de l'écran |

- **Choisir un module dans la barre du bas** fait céder la fiche (`ficheCedee`) :
  une sélection active la rouvrirait à chaque rendu. Toucher un objet la rend.
- **Toucher un champ de saisie** déploie la fiche et centre le champ : le
  clavier prend la moitié basse de l'écran, là où la fiche se trouve.
- Le passage translation ↔ hauteur ne se voit pas : le bord haut est au même
  endroit dans les deux régimes, et `finirGlissement` fige la transition le
  temps du changement.

## Repli en points (`lib/point-fallback.js`)

Une maille d’analyse de 200 m mesure moins d’un pixel en vue régionale : le
polygone est chargé, mais rien ne s’affiche. `pointFallbackZoom()` calcule le
zoom sous lequel les surfaces d’une couche passent sous `MIN_FEATURE_PX` (3 px)
à partir de leur taille réelle ; en deçà, Atlas peint une couche `circle` sur
leurs centres (rayon fixe à l’écran), au-delà les surfaces reprennent la main.

- Actif seulement sur les couches **surfaciques à plat** d’au moins
  `POINT_FALLBACK_MIN_FEATURES` (300) entités.
- Source parallèle `<layer.id>-pts`, alimentée par `centroidCollection()` et
  **filtrée comme la couche principale** (cf. `syncLayerSourceData`).
- Les propriétés sont conservées, donc les points gardent la symbolisation.
- Une couche différée est vide au montage : son seuil est réévalué et la couche
  remontée dès qu’elle se peuple (`_pointFallbackAt`).
- Un anneau GeoJSON étant fermé, `featureCentroid()` ignore le sommet répété —
  sans quoi chaque centre serait décalé vers ce sommet.

- Le rayon des points ne descend pas sous `MIN_FEATURE_PX` : un repli plus fin
  que le seuil reproduirait l'invisibilité qu'il corrige.
- **Mais il ne doit pas non plus dépasser la maille qu'il remplace.** Le rayon
  montait à 4 px — 8 de diamètre — juste sous le seuil de bascule, où une maille
  de 200 m en occupe 5 : les points se chevauchaient en bourrelets saturés, et
  la trame de la grille disparaissait. Le repli grossissait la donnée au lieu de
  la représenter. Calé à la moitié de l'espacement (2,6 px à z11), les points se
  touchent sans se recouvrir et la symbologie redevient lisible.
- **Opacité franche (0,9), pas celle de la surface.** Une surface à plat est
  translucide pour laisser lire le fond sous elle ; un point de 2,6 px ne masque
  rien, et la même translucidité n'y sert qu'à délaver les classes claires
  jusqu'à les confondre avec la carte.

> **La saturation revient en dézoomant, et c'est irréductible.** Mesuré sur
> 400 mailles : l'espacement tombe de 4,9 px à z10,5 à 0,2 px à z6, quand le
> plancher de visibilité impose 3,4 px de diamètre. On ne peut pas montrer
> 400 points distincts sur 20 pixels. À ces échelles la tache est légitime :
> elle dit « il y a une donnée ici », ce qui est tout ce qu'on peut dire. Le
> réglage vise donc la **transition** — les deux ou trois niveaux sous le seuil,
> là où le lecteur vient de perdre ses surfaces et doit reconnaître ce qui les
> remplace.
- Le masquage d'une couche couvre tous ses habillages (`-outline`, `-label`,
  `-hit`, `-pts`) : sans `-pts`, le repli restait à l'écran après extinction ;
  sans `-hit`, la zone de clic restait active sur une couche invisible.

Repère mesuré : mailles de 200 m → bascule vers **z10,8**.

## Droits — ce que Grist transmet ne dit pas ce qu’on croit

`?access=full&readonly=false` décrit le niveau accordé **au widget** (le réglage
« Niveau d’accès » de la vue), **pas** les droits de la personne sur le document.
Les ACL s’appliquent par-dessus, côté sandbox : en simulant un lecteur
(`aclAsUser_=viewer@example.com`), l’iframe reçoit quand même
`access=full&readonly=false`. Atlas ouvrait donc l’édition à qui ne peut rien
écrire.

- Seule la **sonde d’écriture** tranche (`probeCanWriteDoc`) : un `UpdateRecord`
  sur une ligne inexistante. `resolveAccess` la déclenche désormais aussi quand
  Grist annonce l’écriture. Le sens inverse reste sans appel : quand Grist
  déclare la lecture, il ne se trompe pas.
- La sonde ne force la lecture que sur une **erreur ACL franche**. Le libellé que
  Grist renvoie réellement est **`Blocked by table update access rules`** (403) —
  ni « blocked » ni « access rules » n’étaient dans `isWriteAclError`, qui
  retombait sur son repli « en cas de doute, privilégier l’édition ». Variantes
  couvertes : table / row / column × update / create / remove, plus
  `not authorized` / `unauthorized`.
- « not found » — le cas **normal** pour un éditeur, puisque la ligne sondée
  n’existe pas — ne doit jamais basculer en lecture. Un éditeur bloqué à tort
  serait pire que le défaut corrigé.

En lecture : les modules d’auteur sont refusés par `openModule`, l’inspecteur
d’objet passe en consultation (`geoReadOnly`, pas de bouton Enregistrer), et la
barre du haut perd Charger / Enregistrer / Exporter — **une virgule de trop**
dans le CSS les agrégeait à la règle de l’avatar et les laissait visibles. À leur
place, un bouton **Récit** (`#btn-story.has-story`), sans lequel un récit publié
n’avait plus aucun point d’entrée une fois le rail retiré.

## Persistance — ce qui s’écrit, et quand

| Objet | Table | Déclenchement |
|---|---|---|
| Apparence d’une couche `qgis2grist` | `Atlas_LayerPrefs` | immédiat (`saveLayerPref`) |
| Autres couches | `Maquette_Layers` | « Enregistrer » explicite |
| Récit | `Atlas_Story` | à chaque capture, débounce 400 ms |
| Contrôles exposés en lecture | avec la couche (`_controls`) | idem couche |

- **`Maquette_Layers` est créée à la demande** (`ensureMaquetteLayersTable`).
  `initGristTables` ne tourne que sur les documents en mode maquette : en mode
  Scene Manifest, la table n’existait pas et enregistrer une couche non
  `qgis2grist` échouait sur « [Sandbox] KeyError 'Maquette_Layers' ». La créer à
  l’écriture, et pas au chargement, garde une empreinte nulle sur les documents
  qui ne s’en servent pas.
- **Le récit s’écrit en une seule transaction.** Effacement et réécriture
  partaient en **deux** `applyUserActions` : le `BulkRemoveRecord` était déjà
  commis quand le `BulkAddRecord` échouait, et un refus d’ACL au mauvais moment
  **effaçait le récit** au lieu de le mettre à jour. Grist applique une liste
  d’actions comme un tout : les deux y sont désormais.
- **Un échec d’écriture doit se voir.** « Étape capturée » s’affiche dès le clic,
  avant même que l’enregistrement ne parte ; l’erreur était avalée par un
  `.catch` interne, `enterViewModeOnWriteFail` n’était jamais appelé, et
  l’utilisateur croyait son récit conservé. Elle remonte à l’appelant, qui la
  signale — la chaîne de sauvegardes, elle, reste saine, sinon plus rien ne
  partirait ensuite.

## Créer et modifier des géométries — lot 0 posé (24/09/2026)

Cadrage : `docs/CADRAGE-EDITION-GEOMETRIES.md` (décisions, lots, points à
éprouver) ; preuves dans `docs/etudes-edition-geom/`. Le lot 0 pose les règles
sur lesquelles tout le reste s'appuie, sans interface :

- **Une seule règle de géométrie** : `lib/geometrie-saisie.js`.
  `colonnesGeometrie(layer)` dit où vit la géométrie d'une couche —
  `geometry_fields` du manifeste, puis `geometryColumn`, puis la convention
  (point en `latitude`/`longitude`, le reste en `geometry_json`). Un couple
  lat/lon ne vaut que pour un point. `featureToRowUpdate` écrit par
  `cellulesGeometrie` : un point entablé retourne dans `geometry_json`, une
  source suffixée (`latitude2`) garde ses colonnes, et les colonnes homonymes
  de la source ne sont plus écrasées.
- **L'écriture n'arrondit pas** : arrondir dans l'écrivain réécrirait toutes
  les géométries existantes au premier attribut enregistré. L'arrondi à
  7 décimales, la fusion des doublons, la fermeture et l'orientation des
  anneaux sont dans `normaliserGeometrie`, pour ce qu'on vient de dessiner ;
  `validerGeometrie` refuse avec un motif nommé (croisement testé avant l'aire :
  un huit symétrique a une aire nette nulle).
- **Une cellule vide est une absence** (`lireCoordonnee`) : `+null` et `+''`
  valent 0, et une ligne vide d'une table liée en lat/lon devenait un point en
  (0, 0). Corrigé dans `tableToGeoJSON`.
- **`applySelected` écrit pour toute couche à lignes** (`coucheAvecLignes`),
  plus seulement qgis2grist. Sur une couche liée ou entablée, les colonnes
  visées sont bornées par `colonnesEcrivables` (le schéma fait foi, formules
  exclues).
- **La lecture forcée n'est due qu'à un refus de droits** :
  `enterViewModeOnWriteFail` ne bascule plus que sur `isWriteAclError`. Une
  colonne manquante retirait l'édition pour toute la session.
- **Un objet est sa ligne, pas son rang** : `apresRelecture` recalcule `_idx`
  et resuit la sélection par `_row_id` après toute relecture (bouton, fiche,
  polling — celui-ci relève la sélection par `avantMiseAJour`). Une ligne
  disparue ferme la sélection au lieu d'en montrer une autre.
- **La pause de synchronisation se relâche à l'enregistrement**
  (`marquerEnregistre`) : après un seul réglage d'apparence, Atlas cessait de
  refléter les changements faits dans Grist jusqu'au rechargement.

> **« Afficher » une table écrit dans le document** : une ligne d'inventaire
> `Maquette_Layers` et une ligne `Atlas_LayerPrefs`, même si la table en a
> déjà une (doublons constatés le 24/09/2026). Un essai en Grist réel doit donc
> sauvegarder **et comparer ces deux tables**, pas seulement celles qu'on croit
> toucher.

## Récit (`Atlas_Story`)

- Un **trajet** n’est pas une table ni une couche. La ligne copiée (à plat, la
  partie touchée s’il y en a plusieurs) voyage dans `state.trace` de chaque
  étape, avec `abscisse` et `saisies`. `lib/trajet.js` porte la géométrie ;
  `captureStoryState` l’ignore, la fusion se fait après la photo. Tant qu’aucune
  étape n’est capturée, la ligne reste en mémoire (`STATE.trajet`).
- **Place sur la ligne ≠ centre de la vue.** L’abscisse est le point de la ligne
  le plus proche du centre de la caméra (`placeDepuisVue`). La lecture longe
  la ligne jusqu’à ce point ; `camera` (centre, zoom, pitch, bearing) n’est pas
  réécrite par le trajet. Retirer le trajet efface `trace`/`abscisse` et
  rétablit la lecture sur la vue d’origine. Glisser une poignée ou les flèches
  ne déplacent que l’abscisse.
- Chaque étape emporte **sa propre copie** de la symbolisation : deux étapes
  peuvent montrer la même couche catégorisée ici, graduée là. `captureStoryState`
  clone (`cloneJson`), `applyStoryState` travaille sur un clone, `applyLayerStyle`
  repeint. Le piège serait une `symbolization` stockée **par référence** : couche
  vivante et étape pointeraient sur le même objet, et tout réglage ultérieur
  réécrirait le passé du récit — toutes les étapes finiraient identiques.
  `tests/story-symbolization.test.js` verrouille cela, étiquettes comprises.
- Une étape décrit l’**état complet** de la scène : `applyStoryState` masque les
  couches qu’elle ne cite pas. `captureStoryState` enregistre toujours toutes les
  couches ; seuls les récits écrits à la main sont partiels.
- `findStoryLayer` résout par **`sourceTable` d’abord**, puis id, puis nom. Le nom
  n’est qu’un repli : deux couches homonymes issues d’imports différents feraient
  sinon appliquer styles et filtres aux mauvaises données.
- `storyExit` rétablit l’état d’avant présentation (visibilité, filtres,
  symbolisation, **rendu surfacique**) via `restorePreStorySnapshot` +
  `remountAllLayers`.
- Une étape peut porter **`polygonMode`** : posé *avant* l’affichage de la couche,
  car le repli en points ne vise que les surfaces à plat et doit connaître le mode
  au montage. C’est ce qui permet de montrer un bâti en volume (morphologie =
  critère SEVI_B) puis de le remettre à plat.
- La caméra se cale sur la **zone utile**, pas sur la carte entière : la bulle de
  texte masque le tiers inférieur, et le panneau latéral (s’il reste ouvert) la
  moitié gauche. En projection **globe**, sous z≈8, le calcul Mercator surestime
  le zoom d’environ un cran — caler à l’œil plutôt que par la formule.
- Un filtre `range` sur un champ absent est ignoré ; un filtre `select` sur un
  champ absent exclut toutes les entités (cf. `buildControlPredicate`).
- **`requireValue`** sur un contrôle `range` inverse cette tolérance : une entité
  dépourvue de l’attribut (ou de valeur non numérique) est **écartée**. À poser
  sur les vues thématiques dont l’attribut n’est renseigné que partiellement —
  sans lui, les entités muettes reçoivent la couleur de repli du style gradué et
  recouvrent la thématique (cas de `nb_bat`, absent de 67 % des mailles de la
  grille sarde). Transmis par `applyStoryControlsToLayer` et conservé par
  `captureStoryState`.

## Ombres portées — ce que la carte montre, et où elle s'écarte du réel

Les ombres sont calculées par three.js sur les modèles 3D et sur un bâti
d'appoint (`ensureShadowFeatures`), pas par une shadow map MapLibre au sol.

**Le soleil ne descend jamais vraiment.** La lumière directionnelle est
contrainte en hauteur :

```js
Math.max(this.sunDir.y * dist, dist * 0.4)   // jamais sous 40 % de la distance
```

Ce n'est pas un défaut à corriger mais un **compromis assumé** : à soleil
rasant, la caméra orthographique de la shadow map devient quasi parallèle au
sol, sa profondeur utile s'effondre et les ombres deviennent inexploitables
(bandes, acné, ombres infinies). Le clamp garde une carte lisible.

> **Conséquence à connaître** : aux heures basses — avant 8 h, après 18 h — les
> ombres sont **plus courtes que la réalité**. Atlas affiche l'heure solaire
> exacte, ce qui invite à lire la longueur d'ombre comme une mesure ; elle n'en
> est pas une à ces heures-là. Une étude d'ensoleillement ne doit pas s'appuyer
> dessus sans le savoir.

**Les matériaux de modèles ne sont pas libérés.** `fixGltfMaterial` clone le
matériau de chaque sous-maille, et aucun `dispose()` ne les reprend au retrait
d'une couche. La fuite est **bornée** — un clone par URL de modèle, pas par
image ni par instance — donc sans effet sur une scène ordinaire. Elle mordrait
sur une session qui enchaînerait des dizaines de modèles distincts.

- Ombres = éclairage modèles three.js (pas shadow map MapLibre au sol).
- Modèles GLB via **`published/atlas/models/`** (GitHub Pages) — sous le widget,
  depuis leur co-localisation. Le défaut de `MODEL_LIBRARY.baseRoot` a longtemps
  visé `/Widgets-Grist/models/`, qui renvoie 404 : en ligne la sonde `./models/`
  rattrapait l’erreur (le widget est servi depuis `/atlas/`), mais en
  développement aucun modèle ne chargeait. Pour essayer la 3D en local, servir la
  racine du repo — la sonde tente `../../published/atlas/models/` en premier.
- Tests : `node --test projects/Atlas/tests/*.test.js` (chemins quotés sous PowerShell).
- Spec lecture/mobile : `docs/superpowers/specs/2026-07-30-atlas-view-mobile-design.md`

## Publication

```bash
# Déjà fait via promote manuel → published/atlas/
npm run manifest
# Commit published/atlas + manifest, puis push pour gh-pages
```

URL widget : `https://nic01asfr.github.io/Widgets-Grist/atlas/`  
Édition : `requiredAccess: 'full'` (défaut). Lecture : `?mode=view` **garde
`full`** et passe l'interface en lecture — `resolveAccess` (`lib/view-mode.js`)
en donne le motif (`mode-view`), et la saisie hors édition reste possible. Le
repli `read table` n'existe plus : demandé, il rendait la fiche muette.

## Paramètres d'URL — qui pose quoi, et ce qui n'arrive jamais jusqu'à Atlas

Trois couches se superposent, et les confondre coûte cher. Elles ne s'adressent
pas au même destinataire.

### 1. Ce que Grist met sur l'URL du **document**

`?embed=true&style=singlePage`, `/p/5`… Ces paramètres pilotent l'**interface de
Grist** : masquer la barre latérale, ouvrir telle page. Ils ne parviennent
**jamais** à Atlas — le widget vit dans une iframe dont l'URL est celle du
widget, pas celle du document.

C'est ce qui permet d'intégrer une scène réelle dans une page tierce : on
embarque le document (`embed=true&style=singlePage`), et Atlas s'y trouve comme
dans n'importe quel document, avec les données et les droits qui vont avec.

### 2. Ce que Grist met sur l'URL du **widget**

`?access=full&readonly=true&culture=fr-FR…` — posés par Grist sur l'iframe.
Lus par `lib/view-mode.js`.

> **Piège vérifié** : `access=full&readonly=false` est envoyé **toujours**, y
> compris à un lecteur. Il décrit le niveau demandé par le widget, pas les
> droits de la personne. S'y fier ouvrait l'édition à qui n'a pas le droit
> d'écrire — d'où la sonde d'écriture réelle.

### 3. Ce que l'auteur de la page met sur l'URL du widget

| Paramètre | Lu par | Effet |
|---|---|---|
| `?scene=<url>` | `lib/scene-externe.js` | **charge la scène à cette adresse, et coupe l'accès au document** |
| `?vitrine=1` | `lib/data-client.js` | « la page qui m'encadre est une présentation, pas un document » — sans lui, Atlas encadré croit avoir un document à interroger |
| `?mode=…` | `lib/view-mode.js` | force le mode lecture, pour tester |
| `?no3d` | `app_v7.js` | coupe les modèles 3D (appareil modeste) |
| `?models=…` | `app_v7.js` | source du catalogue 3D |
| `?navbar=false` | `lib/view-mode.js` | **retire la barre du haut** — intégration en cadre, où la page hôte porte déjà son titre |

> **`?nav` n'a jamais existé.** Ce tableau l'a longtemps annoncé — « barre de
> navigation inter-vues » — alors qu'**aucun code ne le lit** : vérifié le
> 08/09/2026 sur `app_v7.js`, `lib/` et `index_v7.html`. Une doc qui décrit un
> paramètre inerte coûte plus qu'une doc muette : on l'essaie, il ne fait rien,
> et on cherche la panne ailleurs.
>
> `?navbar=false` ne peut que **retirer** : une valeur absente, vide ou
> incomprise laisse la barre. Se tromper vers le bas masquerait la recherche, le
> badge de droits et le bouton « Récit » — seul point d'entrée d'un récit publié
> une fois le rail parti.
>
> Ce qu'il emporte avec la barre : en édition autonome, **Télécharger** et
> **Exporter**. Le récit n'en dépend plus : depuis le 16/09/2026, il se lance
> **uniquement** par la pastille « Lire le récit » du dock
> (`pastilleRecitRequise`), en lecture, sur ordinateur comme sur mobile. Le
> bouton de la barre et le bouton flottant mobile sont retirés — trois entrées
> pour un geste, chacune avec sa règle d'exclusion, c'était deux de trop.

### Cohérence des gestes (16/09/2026)

| Avant | Maintenant |
|---|---|
| « Enregistrer » pour quatre gestes | **Télécharger le projet** (fichier .json), **Enregistrer l'apparence** (panneau de couche), **Enregistrer en table Grist** (les objets deviennent des lignes), **Enregistrer** (la fiche, une ligne) |
| « Charger un projet » avalait tout fichier JSON comme un projet vide ; « Fichier » faisait une couche d'un projet | les deux portes reconnaissent le contenu (`lib/ouvrir-fichier.js`) : projet → chargé, GeoJSON → couche, scène → message qui dit de l'ouvrir par `?scene=` |
| la barre promettait « un objet, une couche, un lieu », la palette ne cherchait ni objet ni lieu | objets par leur nom dans les couches visibles (`lib/palette-objets.js`), lieu par géocodage |
| document qgis2grist : une couche ajoutée à la main disparaissait au rechargement | `Maquette_Layers` est aussi lue en mode manifeste, en écartant ce que le manifeste porte déjà ; l'inventaire dépend de `manifestLayerId`, plus du mode |

### L'habillage de la carte — un étage partagé en bas (11/09/2026)

Quatre éléments se disputaient le bas de la carte, chacun ancré pour son compte :
mesuré dans un widget de 860 px, la bulle du récit mordait sur la légende, la
légende remontait à mi-carte pour lui céder la place, et l'attribution
OpenStreetMap — que la licence impose de laisser lisible — passait sous la bulle.

`lib/habillage-carte.js` porte les règles, `index_v7.html` la mise en page
(variables `--etage-*` de `.map-frame`) :

| Élément | Où |
|---|---|
| attribution | tout en bas, forme MapLibre conservée ; l'étage se cale sur sa hauteur mesurée (`--bande-attrib`) |
| légende | colonne de gauche |
| bulle du récit | à droite de la légende, centrée dans ce qui reste (`etage-cote-a-cote`), ou **empilée** au-dessus quand la carte est trop étroite — décidé sur la largeur de la **carte**, pas de la fenêtre (rail et panneaux d'édition comptent) |
| infos carte (édition) | colonne de droite ; cède à la légende : complet → `zoom · pitch` → masqué (`formeBandeauInfos`) |
| localisation | pastille du dock, **mobile seulement**, contre la boussole ; le contrôle MapLibre reste posé mais caché |

La caméra du récit vise ce que la bulle laisse voir : `flyTo` reçoit une marge
basse égale à la hauteur mesurée de la bulle (`margeBasseRecit`), et la marge
disparaît en sortie sans déplacer la vue. Sur mobile, la légende repliée se pose
sur le haut de la bulle et s'ouvre vers le haut.

### `?scene=` — deux régimes de confiance, pas un réglage

Une scène lue dans le document est **de confiance** : pour l'y mettre, il fallait
déjà pouvoir écrire dans le document. Une scène chargée par `?scene=` ne l'est
pas — n'importe qui peut fabriquer l'adresse et la faire ouvrir. Atlas ne lui
donne donc **pas le document** : `grist.ready()` n'est jamais appelé, `docApi`
n'existe pas, aucune préférence ni aucun récit ne s'écrit.

Trois conséquences à connaître avant de toucher à ce chemin :

- une couche `source.table` d'une scène externe **tombe en échec déclaré**, avec
  un message qui envoie la publier. Ce n'est pas une limite, c'est la règle ;
- le `popup_template` est rendu **comme du texte**. Il est injecté tel quel
  (`app_v7.js`, `buildViewPopupHtml`) : les valeurs sont échappées, le gabarit
  ne l'est pas. Venu d'une adresse, il s'exécuterait dans une iframe qui tient
  les droits de la personne sur son document ;
- seuls `https:` et `http://localhost` sont admis. `data:` et `blob:` portent un
  contenu **sans origine** — inattribuable, irrévocable ; `http:` distant
  laisserait un tiers réécrire la scène en chemin. `localhost` est un contexte
  sécurisé au sens du navigateur, et le refuser pousserait à publier pour
  essayer.

Cadrage complet : `docs/CADRAGE-SCENE-EXTERNE-ET-DECOUPLAGE.md`.

### Deux pièges vérifiés en branchant `?scene=`

**`_mapSyncAfter` est une file, pas un slot.** Deux appelants attendent que le
style redevienne utilisable — `onStyleReady`, qui cadre depuis les entités
locales, et `mountLoadedLayers`, qui cadre depuis ce que le manifeste déclare.
Avec une variable unique, le second effaçait le premier **sans rien dire**. Dans
un document Grist l'ordre était favorable (l'ouverture est lente, le style a le
temps d'être prêt) ; une scène chargée par URL arrive avant le style, et c'est le
cadrage du manifeste qui se perdait — la carte s'ouvrait sur la position par
défaut, ce qui ressemble à un choix.

**`layerVisibleCount` rend `null` quand on ne sait pas.** Il rendait `|| 0`, donc
zéro pour une couche vide **comme** pour une couche dont Atlas ne détient pas les
entités. Zéro est un nombre plausible : « 0 obj. » se lit comme un renseignement
et envoie chercher pourquoi la donnée est vide. `formatLayerCount` affiche
« ≈400 » quand le manifeste déclare sans qu'on ait vérifié, et « — » quand
personne ne sait.

### Non-régression vérifiée en Grist réel (25/08/2026)

Document `nrRTKiyiz1suJ3NF1QcbqK` (espace *Widgets*), Atlas servi en **https
local** — un document en HTTPS refuse une iframe en `http://localhost`
(contenu mixte), d'où le certificat auto-signé pour l'essai. Une seule scène
portant **les deux origines à la fois** :

| Couche | Ce qui est vérifié |
|---|---|
| `Batiments_locaux` (table) | chemin nominal intact — 5 objets lus et peints |
| Bâtiments BD TOPO (URL) | chemin distant — « ≈400 obj. », symbologie appliquée |

`Atlas_LayerPrefs` est bien créée et écrite : l'écriture des préférences n'a pas
régressé.

**Effet de bord constaté, non corrigé** — précisé le 04/09/2026 : ce n'est pas
la *présence* d'une couche distante qui crée `Maquette_Layers`. `initGristTables`
n'est appelée que **hors** mode Scene Manifest, donc une scène n'y touche pas au
chargement. Deux conséquences distinctes :

1. **Régler l'apparence d'une couche distante n'enregistre rien.**
   `saveLayerPrefIfSynced` exige `source === 'qgis2grist'`, et sort **en
   silence** sinon. Le réglage est perdu au rechargement, sans message.
2. **« Enregistrer » sur cette couche écrit une donnée fausse.** La branche
   non-`qgis2grist` crée `Maquette_Layers` et y pose
   `GeoJSON: JSON.stringify(layer.geojson)` — or sur une couche distante,
   `layer.geojson` est une **adresse**. On écrit une URL dans une colonne censée
   porter des entités.

**La réponse est arrêtée** (cadrage §« Ce qui reste indéterminé ») : indexer sur
`sourceTable || id` et reformuler le garde en « cette couche vient du manifeste
du document ». **Jamais l'URL comme clé** — elle change quand un jeton expire, et
les préférences seraient perdues au renouvellement ; l'`id` du manifeste est
stable par construction.

Et dans une **scène externe**, on n'écrit rien : il n'y a pas de document, donc
pas de propriétaire. Ce qu'un lecteur déplace y est éphémère par nature.
La règle : **on écrit là où il y a un propriétaire, et on ne prétend pas en
inventer un quand il n'y en a pas.**

### `inline` n'est pas `distant` — le manifeste peut porter ses données

`geojson` accepte **un objet autant qu'une adresse**. Avec un objet, la scène est
autonome en données : les entités voyagent avec elle, et la couche est aussi
complète qu'une couche lue dans une table.

> **`_distant` doit donc rester faux pour `inline`.** Le drapeau commande une
> dizaine de comportements — filtrage par expression, sol constant au lieu du sol
> par entité, compte déclaré préfixé « ≈ », clic en consultation au lieu de la
> sélection. Le poser sur une couche qui porte ses entités revient à **l'amputer
> de ce qu'elle n'a pas perdu**, sans que rien à l'écran ne dise pourquoi.

Même raison pour l'emprise : une couche `inline` **ne réclame pas de `bbox`**,
la sienne se calcule. Lui en réclamer une signalerait un manque qui n'en est pas
un — et un avertissement qui se trompe occupe la place d'un avertissement qui a
raison.

La fabrique s'appelle `coucheHorsTable` et non plus `coucheDistante` : elle sert
les deux cas, et un nom qui ment est le troisième visage de
`skills/echecs-silencieux.md`.

### Contrôles d'une couche distante — le manifeste répond, MapLibre filtre

Deux dérivations lisaient les entités locales, et deux réponses par défaut
mentaient :

| | Avant | Maintenant |
|---|---|---|
| `controlUniqueValues` | `[]` — un filtre sans choix ressemble à un filtre déjà appliqué | les `values[]` du contrôle (`options`), **`count: null`** et jamais zéro |
| `controlBounds` | `{min:0, max:1}` — un curseur de hauteur de 0 à 1 m | `dataMin`/`dataMax` déclarés ; sinon `_bornesInconnues` |

**`filteredGeoJSON` effaçait la couche.** Sur une couche distante, `geojson` est
une **adresse** ; filtrer « ce qu'on a » rendait une `FeatureCollection` vide, donc
supprimait la couche au premier contrôle activé. Un filtre qui supprime tout
ressemble à un filtre trop strict — on cherche l'erreur dans ses bornes.

Le filtrage de ces couches passe par **`expressionFiltreControles`** : on décrit
à MapLibre ce qu'il doit garder, au lieu de retrancher des entités qu'on n'a pas.
L'habillage suit (`-outline`, `-label`, `-hit`, `-pts`), sinon on verrait le
contour d'un objet écarté, et on pourrait encore cliquer dessus.

**La légende avait gardé le défaut que les contrôles n'avaient plus.**
`controlUniqueValues` sait retomber sur ce que le manifeste déclare ;
`filteredUniqueValues`, sa jumelle, ne le savait pas — et c'est elle qui
alimente la légende. Deux conséquences, vues à l'écran sur la démo des
Aygalades :

| | Avant | Maintenant |
|---|---|---|
| compte de la couche | **`0` écrit en dur** (`app_v7.js`, branche catégorisée) alors que `total` valait « ≈175 » | `total`, comme partout ailleurs |
| classes affichées | aucune — donc aucune clé de lecture sous une carte en trois couleurs | celles des `stops` du déclaratif, comptes à `—` |

Le repli ne vaut **que** pour une couche qui ne détient pas ses entités
(`geojson` n'est pas un tableau de features). Une couche locale dont le filtre
ne laisse rien doit continuer à rendre une liste vide : là, l'absence est
constatée, et la masquer ferait passer un filtre trop strict pour une légende
normale. `tests/controles-couche-distante.test.js` verrouille les deux sens.

> Le correctif avait été écrit une fois, appliqué à une seule des deux fonctions.
> C'est le pont rompu de `skills/echecs-silencieux.md` dans sa forme la plus
> coûteuse : **la version corrigée existe et prouve qu'on savait**.

> **La règle du couple** : `expressionFiltreControles` et `buildControlPredicate`
> doivent **classer pareil**. C'est la même scène et les mêmes bornes ; un écart
> donnerait deux cartes selon l'origine de la donnée, et on l'attribuerait à la
> donnée. `tests/controles-couche-distante.test.js` compare les deux entité par
> entité, bornes exactes et valeurs illisibles comprises.

**La règle du couple rompue sous des tests verts (corrigé le 24/09/2026).**
L'évaluateur de test (`tests/aide-expressions.js`) n'imitait pas MapLibre sur
deux points, et chacun cachait un défaut vu à l'écran :

| | MapLibre | L'évaluateur, avant | Conséquence |
|---|---|---|---|
| `['==', 1, 0]` (sélection vide, « Aucun ») | forme **historique** `["==", clé, valeur]`, refusée : « string expected, number found », le filtre précédent reste | accepté | « Aucun » sans effet sur une couche distante |
| `to-number('')` | **0** (`Number('')`) | refusé | `''` écarté côté carte, gardé en local |

- L'évaluateur lève maintenant sur la forme historique (même règle que
  `isExpressionFilter` de la spécification) et convertit comme MapLibre. Une
  sélection vide s'écrit `['literal', false]`.
- Un nombre se lit côté carte par `expressionNombre` (`lib/controls.js`) : un
  nombre passe, un texte se convertit après remplacement de la première virgule
  (« 3,5 », pour un `range` seulement, comme `nombreDe`), une chaîne qui vaut 0
  sans contenir le chiffre 0 (vide ou espaces) est illisible, un booléen aussi.
- Validé contre la vraie spécification de style de MapLibre 5.6
  (`@maplibre/maplibre-gl-style-spec` 23.3, installée hors du dépôt) : toutes
  les expressions produites se valident, et `featureFilter` classe comme le
  prédicat. Écarts restants, faute d'opérateur : « 1 000 » (lu 1000 en local
  seulement), « .5 » et « 5. » (lus côté carte seulement), l'exposant d'une date
  en secondes écrite en texte.

**« (sans valeur) » est aussi un choix sur une couche distante.**
`choixSansValeur` le propose dès que la couche a d'autres choix, avec un compte
`null` : sans entités, `nombreSansValeur` valait 0, `''` n'entrait jamais dans
la sélection, et « Tout » écartait pour de bon les objets sans valeur. Un `''`
déclaré dans `values[]` n'est plus listé comme une valeur (ligne au libellé
vide, `''` en double dans la sélection).

Vérifié à l'écran sur la scène de Sète : le curseur s'ouvre sur 10 → 20,2 m
(les bornes déclarées, non mesurables ici), et le pousser à 18,98 ne laisse que
les bâtiments les plus hauts.

### Chaque champ a le contrôle que son type appelle (16/09/2026)

Revue faite sur `Batiments_locaux` dans le document de non-régression. Le module
Contrôles écartait `etat` (Choice) faute de le trouver dans un manifeste
ancien, taisait `visite` (Date jamais renseignée), affichait « range » et
« select », et n'enregistrait un réglage que pour `source === 'qgis2grist'` —
jamais depuis un curseur.

| Type Grist | Contrôle | Autres formes proposées |
|---|---|---|
| `Date`, `DateTime` (secondes) | Date — jusqu'à / entre | — |
| `Int`, `Numeric` | Nombre — plage, min, max (pas entier pour `Int`) | Catégorie si ≤ 20 valeurs |
| `Bool`, `Choice`, `Ref` | Catégorie — checklist, choix unique (Oui/Non pour un booléen) | Texte (sauf booléen) |
| `ChoiceList`, `RefList` | Catégorie : un objet passe si **l'un** de ses choix est retenu | Texte |
| `Text` | profil des valeurs : nombres « 3,5 », dates « jj/mm/aaaa », sinon catégorie (≤ 20) ou texte | |

- **Le schéma du document fait foi** (`typeGristDuChamp`, `champsControlables`) :
  une colonne vide partout n'est pas dans les entités, et le manifeste peut
  dater d'avant elle. Une colonne sans valeur est **nommée** sous la liste.
- **« (sans valeur) » est un choix**, écrit `''` dans `values`. Activer une
  checklist coche tout, sans valeur compris : activer ne retranche rien. Vaut
  aussi pour une couche distante (`choixSansValeur`, compte inconnu).
- **Un clic part de ce que l'écran montre** (`basculerValeurSelection`). Sans
  sélection posée (contrôle venu du manifeste), toutes les cases s'affichent
  cochées : décocher une valeur l'écarte seule. Le clic partait d'une sélection
  vide, et décocher « Écoles » ne gardait que les Écoles (24/09/2026). Un choix
  unique sans sélection n'affiche aucun bouton choisi.
- **Le pas d'un curseur de date suit l'étendue des données** (`pasDuCurseur`) :
  environ 200 positions, de la minute au jour ; des dates seules (minuit UTC)
  gardent des jours entiers. Le pas valait au moins un jour : les 9 relevés
  d'essais-crisi, en 1 h 17, n'avaient qu'une position. Poussé à fond, le
  curseur vaut `dataMax` (`valeurDuCurseur`), sinon le dernier objet restait
  hors de la grille. L'heure s'affiche, à l'heure locale, dès que le pas
  descend sous le jour.
- Une liste Grist arrive `['L', a, b]` : `tableToGeoJSON` la garde sous
  `_l_<champ>` (le champ lui-même devient « a, b » pour l'affichage), et
  `featureToRowUpdate` la réécrit en liste — sinon une sauvegarde aplatissait
  la cellule en texte.
- `persisterControles` (débounce 700 ms) passe par `saveLayerToGrist`, qui sait
  où ranger chaque couche. Rien ne s'écrit en lecture.
- Limites d'une couche **distante** (filtre MapLibre) : une date écrite en
  texte ne se filtre pas, « Contient » ne retire pas les accents, un `Ref`
  s'y lit par son identifiant de ligne.
- `tests/controles-types.test.js` : tous les types de colonne, et 16 réglages
  comparés entité par entité entre `buildControlPredicate` et
  `expressionFiltreControles`.

### Symboliser une couche qu'on ne détient pas

L'inspecteur annonçait « 0 objets », proposait « — Champ — » et concluait
« ⚠️ Pas de valeurs numériques ». Trois affirmations, toutes fausses, et aucune
ne se présentait comme une ignorance.

| Source | Ce qu'elle apporte |
|---|---|
| `fields[]` du manifeste (`name`, `label`, **`gType`**) | les champs et leur type Grist — `_fields` ne venait que de la config widget qgis2grist, absente ici |
| `style.declarative.field` et `controls[].field` | un repli quand `fields[]` manque : la scène nomme les champs dont elle se sert |
| `controls[].dataMin`/`dataMax` | « Valeurs déclarées : 1,4 → 20,2 » au lieu de « pas de valeurs » |

> **`gType` fait autorité sur l'échantillon.** C'est ce que la colonne *est*, pas
> ce que ses valeurs ont l'air d'être — et il répond même quand il n'y a rien à
> échantillonner. Sans lui, `detectFieldType` rendait « text » par défaut, ce qui
> **retire le champ des choix d'une symbologie graduée**.

### Les fonds IGN : borner le zoom, ne pas inventer le sol (16-17/09/2026)

Deux échecs silencieux, trouvés en posant la démo des Aygalades sur la
photographie aérienne et le relief LiDAR.

**L'orthophotographie s'arrête au zoom 19.** La source raster ne déclarait pas
de `maxzoom` : au-delà, MapLibre demandait des tuiles 20 et 21, la Géoplateforme
répondait 404, et la carte montrait un **trou** — un pan de vide au milieu de
l'image, là où l'on venait justement de zoomer. Avec `IGN_ZOOM_MAX = 19`,
MapLibre agrandit la dernière tuile servie : l'image devient floue, ce qui est la
bonne façon de dire « il n'y a pas plus fin ». Même famille que le `maxzoom`
posé d'office sur les couches `xyz` d'une scène.

**Le MNT IGN rend des 502 par intermittence** quand les tuiles partent en rafale
— mesuré : 11 sur 35 au premier essai sur le vallon. Le protocole `ignmnt://`
répondait alors par une tuile **plate à 0 m**. Conséquence à l'écran : le relief
voisin se terminait en falaise au-dessus du vide, et l'on attribuait le défaut à
la donnée. Deux reprises espacées suffisent ; après elles, l'échec **se nomme**
et MapLibre garde la tuile parente — un relief plus grossier, mais juste.

> La règle est la même que pour `layerVisibleCount` : **ne pas rendre un nombre
> plausible quand on ne sait pas**. Zéro mètre est une altitude plausible.

> **Le code ne fait pas ce que dit le paragraphe précédent** (vérifié le
> 25/09/2026) : après trois essais, `ignmnt://` rend une tuile **plate à la
> moyenne de la dernière tuile décodée**, n'importe laquelle — pas la parente.
> Échecs simulés (une tuile sur quatre) : une tuile basse résolution en repli
> dresse un **mur beige** sur tout l'horizon (`essais-relief/captures/11-*`).
> La raison donnée pour ne pas échouer (« `_updateRetainedTiles` lève ») était
> l'exception des sources GeoJSON, corrigée ailleurs. Choix du repli à arbitrer
> (rapport relief, §À arbitrer).

### Une exception MapLibre aux étapes qui passent le bâti en volume

En enchaînant les huit étapes de la démo des Aygalades, la console reçoit
`Uncaught TypeError: Cannot read properties of undefined (reading 'key')`, levé
dans `_updateRetainedTiles` (cache de tuiles de MapLibre 5.6.1). **Le rendu
reprend** : les étapes s'affichent correctement, y compris la dernière.

Ce qui a été mesuré, pour ne pas repartir sur une fausse piste :

| Épreuve | Résultat |
|---|---|
| chargement seul, récit joué une fois | aucune erreur |
| vols de caméra seuls, même fond, même relief | aucune erreur |
| les huit étapes enchaînées | erreurs aux **étapes 4 et 7** — celles qui passent le bâti `extruded` |
| démo Vieux-Port (bâti extrudé, fond vecteur) | aucune erreur |
| borne `maxzoom` du fond IGN retirée | erreurs **quand même** — ce n'est pas la borne |

Donc : fond **raster** + couche extrudée remontée pendant un vol. Deux
atténuations écrites et sans effet mesurable — `map.stop()` avant `setStyle`, et
une étape qui attend `mapStyleUsable()` — sont **conservées** : elles décrivent
la bonne discipline, même si le défaut vient d'ailleurs.

> **Cause trouvée et corrigée le 25/09/2026.** Ce n'est ni le fond raster ni
> le vol : `SourceCache._updateRetainedTiles` (5.6.1) demande quatre enfants à
> une tuile idéale sans données dès que le zoom de couverture est un cran sous
> le `maxzoom` de la source, et une tuile **au** `maxzoom` n'en a qu'un
> (`children[1].key`). Sur relief en vue inclinée, les tuiles proches de la
> caméra montent d'un cran : sources GeoJSON à `maxzoom` 18 (défaut),
> couverture 17, tuiles en 18 — bâti, voirie, eau et mobilier de l'étape 6. Les
> sources GeoJSON d'Atlas se créent par `optionsSourceGeojson` (`maxzoom` 22) :
> 24 exceptions sur trois tours des étapes 5 à 7 → 0 sur deux récits complets.
> Réécrit dans les 5.x ultérieures. Toute nouvelle source GeoJSON passe par
> `optionsSourceGeojson`.

**Le repli du MNT avait sa propre erreur silencieuse** : la tuile plate qu'il
rendait faisait 256 px quand la source en déclare 512, et MapLibre la refusait
sur `dem dimension mismatch`. Le repli lui-même échouait — corrigé.

### Le relief n'empêche plus `idle` (25/09/2026)

Rapport complet : `docs/etudes-relief/VERIFICATION-RELIEF.md`.

**MapLibre 5.6.1 laisse à jamais `reloading` une tuile MNT rechargée**
(`RasterDEMTileSource.loadTile` ne repasse à `loaded` que sans `actor` ou
expirée). `setProjection` quand la projection change — globe → mercator à la
première étape d'un récit — et `setTerrain` quand le relief se rallume
rechargent la source : à l'ouverture de la démo des Aygalades, 14 tuiles
bloquées, 11 Mo retéléchargés pour rien, et **plus aucun `idle`** — or le
changement de fond (`quandNouveauStyle`), le montage des couches et le récit
l'attendent. `garderDemAuRechargement` (`lib/terrain-base.js`, testé), posé
par `addTerrainSource` : une tuile `reloading` qui a déjà son MNT repasse à
`loaded` sans requête.

**Un changement de fond perdait les luminaires.** MapLibre n'appelle pas
`onRemove` du calque three.js quand il remplace le style ; `onAdd` recrée la
scène, et la racine des luminaires restait dans l'ancienne (95 allumés, 0 à
l'écran après `setBasemap`, relief ou non). `Eclairage.construire` les
reconstruit quand `luminairesHorsScene` (`lib/eclairage-rendu.js`, testé).
Reste : l'ancien `WebGLRenderer` n'est pas libéré (même cause).

### Une étape de récit emporte son relief entier

`terrainSource` et `terrainExaggeration` sont capturés avec `terrain3D`, et
`applyStoryEnvironment` les applique **avant** l'activation — sinon `applyTerrain`
poserait le MNT précédent le temps d'un rendu. Sans eux, aucune étape ne pouvait
demander le MNT LiDAR HD : elle héritait du dernier réglage, c'est-à-dire du
relief mondial au pas de 30 m. Une scène externe les déclare aussi dans ses
`settings`.

**Le fond d'une scène externe se pose au montage, pas au premier `idle`.** Il
attendait `idle` : le `setStyle` tombait alors pendant le vol de caméra de la
première étape du récit, qui ne s'appliquait pas — la scène s'ouvrait à plat, sur
la caméra de la session précédente, ce qu'on prend pour un choix de cadrage. Et
le récit démarre désormais sur l'`idle` qui suit, plus sur un délai fixe.

Cela sert surtout la **sortie** du récit, qui rend la scène à l'état d'avant : cet
état était le fond par défaut, jamais celui que la scène déclare. Un lecteur qui
fermait le récit d'une scène en orthophotographie se retrouvait sur un plan.

**La source du relief s'enregistre comme le reste.** `A.setTerrainSource` était la
seule action du panneau Vue à ne pas appeler `persistScenePrefs` : on choisissait
le MNT LiDAR HD, on rechargeait, le relief mondial revenait sans un mot.
`terrainSource` figurait pourtant déjà dans les clés retenues par
`lib/scene-prefs.js` — le contrat était écrit, l'appel manquait.

### Le nom d'une scène se lit sous `title`, et sous lui seul

`scene-loader.js` lit `manifest.title`, la clé **normative** du contrat 0.2.2 —
`project_name` n'est pas au schéma. Une scène qui ne porte que `project_name`
s'affiche « Import QGIS », le libellé de repli : un nom plausible, donc qu'on ne
songe pas à mettre en doute. Les scènes attestées déclarent les deux ; une scène
neuve doit au minimum déclarer `title`.

### Le compte se lit sous deux clés, et il en existe deux

`featureCount` est la clé du **contrat 0.2.2** ; `n_features` celle qu'écrit la
cascade de publication amont. Atlas ne lisait que la seconde : un producteur
parfaitement conforme aurait affiché « — ». C'est le pont rompu classique — le
producteur écrit d'un côté, le consommateur lit de l'autre, et chacun fonctionne
très bien chez soi (cf. `skills/echecs-silencieux.md`).

### Inspecter, poser, borner — sans détenir les entités

**Le clic passe par la feature que MapLibre rend.** `showViewFeaturePopup` prend
un quatrième argument : sur une couche détenue on préfère toujours la feature
source, qui porte la géométrie entière — MapLibre, lui, rend des géométries
découpées par tuile ; sur une couche distante il n'y a pas de source, et la
feature rendue **est** tout ce qu'on aura. Elle porte les attributs, qui sont ce
que la fiche montre.

**Une couche distante n'entre jamais en mode sélection.** Il n'y a ni ligne Grist
à écrire ni feature source à modifier : l'inspecteur d'édition s'ouvrirait sur un
objet qu'on ne peut pas enregistrer, et un « Enregistrer » qui échoue est pire
que son absence. Le clic y ouvre la fiche, en consultation, même en édition.

> C'est ce qui a permis d'**éprouver la garde du gabarit de popup** : scène
> chargée par URL, `popup_template` contenant `<img src=x onerror=…>`, clic sur
> un bâtiment. Le gabarit ressort en texte (`&lt;img …&gt;`), aucune balise n'est
> créée, le script ne s'exécute pas.

**Le relief : une altitude par couche, pas zéro.** `extrusionExpressions` accepte
un `solConstant`. Sans lui, `['coalesce', ['get','_sol'], 0]` retombait au niveau
de la mer : sur un relief à 50 m, **toute la couche disparaissait sous le sol** —
elle est là, elle est peinte, et on ne la voit pas. L'altitude est sondée au
centre de la `bbox` déclarée. C'est approximatif (le relief varie sur une
emprise) et c'est assumé : cela sépare « mal calée » de « disparue ».

### Relief + couche distante extrudée — le problème n'existe plus

Atlas sondait une altitude unique **au centre de la bbox** pour les couches dont
il ne détient pas les entités. Mesuré sur les Aygalades, elle n'était juste
qu'au seul point sondé : le bâti formait une nappe plate suspendue 57 m au-dessus
du fond de vallon et enfouie 148 m sous le coteau est, traversée par les lignes
drapées.

`solConstant` a disparu avec tout le calage : **MapLibre drape l'extrusion
lui-même**, qu'Atlas détienne ou non les entités — c'est son affaire de rendu,
pas la nôtre. Une couche distante extrudée se comporte donc exactement comme une
couche détenue.

> La règle « `terrain3D` et une couche distante extrudée ne vont pas ensemble »
> **est levée**. Depuis la 1.7.1, la démo des Aygalades en fait la preuve : ses
> étapes posent le bâti en volume sur le relief LiDAR, et l'étape 7 l'accentue
> deux fois sans qu'aucun bâtiment ne flotte ni ne s'enfonce.

MapLibre n'expose toujours pas `fill-extrusion-base-alignment` (propriété Mapbox
GL v3, refusée en 5.6.1) — mais on n'en a pas besoin : l'alignement sur le
terrain est le comportement par défaut.

### Les bornes de zoom du manifeste sont appliquées

`visibility.minZoom`/`maxZoom` étaient **ignorées** — seul `defaultVisible`
agissait. C'est la réponse au repli en points sur une couche distante :
`pointFallbackZoom` déduit le seuil de bascule de la **taille réelle** des
entités, qu'on n'a pas.

> **Ne pas l'estimer depuis `bbox` et `featureCount`.** Mesuré sur Sète :
> `√(aire_bbox / n)` donne 165 m par entité là où les bâtiments en font 20 — les
> entités ne remplissent pas leur emprise. Un seuil faux ferait basculer au
> mauvais moment, sans que rien ne le signale.

Le producteur, lui, sait à quelle échelle sa couche est lisible. `poserBornesZoom`
combine les deux sources et retient **le minimum le plus restrictif**, pour qu'une
couche ne remonte pas au-dessus de l'échelle où son producteur la dit lisible.
Trois orthographes sont lues (`visibility.minZoom`, `visibility.min_zoom`,
`min_zoom` de la cascade de tuiles) : n'en lire qu'une serait un pont rompu de
plus.

### Une couche à modèles 3D doit porter ses entités

Les instances sont construites en parcourant `filteredGeoJSON(layer).features`
et en lisant `feature.geometry.coordinates`. Sur une couche servie par **URL**,
Atlas ne détient pas les entités : MapLibre les a, lui, mais Atlas n'y accède
pas. La liste est vide, et **rien n'est instancié**.

Le symptôme est trompeur : la couche est bien montée, la légende l'affiche avec
son compte déclaré et ses classes, le catalogue est chargé — et la carte reste
nue. Rien ne signale que le placement n'a jamais eu lieu ; on cherche du côté du
modèle, de l'échelle ou du zoom.

> **La règle** : `style.mode: 'library'` comme `'custom'` exigent une couche
> `inline` ou `table`. Éprouvé sur la démo des Aygalades — 374 objets de
> mobilier servis par URL n'affichaient rien ; les mêmes en `inline` (76 Ko)
> donnent 1 245 instances.

Corollaire visible, et voulu : une couche `inline` étant comptée pour de vrai,
sa légende affiche « Lampadaire 239 » sans le « ≈ » des couches distantes.

**`_modelId` par entité prime sur `style.library.modelId`.** Une seule couche
peut donc porter plusieurs modèles — lampadaires, arbres, bancs, abribus — et le
choix appartient à la donnée, pas à la couche. `style.library.modelId` n'est
alors qu'un repli pour les entités qui n'en déclarent aucun.

### L'identifiant de modèle : deux familles, un seul champ

Un identifiant de modèle — `style.library.modelId`, `_modelId` d'une entité
(colonne `atlas_3d_json`), `style.model.categories[].modelId`,
`defaultModelId`, manifeste de scène — désigne **un modèle parmi deux familles**,
et l'identifiant dit lui-même laquelle (`lib/modele-id.js`) :

| Forme | Famille | Exemple |
|---|---|---|
| `<id>` | bibliothèque low-poly (`models/`) | `streetlamp` |
| `objet:<type>` | **type** du catalogue d'objets réalistes (`objets/`) | `objet:applique_facade` |

- **Le préfixe protège l'existant** : aucun identifiant low-poly ne porte de `:`, donc
  tout ce qui est écrit depuis le début (tables Grist, manifestes, démos) reste lisible.
- **`objet:<type>` désigne un type, jamais un fichier** : variante, classe de hauteur
  (`hauteurFeu`, `height`) et niveau de détail restent choisis par le catalogue
  (`atlas-objets/0.1` §3.7). La scène ne fige donc aucun nom de fichier.
- **Type imposé ou déduit** : l'identifiant `objet:<type>` IMPOSE le type
  (`resoudreObjet(..., { typeId })`) ; l'affectation « Catalogue » le DÉDUIT des champs
  de l'objet. Un `_modelId` d'objet l'emporte sur la couche, comme pour le low-poly.
- **Forme et existence sont deux questions** (`verifierIdModele`) : un `objet:` bien
  formé mais absent du catalogue chargé est **conservé**, jamais effacé — le catalogue
  peut arriver après. L'objet ne s'affiche pas tant qu'il manque, et l'éditeur le dit.
- **Où il s'écrit** : manifeste (`style.library`, `style.model`), `Atlas_LayerPrefs`
  (`StyleJSON.library = { modelId }`, restauré par `applyLayerPrefsBinding` — avant le
  02/10/2026 le choix « Fixe » d'une couche liée à un manifeste se perdait à la
  réouverture), colonne `atlas_3d_json` d'un objet. Tout identifiant mal formé est
  refusé à la lecture et n'écrase jamais le modèle en place.
- **Où il se choisit** : éditeur de couche → Modèle 3D → « Fixe » (groupe « Objets
  réalistes »), « Catégorisé » (par valeur et par défaut, deux groupes), et module
  Catalogue 3D (galerie avec l'identifiant à recopier).
- Éprouvé le 02/10/2026 (application servie en local) : 8 instances résolues vers le
  bon fichier (mâts h4/h8/h12 d'après `hauteurFeu`, quatre types par catégorie, repli
  low-poly), 8 GLB en 200, choix à la main, refus d'un identifiant inconnu.
  **Éprouvé en Grist réel le 02/10/2026** (document d'essai « Atlas — essai édition géométrique », remis en l'état
  après l'essai) : le choix d'un objet réaliste pour une couche s'écrit dans `Atlas_LayerPrefs.StyleJSON`
  (`mode: library`, `library.modelId: objet:mat_crosse`) et revient à la réouverture.

**Un luminaire choisi se comporte comme un luminaire déduit** (éprouvé de nuit le
02/10/2026, 20 h 50, avec des fiches portant les paramètres EclExt) :

- **Allumage** : `Eclairage` honore l'identifiant (`typeImposeDe`) ; avant, il déduisait
  toujours le type des champs, et le choix de l'éditeur n'y changeait rien. Une couche dont
  **tous** les objets ont un type d'éclairage choisi devient une couche d'éclairage dès
  qu'ils portent une grandeur photométrique (`puissance` ou `temperatureCouleur`) :
  `structure` et `support`, qui distinguent un luminaire de tout autre point, sont alors
  superflus (`estPointLumineux(props, { impose: true })`). « Tous » : une couche mêlant
  luminaires et autres objets garde ses modèles. Sans grandeur, aucun flux ni couleur à
  émettre : le modèle reste un objet 3D éteint.
- **Paramètres qui pilotent l'état** (`etatPointLumineux`) : `statut` autre que
  `functional` → éteint ; `valideDe`/`valideJusque` → éteint hors période ;
  `allumageSoir`/`extinctionMatin`/`plages` ; `temperatureCouleur` lue par fiche.
  Vérifiés : allumé, hors service, hors validité, 2200 K.
- **Hauteur** : `hauteurFeu` choisit la classe du mât (h4…h12) ; les types **ancrés au feu**
  (applique, axial, projecteur) sont élevés de `hauteurFeu`, à défaut de la hauteur par
  défaut de leur bloc `lighting` (5,5 / 7,25 / 4 m). Hors `Eclairage`, `Models3D.placement`
  appliquait seulement `offsetZ` : ces types étaient **enterrés au pied de leur support**.
  Il pose maintenant comme `Eclairage` (`poseLuminaire`) ; `azimut` l'emporte sur le tirage.
- Changer le type d'une couche d'éclairage reconstruit les luminaires (l'empreinte de
  `Eclairage` porte la signature du modèle de la couche).

### Les paramètres d'un objet du catalogue : un schéma, trois niveaux, une provenance

Un objet réaliste est piloté par des **paramètres** (éclairage : puissance, température de couleur,
hauteur de feu, statut, allumage ; végétation, plus tard : hauteur, classe d'âge…). Le moteur est
générique (`lib/parametres-objet.js`) ; **une famille de plus est un schéma de plus, pas un écran de plus**.

- **Le schéma** vient du type du catalogue (`type.parameters[]`, proposition pour `atlas-objets` dans
  `docs/PROPOSITION-ATLAS-OBJETS-PARAMETRES.md`). Tant que le catalogue ne le déclare pas, Atlas en
  porte un **intégré** par famille — l'éclairage, d'après le vocabulaire EclExt, les bandes de
  plausibilité et les règles de pix2hdr. Le schéma d'un type l'emporte sur l'intégré, paramètre par
  paramètre.
- **Trois niveaux, et la provenance de chaque valeur**, du plus précis au plus général : réglage posé
  sur l'objet (`_params`, dans `atlas_3d_json.params`) ; champ de l'objet (le champ **lié**, sinon le nom
  du paramètre, sinon un alias comme `height`) ; réglage de la couche **pour le type**
  (`layer.parametres.valeurs`, dans `Atlas_LayerPrefs.StyleJSON.parametres`) ; défaut du type du
  catalogue ; règle d'Atlas. Chaque valeur affichée dit d'où elle vient — une hypothèse ne passe jamais
  pour une mesure.
- **Les défauts sont virtuels** : jamais écrits dans la table de l'équipe. Le geste « Figer dans la
  table » (`lib/parametres-figer.js`) les y écrit à la demande : colonnes créées au besoin, **cellules
  déjà remplies jamais touchées**, valeur déjà lue dans un champ jamais dupliquée.
- **Propriétés effectives** : les calculs (état, pose, intensité, choix de la classe de hauteur d'un mât)
  lisent les propriétés de l'objet **plus** chaque paramètre résolu sous son nom canonique
  (`proprietesEffectives`). Un réglage explicite atteint toujours les calculs ; un simple défaut n'y
  entre que si le paramètre l'a demandé (`inject`), pour que l'hypothèse « allumage au coucher du
  soleil » reste dite par l'état.
- **Un import OSM s'allume sans rien saisir** : les valeurs par règle (puissance au milieu de la bande de
  la classe photométrique, 3 000 K, plafond de l'arrêté de 2018) lui donnent la grandeur photométrique
  qui lui manquait ; `height` donne la hauteur de feu, donc la classe d'un mât. Ces valeurs sont
  étiquetées « règle d'Atlas, à vérifier ».
- **Comportement jour/nuit** : paramètre `comportement` — « selon le soleil » (défaut), « toujours
  allumé », « toujours éteint ». Forcer l'allumage n'allume jamais un point hors service ni hors
  validité. « Voir de jour / de nuit » règle l'heure de la scène sans changer de panneau.
- **L'interface est générée depuis le schéma** : onglet « Spécifications » de la **couche** (valeur de la
  couche par paramètre, pour tous les types ou un seul ; champ de la table à lire ; la situation en une
  phrase — « lu dans « height » (2 sur 3) · 1 sur 3 : 6 m — défaut du type » ; « Figer dans la table »)
  et de la **fiche d'un objet** (valeur effective, origine, réglage de cet objet, effacé en un clic ;
  lecture seule en mode lecture). Le moteur de formulaires (`FormEngine`) n'est pas utilisé ici : il
  remplace le formulaire par un écran de succès après envoi, impose un fil d'étapes et n'a pas
  d'héritage affiché (une liste vide dit « (aucun) ») — pour des réglages à trois niveaux, un formulaire
  généré par Atlas depuis le même schéma est plus lisible.
- **Une valeur de champ hors du vocabulaire** (`statut: out_of_service`) est lue telle quelle et
  signalée « valeur hors de la liste » ; une **saisie** reste strictement dans la liste. Une valeur
  hors de la bande usuelle est signalée, jamais refusée : la donnée est celle de l'équipe.
- **Éprouvé le 02/10/2026** (application servie en local, faux `docApi` pour « figer ») : défauts par
  règle, classe de hauteur lue dans `height`, champ lié, réglage de couche par type, comportement forcé,
  statut posé sur un seul objet, légende et fiche, figer (colonnes et cellules).
- **Éprouvé en Grist réel le 02/10/2026** (document d'essai, table `Arbres_remarquables`, remis en l'état après
  l'essai) : la puissance de couche écrite dans `Atlas_LayerPrefs.StyleJSON.parametres` et relue ; « Figer dans la
  table » (3 colonnes `Numeric` créées, 9 cellules écrites, le reste intact) ; le réglage d'un objet (20 W)
  écrit dans `atlas_3d_json.params` et relu après rechargement. Trois défauts ont été **trouvés par cet essai** et
  corrigés : (1) une table détectée dans le document ne relisait jamais `atlas_3d_json` (`tableToGeoJSON` —
  placement 3D compris) ; (2) sans la colonne `atlas_3d_json`, l'enregistrement d'un objet perdait son placement
  et ses réglages **en silence** : `saveFeatureToSource` la crée maintenant (`Text`, « Atlas 3D (JSON) ») et le
  toast le dit ; (3) l'onglet « Spécifications » manquait en revue objet par objet.
  **Création de la colonne, fiabilisée** (mesure en Grist réel) : Grist ne refuse pas un doublon, il crée
  `atlas_3d_json2` et le dit dans `retValues` — `saveFeatureToSource` retire alors la colonne parasite et écrit dans la
  vraie ; un document partagé en saisie seule refuse l'ajout (structure) — le reste de la ligne s'écrit, et le message
  dit que le placement et les réglages ne l'ont pas été. La colonne n'est pas créée à l'ouverture, pour ne pas
  modifier la structure de tables qu'on se contente d'afficher : elle l'est **au premier réglage d'un objet** (réglage
  ou curseur de placement), pas à l'enregistrement — `assurerColonneAtlas3d`, mémorisé par couche
  (`verifierPersistance3d`). Un éditeur sans droit sur la structure le **sait tout de suite** : message à l'instant du
  réglage, et avertissement permanent en tête des onglets « Placement 3D » et « Spécifications » de l'objet. Éprouvé en
  Grist réel : la colonne apparaît au premier réglage, avant tout enregistrement, lignes vides ; le refus de droits
  est éprouvé par test seulement (le compte d'essai a tous les droits).
- **Contrôles complémentaires du 02/10/2026** : rendu de **nuit** dans le vrai document (trois halos chauds au sol,
  légende « 3 allumés », rien enregistré) ; **lecture** : la bulle et le popup d'une lampe disent « Éclairage :
  éteint — statut out_of_service » (`pastilleEtat`) ; **mobile** (feuille du bas, sans débordement horizontal) ;
  **performance** : résoudre les paramètres de 10 000 objets coûte 138 ms (une fois par reconstruction, contre 97 ms
  pour le choix du fichier seul) ; **application Android** : `vendoriser` embarque les nouveaux modules
  (`parametres-objet`, `parametres-figer`, `modele-id`) et le catalogue `objets/`.

### Un contrôle inactif n'existe pas pour le lecteur

Seuls les contrôles `active: true` deviennent des pastilles (`listDockPills`).
Le schéma pose pourtant `active: false` par défaut, avec une bonne raison — « un
contrôle proposé n'est pas un contrôle appliqué ».

Les deux règles se combinent mal sur une **scène publiée** : le mode vitrine
refuse aussi le rail d'auteur, donc un contrôle déclaré mais inactif n'a
strictement aucun point d'entrée. Il est dans le manifeste, il n'est nulle part
à l'écran.

> Une scène destinée à être lue doit activer ce qu'elle veut rendre manipulable,
> avec des bornes couvrant toute la plage : le filtre est alors visible sans rien
> retrancher tant qu'on n'y touche pas.

### Couches de service externe — `xyz` seulement

Une couche `source.type: "xyz"` devient une source `raster` : MapLibre va
chercher les images au gabarit d'adresse, **rien ne transite par Atlas**. Elle
porte `_raster: true`, qui la tient à l'écart de tout ce qui suppose du
vectoriel — symbologie, contrôles, filtres, inspection : un fond de plan n'a ni
champ à graduer ni objet à inspecter.

`maxzoom` est **posé d'office à 19** faute de déclaration. Ce n'est pas une
précaution cosmétique : un service qui ne sert pas au-delà d'un niveau renvoie
des erreurs en boucle, et la carte **n'atteint alors jamais `idle`** — tout ce
qui attend cet état reste suspendu (mesuré sur `tile.openstreetmap.org`).

`wms`, `wmts` et `wfs` restent des échecs déclarés. `wfs` n'est d'ailleurs pas
des tuiles mais du GeoJSON par requête : il relèvera du chemin URL déjà écrit.

> **Chausse-trape héritée de QGIS** : les tuiles XYZ y sont rangées sous le
> fournisseur `wms` ; seul `type=xyz` dans la datasource les distingue. Sans
> cette lecture, un fond OSM serait annoncé comme un service WMS.

### L'avertissement MapLibre vient du fond de carte, pas d'Atlas

`Expected value to be of type number, but found null instead`, quelques fois au
montage d'une scène. **Élucidé le 04/09/2026** — il ne vient pas de nos données.

Le raisonnement qui bloquait était : « il n'apparaît pas sans scène, ce n'est
donc pas le style de fond ». Il est **faux**, et pour une raison qu'on ne voit
pas : sans scène, Atlas affiche son écran d'accueil et **la carte n'est jamais
montée**. Le fond n'étant pas rendu, il ne pouvait rien signaler. L'absence
d'avertissement ne prouvait rien du tout.

Le test qui tranche : une scène **triviale** — un point, couleur fixe, aucune
expression lisant un attribut — cadrée sur la même zone dense. L'avertissement
apparaît quand même. Compté sur cette scène : **zéro** couche de scène porte une
expression numérique lisant un attribut, contre **16 couches du fond**
OpenFreeMap qui en portent (boucliers d'autoroute, noms de routes, libellés de
plans d'eau).

> Ce n'est donc pas un garde-fou d'Atlas qui parle, et il n'y a rien à corriger
> chez nous. À savoir avant de repartir en chasse : le prochain qui verra ce
> message perdra le même temps.

**Leçon de méthode** : « le symptôme disparaît quand je retire X » ne prouve que
quelque chose si retirer X laisse le reste en état. Ici, retirer la scène
retirait aussi la carte.

### `fitToLayer` cadre aussi sur ce qui est déclaré

« Couche vide » était dit d'une couche distante, **qui ne l'est pas** : ses
entités sont ailleurs, pas absentes. Le message envoyait chercher une donnée
manquante au lieu d'une emprise non déclarée. `fitToLayer` retombe désormais sur
`_bboxDeclaree` et **retourne un booléen** — l'appelant n'annonce plus un zoom qui
n'a pas eu lieu, et dit à la place que le manifeste ne déclare pas de `bbox`.

**La règle qui découle des trois couches** : `vitrine=1` ne se pose que si l'on
embarque **le widget seul**. Si l'on embarque un **document** Grist, Atlas y est
réellement dans Grist — le poser lui ferait ignorer le document qu'il a sous la
main.

## `AddTable` veut des colonnes plates (26/09/2026)

`['AddTable', T, [{ id, type, label }]]` — **forme plate**. La forme
`{ id, fields: { type, label } }`, qu'Atlas employait partout, est ignorée par
Grist **sans erreur** : colonnes en `Text`, libellé égal à l'identifiant,
nombres rangés en texte (mesuré dans le document d'essai « Atlas — essai
édition géométrique »). Toutes les définitions sont passées à la forme plate ;
`tests/colonnes-addtable.test.js` le garde. Les tables déjà créées dans les
documents gardent leurs colonnes texte : ne pas supposer un vrai `Bool` sur
`Atlas_LayerPrefs.Visible`, lire avec `parseGristBool`.

Corollaire : avec de vrais types, Grist range « 01004 » en 1004 dans une
colonne `Int`. Une colonne ne se type en nombre que sur des valeurs **déjà**
numériques (`typeColonneDepuisValeurs`, `lib/schema-grist.js`) ; une chaîne qui
ressemble à un nombre reste du texte.

`AddTable` crée aussi une **page** au nom de la table, et `POST /apply` rend
bien `retValues`. Le propriétaire ne peut pas être privé de structure par une
règle d'accès : un refus de structure ne s'observe qu'avec un compte éditeur.

## Créer une couche vide — lot 1 de l'édition géométrique (26/09/2026)

Bouton « Nouvelle » du module Couches (éditeur seulement) : un nom, un type
(point, ligne, surface) et le nom de table Grist montré **avant** d'écrire,
collision comprise (`Arbres_2`, casse ignorée). La logique est dans
`lib/nouvelle-couche.js` (`planNouvelleCouche`, `colonnesNouvelleCouche`,
`actionsNouvelleCouche`, `lireCreation`, `natureRefus`) ; `A.creerNouvelleCouche`
ne fait qu'envoyer et monter.

- **Une seule `applyUserActions`** : `Maquette_Layers` et `Atlas_LayerPrefs` si
  absentes, la table, sa ligne d'inventaire (qui porte le type d'une table
  vide et la fait remonter au rechargement), sa ligne d'apparence
  (`lignePrefs`, la même que `saveLayerPref`). `gristId` et `_prefRowId` sont
  lus dans `retValues` : un enregistrement ultérieur met à jour, il n'ajoute pas.
- Table **sans préfixe `Atlas_`** ; jamais une table d'Atlas ou de ses
  producteurs (`Couche_Maquette_Layers`). Point : `latitude`/`longitude`
  `Numeric` ; ligne, surface : `geometry_json` `Text`. Plus `nom`. Rien d'autre.
- Un refus ne bascule **pas** la carte en lecture : `messageRefus` le dit selon
  sa nature (structure, droits, schéma).
- Contrôlé en Grist réel dans le document d'essai « Atlas — essai édition
  géométrique » (`uK3GLaDK5RfMXm69t7E9Ni`), page « Atlas » branchée sur
  `https://localhost:8443/projects/Atlas/index_v7.html`.

## Créer un point — lot 2 de l'édition géométrique (26/09/2026)

« Nouvel objet » dans l'inspecteur d'une couche de points à table (et armé
d'office après « Nouvelle couche » de points). `_saisieObjet` est un **état
exclusif** : il passe en tête du clic, du survol, d'Échap et de
`renderInspector`, et annule à l'entrée le choix d'un lieu, d'un trajet et la
sélection. La logique pure est dans `lib/saisie-objet.js` (`creationPossible`,
`pointDepuisClic`, `cellulesPourCouche`, `actionCreation`, `actionInverse`).

- **La fiche avant l'écriture.** `pontFormulaire({ creation: { cellules } })`
  n'a pas d'`editRowId` : le moteur soumet par `addRow`, qui écrit **un**
  `AddRecord` portant les champs puis la géométrie (le clic fait foi).
  Abandonner n'a rien à défaire. Repli sans moteur : le point et son `nom`.
- **Déplacer sans perdre la saisie** : le pont lit `creation.cellules` à
  l'envoi ; un second clic change les cellules et l'en-tête, pas la fiche.
  `renderSaisieObjet` est idempotent (`insp-body.dataset.saisie`) : sans cela,
  ouvrir un module remontait la fiche et effaçait ce qui était tapé.
- Après écriture : `relireCouche` (le cœur de `A.refreshLayer`, factorisé),
  puis sélection du nouvel objet par `_row_id` (`rangsDepuisRowIds`).
- Après « Nouvelle couche », `chargerFormulaires()` : sans relecture du
  schéma, la nouvelle table n'a pas de fiche.
- Point provisoire : source et couche `atlas-saisie`, au sommet de la pile.

## Tracer une ligne ou une surface — lot 3 (26/09/2026)

« Nouvel objet » sur une couche de lignes ou de surfaces arme **terra-draw**
(1.35.0, adaptateur MapLibre 1.4.1, dans l'importmap d'`index_v7.html`,
chargés par `chargerTraceur()` au premier tracé : ~50 Ko compressés). C'est le
moteur ; l'interface reste celle d'Atlas (panneau droit, « Sommet précédent »,
« Terminer », « Retracer », mesures dans l'en-tête).

- **Échap appartient à Atlas** (`keyEvents: { cancel: null }`) : il abandonne
  la création entière. Entrée termine. Le double-clic zoom est coupé pendant
  le tracé et rétabli à la sortie (`arreterTrace`).
- **Accroche aux autres couches** : `accrocheAtlas` (option `toCustom`) prend
  les formes de `layer.geojson` retrouvées par `_idx`, pas celles de
  `queryRenderedFeatures` — découpées aux bords des tuiles, elles poseraient
  des sommets qui n'existent pas. Alt maintenu la suspend. Logique pure :
  `pointAccroche` (`lib/saisie-objet.js`).
- **Le sommet provisoire** qui suit le curseur n'est pas compté
  (`formeEnCours`) : l'en-tête disait « 4 sommets » pour trois clics.
- Un sommet qui ferait se recouper une surface est refusé par
  `ValidateNotSelfIntersecting` **et signalé** (`signalerRecoupe`) : sans
  message, le clic semblait ignoré.
- À la fin : `formeValidee` (normalisation + validation du lot 0), puis le mode
  `static` garde la forme affichée. Le pont refuse un envoi sans forme
  (`creation.cellules` nul pendant un « Retracer »).
- **Annuler la création** : tant que l'objet créé reste sélectionné, la fiche
  offre « Annuler la création » (`_derniereCreation`, `actionInverse` →
  `RemoveRecord`). Oublié à la sortie de sélection.
- Contrôle navigateur : l'outil de test ne clique qu'au centre d'un élément ;
  poser des sommets = cliquer la carte, la déplacer aux flèches, recliquer.

## Modifier la forme d'un objet — lot 4 (26/09/2026)

« Modifier la forme » (fiche d'un objet d'une couche éditable) réutilise l'état
de création `_saisieObjet`, avec `modification: { rowId, origine, depart }` :
mêmes gardes (clic, Échap, `renderInspector`), panneau `renderModificationForme`
(ni fiche ni attributs), une seule écriture `actionModification` → `UpdateRecord`
des **seules** colonnes de géométrie.

- **Les cellules d'origine sont relues dans Grist à l'ouverture**
  (`fetchTable` → `ligneDepuisTable` → `cellulesDeLigne`), pas reconstruites
  depuis la carte : c'est ce qu'« Annuler la modification » réécrit à l'octet
  près, et ce contre quoi un changement venu d'ailleurs se détecte.
- **Avant d'écrire, on relit la ligne** : `decisionModification` rend
  `conflit` (la ligne a changé → refus, éditeur gardé), `inchange` (rien
  écrit) ou `ecrire`.
- L'objet édité est **retiré de sa couche** pendant l'édition (`sourceData`
  consulte `objetEnModification`) : sinon deux formes, dont une immobile. À
  l'abandon, il revient et sa fiche se rouvre.
- Ligne, surface : mode sélection de terra-draw (`TerraDrawSelectMode`) —
  sommets glissables, points milieux, clic droit pour retirer, objet
  glissable ; `keyEvents.delete: null` (supprimer un objet est le lot 5) ;
  annulation par geste (`TerraDrawSessionUndoRedo`). Point : un clic le
  déplace.
- Refusés, avec la raison : objet multi-parties, surface trouée, table
  qgis2grist (centroïdes, lot 6). Une altitude par sommet est signalée perdue.
- `fitToLayer` borne sa marge à la carte (`margeCadrage`) : avec module et
  fiche ouverts, 80 px de chaque côté ne laissaient plus de place et MapLibre
  refusait le cadrage en silence.

## Créer en série (26/09/2026)

Après l'envoi d'une fiche de création, `apresCreationObjet` ne sélectionne plus
l'objet : il relit la couche et **réarme la création sur la même couche**
(`A.nouvelObjet(id, { suite })`). On relève dix arbres, pas un : le clic
suivant pose le suivant, la fiche s'ouvre vide, ses obligatoires sont tenus
comme pour le premier.

- `_saisieObjet.precedente` (dernier ajout) et `serie` (combien) :
  `bandeauSerie` dit « 3 objets créés — dernier : ligne 12 » avec « Annuler
  cet ajout » (`RemoveRecord` de la dernière ligne, la création en cours
  continue) et « Voir sa fiche » (termine la série, ouvre l'objet).
- Le bouton de sortie dit « Terminer la série » tant que rien n'est posé,
  « Abandonner » dès qu'un point ou un sommet l'est (`libelleSortie`, mis à
  jour pendant le tracé par `majMesuresTrace`). Échap et ✕ disent ce qui est
  gardé (`messageAbandon`).
- Le rappel « Objet créé à l'instant / Annuler la création » dans la fiche ne
  sert plus qu'après « Voir sa fiche ».

## La caméra vise la zone visible (26/09/2026)

Suite de l'audit `docs/etudes-panneaux/AUDIT-PANNEAUX-CENTRE-CARTE.md`,
défauts D1 à D5, corrigés et remesurés (bureau 1440, tablette 820, téléphone
390×844 émulé).

- **Visée retenue et relancée** (`viserCadre`, `viserVol`, `relancerVisee`) :
  MapLibre fige au départ du vol le point d'écran visé ; un panneau qui
  s'ouvre ou se ferme en route décalait l'arrivée (−130 px, +180 px). Sur
  `resize` pendant le vol, la visée repart de la position courante avec le
  temps restant (`dureeRestante`). `resizeMapSoon` redimensionne aussi
  **tout de suite**. Mesuré après : 0 px. Tout nouveau cadrage passe par
  `viserCadre`/`viserVol`, pas par `map.fitBounds`/`flyTo` directement.
- **Ligne et surface** : `flyToFeature` → `garderVisible` — le plus petit
  `panBy` qui ramène l'objet dans la zone visible (`deplacementPourVoir`,
  pure, `lib/viewport.js`), rien s'il y est déjà, un cadrage s'il ne tient
  pas. Couvre le clic près du bord (l'objet passait sous la fiche) et la revue
  ◀ ▶ (l'objet courant sortait de l'écran).
- **Téléphone** : la marge de caméra (`map.setPadding`/`easeTo({padding})`)
  suit ce qui recouvre la carte — feuilles ouvertes et barre du bas
  (`margesActuelles` → `margesCarte`, pure), posée par `appliquerMarges` à
  chaque `poserPanneau`, au chargement et au changement de mise en page. La
  bulle du récit passe par la même fonction (`margesActuelles({ bulle })`) :
  plus de marge écrite à la main. `fitBounds` tient compte de cette marge
  (MapLibre 5.6.1 l'ajoute à la sienne) ; `margeCadrage` se mesure sur la
  zone visible.
- **Carte étroite (tablette)** : quand la fiche d'un **objet** s'ouvre et que
  la carte passerait sous 420 px (`moduleCedeALaFiche`), le module cède
  (`.module-cede`) et revient à la fermeture de la fiche. La symbolisation
  d'une couche ne fait pas céder le module ; un module rouvert exprès pendant
  la fiche reste (`_moduleImpose`). Mesuré : carte de 397 px au lieu de 136.
- **Objet courant** : en sélection multiple ou en revue, le halo porte
  `_courant` ; l'objet courant est plus opaque, au trait plus épais, dessiné
  par-dessus les autres (`HALO_SELECTION`, `EST_COURANT`). ◀ ▶ redessine le
  halo.

Restent de l'audit : les défauts moyens (✕ de la fiche et sélection, barre de
sélection compacte, palette sur téléphone, Échap dans le récit et les
pastilles, focus après la palette).

## WKT et colonnes de points écrivables (01/10/2026)

Cadrage : `docs/CADRAGE-RELEVES-TERRAIN.md` (relevés configurés par une équipe,
lots 1 à 7). Lots 1 et 2 faits.

- **WKT** (`lib/wkt.js`, testé) : `lireWkt` / `ecrireWkt` / `estWkt` —
  `POINT`, `LINESTRING`, `POLYGON` et leurs `MULTI`, `SRID=…;`, Z/M ignorés,
  `EMPTY`, malformé → `null` sans lever. Lu par les trois chemins :
  `parseGeometryValue` (tables liées), `lireGeometrie` (saisie), `rowToFeature`
  (manifeste). **Une table WKT est réécrite en WKT**, à précision inchangée :
  `formatGeometrie` relève la forme à la lecture (`layer.geometryFormat`),
  `colonnesGeometrie` la rend (`format`), `cellulesGeometrie` l'applique. La
  garde « Atlas ne sait pas écrire le WKT » de `creationPossible` est levée.
  Avant : la colonne était repérée (alias `wkt`) puis ignorée cellule par
  cellule — table listée, aucun objet — et une équipe avait dû créer des
  copies converties de ses tables.
- **Forme de la couche** : `selonTypeCouche` — une forme dessinée dans une
  couche `Multi*` s'écrit en `Multi*` d'une partie, pour que la table reste
  homogène pour les outils qui la lisent ailleurs.
- **Points** : `colonnesPointDepuisSchema` (dans `geoTablesDepuisSchema`)
  préfère un couple de colonnes de **données** (`Latitude_WGS84`) aux formules
  qui les recopient (`latitude = $Latitude_WGS84`), noms exacts puis
  approchants ; une formule ne sert qu'à lire, faute de mieux. Les couches déjà
  liées gardent leurs colonnes.
- Essai sans document : faux serveur REST de l'application (deux tables WKT),
  affichage puis création d'un domaine — `AddRecord` avec `WKT: "POLYGON ((…))"`.

### Lot 3 — l'apparence lue dans les tables de référence (01/10/2026)

- `lib/table-reference.js` (pur, testé) : `candidatsReference` choisit les
  tables à lire **sur le schéma seul** (un `Ref:<T>` désigne T ; un texte, les
  tables dont une colonne parle couleur, rang ou image ; jamais les tables
  d'Atlas) ; `analyserReference` trouve la clé (identifiant pour un `Ref`,
  sinon la colonne qui couvre ≥ 80 % des valeurs), la couleur (≥ 80 % de
  `#hex`), le rang (nom gravité/rang/ordre…, numérique), l'image (≥ 50 % d'URL
  d'image). Au plus quatre petites tables lues, mises en cache (`lignesDeTable`).
- **Couleur** (onglet Couleur, mode Catégorisé) : bloc « Table de référence »
  → `A.appliquerReferenceCouleur` pose les catégories (couleur, libellé) et
  `color.reference.rangs`. **Ordre de dessin** par gravité :
  `cleDeTriReference` → `circle-` / `line-` / `fill-` / `symbol-sort-key`
  (le plus grave par-dessus). « Relire » relit la table ; « Revenir à la
  palette » retire. Catégories et légende se rangent par rang (`valeursOrdonnees`).
- **Icônes** (onglet Icône des couches de points) : un champ, sa table
  d'images → `symbolization.icon = { mode: 'reference', field, images }`,
  couche `<id>-icon` au-dessus des cercles (le type en image, l'état en
  couleur). Images réduites à 128 px (`chargerIcone`), préchargées à la pose —
  `styleimagemissing` ne part pas toujours pour une image désignée par
  expression — et rechargées par l'événement après un changement de fond. Un
  lien rompu reçoit une image vide et se compte. L'icône se touche comme son
  point (`hitLayerIds`, `coucheDuRendu`).
- `SUFFIXES_HABILLAGE` (`lib/layer-order.js`) : la liste unique des habillages
  (`-icon` compris), lue pour masquer, filtrer et retirer. Elle était recopiée
  à trois endroits.
- Non fait : relire les tables de référence à l'ouverture (les couleurs
  enregistrées sont celles du dernier « Relire ») ; icônes depuis une colonne
  `Attachments` ; icône dans la légende.

### Lot 4 — la bulle d'objet (01/10/2026)

- `lib/bulle-objet.js` (pur, testé) : `bulleParDefaut` (titre, photos, champs
  sans technique ni coordonnées, pastilles, table liée, gestes),
  `modeleBulle` (le contenu à mettre en page), `derniereLigneLiee` /
  `nombreLignesLiees`, `lienItineraire` (`geo:` dans l'application, calculateur
  OpenStreetMap ailleurs), `couleurTexte`, `idsPiecesJointes` (lit aussi la
  liste qu'Atlas range en texte, « 1, 2 », et `_l_<champ>`).
- Onglet **Bulle** des couches à table : « Activer la bulle » propose une
  configuration tirée du schéma, puis titre, photos, pastilles, champs,
  dernière visite (`tablesReferencant`), gestes. Rangée dans
  `symbolization.bulle` : elle voyage avec les préférences et le récit.
- **En lecture, la bulle passe devant la fiche** (`bulleActive` dans le clic
  et dans `showViewFeaturePopup`) : squelette immédiat, puis couleurs des
  pastilles (symbologie, ou table de référence du champ), libellés des `Ref`,
  dernière visite (date, état constaté, nombre). `garderBulleVisible` déplace
  la carte du strict nécessaire (la légende la recouvrait).
- **Photos** : `urlPhoto` — jeton du document dans le widget
  (`/attachments/<id>/download?auth=`), et dans l'application l'adaptateur
  `docApi.urlPieceJointe` (`ClientRest.urlPieceJointe` lit le fichier avec la
  clé et rend une adresse `blob:`). Bande défilante sans barre, compteur,
  visionneuse au toucher.
- **Gestes** : « Voir la fiche » entre en sélection **en consultation**
  (`enterSelectionMode(…, { consultation: true })`, sinon la lecture rouvrait
  la bulle) ; sans formulaire, la fiche montre les attributs
  (`ficheConsultation`). « Nouvelle visite » ouvre l'onglet du formulaire de
  la table liée s'il est proposé hors édition, sinon le dit. Corrigé au
  passage : « 1 objets sélectionnés ».
- Éprouvé en simulation de l'application (faux serveur REST, photos lues avec
  la clé) ; pas encore dans un vrai document.

### Couleurs et catégories — défauts corrigés au passage (01/10/2026)

- **Les libellés de catégorie étaient perdus** à chaque relecture des entités :
  `syncColorCategoriesFromFeatures` reconstruisait la liste sans `label`
  (`tests/categories-libelles.test.js`).
- **Un champ `Ref` se lisait en identifiants** (« 1 », « 2 ») dans les
  catégories et la légende, et s'annonçait « 123 » : `etiqueterCategoriesRef`
  va chercher le libellé affiché par Grist (première colonne de texte de la
  table visée), gardé dans `color.libelles` ; le sélecteur dit « réf. ».
- **Liste des couches étroite** (inspecteur ouvert) : le nom n'avait que
  32 px et le badge « ⛓ table » débordait. Requête de conteneur : compte non
  coupé, badge réduit au pictogramme, actions de ligne au survol ou sur la
  ligne choisie, poignée plus étroite à la souris seulement.

## Application : la barre part en lecture, OSM se présente (26/09/2026)

- **Barre du haut** : `barreRetiree` (`lib/view-mode.js`, testée) la retire sur
  `?navbar=false` **ou** dans l'application en lecture ; `appliquerBarre` la
  rejoue à chaque changement de mode. Ce qu'elle portait passe sur la carte
  (`#commandes-hote`, en haut à gauche) : la marque ouvre le menu principal, la
  loupe la recherche, le crayon ramène l'édition quand la personne peut écrire
  (`peutProposerBasculeLectureEdition`) ; le menu principal offre aussi
  « Revenir à l'édition ». Les commandes s'effacent quand le dock ou la barre
  de sélection s'ouvrent. Le widget garde sa barre en lecture.
- **Overpass répond 406** à toute requête sans Referer ni User-Agent qui nomme
  l'application (mesuré : curl, okhttp, Dalvik, Chrome sans Referer) ;
  Nominatim répond 403. Un navigateur passe grâce à son Referer ; l'application
  (client natif de Capacitor) n'en envoie pas. `enTetesOsm`
  (`lib/osm-requete.js`, testé) ajoute `User-Agent: Atlas/<commit> (+page)`
  **dans l'application seulement**, et `messageRefusOsm` dit la cause d'un refus.
- Essai sans téléphone : un faux `Capacitor`, une configuration dans
  `localStorage` (`atlas_connexion`), un `fetch` qui sert l'API REST, et
  `window.grist` verrouillé pour ne garder que l'adaptateur — dans la page de
  développement, le script du plugin Grist le remplacerait (l'APK le retire).

## Onglets du téléphone (26/09/2026)

Vérifiés en téléphone émulé (390×844) et corrigés :

- **La marge de caméra se comparait à la marge courante**, encore l'ancienne
  pendant sa transition : toucher un onglet fiche ouverte fermait la fiche
  (marge 56 en route) puis ouvrait le module (495, jugée déjà là) — la carte
  finissait à 56 sous une feuille de 439 px. `appliquerMarges` compare à la
  dernière marge demandée (`_margesVisees`).
- **Création en cours** : toucher un onglet cède la fiche au module sans
  abandonner la création ; retoucher l'onglet referme le module et **rend la
  fiche** (`closeModulePanel` remet `ficheCedee` à faux) ; toucher la carte
  pendant la création ramène la fiche. Avant, la fiche restait cachée et le
  point suivant se posait sans formulaire visible, et le second toucher
  abandonnait la création.
- **« Plus » s'allume** pour les modules qu'il porte (Lieu, Soleil, Vues,
  Formulaires, Réglages) : `allumerOngletMobile`. Sans cela, aucun onglet
  n'était actif et l'on ne savait plus d'où venait la feuille.
- **Mécanique des feuilles préchargée** dès la mise en page téléphone : le
  premier toucher attendait son chargement, et un second toucher rapide dans le
  menu « Plus » tombait dans le vide.

Parcours vérifié : Couches ↔ Contrôles ↔ Récit, retoucher pour fermer, objet
touché (la fiche prime, le module se replie), onglet fiche ouverte (le module
revient), « Plus » → module, menu fermé sans choix. Non éprouvé sur un vrai
téléphone. Reste de l'audit : refermer par l'onglet laisse l'objet
sélectionné (même défaut que le ✕ de la fiche).

## Formulaires natifs, valeurs de départ, HTML du document (02/10/2026)

**Postures.** Les trois états d'usage existent déjà : `viewMode` faux = édition
(*Préparer*), `viewMode` vrai et `peutSaisir` vrai = *Exploiter* (le badge dit
« Lecture + saisie »), `viewMode` vrai et `peutSaisir` faux = *Lecture*.
`?mode=` ne fait que restreindre ; les droits de Grist font autorité. Vocabulaire :
« Lecture » est une posture, « consultation » est le mode d'une fiche qu'on ne
peut pas modifier (`ficheConsultation`), « vitrine » est le site de présentation.
Cadrage : `docs/CADRAGE-RELEVES-TERRAIN.md`, section « Vision d'ensemble ».

**Formulaires natifs de Grist** (`../grist_forms/shared/formdef-from-grist-form.js`).
Une section de vue de type `form` est relue en FormDef : ordre de la mise en page,
libellé (première ligne de `question`), aide (suite de la question et description
de la colonne), `formRequired`, boutons radio, zone de texte, tri des choix. Il
est relu à chaque ouverture (rien n'est copié dans `Formulaires`) et passe par la
même porte que les autres (`formulairesPourCouche`, identifiant `grist-form:<id>`,
`source: 'grist'`). Il est « publié » qu'il soit partagé publiquement ou non : qui
le propose, et où, se décide dans la scène. Les métadonnées viennent de
`chargerMeta(docApi, { vues: true })` (`lib/schema-grist.js`), qui lit
`_grist_Views*` en plus du schéma ; illisibles, il n'y a simplement pas de
formulaire natif. Un formulaire lié ne montre pas sa colonne de référence à
l'objet (`sansChamps`) : c'est le clic qui la porte (`pontFormulaire`).

**Valeurs de départ** (`lib/fiche-formulaire.js`, `departs` dans les réglages de
couche, écrits avec `Atlas_LayerPrefs`). Par champ d'un formulaire qui AJOUTE une
ligne : `vide`, `aujourdhui` (dates, à l'heure locale de la personne),
`precedente` (la dernière saisie sur cet appareil, rangée par document et par
formulaire : `atlas_saisies|<doc>|<formId>`), `reprise` (la dernière ligne de
l'objet). Sans décision, Atlas propose la date qui date la ligne et une
référence à des personnes (`precedente`) ; une entrée vide est une décision.
Les valeurs entrent par le pont, avant le premier rendu, jamais par le DOM. Le
terrain lit « Prérempli : … ». Le formulaire de la table de la couche part de la
ligne elle-même.

**Écrire dans le document sans l'exécuter.** `lib/html.js` : `echapper` pour tout
texte, `chaineJs` pour une valeur dans un `onclick`, `assainirTexte` (liste
blanche de balises et d'attributs) pour la seule consigne d'une étape. Le texte
d'une étape, le nom d'une couche et le résultat du géocodeur y passent ; c'était
rendu tel quel, y compris pour un récit chargé par `?scene=` (écrit par quelqu'un
sans droit sur le document), alors que le widget a l'accès complet et que
l'application garde sa clé sur l'appareil. Tout nouveau texte venu du document
suit la même règle.

**Pendant un récit, rien ne s'écrit dans les préférences de couche**
(`saveLayerToGrist` et `saveLayerPrefIfSynced` rendent la main si
`_storyPresenting`) : ce que la couche montre est l'état de l'étape, pas sa
configuration.

**Tables d'Atlas** (`lib/atlas-tables.js`) : une seule liste (configuration,
inventaire, amont, noms gardés d'avance) d'où `GEO_SKIP_TABLES` tire la sienne.
Une couche enregistrée en table prend `nomDeTableLibre`, jamais le nom d'une
table d'Atlas. Ajouter une table d'Atlas = l'ajouter ici.

**Imports versionnés** (`tests/imports-versions.test.js`) : un module de `lib/`
s'importe sous un seul jeton `?v=`, partout. Deux adresses = deux instances. Quand
un module change, changer son jeton dans tous les fichiers qui l'importent.

**Capture d'étape** : `polygonMode` est toujours écrit (`null` remet à plat) ;
un filtre par cases garde toutes ses valeurs cochées (pas de plafond de 40) ;
relancer la lecture en plein récit ne refait pas l'instantané d'avant récit ;
la date épinglée de la scène est suspendue pendant le récit et rendue à la
sortie. La caméra d'avant récit n'est pas rétablie : avec le suivi GPS elle
ferait voler la carte loin de la position de l'agent.

**Relecture indépendante du 02/10/2026** (corrigé) : une colonne `DateTime:Europe/Paris`
est un `DateTime` pour le moteur de formulaires (`normalizeGristType`), sinon elle se
saisissait en texte libre ; la colonne affichée (`visibleCol`) d'un formulaire natif est
traduite de numéro de ligne en nom de colonne ; le libellé d'une liste liée sans colonne
déclarée préfère `nom`, `libelle`, `titre`… et écarte courriels, adresses et codes
numériques ; `tableDePersonnes` reconnaît des mots entiers (pas `Equipements`) ; les
écritures de préférences de couche passent par une file (`saveLayerPref`), sinon des
enregistrements simultanés créaient `Atlas_LayerPrefs2`, `3`… ; les valeurs de départ
reprises d'avant sont écartées si elles n'existent plus ; les dernières saisies sont
rangées par identifiant de document, non par nom ; toute valeur de gestionnaire
`onclick` passe par `chaineJs`, tout libellé venu d'un formulaire par `echapper`.

**Limites connues, à lever avec les droits par table** :
- avec `?mode=view`, `peutSaisir` est posé sans sonde : un lecteur dont les règles
  d'accès refusent l'écriture voit les formulaires proposés, et son premier refus
  ne baisse pas `peutSaisir` — *Exploiter* est alors offert à tort ;
- la sonde d'écriture vise `Atlas_LayerPrefs` d'abord : un agent qui n'écrit que les
  relevés peut être classé *Lecture* ;
- les lignes d'une table liée lues pour « Reprise » sont gardées en cache
  (`_lignesReference`) : une visite ajoutée par un autre utilisateur n'y paraît
  qu'après rechargement ;
- supprimer une couche retire sa ligne de `Maquette_Layers` mais laisse celle de
  `Atlas_LayerPrefs` ; une table réajoutée retrouve ses anciennes préférences ;
- basculer la visibilité d'une couche en table, en édition, crée désormais
  `Atlas_LayerPrefs` (et sa page) au premier basculement : c'est voulu, ce que
  l'éditeur masque doit rester masqué pour l'agent, mais ce n'est plus une
  « empreinte nulle » pour un document qu'on a seulement regardé en édition.

## Choisir un objet : la liste, la recherche dans l'enregistrement (02/10/2026)

**Une seule règle pour ouvrir un objet** (`lib/ouvrir-objet.js`, `decisionOuverture`,
appliquée par `ouvrirObjet` dans `app_v7.js`) : en *Préparer* la fiche (le popup pour
une couche distante) ; en *Exploiter* ou *Lecture* la bulle si la couche en a une,
sinon la fiche de saisie si un formulaire est proposé, sinon le popup ; pendant un
récit, la fiche si l'étape propose des saisies sur cette couche. Le toucher sur la
carte, la recherche, « le plus proche », les objets d'une étape et la liste passent
tous par elle : la recherche ouvrait la fiche quand le toucher ouvrait la bulle, et
« le plus proche » allait toujours à la fiche. Un oubli de `lecture` se lit comme la
lecture, jamais comme l'édition.

**La liste d'objets** (`lib/objets-liste.js`, pur, testé ; l'interface dans
`app_v7.js`, section « OUVRIR UN OBJET ET LISTE D'OBJETS »). Depuis la pastille
Relevé (« Choisir un objet ») ou la palette (« Objets de « Couche » »), le panneau de
l'objet montre les objets de la couche, filtrés comme la carte : couleur d'état,
nom, état, dernière visite, distance. « Proches » mesure depuis la position de
l'appareil, à défaut depuis le centre de la carte ; « A – Z » trie par nom. Une
ligne ouvre l'objet par la règle ci-dessus ; « Visite » ouvre directement le
formulaire de relevé de l'objet, et fermer la fiche rend la liste. Elle se ferme
par Échap, par ✕, et quand on change de posture.

**La recherche dans l'enregistrement** : nom ET valeurs de champ. Tous les mots
doivent se retrouver (dans le nom ou dans un champ), un mot d'une lettre ne
cherche que le début du nom, le nom prime sur un champ, une référence se cherche
par son libellé (jamais par son numéro : `libellesDeChamp` résout `Ref` et
`RefList`, par la colonne que Grist affiche), et le résultat dit où le mot a été
trouvé (« Type : Pont maçonnerie »). La palette utilise le même index ; tant qu'il
n'est pas prêt pour une couche, elle répond par le nom. L'index (`_indexListe`)
est refait quand la couche est relue. Les colonnes de géométrie, d'Atlas, les
booléens et les pièces jointes ne s'indexent pas.

## Droits par table et postures (02/10/2026)

**Droits par table** (`lib/droits-tables.js`, pur, testé). Atlas n'avait qu'un droit
pour tout le document ; Grist règle l'écriture table par table. `DROITS` apprend de
ce qui s'est passé, sans lire les règles d'accès : une écriture réussie dit
`ecriture` pour ses tables ; un refus de droits dit `refus` **seulement si le lot ne
touchait qu'une table** (sinon on ne sait pas laquelle) ; tout le reste n'apprend
rien ; `inconnu` ne retire rien. Une écriture refusée sur un formulaire proposé
retire ce formulaire. `categorieTable` sépare configuration (`Atlas_*`,
`Maquette_*`, `Formulaires`) et relevé (tout le reste).

**Postures** (`lib/posture.js`). Préparer = `viewMode` faux ; Exploiter = `viewMode`
vrai + `peutSaisir` vrai ; Lecture = les deux faux. La posture est DÉRIVÉE des deux
champs (`postureDepuis`), jamais stockée à côté ; `appliquerPosture` est la seule
écriture de `viewMode`/`peutSaisir` après l'ouverture. Offertes (`posturesOffertes`) :
Lecture toujours ; Exploiter si un formulaire de relevé est proposé hors édition et
que sa table n'a pas refusé ; Préparer si la configuration peut s'écrire
(`configurationEcrivable`, faux après un refus franc de la sonde de départ ou
d'une écriture de configuration). Le badge, l'avatar, le bouton `#hote-edition` et
le menu de l'application ouvrent le même menu `#posture-menu` ; une posture non
offerte reste visible avec sa raison. Le choix est retenu par document, sur
l'appareil (`localStorage` `atlas_posture|<doc>`), jamais dans `Atlas_ScenePrefs`.
À l'ouverture (`choisirPostureAuDemarrage`, après `chargerFormulaires`) : choix
retenu s'il est encore offert ; dans l'application, Exploiter si offerte ; sinon
l'ouverture telle quelle. Un refus franc de la configuration
(`enterViewModeOnWriteFail`) retire Préparer et replie sur Exploiter si offerte,
sinon Lecture — un agent de relevé ne perd plus sa saisie à cause d'une table
de configuration qu'il n'a jamais dû écrire.

Éprouvé dans l'application simulée (faux REST + faux Capacitor) : menu à trois
choix avec raison, Lecture retenue après rechargement, Exploiter offerte une fois
le formulaire proposé, refus de configuration -> Lecture. Pas encore sur la copie.

## Étapes à clé stable, récit écrit par clé (02/10/2026)

`Atlas_Story` gagne une colonne `Cle` (`lib/recit-cles.js`, pur, testé ; branché dans
`lib/story.js`). Chaque étape a une `cle` qui naît avec elle (`e-xxxxxxxx`) et ne
change plus, ni au déplacement ni à la réécriture : c'est elle qu'un contexte, une
progression ou une zone désigneront, jamais le rang ni l'identifiant de ligne. Une
étape copiée reçoit une nouvelle clé (`assurerCles`). Une ligne ancienne (table
écrite avant, ou par `bootstrap-*`/`app.js`) reçoit `h-<rang>` à la lecture :
déterministe, donc deux lecteurs donnent la même clé à la même ligne ; la mise en
ordre (`aReecrire`) pose les clés au premier chargement d'un éditeur et retire les
reliquats en double. La colonne manquante est ajoutée dans le même lot que les clés.

**Écriture par clé, en trois points** (`planifierEcritureRecit`). Plus d'effacement
général : on compare ce qu'on avait lu (`_baseRecit`, remis à zéro à chaque lecture),
ce qu'on a maintenant et ce que le document contient. On n'écrit que ce que NOUS avons
changé, on ne retire que ce que NOUS avions, une étape lue nulle part n'est jamais
touchée, une étape modifiée ailleurs et pas ici garde sa modification ; changée des deux
côtés, la nôtre l'emporte. Sans lecture préalable, rien ne se retire. La lecture ne
déduplique plus par rang (deux éditeurs qui ajoutaient « l'étape 4 » s'en effaçaient une)
mais par clé. Tout part en UN `applyUserActions`. La base ne bouge qu'après un
enregistrement réussi.

Limites connues : le récit local ne reflète pas ce qu'un autre ajoute avant un
rechargement (il n'y a pas de relecture périodique du récit) ; la trace d'un trajet est
copiée dans l'état de chaque étape, donc la changer réécrit toutes les étapes.
Éprouvé dans l'application simulée (capture, renommage, suppression : mises à jour
ciblées, aucun effacement) ; pas encore sur la copie.

## Contextes de travail : la pastille « Contexte » (02/10/2026)

Un contexte est une **étape du récit qu'on joue sans la séquence** (`lib/contextes.js`,
pur, testé). Il n'y a pas de table `Atlas_Contextes` : la scène est l'ensemble de ses
configurations, et le contexte une de ses étapes. Ce qui l'en distingue est le bloc
`state.usage` de l'étape (aujourd'hui `{ contexte: true }`, prévu pour porter aussi
postures, zone GPS, ordre, règle de création) ; il vit avec l'étape (même ligne, même
clé stable) et survit à « Re-capturer la vue » (`fusionnerApresPhoto`). L'auteur le
pose par la case « Proposer comme contexte » du module Récit (`A.storyContexte`).

**Restitution.** Même chemin que le lecteur de récit (`applyStoryState`, instantané
d'avant, `restorePreStorySnapshot`), sans ses commandes. Deux drapeaux, deux sens :
`_storyPresenting` = « l'état affiché est celui d'une étape » (rien ne s'écrit comme
préférence : `saveLayerToGrist`, `saveLayerPrefIfSynced`, caméra, relecture) ;
`_contexteCle` = « c'est un contexte, pas le lecteur ». `lecteurRecitActif()`
(`_storyPresenting && !_contexteCle`) remplace `_storyPresenting` aux seuls endroits
qui parlent du lecteur : la pastille « Lire le récit », créer un objet, modifier une
forme (permis pendant un contexte : c'est le travail), voler vers un objet choisi.
Le lecteur prend la main sur un contexte (l'instantané d'origine est gardé) ; toute
sortie (`storyExit`) efface `_contexteCle` ; passer en Préparer quitte le contexte.

**La pastille** (`kind: 'contexte'`, en lecture et en exploitation seulement, jamais
dans le lecteur ni en édition) liste « Scène de base » puis les contextes proposés ;
le panneau montre la consigne du contexte actif (texte de l'étape, HTML filtré par
`assainirTexte`). Éprouvé dans l'application simulée : proposer, passer en Lecture,
appliquer, consigne sans script, retour à la scène de base ; pas encore sur la copie.
Reste : blocs de la carte de consigne (photo, compteur, formulaire intégré, « Suivant »),
progression, zone qui propose un contexte par GPS.

## Éprouvé sur la copie réelle (02/10/2026)

Contrôlé en Grist réel sur la copie de travail des ouvrages (jamais l'original) : menu de
posture à trois choix et raison de « Exploiter » non offerte ; formulaire natif de visite
proposé hors édition (écriture dans `Atlas_LayerPrefs` acceptée), puis réouverture
directe en Exploitation ; liste « Choisir un objet » (108 objets, état, dernière visite
réelle, distance) ; fiche d'objet avec le formulaire natif (inspecteurs depuis la table
d'agents, date préremplie) ; création de `Atlas_Story` avec la colonne `Cle`, puis mise à
jour de la même ligne par clé quand on renseigne le texte de l'étape. Le titre d'un
formulaire d'équipe, long, débordait de l'onglet de la fiche : il est coupé par une
ellipse (infobulle = titre entier).
Pas encore éprouvé en réel : la pastille « Contexte » (vue en simulation seulement), le
refus d'écriture par table (la copie accorde tout à ce compte) et l'identité de
l'application. Rappel de méthode : `take_snapshot` voit l'iframe du widget ; les
touches clavier vont à la page sélectionnée, pas à celle qu'on regarde — vérifier
`list_pages` avant d'appuyer sur une touche.

**Plafond du lien (02/10/2026).** `posturesOffertes` reçoit un `plafond` : `?mode=view` plafonne à
Exploiter, ce qui retire Préparer même si la posture retenue sur l'appareil ou le repli la
proposerait (défaut relevé à l'inventaire des expositions : un lien de terrain rouvrait en
édition). Chaque source (hébergement, droits, lien, publication) ne fait que retirer des
postures ; la carte complète est dans `docs/CARTE-DES-EXPOSITIONS.md`.

## Ouverture de la scène : par où l'on entre (02/10/2026)

L'auteur dit par où la scène s'ouvre pour qui ne l'édite pas : **la carte** (défaut), **le
récit** dès l'ouverture, ou **un contexte** précis. Bloc `exposition` (`lib/exposition.js`, pur,
testé), stocké avec la scène dans `Atlas_ScenePrefs.ExpositionJSON` — un choix d'auteur,
partagé, pas un réglage d'appareil. Le bloc est prévu pour porter ensuite d'autres choix
d'exposition (un plafond de posture posé par l'auteur) ; seule l'ouverture existe.
`ouvertureEffective` ne l'applique pas à qui prépare (l'auteur arrive sur la carte qu'il
règle) et retombe sur la carte quand la scène ne peut plus tenir le réglage (récit sans étape,
contexte supprimé ou plus proposé, désigné par sa clé). `appliquerOuverture` joue une fois,
après le choix de posture, une fois le style prêt ; jamais en scène par adresse (qui lance
déjà son récit). Réglage : sélecteur « À l'ouverture, pour qui ne l'édite pas » dans le module
Récit. `Atlas_ScenePrefs` gagne la colonne `ExpositionJSON` (ajoutée aux tables anciennes, comme
`SettingsJSON` avant) ; `saveScenePrefs` ne l'écrit que si on la lui donne.
Éprouvé en simulation (Lecture + `?expo=recit|contexte` dans le faux document : récit lancé,
contexte appliqué sans lecteur, aucune présentation pour qui prépare) et sur la copie réelle
(table `Atlas_ScenePrefs` avec les trois colonnes, ouverture écrite).

## Volumes sur relief : un bloc rigide, donc à l'échelle du bâtiment (02/10/2026)

**Diagnostic.** Les sections « Relief + couche distante extrudée » et `lib/terrain-base.js`
affirmaient que MapLibre pose les extrusions « sommet par sommet ». Le vertex shader de
MapLibre 5.6.1 dit l'inverse : tous les sommets d'une entité reçoivent la même altitude, celle
du MNT au **centroïde** (`get_elevation(a_centroid)`), base enterrée de 10 m si elle vaut 0,
et le centroïde est celui du **fragment de tuile**. Une entité est un bloc rigide. Pour un
bâtiment c'est juste ; pour une grande surface (un domaine, une zone) elle flotte d'un côté,
s'enfonce de l'autre, montre une paroi de 40 m au lieu de 12, et change quand le zoom ou la
résolution du MNT change — ce que le terrain voyait comme « les volumes bougent quand je
déplace la carte ».

**Correction** (`lib/volume-relief.js`, pur, testé). Chaque entité surfacique porte `_taille_m`
(diagonale de son emprise, mémorisée par géométrie). Relief actif, celles qui dépassent
`SEUIL_VOLUME_M` (250 m) quittent la couche d'extrusion (filtre) et sont **posées à plat** :
`<id>-vaste` (remplissage) et `<id>-vaste-contour`, que MapLibre drape pixel par pixel sur le MNT.
Les suffixes sont déclarés dans `SUFFIXES_HABILLAGE` / `layerGfxIds` (ordre, visibilité,
retrait, filtre) ; `hitLayerIds` et `coucheDuRendu` les connaissent (la grande surface reste
cliquable). `applyTerrain` restyle les couches concernées quand le relief s'allume ou s'éteint.
Sans relief, rien ne change (un bloc rigide y est exact). Une couche distante (adresse) n'a
pas ses entités en mémoire : non marquée, donc inchangée. Le module Couches → Taille dit
combien de surfaces sont posées à plat. Éprouvé sur la page d'essai (petit bâtiment en volume,
grand domaine drapé sur les versants), pas encore sur la copie où le relief est éteint par défaut.
Reste à décider : couper les grandes surfaces en cellules pour garder un volume qui suit le
relief par paliers (demande une bibliothèque de découpe), ou s'en tenir au drapé.

## Les contrôles publiés se lisent en entier (02/10/2026)

Constaté sur une copie réelle : dans le panneau d'une pastille de contrôle, les libellés de catégorie
(« C_Etat mauvais, travaux à envisager à court terme ») étaient coupés par une ellipse, la liste plafonnait à
132 px et laissait des valeurs hors de vue, et les poignées d'une plage étaient rognées par le bord du panneau.
Corrigé dans `index_v7.html` : le panneau peut atteindre 440 px et 62 % de la hauteur, un libellé passe sur
deux ou trois lignes (la légende sur deux), les curseurs gardent une marge. Une liste de valeurs suit l'ordre de
la légende quand le champ colore la couche (gravité d'une table de référence), au lieu de l'effectif.
Vérifié à 1500 px et à 500 px de large. Non vérifié sur téléphone réel.

## Hors réseau — premier étage : lire depuis l'appareil, écrire dans une file (02/10/2026)

Pour l'application seulement (`ClientRest` ; dans un widget Grist, le document tient ses garanties).
`lib/hors-ligne.js` enveloppe le client (`habillerHorsLigne`, posé dans `hote-ui.js` à l'ouverture d'une scène) :

- **Lire** : chaque table lue est gardée dans IndexedDB (instantané daté). Sans réseau — annoncé par l'appareil, ou
  constaté par un échec — l'instantané répond : la scène **s'ouvre à froid sans réseau**, une fois vue. Un échec récent
  fait servir l'appareil sans attendre le suivant (la relecture périodique n'empile pas les délais).
- **Écrire** : une écriture que le réseau n'a pas portée entre dans une **file** (`file`), dans l'ordre, avec des
  identifiants **provisoires très négatifs** (`BASE_PROVISOIRE`, -10⁹ : un délai de -6 mois ne leur ressemble pas). Elle
  se voit tout de suite dans les lectures (`appliquerFileSurTable`) et part seule au retour du réseau (événement,
  relance toutes les 30 s, bouton « Envoyer maintenant »).
- **Références provisoires** : une visite posée sur un objet créé hors réseau suit son vrai identifiant à l'envoi ; une
  entrée qui en dépend est refusée avec la précédente si celle-ci l'est.
- **Photos** : gardées avec leur fichier (`pj`), envoyées avant la ligne qui les cite, identifiant remplacé.
- **Ce qui n'entre PAS en file** : les réglages d'Atlas (`Atlas_*`, `Maquette_*`, `Formulaires` : une copie périmée
  n'a pas à les écrire) et les changements de structure (AddColumn…) — ils échouent comme avant, avec `horsReseau: true`
  (`assurerColonneAtlas3d` y voit « inconnu », pas un refus de droits).
- **Pas de déduplication par colonne** (décision 2 du cadrage en attente) : un journal local. Un envoi interrompu par la
  fermeture de l'application devient « **incertain** » : montré, jamais renvoyé d'office (il pourrait doubler une visite).
- **Interface** : pastille « Hors réseau · n en attente » / « À vérifier · n » (`pastilleSynchro`), en tête du dock en
  toute posture ; son panneau liste les entrées, l'âge des données, et propose Réessayer / Abandonner.
- **Pas de résolution de conflit** : une ligne modifiée ailleurs entre-temps est écrasée à l'envoi.

Éprouvé : 25 tests, et l'application simulée (coupure, file, retour du réseau, ouverture à froid). **Non fait** : la
carte hors réseau (fonds, tuiles, relief : lot 4 du cadrage), la création d'un projet sur téléphone, la reprise après
refus de droits, les polices et `geotiff.js` non embarqués. **Non éprouvé** sur un téléphone.

## Regroupement par couche, palette inversée, contour seul (02/10/2026)

Trois réglages de base de la symbolisation, demandés pour des couches denses (une centaine d'ouvrages, 2 500 tronçons).

- **Regroupement** (`lib/grappes.js`, pur, testé ; `symbolization.cluster = { enabled, rayon, zoomMax, couleur }`,
  enregistré avec le reste de la symbolisation). Réglé dans l'onglet Taille de la couche.
  - **Points** (cercles natifs ; pas les modèles 3D) : MapLibre regroupe dans la **source de la couche**
    (`cluster: true`). Les couches d'objets (cercle, icône, étiquette) portent `FILTRE_ISOLE` pour écarter les
    regroupements — `layer._sourceGroupee` le garde même si une étape de récit coupe le regroupement, sinon un rond de
    regroupement s'afficherait comme un objet.
  - **Lignes et surfaces** : on regroupe leurs **centres** (`centroidCollection`), dans une source `<id>-grappes` ; la
    forme n'apparaît qu'au zoom suivant (`layer._grappeZoom`, via `minzoom`) — à la place du repli en points ordinaire.
  - **Couleur du rond** : celle de la couche, ou **celle de l'objet le plus grave** quand la couleur vient d'une table de
    référence avec un rang (agrégat `pire` = max du rang, `clusterProperties`).
  - Toucher un rond approche la carte jusqu'au zoom où il se défait (`getClusterExpansionZoom`).
  - **Limites** : changer le regroupement reconstruit la source (`addLayerToMap`) ; une **étape de récit** ne rejoue pas
    le regroupement (elle ne reconstruit pas les sources) ; les couches distantes et les modèles 3D ne se regroupent pas.
- **Palette inversée** : `symbolization.color.inverse`, case « Inverser la palette » sous les palettes de la couleur par
  catégorie et de la couleur graduée (`paletteEn`). Sans effet sur des couleurs lues dans une table de référence.
- **Surfaces à plat, contour seul** : `symbolization.remplissage = 'contour'` — le remplissage reste (il porte le clic) à
  opacité 0, le trait ne descend pas sous 2 px.

## Étapes depuis les objets, le long d'un trajet (02/10/2026)

Un trajet se définit depuis une polyligne d'une couche (« Créer un trajet » dans le module Récit : on touche la ligne ;
pour une ligne multiple, la partie touchée). Nouveau : **« Étapes depuis les objets »** (même module, sous le trajet) crée
**une étape par objet d'une couche de points situé à moins de N m de la ligne**, dans l'ordre du parcours
(`objetsLeLong`, `lib/trajet.js`, testé). Chaque étape cadre l'objet (zoom 17 au moins), porte sa place sur la ligne et
les formulaires proposés. Le titre est le nom de l'objet. Éprouvé dans l'application simulée (boucle de 1,3 km, 12
objets). Pour une boucle de randonnée : composer la tournée des ouvrages qui la bordent, d'un geste.

## Ajouter un objet en Exploiter, quand l'auteur le propose (02/10/2026)

La création d'un objet était réservée à *Préparer*. Elle s'ouvre à *Exploiter* **couche par couche**, par un réglage de
l'auteur : sous « Nouvel objet », la case « Les agents peuvent aussi ajouter un objet, en Exploiter »
(`symbolization.creation.exploiter`, enregistré avec la symbolisation). Trois garde-fous (`creationPossible`) :
1. **proposé par l'auteur** pour cette couche — par défaut, rien ne change ;
2. **posture Exploiter** — jamais en *Lecture* ;
3. **le document ne refuse pas** — le verdict appris pour la table (`DROITS.verdict`) ; un refus retire le bouton.
Les autres garde-fous (couche distante, copie sans table, géométrie non prise en charge) valent toujours.
Côté agent : la pastille « Relevé » liste la couche, avec « ＋ Ajouter un objet » (même sans formulaire) ; la création suit
le geste de *Préparer* (point placé au toucher, fiche, « Envoyer »), la fiche étant montrée par `mode-saisie`. La table de la
couche compte parmi les tables que *Exploiter* écrit (`tablesDeReleve`) : proposer l'ajout suffit à offrir la posture.
Éprouvé dans l'application simulée ; pas encore sur la copie réelle.

## Classes par seuils : couleur graduée à la main, contour selon un champ (02/10/2026)

Une première version codait un « mode échéance » (couronne rouge/ambre, comptes, pastille). C'était trop spécifique : le sens
(négatif = en retard, en mois) était écrit dans Atlas. Il est remplacé par **deux réglages ordinaires de style**, applicables à
n'importe quel champ numérique — un délai, une profondeur, un âge, une pente (`lib/classes.js`, pur, 11 tests) :

- **Couleur graduée, « Seuils à la main »** (onglet Couleur, mode Gradué, bloc « Découpage ») : au lieu de répartir d'office
  entre le minimum et le maximum, on pose les seuils et la couleur de chaque classe. Ce sont les **classes bornées du style
  déclaratif** (`_declarative.stops` avec `lower`/`upper`) — la voie qu'Atlas empruntait déjà pour les graduations de
  manifeste : rien de nouveau côté rendu, export ni récit. Règle de QGIS, **hautes inclusives** : une classe va jusqu'à son
  seuil, inclus. Boutons : ＋/− Seuil, ⇄ Inverser les couleurs ; la légende compte les objets par classe.
- **Contour « Selon un champ »** (onglet Taille) : le contour d'un point ou d'une surface suit son propre champ, avec ses
  propres classes (`stroke.mode = 'regle'`, `stroke.regle = { field, stops }`). Une classe peut être **sans contour** (∅) :
  le remplissage garde son sens (l'état), le contour dit autre chose (l'urgence). La légende ajoute « Contour · champ » avec
  ses comptes. Le suivi d'ouvrages en fait une couronne rouge/ambre sur un délai en mois — sans que rien ne le sache.
- **Corrigé au passage** : choisir le champ d'une couleur graduée après le mode laissait le découpage de 0 à 1 d'avant (toutes
  les valeurs dans la première classe) ; il repart maintenant des données.
Éprouvé dans l'application simulée (classes, légende, inversion) ; pas encore sur la copie réelle.

## « Moi » comme valeur de départ : qui est connecté (02/10/2026)

L'API plugin et le jeton de document ne disent pas qui est connecté ; ce que Grist propose pour un widget : une colonne à
**formule déclenchée** (`user.Email`, `user.Name`, à la création de la ligne) — ou une table d'utilisateurs protégée ligne par
ligne. **Dans l'application**, on se présente avec la clé : `GET /api/profile/user` répond (`id`, `email`, `name`, mesuré le
02/10/2026). `ClientRest.profil()` le lit à l'ouverture de la scène (`hote-ui.js`), `ClientHorsLigne.profil()` le garde sur
l'appareil, l'adaptateur le pose dans `grist.user`, et `setUserIdentity` en fait l'identité du badge.
Nouveau départ **« Moi (la personne connectée) »** (`moi`) pour un champ `Ref` ou `RefList` vers une table de personnes :
`moiDansTable` retrouve la ligne dont la colonne de courriel porte le sien (casse et espaces ignorés) ; sans identité, sans
colonne de courriel ou sans cette personne, rien n'est prérempli — jamais la valeur de quelqu'un d'autre. L'option n'est
proposée dans le module Formulaires que quand on sait qui est connecté (donc dans l'application, pas dans le widget).
**Dans le widget**, la voie propre reste côté document : une colonne « Saisi par » à formule déclenchée `user.Email`, et pour
l'inspecteur une formule `Agents.lookupOne(Email=user.Email)` — qu'Atlas pourrait créer (AddColumn avec formule), à décider.

## Itinéraire sur un réseau de lignes (02/10/2026)

Un export de tronçons (BD TOPO, routes OSM, sentiers) ne se prête pas à un trajet défini tronçon par tronçon. Récit → trajet →
**« Itinéraire sur un réseau »** : on choisit la couche de lignes, on touche un **départ**, des **points de passage** et une
**arrivée** ; le chemin se trace sur le réseau (aperçu bleu, numéros, « Retirer le dernier », « Terminer — en faire le
trajet », Échap annule) et devient le trajet du récit (même objet que « Créer un trajet »).
`lib/itineraire.js` (pur, 13 tests) : chaque sommet est un nœud, chaque segment une arête ; les **bouts de lignes à moins de
3 m** sont raccordés (un export tombe rarement au même point) ; un point se **projette** sur le segment le plus proche (pas
besoin de viser un carrefour, refusé au-delà de 250 m) ; plus court chemin par Dijkstra (tas binaire). **Sans service, donc
sans réseau.** Ne connaît ni sens uniques, ni interdictions, ni vitesse : le plus court chemin, ce qu'on demande à pied ou sur
des sentiers. Un réseau coupé donne un message (« un tronçon manque, ou deux lignes ne se touchent pas »). Éprouvé dans
l'application simulée (grille de 17 tronçons, 4 points, 2,6 km) ; pas sur un export réel de plusieurs dizaines de milliers de
tronçons — la construction du réseau y sera à mesurer.

## Explications au survol et onglet Icône (02/10/2026, audit d'usage)

- **`infoBulle(texte)`** (app_v7.js) : un « i » discret (`.info-i`) dont le texte s'affiche dans une bulle unique `#info-bulle`
  posée en `fixed` (survol, focus clavier, appui au toucher ; Échap la ferme). À employer pour ce qui **explique** (une règle
  de découpage, ce que fait un réglage) ; ce qui **avertit d'une conséquence** reste écrit en clair. Le style est dans
  `index_v7.html` (et dans la page d'essai `essais-controles/index-vitrine-bulle.html`).
- **Onglet Forme** (couches de points) : Taille, Icône et Modèle 3D en blocs repliables (`blocsFormeOuverts`) ; Couleur | Forme | Étiquette | Bulle | Spécifications, cinq onglets au plus. **Bloc Icône** : toujours présent, mais sa liste ne propose que les champs qui peuvent donner une image. Présélection sur le schéma
  (`champsAvecImages`, lib/table-reference.js : ni nombres, ni dates ; une table candidate porte une colonne d'image), puis
  confirmation par la lecture de la table de référence (`champsIcone`). La liste ne propose que les champs confirmés ; sans
  aucun, l'onglet reste (décision de l'utilisateur) et dit qu'aucun champ ne renvoie à une table d'images.

## Barre du haut : export en menu, bouton de posture (02/10/2026)

- **Exporter** est une icône, comme Ouvrir et Télécharger ; elle ouvre un menu (`ouvrirMenuExport`) : GeoJSON, CSV (géométrie en
  WKT), KML, GPX (points et traces ; les surfaces sont écartées et comptées), image de la carte (PNG), projet Atlas. Les
  conversions sont dans `lib/export-formats.js` (pur, 7 tests). Sur quelles couches : la couche sélectionnée, sinon toutes ;
  un choix permet d'en décider. Une couche distante ou de tuiles est annoncée comme absente du fichier. Sur téléphone, le
  même menu s'ouvre en feuille depuis « Plus » → « Exporter… » ; la palette de commandes l'offre aussi.
- **Posture** : un bouton (`#btn-posture`) dit la posture en cours (icône + nom : crayon « Préparer », presse-papier coché
  « Exploiter », œil « Lecture ») et ouvre le choix ; sur la carte, `#hote-edition` porte la **même icône**, le même titre,
  la même couleur. L'avatar ne dit plus que *qui* (il n'apparaît que si l'identité est connue) ; le badge « Lecture » a disparu.
  Quand rien ne peut changer, le bouton dit seulement la posture (`aria-disabled`).
- Pas encore d'**import** GPX / KML / CSV (seuls GeoJSON, projet et scène s'ouvrent) : voir les propositions.

## Lieu : ouvrir sur les données, sur un lieu, ou sur une vue (02/10/2026)

- **Où la carte s'ouvre** est un choix d'auteur, enregistré avec la scène (`Atlas_ScenePrefs.ExpositionJSON`, clé `cadrage`,
  `lib/cadrage.js`, 13 tests) : `donnees` (toutes les couches, ou une, par sa table ou son nom), `lieu` (coordonnées et nom
  gardés dans le cadrage lui-même) ou `vue` (la caméra figée). Sans choix : les données si la scène en a, sinon le lieu — ce
  qu'Atlas faisait déjà. Une couche retirée ou un cadrage abîmé retombent sur les données, jamais sur du vide.
- **L'ancre du soleil et du fuseau** (`STATE.location`) suit l'emprise des données tant que personne n'a désigné de lieu
  (`STATE.locationChoisie`, posé par la recherche, la position, le pointé, les coordonnées, un projet chargé ou un manifeste) :
  une scène de Lyon ne se règle plus sur le Vieux-Port.
- Le module Lieu propose les trois choix ; « un lieu précis » déplie les outils de recherche, et désigner un lieu le choisit
  comme ouverture. La caméra de session (rechargement d'une même visite) prime toujours sur le cadrage de l'auteur.
- Pas encore éprouvé en Grist réel : l'écriture de `cadrage` dans `ExpositionJSON` passe par le même enregistrement que
  l'ouverture du récit, essayé seulement dans l'application simulée.

## Scènes disponibles hors ligne (02/10/2026, étage 1)

- **Préparer** : `ClientHorsLigne.preparerHorsLigne()` lit **au réseau** (jamais depuis l'appareil) la liste des tables, les
  métadonnées qu'Atlas lit à l'ouverture (`TABLES_META` : schéma, vues, formulaires natifs), toutes les tables de
  l'utilisateur, puis les **photos** que ces tables référencent (colonnes `Attachments` repérées dans les métadonnées ;
  plafond de 150 Mo, le reste est compté « non gardé »). Sans réseau : échec net, rien n'est déclaré prêt. Une table
  illisible est comptée dans `echecs`, les autres sont gardées. Détails et tailles dans `etatHorsLigne()` ; `libererHorsLigne()`
  retire tables et photos et **ne touche jamais** à la file d'écriture.
- **Photos** : `ClientRest.pieceJointe(id)` rend le fichier ; une photo gardée se sert de l'appareil (`urlPieceJointe`,
  clé `pjreel:<doc>|<id>` du magasin `divers`).
- **Où** : menu principal (marque « Atlas ») → « Disponible hors ligne » (prépare ou met à jour, avec l'avancement) et
  « Libérer l'espace » ; la liste des scènes dit « disponible hors ligne » (`scenesPreparees`). Phrases : `lib/hote.js`
  (`phrasePreparation`, `phraseProgres`, `libelleOctets`). **Une scène préparée est figée jusqu'à la prochaine
  préparation** : rien ne se met à jour tout seul, et la phrase dit la date.
- **Fond de carte sans réseau** : un aplat (`STYLE_HORS_RESEAU`), choisi d'emblée si l'appareil se dit hors réseau, sinon
  quand le style de base ne se lit pas. Sans lui, la carte ne se déclarait jamais chargée et les couches ne se montaient pas.
  Les étiquettes (glyphes) et les tuiles manquent ; les données, non. Les **tuiles IGN** à précharger restent un lot
  séparé (conditions d'usage à vérifier).
- Déjà embarqués dans l'APK (`packages/atlas-app`) : MapLibre, three.js, SunCalc, terra-draw, les modèles 3D et le moteur de
  formulaire. **Pas** les polices web (repli sur celles du système) ni le relief.
- **Éprouvé** : tests (35 dans `hors-ligne.test.js`), menu et aplat dans l'application simulée. **Pas** sur un téléphone en
  mode avion, ni sur une vraie instance.

## Import GPX, KML, CSV (02/10/2026)

- `lib/import-formats.js` (pur, 10 tests, relit ce que `lib/export-formats.js` écrit) : un petit lecteur XML, `lireGpx` (points de
  passage → une couche, traces et itinéraires → une autre), `lireKml` (un dossier = une couche, scindé par genre de géométrie),
  `lireCsv` (colonne WKT, sinon `lat` / `lon` ; séparateur reconnu ; virgule décimale ; colonnes toutes numériques rendues en
  nombres), `natureFichier` / `lireFichier`. Tout en WGS 84 : des coordonnées hors des degrés sont refusées (Lambert 93, UTM) plutôt
  que posées dans l'océan. Un CSV sans géométrie ni coordonnées dit pourquoi.
- « Fichier » et « Ouvrir un projet » reconnaissent ces formats (`importerFichierFormat`) ; ce qui est écarté (position
  illisible) est compté dans le message. Pas de KMZ (un zip) : à ajouter avec JSZip si le besoin vient.

## Le bouton de synchronisation quitte la carte (02/10/2026)

L'état « hors réseau / en attente / à vérifier » n'est pas une information cartographique : la pastille du dock disparaît. Il y a
désormais une **pastille dans la barre du haut, à côté du nom du projet** (`#btn-synchro`, texte « Hors réseau », « 2 en attente »… ; rouge doux, pleine quand il faut vérifier) et, quand la barre est retirée (application en lecture), **sur la
carte avec les autres commandes** (`#hote-synchro`). Il n'apparaît que lorsqu'il y a quelque chose à dire ; la pastille dit la phrase. Il ouvre un panneau
(`ouvrirPanneauSynchro`) qui reprend le contenu de l'ancienne pastille — état, dernier envoi, entrées de la file, « Envoyer
maintenant », « Réessayer », « Abandonner » — et qui se referme de lui-même quand il n'y a plus rien à dire.

**Icônes de la barre** : Ouvrir (dossier), Télécharger le projet (flèche vers le bas, l'inverse de Exporter — ce n'était plus une disquette), Exporter (flèche vers le haut).

## La liste des scènes : rôle, tri, filtre, miniature (02/10/2026)

- **Écran « Vos scènes »** (`lib/hote-ui.js`, `montrerScenes`) : recherche (nom, organisation, espace ; accents et casse ignorés), tri
  (plus récentes / nom / organisation) et puces de **rôle** (Propriétaire, Éditeur, Lecteur — ceux que Grist donne dans `access`,
  retenus par `decouverte.js` et mémorisés avec la liste) plus « Hors ligne ». Le tri et le filtre se retiennent
  (`atlas_liste`). La mémoire s'affiche d'abord, puis le compte la confirme ; un rendu par image pendant le balayage. Pures et
  testées : `trierScenes`, `filtrerScenes`, `libelleRole`, `lirePrefsListe` (`lib/hote.js`).
- **« Exploitant »** n'est pas un rôle de Grist : la liste ne peut pas le dire (c'est un droit par table, appris à l'ouverture).
- **Miniature** : `Atlas_ScenePrefs.Miniature` (URL de données JPEG, environ 25 Ko, plafond 120 000 caractères) que l'auteur pose
  par « Utiliser la vue actuelle » dans le module **Lieu** (recadrée 8:5, 320×200). La liste la lit scène par scène (3 en
  parallèle, une requête `records?limit=1` par scène reconnue), la garde dans le magasin `divers` d'IndexedDB et ne la relit que
  si le document a changé. Sans miniature : l'initiale de la scène sur fond rosé.
- **Menu principal** : « Scènes récentes » (les trois dernières vues, hors la courante) change de scène sans repasser par la liste.
- Essayé dans l'application simulée (deux organisations, trois rôles) ; pas sur un compte réel.

## Nouvelle scène, scène locale, envoi vers Grist (02/10/2026)

- **Trois portes, un seul chemin** : « Nouvelle scène » (liste des scènes et menu principal) crée soit un **document Grist neuf**
  (nom, espace où l'on est propriétaire ou éditeur), soit une **scène sur l'appareil**. « Envoyer vers Grist » (menu, ou panneau
  de la pastille « Sur l'appareil · à envoyer ») verse une scène locale dans un document neuf. Une scène neuve dans Grist, c'est
  une scène vide (`sceneNeuve`, avec `Atlas_ScenePrefs`) envoyée par le même plan.
- **`lib/scene-locale.js`** : un document Grist en petit, sans document distant. Moteur pur (`appliquerActions` : `AddTable`,
  `AddColumn`, `RemoveColumn`, `AddRecord`, `BulkAddRecord`, `UpdateRecord`, `BulkUpdateRecord`, `RemoveRecord`,
  `BulkRemoveRecord` ; **tout autre refusé en le disant**, un lot atomique) ; il sert aussi `_grist_Tables` et
  `_grist_Tables_column` à partir de ses tables (c'est ce qu'Atlas lit à l'ouverture). `ClientLocal` a la forme de `ClientRest`
  (`mode: 'local'`, `docId: 'local:<id>'`), garde l'état dans IndexedDB (magasin `divers`, une entrée par scène) et ses photos
  en blobs (identifiants entiers positifs). **Limites** : pas de colonne à formule, pas de vues Grist, pas de règles d'accès ;
  chaque écriture réécrit la scène entière (très bien pour une scène neuve, à revoir pour de gros imports).
- **`lib/creer-document.js`** : `listerEspacesEditables`, `creerDocument` (`POST /api/workspaces/{id}/docs`),
  `planEnvoi` / `envoyerScene` : document → photos → tables → données, avec un **journal** (document créé, photos versées,
  tables créées) gardé à chaque étape — un envoi interrompu se reprend où il s'est arrêté (le nombre de lignes déjà arrivées se
  lit en SQL ; les lots de 500 lignes sont atomiques), sans second document. Les lignes partent **avec leurs identifiants** (les
  références restent vraies), les colonnes `Ref` s'ajoutent après toutes les tables, les cellules `Attachments` sont traduites
  vers les identifiants que Grist a donnés. Une scène sans table de signature reçoit `Atlas_ScenePrefs` pour être reconnue.
- **Première ouverture** : une scène neuve ouvre le module Couches (drapeau `atlas_nouvelle_scene`, une seule fois).
- **Éprouvé** : 40 tests (moteur, client, plan, reprise après coupure, photos, références) contre un faux Grist qui applique
  vraiment les actions ; création d'une couche et de deux objets dans une scène locale, envoi, création dans Grist et ouverture,
  dans l'application simulée (`essais-controles/faux-vitrine-bulle.js` fait de vrais documents neufs avec ce moteur).
- **Pas éprouvé en Grist réel — à vérifier avec un espace de test** : la réponse de `POST /api/workspaces/{id}/docs`, un
  `BulkAddRecord` avec identifiants imposés, le comptage SQL, la table par défaut d'un document neuf, le format du retour d'un
  envoi de pièce jointe, et les types de colonnes d'Atlas (`widgetOptions`) à la recréation.
