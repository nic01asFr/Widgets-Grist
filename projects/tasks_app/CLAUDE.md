# CLAUDE.md — TaskFlow

Guide de développement pour la suite de widgets **TaskFlow** (Grist).

---

## Vue d'ensemble

**TaskFlow v15/v16** est une suite de 5 widgets custom Grist pour la gestion de projets/tâches. Tous partagent les mêmes tables et fonctionnent en concert dans le même document Grist.

| Widget | Fichier | Version | Rôle |
|--------|---------|---------|------|
| Kanban | `kanban.html` | v15 | Vue colonnes drag & drop, widget maître (init schéma) |
| Gantt | `gantt.html` | v15 | Timeline avec dépendances et vues multiples |
| Calendar | `calendar.html` | v15 | Calendrier mensuel/hebdo/compact avec barres adaptatives |
| Dashboard | `dashboard.html` | v16 | Dashboard composable avec composants configurables |
| **Plan** | `plan.html` | v16 | **Plan de charge** : heatmap capacité/charge par personne, prévu/réalisé/reste/dispo, timeline, allocation éditable (**opt-in**, voir plus bas) |

Chaque widget est un **fichier HTML autonome** avec CSS et JS inline. Pas de framework — vanilla JS/HTML5/CSS3.

### Code partagé (core inliné)

Le code commun (conversions, dates, statuts dynamiques, calcul de charge, `chargeMatrix`…) vit dans **`core/taskflow-core.js`** (objet global `TF`) et est **inliné** dans chaque widget par `scripts/build-taskflow.js` entre les marqueurs `// <taskflow-core>` / `// </taskflow-core>`.

- Modifier le core → `node scripts/build-taskflow.js` régénère les 6 cibles (kanban/gantt/calendar/dashboard/plan + whiteboard).
- `node scripts/build-taskflow.js --check` vérifie que tout est en phase (utilisé en validation/CI).
- **Ne jamais éditer la zone entre les marqueurs à la main** — éditer `core/taskflow-core.js` puis rebuild.

### Statuts dynamiques (`statusCfg`)

Les statuts ne sont **plus** une enum hardcodée : ils sont lus depuis les Choices réels de la colonne `Tasks.statut` via `TF.loadStatusConfig()` → `statusCfg.byValue[v] = {value, label, fillColor, textColor}`, `statusCfg.terminalValue`, `TF.isTerminal(cfg, value)`. Le dernier statut est considéré « terminal » (clôture). Aucune valeur de statut n'est codée en dur.

### Convention `?nav`

