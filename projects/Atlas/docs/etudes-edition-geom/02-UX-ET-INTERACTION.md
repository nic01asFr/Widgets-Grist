# Édition et création de géométries — UX, interaction, brique de dessin

> Étude de conception, 24/09/2026. Aucun code n'a été modifié.
> Périmètre : `projects/Atlas/` (widget, `app_v7.js`, `index_v7.html`, `lib/`) et
> l'application Android (`packages/atlas-app`).
> Les références `fichier:ligne` visent l'état du dépôt au 24/09/2026 (branche
> `atlas-formulaire-entite`, arbre de travail non commité) ; elles bougeront.
> Ce qui n'a pas été vérifié est signalé **[non vérifié]**.

---

## 0. Résumé

1. **Une session d'édition de couche**, et non un onglet de plus. L'édition de
   géométrie est un *mode de la carte* : elle capte les clics, pose des poignées,
   désactive la sélection. La ranger dans un onglet « Géométrie » de l'inspecteur
   (proposition précédente) laisse croire qu'on peut changer d'onglet en gardant
   la carte « armée » : c'est la source d'ambiguïté la plus sûre. Le panneau droit
   devient donc, le temps de la session, le **panneau d'édition de la couche**
   (en-tête, objet courant, mesures, fiche, Enregistrer / Abandonner) ; les
   **outils** vivent dans une barre posée à l'emplacement de la barre de sélection
   (bas de carte), qu'elle remplace.
2. **MVP : Point, Ligne, Surface simples**, comme proposé — mais avec trois
   corrections : (a) un objet Multi* ou 3D existant ne doit pas être *abîmé* par
   l'éditeur (géométrie en consultation, message) ; (b) **« point à ma position »
   entre au MVP** (coût faible, valeur terrain forte, `_dernierePosition` existe
   déjà) ; (c) la **visée au réticule** sur téléphone entre au MVP : sans elle, un
   doigt pose un sommet à ±5 m près et masque ce qu'il pose.
3. **Brique : terra-draw 1.35.0 + terra-draw-maplibre-gl-adapter 1.4.1** (MIT,
   ≈ 52 Ko gzip à eux deux), utilisés comme *moteur* — sans l'interface toute
   faite de `@watergis/maplibre-gl-terradraw`. L'interface reste celle d'Atlas.
   L'accrochage aux autres couches passe par `snapping.toCustom`, calculé par
   Atlas sur `layer.geojson`. Geoman est écarté (exige MapLibre ≥ 5.7.1, et ≥ 6
   depuis la 0.9.0 ; Atlas est figé en 5.6.1). mapbox-gl-draw est écarté (ni
   accrochage ni annulation, tactile médiocre, compatibilité MapLibre non
   officielle). Un éditeur maison coûterait des semaines pour refaire ce que
   terra-draw couvre et teste.
4. **Le trajet de récit** réutilise l'outil Ligne tel quel, avec deux
   paramètres : la destination (pas de table, `STATE.trajet`) et l'accrochage
   « le long d'une ligne existante » en plus de l'accrochage aux sommets.

---

## 1. L'existant qui conditionne le design

| Élément | Où | Ce qu'il impose |
|---|---|---|
| Inspecteur droit `#inspector` (`insp-head`, `insp-tabs`, `insp-body`, `insp-foot`) | `index_v7.html:1456-1465` | un seul panneau droit, piloté par `renderInspector` (`app_v7.js:5974`) qui choisit entre fiche d'objet et symbologie |
| Fiche d'objet : onglets = formulaires + « Placement 3D » | `renderObjectInspector` `app_v7.js:6530` ; `objectInspectorTabs` `lib/model-layer.js:70` | les onglets sont des *formulaires* ; un onglet « Géométrie » y serait d'une autre nature |
| Barre de sélection `#selection-bar` (bas de carte) | `index_v7.html:1436-1447` | emplacement naturel d'une barre d'outils de carte ; ne peut pas cohabiter avec une seconde barre |
| Clic carte : `locationPickMode` → `trajetPickMode` → sélection | `app_v7.js:6696-6749` | chaîne de priorités à laquelle la session d'édition doit s'ajouter **en tête** |
| Sélection rectangulaire : Maj + glisser, appui long au doigt | `app_v7.js:6754-6835` ; `LONG_PRESS_MS = 450` `app_v7.js:2863` | l'appui long est déjà pris ; ne s'arme que si `STATE.selection.mode` (`app_v7.js:6776`) |
| Échap en cascade | `app_v7.js:10419-10425` | la session doit y prendre la première place |
| Module Couches : actions OSM / Fichier / Table | `app_v7.js:4152-4160`, liste `renderLayersPanel` `app_v7.js:4162` | « Nouvelle couche » s'y range |
| Inspecteur de couche : `boutonEnTable`, `boutonRevueObjets` | `app_v7.js:6002-6014`, en-tête `app_v7.js:6060-6066` | « Éditer la couche » / « Nouvel objet » s'y rangent |
| Création de table depuis Atlas | `entableLayer` `app_v7.js:7253` (`AddTable` + `geometry_json` Text) | modèle de stockage à reprendre pour une couche créée vide |
| Écriture d'une géométrie | `featureToRowUpdate` `lib/grist-sync.js:273-330` | **2D forcé** (`flattenCoords2D` `lib/grist-rows.js:50`) ; points écrits en `longitude`/`latitude` (voir §6.3, défaut) |
| Lecture : `geometry_json` / `geometry` / `geom` / `wkt` ou lat/lng | `lib/geo-tables.js:17-33` ; `parseGeometryValue` ne lit **pas** le WKT (`lib/geo-tables.js:36-54`) | une table en WKT est détectée mais illisible : l'éditeur ne doit pas prétendre l'écrire |
| Droits : `viewMode`, `peutSaisir`, sonde d'écriture | `CLAUDE.md` « Droits » ; `assertCanWrite` `app_v7.js:7493` | l'édition de géométrie est un geste d'**auteur** au MVP |
| Couche distante / copie sans table | `layer._distant` `app_v7.js:6736` ; `coucheAvecLignes` `lib/grist-sync.js:144` | non éditables ; la sortie « Enregistrer en table Grist » existe déjà |
| Trajet : ligne copiée, source `atlas-trajet` | `onTrajetPick` `app_v7.js:3504`, `assurerCoucheTrajet` `app_v7.js:3325`, `lib/trajet.js` | à alimenter par l'outil Ligne |
| Géolocalisation | `GeolocateControl` `app_v7.js:2124`, `_dernierePosition` `app_v7.js:2136` ; indisponible dans l'iframe Grist (`CLAUDE.md` « Relevé ») | GPS = application et navigateur, pas widget |
| Feuilles mobiles, une à la fois | `CLAUDE.md` « Les feuilles sur téléphone » ; `poserFiche` `app_v7.js:7756` | le panneau d'édition sur téléphone *est* la feuille de fiche |
| Pile des couches | `applyLayerOrder`, `releverLigneTrajet` `app_v7.js:3318` | les couches de dessin doivent être relevées au sommet après chaque remise en ordre |
| Modèles 3D : couche `custom` three.js | `app_v7.js:1247`, `Models3D.updateEdited` `app_v7.js:10195` | un point déplacé doit faire suivre son modèle |
| Aucune annulation dans Atlas | grep `undo` : aucun résultat pertinent | la pile d'annulation est à créer, bornée à la session |

