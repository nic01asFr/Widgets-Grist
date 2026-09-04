# Atlas — état des lieux, et ce que le socle rend possible

> Écrit le 25/08/2026, au terme des chantiers « scène externe » et « découplage ».
> But : dire ce qu'Atlas **est**, avant d'arbitrer ce qu'il pourrait devenir.
>
> Les chiffres sont mesurés, pas estimés. Les usages sont séparés en **attestés**
> (vus tourner) et **supposés** — la distinction compte, parce qu'un usage
> supposé ne justifie pas un chantier.

---

## 1. Ce qu'Atlas est, en un paragraphe

Un widget Grist qui affiche une carte à partir de ce que le document contient, et
qui sait désormais afficher une carte à partir de ce qu'il **ne contient pas**.
Environ 13 000 lignes : 6 400 pour l'application, 5 300 réparties en 26 modules,
1 250 de page. 30 fichiers de test, 432 assertions.

Il n'a **aucune dépendance de build** et **aucun compte à lui** : il vit dans
Grist et hérite de ses droits, ou il vit seul et n'écrit nulle part.

---

## 2. Quatre régimes, pas un

C'est la clé pour raisonner sur la suite : Atlas ne fonctionne pas d'une seule
manière, et chaque régime a ses possibilités et ses interdits.

| Régime | D'où vient la scène | Document | Écriture |
|---|---|---|---|
| **Maquette** | tables `Maquette_Layers` du document | oui | oui |
| **Scene Manifest** | table `SceneManifest` du document | oui | oui |
| **Scène externe** (`?scene=`) | une adresse HTTPS | **non** | **aucune** |
| **Autonome** | l'accueil demande où se connecter | non | locale |

Cinq tables au total : `SceneManifest` et `QgisWidgets` sont **lues** ;
`Atlas_LayerPrefs`, `Atlas_ScenePrefs` et `Atlas_Story` sont **écrites** ;
`Maquette_Layers` n'est **créée qu'à la demande**, pour ne rien imposer aux
documents qui ne s'en servent pas.

> **La règle qui gouverne le troisième régime** : une scène lue dans le document
> est de confiance — l'y mettre demandait le droit d'écrire. Une scène chargée
> par URL ne l'est pas, et Atlas ne lui donne pas le document. Ce n'est pas une
> précaution, c'est le cas d'usage : le hub publie une scène dont les couches
> sont publiées, il n'a aucun besoin du document.

---

## 3. Six origines de données

`origineDeCouche` en distingue six, et la distinction n'est pas cosmétique : elle
décide **à qui revient un échec**.

| Origine | Ce que c'est | État |
|---|---|---|
| `table` | une table du document | servi |
| `inline` | le GeoJSON dans le manifeste | servi |
| `url` | une adresse vers du GeoJSON | servi |
| `tuiles` | PMTiles | **non servi** — protocole absent |
| `service` | `xyz` · `wms` · `wmts` · `wfs` | `xyz` servi, les trois autres non |
| `atelier` | fichier local, base sans adresse publique | **jamais servi** — inatteignable depuis un navigateur, par construction |

La dernière ligne est la plus utile en pratique : une couche `atelier` qui arrive
jusqu'à Atlas est un **défaut du producteur**, pas une limite d'Atlas. Le message
le dit, et envoie publier la donnée plutôt que chercher chez le consommateur.

---

## 4. Ce qu'Atlas sait faire

**Composer** — sept modules : Lieu, Couches, Contrôles, Récit, Soleil, Vue &
rendu, Catalogue 3D. Symbolisation fixe, catégorisée ou graduée ; contour,
opacité, étiquettes, extrusion ; ordre des couches au glisser ; import OSM par
Overpass, fichier, ou table du document.

**Montrer** — un mode lecture qui retire les modules d'auteur, des contrôles
exposés en pastilles (filtres de plage, de sélection, temporels), une légende
cliquable, un récit rejouable dont chaque étape emporte **sa propre** copie de la
symbolisation.

**Situer** — relief 3D avec exagération, surfaces posées sur le sol, modèles 3D
instanciés, soleil daté, projection globe ou plan.

**Et depuis le 25/08, tenir tout cela sans détenir les entités** : comptes,
champs, types, bornes, valeurs de contrôle et emprise viennent alors du
manifeste ; le filtrage est dit à MapLibre ; l'inspection passe par la feature
rendue.

---

## 5. Les usages — attestés et supposés

**Attestés**, c'est-à-dire vus fonctionner sur des données réelles :

- **Un import QGIS devient une carte.** Le chemin qgis2grist → Scene Manifest →
  Atlas tourne (cas Bee Farming, grille CRESO à 42 182 mailles).
