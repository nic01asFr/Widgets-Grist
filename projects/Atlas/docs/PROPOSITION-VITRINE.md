# Proposition : la vitrine d'Atlas, organisée par usage

*Rédigée le 18/10/2026, à partir de trois évaluations indépendantes (architecture de l'information, audit de contenu, comparaison avec 14 sites et chronométrage de six tâches sur la page actuelle). Proposition : rien n'est décidé ni construit.*

## 1. Ce que la vitrine doit faire

Convaincre trois publics, dans cet ordre de priorité fixé par le propriétaire :

1. **Une organisation qui veut une carte dans son site ou son application**, à ses couleurs, sans monter de serveur de cartes (intégrateur, DSI, designer, décideur).
2. **Un agent ou chargé de mission** qui veut voir les tableaux de son document Grist sur une carte, et la partager.
3. **Un agent de terrain** qui relève sur place, parfois sans réseau.

Aujourd'hui la page les mélange : 20 blocs empilés, 29 écrans sur ordinateur et 48 sur téléphone, un haut de page qui ne parle que de Grist, le code `<atlas-bi>` visible seulement après un clic dans une iframe, quatre idées répétées jusqu'à quatre fois.

## 1 bis. Ce que montre la comparaison avec d'autres produits

- Les accueils comparables tiennent en **350 à 2 000 mots** (MapLibre 450, deck.gl 350, Leaflet 950, Metabase 1 500 à 2 000) ; la vitrine en a 7 766.
- **Séparer « utiliser » et « intégrer » dès le haut** : Metabase le fait jusque dans son menu, Superset par quatre cartes de rôle sous le héros, Kepler par deux entrées étiquetées.
- **Le code, tout de suite** : ArcGIS (composant web `<arcgis-map>`, exemple vivant et code côte à côte, galerie de cartes menant à de vrais exemples) est le modèle le plus proche ; Leaflet montre 5 lignes dès l'accueil ; Shoelace deux blocs copiables.
- **Essayer sur place** (ce que la vitrine fait déjà, à garder) ; **ancres et sommaire visibles** (MapLibre « On this page », le support Grist) ; **pas d'onglets JavaScript** qui cachent le contenu, pas de murs de logos ni de carrousels.
- **Contre-exemple** : le dépôt `grist-widget` n'explique à personne comment ajouter un widget.

Chronométrage des six tâches sur la page actuelle (estimation : 3 s par écran défilé, 2 s par clic, 5 s de lecture ; les positions, elles, sont mesurées) :

| Tâche | Où est la réponse (bureau / téléphone) | Verdict |
|---|---|---|
| 1. Carte à mes couleurs sur mon site | écran 1,7 / 2,0 | trouvée, mais rien ne dit « sur mon site » dans les trois premiers écrans |
| 2. Terrain, hors ligne | écran 13,3 à 22,4 / 17 à 33 | trouvée au prix d'un long parcours, en trois blocs ; rien sur iPhone |
| 3. Importer mes tables | écran 2,5 / 2,8 | bien |
| 4. Différence avec une carte classique | haut de page | affirmée, jamais démontrée ; « manifeste », « scène », « hôte » dès le premier écran |
| 5. Licence | données : écran 20 / 29 ; **code : nulle part** | non trouvée pour le logiciel |
| 6. Exemple en direct | « Rennes » écran 3,7 / 5,3 ; le premier « aperçu » sous le héros est une carte vide « Nouveau projet » | oui, mais le premier bouton ne montre rien |

Défaut technique en plus : aucune image n'a de dimensions ; la page grossit de 22 % sur téléphone au défilement (saut de contenu) ; `apercu.jpg` pèse 353 Ko.

## 2. Principes

1. **Une intention = une porte.** On distingue les usages par ce que la personne veut faire, jamais par une fonction du produit.
2. **Toutes les portes sont visibles sans défiler**, comme des liens : contenu indexable, imprimable, utilisable au clavier. Pas d'onglets qui cachent du contenu.
3. **Chaque bloc a un public, une promesse, une preuve.** Pas de preuve vérifiable, pas de chiffre.
4. **Court.** Un bloc : 90 mots au plus. Une porte : 6 blocs au plus. Le reste est replié ou renvoyé à la documentation.
5. **Honnête.** Statut par partie (en service, test, prototype), limites dites, licences dites.
6. **Le code est montré**, sur la page, là où il convainc (porte « Dans votre site »), avec un bouton Copier.
7. **Standardisable** : tout passe par des champs de la fiche `vitrine.json`, facultatifs, pour que les autres widgets du dépôt adoptent la même présentation.

## 3. La page, de haut en bas

Cible : **environ 12 écrans sur ordinateur et 20 sur téléphone** (au lieu de 29 et 48), environ 2 500 mots hors journal (au lieu de 7 700).

```
[lien d'évitement]                                                   (invisible, au focus)
[Atlas]  Dans votre site · Dans Grist · Sur le terrain · À savoir · Nouveautés   (barre d'ancres)

HÉROS
  Atlas
  « Atlas affiche vos tableaux sur une carte : dans Grist, sur un téléphone ou dans votre
    propre site, à vos couleurs. »                                  (accroche selon la porte)
  [Mettre une carte dans mon site]   [Ouvrir dans Grist]   [Le code]   [En discuter]
  Statut : en service dans Grist · application Android en test · composant en développement actif

JE VEUX…                                                         (4 cartes, chacune = lien d'ancre)
  [capture]  Mettre une carte à mes couleurs dans mon site
  [capture]  Cartographier les tableaux de mon document Grist
  [capture]  Relever sur le terrain, même sans réseau
  [capture]  Voir un exemple en direct

UNE CARTE WEB CLASSIQUE, OU ATLAS ?                              (tableau de 4 lignes, pour le décideur)
  export à refaire à chaque changement  →  rien à exporter, la carte suit le tableau
  droits à gérer à part                 →  les règles d'accès de Grist
  données copiées chez un tiers         →  vos données restent chez vous
  carte figée                           →  couleurs, filtres, récit, relief au choix

PREUVES (4 chiffres, chacun avec sa preuve) — la licence du code y figure
  0 service extérieur contacté au démarrage (option base="aucune", mesuré) · 1 balise ·
  ~1,4 Mo pour la carte seule · code libre (MIT, formulation à valider)

À ESSAYER                                                        (galerie de 3 exemples vivants)
  Atelier de style · Rennes en direct · Palais Longchamp (3D)
  (remplace le « aperçu » vide « Nouveau projet » juste sous le héros)

1. DANS VOTRE SITE                                                        (6 blocs au plus)
  1.1 Une carte aux couleurs de votre site          [démo atelier]
  1.2 Dans votre page, en une balise                [CODE visible + Copier]
  1.3 Une application alimentée en continu          [démo Rennes en direct]
  1.4 Une carte qui respecte vos visiteurs          (services tiers, vie privée, poids)
  1.5 Voir un phénomène se déplacer                 (chaleur + temps : à construire, voir §7)
  1.6 Mettre en place                               (copier le dossier ou l'adresse publique, version figée)
  → lien « Le guide d'intégration complet » vers la page /integrer/ (3 étapes, charte JSON, limites, contrat)

2. DANS GRIST                                                             (7 blocs au plus)
  2.0 Le parcours en trois gestes : charger, régler, partager
  2.1 Vos tableaux deviennent une carte      (+ tableau « portes d'entrée » : tables, fichiers, OSM, QGIS, IGN)
  2.2 Colorer, dimensionner, étiqueter par la donnée
  2.3 Voir en 3D                              (relief, bâti, objets, soleil ; trafic simulé en une phrase)
  2.4 Cliquer un objet : sa fiche, sa bulle, ses formes   (fusion des blocs fiche, bulle, dessin)
  2.5 Raconter et laisser filtrer             (récit, trajet, filtres du lecteur)
  2.6 Partager et reprendre ses données       (lien, page intégrée, scène publiée, exports)
  2.7 Qui peut faire quoi                     (droits de Grist, trois modes)

3. SUR LE TERRAIN                                                         (3 blocs)
  3.1 Relever sur place        3.2 Suivre une tournée        3.3 L'application Android (statut dit)
  + tableau court : navigateur de téléphone (saisie : oui, hors ligne : non) · application Android (hors ligne : oui) ·
    iPhone (à préciser par le propriétaire : le contenu actuel n'en parle pas)

UN EXEMPLE COMPLET : le Palais Longchamp (3D, éclairage, récit, relevés)

À SAVOIR AVANT D'ADOPTER      (replié par défaut, sections <details>)
  Licences · Accessibilité · Services tiers contactés · Limites · Maturité par partie

NOUVEAUTÉS        (les 5 dernières versions, une étiquette de public ; « Toutes les versions » en lien)

PIED   Ajouter le widget dans Grist en trois gestes · Dépôt · Forum
```

**Sur téléphone** : la barre d'ancres devient un menu défilant horizontal collant ; les trois cartes « Je veux… » s'empilent ; chaque porte est un `<h2>` ; les démonstrations s'ouvrent en grand cadre (déjà fait).

## 4. Ce qui change dans le contenu

| Action | Détail |
|---|---|
| **Réécrire** | l'accroche (trois versions : agent, intégrateur, décideur), le haut de page ; le bloc 1 (corriger : seul `base="aucune"` coupe les services extérieurs, fait) ; les blocs Android (version de l'APK et statut), contextes, tournées |
| **Fusionner** | tables+IGN+portes d'entrée ; relief+objets 3D+volumes+trafic ; fiche+bulle+dessin ; récit+filtres ; partager+exporter+diffuser ; Android (3 occurrences → 1) |
| **Déplacer** | le journal (5 dernières versions + page des versions) ; l'encart technique Android ; les détails d'adresse (`?embed=`, `?scene=`) vers « Mettre en place » |
| **Supprimer** | les doublons de droits Grist (une seule fois, lien ailleurs) ; l'accroche qui répète le pitch ; deux entrées de journal qui sont des notes internes |
| **Créer** | « Dans votre page, en une balise » (code) ; « Mettre en place » ; « À savoir avant d'adopter » (licences, accessibilité, services tiers, limites, maturité) ; l'exemple chaleur + temps |
| **Afficher enfin** | `statut` par partie, `usages` (les métiers), la licence ; à rendre dans « Preuves » et « À savoir » |

