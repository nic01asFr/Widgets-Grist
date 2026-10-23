# Dire à la personne où en est son inscription

*Étude du 23/10/2026, à partir d'une inscription à deux ateliers à séances limitées (10 places par séance pour l'un, 20 pour l'autre). Rien n'est développé : ce document dit ce qui se passe aujourd'hui, ce qu'on peut faire, et ce qu'il faut décider.*

## Ce qui se passe aujourd'hui

Le formulaire se protège déjà de l'essentiel, **avant l'envoi** :

- une séance pleine est **grisée** (« — complet ») et chaque séance dit ses places restantes ;
- à l'envoi, le formulaire **relit** ce qui est pris et refuse, en le disant, un choix devenu plein entre-temps ;
- la colonne « Place » de la table tranche **après coup**, par ordre d'arrivée : `Confirmé`, `Liste d'attente`, `Doublon`.

Deux cas passent pourtant sans que la personne le sache, parce que le message de fin est le même pour tous (« Inscription enregistrée… ») :

| Cas | Ce qui arrive | Fréquence probable |
|---|---|---|
| **Même adresse deux fois** | la seconde ligne est marquée `Doublon` et ne compte pour rien ; la personne croit sa **modification** prise en compte | **la plus fréquente** : on se réinscrit pour changer de séance |
| **Dernière place prise en même temps** | deux envois se croisent : l'un passe en `Liste d'attente` | rare, mais réel pour un envoi groupé (courriel à tout un site) |

Le contrôle à l'envoi ne voit pas le doublon : l'adresse n'est pas lisible par un visiteur (c'est voulu, rien de personnel ne se lit).

## Le statut est par ligne, pas par séance

La formule de « Place » décide une fois pour toute la ligne. Si **une** des deux séances choisies est pleine, la ligne passe en `Liste d'attente` et **ne prend de place dans aucune des deux**. Ce n'est gênant que dans le cas de la course ci-dessus (une séance pleine est normalement grisée avant). Mais il est faux pour des ateliers indépendants : quelqu'un qui perd Handi'Scape à 10h devrait garder Blindtest à 11h.

## Afficher le statut après l'envoi (faisable, petit)

Mesuré le 23/10/2026 sur un document public : l'ajout **renvoie l'identifiant de la ligne**, et « Place » est lisible par le visiteur. Le formulaire peut donc, après l'envoi :

1. relire sa propre ligne (par cet identifiant) ;
2. afficher le message qui correspond à `Place` :
   - `Confirmé` : « Votre réponse est retenue. » ;
   - `Liste d'attente` : « C'est complet : votre réponse est sur liste d'attente. » ;
   - `Doublon` : « Une réponse existe déjà pour cette personne : la première est conservée. » ;
3. rester neutre si la lecture échoue (aucun message faux).

**Rester générique.** Rien de propre à un cas (inscription, atelier, séance) dans le code, le schéma ni les mots par défaut : le formulaire parle de « réponse ». Les mots d'un cas précis vivent dans la définition du formulaire, pas dans le moteur. Les trois messages seraient donc des clés facultatives de `limites.messages` (à côté de `complet`, `ferme`, `choixComplet`), `retenue`, `attente` et `doublon` : une addition au FormDef, sans nouvelle clé de premier niveau. Le schéma refuse aujourd'hui les clés inconnues dans `limites` (`additionalProperties: false`) : il faut donc l'étendre, avec sa copie publiée et son empreinte. Les valeurs stockées dans la table (`Confirmé`, `Liste d'attente`, `Doublon`, `Écartée`) restent un code stable lu par le moteur ; seuls les messages affichés se règlent.

La modification se limite au moteur (écran de fin) et au compositeur (trois champs de texte).

**Même famille de défauts à traiter ensemble.** Deux réglages ne suivaient pas un changement fait après la première mise en ligne : la formule de « Place » (corrigé) et les règles d'accès, dont « Poser » est bloqué dès qu'elles existent. Il faut un « Mettre à jour les règles » qui modifie en place la liste des colonnes lisibles, sans fenêtre sans protection.

**Limite à dire** : ce statut est celui du moment de l'envoi. Une annulation ultérieure peut libérer une place ; l'envoi d'un courriel de confirmation n'est pas prévu.

## Un statut par séance (plus gros, à décider)

Pour que l'une des deux séances puisse être confirmée sans l'autre :

- une colonne de statut **par question limitée** (par exemple `Place_Handiscape`, `Place_BlindTest`), chacune avec sa formule ;
- le décompte des places par séance lit **sa** colonne de statut, plus la colonne « Place » globale ;
- ces colonnes s'ajoutent aux colonnes lisibles par le public (règles d'accès) ;
- l'écran de fin liste le statut de chaque choix.

Cela touche la formule, le compteur, le plan d'accès et le compositeur. À ne faire que si la règle métier est bien : **les ateliers sont indépendants** (une personne peut être confirmée pour l'un et en liste d'attente pour l'autre).

## Ce qu'il faut trancher

1. **Règle métier** : pour la collègue, perdre une séance fait-il perdre l'autre ? Sinon, un statut par séance est nécessaire.
2. **Doublon** : une personne peut-elle changer sa réponse ? Aujourd'hui non (la première est conservée). Si oui, il faut un moyen de la modifier (hors du périmètre de cette étude).
3. **Confirmation** : suffit-il de l'écran de fin, ou faut-il aussi un courriel ? Le courriel demande un service d'envoi hors de Grist.

## Recommandation

1. Faire l'**affichage du statut après l'envoi** (petit, utile tout de suite, couvre le doublon et la course).
2. Garder le **statut par ligne** tant que la course reste le seul cas où il diffère, et le dire dans le message de liste d'attente.
3. Ne faire le **statut par séance** que si la règle métier l'exige.
