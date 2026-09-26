# Cadrage — créer et modifier des géométries dans Atlas

*24/09/2026. Synthèse et décisions. Les preuves, avec leurs références
fichier:ligne, sont dans les trois études de `docs/etudes-edition-geom/` :
`01-EXISTANT-ET-ECART.md`, `02-UX-ET-INTERACTION.md`,
`03-SCHEMA-DONNEES-ET-LOTS.md`. Ce document tranche là où elles divergent et
fixe l'ordre de marche.*

## Ce qu'on veut

Qu'un éditeur puisse, dans Atlas et sans passer par QGIS :

- **créer une couche** depuis le module Couches (nom + type : point, ligne,
  surface) ;
- **créer un objet** depuis le panneau de cette couche : le dessiner, remplir
  sa fiche, l'enregistrer ;
- **modifier la géométrie** d'un objet existant (déplacer, ajouter, retirer des
  sommets) et le **supprimer** ;

de façon fiable — une écriture Grist juste, relue à l'identique —, intégrée à
l'interface d'Atlas, et réutilisable ensuite pour **tracer un trajet** de récit.

## Où on part

Atlas ne sait aujourd'hui ni créer une couche vide (refusé à quatre endroits),
ni dessiner, ni déplacer un sommet. L'écrivain de géométrie existe
(`featureToRowUpdate`) mais ne sert qu'aux couches qgis2grist, écrit des noms de
colonnes figés et ne sait pas écrire un point rangé en `geometry_json`. Plusieurs
défauts latents se trouvent exactement sur le chemin du chantier (étude 01 §8) :
ils passent **avant** toute interface.

## Décisions

| Sujet | Décision | Écarté, et pourquoi |
|---|---|---|
| Format d'une couche créée | Point : `latitude` / `longitude` (`Numeric`). Ligne, surface : `geometry_json` (`Text`, GeoJSON 2D, 7 décimales) | `geometry_json` pour tout (précédent d'`entableLayer`) : illisible dans la grille, et l'écrivain actuel ne sait pas y écrire un point |
| Une couche | une table mono-type, sans préfixe `Atlas_`, + sa ligne d'inventaire `Maquette_Layers` (seule à porter le type d'une table vide) + sa ligne `Atlas_LayerPrefs`, **en une seule transaction** | détecter le type au premier objet : impossible sur une table vide |
| Colonnes de départ | `nom`, et la géométrie. Rien d'autre | livrer un modèle de fiche : contraire à « rien n'existe tant que l'utilisateur ne l'a pas fait » (`CADRAGE-FICHE-ENTITE.md`) |
| Interface | une **session d'édition de couche** : le panneau droit devient le panneau d'édition (objet courant, mesures, fiche, Abandonner / Enregistrer), les outils prennent la place de la barre de sélection | un onglet « Géométrie » : on le quitte alors que la carte reste armée |
| Créer un objet | dessiner → fiche → **un seul `AddRecord`** portant géométrie et attributs ; Annuler n'écrit rien | `AddRecord` puis fiche : contourne les champs obligatoires, laisse des lignes incomplètes |
| Identité d'un objet | son `_row_id`. La sélection se remappe par `_row_id` après toute relecture | le rang (`_idx`) : il se décale dès qu'une ligne est ajoutée ou retirée |
| Écriture | seules les cellules de géométrie partent quand on modifie une géométrie ; application locale puis `syncLayerSourceData`, sans relire la table | réécrire géométrie et attributs à chaque enregistrement (perd le Z, périme les centroïdes) |
| Modes de la carte | **un seul état exclusif** (lieu, trajet, dessin), consulté en tête du clic, du survol, de l'appui long et d'Échap | un drapeau de plus : aucun n'exclut les autres aujourd'hui |
| Brique de dessin | **terra-draw** (MIT, ~52 Ko gzip, versions figées, chargé à la demande), comme moteur ; l'interface reste celle d'Atlas. Introduite au lot 3 : un point n'en a pas besoin | Geoman (exige MapLibre ≥ 5.7.1, Atlas est en 5.6.1) ; mapbox-gl-draw (ni accrochage ni annulation) ; éditeur maison (semaines de travail) |
| Erreur d'écriture | la session ne bascule en lecture que sur un **refus de droits** (`isWriteAclError`) ; une colonne manquante ou un refus de structure donnent un message, la session reste en édition | basculer sur toute erreur, comme aujourd'hui |
| Couches non éditables | distantes, raster, copies en mémoire, scènes externes, fonds : l'outil est absent, avec la raison | — |

## Lots

Chaque lot est livrable seul, laisse l'existant intact, a ses tests purs dans
`lib/` et son contrôle en Grist réel.

