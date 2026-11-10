import zipfile, sqlite3, tempfile, os, struct

def read_geom(data, pos=0):
    bo = data[pos]; le = bo == 1; pos += 1
    fmt = '<I' if le else '>I'
    t = struct.unpack(fmt, data[pos:pos+4])[0]; pos += 4
    base = t & 0x1FFFFFFF
    z = bool(t & 0x80000000)
    m = bool(t & 0x40000000)
    if base > 3000: z = m = True; base -= 3000
    elif base > 2000: m = True; base -= 2000
    elif base > 1000: z = True; base -= 1000
    return t, base, z, m, pos

z = zipfile.ZipFile('tests/fixtures/qgis2grist_marseille4e_qfield.zip')
path = tempfile.mktemp(suffix='.gpkg')
open(path, 'wb').write(z.read('data/batiments_4eme.gpkg'))
conn = sqlite3.connect(path)
blob = conn.execute('SELECT geom FROM batiments_4eme LIMIT 3').fetchall()
conn.close(); os.unlink(path)

for i, (b,) in enumerate(blob):
    start = 8 + 48  # flags=3 -> XY envelope 48 bytes at offset 8
    t, base, z, m, pos = read_geom(b, start)
    print(f'feat {i}: raw={t} base={base} z={z} m={m} pos={pos}')
    if base == 12:
        n = struct.unpack('<I', b[pos:pos+4])[0]
        print('  numSurfaces', n)
        pos += 4
        for j in range(min(n, 2)):
            t2, base2, z2, m2, pos = read_geom(b, pos)
            print(f'  surface {j}: raw={t2} base={base2} pos={pos}')
