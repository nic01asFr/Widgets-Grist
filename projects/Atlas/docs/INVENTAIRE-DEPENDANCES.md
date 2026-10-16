# Inventaire des dépendances d'Atlas

Écrit pour les personnes qui intègrent Atlas, l'auditent ou le redistribuent. Un test (`tests/inventaire-dependances.test.js`) garde ce document à jour : toute bibliothèque embarquée et tout hôte externe cité dans le code doivent y figurer.

## 1. Bibliothèques embarquées (aucun téléchargement au démarrage)

Elles sont servies par Atlas lui-même, depuis `vendor/`, à version figée. Le manifeste est `projects/Atlas/vendor-externe.json` ; l'empreinte SHA-384 et la taille de chaque fichier sont dans `vendor/verrou-externe.json`, et le texte des licences dans `vendor/LICENCES.txt`.

| Bibliothèque | Version | Licence | Usage |
|---|---|---|---|
| maplibre-gl | 5.6.1 | BSD-3-Clause | la carte |
| suncalc | 1.8.0 | BSD-2-Clause | position du soleil |
| three | 0.160.0 | MIT | objets 3D, éclairage, trafic |
| terra-draw | 1.35.0 | MIT | dessin et modification des géométries |
| terra-draw-maplibre-gl-adapter | 1.4.1 | MIT | liaison de terra-draw à MapLibre |
| geotiff | 2.1.3 | MIT | lecture des modèles numériques de terrain (worker) |

Polices (SIL OFL 1.1), sous-ensembles latin et latin étendu : Newsreader, Hanken Grotesk, JetBrains Mono.

Le moteur de formulaires (`vendor/grist_forms/`) est du code du même dépôt, figé à la version publiée.

Deux adresses de `cdn.jsdelivr.net` restent dans le code comme **replis** (worker GeoTIFF, transcodeur de textures KTX2) : la page publiée les remplace par `vendor/` et elles ne sont jamais contactées ; un test le garde.

## 2. Services contactés pendant l'usage

Atlas ne dépend d'aucun service pour **démarrer** ; ceux-ci sont sollicités selon ce que fait la personne ou ce que déclare la scène. Hors ligne, la carte retombe sur un fond uni.

| Hôte | Pour quoi | Quand |
|---|---|---|
| `docs.getgrist.com` | API de plugin de Grist (`grist-plugin-api.js`) | application dans Grist ; **pas** en mode composant (`bi=1`) |
| `tiles.openfreemap.org` | fond de carte vectoriel (OpenStreetMap, OpenMapTiles) | fond par défaut |
| `demotiles.maplibre.org` | polices des étiquettes du style de repli hors réseau | fond de repli |
| `data.geopf.fr` | Géoplateforme de l'IGN : données BD TOPO et Admin Express, itinéraire, relief | import IGN, relief IGN |
| `nominatim.openstreetmap.org` | recherche de lieux | recherche d'un lieu |
| `overpass-api.de` | import de données OpenStreetMap | import OSM |
| `s3.amazonaws.com` | tuiles d'altitude (terrarium) | relief mondial |
| `github.com`, `nic01asfr.github.io`, `cartes.gouv.fr`, `www.openstreetmap.org` | liens affichés ou ouverts par la personne | clic sur un lien |

Les hôtes `*.example`, `localhost`, `www.opengis.net`, `www.topografix.com`, `json-schema.org` et `x.org` ne sont pas des services : ce sont des exemples de documentation, des espaces de noms XML ou des identifiants de schéma.

## 3. Ce que l'hôte d'une application intégrée doit autoriser

Une politique de contenu stricte (`Content-Security-Policy`) doit laisser passer, dans le cadre d'Atlas, les hôtes du §2 que les usages choisis sollicitent. Pour une carte BI qui n'importe rien : l'origine d'Atlas et le fond de carte (`tiles.openfreemap.org`) ; ni `docs.getgrist.com` ni les CDN ne sont nécessaires.
