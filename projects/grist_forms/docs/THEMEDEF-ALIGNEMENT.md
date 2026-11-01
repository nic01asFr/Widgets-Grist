# ThemeDef : aligner les widgets du dépôt (Form Builder, Atlas, TaskFlow, appkit)

Statut : grille de travail, 01/11/2026. Demande de l'auteur : que tous les widgets appliquent ThemeDef de la même façon (dans Grist, par défaut, le thème de Grist ;
la vitrine suit), harmonisés et corrects, **sans casser un widget existant**. Ce document ne décide rien à la place des propriétaires de chaque widget : il fixe
la grille commune, relève les écarts et dit qui fait quoi. La spécification reste [THEMEDEF-SPEC.md](THEMEDEF-SPEC.md).

## 1. L'ordre des couches, le même partout

Du plus fort au plus faible, dans un widget **ouvert dans Grist** :

1. Les préférences de la personne : contraste forcé ou renforcé. Elles l'emportent toujours, rien n'est posé par-dessus.
2. Un choix explicite fait dans le widget lui-même (essai en cours d'édition, réglage local du widget), y compris **« sans thème »** : ses valeurs d'origine, sans document ni instance.
3. `Theme_document` : le thème actif du document (ThemeDef 1.0, lu par la règle de lecture commune, `resolu` jamais cru).
4. Le thème de l'instance Grist (mode clair/sombre et couleur d'action), **repli par défaut dans Grist**.
5. Les valeurs d'origine du widget (le `repli` de chaque `--kit-*`).

Hors Grist, un widget ne prend **aucun thème de lui-même** (défaut = sans thème). Sur le site public : 1, puis le thème du visiteur (`?vitrine=1`, [CADRAGE-THEME-VISITEUR.md](CADRAGE-THEME-VISITEUR.md)), puis le thème maison
([CADRAGE-THEME-MAISON.md](CADRAGE-THEME-MAISON.md)), puis les valeurs d'origine.

Retirer une couche ne doit jamais laisser le widget illisible : la couche du dessous reste lisible seule.

## 2. La grille de conformité (une ligne par capacité)

| # | Capacité | Règle commune |
|---|----------|---------------|
| C1 | Crochet `--kit-*` | Les 26 variables du kit sont lues avec **repli = valeur d'avant** : sans thème, rendu identique à l'octet. |
| C2 | Lecture de `Theme_document` | Table absente ou vide : aucun thème, sans bruit. Plusieurs lignes actives : rien n'est appliqué, dit. Version inconnue : refus. `resolu` mesuré (22 paires, seuil selon le premier plan), jamais cru ; refus entier, jamais de retour sur les graines. Une seule définition de la règle. |
| C3 | Repli sur le thème de l'instance Grist | Sans thème de document, dans Grist : mode et couleur d'action de Grist. Même résultat, pour une même instance, dans tous les widgets. |
| C4 | Clair/sombre | Suit l'apparence de Grist dans Grist, la préférence du système ailleurs ; `sans-mode-sombre` dit, jamais un mode inventé. |
| C5 | Préférences de la personne | `forced-colors: active` et `prefers-contrast: more` : le thème ne pose rien. |
| C6 | Lecture seule | Un widget ne **crée** ni n'écrit jamais `Theme_document`, sauf le geste d'activation (copie du kit, un lot = une action). |
| C7 | Thème du visiteur (site public) | Opt-in par page, jamais lu en production, jamais dans Grist. |
| C8 | Compatibilité | Un document sans thème et un widget existant : rendu et comportement inchangés. Test « identique à l'octet » quand le widget produit des pages. |
| C9 | Refus dit | Un thème refusé est dit à la personne (raison nommée), jamais appliqué à moitié ni en silence. |
| C10 | Tests communs | Mêmes vecteurs de lecture (fichier du kit rejoué) et mêmes vecteurs du thème d'instance, avec le même verdict dans chaque widget. |

## 3. État relevé (à confirmer par chaque propriétaire)

