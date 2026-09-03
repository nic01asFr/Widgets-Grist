# Cadrage — Animation dans Atlas (étude)

> 26/08/2026 · état : **étude**, pas encore de spec d’implémentation.
> Objectif : intégrer le *principe* d’animation de façon **utile** et **optimale**
> dans l’architecture actuelle (MapLibre + custom layer three.js / InstancedMesh).

---

## 1. Ce qu’Atlas anime déjà (sans le dire)

| Mécanisme | Nature | Frame loop ? |
|---|---|---|
| Récit (`story.steps`) | Transitions caméra / soleil / couches | ease MapLibre, pas squelette |
| Soleil (`timeOfDay`) | Relighting directionnel | à l’événement |
| Contrôles `mode: simulation` | Filtre temporel / scénario | UI, pas 3D |
| Custom layer `render()` | Appelé quand MapLibre repaint | **passif** (pas de boucle propre) |

Les modèles GLB (`Models3D`) sont des **poses figées** : `InstancedMesh` jusqu’à
20k objets, culling viewport, gate globe z&lt;12. Aucun `AnimationMixer`, aucun
clip GLTF lu.

Conséquence : toute animation continue **oblige** `map.triggerRepaint()` tant
qu’elle tourne — sinon MapLibre ne rappelle pas `render()`.

---

## 2. Usages utiles (métier Atlas, pas « jeu »)

Priorité par **valeur narrative / opérationnelle** × **coût moteur**.

### A — Acteurs de récit (fort)

1–5 personnages / véhicules le long d’un trajet, synchronisés aux étapes du
récit (visite de site, parcours usager, agent de terrain).

- Cas : démo Vieux-Port, visite de chantier, parcours PMR, récit prévention.
- Besoin : GLB skinné + clip `walk`/`idle` + position le long d’une polyline
  (ou waypoints).

### B — Ambiance locale (moyen)

Quelques piétons / vélos en boucle courte dans l’emprise visible, **uniquement**
zoom ≥ 15–16, pour « faire vivre » la maquette sans prétendre à une simu trafic.

- Plafond strict (ex. 8–16 agents).
- LOD : au loin = billboard / rien ; de près = squelette.

### C — Simulation attributaire (déjà amorcée)

Inondation, scores, filtres temporels : **pas** du squelette 3D — continuer via
contrôles / symbolisation / `fill-extrusion` (Atlas + qgis2grist). L’animation
ici = *morphing de style / visibilité*, pas de mixer.

### D — Procédural léger (faible priorité)

Vent sur arbres, clignotement feux : souvent shader / UV offset, rarement un
second pipeline d’acteurs. À traiter à part si un jour.

### Hors scope volontaire

- Foule (centaines d’agents animés)
- Physique / collisions
- Cinématique cinéma hors carte (mieux : export vidéo hors Atlas)

---

## 3. Contrainte centrale : deux pipelines, pas un

```
                    ┌─────────────────────────────┐
   Points « décor » │  InstancedMesh (actuel)     │  × milliers
   lampadaires…     │  pose figée, batch GPU      │
                    └─────────────────────────────┘

                    ┌─────────────────────────────┐
   Acteurs « vivant»│  Object3D clonés + Mixer    │  × dizaines max
   personnage…      │  update(dt) chaque frame    │
                    └─────────────────────────────┘
```

**Ne pas animer les InstancedMesh** (skinned mesh + instance = fragile /
coûteux). Séparer :

- `Models3D` = décor (inchangé)
- `Actors3D` (nom de travail) = acteurs animés, même custom layer / même
  origine locale / même `placement()` relief

Partage : cache GLTF, origine mercator, lumières, gate globe, `elevRaw`.

---

## 4. Trois approches d’intégration

### Approche 1 — « Actor overlay » minimal (recommandée en V1)

Nouveau module `lib/actors-3d.js` branché dans le `render()` existant :

1. Liste courte d’acteurs (`id`, `gltf_url`, `clip`, `path` / `lnglat`, `playing`)
2. Au boot / étape récit : spawn / play / pause / seek
3. `mixer.update(dt)` + `map.triggerRepaint()` tant qu’au moins un clip tourne
4. Persistance : fragment Scene Manifest optionnel `actors[]` **ou**
   `story.steps[].state.actors` (plus naturel pour le récit)

