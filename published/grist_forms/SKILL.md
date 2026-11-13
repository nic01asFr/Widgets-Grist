---
name: forms
description: "Form Builder : Compose un formulaire Grist, le relie à sa table, le publie dans le document et relit les réponses. Ces commandes ne font que lire et calculer : elles rendent des plans, elles n’écrivent rien dans un document."
---

# Form Builder

Compose un formulaire Grist, le relie à sa table, le publie dans le document et relit les réponses. Ces commandes ne font que lire et calculer : elles rendent des plans, elles n’écrivent rien dans un document.

Version 1.8.0. Généré depuis `fiche-capacites.json` (contrat fiche-capacites-0.1) et `commandes.json` : ne pas modifier à la main.

## Interfaces

- ce skill : disponible.
- ligne de commande : disponible.
- serveur MCP : disponible.
- page WebMCP : disponible.
- annexe « Pour un agent » de la vitrine : disponible.

## Commandes

### presenter

- `forms_capacites` : Présente Form Builder : ce qu’il sait faire (les commandes par verbe), ce qu’il ne couvre pas encore, les contrats qu’il produit et lit, ses limites. À appeler en premier.
  Entrée requise : aucune ; calcul pur ; n’écrit rien.

### configurer

- `forms_plan_schema` : Calcule le plan d’actions Grist qui crée la table et les colonnes manquantes d’un FormDef. Il ne lit AUCUN document : il compare le FormDef à `colonnes_existantes` et `table_existe`, que l’appelant doit fournir. Sans eux, il suppose une table sans colonne et prévoit un AddColumn par champ, sans AddTable. Il rend le plan sans l’appliquer ; il ne change jamais le type d’une colonne existante. Il refuse (`ok: false`, `errors`) un Choice ou ChoiceList sans liste de choix (dans `choices[colId]` à la racine ou `options.choices` du champ).
  Entrée requise : `formdef` ; calcul pur ; n’écrit rien.

### creer

- `forms_formdef_depuis_colonnes` : Déduit un FormDef des colonnes d’une table Grist (une question par colonne, hors colonnes internes et colonnes calculées). Rend `formdef: null` quand aucune colonne ne donne de question. Les choix d’une colonne Choice ou ChoiceList sont lus dans son `widgetOptions` (chaîne JSON `{"choices":["a","b"]}`) et rangés dans `options.choices` du champ ; sans `widgetOptions`, le champ n’a pas de choix et forms_plan_schema le refusera. La racine `choices` du FormDef rendu reste `{}` : les choix vivent dans le champ.
  Entrée requise : `tableId`, `colonnes` ; calcul pur ; n’écrit rien.
- `forms_formdef_depuis_formulaire_grist` : Lit les formulaires natifs d’un document Grist et rend chacun en FormDef. L’entrée est le contenu des tables de métadonnées (tables, colonnes, vues, sections, champs), tel que fetchTable le rend.
  Entrée requise : `meta` ; calcul pur ; n’écrit rien.

### structurer

- `forms_valider_formdef` : Contrôle un FormDef contre son contrat (formdef-1.0) et rend les écarts. `conforme` ne dit QUE le respect du contrat : il ne garantit pas que forms_plan_schema produira un plan. `plan_realisable` dit si le plan serait calculé sur une table à créer, et `avertissements` rend les motifs de refus du plan (par exemple « choices manquants » pour un Choice sans choix). Un FormDef conforme rend une liste d’écarts vide.
  Entrée requise : `formdef` ; calcul pur ; n’écrit rien.
- `forms_besoins_hote` : Dit ce qu’un FormDef demande à son hôte : micro, caméra, position, scan, et les services de transcription et de lecture d’un texte. Sans `hote`, rend ce que le formulaire demande (`saisies`, `capacites_requises`, `services_requis`). Avec `hote` (sa déclaration : capacités vraies ou fausses, services avec leur `sortant`), dit pour chaque saisie si elle sera servie (`mode` direct) ou remplacée (`mode` repli) et par quoi, et liste ce qui manque (`manquants`). Une saisie à qui il manque une capacité retombe toujours sur un champ ordinaire, jamais sur une erreur : c’est le repli. Un widget Grist ne déclare aucune capacité de capteur (mesuré). La déclaration ne porte jamais de clé, d’adresse ni de nom de modèle : ce qui en porte est écarté et dit dans `ecarts`. Aucune capture ne se pilote par commande : un agent n’a pas de micro, il passe la valeur directement.
  Entrée requise : `formdef` ; calcul pur ; n’écrit rien.
