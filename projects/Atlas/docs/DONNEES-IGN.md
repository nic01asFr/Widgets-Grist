# Données IGN pour Atlas : accès au réseau routier, tracé calé, inventaire, limites, licences

*Rédigé le 09/10/2026. Ce qui est dit « mesuré » l'a été par requête sans clé ou par exécution des tests de ce dépôt ; ce qui ne l'a pas été est dit « non vérifié » ou « non mesuré ». Les modules sont des bibliothèques (`lib/reseau/`), aucun n'est encore branché dans `app_v7.js`. Les applications métier se branchent via ces modules.*

## 1. Ce que contient `lib/reseau/`

Modules ES purs, sans dépendance à l'application, sans état global. Le réseau (`fetch`) et l'attente sont **injectables** : les tests n'ont besoin d'aucun accès réseau.

| Module | Rôle |
|---|---|
| `wfs-bdtopo.js` | Lire la BD TOPO par le WFS de la Géoplateforme : emprise, pagination, tri, filtre côté client, échantillon, plafond, erreurs explicites |
| `graphe-routier.js` | Graphe de tronçons (`troncon_de_route`) : sens, nombre de voies, largeur, importance, niveau, numéro et noms de route ; composantes connexes |
| `calage.js` | Caler une polyligne sur le graphe (HMM / Viterbi), plus court chemin entre deux points ou deux repères, combinaison des deux |
| `mesures-trace.js` | Mesures d'un tracé (rappel et précision à 15 m, Hausdorff, Fréchet, F1 en longueur) |
| `confiance.js`, `confiance-modele.js` | Confiance par tronçon retenu : score calibré et classe haute / moyenne / faible (modèle appris, ne pas éditer) |
| `itineraire-geoplateforme.js` | Client **facultatif** du calcul d'itinéraire de la Géoplateforme, avec garde-fous |
| `filiation.js` | Filiation de tronçons d'une édition à la suivante, par recouvrement |
| `geo.js` | Plan local en mètres, projection, abscisses, Hausdorff, Fréchet |

Complément existant, sans rapport de code : `lib/itineraire.js` calcule un plus court chemin sur des **lignes quelconques** dont les bouts se touchent « à peu près » (raccord à 3 m, aucun sens, aucune identité). `lib/reseau/` travaille sur des **tronçons identifiés** (`cleabs`) qui se touchent exactement, garde leurs attributs et rend des portions de tronçon.

```js
import { empriseDeLignes, lireTroncons } from './lib/reseau/wfs-bdtopo.js';
import { construireGraphe } from './lib/reseau/graphe-routier.js';
import { tracer } from './lib/reseau/calage.js';

const emprise = empriseDeLignes(ligne, 150);           // le couloir autour de la ligne, en lon,lat,lon,lat
const { features } = await lireTroncons(emprise);      // BD TOPO, paginé, trié, sans clé
const graphe = construireGraphe(features);
const r = tracer(graphe, { type: 'LineString', coordinates: ligne }, 'hmm', { ref: { numero: 'D888' } });
// r.troncons : [{ cleabs, s0, s1, L, parcouru, part }]  -> tronçon + abscisse de début et de fin
// r.geometrie : MultiLineString WGS84 du tracé ; r.ok, r.echecs, r.ruptures, r.repli, r.couvertureObs
```

Outils : `node tools/mesurer-calage.mjs` (mesure avec vérité synthétique, hors réseau). Tests : `tests/reseau-*.test.js`.

## 2. Le WFS de la Géoplateforme : ce qu'il impose

`https://data.geopf.fr/wfs/ows`, couches `BDTOPO_V3:*` ; sans clé ; **CORS ouvert** (utilisable depuis un navigateur). Quota annoncé par les CGU de cartes.gouv.fr : 30 requêtes par seconde pour le WFS.

| Fait | Statut | Conséquence dans le client |
|---|---|---|
| `BBOX=lonMin,latMin,lonMax,latMax,EPSG:4326` fonctionne | **mesuré** | emprise toujours donnée ainsi |
| `CQL_FILTER=BBOX(geometrie, …)` rend HTTP 200 et **zéro objet**, sans erreur | **mesuré** (cause non établie) | jamais de CQL pour une emprise ; les autres critères se filtrent **côté client** après lecture |
| Sans `SORTBY`, deux pages successives n'ont pas d'ordre garanti : sur la même emprise, `STARTINDEX=2` sans tri et avec `SORTBY=cleabs` ont rendu des objets différents | **mesuré** (une paire de requêtes) | `SORTBY=cleabs` toujours envoyé ; refus d'un tri vide ; doublons retirés |
| Une page de 1 000 objets ; `COUNT=1` suffit pour connaître `numberMatched` | **mesuré** | pagination qui suit `numberMatched` (un service qui rendrait moins que demandé ne fait pas croire à la dernière page) ; `compter()` sans téléchargement |
| Les erreurs sont du **XML** (`ows:ExceptionReport`, HTTP 400) : type inconnu, emprise illisible | **mesuré** | le texte de l'exception est remonté (`exception_ogc`) |
| Les positions portent une altitude (`[lng, lat, z]`) | **mesuré** | le graphe les réduit à deux dimensions |
| 20 503 730 tronçons de route en France ; édition annoncée trimestrielle | repris de l'inventaire d'origine, non re-vérifié | plafond d'objets par lecture (20 000) et emprise limitée à 1° de côté |

