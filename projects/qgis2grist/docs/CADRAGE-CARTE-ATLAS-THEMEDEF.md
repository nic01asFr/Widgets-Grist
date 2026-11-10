# Cadrage : la carte de qgis2grist devient un hôte du composant Atlas, et suit le ThemeDef

> Statut : lots 1 à 5 réalisés dans la branche locale `qgis2grist/modulaire` (voir §8). Rien n'est publié ni poussé ; les décisions du §6 ont reçu une valeur PAR DÉFAUT, réversible, en attendant l'avis de Nicolas.
> Périmètre : `projects/qgis2grist` seulement. Atlas et `published/` ne sont pas modifiés ; Atlas est CONSOMMÉ tel que publié (1.44.0, contrat 0.8).

## 1. Objectif

1. Le fond de carte de qgis2grist est celui du composant Atlas (fait pour le fond seul, commit `c0178d1c` : style OpenFreeMap liberty, sans clé).
2. La carte de qgis2grist est **dessinée par `<atlas-bi>`** : qgis2grist garde l'import (parsing, schéma Grist, formulaires) et pilote la carte par le contrat, au lieu de dessiner avec son propre code MapLibre.
3. Le widget **suit le ThemeDef** du document (table `Theme_document`) : son interface, et la carte Atlas avec lui.

## 2. État vérifié

| Sujet | Constat | Source |
|---|---|---|
| Fond actuel | style OpenFreeMap liberty injecté dans `lib/maplibre-bridge.js` ; fond, entités, légende, attribution rendus dans Chrome | essai du 08/11, 0 erreur de style |
| Carte actuelle | `lib/maplibre-bridge.js` (sources GeoJSON par table, popups, visibilité, cadrage) + dans `index_v2.html` : relecture Grist toutes les 5 s (`startMapPolling`), légende, profils de volume A/B/C (`scene-lod.js`), panneau et curseur BigQgisMCP propres à un cas d'inondation | lecture du code |
| Sortie déjà produite | Scene Manifest V0.2.x (`scene-manifest.js`) et contrôles (`controls-from-layer.js`) : exactement ce qu'Atlas lit | `CLAUDE.md` des deux projets |
| Composant Atlas | `client.setScene(manifeste, données)`, `setTheme`, `setFond`, `setFilter`, `select`, `getLegend`, `flyTo/fitTo`, événements `select`/`hover`/`filter` ; élément `<atlas-bi src=...>` ou `creerClient` ; l'hôte déclare son origine (`?hote=`) | `EXPLOITATION-EXTERNE-BI.md` §1 |
| ThemeDef côté Atlas | module pur `lib/charte/theme-document.js` (`themeDuDocument(fetchTable('Theme_document'))`) puis `setTheme(charte)` ; le plan de carte, le halo et le lavis sont calculés par Atlas | `lib/charte/depuis-themedef.js` |
| ThemeDef côté Form Builder | `grist_forms/shared/themedef.js` (`FormThemeDef`) lit la même table, pose des variables `--kit-*` ; déjà vendorisé dans `v2/vendor/grist_forms/` de qgis2grist | lecture du code |
| `setTheme` n'accepte pas un ThemeDef brut | il attend une charte `atlas-charte/0.1` ou un thème 0.3 : l'hôte doit convertir | `lib/bi/theme-charte.js` |

Non vérifié : l'importation de `theme-document.js` depuis l'adresse publiée d'Atlas par un widget Grist (CORS, version) ; le rendu de `<atlas-bi>` dans l'iframe d'un widget Grist de l'instance de Nicolas ; la tenue en charge sur plus de 50 000 entités par couche.

## 3. Principe d'architecture

```
 qgis2grist (import, formulaires)          carte                           thème
 fichier QGIS -> tables Grist  --------->  <atlas-bi>  <---- setTheme ---- Theme_document (ThemeDef)
        |                                     ^                                  ^
        +-- Scene Manifest + contrôles -------+                                  |
        +-- lignes des tables (GeoJSON) -- setScene(manifeste, données) ---------+ (interface du widget : --kit-*)
```

