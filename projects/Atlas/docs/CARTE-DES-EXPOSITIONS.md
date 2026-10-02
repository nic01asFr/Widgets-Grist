# Carte des expositions d'Atlas

*02/10/2026. Établie d'après le code (références `fichier:ligne` de l'arbre de travail du
jour, à relire si le code a bougé) et recoupée avec `CADRAGE-RELEVES-TERRAIN.md`. Sert à
rendre lisible, puis cohérent, ce qu'on peut faire d'Atlas selon la manière dont on
l'expose. **À valider** : la section « Le modèle proposé ».*

## En une page

Atlas se montre de huit façons (widget dans Grist, application, page nue, scène par
adresse, vitrine, livrable autonome, export de projet, lecture forcée par Grist). Chacune
fixe, par ce qu'elle *est*, un **plafond** : y a-t-il un document où écrire, d'où viennent
les données, qui est la personne, que dit le lien. Aujourd'hui ces plafonds sont lus à
dix endroits différents et ne se combinent pas par une règle écrite — d'où des cas où le
lien dit une chose et l'ouverture en fait une autre (voir « Défauts »).

La règle que cette carte propose de rendre explicite :

> **Une posture n'est jamais choisie « contre » l'exposition. Elle est choisie sous un plafond
> que l'exposition fixe, et sous les droits de la personne.** Chaque source de plafond ne
> peut que restreindre.

```
        hébergement + données      droits (Grist)        lien d'ouverture       ce que l'auteur a publié
        (y a-t-il un document      (appris à l'usage,     (?mode=, readonly,     (formulaires exposés,
         où écrire ?)               table par table)       ?scene=)               contextes, récit)
                 \                        |                      |                     /
                  \_______________________|______________________|____________________/
                                          |
                                  postures OFFERTES   (intersection : chacune ne fait que retirer)
                                          |
                      dernier choix de la personne, s'il est encore offert
                      sinon : application → Exploiter ; widget → l'ouverture ; sinon la première
                                          |
                                   POSTURE EN COURS
                                          |
                  ce qu'on peut FAIRE = posture × nature de la couche × droit de la table
```

## 1. Les trois postures, et ce qu'elles montrent

| | Préparer | Exploiter | Lecture |
|---|---|---|---|
| Pour qui | qui configure | l'agent, le chef d'équipe | un partenaire, un lecteur |
| `viewMode` / `peutSaisir` | faux / vrai | vrai / vrai | vrai / faux |
| Rail et modules d'auteur | oui | non | non |
| Dock (pastilles) | contrôles de l'auteur | Relevé, Contexte, contrôles publiés, soleil, fonds | idem sans Relevé |
| Récit | capturer, ordonner, proposer comme contexte | lire, jouer un contexte | lire |
| Objet touché | fiche (édition) | bulle ou fiche de saisie | bulle ou popup |
| Écrit | configuration (`Atlas_*`, `Maquette_Layers`, `Formulaires`), lignes des tables liées | les tables de relevé des formulaires exposés, rien d'autre | rien |
| Garde de code | `canWrite` | `saisieHorsEdition` (3 lecteurs de `peutSaisir`) | — |

Le point faible est la dernière ligne : `canWrite(viewMode)` (= `!viewMode`) garde presque tout,
`peutSaisir` n'est lu que par trois fonctions. Exploiter n'écrit donc que *par* un formulaire
exposé, ce qui est voulu, mais par un chemin qui n'est écrit nulle part comme règle.

## 2. Les expositions

| # | Exposition | Hébergement | Données | Identité et droits | Postures possibles | Écrit |
|---|---|---|---|---|---|---|
| E1 | **Widget dans un document Grist** | iframe, `grist-plugin-api` | tables du document (`SceneManifest` ou `Maquette_Layers`), `Atlas_*`, `Formulaires` + formulaires natifs | `?access`/`readonly` posés par Grist (décrivent le widget, pas la personne) → sonde d'écriture → ACL apprise par table | Préparer, Exploiter, Lecture, selon les droits | tout, par posture |
| E2 | **E1 + `?mode=view`** (lien de terrain) | idem | idem | le lien restreint : plafond Exploiter | Exploiter, Lecture (*corrigé le 02/10/2026*) | tables de relevé exposées |
| E3 | **E1 en lecture forcée par Grist** | idem | lecture | `readonly=true`, `access=none`/`read table`, ou refus franc de la sonde | Lecture | rien |
| E4 | **Application Android** | Capacitor, `CapacitorHttp` | API REST du document (`/records`, `/apply`, `/sql`, pièces jointes) ; connexion mémorisée (instance, clé, document) | clé API : pas de jeton signé, donc pas d'`userId` ; sonde par REST | comme E1 ; ouvre en Exploiter si offerte | comme E1, selon la clé |
| E5 | **Page nue** (hors Grist, hors application) | onglet | fichiers GeoJSON, OSM, projet `.json`, autosave locale | aucune | Lecture (local) | local seulement |
| E6 | **Scène par adresse** `?scene=https://…` | n'importe quelle page, iframe d'un tiers | un manifeste (inline, URL, tuiles `xyz`) ; rien n'est copié dans Grist | aucune ; scène jamais « de confiance » | Lecture | rien |
| E7 | **Vitrine** `?vitrine=1` | page de présentation qui encadre le widget seul | le plus souvent E6 | idem E6 | Lecture | rien |
| E8 | **Livrable autonome** (`tools/livrable-autoportant.mjs`) | un seul HTML | scène embarquée (`__ATLAS_SCENE__`) | aucune | **aucune aujourd'hui** : la scène embarquée n'est jamais lue | — |
| E9 | **Export `.json` / GeoJSON** | fichier | couches, récit, réglages | — | se rouvre comme *projet* (E5), pas comme scène | local |

