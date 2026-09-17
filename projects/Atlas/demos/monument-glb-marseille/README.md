# Monument GLB streamé — Marseille (démo technique Atlas)

Scène d'essai : **un modèle 3D servi par une adresse distante**, posé dans le
contexte OpenStreetMap du Vieux-Port. Elle n'est pas publiée — elle sert à
vérifier le chargement d'un GLB tiers, pas à présenter un territoire.

```
index_v7.html?scene=<url>/scene.json
```

## Contenu

| Couche | Source | Rôle |
|---|---|---|
| Bâti OSM (contexte) | `../osm-marseille-vieux-port/buildings.geojson` | décor, emprunté à la démo Vieux-Port |
| Voirie OSM | `../osm-marseille-vieux-port/roads.geojson` | idem |
| Monument (GLB streamé) | un point inline, `style.mode: "custom"` | le modèle, chargé depuis GitHub à l'ouverture |

Quatre étapes de récit : approche du quai, focus, tour d'ambiance, crépuscule.

## Le modèle

*Damaged Helmet* — Khronos Group, d'après *Battle Damaged Sci-fi Helmet* de
theblueturtle_, **CC BY 4.0**, servi depuis le dépôt `glTF-Sample-Assets`. C'est
un **substitut** : un GLB détaillé et stable, dont la seule fonction est d'éprouver
le chargement distant.

Réglages : `scale: 28`, `rotationZ: 35`.

## Points d'attention

- **Elle dépend de deux choses extérieures à son dossier** : les GeoJSON de la
  démo Vieux-Port (chemin relatif), et la disponibilité de
  `raw.githubusercontent.com`. Si l'une des deux manque, la scène s'ouvre
  incomplète.
- À `scale: 28`, le modèle mesure plusieurs pixels dès z11 : c'est le seul cas
  connu où la garde de projection globe (`GLOBE_MERCATOR_ZOOM`, voir le
  `CLAUDE.md` du projet) a un effet visible.
- Vérifiée le 17/09/2026 : GLB chargé (200), aucune requête en échec, les quatre
  étapes se jouent.
