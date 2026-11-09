# Spec — le noyau commun de saisies mobiles (`noyau-saisies`)

État : **spec, sans code**, 09/11/2026. Décision D9 (option C) et D10 (forme) du cadrage `CADRAGE-ENTREES-MOBILES.md`, confirmées par Nicolas. Ce document est à relire par appkit **avant tout fichier de code** ; rien n'est écrit dans le dépôt de personne d'autre.

## 1. À quoi il sert

Deux rendus de FormDef existent : le moteur de Form Builder et le widget `formulaire` d'appkit. Les saisies mobiles (voix, audio, scan, photo, position) ont une part **logique**, identique partout, et une part **d'interface**, propre à chaque rendu. Le noyau est la part logique, écrite une fois.

**Ce qu'il fait :** décider du mode d'une saisie (directe ou repli), appeler un service de l'hôte de façon typée et réessayable, vérifier ce qu'un service propose, tenir l'état d'une suggestion jusqu'à la décision de la personne, contrôler les limites d'une pièce.

**Ce qu'il ne fait pas :** aucun DOM, aucun réseau, aucun accès au matériel (c'est l'hôte), aucun stockage de clé ou de jeton, aucune écriture dans Grist, aucune couleur ni thème. L'interface (boutons, gestes, rendu des cartes de suggestion) reste dans chaque rendu.

## 2. Forme du module

- **Un seul fichier source** : `projects/grist_forms/shared/noyau-saisies.js`, en enveloppe UMD (`module.exports` sous Node, `NoyauSaisies` global dans une page), **sans aucun import**.
- **Sortie pour le kit** : le kit est en ESM. Une **seconde sortie `.mjs` générée** depuis la même source par un petit script (même principe que la copie de `generer-skill-commun.js`), avec un test qui échoue si la copie n'est pas à jour. La copie vers le kit est **mécanique et faite par appkit** ; je n'écris pas dans son arbre. Conditions posées par appkit, reprises : **ESM pur**, sans import ni effet de bord à l'import ; **exports nommés identiques** à ceux de l'UMD ; bannière de licence d'une ligne conservée ; **sortie déterministe** (fins de ligne LF, aucune date) ; test de fraîcheur côté `grist_forms` ; la sortie doit passer sa vérification de publiabilité (aucun nom d'organisation ni de projet interne).
- **Tout ce qui dépend de l'environnement est injecté** : horloge, attente, signal d'annulation. Aucune lecture de `Date.now`, `setTimeout`, `fetch` dans le noyau.
- **Aucune exception pour un cas attendu** : tout échec de service se rend en `{ ok: false, erreur }`.
- **Source de vérité côté `grist_forms`**, le kit copie. La licence du kit est **MIT** (confirmé par Nicolas le 09/11/2026) : ce n'est plus un blocage, et le code du kit peut être repris tel quel quand il convient, à condition de passer par sa vérification de publiabilité. Je garde la source ici parce que le noyau est celui des deux rendus, pas du seul kit. Toute publication reste soumise à l'accord de Nicolas.

## 3. Vocabulaire fermé (constantes exportées)

| Nom | Contenu |
|---|---|
| `CAPACITES` | `camera`, `micro`, `position`, `orientation`, `scanner` |
| `SERVICES` | `transcrire`, `extraire` |
| `GENRES` | `reseau`, `droits`, `limite`, `forme`, `delai`, `vide`, `annulee` (vocabulaire commun avec le kit, confirmé codé de son côté) |
| `GESTES` | `voix`, `audio`, `scan`, `photo`, `position` |
| `ETATS_SUGGESTION` | `propose`, `acceptee`, `modifiee`, `refusee` |

## 4. Les fonctions

Toutes sont pures. Les formes ci-dessous sont des **signatures de contrat**, pas du code.

### 4.1 `resoudreSaisie(champ, hote, refus)` : directe ou repli

