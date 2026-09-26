# Vérification du relief d'Atlas — 24-25/09/2026

MapLibre GL 5.6.1, three.js r160, serveur de dev `https://localhost:8443`, Chrome
(Intel UHD), onglet isolé. Scènes : démo `cascade-aygalades-marseille` (ortho IGN,
LiDAR HD, récit en 8 étapes), `essais-eclairage/scene-relief.json` (Jarret, LiDAR
HD, 95 luminaires, 22 h). Captures : `essais-relief/captures/` (hors git).
Références d'altitude : service d'altimétrie de la Géoplateforme
(`ign_rge_alti_wld`, RGE ALTI).

## En bref

- **Valide** : altitudes à ±0,6 m du RGE ALTI sur 12 points (LiDAR HD), en
  mercator et en globe ; l'exagération s'applique exactement (q / e constant) ;
  source, exagération, calque 3D et couche de nuit survivent à chaque changement
  de fond ; sortie du récit rendue à l'état de la scène.
- **Corrigé** (4 défauts, 18 tests nouveaux, suite 893/893) :
  1. plus aucun `idle` après la première étape d'un récit (tuiles MNT bloquées
     en `reloading`) ;
  2. l'exception `_updateRetainedTiles` (reading 'key') — cause trouvée, 24 → 0 ;
  3. luminaires perdus à chaque changement de fond ;
  4. modèles 3D mal calés : recalage « à l'arrivée du MNT » jamais déclenché,
     et cache d'altitude par cases de 8 × 11 m.
