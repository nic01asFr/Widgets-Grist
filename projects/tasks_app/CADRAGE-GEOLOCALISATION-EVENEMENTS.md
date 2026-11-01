# Cadrage — géolocalisation, objets géographiques et formulaires depuis un évènement TaskFlow

*Étude du 01/11/2026, à la demande de Nicolas. Révisée plusieurs fois le même jour au fil des échanges —*
*voir l'historique des révisions en bas de document. Ce document reprend et détaille l'échange croisé WikiChat*
*(`#taskflow-atlas-formbuilder-evenement`, fils `taskflow-atlas-formbuilder-evenement` et `evenement-formulaire-carte`,*
*31/10–01/11/2026) et les relectures de code faites directement pour cette étude — pas seulement les comptes-rendus*
*des autres agents.*

**Sources vérifiées directement (pas supposées) :**
- `projects/Atlas/docs/CONTRAT-CARTE-BI.md` sur la branche `atlas/composant-bi` (non fusionnée) — lu via `git show`.
- `published/atlas/app.js`, `lib/grist-adapter.js`, `lib/geo-tables.js`, `lib/schema-grist.js`, `lib/nouvelle-couche.js` (Atlas 1.33/1.34) — lus intégralement.
- `projects/grist_forms/shared/referentiel.js` et `shared/enrichir.js` sur `origin/main` — lus intégralement (API publique, dépendances, services).
- `projects/grist_forms/shared/dsfr-like.css` — vérification que `.fr-referentiel__*` suit déjà `var(--kit-accent, ...)`.
- `projects/grist_forms/runtime/formdef.schema.json` sur `origin/main` (options `referentiel`, `enrichir`, `saisieLieu`).
- `projects/grist_forms/docs/ETUDE-CRENEAUX-CALENDRIER.md`, `CLAUDE.md`, `shared/liens-table.js` sur `origin/main`.
- Le schéma réel de `Tasks` dans `projects/tasks_app/calendar.html` (`TASKFLOW_SCHEMA`) et `CLAUDE.md` de ce projet.
- Les comptes-rendus directs d'Atlas-BI et de Form Builder (`widgets-grist-forms`, `widgets-grist-1bc5`) sur WikiChat.

## Les cas identifiés

| Cas | Besoin | Toucherait TaskFlow ? | État |
|---|---|---|---|
| **A** | Une tâche concerne un enregistrement (géographique ou non) déjà présent dans le document — généralisé au-delà du seul objet géo | Table satellite `Rattachements` | **Implémenté et testé** (Kanban/Gantt/Calendar, branche `taskflow/themedef-compatible`) |
| **B1** | Un évènement a un lieu libre connu à l'avance (adresse de réunion) | Colonnes `Tasks.lieu`/`Tasks.geometrie` | **Implémenté et testé** (Kanban/Gantt/Calendar, branche `taskflow/themedef-compatible`) |
| **B2** | Chaque inscrit donne son propre lieu (ex. tournée) | Aucune — vit entièrement côté Form Builder | — |
| **C** | Voir sur une carte l'ensemble des tâches localisées | Aucun widget existant modifié — lot à part ou configuration | Non étudié en détail, dépend d'A |
| **D** | Réunion géolocalisée + formulaire d'inscription | Combine B1, coût marginal | Possible dès maintenant, B1 est fait |
| **E** | Trajets / tournées successives | Non étudié, reporté | — |

---

## Cas A — tâche liée à un enregistrement existant — IMPLÉMENTÉ, généralisé au-delà du géographique

**Besoin, généralisé le 01/11/2026 suite à une demande explicite de Nicolas.** L'étude initiale ne visait que les objets géographiques (« Réparer la vanne du réservoir X »). Nicolas a étendu la demande : « je propose de pouvoir rattacher un enregistrement grist quelconque à une tâche dans l'idée, et à repérer et pouvoir traiter et afficher les items géographiques » — c'est-à-dire **rattacher n'importe quelle ligne d'une table quelconque** (un objet d'un parc d'équipements, une entrée d'un référentiel, etc.), avec la détection géographique comme **classification en plus**, pas comme condition. On ne ressaisit pas une position ni une donnée, on **réfère** à la ligne.

