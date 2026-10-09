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

### Mesuré

- **Portage identique au prototype** : 270 tracés (90 lignes réelles × 3 méthodes) comparés troncon par tronçon, abscisses à 0,1 m : 0 différence. Même chose pour la filiation sur quatre emprises réelles.
- **Vérité synthétique** (`node tools/mesurer-calage.mjs`, tronçons réels de cinq voisinages figés dans `tests/fixtures/reseau/troncons-mesure.json`, chemin de 0,9 à 2,9 km pris pour vérité, géométrie dégradée, 3 graines, F1 pondéré par la longueur ; sans indication de route) :

| Dégradation | `hmm` | `pcc-ligne` | `hmm+pcc` |
|---|---|---|---|
| bruit gaussien de 6 m | 0,99 | 1,00 | 1,00 |
| décimée à 6 sommets | **0,83** | 1,00 | 0,84 |
| décalée latéralement de 12 m | 0,99 | 1,00 | 0,99 |
| cumul (bruit 4 m + décimation à 8 sommets + décalage 10 m) | 0,85 | 0,99 | 0,87 |

  La décimation est la limite : sur une route sinueuse (cas ruraux 1 et 2 : F1 0,76 et 0,55), la ligne décimée sort du rayon de 30 m et le calage perd les observations sans candidat. Le plus court chemin entre extrémités, lui, ne lit pas les sommets intermédiaires et s'en sort, **mais la vérité est elle-même un plus court chemin** : `pcc-ligne` lui ressemble par construction, ses scores ne disent rien de sa qualité sur des lignes réelles.
- **Mesures du prototype d'origine**, sur 50 lignes publiées par un tiers et 40 localisations en route départementale (non versées ici, donc **non rejouables dans ce dépôt**) : 50 lignes tracées sur 50 contre 44 pour un tampon de 8 m ; tronçons entiers de moins de 15 m : 11 % contre 19 % ; écart de Hausdorff médian à la ligne : 5,0 m contre 11,7 m ; 1 échec déclaré contre 10. Un seul morceau continu pour 34 des 35 lignes simples.
- **Limite connue, testée** : si la route manque dans le graphe et qu'une chaussée voisine à moins de 30 m la double, le calage bascule sur la voisine sans rupture ni avertissement. Une ligne à plus de 30 m de tout tronçon n'est pas tracée (échec déclaré, rien d'inventé).

### Non mesuré

- **L'exactitude.** Il n'existe pas de vérité terrain : les mesures disent la fidélité à la ligne donnée et la forme du résultat (nombre de tronçons, tronçons courts, continuité), pas que les bons tronçons sont retenus.
- **Une confiance calibrée** : rien n'est calibré, le calage rend toujours un chemin plausible, y compris faux, et n'en donne aucune. Les indices disponibles (écart médian, rappel, part de tronçons courts, accord avec un numéro ou un nom connu) sont dans `mesures-trace.js`.
- Sens uniques dans le **calage** (le graphe y est parcouru dans les deux sens ; seul le plus court chemin honore `oriente: true`, **non mesuré sur données réelles**, testé sur cas synthétiques), interdictions de mouvement, grands volumes (le calage est prévu pour des couloirs de quelques centaines de tronçons), repère local au-delà de quelques dizaines de kilomètres.

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

**Deux éditions complètes** sont accessibles **par téléchargement** (flux Atom `https://data.geopf.fr/telechargement/resource/BDTOPO`, GeoPackage ou Shapefile par département, 11 éditions V3 pour le département 13 de 2019-03-15 à 2026-09-15 ; 68 Mo compressés pour le plus petit département mesuré, 245 Mo pour un grand). **Non téléchargées : la comparaison de deux éditions complètes n'a pas été faite.** Par le WFS, un seul état est lisible, en retard d'un trimestre sur le téléchargement.

**Ce qui a été fait à la place** (Différentiel réel, 4 emprises : Marseille, Lyon, Toulouse, une zone rurale d'Ardèche ; l'extrait de test garde deux d'entre elles) :

| Emprise | Détruits | Avec successeur géométrique | Par un `cleabs` conservé | Par un `cleabs` nouveau | Scissions / fusions / remaniements | Sans successeur |
|---|---|---|---|---|---|---|
| Marseille | 49 | 21 | 14 | 2 | 1 + 1 + 1 | 28 |
| Lyon | 203 | 89 | 35 | 7 | 14 + 7 + 7 | 114 |
| Toulouse | 73 | 32 | 10 | 6 | 6 + 2 + 3 | 41 |
| Ardèche (rural) | 22 | 13 | 7 | 4 | 0 + 1 + 0 | 9 |

Constats : aucun `cleabs` détruit n'est réutilisé par un objet vivant (0 sur 347) ; la majorité des remplacements se fait **sous un `cleabs` conservé** (un voisin qui absorbe la géométrie) ; les scissions mélangent `cleabs` conservé et `cleabs` nouveau ; **41 à 57 % des détruits n'ont aucun successeur géométrique à 5 m**. Il n'existe **aucune table de filiation publiée** ni champ « remplacé par ».

`filiation.js` calcule `cleabsOrigine(nouveau)` par recouvrement géométrique (tolérance 5 m, cap à 35°, recouvrement ≥ 50 % du plus court des deux et ≥ 5 m). Testé sur cas synthétiques et rejoué sur l'extrait réel (les chiffres Marseille et Ardèche ci-dessus sont retrouvés). **Non validé** : pas de vérité de filiation, aucun seuil calibré ; deux chaussées à moins de 5 m sont confondues (test) ; l'ancienne géométrie d'un objet **modifié** n'est dans aucun service (il faut avoir conservé l'état précédent).

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
- *Détecter les tronçons qui ont changé* : `filiationDifferentiel` sur les objets d'une couche importée, pour signaler ceux dont l'identifiant a disparu.

## 9. Reproduire

```
cd projects/Atlas
node --test tests/reseau-*.test.js          # hors réseau
node tools/mesurer-calage.mjs               # mesure à vérité synthétique, hors réseau
```

Les extraits réels figés (`tests/fixtures/reseau/*.json`) viennent du WFS et du service d'itinéraire de la Géoplateforme, relevés le 09/10/2026, en Licence Ouverte 2.0 (IGN).
