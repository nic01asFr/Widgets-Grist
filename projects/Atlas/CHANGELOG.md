# Journal des versions d'Atlas

Écrit pour les personnes qui intègrent Atlas (applications hôtes) et pour celles qui le publient. Le journal pour les utilisateurs est dans la vitrine (`published/atlas/vitrine.json`, rubrique `journal`) ; les versions antérieures à la 1.13.2 n'y sont que là.

Adresse publique : `https://nic01asfr.github.io/Widgets-Grist/atlas/` (elle suit la dernière version). Pour chaque version : le contrat du composant BI, la version du client en un fichier et son empreinte, car un hôte les épingle.

| Repère | Valeur actuelle |
|---|---|
| Contrat du composant carte BI | 0.3 (additif depuis sa publication) |
| Client de l'hôte en un seul fichier | `lib/bi/client-hote.js`, `VERSION_CLIENT` 1, 14 770 octets |
| Empreinte du client | `sha384-BKqMqAslAVNAB7iCXpuHU+RzIQ8TLTCfKdh+rHpibyJnplgaOexPQ4nKzpDVWKYY` |
| Moteur de formulaires vendorisé | celui de la 1.13.1 (une publication d'Atlas ne le fait pas bouger) |

Une nouvelle empreinte du client s'accompagne d'une nouvelle `VERSION_CLIENT`, annoncée sur le fil des hôtes **avant** publication.

## 1.27.0 — une carte de sélection de cases, les arrondissements dans la scène, la caméra réelle pour les dalles 3D

- **Carte de sélection** (demande de la Fabrique, qui remplace sa carte Leaflet) : l'événement `camera` porte l'emprise visible (`bounds`, ouest-sud-est-nord) pour qu'une grille suive la vue ; `setScene({ fusion: true, layers: [...] })` ne remplace QUE les couches listées (les autres couches, le temps, l'interface, les marges et la sélection restent) ; `visuel.etiquette: { champ, taille }` pose un texte permanent sur chaque surface (« 6/25 ») ; `curseur` de la scène (`crosshair`, `zoom-in`, `zoom-out`, `pointer`, `grab`, `cell`, `default`). Le style gradué, `highlight` de plusieurs cases et le clic sans bulle existaient déjà.
- **Correctif** : `admin: { niveau: 'commune', arrondissements: 'detailles' }` dans le manifeste de scène n'avait aucun effet (seul `addAdminLayer` lisait l'option) ; il remplace maintenant Paris, Lyon et Marseille par leurs arrondissements (la commune reste entière tant qu'il en manque). Retour de referentiels-2874.
- **Dalles 3D** : le niveau de détail suit l'ŒIL de la caméra (`transform.cameraPosition`), plus le centre de la carte au sol (MapLibre 5 n'a pas `getFreeCameraOptions`).
- **Contrat 0.3, client et empreinte inchangés** : aucune commande ajoutée.

## 1.26.1 — la bulle d'une couche administrative

- **Correctif** : une `bulle` déclarée sur une couche administrative (`admin: { niveau: 'commune' }`) ne s'ouvrait jamais, sans événement ni avertissement ; elle s'ouvre maintenant à la sélection (clic ou `select('13047')`), et une déclaration invalide est dite dans `_avertissements`. Retour de referentiels-2874.
- **Documentation** : l'identifiant d'une unité administrative est son code en texte (`select('13047')`, pas `select(13047)`) ; les arrondissements de Paris, Lyon et Marseille se demandent par `arrondissements: 'detailles'`.

## 1.26.0 — l'interface optionnelle de la carte : légende, curseur de temps, historique d'un objet

