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

## Le module « Formulaires » — pas un onglet de couche

Il prend place **dans le rail, après Récit et avant Réglages**.

### Pourquoi le rail, et pas l'inspecteur de couche

**Un FormDef est indexé par table, pas par couche.** `formDefPourCouche` cherche
sur `sourceTable`, et deux couches d'une même table partagent le formulaire —
c'est la donnée qu'on saisit, pas sa représentation. Un onglet dans l'inspecteur
de couche aurait donc **menti sur le modèle** : on aurait réglé « le formulaire
de cette couche » alors qu'on règle celui de la table. Deux couches, deux
onglets, un seul objet derrière.

Et il rejoint la famille à laquelle il appartient : **Contrôles** et **Récit**
sont les deux choses qu'un auteur configure *pour le lecteur*. Un formulaire
disponible hors édition est de la même nature.

Enfin, ça passe à l'échelle. Un document a plusieurs tables, donc plusieurs
formulaires ; « choisir » suppose de voir l'ensemble, ce qu'un onglet de couche
ne montre jamais.

### Ce qu'il porte

| | |
|---|---|
| La liste | les tables du document qui **peuvent** porter un formulaire — celles qui ont des lignes |
| Par table | le formulaire trouvé (titre, version), ou « aucun » |
| **Générer** | un FormDef depuis les colonnes, via `qgis-form-to-formdef.js` |
| **Modifier** | vers le builder |
| **Disponible hors édition** | la bascule, comme on active un contrôle |

### Définition par table, exposition par couche

Le formulaire est **défini** une fois, dans la table `Formulaires`, pour une
table cible. Mais « disponible hors édition » est un choix de **scène** : on peut
vouloir exposer le relevé du mobilier dans une scène et pas dans une autre,
alors que la table est la même.

La bascule voyage donc **avec la couche**, comme `_controls` — `saveLayerToGrist`
a déjà ce chemin. Une seule source pour le formulaire, chaque scène décidant de
ce qu'elle publie.

### C'est un module d'auteur

Il entre dans `VIEW_AUTHOR_MODULES` (`app_v7.js:3020`), qui liste les modules
**refusés en lecture**.

> `recit` n'y figure pas — non parce qu'il se configurerait en lecture, mais
> parce qu'un lecteur doit pouvoir **jouer** le récit. Sa configuration est bien
> réservée à l'édition, comme celle des formulaires. La distinction est entre
> *jouer* et *régler*, pas entre les modules.

En lecture, le lecteur obtient donc le formulaire **sur un objet**, jamais le
module qui le règle.

### L'état des droits n'est pas ici

Les droits sont **du document**, pas d'un formulaire. Une ligne par formulaire
répéterait dix fois la même information, et la rendrait invisible à force.

S'il faut l'afficher, il se rattache au **bouton d'édition de la barre du haut**,
à côté de `#view-mode-badge` — l'élément qui dit déjà ce qu'on peut faire ici.

### Ce que garde l'inspecteur de couche

Une ligne, pas un onglet : quel formulaire s'applique, ou le bouton
« Enregistrer dans Grist » quand la couche n'a pas de table. C'est le point de
**découverte**, pas le lieu du réglage — et ça évite un cinquième onglet à un
inspecteur qui en a déjà quatre.

## Deux modes, et c'est le cœur du modèle

Un formulaire ne fait pas toujours la même chose selon la table qu'il vise :

| | Table visée | Mode | Ce que ça produit |
|---|---|---|---|
| **Sur la couche** | celle de la couche | `editRowId` + `updateRow` | on corrige l'objet |
| **Liés à la couche** | une table qui la référence | `addRow` | on **ajoute** une observation |

Un bâtiment inspecté douze fois, ce sont douze lignes dans `Visites` — pas douze
écrasements du bâtiment. C'est le motif que le terrain demande réellement, et
c'est celui que l'app terrain pratique déjà (elle ne fait que de la création).

**Un formulaire est lié à une couche si sa table cible porte une colonne `Ref:`
vers la table de la couche.** Ce lien s'établit de deux façons, et l'ordre
compte :

| | Quand | Ce qu'Atlas sait |
|---|---|---|
| **déclaré** | le formulaire a été créé depuis l'onglet d'une couche | la couche visée est un **fait enregistré**, posé par le geste de création |
| **découvert** | le formulaire vient d'ailleurs — QField, une autre table | Atlas lit le schéma et cherche une colonne `Ref:` |

