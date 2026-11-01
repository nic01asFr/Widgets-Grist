# Projet: grist_forms (Form Builder)

## Contexte
Essence formulaires Grist — compose FormDef, persist table Formulaires, publish vue intra-doc.
Façade **questionnaire** pour user non formé ; moteur technique (`bind` / `ensureSchema`) en coulisse.

## Spec
- v1 : `docs/superpowers/specs/2026-07-26-grist-forms-builder-design.md`
- Phase 2 (SM + Attachments) : `docs/superpowers/specs/2026-07-26-grist-forms-phase2-design.md`
- Contexte & audience : `docs/superpowers/specs/2026-07-26-grist-forms-context-audience-design.md`

## Architecture

```
projects/grist_forms/
├── builder.html          # UI 4 étapes + wizard + templates
├── runtime/
│   ├── engine.js         # Preview + runtime (cascade, editRowId) ; mount() et monter()
│   ├── formdef.schema.json
│   ├── conditions.schema.json   # contrat conditions-1.0 (source ; copie publiée dans published/schemas/)
│   └── survey-manifest.schema.json
├── shared/
│   ├── conditions.js     # La grammaire de conditions + son évaluateur (UMD, sans dépendance)
│   ├── limites.js        # Jusqu'où un formulaire accepte de réponses (places, fenêtre) + la formule « Place » (UMD)
│   ├── acces.js          # Qui voit les réponses : règles d'accès à poser (ne parle pas à Grist)
│   ├── client-contrat.js # Le pont grist-bridge sous la forme du contrat de données, et l'inverse
│   ├── dsfr-like.css     # Thème : couleurs via var(--kit-*, repli)
│   ├── ux.js
│   ├── grist-bridge.js
│   ├── types.js
│   ├── attachments.js
│   ├── session-context.js   # Probe widget / session / groupes audience
│   ├── audience-setup.js    # Auto formule user.Email (trigger nouvelles lignes)
│   ├── survey-project.js
│   ├── ensure-schema.js
│   ├── liens-table.js       # Tables liées : reconnaître, créer, écrire les lignes
│   ├── referentiel.js       # Champ d'adresse (BAN) : propositions, annexes
│   ├── formats.js           # IBAN, SIRET, … : une règle en JavaScript ET en Python
│   ├── prefill.js           # Valeurs reçues par l'adresse de la page (QR code)
│   ├── enrichir.js          # Un point posé : adresse, commune, bâtiment, altitude, risques
│   ├── externe.js           # Schéma + page d'un formulaire servi hors de Grist
│   ├── formulaires-table.js
│   ├── saisies.js           # Gestes de saisie : curseur, classement, échelle, mesure
│   ├── carte-geometrie.js   # Carte de saisie d'un point, d'une ligne, d'un polygone
│   ├── dessin.js            # Annotation et signature sur une image ; `nomDeCouleur`
│   ├── theme.js             # Contrat de thème `kit-theme/0.1` : juge puis pose les variables --kit-*
│   ├── design-system.js     # Catalogue → formulaire, réponses → document, règles croisées, ThemeDef 1.0 (page `design-system.html`)
│   ├── themedef.js          # Lit le thème du document, celui que le formulaire porte (`apparence`) ou celui de Grist (mode `grist`), le résout, l'habille : jamais d'écriture
│   ├── theme-visiteur.js    # Le thème du visiteur HORS Grist (une clé de stockage, jamais lue en production) : voir docs/CADRAGE-THEME-VISITEUR.md
│   ├── activation.js        # COPIE du kit (`lotActivation`, validateur, SHA-256 pur) : la bascule de Theme_document, jamais réécrite ici
│   ├── activation-geste.js  # Le geste « Appliquer ce thème au document » : préparer, retirer, relire (pur, sans écriture)
│   ├── design-system-apercu.js  # Illustration de chaque module (couleurs, formes, espacements…)
│   ├── formdef-from-table.js         # Un FormDef déduit d'une table Grist
│   ├── formdef-from-grist-form.js    # Un FormDef relu depuis un formulaire natif Grist
│   └── publish.js
├── tests/
│   └── e2e-hook.js       # Harnais d'essai — chargé seulement sur `?e2e=1`
├── docs/matrice-types.html  # Types Grist, formes de question, gestes (page de référence)
├── docs/THEME-KIT.md        # Variables --kit-* et correspondance avec les jetons du kit
├── docs/DESIGN-SYSTEM.md    # Saisir un design system : catalogue, niveaux, brouillon, proposition, table `Design_system`, mesures
├── docs/THEMEDEF-SPEC.md    # ThemeDef 1.0 (brouillon relu) : document de thème éditable ; le moteur ne le lit pas, l'hôte oui
├── docs/LIMITES.md          # Limiter participants, réponses, durée d'ouverture ; ce que la table tranche (formule Place)
├── docs/EXPOSITION.md       # Trois façons de partager, qui lit quoi, règles d'accès, ce qui est mesuré ou non
├── docs/ETUDE-INSCRIPTION.md        # Inscription à des créneaux : ce qui est tenu (mesuré), ce qui ne l'est pas, ce qu'on peut faire
├── docs/ETUDE-MODES-ET-ACCES.md     # Cinq modes (connectés, public, iframe, clé hors Grist, hybride), qui lit quoi ; mode B mesuré en réel
├── docs/ETUDE-CRENEAUX-CALENDRIER.md  # Créneaux datés, calendrier et standards TaskFlow, ICS, chevauchement (étude, rien de codé)
├── docs/MIGRATION-CONDITIONS.md  # Ce qui change pour qui écrit un FormDef (10/10/2026)
├── docs/MANUAL_TEST.md
└── docs/PUBLICATION.md
```

