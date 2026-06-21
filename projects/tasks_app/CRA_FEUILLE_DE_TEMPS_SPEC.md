# Feuille de temps / CRA — Spécification (Lot temps : #9 saisie + #12 export)

> Cadrage figé (enrichi par benchmark Odoo Timesheets + CRA français + templates Excel).
> Comble le vrai manque : `tempsPasse` n'est qu'un **total par tâche** ; il manque un **réalisé daté par personne** (le Plan le note « hors cadre, Niveau 3 »).
> Principes : **opt-in**, **configurable**, **natif Grist**, **réutilise l'existant** (Plan, annuaire/chefs, org-chart, export CSV). Voir [[genci-lot3-annuaire-acl]].

---

## 1. Pourquoi (besoin JPP #9/#12 + contexte)

- **#9** : page de saisie des temps. **#12** : export Excel des feuilles de temps.
- Contexte GENCI : dev financé par **tokens / refacturation** → l'**imputation** (code projet/affaire) et l'**export Excel** sont centraux (aujourd'hui fait à la main dans Excel).
- **Boucle de la suite** : Plan (planifié) → **CRA (réalisé saisi)** → **Validation par le chef (annuaire)** → **Export Excel**. La hiérarchie déjà construite (`Team.responsable`, `chaine_chefs`) devient le **moteur d'approbation**.

## 2. Patrons retenus (du benchmark)

| Source | À reprendre |
|---|---|
| Odoo Timesheets | ligne = `Date, Projet, Tâche, Description, Heures` ; **grille hebdo** (lignes × jours) + totaux jour/semaine ; **soumettre → valider** (manager, en masse ou ligne) |
| CRA français | **unité configurable** (heures / **jours / demi-journées**) ; **imputation** projet-affaire ; **validation 2 niveaux** (manager + contrôleur) ; objectif **facturation** |
| Templates Excel CRA | l'**export Excel** est le format de référence à remplacer |

## 3. Données — satellite opt-in

### Table `TimeEntries` (les lignes de temps)
| Colonne | Type | Notes |
|---|---|---|
| `membre` | Ref:Team | qui |
| `tache` | Ref:Tasks | sur quoi (tâche/action) |
| `date` | Date | **le jour** = l'atome (la semaine n'est que la surface de saisie) |
| `heures` | Numeric | **valeur canonique en heures** (Odoo-like) ; l'unité d'affichage convertit |
| `imputation` | Text | code projet/affaire ; défaut = projet de la tâche (`tache.projet.nom`) |
| `description` | Text | commentaire / justification |
| (dérivée) `semaine` | Any (formule) | lundi de `date` → agrégation |
| (dérivée) `projet` | Any (formule) | `tache.projet` → regroupement/imputation |

### Table `Feuilles` (enveloppe par personne × semaine — workflow)
| Colonne | Type | Notes |
|---|---|---|
| `membre` | Ref:Team | |
| `semaine` | Date | lundi de la semaine |
| `statut` | Choice | `brouillon` / `soumis` / `valide` / `rejete` (Choices configurables) |
| `validePar` | Ref:Team | qui a validé |
| `dateValidation` | Date | |
| `motifRejet` | Text | si rejeté |

> Une feuille = une personne-semaine. Les `TimeEntries` y sont rattachées par `membre` + `semaine`. Le statut vit sur la feuille (pas répété sur chaque ligne).

### Config (réglages partagés)
- `uniteSaisie` : `heures` | `jours` | `demijournees` (défaut `heures`).
- `heuresParJour` : Numeric (défaut **7**) — conversion jour↔heures (comme Odoo « hours per day »).
- `niveauxValidation` : 1 | 2 (défaut 1 ; 2 = chef direct **puis** `chaine_chefs[1]`).
- Stockage v1 : `grist.widgetApi.setOptions({ cra: {...} })` (partagé inter-widgets) ; option future : table `CRAConfig` 1 ligne.

