# Plan de charge — Vue dédiée (Niveau 2)

Spécification de la **5ᵉ vue** de la suite TaskFlow : un outil de pilotage de la
charge des ressources, complémentaire (et **distinct**) du Gantt.

Statut : proposition / cadrage pour devis (#3 plan de charge).
Pré-requis acquis : charge propre + consolidée, étalement temporel, capacité,
composant Dashboard "Plan de charge" (Niveau 0–1, livrés et validés).

---

## 1. Pourquoi une vue dédiée (et pourquoi ce n'est PAS un Gantt)

Le Gantt et le plan de charge partagent une timeline en abscisse, mais répondent
à deux questions différentes :

| | **Gantt** (déjà dans la suite) | **Plan de charge** (cette vue) |
|---|---|---|
| Orientation | tâche-centré | **ressource-centré** |
| Une ligne = | une tâche (barre début→fin) | **une personne** |
| Une cellule = | présence d'une tâche | **somme des heures** de toutes ses tâches sur la période |
| Référentiel | séquence / dépendances | **capacité** (h/semaine) |
| Couleur | priorité / statut | **taux de charge** (OK / >85% / surcharge) |
| Répond à | *quand ? dans quel ordre ?* | *qui est surchargé, quand ? qui a de la dispo ?* |

Le geste clé — **agréger** des fractions de plusieurs tâches par personne et les
comparer à une **capacité** — est précisément ce qu'un Gantt ne fait pas. Deux
tâches qui se chevauchent pour Alice = 2 barres sur le Gantt, mais **150 % de
charge** (cellule rouge) sur le plan de charge.

→ Vues **complémentaires**. On garde les deux. Le plan de charge **réutilise** le
Gantt pour le détail des tâches (cf. §6), il ne le reduplique pas.

---

## 2. Principe directeur (cycle d'usage optimal)

1. **Capacité** saisie une fois par personne (+ congés / indispos).
2. **Charge** par personne sur les tâches (ou dérivée de `estimationH ÷ nb assignés`).
3. **Heatmap** → repérer les surcharges (rouge) en un coup d'œil.
4. **Drill** d'une cellule → voir les tâches qui composent la charge.
5. **Réaffecter / replanifier** (dates, assigné, charge) → la heatmap se recalcule.
6. **Suivre** prévu vs réalisé en cours de route.

---

## 3. Principes d'affichage

Plein écran, en-têtes figés. La **heatmap est le cœur** (ce n'est pas un Gantt).

```
Plan de charge  [Sem|Mois]  [◀ S23 → S30 ▶ Auj.]  [Grouper: Personne ▾]  [Heures|%]  [Prévu|Réalisé]  [Filtres]  [Export]
┌──────────────┬──────┬──────┬──────┬──────┬─────   ← en-tête périodes figé (S courante surlignée •)
│ Ressource    │ S23• │ S24  │ S25  │ S26  │ ...
├──────────────┼──────┼──────┼──────┼──────┤
│ Alice  (35h) │ 3.7  │ 3.2  │  ·   │      │        ← cellule = taux vs capacité (couleur)
│ Bob    (35h) │ 8.3  │ 7.7  │      │      │
│ Claire (35h) │  ·   │  ·   │      │      │        ← sous-emploi visible (capacité dispo)
├──────────────┼──────┼──────┼──────┤
│ TOTAL équipe │ 12.0 │ 10.9 │ ...  │      │        ← pied : charge vs capacité totale
└──────────────┴──────┴──────┴──────┘
⚠ 0 surcharge · Claire sous-employée S23-S30 · 1 tâche chargée non datée
```

- **Lignes** = ressources, **colonnes** = périodes, **cellule** = charge agrégée.
- **Couleur = taux vs capacité** : bleu OK / orange > 85 % / rouge surcharge /
  gris = capacité réduite (congé). Cohérent avec la tuile Dashboard.
- **Toggle Heures ↔ %** : par défaut **%** (le taux révèle la surcharge), heures
  au survol / dans la cellule.
- **Colonne ressource figée** + **en-tête périodes figé**, scroll horizontal sur
  la durée. Période courante surlignée (`•`).
- **Pied de tableau** : total charge vs capacité de l'équipe par période.
- **Bandeau d'alertes** : nb surcharges, sous-emploi, tâches chargées non datées
  (transparence — pas d'omission silencieuse).
- **Réutilisation stricte** des primitives : variables dark theme, `charge-row`,
  panel slide-in, couleurs sémantiques (statuts / priorités / avatars).

---

## 4. Fonctionnement / interactions

| Interaction | Comportement |
|---|---|
| **Grouper par** | Personne (défaut) · **Projet** · **Équipe** · Rôle |
| **Navigation** | ◀▶ + "Aujourd'hui", granularité semaine/mois, plage de périodes |
| **Drill cellule** | clic → panel : tâches composant la charge (titre, projet, h, part dans la période) |
| **Édition capacité** | inline / panel : `Team.capaciteHebdo` |
| **Indispos / congés** | saisie de périodes off → **réduit la capacité** sur ces semaines (cellules grises) |
| **Prévu vs Réalisé** | toggle : planifié (charges) vs réalisé (`tempsPasse`) → met en évidence les écarts |
| **Filtres** | projet / équipe / personne / statut — partagés inter-widgets (`setOptions`) |
| **Sélection croisée** | clic ressource / tâche → `setSelectedRows` (sync Kanban/Gantt) |
| **Export** | PNG / print / CSV (COPIL) |

Par défaut : exclut les tâches **terminales** (plan prévisionnel), option
"Inclure terminé". Étalement sur **jours calendaires** en 2.0, **jours ouvrés** en option.

---

## 5. Drill-down (le "pourquoi") — sans dupliquer le Gantt

Au clic sur une cellule (personne × période), le **panel slide-in** affiche :

- la **liste des tâches** qui composent la charge de cette personne sur cette
  période : titre, projet, heures, part de la tâche tombant dans la période ;
- un bouton **« Ouvrir dans le Gantt »** filtré sur la personne → on réutilise le
  Gantt existant pour la vue calendaire des tâches, au lieu d'en recoder une.

C'est la décision d'architecture qui garde la vue **focalisée** (heatmap +
capacité) et évite la redondance avec le Gantt.

---

## 6. Données (réutilisation + ajouts minimes)

**Réutilise** (aucune migration) : `Tasks.charges` (charge propre),
`dateDebut`/`dateEcheance`, `assignees`, `projet`, `tempsPasse`,
`Team.capaciteHebdo`, et le core (`chargeByMemberPeriod`, `periodRange`,
`shiftPeriods`, `parseCharges`, `isTerminal`).

**Ajout core** : `chargeMatrix(tasks, { by:'person'|'project'|'team', granularity })`
— un seul étalement, pivot par dimension (factorise le calcul pour toutes les vues
et le pied de tableau).

**Indispos / congés** — 2 options :
- **A. (recommandée, légère)** colonne JSON `Team.indispos = [{start,end,type}]`,
  même pattern que `charges`. Additif, rétrocompatible, aucune table.
- B. table `Indispos` dédiée si requêtable / partagée requis (réserve 2b).

**Prévu vs réalisé** : réalisé = `tempsPasse` étalé (approché) au Niveau 2. Un
phasage réel exact = timesheets → Niveau 3, hors cadre widget.

---

## 7. Plan d'attaque chiffré (devis)

| Phase | Contenu | Estimation |
|---|---|---|
| **2.0 — Socle vue dédiée** | nouveau widget (5ᵉ pilier), grille resource×temps full-screen, sticky, scroll, navigation, **group-by Personne/Projet/Équipe**, toggle heures/%, pied de tableau, alertes, **drill cellule** (liste + lien Gantt), filtres. | **3–4 j** |
| **2.1 — Capacité & indispos** | édition capacité, `Team.indispos`, réduction de capacité par période, recalcul des taux | **2–3 j** |
| **2.2 — Prévu vs réalisé** | overlay planifié / réalisé, écarts | **2 j** |
| **2.3 — Restitution** | agrégation projet / équipe / portefeuille, alertes surcharge, **export COPIL** | **2 j** |
| Option | jours ouvrés + jours fériés dans l'étalement | **+1 j** |
| Option | dérivation charge par défaut depuis `estimationH ÷ nb assignés` | **+0,5 j** |

**Total ≈ 9–12 j** selon options. Jalonné : la **2.0 seule** = outil de pilotage
autonome livrable.

---

## 8. Garde-fous d'intégration (harmonie avec l'existant)

- **Un fichier de plus dans la suite**, pas un one-off : core inliné via
  `build-taskflow`, dark theme, panel slide-in, conventions de données identiques.
- Le **Dashboard garde sa tuile compacte** "Plan de charge" comme résumé ; la vue
  dédiée est l'outil d'arbitrage.
- **Zéro nouvelle table obligatoire** en 2.0 ; seul `Team.indispos` en 2.1, additif
  et rétrocompatible (`ensureSchema` l'ajoute à l'ouverture).
- S'insère dans la **barre de nav basse** (Kanban / Gantt / Agenda / Tableau /
  **Plan de charge**).

---

## 9. Arbitrages à trancher avant la Phase 2.0

1. **Affichage cellule par défaut** : % de capacité (recommandé) ou heures ?
2. **Granularité par défaut** : semaine (recommandé) ou mois ?
3. **Stockage indispos** : JSON `Team.indispos` (recommandé) ou table dédiée ?
4. **Périmètre du devis** : 2.0 seule, ou 2.0 + 2.1, ou lot complet 2.0→2.3 ?
5. **Dark theme** : confirmé comme direction de toute la suite ?
