# Audit — pix2hdr et Atlas sur les objets 3D paramétriques

*24/09/2026. Audit en lecture seule du dépôt pix2hdr (et du dépôt voisin `Blender_servers`,
qui porte `gn_lib`), confronté au cadrage Atlas
`docs/CADRAGE-ECLAIRAGE-OBJETS-LUMINEUX.md`. Aucun fichier de pix2hdr n'a été modifié,
aucun script de pix2hdr n'a été lancé ; seules des lectures de fichiers et de JSON de sortie ont
été faites. Deux calculs de contrôle ont été refaits hors des deux dépôts (SunCalc vendorisé
d'Atlas, lu dans un dossier temporaire).*

## Conventions de lecture

- **Chemins.** `pix2hdr/…` = dépôt pix2hdr ; `Blender_servers/…` = dépôt voisin qui porte
  `docker/blender-canvas/gn_lib/` ; `Atlas/…` = `Widgets Grist/projects/Atlas/` ;
  `atlas-app/…` = `Widgets Grist/packages/atlas-app/`.
- **(V)** : vérifié dans le fichier cité, à la ligne citée, pendant cet audit.
  **(NV)** : non vérifié — affirmation reprise d'un document sans contrôle, ou déduction.
- **(C)** : recalculé pendant l'audit (calcul reproductible, décrit).

---

## 1. Ce que pix2hdr sait faire, par famille

### 1.1 Éclairage public — `pix2hdr/experiments/eclairage/`

Deux briques : `normes/` (schéma, vocabulaire, bandes, règles) et `generation/` (détection,
mesure, géométrie, comportement, rendu). La seconde lit la première sans la réécrire
(`generation/README.md:13-15`) (V).

| Aspect | État réel | Source |
|---|---|---|
| **Référentiels lus** | nationaux seulement : OSM, BD TOPO, LiDAR HD, Panoramax, arrêté du 27/12/2018, NF EN 13201 ; le jeu « Marseille – Éclairage 2023 » n'est qu'un banc de validation | `generation/README.md:17-24` ; `normes/eclairage.json:1693` (V) |
| **Vocabulaire EclExt 1.1 + StaR-Elec 1.01** | listes `usage`, `typeSource`, `structure`, `support`, `eclairageAdaptatif`, `grandeurVariation`, `formatVariation`, `statut`, `format_horaire` ; plus StaR-Elec et classes EN 13201 | `normes/eclairage.json:251-430` (V) |
| **Schéma d'objet** | `schema_point_lumineux` (attributs EclExt avec `statut_attendu`), `schema_profil_nocturne`, `schema_support` | `normes/eclairage.json:544-748`, `749-790` (V) |
| **Statuts de valeur** | cinq natures : `observe`, `mesure`, `propage`, `regle`, `herite` | `normes/eclairage.json:8-14` (V) |
| **Bandes de plausibilité** | hauteur de feu par catégorie : mât [3,5 ; 10], poteau [6 ; 11,5], applique [3 ; 8], axial [5,5 ; 9], borne [0,5 ; 1,2], projecteur sur mât [4 ; 14] ; mât mesuré q05 = 4,55, médiane 5,20, q95 = 9,20 m | `normes/eclairage.json:1115-1144`, `1258-1263` (V) |
| **Points lumineux** | 88 détectés sur Longchamp ; 56 hauteurs de feu mesurées, 32 posées à la médiane de bande (`regle`) ; 1 421 points posés par règle (mâts, appliques, projecteurs), marqués « à vérifier » | `generation/README.md:70-73` (V) ; `out/photometrie.json`, clé `bilan` (V) |
| **Détection mesurée** | rappel 6,6 %, précision 55,7 % contre le banc ; inclinaison de crosse déclarée non mesurable | `generation/README.md:192-211`, `356-375` (V) |
| **Géométrie** | quatre familles (`mat`, `applique_facade`, `axial_suspendu`, `projecteur`) construites **en numpy, sans Blender ni Geometry Nodes**, posées **à leur place** dans le repère Lambert-93 local, fusionnées en **deux OBJ** (détectés / règle) ; la vitre inférieure du luminaire (`eclairage_vitre`, `Ke` dans le `.mtl`) est placée à la hauteur de feu | `generation/maillage.py:1-66`, `178-204`, `388-446` (V) |
| **Paramètres photométriques** | tous au statut `regle` : flux par la règle du flux utile, puissance = flux / 110 lm/W, température 2 700 K (locale, parc, mise en lumière) ou 3 000 K (grand axe, desserte), ULR posé à **0,5 %**, cône de demi-angle 70°/65°/90°/25° selon la classe ; fichier IES absent (`null`) | `generation/photometrie.py:71-95`, `116-173` (V) |
| **Profils nocturnes** | écrits au format EclExt : `voirie_A` (`+0CS` → `+0LS`, plage `F` à 50 % de 23:30HL à 05:30HL) et `mise_en_lumiere_B1` (`+0CS` → `01:00HL`, plage `EX` de `01:00HL` à `+0LS`) | `generation/photometrie.py:177-207` (V) |
| **Calcul d'état** | `etat(instant_utc, profil)` **ne lit pas les chaînes EclExt** : seuils et heures sont codés en dur — voirie allumée si soleil < −6°, mise en lumière si soleil < −0,833° ; abaissement 23:30–05:30 ; extinction B1 entre 01:00 et 12:00 | `generation/photometrie.py:61-67`, `214-236` (V) |
| **Soleil** | NOAA de `experiments/shadows`, en **un point fixe** (43,3049 N ; 5,3947 E) ; heure légale par règle maison | `generation/common.py:70-72`, `456-495` (V) |
| **Rendus** | Cycles, lampes créées **au rendu** depuis un JSON (pas dans la géométrie) : puissance Blender = flux / 300 × niveau, couleur Tanner Helland, spot de taille 2 × demi-angle, `spot_blend` 0,35 ; vitres émissives | `generation/rendu_blender.py:31`, `55-66`, `91-133` (V) |
| **Export vers Atlas** | **aucun** : pas de catalogue `atlas-objets`, pas de glTF, pas de couche dans la scène Atlas ni dans les tuiles ; l'étape n'est pas dans la chaîne d'exploitation | `pix2hdr/docs/generated/catalogue.md:157-172` (V) ; `experiments/atlas/out/scene.json` : 0 occurrence de « eclairage » (V) |

### 1.2 Végétation — `Blender_servers/…/gn_lib/`, `pix2hdr/experiments/vegetation_gltf/`

| Aspect | État réel | Source |
|---|---|---|
| **Générateur** | groupe Geometry Nodes `GN_TPL_TreeParametric` | `Blender_servers/…/gn_lib/tree.py:22` (V) |
| **Référentiels** | SESAME (profils d'essence, licence non vérifiée : usage interne), OSM, LiDAR HD | `pix2hdr/docs/CADRAGE-GENERATEUR-VEGETATION.md:34-37`, `186` (V) |
| **Catalogue `atlas-objets/0.1`** | v0 à v3 sur disque ; v3 = version 0.1.3, 5 essences × 3 classes d'âge × 4 variantes × 2 niveaux de détail = 120 GLB, textures KTX2 partagées, meshopt | `pix2hdr/docs/PROPOSITIONS-ATLAS-OBJETS-0.2-BROUILLON.md:230-252` (V) ; `experiments/vegetation_gltf/catalogue_platane_v3/catalog.json` (V) |
| **Âge** | **déjà au contrat** : mesure `select` sur `circumference` (m, seuils 0,6 / 1,8 → `young` / `adult` / `old`), défaut `adult`, dans les catalogues v1 à v3 | `catalogue_platane_v3/catalog.json:140` (V) ; lu et testé par Atlas : `Atlas/lib/catalogue-objets.js:161-163`, `Atlas/tests/catalogue-objets.test.js:107-109` (V) |
| **Comportement** | saison `atlas-vegetation-season/0.1` (`uFoliage`, `uAutumn`), référence `objseason.py` + 96 vecteurs ; graine `objseed.py` ; taxon `objtaxon.py` (brouillon 0.2) ; `_WIND` à créer | `Blender_servers/…/gn_lib/objseason.py:1-59` (V) ; `pix2hdr/docs/SPEC-ATLAS-OBJETS-0.1.md:188-241` (V) |
| **Export** | `export_gltf.py` n'exporte ni lumières ni `extras` (`export_extras=False`, `export_lights` absent donc faux par défaut) | `Blender_servers/…/gn_lib/export_gltf.py:258-263` (V) ; défaut `export_lights=False` dans l'exportateur de Blender 5.1 installé (V) |
| **Dans Atlas** | catalogue v2 essayé à Notre-Dame-du-Mont ; 490 arbres de la scène `experiments/atlas` instanciés sur le catalogue v3 | `PROPOSITIONS…:10-14` (V pour le texte) ; `pix2hdr/experiments/atlas/README.md:142-147` (V) |

### 1.3 Mobilier et autres objets

| Famille | État réel | Source |
|---|---|---|
| **Mobilier** (`experiments/objets`) | inventaire par croisement LiDAR / OSM / Panoramax / photo ; générateurs numpy sans `bpy` : banc, corbeille, **lampadaire (gabarit 5 m, crosse 0,6 m)**, potelet, borne, mât, abri, jeu, arceaux, vases, kiosque… ; export OBJ (Z en haut) et GLB (Y en haut) **par zone**, pas par type | `experiments/objets/README.md:15-39` ; `generateurs.py:121-212` (V) |
| Inventaire v1 | Z1 : 231 potelets, 68 bancs, 29 corbeilles, 16 lampadaires… ; Z2 : 70 bancs, 21 lampadaires, 16 vases… | `experiments/objets/out/objets_Z1_cassini.json`, `objets_Z2_palais.json` (V, décompte par `type`) |
| Vers le catalogue | **brouillon** de types mobilier pour `atlas-objets` (banc, corbeille, lampadaire, potelet, borne…), clé `style`, objet unique par `seed: ref` | `experiments/objets/SCHEMA-OBJETS-URBAINS-BROUILLON.md:9-67` (V) |
| **Transports** | tram T2 paramétrique (axes, rail, quais, ligne de contact) en OBJ ; potelets de plateforme non résolus au LiDAR | `experiments/transports/README.md:1-9`, `381-389` (V) |
| **Câbles** | 371 supports dont 328 hauteurs LiDAR, portées en chaînette ; **sous-produit** sans couche de maquette | `experiments/cables/README.md:1-8`, `53-58` ; `normes/correspondance.md` §1 (V) |
| **Signalisation** | générateurs et règles présents | `experiments/signalisation/` (NV : non lu en détail) |
| **Degré atteint** | mât d'éclairage : gabarit sans photo de rue, forme mesurée avec ; luminaire : gabarit, plafond ; banc : gabarit ; potelet : absent sans photo | `experiments/blocages/out/entites_jusqu_ou.csv:27-32` (V) |
| **Normes du mobilier** | aucun géostandard CNIG « mobilier urbain » : OSM reste le vocabulaire de correspondance | `experiments/conformite/README.md:593` (V) |

### 1.4 Comportements et conditions de scène

- Soleil NOAA à 0,1°, saison par jour de l'année, éclairage public par seuils −6° et −0,833°,
  fenêtres allumées par `regime_de(elevation)` (sigmoïde centrée sur −2°) :
  `experiments/anime/structure/README.md:775-786` (V).
- Proposition pix2hdr d'une **horloge commune datée** `{instant_initial ISO 8601 avec fuseau,
  duree_s, pas_s}`, et d'une entrée `scenario` optionnelle dans `tuile/0.1` :
  `experiments/anime/structure/README.md:459-495` ; `contrat_mobiles_0.1.json:218` (V).
- La météo n'existe pas ; un jour couvert avancerait l'allumage, le modèle ne connaît que
  l'élévation solaire : `experiments/anime/structure/README.md:814-829` (V).

### 1.5 Tuiles de la maquette

- Tuilage **Lambert-93 aligné sur la dalle IGN**, quadtree 1 000 → 125 m, identifiant
  `L93-<n>-<ix>-<iy>` : `experiments/service/README.md:58-81` (V).
- **3D Tiles 1.1 + glTF**, `EXT_mesh_features` par sommet, attributs en `objets.json` à côté,
  pas de texture (couleur par famille de matériau) : `README.md:161-247`, `277-304` (V).
- Le `tileset.json` est **en repère local** (Y en haut) : le géoréférencement est dans
  `asset.extras` (`crs`, `origine_l93`, `origine_wgs84`), sans `transform` ECEF à la racine
  (`experiments/service/out/tuiles/tileset.json`, lu) (V). Un client 3D Tiles standard ne
  saurait donc pas le placer sans adaptation (NV : déduction de la spécification 3D Tiles).
- Extrapolation **France entière** : ~1,0 To au niveau 3 (1,9 To pyramide comprise), 34,8 M de
  tuiles ; l'arbre explicite ne passe pas l'échelle, le tuilage implicite est l'étape 2 :
  `README.md:478-537`, `662-670` (V). Chiffre marqué fragile par son auteur (zone monumentale).
- **Atlas n'a pas de client 3D Tiles** ; la scène `experiments/atlas` a choisi un GLB par
  couche sur une ancre commune, erreur de replacement < 1 m sur l'emprise, et demande une ancre
  par dalle pour passer à l'échelle : `experiments/atlas/README.md:52-57`, `61-89`, `470-478` (V).
- La maquette assemblée et la scène Atlas sont **à usage interne** (ODbL et CC BY-SA mêlées) :
  `pix2hdr/docs/SYNTHESE/02-produits-et-services.md:850-857` (V).
- Aucune couche d'éclairage public dans les tuiles (`service/couches.py` : 0 occurrence) (V).

---

## 2. Les six questions ouvertes

### A. Sens de `CS` et `LS`

**Aujourd'hui dans pix2hdr.**
- Le standard, tel que pix2hdr le recopie : `CS` = « décalage en minutes par rapport au
  coucher du soleil », `LS` = lever (`normes/eclairage.json:347-349` ;
  `normes/README.md:247-249`) (V). L'arrêté de 2018, recopié : mise en lumière allumée « au
  coucher du soleil » (`eclairage.json:1419-1440`) (V).
- Le calcul, lui, allume la **voirie** à −6° (crépuscule civil) et l'éteint au **matin civil**
  (−6° aussi), mais allume la **mise en lumière** à −0,833° (`photometrie.py:61-62`, `223`,
  `229`) (V). **La même chaîne `+0CS` produit donc deux instants différents selon le profil**,
  à l'intérieur de pix2hdr. Le décalage est avoué en commentaire (`photometrie.py:183-186`) (V).
- Écart mesuré : 28 à 35 min le soir, autant le matin, au 21 de chaque mois
  (`out/photometrie.json`, `calendrier.le_21_de_chaque_mois`) (V) ; SunCalc au Jarret donne
  28,5 à 35,7 min (C). Le chiffre « 20 à 40 minutes » du cadrage est donc à remplacer par
  « ~30 min, 28 à 36 min selon la saison à Marseille ».
- Les 3 921 h/an d'allumage de voirie (`generation/README.md:127`) sont calculées au seuil −6°
  (`photometrie.py:244`) (V) : elles changeront si le sens change.

**Proposition compatible.** `CS` et `LS` = coucher et lever **apparents**, soleil à −0,833°
(réfraction standard), pour les deux projets et tous les profils. SunCalc les fournit
(`sunset`, `sunrise`) ; le NOAA de pix2hdr aussi (`passage_seuil(jour, -0.833)`,
`common.py:482-495`) (V). Un allumage au crépuscule s'écrit par un décalage explicite
(`+30CS`, `-30LS`) et le profil le dit ; un décalage constant ne suit pas exactement le
crépuscule (28 à 36 min) et c'est acceptable pour une règle. Côté pix2hdr : `etat()` doit
lire les chaînes au lieu des seuils codés en dur (voir le plan, étape 1).

### B. « Milieu de nuit » (`MN`)

**Aujourd'hui.** Le standard nomme `MN` sans le définir ; pix2hdr ne le définit pas plus
(`eclairage.json:347` ; `normes/README.md:249`) (V) et **ne s'en sert pas dans le calcul** :
son abaissement « de milieu de nuit » est écrit en heures locales fixes, 23:30HL–05:30HL
(`photometrie.py:63-64`, `188-191`) (V). Ailleurs, pix2hdr **propose** un profil
`voirie_standard` avec abaissement de `-120MN` à `+120MN` et allumage `-15CS` / `+15LS`
(`normes/correspondance.md:150-156`) (V) : deux profils de voirie différents coexistent donc
dans le même dépôt.

**Contrôle (C).** Au Jarret, le milieu entre coucher (J) et lever (J+1) et le nadir solaire
(`SunCalc.getTimes().nadir`) diffèrent de **moins d'une minute** (−36 à +55 s sur cinq dates de
2026). En heure légale, `MN` tombe vers 00:38–00:49 en hiver et 01:41 en été : ce n'est **pas**
minuit, ce qui change le sens de toute plage écrite en `MN`.

**Proposition compatible.** `MN` = milieu entre le coucher apparent (−0,833°) du soir de la
nuit considérée et le lever apparent du lendemain. Choisi plutôt que le nadir parce qu'il ne
dépend que de `CS` et `LS` déjà définis, et que les deux implémentations le calculent de la
même façon ; l'écart au nadir (< 1 min) est documenté. « La nuit considérée » : celle qui
contient l'instant ; avant le lever du matin, c'est la nuit commencée la veille. À confirmer
auprès du CNIG, comme le dit le cadrage (`Atlas/docs/CADRAGE-…:246-248`) (V).

### C. Nœud émetteur glTF

**Aujourd'hui dans pix2hdr.** Aucun glTF d'éclairage, aucun nœud émetteur : les lampes sont
créées par `rendu_blender.py` au moment du rendu, à partir d'un JSON (position au point de
feu, azimut et inclinaison de crosse, flux, température, demi-angle), et les OBJ ne portent
qu'une face émissive (`maillage.py:187` ; `rendu_blender.py:91-118`) (V). Conversions
posées : puissance Blender = flux / 300 lm/W, spot de taille 2 × demi-angle, `spot_blend` 0,35,
rayon de source 0,12 m (`rendu_blender.py:31`, `102-107`) (V). pix2hdr a déjà écrit que
`KHR_lights_punctual` ne porte qu'un cône et qu'il existe un piège d'unités entre Blender et le
web (`eclairage.json:1568`) ; que three.js ne restitue pas une photométrie routière
(`IESSpotLight` 1D, `eclairage.json:1562-1566`) ; qu'`EXT_lights_ies` est inexploitable
(`eclairage.json:1569`) (V).

**Ce que font les deux outils (V).**
- Exportateur glTF de Blender (5.1 installé ; pix2hdr cible Blender 4.0.2, non vérifié sur
  cette version) : en mode `SPEC` (défaut), intensité (cd) = W / (4π) × 683 pour un spot comme
  pour un point ; `outerConeAngle` = `spot_size` / 2 ; `innerConeAngle` = outer × (1 −
  `spot_blend`) (`io_scene_gltf2/blender/exp/lights.py:136-157`, `light_spots.py:28-47`).
- `GLTFLoader` r160 (vendorisé par Atlas) : `angle` = outer, `penumbra` = 1 − inner/outer,
  `decay` = 2, `distance` = `range` ou 0, cible à (0, 0, −1) du nœud, `extras` recopiés dans
  `userData` (`atlas-app/www/vendor/three-addons/loaders/GLTFLoader.js:569-610`). three r160 est
  en unités physiques par défaut (`_useLegacyLights = false`, `three.module.js:28543`) ; pour un
  `SpotLight`, `power` = intensité × π par **convention** (`three.module.js:44475-44486`), pas
  par l'angle solide du cône.

**Conséquence chiffrée (C).** Avec la convention de pix2hdr (W = Φ / 300), l'exportateur
écrirait I = Φ × 683 / (300 × 4π) ≈ 0,181 Φ ; une source isotrope vaut Φ / 4π ≈ 0,080 Φ
(facteur 2,28 de trop), un cône uniforme de 70° vaut Φ / (2π(1 − cos 70°)) ≈ 0,242 Φ. Aucune de
ces trois valeurs ne coïncide : **l'intensité ne doit pas transiter par la conversion de
l'exportateur.**

**Proposition compatible.**
1. Le glTF porte la **géométrie de l'émission**, pas sa puissance : un nœud par source, nommé
   `emetteur_<k>` (k = 0, 1… pour une crosse double), placé au centre de la vitre (à
   `height_m` du pied, comme le fait déjà `maillage.py`), axe −Z du nœud = axe du faisceau,
   extension `KHR_lights_punctual` de type `spot` (ou `point` pour une boule de parc à 90°),
   `outerConeAngle` = demi-angle de la classe, `innerConeAngle` fixé par une règle écrite (par
   exemple 0,65 × outer, soit `spot_blend` 0,35 comme dans `rendu_blender.py:107`),
   `intensity` = valeur **nominale** documentée (1 cd), `extras` :
   `{ "emetteur": k, "demi_angle_deg": …, "ulr": … }`.
2. **Atlas calcule l'intensité** depuis la fiche EclExt du point : I = Φ_lum / Ω(outer), avec
   Φ_lum = `fluxLuminaire`, à défaut `puissance` × efficacité type de `typeSource`, multiplié par
   le facteur de flux du profil ; couleur depuis `temperatureCouleur` puis `TC`. pix2hdr fait
   **le même calcul** dans ses rendus pour que les deux voies partent des mêmes candelas
   (la conversion W ↔ cd de Blender reste son affaire interne, écrite).
3. Export Blender : `export_lights=True`, `export_extras=True`, mode `SPEC`, et un test
   d'aller-retour sur un luminaire d'essai (angles et axe lus par `GLTFLoader`). C'est le point
   « à éprouver » n° 2 du cadrage (`Atlas/docs/CADRAGE-…:242-243`).

### D. Clé de fichier pour la hauteur et bornes de classes

**Aujourd'hui.** pix2hdr ne met rien à l'échelle : chaque mât est **construit** à sa hauteur de
feu, diamètres liés à la hauteur (`D_pied = 0,075 + 0,009 h`, conicité 0,62)
(`maillage.py:82-83`, `207-258`) (V). Hauteurs de règle : plancher 4,5 / 6 / 8 m selon la
classe de voie, plafond `H_MAX_M` (`implantation.py:76`, `134`) (V). Bandes :
`eclairage.json:1115-1144` (V). Le schéma 0.1 nomme ses clés en anglais (`age_class`,
`variant`, `lod`) et ses familles aussi : **`lighting`** existe déjà dans l'énumération
`family` (`pix2hdr/docs/schemas/atlas-objets-0.1.schema.json:313-322`) (V).

**Proposition compatible.**
- Famille **`lighting`** (pas `eclairage`), bloc de famille `lighting` (à ajouter au schéma :
  `additionalProperties: false` sur le type l'exige, `schema.json:308`) (V).
- Clé discrète **`height_class`**, valeurs `h4`, `h6`, `h8`, `h10`, `h12` (hauteur nominale de
  l'asset = 4, 6, 8, 10, 12 m, portée par `height_m`), mesure `select` sur
  `from: ["hauteurFeu", "height"]`, `unit: m`, `clamp: [3, 14]`, seuils
  `[[5, "h4"], [7, "h6"], [9, "h8"], [11, "h10"], [null, "h12"]]`, défaut `h6` (la médiane
  mesurée est 5,20 m, `eclairage.json:1260`). Erreur de hauteur ≤ 1 m, lisible à l'écran.
- **Aucune mesure `scale` sur la hauteur** pour cette famille : elle agrandirait la lanterne
  avec le mât (§5 de la spec : la mesure remplace le tirage, `SPEC…:147-152`) (V). Le mât
  étiré (`axis: vertical`) n'étire pas seulement le fût ; il est à écarter pour les luminaires.
- La graine n'agit pas sur l'échelle d'un luminaire : le type déclare `variants` mais la
  mesure `select` fixe la hauteur ; il faut préciser que le tirage `scale` ne s'applique pas
  (ajout 0.2 : `scale_draw: false`, ou règle de famille). Sinon Atlas appliquerait
  0,9 à 1,1 sur tout luminaire sans hauteur (`Atlas/lib/catalogue-objets.js:243-245`) (V).
- Bandes spécifiques : applique [3 ; 8] → `h4`/`h6`/`h8` seulement ; borne → type distinct
  (`structure` = `BOR`), pas une classe.

### E. `normes/eclairage.json` comme source unique des listes

**Aujourd'hui.** Le fichier est écrit « pour `experiments/eclairage/generation` »
(`eclairage.json:3-7`), version `0.1`, avec le repère local de Longchamp, la correspondance
des catégories Ville de Marseille (`:977`) et des bandes calées sur des mesures locales ;
ses libellés sont **sans accents** (« eclairage exterieur de securite… », `:253-268`) (V).

**Proposition compatible.** Oui pour une **source unique**, non pour une lecture « telle
quelle » du fichier entier. pix2hdr publie un extrait neutre et versionné,
`eclext-vocabulaire/1.1` (codes, libellés accentués du standard, source et article, codes
`AU`/`XX`), produit depuis `eclairage.json` ; Atlas le copie dans `tests/fixtures/` comme les
vecteurs de graine, et en tire les listes Choice des tables Grist et des formulaires. Les
bandes restent chez pix2hdr (contrôle de plausibilité à la production) ; Atlas n'en lit que
ce dont il a besoin pour signaler une valeur invraisemblable, avec leur statut.

### F. Tuiles de la maquette en fond de plan

**Aujourd'hui.** Voir §1.5 : tuiles 3D Tiles 1.1 + glTF en repère local, arbre explicite,
attributs à côté, pas de texture, pas d'éclairage public, usage interne ; aucun client côté
Atlas (V).

**Ce qui est vrai dans le cadrage** : des tuiles rendues dans three.js recevraient lumière et
ombres des luminaires (`Atlas/docs/CADRAGE-…:213-216`) — c'est la bonne cible.
**Ce qui manque pour y arriver** : (1) un géoréférencement lisible par Atlas — une ancre WGS84
**par tuile** (le seul chiffre de précision publié en dépend : < 1,5 m avec une ancre par dalle
kilométrique, `experiments/atlas/README.md:476-478`) ; (2) un chargeur côté Atlas : d'abord une
tuile comme GLB ancré (mécanisme déjà utilisé par la scène `experiments/atlas`), ensuite un
client 3D Tiles (NV : compatibilité d'une bibliothèque tierce avec three r160 à éprouver) ;
(3) le passage au tuilage implicite et à meshopt côté pix2hdr, déjà dans sa feuille de route
(`service/README.md:664-670`) ; (4) un budget de lumières : un `SpotLight` éclaire tout le
maillage des tuiles, et chaque ombre coûte une passe (`Atlas/docs/CADRAGE-…:217-223`).

---

## 3. Correspondances et interopérabilités

| Échange | Produit par | Lu par | Format | État | Premier pas |
|---|---|---|---|---|---|
| Catalogue d'objets, végétation | pix2hdr (gn_lib) | Atlas | `catalog.json` `atlas-objets/0.1` + GLB | **existe** (v2 essayée, v3 prête) | trancher les points B, C, E du brouillon 0.2 (`PROPOSITIONS…:308-312`) |
| Catalogue d'objets, éclairage | pix2hdr | Atlas | même contrat, famille `lighting`, glTF + nœud émetteur | **manque** (géométrie existe en OBJ placé) | un type `LANT`/`MAT`, 3 classes `h4`/`h6`/`h8`, 1 variante, 1 niveau de détail |
| Catalogue d'objets, mobilier | pix2hdr (`experiments/objets`) | Atlas | même contrat, famille `furniture` | **brouillon** (`SCHEMA-OBJETS-URBAINS-BROUILLON.md`) | aligner `seed_ref` : chaîne `<referentiel>:<champ>` (schéma 0.1) et non objet (brouillon, ligne 22) |
| Graine | les deux | les deux | `objseed.py` / `graine.js` + vecteurs | **existe**, au bit près | rien |
| Saison | pix2hdr | Atlas | `objseason.py` + 96 vecteurs | **existe** (lecture Atlas), shader non fait | rien côté contrat |
| Âge de la végétation | pix2hdr (catalogue) | Atlas | mesure `select` `age_class` sur `circumference` | **existe** et testé des deux côtés | ajouter, si voulu, une source « date de plantation » (nouvelle `parse`, 0.2) |
| Contrat de comportement éclairage | pix2hdr (référence) | Atlas (`lib/eclairage-profil.js`) | `atlas-eclairage-profil/0.1` : règles écrites + vecteurs JSON | **manque** : `etat()` code les seuils en dur | écrire la règle et 30 cas avant tout code (plan, étape 1) |
| Vecteurs de test éclairage | pix2hdr | Atlas `tests/fixtures/` | JSON `{profil, plages, lat, lon, fuseau, instant} → {allume, facteurFlux, facteurPuissance, tc, plage}` | **partiel** : 8 états types (4 instants × 2 profils), niveau seul, seuil −6° | régénérer après A et B, inclure 30 %, `VA`, `TC`, `EX`, minuit, changement d'heure |
| Statuts de valeur | pix2hdr (toutes sorties) | Atlas (fiche, légende) | `{valeur, statut, source, confiance}` | **partiel** : statut en texte libre préfixé (« regle (bandes…) », « regle (a verifier) », « detecte ») | énumération fermée à deux axes (§4, risque 7) |
| Vocabulaire EclExt | pix2hdr (`normes`) | Atlas (Grist, formulaires) | `eclext-vocabulaire/1.1` | **existe dans un fichier interne**, sans accents | extrait publié (réponse E) |
| Points lumineux (positions, attributs) | pix2hdr (Longchamp) ; gestionnaire, OSM, terrain (Jarret) | Atlas ; pix2hdr pour validation | GeoJSON WGS84, champs EclExt + statut par champ | **manque** : sorties pix2hdr en Lambert-93 local (`e`, `n`, `sol_u`), azimuts de grille | export GeoJSON EclExt des 88 points détectés de Longchamp |
| Mesures d'éclairement | Atlas (campagne du Jarret, `Mesures_eclairement`) | pix2hdr | CSV/JSON par série | **manque** ; pix2hdr n'a aucune validation de nuit (`generation/README.md:256-261`, `461`) | proposer les 9 relevés du Jarret comme premier banc de nuit |
| Conditions de scène | Atlas (réglages), pix2hdr (scénario) | les deux | `{instant ISO 8601 avec fuseau IANA, lat, lon}` | **partiel** : Atlas a date + minutes, pix2hdr un point fixe | adopter l'horloge datée de `contrat_mobiles_0.1.json:218` |
| Scène Atlas de la maquette | pix2hdr (`experiments/atlas`) | Atlas | Scene Manifest 0.2.2, GLB par couche | **existe**, usage interne ; `famille = "inconnu"` sur les 441 objets de `objets-v2.objets.json` (V) | corriger l'export des familles avant de s'en servir comme correspondance |
| Tuiles de fond | pix2hdr (`experiments/service`) | Atlas | 3D Tiles 1.1 + glTF + `objets.json` | **manque** côté Atlas ; géoréférencement en `extras` | une tuile chargée comme GLB ancré, éclairée par un luminaire d'essai |

---

## 4. Divergences et risques

1. **`CS` à −6° dans le calcul, coucher dans la chaîne** (`photometrie.py:61`, `181`, `229`)
   (V). Aggravé par l'incohérence interne voirie / mise en lumière. Tant que ce n'est pas
   tranché, aucun vecteur n'est utilisable.
2. **Trois profils de voirie** : `voirie_A` (`photometrie.py:178-193`), `voirie_standard` et
   `voirie_extinction_coeur_de_nuit` (`correspondance.md:152-153`) (V). À réduire à une liste
   canonique, reprise telle quelle dans les vecteurs.
3. **Point solaire fixe** (`common.py:70`) (V) : sans effet mesurable au Jarret (3 km), faux à
   l'échelle nationale. La référence doit prendre `lat`, `lon` en entrée.
4. **Heure légale maison** : le passage à l'heure d'été bascule à 00:00 UTC du dernier dimanche,
   au lieu de 01:00 UTC (`common.py:467-479`) (V). Côté Atlas, `sunPosition()` pose l'heure
   dans le **fuseau du navigateur** (`Atlas/app_v7.js:2371-2386`, `d.setHours`) (V) : `HL`
   d'EclExt est l'heure du site. Les vecteurs doivent porter un fuseau IANA (`Europe/Paris`).
5. **Sens du pourcentage** : `F` à `%`, valeur 50 — « à 50 % de la référence » d'après le
   vocabulaire (`eclairage.json:330`) (V). Tous les exemples actuels valent 50, où « réduit à »
   et « réduit de » coïncident : un vecteur à 30 % est indispensable.
6. **Unités d'intensité** : 683 lm/W chez l'exportateur Blender, 300 lm/W chez pix2hdr
   (facteur 2,28), convention `power = πI` chez three (§2 C) (V).
7. **Statuts** : trois vocabulaires — cinq natures des normes (`eclairage.json:8-14`),
   `grandeur()` avec `provisoire` (`common.py:106-113`), et l'état de vérification du contrat
   `Source` (`verifie`, `presomption_haute`, `a_verifier`, `service/README.md:40`) (V) ; dans les
   sorties, du texte libre. Proposition : `statut` ∈ {observe, mesure, propage, regle, herite}
   + `verification` ∈ {verifie, presomption_haute, a_verifier} + `motif` libre.
8. **Azimuts de grille** : les crosses sont orientées en Lambert-93 (`common.py:501`,
   `azimut_grille`) (V) ; Atlas oriente en azimut vrai (`rotationZ`). Convergence −1,74° à
   Longchamp (`experiments/atlas/README.md:69`) (V). Tout azimut échangé doit être vrai, ou
   déclaré « de grille ».
9. **Repère et axes** : OBJ en Z en haut, repère local L93 ; glTF en Y en haut
   (`experiments/objets/README.md:38`) (V). Un luminaire de catalogue doit être posé à
   l'origine, pied en (0, 0, 0), sans translation de site.
10. **Licences** : SESAME en usage interne (`SPEC…:248-249`), géométries dérivées d'OSM sous
    ODbL, fontaine sous CC BY-SA ; maquette et scène à usage interne (§1.5) (V). Le jeu Ville de
    Marseille 2023 (Licence Ouverte) est utilisable par Atlas pour le document du Jarret, pas
    par le générateur de pix2hdr (doctrine) (V).
11. **Seuil de luminosité, pas d'heure** : un jour couvert allume plus tôt ; aucun des deux
    projets ne le modélise (`anime/structure/README.md:821`) (V). À déclarer comme limite, pas
    à corriger maintenant.
12. **Débord des tuiles** jusqu'à 30,5 m, boîtes non élargies (`service/README.md:646-649`)
    (V) : un chargeur qui trie par boîte peut couper un objet.

### Ce qui, dans le cadrage Atlas, est faux, imprécis ou redondant

| Passage du cadrage | Ce que disent les fichiers |
|---|---|
| « la **référence Python** du lot E1 existe » (`CADRAGE-…:66`) | **Faux** : `etat()` ne lit ni `CS`, ni `LS`, ni `MN`, ni les plages ; il code seuils et heures (`photometrie.py:214-236`). La référence reste à écrire ; les 8 `etats_types` n'en sont qu'un germe, calculé à −6°. |
| « le lot E3 n'est pas à inventer : c'est l'**export** de ces familles » (`:65`) | **Sous-estimé** : la géométrie est générée en numpy, posée au site, fusionnée dans un OBJ unique ; pas de gabarit à l'origine, pas de classes, pas de glTF, pas de nœud émetteur (`maillage.py:178-204`, `388-446`). Il faut un mode « gabarit » et un export. |
| « Blender bâtit les modèles et exporte le nœud émetteur » (`:197`) | Aujourd'hui Blender **ne bâtit pas** les luminaires ; il les rend (`rendu_blender.py:140-143`). |
| « photométrie par règle (… 3 000 K, ULR 1 %) » (`:67`) | 2 700 K pour locale, parc, mise en lumière ; ULR **posé à 0,5 %**, le 1 % est le plafond (`photometrie.py:78-92`, `150`). |
| ouverture du cône réglée par `cie3` (`:192`) | **Faux** : `cie3` est une **fraction de flux** (dans 75,5° / hémisphère inférieur, `eclairage.json:664-669`), pas un angle. Le demi-angle vient de la classe (`photometrie.py:71-88`). |
| écart CS « de 20 à 40 minutes » (`:73`) | 28 à 36 min à Marseille (§2 A). |
| famille « eclairage », clé « hauteur_classe » (`:37-38`) | Le schéma nomme déjà la famille `lighting` et ses clés en anglais (§2 D). |
| référence dans `gn_lib/objeclairage.py` (`:40`) | `gn_lib` appartient à `Blender_servers`, qui n'a **rien** sur l'éclairage (recherche « lampadaire », « luminaire », « KHR_lights » : aucun résultat) (V). L'emplacement est un choix à faire, pas un existant. |
| V1 : « il manque les mesures qui la choisissent » (`:50-53`, `:236`) | **Redondant** : la mesure `select` sur `circumference` existe dans les catalogues v1 à v3 et Atlas la lit et la teste (§1.2). Reste la date de plantation (nouveau `parse`) et la donnée elle-même. |

---

## 5. Plan d'interopérabilité (éclairage d'abord)

| # | Étape | pix2hdr fait | Atlas fait | Contrôle |
|---|---|---|---|---|
| 0 | **Décisions** (une séance, GO de Nicolas) | propose le texte des réponses A, B, D (§2) et l'énumération des statuts | idem ; corrige son cadrage (§4, tableau) | réponses écrites sur le canal et dans un brouillon `atlas-objets` 0.2 |
| 1 | **Contrat `atlas-eclairage-profil/0.1`** | écrit la règle (lecture des chaînes `HL`/`TU`/`MN`/`CS`/`LS`, résolution par `lat`, `lon`, fuseau IANA, plages, `EX`/`F`/`P`/`TC`, `%`/`VA`, `valideDe`/`valideJusque`, minuit) ; une référence Python **sans bpy** ; ≥ 30 vecteurs (standard, deux saisons, minuit, 30 %, heure d'été) ; fait appeler cette référence par `etat()` et recalcule son calendrier | écrit `lib/eclairage-profil.js`, copie les vecteurs tels quels dans `tests/fixtures/`, passe au bit près ; branche l'état dans la fiche et la légende | 100 % des vecteurs, égalité stricte sur les minutes et les facteurs |
| 2 | **Vocabulaire** | publie `eclext-vocabulaire/1.1` extrait de `eclairage.json`, accentué | E0 : listes Choice des quatre tables EclExt et des deux formulaires | un point saisi au formulaire passe l'export EclExt |
| 3 | **Points lumineux et mesures** | exporte en GeoJSON WGS84 les 88 points détectés de Longchamp, champs EclExt, statut par champ, azimut vrai | E0 : pose les points du Jarret (Ville de Marseille 2023), attributs inconnus à `XX` ; envoie les 9 relevés du luxmètre à pix2hdr | pix2hdr dispose d'un premier banc de nuit, Atlas d'un jeu d'essai pix2hdr |
| 4 | **Luminaires au catalogue** (E3), en parallèle d'E2 côté Atlas | mode « gabarit à l'origine » dans `maillage.py` ; export glTF (Blender `export_lights`, `export_extras`, ou l'écrivain glTF de `experiments/service/gltf.py`) ; nœuds `emetteur_<k>` ; type `lighting` (`matches` sur `structure`, `support`), `height_class` h4/h6/h8 ; schéma 0.2 validé en CI | lit le nœud émetteur ; calcule I, couleur et facteur depuis la fiche et le profil ; cône translucide ; E2 (fin du voile CSS) | un catalogue d'essai de 3 luminaires s'allume au curseur d'heure ; aller-retour angles et axe vérifié |
| 5 | **Lumière au sol** (E4) | calcule sous Cycles l'éclairement aux 9 points du Jarret avec les mêmes candelas | nappe E = I cos³θ / h² ; écart modèle / mesure par relevé | les deux prédictions et la mesure dans un même tableau |
| 6 | **Végétation** (V1) | rien à produire pour l'âge ; si voulu, `parse` « date de plantation » en 0.2 avec ses vecteurs | rien pour l'âge par circonférence ; shader de saison (§10 de la spec) | un platane jeune et un vieux, lus dans `circumference` (déjà testé) |
| 7 | **Mobilier** | aligne le brouillon objets sur le schéma (`seed_ref` en chaîne, famille `furniture`) ; corrige `famille = inconnu` de l'export `experiments/atlas` | lit sans changement de code (même contrat) | bancs et corbeilles OSM rendus par catalogue |
| 8 | **Tuiles de fond** (E6, F) | ancre WGS84 par tuile, tuilage implicite, meshopt, boîtes élargies au débord | charge une tuile comme GLB ancré, l'éclaire avec un luminaire d'essai ; évalue ensuite un client 3D Tiles | une tuile de Longchamp reçoit la lumière et l'ombre d'un mât, sans chute de fluidité |

**Ce qu'aucun des deux projets ne doit faire seul** : les vecteurs (étape 1) et le nœud émetteur
(étape 4) ; chacun d'eux fige un comportement que l'autre devra reproduire au bit près ou au
degré près.

---

*Sources principales : `pix2hdr/experiments/eclairage/generation/{README.md, photometrie.py,
common.py, maillage.py, rendu_blender.py, rendus.py, implantation.py, out/photometrie.json,
out/rendus.json}`, `pix2hdr/experiments/eclairage/normes/{eclairage.json, README.md,
correspondance.md}`, `pix2hdr/docs/{SPEC-ATLAS-OBJETS-0.1.md,
PROPOSITIONS-ATLAS-OBJETS-0.2-BROUILLON.md, CADRAGE-GENERATEUR-VEGETATION.md,
generated/catalogue.md, schemas/atlas-objets-0.1.schema.json, SYNTHESE/}`,
`pix2hdr/experiments/{anime/structure, objets, transports, cables, blocages, conformite, service,
atlas, vegetation_gltf}`, `Blender_servers/docker/blender-canvas/gn_lib/`, l'exportateur glTF de
Blender 5.1 installé, et côté Atlas `docs/CADRAGE-ECLAIRAGE-OBJETS-LUMINEUX.md`, `CLAUDE.md`,
`lib/catalogue-objets.js`, `lib/graine.js`, `app_v7.js`, `tests/`, et le `GLTFLoader` et
`three.module.js` r160 vendorisés dans `packages/atlas-app/www/vendor/`.*
