# Registre des saisies — types dérivés, gabarits, gestes

**Date** : 2026-10-04
**Statut** : cadrage validé (modèle, trois décisions, maquette) — implémentation à faire
**Repo** : Widgets Grist (`projects/grist_forms/`)
**Amende** : `2026-09-19-grist-forms-composants-binding.md` (§3.4, la géométrie) et complète `2026-07-26-grist-forms-builder-design.md` §4.3
**Pages de référence** : `projects/grist_forms/docs/matrice-types.html`, `docs/maquette-intervalle.html`

---

## 1. Le modèle

Grist pose le plancher : onze types qui rangent une valeur, et quelques éditeurs.
Au-dessus, **trois choses se décident séparément** — les confondre est ce qui a
produit tous les cas particuliers :

| | Ce que ça fixe |
|---|---|
| **La forme de la question** | ce qu'on demande : un choix, une échelle, un classement, une répétition |
| **Le geste** | comment la valeur arrive : au clavier, dans une liste, sur la carte, par l'appareil |
| **Le gabarit** | les colonnes Grist natives où elle se range — une, ou plusieurs |

Un **type dérivé** est la réunion des trois sous un nom : `intervalle`, `échelle`,
`géométrie`. Il déclare son gabarit, son contrôle, ses gestes, et sa lecture dans
les deux sens.

Une **matrice** n'est pas un type : c'est une mise en page de plusieurs échelles
qui partagent leur domaine. La disposition est un quatrième axe, indépendant.

---

## 2. Les trois règles

| # | Règle | Ce qu'elle interdit |
|---|---|---|
| R1 | **Rien d'illisible sans le formulaire.** Si Grist sait porter la donnée nativement, on l'y met. | un intervalle en JSON dans un champ texte, qui ne se trie ni ne se calcule plus |
| R2 | **Un dérivé se mérite** : il supprime un câblage à la main déjà vu deux fois, ou empêche une erreur de donnée constatée. | un registre qui devient un zoo d'options déguisées en types |
| R3 | **Le moteur ne possède pas la surface** : ni carte, ni caméra, ni éditeur. Il demande, l'hôte produit. | un second moteur cartographique embarqué, et des boutons qui ne marchent pas |

---

## 3. Les décisions prises (04/10/2026)

| # | Question | Décision |
|---|---|---|
| D1 | Les conditions voient le gabarit ou le dérivé ? | **Les colonnes du gabarit.** C'est ce que Grist détient ; un langage de chemins coûterait plus qu'il ne rapporte. |
| D2 | Qui nomme les colonnes d'un gabarit ? | **Dérivé du libellé, repris à la main.** `Sejour_debut`, `Sejour_fin` à la création ; sur une table existante, on pointe des colonnes qui existent. |
| D3 | Une répétition se rend intégrée ou en onglet ? | **Les deux, un seul contrat.** C'est la disposition qui change, pas le type. |
| D4 | La géométrie est-elle un champ ? | **Non — amende la spec du 19/09.** Elle sort du formulaire et revient à la carte : le formulaire porte le champ et le format, l'hôte porte le geste. Convention d'Atlas retenue : `latitude`+`longitude` pour un point, `geometry_json` pour une forme. |

---

## 4. Ce que Grist fait vraiment (mesuré, pas déduit)

Mesures reproduites sur les deux instances (Grist 1.7.18 public, grist.numerique).

| Fait | Conséquence sur le registre |
|---|---|
| Colonne numérique omise → **0** ; `null` explicite → vide. `AVERAGE` ignore le vide, compte les zéros | une réponse masquée ou non posée s'écrit `null` **explicitement** |
| Une colonne `Bool` **ne peut pas être vide** | un oui/non dont l'absence a un sens se range en `Choice` |
| L'ordre d'une `ChoiceList` **est conservé** | un classement tient dans une seule colonne |
| Un lot d'actions est **atomique** | une table et sa colonne inverse partent ensemble |
| Une ligne créée dans un lot **n'y est pas désignable** | le parent s'écrit avant ses enfants, en deux envois |
| Cinq lignes groupées : **25 à 105 ms** ; une par une : **187 à 535 ms** | une répétition écrit en une action |
| Sans colonne inverse, un rattachement vers une ligne inexistante est **accepté** ; avec elle, **refusé** | `AddReverseColumn` est posée systématiquement |
| Refus de données : `Blocked by table update / create access rules` | les deux cas se nomment séparément |
| Une règle de table **ne ferme pas la structure** | créer la table liée et y écrire sont deux droits |

---

## 5. Le registre

Quatorze saisies. « Gabarit » = les colonnes Grist ; « geste » = ce que l'hôte
fournit.

