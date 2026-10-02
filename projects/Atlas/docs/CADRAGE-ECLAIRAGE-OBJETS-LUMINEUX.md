# Cadrage — l'éclairage extérieur dans Atlas : données EclExt, objets lumineux paramétriques

*24/09/2026. Premier volet d'un chantier plus large : des objets 3D paramétriques
qui réagissent aux conditions de la scène. On commence par l'éclairage, parce
que le cas d'usage est là (campagne de mesure nocturne sur le Jarret) et que le
comportement d'un point lumineux est déjà décrit par un standard national.*

## Ce qu'on veut

1. **Des points lumineux qui portent leurs caractéristiques complètes**, au
   format du géostandard **EclExt** (CNIG, v1.1, validé le 06/06/2022) : type
   de source, structure, support, hauteur de feu, température de couleur,
   puissance, flux, photométrie (CIE n°3, ULR), inclinaison, et surtout le
   **profil nocturne** — allumage, extinction, variations programmées par plage
   horaire.
2. **Des modèles 3D de luminaires paramétriques**, bâtis hors d'Atlas (Blender,
   générateur pix2hdr), choisis et réglés par ces caractéristiques, comme le
   catalogue `atlas-objets` le fait déjà pour la végétation.
3. **Des objets qui réagissent à la scène** : à l'heure et à la date réglées
   dans Atlas, chaque luminaire est allumé, abaissé ou éteint selon son profil ;
   il porte son **cône de lumière**, éclaire ce qui l'entoure et **projette des
   ombres**, puisqu'il est une source.

## Un seul contrat pour tous les objets paramétriques

L'éclairage n'ouvre pas un second mécanisme : il devient la **deuxième famille**
du contrat `atlas-objets` établi avec pix2hdr pour la végétation
(`pix2hdr/docs/SPEC-ATLAS-OBJETS-0.1.md`). Le patron est le même pour toute
famille, et il sert les **deux projets** — Atlas pour l'affichage web, pix2hdr
pour ses rendus Blender :

| Pièce du contrat | Végétation (existe) | Éclairage (à ajouter) |
|---|---|---|
| **Référentiel** qui décrit l'objet | OSM, BD TOPO, inventaire arboré : essence, hauteur, circonférence, date de plantation | **EclExt** : structure, support, hauteur de feu, source, photométrie |
| **Types** — `matches` sur ces champs | `species`, `genus`, `leaf_type`… | `structure`, `support`, `typeSource` |
| **Mesures** — `scale`, `select`, `uniform` | hauteur → échelle ; **âge** (circonférence, date de plantation) → `select` sur `age_class` ; houppier perçu → échelle | `hauteurFeu` → `select` sur une classe de hauteur ou mât étiré (`axis: vertical`) ; `inclinaisonInstallee` → orientation du nœud émetteur |
| **Fichiers** — clés discrètes | `age_class` × `variant` × `lod` | `height_class` (h4 à h12) × `variant` × `lod` |
| **Bloc de famille** | `vegetation.phenology` | `lighting` (nom déjà réservé par le schéma 0.1) : émetteurs (position, axe, cônes), photométrie par défaut |
| **Contrat de comportement** — calculé depuis le bloc et les **conditions de la scène** | `atlas-vegetation-season/0.1` : date → `uFoliage`, `uAutumn` | `atlas-eclairage-profil/0.1` : date, heure, soleil, profil EclExt → allumé, facteur de flux, température de couleur |
| **Référence et vecteurs** | `gn_lib/objseason.py` + `objseason_vectors.json`, passés au bit près par `lib/catalogue-objets.js` | `gn_lib/objeclairage.py` + vecteurs, passés au bit près par `lib/eclairage-profil.js` — même méthode, même exigence |

Deux conséquences :

- **Les conditions de la scène sont une entrée commune** : date (saison),
  heure et position du soleil (éclairage), plus tard météo ou vent. Une famille
  déclare celles qu'elle lit ; Atlas les fournit depuis ses réglages (`Soleil`,
  date), pix2hdr depuis son rendu.