Entrée : le champ du FormDef (`widget`, `type`, `options.capacite`), l'objet `hote` du contrat `hote-capacites-0.1` (ou rien), la liste des capacités **refusées à l'exécution** par la personne.
Sortie : `{ geste, mode: 'direct' | 'repli', capacite, widgetRepli, raison }`.

Règles :
- Pas d'`hote`, ou capacité absente, ou capacité refusée → `mode: 'repli'`, avec `widgetRepli` : `textarea` (voix), `file` (audio, photo), `text` (scan), `geo` sans position (position). `raison` : `hote-absent`, `capacite-absente` ou `capacite-refusee`.
- Capacité requise, par ordre : `options.capacite` si elle est dans `CAPACITES` ; sinon celle que le widget appelle (`voix`/`audio` → `micro`, `photo` → `camera`, `scan` → `scanner`, `position` → `position`). Une valeur inconnue est ignorée, jamais une erreur.
- Une voix **directe** sans service `transcrire` reste utilisable : le mode devient `direct` avec `transcription: false` (enregistrement seul).
- L'hôte « widget Grist » ne déclare aucune capacité de capteur (mesuré) : toutes les saisies retombent sur leur repli sans cas particulier.

### 4.2 `appelerService(service, entree, options)` : appel typé et réessayable

`service` est l'objet du contrat (`{ sortant, appeler }`). Options injectées : `signal`, `attendre(ms, signal)`, `politique`.
Sortie : `{ ok: true, valeur, tentatives }` ou `{ ok: false, erreur: { genre, message, statut?, reessayerApres? }, tentatives }`.

