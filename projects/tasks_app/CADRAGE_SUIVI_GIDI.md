# Cadrage — Suivi d'activité du groupe GIDI dans TaskFlow

Note de cadrage / mapping. **Aucun code à ce stade.** Objet : décrire comment rejouer
le suivi d'activité GIDI (aujourd'hui sur Excel) dans TaskFlow *tel quel*, en cadrant
le modèle de données, les unités et les décisions ouvertes avant tout développement.

Sources dépouillées :
- `PDC-GIDI-2026-CGOV181225.xlsx` — plan de charge 2026 (programmation par affaire).
- `Congés S2_2026 - GIDI.xlsx` — calendrier d'absences (maille demi-journée).
- Écosystème outils : **Nova / Orchestra PPM** (`cerema.orchestra-ppm.cloud`), **Efficy CRM**.

---

## 1. Périmètre retenu (décisions actées)

| Sujet | Décision |
|-------|----------|
| Objectifs | **Prévisionnel / plan de charge** + **Congés / disponibilités** + **Restitution gouvernance**. |
| Hors périmètre (pour l'instant) | **Réalisé / CRA** (feuille de temps). On reste sur du prévisionnel. |
| Référentiel officiel des affaires | **Nova reste maître.** TaskFlow = pilotage interne du groupe. |
| Nature de l'outil | Outil de **pilotage opérationnel** du groupe, pas un référentiel institutionnel. |

**Conséquence structurante** : le lien entre TaskFlow et Nova/Efficy n'est pas une
intégration API (SSO, pas d'accès données), c'est le **code affaire Nova** (`24-ME-0428`,
`26-ME-0117`…) recopié comme **clé métier** dans TaskFlow. Zéro double-pilotage : Nova
tient l'officiel (avancement, allocations institutionnelles), TaskFlow tient le
prévisionnel fin du groupe.

---

## 2. Ce que contiennent les fichiers (modèle réel GIDI)

### 2.1 Plan de charge (PDC)

Granularité = **affaire × référent GIDI × trimestre × grade**, en **jours**.

- ~30 affaires programmées 2026, chacune avec :
  - code Nova (`25-ME-xxxx`) ou statut « ??? / Attente réponse » quand pas encore créée,
  - département demandeur (DMOB, DTVB, DTERMED, GIDI…), secteur, typologie (tiers/SCSP/mixte),
  - **statut de gouvernance** : Validé / En Attente / En Suspens / Annulé,
  - **référent GIDI** (1 initiale : BR/RB/NL/MR/XD),
  - **estimation en jours** + répartition **par personne** (colonnes BR, RB, NL, MR, XD)
    et **par trimestre** (T1/T2/T3/T4).
- Feuille « Potentiel production » = capacité, situation au 01/01/2026 :

  | | Bernard | Mathieu | Nicolas | Olivier | Romain | Xavier | **Total** |
  |---|---|---|---|---|---|---|---|
  | ETP (après décharge/TP) | 1 | 0,8 | 1 | 0 | 0,8 | 1 | **4,6** |
  | Jours de production | 160 | 104 | 160 | 160 | 160 | 80 | 824 |
  | Décharge (syndicat, ASCE…) | 0 | 0 | 0 | 160 | 32 | 0 | 192 |
  | **Potentiel prod (j)** | **160** | **104** | **160** | **0** | **128** | **80** | **632** |

- **Grades** : `B-B+` = {Bernard, Nicolas, Romain} = 448 j ; `A+` = {Mathieu, Xavier} = 184 j.
- Agrégat clé du **comité de gouvernance** : *part des jours programmés / potentiel de
  production*, global **et par grade** (ex. 2026 : 574 j programmés = 90,8 % du potentiel).

**Correspondance initiales → personnes** (à confirmer) :

| Initiale | Personne | Grade |
|---|---|---|
| BR | Bernard Rongione | B-B+ |
| RB | Romain Bouzige | B-B+ |
| NL | Nicolas Laval | B-B+ |
| MR | Mathieu Rajerisson | A+ |
| XD | Xavier Durang | A+ |
| — | Olivier Gleizes | décharge 100 % (0 j prod) |

### 2.2 Congés

Calendrier par période (juillet, août, Toussaint, Noël 2026), **maille demi-journée**
(chaque jour = 2 colonnes Matin / Après-midi). Types d'absence recensés :
`Congés`, `RTTCO`, `Congés obligatoires`, `CMO` (maladie), `Férié`,
`Vacances scolaires zone B` (info, pas une absence individuelle), + ligne calculée
`nb présents`.

---

## 3. Mapping vers les tables TaskFlow

TaskFlow expose déjà les 5 tables/colonnes nécessaires (`Tasks`, `Team`, `Projects`,
`Disponibilites`, colonnes opt-in du Plan). **Le travail est de la modélisation, pas du
dev de fond.** Rappel du schéma dans `COLUMNS_SPEC.md` et `CLAUDE.md`.

### 3.1 Affaires → table `Tasks` (1 ligne = 1 affaire GIDI)

| Donnée PDC | Colonne TaskFlow | Remarque |
|---|---|---|
| Nom de l'affaire | `titre` | |
| Code Nova (`26-ME-0117`) | `tags` (ou colonne texte dédiée `codeNova`) | **clé de rapprochement avec Nova** |
| Statut gouvernance | `statut` (Choice) | Options = `Validé / En attente / En suspens / Annulé`. Statuts **dynamiques** (`statusCfg`), donc configurables sans code. |
| Référent GIDI | `assignees` (RefList:Team) | 1 référent principal, éventuellement plusieurs contributeurs. |
| Répartition jours par personne | `charges` (JSON `[{teamId, heures}]`) | **jours → heures** (voir §4). |
| Estimation jours totale | `estimationH` | Cohérence/repli si `charges` vide. |
| Planning T1..T4 | `dateDebut` / `dateEcheance` | Bornes = 1ᵉ et dernier trimestre actifs (voir §4, granularité trimestrielle). |
| Département demandeur, typologie, secteur | `tags` (ChoiceList) ou colonnes ajoutées | Sert aux filtres/agrégats gouvernance. |
| Lien Box, commentaires | `description` | |

**Décomposition trimestrielle (option, §4)** : si on veut la précision par trimestre du
PDC, on éclate chaque affaire en sous-tâches `parentTask` (une par trimestre actif) avec
dates de trimestre exactes. Baseline sans décomposition = 1 tâche / affaire.

### 3.2 Personnes & capacité → table `Team` (+ Plan)

| Donnée | Colonne TaskFlow | Remarque |
|---|---|---|
| Membre (6 personnes GIDI) | `nom` | |
| Grade B-B+ / A+ | `role` (Choice) | **indispensable** pour l'agrégat gouvernance par grade. |
| Capacité nominale | `capaciteHebdo` (Numeric, opt-in Plan) | Baseline hebdo, ex. 35 h (5 j × 7 h). |
| ETP / décharge / temps partiel | table `Disponibilites` | Modélisés en dispo datée (voir §3.3), **pas** en capacité nominale. |

### 3.3 Congés & disponibilités → table `Disponibilites`

Table déjà conçue (`DISPONIBILITES_DESIGN.md`), datée, opt-in, créée par le Plan.
Schéma : `membre Ref:Team, type Choice, dateDebut Date, dateFin Date, dispo Numeric(0..1), commentaire`.

| Donnée congés | Ligne `Disponibilites` |
|---|---|
| Congé / Congé obligatoire / Férié | `type` correspondant, `dispo = 0` |
| RTTCO | `type = rtt`, `dispo = 0` |
| CMO (maladie) | `type = maladie`, `dispo = 0` |
| Demi-journée d'absence | `dispo = 0.5` sur le jour concerné (le calcul `indispoFrac` gère la fraction) |
| Temps partiel durable (Mathieu, Romain à 0,8) | 1 ligne `type = temps partiel`, `dispo ≈ 0.8`, plage annuelle |
| Décharge 100 % (Olivier) | 1 ligne `dispo = 0`, plage annuelle |
| Vacances scolaires zone B | **non importé** (info collective, pas une absence individuelle) |

La capacité effective d'une période = `capPeriod(capaciteHebdo) × (1 − indispoFrac)` —
formule existante inchangée. La maille demi-journée est déjà supportée via `dispo = 0.5`.

### 3.4 Projets / regroupements → table `Projects` (optionnel)

Deux usages possibles de `Projects`, à trancher (§5) :
- **Département demandeur** (DMOB, DTVB…) comme « projet » → couleur + regroupement natif.
- Ou laisser `Projects` pour un futur découpage, et porter le département en `tags`.
Le **portefeuille** (regroupement d'affaires) est déjà géré (table `Portefeuilles` opt-in)
si besoin d'un niveau au-dessus.

---

## 4. Unités & maille — le vrai point d'attention

TaskFlow raisonne en **heures / semaines** ; le PDC en **jours / trimestres**. Deux
conversions à figer une fois pour toutes :

1. **Jour ↔ heure** : poser `1 j = 7 h` (agent Cerema). `charges` et `estimationH` stockés
   en heures ; l'affichage Plan peut basculer en **jours** (unité native du Plan). Le
   « potentiel de production » annuel (632 j) se retrouve via `capaciteHebdo × semaines
   travaillées × (1 − indispoFrac)`.
2. **Trimestre ↔ semaines** : le Plan étale une charge sur la **durée de la tâche**. Deux
   niveaux de fidélité :
   - **Baseline** : dates d'affaire = span des trimestres actifs, étalement homogène.
     Simple, suffisant pour une vue de charge, mais lisse les à-coups trimestriels.
   - **Fidèle** : sous-tâches par trimestre (`parentTask`) avec dates de trimestre. Reproduit
     exactement le T1/T2/T3/T4 du PDC, au prix de ~2-4× plus de lignes.

   > Le PDC ne donne **pas** la répartition personne × trimestre (seulement affaire × personne
   > **et** affaire × trimestre, séparément). La granularité honnête est donc l'affaire ;
   > la décomposition trimestrielle reste un agrégat de contrôle, pas une donnée par personne.

---

## 5. Restitution gouvernance

Objectif : reproduire dans le **Dashboard** (et/ou le Plan groupé par **Rôle**) l'agrégat
du comité :

- **Jours programmés vs potentiel de production**, en global **et par grade** (B-B+ / A+),
  en % (l'Excel affiche 90,8 % global, 40,6 % B-B+, etc. — certains > 100 % = surcharge).
- Répartition **par statut** de gouvernance (Validé / En attente / En suspens / Annulé).
- Optionnel : par **département demandeur**, par **référent**.

Faisabilité : le Plan groupe déjà par **Rôle** (→ grade) et calcule capacité vs charge ;
le Dashboard fournit KPI / Donut / Barres. Le pré-requis est d'avoir renseigné `Team.role`
(grade) et `Tasks.statut` (gouvernance) — pas de dev nouveau, du paramétrage.

---

## 6. Enjeux & risques (synthèse)

| Enjeu | Nature | Traitement proposé |
|---|---|---|
| Double saisie Nova ↔ TaskFlow | Organisationnel | Nova maître ; code Nova = clé ; TaskFlow ne prétend pas à l'officiel. |
| Divergence des données | Organisationnel | Un seul endroit fait foi par donnée (cf. §1) ; pas de sync automatique. |
| Unités jours/heures, maille trimestre/semaine | Modélisation | Conventions figées §4 (1 j = 7 h ; baseline vs sous-tâches). |
| Granularité personne × trimestre absente du PDC | Donnée | Granularité = affaire ; trimestre = contrôle agrégé. |
| Maille demi-journée des congés | Modélisation | `dispo = 0.5` (déjà supporté). |
| Adoption | Humain | Périmètre volontairement **prévisionnel** (pas de CRA) → faible friction, proche de l'Excel actuel mais avec 3 vues. |

---

## 7. Prochaines étapes (proposées, non engagées)

1. **Valider ce cadrage** (correspondances initiales/personnes, conventions d'unités, choix
   baseline vs sous-tâches trimestrielles, usage de `Projects`).
2. Figer la **liste des statuts de gouvernance** et des **types d'absence** (Choices).
3. **Maquette démo** : charger les données GIDI 2026 en mode démo dans le Plan + Calendar
   pour visualiser le rendu (charge par personne, potentiel par grade, congés).
4. Si concluant : import réel dans un document Grist dédié GIDI (Kanban maître → Plan →
   Disponibilites), puis Dashboard gouvernance.

> Rien n'est développé ni publié tant que le §1 et le §5 ne sont pas validés. Aucun impact
> sur `published/` ni sur les autres usages de TaskFlow.
