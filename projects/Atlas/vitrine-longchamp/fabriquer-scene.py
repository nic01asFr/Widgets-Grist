"""
Fabrique la scène publiée du cas : « Éclairage public et faune nocturne — Palais Longchamp » (Scene Manifest 0.2.2).

La scène se lit seule (?scene=), sans document Grist : elle remplace l'aperçu vivant de la vitrine. Elle réunit
  - la maquette du Palais (pix2hdr v9.3), limitée aux couches qui peuvent se diffuser (voir « Licences » ci-dessous) ;
  - les 643 points lumineux de la Ville de Marseille, avec les caractéristiques d'exemple (FICTIVES) ;
  - les pièges, la ronde de nuit, les relevés (FICTIFS) et la grille de pression lumineuse ;
  - le récit en six étapes et cinq contextes (recit.json, le même fichier que celui du document).

Licences. Chaque régime reste dans son propre fichier GLB et sa propre couche, jamais mêlé à un autre :
  - Licence Ouverte 2.0 (IGN, Panoramax, Ville de Marseille) : terrain, sol, voirie, toitures, façades, ouvrages, escaliers, eau,
    séparations, arbres (positions et hauteurs mesurées), points lumineux ;
  - CC BY-SA 4.0 : la fontaine (adaptation d'une photo Wikimedia Commons), seule dans sa couche, créditée ;
  - ODbL : AUCUNE géométrie dérivée d'OpenStreetMap n'est livrée (le fond de carte est celui du service, déjà crédité) ;
  - les profils de croissance d'arbres SESAME (« usage interne ») ne sont pas livrés : les arbres prennent les modèles génériques d'Atlas.

Usage : python projects/Atlas/vitrine-longchamp/fabriquer-scene.py   (après fabriquer.py)
"""
import copy
import json
import os
import shutil

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.normpath(os.path.join(ICI, '../../..'))
PIX_OUT = os.path.normpath(os.path.join(RACINE, '../pix2hdr/experiments/atlas/out'))
TABLES = os.path.join(ICI, 'tables')
DEST = os.path.join(RACINE, 'published/atlas/demos/palais-longchamp')


def lire(chemin):
    return json.load(open(chemin, encoding='utf8'))


