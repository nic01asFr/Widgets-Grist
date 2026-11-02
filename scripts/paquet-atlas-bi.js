/**
 * Le profil « carte seule » du paquet web d'Atlas : ce qu'il faut copier pour servir le composant carte BI (`bi.html`) et l'élément `<atlas-bi>` chez soi, sans
 * l'application, sans three.js, sans les modèles 3D. Environ 2 Mo au lieu de 8,5.
 *
 * Les fichiers sont ceux que la page et l'élément atteignent par leurs imports et leurs références relatives (statiques ou à la demande), plus ce que la carte lit à
 * l'exécution par adresse relative sans l'importer (contours de repli, MapLibre) et le client de l'hôte. Le calcul est une analyse du texte des fichiers ; sa
 * justesse est gardée par scripts/paquet-atlas.test.js et par l'outil de contrôle d'une copie (projects/Atlas/tools/controle-copie.mjs), qui rejoue un scénario
 * complet dans un navigateur sur le dossier produit.
 *
 * Module pur côté logique : aucune écriture, aucun réseau.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** Les points de départ : la page maigre du composant (iframe) et l'élément web de l'hôte (page parente). */
const ENTREES = ['bi.html', 'lib/bi/atlas-bi-element.js'];
/** La page seule : ce qu'un service worker précache pour que la carte démarre sans réseau. */
const ENTREES_PAGE = ['bi.html'];
/** Dossiers lus à l'exécution par adresse relative, donc invisibles aux imports : contours de repli, polices de carte (glyphes), MapLibre. */
const DOSSIERS = ['lib/bi/donnees', 'lib/bi/polices', 'vendor/maplibre-gl'];
/** Fichiers ajoutés sans être importés : le client de l'hôte (copié chez lui), le descriptif du paquet, les licences des dépendances. */
const FIXES = ['lib/bi/client-hote.js', 'package.json', 'vendor/LICENCES.txt'];

const REFERENCE_HTML = /(?:src|href)="(\.{1,2}\/[^"#]+)"/g;
const REFERENCE_JS = /(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;

function listerDossier(source, dossier) {
  const racine = path.join(source, dossier);
  if (!fs.existsSync(racine)) return [];
  return fs.readdirSync(racine, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? listerDossier(source, dossier + '/' + e.name) : [dossier + '/' + e.name]))
    .sort();
}

/**
 * Les fichiers atteints depuis `entrees` par les références relatives (src, href, import statique ou à la demande). Les références vers un fichier absent sont
 * ignorées dans le code (un exemple en commentaire n'est pas un import), mais ARRÊTENT le calcul quand elles viennent d'une page : une page qui réclame un
 * fichier absent est un paquet cassé.
 * @returns {{ fichiers: string[], absentsDePage: string[] }}
 */
function fermeture(source, entrees = ENTREES) {
  const vus = new Set(), absentsDePage = new Set(), pile = [...entrees];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f)) continue;
    if (!fs.existsSync(path.join(source, f))) continue;
    vus.add(f);
    // Une page est lue deux fois : ses attributs src et href, et le code de ses scripts en ligne (un `import … from './x.js'` d'un script module posé dans la page).
    const motifs = f.endsWith('.html') ? [REFERENCE_HTML, REFERENCE_JS] : f.endsWith('.js') ? [REFERENCE_JS] : [];
    if (!motifs.length) continue;
    const texte = fs.readFileSync(path.join(source, f), 'utf8');
    for (const motif of motifs) {
      for (const m of texte.matchAll(motif)) {
        const cible = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1].split('?')[0]));
        if (cible.startsWith('..')) continue;
        if (f.endsWith('.html') && !fs.existsSync(path.join(source, cible))) absentsDePage.add(f + ' -> ' + cible);
        pile.push(cible);
      }
    }
  }
  return { fichiers: [...vus].sort(), absentsDePage: [...absentsDePage].sort() };
}

/** Les fichiers de la page maigre seule (sans l'élément de l'hôte) : le précache d'un service worker. */
function fichiersDePage(source) {
  const { fichiers } = fermeture(source, ENTREES_PAGE);
  const ensemble = new Set(fichiers);
  for (const d of DOSSIERS) for (const f of listerDossier(source, d)) ensemble.add(f);
  return [...ensemble].sort();
}

/** Les fichiers du profil « carte seule » (chemins relatifs à `source`, triés). Lève si la page réclame un fichier absent. */
function fichiersProfilBi(source) {
  const { fichiers, absentsDePage } = fermeture(source, ENTREES);
  if (absentsDePage.length) throw new Error('la page maigre réclame des fichiers absents du paquet : ' + absentsDePage.join(', '));
  const ensemble = new Set(fichiers);
  for (const d of DOSSIERS) for (const f of listerDossier(source, d)) ensemble.add(f);
  for (const f of FIXES) if (fs.existsSync(path.join(source, f))) ensemble.add(f);
  return [...ensemble].sort();
}

const empreinteCsp = (texte) => "'sha256-" + crypto.createHash('sha256').update(texte, 'utf8').digest('base64') + "'";

