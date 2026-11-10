# qgis2grist : palettes par défaut issues du ThemeDef, et optimisations de l'interface (structure TaskFlow)

> Statut : **mise en oeuvre du 09/11/2026** (option A de Nicolas, lots 1 a 6 commites localement, rien publie ni pousse). Le texte
> ci-dessous est la proposition d'origine ; l'etat des lots et les decisions sont dans la section 4.
> Constats relevés dans le code et dans le Grist de Nicolas (import QField Wastewater, carte Atlas par défaut, thème actif).

## 1. Palettes de couleurs proposées par défaut : le ThemeDef doit les porter

### 1.1 Constat

- Les palettes par défaut de qgis2grist sont **écrites en dur à quatre endroits** : `PALETTE` (aperçu qgis2web), `LAYER_COLORS` (couleur d'une couche sans style, légende, carte), la palette de repli de `lib/scene-manifest.js` et celle passée au manifeste. Ce sont les mêmes six ou sept couleurs bleu, vert, ambre, rouge, violet, quel que soit le thème du document.
- Le ThemeDef 1.0 (spécification de Form Builder, étage B) ne porte **que des graines** (`principal` obligatoire, `secondaire`, `encre`, `fond`) et des surcharges de l'interface. Il ne définit aucune palette de données (lu dans `THEMEDEF-SPEC.md`, §2).
- Atlas, lui, sait déjà ce qu'est une palette de données : sa charte (`atlas-charte/0.1`, section `donnees`) a une palette **qualitative**, des palettes **séquentielles** (avec une par défaut) et une **divergente**, **calculées depuis les graines** quand l'hôte ne les donne pas (`lib/charte/derivation.js`), avec mesures de contraste et d'écart de teinte.

### 1.2 Proposition

Deux niveaux, le premier sans rien changer au ThemeDef.

**Niveau A : dériver les palettes des graines (faisable seul).**
- Les couleurs proposées par défaut (couche sans style QML, catégories sans couleur, rampes de classes) viennent de la **charte résolue** : qualitative pour les catégories, séquentielle pour les valeurs ordonnées, divergente pour les écarts à un seuil.
- Source de la dérivation : celle d'Atlas, chargée comme `theme-document.js` depuis l'Atlas publié, ou une dérivation minimale locale quand il n'est pas joignable (même logique de repli que pour le thème).
- Ordre : thème du document, sinon thème de l'instance Grist, sinon palette actuelle (comportement d'origine, aucune régression).
- Le style QML d'un projet QGIS **prime toujours** : une couche qui porte sa symbologie la garde. La palette du thème ne s'applique qu'aux couches sans style, aux catégories sans couleur et aux propositions de l'interface (choix de la couleur d'une couche).

**Niveau B : une section `palettes` dans le ThemeDef (changement de contrat).**
- Section optionnelle du document : `palettes: { qualitative: [...], sequentielles: { nom: [...] }, sequentielleDefaut, divergente: [...] }`, couleurs `#RRGGBB`, mêmes bornes qu'Atlas (2 à 24 couleurs par liste), dérivée des graines quand elle manque, mesurée dans `resolu`.
- Avantage : le même document donne les mêmes couleurs de données à qgis2grist, Atlas, TaskFlow et Form Builder (cohérence de lecture d'une carte et d'un tableau de bord).
- **Ce n'est pas à qgis2grist de décider** : le schéma `themedef-1.0` est versionné par le kit (appkit) et consommé par Form Builder et Atlas. Il faut une demande à `appkit-architecte` et `formbuilder`, et l'accord de Nicolas. Je ne l'ai pas envoyée.

### 1.3 Règles à tenir

- Jamais la couleur seule : forme ou trait en plus pour les états (déjà vrai dans Atlas).
- Contraste minimal sur le fond de plan (3:1 pour les aplats, mesuré par la charte) et écart de teinte entre catégories ; au plus 5 à 7 catégories distinctes, le reste en « autres ».
- Une seule source dans le code : supprimer les quatre copies en dur au profit d'une fonction `Q2GTheme.palette(type, n)` (le repli d'origine reste la valeur par défaut sans thème).
- Une couleur de couche modifiée par la personne est mémorisée dans la table de préférences existante (`Atlas_LayerPrefs`), pas dans le thème.