Confirmé avec Nicolas : on rattache un **enregistrement** (une ou plusieurs lignes, individuellement), jamais une colonne entière.

**Contrainte posée explicitement par Nicolas le 01/11/2026 : TaskFlow doit fonctionner sans Atlas présent dans le document.** Le mécanisme retenu ne dépend donc d'aucune API ni composant d'Atlas — seulement de la **forme** des tables, détectée localement par TaskFlow lui-même.

### Historique court : deux voies explorées puis écartées

1. *Liaison native `grist.onRecord`/`setSelectedRows`* — vérifié par lecture directe du code publié d'Atlas : `published/atlas/app.js`/`lib/grist-adapter.js` n'appellent nulle part `onRecord`/`setSelectedRows`/`widgetApi`. Demanderait un développement neuf côté Atlas. **Écartée : dépend d'Atlas.**
2. *`<atlas-bi>` embarqué dans le panneau* (contrat carte BI 0.3) — confirmé faisable techniquement (testé en Chrome réel, voir plus bas), mais dépend de la présence du widget Atlas et de la publication de son contrat (branche `atlas/composant-bi`, non fusionnée). **Écartée pour la même raison.**

### Voie retenue : table pivot `Rattachements`, alimentée par un scan de schéma que TaskFlow fait lui-même

**Nom de la table, renommé en cours d'implémentation.** Conçue d'abord sous le nom `Liaisons` (voir ci-dessous), renommée en `Rattachements` avant d'écrire le premier code : `projects/referentiels/` a déjà une table `Liaisons` à lui, pour un usage différent (`lib/liaison.js`, contrat `liaison-referentiel/0.1`). Les deux widgets peuvent coexister dans le même document Grist — une collision de nom de table y aurait été réelle, pas seulement théorique. Repéré par une recherche croisée avant tout code, pas après.

