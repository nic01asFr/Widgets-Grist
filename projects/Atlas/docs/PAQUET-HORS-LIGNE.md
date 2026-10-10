# Paquet hors ligne : artefact `donnees`

Un **dossier ordinaire** (sans git ni npm) que l'application hôte copie tel quel : contours et populations des unités administratives pour le composant carte BI, utilisables sans réseau. Il est produit par un outil rejouable ; **on ne versionne pas les départements** (20 Mo pour la France entière) : on versionne le manifeste, le client et le vérificateur, et on régénère les fichiers utiles.

## Construire

```
node tools/construire-paquet.mjs --sortie <dossier> [--departements 13,15,63,70,71,89 | --communes 70001,19272]
                                 [--produit pe|carto] [--edition 2026] [--version-paquet 1.0.0] [--socle <dossier des jeux légers>]
```

- Sans `--departements` ni `--communes` : France entière (101 départements : 01 à 95 avec 2A et 2B, puis 971 à 976), environ 20 secondes, 19,5 Mo.
- `--communes` : seuls ces codes INSEE sont gardés dans leurs départements (déduits des codes si `--departements` est absent).
- `--produit pe` (défaut) : ADMIN EXPRESS « petite échelle ». `carto` est plus fin et plus lourd ; il n'est pas mesuré pour les communes.
- Une construction qui échoue n'écrit rien : le dossier est monté à côté puis renommé. Un dossier de sortie non vide qui n'est pas un paquet est refusé.
- Le seul accès réseau est le WFS de l'IGN (Géoplateforme), sans clé. Les jeux du socle viennent d'Atlas (`lib/bi/donnees/`).

## Vérifier

```
node tools/verifier-paquet.mjs <dossier>
```

Script **autonome** (il n'importe rien d'Atlas : l'hôte peut le copier). Il contrôle : manifeste lisible, chemins relatifs sans `..`, sans `\`, sans lettre de lecteur ; fichier présent ; **taille exacte** (une copie tronquée se voit avant le calcul) ; empreinte SHA-384 ; aucun fichier non listé ; cohérence de `cache.txt` et de `cache-socle.txt`.

## Contenu

| Fichier | Portée | Rôle |
|---|---|---|
| `manifeste.json` | – | décrit le paquet (voir ci-dessous) |
| `LICENCES.txt` | france | licences et attributions à reprendre dans l'application |
| `cache.txt` | – | tous les fichiers du manifeste, un chemin par ligne (`#` = commentaire) |
| `cache-socle.txt` | – | le minimum pour démarrer hors ligne : le socle et les licences |
| `donnees/pays-leger.json`, `regions-leger.json`, `departements-leger.json`, `references-population.json` | france | socle embarqué d'Atlas |
| `donnees/communes/<département>.json` | departement | communes d'un département, et les arrondissements municipaux pour 75, 69 et 13 |

### Entités d'un fichier de communes

`FeatureCollection` avec `meta` (source, licence, département, produit, recensement, décimales) et des `Feature` dont les `properties` sont réduites à : `code` (INSEE, 5 caractères), `nom`, `population`, `niveau` (`commune` ou `arrondissement`) et, pour un arrondissement seulement, `commune` (code de la commune de rattachement : 75056, 69123, 13055). Coordonnées arrondies à 4 décimales (environ 11 m) : ne convient pas à un usage cadastral.

Paris, Lyon et Marseille sont présents **comme communes et comme arrondissements** (20, 9 et 16) dans `75.json`, `69.json` et `13.json`. Les codes ne se télescopent pas, mais les polygones se recouvrent : voir le contrat BI (section couches administratives) avant de fournir les deux niveaux dans une même couche.

### Manifeste

```json
{
  "format": "atlas-bi-paquet/1",
  "version_paquet": "1.0.0",
  "version_contrat": "0.3",
  "version_charte": "0.1",
  "edition_admin_express": "2026",
  "produit_contours": "pe",
  "recensement": "2023",
  "construit_le": "2026-10-10T07:37:43.422Z",
  "territoires": { "departements": ["13", "70"], "communes": 1234, "arrondissements": 16 },
  "fichiers": [ { "chemin": "donnees/communes/70.json", "taille": 276349, "integrite": "sha384-<base64>", "portee": "departement", "departement": "70" } ]
}
```

`integrite` suit le format de l'attribut HTML `integrity`. `edition_admin_express` est celle du socle embarqué (déclarée, pas lue du service) ; `recensement` est lu sur les données du service. À afficher à côté d'une population.

## Stabilité

Le format `atlas-bi-paquet/1` est stable : un champ peut être **ajouté** au manifeste sans changer le format, un champ existant ne change ni de nom ni de sens. Un changement incompatible passerait par `atlas-bi-paquet/2`. Les options de l'outil ne sont pas retirées sans préavis dans le fil des hôtes.

## Ce que le paquet ne contient pas (encore)

`client/` (client JavaScript et élément `<atlas-bi>`) et `composant/` (Atlas vendorisé sans CDN) : lots suivants. Aucun fond de carte vectoriel : hors ligne, fond uni et contours.
