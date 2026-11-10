// Serveur statique de developpement pour le harnais qgis2grist.
// Sans dependance. Usage : node tests/harness/serveur.mjs [port]
//
// - sert le dossier projects/qgis2grist sur 127.0.0.1:8711 (types MIME, no-store) ;
// - sert aussi /grist_forms/* depuis le dossier frere projects/grist_forms (lecture
//   seule) car index_v2.html charge ../grist_forms/shared/publish.js ;
// - POST /__sortie/<nom>.json ecrit le corps dans tests/harness/_sortie/<nom>.json
//   (seul endroit ou le serveur ecrit) : la page y depose les captures.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FRERE_FORMS = path.resolve(RACINE, '..', 'grist_forms');
const SORTIE = path.join(RACINE, 'tests', 'harness', '_sortie');
const PORT = Number(process.argv[2] || process.env.Q2G_PORT || 8711);
const HOTE = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.zip': 'application/zip', '.qgz': 'application/octet-stream',
  '.gpkg': 'application/geopackage+sqlite3', '.qgs': 'text/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.grist': 'application/octet-stream',
};

function entetes(extra) {
  return { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', ...extra };
}

function resoudre(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch (_) { return null; }
  if (p === '/' || p === '') p = '/index_v2.html';
  let base = RACINE;
  let rel = p;
  if (p.startsWith('/grist_forms/')) { base = FRERE_FORMS; rel = p.slice('/grist_forms'.length); }
  const complet = path.resolve(base, '.' + rel);
  if (complet !== base && !complet.startsWith(base + path.sep)) return null;
  return complet;
}

const serveur = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + HOTE);

  if (req.method === 'POST' && url.pathname.startsWith('/__sortie/')) {
    const nom = url.pathname.slice('/__sortie/'.length);
    if (!/^[A-Za-z0-9._-]+\.json$/.test(nom)) {
      res.writeHead(400, entetes()); res.end('nom invalide'); return;
    }
    const morceaux = [];
    req.on('data', (c) => morceaux.push(c));
    req.on('end', () => {
      fs.mkdirSync(SORTIE, { recursive: true });
      const corps = Buffer.concat(morceaux);
      fs.writeFileSync(path.join(SORTIE, nom), corps);
      res.writeHead(200, entetes({ 'Content-Type': 'application/json' }));
      res.end(JSON.stringify({ ok: true, octets: corps.length, fichier: 'tests/harness/_sortie/' + nom }));
    });
    return;
  }

  if (req.method === 'OPTIONS') { res.writeHead(204, entetes({ 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': '*' })); res.end(); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, entetes()); res.end(); return; }

  const fichier = resoudre(url.pathname);
  if (!fichier) { res.writeHead(403, entetes()); res.end('interdit'); return; }
  fs.stat(fichier, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, entetes({ 'Content-Type': 'text/plain; charset=utf-8' })); res.end('introuvable : ' + url.pathname); return; }
    const type = MIME[path.extname(fichier).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, entetes({ 'Content-Type': type, 'Content-Length': st.size }));
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(fichier).pipe(res);
  });
});

serveur.listen(PORT, HOTE, () => {
  console.log(`[q2g-harnais] http://${HOTE}:${PORT}/index_v2.html  (racine ${RACINE})`);
});
