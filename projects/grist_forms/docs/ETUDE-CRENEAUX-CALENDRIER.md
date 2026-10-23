# Des créneaux datés plutôt que des libellés : intégrer un calendrier

*Étude du 23/10/2026. Idée : au lieu de proposer « Atelier 1 - 10h » comme un choix de texte, proposer un **créneau** (un début, une fin, une capacité) lu dans une table, afficher ces créneaux comme un calendrier, valider les chevauchements, remettre la réservation à la personne dans son agenda. Rien de ce qui suit n'est codé ; ce qui existe déjà est dit comme tel.*

## Pourquoi un créneau n'est pas un choix de texte
Aujourd'hui un créneau est une valeur de liste (« Atelier 2 - 13h30 ») : le formulaire ne sait ni quand il commence, ni quand il finit, ni s'il en recoupe un autre. Trois conséquences : pas de contrôle de chevauchement, pas d'affichage par jour, pas d'export vers l'agenda. Les faux positifs (« 10h » et « 11h » se chevauchent-ils ?) restent à la charge de la personne qui s'inscrit.

## Le modèle : une table `Creneaux`, une question qui la référence
Une table du document (créée par le compositeur ou existante) :

| Colonne | Rôle |
|---|---|
| Titre | « Escape game », « Blind test »… |
| Début, Fin | date-heure (Grist : secondes, fuseau du document) |
| Capacité | nombre de places (existe déjà : `parChoix.capaciteCol`) |
| Lieu, Actif | facultatifs |

La question de l'inscription est une **référence** vers cette table (type déjà livré, avec colonne affichée). Ce qui existe déjà et se réutilise tel quel :
- la capacité lue dans la table liée (`capaciteCol`) ;
- le comptage par créneau et la fermeture d'un créneau plein ;
- la colonne « Place » qui tranche par ordre d'arrivée et la nouvelle règle « une seule réponse par personne ».

Ce qui est **nouveau** : dire à la question que ses choix sont datés (`debutCol`, `finCol`), ce qui ouvre cinq choses.

## Ce que cela permet, et ce que ça coûte

| # | Apport | Ce que ça demande | Effort | Mode d'accès concerné |
|---|---|---|---|---|
| 1 | **Affichage par jour** : « jeu. 22 oct., 14 h – 15 h · 3 places », créneaux groupés par journée, pleins grisés | un rendu de liste de choix (`renderRadio`) qui sait grouper et formater des dates ; la table `Creneaux` doit être lisible (elle ne contient aucun nom) | petit à moyen | tous (la table `Creneaux` peut être publique) |
| 2 | **Chevauchement** : deux créneaux choisis dans le même formulaire se recouvrent → refus clair | **formulaire** : comparer les créneaux choisis (rien à lire hors `Creneaux`) ; **table** : une colonne « Conflit » qui compare, **dans la même ligne**, les créneaux des colonnes concernées (pas de lecture d'une autre ligne : aucun risque de référence circulaire) | moyen | tous, y compris hors Grist (la formule fait foi) |
| 3 | **Ajout à l'agenda** : après l'envoi, un fichier `.ics` des créneaux retenus | génération côté page (un `Blob`), sans serveur ; seulement les données de `Creneaux` + le choix de la personne | petit | tous |
| 4 | **Sélecteur en calendrier** : une grille semaine où l'on clique un créneau | un nouveau mode de rendu de la question ; plus de code et de tests (clavier, lecteur d'écran, téléphone) que la liste groupée du point 1 | moyen à grand | tous |
| 5 | **Vue de l'organisateur** : l'occupation des créneaux dans un calendrier | **aucun code** pour une première version : le widget Calendrier natif de Grist sur `Creneaux` (titre, début, fin) et une colonne « Inscrits » calculée | nul | côté document |

Le point 1 + le point 3 donnent déjà l'essentiel de la valeur utilisateur pour peu d'effort. Les points 2 et 4 se décident ensemble : le sélecteur en calendrier rend le chevauchement plus visible, la liste groupée le rend plus textuel mais aussi plus accessible.

## Ce qui est déjà dans le dépôt et peut servir
- **Calendrier de TaskFlow** (`projects/tasks_app/calendar.html`) : un vrai calendrier mois/semaine/année avec glisser-déposer, mais **lié au modèle des tâches** (début, échéance, projet). Le brancher à une table de créneaux demanderait un adaptateur de colonnes ou le « contrat » à penser pour exposer des événements à d'autres widgets (voir la note de contrat TaskFlow). Pour l'organisateur, le calendrier natif de Grist suffit au départ.
- **Aucun `.ics` ni export agenda** n'existe encore dans le dépôt : le point 3 est entièrement à écrire (un module `shared/ics.js` de quelques dizaines de lignes, testable en Node).
- **Les colonnes de métadonnées** (`meta.timestampCol`, `emailCol`, `durationCol`) montrent la voie : une option du FormDef, un module qui juge, un compositeur qui la règle.

## Généricité
Rien dans ce modèle n'est propre aux ateliers : les mêmes colonnes décrivent un rendez-vous, une permanence, une salle réservée (la capacité vaut 1), une visite guidée, une session de formation. « Atelier » n'apparaîtrait que dans les libellés de la personne qui compose.

## Pièges à régler avant de coder
- **Fuseaux et heure d'été** : Grist compte en secondes depuis 1970 avec un fuseau de document. Afficher dans le fuseau de la table et non celui du navigateur, sinon un créneau change d'heure d'un poste à l'autre.
- **Chevauchement** : deux créneaux bout à bout (14 h–15 h et 15 h–16 h) ne se chevauchent pas ; la comparaison doit être stricte.
- **Capacité d'une ressource partagée** : si deux ateliers occupent la même salle au même moment, la contrainte vit dans `Creneaux` (une ligne par couple salle/heure), pas dans le formulaire.
- **Migration** : un formulaire existant avec des libellés de texte continue de marcher ; les créneaux datés sont une option, pas un remplacement.

## Ordre proposé
1. `shared/ics.js` + bouton « Ajouter à mon agenda » après l'envoi (petit, utile tout de suite, y compris pour les listes de texte si on y ajoute une date).
2. Question référence « créneaux datés » : affichage groupé par jour, places restantes lisibles, créneau plein grisé.
3. Chevauchement : formulaire puis colonne « Conflit » côté table.
4. Selon l'usage constaté : sélecteur en grille semaine.

À décider avec les personnes concernées : si les créneaux de l'événement de référence se chevauchent réellement (sinon les points 2 et 4 attendent) et si ces créneaux sont déjà connus dans un tableau (alors la table `Creneaux` s'importe).
