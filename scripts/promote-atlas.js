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
// `../grist_forms/` n'existe que sur le serveur de developpement, ou
// `projects/` est servi. La page publiee lit sa copie embarquee.
html = html.replace(/\.\.\/grist_forms\//g, './vendor/grist_forms/');
html = normaliserVersions(html);

// Dependances externes EMBARQUEES (tools/vendoriser-web.mjs) : si le verrou est la, la page vise vendor/ au lieu des CDN (MapLibre, SunCalc, three.js,
// terra-draw, polices). Sans verrou, la page garde ses CDN comme avant. Une adresse de CDN restante, ou un fichier vise absent, arrete la promotion.
const verrouExterne = path.join(pub, 'vendor', 'verrou-externe.json');
const manifesteExterne = path.join(src, 'vendor-externe.json');
if (fs.existsSync(verrouExterne) && fs.existsSync(manifesteExterne)) {
  const vendorHtml = require(path.join(src, 'tools', 'vendor-web-html.cjs'));
  const manifeste = JSON.parse(fs.readFileSync(manifesteExterne, 'utf8'));
  html = vendorHtml.reecrireHtml(html, manifeste);
  const reste = vendorHtml.resteExterne(html);
  if (reste.length) { console.error('Echec : dependances encore en ligne dans la page : ' + reste.join(', ')); process.exit(1); }
  const manquants = (manifeste.reecritures || []).filter((r) => r.de).map((r) => r.vers.replace(/^\.\//, '')).filter((rel) => !fs.existsSync(path.join(pub, rel)));
  if (manquants.length) { console.error('Echec : fichiers embarques absents de ' + pub + ' : ' + manquants.join(', ')); process.exit(1); }
  console.log('dependances externes embarquees : la page vise vendor/ (' + Object.keys(JSON.parse(fs.readFileSync(verrouExterne, 'utf8')).fichiers).length + ' fichiers verrouilles)');
}
html = html.replace("location.replace('./index_bi.html'", "location.replace('./bi.html'");
fs.writeFileSync(path.join(pub, 'index.html'), html);

// La page maigre du composant BI (index_bi.html -> bi.html) : meme traitement que la page de l'application (versions, dependances embarquees), sans formulaires.
let pageBi = fs.readFileSync(path.join(src, 'index_bi.html'), 'utf8');
pageBi = pageBi.replace('<title>Atlas v7 — Carte</title>', '<title>Atlas — Carte</title>');
pageBi = normaliserVersions(pageBi);
if (fs.existsSync(verrouExterne) && fs.existsSync(manifesteExterne)) {
  const vendorHtml = require(path.join(src, 'tools', 'vendor-web-html.cjs'));
  pageBi = vendorHtml.reecrireHtml(pageBi, JSON.parse(fs.readFileSync(manifesteExterne, 'utf8')));
  const resteBi = vendorHtml.resteExterne(pageBi);
  if (resteBi.length) { console.error('Echec : dependances encore en ligne dans bi.html : ' + resteBi.join(', ')); process.exit(1); }
}
fs.writeFileSync(path.join(pub, 'bi.html'), pageBi);

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
 * Les sous-dossiers de `lib/` qui ne sont ni `bi/` ni importés à plat par `app.js` : `charte/` (le composant BI en importe le schema et la resolution, `../charte/…`) et
 * `reseau/` (le client WFS de la BD TOPO, importe par l'import IGN) et `trafic/` (le moteur de trafic, importe par lib/trafic-couche.js). Invisibles au controle des imports de `app.js` : sans leur copie, les modules qui
 * les importent tombent en 404 une fois publies. Le schema JSON de la charte est son contrat publie : il part avec les modules.
 * Un nouveau sous-dossier s'ajoute ici ; le controle final (`verifierImportsEnSousDossier`) echoue de toute facon si un module de `lib/` en importe un absent.
 */
const SOUS_DOSSIERS_LIB = ['charte', 'reseau', 'trafic'];
let modulesCharte = 0;
for (const nom of SOUS_DOSSIERS_LIB) {
  const dossierSrc = path.join(libSrc, nom);
  const dossierPub = path.join(libPub, nom);
  if (!fs.existsSync(dossierSrc)) continue;
  fs.mkdirSync(dossierPub, { recursive: true });
  for (const f of fs.readdirSync(dossierSrc)) {
    if (f.endsWith('.js')) fs.writeFileSync(path.join(dossierPub, f), normaliserVersions(fs.readFileSync(path.join(dossierSrc, f), 'utf8')));
    else if (f.endsWith('.json')) fs.copyFileSync(path.join(dossierSrc, f), path.join(dossierPub, f));
    else continue;
    modulesCharte++;
  }
  for (const f of fs.readdirSync(dossierPub)) {
    if (!f.endsWith('.js')) continue;
    for (const m of fs.readFileSync(path.join(dossierPub, f), 'utf8').matchAll(/from\s+'(\.{1,2}\/[^']+?\.js)(?:\?[^']*)?'/g)) {
      if (!fs.existsSync(path.join(dossierPub, m[1]))) {
        console.error(`Echec : lib/${nom}/${f} importe ${m[1]}, absent de la copie publiee`);
        process.exit(1);
      }
    }
  }
}

/**
 * Garde-fou : un module de `lib/` (a plat) qui importe un fichier de sous-dossier (`./reseau/x.js`) doit le trouver dans la copie publiee. C'est le piege de
 * `lib/charte/` (1.14.0) : un sous-dossier non copie ne casse rien au build et tombe en 404 en ligne.
 */
function verifierImportsEnSousDossier() {
  for (const f of fs.readdirSync(libPub)) {
    if (!f.endsWith('.js')) continue;
    for (const m of fs.readFileSync(path.join(libPub, f), 'utf8').matchAll(/from\s+'(\.\/[^'/]+\/[^']+?\.js)(?:\?[^']*)?'/g)) {
      if (!fs.existsSync(path.join(libPub, m[1]))) {
        console.error(`Echec : lib/${f} importe ${m[1]}, absent de la copie publiee (sous-dossier non copie ?)`);
        process.exit(1);
      }
    }
  }
}
/**
 * Le composant carte BI (`lib/bi/`, sous-dossier de `lib/`) : charge a la demande avec `?bi=1`, donc invisible au
 * controle des imports de `app.js` ci-dessous — qui ne lit que `./lib/<nom>.js`. Le copier ici, et exiger que chaque
 * module qu'il importe en relatif existe dans la copie.
 */
const biSrc = path.join(libSrc, 'bi');
const biPub = path.join(libPub, 'bi');
let modulesBi = 0;
if (fs.existsSync(biSrc)) {
  fs.mkdirSync(biPub, { recursive: true });
  for (const f of fs.readdirSync(biSrc)) {
    if (!f.endsWith('.js')) continue;
    fs.writeFileSync(path.join(biPub, f), normaliserVersions(fs.readFileSync(path.join(biSrc, f), 'utf8')));
    modulesBi++;
  }
  // Modules d'interface optionnels (legende, curseur de temps : `lib/bi/ui/`), charges a la demande par `import()` depuis le runtime.
  const uiSrc = path.join(biSrc, 'ui'), uiPub = path.join(biPub, 'ui');
  if (fs.existsSync(uiSrc)) {
    fs.mkdirSync(uiPub, { recursive: true });
    for (const f of fs.readdirSync(uiSrc)) {
      if (!f.endsWith('.js')) continue;
      fs.writeFileSync(path.join(uiPub, f), normaliserVersions(fs.readFileSync(path.join(uiSrc, f), 'utf8')));
      modulesBi++;
    }
  }
  // Jeux embarques (contours administratifs de repli hors ligne, references de population) : servis tels quels.
  const donSrc = path.join(biSrc, 'donnees'), donPub = path.join(biPub, 'donnees');
  if (fs.existsSync(donSrc)) {
    fs.mkdirSync(donPub, { recursive: true });
    for (const f of fs.readdirSync(donSrc)) {
      if (f.endsWith('.json')) { fs.copyFileSync(path.join(donSrc, f), path.join(donPub, f)); modulesBi++; }
    }
  }
  for (const f of fs.readdirSync(biPub)) {
    if (!f.endsWith('.js')) continue;      // `donnees/` est un dossier : on ne lit que les modules
    for (const m of fs.readFileSync(path.join(biPub, f), 'utf8').matchAll(/from\s+'(\.{1,2}\/[^']+?\.js)(?:\?[^']*)?'/g)) {
      if (!fs.existsSync(path.join(biPub, m[1]))) {
        console.error(`Echec : lib/bi/${f} importe ${m[1]}, absent de la copie publiee`);
        process.exit(1);
      }
    }
  }
}

// Tous les sous-dossiers de lib/ (bi, charte, reseau) sont en place : un module a plat qui en importe un fichier absent arrete la promotion.
verifierImportsEnSousDossier();

/**
 * La peau du formulaire, qui n'est pas un module.
 *
 * La boucle ci-dessus ne copie que les `.js` : `formulaire-atlas.css` y serait
 * reste. Sans elle, le moteur emet ses 33 classes `fr-*` et rien ne les
 * habille — un formulaire nu au milieu d'un panneau soigne.
 */
for (const f of fs.readdirSync(libSrc)) {
  if (f.endsWith('.css')) fs.copyFileSync(path.join(libSrc, f), path.join(libPub, f));
}

/**
 * Le moteur de formulaire, embarque.
 *
 * La page charge sept scripts de `../grist_forms/` — un chemin qui n'existe que
 * sur le serveur de developpement. Publies tels quels, ils tombent en 404 : la
 * fiche d'entite retombe silencieusement sur les champs devines, et personne ne
 * voit pourquoi.
 *
 * La liste est NOMMEE, pas un `readdir` : ce qui entre dans une page publiee
 * doit se lire, pas se deduire.
 */
const VENDOR = [
  'shared/types.js',
  'shared/attachments.js',
  'shared/session-context.js',
  'shared/formulaires-table.js',
  'shared/formdef-from-table.js',
  'shared/formdef-from-grist-form.js',
  'runtime/engine.js',
];
const formsSrc = path.join(root, 'projects', 'grist_forms');
const vendorPub = path.join(pub, 'vendor', 'grist_forms');
/**
 * Le moteur embarque est FIGE a la version publiee (1.13.1) : la promotion d'Atlas ne le reecrit pas. Sans cette regle, chaque promotion
 * recopiait la version de developpement de `projects/grist_forms` (en avance, non validee avec Atlas), et il fallait la defaire a la main
 * (`git checkout -- published/atlas/vendor/grist_forms`). Pour le mettre a jour, volontairement : `node scripts/promote-atlas.js --maj-moteur-formulaires`.
 */
const MAJ_MOTEUR = process.argv.includes('--maj-moteur-formulaires');
let moteurGarde = 0;
for (const rel of VENDOR) {
  const from = path.join(formsSrc, rel);
  const to = path.join(vendorPub, rel);
  if (!MAJ_MOTEUR && fs.existsSync(to)) { moteurGarde++; continue; }
  if (!fs.existsSync(from)) {
    console.error(`Echec : ${rel} introuvable dans projects/grist_forms`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
if (moteurGarde) console.log(`moteur de formulaires : ${moteurGarde} fichier(s) laisse(s) tel(s) quel(s) (fige ; --maj-moteur-formulaires pour le mettre a jour)`);

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
// La démonstration de la vitrine, `palais-longchamp`, n'est pas copiée d'ici : elle est fabriquée directement sous
// `published/atlas/demos/` par `projects/Atlas/vitrine-longchamp/fabriquer-scene.py`. Celle des Aygalades n'est plus publiée
// (ses sources ont quitté l'arbre du dépôt le 17/10/2026 ; elles restent dans l'historique git).
const DEMOS = ['osm-marseille-vieux-port'];
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

/**
 * Les pages hotes de demonstration : `demos/hote-bi/` (la carte BI) et `demos/hote-canevas/` (le canevas, profil complet), leurs pages HTML et
 * rien d'autre. Elles importent `../../lib/bi/...` et ouvrent `../../index.html` : relatifs a `published/atlas/demos/<hote>/`.
 */
let fichiersHote = 0;
for (const nomHote of ['hote-bi', 'hote-canevas']) {
  const hoteSrc = path.join(src, 'demos', nomHote);
  const hotePub = path.join(pub, 'demos', nomHote);
  if (!fs.existsSync(hoteSrc)) continue;
  fs.mkdirSync(hotePub, { recursive: true });
  for (const f of fs.readdirSync(hoteSrc)) {
    if (!f.endsWith('.html')) continue;
    fs.copyFileSync(path.join(hoteSrc, f), path.join(hotePub, f));
    fichiersHote++;
  }
}

/**
 * Le catalogue d'objets livre avec Atlas (`objets/`) : Atlas le charge quand
 * aucun autre n'est pointe (`choisirCatalogue`). Seuls `catalog.json` et les
 * fichiers qu'il declare sont copies — et chacun doit exister : un luminaire
 * declare mais absent retombe sur le modele de test sans rien dire.
 */
const objSrc = path.join(src, 'objets');
const objPub = path.join(pub, 'objets');
const catObjets = JSON.parse(fs.readFileSync(path.join(objSrc, 'catalog.json'), 'utf8'));
fs.rmSync(objPub, { recursive: true, force: true });
fs.mkdirSync(objPub, { recursive: true });
fs.copyFileSync(path.join(objSrc, 'catalog.json'), path.join(objPub, 'catalog.json'));
let fichiersObjets = 0;
for (const a of catObjets.parametric?.assets || []) {
  for (const f of Object.values(a.files || {})) {
    const from = path.join(objSrc, f);
    if (!fs.existsSync(from)) {
      console.error(`Echec : le catalogue d'objets declare ${f}, absent de projects/Atlas/objets`);
      process.exit(1);
    }
    fs.mkdirSync(path.dirname(path.join(objPub, f)), { recursive: true });
    fs.copyFileSync(from, path.join(objPub, f));
    fichiersObjets++;
  }
}

/**
 * Controle : tout ce que la page reclame en relatif doit exister dans la copie.
 *
 * Le controle des modules `lib/` existait deja ; il ne voyait ni les `<script
 * src>` ni les feuilles de style. Six scripts pointaient hors du dossier publie
 * sans que rien ne le signale — et un 404 de script ne casse pas la page : elle
 * s'affiche, amputee, et le defaut se decouvre chez l'utilisateur.
 */
const pageHtml = fs.readFileSync(path.join(pub, 'index.html'), 'utf8') + fs.readFileSync(path.join(pub, 'bi.html'), 'utf8');
const reclames = [...pageHtml.matchAll(/(?:src|href)="(\.[^"]+)"/g)]
  .map((m) => m[1].split('?')[0])
  .filter((u) => !u.startsWith('./demos/'));
const absentsPage = reclames.filter((u) => !fs.existsSync(path.join(pub, u)));
if (absentsPage.length) {
  console.error('Echec : la page publiee reclame des fichiers absents —', absentsPage.join(', '));
  process.exit(1);
}

// Controle : tout module importe doit exister dans la copie publiee.
const publie = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
const requis = [...new Set([...publie.matchAll(/\.\/lib\/([a-z0-9-]+\.js)/g)].map((m) => m[1]))];
const absents = requis.filter((m) => !fs.existsSync(path.join(libPub, m)));
if (absents.length) {
  console.error('Echec : modules importes mais absents de published/atlas/lib —', absents.join(', '));
  process.exit(1);
}

console.log(`published/atlas pret — ${modules} modules lib/ (+ ${modulesBi} fichiers lib/bi, ${modulesCharte} lib/charte), ${requis.length} importes par app.js, `
  + `${VENDOR.length} scripts embarques, ${reclames.length} ressources de page verifiees, `
  + `${fichiersDemo} fichiers de demo (${DEMOS.length} scenes, ${fichiersHote} pages hote BI), `
  + `${fichiersObjets} modeles au catalogue d'objets`);
