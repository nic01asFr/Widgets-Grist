import zipfile, sqlite3, tempfile, os, struct

def read_u32(data, pos, le=True):
    fmt = '<I' if le else '>I'
    return struct.unpack(fmt, data[pos:pos+4])[0], pos + 4

def parse_wkb(data, pos):
    le = data[pos] == 1; pos += 1
    t, pos = read_u32(data, pos, le)
    base = t & 0x1FFFFFFF
    z = bool(t & 0x80000000) or base >= 1000
    if base > 3000: base -= 3000
    elif base > 2000: base -= 2000
    elif base > 1000: base -= 1000
    return le, base, z, pos

z = zipfile.ZipFile('tests/fixtures/qgis2grist_marseille4e_qfield.zip')
path = tempfile.mktemp(suffix='.gpkg')
open(path, 'wb').write(z.read('data/batiments_4eme.gpkg'))
conn = sqlite3.connect(path)
blob = conn.execute('SELECT geom FROM batiments_4eme LIMIT 1').fetchone()[0]
conn.close(); os.unlink(path)

start = 40
le, base, z, pos = parse_wkb(blob, start)
print('root', base, 'z', z)
n, pos = read_u32(blob, pos, le)
print('numSurfaces', n)
for i in range(n):
    le2, base2, z2, pos = parse_wkb(blob, pos)
    print(f'  member {i}: type={base2} z={z2} at={pos}')
