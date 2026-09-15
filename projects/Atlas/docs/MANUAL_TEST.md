# Atlas v7 — Validation binding (offre Cerema)

Interop **qgis2grist → Scene Manifest → Atlas** (style + contrôles + récit).

| Environnement | URL |
|---------------|-----|
| **Publié** | `https://nic01asfr.github.io/Widgets-Grist/atlas/` |
| Dev local | `http://localhost:8766/Atlas/index_v7.html?v=20260730o` |
| Lecture forcée | même URL + `&mode=view` |

**Jeu de données :** doc Grist importé depuis `qfield_bees.zip` (Bee Farming)

---

## 1. Chargement Scene Manifest

- [ ] Ouvrir Atlas sur le doc Grist qgis2grist
- [ ] Toast : `qgis2grist · N couche(s) · M visible(s)`
- [ ] Couches métier visibles (Apiary, Fields…), fond (buildings) masqué par défaut
- [ ] Console sans erreur module ES

## 2. StyleDeclarative (symbolisation)

| Couche | Test | Attendu |
|--------|------|---------|
| **Apiary** | Clic couche → inspecteur **ouvert** | Panneau Symboliser visible (pas de pastille carte) |
| **Apiary** | Mode Catégorisé, champ espèce | Couleurs + légende OK |
| **Toute couche** | Modifier couleur → Enregistrer | Prefs Atlas ; reload → style conservé |
| **Inspecteur** | Bouton ✕ | Panneau fermé ; reclic couche → rouvert |

## 3. ControlDeclarative (module Contrôles)

- [ ] Ouvrir **Contrôles**, sélectionner une couche
- [ ] Filtres pré-configurés (import qgis2grist, inactive par défaut)
- [ ] Activer filtre → objets filtrés sur carte
- [ ] **Enregistrer** → prefs `Atlas_LayerPrefs` (`controls` + `declarative`)

## 4. Soleil / overlays carte

- [ ] Dock soleil à gauche de la boussole (gap 12px), hauteur 54px, sans scroll
- [ ] Repli → pastille soleil ; réouverture OK
- [ ] Arc / heure / ombres fonctionnels

## 5. Récit (storymap)

- [ ] Capturer ≥2 étapes (caméra + filtres + symbo)
- [ ] Lecture ▶ : état rejoué
- [ ] Reload → `Atlas_Story` persisté

## 6. Export / interop

- [ ] Projet JSON version `2.2-atlas-binding` avec `storyManifest`, `declarative`, `controls`
- [ ] Recharger le JSON → état identique

## 7. Mode lecture (`?mode=view` ou droits read-only)

- [ ] Badge **Lecture** visible dans le header
- [ ] Doc **public viewer** (non authentifié) : même chrome lecture **sans** `?mode=view` (sonde écriture au boot)
- [ ] Scene Manifest charge ; console sans erreur AddTable / prefs
- [ ] Toggle couche / filtre local OK ; **pas** d’écriture `Atlas_LayerPrefs` après reload (prefs inchangées)
- [ ] Capture récit / Enregistrer objets → toast « Mode lecture — … indisponible »
- [ ] Clic légende (couche ou catégorie) → zoom / ciblage ; pas d’onglet Couches
- [ ] Onglet / rail Récit visible seulement si `Atlas_Story` non vide
- [ ] Clic objet → **popup MapLibre** (attributs ou `popup_template` si présent) — **pas** d’inspecteur Géométrie / barre sélection
- [ ] Clic fond carte ferme la popup
- [ ] Export JSON / GeoJSON toujours possible (download local)
- [ ] Sans `?mode=view`, auteur `full` : édition prefs inchangée

## 8. Mobile lecture (DevTools 390px ou téléphone)

- [ ] Pas de bottom nav ; FAB **▶ Récit** si étapes ; légende cliquable
- [ ] Loupe header (cmdk) ouvre la recherche
- [ ] Pas de HUD coords/zoom/pitch ; pas Exporter / dirty dans le header
- [ ] Contrôles publiés : panneau repliable (replié par défaut sur mobile)
- [ ] Clic objet → popup (pas bottom-sheet inspecteur)
- [ ] Contrôle géolocalisation MapLibre utilisable
- [ ] `?no3d=1` : pas de rebuild Models3D lourd

