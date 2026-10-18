# Les conditions d'un FormDef — ce qui change (10/10/2026)

La grammaire de conditions (celle des étapes et des questions) est désormais un
contrat à part, `conditions-1.0`, évalué par un seul module (`shared/conditions.js`)
que le kit d'applications réutilise pour ses menus, pages, boutons et champs.
Pour qui écrit un FormDef, trois choses changent.

## 1. Un opérateur inconnu n'est plus « vrai »

Avant : tout opérateur que le moteur ne connaissait pas laissait la question
visible, sans un mot. Une faute de frappe (`"contain"` pour `"contains"`) montrait
donc la question à tout le monde.

Maintenant : une condition qu'on ne comprend pas **vaut faux** — la question ou
l'étape **reste cachée** — et le moteur l'écrit, une fois, dans la console :

```
[FormEngine] Condition invalide, elle vaut « faux » (l'élément reste caché) :
/operator : Opérateur « contain » inconnu : écrivez l'un de ==, !=, >, >=, <, <=,
contains, in, notIn, truthy, empty, notEmpty. Vouliez-vous dire « contains » ?
```

Même chose pour une **source** hors `field` / `context` / `audience`, un composé
hors `and` / `or` / `not`, un `not` qui ne porte pas exactement une règle, et une
règle sans `field` ni `path` (« Règle sans cible »).

Au chargement du formulaire, le moteur relit toutes les conditions et signale les
fautes **avec leur chemin dans le FormDef** (`/sections/2/fields/0/condition/operator`),
avant qu'on ne se demande pourquoi une question manque.

Où les voir :

| Besoin | Moyen |
|---|---|
| Lire les erreurs | la console du navigateur, préfixe `[FormEngine]` |
| Les recevoir ailleurs | `FormEngine.definirJournal(fn)` — `fn({ niveau, source, message, code, chemin, … })` |
| Auditer un FormDef | `FormEngine.validateFormDefConditions(formDef)` → liste `{ chemin, code, message, bloquant, propositions? }` |
| Auditer une seule condition | `FormConditions.validerCondition(cond)` |
| Valider avant d'envoyer (hôte) | `monter(...).valider()` → `{ ok, manquants, conditionsInvalides }` |

Les fautes `bloquant: false` (une clé inconnue comme `operater`) sont signalées mais
n'empêchent pas l'évaluation : la condition vaut ce qu'elle valait.

**À faire pour un FormDef déjà écrit** : le charger une fois dans le compositeur ou
appeler `validateFormDefConditions`. Tout ce qu'il signale était déjà un défaut
silencieux — la question s'affichait pour de mauvaises raisons.

## 2. Trois ajouts : `not`, `empty`, `notEmpty`

```json
{ "op": "not", "rules": [ { "field": "Type", "operator": "in", "value": ["ecole", "college"] } ] }
{ "field": "Commentaire", "operator": "notEmpty" }
{ "source": "context", "path": "site", "operator": "empty" }
```

- `not` nie **une** règle (ou un composé). Pour en nier plusieurs, les envelopper
  dans un `and` ou un `or`.
- `empty` : `null`, absent, chaîne vide, liste vide (dont `['L']`, la liste vide de
  Grist). **`0` et `false` sont des réponses**, pas des absences.
- `notEmpty` : le contraire. `value` est ignorée pour ces deux-là et pour `truthy`.

`empty` règle un piège ancien : `{ "operator": "==", "value": 0 }` est vrai aussi pour
une réponse **vide**, à cause de l'égalité lâche (voir §3).

## 3. Ce qui n'a pas changé, mais qui est maintenant écrit

Le contrat documente, sans le modifier, ce que le moteur faisait déjà :

| Opérateur | Comportement |
|---|---|
| `==`, `!=` | égalité **lâche** de JavaScript : `'1' == 1` est vrai, `null == undefined` aussi. **Piège** : `'' == 0` est vrai — une réponse vide égale 0. Pour l'absence de réponse, `empty`. Pour une comparaison de chaînes sans surprise, `in` avec une liste d'une valeur. |
| `>`, `>=`, `<`, `<=` | comparaison **numérique**. Une valeur non numérique donne faux. **Les dates ISO ne se comparent pas** (`'2026-06-01' > '2026-01-01'` est faux : `Number('2026-06-01')` est `NaN`). Une réponse vide vaut 0. |
| `contains` | un élément d'une liste (égalité stricte : `1` n'est pas `'1'`), sinon une sous-chaîne |
| `in`, `notIn` | appartenance par comparaison de chaînes ; `value` est une liste ou une valeur seule |
| `truthy` | vrai au sens JavaScript : `[]` et `'false'` sont vrais |

Restent aussi comme avant :

- une règle dont `field` et `path` sont **présents mais vides** (le compositeur qui n'a
  pas encore été rempli) est vraie ; un objet `{}` aussi ;
- `and` et `or` **sans règle** valent vrai ;
- `source` absente = `field` ; `path` l'emporte sur `field` ;
- le préfixe `context.` ou `audience.` dans `field` / `path` vaut `source: context` / `audience` ;
- l'étape à `gate` (booléen historique) ;
- une condition a toujours le dernier mot sur la **valeur** : une question cachée par
  condition n'envoie rien (et vide ses colonnes à la création).

Un test de dates, d'égalité stricte ou d'autres opérateurs est une évolution du contrat
(`conditions-1.1`), pas de ce lot.

## 4. Le schéma publié

`published/schemas/formdef-1.0.schema.json` rejetait ce que le compositeur produit
(accueil, matrices, échelles, `meta`, `kind`, `description`, `options.polarite`…). Il est
resynchronisé sur la source : **ajouts seulement**, donc une correction de `1.0` et
non une `1.1`. Un FormDef valide hier l'est aujourd'hui.

La seule restriction est celle de la condition : `operator` est une liste fermée. Un
FormDef qui portait un opérateur hors liste était déjà mal évalué (« vrai »). Si vous
préférez traiter cela comme un changement de version, il suffit de republier le
fichier sous `formdef-1.1.schema.json` — le contenu ne change pas.
`bind: null` est accepté dans une règle (le compositeur en écrit).

`conditions-1.0` n'emploie que des mots-clés communs à JSON Schema draft-07 et 2020-12,
pour que le kit (2020-12) et FormDef (draft-07) s'y réfèrent sans le traduire. Le
validateur maison du dépôt ne suit pas un `$ref` d'un fichier à l'autre : la définition
est donc **recopiée** dans le FormDef, et un test garantit qu'elles restent identiques.

## 5. Pour les pages qui embarquent le moteur

Charger `shared/conditions.js` **avant** `runtime/engine.js` :

```html
<script src="shared/session-context.js"></script>
<script src="shared/conditions.js"></script>
<script src="runtime/engine.js"></script>
```

Sans lui, le moteur se replie sur l'ancien évaluateur (opérateur inconnu = vrai) et le
dit une fois en console : rien ne casse, mais rien ne se corrige non plus. Les copies
figées (Atlas, `qgis2grist`) gardent donc leur comportement jusqu'à leur prochaine
vendorisation.