| Capacité | Form Builder | Atlas | TaskFlow | appkit |
|----------|--------------|-------|----------|--------|
| C1 crochet `--kit-*` | oui (`dsfr-like.css`, `theme.js`) | oui (`depuis-kit.js`, tests `charte-depuis-kit*`) | oui, branche locale `taskflow/themedef-compatible` | **partiel** : jetons propres `--c-*`, projection de 21 clés `kit-theme/0.1` posée par `setProperty` (désactivable) ; sans thème, paquet public de repli (parité 40/40) |
| C2 lecture `Theme_document` | oui, 22 paires, 127/142 vecteurs, 15 écarts nommés | oui, aligné (`themedef-lecteur.js`, 142 vecteurs, mêmes 15 écarts), local non publié | **non**, volontairement (aucun lecteur) | oui, c'est le lecteur de référence (142/142), branché au runtime |
| C3 repli instance Grist | oui, mode `grist` (opt-in ; neuf = `grist`) | oui (`theme-instance.js`), **par défaut**, publié | **non** | existe (paquet `hote`, opt-in), **pas chaîné** après le document : `theme.pack` est unique |
| C4 clair/sombre | oui | oui : le sombre est suivi (application et fond « Thème », depuis la 1.37.0) | `prefers-color-scheme` seul | oui, bascule à chaud sans perdre saisie ni focus |
| C5 contraste forcé | visiteur oui ; formulaire : à mesurer en navigateur | à confirmer : la préférence de contraste passe avant le thème hôte (`resolution.js`), pas de test navigateur | **non** : aucune occurrence de `forced-colors`/`prefers-contrast` dans les 8 fichiers ; sans lecteur, aucun thème n'est posé (la question se pose dès qu'un lecteur est ajouté) | oui ; `forced-colors` mesuré en Chrome, `prefers-contrast` unitaire seulement |
| C6 écriture | geste d'activation (57 vecteurs) | lecture seule | aucune | le runtime n'écrit jamais ; l'éditeur d'apparence écrit par `lotActivation` |
| C7 thème visiteur | oui (vitrine Form Builder) | vitrine : pas encore (`themeVisiteur`) | pas branché | n/a |
| C8 compatibilité | tests dédiés | 3028 tests, **pas de test « identique à l'octet » côté application** (à ajouter) | « repli = valeur d'avant » | non-régression 337 + 389 tests, parité 40/40 ; conformité complète non rejouée |
| C9 refus dit | oui | `raison` et paires fautives produites, **rien n'est affiché à la personne** (écart à traiter) | n/a | oui, toast de 4 s avec la raison et les couleurs fautives |
| C10 vecteurs communs | lecteur : oui ; instance Grist : **non** | lecteur : oui ; instance : tests propres, à rejouer | n/a | lecteur : oui ; instance : tests propres du pont |

## 4. Écarts déjà identifiés

**E1. Le thème de l'instance Grist est lu de trois façons** (Form Builder, Atlas, appkit). Pour une même instance, les trois ne choisissent pas la même couleur d'action.

- Form Builder : couleur d'action = `--grist-theme-control-primary-bg` seule, redressée à 4,5:1 sur les trois fonds ; mode = `data-grist-appearance` ; seuls ce mode et cette couleur sont repris (le reste est dérivé).
- appkit (pont `hote`, lot T5) : la même couleur d'action et le même mode que Form Builder, mêmes exigences à 4,5:1, mais quand elles échouent il **retombe sur son repli** au lieu d'assombrir.
- Atlas : première couleur qui tient 3:1 parmi `control-primary-bg`, `primary-muted`, `primary-dim`, `accent-text`, `control-fg`, `link`, `primary` ; reprend aussi `page-bg` (fond) et `text` (texte) ; la police devient `systeme`.

