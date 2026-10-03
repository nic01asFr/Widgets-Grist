"""
Réécrit la fiche de vitrine d'Atlas (published/atlas/vitrine.json) : Atlas expliqué fonction par fonction, dans l'ordre où on s'en sert,
illustré par un seul exemple (l'éclairage du Palais Longchamp et la faune nocturne).

L'exemple garde la page cohérente et lisible, il ne la dirige pas : chaque chapitre dit ce que fait la fonction d'Atlas, puis « Dans l'exemple ».
Rejouable : il part de la fiche telle qu'elle est. Usage : python projects/Atlas/vitrine-longchamp/ecrire-vitrine.py   puis   node scripts/generate-vitrine.js
"""
import io
import json
import os

RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../..'))
P = os.path.join(RACINE, 'published/atlas/vitrine.json')
raw = io.open(P, encoding='utf8', newline='').read()
crlf = '\r\n' in raw
d = json.loads(raw)
pr = d['produit']

d['pitch'] = ('La carte n’est pas un export de vos données : c’en est une vue. Dans Grist, couches, symbolisation, relief, récit et tournées vivent '
              'avec vos tables — quand la donnée change, la carte a déjà changé. Hors document, la même scène peut aussi s’ouvrir seule à partir '
              'd’un manifeste publié.')

