# COLUMNS_SPEC.md — Contrat de colonnes TaskFlow

Référence unique du mapping de colonnes pour les 4 widgets TaskFlow (Kanban, Gantt,
Calendar, Dashboard). Sert de contrat de développement et de base de chiffrage.

Source API : [Grist Custom Widgets — Column mapping](https://support.getgrist.com/widget-custom/)
et [Plugin API](https://support.getgrist.com/code/modules/grist_plugin_api/).

---

## Principe directeur

1. **Schéma auto, complet** : le Kanban (widget maître) crée toutes les tables et
   colonnes via `ensureSchema()`. Le widget fonctionne sur un document vierge sans
   aucune configuration.
2. **Mapping libre ensuite** : l'utilisateur peut renommer, ajouter, modifier ses
   colonnes et rebinder les champs du widget sur ses propres colonnes via le panneau
   de configuration Grist.
3. **Cadré par le typage** : chaque champ déclare son `type` Grist. Le sélecteur de
   mapping ne propose que les colonnes compatibles. Une colonne requise non mappée
   est détectée (`mapColumnNames` renvoie `null`) et signalée à l'utilisateur.

Lot 1 (schéma auto + statuts dynamiques + plan de charge) : noms de colonnes fixes.
Lot 2 (mapping complet) : réoutillage du chemin d'écriture pour utiliser les vrais
IDs de colonnes fournis par l'objet `mappings`.

---

## Déclaration `grist.ready({ columns })`

Champs documentés d'une entrée de `columns` :

| Champ | Défaut | Rôle |
|-------|--------|------|
| `name` | — | Identifiant logique utilisé dans le code |
| `title` | `name` | Libellé affiché dans le panneau de config |
| `type` | `"Any"` | Type Grist attendu (filtre le sélecteur) |
| `optional` | `false` | Colonne facultative |
| `description` | — | Texte d'aide affiché dans le panneau |
| `allowMultiple` | `false` | Autorise le bind de plusieurs colonnes sur un champ |

Types acceptés : `Int, Numeric, Text, Date, DateTime, Bool, Choice, ChoiceList, Ref,
RefList, Attachments`. Combinables en CSV (`"Date,DateTime"`) ou `"Any"`.

`strictType` n'est PAS dans la doc publique : ne pas l'utiliser. La contrainte passe
par `type` (filtrage Grist) + validation côté widget.

Pour les références, le type est `"Ref"` / `"RefList"` SANS suffixe de table
(`"Ref:Team"` est invalide côté mapping ; la colonne connaît déjà sa table cible).

---

## Table `Tasks` — colonnes à mapper

| `name` | `title` | `type` | `optional` | Requis pour | Notes |
|--------|---------|--------|-----------|-------------|-------|
| `titre` | Titre | `Text` | non | tous | |
| `statut` | Statut | `Choice` | voir * | Kanban | Les options de la colonne = les colonnes du tableau Kanban |
| `dateDebut` | Début | `Date,DateTime` | voir * | Gantt, Calendar | Unix secondes |
| `dateEcheance` | Échéance | `Date,DateTime` | voir * | Gantt, Calendar | Unix secondes |
| `priorite` | Priorité | `Choice` | oui | — | Valeurs `1`..`4` |
| `type` | Type | `Choice` | oui | — | `tache` / `jalon` / `reunion` |
| `progression` | Progression | `Int` | oui | — | 0-100 |
| `projet` | Projet | `Ref` | oui | — | Cible `Projects` (convention) |
| `assignees` | Assignés | `RefList` | oui | — | Cible `Team` (convention) |
| `dependDe` | Dépend de | `RefList` | oui | — | Cible `Tasks` |
| `tags` | Étiquettes | `ChoiceList` | oui | — | |
| `estimationH` | Estimation (h) | `Numeric` | oui | — | Total tâche |
| `tempsPasse` | Temps passé (h) | `Numeric` | oui | — | Total tâche |
| `couleur` | Couleur | `Text` | oui | — | Hex, override individuel |
| `subtasks` | Sous-tâches | `Text` | oui | — | JSON `[{id,text,done}]` |
| `parentTask` | Tâche parente | `Ref` | oui | — | Cible `Tasks`, WBS |
| `charges` | Charge par personne | `Text` | oui | — | JSON `[{teamId,heures}]` — NOUVEAU (#3) |

\* **Requis par widget** : `optional` n'est pas uniforme. Chaque widget déclare le
sous-ensemble qu'il consomme avec ses propres `optional` :
- Kanban : `statut` requis ; dates optionnelles.
- Gantt / Calendar : `dateDebut` et `dateEcheance` requis ; `statut` optionnel.
- Dashboard : tout optionnel (agrège ce qui est disponible).

Tous les widgets partagent les **mêmes `name` logiques** pour une config cohérente.

---

## Table `Team`

| `name` | `type` | Notes |
|--------|--------|-------|
| `nom` | `Text` | Colonne d'affichage des Ref vers Team |
| `email` | `Text` | |
| `avatar` | `Text` | |
| `role` | `Choice` | |
| `actif` | `Bool` | |
| `couleur` | `Text` | Hex avatar |

## Table `Projects`

| `name` | `type` | Notes |
|--------|--------|-------|
| `nom` | `Text` | Colonne d'affichage des Ref vers Projects |
| `couleur` | `Text` | Hex pastille |
| `dateDebut` | `Date` | |
| `dateFin` | `Date` | |
| `responsable` | `Ref` | Cible `Team` |
| `actif` | `Bool` | |

---

## Résolution lecture / écriture

**Lecture** — `mapColumnNames` renomme les clés réelles vers les `name` logiques et
renvoie `null` si une colonne requise n'est pas mappée :

```javascript
grist.onRecords((records, mappings) => {
    const rows = records.map(r => grist.mapColumnNames(r)).filter(Boolean);
    // rows[i].statut, rows[i].assignees ... clés logiques garanties
});
```

**Écriture (lot 2)** — `applyUserActions` exige les vrais IDs de colonnes. L'objet
`mappings` (`WidgetColumnMap`, name -> id réel) du 2e argument de `onRecords` permet
de traduire les `name` logiques en IDs réels avant `UpdateRecord` / `AddRecord`.

---

## Garanties et conventions (qui cadre quoi)

| Contrainte | Garanti par | Niveau |
|------------|-------------|--------|
| Bon type de colonne | Grist (filtrage via `type`) | Déclaratif |
| Colonne requise présente | Grist (`mapColumnNames` -> `null`) + message widget | Déclaratif + widget |
| Forme JSON (`subtasks`, `charges`) | Widget (parse défensif) | Validation widget |
| Statut signifiant "terminé" | Convention : dernier statut de la liste | Contrat documenté |
| Table cible des `Ref` (`Team` / `Projects`) | Non enforced par le mapping | Contrat documenté (lot 2) |

Chaque cas non couvert par le typage Grist est un contrat écrit, pas un implicite.
À la résolution du mapping, le widget valide le type réel résolu et affiche un
avertissement explicite si incompatible (ex : "le champ Statut doit pointer sur une
colonne Choice").

---

## Statuts dynamiques (#1) — lecture depuis la colonne Choice

Le widget NE code PAS les statuts en dur. Il lit la liste de choix et leurs couleurs
depuis les métadonnées de la colonne `statut` :

- Source : `_grist_Tables_column.widgetOptions` (JSON) -> `choices` + `choiceOptions`
  (`{ "<valeur>": { fillColor, textColor } }`).
- `ensureSchema()` sème les choix + couleurs par défaut à la création de `statut`.
- Fallback si colonne `Text` (pas de choix définis) : déduire les valeurs distinctes
  présentes dans les données (sans couleur ni ordre garanti).
- Convention "terminé" : le DERNIER statut de la liste est l'état terminal (drag ->
  done, progression 100, comptage "fait").

Idem applicable à `priorite` et `type` (colonnes Choice) pour cohérence.

---

## Plan de charge (#3) — colonne JSON `charges`

- Stockage : colonne `Text` `charges` sur `Tasks`, JSON `[{teamId, heures}]`.
- Édition : dans le panel tâche, une ligne par assigné avec saisie d'heures.
- Vue agrégée : charge par personne (somme des heures sur toutes les tâches, option
  par période). Pattern de parse défensif identique aux `subtasks`.

---

## Lots de livraison

- **Lot 1** : #2 (visibleCol des Ref -> noms dans vues natives) ; #1 (statuts
  dynamiques) ; #3 (plan de charge JSON). Schéma auto, noms fixes. 4 widgets.
- **Lot 2** : column mapping complet (chemin d'écriture réoutillé via `mappings`,
  table cible des Ref). Chiffré séparément.
