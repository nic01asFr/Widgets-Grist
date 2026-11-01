#!/usr/bin/env node
/**
 * La vitrine : ce que `published/` montre a un humain.
 *
 * `manifest.json` s'adresse a Grist — un catalogue de widgets, lisible par une
 * machine. Rien, jusqu'ici, ne presentait ce travail a quelqu'un qui arrive :
 * le forum et l'article pointaient vers des URLs de widgets bruts, et l'APK
 * vers un pod temporaire.
 *
 * Deux niveaux, et pas trois : une page d'accueil ou chaque *projet* tient une
 * carte, et une page par projet ou ses widgets sont detailles. TaskFlow n'est
 * pas huit produits, c'est un produit a huit vues ; huit cartes qui se
 * ressemblent noieraient l'accueil.
 *
 * CONTRAINTE QUI COMMANDE L'ARBORESCENCE — `published/<projet>/index.html` EST
 * le widget : c'est l'URL declaree dans le manifeste, celle qu'ont enregistree
 * les instances Grist. La vitrine ne peut donc pas s'y loger. Elle vit sous
 * `/w/<projet>/`, et l'accueil est le seul `published/index.html`.
 *
 * Rien n'est ecrit a la main : les pages sont regenerees depuis le manifeste et
 * un `vitrine.json` par projet. C'est la lecon du manifeste lui-meme, edite une
 * fois a la main et parti en URLs « VOTRE_USER » que personne n'a vues.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RACINE = path.join(__dirname, '..');
const PUBLIE = path.join(RACINE, 'published');
const MANIFESTE = path.join(PUBLIE, 'manifest.json');

/* ------------------------------------------------------------------ */
/* Lecture                                                             */
/* ------------------------------------------------------------------ */

/** Le premier segment du chemin nomme le projet : `/taskflow/kanban/` → `taskflow`. */
function projetDe(url) {
  try {
    const p = new URL(url).pathname.split('/').filter(Boolean);
    return p[1] || null;   // [0] = nom du depot sur GitHub Pages
  } catch (_) { return null; }
}

/** Regroupe les widgets du manifeste par projet, en gardant l'ordre du manifeste. */
function grouper(widgets) {
  const projets = new Map();
  for (const w of widgets) {
    const nom = projetDe(w.url);
    if (!nom) continue;
    if (!projets.has(nom)) projets.set(nom, { id: nom, widgets: [] });
    projets.get(nom).widgets.push(w);
  }
  return [...projets.values()];
}

/**
 * Ce que le manifeste ne porte pas.
 *
 * Il donne un nom, une URL, une description courte — assez pour une carte, pas
 * pour presenter. Le reste (pitch, ce que ca fait, journal, couleur) vit dans
 * un `vitrine.json` a cote du widget, ecrit une fois.
 */
function presentation(projet) {
  const f = path.join(PUBLIE, projet.id, 'vitrine.json');
  if (!fs.existsSync(f)) return {};
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {
    console.warn(`  ! ${projet.id}/vitrine.json illisible : ${e.message}`);
    return {};
  }
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

const echapper = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Un texte de fiche, avec ses `parametres` en code.
 *
 * Les fiches citent des adresses et des parametres entre accents graves ; sans
 * ce rendu, la page les montrait tels quels, accents compris. On echappe
 * d'abord : le code ne peut donc rien injecter de plus que le texte.
 */
const enLigne = (s) => echapper(s).replace(/`([^`]+)`/g, '<code>$1</code>');

/**
 * Fraicheur relative plutot que date ISO : devant une liste, « il y a 3 j »
 * situe mieux qu'un horodatage, et dit d'un coup d'oeil ce qui vit.
 */
function depuis(iso, maintenant = Date.now()) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const j = Math.floor((maintenant - t) / 86400000);
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return 'hier';
  if (j < 31) return `il y a ${j} j`;
  const mo = Math.floor(j / 30);
  if (mo < 12) return `il y a ${mo} mois`;
  const an = Math.floor(mo / 12);
  return `il y a ${an} an${an > 1 ? 's' : ''}`;
}

/**
 * Quand ce projet a-t-il bouge ?
 *
 * Pas ce que dit le manifeste : il pose `new Date()` a chaque generation, donc
 * tous les widgets y sont « mis a jour aujourd'hui », y compris celui qui n'a
 * pas ete touche depuis mai. Une vitrine qui affiche cela ne renseigne sur
 * rien. La verite est dans l'historique.
 *
 * Repli sur le manifeste si l'historique n'est pas disponible — un checkout
 * superficiel de CI n'a pas les dates (`fetch-depth: 0` les ramene).
 */
function majProjet(projet) {
  try {
    // La fiche de presentation est exclue : elle vit dans le dossier du widget,
    // et l'y avoir ajoutee datait tous les projets du jour ou la vitrine est
    // nee — « mis a jour aujourd'hui » partout, donc nulle part.
    const d = execFileSync('git', ['log', '-1', '--format=%cI', '--',
      `published/${projet.id}`, `:(exclude)published/${projet.id}/vitrine.json`],
      { cwd: RACINE, encoding: 'utf8' }).trim();
    if (d) return d;
  } catch (_) { /* pas d'historique ici : on retombe sur le manifeste */ }
  const dates = projet.widgets.map((w) => Date.parse(w.lastUpdatedAt || '')).filter(Number.isFinite);
  return dates.length ? new Date(Math.max(...dates)).toISOString() : '';
}

/** Un projet qui a bouge dans la semaine merite qu'on le remarque. */
function estRecent(iso, maintenant = Date.now()) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) && (maintenant - t) < 7 * 86400000;
}


/* ------------------------------------------------------------------ */
/* Ce que les moteurs et les partages lisent                           */
/* ------------------------------------------------------------------ */

/**
 * L'adresse publique de la vitrine, deduite du manifeste.
 *
 * Elle n'est ecrite nulle part ailleurs : les URLs du manifeste la portent
 * deja, et la CI les construit a partir du depot. La coder en dur ici la ferait
 * mentir le jour ou le depot est renomme ou publie sous un autre compte.
 */
/**
 * Le code que Google demande pour prouver qu'on tient ce site.
 *
 * Sur une « project page », le domaine appartient a GitHub : on ne peut donc
 * declarer qu'un prefixe d'URL, et le prouver par une balise posee sur sa page
 * d'accueil. Ce code n'est pas un secret — c'est un identifiant de propriete —
 * d'ou le fichier versionne plutot qu'une variable d'environnement que la CI
 * devrait porter.
 */
function verification() {
  const f = path.join(PUBLIE, 'verification.json');
  if (!fs.existsSync(f)) return '';
  try {
    const code = JSON.parse(fs.readFileSync(f, 'utf8')).google;
    return code ? `
<meta name="google-site-verification" content="${echapper(code)}">` : '';
  } catch (_) { return ''; }
}

function baseDe(widgets) {
  for (const w of widgets) {
    try {
      const u = new URL(w.url);
      const depot = u.pathname.split('/').filter(Boolean)[0];
      return `${u.origin}/${depot}/`;
    } catch (_) { /* url inexploitable : on essaie la suivante */ }
  }
  return '';
}

/**
 * Ce qu'un moteur, un forum ou une messagerie affichent du lien.
 *
 * Sans ces balises, une adresse collee sur le forum Grist ou le bureau
 * numerique s'affiche nue : ni titre, ni resume. C'est la premiere impression,
 * et elle se joue avant que quiconque ait ouvert la page.
 *
 * Le lien canonique evite qu'une meme page soit comptee deux fois — atteinte
 * avec ou sans barre finale, ou suivie d'un parametre de campagne.
 */
function entete({ url, titre, description, image }) {
  const abs = image && url ? new URL(image, url).href : '';
  const lignes = [
    `<link rel="canonical" href="${echapper(url)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Widgets Grist">',
    '<meta property="og:locale" content="fr_FR">',
    `<meta property="og:url" content="${echapper(url)}">`,
    `<meta property="og:title" content="${echapper(titre)}">`,
    `<meta property="og:description" content="${echapper(description)}">`,
    abs ? `<meta property="og:image" content="${echapper(abs)}">` : '',
    `<meta name="twitter:card" content="${abs ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${echapper(titre)}">`,
    `<meta name="twitter:description" content="${echapper(description)}">`,
  ].filter(Boolean);
  return '\n' + lignes.join('\n');
}

/**
 * Les donnees structurees, en JSON-LD.
 *
 * `SoftwareApplication` decrit ce qu'est reellement un widget : un logiciel
 * gratuit qui tourne dans un navigateur. Sans ce vocabulaire, un moteur ne voit
 * qu'une page de texte parmi d'autres et ne peut rien en presenter de plus.
 *
 * Le JSON est insere tel quel : il ne peut pas contenir de balise fermante,
 * `JSON.stringify` echappant deja ce qui pourrait en former une.
 */
function donneesStructurees(objet) {
  const json = JSON.stringify(objet).split('<').join('\\u003c');
  return `\n<script type="application/ld+json">${json}</` + `script>`;
}

/* ------------------------------------------------------------------ */
/* Le rendu                                                            */
/* ------------------------------------------------------------------ */

/**
 * Le socle visuel, partage par toutes les pages.
 *
 * `--accent` est la seule variable qui change d'une page a l'autre : chaque
 * projet porte sa couleur, celle de son widget. Une page de presentation qui ne
 * ressemble pas au produit ment sur le produit — mais l'accueil, lui, reste
 * neutre pour laisser les cartes se distinguer entre elles.
 */
const PEAU_MAISON = {
  clair: { papier: '#FAF7F0', surface: '#FFFFFF', encre: '#1A1814', plume: '#6B6355', filet: '#E6DFD1' },
  sombre: { papier: '#14120F', surface: '#1D1A16', encre: '#F2EDE3', plume: '#9A9184', filet: '#2E2A23' },
  display: 'Georgia, "Times New Roman", serif',
  accent: '#8B5E3C',
};

/** Les variables d'une palette, sur une ligne. */
function variables(p) {
  return Object.entries(p).map(([k, v]) => `--${k}: ${v};`).join(' ');
}

/**
 * Le socle visuel — structure commune, peau du produit.
 *
 * La page d'un widget prend la palette et la typographie de ce widget : une
 * presentation qui ne ressemble pas au produit ment sur le produit, et c'est la
 * seule chose que le visiteur en voit avant de l'ouvrir. TaskFlow est dense et
 * bleute, Atlas creme et vermillon — leurs pages doivent l'etre aussi.
 *
 * Ce qui ne change pas : la grille, la hierarchie, le fil d'Ariane, le pied. On
 * doit sentir qu'on est toujours sur le meme site, sinon revenir a l'accueil
 * ressemble a un depart.
 *
 * Une peau qui declare ses deux versions suit le theme du visiteur ; une peau
 * qui n'en declare qu'une l'impose — c'est le cas d'un produit dont l'identite
 * est un parti pris.
 */
function socle(accent, peau = {}) {
  const clair = { ...PEAU_MAISON.clair, ...(peau.clair || {}) };
  const sombre = peau.clair && !peau.sombre ? null : { ...PEAU_MAISON.sombre, ...(peau.sombre || {}) };
  const display = peau.display || PEAU_MAISON.display;
  return `
:root { ${variables(clair)} --accent: ${accent || peau.accent || PEAU_MAISON.accent}; }
${sombre ? `@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { ${variables(sombre)}${peau.accentSombre ? ` --accent: ${peau.accentSombre};` : ''} }
}` : ''}
* { box-sizing: border-box; }
body { margin: 0; background: var(--papier); color: var(--encre);
  font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased; }
a { color: inherit; }
main { max-width: 60rem; margin: 0 auto; padding: 4rem 1.5rem 6rem; }
h1, h2, h3 { font-family: ${display}; font-weight: 500;
  line-height: 1.15; text-wrap: balance; margin: 0; }
h1 { font-size: clamp(2.2rem, 6vw, 3.4rem); letter-spacing: -.01em; }
h2 { font-size: 1.5rem; margin-bottom: 1rem; }
p { margin: 0 0 1rem; color: var(--plume); }
.eyebrow { font-size: .78rem; letter-spacing: .12em; text-transform: uppercase;
  color: var(--plume); margin-bottom: 1.4rem; }
.tags { display: flex; flex-wrap: wrap; gap: .4rem; margin: 1rem 0; }
.tag { font-size: .78rem; padding: .2rem .6rem; border-radius: 999px;
  border: 1px solid var(--filet); color: var(--plume); }
.faits { display: flex; flex-wrap: wrap; gap: 1.4rem; align-items: baseline;
  font-size: .88rem; color: var(--plume); margin: 1.4rem 0 2rem; }
.faits b { color: var(--encre); font-weight: 600; }
.vif { display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  background: #4E9A5B; margin-right: .4rem; vertical-align: middle; }
.pied { max-width: 60rem; margin: 0 auto; padding: 2rem 1.5rem 4rem;
  border-top: 1px solid var(--filet); font-size: .85rem; color: var(--plume); }
code { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: .85em;
  background: var(--surface); border: 1px solid var(--filet); border-radius: 4px;
  padding: .1rem .35rem; }
`;
}

