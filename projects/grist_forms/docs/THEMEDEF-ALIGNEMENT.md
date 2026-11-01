# ThemeDef : aligner les widgets du dépôt (Form Builder, Atlas, TaskFlow, appkit)

Statut : grille de travail, 01/11/2026. Demande de l'auteur : que tous les widgets appliquent ThemeDef de la même façon (dans Grist, par défaut, le thème de Grist ;
la vitrine suit), harmonisés et corrects, **sans casser un widget existant**. Ce document ne décide rien à la place des propriétaires de chaque widget : il fixe
la grille commune, relève les écarts et dit qui fait quoi. La spécification reste [THEMEDEF-SPEC.md](THEMEDEF-SPEC.md).

## 1. L'ordre des couches, le même partout

Du plus fort au plus faible, dans un widget **ouvert dans Grist** :

1. Les préférences de la personne : contraste forcé ou renforcé. Elles l'emportent toujours, rien n'est posé par-dessus.
2. Un choix explicite fait dans le widget lui-même (essai en cours d'édition, réglage local du widget).
3. `Theme_document` : le thème actif du document (ThemeDef 1.0, lu par la règle de lecture commune, `resolu` jamais cru).
4. Le thème de l'instance Grist (mode clair/sombre et couleur d'action), **repli par défaut dans Grist**.
5. Les valeurs d'origine du widget (le `repli` de chaque `--kit-*`).

Hors Grist (site public) : 1, puis le thème du visiteur (`?vitrine=1`, [CADRAGE-THEME-VISITEUR.md](CADRAGE-THEME-VISITEUR.md)), puis le thème maison
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
| C1 crochet `--kit-*` | oui (`dsfr-like.css`, `theme.js`) | oui (`depuis-kit.js`) | oui, branche locale `taskflow/themedef-compatible` | **partiel** : jetons propres `--c-*`, projection de 21 clés `kit-theme/0.1` posée par `setProperty` (désactivable) ; sans thème, paquet public de repli (parité 40/40) |
| C2 lecture `Theme_document` | oui, 22 paires, 127/142 vecteurs, 15 écarts nommés | oui, aligné (mêmes 15 écarts) | **non**, volontairement (aucun lecteur) | oui, c'est le lecteur de référence (142/142), branché au runtime |
| C3 repli instance Grist | oui, mode `grist` (opt-in ; neuf = `grist`) | oui (`theme-instance.js`), **par défaut** | **non** | existe (paquet `hote`, opt-in), **pas chaîné** après le document : `theme.pack` est unique |
| C4 clair/sombre | oui | clair seulement pour l'application complète (`fond-sombre-non-suivi`) | `prefers-color-scheme` seul | oui, bascule à chaud sans perdre saisie ni focus |
| C5 contraste forcé | visiteur oui ; formulaire : à mesurer en navigateur | à confirmer | à confirmer | oui ; `forced-colors` mesuré en Chrome, `prefers-contrast` unitaire seulement |
| C6 écriture | geste d'activation (57 vecteurs) | lecture seule | aucune | le runtime n'écrit jamais ; l'éditeur d'apparence écrit par `lotActivation` |
| C7 thème visiteur | oui (vitrine Form Builder) | vitrine : pas encore (`themeVisiteur`) | pas branché | n/a |
| C8 compatibilité | tests dédiés | à confirmer | « repli = valeur d'avant » | non-régression 337 + 389 tests, parité 40/40 ; conformité complète non rejouée |
| C9 refus dit | oui | `raison` rendue, à confirmer côté interface | n/a | oui, toast de 4 s avec la raison et les couleurs fautives |
| C10 vecteurs communs | lecteur : oui ; instance Grist : **non** | lecteur : oui ; instance : propre | n/a | lecteur : oui ; instance : tests propres du pont |

## 4. Écarts déjà identifiés

**E1. Le thème de l'instance Grist est lu de trois façons** (Form Builder, Atlas, appkit). Pour une même instance, les trois ne choisissent pas la même couleur d'action.

- Form Builder : couleur d'action = `--grist-theme-control-primary-bg` seule, redressée à 4,5:1 sur les trois fonds ; mode = `data-grist-appearance` ; seuls ce mode et cette couleur sont repris (le reste est dérivé).
- appkit (pont `hote`, lot T5) : la même couleur d'action et le même mode que Form Builder, mêmes exigences à 4,5:1, mais quand elles échouent il **retombe sur son repli** au lieu d'assombrir.
- Atlas : première couleur qui tient 3:1 parmi `control-primary-bg`, `primary-muted`, `primary-dim`, `accent-text`, `control-fg`, `link`, `primary` ; reprend aussi `page-bg` (fond) et `text` (texte) ; la police devient `systeme`.

Conséquence visible : sur docs.getgrist.com (`#16b378`), un formulaire et une carte ne seraient pas du même vert. À traiter par un seul contrat « thème de l'instance → ThemeDef de graines », porté par le kit (`kit/jetons/themedef`, proposition d'appkit acceptée), avec des vecteurs (GristLight, GristDark, une instance à palette propre), dont les propriétaires de chaque widget rejouent le verdict. La décision de fond (reprendre le fond et le texte de Grist, ou seulement mode + action) revient à l'auteur.

**E2. TaskFlow ne prend pas le thème de Grist par défaut.** Il n'a ni lecteur de `Theme_document` ni repli sur l'instance. Le faire changerait l'aspect de **tous les documents existants** : à ne faire qu'avec accord explicite, opt-in d'abord, et le test « sans thème, identique » ci-dessus.

**E5. La chaîne document puis instance n'existe pas dans appkit** : `theme.pack` est unique (`document`, `hote` ou un paquet public). Un `theme.pack: "document"` avec `repli: "hote"` serait un ajout (validation E-APP-243 et runtime) qui ne change aucun appdef existant ; appkit peut le cadrer, après D-A.

**E3. Le mode par défaut n'est pas le même.** Form Builder : formulaires existants en `document`, nouveaux en `grist`. Atlas : repli instance par défaut. À aligner sur une règle écrite (voir la décision D-A).

**E4. Trois copies du lecteur** (Form Builder, Atlas, kit). Accord déjà pris : copies testées maintenant sur les mêmes vecteurs, noyau pur dans `projects/shared` après publication commune.

## 5. Décisions qui reviennent à l'auteur

- **D-A.** Dans Grist, sans thème de document : le thème de Grist s'applique-t-il **par défaut** à tous les widgets (Atlas le fait déjà, TaskFlow non), ou seulement quand on le choisit ? Par défaut = cohérent, mais change l'aspect des documents existants.
- **D-B.** Reprise du thème de l'instance : mode + action seulement, ou aussi fond, texte et police (E1).
- **D-C.** Date et lot de publication communs (Form Builder 1.6.0, Atlas 1.42.0, TaskFlow, appkit), après accord explicite.

## 6. Procédure

1. Chaque propriétaire corrige sa colonne du §3 avec une preuve (fichier et test), sans toucher aux autres.
2. Les écarts du §4 sont traités un par un, dans l'ordre E1, E3, E2, par un contrat écrit et des vecteurs communs avant tout code.
3. Aucune publication, aucun push, sans accord explicite de l'auteur ; publication à date commune.
4. Un widget qui n'est pas dans la grille (qgis2grist, budget_app, Artefactory, terrain, whiteboard, referentiels, observatoire) est inventorié avant d'être jugé concerné.
