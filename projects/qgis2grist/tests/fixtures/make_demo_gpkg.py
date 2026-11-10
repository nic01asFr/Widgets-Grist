"""Génère un GeoPackage minimal pour tests manuels qgis2grist (stdlib only)."""
import json
import sqlite3
import struct
from pathlib import Path

OUT = Path(__file__).with_name('demo_points.gpkg')

# WKB Point EPSG:4326 — 3 points autour de Marseille
POINTS = [
    (5.369, 43.296, {'nom': 'Centre', 'type_bati': 'A', 'score': 10}),
    (5.381, 43.301, {'nom': 'Nord', 'type_bati': 'B', 'score': 25}),
    (5.355, 43.288, {'nom': 'Ouest', 'type_bati': 'A', 'score': 40}),
]

QML_CATEGORIZED = """<!DOCTYPE qgis>
<qgis>
  <renderer-v2 type="categorizedSymbol" attr="type_bati" symbollevels="0">
    <categories>
      <category value="A" label="Type A" symbol="0"/>
      <category value="B" label="Type B" symbol="1"/>
    </categories>
    <symbols>
      <symbol name="0" type="marker"><layer class="SimpleMarker"><Option name="color" value="255,0,0,255"/></layer></symbol>
      <symbol name="1" type="marker"><layer class="SimpleMarker"><Option name="color" value="0,128,255,255"/></layer></symbol>
    </symbols>
  </renderer-v2>
</qgis>"""


def wkb_point(lon, lat):
    # little-endian point with SRID 4326
    return struct.pack('<BIIdd', 1, 0x20000001, 1, lon, lat)


def main():
    if OUT.exists():
        OUT.unlink()
    conn = sqlite3.connect(OUT)
    c = conn.cursor()
    c.executescript("""
    CREATE TABLE gpkg_spatial_ref_sys (
      srs_name TEXT, srs_id INTEGER PRIMARY KEY, organization TEXT,
      organization_coordsys_id INTEGER, definition TEXT, description TEXT);
    INSERT INTO gpkg_spatial_ref_sys VALUES
      ('WGS 84', 4326, 'EPSG', 4326,
       'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]',
       'WGS 84');
    CREATE TABLE gpkg_contents (
      table_name TEXT PRIMARY KEY, data_type TEXT, identifier TEXT,
      description TEXT, last_change DATETIME, min_x DOUBLE, min_y DOUBLE,
      max_x DOUBLE, max_y DOUBLE, srs_id INTEGER);
    CREATE TABLE gpkg_geometry_columns (
      table_name TEXT PRIMARY KEY, column_name TEXT, geometry_type_name TEXT,
      srs_id INTEGER, z TINYINT, m TINYINT);
    CREATE TABLE gpkg_data_columns (
      table_name TEXT, column_name TEXT, name TEXT, title TEXT,
      description TEXT, mime_type TEXT, constraint_name TEXT);
    CREATE TABLE layer_styles (
      f_table_catalog TEXT, f_table_schema TEXT, f_table_name TEXT,
      f_geometry_column TEXT, styleQML TEXT, styleName TEXT, styleSLD TEXT,
      useAsDefault INTEGER, description TEXT, owner TEXT, ui TEXT, update_time TEXT);
    CREATE TABLE demo_points (
      fid INTEGER PRIMARY KEY AUTOINCREMENT,
      geom BLOB NOT NULL,
      nom TEXT, type_bati TEXT, score REAL);
    """)
    for lon, lat, props in POINTS:
        c.execute(
            'INSERT INTO demo_points (geom, nom, type_bati, score) VALUES (?,?,?,?)',
            (wkb_point(lon, lat), props['nom'], props['type_bati'], props['score']),
        )
    c.execute("""
      INSERT INTO gpkg_contents VALUES
        ('demo_points','features','demo_points','test',datetime('now'),
         5.355,43.288,5.381,43.301,4326)
    """)
    c.execute("""
      INSERT INTO gpkg_geometry_columns VALUES
        ('demo_points','geom','POINT',4326,0,0)
    """)
    c.execute("""
      INSERT INTO gpkg_data_columns VALUES
        ('demo_points','nom','nom','Nom du point',NULL,NULL,NULL),
        ('demo_points','type_bati','type_bati','Type bati',NULL,NULL,NULL),
        ('demo_points','score','score','Score',NULL,NULL,NULL)
    """)
    c.execute("""
      INSERT INTO layer_styles VALUES
        ('','','demo_points','geom',?,'default',NULL,1,'test categorized',NULL,NULL,NULL)
    """, (QML_CATEGORIZED,))
    conn.commit()
    conn.close()
    print('Written', OUT, 'size', OUT.stat().st_size)


if __name__ == '__main__':
    main()
