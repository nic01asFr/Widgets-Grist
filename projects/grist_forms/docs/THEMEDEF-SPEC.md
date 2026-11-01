# ThemeDef 1.0 — spécification de l'étage B (BROUILLON pour relecture)

Statut : **brouillon**, rien n'est publié ni décidé. Rédigé par le porteur de grist_forms à la demande du
kit d'applications et d'Atlas-BI, pour être confronté à l'étude 57 du kit. Il décrit ce que **lit** un
consommateur ; la façon de **produire** un thème (compilateur, éditeur) est l'affaire du kit.

Relation entre les étages :

| Étage | Contrat | Nature | Qui le lit |
|---|---|---|---|
| A | `kit-theme/0.1` | **sortie compilée** : 26 variables `--kit-*`, valeurs posées | grist_forms (`shared/theme.js`), tout hôte |
| B | `themedef-1.0` | **document éditable** : graines, modes, surcharges, exigences, `resolu` mesuré | l'hôte (kit, Atlas, referentiels), pas le moteur de formulaire |

Le moteur de formulaire ne lit jamais un ThemeDef : l'hôte le lit, le résout, et passe à `monter({ theme })` un
objet de l'étage A. C'est ce qui garde le moteur sans table, sans adresse et sans compilateur.

## 1. Les noms lus (étage A, figés)

26 variables, nues ou préfixées `--kit-` : `fond`, `surface`, `surface-2`, `texte`, `texte-2`, `bord`,
`bord-champ`, `accent`, `accent-texte`, `accent-fond`, `action`, `action-texte`, `action-survol`,
`action-actif`, `focus`, `ok`, `ok-fond`, `attention`, `attention-fond`, `attention-filet`, `alerte`,
`alerte-fond`, `info`, `info-fond`, `papier`, `ombre`.

Vocabulaire des états : `alerte` = rouge, erreur ; `attention` = orange, avertissement ; `ok` = réussi ;
`info` = information. Atlas lit en particulier `accent`, `fond`, `texte`, `texte-2`, `surface` et les quatre
états avec leur `-fond`.

**Les valeurs sont données PAR MODE.** Un thème n'a pas de valeur « neutre » : il porte une table pour
`clair` et une pour `sombre` (le mode `auto` n'est pas émis ; l'hôte choisit selon `prefers-color-scheme`
ou son propre réglage). Les deux tables portent exactement les 26 clés.

### Le fichier du générateur : `kit-theme-fichier/0.1`

Le fichier du générateur du kit (`theme-formulaire.<paquet>.<mode>.json`) est une **enveloppe PAR MODE** (une par
paquet et par mode), à ne pas confondre avec le `resolu` d'un ThemeDef, qui porte les DEUX modes :

```
fichier = { version, paquet, mode, police, valeurs, contrastes, portes, derive, corrections, informatif, empreinte }
```

- Le thème à passer à `monter` est son champ `valeurs` (objet plat de 26 entrées). Passer l'enveloppe entière rend
  11 clés « inconnues » et ne pose rien ; ce n'est pas une panne du moteur. Mesuré le 18/10/2026 : les `valeurs`
  des quatre fichiers (neutre/grist × clair/sombre) sont retenues à 26/26, sans rejet.
- `empreinte` (anciennement `resolu`, qui était une simple chaîne) = hash de `{ mode, police, valeurs }` en JSON
  canonique. Le nom `resolu` est réservé à l'objet du ThemeDef (§4). Le `resolu.hash` d'un ThemeDef (hash de
  `{ modes, police }`) se déduit des deux fichiers de mode.
- `derive` est un **tableau trié** des clés dérivées (ex. `["action-actif"]`), pas une carte booléenne.
- Le manifeste `kit-theme-0.1.manifest.json` porte `cles` (26, triées), `fichiers` (empreintes `sha256-<base64>`),
  `hashListe`, `hashCorrespondance`, `hashPolice`, `hashPortes` et `version` : c'est lui que lit un test de dérive.

### Vocabulaire des états : correspondance noir sur blanc