## 4. UX — widget `cra.html` (nouveau pilier, standalone)

### a. Onglet « Ma semaine » (saisie)
- **Identité** : `getAccessToken().userId` → ma ligne `Team` (pivot, cf. [[genci-lot3-annuaire-acl]]). Fallback sélecteur « Qui suis-je ? » (auto-claim).
- **Grille hebdo** : lignes = mes tâches (assignées + ajoutables), colonnes = **Lun→Dim**, cellules = quantité (dans l'unité). **Totaux** par ligne, par jour, et **total semaine**.
- **Pré-remplissage** : lignes initialisées depuis mes `charges` planifiées (Plan) de la semaine → on ne saisit que les écarts.
- **Navigation** semaine précédente/courante/suivante.
- **Unité** : bascule heures / jours / demi-journées (affichage + saisie ; stockage canonique en heures).
- **Soumettre la semaine** → `Feuilles.statut = soumis` (verrouille la saisie).

### b. Onglet « À valider » (chef)
- Visible si je suis chef (j'ai des `agents_geres`). Liste des **feuilles soumises** de mon périmètre.
- **Valider** / **Rejeter (motif)** — en masse ou par feuille. 2ᵉ niveau si configuré.

### c. Export
- **CSV+BOM** (réutilise le pattern `exportCSV` du Plan) → ouvre dans Excel. Vues : par personne, par projet/imputation, par période. Colonnes CRA : membre, date, projet/imputation, tâche, heures(/jours), description, statut.

### d. Lien avec les autres widgets
- **Plan** : mode « Réalisé » lit `TimeEntries` (réalisé **exact**, daté) au lieu d'étaler `tempsPasse`.
- **Org-chart** : roll-up des **heures réelles validées par unité** (réutilise le roll-up de charge déjà codé) — « le lot temps avec la vue qu'on a faite ».

## 5. Opt-in & empreinte

- Le widget CRA est **créateur unique** de `TimeEntries` / `Feuilles` (comme le Plan pour `charges`).
- Sans ouverture du CRA → 0 table, 0 colonne → **empreinte nulle**, suite inchangée.
- Le Plan ne lit `TimeEntries` que **si la table existe** (même garde que `TASK_COLS`).

## 6. Droits (réutilise le pattern prouvé)

- Un agent édite **ses** lignes en `brouillon` ; verrouillées dès `soumis`.
- Le chef valide les feuilles de son **sous-arbre** (`agents_geres` / `chaine_chefs`).
- Posable via le **même mécanisme que les droits tâches** (colonne précalculée d'emails autorisés + règle ACL substring + bouton « Configurer les droits CRA »). Voir [[genci-lot3-annuaire-acl]] (contraintes ACL : pas de table-ref/traversée/comprehension ; aplatir dans une colonne formule).

## 7. Phasage

1. **Schéma** `TimeEntries` + `Feuilles` (opt-in) + démo.
2. **Grille « Ma semaine »** : saisie + totaux + navigation + unité configurable. *(cœur)*
3. **Pré-remplissage** depuis `charges` (Plan).
4. **Workflow** soumettre → valider/rejeter (onglet chef via `agents_geres`).
5. **Export** CSV/Excel (par personne/projet/période).
6. **Intégration Plan** (réalisé exact) + **org-chart** (roll-up heures réelles).
7. **Droits CRA** (bouton, pattern prouvé) + 2ᵉ niveau de validation.

## 8. Décisions actées

- **Atome = jour** ; stockage **canonique en heures** + `heuresParJour` pour l'unité jours/demi-journées (modèle Odoo).
- **Validation par la hiérarchie annuaire** (pas un rôle séparé) — réutilise `responsable`/`chaine_chefs`.
- **Widget dédié** (pas dans le Plan) : le Plan = planifié, le CRA = réalisé saisi + validation. Cohérent « un widget = une lentille ».
- **Imputation** = champ texte (défaut projet de la tâche), libre pour coller à n'importe quel plan analytique.