**État au 26/09/2026** : lot 0 codé et testé (tests purs ; son contrôle en
Grist réel reste à faire) ; **lot 1 fait et contrôlé en Grist réel** dans le
document d'essai — une couche Point créée par la transaction et une couche
Ligne créée depuis l'interface : colonnes typées et libellées, une ligne
d'inventaire et une d'apparence chacune, les deux couches présentes au
rechargement, sans doublon ; collision détectée avant d'écrire
(`Arbres_remarquables_2`). Reste du lot 1 : le refus de structure, qui demande
un compte éditeur.

**Lot 2 (points) fait et contrôlé en Grist réel** le même jour : « Nouvel
objet » dans l'inspecteur de couche (et armé d'office après « Nouvelle
couche » de points), clic → fiche « Attributs » montée par le moteur en mode
création → **une** ligne (`nom`, `latitude`/`longitude` à 7 décimales, en
nombres) → la couche est relue et le nouvel objet s'ouvre, retrouvé par son
`_row_id`. Un second clic déplace le point sans perdre la saisie ; changer de
module ne l'efface pas ; « Abandonner », Échap ou ✕ n'écrivent rien (contrôlé :
toujours une ligne). Pas encore éprouvé : un obligatoire vide (le moteur le
bloque avant `addRow`, mais la couche d'essai n'a pas de formulaire avec
obligatoire). « Annuler la création » livré ensuite (voir plus bas). Pas
livré : la visée au réticule sur téléphone.

**Lot 3 (lignes et surfaces) fait et contrôlé en Grist réel** le même jour.
terra-draw 1.35.0 + adaptateur MapLibre 1.4.1, versions figées dans
l'importmap, chargés au premier tracé seulement. Contrôlé :

- ligne de 3 sommets dans « Voirie à reprendre » → `geometry_json`
  `LineString`, 7 décimales ; **le premier sommet s'est accroché exactement au
  point d'une autre couche** (5.3947456, 43.3049259) ;
- « Sommet précédent » retire le dernier sommet ; « Terminer », Entrée, un
  clic sur le dernier sommet **ou sur le premier** ferment la forme ;
- surface « Parcelles essai » (couche créée par « Nouvelle », tracé armé
  d'office) → anneau fermé, orienté antihoraire, relu après rechargement ;
- un sommet qui ferait se recouper le contour n'est pas posé, **et le dit** ;
- « Retracer » recommence la forme sans vider la fiche ; une fiche envoyée
  pendant qu'on retrace est refusée (« Tracez la forme avant d'enregistrer »),
  rien n'est écrit ;
- « Annuler la création » (tant que l'objet créé reste sélectionné) retire sa
  ligne : `Voirie_a_reprendre` revenue à 0 ;
- Échap abandonne : le tracé quitte la carte, rien n'est écrit.

Reste du lot 3 : accrochage angulaire, mesures au curseur, téléphone non
éprouvé (tolérances 22 px / 18 px posées, pas testées au doigt).

**Lot 4 (modifier la forme) fait et contrôlé en Grist réel** le même jour.
« Modifier la forme » dans la fiche d'un objet ; l'objet quitte la couche
pendant l'édition (il n'est dessiné que par l'éditeur), les cellules de
géométrie sont **relues dans Grist à l'ouverture**. Contrôlé :

- point (`Essai_forme_fields`, colonnes restées en texte) : déplacé par clic,
  **conflit détecté** quand la ligne a été modifiée dans Grist pendant
  l'édition (rien d'écrit, éditeur gardé ouvert), écrit une fois la ligne
  rétablie — seules `latitude`/`longitude` changent ;
- « Annuler la modification » rétablit **à l'octet près** les cellules
  d'origine (« 43.3049123 », et le `geometry_json` de la parcelle) ;
- surface : insertion d'un sommet au point milieu, « Annuler le geste »,
  réinsertion, enregistrement (4 sommets, anneau fermé, nom intact) ;
- enregistrer sans rien changer : « Forme inchangée — rien n'a été écrit ».

Non éprouvé dans le navigateur de test (il ne sait pas saisir un sommet à
quelques pixels près) : **glisser un sommet ou l'objet entier**, **retirer un
sommet au clic droit**. Ce sont les gestes natifs de terra-draw, configurés
(`draggable`, `midpoints`, `deletable`), à contrôler à la main.

Corrigé au passage : « Zoomer sur la couche » ne faisait rien quand la carte
était étroite (module et fiche ouverts) — la marge fixe de 80 px dépassait la
carte ; elle est désormais bornée (`margeCadrage`).