**Détection des tables candidates — vendorée, pas une dépendance.** `scanGeoTables`/`detectGeometryColumn` (Atlas, `lib/geo-tables.js`, lus intégralement) lisent le **schéma** du document (jamais les données — Atlas a mesuré jusqu'à 100 Mo en téléchargeant pour chercher un simple nom de colonne) et reconnaissent une table géographique par ses colonnes :
- un nom de colonne parmi `geometry_json`, `geometry`, `geom`, `wkt` (insensible à la casse), **ou**
- une paire lat/lon : noms exacts d'abord (`lat`/`latitude`/`y`, `lon`/`lng`/`long`/`longitude`/`x`), puis approchants (`Latitude_WGS84`, `lat_gps`…), colonnes de données préférées aux formules (une table avait ses coordonnées dans des colonnes de données recopiées par des formules `latitude`/`longitude` — Atlas a appris à préférer la donnée).

TaskFlow reprend cette détection **mot pour mot** (mêmes alias, même ordre de préférence) directement sur `grist.docApi.fetchTable('_grist_Tables')`/`_grist_Tables_column`. Fonctionne identiquement qu'Atlas soit ouvert ailleurs dans le document ou totalement absent — c'est TaskFlow qui lit le schéma, pas Atlas qui le lui fournit. « Compatible à 100 % avec Atlas » signifie : mêmes conventions, mêmes résultats — **pas** une dépendance d'exécution.

### Schéma de `Rattachements`

Table satellite, **opt-in**, jamais dans `TASKFLOW_SCHEMA` :

| Colonne | Type | Rôle |
|---|---|---|
| `tache` | `Ref:Tasks` | la tâche — colonne inverse `Tasks.liaisons` (RefList) ajoutée via `AddReverseColumn` (garde-fou mesuré par Form Builder dans `shared/liens-table.js` : sans elle, Grist accepte un rattachement vers une ligne inexistante ; avec elle, il le refuse) |
| `tableCibleRef` | Numeric | **id stable** de la table cible — `_grist_Tables.id`, **jamais** son nom affiché. Vérifié dans `lib/schema-grist.js` d'Atlas : Grist distingue un id de ligne stable (`_grist_Tables.id`) du nom affiché (`tableId`, renommable) ; Atlas s'en sert déjà pour résoudre ses propres couches (`nomParRef`), TaskFlow reprend la même technique |
| `tableCibleNom` | Text | nom affiché, mis en cache pour l'affichage — se rafraîchit à la lecture suivante, jamais la clé réelle du lien |
| `ligneCibleId` | Numeric | id de ligne Grist dans la table cible |
| `cleCible` | Text | libellé humain figé au moment du lien (valeur de la colonne `nom`, convention déjà posée par Atlas — `colonnesNouvelleCouche` crée toujours une colonne `nom`) ; sert de repli d'affichage si l'objet disparaît |
| `creeLe` | DateTime | traçabilité |

### Fiabilité des données — chaque risque, sa réponse

1. **Table renommée** : `tableCibleRef` (id stable) résout toujours la bonne table ; `tableCibleNom` se rafraîchit sans casser le lien.
2. **Objet supprimé** : rien ne l'empêche nativement (ce n'est pas une vraie `Ref`, Grist ne valide pas la paire table+ligne). TaskFlow vérifie à l'ouverture que `ligneCibleId` existe encore dans la table cible ; sinon, affiche `cleCible` grisée/barrée plutôt que de planter.
3. **Tâche supprimée** : une `Ref` ne cascade pas en Grist. Les lignes `Rattachements` de la tâche doivent être supprimées dans le **même lot** `applyUserActions` que la suppression de la tâche. **Implémenté** : `confirmDelete(mode)` étend `plan.actions` avec un `RemoveRecord` par ligne `Rattachements` dont `tache` est dans `plan.removed`.
4. **Doublon** (même tâche liée deux fois au même objet) : pas de contrainte d'unicité native — vérification applicative avant création, sur les lignes déjà chargées.
5. **Atomicité** : créer la ligne `Rattachements` dans le même lot que toute autre action liée. Motif mesuré par Form Builder (`shared/liens-table.js`, quatre faits mesurés en Grist réel) : un lot d'actions est atomique ; une ligne créée dans un lot n'est désignable (son id) qu'au retour, jamais réutilisable dans ce même lot — le parent s'écrit avant ses enfants, en deux envois.
6. **Jamais d'écriture dans la table cible** : `Rattachements` ne fait que la lire — même principe que « Atlas n'écrit jamais dans les données de l'hôte » du contrat BI.
7. **Plusieurs objets par tâche, plusieurs tâches par objet** : géré nativement par la table pivot (plusieurs lignes `Rattachements`), aucune limite à ajouter.

### Les tables propres à TaskFlow sont exclues du picker — décision du 01/11/2026

