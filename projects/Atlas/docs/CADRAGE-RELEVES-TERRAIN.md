# Cadrage — relevés de terrain configurés dans Atlas

*01/10/2026. Cas d'usage de référence : le suivi d'ouvrages (ponts, passerelles,
gués) d'une équipe gestionnaire d'espaces naturels, tenu dans un document Grist.
Le document lui-même n'est ni nommé ni lié ici : il appartient à l'équipe.*

## Le but

Qu'une **équipe** qui tient ses données dans Grist puisse, **sans écrire de
code**, faire d'Atlas son outil de visualisation et de relevé :

- au bureau, une carte qui montre l'état de son patrimoine (couleurs, icônes,
  filtres, compteurs) et une bulle par objet (photos, état, dernière visite,
  actions) ;
- sur le terrain, la même carte dans l'application, où l'on ajoute une visite
  à un objet, ou un objet manquant, avec photos, dans les formulaires que
  l'équipe a déjà soignés.

Aujourd'hui, l'équipe de référence a écrit elle-même une carte Leaflet de
42 Ko dans un widget « Custom widget builder ». Elle fait beaucoup, mais elle
ne saisit rien (les boutons ouvrent les formulaires Grist dans un autre
onglet), ne lit pas les droits, et chaque évolution est du code à maintenir.
Un premier essai d'Atlas dans le même document a échoué pour des raisons
précises, toutes génériques — c'est l'objet de ce cadrage.

## Ce que le cas révèle

| Besoin | Atlas au 01/10/2026 | Lot |
|---|---|---|
| Couches en **WKT** (polygones, multilignes, en WGS84) | ignorées sans un mot : le décodage n'accepte que du GeoJSON. L'essai a créé des copies converties (`Atlas_<table>`), qui ne suivent plus l'original | 1 |
| Points dont les coordonnées **écrivables** ne s'appellent pas `latitude`/`longitude` (ici `Latitude_WGS84`, et `latitude` est une formule) | lus, mais Atlas écrirait dans la formule : ni créer ni déplacer | 2 |
| Couleur, **gravité** et **icône** d'un état lues dans une **table de référence** (couleur, rang de gravité, image par valeur) | couleurs choisies à la main, cercles ou modèles 3D | 3 |
| Une **bulle** par objet : carrousel de photos, pastilles d'état, dernière visite, actions (nouvelle visite, voir la fiche, itinéraire) | popup de 12 champs en texte | 4 |
| Les **formulaires Grist natifs** de l'équipe (libellés, ordre, obligatoires) | formulaire déduit des colonnes, libellés bruts | 5 |
| **Ajouter un objet** sur le terrain | réservé au mode édition | 6 |
| Un **mode relevé** : à faire / fait d'après une règle (ici le délai avant la prochaine visite, une formule Grist), liste par distance, compteurs | rien | 7 |

Déjà couvert, à vérifier sur le cas : filtres publiés en pastilles (type, état,
délai, booléen, recherche), formulaire lié qui **ajoute** une visite rattachée
à l'objet sans le modifier, photo depuis l'application, fonds IGN, droits Grist.

## Principes

1. **La donnée de l'équipe ne change pas de forme.** Atlas lit et écrit le WKT,
   les colonnes de coordonnées qu'elle a, ses tables de référence. Aucune
   table copiée, aucune colonne ajoutée sans qu'elle le décide.
2. **Tout se configure dans Atlas** et s'enregistre dans le document
   (`Atlas_LayerPrefs`, `Formulaires`, préférences de scène) — jamais un
   manifeste écrit à la main.
3. **Une seule configuration pour le bureau et le terrain** : l'application
   lit la même.
4. **Générique** : chaque lot sert toute table qui a la même forme, pas ce seul
   document.

## Lots

1. **WKT en lecture et en écriture** — *fait le 01/10/2026.* `lib/wkt.js`
   (pur, testé) : `POINT`, `LINESTRING`, `POLYGON` et leurs `MULTI`, préfixe
   `SRID=…;`, dimensions Z/M ignorées, `EMPTY`. Une colonne lue en WKT est
   réécrite en WKT, à précision inchangée ; une forme dessinée dans une couche
   `Multi*` s'écrit en `Multi*`.
