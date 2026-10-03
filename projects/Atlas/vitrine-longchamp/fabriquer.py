"""
Vitrine d'Atlas : l'éclairage public du Palais Longchamp et la faune nocturne.

Fabrique les tables du document de démonstration. Tout est reproductible (graine fixe).

CE QUI EST RÉEL
  - la position, le code et la catégorie de chaque point lumineux : Ville de Marseille, Éclairage 2023, Licence Ouverte 2.0 ;
  - les bassins (BD TOPO, IGN, Licence Ouverte 2.0) et les zones de végétation (BD TOPO) qui servent aux distances.

CE QUI EST FICTIF, ET DIT TEL DANS CHAQUE TABLE (colonne « Donnee »)
  - le modèle de luminaire affecté à chaque point, ses caractéristiques, son âge et son état ;
  - les pièges, les nuits de relevé et tous les comptages d'insectes.
  Aucune de ces valeurs n'est une mesure : ce sont des règles, écrites ici, qui donnent un jeu cohérent pour montrer l'outil.

Usage : python projects/Atlas/vitrine-longchamp/fabriquer.py
"""
import collections
import csv
import json
import math
import os
import random

ICI = os.path.dirname(os.path.abspath(__file__))
PIX = os.path.normpath(os.path.join(ICI, '../../../../pix2hdr'))
CSV_VILLE = os.path.join(PIX, 'experiments/eclairage/generation/cache/marseille_eclairage_2023.csv')
EAU = os.path.join(PIX, 'data/longchamp/lidar/bdtopo_water.geojson')
VEG = os.path.join(PIX, 'data/longchamp/lidar/zone_de_vegetation.geojson')
SORTIE = os.path.join(ICI, 'tables')
EMPRISE = (5.3911 - 0.0015, 5.3986 + 0.0015, 43.3033 - 0.001, 43.3085 + 0.001)  # lon min/max, lat min/max : la maquette + environ 100 m
PALAIS = (5.3946, 43.3044)

rng = random.Random(20261003)

from pyproj import Transformer
vers_l93 = Transformer.from_crs('EPSG:4326', 'EPSG:2154', always_xy=True)
vers_wgs = Transformer.from_crs('EPSG:2154', 'EPSG:4326', always_xy=True)

# ------------------------------------------------------------------ référentiels fictifs
CLASSES = [
    # id, libellé, couleur (teinte de la lumière), rang d'attention, facteur d'attraction des insectes (règle de la démonstration)
    ('ambre',   'Ambre (≤ 2 200 K)',        '#e8a234', 1, 0.35),
    ('sodium',  'Sodium (≈ 2 000 K)',       '#c47a2c', 2, 0.50),
    ('chaud',   'Blanc chaud (≈ 3 000 K)',  '#f2d27a', 3, 0.80),
    ('neutre',  'Blanc neutre (≈ 4 000 K)', '#cfd9e6', 4, 1.20),
    ('froid',   'Blanc froid (≥ 5 000 K)',  '#8fb4e8', 5, 1.60),
]
FACT = {c[0]: c[4] for c in CLASSES}
MODELES = [
    # id, libellé, modèle 3D du catalogue Atlas, classe, K, lm, ULOR %, remarque
    ('M1', 'Lanterne LED blanc neutre',     'streetlamp', 'neutre', 4000, 5200, 3,  'Parc ancien rénové en 2014'),
    ('M2', 'Lanterne LED blanc chaud',      'streetlamp', 'chaud',  3000, 4200, 3,  'Référence actuelle de la Ville'),
    ('M3', 'Lanterne LED ambre',            'streetlamp', 'ambre',  2200, 3300, 0,  'Ambre à conversion de phosphore, abat-jour plan'),
    ('M4', 'Sodium haute pression',         'streetlamp', 'sodium', 2000, 6800, 8,  'Ancien parc, avant rénovation'),
    ('M5', 'Applique de façade LED',        'wall_light', 'chaud',  3000, 1500, 25, 'Éclaire aussi vers le haut'),
    ('M6', 'Encastré de sol LED',           'bollard',    'chaud',  3000, 600,  0,  'Balisage de cheminement'),
    ('M7', 'Boule opaline',                 'lampball',   'neutre', 4000, 2400, 50, 'Diffuse dans toutes les directions'),
    ('M8', 'Projecteur LED de monument',    'projector',  'froid',  5000, 9000, 15, 'Mise en lumière de façade'),
]
MOD = {m[0]: m for m in MODELES}

