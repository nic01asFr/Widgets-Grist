# Réponse de pix2hdr — contrat commun Atlas ↔ pix2hdr pour les objets paramétriques

*24/09/2026. Réponse point par point à `docs/PROPOSITION-CONTRAT-COMMUN-OBJETS.md`, écrite
par **pix2hdr-revue** pour le canal WikiChat `atlas-pix2hdr-objets`. Lecture seule : aucun
fichier de pix2hdr, de `Blender_servers` ni du code d'Atlas n'a été modifié ; aucun script de
ces dépôts n'a été lancé. Les calculs de contrôle ont été refaits sur des **copies** placées
dans un répertoire temporaire (voir §1). Le point de départ est l'audit
`etudes-pix2hdr/AUDIT-OBJETS-PARAMETRIQUES.md`, dont les constats ne sont pas refaits ici :
seuls sont revérifiés ceux dont la réponse dépend.*

**Qui signe.** La spécification 0.1 a été **figée par Nicolas LAVAL** (`pix2hdr/docs/SPEC-ATLAS-OBJETS-0.1.md:3-5`)
et le brouillon 0.2 attend son GO point par point (`PROPOSITIONS-ATLAS-OBJETS-0.2-BROUILLON.md:3-5`) ;
le vocabulaire des statuts est lui-même en arbitrage (`pix2hdr/docs/SUITES-EN-ATTENTE.md:12`).
Cette réponse dit ce que pix2hdr **peut accepter et à quel prix** ; la décision reste celle de
Nicolas.

## Conventions

- **(V)** vérifié dans le fichier cité, à la ligne citée, pendant cette revue.
- **(C)** recalculé pendant cette revue (méthode au §1, reproductible).
- **(NV)** non vérifié : affirmation de mémoire, déduction, ou reprise d'un document sans contrôle.
- Chemins : `pix2hdr/…` ; `gn_lib/…` = `Blender_servers/docker/blender-canvas/gn_lib/` ;
  `exportateur/…` = `io_scene_gltf2` de **Blender 5.1** installé
  (`C:/Program Files/Blender Foundation/Blender 5.1/5.1/scripts/addons_core/io_scene_gltf2/`) ;
  `Atlas/…` = `Widgets Grist/projects/Atlas/`.

---

## 0. Le verdict en dix lignes

| # | Décision proposée | Réponse de pix2hdr |
|---|---|---|
| 1 | `CS`/`LS` = coucher et lever apparents (−0,833°) | **ACCORD**, précisé : seuil appliqué à la hauteur **géométrique**, instants à la seconde, pas à la minute |
| 2 | `MN` = milieu entre coucher et lever suivant | **ACCORD**, précisé : « nuit considérée » définie en heure **locale**, calcul sur les instants non arrondis |
| 3 | Horloge d'Atlas + `fuseau` + date épinglable ; `instant` ISO à l'échange | **AMENDEMENT** : un seul bloc `horloge` aligné sur le scénario de pix2hdr, **lieu = ancre de scène** (jamais le centre de la vue), instant toujours complet à l'échange |
| 4 | Vecteurs NOAA ; Atlas garde SunCalc si l'écart est négligeable | **AMENDEMENT** : l'écart **n'est pas** négligeable (jusqu'à 0,21° et 3 min) ; Atlas porte `src/pairs/sun.py` **maintenant** ; vecteurs **à tolérance** pour le soleil |
| 5 | Familles `vegetation`, `lighting`, `building` | **AMENDEMENT** : `vegetation` et `lighting` oui ; `building` **n'est pas une famille de catalogue** (absente de l'énumération, et le bâti n'est pas choisi par `matches`) : les fenêtres sont un contrat de couche |
| 6 | `height_class` h4 à h12, par seuils, sans échelle | **ACCORD avec deux ajouts** : pas de tirage `scale` pour `lighting` ; la classe sert à l'**apparence**, jamais au calcul de lumière |
| 7 | glTF : position, axe, cônes ; intensité calculée par chaque lecteur | **ACCORD avec précisions** : `intensity` du fichier **ignorée** par le contrat ; même formule de candelas écrite des deux côtés ; l'émetteur est une **donnée**, pas une obligation de lampe |
| 8 | `_WIN` + `part_allumee` + tirage par la graine commune | **AMENDEMENT lourd** : aujourd'hui pix2hdr tire les fenêtres avec **SHA-256 + PCG64 de numpy**, pas avec la graine commune ; courbe en `exp` non reproductible au bit ; `_WIN` doit être un flottant 32 bits jamais quantifié |
| 9 | Liste fermée de 7 statuts | **AMENDEMENT** : deux axes. `statut` = vocabulaire du code de pix2hdr + `simule` ; `a_verifier` va sur l'axe `verification` ; `inconnu` n'est pas un statut |
| 10 | Extraits accentués publiés par pix2hdr, lus tels quels | **ACCORD**, précisé : extrait versionné et empreint ; les littéraux BD TOPO gardent leurs accents de donnée ; pas d'extrait SESAME public |

Trois points durs, développés plus bas : **(a)** l'égalité « au bit près » ne tient pas dès
qu'une fonction transcendante entre dans la chaîne (soleil, sigmoïde) ; **(b)** la graine
« commune » des fenêtres n'existe pas encore chez pix2hdr, et la bâtir fait recuire des
rendus ; **(c)** le banc de nuit du Jarret est hors de l'emprise où pix2hdr sait produire.

---

## 1. Mesures faites pour cette réponse (C)

Toutes sur des **copies** de `src/pairs/sun.py`, de la fonction `sun_position` de
`experiments/shadows/ortho_shadows.py:62-86` et de `suncalc.js` (vendorisé dans
`packages/atlas-app/www/vendor/`), dans un répertoire temporaire, Python 3.11.9 (Windows) et
Node 22.16.0. Référence indépendante : **NREL SPA** de pvlib 0.15.2 (ΔT = 69 s).