def ecrire(chemin, obj):
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    with open(chemin, 'w', encoding='utf8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


classes = lire(os.path.join(TABLES, 'classes_spectrales.json'))
modeles = {m['id']: m for m in lire(os.path.join(TABLES, 'modeles.json'))}
luminaires = lire(os.path.join(TABLES, 'luminaires.json'))
pieges = lire(os.path.join(TABLES, 'pieges.json'))
releves = lire(os.path.join(TABLES, 'releves.json'))
grille = lire(os.path.join(TABLES, 'grille.json'))
tournee = lire(os.path.join(TABLES, 'tournees.json'))[0]
recit = lire(os.path.join(ICI, 'recit.json'))

SANS = {'id': 'sans', 'Libelle': 'Sans éclairage', 'Couleur': '#5b5b66', 'Rang': 0}
COULEUR = {c['Libelle']: c['Couleur'] for c in classes + [SANS]}
LIBELLE_CLASSE = {c['id']: c['Libelle'] for c in classes}
MODELE_3D = {
    'M1': 'objet:mat_crosse', 'M2': 'objet:mat_crosse', 'M3': 'objet:mat_crosse', 'M4': 'objet:mat_crosse',
    'M5': 'objet:applique_facade', 'M6': 'objet:encastre_sol', 'M7': 'lampball', 'M8': 'objet:projecteur_facade',
}
PUISSANCE = {'M1': 38, 'M2': 34, 'M3': 30, 'M4': 70, 'M5': 14, 'M6': 6, 'M7': 40, 'M8': 90}
ID = lambda nom: 'layer-scene-' + nom  # noqa: E731  (identifiant interne qu'Atlas donne à une couche de scène)


def point(lon, lat, props):
    return {'type': 'Feature', 'properties': props, 'geometry': {'type': 'Point', 'coordinates': [round(lon, 7), round(lat, 7)]}}


def bbox_de(features):
    xs, ys = [], []

    def parcourir(c):
        if isinstance(c[0], (int, float)):
            xs.append(c[0])
            ys.append(c[1])
        else:
            for d in c:
                parcourir(d)
    for f in features:
        parcourir(f['geometry']['coordinates'])
    return [min(xs), min(ys), max(xs), max(ys)]


def wkt_vers_geometrie(wkt):
    corps = wkt[wkt.index('(') :]
    if wkt.startswith('POLYGON'):
        interieur = corps.strip()[2:-2]
        return {'type': 'Polygon', 'coordinates': [[[float(v) for v in p.strip().split()] for p in interieur.split(',')]]}
    interieur = corps.strip()[1:-1]
    return {'type': 'LineString', 'coordinates': [[float(v) for v in p.strip().split()] for p in interieur.split(',')]}


def champs(*specs):
    return [{'name': n, 'gType': t} for n, t in specs]


# ---------------------------------------------------------------- la maquette (régimes séparés)
os.makedirs(os.path.join(DEST, 'glb'), exist_ok=True)
scene_pix = lire(os.path.join(PIX_OUT, 'scene.json'))
par_id = {l['id']: l for l in scene_pix['layers']}
COUCHES_MAQUETTE = ['terrain-t12c', 'sol-zones-v3c', 'voirie-v3c', 'bati-toits-b5', 'bati-facades-v3b', 'ouvrages-v2', 'escaliers-v1', 'eau-v2', 'eau-voirie-v2', 'separations-v1']
FONTAINE = 'fontaine-v4'
couches = []
for cid in COUCHES_MAQUETTE + [FONTAINE]:
    l = copy.deepcopy(par_id[cid])
    for ext in ('.glb', '.objets.json'):
        src = os.path.join(PIX_OUT, 'glb', cid + ext)
        if os.path.exists(src):
            shutil.copyfile(src, os.path.join(DEST, 'glb', cid + ext))
    l['visible'] = cid != 'eau-voirie-v2'
    l['licence'] = 'CC BY-SA 4.0 (adaptation d’une photographie Wikimedia Commons)' if cid == FONTAINE else 'Licence Ouverte 2.0 (IGN, Panoramax)'
    couches.append(l)
# le piège lumineux (piege-lumineux.glb, fabriqué par piege-lumineux.py) est déjà à côté du manifeste

# ---------------------------------------------------------------- les arbres (positions et hauteurs mesurées, modèles génériques d'Atlas)
arbres = []
H_MODELE = {'tree_deciduous': 8.0, 'tree_conifer': 10.0}
ESSENCE_MODELE = {'feuillu': 'tree_deciduous', 'chene_vert': 'tree_deciduous', 'pin_pignon': 'tree_conifer', 'cypres': 'tree_conifer'}
catalogue = lire(os.path.join(RACINE, 'published/atlas/models/catalog.json'))
for m in catalogue['models']:
    if m['id'] in H_MODELE:
        H_MODELE[m['id']] = m.get('heightMeters', H_MODELE[m['id']])
for nom in ('arbres_feuillu', 'arbres_chene_vert', 'arbres_pin_pignon', 'arbres_cypres'):
    for f in lire(os.path.join(PIX_OUT, 'arbres', nom + '.geojson'))['features']:
        p = f['properties']
        modele = ESSENCE_MODELE[p['essence']]
        arbres.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(c, 7) for c in f['geometry']['coordinates'][:2]]},
                       'properties': {'essence': p['essence'], 'hauteur_m': p['hauteur_m'], 'confiance': p['confiance'], 'statut': p['statut'],
                                      '_modelId': modele, '_scale': round(p['hauteur_m'] / H_MODELE[modele], 3), '_rotationZ': p.get('_rotationZ', 0), '_offsetZ': p.get('_offsetZ', 0)}})
