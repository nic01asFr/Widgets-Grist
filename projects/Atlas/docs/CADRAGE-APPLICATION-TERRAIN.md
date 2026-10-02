# Atlas sur le terrain : hors ligne, projets sur téléphone, liaison à Grist, navigation

*02/10/2026. Cadrage d'ensemble, à valider avant tout code. S'appuie sur deux inventaires du
code (navigation et menus ; localisation et capteurs ; état hors ligne), sur
`CARTE-DES-EXPOSITIONS.md` (ce que chaque exposition permet) et sur
`CADRAGE-RELEVES-TERRAIN.md` (relevé, postures, contextes). Les références `fichier:ligne`
sont celles de l'arbre de travail du jour.*

## 0. Ce qu'on vise

Une personne doit pouvoir, avec un téléphone et sans réseau :

1. **ouvrir un projet** déjà préparé, avec ses couches, son récit, ses contextes et ses formulaires ;
2. **relever** (visites, photos, position, nouvel objet) sans rien perdre ;
3. **créer un projet** depuis le téléphone, l'utiliser seul, puis **le lier à Grist** quand elle veut ;
4. **retrouver la connexion** et voir ses relevés partir vers le bon document, sans doublon et sans
   écraser le travail des autres ;
5. s'y retrouver **sans connaître Atlas** : des menus lisibles, un état de synchronisation visible.

Le tout de façon **cohérente avec le reste** : mêmes postures (Préparer, Exploiter, Lecture), mêmes
plafonds (hébergement, droits, lien, publication), mêmes clés d'étape, mêmes formulaires.

## 1. Constat : ce qui existe, ce qui manque

### 1.1 Hors ligne : rien côté données

| | État |
|---|---|
| Service worker, manifeste PWA, IndexedDB, Cache Storage | **aucun** |
| Détection du réseau (`navigator.onLine`, événements) | **aucune** |
| Écritures | directes vers Grist ; **pas de file d'attente**, pas de brouillon. Seules les dernières valeurs d'un formulaire sont gardées (`atlas_saisies`) |
| Application Android | embarque le **code** et les **modèles 3D** (`vendoriser.mjs`) ; pas les données. « Sans réseau, une scène déjà ouverte ne se rechargera pas » |
| Fonds de carte, relief | réseau obligatoire (OpenFreeMap, IGN WMTS, MNT terrarium AWS, MNT LiDAR IGN) ; aucun cache applicatif |
| Polices (Google Fonts), `geotiff.js` (worker) | **non vendorisés** : dégradation esthétique pour les polices, **relief LiDAR cassé** pour `geotiff.js` |
| Clé API Grist | **en clair** dans `localStorage` de la WebView (`atlas_connexion`) |
| Autosave du projet | `localStorage`, toutes les 2 min, **hors Grist seulement** ; sans lien avec le document |

Les cadrages existants décrivent le hors-ligne comme « à décider » (IndexedDB, file d'`UserActions`,
cache par table, tuiles, GLB). Ce document tranche ce qui peut l'être.

### 1.2 Application et capteurs

- `package.json` de l'application : `@capacitor/android` et `core` **seulement**. **Aucun plugin**
  (géolocalisation, caméra, fichiers, réseau, stockage sûr, partage, application). Tout passe par les API
  web de la WebView et par `CapacitorHttp`.
- Permissions déclarées : position, caméra, **micro** (« à venir », aucun code).
- **Géolocalisation** : un contrôle MapLibre masqué en CSS, actionné par une pastille « Me localiser »
  **réservée au mobile** ; « Ma position actuelle » (module Lieu) **modifie le lieu du projet** ; « Le
  plus proche de moi » ; tri « Proches » et bouton « Ma position » dans la liste d'objets ; suivi du trajet
  du récit. Trois entrées différentes, dont une qui déplace le projet.