Le client ne lit que des échantillons à la demande ; le graphe d'un couloir de 150 m autour d'une ligne de quelques kilomètres tient en quelques centaines de tronçons.

## 3. Le calcul d'itinéraire de la Géoplateforme (facultatif)

`GET https://data.geopf.fr/navigation/itineraire`, sans clé, CORS ouvert (préflight `OPTIONS` en 204). Ressources : `bdtopo-pgr` (la seule qui rende le `cleabs` de chaque étape, avec `getSteps=true&waysAttributes=cleabs|…` ; la plus lente), `bdtopo-valhalla` et `bdtopo-osrm` (rapides, `waysAttributes=name` seulement, HTTP 400 sinon). Profils `car` et `pedestrian`.

| Question | Réponse | Statut |
|---|---|---|
| Points de passage | 15 au plus (16 : HTTP 400) | mesuré |
| Imposer ou exclure un tronçon précis | impossible (`constraints` sur `cleabs` : « key is not available ») ; seules des **classes** d'attributs (`nature`, `importance`, classement administratif…) peuvent être évitées, préférées ou interdites | mesuré |
| Sens uniques | pris en compte par le service | mesuré (attribut renvoyé) |
| Quotas | guide : 5 requêtes/s par IP ; CGU : 10/s ; en-têtes observés : `x-ratelimit-limit-second: 1`, `ratelimit-limit: 10` ; 8 requêtes en rafale : 8 × HTTP 200. Les chiffres se contredisent | mesuré |
| Débit | 0,3 à 0,6 s sans point de passage ; 1,3 à 5,2 s avec 2 à 14 points de passage ; Marseille-Paris (766 km) en 2,1 s | mesuré (prototype) |
| Accord avec un plus court chemin local | sur cinq trajets de 0,9 à 4,5 km : mêmes tracés (Hausdorff ≤ 12 m), longueurs à 5 m près sur quatre, écart de 37 m sur un ; F1 en longueur des tronçons de 0,84 à 0,98. Avec 2 à 14 points de passage pris sur la ligne, le tracé reste quasi identique | mesuré (prototype, réponses non rejouables ici) |
| Licence propre à l'API | non trouvée ; les données (BD TOPO) sont en Licence Ouverte 2.0 | non vérifié |
| Version des données | champ `resourceVersion` (2026-10-05 à 2026-10-08 selon la ressource) ; le WFS annonçait « 2026-06-15 » : le routage est plus frais que le WFS | mesuré |

**Pièges, et le garde-fou de `itineraire-geoplateforme.js` pour chacun :**

1. **Point hors réseau accroché en silence.** Un départ en mer (5,2 E ; 43,0 N) est ramené au réseau le plus proche, **~27 km plus loin** (5,351 E ; 43,212 N), avec HTTP 200 et un trajet de 326 km depuis ce point d'accroche. *Correction d'une lecture antérieure : « 326 km » est la longueur du trajet, pas l'écart d'accrochage ; la réponse donne les positions accrochées dans `start` et `end`.* Le client compare à la demande et refuse au-delà de 500 m (`point_hors_reseau`). Mesuré le 09/10/2026 (rejoué).
2. **La ressource qui répond n'est pas toujours celle demandée.** Une requête `bdtopo-pgr` sans contrainte ni `waysAttributes` est servie par `bdtopo-valhalla` (champ `resource`), à quelques mètres de distance près. Le client demande les attributs, relit `resource` et rend `cleabsDisponibles`.
3. **Repli de ressource** : si `bdtopo-pgr` est en panne (5xx) ou refuse les attributs, une seule reprise sur `bdtopo-valhalla`, signalée (`repli: 'ressource'`), sans `cleabs`.
4. **Quotas** : appels espacés d'1 s, `Retry-After` respecté sur 429, plafond d'appels optionnel.

Verdict : utilisable côté client, sans clé, comme **contrôle croisé indépendant** d'un chemin local ou repli pour un client sans graphe. Il ne remplace pas le calage (aucun tronçon imposable, aucune géométrie à suivre, rien hors ligne). Rien dans Atlas ne doit en dépendre.

## 4. Le tracé calé sur le réseau : ce qui est mesuré, ce qui ne l'est pas

### Méthode

