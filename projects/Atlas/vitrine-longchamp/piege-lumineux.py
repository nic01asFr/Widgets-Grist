"""
Vitrine d'Atlas : modèle 3D d'un piège lumineux à insectes (type piège Heath).

Fabrique `published/atlas/demos/palais-longchamp/piege-lumineux.glb`, le modèle posé sur les
points de la couche des pièges (style.mode "custom", url du GLB) dans le document de
démonstration du Palais Longchamp.

CE QUE REPRÉSENTE LE MODÈLE
  Un piège de terrain en entomologie, de la famille des pièges Heath / pièges à entonnoir :
    - un trépied de trois pieds en tube sombre, qui isole le seau de l'humidité du sol ;
    - un seau cylindrique blanc cassé, légèrement évasé vers le haut, avec un collier à l'ouverture ;
    - un entonnoir clair qui coiffe le seau : les insectes attirés par la lumière heurtent les
      ailettes, glissent le long de l'entonnoir et tombent dans le seau par le col ;
    - un support de lampe sombre, au-dessus du col de l'entonnoir ;
    - quatre ailettes verticales minces (plaques déflectrices) qui rayonnent autour de la lampe ;
    - un tube lumineux vertical, émissif jaune-blanc (lumière attractive), et son chapeau.

CONVENTIONS (relevées sur les modèles du catalogue, published/atlas/models/colored/*.glb)
  - unité : le mètre (1 unité glTF = 1 m) ; aucun facteur d'échelle dans le nœud ;
  - axe vertical : +Y (norme glTF) ; l'objet est centré sur l'axe vertical (X = Z = 0) ;
  - origine : au pied de l'objet, Y = 0 est le sol (Bollard : Y de 0 à 1,03 m) ;
  - un seul nœud, un seul maillage, une primitive par matériau, matériaux à faces doubles ;
  - un matériau émissif porte le suffixe "|E" dans son nom, comme "amber|E" du catalogue ;
  - aucune texture, aucune extension, aucune compression : couleurs de matériau seulement.

DIMENSIONS (mètres)
  hauteur totale 0,90 ; emprise 0,416 (X) sur 0,435 (Z), imposée par les pieds du trépied.
    pieds         3 tubes, rayon 0,008, de 0,22 m du pied de l'axe (sol) à 0,10 m (sous le seau), h 0,24
    seau          Y 0,22 à 0,52 ; rayon 0,17 au fond, 0,20 à l'ouverture ; collier 0,208 sur 0,025
    entonnoir     cône de 0,20 (Y 0,52) à 0,045 (Y 0,40), puis col de rayon 0,045 jusqu'à Y 0,33
    support       cylindre de rayon 0,035, Y 0,52 à 0,55
    ailettes      4 plaques de 0,17 x 0,29 x 0,006, du rayon 0,03 au rayon 0,20, Y 0,51 à 0,80
    tube          rayon 0,022, Y 0,55 à 0,87 ; chapeau tronconique Y 0,87 à 0,90

MATÉRIAUX
  - "seau" : blanc cassé, mat ;
  - "entonnoir" : blanc plus gris, mat ;
  - "metalDark" : gris anthracite, métallique (même nom que les modèles du catalogue) ;
  - "ailette" : gris clair bleuté, alphaMode BLEND (alpha 0,40) : translucide dans un visualiseur
    glTF standard. ATLAS FORCE L'OPACITÉ des matériaux de modèle (`fixGltfMaterial`, app_v7.js :
    transparent = false, opacity = 1) : dans Atlas les ailettes se rendent pleines, en gris clair ;
  - "lampe|E" : tube émissif jaune-blanc, emissiveFactor (1,00 ; 0,93 ; 0,55).

POIDS : 688 triangles, bien en dessous de la limite de 3 000.

LICENCE
  Œuvre originale créée pour ce dépôt, sans aucun emprunt. Mise à disposition sous Licence Ouverte 2.0
  (Etalab) ; l'auteur la verse aussi, au choix de l'utilisateur, au domaine public (CC0 1.0).

Usage : python projects/Atlas/vitrine-longchamp/piege-lumineux.py
        (Python pur : struct et json ; aucune dépendance. Le fichier écrit est relu et contrôlé.)
"""
import json
import math
import os
import struct

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.normpath(os.path.join(ICI, '../../..'))
SORTIE = os.path.join(RACINE, 'published/atlas/demos/palais-longchamp/piege-lumineux.glb')

