# Un trafic simulé dans Atlas

*Rédigé le 11/10/2026. Ce qui est dit « mesuré » l'a été par ce code, ce jour-là, sur les routes de la BD TOPO ; ce qui ne l'a pas été est dit « non vérifié ».*

Atlas peut faire rouler des véhicules sur les routes d'une couche : une maquette ou une démonstration où l'on voit des voitures et des poids lourds suivre les sens uniques, s'arrêter dans les files, passer les carrefours et les giratoires. **C'est une simulation, pas une mesure** : elle ne dit rien du trafic réel ni d'un projet.

## Utilisation

1. Importer des routes : bouton **IGN** du panneau Couches (jeu « Routes », BD TOPO) ou import **OSM** (« Voirie »), ou toute couche de lignes qui porte ces attributs.
2. Module **Vue & rendu**, section **Trafic simulé** : la couche de routes, la **densité** (véhicules par km), les **routes à accès restreint** (désactivé par défaut), puis **▶ Animer le trafic** ; le bouton devient **■ Arrêter le trafic**, et la section dit combien de véhicules roulent sur combien de tronçons, et ce qui a été écarté.
3. Palette de commandes (`Ctrl/⌘ K`) : **Animer le trafic (simulé) sur « <couche> »** (aussi en lecture, où le module n'est pas ouvert), puis **Arrêter le trafic simulé**.
4. Par l'API : `A.traficDemarrer(layerId?, { densite, vitesse, graine, acces })`, `A.traficBasculer()`, `A.traficReglage(cle, valeur)`, `A.traficArreter()`, `A.traficEtat()`.

| Réglage | Sens | Défaut |
|---|---|---|
| `densite` | véhicules par km de route | 8 (de 10 à 600 véhicules au total) |
| `vitesse` | pas du moteur par image ; 1 = temps réel | 1 (1 à 8) |
| `graine` | l'état de départ ; la même graine redonne la même simulation | 1 |
| `acces` | `libre` : routes ouvertes à la circulation ; `tous` : y ajoute les routes à accès restreint (voies privées, desserte) | `libre` |

Sans identifiant de couche, Atlas prend la première couche de lignes visible qui ressemble à des routes (`sens_de_circulation` ou `highway`). Un message dit « Trafic simulé … ; débits, destinations et feux sont des hypothèses ». Le chargement est **à la demande** (`lib/trafic-couche.js`, puis `lib/trafic/`) : sans trafic demandé, rien n'est téléchargé.

## Ce qui est lu, ce qui est supposé

| | |
|---|---|
| **Lu dans les données** | la géométrie des routes ; le sens (`sens_de_circulation` de la BD TOPO, sinon `oneway`, `junction=roundabout`, `highway=motorway` d'OpenStreetMap) ; le nombre de voies (`nombre_de_voies`, BD TOPO) ; l'importance (BD TOPO, sinon la classe OSM : motorway 1, primary 2, secondary 3, tertiary 4, residential et unclassified 5, service et living_street 6) ; l'état et l'accès (`Projet`, `Physiquement impossible` écartés) |
| **Distingué, puis écarté** | ce qui n'est pas une **route ouverte à la circulation** (`lib/modes-voie.js`) : les **chemins** et les **sentiers**, les **escaliers**, les **pistes cyclables**, les **voies ferrées**, les routes **à accès restreint** (allée d'un parc, voie privée, desserte réservée aux ayants droit : BD TOPO `acces_vehicule_leger`, OSM `access`, `motor_vehicle`, `vehicle`), les routes **physiquement impossibles** et les tronçons **en projet**. Chaque écart a son motif, dit dans la section « Trafic simulé » (« 64 tronçons écartés : 50 à accès restreint, 7 sentiers, 6 escaliers, 1 à accès impossible ») |
| **Pris pour une route** | une couche dont aucun tronçon ne dit ce qu'il est (ni `nature`, ni `highway`) : des lignes tracées à la main ; dès qu'un tronçon se déclare, ceux qui ne le font pas sont écartés (« non classés ») |
| **Supposé** | **une densité** de véhicules par km, la même partout ; les destinations, tirées au hasard ; **aucun feu** (la BD TOPO n'en porte pas : la couche ne les active pas, même si le moteur sait en simuler à titre d'hypothèse) ; 10 % de poids lourds |

Le réseau lu est celui de la couche **entière, filtres de la couche compris** (pas seulement ce qui est visible à l'écran), et le moteur ne fait rouler les véhicules que sur la **plus grande partie connexe** : des routes coupées par l'emprise d'un import, isolées du reste, restent vides.

## Le moteur

Un véhicule est un tuple (tronçon, voie, abscisse, vitesse). À l'approche d'un carrefour il choisit sa sortie et sa voie ; sa trajectoire n'existe qu'au tronçon courant et dans le carrefour en cours (aucun itinéraire n'est stocké).

- **Réseau** : tronçons → graphe orienté (sens, voies par sens, niveaux) → nœuds de simple passage fondus → **carrefours composés** (les tronçons courts, les boucles courtes et les anneaux de giratoire deviennent des chemins internes).
- **Voies** : `nombre_de_voies` donne les voies **par sens** (`ceil(nv/2)` en double sens, `nv` en sens unique, plafonné à 5), décalées latéralement ; voie d'entrée selon le virage ; changement de voie obligatoire (virage) ou opportuniste (leader lent).
- **Comportement** : file d'attente par voie (on ne passe pas devant celui qui précède), suivi de sécurité, priorités, acceptation de créneau, cession à l'anneau d'un giratoire.
- **Global** : circuit fermé par classe de véhicule (aucune apparition ni disparition), équilibrage vers une densité cible par tronçon, état reproductible à partir de la graine.

### Ce qui a été mesuré

Sur **34 km de réseau BD TOPO réel** (Marseille, 8 graines de 400 s à 6 et 12 véh/km, 4 graines à 20) : *contacts* = paires de véhicules à moins de 2 m dont les caps diffèrent de plus de 30°, *arbitrages forcés* = véhicules passés après plus de 45 s d'attente.

| Densité | Contacts (moteur d'origine → actuel) | Arbitrages forcés | Vitesse moyenne | À l'arrêt |
|---|---|---|---|---|
| 6 véh/km | 26 → 6 | 79 → 0 | 19,8 → 20,5 km/h | 3,6 → 1,8 % |
| 12 véh/km | 237 → 35 | 641 → 41 | 17,5 → 19,4 km/h | 12,7 → 5,8 % |
| 20 véh/km | 410 → 143 | 984 → 248 | 14,4 → 17,4 km/h | 25,1 → 14,0 % |

Aucun saut de position, état reproductible à graine égale. Coût du moteur : environ 1,0 / 1,6 / 3,2 ms par image à 206 / 413 / 688 véhicules. **Giratoire BD TOPO à 4 branches** : retard moyen 1,8 / 5,6 / 10,3 s à 216 / 432 / 700 véh/h par entrée, contre 22 à 35 s pour le moteur d'origine, qui s'y bloquait (0 / 3 / 65 contacts contre plus de mille).

**Dans Atlas** (navigateur, routes de l'IGN importées autour du Palais Longchamp le 11/10/2026) : 115 tronçons lus (14 écartés), 66 carrefours, 2 giratoires, 53 véhicules à 8 véh/km ; le temps simulé avance au rythme du temps réel ; les véhicules bougent d'une image à l'autre ; l'arrêt retire la source et la couche.

### Limites connues (honnêtes)

- **Écart de capacité** : le retard d'un giratoire reste 2 à 4 fois celui d'un modèle de capacité de référence ; le giratoire à 6 branches se dégrade vite (retard moyen 16,6 s à 300 véh/h par entrée).
- **Contacts résiduels** à forte densité (143 sur 20 véh/km pour le réseau de 34 km) : le moteur n'est pas un outil de dimensionnement.
- **Un seul trafic à la fois**, sur le fil principal (non vérifié au-delà de 600 véhicules ni sur plusieurs dizaines de km), sans piétons, cyclistes, transports en commun ni stationnement.
- **Les premières images coûtent plus que les suivantes** : les zones de conflit entre trajectoires d'un carrefour se calculent à la demande, quand un véhicule s'en approche. Sur un réseau aléatoire de 400 tronçons et 150 carrefours, le pas le plus long est d'environ 0,25 s (il dépassait 5 s avant la 1.16.2), puis 3 à 5 ms par image. Le calcul reste sur le fil principal : au-delà de quelques centaines de tronçons, un à-coup au démarrage est possible (le travail en worker est l'étape T2).
- Les véhicules sont dessinés comme des points (blanc : voiture, orange : poids lourd) ; le cap est calculé mais pas encore dessiné.

## Distinguer les routes, les chemins, les pistes cyclables, les voies ferrées

`lib/modes-voie.js` donne à chaque tronçon un **mode** (route, chemin, sentier, escalier, piste cyclable, voie ferrée) et un **accès** pour un véhicule léger, d'après la BD TOPO (`nature`, `acces_vehicule_leger`) ou OpenStreetMap (`highway`, `railway`, `access`, `motor_vehicle`, `vehicle`). L'import de l'IGN en tire l'attribut **`type_de_voie`** (route, route à accès restreint, chemin, sentier, escalier, piste cyclable, voie ferrée), une couleur chacun dans la légende ; le trafic routier ne prend que les routes ouvertes.

**Pour d'autres véhicules plus tard (trains, vélos, piétons)** : le mode `ferre` est reconnu dès maintenant (BD TOPO : LGV, voie ferrée principale, tramway, métro ; OSM : `railway=*`) et jamais confié au trafic routier. Un autre moteur lirait **son** mode et ses propres règles : sur les voies ferrées, des cantons et une signalisation à la place des carrefours et des priorités ; pour les vélos et les piétons, les pistes cyclables, les sentiers et les escaliers. Le moteur actuel est paramétré par classes de véhicules (`vl`, `pl`) et par règles d'accès : il en est le point de départ, pas la fin. Rien de ferroviaire n'est construit.

## Le réseau orienté : ce qui est branché, ce qui reste pertinent

| Fonction | Où | Dans Atlas aujourd'hui | Pertinence |
|---|---|---|---|
| Client WFS de la BD TOPO | `lib/reseau/wfs-bdtopo.js` | **branché** (import IGN) | en service |
| Sens uniques BD TOPO et OSM, plus court chemin orienté | `lib/itineraire.js` | **branché** (« Tracer sur un réseau », case « Respecter les sens de circulation ») | en service |
| Distinction route / chemin / piste cyclable / voie ferrée | `lib/modes-voie.js` | **branché** (import IGN, trafic) | en service |
| Trafic sur les routes d'une couche | `lib/trafic-couche.js`, `lib/trafic/` | **branché** (« Vue & rendu », palette, `A.traficDemarrer`) | en service |
| Graphe BD TOPO exact (extrémités à 1e-7 degré, attributs) | `lib/reseau/graphe-routier.js` | non branché | **à garder** : base de la suite (T2), plus stricte que le réseau d'itinéraire |
| Calage d'une trace sur le réseau, plus court chemin | `lib/reseau/calage.js` | non branché | **pertinent** pour caler une trace GPS de terrain sur les routes ; à brancher quand une trace est importée |
| Repères routiers (PR) : localiser, trouver le plus proche | `lib/reseau/reperes.js` | non branché | **pertinent** pour l'inventaire de voirie ; à brancher avec un usage terrain |
| Client de l'itinéraire de la Géoplateforme | `lib/reseau/itineraire-geoplateforme.js` | non branché | **facultatif** : utile pour de longs trajets, pas pour le tracé local |
| Confiance du calage, filiation entre éditions, mesures de trace | `lib/reseau/confiance*.js`, `filiation.js`, `mesures-trace.js` | non branchés | **outils de validation** : ils servent à mesurer la qualité du calage et à comparer deux éditions de la BD TOPO ; pas une fonction d'usage |

Les modules non branchés sont publiés avec le reste de `lib/reseau/` mais jamais chargés. S'ils pèsent un jour sur le dépôt ou la publication, la promotion pourra ne copier que ce qui est atteint par les imports.

## Suite

| Étape | Contenu | État |
|---|---|---|
| T0 | le moteur dans Atlas, versionné, avec ses 36 tests | **fait** (`lib/trafic/`, `tests/trafic-*.test.js`) |
| T1 | un trafic ambiant sur les routes d'une couche, à la demande | **fait** (`lib/trafic-couche.js`) |
| — | distinguer les types de voie et ne rouler que sur les routes ouvertes ; section de réglage dans « Vue & rendu » | **fait** (1.16.1) |
| T2 | véhicules orientés (cap dessiné) et en 3D à partir du catalogue d'objets ; calcul dans un worker | à faire |
| T5 | d'autres modes : trains (cantons, signalisation), vélos, piétons | à décider |
| T3 | feux : un plan par carrefour désigné, **déclaré comme hypothèse** à l'écran | à faire |
| T4 | règles de circulation (arrêtés) et « et si », après calibrage sur des mesures | à décider |

## Provenance

Le moteur est du code **écrit pour Atlas** à partir de principes publiés de simulation microscopique de trafic et des mesures ci-dessus. Il ne reprend le code d'aucun autre projet. Un outil externe de calcul de capacité de giratoires (méthode de Siegloch, sous licence GPL-3.0) sert de **référence de comparaison seulement**, depuis son propre dépôt ; aucun de ses fichiers, noms de fonctions, commentaires ni tableaux de constantes n'est ici. Règle pour la suite : s'inspirer d'une méthode publiée, jamais traduire un code sous une autre licence.

## Tests

```bash
node --test projects/Atlas/tests/trafic-*.test.js        # le moteur : 36 tests, environ 30 s
node --test projects/Atlas/tests/trafic-couche.test.js   # l'intégration : adaptation, comptes, cycle de vie
node --test projects/Atlas/tests/trafic-robustesse.test.js # réseaux connexes aléatoires : pas d'exception, durée d'un pas, arrêt d'un moteur en échec
```