## État — **v1 + phase 2 + audience + les saisies, l'illustration, l'accueil + prérequis du kit** (2026-10-10)

`node --test "projects/grist_forms/tests/*.test.js" scripts/schemas.test.js` → **1491 tests verts** (dont 49 sur le design system, 45 sur la lecture du thème et l'apparence ; les essais de bout en bout sur un vrai catalogue se lancent avec `DSDEF_DIR`) (31/10/2026 ; les
chiffres des notes plus anciennes sont périmés, ne pas les recopier : relancer la commande).

### Les prérequis du kit d'applications (10/10/2026, jalon 0b, décision D7)

Le kit d'applications (un projet voisin, pas encore publié) veut référencer FormDef, réutiliser sa grammaire de
conditions et monter un formulaire hors d'un widget Grist. Cinq changements ; aucun ne change un
FormDef sain, et ce que change une condition fautive est dans `docs/MIGRATION-CONDITIONS.md` :

| Quoi | Où |
|---|---|
| Le schéma FormDef publié **resynchronisé** sur la source (il rejetait 48 écarts de l'enquête du 4e) ; la source n'a plus d'`$id` (un seul `$id` par adresse) ; test d'égalité source/publié, de fixtures et d'`$id` unique | `published/schemas/formdef-1.0.schema.json`, `scripts/schemas.test.js` |
| Le contrat **`conditions-1.0`** extrait : règles et composés `and`/`or`/`not`, opérateurs en liste fermée, sources fermées (`field`, `context`, `audience`) ; `definitions.condition` du FormDef en est la copie identique (test d'équivalence) | `runtime/conditions.schema.json`, `published/schemas/conditions-1.0.schema.json` |
| **L'évaluateur partagé** `shared/conditions.js` : `validerCondition` (fautes avec chemin et proposition), `evaluer` (lève `ConditionInvalide`), `comparer`. Nouveaux opérateurs `empty`, `notEmpty` et composé `not`. **Un opérateur inconnu n'est plus « vrai »** : la condition vaut faux, le champ reste caché, l'erreur est journalisée une fois (`Engine.definirJournal(fn)`, sinon `console.error`) | `shared/conditions.js`, `engine.js` |
| **`FormEngine.monter(conteneur, formdef, { client, contexte, theme, valeurs, ligne, surEnvoi, brouillon })`** → `{ demonter, valeurs, valider, contexte, rendre }`. Avec `client` (contrat de données du gabarit : `lireTable(table)`, `appliquer(actions, etiquette)`), le moteur n'accède plus à `window.grist` ; une écriture en file (`{ enfile: true }`) est dite à l'écran. `mount` reste l'entrée historique et gagne `demonter` et `valider`. `brouillon: true` (ou un objet `getItem/setItem/removeItem`) garde ce qu'on a commencé à répondre dans l'onglet (sessionStorage), le propose au rechargement (« Reprendre » / « Recommencer à zéro ») et l'efface à l'envoi ; jamais en modification de ligne, ni les fichiers ni les valeurs internes. Les pages publiées le demandent ; `FormEngine.effacerBrouillon(def)` pour repartir de zéro | `engine.js`, `shared/client-contrat.js` |
| **Thème** : plus de couleur en dur hors des définitions ; `var(--kit-accent, var(--blue-france))`… le rendu par défaut est inchangé (vérifié : résolue sans thème, la feuille redonne l'ancienne ligne à ligne) | `shared/dsfr-like.css`, `docs/THEME-KIT.md` |

**Pour les hôtes qui chargent `engine.js` en `<script>` :** ajouter
`shared/conditions.js` AVANT `runtime/engine.js`. Sans lui, le moteur se replie sur
l'ancien évaluateur (opérateur inconnu = vrai) et le dit une fois en console : rien ne
casse, mais rien ne se corrige. Fait ici pour `builder.html`, `demo/index.html` et le
bundle de publication (`publish.js`, paramètre `conditionsJs`). **Pas fait** (hors de ce
projet) : Atlas (`index_v7.html`, `packages/atlas-app` — sept scripts vendorisés),
`qgis2grist` (`terrain.html`, `lib/qfield-publish-pack.js`).

**Pièges relevés pendant le lot**
- `node --test scripts/generate-vitrine.test.js` **réécrit** `published/index.html` et
  `published/w/*/index.html` (dates relatives) : ne pas le lancer pour « vérifier », ou
  restaurer ensuite.
- `mount` reçoit-il un `bridge.context` ? Alors la sonde d'identité ne tourne pas (elle
  serait écrasée). `monter` résout l'identité lui-même dans ce cas.
- `==` est l'égalité LÂCHE de JavaScript (`'' == 0`) ; `>`/`<` sont numériques (une date ISO
  donne faux). Documenté dans le contrat ; pour l'absence de réponse, `empty`.

### Le mode « externe » et ses quatre briques (18/10/2026)

Prouvé en Grist réel sur un document d'essai ; détail et mesures : `docs/ENVOI-EXTERNE.md`. `node --test` → **944 tests** (au 23/10/2026).

- **Une règle, deux exécutions.** `formats.js` porte chaque format en JavaScript et en Python ; la formule `Motifs` de la table de réception est **exécutée en Python par les essais**
  (`tests/externe.test.js`, `tests/formats.test.js`). Sans Python sur le poste, ces essais se sautent et le disent.
- **La clé d'un formulaire natif écrit toute colonne qui n'est pas une formule.** La table de réception ne contient donc que ce que la personne peut remplir ; statut, réponse et notes
  vivent dans `<table>_Traitements`. Les règles d'accès ne s'appliquent pas à ce chemin : ne rien leur confier.
- **Une référence inventée est « vraie » pour Grist mais n'a pas d'identifiant** : `not $Col` dit « absente », `$Col and not $Col.id` dit « inconnue ».
- **Un nombre absent d'un envoi vaut 0 dans Grist** : le moteur écrit `null` explicite (colonnes enrichies, annexes d'adresse).
- Hors de Grist : pas de pièces jointes (l'envoi d'un fichier est lié à une session par cookie, bloqué hors de l'origine de Grist).

### Les quatre saisies qui manquaient (04/10/2026)

L'enquête du secteur nord — 61 questions, prise comme pierre de touche —
en demandait quatre que le moteur ne savait pas rendre. Elles ne sont pas des
variantes d'affichage : chacune **range sa réponse ailleurs que dans la colonne
qui porte son nom**, et c'est `options.colonnes` qui le dit.

| Saisie | `widget` / `kind` | Où va la réponse |
|---|---|---|
| Oui / Non en deux boutons | `widget: 'ouinon'` | la colonne `Bool` |
| « Autre : … » | `kind: 'choix_autre'` | la liste reçoit « Autre », le texte va dans `colonnes.autre` |
| Cases plafonnées | `options.maxSelected` | la colonne `ChoiceList` |
| Classement | `widget: 'classement'`, `kind: 'classement'` | un rang par colonne, `colonnes.rangs` |
| Lieu | `widget: 'geo'`, `kind: 'geometrie'` | le WKT dans une colonne texte |

Trois choses mesurées qui commandent ces choix :

- **Une valeur hors-liste est conservée par Grist, mais encadrée en rouge.**
  C'est pourquoi « Autre » est une option de la liste, et la précision une
  colonne à part. En mode liaison, le compositeur vérifie que la colonne
  propose bien le mot, et offre de l'y ajouter.
- **Grist ne sait pas vider un `Bool`** : sans réponse, un oui/non écrit
  « non ». Une question qui doit distinguer « non » de « sans réponse » se
  pose en liste de choix.
- **Une `ChoiceList` conserve l'ordre**, ce qui permettrait d'y ranger un
  classement ; l'enquête préfère une colonne par rang, et c'est le FormDef qui
  tranche.

Une question cachée vide aussi les colonnes qu'elle ne nomme pas par son
`colId` : sans cela, les rangs et la précision d'une autre personne restaient
dans la ligne.

### La synthese : la table relue par le FormDef (05/10/2026)

Un formulaire sans restitution est un formulaire a moitie. La table des
reponses n'est pas lisible seule : une echelle y ecrit `4` dans une colonne
d'entiers, un classement est eclate en trois colonnes, « Autre » vit ailleurs
que la liste a laquelle il appartient. Le FormDef, lui, sait tout cela.

- `shared/synthese.js` — **calcul pur**, sans HTML ni Grist : chiffres de tete,
  stats d'echelle, scores de classement, frequences, verbatims, lieux. Testable
  sans ecran, reutilisable derriere un export ou une page publiee.
- `shared/synthese-vue.js` — **mise en page seule**. Si un chiffre est faux, il
  l'etait avant d'arriver.
- **`options.polarite`** (`satisfaction | besoin | preference`) : ce que « haut »
  veut dire sur une echelle. Sans elle, « Les espaces sont agreables » et
  « Il faudrait ajouter des places » se rangent ensemble, alors qu'un 5 est une
  bonne nouvelle dans un cas et une demande dans l'autre. Les 35 echelles de
  l'enquete la portent, reprise du questionnaire ecrit a la main.
- **Le `n` ne quitte jamais le pourcentage** : « 70 % » sur quatre reponses et
  « 70 % » sur deux cents ne disent pas la meme chose.
- **Un classement se lit en points**, pas en pourcentage : afficher « 100 % »
  pour le premier laisserait croire que tout le monde l'a cite.
- Ecran « 5. Synthese » du compositeur, en lecture seule.

**Ce qu'on ne fait pas, volontairement** : des graphiques, des croisements, des
agregats libres. Grist les fait mieux. Ce qui lui manque, et qui est ici, c'est
le sens que seul le FormDef porte.

Eprouve en Grist reel le 05/10/2026 sur 25 reponses.

### Un canevas qu'on compose (05/10/2026)

`widget: 'dessin'`, sur une colonne `Attachments`. **Ce n'est pas une
illustration, c'est une reponse** : on demande d'entourer le desordre sur une
photo, de croquer une implantation, de signer un constat.

- **Le dessin est garde comme une liste de traits en coordonnees 0–1**, jamais
  comme des pixels. Une annotation faite sur un telephone de 360 px doit se
  retrouver au bon endroit sur l'image exportee, qui en fait 1200 ; le
  formulaire se redessine a chaque reponse, et sans modele le croquis
  disparaitrait au premier changement d'avis ; « annuler » ne s'improvise pas
  sur des pixels.
- **Le fond fait partie de l'image produite** : ce qui arrive dans la base est
  ce que la personne a vu, pas un calque illisible sans son support.
- **La signature n'est pas un croquis** : un seul geste (effacer), pas de
  palette, cadre plus large que haut. `options.dessin.usage`.
- **Le PNG est depose dans un champ fichier cache** (`DataTransfer`) : la
  lecture, le plafond du nombre de pieces jointes et le televersement a l'envoi
  restent ceux des fichiers, sans un cas de plus dans le moteur.
- **Un canevas ne se remplit pas au clavier.** Le compositeur le dit : ne rendre
  la question obligatoire que si la reponse peut aussi se donner autrement.

Eprouve au banc puis en Grist reel le 05/10/2026 : a l'envoi, les colonnes
`Attachments` recoivent bien leurs pieces jointes.

### Tracer une ligne, une surface (05/10/2026)

La saisie `geometrie` en `LineString` / `Polygon` etait ecrite depuis la veille
et n'avait jamais ete essayee : l'enquete du 4e ne demande que des points. Elle
ne marchait pas, et **chaque defaut en cachait le suivant** — detail et mesures
dans `tests/bancs/README.md`.

- **L'adaptateur de terra-draw publie un import nu** (`from "terra-draw"`).
  Atlas le resout par un `importmap` dans sa page ; le formulaire vit dans une
  page qu'il n'a pas ecrite (widget, compositeur, page publiee). Il pointe donc
  l'import lui-meme, sur le module qu'il vient de charger.
- **Le trace ecrit sa geometrie directement** : il passait par la fonction des
  points, qui relit un etat que le trace venait de vider.
- **On ecoute `change`, pas seulement `finish`** : qui ne trouve pas le geste de
  terminaison croit avoir repondu et n'a rien ecrit.
- **On ne retient que la forme demandee** dans `getSnapshot()`, qui rend aussi
  les sommets de guidage.
- **Le controle de forme vient apres la normalisation d'Atlas** : au premier
  clic, terra-draw tient deux sommets confondus que la normalisation ramene a
  un seul.

Eprouve au banc le 05/10/2026 : point, ligne a trois sommets, surface fermee.

### Le bandeau et la page d'accueil (05/10/2026)

Un questionnaire ne commence pas par sa premiere question. Il commence par ce
qui permet de decider d'y repondre : qui le publie, pourquoi, pour combien de
temps, et ce qu'il advient des reponses. Le moteur avait reduit cela a un
en-tete pose au-dessus de la premiere etape, ou il se lisait comme un titre de
section parmi d'autres.

- **`branding.organisation` / `organisationDetail`** : le bandeau, qui **reste a
  l'ecran du debut a la fin**. Une personne arrivee par un lien partage ne sait
  pas qui l'interroge ; a la septieme etape, elle ne s'en souvient plus.
- **`accueil`** : `titre`, `texte`, `dureeMinutes` + `dureeTexte`, `encarts`
  (`ton: attention | discret`), `bouton`. Un ecran a part : la progression y est
  masquee, « Precedent » y ramene depuis la premiere etape.
- **Le gras seul** : le texte est echappe, puis `**ceci**` devient `<strong>`.
  Ouvrir le HTML a qui compose, c'est l'ouvrir a qui saurait s'en servir.
- **Le chrono part au clic sur « Commencer »**, pas a l'ouverture : lire la
  presentation n'est pas repondre. `meta.timestampCol` et `meta.durationCol` se
  remplissent seuls a l'envoi (en secondes) — la duree annoncee se verifie au
  lieu de se reconduire d'une enquete a l'autre. `meta.emailCol` recoit le
  courriel de la personne que l'hote connait (a la creation seulement, jamais
  demande, vide sinon). `options.precisionCol` d'un lieu note la precision du GPS
  en metres. Le compositeur regle les trois (accueil, et reglages du lieu) et
  `ensure-schema` cree les colonnes.
