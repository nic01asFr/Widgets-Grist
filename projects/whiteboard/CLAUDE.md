# Projet : Whiteboard Collaboratif

## Contexte

Widget Grist de tableau blanc interactif pour l'animation de sessions collaboratives (retrospectives, ateliers, brainstorming). Conçu initialement pour une direction territoriale / GIDI.

Fonctionnalités principales :
- Stickies (post-it) avec couleurs, texte, auteur
- Connecteurs entre stickies
- Zones (clusters) pour regrouper des éléments
- Dot-voting (vote par points rouges)
- Timer de session
- Panneau de propriétés
- Minimap de navigation
- Mode collaboratif via polling Grist 3s
- Grille magnétique, zoom, fit-to-screen

## Architecture

```
projects/whiteboard/
├── index.html        # Widget complet (self-contained, ~1200 lignes)
└── CLAUDE.md         # Ce fichier
```

Le widget est **entièrement standalone** — HTML/CSS/JS inline, aucun framework.

## Schéma Grist

Table auto-créée : **`Whiteboard_Elements`**

| Colonne   | Type   | Usage                                    |
|-----------|--------|------------------------------------------|
| `Type`    | Text   | `sticky` / `connector` / `zone`          |
| `Texte`   | Text   | Contenu du sticky ou label zone          |
| `X`       | Numeric| Position X sur le canvas (px logiques)   |
| `Y`       | Numeric| Position Y                               |
| `Largeur` | Numeric| Dimensions                               |
| `Hauteur` | Numeric| Dimensions                               |
| `Couleur` | Text   | Hex couleur de fond du sticky            |
| `Cluster` | Text   | Nom du cluster/zone parent               |
| `Votes`   | Numeric| Nombre de votes dot-voting               |
| `Auteur`  | Text   | Identifiant auteur                       |
| `Liens`   | Text   | Références libres (ex: IDs de tâches)    |

## Conventions spécifiques

- **Polling 3s** : anti-boucle via flag `_writing` + debounce 800ms
- **SVG canvas** : les éléments sont des `<g>` SVG avec foreignObject pour le texte éditable
- **Coordonnées** : espace canvas interne (transformé par viewBox pan/zoom)
- **API Grist** : 100% via `docApi.applyUserActions` (AddRecord / UpdateRecord / RemoveRecord)
- **Introspection** : via `_grist_Tables_column` pour vérifier les types de colonnes existantes

## État actuel (v1.0 — 2026-02)

✅ Stickies CRUD complets (créer, éditer inline, déplacer, redimensionner, supprimer)
✅ Connecteurs entre stickies (flèches)
✅ Zones / clusters avec redimensionnement
✅ Dot-voting avec panel résultats
✅ Timer de session (preset 1/3/5/10/15/20m)
✅ Panneau de propriétés (couleur, texte, cluster, liens)
✅ Multi-sélection avec rectangle de sélection
✅ Minimap
✅ Grille magnétique + aimant
✅ Mode démo (sans Grist)
✅ Adaptation esthétique TaskFlow (palette indigo, Inter, border-radius)

## Vision : Whiteboard Spatial Hiérarchique — 5ème pilier de TaskFlow

Le Whiteboard est conçu pour devenir un espace de travail **contextuel, spatial et navigable**,
complémentaire aux 3 vues TaskFlow :

```
Kanban    → Vue par statut (colonnes)
Gantt     → Vue par temps (barres horizontales)
Calendar  → Vue par date (grille calendaire)
Whiteboard → Vue spatiale hiérarchique — navigation par zoom
              ├── Niveau 0 : canvas libre (vue projet, grille temporelle trimestrielle)
              ├── Niveau 1 : whiteboard de zone/projet (vue mensuelle/hebdo)
              ├── Niveau N : whiteboard de tâche/élément (vue journalière)
              │     ├── Stickies libres + notes + moodboard
              │     ├── Éléments media (iframe, image, lien, markdown)
              │     └── Slider : multi-whiteboards par élément
              └── Grille temporelle unifiée — cohérente à travers les niveaux
```