Une ligne (itinéraire approximatif, trace GPS, géométrie d'un objet linéaire) ne dit pas quels tronçons elle emprunte. `calage.js` échantillonne la ligne tous les 10 m ; les candidats sont les tronçons à moins de 30 m (8 au plus, dans les deux sens de parcours) ; le coût d'émission est `(écart/8 m)²/2 + (écart de cap/40°)²/2` (+ 3 si le tronçon contredit le numéro ou le nom de route connu) ; le coût de transition est `|distance par la route − distance sur la ligne| / 10 m` (+ 12 pour un demi-tour) ; Viterbi ; si plus aucune transition n'est possible, rupture et reprise plus loin ; un tronçon d'extrémité parcouru sur moins de 10 m est élagué. Le résultat est une suite de **portions** de tronçons (`cleabs`, abscisse de début, abscisse de fin), pas une liste de tronçons entiers.

### Premières mesures : tronçons figés et vérité synthétique

- **Portage identique au prototype** : 270 tracés (90 lignes réelles × 3 méthodes) comparés tronçon par tronçon, abscisses à 0,1 m : 0 différence. Même chose pour la filiation sur quatre emprises réelles.
- **Vérité synthétique** (`node tools/mesurer-calage.mjs`, tronçons réels de cinq voisinages figés dans `tests/fixtures/reseau/troncons-mesure.json`, chemin de 0,9 à 2,9 km pris pour vérité, géométrie dégradée, 3 graines, F1 pondéré par la longueur ; sans indication de route) :

| Dégradation | `hmm` | `pcc-ligne` | `hmm+pcc` |
|---|---|---|---|
| bruit gaussien de 6 m | 0,99 | 1,00 | 1,00 |
| décimée à 6 sommets | **0,83** | 1,00 | 0,84 |
| décalée latéralement de 12 m | 0,99 | 1,00 | 0,99 |
| cumul (bruit 4 m + décimation à 8 sommets + décalage 10 m) | 0,85 | 0,99 | 0,87 |

  La vérité est un plus court chemin : `pcc-ligne` lui ressemble par construction, ses scores ne disent rien de sa qualité sur des lignes réelles. La décimation est la limite : sur une route sinueuse la ligne décimée sort du rayon de 30 m et le calage perd les observations sans candidat.
- **Mesures du prototype d'origine**, sur 50 lignes publiées par un tiers et 40 localisations en route départementale (non versées ici, donc **non rejouables dans ce dépôt**) : 50 lignes tracées sur 50 contre 44 pour un tampon de 8 m ; tronçons entiers de moins de 15 m : 11 % contre 19 % ; écart de Hausdorff médian à la ligne : 5,0 m contre 11,7 m ; 1 échec déclaré contre 10.
- **Limite connue, testée** : si la route manque dans le graphe et qu'une chaussée voisine à moins de 30 m la double, le calage bascule sur la voisine sans rupture ni avertissement. Une ligne à plus de 30 m de tout tronçon n'est pas tracée (échec déclaré, rien d'inventé).

### Vérité de routage : 250 trajets réels, 30 départements (`tools/collecter-trajets.mjs`, `tools/mesurer-verite-routage.mjs`)

**Ce que cette vérité est.** Il n'existe pas de vérité terrain humaine. La meilleure vérité INDÉPENDANTE de la méthode de calage disponible sans relevé est la sortie d'un autre moteur : le calcul d'itinéraire de la Géoplateforme (ressource `bdtopo-pgr`, `waysAttributes=cleabs`), qui rend la séquence réelle de `cleabs` d'un trajet. C'est donc la sortie **d'un moteur de routage appliqué à la BD TOPO**, pas un relevé : indépendante de l'algorithme de calage, **pas de la donnée** (même BD TOPO). **Elle ne couvre pas** : les défauts de la BD TOPO (tronçon manquant, sens erroné : le moteur et le calage se trompent ensemble), la route réellement empruntée par un véhicule ou dessinée par une personne, les trajets atypiques (demi-tours, détours, arrêts : un moteur rend le plus court ou le plus rapide), ni aucune relecture humaine. L'étape de la réponse du service est mal géolocalisée (**mesuré** : la géométrie d'une étape omet le premier segment du tronçon) : la vérité est donc reconstruite avec la distance de l'étape et le tronçon BD TOPO, et la ligne de départ est la géométrie BD TOPO des tronçons du trajet.

**Corpus.** 303 trajets demandés (graine fixe, un appel d'itinéraire toutes les 1,1 s, réponses en cache), 256 obtenus, **250 exploitables** (au moins 90 % de la distance sur des tronçons présents dans le réseau lu), 1 362 km, de 1,1 à 12 km (médiane 5 km), **45 zones dans 30 départements**, plus court et plus rapide à parts égales. Contextes (calculés sur le réseau, pas déclarés) : urbain dense 131 trajets (au moins 80 % de tronçons urbains et 8 carrefours par km), périurbain 63, rural 56 ; étiquettes non exclusives : sens uniques 155, giratoire 127, chaussées séparées 116, sinueux 89, voies parallèles 59, échangeur 36. Extrait versé dans le dépôt : 5 trajets (`tests/fixtures/reseau/routage-extrait.json`).

**Modèle de dégradation** (`tools/degradations-trace.mjs`, 4 tirages par trajet, soit 1 000 lignes, écart moyen à la route : médiane 8,7 m, 10e-90e centiles 4,9-17,2 m) : bruit de position gaussien **corrélé** le long de la ligne (AR(1), écart-type 3 à 15 m, longueur de corrélation 30 à 80 m), décalage systématique (0 à 10 m), dérive latérale croissante (0 à 15 m), lissage des coins (0, 20 ou 40 m), décimation (un sommet tous les 25, 60, 150 ou 400 m, ou aucune).

**Résultats** (F1 en longueur ; en nombre de tronçons entre parenthèses ; 1 000 évaluations par méthode ; la ligne est ordonnée dans le sens du trajet) :

| Contexte | `hmm` | `hmm` orientée | `pcc-ligne` | mixte (`hmm+pcc`) | mixte orientée |
|---|---|---|---|---|---|
| **tous** | 0,90 (0,85) | **0,92 (0,89)** | 0,51 (0,50) | 0,90 (0,85) | **0,93 (0,90)** |
| urbain dense | 0,86 (0,82) | 0,90 (0,88) | 0,45 | 0,85 | 0,90 (0,88) |
| périurbain | 0,90 (0,84) | 0,92 (0,88) | 0,46 | 0,91 | 0,93 (0,90) |
| rural | 0,98 (0,95) | 0,98 (0,95) | 0,73 | 0,98 | 0,98 (0,96) |
| sens uniques | 0,86 (0,81) | 0,89 (0,87) | 0,39 | 0,85 | 0,90 (0,88) |
| giratoire | 0,87 (0,82) | 0,91 (0,88) | 0,46 | 0,88 | 0,92 (0,89) |
| chaussées séparées | 0,85 (0,80) | 0,90 (0,87) | 0,34 | 0,86 | 0,91 (0,88) |
| voies parallèles | 0,83 (0,77) | 0,87 (0,83) | 0,28 | 0,83 | 0,88 (0,85) |
| échangeur | 0,86 (0,79) | 0,89 (0,84) | 0,24 | 0,87 | 0,90 (0,86) |
| sinueux | 0,94 (0,89) | 0,95 (0,92) | 0,54 | 0,94 | 0,95 (0,93) |
| ligne dégradée de moins de 5 m en moyenne | 0,97 | 0,98 | 0,51 | 0,96 | 0,98 |
| de 5 à 10 m | 0,94 | 0,97 | 0,51 | 0,93 | 0,96 |
| de 10 m ou plus | 0,82 | 0,84 | 0,52 | 0,83 | 0,86 |

Lecture. (1) Le calage retrouve 90 % des trajets en longueur, 98 % en rural, **86 % en ville dense** et 83 % quand des voies parallèles sont à moins de 30 m : c'est là que se perdent les points. (2) Le mélange `hmm+pcc` ne change rien de mesurable au calage seul. (3) `pcc-ligne` (extrémités seulement) n'est pas une alternative : 0,51 en moyenne, 0,57 sur les trajets « plus courts » (où la vérité est justement un plus court chemin) et 0,45 sur les « plus rapides ». (4) Aucun calage n'a échoué (0 sur 1 000 lignes sans résultat).

**Sens uniques : l'option `orientee`.** Avec `orientee: true`, la ligne est supposée ordonnée dans le sens de la marche : un état calé à contre-sens d'un sens unique coûte `penaliteContreSens` (40, à comparer aux ~7 d'un écart de 30 m ; `Infinity` l'interdit), et les transitions entre états comme le lissage ne remontent pas non plus un sens unique. `contreSens` compte les observations malgré tout calées à contre-sens. Sans l'option, comportement inchangé (graphe non orienté). Testée sur cas synthétiques (rue à sens unique voisine d'une rue à double sens, giratoire dans les deux sens), sur des sens uniques réels figés, et sur les cinq voisinages figés (où il n'y a presque aucun sens unique sur la vérité : effet marginal, F1 0,92 des deux côtés) ; mesurée ici sur un jeu riche en sens uniques. Sur ce jeu riche en sens uniques (le moteur de routage les respecte), elle gagne **+2 points de F1 en général, +4 en ville dense, +5 avec chaussées séparées, +4 avec voies parallèles, +4 aux giratoires**, sans coût mesurable (3,0 à 3,1 ruptures par ligne). Elle compte en moyenne 5,3 observations calées à contre-sens par ligne (celles que le réseau n'évite pas). **Mais elle suppose la ligne ordonnée dans le sens de la marche** : sur les mêmes lignes données **à l'envers**, `hmm` reste à 0,90 alors que `hmm` orientée tombe à **0,81** avec 68 observations à contre-sens par ligne en moyenne. Le compteur `contreSens` est le détecteur : au-delà d'une part importante des observations, la ligne est probablement à l'envers.

### Confiance par tronçon : calibrée (`lib/reseau/confiance.js`, `tools/calibrer-confiance.mjs`)

**Ce que c'est.** Pour chaque tronçon retenu, une probabilité estimée qu'il soit dans la bonne séquence (`troncon.confiance.score`), une classe `haute` (≥ 0,95), `moyenne` (0,80 à 0,95) ou `faible` (< 0,80), et un résumé du tracé (`resultat.confiance`). Ces seuils sont fixés a priori sur le sens du score (une probabilité), pas réglés sur le test.

**Comment.** L'algorithme avant-arrière donne la probabilité a posteriori de chaque candidat. Douze caractéristiques par tronçon (a posteriori moyenne et espérée, nombre d'observations retenues, distance moyenne à la ligne, nombre de voisines à moins de 30 m, marge sur la meilleure alternative, longueur du tronçon, part parcourue, longueur parcourue, continuité avec les tronçons voisins du tracé, couverture et ruptures de l'ensemble) alimentent une régression logistique (IRLS, ridge), pondérée par la longueur parcourue.

**Séparation des jeux, par département.** 238 183 tronçons retenus (calage seul et mélange, avec et sans option orientée). Test : 10 départements (07, 15, 24, 32, 35, 44, 57, 67, 74, 88 ; un sur trois), **aucun n'a servi à apprendre, à choisir entre régression seule et isotone, ni à fixer les seuils** ; validation : un département d'apprentissage sur quatre ; apprentissage : le reste. 71 148 tronçons de test.

| Jeu de test (10 départements) | précision globale | erreur de calibration attendue (ECE) | Brier |
|---|---|---|---|
| tous | 92,9 % | **0,011** | 0,054 |
| `hmm` | 91,5 % | 0,015 | 0,064 |
| mixte | 91,8 % | 0,014 | 0,063 |
| `hmm` orientée | 93,7 % | 0,014 | 0,045 |
| mixte orientée | 94,5 % | 0,018 | 0,043 |
| urbain dense | 87,5 % | 0,022 | 0,092 |
| rural | 98,8 % | 0,007 | 0,009 |

Courbe de calibration sur le test (dix classes d'effectif égal ; prédit → observé) : 0,611 → 0,649 ; 0,860 → 0,840 ; 0,922 → 0,906 ; 0,954 → 0,967 ; 0,972 → 0,973 ; 0,983 → 0,976 ; 0,990 → 0,994 ; 0,994 → 0,995 ; 0,997 → 0,991 ; 0,999 → 0,995. Les probabilités annoncées tiennent à environ 2 points près, sauf dans les deux classes basses (sous-estimation de 4 points dans la plus basse).

**Précision MESURÉE des classes sur le test** (précision en longueur ; entre parenthèses la part de la longueur retenue qui tombe dans la classe) :

| | haute (≥ 0,95) | moyenne (0,80-0,95) | faible (< 0,80) |
|---|---|---|---|
| tous | **98,5 %** (67 %) | **88,4 %** (24 %) | **64,1 %** (9,5 %) |
| urbain dense | 97,5 % (43 %) | 86,9 % (40 %) | 63,6 % (17 %) |
| périurbain | 98,0 % (69 %) | 90,1 % (23 %) | 64,3 % (8 %) |
| rural | 99,8 % (93 %) | 91,1 % (5 %) | 69,3 % (2 %) |
| ligne dégradée de 10 m ou plus | 98,2 % (53 %) | 85,3 % (27 %) | 61,3 % (21 %) |
| `hmm` orientée | 98,7 % | 91,5 % | 64,2 % |

Sans la confiance, la précision d'un tronçon retenu est de 92,9 % ; avec elle, un tronçon « haute » est juste 98,5 fois sur 100 et un tronçon « faible » 64 fois sur 100. En ville dense, 43 % seulement de la longueur est notée « haute » : c'est la confiance qui dit où le tracé est à revoir.

**Ce que la confiance ne dit pas.** Elle est calibrée contre une vérité de routage et pour le modèle de dégradation ci-dessus ; elle ne dit rien des défauts de la BD TOPO, ni d'une trace d'une autre nature (GPS en tunnel, référentiel très décalé), ni d'un tronçon que le moteur de routage n'aurait pas emprunté. Pas de confiance pour `pcc-ligne` (`null`). Recalibrer (`node tools/calibrer-confiance.mjs <échantillons> --ecrire`) si le calage change.

### Non mesuré

- **L'exactitude terrain réelle** : la vérité de routage n'est pas un relevé. Aucune relecture humaine n'a été faite.
- Les interdictions de mouvement (tourner à gauche interdit), les lignes dégradées autrement que par le modèle ci-dessus (trace GPS dans un tunnel, ligne dessinée à main levée), les grands volumes (le calage est prévu pour des couloirs de quelques centaines de tronçons), le repère local au-delà de quelques dizaines de kilomètres.

## 5. Données IGN utiles à Atlas

Échantillons relevés sur un quartier dense de Marseille (0,8 × 0,8 km) et, quand c'est dit, sur la France entière. Taux de remplissage mesurés sur ces échantillons et **repris de l'inventaire d'origine, non re-vérifiés** dans cette intégration, sauf mention. Licence : **Licence Ouverte 2.0** pour BD TOPO, RGE ALTI, LiDAR HD, OCS GE, BD Forêt, BD ORTHO, BAN PLUS (champ `license = lov2` des jeux sur data.gouv.fr). **Citer l'IGN comme source.**

### BD TOPO V3 (WFS, `BDTOPO_V3:*`, édition trimestrielle)

| Couche | Attributs utiles | Apporte à Atlas | Limites mesurées |
|---|---|---|---|
| `troncon_de_route` | `cleabs`, `sens_de_circulation` (Double sens / Sens direct / Sens inverse / Sans objet), `nombre_de_voies`, `largeur_de_chaussee` (renseignée sur 74 à 81 % des tronçons échantillonnés), `importance` (1-6), `nature` (dont Rond-point : 382 862 en France), `acces_vehicule_leger`, `position_par_rapport_au_sol` (0, 1, -1, -2 : ponts et tunnels), `vitesse_moyenne_vl`, `cpx_numero` (renseigné sur 14 % d'un échantillon urbain, 39 % des routes départementales), `cpx_classement_administratif`, `periode_de_fermeture`, `restriction_de_hauteur`, `reserve_aux_bus`, dates de création et de modification | réseau navigable : graphe, itinéraire, rond-points, ponts | `vitesse_moyenne_vl` est une **moyenne, pas une limite réglementaire** ; pas de nombre de voies par sens ; `nom_collaboratif_*` absent sur 36 % de l'échantillon urbain |
| `non_communication` | tronçon d'entrée, tronçon(s) de sortie | mouvements interdits | **19 478 objets en France** : la plupart des interdictions de tourner n'y sont pas |
| `point_de_repere`, `section_de_points_de_repere` | route, numéro, abscisse, côté, type | repérage « route + PR + abscisse » | 0 objet en zone urbaine dense (routes départementales seulement). Avec `BBOX`, filtrer la route côté client |
| `route_numerotee_ou_nommee`, `voie_nommee` | numéro, toponyme, gestionnaire ; nom normalisé, identifiant BAN | préférence de route (numéro, nom) | |
| `equipement_de_transport` | Carrefour (dont Rond-point, Échangeur), Parking, stations, Borne de rechargement | carrefours, rond-points (point) | « Arrêt voyageurs » : **8 objets** dans 20 × 20 km autour de Marseille |
| `point_du_reseau` | Barrière, Passage à niveau, Obstacle infranchissable | barrières, passages à niveau | |
| `construction_lineaire` / `_surfacique` | Pont, Tunnel, Mur de soutènement | ponts (avec le niveau du tronçon) | |
| `batiment` | `hauteur` (100 % sur l'échantillon), `nombre_d_etages` (52 %), altitudes de sol et de toit, usage, matériaux, `identifiants_rnb` | maquette 3D (extrusion) | hauteur photogrammétrique (1,5 m annoncé) |
| `zone_de_vegetation`, `haie`, `ligne_electrique`, `pylone`, `troncon_de_voie_ferree`, `toponymie` | nature, hauteur, voltage, usage… | végétation, réseaux, étiquettes | pas de phénologie ni d'essence fine |

### Autres produits

| Produit | Accès | Contenu | Limites |
|---|---|---|---|
| **BDTOPO_V3_DIFF** (WFS) | `BDTOPO_V3_DIFF:troncon_de_route` | objets créés, modifiés ou détruits depuis l'édition précédente (`detruit`, `date_destruction`) | pas l'ancienne géométrie des objets modifiés |
| **RGE ALTI** | `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=…&lat=…&resource=ign_rge_alti_wld`, `elevationLine.json` ; CORS `*` | altitude, profil en long | un appel par point ou profil |
| **LiDAR HD** | WFS `IGNF_LIDAR-HD_METADONNEE:metadata` ; MNH/MNS/MNT 0,5 m en GeoTIFF flottant par WMS-R ; nuage de points `.copc.laz` (requête Range acceptée, CORS `*`, format de point 6 : pas de RVB) | hauteur de végétation, ponts, bâtiments | **couverture partielle** (0 dalle dans le quartier d'essai), format lourd |
| **OCS GE** | WMS-R `OCSGE.COUVERTURE.2021-2023` ; WFS seulement pour un département | couverture et usage du sol | pas de vecteur national par service |
| **BD Forêt** | WFS `LANDCOVER.FORESTINVENTORY.V2:formation_vegetale` (`essence`) | feuillus / conifères | V2 ancienne |
| **Orthophotos** | WMTS `ORTHOIMAGERY.ORTHOPHOTOS` (CORS `*`) ; historiques 1950-1995 | fond de plan réel | |
| **Plan IGN vectoriel** | style MapLibre `https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json` ; TMS `…/tms/1.0.0/PLAN.IGN` | fond de plan | |
| **BAN / géocodage** | `https://data.geopf.fr/geocodage/search?q=…` et `/reverse` ; CORS `*` | adresse ↔ coordonnées | |

### Ce que la BD TOPO ne contient pas

Aucune valeur de `nature`, sur les couches ci-dessus, ne correspond à :

- **les feux tricolores** ;
- **les passages piétons** ;
- **les panneaux de signalisation** ;
- **l'éclairage public** : `construction_ponctuelle` ne compte que 6 « mât d'éclairage » sur 457 objets (20 × 20 km autour de Marseille), ce n'est pas un inventaire ;
- **les arrêts de bus fiables** : 8 « Arrêt voyageurs » pour 400 km².

Une autre source est nécessaire (hors IGN). L'import OpenStreetMap d'Atlas (Overpass) en est une piste pour les feux, passages piétons et arrêts : `highway=traffic_signals`, `highway=crossing`, `highway=bus_stop`. **Non vérifié ici** : couverture et fraîcheur sont à mesurer avant de s'y fier.

## 6. Stabilité des identifiants et filiation

**Ce que l'IGN affirme** : « Depuis la version 3.0, tous les objets possèdent un identifiant unique et stable dans le temps » (description du jeu BD TOPO sur data.gouv.fr). Le **Différentiel** contient les objets dont la date de modification, de création ou de suppression est postérieure à la précédente édition trimestrielle.

### Deux éditions complètes comparées (`tools/valider-filiation.mjs`)

**Données.** Territoire de Belfort (département 90, le plus petit proposé : 71,8 Mo compressés ; les départements de Paris, des Hauts-de-Seine et de la Corse du Sud pèsent de 124 à 244 Mo), GeoPackage officiel `BDTOPO_3-5_TOUSTHEMES_GPKG_LAMB93_D090_2026-06-15` et `…_2026-09-15`, adresses `https://data.geopf.fr/telechargement/download/BDTOPO/<titre>/<titre>.7z` (flux Atom `https://data.geopf.fr/telechargement/resource/BDTOPO?zone=D090`), sommes MD5 du flux vérifiées, **143 Mo téléchargés au total**, hors du dépôt. Licence : « licence ouverte Etalab » (métadonnées de livraison), Licence Ouverte 2.0. Seule la couche `troncon_de_route` est lue. Le dépôt ne garde qu'un extrait de 160 Ko du Différentiel (voir `tests/fixtures/reseau/diff-troncons-extrait.json`), pas ces fichiers.

**(a) Ce qui change entre 2026-06-15 et 2026-09-15** : 72 803 → 72 983 tronçons. **72 623 `cleabs` conservés (99,75 %), 180 détruits, 360 créés.** Parmi les conservés, la géométrie change pour 1 136 (1,6 %) et la date de modification pour 8 851 (12 %). Déplacement des géométries modifiées (plus grand écart d'un sommet nouveau à l'ancienne ligne) : médiane 3,2 m, 90e centile 17 m, 99e centile 92 m, maximum 349 m. Détruits par nature : chemin 55, sentier 53, route à 1 chaussée 49, route empierrée 23.

**(b) Vérité synthétique de filiation.** Sur les tronçons dont le `cleabs` est conservé, on masque l'identité et on fabrique l'événement : remplacement (environ les deux tiers), scission en deux morceaux à un point tiré entre 30 et 70 % (15 % des tronçons de 30 m ou plus), fusion de deux tronçons bout à bout par un nœud de degré 2, suppression (5 %), création (5 %) ; plus un bruit de numérisation de 0, 2 ou 4 m sur la nouvelle géométrie. 88 fenêtres de 2 km (44 d'**apprentissage**, 44 de **test**, en alternance, donc deux moitiés du département), 72 623 tronçons. Les seuils ont été réglés par balayage sur l'apprentissage seul.

| Bruit | seuils par défaut (5 m, 50 %, 35°, 5 m) | | | seuils réglés (3 m, 30 %, 50°, 5 m) | | |
|---|---|---|---|---|---|---|
| | précision des liens | rappel | F1 | précision | rappel | F1 |
| 0 m | 0,957 | 0,991 | 0,974 | 0,970 | 0,992 | 0,981 |
| 2 m | 0,912 | 0,966 | 0,938 | 0,931 | 0,973 | 0,952 |
| 4 m | 0,884 | 0,833 | 0,857 | 0,878 | 0,851 | 0,864 |

(Jeu de TEST.) La filiation retrouve 96 à 99 % des liens vrais sans bruit, 83 % avec 4 m de bruit. Les seuils réglés gagnent **0,7 à 1,4 point de F1** : le plateau est plat (sur l'apprentissage, tolérance 3 m et 30 % de recouvrement donnent 0,926 contre 0,921 pour les défauts). **Les défauts sont donc conservés** : descendre la tolérance sous les 3,2 m de déplacement médian observés sur les vraies géométries modifiées serait un risque pour un gain dans le bruit. Le **type** de l'événement (remplacement / scission / fusion / supprimé) est retrouvé dans 94 % des cas sans bruit, 83 % à 2 m, 70 % à 4 m : l'erreur principale est un remplacement lu comme remaniement parce que des tronçons voisins se recouvrent (13 % à 2 m).

**(c) Sur les VRAIS `cleabs` détruits** (180 tronçons, sans vérité de filiation : seulement des indices).

- **111 ont un successeur géométrique (62 %), 69 n'en ont pas (38 %).** Types : remplacement 85, scission 9, remaniement 5, fusion 3, supprimé 69. 87 des 360 créés (24 %) ont un prédécesseur : les 273 autres n'ont aucun ancêtre parmi les détruits (chemins nouveaux, ou redessinés sous une identité qui ne recoupe rien).
- **Plausibilité des 127 liens proposés**, comparée à celle de deux tronçons voisins (à moins de 40 m) pris au hasard parmi les conservés :

| Indice (comparable des deux côtés) | liens proposés | voisins au hasard |
|---|---|---|
| même importance | **90 %** (n=127) | 67 % |
| même nature | **86 %** (n=127) | 70 % |
| même sens de circulation | **89 %** (n=127) | 75 % |
| même nom de voie | **100 %** (n=22) | 55 % |
| même numéro de route | **100 %** (n=6) | 89 % |
| recouvrement médian | 100 % du plus court | |

  Les liens sont nettement plus cohérents que le hasard, surtout sur le nom (100 contre 55 %). Mais 10 % des liens changent d'importance et 14 % de nature : plausible pour un tronçon redessiné ou reclassé, **pas vérifié**.
- **Sans successeur** : sentiers 18 sur 53, chemins 16 sur 55, routes empierrées 3 sur 23, **routes à 1 chaussée 32 sur 49 (65 %)**. Pour des sentiers et des chemins, une suppression est plausible ; pour les 32 routes à 1 chaussée, on ne sait pas si la route a disparu ou si son remplaçant ne recoupe pas (autre découpage, déplacement de plus de 5 m).
- Parmi les 9 scissions de détruits, 5 ont des morceaux créés au même horodatage exact (`date_creation`) : indice d'une même saisie, faible.

**(d) Table de correspondance officielle : non trouvée.** Cherchée dans : le GeoPackage (54 tables : aucune table de versions ; `lien_adresse_vers_bdtopo` et `batiment_rnb_lien_bdtopo` lient des adresses et bâtiments, pas des tronçons entre éditions), les attributs de `troncon_de_route` (`date_d_apparition` renseigné sur 10 tronçons sur 72 983, `date_de_confirmation` sur 7 %, `sources` sur 14 %, `identifiants_sources` sur 7 % ; seuls 2 des 360 créés partagent un identifiant source avec un détruit), les métadonnées de livraison (HTML et XML : ni filiation ni historique), le Différentiel (`detruit`, dates, aucun lien « remplacé par »). **La vérité de la filiation réelle n'existe pas dans les données publiées**, d'où (b) en synthétique et (c) en indices.

**Ce qui n'est pas validé.** La filiation sur les remaniements réels (b est fabriquée sur les mêmes géométries, donc optimiste) ; les 32 routes détruites sans successeur ; un autre département (urbain dense), une autre période (annuelle plutôt que trimestrielle : plus d'événements, plus de remaniements). Deux chaussées à moins de 5 m sont confondues. L'ancienne géométrie d'un objet **modifié** n'est dans aucun service : il faut avoir conservé l'état précédent (ou télécharger l'édition précédente, ce que ce banc fait).

### Le module (`filiation.js`)

`cleabsOrigine(nouveau)` par recouvrement géométrique (tolérance 5 m, cap à 35°, recouvrement ≥ 50 % du plus court des deux et ≥ 5 m). Testé sur cas synthétiques, rejoué sur l'extrait réel du Différentiel (les chiffres Marseille et Ardèche de la première mesure sont retrouvés), et validé comme ci-dessus.

**Articulation avec l'ancrage.** Une migration d'ancrage déplace un repère linéaire (tronçon + abscisse) d'une édition à la suivante : elle a besoin, pour chaque nouveau tronçon, des anciens `cleabs` dont il descend. C'est `cleabsOrigine` / `nouvellesAvecOrigine` (`{ cleabs, geometry, cleabs_origine }`). `filiation.js` ne contient **aucun code d'ancrage** (ni contrat de repère, ni côté, ni décalage, ni confiance) ; le module d'ancrage est étudié dans une autre branche et consommera cette sortie. Le tracé de `calage.js` (`troncon`, `s0`, `s1`) est, lui, l'entrée naturelle d'un repère linéaire à deux ancrages d'axe par tronçon.

## 7. Risques et limites d'usage

- **Disponibilité** : services publics sans garantie annoncée ; quotas contradictoires ; une erreur 500 observée sur une requête à paramètre répété. Le WFS retarde d'un trimestre sur le téléchargement. Prévoir l'échec : toutes les erreurs du client ont un `code`.
- **Volumes** : 1 000 objets par page ; un couloir de 150 m autour d'un tracé de quelques kilomètres = quelques centaines de tronçons (quelques centaines de Ko). Un département compressé pèse 68 à 245 Mo.
- **Hors ligne** : le calage et la filiation sont purs et marchent sans réseau si les tronçons sont chargés ; le WFS, l'itinéraire et le géocodage ne le sont pas. Rien n'est mis en cache par ces modules.
- **Mentions** : « Source : IGN, BD TOPO® » avec la licence (Licence Ouverte 2.0) partout où un tronçon, un attribut ou un tracé en dérivé est affiché ou exporté.
- **Application mobile** : les requêtes sortent par le client natif de Capacitor, qui n'envoie pas de `Referer` ; le WFS et l'itinéraire de la Géoplateforme n'ont pas montré d'exigence d'en-tête (contrairement à Overpass, voir `lib/osm-requete.js`), mais **cela n'a pas été vérifié depuis l'application**.

## 8. Points de branchement possibles dans l'application (non codés)

- *Importer la BD TOPO comme couche* : `lireTroncons` donne des entités GeoJSON que `entableLayer` pourrait écrire dans une table (clé `cleabs`, mise à jour par `date_modification`) ; aujourd'hui `scene-loader.js` déclare le WFS comme échec.
- *Tracer un trajet de tournée sur le réseau* : `tracer` sur la ligne d'un contexte donne les tronçons parcourus et leurs abscisses (comparer à `lib/trajet.js` / `lib/tournee.js`).
- *Afficher la confiance du tracé* : `troncon.confiance.classe` colore ou signale les tronçons « faible » d'un tracé calé ; `resultat.confiance.parClasse` dit quelle part du tracé est sûre.
- *Détecter les tronçons qui ont changé* : `filiationDifferentiel` sur les objets d'une couche importée, pour signaler ceux dont l'identifiant a disparu.

## 9. Reproduire

Tests (hors réseau) et mesures :

```
cd projects/Atlas
node --test tests/reseau-*.test.js          # tous les tests de lib/reseau/, hors réseau
node tools/mesurer-calage.mjs               # tronçons figés : vérité synthétique, puis sens uniques
```

Banc de la vérité de routage (réseau, lecture seule, ~13 minutes de collecte à 1 appel d'itinéraire toutes les 1,1 s, puis ~8 minutes de calcul) :

```
node tools/collecter-trajets.mjs <cache>                          # 303 trajets du service d'itinéraire + réseau WFS, repris où l'on s'arrête
node tools/mesurer-verite-routage.mjs <cache> --sortie <res>      # tableaux par méthode et contexte, échantillons de confiance
node tools/calibrer-confiance.mjs <res> --ecrire                  # apprend, évalue sur les départements de test, écrit confiance-modele.js
```

Filiation sur deux éditions complètes d'un département (fichiers extraits du GeoPackage officiel, hors dépôt) :

```
node tools/valider-filiation.mjs ancienne.json nouvelle.json --sortie <res>
```

Les extraits réels figés (`tests/fixtures/reseau/*.json`) viennent du WFS, du service d'itinéraire de la Géoplateforme et du GeoPackage de la BD TOPO du département 90, relevés le 09/10/2026, en Licence Ouverte 2.0 (IGN) : troncons-reels-p02, troncons-mesure, itineraire-reponses, diff-troncons-extrait, routage-extrait.
