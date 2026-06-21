# GENCI — Lot 3 : Annuaire hiérarchique & ACL (CADRAGE)

> Statut : **cadrage** — rien n'est implémenté. À acter avant tout code.
> Tests prévus dans `projects/tasks_app` (doc Grist de test), comme pour les lots précédents.
> Faisabilité ACL **vérifiée empiriquement** sur grist.numerique.gouv.fr (voir §6).

---

## 0. Principes directeurs

1. **Générique** : ne rien coder en dur de la taxonomie GENCI. On *configure* (niveaux), comme les statuts dynamiques.
2. **Opt-in (sweet-spot)** : sans les tables/colonnes d'annuaire → `Team` reste plat = **comportement actuel inchangé**. La hiérarchie + l'ACL ne s'activent que si on les crée.
3. **Réutilise l'existant** : motif récursif déjà éprouvé (`Tasks.parentTask`, API `walkTree`/`getDepth`/`canSetParent`), statuts dynamiques (niveaux configurables), pivot `email`.
4. **ACL = native Grist** : le widget *génère* le schéma et *propose* de poser les règles ; il ne *sécurise* pas — c'est Grist qui applique. Écriture ACL **one-shot, owner-only, explicite** (voir §6).

---

## 1. Périmètre (demandes JPP couvertes par ce lot)

