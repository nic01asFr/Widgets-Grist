# Cadrage — la fiche d'entité est un formulaire

*05/09/2026 · branche `atlas-formulaire-entite`*

## L'idée

La fiche d'entité d'Atlas et le formulaire terrain rendent **le même objet** — les
attributs d'une ligne Grist — mais l'une devine ses champs quand l'autre dispose
d'une définition produite depuis QField. Plutôt qu'enrichir la fiche d'Atlas, on
**monte le moteur existant dans son panneau d'entité**, en édition sur la ligne
de l'objet cliqué. Un seul FormDef sert alors trois usages — saisie terrain,
édition sur la carte, consultation publique — et régler le formulaire d'une
couche les règle tous les trois.

## Pourquoi ne rien réécrire

`detectFieldType` (`app_v7.js:437`) écrase tous les types Grist en **deux** :
numérique, ou texte. Conséquence, et ce n'est pas de l'affichage :
`setFeatureAttr` ne coerce que ces deux cas, donc une colonne `Bool` reçoit la
chaîne `"true"`, une `Date` une chaîne, un `Ref` une chaîne au lieu d'un
identifiant de ligne. **La fiche laisse écrire, et écrit faux, sans rien dire.**

Le moteur `grist_forms/runtime/engine.js` connaît `checkbox`, `select`, `radio`,
`multiselect`, `date`, `file`, les cascades `Ref`, la visibilité conditionnelle,
les champs obligatoires — et porte déjà la coercition d'écriture
(`Types.coerceForWrite`). Écrire une table type → widget dans Atlas en aurait
fait le **cinquième site** de la même règle, non testé.

## La chaîne

```
QField / QGIS
   └─ qgis2grist · lib/qgis-form-to-formdef.js:148   → FormDef
        └─ table Formulaires · lib/terrain-provision.js:20
             ├─ app terrain · lib/terrain-app.js:160     (création)
             └─ Atlas · lib/fiche-formulaire.js          (édition)  ← ce chantier
```

---

# UI / UX

## Où le formulaire apparaît

**Dans le corps de l'onglet « Attributs »** de l'inspecteur d'objet
(`app_v7.js`, `renderObjectInspector`). Aucun écran nouveau, aucun onglet de
plus : c'est ce que l'utilisateur y cherche déjà.

Le pied du panneau se tait alors — le moteur porte son propre bouton, et deux
« Enregistrer » dans le même panneau feraient deux choses différentes.

Largeur : `--inspector-w: 360px`, et le formulaire y tient (éprouvé). En mobile
Atlas passe déjà à `100%`.

## Les six états, et ce qu'on voit dans chacun

| État de la couche | Onglet Attributs (objet) | Onglet Fiche (couche) |
|---|---|---|
| table + FormDef | **le formulaire** | le formulaire, activable, lien vers le builder |
| table sans FormDef | `renderAttrFields`, comme aujourd'hui | **« générer depuis les colonnes »** |
| sans table — maquette, distante | lecture seule, comme aujourd'hui | « pas de table, donc pas de fiche » — et pourquoi |
| mode lecture, formulaire exposé | consultation *(à faire dans le moteur)* | — |
| mode lecture, non exposé | le popup actuel | — |
| sélection multiple | **le dire**, pas retomber en silence | — |

> **Le repli n'est pas un échec** : une couche `Arbres` importée d'OSM porte ses
> 69 points comme un blob GeoJSON dans `Maquette_Layers`. Il n'y a aucune ligne à
> mettre à jour, donc la lecture seule est juste. Ce qu'il faut, c'est le
> **dire**, au lieu de laisser un panneau qui a l'air cassé.

## Atteindre le formulaire sans cliquer sur la carte

C'est le manque principal. Aujourd'hui :

```js
editLayerObjects(id) {
    enterSelectionMode(id);                       // aucun objet choisi
    showToast('Cliquez un objet à éditer · …');   // il faut ENCORE cliquer
}
```

Le bouton « ✏️ Éditer les objets un par un » (`app_v7.js:4282`) souffre de deux
défauts distincts :

1. il est gardé par `isPoint`, donc absent des couches de lignes et de surfaces
   — alors que l'édition, elle, fonctionne pour tous les types
   (`enterSelectionMode` est appelé au clic sans condition de géométrie) ;
2. **il ne mène pas au formulaire** : il ouvre le mode sélection à vide.

Il doit **sélectionner toute la couche et se poser sur le premier objet**. La
barre de sélection porte déjà `◀ 1 / N ▶` : on obtient alors une revue objet par
objet, formulaire compris, sans jamais toucher la carte. C'est la fonction que
le bouton promet et n'a jamais rendue.

## L'onglet « Fiche » dans l'inspecteur de couche

La barre se construit en une ligne (`app_v7.js:4256-4259`) :
`['Couleur','Taille'] (+ 'Modèle 3D' si point) + ['Étiquette']`. On y ajoute
`'Fiche'`.