Le déclaré l'emporte. C'est ce qui rend le cas courant sûr : quand on crée un
formulaire de visite depuis la couche `Batiments`, `ensure-schema` matérialise
`Visites` **avec** sa colonne `Ref:Batiments`, et plus rien n'est à deviner
ensuite.

### Atlas porte la référence, le formulaire n'a pas à la déclarer

La référence n'est pas une saisie, c'est un **fait du contexte** : on a cliqué
cet objet. Le pont l'injecte donc à la soumission —

```js
addRow: (table, data) => applyUserActions([['AddRecord', table, null,
    { ...data, [colonneRef]: rowIdDeLObjetClique }]]),
```

Ce qui supprime d'un coup le besoin que le FormDef déclare le champ, celui de le
préremplir, celui de le **verrouiller** — et, pour ce cas, le correctif
`hidden` / `defaultValue` côté `grist_forms`.

> **C'est le clic qui fait foi.** Un formulaire hérité de QField n'expose pas
> forcément son `Ref` : conçu pour l'app terrain, il n'a pas à demander « quel
> bâtiment ? », la personne l'a choisi avant. Sans injection, la soumission
> créerait une ligne au `Ref` vide — **une observation rattachée à rien**, sans
> erreur ni message. Le silence est le mode de panne habituel de ce dépôt.

Reste un cas ambigu, et il a rétréci : une table satellite **découverte** qui
référencerait deux fois la même table (`batiment_avant`, `batiment_apres`). Un
formulaire créé depuis Atlas n'est jamais dans ce cas. Conduite retenue :
**prendre le premier `Ref:` et l'afficher** — « rattaché par `batiment` » — au
lieu de choisir en silence. Le jour où un vrai cas se présente, le choix se pose
là, et il sera visible qu'il manquait. Construire l'arbitrage maintenant serait
spéculatif ; ce dépôt paie déjà cher les règles écrites pour des cas jamais
rencontrés.

### Ce que le contexte remplit d'autre

La référence n'est pas seule à être un fait de la situation. Date, position,
auteur le sont aussi — mais elles ne se traitent pas pareil :

| | Injecté, invisible | Prérempli, corrigeable |
|---|---|---|
| **référence à l'objet** | ✓ le clic fait foi | |
| **auteur** | ✓ la session fait foi | |
| **date du jour** | | ✓ on relève parfois le lendemain |
| **position GPS** | | ✓ elle est fausse en intérieur |

Ce qui est **factuel** passe par le pont sans se montrer ; ce qui est
**probable** se préremplit et reste modifiable — c'est déjà ce que fait
`amorcerValeurs`, il n'y a pas de mécanique à inventer.

> **Réserve sur le GPS, à lever avant de le promettre.** Le bouton de
> géolocalisation d'Atlas affiche « Location not available » et reste
> **désactivé** dans le widget. Une iframe imbriquée n'a la géolocalisation que
> si son parent la lui accorde (`allow="geolocation"`), et c'est Grist qui
> contrôle cet attribut. Si elle n'est pas accordée, la position ne viendra que
> de l'app terrain, jamais du widget.

## Trois surfaces, trois rôles

```
Onglet « Formulaire » (couche)      CHOISIR ce qu'on peut faire sur ces objets
   ├─ sur la couche  → éditer        (défaut, généré depuis les colonnes)
   ├─ liés           → ajouter       (dérivés des Ref)
   └─ créer          → passe la main au builder, avec le contexte

Module « Formulaires » (document)   EXPOSER — quels formulaires existent,
                                    lesquels sont disponibles hors édition

Builder (grist_forms)               DÉFINIR et MATÉRIALISER
```

Les deux sens de dérivation existent déjà, et se complètent :

| Sens | Qui | Quand |
|---|---|---|
| **Table → FormDef** | `qgis2grist/lib/qgis-form-to-formdef.js` | la table existe (bâtiments, arbres entablés) |
| **FormDef → Table** | `grist_forms/shared/ensure-schema.js` | rien n'existe (visites, relevés) — le formulaire dessiné fait naître la table |

`ensure-schema` se décrit lui-même comme « le dual du bind », pose `AddTable`
quand la table manque, `AddColumn` quand elle est incomplète, et ne remplace
**jamais** une colonne d'un type incompatible.

