# Composants de saisie — binding FormDef ↔ Grist

**Date** : 2026-09-19
**Statut** : proposition — à valider avant implémentation
**Repo** : Widgets Grist (`projects/grist_forms/`)
**Complète** : `2026-07-26-grist-forms-builder-design.md` §4.3 (types & widgets), qui s'arrêtait au couple type → widget sans fixer la valeur écrite ni les cas vides.
**Source des besoins** : l'enquête « Espaces publics du 4ᵉ » (doc `e1j5ym1Bd5ec`, questionnaire HTML autonome), et les défauts constatés en Grist réel le 18/09/2026.

---

## 1. Ce que Grist fait réellement des valeurs vides

Mesuré le 19/09/2026 sur docs.getgrist.com (Grist 1.7.18), par `AddRecord` :

| Écrit par le formulaire | Int | Numeric | Bool | ChoiceList | Text |
|---|---|---|---|---|---|
| **colonne omise** | `0` | `0` | `false` | `null` | `""` |
| **`null` explicite** | `null` | `null` | `false` | `null` | — |

- L'ordre d'une ChoiceList (`['L','c','a','b']`) est **conservé**.
- `AVERAGE($col)` ignore `null` mais **compte les 0** : sur `0, null, 4, 2` il rend `2` au lieu de `3`.

Trois conséquences fixent la suite :