Remplacer le jargon : manifeste → « scène publiée » ou « fichier de description » ; profil → « carte seule / Atlas complet » ; posture → « mode » ; hôte → « votre site » ; ACL, link keys → « règles d'accès de Grist ».

## 5. Fiche `vitrine.json` : champs à ajouter (tous facultatifs)

Sans eux, la page reste celle d'aujourd'hui ; les vitrines des autres widgets ne changent pas.

| Champ | Où | Rôle |
|---|---|---|
| `entrees[]` | `produit` | les portes : `id`, `titre`, `public`, `texte`, `image`, `alt`, `lien` |
| `usage`, `usageSecondaire[]` | chaque contexte | la porte du bloc, et « voir aussi » |
| `niveau` | chaque contexte | `essentiel` (visible) ou `detail` (replié) |
| `code` | chaque contexte | `{ langage, titre, source }` rendu en `<pre><code>` avec bouton Copier |
| `alt` | chaque image | distinct de la légende (aujourd'hui lue deux fois) |
| `statut`, `licence`, `accessibilite`, `confidentialite` | racine | alimentent « Preuves » et « À savoir » ; `statut` par partie |
| `cta[]` | racine | boutons du héros (remplace « Ouvrir le widget » figé) |
| `journalRecent` | `produit` | nombre de versions affichées |

Principe de nommage : `usage` (au singulier, sur un bloc) ne doit pas être confondu avec `usages` (les métiers, déjà présent).

## 6. Ce que le générateur doit faire (`scripts/generate-vitrine.js`)

1. Regrouper les contextes par `usage` sous un `<h2>` par porte ; ordre des `entrees`.
2. Une barre d'ancres (`<nav aria-label="Dans cette page">`), des `id`, `scroll-margin-top`, un lien d'évitement, des styles `:focus-visible`.
3. `niveau: detail` rendu en `<details><summary>`.
4. Un bloc de code avec échappement strict, bouton Copier (amélioration progressive : le code reste lisible sans script).
5. Héros : boutons et étiquette (« Widget Grist ») issus de la fiche, plus du gabarit figé ; `<title>` selon le type de produit.
6. Sections « Preuves », « À savoir », « Nouveautés » (journal replié au-delà de `journalRecent`).
7. Garde-fous : avertir si un champ présent n'est jamais rendu, si un bloc dépasse 90 mots, si un terme de jargon apparaît ; refuser une image sans `alt` et un chiffre sans `preuve`.
8. Un test de non-régression : une fiche sans les nouveaux champs produit exactement la page actuelle, pour les cinq fiches du dépôt.

Estimation : environ 80 lignes de générateur et leurs tests.

## 7. Phasage

**Étape 1 : page unique (la proposition ci-dessus).** Générateur + réécriture du contenu d'Atlas. Environ 2 à 3 jours : une moitié pour le contenu (le plus long), une moitié pour le générateur. Résultat attendu : 12 écrans, trois portes, code visible.

**Étape 1 bis, en parallèle, à faire avant d'y envoyer du monde :**
- corriger `EXPLOITATION-EXTERNE-BI.md` (§2, §8, §9 contredisent le journal des versions) ;
- reconstruire l'APK (le dernier publié est celui de la 1.13.1) ou le dire sur la page ;
- écrire la déclaration d'accessibilité honnête et la page licences ;
- construire la démonstration « chaleur + temps » (la composition existe dans le composant, marquée prototype dans le contrat).

**Étape 1 ter : deux pages satellites dès maintenant**, car elles ne changent pas la page principale : `/w/atlas/integrer/` (le guide complet : trois étapes, le script et la balise copiables, un exemple de charte JSON, ce que la page hôte doit fournir, lien vers le contrat) et `/w/atlas/nouveautes/` (le journal complet, 45 entrées). Le journal quitte la page principale (22 % de sa longueur).

**Étape 2 (conditionnelle) : une page par usage**, seulement si les mesures montrent que la page unique reste trop longue ou si l'offre « site » mérite sa propre adresse pour le référencement. Les champs `entrees` et `usage` servent déjà ; coût de 150 lignes de plus et des liens relatifs de démonstrations à recalculer.

**Étape 3 : standardiser** aux autres widgets (TaskFlow, Artefactory, qgis2grist, Form Builder) : fiche commune (usages, statut, licence, accessibilité), l'accueil du site mis à jour (« Le même widget, trois usages » ne mentionne pas le site d'une organisation).