> **Atlas ne crée donc ni table satellite ni formulaire.** Il choisit, il expose,
> il tend la main. `entableLayer` reste son seul cas de création de table, pour
> une raison qui n'appartient qu'à lui : transformer une couche importée en
> lignes. Un seul créateur par objet, comme partout ailleurs dans le dépôt.

### Rien n'existe tant que l'utilisateur ne l'a pas fait

**Atlas ne livre aucun formulaire.** Pas de fiche de visite type, pas de
formulaire de relevé prêt à l'emploi. C'est l'utilisateur qui construit le sien
depuis le module, comme il écrit son récit — et un document où personne n'en a
fait n'en a pas.

Ce qui suit de cette règle, et qu'il faut tenir :

- **« Générer depuis les colonnes » produit un brouillon, pas un enregistrement.**
  Tant que rien n'est enregistré dans `Formulaires`, l'onglet Attributs reste sur
  `renderAttrFields` — le comportement d'aujourd'hui, inchangé.
- **Le mode « lié » n'est pas une promesse d'Atlas.** Il n'existe que si
  l'utilisateur a bâti un formulaire sur une autre table. Aucune table satellite
  n'apparaît d'elle-même.
- **Empreinte nulle par défaut**, exactement comme le Plan de charge dans
  TaskFlow : la table `Formulaires` n'est lue que si elle existe, et son absence
  est un repli silencieux, pas une erreur.

### L'import QField reste un chemin de plein droit

Importer un projet QField par qgis2grist et s'en servir dans Atlas doit
continuer de marcher. **C'est déjà le cas**, et la jointure est plus solide
qu'on ne pouvait l'espérer, parce qu'aucun des deux côtés ne connaît l'autre :

| Étape | Fichier | Ce qui est posé |
|---|---|---|
| QGIS → FormDef | `qgis2grist/lib/qgis-form-to-formdef.js:170` | `tableId` = le nom de la table Grist, `composeMode: 'bind'` |
| FormDef → document | `qgis2grist/lib/terrain-provision.js` · `saveTerrainForms` | une ligne dans `Formulaires`, colonne `Def` = le JSON |
| le schéma de cette table | `grist_forms/shared/formulaires-table.js` | **partagé** — `FormId`, `TableCible`, `Def`, `Statut`, `Version` |
| document → Atlas | `Atlas/app_v7.js` · `chargerFormulaires` | relit `Def`, garde `def.tableId` |
| la couche | `Atlas/lib/scene-loader.js:595` | `sourceTable` = le nom de la table, par son propre balayage |

**La jointure se fait par le nom de la table Grist**, découvert de chaque côté
séparément. Rien à câbler entre les deux projets : c'est ce qui la rend robuste.

Et un formulaire QField vise **la table de sa propre couche** — il tombe donc
dans le mode « sur la couche », en édition. Aucune découverte de `Ref` n'entre en
jeu pour ce cas, qui est le cas courant.

#### Trois choses que le module devra respecter

1. **`Statut` existe déjà** — `brouillon | publie | terrain` — et qgis2grist y
   écrit `'terrain'`. Atlas l'ignore aujourd'hui. La bascule « exposer hors
   édition » doit lire et écrire **cette colonne**, pas en inventer une : deux
   vérités sur le même fait seraient une source de panne, pas une commodité.
2. **Un pack QField arrive donc déjà marqué exposé.** C'est cohérent — importer
   un projet QField de terrain *est* le geste qui demande du terrain, et la règle
   « rien par défaut » vise ce qu'Atlas fabrique tout seul, pas ce que
   l'utilisateur importe délibérément. Mais le module doit le **montrer**, pour
   que ça ne se découvre jamais après coup.
3. **`formDefPourCouche` prend le premier** (`find` sur `tableId`). Correct tant
   qu'il n'y a qu'un formulaire par table ; faux dès que le module permet d'en
   avoir plusieurs — ce qui est précisément son objet. Choisir lequel sert la
   fiche est le rôle de l'onglet de la couche.

Côté qgis2grist, `saveTerrainForms` fait un **upsert par `FormId`** : réimporter
met à jour la ligne au lieu d'en ajouter une. Ce point-là est déjà sain.

### Le mode exploitation, et les trois pièges qu'il a révélés

Un formulaire publié se remplit **hors édition**. Atlas confondait deux choses
sous le mot « lecture » : *il ne montre pas ses outils d'auteur* et *vous ne
pouvez rien écrire*. Le lien de terrain veut le premier sans le second.