## 9. Gestes — souris, doigt, stylet

Atlas passe partout par les **Pointer Events** : un seul chemin de code pour les
trois matériels. Les points ci-dessous se vérifient à la souris, mais seuls un
écran tactile ou l'émulation tactile de DevTools montrent le comportement du
doigt — les tests unitaires n'en voient rien.

### Ordre des couches (panneau Couches)

- [ ] Poignée ⠿ : glisser une couche → repère d'insertion, dépôt, carte repeinte
- [ ] L'ordre survit au rechargement (rangs enregistrés dans `Atlas_LayerPrefs`)
- [ ] Liste plus haute que le panneau : glisser vers le bord **fait défiler**
- [ ] Poignée au clavier (Tab puis ↑ ↓) : même déplacement
- [ ] Au doigt, le glissement sur la poignée ne fait pas défiler la page

### Arc solaire (dock carte)

- [ ] Poser puis glisser sur l'arc règle l'heure ; relâcher arrête le suivi
- [ ] Au doigt, le geste ne déplace ni ne zoome la carte (`touch-action: none`)

### Sélection rectangulaire (mode édition d'objets)

- [ ] Souris : **Maj + glisser** trace le rectangle et sélectionne
- [ ] Doigt : un glissement simple **déplace la carte** (comportement inchangé)
- [ ] Doigt : **appui long immobile (~0,5 s)** → vibration + toast, puis le
      glissement trace le rectangle
- [ ] Doigt : appui long puis relâchement sans bouger → rien de sélectionné
- [ ] Deux doigts (zoom) pendant l'appui long → pas de rectangle
- [ ] Après un rectangle, la sélection n'est pas vidée par le clic de fin de geste

---

## Critères d’acceptation

1. Scene Manifest → style + controls appliqués
2. Édition Atlas → `Atlas_LayerPrefs`
3. Récit capture / rejoue symbo + contrôles + caméra
4. Clic couche = inspecteur ouvert ; ✕ = fermeture (pas de FAB carte)
5. Mode lecture : clic → popup (pas inspecteur) ; pas d’écriture Grist ; badge visible
6. Mobile ≤720px : bottom nav + carte consultable

---

## Parcours de référence (à rejouer avant chaque publication)

Chaque parcours est joué dans Chrome ; ceux marqués **Grist** exigent un
document réel (`nrRTKiyiz1suJ3NF1QcbqK` ou un document vide de l'espace
*Widgets*). Un parcours qui échoue bloque la publication.

| # | Configuration | Ce qu'on joue | Ce qu'on attend |
|---|---|---|---|
| A | page seule (`index_v7.html`) | « Continuer sans se connecter », charger un projet | édition, aucun dock vide, Formulaires dit « Hors Grist » |
| B | `?navbar=false` seule | même chose | barre absente, Enregistrer/Exporter absents |
| C | `?scene=` (Aygalades) | jouer les 8 étapes | 0 erreur console, sujet de chaque étape visible au-dessus de la bulle, légende à gauche, attribution lisible |
| D | `?navbar=false&scene=` | fermer le récit | pastille « Lire le récit » dans le dock ; clic → étape 1 |
| E | mobile 390 px, `?scene=` | ouvrir le récit, toucher « Légende » | légende repliée sur la bulle, s'ouvre vers le haut ; pastille localisation contre la boussole |
| F | page publiée (`published/atlas/`) | ouvrir la démo | tout charge sans `../grist_forms/` |
| G | **Grist**, édition, document vide | OSM → « Enregistrer en table Grist » → Formulaires → clic objet → saisir → recharger | table `Atlas_<nom>` sans accent perdu, fiche « Attributs » (colonnes d'Atlas masquées), saisie écrite en un clic, couche et fiche revenues |
| H | **Grist**, `?mode=view` | clic sur un objet ; carte étroite | badge Lecture, aucun panneau d'édition, popup ou fiche si exposée, pas de rectangle de dock vide |
| I | **Grist**, largeur 824 px, panneau ouvert | clic sur une couche | panneau de droite entier dans la fenêtre, bandeau d'infos réduit puis masqué |

Cette liste a été établie le 15/09/2026, après qu'un parcours simple (G) a
révélé quatre défauts que ni les tests ni les revues de code n'avaient vus.
