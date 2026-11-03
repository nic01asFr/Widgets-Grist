# Cadrage — Binding complet Atlas v7 × qgis2grist × offre de l'organisation

> Synthèse juillet 2026 — après tour d'horizon style, controls, récit, QGIS Atlas.
> Objectif : interop fonctionnelle et cohérente bout-en-bout (QGIS → Grist → Atlas → storymap).

---

## 1. Vision cible

```
QGIS (.qgs / QField / BigQgisMCP)
        │
        ▼
   qgis2grist v2  ──►  Grist (tables + SceneManifest + QgisWidgets)
        │                      │
        │                      ├── Atlas_LayerPrefs  (overrides user)
        │                      └── Atlas_Story       (récit collaboratif)
        ▼
   Atlas v7 widget  ──►  présentation web (symbo + controls + récit + 3D)
        │
        ▼
   qgis-sspcloud storymap DSFR  (publication institutionnelle — aval)
```

**Pivot unique** : Scene Manifest V0.2 étendu (`style.declarative`, `layers[].controls`, `story.steps[]`, `panels[]`).

**Règle repo** : dev dans `projects/` ; `published/` sur demande explicite.

---

## 2. État actuel (✅ fait)

### Atlas v7 (`projects/Atlas/`)

| Brique | Fichiers | Statut |
|--------|----------|--------|
| Lecture Scene Manifest | `lib/scene-loader.js` | ✅ |
| StyleDeclarative → symbo | `lib/declarative-style.js` | ✅ fixe / cat / gradué + `_rawKey` |
| Round-trip symbo | `lib/manifest-binding.js` | ✅ `declarativeFromAtlasLayer` |
| ControlDeclarative (runtime) | `lib/controls.js` | ✅ range / select / time |
| Lecture manifest controls | `lib/manifest-binding.js` | ✅ prêt (amont vide) |
| Prefs Grist | `lib/grist-sync.js` → `Atlas_LayerPrefs` | ✅ style + controls + declarative |
| Module Contrôles UI | `app_v7.js` | ✅ |
| Récit capture/replay | `lib/story.js` + `app_v7.js` | ✅ caméra + visibilité + controls + symbo |
| Export JSON binding | `buildProject()` v2.2 | ✅ `storyManifest` + `declarative` |
| Tests | `tests/*.test.js` | ✅ 34/34 |
| Doc test manuel | `docs/MANUAL_TEST.md` | ✅ |

### qgis2grist v2 (`projects/qgis2grist/`)

| Brique | Statut |
|--------|--------|
| Import données + QML → StyleDeclarative | ✅ |
| Table SceneManifest (append) | ✅ |
| Config QgisWidgets v3 | ✅ |
| BigQgisMCP meta (slider, inferredStyles) | ✅ runtime + `manifest.meta` |
| **`layers[].controls`** | ✅ Phase A (`controls-from-layer.js`) |
| **`story.steps[]`** (layout Atlas QGIS) | ❌ |
| Parse print layouts / Atlas `.qgs` | ❌ |

---

## 3. Lacunes — ce qui empêche la cohérence bout-en-bout

| # | Lacune | Impact |
|---|--------|--------|
| L1 | ~~qgis2grist n'émet pas `controls[]`~~ | ✅ Phase A — bees + marseille validés auto |
| L2 | Gradué BigQgisMCP ≠ filtre range Atlas | Sémantique simulation flood non alignée |
| L3 | Pas d'import QGIS Print Atlas → story | Récit 100 % manuel ; pas de lien QGIS Atlas |
| L4 | Encarts récit limités (titre + texte) | Narration pauvre vs layout QGIS (labels, légendes) |
| L5 | Spec Scene Manifest `story` / `panels` non formalisée côté offre | interop `interactive_map` / DSFR bloquée |
| L6 | Validation manuelle Bee Farming non faite | Binding non certifié en conditions réelles |
| L7 | Pas de publication `published/atlas/` | Déploiement gh-pages absent |

