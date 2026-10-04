# Retours du forum (fil #2337) — étude et état au 4 octobre 2026

Source : 91 messages, du 8 décembre 2025 au 2 octobre 2026. Ce document classe les demandes restantes
(correctif ou amélioration), dit ce qui existe, ce qui manque et ce que cela coûterait.
Coûts : S = moins d'une journée, M = quelques jours, L = plus d'une semaine.

## 1. Traité et vérifié dans cette passe

| Demande | Constat | Suite |
|---|---|---|
| n°67 — saisies dans Tasks non répercutées | **Reproduit en Grist réel.** `grist.onRecords` ne se déclenche que pour la table liée à la section ; un widget lié à une autre table (par exemple « Table1 », proposée par défaut) ne voyait ni les ajouts ni les suppressions dans Tasks. | Corrigé : rafraîchissement de secours (`TF.watchTasks`), toutes les 15 s et au retour sur la page, seulement si la table liée n'est pas Tasks, sans interrompre une saisie. Vérifié en réel : ajout puis suppression répercutés. |
| n°23 — tâche finissant le 31/12 qui déborde en janvier (vue année) | **Reproduit.** En vue année et pluriannuelle, 12 colonnes servaient à l'échelle mais 13 étaient dessinées, et les mois (durées inégales) étaient convertis avec une échelle linéaire : les barres dérivaient de 10 à 18 jours. | Corrigé : la plage se termine sur la frontière de colonne, la position d'une date est « colonne + fraction de colonne ». Vérifié : une tâche du 1er au 31 décembre occupe exactement la colonne de décembre. |
| n°59 — assignation sur une tâche terminée | Non reproduit. Testé en Grist réel : l'ajout d'une personne sur une tâche « Terminé » est enregistré. | Rien à faire. |
| n°91 — tri du Kanban par échéance | Le Kanban n'avait aucun tri. | Fait : « Tri » dans Affichage (ordre du tableau, échéance, priorité). En échéance : tâches en cours de la plus proche à la plus lointaine, puis tâches closes de la plus récente à la plus ancienne ; sans échéance en dernier. Affichage seulement, rien n'est écrit dans les données. |
| Doublon « Tout effacer » | Présent dans le panneau et dans la barre des filtres actifs. | Retiré du panneau. |

## 2. Déjà satisfaites (vérifiées)

- Numéros de semaine en vue mois (cliquables, ils ouvrent la semaine), vues 2 semaines et 5 jours : présents. En vue semaine, le numéro est dans le libellé de période.
- Multi-assignation : présente.
- Palette de couleurs d'équipe : présente.
- Vue par ressource : c'est le Plan (timeline par personne).
- Dépendances avec recalcul : testé, un prédécesseur décalé de 10 jours entraîne son successeur (début le lendemain, durée conservée).
- Un simple clic sur une carte ou une barre ouvre la fiche (le double-clic demandé n'est pas nécessaire).
- Utilisation sur getgrist.com : signalée comme fonctionnelle par un utilisateur (n°86), non testée ici.
- À surveiller à l'usage : la mémoire des réglages (vue, tri, couleur, niveau, filtres) est locale au navigateur et partagée entre les copies d'un même widget (voir 3.1).

## 3. À étudier

### 3.1 Contexte de vue commun et mémoire de position (n°87, n°23)

État : tout est en `localStorage`, clés fixes `taskflow_<widget>_*`, donc partagées entre tous les documents et toutes les copies d'un widget.
Non mémorisés : position du Gantt (date de départ), période du Calendrier, filtres du Dashboard, état du Plan.
Chaque widget a son propre format de filtre ; rien dans le noyau ne gère un état de vue.

Contrainte : aucune API ne donne l'identifiant de la section. Deux Gantt sur la même table dans le même document sont indiscernables, sauf à stocker un identifiant d'instance dans les options de la section, ce qui impose un `setOptions` (donc le bouton « Enregistrer » de Grist) au moins une fois.

Proposition : un module `TF.ctx` dans le noyau.
- Portée : document + table (+ instance si enregistrée).
- Partagé entre widgets : projet, priorité, assigné, statut, tri, niveau, mode de couleur, période. Propre à chaque widget : vue, lignes dépliées, etc.
- Priorité de lecture : état local, puis vue enregistrée (options de la section), puis défauts.
- Bouton explicite « Enregistrer comme vue par défaut » : seul `setOptions` volontaire (désactivé en lecture seule), avec « Rétablir ».
- Contre le Kanban vide après rechargement : bandeau « N filtres actifs » (déjà présent), ignorer les identifiants disparus, prévenir si le résultat est vide alors que des tâches existent.
- Position du Gantt et du Calendrier : ancre en ISO, recalée sur aujourd'hui au-delà d'un délai.

Coûts : position du Gantt et du Calendrier S ; `TF.ctx` en local avec migration des clés M ; vue par défaut enregistrée avec identifiant d'instance M ; mise en conformité des quatre widgets et tests L.
Recommandation : commencer par la position (S), puis `TF.ctx` en local, puis le bouton d'enregistrement une fois validé sur un vrai document. Le point « contexte identique entre Gantt, Kanban, Calendrier, Dashboard » est couvert par la partie partagée de `TF.ctx`.

### 3.2 Dates prévues contre réelles (n°69)

État : aucune colonne de référence (`dateDebut`, `dateEcheance`, `dateCloture` seulement). Le « prévu » du Plan est une charge en heures, pas une période.
Proposition : colonnes `dateDebutPrevue` et `dateEcheancePrevue`, créées à la demande (même modèle que `dateCloture`) ; bouton « Figer le prévu » avec confirmation interne ; fine barre de référence de 4 px sous la barre réelle (la ligne fait 44 px, la barre 24 px : la place existe), sans gestionnaire de souris pour ne pas gêner le glisser-déposer ni les dépendances ; écart affiché dans l'infobulle et par une couleur ; case « Afficher le prévu » dans Affichage.
Points à décider pour l'intégration visuelle : couleur et hauteur de la référence, comportement pour les tâches parentes (agréger les prévus des enfants), qui peut figer le prévu (droits d'écriture).
Coût : M.

