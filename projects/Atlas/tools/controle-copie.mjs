#!/usr/bin/env node
// Contrôle d'une COPIE du paquet web d'Atlas (profil « carte seule » ou complet) : le dossier qu'un hôte a recopié chez lui est-il intact, complet, et
// démarre-t-il sous la politique de sécurité de contenu recommandée ?
//
//   node controle-copie.mjs <dossier>                        contrôles sur les fichiers (sans navigateur)
//   node controle-copie.mjs <dossier> --navigateur           + démarre un navigateur sans fenêtre (Chrome ou Edge) et rejoue un scénario complet
//   node controle-copie.mjs <dossier> --serveur [--port N]   + sert la copie et une page de contrôle, à ouvrir soi-même dans un navigateur
//   options : --chrome <chemin>  --delai <secondes, 90>  --json  --sans-csp
//
// Fichier AUTONOME : aucun module à installer, aucune importation du dépôt ; il accompagne le paquet « carte seule » pour qu'un hôte puisse le lancer dans sa copie.
// Code de sortie : 0 si tout est conforme, 1 s'il y a au moins un ÉCHEC (un AVERTISSEMENT ne fait pas échouer).
//
// Contrôles sur les fichiers : PAQUET.json lisible ; empreinte SHA-256 et taille de chaque fichier ; fichiers non listés (avertissement) ; empreinte SHA-384 du client des
// hôtes ; licence présente ; aucune adresse de CDN dans bi.html ; toutes les références relatives de bi.html et de l'élément <atlas-bi> existent ; CSP.txt couvre les blocs en
// ligne de bi.html ; PRECACHE.json ne liste que des fichiers présents.
// Scénario du navigateur : bi.html chargée dans une iframe, politique de CSP.txt posée en en-tête avec un point de collecte des violations ; connexion, ping, scène de points
// étiquetés avec légende et curseur de temps, couche administrative embarquée, lecture des géométries, caméra, temps. Aucune violation, aucun fichier manquant.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const sha = (algo, octets, base64 = false) => crypto.createHash(algo).update(octets).digest(base64 ? 'base64' : 'hex');
const CDN = /https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)[^"'\s)<>]*/g;
const REFERENCE_HTML = /(?:src|href)="(\.{1,2}\/[^"#]+)"/g;
const REFERENCE_JS = /(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;

function lister(dossier, base = dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dossier, e.name);
    return e.isDirectory() ? lister(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  }).sort();
}

/** Les références relatives atteintes depuis `entrees` ; `absents` : ce qu'elles réclament et qui manque (une page absente d'un fichier réclamé est cassée). */
export function fermeture(dossier, entrees) {
  const vus = new Set(), absents = new Set(), pile = [...entrees];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f)) continue;
    if (!fs.existsSync(path.join(dossier, f))) continue;
    vus.add(f);
    const motifs = f.endsWith('.html') ? [REFERENCE_HTML, REFERENCE_JS] : f.endsWith('.js') ? [REFERENCE_JS] : [];
    if (!motifs.length) continue;
    const texte = fs.readFileSync(path.join(dossier, f), 'utf8');
    for (const motif of motifs) {
      for (const m of texte.matchAll(motif)) {
        const cible = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1].split('?')[0]));
        if (cible.startsWith('..')) continue;
        if (f.endsWith('.html') && !fs.existsSync(path.join(dossier, cible))) absents.add(f + ' -> ' + cible);
        pile.push(cible);
      }
    }
  }
  return { fichiers: [...vus].sort(), absents: [...absents].sort() };
}

const empreinteCsp = (texte) => "'sha256-" + sha('sha256', Buffer.from(texte, 'utf8'), true) + "'";