COTE = 32            # nombre de pans des pièces rondes
COTE_FIN = 12        # pans du tube lumineux et des pieds
HAUTEUR_VISEE = 0.90

# ---------------------------------------------------------------------------------------------
# Matériaux : nom, facteur de couleur de base, métal, rugosité, émissif, mode alpha
# ---------------------------------------------------------------------------------------------
MATERIAUX = [
    {'nom': 'seau', 'couleur': (0.93, 0.92, 0.87, 1.0), 'metal': 0.0, 'rugosite': 0.65},
    {'nom': 'entonnoir', 'couleur': (0.80, 0.80, 0.76, 1.0), 'metal': 0.0, 'rugosite': 0.55},
    {'nom': 'metalDark', 'couleur': (0.23, 0.25, 0.27, 1.0), 'metal': 0.7, 'rugosite': 0.40},
    {'nom': 'ailette', 'couleur': (0.80, 0.84, 0.87, 0.40), 'metal': 0.0, 'rugosite': 0.20, 'alpha': 'BLEND'},
    {'nom': 'lampe|E', 'couleur': (0.95, 0.92, 0.60, 1.0), 'metal': 0.0, 'rugosite': 0.30,
     'emissif': (1.0, 0.93, 0.55)},
]
IDX = {m['nom']: i for i, m in enumerate(MATERIAUX)}