Nicolas, après le premier essai en Grist réel : « on ne listera pas les tables système de TaskFlow non ? c'est pas utile il s'agit là de venir brancher des objets tables externes au projet ». `Rattachements` sert à brancher des tables **externes** (parc d'objets, référentiel...) — pas les tables propres à TaskFlow, qui ont déjà leurs champs dédiés (`assignees`, `projet`, `dependDe`, `parentTask`...) : les lister dans le picker aurait fait doublon avec des mécanismes déjà plus précis. `rattachScanTables()` exclut désormais `Tasks`, `Team`, `Projects`, `Rattachements`, `Disponibilites`, `Portefeuilles`, `TimeEntries` (constante `RATTACH_OWN_TABLES`), en plus des tables système Grist (`_grist_*`/`GristHidden_*`/`GristSummary_*`, déjà exclues). Revérifié en Grist réel après le fix : le picker ne propose plus que les tables genuinement externes (`Whiteboard_Elements`, `Table1`).

### Libellé d'affichage d'une ligne — heuristique en cascade

Pour une table externe arbitraire, le libellé humain d'une ligne (`cleCible`) est choisi par une cascade, pas une seule convention : colonne `nom` → `titre` → `libelle`/`name`/`label` → première colonne Texte/Choice non-formule → repli `#idDeLigne`. Cohérent avec les conventions déjà en place dans ce repo (`Team.nom`, `Projects.nom`, `Tasks.titre`), sans supposer que la table externe suit la convention Atlas (`nom`) à la lettre.

### Qui crée `Rattachements`, et à quelle condition

**TaskFlow**, comme pour `Portefeuilles`/`TimeEntries` — jamais au chargement du document.

- La section **« OBJET »** du panneau s'affiche dès qu'il existe au moins une table candidate dans le document (scan schéma, pas cher, à chaque ouverture de panneau) **ou** que la tâche a déjà des liaisons existantes — pour ne jamais faire disparaître un lien déjà posé si les conditions changent entre-temps.
- La table `Rattachements` elle-même n'est créée qu'au **premier clic réel** sur « Lier un objet » dans tout le document (`ensureRattachementsSchema()` : `AddTable` + `AddReverseColumn`, un seul lot), avec une **confirmation explicite** avant création — même prudence que pour `Portefeuilles` (`TF.confirm` → `ensurePortefSchema`).
- Un document qui n'ouvre jamais ce lot reste à zéro table, zéro colonne — même garantie que partout ailleurs dans ce cadrage.

### UI (sélection en deux temps) — implémentée

1. **Table cible** : liste des tables candidates détectées par le scan, hors tables propres à TaskFlow (voir plus haut) ; icône `pin` (même SVG que le badge lieu) devant les tables détectées comme géographiques, triées avant les autres.
2. **Ligne dans cette table** : affichée par le libellé en cascade (voir plus haut), avec recherche texte (`rattachFilterInput`) et bouton retour vers l'étape 1.

Réutilise intégralement les classes CSS existantes `.multi-select`/`.multi-select-dropdown`/`.multi-select-option`/`.multi-select-chip` (déjà utilisées pour les sélecteurs assignés/parent) — **aucun CSS nouveau**. Section « OBJETS LIÉS » insérée entre PARENT et ASSIGNÉS dans le panneau, masquée pour une tâche non encore créée (`!panelState.isNew`).

**Bug trouvé et corrigé en testant en Grist réel : le picker se refermait au clic sur une table au lieu de passer à l'étape « lignes ».** Cause : `rattachPickTable()` remplace `innerHTML` de `#rattachDropdown` de façon synchrone dans le gestionnaire de clic — ce qui détache le nœud cliqué du document **avant** que l'écouteur global « fermer au clic extérieur » (qui teste `e.target.closest('.multi-select')`) ne s'exécute à son tour ; sur un nœud détaché, `closest` renvoie `null`, et le code de fermeture s'exécute à tort. Corrigé en ajoutant `event.stopPropagation()` dans les `onclick` inline concernés (choix d'une table, bouton retour), dans les 3 widgets. Revérifié en Grist réel : transition table→lignes, recherche, sélection, écriture et persistance au rechargement, tous fonctionnels.

**Implémenté et testé en Chrome réel, dans le vrai document Grist partagé** (`grist.numerique.gouv.fr`) : création de la table `Rattachements` au premier clic (confirmée présente avec son schéma exact), rattachement d'une tâche (« Livraison ») à une ligne de `Whiteboard_Elements`, lu et supprimé ensuite — la ligne `Rattachements` correspondante disparaît bien après `rattachRemove()`. `node scripts/build-taskflow.js --check` reste au vert (le code du picker est entièrement hors des marqueurs `<taskflow-core>`).

**`Whiteboard_Elements` n'est pas exclue du picker — vérifié dans le code réel du whiteboard (01/11/2026, pas seulement sa doc, partiellement obsolète sur ce point).** `projects/whiteboard/index.html` déclare dans `SCHEMA` deux colonnes `Ref` natives, réellement codées (pas un item de roadmap) : `TaskRef` (→ `Tasks`) et `ProjRef` (→ `Projects`), créées automatiquement si la table cible existe. Ce sont des relations à **sens unique et cardinalité 1** : un élément (sticky/zone) représente **une seule** tâche/projet, posée **depuis le whiteboard** (panneau de propriétés, pilote `grist.setSelectedRows`, centre le canevas). `Rattachements` est l'inverse : une tâche référence **plusieurs** lignes de `Whiteboard_Elements`, posé **depuis le panneau de la tâche**, sans ouvrir le whiteboard. Les deux mécanismes ne se recouvrent pas — contrairement à `Tasks`/`Team`/`Projects` (exclues parce que `assignees`/`projet`/`dependDe` couvrent exactement le même besoin), rien côté whiteboard ne permet de lister depuis une tâche plusieurs éléments qui la concernent. `Whiteboard_Elements` reste donc traitée comme une table candidate normale.

### Essai en Chrome réel du 01/11/2026 (sur l'ancienne voie `<atlas-bi>`, conservé pour mémoire — plus la voie retenue)

Avant ce pivot vers `Rattachements`, la voie `<atlas-bi>` embarqué avait été testée avec succès : servi depuis le worktree en lecture seule `atlas/composant-bi` (`.worktrees/atlas-bi`), via la démo officielle `demos/hote-bi/element.html`. Piège trouvé et résolu : l'entrée `index.html` ne gère pas `?bi=1` (c'est `app.js` qui est chargé, pas `app_v7.js` — la détection du mode BI est dans `app_v7.js`, chargé par `index_v7.html` ; il faut `?atlas=../../index_v7.html` en développement). Une fois la bonne entrée utilisée : mode BI confirmé à l'écran (carte à plat, sans chrome, pas d'appel `grist.ready()`), un clic simulé sur un point synthétique a déclenché `atlas-bi-select` avec `{"layer":"points","featureId":40,"key":"P40"}`, point surligné à l'écran. **La voie fonctionne techniquement — elle a été écartée pour une raison de dépendance (Atlas doit être présent et son contrat publié), pas de fiabilité technique.**