- **La végétation gagne l'âge par le même chemin** : une mesure `select` sur
  `age_class`, lue dans le référentiel (circonférence, date de plantation,
  hauteur), à côté du houppier perçu qui règle déjà l'échelle. Rien à inventer
  côté contrat : `age_class` existe dans les clés de fichiers de la 0.1 ; il
  manque les mesures qui la choisissent et les données de référence qui les
  alimentent.

## Ce que pix2hdr fait déjà — et qui change ce cadrage

La première version de ce cadrage ignorait une brique existante :
`pix2hdr/experiments/eclairage/generation` (lue le 24/09/2026). Elle fait déjà,
sur l'emprise de Longchamp :

| Déjà fait par pix2hdr | Où | Conséquence pour Atlas |
|---|---|---|
| Schéma, vocabulaire et bandes de plausibilité **EclExt 1.1 + StaR-Elec 1.01** | `experiments/eclairage/normes/eclairage.json`, `correspondance.md` | Atlas **lit ce vocabulaire**, ne le réécrit pas : même source pour les listes de valeurs des tables Grist |
| Détection et mesure des points lumineux (LiDAR HD, OSM, BD TOPO, Panoramax), chaque valeur avec son **statut** (mesure, règle, à vérifier) | `points_lumineux.json`, `mesures.json` | le statut voyage jusqu'à la fiche Atlas : une hauteur de feu `regle` ne s'affiche pas comme une mesure |
| **Quatre familles géométriques** paramétriques (mât, applique de façade, axial suspendu, projecteur) | `maillage.py`, `mats_params.json`, OBJ | le lot E3 n'est pas à inventer : c'est l'**export** de ces familles en catalogue `atlas-objets` (glTF + nœud émetteur) |
| **Profils nocturnes écrits au format EclExt** (`voirie_A` : `+0CS` → `+0LS`, abaissement 50 % 23 h 30–5 h 30 ; `mise_en_lumiere_B1` : extinction à 1 h, arrêté de 2018) et **états calculés** à des instants types | `photometrie.py`, `photometrie.json` (`etats_types`) | **la référence Python du lot E1 reste à écrire** : `etat()` ne lit pas les chaînes EclExt, ses seuils et heures sont codés en dur (audit du 24/09). Les `etats_types` donnent des cas, pas une référence |
| Photométrie par règle (flux utile, 110 lm/W ; 2 700 K pour plusieurs classes, 3 000 K plafond ; ULR posé à 0,5 %, 1 % étant le plafond) ; format cible IES LM-63 | `photometrie.json` | three.js ne lit pas l'IES : la maquette web aura un cône et une intensité, pas la distribution photométrique — **dit dans l'interface** |
| Rendus de nuit sous Cycles | `rendus.py` | la voie de rendu de qualité ; Atlas est la voie en direct, moins fidèle |

**Un désaccord à trancher avant tout vecteur de test.** EclExt définit `CS`
comme le **coucher du soleil** ; le calcul d'état de pix2hdr allume au
**crépuscule civil** (soleil à −6°) pour la voirie, mais au coucher apparent
(−0,833°) pour la mise en lumière — le même `+0CS` n'a pas le même sens dans
pix2hdr lui-même. Écart mesuré à Marseille : 28 à 36 minutes selon la saison.
Proposition : `CS` et `LS` = coucher et lever apparents (−0,833°), comme le
standard ; un allumage au crépuscule civil s'écrit par un décalage explicite
(`+30CS`) ou reste une règle documentée — jamais un sens caché de `CS`. Même
exigence pour **« milieu de nuit »**, que le standard nomme sans le définir.