---

## 2. Reprise critique de la proposition précédente

| Proposition | Verdict | Raison |
|---|---|---|
| Onglet « Géométrie » dans l'inspecteur | **Remplacé** par une session d'édition qui prend tout le panneau | un onglet se quitte sans quitter le mode carte ; les onglets actuels sont des formulaires (`lib/model-layer.js:70`) ; la fiche doit rester visible *pendant* qu'on dessine pour la valider ensemble |
| Barre d'outils carte pour dessiner | **Gardée**, mais **à la place** de `#selection-bar`, pas en plus | le bas de carte est déjà disputé (`CLAUDE.md` « L'habillage de la carte ») ; sur téléphone elle remplace la barre du bas `#mobile-nav` |
| MVP Point / Ligne / Polygone simples | **Gardé** | c'est 95 % des saisies de terrain et de maquette |
| Pas de Multi* au MVP | **Gardé, avec garde-fou** | un objet Multi* existant doit s'ouvrir en *consultation de géométrie* (attributs éditables), jamais être réécrit en simple |
| Pas de Z | **Gardé, avec garde-fou** | l'écriture est déjà 2D (`flattenCoords2D`) ; éditer un objet qui a des Z les perdrait en silence → avertir avant la première modification |
| Pas de hors-ligne | **Gardé** | la file d'attente hors réseau est un chantier de l'application, pas de l'éditeur ; mais l'éditeur ne doit rien *perdre* sur un échec d'écriture (la forme reste en mémoire, §6.4) |
| Pas de manifeste | **Gardé** | l'édition vise des couches à `sourceTable` ; le manifeste n'a rien à déclarer. Seule question ouverte : une scène doit-elle pouvoir *interdire* l'édition d'une couche (lot 3) |
| GPS absent de la proposition | **Ajouté** : point à ma position au MVP, ligne en marchant au lot 2 | usage terrain explicite de l'application Android ; la position est déjà suivie |
| Visée au réticule absente | **Ajoutée au MVP** (téléphone) | le doigt masque la cible ; c'est le geste de référence des outils de terrain (QField) |

---

## 3. Parcours utilisateur

Conventions : **[D]** ordinateur, **[T]** téléphone (≤ 720 px, `mobile-layout`).

### 3.1 Créer une couche

**[D]** Rail → Couches. La rangée d'actions (`app_v7.js:4152-4160`) gagne un
quatrième bouton **« Nouvelle »**, visible seulement si Grist est prêt et
qu'on peut écrire (`assertCanWrite`). Il déplie, *dans le panneau du module*, un
petit formulaire — pas de modale :

```
┌─ Couches ─────────────────────────────── ✕ ┐
│ [Tout] [Masquer]                            │
│ ⠿ (o) ■ Bâtiments      1 204 obj.  table  │
│ ⠿ (o) ■ Voirie           380 obj.  table  │
│ ─────────────────────────────────────────── │
│ [OSM] [Fichier] [Table] [+ Nouvelle]        │
│ ┌ Nouvelle couche ───────────────────────┐  │
│ │ Nom        [Arbres remarquables      ] │  │
│ │ Géométrie  ( Point | Ligne | Surface ) │  │
│ │ Table Grist : Atlas_Arbres_remarquables│  │
│ │            [Annuler]  [Créer et dessiner]│ │
│ └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

- Le nom de table est **montré avant création** (même règle que `sanitizeId`,
  `app_v7.js:7242`) : l'utilisateur voit ce qui apparaîtra dans Grist.
- Colonnes créées : `geometry_json` (Text, comme `entableLayer`), `nom` (Text).
  Rien d'autre au MVP : les champs se créent dans Grist ou par le module
  Formulaires. Lot 2 : quelques champs typés à la création.
- « Créer et dessiner » : `AddTable` → couche montée (`finalizeNewLayer`,
  `app_v7.js:7300`, sans `fitToLayer` puisqu'elle est vide) → **session
  d'édition ouverte, outil « Ajouter » armé**. Une couche vide qu'on vient de
  créer n'a pas d'autre raison d'être.

**[T]** Onglet Couches de `#mobile-nav` → même panneau en feuille ; le
formulaire se déplie dans la feuille, qui passe en position pleine (clavier).
« Créer et dessiner » replie la feuille des modules et ouvre la session (§3.3).

### 3.2 Entrer dans la session d'édition d'une couche existante

Trois portes, une seule fonction (`ouvrirEditionCouche(layerId, { outil })`) :