## 2. Optimisations de l'interface, sur la structure de TaskFlow

### 2.1 Ce que fait TaskFlow (source : `core/taskflow-ui.css`, `AUDIT_INTERFACES.md`)

- **Jetons** : une échelle de polices (`--fs-2xs` à `--fs-xl`), une échelle d'espacements (`--sp-1` à `--sp-4`), une hauteur et un rayon uniques pour tous les contrôles (`--ctl-h` 34 px, `--ctl-r` 8 px).
- **Une barre du haut sur UNE ligne**, en zones de grille identiques dans tous les widgets : titre, vue, actions, outils ; défilement discret au lieu du retour à la ligne.
- **Contrôles uniformes** (une hauteur, un rayon, une taille de police) et **contrôle segmenté** pour les modes.
- **Un tiroir de saisie** (`tf-tray`) où « Rechercher », « Filtres » et « Affichage » s'ouvrent au même endroit, avec l'état ouvert visible sur le bouton ; **vues enregistrées** (liste, nom, enregistrer, supprimer).
- **Fiche à sections** (en-tête, sections dépliables, navigation « n/m » intégrée) et pastille démo toujours au même coin.

### 2.2 Constats sur qgis2grist (Grist de Nicolas, 08-09/11/2026)

1. **La rangée des couches s'empile et se coupe** : 23 pastilles « vl_… (table) » pour des tables sans géométrie, tronquées en haut de la zone. Elles n'ont aucun usage sur la carte.
2. **Les commandes ne tiennent pas dans une barre** : Recadrer, Filtres, Live Grist, Publier le pack et Nouveau fichier sont des boutons de tailles et de poids différents, sans zones fixes, et la barre passe à la ligne.
3. **Le panneau de filtres laisse une zone grise vide** sous son contenu, et ses champs n'ont pas la hauteur ni le rayon des autres contrôles.
4. **La bulle et la fiche s'ouvrent ensemble** et se recouvrent en partie ; la notification « Carte prête » se pose sur l'attribution de la carte.
5. **Aucun repère de volume** : on ne voit pas combien d'entités sont affichées, filtrées, masquées, ni l'état de la synchronisation autrement que par « Live Grist ».
6. **L'aperçu d'import** liste 26 couches dans un ordre fixe, sans regroupement géométrie / tables, sans recherche, ni « tout cocher ».
7. **Pas de vues enregistrées** : couches visibles, filtres et cadrage se perdent au rechargement.
8. **Polices et rayons sont ceux du widget**, pas de jetons : le thème (ThemeDef) change les couleurs mais pas l'échelle.

### 2.3 Propositions (ordre de valeur décroissante)

| # | Proposition | Inspirée de | Effet |
|---|---|---|---|
| 1 | Jetons d'échelle (`--fs-*`, `--sp-*`, `--ctl-h`, `--ctl-r`) en tête de page, rattachés aux variables `--kit-*` du thème | `taskflow-ui.css` §0 | un seul langage visuel, thème et échelle cohérents |
| 2 | Barre du haut en grille, une ligne : titre et fichier, couches (menu), actions (Recadrer, Publier), outils (Filtres, Rechercher), état de synchronisation en pastille | §2, §3 | fin du retour à la ligne, mêmes repères que TaskFlow |
| 3 | Les couches sans géométrie passent dans un menu « Tables liées (23) » au lieu de 23 pastilles | tiroir | la rangée ne contient que les couches cartographiques |
| 4 | Tiroir unique pour Filtres, Légende et Couches, même emplacement, bouton « ouvert » visible ; suppression de la zone grise | `tf-tray` | un seul panneau à la fois, plus de recouvrement |
| 5 | Fiche d'entité unique à sections (propriétés, relations, dates), navigation « n/m » entre entités sélectionnées ; la bulle ne montre que 3 champs et ouvre la fiche | fiche de tâche | fin du doublon bulle + fiche |
| 6 | Pastille de volume et de synchronisation : « 6 565 entités · 1 704 après filtre · à jour il y a 3 s » | pastille et barre | état lisible d'un coup d'œil |
| 7 | Aperçu d'import : regroupement « Cartographiques / Tables », recherche, « tout cocher », taille estimée et durée annoncée | liste filtrable | choix plus rapide, import mieux compris |
| 8 | Vues enregistrées de la carte (couches visibles, filtres, cadrage, fond), mémorisées dans une table de préférences existante (`Atlas_LayerPrefs`) ou le stockage du widget, jamais dans le thème | `tf-views` | retrouver son travail au rechargement |
| 9 | Notifications (toasts) hors de l'attribution, un seul coin comme la pastille démo de TaskFlow | §7 | plus de recouvrement |
| 10 | Téléphone et accessibilité : contrôles ≥ 34 px (44 px sur écran tactile), focus visible, ordre clavier de la barre, libellés de lecteur d'écran | normes TaskFlow | usage sur le terrain |