/** Ouverture et fermeture d'un document — un seul endroit ou elles vivent. */
function page({ titre, description, accent, peau, corps, css = '', meta = '', ld = '', scriptEntete = '' }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapper(titre)}</title>
<meta name="description" content="${echapper(description || '')}">${meta}${ld}
<style>${socle(accent, peau)}${css}</style>${scriptEntete}
</head>
<body>
${corps}
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* L'accueil                                                           */
/* ------------------------------------------------------------------ */

/**
 * Le contenu editorial de l'accueil.
 *
 * Il ne vit pas dans le generateur : ce qu'on dit de son travail change plus
 * souvent que la facon de l'afficher, et l'ecrire dans le code obligerait a
 * toucher un script pour corriger une phrase.
 */
function editorial() {
  const f = path.join(PUBLIE, 'accueil.json');
  if (!fs.existsSync(f)) return {};
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {
    console.warn(`  ! accueil.json illisible : ${e.message}`);
    return {};
  }
}

/**
 * L'accueil emprunte a GitHub, d'ou l'on vient.
 *
 * Sa palette et sa police, parce qu'un catalogue de code lu par des gens qui
 * arrivent d'un depot n'a pas a leur imposer un depaysement. Mais seulement
 * cela : la structure est la notre, et chaque page de projet reprend ensuite
 * la peau de son widget.
 *
 * On n'emprunte pas celle de Grist, qui serait plus juste sur le fond et bien
 * plus perilleuse : reprendre l'identite d'un produit qu'on n'edite pas laisse
 * croire a une affiliation qui n'existe pas.
 */
const CSS_ACCUEIL = `
:root {
  --papier: #ffffff; --surface: #f6f8fa; --encre: #1f2328; --plume: #59636e;
  --filet: #d1d9e0; --accent: #0969da; --vert: #1a7f37;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --papier: #0d1117; --surface: #151b23; --encre: #e6edf3; --plume: #9198a1;
    --filet: #3d444d; --accent: #4493f8; --vert: #3fb950;
  }
}
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans",
  Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.6; }
h1, h2, h3 { font-family: inherit; font-weight: 600; letter-spacing: -.01em; }
h1 { font-size: clamp(1.9rem, 5vw, 2.6rem); line-height: 1.25; }
h2 { font-size: 1.35rem; margin: 0 0 .4rem; }
h3 { font-size: 1rem; margin: 0 0 .3rem; }
main { max-width: 62rem; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

.manifeste { max-width: 46rem; }
.manifeste .chapeau { font-size: 1.08rem; color: var(--plume); margin-top: 1rem; }
.section { padding-top: 2.6rem; margin-top: 2.6rem; border-top: 1px solid var(--filet); }
.section > p { max-width: 46rem; }
.soustitre { font-size: .78rem; letter-spacing: .06em; text-transform: uppercase;
  color: var(--plume); font-weight: 600; margin-bottom: .8rem; }

/* Les cartes : la densite d'une liste de depots, sans son habillage. */
.grille { display: grid; gap: 1rem; margin-top: 1.4rem;
  grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr)); }
.carte { display: flex; flex-direction: column; text-decoration: none;
  background: var(--papier); border: 1px solid var(--filet); border-radius: 6px;
  overflow: hidden; transition: border-color .12s; }
.carte:hover { border-color: var(--accent); text-decoration: none; }
/* La non-croissance n est pas decorative : dans une carte en colonne, un enfant
   s etire pour remplir la hauteur et le rapport annonce est ignore — la
   vignette devenait un panneau vertical. */
.vignette { display: block; flex: none; width: 100%; height: auto;
  aspect-ratio: 1200 / 630; object-fit: cover; object-position: top center;
  background: var(--surface); border-bottom: 1px solid var(--filet); }
.carte .dedans { padding: .95rem 1.05rem 1.05rem; display: flex; flex-direction: column;
  flex: 1; }
.carte h2 { color: var(--accent); font-size: 1.05rem; }
.carte p { font-size: .88rem; color: var(--plume); margin: .35rem 0 .8rem; flex: 1; }
.carte .bas { display: flex; align-items: center; gap: 1rem; font-size: .75rem;
  color: var(--plume); }
.pastille { display: inline-flex; align-items: center; gap: .35rem; }
.pastille::before { content: ''; width: .62rem; height: .62rem; border-radius: 50%;
  background: var(--teinte, var(--accent)); }
.tags { display: flex; flex-wrap: wrap; gap: .35rem; margin-bottom: .7rem; }
.tag { font-size: .72rem; padding: .1rem .55rem; border-radius: 999px;
  border: 1px solid var(--filet); color: var(--plume); }

/* Principes et outils : deux colonnes de texte, rien de plus. */
.paves { display: grid; gap: 1.6rem 2rem; margin-top: 1.4rem;
  grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); }
.pave p { font-size: .92rem; color: var(--plume); margin: 0; }
.pave .role { font-size: .75rem; letter-spacing: .04em; text-transform: uppercase;
  color: var(--plume); margin-bottom: .15rem; }

/* Les declinaisons : un tableau, parce que ce sont trois fois les memes champs. */
.decl { width: 100%; border-collapse: collapse; margin-top: 1.2rem; font-size: .92rem; }
.decl th { text-align: left; font-size: .74rem; letter-spacing: .06em;
  text-transform: uppercase; color: var(--plume); font-weight: 600;
  padding: 0 1rem .5rem 0; border-bottom: 1px solid var(--filet); }
.decl td { padding: .8rem 1rem .8rem 0; border-bottom: 1px solid var(--filet);
  vertical-align: top; color: var(--plume); }
.decl td:first-child { color: var(--encre); font-weight: 600; white-space: nowrap; }
.decl td:last-child { font-size: .85rem; }

/* La chaine : l'ordre porte l'information, donc on le montre. */
.chaine { display: flex; flex-wrap: wrap; gap: .5rem; align-items: stretch;
  margin-top: 1.3rem; }
.maillon { flex: 1 1 9rem; background: var(--surface); border: 1px solid var(--filet);
  border-radius: 6px; padding: .8rem .9rem; }
.maillon b { display: block; font-size: .9rem; margin-bottom: .2rem; }
.maillon span { font-size: .8rem; color: var(--plume); line-height: 1.45; }

.liens { display: flex; flex-wrap: wrap; gap: .5rem 1.4rem; margin-top: 1rem;
  font-size: .9rem; }
.liens span { color: var(--plume); }
`;

/** Une carte de projet : la vignette d'abord, puis ce qu'on peut en dire. */
function carteProjet(p, v, maintenant) {
  const maj = majProjet(p);
  const teinte = v.couleur || 'var(--accent)';
  const n = p.widgets.length;
  const img = apercuDe(p.id);
  return `      <a class="carte" href="w/${p.id}/">
        ${img ? `<img class="vignette" src="w/${p.id}/${img}" alt="" loading="lazy" width="1200" height="630">` : ''}
        <div class="dedans">
          <h2>${echapper(v.nom || p.widgets[0].name || p.id)}</h2>
          <p>${echapper(v.pitch || principalDe(p).description || '')}</p>
          ${(v.tags || []).length ? `<div class="tags">${(v.tags || []).slice(0, 3)
            .map((t) => `<span class="tag">${echapper(t)}</span>`).join('')}</div>` : ''}
          <div class="bas">
            <span class="pastille" style="--teinte:${echapper(teinte)}">${n} widget${n > 1 ? 's' : ''}</span>
            <span>${echapper(depuis(maj, maintenant))}</span>
          </div>
        </div>
      </a>`;
}

function rendreAccueil(projets, maintenant, base = '') {
  const e = editorial();
  const titre = e.titre || 'Widgets Grist';
  const description = e.chapeau
    || 'Widgets libres pour Grist : cartographie 3D, gestion de projet, formulaires, import QGIS.';

  const bloc = (contenu) => (contenu ? contenu : '');

  // Grist d'abord : la page parle de widgets pour un logiciel que le lecteur ne
  // connait pas forcement, et on doit a ses auteurs d'y renvoyer plutot que de
  // s'installer devant.
  const surGrist = !e.grist ? '' : `  <section class="section">
    <h2>${echapper(e.grist.titre)}</h2>
    <p>${echapper(e.grist.texte)}</p>
    ${e.grist.public ? `<p>${echapper(e.grist.public)}</p>` : ''}
    <div class="liens">
${(e.grist.liens || []).map((l) => `      <span><a href="${echapper(l.url)}">${echapper(l.nom)}</a> — ${echapper(l.texte)}</span>`).join('\n')}
    </div>
  </section>`;

  const principes = !(e.principes || []).length ? '' : `  <section class="section">
    <p class="soustitre">Ce qui les rend différents</p>
    <div class="paves">
${e.principes.map((x) => `      <div class="pave"><h3>${echapper(x.titre)}</h3><p>${echapper(x.texte)}</p></div>`).join('\n')}
    </div>
  </section>`;

  const declinaisons = !(e.declinaisons || []).length ? '' : `  <section class="section">
    <h2>${echapper(e.declinaisonsTitre || 'Le même widget, trois usages')}</h2>
    <p>${echapper(e.declinaisonsTexte || '')}</p>
    <table class="decl">
      <thead><tr><th>Où</th><th>Ce qu'on y fait</th><th>Accès</th></tr></thead>
      <tbody>
${e.declinaisons.map((d) => `        <tr><td>${echapper(d.ou)}</td><td>${echapper(d.quoi)}</td><td>${echapper(d.acces)}</td></tr>`).join('\n')}
      </tbody>
    </table>
  </section>`;

  const chaine = !(e.chaine || []).length ? '' : `  <section class="section">
    <h2>${echapper(e.chaineTitre || 'La chaîne')}</h2>
    <div class="chaine">
${e.chaine.map((m) => `      <div class="maillon"><b>${echapper(m.etape)}</b><span>${echapper(m.texte)}</span></div>`).join('\n')}
    </div>
  </section>`;

  const fabrique = !(e.fabrique || []).length ? '' : `  <section class="section">
    <h2>${echapper(e.fabriqueTitre || 'Ce qui fabrique ces solutions')}</h2>
    <p>${echapper(e.fabriqueTexte || '')}</p>
    <div class="paves">
${e.fabrique.map((o) => `      <div class="pave">
        <p class="role">${echapper(o.role)}</p>
        <h3><a href="${echapper(o.url)}">${echapper(o.nom)}</a></h3>
        <p>${echapper(o.texte)}${o.forum ? ` <a href="${echapper(o.forum)}">En discuter sur le forum</a>.` : ''}</p>
      </div>`).join('\n')}
    </div>
  </section>`;

  const conventions = !(e.conventions || []).length ? '' : `  <section class="section">
    <h2>${echapper(e.conventionsTitre || 'Ce qui tient les projets ensemble')}</h2>
    <p>${echapper(e.conventionsTexte || '')}</p>
    <div class="paves">
${e.conventions.map((c) => `      <div class="pave"><h3>${echapper(c.nom)}</h3><p>${echapper(c.texte)}</p></div>`).join('\n')}
    </div>
  </section>`;

  // Une page qui ne parle que de soi laisse croire qu'elle est seule. Cette
  // section cite ce sur quoi le depot s'appuie et ce qui l'entoure — d'autres
  // equipes, et les briques libres dont les vues sont faites. `forum` renvoie
  // vers le fil ou l'equipe presente son travail elle-meme, ce qui vaut mieux
  // que de le presenter a sa place.
  const ecosysteme = !(e.ecosysteme || []).length ? '' : `  <section class="section">
    <h2>${echapper(e.ecosystemeTitre || 'Autour')}</h2>
    ${e.ecosystemeTexte ? `<p>${echapper(e.ecosystemeTexte)}</p>` : ''}
    <div class="liens">
${e.ecosysteme.map((x) => `      <span><a href="${echapper(x.url)}">${echapper(x.nom)}</a> — ${echapper(x.texte)}${
  x.forum ? ` <a href="${echapper(x.forum)}">Leur fil sur le forum</a>.` : ''}</span>`).join('\n')}
    </div>
  </section>`;

  return page({
    titre,
    description,
    meta: verification() + (base ? entete({ url: base, titre, description }) : ''),
    ld: base ? donneesStructurees({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: titre,
      description,
      url: base,
      inLanguage: 'fr',
      hasPart: projets.map((pr) => ({
        '@type': 'SoftwareApplication',
        name: pr.presentation.nom || pr.widgets[0].name,
        url: `${base}w/${pr.id}/`,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
      })),
    }) : '',
    corps: `<main>
  <div class="manifeste">
    <h1>${echapper(titre)}</h1>
    <p class="chapeau">${echapper(description)}</p>
  </div>

${surGrist}
  <section class="section">
    <h2>Les widgets</h2>
    <div class="grille">
${projets.map((p) => carteProjet(p, p.presentation, maintenant)).join('\n')}
    </div>
  </section>

${[principes, declinaisons, chaine, fabrique, conventions, ecosysteme].filter(Boolean).join('\n')}
</main>
<footer class="pied">
  <p>Pour ajouter ces widgets à une instance auto-hébergée, pointez
     <code>GRIST_WIDGET_LIST_URL</code> vers <a href="manifest.json">manifest.json</a>.
     Le code est sur <a href="https://github.com/nic01asFr/Widgets-Grist">GitHub</a>.</p>
  ${e.statut ? `<p>${echapper(e.statut)}</p>` : ''}
</footer>`,
    css: CSS_ACCUEIL,
  });
}