1. **Inspecteur de couche** (clic sur la couche dans le module Couches) : sous
   `boutonEnTable` / `boutonRevueObjets` (`app_v7.js:6064-6065`), un bouton
   **« Éditer la couche »** et un bouton **« + Nouvel objet »**. Sur une couche
   non éditable, le bouton est remplacé par la raison et la sortie (« Copie sans
   table — Enregistrer en table Grist d'abord »), selon la règle déjà écrite dans
   `renderObjectInspector` : *le blocage se lit là où est la sortie*.
2. **Fiche d'un objet** (sélection existante) : dans le pied de fiche, à côté
   d'« Enregistrer », un bouton **« Modifier la forme »** qui ouvre la session
   sur cet objet, outil « Sommets ».
3. **Palette de commandes** (Ctrl+K) : « Éditer la couche … », « Nouvel objet
   dans … ».

Une couche est **éditable** si : `!CONFIG.viewMode`, écriture possible,
`coucheAvecLignes(layer)`, pas `_distant`, pas `_raster`, colonne géométrie
lisible et inscriptible (`geometry_json`/`geometry`, ou `latitude`/`longitude`
pour des points). Une table `wkt` est détectée mais non lue
(`lib/geo-tables.js:36-54`) : non éditable, et le dire.

### 3.3 Écran de session — ordinateur

```
┌ rail ┐┌──────────────────────── carte ─────────────────────────┐┌ Édition · Arbres remarquables ─ ✕ ┐
│ Lieu ││                                          [dock ...]    ││ ■ Point · table Atlas_Arbres_...   │
│Couch.││            ○───●───○                                   ││ 2 objets modifiés, non enregistrés │
│ ...  ││           /         \        (poignées : ● sommet,     ││────────────────────────────────────│
│      ││          ●    ◌      ●        ◌ milieu de segment)     ││ OBJET  Nouvel objet (non créé)     │
│      ││           \         /                                  ││ Surface  1 240 m² · périm. 142 m   │
│      ││            ●───────●                                   ││ 6 sommets · accroché à Voirie      │
│      ││                                                        ││ [Géométrie] [Fiche] [Placement 3D] │
│      ││   ⊕ accroché : sommet de « Voirie »                    ││                                    │
│      ││                                                        ││ (Géométrie : mesures, liste des    │
│      ││ ┌──────────────────────────────────────────────────┐   ││  sommets en lot 2, coordonnées du  │
│      ││ │ + Ajouter | Sommets | Déplacer | Supprimer     │   ││  point, bouton « Ma position »)    │
│      ││ │ ↶ ↷ | Accrochage ▾ | Terminer la forme       │   ││                                    │
│      ││ └──────────────────────────────────────────────────┘   ││────────────────────────────────────│
│      ││ Légende            © OSM                               ││ [Abandonner]  [Enregistrer l'objet]│
└──────┘└────────────────────────────────────────────────────────┘└────────────────────────────────────┘
```

(Les signes ci-dessus sont des repères de maquette ; l'interface
utilisera les icônes au trait d'Atlas, `icTrait(IC.…)`.)

- **En-tête** (réutilise `insp-head`) : pastille de couche, type, table, et un
  **compteur de modifications en attente** — c'est lui qui rend « quitter sans
  enregistrer » compréhensible.
- **Onglets** (réutilise `insp-tabs`) : « Géométrie » *puis* les formulaires de
  la couche (`formulairesDeLaCouche`), puis « Placement 3D » si couche à
  modèles. Ici l'onglet Géométrie est légitime : on est *déjà* dans la session,
  changer d'onglet ne change pas l'état de la carte.
- **Pied** (réutilise `insp-foot`) : « Abandonner » / « Enregistrer l'objet ».
- **Barre d'outils** : à la place de `#selection-bar` (mêmes styles `.sel-btn`),
  centrée en bas, au-dessus de l'étage d'habillage. La légende reste à gauche,
  les infos carte se masquent (`formeBandeauInfos` sait déjà céder).
- Le **rail reste utilisable**, mais ouvrir un autre module pendant qu'il y a
  des modifications en attente passe par la garde « Quitter l'édition ? » (§3.8).

### 3.4 Écran de session — téléphone

```
┌──────────────────────────────┐
│ ‹ Arbres remarquables   2 ●  │  ← bandeau de session (remplace l'en-tête)
│                              │
│            ┼                 │  ← réticule fixe au centre (mode visée)
│        ●───┼───○             │
│            ┆                 │
│   ⊕ accroché : Voirie        │
│                              │
│  (+) ma position               │
├──────────────────────────────┤
│ ═══  (poignée de feuille)    │  ← feuille de fiche, position repliée :
│ Surface · 3 sommets · 420 m² │     mesures + actions principales
│ [↶] [Ajouter ici] [Terminer] │
├──────────────────────────────┤
│ Visée │ Sommets │ Dépl. │ ⋯  │  ← barre d'outils (remplace #mobile-nav)
└──────────────────────────────┘
```

- **Une feuille à la fois** (`CLAUDE.md` « Les feuilles sur téléphone ») : la
  session *est* la feuille de fiche. Repliée, elle montre les mesures et les
  trois gestes principaux ; tirée à mi-hauteur, les onglets Géométrie / Fiche ;
  pleine, la saisie de la fiche (la règle « toucher un champ déploie la fiche »,
  `app_v7.js:10392-10398`, s'applique telle quelle).
- La **barre du bas `#mobile-nav`** est remplacée par la barre d'outils pendant
  la session ; elle revient à la sortie. Pas de troisième barre.
- **Mode visée (par défaut sur téléphone)** : la carte se déplace sous un
  réticule fixe ; « Ajouter ici » pose un sommet au centre. Le toucher direct
  reste possible (lot MVP aussi), mais la visée est le chemin sûr : le doigt ne
  masque rien et la précision est celle du zoom.
- Cibles tactiles ≥ 44 px ; poignées de sommet dessinées à 7-8 px mais avec une
  zone de prise de 22 px (`pointerDistance` de terra-draw, §5).

### 3.5 Créer un objet : dessiner → fiche → enregistrer

1. « + Nouvel objet » (inspecteur de couche, barre d'outils, ou automatiquement
   après création de couche). L'outil correspond au type de la couche — pas de
   choix Point/Ligne/Surface à faire, la couche l'a fixé.
2. **Point** : un clic (ou « Ajouter ici », ou « Ma position ») pose le point.
   La forme est aussitôt « prête ».
   **Ligne** : un clic par sommet ; **Entrée**, double-clic, clic sur le dernier
   sommet ou « Terminer » achève ; minimum 2 sommets distincts.
   **Surface** : un clic par sommet ; clic sur le **premier** sommet, Entrée ou
   « Terminer » ferme ; minimum 3 sommets ; l'anneau est fermé à l'écriture
   (sommet final = premier), jamais par l'utilisateur.
3. La forme achevée : le panneau bascule sur l'onglet **Fiche** (premier
   formulaire de la couche, ou `renderAttrFields` en repli). La géométrie reste
   modifiable (outil Sommets actif sur l'objet) pendant la saisie.
4. **« Enregistrer l'objet »** écrit **une seule** action Grist :
   `AddRecord(table, null, { geometry_json, ...champs })`. Une ligne vide
   n'est jamais créée pour être complétée ensuite.
   > Point à trancher en implémentation : le moteur `grist_forms` sait écrire
   > son propre `AddRecord` (`lib/fiche-formulaire.js:887`) pour un formulaire
   > *lié*. Pour le formulaire *de la couche*, il faut qu'il **rende ses
   > valeurs** à Atlas au lieu d'écrire, afin qu'Atlas les fusionne avec la
   > géométrie. Si ce n'est pas possible sans toucher au moteur, repli :
   > `AddRecord` géométrie + champs déjà saisis, puis mise à jour par le moteur
   > — deux actions, et « Abandonner » après la première doit supprimer la
   > ligne. **[non vérifié]** : l'API du moteur n'a pas été relue pour cette
   > étude.
5. Retour : l'objet rejoint la couche (`_row_id` renvoyé par Grist), toast
   « Objet créé dans Atlas_… », la session reste ouverte **avec l'outil Ajouter
   réarmé** (on saisit rarement un seul arbre). Échap pour sortir.

### 3.6 Modifier la géométrie d'un objet existant

1. Dans la session, outil **Sommets** : un clic sur un objet de la couche le
   charge dans le moteur de dessin (un seul objet à la fois, §5.4) ; l'objet
   d'origine est masqué dans la couche Atlas par un filtre sur `_idx`, pour ne
   pas le voir en double.
2. Gestes : glisser un sommet ; glisser un **milieu de segment** pour insérer ;
   clic sur un sommet puis Suppr (ou bouton « Supprimer le sommet » dans le
   petit menu contextuel au doigt) ; outil **Déplacer** pour translater l'objet
   entier.
3. Le compteur de l'en-tête passe à « 1 objet modifié ». Cliquer un autre objet
   de la couche **ne perd rien** : la modification reste en attente, l'objet
   reste marqué (contour pointillé). « Enregistrer » écrit tous les objets
   modifiés en **une** `applyUserActions` (`BulkUpdateRecord`), comme le récit
   (`CLAUDE.md` « Le récit s'écrit en une seule transaction »).
   > Alternative plus simple pour le MVP : un objet modifié à la fois, et
   > changer d'objet impose Enregistrer / Abandonner. **Recommandé pour le
   > MVP** ; le multi-objets en attente au lot 2.

### 3.7 Supprimer

- **Un sommet** : Suppr / menu contextuel ; refusé s'il ferait tomber sous le
  minimum (2 pour une ligne, 3 pour une surface) — le dire, ne pas supprimer
  l'objet à la place.
- **Un objet** : outil Supprimer puis clic, ou bouton « Supprimer l'objet » dans
  le pied de l'onglet Géométrie ; **confirmation** qui nomme l'objet
  (`nomObjet`) ; écrit `RemoveRecord` immédiatement. Cette suppression n'entre
  pas dans la pile d'annulation d'Atlas : recréer la ligne changerait son `id`
  et casserait les références. Le message de confirmation dit que l'annulation
  se fait depuis Grist **[non vérifié : l'annulation Grist d'une action émise
  par un widget n'a pas été testée]**.
- **Une couche** : inchangé (`deleteLayer` `app_v7.js:9575` retire la couche de
  la scène, pas la table).

### 3.8 Annuler, rétablir, quitter sans enregistrer

- **Pendant le tracé** : Ctrl+Z retire le dernier sommet posé ; Ctrl+Y /
  Ctrl+Maj+Z le remet ; bouton ↶ ↷ dans la barre. (Annulation *de dessin* de
  terra-draw.)
- **Pendant la session** : Ctrl+Z annule le dernier geste validé (sommet
  déplacé, objet déplacé, sommet inséré), jusqu'au dernier enregistrement.
  (Annulation *de session* de terra-draw, bornée par Atlas au dernier
  enregistrement.)
- **Après « Enregistrer »** : la pile est vidée. Atlas ne prétend pas annuler
  une écriture Grist.
- **Quitter** (✕ du panneau, Échap au niveau le plus haut, autre module du rail,
  lecture du récit, bascule en lecture) : s'il y a des modifications en attente,
  garde **« Abandonner les modifications de 1 objet ? — Continuer l'édition /
  Abandonner »**. Pas de troisième choix « Enregistrer et quitter » au MVP :
  un enregistrement peut échouer, et un dialogue qui se ferme sur un échec est
  pire (règle `CLAUDE.md` « Un échec d'écriture doit se voir »).
- **Fermeture de la page** avec modifications en attente : `beforeunload`
  **[non vérifié dans l'iframe Grist et dans la WebView Capacitor]**.

---

## 4. Gestes et outils, par lot

| Geste / outil | Souris / clavier | Doigt | Lot |
|---|---|---|---|
| Poser un point | clic | toucher, ou visée + « Ajouter ici » | MVP |
| Point à ma position | bouton « Ma position » | idem | MVP (application / navigateur ; masqué dans le widget, `localisationDisponible`) |
| Tracer ligne / surface | clic par sommet | toucher ou visée | MVP |
| Terminer | Entrée, double-clic, clic sur le dernier sommet | « Terminer » | MVP |
| Fermer une surface | clic sur le premier sommet, Entrée | toucher le premier sommet, « Terminer » | MVP |
| Annuler le dernier sommet en tracé | Ctrl+Z, Retour arrière | ↶ | MVP |
| Déplacer un sommet | glisser | glisser (prise 22 px) | MVP |
| Insérer au milieu d'un segment | glisser la poignée de milieu | idem | MVP |
| Supprimer un sommet | clic + Suppr | toucher + menu « Supprimer » | MVP |
| Déplacer l'objet entier | outil Déplacer + glisser | idem | MVP |
| Annuler / rétablir en session | Ctrl+Z, Ctrl+Y / Ctrl+Maj+Z | ↶ ↷ | MVP |
| Accrochage aux sommets des autres couches visibles | automatique, tolérance 10 px | 18 px (même seuil que `onTrajetPick`, `app_v7.js:3514`) | MVP |
| Accrochage aux segments | automatique | idem | MVP |
| Suspendre l'accrochage | Alt maintenu | bascule ⊕ | MVP |
| Mesures en direct (longueur, surface, périmètre, segment courant) | panneau + étiquette au curseur | panneau (feuille repliée) | MVP |
| Refus d'une surface qui se recoupe | message au moment de terminer | idem | MVP (validation terra-draw) |
| Échap en cascade | Échap | bouton ‹ du bandeau | MVP |
| Accrochage à l'objet en cours (fermer une boucle, sommets propres) | auto | auto | MVP |
| Saisie de coordonnées au clavier (point, sommet) | onglet Géométrie | idem | Lot 2 |
| Ligne en marchant (GPS) | — | Démarrer / Pause / Terminer, filtrage par précision et distance | Lot 2 |
| Ajouter un sommet à ma position (ligne, surface) | — | bouton | Lot 2 |
| Plusieurs objets modifiés en attente | — | — | Lot 2 |
| Liste des sommets (édition numérique) | onglet Géométrie | idem | Lot 2 |
| Accrochage angulaire (90°, 45°) | Maj maintenu | bascule | Lot 2 (`snapping.toDegree` existe) |
| Création d'objet hors édition (lecteur de terrain avec formulaire publié) | — | pastille Relevé → « Nouvel objet ici » | Lot 2, décision d'auteur par couche |
| Multi* : ajouter / retirer une partie | — | — | Plus tard |
| Trous de surface | — | — | Plus tard |
| Découper, fusionner, décaler (buffer), simplifier | — | — | Plus tard |
| Z (altitude par sommet, drapage sur relief à l'écriture) | — | — | Plus tard |
| File d'attente hors réseau | — | — | Plus tard (application) |
| Accrochage à une couche distante (tuiles vectorielles) | — | — | Plus tard (entités non détenues) |

**Mesures** : géodésiques, en mètres (distances sur la sphère ; `distanceMetres`
de `lib/releve.js` pour les longueurs, formule sphérique pour les aires), avec
la même mise en forme que le reste d'Atlas (« 1 240 m² », « 1,2 ha »,
« 142 m », « 3,4 km »). Arrondi affiché cohérent avec la précision réelle : pas
de centimètres pour un point posé au doigt ou au GPS.

**GPS** : afficher la précision annoncée (`coords.accuracy`) à côté du bouton ;
refuser (ou avertir) au-delà d'un seuil réglable (par défaut 20 m) plutôt que
de poser un point faux sans le dire.

---

## 5. Brique de dessin

### 5.1 Comparatif

Versions relevées sur le registre npm le 24/09/2026 ; tailles mesurées sur les
fichiers servis par cdn.jsdelivr.net (gzip -9).

| Critère | terra-draw 1.35.0 + adaptateur MapLibre 1.4.1 | @mapbox/mapbox-gl-draw 1.5.2 | @geoman-io/maplibre-geoman-free 0.10.0 | Éditeur maison |
|---|---|---|---|---|
| Licence | MIT / MIT | ISC | MIT (édition « free » ; une édition Pro payante existe) | — |
| Compatibilité MapLibre 5.6.1 | adaptateur : `peerDependencies maplibre-gl >= 4` — **oui** | pas de dépendance déclarée ; fonctionne avec MapLibre moyennant l'ajustement des classes CSS de contrôle **[non vérifié sur 5.x]** | **non** : 0.4.9 exige ≥ 5.7.1, 0.6 ≥ 5.14, 0.9+ ≥ 6.0 < 7 | oui |
| Taille | 267 Ko + 9 Ko ; **≈ 49 + 3 Ko gzip** | 63 Ko ; ≈ 17 Ko gzip (+ CSS 4 Ko) | 3,8 Mo décompressé (paquet), nombreuses dépendances turf | ce qu'on écrit |
| Maintenance | très active : 1.35.0 publiée le 20/09/2026 ; adaptateur 17/05/2026 ; projet OSGeo | active côté Mapbox (1.5.2 le 14/09/2026) ; cible Mapbox GL, pas MapLibre | très active (0.10.0 le 23/09/2026), mais suit la dernière MapLibre | à notre charge |
| Tactile | Pointer Events via l'adaptateur ; `pointerDistance` réglable ; option pour ignorer les pointeurs incohérents (1.18.1) | historique « touch » séparé, réputé fragile **[non vérifié]** | annoncé | à écrire (Atlas maîtrise déjà Pointer Events + capture) |
| Accrochage | `snapping` : `toCoordinate`, `toLine`, `toFeature`, `toCustom`, `toDegree` (présents dans le paquet 1.35.0) | **aucun** (greffons tiers) | oui | à écrire |
| Annuler / rétablir | oui : annulation de dessin et `TerraDrawSessionUndoRedo` (ajoutée en 1.26.0 selon le changelog ; présente dans le paquet 1.35.0) | **non** | oui **[non vérifié]** | à écrire |
| Milieux de segment, suppression de sommet, déplacement d'objet | oui (mode Select : `midpoints`, `deletable`, `draggable`) | oui (`direct_select`) | oui | à écrire |
| Validation (auto-intersection, taille) | oui (`validation`, validateurs fournis) | non | oui | à écrire |
| API programmatique (visée, GPS) | `addFeatures`, `updateFeatureGeometry`, `removeFeatures`, `selectFeature`, évènements `change` / `finish` | `add`, `set`, `delete` | oui | libre |
| Chargement CDN | UMD : globales `terraDraw` et `terraDrawMaplibreGlAdapter` sur jsdelivr | UMD `MapboxDraw` | ESM + dépendances | aucun |
| Vendoring APK | 2 fichiers à ajouter à `VENDOR` (`packages/atlas-app/scripts/vendoriser.mjs:24-29`) | 2 fichiers | bundle à construire | aucun |
| Rendu 3D / relief | couches GeoJSON MapLibre ordinaires (drapées) ; coordonnées par `map.unproject` qui tient compte du relief **[non vérifié sur le relief LiDAR d'Atlas]** ; `renderBelowLayerId` et `prefixId` réglables | idem | idem | idem |
| Interface imposée | aucune (moteur seul) ; l'interface prête à l'emploi est un paquet séparé (`@watergis/maplibre-gl-terradraw` 1.16.0) qu'on **n'utilise pas** | contrôle Mapbox à masquer | contrôle Geoman à masquer | aucune |

### 5.2 Recommandation

**terra-draw 1.35.0 + terra-draw-maplibre-gl-adapter 1.4.1, versions
épinglées**, comme moteur sous une interface Atlas.

- **Pourquoi pas maison** : les poignées, les milieux, la fermeture, la
  validation d'auto-intersection, l'annulation et les cas limites du tactile
  sont précisément ce qui rend un éditeur « fiable et juste » ; c'est plusieurs
  semaines, puis une maintenance, pour ≈ 52 Ko gzip. Atlas garde la main sur ce
  qui lui est propre : interface, accrochage aux couches Atlas (`toCustom`),
  visée, GPS, écriture Grist.
- **Pourquoi pas Geoman** : incompatible avec MapLibre 5.6.1 à toutes les
  versions qui déclarent une compatibilité ; l'adopter imposerait de monter
  MapLibre (6.11.2 est la dernière) — un chantier à part entière, avec relief,
  globe et three.js à revalider.
- **Pourquoi pas mapbox-gl-draw** : ni accrochage ni annulation, deux points du
  cahier des charges ; il faudrait les écrire, et on se retrouve à maintenir un
  éditeur maison adossé à une bibliothèque pensée pour un autre moteur.
- **Risque terra-draw** : cadence de publication élevée (1.26 → 1.35 en six
  mois) → épingler, lire le changelog à chaque montée. Le changelog résumé pour
  cette étude contient une date incohérente (1.8.0 datée de 2026) : **les
  numéros de version où chaque fonction est apparue sont à revérifier** ; leur
  *présence* dans 1.35.0 a été vérifiée dans le fichier UMD.
- **Si MapLibre monte en 6.x plus tard** : l'adaptateur déclare `>= 4`, pas de
  blocage annoncé.

### 5.3 Chargement

- **À la demande**, à l'ouverture de la première session d'édition : un lecteur
  ne paie rien.
- Les deux URL sont **déclarées dans `index_v7.html`** (par exemple une variable
  globale de configuration, comme `window.__ATLAS_MODELES__`), et non écrites
  dans `app_v7.js` : `vendoriser.mjs` ne réécrit que le HTML
  (`vendoriser.mjs:134-141`). Ajouter les deux fichiers à `VENDOR` et deux
  `replace` au HTML ; sinon l'application irait chercher le CDN hors réseau.
- Source : `cdn.jsdelivr.net/npm/terra-draw@1.35.0/dist/terra-draw.umd.js` et
  `cdn.jsdelivr.net/npm/terra-draw-maplibre-gl-adapter@1.4.1/dist/terra-draw-maplibre-gl-adapter.umd.js`
  (UMD, l'adaptateur attend la globale `terraDraw` : charger dans cet ordre).

### 5.4 Intégration — principes

1. **Un seul objet dans le moteur à la fois.** La couche entière reste rendue
   par Atlas ; l'objet édité est ajouté au store terra-draw
   (`addFeatures`) et masqué dans la couche Atlas par un filtre `_idx`. Charger
   1 200 bâtiments dans le store dupliquerait le rendu et ralentirait tout.
2. **Accrochage par `toCustom`** : Atlas cherche, dans les couches visibles et
   détenues (`layer.geojson`, pas les couches `_distant`), le sommet puis le
   segment le plus proche dans la tolérance en pixels, sur l'emprise écran
   courante. Index spatial simple (grille) reconstruit au `moveend` si les
   couches sont grosses. L'objet accroché s'annonce (« accroché : sommet de
   Voirie »).
3. **Préfixe de couches** (`prefixId: 'atlas-dessin'`) et **relevé au sommet**
   après chaque `applyLayerOrder` et chaque `applyLayerStyle`, sur le modèle de
   `releverLigneTrajet` (`app_v7.js:3318`) — sinon une couche restylée repasse
   devant les poignées. Au-dessus de la couche `custom` three.js, pour que les
   poignées ne soient pas masquées par un modèle.
4. **Couleurs** : accent Atlas `#C44536` (celui du halo, `app_v7.js:7061-7070`)
   pour la forme en cours ; poignées blanches cerclées ; variables de thème
   pour le sombre.
5. **Écriture** : une fonction pure `ligneDepuisDessin(feature, layer)` à côté
   de `featureToRowUpdate`, testée en `node --test`, qui décide de la colonne
   (`geometry_json` ou `latitude`/`longitude`), ferme les anneaux, arrondit à
   7 décimales (≈ 1 cm) et refuse ce qui est invalide.

---

## 6. Conflits avec l'existant et résolutions

| # | Conflit | Où | Résolution |
|---|---|---|---|
| 1 | Le clic carte sélectionne un objet | `app_v7.js:6696-6749` | première garde du gestionnaire : `if (sessionEdition) return;` — la session possède les clics (terra-draw écoute via l'adaptateur) ; le choix d'un autre objet à éditer passe par une fonction de la session, pas par `enterSelectionMode` |
| 2 | Survol : curseur « pointer / crosshair » | `app_v7.js:6688-6694` | même garde ; terra-draw pose ses curseurs |
| 3 | Sélection rectangulaire (Maj + glisser, appui long) | `app_v7.js:6776` | ne s'arme que si `STATE.selection.mode` : la session **sort** du mode sélection à l'entrée (`exitSelectionMode`, sans son `saveLayerToGrist` inutile) ; garde explicite en plus. L'appui long reste libre pour le menu contextuel de sommet |
| 4 | `locationPickMode` (Lieu → Pointer sur la carte) | `app_v7.js:4085`, `9076` | exclusif : l'entrée en session l'annule ; `pickOnMap` refusé pendant une session (toast) |
| 5 | `trajetPickMode` (Récit → choisir une ligne) | `app_v7.js:3519-3535` | exclusif, même traitement ; `annulerChoixTrajet` à l'entrée |
| 6 | Échap | `app_v7.js:10419-10425` | la session prend la tête de la cascade : tracé en cours → sommet choisi → outil → session (avec garde) → comportement actuel |
| 7 | Suppr, Retour arrière, Entrée, Ctrl+Z tapés **dans un champ de la fiche** | fiche dans `#inspector` | aucun raccourci d'édition si `e.target` est un champ de saisie ou `contenteditable` ; Entrée dans un champ reste à la fiche |
| 8 | Ctrl+K (palette) | `app_v7.js:10412` | inchangé ; la palette gagne « Éditer la couche », « Nouvel objet » |
| 9 | Récit en présentation | `_storyPresenting` `app_v7.js:299` | pas de session pendant la lecture ; lancer le récit passe par la garde de sortie |
| 10 | Trajet affiché en édition de récit (poignées d'étapes draggables) | `rafraichirTrajet` `app_v7.js:3355-3400` | poignées d'étapes retirées pendant une session (elles captent le glisser) |
| 11 | Pastille Relevé et formulaires hors édition | `CLAUDE.md` « La pastille Relevé » ; `coucheEnSaisie` `app_v7.js:6519` | MVP : l'édition de géométrie est un geste d'auteur, absente en lecture. Lot 2 : « Nouvel objet ici » dans le panneau Relevé, pour une couche que l'auteur a ouverte à la création (réglage de scène, comme `formulaire.retires`) |
| 12 | Mode lecture (`viewMode`) et droits | `openModule` `app_v7.js:3999-4013` ; sonde d'écriture | boutons absents en lecture ; bascule vers la lecture pendant une session → garde de sortie ; un refus ACL à l'écriture est **nommé** et la forme **reste en mémoire** (on peut réessayer ou copier) |
| 13 | Relief 3D | `map.setTerrain` `app_v7.js:2319` | les couches de dessin sont drapées ; les coordonnées viennent de `map.unproject`, qui vise le relief **[non vérifié avec le LiDAR HD]**. Stockage 2D. À tester : cercles des poignées sur relief exagéré |
| 14 | Carte inclinée (pitch) | — | au-delà d'environ 60°, précision médiocre près de l'horizon : bandeau « Vue inclinée — Vue de dessus ? » avec un bouton qui remet le pitch à 0 sans changer le cap. Pas de blocage |
| 15 | Bâti extrudé (`polygonMode` volume) | `CLAUDE.md` « Récit » ; `addLayerToMap` `app_v7.js:2481-2485` | l'objet édité est masqué dans la couche (principe 5.4-1) et dessiné à plat ; les voisins extrudés peuvent masquer des poignées **[non vérifié]** → proposer « Passer la couche à plat pendant l'édition » |
| 16 | Modèles 3D three.js | `app_v7.js:1247`, `Models3D.updateEdited` `app_v7.js:10195` | un point déplacé : modèle reconstruit au lâcher (MVP), suivi en direct plus tard ; l'onglet « Placement 3D » reste dans la session |
| 17 | Halo de sélection | `HALO_SELECTION` `app_v7.js:7061` | effacé à l'entrée (`clearHighlight`) |
| 18 | Repli en points à petite échelle | `lib/point-fallback.js` ; `CLAUDE.md` « Repli en points » | sous `_pointFallbackZoom`, on n'édite pas une surface qu'on ne voit pas : message « Zoomez pour modifier » et zoom proposé |
| 19 | Remise en ordre des couches | `applyLayerOrder`, `remettreEnPlace` `app_v7.js:2556` | relever les couches `atlas-dessin` après (principe 5.4-3) |
| 20 | Rafraîchissement de la couche depuis Grist pendant l'édition | `refreshLayer` (bouton ⟳), mises à jour de table **[non vérifié : comportement exact à l'arrivée d'une modification externe]** | différer le rafraîchissement de la couche éditée jusqu'à la fin de session, ou le signaler (« la table a changé ») |
| 21 | Objets Multi* existants | lecture générale | géométrie en consultation, attributs modifiables ; message « Objet en plusieurs parties — modifiable dans QGIS » |
| 22 | Objets avec Z | `flattenCoords2D` `lib/grist-rows.js:50` | avertir avant la première modification : « L'altitude des sommets sera perdue » |
| 23 | Barre du bas partagée (légende, attribution, bulle) | `lib/habillage-carte.js` | la barre d'outils prend la place de `#selection-bar`, pas un étage de plus ; l'attribution reste lisible |
| 24 | Feuilles mobiles | `ficheCedee`, `poserFiche` `app_v7.js:7756` | la session est la feuille de fiche ; choisir un module dans la barre du bas est impossible pendant la session (barre remplacée) — sortie par ‹ |
| 25 | Double-clic = zoom | MapLibre | l'adaptateur neutralise `doubleClickZoom`, `dragPan`, `dragRotate` quand il le faut (références présentes dans l'adaptateur) ; les rétablir exactement à la sortie |
| 26 | Clavier dans l'iframe Grist | — | les raccourcis ne marchent que si l'iframe a le focus ; les boutons de la barre restent le chemin principal |

### 6.3 Défaut relevé en passant : un point stocké en `geometry_json`

`featureToRowUpdate` (`lib/grist-sync.js:305-307`) écrit un point en
`longitude` / `latitude` **seulement**. Une couche de points créée par
`entableLayer` (ou par la future « Nouvelle couche ») a une colonne
`geometry_json` et pas ces colonnes : quand `_gristColumns` est connu, **aucune
géométrie n'est écrite**. Aujourd'hui c'est sans effet visible (on ne déplace
pas de point), mais l'éditeur le rendrait bloquant. De même, un `MultiPoint`
passe par la branche « Point » et écrirait `coordinates[0]` — un tableau — en
longitude **[lu dans le code, non éprouvé]**. À corriger avant tout déplacement
de point : écrire dans la colonne que la couche *lit*
(`layer.geometryColumn`).

### 6.4 Échecs d'écriture

Toute écriture (création, modification, suppression) garde la forme en mémoire
tant que Grist n'a pas répondu oui ; un échec se dit par un toast qui nomme la
cause (ACL, réseau) et laisse « Réessayer ». Règle déjà posée pour le récit
(`CLAUDE.md` « Persistance »).

---

## 7. Tracer un trajet de récit

Aujourd'hui : `choisirTrajet` arme `trajetPickMode`, `onTrajetPick` copie la
ligne visible la plus proche à 18 px (`app_v7.js:3504-3525`), `poserTrajetDepuis`
fabrique `STATE.trajet` et replace les étapes (`app_v7.js:3437-3500`).

Demain, dans le module Récit, deux boutons : **« Copier une ligne »** (inchangé)
et **« Tracer le trajet »**, qui ouvre l'outil Ligne dans une *session sans
table* :

| Besoin | Ce que l'outil Ligne doit offrir |
|---|---|
| Destination | la forme terminée va à `poserTrajetDepuis({ copie, layer: null, feature: null })` au lieu d'un `AddRecord` ; `sourceTable`/`sourceRowId` nuls, `nom` saisi ou vide |
| Suivre une voie existante | accrochage aux sommets **et aux segments** des couches linéaires visibles ; lot 2 : « suivre la ligne » (entre deux points accrochés sur la même ligne, reprendre ses sommets intermédiaires) — c'est ce qui rend le tracé utile en ville |
| Sens | le sens est celui du tracé ; flèche de fin déjà dessinée par `rafraichirTrajet` ; bouton « Inverser le sens » (lot 2 ; les abscisses deviennent `1 - a`) |
| Modifier un trajet existant | charger `STATE.trajet` dans le moteur, outil Sommets ; à la fin, même chemin que « Remplacer » (`_trajetRemplace`, proportions gardées) |
| Longueur | mesure en direct ; `longueurMetres` (`lib/trajet.js:74`) reste la référence pour la lecture |
| Tracer en marchant | la ligne GPS (lot 2) sert aussi au trajet : une promenade de repérage devient le parcours du récit |
| Contraintes | au moins deux points distincts (`copieLineaire` le refuse déjà) ; pas de Multi ; 2D |
| Poignées d'étapes | masquées pendant le tracé (conflit 10), réaffichées après |

Le trajet reste ce qu'il est aujourd'hui : **ni une table ni une couche**
(`CLAUDE.md` « Récit »). L'outil de dessin est partagé ; la destination change.

---

## 8. Découpage proposé

**MVP**
- « Nouvelle couche » (Point / Ligne / Surface, `geometry_json` + `nom`).
- Session d'édition : panneau droit, barre d'outils, garde de sortie.
- Ajouter, Sommets (déplacer, insérer, supprimer), Déplacer l'objet, Supprimer
  l'objet ; un objet modifié à la fois.
- Accrochage sommets + segments (couches visibles détenues), Alt pour suspendre.
- Mesures en direct ; validation d'auto-intersection.
- Annuler / rétablir (tracé et session).
- Téléphone : visée au réticule, point à ma position (hors widget).
- Correctif `featureToRowUpdate` pour les points en `geometry_json`.
- Garde-fous Multi* et Z.
- Chargement à la demande, vendoring APK.

**Lot 2** : tracer le trajet de récit (et « suivre la ligne ») ; ligne en
marchant ; plusieurs objets en attente ; coordonnées au clavier ; liste des
sommets ; accrochage angulaire ; « Nouvel objet ici » depuis la pastille Relevé
pour les couches ouvertes à la création.

**Plus tard** : Multi*, trous, découpe / fusion / décalage, Z, hors-ligne,
accrochage aux couches distantes, interdiction d'édition déclarée par la scène.

---

## 9. Points non vérifiés, à éprouver avant de s'engager

1. `map.unproject` sur le relief LiDAR HD exagéré : le sommet posé est-il sous
   le curseur ? (Relief et pitch élevés.)
2. Rendu des poignées terra-draw (couches `circle`) au-dessus du bâti extrudé et
   de la couche `custom` three.js.
3. Le moteur `grist_forms` peut-il rendre ses valeurs sans écrire, pour une
   création en une seule `AddRecord` ?
4. Pointer Events de l'adaptateur dans la WebView Capacitor (Android), en
   particulier le glisser de poignée pendant que la carte voudrait se déplacer.
5. `beforeunload` dans l'iframe Grist et dans l'application.
6. Annulation Grist d'une action émise par le widget.
7. Arrivée d'une mise à jour de table pendant une session.
8. Dates d'apparition des fonctions terra-draw dans le changelog (la présence
   dans 1.35.0 est vérifiée, les numéros de version d'origine non).

## Sources

- Registre npm, consulté le 24/09/2026 : `terra-draw` 1.35.0 (20/09/2026),
  `terra-draw-maplibre-gl-adapter` 1.4.1 (17/05/2026, `peerDependencies`
  `maplibre-gl >= 4`), `@mapbox/mapbox-gl-draw` 1.5.2 (14/09/2026),
  `@geoman-io/maplibre-geoman-free` 0.10.0 (23/09/2026, `maplibre-gl >= 6 < 7` ;
  historique des `peerDependencies` relu version par version),
  `@watergis/maplibre-gl-terradraw` 1.16.0, `maplibre-gl` (dernière 6.11.2),
  `maplibre-gl-draw` 1.6.9 (fourche abandonnée, 21/07/2023).
- Fichiers servis par cdn.jsdelivr.net (tailles, globales UMD, présence des
  options `snapping.toCustom` / `toFeature` / `toLine`, `TerraDrawSessionUndoRedo`,
  `updateFeatureGeometry`, `prefixId`, `renderBelowLayerId`).
- Guide des modes terra-draw :
  https://github.com/JamesLMilner/terra-draw/blob/main/guides/4.MODES.md
- Changelog terra-draw :
  https://github.com/JamesLMilner/terra-draw/blob/main/packages/terra-draw/CHANGELOG.md
- Présentation FOSS4G 2026 (annulation de dessin et de session) :
  https://workshops.terradraw.water-gis.com/presentations/foss4g-2026-slides/