Règles :
- Toute exception ou tout rejet du service est **normalisé** en erreur typée ; un échec sans statut ni indication est un `reseau`.
- **Réessai** : `reseau`, `delai`, `limite`, `vide` se réessaient ; `droits` et `forme` **jamais** ; `annulee` jamais et n'est pas un échec. `reessayerApres` (secondes) l'emporte sur le délai calculé, plafonné.
- **Annulation** : si le `signal` est levé, résultat `annulee`, aucun réessai.
- **Message assaini** : le message d'erreur rendu ne contient ni clé, ni jeton, ni adresse. Deux gardes : les **secrets connus de l'appelant** (la clé et l'adresse que la personne a saisies, passés en option `secrets`) sont retirés **à l'identique**, et les motifs d'URL, `Bearer …` et longues chaînes opaques sont remplacés dans tous les cas. Un test le garantit sur des entrées piégées, y compris une clé et une adresse reprises dans le message d'un service.
- **Politique par défaut, alignée sur le kit, qui l'a mesurée** (moteur de lecture : réponses vides aléatoires passées au réessai espacé) : **4 essais au total**, le premier compris, attentes de **500, 1500 et 4000 ms**, sans doublement. Une attente `reessayerApres` demandée par le service est vécue jusqu'à **30 s** ; au-delà, on ne bloque pas la personne : `limite` est rendu avec le délai conseillé.
- **Formes acceptées d'un service** : celle du contrat (`{ ok, … }`), celle du transport du kit (`{ statut, valeurs?, anomalies?, vide?, reessayerApres? }`), ou une exception. Une exception est un `reseau` ; une `AbortError` ou un signal levé est `annulee`.
- `genreDepuisStatut(statut)` est exporté pour les adaptateurs d'hôte : 401, 403 → `droits` ; 429 → `limite` ; 408, 504 → `delai` ; 400, 413, 422 et tout autre 4xx → `forme` ; **tout statut 1xx ou 3xx → `forme`** ; 5xx, **statut absent ou non numérique** → `reseau`. Une réponse 2xx n'est `vide` que si **le transport la marque vide** : le noyau ne le déduit jamais du corps, dont la forme est celle du fournisseur.
- `phrase(genre, { sujet })` rend la phrase courante, **une seule source** pour les deux rendus ; le kit recopiera ces phrases à la place des siennes dans un lot d'alignement. `sujet` nomme ce que fait le service (« le service de lecture », « le service de transcription » ; par défaut « le service »). `vide` se dit « rien reconnu », pas comme une panne.
- `avertissementSortant(service)` rend ce qu'il faut montrer avant l'envoi : rien si `sortant: 'local'`, sinon (`'tiers'` ou absent) l'avertissement « les données quittent l'appareil » **avec le nom du service** (son nom d'hôte, jamais l'adresse complète ni la clé), puisque c'est la personne qui le choisit. L'adaptateur fournit ce nom.

### 4.3 `verifierValeurs(valeurs, champsVises, normaliser)` : ce qu'un service propose

Entrée : `valeurs` rendues par `extraire`, et la description des champs visés `{ colId, type, options: { choices? } }`.
Sortie : `{ valeurs, anomalies }`, la forme commune avec le kit.

Règles :
- **Pas de troisième normaliseur.** Le moteur de lecture documentaire a déjà `normaliser(resultats, champs)` (`projects/lecture_documentaire/shared/champs.js`, UMD pur, 102 tests, éprouvé sur documents réels). `verifierValeurs` n'en réécrit rien : il **traduit les champs du FormDef** vers cette déclaration (`Text` → `texte`, `Int` → `entier`, `Numeric` → `reel`, `Bool` → `booleen`, `Date` → `date`, `Choice` → `choix` avec ses valeurs) et **délègue**. Le normaliseur est **injecté** par l'appelant (le noyau reste sans import) ; le choix du normaliseur de référence est à confirmer avec l'agent qui le porte.
- **Forme des anomalies reprise telle quelle** : `{ champ, quoi, brut, grave }`, la forme déjà employée par ce normaliseur et par le kit, et non une forme à moi. La **valeur brute est conservée** dans `brut`.
- **Rien n'est écarté en silence** : une valeur illisible, hors liste ou hors bornes devient une anomalie.
- **`null` n'est pas `[]` ni `''`** : un champ non lu vaut `null` et n'est jamais compté comme lu vide ni rempli.
- Types non couverts par ce normaliseur (`DateTime`, `ChoiceList`, `Ref`, `RefList`, pièces jointes) : **anomalie « type non pris en charge »** dans la première version. Côté kit, les champs de rôle de référence, la clé et les pièces jointes ne sont de toute façon pas extractibles (refusés à la validation). Une fonction de résolution injectée plus tard serait un ajout, pas une rupture.

### 4.4 `appliquerDecision(etat, decision)` : l'état d'une suggestion

Machine d'états : `propose` → `acceptee` | `modifiee` | `refusee`. Décision finale.

Règles :
- `acceptee` : la valeur proposée est écrite. `modifiee` : la valeur de la personne est écrite. `refusee` : rien n'est écrit.
- **Une nouvelle extraction ne remplace jamais** une valeur acceptée, modifiée ou saisie : elle ne fait que proposer de nouveau.
- Si le champ visé a déjà une valeur non vide, la suggestion est marquée `ecrase: true` et le rendu doit le montrer.
- Le noyau ne décide pas où ni comment c'est écrit : il rend `{ etat, ecrire: { colId, valeur } | null }` ; l'écriture appartient à l'hôte et à son client de données.

### 4.5 `controlerLimites(piece, limites)` : limites d'une pièce

`piece = { type: 'audio' | 'photo', octets, secondes? }`, `limites` du contrat (`audioSecondes`, `photoOctets`). Hors limite → `{ ok: false, erreur: { genre: 'forme', message } }` ; sinon `{ ok: true }`. Mesure disponible : 60 s d'audio pèsent environ 0,9 Mo, donc la limite de 10 Mo de Grist n'est pas le facteur limitant pour l'audio ; la photo n'est pas mesurée.

### 4.6 Module frère `adaptateurs-services` : les formats d'API standards

**Décision de Nicolas le 09/11/2026 :** pas de point d'accès central. **Chaque personne renseigne dans les réglages l'adresse et la clé du service de son choix** ; l'application couvre les formats d'API standards. Conséquence : un service du contrat (`transcrire`, `extraire`) est **construit par l'hôte à partir de ce que la personne a saisi**, au moyen d'un adaptateur. Les adaptateurs servent à tous les hôtes qui acceptent une adresse et une clé (les deux applications, une PWA) : ils ne vont donc **ni dans le noyau** (qui reste sans réseau) **ni dans chaque hôte**, mais dans un **second module pur de la même forme** (UMD, sans import, transport injecté), destiné au paquet partagé de la couche native (D8 bis).

Un adaptateur prend `{ adresse, cle, modele? }` fournis **par l'hôte au moment de l'appel** et un transport `appeler` de la forme de `fetch`. Il **construit la requête**, **lit la réponse** et **range tout échec dans les sept genres**. Il ne stocke rien et ne garde ni clé ni adresse.

Périmètre minimal proposé par TaskFlow, que je reprends à corriger avec les hôtes :

| Format | `transcrire` | `extraire` | Remarque |
|---|---|---|---|
| Compatible OpenAI | oui (transcription audio) | oui (conversation) | couvre aussi les services qui copient ce format |
| Anthropic Messages | **non** (pas de point d'accès audio) : le service est absent, la voix retombe sur l'enregistrement seul | oui | pas de mode JSON natif : consigne de format puis lecture tolérante ; illisible → `forme` |
| Local de type Ollama | à confirmer | oui | |

Règles communes :
- **`sortant`** se déduit de l'adresse : `local` seulement pour une adresse de bouclage (`localhost`, `127.0.0.0/8`, `::1`), où les données ne quittent vraiment pas l'appareil ; toute autre adresse est `tiers`, même sur le réseau local, par prudence.
- **HTTPS obligatoire** sauf adresse de bouclage : sinon `forme`, sans appel.
- **La clé n'est envoyée qu'à l'adresse saisie**, jamais ailleurs ; ni la clé ni l'adresse n'apparaissent dans un message (§4.2).
- **Sortie d'un modèle = contenu non fiable** : passe par `verifierValeurs` avant toute proposition.
- **Limite connue, non mesurée** : depuis un navigateur, ces appels peuvent être **refusés par la politique d'origine croisée** du service (certains services exigent un en-tête particulier, un service local exige d'autoriser l'origine). Dans l'application native, `CapacitorHttp` contourne ce point. C'est une **mesure à faire** avant de promettre les services dans une PWA.
- Vecteurs communs : une requête attendue et une réponse type par format, plus des réponses d'échec par statut.

**Conversation avec appel d'outils (besoin de l'assistant de TaskFlow).** C'est un troisième usage, distinct de `extraire` et `transcrire`. Proposition : le module d'adaptateurs porte la **traduction de format** d'un service `converser` (messages et description des outils vers les « tools » de l'API compatible OpenAI ou le `tool_use` d'Anthropic Messages, et retour vers une forme neutre : un texte, ou des appels d'outils `{ id, nom, arguments }`), avec les mêmes erreurs typées. La **logique de l'assistant** (descripteurs d'outils dérivés de l'application, répartiteur, règle « une écriture demandée est une proposition que la personne confirme ») reste au module assistant du kit, qui reçoit le modèle comme transport injecté. **Hors lots 1 à 3**, soumis à l'accord d'appkit sur la forme neutre et au go de Nicolas pour l'assistant.

