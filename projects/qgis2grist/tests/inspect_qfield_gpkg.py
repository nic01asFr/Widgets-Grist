import zipfile, sqlite3, tempfile, os

z = zipfile.ZipFile('tests/fixtures/qgis2grist_marseille4e_qfield.zip')
for g in [n for n in z.namelist() if n.endswith('.gpkg')]:
    path = tempfile.mktemp(suffix='.gpkg')
    open(path, 'wb').write(z.read(g))
    conn = sqlite3.connect(path)
    tables = [r[0] for r in conn.execute("SELECT table_name FROM gpkg_contents WHERE data_type='features'")]
    for t in tables:
        gc = conn.execute(
            'SELECT column_name, geometry_type_name, srs_id FROM gpkg_geometry_columns WHERE table_name=?', (t,)
        ).fetchone()
        cnt = conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        blob = conn.execute(f'SELECT {gc[0]} FROM "{t}" LIMIT 1').fetchone()
        blen = len(blob[0]) if blob and blob[0] else 0
        flags = blob[0][3] if blob and blob[0] and len(blob[0]) > 3 else None
        print(f'{g} | {t} | {gc[1]} | srs={gc[2]} | n={cnt} | blob={blen} | gpkg_flags={flags}')
    conn.close()
    os.unlink(path)