**Le banc de validation de pix2hdr sert le document CRISI.** Le jeu « Marseille
– Éclairage 2023 » (Ville de Marseille, Licence Ouverte 2.0, 63 018 points ;
positions, code d'ouvrage, catégorie MAT / POTEAU / FAÇADE / AXIAL / MEL) couvre
le Jarret : 93 points dans l'emprise du relevé, dont 81 mâts. Les luminaires
notés au terrain y ont chacun un voisin très proche (« Lum 13 » à 2,4 m,
« Lum 3 » à 6,6 m, « Lum 12 » à 7,9 m). pix2hdr s'interdit ce jeu dans son
générateur, parce qu'il est local ; un document d'étude marseillais peut, lui,
s'en servir comme source de positions — avec son attribution, et sans le
confondre avec des attributs techniques qu'il ne porte pas.

## Le standard, tel qu'il est

Sources : spécification `cnig_eclext_v1_1.pdf`, dépôt
`github.com/cnigfr/schema-eclairage-exterieur` (v1.1.0 du 29/11/2022 ; le
`schema.yml` n'y porte que des métadonnées, le modèle est dans la
spécification).

| Classe | Rôle | Attributs |
|---|---|---|
| `PointLumineux` | un luminaire et sa ou ses sources, géolocalisé (géométrie de la source, à défaut du support) | **obligatoires** : `statut`, `eclairagePublic`, `usage`, `typeSource`, `structure`, `support`, `temperatureCouleur` (K), `puissance` (W), `valideDe`, `extinctionNuit`, `estAdaptatif` · **optionnels** : `fabricant`, `modele`, `photometrie`, `hauteurFeu` (m), `fluxSource`, `fluxLuminaire` (lm), `cie3`, `ulrNominal`, `ulrInstalle` (0–1), `inclinaisonMax`, `inclinaisonInstallee` (°), `datePremiereInstallation`, `valideJusque`, `profilNocturne`, `eclairageAdaptatif` |
| `ProfilNocturne` | un jeu de variations programmées | `nomProfil`, `allumageSoir`, `extinctionMatin` |
| `PlageVariation` | une variation sur une plage horaire | `nomPlage`, `grandeurVariation` (EX extinction · F flux · P puissance · TC température de couleur), `heureDebut`, `heureFin`, `formatVariation` (% · VA), `valeur`, `valideDe`, `valideJusque` |
| `ProfilContientPlage` | association n–n profil ↔ plage | `nomProfil`, `nomPlage` |

**Les heures ne sont pas des heures** : c'est une chaîne relative à une
référence — `21:36HL` (heure locale, défaut), `20:36TU`, `-196MN` (minutes avant
le milieu de nuit), `-15CS` (avant le coucher du soleil), `+15LS` (après le
lever). C'est ce qui rend le comportement **calculable pour n'importe quelle
date** — et Atlas calcule déjà le soleil de sa scène (SunCalc, `sunPosition`).

Listes de valeurs (codes courts, extensibles par `AU` + table d'association,
`XX` = inconnu) : `usage` (A, B1–B4, C, D, E, F, G, PU, IN — catégories de
l'arrêté du 27/12/2018), `typeSource` (FLUO, HAL, IM, INC, IND, LED, SBP, SHP,
VM, XEN), `structure` (APP, BOR, BL, COL, EN, LANT, PROJ, REGL, TUBE, VASQ),
`support` (BUS, CAT, ENS, MAT, MUR, OUV, PAN, POT, SOL), `eclairageAdaptatif`
(AV, CO, EN, TG), `statut` (codes INSPIRE : functional, projected,
decommissioned, dismantled, underCommissionning, underConstruction).

## Revue du document d'exemple CRISI

Document « Atlas — exemple repères de crue (Jarret) », construit le 24/09/2026
à partir de l'export de l'application de terrain.

**Le métier a été mal lu.** La liste de travail embarquée dans l'export est
« Repères d'inondation », et le document a été bâti sur elle — d'où « aucun
relevé qualifié ». Mais les notes de terrain disent autre chose : numéros de
luminaires (« Lum 3 », « Lum 12 », « Lum 13 »), séries de trois lectures
horizontales, verticales et perpendiculaires vers des projecteurs, hauteur de
capteur, éclairement à la surface de l'eau sous le pont, « pas d'éclairement ».
C'est une **campagne nocturne de mesure d'éclairement au luxmètre** le long du
cours d'eau — la question de la lumière artificielle sur un corridor écologique
(trame noire). L'application de terrain a servi de carnet géolocalisé ; sa
liste de travail n'est pas le métier.

| Conserver | Reprendre |
|---|---|
| `Visites`, `Itineraire` (portions et trous de GPS), `Points_GPS`, `Prises_de_vue` et leurs photos | `Reperes` → **`Releves`** : la note de terrain générique (heure, position, azimut, commentaire, photos), sans les 24 rubriques de crue |
| le récit posé sur le trajet, une étape par relevé | **`Mesures_eclairement`** (nouvelle) : une ligne par série — relevé, luminaire visé, grandeur (horizontale, verticale, perpendiculaire, surface de l'eau), hauteur du capteur, trois lectures, moyenne. Extraites des commentaires, relues à la main |
| la variante anonymisée | **`Points_lumineux`** + `Profils_nocturnes` + `Plages_variation` + `Profil_contient_plage` : les quatre classes EclExt |
| | les formulaires : « Mesure d'éclairement » (terrain) et « Point lumineux EclExt » (inventaire) remplacent les deux formulaires de crue |

**Positions des luminaires** : l'export ne les donne pas. Un « Lum n » noté à
un relevé situe le luminaire **près** du relevé, pas dessus. Trois sources
possibles, par ordre de fiabilité : l'inventaire du gestionnaire (s'il existe,
en EclExt ou non), les luminaires d'OpenStreetMap (`highway=street_lamp`,
`ref`), et le placement à la main — ce que permettra l'édition de géométries
(`CADRAGE-EDITION-GEOMETRIES.md`, lots 2 et 7). En attendant, un point placé au
relevé porte `precision_position = approchée`, et ses attributs inconnus valent
`XX`, comme le prévoit le standard.

