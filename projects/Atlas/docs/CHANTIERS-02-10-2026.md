# Chantiers ordonnés — Atlas, 02/10/2026

Issu de l'audit d'usage de la journée et des réflexions qui ont suivi. L'ordre est celui convenu avec l'utilisateur : on traite
d'abord ce qui améliore l'existant, puis les chantiers nouveaux. Rien de ce qui suit n'est publié ; l'état de chaque ligne est
tenu ici.

## Fait dans la journée (commité, non publié)

- Onglet **Icône** : la liste ne propose que les champs qui peuvent donner une image.
- **Explications au survol** (« i », `infoBulle`) : classes, opacité, regroupement, projection, ombres, trajet, étapes,
  pastilles, catalogue 3D, date du Soleil, introductions de module (Contrôles, Récit, Légende, Import OSM).
- **Exporter** devient une icône qui ouvre un menu : GeoJSON, CSV (géométrie en WKT), KML, GPX, image de la carte, projet Atlas
  (`lib/export-formats.js`).
- **Bouton de posture** : même icône, même titre, même couleur dans la barre et sur la carte ; l'avatar ne dit plus que « qui ».

## À faire, dans l'ordre

| # | Chantier | Ce que c'est | Décision attendue |
|---|----------|--------------|-------------------|
| 1 | **En-tête de l'inspecteur, sur téléphone** — FAIT (commité) | « Saisir · 2 » et « Nouvel objet » côte à côte, la case dessous, l'explication en « i » : l'en-tête passe d'environ 330 px à 163 px à 390 px de large. Reste possible : ouvrir la feuille plus haut par défaut | aucune |
| 2 | **Panneau Couches** — FAIT (commité) | ligne de couche en deux lignes (nom entier, compteur et badge dessous), actions dans un menu « ⋯ » ou sur la couche active ; « Tout » / « Masquer » discrets et centrés ; liste des tables compacte (« + » à droite, type de géométrie) ; titre court ; bloc « Ajouter une couche » aux libellés clairs (« Table » → « Autre table… ») | aucune |
| 3 | **Onglets regroupés** — FAIT (commité) : Couleur | Forme | Étiquette | Bulle | Spécifications ; Forme = Taille, Icône, Modèle 3D en blocs qui se replient | Couleur \| Forme (Taille + Icône + Modèle 3D) \| Texte (Étiquette) \| Bulle \| Spécifications | à confirmer avant de déplacer des panneaux |
| 4 | **Lieu : un lieu ou les données** — FAIT (commité ; non éprouvé en Grist réel) | choix à deux entrées dans le module Lieu — « Sur mes données » (par défaut dès qu'il y a des couches : emprise de toutes les couches ou d'une seule, « utiliser la vue actuelle », ancre du soleil au centre de l'emprise) ou « Un lieu précis » (recherche, position, coordonnées) ; enregistré avec la scène | où l'enregistrer (préférences de scène) |
| 5 | **Scènes disponibles hors ligne** — étage 1 FAIT (commité ; reste l'essai en mode avion sur un téléphone ; tuiles = lot séparé) | geste « Rendre disponible hors ligne » sur la carte de scène (lire toutes les tables, âge et taille affichés, mise à jour, libération) ; photos gardées ; modèles 3D et polices embarqués ; fond uni d'abord, tuiles ensuite | conditions d'usage des tuiles à vérifier |
| 6 | **Import GPX, KML, CSV** — FAIT (commité ; pas de KMZ) | les formats d'échange que l'export sait produire, relus à l'ouverture (« Fichier ») | aucune |
| 7 | **Créer un document Atlas depuis l'application** — FAIT (commité ; essayé contre un faux Grist, pas en réel) | « Nouvelle scène » : nom, espace où l'on peut écrire, point de départ ; document créé par l'API, tables d'Atlas et première couche par les actions déjà écrites ; page avec le widget en option. **Écrit comme un plan d'étapes**, exécuté aussitôt | essai dans un espace de test désigné par l'utilisateur |
| 8 | **Scène locale puis envoi vers Grist** — FAIT (commité ; idem) | la même chose, hors ligne : un « document local » sur l'appareil (même interface que le client, rien de distant derrière), le plan d'étapes gardé et exécuté au retour du réseau, journal d'étapes rejouables, badge « non envoyé », export du projet comme sauvegarde | un projet local est propre à un appareil (par défaut oui) |

Dépendances : 8 s'appuie sur 7 (le plan d'étapes) et sur 5 (fond de carte et tables locales) ; 4 prépare 7 (la scène neuve s'ouvre
sur ses données).

## En attente (décision de l'utilisateur, 02/10/2026)

- **Import QField / QGIS direct, sans passer par qgis2grist.** Aujourd'hui seul qgis2grist lit un paquet QField (JSZip, sql.js,
  QML → style, formulaires → FormDef, tables Grist) ; Atlas n'ouvre que GeoJSON, projet et scène. Faisable par étages :
  (1) lire et afficher, avec les lecteurs extraits de qgis2grist dans un module commun (le lecteur GeoPackage est en ligne
  dans une page de 4 500 lignes), sql.js et JSZip embarqués dans l'APK ; (2) saisir sur l'appareil ; (3) rendre
  (GeoPackage ou Grist). Réserves : gros GeoPackage sur téléphone, expressions de style, fonds raster. Recommandation : étage 1,
  code partagé, présenté comme « visualiser un projet QGIS ou QField ».