`CONFIG.peutSaisir` porte désormais le second, et `saisieHorsEdition` décide sur
quatre conditions — l'objet a une ligne, la scène l'a publié, le formulaire est
prêt, la personne peut écrire.

Trois pièges, tous **mesurés** plutôt que supposés :

| | Ce qui se passait | Pourquoi |
|---|---|---|
| **accès** | la sonde d'écriture échouait toujours | `?mode=view` demandait `read table`, ce qui ferme l'écriture **au widget**, avant tout examen des droits |
| **valeurs** | « Bon » restait décoché à l'étape 2 | amorcer le DOM après le montage n'atteint que l'étape affichée ; et écrire `el.value` sur un groupe de radios **remplace la valeur du premier bouton** — cocher « Neuf » aurait enregistré « Bon » |
| **thème** | cases et radios en disques noirs | `grist-plugin-api.js` pousse le thème du document **en style en ligne** sur `<html>`, ce qui bat toute feuille |

Le deuxième a été corrigé **dans `grist_forms`** — `mount` accepte des valeurs
initiales — parce qu'il vaut pour tout consommateur qui édite, pas seulement
pour Atlas. C'est l'item « valeurs initiales » de la liste, réglé.

> **Un banc visuel entre au dépôt** : `tests/browser-validate-formulaire.html`
> rend le même balisage hors de tout Grist et affiche les valeurs calculées.
> Il a tranché la question du thème en une seconde, là où trois hypothèses
> s'étaient succédé.

### Où vit le builder — et pourquoi la question est mal posée

Puisque c'est l'utilisateur qui bâtit son formulaire, il lui faut un endroit où
le faire. Deux voies :

| | Comment | Coût | Limite |
|---|---|---|---|
| **A · page du document** | l'utilisateur ajoute une page portant le builder ; Atlas y renvoie | nul | il faut que la page existe, et on quitte la carte |
| **B · embarqué dans Atlas** | iframe, Atlas descend l'API Grist par un pont | réel | **mais le pont existe déjà** |

La bonne formulation n'est pas « mettre le builder dans Atlas », c'est **finir de
rendre le builder agnostique de son hôte** — Atlas devenant le premier à s'en
servir, pas le seul. Le terrain est préparé des deux côtés :

- `grist_forms/shared/grist-bridge.js` se décrit lui-même comme « portable, sans
  dépendance, distribuable en `<script>` », et annonce deux hôtes possibles :
  l'API Grist native, **ou un hôte qui injecte le pont** ;
- `GristBridgeParent` (Artefactory) est exactement ce second hôte, et il répond
  à n'importe quelle iframe descendante.

Retenu : **B, formulé comme du travail sur `grist_forms`**, avec **A en repli
immédiat** le temps que B soit prêt. Un renvoi vers une page coûte une ligne ;
il débloque l'usage pendant que le pont se termine.

## Trois frictions d'usage, relevées avant d'être livrées