**Ce qui est unique** : aucun outil existant (Miro, FigJam, Notion, Figma, Prezi) ne lie
données structurées + navigation spatiale par zoom + hiérarchie de contextes + grille temporelle.

| Critère | Miro/FigJam | Notion | Ce Whiteboard |
|---------|------------|--------|---------------|
| Canvas spatial | ✓ | — | ✓ |
| Données liées (Grist) | — | — | ✓ |
| Navigation zoom-in hiérarchique | — | — | ✓ |
| Grille temporelle | — | — | ✓ |
| Hiérarchie projet/tâche/sous-tâche | — | ✓ | ✓ |
| Moodboard attaché aux éléments | — | — | ✓ |

---

## Étude : Intégration avec TaskFlow

### Objectif

Permettre au whiteboard de dialoguer avec les widgets Kanban / Gantt / Calendar de TaskFlow via la mécanique standard Grist de **sélection croisée**.

### Mécanisme Grist disponible

```javascript
// Émission (tous les widgets)
grist.setSelectedRows([taskId]);

// Réception (tous les widgets)
grist.onRecord((record) => { /* record.id = tâche sélectionnée */ });
```

### Concept : "Sticky lié à une tâche"

La colonne `Liens` du sticky peut stocker l'ID numérique d'une tâche TaskFlow.

**Exemple** : sticky avec `Liens = "42"` est associé à la tâche #42 du Kanban.

### Intégration Sens 1 — Whiteboard → TaskFlow (simple)

**Déclencheur** : clic sur un sticky dont `Liens` contient un entier.

```javascript
// Dans le handler de clic sur un sticky
const taskId = parseInt(sticky.liens);
if (!isNaN(taskId)) {
    grist.setSelectedRows([taskId]);
    // → Kanban/Gantt/Calendar highlightent automatiquement la tâche
}
```

**Complexité** : très faible — 3 lignes dans le handler de sélection existant.

### Intégration Sens 2 — TaskFlow → Whiteboard (modéré)

**Déclencheur** : un autre widget sélectionne une tâche.

```javascript
grist.onRecord((record) => {
    if (!record?.id) return;
    const linked = elements.find(e => parseInt(e.liens) === record.id);
    if (linked) {
        // Centrer le canvas sur ce sticky
        centerOnElement(linked);
        // Highlight visuel temporaire
        highlightElement(linked.id);
    }
});
```

**Complexité** : modérée — nécessite une fonction `centerOnElement()` calculant
le pan nécessaire pour ramener l'élément au centre du viewport.

### Intégration Sens 3 — Création rapide de sticky depuis une tâche (avancé)

Option future : bouton dans TaskFlow "Créer sticky" qui pré-remplit un sticky
avec le titre de la tâche et positionne `Liens = task.id`.