Conséquence visible : sur docs.getgrist.com (`#16b378`), un formulaire et une carte ne seraient pas du même vert. À traiter par un seul contrat « thème de l'instance → ThemeDef de graines », porté par le kit (`kit/jetons/themedef`, proposition d'appkit acceptée), avec des vecteurs (GristLight, GristDark, une instance à palette propre), dont les propriétaires de chaque widget rejouent le verdict. La décision de fond (reprendre le fond et le texte de Grist, ou seulement mode + action) revient à l'auteur.

**E6. Le « sans thème » explicite manque** chez Atlas (additif : réglage ou paramètre `?theme=aucun`), TaskFlow et appkit ; Form Builder l'a (`aucune`). Atlas : sa couche « choix explicite » est la charte donnée par un hôte (`setTheme`).

**E7. Politique par couche propre au widget (écart connu, pas dans le contrat).** appkit ne reprend fond, texte et police que si le mode montré est celui de l'hôte et que six paires tiennent ; Atlas les pose dès que le thème de l'instance est lisible (garde de sa charte), parce qu'il suit lui-même le mode de l'hôte. Le contrat reste une fonction pure ; chaque widget garde sa politique et la dit.

**E8. La dérivation des graines n'est pas partagée.** Le contrat de l'instance est une fonction pure copiée du kit (32 vecteurs identiques chez Form Builder), mais son verdict `lecteur: accepté` suppose la dérivation du compilateur du kit. Celle de Form Builder (`deriver`) en diffère : sur les valeurs qu'elle dérive, 31 verdicts sur 50 échouent les 22 paires (états ok/attention/alerte à 3,6-3,8:1 en sombre, accent sur fond à 3,0:1 pour un thème sombre vu en clair), et v10d, refusé par le kit, est accepté. Un thème sans `resolu` est lu en aperçu sans mesure (divergence déjà documentée). Avec D-A, c'est un risque réel d'états illisibles. Demande au kit : un module pur sans import qui dérive graines et mode vers les 26 valeurs, comparé au compilateur par test, copié par chaque widget. Provisoire pour Form Builder : mode et couleur d'action seulement, et mesure des 22 paires avant application.

**E9. Accent et action ne veulent pas dire la même chose dans le kit et dans ma dérivation.** Avec la dérivation du kit, `accent` est la graine principale telle que donnée et `action` (les boutons) en est dérivée : principal #3e5de7 donne accent #3e5de7 et action #343c53 en clair, action #f0f0f0 en sombre ; principal #0b6e4f donne action #284438. Ma dérivation faisait l'inverse (action = principale, accent = secondaire). Conséquences à traiter : (1) le pont de la vitrine du thème du visiteur (`--accent` posé depuis `--kit-action`) suit ma dérivation, pas celle du kit : à reprendre depuis `--kit-accent` et `--kit-accent-texte` ; (2) l'aperçu des thèmes sans `resolu` (documents, page design system) dérive encore avec ma dérivation ; (3) le thème de Grist, lui, passe déjà par la dérivation du kit. **Traité le 01/11/2026 (confirmé par le kit : accent = identité, éclairci par le kit en sombre ; action = boutons dérivés ; accent-texte = texte lisible sur l'accent) :** `resoudre` dérive désormais avec la copie du kit (un thème que ses portes refusent est refusé en entier, au lieu d'être redressé), le pont de la vitrine pose `--accent` depuis `--kit-accent` et `--sur-accent` depuis `--kit-accent-texte`, et la page design system charge les deux copies. Seul le sombre « explicite » garde ma dérivation d'origine (la copie ne le connaît pas). Atlas et TaskFlow avaient déjà accent = identité.

**E10. Mesuré en Grist réel le 01/11/2026 (instance numerique.gouv, document jetable) :** (1) le compositeur prend le thème de l'instance au chargement et à chaud, en clair comme en sombre ; (2) un formulaire en mode `grist`, remis en ligne avec le nouveau lecteur, prend le thème de l'instance à l'ouverture, clair et sombre (titre #3e5de7, fond #f6f8f9 en clair ; fond sombre de l'instance et bouton clair lisible en sombre) ; (3) **limite** : dans la page publiée par le Custom Widget Builder (iframe imbriquée), le formulaire NE SUIT PAS un changement de thème fait pendant qu'il est ouvert (il faut recharger) ; le changement à chaud n'est tenu que dans le compositeur. À traiter par un message de la page hôte vers l'iframe, ou à dire à la personne. Les formulaires existants restent en mode `document` (rien ne change tant que la personne ne choisit pas « sinon celle de Grist »).