1. **On ne voit pas les observations passées.** Le formulaire ajoute une ligne ;
   il ne montre pas les douze précédentes. Sur le terrain c'est la première
   question — « quand est-elle passée la dernière fois ? ». Le moteur ne sait
   pas le faire.

   Ce n'est **plus un bloqueur du cadrage**, puisque aucun formulaire lié
   n'existe avant que l'utilisateur en fabrique un : la question ne se pose qu'au
   moment où il le fait. Elle reste entière à ce moment-là, et six choix la
   composent — **où** (au-dessus du formulaire, plutôt qu'un onglet de plus),
   **combien** (dans 360 px, « 12 visites · dernière le 14/03 » suffit),
   **quoi** — le point dur : rien ne dit quelles colonnes résument une visite, et
   une heuristique qui se trompe est pire que rien —, **à quel coût**
   (`fetchTable` rapatrie toute la table, Grist ne filtre pas côté serveur),
   **modifiable ou non** (ouvrir une observation passée serait un troisième
   mode), et **visible par qui** (en lecture, voit-on les relevés des autres ?
   c'est de l'ACL, pas de l'UI).

   Piste retenue si le besoin vient : compte + dernière observation, résumé
   déclaré dans le FormDef, consultation seule.
2. **Après l'enregistrement, que fait le panneau ?** Il reste, ou il avance au
   suivant ? En revue avec `◀ ▶`, avancer est le rythme d'une tournée. Décision
   à prendre, pas détail.
3. **Atteindre l'objet.** La couche `-hit` **n'est jamais créée** : la cible
   d'une ligne est son trait de 4 px, celle d'un modèle 3D un disque de 2 à
   4,5 px. Au doigt, c'est là que ça bloque — **avant** tout formulaire. Un
   formulaire qu'on n'arrive pas à ouvrir ne sert à rien : ce point remonte
   juste après le module, et il profite à tout Atlas, pas seulement à cet axe.

## Ce qui reste, au 06/09/2026

Le formulaire d'entité, le module, et la saisie hors édition sont livrés et
éprouvés en Grist réel. Trois choses restent, dans cet ordre :

| | | Pourquoi là |
|---|---|---|
| **1** | la couche **`-hit`** | un objet qu'on n'atteint pas au doigt rend tout le reste inutile : une ligne offre 4 px, un modèle 3D un disque de 2 à 4,5 px. Ça profite à tout Atlas, pas seulement à cet axe |
| **2** | le **vendoring** de `grist_forms` dans `published/atlas/` | ~55 Ko ; `index_v7.html` charge `../grist_forms/`, un chemin qui n'existe que sur le serveur de développement. **Bloquant pour toute fusion vers `main`** |
| **3** | la **marche 3** — ACL dérivée du FormDef | et son premier geste est la sonde par table, cf. la réserve plus bas |

Deux questions restent ouvertes et ne se tranchent pas seules : **l'historique
des observations** (six choix, dont un point dur — rien ne dit quelles colonnes
résument une visite) et **ce que fait le panneau après l'enregistrement**, rester
ou avancer au suivant.

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
| `app_v7.js` · `renderSymbologyInspector` | la ligne « quel formulaire », et le bouton de revue pour tous les types |
| `app_v7.js` · `renderFormulaires` | **le module** — liste des tables, génération, bascule d'exposition |
| `app_v7.js` · `chargerFormulaires` | lit la table `Formulaires`, absente = repli silencieux |
| `index_v7.html` | charge le moteur et ses trois dépendances |

## Ce que coûte l'ajout du module

Cinq points d'accroche, tous existants — aucun n'est une invention :

| Où | Quoi |
|---|---|
| `index_v7.html` | une entrée `.rail-item` de plus, après Récit |
| `MODULE_TITLES` (`:3016`) | `formulaires: 'Formulaires'` |
| `VIEW_AUTHOR_MODULES` (`:3020`) | y ajouter `'formulaires'` — refusé en lecture |
| `openModule` (`:3056`) | une branche `renderFormulaires()` |
| `saveLayerToGrist` | `styleOut._formulaire` à côté de `_controls` — même chemin |

Le module lui-même reprend la structure de `renderControles` : un sélecteur, une
liste, des bascules. Rien de nouveau côté UI.

**Ce que ça retire du plan** : l'onglet « Fiche » disparaît, et l'étape
« générer un FormDef depuis les colonnes » est absorbée — c'est le même écran.
L'inspecteur de couche ne garde qu'une ligne, qui existe déjà à moitié
(`enteteSansTable`).

**Ce que ça n'atteint pas** : la sonde par table, le mode Exploitation et l'ACL
restent inchangés et hors de cette marche.

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

| Marche | Contenu | Droits touchés | État |
|---|---|---|---|
| **1** | le formulaire est la fiche en édition · configurable par couche | aucun | **fait** |
| **2** | disponible en lecture — mode **Exploitation** | sonde par table | **fait, avec une réserve** |
| **3** | l'activation pose l'ACL dérivée du FormDef | propriétaire | à faire |

> **La réserve de la marche 2, et il faut la lire avant de bâtir la 3.** Le mode
> exploitation repose sur `CONFIG.peutSaisir`, établi par `probeCanWriteDoc` —
> qui sonde la table choisie par `resolveProbeTableId`, **pas celle de la
> couche**. Tant qu'aucune règle d'accès ne distingue les tables, toutes
> répondent la même chose et le mode est juste. **Dès la marche 3**, où l'ACL
> refusera précisément `Atlas_LayerPrefs` au releveur, la sonde déclarera en
> lecture seule exactement les personnes pour qui le formulaire est exposé.
>
> La sonde par table est donc le **premier geste de la marche 3**, pas un
> raffinement de la 2. Elle n'a pas été faite ici pour ne pas livrer, en fin de
> chantier, un changement de droits non éprouvé en Grist réel.

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