1. **Omettre une colonne numérique, c'est écrire 0.** Une question masquée ou non posée doit être écrite `null` **explicitement**, sinon toute moyenne native est fausse. C'est exactement ce qu'on voit dans l'enquête (`H3_AccesArrets = 0` pour une personne à qui la question n'a pas été posée).
2. **Une colonne Bool n'a pas d'état « non posé ».** Un Oui/Non dont l'absence de réponse a un sens se stocke en **Choice `["Oui","Non"]`**, pas en Bool.
3. **L'ordre d'une ChoiceList est une donnée.** Un classement peut tenir dans une seule colonne.

---

## 2. Règles transverses

| # | Règle |
|---|---|
| R1 | **Type normalisé à l'entrée.** `Ref:T` / `RefList:T` → `type: "Ref"` + `options.refTable: "T"`. Fait **dans le moteur** (`Types.normalizeGristType`), pas chez chaque producteur. Corrige la perte de référence du formulaire déduit (Atlas). |
| R2 | **Réponse masquée = `null` explicite** à la création, pour tous les types qui l'acceptent (Int, Numeric, Date, DateTime, Ref, Choice, ChoiceList, RefList, Attachments) ; `""` pour Text. Jamais omise. En édition, une question devenue masquée est aussi remise à vide : la ligne reflète ce que le formulaire montre. |
| R3 | **Une valeur non déclarée n'est jamais écrite** (déjà vrai : `collectSubmitData` ne part que des champs du FormDef). |
| R4 | **Lecture comme écriture dans le moteur.** Les conversions Grist → champ (dates en secondes → `AAAA-MM-JJ`, `['L',…]` → tableau, id de Ref → option) vivent dans le moteur, à côté de `coerceForWrite`. Atlas n'a plus à les porter. |
| R5 | **Dates** : `Date` = secondes à minuit UTC ; `DateTime` = secondes, heure locale du navigateur à la saisie. |
| R6 | **Géométrie** : colonne Text, **une géométrie GeoJSON** (pas une FeatureCollection), EPSG:4326. Nom recommandé `geometry` (lu tel quel par Atlas, `detectGeometryColumn`). |
| R7 | **« Non concerné » ≠ « non posé »** : les deux valent `null` dans la colonne ; le « Non concerné » est en plus inscrit dans une colonne ChoiceList unique du formulaire (`meta.nspCol`), qui liste les `colId` concernés. |

---

## 3. Catalogue des composants

Colonnes : **widget** = valeur de `field.widget` ; **types** = types Grist acceptés ; **écrit** = valeur envoyée à Grist ; **vide** = valeur si masqué ou sans réponse.

### 3.1 Existants (moteur actuel)

| Composant | widget | types | écrit | vide | options |
|---|---|---|---|---|---|
| Texte court | `text` | Text | chaîne | `""` | `placeholder` |
| Texte long | `textarea` | Text | chaîne | `""` | `placeholder` |
| Nombre | `number` | Int, Numeric | nombre | `null` | `step`, `min`, `max` |
| Case à cocher | `checkbox` | Bool | `true`/`false` | `false` | — |
| Date | `date` | Date | secondes UTC minuit | `null` | `min`, `max` |
| Date et heure | `datetime` | DateTime | secondes | `null` | — |
| Liste déroulante | `select` | Choice, Ref | texte / id | `null` | `choices` ou `refTable`, `visibleCol`, `cascade`, `dynamicFilter` |
| Boutons radio | `radio` | Choice | texte | `null` | `choices` |
| Cases multiples | `multiselect` | ChoiceList, RefList | `['L', …]` | `null` | `choices` ou `refTable` ; **nouveau** `maxSelected` |
| Échelle 1–5 | `likert` | Int | 1…5 | `null` | **nouveau** `scale` (voir 3.2) |
| Fichiers / photo | `file` | Attachments | `['L', id…]` | `null` | `accept`, `maxFiles` |

### 3.2 Nouveaux (besoins de l'enquête)

| Composant | widget | types | écrit | vide | options |
|---|---|---|---|---|---|
| **Oui / Non** (réponse obligatoire, absence significative) | `yesno` | Choice `["Oui","Non"]` ; Bool toléré | `"Oui"`/`"Non"` (Bool : `true`/`false`) | `null` (Bool : `false`, ambigu) | `labels` |
| **Échelle en matrice** | `likert` + `options.matrix` | Int | 1…5 | `null` ; NSP → `null` + R7 | `scale: {min, max, labels:[g, d], nsp}` porté par `formDef.scales[matrix]` |
| **Plafond de sélection** | `multiselect` | ChoiceList | `['L', …]` | `null` | `maxSelected` (compteur « 3/5 ») |
| **Classement** | `rank` | ChoiceList (ordre = rang) | `['L', 1er, 2e, 3e]` | `null` | `choices`, `rankSize` ; `rankColumns: [c1,c2,c3]` pour écrire dans N colonnes Choice (compatibilité enquête existante) |
| **« Autre, précisez »** | `text` + condition | Text | chaîne | `""` | pas de composant : `condition: {field, operator:"contains", value:"Autre"}` |
| **Géométrie** (point, ligne, surface) | `geo` | Text | une géométrie GeoJSON : `Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon` | `""` | `geometry` (types permis), `maxCount`, `center`, `zoom`, `basemap: "ign"` — voir §3.4 |
| **Carte de repérage** | `display-map` | — (aucune colonne) | — | — | `places: [{label, lon, lat}]` ; bloc d'affichage |
| **Texte / image d'information** | `display-text`, `display-image` | — | — | — | `html` échappé / `src`, `alt` |

Les composants `display-*` n'ont pas de `colId` : le schéma FormDef doit l'accepter pour eux (§4).

### 3.3 Métadonnées de réponse (écrites sans question)

Déclarées dans `formDef.meta`, jamais affichées :

| Clé | Type Grist | Valeur |
|---|---|---|
| `timestampCol` | DateTime | secondes à l'envoi |
| `durationCol` | Int | secondes entre l'ouverture et l'envoi |
| `nspCol` | ChoiceList | `colId` des questions répondues « Non concerné » (R7) |
| `emailCol` | Text | email de la personne connectée, si connu (`SessionContext`) |

### 3.4 La géométrie : un champ du formulaire, un éditeur de la carto

Choisir un point, une ligne ou une surface, **c'est de l'édition cartographique**. La
spec de binding carto l'écartait (« géométrie dans FormDef : hors scope, carto = Scene
Manifest séparé »). L'enquête montre que ce n'est pas tenable : une réponse d'enquête
porte un lieu, et un relevé de terrain *est* un objet géographique avec ses attributs.

On sépare donc deux choses qui ont été confondues :

| | Relève du formulaire (FormDef) | Relève de la carto (Atlas, Scene Manifest) |
|---|---|---|
| **Le contrat** | le champ : `colId`, types de géométrie permis, nombre max, obligatoire, condition d'affichage | — |
| **Le format stocké** | R6 : une géométrie GeoJSON EPSG:4326 dans une colonne Text | **le même** : c'est ce qu'Atlas lit (`detectGeometryColumn`) |
| **L'outil de dessin** | — | l'éditeur de géométrie : tracé, sommets, déplacement, fond de plan, couches de contexte |
| **Au-delà** | — | accrochage, topologie, découpe, édition de plusieurs objets, styles |

Règle : **le moteur de formulaire ne contient pas d'éditeur cartographique.** Le widget
`geo` reçoit l'éditeur par le pont, comme il reçoit déjà l'envoi des pièces jointes
(`bridge.uploadFile`) :

- **dans Atlas**, `bridge.editGeometry(champ, valeur)` ouvre les outils de dessin
  d'Atlas sur la carte déjà affichée, et rend la géométrie ;
