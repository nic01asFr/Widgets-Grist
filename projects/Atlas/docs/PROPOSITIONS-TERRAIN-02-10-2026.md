# Application de terrain : ce qui a été fait, ce qui est proposé — 02/10/2026

Suite à la réflexion « que manque-t-il à l'application mobile ». Pour chaque point : ce qui est **fait**, ce qui est
**proposé** (à valider), ce qui reste **ouvert**. Rien de ce qui suit n'est publié : tout est sur la branche
`atlas-formulaire-entite`, après la 1.10.2.

## 1. Hors ligne — premier étage fait

**Fait** (`lib/hors-ligne.js`, 28 tests, essayé dans l'application simulée) : lire depuis l'appareil, écrire dans une
file, photos différées, pastille de synchronisation, entrée « Synchronisation » du menu principal. Détail et limites :
`CLAUDE.md`, « Hors réseau — premier étage ».

**Décisions prises faute de réponse** (modifiables) : stockage = IndexedDB (décision 1 du cadrage) ; pas de colonne
`AtlasClientId` — un journal local, avec un état « incertain » pour un envoi interrompu, jamais renvoyé d'office.

**Ouvert** :
- la **carte hors réseau** (lot 4 : tuiles IGN à la volée, « télécharger la zone », repli sur fond uni) — c'est ce qui
  manque pour travailler vraiment sans réseau ; les conditions d'usage du préchargement sont à vérifier ;
- les polices et `geotiff.js` ne sont pas embarqués (la page retombe sur des polices système ; le relief LiDAR demande de
  toute façon le réseau) ;
- créer un projet sur téléphone et le lier à Grist (lots 6-7) ;
- **un essai sur un vrai téléphone** : rien de ce premier étage n'y a été vu.

## 2. Mode relevé « à faire / fait » (point 4) — fait, sous une forme simple

On avait déjà : couleur par état (table de référence), contrôles publiés, contextes, liste d'objets avec dernière visite.
**Ajouté** (`lib/echeance.js`) : une couche de points désigne son champ de **délai** ; une **couronne** rouge (en retard) ou
ambre (à faire) entoure chaque point, **sans toucher à la couleur**, qui garde son sens ; la légende et la pastille « Relevé »
comptent (« 21 en retard · 14 à faire »). Sur la copie, le champ est `delai_prochaine_visite` (en mois, négatif = dépassé).

**Proposé** (à valider) :
- une **règle sur une date** (dernière visite + période du type d'ouvrage) pour les documents qui n'ont pas de colonne de
  délai : plus général, mais le calcul vit alors dans Atlas, pas dans Grist — contraire à notre principe ;
- trier « Choisir un objet » par urgence, avec une pastille de couleur ;
- compteurs « fait aujourd'hui » (visites écrites depuis ce matin) pour la progression d'une tournée.

## 3. Ajouter un objet sur le terrain (point 5) — fait, par couche

Un réglage de l'auteur, **par couche** (« Les agents peuvent aussi ajouter un objet, en Exploiter »), sous réserve du droit
d'écriture de la table (appris, jamais supposé). Jamais en Lecture. La pastille « Relevé » propose « ＋ Ajouter un objet ».

**Ouvert** : le formulaire utilisé est celui d'Atlas (champs de la table) ; faire passer le **formulaire natif d'ajout** de
l'équipe (celui qu'elle a déjà soigné) serait plus fidèle — c'est faisable, la fiche sait déjà rendre un formulaire natif ;
placer le point **à la position GPS** plutôt qu'au toucher (un bouton « ici ») ; la création hors réseau marche (file), mais
une visite posée sur un objet créé hors réseau n'est pas éprouvée en réel.

## 4. Savoir qui est connecté (point 7) — fait pour l'application

Ce que propose Grist : rien dans l'API plugin ; pour un widget, une **colonne à formule déclenchée** (`user.Email`,
`user.Name`) ou une table d'utilisateurs protégée par ligne. Pour l'**application**, qui se présente avec la clé :
`GET /api/profile/user` répond (`id`, `email`, `name`).

