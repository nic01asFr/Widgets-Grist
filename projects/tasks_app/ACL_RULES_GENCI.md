# ACL TaskFlow — règles prêtes à appliquer (annuaire hiérarchique)

> But : brancher les droits sur l'annuaire **sans écriture programmatique** — l'owner configure une fois dans **Permissions avancées**. Les permissions suivent ensuite la **donnée** (qui est chef, qui est assigné).
> Prérequis : tables `Team`, `Tasks`, `Projects`, `Entites` + colonnes ci-dessous.

---

## Étape 1 — Colonnes DÉRIVÉES (formules) à créer

### Sur `Entites`
```python
# Entites.ancetres  (type: Reference List -> Entites)  — entités au-dessus
res, cur, seen = [], $parent, set()
while cur and cur.id not in seen:
    seen.add(cur.id); res.append(cur); cur = cur.parent
res
```

### Sur `Team`
```python
# Team.chaine_chefs  (Reference List -> Team)  — mes chefs (chef de mon entité + chefs des ancêtres)
chefs, e, seen = [], $entite, set()
while e and e.id not in seen:
    seen.add(e.id)
    if e.chef: chefs.append(e.chef)
    e = e.parent
chefs
```

```python
# Team.agents_geres  (Reference List -> Team)  — personnes que je supervise (transitif)
[a for a in Team.lookupRecords() if $id in [c.id for c in a.chaine_chefs]]
```

> Ces colonnes portent la récursivité. L'ACL ne fera que des tests d'appartenance.

---

## Étape 2 — User Attribute (Permissions avancées → « Add User Attributes »)

| Champ | Valeur |
|---|---|
| Name | `Agent` |
| Attribute to look up by | `Email` |
| Table | `Team` |
| Lookup Column | `email` |