**E2. TaskFlow ne prend pas le thème de Grist par défaut.** Il n'a ni lecteur de `Theme_document` ni repli sur l'instance. Le faire changerait l'aspect de **tous les documents existants** : à ne faire qu'avec accord explicite, opt-in d'abord, et le test « sans thème, identique » ci-dessus.

**E5. La chaîne document puis instance n'existe pas dans appkit** : `theme.pack` est unique (`document`, `hote` ou un paquet public). Un `theme.pack: "document"` avec `repli: "hote"` serait un ajout (validation E-APP-243 et runtime) qui ne change aucun appdef existant ; appkit peut le cadrer, après D-A.

**E3. Le mode par défaut n'est pas le même.** Form Builder : formulaires existants en `document`, nouveaux en `grist`. Atlas : repli instance par défaut. À aligner sur une règle écrite (voir la décision D-A).

**E4. Trois copies du lecteur** (Form Builder, Atlas, kit). Accord déjà pris : copies testées maintenant sur les mêmes vecteurs, noyau pur dans `projects/shared` après publication commune.

## 5. Décisions de l'auteur (01/11/2026)

- **D-A : oui.** Dans Grist, sans thème de document, le thème de Grist s'applique **par défaut** à tous les widgets. Conséquence assumée : l'aspect des documents existants peut changer. Ce changement se fait donc avec des garde-fous (voir §6) : il ne casse aucun widget, il reste lisible, et il cède devant un thème de document.
- **D-A bis : un « sans thème » obligatoire.** Chaque widget offre un choix explicite **sans thème** (ses valeurs d'origine, ni document ni instance), pour le cas qui le demande. C'est aussi **le défaut hors Grist** : en dehors de Grist, un widget ne prend aucun thème de lui-même (le thème du visiteur et le thème maison ne s'ajoutent que sur le site public). Dans Form Builder, c'est le mode `aucune` de `apparence` ; à nommer et prévoir dans Atlas, TaskFlow et appkit (réglage ou paramètre du widget, jamais une absence de réglage).
- **D-B : oui.** Le thème de l'instance donne aussi le fond, le texte et la police, pas seulement le mode et l'action. Contrat : [THEMEDEF-INSTANCE-GRIST.md](THEMEDEF-INSTANCE-GRIST.md).
- **D-C : à Form Builder de coordonner** la date et le lot. La publication elle-même (push, release) reste soumise à un accord explicite de l'auteur au moment de publier.

## 6. Procédure et garde-fous

0. Garde-fous de D-A : (a) un thème de document, ou un choix explicite dans le widget, l'emporte toujours ; (b) un thème de l'instance illisible ou incomplet n'est jamais appliqué à moitié : le widget garde ses valeurs d'origine et le dit ; (c) un test par widget : sans thème d'instance ni de document, rendu identique ; avec un thème d'instance, rendu lisible (22 paires) en clair et en sombre ; (d) les widgets qui ne savent pas suivre le sombre (Atlas, application complète) le disent, ils ne l'inventent pas.

1. Chaque propriétaire corrige sa colonne du §3 avec une preuve (fichier et test), sans toucher aux autres.
2. Les écarts du §4 sont traités un par un, dans l'ordre E1, E3, E2, par un contrat écrit et des vecteurs communs avant tout code.
3. Aucune publication, aucun push, sans accord explicite de l'auteur ; publication à date commune.
4. Un widget qui n'est pas dans la grille (qgis2grist, budget_app, Artefactory, terrain, whiteboard, referentiels, observatoire) est inventorié avant d'être jugé concerné.
