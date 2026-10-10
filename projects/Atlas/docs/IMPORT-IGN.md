# Importer des données de l'IGN dans Atlas

*Rédigé le 10/10/2026. Ce qui est dit « mesuré » l'a été par requête réelle au WFS de la Géoplateforme ce jour-là ; ce qui ne l'a pas été est dit « non vérifié ».*

Un bouton **IGN**, à côté d'**OSM** dans le panneau Couches (et une entrée « Importer depuis IGN » dans la palette de commandes), ouvre un panneau d'import des données de la BD TOPO et d'Admin Express. Même idée que l'import OSM : la zone importée est l'**emprise visible**, la vue remise à plat ; le résultat est une couche d'Atlas comme une autre (sélection, bulle, filtre, export, enregistrement dans une table Grist).

Trois différences avec OSM, voulues : l'import est **précédé d'une estimation** (le nombre d'objets de la zone, sans rien télécharger), il est **conduit par pages** (progression, annulation, reprise) et la couche garde sa **provenance** (source, licence, attribution, édition).

## Utilisation

1. Panneau **Couches** > **IGN**. La zone visible s'affiche en tête ; zoomez pour la réduire.
2. Touchez un jeu (routes, bâtiments, cours d'eau…). Atlas compte les objets de la zone (`resultType=hits`, ~0,15 s) et dit : *« 2 178 objets. Durée attendue : environ 1 s »*.
3. **Importer N objets**. Une barre d'avancement, le reste estimé, le nombre d'objets refusés ; **Annuler** à tout moment.
4. Le résumé dit le nombre importé, refusé, la durée, les motifs des refus (avec le rang des objets dans la source), la provenance et le lien vers la licence.

La caméra **reste où la personne l'a mise** (l'application cadre d'ordinaire sur la couche ajoutée ; pour un import par zone, une commune ou un département l'emmènerait très loin). La couche arrive avec un **style par défaut** et l'**attribution** « © IGN — BD TOPO® (Licence Ouverte 2.0) » affichée en bas de la carte tant qu'elle est montée. Dans l'inspecteur de la couche, sous le titre : la source, le jeu, la licence (lien), l'édition et l'avertissement sur le retard.

### Les seuils

| Nombre d'objets | Ce qui se passe |
|---|---|
| 0 | refus : « Aucun objet dans cette emprise » |
| 1 à 5 000 | import |
| 5 001 à 50 000 | import après avertissement (long, carte plus lourde) |
| plus de 50 000 | **refus** : « Zoomez pour réduire la zone importée » |

50 000 est le seuil au-delà duquel une table Grist cesse d'être un bon porteur de géométrie (`essais-import/RECOMMANDATION.md`). **Jamais de requête sans emprise** (mesuré : sans emprise, 1 000 bâtiments = 52 s, 5 000 = 504 ; avec emprise, 5 000 objets en 2 à 3 s). Chaque jeu a aussi un côté maximal d'emprise (0,5° pour les jeux denses, 1° pour les autres) : au-delà, refus avant toute requête. Le décompte d'une grande zone est lent (mesuré : 3,5 s pour 577 215 bâtiments sur 0,5°) ; il est borné à 20 s.

### Annuler, reprendre, panne

- **Annuler** coupe la requête en cours. Aucune couche n'est créée ; les objets déjà lus restent en mémoire, **Reprendre** repart du rang suivant, sur la même zone, sans doublon. **Abandonner** les jette.
- Une **panne** du service (réseau, 429, 5xx) est rejouée trois fois par le client, puis l'import s'arrête sur un message en français et se reprend de la même façon. Une page qui n'arrive pas en 60 s est redemandée avec la moitié des objets.
- Une **erreur du service** est du XML (`ows:ExceptionReport`) : son texte est remonté tel quel, derrière « Le service de l'IGN a refusé la requête ».
- Les objets **refusés** (sans `cleabs`, géométrie absente, illisible, d'une autre famille, anneau ouvert…) sont comptés par motif, avec le rang de cinq exemples ; ils ne bloquent pas l'import. Les doublons (page relue après une reprise) sont comptés à part.

## Les jeux

Chaque couche et chaque attribut ont été relevés par requête réelle le 10/10/2026 ; les extraits (quelques objets) sont dans `tests/fixtures/import-ign/`, et `tests/import-ign.test.js` vérifie que tous les attributs retenus y figurent.

| Jeu | Couche du service | Forme | Attributs principaux | Style par défaut |
|---|---|---|---|---|
| Routes | `BDTOPO_V3:troncon_de_route` | ligne | `importance`, `nature`, `sens_de_circulation`, `nombre_de_voies`, `largeur_de_chaussee`, noms, `cpx_numero` | couleur par importance (6 classes), largeur graduée (inversée) |
| Bâtiments | `BDTOPO_V3:batiment` | surface | `hauteur`, `nombre_d_etages`, `usage_1`, `materiaux_*`, `identifiants_rnb` | volumes extrudés par `hauteur` |
| Cours d'eau | `BDTOPO_V3:cours_d_eau` | ligne | `toponyme`, `importance`, `code_hydrographique` | bleu, nom en étiquette |
| Plans d'eau | `BDTOPO_V3:plan_d_eau` | surface | `nature`, `toponyme`, `importance` | à plat, nom en étiquette |
| Surfaces en eau | `BDTOPO_V3:surface_hydrographique` | surface | `nature`, `persistance`, `statut` | à plat |
| Végétation | `BDTOPO_V3:zone_de_vegetation` | surface | `nature` | à plat, vert translucide |
| Voies ferrées | `BDTOPO_V3:troncon_de_voie_ferree` | ligne | `nature`, `electrifie`, `nombre_de_voies`, `usage`, `vitesse_maximale` | gris, trait épais |
| Repères routiers | `BDTOPO_V3:point_de_repere` | point | `route`, `numero`, `abscisse`, `cote`, `libelle` | points, libellé en étiquette |
| Communes | `ADMINEXPRESS-COG-CARTO.LATEST:commune` | surface | `nom_officiel`, `code_insee`, `population`, `superficie_cadastrale` | à plat, fond léger, nom en étiquette |
| Départements | `ADMINEXPRESS-COG-CARTO.LATEST:departement` | surface | `nom_officiel`, `code_insee`, `code_insee_de_la_region` | à plat, fond léger, nom en étiquette |
| Équipements et services | `BDTOPO_V3:zone_d_activite_ou_d_interet` | surface | `categorie`, `nature`, `toponyme`, `adresse_postale`, `commune` | à plat, couleur par catégorie |

### Ce qui a été mesuré (10/10/2026, Marseille centre « ville » 0,8 × 0,8 km, Ardèche « campagne » 4 × 4 km)

Estimation (`resultType=hits`) et import (pages réelles) sont **identiques** sur les 18 imports réussis de la série : aucun objet perdu, refusé ou en double.

| Jeu | Ville : estimé = importé | Campagne : estimé = importé |
|---|---|---|
| Routes | 459 | 1 519 |
| Bâtiments | 2 178 (hauteur : 2 176) | 2 333 (hauteur : 2 268, soit 97,2 %) |
| Cours d'eau | 3 | 13 |
| Plans d'eau | 0 (refus « aucun objet ») | 0 |
| Surfaces en eau | 1 | 46 |
| Végétation | 17 | 180 |
| Voies ferrées | 24 | 0 |
| Repères routiers | 0 (voies communales : aucun repère) | 62 |
| Communes | 1 | 5 |
| Départements | 1 | 2 |
| Équipements et services | 57 | 65 |

Durées sans pause artificielle : 1 519 routes en 0,39 s, 2 178 bâtiments (2 pages) en 0,64 s, 180 zones de végétation (2,1 Mo) en 0,42 s ; le décompte seul en 0,06 à 0,2 s. La durée annoncée avant l'import (`estimerDuree` : 200 ms par page, 0,2 ms par objet, pause de 200 ms entre pages) est volontairement pessimiste de deux à trois fois, parce que le débit réel dépend de la liaison de la personne.

Poids du GeoJSON en mémoire : 1,3 Mo pour 2 178 bâtiments, 1 Mo pour 1 519 routes, 2,1 Mo pour 180 zones de végétation (géométries détaillées).

### Particularités des données

- **`hauteur` n'est pas toujours renseignée** : 99,9 % sur 1 000 bâtiments en ville, 96,1 % à la campagne. Un bâtiment sans hauteur est importé et reste à plat. Hauteur photogrammétrique (précision annoncée 1,5 m).
- **`importance`** est du texte (« 1 » à « 6 », 1 = la plus forte) ; **`nombre_de_voies`** est nul sur 14 % des tronçons du centre de Marseille et vaut 0 sur 3 % ; `vitesse_moyenne_vl` est une moyenne, pas une limite réglementaire.
- **Les objets administratifs sont entiers** : une commune ou un département dépasse l'emprise demandée dès qu'elle la touche (une commune de 100 Ko, un département de 100 Ko à 1 Mo). Paris, Lyon et Marseille sont une commune ; leurs arrondissements sont une autre couche, non proposée.
- **Les cours d'eau** sont des objets en plusieurs parties : un `MultiLineString` reste **un** objet (jamais éclaté, une ligne par `cleabs`) ; une partie unique devient une ligne simple. Même règle pour les surfaces.
- **Les repères routiers** ne couvrent que les routes numérotées (autoroutes, nationales, départementales).
- **Les équipements** sont des emprises d'activité ou d'intérêt (santé, culte, enseignement, administration…), pas un inventaire du mobilier urbain. La couche `erp` existe mais était vide sur les deux zones essayées. Pas de feux, passages piétons, panneaux, éclairage public ni arrêts de bus fiables (voir `DONNEES-IGN.md` §5).
- **Les positions portent une altitude** : elle est retirée, les coordonnées sont arrondies au centimètre.

### Identité et mise à jour

`cleabs` (identifiant stable d'une édition à la suivante) et `date_modification` sont **conservés tels quels** dans les propriétés de chaque objet. Rien ne les exploite encore : c'est ce qui permettra de mettre à jour une couche importée sans la refaire (comparer les clés, ne reprendre que les objets modifiés, signaler ceux qui ont disparu, voir `lib/reseau/filiation.js`). Les couches d'Admin Express n'ont pas de `date_modification`. L'identifiant de ligne du service (`batiment.49696461`) n'est pas repris.

## Licence, attribution, retard d'édition

- Données en **Licence Ouverte 2.0** : citer l'IGN comme source. Texte : <https://github.com/etalab/licence-ouverte/blob/master/LO.md> ; conditions d'utilisation de la plateforme : <https://cartes.gouv.fr/cgu/>. Les deux liens sont dans les informations de la couche.
- **L'attribution** (« © IGN — BD TOPO® (Licence Ouverte 2.0) » ou « … ADMIN EXPRESS … ») est déclarée par la source de la couche et affichée par MapLibre en bas de la carte. Elle est lue dans `couche.style.provenance.mention` : elle survit à l'enregistrement du projet et de l'apparence. C'est du **texte seul** : MapLibre l'écrit avec `innerHTML`, et une provenance vient d'un fichier (`lib/provenance-couche.js` retire tout ce qui ressemble à une balise).
- **Retard d'édition.** Le WFS de la Géoplateforme annonçait, le 10/10/2026, l'édition BD TOPO du **15/06/2026** (résumé de chaque couche dans `GetCapabilities` : « Bâtiments − BDTOPO® V3 2026-06-15 ») ; le jeu téléchargeable et le calcul d'itinéraire peuvent être d'un trimestre plus récents. La couche le dit : l'édition annoncée (constante `EDITION_ANNONCEE`, **à relever de nouveau** quand le service change d'édition), la plus récente `date_modification` vue dans les objets importés, et l'avertissement. L'édition d'Admin Express n'est pas lue par le service : « dernière édition publiée ».
- Rien n'est mis en cache, rien n'est republié : l'import est une lecture du service au moment du clic.

## Comment c'est fait

```
vue-import-ign.js        le panneau (DOM), chargé à la demande par A.openIGN
  import-ign-session.js  la conduite : choisir, estimer, importer, annuler, reprendre (réseau, carte, couche injectés)
    import-ign.js        le catalogue des jeux, les requêtes, la normalisation, la provenance, les messages (pur)
    import-lots.js       COMMUN : seuils, suivi d'avancement, rapport des refus, importer par pages (pur)
    import-ign-couche.js pose le style par défaut et la provenance sur la couche d'Atlas
    reseau/wfs-bdtopo.js le client WFS (lirePages, compterHits, délai par page)
provenance-couche.js     lit style.provenance : attribution de la carte, informations de la couche (pur)
sources-import.js        le registre des sources d'import (OSM, IGN) : boutons et palette
```

Dans `app_v7.js` : le bouton et l'entrée de palette viennent du registre, `A.openIGN` est une délégation d'une ligne (`import()` dynamique), la source GeoJSON reçoit l'attribution (`optionsSourceGeojson(data, attributionDe(layer))`), l'inspecteur montre la provenance et la hauteur d'extrusion se lit aussi dans `couche.style.heightField` (elle survit à un rechargement, ce que `couche.heightField` ne fait pas).

`import-lots.js` est écrit pour servir **toute** source d'import volumineuse (fichier, QGIS, OSM) : il reprend les idées de `essais-import/` (seuils, estimation, progression, annulation, reprise, rapport des refus) sans en importer le dossier, et sans la partie « écrire dans Grist par lots d'octets », qui reste à brancher sur `entableLayer` (`essais-import/RECOMMANDATION.md`, chantier 1).

## Ajouter un jeu

1. **Relever** sur le service : le nom de la couche (`GetCapabilities`, ou `DescribeFeatureType`) et ses attributs (`GetFeature` sur quelques objets, avec `BBOX` et `SORTBY=cleabs`).
2. Ajouter l'entrée dans `PRESETS` (`lib/import-ign.js`) : `id`, `libelle`, `icone` (une clé de `ICONES` dans `vue-import-ign.js`), `groupe`, `produit` (`bdtopo` ou `admin`), `couche`, `famille` (`Point`, `LineString`, `Polygon`), `attributs` (avec `cleabs`), `page` (objets par page : petit si chaque objet pèse lourd), `coteMaxDeg`, `style` (voir `styleDeCouche`), `ordreDeGrandeur`, `avertissements`.
3. Mettre un extrait réel (3 objets au plus, géométries rognées) dans `tests/fixtures/import-ign/<couche>.json` et l'ajouter à `FIXTURES` dans `tests/import-ign.test.js` : le test refuse un attribut que le service ne connaît pas.
4. Un jeu d'un autre producteur (hors IGN) demande son propre module, sur le modèle de `import-ign.js`, et une entrée dans `sources-import.js`.

## Vérifié dans un navigateur (10/10/2026)

Atlas servi depuis le dépôt, Chrome 154 isolé (profil et port de débogage à part), service réel de l'IGN en lecture :

- les **onze jeux** importés sur deux zones (centre de Marseille, Ardèche), estimation = import à l'objet près (aucune ligne « le service en annonçait » dans les résumés), attribution « © IGN — BD TOPO® (Licence Ouverte 2.0) » ou « … ADMIN EXPRESS … » en bas de la carte (les deux ensemble quand les deux jeux sont là) ;
- **bâtiments extrudés par `hauteur`**, routes colorées par importance avec une largeur graduée (légende exacte), équipements colorés par catégorie ;
- **annulation** en cours d'import (aucune couche créée, objets lus gardés), **reprise** jusqu'à 15 384 bâtiments sans doublon (9 pages) ;
- **zone trop grande** (« Zone trop grande pour « Bâtiments » (plus de 0,5° de côté) : zoomez. »), **trop d'objets** (321 375 bâtiments : refus, bouton inactif), **erreur XML du service** et **indisponibilité (503)** simulées, avec « Réessayer » ;
- la couche **se comporte comme une couche OSM** : sélection d'objets (mode « Éditer », ◀ ▶), filtre (un contrôle par `nature` : décocher « Sentier » les retire de la carte), export GeoJSON (310 objets, `cleabs` et `date_modification` présents, coordonnées sans altitude), enregistrement du projet (la provenance, `heightField` et le mode d'extrusion y sont), inspecteur avec la source et le lien vers la licence ;
- au clavier : Tab entre les cartes, Entrée choisit, le focus passe sur « Annuler » pendant l'import puis sur le titre du résumé ; en téléphone (390 px), pas de défilement horizontal.

Un défaut trouvé au passage, **qui n'était pas propre à l'IGN** : une couche catégorisée par un champ **texte** (les routes par importance, les équipements par catégorie) se peignait **en noir**, alors que la légende annonçait les bonnes couleurs. L'expression du champ (`fieldExpr`) lisait `at 0` sur toute valeur, ce qui lève sur un texte. Corrigé (`at` n'est évalué que sur une liste) et gardé par un test.

## Ce qui n'est pas fait, ou pas vérifié

- **Écrire la couche dans une table Grist** (`entableLayer`, lots de 200 lignes, comme pour OSM) : **non essayé** (pas de document Grist dans cette session). La couche est de la même forme qu'une couche OSM, mais au-delà de quelques milliers d'objets le chantier des lots par budget d'octets reste à faire.
- **La bulle d'un objet isolé** : non vérifiée (la sélection d'objets l'est).
- **Mettre à jour** une couche déjà importée (clés et `date_modification` sont là, la comparaison ne l'est pas).
- **Zone plus grande que l'écran**, import par tuiles de plus de 50 000 objets : non.
- Le comportement **dans l'application mobile** (client natif de Capacitor, pas de `Referer`) : le WFS n'a pas montré d'exigence d'en-tête, mais l'import n'a pas été essayé depuis l'application.
- La concurrence des quotas : le service annonce 30 requêtes par seconde (CGU) ou 1 par seconde (en-tête observé) ; l'import fait au plus une requête toutes les 200 ms, une seule à la fois.
