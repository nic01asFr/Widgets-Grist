# Spec — le noyau commun de saisies mobiles (`noyau-saisies`)

État : **spec, sans code**, 09/11/2026. Décision D9 (option C) et D10 (forme) du cadrage `CADRAGE-ENTREES-MOBILES.md`, confirmées par Nicolas. Ce document est à relire par appkit **avant tout fichier de code** ; rien n'est écrit dans le dépôt de personne d'autre.

## 1. À quoi il sert

Deux rendus de FormDef existent : le moteur de Form Builder et le widget `formulaire` d'appkit. Les saisies mobiles (voix, audio, scan, photo, position) ont une part **logique**, identique partout, et une part **d'interface**, propre à chaque rendu. Le noyau est la part logique, écrite une fois.

**Ce qu'il fait :** décider du mode d'une saisie (directe ou repli), appeler un service de l'hôte de façon typée et réessayable, vérifier ce qu'un service propose, tenir l'état d'une suggestion jusqu'à la décision de la personne, contrôler les limites d'une pièce.

**Ce qu'il ne fait pas :** aucun DOM, aucun réseau, aucun accès au matériel (c'est l'hôte), aucun stockage de clé ou de jeton, aucune écriture dans Grist, aucune couleur ni thème. L'interface (boutons, gestes, rendu des cartes de suggestion) reste dans chaque rendu.

## 2. Forme du module

- **Un seul fichier source** : `projects/grist_forms/shared/noyau-saisies.js`, en enveloppe UMD (`module.exports` sous Node, `NoyauSaisies` global dans une page), **sans aucun import**.
- **Sortie pour le kit** : le kit est en ESM. Une **seconde sortie `.mjs` générée** depuis la même source par un petit script (même principe que la copie de `generer-skill-commun.js`), avec un test qui échoue si la copie n'est pas à jour. La copie vers le kit est **mécanique et faite par appkit** ; je n'écris pas dans son arbre.
- **Tout ce qui dépend de l'environnement est injecté** : horloge, attente, signal d'annulation. Aucune lecture de `Date.now`, `setTimeout`, `fetch` dans le noyau.
- **Aucune exception pour un cas attendu** : tout échec de service se rend en `{ ok: false, erreur }`.
- **Source de vérité côté `grist_forms`** (la licence du kit n'est pas tranchée) ; le kit copie, jamais l'inverse.

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
- **Message assaini** : le message d'erreur rendu ne contient ni clé, ni jeton, ni adresse (motifs d'URL, `Bearer …`, longues chaînes opaques remplacés). Un test le garantit sur des entrées piégées.
- Politique par défaut **proposée** : 3 tentatives au total, délai de base 500 ms doublé, plafond 8 s, `reessayerApres` plafonné à 30 s. À aligner avec les valeurs du kit (question Q1).
- `genreDepuisStatut(statut)` est exporté pour les adaptateurs d'hôte : 401, 403 → `droits` ; 429 → `limite` ; 408, 504 → `delai` ; 400, 413, 422 et tout autre 4xx → `forme` ; 5xx ou absence de statut → `reseau` ; 200 sans contenu → `vide`.
- `phrase(genre)` rend la phrase courante à afficher, la même dans les deux rendus. `vide` se dit « rien reconnu », pas comme une panne.
- `avertissementSortant(service)` rend la clé d'avertissement à montrer : aucune si `sortant: 'local'`, sinon (`'tiers'` ou absent) l'avertissement « les données quittent l'appareil ».

### 4.3 `verifierValeurs(valeurs, champsVises)` : ce qu'un service propose

Entrée : `valeurs` rendues par `extraire`, et la description des champs visés `{ colId, type, options: { choices? } }`.
Sortie : `{ valeurs, anomalies }`, la forme commune avec le kit.

Règles :
- Une valeur conforme au type et aux choix passe dans `valeurs`.
- **Rien n'est écarté en silence** : une valeur hors liste, non numérique, ou pour un champ qui n'est pas visé devient `{ champ, valeur, raison }` dans `anomalies`, la **valeur brute conservée**. `raison` : `hors-liste`, `non-numerique`, `champ-non-vise`, `type-non-pris-en-charge`.
- **`null` n'est pas `[]` ni `''`** : un champ non lu vaut `null` et n'est jamais compté comme lu vide ni rempli.
- Les types de référence (`Ref`, `RefList`) ne sont pas vérifiables sans lecture de la table : première version → anomalie `type-non-pris-en-charge` ; à ouvrir plus tard avec le référentiel (question Q3).

### 4.4 `appliquerDecision(etat, decision)` : l'état d'une suggestion

Machine d'états : `propose` → `acceptee` | `modifiee` | `refusee`. Décision finale.

Règles :
- `acceptee` : la valeur proposée est écrite. `modifiee` : la valeur de la personne est écrite. `refusee` : rien n'est écrit.
- **Une nouvelle extraction ne remplace jamais** une valeur acceptée, modifiée ou saisie : elle ne fait que proposer de nouveau.
- Si le champ visé a déjà une valeur non vide, la suggestion est marquée `ecrase: true` et le rendu doit le montrer.
- Le noyau ne décide pas où ni comment c'est écrit : il rend `{ etat, ecrire: { colId, valeur } | null }` ; l'écriture appartient à l'hôte et à son client de données.

### 4.5 `controlerLimites(piece, limites)` : limites d'une pièce

`piece = { type: 'audio' | 'photo', octets, secondes? }`, `limites` du contrat (`audioSecondes`, `photoOctets`). Hors limite → `{ ok: false, erreur: { genre: 'forme', message } }` ; sinon `{ ok: true }`. Mesure disponible : 60 s d'audio pèsent environ 0,9 Mo, donc la limite de 10 Mo de Grist n'est pas le facteur limitant pour l'audio ; la photo n'est pas mesurée.

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

## 7. Questions ouvertes, à poser à appkit

- **Q1.** Quelles sont les valeurs par défaut de réessai du module d'extraction du kit (tentatives, délai de base, plafonds) ? Si elles existent déjà, je les reprends au lieu des miennes.
- **Q2.** Le transport du kit rend-il `{ erreur }` ou lève-t-il une exception ? Le wrapper `appelerService` doit accepter la forme que les hôtes produisent réellement.
- **Q3.** Pour les types de référence dans `verifierValeurs`, préfères-tu que le noyau reste sans référence (anomalie) ou qu'il reçoive une fonction de résolution injectée par l'hôte ?
- **Q4.** La seconde sortie `.mjs` générée, avec un test de fraîcheur, convient-elle au kit tel quel ?

## 8. Ce qui reste hors de la spec

Rendu des gestes et des cartes de suggestion ; capture réelle (hôte) ; stockage et envoi du jeton ; point d'accès aux services ; écriture des pièces jointes dans Grist (trou du kit) ; hors ligne et conflits ; robustesse des capteurs en WebView (mesure sur appareil à faire).
