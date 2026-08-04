# Audit des interfaces TaskFlow — synthèse multi-agents

Audit mené par **5 sous-agents** (1 par widget), lecture du code en entier + contexte, sur le cas d'usage réel « Activité GIDI » (équipe Cerema 6 pers., 9 départements, 31 affaires parentes + ~61 sous-tâches « affaire — personne », dates année pleine, priorité non saisie, `Disponibilites` pour décharge/temps partiel).

Statut : **évaluation** (aucun code modifié par les agents). Recoupé avec l'audit live déjà mené sur Kanban/Gantt/Calendrier.

## Verdicts globaux

| Widget | OK | Pertinent | Optimal | Bloqueur principal |
|---|:--:|:--:|:--:|---|
| **Kanban** | ✅ | ✅ | ❌ | Statut par défaut `'todo'` codé en dur → cartes orphelines ; a11y quasi nulle |
| **Gantt** | ✅ | ✅ | ❌ | Pas de filtre Statut/masquer-terminé ; vues neutralisées par dates année-pleine |
| **Calendrier** | ✅ | ⚠️ | ❌ | Troncature silencieuse à 3 lanes (perte de données) ; saturation année-pleine |
| **Plan** | ✅ | ✅ | ❌ | Défaut semaine + horizon figé + étalement uniforme → heatmap muette sur un an |
| **Dashboard** | ✅ | ⚠️ | ❌ | Impossible de compter au niveau affaire (31) ; axe grade absent |

Tous **fonctionnels et robustes** (statuts dynamiques, ACL, dark mode, anti-cycle, démo). Aucun n'est **optimal** pour ce cas — mais les écarts sont ciblés et corrigeables.

---

## Constats TRANSVERSES (le plus rentable — à corriger de façon harmonisée)

### T1 — 🔴 Accessibilité (RGAA) faible dans les 5 widgets
Contrôles en `<div onclick>`/`<span onclick>` sans `tabindex`/`role`/gestion clavier ; drag sans alternative clavier ; info portée par la **couleur seule** ; icônes sans `aria-label` ; pas de landmarks `<header>/<main>` ni `<label>`.
Ancres : Kanban A1/A2 (l.1463, 1276, 570), Gantt G9 (l.1859, 1854, 2025), Calendrier P-I (l.649-651, 681), Plan I (l.933), Dashboard.
→ **Enjeu établissement public.** Chantier transverse (pattern commun à factoriser dans le core).

### T2 — 🔴 Statuts « dynamiques » trahis par des valeurs codées en dur
- Kanban : création avec `statut:'todo'` littéral (l.1558/1570/1583) → **avec les statuts custom GIDI, carte créée sans colonne = invisible**. `prereq-badge` stylé par classes figées (I6, l.1815).
- Calendrier : `getStatusInfo` map hardcodé `todo/inprogress/review/done` (l.1338) → badge de barre sans couleur pour statut custom.
→ Remplacer partout par `statusCfg.firstValue` / `TF.getStatus(statusCfg, …)`.

### T3 — 🟠 Bug dark mode : week-ends rose vif (`#fef2f2` codé en dur)
Gantt (l.80, 148-149) **et** Calendrier (l.125, 170, 181, 202). Le bloc `@media dark` ne surcharge pas ces couleurs. → passer par une variable `--bg-weekend` thémée.

### T4 — 🟠 Couleur multi-assignés = 1er assigné seulement
`getTaskColor` mode `assignee` → `a[0]` (Kanban l.1105 ; même logique Gantt/Calendrier). Une affaire à 4 personnes prend 1 couleur arbitraire. → pastille dégradée / multi-points.

### T5 — 🟠 Dates « année pleine » : les 3 widgets temporels perdent leur pouvoir discriminant, sans échappatoire
- Gantt G2 : `computeEffectiveRange` étend la plage à toute tâche chevauchante → Sem/Mois/Trim ≈ identiques (l.1710).
- Calendrier P-A : barre = toujours la plage complète → mur de barres répétées (l.1676).
- Plan A/B : étalement uniforme sur 365 j → heatmap ne « pique » jamais ; horizon figé à 12, défaut semaine (l.552, 654).
→ Escape hatches : mode « échéance seule » (Calendrier), plage bornée + chevrons hors-fenêtre (Gantt), défaut mensuel + horizon réglable + profil d'effort (Plan). *La donnée est en cause, mais l'absence d'échappatoire est un défaut widget.*

### T6 — 🟠 Restes du défaut « priorité » (déjà écarté pour la couleur, pas ailleurs)
Gantt : tri défaut « Priorité » inopérant (l.1105) + barre-priorité + ligne tooltip priorité systématiques. Dashboard : composant Barres défaut `priorite` **dégénéré** (1 pleine + 3 vides ; `renderBars` ne filtre pas les vides contrairement au donut, l.1269). → défauts en date/statut ; masquer priorité quand uniforme.

### T7 — 🟡 Nommage « Projet » = département (prête à confusion avec l'affaire)
Kanban (l.1417, 1470), Dashboard (options/chips). → libellé configurable (« Département »).

---

## Top par widget (au-delà du transverse)

