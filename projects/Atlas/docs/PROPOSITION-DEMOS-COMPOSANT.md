# Proposition : des démonstrations d'Atlas en composant, par public

*Rédigé le 17/10/2026. Proposition, rien n'est décidé ni construit au-delà de ce qui est dit « fait ».*

## Décision du 17/10/2026 : une seule démonstration, bien faite

Les pages d'essai (carte BI dans une application, canevas, design system, propagation synthétique) étaient **trop techniques et abstraites** pour la vitrine. Elles en sont retirées. Reste **« Rennes en direct »** (`demos/hote-direct`) : une vraie application sur de vraies données ouvertes lues en continu, avec trois apparences (jour, nuit, contraste) qui montrent la carte reprenant le style de l'application. Les pages `hote-bi` et `hote-canevas` restent publiées pour les intégrateurs (documentées dans `EXPLOITATION-EXTERNE-BI.md`), hors vitrine. Les propositions D1 à D5 ci-dessous gardent leur valeur comme pistes ; la suivante serait un tableau de bord sur un jeu de données d'une organisation, avec contrôles en composant.

## 1. Pourquoi refaire les démonstrations

Les pages d'hôte actuelles (`demos/hote-bi`, `hote-canevas`, `hote-charte`) sont des **pages d'essai** : panneau de réglages, journal d'événements, textes techniques. Elles servent à vérifier le contrat, pas à convaincre. Une démonstration de vitrine doit, en dix secondes, dire **ce que la personne obtient**, pas comment la page est câblée.

« Grand public » se dit ici **au sens UX/UI** : des personnes non expertes qui doivent comprendre et réussir sans aide (même règle que le widget referentiels, `UX-AGENTS.md`).

## 2. Les publics et ce que chacun cherche

| Public | Ce qu'il veut savoir | Ce qui le convainc |
|---|---|---|
| **Agent ou chargé de mission** (collectivité, établissement) | « Puis-je voir mon territoire et répondre à ma question sans être cartographe ? » | Une carte déjà réglée, des filtres en français, un temps qui se rejoue, un partage en un geste |
| **Décideur, chef de service** | « Qu'est-ce que ça change pour mon service, et est-ce solide ? » | Quatre histoires métier abouties, des chiffres lisibles, la maîtrise des données (rien n'est recopié) |
| **Intégrateur, développeur d'une application** | « Combien de lignes pour l'avoir dans mon application, et que puis-je piloter ? » | Un terrain d'essai : code à gauche, résultat à droite, copier-coller |
| **Designer, DSI** | « La carte aura-t-elle l'air de mon application ? » | Le même écran avec leur système de design, qu'on change en direct |
| **Producteur de données, de maquettes 3D** | « Ce que je fabrique s'affiche-t-il bien, à l'échelle ? » | Une maquette en dalles, le soleil, la nuit, un récit |

## 3. Cinq démonstrations proposées

Chacune : **vignette puis clic**, en grand cadre, sans journal ni panneau technique, jouable au téléphone, textes sans jargon, données **fictives et dites telles**.

### D1. « Un tableau de bord territorial » : agents, décideurs
- **Histoire :** une carte de France par département avec un indicateur, des sites par type, un curseur de temps avec lecture, des filtres (catégorie, valeur, recherche), une liste liée, un partage.
- **Montre du composant :** choroplèthe, points par catégorie, légende, temps, filtres, sélection partagée avec la liste, charte.
- **Manque :** les **contrôles** ne sont pas exposés par le composant (voir §5). La page les construirait seule avec `setFilter` : possible tout de suite, mais ce n'est pas l'offre cible.
- **Effort :** moyen. **Priorité :** 2.

### D2. « Voir un phénomène se propager » : grand public, décideurs
- **Histoire :** des événements datés (foyer, signalements, crue) dont on regarde la propagation : carte de chaleur et **fenêtre glissante** de quelques heures, bouton lecture, compteur d'événements dans la fenêtre.
- **Montre du composant :** chaleur, temps en mode `glissante`, lecture. **Tout existe déjà** dans le composant BI (1.26.0) ; c'est la scène de la capture du 17/10.
- **Manque :** rien côté composant ; le jeu de données est synthétique à produire (graine fixe).
- **Effort :** faible. **Priorité :** 1, c'est la plus parlante pour le moins de travail.