**Pour** : isole le risque ; n’alourdit pas le catalogue 20k ; sert d’abord le
récit (cas A).
**Contre** : pas d’édition riche dans l’inspecteur au début.

### Approche 2 — Étendre le mode `library` / features

Chaque point d’une couche modèle peut porter `animation: { clip, loop, speed }`
et bascule automatiquement hors instance si `clips.length > 0`.

**Pour** : un seul modèle mental « couche de points 3D ».
**Contre** : `build()` devient hybride ; risque de régressions décor ; coût
imprévisible si quelqu’un active l’anim sur 500 feux.

### Approche 3 — Moteur externe (lottie / vidéo / iframe)

Animer hors three.js (sprite billboard vidéo, Lottie 2D).

**Pour** : rapide pour marketing.
**Contre** : casse l’intégration relief / ombres / soleil Atlas ; hors contrat
interop Cerema.

---

## 5. Recommandation

**V1 = Approche 1, bornée au récit (cas A)** :

| Élément | Choix |
|---|---|
| Pipeline | `Actors3D` à côté de `Models3D`, même custom layer |
| Plafond | ~16 acteurs actifs ; 1–2 clips simultanés lourds |
| Déclenchement | `story.steps[].state.actors` + play/pause récit |
| Assets | GLB avec clips nommés (`Walk`, `Idle`) ; URL dans le pack portable |
| Frame loop | `triggerRepaint` conditionnel (`actors.needsRepaint`) |
| Contrats | **ne pas** forcer dans Scene Manifest 0.2.2 core ; extension Atlas
| `actors` versionnée (`0.1`) consommée seulement par Atlas |
| Mobile / `?no3d` / `light3d` | acteurs coupés comme les modèles |

V2 éventuelle : ambiance (cas B) avec pool + LOD.  
V3 : édition dans l’inspecteur + table Grist `Atlas_Actors` si besoin collab.

---

## 6. Points d’accroche code (sans toucher encore)

| Lieu | Rôle |
|---|---|
| `Models3D.makeLayer().render` | `Actors3D.tick(dt)` avant `renderer.render` |
| `captureStoryState` / `applyStoryState` | snapshot acteurs (playhead, clip, visible) |
| `monterSceneExterne` | lire `manifest.actors` / `story…actors` |
| `?no3d` / `CONFIG.light3d` | short-circuit |
| Catalogue | ne pas mélanger ; acteurs ≠ `Pedestrian.glb` figé du set colored |

---

## 7. Critères de succès (si on implémente)

1. Un personnage marche 30 s sur le quai du Vieux-Port pendant une étape récit,
   sans casser lampadaires / bâti / relief.
2. FPS acceptable (≥ 30) sur machine cible avec scène OSM 1k bâtiments + décor.
3. Pause récit = pause mixer ; quitter récit = dispose acteurs.
4. Pack portable (`?scene=`) autonome (GLB en URL relative résolue).
5. Zéro régression tests `Models3D` / story symbolization.

---

## 8. Décision attendue

Avant spec / plan :

1. Valider le périmètre **V1 = acteurs de récit seulement** ?
2. Asset : GLB libre fourni (ex. Kenney / Ready Player) ou placeholder catalogue ?
3. Extension manifeste `actors` Atlas-only OK (hors gel Cerema 0.2.2) ?

---

## 10. Timeline de récit — édition par étape (intention produit)

> Reformulation utilisateur (26/08) : configurer **pour une étape** comment y
> inclure des animations ; pouvoir les **créer / ajuster** ; prévoir édition,
> affichage et structuration d’une **timeline** liée au récit (par étape +
> transitions + objets) — le tout **simple** à comprendre, configurer, afficher.

### L’idée en une phrase

Le récit reste une **suite d’étapes** (Atlas actuel). Chaque étape ouvre une
**mini-timeline locale** où l’on attache des animations aux objets qui comptent.
Entre deux étapes : une **transition** explicite (caméra + objets qui
traversent). On n’invente pas un second logiciel : on rend visible le temps du
récit.