| # | Demande | Couvert |
|---|---|---|
| 2 | Équipe ⊃ personnes + chef | ✅ |
| 5 | Chef projet OU chef au-dessus modifie tout | ✅ (ACL) |
| 6 | Assigné modifie les siens | ✅ (ACL) |
| 10 | Charge par équipe (Plan) | ✅ (groupement/filtre) |
| 11 | Portefeuille au-dessus des projets | ⚠️ partiel (niveau d'`Entites`) — finalisé dans le lot « hiérarchie de travail » |

**Hors lot** (autres lots) : saisie des temps (#9), export Excel (#12), actions/niveaux de travail (#3, #4), affectation 100 %/action (#7).

---

## 2. Modèle de données

### 2.1 Table `Entites` — satellite récursif (opt-in)
Unités d'organisation comme objets de 1ʳᵉ classe (nommables, multi-niveaux).

| Colonne | Type | Rôle |
|---|---|---|
| `nom` | Text | Libellé |
| `parent` | Ref:Entites | **Auto-référence** → arbre de profondeur illimitée |
| `niveau` | Choice | **Configurable** (organisation/direction/service/équipe…) — comme les statuts |
| `chef` | Ref:Team | Responsable de l'entité |
| `actif` | Bool | |

### 2.2 Extensions `Team` (opt-in, additives)
`Team` actuel : `nom, email, role, actif, couleur, [capaciteHebdo, indispos]`. On ajoute :

| Colonne | Type | Rôle |
|---|---|---|
| `entite` | Ref:Entites | Rattachement organisationnel |
| `email` | Text | (déjà là) **pivot identité = login Grist = clé ACL** |
| `role` | Choice | (déjà là) membre / chef / chef de projet… |

> **Variante « Niveau 0 » minimale** (si on veut éviter `Entites` au départ) : une seule colonne `Team.responsable` (Ref:Team, auto-réf) suffit pour la chaîne managériale et les droits. `Entites` est recommandé dès qu'on veut *décrire la structure* (unités nommées, portefeuilles).

### 2.3 Colonnes DÉRIVÉES (formules) — socle de l'ACL
Calculées par le moteur Grist (la récursivité vit ici, pas dans l'ACL).

```python
# Entites.ancetres — liste des entités au-dessus
res, cur, seen = [], $parent, set()
while cur and cur.id not in seen:
    seen.add(cur.id); res.append(cur); cur = cur.parent
res

# Team.chaine_chefs — chefs au-dessus de moi (chef de mon entité + chefs des ancêtres)
chefs, e, seen = [], $entite, set()
while e and e.id not in seen:
    seen.add(e.id)
    if e.chef: chefs.append(e.chef)
    e = e.parent
chefs

# Team.agents_geres — personnes que je supervise (transitif) — pour vues "mon équipe"
[a for a in Team.lookupRecords() if any(c.id == $id for c in a.chaine_chefs)]
```

### 2.4 Liens existants (inchangés)
- `Projects.responsable` (Ref:Team) = **chef de projet** (déjà présent).
- `Tasks.assignees` (RefList:Team) = assignés (déjà présent).

### 2.5 Extension FUTURE (non implémentée) — matrice / multi-hiérarchie
Un `parent` unique = un **arbre**. Pour matrice (double rattachement), hiérarchies parallèles ou graphe → satellite d'arêtes `Appartenances(personne Ref:Team, entite Ref:Entites, type, role)`. Une liste d'arêtes décrit **n'importe quelle structure**. **À ne coder que si un besoin réel apparaît** (YAGNI) — additif, non destructif.

---

## 3. Généricité & opt-in (garanties)

- **Sans `Entites`** : `Team` plat → Kanban/Gantt/Calendar/Dashboard/Plan **strictement inchangés** (ils n'écrivent ni ne lisent les colonnes d'annuaire ; pattern `pruneTaskRecord`/colonne-présente-sinon-rien déjà en place).
- **Niveaux configurables** (`Entites.niveau`) : s'adapte à toute structure (entreprise/asso/collectivité/labo). Aucune taxonomie codée en dur.
- **Création opt-in** : un **widget « Annuaire »** (ou la page de config) est le **créateur unique** de `Entites` + colonnes — exactement le modèle « le Plan crée ses colonnes ».
- **Assignés inchangés** : `Team` reste **des personnes** (pas de pollution du picker d'assignés).

---

## 4. ACL — dérivée du schéma

### 4.1 User Attribute
`user.Agent` = lookup `Team` par `user.Email` (rattaché à la ressource globale `*`).

### 4.2 Règles sur `Tasks` (tâches/sous-tâches/actions = même table)
| Qui | Condition (formule ACL) | Droit |
|---|---|---|
| Assigné | `user.Agent.id in [a.id for a in rec.assignees]` | edit |
| Chef de projet | `user.Agent.id == rec.projet.responsable.id` | edit |
| Chef au-dessus | `user.Agent.id in [c.id for c in rec.projet.responsable.chaine_chefs]` | edit |
| Autres | (défaut) | read |

> Les colonnes dérivées rendent ces règles **triviales** (tests d'appartenance, pas de récursion dans l'ACL).

### 4.3 Contraintes Grist — **vérifiées empiriquement** (test de faisabilité)
Sur grist.numerique.gouv.fr, en owner, via `applyUserActions` (API **et** widget) :
- ✅ Écriture **ressources** + **règles de permission** (par table) + **user-attribute** (sur `*`).
- 📏 **Owner requis** (= la personne qui installe le widget dans son doc, cas normal). **Fallback : export des règles à coller** si non-owner.
- 📏 **Schéma d'abord** : une règle référençant une table/colonne absente → **rejet (400)**. Donc créer `Entites`/`Team`/colonnes AVANT les règles.
- 📏 **Placement** : user-attribute sur ressource `*` ; règles de permission sur la ressource de chaque table.
- 🔁 **ONE-SHOT obligatoire** : écrire l'ACL **uniquement sur action explicite** (bouton « Configurer les droits »), **idempotent**, avec **aperçu** et **retrait**. **JAMAIS au chargement/à chaque render** → sinon **boucle** (la modif du doc re-render le widget qui ré-écrit… incident reproduit et confirmé).
- ⚠️ Format métatables (`_grist_ACLResources` / `_grist_ACLRules`) **interne, non documenté** → à re-tester à chaque montée de version Grist.

---

## 5. Intégration UI

- **Widget « Annuaire »** (nouveau, ou page de config) : éditeur de l'arbre `Entites` (drag, niveaux), rattachement des personnes, **import CSV** (forme d'export d'annuaire), désignation des chefs. Réutilise l'API WBS (`walkTree`, anti-cycle).
- **Bouton « Configurer les droits »** : **owner-only**, aperçu des règles générées, application **one-shot idempotente**, bouton **retrait**, **fallback export** si non-owner.
- **Plan** : ajouter le groupement **Équipe** (sous-arbre `Entites`/`chef`) + **filtre par entité** → couvre #10.
- **Reste des widgets** : inchangés.

---

## 6. Décisions à acter (de vive voix avec JPP)

1. **`Entites` récursif** (recommandé, décrit la structure) **vs** `Team.responsable` seul (minimal, droits only).
2. **Niveaux configurables** (recommandé) vs figés.
3. **Portefeuille** = niveau d'`Entites` **vs** satellite dédié.
4. **Matrice** nécessaire ? Si oui → prévoir `Appartenances` ; sinon → arbre.
5. **Périmètre du 1ᵉʳ incrément** (schéma seul ? + ACL ? + widget annuaire ?).

---

## 7. Plan de test (dans `projects/tasks_app`, doc Grist de test)

1. Créer `Entites` + `Team.entite` + dérivés sur un doc de test ; vérifier les formules (chaîne de chefs, agents gérés) sur un petit organigramme.
2. **Non-régression** : sans `Entites`, les 5 widgets se comportent comme aujourd'hui.
3. **ACL** : déclencher « Configurer les droits » en owner → vérifier les 3 règles + le user-attribute ; tester le **fallback export** (compte non-owner) ; **vérifier l'idempotence** et l'absence de boucle.
4. **Grist réel** : valider l'accès effectif (chef édite, assigné édite les siens, tiers en lecture).
5. **Nettoyage** systématique des artefacts de test.

---

## 8. Phasage

1. **Schéma** : `Entites` + `Team.entite` + dérivés (non destructif, opt-in).
2. **Widget Annuaire** : édition de l'arbre + rattachement + import CSV.
3. **Bouton ACL one-shot** (owner) + **fallback export**.
4. **Plan** : groupement/filtre par équipe (#10).
5. **(futur)** `Appartenances` si matrice ; portefeuilles (jonction avec le lot « hiérarchie de travail »).