### D3. « Aux couleurs de votre application » : designers, DSI
- **État :** **fait** (`demos/hote-charte`), à reprendre sur le fond : même écran, interface soignée, bascule clair/sombre.
- **Limite à dire honnêtement :** la charte s'applique à la **carte BI** ; l'interface de l'application complète ne la suit pas encore (§5).
- **Effort :** faible (finition). **Priorité :** 3.

### D4. « Une maquette 3D qui vit » : décideurs, producteurs de maquettes
- **Histoire :** le Palais Longchamp (scène publiée, 18 couches, récit en étapes, éclairage) dans le canevas, jour puis nuit, avec un parcours guidé.
- **Montre du composant :** canevas (application complète pilotée par la page), relief, 3D, récit, soleil. Option : la maquette en dalles de la Fabrique quand son service sera en https.
- **Manque :** le récit et le soleil ne sont pas pilotables par la page (le canevas les affiche seulement dans l'application).
- **Effort :** moyen. **Priorité :** 4.

### D5. « Dans votre page en dix lignes » : intégrateurs
- **Histoire :** un terrain d'essai : à gauche le code (la balise, le manifeste, quelques commandes), à droite la carte qui réagit quand on le modifie ; un bouton « Copier ».
- **Montre du composant :** la balise `<atlas-bi>`, `setScene`, `setFilter`, événements, charte héritée.
- **Manque :** rien ; une page à écrire.
- **Effort :** moyen. **Priorité :** 5.

## 4. Règles communes

1. **Vignette puis clic**, grand cadre, Fermer/Échap (fait dans le générateur de vitrine) : aucune charge tant qu'on ne lance pas.
2. **Zéro jargon** : mots d'usage (« filtre », « période », « légende »), pas « contrat », « manifeste », « profil ».
3. **Téléphone d'abord** : la démonstration doit tenir à 390 px, au doigt.
4. **Données fictives dites telles**, sans nom d'organisation ni de personne ; contours réels seulement (IGN, Licence Ouverte).
5. **Poids tenu** : chaque démonstration annonce sa taille ; plafond de `published/` surveillé (`npm run hygiene:atlas -- --publie`).
6. **Accessibilité** : clavier complet, contrastes vérifiés (déjà mesurés par la charte), mode sombre.

## 5. Ce qu'il faut construire dans le composant pour que ces démonstrations soient justes

| Manque | Pourquoi | Taille |
|---|---|---|
| **Contrôles en composant** : pastilles ou panneau de filtres générés par type de champ (catégorie, nombre, date, recherche), activables par attribut, ex. `interface="legende temps controles"` | Offre d'Atlas complet absente du composant ; D1, D5 | moyenne |
| **Charte sur l'application complète** : couleur principale, police, fond appliqués aux variables d'interface ; mode sombre dans un second temps | D3 honnête ; D4 | moyenne (clair), grosse (sombre) |
| **Chaleur et fenêtre glissante dans l'application complète** (aujourd'hui seulement carte BI) | cohérence canevas ; reste du chantier « agrégats » reporté | moyenne |
| **Récit et soleil pilotables par la page** en canevas | D4 | petite à moyenne |

## 6. Ordre proposé

1. **D2** (propagation) : rapide, spectaculaire, sans manque.
2. **Contrôles en composant**, puis **D1** (tableau de bord) avec eux.
3. Finition de **D3** ; décision sur le chantier charte de l'application complète.
4. **D4** (maquette 3D) ; **D5** (terrain d'essai).

## 7. Décisions à prendre

- Valider l'ordre et les cinq démonstrations (ou en retirer).
- Contrôles en composant : une simple colonne de filtres ou le dock complet d'Atlas ?
- Charte de l'application complète : couleur et police d'abord, sombre ensuite ?
- La vitrine : garder « Partager » comme rubrique unique ou ouvrir une entrée par public (« Je veux voir », « Je veux intégrer ») ?