La barre de navigation inter-widgets (bas d'écran, pour passer d'une vue à l'autre) n'apparaît **que si l'URL du widget contient `?nav`** (cas « TaskFlow racine » / page suite). Sans `?nav`, chaque widget est autonome (pas de barre). Activé via `if (new URLSearchParams(location.search).has('nav')) document.body.classList.add('suite-nav')`.

---

## Architecture commune

### Structure d'un fichier

```
<style>          CSS variables :root + styles
HTML body        Header, contenu principal, panel slide-in, overlay, toasts
<script>
  ├── Constantes     CATALOG, STATUS_CONFIG, PRIORITY_COLORS, TOOLTIP_FIELDS...
  ├── État global    let tasks=[], team=[], projects=[], selectedTaskId, panelState
  ├── Utils          escapeHtml, dateToGrist, gristToDate, formatDate, getRefListArray...
  ├── Filtres        filters{}, toggleFilterValue(), getFilteredTasks(), broadcastFilters()
  ├── Panel          openPanel(), closePanel(), openTaskPanel(), openCreatePanel(), renderPanelTask()
  ├── CRUD           saveTaskToGrist(), createTask(), deleteTask()
  ├── Sous-tâches    getSubtasks(), subtasksToJson(), addSubtask(), toggleSubtask(), removeSubtask()
  ├── Rendu          render() + fonctions spécifiques au widget
  ├── Export         exportPrint(), exportPNG()
  └── Init Grist     initGrist(), ensureSchema(), loadAllData(), seedData()
```

### Panel slide-in (pattern commun aux 3 widgets actifs)

```javascript
let panelState = { open: false, isNew: false, taskId: null, taskIndex: -1, editData: null };

openTaskPanel(taskId)   // ouvre avec données existantes
openCreatePanel(opts)   // ouvre vierge (preset statut/projet)
closePanel()            // ferme avec confirmation si modifications
renderPanelTask()       // rafraîchit le DOM du panel depuis editData
saveTaskToGrist()       // UpdateRecord ou AddRecord selon isNew
```

### Filtres inter-widgets (GEN-02)

Les filtres sont diffusés entre widgets via `grist.widgetApi.setOptions()` + `grist.onOptions()`.

```javascript
// Émission (dans toggleFilterValue)
function broadcastFilters() {
    grist.widgetApi?.setOptions({ filters });
}

// Réception (dans initGrist)
grist.onOptions((options) => {
    if (options?.filters) { applyExternalFilters(options.filters); render(); }
});
```

**Important Dashboard :** les filtres du dashboard sont locaux (in-memory) et ne passent PAS par `setOptions` pour éviter une boucle de re-rendu. Seule la config layout est persistée.

### Sélection inter-widgets (GEN-01)

```javascript
// Émission au clic tâche
selectedTaskId = taskId;
grist.setSelectedRows([taskId]);

// Réception depuis un autre widget
grist.onRecord((record) => {
    selectedTaskId = record?.id;
    // highlight DOM
});
```

### Auto-schema (TASKFLOW_SCHEMA)

Le widget Kanban est **widget maître** : il crée automatiquement les 3 tables à l'init. Les autres widgets vérifient et complètent les colonnes manquantes.

> **Exception opt-in** : les colonnes du plan de charge (`charges`, `dateCloture`, `capaciteHebdo`, `indispos`) ne sont **pas** créées par Kanban/Gantt/Calendar/Dashboard — **seul le widget Plan les crée** (voir section « Plan de charge — opt-in »). Les autres widgets ne les écrivent que si elles existent déjà.

```javascript
const TASKFLOW_SCHEMA = {
    Tasks: [...],    // voir schéma complet ci-dessous
    Team: [...],
    Projects: [...]
};

async function ensureSchema() {
    // 1. fetchTable() → table existe ?
    // 2. Non → AddTable avec toutes les colonnes
    // 3. Oui → AddColumn pour chaque colonne manquante
    // 4. Tasks créée → seedData() avec exemples
}
```

---

## Schéma des données

### Table `Tasks` (centrale)

| Colonne | Type Grist | Notes |
|---------|------------|-------|
| `titre` | Text | Titre de la tâche |
| `description` | Text | Corps / détail |
| `statut` | Choice | `todo` / `inprogress` / `review` / `done` |
| `priorite` | Int | 1=Critique, 2=Haute, 3=Moyenne, 4=Basse |
| `type` | Choice | `tache` / `jalon` / `reunion` |
| `progression` | Int | 0-100 (%) |
| `dateDebut` | Date | Timestamp Unix (÷1000 pour JS) |
| `dateEcheance` | Date | Timestamp Unix (÷1000 pour JS) |
| `projet` | Ref:Projects | Référence projet |
| `assignees` | RefList:Team | Liste d'assignés (format `['L', id1, id2]`) |
| `dependDe` | RefList:Tasks | Dépendances (prédécesseurs) |
| `tags` | ChoiceList | Étiquettes libres |
| `estimationH` | Numeric | Estimation en heures |
| `tempsPasse` | Numeric | Temps réellement passé |
| `couleur` | Text | Couleur personnalisée hex |
| `subtasks` | Text | **JSON** : `[{id, text, done}]` (FUT-01) |
| `parentTask` | Ref:Tasks | Décomposition WBS (hiérarchie) — voir section WBS |
| `charges` | Text | **JSON** `[{teamId, heures}]` — répartition de charge par assigné. **Colonne opt-in** créée par le widget Plan |
| `dateCloture` | Date | Date de clôture (posée auto au passage en statut terminal, effacée si réouverture) → réalisé/délai. **Colonne opt-in** créée par le widget Plan |

### Table `Team`

| Colonne | Type | Notes |
|---------|------|-------|
| `nom` | Text | |
| `email` | Text | |
| `role` | Choice | |
| `actif` | Bool | |
| `couleur` | Text | **Couleur hex de l'avatar** (modifiable via picker Kanban) |
| `capaciteHebdo` | Numeric | Capacité hebdomadaire en heures. **Colonne opt-in** créée par le widget Plan |
| `indispos` | Text | **JSON** `[{start, end, label}]` — congés/indispos. **Colonne opt-in** créée par le widget Plan |

### Table `Projects`

| Colonne | Type | Notes |
|---------|------|-------|
| `nom` | Text | |
| `couleur` | Text | Couleur hex de la pastille |
| `dateDebut` | Date | |
| `dateFin` | Date | |
| `responsable` | Ref:Team | |
| `actif` | Bool | |

---

## Conversion des données

```javascript
// Colonaire Grist → tableau d'objets
// { titre: ['A','B'], statut: ['todo','done'] }
// → [{ titre:'A', statut:'todo' }, { titre:'B', statut:'done' }]

// Dates (CRITIQUE : timestamps Unix en secondes, pas en ms)
const gristToDate = (ts) => ts ? new Date(ts * 1000) : null;
const dateToGrist  = (d)  => d  ? Math.floor(d.getTime() / 1000) : null;

// RefList → tableau d'IDs numériques
const getRefListArray = (val) => Array.isArray(val) && val[0]==='L' ? val.slice(1).map(Number) : [];
const toGristRefList  = (arr) => arr?.length ? ['L', ...arr] : null;

// ChoiceList → tableau de strings
const getChoiceListArray = (val) => Array.isArray(val) && val[0]==='L' ? val.slice(1) : [];
const toGristChoiceList  = (arr) => arr?.length ? ['L', ...arr] : null;
```

---

## Fonctionnalités par widget

### Kanban (v15)
- Vue colonnes par statut avec drag & drop (Sortable.js)
- Panel slide-in création/édition tâche
- Sous-tâches checklist (JSON dans colonne `subtasks`) — **FUT-01**
- Jauge progression cliquable (0-100% par incrément)
- Filtre assigné + statut
- Picker couleur membres Team (10 presets, `UpdateRecord 'Team'`) — **A15**
- Export Print/PDF + PNG (html2canvas CDN) — **GEN-03**

### Gantt (v15)
- Timeline avec 6 vues : semaine / mois / trimestre / semestre / année / 5 jours
- Vue mémorisée (localStorage `taskflow_gantt_view`)
- Texte hors bande pour barres étroites
- Tooltip configurable au survol (`TOOLTIP_FIELDS`)
- Filtre assigné + projet
- Sous-tâches dans panel — **FUT-01**
- Couleurs avatars membres depuis `couleur` Team — **TEAM-01**
- Export Print/PDF + PNG — **GEN-03**

### Calendar (v15)
- 7 vues : mois / semaine / 2 semaines / 5 jours / trimestre / semestre / année
- **Barres adaptatives** : 4 niveaux de détail selon espace disponible par lane
  - `compact` (< 20px) : titre seul
  - `medium` (20-34px) : titre + badge statut
  - `tall` (34-52px) : titre + statut + avatars assignés
  - `full` (52px+) : titre + statut + plage dates + avatars
- Hauteur des rows proportionnelle au nombre de tâches, remplissage complet
- Sous-tâches dans panel — **FUT-01**
- Couleurs avatars membres — **TEAM-01**
- Export Print/PDF + PNG — **GEN-03**

### Dashboard (v16)
- 8 types de composants : KPI, Donut, Barres, Liste, Équipe, Échéances, Projets, Vélocité
- Grille CSS 4 colonnes, col-span 1-4 par composant
- Mode édition : accordion inline pour configuration de chaque composant
- Filtres locaux (période, projet, assigné, statut) — **non persistés**
- Config layout persistée via `grist.widgetApi.setOptions({ dash: dashConfig })`
- Garde `_saving` flag pour éviter boucle `onOptions` ↔ `setOptions`

### Plan (v16) — plan de charge

- **Heatmap** capacité vs charge par ressource × période (semaine/mois), groupable par **Personne / Portefeuille / Projet / Rôle** (Portefeuille/Projet/Rôle = en-tête + sous-lignes par membre)
- **Modes** : Prévu / Réalisé / Reste / **Dispo** (voir modèle ci-dessous)
- Unités **% / h**, options **Inclure terminé / Estimer / Jours ouvrés**
- **Allocation éditable** (drill sur cellule) : heures, %, **réaffectation** entre membres, **replanification** des dates — écriture réelle dans `Tasks.charges` / dates
- **Panneau ressource** : capacité hebdo + indisponibilités (`Team.capaciteHebdo` / `Team.indispos`)
- **Timeline par personne** (panneau bas) : tâches en barres, drag = replan/réaffectation, aperçu de tâche au clic
- Export CSV (COPIL), filtres partagés (`onOptions`), modale de confirmation **interne** (jamais `confirm()` natif)

---

## Plan de charge — opt-in & modèle prévu/réalisé

### Opt-in (sweet spot) : le Plan n'impose rien

Le widget **Plan est le créateur UNIQUE** de ses colonnes : `Tasks.charges`, `Tasks.dateCloture`, `Team.capaciteHebdo`, `Team.indispos`. Il les crée à l'ouverture si manquantes (`ensurePlanColumns`).

Les autres widgets (Kanban/Gantt/Calendar/Dashboard) **ne créent aucune** de ces colonnes et **n'activent leurs bouts « charge » que si la colonne existe** :

```javascript
let TASK_COLS = new Set();          // colonnes réelles de Tasks, lues du fetch (loadAllData)
function pruneTaskRecord(rec) {       // retire d'un record toute colonne absente ; fail-open si TASK_COLS vide
  if (TASK_COLS.size) { for (const k in rec) if (!TASK_COLS.has(k)) delete rec[k]; }
  return rec;
}
// appliqué à saveTaskToGrist + createTask + drag → jamais d'écriture d'une colonne inexistante
// section "Charge par personne" du panneau rendue seulement si TASK_COLS.has('charges')
```

**Conséquence** : un document qui n'ouvre **jamais** le Plan reste **sans empreinte** (0 colonne Plan, 0 UI charge) — comportement identique aux versions antérieures. Ouvrir le widget Plan crée les colonnes → la charge s'active partout. **Réversible** : remettre une colonne dans `TASKFLOW_SCHEMA` la rend de nouveau toujours créée.

### Charge : `Tasks.charges`

JSON `[{teamId, heures}]` = répartition de l'effort par assigné. `effCharges(t)` = charges réelles, **ou** `estimationH ÷ nb assignés` si l'option **Estimer** est active. `chargeMatrix()` (core) étale ces charges sur la durée de la tâche et agrège par clé/période.

### Modèle Prévu / Réalisé / Reste / Dispo

| Mode | Définition |
|------|------------|
| **Prévu** | charge planifiée (`effCharges`) |
| **Réalisé** | `tempsPasse` réparti ; **à défaut**, pour une tâche **clôturée**, le prévu est repris (= **estimé**, signalé par une légende dédiée) |
| **Reste** | prévu − réalisé (borné à 0) |
| **Dispo** | capacité − charge. **Notion globale** → disponible **uniquement en groupement Personne** (Dispo et Projet/Rôle sont mutuellement exclusifs : choisir Dispo force Personne ; choisir Projet/Rôle en Dispo rétablit Prévu). Une marge par-projet serait surestimée (ignorerait les autres projets de la personne). |

### `dateCloture`

Posée automatiquement au passage en **statut terminal** (`TF.isTerminal`), effacée si réouverture. Pilote le réalisé-sur-clôture et le calcul de **délai**. Écrite par Kanban/Gantt/Calendar (au changement de statut / drag), **seulement si la colonne existe** (opt-in).

### Portefeuille — regroupement de projets (opt-in, JPP #11)

Niveau « au-dessus des projets » = **regroupement simple** (pas une hiérarchie de tables rigide). Le Plan ajoute un groupement **Portefeuille** qui agrège la charge par portefeuille (en-tête + sous-lignes par membre, comme le groupement Projet).

- **Satellite opt-in** : table `Portefeuilles` (`nom, couleur, responsable Ref:Team, description, actif`) + colonne `Projects.portefeuille` (`Ref:Portefeuilles`). Créées **uniquement** à l'activation explicite (sélection du groupement Portefeuille → `confirmModal` → `ensurePortefSchema`). Un doc qui n'active pas reste sans empreinte ; détection via `S.hasPortef` (colonne présente + table existante).
- **Affectation projet → portefeuille** = native dans Grist (la colonne Ref s'édite dans la table `Projects`). Les widgets ne font que **regrouper**, ils ne gèrent pas la structure — cohérent avec l'annuaire (`Entites`/`responsable` édités en table).
- Helpers Plan : `portefById(id)`, `portefKeyOf(t)` (= portefeuille du projet de la tâche, `'0'` = sans portefeuille). Le groupement réutilise toute la mécanique « Projet » (`buildRows`/`keyFn`/`tasksForKey`/allocation éditable).

---

## Feuille de temps / CRA — `cra.html` (6ᵉ widget, opt-in)

Saisie du **réalisé daté par personne** (lot temps GENCI #9 + export Excel #12). Spec : `CRA_FEUILLE_DE_TEMPS_SPEC.md`. Standalone (hors `build-taskflow`). Onglet dans le launcher.

- **Tables satellites opt-in** (créées par la CRA uniquement, comme le Plan pour `charges`) :
  - `TimeEntries` : `membre Ref:Team, tache Ref:Tasks, date (le JOUR), heures (canonique), imputation, description`.
  - `Feuilles` : enveloppe personne×semaine — `membre, semaine, statut (brouillon/soumis/valide/rejete), validePar, dateValidation, motifRejet`.
- **Identité du connecté** : `getAccessToken().userId` → ligne `Team` via `Team.gristUserId` (pont, colonne ajoutée à l'usage). L'API plugin n'expose pas l'email au widget (cf. mémoire ACL).
- **Grille hebdo** (lignes tâches × jours, totaux), unité configurable **heures/jours/½j** (stockage canonique en heures + `heuresParJour`, modèle Odoo).
- **Workflow** : soumettre → **valider/rejeter par le chef** (onglet « À valider » ; verrouille la grille). Le « qui je gère » est **recalculé côté client** depuis l'annuaire (`Team.entite` + `Entites.parent/chef`) : la colonne formule `Team.agents_geres` se **vide** en passant par le relais launcher (valeurs null ; les Refs simples passent, pas les RefList calculées par formule).
- **Export** CSV+BOM (Excel).
- **Droits/ACL** : configurés **dans l'organigramme** (bouton « Droits » unique pour Tasks + TimeEntries + Feuilles), PAS dans la CRA. La CRA est un outil de saisie pur.

### ⚠️ Modèle de données du RÉALISÉ — source unique, pas de doublon

`tempsPasse` reste la colonne lue par **tous** les widgets (Plan/Dashboard/Kanban/Gantt/Calendar). Pour éviter le doublon réalisé-daté (`TimeEntries`) vs réalisé-total (`tempsPasse`) :

> **`TimeEntries` = SOURCE du réalisé** → la CRA écrit **`Tasks.tempsPasse = somme des `TimeEntries` de la tâche** à chaque saisie (`taskRealizedHours` dans `setCell`). Donc tous les widgets qui lisent `tempsPasse` reflètent le réalisé **exact** sans modification ni duplication.

- Sans CRA : `tempsPasse` reste saisi à la main (panels Kanban/Gantt/Calendar) — comportement actuel.
- Avec CRA : `tempsPasse` devient un **rollup CRA-owned** (la saisie manuelle des panels sera écrasée à la prochaine entrée — à terme, masquer/figer ce champ quand `TimeEntries` existe).
- Raffinement futur : le Plan « Réalisé » **par période** (heatmap hebdo) peut lire `TimeEntries` datés pour un étalement exact au lieu d'étaler le total `tempsPasse`.

---

## Patterns récurrents

### CRUD tâche

```javascript
// CREATE
const id = await grist.docApi.applyUserActions([['AddRecord', 'Tasks', null, {
    titre, description, statut, priorite, type, progression,
    projet: projectId || null,
    dateDebut: dateToGrist(startDate),
    dateEcheance: dateToGrist(endDate),
    assignees: toGristRefList(ids),
    subtasks: subtasksToJson(editData.subtasks)
}]]);

// UPDATE
await grist.docApi.applyUserActions([['UpdateRecord', 'Tasks', parseInt(taskId), taskData]]);

// Mettre à jour couleur d'un membre Team
await grist.docApi.applyUserActions([['UpdateRecord', 'Team', memberId, { couleur: color }]]);
```

### Sous-tâches (FUT-01)

```javascript
// Stockage : JSON string dans Tasks.subtasks
// Format : [{ id: 1, text: "...", done: false }, ...]

const getSubtasks   = (t) => { try { return JSON.parse(t?.subtasks || '[]'); } catch { return []; } };
const subtasksToJson = (arr) => JSON.stringify(arr || []);

function addSubtask()        { /* crée {id: Date.now(), text, done:false}, push, re-render */ }
function toggleSubtask(id)   { /* toggle .done, update editData, re-render */ }
function removeSubtask(id)   { /* filter out, re-render */ }
```

### Export (GEN-03)

```javascript
function exportPrint() { window.print(); }

async function exportPNG() {
    if (!window.html2canvas) {
        // Charge html2canvas depuis CDN dynamiquement
        await new Promise(resolve => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'; s.onload = resolve; document.head.appendChild(s); });
    }
    const canvas = await html2canvas(document.querySelector('.main-content'), { backgroundColor: '#f8fafc', scale: 2 });
    const a = document.createElement('a'); a.download = 'export.png'; a.href = canvas.toDataURL(); a.click();
}
```

### Mode démo

```javascript
// Si Grist n'est pas disponible (ouverture locale dans navigateur)
try {
    grist.ready({ requiredAccess: 'full' });
    grist.onRecords(async (data) => { ... });
} catch(e) {
    isDemo = true;
    loadDemoData();  // injecte tasks/team/projects fictifs
}
```

---

## Système de couleurs

Cinq entités colorées, chacune avec une **source unique** et une **règle de lecture** bien définie.

### Entités et sources

| Entité | Stockage | Édition UI (widgets) | Utilisée pour |
|--------|----------|----------------------|---------------|
| `Tasks.couleur` | Grist (`Text`, hex) | Panel tâche → prop-row **Couleur** (`<input type="color">`) | Override individuel d'une tâche |
| `Projects.couleur` | Grist (`Text`, hex) | Panel tâche → **dot projet cliquable** (picker presets) | Identité du projet partout |
| `Team.couleur` | Grist (`Text`, hex) | Panel tâche → **dot membre cliquable** dans assignees (picker presets) | Avatar et barres colorées par assigné |
| `PRIORITY_COLORS` | const JS (hardcodée) | — | Palette standard priorité |
| `STATUS_COLORS` | const JS (hardcodée) | — | Palette standard statut |

### Palette presets partagée

`COLOR_PRESETS` — 10 couleurs harmonisées, déclarée dans chaque widget :
```js
['#3e5de7','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b']
```

Utilisée par les pickers Project/Team. Tasks.couleur utilise un `<input type="color">` natif (spectre complet).

### Hiérarchie de résolution (ordre fixe dans `getTaskColor(t)`)

```
1. task.couleur (si défini)              ← override individuel, priorité absolue
2. colorMode courant :
   ├── 'priority' → PRIORITY_COLORS[getTaskPriority(t)]
   ├── 'project'  → Projects.couleur[t.projet]
   ├── 'assignee' → Team.couleur[premier assigné]
   └── 'status'   → STATUS_COLORS[t.statut]
3. fallback '#94a3b8' (gris neutre)
```

### Mode "Colorer par" — persistance locale (pas serveur)

`colorMode` et `sortMode` Gantt sont stockés **uniquement en `localStorage`** par widget (clés `taskflow_<widget>_colormode`, `taskflow_gantt_sort`).

**Décision** : ne pas utiliser `grist.setOption()` pour ces préférences UI, car Grist marque le document comme modifié à chaque écriture (pop-up "Enregistrer les modifications ?") — disproportionné pour un simple changement de tri ou de mode couleur.

**Trade-off assumé** : chaque utilisateur/navigateur garde son propre tri et mode couleur. Pas de partage inter-utilisateurs ni inter-widgets via Grist. Si l'utilisateur ouvre le Gantt en mode "Projet" et le Kanban en mode "Priorité", c'est un cas légitime.

**Les filtres** (`filters.project`, `filters.priority`, `filters.assignee`) continuent d'utiliser `grist.setOption` (partagés inter-widgets) — c'est le comportement attendu pour un filtre collaboratif.

### Application par widget

| Widget | Élément coloré par `getTaskColor(t)` | Couleur projet dot |
|--------|--------------------------------------|---------------------|
| **Gantt** | Barres (`bar.style.background = getTaskBarGradient(t)`) + diamant jalon | Inchangée (dot panel cliquable) |
| **Kanban** | Bordure gauche des cartes (`border-left-color`) | Inchangée (dot panel cliquable) + dot `●` dans card-meta |
| **Calendar** | Gradient des barres `event-bar` / `week-event-bar` (hors jalon) | Inchangée (dot panel cliquable) + border-left-color des barres |

### Fonctions standards

Présentes dans chaque widget, identiques :
```js
function getTaskColor(t) { /* hiérarchie ci-dessus */ }
function getTaskBarGradient(t) { return 'linear-gradient(135deg, ' + c + ', color-mix(in srgb, ' + c + ' 70%, white))'; }
async function setProjectColor(projectId, color) { /* UpdateRecord Projects.couleur */ }
async function setMemberColor(memberId, color) { /* UpdateRecord Team.couleur */ }
function changeColorMode(mode) { /* localStorage + grist.setOption */ }
```

### Légende (Gantt uniquement)

Dynamique selon `colorMode` — rendue par `renderLegend()` appelée dans `render()`. Affiche les 4 priorités, ou les statuts, ou les 8 premiers projets/membres actifs selon le mode.

### Bonnes pratiques

- **Ne jamais** hardcoder une couleur de barre/carte — toujours via `getTaskColor(t)`
- **Ne jamais** écrire dans `Tasks.couleur`, `Projects.couleur`, `Team.couleur` sans passer par les helpers `updateField`, `setProjectColor`, `setMemberColor` (qui synchronisent local + Grist)
- Les **classes CSS `.p1-.p4`** restent pour fallback mais sont surchargées par les styles inline
- **Jalons** (type=`jalon`) : leur background reste transparent dans Calendar/Gantt ; seul le diamant reçoit `getTaskColor()`

---

## Hiérarchie WBS (sous-tâches structurelles)

Trois concepts **orthogonaux** coexistent dans TaskFlow, chacun avec son usage :

| Concept | Colonne | Stockage | Rôle | Éditable |
|---------|---------|----------|------|----------|
| **Checklist** | `subtasks` | Text JSON `[{id,text,done}]` | Puces cochables rapides dans le panel | Tous widgets |
| **Dépendance** | `dependDe` | RefList:Tasks | A attend la fin de B (temporel) | Tous widgets |
| **Décomposition** (WBS) | `parentTask` | Ref:Tasks | A **contient** B, C, D (hiérarchie) | Via panel (Phase 2+) |

**Important** : une sous-tâche WBS est une **vraie tâche Grist** avec ses propres dates, assignés, priorité, progression, checklist, dépendances. Le parent est une tâche comme les autres qui a simplement des enfants.

### Invariants

- `parentTask = null` → racine (comportement hérité)
- `parentTask` ne peut jamais créer un cycle (`canSetParent(id, newParent)` valide)
- Un enfant peut avoir un statut/projet/priorité **différent** de son parent (aucune règle de cohérence forcée)
- Suppression parent : cascade (défaut) ou détachement (enfants deviennent racines) — choix au moment de la suppression

### API commune (dans chaque widget)

```js
// Cache des enfants par parent, reconstruit à chaque loadAllData()
let childrenByParent = new Map();
function rebuildChildrenCache() { /* ... */ }

// Helpers structure
isRoot(t), getParent(t), getChildren(id), hasChildren(t), getDepth(t)
walkTree(roots, cb)          // DFS itératif pré-ordre avec depth
getAllDescendants(id)
canSetParent(id, newParent)  // anti-cycle

// Agrégations — calculées à la demande, JAMAIS persistées
aggregateProgress(t)  // moyenne pondérée par estimationH si toutes en ont
aggregateDates(t)     // min(starts descendants), max(ends descendants)
```

### Règles d'agrégation

| Métrique | Règle si `hasChildren(t)` |
|----------|---------------------------|
| Progression | **Auto-calculée** (moyenne pondérée par `estimationH` si dispo, sinon simple) — jamais persistée |
| Dates | **Stockées explicitement** (l'utilisateur peut vouloir réserver une plage plus large que les enfants) — bouton "Ajuster aux bornes des sous-tâches" à venir |
| Assignés | **Pas d'agrégation** — le parent peut avoir son propriétaire distinct |

### Schéma (additif, rétrocompatible)

Colonne ajoutée dans `TASKFLOW_SCHEMA.Tasks` (Kanban, Gantt, Calendar) :
```js
{ id: 'parentTask', type: 'Ref:Tasks' }
```

`ensureSchema()` l'ajoute automatiquement à la prochaine ouverture d'un doc existant. Les tâches existantes ont `parentTask = null` → racines → comportement inchangé.

### Exemple hiérarchique dans seedData + useDemoMode

Chaque widget crée "Dev Backend" / "API backend" avec 3 sous-tâches :
- "Modèle de données" (done)
- "Routes API" ou "Routes /users /auth" (en cours)
- "Tests unitaires" (à faire)

Découvrabilité de la feature dès la première ouverture.

---

## Backlog forum (prochaines évolutions)

Demandes remontées sur le forum Grist community :

| Priorité | Demande | Complexité |
|----------|---------|------------|
| 🔴 | Vue multi-projets compacte Gantt (1 ligne/projet, tâches en cascade) | ⭐⭐⭐ |
| 🟡 | Tâches colorées par catégorie/tag | ⭐⭐ |
| 🟡 | GristDocTour (visite guidée du document exemple) | ⭐⭐ |
| 🟢 | Dépendances avec recalcul automatique des dates (chemin critique) | ⭐⭐⭐⭐ |
| 🟢 | Configuration colonnes/tables dans le widget (mapping custom) | ⭐⭐⭐ |

---

## Points d'attention

### Pièges fréquents

1. **Dates** : Grist stocke en secondes Unix, JS en millisecondes → toujours `* 1000` / `/ 1000`
2. **RefList** : format `['L', id1, id2]` — ne jamais passer un tableau nu
3. **`setOptions` ↔ `onOptions`** : appeler `setOptions` déclenche `onOptions` dans le même widget → utiliser le flag `_saving` pour éviter la boucle
4. **broadcastFilters** : ne PAS appeler depuis le Dashboard (filtres locaux seulement)
5. **Kanban = widget maître** : c'est lui qui initialise le schéma — toujours le charger en premier dans un nouveau document

### Déploiement

```
projects/tasks_app/kanban.html     →  published/taskflow/kanban/index.html
projects/tasks_app/gantt.html      →  published/taskflow/gantt/index.html
projects/tasks_app/calendar.html   →  published/taskflow/calendar/index.html
projects/tasks_app/dashboard.html  →  published/taskflow/dashboard/index.html
projects/tasks_app/plan.html       →  published/taskflow/plan/index.html
```

Avant copie : `node scripts/build-taskflow.js` (inline le core) puis `--check`. Après copie : `npm run manifest` pour régénérer `published/manifest.json`.

URLs publiées : `https://nic01asfr.github.io/Widgets-Grist/taskflow/{widget}/`
