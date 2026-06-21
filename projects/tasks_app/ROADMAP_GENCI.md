# TaskFlow / GENCI — Roadmap & Index (document maître)

> Point d'entrée unique : état, carte des docs, backlog priorisé, plan de publication.
> Détails dans les docs référencés. Mis à jour 2026-06-21. Branche `draft` (rien publié de neuf).

---

## 1. Vue d'ensemble

Suite de **6 widgets** Grist autonomes + **launcher** (relais pur, onglets) :

| Widget | Fichier | Rôle |
|---|---|---|
| Kanban / Gantt / Calendar / Dashboard | `*.html` | Vues tâches (core inliné via `build-taskflow`) |
| **Plan** | `plan.html` | Plan de charge (planifié) |
| **Organigramme** | `orgchart.html` | Annuaire + roll-up charge/réalisé par unité + droits |
| **Feuille de temps / CRA** | `cra.html` | Saisie du réalisé daté + validation + export |

Pivot données = table **`Team`** (voir §6). Tout est **opt-in** (sweet-spot) : sans activation, empreinte nulle.

---

## 2. État par chantier

| Chantier | Contenu | État |
|---|---|---|
| **Lot 1** | Statuts dynamiques, noms vs ids, charges | ✅ **publié** (v1.1.x) |
| **Lot 3 — Annuaire** | `Entites` récursif + `Team.entite/responsable` + dérivées (`chaine_chefs`/`agents_geres`/`ancetres`) | ✅ fait, calcul vérifié réel |
| **Lot 3 — Org-chart** | Période courante (sem/mois/trim), édition annuaire, mesure **Charge / Réalisé / Effectif**, bouton **Droits** | ✅ fait + testé |
| **Lot 3 — ACL dérivée** | Droits = schéma (assigné / chef projet / chef au-dessus) | ✅ **prouvée live** (matrice « View as ») |
| **Lot temps — CRA** | Saisie hebdo, identité (`gristUserId`), workflow soumettre/valider/rejeter (chef via annuaire), export Excel, **droits CRA**, **intégration anti-doublon** | ✅ **complet** (cf. `CRA_FEUILLE_DE_TEMPS_SPEC.md`) |
| **Portefeuille (JPP #11)** | Satellite `Portefeuilles` + `Projects.portefeuille` (opt-in) ; groupement **Portefeuille** dans le Plan (roll-up charge au-dessus des projets) | ✅ fait + testé démo |
| **Respect ACL widgets (#7)** | Garde transverse (`TF.guardWrites`/`isReadOnly`/`readOnlyBanner` au core ; inline pour orgchart/cra) : bandeau lecture seule, blocage des écritures, refus ACL ligne géré proprement ; câblé sur les 7 widgets | ✅ fait + testé (unit + Grist réel) |
| **Filtre de niveau (#9)** | Select « Niveau » par widget (Tous/Actions/Synthèses) sur l'arbre `parentTask` ; Kanban=actions, Gantt=synthèses simultanément ; persistance locale, opt-in défaut « Tous » | ✅ fait + testé démo (kanban/gantt/calendar) |
| **Plan réalisé daté (#5)** | En Réalisé/Reste, lecture des `TimeEntries` datés → heures placées dans leur période réelle (au lieu d'étaler `tempsPasse`) ; opt-in (si table existe) | ✅ fait + **testé Grist réel** (6h en S25) |
| **Validation chef (#3)** | Soumettre → valider/rejeter par le chef via la CRA (annuaire) | ✅ **validé bout-en-bout en Grist réel via le launcher** (Nicolas valide la feuille d'Alice → `statut=valide`, `validePar`, `dateValidation` en base). Fix : `mesGeres` recalculé côté client (les formules RefList se vident via le relais — cf. [[taskflow-launcher-relay]]) |
| **Lot 2** | Column mapping (config tables/colonnes dans le widget) | ⬜ à faire |

**Anti-doublon réalisé** (clé d'intégration) : `TimeEntries` (réel daté, CRA) → `Tasks.tempsPasse` (rollup synchronisé) → **tous les widgets** ; saisie manuelle de `tempsPasse` figée quand la CRA est active.

---

## 3. Carte des documents (`projects/tasks_app/`)

| Doc | Contenu |
|---|---|
| `CLAUDE.md` | Architecture suite + schéma données + **modèle du réalisé** (anti-doublon) |
| `GENCI_REPONSE_SYNTHESE.md` | Synthèse stratégique + **§9 cartographie des 12 demandes JPP** (traçabilité) |
| `GENCI_LOT3_ANNUAIRE_ACL.md` | Cadrage annuaire + ACL |
| `ACL_RULES_GENCI.md` | **Recette ACL prête à coller** (Étape 3 bis = solution prouvée) + scénario « View as » |
| `CRA_FEUILLE_DE_TEMPS_SPEC.md` | Spec Feuille de temps / CRA (modèle, UX, workflow, phasage) |
| `ORGCHART_FONCTIONS_GENCI.md` | Étude fonctions org-chart (#1 annuaire, #4 compétences) |
| `GENCI_FORMULAIRE_DECISIONS.md` | Décisions actées (Q1-Q7) |
| `PLAN_DE_CHARGE_V2.md` / `COLUMNS_SPEC.md` | Spec Plan / colonnes (historique) |
| **`ROADMAP_GENCI.md`** | **Ce document** |

Mémoire agent : `genci-lot3-annuaire-acl`, `taskflow-cra-lot-temps`, `taskflow-plan-de-charge`, etc. (index dans `MEMORY.md`).

---

## 4. Backlog priorisé (restant)

| # | Item | Effort | Impact | Garde-fou |
|---|---|---|---|---|
| ~~5~~ | **Plan « Réalisé » daté exact** — ✅ **fait + testé Grist réel** (cf. §2) | — | raffinement livré | — |
| ~~3~~ | **Validation chef** — ✅ **fait + validé bout-en-bout en Grist réel** (via launcher). Fix `mesGeres` côté client (formules RefList nulles via relais) | — | mécanisme prouvé live | — |
| ~~7~~ | ~~**Respect ACL dans les widgets**~~ — ✅ **fait** (`TF.guardWrites`/`isReadOnly`/`readOnlyBanner` + cablage 7 widgets, cf. §2) | — | widgets respectent les droits | — |
| ~~8~~ | ~~**Portefeuille**~~ — ✅ **fait** (groupement Plan opt-in, cf. §2) | — | besoin JPP #11 couvert | — |
| ~~9~~ | **Filtre de niveau par widget** (Tous/Actions/Synthèses, basé sur l'arbre `parentTask`) — ✅ **fait** (kanban/gantt/calendar, cf. §2). *Reste en extension : niveaux **nommés** configurables (champ `Tasks.niveau`) + contrainte JPP « action = 1 personne 100% ».* | ⭐ | besoin JPP #3/#7 (visibilité) couvert | opt-in, défaut « Tous » |
| 10 | **Gantt auto** (recalcul dates depuis `dependDe`) | ⭐⭐⭐⭐ | besoin JPP #4 | **bouton** (pas auto) sinon écrase les dates manuelles |
| — | **Compétences (#4)** + GEC | ⭐⭐⭐ | différé (étude faite) | satellite opt-in |
| — | Durcissement `charges` JSON → table `Allocations` | ⭐⭐ | intégrité (seul lien « mou ») | optionnel |

**Ordre conseillé** : **confirmer priorités avec JPP** (montrer §9) → 10 (Gantt auto) → extensions #9 (niveaux nommés, action=1 pers) ; compétences/GEC ; durcir `charges`→`Allocations`. *(#3 validation chef, #5 réalisé daté, #7 ACL, #8 portefeuille, #9 filtre de niveau déjà livrés.)*

---

## 5. Plan de publication

État : `draft` (+commits devant `main`), `published/` = TaskFlow v1.1.x (5 widgets, **sans** org-chart ni CRA).

Pour publier l'org-chart + la CRA :
1. `node scripts/build-taskflow.js` (inline core) + `--check`.
2. Copier `orgchart.html` → `published/taskflow/orgchart/index.html` ; `cra.html` → `published/taskflow/cra/index.html`.
3. Ajouter `orgchart` + `cra` au `package.json` `grist[]` + ajuster les `urlFor` prod du launcher.
4. `npm run manifest` → commit → PR `draft → main` (CI déploie gh-pages).

⚠️ **Avant publi** : décider tout-d'un-coup vs étapes ; le working-tree `draft` contient aussi qgis2grist/artefactory/Atlas (ne pas embarquer) ; empreinte opt-in (tables créées à l'usage). Cf. [[taskflow-plan-de-charge]] / `genci-lot3`.

---

## 6. Invariants & décisions clés (à respecter)

- **Pivot RH = `Team`** : tout référence `Team` (`Ref:Team`) ; `Entites` = structure ; `Tasks/Projects` = travail ; `TimeEntries/Feuilles` = temps. **Aucune liste de personnes parallèle.**
- **Opt-in partout** : un doc qui n'ouvre ni Plan ni Org-chart ni CRA reste sans empreinte.
- **Sécurité = serveur** : l'ACL est appliquée par Grist ; les widgets **respectent**, ils ne sécurisent pas.
- **ACL : écriture one-shot, owner-only, JAMAIS au render** (boucle prouvée). Contraintes : pas de table-ref / traversée Ref→col / comprehension en formule ACL → **aplatir dans une colonne formule** (`editorsEmails`, `membreEmail`, `ownerChefsEmails`) puis test substring/égalité.
- **Identité widget** : `getAccessToken().userId` → `Team.gristUserId` (le widget ne voit pas l'email ; `email` = pivot ACL serveur).
- **Réalisé = source unique** : `TimeEntries` → `Tasks.tempsPasse` (rollup CRA) ; ne pas réintroduire de saisie concurrente.
- **Configurable, pas codé en dur** : statuts, niveaux, unités (heures/jours/½j) — comme les statuts dynamiques.
- **NE PAS toucher `_grist_Views`/`_grist_Views_section` programmatiquement** (crash frontend documenté).
- **Français** (UI + commentaires), pas d'emojis dans le code, conventions strictes.
