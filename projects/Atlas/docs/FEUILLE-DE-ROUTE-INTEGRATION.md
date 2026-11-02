# Feuille de route : Atlas pour ses clients et ses hôtes

*02/11/2026. Atlas 1.42.2, contrat carte BI 0.7, client hôte `VERSION_CLIENT` 5. Brouillon de travail, à valider : rien de ce document n'est codé ni publié.*

Objet : rendre Atlas **juste, complet et utile** pour les applications qui l'embarquent ou le copient chez elles (un hôte de référence, une application PWA sur Grist, en a servi de cas d'étude), puis pour ceux qui l'utilisent comme application.

Chaque point porte sa preuve : **mesuré** (essai du 02/11/2026, sur le paquet 1.42.2 servi en local, dans Chrome, hôte de même origine), **lu** (code ou document du dépôt), **non vérifié** (dit comme tel).

## 0. Avancement (02/11/2026)

Branche locale `atlas/integration-chez-soi`, un commit par tâche, **rien publié, rien poussé, aucune étiquette posée** (`published/` n'est pas modifié : les changements de `projects/Atlas/` passent dans `published/` à la publication). Vérifié : 3 121 tests Atlas, 109 tests de scripts, lint, planchers de couverture ; promotion rejouée dans un dossier jetable, puis contrôle complet dans Chrome sur les paquets produits (20 contrôles, 0 échec).

| Tâche | État | Commit |
|---|---|---|
| 0.1 Licence dans le paquet | **fait** | `880373af` |
| 0.2 Guide corrigé et complété (niveau de `error`, délais, politique de sécurité, hôtes des fonds, `base=aucune`, même origine, précache, mise à jour) | **fait** | `35992b3b` |
| 0.3 Deux « paquets » distingués | **fait** | `35992b3b` |
| 1.1 Paquet « carte seule » | **fait** (72 à 78 fichiers, 2,0 Mo) | `2be1247f` |
| 1.2 `PRECACHE.json` et `CSP.txt` générés | **fait** | `2be1247f` |
| 1.3 `bi.html` sans script en ligne ; le garde lit la configuration de la page | **fait** | `06af7b7d` |
| 1.4 Feuilles de style par `adoptedStyleSheets` | **fait** | `54324090` |
| 1.5 Outil de contrôle d'une copie (`controle-copie.mjs`, livré dans le paquet) | **fait** | `eab0563a` |
| 1.6 Table de compatibilité, règle « un paquet par version de contrat » (gardée par un test), dépendances dans `PAQUET.json` | **fait** | `509df54e`, `35992b3b` |
| 1.7 Empreintes des feuilles d'interface dans `CSP.txt` | **fait** et mesuré avec le vrai `CSP.txt` (repli simulé : interface stylée, zéro violation) | `581169fb` |
| 3.1 Polices de carte embarquées (Noto Sans Regular, 3 plages, 238 Ko, licences jointes, verrou SHA-384) | **fait** : sans aucun hôte externe autorisé, texte compris, les points sont dessinés | `35b74acd` |
| Outil de contrôle : étape « rendu » (points réellement dessinés) et `--base-aucune` | **fait** ; témoin négatif : sans les polices, l'outil échoue sur « aucun point dessiné » | `f798fa02` |
| 3.1b Une couche ne disparaît pas quand une police manque (alphabet non latin, serveur de glyphes inaccessible) | **fait** : vérification des plages exigées par les textes AVANT d'ajouter les étiquettes ; couche montée sans texte, avertissement et événement `error` code `police` | voir l'historique de la branche |
| Étiquette du paquet, version, journal, vitrine | **à faire, avec l'accord de Nicolas** | n/a |
| Lots 2 à 7 | non commencés | n/a |

**Défauts trouvés en vérifiant** (et corrigés dans le même travail) :
- Le générateur de `CSP.txt` associait, pour les versions dont l'interface crée encore des `<style>`, une empreinte et `'unsafe-inline'` dans `style-src` : le navigateur ignore alors `'unsafe-inline'`. Trouvé par le scénario navigateur sur l'état publié actuel ; corrigé (`'unsafe-inline'` seul), avec test et contrôle dans l'outil.
- Le calcul de la fermeture ne lisait pas les imports d'un script module **en ligne** dans la page : sur l'état publié actuel, il ne trouvait que 23 fichiers au lieu de 72. Corrigé, avec test.
- `controle-copie.mjs` : le nettoyage du profil du navigateur échouait sur Windows (fichiers encore ouverts). Corrigé.

**Écarts avec ce document, à connaître** : la 1.4 n'a pas été faite par des fichiers CSS mais par des feuilles construites (même effet, sans requête de plus, repli sur `<style>` pour un navigateur ancien) ; l'outil de contrôle part dans le paquet carte seule (pas seulement dans le dépôt) pour qu'un hôte puisse le lancer chez lui.

## 0 bis. Essais de cadrage (02/11/2026)

Dix essais mesurés (Chrome, copie « carte seule » promue et servie en local) pour fermer ce qui restait ouvert. Les captures et pages d'essai ne sont pas versionnées.

| # | Essai | Résultat | Conséquence pour la feuille de route |
|---|---|---|---|
| E1 | Service worker réel qui précache `PRECACHE.json`, coupure de toute requête externe | la carte démarre sans réseau (page, scripts, scène, cadrage ; connexion 0,3 s) ; l'émulation « hors ligne » de Chrome **ne coupe pas les workers de MapLibre** | la liste de précache est exacte ; piège d'essai documenté |
| E2 | Même essai avec **des étiquettes**, polices externes refusées | **les points disparaissent avec leurs étiquettes** (carte blanche), sans erreur ni événement vers l'hôte | **défaut de fond** : 3.1 passe de confort à correctif (voir 3.1 et 3.1b) |
| E3 | Prototype : Noto Sans Regular embarqué (3 plages, 238 Ko), même scène, politique n'autorisant **que `'self'`** | 12 points et leurs étiquettes affichés, accents compris (Évreux, Cœur, Saint-Étienne, L’Haÿ…), 3 requêtes locales | 3.1 faisable : adresse absolue construite depuis le module |
| E4 | Retrait de la couche d'étiquettes puis rechargement de la source, polices toujours refusées | **les points ne reviennent pas** | le correctif de résilience n'est pas trivial : à concevoir (3.1b) |
| E5 | Plages de caractères des noms des données embarquées (473 noms) | tout tient dans 0-255 (76 Ko) ; 256-511 (œ) et 8192-8447 (’) pour du texte hôte | taille à embarquer : 76 Ko minimum, 238 Ko pour le français courant |
| E6 | Copie sur la **même origine** que l'hôte, fichier compromis, sous la CSP stricte | il lit le titre de l'hôte, écrit son stockage, modifie son DOM, accède à ses cookies | recommandation d'origine dédiée confirmée (mesurée en attaque) |
| E7 | Même fichier, copie servie par **une autre origine** | les quatre accès échouent (`SecurityError`) | idem |
| E8 | Navigateur sans feuilles construites (simulé : `replaceSync` retiré) | l'interface fonctionne ; sous `style-src 'self'` stricte elle n'est pas stylée (3 violations) ; avec les empreintes des 4 feuilles, elle l'est, sans `'unsafe-inline'` | tâche 1.7 : empreintes des feuilles dans `CSP.txt` |
| E9 | Démarrage sur réseau bridé (copie de 2 Mo) | **16 s** à « Fast 3G », **55 s** à « Slow 3G » ; l'avertissement de 20 s arrive, puis la connexion aboutit | délai par défaut à relever bien au-dessus de 45 s (lot 2) |
| E10 | **Usage complet de l'hôte de référence** avec le client version 1 et avec le client version 5, sous la CSP stricte : `connecter`, `setTheme`, `setFond('plan')`, `setScene` (bulles à actions, liste liée, légende cible), `fitTo`, `flyTo`, `batch`, `setLayerVisibility`, `select`, `deconnecter` ; événements `ready`, `camera`, `classe`, `action` | tout réussit et les deux clients se comportent à l'identique | compatibilité d'un ancien client mesurée pour l'usage réel |

**Non testable ici** : Firefox et Safari (non installés). Le repli sans feuilles construites est simulé dans Chrome.

## 1. Ce que les vérifications ont établi

| # | Constat | Preuve | Conséquence |
|---|---|---|---|
| V1 | Le paquet web figé ne contient aucun fichier de licence d'Atlas ni champ `license` | **mesuré** sur les paquets 1.33.0 (téléchargé) et 1.42.2 (construit) ; `scripts/paquet-atlas.js` copie `published/atlas/`, la licence est à la racine du dépôt | MIT exige l'avis dans chaque copie : à corriger |
| V2 | Le guide dit que l'événement `error` après 20 s est toujours `fatal` | **lu** : `index_bi.html` envoie `fatal` pour une dépendance (`dependance`) et `avertissement` pour un simple retard (`delai`) | Guide inexact |
| V3 | Le délai de connexion par défaut de l'élément (30 s) est inférieur au pire démarrage à froid annoncé (45 s) ; celui du client seul est de 8 s | **lu** | Défauts à aligner |
| V4 | `connecter()` ignore l'événement `error` : il n'échoue qu'au délai, avec un message qui accuse l'origine | **lu** (`client.js`) et **mesuré** : avec les scripts en ligne bloqués par une CSP, l'hôte n'a aucun événement et reçoit `delai` après 25 s | Diagnostic lent et trompeur |
| V5 | `bi.html` charge MapLibre par son propre dossier (`./vendor/maplibre-gl/`) | **lu** et **mesuré** | Une copie fidèle doit emporter MapLibre (0,99 Mo) |
| V6 | La fermeture d'imports de `bi.html` est de 54 fichiers (modules chargés à la demande compris : `ui/zone`, `ui/legende`, `ui/temps`, `environnement`, `batiments`, `features`) ; avec les contours (387 Ko), MapLibre, le client et `package.json` : 61 fichiers, 1,95 Mo | **mesuré** : scénario complet (étiquettes, interface légende et temps, couche administrative embarquée, `getFeatures`, `getBuildings`, `getCamera`, `setTime`) sans aucun fichier manquant | Un paquet « carte seule » est réalisable |
| V7 | L'élément `<atlas-bi>` côté hôte a sa propre fermeture : 10 fichiers, 119 Ko | **lu** | À inclure pour les hôtes qui l'utilisent |
| V8 | `bi.html` sans script en ligne fonctionne avec `script-src 'self'` | **mesuré** : les 4 scripts en ligne extraits en fichiers, même scénario complet, zéro violation | Plus d'empreintes à recalculer à chaque version |
| V9 | Dès que le manifeste active `interface` (légende, temps), le composant crée des `<style>` en ligne à l'exécution (`ui/zone.js`, `ui/legende.js`, `ui/temps.js`, `bulle.js`) | **mesuré** (violations `style-src`) et **lu** (`createElement('style')` + `textContent`) | `style-src 'self'` ne suffit pas : soit `'unsafe-inline'` (styles seulement), soit les feuilles en fichiers |
| V10 | Politique qui passe sans violation : `script-src` strict (empreintes ou `'self'` si V8), `style-src 'self' 'unsafe-inline'`, `connect-src` et `img-src` limités à `'self'` + le service de fonds, `worker-src blob:`, `frame-ancestors 'self'` | **mesuré** | À documenter (voir lot 0) |
| V11 | `frame-ancestors 'self'` refuse l'intégration depuis une autre origine | **mesuré** | Déjà recommandé par le guide (§3 et liste de contrôle) |
| V12 | `base=aucune` n'appelle aucun hôte extérieur **tant que la carte n'affiche pas de texte**. Avec `visuel.etiquette`, les polices viennent de `demotiles.maplibre.org` (serveur de démonstration de MapLibre) | **mesuré** (violation `connect-src`) et **lu** (`lib/fonds-base.js`) | Le « aucun service tiers » est exact au démarrage seulement ; pas de vrai hors ligne avec texte |
| V13 | `setFond` n'accepte que les fonds connus d'Atlas (`atlas`, `voile`, `plan`, `plan-ign`, `photo`, `uni`) | **lu** (`FONDS`, « fond inconnu ») | Aucun style de carte personnalisé |
| V14 | Les hôtes externes des fonds : `tiles.openfreemap.org`, `data.geopf.fr` (IGN), `demotiles.maplibre.org` (polices du fond « aucun ») | **lu** | À lister pour les CSP des clients |
| V15 | Le service de fonds par défaut (OpenFreeMap) est gratuit et d'usage commercial permis, mais sans engagement de service ni support personnalisé | **vérifié** sur son site | À dire aux clients ; l'auto-hébergement est possible |
| V16 | Les dépendances du paquet sont verrouillées (`vendor/verrou-externe.json`, SHA-384) ; `PAQUET.json` donne le SHA-256 de chaque fichier | **mesuré** (paquet construit) | Bonne base de contrôle d'une copie |
| V17 | Il n'existe qu'un paquet publié : `atlas-web-v1.33.0` (contrat 0.3, client version 1, 300 fichiers). Aucun pour les contrats 0.4 à 0.7 | **vérifié** (release) | Les clients restent en 0.3 |
| V18 | Le guide recommande déjà `frame-ancestors` sur la page d'Atlas et une CSP côté hôte | **lu** | Mon affirmation initiale « le guide n'en dit rien » était fausse ; il manque la CSP de la page d'Atlas et le cas de la même origine |

## 2. Corrections de mes propres affirmations (faites auprès de l'hôte concerné)

- La CSP que j'ai d'abord donnée (`style-src 'self'` + une empreinte) était **incomplète** dès que l'interface est activée (V9) : corrigée par message.
- « `base=aucune` : Atlas ne contacte plus rien d'extérieur » était **trop général** (V12) : corrigé par message.
- « Environ 1 Mo ajouté » ignorait MapLibre (V5) : corrigé par message.
- « Le guide ne dit rien de la CSP » était **faux** pour `frame-ancestors` (V18).

## 3. Les lots

Principe : chaque lot est autonome, a un critère d'acceptation vérifiable et ne publie rien sans accord explicite. Les lots qui touchent le client hôte ou le contrat sont annoncés aux hôtes (canal `#atlas-bi-hotes`) **avant** publication.

### Lot 0 : corriger, sans effet sur les hôtes

| Tâche | À faire | Acceptation |
|---|---|---|
| 0.1 Licence | `paquet-atlas.js` ajoute `LICENSE` au paquet, `package.json` gagne `"license": "MIT"` ; `PAQUET.json` liste le fichier | test dans `scripts/paquet-atlas.test.js` : le fichier est présent et empreinte vérifiée |
| 0.2 Guide `EXPLOITATION-EXTERNE-BI.md` | niveau `fatal` ou `avertissement` (§9) ; délais ; hôtes externes des fonds (V14) ; cas `base=aucune` avec étiquettes (V12) ; CSP de la page d'Atlas, avec et sans interface (V9, V10) ; copie sur la même origine que l'hôte et ce que `sandbox` isole alors ; le fichier `.map` de MapLibre n'existe pas dans le paquet (404 sans conséquence) | relecture par un hôte ; chaque affirmation renvoie à sa mesure |
| 0.3 Deux « paquets » | distinguer le paquet web (`atlas-web`) du paquet hors ligne de données administratives (`construire-paquet.mjs`) | une phrase d'ouverture dans les deux documents |

### Lot 1 : version « intégration chez soi » (contrat et client inchangés)

Version visée : 1.43.0, avec un paquet figé `atlas-web-v1.43.0` (étiquette posée par Nicolas).

| Tâche | À faire | Acceptation |
|---|---|---|
| 1.1 Paquet « carte seule » | option `--profil bi` : `bi.html`, sa fermeture d'imports, `lib/bi/donnees`, `vendor/maplibre-gl`, le client, la licence ; option pour joindre la fermeture de l'élément `<atlas-bi>` (V7) ; `PAQUET.json` filtré | le banc d'essai (1.5) passe sur le paquet filtré ; environ 2 Mo |
| 1.2 Fichiers générés | `PRECACHE.json` (liste du paquet carte seule) et `CSP.txt` (politique recommandée avec les empreintes exactes) | calculés par le script, relus par test |
| 1.3 `bi.html` sans script en ligne | extraire les quatre scripts ; le garde d'amorçage lit aussi la configuration de la page, pas seulement `?hote=` | `amorcage-garde.test.js` adapté ; essai navigateur avec `script-src 'self'` (V8) |
| 1.4 Feuilles de style | les quatre feuilles créées à l'exécution (V9) passent en fichiers CSS ou en CSSOM | essai avec `style-src 'self'` sans violation ; rendu visuel identique (captures avant/après) |
| 1.5 Outil de contrôle d'une copie | `tools/controle-copie.mjs` tiré du banc d'essai : empreintes, démarrage, `ping`, `setScene`, violations CSP, fichiers manquants | rejoue le scénario complet sur un dossier donné |
| 1.6 Compatibilité | table paquet, contrat, `VERSION_CLIENT`, MapLibre ; règle « un paquet par version de contrat » (et un workflow qui le rappelle) | table dans le guide, vérifiée par test contre `PAQUET.json` |
| 1.7 Empreintes des feuilles dans `CSP.txt` | **fait** (essai E8) : le générateur ajoute à `style-src` les SHA-256 des quatre feuilles (constantes de `zone`, `legende`, `temps`, `bulle`), pour les navigateurs sans feuilles construites | essai navigateur avec `replaceSync` retiré : interface stylée, zéro violation |

Dépend de : accord de Nicolas pour coder et pour l'étiquette. Aucun avis aux hôtes n'est requis pour le contrat ; un message d'information suffit (la page `bi.html` change).

### Lot 2 : client hôte, version 6

À annoncer sur `#atlas-bi-hotes` avant publication (nouvelle empreinte).

| Tâche | À faire | Acceptation |
|---|---|---|
| 2.1 Échec rapide | `connecter()` rejette dès un événement `error` de niveau `fatal` reçu avant la connexion (code `dependance`) | test dans `bi-client.test.js` ; essai avec une dépendance bloquée : rejet en quelques secondes, pas au délai |
| 2.2 Message du délai | le message de `delai` liste les causes plausibles (origine non déclarée, CSP, fichier absent) | test sur le texte |
| 2.3 Défauts | délai de connexion de l'élément et du client alignés (45 à 60 s) | guide et code d'accord |
| 2.4 Régénération | `tools/generer-client-hote.mjs`, `VERSION_CLIENT` 6, empreinte et taille dans le journal des versions | `client-hote.test.js` (fraîcheur) vert |

### Lot 3 : fonds de carte et dépendances externes (à instruire avec les hôtes)

| Tâche | Question à trancher | Piste |
|---|---|---|
| 3.1 Polices du fond « aucun » et du fond de repli | **fait** (voir l'avancement) ; réalisé avec des fichiers dans le dépôt (`lib/bi/polices/`) plutôt que par le vendoriseur : pas de téléchargement à la publication, et ça marche en développement (essais E2, E3, E5) | Noto Sans Regular embarqué (76 Ko pour les noms des données embarquées, 238 Ko pour le français courant), copié depuis le service de fonds par `tools/vendoriser-web.mjs` (verrou SHA-384), avec le texte de la licence SIL OFL 1.1 ; adresse absolue construite depuis le module ; `PRECACHE.json`, `CSP.txt` et guide mis à jour |
| 3.1b Une couche ne disparaît pas quand une police manque | **fait** (essais E2, E4) | `lib/bi/police.js`, branché dans `setScene` avant le montage. Les plages de caractères exigées par les textes affichés sont vérifiées auprès du fournisseur de glyphes ; si l'une manque, la couche est montée sans étiquettes, avec un avertissement et l'événement `error` code `police`. **Correction de mon analyse** : la charte de l'hôte ne fixe PAS la police de la carte (`policeSymboles` y est ignorée) ; les vraies causes sont un serveur de glyphes inaccessible et les caractères hors des plages embarquées |
| 3.2 Style de carte du client | un client veut-il son propre style ou ses propres tuiles ? | `setFond` avec une adresse de style (candidat de contrat 0.8, additif) |
| 3.3 Production | le service de fonds par défaut est sans engagement (V15) | guide « héberger ses tuiles » ; auto-hébergement documenté |

### Lot 4 : candidats de contrat 0.8 (aucun code avant l'avis des hôtes)

Récit piloté par l'hôte (lire les étapes, `goToStep`, événement), capture d'image de la carte, grille d'altitudes, style de fond du client (3.2). Chacun n'entre que si au moins un hôte le demande. Démarche : liste envoyée sur `#atlas-bi-hotes`, retours, puis cadrage.

### Lot 5 : documentation d'ensemble

Les quatre pages et l'index décrits dans le plan de documentation : `PUBLIER-ATLAS.md`, `NIVEAUX-ET-DROITS.md`, `MODES-ET-MEMOIRE-LOCALE.md`, `LIMITES-CONNUES.md`, plus `docs/README.md`. Règle : chaque affirmation porte son niveau de preuve ; les chiffres qui vieillissent sont datés.

### Lot 6 : Atlas comme application

| Tâche | Constat | À faire |
|---|---|---|
| 6.1 Sauvegarde locale | l'autosave du navigateur échoue en silence au-delà du quota | message visible ; plusieurs emplacements ; demande de stockage persistant |
| 6.2 Page ouverte en `file://` | interface vide sans message | message clair |
| 6.3 Application mobile | correctif OSM de la 1.42.2 jamais éprouvé sur un téléphone | essai sur appareil, puis décision de release |
| 6.4 Scène locale | écrite et testée, atteignable seulement dans l'application mobile | décision : l'ouvrir dans le navigateur |
| 6.5 Livrable en fichier seul | l'outil n'est pas versionné et la scène embarquée n'est plus lue | à rouvrir seulement sur besoin d'un client |

### Lot 7 : cohérence avec le chantier des widgets auto-descriptifs

Réserves déjà posées au canal du chantier : le mot `capacites` est pris ; presque toutes les commandes d'Atlas exigent la page ; un champ de disponibilité par profil ; le récit n'est pas pilotable. Le registre d'Atlas viendra après le pilote.

## 4. Ordre proposé

1. Lot 0 (rapide, sans risque).
2. Lot 1, en commençant par 1.1, 1.2 et 1.5, qui servent directement l'hôte de référence.
3. Lot 2 une fois l'avis des hôtes recueilli sur le calendrier.
4. Lots 3 et 4 en parallèle, par questions posées aux hôtes.
5. Lot 5 au fil de l'eau : chaque lot livré écrit sa page.
6. Lot 6 selon les priorités de Nicolas.

## 5. Ce qui n'est pas vérifié

- Un service worker réel avec la liste de précache (les essais bloquent les hôtes externes mais n'utilisent pas de service worker).
- Le paquet 1.33.0 avec un client en `VERSION_CLIENT` 1 : seule la 1.42.2 a été rejouée.
- Le rendu visuel après externalisation des feuilles de style (lot 1.4) : à contrôler par captures.
- Le comportement exact de `sandbox` avec une copie sur la même origine que l'hôte : mesuré en fonctionnement, pas en attaque.

## 6. Décisions de Nicolas attendues

1. Valider la feuille de route et l'ordre.
2. Accord pour coder le lot 0 puis le lot 1 (branche à part, un commit par tâche, rien de publié).
3. L'étiquette du paquet : `atlas-web-v1.43.0` après le lot 1, plutôt que `1.42.2` maintenant.
4. Priorité du lot 6 par rapport aux lots 1 à 4.