# ---------------------------------------------------------------------------------------------
# Petite algèbre vectorielle
# ---------------------------------------------------------------------------------------------
def sous(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def ajoute(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def mul(a, k):
    return (a[0] * k, a[1] * k, a[2] * k)


def pscal(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def pvec(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norme(a):
    n = math.sqrt(pscal(a, a))
    return (a[0] / n, a[1] / n, a[2] / n)


class Maillage:
    """Sommets, normales et triangles d'un matériau. Le sens des triangles est corrigé
    d'après les normales fournies : une face dont la normale géométrique contredit la normale
    déclarée est retournée, ce qui garantit des faces extérieures cohérentes."""

    def __init__(self):
        self.pos = []
        self.nor = []
        self.idx = []

    def sommet(self, p, n):
        self.pos.append(p)
        self.nor.append(norme(n))
        return len(self.pos) - 1

    def triangle(self, a, b, c):
        g = pvec(sous(self.pos[b], self.pos[a]), sous(self.pos[c], self.pos[a]))
        moy = ajoute(ajoute(self.nor[a], self.nor[b]), self.nor[c])
        if pscal(g, moy) < 0:
            b, c = c, b
        self.idx.extend((a, b, c))


def base_orthonormee(axe):
    """Deux vecteurs unitaires perpendiculaires entre eux et à `axe`."""
    ref = (1.0, 0.0, 0.0) if abs(axe[0]) < 0.9 else (0.0, 0.0, 1.0)
    e1 = norme(pvec(axe, ref))
    e2 = pvec(axe, e1)
    return e1, e2


def tronc(m, p0, p1, r0, r1, pans, cap0=True, cap1=True):
    """Tronc de cône (cylindre si r0 == r1) de l'axe p0 -> p1, rayons r0 en p0 et r1 en p1."""
    axe = sous(p1, p0)
    long = math.sqrt(pscal(axe, axe))
    axe = norme(axe)
    e1, e2 = base_orthonormee(axe)
    anneau0, anneau1 = [], []
    for j in range(pans + 1):  # j = pans referme l'anneau avec ses propres sommets
        a = 2.0 * math.pi * j / pans
        rad = ajoute(mul(e1, math.cos(a)), mul(e2, math.sin(a)))
        # La pente du flanc incline la normale vers l'axe si le tronc s'évase ou se resserre.
        n = ajoute(mul(rad, long), mul(axe, r0 - r1))
        anneau0.append(m.sommet(ajoute(p0, mul(rad, r0)), n))
        anneau1.append(m.sommet(ajoute(p1, mul(rad, r1)), n))
    for j in range(pans):
        m.triangle(anneau0[j], anneau1[j], anneau0[j + 1])
        m.triangle(anneau0[j + 1], anneau1[j], anneau1[j + 1])
    for actif, centre, r, sens in ((cap0, p0, r0, -1.0), (cap1, p1, r1, 1.0)):
        if not actif or r <= 0:
            continue
        n = mul(axe, sens)
        c = m.sommet(centre, n)
        bord = []
        for j in range(pans + 1):
            a = 2.0 * math.pi * j / pans
            rad = ajoute(mul(e1, math.cos(a)), mul(e2, math.sin(a)))
            bord.append(m.sommet(ajoute(centre, mul(rad, r)), n))
        for j in range(pans):
            m.triangle(c, bord[j], bord[j + 1])


def boite(m, centre, u, v, demi):
    """Pavé de centre `centre`, d'axes unitaires u, v et w = u x v, de demi-côtés `demi` (hu, hv, hw)."""
    w = pvec(u, v)
    axes = (u, v, w)
    for k in range(3):
        for s in (-1.0, 1.0):
            n = mul(axes[k], s)
            a1, a2 = axes[(k + 1) % 3], axes[(k + 2) % 3]
            h1, h2 = demi[(k + 1) % 3], demi[(k + 2) % 3]
            c = ajoute(centre, mul(n, demi[k]))
            coins = [ajoute(ajoute(c, mul(a1, s1 * h1)), mul(a2, s2 * h2))
                     for s1, s2 in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            ids = [m.sommet(p, n) for p in coins]
            m.triangle(ids[0], ids[1], ids[2])
            m.triangle(ids[0], ids[2], ids[3])


# ---------------------------------------------------------------------------------------------
# Construction de l'objet
# ---------------------------------------------------------------------------------------------
def construire():
    mailles = {m['nom']: Maillage() for m in MATERIAUX}

    # Trépied : trois pieds à 120 degrés, du sol (rayon 0,22) au dessous du seau (rayon 0,10).
    for k in range(3):
        a = math.radians(90.0 + 120.0 * k)
        # Le pied est incliné : sa section, perpendiculaire à l'axe, déborderait sous le sol.
        # On relève le centre de la section de la moitié de cette saillie pour que le point le
        # plus bas touche exactement Y = 0.
        haut = (0.10 * math.cos(a), 0.24, 0.10 * math.sin(a))
        lever = 0.0
        for _ in range(8):  # point fixe : la saillie dépend de l'axe, qui dépend du relèvement
            bas = (0.22 * math.cos(a), lever, 0.22 * math.sin(a))
            axe = norme(sous(haut, bas))
            lever = 0.008 * math.sqrt(1.0 - axe[1] * axe[1])
        tronc(mailles['metalDark'], bas, haut, 0.008, 0.008, COTE_FIN)

    # Seau : légèrement évasé, fond fermé, ouverture coiffée par l'entonnoir.
    tronc(mailles['seau'], (0, 0.22, 0), (0, 0.52, 0), 0.17, 0.20, COTE, cap0=True, cap1=False)
    # Collier du seau, à l'ouverture.
    tronc(mailles['seau'], (0, 0.495, 0), (0, 0.52, 0), 0.208, 0.208, COTE, cap0=True, cap1=True)

    # Entonnoir : cône évasé vers le haut, puis col cylindrique ouvert sur le seau.
    tronc(mailles['entonnoir'], (0, 0.40, 0), (0, 0.52, 0), 0.045, 0.20, COTE, cap0=False, cap1=False)
    tronc(mailles['entonnoir'], (0, 0.33, 0), (0, 0.40, 0), 0.045, 0.045, COTE, cap0=False, cap1=False)

    # Support de lampe, au-dessus du col, tenu par les ailettes.
    tronc(mailles['metalDark'], (0, 0.52, 0), (0, 0.55, 0), 0.035, 0.035, COTE_FIN)

    # Ailettes : quatre plaques verticales rayonnant autour de la lampe, à 45 degrés des axes.
    for k in range(4):
        a = math.radians(45.0 + 90.0 * k)
        rad = (math.cos(a), 0.0, math.sin(a))
        r_int, r_ext = 0.03, 0.20
        y0, y1 = 0.51, 0.80
        centre = ajoute(mul(rad, 0.5 * (r_int + r_ext)), (0.0, 0.5 * (y0 + y1), 0.0))
        # u = direction radiale, v = vertical, w = u x v = normale de la plaque (épaisseur).
        boite(mailles['ailette'], centre, rad, (0.0, 1.0, 0.0),
              (0.5 * (r_ext - r_int), 0.5 * (y1 - y0), 0.003))

    # Tube lumineux et son chapeau.
    tronc(mailles['lampe|E'], (0, 0.55, 0), (0, 0.87, 0), 0.022, 0.022, COTE_FIN)
    tronc(mailles['metalDark'], (0, 0.87, 0), (0, 0.90, 0), 0.045, 0.020, COTE_FIN)
    return mailles


# ---------------------------------------------------------------------------------------------
# Écriture du GLB
# ---------------------------------------------------------------------------------------------
def aligne4(octets, remplissage=b'\x00'):
    reste = (-len(octets)) % 4
    return octets + remplissage * reste


def ecrire_glb(mailles, chemin):
    binaire = bytearray()
    vues, accesseurs, primitives, materiaux_gltf = [], [], [], []

    def ajoute_vue(donnees, cible):
        decalage = len(binaire)
        binaire.extend(donnees)
        binaire.extend(b'\x00' * ((-len(binaire)) % 4))
        vues.append({'buffer': 0, 'byteOffset': decalage, 'byteLength': len(donnees), 'target': cible})
        return len(vues) - 1

    for i, mat in enumerate(MATERIAUX):
        pbr = {'baseColorFactor': list(mat['couleur']),
               'metallicFactor': mat['metal'], 'roughnessFactor': mat['rugosite']}
        d = {'name': mat['nom'], 'doubleSided': True, 'pbrMetallicRoughness': pbr}
        if 'emissif' in mat:
            d['emissiveFactor'] = list(mat['emissif'])
        if mat.get('alpha'):
            d['alphaMode'] = mat['alpha']
        materiaux_gltf.append(d)

    for i, mat in enumerate(MATERIAUX):
        m = mailles[mat['nom']]
        if not m.idx:
            continue
        # Les positions sont arrondies en float32 AVANT le calcul des bornes : min/max exacts.
        pos32 = [struct.unpack('<3f', struct.pack('<3f', *p)) for p in m.pos]
        bornes_min = [min(p[k] for p in pos32) for k in range(3)]
        bornes_max = [max(p[k] for p in pos32) for k in range(3)]
        v_pos = ajoute_vue(b''.join(struct.pack('<3f', *p) for p in pos32), 34962)
        v_nor = ajoute_vue(b''.join(struct.pack('<3f', *n) for n in m.nor), 34962)
        v_idx = ajoute_vue(struct.pack('<%dI' % len(m.idx), *m.idx), 34963)
        a = len(accesseurs)
        accesseurs.append({'bufferView': v_pos, 'componentType': 5126, 'count': len(pos32), 'type': 'VEC3',
                           'min': bornes_min, 'max': bornes_max})
        accesseurs.append({'bufferView': v_nor, 'componentType': 5126, 'count': len(m.nor), 'type': 'VEC3'})
        accesseurs.append({'bufferView': v_idx, 'componentType': 5125, 'count': len(m.idx), 'type': 'SCALAR'})
        primitives.append({'attributes': {'POSITION': a, 'NORMAL': a + 1}, 'indices': a + 2, 'material': i})

    gltf = {
        'asset': {'version': '2.0', 'generator': 'Atlas vitrine-longchamp/piege-lumineux.py',
                  'copyright': 'Creation originale du depot Widgets-Grist, Licence Ouverte 2.0 / CC0'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0, 'name': 'piege_lumineux'}],
        'meshes': [{'name': 'piege_lumineux', 'primitives': primitives}],
        'materials': materiaux_gltf,
        'accessors': accesseurs,
        'bufferViews': vues,
        'buffers': [{'byteLength': len(binaire)}],
    }
    json_octets = aligne4(json.dumps(gltf, separators=(',', ':')).encode('utf-8'), b' ')
    bin_octets = aligne4(bytes(binaire))
    total = 12 + 8 + len(json_octets) + 8 + len(bin_octets)
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    with open(chemin, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<II', len(json_octets), 0x4E4F534A))
        f.write(json_octets)
        f.write(struct.pack('<II', len(bin_octets), 0x004E4942))
        f.write(bin_octets)
    return total


# ---------------------------------------------------------------------------------------------
# Relecture et contrôle : le fichier est relu par un analyseur indépendant du générateur
# ---------------------------------------------------------------------------------------------
def verifier(chemin):
    with open(chemin, 'rb') as f:
        b = f.read()
    magie, version, longueur = struct.unpack_from('<4sII', b, 0)
    assert magie == b'glTF', 'en-tete'
    assert version == 2, 'version'
    assert longueur == len(b), 'longueur annoncee %d, reelle %d' % (longueur, len(b))
    lj, tj = struct.unpack_from('<II', b, 12)
    assert tj == 0x4E4F534A and lj % 4 == 0, 'chunk JSON'
    j = json.loads(b[20:20 + lj].decode('utf-8'))
    debut_bin = 20 + lj
    lb, tb = struct.unpack_from('<II', b, debut_bin)
    assert tb == 0x004E4942 and lb % 4 == 0, 'chunk BIN'
    assert debut_bin + 8 + lb == len(b), 'taille totale'
    assert j['buffers'][0]['byteLength'] <= lb
    donnees = b[debut_bin + 8:debut_bin + 8 + lb]

    def lire(acc):
        vue = j['bufferViews'][acc['bufferView']]
        o = vue['byteOffset'] + acc.get('byteOffset', 0)
        if acc['componentType'] == 5126:
            n = acc['count'] * 3
            return [struct.unpack_from('<3f', donnees, o + 12 * i) for i in range(acc['count'])]
        return list(struct.unpack_from('<%dI' % acc['count'], donnees, o))

    mini, maxi = [1e9] * 3, [-1e9] * 3
    triangles = 0
    for prim in j['meshes'][0]['primitives']:
        a_pos = j['accessors'][prim['attributes']['POSITION']]
        a_nor = j['accessors'][prim['attributes']['NORMAL']]
        a_idx = j['accessors'][prim['indices']]
        pos, nor, idx = lire(a_pos), lire(a_nor), lire(a_idx)
        assert len(pos) == len(nor) == a_pos['count']
        assert len(idx) % 3 == 0 and max(idx) < len(pos) and min(idx) >= 0
        for k in range(3):
            assert abs(min(p[k] for p in pos) - a_pos['min'][k]) == 0, 'min POSITION'
            assert abs(max(p[k] for p in pos) - a_pos['max'][k]) == 0, 'max POSITION'
            mini[k] = min(mini[k], a_pos['min'][k])
            maxi[k] = max(maxi[k], a_pos['max'][k])
        for n in nor:
            assert abs(math.sqrt(pscal(n, n)) - 1.0) < 1e-5, 'normale non unitaire'
        # Les faces doivent regarder du meme cote que leurs normales.
        for t in range(0, len(idx), 3):
            a, bb, c = (pos[i] for i in idx[t:t + 3])
            g = pvec(sous(bb, a), sous(c, a))
            moy = ajoute(ajoute(nor[idx[t]], nor[idx[t + 1]]), nor[idx[t + 2]])
            assert pscal(g, moy) >= 0, 'face retournee'
        triangles += len(idx) // 3
    dims = [maxi[k] - mini[k] for k in range(3)]
    assert abs(mini[1]) < 1e-5, 'le pied doit etre a Y = 0 (%g)' % mini[1]
    assert abs(dims[1] - HAUTEUR_VISEE) < 1e-3, 'hauteur %.4f' % dims[1]
    assert triangles < 3000, 'trop de triangles'
    print('GLB valide : %d octets, %d triangles, %d materiaux' % (len(b), triangles, len(j['materials'])))
    print('Boite englobante (m) : min=%s max=%s' % ([round(x, 4) for x in mini], [round(x, 4) for x in maxi]))
    print('Dimensions (m) : X=%.3f Y=%.3f Z=%.3f' % tuple(dims))


if __name__ == '__main__':
    taille = ecrire_glb(construire(), SORTIE)
    print('Ecrit : %s (%d octets)' % (SORTIE, taille))
    verifier(SORTIE)
