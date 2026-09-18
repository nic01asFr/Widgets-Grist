/**
 * Rassemble Atlas et ses dependances pour l'application installee.
 *
 * Dans un widget, MapLibre, three.js et SunCalc viennent de CDN : la page est
 * servie en ligne, le reseau est la. Une application de terrain doit demarrer
 * sans reseau — ces fichiers sont donc telecharges une fois et embarques, et
 * le HTML est reecrit pour les viser localement.
 *
 * Rien n'est modifie dans `projects/Atlas/` : la source reste la meme pour les
 * trois cibles (widget, navigateur, application).
 */
import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, '..', '..', '..');
const src = join(racine, 'projects', 'Atlas');
const out = join(ici, '..', 'www');

/** Chaque dependance CDN, et ou elle atterrit dans le paquet. */
const VENDOR = [
  ['https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js',  'vendor/maplibre-gl.js'],
  ['https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css', 'vendor/maplibre-gl.css'],
  ['https://unpkg.com/suncalc@1.8.0/suncalc.js',               'vendor/suncalc.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', 'vendor/three.module.js'],
];

/**
 * three.js charge ses extensions par le chemin `three/addons/`. La carte
 * d'import doit donc pointer le dossier local, sinon GLTFLoader repartirait
 * chercher le CDN au premier modele — et echouerait hors reseau.
 */
const ADDONS = ['loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js'];

/**
 * Le moteur de formulaire, embarque comme dans la version publiee.
 *
 * La page le charge depuis `../grist_forms/`, un chemin qui n'existe que sur le
 * serveur de developpement : absent du paquet, il tombe en 404 et la fiche
 * d'un objet retombe sur les champs devines, sans que rien ne le dise. C'est
 * pourtant dans l'application que la saisie de terrain a le plus de sens —
 * c'est la seule ou une photo peut etre versee, le client HTTP y etant natif.
 *
 * Meme liste NOMMEE que `scripts/promote-atlas.js`, et pour la meme raison : ce
 * qui entre dans un paquet livre se lit, il ne se deduit pas d'un `readdir`.
 */
const FORMULAIRES = [
  'shared/types.js',
  'shared/attachments.js',
  'shared/session-context.js',
  'shared/formulaires-table.js',
  'shared/formdef-from-table.js',
  'runtime/engine.js',
];

/**
 * Quelle version est dans le paquet.
 *
 * Sans cela, rien a l'ecran ne distingue deux APK : on croit avoir mis a jour,
 * on teste l'ancienne, et on cherche un defaut deja corrige. C'est arrive.
 * Le commit et sa date suffisent — c'est un repere, pas un numero de version
 * publique.
 */
export function versionPaquet(cwd = ici) {
  try {
    const git = (...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
    return { commit: git('rev-parse', '--short', 'HEAD'), date: git('log', '-1', '--format=%cs') };
  } catch (_) {
    return { commit: 'source', date: '' };   // hors depot : le paquet reste valable
  }
}

async function telecharger(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} — HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return buf.length;
}

async function main() {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  // 1. Atlas lui-meme
  await cp(join(src, 'lib'), join(out, 'lib'), { recursive: true });
  await cp(join(src, 'app_v7.js'), join(out, 'app_v7.js'));
  const modeles = join(racine, 'published', 'atlas', 'models');
  if (existsSync(modeles)) await cp(modeles, join(out, 'models'), { recursive: true });

  // 2. Le moteur de formulaire — sans lui, pas de fiche, donc pas de releve
  for (const rel of FORMULAIRES) {
    const depuis = join(racine, 'projects', 'grist_forms', rel);
    if (!existsSync(depuis)) {
      throw new Error(`${rel} introuvable dans projects/grist_forms`);
    }
    const vers = join(out, 'vendor', 'grist_forms', rel);
    await mkdir(dirname(vers), { recursive: true });
    await cp(depuis, vers);
  }

  // 3. Les dependances
  let total = 0;
  for (const [url, rel] of VENDOR) {
    total += await telecharger(url, join(out, rel));
    console.log('  ' + rel);
  }
  for (const a of ADDONS) {
    total += await telecharger(
      `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/${a}`,
      join(out, 'vendor/three-addons', a));
    console.log('  vendor/three-addons/' + a);
  }

  // 4. Le HTML, reecrit pour viser le local
  let html = await readFile(join(src, 'index_v7.html'), 'utf8');
  html = html
    .replace(/\.\.\/grist_forms\//g, './vendor/grist_forms/')
    .replace(/https:\/\/unpkg\.com\/maplibre-gl@[\d.]+\/dist\/maplibre-gl\.js/g, './vendor/maplibre-gl.js')
    .replace(/https:\/\/unpkg\.com\/maplibre-gl@[\d.]+\/dist\/maplibre-gl\.css/g, './vendor/maplibre-gl.css')
    .replace(/https:\/\/unpkg\.com\/suncalc@[\d.]+\/suncalc\.js/g, './vendor/suncalc.js')
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/three@[\d.]+\/build\/three\.module\.js/g, './vendor/three.module.js')
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/three@[\d.]+\/examples\/jsm\//g, './vendor/three-addons/');

  // Le script du plugin Grist n'a aucun sens dans l'application, et sa presence
  // brouillait justement la detection de mode : on le retire du paquet.
  html = html.replace(/\s*<script[^>]*grist-plugin-api\.js[^>]*><\/script>/g, '');

  // Le catalogue 3D est embarque : viser le dossier local plutot que le CDN.
  html = html.replace(/<\/head>/,
    '    <script>window.__ATLAS_MODELES__ = "./models/";</script>\n</head>');

  // La version voyage avec le paquet, et s'affiche dans le menu : c'est le seul
  // moyen de savoir, telephone en main, laquelle on est en train de tester.
  const v = versionPaquet();
  html = html.replace(/<\/head>/,
    `    <meta name="atlas-version" content="${v.commit}${v.date ? ' · ' + v.date : ''}">\n</head>`);

  await writeFile(join(out, 'index.html'), html);
  await writeFile(join(ici, '..', 'www', 'version.json'), JSON.stringify(v) + '\n');

  console.log(`\nwww/ pret — ${(total / 1048576).toFixed(1)} Mo de dependances, version ${v.commit}`);
}

main().catch((e) => { console.error('Vendorisation :', e.message); process.exit(1); });