## 3. La nature de la couche : ce qui s'écrit, ce qui se diffuse

La posture dit *qui peut agir* ; la couche dit *sur quoi*. Écrire un objet exige une table
Grist derrière la couche.

| Origine déclarée | Servie par | `_distant` | Objets écrivables | Apparence réglable (et où) |
|---|---|---|---|---|
| table du document (`source.table`) | le document | non | **oui**, par la fiche et les formulaires | `Atlas_LayerPrefs` |
| GeoJSON inline dans le manifeste | le manifeste | non | non (« copie sans table ») | `Atlas_LayerPrefs` |
| GeoJSON / `data_url` (URL) | **le fournisseur**, rien de copié | oui | non ; filtres appliqués côté carte | `Atlas_LayerPrefs` (jamais l'URL) |
| tuiles `xyz` | le fournisseur | oui | non, pas de contrôles | `Atlas_LayerPrefs` possible |
| import fichier ou OSM | Atlas | non | non, tant qu'on ne l'a pas « enregistré en table » | `Maquette_Layers` (avec les entités) |
| `pmtiles`, `wms`/`wmts`/`wfs`, COPC | — | — | **non rendus aujourd'hui** (échec déclaré) | — |

**Streamer sans copier** est donc déjà possible pour trois cas (GeoJSON par URL, `xyz`, toute
scène externe) ; l'apparence n'est persistée que si un document est ouvert. *Exploiter n'a de
sens que s'il existe au moins une couche de la première ligne portant un formulaire exposé* —
c'est ce que `posturesOffertes` teste déjà (`tablesDeReleve`).

## 4. Les paramètres d'URL

| Paramètre | Effet | Ne fait que restreindre ? |
|---|---|---|
| `mode=view` (`lecture`, `read`) | ouvre en lecture ; plafonne à Exploiter | oui (depuis le 02/10/2026) |
| `mode=edit` | analysé, **aucun effet** distinct de l'absence | — |
| `access`, `readonly` | posés par Grist ; imposent la lecture | oui |
| `scene=<https…>` | scène externe ; coupe tout accès au document | oui |
| `vitrine=1` | saute l'écran de connexion, force le mode REST | — |
| `navbar=false` | retire la barre du haut (aussi : application en lecture) | présentation |
| `no3d=1` | pas de modèles 3D | présentation |
| `models=`, `objets=` | base des modèles 3D, catalogue d'objets | source |
| `eclairage_*` | budget et palier de l'éclairage | réglage technique |

**Il n'existe aucun paramètre d'URL pour filtrer, choisir des couches ou poser la caméra** :
la caméra vient de `sessionStorage` ou du manifeste, les filtres de l'étape ou des contrôles
publiés. Un lien « ouvre-moi sur ce secteur, avec ce filtre » n'est donc pas exprimable.
`CLAUDE.md` ne documente ni `access`, `readonly`, `objets`, ni `eclairage_*`.

## 5. Ce que l'auteur règle, et où c'est stocké

| Réglage | Stockage | Posture qui le lit |
|---|---|---|
| contrôles de données publiés (pastilles) | `Atlas_LayerPrefs` (`controls`) | Exploiter, Lecture |
| soleil, 2D/3D, fonds exposés | `Atlas_ScenePrefs` (`ViewerJSON`) | Exploiter, Lecture |
| réglages de scène (fond, relief, heure, ombres…) | `Atlas_ScenePrefs` (`SettingsJSON`) | toutes |
| formulaires proposés hors édition | `Formulaires` / natifs + `Atlas_LayerPrefs` (`formulaire.exposes`) | Exploiter |
| récit, saisies d'étape | `Atlas_Story` (`StateJSON`) | Exploiter, Lecture |
| contextes | `StateJSON.usage.contexte` d'une étape | Exploiter, Lecture |
| bulle d'objet | `symbolization.bulle` | Exploiter, Lecture |
| ordre, visibilité, apparence des couches | `Atlas_LayerPrefs` (`rank`, `Visible`, `StyleJSON`) | toutes |
| posture retenue | `localStorage` de l'appareil (`atlas_posture|<doc>`) | l'appareil seulement |

| ouverture de la scène (carte, récit, contexte) | `Atlas_ScenePrefs` (`ExpositionJSON`) — *fait le 02/10/2026* | Lecture, Exploiter |

Ce que l'auteur **ne** règle pas encore : un plafond de posture pour les visiteurs (« cette scène ne
se rouvre qu'en lecture »). Le cadrage prévoyait « la scène peut proposer une posture par défaut,
pour les visiteurs seulement » : c'est le chaînon qui manque pour que **l'exposition soit un
choix de l'auteur** et non seulement une conséquence de l'hébergement.

## 6. Le modèle proposé

Quatre plafonds, chacun ne faisant que retirer des postures :

| Plafond | Vient de | Retire |
|---|---|---|
| **Hébergement** | document ouvert ? scène externe ? application ? | tout sauf Lecture sans document |
| **Droits** | `readonly`, sonde, refus appris par table | Préparer si la configuration refuse ; Exploiter si les tables de relevé refusent |
| **Lien** | `?mode=view`, plus tard un paramètre de plafond explicite | Préparer (et, si on le décide, Exploiter) |
| **Publication** | formulaires exposés, contextes | Exploiter, tant que rien n'est exposé |

Trois ajouts le rendraient complet, sans toucher à l'existant :

1. **Un plafond posé par l'auteur dans la scène** (`Atlas_ScenePrefs`) : « cette scène s'ouvre
   au plus en Lecture / Exploiter pour qui n'est pas éditeur ». Aujourd'hui seule l'URL le dit,
   et l'URL se réécrit.
2. **Un état « Prêt pour le terrain »** (déjà au plan) qui lit cette carte pour une scène donnée :
   quelle exposition, quelles postures offertes à qui, qu'est-ce qui manque (aucun formulaire
   exposé, aucune couche écrivable, couche servie par URL sans emprise…).