- **dans une vue publiée ou une enquête autonome**, le moteur embarque un éditeur
  minimal (Leaflet : poser, déplacer, supprimer des sommets), sans accrochage ni couches ;
- **aucun hôte** : le champ s'affiche en lecture (aperçu de la géométrie existante).

Conséquences :

1. Un même relevé se saisit **indifféremment** dans l'enquête publique et dans Atlas :
   même colonne, même format, même FormDef.
2. La fiche d'entité d'Atlas peut enfin inclure la géométrie dans le formulaire, au lieu
   de l'écarter (`colonnesHorsFormulaire` retire aujourd'hui la colonne de géométrie).
3. L'éditeur minimal embarqué est une **dette assumée** : s'il grossit (accrochage,
   couches), c'est le signe qu'il faut ouvrir Atlas plutôt que l'enrichir.

---

## 4. Changements du contrat FormDef

- `field.colId` **facultatif** si `widget` commence par `display-`.
- `field.options` documente : `maxSelected`, `matrix`, `rankSize`, `rankColumns`, `geometry`, `maxCount`, `center`, `zoom`, `basemap`, `places`, `labels`.
- Nouveaux objets racine : `scales` (échelles partagées par les matrices) et `meta` (§3.3).
- `field.type` : **toujours la forme normalisée** (`Ref` + `options.refTable`). La forme `Ref:T` est acceptée en lecture et convertie (R1).
- Schéma **sans** `_colIdLocked` et autres clés internes du builder : elles restent dans l'état du builder et ne sont pas enregistrées dans `Def`.

Projection Survey Manifest : `likert` → `likert5` (échelle et NSP en options), `rank` → `rank`, `geo` → `geo_point`, `yesno` → `bool`, `display-*` non projetés.

---

## 5. L'enquête du 4ᵉ exprimée avec ce catalogue

Sans changer une seule colonne de sa table `Reponses` :

| Questions | Composant |
|---|---|
| A1, A2, A4, B1, B2, F1, I5 | `radio` sur Choice |
| A3, B5, B6, C7 | `multiselect` |
| D1 | `multiselect` + `maxSelected: 5` |
| B3, B4, H0–H2, I0, J0, K0, L0 | `yesno` sur Bool (tel quel) — ou Choice pour distinguer « non posé » |
| C1–C5, F2a–F2f, G1–G3, H3–H4, I1, I4, J1–J2, K1–K3, L1–L5, M1–M6 | `likert` en matrices, `scale` partagée, `nsp` selon le thème |
| E1–E3 | `rank` + `rankColumns: ["E1_Prio1","E2_Prio2","E3_Prio3"]` |
| E (carte des lieux) | `display-map` |
| G_Geometries | `geo`, `MultiPoint` (au lieu d'une FeatureCollection, pour être lu par Atlas) |
| C7_Autre, D2, E4, G2_RuesConcernees, N1 | `text` / `textarea`, conditionnés pour les « Autre » |
| Horodatage, DureeSecondes | `meta.timestampCol`, `meta.durationCol` |
| Étape F (habitants), thèmes H à L | `section.condition` / `gate` |

Gains par rapport au questionnaire actuel : réponses masquées non écrites (R2), zéros remplacés par `null` (moyennes natives justes), géométrie lisible par Atlas.

---

## 6. Ordre d'implémentation proposé

1. R1, R2, R4 dans le moteur, avec tests — corrige les pertes de données constatées.
2. `maxSelected`, `yesno`, `meta` — petits, sans nouveau rendu complexe.
3. `likert` en matrice + NSP (R7).
4. `rank` (avec `rankColumns`).
5. `geo` et `display-*` (dépendance Leaflet à embarquer dans le bundle publié).

## 7. Points ouverts

- **Bool tri-état** : faut-il migrer les Bool de l'enquête en Choice ? Aucune perte de données, mais un changement de type de colonne sur un document en service.
- **NSP en colonne unique (R7)** : alternative = une colonne `_nsp` par question (lisible mais 30 colonnes de plus).
- **Leaflet dans la vue publiée** : +150 Ko dans `_js` ; à mesurer par rapport à la limite d'options de section.
- **Éditeur de géométrie d'Atlas exposé par le pont (§3.4)** : à arbitrer avec le chantier
  Atlas (et Passerelle / cerema-geo-components, cf. positionnement du 03/08) — c'est lui
  qui fixe la surface de `bridge.editGeometry`.
- **Spec carto** : `2026-07-29-form-binding-blocknote-cerema-design.md` §4 (« géométrie
  dans FormDef : hors scope ») est à amender si §3.4 est validé.