couches.append({
    'id': 'arbres', 'name': 'Arbres (LiDAR HD)', 'geometry_type': 'point', 'visible': True, 'visibility': {'defaultVisible': True, 'minZoom': 15.5},
    'style': {'mode': 'library', 'library': {'modelId': 'tree_deciduous'}, 'common': {'scale': 1, 'rotationX': 0, 'rotationY': 0, 'rotationZ': 0, 'offsetX': 0, 'offsetY': 0, 'offsetZ': 0},
              'declarative': {'kind': 'categorized', 'field': 'essence', 'stops': [
                  {'value': 'feuillu', 'color': '#5b8c4a', 'opacity': 1}, {'value': 'chene_vert', 'color': '#3f6b3a', 'opacity': 1},
                  {'value': 'pin_pignon', 'color': '#2f5d3a', 'opacity': 1}, {'value': 'cypres', 'color': '#2a4d3a', 'opacity': 1}], 'fallback': '#5b8c4a'}},
    'source': {'type': 'geojson', 'classe': 'externe'}, 'geojson': {'type': 'FeatureCollection', 'features': arbres},
    'bbox': bbox_de(arbres), 'featureCount': len(arbres), 'crs': 'EPSG:4326',
    'fields': champs(('essence', 'Text'), ('hauteur_m', 'Numeric'), ('confiance', 'Numeric')),
    'popup_template': '<b>{essence}</b> — {hauteur_m} m<br><small>Hauteur mesurée dans le LiDAR HD (IGN)</small>',
    'licence': 'Licence Ouverte 2.0 (IGN, Panoramax)',
})

# ---------------------------------------------------------------- les luminaires
feats = []
for l in luminaires:
    m = modeles[l['Modele']]
    feats.append(point(l['Longitude'], l['Latitude'], {
        'code': l['Code'], 'categorie': l['Categorie'], 'modele': m['Libelle'], 'teinte': LIBELLE_CLASSE[m['Classe']], 'zone': l['Zone'], 'etat': l['Etat'],
        'annee_pose': l['Annee_pose'], 'dist_eau_m': l['Dist_eau_m'], 'dist_bois_m': l['Dist_bois_m'],
        'temperatureCouleur': m['Temperature_K'], 'puissance': PUISSANCE[l['Modele']], 'hauteurFeu': l['Hauteur_feu_m'],
        'statut': 'decommissioned' if l['Etat'] == 'Défectueux' else 'functional',
    }))
TEINTES = [LIBELLE_CLASSE[c['id']] for c in classes]
couches.append({
    'id': 'luminaires', 'name': 'Luminaires', 'geometry_type': 'point', 'visible': True,
    'style': {'mode': 'library', 'library': {'modelId': 'objet:mat_crosse'}, 'common': {'scale': 1, 'rotationX': 0, 'rotationY': 0, 'rotationZ': 0, 'offsetX': 0, 'offsetY': 0, 'offsetZ': 0},
              'model': {'field': 'modele', 'categories': [{'value': modeles[k]['Libelle'], 'modelId': MODELE_3D[k]} for k in modeles], 'defaultModelId': 'objet:mat_crosse'},
              'declarative': {'kind': 'categorized', 'field': 'teinte', 'stops': [{'value': t, 'color': COULEUR[t], 'opacity': 1} for t in TEINTES], 'fallback': '#999999'}},
    'source': {'type': 'geojson', 'classe': 'externe'}, 'geojson': {'type': 'FeatureCollection', 'features': feats},
    'bbox': bbox_de(feats), 'featureCount': len(feats), 'crs': 'EPSG:4326',
    'controls': [
        {'field': 'teinte', 'type': 'select', 'label': 'Teinte de la lumière', 'active': True, 'values': TEINTES},
        {'field': 'temperatureCouleur', 'type': 'range', 'label': 'Température de couleur (K)', 'active': True, 'min': 2000, 'max': 5000, 'dataMin': 2000, 'dataMax': 5000, 'unite': 'K'},
        {'field': 'zone', 'type': 'select', 'label': 'Secteur', 'active': False, 'values': ['Parc et Palais', 'Quartier']},
    ],
    'popup_template': '<b>{modele}</b><br>{teinte} — {temperatureCouleur} K, {puissance} W<br>Feu à {hauteurFeu} m · posé en {annee_pose}<br>À {dist_eau_m} m de l’eau<br><small>Position : Ville de Marseille (Licence Ouverte 2.0). Caractéristiques : exemple fictif.</small>',
    'fields': champs(('code', 'Text'), ('categorie', 'Text'), ('modele', 'Text'), ('teinte', 'Text'), ('zone', 'Text'), ('etat', 'Text'), ('annee_pose', 'Int'), ('dist_eau_m', 'Int'), ('dist_bois_m', 'Int'),
                     ('temperatureCouleur', 'Int'), ('puissance', 'Int'), ('hauteurFeu', 'Numeric'), ('statut', 'Text')),
    'licence': 'Licence Ouverte 2.0 (Ville de Marseille) ; caractéristiques fictives',
})

