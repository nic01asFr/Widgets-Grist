# Audit ergonomie — usage « gestion de projet au quotidien »

Audit multi-agents des 5 widgets TaskFlow (Kanban, Gantt, Calendrier, Plan, Dashboard) confronté au modèle actuel :
**Portefeuille (département) › Projet (affaire) › Tâche (le travail, assignée, datée, type tâche/jalon/réunion) › Sous-tâche (WBS) › Checklist**, statuts de gouvernance **En attente / Validé / En suspens / Annulé**, remplissage self-service.

Date : 2026-07-08.

---

## Thèmes transverses, par ordre d'impact

### 🔴 P0 — Statut « dernier = terminé » incompatible avec des statuts de gouvernance (CAUSE RACINE)
Le core pose `terminalValue = dernier statut de la liste` = **« Annulé »**. Tout confond « terminé » et « annulé ». Impacts :
- **Kanban** : glisser une tâche en « Annulé » la marque **100 % + clôturée + grisée** ; « Validé » (vraie clôture métier) ne pose jamais `dateCloture`. (`kanban.html:1503`, `:1948`)
- **Dashboard** : **bouton ✓ « Marquer terminée » passe la tâche en « Annulé »** (perte de données réelle, `dashboard.html:1617`) ; KPI Terminées/Taux/En retard/En cours faux ; vélocité et avancement projet = taux d'annulation. (`dashboard.html:1213-1225`, `:1421-1439`, `:1471-1483`)
- **Plan** : « Validé » ne posant pas `dateCloture`, le Réalisé/délai est faussé.
- **Gantt** : le calcul de retard s'appuierait sur `isTerminal`.

**Fix (dans le core `taskflow-core.js`)** : découpler trois notions — `isDone` / `isDead` / `isLive` — au lieu de « dernier = terminal ». Détection par libellé (`/valid|termin|clos|done/i` = done ; `/annul|abandon|rejet/i` = dead) + surcharge configurable. Rebrancher tous les widgets. Corrige P0 partout d'un coup. Pour NOTRE doc : done = **Validé**, dead = **Annulé**.
**Urgent** : neutraliser le bouton ✓ du Dashboard tant que non corrigé (il détruit des données).

### 🔴 P1 — Jalons & réunions mal servis (transverse)
- **Réunion sans identité visuelle** : `TYPE_ICONS.reunion=''` → une réunion = une tâche à l'œil (Kanban `:630`, Gantt `:709`, Calendrier `:739`).
- **Jalon** : date **masquée** sur la carte Kanban (`:1462`) ; fond transparent quasi invisible au Calendrier (`:141`) ; non déplaçable au Gantt (`:2873`).
- **Aucun filtre par type** (tâche/jalon/réunion) nulle part — besoin PM courant (« mes réunions », « les jalons »).
- **Dashboard Échéances** : pas de badge type (`dashboard.html:1388-1415`).
**Fix** : icône + style dédiés à `reunion` partout ; jalon plus visible + sa date ; **filtre par type** (Kanban/Calendrier/Dashboard) ; jalon déplaçable au Gantt.

