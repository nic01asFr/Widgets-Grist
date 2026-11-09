# Comparaison — le panneau de tâche de TaskFlow et ce qu'un FormDef sait dire

État : brouillon de lecture, 09/11/2026. **Rien n'est écrit côté TaskFlow, rien n'est publié.** Établi en lisant `projects/tasks_app/kanban.html` (fonctions `openTaskPanel`, `renderPanelTask`, `updateField`), puis en comparant la structure de `gantt.html` et de `calendar.html` par leurs titres de sections et leurs libellés de propriétés. Je n'ai pas lu le détail du code de chaque panneau du Gantt et du calendrier : une divergence de comportement fin peut m'avoir échappé.

Objet : savoir si le panneau de tâche, recopié trois fois, peut être dit en FormDef, et ce qui reste à l'hôte. Usage prévu : la fiche sera dite en FormDef dans l'application appkit de TaskFlow (en parallèle, sans toucher à TaskFlow actuel).

## 1. Les trois panneaux sont la même fiche

Même ordre de propriétés (Statut, Priorité, Dates, Projet, Couleur, Parent, Assignés, Temps et charge, Progression) et mêmes sections (description, sous-tâches, prérequis ou checklist, détails avec tags et dépendances). Seule différence relevée : dans le Gantt, `Parent` vient avant `Couleur`. Le calendrier a en plus un panneau de période (`renderPanelPeriod`), qui n'est pas la fiche de tâche et reste hors de cette comparaison.

Conséquence : une seule définition de fiche suffit pour les trois vues.

## 2. Champ par champ

Colonnes lues dans `cloneTaskData` : `titre`, `description`, `type`, `priorite`, `statut`, `progression`, `dateDebut`, `dateEcheance`, `projet`, `assignees`, `dependDe`, `tags`, `estimationH`, `tempsPasse`, `subtasks`, `couleur`, `parentTask`, `charges`, `dateCloture`.

Légende : **D** = se dit directement en FormDef. **E** = demande une extension du moteur ou un crochet fourni par l'application. **H** = reste à l'hôte (application). **V** = vue dérivée, pas une saisie.

