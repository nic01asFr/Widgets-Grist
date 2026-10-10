# Charte graphique d'Atlas : contrat 0.1

Atlas applique une **charte graphique** à ses cartes : couleurs de données (séquentielle, divergente, qualitative), encre et fond, états, traits de sélection, fond de plan, marqueurs, police, exigences d'accessibilité. Ce document fixe le **format** (`atlas-charte/0.1`), la **résolution** des niveaux, les **avertissements chiffrés** et la **sécurité**. Il consigne aussi, à la section « Choix retenus », chaque décision de conception et sa raison.

Code : `lib/charte/` (modules purs). Branchement : `lib/bi/theme-charte.js`, `lib/bi/bi-runtime.js` (`setTheme`, `getTheme`, `setFond`), `lib/bi/pont.js` (validation de taille). Tests : `tests/charte-*.test.js`, `tests/bi-theme-charte.test.js`. Schéma JSON : `lib/charte/charte.schema.json`. Exemples fictifs : `tests/fixtures/charte/`.

**Atlas n'embarque JAMAIS la charte d'une organisation.** Il livre deux chartes nommées, neutres : `atlas` (défaut) et `contraste-eleve`. La charte d'un hôte arrive par `setTheme`.

## Statuts

- **[testé]** vérifié par un test automatique (`node --test tests/charte-*.test.js tests/bi-theme-charte.test.js`, aucun accès réseau, la carte est simulée) ;
- **[à créer]** n'existe pas dans cette version (voir la section finale).

## 1. Format [testé]

Une charte est un objet JSON. Tout est facultatif : ce qui manque est **dérivé** des graines, ou hérité de la charte nommée.

| Section | Contenu | Bornes |
|---|---|---|
| `version` | `"atlas-charte/0.1"` | une autre version est ignorée et signalée (`version-inconnue`) |
| `nom` | texte | 60 caractères, `<` et `>` retirés |
| `base` | `"atlas"` ou `"contraste-eleve"` : charte nommée de départ | défaut `atlas` |
| `graines` | `principal`, `secondaire`, `encre`, `fond`, `succes`, `alerte`, `erreur`, `information` | couleurs **opaques** |
| `jetons` | `{ nom: couleur }`, référencés par `jeton:<nom>` dans un style | 64 jetons, nom `[A-Za-z0-9_][A-Za-z0-9_.-]{0,39}` (les points sont admis : `etat.ok`) |
| `donnees` | `sequentielles` (rampes nommées, 2 à 24 couleurs, 16 rampes), `sequentielleDefaut`, `divergente` (3 à 25 couleurs, nombre impair conseillé), `qualitative` (2 à 24), `sansDonnee`, `selection`, `halo`, `survol`, `contour` | rampes et aplats opaques ; `survol` et `contour` admettent la transparence |
| `fond` | `mode` (`atlas`, `voile`, `plan`, `plan-ign`, `photo`, `uni`), `principal`, `intensites` (`vert`, `bati`, `eau`, `filet`, `limite`, de 0 à 1), `vegetation` (`"monochrome"` ou une couleur), `lavis` (`couleur`, `opacite`), `plan` (jetons du plan : `fond`, `vert`, `eau`, `bati`, `route`, `filet`, `texte`, `texte2`, `halo`, `limite`, `info`) | |
| `marqueurs` | `formes` (`cercle`, `carre`, `losange`, `triangle` par état), `contour` | |
| `texte` | `famille` (`systeme`, `sans`, `serif`, `mono`, `lisible`), `tailles` (`legende`, `etiquette`, de 8 à 32 px) | liste sûre de piles système |
| `exigences` | `contrasteMinimal` (3), `contrasteTexte` (4,5), `ecartMinimal` (6, CIEDE2000), `classesMax` (5) | |
| `palettes` | palettes personnalisées **par valeur** : `{ id, nom?, type, couleurs, usages? }`, `type` = `qualitative`, `sequential` ou `divergent` | 32 palettes |