# ---------------------------------------------------------------- les pièges (modèle 3D du dépôt, taille selon la moyenne d'insectes)
moyenne = {}
for r in releves:
    moyenne.setdefault(r['piege'], []).append(r['Total'])
feats = []
for p in pieges:
    lum = next((l for l in luminaires if l['Code'] == p['Luminaire']), None) if p['Luminaire'] else None
    teinte = LIBELLE_CLASSE[modeles[lum['Modele']]['Classe']] if lum else 'Sans éclairage'
    total = round(sum(moyenne[p['id']]) / len(moyenne[p['id']]))
    feats.append(point(p['Longitude'], p['Latitude'], {
        'nom': p['Nom'], 'type': p['Type'], 'teinte': teinte, 'total_moyen': total, 'nuits': len(moyenne[p['id']]), 'dist_eau_m': p['Dist_eau_m'],
        '_scale': round(7.0 + total / 20.0, 2),
    }))
couches.append({
    'id': 'pieges', 'name': 'Pièges', 'geometry_type': 'point', 'visible': True,
    'style': {'mode': 'custom', 'custom': {'url': './piege-lumineux.glb', 'filename': 'piege-lumineux.glb'},
              'common': {'scale': 1, 'rotationX': 0, 'rotationY': 0, 'rotationZ': 0, 'offsetX': 0, 'offsetY': 0, 'offsetZ': 0},
              'label': {'enabled': True, 'field': 'nom', 'size': 12},
              'declarative': {'kind': 'categorized', 'field': 'teinte', 'stops': [{'value': t, 'color': COULEUR[t], 'opacity': 1} for t in TEINTES + ['Sans éclairage']], 'fallback': '#5b5b66'}},
    'source': {'type': 'geojson', 'classe': 'externe'}, 'geojson': {'type': 'FeatureCollection', 'features': feats},
    'bbox': bbox_de(feats), 'featureCount': len(feats), 'crs': 'EPSG:4326',
    'controls': [
        {'field': 'type', 'type': 'select', 'label': 'Type de piège', 'active': True, 'values': ['Sous un luminaire', 'Témoin non éclairé']},
        {'field': 'total_moyen', 'type': 'range', 'label': 'Insectes par nuit (moyenne)', 'active': True, 'min': min(f['properties']['total_moyen'] for f in feats), 'max': max(f['properties']['total_moyen'] for f in feats),
         'dataMin': min(f['properties']['total_moyen'] for f in feats), 'dataMax': max(f['properties']['total_moyen'] for f in feats)},
    ],
    'popup_template': '<b>{nom}</b> — {type}<br>{total_moyen} insectes par nuit en moyenne sur {nuits} nuits<br><small>Comptages fictifs.</small>',
    'fields': champs(('nom', 'Text'), ('type', 'Text'), ('teinte', 'Text'), ('total_moyen', 'Int'), ('nuits', 'Int'), ('dist_eau_m', 'Int')),
    'licence': 'Positions et comptages fictifs ; modèle 3D créé pour le dépôt (Licence Ouverte 2.0)',
})

