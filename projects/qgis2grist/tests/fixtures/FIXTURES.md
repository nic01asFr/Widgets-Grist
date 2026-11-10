# Fixtures qgis2grist — jeu de test multi-formats

Généré via QGIS MCP (2026-07-26). Zone : Marseille 4e arrondissement.

| Fichier | Format | Géométries | Représentation | Usage test |
|---------|--------|------------|----------------|------------|
| `qgis2grist_marseille4e_webmap.html` | QgisRemoteMCP HTML | Poly, Line, Poly, Point | single, categorized, graduated, categorized | Parser layersData, preview MapLibre |
| `webmap_marseille4e_user.html` | QgisRemoteMCP HTML | Poly, Line | single, categorized | Régression cas utilisateur |
| `qgis2grist_marseille4e_qfield.zip` | QField package | 4 couches GPKG + QGZ | styles QGIS embarqués | parseZipFile → parseQgsXml |
| `qgis2grist_marseille4e_voirie.gpkg` | GeoPackage | LineString | categorized (sens circulation) | parseGpkgFile, sql.js |
| `qgis2grist_marseille4e.grist` | BigQgisMCP .grist | 4 tables | — | Phase 4 import .grist |
| `qgis2grist_nimes_flood.html` | BigQgisMCP flood | Poly, Point | graduated + slider | extractBigQgisMcpMeta, simulation |
| `demo_points.gpkg` | GeoPackage | Point | single | Smoke test rapide Profil A |
| `profile_b_points.gpkg` | GeoPackage | Point ×55k | single | Profil B viewport LOD (`make_profile_b_gpkg.py`) |
| `gam_communes.zip` | qgis2web ZIP | Poly | categorized | parseQgis2webZip |
| `pp_cibles.zip` | QField-like ZIP | Poly | single | parseZipFile QGS |

## Projets QField officiels (web)

Source : [qfield.org/sample-projects](http://qfield.org/sample-projects/) — téléchargés via `scripts/download-qfield-samples.ps1` → `tests/fixtures/web/`.

| Fichier | Contenu | Couches clés |
|---------|---------|--------------|
| `qfield_bees.zip` | Bee Farming — qgz + bees.gpkg + basemap laax.gpkg + DCIM photos | Apiary, Fields, Tracks, buildings, lines… (8 couches, ~5k entités) |
| `qfield_wastewater.zip` | QGEP eaux usées — 3 GPKG + listes vl_* | Reaches (4076), Wastewater structures (2489) + 24 tables lookup |

Test automatisé : `node --test tests/qfield-web.test.js`  
Binding controls : `node --test tests/binding-manifest-integration.test.js`  
Bee Farming E1 : `node --test tests/bees-binding.test.js` (requiert `inspect_qfield_styles.py`)

## Golden manifest (interop Atlas)

| Fichier | Contenu |
|---------|---------|
| `golden/scene-manifest-marseille-controls.json` | Fragment Scene Manifest avec `controls[]` (Bee + flood) — consommé par tests Atlas |

## Couches du webmap multi-styles

1. **Limite 4eme arr.** — Polygon, symbole unique noir
2. **Voirie 4eme (clippee)** — Line, catégorisé `sens_de_circulation`
3. **Batiments 4eme** — Polygon, gradué `hauteur`
4. **POI 4eme** — Point, catégorisé `nature`

## Test local

```bash
cd projects/qgis2grist
node --test tests/*.test.js
python -m http.server 8765
# Ouvrir index_v2.html → boutons demo ou glisser-déposer un fixture
```

## Archives `.zip` absentes d'un clone

Le `.gitignore` exclut `*.zip` : les cinq archives de test ne sont PAS dans le dépôt (`gam_communes.zip`, `pp_cibles.zip`,
`qgis2grist_marseille4e_qfield.zip`, `web/qfield_bees.zip`, `web/qfield_wastewater.zip`, environ 4 Mo). Les QField se téléchargent avec
`scripts/download-qfield-samples.ps1` ; sans elles, 14 tests échouent (`bees-binding`, `parse-fixtures`, `parse-maplayer-style`,
`q2g-qgis2web`, `qfield-web`, `wkb-gpkg`) avec le message « télécharger… ». Les 571 autres ne les utilisent pas. L'intégration continue
ne lance que les tests d'Atlas.
