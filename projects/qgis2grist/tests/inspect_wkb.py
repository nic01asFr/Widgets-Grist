import zipfile, sqlite3, tempfile, os, struct

def wkb_type(blob):
    # skip GPKG header
    start = 0
    if blob[:2] == b'GP':
        flags = blob[3]
        env = (flags >> 1) & 7
        start = 8 + [0, 32, 48, 48, 64][min(env, 4)]
    data = blob[start:]
    bo = data[0]
    le = bo == 1
    fmt = '<I' if le else '>I'
    t = struct.unpack(fmt, data[1:5])[0]
    base = t & 0x1FFFFFFF
    z = bool(t & 0x80000000) or base > 1000
    if base > 3000: base -= 3000
    elif base > 2000: base -= 2000
    elif base > 1000: base -= 1000
    return t, base, z, start, len(blob)

z = zipfile.ZipFile('tests/fixtures/qgis2grist_marseille4e_qfield.zip')
for g in sorted(n for n in z.namelist() if n.endswith('.gpkg')):
    path = tempfile.mktemp(suffix='.gpkg')
    open(path, 'wb').write(z.read(g))
    conn = sqlite3.connect(path)
    tname = conn.execute("SELECT table_name FROM gpkg_contents WHERE data_type='features'").fetchone()[0]
    gcol = conn.execute('SELECT column_name FROM gpkg_geometry_columns WHERE table_name=?', (tname,)).fetchone()[0]
    blob = conn.execute(f'SELECT "{gcol}" FROM "{tname}" LIMIT 1').fetchone()[0]
    print(g.split('/')[-1], wkb_type(blob))
    conn.close()
    os.unlink(path)