---

## Cas B1 — lieu libre connu à l'avance (adresse de réunion) — IMPLÉMENTÉ

**Besoin.** Une tâche `type='reunion'` a un lieu physique fixé à la création (pas un objet existant) — ex. « Réunion de chantier, 14 rue des Lilas ».

**Architecture réelle de Form Builder, vérifiée directement dans le code (`origin/main`) — trois modules séparés, orchestrés par `runtime/engine.js` sur une question `kind: 'geometrie'` :**

| Module | Rôle | Dépendance | Réutilisable par TaskFlow ? |
|---|---|---|---|
| `shared/referentiel.js` | Autocomplétion d'adresse (BAN, Géoplateforme) sur un champ texte existant | **Aucune** (ni Grist, ni Atlas — UMD, le module le dit lui-même : « il ne dessine pas le formulaire et ne connaît pas Grist ») | **Oui, tel quel — fait** |
| `shared/enrichir.js` | Enrichissement inverse d'un point déjà choisi : adresse, commune/INSEE/département, bâtiment (RNB), altitude, risques (Géorisques) | **Aucune** — 5 services publics IGN/État, CORS ouvert, sans clé | **Oui, en option — pas fait** |
| `shared/carte-geometrie.js` | Dessin sur la carte (terra-draw) | **Couplée à Atlas** | Non — pas nécessaire pour ce cas |

**Schéma — révisé le 01/11/2026 (soir), DANS `TASKFLOW_SCHEMA`, pas opt-in :**
- `Tasks.lieu` (Text) — adresse lisible
- `Tasks.geometrie` (Text, WKT `Point`) — même convention que Form Builder/Atlas

