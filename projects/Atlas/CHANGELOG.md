# Journal des versions d'Atlas

Écrit pour les personnes qui intègrent Atlas (applications hôtes) et pour celles qui le publient. Le journal pour les utilisateurs est dans la vitrine (`published/atlas/vitrine.json`, rubrique `journal`) ; les versions antérieures à la 1.13.2 n'y sont que là.

Adresse publique : `https://nic01asfr.github.io/Widgets-Grist/atlas/` (elle suit la dernière version). Pour chaque version : le contrat du composant BI, la version du client en un fichier et son empreinte, car un hôte les épingle.

| Repère | Valeur actuelle |
|---|---|
| Contrat du composant carte BI | 0.5 (additif ; 0.4, 0.3 et 0.2 restent servis) |
| Client de l'hôte en un seul fichier | `lib/bi/client-hote.js`, `VERSION_CLIENT` 3, 15 745 octets |
| Empreinte du client | `sha384-g5sAYVxj16rSreyNXIZOR7wfzwPkr+oWX420nQ1UPVFv4RCBmRphpaDp8dH4o72j` |
| Moteur de formulaires vendorisé | celui de la 1.13.1 (une publication d'Atlas ne le fait pas bouger) |

Une nouvelle empreinte du client s'accompagne d'une nouvelle `VERSION_CLIENT`, annoncée sur le fil des hôtes **avant** publication.

## 1.38.0 — démarrage propre : la première image est déjà la bonne

- **Mémoire de démarrage** (`lib/demarrage-cache.js`) : embarqué (widget Grist), Atlas garde par instance hôte le dernier thème appliqué, le plan du fond et la dernière vue ; un script de tête de `index_v7.html` les relit AVANT le premier affichage (couleurs, mode sombre, police). Chaque valeur relue est vérifiée (variables permises seulement, pas de `url(`, couleurs `#rrggbb`, coordonnées valides). Au tout premier chargement, rien à relire : le thème d'origine, puis le thème appliqué, comme avant.
- **Carte créée déjà peinte** : le style de base est demandé dès le chargement du module, repeint avec le plan (mémorisé ou celui d'Atlas) avant la création de la carte, et au changement de fond (`transformStyle`) : plus d'image aux couleurs d'origine suivie d'un repeint. La carte s'ouvre sur la dernière vue connue, au lieu de sauter du lieu par défaut à sa vue.
- **Textes provisoires cachés** (`atlas-demarrage`) : « Nouveau projet », légende vide et pastille de modification n'apparaissent qu'avec les données (au premier `idle` de la carte, d'office après 4 s ; 10 s au plus).
- Sans effet sur le composant carte BI (`?bi=1`), ni hors d'une page hôte ; contrat 0.5 et client d'hôte inchangés.

## 1.37.0 — Atlas aux couleurs de son hôte : thème du document ou de l'instance Grist, thème sombre, fond Thème, marque neutre

- **Thème de l'instance Grist** : sans `Theme_document`, l'application reprend le thème de l'instance où elle s'ouvre (`grist.onThemeChange` ou variables `--grist-theme-*`, mesurées sur docs.getgrist.com et grist.numerique.gouv.fr) : accent (la première couleur de Grist qui se lit sur le fond), fond de page, texte, et la pile de polices exacte de l'instance. Un thème de document passe toujours avant. Module `lib/charte/theme-instance.js`.
- **Thème sombre** : une charte à fond sombre retourne l'interface (fond, surfaces, encre, filets, couleur secondaire lisible, crédits de la carte, `color-scheme: dark`). Avant, un thème sombre était écarté et dit.
- **Fond « Thème »** : le fond de carte est repeint en aplats avec la charte courante (document, instance, sinon celle d'Atlas), bâti en volume gardé ; nouveau choix en tête du panneau « Fond de carte », défaut des nouvelles scènes (une scène qui a enregistré un autre fond le garde). Module `lib/fond-theme.js`.
- **Marque neutre** : le glyphe seul (sans le mot « Atlas ») aux couleurs de la charte, titres d'onglet « Atlas » et « Atlas — carte » ; en widget Grist, pas de logo par défaut. `?marque=atlas` rend le nom, `?marque=aucune` retire le glyphe.
- **Collage au thème** : la couleur d'accent de la carte (trajet, halo de sélection, tracé de saisie, pastille d'étape) et les teintes du CSS suivent `--accent` ; la police de la légende suit `--sans`. Le rouge d'origine n'est plus qu'un repli.
- **Plus d'italique** dans l'interface.
- **Composant carte BI inchangé** : une page qui embarque Atlas garde le fond Liberty d'origine et le contrat 0.5 (client `lib/bi/client-hote.js` inchangé, 15 745 octets).

## 1.36.0 — contrat carte BI 0.5, lecture des géométries d'une couche

- **Contrat 0.5** (additif) : `getFeatures(couche, { bbox, limite })` rend les géométries d'une couche en GeoJSON, avec propriétés, `visuel`, `style`, `légende` et `visible`, pour une page qui les redessine ou les extrude (vue éclatée, aperçu en réalité augmentée). Plafonds comme `getBuildings` : 5000 entités, 20 000 sommets par entité, 200 000 sommets et 2 Mo au total, 5 appels par seconde ; une table (sans géométrie) et une couche administrative sont refusées. Détail : `docs/CONTRAT-CARTE-BI.md` §6 quinquies. Vérifié en navigateur sur trois couches (surface, ligne, points).
- **`ready.version` et `ping().version` annoncent maintenant `0.5`** : un hôte qui les compare à `'0.4'` en dur doit négocier par `ready.versions`. Nouveau client d'hôte : `VERSION_CLIENT` 3, empreinte ci-dessus.
- **Thème du document** : une graine de `Theme_document` s'écrit `#RRGGBB` (arbitrage de la spécification ThemeDef) ; un `principal` mal écrit est refusé, une autre graine mal écrite est écartée et dite. La lecture générale des chartes reste tolérante.

## 1.35.0 — contrat carte BI 0.4, dalles 3D compressées et protégées, sélection Grist

- **Contrat 0.4** (additif, annoncé aux hôtes avant publication) : `getCamera`, `watchCamera` et l'événement `mouvement` (flux de la caméra sur abonnement), `setViewMode('plat' | 'libre')` (vue plane verrouillée), `getBuildings` (bâtiments visibles en GeoJSON avec hauteur et base, fragments aux joints de tuiles marqués `coupe: true`, entités de plus de 20 000 sommets ignorées), événement `clic { lng, lat, x, y, zoom }`. Détail et mesures : `docs/CONTRAT-CARTE-BI.md` §6 quater, recette d'alignement d'une 3D : `docs/EXPLOITATION-EXTERNE-BI.md` §7 quater.
- **Règle de version** : une commande exige au moins la version qui l'a introduite ; un hôte resté en 0.3 (ou 0.2) garde ses commandes. **`ready.version` et `ping().version` annoncent maintenant `0.4`** : un hôte qui les compare à `'0.3'` en dur doit négocier par `ready.versions`. Nouveau client d'hôte : `VERSION_CLIENT` 2, empreinte ci-dessus (un hôte qui épingle l'empreinte ne change rien tant qu'il ne copie pas le nouveau fichier).
- **La carte nue refuse une couche `dalles3d`** (`capacite_absente` dans `_erreurs`) au lieu de répondre `0` ; elle demande le profil complet et une scène Atlas (`version: "0.2.2"`).
- **Dalles 3D** : le chargeur lit les textures KTX2 (`KHR_texture_basisu`) des GLB de pix2hdr (avant : `setKTX2Loader must be called before loading KTX2 textures`) ; vérifié sur les 4 dalles réelles des Milles. Une maquette protégée en HTTP Basic demande l'identifiant dans une boîte (gardé en mémoire de la page, présenté à la seule origine de la grille, jamais enregistré ni mis dans une adresse) ; vérifié en navigateur : refus puis nouvelle saisie, puis chargement avec l'en-tête. Seules les dalles de statut `livree` sont montées (voir le guide).
- **Sélection Grist** : en widget, une ligne choisie dans Grist (autre widget ou table) amène la carte sur l'objet de la couche liée à la table de la section (`_row_id`), avec le halo de sélection ; vérifié dans un document Grist réel.
- Client de l'hôte : `VERSION_CLIENT` 2, `lib/bi/client-hote.js`, 15 586 octets.

## 1.34.0 — catalogue d'objets atlas-objets 0.2

- **`rotation_draw: false`** sur un type : aucun tirage de rotation par graine ; la rotation est celle de la couche plus le `_rotationZ` de l'objet (cap mesuré d'un panneau, d'un abri). Sans le réglage : le tirage s'ajoute, comme avant.
- **Critère `taxon`** (et `taxon_from`) dans un `match` : nom scientifique normalisé (hybrides ×, cultivars entre guillemets, casse), comparé par mots entiers ; un objet sans taxon ne correspond pas. Pèse dans le départage : un type d'essence l'emporte sur un type de genre.
- **`requires_atlas`** (racine du bloc `parametric`, `MAJ.MIN.CORR`) : un catalogue qui demande une Atlas plus récente est refusé avec un message, jamais mal affiché ; illisible, il est utilisé avec un avertissement.
- Vecteurs de la fabrique (pix2hdr, atlas-objets 0.2, commit 90122966) repris tels quels dans les tests.
- **Orientation mesurée** (26/10/2026, Chrome, flèche glTF face +Z posée par `gltf_url`, carte au nord, à plat) : `_rotationZ` 180, 90, 0, 270 et 135 montrent le nord, l'est, le sud, l'ouest et le nord-est. La convention de la spec, `_rotationZ = (180 − cap) mod 360`, est confirmée ; le chargeur ne réoriente pas le modèle. Non mesuré : l'effet d'un `rotationX` ou `rotationY` de couche non nul.
- Contrat de la carte BI 0.3, client et empreinte inchangés, aucune commande ajoutée.

## 1.33.0 — une couche exclue du clic, des pointillés sur les lignes

- **`interactive: false`** sur une couche : elle n'est plus interrogée au clic ni au survol (pas de sélection, pas de curseur « main »), et elle ne compte pas dans le test « clic dans le vide » de l'édition : un clic au-dessus d'elle, en édition, ajoute un objet au lieu de sélectionner la couche. Sans le réglage, ou à `true` : comme avant.
- **`visuel.tirets`** sur une couche de lignes : `[4, 2]`, au moins deux longueurs positives (huit au plus, vingt au plus chacune), en multiples de la largeur. Même validation que pour le contour des polygones ; invalide, la ligne reste pleine.
- Le validateur de manifeste connaît `interactive` et dit un non-booléen.
- Contrat 0.3 (additif), client et empreinte inchangés, aucune commande ajoutée.

## 1.32.3 — plus de défilé au chargement du profil complet

- **Premier rendu** : en `?bi=1&profil=complet`, le voile neutre du composant nu couvre aussi l'application complète jusqu'à la scène de l'hôte (ou au plus 8 s). On ne voit plus l'application de base, la carte par défaut, puis la carte voulue. `?voile=0` rend l'ancien comportement.
- Contrat 0.3, client et empreinte inchangés, aucune commande ajoutée.

## 1.32.2 — boussole aux couleurs du thème, une seule légende

- **Boussole** : l'aiguille du nord prend la couleur principale du thème (comme la lettre N), au lieu d'un rouge fixe. Sans thème, la couleur d'origine d'Atlas ne change pas.
- **Boussole** : l'aiguille est raccourcie, la lettre N ne la chevauche plus.
- **Légende** : en profil complet, un manifeste BI monté éteint la légende de l'application (qui ne connaît pas ses couches) ; seule celle du composant (`interface.legende`) reste, comme sur la carte nue. Une scène Atlas garde la légende de l'application.
- Contrat 0.3, client et empreinte inchangés, aucune commande ajoutée.

## 1.32.1 — une page pour choisir, et un paquet web figé par version

- **Page « Choisir comment utiliser Atlas »** (vitrine, annexe) : les manières de s'en servir, la forme de scène à envoyer, suivre ou figer une version, l'identité visuelle commune, ce qu'Atlas ne promet pas, les licences.
- **Paquet web figé** : à chaque étiquette `atlas-web-v<version>`, le workflow `paquet-atlas.yml` dépose en publication une archive du paquet web (page maigre, application, dépendances sans CDN, environ 9 Mo) avec `PAQUET.json` (version, contrat, client et son empreinte, SHA-256 de chaque fichier) et `SHA256SUMS`. Fabriqué par `scripts/paquet-atlas.js` (testé).
- Contrat 0.3, client et empreinte inchangés, aucune commande ajoutée.

## 1.32.0 — une interface sans emoji, et une marque qu'on règle

- **Icônes** : l'interface de l'application (réglages, vues, fonds de carte, curseurs de modèle, filtres, messages) n'emploie plus d'emoji : des icônes à trait, du même vocabulaire que le reste, qui suivent la couleur et la police du thème. Les messages éphémères portent une icône vectorielle posée par le DOM (jamais un texte du message). Les pictogrammes des objets du catalogue 3D (lampadaire, banc, arbre…) restent des emoji : ils nomment des objets, ils auront leur propre jeu.
- **Marque réglable** : `?marque=icone` ne garde que le logo dans l'en-tête, `?marque=aucune` n'affiche que le nom du projet ; sans paramètre, rien ne change.
- Contrat 0.3, client et empreinte inchangés, aucune commande ajoutée.

## 1.31.0 — le thème du document, partout

- **`Theme_document`** : un document Grist porte UNE identité visuelle (ThemeDef 1.0, table `Theme_document`). Le **widget Atlas** la lit seul (par `listTables` : il ne crée jamais la table et n'y écrit rien) et l'interface de l'application prend l'accent, la police, les surfaces et l'encre du thème (mode clair ; un thème sombre ne retourne pas l'interface claire et le dit en console). Un **hôte du composant** lit la table et appelle `themeDuDocument(...)` (`lib/charte/theme-document.js`, module pur) puis `carte.setTheme(theme.charte)` : la carte nue, le profil complet et l'application ont la même identité. Règle de lecture de la spécification : table absente, vide ou sans ligne active = aucun thème ; plusieurs actives = rien et `plusieurs-actifs` dit ; contenu illisible = rien et le motif dit ; valeurs résolues non crues.
- Documenté dans `EXPLOITATION-EXTERNE-BI.md` §7 bis.
- Contrat 0.3, client et empreinte inchangés, aucune commande ajoutée.

## 1.30.0 — le relief, le bâti en volume, le ciel et le soleil pour la carte nue

- **`environnement` dans le manifeste** (brique chargée à la demande, jamais par la page seule) : `environnement: { relief, bati3d, ciel, soleil }`. `relief: true | { exageration?, source? }` : relief 3D depuis les altitudes mondiales « terrarium » (AWS, service tiers, sans clé), les couches de l'hôte le suivent ; le relief du LiDAR HD de l'IGN reste dans l'application complète. `bati3d: true` : le bâti du fond en volume, quand le fond n'en montre pas déjà. `ciel: true` : ciel et brume (vue inclinée). `soleil: { instant } | { maintenant: true }` : la lumière de la carte suit la direction réelle du soleil à cet instant (NOAA) et nuance les faces des volumes ; ce ne sont pas des ombres portées. Rejoué à chaque `setScene` ; une scène complète sans `environnement` défait celui d'avant ; une déclaration invalide est ignorée et dite (`_avertissements._environnement`).
- **`validerManifeste`** connaît `environnement`.
- Contrat 0.3, client et empreinte inchangés, aucune commande ajoutée.

## 1.29.1 — l'application complète se relit, et prend l'identité de l'hôte

- **Correctif** : la 1.29.0 a rendu `app.js` illisible (une apostrophe mal échappée dans un message de console) : l'application complète d'Atlas (widget Grist, application mobile, profil `complet` du composant) ne démarrait plus ; la carte nue n'était pas touchée. Un test lit désormais la syntaxe de `app_v7.js` et de chaque module de `lib/` (`tests/syntaxe-modules.test.js`).
- **Une seule identité** : en profil `complet`, la charte donnée par l'hôte (`setTheme`, charte du manifeste) habille aussi l'interface de l'application (surfaces, encre, filets, accent, police) : plus de différence visible entre la carte nue, le composant et l'application. L'interface de l'application n'a qu'une palette claire : une charte à fond sombre, une encre peu contrastée ou un accent trop pâle ne sont pas repris, et c'est dit (`notes`). Sans charte de l'hôte, rien ne change.
- Contrat 0.3, client et empreinte inchangés, aucune commande ajoutée.

## 1.29.0 — des volumes et des étiquettes pour la carte nue, un récit qui retrouve ses couches

- **Volume des polygones** (`visuel.extrusion: { champ, facteur?, max? }`) : chaque surface de la couche s'élève de la valeur de sa propriété `champ` (en mètres × `facteur`, bornée à `max`, 500 par défaut) ; une valeur absente donne une surface à plat. Le volume est opaque ; le contour reste posé au sol mais n'apparaît qu'à la sélection (il traverserait les faces) ; les contrôles filtrent aussi le volume. On le voit en inclinant la carte (`flyTo({ pitch })`). Une déclaration invalide laisse la couche à plat.
- **Étiquette des points** (`visuel.etiquette: { champ, taille?, zoomMin? }`) : le texte d'un point, posé sous sa marque, dans une couche à part (une police en erreur ne retire pas les marques).
- **Récit** (correctif) : l'entrée `layers[]` d'une étape retrouve la couche d'une scène externe par l'`id` de son manifeste (elle s'appelle `layer-scene-<id>` dans l'application) ; avant, la couche n'était pas citée et se retrouvait masquée, sans message. Une entrée sans couche l'écrit en console.
- **Démarrage lent** (correctif) : la garde d'amorçage de 20 s prévient l'hôte par un avertissement et non plus par une erreur fatale (fatale seulement quand une dépendance ne se charge pas).
- **Description des commandes** : `highlight`, `setVisual` et `getRows` disent ce qu'elles rendent vraiment.
- Contrat 0.3, client et empreinte inchangés, aucune commande ajoutée.

## 1.28.4 — valider un manifeste avant de l'envoyer, et l'état initial des contrôles

- **`validerManifeste`** (`lib/bi/valider-manifeste.js`, module pur sans dépendance, importable par un serveur) : dit, avant `setScene`, les écarts que `setScene` laisse passer en silence : `kind` inconnu, champ absent des propriétés des données, `breaks`/`colors` au lieu de `stops`, palier sans couleur, clé inconnue, contrôle sans identifiant, identifiants d'entités non entiers ou en double. Il ne corrige rien. Adresse : `<adresse publique>/lib/bi/valider-manifeste.js`.
- **État initial d'un contrôle** (documenté et testé) : `controls[{ id, type, field, active: true, values | min/max | texte }]` s'applique au montage et est rejoué à chaque `setScene`.
- Contrat 0.3, client et empreinte inchangés, aucune commande ajoutée.

## 1.28.3 — les repères ne disparaissent plus quand une police du fond manque

- **Marqueurs à états** (correctif du composant) : le texte d'un marqueur sans valeur était un tiret demi-cadratin « – », caractère hors de la plage 0-255 de la police ; quand le serveur de polices du plan IGN répondait 502 pour la plage qui le porte (8192-8447), MapLibre ne dessinait plus la couche, repères compris. Le tiret est maintenant un tiret ASCII « - ». Mesuré avec un serveur de polices qui échoue sur cette plage seule : 0 repère avec « – », 3 avec « - » ; `text-optional` n'y changeait rien.
- Contrat 0.3, client et empreinte inchangés, aucune commande ajoutée.

## 1.28.2 — la carte ne passe plus hors ligne à tort

- **Repli hors ligne** (correctif du composant) : une police de caractères du fond qui répond en erreur (502 ou 404 sur `fonts/…`, constaté sur le plan IGN) faisait compter des tuiles en échec, et quatre en huit secondes basculaient la carte sur le fond uni alors que le réseau était sain. Ces erreurs-là ne comptent plus ; de vraies tuiles en échec déclenchent toujours le repli.
- **Le repli dit ce qui l'a déclenché** : l'événement `connexion` d'un repli automatique par les tuiles porte un champ `diagnostic` (nombre d'échecs, message, statut, nom d'erreur et source du dernier échec compté).
- Contrat 0.3, client et empreinte inchangés, aucune commande ajoutée.

## 1.28.1 — un atelier de style, et une application en direct qui dit ses limites

- **Atelier de style** (`demos/hote-atelier/`) : on règle la charte d'une organisation (quatre couleurs, fond de plan, palettes, police), la carte, sa légende et ses bulles suivent en direct, le code à copier (balise `<atlas-bi>` et blocs JSON déclaratifs) et la mesure de lisibilité se mettent à jour. Les couleurs de marque sur le fond de l'organisation sont mesurées aussi (3:1 pour un bouton, 4,5:1 pour du texte). Chartes d'exemple fictives ; import et export du JSON.
- **Légende** (correctif du composant) : la carte de la légende ne défile plus elle-même, seul son corps défile ; sur une petite carte, Chrome laissait un rectangle vide au-dessus de la légende.
- **« Rennes en direct »** : un portail qui répond 429 (quota du jour atteint, constaté sur les bus STAR) n'est plus dit « connexion perdue » : message précis, nouvel essai espacé ; cadences d'un bon voisin (bus 30 s, sonde 60 s).
- Contrat 0.3, client et empreinte inchangés, aucune commande ajoutée.

## 1.28.0 — des couches de lignes à votre goût, une application alimentée en continu

- **Lignes** : `visuel: { largeur: 4, opacite: 0.8 }` sur une couche de lignes (jusqu'ici 3 px fixes). La largeur peut suivre un nombre : `largeur: { champ: 'importance', min: 0, max: 1, lMin: 1.2, lMax: 4.4 }`. Bouts arrondis. Largeur de 0,5 à 12 px, opacité de 0 à 1 ; sans réglage, le rendu d'avant. Contrat 0.3, client et empreinte inchangés, aucune commande ajoutée.
- **Démonstration de la vitrine** : l'application « Rennes en direct » (circulation et bus lus en continu sur les données ouvertes, filtres, recherche d'une voie, bulles, sélection qui survit au rafraîchissement, trois apparences : jour, nuit, contraste, que la carte reprend). Elle s'ouvre en grand cadre depuis la vitrine et tient sur téléphone. Les pages d'hôte BI et canevas restent publiées pour les intégrateurs, hors vitrine.
- **Fusion de scène** : `setScene({ fusion: true })` ne ferme plus la bulle d'un objet d'une AUTRE couche (elle se fermait à chaque mise à jour d'une couche voisine). Les filtres (`setFilter`) d'une couche remplacée sont à renvoyer : la nouvelle couche repart sans filtre.
- **Interne** : `scripts/hygiene-atlas.js` (`npm run hygiene:atlas`) contrôle ce qui est indexé et ce qui est publié ; les dossiers d'essai restent hors dépôt.

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
