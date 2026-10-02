# Une tournée par contexte — étude d'usage et d'affichage

Étude écrite le 03/10/2026, avant tout code. Elle répond à : « un itinéraire par contexte » — que fait l'éditeur, que voit et
manipule l'exploitant, et comment les deux restent clairs. Elle prolonge `usage.releves` (relevés proposés par contexte).

## 1. Le constat

Aujourd'hui une scène a **un seul trajet** (une ligne), posé sur le **récit** : chaque étape reçoit une copie de la ligne et une
position dessus (`abscisse`), puis le récit est retrié selon cette position. Les contextes sont des étapes : ils subissent la
même ligne et le même tri. Aucun contexte ne peut avoir son parcours.

Le trajet du récit sert une **visite guidée** : on lit des étapes le long d'une ligne, la caméra les suit, le GPS fait avancer
l'étape, une alerte s'allume près d'une saisie. Un contexte sert un **travail** : on règle la carte, on choisit des ouvrages, on
saisit. Ce n'est pas la même chose, et c'est pourquoi la ligne d'un contexte ne doit ni placer ni trier quoi que ce soit.

## 2. Principe

Une **tournée** est la ligne de travail d'un contexte. Elle s'affiche quand le contexte est actif, disparaît avec lui, et donne
un **ordre** aux ouvrages qu'elle longe. Elle ne touche pas au trajet du récit, qui reste réservé à la visite guidée.

Vocabulaire (à trancher, voir §8) : *trajet* = la visite guidée du récit, *tournée* = la ligne d'un contexte. « Itinéraire » est
déjà pris deux fois (outil « Itinéraire sur un réseau », bouton « Itinéraire » de la bulle qui ouvre un guidage externe).

## 3. Ce que fait l'éditeur (Préparer)

Où : module **Récit**, sur la carte du contexte, sous « Relevés proposés ». Rien dans les autres modules.

| État de la carte | Ce qui s'affiche | Gestes |
|---|---|---|
| Pas de tournée | « Tournée » + un bouton **Choisir une ligne** et un bouton **Tracer sur le réseau** | Les deux outils existants (`choisirTrajet`, itinéraire sur un réseau), visés vers ce contexte |
| Tournée posée | « Tournée · 3,2 km · Boucle Pic Bertagne » ; « Ouvrages à moins de [ 50 ] m » (phase 2) | **Remplacer**, **Retirer**, régler le rayon |
| Contexte non proposé | rien (comme « Relevés proposés ») | — |

Ce que l'éditeur **voit sur la carte** : la ligne de la carte qu'il touche (ou la dernière touchée), en tirets, avec le nom du
contexte en étiquette. Pas toutes les lignes à la fois : ce serait illisible dès deux contextes.

Ce qui doit être **clair d'un coup d'œil** :
- La carte résume en une ligne ce que le contexte règle : « Couches : 2 · Relevés : Table_structure · Tournée : 3,2 km ».
- « Créer un trajet » (récit) et « Tournée » (contexte) ne se confondent pas : le premier est en haut du module, sous « Capturer
  l'étape », le second dans chaque contexte. Une phrase dans le « i » du premier : « Pour une visite guidée. Pour une ligne de
  travail, voir la tournée d'un contexte. »
- Poser un trajet global **n'attrape plus** les contextes (ils n'ont ni `abscisse` ni copie de ligne, et ne sont plus retriés).
  Les scènes déjà faites gardent ce qu'elles ont.
- La ligne est une **copie figée** (comme le trajet), avec `sourceTable` et `sourceRowId` conservés : « Remplacer » la reprend,
  et on pourra un jour proposer « Actualiser depuis la couche » sans changer le modèle.

## 4. Ce que voit et fait l'exploitant (Exploiter, Lecture)

Il n'a **aucun réglage**. Il choisit un contexte dans la pastille « Contexte », comme aujourd'hui, et :

1. **La ligne apparaît**, épaisse, avec un liseré clair, une flèche de sens à la fin. Elle disparaît avec « Scène de base ». La
   caméra est celle que l'éditeur a captée ; si le contexte n'en a pas, on cadre la ligne.
2. **La carte du contexte dans le panneau** (pas de nouvelle pastille : le dock est déjà chargé) gagne un bloc « Tournée · 3,2 km ·
   12 ouvrages » qu'on déplie en liste **dans l'ordre le long de la ligne** : nom, pastille d'état (couleur de la symbologie),
   « dernière visite il y a 3 mois », distance depuis le départ. Toucher une ligne ouvre l'objet comme partout
   (`ouvrirObjet` : bulle, fiche ou saisie selon la posture).
