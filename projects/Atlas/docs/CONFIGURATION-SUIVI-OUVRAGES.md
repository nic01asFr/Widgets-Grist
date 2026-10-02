# Configuration d'Atlas pour un suivi d'ouvrages — cas d'une équipe gestionnaire d'espaces naturels

*02/10/2026. Générique : aucun nom d'équipe ni de document. Appliquée à une **copie** de travail du document de
l'équipe ; l'original n'a pas été touché. Vérifiée en partie (voir « Ce qui reste à vérifier »).*

## Le besoin, en une phrase

Une équipe suit une centaine d'ouvrages (ponts, passerelles, gués, buses…) répartis en unités territoriales : chaque
ouvrage a un état, un type, des photos, une visite à intervalle donné, et un agent qui le relève sur le terrain.

## Ce que le document fournit déjà (et qu'Atlas lit sans rien copier)

| Dans le document | Ce qu'Atlas en fait |
|---|---|
| Table des ouvrages (latitude / longitude, état, type, domaine, délai avant la prochaine visite, photos) | couche de points |
| Tables de référence des états (couleur, rang de gravité) et des types (image) | couleur par état, ordre de dessin par gravité, icône par type |
| Table des visites liée à l'ouvrage | « dernière visite » de la bulle |
| Formulaire natif « ajouter une visite » | proposé hors édition, sur la fiche et dans la bulle |
| Couches en WKT (limites de domaines, boucles de randonnée, pistes DFCI, haies) | couches de contexte |

## La configuration retenue

**Couches** (de haut en bas) : ouvrages, boucles, limites des domaines. Les pistes DFCI (2 500 tronçons) et les haies
(670) sont **masquées par défaut** : à l'échelle de la région, elles noient les ouvrages, qui sont le sujet.

**Ouvrages** — couleur par état (table de référence), icône par type, étiquette = nom. **Bulle** : photos, pastilles
d'état et de sécurité des usagers, type, domaine, unité, délai avant la prochaine visite, suivi spécialisé, dernière
visite, gestes (nouvelle visite, fiche, itinéraire). On montre l'**unité**, pas l'agent : le nom d'une personne n'a pas
à s'afficher à qui consulte.

**Contrôles publiés en pastilles** : état, sécurité des usagers, type, domaine, prochaine visite (en mois ; négatif =
en retard).

**Fonds** : Plan IGN par défaut, avec Ortho IGN et Plan simple au choix du lecteur ; projection à plat, sans bâti 3D, sans
relief — un suivi d'ouvrages se lit à plat.

**Contextes** (une étape du récit qu'on rejoue sans la séquence, proposée par la pastille « Contexte ») :
1. *Vue d'ensemble* — tous les ouvrages et les limites (ouverture par défaut en exploitation) ;
2. *Une unité* par unité territoriale — cadrée sur ses ouvrages, filtrée sur l'unité ;
3. *Visites en retard* — ouvrages dont le délai avant la prochaine visite est de 0 mois ou moins ;
4. *Ouvrages à surveiller* — états mauvais et critique ;
5. *Défense des forêts et haies* — les pistes DFCI et les haies avec les limites, pour situer un ouvrage dans son réseau.

**Où cela s'écrit** : `Atlas_LayerPrefs` (symbolisation, bulle, contrôles), `Atlas_ScenePrefs` (fonds, projection,
pastille des fonds, ouverture), `Atlas_Story` (les contextes, à clé stable). Rien n'est ajouté aux tables de l'équipe.

## Ce qu'Atlas ne couvre pas encore pour cet usage

- **« À faire / fait » d'après une règle** : le délai avant la prochaine visite est une formule de l'équipe ; Atlas
  la filtre (contexte « Visites en retard ») mais ne la colore pas ni ne la compte (cadrage, lot 7).
- **Ajouter un ouvrage manquant sur le terrain** : réservé à *Préparer* (lot 6).
- **Hors ligne** : l'application suppose le réseau (cadrage de l'application terrain, lots 0 à 8).
- **Regroupement de points** : à l'échelle de la région, les icônes se recouvrent. Les contextes par unité en sont la
  parade ; un regroupement serait un vrai apport.
- **Libellés d'état** : la table de référence porte des préfixes de tri (« A_ », « B_ »…) qui s'affichent tels quels
  dans la légende. Atlas permet de renommer une catégorie ; la bonne place du libellé court est la table de référence.

## Ce qui reste à vérifier (écran, en posture *Exploiter* puis *Lecture*)

1. L'ouverture sur le contexte « Vue d'ensemble » (en *Préparer*, la scène s'ouvre sur la vue de l'auteur, c'est voulu).
2. Les cinq pastilles de contrôle : lisibles, et qui filtrent.
3. Chaque contexte : cadrage, couches, filtre, consigne.
4. La bulle d'un ouvrage avec photos réelles, et « Nouvelle visite » qui ouvre le formulaire natif.
5. Un agent qui ne peut qu'ajouter des visites : Atlas ne lui propose que cela (droits par table).
6. Le même lien en `?mode=view` (plafond de posture), sur téléphone.
