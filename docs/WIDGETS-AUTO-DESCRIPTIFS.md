# Widgets auto-descriptifs : présenter et piloter un widget par des interfaces dédiées

**Statut : PROPOSITION (01/11/2026), à arbitrer.** Rien n'est implémenté ni publié. Cette spécification fixe le vocabulaire et les règles communes ; chaque widget l'applique à son rythme, après la publication commune en cours. Les noyaux et les commandes de chaque widget sont décrits dans leur propre `CLAUDE.md` une fois réalisés.

## 1. Objet

Un widget ne se résume pas à une page ouverte dans Grist. Chaque widget doit pouvoir **se présenter** (ce qu'il est, ce qu'il sait faire, des exemples, ses limites) et **se laisser utiliser de bout en bout**, par une personne ou par un agent IA : configurer, créer, éditer, structurer, personnaliser, publier, exploiter, récolter, traiter.

Le dépôt fait la même chose à l'échelle d'une **application Grist complète** (plusieurs widgets, un modèle de données, des droits, un thème).

## 2. Les interfaces

| Interface | Pour qui | Rôle |
|---|---|---|
| Skill | un agent IA | consignes : quoi lire, quoi appeler, dans quel ordre, quoi ne pas faire |
| Serveur MCP | tout client MCP | les commandes du widget, appelables |
| Ligne de commande | scripts, intégration continue, agent sans serveur | les mêmes commandes, code de sortie exploitable |
| Page WebMCP | agents du navigateur, consultation sans service | les mêmes commandes dans une page statique, plus `llms.txt` |
| Vitrine | une personne | présentation, exemples, captures, pas à pas |

Chacune est un **produit du dépôt** : généré, versionné avec le widget, gardé contre la péremption par un test, promu à la publication. Le skill n'est pas une note à part : c'est un `SKILL.md` GÉNÉRÉ depuis la fiche et la liste des commandes (comme `llms.txt` et la vitrine), à partir d'un gabarit commun du dépôt pour les règles d'écriture et les interdits.

Les cinq lisent la même source : **un noyau pur** (sans DOM, sans `grist.*`) et **un registre de commandes**. La vitrine est GÉNÉRÉE depuis la fiche de capacités (§4), jamais l'inverse : une seule source de texte.

## 3. Le registre de commandes

Une liste unique ; chaque commande porte :

| Champ | Contenu |
|---|---|
| `nom` | préfixé par le widget : `atlas_…`, `forms_…`, `taskflow_…`, `appkit_…` |
| `verbe` | un verbe du cycle de vie (§5) |
| `description` | ce que fait la commande et quand l'employer, en français |
| `entree` / `sortie` | schémas JSON ; un objet défini par un contrat du dépôt est référencé (§6), jamais recopié |
| `nature` | `pure` (exécutable sans page : CLI, MCP) ou `exige-la-page` (carte ou formulaire vivant : WebMCP ou pont `postMessage` seulement) |
| `ecrit` | `rien`, ou ce qu'elle écrit (une table, un document, un fichier) |
| `exemples` | au moins un appel minimal et sa sortie ; écrits pour la fiche, jamais tirés des tests (§7) |
| `profils` | facultatif : les expositions où la commande existe (ex. Atlas : `bi`, `complet`, `application`) ; hors profil, refus typé comme `capacite_absente` |