- **On remonte jusqu'au bandeau** en changeant d'etape, pas jusqu'au titre :
  s'arreter au titre poussait hors de l'ecran l'enseigne et l'avancement. La
  barre de progression est `sticky`.

Repris du questionnaire ecrit a la main (document `(document de travail)`, widget
*Custom widget builder*). Eprouve en Grist reel le 05/10/2026 : accueil,
« Commencer », etape 1 avec bandeau et avancement, retour a l'accueil.

### Illustrer une question (04/10/2026)

Une question ne se comprend pas toujours avec des mots : « classez ces cinq
lieux » suppose qu'on sache où ils sont. `options.illustration` pose quelque
chose **avant** la saisie, pour n'importe quelle question — échelle comprise.

| `type` | Ce qui s'affiche | Garde-fous |
|---|---|---|
| `image` | une image, URL ou fichier déposé (`data:`) | `alt` réclamé ; adresses exécutables refusées ; dépôt plafonné à 400 Ko |
| `carte` | la carte d'Atlas, avec des repères étiquetés A, B, C… | aucune réponse n'y est écrite ; les repères se posent au clic dans le compositeur |
| `inclusion` | une page entière : vue Grist, tableau de bord, **autre widget** | `https` seulement, bac à sable sans `allow-same-origin`, `loading="lazy"` |