## 5. Vecteurs de test communs

Dossier `projects/grist_forms/tests/fixtures/noyau-saisies/`, un fichier JSON par fonction : une liste de cas `{ nom, entree, attendu }`. Ils sont la **copie neutre régénérable** que le kit reçoit avec le module et rejoue. Couverture minimale :

- **Résolution de saisie** : chaque geste × (hôte absent, capacité absente, refusée, disponible), widget inconnu, capacité inconnue.
- **Erreurs** : chaque genre depuis un statut, un rejet sans statut, un `signal` levé ; chaque cas de réessai et de non-réessai ; `reessayerApres` plafonné ; **messages piégés** (clé, jeton, URL) qui doivent ressortir assainis.
- **Vérification de valeurs** : valeur conforme, hors liste, non numérique, champ non visé, `null`, tableau vide, type de référence.
- **Suggestions** : les quatre états, une nouvelle extraction après décision, un champ déjà rempli.
- **Calibrage venu de TaskFlow** pour la partie statuts, si les statuts d'un document deviennent des choix à vérifier : cinq statuts français (À faire, En cours, Bloqué, Fait, Annulé) et le cas de statuts vides ou inconnus.
- **Test de contrat** : aucune sortie du noyau ne contient de motif de clé ou d'adresse.

Les vecteurs d'erreur du kit (déjà codés contre le moteur de son côté) sont **rejoués tels quels** quand le noyau les accepte, pour prouver l'accord des deux vocabulaires.