- **Une scène publiée s'ouvre sans document** (Sète, 400 bâtiments servis par le
  hub SSP Cloud) : symbologie, contrôles, filtres, inspection.
- **Une scène mixte** — une couche du document, une couche distante — dans le
  même document Grist.

**Supposés**, plausibles mais non observés : la présentation en réunion via le
récit, la consultation mobile sur le terrain, l'intégration dans une page tierce
par iframe. Ils ont guidé des choix de conception ; ils n'ont pas été mesurés.

> À garder en tête avant d'ouvrir un chantier : **le seul usage attesté hors
> document est celui d'un producteur unique**, qui publie ses scènes. Tout ce qui
> suit suppose d'autres producteurs, ou d'autres lecteurs.

---

## 6. Les usages envisagés — pertinence et manière

### 6.1 Un catalogue de sources de référence (Géoplateforme, OSM, data.gouv)

**Pertinence : forte.** C'est le prolongement direct de ce qui existe : le panneau
Couches propose déjà OSM, Fichier, Table ; y ajouter des sources **de référence**
ne demande aucun concept nouveau, et le contrat sait déjà les exprimer.

**La distinction à ne pas effacer** : le bouton OSM actuel **importe** — les
entités deviennent celles d'Atlas, éditables, jointes aux autres tables. Une
source de référence, elle, **reste chez son producteur**. Deux besoins
différents : travailler la donnée, ou la voir. Le vocabulaire doit les séparer :
« importer dans le document » face à « ajouter une couche de référence ».

**Manière** : `wmts` puis `wms` d'abord — du template d'URL, comme `xyz`, pour
presque rien, et ça ouvre toute la Géoplateforme. Le **catalogue** ensuite, car
c'est lui qui rend la fonction réelle : personne ne connaît par cœur l'adresse
WMTS de l'IGN. `wfs` en dernier, c'est le seul vrai morceau.

**Le garde-fou** : une couche par URL est **téléchargée en entier**. 539 Ko pour
400 bâtiments. Une donnée volumineuse doit passer par un service **tuilé**, jamais
par une URL directe — sinon on troque un import contre un téléchargement qu'on ne
maîtrise plus.

### 6.2 Streamer depuis une base distante, et éditer en place

**Pertinence : à découper.** La **lecture** streamée est à portée et rentable ;
l'**édition en place** est un autre produit.

Ce que ça reproduit existe et a des standards : **OGC API - Features** (dont la
*Part 4* couvre les transactions), servi par `pg_featureserv`, ou en tuiles
vectorielles par `Martin` / `pg_tileserv`. Et un obstacle est structurel :
**PostgreSQL n'est pas joignable depuis un navigateur**. « Base distante » veut
toujours dire « une API HTTP devant la base ».

**Ce qui bloque l'édition** : Atlas n'a **pas de modèle d'authentification
propre**. Il hérite des droits de Grist. Face à une base tierce : qui authentifie,
avec quel jeton, renouvelé par qui ? On a mesuré cette semaine ce que coûte un
jeton qui expire.

**La manière que je recommande** — *streamer pour voir, écrire dans Grist ce
qu'on ajoute*. La donnée de référence reste chez son producteur ; l'annotation,
le relevé, le statut vivent dans le document, liés par identifiant. Grist sait
déjà faire les droits, l'historique et le multi-utilisateur ; les refaire contre
une base tierce serait construire un second Grist dans Atlas.

> La question « éditable en place » se retourne en **« éditable où ? »**. Si la
> réponse est « dans la base du producteur », Atlas devient un client SIG et en
> hérite tous les problèmes. Si c'est « dans le document », le streaming ne sert
> que la consultation — et il devient beaucoup plus simple, tout en couvrant
> l'essentiel.

### 6.3 Figer une scène — la charnière entre le vivant et le permanent

**Pertinence : la plus forte des trois**, et la moins évidente.

Un manifeste **avec des URL** pèse 2 Ko, se met à jour seul, tient dans un lien.
Le **même** manifeste avec le GeoJSON dedans est autonome : il marchera dans dix
ans, sans réseau, sans jeton, sans mainteneur. Ce n'est pas un détail technique,
c'est un **choix éditorial** — et Atlas devrait le poser au moment de publier.

Trois usages que seul le figé rend possibles :

- **La reproductibilité.** Une carte dans un rapport doit montrer ce qu'on a vu
  *au moment où on l'a vu*. Une scène vivante n'est pas reproductible : la donnée
  a changé, et la carte ne prouve plus rien. Pour une étude ou une pièce
  administrative, ce n'est pas un confort.
- **La comparaison dans le temps.** Deux scènes figées à deux dates font un
  avant/après. Le vivant n'a que le présent.