# ---------------------------------------------------------------- la ronde de nuit
ligne = [{'type': 'Feature', 'properties': {'nom': tournee['Nom'], 'longueur_m': tournee['Longueur_m'], 'arrets': tournee['Arrets'], 'ordre': tournee['Ordre']}, 'geometry': wkt_vers_geometrie(tournee['WKT'])}]
couches.append({
    'id': 'tournee', 'name': 'Ronde de nuit', 'geometry_type': 'line', 'visible': True,
    'style': {'mode': 'mapbox', 'common': {'scale': 1, 'rotationX': 0, 'rotationY': 0, 'rotationZ': 0, 'offsetX': 0, 'offsetY': 0, 'offsetZ': 0}, 'declarative': {'kind': 'single', 'color': '#C44536', 'opacity': 0.95}},
    'source': {'type': 'geojson', 'classe': 'externe'}, 'geojson': {'type': 'FeatureCollection', 'features': ligne},
    'bbox': bbox_de(ligne), 'featureCount': 1, 'crs': 'EPSG:4326',
    'popup_template': '<b>{nom}</b><br>{longueur_m} m, {arrets} pièges<br><small>Tracé : réseau BD TOPO (IGN, Licence Ouverte 2.0). Ordre de passage : exemple.</small>',
    'fields': champs(('nom', 'Text'), ('longueur_m', 'Int'), ('arrets', 'Int'), ('ordre', 'Text')),
    'licence': 'Licence Ouverte 2.0 (IGN)',
})

# ---------------------------------------------------------------- les relevés : un plot par nuit et par piège
feats = []
for r in releves:
    p = next(x for x in pieges if x['id'] == r['piege'])
    feats.append({'type': 'Feature', 'geometry': wkt_vers_geometrie(r['WKT']),
                  'properties': {'piege': p['Nom'], 'mois': r['Mois'], 'total': r['Total'], 'hauteur_m': round(r['Total'] / 8.0, 1), 'duree_h': r['duree_h'], 'temp_c': r['temp_c'],
                                 'papillons': r['Lepidopteres'], 'mouches': r['Dipteres'], 'coleopteres': r['Coleopteres']}})
COULEUR_MOIS = {'Juin': '#66c2a5', 'Juillet': '#fc8d62', 'Septembre': '#8da0cb'}
couches.append({
    'id': 'releves', 'name': 'Relevés', 'geometry_type': 'polygon', 'visible': False, 'height_field': 'hauteur_m',
    'style': {'mode': 'mapbox', 'polygonMode': 'extruded', 'common': {'scale': 1, 'rotationX': 0, 'rotationY': 0, 'rotationZ': 0, 'offsetX': 0, 'offsetY': 0, 'offsetZ': 0},
              'declarative': {'kind': 'categorized', 'field': 'mois', 'stops': [{'value': k, 'color': v, 'opacity': 1} for k, v in COULEUR_MOIS.items()], 'fallback': '#999999'}},
    'source': {'type': 'geojson', 'classe': 'externe'}, 'geojson': {'type': 'FeatureCollection', 'features': feats},
    'bbox': bbox_de(feats), 'featureCount': len(feats), 'crs': 'EPSG:4326',
    'controls': [{'field': 'mois', 'type': 'select', 'label': 'Nuit de relevé', 'active': False, 'values': list(COULEUR_MOIS)}],
    'popup_template': '<b>{piege}</b> — {mois}<br>{total} insectes dont {papillons} papillons de nuit<br><small>Comptages fictifs.</small>',
    'fields': champs(('piege', 'Text'), ('mois', 'Text'), ('total', 'Int'), ('hauteur_m', 'Numeric'), ('duree_h', 'Numeric'), ('temp_c', 'Int')),
    'licence': 'Comptages fictifs',
})