| Kit (`kit-theme/0.1`, graines d'état en 1.0) | Atlas | Sens |
|---|---|---|
| `ok` | `succes` | réussi |
| `attention` (orange) | `alerte` | avertissement |
| `alerte` (rouge) | `erreur` | erreur |
| `info` | `information` | information |

Piège : le mot « alerte » désigne le rouge côté kit et l'orange côté Atlas. En 1.0 le ThemeDef emploie les noms du kit.

## 2. Forme du document

```json
{
  "version": "themedef-1.0",
  "nom": "Mon thème",
  "graines": { "principal": "#3D4F63" },
  "police": "systeme",
  "modes": { "sombre": "derive" },
  "surcharges": { "clair": { "bord-champ": "#6B6B6B" }, "sombre": {} },
  "exigences": { "contrasteTexte": 4.5, "contrasteComposant": 3 },
  "resolu": { }
}
```

| Champ | Obligatoire | Règle |
|---|---|---|
| `version` | oui | `themedef-1.0` ; toute autre valeur est refusée |
| `nom` | non | texte libre ≤ 80 caractères, jamais interprété |
| `graines.principal` | oui | `#RRGGBB` |
| `graines.secondaire`, `.encre`, `.fond` | non | `#RRGGBB` ; dérivées sinon |
| `graines.ok`, `.attention`, `.alerte`, `.info` | non | acceptées, **ignorées avec avertissement** tant que le compilateur ne rend pas les états surchargeables (étude 57, D3) |
| `police` | non | `systeme` (défaut) · `sans` · `serif` · `mono` · `lisible`. **Un mot-clé, jamais un nom de police ni une adresse** ; chaque hôte traduit le mot dans sa pile |
| `modes.sombre` | non | `derive` (défaut) · `explicite` · `aucun` ; `explicite` exige `surcharges.sombre` complet |
| `surcharges.<mode>` | non | sous-ensemble des 26 clés, valeurs de l'étage A (hex, rgb/hsl numériques, `var(--nom)` sans repli, ≤ 48 car.) ; appliquées **après** compilation |
| `exigences` | non | ne peut que **renforcer** les seuils du compilateur (texte ≥ 4,5 ; composant ≥ 3) ; un seuil plus lâche est refusé |
| `resolu` | non | calculé par le compilateur, **jamais lu comme une vérité** (§4) |

`exigences` ne renforce que les portes d'**interface** (`contrasteTexte`, `contrasteComposant`). Les exigences de
**visualisation** d'Atlas (`contrasteMinimal`, `ecartMinimal`, `classesMax`) sont **hors ThemeDef 1.0**.

Tailles : document ≤ 16 Ko **en octets UTF-8**, profondeur ≤ 6, aucune clé `__proto__` / `constructor` / `prototype`. Toute clé
inconnue est signalée, jamais interprétée.

**Arbitrage du 31/10/2026** (points soulevés par le kit à la livraison de TD-1) :

- **Valeur de surcharge : 48 caractères au plus** (l'étude 57 disait 64 : 48 retenu, c'est aussi la limite du juge du moteur).
- **Profondeur : le niveau 1 est la racine, et chaque valeur compte un niveau, feuilles comprises** (comme Atlas). Passé le sixième
  niveau, le document est refusé.
- **Graines : `#RRGGBB` strict.** `#abc` est refusé (la spec l'a toujours dit) ; un lecteur qui l'acceptait s'aligne.
- **Forme canonique** : un LF final qui entre dans l'empreinte ; le producteur du document ARRONDIT les contrastes à 2 décimales
  (le canonicaliseur n'arrondit rien : il est une fonction pure des valeurs) ; l'empreinte est celle du document **sans `resolu` ni
  champ `hash`** (un document n'entre pas lui-même dans son empreinte).
- **Refus ou valeur écartée** — *refusés* : version, taille, type, profondeur, clé interdite, section qui n'est pas un objet,
  `principal` absent ou mal écrit, mode sombre hors liste, mode sombre explicite sans ses 26 valeurs, exigence plus lâche que
  4,5 / 3. *Écartées et dites* : clé inconnue, surcharge refusée, police hors liste, graine facultative mal écrite, `resolu`.

**Hors ThemeDef** : le halo, le lavis et le plan de carte d'Atlas ne sont **pas** des champs du ThemeDef. Atlas les
calcule par défaut à partir des variables lues. Même chose pour les rampes de visualisation, les rayons, les
tailles de texte et les cibles tactiles : ils restent aux paquets du kit ou aux hôtes.

## 3. Où il vit et comment il se lit

Table `Theme_document` du document Grist :

| Colonne | Type | Règle |
|---|---|---|
| `cle` | Texte | `^[a-z][a-z0-9-]{0,39}$`, une ligne par thème |
| `themedef` | Texte | JSON sérialisé, ≤ 16 Ko |
| `actif` | Booléen | au plus UNE ligne vraie |
| `maj` | Numérique | **secondes** Unix ; informatif, aucune confiance |
| `version` | Texte | `themedef-1.0` |
| `hash` | Texte | empreinte du document **hors `resolu`** (§4) |

**Règle de lecture** (la même pour tous les lecteurs) :

1. Table absente ou vide : **aucun thème**, rendu d'origine, **aucune écriture** (un lecteur ne crée jamais la table).
2. Aucune ligne active : rien n'est appliqué, sans bruit.
3. **Plusieurs lignes actives : rien n'est appliqué** et l'avertissement `plusieurs-actifs` est émis.
4. Au plus 50 lignes examinées ; le contenu est une **donnée non fiable** : taille, version, profondeur, clés et
   valeurs vérifiées à chaque lecture, `resolu` ignoré.
5. Un document invalide n'applique rien et dit pourquoi ; un document partiellement valide applique ce que la
   liste fermée de l'étage A accepte et signale le reste (`ignore`).
6. Un seul écrivain recommandé (l'éditeur « Apparence » du kit) ; la protection d'écriture est une règle d'accès
   Grist, pas un contrôle du lecteur.

Hors Grist, le thème est figé à la publication (copie du JSON `valeurs`) ou **tiré par l'hôte**
(JSON, jamais du CSS ; adresse fixée par l'hôte avec empreinte SHA-256 épinglée ; liste d'origines ; dernier
thème valide gardé ; échec = rendu neutre). Atlas n'accepte aucune adresse dans son composant.

Priorité : la personne (`forced-colors`, `prefers-contrast`) > thème posé par l'hôte > document > rendu d'origine.

### Les lecteurs de Form Builder

Le moteur de formulaire ne lit toujours pas de ThemeDef : ce sont ses **hôtes** qui le font, avec `shared/themedef.js` (règle de lecture
du §3, la même que celle d'Atlas) :

- le **formulaire publié** (bundle figé) : lit `Theme_document`, pose les variables `--kit-*` sur la page, puis se monte ; au bout de 1,5 s
  sans réponse il s'ouvre avec son apparence d'origine ;
- le **compositeur** : habille son canevas et son aperçu (ce que le public verra), pas l'outil lui-même ;
- la page **design-system** : applique le thème en cours de construction (aperçu).

**Un ThemeDef en entrée du formulaire.** Le FormDef porte une `apparence` facultative : `{ mode, themedef }`.

| `mode` | Ce que le formulaire prend |
|---|---|
| `document` (défaut) | le thème actif de `Theme_document`, quand le document en porte un |
| `formulaire` | le ThemeDef 1.0 donné dans `themedef` (déposé ou collé dans le compositeur) : **il part avec le formulaire**, donc il s'applique aussi hors de Grist (page autonome), sans table à lire |
| `aucune` | l'apparence d'origine, quoi que dise le document |

Le thème du formulaire prime sur celui du document. Il est lu comme une donnée non fiable à chaque ouverture ; illisible, il n'empêche
rien : le formulaire retombe sur le document, et le compositeur dit pourquoi. Dans la page autonome, un formulaire qui suit le document
reçoit une **copie** du ThemeDef actif au moment de la génération (jamais une adresse).

**Le compositeur lui-même est un lecteur.** L'outil (pas seulement les formulaires qu'il produit) suit le thème actif du document : toutes ses couleurs passent par `var(--kit-*, valeur d'origine)`, donc sans thème rien ne change. Menu « ⋯ » : « Suivre le thème du document » (retenu dans le navigateur, jamais écrit dans le document) et « Essayer un thème (fichier ThemeDef) » le temps d'une session. Comme tout lecteur, il cède à la préférence de la personne (contraste forcé ou renforcé) et dérive le sombre.

Chaque lecteur est **opt-in par le document** (sans table `Theme_document`, ou sans ligne active, rien ne change) et **ne crée ni n'écrit
jamais** la table. Les valeurs mesurées de `resolu` s'appliquent quand elles y sont, sans être crues ; sinon les graines en donnent un
**aperçu** (le compilateur du kit reste seul juge). La personne passe avant le thème : sous `forced-colors` ou `prefers-contrast: more`,
rien n'est posé. Les formulaires déjà publiés (bundles figés avant ce lecteur) ne changent pas tant qu'on ne les remet pas en ligne.

## 4. Forme canonique, `hash` et `resolu`

**JSON canonique** (unique pour tout le contrat) : UTF-8, **un seul LF final**, clés triées récursivement par
ordre d'unités de code, aucun espace hors des chaînes, nombres décimaux sans zéros inutiles, contrastes
arrondis à 2 décimales. L'empreinte s'écrit `sha256-<base64>` (même convention que le manifeste du kit).

- `hash` (colonne et document) = empreinte du JSON canonique du document **sans** `resolu`. Il sert à détecter
  une édition manuelle, pas à authentifier.
- `resolu` est le résultat mesuré d'une compilation :

```json
{
  "version": "kit-theme/0.1",
  "modes": {
    "clair":  { "valeurs": { "…26 clés…": "#RRGGBB" }, "derive": ["action-actif"] },  // derive : tableau trié
    "sombre": { "valeurs": { "…26 clés…": "#RRGGBB" }, "derive": ["action-actif"] }
  },
  "police": "systeme",
  "mesures": { "clair": { "texte-sur-fond": 14.92 }, "sombre": { "texte-sur-fond": 12.4 } },
  "echecs": [],
  "visualisation": "non garantie",
  "hash": "sha256-…"
}
```

`resolu.hash` = empreinte du JSON canonique de `{ modes, police }` : deux documents qui résolvent aux mêmes
valeurs ont le même `resolu.hash`, quelle que soit la façon dont ils y arrivent. C'est lui qu'un hôte compare pour
savoir si le thème a changé.

**Un lecteur ne croit jamais `resolu`.** Il le recalcule ou, ne pouvant pas, applique les valeurs en
affichant `non-verifie` (cas du moteur de formulaire). Les portes de visualisation produisent un avertissement et
`visualisation: "non garantie"`, jamais un refus d'interface (étude 57, D4).

## 5. Conformité

Les **vecteurs de conformité** sont ceux du kit (`kit-theme-0.1.vecteurs.json` : les 26 valeurs, les contrastes
mesurés et la police, par paquet public et par mode), avec le manifeste (liste triée des 26 clés, hash de la
table de correspondance, empreinte de chaque fichier). Tout lecteur doit :

- accepter 26/26 valeurs de chacun des quatre fichiers publics ;
- refuser sans exception `url()`, `calc()`, `color-mix()`, un repli dans `var()`, un nom de couleur, `;`, `}`,
  une valeur de plus de 48 caractères ;
- ignorer les clés hors liste et le dire ; ne jamais corriger une valeur ;
- appliquer la règle de lecture du §3 (table absente, vide, plusieurs actifs).

Mesures du kit à connaître : `bord` est décoratif (1,36 à 1,71:1 sur la surface, informatif seulement) ; le
bord d'un champ est `bord-champ` (4,54:1 en clair, 5,36:1 en sombre) ; `action-actif` est **dérivé**
(`derive: true`), les 25 autres viennent de jetons ; aucune paire ne tombe sous son seuil sur les paquets publics.

## 6. Ce qui reste ouvert

- Le comportement réel dans Grist : atomicité d'un lot « désactiver l'ancien, activer le nouveau », lecture d'une
  autre table en accès « read table », taille maximale d'une cellule (non mesurés).
- Le CORS d'un fichier de thème tiré depuis une page tierce, et `crypto.subtle` hors contexte sécurisé (non mesurés ;
  Atlas les mesure pendant sa traduction).
- Qui versionne le schéma `themedef-1.0` : le kit (il porte le compilateur) ; grist_forms et Atlas le consomment
  par empreinte. À confirmer.
- Le nom de l'enveloppe de fichier du générateur (`valeurs` + mesures) : je propose de la nommer
  (`kit-theme-fichier/0.1`) pour que les lecteurs ne prennent pas l'enveloppe pour le thème.
- Le mode à contraste élevé (7:1), cadré par le kit, hors de cette version.
