"""
Bloc de réorganisation des chapitres, inséré par ecrire-vitrine.py (exec) après la définition de pr['contextes'].

Il complète les chapitres de base (une fonction d'Atlas chacun) avec ce qui manquait : le dessin et l'édition de géométries, les formulaires comme outil
d'exploitation, l'application mobile pour elle-même, l'export, la recherche, le regroupement de points, le tracé sur un réseau, l'intégration.
"""


def ch(titre):
    return next(c for c in pr['contextes'] if c['titre'] == titre)


# ---- Charger : la recherche et les fichiers
c = ch('Vos tables deviennent des couches')
c['texte'] += (' La palette de recherche (⌘K) retrouve un objet, une couche ou un lieu, ou ouvre la liste des objets d’une couche. '
               'Un projet QGIS s’y verse par qgis2grist.')
c['utilise'] = ['Tables géographiques', 'GeoJSON, GPX, KML, CSV', 'OpenStreetMap', 'QGIS', 'Couche vide', 'Recherche ⌘K']

# ---- Représenter
c = ch('Colorer, dimensionner, étiqueter par la donnée')
c['texte'] += (' Une couche dense se regroupe en ronds chiffrés qui se défont au zoom ; une couleur graduée se découpe en classes aux seuils choisis, '
               'et une image tirée d’une table peut tenir lieu d’icône.')
c['utilise'] = ['Couleur par catégorie', 'Classes par seuils', 'Table de référence', 'Icônes', 'Étiquettes', 'Regroupement de points', 'Légende']

c = ch('Relief, bâti, fonds de plan et lumière du jour')
c['utilise'] = ['Fonds de plan', 'Relief IGN', 'Bâti en volume', 'Ombres portées', 'Soleil et date', 'Globe ou plan', 'Points de vue']

# ---- Éditer : la fiche (sans le dessin, qui a son chapitre), puis les géométries
c = ch('L’objet cliqué est la ligne')
c['texte'] = ('Cliquer un objet ouvre sa fiche : c’est la ligne de la table, avec ses champs typés, ses listes de choix et ses références. Ce qu’on y écrit va dans le document. '
              'Plusieurs objets se sélectionnent ensemble et se parcourent avec ◀ ▶, en sautant ceux que les filtres masquent.')
c['utilise'] = ['Fiche d’objet', 'Champs typés', 'Sélection multiple', 'Revue ◀ ▶']
i = pr['contextes'].index(c)
pr['contextes'].insert(i + 1, {
    'role': 'Éditer', 'titre': 'Ajouter et modifier des géométries', 'format': 'large',
    'texte': 'Atlas crée une couche vide — un nom, un type (point, ligne ou surface) et la table Grist qui la portera, montrée avant d’être écrite — puis on y dessine : '
             'chaque sommet s’accroche aux objets voisins (Alt pour l’éviter), l’en-tête donne la longueur ou l’aire en direct, et la fiche se remplit avant que rien ne parte. '
             'Un envoi écrit une seule ligne, géométrie et champs ensemble. Une forme existante se reprend sommet par sommet ; une colonne de coordonnées ou de WKT reste écrivable.',
    'pourquoi': 'Pas de détour par QGIS pour tracer un périmètre ou relever dix arbres. Chaque geste se défait : annuler l’ajout, le geste, la modification.',
    'exemple': 'les quatre pièges témoins sont entourés d’une surface : 4 sommets, 1,03 ha, 409 m de périmètre, lus pendant le tracé.',
    'utilise': ['Nouvelle couche', 'Tracé de points, lignes et surfaces', 'Accrochage', 'Modifier la forme', 'Annuler / rétablir', 'Création en série'],
    'images': [{'image': 'cas-dessin-trace.jpg', 'legende': 'Une surface en cours de tracé : l’aire et le périmètre suivent les sommets posés.'},
               {'image': 'cas-dessin-fiche.jpg', 'legende': 'La forme est prête ; la fiche se remplit, et « Envoyer » écrit une ligne.'}]})

# ---- Exploiter : postures, puis les formulaires (outil d’exploitation), puis contextes et tournées
postures = ch('Préparer, exploiter, lire')
form = ch('Des formulaires pour le terrain')
pr['contextes'].remove(form)
pr['contextes'].insert(pr['contextes'].index(postures) + 1, form)
form['role'] = 'Exploiter'
form['titre'] = 'Formulaires, relevés et ajouts sur le terrain'
form['texte'] = ('Atlas réutilise les formulaires natifs de Grist, et c’est en exploitation qu’ils servent. L’agent choisit un objet dans une liste, prend « le plus proche de moi » ou le touche : '
                 'un formulaire que l’équipe a proposé s’ouvre en onglet sur lui, champs obligatoires signalés, valeurs de départ (la date du jour, la personne connectée). '
                 'Un envoi écrit la ligne dans la table. Si l’auteur le propose, l’agent peut aussi ajouter un objet qui n’existe pas encore. '
                 'Cela marche dans le navigateur d’un téléphone comme dans l’application.')