- **qgis2grist ne dessine plus la carte.** Il fabrique le manifeste (déjà fait) et les `Feature` à partir des tables Grist (`rowsToGeoJSON` existe), les envoie, et reçoit `select`/`filter`.
- **Atlas reste générique** : aucun code propre à qgis2grist dans Atlas. Le marqueur `source: qgis2grist` n'est pas touché.
- **Une seule source de thème** : la table `Theme_document`. L'interface de qgis2grist la lit par `FormThemeDef` (déjà vendorisé), la carte par la conversion d'Atlas. Priorité à la préférence de contraste de la personne, comme dans les deux lecteurs.

## 4. Ce que la bascule remplace, garde ou abandonne

| Fonction de la carte actuelle | Après bascule |
|---|---|
| Fond, attribution | Atlas (`setFond`, 'atlas' par défaut ; plan IGN, uni, `base=aucune` au choix) |
| Couches points/lignes/surfaces + styles QML | manifeste (`style.declarative`) ; déjà produit |
| Légende | `getLegend` / légende d'Atlas |
| Popups | événement `select` + bulle d'Atlas ; fiche d'entité éventuellement par le moteur de formulaire |
| Filtres | `controls` du manifeste (`controls-from-layer.js`) + `setFilter` |
| Relecture Grist toutes les 5 s | `setScene({fusion:true, layers:[couche modifiée]})` sur la seule couche modifiée ; JAMAIS `updateFeature` en boucle (coût O(N), mesuré) |
| Profils de volume A/B/C | à reprendre : au-delà de 50 000 entités par couche le composant avertit ; au-delà de 100 000, tuiles (non prises en charge aujourd'hui) |
| Curseur d'inondation BigQgisMCP, panneaux de cas | propres à un cas : restent sur l'ancienne carte (v1 ou chemin hérité), hors bascule |
| 3D, objets, relief | gratuit avec `profil=complet` si Nicolas le veut ; non requis |

## 5. Lots proposés (chacun reste utile seul, un commit par fonctionnalité, vérifié dans Chrome et en Grist réel)

- **Lot 0, mesures (1 jour).** `<atlas-bi>` dans l'iframe d'un widget Grist réel de l'instance de Nicolas : chargement, origine déclarée, version négociée ; `setScene` sur QField Wastewater (6 768 entités) et Bee Farming ; temps et mémoire. Décide si l'hôte est l'Atlas publié ou une copie vendorisée.
- **Lot 1, carte Atlas en option (2 jours).** Nouvelle vue carte, derrière un paramètre (`?carte=atlas`) ; l'ancienne reste la valeur par défaut. Manifeste + données + fond. Aucun changement d'import.
- **Lot 2, interactions (2 jours).** Sélection et fiche, légende, filtres issus des contrôles, cadrage.
- **Lot 3, ThemeDef (2 jours).** Lecture de `Theme_document` (règle commune : une ligne active, sinon rien), `--kit-*` pour l'interface, conversion vers la charte pour `setTheme`, suivi à chaud d'un changement de thème. Aucun écrit dans la table.
- **Lot 4, synchronisation en direct (1 à 2 jours).** Remplace la relecture périodique : mises à jour par couche et par lots, avec suspension quand l'onglet est masqué.
- **Lot 5, bascule (1 jour).** La carte Atlas devient la valeur par défaut ; l'ancienne reste derrière un paramètre le temps d'un cycle ; documentation et golden mis à jour.
- **Lot 6, optionnel.** Profil complet (3D) ; paquet hors ligne ; tuiles au-delà de 100 000 entités.

Ordre conseillé : 0, 1, 3, 2, 4, 5. Le lot 3 peut se faire avant le 2 car il est indépendant de la sélection.

## 6. Décisions à prendre par Nicolas

1. **Hôte d'Atlas** : l'Atlas publié (adresse GitHub Pages, toujours à jour mais en ligne et soumis à la version publiée) ou une copie vendorisée dans le widget (fonctionne hors ligne, mais à rafraîchir à chaque version) ?
2. **Ancienne carte** : la garder tant que le curseur d'inondation et les cas particuliers n'ont pas de remplaçant, ou la retirer ?
3. **Volume** : seuil maximal accepté par couche avant avertissement (50 000 aujourd'hui côté Atlas) ; au-delà, refus argumenté ou tranche par emprise ?
4. **Thème** : le ThemeDef s'applique-t-il aussi aux couleurs de données des couches importées (palettes QML) ou seulement au fond et à l'interface ? Aujourd'hui la couleur d'une entité vient du QML, ce qui est le comportement attendu d'un import QGIS.
5. **Qui écrit `Theme_document`** : qgis2grist ne l'écrit jamais (règle des lecteurs) ; confirmer que l'activation passe par le Form Builder.
6. **Profil** : carte nue (`bi.html`) ou application complète (3D, objets, éclairage) ?

## 7. Garde-fous

- Ne pas modifier Atlas ni `published/` ; toute évolution demandée au composant passe par l'agent Atlas-BI et le contrat, jamais par un contournement.
- Prévenir les hôtes d'Atlas (`#atlas-bi-hotes`) avant toute publication qui toucherait le contrat ou le client ; ce chantier n'y touche pas.
- Aucune table Grist créée par la carte ; les sorties d'import (noms de tables, colonnes, `SceneManifest`, marqueur `source`) restent strictement identiques : le golden d'import sert de garde.
- Pas de service tiers imposé : `setFond('uni')` ou `base=aucune` restent possibles.
- Données du document traitées comme non fiables à la lecture du thème (taille, profondeur, clés interdites), comme dans les lecteurs existants.

## 8. État d'avancement (08/11/2026) et décisions par défaut

Réalisé (branche locale `qgis2grist/modulaire`, rien poussé) : la carte du composant Atlas est la carte par défaut de `index_v2.html` (lots 1, 2 et 4), le ThemeDef est suivi (lot 3), la bascule est faite (lot 5). Mesuré dans Chrome contre l'Atlas publié 1.44.0 (contrat 0.8 négocié) : connexion en environ 2,6 s ; QField Wastewater (6 565 entités sur 2 couches spatiales) posé en 1,9 s ; Bees (5 139 entités sur 6 couches) ; modification d'une couche synchronisée en 1 s, `fusion` confirmée (l'autre couche reste en place).

| Décision | Valeur retenue par défaut |
|----------|----------------------------|
| D1 hôte | l'Atlas publié, adresse configurable par `?atlas=` dans une liste blanche (origine publiée, localhost pour le développement), pas de copie vendorisée |
| D2 ancienne carte | gardée : `?carte=legacy`, imports BigQgisMCP, repli automatique |
| D3 volume | pas de refus, l'avertissement d'Atlas est relayé |
| D4 thème et données | le thème (ligne active de `Theme_document`, sinon thème de l'instance Grist, sinon rien) habille l'interface, le fond et la bulle ; le fond d'Atlas suit tout thème appliqué ; les couleurs de données restent celles du QML |
| D5 écriture | le widget n'écrit jamais `Theme_document` |
| D6 profil | carte nue |

Non vérifié : un import réel dans le Grist de Nicolas (la validation du 09/11/2026 a utilisé un document anonyme de docs.getgrist.com, voir CLAUDE.md) ; la tenue au-delà de 50 000 entités par couche ; la promotion (les scripts `theme*.js`, `derivation-valeurs.js` et `themedef.js` de `grist_forms/shared` doivent être vendorisés avec le widget, comme `publish.js`).