3. **Des paramètres d'URL de contexte** (`?contexte=<clé>` grâce aux clés stables d'étape, puis
   couche et filtre) pour exprimer « ouvre-moi *ici*, *ainsi* ». Possible maintenant que
   l'étape a une clé ; à décider.

## 7. Défauts constatés

*Statut au 02/10/2026. « Confirmé » = vérifié dans le code ; « à confirmer » = déduit de la
lecture, à éprouver à l'exécution.*

| # | Défaut | Statut |
|---|---|---|
| 1 | `?mode=view` pouvait rouvrir en Préparer : la posture retenue sur l'appareil, ou le repli sur « la première offerte », l'emportait sur le lien | **corrigé** (plafond du lien dans `posturesOffertes`, deux tests) |
| 2 | `?mode=view` sur une page nue laisse `grist.ready` vrai et `peutSaisir` vrai sans document (le repli ne remet `ready` à faux que pour la raison `probe`) | à confirmer, puis corriger |
| 3 | Livrable autonome : `sceneEmbarquee()` n'est jamais appelée, la scène embarquée n'apparaît pas | confirmé (déjà noté dans `etudes-scene-grist`) |
| 4 | Application avec une clé en lecture seule : la sonde échoue sur une table, mais seule celle-là reçoit le verdict ; Exploiter peut être proposée jusqu'au premier refus | confirmé, assumé (apprentissage par refus) |
| 5 | La bulle d'objet (et l'icône, le modèle par catégorie) ne revient pas au rechargement depuis `Atlas_LayerPrefs` : `mergeAppearancePrefs` ne recopie que cinq champs ; elle revient seulement avec le récit | à confirmer à l'exécution (le `CLAUDE.md` affirme le contraire) |
| 6 | Identité : `setUserIdentity` n'est jamais appelée, donc ni nom ni initiales ; bloque « Moi » et « Voir l'équipe » | confirmé |
| 7 | Deux signaux d'écriture (`canWrite(viewMode)` et `peutSaisir`) qui ne se parlent pas | confirmé, voir §1 |
| 8 | Code mort : `accessIntentFromMode`, `peutProposerBasculeLectureEdition` et voisines, `probeCanWriteDoc`, `refreshViewerControlsHud` (vide) ; `?mode=edit` sans effet | confirmé |
| 9 | Aucun paramètre d'URL pour couche, filtre ou caméra ; `access`, `readonly`, `objets`, `eclairage_*` non documentés | confirmé |
| 10 | `pmtiles`, `wms`/`wmts`/`wfs`, COPC et tuiles vectorielles : pas rendus (échec déclaré) | confirmé ; décide ce que « streamer » veut dire |

## 8. Décisions à valider

1. **Le modèle à plafonds** (§6) est-il le bon cadre ? Il ne change aucun comportement légitime ;
   il rend la règle dite et testable.
2. **Le plafond posé par l'auteur** : où (`Atlas_ScenePrefs`), et sa valeur par défaut (aucun
   plafond, pour ne rien casser).
3. **`?mode=view` doit-il plafonner à Exploiter ou à Lecture ?** Aujourd'hui Exploiter (c'est le
   lien « de terrain »). Un lien « pour un partenaire » demanderait `?mode=lecture` distinct.
4. **Faut-il une carte vivante** dans l'application (le panneau « Prêt pour le terrain ») ou
   ce document suffit-il ?
5. **Streamer** : quelles sources distantes faut-il rendre avant de dire qu'Atlas « streame »
   (WFS, PMTiles, tuiles vectorielles, COPC) ?
