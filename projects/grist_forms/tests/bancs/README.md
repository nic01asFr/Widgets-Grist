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
