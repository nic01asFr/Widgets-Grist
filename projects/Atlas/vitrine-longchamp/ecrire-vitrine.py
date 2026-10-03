"""
Réécrit la fiche de vitrine d'Atlas (published/atlas/vitrine.json) autour du cas Longchamp : un seul récit, de bout en bout.

Rejouable : il part de la fiche telle qu'elle est et remplace le pitch, les chapitres, la démonstration et le rangement des points.
Usage : python projects/Atlas/vitrine-longchamp/ecrire-vitrine.py   puis   node scripts/generate-vitrine.js
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
              'avec vos tables — quand la donnée change, la carte a déjà changé. Cette page suit un seul cas, de bout en bout : l’éclairage public '
              'du Palais Longchamp, et ce que sa lumière fait aux insectes de nuit.')

pr['titreContextes'] = 'Un cas suivi de bout en bout : la lumière du Palais Longchamp'
pr['contextes'] = [
    {'role': 'Le gestionnaire · charger', 'titre': 'La ville telle qu’elle est', 'format': 'large',
     'texte': 'Le service éclairage d’une commune veut savoir ce que la lumière de ses rues fait à la faune du parc voisin. Il part de ce qu’il a déjà : '
              '643 points lumineux de la Ville de Marseille, rangés dans une table de son document, avec leur code et leur catégorie. Atlas reconnaît la '
              'table comme une couche géographique et la pose sur la carte, à côté de la maquette du Palais, de ses bassins et de ses arbres mesurés au LiDAR.',
     'pourquoi': 'Rien n’est exporté ni recopié : la carte lit les tables du document. Le jour où une ligne change, la carte a changé.',
     'utilise': ['Tables en couches', 'Maquette 3D publiée', 'Fond de plan'],
     'images': [
         {'image': 'cas-couches.jpg', 'legende': 'Cinq couches, toutes liées à une table du document ; les luminaires portent déjà leur modèle 3D. Positions : Ville de Marseille (Licence Ouverte 2.0).'},
         {'image': 'cas-jour.jpg', 'legende': 'Le Palais et son parc, de jour : relief, bâti, bassins et arbres de la maquette, sous licence ouverte (IGN, Panoramax).'}]},
    {'role': 'Le gestionnaire · régler', 'titre': 'Une couleur par type de lumière', 'format': 'large',
     'texte': 'Chaque luminaire a un modèle, donc une température de couleur : ambre, sodium, blanc chaud, neutre ou froid. Ces teintes sont dans une table du '
              'document ; Atlas les reprend telles quelles pour colorer la couche, et choisit le modèle 3D du catalogue — mât, applique, boule, projecteur — '
              'd’après le modèle du luminaire. À la tombée de la nuit, ceux qui sont en service s’allument ; les défectueux restent éteints, et la légende '
              'compte les uns et les autres.',
     'pourquoi': 'On ne retape ni couleur ni modèle : la table de référence fait foi, et chaque réglage dit d’où il vient.',
     'utilise': ['Symbolisation par table de référence', 'Catalogue d’objets 3D', 'Soleil et date', 'Éclairage EclExt'],
     'images': [
         {'image': 'cas-symbolisation.jpg', 'legende': 'La couleur de la couche est lue dans la table des classes spectrales, rangées de l’ambre au blanc froid.'},
         {'image': 'cas-nuit.jpg', 'legende': 'À la tombée de la nuit : 619 luminaires allumés, 24 éteints. Les caractéristiques (modèle, état) sont fictives.'}]},
    {'role': 'Le naturaliste · observer', 'titre': 'Dix-neuf pièges, quatre en zone sombre', 'format': 'large',
     'texte': 'Quinze pièges lumineux sont posés à côté d’un luminaire, quatre en plein parc, loin de toute lumière, pour servir de témoins. Un piège a son propre '
              'modèle 3D — un seau, un entonnoir et un tube lumineux — et chaque objet de la carte ouvre une bulle lisible : son type, la lumière au-dessus de lui, '
              'le nombre moyen d’insectes par nuit. Vue en plan et de nuit, sans la maquette, les halos des luminaires laissent apparaître ce qui reste sombre.',
     'pourquoi': 'La même donnée se montre de trois façons — en objets 3D pour raconter, en ronds pour travailler, en plan pour lire les ombres — sans rien refaire.',
     'utilise': ['Objet 3D du dépôt', 'Bulle d’objet', 'Étiquettes', 'Contrôles du lecteur'],
     'images': [
         {'image': 'cas-pieges-3d.jpg', 'legende': 'Les pièges, avec leur modèle 3D : la taille suit le nombre moyen d’insectes par nuit.'},
         {'image': 'cas-zone-sombre.jpg', 'legende': 'Zone sombre de référence : de nuit, en plan, les quatre témoins sont au cœur de ce que la lumière n’atteint pas.'},
         {'image': 'cas-bulle.jpg', 'legende': 'Toucher un piège ouvre sa bulle, aux libellés de l’étude. Comptages fictifs.'}]},
    {'role': 'L’agent de terrain · relever', 'titre': 'Sur place, un formulaire par nuit', 'format': 'mobile',
     'texte': 'Sur le téléphone, en posture Exploiter, l’agent touche le piège qu’il relève : la fiche s’ouvre sur le formulaire de l’équipe. La date de la nuit est '
              'préremplie, les champs obligatoires sont signalés, les comptages se saisissent par ordre d’insectes. Un envoi écrit une ligne dans la table des '
              'relevés, rattachée au piège ; rien n’est ressaisi plus tard.',
     'pourquoi': 'Pas d’outil de collecte à côté, ni d’export à réimporter : le relevé arrive dans la table que la carte lit.',
     'utilise': ['Formulaires du document', 'Posture Exploiter', 'Valeurs de départ', 'Droits de Grist'],
     'images': [{'image': 'cas-releve-mobile.jpg', 'legende': 'Le formulaire « Relevé de nuit », ouvert sur le piège P14. La date est préremplie.'}]},
    {'role': 'L’agent de terrain · tourner', 'titre': 'Une tournée par travail', 'format': 'large',
     'texte': 'Un contexte règle la carte pour un travail précis : ici, le remplacement des 24 luminaires blanc neutre des allées du parc. Il porte sa tournée, '
              'une ligne de 1,8 km calculée sur les chemins et les rues, et les luminaires se prennent un à un dans l’ordre du parcours, avec leur distance depuis '
              'le départ. Un autre contexte, la ronde de nuit, enchaîne les dix-neuf pièges. Ni couches à cocher ni filtres à refaire : l’agent choisit son travail.',
     'pourquoi': 'Le contexte se prépare en capturant une étape du récit : ce que l’auteur voit dans son dock est ce que l’agent retrouve.',
     'utilise': ['Contextes', 'Tournée', 'Choisir un objet', 'Pastilles par étape'],
     'images': [{'image': 'cas-tournee.jpg', 'legende': 'Le contexte « Luminaires à remplacer » : la ligne de la tournée, et la liste des 24 luminaires dans l’ordre du parcours.'}]},
    {'role': 'Le lecteur · comprendre', 'titre': 'Ce que les pièges ont compté', 'format': 'large',
     'texte': 'Trois nuits — juin, juillet, septembre — sont posées côte à côte au pied de chaque piège, une colonne par nuit, haute de ce que le piège a compté. '
              'D’un coup d’œil : les pièges sous un projecteur froid dépassent tous les autres, et les témoins restent bas. Une grille de mailles de 50 m, '
              'calculée dans Grist, montre à son tour où la lumière installée se concentre. Les valeurs sont fictives : elles montrent comment l’étude se lit, '
              'pas ce qu’elle dirait.',
     'pourquoi': 'Les agrégats se calculent dans le document, avec des formules Grist ; Atlas les montre en volume, sans autre outil.',
     'utilise': ['Surfaces en volume', 'Palette graduée', 'Récit', 'Fonds de plan par étape'],
     'images': [
         {'image': 'cas-releves.jpg', 'legende': 'Un plot par nuit et par piège, de la couleur de la nuit et de la hauteur des insectes comptés.'},
         {'image': 'cas-grille.jpg', 'legende': 'Où la lumière se concentre : flux installé en hauteur, température moyenne en couleur, mailles de 50 m.'}]},
    {'role': 'Tout le monde · partager', 'titre': 'Une scène qui se retrouve et qui se partage', 'format': 'mobile',
     'texte': 'La scène est dans la liste des projets, avec sa miniature : l’image que l’auteur a choisie, prise en un clic dans la carte. Qui peut écrire dans le '
              'document édite ; qui peut seulement lire voit la carte, le récit et les contextes. Aucun droit à régler dans Atlas : c’est Grist qui décide, table par '
              'table. Hors document, la même scène s’ouvre seule par son adresse — c’est l’aperçu de cette page.',
     'pourquoi': 'Retirer l’accès au document ou la scène publiée suffit : rien n’a été recopié ailleurs.',
     'utilise': ['Liste des projets', 'Miniature', 'Postures et droits', 'Scène publiée', 'Application Android'],
     'images': [{'image': 'cas-liste-scenes.jpg', 'legende': 'La liste des projets : la scène du cas, avec sa miniature de nuit prise dans le document.'}]},
]

pr['demonstration'] = {
    'titre': 'La démonstration : le cas, en scène publiée',
    'texte': 'La scène complète — maquette du Palais sous licence ouverte, 643 luminaires, dix-neuf pièges, la ronde de nuit, les relevés, la grille de pression '
             'lumineuse, douze étapes de récit dont cinq contextes. Elle s’ouvre sans document Grist.',
    'url': 'https://nic01asfr.github.io/Widgets-Grist/atlas/?scene=https%3A%2F%2Fnic01asfr.github.io%2FWidgets-Grist%2Fatlas%2Fdemos%2Fpalais-longchamp%2Fscene.json',
    'image': 'cas-nuit.jpg',
    'alt': 'Le Palais Longchamp de nuit, sur l’orthophotographie de l’IGN : les luminaires allumés laissent des halos sur le parc et les rues',
    'libelle': 'Ouvrir la démonstration',
    'mention': 'Positions des points lumineux : Ville de Marseille, Éclairage 2023 (Licence Ouverte 2.0). Maquette : IGN et Panoramax (Licence Ouverte 2.0), '
               'fabriquée par pix2hdr (Cerema) ; la fontaine, adaptée d’une photographie de Wikimedia Commons, est livrée seule sous CC BY-SA 4.0. '
               'Les caractéristiques des luminaires, les pièges, les relevés et les comptages sont fictifs.',
}
pr['apercu'] = {'mention': 'L’aperçu est Atlas seul (`vitrine=1`), sans document. La démonstration ci-dessous est une scène réelle, publiée hors Grist.'}

GROUPES = {
    'Charger et montrer': ['Vos tables deviennent des couches', 'Symbolisation par la donnée', 'Relief et volumes', 'Des objets réalistes, réglés comme une couche', 'L’éclairage public s’allume'],
    'Éditer': ['L’objet cliqué est la ligne', 'Dessiner dans la carte', 'Annuler, rétablir, enregistrer tout seul'],
    'Exploiter sur le terrain': ['Une bulle sur l’objet touché', 'Choisir un objet, sans le toucher', 'Un contexte par travail, avec sa tournée'],
    'Raconter et partager': ['Des filtres que le lecteur manipule', 'Un récit, et un trajet si besoin', 'Les droits du document font foi'],
}
actuels = {p['titre']: {k: v for k, v in p.items() if k != 'groupe'} for p in d['points']}
voulus = [t for l in GROUPES.values() for t in l]
assert set(actuels) == set(voulus), set(actuels) ^ set(voulus)
d['points'] = [{'groupe': g, **actuels[t]} for g, l in GROUPES.items() for t in l]

MARQUE = 'La page suit désormais un seul cas'
if not any(MARQUE in e['texte'] for e in d['journal']):
    d['journal'].insert(0, {'version': 'vitrine', 'texte': MARQUE + ', de bout en bout : l’éclairage public du Palais Longchamp et son effet sur les insectes de nuit, '
                            'sur des positions réelles et des comptages fictifs déclarés. La démonstration des Aygalades laisse la place à la scène du cas.'})

sortie = json.dumps(d, ensure_ascii=False, indent=2)
if crlf:
    sortie = sortie.replace('\n', '\r\n')
io.open(P, 'w', encoding='utf8', newline='').write(sortie + ('\r\n' if crlf else '\n'))
print('ok', len(pr['contextes']), 'chapitres', len(d['points']), 'points')
