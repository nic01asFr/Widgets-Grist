# Une tournée par contexte — étude d'usage et d'affichage

Étude écrite le 03/10/2026, mise à jour le même jour avec les décisions de l'auteur. Aucun code. Elle répond à : que fait l'éditeur,
que voit et manipule l'exploitant, et comment les deux restent clairs. Elle prolonge `usage.releves` (relevés proposés par contexte).

**Priorité : l'exploitant.** L'éditeur pose peu de choses ; c'est l'usage sur le terrain qui décide de ce qu'on construit d'abord.

## 1. Le constat

Aujourd'hui une scène a **un seul trajet** (une ligne), posé sur le **récit** : chaque étape reçoit une copie de la ligne et une
position dessus (`abscisse`), puis le récit est retrié selon cette position. Les contextes sont des étapes : ils subissent la même
ligne et le même tri. Aucun contexte ne peut avoir son parcours.

Le trajet du récit sert une **visite guidée** (des étapes lues le long d'une ligne). Un contexte sert un **travail** : on règle la
carte, on parcourt des ouvrages, on saisit. La ligne d'un contexte ne doit ni placer ni trier d'étapes.

## 2. Vocabulaire (décidé)

- **Trajet** : la visite guidée du récit. Inchangé.
- **Tournée** : la ligne de travail d'un contexte.
- **Itinéraire** : l'**action** de basculer vers le GPS (le bouton de la bulle, et « Itinéraire vers le prochain ouvrage » dans la
  tournée). Le mot ne désigne plus rien d'autre : l'outil actuel « Itinéraire sur un réseau » devient **« Tracer sur un réseau »**.

## 3. Définir une tournée (décidé)

Comme on définit un trajet, par les mêmes deux gestes, visés vers un contexte :
1. **Choisir une ligne** dans une couche existante — dans GP2OA, une **boucle** (couche Boucles) ; ailleurs, n'importe quelle couche
   de lignes. Une trace GPX importée est une couche : elle se choisit de la même façon.
2. **Tracer sur un réseau** : départ, points de passage, arrivée ; le chemin suit le réseau.

La ligne est une **copie figée** (comme le trajet), avec `sourceTable` et `sourceRowId` conservés : « Remplacer » la reprend, et un
« Actualiser depuis la couche » pourra venir sans changer le modèle.

## 4. Pas de rayon (décidé)

La tournée est **incluse dans son contexte** : les ouvrages qu'elle parcourt sont ceux que **le contexte laisse voir** (couches
visibles, filtres actifs). La ligne apporte trois choses — un tracé, un **ordre** (la position de chaque ouvrage projetée sur la
ligne) et une **distance** — pas un périmètre. Aucun réglage de rayon dans la tournée.

Un rayon n'aurait de sens que pour dire « les ouvrages de cette boucle » quand aucune colonne ne relie un ouvrage à sa boucle, ce
qui est le cas de GP2OA. Si le besoin se confirme, ce sera un **filtre « à proximité de la tournée »** parmi les filtres du contexte
(optionnel, désactivé par défaut), jamais un réglage de la tournée. Un ouvrage très éloigné de la ligne passe en fin de liste, avec
sa distance.

## 5. Ce que voit et fait l'exploitant (Exploiter, Lecture)

Il n'a **aucun réglage**. Il choisit un contexte dans la pastille « Contexte », comme aujourd'hui, et :

1. **La ligne apparaît** (épaisse, liseré clair, flèche de sens) ; elle disparaît avec « Scène de base ».
2. **Le panneau du contexte** gagne un bloc « Tournée · 3,2 km · 12 ouvrages » qu'on déplie en liste **dans l'ordre le long de la
   ligne** : nom, pastille d'état, « dernière visite il y a 3 mois », distance depuis le départ. Toucher une ligne ouvre l'objet
   (`ouvrirObjet` : bulle, fiche ou saisie selon la posture). Pas de nouvelle pastille.
3. **Les ◀ ▶ de la barre de sélection suivent la tournée** : ordre de la ligne, compteur « 4 / 12 », ouvrages que le contexte laisse voir.
4. **Lecture** : même affichage, aucun bouton d'écriture.

### Suivre sa position, comme une application de guidage

Trois états de la caméra, un seul bouton pour en changer :

| État | La caméra | Comment on y entre / en sort |
|---|---|---|
| **Suivi** | reste sur ma position (nord en haut ; cap suivi en option) | bouton « Suivre ma position » ; ou « Revenir à ma position » |
| **Libre** | ne bouge plus : j'ai déplacé la carte | un glissement ou un zoom met le suivi en pause, le bouton « Revenir à ma position » apparaît |
| **Pointé** | va sur l'ouvrage que j'ai touché ou choisi dans la liste ; le suivi est en pause | « Revenir à ma position » reprend le suivi |

