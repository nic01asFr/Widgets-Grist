# Composant carte BI : contrat 0.3

Atlas peut être embarqué dans une application externe (« l'hôte ») comme **composant de carte** : l'hôte envoie des commandes, la carte renvoie des événements. Ce document fixe le **contrat** (version `0.3`). Le guide du développeur de l'hôte est `EXPLOITATION-EXTERNE-BI.md`.

Code : `lib/bi/` (runtime, pont, client hôte, élément web), crochet dans `app_v7.js` (`?bi=1`), tests `tests/bi-*.test.js` et `tests/acces-carte.test.js`.
Sources, licences et poids des données administratives : section 11.

## Statuts

- **[testé]** vérifié par un test automatique (`node --test tests/bi-*.test.js`, 109 tests, aucun accès réseau ; la carte MapLibre y est simulée) ;
- **[navigateur]** vérifié en plus dans Chromium, avec la vraie carte, le 09/10/2026 (hôte et composant sur deux origines, vrais clics et vraies touches) ;
- **[prototype]** écrit et exécuté sans erreur, mais sans test automatique ni contrôle visuel ;
- **[à créer]** n'existe pas.

## 1. Principe

Un contrat, deux transports : appels directs (`attacher(map)` puis `rt.api.*`) ou `postMessage` entre la page hôte et l'iframe d'Atlas (`?bi=1`). **L'hôte détient l'état** (filtres, sélection, temps, niveau affiché) ; le composant applique, dessine et renvoie des événements. Il n'écrit jamais dans les données de l'hôte.

Chaque événement porte `origine` : `'utilisateur'` (geste dans la carte : souris, clavier, forage au zoom) ou `'api'` (effet d'une commande, y compris dans un `batch`). L'hôte ignore les `'api'` qu'il a provoqués, ce qui supprime les boucles. Une seule exception : un forage décidé par le composant (zoom, touche `d`) arrive en `'utilisateur'`, l'hôte suit alors le niveau affiché par l'événement `drill`. [testé]

## 2. Transport et sécurité

Enveloppes (`postMessage`) :

- hôte -> composant : `{ source:'hote-bi', version, id, cmd, args }` ;
- composant -> hôte : `{ source:'atlas-bi', version, type:'resultat', id, ok, valeur | erreur }` et `{ source:'atlas-bi', version, type, charge, origine }`.

Règles [testé, navigateur] :

1. **Liste blanche d'origines.** Le composant n'accepte de commandes que d'une origine exacte déclarée : `?hote=<origine>` dans l'URL (répétable), ou configuration de la page (`window.ATLAS_BI = { hotes: [...] }` ou `<meta name="atlas-bi-hotes" content="https://a.example https://b.example">`). La configuration, si elle déclare un hôte, **fait seule autorité** (`?hote=` est alors ignoré : l'hébergeur ferme la liste).
2. **Aucun joker.** `*`, `null`, une origine vide, un chemin, des identifiants dans l'adresse sont refusés. Une origine s'écrit `http(s)://hôte[:port]`.
3. **Défaut fermé.** Tant qu'aucune origine n'est déclarée, le composant ne répond à personne et n'émet rien (un avertissement est écrit dans sa console). L'origine du parent n'est pas présumée de confiance.
4. **Rien n'est émis en `targetOrigin '*'`** : `ready`, résultats et événements partent vers les seules origines déclarées (avant le premier message reçu), puis vers l'origine qui vient de parler.
5. **Seule la fenêtre parente est écoutée** (`event.source`), et un message d'une origine non déclarée reste **sans réponse**, même d'erreur.
6. Le client hôte (`lib/bi/client.js`) écarte de son côté les messages dont la source n'est pas l'iframe ou l'origine n'est pas celle du composant, et n'envoie qu'à cette origine.

Versions : `VERSIONS_ACCEPTEES = ['0.2', '0.3']`. Un hôte en `0.2` reste servi pour les 19 commandes de la 0.2 ; une commande de la 0.3 envoyée en `0.2` est refusée (`version : …`). Une autre version est refusée. L'annonce `ready` (`charge: { runtime:true, version, versions }`) permet de négocier ; sans elle, le client relance un `ping`. [testé, navigateur]

Erreurs de pont : le texte d'erreur d'un résultat est `<code> : <message>` avec `code` parmi `forme`, `source`, `origine` (jamais renvoyé), `version`, `commande`, `argument` ; toute autre erreur est celle de l'API.

## 3. Entrée d'Atlas en mode composant

`?bi=1` (ou `true`), à combiner avec `navbar=false&mode=view` (ajoutés d'office par l'élément web). Atlas : s'ouvre en lecture sans écran d'accueil, ne demande pas de restauration locale, **n'appelle pas `grist.ready()`**, ne montre que la carte et son attribution, à plat (inclinaison 0, projection mercator, sans ciel ni bâtiments 3D). Sans le paramètre, le comportement d'Atlas est inchangé (garde testée par lecture de la source d'`app_v7.js`, et vérifiée dans le navigateur par comparaison de la console et des ressources chargées). Le runtime n'est téléchargé qu'avec `?bi=1` (import dynamique de `lib/bi/montage.js`). [testé, navigateur]

Point d'accès à la carte pour tout module externe : `window.__atlasCarte` et l'événement `atlas:carte-prete` (`window`, `detail.carte`, drapeau `window.__atlasCartePrete`), `attendreCarte()` dans `lib/acces-carte.js`. L'ancien handle `window.__atlasMap` existe encore mais n'est plus le contrat. [testé, navigateur]

## 4. Manifeste

Extension tolérante du Scene Manifest : `layers[]` avec `id`, `name`, `geometry_type` (`point`, `line`, `polygon`), `cle` (propriété servant de clé métier, renvoyée dans `select.key`), `style.declarative` (`single`, `categorized`, `graduated`), `controls[]` (`select`, `range`, `time`, `text`), `visuel`, `temps`. `manifest.temps = { champ, mode:'instant'|'cumul'|'glissante', pas, largeur, valeur }`. Les couleurs peuvent être des jetons : `'jeton:<nom>'`, résolus par `setTheme`. [testé]

`visuel.type` : `cercles` (défaut), `proportionnel` (`champ`, `min`, `max`, `rMin`, `rMax`), `heat` (`poids`, `rayon`, `points`), `grille` et `hex` (`taille` en mètres, `champ`, `metrique`, `extrusion`), `etats` (marqueurs à formes : cercle, carré, losange, triangle ; `etats`, `champEtat`, `texte`), `choroplethe`. [testé pour cercles, proportionnel, grille et hex ; prototype pour heat, etats et extrusion]

Couche administrative :

```
{ id:'dep', name:'Départements', geometry_type:'polygon',
  admin: { niveau:'region'|'departement'|'commune'|'pays'|'epci'|'arrondissement', source?:'ign'|'embarque', filtre?:{region|departement|commune: code}, produit?:'pe'|'carto'|'cog', cadrer?:false },
  visuel: { type:'choroplethe', niveau, source:'agregat'|'hote', champ?, metrique?, rapport?, classes?, methode?, bornes?, palette?, centre?, valeurSansDonnee?, ... } }
```

Si `donnees[id]` est fourni dans `setScene`, ces entités (Feature GeoJSON avec `properties.code`, `nom`) remplacent le chargement : l'hôte garde la main sur la source des contours. Une couche qui ne se charge pas n'empêche pas le reste de la scène : l'erreur est dans `ready.erreurs` (et `_erreurs` du résultat de `setScene`), y compris une couche de polygones de l'hôte qui déclare `visuel.type: 'choroplethe'` sans `admin` (« un choroplèthe se peint sur des unités administratives »). [testé]

`visuel` du choroplèthe :

| Champ | Valeurs | Défaut |
|---|---|---|
| `source` | `agregat` (points d'une couche, `couche: id`) · `hote` (`table`) | `hote` |
| `champ`, `metrique` | `metrique` : `n`, `somme`, `moyenne`, `mediane`, `min`, `max`, `n:<categorie>`, `part:<categorie>` ; `champ` numérique pour les mesures autres que `n` ; `categorie` : champ des catégories | `n` |
| `zeroSiVide` | `true` : une unité sans point vaut 0 pour `n`/`somme` (couverture complète déclarée par l'hôte) | `false` : sans donnée |
| `rapport` | `{ base:'population'\|'surface', facteur }` : pour 1 000 habitants = `{population, 1000}` ; refusé pour moyenne, médiane, min, max | aucun |
| `table`, `niveauTable`, `cleTable`, `champTable`, `champDen`, `couvertureMin`, `doublons` | tableau hôte (section 7) ; `couvertureMin` : part minimale d'unités fines renseignées pour afficher un total remonté | `niveauTable` = niveau de la couche ; `0.999` ; `premier` |
| `methode`, `classes`, `bornes`, `palette`, `centre` | `quantiles` · `egaux` · `manuelle` ; 2 à 9 classes ; palette `sequentielle` · `divergente` (centre = valeur neutre) | `quantiles`, 5, séquentielle |
| `valeurSansDonnee`, `couleurSansDonnee` | `hachure` · `gris` · `masque` | `hachure` |
| `seuilPetit` | effectif sous lequel l'unité est signalée | 0 (non signalé) |
| `unite`, `titre` | libellés de légende | calculés |

## 5. Commandes (hôte -> composant)

Valeur de `setFilter(controlId, valeur)` selon le type du contrôle : `select` = liste de valeurs retenues (liste vide : rien ne passe) ; `range` et `time` = `{ min, max }` (l'un des deux peut manquer) ; `text` = `{ texte }` ou une chaîne (recherche sans casse ni accents, sur le champ du contrôle) ; `null` = retire le filtre. Retour : `{ layer, compte, total }`.

Contrat 0.2 [testé, navigateur] : `ping`, `setScene(manifeste, donnees)`, `setLayerVisibility`, `setFilter(controlId, valeur|null)`, `setTime`, `play`, `pause`, `select(id|null)`, `highlight(ids)`, `flyTo`, `fitTo(couche|ids)`, `setTheme`, `setVisual`, `updateFeature`, `setEdition`, `setFond(mode, jetons)`, `getLegend`, `getRows`, `resize`. Le clavier réel, le filtre, le temps, `setFond` (`atlas`, `plan`, `uni`) et `setVisual` ont été exécutés dans le navigateur ; `setFond('photo')`, `setFond('plan-ign')` (polices du serveur de glyphes IGN) et `setFond('voile')` ont été exécutés et contrôlés à l'écran dans le navigateur le 10/10/2026.

Contrat 0.3 [testé] : `addAdminLayer(niveau, options)` -> `{ layer, niveau, n, source, repli, cause, cache, ms, octets, nRequetes, attribution, millesime }` (échec : exception explicite + événement `error`, aucune couche créée ; régions, départements et pays passent au jeu embarqué si le service manque, `repli:true` ; les communes n'ont pas de repli) ; `removeLayer(id)` ; `setStatistique(couche, spec)` ; `setChoropleth(couche, style)` ; `drillDown(couche, code)`, `drillUp()`, `setDrillAuto({actif, seuils})` ; `setUnitFilter(couchePoints, coucheUnites, code|null)` ; `batch(ordres, {arret:'erreur'|'continuer'})` -> `{ ok, ko, nonExecutes, resultats }` (100 ordres au plus, pas d'imbrication, un seul aller-retour) ; `setHorsLigne(true|false|'auto')` ; `getRows(couche, {tri, ordre, limite})` pour un choroplèthe (**les unités sans donnée sont toujours en fin de liste**) ; `getTheme()` -> la charte résolue, ce que l'hôte a donné, ce qui a été dérivé ou écarté, les avertissements chiffrés (**[testé]**, voir le contrat de charte). Le choroplèthe administratif avec jointure, le forage département -> commune (service IGN réel), `batch`, `select` et `getRows` ont aussi été exécutés dans le navigateur.

## 6. Événements (composant -> hôte)

`ready` (+ `erreurs`), `error {code, message, niveau}`, `select {layer, featureId, key, code, nom, niveau, valeur, classe, petit, population, sansDonnee, clavier?}`, `hover` (mêmes champs ; `featureId: null` à la sortie), `filter`, `camera` (en fin de mouvement), `time`, `legend`, `edit`, `layer`, `progress {pages, chargees, total}`, `statistique`, `drill {sens, niveau, parent, layer, fil}`, `connexion {etat:'hors_ligne'|'en_ligne', cause, automatique, fond}`, `theme {version, entree, applique, derive, ignore, avertissements, a11y}` (retour de `setTheme`, ou nouvelle résolution quand la personne change sa préférence de contraste). [testé ; `select`, `hover`, `filter`, `drill` et `connexion` aussi dans le navigateur]

## 6 bis. Capacités d'un chargement [testé] (extension additive de la 0.3)

Un chargement du composant peut ne contenir que certaines briques d'usage (profil allégé d'un hôte, paquet hors ligne). Le contrat reste **0.3** : un hôte qui ignore cette section n'est pas affecté.

**Annonce.** L'événement `ready` d'amorçage (celui dont la charge porte `runtime: true`) et le résultat de `ping` gagnent deux champs :
- `capacites` : tableau **trié** de noms parmi `edition`, `points`, `socle`, `temps`, `territoires`. Sans option, toutes les briques sont présentes. Un hôte ignore un nom qu'il ne connaît pas. Les briques `reseau`, `3d`, `terrain` et `donnees-ouvertes` n'ont aucune commande dans ce contrat : elles ne sont pas annoncées (le nom reste réservé).
- `paquet` : `null` si le composant n'a lu aucun manifeste de données hors ligne, sinon `{ version_paquet, edition_admin_express, recensement }` : à afficher à côté d'une population (le millésime est celui du manifeste). Aujourd'hui aucun chargement ne lit de manifeste : la valeur est `null`.

**Sémantique.** `capacites` décrit **ce chargement** du composant. Une iframe rechargée peut en annoncer d'autres : l'hôte relit `ready` à chaque annonce, comme il renvoie sa scène à chaque `ready`. Un hôte arrivé après l'annonce les retrouve par `ping`.

**Refus.** Une commande qui relève d'une brique absente n'est pas exécutée. Le résultat est `{ ok: false, erreur, code: 'capacite_absente', capacite: '<nom>' }` ; `erreur` reste un texte lisible (`capacite_absente : <commande> demande la capacité « <nom> », absente de ce chargement du composant`). Ce n'est ni une erreur de forme ni de version. Dans un `batch`, l'ordre refusé porte les mêmes champs `code` et `capacite` ; `arret` s'applique comme pour toute erreur. Dans `setScene`, une couche dont la brique manque (`points` pour une couche de données, `territoires` pour une couche administrative) est refusée seule, avec la même formule dans `erreurs[<id de couche>]` ; les autres se montent.

| Brique | Commandes |
|---|---|
| `socle` | ping, setScene, setLayerVisibility, setFilter, select, highlight, flyTo, fitTo, setTheme, setFond, getTheme, getLegend, getRows, resize, setHorsLigne, batch |
| `points` | setVisual (et les couches de données de `setScene`) |
| `temps` | setTime, play, pause |
| `edition` | setEdition, updateFeature |
| `territoires` | addAdminLayer, removeLayer, setChoropleth, setStatistique, drillDown, drillUp, setDrillAuto, setUnitFilter (et les couches administratives de `setScene`) |

**Côté hôte (`lib/bi/client.js`).** La commande refusée rejette `ErreurBi` avec `code === 'capacite_absente'` et `capacite` renseigné : aucun texte à analyser. `client.composant.capacites` et `client.composant.paquet` portent l'annonce. `VERSION_CLIENT` (entier croissant) identifie la révision d'un client copié ; les vecteurs de conformité portent `version_vecteurs` (entier, 1 aujourd'hui).

**Choisir les briques.** `attacher(carte, { capacites: ['socle', 'points'] })` : un nom inconnu lève une erreur à la construction ; l'hôte ne peut pas élargir la liste par une commande (les options d'un `batch` sont sans effet sur elle).

## 7. Jointure d'un tableau hôte, codes et hiérarchie [testé]

- Formes acceptées : `{ code: valeur }`, `Map`, ou lignes `{ [cleTable]: code, [champTable]: valeur }`.
- Codes normalisés : zéros de tête rétablis (`1` -> `01`, `1001` -> `01001`), Corse `2a` -> `2A`, apostrophe de tableur et `.0` retirés, EPCI sur 9 chiffres, pays en ISO alpha-3. Code illisible : listé dans `invalides`, jamais deviné.
- Valeurs : nombre, ou texte numérique (`1 234,5`, `12 %`). `NA`, `ND`, `s`, `c`, `-`, vide = **sans donnée**. **0 reste un zéro**.
- Niveau fin vers niveau affiché : un tableau par commune peut colorer des départements, régions ou le pays : somme des communes (ou rapport des sommes avec `champDen` : **les taux ne se moyennent jamais**). Une unité dont une partie des communes manque est **sans donnée**, pas un total partiel.
- Hiérarchie commune -> département -> région -> pays par les codes ; COG 2026 (18 régions, 101 départements, Corse 2A/2B, outre-mer 971 à 976) ; arrondissements municipaux 75101-75120, 69381-69389, 13201-13216 (avec `arrondissements:'detailles'`, la commune est **remplacée** par ses arrondissements, jamais les deux).
- **Paris, Lyon, Marseille avec des polygones fournis par l'hôte (`donnees[id]`)** [vérifié sur le vrai runtime] : les codes d'une commune (75056) et de ses arrondissements (75101…) ne se télescopent pas, et un tableau `{ '75056': …, '75103': … }` se joint sur le code exact des deux. Mais (1) le runtime impose le niveau de la COUCHE à toutes les entités (`properties.niveau` vaut `commune` dans une couche `commune`, même pour un arrondissement) ; `properties.commune` fournie par l'hôte est conservée ; (2) la règle « jamais les deux » ne vaut que pour `arrondissements:'detailles'` appliqué au chargement par le service : avec `donnees`, les polygones de la commune et de ses arrondissements se recouvrent et la classification porte sur les deux. Pour distinguer les arrondissements sans double dessin : une couche `commune` SANS Paris, Lyon ni Marseille et une couche `arrondissement` (`niveauTable:'arrondissement'`) avec leurs arrondissements, ou, dans une même couche, n'envoyer pour ces trois villes que les arrondissements.
- `setStatistique` renvoie `diag.jointure` (joints, sansDonnee, orphelins, doublons, invalides, nonNumeriques), `diag.remontee` ou `diag.pip` (points, affectes, horsZone, ambigus).
- Limites : les anciens codes corses à deux chiffres ne permettent pas de conclure ; un code postal pris pour un code INSEE n'est pas détectable.

## 8. Lisibilité d'un choroplèthe [testé, rendu vérifié par captures]

- Sans donnée distinct de la classe la plus basse (hachures, gris ou masqué) et compté à part ; classes calculées sur les valeurs présentes ; une unité sans point n'est jamais 0 sauf `zeroSiVide`.
- Petits effectifs : valeur calculée, contour en tirets, signalée dans le classement et au lecteur d'écran.
- `getLegend` : titre, unité, intervalles hauts inclusifs, **effectif par classe**, sans donnée, avertissement si les valeurs distinctes sont trop peu nombreuses, `classesTropClaires` (contraste au fond < 1,3), tableau équivalent (`lignes`), résumé texte, `source.attribution`.
- Contour clair automatique sur les classes sombres, **contour sombre sur les classes pâles** (couleur vue sur le fond sous 3:1 ; voir `CONTRAT-CHARTE-ATLAS.md`), halo clair sous la sélection.
- **`theme.divergente`** : 3 couleurs (bas, neutre, haut), interpolées en sRGB : les classes extrêmes sont alors plus claires que la couleur d'ancre (mesuré, 7 classes : écart ΔE2000 de 7 à 11) ; ou **exactement n couleurs, une par classe** (n = nombre de classes), employées telles quelles ; une liste de **3 couleurs ou plus en nombre impair** (le neutre au milieu) dont la longueur diffère du nombre de classes est **parcourue de bout en bout** selon la position de la classe par rapport au centre (c'est la divergente à 7 couleurs de la charte « atlas » : 3, 5 et 9 classes restent bleu-orange) ; une liste paire ou invalide retombe sur les 3 ancres rouge-bleu du module.
- **Thème et charte graphique : voir `CONTRAT-CHARTE-ATLAS.md`.** Le thème est la **charte résolue** (défauts d'Atlas < charte nommée < charte de l'hôte < surcharge de couche, puis la préférence de contraste élevé de la personne). `setTheme(charte | thème 0.3, { remplacer? })` accepte une charte `atlas-charte/0.1` ou un thème 0.3 `{ jetons, categories, sequentielle, divergente, selection, contour, lavis, plan, texte, police }`, qui reste valable (converti), et renvoie `{ version, entree, applique, derive, ignore, avertissements, a11y }` ; `getTheme()` ; événement `theme`. Une valeur invalide est **ignorée et signalée**, jamais appliquée. Les appels successifs s'additionnent.
- **Valeurs par défaut** (quand l'hôte ne dit rien) : la charte « atlas » — qualitative Okabe-Ito, séquentielle à une teinte tirée de l'accent d'Atlas, Viridis pour le continu, divergente bleu-orange, états à plus de 4,5:1 — mesurée et sans avertissement d'attention (`getTheme().a11y`). **L'hôte garde la main** : une charte qui ne fixe que ses graines (`principal`, `secondaire`, `encre`, `fond`) reçoit des rampes, un plan et des traits calculés depuis elles, puis vérifiés. Les clés lues restent `theme.sequentielle`, `theme.divergente`, `theme.categories`, `theme.sansDonnee`, `theme.fondCarte`, `theme.halo`, `theme.contour`, `theme.selection` et les jetons (`jeton:<nom>` : les graines `principal`, `secondaire`, `encre`, `fond`, `succes`, `alerte`, `erreur`, `information` et les jetons propres de la charte ; un jeton inconnu ou mal formé donne un gris).
- Un choroplèthe en valeur brute favorise les grandes unités ; `rapport` et `seuilPetit` existent, le choix de l'indicateur reste à l'hôte.

## 9. Clavier et accessibilité [testé ; touches réelles : navigateur]

Le canevas reçoit le focus (Tab) ; flèches, `+`, `-` restent à MapLibre. `n`/`p` (suivant/précédent, dans l'ordre du classement), Début/Fin, PageSuiv/PagePréc (dix pas), Entrée ou Espace (sélectionne, `select` avec `clavier:true`), Échap, `f` (cadre), `d`/`u` (forage), `?` (aide). Chaque déplacement est annoncé dans une zone `role="status"` et émet `hover` (origine utilisateur) : le code d'hôte est le même pour la souris et le clavier. Équivalent tabulaire : `getRows`, `getLegend().lignes`.

## 10. Hors ligne [testé simulé]

`setHorsLigne(true)` : fond **uni** (seul fond sans réseau), jeux embarqués pour pays, régions et départements, erreur explicite pour les communes. `'auto'` (défaut) : bascule sur l'événement `offline` du navigateur ou après 4 échecs de tuiles en 8 s, retour automatique au fond précédent si la bascule était automatique. Jamais de bascule silencieuse : événement `connexion`. La commande a été exécutée dans le navigateur, et **un réseau réellement coupé a été essayé le 10/10/2026** (émulation hors ligne) : bascule `hors_ligne` en moins de 3 s, fond uni, couches de l'hôte conservées, reprise `en_ligne` ; les jeux embarqués étant des fichiers servis par Atlas, ils ne se chargent hors ligne que si la page d'Atlas est elle-même en cache.

## 11. Données administratives : sources, licences, volumes

| Besoin | Source | Licence, attribution |
|---|---|---|
| Régions, départements, EPCI, communes, arrondissements municipaux | IGN Géoplateforme, WFS, produit « ADMIN EXPRESS COG CARTO PE » (petite échelle), édition 2026 ; sans clé, CORS ouvert ; 5 000 entités par page, tri `SORTBY=cleabs` imposé | Licence Ouverte (Etalab), attribution IGN ; population : INSEE (populations légales 2023) |
| Population des régions, départements, EPCI | somme des communes, jeu embarqué `lib/bi/donnees/references-population.json` | idem, IGN et INSEE |
| Pays | Natural Earth 110 m (`ISO_A3_EH` pour le code), jeu embarqué | domaine public |
| Repli sans réseau | jeux embarqués généralisés (régions 35 Ko, départements 138 Ko, pays 122 Ko ; 388 Ko avec les références) | idem |

Volumes mesurés (réponses compressées) : régions 0,3 Mo, départements 0,7 Mo, communes d'un département 0,05 à 0,3 Mo, **communes de France entière 10 Mo (34 877, 7 pages), 150 Mo de tas JavaScript** : le forage région -> département -> commune est le chemin conseillé. L'attribution est portée par la source de chaque couche (affichée dans le contrôle d'attribution de la carte) et renvoyée par `addAdminLayer` et `getLegend().source.attribution`. Les contours sont généralisés pour l'affichage, **pas pour la mesure**. Tuiles vectorielles IGN (`ADMIN_EXPRESS`) : utilisables à partir d'environ z9, plus lourdes que le WFS à l'échelle nationale, **non branchées**.

Licences revérifiées en ligne le 10/10/2026 : Natural Earth, page `naturalearthdata.com/about/terms-of-use` : « All versions of Natural Earth raster + vector map data found on this website are in the public domain » et « No permission is needed to use Natural Earth. Crediting the authors is unnecessary » ; ADMIN EXPRESS (IGN), fiche `data.gouv.fr/datasets/admin-express` : « Licence Ouverte / Open Licence version 2.0 » (la page ne précise aucune mention particulière ; la Licence Ouverte 2.0 exige la mention de la source, ici « IGN » et « INSEE » pour la population). **Date du recensement** : le service renvoie `date_du_recensement` = 2022-01-01 pour 34 858 communes, 2021-01-01 pour 2 et 2017-01-01 pour 17 (10/10/2026) ; le jeu `references-population.json` embarqué annonçait 2023-01-01 et donne 0,5 % de population en plus au niveau national (écart médian par département 0,4 % ; 1,9 % pour la Guyane, 4,3 % pour `NR`, Saint-Pierre-et-Miquelon). Le générateur consigne désormais la date lue dans `meta.recensements` : régénérer et comparer avant toute diffusion de taux « pour 1 000 habitants ».

## 12. Volumes et performances (navigateur de test, données synthétiques)

Mesures du prototype, relevées avant l'intégration sur un poste de développement (données synthétiques) ; elles n'ont pas été refaites sur le code intégré, sauf la première ligne.

| Quoi | Résultat |
|---|---|
| 120 points : setScene, filtre, légende (mesuré sur le code intégré) | quelques dizaines de ms |
| Agrégation de 50 000 points par unité (index grille) | 26 à 42 ms (régions, départements), 47 ms pour 35 000 communes |
| Bascule de fond | 10 à 140 ms |
| Lot de 5 ordres contre 5 allers-retours | 48 ms contre 180 ms |
| 10 000 / 50 000 points, rendu | 77-123 / 52-75 images/s |
| 100 000 / 400 000 points, filtre | 0,36-0,45 s / 1,4-1,8 s |

Mesures du 10/10/2026 **sur le code intégré, par `postMessage` entre deux origines** (Chromium 154, poste portable avec GPU dédié, entités ponctuelles de 6 propriétés, un seul contrôle de liste) :

| Entités | Message JSON | `setScene` (envoi, clonage, montage) | premier `idle` | `setFilter` (liste) | tas JavaScript en plus |
|---|---|---|---|---|---|
| 1 000 | 0,2 Mo | 54 ms | 0,28 s | 26 ms | 13 Mo |
| 10 000 | 2,0 Mo | 337 ms | 0,27 s | 130 ms | 42 Mo |
| 50 000 | 9,9 Mo | 1,4 s | 0,28 s | 482 ms | 89 Mo |
| 100 000 | 19,8 Mo | 2,9 s | 0,62 s | 895 ms | 171 Mo |

Le clonage structuré d'un message pèse peu devant le montage (mesuré sous Node : 175 ms pour 50 000 entités, 1,1 s pour 400 000, soit 82 Mo de JSON) ; la limite pratique est le temps de `setScene` et la latence des filtres, pas la taille du message. Les images par seconde (rendus MapLibre pendant un panoramique piloté) restent au-dessus de 190 par seconde jusqu'à 100 000 points sur ce poste, **sans plafond de synchronisation verticale** : le chiffre ne dit pas ce que donnera un poste sans carte graphique dédiée. `getRows(couche, { limite })` ne limite pas les lignes d'une couche de points (toutes sont renvoyées : 100 000 lignes en 144 ms).

Au-delà de 100 000 entités par couche, la latence des filtres et le tas limitent : agréger avant d'envoyer, ou tuiles statiques (PMTiles) **[à créer]**. Le plafond de 2 500 objets déclarés du chargeur de scène d'Atlas ne s'applique pas aux couches du composant, qui ne passent pas par lui (non mesuré au-delà des volumes ci-dessus).

## 13. Reste à décider ou à créer

1. **Palettes** (séquentielle, divergente, catégorielle) : défauts neutres et accessibles dans la charte « atlas » ; la charte d'une organisation est à fournir par l'hôte (`setTheme`). Interface de choix et d'édition des palettes, chargement d'une charte par adresse, polices distantes : **[à créer]**, voir `CONTRAT-CHARTE-ATLAS.md`.
2. **Détenteur de l'état et périmètre d'édition** : l'hôte détient l'état ; l'édition se limite au déplacement d'un point (événement `edit`, l'hôte persiste) **[testé simulé]** ; édition de polygones, de lignes, création d'entités **[à créer]**.
3. **Tuiles vectorielles / PMTiles** au-delà de 100 000 entités **[à créer]**.
4. Hors ligne avec réseau réellement coupé **[non essayé]**.
5. Les communes de France entière sont possibles mais lourdes (voir 11).
6. EPCI : chargeables, hors forage (un EPCI n'a pas de parent unique).
7. L'écart de 92 communes entre l'IGN (34 877) et un autre référentiel public (34 969) n'est pas élucidé.
