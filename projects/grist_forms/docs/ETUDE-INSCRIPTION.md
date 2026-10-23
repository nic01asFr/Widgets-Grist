# Inscription à des créneaux : ce qui est tenu, ce qui ne l'est pas, ce qu'on peut faire

*Cas de référence : un formulaire d'inscription à deux ateliers, chacun avec deux créneaux et un choix « je ne participe pas », limité à 10 inscriptions, sans que les inscrits voient les réponses des autres. Étude du 23/10/2026.*

## Ce qui est tenu (mesuré sur un document d'essai)

| Besoin | Réglage | Résultat mesuré |
|---|---|---|
| 10 inscriptions au plus | Accueil → « Nombre maximum de réponses » = 10, avec la colonne « Place » | Les 10 premières lignes sont « Confirmé », la 11e « Liste d'attente » ; le formulaire publié n'affiche plus que « Complet — Le nombre maximum de réponses est atteint. » |
| Courriel obligatoire et valide | Type « Courriel », réponse obligatoire | Contrôle JavaScript et Python identiques, mise en minuscules à la sortie du champ |
| Nom complet propre | Type « Nom et prénom (un champ) » | Correction à la sortie du champ |
| Choisir un créneau ou refuser | Question à boutons, obligatoire, avec « Je ne souhaite pas participer » comme réponse | Une réponse vide n'est plus possible |
| Maximum par créneau | Dans la question : « Limiter le nombre de réponses de chaque choix » ; laisser vide le choix « je ne participe pas » | Réglage vérifié ; pas de maximum sur le choix laissé vide |

« 10 au total » est ici le nombre de **personnes inscrites** (une ligne par personne). Si l'intention est « 10 places par atelier », on règle un maximum par créneau dans chaque question.

## Ce qui n'est pas tenu

### 1. La même personne s'inscrit deux fois (mesuré)
Deux lignes avec la même adresse : toutes deux « Confirmé », la deuxième occupe une place de plus.

**Ce qu'on peut faire, du plus sûr au plus fragile**
- **La table tranche (recommandé).** Une colonne de formule marque « Doublon » toute ligne dont le courriel (en minuscules, sans espaces) a déjà une ligne plus ancienne ; la colonne « Place » ne compte pas les doublons. Même principe que « Place » : ordre d'arrivée, la table fait foi, aucune lecture par le public. Coût : une formule dans le schéma créé automatiquement et une ligne de réglage (« Une seule réponse par personne, reconnue à : Courriel »).
- **Le formulaire prévient avant l'envoi.** Il faudrait lire les courriels déjà reçus : **à écarter** tant que les participants ne doivent pas voir les réponses des autres, car cela rend la colonne lisible par tous (une liste d'adresses). Variante : lire une empreinte (hachage) de l'adresse plutôt que l'adresse. Elle ne se lit pas à l'œil mais se devine pour des adresses prévisibles ; à ne retenir qu'en connaissance de cause.
- **Dans tous les cas**, dire sur la page : « Si vous vous inscrivez deux fois, seule la première inscription est retenue ».

### 2. Deux créneaux qui se chevauchent
Les libellés des créneaux sont du texte libre : le formulaire ne sait pas que « Atelier 1 - 10h » d'un atelier recoupe « Atelier 1 - 11h » de l'autre.

**Ce qu'on peut faire** : une liste d'incompatibilités posée par la personne qui compose (« si l'on choisit A1 à la question 1, B1 n'est plus proposé à la question 2 »), appliquée dans le formulaire sans lire la table, et refaite par une colonne « Conflit » côté table. Généralisable à tout couple de choix (créneaux, salles, matériels). Effort moyen ; utile seulement si les créneaux se chevauchent réellement : à confirmer avec la personne qui organise.

### 3. La personne ne voit pas si elle est confirmée ou en liste d'attente
Aujourd'hui elle voit « Merci ». Voir son propre statut demande de relire **sa** ligne.

**Ce qu'on peut faire** : le réglage « Chacun voit sa propre réponse » existe déjà dans l'écran « Qui voit les réponses ? » (règle posée sur sa ligne, reconnue à son courriel, connexion Grist requise). Il reste à afficher, après l'envoi, le contenu de la colonne « Place » de cette ligne : « Inscription confirmée » ou « Vous êtes sur liste d'attente ». Effort faible à moyen. Non vérifiable ici tant que les règles d'accès ne peuvent pas être éprouvées avec un compte participant.

### 4. Qui voit les réponses des autres
Voir `EXPOSITION.md`. Un formulaire dans le document suppose des participants éditeurs ; les règles « ajout seul » les empêchent de lire. **Non mesuré avec un compte participant.** Pour un public sans compte, la page hors de Grist est la seule voie sans lecture.

## Ordre proposé
1. Unicité par la table (« Une seule réponse par personne ») : petit, sûr, et ne dépend pas de ce que les participants peuvent lire.
2. Statut affiché après l'envoi, une fois les règles d'accès éprouvées avec un participant.
3. Incompatibilités entre choix, si le besoin est confirmé.