- **Interface optionnelle** : `interface: { legende: true, temps: true }` dans le manifeste affiche une légende (d'après `getLegend`) et un curseur de temps avec lecture, dans la zone utile (jamais sous votre panneau, ni sur les crédits de la carte), aux couleurs de la charte. Modules `lib/bi/ui/`, environ 6 Ko gzip, importés à la demande : rien n'est chargé sans la déclaration. Invalide : dit dans `_avertissements._interface`.
- **Légende ciblable** : `interface.legende.cible: true` fait de chaque classe un bouton à bascule dont le clic est dit à la page (événement `classe { layer, cle, libelle, active }`) ; la légende ne filtre rien. Sur une carte étroite (téléphone) elle se range en bas, repliée, comme une feuille.
- **Tables liées** : une couche `type: "table"` (lignes sans géométrie fournies par la page) et `bulle.liste` montrent l'historique d'un objet dans sa bulle (jointure sur une clé, tri par date, jusqu'à 10 lignes). `updateFeature` sur une table corrige une ligne ou la crée, et la bulle ouverte se refait sur place. Demande de SURFAC²E.
- **Démonstration** : `demos/hote-bi/interface.html`.
- **Contrat 0.3, client et empreinte inchangés** : aucune commande ajoutée.

## 1.25.0 — la démonstration du canevas, un surlignage visible partout, des marges qui ne bloquent plus

- **Démonstration** : `demos/hote-canevas/index.html` montre une application qui embarque le canevas d'Atlas : envoyer une scène, recevoir `select` et `hover`, masquer une couche, cadrer, saisir l'adresse d'un manifeste de dalles 3D, recharger sans fond de plan.
- **Dalles 3D** : l'éclairage est relevé (les couleurs de sommet de la Fabrique sont maintenant linéaires, donc plus sombres à éclairage égal) et l'encodage sRGB de la sortie est explicite.
- **`highlight`** se voit sur les polygones (contour de la sélection, remplissage plus plein) et sur les lignes ; avant, seul un cercle changeait d'aspect. Demande de SURFAC²E.
- **Marges** : un padding plus grand que le cadre est réduit proportionnellement (au moins 20 % libres) au lieu de laisser la carte immobile, et un cadre masqué ou à 0 px rejoue le cadrage au premier redimensionnement. Retour d'appkit.
- **Contrat 0.3, client et empreinte inchangés.**

## 1.24.0 — les maquettes en dalles 3D, et une carte sans fond de plan

- **Maquettes en dalles 3D** (profil complet) : une couche de scène `type: "dalles3d"` désigne un manifeste de grille (`pix2hdr-atlas-grille3d/0.1`). Atlas lit les dalles livrées dans la fenêtre, choisit le niveau selon la distance (D2 près, D3 loin), charge par priorité sans jamais laisser de trou, garde un cache à budget, recharge quand la Fabrique republie, et pose chaque dalle par son ancrage (convergence des méridiens, facteur d'échelle, altitude IGN69). Vérifié en navigateur sur la dalle témoin.
- **`base=aucune`** : `<atlas-bi base="aucune">` crée la carte sans fond de plan : aucun service tiers au démarrage (mesuré : zéro ressource hors de l'origine d'Atlas). Avant, `fond="uni"` masquait un style déjà chargé (~1 Mo d'appels à OpenFreeMap). Retour d'appkit.
- **Clics et survols** (profil complet) : les couches de la scène Atlas posées par la page remontent `select` et `hover` avec les identifiants de la scène et les propriétés de l'objet ; les couches de la personne qui regarde ne remontent jamais.
- **Composant nu inchangé** : le contrat reste 0.3, même client, même empreinte ; les modules de dalles ne sont chargés que par une scène de dalles.

## 1.23.0 — le canevas piloté par la page : une scène Atlas par `setScene`

- **Profil complet** : `setScene` accepte aussi une scène Atlas (Scene Manifest 0.2.x, reconnue à sa `version`). L'application la monte comme une scène externe : relief, 3D, éclairage, récit, couches d'objets. Une scène en remplace une autre, sans toucher aux couches de la personne qui regarde. `ready` annonce `canevas: true` ; `ping`, `setLayerVisibility` et `fitTo` reconnaissent ses couches ; le retour de `setScene` donne un compte par couche (`null` pour une couche distante) avec `_erreurs` et `_avertissements`.
- **Sécurité** : la scène vient de la page hôte, donc traitée comme toute scène externe (aucun accès au document) ; adresses absolues en https seulement (http sur localhost), jamais `data:`/`blob:`/`file:` ni relative ; plafonds de 4 Mo et 64 couches.
- **Composant nu inchangé** : le module `lib/bi/canevas.js` n'est chargé que si l'application a posé sa façade (profil complet). Contrat 0.3, même client, même empreinte.

## 1.22.0 — le canevas comme composant : le profil complet

- **Composant** : `?bi=1&profil=complet` (ou `<atlas-bi profil="complet" src=".../index.html">`) charge l'application complète d'Atlas (interface, relief, 3D, éclairage, modèles du catalogue) ET le pont du composant : l'hôte pilote ses couches par les commandes habituelles et reçoit les événements. Sans le paramètre, `?bi=1` reste la carte nue (page maigre `bi.html`, redirection inchangée). Pas de voile en profil complet.
- **Limite connue** : les couches propres de l'application (scènes externes, imports, modèles 3D) ne sont pas pilotées par ces commandes et leurs clics ne remontent pas à l'hôte ; ce sont les lots suivants (scène 0.2.2 envoyée par l'hôte, remontée des clics, modèles par dalle).
- **Composant BI** : aucune commande ajoutée, contrat 0.3, même client, même empreinte.

## 1.21.1 — marqueurs d'état : légende, couleurs dites, fond qui suit la charte

- **Composant** : retours d'appkit sur la 1.20. `getLegend` d'un visuel `etats` rend une classe par état (couleur, forme, libellé, compte) au lieu de « Sites : N ». Une couleur de marqueur illisible (`etat-ok` sans `jeton:`, `var(--x)`) ou un jeton absent de la charte donne un marqueur gris et une explication dans `_avertissements` (avant : un marqueur noir sans un mot). Un fond `uni` ou `plan` posé par `setFond` est recalculé quand `setTheme` change la charte après lui (il restait blanc en thème sombre).
- **Composant BI** : aucune commande ajoutée, contrat 0.3, même client, même empreinte.

## 1.21.0 — un composant trois fois plus léger : la page maigre

- **Composant** : `?bi=1` ne charge plus l'application complète (interface, three.js, import, formulaires : ~4,9 Mo non compressés, 146 requêtes) pour n'en garder que la carte. La page `bi.html` charge MapLibre et le composant (~1,4 Mo non compressés, 45 à 50 requêtes). Mesuré le 16/10/2026 : `app.js` (0,98 Mo), 86 modules d'application (0,94 Mo) et three.js (1,5 Mo) n'y sont plus. La carte est créée par `lib/bi/carte-nue.js`, avec le même style de base, le même fond de repli hors réseau, les mêmes libellés français, le même plafond de ratio (`?ratio=`) et la même vue d'ouverture qu'avant ; `lib/fonds-base.js` partage ces constantes avec l'application.
- **Marges** : corrigé à l'essai en navigateur : les marges étaient comptées deux fois par MapLibre (`setPadding` combiné au `padding` de `fitBounds` : une marge de 300 px retirait ~600 px, la carte restait blanche avec un grand panneau) ; elles passent maintenant en `padding` de chaque déplacement ; la bulle d'objet reste maintenant dans la zone utile au lieu de s'ouvrir sous le panneau de l'hôte.
- **Compatibilité** : `index.html?bi=1&…` continue de fonctionner : la page de l'application mène à `bi.html` par une redirection qui garde tous les paramètres (un aller-retour de plus ; les nouveaux hôtes visent `bi.html`). `?scene=` + `bi=1` reste dans l'application, qui charge des couches d'application.
- **Gardes** : la fermeture de `entree.js` ne doit contenir aucun module de l'application ; budgets de poids de la page maigre ; la redirection et le garde d'amorçage sont testés dans les deux pages.
- **Composant BI** : aucune commande ajoutée, contrat 0.3, même client, même empreinte.

## 1.20.0 — la carte prend le style de la page

- **Composant** : `<atlas-bi charte="herite">` lit le style de la page hôte (variables `--atlas-principal`, `--atlas-secondaire`, `--atlas-fond`, `--atlas-encre`, `--atlas-police`, puis variables usuelles des systèmes de design pour la couleur principale, couleur de texte et fond calculés, famille de police ramenée à la liste admise) et l'applique comme une charte ordinaire (contrastes mesurés et dits). Relue quand la page change de thème (événement `atlas-bi-herite`). `lib/bi/herite.js` pour les hôtes sans l'élément. Rien n'est deviné : sans couleur principale trouvée, celle d'Atlas reste.
- **Composant BI** : aucune commande ajoutée, contrat 0.3, même client, même empreinte.

## 1.19.0 — la bulle d'objet, ses actions et les marges, à l'aspect de l'hôte

- **Composant** : bulle d'objet déclarée par couche (`layers[].bulle` : titre, champs, actions ; texte seul), ouverte par la sélection (clic ou `select(id)`), fermée avec elle ; événements `action { layer, featureId, key, actionId }` (l'hôte route) et `bulle { etat, … }`. Marges persistantes (`manifeste.marges`, `flyTo({ marges })`, méthode `setMarges` de l'élément) : `flyTo` et `fitTo` cadrent dans la zone utile. L'interface suit la charte de l'hôte (`lib/charte/interface.js`, variables `--atlas-*`).
- **Palette par défaut** : les quatre premières classes d'une carte sans charte tiennent 3:1 sur fond blanc (bleu, vermillon, vert, pourpre ; l'orange passe en cinquième). **La deuxième classe d'une carte sans charte change donc de couleur** (orange -> vermillon) ; les palettes dérivées des graines d'un hôte ne changent pas.
- **Console** : les icônes que le fond de plan réclame sans les fournir deviennent des images vides (un avertissement par icône en moins) ; la page déclare une icône vide (plus de 404 de favicon).
- **Qualité** : tests de promotion en parallèle (18 s -> 4 s), contacts du trafic en trois fichiers, bornes de temps robustes à la CI, l'outil de couverture dit quels tests échouent.
- **Composant BI** : **aucune commande ajoutée**, contrat 0.3, même client, même empreinte ; les nouveaux événements atteignent aussi les hôtes qui gardent l'ancien client.

## 1.18.0 — des données seules suffisent

- **Composant** : `<atlas-bi donnees="/carte/sites.geojson">` sans `manifeste` : le manifeste est déduit (`lib/bi/inference.js`) et ce qui a été décidé est dit (`inference` dans `atlas-bi-configure`). Couches (une par entrée, une par type de géométrie), identifiants entiers uniques dans toute la scène (l'ancien dans `id_origine`, qui devient la clé), clé métier, couleurs par classe (2 à 8 valeurs partagées), contrôle de filtre. Un manifeste explicite prime toujours ; les données de l'hôte ne sont jamais modifiées.
- **Charte** : une classe de style sans couleur prend la suivante de la palette qualitative de la charte (utile aussi à un manifeste écrit à la main).
- **Composant BI** : aucune commande ajoutée, contrat 0.3 inchangé, même client, même empreinte.

## 1.17.0 — une carte en une balise, qui se décrit elle-même

- **Composant** : `<atlas-bi>` se configure sans code. Attributs `manifeste`, `donnees`, `charte` (adresses de fichiers JSON lues par la page hôte, ou blocs `<script type="application/json" data-atlas="…">`) et `fond` ; appliqués dans l'ordre charte, fond, scène à la connexion et à chaque changement d'attribut, sans recharger l'iframe. Événement DOM `atlas-bi-configure`, méthode `reconfigurer()`, propriété `configure`. Adresses http(s) seulement, 16 Mo au plus, jamais de HTML interprété ; Atlas ne charge toujours aucune charte ni donnée par adresse.
- **Auto-description** : `await AtlasBi.decrire()` (et `lib/bi/describe.js`) rend commandes, arguments, événements, limites, exemples et guide de dix lignes, lus dans le pont : un test échoue si la description diverge du contrat.
- **Composant BI** : aucune commande ajoutée, contrat 0.3 inchangé, même client, même empreinte. `setMarges` et la bulle déclarée demandent une nouvelle commande, donc un nouveau client : ils sont reportés au contrat 0.4.

## 1.16.9 — plafond du ratio de pixels, volumes signalés, inventaire des dépendances

- **Composant** : `?ratio=` (ou l'attribut `ratio-max` de `<atlas-bi>`, 1 à 4) plafonne le ratio de pixels de la carte : à CPU ralenti 4x et ratio 3, 43 images/s sans plafond contre 238 avec un plafond à 1. Sans paramètre, rien ne change. Une couche de plus de 50 000 entités se monte avec un avertissement (`_avertissements`, `ready.avertissements`) qui conseille d'agréger.
- **Documentation** : journal du contrat BI (`docs/CONTRAT-CARTE-BI.md` §14) et inventaire des dépendances et des services contactés (`docs/INVENTAIRE-DEPENDANCES.md`, gardé par un test).
- **Composant BI** : contrat 0.3 inchangé, même client, même empreinte.

## 1.16.8 — plus aucune dépendance externe au démarrage

- **Dépendances embarquées** : MapLibre GL 5.6.1, SunCalc, three.js et ses extensions, terra-draw, geotiff et les polices sont servis depuis `vendor/` (25 fichiers, 3,9 Mo, verrou `verrou-externe.json` et licences). La page ne contacte plus unpkg, cdnjs, jsdelivr ni Google Fonts ; restent l'API de plugin de Grist (application) et les tuiles de fond de carte (données). Manifeste : `vendor-externe.json` ; outil d'embarquement et garde de promotion.
- **Contrôles** : le prédicat de filtre calcule une fois par contrôle ce qui ne dépend pas de l'entité (100 000 entités, trois contrôles : de 808 ms à ~23 ms), avec un test d'équivalence à l'ancienne implémentation sur 400 scénarios aléatoires.
- **Diagnostic des données** (`lib/bi/diagnostic-donnees.js`) : une `FeatureCollection` passée à la place d'un tableau est refusée en clair ; coordonnées hors plage, entités sans géométrie et identifiants en double sont rapportés dans `_avertissements` du résultat de `setScene` et `avertissements` de l'événement `ready`.
- **Accessibilité** : libellés de locale de la carte en français, voile de chargement nettoyé à la levée.
- **Composant BI** : inchangé (contrat 0.3, même client, même empreinte).

## 1.16.7 — un composant plus léger, qui dit pourquoi il ne démarre pas

- **Allégé** : en mode composant (`bi=1`), la page ne charge plus l'API de plugin de Grist (967 Ko, jamais appelée par le composant). L'application Atlas la charge comme avant, au même moment, et l'attend avant de démarrer. Mesuré : plus aucune requête vers `docs.getgrist.com` en mode composant, même démarrage et même rendu.
- **Un démarrage qui échoue le dit** : un CDN bloqué ou un réseau lent laissaient « Chargement de la carte… » sans fin. Le voile nomme maintenant la dépendance en échec, dit « Chargement lent… » après 6 s, et après 20 s l'hôte reçoit un événement `error` (`code` : `dependance` ou `delai`, `niveau` : `fatal`) aux seules origines déclarées par `hote=`. Le client en un fichier est inchangé.
- **`<atlas-bi>`** : attend le composant 30 s par défaut (attribut `delai-connexion`, en millisecondes) au lieu de 8 s.
- **Qualité** : analyseur de références sans faux positif (`check:atlas` vert), CI qui lance les tests et les gardes (le déploiement des Pages en dépendra après un premier passage vert), ESLint à zéro sur la surface publique, planchers de couverture, budgets de poids, fins de ligne LF (`.gitattributes`, `.editorconfig`), promotion qui ne réécrit plus le moteur de formulaires embarqué.
- **Composant BI** : inchangé (contrat 0.3, même client, même empreinte).

## 1.16.6 — les véhicules ne grossissent plus quand on dézoome

- **Corrigé** : en mode « Modèles 3D seulement », les véhicules étaient grossis dès le zoom 17 (×2 par zoom perdu), si bien qu'ils gardaient la même taille à l'écran pendant que la carte rapetissait : ils semblaient grossir. Ils sont maintenant à leur taille réelle et rapetissent avec la carte ; ils ne sont grossis que lorsqu'ils feraient moins de 5 pixels de long (plafond ×8), pour rester visibles.
- **Composant BI** : inchangé (contrat 0.3, même client).

## 1.16.5 — des phares plus discrets

- **Corrigé** : les halos des phares et des feux étaient démesurés (une tache blanche de la taille de trois véhicules, qui les masquait et se recouvrait en un disque saturé). Un halo mesure maintenant 1,6 m (proportionné au véhicule à tous les zooms, et non plus un nombre de pixels), son bord s'éteint plus vite et sa force est ramenée ; le faisceau sur la chaussée est plus étroit et plus pâle.
- **Composant BI** : inchangé (contrat 0.3, même client).

## 1.16.4 — le rendu des véhicules au choix

- **Ajouté** : réglage « Rendu des véhicules » dans la section « Trafic simulé » de « Vue & rendu » : points de loin et 3D de près (défaut, comme en 1.16.3), **modèles 3D seulement** (jamais de points, dès le zoom 13, grossis de loin pour rester visibles) ou points seulement. Modifiable pendant que le trafic roule. Remplace l'interrupteur « Véhicules en 3D » de la 1.16.3 (`traficReglage('vehicules3d', bool)` reste accepté).
- **Ajouté** : sans modèles 3D disponibles (téléphone en lecture, fichier introuvable), le mode « 3D seulement » montre des points et le dit, au lieu de ne rien montrer.
- **Ajouté** : phares et feux des véhicules 3D de nuit — deux phares blancs et leur faisceau sur la chaussée, deux feux rouges, avec leurs halos. Ils suivent le soleil de la scène d'Atlas (même règle que les luminaires : du coucher au lever, d'après la date, l'heure, le fuseau et le lieu du module « Soleil »), en fondu de 1,5 s.
- **Composant BI** : inchangé (contrat 0.3, même client).

## 1.16.3 — un trafic fluide, orienté, en 3D de près

- **Ajouté** : `lib/trafic-rendu.js`. Les véhicules ne sautent plus cinq fois par seconde : la carte dessine, 30 fois par seconde, une position entre le pas précédent et le pas courant du moteur (position et cap interpolés ; un saut de plus de 12 m n'est pas lissé). Le calcul du moteur ne change pas.
- **Ajouté** : fondu à l'apparition (0,6 s) et à l'arrêt (0,4 s, `arreter({ doucement: true })`).
- **Ajouté** : niveau de détail selon le zoom (rien sous le zoom 13, des points ensuite, des modèles 3D du catalogue — `car` et `bus` — à partir du zoom 16), et seuls les véhicules de la fenêtre visible sont dessinés.
- **Ajouté** : `Models3D.vehiculesPreparer/Maj/Effacer` : les véhicules 3D sont des instances de la scène d'Atlas, orientées selon leur cap, posées sur le sol ; réglage « Véhicules en 3D (de près) » dans la section « Trafic simulé » de « Vue & rendu ».
- **Corrigé** : changer le fond de carte pendant que le trafic roule le faisait disparaître définitivement (le changement de style emporte la source et la couche, et la scène 3D est refaite) : la couche est reposée au chargement du nouveau style (ou au dessin suivant si aucun évènement n'est émis), et les véhicules 3D sont repréparés.
- **Composant BI** : inchangé (contrat 0.3, même client).

## 1.16.2 — le trafic simulé ne fige plus la carte

- **Corrigé** : sur un réseau de quelques centaines de tronçons, les premières images du trafic prenaient de 1 à 5 secondes (le calcul des zones de conflit entre trajectoires comparait tous les points deux à deux) : les points sont maintenant rangés dans une grille de proximité, le même calcul passe sous 0,3 s au pire, et sous 5 ms par image ensuite.
- **Corrigé** : une trajectoire de longueur nulle (tronçons confondus ou de longueur nulle dans un carrefour) levait une exception à chaque image ; elle donne désormais son point, sans cap.
- **Ajouté** : un moteur qui échoue trois images de suite est arrêté, `etat().erreur` dit pourquoi et l'interface prévient, au lieu de lever cinq exceptions par seconde.
- **Corrigé** : à l'ouverture d'un projet, une erreur « Cannot read properties of undefined (reading 'layers') » interrompait la restauration quand le style de la carte n'était pas encore chargé (bâti 3D du fond) ; la visibilité est réappliquée au chargement du style.
- **Composant BI** : inchangé (contrat 0.3, même client).

## 1.16.1 — distinguer les routes, les chemins, les pistes cyclables

- **Ajouté** : `lib/modes-voie.js` distingue route, route à accès restreint, chemin, sentier, escalier, piste cyclable et voie ferrée (BD TOPO et OpenStreetMap). L'import des routes de l'IGN porte un attribut dérivé **`type_de_voie`** et colore par type de voie (au lieu de l'importance, qui reste la largeur).
- **Trafic** : ne roule plus que sur les routes ouvertes à la circulation (allées de parc, chemins, sentiers, escaliers, pistes cyclables, voies ferrées, accès restreint ou impossible, projets sont écartés, chacun pour son motif, dit à l'écran) ; l'option `acces: 'tous'` rend les routes à accès restreint. Section **Trafic simulé** du module « Vue & rendu » (couche, densité, accès restreint, animer ou arrêter) ; véhicules dessinés en blanc (voitures) et orange (poids lourds).
- **Composant BI** : inchangé (contrat 0.3, même client).

## 1.16.0 — un trafic simulé sur les routes d'une couche

- **Ajouté** : `A.traficDemarrer(layerId?, { densite, vitesse, graine })`, `A.traficArreter()`, `A.traficEtat()` et l'entrée de palette « Animer le trafic (simulé) ». Des véhicules roulent sur les routes d'une couche de lignes (BD TOPO importée, routes OSM) : sens uniques, voies par sens, carrefours, giratoires, files. **Simulation, pas mesure** : densité, destinations et feux sont des hypothèses. Documentation : `docs/TRAFIC.md`.
- **Interne** : le moteur (`lib/trafic/`, 36 tests) et son intégration (`lib/trafic-couche.js`) sont chargés à la demande ; la promotion copie `lib/trafic/`.
- **Composant BI** : inchangé (contrat 0.3, même client).

## 1.15.0 — import des données de l'IGN

- **Ajouté** : bouton **IGN** du panneau Couches (et entrée de la palette) : routes, bâtiments, cours d'eau, plans d'eau, surfaces en eau, végétation, voies ferrées, repères routiers, équipements, communes et départements (BD TOPO et Admin Express, Licence Ouverte), dans la zone visible. Estimation avant import, seuils (refus au-delà de 50 000 objets), import par pages, annulation et reprise, provenance, licence et mention de source. Documentation : `docs/IMPORT-IGN.md`, `docs/DONNEES-IGN.md`.
- **Effet de bord utile** : les routes importées portent leur `sens_de_circulation` : les itinéraires respectent les sens uniques sans saisie.
- **Interne** : `lib/reseau/` (graphe, calage, repères, client WFS ; seul `wfs-bdtopo` est branché) ; la promotion copie une liste de sous-dossiers de `lib/` et refuse un module qui en importe un absent.
- **Composant BI** : inchangé (contrat 0.3, même client).

## 1.14.2 — correctifs du composant et sens uniques OpenStreetMap

- **Composant** : `hover { layer: null, featureId: null }` quand le pointeur quitte la carte (le contrat le disait déjà) ; `setHorsLigne('auto')` lève un hors ligne forcé par l'hôte (sauf navigateur réellement hors réseau) ; `manifeste.attribution` s'affiche dans le contrôle d'attribution (texte et liens `http(s)` sûrs).
- **Atlas** : l'itinéraire lit aussi `oneway`, `junction` et `highway` d'OpenStreetMap (la BD TOPO l'emporte quand elle est renseignée).
- **Client en un fichier** : inchangé.

## 1.14.1 — premier rendu propre du composant

- **Composant** : en `?bi=1`, un **voile** neutre (« Chargement de la carte… ») couvre la carte jusqu'à la scène de l'hôte (levé au plus tard après 8 s) ; `?voile=0` le retire ; `?fond=<atlas|voile|uni|plan|plan-ign|photo>` et `?theme=<atlas|contraste-eleve>` posent un fond et une charte avant le premier rendu visible. Guide de l'hôte, § 5 ter.
- **Client en un fichier** : inchangé.

## 1.14.0 — composant carte BI, adresse publique

- **Composant** : capacités annoncées (`ready.capacites`, `capacite_absente`), identifiants entiers stables, style des polygones (`opacity`, `contour`), `etats` (formes, couleurs, texte), charte graphique (`lib/charte/`), couches administratives colorées (communes, départements, régions, pays), jeux embarqués de repli, paquet de données hors ligne (`tools/construire-paquet.mjs`), élément `<atlas-bi>`, page de démonstration.
- **Client** : `lib/bi/client-hote.js`, un seul fichier généré (`tools/generer-client-hote.mjs`), à copier tel quel et à comparer par son empreinte.
- **Correctifs** : contour du choroplèthe, interface d'Atlas masquée pendant le chargement, fond de plan en panne (404/503) qui laissait le composant muet, codes pays, temps d'une scène.
- **Atlas** : itinéraire qui respecte les sens uniques de la BD TOPO, flèche de cap du point bleu, `lib/charte/` copiée par la promotion.

## 1.13.2 — correctif de sécurité

- Une attribution, un nom, une étiquette ou un message venus d'une scène, d'un catalogue ou d'une adresse s'écrivent comme du texte, jamais comme du HTML ; balise CSP dans la page (`base-uri`, `object-src`, `form-action`).