| Ce qu'il porte | |
|---|---|
| **Quel formulaire** | titre, table cible, version — ou « aucun » |
| **L'activer** | il devient la fiche en édition **et** disponible en lecture. Un geste, comme créer un récit. |
| **L'état des droits** | une ligne, sur le modèle du bouton « Droits » de TaskFlow |
| **Le modifier** | lien vers `grist_forms/builder.html` — 3 864 lignes déjà écrites |
| **Le générer** | depuis les colonnes, via `qgis-form-to-formdef.js` |

> **La génération est le point le plus rentable.** Aujourd'hui il faut un projet
> QGIS pour avoir un formulaire. Le convertisseur existe déjà et travaille à
> partir des colonnes : n'importe quelle couche de table peut en obtenir un en
> un clic, sans QField.

## Le style — une peau Atlas, pas le DSFR

Le moteur n'embarque aucun style : il émet **31 classes `fr-*`** et compte sur
l'hôte. `dsfr-like.css` les fournit, mais impose aussi `:root`, `*` et `body`, et
apporte l'identité de l'État — bleu France, ses rayons, sa typographie — dans un
widget ivoire et serif. Le banc l'a neutralisé par l'ordre de chargement ; c'est
un pansement.

**On écrit une peau**, `lib/formulaire-atlas.css`, qui mappe les classes du
moteur sur les jetons d'Atlas et **ne charge pas `dsfr-like.css` du tout** :

| Classe du moteur | Peau Atlas |
|---|---|
| `.fr-input`, `.fr-select` | `--surface`, bordure `--hairline`, focus `--accent`, police `--sans` |
| `.fr-label` | comme `.input-label` — `--muted`, capitale, `--mono` |
| `.fr-btn` | comme `.btn-dark` — fond `--ink` |
| `.fr-btn--secondary` | comme `.btn-soft` |
| `.fr-hint-text` | comme `.hint` — `--muted` |
| `.fr-error-text` | `--accent` |
| `.fr-alert--success` | `--green` |
| `.fr-fieldset__legend` | comme `.section-title` |
| `.fr-checkbox-group`, `.fr-radio-group` | alignement, cible tactile ≥ 24 px |

Deux règles, et elles suppriment la collision au lieu de la contourner :

- **la peau est confinée** sous le conteneur du panneau — aucun sélecteur
  global, ni `:root`, ni `body`, ni `*` ;
- **aucune couleur en dur** : tout passe par les jetons, donc la fiche suit
  Atlas si sa palette change.

---

# Code

## Fichiers touchés, et ce qu'ils portent

| Fichier | Rôle |
|---|---|
| `lib/fiche-formulaire.js` | **le pont, et rien d'autre** — trouver le FormDef, amorcer les valeurs, traduire vers le contrat du moteur |
| `lib/formulaire-atlas.css` | la peau, confinée |
| `app_v7.js` · `renderObjectInspector` | monte le moteur ou retombe sur `renderAttrFields` |
| `app_v7.js` · `renderSymbologyInspector` | l'onglet « Fiche », et le bouton pour tous les types |
| `app_v7.js` · `chargerFormulaires` | lit la table `Formulaires`, absente = repli silencieux |
| `index_v7.html` | charge le moteur et ses trois dépendances |

## Le pont, et pourquoi il est obligatoire

```js
FormEngine.mount(hote, formDef, {
  editRowId:  props._row_id,
  updateRow:  (t, id, data) => applyUserActions([['UpdateRecord', table, id, data]]),
  loadTable:  (t) => docApi.fetchTable(t),
  getAccessToken: (o) => docApi.getAccessToken(o),
});
```

> **Sans pont, le moteur écrit tout seul.** Lignes 565, 573, 779 et 852 de
> `engine.js` : repli direct sur `window.grist.docApi.applyUserActions`. Atlas
> expose `grist` globalement, donc le garde `canWrite` serait court-circuité. Le
> garde est consulté **à chaque soumission**, pas à la construction du pont : les
> droits peuvent changer entre l'ouverture de la fiche et l'envoi.

## Ce qui doit être porté dans `grist_forms`

Deux manques, tous deux dans `runtime/engine.js`, et tous deux valables pour
**tout** consommateur qui voudra éditer — pas seulement Atlas :

1. **`mount` doit accepter des valeurs initiales.** Il ouvre sur
   `var values = {}` en dur : `editRowId` le fait *écrire* dans une ligne
   existante, jamais la *lire*. Et `collectSubmitData` envoie **tous** les champs
   visibles, sans exception. Monté tel quel, ouvrir un objet, cocher une case et
   enregistrer **efface** les champs qu'on n'a pas retapés.
   *Contourné pour l'instant par `amorcerValeurs`, qui pose les valeurs dans le
   DOM après le montage — le moteur relit ses champs avant chaque rendu et avant
   la soumission, donc elles sont reprises.*
2. **Un mode consultation.** Le moteur ne connaît aucun `readOnly` : il rend
   toujours des champs éditables et un bouton de soumission. Sans lui,
   « disponible en lecture » n'a pas de sens.

## Persistance