/** Les blocs en ligne d'une page (scripts sans src, styles) : leurs empreintes doivent être dans la politique. */
export function blocsEnLigne(html) {
  return {
    scripts: [...String(html).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((t) => t.trim()),
    styles: [...String(html).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).filter((t) => t.trim()),
  };
}

/** La politique d'un CSP.txt (la ligne « Content-Security-Policy: … »), ou null. */
export function politiqueDe(texteCsp) {
  const l = String(texteCsp).split('\n').find((x) => x.startsWith('Content-Security-Policy:'));
  return l ? l.slice('Content-Security-Policy:'.length).trim() : null;
}

const directive = (politique, nom) => (politique.split(';').map((d) => d.trim()).find((d) => d === nom || d.startsWith(nom + ' ')) || '');

/**
 * Les contrôles qui ne demandent pas de navigateur.
 * @returns {{ verdicts: { id: string, niveau: 'ok'|'echec'|'avertissement', texte: string }[], manifeste: object|null }}
 */
export function controlerFichiers(dossier) {
  const verdicts = [];
  const dire = (id, niveau, texte) => verdicts.push({ id, niveau, texte });
  const f = (chemin) => path.join(dossier, chemin);
  let manifeste = null;
  if (!fs.existsSync(f('PAQUET.json'))) { dire('manifeste', 'echec', 'PAQUET.json est absent : ce dossier n\'est pas un paquet web d\'Atlas'); return { verdicts, manifeste }; }
  try { manifeste = JSON.parse(fs.readFileSync(f('PAQUET.json'), 'utf8')); } catch (e) { dire('manifeste', 'echec', 'PAQUET.json illisible : ' + e.message); return { verdicts, manifeste }; }
  dire('manifeste', 'ok', `${manifeste.nom} ${manifeste.version} (profil ${manifeste.profil || 'complet'}), contrat ${manifeste.contrat}, client version ${manifeste.client && manifeste.client.versionClient}`);

  const listes = manifeste.fichiers || [];
  const ecarts = [];
  for (const x of listes) {
    if (!fs.existsSync(f(x.chemin))) { ecarts.push(x.chemin + ' (absent)'); continue; }
    const o = fs.readFileSync(f(x.chemin));
    if (o.length !== x.octets) ecarts.push(x.chemin + ` (${o.length} octets, ${x.octets} attendus)`);
    else if (sha('sha256', o) !== x.sha256) ecarts.push(x.chemin + ' (empreinte différente)');
  }
  dire('empreintes', ecarts.length ? 'echec' : 'ok', ecarts.length ? `${ecarts.length} fichier(s) altéré(s) ou absent(s) : ${ecarts.slice(0, 6).join(' ; ')}${ecarts.length > 6 ? ' …' : ''}` : `${listes.length} fichiers conformes à PAQUET.json (SHA-256 et taille)`);

  const connus = new Set([...listes.map((x) => x.chemin), 'PAQUET.json', 'controle-copie.mjs']);
  const enTrop = lister(dossier).filter((x) => !connus.has(x));
  dire('non-listes', enTrop.length ? 'avertissement' : 'ok', enTrop.length ? `${enTrop.length} fichier(s) absent(s) de PAQUET.json : ${enTrop.slice(0, 5).join(', ')}` : 'aucun fichier hors manifeste');

  if (manifeste.client && fs.existsSync(f(manifeste.client.fichier))) {
    const e = 'sha384-' + sha('sha384', fs.readFileSync(f(manifeste.client.fichier)), true);
    dire('client', e === manifeste.client.empreinte ? 'ok' : 'echec', e === manifeste.client.empreinte ? `client des hôtes conforme (${manifeste.client.empreinte.slice(0, 22)}…)` : `empreinte du client différente : ${e}`);
  } else dire('client', 'echec', 'client des hôtes absent');

  dire('licence', fs.existsSync(f('LICENSE')) ? 'ok' : 'echec', fs.existsSync(f('LICENSE')) ? 'LICENSE présente (MIT)' : 'LICENSE absente : MIT impose que l\'avis accompagne chaque copie');

  if (!fs.existsSync(f('bi.html'))) { dire('page', 'echec', 'bi.html est absente'); return { verdicts, manifeste }; }
  const html = fs.readFileSync(f('bi.html'), 'utf8');
  const cdn = [...new Set(html.match(CDN) || [])];
  dire('cdn', cdn.length ? 'echec' : 'ok', cdn.length ? 'bi.html appelle un CDN : ' + cdn.join(', ') : 'bi.html n\'appelle aucun CDN');
  const entrees = ['bi.html', ...(fs.existsSync(f('lib/bi/atlas-bi-element.js')) ? ['lib/bi/atlas-bi-element.js'] : [])];
  const { fichiers: atteints, absents } = fermeture(dossier, entrees);
  dire('fermeture', absents.length ? 'echec' : 'ok', absents.length ? 'références absentes : ' + absents.join(', ') : `les références relatives de la page et de l'élément aboutissent (${atteints.length} fichiers atteints)`);

  if (fs.existsSync(f('CSP.txt'))) {
    const politique = politiqueDe(fs.readFileSync(f('CSP.txt'), 'utf8'));
    if (!politique) dire('csp', 'echec', 'CSP.txt ne contient pas de ligne Content-Security-Policy');
    else {
      const { scripts, styles } = blocsEnLigne(html);
      const manque = [];
      for (const t of scripts) if (!directive(politique, 'script-src').includes(empreinteCsp(t))) manque.push('script en ligne ' + empreinteCsp(t).slice(0, 20));
      for (const t of styles) if (!directive(politique, 'style-src').includes(empreinteCsp(t)) && !directive(politique, 'style-src').includes("'unsafe-inline'")) manque.push('style en ligne ' + empreinteCsp(t).slice(0, 20));
      const dangereux = /unsafe-eval/.test(politique) || /unsafe-inline/.test(directive(politique, 'script-src'));
      // Une empreinte dans une liste de sources fait IGNORER 'unsafe-inline' par le navigateur : l'association des deux ne protège ni n'autorise ce qu'on croit.
      const ignore = ['script-src', 'style-src'].filter((d) => /'sha(256|384|512)-/.test(directive(politique, d)) && directive(politique, d).includes("'unsafe-inline'"));
      dire('csp', manque.length || dangereux || ignore.length ? 'echec' : 'ok',
        manque.length ? 'CSP.txt ne couvre pas : ' + manque.join(', ')
          : dangereux ? 'CSP.txt ouvre unsafe-eval ou unsafe-inline pour les scripts'
            : ignore.length ? `CSP.txt associe des empreintes et 'unsafe-inline' dans ${ignore.join(' et ')} : le navigateur ignore alors 'unsafe-inline'`
              : `CSP.txt couvre bi.html (${scripts.length} script(s) et ${styles.length} style(s) en ligne)`);
    }
  } else dire('csp', 'avertissement', 'pas de CSP.txt : la politique de sécurité de contenu n\'est pas vérifiée');

  if (fs.existsSync(f('PRECACHE.json'))) {
    try {
      const p = JSON.parse(fs.readFileSync(f('PRECACHE.json'), 'utf8'));
      const absentsP = (p.fichiers || []).filter((x) => !fs.existsSync(f(x)));
      dire('precache', absentsP.length ? 'echec' : 'ok', absentsP.length ? 'PRECACHE.json liste des fichiers absents : ' + absentsP.slice(0, 5).join(', ') : `PRECACHE.json : ${(p.fichiers || []).length} fichiers, tous présents`);
    } catch (e) { dire('precache', 'echec', 'PRECACHE.json illisible : ' + e.message); }
  }
  return { verdicts, manifeste };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Le contrôle dans un navigateur
// ---------------------------------------------------------------------------------------------------------------------------------------------------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };

/** La page de contrôle : charge bi.html de la copie dans une iframe et déroule le scénario avec le client des hôtes de la copie. Elle rend son verdict au serveur. */
const PAGE_CONTROLE = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Contrôle de la copie d'Atlas</title>
<style>body{font:14px system-ui;margin:12px}iframe{width:100%;height:360px;border:1px solid #888}pre{white-space:pre-wrap;font-size:12px}</style></head>
<body><h1>Contrôle de la copie d'Atlas</h1><p id="etat">scénario en cours…</p><iframe id="cadre" sandbox="allow-scripts allow-same-origin"></iframe><pre id="res"></pre>
<script type="module">
import { creerClient, transportFenetre } from '/lib/bi/client-hote.js';
const delaiConnexion = Number(new URLSearchParams(location.search).get('delai') || 60) * 1000;
const composant = new URL('/bi.html', location.origin);
composant.searchParams.append('hote', location.origin);
const cadre = document.getElementById('cadre');
const res = { etapes: [], evenements: [] };
const client = creerClient({ delai: 20000, delaiConnexion, transport: transportFenetre({ fenetre: window, cadre, origineComposant: composant.origin }) });
client.on('error', (c) => res.evenements.push({ type: 'error', charge: c }), { origine: 'tout' });
const sites = Array.from({ length: 30 }, (_, i) => ({ type: 'Feature', id: i + 1, geometry: { type: 'Point', coordinates: [5.2 + (i % 6) * 0.05, 43.3 + Math.floor(i / 6) * 0.04] }, properties: { ref: 'S' + (i + 1), nom: 'Site ' + (i + 1), type: i % 2 ? 'a' : 'b', annee: 2020 + (i % 5) } }));
const manifeste = { title: 'Contrôle', temps: { champ: 'annee', mode: 'cumul', pas: 1, valeur: 2024 }, interface: { legende: { cible: true }, temps: {} },
  layers: [{ id: 'sites', name: 'Sites', geometry_type: 'point', cle: 'ref', visuel: { type: 'cercles', rayon: 6, etiquette: { champ: 'nom' } },
    style: { declarative: { kind: 'categorized', field: 'type', stops: [{ value: 'a', label: 'A', color: '#1f77b4' }, { value: 'b', label: 'B', color: '#d62728' }] } } }] };
const t0 = performance.now();
async function etape(nom, f) {
  const d = performance.now();
  try { const valeur = await f(); res.etapes.push({ nom, ok: true, ms: Math.round(performance.now() - d), valeur }); return true; }
  catch (e) { res.etapes.push({ nom, ok: false, ms: Math.round(performance.now() - d), erreur: String((e && e.code ? e.code + ' : ' : '') + (e && e.message || e)).slice(0, 220) }); return false; }
}
cadre.src = composant.href;
if (await etape('connexion', async () => { const i = await client.connecter(); return { version: i.version, capacites: i.capacites }; })) {
  await etape('ping', async () => { const p = await client.ping(); return { version: p.version, capacites: p.capacites }; });
  await etape('scene', async () => client.setScene(manifeste, { sites }));
  await etape('cadrage', async () => client.fitTo('sites'));
  await etape('legende', async () => (await client.getLegend('sites')).titre);
  await etape('temps', async () => { await client.setTime(2022); return 'ok'; });
  await etape('couche-administrative', async () => { const r = await client.addAdminLayer('departement', { id: 'dep', source: 'embarque', cadrer: false }); return { n: r.n, source: r.source }; });
  await etape('geometries', async () => { const r = await client.getFeatures('sites'); return Array.isArray(r) ? r.length : Object.keys(r || {}).length; });
  await etape('camera', async () => !!(await client.getCamera()));
  await new Promise((r) => setTimeout(r, 2500));
}
res.duree = Math.round(performance.now() - t0);
document.getElementById('res').textContent = JSON.stringify(res, null, 1);
document.getElementById('etat').textContent = res.etapes.every((e) => e.ok) ? 'scénario terminé : toutes les étapes ont réussi' : 'scénario terminé : au moins une étape a échoué';
await fetch('/__resultat', { method: 'POST', body: JSON.stringify(res) });
</script></body></html>
`;

/** Le serveur de contrôle : la copie à la racine, la page de contrôle, la politique de CSP.txt en en-tête de bi.html avec un point de collecte des violations. */
export function creerServeur(dossier, { politique = null, sansCsp = false } = {}) {
  const etat = { violations: [], introuvables: [], resultat: null, attendre: null };
  const pret = new Promise((r) => { etat.attendre = r; });
  const serveur = http.createServer((req, rep) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__resultat' && req.method === 'POST') { let c = ''; req.on('data', (d) => (c += d)); req.on('end', () => { try { etat.resultat = JSON.parse(c); } catch (e) { etat.resultat = { etapes: [], erreur: 'résultat illisible' }; } rep.end('ok'); etat.attendre(etat.resultat); }); return; }
    if (u.pathname === '/__csp' && req.method === 'POST') { let c = ''; req.on('data', (d) => (c += d)); req.on('end', () => { try { const r = JSON.parse(c)['csp-report'] || {}; etat.violations.push({ directive: r['violated-directive'] || r['effective-directive'], bloque: r['blocked-uri'], document: r['document-uri'] }); } catch (e) { etat.violations.push({ directive: 'rapport illisible' }); } rep.statusCode = 204; rep.end(); }); return; }
    if (u.pathname === '/controle.html') { rep.setHeader('content-type', TYPES['.html']); return rep.end(PAGE_CONTROLE); }
    let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if (rel === '') rel = 'bi.html';
    const fichier = path.resolve(dossier, rel);
    if (!fichier.startsWith(path.resolve(dossier)) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) {
      if (!/\.map$/.test(rel) && rel !== 'favicon.ico') etat.introuvables.push(rel);
      rep.statusCode = 404; return rep.end('introuvable');
    }
    rep.setHeader('content-type', TYPES[path.extname(fichier)] || 'application/octet-stream');
    rep.setHeader('cache-control', 'no-store');
    if (rel === 'bi.html' && politique && !sansCsp) rep.setHeader('content-security-policy', politique + '; report-uri /__csp');
    fs.createReadStream(fichier).pipe(rep);
  });
  return { serveur, etat, pret };
}

function trouverNavigateur(demande) {
  const candidats = [demande, process.env.CHROME, process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  return candidats.find((c) => fs.existsSync(c)) || null;
}

/** Rejoue le scénario dans un navigateur. @returns {Promise<{ verdicts: object[], resultat: object|null }>} */
export async function controlerNavigateur(dossier, { port = 0, navigateur = true, chrome = null, delai = 90, sansCsp = false, journal = () => {} } = {}) {
  const verdicts = [];
  const dire = (id, niveau, texte) => verdicts.push({ id, niveau, texte });
  const cspTxt = path.join(dossier, 'CSP.txt');
  const politique = !sansCsp && fs.existsSync(cspTxt) ? politiqueDe(fs.readFileSync(cspTxt, 'utf8')) : null;
  const { serveur, etat, pret } = creerServeur(dossier, { politique, sansCsp });
  await new Promise((r) => serveur.listen(port, '127.0.0.1', r));
  const adresse = 'http://127.0.0.1:' + serveur.address().port + '/controle.html?delai=60';
  let processus = null;
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'controle-atlas-'));
  try {
    if (navigateur) {
      const exe = trouverNavigateur(chrome);
      if (!exe) { dire('navigateur', 'echec', 'aucun Chrome ni Edge trouvé : indiquer --chrome <chemin> ou utiliser --serveur'); return { verdicts, resultat: null }; }
      processus = spawn(exe, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
        '--window-size=1200,900', '--user-data-dir=' + profil, adresse], { stdio: 'ignore' });
      journal('navigateur lancé : ' + exe);
    } else journal('copie servie : ouvrir ' + adresse + ' dans un navigateur (Ctrl+C pour arrêter)');
    const resultat = await Promise.race([pret, new Promise((r) => setTimeout(() => r(null), delai * 1000))]);
    if (!resultat) { dire('scenario', 'echec', `aucun résultat après ${delai} s : la page de contrôle n'a pas terminé (bi.html ne démarre pas ?)`); }
    else {
      for (const e of resultat.etapes || []) dire('etape-' + e.nom, e.ok ? 'ok' : 'echec', e.ok ? `${e.nom} (${e.ms} ms)` : `${e.nom} : ${e.erreur}`);
      const fatales = (resultat.evenements || []).filter((e) => e.type === 'error' && e.charge && e.charge.niveau === 'fatal');
      if (fatales.length) dire('evenement-error', 'echec', 'l\'hôte a reçu un événement error fatal : ' + fatales.map((e) => e.charge.code + ' ' + e.charge.message).join(' ; '));
    }
    await new Promise((r) => setTimeout(r, 500));
    if (politique) dire('csp-violations', etat.violations.length ? 'echec' : 'ok', etat.violations.length ? `${etat.violations.length} violation(s) de la politique de CSP.txt : ${etat.violations.slice(0, 4).map((v) => v.directive + ' ' + v.bloque).join(' ; ')}` : 'aucune violation de la politique de CSP.txt');
    else dire('csp-violations', 'avertissement', 'politique non appliquée (pas de CSP.txt, ou --sans-csp)');
    dire('introuvables', etat.introuvables.length ? 'echec' : 'ok', etat.introuvables.length ? `${etat.introuvables.length} fichier(s) réclamé(s) mais absent(s) : ${[...new Set(etat.introuvables)].slice(0, 5).join(', ')}` : 'aucun fichier réclamé et absent');
    return { verdicts, resultat };
  } finally {
    if (processus) { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(processus.pid), '/T', '/F'], { stdio: 'ignore' }); else processus.kill('SIGKILL'); }
    serveur.closeAllConnections && serveur.closeAllConnections();
    await new Promise((r) => serveur.close(r));
    // Le navigateur garde quelques fichiers ouverts un instant après son arrêt : on réessaie, et on laisse le dossier temporaire plutôt que de faire échouer le contrôle.
    try { fs.rmSync(profil, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 }); } catch (e) { journal('dossier temporaire du navigateur laissé en place : ' + profil); }
  }
}

