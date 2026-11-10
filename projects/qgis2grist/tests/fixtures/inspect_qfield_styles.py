"""Extrait styles renderer-v2 + widgets Range d'un paquet QField (.zip)."""
import json
import re
import sys
import zipfile
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET


def qgs_from_package(zip_path: Path) -> bytes:
    with zipfile.ZipFile(zip_path) as outer:
        qgz_name = next(n for n in outer.namelist() if n.endswith('.qgz'))
        qgz = outer.read(qgz_name)
    with zipfile.ZipFile(BytesIO(qgz)) as inner:
        qgs_name = next(n for n in inner.namelist() if n.endswith('.qgs'))
        return inner.read(qgs_name)


def parse_option_tree(el):
    t = el.get('type', 'QString')
    if t == 'Map':
        return {c.get('name'): parse_option_tree(c) for c in el.findall('Option') if c.get('name')}
    if t in ('int', 'double', 'bool'):
        v = el.get('value', '')
        if t == 'int':
            return int(v) if v else 0
        if t == 'double':
            return float(v) if v else 0.0
        return v.lower() in ('1', 'true', 'yes')
    return el.get('value', '')


def normalize_hex(color):
    if not color:
        return '#888888'
    c = str(color).strip()
    if c.startswith('#'):
        return c[:7].lower()
    return c


def parse_categories(rend):
    cats = []
    for cat in rend.findall('categories/category'):
        sym = cat.find('symbol')
        color = '#888888'
        if sym is not None:
            layer = sym.find('.//prop[@k="color"]')
            if layer is not None:
                color = normalize_hex(layer.get('v'))
        val = cat.get('value') or cat.get('label') or ''
        label = cat.get('label') or val
        entry = {'value': val, 'label': label, 'color': color}
        lower = cat.get('lower')
        upper = cat.get('upper')
        if lower is not None:
            entry['lower'] = float(str(lower).replace(',', '.'))
        if upper is not None:
            entry['upper'] = float(str(upper).replace(',', '.'))
        cats.append(entry)
    return cats


def effective_renderer(rend):
    """pointCluster → renderer interne (Apiary Bee Farming)."""
    if rend is None:
        return None
    rtype = rend.get('type') or ''
    if rtype == 'pointCluster':
        inner = rend.find('renderer-v2')
        return inner if inner is not None else rend
    return rend


def parse_renderer(ml):
    rend = effective_renderer(ml.find('renderer-v2'))
    if rend is None:
        return {'type': 'singleSymbol', 'color': '#888888'}
    rtype = rend.get('type') or 'singleSymbol'
    field = rend.get('attr') or rend.get('field') or ''
    categories = parse_categories(rend)
    if rtype == 'graduatedSymbol' and categories:
        return {'type': 'graduatedSymbol', 'field': field, 'categories': categories}
    if rtype == 'categorizedSymbol' and categories:
        return {'type': 'categorizedSymbol', 'field': field, 'categories': categories}
    sym = rend.find('symbols/symbol')
    color = '#888888'
    if sym is not None:
        prop = sym.find('.//prop[@k="color"]')
        if prop is not None:
            color = normalize_hex(prop.get('v'))
    return {'type': 'singleSymbol', 'color': color}


def field_entry(f_el):
    fname = f_el.get('name')
    if not fname or fname.startswith('_'):
        return None
    tname = (f_el.get('typeName') or 'String').lower()
    gtype = 'Text'
    if 'int' in tname or 'long' in tname:
        gtype = 'Int'
    elif 'real' in tname or 'double' in tname or 'float' in tname:
        gtype = 'Numeric'
    elif 'date' in tname and 'time' in tname:
        gtype = 'DateTime'
    elif 'date' in tname:
        gtype = 'Date'
    entry = {'name': fname, 'label': fname, 'gType': gtype}
    ew = f_el.find('editWidget')
    if ew is not None and ew.get('type') == 'Range':
        cfg = ew.find('config')
        opts = {}
        if cfg is not None:
            root = cfg.find('Option[@name="map"]') or cfg.find('Option')
            if root is not None:
                opts = parse_option_tree(root)
        if opts.get('Min') is not None:
            entry['_rangeMin'] = int(opts['Min'])
        if opts.get('Max') is not None:
            entry['_rangeMax'] = int(opts['Max'])
        entry['gType'] = 'Int'
    return entry


def inspect(zip_path: Path):
    root = ET.fromstring(qgs_from_package(zip_path))
    layers = []
    for ml in root.findall('.//maplayer[@type="vector"]'):
        name = ml.findtext('layername') or '?'
        geom = ml.get('geometry') or 'None'
        fields = []
        for f in ml.findall('fieldConfiguration/field'):
            fe = field_entry(f)
            if fe:
                fields.append(fe)
        style = parse_renderer(ml)
        layers.append({
            'name': re.sub(r'[^a-zA-Z0-9_]', '_', name).strip('_') or name,
            'displayName': name,
            'geomType': 'Point' if 'Point' in geom else ('Line' if 'Line' in geom else 'Polygon'),
            'fields': fields,
            'style': style,
            'featureCount': 1,
            'hasData': True,
        })
    return layers


if __name__ == '__main__':
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / 'web' / 'qfield_bees.zip'
    print(json.dumps(inspect(path), ensure_ascii=False))