- **Pas de cap** (aucune orientation d'appareil, pas de flèche de direction), **pas de suivi écran éteint**,
  **pas de bouton de localisation hors téléphone**.
- **Photo** : `<input type="file">` + `capture="environment"` du moteur de formulaire ; téléversement par
  l'API Grist, **réseau obligatoire**.

### 1.3 Navigation et menus (relevés de l'inventaire)

1. **« Ouvrir un projet » sur téléphone n'ouvre pas de projet** : la feuille « Plus » passe par l'import de
   fichier, qui refuse tout JSON non GeoJSON ; le bouton de l'en-tête, lui, accepte les deux.
2. **Pas de recherche sur téléphone en édition** (palette masquée).
3. **Changement de posture par plusieurs chemins asymétriques** : avatar (un rond sans libellé), badge,
   bouton de carte, menu principal (qui ne l'offre qu'en lecture). Dans l'application, on ouvre en
   Exploiter : barre, rail et barre mobile disparaissent ; pour préparer il faut deviner « Atlas ▾ ».
4. **Libellés divergents** : « Vues » / « Vue & rendu » ; « Réglages » / « Catalogue 3D ». Aucun vrai réglage
   d'application (thème, unités, cache, hors ligne).
5. **Même action, plusieurs entrées** (récit : cinq ; soleil, 2D/3D, fonds : module, feuille, palette,
   pastille ; import : bouton, zone de dépôt, palette, « Ouvrir »).
6. **« Enregistrer » est un téléchargement de fichier**, pas une sauvegarde ; le point « modifié » ne se
   rattache à rien. Les écritures vers Grist partent seules, sans signal.
7. **Accès aux scènes et à la connexion** : seulement par le menu principal de l'application, atteint par
   une marque sans libellé de menu.
8. **Export en lecture** : bouton masqué mais palette ouverte ; téléchargement par Blob **non vérifié** dans
   la WebView.

## 2. Le modèle : le projet local

### 2.1 Une seule notion : le projet, lié ou non

Un **projet** est l'unité que la personne ouvre, que ce soit dans Grist ou sur téléphone. Il a deux états :

| | Projet **lié** | Projet **local** |
|---|---|---|
| Source de vérité | un document Grist (instance + identifiant) | l'appareil |
| Écrit où | file d'attente, puis Grist | stockage local |
| Posture offertes | selon les droits Grist (apprise par table) | Préparer et Exploiter, tout est à soi |
| Hors ligne | cache + file d'attente | tout |
| Exposition (carte) | E1/E4 + cache | nouvelle exposition **E10 : application, projet local** |

Un projet local peut **devenir** lié (§ 5) ; un projet lié peut se **mettre en cache** pour le terrain (§ 3).

### 2.2 Le stockage : IndexedDB, pas `localStorage`

`localStorage` plafonne autour de 5 Mo, est synchrone et n'est pas fait pour des couches ni des photos.
Un magasin IndexedDB unique (`atlas-projets`), avec ses objets :

| Magasin | Contenu |
|---|---|
| `projets` | identité (id local, nom, instance, document, état lié ou local), emprise, date du dernier cache, version de schéma |
| `tables` | lignes de chaque table du projet (couches géographiques, tables de relevé, tables de référence) avec leur **base** (`signature` à la dernière lecture), et les métadonnées de colonnes |
| `prefs` | `Atlas_LayerPrefs`, `Atlas_ScenePrefs`, `Atlas_Story` (avec `Cle`), `Formulaires`, formulaires natifs lus |
| `sortie` | **la file d'attente** : les écritures à envoyer (voir § 4) |
| `fichiers` | photos et pièces jointes en attente (blobs), liées à une écriture |
| `tuiles` | optionnel : cache de fonds (voir § 3.3) |

**La clé API** quitte `localStorage` pour un stockage sûr du système (Keystore Android, via un plugin
Capacitor). Dans le widget, rien ne change (le jeton vient de Grist).

### 2.3 Ce qui se met en cache à l'ouverture

À l'ouverture d'un projet lié avec réseau, un **instantané** est écrit : tables des couches, tables de
référence, préférences, récit, formulaires, **avec leurs signatures**. Il n'est pas un double : c'est la
**base** de la comparaison à trois points déjà en place pour le récit (`lib/recit-cles.js`), étendue aux
tables. Les photos de la bulle (miniatures) se mettent en cache à la demande, avec un plafond.

## 3. Hors ligne, par étage

### 3.1 Lire sans réseau

L'ouverture se fait **depuis le cache** quand le réseau manque ou quand il est lent : le projet apparaît
tout de suite, la mise à jour se fait derrière (même idée que la liste de scènes aujourd'hui,
`atlas_scenes`). Un bandeau dit l'âge de l'instantané (« données du 02/10 à 09 h 14 »).

### 3.2 Écrire sans réseau : la file d'attente (le cœur)

Chaque geste d'écriture (nouvelle visite, correction d'un objet, nouvel objet, forme dessinée, photo)
devient une **entrée de la file** : actions Grist (`UserActions`), pièces jointes en attente, identifiant
client. Règles :