# ------------------------------------------------------------------ géométrie
def l93(lon, lat):
    return vers_l93.transform(lon, lat)

def anneaux(geom):
    t, c = geom['type'], geom['coordinates']
    polys = [c] if t == 'Polygon' else c if t == 'MultiPolygon' else []
    return [[(p[0], p[1]) for p in ring] for poly in polys for ring in poly[:1]]

def dist_seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = 0 if dx == dy == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

def dans(px, py, ring):
    ok = False
    for i in range(len(ring)):
        (x1, y1), (x2, y2) = ring[i], ring[i - 1]
        if (y1 > py) != (y2 > py) and px < (x2 - x1) * (py - y1) / (y2 - y1) + x1:
            ok = not ok
    return ok

def dist_surfaces(x, y, rings):
    best = 1e9
    for r in rings:
        if dans(x, y, r):
            return 0.0
        for i in range(len(r)):
            a, b = r[i - 1], r[i]
            best = min(best, dist_seg(x, y, a[0], a[1], b[0], b[1]))
    return best

eau = [r for f in json.load(open(EAU, encoding='utf8'))['features'] for r in anneaux(f['geometry'])]
boisement = [r for f in json.load(open(VEG, encoding='utf8'))['features'] if f['properties'].get('nature') in ('Bois', 'Forêt fermée de feuillus')
             for r in anneaux(f['geometry'])]

# ------------------------------------------------------------------ les points lumineux réels
lignes = list(csv.DictReader(open(CSV_VILLE, encoding='utf8')))
pts = []
for r in lignes:
    if not r['LATITUDE']:
        continue
    lon, lat = float(r['LONGITUDE']), float(r['LATITUDE'])
    if EMPRISE[0] <= lon <= EMPRISE[1] and EMPRISE[2] <= lat <= EMPRISE[3]:
        pts.append({'code': r['CODE_OUVRAGE'], 'cat': r['CATEGORIE_OUVRAGE'], 'lon': lon, 'lat': lat})
for p in pts:
    p['x'], p['y'] = l93(p['lon'], p['lat'])
    p['dEau'] = round(dist_surfaces(p['x'], p['y'], eau))
    p['dBois'] = round(dist_surfaces(p['x'], p['y'], boisement))
    px, py = l93(*PALAIS)
    p['dPalais'] = round(math.hypot(p['x'] - px, p['y'] - py))

