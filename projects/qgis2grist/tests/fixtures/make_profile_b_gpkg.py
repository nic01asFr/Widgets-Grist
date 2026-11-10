"""Génère un GPKG ~55k points pour tests Profil B (viewport LOD). Stdlib only."""
import sqlite3
import struct
from pathlib import Path

OUT = Path(__file__).with_name('profile_b_points.gpkg')
COUNT = 55000
ORIGIN_LON, ORIGIN_LAT = 5.36, 43.29
STEP = 0.00015  # ~17 m — grille compacte autour de Marseille


def wkb_point(lon, lat):
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
      ('WGS 84', 4326, 'EPSG', 4326, 'EPSG:4326', 'WGS 84');
    CREATE TABLE gpkg_contents (
      table_name TEXT PRIMARY KEY, data_type TEXT, identifier TEXT,
      description TEXT, last_change DATETIME, min_x DOUBLE, min_y DOUBLE,
      max_x DOUBLE, max_y DOUBLE, srs_id INTEGER);
    CREATE TABLE gpkg_geometry_columns (
      table_name TEXT PRIMARY KEY, column_name TEXT, geometry_type_name TEXT,
      srs_id INTEGER, z TINYINT, m TINYINT);
    CREATE TABLE profile_b_points (
      fid INTEGER PRIMARY KEY AUTOINCREMENT,
      geom BLOB NOT NULL,
      zone TEXT, score REAL);
    """)
    cols = int(COUNT ** 0.5) + 1
    for i in range(COUNT):
        lon = ORIGIN_LON + (i % cols) * STEP
        lat = ORIGIN_LAT + (i // cols) * STEP
        c.execute(
            'INSERT INTO profile_b_points (geom, zone, score) VALUES (?,?,?)',
            (wkb_point(lon, lat), f'Z{i % 12}', float(i % 100)),
        )
    c.execute("""
      INSERT INTO gpkg_contents VALUES
        ('profile_b_points','features','profile_b_points','LOD Profil B test',datetime('now'),
         ?, ?, ?, ?, 4326)
    """, (ORIGIN_LON, ORIGIN_LAT, ORIGIN_LON + cols * STEP, ORIGIN_LAT + cols * STEP))
    c.execute("""
      INSERT INTO gpkg_geometry_columns VALUES
        ('profile_b_points','geom','POINT',4326,0,0)
    """)
    conn.commit()
    conn.close()
    print('Written', OUT, 'features', COUNT, 'size', OUT.stat().st_size)


if __name__ == '__main__':
    main()
