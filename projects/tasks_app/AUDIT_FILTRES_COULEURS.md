# Audit — Filtres, couleurs & groupement (TaskFlow)

Audit mené sur un **cas d'usage réel** : doc Grist « Activité GIDI » (6 personnes, 9 départements, 31 affaires parentes + 61 sous-tâches, 2 statuts). Objectif : évaluer la pertinence et la lisibilité des filtres, couleurs et groupements dans les 5 widgets, et lister les améliorations.

Statut : **évaluation** (rien implémenté). Observé en Grist réel (widgets déployés gh-pages).

---

## Biais du jeu de test (à garder en tête)
- **Priorité non renseignée** → toutes les tâches en « Moyenne ». Donc *colorer/filtrer par priorité* est dégénéré (tout bleu, tout dans un seau). C'est une limite de **donnée**, pas du widget — mais ça révèle que la priorité est le **mauvais défaut** pour ce cas.
- **Dates toutes en année pleine** (baseline) → axes temporels Gantt/Calendrier peu discriminants.
- Statut à 2 valeurs, département à 9, assigné à 6 → bons pour tester couleur/filtre par ces axes.

---

## Constats TRANSVERSES (les plus importants)

### T1 — 🔴 Les filtres NE se synchronisent PAS entre les pages
Filtre « assigné = Mathieu » posé dans le **Kanban** (page p/8) → le **Gantt** (page p/11) reste à 31 tâches, non filtré. Chaque widget custom est une **section Grist indépendante** avec ses propres options ; la diffusion `setOptions`/`onOptions` ne partage rien entre pages distinctes. La synchro inter-widgets décrite dans le CLAUDE ne vaut que dans une **page composée** (launcher/nav-gating), pas dans le layout « 1 widget = 1 page » utilisé ici.
→ **Impact** : l'utilisateur qui filtre sur une vue doit re-filtrer sur chaque autre. Incohérent pour un « suivi » multi-vues.
→ **Pistes** : (a) filtres persistés au niveau **document** (table de préférences ou `grist.setOption` doc-level) plutôt que section ; (b) ou assumer l'usage **launcher** (toutes les vues dans une page) ; (c) au minimum, le documenter.