/** Les blocs en ligne d'une page : leurs empreintes entrent dans la politique, si bien qu'un script ou un style ajouté plus tard ne casse pas la page en silence. */
function blocsEnLigne(html) {
  const scripts = [...String(html).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((t) => t.trim());
  const styles = [...String(html).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).filter((t) => t.trim());
  return { scripts, styles };
}

/**
 * La politique de sécurité de contenu recommandée pour `bi.html` de CE paquet.
 * @param {string} html  le texte de bi.html
 * @param {{ feuillesConstruites?: boolean }} [o]  vrai quand les modules d'interface posent leurs feuilles par `adoptedStyleSheets` (lib/bi/ui/feuille.js) : `style-src 'self'`
 *   suffit alors ; sinon ils créent des `<style>` en ligne et `'unsafe-inline'` est ajouté aux styles.
 */
function politiqueCsp(html, { feuillesConstruites = true } = {}) {
  const { scripts, styles } = blocsEnLigne(html);
  return [
    "default-src 'none'",
    ["script-src 'self'", ...scripts.map(empreinteCsp)].join(' '),
    // Dès qu'une empreinte figure dans une liste de sources, le navigateur IGNORE 'unsafe-inline' (CSP niveau 3) : sans feuilles construites, 'unsafe-inline' tient donc
    // SEUL lieu des empreintes des styles (mesuré dans Chrome : l'association des deux laissait passer des violations).
    (feuillesConstruites ? ["style-src 'self'", ...styles.map(empreinteCsp)] : ["style-src 'self'", "'unsafe-inline'"]).join(' '),
    "img-src 'self' data: blob: https://tiles.openfreemap.org",
    "connect-src 'self' https://tiles.openfreemap.org",
    "font-src 'self' data:",
    "worker-src blob: 'self'",
    "child-src blob:",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join('; ');
}

/** `CSP.txt` : la politique, en en-tête HTTP prêt à copier, et ce qu'il faut savoir pour l'adapter. */
function texteCsp({ version, html, feuillesConstruites = true }) {
  const { scripts, styles } = blocsEnLigne(html);
  return [
    `# Politique de sécurité de contenu recommandée pour bi.html (Atlas ${version}, profil carte seule).`,
    '# Générée avec le paquet, à partir de ses fichiers ; mesurée dans Chrome (carte, légende, curseur de temps, couche administrative embarquée) sans aucune violation.',
    '#',
    "# À poser en EN-TÊTE HTTP de bi.html : frame-ancestors ne s'applique pas dans une balise <meta>.",
    "# - frame-ancestors 'self' : à remplacer par l'origine de votre application hôte si elle diffère de celle qui sert cette page (ex. https://app.exemple).",
    '# - Le fond de carte par défaut (tiles.openfreemap.org) est un service libre, sans engagement de service.',
    '# - Fonds IGN (setFond plan-ign ou photo) : ajouter https://data.geopf.fr à img-src et connect-src.',
    '# - base="aucune" : aucun service tiers, texte compris : les polices de la carte (Noto Sans Regular, latin) sont dans le paquet (lib/bi/polices).',
    '#   Une police personnalisée de charte (policeSymboles) ou un alphabet non latin demande des glyphes que le paquet n\'a pas : la couche concernée n\'est alors pas dessinée',
    '#   (mesuré : points et étiquettes disparaissent, sans erreur). Il faut alors fournir ses propres glyphes.',
    scripts.length ? `# - bi.html porte ${scripts.length} script(s) en ligne : leurs empreintes sont dans script-src et changent avec le fichier.` : "# - bi.html n'a aucun script en ligne : script-src 'self' suffit, sans empreinte à recalculer.",
    styles.length && feuillesConstruites ? `# - bi.html porte ${styles.length} style(s) en ligne : leurs empreintes sont dans style-src et changent avec le fichier.` : '',
    feuillesConstruites ? "# - Les feuilles de l'interface sont construites (adoptedStyleSheets) : style-src 'self' suffit." : "# - Cette version crée des <style> en ligne pour son interface : style-src porte 'unsafe-inline' (sans empreinte : le navigateur l'ignorerait).",
    'Content-Security-Policy: ' + politiqueCsp(html, { feuillesConstruites }),
  ].filter((l) => l !== '').join('\n') + '\n';
}

/** `PRECACHE.json` : les fichiers que la page maigre charge, pour le précache d'un service worker. */
function listePrecache({ version, contrat, source }) {
  return {
    format: 'atlas-precache/1', version, contrat, page: 'bi.html',
    note: "Fichiers à précacher pour que bi.html démarre sans réseau. Les adresses portent des paramètres (hote, base, voile…) et certains modules un ?v=<version> : faire correspondre en ignorant la query (ignoreSearch). Les fonds de carte restent des services tiers : sans réseau, utiliser setHorsLigne(true) (fond uni).",
    ignorerQuery: true,
    fichiers: fichiersDePage(source),
  };
}

module.exports = { ENTREES, ENTREES_PAGE, DOSSIERS, FIXES, fermeture, fichiersDePage, fichiersProfilBi, blocsEnLigne, politiqueCsp, texteCsp, listePrecache, empreinteCsp };