- **Le hors ligne.** Consultable sans réseau — ce que réclame le terrain, où rien
  ne doit dépendre du réseau au moment de la saisie.

**Ce qui existe déjà, et le piège** : la table `SceneManifest` porte un
`created_at`, Atlas lit la dernière ligne, donc **l'historique s'empile tout
seul**. Mais ce qui est versionné est la **description**, pas la donnée : une
scène de 2023 rejouée aujourd'hui montrerait la donnée d'aujourd'hui avec
l'habillage de 2023.

> **Un historique de manifestes n'est une archive que si les couches sont
> inline.** Sinon c'est un historique de mise en scène — quelque chose qui
> ressemble à une preuve sans en être une.

**Manière** : un geste explicite et daté, « figer cette scène ». Il retélécharge
les couches par URL et les inline. Deux limites à annoncer plutôt qu'à subir :

1. **Une couche tuilée ne se fige pas proprement.** On ne peut extraire que ce qui
   est rendu, découpé par tuile et mal dédupliqué — mesuré : 1210 remontées pour
   400 entités. Il faut redemander au producteur, ou figer partiellement **en le
   disant**.
2. **La taille.** 539 Ko pour 400 bâtiments passent dans une cellule Grist ;
   50 000 entités, non. Il faut un seuil, et un message qui l'explique au lieu
   d'un document qui gonfle en silence.

**Et le plus utile n'est pas de tout figer** : figer **l'emprise regardée et les
filtres actifs** est plus simple, plus léger, et correspond mieux à ce qu'on veut
garder — la carte qu'on a montrée, pas la base entière.

---

## 7. Ce qui devrait être décidé avant d'ouvrir quoi que ce soit

1. **Publier ce qui existe.** `published/atlas/` est resté à la version en ligne :
   `?scene=`, le découplage, les tuiles `xyz` ne sont accessibles à personne. Tant
   que ce n'est pas promu, chaque chantier s'empile sur du travail invisible — y
   compris pour l'amont, qui attend de pouvoir embarquer Atlas.
2. **Trancher la clé des préférences** (`sourceTable || id`), qui touche le garde
   d'écriture de toutes les scènes qgis2grist existantes.
3. **Choisir entre étendre les origines (6.1) et fermer le cycle (6.3).** Le
   premier élargit ce qu'Atlas peut montrer ; le second décide de ce qu'il en
   reste. À mon sens, le second a plus de valeur et moins de surface : il ne
   dépend d'aucun tiers, d'aucun CORS, d'aucun jeton — seulement de nous.

---

## Ce qui reste ouvert par ailleurs

- Le **calage relief** d'une couche distante a été éprouvé (03/09/2026, vallon des
  Aygalades) et **ne tient pas** sur un relief marqué : l'altitude unique est
  juste au seul point où elle est sondée — écart mesuré de +57 m au fond de
  vallon à −148 m sur le coteau, pour 220 m d'amplitude. Le bâti forme une nappe
  suspendue que les lignes drapées traversent. Contourné dans la démo (surfaces à
  plat, drapées par MapLibre) ; **non résolu dans Atlas**. Deux voies : refuser
  l'extrusion dans ce cas avec un message qui l'explique, ou charger le GeoJSON
  quand le relief est actif — au prix du téléchargement qu'on cherchait à éviter.
  MapLibre n'offre pas de raccourci : `fill-extrusion-base-alignment` est une
  propriété Mapbox GL v3, refusée en MapLibre 5.6.1.
- Un avertissement MapLibre `type number, found null` non élucidé — il vient d'un
  *worker*, hors de portée d'une interception dans la page.
- L'**index de recherche** ne trouve pas les objets d'une couche distante.
- En distant sont désormais éprouvés : **polygone** (plat et extrudé), **ligne**
  (voirie, rail, cours d'eau) et le **récit** (huit étapes). Restent non éprouvés
  le **mode mobile** et le clic sur un **modèle 3D**, qui n'ouvre pas de fiche.
- Les **modèles 3D exigent une couche qui porte ses entités** (inline ou table) :
  servis par URL, rien n'est instancié — la légende annonce son compte, le
  catalogue se charge, et la carte reste nue. Mesuré : 374 objets par URL
  n'affichaient rien, les mêmes en inline donnent 1 245 instances.
- Les **réglages globaux de scène** (fond, soleil, relief, ombres, ciel,
  étiquettes) sont enregistrés depuis la v1.5.0 dans `Atlas_ScenePrefs`. Le cycle
  complet — écrire, fermer, rouvrir, retrouver — **reste à éprouver dans un
  document Grist réel** ; seuls les tests unitaires et le maillon d'application
  sont vérifiés.