### Modèle mental (3 niveaux, pas plus)

```
Récit
├── Étape 1  [durée T1]          ← carton + état de scène (déjà là)
│   ├── piste Caméra             (souvent figée *dans* l’étape ; ease = transition)
│   ├── piste « Voiture »        clips / t sur path sur [0 … T1]
│   └── piste « Couche X »       visible / style (optionnel, avancé)
├── Transition 1→2  [durée R1]   ease caméra + tween objets communs
├── Étape 2  [durée T2]
│   └── …
└── …
```

| Niveau | Ce qu’on configure | Ce que l’utilisateur voit |
|---|---|---|
| **Récit** | Ordre des étapes (rail déjà Atlas) | Liste / lecteur 1/N |
| **Étape** | Durée, carton, état, **animations de l’étape** | Panneau Récit + bande temps de *cette* étape |
| **Transition** | Durée, ease, quoi interpoler | Segment entre deux pastilles |

### Où se décide l’animation ? (réponse nette)

**Dans l’étape** = lieu de création / réglage (clips, path, intensité).  
**Sur la transition** = seulement ce qui **relie** deux keyframes d’étapes
voisines (ex. voiture de `t=0.2` à `t=0.6`).  
**Pas** une timeline globale opaque dès le V1 — trop lourd à comprendre. Une
vue « fil de récit » (étapes + transitions) suffit ; on zoome dans une étape
pour éditer ses pistes.

### Objets concernés (progressive disclosure)

1. **Toujours simple** : acteur sur path (trajet), apparition/disparition.
2. **Ensuite** : calques (visibilité, avant/après aménagement) comme pistes
   « instantané » (hold), pas forcément interpolées.
3. **Plus tard** : foule / flux = autres moteurs, branchés comme pistes
   d’ambiance si besoin — pas dans le même éditeur de clips GLB.

### Simplicité (règles produit)

1. **Une étape = un carton + un temps local.** Pas d’horloge 0…∞ obligatoire.
2. **Par défaut : 0 animation.** Ajouter une piste = geste explicite (« + Anim
   sur cette étape »).
3. **Une piste = un objet** (ou une couche). Pas de graphe de contraintes.
4. **Lecture** : play étape → joue ses pistes ; suivant → joue la transition
   puis l’étape suivante (comme aujourd’hui, avec du temps en plus).
5. **Édition** : on ajuste sur la **bande de l’étape ouverte**, pas sur un
   mur de pistes global (qui reste une vue lecture optionnelle plus tard).

### Affichage UI (esquisse)

- Rail récit existant (étapes) + sous chaque étape ouverte : **bande 0…T** avec
  blocs d’anim (scrub, durée clip).
- Entre deux pastilles : pastille « transition » (durée).
- Mode lecture : scrubber unique *de l’étape courante* ; le « fil » global
  reste le 1/N actuel enrichi ( barre de progression étape + transition).

### Continuum visuel — distinguer sans séparer (arbitrage UX 26/08)

Ce n’est **pas** « timeline locale **ou** timeline globale ». Les deux niveaux
sont la **même bande**, lue à deux échelles.

```
FIL RÉCIT (toujours visible en mode récit)
│████ Étape 1 ████│░░ Trans 1→2 ░░│████ Étape 2 ████│░░ Trans ░░│███ …
│  carton + T1    │  ease R1      │  carton + T2    │           │

DÉTAIL (quand une étape est sélectionnée / ouverte)
        └─ pistes de *cette* étape alignées sous le segment ████
           Caméra  ────●────────────
           Voiture ──────[drive]────
           Soleil  ─●───────────────
```

| Intention | Comment le continuum le montre |
|---|---|
| **Distinguer** | Étape = bloc plein (couleur récit) ; Transition = segment hachuré / plus bas / autre teinte ; piste = ligne sous le bloc actif |
| **Continuer** | Une seule règle de temps gauche→droite ; playhead unique ; pas deux scrubbers concurrentiels |
| **Éditer sans noyer** | Pistes dépliées **seulement** sous l’étape focus ; les autres étapes restent des blocs compacts sur le fil |
| **Lire** | Le playhead traverse étape → transition → étape ; le carton suit l’étape courante |