| Saisie | Gabarit | Geste | État |
|---|---|---|---|
| Échelle | `Int` bornée | — | partiel (échelle figée, sans ancrages ni « non concerné ») |
| Choix avec « autre » | `Choice`/`ChoiceList` + `Text` | — | à faire |
| Cases plafonnées | `ChoiceList` | — | à faire |
| Classement | `ChoiceList` ordonnée, ou N × `Choice` | — | à faire |
| Intervalle | 2 × `Date` ou `DateTime` | aujourd'hui | à faire — **premier lot** |
| Durée | `Int` secondes | chronomètre | à faire |
| Répétition | table liée par `Ref` | — | module posé (`liens-table.js`), rendu à faire |
| Photo | `Attachments` | appareil photo | livré |
| Enregistrement vocal | `Attachments` (+ `Int` durée) | micro | à faire |
| Géométrie — point | 2 × `Numeric` | carte, ma position, centre de l'objet | hors moteur (Atlas) |
| Géométrie — forme | `Text` GeoJSON | tracer, forme de l'objet | hors moteur (Atlas) |
| Objet désigné sur la carte | `Ref:Table` | carte, le plus proche | hors moteur (Atlas) |
| Étiquette scannée | `Ref:Table` ou `Text` | code | candidat |
| Signature, croquis | `Attachments` | canevas | candidat |

Un même dérivé peut offrir **deux gabarits** (le classement) : on tranche au
moment de brancher le formulaire sur la table.

---

## 6. Le contrat

### 6.1 Un champ dérivé

```jsonc
{
  "colId": "Periode_du_sejour",   // le nom de la question, pas d'une colonne
  "label": "Période du séjour",
  "kind": "intervalle",           // le type dérivé — absent = champ simple
  "type": "Date",                 // ce que Grist range
  "widget": "intervalle",
  "required": true,
  "options": {
    "colonnes": { "debut": "Periode_du_sejour_debut", "fin": "Periode_du_sejour_fin" },
    "saisies": ["aujourdhui"]
  }
}
```

- `kind` est **facultatif** : son absence décrit le champ d'aujourd'hui.
- Les colonnes du gabarit vivent dans `options.colonnes` (D2).
- Les conditions portent sur ces colonnes (D1), et le moteur garde leurs valeurs
  séparément.
- `options.saisies` liste les gestes proposés ; l'hôte filtre.

### 6.2 Le protocole des gestes

Trois verbes, portés par le pont :

| Verbe | Rôle |
|---|---|
| `capacites()` | ce que l'hôte sait faire (`photo`, `audio`, `position`, `geometrie.point`, `geometrie.trace`, `objet.carte`, `code`) |
| `saisir(geste, champ, valeur)` | « donne-moi une valeur de cette nature » ; rend la valeur, ou rien si on annule |
| `televerser(fichier)` | existe déjà (`bridge.uploadFile`) |

Règles : un geste non déclaré ne s'affiche pas ; on n'interroge pas les
autorisations au chargement, on tente au moment du geste et on nomme le refus ;
la capture par fichier est le socle, le natif la remplace quand il existe.

### 6.3 Dégradation

Un lecteur qui ignore un `kind` rend le champ par son `type` et son `widget`, et
voit les colonnes du gabarit. Il rend une question incomplète, **jamais une
erreur**. C'est la condition pour qu'une copie figée du moteur, embarquée
ailleurs, ne casse pas.

---

## 7. Les lots

| Lot | Contenu | Pourquoi dans cet ordre |
|---|---|---|
| **1** | Le registre, et l'**intervalle** de bout en bout | le gabarit à plusieurs colonnes est la seule mécanique vraiment neuve ; elle casserait tard |
| **2** | Le **panneau d'une question se génère depuis le registre** | sinon chaque type suivant coûte un bloc de code dans `builder.html` |
| **3** | **Audio** | aucun gabarit neuf, mais toute la chaîne des gestes |
| **4** | **Échelle** complète, **cases plafonnées**, **choix avec « autre »** | les trois besoins criants de l'enquête du 4ᵉ |
| **5** | **Répétition** rendue par le moteur | s'appuie sur `liens-table.js`, déjà posé |
| **6** | **Classement**, puis les **géométries** portées au contrat | |

Chaque saisie est finie quand elle sait : créer ses colonnes, se reconnaître sur
une table existante, se rendre, s'écrire, se relire, se projeter en Survey
Manifest, se dégrader — avec ses tests et une vérification en Grist réel.

---

## 8. Les épreuves

1. **L'enquête du 4ᵉ se décrit entièrement en FormDef** et se rend par le moteur,
   avec les règles de qualité établies (`null` et non 0, « non concerné »
   distinct de « non posé », réponses masquées non écrites).
2. **Le panneau d'une question du builder est rendu par le moteur**, et le
   FormDef qui le décrit est validé par `formdef.schema.json` dans les tests.
   Mesure : les lignes retirées de `builder.html`.

---

## 9. Ce qui reste ouvert

- La projection d'un intervalle en Survey Manifest : deux questions de date, ou
  un type à ajouter.
- L'intervalle borné d'un seul côté.
- La file d'attente hors ligne : le moteur résout les pièces jointes **avant**
  d'écrire la ligne.
- Le refus de structure par règle d'accès, non reproductible en tant que
  propriétaire.
- La direction visuelle d'ensemble, au-delà de l'allure reprise de l'enquêteur.
- **La publication** : la vue publiée en ligne écrase encore des lignes chez ceux
  qui l'utilisent. Les correctifs attendent sur `grist-forms-liens`.
