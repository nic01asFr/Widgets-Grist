/**
 * generate-manifest.js
 *
 * Génère le manifest.json pour le catalogue de widgets Grist
 * en scannant les package.json dans published/
 *
 * Usage: node scripts/generate-manifest.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Compte et depot proprietaires des URLs publiees.
 *
 * La CI les fournit (`github.repository_owner`). En local, personne ne les
 * exporte : le repli historique `VOTRE_USER` produisait alors un manifest ou
 * les quinze widgets pointaient vers un compte inexistant — un fichier
 * parfaitement valide, donc silencieux, qu'un `npm run manifest` de routine
 * suffisait a commiter. On deduit donc le compte du remote git, et on refuse
 * d'ecrire plutot que d'inventer une URL.
 */
function origineGit() {
  try {
    const url = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
    }).trim();
    // git@github.com:owner/repo.git | https://github.com/owner/repo.git
    const m = url.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
    return m ? { user: m[1], repo: m[2] } : null;
  } catch {
    return null;
  }
}

/**
 * Quand ce widget a-t-il bouge ?
 *
 * > **Pas « maintenant ».** Le manifeste posait `new Date()` sur les quinze
 * > widgets a chaque generation : republier l'un faisait bouger la date de tous
 * > les autres, et le diff d'une publication touchait des widgets auxquels
 * > personne n'avait touche. Au push, chacun se mettait a impacter les voisins.
 *
 * La verite est dans l'historique : la date du dernier commit qui touche le
 * dossier du widget. Elle est stable, elle ne change que quand le widget
 * change, et deux generations successives sans modification donnent le meme
 * fichier.
 *
 * Trois replis, du plus vrai au moins faux : l'historique, la date deja
 * inscrite au manifeste (un checkout superficiel de CI n'a pas les dates —
 * `fetch-depth: 0` les ramene), et enfin maintenant.
 */
const datesConnues = (function () {
    try {
        const ancien = JSON.parse(fs.readFileSync(
            path.join(__dirname, '..', 'published', 'manifest.json'), 'utf8'));
        const m = {};
        (Array.isArray(ancien) ? ancien : []).forEach(function (w) {
            if (w && w.widgetId && w.lastUpdatedAt) m[w.widgetId] = w.lastUpdatedAt;
        });
        return m;
    } catch (_) { return {}; }
}());