L'inclusion est le geste d'Artefactory ramené au formulaire : le répondant
décide **devant** le contexte au lieu de l'avoir lu ailleurs une heure plus tôt.
Éprouvé en Grist réel le 04/10/2026 — l'étape « Les lieux à traiter en
priorité » porte la carte des cinq lieux, et la question suivante charge le
widget Artefactory du dépôt dans le formulaire.

### Le compositeur, après l'essai en Grist réel (04/10/2026)

- **Trois colonnes, trois rôles nommés** : *Parcours* (les étapes), *Aperçu*
  (le formulaire tel que le public le verra), *Réglages* (le sujet de l'action,
  dit en toutes lettres). « Étape 1 » s'affichait trois fois, du même poids.
- **La colonne se choisit dans une liste**, et ses options sont celles de la
  colonne — montrées en lecture seule, jamais retapées. Les colonnes calculées
  et `manualSort` ne sont pas proposées : on ne peut pas y écrire.
- **Quitter un formulaire modifié se demande** (`S.dirty` servait à rien).
- **Le plan du formulaire** (menu ⋯) montre les 61 questions d'un coup.
- **L'aperçu se regarde en téléphone** : c'est là que le public répondra.
- **Le harnais E2E a quitté le widget** (`tests/e2e-hook.js`, chargé sur
  `?e2e=1`) : il écoute les messages du parent, il n'a rien à faire dans un
  formulaire en service.

