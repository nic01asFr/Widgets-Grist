# Catalogue des saisies — types, kinds, widgets, gestes

*18/10/2026. Cartographie de tout ce qu'une question de formulaire peut être : ce qu'elle range, comment elle se présente, quel geste la remplit, quelle couche elle ajoute. Complète `matrice-types.html` (qui part de l'enquête du 4ᵉ) en listant aussi ce qui n'existe pas encore. Les lignes « livré » sont vérifiées dans le code de cette branche (`runtime/engine.js`, `shared/ux.js`, `shared/types.js`, `runtime/formdef.schema.json`) ; ce qui vient d'ailleurs (Atlas, TaskFlow, QGIS, Grist natif, HTML) est dit tel quel et n'a pas été relu ligne à ligne.*

**États** — *livré* : dans le moteur de cette branche · *partiel* : existe mais incomplet, dit comment · *ailleurs* : existe dans un autre projet ou chez Grist, pas chez nous · *absent* : nulle part · *nuance* : un défaut ou une règle à connaître.

---

## 1. La chaîne, et où chaque mot se décide

```
besoin  →  forme de question  →  type logique (appkit)  →  type Grist  →  widget  →  kind  →  options  →  contrôle
```

| Mot | Dit | Où il vit |
|---|---|---|
| **type Grist** | où la valeur se range | `field.type` (`Text`, `Int`, `Ref`…) ; la table cible d'une référence dans `options.refTable` |
| **type logique** (appkit) | la même chose, vue du kit | `kit/grammaire/types.json` (douze) ; passerelle `kit/besoins/formulaires.json` |
| **widget** | *comment la question se présente et quel geste la remplit* | `field.widget` — chaîne libre ; un widget inconnu retombe sur celui du type |
| **kind** | une *couche* par-dessus : colonnes en plus, sens en plus | `field.kind` — chaîne libre ; un kind inconnu est ignoré |
| **options** | les réglages de la saisie | `field.options` — sac ouvert (voir §6) |
| **contrôle** | ce qui vérifie la valeur | navigateur (`engine.js`, `formats.js`) **et** Grist (formule `Motifs`, mode externe) |

Règle de décision : si une saisie **change ce qui est écrit dans la table** (colonnes en plus), c'est un **kind**. Si elle change **comment on la remplit** sans changer ce qui est écrit, c'est un **widget**. Si elle **règle** l'un ou l'autre, c'est une **option**. Un contrôle, un préremplissage ou un enrichissement n'est **ni un kind ni un widget** : c'est un sous-objet typé d'`options` (`validation`, `prefill`, `enrichir`).

## 2. Trois vocabulaires pour les mêmes douze types

| Type logique (appkit) | Type Grist | Widget par défaut (`types.js`) | Autres widgets livrés | kind |
|---|---|---|---|---|
| texte | Text | `text` | `textarea` | `referentiel` (adresse) |
| entier | Int | `number` | `likert`, `echelle` | `echelle` |
| nombre | Numeric | `number` | — | — |
| booleen | Bool | `checkbox` | `ouinon` | — |
| date | Date | `date` | — | — |
| date-heure | DateTime | `datetime` | — | — |
| choix | Choice | `select` | `radio`, `classement` | `choix_autre`, `classement` |
| choix-multiple | ChoiceList | `multiselect` | — | `choix_autre` |
| reference | Ref | `select` | — | `referentiel` (prévu) |
| references | RefList | `multiselect` | — | — |
| geometrie | Text (WKT) | — | `geo` | `geometrie` |
| piece-jointe | Attachments | `file` | `dessin` (dessin, signature) | — |

*nuance* — le kit ne connaît que deux widgets (`geo`, `file`) ; tout autre widget lui est transparent et se range par le type Grist.

---

## 3. Le catalogue, type par type

### 3.1 Texte (`Text`)

| Saisie | Présentation / geste | Écrit | État | Remarque |
|---|---|---|---|---|
| Ligne | champ une ligne, clavier | Text | livré (`text`) | |
| Paragraphe | zone multi-lignes | Text | livré (`textarea`) | |
| Format contrôlé | texte + règle | Text normalisé | livré (`options.validation`) | iban, siren, siret, codePostal, insee, courriel, telephone |
| Format manquant | url, plaque d'immatriculation, NIR, date écrite, code APE… | Text | absent | à ajouter au catalogue `formats.js` |
| Adresse | saisie + propositions BAN | Text + annexes | livré (`kind: referentiel`) | une seule source (BAN) |
| Lieu par adresse ou par carte | onglets « Sur la carte » / « Par adresse », ou l'un des deux | Text (WKT) | livré (`options.saisieLieu` : `carte`, `adresse`, `les-deux`) | un point seulement ; même colonne, même enrichissement ; la carte se recentre sur le point ; sans le service d'adresses, la carte seule |
| Valeur de l'URL | lue dans l'adresse de la page, verrouillable | Text | livré (`options.prefill`) | |
| Lieu (WKT) | carte, position, saisie à la main | Text WKT | livré (`geo`, `kind: geometrie`) | |
| Clavier adapté (téléphone, courriel, url) | `inputmode`, `autocomplete` | Text, Int, Numeric | livré (déduit du format et du type ; `options.clavier` pour le dire) | le champ reste un texte : seul le clavier change ; un nombre pouvant être négatif garde le clavier complet |
| Couleur | sélecteur de couleur | Text `#rrggbb` | absent | TaskFlow l'a (`input type=color`) |
| Texte riche / Markdown | éditeur | Text | absent | Grist natif propose Markdown en lecture |
| Lien | champ url + aperçu | Text | absent | Grist natif : HyperLink |
| Dictée vocale | micro → texte | Text | absent | l'app de terrain a la voix (projets `terrain-*`, non relus) |
| Scan de code (QR, code-barres) | caméra → texte | Text | absent | complète le QR par l'adresse de la page ; `BarcodeDetector` ou bibliothèque |
| Identifiant généré | UUID côté Grist | Text | absent | formule `UUID()` ; QGIS : `UuidGenerator` |
| Étiquettes libres | puces + bouton Ajouter, suggestions | ChoiceList | livré (`etiquettes`) | sans doublon (casse ignorée), 40 caractères, 20 au plus ; un mot tapé et non ajouté est gardé à l'envoi |
| Clé/valeur, liste JSON | tableau de paires | Text JSON | absent | QGIS : `KeyValue`, `List` ; TaskFlow : checklist en JSON |

### 3.2 Nombres (`Int`, `Numeric`)

| Saisie | Présentation / geste | Écrit | État | Remarque |
|---|---|---|---|---|
| Champ numérique | clavier numérique, `step` | Int / Numeric | livré (`number`) | `options.step` lu |
| Bornes min / max | refus hors bornes, message qui les dit | — | livré (`options.min`, `max`) | appliquées par le navigateur **et** par la formule du mode externe |
| Échelle 1–5 | boutons ou matrice | Int | livré (`likert`) | échelle figée 1–5 ; les échelles qui se suivent sont regroupées en matrice |
| Échelle déclarée (0–10, NPS, libellés aux deux bouts, « non concerné ») | boutons | Int | livré (`echelle` + `kind: echelle` + `echelles`) | `min`, `max`, `libelles[2]`, `nonConcerne` ; « non concerné » s'écrit vide. *`matrice-types.html` (4/10) la disait encore figée* |
| Curseur | glissière min–max, valeurs d'appui | Int / Numeric | livré (`curseur`, `options.presets`) | n'écrit rien tant qu'on n'y a pas touché (« Pas de réponse ») |
| Compteur +/− | boutons moins/plus, entre ses bornes | Int | livré (`compteur`) | `min`, `max`, `step` |
| Cadran / molette | disque | Int / Numeric | absent | QGIS : `Range` dial ; rarement utile |
| Étoiles | icônes | Int | absent | variante d'échelle |
| Pourcentage | champ ou curseur + « % » | Int 0–100 | partiel (`options.unite`) | l'unité est affichée, pas écrite ; Numeric 0–1 non géré |
| Montant / quantité avec unité | champ + unité | Numeric | livré (`options.unite`) | l'unité reste hors cellule |
| Durée | nombre + unité, pas | Numeric (heures) | livré (`step` 0,5 + `unite` h) | pas de saisie « h : min » |
| Altitude, coordonnées | remplis par un point | Numeric | livré (`options.enrichir`) | |
| Mesure d'une géométrie (longueur, surface) | calculée | Numeric | absent | Atlas l'affiche ; local, sans réseau |

### 3.3 Oui / non (`Bool`)

| Saisie | Présentation / geste | Écrit | État | Remarque |
|---|---|---|---|---|
| Case à cocher | une case | Bool | livré (`checkbox`) | un accord qu'on donne ou non |
| Oui / Non | deux boutons aux mots choisis | Bool | livré (`ouinon`) | *nuance* : sans réponse = faux dans Grist ; pour distinguer « sans réponse », poser un `Choice` |
| Interrupteur | bascule | Bool | absent | Grist natif : Switch |
| Oui / Non / Ne sait pas | trois boutons | Choice | absent comme widget | se fait avec une liste de trois choix |
| Consentement exigé | case obligatoire | Bool | livré | `required` sur une case exige « vrai » (`validateRequired`) |

### 3.4 Dates et heures (`Date`, `DateTime`)

| Saisie | Présentation / geste | Écrit | État | Remarque |
|---|---|---|---|---|
| Date | **sélecteur natif du navigateur** (calendrier du système) | Date (secondes, minuit UTC) | livré (`date`) | le calendrier est celui de l'appareil ; pas de calendrier propre |
| Date et heure | sélecteur natif date + heure | DateTime (secondes) | livré (`datetime`) | fuseau porté par la colonne |
| « Aujourd'hui », « maintenant » | valeur de départ | Date / DateTime | livré (`options.depart`) | date locale (ne recule pas à minuit), jamais devant une valeur déjà donnée, pas en modification |
| Heure seule HH:MM | champ heure ; sur mobile, la molette ou l'horloge à aiguilles *du système* | **Text `HH:MM`** | livré (`heure`) | Grist n'a **pas de type heure** ; `input type=time` donne l'horloge native ; format contrôlé sans qu'on le demande |
| Horloge à aiguilles propre | cadran dessiné | idem | absent | à éviter : peu accessible ; au besoin, toujours doublée d'un champ HH:MM |
| Date de naissance / âge | jour, mois, année séparés | Date | absent | évite le défilement de décennies |
| Mois, semaine, année | `type=month`, `type=week` | Date (1er du mois) ou Text | absent | |
| Période (début ≤ fin) | deux dates liées | 2 × Date | livré (`options.apres`) | refusée dans le navigateur et jugée dans Grist ; aussi pour les heures et les nombres |
| Plage horaire | deux heures liées | 2 × Text | livré (`heure` + `apres`) | |
| Durée écoulée | chronomètre | Numeric | absent | hors périmètre probable |
| Récurrence | règle (tous les lundis…) | Text | absent | TaskFlow n'en a pas non plus |
| Bornes de dates (pas avant, pas après) | `min`/`max`, dont `aujourdhui` | — | livré | |
| Jours ouvrés | grisage du calendrier | — | absent | |

### 3.4 bis — Choix (`Choice`, `ChoiceList`)

| Saisie | Présentation / geste | Écrit | État | Remarque |
|---|---|---|---|---|
| Liste déroulante | `select` | Choice | livré (`select`) | |
| Boutons exclusifs | radios | Choice | livré (`radio`) | |
| Cases multiples | cases, plafond | ChoiceList | livré (`multiselect`, `maxSelected`) | le plafond grise les autres cases |
| Réponse libre « Autre » | option + champ | Choice + Text | livré (`kind: choix_autre`) | |
| Classement | rangs dans une grille | une colonne par rang | livré (`kind: classement`) | |
| Matrice d'échelles | lignes × crans | une Int par ligne | livré | mise en page |
| Pastilles colorées (statut, priorité) | boutons colorés | Choice | livré (`pastilles`, `options.couleurs`) | seules #rgb et #rrggbb sont reprises (la couleur finit dans un style) |
| Cartes avec image | choix illustrés | Choice | absent | |
| Liste longue avec recherche | combobox filtrante | Choice / Ref | absent | l'adresse en est un cas particulier |
| Choix en cascade | listes dépendantes | Choice / Ref | livré (`cascade`) | |
| Liste filtrée dynamiquement | selon une autre réponse | Choice / Ref | livré (`dynamicFilter`) | |
| Étiquettes libres | puces + bouton Ajouter | ChoiceList | livré | voir plus haut |
| Double liste, tri par glisser | réordonner | ChoiceList | absent | |

### 3.5 Références (`Ref`, `RefList`)

| Saisie | Présentation / geste | Écrit | État | Remarque |
|---|---|---|---|---|
| Liste | `select` / `multiselect` | Ref / RefList | livré | table cible : `options.refTable` ; libellé : `options.visibleCol` |
| Radios | boutons | Ref | absent | Grist natif en propose |
| Recherche (autocomplétion) | combobox | Ref | absent | |
| Désigner sur la carte | clic, rectangle, liste par distance | Ref | **absent** | Atlas le fait ; `saisie: carte` du kind `referentiel`, prévu |
| Désigner par code scanné | QR / code-barres → Ref | Ref | partiel | par l'adresse de la page (`prefill`) ; pas depuis le formulaire |
| Créer à la volée | « ajouter une ligne » dans la liste | Ref | absent | |
| Table liée (visites, répétition) | formulaire qui ajoute une ligne rattachée | Ref | partiel (`liens-table.js`) | Atlas : « + Formulaire » |
| Liste d'éléments répétés (checklist) | lignes ajoutables | table liée ou JSON | absent | TaskFlow : sous-tâches en JSON |
| Arborescence parent / enfant | choix d'un parent, anti-cycle | Ref (auto) | absent | TaskFlow : `canSetParent` |
| Personnes (assignés) | multi-sélection avec rôle | RefList | partiel | multi-sélection livrée ; rôle absent |

### 3.6 Pièces jointes (`Attachments`)

| Saisie | Présentation / geste | Écrit | État | Remarque |
|---|---|---|---|---|
| Fichier(s) | sélecteur de fichiers, `accept`, `maxFiles` | Attachments | livré (`file`) | |
| Photo sur place | caméra arrière (`capture=environment`) | Attachments | livré | |
| Dessin / annotation | canevas sur fond | Attachments (PNG) | livré (`dessin`) | |
| Signature | canevas | Attachments (PNG) | livré (`dessin`) | même widget que le dessin |
| Enregistrement audio | micro | Attachments | absent | |
| Vidéo | caméra | Attachments | absent | |
| Scan de document | caméra + recadrage | Attachments | absent | |
| Glisser-déposer de fichiers | zone de dépôt | Attachments | non vérifié | |
| Aperçu / vignette | image rendue | — | non vérifié | |
| *Hors de Grist* | — | — | **impossible** | l'envoi de fichier est lié à une session par cookie (`ENVOI-EXTERNE.md`) |

### 3.7 Lieu et géométrie (Text WKT, + colonnes)

| Saisie | Présentation / geste | Écrit | État | Remarque |
|---|---|---|---|---|
| Point | clic sur la carte | Text WKT | livré (`geo`, `geometrie: Point`) | |
| Position du navigateur | bouton « Utiliser ma position » | Text WKT | livré | |
| Saisie à la main | WKT dans un champ | Text WKT | livré | |
| Plusieurs points | un point par touche | WKT MultiPoint | livré | |
| Ligne / surface | tracé sommet par sommet | WKT | livré | règles d'Atlas (`carte-geometrie.js`) |
| Lieu complété | adresse, commune, bâtiment, altitude, risques | colonnes annexes | livré (`options.enrichir`) | services publics ; vide jamais 0 |
| Désigner un objet existant | clic, rectangle | Ref | absent | voir 3.5 |
| Accrochage, refus des contours qui se recoupent | aides au tracé | — | absent | Atlas |
| Cap, précision GPS | boussole, rayon | Numeric | absent | prévu dans Atlas (terrain) |
| Itinéraire | départ → arrivée | WKT ligne | absent | Atlas, hors périmètre probable |

### 3.8 Composition (ni type ni widget : mise en page et logique)

| Élément | État | Remarque |
|---|---|---|
| Étapes, accueil, encart, illustration | livré | |
| Condition d'affichage (champ, étape) | livré | `condition` |
| Question filtre (ouvre un thème) | livré | |
| Valeur reçue de l'adresse | livré | `prefill` |
| Valeur de départ (aujourd'hui, maintenant, moi, dernière saisie, valeur fixe) | livré | `options.depart` ; la dernière saisie reste sur l'appareil |
| Champ calculé affiché | absent | |
| Champ masqué (porte une valeur sans la montrer) | partiel | possible via `prefill` verrouillé (visible), pas masqué |
| Anti-spam (champ piège) | absent | utile en mode externe |
| Grille de saisie (lignes × jours) | absent | TaskFlow (feuille de temps) ; module métier |
| Répétition inline | absent | voir 3.5 |

---

## 4. Les gestes d'entrée

| Geste | Produit | État |
|---|---|---|
| Clavier (texte, nombre) | texte, nombres | livré |
| Liste / boutons / cases | choix | livré |
| Sélecteur du système (date, heure) | dates | livré pour la date ; **heure seule absente** |
| Toucher la carte | point, ligne, surface | livré |
| Position GPS | point | livré |
| Appareil photo | photo | livré |
| Doigt sur canevas | dessin, signature | livré |
| Glisser (curseur, ordre) | nombre, rang | partiel (classement par rangs, pas de glisser) |
| Micro | texte dicté, audio | absent |
| Scanner (QR, code-barres) | identifiant | absent |
| NFC | identifiant | absent |
| Boussole, mouvement | cap | absent |
| Adresse de la page | valeur | livré |

*Sur l'horloge à aiguilles et le calendrier* — `input type=date` / `time` ouvrent le **sélecteur du système** : un calendrier sur ordinateur, une molette sur iOS, et sur Android un cadran à aiguilles pour l'heure. C'est donc le système, pas nous, qui choisit la présentation, ce qui est un avantage (accessibilité, habitudes) ; un calendrier ou un cadran dessinés par nous n'ont d'intérêt que pour des règles que le système ne sait pas tenir (jours ouvrés grisés, période liée). Dans tous les cas, **un champ HH:MM saisissable doit rester disponible**.

---

## 5. Les kinds, et ce qui n'en est pas un

| kind | Ajoute | Colonnes en plus | Le moteur change de comportement | État |
|---|---|---|---|---|
| `echelle` | crans et ancrages (`echelles`) | — | **non** (rend selon le widget) | livré, *nuance* : sert de marqueur au compositeur |
| `choix_autre` | une réponse libre | `colonnes.autre` | oui | livré |
| `classement` | des rangs | `colonnes.rangs[]` | oui | livré (aussi un widget) |
| `geometrie` | un lieu | colonnes d'`enrichir` | **non** (rend selon le widget `geo`) | livré, *nuance* : sert au compositeur et au générateur de schéma |
| `referentiel` | une chose qui existe déjà | `colonnes.annexes` | oui | livré (BAN) |

Ce qui **n'est pas** un kind, par décision : `validation` (format), `prefill` (valeur de l'adresse), `enrichir` (lieu complété), `condition`, `cascade`, `dynamicFilter`, `illustration`. Ce sont des sous-objets typés d'`options` ou des clés du champ : ils ne changent pas ce que la question *est*.

## 6. Ce que le contrat devrait dire

Constats faits en préparant ce catalogue :

1. ~~**`options` est un sac de ~30 clés, dont six typées.**~~ *Corrigé* : toutes les options que le moteur lit sont déclarées dans le schéma, et `tests/contrat.test.js` interdit qu'une option employée par un cas de démonstration ne le soit pas.
2. ~~**La table cible d'une référence a trois écritures**, dont une ignorée.~~ *Corrigé* : `options.refTable` est la voie canonique, l'ancien `refTable` et le suffixe `Ref:T` sont lus, et la voie canonique l'emporte.
3. ~~**La liste des widgets du schéma est incomplète.**~~ *Corrigé*, et gardé : le test échoue si le moteur rend un widget que le schéma ne liste pas (il a attrapé `curseur`, `compteur`, `heure` lors de leur ajout).
4. **`kind: echelle` et `kind: geometrie` ne changent rien au moteur** : ce sont des marqueurs. À dire, ou à supprimer au profit du widget.
5. ~~**`options.min` / `max` ne sont pas lues par le navigateur.**~~ *Corrigé.*
6. **Doublons** : `polarity` (champ) et `polarite` (options) ; `profile`, `theme`, `cascade` au niveau du champ.
7. **Pas de registre unique.** La liste des saisies est recopiée dans le compositeur (`ux.js`), le moteur (renderers), la projection de colonnes (`ensure-schema.js`), le mode externe (`externe.js`) et le schéma. Le test de conformité (`contrat.test.js`) empêche qu'elles divergent sans bruit ; il ne les réunit pas.
8. **Un défaut trouvé par ce test** : une question « Dessin » ou « Signature » se relisait comme « Fichier(s) » dans le compositeur. *Corrigé* (l'usage déclaré les distingue).

## 7. Ordre proposé pour combler

1. ~~Valeurs de départ~~ — *livré*.
2. ~~Nombre borné : bornes, curseur, compteur, pas, unité~~ — *livré*.
3. ~~Heure seule et période~~ — *livré*.
4. **Désigner un objet sur la carte**, et **scanner un code** depuis le formulaire.
5. **Liste d'éléments répétés** (les étiquettes libres et les pastilles colorées sont livrées).
6. Petits : **couleur**, **clavier adapté**, **interrupteur**, **formats** supplémentaires (url, plaque, NIR).
7. **Mesures d'une géométrie**, **micro** (dictée, audio).

Chaque ajout passe par le même geste : une entrée dans le registre (type, widget, kind éventuel, options typées, colonnes, règle Python), un test de conformité, une ligne ici.
