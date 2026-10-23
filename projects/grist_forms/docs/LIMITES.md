# Limiter le nombre de participants, de réponses, ou la durée d'ouverture

*Retour d'usage : « nombre de participants limité par atelier ». Voir aussi `docs/EXPOSITION.md` : ce qu'une personne qui répond peut voir.*

## Ce qu'on peut dire

```json
"limites": {
  "total": 40,
  "ouvertDu": "2026-11-01",
  "jusquau": "2026-11-30",
  "parChoix": [
    { "colId": "Atelier", "max": { "Cuisine": 12, "Jardin": 8 } },
    { "colId": "Salle", "capaciteCol": "Capacite" }
  ],
  "sauf": { "colId": "Statut", "valeurs": ["Annulé", "Refusé"] },
  "placeCol": "Place",
  "messages": { "complet": "Complet, merci de votre intérêt." }
}
```

| Réglage | Effet |
|---|---|
| `total` | nombre de réponses au plus ; atteint, le formulaire est remplacé par un message |
| `ouvertDu`, `jusquau` | fenêtre d'ouverture ; « jusqu'au 30 » inclut le 30 ; une date-heure vaut cette heure |
| `parChoix[].max` | un nombre (le même pour tous les choix) ou `{ choix: places }` ; un choix sans entrée est illimité |
| `parChoix[].capaciteCol` | pour une **référence** : la colonne de la table liée qui porte les places de chaque ligne — la personne qui gère les ateliers les modifie dans Grist, pas dans le formulaire |
| `sauf` | les lignes qui ne comptent pas : une annulation libère une place |
| `placeCol` | crée une colonne à formule (`Confirmé` / `Liste d'attente`), voir plus bas |
| `messages` | `complet`, `ferme`, `pasOuvert`, `choixComplet` (accepte `{choix}`) |

Le compositeur règle tout cela dans l'**accueil** du formulaire (« Limites de participation »). Une limite incomplète est dite à l'écran, jamais ignorée en silence.

## Ce que voit la personne qui répond

- Chaque choix limité annonce ses places : « Cuisine — 3 places restantes », ou « Jardin — complet » (désactivé).
- Total atteint, hors fenêtre, ou pas encore ouvert : un message à la place du formulaire (« Inscriptions complètes », « Inscriptions closes », « Pas encore ouvert — ouverture le 1er novembre 2026 »).
- À l'envoi, le formulaire **relit** ce qui est pris. Si un choix est devenu plein entre-temps, rien n'est écrit, le choix est ôté de la réponse et le message le dit.

## Ce qu'un formulaire ne sait pas faire seul

Grist accepte toute ligne que la page envoie : il n'y a pas de quota côté serveur, et deux personnes qui valident la dernière place **en même temps** la prennent toutes les deux. Les limites se tiennent donc à deux endroits :

1. **Le formulaire lit et ferme** (le geste ordinaire, qui évite presque tous les refus).
2. **La table tranche.** Avec `placeCol`, une formule range les réponses par **ordre d'arrivée** et marque chacune `Confirmé` ou `Liste d'attente`. Elle rejoue l'attribution dans l'ordre : une personne en liste d'attente ne prend la place de personne. C'est elle qui fait foi, y compris pour une page hors de Grist, qui ne peut rien refuser.

La formule est exécutée par les essais (Python), pas relue : total, choix, lignes écartées, capacité portée par une table liée, apostrophes dans les valeurs.

Elle est créée **avec** la table, et une colonne qui existe déjà n'est pas modifiée. Si les places changent dans le formulaire, la formule de la colonne `Place` garde les anciennes : la corriger dans Grist, ou supprimer la colonne puis relancer la préparation de la table (elle est recréée avec les nouvelles places). Les places portées par une table liée (`capaciteCol`) se lisent dans la table à chaque calcul : les changer là est sans effet de bord.

## Pour que les places s'affichent : la lecture

Le formulaire compte en **lisant** la table des réponses. Trois situations :

| Où est le formulaire | Peut-il compter ? |
|---|---|
| Dans le document, personne avec accès en lecture à la table | oui |
| Dans le document, avec des règles d'accès qui cachent les réponses | seulement si la colonne comptée (et celle de `sauf`) reste lisible — voir `docs/EXPOSITION.md` : le réglage « Les participants ne voient pas les réponses » la laisse lisible, sans les noms ni courriels |
| Page hors de Grist (clé de formulaire) | **non** : la clé n'écrit que, elle ne lit rien. Seule la fenêtre d'ouverture s'applique à l'écran ; la colonne `Place` trie après coup ; arrêter les inscriptions = dépublier le formulaire natif |

Quand la table n'est pas lisible, le formulaire **n'invente aucun chiffre** : il n'annonce pas de places et ne bloque personne. Seule la fenêtre d'ouverture s'applique.

## Ce qui n'est pas fait

- La formule ne tient pas une liste de choix multiples (plusieurs ateliers cochés) : le formulaire, lui, compte chaque choix. Une question « un seul atelier » reste le cas sûr.
- Une page hors de Grist ne peut pas annoncer les places restantes (la clé ne lit pas). Une table de « places » en lecture publique serait une solution, non livrée.
- Aucun message de confirmation « vous êtes confirmé / en liste d'attente » à la personne : elle ne relit pas sa ligne (voir `docs/EXPOSITION.md`).