const dateParDossier = {};
function dateDuWidget(dossier, widgetId) {
    if (!(dossier in dateParDossier)) {
        let d = '';
        try {
            d = execFileSync('git', ['log', '-1', '--format=%cI', '--', 'published/' + dossier],
                { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
        } catch (_) { d = ''; }
        dateParDossier[dossier] = d;
    }
    return dateParDossier[dossier] || datesConnues[widgetId] || new Date().toISOString();
}

const origine = origineGit();
const GITHUB_USER = process.env.GITHUB_USER || origine?.user;
const REPO_NAME = process.env.REPO_NAME || origine?.repo || 'Widgets-Grist';
if (!GITHUB_USER) {
  console.error('Compte GitHub introuvable : ni GITHUB_USER, ni remote git.');
  console.error('Relancez avec GITHUB_USER=<compte> node scripts/generate-manifest.js');
  process.exit(1);
}
const BASE_URL = `https://${GITHUB_USER}.github.io/${REPO_NAME}`;
const PUBLISHED_DIR = path.join(__dirname, '..', 'published');
const OUTPUT_FILE = path.join(PUBLISHED_DIR, 'manifest.json');

console.log('Generating Grist widget manifest...');
console.log(`Base URL: ${BASE_URL}`);
console.log(`Scanning: ${PUBLISHED_DIR}`);

const widgets = [];
// Les dossiers qui se voulaient des widgets et n'y arrivent pas.
const ignores = [];

// Vérifier que le dossier published existe
if (!fs.existsSync(PUBLISHED_DIR)) {
    console.log('Creating published/ directory...');
    fs.mkdirSync(PUBLISHED_DIR, { recursive: true });
}

// Scanner les sous-dossiers de published/
const entries = fs.readdirSync(PUBLISHED_DIR, { withFileTypes: true });

for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const widgetDir = path.join(PUBLISHED_DIR, entry.name);
    const packagePath = path.join(widgetDir, 'package.json');

    // Un dossier sans package.json n'est pas un widget rate : c'est `w/` et ses
    // pages de vitrine, `models/` et ses fichiers. Rien a signaler.
    if (!fs.existsSync(packagePath)) {
        continue;
    }

    try {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

        // Celui-la, en revanche, se voulait un widget : quelqu'un a ecrit son
        // package.json. Sans section `grist` il ne sera jamais catalogue, donc
        // jamais visible dans le selecteur — et l'ancien message, un
        // `console.log` parmi vingt autres, ne prevenait personne. Deux widgets
        // prepares dans un depot voisin sont arrives ici dans cet etat.
        if (!pkg.grist) {
            ignores.push(entry.name);
            continue;
        }

        // Ce qui n'est pas destiné au public doit le dire, plutôt que de
        // dépendre d'une URL vide qu'une régénération corrigera sans le savoir :
        // c'est ainsi qu'un outil de finances personnelles s'est retrouvé au
        // catalogue, en régénérant le manifeste pour un autre widget.
        if (pkg.prive === true) {
            console.log(`  Ignoré ${entry.name}/ (paquet privé)`);
            continue;
        }

        // Supporter à la fois un objet unique ou un tableau de widgets
        const gristConfigs = Array.isArray(pkg.grist) ? pkg.grist : [pkg.grist];

        for (const config of gristConfigs) {
            if (config.prive === true) continue;   // un widget privé dans un paquet publié
            // Construire l'URL complète
            // Si config.url est relative (pas http), la préfixer avec BASE_URL/entry.name/
            let widgetUrl;
            if (config.url && config.url.startsWith('http')) {
                widgetUrl = config.url;
            } else if (config.url) {
                widgetUrl = `${BASE_URL}/${entry.name}/${config.url}`;
            } else {
                widgetUrl = `${BASE_URL}/${entry.name}/`;
            }

            const widget = {
                widgetId: config.widgetId || pkg.name,
                name: config.name || pkg.name,
                url: widgetUrl,
                published: true,
                accessLevel: config.accessLevel || 'none',
                renderAfterReady: config.renderAfterReady !== false,
                description: config.description || pkg.description || '',
                lastUpdatedAt: dateDuWidget(entry.name, config.widgetId || pkg.name),
                ...(config.authors && { authors: config.authors }),
                ...(pkg.authors && !config.authors && { authors: pkg.authors }),
            };

            widgets.push(widget);
            console.log(`  + ${widget.name} (${widget.widgetId})`);
        }
    } catch (err) {
        // Un package.json illisible faisait disparaître son widget du manifest
        // sans que rien ne s'y oppose : le catalogue partait amputé en
        // production, et les utilisateurs perdaient le widget de leur sélecteur.
        // C'est arrivé — des marqueurs de conflit laissés dans
        // published/qgis2grist/package.json ont retiré deux widgets du
        // manifest. Mieux vaut ne pas générer de catalogue qu'en générer un faux.
        console.error(`\nÉchec : ${entry.name}/package.json illisible — ${err.message}`);
        console.error('Le manifest n\'a pas été régénéré (il serait amputé de ce widget).');
        process.exit(1);
    }
}

// Écrire le manifest
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(widgets, null, 2));
console.log(`\nGenerated ${OUTPUT_FILE}`);
console.log(`Total widgets: ${widgets.length}`);

// Afficher l'URL du manifest pour Grist
console.log(`\nPour configurer Grist, utilisez:`);
console.log(`GRIST_WIDGET_LIST_URL=${BASE_URL}/manifest.json`);

// En dernier, et sur stderr : c'est ce qu'on doit encore lire quand le reste a
// defile. Le manifeste n'est pas faux — il est incomplet, et personne ne s'en
// apercevrait avant de chercher le widget dans le selecteur, en vain.
if (ignores.length) {
    console.error(`\n  Attention — ${ignores.length} dossier(s) absent(s) du catalogue :`);
    for (const nom of ignores) {
        console.error(`    published/${nom}/  a un package.json, mais pas de section "grist"`);
    }
    console.error('\n  Ces widgets ne seront pas proposés dans Grist. Il leur faut :');
    console.error('    "grist": { "widgetId": "...", "name": "...", "accessLevel": "full" }');
    console.error('  `url` est facultatif : il est déduit du nom du dossier.');
    console.error('  Si le dossier n\'est pas un widget, ajoutez "prive": true pour le dire.');
}
