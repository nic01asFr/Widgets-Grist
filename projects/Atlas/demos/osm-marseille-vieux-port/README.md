# Démo portable — Marseille Vieux-Port (OSM 3D)

Pack Scene Manifest **0.2.2** + récit, données **OpenStreetMap** (Overpass), licence **ODbL**.

## Contenu

| Fichier | Rôle |
|---|---|
| `scene.json` | Manifeste + `story.steps` (4 étapes) |
| `buildings.geojson` | Bâtiments + `height_m` (height / building:levels / défaut 10 m) |
| `roads.geojson` | Voirie |
| `landmarks.geojson` | Musées, historic, ferry |
| `build-from-overpass.mjs` | Régénération Overpass |

## Lancer en local

```bash
cd projects/Atlas
python -m http.server 8899
```

Ouvrir :

```
http://127.0.0.1:8899/index_v7.html?mode=view&scene=http%3A%2F%2F127.0.0.1%3A8899%2Fdemos%2Fosm-marseille-vieux-port%2Fscene.json
```

## Notes

- Extrusion via `style.polygonMode: "extruded"` + `height_field: "height_m"`.
- Attribution : © contributeurs OpenStreetMap.
