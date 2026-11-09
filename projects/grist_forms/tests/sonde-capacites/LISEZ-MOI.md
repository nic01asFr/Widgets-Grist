# Sonde de capacités (outil d'essai, jamais publié)

Deux pages jetables qui servent aux mesures M1 à M7 du cadrage `docs/CADRAGE-ENTREES-MOBILES.md` (§9). Elles ne font partie d'aucun produit et ne sont pas servies par le site publié.

- `sonde.html` : relève la politique d'autorisations, la présence des API (`getUserMedia`, `SpeechRecognition`, `BarcodeDetector`, `MediaRecorder`), tente la position et le micro, et affiche le résultat en JSON. Deux champs fichier (`capture`) donnent le nom, le type et le poids de ce que renvoie le sélecteur système. Elle envoie aussi son résultat à la page parente par `postMessage`.
- `externe.html` : l'encadre dans deux iframes (réglage de Grist, puis capacités déléguées) pour comparer.

Usage ordinateur : servir ce dossier en HTTP sur `localhost` (`python -m http.server 8541 --bind 127.0.0.1`), ouvrir `http://127.0.0.1:8541/sonde.html`.

Usage téléphone : voir le protocole du cadrage §9.2. Aucune donnée n'est envoyée hors de l'appareil par ces pages.