pr['titreContextes'] = 'Atlas, fonction par fonction'
pr['contextes'] = [
    {'role': 'Charger', 'titre': 'Vos tables deviennent des couches', 'format': 'large',
     'texte': 'Atlas lit le document Grist : toute table qui porte une géométrie — des coordonnées, du WKT, une colonne de géométrie — est reconnue et proposée '
              'comme couche. On peut aussi y verser un fichier (GeoJSON, GPX, KML, CSV), importer OpenStreetMap ou créer une couche vide pour la dessiner. '
              'Une couche n’est pas une copie : modifier la table modifie la carte, et l’inverse.',
     'pourquoi': 'Il n’y a rien à exporter, ni à refaire quand la donnée change.',
     'exemple': 'les 643 points lumineux de la Ville de Marseille sont une table du document ; Atlas la pose sur la carte, à côté de la maquette 3D du Palais.',
     'utilise': ['Tables géographiques', 'Fichiers', 'OpenStreetMap', 'Couche vide'],
     'images': [{'image': 'cas-couches.jpg', 'legende': 'Le panneau des couches : cinq couches, chacune liée à une table du document.'},
                {'image': 'cas-jour.jpg', 'legende': 'Le résultat sur la carte, de jour.'}]},
    {'role': 'Représenter', 'titre': 'Colorer, dimensionner, étiqueter par la donnée', 'format': 'large',
     'texte': 'Une couche se colore d’une couleur fixe, par catégorie ou en classes graduées, se dimensionne et s’étiquette d’après un champ, et sa légende se '
              'construit seule. Quand le champ renvoie à une autre table, Atlas reprend les couleurs et l’ordre de gravité de cette table plutôt que d’inventer une palette.',
     'pourquoi': 'Le réglage est enregistré avec le document : celui qui ouvre la scène retrouve la même carte.',
     'exemple': 'les cinq teintes de lumière, de l’ambre au blanc froid, sont lues dans la table des classes ; le libellé de chaque classe vient de la même table.',
     'utilise': ['Couleur par catégorie', 'Couleur graduée', 'Table de référence', 'Étiquettes', 'Légende'],
     'images': [{'image': 'cas-symbolisation.jpg', 'legende': 'L’onglet Couleur : le champ « Classe » renvoie à une table, dont Atlas propose de reprendre les couleurs.'}]},
    {'role': 'Représenter', 'titre': 'Relief, bâti, fonds de plan et lumière du jour', 'format': 'large',
     'texte': 'Le fond est un plan, un fond clair, l’orthophotographie de l’IGN ou le fond 3D ; le relief vient du MNT LiDAR HD de l’IGN, le bâti se met en volume et '
              'porte des ombres. Le soleil se règle par la date et l’heure, et chaque étape d’un récit retient son fond, son heure et sa date.',
     'exemple': 'le même point de vue, de jour sur le plan, puis de nuit sur l’orthophotographie.',
     'utilise': ['Fonds de plan', 'Relief IGN', 'Bâti en volume', 'Ombres portées', 'Soleil et date'],
     'images': [{'image': 'cas-jour.jpg', 'legende': 'De jour, sur le fond 3D : relief, bâti et arbres.'},
                {'image': 'cas-nuit.jpg', 'legende': 'À la tombée de la nuit, sur l’orthophotographie.'}]},
    {'role': 'Représenter', 'titre': 'Des objets 3D réglés comme une couche', 'format': 'large',
     'texte': 'Un point peut devenir un objet : un modèle de la bibliothèque, un modèle réaliste du catalogue d’objets, ou un fichier glTF que l’on fournit. Le modèle peut '
              'dépendre d’un champ (un type de mobilier, de luminaire). Les réglages du catalogue — puissance, température de couleur, hauteur de feu, statut — se posent '
              'sur l’objet, la couche ou le type, et chacun dit d’où vient sa valeur. Un luminaire s’allume ou reste éteint selon son statut et l’heure du soleil.',
     'exemple': 'mât, applique, boule opaline ou projecteur selon le modèle du luminaire ; le piège de nuit est un modèle 3D fourni par fichier.',
     'utilise': ['Bibliothèque 3D', 'Catalogue d’objets', 'Spécifications', 'Éclairage', 'Fichier glTF'],
     'images': [{'image': 'cas-pieges-3d.jpg', 'legende': 'Un modèle 3D par piège, dont la taille suit une donnée ; les luminaires allumés laissent leurs halos.'}]},
    {'role': 'Représenter', 'titre': 'Des surfaces en volume', 'format': 'large',
     'texte': 'Une surface peut être extrudée d’après un champ numérique, et colorée par un autre : un bâti selon sa hauteur, une grille d’analyse selon une mesure, une colonne '
              'par relevé. Les volumes sont opaques, pour que deux couches ne se traversent pas.',
     'pourquoi': 'Atlas montre le volume ; les agrégats — totaux, moyennes, mailles — se calculent dans le document, avec des formules Grist.',
     'exemple': 'une colonne par nuit et par piège, haute de ce qu’il a compté ; et une grille de mailles de 50 m, haute du flux lumineux installé.',
     'utilise': ['Extrusion par un champ', 'Palette graduée', 'Mode « à plat » ou « en volume »'],
     'images': [{'image': 'cas-releves.jpg', 'legende': 'Trois colonnes par piège — juin, juillet, septembre. Comptages fictifs.'},
                {'image': 'cas-grille.jpg', 'legende': 'Mailles de 50 m : hauteur selon le flux installé, couleur selon la température moyenne.'}]},
    {'role': 'Éditer', 'titre': 'L’objet cliqué est la ligne', 'format': 'large',
     'texte': 'Cliquer un objet ouvre sa fiche : c’est la ligne de la table, avec ses champs typés, ses listes de choix et ses références. Ce qu’on y écrit va dans le document. '
              'On peut aussi dessiner un point, une ligne ou une surface, reprendre une forme sommet par sommet, annuler et rétablir ; l’apparence d’une couche s’enregistre toute seule.',
     'exemple': 'la fiche du piège P14, avec ses onglets : la ligne de la table, puis les formulaires que l’équipe a proposés.',
     'utilise': ['Fiche d’objet', 'Dessin et modification de formes', 'Annuler / rétablir', 'Enregistrement automatique'],
     'images': [{'image': 'cas-fiche.jpg', 'legende': 'La fiche d’un objet, à droite ; la sélection reste visible sur la carte.'}]},
    {'role': 'Éditer', 'titre': 'Une bulle sur l’objet touché', 'format': 'large',
     'texte': 'En consultation, toucher un objet ouvre une bulle que l’équipe compose : un titre, les photos de la ligne, l’état en couleur, quelques champs, la dernière visite de la table liée, '
              'et les gestes utiles. Atlas en propose une première version d’après le schéma de la table ; l’équipe la retouche champ par champ.',
     'pourquoi': 'On voit l’essentiel sans ouvrir douze champs : la bulle lit la table, elle ne la copie pas.',
     'exemple': 'la bulle d’un piège, aux libellés de l’étude (type, lumière au-dessus, insectes par nuit).',
     'utilise': ['Bulle d’objet', 'Libellés de champs'],
     'images': [{'image': 'cas-bulle.jpg', 'legende': 'La bulle du piège P14. Comptages fictifs.'}]},
    {'role': 'Éditer', 'titre': 'Des formulaires pour le terrain', 'format': 'mobile',
     'texte': 'Atlas réutilise les formulaires natifs de Grist. Hors édition, un formulaire que l’équipe a proposé s’ouvre en onglet sur l’objet touché : champs obligatoires signalés, '
              'valeurs de départ (la date du jour, la personne connectée), enregistrement qui écrit la ligne dans la table. Cela marche dans le navigateur d’un téléphone comme dans l’application.',
     'pourquoi': 'Pas d’outil de collecte à côté, ni d’export à réimporter.',
     'exemple': 'le « Relevé de nuit » s’ouvre sur le piège touché, date préremplie.',
     'utilise': ['Formulaires de Grist', 'Valeurs de départ', 'Champs obligatoires', 'Téléphone'],
     'images': [{'image': 'cas-releve-mobile.jpg', 'legende': 'Le formulaire de relevé, ouvert sur le piège P14.'}]},
    {'role': 'Exploiter', 'titre': 'Préparer, exploiter, lire', 'format': 'large',
     'texte': 'Trois postures disent ce que l’on fait. En Préparer, l’auteur règle les couches, les formulaires, les contrôles et le récit. En Exploiter, l’agent relève sur le terrain : '
              'il choisit un objet, ajoute une visite. En Lecture, on consulte sans rien écrire. Atlas n’a pas son propre système de droits : ceux de Grist décident, table par table, '
              'et une posture que le document n’autorise pas n’est pas proposée.',
     'exemple': 'l’agent de terrain ne peut qu’ajouter des relevés : Atlas ne lui offre que cela.',
     'utilise': ['Postures', 'Droits de Grist', 'Pastille « Relevé »'],
     'images': [{'image': 'cas-postures.jpg', 'legende': 'Le menu des postures.'}]},
    {'role': 'Exploiter', 'titre': 'Contextes et tournées', 'format': 'large',
     'texte': 'Un contexte règle la carte pour un travail précis : les couches visibles, les filtres, l’heure, les relevés proposés et les pastilles utiles. Il peut porter une tournée — la ligne '
              'd’un parcours, choisie dans une couche ou tracée sur un réseau —, qui se dessine avec lui et donne leur ordre aux objets qu’il montre. « Choisir un objet » suit la même ligne. '
              'Un contexte se prépare en capturant une étape du récit : ce que l’auteur voit dans son dock est ce que l’agent retrouve.',
     'exemple': 'le remplacement de 24 luminaires, pris un à un le long d’une tournée de 1,8 km ; une autre tournée enchaîne les dix-neuf pièges.',
     'utilise': ['Contextes', 'Tournée', 'Choisir un objet', 'Pastilles par étape'],
     'images': [{'image': 'cas-tournee.jpg', 'legende': 'Le contexte « Luminaires à remplacer » : la ligne de la tournée et la liste des objets dans l’ordre du parcours.'}]},
    {'role': 'Raconter', 'titre': 'Un récit, et un trajet si besoin', 'format': 'large',
     'texte': 'Chaque étape retient le cadrage, les couches visibles, les filtres, l’heure et le fond de plan. En lecture, la caméra passe d’une étape à l’autre. Si une ligne existe, '
              'on peut la poser comme trajet : les étapes se placent dessus et le lecteur suit le parcours. On choisit enfin ce que voit celui qui ouvre la scène : la carte, le récit, ou un contexte.',
     'exemple': 'douze étapes, dont cinq contextes ; l’une est en plan, de nuit et sans la maquette, pour lire les zones d’ombre.',
     'utilise': ['Étapes capturées', 'Trajet', 'Lecture', 'Ouverture de la scène'],
     'images': [{'image': 'cas-recit.jpg', 'legende': 'Le panneau Récit : chaque étape garde son titre, son texte et les pastilles qu’elle offre.'},
                {'image': 'cas-zone-sombre.jpg', 'legende': 'Une étape en plan, de nuit, sans la maquette : ce que la lumière n’atteint pas.'}]},
    {'role': 'Raconter', 'titre': 'Des contrôles que le lecteur manipule', 'format': 'large',
     'texte': 'Chaque colonne prend le contrôle que son type appelle : des cases pour des catégories, un curseur pour un nombre, une plage pour une date, une recherche pour du texte. '
              'L’auteur choisit ceux qu’il publie, avec leurs mots ; ils apparaissent comme pastilles sur la carte, et une étape ou un contexte peut n’en offrir que quelques-uns.',
     'exemple': 'la teinte de la lumière, la température de couleur, le type de piège, le nombre d’insectes par nuit.',
     'utilise': ['Filtres par colonne', 'Pastilles du dock', 'Libellés choisis par l’auteur'],
     'images': [{'image': 'cas-controles.jpg', 'legende': 'La pastille « Teinte de la lumière » ouverte : cinq valeurs, avec leur effectif.'}]},
    {'role': 'Partager', 'titre': 'Une scène qui se retrouve et qui se partage', 'format': 'mobile',
     'texte': 'Les scènes d’un compte se listent avec leur rôle, leur date et une miniature que l’auteur choisit d’un clic sur la carte. Dans Grist, on partage le document : la carte suit, '
              'avec les droits du document. Une scène peut aussi se publier seule, sous forme de manifeste, et s’ouvrir par son adresse (`?scene=`), dans une page ou une iframe. '
              'L’application Android ouvre les scènes depuis un compte, en lecture comme en relevé.',
     'pourquoi': 'Retirer l’accès au document ou la scène publiée suffit : rien n’a été recopié ailleurs.',
     'exemple': 'la scène est dans la liste avec sa miniature de nuit ; elle est aussi publiée seule, c’est la démonstration plus bas.',
     'utilise': ['Liste des projets', 'Miniature', 'Scène publiée', 'Iframe', 'Application Android'],
     'images': [{'image': 'cas-liste-scenes.jpg', 'legende': 'La liste des projets, avec la miniature de la scène.'}]},
]