**Ce que la combinaison apporte, et qu'aucun des deux ne fait seul** : le
modèle de chaque point lumineux (flux, hauteur, photométrie) **prédit**
l'éclairement aux points de mesure ; la mesure le **vérifie**. L'écart dit où
l'inventaire est faux, ou où une source non inventoriée éclaire (« lum de la
Beauté », les projecteurs sous le pont).

## Le comportement : une règle pure, testée

`lib/eclairage-profil.js`, sans carte ni Grist :

- `lireHeureEclext(texte)` → `{ minutes, reference }` (HL, TU, MN, CS, LS) ; une
  chaîne illisible est refusée avec son motif ;
- `resoudreHeure(heure, { date, lat, lon, fuseau })` → instant absolu. Coucher
  et lever par SunCalc (déjà chargé) ; **milieu de nuit** = milieu entre
  coucher et lever suivant ;
- `etatPointLumineux(point, profil, plages, instant)` →
  `{ allume, facteurFlux, facteurPuissance, temperatureCouleur, plage }`. Hors
  profil : `extinctionNuit` et un allumage au coucher par défaut, **dits** comme
  hypothèse. Une plage `EX` éteint ; `F`, `P` en % ou en valeur absolue
  abaissent ; `TC` change la couleur ; les dates `valideDe`/`valideJusque`
  s'appliquent ;
- tests : les exemples du standard (`-196MN`, `-15CS`, `+15LS`), une nuit
  d'hiver et d'été à Marseille, une plage qui chevauche minuit, une extinction
  cœur de nuit 23 h–5 h, une variation de flux à 50 %.

Atlas l'appelle à chaque changement d'heure ou de date (`updateLighting`) : le
curseur du soleil devient aussi le curseur de l'éclairage public.

## Les objets lumineux 3D

### Le catalogue porte les émetteurs