# ---------------------------------------------------------------- la grille de pression lumineuse
feats = [{'type': 'Feature', 'geometry': wkt_vers_geometrie(c['WKT']),
          'properties': {'cle': c['Cle'], 'luminaires': c['N_lum'], 'flux_total_lm': c['Flux_total_lm'], 'k_moyen': c['K_moyen'], 'hauteur_m': round(c['Flux_total_lm'] / 3000.0, 1)}} for c in grille]
couches.append({
    'id': 'grille', 'name': 'Pression lumineuse (mailles de 50 m)', 'geometry_type': 'polygon', 'visible': False, 'height_field': 'hauteur_m',
    'style': {'mode': 'mapbox', 'polygonMode': 'extruded', 'common': {'scale': 1, 'rotationX': 0, 'rotationY': 0, 'rotationZ': 0, 'offsetX': 0, 'offsetY': 0, 'offsetZ': 0},
              'declarative': {'kind': 'graduated', 'field': 'k_moyen', 'stops': [
                  {'value': 2000, 'color': '#e8a234', 'opacity': 1}, {'value': 3000, 'color': '#f2d27a', 'opacity': 1},
                  {'value': 4000, 'color': '#cfd9e6', 'opacity': 1}, {'value': 5000, 'color': '#8fb4e8', 'opacity': 1}], 'fallback': '#999999'}},
    'source': {'type': 'geojson', 'classe': 'externe'}, 'geojson': {'type': 'FeatureCollection', 'features': feats},
    'bbox': bbox_de(feats), 'featureCount': len(feats), 'crs': 'EPSG:4326',
    'popup_template': '<b>{luminaires} luminaires</b><br>Flux total : {flux_total_lm} lm<br>Température moyenne : {k_moyen} K<br><small>Hauteur = flux total. Caractéristiques fictives.</small>',
    'fields': champs(('cle', 'Text'), ('luminaires', 'Int'), ('flux_total_lm', 'Int'), ('k_moyen', 'Int'), ('hauteur_m', 'Numeric')),
    'licence': 'Calculé sur des positions de la Ville de Marseille (Licence Ouverte 2.0) et des caractéristiques fictives',
})

for i, l in enumerate(couches):
    l['order'] = i

# ---------------------------------------------------------------- le récit : les mêmes étapes que dans le document
CONTROLES = {
    'Teinte': ('luminaires', 'teinte', 'select', 'Teinte de la lumière'), 'temperatureCouleur': ('luminaires', 'temperatureCouleur', 'range', 'Température de couleur (K)'),
    'Zone': ('luminaires', 'zone', 'select', 'Secteur'), 'Type': ('pieges', 'type', 'select', 'Type de piège'),
    'Total_moyen': ('pieges', 'total_moyen', 'range', 'Insectes par nuit (moyenne)'), 'Mois': ('releves', 'mois', 'select', 'Nuit de relevé'),
}
ENV = {'sun': 'Soleil', 'basemap': 'Fonds', 'view3d': '2D / 3D'}
NOM_COUCHE = {'Luminaires': 'luminaires', 'Pieges': 'pieges', 'Releves': 'releves', 'Grille': 'grille', 'Tournees': 'tournee'}
VALEURS = {l['id']: {c['field']: c.get('values') for c in l.get('controls', [])} for l in couches}
maquette_ids = [l['id'] for l in couches if l['id'] not in NOM_COUCHE.values()]
etapes = []
for i, e in enumerate(recit['etapes']):
    visibles = {NOM_COUCHE[n] for n in e['couches']}
    # la maquette et les arbres accompagnent tout ce qui n'est pas un résultat posé à plat
    montrer_maquette = not ({'Releves', 'Grille'} & set(e['couches'])) and not e.get('sans_maquette')
    couches_etat = []
    for l in couches:
        v = l['id'] in visibles or (l['id'] in maquette_ids and montrer_maquette and l['id'] != 'eau-voirie-v2') or (l['id'] == 'arbres' and montrer_maquette)
        controles = []
        for champ, valeur in (e.get('filtres') and [(f[1], f[2]) for f in e['filtres'] if NOM_COUCHE[f[0]] == l['id']] or []):
            cle = {'Type': 'type', 'Teinte': 'teinte', 'Zone': 'zone'}[champ]
            gardees = [x for x in VALEURS[l['id']][cle] if x != valeur]
            existant = next((c for c in controles if c['field'] == cle), None)
            if existant:
                existant['values'] = [x for x in existant['values'] if x != valeur]
            else:
                controles.append({'field': cle, 'type': 'select', 'values': gardees})
        couches_etat.append({'id': l['id'], 'name': l['name'], 'sourceTable': None, 'visible': bool(v), 'controls': controles, 'controlDeclaratives': []})
    pastilles = [{'id': 'data:%s:%s' % (ID(CONTROLES[p][0]), CONTROLES[p][1]), 'label': CONTROLES[p][3]} for p in e['pastilles'] if p in CONTROLES]
    pastilles += [{'id': p, 'label': ENV[p]} for p in e['pastilles'] if p in ENV]
    etat = {
        'camera': e['camera'], 'projection': 'mercator', 'timeOfDay': e['heure'], 'date': recit['jour'] + 'T12:00:00.000Z', 'shadows': True, 'labels': True, 'sky': True,
        'basemap': e.get('fond', 'liberty'), 'buildings3D': False, 'terrain3D': False, 'layers': couches_etat, 'pastilles': pastilles,
    }
    if e.get('contexte'):
        usage = {'contexte': True}
        if e.get('tournee'):
            usage['tournee'] = {'type': 'LineString', 'coordinates': ligne[0]['geometry']['coordinates'], 'sourceTable': None, 'nom': tournee['Nom']}
        etat['usage'] = usage
    etapes.append({'id': e.get('cle') or 'recit-%d' % (i + 1), 'title': e['titre'], 'description': e['texte'], 'state': etat})

