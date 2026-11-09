# Cadrage — entrées mobiles dans le FormDef (voix, photo, position, scan) et contrat d'hôte

*08/11/2026. Cadrage à valider avant tout code. Il part d'une demande de l'offre de service (saisie terrain : GPS, photo, voix, extraction par modèle de langage, sans widget autonome) et la traite comme ce qu'elle est : une évolution du **FormDef**, brique commune à Form Builder, Atlas, qgis2grist, au kit déclaratif et aux agents. Ce qui se produit ici doit pouvoir être réemployé tel quel par les autres.*

*S'appuie sur `CATALOGUE-SAISIES.md` (ce qui existe), `ETUDE-MODES-ET-ACCES.md` (modes et hébergements), `ENVOI-EXTERNE.md` (limites hors Grist), `projects/Atlas/docs/CADRAGE-APPLICATION-TERRAIN.md` (hôte Atlas), `projects/terrain/ARCHITECTURE.md` (socle terrain) et `WIDGETS-AUTO-DESCRIPTIFS.md` (registre de commandes). Rien n'est codé ni publié.*

---

## 0. En une page

**Le besoin.** Remplir un formulaire sur le terrain avec ce que le téléphone sait faire : parler (dictée, puis extraction de champs par un modèle de langage), photographier, se positionner, scanner un code. La personne garde la main : rien n'est écrit sans sa validation.

**Le constat.** La moitié existe déjà. La photo (`capture="environment"`), la position (« Utiliser ma position », avec la précision), le dessin et la signature sont livrés. Manquent la **voix** (dictée, enregistrement audio), le **scan de code**, la vidéo, le cap, et surtout trois choses transverses : un moyen pour un champ de **dire ce dont il a besoin**, un moyen pour un hôte de **dire ce qu'il sait fournir**, et un **repli** quand il ne le sait pas.

**La proposition, en quatre idées.**

1. **Le FormDef décrit le geste, jamais l'appareil ni le service.** Il dit « ce champ se remplit en parlant » et « voici la consigne d'extraction ». Il ne contient ni clé, ni adresse, ni nom de modèle.
2. **Un contrat d'hôte, nouveau et réutilisable** (`hote-capacites-0.1`) : l'hôte (page Grist, page hors Grist, PWA, application Atlas) déclare ses capacités d'appareil et ses services. Le moteur lit ce contrat ; il ne devine rien.
3. **Le repli est le type Grist.** Un champ dont la capacité manque retombe sur le widget de son type (zone de texte, fichier). Aucun formulaire existant ne change : tout est facultatif et opt-in.
4. **Une valeur proposée par un modèle est une suggestion**, montrée, corrigeable, validée avant l'envoi. Elle ne s'écrit jamais seule.

**Ce que ça touche.** Contrat FormDef (additif, reste 1.0), moteur, compositeur, mode hors Grist, registre auto-descriptif, catalogue, tests. Pas la publication existante : les formulaires déjà publiés restent figés jusqu'à leur prochaine remise en ligne.

**Ce qu'il faut décider avant de coder** : voir §11 (huit décisions, avec ma recommandation).

---

## 1. Ce qui existe, mesuré dans le code

| Saisie | État | Où |
|---|---|---|
| Photo sur place | **livré** : sur appareil tactile, un champ qui accepte les images propose l'appareil photo arrière (`capture="environment"`) | `runtime/engine.js` (~l.1519-1549) |
| Fichiers, `accept`, `maxFiles` | livré | widget `file` |
| Dessin, signature | livré | widget `dessin` |
| Position du navigateur | **livré** : bouton « Utiliser ma position » → point WKT | widget `geo` |
| Précision du GPS | livré : `options.precisionCol` (mètres) | `geo` |
| Dictée vocale | **absent** | catalogue §3.1 |
| Enregistrement audio | **absent** | catalogue §3.6 |
| Scan de code (QR, code-barres) | **absent** | catalogue §4 |
| Vidéo, scan de document, NFC, cap/boussole | **absent** | catalogue §3.6, §3.7, §4 |
| File hors ligne des écritures | **absente** côté Form Builder : le pont écrit en direct (`tailleFile() = 0`) | `shared/client-contrat.js` |

Deux précédents à reprendre plutôt que refaire :

- **Terrain Voix** (application mobile du dépôt Grist-AppStore, pendant bureau `projects/terrain-observations`) : reconnaissance vocale par morceaux de 10 s, parcours *visite → audio → texte → validation*, deux colonnes (`transcription_brute` = ce qui a été dit, `commentaire_structure` = ce qu'on en a tiré). C'est exactement le motif « voix → suggestion → validation ».
- **QField** (qgis2grist) : les formulaires de relevé de terrain sont déjà extraits en FormDef ; ses widgets (ressource externe/photo, position, scan) donnent la table de correspondance à garder cohérente (§8).

---

## 2. Principes

1. **Additif et opt-in.** Règle déjà tenue par Form Builder (formulaires existants intacts). Aucune clé obligatoire nouvelle ; un moteur ancien ignore ce qu'il ne connaît pas.
2. **Le contrat dit quoi, l'hôte dit comment.** Même séparation que le thème (ThemeDef décrit, l'hôte applique) et que `client-contrat.js` (le socle de données).
3. **Repli par construction.** Un widget inconnu retombe sur celui du type Grist : c'est déjà écrit dans le schéma. On s'y appuie ; on ne crée pas de second mécanisme de repli.
4. **Aucun secret dans un contrat ni dans une page publique.** Clés, URL d'instance, adresses de service, noms de modèle : côté hôte, saisis par la personne, stockés dans le coffre de l'hôte (jamais en clair dans une page publiée ni dans un dépôt).
5. **La personne valide.** Toute valeur issue d'un modèle est une proposition ; l'écriture suit la validation, comme pour les valeurs de départ (« une valeur de départ n'est pas une valeur reçue »).
6. **Un seul registre à enrichir, pas cinq.** Le catalogue relève que la liste des saisies est recopiée dans le compositeur, le moteur, la projection de colonnes, le mode externe et le schéma, protégée par `tests/contrat.test.js`. Chaque ajout suit « le même geste » (entrée de registre, test de conformité, ligne du catalogue) ; on en profite pour ne pas aggraver la dispersion (§6).
7. **Mesurer avant de promettre.** Ce qui dépend d'un navigateur ou d'une iframe est une *mesure à faire* (§9), pas une hypothèse écrite comme un fait.

---

## 3. Le modèle : saisie, capacité, service, repli

```
champ du FormDef ──a besoin de──▶ capacité (d'appareil)      ──fournie par──▶ hôte
        │                            camera, micro, position,                    (contrat hote-capacites)
        │                            orientation, scanner
        │──peut déclencher──▶ service (de l'hôte)             ──fourni par──▶ hôte
        │                            transcrire, extraire
        └──si l'hôte ne sait pas──▶ repli = widget du type Grist (texte / fichier)
```

**Capacités d'appareil** (vocabulaire fermé, ce que le matériel et le navigateur donnent) : `camera`, `micro`, `position`, `orientation` (cap), `scanner` (codes).
**Services d'hôte** (ce que l'hôte appelle pour le compte du moteur) : `transcrire` (audio → texte), `extraire` (texte + consigne + champs visés → valeurs proposées).

