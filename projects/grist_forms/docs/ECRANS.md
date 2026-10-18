# Toutes les tailles d'écran

**Règle** : chaque saisie et chaque composant fonctionne de 320 px de large à un grand écran. Pas de défilement horizontal de la page, pas de contenu coupé, et toute cible tactile fait au moins 44 px.

## Ce qui est garanti

- **Aucun élément ne décide de la largeur de la page.** Une largeur en pixels posée par un composant (le canevas de dessin la pose pour suivre son cadre) ne doit pas entrer dans le calcul de taille de ses parents : le composant est sorti du flux, son cadre a déjà sa taille.
- **Un texte réservé aux lecteurs d'écran** (`fr-rangs__lu`) est positionné en absolu : son cadre doit être positionné aussi, sinon un cadre défilant ne le retient pas et la page s'élargit.
- **Cible tactile ≥ 44 px** : cases et boutons radio (toute la cellule se vise), boutons, champ de fichier natif (hauteur et bouton de sélection), pastilles de couleur du dessin (le rond reste petit, la zone sensible déborde).
- **La grille de classement** se resserre sous 30 rem (intitulé 6,5 rem, case 3,25 rem). Au-delà de trois rangs, son cadre défile à l'intérieur de lui-même.

`tests/responsive.test.js` garde ces protections écrites. Il ne mesure pas une page.

## Mesurer, à chaque nouvelle saisie

Un test ne remplace pas l'écran. Pour une saisie ou un composant nouveau :

1. Servir `projects/grist_forms` et ouvrir `demo/index.html`.
2. Dans Chrome (outils de développement, mode appareil, ou l'outil d'émulation), essayer **320, 375, 768 et 1280 px**, en mode tactile pour les trois premiers.
3. Traverser chaque étape de chaque cas ; à chaque étape, vérifier :
   - `document.documentElement.scrollWidth <= innerWidth` ;
   - qu'aucun élément du formulaire (hors carte) ne dépasse `innerWidth` ;
   - que chaque `button`, `input`, `select`, `textarea` fait au moins 44 px de haut (une case ou un radio se mesure par son `label`).
4. Ajouter la saisie à un cas de la démonstration : c'est là qu'elle est mesurée.

Mesuré le 18/10/2026, six cas de la démonstration, toutes les étapes : 320, 375 et 768 px sans débordement et sans cible sous 44 px.

## Ce qui reste hors règle

- **Tailles de texte** : plusieurs textes secondaires (aides, mentions, étiquettes de progression) font 12 à 13 px, sous les 14 px du plancher du kit. Les relever change le style partout : décision à prendre, pas un correctif.
- **La carte** (`maplibre`) garde ses boutons de zoom à 29 px, ce qui est le réglage de la bibliothèque.
- **1280 px et plus** : non re-mesuré après ces corrections (seul le gabarit étroit a changé).
