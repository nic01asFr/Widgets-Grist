# Cadrage : le thème maison de la vitrine (posé à la génération)

Statut : cadrage court, 01/11/2026. Rien n'est codé ; rien n'est publié. Complète
[CADRAGE-THEME-VISITEUR.md](CADRAGE-THEME-VISITEUR.md), qui ne traite que le thème choisi par la personne sur son appareil.

## 1. Le besoin

Le site public a une identité par défaut : celle que voit quelqu'un qui n'a rien choisi. Aujourd'hui elle est écrite en dur dans la feuille du
générateur (`scripts/generate-vitrine.js`, peau par défaut et `PEAU_MAISON` pour les pages qui en demandent une). Un « thème maison » en fait un
ThemeDef, la même donnée que tout le reste, au lieu de variables CSS propres à la vitrine.

## 2. L'ordre des couches (du plus faible au plus fort)

1. **Peau du widget** : ce que la fiche du widget prévoit (accent, police d'affichage).
2. **Thème maison** : un ThemeDef commité dans le dépôt, projeté en variables de page **à la génération** (dans le HTML, pas dans un script).
3. **Thème du visiteur** : celui de [CADRAGE-THEME-VISITEUR.md](CADRAGE-THEME-VISITEUR.md), posé par le script d'en-tête, seulement avec `?vitrine=1`, hors Grist.
4. **Préférences de la personne** : contraste forcé ou renforcé, mode sombre du système. Elles l'emportent toujours : rien n'est posé par-dessus.

Chaque couche ne fait que recouvrir la précédente. Retirer une couche ne doit jamais laisser une page illisible : la couche du dessous reste lisible seule.

## 3. Règles

- **Le thème maison est un ThemeDef complet, avec `resolu` et hash.** Le compilateur du kit n'est pas importable dans le dépôt public ; le thème est donc
  compilé en local, puis commité. Le générateur ne croit pas `resolu` : il le mesure avec le lecteur de production (22 paires) et **échoue la
  génération** si le thème est refusé, au lieu de publier une page illisible.
- **Même projection que le visiteur** : les 7 variables (`--papier`, `--surface`, `--encre`, `--plume`, `--filet`, `--accent`, `--sur-accent`), une seule
  fonction (`ThemeVisiteur.varsVitrine`), donc une seule table de correspondance à maintenir.
- **Sans thème maison, rien ne change** : les pages sont identiques à l'octet (test existant). Le thème maison est opt-in par page ou par site.
- **Aucun nom d'organisation** dans le thème, ses libellés ni ses commits (voir le statut juridique du dépôt).
- **Les démonstrations n'en dépendent pas** : une démo qui lit `--kit-*` suit l'hôte ; rien n'est branché sans l'accord de son propriétaire.

## 4. Ce qui reste à trancher (Nicolas)

- **D1.** Qui définit le thème maison par défaut : neutre, celui de l'auteur, ou aucun (la peau actuelle reste).
- **D2.** Un thème pour tout le site, ou un par widget (fiche `vitrine.json`).
- **D3.** Où vit le fichier (`published/accueil.json` ou un `published/theme-maison.json` dédié) et qui peut le modifier.

## 5. Ordre de réalisation proposé

1. Test d'abord : un thème maison refusé fait échouer la génération ; un thème valide produit les 7 variables dans le HTML ; sans thème, octet pour octet.
2. Générateur : lire le ThemeDef, projeter, poser en `<style>` dans l'en-tête (avant le script du visiteur, qui garde la priorité).
3. Vérification en navigateur, clair et sombre, avec et sans thème visiteur, avec contraste forcé.
4. Publication : avec le lot 1.6.0, à date commune avec Atlas-BI, après accord explicite.