### Livré
- Wizard Créer / Brancher ; templates (Satisfaction = chemin recontact)
- Binding complet + `visibleCol` méta
- Chemins d’étapes + conditions champ (ET/OU, opérateurs FR, infobulles `?`)
- **Contexte & audience** :
  - `session-context.js` : `inGristWidget`, `isLoggedIn`, `userEmail`, `groups`
  - Conditions `source: context | audience | field`
  - Accueil : case « Réserver des questions… » + table email/groupe (détection auto, selects par type)
  - **Reconnaître la personne connectée** : coche → `audience-setup.js` applique `ModifyColumn` (formule `user.Email`, trigger nouvelles lignes)
- Cascade Ref→Ref ; filtre dynamique Choice/Text→Ref ; filtre Ref→même table (`parentResolve: refRow` + `parentValueColumn`)
- Publish intra-doc ; Survey Manifest ; Attachments (upload depuis une vue custom : vérifié le 18/09/2026)
- UX : slides Accueil/Fin, branding, placeholders, libellés inline

### La vue publiée ajoute une ligne — trois corrections (04/10/2026)

Mesuré en Grist réel : la page « Remplir » **écrasait** la ligne sous le curseur.
Le bouton disait « Envoyer », aucune ligne n'était créée, et la ligne 1 prenait
la place de la réponse. L'amorçage suivait `onRecord` sans jamais lire la ligne.

