# Polices de carte embarquées

Les étiquettes que le composant ajoute à la carte (`visuel.etiquette`, marqueurs avec texte) demandent à MapLibre des **fichiers de glyphes** (`.pbf`, par tranches de 256 caractères). Avec un fond de carte qui n'en fournit pas (`base="aucune"`, fond de repli hors réseau), ces fichiers viennent d'ici, de la copie d'Atlas elle-même : aucune requête vers un autre serveur.

**Pourquoi c'est embarqué.** Quand ces fichiers sont inaccessibles, MapLibre ne dessine plus la couche entière : les points disparaissent avec leurs étiquettes, sans erreur (mesuré le 02/11/2026). Les demander à un serveur de démonstration était donc une dépendance qui supprimait des données à l'écran dès qu'on coupait le réseau ou qu'une politique de sécurité de contenu l'interdisait.

## Contenu

| Fichier | Caractères | Sert à |
|---|---|---|
| `Noto Sans Regular/0-255.pbf` | U+0000 à U+00FF (latin de base et latin-1 : é è ê ô ç ï î ë É Î…) | tous les noms des données embarquées (pays, régions, départements) |
| `Noto Sans Regular/256-511.pbf` | U+0100 à U+01FF (latin étendu A : œ Œ, voyelles à macron…) | le français courant (« Cœur »), les langues voisines |
| `Noto Sans Regular/8192-8447.pbf` | U+2000 à U+20FF (ponctuation générale : ’ – … «») | l'apostrophe typographique et les tirets |

`verrou.json` donne la taille et l'empreinte SHA-384 de chaque fichier ; un test les vérifie.

## Limites

- **Une seule police, un seul style** (Regular), **latin seulement**. Un texte qui sort des trois plages (l'ʻokina des noms polynésiens, le grec, le cyrillique, l'arabe, les caractères chinois…) demande des fichiers que cette copie n'a pas. Le composant le **détecte avant d'ajouter le texte** (il vérifie les plages que les valeurs affichées exigent), monte la couche **sans étiquettes** et le dit (`_avertissements` de `setScene`, événement `error` code `police`, niveau `avertissement`) : sans cette précaution, MapLibre ne dessinerait pas la couche du tout (mesuré). Pour afficher ce texte, il faut fournir ses propres glyphes (voir la feuille de route, lot 3).
- **La charte de l'hôte ne fixe pas la police de la carte** : `policeSymboles` y est ignorée. Seuls interviennent la police d'étiquettes du fond de plan s'il en a une (fond par défaut, Plan IGN) et, sinon, Noto Sans Regular.
- Les fonds qui apportent leurs propres polices (fond par défaut OpenFreeMap, plan IGN) ne passent pas par ce dossier.

## Licence et origine

Les fichiers `.pbf` sont les glyphes de la police **Noto Sans** tels que les sert OpenFreeMap (origine de chaque fichier dans `verrou.json`). Ce fournisseur les fabrique avec les outils d'OpenMapTiles, dont le dépôt de polices dit que « toutes les polices sont sous licence OFL ou Apache » sans préciser laquelle s'applique à chaque fichier. Les deux licences permettent la redistribution à condition de joindre leur texte ; **les deux sont donc jointes** :

- `LICENCE-OFL.txt` : SIL Open Font License 1.1, copiée du dépôt `notofonts/latin-greek-cyrillic` (copyright « 2022 The Noto Project Authors »). Aucun nom réservé n'y est déclaré ;
- `LICENCE-APACHE-2.0.txt` : Apache License 2.0, copiée du site de la fondation Apache.

Le nom de pile écrit dans les fichiers est une **composition** (Noto Sans en tête, puis des polices Noto d'autres alphabets : liste dans `verrou.json`). Les trois plages embarquées ne contiennent que du latin et de la ponctuation, que Noto Sans couvre.

**Non vérifié** : laquelle des deux licences s'applique au fichier exact, et la liste des copyrights des polices composées. Si cette précision devient nécessaire (redistribution commerciale, audit), la lever à la source ou fabriquer les glyphes soi-même depuis les fichiers de police du dépôt `notofonts`, ce qui donne une provenance unique.

## Régénérer ou étendre

Télécharger la tranche voulue : `https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/<début>-<fin>.pbf`, la placer dans `Noto Sans Regular/`, ajouter son entrée à `verrou.json` (taille, SHA-384) et à `DOSSIERS` si un nouveau dossier est créé (`scripts/paquet-atlas-bi.js`). Pour un autre alphabet, comparer d'abord la taille : une tranche de caractères chinois pèse plusieurs centaines de Ko.