# ------------------------------------------------------------------ règles d'affectation (fictives)
# Le parc est rénové par îlots de 110 m : chaque îlot a son « programme », comme une ville réelle en a plusieurs époques.
def ilot(p):
    return (int(p['x'] // 110), int(p['y'] // 110))

programmes = {}
def programme(p):
    k = ilot(p)
    if k not in programmes:
        programmes[k] = rng.choices(['ancien', 'neutre', 'chaud', 'trame_noire'], weights=[2, 3, 4, 2])[0]
    return programmes[k]

MIX = {
    'ancien':      {'MAT': ['M4', 'M7', 'M1'], 'AXIAL': ['M4', 'M1'], 'POTEAU': ['M4', 'M7']},
    'neutre':      {'MAT': ['M1'],              'AXIAL': ['M1'],       'POTEAU': ['M1']},
    'chaud':       {'MAT': ['M2'],              'AXIAL': ['M2'],       'POTEAU': ['M2']},
    'trame_noire': {'MAT': ['M3', 'M2'],        'AXIAL': ['M3'],       'POTEAU': ['M3']},
}
HAUTEUR = {'MAT': (6.0, 9.0), 'AXIAL': (5.5, 7.5), 'POTEAU': (6.0, 8.0), 'FACADE': (3.8, 5.5), 'SOL': (0.05, 0.15), 'AUTRE': (0.6, 4.0)}

def famille(cat):
    if cat in ('MAT', 'MEL SUR MAT'):
        return 'MAT'
    if cat == 'AXIAL':
        return 'AXIAL'
    if cat.startswith('POTEAU'):
        return 'POTEAU'
    if cat in ('FACADE', 'MEL SUR FACADE'):
        return 'FACADE'
    if cat in ('SOL', 'MEL ENCASTRE SOL'):
        return 'SOL'
    return 'AUTRE'

for p in pts:
    p['prog'] = programme(p)
    f = famille(p['cat'])
    if f == 'FACADE':
        p['modele'] = 'M8' if (p['dPalais'] < 130 and rng.random() < 0.6) else 'M5'
    elif f == 'SOL':
        p['modele'] = 'M6'
    elif f == 'AUTRE':
        p['modele'] = 'M2'
    else:
        p['modele'] = rng.choice(MIX[p['prog']][f])
    lo, hi = HAUTEUR[f]
    p['hauteur'] = round(rng.uniform(lo, hi), 1)
    p['annee'] = {'ancien': rng.randint(1996, 2008), 'neutre': rng.randint(2012, 2016), 'chaud': rng.randint(2019, 2024), 'trame_noire': rng.randint(2022, 2025)}[p['prog']]
    p['abaissement'] = {'ancien': 0, 'neutre': 30, 'chaud': 50, 'trame_noire': 70}[p['prog']]
    p['zone'] = 'Parc et Palais' if (p['dBois'] <= 25 or p['dPalais'] <= 190) else 'Quartier'
    u = rng.random()
    p['etat'] = 'Bon' if u < 0.86 else ('À surveiller' if u < 0.96 else 'Défectueux')

# ------------------------------------------------------------------ pièges (fictifs)
def candidats(modele):
    return [p for p in pts if p['modele'] == modele and p['cat'] in ('MAT', 'MEL SUR MAT', 'AXIAL', 'POTEAU BOIS', 'POTEAU BETON', 'FACADE', 'MEL SUR FACADE')
            and (p['dEau'] <= 170 or p['dBois'] <= 110)]

choisis = []
for m in ['M1', 'M2', 'M3', 'M4', 'M5', 'M7', 'M8']:
    c = candidats(m)
    rng.shuffle(c)
    pris = 0
    for p in c:
        if pris < (3 if m == 'M2' else 2) and all(math.hypot(p['x'] - q['x'], p['y'] - q['y']) > 25 for q in choisis):
            choisis.append(p)
            pris += 1
pieges = []
for i, p in enumerate(choisis, 1):
    # Le piège se pose À CÔTÉ du pied du luminaire (3 m au sud-est), pas dessus : deux objets au même point se masquent.
    pieges.append({'id': i, 'nom': f'P{i:02d}', 'type': 'Sous un luminaire', 'luminaire': p['code'], 'x': p['x'] + 2.2, 'y': p['y'] - 2.2,
                   'dEau': p['dEau'], 'dBois': p['dBois'], 'dLum': 3, 'modele': p['modele']})

# Pièges témoins : à l'intérieur du boisement, loin de tout luminaire (≥ 38 m), sinon rien n'est comparable.
tem = 0
essais = 0
minx = min(p['x'] for r in boisement for p in [dict(x=q[0], y=q[1]) for q in r])
maxx = max(q[0] for r in boisement for q in r)
miny = min(q[1] for r in boisement for q in r)
maxy = max(q[1] for r in boisement for q in r)
while tem < 4 and essais < 60000:
    essais += 1
    x, y = rng.uniform(minx, maxx), rng.uniform(miny, maxy)
    if not any(dans(x, y, r) for r in boisement):
        continue
    dl = min(math.hypot(x - p['x'], y - p['y']) for p in pts)
    if dl < 38 or any(math.hypot(x - q['x'], y - q['y']) < 40 for q in pieges if q['type'] != 'Sous un luminaire'):  # témoins espacés
        continue
    tem += 1
    pieges.append({'id': len(pieges) + 1, 'nom': f'T{tem:02d}', 'type': 'Témoin non éclairé', 'luminaire': None, 'x': x, 'y': y,
                   'dEau': round(dist_surfaces(x, y, eau)), 'dBois': 0, 'dLum': round(dl), 'modele': None})

# ------------------------------------------------------------------ relevés (fictifs)
NUITS = [('2026-06-11', 'Juin', 1.00, 19.5, 3), ('2026-07-16', 'Juillet', 1.25, 24.0, 0), ('2026-09-10', 'Septembre', 0.55, 18.0, 6)]
ORDRES = [('Lepidopteres', 0.28), ('Dipteres', 0.33), ('Coleopteres', 0.17), ('Hymenopteres', 0.10), ('Autres', 0.12)]
BASE = 150.0
releves = []
for date, mois, sais, temp, vent in NUITS:
    for pg in pieges:
        if pg['modele']:
            m = MOD[pg['modele']]
            f = FACT[m[3]] * (1 + m[6] / 100.0)
        else:
            f = 0.22
        f *= 1 + 0.45 * math.exp(-pg['dEau'] / 70.0)
        f *= 1.0 - 0.04 * vent
        moy = BASE * sais * f
        ligne = {'piege': pg['id'], 'nuit': date, 'duree_h': round(rng.uniform(7.5, 9.0), 1), 'temp_c': temp + rng.randint(-1, 1), 'vent_bft': vent}
        tot = 0
        for nom, part in ORDRES:
            lam = moy * part * rng.uniform(0.75, 1.25)
            v = max(0, int(round(rng.gauss(lam, math.sqrt(max(lam, 1))))))
            ligne[nom] = v
            tot += v
        releves.append(ligne)

# ------------------------------------------------------------------ restitution : cellules, plots (mêmes formules que dans Grist)
LAT0 = 43.3044
COS0 = math.cos(math.radians(LAT0))
M_LON = 111320.0 * COS0  # mètres par degré de longitude (latitude de référence)
M_LAT = 110574.0
TAILLE_CELLULE = 50.0
MOIS = {6: 'Juin', 7: 'Juillet', 9: 'Septembre'}
RANG_MOIS = {6: 0, 7: 1, 9: 2}


def cle_cellule(lon, lat):
    # même ordre d'opérations que la formule du document : une maille ne doit pas changer de côté pour un arrondi
    return '%d_%d' % (math.floor(lon * 111320.0 * COS0 / TAILLE_CELLULE), math.floor(lat * 110574.0 / TAILLE_CELLULE))


def wkt_cellule(cle):
    i, j = [int(v) for v in cle.split('_')]
    x0, y0 = i * TAILLE_CELLULE, j * TAILLE_CELLULE
    pts = [(x0, y0), (x0 + TAILLE_CELLULE, y0), (x0 + TAILLE_CELLULE, y0 + TAILLE_CELLULE), (x0, y0 + TAILLE_CELLULE), (x0, y0)]
    return 'POLYGON((' + ', '.join('%.7f %.7f' % (x / M_LON, y / M_LAT) for x, y in pts) + '))'


def wkt_plot(lon, lat, rang):
    """Un plot de 7 m de côté, décalé de 10 m vers l'est par nuit et posé 9 m au nord du piège : trois colonnes côte à côte, qui ne masquent ni le piège ni son luminaire."""
    cos = math.cos(math.radians(lat))
    cx = lon + (rang - 1) * 10.0 / (111320.0 * cos)
    cy = lat + 9.0 / M_LAT
    dx, dy = 3.5 / (111320.0 * cos), 3.5 / M_LAT
    pts = [(cx - dx, cy - dy), (cx + dx, cy - dy), (cx + dx, cy + dy), (cx - dx, cy + dy), (cx - dx, cy - dy)]
    return 'POLYGON((' + ', '.join('%.7f %.7f' % p for p in pts) + '))'


for p in pts:
    p['cellule'] = cle_cellule(p['lon'], p['lat'])

cellules = collections.OrderedDict()
for p in sorted(pts, key=lambda q: q['cellule']):
    cellules.setdefault(p['cellule'], []).append(p)

# ------------------------------------------------------------------ la tournée de la campagne : un chemin réel entre les pièges
# Réseau : tronçons de route BD TOPO (IGN, Licence Ouverte 2.0) du site, donc rues, chemins empierrés et sentiers du parc.
import networkx as nx

ROUTES = os.path.join(PIX, 'data/longchamp/lidar/bdtopo_roads.geojson')
reseau = nx.Graph()
for f in json.load(open(ROUTES, encoding='utf8'))['features']:
    lignes = [f['geometry']['coordinates']] if f['geometry']['type'] == 'LineString' else f['geometry']['coordinates']
    for ligne in lignes:
        xy = [(round(q[0], 1), round(q[1], 1)) for q in ligne]
        for a, b in zip(xy, xy[1:]):
            if a != b:
                reseau.add_edge(a, b, weight=math.hypot(a[0] - b[0], a[1] - b[1]))
composante = max(nx.connected_components(reseau), key=len)
reseau = reseau.subgraph(composante).copy()
noeuds = list(reseau.nodes)


def noeud_proche(x, y):
    return min(noeuds, key=lambda n: math.hypot(n[0] - x, n[1] - y))


arrets = [(g, noeud_proche(g['x'], g['y'])) for g in pieges]
# Départ : le piège le plus au sud-ouest (l'entrée du parc côté boulevard), puis le plus proche non visité, par le chemin le plus court.
restants = sorted(arrets, key=lambda a: a[0]['x'] + a[0]['y'])
courant = restants.pop(0)
ordre = [courant]
while restants:
    prochain = min(restants, key=lambda a: nx.shortest_path_length(reseau, courant[1], a[1], weight='weight'))
    restants.remove(prochain)
    ordre.append(prochain)
    courant = prochain
chemin = [ordre[0][1]]
for (_, a), (_, b) in zip(ordre, ordre[1:]):
    seg = nx.shortest_path(reseau, a, b, weight='weight')
    chemin.extend(seg[1:])
longueur_tournee = sum(math.hypot(a[0] - b[0], a[1] - b[1]) for a, b in zip(chemin, chemin[1:]))
coords_tournee = [tuple(round(v, 7) for v in vers_wgs.transform(x, y)) for x, y in chemin]
ecart_max = max(math.hypot(g['x'] - n[0], g['y'] - n[1]) for g, n in arrets)

# ------------------------------------------------------------------ la tournée de remplacement : les luminaires du parc à changer
# Les luminaires blanc neutre ou blanc froid du secteur « Parc et Palais » (mâts, axiaux, poteaux), pris dans l'ordre d'un parcours qui
# suit le même réseau de chemins et de rues.
A_REMPLACER = [p for p in pts if p['zone'] == 'Parc et Palais' and MOD[p['modele']][3] in ('neutre', 'froid') and famille(p['cat']) in ('MAT', 'AXIAL', 'POTEAU')]
arrets_r = [(p, noeud_proche(p['x'], p['y'])) for p in A_REMPLACER]
restants = sorted(arrets_r, key=lambda a: a[0]['x'] + a[0]['y'])
courant = restants.pop(0)
ordre_r = [courant]
while restants:
    prochain = min(restants, key=lambda a: nx.shortest_path_length(reseau, courant[1], a[1], weight='weight'))
    restants.remove(prochain)
    ordre_r.append(prochain)
    courant = prochain
chemin_r = [ordre_r[0][1]]
for (_, a), (_, b) in zip(ordre_r, ordre_r[1:]):
    chemin_r.extend(nx.shortest_path(reseau, a, b, weight='weight')[1:])
longueur_r = sum(math.hypot(a[0] - b[0], a[1] - b[1]) for a, b in zip(chemin_r, chemin_r[1:]))
coords_r = [tuple(round(v, 7) for v in vers_wgs.transform(x, y)) for x, y in chemin_r]

# ------------------------------------------------------------------ écriture
os.makedirs(SORTIE, exist_ok=True)

def ecrire(nom, obj):
    with open(os.path.join(SORTIE, nom), 'w', encoding='utf8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)

def wgs(x, y):
    lo, la = vers_wgs.transform(x, y)
    return round(lo, 7), round(la, 7)

ecrire('classes_spectrales.json', [{'id': c[0], 'Libelle': c[1], 'Couleur': c[2], 'Rang': c[3], 'Attraction': c[4], 'Donnee': 'fictive (règle de la démonstration)'} for c in CLASSES])
ecrire('modeles.json', [{'id': m[0], 'Libelle': m[1], 'Modele3D': m[2], 'Classe': m[3], 'Temperature_K': m[4], 'Flux_lm': m[5], 'ULOR_pct': m[6], 'Remarque': m[7],
                         'Donnee': 'fictive (modèle d’exemple)'} for m in MODELES])
ecrire('luminaires.json', [{'Code': p['code'], 'Categorie': p['cat'], 'Modele': p['modele'], 'Hauteur_feu_m': p['hauteur'], 'Annee_pose': p['annee'], 'Abaissement_nuit_pct': p['abaissement'],
                            'Etat': p['etat'], 'Zone': p['zone'], 'Dist_eau_m': p['dEau'], 'Dist_bois_m': p['dBois'], 'Longitude': round(p['lon'], 7), 'Latitude': round(p['lat'], 7), 'Cellule': p['cellule'],
                            'Source': 'Ville de Marseille, Éclairage 2023, Licence Ouverte 2.0 (position, code, catégorie)',
                            'Donnee': 'modèle, hauteur, âge, abaissement, état : fictifs'} for p in pts])
ecrire('pieges.json', [{'id': g['id'], 'Nom': g['nom'], 'Type': g['type'], 'Luminaire': g['luminaire'], 'Longitude': wgs(g['x'], g['y'])[0], 'Latitude': wgs(g['x'], g['y'])[1],
                        'Dist_eau_m': g['dEau'], 'Dist_luminaire_m': g['dLum'], 'Donnee': 'fictive'} for g in pieges])
def _releve(r):
    pg = next(g for g in pieges if g['id'] == r['piege'])
    lo, la = wgs(pg['x'], pg['y'])
    mois = int(r['nuit'][5:7])
    return {**r, 'Total': sum(r[o[0]] for o in ORDRES), 'Mois': MOIS[mois], 'WKT': wkt_plot(lo, la, RANG_MOIS[mois]), 'Donnee': 'fictive'}


ecrire('releves.json', [_releve(r) for r in releves])
FLUX = {m[0]: m[5] for m in MODELES}
TEMP = {m[0]: m[4] for m in MODELES}
ecrire('tournees.json', [{'Nom': 'Campagne de juin — ronde de nuit', 'WKT': 'LINESTRING (' + ', '.join('%.7f %.7f' % c for c in coords_tournee) + ')',
                          'Longueur_m': int(round(longueur_tournee)), 'Arrets': len(ordre), 'Ordre': ' > '.join(g['nom'] for g, _ in ordre), 'Donnee': 'tracé réel (réseau BD TOPO), ordre de passage fictif'},
                          {'Nom': 'Remplacement des luminaires blanc neutre et froid', 'WKT': 'LINESTRING (' + ', '.join('%.7f %.7f' % c for c in coords_r) + ')',
                           'Longueur_m': int(round(longueur_r)), 'Arrets': len(ordre_r), 'Ordre': ' > '.join(p['code'] for p, _ in ordre_r), 'Donnee': 'tracé réel (réseau BD TOPO), luminaires et ordre de passage : exemple'}])
ecrire('grille.json', [{'Cle': cle, 'WKT': wkt_cellule(cle), 'N_lum': len(v), 'Flux_total_lm': sum(FLUX[p['modele']] for p in v),
                        'K_moyen': int(round(sum(TEMP[p['modele']] for p in v) / len(v))), 'Donnee': 'calculée à partir de luminaires dont les caractéristiques sont fictives'}
                       for cle, v in cellules.items()])


# ------------------------------------------------------------------ contrôle : l'effet attendu se voit-il ?
import collections
tot = collections.defaultdict(list)
for r in releves:
    pg = next(g for g in pieges if g['id'] == r['piege'])
    cle = pg['modele'] or 'témoin'
    tot[cle].append(sum(r[o[0]] for o in ORDRES))
print('remplacement :', len(ordre_r), 'luminaires,', int(round(longueur_r)), 'm')
print('tournée :', int(round(longueur_tournee)), 'm,', len(ordre), 'arrêts, écart maximal au chemin', int(round(ecart_max)), 'm')
print(len(cellules), 'cellules de', int(TAILLE_CELLULE), 'm')
print(len(pts), 'points lumineux réels ;', len(pieges), 'pièges ;', len(releves), 'relevés')
print('programmes par îlot :', collections.Counter(programmes.values()))
print('modèles :', collections.Counter(p['modele'] for p in pts))
print('zones :', collections.Counter(p['zone'] for p in pts))
for k, v in sorted(tot.items(), key=lambda kv: -sum(kv[1])):
    print(f'  {k:8s} n={len(v):2d}  moyenne par nuit = {sum(v) / len(v):6.0f}')
