# Saisir un design system dans un formulaire

Une page (`design-system.html`) pose les questions d'un design system, les garde en **brouillon** dans le document
Grist, et rejoue les règles croisées. Rien ne passe par un serveur.

## Ce qui existe

| Pièce | Rôle |
|---|---|
| `design-system.html` | La page : liste des design systems du document, formulaire du niveau choisi, brouillon, proposition, contrôles, ThemeDef 1.0 qui en découle |
| `shared/design-system-apercu.js` | Le thème d'aperçu dont le formulaire s'habille, et l'illustration de chaque module (couleurs, formes, espacements, types…) |
| `shared/design-system.js` | Fonctions pures : catalogue → formulaire, réponses → document (et retour), règles croisées, projection ThemeDef 1.0, ligne de table, empreinte |
| `runtime/engine.js` | Trois ajouts facultatifs : le **groupe répétable** (`widget: 'groupe'`), la **couleur** (`widget: 'couleur'`), le **motif de réponse** (`options.motif`) |
| `tests/design-system.test.js`, `tests/groupes-repetables.test.js` | Les essais |

## Le catalogue

Un fichier JSON `dsdef-catalogue/0.1` décrit les champs : identifiant pointé (`couleurs.principal`), type (`texte`,
`couleur`, `enum`, `entier`, `nombre`, `booleen`, `liste`), libellé et aide en français, contraintes, niveau de
complétude (0 à 3), obligation (`requis`, `recommande`, `facultatif`), condition d'affichage (`modes.sombre=explicite`).
Un identifiant de la forme `a.b[].c` est un champ d'une ligne d'une liste d'objets.

La page **n'embarque aucun catalogue** hors un catalogue minimal (un ThemeDef 1.0). On en importe un (fichier ou texte
collé) : il est gardé dans la table `Design_system_catalogue` du document, pour tous ceux qui l'ouvrent. Il est lu comme une
donnée non fiable : format vérifié, 400 Ko au plus.

## Du catalogue au formulaire

- Une **étape par module**, et seulement les champs du niveau choisi (un niveau inclut les précédents).
- `texte` → ligne de texte (grand champ au-delà de 120 caractères) ; `couleur` → code `#RRGGBB` + sélecteur ; `enum` →
  boutons (4 choix au plus) ou liste ; `entier` / `nombre` → nombre borné ; `booleen` → oui / non.
- Une **liste de couleurs ou de textes** devient un groupe répétable d'une question ; une **liste de nombres** une ligne
  séparée par des virgules ; une **liste de choix** des cases à cocher.
- Une **liste d'objets** (`a.b[].c`) devient un groupe répétable ; une liste dans une ligne s'écrit sur une ligne, séparée
  par des virgules.
- Une condition qui vise une question absente du niveau écarte la question dépendante, avec un avertissement.
- Le statut (`identite.statut`) n'est **pas** une question : la page le pose (brouillon, proposition).

Le plan (`plan.champs`) garde la correspondance question ↔ identifiant : c'est lui qui rassemble les réponses en un
document (`assembler`) et qui relit un document dans le formulaire (`aplatir`).

## Des fichiers en entrée, un formulaire qui s'habille