| # | Mesure | Résultat |
|---|---|---|
| M1 | Hauteur du soleil, NOAA (`sun.py`) − SPA, Marseille (43,3049 N ; 5,3947 E), hauteurs de −10° à +10°, 53 jours × 144 instants (n = 1 284) | moyenne **+0,0029°**, max **0,0128°** |
| M2 | Même chose, SunCalc − SPA | moyenne +0,0040°, max **0,2111°** |
| M3 | SunCalc − NOAA, toutes hauteurs, cinq sites (Marseille, Lille, La Réunion, Guadeloupe, Tahiti) | max **0,2185°** partout |
| M4 | `SunCalc.getTimes` − NOAA par bissection (0,1 s), seuil −0,833°, chaque jour de 2026 | Marseille : soir **+9,8 à +165 s** (moy. +77,8 s), matin +49,9 à +110,5 s (moy. +76,8 s) ; Lille : soir −10,1 à +184,8 s ; outre-mer : +44 à +123 s |
| M5 | Portage JavaScript ligne à ligne de `sun.py`, comparé bit à bit au Python, 38 160 instants | 15 720 valeurs diffèrent, écart max **6,3 × 10⁻¹³°** |
| M6 | `math.exp` (CPython, Windows) contre `Math.exp` (V8), 200 000 arguments de la sigmoïde de `part_allumee` | **19 191** résultats diffèrent au dernier bit (9,6 %) |
| M7 | `passage_seuil` tel qu'il est écrit (date **naïve**) sur une machine réglée sur Paris, contre le même calcul en UTC explicite, 2026 | la minute d'allumage diffère **41 jours** (−0,833°) et **56 jours** (−6°) sur 365 |
| M8 | Heures annuelles soleil sous le seuil, Longchamp, 2026, pas d'une minute | −6° : **3 921 h** (le chiffre publié, `out/photometrie.json`) ; −0,833° : **4 300 h** (+379 h, +9,7 %) |
| M9 | Meilleure `smoothstep` approchant la sigmoïde `1/(1+exp((e+2)/2,5))` | bornes **−11° et +7°**, écart max **0,031** sur le facteur de nuit |

Lecture :
- **M1–M4** : NOAA tient le dixième de degré annoncé avec une marge de dix ; SunCalc ne le
  tient pas. Le biais moyen de `getTimes` (≈ +78 s au soir **et** au matin) correspond à la
  constante `J0 = 0.0009` jour (77,8 s) de `suncalc.js:120` (NV : attribution de la cause ; le
  biais lui-même est mesuré). À 0,15–0,2°/min près de l'horizon, 0,21° font 1 à 1,5 min.
  **Ce n'est pas négligeable** pour un allumage comparé à la minute.
- **M5–M6** : un portage fidèle ne donne **pas** l'égalité stricte dès qu'il y a `sin`, `acos`,
  `exp` ; il donne 10⁻¹² près. La méthode « égalité stricte » de la graine et de la saison
  marche parce que ces deux contrats n'emploient que des entiers et des `+ − × ÷`
  (`gn_lib/objseed.py:51-61`, `SPEC-ATLAS-OBJETS-0.1.md:213-223`) (V).
- **M7** : `passage_seuil` passe une date naïve à `ortho_shadows.sun_position`, qui calcule le
  jour julien par `when.timestamp()` (`ortho_shadows.py:64`) — donc **dans le fuseau de la
  machine** — mais l'angle horaire depuis `when.hour` lu comme UTC (`:80`). Le résultat dépend
  de la machine (poste Windows à Paris contre pod en UTC). La référence actuelle n'est pas
  reproductible d'une machine à l'autre.

---

## 2. Décision par décision