---

## 4. Plan de travail — par zone

### Phase A — Fermer la boucle amont (qgis2grist) · P0

**Où** : `projects/qgis2grist/lib/`

| Tâche | Livrable | Détail |
|-------|----------|--------|
| A1 | `controls-from-layer.js` | `inferLayerControls(layer, meta)` |
| A2 | Intégration | `scene-manifest.js` → `controls: inferLayerControls(...)` |
| A3 | Cas QGIS standard | Gradué → range ; catégorisé → select ; champ date → time |
| A4 | Cas BigQgisMCP | flood/temporal → control par couche + `mode: "simulation"` (extension) |
| A5 | Tests | `tests/controls-from-layer.test.js` + fixture bees + flood |
| A6 | Doc | Mise à jour du document de binding de qgis2grist, § controls |

**Critère d'acceptation A** : re-import bees.zip → SceneManifest contient `Pollen_Consumption.controls[]` ; Atlas affiche filtre sans config manuelle.

---

### Phase B — Spec Scene Manifest étendue · P0

**Où** : `projects/qgis2grist/docs/` + `projects/Atlas/docs/BINDING-ATLAS-v7.md`

| Tâche | Livrable |
|-------|----------|
| B1 | Schéma `ControlDeclarative` figé (types, champs, `mode?`) |
| B2 | Schéma `StoryStep` + `PanelDeclarative` |
| B3 | Priorité lecture documentée : prefs > manifest > auto |
| B4 | Version manifest `0.2.2` proposée (rétrocompatible 0.2.1) |

**Critère B** : un consommateur (`interactive_map`) peut implémenter sans lire le code Atlas.

---

### Phase C — Récit enrichi (encarts) · P1

**Où** : `projects/Atlas/lib/story.js`, `app_v7.js`, `index_v7.html`

| Tâche | Livrable |
|-------|----------|
| C1 | Modèle `step.panels[]` : `{ type, content, layout?, layerId? }` |
| C2 | Types MVP : `title`, `body`, `legend` |
| C3 | UI édition encarts dans module Récit |
| C4 | UI lecture : layouts `bottom-bar`, `side-left`, `side-right` |
| C5 | Persistance `Atlas_Story` (+ colonne `PanelsJSON` ou dans StateJSON) |
| C6 | `storyToManifestFragment()` inclut panels |
| C7 | Tests story + panels |

**Critère C** : présentation avec titre + corps + légende couche active par étape.

---

### Phase D — Import QGIS Atlas (layout) · P1

**Où** : `projects/qgis2grist/` (nouveau `lib/layout-atlas-to-story.js`)

| Tâche | Livrable |
|-------|----------|
| D1 | Parser `.qgs` : `Layout` + `Atlas` (coverageLayer, pageNameExpression, filter) |
| D2 | Extraire labels layout → `panels[]` |
| D3 | 1 feature couverture → 1 `story.step` (extent map item → camera 2D) |
| D4 | Thèmes de carte → `layers[].visible` si référencés |
| D5 | Émission `manifest.story` à l'import (optionnel si layout Atlas détecté) |
| D6 | Atlas : `loadStoryFromManifest(manifest.story)` en complément de `Atlas_Story` |

**Critère D** : projet QGIS avec Atlas 5 pages → 5 étapes pré-remplies dans Atlas (sans 3D pitch).

**Hors scope D** : caméra 3D QGIS, round-trip export `.qgs`.

---

### Phase E — Validation & QA · P0 (continu)

**Où** : `projects/Atlas/docs/MANUAL_TEST.md` + doc Grist Bee Farming

| Tâche | Livrable |
|-------|----------|
| E1 | Passage checklist MANUAL_TEST sur doc bees |
| E2 | Scénario flood BigQgisMCP (controls simulation) |
| E3 | Scénario récit 3+ étapes avec encarts |
| E4 | Round-trip : edit symbo → Enregistrer → reload → identique |