Ce comportement existe déjà pour le trajet du récit (`suivreTrajet`, `pauserSuiviTrajet`, `revenirTrajet`, le contrôle de
géolocalisation de MapLibre en mode suivi) : on le **réutilise**, il ne s'invente pas.

Pendant le suivi, un bandeau compact en bas de la carte (jamais dans le dock, déjà chargé) dit : « **Prochain : Buse Carafa · 120 m** »,
avec trois gestes — **Ouvrir** (bulle ou fiche), **Itinéraire** (bascule vers le GPS du téléphone, vers cet ouvrage) et **Passer**.
Il dit aussi l'avancement : « 4 sur 12 · 1,3 km restants ». Si l'on s'éloigne de la ligne, une mention discrète « hors tournée, 80 m »
(écart fixe, pas un réglage).

Cas à ne pas oublier :
- Pas de GPS : la liste et la revue marchent depuis le départ de la ligne ; « le plus proche » part du centre de la carte
  (`positionDeReference`, déjà le cas) ; le bouton « Suivre ma position » dit pourquoi il est grisé.
- Contexte sans ouvrage visible : « Aucun ouvrage affiché par ce contexte » (le filtre les masque tous), avec la ligne seule.
- Téléphone : le bloc vit dans le panneau du contexte (feuille du bas), la liste défile dans le panneau, jamais dans la carte.

## 6. Ce que fait l'éditeur (Préparer)

Où : module **Récit**, sur la carte du contexte, sous « Relevés proposés ». Rien dans les autres modules.

| État de la carte | Ce qui s'affiche | Gestes |
|---|---|---|
| Pas de tournée | « Tournée » + **Choisir une ligne** et **Tracer sur un réseau** | les deux outils existants, visés vers ce contexte |
| Tournée posée | « Tournée · 3,2 km · Boucle Pic Bertagne » | **Remplacer**, **Retirer** |
| Contexte non proposé | rien | — |

Sur la carte, l'éditeur voit la ligne du contexte qu'il touche (en tirets, avec le nom du contexte) ; pas toutes à la fois.
La carte résume ce que le contexte règle : « Couches : 2 · Relevés : Table_structure · Tournée : 3,2 km ».
Poser un trajet global **n'attrape plus** les contextes (ni `abscisse`, ni copie de ligne, ni tri) ; les scènes déjà faites gardent
ce qu'elles ont. Le « i » de « Créer un trajet » dit : « Pour une visite guidée. Pour une ligne de travail, voir la tournée d'un contexte. »

## 7. Modèle

Dans le bloc `usage` de l'étape, à côté de `releves` :

```
usage: {
  contexte: true,
  releves: ['Table_structure'],        // existant
  tournee: { trace: { type: 'LineString', coordinates: [...], sourceTable, sourceRowId, nom } }
}
```

Une seule ligne par contexte, aucun autre réglage. `usageDe` ne change pas ; `relevesDe` a un jumeau `tourneeDe`.

## 8. Réutilisé, à écrire

Réutilisé : la source d'affichage `atlas-trajet`, `longueurMetres`, `projeter`, `pointAAbscisse`, `distanceMetres`, les deux outils
de pose, le suivi GPS du trajet, `ouvrirObjet`, la barre de sélection, `positionDeReference`, le bouton « Itinéraire » de la bulle.

À écrire : le choix de la ligne visé vers un contexte ; l'affichage lié au contexte actif ; `lib/tournee.js` (ordre et distance des
ouvrages le long d'une ligne, ouvrages à venir, avancement) avec ses tests ; le bloc du panneau « Contexte » ; le bandeau de suivi ;
l'ordre de `nav` ; l'exclusion des contextes du placement du trajet global.

## 9. Phases (l'exploitant d'abord)

1. **La ligne et l'ordre** : la tournée se pose (édition minimale : deux gestes, remplacer, retirer), s'affiche avec son contexte, le
   panneau liste les ouvrages dans l'ordre, ◀ ▶ suivent l'ordre. C'est déjà utilisable sans GPS.
2. **Suivre sa position** : les trois états de la caméra, le bandeau « Prochain », l'avancement, « Itinéraire » vers l'ouvrage.
3. **Après usage** : « fait aujourd'hui » déduit de Table_visites (le lien et la date existent dans la bulle), sans rien stocker ;
   filtre « à proximité de la tournée » si le besoin se confirme ; « Actualiser depuis la couche ».

Reste à trancher : le suivi tourne-t-il la carte avec le cap, ou garde-t-il le nord en haut ? Proposé : nord en haut par défaut, le
cap en option (une carte qui tourne désoriente quand on lit des noms).