Règles visuelles (simples) :

1. **Même axe, deux densités** — fil compact (structure) + détail (contenu de l’étape).
2. **Transition ≠ étape** — hauteur, motif ou opacité différente ; jamais le même look qu’un carton.
3. **Un seul playhead** — collé au fil ; le détail d’étape scrolle / zoome *avec* lui, il ne le remplace pas.
4. **Focus = expansion** — cliquer une étape ouvre ses pistes *sous* son segment, sans quitter le fil.

Ainsi on **distingue** Récit / Étape+pistes / Transition dans le modèle mental, et on les **intègre** dans une bande continue lisible.

### Rapport aux cas

| Cas | Sur l’étape | Sur la transition |
|---|---|---|
| Trajet voiture | Clip drive, `t` keyframe fin d’étape | Tween `t` le long du path |
| Aménagement | Hold état couches A / B | Fondu ou cut (souvent cut + durée courte) |
| Foule / flux | Piste ambiance on/off (V2) | Rarement |
| Monument-héros (GLB) | Caméra orbit / focus + soleil / clip idle éventuel | Ease caméra vers le prochain lieu |

---

## 11. Cas « scène lieu / monument GLB » (Marseille, ambiances)

Autre intention : charger un **GLB détaillé** pour *présenter et raconter* un
lieu — pas pour faire marcher un agent. Ex. raconter Marseille, ses lieux et
ambiances ; poser Notre-Dame-de-la-Garde (ou un hôtel de ville) en GLB soigné ;
en faire le tour ; changer lumière / heure / brouillard narratif.

### Ce que c’est (et n’est pas)

| | |
|---|---|
| **C’est** | Un **décor héros** ancré (lng/lat/alt + orientation), admiré par la **caméra** et l’**ambiance** (soleil déjà Atlas) |
| **Ce n’est pas** | Un trajet (path + `t`) ni une foule |
| **Anim principale** | Orbit / truck caméra + `timeOfDay` (+ clip idle du GLB si le fichier en a) |
| **Anim secondaire** | Rare : portes, drapeaux — seulement si le GLB porte des clips nommés |

### Rapport à Atlas actuel

- Catalogue actuel = mobilier (`Car`, `Pedestrian`…) à l’échelle rue, InstancedMesh.
- Un monument détaillé = **un seul Object3D** (hors instance), même custom layer /
  même relief — proche de `Actors3D` côté rendu, mais sémantique **Landmark** /
  `heroMesh`, pas agent.
- Le récit orchestre surtout : **cadrages** (étapes) + **soleil** + éventuellement
  masquage du bâti OSM derrière le GLB (évite le double volume).

### Sur la timeline (§10)

- Piste **Caméra** : keyframes orbit (bearing/pitch/zoom autour du pivot monument).
- Piste **Soleil** : ambiances (aube / midi / blue hour) déjà capturables.
- Piste **Landmark** : visible, clip idle ; pas de `t` sur path.

Enchaînement type : étape « le Vieux-Port » (OSM) → transition → étape « le
monument » (GLB focus, bâti contexte atténué) → tour d’ambiance sur la durée
d’étape → suite du récit.

### Simplicité

Un geste : « Ancrer un GLB sur la carte » + « Capturer le tour » (série
d’étapes ou une étape à durée longue avec keyframes caméra internes). Ne pas
exiger un éditeur d’anim squelette pour ce cas.

### Ce que ça change vs §9

Le §9 disait « captures = keyframes, transitions = tween ». Ici on **ajoute** :
l’étape a une **durée interne** et peut contenir de l’anim *pendant* le carton
(pas seulement à l’arrivée). Les keyframes de début/fin d’étape restent la
couture avec la transition.

### Hors V1 (pour ne pas complexifier)

- Timeline globale type NLE (multi-pistes sur tout le récit)
- Courbes d’ease par propriété façon After Effects
- Physique / foule dense dans le même éditeur