Nécessiterait une communication inter-widget non standard (non recommandé
avec l'architecture actuelle — Grist ne permet pas d'écrire dans la table
d'un autre widget directement).

#---

## Grille temporelle intelligente

### Concept

La grille pixel actuelle (`--grid-c`/`--grid-maj`, 25px/125px) peut être remplacée
par une grille temporelle où l'axe X = temps.

### Comportement adaptatif au zoom

```
Zoom < 20%   → Trimestres + Années  (Q1/Q2/Q3/Q4)
Zoom 20-50%  → Mois                 (Jan, Fév, Mar...)
Zoom 50-150% → Semaines             (Sem. 12, Sem. 13...)
Zoom 150%+   → Jours                (Lun 17, Mar 18...)
```

### Calcul de la position temporelle

```javascript
// Convertir une date en coordonnée X canvas
function dateToX(date) {
    const msPerDay = 86400000;
    const origin = new Date('2024-01-01');  // date d'origine configurable
    const days = (date - origin) / msPerDay;
    return days * PIXELS_PER_DAY;  // PIXELS_PER_DAY = 80px (configurable)
}
```

### Rendu de la grille temporelle

La grille est rendue dans le `<pattern id="gl">` existant, remplacé dynamiquement
selon le niveau de zoom. Des `<text>` SVG affichent les marqueurs de temps.

### Intégration tâches

- Tâches avec `dateDebut` → positionnées automatiquement sur X=dateToX(dateDebut)
- Drag horizontal → reschedule (met à jour `dateDebut` + `dateEcheance` en gardant durée)
- Jalons (`type='jalon'`) → losanges ◆ sur la grille à leur date
- Réunions (`type='reunion'`) → rectangles avec fond hachuré + heure
- Axe Y libre : par défaut libre (drag vertical), ou switch "swimlanes" par projet/personne

### Toggle

Bouton toolbar supplémentaire "Grille temporelle" (icône calendrier SVG).
La grille temporelle est optionnelle et coexiste avec les stickies libres.
Les stickies sans `TaskRef` restent flottants (non contraints par l'axe X).

---

## Éléments riches (type media — moodboard)

### Nouveau type dans Whiteboard_Elements

```
Type = 'media'
Sous-types (stockés dans Couleur ou via champ dédié) :
  'iframe'   → URL embarquée dans foreignObject <iframe>
  'image'    → URL d'image (<image> SVG ou <img> en foreignObject)
  'link'     → Carte URL (titre + description, preview Open Graph via proxy)
  'markdown' → Texte riche rendu (pas juste texte brut)
```

### Structure SVG d'un sticky media

```
<g class="sg media-sticky" data-id="..." data-media-type="iframe">
  <rect class="sy">  (fond blanc avec coin coloré selon type)
  <foreignObject>
    <div class="media-container">
      <!-- iframe pour type=iframe -->
      <iframe src="${el.text}" sandbox="allow-scripts allow-same-origin"/>
      <!-- img pour type=image -->
      <img src="${el.text}" style="width:100%;height:100%;object-fit:contain"/>
      <!-- lien pour type=link -->
      <a href="${el.text}" target="_blank">
        <div class="link-preview">...</div>
      </a>
    </div>
  </foreignObject>
  <rect class="sb">  (bordure sélection)
</g>
```

### Rattachement à une tâche (groupes solidaires)

Un élément média peut être rattaché à un sticky tâche via le champ `Cluster`
(Ref vers le sticky tâche). Quand la tâche est déplacée, ses média suivent.

```javascript
// Dans onUp() après le drag, étendre la logique de groupe :
if (draggedEl.type !== 'zone') {
    // Déplacer aussi les média rattachés à ce sticky
    for (const [mid, mel] of S.els) {
        if (mel.cluster === draggedId && mel.type === 'media') {
            mel.x += dx; mel.y += dy;
            GB.upd(mid, { X: mel.x, Y: mel.y });
            updDOM(mid);
        }
    }
}
```

### Disposition automatique des média autour d'une tâche

Quand un média est rattaché à une tâche, il se positionne automatiquement
à droite ou en bas du sticky tâche, en ligne. Les média flottent librement
sinon (même comportement que les stickies libres).

### Outil "Ajouter média"

Nouveau tool dans la toolbar : `data-tool="media"` avec sous-menu :
- 🖼 Image (URL)
- 🔗 Lien
- 📄 Iframe
Clic sur le canvas → prompt URL → sticky média créé.

---

## Navigation Hiérarchique — Zoom Infini

### Concept central : le zoom comme navigation

Le canvas n'est pas une loupe — c'est un **portail**. Zoomer sur un élément n'agrandit
pas l'élément : cela *entre dedans*. Chaque sticky/zone devient un espace explorable.

```
Niveau 0 — Vue Projet (zoom 5-30%)
  ├── Zone "Alpha" ──zoom→ Niveau 1 (whiteboard du projet)
  │     ├── Sticky Tâche #42 ──zoom→ Niveau 2 (whiteboard de la tâche)
  │     │     ├── Stickies libres, notes, moodboard
  │     │     └── Slider : [Brainstorming] [Sprint 3] [Réunion 12/02] [+]
  │     └── Sticky Tâche #43 ──zoom→ ...
  └── Zone "Beta" ──zoom→ Niveau 1 ...
```

### Architecture de données

#### Principe : une seule table, un seul champ `ContextRef`

Pas de tables séparées par niveau. Tous les éléments restent dans `Whiteboard_Elements`,
discriminés par `ContextRef` (nullable = niveau racine).

```
Whiteboard_Elements :
  id=1, Type=zone,   Texte="Projet Alpha", ContextRef=null   → racine
  id=5, Type=sticky, Texte="Tâche #42",   ContextRef=1      → dans Projet Alpha
  id=9, Type=sticky, Texte="Note brainstorm", ContextRef=5   → dans Tâche #42
```

| Colonne nouvelle | Type | Usage |
|-----------------|------|-------|
| `ContextRef` | Int | ID de l'élément parent (null = racine) |

#### Table `WB_Contexts` — multi-whiteboards par élément

Chaque élément peut avoir N whiteboards nommés, navigués via un slider.

```
WB_Contexts :
  id=1, ParentRef=5, Index=0, Label="Brainstorming", CreatedAt=...
  id=2, ParentRef=5, Index=1, Label="Sprint Planning"
  id=3, ParentRef=5, Index=2, Label="Réunion 12/02"
```

`ContextRef` dans `Whiteboard_Elements` pointe vers un `WB_Contexts.id`.

### Espace de coordonnées unifié

La grille temporelle utilise le **même référentiel** à tous les niveaux.
`X = dateToX(date)` est identique partout — seul le scale (zoom) change.

```
Niveau 0 (projet) :   |------Q1------|------Q2------| zoom = 5%
  Zone Alpha : X = dateToX('2026-01-01') → dateToX('2026-06-30')

Zoom dans Zone Alpha → Niveau 1 :   zoom = 30%
  |-----Jan-----|-----Fév-----|-----Mar-----|
  Tâche #42 : X = dateToX('2026-01-15'), largeur = durée * PX_PER_DAY

Zoom dans Tâche #42 → Niveau 2 :   zoom = 80%
  |--Sem12--|--Sem13--|--Sem14--|--Sem15--|
  Stickies libres positionnés librement (ou ancrés temporellement)
```

Un élément sans date reste **flottant** (pas contraint par l'axe X).

### Mécanique d'entrée / sortie

**Entrée dans un contexte** (3 modalités) :
- Scroll/pinch au-delà de 3× sur un élément → bordure glow pulsante → continuer → entrée
- Double-clic sur l'élément → entrée immédiate
- Bouton "Explorer" dans le panneau propriétés

**Sortie** (2 modalités naturelles) :
- Pinch out / scroll out au minimum zoom déjà atteint → animation shake + remontée d'un niveau
- Clic sur un nœud du breadcrumb → retour direct à ce niveau

**Feedback visuel de profondeur** :
- Fond canvas : légèrement plus clair à chaque niveau (--canvas-bg teinté)
- Ombre portée de l'élément parent visible en bordure de viewport ("tu es *dedans* ça")
- Breadcrumb panel top-left : `Projet Alpha > Tâche #42 > Brainstorming`

### État de navigation

```javascript
// État de contexte
S.context = {
    stack: [],   // [{ id, label, type, x, y, wbContextId }]
    wbIdx: 0,    // index du whiteboard actif pour cet élément
};

// Entrer dans l'élément
function enterContext(elementId, wbContextId) {
    const el = S.els.get(elementId);
    S.context.stack.push({ id: elementId, label: el.texte, wbContextId });
    if (el.taskRef) panToDateRange(el.dateDebut, el.dateEcheance);
    render();
}

// Sortir d'un niveau
function exitContext() {
    if (S.context.stack.length === 0) return;
    S.context.stack.pop();
    render();
}
```

### Slider multi-whiteboards

Barre basse visible uniquement quand on est dans un contexte :

```
← | [Brainstorming] [Sprint 3] [Réunion 12/02] | + Nouveau →
```

Chaque onglet = un `WB_Contexts` row. Cliquer charge les éléments filtrés par ce `wbContextId`.

---

## Recommandation d'implémentation

### Phasing consolidé

#### Bloc A — Mode TaskFlow (données liées)

| Phase | Contenu | Effort |
|-------|---------|--------|
| **1** | `TaskRef: Int` + sélection WB→TF (`setSelectedRows`) | ~3h |
| **2** | Rendu structuré tâches (barre priorité, badge statut, initiales assigné, progress) | ~5h |
| **3** | Grille temporelle intelligente (toggle + zoom adaptatif + snap date) | ~6h |
| **4** | Éléments média (`iframe`, `image`, `link`, `markdown`) | ~5h |
| **5** | Groupes solidaires média↔tâche (déplacement lié) | ~3h |
| **6** | Sélection bidirectionnelle TF↔WB (`Ref:Tasks` + onRecord étendu) | ~2h |

#### Bloc B — Navigation hiérarchique (zoom infini)

| Phase | Contenu | Prérequis | Effort |
|-------|---------|-----------|--------|
| **7** | `ContextRef: Int` dans SCHEMA + filtrage contextuel | Phase 1 | ~4h |
| **8** | Zoom-in entry/exit + animation de transition | Phase 7 | ~6h |
| **9** | Breadcrumb panel + stack de navigation | Phase 8 | ~3h |
| **10** | Table `WB_Contexts` + slider multi-whiteboards | Phase 7 | ~4h |
| **11** | Héritage temporel entre contextes | Phases 3+8 | ~4h |

---

**Phase 1** :
1. Ajouter `{ id: 'TaskRef', t: 'Int', l: 'Tâche liée' }` au `SCHEMA`
2. Le bootstrap crée la colonne automatiquement (code déjà en place)
3. Dans `GB.applyData()` : lire `data.TaskRef?.[i] || 0` → `el.taskRef`
4. Dans click handler : si `el.taskRef > 0` → `grist.setSelectedRows([el.taskRef])`
5. Dans props panel : champ "Tâche liée" (input numérique)

**Phase 2** :
1. `S.taskCache = new Map()` — cache données Tasks
2. `GB.loadTaskflowData()` — fetchTable Tasks + Team + Projects si détectés
3. `renTaskSticky(id, el)` — barre priorité, badge statut, initiales assigné, progress
4. `buildConns()` étendu — connecteurs de dépendances (bleus, tirets)

**Phase 3 — Grille temporelle** :
1. Toggle toolbar "Grille temporelle" (icône calendrier SVG)
2. `dateToX(date)` — conversion date → coordonnée X canvas
3. Rendu SVG dynamique : marqueurs de temps adaptés au zoom
4. Jalons (◆) et réunions (fond hachuré) positionnés automatiquement sur X

**Phase 4 — Éléments média** :
1. `type = 'media'` — nouvelle valeur dans le Choice du schéma
2. `renMediaSticky(id, el)` — branche dans `ren(id)` selon sous-type (iframe/image/link)
3. Tool "média" avec sous-menu dans la toolbar
4. Drag = déplacement comme sticky normal

**Phase 5 — Groupes solidaires** :
1. Drag d'un sticky tâche → déplace aussi ses média rattachés (cluster = id tâche)
2. Auto-disposition des média autour de leur tâche à la création

**Phase 6 — Sélection bidirectionnelle** :
1. Passer `TaskRef` de `Int` à `Ref:Tasks` dans SCHEMA
2. Configurer "Select By" sur Tasks dans Grist
3. Étendre `onRecord` pour centrer canvas sur le sticky de la tâche sélectionnée

**Phase 7 — Contextes hiérarchiques** :
1. Ajouter `{ id: 'ContextRef', t: 'Int', l: 'Contexte parent' }` au `SCHEMA`
2. Ajouter `{ id: 'WbCtxId', t: 'Int', l: 'Whiteboard' }` au `SCHEMA`
3. `GB.applyData()` : lire `el.contextRef` et `el.wbCtxId`
4. `S.context = { stack: [], wbCtxId: null }` — état de navigation
5. `render()` filtre sur `ctxFilter()` : éléments dont `contextRef === currentContextId`
6. Créer table `WB_Contexts` via SCHEMA (ParentRef, Index, Label, CreatedAt)

**Phase 8 — Zoom-in entry/exit** :
1. Dans `onWheel` : si zoom ≥ 3× sur un élément → `showEnterHint(elementId)` (bordure glow)
2. Si zoom ≥ 5× sur même élément → `enterContext(elementId)` (ou clic sur hint)
3. `enterContext(id, wbCtxId)` : push stack + pan vers zone temporelle de l'élément + render
4. `exitContext()` : pop stack + pan retour + render
5. Dezoom au minimum → `exitContext()` avec shake CSS animation
6. Double-clic sur sticky/zone → `enterContext` direct
7. Transition visuelle : scale CSS 0.9→1 + fade fond canvas (teinté par profondeur)

**Phase 9 — Breadcrumb panel** :
1. `<div id="breadcrumb">` fixé top-left, visible si `S.context.stack.length > 0`
2. Rendu : `Projet Alpha > Tâche #42 > Brainstorming` — chaque nœud cliquable
3. Clic nœud N → `exitContextTo(n)` (pop jusqu'au niveau N)
4. Icône par type : zone=⬜ sticky=📝 task=✓

**Phase 10 — Slider multi-whiteboards** :
1. `<div id="wbSlider">` fixé bas de page, visible si dans un contexte
2. Charger `WB_Contexts` rows pour le `parentRef` courant
3. Onglets cliquables : `[Label 1] [Label 2] [+ Nouveau]`
4. Cliquer onglet → `S.context.wbCtxId = wbCtxId` + re-filter render
5. "Nouveau" → prompt label → `AddRecord` dans `WB_Contexts` → switch vers ce contexte

**Phase 11 — Héritage temporel** :
1. `enterContext()` : si grille temporelle active + élément a `dateDebut` → pan X automatique
2. Zoom inherit : entrer dans un élément positionne le viewport sur sa fenêtre temporelle
3. Elements flottants (sans date) : Y libre, X libre (grille temporelle non contraignante pour eux)
4. En sortant : restaurer le pan/zoom du niveau parent (sauvé dans le stack)

### Contrainte importante

Le whiteboard utilise sa propre table `Whiteboard_Elements` — il n'est pas
attaché à la table `Tasks` de TaskFlow via la config "Select By" standard.
La sélection croisée fonctionne néanmoins car elle passe par l'ID de ligne,
**à condition que les deux widgets soient dans le même document Grist**.

Pour que `grist.setSelectedRows()` du whiteboard soit capté par TaskFlow :
- Le widget TaskFlow doit avoir son `Select By` configuré sur une widget
  liée à la même table, **OU** écouter via `grist.onRecord()` directement.
- En pratique, `setSelectedRows` émet globalement et TaskFlow reçoit si
  sa table est `Tasks` et que l'ID correspond.

## Points d'attention

- Le polling 3s peut créer une légère latence en mode collaboratif
- Le SVG `foreignObject` a des limites dans certains navigateurs (Firefox)
  pour l'édition inline — testé principalement sur Chrome/Edge
- Les coordonnées X/Y stockées sont en espace canvas (avant transform),
  la conversion viewport↔canvas doit passer par `screenToCanvas()`
- **Navigation hiérarchique** : le polling 3s doit filtrer sur le `WbCtxId` courant
  pour ne pas charger tous les éléments de tous les contextes à chaque tick
- **`ContextRef` circulaire** : à valider côté API — éviter qu'un élément soit
  son propre parent (validation simple avant `AddRecord`)
- **Performance** : avec N niveaux et beaucoup d'éléments, envisager une pagination
  par contexte (charger uniquement les éléments du niveau visible)
- **Coordonnées X/Y** dans les contextes enfants : restent absolues dans l'espace
  temporel global — attention à ne pas les interpréter comme relatives au parent
