# Cadrage du travail — Atlas en briques logicielles

Ce document décrit **le travail à faire**. L'architecture cible et sa
justification vivent dans `CADRAGE-ATLAS-SOCLE-DEV.md` (quatre couches :
`atlas-model` / `atlas-engine` / `atlas-sources` / `atlas-ui`) et ne sont pas
répétées ici.

Deux éléments nouveaux depuis ce cadrage : les mesures ont bougé, et le modèle
SURFAC²E est passé de l'analogie à la référence — il est implémenté.

---

## 1. Point de départ, mesuré le 06/08/2026

| | Volume |
|---|---|
| `app_v7.js` | 5 314 lignes |
| `index_v7.html` | 1 110 lignes |
| `lib/` | 17 modules, 2 885 lignes, 146 exports |
| Tests | 17 fichiers, 209 cas |

Couplages dans `app_v7.js` : 188 références DOM, 164 MapLibre, 66 Grist, 60
three.js.

**La mesure qui commande le plan.** En découpant `app_v7.js` par fonction :

| Nature | Nombre | Destination |
|---|---|---|
| MapLibre sans DOM | **40** | `engine` — extractibles telles quelles |
| MapLibre **et** DOM | **8** | `engine` + `ui` — à couper |
| DOM seul | 50 | `ui` |
| Ni l'un ni l'autre | **120** | `model` — testables immédiatement |

L'extraction du moteur n'est donc pas un big-bang : quarante fonctions partent
sans découpe, huit seulement demandent un vrai travail de séparation. Et cent
vingt fonctions de modèle sont aujourd'hui **non testables** faute d'être
exportées — c'est le gisement le moins cher du projet.

**La surface Grist se réduit à quatre méthodes** : `fetchTable`, `listTables`,
`applyUserActions`, `getAccessToken`. Les modules `lib/` reçoivent déjà `docApi`
en paramètre — l'injection de dépendance est de fait acquise.

---

## 2. Ce que SURFAC²E apporte, et ce qu'il n'apporte pas

Source : `GT SURFAC2E 2026/` — `_core/grist-client.js`, `_core/config.js`,
`app-terrain/host.js`, `manifest.json`, `capacitor.config.json`.

### À reprendre tel quel

**Le contrat de client à double mode.** Une interface, deux implémentations
(`ClientGrist` / `ClientRest`), et une règle : *aucun module ne touche
`grist.docApi` en direct*. La détection ne devine pas — présence de
`grist.docApi`, point. C'est exactement la brique dont Atlas a besoin, et elle
est écrite.

**Le hors-ligne.** IndexedDB, cache par table, file d'attente, reprise sur
l'événement `online`, `navigator.storage.persist()`. Détail qui compte : une
lecture servie depuis le cache est **marquée** (`_cache: true`) pour que
l'interface ne fasse pas passer du périmé pour du frais.

**La règle métier hors-ligne.** « Le terrain CAPTURE ; les indicateurs se
recalculent à la synchronisation » — parce que les formules Grist ne s'exécutent
pas hors connexion. Atlas doit se poser la même question pour tout ce que son
style déclaratif tire de colonnes formule.

**La découverte des documents par sondage.** `_core/decouverte.js` :
`/orgs` → `/orgs/{id}/workspaces` → docs, triés par date de modification
décroissante, puis sondage de chaque document sur une **signature de tables**
(`Entites`, `Cotations`, `Referentiel_items`) — parallélisme **borné à 8**, avec
affichage au fil de l'eau plutôt qu'à la fin. Instantané sur ~20 documents,
intenable sur des centaines.

C'est un sondage faute de mieux : **l'API Grist n'expose aucune métadonnée de
document** permettant de marquer « ceci est un projet Atlas ». Le schéma versionné
avec l'app sert au *provisionnement* d'un document neuf, pas à la découverte —
c'est l'app qui installe la structure, jamais l'inverse.

**La file d'écriture hors-ligne.** Les écritures sont des **UserActions Grist
sérialisées**, rejouées **dans l'ordre** au retour du réseau : les modifications
d'existant passent, pas seulement les ajouts. Une **seconde file pour les
binaires** (photos) est vidée **après** celle des actions — une pièce jointe ne
peut être rattachée qu'à une ligne déjà créée côté serveur.

**Le Service Worker ne met jamais l'API en cache.** Coquille applicative en
cache-first avec mise à jour en arrière-plan ; `/api/docs/` et `/api/proxy` sont
exclus du `fetch`. Le cache de données est un mécanisme distinct, en IndexedDB.

### Ce qui ne s'applique pas, ou reste à trancher

**L'asymétrie de structure.** SURFAC²E = **un document, N modules** : son
`manifest.json` déclare des modules et l'hôte bureau construit la navigation à
partir de lui. Atlas = **un module, N documents**. Le manifeste ne répond donc pas
à « quels documents Atlas possède ce compte » — c'est `decouverte.js` qui y
répond, par sondage.