**Kanban** — B1 filtre statut non diffusé (émission/réception, l.2108/2090) ; B3 réordonnancement intra-colonne non persisté (`handleDrop` l.1481) ; I2 pas de légende couleur ; I3 pas de filtre grade/tag ; I4 recherche titre seul ; I5 `confirm()` natif (l.1526).

**Gantt** — G1 🔴 **pas de filtre Statut / masquer-terminé** (l.1113) ; G3 colonne Tâches non redimensionnable (l.27) ; G6 réordonnancement manuel incorrect en hiérarchie (l.1882) ; G7 légende Projet tronquée à 8 → **9ᵉ département sans entrée** (l.1684) ; G8 dépendance masquée si un bout replié (l.2034).

**Calendrier** — P-B 🔴 **troncature silencieuse à 3 lanes** en semaine/2sem/5j (l.1886/1898, pas de `+N`) ; P-C vues compactes ignorent le mode couleur (l.2122/2242) ; P-D **congés/`Disponibilites` absents** ; P-E timeline 24h en espace mort (tout all-day) ; P-H panneau jour non discriminant sous saturation. ✅ Le risque « 92 items » **n'existe pas** (hiérarchie masquée par défaut → 31 parents).

**Plan** — A/B 🔴 défaut semaine + horizon 12 figé + étalement uniforme → heatmap muette sur un an (seule la vue Mois sauve) ; D **pas de groupement par affaire (parentTask)** ; E capacité 0/décharge mal rendue (`capOf` force 35 si `capaciteHebdo===0`, l.671 ; en-tête affiche capacité nominale pas réduite) ; G export CSV : lignes d'en-tête de groupe à 0 + mode Dispo non exporté (l.1344) ; H unité « % » = % sur durée totale (illisible sur affaire annuelle, l.1219). ✅ décharge/temps partiel via `Disponibilites` bien modélisés. *Note : le point « sous-tâches sans `projet` » soulevé par l'agent est **résolu sur notre doc** (les sous-tâches portent bien le département) → groupement Département OK.*

**Dashboard** — 🔴 `isRoot` défini mais **jamais branché** dans `getFilteredTasks` (l.854/903) → impossible de compter les 31 affaires ; 🔴 **axe grade/rôle absent** partout (`groupByField` l.1229) ; défaut Barres=priorité dégénéré ; vélocité/complétion sur `dateEcheance` au lieu de `dateCloture` (l.1467) ; vélocité **non theme-aware** (texte SVG `#1e293b` invisible en dark, l.1481) ; agrégat gouvernance « jours programmés/potentiel par grade » absent.

---

## Plan d'action priorisé

### P0 — corrections franches (bugs + bloqueurs d'usage)
1. **Kanban** : défauts `'todo'` → `statusCfg.firstValue` (l.1558/1570/1583). *(bug : cartes orphelines sur statuts custom — concerne GIDI)*
2. **Calendrier** : `+N` + drill dans les vues semaine/2sem/5j (l.1886/1898). *(bug : perte de données silencieuse)*
3. **Gantt** : filtre **Statut** + « masquer terminé » (l.1113/1598/1627).
4. **Dashboard** : brancher `isRoot` → mode de comptage « Affaires (racines) » (l.854/903) ; axe **Grade/Rôle** (`groupByField` l.1229 + options).
5. **Plan** : défaut **mensuel** (ou auto) + **horizon réglable** (l.654) — condition de lisibilité sur données annuelles.

### P1 — transverses harmonisés (fort levier, une fois pour toutes)
6. **T2** statuts hardcodés → dynamiques (Kanban + Calendrier).
7. **T3** week-ends dark thémés (Gantt + Calendrier).
8. **T5** échappatoires dates année-pleine (mode « échéance » Calendrier ; plage bornée Gantt ; profil d'effort Plan).
9. **T6** défauts tri/barres en date/statut + masquer priorité si uniforme.
10. **Plan** : groupement par **affaire (parentTask)** ; rendu capacité 0/décharge (l.671/894/1110) ; export CSV en-têtes (l.1344).
11. **Gantt** : colonne Tâches **redimensionnable** (l.27) ; légende ≥ nb réels de projets (l.1684).
12. **Kanban** : légende couleur ; filtre grade/tag ; persistance ordre intra-colonne.

### P2 — accessibilité + finitions
13. **T1** accessibilité RGAA transverse (rôles/tabindex/clavier/aria/landmarks) — factoriser un pattern commun.
14. **T4** couleur multi-assignés (dégradé/points) — Kanban/Gantt/Calendrier.
15. **T7** libellé « Projet/Département » configurable.
16. Calendrier : congés/`Disponibilites` en calque ; replier timeline 24h. Plan : mémoïsation + `scrollLeft` préservé. Dashboard : vélocité theme-aware + `dateCloture` ; badges de filtre en libellé.

---

## Leçon exploitable
Beaucoup de frictions viennent des **données GIDI** (priorité non saisie, dates année pleine) — mais elles révèlent que les **défauts et l'absence d'échappatoires** des widgets sont mal calibrés pour un **suivi projet annuel** (vs backlog agile court terme). Deux méta-chantiers : (a) des **presets « suivi projet / gouvernance »** (axes statut/département/grade, comptage affaire, défaut mensuel) ; (b) un socle **accessibilité + thème** factorisé dans le core, appliqué aux 5 widgets.