| Avant | Maintenant |
|---|---|
| suit le curseur en silence, formulaire vide | **ajoute une ligne**, sauf si le formulaire demande le contraire (`editerLigneSelectionnee`, case en options avancées) |
| en correction, champs vides → la ligne se vidait | la ligne entre dans le formulaire (`FormEngine.valuesFromRecord`), et `onNewRecord` revient à la création |
| « Remettre en ligne » créait une page de plus, l'ancienne restant en service avec l'ancienne version | la page publiée est **réutilisée** (`PublishedSectionRef`, recréée si elle a été supprimée) et porte le titre du formulaire (`CreateViewSection` ignore le nom qu'on lui passe) |

`valuesFromRecord` est le sens inverse de `Types.coerceForWrite` : il manquait au
moteur, et chaque hôte l'avait réécrit pour lui. Les dates sont le point
délicat — une `Date` se rend en UTC (minuit), un `DateTime` dans l'heure de la
personne, parce que c'est ainsi que `coerceForWrite` les relit.

**La `Def` enregistrée ne porte plus de clés internes** (`defPropre`) : le
compositeur marquait ses champs (`_colIdLocked`) et `formdef.schema.json`
interdit toute clé qu'il ne déclare pas. Un lecteur strict rejetait donc des
formulaires que ce dépôt avait lui-même écrits.

### Tables liées — `shared/liens-table.js` (04/10/2026)

Un formulaire qui **ajoute une ligne rattachée** à une autre : les heures d'une
tâche, les visites d'un ouvrage, les dépenses d'une catégorie, les points
dessinés d'une enquête. Atlas le fait depuis sa 1.12.0 pour la carto ; le motif
n'a rien de cartographique, et ce module en porte la part générique — sans
dépendre d'Atlas, qu'on ne touche pas.

Il ne fait rien d'autre que rendre des identifiants, des actions et des refus :
`tablesLiees` (reconnaître avant de créer), `planTableLiee`, `planLignesLiees`,
`messageRefus`.

**Quatre faits mesurés en Grist réel** (1.7.18, document anonyme, 04/10/2026) :

| Fait | Conséquence |
|---|---|
| Un lot d'actions est **atomique** : si la seconde échoue, la première est annulée | la table et sa colonne inverse partent ensemble |
| Une ligne créée dans un lot **ne peut pas y être désignée** — son id n'est rendu qu'au retour | le parent s'écrit avant ses enfants, en deux envois ; jamais l'inverse |
| Cinq lignes d'un coup : **105 ms**, contre **535 ms** une par une | `planLignesLiees` groupe en un `BulkAddRecord` |
| Sans colonne inverse, Grist **accepte** un rattachement vers la ligne 999 ; avec elle, il le **refuse** | `AddReverseColumn` est un garde-fou autant qu'un confort : le parent liste ses enfants sans formule |

Un rattachement vide (`0`) reste accepté par Grist : c'est au formulaire de
refuser, parce que le lien est un **fait du contexte** — l'objet ouvert, la
ligne du curseur — et jamais une question posée à la personne.

Éprouvé de bout en bout sur un document réel : table et colonne inverse créées,
deux lignes écrites en une action, parent qui les liste (`['L',1,2]`), orphelin
refusé, document remis en état.

### Validation live
Checklist : `docs/MANUAL_TEST.md` §4–5. Guide publication : `docs/PUBLICATION.md`.

### Publication GitHub Pages

```bash
npm run promote:grist-forms   # projects/ → published/grist_forms/
npm run manifest
```

Widget catalogue : `grist_forms/builder.html` (accès **full**).

### Hors scope / différé
- Géo, **BlockNote**, collab ; goto explicite entre étapes
- Promote `published/` : sur demande

### Piste future (étude séparée)
Binding BlockNote formulaires (offre de service) : **cadré** — voir les spécifications du projet et `.wikichat/knowledge/grist-forms-blocknote-binding-axis.md`. Ce projet = référence technique (`FormDef`, `ensureSchema`, publish, survey-project.js).

### Attachments depuis une vue custom — ça passe (18/09/2026)

La note différée disait : « `POST …/attachments` depuis vue custom hors origine →
CORS ». **C'était faux.** Mesuré dans un widget servi depuis une autre origine,
avec un jeton `readOnly: false` : sans `X-Requested-With`, la protection CSRF de
Grist rend un 401 **sans en-têtes CORS**, que le navigateur masque en
`net::ERR_FAILED` — exactement comme un refus d'origine. Avec l'en-tête, la pièce
jointe est créée. C'est le comportement par défaut d'`uploadFiles` (voir
`simpleUpload`), et c'est ce que fait SURFAC²E.

**Le moteur n'envoie plus forcément lui-même.** `deps.uploadFile(fichier)` —
transmis par `bridge.uploadFile` — laisse l'hôte verser le fichier et rendre les
ids. C'est le seul chemin praticable hors navigateur : l'application de terrain
émet par le client HTTP natif de Capacitor, où aucune règle d'origine ne
s'applique. Sans ce point d'entrée, il aurait fallu dupliquer le moteur.

**Un champ fichier laissé vide ne vide plus la colonne.** `resolveAttachmentFields`
écrasait par `null` toute valeur qu'il ne savait pas lire — dont le chemin d'une
photo posé par QField sur une colonne texte. Enregistrer la fiche sans toucher à
la photo effaçait donc la donnée. Une valeur illisible est maintenant laissée
telle quelle.

## Audience — rappel UX

| UI (Accueil) | Rôle |
|--------------|------|
| Réserver des questions… | Active `audience.mode=bind` |
| Table / colonnes email & groupe | Liste personnes pour conditions |
| Reconnaître la personne connectée | `audience.probe=true` + formule auto sur colonne email |

Conditions ≠ ACL : masquage UX seulement ; droits réels = règles Grist.

## Ouverture

```bash
npm run serve:dev
# → http://localhost:3001/grist_forms/builder.html
```

Widget Grist → cette URL, accès **full**. E2E auto : `?e2e=1` uniquement.


## Retours d'usage du 23/10/2026 (inscription à des ateliers)

- **Nom, prénom, courriel** : formats `nom` (MAJUSCULES), `prenom` (initiales), `nomComplet` (un champ), `courriel`
  (minuscules), contrôlés en JavaScript **et en Python** (même verdict, essais exécutés) ; la forme corrigée se montre
  dès qu'on quitte le champ. **Un nom se corrige, il ne se refuse pas** : `validation.mode: 'corriger'` (réglage de départ des
  types de nom) remet en ordre initiales et espaces sans jamais bloquer (un seul mot, une particule, une apostrophe) ; ce qui
  porte déjà une majuscule au milieu (« McDonald ») n'est pas touché ; sans `mode`, le refus d'avant reste. Un **groupe de questions** (`groupes` + `options.groupe`) range les questions qui se suivent
  sous une légende, en grille adaptative ; le geste « Nom, prénom et courriel » du compositeur le crée.
