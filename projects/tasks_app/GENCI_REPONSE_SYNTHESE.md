# GENCI — Synthèse de réflexion : répondre au besoin de la meilleure manière

> Document de **synthèse stratégique** (cadrage, rien d'implémenté). Consolide nos réflexions.
> Détail annuaire/ACL : `GENCI_LOT3_ANNUAIRE_ACL.md`. Lots historiques : `COLUMNS_SPEC.md`.
> Tests à mener dans `projects/tasks_app` (doc Grist de test).

---

## 1. Le besoin (mail JPP/GENCI, 12/06/2026)

Contexte : GENCI veut **embarquer la communauté** + adosser la DINUM ; réunion webu.coop pour la **professionnalisation** (maintenance, bugs urgents, dev d'appoint). Financement direct ou **via tokens**.

Demandes :
- **Hiérarchie** portefeuille › projet › tâche › sous-tâche › **action**.
- Le Gantt visualise portefeuille/projet/tâche ; le Kanban visualise **les actions** (sélecteur projet).
- + 12 points (voir cartographie §9).

> JPP alerte lui-même : *« ça risque de casser la logique » / « convenir au plus grand nombre »*. ⇒ **tension générique ↔ spécifique** = le fil rouge.

---

## 2. Principes directeurs (nos invariants de conception)

1. **Générique d'abord** : ne rien coder en dur (ni la taxonomie, ni les niveaux, ni les droits). On **configure** — comme les **statuts dynamiques** déjà en place.
2. **Opt-in (sweet-spot)** : sans les tables/colonnes nouvelles → comportement **actuel inchangé**. La communauté garde le simple ; GENCI active la richesse via un **profil de configuration**.
3. **Réutiliser l'existant** : motif récursif `parentTask` (WBS), statuts dynamiques, moteur Whiteboard, pivot `email`, core inliné (`taskflow-core.js`).
4. **S'appuyer sur le natif Grist** (ACL, import CSV, Ref/lookup) plutôt que recréer un système parallèle.
5. **Sécurité = serveur** : l'ACL est appliquée par Grist ; les widgets **respectent**, ils ne sécurisent pas.
6. **Toute vue nouvelle doit se justifier par un usage multiple** ; sinon on s'abstient.

---

## 3. Architecture de données — deux arbres récursifs (même motif « annuaire »)

### 3.1 Arbre ORGANISATION (annuaire) — pour équipes & droits
- Niveau 0 minimal : `Team.responsable` (Ref:Team auto-réf) = chaîne managériale.
- Niveau 1 recommandé : satellite **`Entites`** récursive (`nom, parent, niveau CONFIGURABLE, chef`) + `Team.entite`.
- **Profondeur illimitée**, **taxonomie libre** (niveau configurable). Couvre **tout arbre**.
- Non couvert (arbre seul) : matrice/graphe → extension future **`Appartenances`** (table d'arêtes person↔entité), **YAGNI** tant que non demandé.

### 3.2 Arbre TRAVAIL — portefeuille›projet›tâche›sous-tâche›action
- Déjà là : `Tasks.parentTask` (récursif, profondeur illimitée).
- Les **niveaux** (portefeuille/projet/.../action) = **labels configurables** (pas 5 tables figées).
- `Projects` reste une table ; `Portefeuilles` = niveau d'`Entites` **ou** satellite (à trancher).
- **Action** = nœud de type `action` (feuille) ; visibilité par widget (Kanban=actions, Gantt=tâches+) via **filtre de niveau configurable**.

### 3.3 Colonnes dérivées (formules) — socle de l'ACL et du roll-up
`Entites.ancetres`, `Team.chaine_chefs`, `Team.agents_geres`. La **récursivité vit dans les formules**, pas dans l'ACL ni dupliquée en JS.

---

## 4. Droits / ACL — binder sur le natif Grist

### 4.1 Principe : les droits sont une **conséquence de la donnée**
- **User Attribute** `user.Agent` = lookup `Team` par `user.Email`.
- **3 règles génériques** référençant nos colonnes : assigné (`assignees`), chef projet (`projet.responsable`), chef au-dessus (`projet.responsable.chaine_chefs`).
- ⇒ L'admin **gère l'annuaire** ; les permissions **suivent**. Règles **posées une fois**.

### 4.2 Faisabilité — **TESTÉE en Grist réel** (grist.numerique.gouv.fr, owner)
- ✅ Écriture ACL possible (ressources + règles + user-attribute), **API ET via un vrai widget** (preuve : erreur « Duplicate » = écriture widget antérieure réussie).
- 📏 Contraintes : **owner requis** ; **schéma d'abord** (réf absente → 400) ; user-attribute sur `*`, permissions par table ; format métatables **interne/fragile**.
- 🔁 **Leçon (incident reproduit)** : écrire l'ACL **au render → BOUCLE**. ⇒ si on automatise, ce doit être **one-shot, idempotent, explicite (bouton owner), jamais au render**.

### 4.3 Décision : **privilégier le natif**, pas l'écriture programmatique
Comme les règles sont **génériques et posées une fois**, le plus simple **ET** le plus sûr = **fournir un snippet de règles à coller** dans « Permissions avancées ». L'écriture programmatique (bouton owner-only) reste une **option de confort**, pas la fondation (évite le risque format/boucle).

### 4.4 Respect de l'ACL côté widgets (**Chantier A — prérequis**)
État actuel : `requiredAccess:'full'`, écritures **optimistes**, try/catch → toast **sans revert**, **pas de mode lecture**. À ajouter (dans le **core `TF`**, inliné) :
- **Détection d'accès** → **mode lecture** (masquer création/drag/édition).
- **`TF.safeApply(actions, {optimistic, revert})`** : snapshot → optimiste → apply → **revert + message si refus**. Remplace les try/catch épars (kanban l.1402/1946/1955/1962…).
- **`TF.canEditTask`** (option, cosmétique) : grise l'édition de ce qu'on ne peut pas modifier — **dépend du user connecté** (§5).

---

## 5. Identité — le pivot `email`

- **Pont** : user Grist connecté ↔ ligne `Team` (par `email`) ↔ schéma. **Générique** (tout Grist a des users/emails).
- **Sécurité** : `user.Email` côté serveur → l'ACL marche **sans** que le widget connaisse l'email. **Acquis.**
- **UX « moi »** (mes tâches, ce que je peux éditer) : **RÉSOLU par sonde (2026-06-18)**. Grist **n'expose PAS** l'email/nom au widget (`grist.user`/`getCurrentUser`/… absents), **MAIS** `grist.docApi.getAccessToken()` renvoie un **JWT dont le payload contient l'`userId` numérique** du connecté. ⇒ le widget **s'auto-identifie par `userId`**. **Bridge** : colonne `Team.gristUserId` (userId numérique) **ou** fallback table d'identité filtrée par ACL. L'**email reste le pivot humain + clé ACL** ; l'`userId` = clé technique côté widget.
- **Exigence donnée** : `Team.email` = **email de login Grist** ; chefs/managers **présents** dans l'annuaire.

---

## 6. Onboarding de l'annuaire (intégrer l'existant / créer depuis une liste)

1. **Socle** : import **natif CSV/Excel** dans `Team` (colonnes texte intermédiaires : `equipe`/`chemin`, `manager_email`).
2. **Résolution des Ref par FORMULE `lookupOne`** (recommandé, natif, idempotent, auto-sync) : `Team.entite`, `Team.responsable`, `Entites.chef`.
3. **Bootstrap des `Entites`** (one-shot idempotent) : crée l'arbre depuis les valeurs/chemins distincts.
4. **Formes supportées** : liste à **colonne chemin** → arbre ; liste **plate (équipe + manager)** → chaîne `responsable` ; **annuaire existant** (LDAP/AD/RH) → **export → template CSV** (sync natif = futur, schéma compatible).
5. **On fournit** : un **template CSV** (colonnes + pivot `email`), les **formules**, le **helper bootstrap**.

---

## 7. Surfaces & vues — minimalisme

- **Fondation = sans vue nouvelle** : édition **native** des tables (`Entites`/`Team`) + **page ACL native** (snippet collé une fois) + widgets qui **respectent** l'ACL. **GENCI servi sans widget en plus.**
- Le **Plan** absorbe la « charge par équipe » (#10) via un **groupement Équipe** + filtre par sous-arbre.

---

## 8. Opportunité : la **lentille ORG / pilotage** (org-chart)

- **Pertinente SI** elle apporte ce que le Plan ne fait pas : **roll-up hiérarchique** de la répartition (charge/tâches **cumulées par unité**, remontée dans l'arbre) + **lecture managériale** (un chef voit **son sous-arbre**, repère la tension) + **drill → Plan** filtré.
- **Redondante SI** simple « charge par personne » en arbre → **à éviter**.
- **Multi-usage = justifie la vue** : visualiser la structure + **piloter la répartition** + gérer l'annuaire/chefs + (option) **poser/voir les droits**.
- **Réalisation — DÉCISION : voie B (widget dédié)** (vanilla, comme les autres widgets) = pilier « Org/pilotage » autonome, cohérent avec « un widget = une lentille ». Coût un peu supérieur à la voie Whiteboard, mais séparation propre. (La voie A « mode Whiteboard » réutilisait canvas/zoom/nœuds/`aggregate*` WBS — écartée.)
- **Complémentarité** : org-chart = *où est la charge* (vue d'ensemble) ; Plan = *quelle semaine/tâche, réaffecter* (détail).
- **Pertinence ∝ profondeur de hiérarchie + usage pilotage** → fort pour GENCI, **opt-in** pour équipes plates.

---

## 9. Cartographie besoin → réponse (traçabilité)

| # | Demande JPP | Réponse | Statut |
|---|---|---|---|
| 1 | Statuts modifiables | Statuts dynamiques | ✅ FAIT |
| 2 | Équipe + personne + chef | `Entites`/`Team.entite` + chef (annuaire) | Lot 3 |
| 3 | Actions (Kanban only, hors Gantt) | Filtre de niveau par widget (Tous/Actions/Synthèses) | ✅ FAIT (visibilité) |
| 4 | Gantt auto (action faite → fin tâche) | Règle dérivée (`dependDe` + recalcul existant) | Lot travail |
| 5 | Droits chef projet / chef au-dessus | ACL (`chaine_chefs`) | Lot 3 |
| 6 | Assigné modifie les siens | ACL (`assignees`) | Lot 3 |
| 7 | Action = 1 personne 100 % | Contrainte UI du niveau `action` (extension du filtre #3) | Lot travail (reste) |
| 8 | Charge réglable par personne | `charges [{teamId,heures}]` | ✅ FAIT |
| 9 | Page saisie des temps | Widget + table `TimeEntries` | Lot temps |
| 10 | Charge par équipe/projet/personne | Plan (groupement Équipe) + **org-chart roll-up** | Lot 3 / Plan |
| 11 | Portefeuille au-dessus des projets | Satellite `Portefeuilles` + `Projects.portefeuille` ; groupement Plan | ✅ FAIT |
| 12 | Export Excel feuilles de temps | CSV → XLSX | Lot temps |
| — | Hiérarchie 5 niveaux | `parentTask` récursif + niveaux configurables | Transverse |

---

## 10. Décisions — RETENUES (nic01asfr, 2026-06-18 ; voir `GENCI_FORMULAIRE_DECISIONS.md`)

| Q | Décision |
|---|---|
| Organisation | **`Entites` nommées multi-niveaux** |
| Niveaux | **Configurables** |
| Action | **Type sur l'arbre** (dernier niveau de tâche) |
| Portefeuille | **Regroupement simple de projets** (satellite `Portefeuilles`, `Projects→portefeuille`) |
| Matrice | **Non — arbre** (1 chef/personne ; autorité projet gérée à part ; `Appartenances` en réserve si double affectation organique) |
| Org-chart | **Widget dédié** (pilier autonome) — **pas** le mode Whiteboard |
| 1ᵉʳ incrément | **Respect des droits** → schéma annuaire + import → règles ACL ; maquette org-chart en parallèle |

🔵 À confirmer avec JPP : organisation, action, portefeuille, matrice (direction de travail en attendant).

---

## 11. Phasage recommandé

0. **Tests préalables** (`projects/tasks_app`) : sonde **user connecté** (lecture seule) ; faisabilité ACL **déjà faite**.
1. **Respect ACL (Chantier A)** : `TF.safeApply` + mode lecture → robuste pour tout doc ACL'd. *(prérequis, vaut pour tous)*
2. **Annuaire (schéma)** : `Entites` + `Team.entite` + dérivés (opt-in, non destructif) + **onboarding** (template + `lookupOne` + bootstrap).
3. **ACL binding** : snippet de règles natif (+ option bouton one-shot owner + export).
4. **Plan** : groupement/filtre par équipe (#10).
5. **Lentille Org-chart** (voie A Whiteboard) : roll-up répartition + drill → Plan + gestion chefs/droits. *(à valider par maquette)*
6. **Lots travail & temps** : actions/niveaux, automation Gantt, saisie des temps, export Excel, portefeuilles.
7. **(futur)** `Appartenances` si matrice ; sync LDAP/AD.

---

## 12. À tester avant d'implémenter

- **Sonde « user connecté »** (lecture seule) — conditionne l'UX « moi » et `canEditTask`.
- **Maquette org-chart voie A** (mode Whiteboard) sur petit jeu de données — juger la valeur sur pièce.
- Tout test : doc Grist de test, **nettoyage systématique** des artefacts.