Différence qui compte : une capacité est **locale et sans donnée sortante**. Un service **envoie des données ailleurs** (transcription, modèle) : l'hôte doit le dire à la personne et elle doit pouvoir s'en passer (le repli est la saisie au clavier).

---

## 4. Évolution du contrat FormDef (reste `formdef-1.0`, additif)

### 4.1 Nouvelles saisies

| Widget | Type Grist | Écrit | Capacité | Service | Repli (sans la capacité) |
|---|---|---|---|---|---|
| `voix` | Text | le texte dicté (la personne le corrige) | `micro` | `transcrire` (si l'hôte n'en a pas : enregistrement seul, voir `audio`) | `textarea` |
| `audio` | Attachments | un enregistrement | `micro` | — | `file` (`accept="audio/*"`) |
| `scan` | Text | le code lu | `scanner` (ou `camera`) | — | `text` |
| `photo` | Attachments | une ou plusieurs photos | `camera` | — | `file` (c'est déjà le comportement avec `capture`) |

*Remarque sur `photo`.* L'appareil photo est déjà livré sous `file`. Introduire `photo` n'ajoute pas un geste mais **un usage déclaré** (comme `dessin` se distingue de `file` : « l'usage déclaré les distingue », cf. catalogue §6.8). Intérêt : le compositeur propose « Photo » et sait ce qu'il fait ; le moteur peut imposer la caméra, la compression, l'orientation. Recommandation : oui, comme alias riche de `file`, sans casser `file`.

La **position** n'a pas besoin d'un nouveau widget : c'est `geo` + « Utiliser ma position ». On lui ajoute seulement une déclaration de capacité (`position`) et, plus tard, `options.capCol` (cap en degrés, colonne annexe, vide si absent), sur le modèle de `precisionCol`.

### 4.2 Nouvelles options (sac `options`, déclarées au schéma)

```json
{
  "colId": "constat",
  "label": "Constat dicté",
  "type": "Text",
  "widget": "voix",
  "options": {
    "capacite": "micro",
    "extraction": {
      "consigne": "Relève le lieu, la nature du désordre et l'urgence à partir du texte dicté.",
      "champs": ["lieu", "nature", "urgence"]
    }
  }
}
```

| Option | Rôle |
|---|---|
| `options.capacite` | la capacité d'appareil dont le champ a besoin (liste fermée du §3). Absente : déduite du widget. |
| `options.extraction.consigne` | le prompt, **texte** : il dit quoi chercher, pas où l'envoyer |
| `options.extraction.champs` | les `colId` du formulaire qui peuvent recevoir une proposition |
| `options.capCol` (plus tard) | colonne annexe pour le cap |

**Consigne par formulaire ou par champ ?** Les deux sont utiles : la consigne d'un formulaire (« tu relèves une visite d'ouvrage ») cadre toutes les dictées ; celle d'un champ la précise. Recommandation : `extraction` posée sur le champ `voix`, avec une valeur par défaut au niveau du formulaire (`def.extraction.consigne`) que le champ surcharge. Un formulaire sans champ `voix` ignore `def.extraction`.

### 4.3 Ce que le FormDef ne contiendra jamais

Clé d'API, adresse d'instance ou de service, nom de modèle, jeton, identifiant de document. Raison : le FormDef est publié, copié, vendoré (Atlas en embarque une copie), lu par des agents. Un test de contrat le garantit : il refuse toute clé de ce genre dans les options.

### 4.4 Compatibilité

- `formdef-1.0` reste valide : champs et options facultatifs. Pas de `formdef-1.1` tant qu'on ne casse rien (règle du dépôt : ajouts opt-in seulement). Le test qui vérifie que le schéma publié accepte ce que le compositeur produit couvre les nouveaux cas.
- Un moteur ancien rencontre un widget inconnu → repli sur le type. Un formulaire publié figé garde son moteur figé.
- `kind` n'est pas utilisé : ces saisies ne changent pas les colonnes écrites (règle du catalogue §1 : ce qui change *comment on remplit* est un widget ; ce qui change *ce qui est écrit* est un kind).

---

## 5. Le contrat d'hôte : `hote-capacites-0.1` (nouveau, réutilisable)

C'est la brique la plus réemployable. Aujourd'hui, chaque hôte (page Grist, page hors Grist, Atlas) fait ses propres hypothèses sur le micro, la caméra, la position. Un contrat unique permet à n'importe quel futur hôte (PWA, application, widget d'un autre projet) de se raccorder sans toucher au moteur.

```js
FormEngine.mount(el, formdef, {
  client,                      // existant : contrat de données
  hote: {
    contrat: 'hote-capacites-0.1',
    nom: 'atlas-apk',          // informatif
    capacites: { camera: true, micro: true, position: true, orientation: false, scanner: true },
    services: {
      transcrire: {                                                                 // optionnel
        sortant: 'tiers',                                                           // 'local' | 'tiers' (sans adresse)
        appeler: async (audio, { langue, signal }) => ({ texte: '…' })
      },
      extraire: {                                                                   // optionnel
        sortant: 'tiers',
        appeler: async ({ texte, consigne, champs, schema }, { signal }) =>
                   ({ valeurs: { lieu: '…', nature: null }, anomalies: [] })        // null = non lu
      }
    },
    limites: { audioSecondes: 120, photoOctets: 10485760 }                         // optionnel
  }
});
```

*Révision du 08/11/2026 après relecture du kit (six remarques, toutes retenues).* Le contrat dit en plus : le **modèle d'erreur** des services, les **anomalies** rendues avec les valeurs, l'indicateur **`sortant`**, les **trois états** d'une capacité, et la règle **`null` contre `[]`.**