**Pourquoi une exception au principe opt-in appliqué partout ailleurs dans ce cadrage (`charges`/`dateCloture`/`portefeuille`/`TimeEntries`, jamais dans `TASKFLOW_SCHEMA`).** Remarque de Nicolas : le type « Réunion » n'est lui-même jamais opt-in (le pill est toujours visible), et tout ce qu'il change d'habitude — Ordre du jour, Participants, Points à traiter — fonctionne sans activation, parce que ça réutilise des colonnes qui existent déjà (`description`, `assignees`, `subtasks`). Faire de LIEU un geste à part aurait été la seule incohérence du type. Coût du choix : `ensureSchema()` tournant à chaque chargement, dans **tous** les documents TaskFlow (pas seulement celui-ci — widget publié, réutilisé ailleurs), `lieu`/`geometrie` sont désormais ajoutées automatiquement à la table `Tasks`, utilisée ou non — deux colonnes texte inertes si jamais utilisées, pas un vrai poids.

**Implémenté le 01/11/2026 sur la branche `taskflow/themedef-compatible`** (Kanban, Gantt, Calendar) :
- `Tasks.lieu`/`Tasks.geometrie` ajoutées à `TASKFLOW_SCHEMA.Tasks` dans les trois fichiers — créées automatiquement par `ensureSchema()` (déjà appelé à chaque chargement), comme les colonnes de base.
- `referentiel.js` vendoré tel quel en haut de chaque fichier (UMD, copié depuis `grist_forms/shared/referentiel.js`, zéro adaptation de dépendance).
- Section « LIEU » dans le panneau, visible dès que `type === 'reunion'` (plus de geste d'activation séparé — une première version avait un bouton « Activer » avec confirmation, motif `ensurePortefSchema`, retirée après ce choix).
- `FormReferentiel.monter()` sur le champ (`wireLieuInput()`, rattaché à chaque rendu du panneau, détruit à la fermeture pour éviter les requêtes en vol).
- `onChoisir` écrit `lieu` + `geometrie` (`POINT(lon lat)`) via `updateField`.
- CSS `.fr-referentiel__*` adapté aux variables TaskFlow (`var(--card-bg)`, `var(--border)`, `var(--primary)` — déjà compatibles `--kit-*`), sans charger `dsfr-like.css`.
- Badge (icône `pin`, SVG) sur la carte Kanban si `lieu` est renseigné, généralisé à tout item localisé (pas seulement les réunions) — voir ci-dessous.

**Testé en Chrome réel, dans le vrai panneau Kanban** (pas une démo isolée) : saisie « 14 rue des Lilas Marseille » → vraie requête réseau à la BAN → vraies suggestions → sélection → `tasks[8].lieu`/`geometrie` écrits (`POINT(5.353719 43.350253)`) → badge visible sur la carte. Gantt et Calendar vérifiés visuellement (même rendu, section identique).

**Testé dans un vrai document Grist de production** (`grist.numerique.gouv.fr`, widget pointé sur le serveur de dev) : le passage d'une tâche en type Réunion a d'abord montré le bouton « Activer » (version intermédiaire), confirmé déclencher un vrai `AddColumn` sur le document (colonnes `Lieu`/`Géométrie` vérifiées présentes dans la table) ; **après le passage en `TASKFLOW_SCHEMA`, un rechargement à froid du widget crée les colonnes sans aucun clic**, et la section LIEU s'affiche directement pour toute tâche de type Réunion. `node scripts/build-taskflow.js --check` reste au vert (seul du CSS/JS hors des marqueurs `<taskflow-core>` a été touché).

**Bug de persistance découvert et corrigé le 01/11/2026 (nuit), en revérifiant bout-en-bout dans le vrai document Grist.** `saveTaskToGrist()`/`createTask()` (Kanban/Gantt/Calendar) construisent le payload envoyé à Grist comme un littéral `record` écrit à la main, et `lieu`/`geometrie` avaient été oubliés de ce littéral lors de l'implémentation initiale — alors que `syncLocalTask()`, lui, recopiait bien ces champs dans le tableau local `tasks[]`. Résultat : la saisie s'affichait correctement partout (carte, panneau), mais n'atteignait jamais réellement Grist. Repéré en testant « taper une adresse → sélectionner une suggestion → recharger la page à froid → vérifier la grille » : `Lieu`/`Géométrie` restaient vides après rechargement malgré un badge visible avant. Corrigé dans les 3 widgets (ajout de `lieu`/`geometrie` aux deux littéraux `record`) ; revérifié avec exactement le même protocole, cette fois `Lieu` = « 20 Avenue de Ségur 75007 Paris » et `Géométrie` = `POINT(2.308628 48.850699)` survivent au rechargement.

**Icône du lieu, remplacée par un vrai SVG (pas un emoji) et généralisée à tout item localisé — 01/11/2026, suite à une demande explicite de Nicolas.** Le badge 📍 (emoji) a été remplacé par l'icône `pin` (SVG feather-style, 24×24, stroke `currentColor`) ajoutée à `UI_ICONS` dans `core/taskflow-core.js` (source unique, régénérée dans les 3 widgets par `npm run build:taskflow`). Piège rencontré : `UI_ICONS`/`uiIcon` sont déclarés **à l'intérieur de la fermeture du module `TF`** (`const TF = (function () { ... })();`), donc invisibles comme identifiants nus hors de ce module — le code applicatif des widgets (après la fermeture de l'IIFE, ex. `renderCard`, `buildBarContent`, le rendu du panneau) doit appeler `TF.ui.icon(name, size)` et non `uiIcon(...)` directement (sinon `ReferenceError` silencieusement avalé par la concaténation de chaînes, ou résultat `undefined` inséré dans le HTML). Dans le Calendrier, le titre d'évènement est construit avec `textContent` (pas `innerHTML`) : l'icône y est donc insérée comme un nœud `<span>` séparé (`addPin()`), jamais concaténée dans la chaîne de titre, sinon le SVG apparaîtrait comme texte littéral échappé. Le badge n'est plus restreint aux réunions : il s'affiche pour tout item (`t.lieu`/`task.lieu` vrai), carte Kanban, barre/jalon Gantt, chip d'évènement Calendrier, et aperçu sous le champ LIEU des 3 panneaux. Revérifié en Grist réel (Kanban + Gantt) : icône SVG correcte, aucune erreur console.

---

## Cas B2 — lieu propre à chaque inscrit

**Besoin.** Chaque personne qui s'inscrit à un évènement donne sa propre localisation (ex. une tournée où chacun indique son adresse de départ).

**Analyse.** Ce n'est pas une propriété de la *tâche* mais de la *réponse*. Form Builder a déjà l'enrichissement d'adresse par point/BAN (`referentiel.js`/`enrichir.js`, publiés sur `origin/main`). **Zéro impact TaskFlow** : aucune colonne, aucun code. À ne pas confondre avec B1.

---

## Cas C — carte d'ensemble des tâches localisées

**Besoin.** Une vue qui montre sur une carte toutes les tâches ayant une `geometrie`/une liaison `objet`.

**Non approfondi depuis la révision du Cas A.** L'ancienne analyse (deux voies : couche Atlas sur table arbitraire — demande un développement côté Atlas ; ou hôte externe avec le contrat carte BI — confirmé et mesuré mais demande d'écrire un hôte) reste valable dans ses grandes lignes, mais n'a pas été recroisée avec le nouveau modèle `Liaisons`. **Recommandation inchangée** : ne pas ajouter de rendu carte dans Kanban/Gantt/Calendar/Dashboard — la carte reste un widget/hôte à part. À reprendre une fois le Cas A codé, pas avant.

---

## Cas D — réunion géolocalisée + inscription

**Besoin.** Combinaison de B1 et du formulaire d'inscription Form Builder (déjà cadré séparément, ordre 1→2→3→4 accepté par les trois agents).

**Analyse.** Purement additif : B1 étant fait, Form Builder peut dès maintenant lire `Tasks.lieu`/`geometrie` en préremplissage passif pour afficher le lieu dans le formulaire d'inscription. **Coût marginal nul côté TaskFlow.**

---

## Cas E — trajets / tournées

**Non étudié.** Reporté — pas de décision à prendre maintenant.

---

## Ce qui ne change rien pour un document qui n'active aucun de ces lots

Comme pour `charges`/`dateCloture` (Plan), `portefeuille` (Portefeuille) ou `TimeEntries`/`Feuilles` (CRA) : aucune colonne/table de ce cadrage n'entre dans `TASKFLOW_SCHEMA`. Un document qui n'ouvre jamais un de ces lots reste à zéro colonne/table supplémentaire, zéro UI différente.

## Décisions prises avec Nicolas sur le Cas A (toutes tranchées, Cas A codé et testé)

1. Modèle `Rattachements` (table pivot, id stable de table) plutôt qu'une colonne `Ref` unique sur une seule table fixe — tranché le 01/11/2026, codé et testé le même jour.
2. Une tâche peut avoir **plusieurs** objets liés, chacun suivi individuellement (pas un objet par colonne) — confirmé explicitement par Nicolas, géré nativement par la table pivot.
3. Généralisé à n'importe quelle table externe, pas seulement géographique — la détection géo reste une classification (icône, tri), plus une condition d'accès.
4. Les tables propres à TaskFlow sont exclues du picker (`RATTACH_OWN_TABLES`) — le mécanisme sert à brancher des tables externes, pas à dupliquer les relations déjà modélisées dans `Tasks`/`Team`/`Projects`.
5. Rien sur C avant que A soit éprouvé plus largement (un seul document de test à ce stade).

## Historique des révisions (même journée, 01/11/2026)

1. Étude initiale : Cas A jugé bloqué (liaison `onRecord` à construire côté Atlas), Cas B1 jugé coûteux (champ riche à écrire).
2. Lecture directe du code d'Atlas et de Form Builder : `<atlas-bi>` embarqué dans le panneau confirmé faisable pour A (testé en Chrome réel) ; `referentiel.js`/`enrichir.js` trouvés directement réutilisables pour B1.
3. B1 implémenté et testé dans le vrai code de TaskFlow (Kanban/Gantt/Calendar).
4. Premier jet du Cas A implémenté en v1 minimale (`Tasks.objet` Text, saisie manuelle de la clé, sans sélecteur) — **jugé insuffisant par Nicolas** (aucune validation, clé libre sans garde-fou) et retiré de la discussion active.
5. Nicolas propose un modèle fondé sur la reconnaissance de tables géographiques compatibles, comme le fait Atlas. Vérifié : Atlas a bien ce scan (`lib/geo-tables.js`, schéma seul), vendorable. Conception du modèle `Liaisons` (table pivot, id de table stable, plusieurs tables/objets possibles) — **étudiée en détail, pas codée**, avec la contrainte explicite que TaskFlow doit fonctionner sans Atlas présent dans le document.
6. Nicolas généralise la demande : rattacher **n'importe quel enregistrement**, pas seulement géographique ; confirme qu'on rattache des lignes individuelles (une ou plusieurs), jamais une colonne. Compatibilité avec le modèle de données du whiteboard vérifiée avant de coder (`TaskRef`, complémentaire, aucun conflit).
7. Recherche croisée d'une collision de nom : `projects/referentiels/` a déjà une table `Liaisons` pour un usage différent. Renommé en `Rattachements` avant d'écrire le premier code.
8. Implémentation complète dans les 3 widgets (schéma opt-in, scan de tables, picker en deux temps réutilisant les classes `.multi-select*` existantes, suppression en cascade) ; bug de fermeture prématurée du picker (détachement DOM pendant la bulle d'évènement) trouvé et corrigé en testant en Grist réel.
9. Nicolas demande d'exclure les tables propres à TaskFlow du picker (`Tasks`/`Team`/`Projects`/`Rattachements`/`Disponibilites`/`Portefeuilles`/`TimeEntries`) — le mécanisme sert à brancher des tables externes, pas à dupliquer les relations déjà modélisées. Corrigé (`RATTACH_OWN_TABLES`) et revérifié en Grist réel : le picker ne propose plus que `Whiteboard_Elements`/`Table1`.
