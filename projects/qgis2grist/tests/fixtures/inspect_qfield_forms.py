"""Extrait layout formulaires + relations d'un paquet QField."""
import json
import re
import sys
import zipfile
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET


def qgs_from_package(zip_path: Path) -> str:
    with zipfile.ZipFile(zip_path) as outer:
        qgz_name = next(n for n in outer.namelist() if n.endswith('.qgz'))
        qgz = outer.read(qgz_name)
    with zipfile.ZipFile(BytesIO(qgz)) as inner:
        qgs_name = next(n for n in inner.namelist() if n.endswith('.qgs'))
        return inner.read(qgs_name).decode('utf-8', errors='replace')


def parse_option_tree(el):
    t = el.get('type', 'QString')
    name = el.get('name')
    if t == 'Map':
        out = {}
        for child in el.findall('Option'):
            k = child.get('name')
            if k:
                out[k] = parse_option_tree(child)
        return out
    if t == 'List':
        return [parse_option_tree(c) for c in el.findall('Option')]
    if t in ('int', 'double', 'bool'):
        v = el.get('value', '')
        if t == 'int':
            return int(v) if v else 0
        if t == 'double':
            return float(v) if v else 0.0
        return v.lower() in ('1', 'true', 'yes')
    return el.get('value', '')


def edit_widgets(ml):
    widgets = {}
    for f in ml.findall('fieldConfiguration/field'):
        fname = f.get('name')
        ew = f.find('editWidget')
        if fname and ew is not None:
            cfg = ew.find('config')
            opts = {}
            if cfg is not None:
                root = cfg.find('Option[@name="map"]') or cfg.find('Option')
                if root is not None:
                    opts = parse_option_tree(root)
            widgets[fname] = {'type': ew.get('type'), 'options': opts}
    return widgets


def walk_form(node, depth=0):
    rows = []
    tag = node.tag.split('}')[-1] if '}' in node.tag else node.tag
    attrs = {k: v for k, v in node.attrib.items()}
    label = attrs.get('name') or attrs.get('showLabel') or tag
    rows.append({'depth': depth, 'tag': tag, 'label': label, 'attrs': attrs})
    container = node.find('attributeEditorContainer') or node.find('attributeEditorForm')
    if container is not None:
        for child in container:
            rows.extend(walk_form(child, depth + 1))
    for child in node.findall('attributeEditorField'):
        rows.extend(walk_form(child, depth + 1))
    for child in node.findall('attributeEditorRelation'):
        rows.extend(walk_form(child, depth + 1))
    return rows


def inspect(zip_path: Path):
    xml = qgs_from_package(zip_path)
    root = ET.fromstring(xml)
    rels = []
    for rel in root.findall('.//relation'):
        rels.append({
            'id': rel.get('id'),
            'name': rel.get('name'),
            'referencedLayer': rel.get('referencedLayer'),
            'referencingLayer': rel.get('referencingLayer'),
            'fieldRef': rel.findtext('fieldRef'),
            'fieldReferenced': rel.findtext('fieldReferenced'),
        })
    layers = []
    for ml in root.findall('.//maplayer[@type="vector"]'):
        name = ml.findtext('layername') or '?'
        layer_id = ml.findtext('id') or ''
        form_root = ml.find('attributeEditorForm')
        layout = walk_form(form_root) if form_root is not None else []
        layers.append({
            'name': name,
            'id': layer_id,
            'geometry': ml.get('geometry') or 'None',
            'widgets': edit_widgets(ml),
            'formLayout': layout[:40],
            'formLayoutCount': len(layout),
        })
    return {'relations': rels, 'layers': layers}


if __name__ == '__main__':
    for p in sys.argv[1:]:
        info = inspect(Path(p))
        print('===', Path(p).name)
        print('relations:', len(info['relations']))
        for r in info['relations'][:8]:
            print(' ', r['name'], r['fieldRef'], '->', r['fieldReferenced'])
        for l in info['layers']:
            if l['geometry'] == 'None' and not l['widgets']:
                continue
            print(' LAYER', l['name'], 'geom=', l['geometry'],
                  'widgets=', len(l['widgets']), 'formNodes=', l['formLayoutCount'])
            for w, meta in list(l['widgets'].items())[:6]:
                print('   widget', w, meta['type'])
            for row in l['formLayout'][:8]:
                print('   ', '  ' * row['depth'] + row['tag'], row['label'])
