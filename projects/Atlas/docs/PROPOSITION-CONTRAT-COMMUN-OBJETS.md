# Proposition — un contrat commun Atlas ↔ pix2hdr pour les objets paramétriques

*24/09/2026. Proposition ouverte aux deux projets, à discuter sur le canal
WikiChat `atlas-pix2hdr-objets`. Elle ne remplace aucun document existant :
elle les relie. Sources : `pix2hdr/docs/SPEC-ATLAS-OBJETS-0.1.md`,
`pix2hdr/experiments/anime/structure/` (README, `contrat_mobiles_0.1.json`),
`pix2hdr/experiments/menuiseries/generateurs/etats.py`,
`pix2hdr/experiments/eclairage/generation/`, et côté Atlas
`docs/CADRAGE-ECLAIRAGE-OBJETS-LUMINEUX.md`,
`docs/etudes-pix2hdr/AUDIT-OBJETS-PARAMETRIQUES.md`.*

> **État (24/09/2026) : amendée par la revue côté pix2hdr, en attente du GO
> de Nicolas.** Réponse point par point :
> `docs/etudes-pix2hdr/REPONSE-PIX2HDR-CONTRAT-COMMUN.md`. Accords sur 1, 2,
> 6, 7, 10 ; amendements sur 3 (bloc `horloge` avec `lieu` = ancre de scène),
> 4 (SunCalc s'écarte jusqu'à 0,21° : Atlas porte le soleil NOAA), 5 (le bâti
> n'est pas une famille `matches` : les fenêtres deviennent un contrat de
> couche ou de tuile), 8 (graine FNV à construire chez pix2hdr, `_WIN` en
> flottant 32 bits non quantifié), 9 (statuts sur deux axes). Les vecteurs de
> comportement sont exacts **soleil en entrée** ; ceux du soleil, à tolérance.

## Le principe : produire une fois, lire deux fois

Chaque objet — un arbre, un luminaire, un bâtiment et ses fenêtres — est
**produit une seule fois**, par pix2hdr, sous une forme qui convient aux deux
lecteurs :

| Lecteur | Ce qu'il en fait |
|---|---|
| **Atlas** (web, temps réel, three.js) | affiche, choisit le modèle par les champs, anime selon l'heure et la date de la scène |
| **pix2hdr** (Blender, Cycles et EEVEE) | rend la maquette, compare aux photos, produit les tuiles |

Conséquences : la végétation cuite par pix2hdr sert à Atlas ; les luminaires et
leur comportement, cadrés pour Atlas, servent aux rendus de pix2hdr ; les
fenêtres de pix2hdr s'allument dans Atlas. Aucune famille n'a deux versions.

Trois règles de doctrine, déjà écrites chez pix2hdr et reprises telles quelles :

1. **On paramètre le comportement, on ne peint pas le résultat**
   (`menuiseries/generateurs/etats.py`) : une fenêtre éclairée est une couleur,
   une intensité et une part allumée, jamais une photo de pièce.