| Élément du panneau | Colonne | Classe | Remarque |
|---|---|---|---|
| Titre | `titre` | D | Texte. Le texte d'invite change avec le type (E léger, voir libellés) |
| Type (tâche, jalon, réunion) | `type` | D | Choix à trois valeurs. Il pilote ensuite la visibilité d'autres champs |
| Statut | `statut` | **E, indispensable** | Les valeurs viennent de la configuration du document (Choices de `Tasks.statut`, avec fait / annulé / actif) et un jalon n'en propose que deux. Une liste fixée dans le FormDef ne convient pas |
| Priorité | `priorite` | D | Quatre valeurs fixes (critique, haute, moyenne, basse) |
| Dates | `dateDebut`, `dateEcheance` | D | Deux dates. Pour un jalon, une seule (condition d'affichage) et l'échéance suit le début. Cette recopie est une dérivation à vérifier dans `derivation-valeurs.js` |
| Projet | `projet` | D | Référence. Le filtre « projets actifs » est un filtre de références |
| Couleur | `couleur` | à vérifier | Je n'ai pas vérifié qu'un widget couleur existe. Valeur nulle = couleur héritée du mode d'affichage |
| Parent | `parentTask` | **E, utile** | Référence à une autre tâche, mais qui exclut la tâche elle-même et ses descendants (`canSetParent`, pas de cycle) |
| Assignés / Participants | `assignees` | D, avec réserve | Liste de références. RefList n'est pas testée en écriture sur `Tasks`. Le libellé change avec le type |
| Temps estimé | `estimationH` | D | Nombre |
| Temps passé | `tempsPasse` | **E, indispensable** | En lecture seule quand la feuille de temps est active (`CRA_ACTIVE`) : lecture seule selon l'état du document |
| Charge par personne | `charges` | E | Colonne JSON : un nombre par assigné choisi. Ne se dit pas en FormDef aujourd'hui (groupe répété piloté par une sélection) |
| Progression | `progression` | D | Curseur de 0 à 100 avec crans. La couche `echelle` du schéma existe, à vérifier pour les crans 0, 25, 50, 75, 100 |
| Description | `description` | D | Texte long. Libellé variable : Description, Ordre du jour (réunion), Critères d'acceptation (jalon) |
| Checklist / Points à traiter | `subtasks` | E | Colonne JSON : liste d'éléments avec case cochée et texte. Aucune saisie « liste d'éléments » dans FormDef à ma connaissance |
| Tags | `tags` | à vérifier | Liste de textes. Je n'ai pas vérifié si c'est une ChoiceList |
| Dépendances | `dependDe` | **E, utile** | Liste de références qui exclut les tâches créant un cycle (`getAvailableDependencies`) |
| Date de clôture | `dateCloture` | E | Posée automatiquement au passage au statut terminal, effacée à la réouverture : dérivation dépendant du statut et de la config |
| Sous-tâches (hiérarchie), prérequis, tâches bloquées, charge consolidée, barre de progression | n/a | V | Vues dérivées, non saisies. Restent affichées par l'hôte |
| Flèches précédent / suivant | n/a | H (appkit) | L'ordre vient de la liste du maître-détail |
| Liens vers parent, dépendances, sous-tâches | n/a | H (appkit) | Navigation par adresse |
| Couleur d'un membre ou d'un projet | tables `Team`, `Projects` | H | Écritures dans d'autres tables que la tâche |
| Création et suppression, confirmation | n/a | H | Cycle de vie du panneau |

## 3. Les règles qui dépendent du type

Le type pilote presque tout : champs montrés ou masqués (priorité absente pour une réunion, temps et progression seulement pour une tâche, dépendances absentes pour un jalon et une réunion), libellés (description, assignés, invite du titre) et valeurs de statut offertes. Les **conditions d'affichage** de FormDef (`conditions-1.0`) couvrent la visibilité. Je n'ai pas vérifié qu'un **libellé** peut dépendre d'une condition. À défaut : plusieurs champs sur la même colonne, un par type, chacun visible pour son type.

## 4. Ce que ça demande, par ordre de besoin

Ordre donné par l'agent TaskFlow, repris tel quel :

1. **Statuts tirés de la configuration du document : indispensable.** La liste de valeurs vient du document, pas du FormDef. Appkit dit n'avoir pas vérifié que `options.refTable` couvre ce cas.
2. **Lecture seule par champ et par ligne, selon l'ACL et l'état de la tâche : indispensable.** Aujourd'hui le droit d'écrire se règle au niveau du formulaire entier (`etatSaisie` côté appkit). Les gardes ACL de TaskFlow (`TF.guardWrites`, `isReadOnly`) sont à reprendre.
3. **Parent et dépendances sans cycle : utile, moins urgent.** Exclusion de la tâche elle-même et de ses descendants.

Appkit propose un port optionnel `options.formulaires.<id>.crochets = { exclure(champ, ligne), choix(champ), lectureSeule(champ, ligne) }` fourni par l'hôte. Rien n'est écrit, et la forme n'est pas arrêtée.

À part, trois besoins qui ne sont pas des crochets : la charge par personne, la checklist et la dérivation de la date de clôture. Ils se règlent soit par une extension de FormDef (saisie « liste d'éléments », groupe répété), soit par un champ que l'hôte rend lui-même. Choix à ne faire que si un second hôte en a besoin.

## 5. Ce qui n'est pas vérifié

- **Deux moteurs de formulaire.** Appkit rend les FormDef avec son propre widget `formulaire`, pas avec le moteur de Form Builder. Les points ci-dessus valent pour l'un et l'autre, mais les crochets seraient à écrire dans celui qui servira. Décision de Nicolas attendue.
- Rien n'est essayé de bout en bout : aucun FormDef de fiche tâche n'a été écrit ni validé contre le schéma. Les classes D, E, H et V ci-dessus sont une lecture, pas une mesure.
- Détail du comportement des panneaux du Gantt et du calendrier : non lu.
- Écriture d'une liste de références sur `Tasks` : non testée.
- Hors ligne et conflits d'écriture : non définis, relèvent de l'hôte (APK, Atlas).

## 6. Le brouillon d'essai (fait le 09/11/2026)

Fichier : `projects/grist_forms/tests/fixtures/fiche-tache-brouillon.formdef.json`. Table cible `Tasks`, mode `bind`, `editerLigneSelectionnee` vrai (la fiche corrige la ligne choisie). Il porte les champs de classe **D** : type, titre, statut, priorité, début, échéance, projet, assignés, estimé, passé, progression, description. Les conditions reprennent le pilotage par le type : priorité absente pour une réunion, échéance absente pour un jalon, section « Temps » seulement pour une tâche.

Résultat de `forms_valider_formdef` (commande pure du registre, rien écrit) :

- `conforme : true`, aucun écart au contrat `formdef-1.0`.
- `plan_realisable : false`, avec un seul avertissement : **« Champ statut : choices manquants pour Choice »**. C'est exactement le manque n° 1 (statuts tirés de la configuration du document), vu par le validateur. Le brouillon a volontairement laissé `statut` sans liste, pour ne pas inventer des valeurs que je ne connais pas.

Opérateurs de condition utilisés (`==`, `!=`) : présents dans `shared/conditions.js`. Les noms de tables (`Tasks`, `Projects`, `Team`) sont lus dans `kanban.html` ; les colonnes `nom` des deux tables liées aussi.

Trois constats en plus de la comparaison :

1. **Statuts : un chemin existe côté dérivation.** `formdef-from-table.js` lit les choix d'une colonne Choice dans ses `widgetOptions` quand il dérive un FormDef d'une table. Un FormDef dérivé de `Tasks` aurait donc les statuts de la configuration du document. Cela ne dit pas lesquels sont « terminaux » (fait, annulé) : ce sens reste à l'hôte. Et je ne sais pas si le widget `formulaire` d'appkit dérive de la même façon.
2. **Valeur et libellé.** Selon le schéma, `choices` est une liste de chaînes : la priorité serait offerte comme « 1 » à « 4 » et le type comme « tache », « jalon », « reunion », pas comme « Critique » ou « Tâche ». Je n'ai pas vérifié si une option de libellé existe ; à défaut, c'est un manque de plus.
3. **Pas de widget couleur, pas de curseur.** La liste des widgets reconnus (text, textarea, number, checkbox, date, datetime, select, radio, multiselect, likert, echelle, file, ouinon, classement, geo) n'en a pas. La progression est dite en nombre avec un pas de 5, pas en curseur avec crans ; la couleur n'est pas dite.

## 7. Suite proposée

1. Reprendre les classes **E** une par une avec appkit, pour décider si chacune va dans un crochet de l'hôte ou dans le moteur. Ordre : statuts, lecture seule par champ et par ligne, références sans cycle.
2. Vérifier les deux points laissés ouverts : un libellé distinct de la valeur dans `choices`, et la dérivation des choix par le widget d'appkit.
3. Ne rien changer aux widgets publiés de TaskFlow.