- **L'écriture locale est immédiate** : l'objet ou la visite apparaît à l'écran tout de suite (identifiant
  provisoire négatif), marqué « en attente ».
- **L'envoi est idempotent** : une entrée envoyée deux fois ne crée pas deux lignes. Deux moyens, à choisir
  (§ 8) : une colonne `AtlasClientId` facultative sur les tables de relevé (déduplication exacte), ou à
  défaut un journal local et une vérification avant de renvoyer (« cette visite semble déjà partie »).
- **Les références provisoires se résolvent à l'envoi** : une visite posée sur un objet créé hors ligne
  référence son identifiant provisoire ; l'envoi crée l'objet, obtient son identifiant, puis écrit la visite.
- **Les pièces jointes partent d'abord**, leurs identifiants sont posés ensuite dans la ligne.
- **Un envoi est transactionnel par geste** : un lot d'actions par entrée, comme le récit aujourd'hui.
- **Un refus de droits ne se perd pas** : l'entrée reste, étiquetée « refusée », avec la raison (c'est la
  même information que `DROITS` apprend aujourd'hui) ; la personne la corrige ou l'abandonne.

Les **visites sont des ajouts** : pas de conflit possible. C'est le cas d'usage dominant, et celui qu'on
livre en premier.

### 3.3 La carte sans réseau

Le fond est la plus grosse dépendance. Approche proposée :

1. **Cache à la volée** (service worker) de ce qui a déjà été vu : tuiles, glyphes, sprites, MNT. Rend le
   retour sur une zone connue possible sans réseau.
2. **« Télécharger la zone »** : à partir de l'emprise du projet et d'une plage de zooms, précharge le fond
   choisi, le relief et les glyphes, avec une estimation de taille avant de partir. Un fond par zone
   (pas tous), au choix de la personne.
3. **Repli honnête** : sans tuiles, la carte reste utilisable (couches, objets, position) sur fond uni, avec un
   message ; elle ne « plante » pas.

À vérifier avant de s'engager : les **conditions d'usage** des fournisseurs de tuiles (le préchargement
massif n'est pas permis partout) ; l'IGN (WMTS) est le plus clair pour le français. **Vendoriser** d'abord
ce qui casse déjà : les polices et `geotiff.js`.

## 4. La synchronisation au retour du réseau

1. **Détecter** le réseau (plugin `Network` et événements), sans se fier à `navigator.onLine` seul : un test
   léger vers l'instance.
2. **Tirer avant de pousser** : relire les tables touchées, comparer aux **bases**.
3. **Pousser la file dans l'ordre**, entrée par entrée ; chaque réussite sort de la file.
4. **Conflits** (une ligne modifiée à la fois ici et ailleurs) : règles du récit déjà éprouvées en réel —
   on n'écrit que ce que NOUS avons changé, une ligne changée ailleurs et pas ici garde sa version,
   changée des deux côtés la nôtre l'emporte **sauf** si la personne a demandé la revue. Une **file de
   conflits** est lisible (« 2 corrections demandent votre avis »).
5. **Montrer l'état** : un indicateur permanent (voir § 7) et un journal consultable.

## 5. Créer un projet sur téléphone, puis le lier à Grist

### 5.1 Créer

« Nouveau projet » depuis l'accueil de l'application, avec un **modèle** :

| Modèle | Ce qu'il crée en local |
|---|---|
| Relevé de points | une couche de points (nom, type, description, photos, position), un formulaire |
| Tournée | un récit vide + un trajet, une couche de points |
| Vide | rien ; on importe un fichier ou on dessine |

Les objets se créent par **GPS** (« à ma position »), **toucher** sur la carte ou **dessin** (déjà en place :
forme saisie, `lib/geometrie-saisie.js`). Les photos se prennent avec la caméra.

### 5.2 Lier

« Lier à Grist » propose deux voies :

- **Créer un document** : choisir l'instance et l'espace (l'application sait déjà les lister,
  `lib/decouverte.js`), créer le document par l'API, y créer les tables (`Atlas_*`, tables de données,
  formulaires), envoyer les lignes et les photos. Le projet devient **lié**.