3. **◀ ▶ de la barre de sélection suivent la tournée** : l'ordre est celui de la ligne, et seuls comptent les ouvrages à moins
   de N m. Le compteur dit « 4 / 12 ». C'est la revue d'aujourd'hui, avec un autre ordre et un autre périmètre.
4. **« Le plus proche de moi »** (pastille Relevé) reste inchangé mais ne propose que des ouvrages de la tournée.
5. **Lecture** : même affichage, aucun bouton d'écriture ; la liste et la ligne servent à se repérer.

Hors de la ligne : **la carte montre toujours tous les objets** que le contexte laisse voir. Le rayon limite la **liste**, la
**revue** et **« le plus proche »**, pas la carte. Masquer les objets hors tournée enlèverait à l'agent ce qui l'entoure, et le
rayon deviendrait un filtre invisible à expliquer.

Cas à ne pas oublier :
- Pas de GPS : la liste et la revue marchent, partant du début de la ligne ; « le plus proche » part du centre de la carte
  (`positionDeReference`, déjà le cas).
- Aucun ouvrage dans le rayon : « Aucun ouvrage à moins de 50 m de la tournée » et le bouton pour voir tous les ouvrages.
- Ligne sans couche d'ouvrages visible : le bloc s'affiche sans liste, avec la longueur seule.
- Téléphone : le bloc vit dans le panneau du contexte (feuille du bas), la liste défile dans le panneau, jamais dans la carte.

## 5. Phase 3 — suivre la tournée sur le terrain

À regarder après les deux premières, pas avant : avec la position GPS, « à 120 m du prochain ouvrage » dans la pastille Relevé
(l'alerte du trajet, `evaluerAlerte`, fait déjà cela pour les saisies d'un trajet) ; un « fait aujourd'hui » **dérivé** — si
Table_visites contient une visite du jour pour l'ouvrage (le lien et la date existent dans la bulle) — sans rien stocker de plus.

## 6. Modèle

Dans le bloc `usage` de l'étape, à côté de `releves` :

```
usage: {
  contexte: true,
  releves: ['Table_structure'],        // existant
  tournee: {
    trace: { type: 'LineString', coordinates: [...], sourceTable, sourceRowId, nom },
    rayonM: 50                          // null = pas de limite, la liste prend tout ce que la ligne longe
  }
}
```

Une seule ligne par contexte, un seul rayon par contexte. `usageDe` ne change pas ; `relevesDe` a un jumeau `tourneeDe`.

## 7. Ce qu'on réutilise, ce qu'on écrit

Réutilisé : la source d'affichage `atlas-trajet`, `longueurMetres`, `projeter`, `pointAAbscisse`, `distanceMetres`,
`placeDepuisVue`, les deux outils de pose, `ouvrirObjet` et `decisionOuverture`, la barre de sélection, `positionDeReference`.

À écrire : le choix de la ligne visé vers un contexte (au lieu de la scène) ; l'affichage lié au contexte actif ; un module pur
`lib/tournee.js` (ouvrages le long d'une ligne, ordre, distance depuis le départ, rayon) avec ses tests ; le bloc du panneau
« Contexte » ; l'ordre de `nav` quand une tournée est active ; l'exclusion des contextes du placement du trajet global.

## 8. Phases et décisions

1. **La ligne appartient au contexte** : pose, affichage, exclusion du trajet global, résumé sur la carte de l'étape.
2. **Les ouvrages le long de la tournée** : `lib/tournee.js`, liste dans le panneau, revue ◀ ▶ dans l'ordre, « le plus proche ».
3. **Sur le terrain** : alerte d'approche, « fait aujourd'hui » dérivé.

À trancher avant la phase 1 :
- **Le mot** : « tournée » (proposé) ou « itinéraire » ?
- **Ligne figée ou liée à la couche** : figée (proposé, comme le trajet) ; liée demande de relire la couche à chaque ouverture.
- **Le rayon masque-t-il la carte ?** Non (proposé) : il limite la liste, la revue et « le plus proche ».
- **Un rayon par contexte** (proposé) ou par couche ?
- **Cadrage** : la caméra captée par l'éditeur l'emporte (proposé) ; sinon la ligne est cadrée.