- **Limites** (`limites`, `docs/LIMITES.md`) : le formulaire lit ce qui est pris, annonce les places, ferme ce qui est
  plein, relit à l'envoi ; la colonne `Place` (formule d'ordre d'arrivée, une liste d'attente ne prend la place de
  personne) tranche quand deux envois se croisent. Une table illisible ne bloque personne et n'invente aucun chiffre.
- **Qui voit les réponses** (`docs/EXPOSITION.md`) : un formulaire dans le document est une page de ce document ; ses
  participants en sont éditeurs. Le compositeur propose trois réglages et pose des règles d'accès **sur confirmation
  seulement**, sans jamais modifier une règle existante. **Grist refuse une règle placée après une règle sans condition** :
  une seule règle finale (`+C-RUDS`). **Mesuré en réel (23/10/2026, mode public)** : un anonyme en rôle Éditeur ajoute une ligne,
  ne lit que la colonne `Place`, ne peut ni modifier, ni supprimer, ni toucher à la structure ; non mesuré avec un compte
  connecté non propriétaire (voir `docs/ETUDE-MODES-ET-ACCES.md`).
- **Document partagé avec le public** : la case de l'écran « Qui voit les réponses ? » impose « tout le reste caché »
  (sinon un anonyme pourrait modifier la structure des autres tables) ; une règle `*`/`*` déjà fermante est gardée telle
  quelle. Le partage public lui-même reste l'affaire d'un propriétaire.