Même contrat que la végétation (`atlas-objets`, `lib/catalogue-objets.js`) :
la famille `lighting` ajoute un bloc d'émetteurs par modèle et le contrat de
comportement `atlas-eclairage-profil/0.1`, à négocier avec pix2hdr comme la
saison l'a été :

| Élément | Porté par | Réglé par |
|---|---|---|
| type de luminaire | `matches` sur `structure` (LANT, BOR, PROJ, BL, APP…) et `support` (MAT, MUR, POT, SOL…) | EclExt |
| hauteur du mât | paramètre du modèle, **pas une mise à l'échelle** — une lanterne de 8 m n'est pas une lanterne de 4 m agrandie : variantes par classe de hauteur ou mât étiré seul | `hauteurFeu` |
| point d'émission | nœud glTF nommé, avec `KHR_lights_punctual` (spot : direction, angles) — lu par `GLTFLoader` de three r160 | le modèle |
| orientation du flux | inclinaison du nœud | `inclinaisonInstallee` |
| ouverture du cône | angle extérieur et pénombre | portés par le modèle (famille, `photometrie`). **Pas `cie3`** : c'est une part de flux dans un cône fixe de 75,5°, pas un angle d'ouverture — elle peut au plus régler la pénombre |
| flux vers le ciel | un second émetteur faible, ou rien | `ulrInstalle` |
| couleur | conversion kelvins → RVB | `temperatureCouleur`, puis `TC` du profil |
| intensité | **calculée par chaque projet depuis la fiche EclExt**, jamais écrite dans le glTF : Blender et le calcul de pix2hdr ne convertissent pas le flux de la même façon (facteur 2,28 relevé par l'audit). Le glTF porte position, axe et cônes | `fluxLuminaire`, à défaut `puissance` × efficacité type de la source |

Blender bâtit les modèles et exporte le nœud émetteur ; Atlas ne sculpte rien.

### Le rendu : trois obstacles à lever avant de voir un seul luminaire briller

1. **La nuit est un voile posé par-dessus la carte.** `#night-tint` est un calque
   CSS en `mix-blend-mode: multiply` au-dessus des deux canvas : il ne peut
   qu'assombrir, et il assombrirait la lumière comme le reste. **Préalable** :
   faire entrer la nuit dans le rendu — teinte des couches du fond (paint
   MapLibre), ambiance three.js — pour que les sources restent au-dessus.
2. **Une lumière three.js n'éclaire que la scène three.js.** Le fond MapLibre,
   le relief et les volumes extrudés ne la reçoivent pas. Deux réponses selon le
   fond :
   - **fond MapLibre** : la tache de lumière au sol est **calculée**, pas
     rendue — éclairement E = I·cos³θ / h² sous chaque source, sommé, peint en
     nappe additive dans three.js sur un récepteur au sol calé sur le relief.
     C'est aussi la valeur qu'on compare aux mesures ;
   - **fond en tuiles 3D pix2hdr** (cible, quand ce projet sera prêt) : sol et
     bâti sont des maillages three.js, la lumière les éclaire et les ombres s'y
     posent **sans artifice**. C'est la voie qui donne le rendu attendu ; la
     nappe calculée reste l'indicateur.
3. **Une ombre par source coûte une passe de rendu.** Un `SpotLight` qui porte
   ombre rend la scène une fois de plus. Budget : les **N sources les plus
   proches de la caméra** (N ≈ 4) portent ombre, les suivantes éclairent sans
   ombre (≈ 16), les autres ne montrent que leur lampe émissive, leur cône
   translucide et leur tache calculée. Même logique que le niveau de détail
   (`niveauPourDistance`). Aujourd'hui les ombres ne tombent que sur un plan
   plat au niveau zéro (`groundShadow`) : faux sur relief, à recaler.

## Lots

| Lot | Livre | Contrôle |
|---|---|---|
| **E0 — Document d'exemple** | revue appliquée au document CRISI : `Releves`, `Mesures_eclairement`, quatre tables EclExt typées aux listes du vocabulaire pix2hdr, points lumineux posés depuis le jeu Ville de Marseille 2023 (93 dans l'emprise), deux formulaires, récit revu | les 9 relevés et leurs mesures relus à la main ; un point lumineux saisi au formulaire passe l'export EclExt |
| **E1 — Profil nocturne** | sens de `CS`, `LS`, `MN` tranché avec pix2hdr ; `lib/eclairage-profil.js` passé au bit près sur les vecteurs issus de `photometrie.py` ; l'état de chaque point à l'heure de la scène, affiché dans la fiche et la légende (allumé, abaissé, éteint) | les exemples du standard, deux saisons |
| **E2 — Nuit dans le rendu** | fin du voile CSS : teinte du fond et ambiance three.js | une scène de nuit identique à l'œil, et un objet émissif qui reste lumineux |
| **E3 — Luminaires au catalogue** | modèles bâtis pour cela par pix2hdr (ses quatre familles sont des OBJ posés sur site, pas des modèles d'origine) et vrai export glTF, en famille `lighting` du contrat `atlas-objets` (glTF, nœud émetteur) et contrat `atlas-eclairage-profil/0.1` (référence Python et vecteurs chez lui, lecture au bit près chez nous) ; lecture du nœud émetteur ; couleur et intensité depuis EclExt ; cône translucide | un catalogue d'essai de 3 luminaires ; allumage suivant le curseur d'heure |
| **E4 — Lumière au sol** | nappe d'éclairement calculée ; comparaison aux mesures (`Mesures_eclairement`) | écart modèle / mesure affiché par relevé |
| **E5 — Ombres des sources** | budget d'ombres par distance ; récepteur calé sur le relief | 4 sources ombrantes sans chute de fluidité sur un portable |
| **E6 — Tuiles pix2hdr** | le fond en tuiles 3D reçoit la lumière et les ombres | plus tard, quand le projet sera prêt |
| **V1 — Âge de la végétation** | **largement fait** : le catalogue végétation v3 choisit déjà `age_class` par la circonférence, et Atlas le lit et le teste. Reste à étendre les sources (date de plantation, hauteur) | un platane jeune et un vieux, lus dans les champs, rendus différemment |

## Audit de pix2hdr (24/09/2026)

`docs/etudes-pix2hdr/AUDIT-OBJETS-PARAMETRIQUES.md` a corrigé ce cadrage
(corrections reportées ci-dessus) et propose l'ordre de marche :

1. trancher `CS`/`LS` (−0,833° partout, décalage explicite sinon), `MN`
   (milieu coucher–lever suivant, à moins d'une minute du minuit solaire), la
   clé `height_class`, et une **liste fermée des statuts de valeur** ;
2. pix2hdr écrit la référence Python du profil nocturne et une trentaine de
   vecteurs ; Atlas écrit `lib/eclairage-profil.js` et les passe au bit près ;
3. pix2hdr publie un extrait accentué de son vocabulaire EclExt et les points
   de Longchamp en GeoJSON ; Atlas lui transmet les relevés au luxmètre du
   Jarret, premier banc de validation de nuit.

Les tuiles 3D Tiles de la maquette sont aujourd'hui en repère local, sans
transformation terrestre, sans éclairage public, à usage interne ; Atlas n'a
pas de lecteur de tuiles. Premier pas : une tuile chargée comme GLB ancré.

## À éprouver avant de s'engager

1. Coût réel d'un `SpotLight` ombrant dans le calque personnalisé partagé avec
   MapLibre (mesure sur portable, 1, 4, 8 sources).
2. `KHR_lights_punctual` exporté par Blender et relu par `GLTFLoader` r160 :
   angles, intensité, unités.
3. Fusion additive dans three.js au-dessus du fond MapLibre (contexte WebGL
   partagé, ordre de rendu).
4. « Milieu de nuit » : le standard ne le définit pas plus que par son nom ;
   milieu coucher–lever retenu, **à confirmer** auprès du CNIG ou du
   gestionnaire.
5. Positions des luminaires du Jarret : inventaire du gestionnaire ou OSM
   (la requête OSM a échoué depuis le poste de travail le 24/09 : à refaire
   depuis Atlas).

## Vérification du 02/10/2026 : l'éclairage d'un import OSM, et ce que l'interface en dit

Faite avant de concevoir les réglages d'éclairage par catégorie, couche et objet.

**1. Ce qu'OSM apporte vraiment (`pix2hdr/experiments/eclairage/normes/correspondance.md`).**
Une seule source nationale, et elle est maigre : OSM ne fournit que la **géométrie** et, pour une
minorité de points, le **support** (`power=pole` → `POT`) et la **matière** (`material`, StaR-Elec).
Elle ne couvre qu'environ 7 % du parc d'une emprise, avec un biais sévère (84 à 100 % des poteaux de
réseau, 9 % des candélabres, 0 % des appliques de façade et des suspendus). Tout le reste est posé
**par règle**, partout en France, et le dépôt pix2hdr le dit : `statut` (`functional`), `usage`,
`typeSource`, `structure`, `temperatureCouleur` (plafonnée à 3 000 K), `puissance` et `flux` (bornés par
catégorie : 15 à 60 W en rue de desserte, 25 à 100 W sur poteau de réseau, 40 à 130 W en voie
structurante), `profilNocturne`. La hauteur de feu vient du LiDAR HD, pas d'OSM.

Conséquences pour Atlas :

- Un import OSM ne peut pas allumer une lampe par lecture de ses tags : il n'y a **rien à lire**. Les
  correspondances `height`, `lamp_mount`, `light:colour` vers `hauteurFeu`, `support`,
  `temperatureCouleur` ne figurent **pas** dans la doctrine de pix2hdr ; ce sont des propositions
  d'Atlas, à valider avant d'être écrites, et jamais présentées comme des mesures.
- Les valeurs par défaut existent déjà, **par règle et avec leurs bandes** (`eclairage.json`,
  `bandes_de_plausibilite`). Atlas les reprend, il ne les invente pas, et chacune garde le statut
  `regle` (vocabulaire du dépôt : `observe`, `mesure`, `propage`, `regle`, `herite`).
- Les profils nocturnes proposés (`voirie_standard`, `voirie_extinction_coeur_de_nuit`,
  `parc_et_jardin`) sont **des hypothèses** ; seul `patrimoine_longchamp` s'appuie sur un texte
  opposable (arrêté de 2018, extinction à 1 h).

**2. Ce que l'interface affiche de l'état d'un luminaire.** Le calcul est fait (`etatPointLumineux`,
`Eclairage.etats`), mais **rien ne l'affiche** : `Eclairage.libelle()` existe et n'est appelée nulle
part, la légende n'en dit rien. Le lot E1 (« affiché dans la fiche et la légende : allumé, abaissé,
éteint ») n'est donc fait qu'à moitié. Conséquence vécue : on voit qu'une lampe est éteinte, jamais
**pourquoi** (statut, période de validité, plage d'extinction, heure d'allumage).

**3. Là où se règle l'éclairage aujourd'hui.** Nulle part dans l'interface : les paramètres sont des
champs de chaque objet (`puissance`, `temperatureCouleur`, `hauteurFeu`, `azimut`, `statut`,
`valideDe`, `valideJusque`, `allumageSoir`, `extinctionMatin`, `plages`). Un import OSM n'en porte
aucun, et reste donc un modèle 3D éteint même après le choix d'un objet réaliste.

**Ce qui en découle** (non engagé, à valider) : réglages d'éclairage à trois niveaux (objet, couche par
type, valeur par défaut du type), chaque valeur portant sa provenance ; valeurs par défaut reprises
des règles de pix2hdr ; schéma et listes de valeurs lus dans le vocabulaire EclExt de pix2hdr ;
contrôles déduits du même schéma ; et, d'abord, l'affichage de l'état et de sa raison dans la fiche.