- `forms_valider_condition` : Contrôle une condition d’affichage (grammaire conditions-1.0). Rend les erreurs avec leur chemin ; `bloquant` dit si la condition serait refusée. Un opérateur inconnu est une faute, jamais « vrai ».
  Entrée requise : `condition` ; calcul pur ; n’écrit rien.
- `forms_verifier_format` : Éprouve une valeur contre un format nommé (iban, siren, siret, codePostal, insee, heure, courriel, nom, prenom, nomComplet, telephone) et rend la forme normalisée. Un format inconnu laisse tout passer et le dit (`connu: false`). `message_si_invalide` est le message à montrer si la valeur est invalide, pas un verdict : le verdict est `valide`. Pour attacher un format à une question d’un FormDef, ajouter au champ `validation: { "format": "courriel" }` (mode `verifier` par défaut : une réponse non conforme est refusée ; `corriger` remet la forme en ordre sans refuser, réservé aux noms).
  Entrée requise : `format`, `valeur` ; calcul pur ; n’écrit rien.
- `forms_formdef_vers_manifeste_enquete` : Convertit un FormDef en manifeste d’enquête (survey-manifest). Sens inverse : forms_manifeste_enquete_vers_formdef.
  Entrée requise : `formdef` ; calcul pur ; n’écrit rien.
- `forms_manifeste_enquete_vers_formdef` : Convertit un manifeste d’enquête en FormDef. Sens inverse : forms_formdef_vers_manifeste_enquete.
  Entrée requise : `manifeste` ; calcul pur ; n’écrit rien.

### personnaliser

- `forms_resoudre_theme` : Dérive les variables de thème (--kit-*) d’un ThemeDef 1.0 à partir de ses couleurs de départ, pour un mode clair ou sombre. Un thème illisible est refusé en entier.
  Entrée requise : `themedef` ; calcul pur ; n’écrit rien.

### publier

- `forms_plan_publication` : Calcule les actions qui créent une page personnalisée liée à une table, et les options de la vue qui porte le formulaire (HTML et JS déjà assemblés). Il rend le plan sans l’appliquer.
  Entrée requise : `table_ref`, `html`, `js` ; calcul pur ; n’écrit rien.

### traiter

- `forms_synthese` : Relit les réponses d’un formulaire avec le FormDef qui les a produites : fréquences, échelles, classements, listes. La table seule n’est pas lisible, le FormDef sait ce que chaque colonne veut dire.
  Entrée requise : `formdef`, `lignes` ; calcul pur ; n’écrit rien.

## Non couvert

Verbes sans commande : editer, exploiter, recolter.

## Limites

- Version 1 en lecture seule : aucune commande n’écrit dans un document Grist.
- Appliquer un plan de schéma ou de publication n’est pas encore une commande.
- Le formulaire vivant (rendu, saisie, envoi) ne se pilote pas par ces commandes : il vit dans une page.
- Aucune capture ne se pilote par commande : un agent n’a pas de micro ni de caméra, il passe la valeur directement.
- Les commandes ne se connectent à aucun document : les tables et les réponses sont données en entrée.

## Règles d’écriture

- Appeler `forms_capacites` (ou la commande de présentation) avant toute autre : elle dit ce que cette version sait faire.
- Ne citer que les commandes listées ci-dessous, avec leur nom exact ; ne jamais en inventer une.
- Donner à chaque commande une entrée conforme à son schéma ; en cas d’erreur, relire le message et corriger l’entrée plutôt que réessayer à l’identique.
- Écrire en français, sans jargon, dès que le résultat est destiné à une personne.
- Annoncer à la personne ce qui sera écrit dans un document avant de l’écrire, et seulement quand la commande est marquée comme écrivant.

## Interdits

- Ne jamais promettre un refus côté serveur des valeurs invalides : sans contrôle dans le document, une valeur invalide est acceptée.
- Ne jamais deviner un identifiant de document, de table ou de colonne : le demander ou le lire.
- Ne jamais présenter comme fait un verbe de la section « Non couvert » : le dire, et proposer l’interface qui le couvre quand il en existe une.
- Ne jamais publier ni envoyer ailleurs sans l’accord explicite de la personne.
