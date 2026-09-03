# Cadrage — Atlas portable, partage Grist, et périmètre produit

> Écrit le 26/08/2026, au fil de la session d’audit Atlas ↔ Ma carte IGN,
> puis de la réflexion autonomie / iframe / droits.
>
> But : **une seule vue** de ce qui a été tranché, de ce qui reste ouvert, et
> de ce qu’Atlas n’a pas à porter. Pas un plan d’implémentation.

---

## 1. Positionnement

**Atlas** = runtime de maquette / scène territoriale (MapLibre + three.js),
ancré dans Grist et le **Scene Manifest V0.2.2**.

**Ce n’est pas** un clone de [Ma carte IGN](https://macarte.ign.fr/). Les
écarts « stats tableur / atlas public / Mes Équipes » ne sont pas des manques
Atlas : **Grist** (et son partage) les couvre. L’ambition produit actuelle est
ailleurs :

| Couche | Rôle |
|---|---|
| **Grist** | Socle : données, ACL, collab, stats, partage document |
| **Atlas dans Grist** | Composer / présenter la scène (widgets, récit, 3D) |
| **Atlas portable** | Même runtime **hors** document, max de fonctions dans les limites |

Règle d’or déjà posée dans le code et les docs : **on écrit là où il y a un
propriétaire** (document). Hors Grist : lecture, interaction, export local —
jamais inventer un compte Atlas.

---

## 2. Matrice des hôtes (choix D)

Trois hôtes autonomes **en parallèle**, avec la matrice de capacités d’abord
(canvas `atlas-portable-matrice`). Grist reste la référence pleine.

| Hôte | Entrée | Document | Écriture doc |
|---|---|---|---|
| **Grist** (socle) | Widget dans le document | oui | oui (ACL) |
| **A · Static HTTPS** | `scene.json` + assets | non | non |
| **B · Fichier local** | Pack / GeoJSON ouvert | non | local only |
| **C · Page hôte** | Injection / postMessage | non | local only |

Contrat de scène : **Scene Manifest V0.2.2** déjà existant
(`published/schemas/scene-manifest-0.2.2.schema.json`, spec qgis2grist).  
Le « pack portable » n’est **pas** un 4ᵉ format : c’est le même manifeste
(idéalement couches `inline` / URL + `story`), servi ou ouvert autrement.

Sujets liés :

| Famille | Sujets |
|---|---|
| **Portable** | Pack figé, adaptateurs A/B/C, `capacites()` élargi |
| **Orthogonal** | Récit multimédia (son, md, images), lecteur mobile, catalogue WMTS |
| **Grist-only** | Stats, partage ACL, collab, CSV persistant |
| **Backlog** | Print PDF / composition |

Ordre de conception retenu : **pack / hôtes → récit enrichi → catalogue WMTS**.

---

## 3. Component Manifest (hub qgis-sspcloud)

Le **Component / Assembly** du hub n’est **pas** le contrat d’Atlas.

- Atlas consomme la strate **DONNÉES** (Scene Manifest).
- Le hub peut **embarquer** Atlas (`rendering.runtime` rôle « carte » + `?scene=`).
- Le Component Manifest actuel porte des traces internes (`sid`, `pid`,
  `scene_manifest_url`, `runtime: maplibre`…) — d’accord avec le hub :
  **généraliser avant de publier** ; noyau générique + extension producteur
  (comme `meta` du Scene Manifest) ; `runtime` = **rôle**, pas bibliothèque.

**Propriété du schéma Component** : ne pas répéter le piège des « trois 0.2.2 ».
Source de vérité = Pydantic offre / hub (ou `cerema-offre-de-service`).
Widgets-Grist = **miroir CDN optionnel**, pas autorité, sauf besoin réel d’un
consommateur chez nous.

---

## 4. Intégration iframe et droits Grist

### 4.1 Ce qui est possible (mesuré / doc officiel)

| Mode | Effet |
|---|---|
| `?style=singlePage` | Contour Grist minimal ; **suit la session** (lecture ou édition selon droits) |
| `?embed=true` | Contour minimal ; **lecture forcée** même si l’utilisateur est éditeur |
| Doc **non public** | Accessible seulement avec droits / session — un navigateur tiers voit *Access denied* |
| Atlas **seul** (`?scene=` / pack) | Aucun chrome Grist ; **pas** de stream d’un doc privé |

Il n’y a pas de mode « Atlas nu + cookies Grist » : `docApi` n’existe que dans
l’iframe **widget** ouverte par Grist.

### 4.2 Jetons cryptographiques

`getAccessToken` → JWT court (~15 min), portée document, identité user,
utilisable en `?auth=` sur l’API REST.

- Mint **uniquement depuis un widget déjà dans le doc**.
- Utile pour un **lien temporaire** après config — **pas** pour une iframe
  permanente collée dans un site.
- Clé API compte : inadaptée au navigateur (CORS `Authorization`) et dangereuse
  en URL. Atlas REST utilise encore Bearer aujourd’hui ; le chemin navigateur
  serait `?auth=` **si** un mint / renouvellement existait.

### 4.3 Exposition choisie (recommandée pour embed vivant)

Modèle **natif Grist**, pas propre à Atlas :

1. Doc métier reste propriétaire (owners / éditeurs).
2. **Public Access = Viewer** (si besoin d’anonymes) **+ Access Rules**
   deny-by-default.
3. Exposer seulement tables / colonnes / lignes voulues.
4. Option **link keys** : `?UUID_=…` dans l’URL → `user.LinkKey` dans les règles
   → **une tranche par lien** (destinataire, chantier, zone).

Les ACL s’appliquent au widget et à l’API : Atlas n’affiche que ce que le
serveur laisse passer — **testable sans toucher au code Atlas**.

Link keys : **pas** d’UUID obligatoire sur toutes les tables Atlas. UUID (ou
équivalent) seulement sur les tables métier qu’on découpe. Tables système
(`Atlas_LayerPrefs`, `Atlas_Story`, …) : souvent refusées au public, ou lecture
globale selon le besoin.

### 4.4 UX dans le widget Atlas

| Dans Atlas (futur) | Chez Grist (reste) |
|---|---|
| Parcours « Partager / Intégrer » | Access Rules, Public Access |
| Copier URL embed / singlePage + link key | Formules `user.LinkKey…` |
| Aide / checklist auteur | Toggle partage document |

Ne **pas** réimplémenter l’éditeur ACL dans Atlas.

---

## 5. Synthèse des voies d’intégration

```
                    ┌─────────────────────────────┐
                    │  Page tierce / site / hub   │
                    └─────────────┬───────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
   iframe DOCUMENT           iframe ATLAS nu         Pack / ?scene=
   embed | singlePage        (+ auth JWT ?)           static / fichier
          │                       │                       │
   session + ACL Grist      limité / temporaire      pas de doc
   stream vivant            ou proxy serveur         scène figée
```

| Besoin | Voie |
|---|---|
| Doc privé, droits user, Atlas vivant | iframe **document** (+ ACL / link keys) |
| Atlas sans chrome, scène publiée | `?scene=` / pack A·B·C |
| Lien ponctuel après config | JWT `getAccessToken` (expire) |
| Stats / collab / partage org | **Grist**, pas Atlas |

---

## 6. Décisions actées (session)

1. Stats / partage / collab = **Grist** ; portable = plus Atlas.
2. Matrice A/B/C d’abord ; schéma = **Scene Manifest existant**.
3. Component Manifest hub : **hors contrat Atlas** ; généraliser avant publier ;
   propriété hors Widgets-Grist sauf miroir.
4. Embed privé durable = **session document** + ACL / link keys, pas JWT figé.
5. Link keys / ACL = **natif Grist** ; testable sans code ; UX partage = Atlas
   plus tard, pas l’éditeur de règles.
6. Récit multimédia = extension **optionnelle** de `story.steps`, orthogonal
   aux hôtes.

---

## 7. Ouvert / à ne pas confondre

- Renouvellement JWT pour Atlas nu (bootstrap Grist ou backend) — pas tranché.
- Print PDF, CSV géocodé en portable — backlog.
- Catalogue WMTS — déjà dans ETAT-DES-LIEUX §6.1, orthogonal.
- Publier `published/atlas/` à jour — prérequis visible avant d’empiler
  (ETAT-DES-LIEUX §7).

---

## 8. Vitrine publique (`/w/atlas/`) — contenu à réaligner

Source : `published/atlas/vitrine.json` → `node scripts/generate-vitrine.js`.
Page : https://nic01asfr.github.io/Widgets-Grist/w/atlas/

### 8.1 Problèmes constatés

| Élément actuel | Problème | Correction |
|---|---|---|
| Image « Diffuser » (`dans-grist.jpg`) | Montre le **cadre Grist** + liste des tables (`SceneManifest`, etc.) — maladroit pour « diffusion propre » | Réaffecter à **Construire / persistance** : la carte vit *dans* le document, à côté des tables |
| Texte `?embed=true&style=singlePage` | Deux modes **distincts** présentés comme un seul ; « sans compte » seulement si Public Access | Recadrer (voir §8.2) |
| Aperçu `?vitrine=1` seul | Atlas **vide** : OSM / GeoJSON à charger à la main | Galerie de scènes démo → `?vitrine=1&scene=…` |
| Pitch « tout est le document » | Incomplet depuis le stream distant / `?scene=` | Nuancer : socle Grist + scènes portables |

### 8.2 Paramètres d’URL — formulation juste pour la vitrine

| Paramètre | Effet | Quand l’annoncer |
|---|---|---|
| `?embed=true` | Contour minimal, **lecture forcée** | Lien grand public / lecture seule |
| `?style=singlePage` | Contour minimal, **suit les droits** de la session | Intranet / collab (éditeur reste éditeur) |
| Public Access + ACL / link keys | Anonyme possible, tranche choisie | Doc volontairement exposé |
| `?scene=<url>&vitrine=1` | Atlas **sans** document | Démo vitrine, hub, pack publié |

Ne plus écrire « embed=true&style=singlePage » comme recette unique.

### 8.3 Répartition des illustrations

| Section vitrine | Image / démo | Message |
|---|---|---|
| **Construire** | Cadre Grist + tables visibles (actuelle `dans-grist.jpg`) + UI édition / 3D | Persistance : tables = couches ; édition bidirectionnelle |
| **Diffuser** | Atlas **plein cadre** (badge Lecture, sans sidebar tables) *ou* iframe `?scene=` | Diffusion propre ; pas le chantier interne |
| **Relever** | Mobile (inchangé) | Terrain / APK |
| **Aperçu tête** | Galerie miniatures → charge scène dans l’iframe | Ne pas ouvrir vide |

### 8.4 Galerie de scènes démo (capacités d’affichage)

Héberger sous p.ex. `published/atlas/demos/` des Scene Manifest 0.2.2
(couches `inline` / `url` / `xyz` — **pas** `table`). L’aperçu bascule :

`…/atlas/?vitrine=1&scene=…/demos/<id>/scene.json`

| Id démo (proposé) | Capacité illustrée |
|---|---|
| `points-lignes-surfaces` | Carto 2D classique (point, ligne, polygone) + légende / contrôles |
| `extrusion-25d` | Surfaces en volume / 2.5D, relief |
| `modeles-3d` | Points + GLB / catalogue 3D, soleil |
| `recit` *(optionnel)* | Étapes caméra + filtres (si le manifeste porte `story`) |
| `distante` *(optionnel)* | Couche URL (ex. Sète) — stream sans doc |

Chaque carte : miniature (PNG) + titre + une ligne d’usage.  
Extension générateur : `produit.apercu.scenes[]` + JS de bascule `iframe.src`
(aujourd’hui un seul `apercu.url`).

### 8.5 Ordre de mise à jour vitrine

1. **Texte** `vitrine.json` — **fait** (26/08) : pitch, Diffuser (embed ≠
   singlePage), parcours, chiffres « 3 voies », `dans-grist.jpg` → Construire,
   mention aperçu honnête.
2. **Réaffecter** illustrations Diffuser — **en attente** d’une capture
   « lecture / plein cadre » (sans barre de tables).
3. **Une** scène démo + miniature → clic charge l’iframe (`?vitrine=1&scene=`).
4. **Galerie** multi-scènes (capacités §8.4) + extension `generate-vitrine.js`.

### 8.6 Première scène démo — sources autorisées

**Interdit** : réutiliser un **document Grist** existant (Bee Farming, SEVI,
non-régression…) — ni export opportuniste depuis ces docs.

**Autorisé**

| Source | Exemple |
|---|---|
| Projet / scène **déjà publiée** hors Grist (hub, Pages, open data) | Manifeste + GeoJSON URL publics |
| **Recréation** dédiée vitrine | Jeu métier autonome, inventé ou open data, pack `inline` sous `demos/` |

**Rejeté** : géométries abstraites sans propos (ex. Pharo jouet).

**Critères** (inchangés) : propos métier ; P+L+S ; symbologie / contrôles qui
servent le propos ; Atlas apporte la solution (vue + filtres + récit possible) ;
pack portable sans `source.table`.

#### Option A — scène publiée existante (hors Grist)

Ex. hub qgis-sspcloud **Sète** (bâti BD TOPO + hauteurs, stream déjà éprouvé).
À compléter si besoin d’autres couches publiques (voirie, points d’intérêt) pour
couvrir ligne / point — sinon rester honnête : démo **2.5D bâti distant**.

#### Option B — recréation dédiée (recommandée pour la vitrine)

Inventer un mini-territoire **crédible** (pas un clone d’un doc interne), par ex.
*« Visites terrain — prévention inondation / commune fictive »* :

| Couche | Géométrie | Affichage |
|---|---|---|
| Zones inondables / enjeux | surface | catégorisé ou gradué |
| Cours d’eau / digues | ligne | style métier |
| Visites / ouvrages / repères | point | catégorie + contrôle filtre |
| (+ option) Bâti extrudé | surface 2.5D | hauteur |

Géométries : dessin manuel léger **ou** extrait open data anonymisé (OSM /
data.gouv) **reworké** — pas un dump d’un projet Grist. Attributs rédigés pour
le récit de démo. Tout en `inline` dans `published/atlas/demos/<slug>/`.

#### Veille web — projets / données publics (26/08)

| Source | Contenu | P/L/S | Licence | Intérêt Atlas |
|---|---|---|---|---|
| [Géorisques / TRI](https://www.georisques.gouv.fr/donnees/bases-de-donnees/zonages-inondation-rapportage-2020) | Zones inondables, enjeux | surtout S | ouverte | Métier prévention ; souvent SHP → convertir + découper |
| [API Géorisques](https://www.data.gouv.fr/dataservices/api-georisques) | Risques par commune / latlon | API | ouverte | Enrichir attributs, pas un pack complet |
| [PPRN Isère GeoJSON](https://catalogue.open-datara.fr/geonetwork/srv/api/records/139ae225-2bcb-44c5-a81a-fa1385e09f7c) | Zonage réglementaire | S | Licence Ouverte | Prêt GeoJSON régional |
| [Transport stops + lignes](https://www.data.gouv.fr/datasets/position-des-arrets-de-transport-et-traces-de-lignes) | Arrêts + tracés GTFS fusionnés | P+L | ODbL | Multi-types natif ; lourd → filtre ville |
| [VCUB Bordeaux](https://transport.data.gouv.fr/datasets/station-le-velo-en-temps-reel-1) | Stations vélo (points) | P | ouverte | Déjà cité Ma carte ; à croiser avec autres couches BM |
| [Natural Earth](https://www.naturalearthdata.com/) | Pays, villes, rivières | P+L+S | domaine public | Démo « monde » pédagogique, moins FR métier |
| [Ma carte Atlas](https://macarte.ign.fr/) | Cartes utilisateurs export GeoJSON/KML | variable | selon auteur | Pister une carte narrative + export calques |
| Hub Sète (SSP Cloud) | Bâti BD TOPO + hauteur (~550 Ko) | S (+xyz) | contexte hub | Stream distant déjà OK ; pas multi-types seul |

**Piste forte pour un pack vitrine** : composer un territoire FR (ex. métropole) en
combinant **open data locaux** (ex. stations + lignes TC + zonage risque ou
hydro) découpés sur une bbox, plutôt qu’un seul jeu national trop gros.

#### Démo OSM 3D réalisée (26/08) — Vieux-Port Marseille

Pack local (hors Grist) : `projects/Atlas/demos/osm-marseille-vieux-port/`

- Overpass → bâti (`height_m`) + voirie + landmarks · Scene Manifest 0.2.2 + récit 4 étapes
- Greffes Atlas : `style.polygonMode` / `height_field` hors-table ; `?scene=` charge `story.steps` ; URLs relatives résolues
- Lancer : `python -m http.server 8899` dans `projects/Atlas`, puis
  `index_v7.html?mode=view&scene=http://127.0.0.1:8899/demos/osm-marseille-vieux-port/scene.json`

---

## Références

- `docs/ETAT-DES-LIEUX-ET-USAGES.md`
- `docs/CADRAGE-SCENE-EXTERNE-ET-DECOUPLAGE.md`
- `docs/CADRAGE-BRIQUES-TRAVAIL.md` (jeton, CORS)
- `lib/data-client.js` (grist / rest, CORS)
- Spec Scene Manifest : `projects/qgis2grist/docs/SCENE-MANIFEST-v0.2.2.md`
- Canvas session : `atlas-portable-matrice`, `atlas-vs-macarte-ign`,
  `atlas-cadrage-reflexion-2026-08-26`
- Vitrine : `published/atlas/vitrine.json`
- Grist : [Embedding](https://support.getgrist.com/embedding/),
  [Access rules](https://support.getgrist.com/access-rules/),
  [Link keys](https://support.getgrist.com/examples/2021-04-link-keys/)