À noter : sur le terrain, `host.js` n'utilise même pas le manifeste — il porte un
registre en dur, parce qu'on n'embarque que les modules utiles hors ligne.

**Rejouer dans l'ordre n'est pas résoudre un conflit.** La file couvre les
modifications, mais deux terminaux qui touchent la même ligne se départagent au
dernier arrivé. Pour SURFAC²E, dont la saisie est essentiellement en ajout, le
risque est faible. Atlas modifie de l'existant — attributs, placement 3D,
préférences de couches, récit — sur des scènes partagées. À trancher (cf. §5).

**Le jeton reste en `localStorage`.** SURFAC²E stocke
`s2e_connexion = {baseUrl, docId, jeton}` en clair : clé API Grist, **portée
compte entier**. Risque assumé, explicitement non résolu, à traiter avant tout
déploiement réel. Pour Atlas, qui listerait *tous* les documents d'un compte, la
surface est mécaniquement plus large.

Deux faits mesurés, utiles à la décision :

- `grist.docApi.getAccessToken({readOnly: true})` donne un jeton **court terme et
  de portée document** — mais il n'existe **que dans le contexte widget**. Il ne
  peut donc pas servir à une PWA autonome. C'est la limite de l'API.
- Les **ACL Grist sont appliquées côté serveur**, y compris au propriétaire du
  document : une table refusée renvoie 403, la donnée ne sort pas. Langage de
  formule restreint (pas de `endswith`, pas d'accès aux tables) ;
  `"@domaine.fr" not in user.Email` fonctionne.

**Enveloppe : PWA, pas Capacitor.** Un `capacitor.config.json` existe dans le
dépôt, mais ce n'est pas la voie retenue — il n'a pas été testé. Le choix mesuré
est la **PWA seule**, sur Android : quota `storage.estimate()` de **6 145 Mo**,
`persisted() = true` (pas de purge automatique), IndexedDB accepte le binaire,
`capture="environment"` ouvre l'appareil photo, compression canvas d'une photo
12 Mpx de **8 Mo à 400 Ko**. L'APK n'apporterait que la **distribution maîtrisée**
(déploiement par flotte, inventaire DSI) — ni performance, ni hors-ligne, ni
fonction — au prix d'un second canal de mise à jour. Si la distribution devient
le besoin, un TWA empaquette la PWA sans dupliquer le code.

**iOS n'est pas tranché** — quota plus faible, purge agressive, installation
contrainte. Question de parc à poser tôt : elle décide de la stratégie.

### Pièges signalés, à ne pas repayer

- **Pagination silencieuse** : l'API RNB rend 20 résultats par page. Une parcelle
  de 94 bâtiments en rendait 20, sans erreur. Vérifier le champ `next`.
- **Le cache de lecture masque les ACL** : un utilisateur dont l'accès est révoqué
  conserve les données en local. À peser selon la sensibilité.
- **Versionner le Service Worker** et vérifier la taille du fichier après écriture
  — un `sw.js` tronqué casse le hors-ligne sans que rien ne le signale.
- **Grist refuse les colonnes préfixées `_`** (KeyError silencieux à
  l'`UpdateRecord`). *Atlas est déjà protégé* : `featureToRowUpdate` filtre sur
  les colonnes Grist réelles, ses propriétés internes (`_fill_color`, `_idx`,
  `_row_id`…) ne partent jamais à l'écriture.

---

## 3. Les lots

Ordonnés par valeur rapportée au coût. Chaque lot laisse le widget **fonctionnel
et publié** — pas de branche longue.

### Lot 0 — Point d'entrée du modèle · ~½ journée

`lib/index.js` réexportant les 146 fonctions par domaine, une version, une page
d'API. Aucun refactor : le code est déjà découplé et testé.

*Acceptation* : un projet tiers importe `atlas-model` et appelle
`applyDeclarativeToLayer` sans MapLibre ni Grist.

### Lot 1 — Client de données à double mode · ~2 jours · **débloque la PWA**

Porter le contrat SURFAC²E : `lib/data-client.js` exposant `fetchTable`,
`listTables`, `applyUserActions`, plus `mode` et `horsLigne`. Deux
implémentations — plugin Grist (existante, à envelopper) et REST + jeton.
Remplacer les 35 `grist.docApi` d'`app_v7.js` par le client.

*Acceptation* : le widget tourne à l'identique dans Grist ; la même page ouverte
hors Grist, avec une configuration `{baseUrl, docId, jeton}`, charge une scène.

*Pourquoi en premier* : c'est la brique commune aux deux chantiers. La faire
après la PWA obligerait à câbler l'accès aux données deux fois.

### Lot 2 — Récupérer le modèle prisonnier · ~2 jours

Sortir les 120 fonctions sans DOM ni MapLibre d'`app_v7.js` vers `lib/`, avec
leurs tests. Priorité aux fonctions déjà soupçonnées : c'est ici que se cachent
les défauts que seul l'écran révèle aujourd'hui.

*Acceptation* : `app_v7.js` sous 4 000 lignes ; couverture de test en hausse
mesurée ; aucun changement de comportement.

### Lot 3 — `atlas-engine` · ~4 jours · **le vrai chantier**

Les 40 fonctions MapLibre-sans-DOM d'abord (déplacement quasi mécanique), puis
les 8 mixtes (découpe : l'engine expose un état, l'interface s'y abonne).
`applyLayerOrder`, `syncLayerSourceData`, le repli en points, le récit
appartiennent à l'engine.

*Acceptation* : une page HTML nue instancie `new AtlasEngine(map)`, charge une
scène et joue un récit, sans un seul panneau Atlas.

### Lot 4 — Contrat `DataSource` · ~2 jours

Généraliser le lot 1 : lister les couches, lire entités et champs, lire/écrire
les préférences. L'implémentation Grist devient `sources/grist/`, une
implémentation GeoJSON valide le contrat.

### Lot 5 — Composants d'interface · non chiffré

À n'engager qu'après arbitrage avec la bibliothèque commune de composants cartographiques (Passerelle) —
sinon deux familles de composants carto coexisteront.

---

## 4. Ce que la PWA exige en plus

Les lots ci-dessus rendent la PWA *possible*. Ils ne la font pas.

| Sujet | État |
|---|---|
| Client double mode | **lot 1** |
| Hôte + écran de configuration | à écrire, modèle `app-terrain/host.js` |
| Découverte des projets Atlas | patron disponible (`decouverte.js`), **à améliorer** |
| Service Worker (coquille) | modèle disponible — API jamais mise en cache |
| Cache hors-ligne des scènes | à décider : tuiles, données, GLB ? |
| Écriture hors-ligne | à trancher : lecture seule, ou reprise de conflits |
| Enveloppe | PWA ; TWA seulement si la distribution le commande |

**La découverte des projets** a un patron éprouvé — sondage par signature de
tables, parallélisme borné, tri par date, affichage progressif. Pour Atlas, la
signature naturelle est la présence d'`Atlas_LayerPrefs` / `Atlas_Story`, ou d'un
Scene Manifest.

Le sondage reste en O(documents) à chaque lancement. Amélioration proposée :
**mémoriser aussi les résultats négatifs**, avec l'`updatedAt` du document. Au
lancement suivant, ne re-sonder que les documents dont la date a changé, plus les
inconnus — le coût passe de « tous » à « les modifiés ». Un document ne devient
pas un projet Atlas sans être modifié, donc rien n'échappe au filtre.

---

## 5. À trancher avant de coder

**Portée du jeton — sans solution technique connue.** `getAccessToken` donne bien
un jeton court et limité à un document, mais **n'existe que dans un widget** : il
ne peut pas servir une PWA autonome. Il ne reste donc que la clé API, de portée
compte. À assumer par écrit — durée de vie, procédure de révocation, et ce que
l'app affiche à l'utilisateur sur ce qu'elle détient. Point commun avec SURFAC²E,
qui ne l'a pas résolu non plus : sujet à porter en commun plutôt que deux fois.

**Écriture hors-ligne.** La file d'UserActions rejouées dans l'ordre couvre les
modifications, mais départage deux terminaux au dernier arrivé. Sur une scène
Atlas partagée (prefs de couches, récit), c'est un vrai risque. Choisir :
lecture seule hors ligne, ou détection de conflit à la synchronisation.

**Formules et hors-ligne.** Tout style déclaratif adossé à une colonne formule
sera figé hors connexion — les formules Grist ne s'exécutent pas côté client.
Recenser ce qui en dépend avant de promettre le terrain.

**Parc iOS.** Quota plus faible, purge agressive, installation contrainte. La
réponse décide de la faisabilité du hors-ligne, pas seulement de son confort.

**Distribution.** Paquet npm, sous-dossier du monorepo, ou copie versionnée ? La
promotion par script de copie ne tient plus dès qu'un projet tiers dépend d'Atlas.

**la bibliothèque commune de composants cartographiques.** Répartition proposée : Atlas apporte le modèle
applicatif, les Web Components l'embarquabilité. À confirmer avec Passerelle
avant le lot 5.
---

## 6. Ce qu'on ne fait pas dans ce chantier

- Réécrire l'interface. Les panneaux restent tels quels jusqu'au lot 5.
- Changer le Scene Manifest. La fusion V0.4 avec Passerelle est un chantier à part.
- Porter l'export QGIS et `model_glb`. Dette antérieure, à traiter pour
  elle-même (cf. `CLAUDE.md`) — mais **avant** le lot 3, car ces fonctions
  devront trouver leur place dans la nouvelle structure plutôt que dans le
  monolithe.

---

## 7. Ce qu'on peut annoncer aujourd'hui

Le **modèle** est réutilisable maintenant. Le **moteur** ne l'est pas encore. Les
**composants d'interface** pas du tout. Annoncer « Atlas est le socle » avant le
lot 3 promettrait ce qui n'est pas livrable ; « le modèle Atlas fait référence,
le socle se construit » est exact.