2. **Colonnes de géométrie écrivables** — *fait le 01/10/2026 pour la
   liaison.* Les colonnes de données sont préférées aux formules. Reste :
   montrer les colonnes retenues dans l'inspecteur de couche et permettre de
   les changer. À savoir : écrire `Latitude_WGS84` ne met pas à jour un texte
   `Coordonnees` qui l'alimenterait par formule déclenchée.
3. **Symbologie par table de référence** — *fait le 01/10/2026* (colonne
   `Ref` ou texte) : couleurs et libellés de la table, ordre de dessin par
   gravité, icônes par valeur depuis une colonne d'URL. Reste : icônes depuis
   une colonne `Attachments`, relecture automatique à l'ouverture.
4. **Bulle d'objet configurable** — *faite le 01/10/2026* (titre, photos,
   pastilles colorées, champs, dernière visite liée, gestes nouvelle visite /
   fiche / itinéraire), devant la fiche en lecture. Reste : HTML libre en cadre
   isolé, si le besoin se confirme.
5. **Import d'un formulaire Grist natif** *(fait le 02/10/2026 ; voir CLAUDE.md, « Formulaires natifs, valeurs de départ »)* vers le FormDef d'Atlas ; valeur par
   défaut « aujourd'hui » pour une date.
6. **« Ajouter un objet » en lecture**, quand la scène le propose.
7. **Mode relevé** (état par règle, liste par distance, compteurs), en
   s'appuyant sur ce qu'Atlas a déjà et en l'adaptant à l'usage : le **récit**
   (une tournée présentée étape par étape), le **trajet** (le parcours de la
   tournée, que la lecture longe), les **contrôles** publiés en pastilles
   (filtres de l'équipe : type, état, délai), les **commandes de la carte**
   (pastille Relevé, « le plus proche », ajouter un objet).

Chaque lot est éprouvé sur une **copie** du document de référence — jamais
sur l'original, qui est en service.

---

## Vision d'ensemble — préparer et exploiter

*02/10/2026. Cadre la suite des lots 1 à 5 ci-dessus. **Validé le 02/10/2026** :
la posture sans écriture s'appelle « Lecture » ; un contexte est une étape de
récit ; les droits se dégradent sur refus réel. **À valider** : le reste.*

### Deux surfaces, un seul modèle

Le document de l'équipe reste la seule source : ses tables, ses formulaires, ses
tables de référence, ses règles de calcul et ses droits. Atlas les lit, les met
en scène et y écrit ; il n'en recopie rien. La configuration est la même au
bureau et sur le terrain, sur ordinateur comme dans l'application.

| Posture | Pour qui | Ce qu'on y fait | Aujourd'hui (`viewMode`, `peutSaisir`) |
|---|---|---|---|
| **Préparer** | qui configure | couches, symbologie, bulle, formulaires, contrôles, étapes et contextes | `viewMode` faux |
| **Exploiter** | l'agent, le chef d'équipe | opérer : choisir un contexte, trouver un objet, relever, proposer une forme | `viewMode` vrai, `peutSaisir` vrai |
| **Lecture** | un partenaire, un lecteur | voir : carte, filtres, bulle, fiche | `viewMode` vrai, `peutSaisir` faux |

Les trois postures existent donc déjà ; le badge dit « Édition », « Lecture +
saisie », « Lecture seule ». Le travail est de les nommer, de les choisir
explicitement, et de les rendre exactes (voir les droits ci-dessous).

*Vocabulaire.* « Lecture » est une posture. « Consultation » reste le mode de la
fiche qu'on ouvre sans pouvoir la modifier (`ficheConsultation`). « Vitrine » est
le site de présentation, jamais un mode.

**Atlas ne donne jamais plus que Grist.** `?mode=` choisit parmi les postures
offertes et ne les agrandit jamais. Une même personne peut avoir les trois ; la
bascule lecture / édition devient un choix à trois positions, retenu sur
l'appareil (jamais dans la table partagée `Atlas_ScenePrefs`, où le choix d'un
utilisateur écraserait celui d'un autre). La scène peut proposer une posture par
défaut, pour les visiteurs seulement.

**Les droits, tels qu'on les apprend.** Atlas ne prédit pas ce que Grist
répondra et ne lit pas ses règles d'accès (`_grist_ACLRules`) : ce serait en
réimplémenter le langage. On part du calcul actuel (droits transmis par Grist et
sonde), puis on apprend **par table à partir des refus réels** : un refus baisse
le verdict de cette table et recalcule la posture, au lieu de basculer toute la
session en lecture. La sonde de départ doit viser la table de relevé de la
couche, pas `Atlas_LayerPrefs` : un agent qui n'écrit que les relevés serait
sinon classé « Lecture ». La sonde par table n'a pas été mesurée avec une règle
par table : à mesurer avant de s'y fier. Un refus d'écriture ne s'avale jamais :
il se dit.

### Les briques

1. **Contexte de travail = une étape de récit.** L'étape porte déjà l'état de
   lecture courant : couches visibles et leur ordre, filtres, symbologie, rendu à
   plat ou en volume, caméra, ambiance, formulaires proposés (`saisies`), place
   sur un trajet. Un **contexte** est une étape qu'on joue sans la séquence : la
   pastille « Contexte » liste les étapes que la scène propose en exploitation,
   en applique une (« Scène de base » rend l'état d'avant) et montre sa carte de
   consigne en compact. La **scène** est l'ensemble des configurations : préférences de
   couches et de scène, contrôles, formulaires, et tout le récit. Il n'y a donc
   pas de table `Atlas_Contextes`. Il manque à l'étape :
   - une **clé stable** (`Cle`), pour qu'on la désigne sans passer par son rang ni
     par l'identifiant de sa ligne (qui change à chaque sauvegarde) ;
   - un bloc **`usage`** : postures concernées, pastilles proposées, zone qui la
     propose par GPS, ordre de passage, règle de création (`direct`,
     `proposition`, `aucune`) ;
   - éventuellement un **`Recit`**, pour grouper les étapes en plusieurs récits
     (un par secteur).

   Condition préalable : `Atlas_Story` s'efface aujourd'hui entièrement puis se
   réécrit à chaque sauvegarde. Elle passe à une **mise à jour par clé**, avec
   migration (une étape sans clé en reçoit une à la première lecture). Sans cela,
   deux éditeurs se perdent des étapes, et ajouter `Recit` serait dangereux.
2. **Récit-protocole.** Un récit dont chaque étape est un contexte, avec sa carte
   (blocs : consigne, photo de référence, compteur, formulaire intégré, bouton
   « Suivant »), le long d'un trajet que le suivi GPS parcourt. Le texte de la
   carte est du HTML filtré par liste blanche de balises (fait, `lib/html.js`).
   Trois sortes de saisie par étape : un formulaire sur un objet voisin, une
   observation de passage (position remplie), une proposition de forme.
   Progression locale par appareil (faite, passée, en attente ; « 3 sur 7 » ;
   reprise ; récapitulatif), clé = clé d'étape.
3. **Récit généré (tournée).** Les mêmes étapes, calculées depuis une vue nommée
   (« À faire ») : une par objet, dans l'ordre du trajet ou de la distance. Même
   lecteur, même carte. Dérivé : jamais enregistré dans `Atlas_Story`.
4. **Liste d'objets.** « Choisir un objet » dans le panneau Relevé : les objets
   de la couche, filtrés comme la carte, avec état en couleur, dernière visite,
   distance (GPS, sinon centre de la carte, sinon alphabet) et recherche par nom
   et par valeur de champ. Chaque ligne ouvre la bulle (lecture) ou la fiche
   (édition) ; « Nouvelle visite » est directement sur la ligne. Elle sert aussi
   « Autour de moi », « À faire » et les compteurs : aucun formulaire ne doit être
   atteignable seulement en touchant la carte. Une seule fonction énumère les
   objets (il y en a trois aujourd'hui, dont une seule respecte les filtres).
5. **Formulaires.** Ceux de l'équipe, repris tels quels (lot 5, fait), avec des
   valeurs de départ réglées par contexte et dites à l'agent (« Prérempli : … »).
6. **Proposition de géométrie.** Une forme nouvelle ou la correction d'une forme
   existante, enregistrée à part (`Atlas_Propositions` : `TableCible` en texte et
   non en `Ref:`, sinon elle passerait pour un formulaire lié ; ligne visée, 0
   pour un nouvel objet ; forme en GeoJSON ; attributs ; statut proposée /
   acceptée / refusée ; auteur, date, note, photos, étape d'origine ; forme
   d'origine, pour détecter un conflit ; `ClientId`, pour ne pas dupliquer un
   envoi rejoué), jamais directement dans la table source en *Exploiter*.
   Affichée en pointillé à côté de la forme actuelle ; revue en *Préparer* (avant
   / après, Accepter avec le code de modification de forme existant, qui garde
   le format de la table, ou Refuser avec une note). Réglage par défaut :
   `proposition` en *Exploiter*, `direct` en *Préparer*. Le lot « Ajouter un
   objet » devient « Proposer ou ajouter ». La structure et les droits sont
   posés par un éditeur, jamais à la demande par l'agent. L'auteur vient du jeton
   dans le widget ; dans l'application, par le profil de la clé ou une colonne à
   formule de déclenchement (à vérifier).
7. **Position et guidage.** Une seule position pour tout Atlas (bouton « Me
   localiser » partout, précision affichée, cap sur téléphone, module Lieu
   branché dessus). « Autour de moi » remplace « Le plus proche ». « Y aller »
   donne distance et direction en marchant, puis « Vous y êtes » propose le
   relevé. L'itinéraire routier externe reste pour la voiture.
8. **Contrôles lisibles.** Libellés, couleurs et ordre de gravité repris des
   tables de référence ; état actif visible (« État · 2 sur 5 », « 58 objets sur
   108 · Tout réafficher ») ; légende qui filtre (même état que les filtres) ;
   comptes croisés avec les autres filtres ; seuils nommés pour une règle (« En
   retard », « Dans le mois ») ; vues nommées (« À faire », « Critiques »).
   Chaque pastille indique pour quelles postures elle est proposée.
9. **Écrire hors réseau.** Aujourd'hui rien ne met une écriture en file : un envoi
   perdu est perdu. Avant d'offrir propositions et visites sur le terrain : une
   seule porte d'écriture qui journalise (IndexedDB), rejoue à la reconnexion un
   envoi à la fois, ne rejoue pas un refus d'accès, et ne duplique pas grâce à un
   `ClientId`. Les photos se mettent en file avant la ligne qui les référence.
   Compteur « en attente d'envoi » toujours visible. Lot séparé.
10. **Voir l'équipe** *(02/10/2026 : principe validé, double volontariat ; détails à cadrer)*. Plusieurs agents
   exploitent le même document en même temps (application mobile, collaboration
   native de Grist). Deux niveaux, le second seulement si le premier ne suffit pas :
   - **Activité** : « Alex a relevé l'ouvrage X il y a 12 min », « 5 faits
     aujourd'hui, par Camille et Alex ». Calculée depuis les visites déjà écrites
     (auteur et date), sans aucune donnée de position en plus, et sans suivi de
     personne. Les objets déjà vus ou « en cours » (réservés par un agent) se
     voient dans la liste d'objets et la tournée, pour ne pas doubler un collègue.
   - **Position partagée**, volontaire. Une table `Atlas_Positions`, une ligne par
     agent mise à jour (dernière position seulement, pas d'historique) : auteur
     rempli par une colonne à formule de déclenchement (infalsifiable), nom,
     position, précision, heure, étape ou contexte en cours. Écrite par
     l'application seulement (la localisation est une fonction de l'application, pas
     du widget : le widget lit, l'application écrit), au plus une fois par minute ou
     tous les 25 m. Les autres la lisent au rythme du sondage (30 s), en temps réel
     seulement si Grist le pousse à un widget lié. Affichée comme une couche
     « Équipe » (nom, précision, grisée au-delà de N minutes) et dans « Autour de
     moi » (« Camille, à 120 m »).
   - **Conditions** (position d'agents = donnée personnelle de salariés) : partage
     à l'initiative de l'agent (interrupteur « Partager ma position », coupé de
     lui-même à la fin de la tournée et après une durée), finalité dite à l'écran,
     visible seulement des rôles que la scène choisit (règle d'accès Grist : chacun
     n'écrit que sa ligne, lecture réservée à l'équipe), purge au-delà d'une durée,
     pas d'historique par défaut. Le volume d'écriture compte aussi : chaque mise à
     jour est une action de l'historique du document. À cadrer avec le référent
     protection des données de l'organisation avant toute mise en service.
   - **Double volontariat** *(validé sur le principe)*. Deux interrupteurs, et la
     position n'existe dans le document que si les deux sont levés :
     1. **En *Préparer***, la scène (ou un contexte) **autorise** le partage : « Les
        agents peuvent partager leur position », avec qui la voit (l'équipe, ou
        seulement certains rôles), au bout de combien de minutes une position est
        grisée puis retirée, et si le partage s'arrête de lui-même à la fin de la
        tournée. Par défaut : non autorisé.
     2. **En *Exploiter***, dans l'application, l'agent **choisit** de partager ou non,
        à chaque session (jamais reconduit seul d'un jour à l'autre). Un
        indicateur « Position partagée » reste affiché tant qu'elle l'est, et un
        geste suffit pour l'arrêter.

     Sans autorisation, l'interrupteur de l'agent n'apparaît pas. Sans le choix de
     l'agent, aucune position n'est écrite ni affichée. La table `Atlas_Positions`
     est posée par un éditeur au moment où il autorise le partage, jamais à la
     demande par l'agent.
   - **Dépend de** : droits par table (la règle « chacun sa ligne »), identité de
     l'auteur dans l'application, file d'écriture hors réseau, position unique. Au
     plus tôt avec le lot « tournée et guidage ».
11. **L'utilisateur comme valeur** *(idée du 02/10/2026, à cadrer)*. Pour un champ
    « inspecteur », « agent », « auteur » : proposer **l'utilisateur de Grist**
    comme valeur de départ (« Moi »), au côté de `vide`, `aujourdhui`,
    `precedente` et `reprise` (lot 5). Pour une référence à une table de
    personnes (déjà reconnue par `tableDePersonnes`), « Moi » est plus juste que
    « Dernière saisie » : sur un appareil partagé, la dernière saisie est celle
    d'un collègue. Pour un champ texte : le nom ou le courriel. Le terrain lit
    « Prérempli : Inspecteur(s) (vous) ».
    - **Le point dur : qui est l'utilisateur ?** Dans le widget, le jeton ne donne
      que son numéro, pas son nom ni son courriel (mesuré le 05/08/2026, l'API
      d'accès répond 403) ; dans l'application, le profil de la clé d'API le
      donnerait, non mesuré. D'où une identité à trois sources, dans cet ordre :
      1. **par l'annuaire du document** : le courriel connu est rapproché d'une
         colonne courriel de la table de personnes (la même idée que l'annuaire
         de TaskFlow) ;
      2. **par une association faite une fois** : « Qui êtes-vous ? » — l'agent
         choisit sa ligne dans la table de personnes, retenue sur l'appareil, par
         document et par table, et refaisable en un geste ;
      3. **à défaut**, le champ part vide, comme aujourd'hui.
    - **Déclaratif, pas une preuve.** Une association faite par l'agent sert à
      préremplir, pas à prouver qui a écrit. Pour la traçabilité, l'équipe garde
      la voie de Grist : une colonne à formule de déclenchement
      (`Agents.lookupOne(Email=user.Email)`), évaluée par le serveur avec le
      vrai utilisateur. Atlas peut aider un éditeur à la poser (geste explicite,
      jamais à la demande par l'agent).
    - **Sert aussi** à : « mes objets » et « mes visites du jour » (vues nommées),
      l'auteur d'une proposition de géométrie, le nom affiché pour « Voir
      l'équipe », et les initiales du badge. Un module d'identité unique
      (`lib/identite.js`, pur : sources, rapprochement par courriel, association
      retenue) alimente tout cela.

### Scènes publiées

Une version publiée de scène (`Atlas_Scenes`, étude du 26/09) ne porte que la
**présentation** : état, étapes (donc contextes), consignes, ordre. Elle se lit
sans droit sur le document et n'écrit rien : formulaires, propositions, règles de
création et valeurs de départ restent dans le document. Une visibilité publique
rend les consignes publiques. Cela ne change pas « une scène par document » pour
l'état de travail.

### Lisibilité : préparer

- **Organiser par intention**, en sections du panneau Scène (pas en nouveaux
  modules du rail) : *Données* (couches, symbologie, bulle), *Saisie*
  (formulaires, valeurs de départ, propositions), *Contextes* (étapes, récit,
  trajet), *Partager* (pastilles par posture), *Réglages*.
- **Un panneau « Prêt pour le terrain »** : une liste de contrôle qui dit ce qui
  manque et mène au bon module (« aucune couleur d'état », « aucun formulaire
  proposé », « aucun contexte pour Exploiter »).
- **Chaque réglage montre ce que verra l'agent**, au même endroit que le réglage.
- **Les mots de l'équipe** : libellés des questions et des colonnes, jamais les
  noms techniques d'Atlas.

### Lisibilité : exploiter

- **Peu de pastilles, une tâche chacune** : Contexte, Autour de moi, Relevé /
  tournée, Me localiser. Jamais de réglage.
- **L'état toujours visible** : contexte actif, filtres actifs, position et sa
  précision, hors ligne, saisies en attente d'envoi.
- **Un retour après chaque geste** : la visite apparaît, la couleur de l'objet
  change, les compteurs avancent, « Suivant » est proposé.
- **Un geste, un verbe, partout** : toucher un objet, le chercher ou le choisir
  dans une liste ouvre la bulle en lecture et la fiche en édition ; depuis la
  bulle, « Modifier » rejoint *Préparer* pour qui en a le droit.
- **Conditions de terrain** : grandes cibles tactiles, contraste lisible en plein
  soleil, usage à une main.

### Ordre de construction

0. **Fait le 02/10/2026** : texte et titre d'étape, noms de couche et résultat de
   géocodage échappés ou filtrés (`lib/html.js`) ; l'état d'une étape n'est plus
   écrit dans les préférences de couche pendant un récit ; un module n'est plus
   importé sous deux versions (test) ; liste unique des tables d'Atlas
   (`lib/atlas-tables.js`) et refus d'une couche qui prendrait leur nom ;
   la capture d'étape corrigée (relance en plein récit, filtres de plus de 40
   valeurs, rendu à plat hérité, date épinglée).
0 bis. **Fait le 02/10/2026** : la liste « Choisir un objet » (pastille Relevé et palette),
   la recherche par valeur de champ, une seule règle d'ouverture d'un objet
   (`lib/ouvrir-objet.js`, `lib/objets-liste.js`). Vérifié dans l'application simulée
   (exploiter sans GPS : choisir, ajouter une visite préremplie, retrouver la liste
   à jour), pas encore sur la copie.
0 ter. **Fait le 02/10/2026** : droits par table (`lib/droits-tables.js`) et sélecteur de
   posture Préparer / Exploiter / Lecture (`lib/posture.js`), retenu par document sur
   l'appareil ; éprouvé dans l'application simulée, pas encore sur la copie.
0 quater. **Fait le 02/10/2026** : étapes à clé stable et récit écrit par clé
   (`lib/recit-cles.js`, colonne `Cle`, comparaison à trois points), puis pastille
   « Contexte » (`lib/contextes.js`, `state.usage.contexte`, restitution sans le lecteur de
   récit). Éprouvé dans l'application simulée, pas encore sur la copie.
1. Documentation alignée (ce fichier, `CLAUDE.md`), séries de lots distinguées.
2. Extractions testables, sans changement visible : restitution de scène sans
   `_storyPresenting` ; droits et postures (avec `viewMode` et `peutSaisir`
   dérivés) ; ouverture d'objet en un seul geste ; position unique ; liste
   d'objets ; modes exclusifs de la carte ; pastilles par posture.
3. Liste « Choisir un objet » et recherche par enregistrement ; sélecteur de
   posture et « Prêt pour le terrain » ; étapes à clé stable (mise à jour par
   clé) puis pastille « Contexte » ; blocs de carte, formulaire dans l'étape,
   progression.
4. Écriture en file hors réseau ; proposer ou ajouter et revue des propositions ;
   récit généré et guidage.

### Scénarios de recette

Chacun se joue dans l'application simulée (faux document REST), puis sur la copie
du document de référence.

- **Préparer.** Document sans configuration : couleurs d'état reprises des tables
  de référence, bulle réglée, un formulaire natif proposé avec date du jour et
  dernier inspecteur, une étape enregistrée comme contexte « À faire », le panneau
  « Prêt pour le terrain » au vert.
- **Exploiter, sans GPS.** Choisir le contexte, choisir un objet dans la liste,
  ajouter une visite préremplie, constater le changement de couleur.
- **Exploiter, avec GPS.** « Autour de moi », « Y aller », « Vous y êtes »,
  relevé, « Suivant ».
- **Protocole.** Un récit de trois étapes le long d'un trajet : consigne,
  formulaire, observation de passage, récapitulatif.
- **Proposition.** Proposer la forme d'un ouvrage manquant ; la valider en
  *Préparer* ; la retrouver dans la table source.
- **Lecture.** Aucun geste d'écriture n'est offert ; la fiche est en
  consultation.
- **Sécurité.** Une étape dont le texte contient un script ne l'exécute pas, y
  compris dans une scène chargée par `?scene=`.