# Réorganisation : géométries, formulaires d'exploitation, application, export, intégration (voir plan-chapitres.py).
exec(compile(io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'plan-chapitres.py'), encoding='utf8').read(), 'plan-chapitres.py', 'exec'))

pr['demonstration'] = {
    'titre': 'Une scène publiée, pour essayer',
    'texte': 'La scène qui sert d’exemple à cette page s’ouvre seule, sans document Grist : la maquette du Palais Longchamp sous licence ouverte, 643 luminaires, dix-neuf pièges, '
             'une ronde de nuit, la grille de pression lumineuse, douze étapes de récit dont cinq contextes. On peut y toucher un objet, filtrer, changer d’heure.',
    'url': 'https://nic01asfr.github.io/Widgets-Grist/atlas/?scene=https%3A%2F%2Fnic01asfr.github.io%2FWidgets-Grist%2Fatlas%2Fdemos%2Fpalais-longchamp%2Fscene.json',
    'image': 'cas-nuit.jpg',
    'alt': 'Le Palais Longchamp de nuit, sur l’orthophotographie de l’IGN : les luminaires allumés laissent des halos sur le parc et les rues',
    'libelle': 'Ouvrir la démonstration',
    'mention': 'Positions des points lumineux : Ville de Marseille, Éclairage 2023 (Licence Ouverte 2.0). Maquette : IGN et Panoramax (Licence Ouverte 2.0), '
               'fabriquée par pix2hdr (Cerema) ; la fontaine, adaptée d’une photographie de Wikimedia Commons, est livrée seule sous CC BY-SA 4.0. '
               'Les caractéristiques des luminaires, les pièges, les relevés et les comptages sont fictifs : ils servent à montrer l’outil, pas à conclure.',
}
pr['apercu'] = {'mention': 'L’aperçu est Atlas seul (`vitrine=1`), sans document. La démonstration ci-dessous est une scène réelle, publiée hors Grist.'}

# Les chapitres disent déjà chaque fonction : la liste de phrases qui les doublait disparaît.
d['points'] = []

MARQUE = 'La page présente Atlas fonction par fonction'
d['journal'] = [e for e in d['journal'] if not e['texte'].startswith('La page suit désormais un seul cas')]
if not any(MARQUE in e['texte'] for e in d['journal']):
    d['journal'].insert(0, {'version': 'vitrine', 'texte': MARQUE + ', dans l’ordre où on s’en sert (charger, représenter, éditer, exploiter, raconter, partager), '
                            'avec un exemple qui les relie : l’éclairage public du Palais Longchamp, sur des positions réelles et des comptages fictifs déclarés. '
                            'La démonstration des Aygalades laisse la place à la scène de l’exemple.'})

sortie = json.dumps(d, ensure_ascii=False, indent=2)
if crlf:
    sortie = sortie.replace('\n', '\r\n')
io.open(P, 'w', encoding='utf8', newline='').write(sortie + ('\r\n' if crlf else '\n'))
print('ok', len(pr['contextes']), 'chapitres')
