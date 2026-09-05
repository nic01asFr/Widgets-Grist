#!/usr/bin/env node
/*
 * serve-dev.js — Serveur statique minimal pour tester les widgets dans Grist.
 *
 * Zero dependance (http/https + fs natifs). Sert le dossier projects/ par
 * defaut, avec en-tetes CORS et SANS X-Frame-Options (Grist doit pouvoir
 * charger le widget en iframe).
 *
 * ## Pourquoi un mode HTTPS
 *
 * Un document Grist servi en HTTPS **refuse** une iframe en `http://localhost`.
 * La specification Mixed Content classe pourtant `localhost` parmi les origines
 * « potentiellement sures » ; en pratique, l'essai en Grist reel a ete refuse
 * (25/08/2026), et le widget de test est configure sur `https://localhost:8443`.
 * Ce fichier affirmait l'inverse : la remarque est corrigee ici plutot que
 * laissee a re-decouvrir.
 *
 * ## Usage
 *
 *     node scripts/serve-dev.js [--root projects] [--port 3001]
 *     node scripts/serve-dev.js --root . --https --port 8443
 *
 * Le certificat auto-signe se fabrique une fois, dans `.dev-tls/` (gitignore) :
 *
 *     openssl req -x509 -newkey rsa:2048 -nodes -days 365  *       -keyout .dev-tls/localhost-key.pem -out .dev-tls/localhost-cert.pem  *       -subj "//CN=localhost"  *       -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
 *
 * Un certificat auto-signe dans une iframe echoue **en silence** : le navigateur
 * ne propose pas d'exception depuis un cadre. Il faut ouvrir une fois
 * `https://localhost:8443/` dans un onglet et accepter l'avertissement ; le
 * widget se charge ensuite normalement.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

function arg(name, def) {
    const i = process.argv.indexOf('--' + name);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function drapeau(nom) { return process.argv.includes('--' + nom); }

const ROOT = path.resolve(__dirname, '..', arg('root', 'projects'));
const TLS = drapeau('https');
const PORT = parseInt(arg('port', TLS ? '8443' : '3001'), 10);
const DOSSIER_TLS = path.resolve(__dirname, '..', '.dev-tls');

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
};

function send(res, code, body, headers) {
    res.writeHead(code, Object.assign({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Cache-Control': 'no-store'
    }, headers || {}));
    res.end(body);
}

function optionsTls() {
    const cle = path.join(DOSSIER_TLS, 'localhost-key.pem');
    const cert = path.join(DOSSIER_TLS, 'localhost-cert.pem');
    if (!fs.existsSync(cle) || !fs.existsSync(cert)) {
        console.error("Certificat absent dans .dev-tls/");
        console.error("  la commande openssl est dans l'en-tete de ce fichier");
        process.exit(1);
    }
    return { key: fs.readFileSync(cle), cert: fs.readFileSync(cert) };
}

const servir = (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, '');

    let urlPath;
    try { urlPath = decodeURIComponent(req.url.split('?')[0]); } catch (e) { return send(res, 400, 'Bad URL'); }

    // Resolution securisee (empeche de sortir de ROOT via ../).
    const target = path.normalize(path.join(ROOT, urlPath));
    if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');

    fs.stat(target, (err, stat) => {
        if (err) return send(res, 404, 'Not found: ' + urlPath);
        const file = stat.isDirectory() ? path.join(target, 'index.html') : target;
        fs.readFile(file, (e, data) => {
            if (e) return send(res, 404, 'Not found: ' + urlPath);
            send(res, 200, data, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        });
    });
};

const server = TLS ? https.createServer(optionsTls(), servir) : http.createServer(servir);

server.listen(PORT, () => {
    const schema = TLS ? 'https' : 'http';
    console.log('Serveur de dev' + (TLS ? ' (TLS auto-signe)' : ''));
    console.log('  racine : ' + ROOT);
    console.log('  url    : ' + schema + '://localhost:' + PORT + '/');
    if (TLS) {
        console.log("  ! ouvrir cette url dans un onglet et accepter l'avertissement,");
        console.log("    sinon l'iframe Grist echouera sans message.");
    }
});