2. **Un paramètre, une boucle exacte, un fichier à côté, une géométrie qui ne
   bouge pas** (`anime/structure/README.md` §4.2, précédent de l'eau) : aucune
   animation n'est cuite dans un glTF.
3. **Toute valeur porte son statut, sa source et sa confiance** : une hauteur
   de feu posée par règle ne se présente jamais comme une mesure.

## 1. L'horloge de scène, commune

Tous les comportements lisent **la même horloge**. Atlas la porte déjà : le
module Soleil règle **la date, l'heure et le lieu** de la scène
(`STATE.settings.date`, `timeOfDay`, centre de la carte), et le soleil en est
calculé (`sunPosition`, SunCalc). pix2hdr relevait l'absence de date dans le
manifeste de scène (`contrat_mobiles_0.1.json`) : elle est dans Atlas, pas
dans le fichier de scène qu'il exporte. Il ne s'agit donc pas d'inventer une
horloge mais de rendre l'existante **compatible avec EclExt**, par trois
adaptations :

| Adaptation | Aujourd'hui | Pourquoi EclExt l'exige | Proposé |
|---|---|---|---|
| **Heure locale du lieu, pas du lecteur** | `sunPosition` compose l'heure dans le fuseau du **navigateur** (`setHours`) | `HL` d'EclExt est l'heure légale **du site** : une extinction à `01:00HL` doit tomber à 1 h à Marseille, que la scène soit ouverte à Paris, à La Réunion ou sur un téléphone réglé ailleurs — et aux changements d'heure | un `fuseau` IANA de scène (`Europe/Paris` par défaut, déduit ou réglé pour l'outre-mer) ; l'instant se compose dans ce fuseau |
| **La date, quand elle compte** | écartée des préférences de scène, volontairement : une scène rouverte l'an prochain montre l'heure choisie (`lib/scene-prefs.js`) ; les étapes de récit, elles, la capturent | le coucher varie de trois heures sur l'année, et les plages EclExt ont des dates de validité : une nuit d'hiver n'est pas une nuit d'été | garder ce défaut, et permettre à une scène d'**épingler** sa date (`settings.dateEpinglee`) quand la saison fait partie du propos |
| **Les heures solaires d'EclExt** | `SunCalc.getTimes` déjà employé (préréglages Soir, Nuit) | `CS`, `LS` = coucher et lever apparents (−0,833°) ; `MN` à fixer | `CS`/`LS` = `sunset`/`sunrise` de SunCalc ; `MN` selon la décision 2 (§8) |

**Le soleil, calculé pareil des deux côtés.** pix2hdr emploie l'algorithme
NOAA (`src/pairs/sun.py`), Atlas SunCalc. Un allumage se joue à quelques
dixièmes de degré — 0,1° déplace l'heure d'environ une demi-minute. Les
vecteurs de test disent si l'écart entre les deux est négligeable ; sinon
Atlas s'aligne sur NOAA pour les comportements. Pour l'échange, le fichier de
scène porte l'instant complet (`instant` ISO avec décalage, `fuseau`) ; `date`
et `timeOfDay` restent lus pour les scènes existantes.

## 2. Les familles et leurs contrats de comportement

Un contrat de comportement = une fonction **(paramètres de l'objet, horloge)
→ état**, avec une référence Python chez pix2hdr et des vecteurs de test que
le JavaScript d'Atlas passe à l'égalité stricte — la méthode déjà éprouvée
pour la graine et la saison.

| Famille | Paramètres (référentiel) | Contrat de comportement | État produit | Existe |
|---|---|---|---|---|
| **Végétation** (`vegetation`) | essence, circonférence, hauteur, date de plantation | `atlas-vegetation-season/0.1` | `uFoliage`, `uAutumn` ; `age_class` choisie par mesure | **oui**, lu par Atlas |
| | | vent (`_WIND`) | flexion | à créer, pendant la cuisson des gabarits (`anime/structure` §8) |
| **Éclairage** (`lighting`) | EclExt : structure, support, hauteur de feu, source, température, flux, profil nocturne | `atlas-eclairage-profil/0.1` | allumé, facteur de flux, température de couleur | référence Python **à écrire** (l'actuel `etat()` a ses seuils en dur) |
| **Bâti — fenêtres** (`building`) | usage (BD TOPO), nombre de logements (BDNB, RNB), baies de la grammaire de façade | `atlas-bati-fenetres/0.1` | part allumée par bâtiment ; chaque baie allumée ou non par tirage | **la règle existe** : `part_allumee(elevation, usage, n_logements)` et `regime_de` (`menuiseries/generateurs/etats.py`) ; le contrat reste à écrire |
| **Bâti — ouvrants et volets** | lois de tirage par usage et saison | (géométrie, pas apparence) | états d'ouverture | chez pix2hdr (`LOIS`) ; hors du premier lot côté Atlas |
| **Eau** | débit | `debit` d'un objet de contrôle | vaguelettes, niveau | chez pix2hdr (`experiments/eau`) ; plus tard |
| **Mobiles** | voie, gabarit, horaire | `anime-mobiles/0.1` | position le long de la voie | brouillon pix2hdr ; plus tard |

**Les fenêtres, précisément.** Une baie porte un attribut de sommet `_WIN`
(une graine par baie, dérivée de son identifiant par le contrat
`atlas-objets#seed` déjà partagé). Le bâtiment porte `usage` et
`n_logements`. À l'instant de la scène, `part_allumee` donne une part ; une
baie est allumée si `tirage(_WIN) < part`. Le même tirage se rejoue à
l'identique dans Blender et dans Atlas : le même immeuble montre les mêmes
fenêtres allumées dans le rendu et sur la carte. L'intérieur est une couleur
et une intensité émissives (`KHR_materials_emissive_strength`), jamais une
texture de pièce.

## 3. Émettre et recevoir la lumière

| Rôle | Objets | Porté par le glTF | Calculé par chaque lecteur |
|---|---|---|---|
| **Source ponctuelle** | luminaires | nœud émetteur `KHR_lights_punctual` : position, axe, cônes | intensité, couleur, état — depuis la fiche EclExt et l'horloge (l'audit a relevé un facteur 2,28 entre les conversions de Blender et de pix2hdr : l'intensité n'est jamais figée dans le fichier) |
| **Surface émissive** | fenêtres | matériau émissif, `_WIN` | part allumée, couleur, intensité |
| **Récepteur** | sol, bâti, végétation | rien de plus | ombres et éclairement — natifs chez pix2hdr ; dans Atlas, natifs dès que le fond est la maquette en tuiles (rendue par three.js), calculés sinon |

## 4. Le format des objets

- **glTF 2.0**, compressé : `EXT_meshopt_compression`, `KHR_texture_basisu`,
  `KHR_mesh_quantization` (déjà lus par Atlas) ; plus `KHR_lights_punctual`
  (émetteurs) et `KHR_materials_emissive_strength` (fenêtres).
- **Attributs de sommet** préfixés d'un souligné, déclarés par le contrat de
  la famille : `_PART`, `_PHEN`, `_TINT`, `_PIVOT` (végétation, existent) ;
  `_WIND` (végétation, à créer) ; `_WIN` (baies). three.js les expose en
  minuscules.
- **Pas d'animation cuite** (doctrine 2).
- **Repère** : les modèles d'objets sont locaux (origine au pied, Z vertical à
  l'export Blender, Y vertical à la lecture three.js) ; le placement vient des
  coordonnées de l'objet. Les **tuiles** ont besoin d'une transformation
  terrestre explicite — aujourd'hui absente (audit, question F).

## 5. Statuts de valeur : une liste fermée

| Statut | Sens |
|---|---|
| `mesure` | lue dans une donnée (LiDAR, photo calée), avec son incertitude |
| `observe` | constatée sur place ou sur photo, sans mesure |
| `referentiel` | lue telle quelle dans une source (BD TOPO, EclExt du gestionnaire, OSM) |
| `regle` | déduite d'une règle écrite, bornée par des normes |
| `simule` | produite par un comportement (état à un instant) |
| `a_verifier` | posée pour montrer, à confirmer |
| `inconnu` | absente ; correspond au `XX` d'EclExt |

Chaque valeur porte aussi `source` et `confiance` (0–1). Atlas les montre
dans la fiche : une valeur `regle` ne s'affiche pas comme une mesure.

## 6. Référentiels et vocabulaires

pix2hdr publie des **extraits accentués** (l'audit relève que
`normes/eclairage.json` porte des libellés sans accents et des
correspondances locales) : vocabulaire EclExt pour l'éclairage, usages BD TOPO
pour le bâti, essences pour la végétation. Atlas les lit tels quels pour ses
tables Grist, ses formulaires et ses légendes : une seule liste de valeurs par
notion.

## 7. Où vit le contrat, comment il change

- La spécification vit **chez pix2hdr** (`docs/SPEC-ATLAS-OBJETS-*.md`), comme
  aujourd'hui ; ce document en est la proposition d'évolution.
- Chaque contrat de comportement a sa référence Python et ses vecteurs chez
  pix2hdr ; Atlas les copie dans `tests/fixtures/` avec leur empreinte, et
  **ne les régénère jamais**.
- Un changement = une proposition sur le canal, puis des vecteurs. Un lecteur
  ancien ignore un contrat qu'il ne connaît pas et retombe sur le rendu
  ordinaire, sans erreur (règle §8 de la 0.1).

## 8. Décisions à prendre ensemble, maintenant

| # | Question | Proposition |
|---|---|---|
| 1 | `CS` / `LS` d'EclExt | coucher et lever **apparents** (−0,833°) partout ; tout autre seuil s'écrit en décalage explicite |
| 2 | `MN` (milieu de nuit) | milieu entre coucher et lever suivant |
| 3 | Horloge de scène | l'existante d'Atlas (date, heure, lieu) + `fuseau` de scène (heure locale du site) + date épinglable ; à l'échange, `instant` ISO avec décalage |
| 4 | Soleil de référence | vecteurs NOAA ; Atlas garde SunCalc si l'écart est négligeable, s'aligne sinon |
| 5 | Noms de familles | `vegetation`, `lighting`, `building` (anglais, comme la 0.1) |
| 6 | Clé de hauteur des luminaires | `height_class` h4 à h12, par seuils, sans mise à l'échelle |
| 7 | Émetteurs | glTF : position, axe, cônes ; intensité calculée par chaque lecteur |
| 8 | Fenêtres | `atlas-bati-fenetres/0.1` : `_WIN` + `part_allumee` existante, tirage par la graine commune |
| 9 | Statuts | la liste fermée du §5 |
| 10 | Vocabulaires | extraits accentués publiés par pix2hdr, lus tels quels par Atlas |

## 9. Ordre de marche proposé

1. Décisions du §8 sur le canal.
2. **pix2hdr** : références Python et vecteurs de `atlas-eclairage-profil/0.1`
   et `atlas-bati-fenetres/0.1`, soleil NOAA en vecteurs, extraits de
   vocabulaire. **Atlas** : fuseau de scène et date épinglable, heures solaires
   EclExt par `SunCalc.getTimes`, nuit dans le rendu (fin du voile CSS), puis `lib/eclairage-profil.js` et
   `lib/bati-fenetres.js` passés au bit près.
3. **pix2hdr** : premiers modèles de luminaires bâtis comme modèles d'origine
   et exportés en glTF avec leur nœud émetteur ; un bâtiment d'essai avec
   `_WIN`. **Atlas** : lecture de l'émetteur, fenêtres émissives.
4. Cas d'essai commun : le Jarret de nuit (mesures au luxmètre, luminaires du
   banc Marseille 2023) — le premier banc de validation nocturne des deux
   projets.
5. Plus tard : vent, eau, mobiles ; tuiles de la maquette en fond de plan dans
   Atlas, qui reçoivent lumière et ombres nativement.
