import zipfile,sqlite3,tempfile,os,sys
z=zipfile.ZipFile(sys.argv[1])
path=tempfile.mktemp(suffix='.gpkg')
open(path,'wb').write(z.read(sys.argv[2]))
conn=sqlite3.connect(path)
blob=conn.execute('SELECT geom FROM batiments_4eme LIMIT 1').fetchone()[0]
sys.stdout.buffer.write(blob)
conn.close(); os.unlink(path)
