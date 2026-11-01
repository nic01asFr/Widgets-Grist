# Cadrage : le thème du visiteur (hors Grist) et l'enregistrement par lieu

Statut : cadrage du 01/11/2026, avant tout branchement dans les vitrines ou les autres widgets. Ce document dit **ce qui est décidé, ce qui
ne doit jamais arriver, et ce que les tests gardent**. Le socle (`shared/theme-visiteur.js`) et ses tests viennent avec ; le reste est
décrit, pas fait.

## 1. L'idée

Sur le site public (vitrines, démonstrations), une personne définit des couleurs, les voit appliquées à de vrais widgets, et les garde sur
son appareil. Dans Grist, le même outil écrit dans le document. Une seule règle de lieu :

| | Dans Grist | Hors Grist |
|---|---|---|
| Brouillons du design system | table `Design_system` du document | stockage local, clé propre |
| « Appliquer » | `Theme_document`, par le geste confirmé (déjà fait) | la clé « thème du visiteur » |
| Cache local | **aucun** | oui, par défaut |
| Garder, transporter | le document | l'export en fichier ThemeDef |

## 2. Ce que l'étude du dépôt a montré

- **Qui lit un thème aujourd'hui** (sur `main`) : Form Builder (`shared/themedef.js`) et Atlas (`lib/charte/`). Les autres widgets
  (TaskFlow, Artefactory, budget, qgis2grist) n'en lisent aucun ; TaskFlow est compatible sur une branche à part, non fusionnée.
- **Une origine partagée.** Tous les widgets, toutes les vitrines et toutes les démonstrations sont servis par la même origine
  (`*.github.io`), et un widget dans Grist garde cette origine **pour tous les documents**. Une clé de stockage local est donc commune à
  tout : ce qu'on y met passe d'un document à l'autre, et d'un widget à l'autre. Atlas le sait déjà (il indexe sa clé par instance hôte).
- **Les clés existantes n'ont aucune convention** (`taskflow_relinked`, `atlas_autosave`, `formbuilder:outil-suit`, `zebra_terrain_sync`…).
  Une nouvelle clé doit être préfixée par le nom du dépôt et ne jamais entrer en collision.
- **Les démonstrations s'ouvrent dans une iframe, au clic**, avec l'adresse absolue de la page, sans bac à sable. Même origine que la
  vitrine : la lecture directe du stockage est possible. Atlas se met déjà en « mode démonstration » avec `?vitrine=1`.
- **La démonstration de formulaires ne charge aucun lecteur de thème** (ni `theme.js` ni `themedef.js`) : elle ne pourra rien prendre sans
  un branchement.
- **La vitrine s'habille avec six variables** (`--papier`, `--surface`, `--encre`, `--plume`, `--filet`, `--accent`), avec une variante
  sombre. Une seule fiche, un seul générateur, pour toutes les pages : toute modification du style commun touche **tous** les widgets.

## 3. Décisions

- **D1. Un étage « visiteur » en tête de chaîne, jamais ailleurs.** Visiteur, puis thème du formulaire, document, Grist, origine. Il n'existe
  que dans les pages de vitrine et de démonstration.
- **D2. Il ne s'active que si la page l'a demandé ET n'est pas dans Grist** : `?vitrine=1` (la convention d'Atlas) ; jamais quand
  `grist-plugin-api.js` a posé `data-grist-widget` sur `<html>`. Un formulaire publié, un compositeur ou tout widget en production
  **ne lit jamais** cette clé.
- **D3. On pousse le thème, on ne pointe pas vers lui.** Une source unique (le stockage local), relue à chaque fois, remise aux
  démonstrations par la page qui les héberge. Pas d'adresse partagée, pas de service worker, pas de serveur. Un thème par défaut est une
  copie figée à la génération (comme le thème du document dans la page autonome).
- **D4. Le thème est une donnée non fiable, relue à chaque lecture** : 16 Ko, version, `#RRGGBB` strict, jamais de CSS. Une valeur
  illisible ou périmée est ignorée, jamais réparée en silence.
- **D5. Le stockage peut manquer** (navigation privée, données effacées, quota). Rien ne casse : on garde le thème en mémoire pour la
  durée de la page, et on **le dit** (« Enregistré sur cet appareil » ne s'affiche que si c'est vrai).
- **D6. La clé est unique, nommée et versionnée** : `widgets-grist:theme-visiteur`, contenu `{ v: 1, themedef, maj }`. Elle n'est écrite ni
  lue ailleurs que par `shared/theme-visiteur.js` et ses consommateurs déclarés (voir les tests).
- **D7. Ce qui est partagé reste petit.** Le socle est dans `shared/` de Form Builder ; il n'est **pas** copié dans les autres widgets.
  Atlas, TaskFlow et le kit sont des interlocuteurs : on leur parle avant de leur demander de lire quoi que ce soit.
