# Atlas — application de terrain (Android)

Enveloppe Capacitor autour du **meme code** que le widget. Rien n'est duplique :
`scripts/vendoriser.mjs` copie `projects/Atlas/` dans `www/` et remplace les
dependances CDN par des copies locales.

## Pourquoi une application, et pas une PWA

Mesure sur `grist.numerique.gouv.fr` : l'instance repond
`Access-Control-Allow-Headers: Content-Type, X-Requested-With`. L'en-tete
`Authorization` n'y figure pas, et c'est le seul moyen de presenter une cle API
(`?auth=` attend un jeton signe, pas une cle). Depuis un navigateur, toute
requete authentifiee est donc refusee au controle prealable, et cette
configuration ne peut pas etre modifiee cote instance.

`CapacitorHttp` remplace `fetch` par le client HTTP natif : les requetes partent
hors du moteur web, aucune politique d'origine ne s'applique, et l'en-tete
passe. **C'est la raison d'etre de l'APK** — pas la distribution.

> **Le drapeau `CapacitorHttp.enabled` n'est pas optionnel.** Sans lui, un
> `fetch()` dans la WebView reste soumis a CORS et l'application echoue
> exactement comme la PWA. Empaqueter ne suffit pas.

## Construire

```bash
npm install
npx cap add android      # la premiere fois seulement
npm run apk              # -> android/app/build/outputs/apk/debug/app-debug.apk
```

Requiert JDK 17 et le SDK Android (`platforms;android-34`, `build-tools;34.0.0`).

### Les icones

`npm run apk` appelle `scripts/icones.mjs`, qui redessine la marque Atlas a
toutes les densites. Sans lui, `cap add` laisse l'icone generique de Capacitor
et rien ne distingue Atlas dans un tiroir d'applications.

Le script n'a aucune dependance — polygone surechantillonne, PNG passe a
`zlib` — pour qu'une icone n'exige ni `sharp` ni telechargement. Il produit les
cinq densites de `ic_launcher`, l'avant-plan adaptatif (dessine dans les 72 dp
qu'Android ne rogne pas), la couleur de fond et l'ecran de lancement.

`npm test` verifie le cadrage, les densites et l'encodage — dont le debordement
hors zone sure, un defaut qui ne se voit que sur le telephone de quelqu'un
d'autre.

## Ce que l'application sait faire

Se connecter a une instance (adresse + cle API, retenues sur l'appareil),
lister les documents portant une scene Atlas, en ouvrir une. Ensuite, c'est
Atlas — le meme, avec ses couches, sa symbolisation, son relief et son recit.

**Le releve, fiche et formulaires compris.** Le paquet embarque le moteur de
`grist_forms` (vendorise comme les autres dependances), et c'est ici — et ici
seulement — qu'une **photo** peut etre versee en piece jointe : l'envoi se
presente avec la cle d'API, un en-tete qu'aucun navigateur ne laisse partir vers
cette instance. Mesure du 18/09/2026 : depuis un widget, le meme envoi revient
en `net::ERR_FAILED` et rien n'est cree cote document.

## Ce qu'elle ne sait pas encore faire

- **Hors ligne** : la coquille est embarquee, les donnees ne le sont pas. Sans
  reseau, une scene deja ouverte ne se rechargera pas.
- **iOS** : hors sujet ici. Sur iPhone il reste la PWA, donc limitee aux
  documents lisibles sans authentification.
- **Mise a jour** : aucune automatique. C'est le cout assume d'un second canal
  de distribution.