/* ------------------------------------------------------------------ */
/* Les blocs d'une page produit                                        */
/* ------------------------------------------------------------------ */

/**
 * Ces blocs sont facultatifs, et c'est le point.
 *
 * Une page produit — accroche, images, sequence d'usage, chiffres — ne merite
 * pas un gabarit a part : ce serait du code qui ne sert qu'a un projet, et que
 * le suivant devrait reecrire. Chaque bloc s'affiche quand la fiche le remplit,
 * et disparait sinon. Atlas les remplit tous ; un widget qui n'a rien de plus a
 * montrer garde exactement la page qu'il avait.
 */

/** Les chiffres qui disent l'echelle, quand il y en a de vrais a donner. */
function blocChiffres(produit) {
  const l = produit.chiffres || [];
  if (!l.length) return '';
  return `  <section class="chiffres reveler">
${l.map((c) => `    <div><b>${echapper(c.valeur)}</b><span>${echapper(c.libelle)}</span></div>`).join('\n')}
  </section>`;
}

/**
 * Une demonstration annoncee doit mener quelque part : une adresse locale dont la page est absente est ecartee, et dite.
 * Une adresse en http(s) est crue sur parole, et sans dossier de reference il n'y a rien a verifier.
 */
function demoLocaleValide(d, base) {
  if (!d || !d.url) return false;
  if (/^https?:/.test(d.url) || !base) return true;
  const local = path.join(base, d.url.split(/[?#]/)[0]);
  if (fs.existsSync(local)) return true;
  console.error(`  demonstration de capture ignoree — page absente : ${d.url}`);
  return false;
}

/**
 * Ou le produit tourne, et pourquoi chaque endroit existe.
 *
 * Une capture sans son pourquoi ne fait que remplir la page : le lecteur se
 * demande pourquoi on lui montre trois fois la meme interface. Chaque contexte
 * dit donc ce qu'il apporte que les autres n'apportent pas.
 *
 * Le cadre de telephone n'est pas un ornement — sans lui, une capture verticale
 * se lit comme une image mal recadree au milieu du texte.
 */
function blocContextes(produit, base) {
  const l = produit.contextes || [];
  if (!l.length) return '';
  // Une capture peut porter une demonstration vivante (`demo: { url, libelle }`) : la vignette tient lieu d'apercu, le clic lance la page
  // dans un cadre, comme la demonstration de fin de page (`cadre`). Une adresse locale qui ne mene a rien est ecartee et dite : une
  // demonstration annoncee puis vide est pire qu'une capture seule.
  const demoValide = (d) => demoLocaleValide(d, base);
  const figure = (i, mobile) => (demoValide(i.demo)
    ? `        <figure class="large vivante">
${cadre({ url: i.demo.url, image: i.image, alt: i.legende, libelle: i.demo.libelle || 'Essayer la démonstration', titre: i.demo.titre || '' })}
          <figcaption>${enLigne(i.legende)}</figcaption>
        </figure>`
    : mobile
    ? `        <figure class="telephone">
          <div class="ecran"><img src="${echapper(i.image)}" alt="${echapper(i.legende)}" loading="lazy"></div>
          <figcaption>${enLigne(i.legende)}</figcaption>
        </figure>`
    : `        <figure class="large">
          <img src="${echapper(i.image)}" alt="${echapper(i.legende)}" loading="lazy">
          <figcaption>${enLigne(i.legende)}</figcaption>
        </figure>`);
  // Qui fait quoi : le rôle (l'auteur, l'agent de terrain, le lecteur) précède le titre, et les fonctions du produit qu'un chapitre
  // met en jeu sont nommées en pastilles, pour qu'on retrouve « où l'on s'en sert » sans relire le texte.
  // Un contexte qui a beaucoup à montrer peut le faire défiler à l'horizontale (`carrousel: true`), comme les parcours : le texte au-dessus,
  // les diapositives dessous sur toute la largeur. Chaque image porte alors un `titre` (la puce du sommaire), un `alt` (ce que dit l'image
  // à qui ne la voit pas) et sa `legende` (le texte à côté). Une image sans titre ou sans alt est écartée et dite, comme dans un parcours ;
  // si plus rien ne reste, le contexte retombe sur ses figures en pile.
  const diapositives = (c) => (c.carrousel
    ? (c.images || []).map((i) => ({ image: i.image, titre: i.titre, alt: i.alt || i.legende, legende: '', texte: i.legende }))
    : []);
  const article = (c, k) => {
    const carrousel = diapositives(c).length ? carrouselParcours(`contexte-${k + 1}`, c.titre, diapositives(c), { racine: base, pano: true }) : '';
    return `    <article class="contexte${carrousel ? ' avec-carrousel' : ''}">
      <div class="dit">
        ${c.role ? `<p class="role">${echapper(c.role)}</p>` : ''}
        <h3>${echapper(c.titre)}</h3>
        <p>${enLigne(c.texte)}</p>
        ${c.pourquoi ? `<p class="pourquoi">${enLigne(c.pourquoi)}</p>` : ''}
        ${c.exemple ? `<p class="exemple"><b>Dans l’exemple</b> ${enLigne(c.exemple)}</p>` : ''}
        ${(c.utilise || []).length ? `<ul class="utilise">${c.utilise.map((u) => `<li>${echapper(u)}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="montre${c.format === 'mobile' ? ' telephones' : ''}">
${carrousel || (c.images || []).map((i) => figure(i, c.format === 'mobile')).join('\n')}
      </div>
    </article>`;
  };
  return `  <section class="contextes reveler">
    <h2>${echapper(produit.titreContextes || 'Où ça tourne')}</h2>
${l.map(article).join('\n')}
  </section>`;
}

/**
 * Comment on s'en sert.
 *
 * Numerote, parce que l'ordre porte ici une information : on ne symbolise pas
 * une couche avant de l'avoir ajoutee. Ailleurs, numeroter serait un ornement.
 */
function blocSequence(produit) {
  const l = produit.sequence || [];
  if (!l.length) return '';
  return `  <section class="sequence reveler">
    <h2>${echapper(produit.titreSequence || 'Comment on s’en sert')}</h2>
    <ol>
${l.map((e) => `      <li>
        <b>${echapper(e.titre)}</b>
        <p>${enLigne(e.texte)}</p>
      </li>`).join('\n')}
    </ol>
  </section>`;
}

/**
 * Les facons de faire : plusieurs portes pour un meme geste.
 *
 * Pas numerote, a la difference de la sequence : ce sont des alternatives, pas
 * des etapes — on choisit la sienne. Chaque groupe (faire entrer la donnee,
 * diffuser la carte...) liste ses portes ; l'etiquette dit ou chacune tourne
 * (« dans le document », « sans document »), parce que c'est ce qui decide
 * laquelle convient.
 */
function blocFacons(produit) {
  const groupes = (produit.facons || []).filter((g) => (g.items || []).length);
  if (!groupes.length) return '';
  const item = (i) => `        <li>
          <div class="porte"><b>${echapper(i.titre)}</b>${i.etiquette ? `<span class="ou">${echapper(i.etiquette)}</span>` : ''}</div>
          <p>${enLigne(i.texte)}</p>
        </li>`;
  const groupe = (g) => `    <div class="groupe">
      <h3>${echapper(g.titre)}</h3>
      ${g.texte ? `<p class="intro">${enLigne(g.texte)}</p>` : ''}
      <ul>
${g.items.map(item).join('\n')}
      </ul>
    </div>`;
  return `  <section class="facons reveler">
    <h2>${echapper(produit.titreFacons || 'Les façons de faire')}</h2>
    <div class="groupes">
${groupes.map(groupe).join('\n')}
    </div>
  </section>`;
}

/**
 * Ce que le produit fait, en une phrase chacune.
 *
 * Une liste a plat de quatorze points ne dit pas pour qui ils sont : quand des points portent un `groupe`, ils se rangent sous
 * un intertitre, dans l'ordre ou les groupes apparaissent. Sans groupe, la liste reste celle d'avant.
 */
function blocPoints(points) {
  const li = (pt) => `      <li>${pt.titre ? `<b>${echapper(pt.titre)}</b> — ` : ''}${echapper(pt.texte || pt)}</li>`;
  const liste = (l) => `    <ul class="points">
${l.map(li).join('\n')}
    </ul>`;
  const noms = [...new Set(points.map((p) => p.groupe).filter(Boolean))];
  const sans = points.filter((p) => !p.groupe);
  return `  <section>
    <h2>Ce qu’il fait</h2>
${sans.length ? `${liste(sans)}\n` : ''}${noms.map((n) => `    <h3 class="groupe-points">${echapper(n)}</h3>\n${liste(points.filter((p) => p.groupe === n))}`).join('\n')}
  </section>`;
}

/* ------------------------------------------------------------------ */
/* Le parcours : une page organisee par usage                          */
/* ------------------------------------------------------------------ */

/**
 * Une page de produit peut s'organiser par usage plutot que par fonction : `produit.parcours`.
 *
 * Ce que la fiche declare (tout est facultatif, et une fiche sans `parcours` garde la page qu'elle avait) :
 *   - `cta[]`, `statut[]`, `comparaison`, `preuves[]` : le haut de page ;
 *   - `sections[]` : chacune a un `id`, un `titre`, une `intro`, des `chapitres[]` et, au choix, une `demo` ou des `flux[]` ;
 *   - un chapitre : `num`, `titre`, `paragraphes[]`, `pourquoi`, `liens[]`, puis UN des trois, `figure` (avec `demo` si l'image se lance),
 *     `diapositives[]` (un carrousel) ou `code` ; et un `detail` replie (`blocs[]` ou `tableau`) ;
 *   - `savoir[]` : les sections repliees « a savoir avant d'adopter » ; `journalRecent` : combien de versions montrer avant « toutes ».
 *
 * Deux gardes : une image sans `alt` n'est pas rendue (elle serait muette pour un lecteur d'ecran), un chiffre sans `preuve` non plus
 * (la vitrine ne chiffre que ce qu'elle sait montrer). Chaque ecart est dit a la generation, pas tu.
 */

/** Largeur et hauteur d'une image PNG ou JPEG, lues dans son en-tete : sans elles, la page saute a chaque image chargee. */
function dimensionsImage(fichier) {
  try {
    const d = fs.readFileSync(fichier);
    if (d.length > 24 && d.readUInt32BE(0) === 0x89504e47) return { w: d.readUInt32BE(16), h: d.readUInt32BE(20) };
    if (d[0] === 0xff && d[1] === 0xd8) {
      let i = 2;
      while (i + 9 < d.length) {
        if (d[i] !== 0xff) { i += 1; continue; }
        const m = d[i + 1];
        if (m === 0xff) { i += 1; continue; }
        if (m >= 0xc0 && m <= 0xc3) return { h: d.readUInt16BE(i + 5), w: d.readUInt16BE(i + 7) };
        if (m >= 0xd0 && m <= 0xd9) { i += 2; continue; }
        i += 2 + d.readUInt16BE(i + 2);
      }
    }
  } catch (e) { /* image absente ou illisible : pas de dimensions, la page marche quand meme */ }
  return null;
}

/** Une image de la fiche, avec ses dimensions quand on les connait ; la premiere d'un carrousel n'est pas differee. */
function imageParcours(racine, nom, alt, { differee = true } = {}) {
  const dim = dimensionsImage(path.join(racine, nom));
  return {
    html: `<img src="${echapper(nom)}" alt="${echapper(alt)}"${dim ? ` width="${dim.w}" height="${dim.h}"` : ''}${differee ? ' loading="lazy" decoding="async"' : ''}>`,
    vertical: !!dim && dim.h > dim.w,
    panoramique: !!dim && dim.w / dim.h > 1.6,
  };
}

/** Une figure : l'image, et la demonstration derriere si la fiche en declare une qui existe. */
function figureParcours(f, ctx) {
  if (!f || !f.image) return '';
  if (!f.alt) { console.error(`  figure ignoree — pas de texte alternatif : ${f.image}`); return ''; }
  const legende = f.legende ? `<figcaption>${enLigne(f.legende)}</figcaption>` : '';
  if (demoLocaleValide(f.demo, ctx.racine)) {
    return `<figure class="vivante">
${cadre({ url: f.demo.url, image: f.image, alt: f.alt, libelle: f.demo.libelle || 'Essayer la démonstration', titre: f.demo.titre || '' })}
      ${legende}
    </figure>`;
  }
  return `<figure>${imageParcours(ctx.racine, f.image, f.alt).html}${legende}</figure>`;
}

/** Un carrousel : on voit la suite, on avance par les fleches, par le clavier ou par un titre ; rien ne defile seul. */
function carrouselParcours(id, libelle, diapos, ctx) {
  const valides = (diapos || []).filter((d) => {
    if (!d.image || !d.titre) return false;
    if (!d.alt) { console.error(`  diapositive ignoree — pas de texte alternatif : ${d.image}`); return false; }
    return true;
  });
  if (!valides.length) return '';
  const n = valides.length;
  const pistes = valides.map((d, k) => {
    const img = imageParcours(ctx.racine, d.image, d.alt, { differee: k > 0 });
    return `<div class="diapo${img.vertical ? ' tel' : ''}${ctx.pano && img.panoramique ? ' pano' : ''}" role="group" aria-roledescription="diapositive" aria-label="${k + 1} sur ${n}">
        <figure>${img.html}${d.legende ? `<figcaption>${enLigne(d.legende)}</figcaption>` : ''}</figure>
        <div class="texte"><h4>${echapper(d.titre)}</h4>${d.texte ? `<p>${enLigne(d.texte)}</p>` : ''}${(d.etiquettes || []).length ? `<ul class="etiquettes">${d.etiquettes.map((t) => `<li>${echapper(t)}</li>`).join('')}</ul>` : ''}</div>
      </div>`;
  });
  const titres = valides.map((d, k) => `<li><button type="button" data-n="${k}"${k === 0 ? ' aria-current="true"' : ''}>${echapper(d.titre)}</button></li>`);
  return `<section class="carrousel" aria-roledescription="carrousel" aria-label="${echapper(libelle)}" id="${echapper(id)}">
      <div class="pistes" tabindex="0" aria-label="${echapper(libelle)} : flèches gauche et droite pour parcourir">
      ${pistes.join('\n      ')}
      </div>
      <button type="button" class="prec" aria-label="Diapositive précédente" disabled>←</button>
      <button type="button" class="suiv" aria-label="Diapositive suivante"${n < 2 ? ' disabled' : ''}>→</button>
      <div class="commandes"><span class="compteur" aria-live="polite">1 / ${n}</span><ul class="sommaire" aria-label="Aller à une diapositive">${titres.join('')}</ul></div>
    </section>`;
}

/** Un bloc de code a copier : le code reste lisible sans script, le bouton « Copier » n'apparait que s'il peut servir. */
function blocCode(c) {
  if (!c || !c.source) return '';
  return `<div class="bloc-code" role="group" aria-label="${echapper(c.titre || 'Code à copier')}">
      <div class="entete-code"><span>${echapper(c.titre || 'Code')}</span><button type="button" class="copier" hidden>Copier</button></div>
      <pre><code${c.langage ? ` class="langage-${echapper(c.langage)}"` : ''}>${echapper(c.source)}</code></pre>
    </div>`;
}

/** Un tableau court : des intitules en colonne, jamais de cellule fusionnee. */
function tableauParcours(t, titre = '') {
  if (!t || !(t.colonnes || []).length || !(t.lignes || []).length) return '';
  return `<table class="comparaison">${titre ? `<caption>${echapper(titre)}</caption>` : ''}
      <thead><tr>${t.colonnes.map((c) => `<th scope="col">${echapper(c)}</th>`).join('')}</tr></thead>
      <tbody>${t.lignes.map((l) => `<tr>${l.map((c, i) => (i === 0 ? `<th scope="row">${enLigne(c)}</th>` : `<td>${enLigne(c)}</td>`)).join('')}</tr>`).join('')}</tbody>
    </table>`;
}

/** Ce qui se replie : des blocs titres, ou un tableau. */
function detailParcours(d) {
  if (!d || !d.titre) return '';
  const corps = (d.blocs || []).map((b) => `<h4>${echapper(b.titre)}</h4><p>${enLigne(b.texte)}</p>`).join('') + tableauParcours(d.tableau);
  return corps ? `<details class="detail"><summary>${echapper(d.titre)}</summary><div>${corps}</div></details>` : '';
}

/** Un chapitre : le texte, et ce qui le montre (une figure, un carrousel ou du code). */
function chapitreParcours(c, ctx, id) {
  const texte = `<div class="dit">
        ${c.num ? `<span class="num">${echapper(c.num)}</span>` : ''}<h3>${echapper(c.titre)}</h3>
        ${(c.paragraphes || []).map((t) => `<p>${enLigne(t)}</p>`).join('\n        ')}
        ${c.pourquoi ? `<p class="pourquoi">${enLigne(c.pourquoi)}</p>` : ''}
        ${(c.liens || []).length ? `<p class="liens">${c.liens.map((l) => `<a class="${l.bouton ? 'bouton creux' : 'lien'}" href="${echapper(l.url)}"${/^https?:/.test(l.url) ? ' target="_blank" rel="noopener"' : ''}>${echapper(l.libelle)}</a>`).join(' ')}</p>` : ''}
      </div>`;
  const carrousel = (c.diapositives || []).length ? carrouselParcours(`c-${id}`, c.titre, c.diapositives, ctx) : '';
  const figure = figureParcours(c.figure, ctx);
  const code = blocCode(c.code);
  const montre = carrousel || figure || code;
  // Une figure ET du code : la figure accompagne le texte, le code s'etale dessous sur toute la largeur.
  const apres = !carrousel && figure && code ? `<div class="pleine">${code}</div>` : '';
  const detail = detailParcours(c.detail);
  const haut = !!carrousel;
  return `    <article class="chap${haut ? ' haut' : ''}${c.inverse && !haut ? ' inverse' : ''}">
      ${texte}
      ${haut ? montre : `<div class="montre">${montre}</div>`}
      ${apres}
      ${detail}
    </article>`;
}

/** Les trois flux d'une carte : ce qu'ils sont, et d'ou ils peuvent venir. */
function fluxParcours(flux) {
  if (!(flux || []).length) return '';
  return `    <ul class="flux">
${flux.map((f) => `      <li><h3>${echapper(f.titre)}</h3><p>${enLigne(f.texte)}</p>${(f.vientDe || []).length ? `<span class="d">Vient de</span><ul>${f.vientDe.map((v) => `<li>${enLigne(v)}</li>`).join('')}</ul>` : ''}</li>`).join('\n')}
    </ul>`;
}

/** Les sections du parcours, le sommaire collant qui les relie, et ce que la page doit charger de script. */
function blocParcours(produit, ctx) {
  const pc = produit.parcours;
  const sections = pc.sections || [];
  const preuves = (pc.preuves || []).filter((x) => {
    if (x.preuve) return true;
    console.error(`  chiffre ignoré — pas de preuve : ${x.valeur} ${x.libelle}`);
    return false;
  });
  const haut = [];
  if (pc.comparaison) haut.push(`  <section class="avant-apres" aria-label="${echapper(pc.comparaison.titre || 'Comparaison')}">
    ${pc.comparaison.titre ? `<h2>${echapper(pc.comparaison.titre)}</h2>` : ''}
    ${tableauParcours({ colonnes: pc.comparaison.colonnes, lignes: pc.comparaison.lignes })}
  </section>`);
  if (preuves.length) haut.push(`  <section class="preuves" aria-label="En chiffres"><ul>
${preuves.map((x) => `    <li><b>${echapper(x.valeur)}</b><span>${enLigne(x.libelle)}</span><em>${enLigne(x.preuve)}</em></li>`).join('\n')}
  </ul></section>`);

  const rendues = sections.map((s) => {
    const intro = s.intro ? `<p>${enLigne(s.intro)}</p>` : '';
    const demo = s.demo ? figureParcours(s.demo, ctx) : '';
    return `  <section class="partie" id="${echapper(s.id)}" aria-labelledby="t-${echapper(s.id)}">
    <header class="entete"><h2 id="t-${echapper(s.id)}">${echapper(s.titre)}</h2>${intro}</header>
${demo ? `    <div class="demo-parcours">${demo}</div>\n` : ''}${s.fluxTitre ? `    <h3 class="titre-flux">${echapper(s.fluxTitre)}</h3>${s.fluxTexte ? `<p>${enLigne(s.fluxTexte)}</p>` : ''}\n` : ''}${fluxParcours(s.flux)}
${(s.chapitres || []).map((c, k) => chapitreParcours(c, ctx, `${s.id}-${k + 1}`)).join('\n')}
  </section>`;
  });

  const savoir = (pc.savoir || []).length ? `  <section class="partie" id="savoir" aria-labelledby="t-savoir">
    <header class="entete"><h2 id="t-savoir">${echapper(pc.savoirTitre || 'À savoir avant d’adopter')}</h2>${pc.savoirIntro ? `<p>${enLigne(pc.savoirIntro)}</p>` : ''}</header>
${pc.savoir.map((s) => `    <details class="detail"><summary>${echapper(s.titre)}</summary><div>${(s.paragraphes || []).map((t) => `<p>${enLigne(t)}</p>`).join('')}${(s.liste || []).length ? `<ul class="liste-simple">${s.liste.map((t) => `<li>${enLigne(t)}</li>`).join('')}</ul>` : ''}</div></details>`).join('\n')}
  </section>` : '';

  const journal = (ctx.journal || []);
  const recent = Math.max(1, pc.journalRecent || 5);
  const entree = (e) => `      <div><b>${echapper(e.version)}</b><p>${enLigne(e.texte)}</p></div>`;
  const nouveautes = journal.length ? `  <section class="partie" id="nouveautes" aria-labelledby="t-nouveautes">
    <header class="entete"><h2 id="t-nouveautes">Nouveautés</h2></header>
    <div class="journal">
${journal.slice(0, recent).map(entree).join('\n')}
    </div>
${journal.length > recent ? `    <details class="detail"><summary>Toutes les versions (${journal.length})</summary><div class="journal">
${journal.slice(recent).map(entree).join('\n')}
    </div></details>\n` : ''}  </section>` : '';

  const ancres = [
    ...sections.map((s) => ({ id: s.id, libelle: s.court || s.titre })),
    ...(savoir ? [{ id: 'savoir', libelle: 'À savoir' }] : []),
    ...(nouveautes ? [{ id: 'nouveautes', libelle: 'Nouveautés' }] : []),
  ];
  const nav = ancres.length ? `  <nav class="ancres" aria-label="Dans cette page">${ancres.map((a) => `<a href="#${echapper(a.id)}">${echapper(a.libelle)}</a>`).join('')}</nav>` : '';
  const toutes = [...haut, ...rendues, savoir, nouveautes].filter(Boolean);
  const html = toutes.join('\n');
  return { nav, sections: toutes, html };
}

const CSS_PARCOURS = `
.statut { display: flex; flex-wrap: wrap; gap: .4rem 1.4rem; font-size: .88rem; color: var(--plume); margin: -1.6rem 0 2.4rem; }
.statut b { color: var(--encre); font-weight: 600; }
.ancres { position: sticky; top: 0; z-index: 20; display: flex; gap: .3rem; overflow-x: auto; scrollbar-width: none; margin: 0 -1.5rem 2rem; padding: .35rem 1.5rem;
  background: color-mix(in srgb, var(--papier) 92%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--filet); }
.ancres::-webkit-scrollbar { display: none; }
.ancres a { white-space: nowrap; text-decoration: none; font-size: .9rem; color: var(--plume); padding: .45rem .8rem; border-radius: 999px; min-height: 2.5rem; display: inline-flex; align-items: center; }
.ancres a:hover { background: var(--filet); color: var(--encre); }
.partie { margin: 0; padding: 3.2rem 0 .5rem; scroll-margin-top: 4rem; }
.entete { max-width: 44rem; margin-bottom: 1.8rem; } .entete h2 { font-size: clamp(1.5rem, 3.4vw, 2rem); margin-bottom: .6rem; } .entete p { font-size: 1.02rem; margin: 0; }
.avant-apres, .preuves { margin: 0 0 2.6rem; padding: 0; }
.comparaison { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--filet); font-size: .93rem; }
.comparaison caption { text-align: left; font-weight: 600; padding-bottom: .5rem; }
.comparaison th, .comparaison td { text-align: left; padding: .7rem 1rem; border-bottom: 1px solid var(--filet); vertical-align: top; font-weight: 400; }
.comparaison thead th { background: var(--papier); font-size: .78rem; letter-spacing: .08em; text-transform: uppercase; color: var(--plume); font-weight: 600; }
.comparaison tbody th { color: var(--plume); } .comparaison td:last-child { color: var(--encre); font-weight: 500; }
.preuves ul { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 1rem; margin: 0; padding: 0; list-style: none; }
.preuves li { background: var(--surface); border: 1px solid var(--filet); border-radius: 14px; padding: 1rem 1.1rem; }
.preuves b { display: block; font-family: var(--display-f, inherit); font-weight: 500; font-size: 1.9rem; line-height: 1.1; color: var(--encre); }
.preuves span { display: block; font-size: .88rem; color: var(--plume); margin-top: .3rem; } .preuves em { display: block; font-size: .76rem; color: var(--plume); margin-top: .5rem; font-style: normal; }
.chap { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 2.4rem; align-items: start; padding: 2.2rem 0; border-top: 1px solid var(--filet); }
.chap.haut { display: block; } .chap.inverse .dit { order: 2; } .chap > .detail, .chap > .pleine { grid-column: 1 / -1; }
.chap > .pleine:empty { display: none; }
.chap .dit { max-width: 46rem; } .chap .dit h3 { font-size: 1.45rem; margin-bottom: .7rem; }
.chap .num { display: block; font-size: .78rem; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); font-weight: 600; margin-bottom: .5rem; }
.chap .dit p { font-size: .97rem; }
.chap .pourquoi { font-size: .93rem; padding-left: .9rem; border-left: 3px solid var(--accent); color: var(--encre); }
.chap .liens { display: flex; flex-wrap: wrap; gap: .6rem; margin: 1rem 0 0; }
.chap .lien { color: var(--accent); }
.chap figure { margin: 0; } .chap figure img { width: 100%; height: auto; display: block; border: 1px solid var(--filet); border-radius: 12px; } .chap figcaption { font-size: .82rem; color: var(--plume); margin-top: .5rem; }
.chap .montre figure.vivante .cadre { aspect-ratio: 1200 / 760; }
.demo-parcours { margin: 0 0 1rem; } .demo-parcours figure { margin: 0; } .demo-parcours figcaption { font-size: .85rem; color: var(--plume); margin-top: .5rem; }
.demo-parcours .cadre { aspect-ratio: 16 / 9; }
.detail { background: var(--surface); border: 1px solid var(--filet); border-radius: 12px; margin: 1rem 0 .6rem; }
.detail > summary { cursor: pointer; padding: .9rem 1.1rem; font-weight: 600; list-style: none; display: flex; justify-content: space-between; align-items: center; min-height: 2.75rem; }
.detail > summary::-webkit-details-marker { display: none; } .detail > summary::after { content: "+"; color: var(--accent); font-size: 1.3rem; line-height: 1; } .detail[open] > summary::after { content: "−"; }
.detail > div { padding: 0 1.1rem 1rem; } .detail h4 { margin: .8rem 0 .2rem; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; color: var(--plume); font-weight: 600; } .detail h4:first-child { margin-top: 0; }
.detail p, .detail li { font-size: .93rem; } .detail .comparaison { margin-top: .4rem; }
.liste-simple { margin: 0 0 .6rem; padding-left: 1.2rem; color: var(--plume); } .liste-simple li { margin-bottom: .35rem; }
.flux { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; margin: 0 0 1.4rem; padding: 0; list-style: none; }
.flux > li { background: var(--surface); border: 1px solid var(--filet); border-radius: 14px; padding: 1.1rem 1.2rem; } .flux h3 { font-size: 1.1rem; margin-bottom: .4rem; } .flux p { font-size: .92rem; margin: 0 0 .6rem; }
.flux .d { display: block; font-size: .76rem; letter-spacing: .06em; text-transform: uppercase; color: var(--plume); margin: .7rem 0 .2rem; font-weight: 600; } .flux ul { margin: 0; padding-left: 1.1rem; font-size: .88rem; color: var(--plume); }
.titre-flux { font-size: 1.3rem; margin: 0 0 .4rem; }
main > .chapeau + .annexe-bloc { margin-top: 2.6rem; }
.bloc-code pre { scrollbar-color: #5b5446 #1C1A17; }
.annexe-bloc { margin: 0 0 2.4rem; max-width: 46rem; } .annexe-bloc h2 { font-size: 1.4rem; } .annexe-bloc .bloc-code, .annexe-bloc .comparaison { max-width: 100%; margin: .6rem 0 1rem; } .annexe-bloc .liens { display: flex; flex-wrap: wrap; gap: .6rem; } .annexe-bloc .lien { color: var(--accent); }
.bloc-code { background: #1C1A17; color: #E7DFD0; border-radius: 14px; overflow: hidden; }
.entete-code { display: flex; align-items: center; justify-content: space-between; padding: .55rem .9rem .55rem 1.2rem; border-bottom: 1px solid #3a352d; font-size: .85rem; color: #BDB3A1; }
.copier { min-height: 2.6rem; padding: .35rem .9rem; border-radius: 8px; border: 1px solid #5b5446; background: transparent; color: #F2EDE3; font: inherit; font-size: .85rem; cursor: pointer; } .copier:hover { background: #2c2823; }
.bloc-code pre { margin: 0; padding: 1.1rem 1.2rem; overflow-x: auto; font: 13px/1.6 ui-monospace, Menlo, Consolas, monospace; font-variant-ligatures: none; tab-size: 2; }
.bloc-code code { background: none; border: 0; padding: 0; font-size: inherit; color: inherit; }
.carrousel { margin-top: 1.6rem; position: relative; }
.pistes { display: flex; gap: 1rem; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; overscroll-behavior-x: contain; padding: .2rem 0 .6rem; }
.pistes::-webkit-scrollbar { display: none; }
.pistes::after { content: ""; flex: 0 0 calc(12% - 1rem); }
.diapo { flex: 0 0 88%; scroll-snap-align: start; display: grid; grid-template-columns: 1.6fr 1fr; gap: 1.6rem; padding: 1.2rem; align-items: start; background: var(--surface); border: 1px solid var(--filet); border-radius: 14px; }
.diapo img { opacity: .45; transition: opacity .25s; }
.diapo.actif img, .carrousel:not(.pret) .diapo img { opacity: 1; }
.diapo.tel { grid-template-columns: 14rem 1fr; }
.diapo figure { margin: 0; } .diapo img { border: 1px solid var(--filet); border-radius: 10px; width: 100%; height: auto; display: block; } .diapo.tel img { width: auto; max-height: 30rem; margin: 0 auto; }
.diapo figcaption { font-size: .8rem; color: var(--plume); margin-top: .5rem; }
.diapo h4 { font-family: var(--display-f, inherit); font-weight: 500; font-size: 1.3rem; line-height: 1.2; margin: 0 0 .7rem; text-wrap: balance; } .diapo p { font-size: .95rem; }
.etiquettes { display: flex; flex-wrap: wrap; gap: .35rem; list-style: none; margin: .8rem 0 0; padding: 0; } .etiquettes li { font-size: .74rem; border: 1px solid var(--filet); border-radius: 999px; padding: .1rem .55rem; color: var(--plume); }
.prec, .suiv { position: absolute; top: 38%; z-index: 3; width: 3.2rem; height: 3.2rem; border-radius: 50%; border: 1px solid var(--filet); background: var(--surface); color: var(--encre); font: inherit; font-size: 1.4rem; line-height: 1; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.2); }
.prec { left: -1.2rem; } .suiv { right: -1.2rem; } .prec:hover:not(:disabled), .suiv:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); } .prec:disabled, .suiv:disabled { opacity: 0; pointer-events: none; }
.carrousel:not(.pret) .prec, .carrousel:not(.pret) .suiv { display: none; }
.commandes { display: flex; align-items: center; gap: .8rem; margin-top: .4rem; }
.compteur { font-variant-numeric: tabular-nums; font-size: .9rem; color: var(--plume); min-width: 3.4rem; }
.sommaire { display: flex; flex-wrap: nowrap; gap: .35rem; margin: 0; padding: .2rem 0; list-style: none; flex: 1 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: thin; position: relative; }
.sommaire button { white-space: nowrap; font: inherit; font-size: .78rem; min-height: 2.2rem; padding: .2rem .7rem; border-radius: 999px; border: 1px solid var(--filet); background: none; color: var(--plume); cursor: pointer; }
.sommaire button:hover { border-color: var(--encre); color: var(--encre); } .sommaire button[aria-current="true"] { background: var(--encre); color: var(--papier); border-color: var(--encre); }
@media (prefers-reduced-motion: reduce) { .diapo img { transition: none; } }
@media (max-width: 52rem) {
  .chap { grid-template-columns: minmax(0, 1fr); gap: 1.2rem; } .chap.inverse .dit { order: 0; }
  .diapo, .diapo.tel { grid-template-columns: 1fr; gap: 1rem; flex-basis: 90%; } .pistes::after { flex-basis: calc(10% - 1rem); } .diapo.tel img { max-height: 24rem; }
  .prec { left: .3rem; } .suiv { right: .3rem; } .prec, .suiv { width: 2.9rem; height: 2.9rem; }
}
`;

/** Le style d'un contexte qui défile à l'horizontale : ajouté seulement aux pages qui en ont un (le reste de la page ne le paie pas). */
const CSS_CONTEXTE_CARROUSEL = `
/* Un contexte qui défile à l'horizontale : le texte au-dessus, les diapositives dessous sur toute la largeur. */
@media (min-width: 52rem) { .contexte.avec-carrousel { grid-template-columns: minmax(0, 1fr); } }
.contexte.avec-carrousel .montre { min-width: 0; }
.contexte.avec-carrousel .dit { max-width: 46rem; }
.contexte.avec-carrousel .carrousel { margin-top: .4rem; }
.contexte.avec-carrousel .pistes { align-items: flex-start; }
/* Une capture large se lit mal dans une colonne : elle prend toute la largeur de la diapositive, le texte dessous. */
.diapo.pano { grid-template-columns: minmax(0, 1fr); gap: 1rem; }
.diapo.pano .texte { max-width: 46rem; }
`;

/**
 * Le thème du visiteur sur une page de vitrine (projects/grist_forms/docs/CADRAGE-THEME-VISITEUR.md). Ajouté UNIQUEMENT aux fiches qui le demandent
 * (`themeVisiteur: true`) : les autres pages ne changent pas d'un octet.
 *
 * Il lit la clé du visiteur, que la page « design system » écrit hors de Grist avec les six variables de la vitrine DÉJÀ calculées pour chaque mode. Il ne croit
 * pas ce cache : couleurs en #rrggbb strict, texte lisible (4,5:1) et accent visible (3:1) sur le papier, sinon il ne pose RIEN. Il pose les six variables en style
 * en ligne sur <html> (aucune règle de plus dans la feuille), suit le mode sombre de la page (même règle que la feuille : préférence du système, sauf
 * `data-theme="light"`), et réagit aux changements faits dans un autre onglet. Sans clé, ou illisible : il ne fait rien.
 */
const JS_VISITEUR = `
<script>
(function () {
  var CLE = 'widgets-grist:theme-visiteur';
  var NOMS = ['--papier', '--surface', '--encre', '--plume', '--filet', '--accent'];
  var HEX = /^#[0-9a-f]{6}$/;
  var posees = [];
  function lum(h) {
    var c = [1, 3, 5].map(function (i) { var x = parseInt(h.slice(i, i + 2), 16) / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function jeu(j) {
    if (!j || typeof j !== 'object') return null;
    var o = {};
    for (var i = 0; i < NOMS.length; i++) { var v = j[NOMS[i]]; if (typeof v !== 'string' || !HEX.test(v)) return null; o[NOMS[i]] = v; }
    if (ratio(o['--encre'], o['--papier']) < 4.5 || ratio(o['--plume'], o['--papier']) < 3 || ratio(o['--accent'], o['--papier']) < 3) return null;
    return o;
  }
  function lire() {
    try {
      var c = JSON.parse(localStorage.getItem(CLE) || 'null');
      return c && c.v === 1 && c.vitrine && typeof c.vitrine === 'object' ? c.vitrine : null;
    } catch (e) { return null; }
  }
  function appliquer() {
    try {
      var racine = document.documentElement;
      posees.forEach(function (n) { racine.style.removeProperty(n); });
      posees = [];
      // La personne passe avant le thème : contraste forcé ou renforcé, rien n'est posé.
      if (matchMedia('(forced-colors: active)').matches || matchMedia('(prefers-contrast: more)').matches) return;
      var v = lire();
      if (!v) return;
      var sombre = matchMedia('(prefers-color-scheme: dark)').matches && racine.getAttribute('data-theme') !== 'light';
      var j = jeu(sombre ? v.sombre : v.clair);
      if (!j) return;
      NOMS.forEach(function (n) { racine.style.setProperty(n, j[n]); posees.push(n); });
    } catch (e) { /* la page garde sa peau */ }
  }
  appliquer();
  try { addEventListener('storage', function (e) { if (e.key === CLE || e.key === null) appliquer(); }); } catch (e) { /* tant pis */ }
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', appliquer); } catch (e) { /* navigateur ancien */ }
}());
</` + `script>`;

/** Le carrousel et le bouton « Copier » : sans ce script, la page reste entierement lisible (toutes les diapositives, le code). */
const JS_PARCOURS = `
<script>
  document.querySelectorAll('.carrousel').forEach(function (c) {
    var piste = c.querySelector('.pistes'), diapos = [].slice.call(piste.querySelectorAll('.diapo')), n = diapos.length;
    var prec = c.querySelector('.prec'), suiv = c.querySelector('.suiv'), cpt = c.querySelector('.compteur'), sommaire = c.querySelector('.sommaire'), puces = [].slice.call(sommaire.querySelectorAll('button'));
    var doux = function () { return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; };
    var courant = function () {
      if (piste.scrollLeft >= piste.scrollWidth - piste.clientWidth - 2) return n - 1;
      var k = 0, d = Infinity;
      diapos.forEach(function (x, j) { var e = Math.abs(x.offsetLeft - piste.offsetLeft - piste.scrollLeft); if (e < d) { d = e; k = j; } });
      return k;
    };
    var aller = function (k) { k = Math.max(0, Math.min(n - 1, k)); piste.scrollTo({ left: diapos[k].offsetLeft - piste.offsetLeft, behavior: doux() }); };
    var maj = function () {
      var k = courant(); cpt.textContent = (k + 1) + ' / ' + n; prec.disabled = k === 0; suiv.disabled = k === n - 1;
      diapos.forEach(function (x, j) { x.classList.toggle('actif', j === k); });
      puces.forEach(function (p, j) {
        if (j === k) { p.setAttribute('aria-current', 'true'); sommaire.scrollTo({ left: p.offsetLeft - sommaire.clientWidth / 2 + p.clientWidth / 2, behavior: 'auto' }); }
        else p.removeAttribute('aria-current');
      });
    };
    prec.addEventListener('click', function () { aller(courant() - 1); });
    suiv.addEventListener('click', function () { aller(courant() + 1); });
    puces.forEach(function (p) { p.addEventListener('click', function () { aller(Number(p.dataset.n)); }); });
    piste.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); aller(courant() + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); aller(courant() - 1); }
    });
    var t; piste.addEventListener('scroll', function () { clearTimeout(t); t = setTimeout(maj, 50); }, { passive: true });
    addEventListener('resize', maj);
    c.classList.add('pret'); maj();
  });
  document.querySelectorAll('.bloc-code').forEach(function (b) {
    var bouton = b.querySelector('.copier'); if (!bouton) return;
    bouton.hidden = false;
    bouton.addEventListener('click', function () {
      var texte = b.querySelector('code').textContent;
      var dit = function (m) { bouton.textContent = m; setTimeout(function () { bouton.textContent = 'Copier'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texte).then(function () { dit('Copié'); }, function () { dit('Sélectionnez le code'); });
      else dit('Sélectionnez le code');
    });
  });
</` + `script>`;


/**
 * Une page annexe d'un produit : `produit.annexes[]` dans `vitrine.json`, rendue sous `w/<projet>/<id>/`.
 *
 * Une annexe porte ce qui encombrerait la page principale (un guide d'integration, par exemple) : `id`, `titre`, `chapeau`, puis des `blocs[]`
 * (`titre`, `paragraphes[]`, `liste[]`, `code`, `tableau` avec `tableauTitre`, `liens[]`). Elle reprend la peau du produit, renvoie a sa page et entre
 * au plan du site. Une fiche sans annexe ne produit aucune page de plus.
 */
function blocAnnexe(b) {
  const liens = (b.liens || []).length ? `<p class="liens">${b.liens.map((l) => `<a class="${l.bouton ? 'bouton creux' : 'lien'}" href="${echapper(l.url)}"${/^https?:/.test(l.url) ? ' target="_blank" rel="noopener"' : ''}>${echapper(l.libelle)}</a>`).join(' ')}</p>` : '';
  return `  <section class="annexe-bloc">
    <h2>${echapper(b.titre)}</h2>
    ${(b.paragraphes || []).map((t) => `<p>${enLigne(t)}</p>`).join('\n    ')}
    ${(b.liste || []).length ? `<ul class="liste-simple">${b.liste.map((t) => `<li>${enLigne(t)}</li>`).join('')}</ul>` : ''}
    ${blocCode(b.code)}
    ${tableauParcours(b.tableau, b.tableauTitre)}
    ${liens}
  </section>`;
}

function rendreAnnexe(p, annexe, base = '') {
  const v = p.presentation;
  const nom = v.nom || p.widgets[0].name || p.id;
  const titre = `${annexe.titre} — ${nom}`;
  const description = annexe.chapeau || v.pitch || '';
  const url = base ? `${base}w/${p.id}/${annexe.id}/` : '';
  const corps = (annexe.blocs || []).map(blocAnnexe).join('\n');
  return page({
    titre,
    description,
    accent: v.couleur,
    peau: v.peau,
    meta: url ? entete({ url, titre, description, image: '' }) : '',
    css: CSS_PROJET + CSS_PRODUIT + CSS_PARCOURS,
    corps: `<main>
  <a class="retour" href="../">← ${echapper(nom)}</a>
  <p class="eyebrow">${echapper(nom)}</p>
  <h1>${echapper(annexe.titre)}</h1>
  ${annexe.chapeau ? `<p class="chapeau">${enLigne(annexe.chapeau)}</p>` : ''}
${corps}
</main>${corps.includes('class="bloc-code"') ? JS_PARCOURS : ''}
<footer class="pied">
  <p><a href="../">← Retour à la page d’${echapper(nom)}</a></p>
</footer>`,
  });
}

/** Les annexes declarees par la fiche d'un projet, celles qui ont de quoi etre rendues (un identifiant et un titre). */
function annexesDe(p) {
  return ((p.presentation.produit || {}).annexes || []).filter((a) => a && a.id && a.titre && /^[a-z0-9-]+$/.test(a.id));
}

/** Le style des blocs produit, et les revelations au defilement. */
const CSS_PRODUIT = `
.chiffres { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  padding: 1.6rem 0; border-top: 1px solid var(--filet); border-bottom: 1px solid var(--filet); }
.chiffres b { display: block; font-family: var(--display-f, inherit); font-size: 2rem;
  line-height: 1; color: var(--accent); font-weight: 500; }
.chiffres span { font-size: .88rem; color: var(--plume); }
.contexte { display: grid; gap: 1.4rem; margin-bottom: 2.8rem;
  grid-template-columns: minmax(0, 1fr); }
@media (min-width: 52rem) { .contexte { grid-template-columns: 17rem minmax(0, 1fr); gap: 2.2rem; } }
.contexte h3 { font-size: 1.12rem; margin-bottom: .4rem; }
.contexte p { font-size: .94rem; margin: 0 0 .7rem; }
.contexte .role { font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; color: var(--accent); margin: 0 0 .3rem; }
.contexte .exemple { font-size: .86rem; color: var(--plume); margin: .9rem 0 0; padding: .6rem .8rem; background: var(--filet); border-radius: 8px; }
.contexte .exemple b { color: var(--encre); font-weight: 600; margin-right: .3rem; }
.contexte .utilise { list-style: none; display: flex; flex-wrap: wrap; gap: .3rem; padding: 0; margin: .9rem 0 0; }
.contexte .utilise li { font-size: .74rem; padding: .1rem .55rem; border: 1px solid var(--filet); border-radius: 999px; color: var(--plume); }
/* Ce que ce contexte apporte que les autres n'apportent pas : c'est la seule
   raison de montrer une capture de plus. */
.contexte .pourquoi { font-size: .88rem; padding-left: .85rem;
  border-left: 2px solid var(--accent); margin-bottom: 0; }
.contexte figure { margin: 0 0 1rem; }
.contexte .large img { width: 100%; height: auto; display: block; border-radius: 12px;
  border: 1px solid var(--filet); }
.contexte figcaption { font-size: .85rem; color: var(--plume); margin-top: .6rem; }
.telephones { display: grid; gap: 1.6rem; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); }
/* Un cadre : sans lui, une capture verticale se lit comme une image mal recadree. */
/* Un téléphone n'est pas plus large qu'un téléphone : seul dans sa colonne, il ne s'étire pas. */
.telephone { max-width: 17rem; }
.telephone .ecran { border: 8px solid var(--encre); border-radius: 26px; overflow: hidden;
  background: var(--encre); box-shadow: 0 10px 30px rgba(0,0,0,.18); }
/* Le cadre suit l image, au lieu de lui imposer un rapport : une capture prise
   sur un autre appareil se trouvait rognee, et c est le haut de l ecran — la
   barre du produit — qui disparaissait. */
.telephone .ecran img { width: 100%; height: auto; display: block; }
.telephone figcaption { text-align: center; }
.sequence ol { list-style: none; counter-reset: pas; padding: 0; margin: 0;
  display: grid; gap: 1.2rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }
.sequence li { counter-increment: pas; padding-top: 2.6rem; position: relative; }
.sequence li::before { content: counter(pas); position: absolute; top: 0; left: 0;
  width: 1.9rem; height: 1.9rem; border-radius: 50%; display: grid; place-items: center;
  font-size: .85rem; font-weight: 600; color: #fff; background: var(--accent); }
.sequence li b { display: block; margin-bottom: .3rem; }
.sequence li p { font-size: .93rem; margin: 0; }
.facons .groupes { display: grid; gap: 2rem 2.6rem; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 52rem) { .facons .groupes { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.facons h3 { font-size: 1.12rem; margin-bottom: .4rem; }
.groupe-points { font-size: 1rem; margin: 1.4rem 0 .6rem; color: var(--plume); font-weight: 600; }
.facons .intro { font-size: .92rem; color: var(--plume); margin: 0 0 .9rem; }
.facons ul { list-style: none; padding: 0; margin: 0; }
.facons li { padding: .8rem 0; border-top: 1px solid var(--filet); }
.facons li p { font-size: .9rem; margin: .25rem 0 0; }
.facons .porte { display: flex; flex-wrap: wrap; align-items: baseline; gap: .3rem .6rem; }
/* Ou la porte tourne : c'est ce qui decide laquelle choisir. */
.facons .ou { font-size: .72rem; letter-spacing: .04em; text-transform: uppercase;
  color: var(--accent); border: 1px solid currentColor; border-radius: 999px; padding: .05rem .5rem; }
.contexte code, .sequence code, .facons code, .journal code, .mention code { font-size: .88em; padding: .05em .3em;
  border-radius: 4px; background: var(--filet); overflow-wrap: anywhere; }
/* La revelation accompagne le defilement ; elle ne le commande pas. */
.reveler { opacity: 0; transform: translateY(14px);
  transition: opacity .5s ease, transform .5s ease; }
.reveler.vu { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .reveler { opacity: 1; transform: none; transition: none; }
}
`;

/**
 * Le script de revelation.
 *
 * Sans JavaScript — ou s'il echoue — les blocs doivent rester lisibles : ils
 * sont donc reveles des le chargement par ce meme script, qui n'a plus qu'a
 * retarder ceux qu'on n'a pas encore atteints. Une page dont le contenu depend
 * d'une animation est une page vide pour qui ne l'execute pas.
 */
const JS_REVELER = `
<script>
  (function () {
    var blocs = document.querySelectorAll('.reveler');
    if (!('IntersectionObserver' in window)) {
      blocs.forEach(function (b) { b.classList.add('vu'); });
      return;
    }
    var o = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('vu'); o.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    blocs.forEach(function (b) { o.observe(b); });
  })();
</` + `script>`;

/* ------------------------------------------------------------------ */
/* La page d'un projet                                                 */
/* ------------------------------------------------------------------ */

const CSS_PROJET = `
.retour { display: inline-block; font-size: .88rem; color: var(--plume);
  text-decoration: none; margin-bottom: 2rem; }
.retour:hover { color: var(--accent); }
.chapeau { font-size: 1.15rem; line-height: 1.55; color: var(--encre);
  max-width: 40rem; margin: 1rem 0 0; }
.accroche { max-width: 40rem; margin: .8rem 0 0; font-size: 1rem; }
.boutons { display: flex; flex-wrap: wrap; gap: .7rem; margin: 2rem 0 3rem; }
.bouton { display: inline-block; padding: .8rem 1.3rem; border-radius: 10px;
  font-size: .95rem; font-weight: 600; text-decoration: none;
  background: var(--accent); color: #fff; border: 1px solid var(--accent); }
.bouton.creux { background: none; color: var(--encre); border-color: var(--filet);
  font-weight: 500; }
.bouton.creux:hover { border-color: var(--accent); }
section { margin: 0 0 3rem; }
.liste { display: flex; flex-direction: column; gap: .6rem; }
.vue { display: flex; gap: 1rem; align-items: baseline; padding: .9rem 1.1rem;
  background: var(--surface); border: 1px solid var(--filet); border-radius: 10px; }
.vue b { font-weight: 600; min-width: 8.5rem; }
.vue span { color: var(--plume); font-size: .9rem; flex: 1; }
.vue a { font-size: .82rem; color: var(--accent); text-decoration: none;
  white-space: nowrap; }
/* Une version precedente reste atteignable — son adresse vit dans des
   documents — mais elle ne se presente plus comme le chemin a prendre. */
.vue.passee { opacity: .62; }
.vue.passee em { font-style: normal; font-weight: 400; font-size: .78rem;
  color: var(--plume); }
.points { list-style: none; padding: 0; margin: 0; display: grid; gap: .8rem;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); }
.points li { padding-left: 1.1rem; position: relative; color: var(--plume);
  line-height: 1.55; }
.points li::before { content: ''; position: absolute; left: 0; top: .55em;
  width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
.points li b { color: var(--encre); font-weight: 600; }
.journal { border-left: 2px solid var(--filet); padding-left: 1.2rem; }
.journal div { margin-bottom: 1.1rem; }
.journal b { font-family: ui-monospace, Menlo, monospace; font-size: .85rem; }
.journal p { margin: .2rem 0 0; font-size: .92rem; }
.encart { background: var(--surface); border: 1px solid var(--filet);
  border-left: 3px solid var(--accent); border-radius: 10px; padding: 1.3rem 1.4rem; }
.encart h2 { font-size: 1.2rem; margin-bottom: .5rem; }
.apercu { margin-top: 0; }
.cadre { position: relative; border: 1px solid var(--filet); border-radius: 12px;
  overflow: hidden; background: var(--surface); aspect-ratio: 1200 / 630; }
.cadre img { display: block; width: 100%; height: 100%; object-fit: cover; }
.cadre iframe { display: block; width: 100%; height: 100%; border: 0; }
.cadre.vivant { aspect-ratio: auto; height: 70vh; min-height: 26rem; }
/* Une demonstration d'application (figure vivante) a besoin de largeur : la colonne de la page la ferait tenir sur un telephone, carte
   hors de vue. Lancee, elle passe au premier plan, presque plein ecran, et se referme (bouton ou Echap). */
.cadre.plein { position: fixed; inset: 3vh 3vw; z-index: 60; height: auto; min-height: 0; border-radius: 10px; background: #fff; display: flex; flex-direction: column;
  box-shadow: 0 0 0 100vmax rgba(20, 16, 12, .62); }
.cadre.plein iframe { flex: 1; min-height: 0; height: auto; }
.barre { flex: none; display: flex; align-items: center; justify-content: space-between; gap: .8rem; padding: .4rem .6rem .4rem .9rem; border-bottom: 1px solid #ddd5c8;
  background: #fff; color: #1f2933; font-size: .85rem; border-radius: 10px 10px 0 0; }
.fermer { flex: none; min-height: 44px; padding: .35rem 1rem; border: 1px solid #1f2933; border-radius: 6px; background: #fff; color: #1f2933; font: inherit; font-size: .85rem; cursor: pointer; }
.fermer:hover { background: #eef2f6; }
.lancer { position: absolute; inset: 0; margin: auto; width: max-content; height: max-content;
  padding: .8rem 1.4rem; border-radius: 999px; border: 0; cursor: pointer;
  font: inherit; font-weight: 600; color: #fff; background: var(--accent);
  box-shadow: 0 6px 24px rgba(0,0,0,.28); }
.lancer:hover { filter: brightness(1.08); }
.mention { font-size: .85rem; margin-top: .7rem; }
`;

/**
 * L'image d'apercu d'un projet, si elle existe.
 *
 * Une capture du widget en fonctionnement : elle sert deux fois — en tete de la
 * page, et comme vignette quand le lien est partage. Sans elle, un lien colle
 * sur un forum n'affiche qu'un titre.
 *
 * PNG pour les interfaces (aplats, texte net), JPEG quand la capture est une
 * carte : le meme rendu 3D pesait 1,3 Mo en PNG contre 350 Ko en JPEG, pour une
 * difference invisible a l'oeil.
 */
function apercuDe(id) {
  // `jpeg` en dernier : un widget qui a deja un png ou un jpg garde le sien,
  // et une capture enregistree en .jpeg cesse d'etre ignoree en silence.
  for (const ext of ['png', 'jpg', 'jpeg']) {
    if (fs.existsSync(path.join(PUBLIE, 'w', id, `apercu.${ext}`))) return `apercu.${ext}`;
  }
  return '';
}

/**
 * Un cadre : une image, et le widget derriere si on le demande.
 *
 * Le widget n'est pas charge d'emblee — une carte tire une bibliotheque, des
 * tuiles et un rendu 3D, et l'imposer a qui passe lire une page serait le faire
 * payer pour rien. L'image tient lieu d'apercu, le clic lance, a cet instant
 * seulement.
 */
function cadre({ url, image, alt, libelle = 'Lancer l’aperçu', titre = '' }) {
  return `    <div class="cadre" data-widget="${echapper(url)}"${titre ? ` data-titre="${echapper(titre)}"` : ''}>
      <img src="${echapper(image)}" alt="${echapper(alt)}" loading="lazy">
      <button type="button" class="lancer">${echapper(libelle)}</button>
    </div>`;
}

/**
 * Le script qui anime les cadres, pose une fois par page.
 *
 * Il vivait dans la section d'apercu ; une demonstration placee ailleurs — dans
 * un contexte, plus bas — se serait donc retrouvee sans lui le jour ou la page
 * n'a pas d'apercu en tete.
 */
const JS_CADRES = `
<script>
  function armer(cadre) {
    var bouton = cadre.querySelector('.lancer');
    if (!bouton) return;
    var origine = cadre.innerHTML;
    var grand = !!cadre.closest('figure.vivante');
    bouton.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = cadre.dataset.widget;
      f.title = 'Aperçu';
      f.loading = 'lazy';
      f.allow = 'fullscreen';
      cadre.innerHTML = '';
      cadre.appendChild(f);
      cadre.classList.add('vivant');
      if (!grand) return;
      cadre.classList.add('plein');
      var barre = document.createElement('div'); barre.className = 'barre';
      var libelleDemo = cadre.dataset.titre || 'Démonstration, données fictives';
      var titre = document.createElement('span'); titre.textContent = libelleDemo; barre.appendChild(titre);
      f.title = libelleDemo; cadre.setAttribute('role', 'dialog'); cadre.setAttribute('aria-modal', 'true'); cadre.setAttribute('aria-label', libelleDemo);
      var garde = function (e) { if (!cadre.contains(e.target)) x.focus(); };   // tant que la démonstration est ouverte, le focus ne sort pas du cadre
      document.addEventListener('focusin', garde);
      var x = document.createElement('button');
      x.type = 'button'; x.className = 'fermer'; x.textContent = 'Fermer';
      barre.appendChild(x);
      x.addEventListener('click', function () {
        cadre.classList.remove('vivant', 'plein');
        cadre.removeAttribute('role'); cadre.removeAttribute('aria-modal'); cadre.removeAttribute('aria-label');
        document.removeEventListener('focusin', garde);
        cadre.innerHTML = origine;
        armer(cadre);
        var relancer = cadre.querySelector('.lancer'); if (relancer) relancer.focus();   // le focus revient au bouton qui a ouvert la démonstration
      });
      cadre.insertBefore(barre, f);
      x.focus();
    });
  }
  document.querySelectorAll('.cadre').forEach(armer);
  document.addEventListener('keydown', function (e) {
    var x = e.key === 'Escape' && document.querySelector('.cadre.plein .fermer');
    if (x) x.click();
  });
</` + `script>`;

/**
 * L'apercu en tete de page.
 *
 * Il montre le widget seul, et c'est deliberé : une page publique ne doit pas
 * dependre d'un document de travail, dont les droits, le contenu ou l'existence
 * peuvent changer sans qu'elle le sache. Une fiche peut viser une autre adresse
 * si elle en a une qui lui appartient.
 */
function sectionApercu(p, image) {
  if (!image) return '';
  // Celui qu'on met en avant, pas le premier venu du manifeste : sur
  // qgis2grist, l'apercu lancait la v1 que la page annonce comme depassee.
  const principal = principalDe(p);
  const demo = (p.presentation.produit || {}).apercu || {};
  const url = demo.url || `${principal.url}${principal.url.includes('?') ? '&' : '?'}vitrine=1`;
  const mention = demo.mention
    || 'L’aperçu s’exécute dans votre navigateur, sans document Grist : les données y sont fictives.';
  return `  <section class="apercu">
${cadre({ url, image, alt: `Aperçu du widget ${p.presentation.nom || p.id}` })}
    <p class="mention">${enLigne(mention)}</p>
  </section>`;
}

/**
 * La demonstration : le widget avec de vraies donnees.
 *
 * L'apercu de tete montre le widget SEUL, sans document — c'est deliberé, une
 * page publique ne doit pas dependre d'un document de travail. Mais un widget
 * vide ne dit pas ce qu'il sait faire : il faut une scene, et une scene reelle.
 *
 * D'ou un second cadre, plus bas, apres que la page a explique de quoi il
 * retourne. Il tire une scene publiee sous `published/`, donc rien qui puisse
 * disparaitre sans qu'on le sache. Le script des cadres (`JS_CADRES`) etait
 * ecrit pour ce second usage bien avant qu'il existe.
 *
 * Deux gardes, parce qu'une demonstration cassee est pire qu'une absente : la
 * page la propose, on clique, et on juge le widget sur un cadre vide.
 */
function sectionDemo(p, racine) {
  const d = (p.presentation.produit || {}).demonstration;
  if (!d || !d.url || !d.image) return '';
  const img = path.join(racine, 'w', p.id, d.image);
  if (!fs.existsSync(img)) {
    console.error(`  demonstration ignoree — image absente : w/${p.id}/${d.image}`);
    return '';
  }
  // L'URL de scene doit pointer sur un fichier reellement publie.
  const m = /[?&]scene=([^&]+)/.exec(d.url);
  if (m) {
    const cible = decodeURIComponent(m[1]).replace(/^\.?\//, '');
    const local = cible.startsWith('http') ? null : path.join(racine, cible);
    if (local && !fs.existsSync(local)) {
      console.error(`  demonstration ignoree — scene absente : ${cible}`);
      return '';
    }
  }
  return `  <section class="demo">
    <h2>${echapper(d.titre || 'La démonstration')}</h2>
${d.texte ? `    <p>${echapper(d.texte)}</p>
` : ''}${cadre({
    url: d.url, image: d.image, alt: d.alt || `Démonstration de ${p.presentation.nom || p.id}`,
    libelle: d.libelle || 'Ouvrir la démonstration',
  })}
${d.mention ? `    <p class="mention">${enLigne(d.mention)}</p>` : ''}
  </section>`;
}

/**
 * Le widget mis en avant.
 *
 * Ce n'est pas forcement le premier du manifeste : une v2 y arrive apres la v1
 * qu'elle remplace, sans que l'ordre le dise. Et l'URL de la v1 ne peut pas
 * etre reprise — elle est enregistree dans des documents. C'est donc la fiche
 * qui designe ce qu'on montre d'abord.
 */
function principalDe(p) {
  const vise = p.presentation && p.presentation.principal;
  return p.widgets.find((w) => w.widgetId === vise) || p.widgets[0];
}

/** Les vues qu'on ne met plus en avant, sans les retirer : leur URL vit ailleurs. */
function estArchive(p, w) {
  const liste = (p.presentation && p.presentation.archives) || [];
  return liste.includes(w.widgetId);
}

/** Une vue du projet, avec l'adresse a coller dans Grist. */
function ligneWidget(w, archive = false) {
  return `      <div class="vue${archive ? ' passee' : ''}">
        <b>${echapper(w.name)}${archive ? ' <em>version précédente</em>' : ''}</b>
        <span>${echapper(w.description || '')}</span>
        <a href="${echapper(w.url)}" target="_blank" rel="noopener">ouvrir</a>
      </div>`;
}

/**
 * Les boutons du haut de page. Sans `parcours.cta`, l'unique bouton d'avant (« Ouvrir le widget ») ; avec, ceux de la fiche : une ancre,
 * une adresse, ou `widget: true` pour le widget mis en avant. Le premier est plein, les autres creux.
 */
function boutonsParcours(parcours, principal) {
  const cta = (parcours && parcours.cta) || [];
  if (!cta.length) return `<a class="bouton" href="${echapper(principal.url)}" target="_blank" rel="noopener">Ouvrir le widget</a>`;
  return cta.map((b, i) => {
    const externe = b.widget || /^https?:/.test(b.url || '');
    const href = b.widget ? principal.url : (b.ancre ? `#${b.ancre}` : (b.url || '#'));
    return `<a class="bouton${i ? ' creux' : ''}" href="${echapper(href)}"${externe ? ' target="_blank" rel="noopener"' : ''}>${echapper(b.libelle)}</a>`;
  }).join('\n    ');
}

function rendreProjet(p, maintenant, base = '') {
  const v = p.presentation;
  const maj = majProjet(p);
  const nom = v.nom || p.widgets[0].name || p.id;
  const principal = principalDe(p);
  const acces = principal.accessLevel === 'full' ? 'lecture et écriture'
    : principal.accessLevel === 'read table' ? 'lecture seule' : 'aucun accès aux données';

  const image = apercuDe(p.id);
  const produit = v.produit || {};
  const sections = [];

  // Une fiche qui declare un `parcours` est presentee par usage : les blocs par fonction ne sont alors pas rendus (leurs champs sont
  // ceux d'une autre page). Une fiche sans parcours garde exactement la page qu'elle avait.
  const parcours = produit.parcours;
  const rendu = parcours ? blocParcours(produit, { racine: path.join(PUBLIE, 'w', p.id), journal: v.journal || [] }) : null;
  if (rendu) {
    sections.push(...rendu.sections);
  } else {
    const ap = sectionApercu(p, image);
    if (ap) sections.push(ap);
    for (const bloc of [blocChiffres(produit), blocContextes(produit, path.join(PUBLIE, 'w', p.id))]) if (bloc) sections.push(bloc);

    const dm = sectionDemo(p, PUBLIE);
    if (dm) sections.push(dm);

    if ((v.points || []).length) sections.push(blocPoints(v.points));

    if (p.widgets.length > 1) {
      sections.push(`  <section>
      <h2>Les vues</h2>
      <div class="liste">
  ${p.widgets.map((w) => ligneWidget(w, estArchive(p, w))).join('\n')}
      </div>
    </section>`);
    }

    const seq = blocSequence(produit);
    if (seq) sections.push(seq);
    const fc = blocFacons(produit);
    if (fc) sections.push(fc);

    if (v.encart) {
      sections.push(`  <section>
      <div class="encart">
        <h2>${echapper(v.encart.titre)}</h2>
        <p>${echapper(v.encart.texte)}</p>
        ${v.encart.lien ? `<a class="bouton" href="${echapper(v.encart.lien.url)}">${echapper(v.encart.lien.libelle)}</a>` : ''}
      </div>
    </section>`);
    }

    if ((v.journal || []).length) {
      sections.push(`  <section>
      <h2>Journal</h2>
      <div class="journal">
  ${v.journal.map((e) => `      <div><b>${echapper(e.version)}</b><p>${enLigne(e.texte)}</p></div>`).join('\n')}
      </div>
    </section>`);
    }
  }

  const titre = `${nom} — widget Grist`;
  const description = v.pitch || principal.description || '';
  const url = base ? `${base}w/${p.id}/` : '';
  return page({
    titre,
    description,
    accent: v.couleur,
    peau: v.peau,
    meta: url ? entete({ url, titre, description, image }) : '',
    ld: url ? donneesStructurees({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: nom,
      description,
      url,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'fr',
      // Gratuit, et dit comme tel plutot que laisse a deviner.
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      ...(v.depot ? { codeRepository: v.depot } : {}),
      ...(maj ? { dateModified: maj.slice(0, 10) } : {}),
    }) : '',
    // Le style des diapositives est celui des parcours : il suit dès qu'un contexte défile à l'horizontale.
    scriptEntete: v.themeVisiteur === true ? JS_VISITEUR : '',
    css: CSS_PROJET + (Object.keys(produit).length ? CSS_PRODUIT : '')
      + ((parcours || (produit.contextes || []).some((c) => c.carrousel)) ? CSS_PARCOURS : '')
      + ((produit.contextes || []).some((c) => c.carrousel) ? CSS_CONTEXTE_CARROUSEL : ''),
    corps: `<main>
  <a class="retour" href="../../">← Tous les widgets</a>
  <p class="eyebrow">${echapper((parcours && parcours.eyebrow) || 'Widget Grist')}</p>
  <h1>${echapper(nom)}</h1>
  <p class="chapeau">${echapper(v.pitch || principal.description || '')}</p>
  ${produit.accroche ? `<p class="accroche">${echapper(produit.accroche)}</p>` : ''}
  ${(v.tags || []).length ? `<div class="tags">${v.tags.map((t) => `<span class="tag">${echapper(t)}</span>`).join('')}</div>` : ''}
  <div class="faits">
    <span><b>${p.widgets.length}</b> widget${p.widgets.length > 1 ? 's' : ''}</span>
    <span>Accès <b>${echapper(acces)}</b></span>
    ${maj ? `<span>${estRecent(maj, maintenant) ? '<span class="vif"></span>' : ''}Mis à jour ${echapper(depuis(maj, maintenant))}</span>` : ''}
  </div>
  <div class="boutons">
    ${boutonsParcours(parcours, principal)}
    ${v.depot ? `<a class="bouton creux" href="${echapper(v.depot)}" target="_blank" rel="noopener">Le code</a>` : ''}
    ${v.forum ? `<a class="bouton creux" href="${echapper(v.forum.url)}" target="_blank" rel="noopener"
       title="${echapper(v.forum.titre || '')}">En discuter</a>` : ''}
  </div>
${parcours && (parcours.statut || []).length ? `  <p class="statut">${parcours.statut.map((x) => `<span><b>${echapper(x.niveau)}</b> ${echapper(x.texte || '')}</span>`).join('')}</p>\n` : ''}${rendu ? `${rendu.nav}\n` : ''}${sections.join('\n')}
</main>${sections.some((x) => x.includes('class="cadre"')) ? JS_CADRES : ''}${sections.some((x) => x.includes('class="carrousel"') || x.includes('class="bloc-code"')) ? JS_PARCOURS : ''}${Object.keys(produit).length ? JS_REVELER : ''}
<footer class="pied">
  <p>Dans Grist : <em>Ajouter un widget</em> → <em>Custom</em> → collez l’adresse
     <code>${echapper(principal.url)}</code>, et donnez l’accès
     <b>${echapper(acces)}</b>.</p>
</footer>`,
  });
}

/**
 * Le plan du site.
 *
 * Il n'y a pas de `robots.txt` a poser : les moteurs le lisent a la racine du
 * domaine, qui appartient au depot de profil, pas a celui-ci. Le plan reste
 * donc a soumettre une fois dans la console de recherche — apres quoi il se
 * met a jour tout seul a chaque publication.
 *
 * La date de derniere modification est celle du projet, pas celle de la
 * generation : annoncer que tout a change a chaque deploiement apprend a un
 * moteur a ne plus croire ces dates.
 */
function rendreSitemap(projets, base) {
  const pages = [
    { url: base, maj: '' },
    ...projets.flatMap((p) => [
      { url: `${base}w/${p.id}/`, maj: majProjet(p) },
      ...annexesDe(p).map((a) => ({ url: `${base}w/${p.id}/${a.id}/`, maj: majProjet(p) })),
    ]),
  ];
  const lignes = pages.map(({ url, maj }) => [
    '  <url>',
    `    <loc>${echapper(url)}</loc>`,
    maj ? `    <lastmod>${maj.slice(0, 10)}</lastmod>` : '',
    '  </url>',
  ].filter(Boolean).join('\n'));
  return ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...lignes, '</urlset>', ''].join('\n');
}

/* ------------------------------------------------------------------ */
/* Ecriture                                                            */
/* ------------------------------------------------------------------ */

function ecrire(chemin, contenu) {
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  fs.writeFileSync(chemin, contenu);
  return path.relative(PUBLIE, chemin).split(String.fromCharCode(92)).join(String.fromCharCode(47));
}

function generer(maintenant = Date.now()) {
  const brut = JSON.parse(fs.readFileSync(MANIFESTE, 'utf8'));
  const widgets = Array.isArray(brut) ? brut : (brut.widgets || []);
  const projets = grouper(widgets);
  for (const p of projets) p.presentation = presentation(p);

  const base = baseDe(widgets);
  const faits = [ecrire(path.join(PUBLIE, 'index.html'), rendreAccueil(projets, maintenant, base))];
  for (const p of projets) {
    faits.push(ecrire(path.join(PUBLIE, 'w', p.id, 'index.html'), rendreProjet(p, maintenant, base)));
    for (const a of annexesDe(p)) faits.push(ecrire(path.join(PUBLIE, 'w', p.id, a.id, 'index.html'), rendreAnnexe(p, a, base)));
  }
  if (base) faits.push(ecrire(path.join(PUBLIE, 'sitemap.xml'), rendreSitemap(projets, base)));
  return { projets, faits, base };
}

if (require.main === module) {
  const { projets, faits } = generer();
  console.log(`Vitrine — ${projets.length} projets, ${faits.length} pages :`);
  for (const f of faits) console.log('  ' + f);
  const sans = projets.filter((p) => !Object.keys(p.presentation).length).map((p) => p.id);
  if (sans.length) console.log(`\nSans vitrine.json (presentation minimale) : ${sans.join(', ')}`);
}

module.exports = { projetDe, grouper, depuis, majProjet, estRecent, generer, rendreAccueil, rendreProjet, rendreAnnexe, annexesDe, rendreSitemap, baseDe, sectionDemo, dimensionsImage };