### 2.4 Mise en oeuvre

- **Ne pas copier `taskflow-ui.css`** : il est généré par TaskFlow (build). On reprend la **structure** (jetons, zones de grille, tiroir) dans un fichier propre à qgis2grist, avec les mêmes noms de jetons pour qu'un futur socle commun puisse les partager.
- Les propositions 1 à 4 et 9 sont du CSS et de l'assemblage de l'interface existante, **sans toucher à l'import ni au golden**. 5 à 8 touchent la logique de la carte (hôte Atlas) et se testent dans le navigateur.
- Lots proposés : (1) jetons et barre, (2) tiroir et couches, (3) fiche et pastille de volume, (4) aperçu d'import, (5) vues enregistrées, (6) palettes niveau A. Chaque lot : tests Node quand c'est pur, vérification dans le Grist réel, un commit.

## 3. Décisions à prendre

1. **Palettes** : niveau A seul, ou niveau A puis demande de section `palettes` au ThemeDef (niveau B) ?
2. **Priorité des palettes** : la couleur du QML prime-t-elle toujours (ma recommandation) ?
3. **Vues enregistrées** : où les stocker (table de préférences d'Atlas, ou propre à qgis2grist) ?
4. **Socle commun** : jetons propres à qgis2grist maintenant, ou attendre un socle partagé avec TaskFlow ?
5. **Ordre des lots** : je recommande 1, 2, 3 (la correction visible), puis 6 (palettes), puis 4 et 5.

## 4. Etat des lots et decisions prises (09/11/2026)

Decisions de Nicolas : (1) palettes par defaut derivees du ThemeDef, niveau A seulement (contrat inchange) ; (2) le style QML prime
toujours, les tons d'etat restent separes des palettes de donnees ; (3) vues enregistrees dans `Atlas_ScenePrefs` (jamais de table a
part) ; (4) jetons d'interface propres a qgis2grist, noms de TaskFlow (option A).

| Lot | Proposition | Etat | Remarque |
|-----|-------------|------|----------|
| 1 | Jetons et barre du haut en grille (propositions 1, 2, 10) | fait | barre sur une ligne ; cibles de 44 px en tactile |
| 2 | Menu Tables liees et tiroir unique (3, 4) | fait | la legende est dans le tiroir (plus de panneau permanent sur la carte) |
| 3 | Fiche a sections, pastille de volume, notifications (5, 6, 9) | fait | navigation n/m sur l'historique des entites ouvertes (Atlas ne selectionne qu'une entite a la fois) |
| 4 | Apercu d'import (7) | fait | estimations indicatives |
| 5 | Palettes niveau A (section 1) | fait | pas d'interface de choix de couleur dans le widget : rien a brancher de ce cote |
| 6 | Vues enregistrees (8) | fait | **colonne `VuesQ2G`** de `Atlas_ScenePrefs` au lieu d'une cle de `ExpositionJSON` (Atlas efface les cles inconnues) |

Reste : section `palettes` du ThemeDef (niveau B, demande deja envoyee par ailleurs) ; verification des lots 5 et 6 dans un Grist reel
(table `Theme_document` de test, ecriture de `Atlas_ScenePrefs`) ; `lib/terrain-app.js` (palette de 5 couleurs du mode terrain) ;
publication (script de promotion non lance).