## 6. Ce que ça débloque

- **Form Builder, lot 1** : schéma des widgets additifs et contrat d'hôte, validateur, test « aucune clé dans le FormDef », avec ce noyau comme référence.
- **Moteur de Form Builder, lots 2 à 3** : appelle le noyau pour la résolution, les services et les suggestions ; le rendu des gestes reste à lui.
- **Appkit** : son rendu appelle le même noyau pour ses composants `voix`, `scan`, `photo`.
- **Hôtes** (Atlas, application TaskFlow, PWA) : leurs adaptateurs s'écrivent contre `hote-capacites-0.1` et utilisent `genreDepuisStatut` ; le paquet partagé de la couche native (D8 bis) peut embarquer ces vecteurs pour tester ses faux capteurs.
- **Registre de commandes** : `resoudreSaisie` et `verifierValeurs` étant pures, elles peuvent devenir des commandes sans écriture (par exemple `forms_besoins_hote`, prévue au lot 4) : un agent pourrait demander ce qu'un FormDef exige d'un hôte.

## 7. Réponses d'appkit (09/11/2026) et ce qui reste ouvert

Relecture faite par appkit, sur son code et non sur un essai commun : la spec lui convient.

- **Q1, réessai** : valeurs du kit adoptées (§4.2) : 4 essais, 500/1500/4000 ms, plafond de 30 s.
- **Q2, transport** : il rend `{ statut, valeurs?, anomalies?, vide?, reessayerApres? }` ou lève ; `appelerService` accepte ces formes. Table des statuts corrigée (1xx et 3xx → `forme` ; statut absent → `reseau` ; `vide` marqué par le transport).
- **Q3, références** : anomalie « type non pris en charge » en première version, accepté.
- **Q4, sortie `.mjs`** : acceptée aux conditions reprises au §2 ; appkit la range dans `kit/extraction/` avec une copie neutre des vecteurs régénérée par script.
- **Deux normaliseurs** : `verifierValeurs` délègue au normaliseur du moteur de lecture documentaire (§4.3). **À confirmer avec l'agent qui le porte** : qu'il reste le normaliseur de référence, la forme des anomalies, et la manière de le livrer au noyau (injection, retenue ici, ou copie mécanique). Ce module vit aujourd'hui sur une branche qui n'est pas fusionnée.
- **Erreur dans le kit** : l'erreur y reste la classe `ErreurExtraction` (exception) ; son adaptateur traduit la forme `{ ok: false, erreur }`. Pas de conflit.
- **Ouvert, hors de cette spec** : forme neutre de `converser` (§4.6), mesure de l'origine croisée depuis un navigateur, stockage sécurisé de la clé côté hôte.

## 8. Ce qui reste hors de la spec

Rendu des gestes et des cartes de suggestion ; capture réelle (hôte) ; stockage sécurisé de la clé et écran de réglages « Services » (hôte) ; écriture des pièces jointes dans Grist (trou du kit) ; hors ligne et conflits ; robustesse des capteurs en WebView (mesure sur appareil à faire).
