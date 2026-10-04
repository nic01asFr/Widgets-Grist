# Bancs d'essai

Des pages qu'on ouvre à la main pour mesurer ce que le navigateur fait
vraiment. Elles ne sont pas lancées par `node --test` : leur résultat est une
mesure, et c'est la mesure qui est consignée ici.

## `inclusion-grist.html` — ce qu'une page intégrée peut et ne peut pas

Une question peut être illustrée par une page entière (`illustration.type =
'inclusion'`). Reste à savoir si cette page peut **répondre** au formulaire.

À ouvrir en passant l'adresse à intégrer :

    https://localhost:8443/projects/grist_forms/tests/bancs/inclusion-grist.html?doc=<url-encodée>

### Mesuré le 05/10/2026, sur `grist.numerique.gouv.fr`

**1. Une vue Grist du même document ne s'intègre pas depuis une autre origine.**

| Bac à sable | Résultat |
|---|---|
| celui de l'illustration (`allow-scripts`, sans `allow-same-origin`) | page blanche : Grist ne peut pas démarrer sans stockage |
| `+ allow-same-origin` | **« Accès refusé — Connectez-vous »** |
| aucun `sandbox` | **« Accès refusé — Connectez-vous »** |

Même résultat **dans Grist** (banc monté en widget du document) : la page de
premier niveau a beau être `grist.numerique.gouv.fr`, la frame intermédiaire du
widget est tierce, et une chaîne d'ancêtres tierce suffit à écarter le cookie
de session. Le serveur, lui, accepte d'être intégré : ni `X-Frame-Options`, ni
`frame-ancestors`.

> Conséquence : intégrer une vue Grist authentifiée ne marchera que depuis un
> widget servi par **le même site** que Grist. Ce n'est pas le cas de nos
> widgets, servis par GitHub Pages.

**2. Le bac à sable laisse passer un `postMessage`.**

    message reçu : {"source":"essai-inclusion","dit":"bonjour"}
    event.origin : null
    event.source === iframe.contentWindow : true

L'origine est opaque, donc inexploitable pour décider à qui l'on parle — mais
la **référence de fenêtre**, elle, est fiable. C'est exactement ce sur quoi
repose le `GristBridgeParent` d'Artefactory.

> Conséquence : ce qui manque à une page intégrée pour répondre au formulaire
> est **le canal, pas la permission**. Un relais à la Artefactory est la voie
> praticable ; il reviendrait à prêter l'accès Grist du formulaire à la page
> intégrée, et doit donc rester un choix explicite de qui compose.

## `carte-traces.html` — le point, le trajet, le contour

Les trois saisies géométriques, hors Grist, pour éprouver le geste lui-même.
La page expose `window.__cartes[colId]` (pour déplacer la carte entre deux
clics, un outil cliquant toujours au centre) et affiche en bas ce que les
colonnes portent.

    https://localhost:8443/projects/grist_forms/tests/bancs/carte-traces.html

### Mesuré le 05/10/2026 — quatre défauts, aucun visible à l'œil

La saisie ligne/surface était écrite depuis le 04/10 et n'avait jamais été
essayée. Elle ne marchait pas, et chaque défaut en cachait le suivant :

1. **terra-draw ne se chargeait pas.** Son adaptateur publie un import nu
   (`from "terra-draw"`). Atlas le résout par un `importmap` dans sa page ; le
   formulaire n'est pas maître de la sienne. Il pointe désormais l'import
   lui-même. Le `+esm` de jsDelivr résoudrait aussi, mais vers terra-draw 1.30 :
   deux copies, deux versions.
2. **Rien n'était écrit** : le tracé passait par la fonction des points, qui
   ignore son argument et relit l'état des sommets — état que le tracé venait de
   vider. Ligne bien dessinée, colonne vide.
3. **`finish` n'arrivait pas** quand le geste de terminaison n'était pas trouvé.
   On écoute `change` : chaque sommet posé s'inscrit, comme pour les points.
4. **`getSnapshot()` rend aussi les sommets de guidage** : prendre la dernière
   feature écrivait `POINT` là où l'on attend une ligne.

Et un cinquième, en bout de chaîne : au premier clic, terra-draw tient une
ligne de deux sommets confondus (le point posé, et le fantôme sous le curseur),
que la normalisation d'Atlas ramène à un seul — d'où `LINESTRING (un point)`,
que rien ne sait relire. Le contrôle de forme se fait donc **après**
normalisation.

Résultat attendu après trois clics sur chaque carte :

    POINT (5.3984928 43.3035003)
    LINESTRING (5.3985286 43.3034857, 5.4036785 43.3016118, 5.3976703 43.2991132)
    POLYGON ((5.3985286 43.3034792, 5.4015327 43.3000437, 5.4041076 43.3034792, 5.3985286 43.3034792))