### T2 — 🟠 Poser un filtre marque le document « à enregistrer »
Cocher un filtre fait apparaître le bouton **« Enregistrer »** (Grist détecte une écriture d'options de section). Un simple filtrage de lecture ne devrait pas salir le doc. Déjà tranché pour colorMode/sortMode (localStorage) — **à étendre aux filtres** (localStorage au lieu de `setOptions`), sauf si le partage inter-utilisateurs est explicitement voulu.

---

## KANBAN

**Groupement** : Statut / Priorité / Projet. **Couleur** : Priorité / Projet / Assigné / Statut. **Filtres** : Projets(=départements) / Priorités / Assignés / Statuts.

| # | Constat | Verdict |
|---|---|---|
| K1 | **Pas de groupement « par Assigné »** (colonnes = personnes). Évident pour un suivi d'équipe. | 🔴 Manque |
| K2 | **Colorer par Assigné ambigu sur cartes multi-assignés** : une affaire à 4 personnes prend la couleur du **1er assigné** seulement → couleur trompeuse. | 🟠 À revoir |
| K3 | **Bruit sur chaque carte** : « Moyenne » + « 31 déc » + « 0 % » affichés partout alors qu'uniformes → 3 badges non informatifs. Masquer les champs uniformes/vides, ou rendre les champs de carte **configurables**. | 🟠 Lisibilité |
| K4 | Pas de **légende** du mode couleur courant (on ne sait pas ce que code la couleur). | 🟡 |
| K5 | Filtre **par grade** (rôle B-B+/A+) absent — utile en gouvernance. Filtre par **affaire** absent (seulement département). | 🟡 Manque |
| K6 | Groupement/filtre « Projet » = **département** (car `Tasks.projet`=département) → le libellé « Projet » prête à confusion avec l'affaire. | 🟡 Nommage |

**OK** : filtre fonctionne (comptes recalculés), cartes au niveau projet (badge « ↳ N » sous-tâches), avatars contributeurs.

---

## GANTT

**Tri** : Priorité (+ autres). **Couleur** : Priorité (défaut) [mêmes 4 modes, core partagé]. **Vues** : Sem/Mois/Trim/6M/An. **Légende** : Critique/Haute/Moyenne/Basse/Jalon.

| # | Constat | Verdict |
|---|---|---|
| G1 | **Défaut « Couleur : Priorité »** → tout bleu (données Moyenne). Mauvais défaut pour ce cas ; **Projet ou Assigné** serait parlant. Défaut de couleur à revoir (ou config par doc). | 🟠 |
| G2 | **Panneau gauche illisible** : dates (« 01 janv. ») **chevauchent** les titres de tâches, avatars superposés au texte. Rendu tassé. | 🔴 Lisibilité |
| G3 | Hiérarchie WBS OK (projet repliable + sous-tâches), mais couleur par priorité ne distingue pas parent/enfant. Une **couleur par département** rendrait les projets lisibles d'un coup d'œil. | 🟠 |
| G4 | Légende présente (bien) mais fixe sur priorité — devrait suivre le mode couleur choisi. | 🟡 |

---

## CALENDRIER

**Couleur** : Priorité (défaut). **Filtres** présents. **Vues** : mois/sem/2sem/5j/trim/6M/an.

| # | Constat | Verdict |
|---|---|---|
| C1 | Dates année pleine → **chaque affaire s'étale sur toute l'année**, barres répétées sur tous les mois → vue saturée, peu exploitable en l'état (lié aux données, mais aggravé par l'absence de dates réelles). | 🟠 |
| C2 | Même défaut couleur = Priorité (tout bleu). | 🟠 |
| C3 | Affiche parents + enfants ? à confirmer (le Gantt/Kanban replient ; le Calendrier peut saturer si les 92 s'affichent). | 🟡 À vérifier |

---

## PLAN

**Groupement** : Personne / Projet / Rôle. **Modes** : Prévu/Réalisé/Reste/Dispo. **Unités** : %/h. Couleur = heatmap (charge/capacité), pas le système `getTaskColor`.

| # | Constat | Verdict |
|---|---|---|
| P1 | **Pas de groupement Portefeuille/Équipe** dans le déployé (feature dev non publiée) — le « par Rôle » = par grade, utile. | 🟡 |
| P2 | Heatmap couleur (OK/surcharge/réduite) **claire et pertinente** — bon exemple à généraliser. | ✅ |
| P3 | Filtres du Plan **indépendants** des autres pages (cf. T1). | 🟠 |

---

## DASHBOARD

Composants : KPI, donut « Par statut », barres « Par priorité », etc. Filtres locaux (période/projet/assigné/statut).

| # | Constat | Verdict |
|---|---|---|
| D1 | « Par priorité » = **une seule barre** (tout Moyenne) → composant vide de sens ici. Les composants par défaut devraient s'adapter (ou le doc choisir ses axes : par grade, par département, par statut). | 🟠 |
| D2 | Compte **61** (sous-tâches) et non 31 (affaires) → un dashboard « gouvernance » devrait compter au **niveau projet** (parents), pas les sous-tâches. Besoin d'un axe/filtre **niveau hiérarchique**. | 🟠 |
| D3 | Filtres locaux (non partagés) — cohérent avec le design Dashboard, mais renforce T1. | 🟡 |

---

## Synthèse des améliorations (priorisées)

| Prio | Amélioration | Concerne |
|---|---|---|
| 🔴 P0 | **Synchroniser les filtres entre vues** (niveau doc) OU documenter que c'est par-page + pousser l'usage launcher | Transverse (T1) |
| 🔴 P0 | **Groupement « par Assigné »** dans le Kanban (et idéalement par grade) | Kanban (K1) |
| 🔴 P0 | **Lisibilité panneau gauche Gantt** (chevauchement dates/titres/avatars) | Gantt (G2) |
| 🟠 P1 | **Meilleur défaut de couleur** (Projet/Assigné au lieu de Priorité) + **légende** suivant le mode | Gantt/Calendrier/Kanban (G1,C2,K4,G4) |
| 🟠 P1 | **Couleur multi-assignés** : pastille dégradée / plusieurs points au lieu du 1er assigné | Kanban/Gantt/Calendrier (K2) |
| 🟠 P1 | **Champs de carte configurables** (masquer priorité/date/progression si uniformes/vides) | Kanban (K3) |
| 🟠 P1 | **Filtres ≠ modification doc** (localStorage) | Transverse (T2) |
| 🟠 P1 | **Dashboard : compter au niveau projet** + axes pertinents (grade/département/statut) | Dashboard (D1,D2) |
| 🟡 P2 | Filtre **par grade** et **par affaire/niveau hiérarchique** | Kanban/Dashboard (K5,D2) |
| 🟡 P2 | Clarifier le **nommage « Projet »** quand `Tasks.projet` = département | Transverse (K6) |

**À noter** : plusieurs constats (priorité/dates dégénérées) viennent des **données** GIDI (priorité non saisie, dates année pleine), pas des widgets. Mais ils révèlent que **les défauts (couleur=priorité, dashboard par priorité) sont mal choisis** pour un suivi projet — c'est la vraie leçon exploitable.