- **Rattacher à un document existant** : une étape de correspondance (« votre colonne *Nom* ↔ la colonne
  *Nom_structure* »), contrôlée avant tout envoi. C'est le cas difficile : on le fait en second.

Dans les deux cas, **rien ne part sans un récapitulatif** (« 12 objets, 31 photos, 3 tables ») que la personne
valide.

## 6. Localisation et capteurs, de façon unifiée

Un **service de position unique** (un module, pas trois chemins) :

- **Un bouton « Ma position » partout**, pas seulement sur téléphone, avec ses états (éteint, recherche,
  position fixée, précision en mètres).
- **Il ne déplace jamais le projet** : « centrer sur moi » et « placer le projet ici » sont deux gestes.
- **Cap** : flèche de direction (`showUserHeading`) et orientation de l'appareil ; carte orientable sur le cap.
- **Position comme donnée** : la valeur « position » d'un formulaire se remplit seule (latitude, longitude,
  **précision**, heure) ; une photo garde sa position.
- **« Autour de moi »** et **« le plus proche »** : une seule règle, partagée par la liste, la palette et le
  bouton (comme `decisionOuverture` pour l'ouverture d'un objet).
- **Suivi** : pendant une tournée, y compris écran éteint, par un plugin de géolocalisation avec service de
  premier plan (consommation à mesurer ; arrêt automatique).
- **Plus tard** : « Voir l'équipe » (double volontariat, déjà cadré) ; notes vocales (permission déjà
  déclarée).

Les **plugins Capacitor** à adopter, un à un, chacun justifié : `Geolocation` (permissions et précision),
`Camera` (prise de vue et galerie, redimensionnement), `Filesystem` (photos et exports), `Network` (état),
stockage sûr (clé API), `Share` (exporter), `App` (retour, reprise). Chaque ajout **change l'APK** : un seul
lot de reconstruction, annoncé.

## 7. Navigation : un squelette lisible pour tout le monde

### 7.1 Principes

1. **Trois espaces**, partout : **Projets** (accueil), **Carte**, **Réglages**. Aujourd'hui l'accueil n'existe
   que dans l'application et se trouve par hasard.
2. **Une seule porte par action.** Les doublons restent en raccourcis (palette, pastilles) mais le **chemin
   principal** est unique et nommé pareil partout.
3. **La posture se voit et se dit en clair.** Un **sélecteur visible** (pas un rond sans libellé), avec des
   mots publics : **Modifier** (Préparer), **Relever** (Exploiter), **Consulter** (Lecture). Les noms
   internes restent ceux du code.
4. **L'état de synchronisation est toujours visible** : une pastille « tout est à jour / 3 en attente / hors
   ligne / 1 refusé », qui ouvre le journal. Elle remplace le point « modifié ».
5. **« Enregistrer » ne ment plus** : « Enregistrer dans Grist » (état), « Exporter un fichier » (téléchargement).

### 7.2 Menus, par posture

| Posture | Téléphone | Grand écran |
|---|---|---|
| **Relever** | barre du bas : **Carte · Objets · ＋ Relevé · Moi** ; menu : projet, synchronisation, hors ligne | carte + dock de pastilles ; panneau d'objets à droite |
| **Modifier** | barre du bas actuelle (Couches, Contrôles, Récit, Plus), avec **recherche** | rail actuel |
| **Consulter** | aucune barre ; pastilles du récit et des contextes | idem |

### 7.3 Corrections immédiates (petites, sans attendre le reste)