## 8. Comment saurons-nous que c'est mieux

Six tâches à chronométrer avant et après, sur ordinateur et téléphone (cible : réponse en au plus 2 écrans et 2 clics) :
1. « Je veux mettre une carte aux couleurs de mon entreprise sur mon site. »
2. « Je suis agent de terrain : puis-je saisir sur téléphone, hors ligne ? »
3. « Je veux importer mes tables Grist sur une carte. »
4. « Je suis décideur : en quoi est-ce différent d'une carte web classique ? »
5. « Quelle licence, quelles données ? »
6. « Je veux voir un exemple fonctionnel en direct. »

Autres seuils : aucune image sans dimensions (plus de saut de contenu) et image d'aperçu sous 100 Ko ; hauteur de page ≤ 12 écrans ordinateur et ≤ 20 téléphone ; Lighthouse accessibilité ≥ 98 (93 aujourd'hui, le seul échec est un contraste à 4,47:1) ; contraste de tous les textes ≥ 4,5:1 ; un test à cinq personnes non expertes (« où trouvez-vous le code ? », « qu'est-ce qu'Atlas pour vous ? »).

## 9. Décisions à prendre

1. **Quelle porte en premier ?** Recommandé : « Dans votre site », puisque l'objectif est de convaincre les organisations ; mais la page vit dans un catalogue de widgets Grist.
2. **Page unique d'abord (recommandé), ou pages séparées d'emblée ?**
3. **Formulation juridique** : se limiter à « publié sous licence MIT » ; une organisation adoptante demandera sans doute une confirmation écrite des droits, à traiter hors vitrine.
4. **Maintenance** : un seul mainteneur ; que promet-on (aucune garantie de service) ?
5. **Android** : reconstruire l'APK ou afficher la version publiée et son statut.
6. **Le fichier `projects/Atlas/CLAUDE.md`** (public, 250 Ko) nomme une organisation aux lignes 8 et 70 : à neutraliser avant toute exposition aux agents ou aux moteurs.
