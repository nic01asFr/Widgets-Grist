# Journal des versions d'Atlas

Écrit pour les personnes qui intègrent Atlas (applications hôtes) et pour celles qui le publient. Le journal pour les utilisateurs est dans la vitrine (`published/atlas/vitrine.json`, rubrique `journal`) ; les versions antérieures à la 1.13.2 n'y sont que là.

Adresse publique : `https://nic01asfr.github.io/Widgets-Grist/atlas/` (elle suit la dernière version). Pour chaque version : le contrat du composant BI, la version du client en un fichier et son empreinte, car un hôte les épingle.

| Repère | Valeur actuelle |
|---|---|
| Contrat du composant carte BI | 0.3 (additif depuis sa publication) |
| Client de l'hôte en un seul fichier | `lib/bi/client-hote.js`, `VERSION_CLIENT` 1, 14 770 octets |
| Empreinte du client | `sha384-BKqMqAslAVNAB7iCXpuHU+RzIQ8TLTCfKdh+rHpibyJnplgaOexPQ4nKzpDVWKYY` |
| Moteur de formulaires vendorisé | celui de la 1.13.1 (une publication d'Atlas ne le fait pas bouger) |

Une nouvelle empreinte du client s'accompagne d'une nouvelle `VERSION_CLIENT`, annoncée sur le fil des hôtes **avant** publication.

## 1.16.4 — le rendu des véhicules au choix

- **Ajouté** : réglage « Rendu des véhicules » dans la section « Trafic simulé » de « Vue & rendu » : points de loin et 3D de près (défaut, comme en 1.16.3), **modèles 3D seulement** (jamais de points, dès le zoom 13, grossis de loin pour rester visibles) ou points seulement. Modifiable pendant que le trafic roule. Remplace l'interrupteur « Véhicules en 3D » de la 1.16.3 (`traficReglage('vehicules3d', bool)` reste accepté).
- **Ajouté** : sans modèles 3D disponibles (téléphone en lecture, fichier introuvable), le mode « 3D seulement » montre des points et le dit, au lieu de ne rien montrer.
- **Ajouté** : phares et feux des véhicules 3D de nuit — deux phares blancs et leur faisceau sur la chaussée, deux feux rouges, avec leurs halos. Ils suivent le soleil de la scène d'Atlas (même règle que les luminaires : du coucher au lever, d'après la date, l'heure, le fuseau et le lieu du module « Soleil »), en fondu de 1,5 s.
- **Composant BI** : inchangé (contrat 0.3, même client).

## 1.16.3 — un trafic fluide, orienté, en 3D de près

- **Ajouté** : `lib/trafic-rendu.js`. Les véhicules ne sautent plus cinq fois par seconde : la carte dessine, 30 fois par seconde, une position entre le pas précédent et le pas courant du moteur (position et cap interpolés ; un saut de plus de 12 m n'est pas lissé). Le calcul du moteur ne change pas.
- **Ajouté** : fondu à l'apparition (0,6 s) et à l'arrêt (0,4 s, `arreter({ doucement: true })`).
- **Ajouté** : niveau de détail selon le zoom (rien sous le zoom 13, des points ensuite, des modèles 3D du catalogue — `car` et `bus` — à partir du zoom 16), et seuls les véhicules de la fenêtre visible sont dessinés.
- **Ajouté** : `Models3D.vehiculesPreparer/Maj/Effacer` : les véhicules 3D sont des instances de la scène d'Atlas, orientées selon leur cap, posées sur le sol ; réglage « Véhicules en 3D (de près) » dans la section « Trafic simulé » de « Vue & rendu ».
- **Corrigé** : changer le fond de carte pendant que le trafic roule le faisait disparaître définitivement (le changement de style emporte la source et la couche, et la scène 3D est refaite) : la couche est reposée au chargement du nouveau style (ou au dessin suivant si aucun évènement n'est émis), et les véhicules 3D sont repréparés.
- **Composant BI** : inchangé (contrat 0.3, même client).

## 1.16.2 — le trafic simulé ne fige plus la carte

- **Corrigé** : sur un réseau de quelques centaines de tronçons, les premières images du trafic prenaient de 1 à 5 secondes (le calcul des zones de conflit entre trajectoires comparait tous les points deux à deux) : les points sont maintenant rangés dans une grille de proximité, le même calcul passe sous 0,3 s au pire, et sous 5 ms par image ensuite.
- **Corrigé** : une trajectoire de longueur nulle (tronçons confondus ou de longueur nulle dans un carrefour) levait une exception à chaque image ; elle donne désormais son point, sans cap.
- **Ajouté** : un moteur qui échoue trois images de suite est arrêté, `etat().erreur` dit pourquoi et l'interface prévient, au lieu de lever cinq exceptions par seconde.
- **Corrigé** : à l'ouverture d'un projet, une erreur « Cannot read properties of undefined (reading 'layers') » interrompait la restauration quand le style de la carte n'était pas encore chargé (bâti 3D du fond) ; la visibilité est réappliquée au chargement du style.
- **Composant BI** : inchangé (contrat 0.3, même client).

## 1.16.1 — distinguer les routes, les chemins, les pistes cyclables

- **Ajouté** : `lib/modes-voie.js` distingue route, route à accès restreint, chemin, sentier, escalier, piste cyclable et voie ferrée (BD TOPO et OpenStreetMap). L'import des routes de l'IGN porte un attribut dérivé **`type_de_voie`** et colore par type de voie (au lieu de l'importance, qui reste la largeur).
- **Trafic** : ne roule plus que sur les routes ouvertes à la circulation (allées de parc, chemins, sentiers, escaliers, pistes cyclables, voies ferrées, accès restreint ou impossible, projets sont écartés, chacun pour son motif, dit à l'écran) ; l'option `acces: 'tous'` rend les routes à accès restreint. Section **Trafic simulé** du module « Vue & rendu » (couche, densité, accès restreint, animer ou arrêter) ; véhicules dessinés en blanc (voitures) et orange (poids lourds).
- **Composant BI** : inchangé (contrat 0.3, même client).

## 1.16.0 — un trafic simulé sur les routes d'une couche

- **Ajouté** : `A.traficDemarrer(layerId?, { densite, vitesse, graine })`, `A.traficArreter()`, `A.traficEtat()` et l'entrée de palette « Animer le trafic (simulé) ». Des véhicules roulent sur les routes d'une couche de lignes (BD TOPO importée, routes OSM) : sens uniques, voies par sens, carrefours, giratoires, files. **Simulation, pas mesure** : densité, destinations et feux sont des hypothèses. Documentation : `docs/TRAFIC.md`.
- **Interne** : le moteur (`lib/trafic/`, 36 tests) et son intégration (`lib/trafic-couche.js`) sont chargés à la demande ; la promotion copie `lib/trafic/`.
- **Composant BI** : inchangé (contrat 0.3, même client).

## 1.15.0 — import des données de l'IGN

- **Ajouté** : bouton **IGN** du panneau Couches (et entrée de la palette) : routes, bâtiments, cours d'eau, plans d'eau, surfaces en eau, végétation, voies ferrées, repères routiers, équipements, communes et départements (BD TOPO et Admin Express, Licence Ouverte), dans la zone visible. Estimation avant import, seuils (refus au-delà de 50 000 objets), import par pages, annulation et reprise, provenance, licence et mention de source. Documentation : `docs/IMPORT-IGN.md`, `docs/DONNEES-IGN.md`.
- **Effet de bord utile** : les routes importées portent leur `sens_de_circulation` : les itinéraires respectent les sens uniques sans saisie.
- **Interne** : `lib/reseau/` (graphe, calage, repères, client WFS ; seul `wfs-bdtopo` est branché) ; la promotion copie une liste de sous-dossiers de `lib/` et refuse un module qui en importe un absent.
- **Composant BI** : inchangé (contrat 0.3, même client).

## 1.14.2 — correctifs du composant et sens uniques OpenStreetMap

- **Composant** : `hover { layer: null, featureId: null }` quand le pointeur quitte la carte (le contrat le disait déjà) ; `setHorsLigne('auto')` lève un hors ligne forcé par l'hôte (sauf navigateur réellement hors réseau) ; `manifeste.attribution` s'affiche dans le contrôle d'attribution (texte et liens `http(s)` sûrs).
- **Atlas** : l'itinéraire lit aussi `oneway`, `junction` et `highway` d'OpenStreetMap (la BD TOPO l'emporte quand elle est renseignée).
- **Client en un fichier** : inchangé.

## 1.14.1 — premier rendu propre du composant

- **Composant** : en `?bi=1`, un **voile** neutre (« Chargement de la carte… ») couvre la carte jusqu'à la scène de l'hôte (levé au plus tard après 8 s) ; `?voile=0` le retire ; `?fond=<atlas|voile|uni|plan|plan-ign|photo>` et `?theme=<atlas|contraste-eleve>` posent un fond et une charte avant le premier rendu visible. Guide de l'hôte, § 5 ter.
- **Client en un fichier** : inchangé.

## 1.14.0 — composant carte BI, adresse publique

- **Composant** : capacités annoncées (`ready.capacites`, `capacite_absente`), identifiants entiers stables, style des polygones (`opacity`, `contour`), `etats` (formes, couleurs, texte), charte graphique (`lib/charte/`), couches administratives colorées (communes, départements, régions, pays), jeux embarqués de repli, paquet de données hors ligne (`tools/construire-paquet.mjs`), élément `<atlas-bi>`, page de démonstration.
- **Client** : `lib/bi/client-hote.js`, un seul fichier généré (`tools/generer-client-hote.mjs`), à copier tel quel et à comparer par son empreinte.
- **Correctifs** : contour du choroplèthe, interface d'Atlas masquée pendant le chargement, fond de plan en panne (404/503) qui laissait le composant muet, codes pays, temps d'une scène.
- **Atlas** : itinéraire qui respecte les sens uniques de la BD TOPO, flèche de cap du point bleu, `lib/charte/` copiée par la promotion.

## 1.13.2 — correctif de sécurité

- Une attribution, un nom, une étiquette ou un message venus d'une scène, d'un catalogue ou d'une adresse s'écrivent comme du texte, jamais comme du HTML ; balise CSP dans la page (`base-uri`, `object-src`, `form-action`).