- **Une seule réponse par personne** (`limites.unique`) : la table tranche (`Doublon` dans la colonne `Place`), le
  formulaire ne lit jamais le courriel des autres. **Le formulaire compte les places d'après `Place`** (lisible sans rien
  révéler) : une liste d'attente ou un doublon ne ferme pas le formulaire à tort.
- **Maximum par choix dans la question** (`Nombre de réponses par choix`) ; vocabulaire des limites neutre (rien n'est
  propre aux « ateliers ») ; messages par défaut génériques.
- **Compositeur** : un redessin ne déplace plus la fenêtre ni les zones qui défilent (`DEFILEMENTS`, hauteur figée),
  mise en page pleine hauteur sans défilement de fenêtre, trois colonnes dès 58 rem ; `colonnesExistantes()` lit toutes
  les colonnes (formules comprises) pour ne pas recréer `Place` à chaque enregistrement ; une colonne créée
  automatiquement est une colonne de données (`isFormula: false`), pas une « colonne vide » ; une question sans colonne
  ne fait plus refuser toute la ligne (`KeyError ''`).
- **Régler une question en cliquant dessus** : la carte entière l'ouvre (la roue reste).
- **Conditions « est renseigné » / « n'est pas renseigné »** (`empty`, `notEmpty`, sans valeur) offertes pour tous les types : « différent de (vide) » reste vrai tant que la personne n'a rien répondu (la valeur n'existe pas), donc ne cache rien. C'est le moyen de n'afficher une question qu'après une autre.
- **Reconfigurer après la première mise en ligne** : la formule de `Place` est remplacée quand les limites changent, si elle porte la marque `# Généré par Form Builder` (`ensure-schema.js`, action `ModifyColumn`) ; les règles d'accès se mettent à jour **en place** (`FormAcces.actionsMiseAJour` : seule la liste des colonnes lisibles change, aucune règle retirée, jamais d'état sans protection ; bouton « Mettre à jour les règles »). Les deux ne suivaient pas un changement fait après la première mise en ligne.
- **Statut après l'envoi** : `engine.js` relit sa ligne (identifiant renvoyé par l'ajout) et dit `retenue` / `attente` / `doublon` d'après `placeCol` (`FormLimites.statut`, phrases réglables dans `limites.messages`) ; toute difficulté laisse l'écran de fin inchangé. Statut **par ligne**, pas par question (voir `docs/ETUDE-STATUT-INSCRIPTION.md`).
- **Piège d'écriture** : les heredocs `python - <<EOF` transforment les séquences à antislash (retour à la ligne, escapes
  unicode) ; écrire les fichiers avec l'outil d'édition. Sous Windows, Python lit l'entrée standard en cp1252 :
  transmettre les échantillons de test en ASCII échappé.