### 🔴 P1 — Pas de regroupement par projet/portefeuille dans les vues
- **Gantt** : lignes entrelacées tous projets confondus, aucune swimlane/en-tête projet → **multi-projets illisible** (déjà #1 du backlog, `gantt.html:1351-1381`).
- **Kanban** : niveau **Portefeuille absent** des groupements (`:566-575`).
**Fix** : Gantt `groupMode` (aucun/projet/portefeuille) avec en-têtes repliables ; Kanban bouton « Portefeuille » (opt-in, helpers du Plan `portefKeyOf`).

### 🟠 P1 — Retards invisibles
- **Gantt** : une tâche échue non terminée n'a **aucun signal** (`gantt.html:2028-2050`).
**Fix** : `late = échéance < aujourd'hui && !isDone && prog<100` → liseré rouge/badge (barre + ligne gauche). (Dashboard corrigé par P0.)

### 🔴 P1 — Plan : amorçage de la charge impossible (contexte « repartir propre »)
- **On ne peut pas allouer de charge à une tâche qui n'en a pas** : `tasksInCell` exclut les tâches sans `charges` → drill toujours vide (`plan.html:1148`, `:1226`).
- **Empty-state passif** : le Plan n'oriente pas vers le point de saisie (`plan.html:873`).
**Fix** : « + Allouer une tâche » dans la cellule (select tâches de la personne sans charge → `setCharge`) ; empty-state diagnostique (« N tâches estimées non réparties → Estimer / Init » ou « saisissez l'estimation dans le Kanban »).

### 🟠 P2 — Lisibilité des agrégats (Dashboard)
- Barres **Par projet / Par département non triées, non plafonnées** → 28 lignes ingérables (`dashboard.html:1280-1288`) ; labels sans ellipsis (`:176`). Légende Gantt tronquée à 8 sans « +N » (`gantt.html:1706`).
**Fix** : tri desc + top-N + « +N autres » + ellipsis.

### 🟠 P2 — Navigation / rebond
- **Dashboard cul-de-sac** : graphes non cliquables ; liens tabbar relatifs cassés en prod mobile (`dashboard.html:1698-1703`).
- **Plan** : clic tâche n'appelle pas `setSelectedRows` (`plan.html:1085`).
**Fix** : barres/projets cliquables → filtre local ; `setSelectedRows` au clic (Plan + Dashboard) ; corriger les liens de nav.

### 🟠 P2 — Calendrier : structurellement un « aperçu de tâches longues », pas un agenda
- Grille horaire 24 h **vide** qui écrase la bande d'événements (plafonnée 3 lanes) (`calendar.html:1987`, `:1899`).
- Tâches longues **cannibalisent** les lanes → jalons/réunions ponctuels passent en « +N » (`:1704`).
- 7 vues dont 3 redondantes (Semaine/2 Sem/5 Jours) + 3 survols lecture seule.
- Aucun drag pour replanifier.
**Fix** : supprimer la grille 24 h morte (bande pleine hauteur) ; prioriser les ponctuels dans le tri + toggle « masquer tâches longues » ; dégraisser les vues ; drag horizontal.

### 🟡 P3 — Frictions & pièges silencieux
- **Kanban** : réordonnancement vertical **non persisté** (`:1492`) ; tâche disparaît si son statut n'existe plus (pas de colonne fourre-tout, `:1408`) ; save abandonnée sur dates invalides = divergence local/serveur (`:2069`) ; recherche titre seul (`:1316`) ; pas de filtre tag/type.
- **Gantt** : dépendances **disparaissent** si une extrémité est repliée/filtrée (`:2072`) ; pas de feedback date pendant le drag (`:2903`) ; pas de création de lien depuis la timeline ; pas de « tout déplier ».
- **Plan** : input édite le **total** de la tâche alors que la ligne parle de la période (`:1216` vs `:1219`) ; **thème sombre figé** (pas d'auto light/dark, `:9`) ; capacité 35 h par défaut invisible ; drag non tactile.
- **Dashboard** : filtre période ignore les tâches sans `dateEcheance` (`:911`) ; incohérences de libellés.

---

## Plan d'action proposé (par vagues)

- **Vague 0 (P0 core)** : refonte sémantique statut (`isDone/isDead/isLive` + config) → rebranche Kanban/Gantt/Calendar/Plan/Dashboard. + neutraliser le ✓ Dashboard destructeur. **Plus haut ROI, débloque le reste.**
- **Vague 1 (P1 quotidien)** : jalons/réunions (icônes + visibilité + filtre type) · regroupement projet Gantt + Portefeuille Kanban · retards visibles Gantt · Plan amorçage charge.
- **Vague 2 (P2 lisibilité/nav)** : Dashboard barres triées/plafonnées + rebond cliquable · Calendrier dégraissé + drag · Plan thème clair + setSelectedRows.
- **Vague 3 (P3 robustesse)** : colonnes fourre-tout, dépendances repliées, validations dates, recherche étendue, réordonnancement persisté.

Rappel : tout est faisable en vanilla JS dans l'existant. Le core (statut) passe par `core/taskflow-core.js` + `node scripts/build-taskflow.js`.