form['utilise'] = ['Formulaires de Grist', 'Pastille « Relevé »', 'Le plus proche de moi', 'Valeurs de départ', 'Ajout d’objet en Exploiter']

c = ch('Contextes et tournées')
c['utilise'] = ['Contextes', 'Tournée', 'Tracer sur un réseau', 'Choisir un objet', 'Pastilles par étape']

# ---- Raconter
c = ch('Un récit, et un trajet si besoin')
c['texte'] += (' Un trajet se pose sur une ligne existante ou se trace sur un réseau de routes et de sentiers, sans service externe : on touche un départ, des points de passage et une arrivée. '
               'Des étapes peuvent aussi se créer d’un coup, une par objet qui borde le trajet.')
c['utilise'] = ['Étapes capturées', 'Trajet', 'Itinéraire sur un réseau', 'Étapes depuis les objets', 'Lecture', 'Ouverture de la scène']

# ---- Dans la poche : l’application, pour elle-même
liste = ch('Une scène qui se retrouve et qui se partage')
pr['contextes'].remove(liste)
pr['contextes'].append({
    'role': 'Dans la poche', 'titre': 'L’application Android', 'format': 'mobile',
    'texte': 'Un navigateur ne peut pas présenter de clé API à l’instance Grist ; l’application le peut. Elle ouvre les scènes depuis un compte — instance et clé réglées une fois —, avec leur rôle, '
             'leur date et une miniature que l’auteur choisit d’un clic sur la carte. Son menu change de posture, de scène ou d’instance, et crée une scène, dans Grist ou sur l’appareil seul, que l’on peut envoyer plus tard '
             'vers un document neuf. Pour travailler sans réseau, on prépare la scène : tables, formulaires et photos sont gardés sur l’appareil. Les relevés saisis hors réseau attendent dans une file, '
             'visible dans la barre, et partent tout seuls au retour du réseau. La position de l’appareil sert à trouver l’objet le plus proche, et un itinéraire se confie à l’application de guidage.',
    'pourquoi': 'Sur le terrain, le réseau manque souvent : rien ne se perd, et chaque relevé arrive dans la table du document.',
    'exemple': 'l’agent prépare la scène la veille ; le soir, au parc, il relève les pièges sans réseau, puis les envoie.',
    'utilise': ['Menu principal', 'Liste des scènes', 'Miniature', 'Hors ligne', 'File d’envoi', 'Scène sur l’appareil', 'Position', 'Itinéraire'],
    'images': [{'image': 'cas-app-menu.jpg', 'legende': 'Le menu : posture, synchronisation, disponibilité hors ligne (scène prête, 485 Ko, 11 tables), scènes récentes, nouvelle scène.'},
               {'image': 'cas-app-contexte.jpg', 'legende': 'Le choix d’un contexte, sur le téléphone.'},
               liste['images'][0]]})

# ---- Partager
pr['contextes'].append({
    'role': 'Partager', 'titre': 'Exporter', 'format': 'large',
    'texte': 'Ce que la carte montre se récupère : GeoJSON (entités et attributs), CSV (la géométrie en WKT), KML, GPX (points et traces ; les surfaces sont écartées et comptées), '
             'une image de la carte, ou un projet Atlas qui rouvre couches et réglages. Le menu propose la couche sélectionnée ou toutes ; une couche distante est annoncée comme absente du fichier.',
    'exemple': 'la table des pièges s’exporte en GeoJSON pour QGIS, et la carte de nuit en image pour un rapport.',
    'utilise': ['GeoJSON', 'CSV', 'KML', 'GPX', 'Image', 'Projet Atlas'],
    'images': [{'image': 'cas-export.jpg', 'legende': 'Le menu d’export.'}]})
pr['contextes'].append({
    'role': 'Partager', 'titre': 'Une scène qui se partage', 'format': 'large',
    'texte': 'Dans Grist, on partage le document : la carte suit, avec les droits du document. Pour une page, l’intégration en iframe prend deux formes : `?embed=true`, page minimale en lecture forcée, '
             'et `?style=singlePage`, où les droits de la personne connectée s’appliquent ; `?navbar=false` retire la barre. Une scène peut aussi se publier seule, sous forme de manifeste, '
             'et s’ouvrir par son adresse (`?scene=`), sans document Grist.',
    'pourquoi': 'Retirer l’accès au document ou la scène publiée suffit : rien n’a été recopié ailleurs.',
    'exemple': 'la scène de l’exemple est publiée seule : c’est la démonstration, juste en dessous.',
    'utilise': ['Document Grist', 'Iframe (embed, singlePage)', 'Scène publiée', 'Droits du document']})