Règles :

- **Absent = rien.** Un hôte qui ne passe pas `hote` est un hôte sans capacité : tous les champs retombent sur leur repli. C'est le comportement d'aujourd'hui, donc la non-régression est gratuite.
- **Les services sont des fonctions que l'hôte fournit** ; le moteur ne connaît ni leur réseau ni leurs clés.
- **Un service dit s'il envoie des données ailleurs** : `sortant: 'local'` (rien ne quitte l'appareil) ou `'tiers'` (les données partent chez un tiers, sans en dire l'adresse). L'interface affiche l'avertissement du §7 d'après cet indicateur, elle ne le devine pas. Un service sans indicateur est traité comme `tiers`.
- **Un service échoue de façon typée**, jamais par une exception libre : `{ erreur: { genre, message, statut?, reessayerApres? } }`. `statut` est le code HTTP du service quand il y en a un ; `reessayerApres` est en secondes, quand le service le dit. **Aucun message ne porte de clé, de jeton ni d'adresse.** Même vocabulaire que l'extraction de documents du kit (*une seule façon de dire une erreur de service dans l'écosystème*) ; convenu avec l'agent appkit le 08/11/2026, **codé et testé côté kit contre les vecteurs du moteur, aucun genre ne change** (signal du 08/11/2026) ; le vocabulaire peut être figé dans `hote-capacites-0.1`. Le chantier d'extraction du kit n'est pas publié : si le kit ajoute ou change un genre, il prévient avant que l'un ou l'autre fige son schéma.

  | Genre | Sens | Réessai |
  |---|---|---|
  | `reseau` | pas de réponse, coupure, 5xx | oui |
  | `droits` | 401, 403 | **jamais** (un droit retiré ne se contourne pas) |
  | `limite` | 429 | oui |
  | `delai` | aucune réponse dans le temps imparti (408, 504) | oui |
  | `forme` | requête refusée ou réponse mal formée (400, 413, 422, tout autre 4xx, dont 404 faute de genre à lui) | **jamais** |
  | `vide` | réponse bien formée (200) sans rien dedans | oui ; s'affiche « rien reconnu », pas comme une panne |
  | `annulee` | demande devenue inutile ou annulée par l'appelant | sans objet : ce n'est pas un échec |
- **Les valeurs rendues par `extraire` sont vérifiées par le moteur** contre le type et les choix du champ visé, puis **montrées comme suggestions** (§7). Une sortie de modèle est un contenu non fiable. **Rien n'est écarté en silence** : une valeur hors liste, non numérique ou hors du champ visé devient une **anomalie** `{ champ, valeur, raison }` montrée à la personne ; le service peut en rendre aussi. Forme commune avec le kit : `{ valeurs, anomalies }` ; une anomalie garde la **valeur brute illisible**, et un champ non lu vaut `null`, jamais « lu vide ».
- **`null` n'est pas `[]` ni `''`.** Une valeur que le service n'a pas lue vaut `null` (le champ reste à saisir) ; une valeur lue et vide est une valeur. Le moteur ne remplit jamais un champ avec `null`.
- **Une capacité a trois états, mais le contrat n'en promet qu'un.** `capacites.x = true` dit « disponible » ; la personne peut encore **refuser à l'exécution** (autorisation du navigateur). Un refus déclenche le repli exactement comme une capacité absente, et le champ ne le garde pas en mémoire d'une session à l'autre sans que la personne le décide.
- **Un seul nom par service.** `extraire` (texte + consigne + champs → valeurs) reste le nom côté hôte ; l'action d'extraction de **documents** du kit (document → propositions d'une déclaration versionnée) porte un autre nom côté kit. Les deux partagent le **format de sortie** `{ valeurs, anomalies }`.
- Le contrat est publié au **catalogue des contrats** (`published/schemas/index.json`) avec `produit_par` (hôtes) et `lu_par` (moteur, compositeur), comme FormDef, Conditions, Kit Theme, Scene Manifest.

**Qui implémente quoi.**

| Hôte | Capacités | Services | Remarque |
|---|---|---|---|
| Page dans Grist (iframe) | **aucune** de capteur (mesuré, §9.1) | aucun d'office | Grist ne délègue à l'iframe que `clipboard-write` : position et micro refusés, tout retombe sur le repli |
| Page hors Grist | oui (HTTPS, page de plein droit) | à la charge de la page | pièces jointes impossibles (limite connue) |
| PWA | oui | à la charge de la PWA | hébergement et coffre à décider |
| Application mobile (Atlas, TaskFlow ; Capacitor) | paquet partagé de plugins natifs (aujourd'hui **aucun plugin** dans l'application Atlas) | `CapacitorHttp` vers un point d'accès de l'équipe, **jeton révocable, aucune clé sur l'appareil** (D8 bis) | lot 5, go séparé de Nicolas |
| Agent (WebMCP, CLI, MCP) | aucune | aucun | un agent n'a pas de micro : il passe la valeur directement |

---

## 6. Impact sur Form Builder, module par module

| Module | Changement | Taille |
|---|---|---|
| `runtime/formdef.schema.json` + `published/schemas/` | widgets `voix`, `audio`, `scan`, `photo` ; options `capacite`, `extraction`, `def.extraction` ; la source et la copie publiée restent identiques hors `$id` (test existant) | petit |
| `shared/types.js`, `shared/saisies.js` | table widget → type Grist → capacité requise → repli ; bornes (durée, taille) | petit |
| `runtime/engine.js` | un rendu par saisie ; lecture de `hote` ; **repli** ; zone de suggestions avec valider/modifier/ignorer ; durée et taille maximales | **le gros du travail** |
| `shared/ensure-schema.js` | `voix` → Text, `audio`/`photo` → Attachments, `scan` → Text (aucune colonne en plus) | petit |
| `shared/externe.js` (mode hors Grist) | `audio` et `photo` impossibles (pas de pièces jointes) : le plan **refuse ou dégrade** et le dit ; `voix` et `scan` passent (texte) | moyen |
| `shared/ux.js` + `builder.html` (compositeur) | entrées de palette, pastille « demande le micro/la caméra », avertissement selon l'hôte visé, éditeur de la consigne, aperçu avec le repli (le micro ne s'essaie pas dans l'aperçu Grist) | moyen |
| `shared/synthese*.js` | afficher/compter photos et audios (aujourd'hui `pieces`) ; lire une dictée comme un verbatim | petit |
| `shared/acces.js`, `publish.js` | rien de nouveau ; vérifier que les colonnes Attachments sont déjà couvertes | nul à petit |
| `forms-registre/` | commande pure **`forms_besoins_hote`** : à partir d'un FormDef et d'un `hote` (ou de son nom), rend les champs qui manquent de capacité et leur repli ; mêmes données pour le compositeur et pour un agent. La fiche dit la limite (aucune capture ne se pilote par commande) | petit |
| `docs/CATALOGUE-SAISIES.md` | passer les lignes « absent » à « livré » ; ajouter §10 « capacités et hôtes » | petit |
| `tests/` | faux capteurs et faux services dans `helpers/fake-dom.js` ; tests de repli ; test « aucune clé dans le contrat » ; contrat publié accepte les nouveaux cas | moyen |

**Dette à ne pas aggraver (catalogue §6.7).** Quatre de ces modules recopient la liste des saisies. On n'ajoute pas une cinquième copie : la table « widget → type → capacité → repli » vit à **un** endroit (`saisies.js`, ou un petit registre dédié) et les autres la lisent. C'est un prérequis du lot 1, pas un embellissement.

**Compatibilité de ce qui est déjà publié.** Les formulaires publiés embarquent un moteur figé : ils ne changent pas. Seule une remise en ligne en prend un nouveau. Un formulaire publié avec un moteur ancien et un FormDef récent retombe sur les replis.

---

## 7. Parcours de la validation par la personne (voix → suggestions)

1. La personne appuie sur le micro (capacité `micro` présente) et parle ; ou colle/écrit le texte (repli).
2. Si l'hôte fournit `transcrire`, le texte apparaît dans le champ ; la personne le corrige. Sinon, l'enregistrement est gardé (`audio`) ou la saisie reste manuelle.
3. Si le champ a une `extraction` et que l'hôte fournit `extraire`, un bouton « Remplir les champs » appelle le service. La personne est prévenue que le texte part vers le service de l'hôte.
4. Les valeurs reviennent **vérifiées** (type, choix) et sont montrées **à côté de chaque champ visé**, sous forme de suggestion : *Utiliser / Modifier / Ignorer*. Aucun champ n'est rempli sans geste.
5. L'envoi du formulaire est le moment de l'écriture, comme aujourd'hui. Rien ne distingue dans la table une valeur suggérée d'une valeur tapée (comme pour les valeurs de départ). Option à décider : une colonne annexe `…_source` pour l'audit (§11, D6).

Garde-fous : durée audio plafonnée, taille de photo plafonnée (limite Grist de 10 Mo par pièce jointe), consigne limitée en longueur, sortie du modèle jamais interprétée comme du code ni du HTML (échappement déjà de règle dans le moteur), délai et annulation (`signal`).

---

## 8. L'écosystème : ce qui est réutilisable, par qui

Le FormDef est lu et produit par plusieurs briques. Ce cadrage est fait pour que **chacune en profite sans refaire**.

| Brique | Rapport au FormDef | Ce qu'elle gagne | Ce qu'elle doit faire |
|---|---|---|---|
| **Form Builder** (grist_forms) | produit et lit | les saisies, le repli, le compositeur | lots 1 à 4 |
| **Atlas** (fiche d'objet, pastille « Relevé », APK) | lit ; embarque une copie du moteur (`vendor/grist_forms`) | voix/photo/scan/position dans les relevés, avec ses plugins natifs | implémenter `hote` (plugins, coffre à clés, `transcrire`, `extraire`) ; re-vendorer le moteur |
| **qgis2grist** | produit un FormDef depuis QField | la table de correspondance : ressource externe/photo → `photo`, scan → `scan`, position → `geo` ; une couche QField devient un formulaire mobile | compléter l'extraction (à vérifier widget par widget dans QField) |
| **Kit déclaratif (appkit)** | grammaire de types logiques (douze) et passerelle `besoins/formulaires` | ces saisies sont des *gestes*, pas des types : les douze types ne changent pas ; la passerelle gagne un champ « geste/capacité » | étendre la passerelle, sans toucher à la grammaire de types |
| **Terrain / Terrain Voix** | application de saisie terrain, voix déjà prototypée | un formulaire standard au lieu d'un parcours codé en dur ; mêmes deux colonnes (brut, structuré) | à décider avec le projet terrain : consommer le moteur plutôt que dupliquer |
| **TaskFlow, autres widgets** | n'utilisent pas le FormDef aujourd'hui | une saisie mobile prête à intégrer s'ils veulent un formulaire | rien d'obligatoire |
| **Agents** (WebMCP, CLI, MCP) | lisent la fiche et les commandes | `forms_besoins_hote` : savoir ce qu'un formulaire demande à son hôte | rien |
| **Offre de service** | demandeur ; fournira des FormDef de relevé | un contrat sur lequel écrire ses relevés ; jeux d'essai réels | fournir les FormDef et la consigne d'extraction |

Trois livrables **réutilisables sans Form Builder** :

1. **`hote-capacites-0.1`** : un schéma publié, avec exemple et validateur ; n'importe quel hôte s'y raccorde.
2. **La table widget → capacité → repli** : un petit module sans dépendance (Node et navigateur), lu par le moteur, le compositeur, la commande de registre, et par Atlas s'il le souhaite.
3. **La commande `forms_besoins_hote`** : pure, testable, appelable par un agent et par les autres projets.

---

### 8.1 Deux rendus de FormDef : ce que dit appkit (09/11/2026, lu dans son code, rien essayé)

Il existe deux rendus de FormDef : le moteur de Form Builder (`runtime/engine.js`, une page) et le widget `formulaire` du kit d'appkit (modules `.mjs`, avec son thème, son accessibilité et sa file d'écriture). Trois options étaient posées pour les saisies mobiles : **A** une copie par rendu, **B** le widget d'appkit consomme mon moteur, **C** un noyau commun de saisies que chaque rendu appelle.

- **B est écartée côté appkit** : le moteur est une page, le rendu d'appkit a ses propres garanties.
- **A a un coût de dérive** : la sémantique des cascades et du référentiel existe déjà en deux copies, et trois saisies de plus, chacune avec ses genres d'échec et son repli, doubleraient la surface qui peut diverger.
- **C est la recommandation commune d'appkit et de Form Builder**, sous réserve de la décision de Nicolas. Un noyau **pur** (capture, appel au service, genres d'échec, repli), un rendu et un geste par projet.
- **Une saisie est à moitié isolable chez appkit.** La logique (`analyser`) est pure et sans DOM, par type logique. L'interface est liée au montage (un cas de rendu par composant, une écoute d'événements par racine). Voix, scan et photo = un noyau pur plus un rendu et un geste dans chaque montage.
- **Forme du partage** : module pur, sans import, copié mécaniquement dans chaque projet avec des **vecteurs de test communs**. Le kit n'importe jamais depuis `grist_forms`, ni l'inverse. Contraintes : le kit est en ESM, le moteur en scripts classiques (enveloppe UMD ou deux sorties) ; la licence du kit n'est pas tranchée, donc **la source de vérité vit côté `grist_forms`** et se copie vers le kit, jamais l'inverse.
- **Additif chez appkit sous condition** : un nouveau composant sur un type logique existant l'est ; un nouveau **type logique** ne l'est pas (grammaire fermée à douze types, un test exige une règle d'analyse par type). Voix vers texte et position vers texte ou WKT : possibles. Photo ou scan **en pièce jointe** : le type `piece-jointe` est refusé aujourd'hui et le catalogue d'écriture du kit n'envoie aucun fichier à Grist. C'est **un trou du kit**, pas un composant à ajouter. Photo vers texte lu ou vers un choix classé : possible, c'est de la lecture.
- **Précédents** : `referentiel.mjs` est une saisie adossée à un service (module pur, transport injecté, genres d'échec nommés, repli en texte libre). `kit/extraction` a le motif « appel de service » (transport injecté, six genres d'erreur, proposition toujours « propose », double en mémoire). Appkit suggère qu'il serve de base au noyau commun.
- **Tension à lever** : appkit demande à la fois que la source de vérité vive côté `grist_forms` et suggère de partir de `kit/extraction`. La licence du kit n'étant pas tranchée, la seconde idée ne peut valoir que comme **modèle** (vocabulaire d'erreur, forme `{ valeurs, anomalies }`, transport injecté), pas comme code copié vers `grist_forms`. À confirmer avec Nicolas.

### 8.2 TaskFlow dans une application mobile : un hôte de plus, et D8 à revoir (09/11/2026)

Nicolas a précisé la cible de TaskFlow : toute la suite (Kanban, Gantt, calendrier, plan de charge, feuille de temps, organigramme, portefeuilles, tableau de bord) dans une **application mobile (APK) construite avec appkit**, avec un assistant personnel intégré, en parallèle de TaskFlow actuel et sans le toucher. Cadre chez l'agent TaskFlow : `projects/appkit/apps/taskflow/`.

Conséquences pour ce cadrage, **non décidées** :

- **Un hôte de plus** au tableau du §5 : l'APK de TaskFlow (coque appkit dans Capacitor). Il fournirait les capacités et les services au noyau partagé de D9.
- **D8 est à revoir.** Elle disait : Atlas porte les plugins natifs et le coffre à clés. Si les APK d'Atlas et de TaskFlow sont séparés (lecture d'Atlas-BI, non tranchée par Nicolas), cette couche est à fournir deux fois ou à mettre en commun. L'APK d'Atlas n'a aujourd'hui aucun plugin natif.
- **Pièces jointes.** Photo et scan en pièce jointe supposent que le kit sache écrire un fichier dans Grist, ce qu'il ne fait pas (trou signalé par appkit). Le REST authentifié ne marche qu'en APK (mesuré par Atlas-BI).
- **Hors ligne et conflits.** Hors du périmètre de ce cadrage, mais le kit a déjà une règle : un ordre d'écriture porte les valeurs lues, un conflit n'écrase jamais en silence. Les saisies mobiles n'ont rien à y ajouter.
- **Mesure à ajouter au lot 0.** Caméra, micro et position dans une WebView Capacitor sans plugin : non mesurés, et non mesurables d'ici (appareil requis).

## 9. Mesures à faire avant d'écrire du code

Ce qui suit est **à mesurer**, pas à supposer. Chaque ligne a un protocole court et une issue (décide le repli ou l'hôte).

| # | Question | Comment | Décide |
|---|---|---|---|
| M1 | Dans l'iframe d'un widget Grist, « Utiliser ma position » fonctionne-t-il ? | document de test Grist, téléphone et ordinateur ; lire la politique d'autorisations de l'iframe | si `position` est une capacité du widget Grist ou seulement des autres hôtes |
| M2 | Dans la même iframe, le bouton photo (`capture`) ouvre-t-il l'appareil sur Android et iOS ? | idem | si `photo` est offerte dans Grist (elle l'est probablement : sélecteur système, pas d'autorisation d'iframe) |
| M3 | `getUserMedia` (micro) dans l'iframe Grist : refusé ? | idem | si `voix` en direct est impossible dans Grist (attendu : oui, Grist ne pose que `clipboard-write`) → repli `audio` par le sélecteur de fichier (`accept="audio/*"`), ou saisie au clavier |
| M4 | Sur Android et iOS, `<input type=file accept="audio/*" capture>` propose-t-il l'enregistreur ? | essai sur appareils | la viabilité de `audio` comme repli |
| M5 | Reconnaissance vocale du navigateur (`SpeechRecognition`) : disponible et hors ligne ? | Chrome Android, Safari iOS | si `transcrire` peut être local (sans service) |
| M6 | Page hors Grist : `getUserMedia`, position, détection de codes (`BarcodeDetector`) | HTTPS, appareils | capacités de l'hôte « page autonome » |
| M7 | Poids et durée : un enregistrement de 60 s, une photo de téléphone, passent-ils la limite Grist de 10 Mo par pièce jointe ? | mesure | plafonds par défaut, compression |
| M8 | Atlas : quels plugins Capacitor (caméra, position, micro, stockage sécurisé) et quel stockage de clés ? | `projects/Atlas/docs/CADRAGE-APPLICATION-TERRAIN.md` §1.2 : aucun plugin aujourd'hui | périmètre réel du lot 4 |

Les mesures M1 à M4 se font en Grist réel (document de test, pas un document de la personne) et ne demandent aucun code de production.

### 9.1 Résultats du lot 0 (09/11/2026), sur ordinateur

Méthode : une page de sonde jetable, hors dépôt, qui interroge la politique d'autorisations, tente la position et le micro et relève les API présentes. Navigateur : Chrome 156 piloté (profil temporaire, aucune autorisation accordée), Windows. Grist réel : instance publique, version 1.7.22, **document jetable anonyme** créé pour l'essai, sans donnée de personne. La sonde y est servie par un serveur local en HTTP sur `localhost`.

| # | Résultat | Mesuré ou lu |
|---|---|---|
| **M1** | **Position refusée dans un widget Grist.** L'iframe du widget porte `allow="clipboard-write"` et rien d'autre, sans attribut `sandbox`. Politique d'autorisations relevée dans l'iframe : `clipboard-write` seule. `getCurrentPosition` échoue : « Geolocation has been disabled in this document by permissions policy » | **Mesuré en Grist réel** ; confirme la lecture de `WidgetFrame.ts` |
| **M3** | **Micro refusé dans un widget Grist** : `getUserMedia({audio})` rejette `NotAllowedError`, état de permission `denied`. Même état `denied` lu pour la caméra (`getUserMedia` vidéo non essayé) | **Mesuré en Grist réel** |
| M1/M3 (témoin) | Dans un iframe d'origine croisée muni de `allow="geolocation; microphone; camera"`, les trois passent à `prompt` : la personne serait interrogée. Ce n'est donc pas une limite du navigateur, c'est ce que Grist ne délègue pas | Mesuré sur un iframe de test, pas en Grist |
| **M6** (ordinateur) | En page de plein droit sur `127.0.0.1` (contexte sécurisé) : politique `geolocation`, `camera`, `microphone` permises, état `prompt`. `MediaRecorder` offre `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4`. **`BarcodeDetector` absent** (Chrome Windows) : le scan de codes ne peut pas s'appuyer dessus sur ordinateur | Mesuré |
| **M5** (partiel) | `SpeechRecognition` (préfixé) est présent. Non mesuré : si elle fonctionne **hors ligne** ou passe par un service distant. Je ne la compte donc pas comme transcription locale | Présence seulement |
| **M7** | **Un enregistrement de 60 s pèse environ 0,9 Mo** (Opus par défaut, bruit blanc, cas défavorable pour un codec ; 0,16 Mo à 24 kbit/s ; `audio/mp4` 0,93 Mo), soit près de dix fois moins que la limite de 10 Mo par pièce jointe. Extrapolé de 8 s. **Photo non mesurée** (téléphone requis) | Audio mesuré, photo non mesurée |
| **M8** | L'application Atlas (`packages/atlas-app`, branche principale) ne dépend que de `@capacitor/android` et `@capacitor/core`, avec `CapacitorHttp` activé. **Aucun plugin** : ni caméra, ni position, ni micro, ni stockage sécurisé | Lu dans `package.json` et `capacitor.config.json` |
| M2, M4 | `capture` sur un `<input type=file>` : l'attribut n'est pas reflété par Chrome ordinateur ; son effet sur Android et iOS n'est pas mesurable d'ici | **Non mesuré** : appareil requis |

**Ce qui n'est pas mesuré, et ne peut pas l'être d'ici** : tout appareil réel (Android, iOS), le comportement d'une WebView Capacitor sans plugin, le poids d'une photo de téléphone, `SpeechRecognition` hors ligne, `BarcodeDetector` sur mobile.

**Conséquences, tirées par Form Builder (D15)** : dans un widget Grist, les capacités `position` et `voix` en direct **ne sont pas disponibles** et la caméra en flux non plus ; l'hôte « widget Grist » ne les déclare donc pas, et chaque champ retombe sur son repli (saisie au clavier, sélecteur de fichier). Le contrat d'hôte n'a pas à changer : il prévoyait déjà ce cas. La valeur des saisies mobiles se joue dans les hôtes qui les déclarent : application native, PWA, page hors Grist. Photo et audio par sélecteur de fichier restent possibles dans Grist si M2 et M4 le confirment sur appareil.

---

### 9.2 Protocole sur appareil (à lancer quand un téléphone sera branché)

Décidé avec Nicolas le 09/11/2026 : ces mesures se font quand un téléphone est connecté. La sonde est prête dans `tests/sonde-capacites/` (voir son `LISEZ-MOI.md`). Les étapes ci-dessous sont l'état de ma connaissance, à vérifier au moment : je ne les ai pas encore jouées.

| Mesure | Android | iOS |
|---|---|---|
| Accès à la sonde | Débogage USB activé, `adb reverse tcp:8541 tcp:8541`, ouvrir `http://localhost:8541/sonde.html` dans Chrome (`localhost` est un contexte sécurisé) ; lecture à distance par `chrome://inspect` | `localhost` du téléphone n'est pas l'ordinateur : il faut une adresse HTTPS joignable (tunnel ou certificat local). Safari exige un contexte sécurisé pour le micro et la position |
| M2, M4 | Toucher les deux champs fichier : le système propose-t-il l'appareil photo, l'enregistreur ? La page affiche nom, type et poids | idem |
| M1, M3, M6 hors Grist | Lire le résultat JSON de la page (autorisations accordées à la main) | idem |
| M1, M3 dans Grist | Ajouter la sonde en widget « URL personnalisée » dans un document jetable (adresse HTTPS requise sur iOS) | idem |
| M5 | Présence de `SpeechRecognition` ; test hors ligne (mode avion) à ajouter à la sonde | idem (préfixe `webkit`) |
| M6 | Présence de `BarcodeDetector` et formats pris en charge | probablement absent : à mesurer |
| M7 | Poids d'une photo prise par `capture` et d'un enregistrement de 60 s | idem |
| WebView Capacitor sans plugin | Construire un APK de débogage minimal dont la page est la sonde ; relever autorisations demandées et résultats. **Demande une construction Android : à décider avec Atlas-BI** | Hors périmètre actuel (l'application n'est construite que pour Android) |

À ajouter à la sonde avant ce jour : un essai de `SpeechRecognition` en mode avion, et la lecture des formats de `BarcodeDetector.getSupportedFormats()` déjà prévue. Rien d'autre à écrire.

## 10. Sécurité, vie privée, accessibilité

- **Données personnelles.** Une voix, une photo de personne, une position sont des données personnelles. L'hôte informe, la personne consent (la demande d'autorisation du navigateur ne suffit pas pour un service distant). Rien ne part vers un service sans que la personne l'ait déclenché.
- **Secrets.** Jamais dans le FormDef, jamais dans une page publiée, jamais dans le dépôt. Côté hôte : coffre du système (Android Keystore pour l'application ; pour une page web, saisie à chaque session ou stockage choisi par la personne, avec avertissement).
- **Modèle de langage.** Entrée = texte dicté (donc potentiellement hostile) ; sortie = suggestions vérifiées contre le schéma du formulaire. Jamais d'écriture directe. Le service est celui de l'hôte (un service souverain choisi par l'organisation, par exemple).
- **Sécurité des pages.** La consigne et les suggestions s'insèrent par échappement ; aucune évaluation dynamique ; aucune adresse tierce codée en dur.
- **Accessibilité.** Chaque saisie a un équivalent au clavier (le repli est aussi le chemin d'accessibilité) ; les états « j'écoute », « j'envoie » sont annoncés ; un bouton d'arrêt toujours visible.
- **Agents.** Les commandes de registre restent des calculs sans écriture ; `forms_besoins_hote` ne touche aucun document.

---

## 11. Décisions (avec recommandation)

**Tranché le 08/11/2026 : D1 à D8 validées conformément aux recommandations ; le lot 0 (mesures M1-M8, document Grist de test, sans code de production) est autorisé.** Rien n'est codé en production, rien n'est publié ni poussé sans nouvel accord explicite.

| # | Décision | Recommandation |
|---|---|---|
| D1 | Consigne d'extraction : par formulaire, par champ ou les deux | les deux : sur le champ `voix`, valeur par défaut au formulaire |
| D2 | `photo` comme widget distinct de `file` | oui, alias riche ; `file` inchangé |
| D3 | Version du contrat | `formdef-1.0` additif ; pas de 1.1 sans rupture |
| D4 | `hote-capacites` : contrat publié à part | oui, au catalogue des contrats |
| D5 | Transcription : service de l'hôte, ou reconnaissance du navigateur en premier | service de l'hôte d'abord (cohérent avec Terrain Voix) ; reconnaissance locale si M5 est favorable |
| D6 | Tracer qu'une valeur vient d'une suggestion | non par défaut ; colonne annexe optionnelle `options.sourceCol` plus tard |
| D7 | Mode hors Grist : refuser `photo`/`audio` ou les dégrader | dégrader en texte/lien avec message dans le compositeur, refuser à la génération si la question est obligatoire |
| D8 | Qui porte les plugins natifs et le coffre à clés | Atlas (hôte) ; Form Builder ne fournit que le crochet |
| D9 | Deux rendus de FormDef (moteur de Form Builder, widget `formulaire` d'appkit) : comment ajouter les saisies mobiles | **Option C, tranchée le 09/11/2026 :** un noyau pur partagé (capture, appel au service, genres d'échec, repli) avec vecteurs de test communs, un rendu et un geste par projet. Source de vérité côté `grist_forms`, copie mécanique vers le kit, jamais l'inverse. Les options A (une copie par rendu) et B (appkit consomme le moteur) sont écartées. Réserve : tant que la licence du kit n'est pas tranchée, rien n'est copié du kit vers `grist_forms` ; le module d'extraction du kit ne sert que de modèle (vocabulaire d'erreur, forme `{ valeurs, anomalies }`, transport injecté) |

**Décisions prises par Form Builder le 09/11/2026**, sur délégation de Nicolas (« prends toutes les décisions que tu juges optimales pour FormDef, Form Builder, nos widgets et les clients futurs ; demande aux agents concernés pour celles que tu ne peux pas prendre, puis à moi »). La délégation ne couvre pas la publication ni le push : ils restent soumis à son accord explicite.

| # | Décision | Pourquoi |
|---|---|---|
| D10 | **Forme du noyau commun de saisies** : un seul fichier source dans `projects/grist_forms/shared/`, en enveloppe UMD (acceptée par le moteur en scripts classiques et par le kit en ESM), pur, sans import, transport, horloge et minuteur injectés par l'hôte, genres d'échec nommés comme dans le contrat d'hôte. Vecteurs de test communs dans `tests/fixtures/` (copie neutre régénérable, jamais éditée à la main) | Prolonge D9 et la contrainte de format relevée par appkit ; le précédent `referentiel.mjs` côté kit montre que la forme tient |
| D11 | **Ordre** : lot 0 (mesures) d'abord, puis une spec du noyau sans code montrée à appkit, puis le lot 1 (schéma, contrat d'hôte, validateur) en branche locale. Rien n'est publié ni poussé sans accord explicite. Pas d'attente de l'application TaskFlow : le noyau et le contrat servent déjà tels quels | Le lot 0 peut invalider le repli ; le lot 1 est additif et réversible tant qu'il reste local |
| D12 | **Crochets `choix`, `exclure`, `lectureSeule`** : pas portés dans le moteur de Form Builder tant qu'aucun client ne les demande. La référence est celle du rendu d'appkit ; si on les porte un jour, même forme | Un seul client (TaskFlow) les demande, et il passe par le rendu d'appkit |
| D13 | **Photo et scan en pièce jointe** : FormDef inchangé (`photo` reste du type Attachments, alias riche de `file`). Le manque est celui du kit (écrire un fichier dans Grist), à traiter par appkit. En attendant, repli sur la lecture en texte ou sur le sélecteur de fichier | Ne pas déformer le contrat pour un manque d'un hôte |
| D14 | **Hors ligne et conflits d'écriture** : hors du contrat FormDef. Le kit a déjà sa règle (base lue, conflit jamais écrasé en silence) ; les saisies mobiles n'y ajoutent rien | Séparer ce que le formulaire dit de la façon dont l'hôte écrit |
| D15 | **Hôte « widget Grist »** : il ne déclare ni position ni voix en direct (mesuré, §9.1) ; chaque champ retombe sur son repli | Le contrat d'hôte prévoyait déjà ce cas |
| D16 | **Libellé distinct de la valeur** : option additive `options.libelles` = `{ valeur: libellé }`, lue par les rendus qui la connaissent et ignorée par les autres (Atlas-BI : la copie du moteur chez Atlas l'ignore sans erreur). **Le sens d'une valeur (fait, annulé, actif) n'entre PAS dans FormDef** : c'est une donnée du modèle ou de la configuration du document, que l'hôte porte (crochet `choix` d'appkit, avec `{ cle, libelle, sens }`). Correspondance : `libelles[cle]` vaut le `libelle` du crochet | Un dictionnaire ne casse ni l'ordre ni le type des `choices` existants ; TaskFlow dit lui-même que le sens relève du modèle. **Confirmé côté appkit le 09/11/2026** : son rendu lit `options.libelles` (priorité : crochet `choix`, puis libellé déclaré par le modèle, puis `options.libelles`, puis la clé ; la valeur écrite reste la clé ; forme inutilisable, libellé non texte ou vide : ignoré ; 28 tests). Mon moteur devra suivre le même ordre au lot 1 pour que les deux rendus s'accordent. Reste à vérifier si `lib/fiche-formulaire.js` d'Atlas valide le FormDef avant le moteur |
| D8 bis | **Couche native, révision de D8 (proposition convergente d'Atlas-BI, de TaskFlow et de Form Builder, 09/11/2026)** : un paquet partagé de plugins et d'adaptateurs d'hôte (caméra, position, micro, faux capteurs pour les tests), copié à la construction dans chaque APK (règle « rien de distant à l'exécution ») ; **aucune clé sur l'appareil** : transcrire et extraire passent par un point d'accès de l'équipe, l'application n'a qu'un jeton révocable ; ce qui reste propre à chaque application : identité, droits, pièces jointes, règles hors ligne. **Confirmée par Nicolas le 09/11/2026** (elle modifie D8). Le lot 5 reste soumis à son go séparé | Deux APK séparés (Atlas, TaskFlow) ; éviter de faire la couche native deux fois. Robustesse des capteurs en WebView Capacitor : non mesurée |

**À demander avant de trancher** : (Q1) un libellé distinct de la valeur dans les choix (`options.libelles`, additif) : appkit et Atlas-BI lisent les FormDef ; (Q2) D8 si les APK d'Atlas et de TaskFlow sont séparés : couche native à fournir une fois ou deux : Atlas-BI et appkit, puis Nicolas ; (Q3) licence du kit et sens de la copie du noyau : Nicolas avec appkit.

---

## 12. Lots et ordre

Chaque lot : tests verts avant le suivant ; rien publié sans accord explicite ; un commit par fonctionnalité ; pas de nom d'organisation ni de secret dans les ajouts.

| Lot | Contenu | Dépend de | Sortie vérifiable |
|---|---|---|---|
| **0** | **Mesures M1-M8** (§9), sans code de production | — | tableau de résultats ajouté à ce document |
| **1** | Table `widget → type → capacité → repli` unique ; schéma (widgets, options) ; `hote-capacites-0.1` et son validateur ; test « aucune clé » ; catalogue | 0 | contrat publiable, tests de contrat |
| **2** | Moteur : lecture de `hote`, repli, `photo`/`scan`/`position` déclarés, plafonds ; faux capteurs | 1 | formulaire existant inchangé, replis testés |
| **3** | `voix`/`audio` + zone de suggestions + crochet `extraire` (avec faux services) | 2 | parcours §7 testé sans réseau |
| **4** | Compositeur (palette, pastilles, avertissements, aperçu avec repli) ; mode hors Grist (dégradation) ; synthèse ; commande `forms_besoins_hote` + fiche | 2-3 | compositeur éprouvé en Grist réel |
| **5** | Hôte Atlas : plugins, coffre, services (**chantier Atlas**), puis jeux d'essai de l'offre de service (ses types de relevé) | 3 | relevé de bout en bout sur téléphone |
| **6** | PWA (si retenue) : même contrat d'hôte ; file hors ligne des pièces jointes | 5, cadrage hors ligne d'Atlas | à cadrer à part |

**Hors périmètre de ce cadrage** : la file d'attente hors ligne des écritures et des pièces jointes (traitée par le cadrage terrain d'Atlas et le socle terrain ; ici seulement une dépendance), le suivi de trajet, la vidéo, la reconnaissance d'images, tout changement des douze types logiques du kit.

---

## 13. Ce que chacun a à faire

| Qui | À faire | Quand |
|---|---|---|
| **Nicolas** | trancher D1-D8 ; autoriser le lot 0 (mesures en Grist réel de test) | avant lot 1 |
| **Form Builder** | lots 0 à 4 | après accord |
| **Atlas-BI** | confirmer ce qu'il porte (hôte, plugins, coffre, `transcrire`/`extraire`) et son calendrier ; re-vendorer le moteur | avant lot 5 |
| **Appkit** | étendre la passerelle `besoins/formulaires` (gestes/capacités), relire `hote-capacites-0.1` comme contrat | avec lot 1 |
| **qgis2grist** | vérifier la correspondance des widgets QField → saisies | avec lot 2 |
| **Terrain / Terrain Voix** | décider de consommer le moteur plutôt que dupliquer le parcours | avant lot 3 |
| **Offre de service** | FormDef de ses types de relevé ; consigne d'extraction par type de relevé | avant lot 5 |

---

## Annexe A — Repli, champ par champ

| Champ | Hôte avec la capacité | Hôte sans | Résultat écrit |
|---|---|---|---|
| `voix` | micro + dictée | zone de texte | texte |
| `voix` avec `extraction` | + suggestions validées | zone de texte, pas de bouton « Remplir » | texte, champs saisis à la main |
| `audio` | enregistreur | sélecteur de fichier `audio/*` | pièce jointe |
| `scan` | lecteur de code | champ texte | texte |
| `photo` | appareil photo | sélecteur de fichier `image/*` | pièce jointe |
| `geo` + position | bouton « Utiliser ma position » | carte et saisie manuelle | point WKT |

## Annexe B — Ce que la commande de registre rendrait

```json
{
  "commande": "forms_besoins_hote",
  "entree": { "formdef": "…", "hote": { "capacites": { "camera": true, "micro": false } } },
  "sortie": {
    "satisfaits": ["photo_ouvrage"],
    "replis": [{ "colId": "constat", "widget": "voix", "manque": "micro", "repli": "textarea" }],
    "services_requis": [{ "colId": "constat", "service": "extraire", "manque": true }]
  }
}
```

## Annexe C — Vocabulaire

*capacité* : ce que l'appareil et le navigateur permettent (caméra, micro, position…). *service* : ce que l'hôte appelle pour le compte du moteur (transcrire, extraire). *hôte* : l'environnement qui monte le formulaire (page Grist, page autonome, PWA, application). *repli* : le widget du type Grist qui remplace une saisie impossible. *suggestion* : une valeur proposée, non écrite, que la personne valide.
