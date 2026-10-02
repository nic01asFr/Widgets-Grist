# Proposition pour `atlas-objets` : les paramètres d'un type, portés par le catalogue

*02/10/2026. Brouillon pour pix2hdr — rien n'est figé, et la spec 0.1 reste inchangée. Atlas lit déjà
ce bloc (`lib/parametres-objet.js`, `descripteursDuType`) ; tant que le catalogue ne le déclare pas,
Atlas applique un schéma intégré par famille (l'éclairage, d'après EclExt et les bandes de pix2hdr).*

## Le besoin

Un objet du catalogue est piloté par des **paramètres** : pour un luminaire, sa puissance, sa
température de couleur, sa hauteur de feu, son statut, ses heures d'allumage ; pour un arbre, sa
hauteur, sa classe d'âge, sa phénologie. Aujourd'hui, ce que le catalogue dit de ces paramètres est
dispersé : les `measure[]` (comment une mesure choisit un fichier), les `defaults`, un bloc propre à la
famille (`lighting`, `vegetation`). Il n'y a pas de description **générique** — nom, unité, plage
admissible, valeur par défaut et d'où elle vient — que l'éditeur d'Atlas pourrait afficher sans savoir
de quelle famille il s'agit.

## La proposition : `parameters[]` sur un type

Un tableau, **facultatif**, sur chaque type. Un lecteur 0.1 l'ignore (§11 de la spec) ; le schéma 0.1
(`additionalProperties: false`) devra l'accepter à la publication de la 0.2.

```json
{
  "id": "mat_crosse",
  "family": "lighting",
  "parameters": [
    {
      "id": "puissance",
      "label": "Puissance",
      "kind": "number",
      "unit": "W",
      "group": "source",
      "min": 0, "max": 1000, "step": 1,
      "usual": [15, 60],
      "default": { "value": 38, "origin": "regle",
                   "explanation": "milieu de la bande 15–60 W (rue de desserte)" },
      "aliases": ["power", "wattage"],
      "inject": true,
      "help": "Puissance nominale du luminaire."
    },
    {
      "id": "statut",
      "label": "Statut",
      "kind": "choice",
      "choices": [ { "value": "functional", "label": "En service" },
                   { "value": "decommissioned", "label": "Hors service" } ],
      "default": { "value": "functional", "origin": "regle" }
    }
  ]
}
```

| Clé | Rôle |
|---|---|
| `id` | identifiant du paramètre ; c'est aussi le nom de colonne sous lequel Atlas l'écrit si on « fige » |
| `kind` | `number`, `choice`, `text`, `heure` (format EclExt), `date` |
| `label`, `unit`, `group`, `help` | ce que l'éditeur affiche ; `group` regroupe les champs du formulaire |
| `min`, `max`, `step` | bornes **dures** : une saisie hors d'elles est refusée |
| `usual` | bande **usuelle** : une valeur hors d'elle est *signalée*, jamais refusée — la donnée est celle de l'équipe |
| `choices` | `[{ value, label }]` pour `kind: choice` |
| `default` | `{ value, origin, explanation }` : la valeur quand rien d'autre ne parle, et **d'où elle vient** |
| `aliases` | noms de champ reconnus en plus de `id` (`height` pour une hauteur de feu) : c'est ce qui lie, par défaut, les colonnes existantes d'un import OSM ou d'une table |
| `inject` | la valeur résolue est remise aux calculs (état, pose, intensité). Faux pour ce qui ne sert qu'à l'affichage : injecter par défaut `allumageSoir` ferait disparaître l'hypothèse « allumage au coucher du soleil » que l'état dit lui-même |

Les clés d'Atlas en français (`libelle`, `groupe`, `unite`, `bande`, `choix`, `defaut`…) sont acceptées
aussi : un catalogue écrit à la main n'a pas à traduire.

## L'origine d'une valeur par défaut

`origin` reprend le vocabulaire de pix2hdr (`_statuts` de `eclairage.json`) : `observe`, `mesure`,
`propage`, `regle`, `herite` ; Atlas y ajoute `catalogue` pour « le type le dit lui-même ». Une valeur
par défaut posée **par règle** doit porter son `explanation` (« milieu de la bande 15–60 W ») : elle
s'affiche telle quelle à côté de la valeur, pour qu'une hypothèse ne passe jamais pour une mesure.

## Comment Atlas résout un paramètre

Pour chaque objet, du plus précis au plus général, et en disant d'où vient la valeur :

1. un **réglage posé sur l'objet** dans Atlas ;
2. un **champ de l'objet** — le champ lié au paramètre, à défaut son nom (`id`) ou un alias ;
3. le **réglage de la couche** pour le type de l'objet (ou pour tous) ;
4. le **défaut du catalogue** (`default`, origine `catalogue` ou celle qu'il déclare) ;
5. la **règle d'Atlas**, quand le catalogue n'en dit rien.

Les valeurs par défaut sont **virtuelles** : elles ne sont jamais écrites dans la table de l'équipe.
Un geste explicite, « Figer dans la table », peut les y écrire (colonnes créées au besoin, cellules
déjà remplies jamais touchées).

## Ce que pix2hdr aurait à faire

1. **Écrire `parameters[]`** dans ses catalogues, pour les familles `lighting` et `vegetation`. Pour
   l'éclairage, le schéma intégré d'Atlas (statut, puissance, température de couleur, hauteur de feu,
   azimut, comportement, allumage du soir, extinction du matin, validité) est une base : les bandes et
   les listes de valeurs viennent déjà de `eclairage.json`.
2. **Dire ses défauts** avec `origin` et `explanation`, comme `eclairage.json` le fait pour ses bandes.
3. **Dire ses alias de champ** : c'est lui qui connaît les noms que portent OSM, la BD TOPO et les
   inventaires.

## Ce que le catalogue n'a pas à porter

Ni les réglages d'une couche, ni ceux d'un objet : ils sont la décision de celui qui monte la scène,
et vivent dans la scène (`Atlas_LayerPrefs`, `atlas_3d_json`).

## État dans Atlas

Lecture faite et testée (`tests/parametres-catalogue.test.js`) ; schéma intégré de l'éclairage ;
panneau « Spécifications » de la couche et de la fiche, généré depuis ce schéma. Une famille de plus —
la végétation — est un schéma de plus (déclaré par le catalogue ou intégré), **pas un écran de plus**.