Règles : lecture seule par défaut ; toute écriture est une commande distincte, nommée comme telle, qui dit ce qu'elle écrit ; la parité (§7) ne compare que ce que chaque interface peut réellement exécuter (pour un widget dont presque toutes les commandes sont `exige-la-page`, comme Atlas, elle ne couvre qu'un petit sous-ensemble, et la fiche le dit) ; si un widget a déjà un registre (ex. le pont de la carte BI d'Atlas), on part de celui-là.

## 4. La fiche de capacités (`fiche-capacites`)

Fiche lisible par une machine et par une personne, schéma versionné COMMUN à tous les widgets, avec vecteurs rejoués.

```json
{
  "contrat": "fiche-capacites-0.1",
  "widget": "forms",
  "version": "1.6.0",
  "presentation": { "titre": "…", "resume": "…" },
  "verbes": {
    "presenter": ["forms_capacites"],
    "creer": ["forms_formdef_depuis_table"],
    "publier": []
  },
  "non_couverts": ["traiter"],
  "contrats": {
    "produit": [{ "nom": "FormDef", "version": "1.0", "catalogue": true }],
    "lit": [
      { "nom": "FormDef", "version": "1.0", "catalogue": true },
      { "nom": "ThemeDef", "version": "1.0", "catalogue": false, "empreinte": "sha256:…" }
    ]
  },
  "interfaces": { "skill": true, "cli": true, "mcp": true, "webmcp": true, "vitrine": true },
  "prerequis": { "acces_grist": "full", "tables": ["…"] },
  "limites": ["…"],
  "exemples": ["…"]
}
```

`interfaces` (facultatif en 0.1) dit lesquelles des cinq le widget fournit réellement ; une interface à `false` est dite, pas passée sous silence. Un verbe sans commande est listé dans `non_couverts` : il n'est pas passé sous silence.

Le mot `capacites` reste libre pour les widgets qui l'emploient déjà autrement (Atlas : les briques chargées, renvoyées par `ping()` et refusées par `capacite_absente`) ; la fiche porte donc le nom `fiche-capacites`. Un contrat non encore au catalogue se déclare avec `catalogue: false` et son `empreinte`.

## 5. Le cycle de vie

`presenter`, `configurer`, `creer`, `editer`, `structurer`, `personnaliser`, `publier`, `exploiter`, `recolter`, `traiter`. Cas d'usage à couvrir en priorité :

- **TaskFlow** : assistant de suivi de projets ; suivi et gestion des tâches ; usage personnel ; par un agent IA ; en collaboration.
- **Atlas** : configurer et créer une carte ; l'intégrer dans un site ; créer une application cartographique ; afficher des données géographiques ; configurer un document pour le terrain ou pour une exposition.
- **Form Builder** : penser et structurer un formulaire, créer le formulaire et le document qui l'accompagne, le publier, récolter les réponses, les traiter.
- **appkit** : décrire une application déclarative, la compléter, la contrôler, l'éditer, l'exporter.

## 6. Les spécifications partagées

Tous les widgets utilisent, quand ils en ont besoin, les contrats du dépôt : ThemeDef, FormDef, Conditions, scènes, tâches, et ceux qui viendront. Le catalogue de référence est `published/schemas/index.json` (généré, avec empreinte, `produit_par`, `lu_par`). Il liste aujourd'hui FormDef 1.0, Conditions 1.0, Kit Theme 0.1 et Scene Manifest 0.2.2 ; ThemeDef 1.0 et `fiche-capacites-0.1` y entrent selon la règle 4 ci-dessous, au fil de leur publication.

1. Une commande dont l'entrée ou la sortie est un de ces objets le dit par référence au schéma du catalogue (URL et empreinte).
2. Chaque fiche `fiche-capacites` déclare les contrats qu'elle produit et ceux qu'elle lit ; un test croise `produit_par` / `lu_par` du catalogue avec les fiches.
3. Un contrat se valide par son validateur, pas par un contrôle propre au widget ; les vecteurs partagés sont rejoués par chaque lecteur.
4. Un nouveau contrat entre au catalogue avec son schéma, ses vecteurs, ses producteurs, ses lecteurs et un arbitre nommé.

## 7. Parité et garde-fous

- Un test de parité par widget (le skill généré cite exactement les commandes du registre et seulement les interfaces déclarées dans la fiche ; un `SKILL.md` périmé est refusé) : le registre, le CLI, le serveur MCP et la page WebMCP exposent les mêmes commandes avec les mêmes schémas (dans la limite de la `nature`).
- Aucun jeton Grist ni clé dans un fichier versionné ; le MCP reçoit ses accès à l'exécution.
- Les exemples ne nomment aucune organisation ni donnée réelle ; ils sont écrits à part, pas tirés des fixtures de tests.
- Une fiche qui référence un contrat porté par un hôte (ex. contrat carte BI) cite sa version et celle du client ; un changement de l'un est annoncé aux hôtes avant publication, par leur canal habituel.
- Rien n'est publié sans accord explicite ; un serveur MCP est un paquet à part, jamais déployé sans accord.
- La vitrine générée suit les règles de `skills/vitrine.md`.

## 8. Au niveau du dépôt

- Registre de registres : chaque widget déclare le sien, le dépôt les expose sous leur préfixe, avec un serveur MCP d'ensemble.
- Les ressources existantes (`skills/`, `CLAUDE.md`, `manifest.json`, `vitrine.json`) sont structurées sur ce modèle : mêmes verbes, mêmes fiches, mêmes exemples.
- Parcours transverses : monter une application de suivi, une carte de terrain avec sa saisie, un formulaire public et son traitement.
- Articulation avec l'outil de montage d'applications Grist (tables, vues, widgets, règles d'accès) : cet outil monte l'application, les widgets apportent les capacités métier ; un widget doit pouvoir dire comment le brancher à une table et le configurer.

## 9. Mise en œuvre

Un widget à la fois, en lecture seule d'abord : isoler le noyau pur, écrire le registre et la fiche, brancher le CLI, puis le MCP, puis la page WebMCP, puis générer la vitrine et le skill (générateur commun, gabarit commun). Pilote proposé : Form Builder. Ordre de départ : après la publication commune des trois widgets et accord explicite de Nicolas.

## 10. Risques et réserves

- **Dérive entre interfaces** : cinq interfaces sur une source tiennent tant que le test de parité (§7) est rejoué en intégration continue ; sans lui, la fiche, le CLI et la vitrine divergent en silence.
- **Surface d'écriture exposée à des agents** : toute commande qui écrit (§3, `ecrit`) est distincte, nommée comme telle et refusée par défaut dans le serveur MCP tant que l'hôte ne l'autorise pas.
- **Poids du noyau pur** : isoler le noyau d'un widget existant peut obliger à le découper ; on le fait widget par widget, en lecture seule d'abord, sans réécrire ce qui fonctionne.
- **Contrats non catalogués** : tant que ThemeDef et `fiche-capacites` ne sont pas au catalogue, les fiches les référencent par version et empreinte déclarées, jamais par copie.
- **Hôtes sans MCP** : la page WebMCP et le CLI couvrent le cas ; la `nature` d'une commande (§3) dit ce qui reste hors de portée.