scene = {
    'version': '0.2.2', 'manifest_version': 'V0.2',
    'title': 'Éclairage public et faune nocturne — Palais Longchamp',
    'subtitle': 'Un exemple construit : positions réelles, caractéristiques et comptages fictifs',
    'project_name': 'Éclairage public et faune nocturne — Palais Longchamp',
    'provenance': {
        'producer': 'atlas-vitrine/palais-longchamp',
        'attribution': [
            'Points lumineux (position, code, catégorie) : Ville de Marseille, Éclairage 2023, Licence Ouverte 2.0.',
            'Maquette du Palais Longchamp, tracé de la ronde : IGN (LiDAR HD, BD TOPO, BD ORTHO, RGE ALTI) et Panoramax, Licence Ouverte / Open Licence 2.0 (Etalab) ; maquette fabriquée par pix2hdr (Cerema).',
            'Fontaine monumentale : adaptation d’une photographie de Wikimedia Commons, CC BY-SA 4.0 ; la couche est livrée seule, sous cette licence.',
            'Textures de référence : ambientCG, CC0 1.0. Fond de carte : © les contributeurs OpenStreetMap (ODbL), OpenFreeMap, OpenMapTiles.',
            'Caractéristiques des luminaires, pièges, relevés et comptages : fictifs, produits par règles (vitrine-longchamp/fabriquer.py). Ils illustrent l’outil, pas une étude.',
        ],
    },
    'camera': recit['etapes'][0]['camera'],
    'settings': {'basemap': 'liberty', 'buildings3D': False, 'terrain3D': False, 'labels': True, 'sky': True, 'shadows': True, 'timeOfDay': 840, 'date': recit['jour'] + 'T12:00:00.000Z'},
    'layers': couches,
    'story': {'version': '0.2.1', 'steps': etapes},
}
ecrire(os.path.join(DEST, 'scene.json'), scene)
taille = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(DEST) for f in fs)
print('scène :', len(couches), 'couches,', len(etapes), 'étapes ;', round(os.path.getsize(os.path.join(DEST, 'scene.json')) / 1e6, 2), 'Mo de manifeste ;', round(taille / 1e6, 1), 'Mo au total')
