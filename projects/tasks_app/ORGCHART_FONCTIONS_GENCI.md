# Org-chart — Fonctions #1 (Gestion de l'annuaire) & #4 (Compétences) — étude GENCI

> L'org-chart devient le **pilier « Personnes & Organisation »** de la suite (le seul non centré-tâche).
> Ces deux fonctions sont **préparées pour GENCI** : #1 = qui/où + chefs (socle ACL & charge par équipe), #4 = qui-sait-quoi (staffing).
> Principes : **opt-in**, **configurable**, **non destructif**, écriture via `TF.safeApply` (respect ACL), init **ordonnée**.

---

## #1 — GESTION DE L'ANNUAIRE (CRUD dans l'org-chart)

### Objectif
Faire de l'org-chart le **hub de gestion de l'organisation** : créer/éditer la hiérarchie, rattacher les personnes, désigner les chefs, saisir les emails (pivot ACL) — sans passer par la table native.

### Données (existant — pas de nouveau schéma)
- `Entites` : `nom, parent (Ref:Entites), niveau (Choice), chef (Ref:Team)` (+ dérivées à venir : `ancetres`).
- `Team` : `nom, email, role, actif, capaciteHebdo, entite (Ref:Entites), responsable (Ref:Team)` (+ dérivées : `chaine_chefs`, `agents_geres`).

### UI à ajouter
- **Panneau d'édition** (au clic sur un nœud, modèle Kanban) :
  - Entité : `nom`, `niveau`, `parent` (sélecteur **anti-cycle** `canSetParent`), `chef` (Ref:Team).
  - Personne : `nom`, **`email` (pivot ACL — validé/obligatoire)**, `role`, `capaciteHebdo`, `entite` (rattachement), `responsable`.
- **Actions sur un nœud** : `+ Sous-entité`, `+ Personne`, **déplacer** (re-parent / re-rattacher, drag possible), **supprimer** (enfants : cascade **ou** détachement, comme le WBS).
- **Import CSV** (onboarding) : template + résolution `lookupOne` (équipe/manager → Ref) + bootstrap des `Entites` → création en masse depuis une **liste agents**.

### Écriture & droits
- `applyUserActions` → à terme via **`TF.safeApply`** (revert sur refus).
- L'annuaire est **éditable par RH/owner** (cf. règle ACL §4 du snippet) ; lecture pour les autres. Le mode lecture du Chantier A masque l'édition pour les non-autorisés.

### Init ordonnée (déjà amorcée dans `activateAnnuaire`)
tables → colonnes → **affichage des Ref par le nom** (`setRefDisplay`) → (à compléter) **colonnes dérivées** (`chaine_chefs`, `agents_geres`, `ancetres`) + **choix `niveau`**. ⇒ tout est parfaitement défini dès l'activation.

### Valeur GENCI
**Indispensable** : c'est ici qu'on saisit Directions/Services/Équipes + personnes + chefs + **emails** → le **socle de l'ACL** (chefs = droits) et de la **charge par équipe** (#10).

---

## #4 — COMPÉTENCES / SKILLS (satellite opt-in)

### Objectif
Savoir **qui sait faire quoi** → **staffing** (mettre la bonne personne sur la bonne tâche) et **analyse de couverture** par unité.

### Données (nouveau satellite opt-in)
- **`Competences`** (référentiel) : `nom, categorie (Choice), actif` (+ `description`).
- **Lien personne ↔ compétence** — deux options :
  - **A (simple)** : `Team.competences` → **RefList:Competences**. Une personne a une liste de compétences.
  - **B (riche — recommandé GENCI)** : table **`CompetencesAgents`** : `membre (Ref:Team), competence (Ref:Competences), niveau (Choice: notion/confirmé/expert)`. Permet « **qui est EXPERT en X** ».
- **Reco** : **B** (niveau) pour un staffing fin ; A en repli minimal. (Cohérent avec le motif satellite des autres lots.)

### Intégration dans l'org-chart
- **Fiche agent** (#2) : badges de compétences (+ niveau).
- **Filtre par compétence** : « surligner qui a la compétence X » dans l'arbre → trouver un profil dans une unité / toute l'org.
- **Couverture par unité** (gap analysis) : compétences **présentes / manquantes** dans une équipe (roll-up des compétences des membres).
- **Aide à l'affectation (le cœur)** : croiser **compétence × disponibilité (#3) × charge (période)** → « qui peut prendre cette tâche » = a la compétence **et** est dispo **et** sous-chargé.

### Valeur GENCI
Le **staffing** est un besoin direct (affectation, plan de charge). Croisé avec charge + dispo, l'org-chart devient un **cockpit de staffing** que la suite n'a pas.

### Généricité
Concept universel ; **opt-in** (tables créées seulement si activé) ; **configurable** (catégories, niveaux) ; non destructif.

---

## La combinaison #1 + #4 = cockpit « Personnes & Organisation »
Structure (qui / chef) **+** charge (période courante) **+** disponibilité **+** **compétences** → l'org-chart porte les décisions de **staffing** ET de **droits** — exactement ce qui manquait à la suite, et exactement ce dont GENCI a besoin.

| Brique | Donnée | Sert à |
|---|---|---|
| Annuaire (#1) | Entites/Team | structure, chefs, **ACL**, charge/équipe |
| Compétences (#4) | Competences (+ lien) | **staffing**, couverture |
| Dispo (#3, données existantes) | Disponibilites | qui est dispo |
| Charge période | Tasks.charges | qui est libre/surchargé |

## Phasage proposé
1. **#1 édition annuaire** : panneau CRUD `Entites`/`Team` + déplacer + supprimer + **import CSV**. *(socle GENCI)*
2. **#1 init complète** : colonnes dérivées + choix `niveau` dans `activateAnnuaire`.
3. **#4 schéma compétences** : `Competences` + `CompetencesAgents` (opt-in) + badges sur la fiche agent.
4. **#4 staffing** : filtre par compétence + croisement compétence × dispo × charge.
5. **#4 couverture** : présence/manque de compétences par unité.

## Garde-fous (cohérence suite)
- L'org-chart reste la lentille **Personnes/Organisation** : il ne refait ni le temporel par personne (= Plan) ni les statuts (= Kanban). **Drill croisé** vers Plan/Kanban pour le détail tâche/temps.
- Tout **opt-in** : sans activation, `Team` reste plat, aucune table compétence → empreinte nulle.