Couleurs admises : `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()` (voir §7). Les valeurs sont **normalisées** en `#rrggbb` minuscule.

`fond.mode` est le fond **souhaité** par la charte, à titre d'information : ni `setTheme` ni la configuration de page ne changent le fond (changement visible, requête réseau, hors ligne). L'hôte l'applique par `setFond(getTheme().charte.fond.mode, …)`.

## 2. Résolution des niveaux [testé]

Du plus faible au plus fort :

1. **les défauts d'Atlas** (charte `atlas`) ;
2. **une charte nommée embarquée** (`base`) : `atlas` ou `contraste-eleve` ;
3. **la charte de l'hôte** : message `setTheme`, configuration de page (`window.ATLAS_BI.charte`), `charte` à la racine d'un manifeste de scène (`setScene`) ;
4. **les surcharges de couche** : `style.charte` d'une couche du manifeste (jetons, palettes, traits propres à la couche).

Puis la **préférence d'accessibilité de la personne** : si elle demande un contraste élevé (`prefers-contrast: more`, ou `attacher(map, { preferences: { contrasteEleve: true } })`), elle **l'emporte sur les niveaux 3 et 4** pour le contraste et le daltonisme : données (rampes, divergente, qualitative, sans donnée, traits), encre, fond, états, exigences, intensités du plan, tailles de texte, contour des marqueurs. Reste à l'hôte son identité (`principal`, `secondaire`, jetons, famille de police, mode de fond). L'indicateur est dans le retour : `a11y.preference = { contrasteEleve, appliquee, remplace: [chemins], raison? }`. Si la charte de l'hôte est déjà `contraste-eleve`, `appliquee` vaut `false` et `raison` `charte-deja-contrastee`. Le changement de préférence pendant la session relance la résolution et émet l'événement `theme`.

### Dérivation depuis les graines [testé]

Ce que l'hôte ne donne pas est calculé, de façon déterministe, **seulement s'il a donné les graines pertinentes** ; sinon la valeur de la charte nommée reste.

| Élément | Calculé quand l'hôte donne… | Règle |
|---|---|---|
| `donnees.sequentielles.principale` | `principal`, `fond` ou `encre` | 9 couleurs espacées de façon égale en clarté L* sur un chemin dans Lab : `principal` mélangé à 12 % au fond (départ) → `principal` → `principal` mélangé à 55 % à l'encre (arrivée). Le sens suit « du fond vers l'encre » : sur fond sombre, la rampe va du sombre au clair. |
| `donnees.divergente` | `principal` **et** `secondaire` | 7 couleurs : `principal` au pôle bas, `secondaire` au pôle haut, un neutre (fond à 7 % d'encre) au centre, chaque côté espacé en L*, les deux extrêmes à la même clarté (le côté le plus pâle est prolongé vers l'encre). Si un pôle ne se détache pas du neutre : pas de divergente calculée (`derivation-impossible`). |
| `donnees.qualitative` | `principal` ou `secondaire` | `principal`, `secondaire`, puis des candidates Okabe-Ito qui restent distinctes (CIEDE2000 ≥ 10 au pire des quatre visions) de tout ce qui précède et se détachent du fond (≥ 2:1) ; jusqu'à 8. |
| `sansDonnee`, `selection`, `halo`, `survol`, `contour`, `marqueurs.contour` | `fond` ou `encre` | gris juste assez foncé pour 3,2:1 contre le fond ; sélection = encre ; halo et contour = fond ; survol = fond à 75 % d'encre ; contour des marqueurs = encre. |
| `fond.principal` | `principal` | la graine principale. |
| `fond.plan` (toujours calculé) | — | plan **monochrome** : la couleur principale du plan mélangée au fond aux intensités `fond.intensites` (défaut vert 7 %, bâti 13 %, eau 30 %, filet 38 %, limite 60 %) ; texte = encre ; végétation colorée si `fond.vegetation` est une couleur (20 % au fond) ; jetons explicites de `fond.plan` par-dessus. |