- **D8. Aucun changement du style commun de la vitrine à ce stade.** Quand il viendra, il posera les six variables existantes en style
  en ligne sur `<html>` (aucune règle de plus dans la feuille) et restera **inerte sans thème** : les pages générées ne doivent pas
  changer d'un octet quand personne n'a rien choisi.

## 4. Ce qui ne doit jamais arriver (et que les tests gardent)

1. Un formulaire publié (le document HTML que génère « Mettre en ligne »), la page autonome ou le moteur contient la clé du visiteur.
2. Un fichier du dépôt, hors liste, lit ou écrit cette clé.
3. L'étage visiteur s'active dans Grist, ou sans `vitrine=1`.
4. Un thème illisible, trop gros, d'une mauvaise version ou aux couleurs non strictes est accepté.
5. Une erreur de stockage fait échouer la page, ou fait croire à une sauvegarde qui n'a pas eu lieu.
6. Un thème qui rendrait le texte illisible passe sans correction (les gardes de lisibilité du lecteur restent celles de tout thème).
7. Une autre clé de stockage du dépôt a le même nom.
8. Le lecteur de thème de production (`shared/themedef.js`) dépend du socle visiteur.

## 5. Ordre de réalisation

1. Ce cadrage, le socle `shared/theme-visiteur.js`, ses tests, et les tests transverses (cette étape).
2. **Fait (01/11/2026, non publié).** La page design system hors Grist : « Enregistrer / Appliquer sur cet appareil » écrivent par le socle ; en Grist, rien ne change. Le magasin local n'a plus de fausse table : il garde les brouillons et dit quand le navigateur ne retient rien.
3. Un thème par défaut et le pont des six variables dans la vitrine (D8), avec test d'octets identiques sans thème.
4. Une page « Mes couleurs » en langage courant (niveau 0).
5. Le branchement des démonstrations, une à une, après accord de leurs propriétaires (formulaires d'abord).

## 6. Ce que ce cadrage ne tranche pas

- Qui définit le thème par défaut du site.
- Le partage par lien (`#theme=…`) : possible sans serveur, à confirmer.
- La commande `setTheme` d'Atlas pour sa démonstration : à voir avec Atlas-BI.

## 7. Ce que l'étude a trouvé en route : un écart du lecteur de production (à décider)

**Constat mesuré** (01/11/2026, par le chemin réel : une ligne de `Theme_document` lue par `FormThemeDef.charger`). Un ThemeDef dont le `resolu`
est fabriqué (texte, fond, action et texte d'action tous en `#ffffff`) est **appliqué tel quel** : contraste texte/fond 1,00:1. La spécification
dit que `resolu` « ne fait pas foi » ; le **lecteur du kit** le re-mesure sur 22 paires (texte 4,5:1, composants et focus 3:1, les seuils du
document s'appliquant à leur famille) et **refuse le thème entier** (`contraste-insuffisant`) quand une paire échoue. Notre lecteur
(`shared/themedef.js`, `resoudre`) applique les valeurs de `resolu` après les avoir seulement vérifiées comme des couleurs strictes.

**Portée.** Il faut le droit d'écrire dans `Theme_document` : un éditeur du document, ou un compilateur défaillant. Sont concernés les
formulaires publiés avec Form Builder 1.4.0 et après, et le compositeur. Atlas a son propre lecteur (non examiné ici).

**Ce qui a été fait.** Le socle visiteur ne souffre pas de cet écart : il n'accepte jamais `resolu` et recalcule depuis les graines, et il
refuse en dernier recours un jeu de six variables dont le texte ou l'accent serait illisible (`tests/theme-visiteur.test.js`).

**Corrigé le 01/11/2026 (non publié).** Le lecteur de Form Builder refuse maintenant un `resolu` incomplet ou qui rate une des 22 paires (avant et après les surcharges), ignore une surcharge refusée au lieu d'effacer la valeur qu'elle visait, lit la colonne `version`, les colonnes de longueurs inégales et le mode sombre « aucun » comme le kit, et mesure les mêmes couleurs que lui (`#RGB`, `rgb()`, `hsl()`). Les 142 vecteurs sont rejoués (127 en accord ; 15 écarts nommés dans `tests/themedef-lecteur-vecteurs.test.js`). Vérifié en Grist réel : un `Theme_document` hostile actif laisse le formulaire lisible, à l'apparence d'origine. Reste à publier avec Atlas.

**Ce qui était à décider (ancien texte).** Rejouer les 142 vecteurs de lecture du kit (`kit/jetons/themedef/vecteurs/themedef-lecteur.vecteurs.json`) sur
notre lecteur avec un adaptateur, puis corriger : refuser un `resolu` qui rate une paire, comme le kit, pour que **le même document donne le
même résultat dans tous les widgets**. Changement de comportement d'un lecteur déjà en production : à faire sur accord, avec les vecteurs.