L'activation voyage **avec la couche**, comme les contrôles exposés :
`styleOut._controls` a déjà ce chemin dans `saveLayerToGrist`, un `_formulaire`
à côté suit la même route. Rien à inventer côté stockage.

La clé de rattachement est la **table cible**, pas la couche : deux couches d'une
même table partagent le formulaire — c'est la donnée qu'on saisit, pas la
représentation.

## Publication

Les chemins du banc (`../grist_forms/…`) ne valent que sur le serveur de dev.
`published/atlas/` doit embarquer :

| | |
|---|---|
| `runtime/engine.js` | 37,1 Ko |
| `shared/attachments.js` | 8,5 Ko |
| `shared/session-context.js` | 6,5 Ko |
| `shared/types.js` | 2,8 Ko |
| **total** | **54,9 Ko** — soit +15 % sur les 372 Ko d'`app.js` |

`dsfr-like.css` **n'est pas embarqué** : la peau le remplace.

`scripts/promote-atlas.js` doit donc aller chercher dans `projects/grist_forms/`.
C'est une dépendance entre projets, à assumer explicitement.

---

# Droits

Rappel du découpage, qui ne change pas :

| Marche | Contenu | Droits touchés |
|---|---|---|
| **1** | le formulaire est la fiche en édition · configurable par couche | aucun |
| **2** | disponible en lecture — mode **Exploitation** | sonde par table |
| **3** | l'activation pose l'ACL dérivée du FormDef | propriétaire |

Trois points acquis, à ne pas redécouvrir :

- **La sonde d'écriture teste la mauvaise table.** `resolveProbeTableId`
  (`lib/view-mode.js:153`) sonde `Atlas_LayerPrefs`, jamais la table de données —
  or l'ACL du relevé refuse justement `Atlas_LayerPrefs`. Atlas déclarerait en
  lecture seule exactement les personnes pour qui le formulaire est exposé.
  **Préalable dur de la marche 2.**
- **`viewMode` veut dire « aucune écriture », et c'est un invariant** tenu en huit
  endroits. On ne l'affaiblit pas : on ajoute un drapeau orthogonal
  `peutSaisir`, et le mode se **déduit** de deux sondes au lieu de se déclarer.
- **Le moteur ACL de Grist est bien plus pauvre qu'une formule de colonne**
  (`tasks_app/ACL_RULES_GENCI.md`, éprouvé le 20/06/2026) : pas de référence de
  table, pas de compréhension de liste, pas de traversée `Ref` → colonne, et un
  User Attribute posé par l'API **ne s'enregistre pas**. Toute la logique va dans
  une colonne formule ; la règle ne fait qu'un test trivial.

---

# Ce qui est déjà prouvé

Éprouvé en Grist réel le 05/09/2026, document `nrRTKiyiz1suJ3NF1QcbqK`, widget
servi en https local :

| | |
|---|---|
| La chaîne complète | table `Formulaires` → FormDef → moteur → entité cliquée |
| Les widgets | texte, nombre, **liste déroulante**, **case à cocher** — les deux derniers étant ce qu'Atlas rendait en texte libre |
| La largeur | tient dans les 360 px du panneau |
| `updateRow` | écrit — `etat` passé à « Bon » sur la ligne 3 |
| La préservation | `nom`, `hauteur` et la géométrie **intacts** après soumission |
| Le CSS | Atlas strictement inchangé |

## La chaîne « importer → éditer », prouvée de bout en bout (05/09/2026)

| Étape | Constaté |
|---|---|
| Import OSM · 10 arbres | une **seule ligne** dans `Maquette_Layers`, fiche en lecture seule |
| « Enregistrer dans Grist » | table `Atlas_Arbres`, **10 lignes**, colonnes `geometry_json` · `natural` (Text, inférée) · `model_id` · `model_glb` (Attachments) |
| Le blob | **retiré** — `Maquette_Layers` inchangée |
| La couche liée | badge `⛓ table`, reconnue par le scan géo d'Atlas lui-même |
| La fiche | **« Modifications enregistrées dans Atlas_Arbres »** — champs éditables |

> **Le défaut que cette épreuve a révélé** : la couche était entablée, son badge
> disait `table`, la fiche montrait les colonnes de la nouvelle table — et elle
> affichait toujours « les objets de cette couche ne sont pas des lignes Grist ».
> Le test posait `source === 'qgis2grist'` quand `entableLayer` produit
> `grist-table`, alors que l'écriture ne demande qu'une `sourceTable` et un
> `_row_id`. `coucheAvecLignes` remplace la condition : **une capacité, pas un
> producteur.** Troisième occurrence du même motif dans la journée.

Et un point de conception confirmé plutôt que supposé : **le formulaire n'envoie
que ses champs**. La géométrie n'a pas bougé. Le « deux écrivains » que je
craignais se résout donc de lui-même — le moteur écrit les attributs, Atlas garde
la géométrie.

Non éprouvé : la case à cocher n'a pas répondu à l'outil d'automatisation. Je ne
sais pas si c'est l'outil ou la page, et ce n'est pas présenté comme un défaut.