| # | Proposition (§8) | Réponse | Justification (fichier:ligne) | Coût pour pix2hdr |
|---|---|---|---|---|
| **1** | `CS`/`LS` = coucher et lever apparents (−0,833°) partout ; tout autre seuil en décalage explicite | **ACCORD** + précisions A1 | C'est le sens du standard tel que pix2hdr le recopie : `CS` = « décalage … par rapport au coucher du soleil » (`normes/eclairage.json:347-349`) (V). Le code, lui, allume la voirie à −6° (`photometrie.py:61`, `:229`) et la mise en lumière à −0,833° (`:62`, `:223`) (V) : la même chaîne `+0CS` (`:181`, `:197`) donne deux instants. Les deux algorithmes rendent une hauteur **géométrique** : `sun.py:100-112` n'applique aucune réfraction (V) ; SunCalc ne la corrige que pour la Lune (`suncalc.js:208`) (V). Le −0,833° (réfraction + demi-diamètre) s'applique donc tel quel des deux côtés. | `photometrie.etat()` : voirie au seuil −0,833° ou profil réécrit ; `calendrier()` recalculé : **3 921 → 4 300 h/an** (M8) ; `out/photometrie.json` et `generation/README.md:127` à reprendre ; rendus de nuit inchangés sauf aux instants crépusculaires. Faible. |
| **2** | `MN` = milieu entre coucher et lever suivant | **ACCORD** + précisions A2 | pix2hdr ne définit pas `MN` (`eclairage.json:347`) et ne s'en sert pas : son abaissement est en heures fixes 23:30–05:30 HL (`photometrie.py:63-64`) (V). Les profils en `MN` n'existent qu'en proposition (`normes/correspondance.md:152`) (V). L'audit a mesuré < 1 min d'écart au nadir (audit §2 B). | Nul aujourd'hui. Les vecteurs devront couvrir `MN` en hiver et en été (MN ≈ 00:40 HL l'hiver, 01:40 HL l'été : ce n'est pas minuit). |
| **3** | Horloge d'Atlas + `fuseau` + date épinglable ; `instant` ISO avec décalage à l'échange | **AMENDEMENT A3** | pix2hdr a déjà proposé `horloge = {instant_initial ISO 8601 avec fuseau, duree_s, pas_s}` (`anime/structure/contrat_mobiles_0.1.json:218`, README `:1135-1142`) (V) : deux noms pour la même chose seraient une dette. Atlas calcule le soleil **au centre de la vue** (`Atlas/app_v7.js:2375`, `map.getCenter()`) (V) : l'état d'une scène changerait en la faisant glisser. pix2hdr, lui, calcule en un point fixe (`common.py:70`) et en heure légale maison, fausse aux changements d'heure (bascule à 00:00 UTC au lieu de 01:00 UTC, `common.py:467-479`) (V), et en jour **UTC** (`passage_seuil`, `common.py:482-495`, condition `t0.hour >= 12` à `:490`) (V), ce qui ne trouve pas le coucher à Tahiti (≈ 04:30 UTC). | `common.py` : `heure_ete`/`heure_locale` remplacés par `zoneinfo` ; `passage_seuil` prend `lat`, `lon`, `fuseau` et des dates avec fuseau (corrige M7) ; `LAT_SITE` devient un paramètre. Moyen : touche toute la brique `eclairage/generation`, pas les géométries. |
| **4** | Vecteurs NOAA ; Atlas garde SunCalc si l'écart est négligeable, s'aligne sinon | **AMENDEMENT A4** | M2–M4 : l'écart **n'est pas** négligeable. M5 : un portage JS de `sun.py` coûte une soixantaine de lignes et tient 10⁻¹². pix2hdr a **quatre** implémentations du soleil (`anime/structure/README.md:779`) (V) : `sun.py`, `ortho_shadows.py`, `eclairage/generation/common.py` (qui appelle la précédente, `:456-460`) et pvlib. `sun.py` et `ortho_shadows` donnent le même résultat à 0,0000° près quand la date porte son fuseau (C) ; `sun.py` refuse une date naïve (`sun.py:34-35`) (V), c'est la bonne référence. | `common.py:456-460` repointé sur `src/pairs/sun.py` ; écriture des vecteurs soleil (voir A4). Faible. |
| **5** | Familles `vegetation`, `lighting`, `building` (anglais) | **AMENDEMENT A5** | `vegetation` et `lighting` sont déjà dans l'énumération `family` ; **`building` n'y est pas** (`docs/schemas/atlas-objets-0.1.schema.json:313-322` : `vegetation, furniture, lighting, signalization, infrastructure, other`) (V). Un bâtiment n'est pas un objet de catalogue choisi par `matches` (SPEC §3, `:54-94`) : il vient des couches de la maquette ou des tuiles. | Nul si A5 est retenu. S'il fallait `building` au catalogue : schéma, CI et exemples à reprendre. |
| **6** | `height_class` h4 à h12, par seuils, sans mise à l'échelle | **ACCORD** + A6 | pix2hdr construit chaque mât **à sa hauteur** (`maillage.py:82-83`, `207-258`, audit §2 D) (V par l'audit). La SPEC applique le tirage `scale` 0,9–1,1 à tout objet sans hauteur mesurée (`SPEC…:121`, `:147-152`) (V) : un luminaire sans hauteur serait étiré, émetteur compris. La hauteur par défaut de pix2hdr est la **médiane de bande** `(bh[0]+bh[1])/2` (`photometrie.py:292`), 6,75 m pour un mât, alors que la médiane mesurée est 5,20 m (audit, `eclairage.json:1260`) : deux « défauts » coexistent. Et l'éclairement varie en 1/h² : rendre la lumière à 6 m pour un feu mesuré à 5,2 m sous-estime l'éclairement au pied de **25 %**. | Un mode « gabarit à l'origine » dans `maillage.py` et un export glTF : **code neuf**. Les rendus de pix2hdr gardent la hauteur exacte : aucun rendu ne recuit. |
| **7** | glTF : position, axe, cônes ; intensité calculée par chaque lecteur | **ACCORD** + A7 | L'exportateur écrit `intensity` = W/(4π) × 683 × 2^exposure pour un spot comme pour un point (`exportateur/blender/exp/lights.py:136-157`) (V) ; `outer` = `spot_size`/2, `inner` = outer × (1 − `spot_blend`) (`light_spots.py:28-47`) (V) ; l'axe est corrigé pour Y en haut sur le nœud lui-même (`tree.py:293-298`) (V) ; `export_lights` est **faux par défaut** (`__init__.py:942-947`) (V) et `gn_lib/export_gltf.py:258-263` ne le pose pas (V). pix2hdr convertit à 300 lm/W (`rendu_blender.py:31`) (V) : facteur 2,28 avec l'exportateur (audit §2 C). | `rendu_blender.py` : puissance Blender = 4π·I/683 au lieu de Φ/300 ; **rendus de nuit recuits** (`rendus.json`, planches). Moyen. |
| **8** | `atlas-bati-fenetres/0.1` : `_WIN` + `part_allumee` existante, tirage par la graine commune | **AMENDEMENT A8** (lourd) | Le tirage actuel **n'est pas** la graine commune : `graine()` = SHA-256 de `cle|graine_globale`, 64 bits (`menuiseries/generateurs/parametres.py:396-408`) (V), puis **`np.random.default_rng` (PCG64)** (`etats.py:128`, `:230`) (V), et l'allumage est `rng.random() < part` (`etats.py:231`) (V) : non reproductible en JS sans réécrire PCG64 et `SeedSequence`. La graine commune, elle, est FNV-1a 32 bits sur `clé#flux` (`gn_lib/objseed.py:51-61`) (V). pix2hdr s'est lui-même interdit « une graine maison » (`anime/structure/README.md:658`, `:1103`) (V). La sigmoïde emploie `math.exp` (`etats.py:175`) : M6. L'arrondi par logements emploie `round()` de Python (`etats.py:185`), arrondi **au pair**, quand `Math.round` arrondit au supérieur. Les menuiseries sortent en **OBJ** (`menuiseries/generateurs/README.md:319`) (V), qui ne porte aucun attribut. L'exportateur écrit tout attribut `INT` en **FLOAT 32 bits** (`exportateur/blender/com/conversion.py:98`, `:155`) (V) : une graine de 32 bits n'y survit pas. `gltf_compress.mjs:70` quantifie `_PART`, `_PHEN`, `_TINT` sur **8 bits** (V) : un `_WIN` qui y passerait perdrait son tirage. | `etats.apparence()` : tirage d'allumage et de teinte par la graine commune ; courbe `part_allumee` réécrite ; **rendus de façade recuits** là où des fenêtres sont allumées, y compris **de jour sur le tertiaire** (plancher `jour = 0,10`, `etats.py:178`) ; export glTF des menuiseries à écrire. Élevé. |
| **9** | Liste fermée : `mesure, observe, referentiel, regle, simule, a_verifier, inconnu` | **AMENDEMENT A9** | Le code de pix2hdr écrit partout `observe, propage, regle, herite` (`experiments/correction/common.py:53-55`) (V), sur 9 933 prémices dont **1 548 `propage`** (`anime/structure/README.md:516`) (V) : la liste proposée **perd `propage`**. Le `referentiel` proposé est le `herite` de pix2hdr (« attribut d'un référentiel extérieur … il borne, il ne prouve pas », `correction/common.py:22` ; « herite pour une valeur venue d'un referentiel exterieur », `contrat_mobiles_0.1.json:238`) (V). `a_verifier` est une valeur de l'**autre axe**, la vérification du contrat `Source` (`service/README.md:40`) (V). `simule` est déjà proposé par pix2hdr, hors échelle, confiance 0,0 (`anime/structure/README.md:1144-1155`) (V). Attention : `normes/eclairage.json:8-14` emploie les mêmes mots **dans d'autres sens** (`observe` = lu dans un référentiel ; `herite` = recopié d'un objet parent) (V). | Relabellisation des sorties d'éclairage (`points_lumineux.json`, `photometrie.json`) et de `etats.py` (`statut="regle"` → `simule` pour l'allumage, `:235`, `:267`). Texte seulement, aucune géométrie. |
| **10** | Extraits accentués publiés par pix2hdr, lus tels quels par Atlas | **ACCORD** + A10 | `eclairage.json` est écrit sans accents et pour la seule brique de génération, avec repère local et correspondances marseillaises (`:2-7`, `:253-268`) (V) : un extrait neutre est nécessaire. Les usages BD TOPO sont des **littéraux de donnée** qui gardent leurs accents (`etats.py:77-79`, `"R\u00e9sidentiel"`) (V). Les profils SESAME sont à licence non vérifiée, usage interne (`SPEC…:248-249`) (V). | Un script d'extraction et une relecture des libellés contre le texte du standard. Faible. |

---

## 3. Les points des §1 à §7 et du §9 qui engagent pix2hdr

**Doctrine (règles 1 à 3).** Accord sur les trois ; elles sont bien de pix2hdr
(`etats.py:13-20`, `anime/structure/README.md:438-454`) (V). Deux ajouts nécessaires :
- la règle 3 a pour corollaire la règle **S1** : « toute valeur produite par un modèle de
  comportement porte `statut = simule`, avec le nom et la version du modèle »
  (`anime/structure/regles_animation.json:33-36`) (V). Un luminaire allumé, une fenêtre
  allumée sont des valeurs `simule`, pas `regle` ;
- et la règle **S5** : toute sortie qui mêle mesuré et simulé **le dit dans la sortie**, dans
  l'image pour une image, dans le manifeste pour une scène (`regles_animation.json:63-67`) (V).
  Une vue de nuit d'Atlas doit donc porter la mention « état simulé » dans la vue et dans
  l'export (voir oubli O5).

**§1 Horloge.** Voir A3 et A4. Le constat de la proposition est juste : la date existe dans
Atlas mais pas dans ce qu'il exporte, et `lib/scene-prefs.js:25` l'écarte volontairement (V).

**§2 Familles.**
- *Végétation, vent.* Accord pour créer `_WIND` **pendant** une prochaine cuisson : ajouter un
  attribut après coup, c'est recuire les 120 GLB (`anime/structure/README.md:833-838`) (V).
  Coût : une cuisson v4 du catalogue ; `_WIND` doit alors être ajouté au motif de quantification
  de `gltf_compress.mjs:70` **ou** explicitement exclu, et le dire dans le contrat.
- *Éclairage.* Accord : la référence Python est **à écrire** (`photometrie.etat()` code ses
  seuils, `:214-236`) (V). Elle sera **sans `bpy`**, prendra `lat`, `lon`, `fuseau`, et lira les
  chaînes EclExt. Trois profils de voirie coexistent (`photometrie.py:178-193`,
  `correspondance.md:150-153`) (V) : pix2hdr en publiera **une** liste canonique.
- *Bâti — fenêtres.* Voir A8.
- *Ouvrants, volets.* Accord pour les laisser hors du premier lot. Précision utile : leur état
  « ne change aucun triangle », c'est une rotation (`menuiseries/generateurs/README.md:223-229`) (V),
  mais il interdit l'instanciation ; ce sera un sujet d'Atlas le jour venu.
- *Eau, mobiles.* Accord pour « plus tard ». Le vent de l'eau est une constante codée en dur
  (`VENT_AZIMUT_DEG = 150.0`, `anime/structure/README.md:796`) (V) : il devra passer dans le
  scénario avant tout contrat commun sur l'eau.

**§3 Émettre et recevoir.** Accord. Voir A7 pour l'intensité. Pour le récepteur « tuiles » :
les tuiles actuelles sont en repère local, sans `transform` terrestre, sans texture, sans
éclairage public (audit §1.5) ; accord pour la cible, pas pour une échéance.

**§4 Format.** Accord, avec ce que Blender et la chaîne de pix2hdr imposent réellement :

| Élément | Ce que l'exportateur de Blender 5.1 fait (V) | Conséquence pour le contrat |
|---|---|---|
| Attributs `_XXX` | exportés si `export_attributes=True` (défaut **faux**, `__init__.py:560-564`) et si le nom commence par `_` (`primitive_extract.py:179`) | déjà posé par `gn_lib/export_gltf.py:259-260` (V) |
| Attribut `INT` | écrit en **FLOAT 32 bits** (« No signed Int in glTF accessor », `com/conversion.py:98`, `:155`) | aucun attribut ne peut porter un entier de 32 bits ; `_WIN` porte un **tirage** en flottant, pas une graine (A8) |
| Quantification | faite **après** Blender par `gltf_compress.mjs` : 8 bits normalisés pour `_PART`, `_PHEN`, `_TINT` (`:61-71`) | chaque attribut du contrat déclare sa précision ; `_WIN` : jamais quantifié |
| `KHR_materials_emissive_strength` | écrit **seulement** si une composante du facteur émissif dépasse 1 (`material/extensions/emission.py:110-114`) et **seulement** pour une valeur constante ou texturée (`:20-60`) | une émission pilotée par un nœud `Attribute` (le tirage de fenêtre dans le shader de Blender) **ne s'exporte pas** : le glTF porte le matériau « allumé nominal », l'état est appliqué par chaque lecteur |
| `KHR_lights_punctual` | `export_lights` faux par défaut ; intensité convertie (voir décision 7) ; axe corrigé sur le nœud | A7 |
| Luminaires, menuiseries | **ne passent pas par Blender** : numpy puis OBJ (`eclairage/generation/maillage.py:1-66`, audit ; `menuiseries/generateurs/README.md:319`) (V) | l'export glTF est à écrire, par Blender (import puis export) ou par l'écrivain de `experiments/service/gltf.py` ; ce dernier n'écrit aujourd'hui que `EXT_mesh_features` (`gltf.py:136-158`) (V) |

Et **Blender 4.0.2** reste la version des rendus de pix2hdr (`rendu_blender.py:1`,
`menuiseries/generateurs/README.md:267`) (V) ; l'exportateur relu ici est celui de 5.1. Les
formules de cône sont vraisemblablement les mêmes en 4.0.2 (NV) ; la conversion d'intensité
diffère peut-être (`exposure`, `normalize` sont récents) (NV) — sans effet si A7 est retenu,
puisque l'intensité du fichier est ignorée.

**§5 Statuts.** Voir A9.

**§6 Vocabulaires.** Voir A10.

**§7 Où vit le contrat.** Accord : chez pix2hdr, références et vecteurs chez pix2hdr, copies
empreintes chez Atlas, jamais régénérées. Une correction de renvoi : la règle « un lecteur
ancien ignore un contrat inconnu, sans erreur » est au **§11** de la 0.1 (`SPEC…:266-275`) et à
l'étape 9 du §3 (`:92-94`), pas au §8 (V).

**§9 Ordre de marche.** Accord sur l'ordre des étapes 1 à 3 et 5. **Amendement sur l'étape 4**
(le Jarret) :
- la chaîne d'éclairage de pix2hdr est liée à Longchamp : `SITE = data/longchamp`
  (`common.py:60`), point solaire fixe (`:70`), repère local de Longchamp
  (`eclairage.json:7`) (V). pix2hdr **n'a pas de maquette au Jarret** ;
- le jeu « Ville de Marseille 2023 » est, par doctrine, un **banc de validation et rien
  d'autre** (`eclairage/generation/README.md:19-24`) (V) : pix2hdr ne peut pas s'en servir comme
  entrée pour éclairer le Jarret ;
- proposition : au Jarret, pix2hdr fournit **la formule et ses vecteurs** (candelas depuis la
  fiche, E = I cos³θ / h²) et vérifie le calcul d'Atlas ; le **banc de nuit commun** complet se
  fait **à Longchamp**, où pix2hdr a 88 points détectés, 56 hauteurs mesurées et la maquette
  (`generation/README.md:70-73`, audit §1.1), si Atlas peut y faire une série au luxmètre.
  pix2hdr n'a aujourd'hui **aucune** validation de nuit (`generation/README.md:256-261`) (V) :
  les deux séries lui servent.

---

## 4. Les amendements, rédigés

Chaque amendement est écrit pour être recopié tel quel dans le contrat.

**A1 — `CS` et `LS`.**
> `CS` (resp. `LS`) est l'instant du coucher (resp. du lever) apparent du soleil au lieu de
> l'horloge : la hauteur **géométrique** du centre du soleil, calculée par la référence solaire
> (A4), vaut −0,833°. L'instant est déterminé à la seconde près ; il n'est jamais arrondi à la
> minute avant d'y ajouter un décalage. Un décalage `±nCS` s'ajoute en minutes entières. Tout
> autre seuil (crépuscule civil) s'écrit par un décalage explicite dans le profil, et le profil
> déclare pourquoi. Là où le soleil ne se couche pas (hors territoire habité de la République),
> les références `CS`, `LS`, `MN` sont indéfinies et le profil ne s'applique pas.

**A2 — `MN`.**
> `MN` est l'instant médian entre le `CS` d'un jour J et le `LS` du jour J+1, jours comptés en
> heure **légale du lieu** (fuseau de l'horloge). La nuit considérée pour un instant t est celle
> dont le `CS` est le dernier coucher antérieur ou égal à t ; entre minuit et le lever, c'est donc
> la nuit commencée la veille. `MN` est calculé sur les instants non arrondis. Une plage dont
> `heureDebut` est postérieure à `heureFin` enjambe minuit et se résout dans la nuit considérée.

**A3 — Horloge.**
> Le fichier de scène et le scénario de tuile portent un bloc unique
> `horloge = { instant, fuseau, lieu: { lat, lon }, date_epinglee, duree_s?, pas_s? }` :
> `instant` en ISO 8601 **avec décalage** ; `fuseau` IANA (`Europe/Paris` par défaut), le décalage
> de `instant` devant être celui de `fuseau` à cet instant ; `lieu` est l'**ancre de la scène**
> (ou le centre de la tuile), jamais le centre de la vue ; `date_epinglee` dit si la date fait
> partie du propos (saison voulue) ou n'est qu'une date par défaut. L'instant est **toujours
> complet** à l'échange, épinglé ou non. `instant_initial` du brouillon
> `contrat_mobiles_0.1.json:218` est renommé `instant`. `date` et `timeOfDay` restent lus pour
> les scènes existantes.

**A4 — Soleil de référence.**
> La référence solaire est `pix2hdr/src/pairs/sun.py:solar_position` (algorithme NOAA, hauteur
> géométrique, sans réfraction). Atlas en porte une traduction JavaScript ligne à ligne pour
> tous les comportements (`CS`, `LS`, `MN`, hauteur du soleil des fenêtres) ; SunCalc reste
> employé pour la Lune et les préréglages d'affichage. Les vecteurs solaires portent
> `{lat, lon, instant} → {hauteur_deg, azimut_deg}` et `{lat, lon, fuseau, date} → {CS, LS, MN}` ;
> ils se passent **à tolérance** : 10⁻⁹° sur les angles, 1 s sur les instants. Les vecteurs
> de comportement (A8, profil d'éclairage) prennent la hauteur du soleil, `CS`, `LS` et `MN` **en
> entrée** et se passent, eux, à l'égalité stricte. Côté pix2hdr, les autres implémentations
> (`eclairage/generation/common.py`, `experiments/shadows/ortho_shadows.py`) appellent la
> référence ou sont déclarées hors contrat.

**A5 — Familles.**
> Les familles de catalogue sont celles de l'énumération `family` de la 0.1 (`vegetation`,
> `furniture`, `lighting`, `signalization`, `infrastructure`, `other`). Le bâti n'est pas une
> famille de catalogue : `atlas-bati-fenetres/0.1` est un **contrat de shader de couche**,
> déclaré par la couche de scène (manifeste) ou par la tuile (entrée `contrats` de `tuile/0.2`),
> et s'applique aux primitives qui portent `_WIN`.

*(Remarque non bloquante : les contrats existants et les clés de catalogue sont en anglais,
`atlas-vegetation-season/0.1` ; `atlas-lighting-profile/0.1` et `atlas-building-windows/0.1`
seraient plus cohérents. pix2hdr accepte les deux graphies ; il en faut une.)*

**A6 — Classe de hauteur des luminaires.**
> Famille `lighting` : clé discrète `height_class` ∈ {`h4`, `h6`, `h8`, `h10`, `h12`}, choisie
> par une mesure `select` sur `from: ["hauteurFeu", "height"]`, `unit: m`, `clamp: [3, 14]`,
> seuils `[[5, "h4"], [7, "h6"], [9, "h8"], [11, "h10"], [null, "h12"]]`, défaut `h6`. Aucune
> mesure `scale` et **aucun tirage `scale`** pour cette famille (champ de type
> `scale_draw: false`, ajout de schéma). La classe fixe l'**apparence** ; tout calcul chiffré
> (éclairement, nappe au sol, fiche) emploie la hauteur de feu de la fiche avec son statut, pas
> la hauteur nominale de l'asset. Une borne est un type distinct (`structure = BOR`), pas une
> classe.

**A7 — Émetteurs.**
> Un luminaire porte un nœud par source, nommé `emetteur_<k>`, avec `KHR_lights_punctual` de
> type `spot` (demi-angle ≤ 90°), axe = −Z du nœud, `outerConeAngle` = demi-angle de la classe
> photométrique, `innerConeAngle` = 0,65 × `outerConeAngle`. Le champ `intensity` du fichier
> **n'est pas lu** par un lecteur du contrat, quelle que soit sa valeur. `extras` :
> `{ "emetteur": k, "demi_angle_deg": …, "ulr": … }`. L'intensité est calculée par chaque
> lecteur, avec la même formule écrite dans le contrat :
> I (cd) = Φ × f / (2π (1 − cos outer)), Φ = `fluxLuminaire`, à défaut `puissance` ×
> efficacité type de `typeSource`, f = facteur de flux du profil à l'instant. Le nœud émetteur
> est une **donnée** : un lecteur choisit combien de lampes réelles il allume (budget), et
> représente les autres autrement, sans changer I. Les azimuts échangés sont **vrais**, jamais de
> grille.

**A8 — Fenêtres.**
> *Clé.* Chaque baie a une clé de tirage `baie:<cle_de_tirage>`, où `cle_de_tirage` est la forme
> de `menuiseries/generateurs/parametres.py:374-394` (porteur et position quantifiée à 0,25 m),
> écrite sans `-0.00`. Aucune graine de campagne n'y entre.
> *Tirage.* `u = draw(clé, "win")` selon `atlas-objets#seed` (FNV-1a 32 bits, flux `win` ajouté
> aux flux normalisés) ; `w = fround(u)` (flottant 32 bits). La teinte d'une baie allumée est
> `TEINTES[floor(draw(clé, "win_tint") × 4)]`, table de quatre couleurs linéaires publiée par le
> contrat.
> *Attribut.* `_WIN` (SCALAR, FLOAT 32 bits, **jamais quantifié**) porte `w` sur chaque sommet de
> la vitre. Une baie sans `_WIN` ne s'allume pas.
> *Part allumée.* `n = smoothstep` de la hauteur du soleil e entre +7° (n = 0) et −11° (n = 1),
> soit t = clamp((7 − e) / 18, 0, 1), n = t × t × (3 − 2t) ; `part = jour + (plafond − jour) × n`,
> avec (plafond, jour) = (0,35 ; 0,10) si `usage_1` commence par « Commercial », « Industriel »
> ou contient « bureau », (0,05 ; 0) pour « Annexe » et « Agricole », (0,55 ; 0) sinon ; si
> `nombre_de_logements` > 0, `part = floor(part × N + 0,5) / N`.
> *État.* La baie est allumée si `w < part`. Statut `simule`, modèle `atlas-bati-fenetres/0.1`.
> *Où sont les attributs du bâtiment.* Dans une tuile : `objets.json` de la baie, via
> `_FEATURE_ID_0` ; dans un GLB de scène : `extras` du nœud du bâtiment
> `{ cleabs, usage_1, nombre_de_logements, statuts }`.
> *Vecteurs.* `{usage_1, nombre_de_logements, hauteur_deg, clé} → {w, part, allumee, teinte}`, à
> l'égalité stricte (que des entiers et `+ − × ÷`).

**A9 — Statuts.**
> Toute valeur échangée porte `{ valeur, statut, source, confiance }` et, si elle en a,
> `incertitude` et `verification`.
> `statut` (comment la valeur a été obtenue), liste fermée : `observe` (observée ou mesurée sur
> nos données ; une mesure porte son `incertitude`), `propage` (prolongée d'un voisin observé par
> une règle écrite), `regle` (posée par une règle ou un gabarit), `herite` (lue dans un
> référentiel extérieur : BD TOPO, EclExt d'un gestionnaire, OSM ; elle borne, elle ne prouve pas),
> `simule` (produite par un comportement ; hors échelle, confiance 0,0).
> `verification` (contrat `Source`) : `verifie`, `presomption_haute`, `a_verifier`.
> Une valeur absente est `valeur: null` sans statut ; le code `XX` d'EclExt reste un code de
> vocabulaire.
> Atlas peut afficher « mesuré » pour `observe` avec `incertitude`, et « référentiel » pour
> `herite` : ce sont des libellés, pas des valeurs.

**A10 — Vocabulaires.**
> pix2hdr publie des extraits versionnés, chacun avec son empreinte SHA-256 :
> `eclext-vocabulaire/1.1` (codes, libellés accentués **relus contre le texte du standard**,
> source, article, `AU`, `XX`), `bdtopo-usages` (littéraux exacts du champ `usage_1`, accents
> compris, puisqu'ils sont comparés aux données), `essences` (noms scientifiques et
> vernaculaires, sans aucune donnée de profil SESAME). Atlas les copie dans `tests/fixtures/` et
> ne les régénère jamais. Les bandes de plausibilité restent chez pix2hdr ; Atlas n'en lit que ce
> qui sert à signaler une valeur invraisemblable.

---

## 5. Ce que la proposition a oublié et qui compte pour pix2hdr

| # | Oubli | Pourquoi c'est important | Source |
|---|---|---|---|
| O1 | **L'égalité stricte ne traverse pas une fonction transcendante** | 9,6 % des `exp` et 41 % des hauteurs solaires diffèrent au dernier bit entre Python et JS (M5, M6). Sans la séparation « soleil à tolérance / comportement exact » (A4), aucun vecteur d'éclairage ni de fenêtre ne passe. | (C) |
| O2 | **Deux systèmes de graine chez pix2hdr** | menuiseries : SHA-256 + PCG64 ; catalogue : FNV-1a. Tant qu'ils coexistent, « le même immeuble montre les mêmes fenêtres » est faux. | `parametres.py:407-408`, `etats.py:128` ; `objseed.py:59-61` (V) |
| O3 | **La référence actuelle dépend de la machine** | date naïve passée à `timestamp()` : 41 à 56 jours par an décalés d'une minute entre un poste à Paris et un pod en UTC (M7) ; heure d'été fausse une heure deux fois par an. | `ortho_shadows.py:64`, `common.py:467-479`, `:482-495` (V) |
| O4 | **La nuit se définit en heure locale** | `passage_seuil` cherche le coucher dans le jour UTC après 12:00 UTC : hors de France métropolitaine (Polynésie), il ne le trouve pas. La maquette France entière inclut l'outre-mer. | `common.py:490` (V) |
| O5 | **Règles S1 et S5** : le simulé se déclare dans la sortie | une vue de nuit d'Atlas sans mention « état simulé » serait, selon la doctrine de pix2hdr, un faux ; idem pour une capture exportée. | `regles_animation.json:33-36`, `:63-67` (V) |
| O6 | **Façades peintes** | le bâti v3b a des baies **peintes** dans l'atlas, pas de géométrie de baie ; seule la brique menuiseries produit des vitres. Sur la maquette courante, beaucoup de façades n'auront pas de `_WIN` : elles ne s'allument pas, et le contrat doit le dire plutôt que d'inventer une lueur de façade. | `menuiseries/generateurs/README.md:269-272`, `:345-346` (V) |
| O7 | **Précision des attributs** | l'exportateur convertit `INT` en float 32 ; la compression quantifie sur 8 bits ; OBJ ne porte rien. Le contrat doit déclarer type et précision de chaque attribut. | voir §3, tableau du §4 (V) |
| O8 | **Luminaires dans les tuiles** | l'écrivain de tuiles ne sait pas écrire `KHR_lights_punctual` et les tuiles n'ont aucune couche d'éclairage. À l'échelle France, un luminaire dans une tuile doit être un **objet** de `objets.json` (famille `lighting`, attributs EclExt, statuts) instancié par Atlas depuis le catalogue, pas une lampe dans `tuile.glb` : `tuile/0.1` reste compatible, rien n'entre dans le `.glb`. | `service/gltf.py:136-158` ; audit §1.5 (V) |
| O9 | **`tuile/0.2` et le scénario** | le contrat de tuile unique en français est annoncé ; si l'horloge et l'entrée `scenario` n'y entrent pas maintenant, il faudra un `0.3`. À décider avec A3. | `SUITES-EN-ATTENTE.md:13` ; `anime/structure/README.md:1135-1142` (V) |
| O10 | **Budget de lumières** | 88 points détectés et 1 421 posés par règle à Longchamp (audit §1.1) : un `SpotLight` par point n'est pas tenable dans three.js (NV : plafond exact non mesuré). D'où la phrase « donnée, pas obligation de lampe » de A7. | audit §1.1, §2 F |
| O11 | **Deux hauteurs par défaut chez pix2hdr** | médiane de bande (6,75 m pour un mât) dans `photometrie.py:292` contre médiane mesurée 5,20 m dans les normes : à unifier avant de poser le défaut `h6`. | (V) |
| O12 | **Licences** | maquette et scène à usage interne (ODbL, CC BY-SA) ; SESAME interne ; le jeu Marseille 2023 est un banc pour pix2hdr. Les fenêtres et luminaires posés sur la maquette héritent de son usage interne en contexte public (SPEC §3, étape 8). | audit §4 risque 10 ; `SPEC…:88-91` (V) |
| O13 | **Le GO de Nicolas** | la 0.1 est figée par lui, le 0.2 attend son GO, les statuts sont en arbitrage : ce contrat ne s'applique qu'après son GO, point par point. | `SPEC…:3-5` ; `PROPOSITIONS…:3-5` ; `SUITES…:12` (V) |

---

## 6. Ce que chaque décision coûte à pix2hdr, en un tableau

| Module | Change | Sorties recuites | Décisions |
|---|---|---|---|
| `eclairage/generation/common.py` | fuseau IANA, dates avec fuseau, `lat`/`lon` en paramètre, appel de `src/pairs/sun.py` | aucune géométrie ; calendriers | 1, 2, 3, 4 |
| `eclairage/generation/photometrie.py` | `etat()` lit les chaînes EclExt ; profils canoniques ; statut `simule` | `out/photometrie.json` (4 300 h/an au lieu de 3 921) | 1, 2, 9 |
| référence `atlas-eclairage-profil/0.1` (nouvelle, sans `bpy`) | à écrire, avec ≥ 30 vecteurs | — | 1, 2, 4, 7 |
| `eclairage/generation/rendu_blender.py` | candelas du contrat, puissance Blender = 4π·I/683 | **rendus de nuit** | 7 |
| `eclairage/generation/maillage.py` + export glTF | mode gabarit à l'origine, classes, nœuds `emetteur_<k>` | nouveau catalogue `lighting` | 6, 7 |
| `menuiseries/generateurs/etats.py` | tirage FNV par `baie:`, smoothstep, arrondi explicite, statut `simule` | **rendus de façade** avec fenêtres allumées (nuit, et jour sur le tertiaire) | 8, 9 |
| menuiseries, export | glTF avec `_WIN` (aujourd'hui OBJ) | nouveau | 8 |
| `gn_lib/gltf_compress.mjs` | déclarer la précision de chaque attribut ; `_WIN` exclu de la quantification ; `_WIND` à la prochaine cuisson | 120 GLB si `_WIND` | 8, §2 |
| `normes/eclairage.json` → extraits | script d'extraction, relecture des libellés | extraits versionnés | 9, 10 |
| schéma `atlas-objets` | `scale_draw`, flux `win`/`win_tint`, clé `baie:` | CI du schéma | 6, 8 |

---

## 7. Version consolidée des dix décisions, telle que pix2hdr peut la signer

*Sous réserve du GO de Nicolas LAVAL, point par point.*

1. **`CS` / `LS`** : coucher et lever apparents, hauteur géométrique du soleil à −0,833° par la
   référence solaire, instants à la seconde ; tout autre seuil s'écrit en décalage explicite et
   motivé dans le profil. (A1)
2. **`MN`** : instant médian entre le `CS` de J et le `LS` de J+1, jours en heure légale du lieu ;
   nuit considérée = celle du dernier coucher antérieur ; calcul sur instants non arrondis. (A2)
3. **Horloge** : un bloc `horloge = {instant ISO avec décalage, fuseau IANA, lieu = ancre de
   scène, date_epinglee, duree_s?, pas_s?}`, commun au fichier de scène et au scénario de tuile,
   instant toujours complet à l'échange ; `date`/`timeOfDay` restent lus. (A3)
4. **Soleil** : référence `src/pairs/sun.py` (NOAA) ; Atlas en porte une traduction JS pour les
   comportements ; vecteurs solaires à tolérance (10⁻⁹°, 1 s), vecteurs de comportement à
   l'égalité stricte avec le soleil en entrée. (A4)
5. **Familles** : celles de l'énumération 0.1, dont `vegetation` et `lighting` ; les fenêtres
   sont un contrat de shader de couche ou de tuile, pas une famille `building`. (A5)
6. **Hauteur des luminaires** : `height_class` h4 à h12 par `select`, défaut `h6`, ni mesure ni
   tirage `scale` ; la classe fixe l'apparence, les calculs prennent la hauteur de feu de la fiche.
   (A6)
7. **Émetteurs** : nœuds `emetteur_<k>` en `KHR_lights_punctual`, position, axe −Z, cônes
   (inner = 0,65 × outer) ; `intensity` du fichier jamais lue ; candelas par une formule unique
   écrite au contrat ; l'émetteur est une donnée, le nombre de lampes réelles est l'affaire du
   lecteur. (A7)
8. **Fenêtres** : `atlas-bati-fenetres/0.1` = clé `baie:<cle_de_tirage>`, tirage FNV flux `win`,
   `_WIN` flottant 32 bits jamais quantifié, part allumée en smoothstep (−11° ; +7°) modulée par
   `usage_1` et `nombre_de_logements` avec arrondi explicite, allumée si `w < part`, statut
   `simule`. (A8)
9. **Statuts** : deux axes. `statut` ∈ {`observe`, `propage`, `regle`, `herite`, `simule`} ;
   `verification` ∈ {`verifie`, `presomption_haute`, `a_verifier`} ; `incertitude` pour une
   mesure ; absence = `null`. (A9)
10. **Vocabulaires** : extraits versionnés et empreints publiés par pix2hdr (EclExt accentué relu
    contre le standard, littéraux `usage_1` de la BD TOPO, essences sans données SESAME), copiés
    par Atlas, jamais régénérés. (A10)

Et, hors des dix : banc de nuit commun à **Longchamp** en plus du Jarret (§3, §9) ; mention
« état simulé » dans toute vue et tout export de nuit (O5) ; horloge et `scenario` entrent dans
`tuile/0.2` (O9).

---

## 8. Vérifié, non vérifié

**Vérifié (V) ou recalculé (C)** : tout ce qui porte ces marques ci-dessus ; en particulier le
tirage des fenêtres (`etats.py`, `parametres.py`), la graine commune (`objseed.py`), l'énumération
des familles (schéma 0.1), le vocabulaire des statuts du code (`correction/common.py`) et de
l'éclairage (`eclairage.json`), le comportement de l'exportateur de Blender 5.1 (attributs,
`INT` → float, émission, lumières, orientation), la quantification de `gltf_compress.mjs`, les
mesures M1 à M9.

**Non vérifié (NV)** :
- que la spécification glTF 2.0 réserve `UNSIGNED_INT` aux indices (souvenir de la spécification ;
  l'argument de A8 tient sans lui, par la conversion de l'exportateur, vérifiée) ;
- l'exportateur de **Blender 4.0.2**, version des rendus de pix2hdr : seul celui de 5.1 a été lu ;
- la cause du biais de `SunCalc.getTimes` (la constante `J0`) : le biais est mesuré, sa cause
  est déduite ;
- que `@gltf-transform` conserve `KHR_lights_punctual` à travers `dedup`, `prune`, `reorder` dans
  `gltf_compress.mjs` (vraisemblable : l'extension est enregistrée par `ALL_EXTENSIONS`, `:36`) ;
- le plafond de lampes que three.js r160 tient dans Atlas (O10) ;
- le sens que le CNIG donne à `MN` (A2 reste une convention des deux projets, à confirmer) ;
- que la version SunCalc chargée par `index_v7.html` (unpkg `suncalc@1.8.0`) est identique à la
  copie vendorisée mesurée ici.

*Sources principales : `pix2hdr/docs/{SPEC-ATLAS-OBJETS-0.1.md, PROPOSITIONS-ATLAS-OBJETS-0.2-BROUILLON.md,
SUITES-EN-ATTENTE.md, schemas/atlas-objets-0.1.schema.json}`, `pix2hdr/experiments/anime/structure/{README.md,
contrat_mobiles_0.1.json, regles_animation.json}`, `pix2hdr/experiments/menuiseries/generateurs/{etats.py,
parametres.py, README.md}`, `pix2hdr/experiments/eclairage/{generation/common.py, generation/photometrie.py,
generation/rendu_blender.py, generation/README.md, normes/eclairage.json, normes/correspondance.md}`,
`pix2hdr/experiments/shadows/ortho_shadows.py`, `pix2hdr/experiments/correction/common.py`,
`pix2hdr/experiments/service/{README.md, gltf.py}`, `pix2hdr/src/pairs/sun.py`, `gn_lib/{objseed.py,
export_gltf.py, gltf_compress.mjs}`, l'exportateur glTF de Blender 5.1, et côté Atlas `app_v7.js`,
`lib/scene-prefs.js`, `packages/atlas-app/www/vendor/suncalc.js`.*