**Fait** : le profil est lu à l'ouverture, gardé pour le hors réseau, et sert d'identité ; nouveau départ de formulaire
**« Moi »** pour un champ qui désigne des personnes (la ligne dont le courriel est le mien).

**Proposé pour le widget** (côté document, sans code Atlas) : une colonne « Saisi par » à formule déclenchée `user.Email` sur
les tables de relevé, et pour l'inspecteur la formule `Agents.lookupOne(Email=user.Email)`. Atlas pourrait **créer** ces
colonnes à la demande (un bouton « Renseigner automatiquement l'auteur ») — à décider, car c'est une modification de
structure du document.

## 5. Regroupement, palette inversée, contour seul (point 8) — fait

Regroupement **par couche** (points : MapLibre ; lignes et surfaces : leurs centres, la forme au zoom suivant), couleur du
rond = celle de la couche ou **l'objet le plus grave** ; palette **inversée** (catégories et gradué) ; surfaces en **contour
seul**. Détail et limites (étapes de récit, modèles 3D) : `CLAUDE.md`.

**Proposé** : le même réglage dans les **étapes de récit** (aujourd'hui une étape ne reconstruit pas les sources) ; un
regroupement par **valeur** (un rond par état) ; l'inversion aussi pour les couleurs lues dans une table de référence
(aujourd'hui sans effet).

## 6. Navigation (point 10) — un correctif, le reste proposé

**Fait** : le menu principal expose « Synchronisation » (état, dernier envoi, « toucher pour envoyer »). La posture est déjà
dite en clair par un badge (« EXPLOITATION ») sur grand écran.

**Proposé** (cadrage §7) — dans l'ordre de valeur : (1) « Ouvrir un projet » sur téléphone qui ouvre vraiment un projet ;
(2) la recherche accessible sur téléphone en édition ; (3) un seul sélecteur de posture, visible dans toutes les postures,
avec des mots publics — **décision 6 en attente** (Modifier / Relever / Consulter, ou Préparer / Exploiter / Lecture) ;
(4) un accueil « Projets » ; (5) un vrai module « Réglages ». Le thème sombre demande de passer les couleurs écrites en dur
aux jetons.

## 7. Trajet sur une polyligne, tournée (point « 11 » de la liste) — fait

Un trajet **se définit déjà** sur une polyligne d'une couche (Récit → « Créer un trajet », on touche la ligne ; pour une
ligne multiple, la partie touchée) — c'est le cas des boucles. **Ajouté** : « Étapes depuis les objets » — une étape par
objet qui borde la ligne (rayon réglable), dans l'ordre du parcours : la tournée d'une boucle se compose d'un geste.

**Proposé** : marquer chaque étape « faite » dès qu'une visite est écrite sur son objet (progression de tournée) ; proposer
automatiquement l'étape suivante en s'approchant (le suivi GPS et l'alerte de proximité existent déjà pour le trajet) ; un
contexte qui ne montre que les objets de la boucle choisie.

## 8. Ce qui reste vraiment bloquant, dans l'ordre

1. **Essayer sur un téléphone** — avant de bâtir plus.
2. **La carte hors réseau** (lot 4).
3. **Une clé de signature fixe** pour l'APK (aujourd'hui, chaque construction impose de désinstaller l'ancienne).
4. Le **formulaire natif d'ajout** pour l'ajout d'un objet, et le bouton « ici » (GPS).

## 9. Décisions qui attendent une réponse

Vocabulaire des postures (6) ; colonne `AtlasClientId` pour dédupliquer exactement (2) — le journal local suffit pour
l'instant ; un projet local est-il propre à un appareil (5) ; faut-il qu'Atlas crée les colonnes « Saisi par » (§4).