Les valeurs de référence de la dérivation (deux chartes d'exemple) sont figées dans `tests/fixtures/charte/derivation-reference.json` : toute différence est un changement de règle, à décider.

## 3. Commandes et retour [testé]

`setTheme(charte | thème 0.3, { remplacer? })` — s'ajoute à ce que l'hôte a déjà donné (comme avant) ; `{ remplacer: true }` repart des défauts. Un **thème du contrat 0.3** `{ jetons, categories, sequentielle, divergente, selection, contour, lavis, plan, texte, police, … }` reste accepté et est converti (`entree: "theme-0.3"`). Retour :

```js
{
  version: 'atlas-charte/0.1',
  entree: 'charte',                       // ou 'theme-0.3'
  applique: ['graines.principal', …],     // chemins fournis par l'hôte et retenus
  derive:   ['donnees.sequentielles.principale', 'donnees.divergente', …],   // calculés depuis ses graines
  ignore:   [{ chemin: 'graines.fond', code: 'couleur-invalide', valeur: 'url(x)' }],   // écartés, jamais appliqués
  avertissements: [{ code, niveau, chemin, valeur, mesure, conseil }, …],
  a11y: { preference, encreSurFond, exigences, ecartPireCas: {…}, attention, info },
}
```

L'hôte qui ignore la réponse n'est pas gêné (l'ancien retour était `true`). L'événement `theme` (origine `api`) porte le même objet ; il est aussi émis, avec l'origine `utilisateur`, quand la personne change sa préférence de contraste. `getTheme()` (contrat 0.3) rend `{ version, charte (résolue et complète), hote (ce que l'hôte a donné, assaini), applique, derive, ignore, avertissements, a11y }`.

`setFond(mode, jetons)` : les jetons (`principal`, `fondUni`, jetons du plan) sont validés comme des couleurs ; une valeur invalide est ignorée et signalée. Avec `principal`, le plan est celui de la charte (intensités, végétation, encre). Retour : `{ mode, …, ignore, avertissements }`.

### Avertissements chiffrés

Chaque constat est `{ code, niveau, chemin, valeur, mesure, conseil }`. `niveau` vaut `attention` (un défaut de lisibilité qu'une couche ne corrige pas seule) ou `info` (un fait de la palette que l'affichage compense). Aucun n'interdit quoi que ce soit : la charte reste utilisable.

| Code | Mesure | Conseil type |
|---|---|---|
| `contraste-classe-fond` (info) | rapport WCAG de chaque classe pâle contre le fond, seuil `contrasteMinimal` | « Contour sombre requis sur les classes 1, 2 (moins de 3:1 contre le fond) ; ce contour atteint 14,53:1 contre la classe. » |

**Le contour annoncé est posé à l'affichage.** Une unité de choroplèthe, un cercle ou un polygone dont la couleur, VUE sur le fond à l'opacité de la couche (88 % pour un choroplèthe, 90 % pour des cercles, 72 % pour un polygone déclaratif), tombe sous `contrasteMinimal` reçoit un trait de l'encre de la charte (clair sur un fond sombre) ; les autres gardent le contour de la charte. L'avertissement mesure la couleur pleine, l'affichage la couleur vue : une classe à 3,17:1 pleine (5e couleur de la rampe d'Atlas) s'affiche à 2,72:1, elle est donc cernée sans être annoncée. Le contour des marqueurs à formes (`etats`) est `marqueurs.contour`, sauf si l'état déclare le sien.
| `ecart-classes-voisines` | écart CIEDE2000 minimal entre voisines, pire des quatre visions, seuil `ecartMinimal` | écarter les extrémités ou réduire le nombre de classes |
| `nombre-classes` | `classesMax`, pire écart à ce nombre, `nMaxAdmis`, `nMaxNet` | « Réduire à 5 classes (4 pour des classes nettes) » |
| `ordre-clartes` | visions où la clarté ne va plus dans un seul sens | choisir une rampe sans retour en arrière |
| `ecart-qualitative` | pire écart par paire, vision, paire de classes, `kMaxAdmis`, `kMaxNet` | « Limiter à 5 catégories, ou les distinguer aussi par une forme ou une étiquette » |
| `divergente-confondue` | écart des paires miroir au pire cas (seuil 10) | « opposer une teinte chaude et une teinte froide (bleu et orange), jamais rouge et vert » |
| `texte-illisible-classe` (info) | rapport de l'encre et du fond sur chaque classe, seuil 4,5 | poser l'étiquette sur un halo, ou en noir ou en blanc |
| `contraste-texte`, `contraste-etat`, `contraste-trait`, `contraste-plan` | rapport mesuré contre le fond | assombrir ou éclaircir |
| `marqueurs-confondus` | deux états de même forme dont les couleurs se confondent | donner une forme différente |
| `valeur-ignoree`, `cle-inconnue` | `{ raison }` | écrire la couleur dans une syntaxe admise |
| `version-inconnue`, `derivation-impossible`, `palette-defaut-absente`, `preference-contraste-elevee` | | |

## 4. Palettes et registre [testé]

`lib/charte/registre.js` : un **registre unique** (identifiant, nom, type, couleurs, usages, avertissements connus, alias, origine).

| Identifiant | Contenu | Alias |
|---|---|---|
| `atlas-qualitative` | Okabe-Ito, 8 couleurs | |
| `atlas-sequentielle` | une teinte, celle de l'accent d'Atlas, 9 couleurs | |
| `atlas-continue` | Viridis, 7 couleurs | `Viridis` |
| `atlas-divergente` | bleu-orange, 7 couleurs | |
| `contraste-eleve-*` | trois palettes de la charte `contraste-eleve` | |
| `heritage-*` | `Tableau10`, `Set2`, `Verts`, `Bleus`, `Oranges`, `YlOrRd`, `RdYlGn` : **mêmes couleurs qu'avant** | le nom historique |

Les noms historiques restent des **alias** : une couche qui nomme `Tableau10` garde ses couleurs (`tests/charte-registre.test.js` lit `COLOR_PALETTES` et `PALETTE_INFO` dans `app_v7.js` et compare couleur par couleur). Seuls les **nouveaux défauts** (`DEFAUTS` du registre) changent. Les palettes historiques portent leurs avertissements connus : `RdYlGn` est signalée `divergente-confondue` (rouge-vert).

**Palettes personnalisées, par valeur** : `enregistrer({ id, nom, type, couleurs })` valide et normalise ; refuse un identifiant ou un alias déjà pris ; `exporter()` rend les couleurs (pour le projet, ou `palettes` du manifeste) ; `importer(liste)` les réenregistre après validation ; `resoudre(ref)` accepte un nom ou une palette `{ couleurs }` par valeur, sans l'enregistrer. Une palette n'est jamais citée par simple référence dans un projet ou un manifeste. Le composant BI ne nomme aucune palette dans ses styles (couleurs explicites ou jetons) : `palettes` d'une charte est assainie, conservée et rendue par `getTheme()`, et le registre les importe (`importer(charte.palettes)`) pour l'éditeur à venir.

## 5. Palette Atlas par défaut : résultats mesurés [testé]

Mesures sur fond blanc, écart CIEDE2000 au **pire** de la vision normale, de la protanopie, de la deutéranopie et de la tritanopie (matrices de Machado, sévérité 1,0). Les seuils sont des règles de pouce de cartographie, pas des normes (3:1 pour un aplat, 4,5:1 pour un texte ; écart 10 « net », 6 « admis »).

| Élément | Mesure |
|---|---|
| Encre `#1f1b14` sur fond `#ffffff` | 17,14:1 |
| États `succes` `#1e6b3e`, `alerte` `#8a5a00`, `erreur` `#b3261e`, `information` `#1f5f99` | 6,51 / 5,93 / 6,54 / 6,66:1 (tous ≥ 4,5:1) ; forme distincte par état |
| Sans donnée `#918f8c`, sélection `#1f1b14`, survol `#57544f` | 3,23 / 17,14 / 7,54:1 |
| **Qualitative** (Okabe-Ito, ordre bleu, orange, vert, pourpre, ciel, vermillon, jaune, noir) | écart minimal des k premières : k = 2 : 51,4 ; k = 3 : 12,1 ; k = 4 à 8 : **11,1** (toutes les paires, jusqu'à 8, restent « nettes ») |
| Contraste de chaque qualitative contre le fond | bleu 5,19 ; orange **2,25** ; vert 3,42 ; pourpre 3,06 ; ciel **2,31** ; vermillon 3,87 ; jaune **1,32** ; noir 21,0 : les trois en gras exigent un contour (annoncé) |
| **Séquentielle** `principale` (accent `#c44536`) | écart minimal à 3, 4, 5, 6, 7, 8, 9 classes : 26,8 / 16,3 / **11,6** / 9,4 / 7,9 / 6,7 / 5,6 ; 5 classes nettes, 7 admises, 9 déconseillées |
| Séquentielle `principale`, contraste au fond (9 couleurs) | 1,18 ; 1,47 ; 1,86 ; 2,40 ; 3,17 ; 4,21 ; 5,65 ; 7,73 ; 10,42 : les deux classes les plus claires à 5 classes demandent un contour sombre (14,53:1) |
| Séquentielle : ordre et gris | monotone en clarté en vision normale, protanopie, deutéranopie, tritanopie et niveaux de gris, de 3 à 9 classes ; plus petit pas de gris 8,0 L* à 9 classes |
| `continue` (Viridis) | ordonnée partout ; écart à 3 à 7 classes : 21,7 / 10,9 / 7,0 / 4,9 / 3,9 : au plus 5 classes (4 nettes) |
| **Divergente** bleu-orange (7 couleurs) | extrêmes à la même clarté (L* 46) ; paires miroir ≥ 26,3 ; écart voisin 12,4 (tritanopie) |
| Divergente rendue par le composant, 3 à 9 classes | 27,0 / 20,7 / 16,2 / 13,4 / 12,4 / 10,0 / **8,4** : nette jusqu'à 8 classes, admise à 9 |
| Charte `atlas` résolue | **0 avertissement d'attention**, 5 `info` (contours requis, libellé sur le vermillon) |

Charte `contraste-eleve` : encre noire (21:1), états à 8,1 à 8,4:1, qualitative de sept couleurs sombres (≥ 4,5:1 contre le fond, écart des k premières 48,3 / 38,3 / 19,9 / 16,1 / 13,0 / 12,4), rampe dont la première classe atteint 3,04:1, écart à 5 classes 8,1.

## 6. Exemples

**Charte neutre fictive** (`tests/fixtures/charte/neutre.json`) : quatre graines, une famille de police, `classesMax: 5`.

```json
{ "version": "atlas-charte/0.1", "nom": "Exemple neutre",
  "graines": { "principal": "#1b6b7a", "secondaire": "#e07b00", "encre": "#1a1a1a", "fond": "#ffffff" },
  "jetons": { "reperage": "#1b6b7a" }, "texte": { "famille": "sans" }, "exigences": { "classesMax": 5 } }
```

`setTheme` renvoie `derive` = séquentielle `principale` (`#e4edef … #1a3e45`), divergente teal-orange, qualitative (`#1b6b7a`, `#e07b00`, `#009e73`, `#cc79a7`, `#56b4e9`, `#000000`), sans donnée, traits, plan ; 0 avertissement d'attention.

**Charte sombre fictive** (`sombre.json`) : fond `#12161c`, encre `#eef1f5` ; la séquentielle va du fond au clair, la qualitative écarte le noir et le jaune pâle invisibles sur ce fond, le contour requis devient « clair ».

**Une graine mal choisie est dite** (jaune `#f0e442` en principal, encre grise `#999999`) : `contraste-texte` 2,85:1 (seuil 4,5), `contraste-trait` sur la sélection, le sans donnée et le contour des marqueurs, `nombre-classes` « Réduire à 3 classes », `divergente-confondue` 4,6 en protanopie.

**Charte hostile** (`hostile.json`) : `url(...)`, `var(--x)`, `expression(...)`, `javascript:`, HTML dans un nom ou un usage, clés `__proto__` et `constructor`, nombres hors bornes, piles de police libres, listes démesurées : rien n'en subsiste dans la charte résolue (`tests/charte-schema.test.js`, `tests/bi-theme-charte.test.js`).

Dans un manifeste, une couche peut porter sa surcharge : `{ "id": "a", "style": { "declarative": { "kind": "single", "color": "jeton:titre" }, "charte": { "jetons": { "titre": "#123456" } } } }` ; le jeton ne vaut que pour cette couche.

## 7. Sécurité [testé]

Les valeurs de couleur d'une scène ou d'un hôte sont un **vecteur d'injection** : elles arrivent dans des expressions de style de la carte. Règles :

1. **Liste blanche stricte** (`analyserCouleur`) : `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()` ; expressions régulières sans quantificateur illimité ni alternance imbriquée, longueur bornée à 48 caractères **avant** toute expression régulière. Jamais `url()`, `var()`, `expression`, `calc()`, `color-mix()`, nom de couleur, HTML.
2. **Reconstruction champ par champ** : la charte est reconstruite à partir d'une table de règles ; seules les clés connues survivent ; la sortie ne contient que chaînes, nombres et objets simples.
3. **Tailles bornées** : couleurs par liste (24), rampes (16), divergente (25), jetons (64), palettes (32), noms (40), chaînes (2 048), éléments de l'arbre reçu (4 000), profondeur (10), clés d'un objet (200). `verifierTaille` borne l'arbre **sans le sérialiser** (un graphe circulaire ne fait pas échouer) ; `lib/bi/pont.js` l'applique à `setTheme` et aux jetons de `setFond` avant tout traitement.
4. **Noms libres sûrs** : `[A-Za-z0-9_.-]` (ni point ni tiret en première position), jamais `__proto__`, `constructor`, `prototype` ; un jeton est cherché dans une propriété PROPRE (`jeton:constructor` donne un gris).
5. **Une valeur invalide est ignorée et signalée**, jamais corrigée ni appliquée ; la charte reste utilisable. Une référence `jeton:…` inconnue ou mal formée donne un gris et ne parvient jamais à la carte comme texte.
6. **Polices** : une liste sûre de piles système ; aucune pile libre, aucune police distante.
7. **Pas de chargement par adresse** : une charte ne se charge ni par URL ni par `fetch`.

## 8. Choix retenus

La personne qui pilote Atlas a délégué les choix de conception ; chacun est pris pour l'option optimale, avec sa raison.

1. **Quatre niveaux de résolution, plus la préférence de la personne.** *Pourquoi* : défauts d'Atlas, charte nommée, hôte et couche correspondent à quatre auteurs différents, du plus général au plus local ; la personne qui a demandé un contraste élevé à son système doit l'obtenir quelle que soit la charte de l'hôte (l'hôte ne sait pas qui regarde), d'où une priorité à part, **annoncée** dans le retour pour que l'hôte sache que sa charte n'est pas appliquée telle quelle.
2. **Contenu : des graines, des données, un fond, des marqueurs, un texte, des exigences ; le reste est dérivé puis vérifié.** *Pourquoi* : une charte d'organisation décrit rarement des palettes de données (aucune n'était fournie par l'hôte réel ; les propositions d'une étude préalable montrent qu'on les dérive de quelques couleurs et qu'on les mesure). Ajouts au minimum prévu : `jetons` (déjà le mécanisme de style), `base` (charte nommée), `palettes` (par valeur), `donnees.halo` (le trait de sélection est double : encre et halo), `fond.lavis` et `fond.plan` (pour convertir sans perte un thème 0.3), `exigences.contrasteTexte` et `ecartMinimal` (les deux seuils mesurés doivent se régler).
3. **Défaut accessible.** *Qualitative* : Okabe-Ito, conçue pour le daltonisme, dans un ordre où **tous** les préfixes restent à ≥ 11 d'écart (le noir en dernier, parce qu'une catégorie noire se confond avec le trait de sélection). *Séquentielle* : une seule teinte, celle de `--accent` (`#C44536`) de `index_v7.html`, parce qu'une rampe multi-teintes se lit mal en gris et en daltonisme et que l'accent donne à Atlas son identité sans réutiliser le jaune ni l'orange d'état. *Continu* : Viridis (ordonnée partout, déjà dans Atlas). *Divergente* : bleu-orange (vermillon et bleu d'Okabe-Ito), vérifiée ; jamais rouge-vert, qui se confond pour 8 % des hommes. *Plan* : monochrome sur la graine secondaire (`--accent2`, un bleu-vert sombre), pas sur l'accent rouge qui teinterait l'eau et le bâti. **Les noms actuels restent des alias** : changer les couleurs d'une couche existante serait une régression silencieuse.
4. **Palettes personnalisées par valeur.** *Pourquoi* : une référence se perd (autre document, autre registre, hôte différent) ; les couleurs, elles, voyagent avec le projet et le manifeste. Un identifiant ne peut pas masquer un nom historique ou un alias.
5. **Chargement : `setTheme` et la configuration de page, pas d'adresse.** *Pourquoi* : une adresse est un nouveau canal d'attaque (SSRF, contenu changeant, hors ligne) ; `setTheme` passe par le pont et sa liste blanche d'origines, la configuration de page est posée par l'hébergeur d'Atlas, qui fait déjà autorité sur cette liste.
6. **Polices : une liste de piles système.** *Pourquoi* : une police distante est une requête réseau (vie privée, hors ligne, CSP) et une pile libre un champ d'injection ; cinq familles couvrent les besoins (dont `lisible`, plus large, pour la préférence de contraste élevé).
7. **Sécurité : liste blanche par expression régulière stricte, tailles bornées, valeur invalide ignorée.** *Pourquoi* : le rapport de sécurité montre que les couleurs de scènes externes sont injectées dans le style ; ignorer sans refuser garde la carte utilisable avec une charte à moitié fausse, tout en le disant.
8. **Retour de `setTheme` détaillé et rétrocompatible ; événement `theme` ; commande `getTheme`.** *Pourquoi* : l'hôte qui ignorait un `true` n'est pas gêné, celui qui veut savoir ce qui a été appliqué, dérivé ou écarté, et pourquoi, le lit ; `getTheme` permet de relire l'état après un rechargement ; `niveau` (attention ou info) est un ajout au quintuplet prévu, pour que l'hôte puisse faire taire ce que l'affichage compense (une rampe a toujours des classes pâles).
9. **Les avertissements sont chiffrés, avec un conseil** (contraste, écart au pire des quatre visions, ordre des clartés, nombre de classes conseillé, texte illisible) : un constat sans nombre ne se discute pas et ne se corrige pas.
10. **Cumul des `setTheme`.** *Pourquoi* : comportement existant (un second thème ne fait pas perdre le premier) ; `{ remplacer: true }` pour repartir de zéro.
11. **`fond.mode` n'est pas appliqué par `setTheme`.** *Pourquoi* : un changement de fond télécharge un style et des tuiles ; ce n'est pas un effet de bord acceptable d'un message de couleurs.
12. **Les mesures portent par défaut sur 5 classes** (`exigences.classesMax` = 5 pour `atlas` comme pour `contraste-eleve`) : c'est le nombre de classes conseillé en cartographie et celui où chaque palette par défaut est « nette » ou « admise » ; l'hôte qui en veut 7 le dit, et les palettes qui n'y tiennent pas sont signalées.
13. **Dépendances** : les calculs de couleur communs vivent dans `lib/charte/couleurs.js` ; `lib/bi/echelles.js` les réexporte, `lib/bi/fond-plan.js` réexporte `planMonochrome` (devenu une règle de dérivation). Une seule définition, aucune duplication.
14. **Divergente de 3 couleurs ou plus en nombre impair parcourue de bout en bout** dans `choroplethe.js` : sans cela, la divergente à 7 couleurs d'Atlas retomberait sur le rouge-bleu du module dès que le nombre de classes diffère de 7. Pour 3 couleurs, le résultat est identique à l'ancien.

## 9. Ce qui n'est pas dans cette version

- **Chargement d'une charte par adresse** (URL, fichier distant) : volontairement absent, voir le choix 5.
- **Polices distantes** et piles libres : voir le choix 6.
- **Mode sombre d'interface** : la charte décrit des couleurs de **données et de carte** ; l'interface d'Atlas reste claire (`color-scheme: light`). Une charte à fond sombre fonctionne pour la carte (exemple `sombre.json`).
- **Interface de sélection et d'édition des palettes** dans l'éditeur de style : le registre et ses alias existent, l'éditeur (`app_v7.js`) lit toujours ses huit palettes d'origine et crée toujours ses nouvelles couches avec `Tableau10` et `Viridis`. Brancher l'éditeur sur le registre (lot 2b) demande d'abord que `scripts/promote-atlas.js` copie `lib/charte/` pour `app.js` : le contrôle d'imports de ce script ne lit que `./lib/<nom>.js`.
- **Divergentes par nombre de classes exact** (un jeu par n, comme une étude préalable le proposait) : la divergente à 7 couleurs est parcourue de bout en bout.
- **Charte et palettes personnalisées dans un manifeste produit par l'éditeur d'Atlas** : le composant BI lit `charte` à la racine du manifeste et `style.charte` d'une couche ; l'éditeur ne les écrit pas encore (export des palettes personnalisées par valeur à brancher).

## 10. Mise en ligne : à faire avant toute promotion

`lib/bi/` importe `lib/charte/`. `scripts/promote-atlas.js` copie `lib/*.js` et `lib/bi/` mais pas les autres sous-dossiers : **tant qu'il ne copie pas `lib/charte/`** (modules `.js` et `charte.schema.json`, avec le même contrôle des imports relatifs que pour `lib/bi/`), la promotion échoue bruyamment (`tests/bi-promotion.test.js`, 2 tests rouges) plutôt que de publier un composant cassé. Le correctif est un bloc symétrique à celui de `lib/bi/`, à poser dans `scripts/promote-atlas.js` avant le bloc « composant carte BI » (vérifié hors dépôt : avec lui, les deux tests de promotion passent) :

```js
const charteSrc = path.join(libSrc, 'charte'), chartePub = path.join(libPub, 'charte');
let modulesCharte = 0;
if (fs.existsSync(charteSrc)) {
  fs.mkdirSync(chartePub, { recursive: true });
  for (const f of fs.readdirSync(charteSrc)) {
    if (f.endsWith('.js')) fs.writeFileSync(path.join(chartePub, f), normaliserVersions(fs.readFileSync(path.join(charteSrc, f), 'utf8')));
    else if (f.endsWith('.json')) fs.copyFileSync(path.join(charteSrc, f), path.join(chartePub, f));
    else continue;
    modulesCharte++;
  }
  for (const f of fs.readdirSync(chartePub)) {
    if (!f.endsWith('.js')) continue;
    for (const m of fs.readFileSync(path.join(chartePub, f), 'utf8').matchAll(/from\s+'(\.{1,2}\/[^']+?\.js)(?:\?[^']*)?'/g)) {
      if (!fs.existsSync(path.join(chartePub, m[1]))) { console.error(`Echec : lib/charte/${f} importe ${m[1]}, absent de la copie publiee`); process.exit(1); }
    }
  }
}
```