→ expose `user.Agent` (la ligne `Team` de l'utilisateur connecté), avec `user.Agent.id`, `.entite`, `.chaine_chefs`, `.agents_geres`.

---

## Étape 3 — Règle sur la table `Tasks` (Add Table Rules → Tasks)

Ajouter UNE règle « éditeurs autorisés », **conditions cumulées en OR** :

```python
# Condition « est editeur » → autoriser Update + Create + Delete (Read reste ouvert via le defaut).
# Forme APPARTENANCE (user.Agent in <RefList>) + garde-fous None :
#   user.Agent peut etre None (connecte hors Team) ; rec.projet / .responsable peuvent etre vides.
user.Agent and (
    user.Agent in rec.assignees                                          # assigne
    or (rec.projet and user.Agent == rec.projet.responsable)             # chef de projet
    or (rec.projet and rec.projet.responsable
        and user.Agent in rec.projet.responsable.chaine_chefs)           # chef AU-DESSUS du chef de projet
)
```

- **Règle 1** (condition ci-dessus vraie) → autoriser **Update + Create + Delete** (Read implicite).
- **Règle « Everyone Else »** (en dessous, sans condition) → **Read seul** (lecture seule par défaut).
- Un connecté **hors `Team`** (`user.Agent` = None) ou une tâche **sans projet** → tombe en lecture seule (pas d'erreur de formule grâce aux garde-fous).

> Variante « lecture restreinte » : remplacer le défaut par une condition de visibilité (ex. même portefeuille / même entité) si certaines tâches ne doivent pas être visibles de tous.

---

## Étape 3 bis — Solution PROUVÉE EN RÉEL (colonne d'autorisation + ACL triviale)

> Validé le 2026-06-20 sur `fyizDrfSuTfi` (API owner + `aclAsUser_`, **vrais changements**). C'est l'approche recommandée : robuste, sans étape UI, logique visible.

**Contraintes ACL découvertes empiriquement** (le moteur ACL est bien plus restreint qu'une formule de colonne) :
- ❌ **pas de référence de table** : `Team.lookupOne(...)` → « Unknown variable 'Team' ».
- ❌ **pas de list comprehension** : `[x.id for x in ...]` → « Unsupported syntax ».
- ❌ **pas de traversée Ref→colonne** : `rec.projet.responsable.email` **lève une erreur** (en ACL `rec.<Ref>` n'est pas un record exploitable).
- ❌ **User Attribute ajouté par l'API ne s'enregistre pas** (`user.Agent` reste None) → il faut le créer **dans l'UI** Access Rules.
- ✅ disponibles : `user.Email`, `user.Access`, `user.UserID`, et `rec.<colonne>` (y compris colonne **formule**) + `in` / `==` / `and` / `or` / `not`.
- ⚠️ **piège de test** : une écriture à **valeur identique** (no-op) fait sauter la vérif par ligne → toujours tester avec un **vrai changement**.

**Le pattern qui marche** (fidèle à « les dérivées portent la récursivité, l'ACL ne fait qu'un test simple ») :

**1. Colonne formule `Tasks.editorsEmails`** — le moteur de données autorise refs + boucles ; elle produit la chaîne délimitée des emails autorisés :
```python
emails = set()
for a in $assignees:
    emails.add(a.email)
if $projet and $projet.responsable:
    emails.add($projet.responsable.email)
    for c in $projet.responsable.chaine_chefs:
        emails.add(c.email)
',' + ','.join(sorted(e for e in emails if e)) + ','
```

**2. Règle `Tasks`** (Permission : retirer **Update + Create + Delete**) — simple substring :
```python
not (user.Access == 'owners' or (user.Email and (',' + user.Email + ',') in rec.editorsEmails))
```

**Résultat prouvé** (Tâche A assignée Bob / Tâche B assignée Claire ; projet responsable Claire ; Claire sous Alice) :

| Voir en tant que | A (assigné Bob) | B (assigné Claire) |
|---|---|---|
| **bob** | ÉDITE | **lecture seule** |
| **claire** (chef de projet) | ÉDITE | ÉDITE |
| **alice** (chef au-dessus) | ÉDITE | ÉDITE |
| hors `Team` | lecture seule | lecture seule |

→ Avantage vs User Attribute : **aucune étape UI**, logique **visible/debuggable** dans une colonne, ACL réduite à un substring. La variante `user.Agent` (Étape 2) reste valable mais impose de créer le User Attribute dans l'UI.

---

## Étape 4 — (optionnel) Protéger l'annuaire
Sur `Entites` et `Team` : édition réservée aux owners / RH (règle `user.Access != OWNER → -U -C -D` ou une entité « administration »). Lecture ouverte.

---

## Étape 5 — Scénario de preuve (« View as » / Voir en tant que)

> But : prouver que les droits **suivent la hiérarchie** (chefs) sans rien coder, via la fonctionnalité native **Access Rules → « Voir en tant que »** (owner).

### Données de test (annuaire seedé)
- `Team` : **Alice**(1, alice@test.fr), **Bob**(2, bob@test.fr), **Claire**(3, claire@test.fr).
- `Entites` : **Direction Technique**(chef Alice) ⊃ **Équipe Études**(chef Alice : Alice, Bob) + **Équipe Run**(chef Claire : Claire).
- Dérivées vérifiées : `chaine_chefs(Claire) = [Claire, Alice]`, `agents_geres(Alice) = [Alice, Bob, Claire]`.
- À créer : projet **« Projet X »** `responsable = Claire` ; **Tâche A** (`assignee = Bob`, `projet = Projet X`) ; **Tâche B** (`assignee = Claire`, `projet = Projet X`).

### Résultats attendus (édition d'une tâche)
| Voir en tant que | Tâche A (assignée Bob) | Tâche B (assignée Claire) | Pourquoi |
|---|---|---|---|
| **bob@test.fr** | ✅ éditable | ❌ lecture seule | Bob est assigné de A ; ni assigné ni chef pour B |
| **claire@test.fr** | ✅ éditable | ✅ éditable | Claire = chef de projet (responsable) |
| **alice@test.fr** | ✅ éditable | ✅ éditable | Alice est **au-dessus** de Claire (`chaine_chefs`) |
| email inconnu (hors Team) | ❌ lecture seule | ❌ lecture seule | `user.Agent` = None → défaut |

➡️ Si ce tableau se vérifie, **l'ACL dérivée tient** : les droits découlent du schéma (assignation + chefferie), zéro maintenance de règle quand l'organigramme change.

---

## Notes
- **Owner requis** pour poser ces règles (la personne qui installe le doc). Aucune élévation côté widget.
- **Schéma d'abord** : créer `Entites`/colonnes AVANT les règles (une règle qui référence une colonne absente est rejetée).
- `email` (Team) **doit** = l'email de login Grist (pivot ACL).
- Faisabilité d'une **application programmatique** par un widget : testée OK (owner, one-shot), mais **non retenue** ici au profit de ce snippet natif (plus simple, plus sûr, sans risque de boucle).