const MARQUES = { ok: 'OK            ', echec: 'ÉCHEC         ', avertissement: 'AVERTISSEMENT ' };

async function principal(argv) {
  const arg = (nom, defaut = null) => { const i = argv.indexOf(nom); return i >= 0 ? argv[i + 1] : defaut; };
  const dossier = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--port' && argv[argv.indexOf(a) - 1] !== '--chrome' && argv[argv.indexOf(a) - 1] !== '--delai');
  if (!dossier || argv.includes('--aide')) { console.log('usage : node controle-copie.mjs <dossier> [--navigateur | --serveur [--port N]] [--chrome <chemin>] [--delai <s>] [--sans-csp] [--json]'); return dossier ? 0 : 2; }
  const racine = path.resolve(dossier);
  if (!fs.existsSync(racine)) { console.error('dossier introuvable : ' + racine); return 2; }
  const verdicts = [];
  const { verdicts: v1, manifeste } = controlerFichiers(racine);
  verdicts.push(...v1);
  const bavard = !argv.includes('--json');
  if ((argv.includes('--navigateur') || argv.includes('--serveur')) && manifeste && v1.every((v) => v.id !== 'page' || v.niveau !== 'echec')) {
    const r = await controlerNavigateur(racine, { port: Number(arg('--port', 0)), navigateur: argv.includes('--navigateur'), chrome: arg('--chrome'), delai: Number(arg('--delai', 90)), sansCsp: argv.includes('--sans-csp'), journal: (t) => bavard && console.log('· ' + t) });
    verdicts.push(...r.verdicts);
  }
  const echecs = verdicts.filter((v) => v.niveau === 'echec').length, avertissements = verdicts.filter((v) => v.niveau === 'avertissement').length;
  if (argv.includes('--json')) console.log(JSON.stringify({ dossier: racine, conforme: echecs === 0, echecs, avertissements, verdicts }, null, 2));
  else {
    for (const v of verdicts) console.log(MARQUES[v.niveau] + v.texte);
    console.log(`\n${echecs === 0 ? 'Copie conforme' : 'Copie NON conforme'} : ${verdicts.length} contrôles, ${echecs} échec(s), ${avertissements} avertissement(s).`);
  }
  return echecs === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
export { principal };
