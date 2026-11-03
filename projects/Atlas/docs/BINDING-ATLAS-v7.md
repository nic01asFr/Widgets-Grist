# Binding Atlas v7 — Scene Manifest V0.2.2

> StyleDeclarative + ControlDeclarative + Récit  
> Aligné sur l'offre de service de l'organisation (interop `interactive_map`, qgis-sspcloud)

**Statut** : implémenté dans `index_v7.html` / `app_v7.js` — **publié** sous `published/atlas/` (2026-07-30).  
**Spec complète** : `../qgis2grist/docs/SCENE-MANIFEST-v0.2.2.md`

## Contrat pivot (Scene Manifest V0.2.2)

### Par couche (`manifest.layers[]`)

```jsonc
{
  "id": "Pollen_Consumption",
  "source": { "type": "grist", "table": "Pollen_Consumption" },
  "geometry_type": "point",
  "style": {
    "declarative": { "kind": "graduated", "field": "percentage", "stops": [] }
  },
  "controls": [
    { "field": "percentage", "type": "range", "label": "Pollen %", "min": 0, "max": 100, "active": false }
  ]
}
```

### Récit (`Atlas_Story` table Grist + export JSON)

```jsonc
{
  "storyManifest": {
    "version": "0.2.2",
    "steps": [{ "title": "…", "panels": [], "state": { "camera": {}, "layers": [] } }]
  }
}
```

Chaque `state.layers[]` inclut : `visible`, `controls`, `symbolization`, `declarative`.

## Flux Atlas

```
Import qgis2grist
  SceneManifest.style.declarative  ──► applyDeclarativeToLayer
  SceneManifest.controls           ──► applyControlDeclarativesToLayer (inactive par défaut)
  Atlas_LayerPrefs (si existant)   ──► applyLayerPrefsBinding (priorité user)

Édition Atlas
  Symboliser / Contrôles           ──► syncLayerDeclarative + saveLayerPref
  Récit capture                    ──► captureStoryState → Atlas_Story

Export projet JSON v2.2-atlas-binding
  layers[].declarative + controls + storyManifest
```

## Priorité lecture

1. **Atlas_LayerPrefs** (édition utilisateur dans le widget)
2. **Scene Manifest** (import qgis2grist — `controls[]` émis Phase A ✅)
3. Détection auto (champs filtrables)

## Fichiers

| Fichier | Rôle |
|---------|------|
| `lib/declarative-style.js` | StyleDeclarative ↔ symbo Atlas |
| `lib/controls.js` | ControlDeclarative ↔ filtres (+ `mode`) |
| `lib/manifest-binding.js` | Round-trip + prefs payload |
| `lib/story.js` | Récit + fragment manifest |
| `lib/grist-sync.js` | Persistance `Atlas_LayerPrefs` |

## qgis2grist amont ✅

- `layers[].controls` émis à l'import (`controls-from-layer.js`)
- Cas Bee Farming : widget Range → range ; pointCluster → categorized → select
- Cas flood : `mode: "simulation"`

## Tests

```bash
node --test projects/Atlas/tests/*.test.js
node --test projects/qgis2grist/tests/bees-binding.test.js
```

Checklist manuelle Grist : `docs/MANUAL_TEST.md`