| Lot | Livre | Contrôle en Grist réel |
|---|---|---|
| **0 — Fondations** | `lib/geometrie-saisie.js` : une seule lecture (`lireGeometrie`), `normaliserGeometrie`, `validerGeometrie`, `cellulesGeometrie`. `featureToRowUpdate` écrit dans les colonnes réelles de la couche. `applySelected` écrit pour toute couche à lignes (P0) ; bascule en lecture sur refus de droits seulement. Réindexage après relecture et resélection par `_row_id` | non-régression : scènes de référence identiques ; une ligne sans coordonnées ne fait plus de point en (0,0) ; une saisie par le repli sur une couche entablée est relue après rechargement |
| **1 — Nouvelle couche** | `lib/nouvelle-couche.js` (nom de table libre, colonnes, paquet d'actions, lecture du retour) ; bouton dans le module Couches ; table vide acceptée au rechargement | colonnes typées et libellées dès la création ; couche vide présente au rechargement ; refus de structure nommé sans bascule en lecture |
| **2 — Créer un point** | état de carte exclusif ; session d'édition (panneau droit, barre d'outils) ; clic → fiche en mode création → un `AddRecord` ; annulation de l'ajout | une ligne, 7 décimales, attributs saisis ; obligatoire vide → rien d'écrit ; Annuler → zéro ligne |
| **3 — Lignes et surfaces** | terra-draw ; tracé, fin de forme, validation nommée, accrochage, mesures | `geometry_json` fermé, relu à l'identique ; tracé en huit refusé avec son motif |
| **4 — Modifier** | sommets (déplacer, insérer, retirer), déplacer l'objet, annuler, détection de conflit | seule `geometry_json` change ; Annuler rend la chaîne d'origine |
| **5 — Supprimer** | confirmation qui compte les relevés rattachés | message juste ; sort des `Ref` consigné |
| **6 — Tables qgis2grist** | `geometry_fields`, centroïdes recalculés dans la même action | table relisible par qgis2grist et QGIS |
| **7 — Terrain et application** | création hors édition sur réglage de couche ; point à ma position ; visée au réticule | lien `?mode=view` ; APK avec clé |
| **8 — Tracer un trajet** | l'outil Ligne alimente `poserTrajetDepuis` au lieu d'une table | la lecture du récit longe le tracé |

## Éprouvé en Grist réel (26/09/2026)

Document d'essai dédié : « Atlas — essai édition géométrique »
(`uK3GLaDK5RfMXm69t7E9Ni`, espace personnel, dossier Widgets), piloté par
GristCoder avec la clé de l'utilisateur.

| Question | Réponse mesurée | Conséquence |
|---|---|---|
| Forme des colonnes dans `AddTable` | la forme `{ id, fields: { type, label } }` est **ignorée sans erreur** : colonnes en `Text`, libellé = identifiant, nombres rangés en texte. Seule la forme **plate** `{ id, type, label }` s'applique | défaut latent dans **toutes** les tables qu'Atlas créait (`Atlas_LayerPrefs`, `Atlas_ScenePrefs`, `Atlas_Story`, `Maquette_Layers`, tables entablées) : corrigé, forme plate partout, test `tests/colonnes-addtable.test.js`. Les tables déjà créées gardent leurs colonnes texte, qu'Atlas lit déjà (`parseGristBool`, `Number`) |
| Types réels et zéro de tête | dans une colonne `Int`, « 01004 » devient 1004 | `inferGristType` ne type plus en nombre une chaîne qui ressemble à un nombre (`typeColonneDepuisValeurs`, `lib/schema-grist.js`) |
| `AddTable` crée-t-il une page ? | **oui**, une page au nom de la table (`retValues[i].views`) | empreinte à annoncer dans le dialogue de création |
| `retValues` par `POST /apply` | **présent** : `{ id, table_id, columns, views }` pour `AddTable`, l'identifiant pour `AddRecord` | la lecture du retour vaut pour le widget et pour l'application |
| Refus de structure | **le propriétaire ne peut pas être privé de structure** (règle `-S` sans effet sur lui, même conditionnée à `OWNER`) : le libellé exact demande un compte **éditeur** | reste à relever avec un second compte |
| Refus sur les données | « Blocked by table create access rules », « Blocked by table delete access rules » (403) ; reconnus par `isWriteAclError` | rien à changer |
| Colonne absente | « [Sandbox] KeyError 'colonne_absente' » (500), **non** reconnue comme refus de droits | conforme : message, la session reste en édition |
| `Ref` après `RemoveRecord` | la `Ref` passe à 0, la `RefList` perd l'identifiant, **le relevé reste** (orphelin) | lot 5 : la confirmation compte les relevés, qui survivent sans objet |
| Annulation Grist d'une action venue du widget | non éprouvable par l'API (l'annulation est propre à une session de l'interface) | à éprouver dans Chrome connecté |

## Coordination

`app_v7.js` et `published/atlas/` sont aussi touchés par d'autres sessions (la
1.9.0 a été promue pendant ce cadrage). Avant chaque lot : `git status` et
`git diff --stat` sur `projects/Atlas`, et rien dans `published/` sans demande
explicite.