---

### Phase F — Publication · P2 (sur demande)

**Où** : `published/atlas/`

| Tâche | Livrable |
|-------|----------|
| F1 | Promote `index_v7.html` + `app_v7.js` + `lib/` |
| F2 | `package.json` grist |
| F3 | `npm run manifest` + CI |

---

## 5. Matrice responsabilités

| Concern | qgis2grist | Atlas v7 | Grist (tables) | Aval (offre) |
|---------|------------|----------|----------------|-------------|
| Données géo | import | lecture | tables source | — |
| StyleDeclarative | émet | lit/écrit prefs | SceneManifest | interactive_map |
| ControlDeclarative | **émet (A)** | lit/écrit/UI | SceneManifest + prefs | interactive_map |
| Story steps | **émet (D)** ou manuel | capture/UI | Atlas_Story | storymap DSFR |
| Panels encarts | émet labels (D) | **édite/affiche (C)** | Atlas_Story | storymap DSFR |
| 3D / soleil | — | runtime | atlas_3d_json | Atlas only |

---

## 6. Ordre d'exécution recommandé

```
Semaine 1 — Débloquer l'interop données
  A1→A6  controls qgis2grist
  B1→B4  spec manifest
  E1     QA bees (style + controls import)

Semaine 2 — Récit complet
  C1→C7  encarts Atlas
  E3     QA récit

Semaine 3 — Pont QGIS Atlas (si besoin métier)
  D1→D6  parse layout
  E2     QA flood

Sur demande
  F      publication gh-pages
```

**Chemin critique** : **A (controls amont)** → sans ça, Contrôles Atlas reste manuel après chaque import.

---

## 7. Principes de cohérence (ne pas violer)

1. **Scene Manifest = contrat** — pas de logique métier dupliquée hors spec.
2. **Atlas_LayerPrefs = override user** — prioritaire sur manifest import.
3. **Récit = scène + narration** — `state` (données) + `panels` (texte) séparés.
4. **QGIS Atlas ≈ Récit** — même logique séquentielle ; import layout, pas round-trip `.qgs`.
5. **Simulation flood ≠ filtre range** — typer explicitement (`mode: "simulation"`).
6. **Français UI** — commentaires et messages utilisateur.
7. **v7 only** — ne pas toucher v4/v6/`published/` sans demande.

---

## 8. Definition of Done — binding complet

- [x] Import bees (auto) : gradué/widget Range + control `percentage` sans action manuelle
- [ ] Import bees (Grist manuel) : checklist MANUAL_TEST §3
- [ ] Import flood : controls émis avec sémantique documentée
- [ ] Atlas prefs : symbo + controls survivent au reload Grist
- [ ] Récit : 3 étapes avec données différentes + encarts title/body/legend
- [ ] Export JSON : `storyManifest` + `declarative` + `controls` valides
- [ ] Tests : qgis2grist + Atlas ≥ 40 pass (actuel : 84 auto)
- [x] Spec BINDING v0.2.2 publiée dans les deux projets
- [ ] (Optionnel) Import QGIS Atlas → story pré-remplie
- [ ] (Optionnel) Publication `published/atlas/`

---

## 9. Fichiers clés par projet

```
projects/qgis2grist/
  lib/scene-manifest.js          ← A2
  lib/controls-from-layer.js     ← A1 (nouveau)
  lib/layout-atlas-to-story.js   ← D1 (nouveau)
  le document de binding de qgis2grist (dossier docs de qgis2grist)

projects/Atlas/
  lib/manifest-binding.js        ← maintenance
  lib/story.js                   ← C
  lib/controls.js                ← maintenance
  app_v7.js                      ← C UI
  docs/MANUAL_TEST.md            ← E
  docs/BINDING-ATLAS-v7.md       ← B
  docs/CADRAGE-BINDING-COMPLET.md  ← ce document
```
