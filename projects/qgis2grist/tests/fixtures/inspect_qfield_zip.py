"""Inspecte un paquet QField (ZIP officiel) — couches QGS + entités GPKG."""
import re
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


def read_qgs_from_qgz(qgz_bytes: bytes) -> str:
    with zipfile.ZipFile(__file__ and __import__('io').BytesIO(qgz_bytes)) as z:
        qgs = next(n for n in z.namelist() if n.endswith('.qgs'))
        return z.read(qgs).decode('utf-8', errors='replace')


def vector_layers_from_qgs(xml_text: str):
    root = ET.fromstring(xml_text)
    out = []
    for ml in root.findall('.//maplayer'):
        if ml.get('type') != 'vector':
            continue
        name = (ml.findtext('layername') or 'Couche').strip()
        ds = (ml.findtext('datasource') or '').strip()
        geom = ml.get('geometry') or ''
        out.append({'name': name, 'datasource': ds, 'geometry': geom})
    return out


def gpkg_feature_count(gpkg_path: Path) -> int:
    conn = sqlite3.connect(gpkg_path)
    cur = conn.cursor()
    cur.execute("SELECT table_name FROM gpkg_contents WHERE data_type='features'")
    tables = [r[0] for r in cur.fetchall()]
    total = 0
    for t in tables:
        cur.execute(f'SELECT COUNT(*) FROM "{t}"')
        total += cur.fetchone()[0]
    conn.close()
    return total


def inspect_qfield_zip(zip_path: Path):
    with zipfile.ZipFile(zip_path) as outer:
        names = outer.namelist()
        qgz_entry = next((n for n in names if n.endswith('.qgz')), None)
        if not qgz_entry:
            raise SystemExit(f'Pas de .qgz dans {zip_path.name}')
        qgs_xml = read_qgs_from_qgz(outer.read(qgz_entry))
        layers = vector_layers_from_qgs(qgs_xml)
        gpkg_entries = [n for n in names if n.endswith('.gpkg')]

        results = []
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            for entry in gpkg_entries:
                dest = tmp_path / Path(entry).name
                dest.write_bytes(outer.read(entry))
            for layer in layers:
                base = Path(layer['datasource'].split('|')[0].split('/')[-1]).stem.lower()
                match = next((e for e in gpkg_entries if base in e.lower()), None)
                count = 0
                if match:
                    count = gpkg_feature_count(tmp_path / Path(match).name)
                results.append({**layer, 'gpkg': match, 'featureCount': count})
        return {
            'file': zip_path.name,
            'qgz': qgz_entry,
            'gpkgFiles': gpkg_entries,
            'layers': results,
        }


if __name__ == '__main__':
    for p in sys.argv[1:]:
        info = inspect_qfield_zip(Path(p))
        print('FILE', info['file'], 'QGZ', info['qgz'])
        print('GPKG', len(info['gpkgFiles']))
        for l in info['layers']:
            print(' -', l['name'], '|', l['geometry'], '|', l['featureCount'], 'entités', '|', l['gpkg'])