## Réflexions de fond (pour mémoire)

**Hors ligne.** Déjà là : tables gardées sur l'appareil à l'ouverture, file d'écritures, photos différées, liste des scènes
mémorisée. Manque : un geste voulu, les photos, les modèles 3D, le fond de carte (le vrai bloquant : sans tuiles la carte est
blanche).

**Scène locale.** Le premier envoi vers un document **neuf** ne pose aucun conflit ; lier une scène locale à un document
**existant** (fusion) est un autre problème, hors périmètre. À soigner : envoi interrompu (journal, identifiant du document noté
dès sa création), identifiants provisoires des lignes (références entre tables), photos rattachées après coup, colonnes à
formule absentes d'une scène locale, perte de l'appareil, identité sans réseau.

## Ce qui reste à éprouver en réel (inchangé)

Bulle avec de vraies photos, « Nouvelle visite », droits par table, `?mode=view`, essai sur un téléphone, hors ligne sur appareil,
nouvelles fonctions sur la copie de travail de l'équipe, création d'un document par l'API sur l'instance utilisée.

## Liste des projets (ajout du 02/10/2026)

Recherche, tri (récentes, nom, organisation), puces de rôle (propriétaire, éditeur, lecteur, hors ligne), miniature choisie par
l'auteur (module Lieu), scènes récentes dans le menu, scènes locales en tête — voir `CLAUDE.md`. À éprouver sur un compte réel.

## Éprouvé en Grist réel le 02/10/2026 (copie de travail ENS13, page Atlas)

Build de dev servi par `localhost:3002` dans le widget (accès complet) ; il faut autoriser l'accès au réseau local dans Chrome pour
grist.numerique.gouv.fr, sinon la requête reste en attente. URL d'origine remise ensuite.

- Enregistrement automatique : changement de palette sur « Boucles » → la ligne `Atlas_LayerPrefs` est mise à jour dans la
  minute, indicateur « Tout est enregistré » et fenêtre d'état (case « Enregistrer automatiquement »).
- Annuler / rétablir d'Atlas : « Annulé · Boucles », palette restaurée, Rétablir activé ; la restauration est réécrite dans les
  préférences. Ne passe pas par l'annulation native de Grist.
- Menu Exporter (GeoJSON, CSV, KML, GPX, image, projet) : s'ouvre, libellés conformes. Contenu des fichiers non vérifié.
- Module Lieu : « Sur mes données », choix des couches cadrées, miniature, ancre du soleil. Écriture du cadrage non vérifiée.
- Dock des contrôles : pastilles à l'habillage commun s'affichent. Largeur téléphone non vérifiée.