### 3.3 Champs, priorités, nomenclature, choix des colonnes (n°84, n°88, n°35)

État :
- Statuts : dynamiques, lus depuis les choix de la colonne (libellé, couleur, sens fait/annulé).
- Priorités : codées en dur (4 niveaux, libellés et couleurs dupliqués dans chaque widget).
- Type (tâche, jalon, réunion) : en dur, avec des blocs de fiche écrits à la main par type.
- Niveaux hiérarchiques : un seul `parentTask`, sans notion de niveau nommé ; « Actions » et « Synthèses » sont des libellés fixes.
- Schéma : table Tasks imposée, création automatique, colonnes optionnelles retirées à l'écriture si absentes. Un cadrage du mapping de colonnes existe déjà (COLUMNS_SPEC.md, « Lot 2 », non codé).

Lien entre les trois demandes : un même mécanisme. Les priorités personnalisées se lisent comme les statuts (depuis les choix de la colonne), la nomenclature est une étiquette par profondeur, les champs complémentaires sont des colonnes déclarées avec leur type. Il faut une **déclaration de schéma** dans le noyau (clé, libellé, type, volets concernés) et une **couche d'alias** de colonnes (par défaut l'identité, donc aucun changement pour les documents existants).

FormDef (moteur de formulaires) : sait déduire un formulaire du schéma d'une table (types, choix, références), valider et convertir en valeurs Grist. Limites : aucun filtre ni tri, moteur orienté questionnaire (assistant par étapes, bouton d'envoi, style DSFR), pas d'enregistrement à la volée, ne rend pas les composants propres à la fiche (statut, priorité, avatars, checklist, progression), poids à inliner dans chaque widget. Verdict : utilisable pour une zone « champs complémentaires » de la fiche, pas pour la fiche entière. Les filtres et tris par type sont à construire côté TaskFlow (la table type vers contrôle de FormDef est transposable).

Découpage et coûts :
1. Priorités et libellés de niveaux depuis la configuration : S à M, visible, indépendant.
2. Déclaration de schéma et alias en lecture, comportement inchangé par défaut : M. Fondation commune.
3. Champs complémentaires par volet (colonnes opt-in) avec filtres et tris génériques par type : M.
4. Choix de la table et vues indépendantes (mapping complet) : L, le plus invasif (trois tables lues, références sans cible garantie).

À trancher : où stocker la configuration (options de section avec « Enregistrer », table de configuration dans le document, ou local) ; une table seulement ou aussi Team et Projects ; nomenclature simple étiquette ou vrais niveaux typés ; priorités propres par type ou par projet ; périmètre du fork annoncé par gypais (n°90) avant de lancer les étapes 2 et 4.

### 3.4 Plan, Gantt compact, saisie mensuelle (n°71, n°45, n°89)

Filtre en cascade rôle, nom, projet (n°71). Le Plan n'a aucun filtre propre ; il regroupe par personne, portefeuille, projet ou rôle (`Team.role`). Il manque trois listes dépendantes, un filtre de tâches par charges des membres du rôle ou de la personne, et un filtre de lignes. Pas de nouvelle donnée. Coût S à M (un filtre par rôle seul : S).

Gantt compact, une ligne par projet (n°45). Aujourd'hui une ligne = une tâche (arbre `parentTask`), hauteur 44 px codée en trois endroits ; « Pluri » n'est qu'une échelle de temps. Il faut un mode « Par projet », un empilement des tâches qui se chevauchent (lanes), la factorisation de la hauteur de ligne, le recalcul des flèches de dépendance, et un glisser-déposer adapté. Livrer d'abord en lecture seule (clic = fiche), en option du menu Affichage, arbre par défaut. Coût M (lecture seule) à L (édition et dépendances).

Saisie mensuelle et réalisé lissé (n°89). Le Plan calcule le réalisé de deux façons : « estimé » (temps passé étalé sur la durée de la tâche, au prorata des charges) tant que TimeEntries est vide, « daté » dès qu'il contient une saisie. La Feuille de temps écrit une ligne par membre, tâche et jour, et met à jour le temps passé de la tâche (somme de toutes les saisies). Il n'existe pas de granularité mensuelle. Option recommandée : un mode « Mois » dans la Feuille de temps, une saisie datée à un jour pivot du mois et marquée comme mensuelle, plus un contrôle de cohérence avec les saisies journalières (risque de double comptage). Coût S à M. À signaler dans le Plan : une tâche sans saisie n'apparaît pas en mode daté.

## 4. Ordre proposé

1. Position du Gantt et du Calendrier (S).
2. Priorités et libellés de niveaux depuis la configuration (S à M), puis déclaration de schéma et alias (M).
3. `TF.ctx` en local avec bandeau anti-vide, puis vue par défaut enregistrée (M).
4. Saisie mensuelle de la Feuille de temps (S à M) et filtre par rôle du Plan (S).
5. Champs complémentaires avec filtres et tris par type (M), baseline du Gantt (M).
6. Gantt par projet en lecture seule (M), mapping de colonnes complet (L) en dernier, après clarification du fork.