- « Ouvrir un projet » sur téléphone ouvre vraiment un projet ou un GeoJSON (même chemin que l'en-tête) ;
- recherche accessible sur téléphone en édition ;
- un seul sélecteur de posture, visible dans l'en-tête et dans le menu principal, **dans toutes les postures** ;
- libellés uniques : « Vue » (et non « Vue & rendu »), « Modèles 3D » pour le catalogue, un vrai module
  « Réglages » (affichage, hors ligne, compte) ;
- le menu principal expose « Projets », « Synchronisation », « Instance et clé ».

### 7.4 Thème

Le thème sombre se prépare par les **jetons** : plus aucune couleur écrite en dur (`#fff`, `rgba(255,255,255,…)`).
La barre de sélection est passée aux jetons le 02/10/2026 ; un audit des autres suit.

## 8. Décisions à valider

1. **IndexedDB** comme stockage unique des projets, de la file et des pièces jointes ?
2. **Déduplication** : une colonne facultative `AtlasClientId` sur les tables de relevé (ajoutée par Atlas, avec
   votre accord table par table), ou un journal local sans toucher aux tables de l'équipe ?
3. **Hors ligne de la carte** : cache à la volée seul, ou aussi « Télécharger la zone » ? Quels fonds (IGN d'abord) ?
4. **Plugins natifs** : adopter `Geolocation`, `Camera`, `Network`, stockage sûr, `Filesystem` en un seul lot
   de reconstruction de l'APK ?
5. **Un projet local est-il propre à un appareil**, ou doit-il pouvoir passer d'un appareil à un autre
   (export/import, ou compte) ? Je propose : à l'appareil, puis lié à Grist pour circuler.
6. **Vocabulaire public** : Modifier / Relever / Consulter vous convient-il ?
7. **Ordre** : voir § 9.

## 9. Lots, dans l'ordre de valeur et de dépendance

Chaque lot : **vérifier l'existant et l'usage avant**, **éprouver** dans l'application simulée puis sur la copie
réelle, **documenter**. Hors ligne : on éprouve en coupant le réseau (émulation, puis APK).

| Lot | Contenu | Dépend de | Pourquoi ce rang |
|---|---|---|---|
| **0** | Vendoriser polices et `geotiff.js` ; module « réseau » (état, test léger) ; clé API hors `localStorage` | — | ce qui casse déjà hors ligne ; fondations |
| **1** | **Visites hors ligne** : file d'attente locale (IndexedDB), identifiant client, photos en attente, envoi au retour, indicateur « n en attente » | 0 | le besoin dominant : ne rien perdre dehors |
| **2** | **Ouverture depuis le cache** : instantané du projet, bandeau d'âge, lecture hors ligne | 1 | rouvrir une scène sans réseau |
| **3** | **Navigation** : corrections immédiates (§ 7.3), sélecteur de posture visible, état de synchronisation | 1 (état) | lisibilité ; peut démarrer en parallèle des lots 0–1 |
| **4** | **Carte hors ligne** : cache à la volée, puis « télécharger la zone » | 0 | le terrain réel |
| **5** | **Position unifiée** : service unique, cap, position comme donnée, plugin `Geolocation` | 0 | cohérence et précision |
| **6** | **Projets locaux** : création sur téléphone (modèles), objets par GPS/dessin/photo | 1, 2 | autonomie complète |
| **7** | **Lier à Grist** : créer un document, puis rattacher à un existant ; revue des conflits | 1, 6 | circulation des projets |
| **8** | Suivi écran éteint, notes vocales, « Voir l'équipe », valeur « Moi » | 5, identité | confort et collaboration |

**Ce que je recommande de faire en premier : 0, puis 1 et 3 ensemble.** Le lot 1 rend le terrain utilisable ;
le lot 3 règle ce qui déroute aujourd'hui. Les lots 6 et 7 sont les plus visibles pour le grand public mais
reposent sur 1 et 2.

## 10. Risques

- **Limites de l'API Grist** (débit, taille des pièces jointes) : l'envoi par lots et par ordre doit
  rester poli ; mesurer sur la copie.
- **Conditions d'usage des tuiles** : préchargement interdit chez certains ; prévoir le repli.
- **Batterie** (suivi continu) : mesurer avant de promettre « écran éteint ».
- **Conflits réels** : les ajouts n'en ont pas ; les corrections d'objets en auront. D'où l'ordre.
- **Distribution de l'APK** : chaque reconstruction se pose à la main ; regrouper les changements natifs.
- **Sécurité** : clé API au repos ; une file locale contient des données de terrain, à effacer à la
  déconnexion.