- **À arbitrer** : volume du MNT LiDAR (1 Mo par tuile, 14 à 26 Mo à
  l'ouverture, 110 s en 4G lente), coût GPU du relief (÷ 2 à ÷ 2,5 images/s),
  repli des tuiles MNT en échec (mur à l'horizon), exagération par défaut 1,2.

## 1. Validité

### Altitudes contre la référence (LiDAR HD, z17 vertical, `idle` atteint)

| Point | Référence (m) | `queryTerrainElevation` / e | Écart | Verdict |
|---|--:|--:|--:|---|
| Aygalades, arrêt de bus | 75,76 | 76,20 | +0,44 | ✓ |
| Aygalades, arbre | 89,82 | 89,90 | +0,08 | ✓ |
| Aygalades, lampadaire | 78,40 | 78,59 | +0,19 | ✓ |
| Aygalades, lampadaire (coteau) | 107,25 | 107,22 | −0,03 | ✓ |
| Aygalades, lampadaire (fond) | 62,84 | 62,90 | +0,06 | ✓ |
| Cascade | 52,19 | 52,45 | +0,26 | ✓ |
| Aygalades, lampadaire (haut) | 120,50 | 120,57 | +0,07 | ✓ |
| Jarret 1 | 103,63 | 103,05 | −0,58 | ✓ |
| Jarret 2 | 101,26 | 100,97 | −0,29 | ✓ |
| Jarret 3 | 98,03 | 98,09 | +0,06 | ✓ |
| Jarret 4 (origine de la scène) | 127,88 | 128,10 | +0,22 | ✓ |
| Jarret 5 | 100,42 | 100,48 | +0,06 | ✓ |

- **Exagération 1 ; 1,5 ; 2** : q / e identique au centimètre sur les sept points
  des Aygalades. `queryTerrainElevation` rend la valeur exagérée, et Atlas la
  consomme telle quelle : cohérent avec le rendu.
- **Source mondiale** (terrarium, 30 m) sur les mêmes points : +1,9 · +3,9 · +7,1 ·
  +6,9 · +4,3 · **+14,8** (cascade, vallon encaissé) · −0,7 m. Juste pour un
  paysage, faux pour un objet au sol dans un vallon.
- **Globe** (projection de la scène hors récit) : z17 identique au mercator
  (+0,44 · −0,03 · +0,26) ; z13 −2,4 à +4,0 m (tuiles MNT plus grossières, attendu).
- `map.unproject(map.project(p))` retombe à 0,13–0,42 m du point : la profondeur
  du terrain est cohérente avec la requête.

### Objets posés au sol

| Objet | Attendu | Mesuré | Verdict |
|---|---|---|---|
| Modèles 3D (232 lampadaires et arbres, étape 6), **avant** | < 0,5 m | 65 sur 232 > 0,5 m, max 2,16 m, **durable** | ✗ corrigé |
| Modèles 3D, **après** | < 0,5 m | 0 sur 232 > 0,5 m (max 0,00 m) à 6 s | ✓ |
| Modèles 3D, exagération 1 → 2 | recalés | faux de ≈ 100 m (enfouis) pendant ≈ 200 ms, justes à 1,5 s | ~ clignotement |
| Luminaires (Jarret, 95) | pied au sol | pied sondé exactement ; posés, taches inclinées à 1 et 1,5 (captures 05, 06) | ✓ |
| Surfaces à plat, lignes, points, bâti extrudé | drapés par MapLibre | drapés, aucun flottement à 1 et 2 (captures 01, 10) | ✓ |
| Trajet | drapé | ligne MapLibre, drapée | ✓ |

## 2. Application au fond

| Épreuve | Attendu | Mesuré | Verdict |
|---|---|---|---|
| Ortho IGN, Positron, Liberty, Bright, Plan IGN, relief actif | revient, même source, même exagération | `terrain-dem` LiDAR, exagération 1,5 conservée sur les cinq ; q = 193,1 = 128,7 × 1,5 | ✓ |
| Calque 3D et `atlas-nuit` après `setStyle` | présents, en tête | `atlas-trajet-line, atlas-nuit, three-models-3d` en tête | ✓ |
| Luminaires après `setStyle` | visibles | **aucun** avant correction (capture 07), tous après (08) | ✗ corrigé |
| Nuit sur Liberty + relief | bâti et taches lisibles | taches posées sur la pente (captures 05, 06) | ✓ |
| Étiquettes du fond | au-dessus du relief | pas d'enterrement remarqué | ✓ visuel |

## 3. Performances d'affichage

Rotation de cap de 60° en 2,6 s (arrivée des tuiles comprise), 1 440 × 900 × 1,5,
Aygalades ortho, sans luminaires (images/s) :

| Vue | Sans relief | Mondial | LiDAR HD |
|---|--:|--:|--:|
| z12 vertical | 39,8 | 18,0 | 36,0 |
| z12 oblique 70° | 39,1 | 13,2 | 18,2 |
| z15 vertical | 39,5 | 16,4 | 26,1 |
| z15 oblique 70° | 34,8 | 13,1 | 18,3 |
| z17 vertical | 43,8 | 19,1 | 22,0 |
| z17 oblique 70° | 25,7 | 14,6 | 13,6 |
| z19 vertical | 38,2 | 28,5 | 25,5 |
| z19 oblique 70° | 27,1 | 19,9 | 24,0 |

- **Coût du relief à caméra fixe** (Jarret, Liberty + bâti, nuit, z18, 62°,
  `triggerRepaint` en boucle, trois alternances) : relief **8,3 · 9,0 · 7,5**,
  plat **19,1 · 20,8 · 17,0**. Temps CPU d'un `_render` : 10,3 ms relief, 2,9 ms
  plat ; le reste est GPU. Ni le bâti (10,9 avec comme sans) ni les luminaires
  (6,0 contre 5,8 en rotation) n'en sont la cause : c'est le terrain de
  MapLibre (9 tuiles rendues en texture à 62°).
- Le mondial (tuiles de 256 px) est plus lent que le LiDAR (512 px) : 4 fois
  plus de tuiles de terrain à rendre en texture.
- **Téléphone simulé** (390 × 844 × 3, CPU ÷ 4) : ratio de pixels **3** (aucun
  plafond sans luminaires) ; relief z14 8,7 ; relief z17 65° **5,1** contre 9,9 à
  plat. Premier `idle` à 9,9 s.
- **Recalage** : `recomputeAll` 6,2 ms (médiane, dont `Eclairage.recaler` 5,3 ms
  pour 95 luminaires et leurs pentes) ; 3 recalages en arrivant à l'étape 6.
- **Mémoire** : cache MNT plafonné à 60 tuiles par MapLibre (≈ 1 Mo de données
  chacune, plus la texture) ; tas JS 69 Mo après six panoramiques.

## 4. Chargements

| Mesure | Mesuré |
|---|---|
| Tuile MNT LiDAR | **1 049 089 octets** (GeoTIFF Float32 512², sans compression HTTP ; gzip n'en retirerait que 15 %) |
| Ouverture des Aygalades, **avant** correction | 25 requêtes, **26,2 Mo** dont 11 retéléchargées (`reloading`) ; un seul `idle`, puis plus jamais |
| Ouverture, **après** | 14 requêtes, 14,7 Mo, `idle` à 10,9–14,3 s, puis à chaque arrêt |
| Latence d'une tuile | médiane 0,2 à 2 s, jusqu'à **9,8 s** (Géoplateforme) |
| Rotation oblique z15–z17 | 49 à 52 tuiles (≈ 50 Mo) |
| Six panoramiques rapides à 65° | 76 requêtes dont 51 annulées (l'annulation passe), 24 Mo, `idle` à 16,7 s |
| **4G lente**, ouverture | premières tuiles MNT à 26 s, chacune ≈ 75 s ; **premier `idle` à 110 s** ; les couches de la scène ne se montent qu'à ce moment (capture 09 : récit affiché, routes absentes) |
| 502, 404, CORS | aucun sur les tuiles MNT pendant ces séances |
| Échecs simulés (1 tuile sur 4 en 502) | 34 requêtes, 18 échecs, 6 tuiles de repli ; `idle` à 9,1 s ; **mur plat à l'horizon** (capture 11) |

## 5. Artefacts

| Artefact | Mesuré | Verdict |
|---|---|---|
| Exception `_updateRetainedTiles` (reading 'key') | **avant** : 7 à 9 à chaque entrée à l'étape 6, 0 à 3 à l'étape 7 (24 sur trois tours des étapes 5 à 7) ; sources GeoJSON à `maxzoom` 18, couverture 17, tuiles proches en 18. **Après** `maxzoom` 22 : 0 sur deux récits complets et trois tours | ✗ corrigé |
| Coutures, trous, marches de niveau de détail | non observés à 1 et 2 (capture 10) | ✓ |
| Talus raides à 2× | ortho étirée sur les parois (normal pour un drapage) | ✓ attendu |
| Tuile de repli plate | mur beige sur l'horizon quand une tuile basse résolution échoue | ✗ à arbitrer |
| Modèles enfouis après changement d'exagération | ≈ 200 ms (délai de `recalerRelief(200)`) | ~ |
| Taches de lumière sur relief | posées et inclinées ; un talus plus raide que le plan les troue (connu, rapport éclairage) | ~ |

## 6. Récit

- Toutes les étapes des Aygalades posent `ign`, exagération 1, sauf l'étape 7
  (2) : appliqué à chaque étape ; `idle` atteint à chaque étape après correction
  (avant : jamais après l'étape 1).
- Sortie du récit : projection de la scène (globe) et relief LiDAR 1× rendus.

## Corrections

| Défaut | Correction | Test |
|---|---|---|
| Tuiles MNT bloquées `reloading`, plus d'`idle` | `garderDemAuRechargement` (`lib/terrain-base.js`), posé dans `addTerrainSource` | `tests/terrain-rechargement.test.js` |
| Exception `_updateRetainedTiles` | `optionsSourceGeojson` (`maxzoom` 22) pour toutes les sources GeoJSON | idem (`tuileSansQuatreEnfants`) |
| Recalage à l'arrivée du MNT jamais déclenché | `evenementMntArrive` dans l'écouteur `data` | idem |
| Cache d'altitude à 1e-4° | `cleAltitude` (1e-6°) dans `elevRaw` | idem |
| Luminaires perdus au changement de fond | `luminairesHorsScene`, puis `Eclairage.oublier()` dans `construire` | `tests/eclairage-changement-fond.test.js` |

`?v=` : `app_v7.js` 20260925l, `terrain-base.js` 20260925c, `eclairage-rendu.js`
20260925c. Les deux premiers défauts sont des bogues de MapLibre 5.6.1, réécrits
dans les 5.x ultérieures (vérifié dans le code de la 5.24.0) : une montée de
version les rendrait inutiles.

## À arbitrer (mesuré, non tranché)

1. **Volume du MNT LiDAR.** 1 Mo par tuile, sans compression possible côté
   Géoplateforme. Options : `maxzoom` 15 au lieu de 16 (4 fois moins de tuiles
   près de la caméra, pixel de 2,4 m au lieu de 1,2 m, validité à remesurer) ;
   tuiles de 256 px (4 fois moins lourdes mais 4 fois plus de tuiles de terrain :
   le mondial montre ce que cela coûte en images/s) ; mondial par défaut au
   téléphone. En 4G lente, rien de la scène ne s'affiche avant 110 s parce que
   le montage des couches attend `idle` : le découpler de l'`idle` du relief est
   une autre voie.
2. **Coût GPU du relief** (÷ 2 à ÷ 2,5). Levier côté Atlas : plafonner le ratio
   de pixels quand le relief est actif, comme le fait la qualité de l'éclairage
   (au téléphone sans luminaires, le ratio reste à 3).
3. **Repli d'une tuile MNT en échec.** Aujourd'hui : dalle plate à la moyenne de
   la dernière tuile décodée, d'où le mur à l'horizon. Candidats : laisser
   échouer (MapLibre garde la parente ; le motif invoqué pour l'éviter était en
   fait l'exception GeoJSON corrigée ici) ; ou recomposer la tuile depuis le
   mondial (même emprise, 30 m, réencodée).
4. **Exagération par défaut 1,2** (`STATE.settings.terrainExaggeration`) : une
   scène qui n'en déclare pas montre un relief faux de 20 %.
5. **Clignotement à l'exagération** : `recalerRelief(0)` au lieu de 200 ms
   supprimerait les ≈ 200 ms d'enfouissement (le MNT n'a pas à arriver, seul le
   facteur change) ; coût ≈ 6 ms par cran du curseur.
6. **Ancien `WebGLRenderer` non libéré** à chaque changement de fond (même
   absence d'`onRemove`) : fuite probable, non mesurée.
