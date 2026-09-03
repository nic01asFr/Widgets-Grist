/**
 * Promotion Atlas : projects/Atlas -> published/atlas
 *
 * index_v7.html -> index.html, app_v7.js -> app.js, et TOUS les modules lib/.
 * Oublier un module ne casse rien au build mais fait tomber la page publiee en
 * 404 au premier import : d'ou le controle final.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'projects', 'Atlas');
const pub = path.join(root, 'published', 'atlas');

/**
 * La version vient du package.json publie, elle n'est pas figee ici : ecrite en
 * dur, elle restait a 1.0.0 d'une publication a l'autre et le `?v=` ne changeait
 * jamais — les navigateurs servaient l'ancien app.js apres chaque deploiement.
 * Publier une correction impose donc de monter la version.
 */
const VERSION = JSON.parse(fs.readFileSync(path.join(pub, 'package.json'), 'utf8')).version;
/** Les query strings de cache de dev (?v=2026...) deviennent la version publiee. */
const normaliserVersions = (code) => code.replace(/\?v=2026[0-9a-z]+/g, `?v=${VERSION}`);

let html = fs.readFileSync(path.join(src, 'index_v7.html'), 'utf8');
html = html.replace(
  '<title>Atlas v7 — Maquette 3D Territoriale</title>',
  '<title>Atlas — Maquette 3D Territoriale</title>'
);
html = html.replace(/\.\/app_v7\.js\?v=[^"]+/, `./app.js?v=${VERSION}`);
fs.writeFileSync(path.join(pub, 'index.html'), html);

fs.writeFileSync(
  path.join(pub, 'app.js'),
  normaliserVersions(fs.readFileSync(path.join(src, 'app_v7.js'), 'utf8'))
);

const libSrc = path.join(src, 'lib');
const libPub = path.join(pub, 'lib');
fs.mkdirSync(libPub, { recursive: true });
let modules = 0;
for (const f of fs.readdirSync(libSrc)) {
  if (!f.endsWith('.js')) continue;
  fs.writeFileSync(path.join(libPub, f), normaliserVersions(fs.readFileSync(path.join(libSrc, f), 'utf8')));
  modules++;
}

/**
 * Les scenes de demonstration.
 *
 * Elles doivent vivre sous `published/` pour etre servies par GitHub Pages : la
 * page de presentation les ouvre dans une iframe, et `projects/` n'est pas
 * deploye. Seuls les fichiers que la scene sert sont copies — les scripts
 * d'extraction et les archives de travail restent en developpement.
 *
 * Une demo ignoree par git (licence non etablie) ne doit pas remonter ici par
 * la copie : `existsSync` ne suffirait pas, elle est bien sur le disque. On
 * copie donc une liste NOMMEE, pas le contenu d'un dossier.
 */
const DEMOS = ['cascade-aygalades-marseille', 'osm-marseille-vieux-port'];
const SERVIS = /\.(json|geojson|glb)$/;
const demSrc = path.join(src, 'demos');
const demPub = path.join(pub, 'demos');
let fichiersDemo = 0;
for (const d of DEMOS) {
  const from = path.join(demSrc, d);
  if (!fs.existsSync(from)) {
    console.error(`Echec : demo « ${d} » introuvable dans projects/Atlas/demos`);
    process.exit(1);
  }
  const to = path.join(demPub, d);
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    // `_bbox.json` et les archives de travail ne sont pas servis a la page.
    if (!SERVIS.test(f) || f.startsWith('_')) continue;
    fs.copyFileSync(path.join(from, f), path.join(to, f));
    fichiersDemo++;
  }
  // La scene doit rester lisible apres copie : une demo muette en ligne est
  // pire qu'une demo absente, car la page la propose quand meme.
  const scene = path.join(to, 'scene.json');
  if (!fs.existsSync(scene)) {
    console.error(`Echec : « ${d} » n'a pas de scene.json`);
    process.exit(1);
  }
  const m = JSON.parse(fs.readFileSync(scene, 'utf8'));
  for (const l of m.layers || []) {
    if (typeof l.geojson === 'string' && l.geojson.startsWith('./')
        && !fs.existsSync(path.join(to, l.geojson.slice(2)))) {
      console.error(`Echec : « ${d} » reclame ${l.geojson}, absent de la copie publiee`);
      process.exit(1);
    }
    const glb = l.style?.custom?.url || l.gltf_url;
    if (typeof glb === 'string' && glb.startsWith('./')
        && !fs.existsSync(path.join(to, glb.slice(2)))) {
      console.error(`Echec : « ${d} » reclame ${glb}, absent de la copie publiee`);
      process.exit(1);
    }
  }
}

// Controle : tout module importe doit exister dans la copie publiee.
const publie = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
const requis = [...new Set([...publie.matchAll(/\.\/lib\/([a-z0-9-]+\.js)/g)].map((m) => m[1]))];
const absents = requis.filter((m) => !fs.existsSync(path.join(libPub, m)));
if (absents.length) {
  console.error('Echec : modules importes mais absents de published/atlas/lib —', absents.join(', '));
  process.exit(1);
}

console.log(`published/atlas pret — ${modules} modules lib/, ${requis.length} importes par app.js, `
  + `${fichiersDemo} fichiers de demo (${DEMOS.length} scenes)`);