- **Fichiers.** On dépose (n'importe où sur la page) ou on choisit des fichiers JSON ; chacun est reconnu à son contenu : un
  **catalogue** (gardé dans le document), un **design system** déjà écrit (ouvert en brouillon), un **ThemeDef 1.0** (ses
  graines, son mode sombre et ses seuils deviennent le début d'un design system). Un fichier non reconnu est dit, pas ignoré
  en silence. On en repart aussi : « Télécharger le design system » et « Télécharger le ThemeDef ».
- **Rien ne se perd.** Le formulaire d'un niveau ne montre qu'une partie du document : l'enregistrer le **fusionne** avec ce
  qu'il ne montre pas (un niveau plus haut, un fichier importé). Seule une question vidée disparaît.
- **Le formulaire prend l'apparence du thème en cours** (case cochée par défaut). Les variables `--kit-*` sont tirées des
  graines du document (`themeVars`), jugées par le même module que le moteur, puis posées sur la page : boutons, champs,
  progression, cartes. Le rayon, la taille de cible et la taille du texte que le document dit s'appliquent aussi. Le mode clair
  ou sombre se choisit. **C'est un aperçu** : le compilateur du kit reste le juge du thème. Un texte sous 3:1, une couleur
  principale trop proche du fond sont **redressés pour rester lisible, et la page le dit**.
- **Ce que ça donne.** Un panneau illustre le module de l'étape : palette et contrastes mesurés, clair et sombre côte à côte,
  spécimens typographiques, rayons et ombres, échelle d'espacement, grille, formats de support, cible tactile et anneau de focus,
  séries de visualisation. Rien de ce qu'on tape n'y entre tel quel : couleur en `#RRGGBB` seulement, longueurs et ombres
  bornées, noms de police en lettres, tout texte échappé.

## Les widgets du document prennent le thème

Le design system défini ici a pour but de **servir** le document : les widgets compatibles ThemeDef lisent la table `Theme_document`
(ligne active). Form Builder l'est depuis `shared/themedef.js` : le formulaire publié et l'aperçu du compositeur prennent ce thème.
Poser le thème d'un design system dans `Theme_document` (l'activation) est un geste de personne : le bouton « Appliquer ce thème au document » de cette page, confirmé, par la fonction commune du kit (`shared/activation.js`). Voir `CADRAGE-THEME-GRIST-ET-ACTIVATION.md`.

## Brouillon, proposition

- **Brouillon** : s'enregistre à tout moment, incomplet ; rien n'est refusé.
- **Proposition** : l'envoi du formulaire. Elle passe les règles « erreur » ; les « avertissements » doivent être déclarés
  dans `gouvernance.ecarts` (règle G1).
- **Activation** : jamais un effet de l'enregistrement. `Design_system.actif` reste faux ; une personne applique le thème au document par le
  bouton « Appliquer ce thème au document… » (un panneau dit ce qui change, la table `Theme_document` n'est créée qu'après une confirmation qui
  le dit, un seul lot, relu après). « Retirer le thème du document » met `actif` à faux, sans rien supprimer.

## Les règles croisées (rejouées dans `controler`)

C1 texte sur fond · C2 principale sur fond (avertissement) · C3 chaque état sur fond · C4 principale et secondaire
distinctes · M1 mode sombre explicite complet · I1 cible ≥ 24 px · I2 focus ≥ 3:1 · I3 mouvement réduit respecté · V1 palette
≤ classes max · V2 rampe divergente impaire · T1 texte de base ≥ 16 px (avertissement) · G1 avertissements déclarés.
Une règle dont les données manquent est **sautée** : un brouillon n'a aucun constat tant qu'on n'a rien dit.
Ces règles préviennent ; le compilateur du kit reste le juge du thème (ce module ne compile rien).

## Stockage

Table `Design_system` (créée à la première sauvegarde) :

| Colonne | Type | Règle |
|---|---|---|
| `cle` | Texte | une ligne par design system, tirée de l'identifiant ou du nom |
| `nom`, `niveau` | Texte, Entier | informatifs |
| `statut` | Choix | `brouillon`, `proposition`, `valide` (ce dernier : une personne, ailleurs) |
| `dsdef` | Texte | le document en JSON, 400 Ko au plus |
| `actif` | Booléen | **faux** : la page n'active jamais |
| `version` | Texte | `dsdef-0.1` |
| `maj` | Numérique | secondes Unix |
| `hash` | Texte | `sha256-<base64>` de la forme canonique |

Le thème qu'on en tire est un **ThemeDef 1.0** (nom, graines, mode sombre, seuils), affiché et copiable. Il n'est écrit
dans `Theme_document` que par le geste d'activation confirmé. Un mode sombre « explicite » y devient « derive » : ThemeDef 1.0
en demanderait les 26 valeurs.

## Mesuré

- Sur un catalogue réel de 91 champs et son instance, aux quatre niveaux : le formulaire se remplit, part, et le document
  rassemblé est **identique** à l'instance, champ par champ (70 questions au niveau 3, 10 groupes répétables).
- En Grist réel : la table se crée, le brouillon s'enregistre (`actif` faux, empreinte), le catalogue de 90 Ko est gardé
  intact dans une cellule et relu au rechargement.

## Ce qui n'est pas fait

- Le compositeur de formulaires ne sait pas **composer** un groupe répétable (il le garde tel quel à l'ouverture et à
  l'enregistrement) ; il propose la couleur.
- Pas de validation de contraste à la saisie dans le formulaire lui-même : elle vient du panneau « Les contrôles ».
- L'illustration est celle du **module** de l'étape, pas de chaque question ; elle se met à jour à chaque saisie.
- Les polices du document ne sont pas chargées (le contrat ThemeDef ne porte ni adresse ni fichier) : le spécimen montre la pile de repli quand la police n'est pas installée.
- La page n'est pas annoncée dans le sélecteur de widgets de Grist : le paquet la porte avec `prive: true`
  (`scripts/promote-grist-forms.js`).
