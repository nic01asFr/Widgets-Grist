const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const V = require('./generate-vitrine.js');

const W = (id, url, extra = {}) => ({ widgetId: id, name: id, url, ...extra });

/* ---------- a quel projet appartient un widget ---------- */

test('le projet se lit dans le chemin, apres le nom du depot', () => {
  assert.equal(V.projetDe('https://x.github.io/Widgets-Grist/taskflow/kanban/'), 'taskflow');
  assert.equal(V.projetDe('https://x.github.io/Widgets-Grist/atlas/'), 'atlas');
});

test('une URL inexploitable n’invente pas de projet', () => {
  // Mieux vaut ne pas presenter un widget que de creer une page fantome.
  assert.equal(V.projetDe(''), null);
  assert.equal(V.projetDe('pas une url'), null);
  assert.equal(V.projetDe('https://x.github.io/Widgets-Grist/'), null);
});

test('les widgets d’un meme projet se rangent ensemble, dans l’ordre du manifeste', () => {
  const g = V.grouper([
    W('taskflow', 'https://x.io/r/taskflow/'),
    W('atlas', 'https://x.io/r/atlas/'),
    W('taskflow-gantt', 'https://x.io/r/taskflow/gantt/'),
  ]);
  assert.deepEqual(g.map((p) => p.id), ['taskflow', 'atlas']);
  assert.deepEqual(g[0].widgets.map((w) => w.widgetId), ['taskflow', 'taskflow-gantt']);
});

/* ---------- ce que la page annonce ---------- */

test('la fraicheur se lit en francais, pas en ISO', () => {
  const T = Date.parse('2026-08-21T12:00:00Z');
  const q = (iso) => V.depuis(iso, T);
  assert.equal(q('2026-08-21T09:00:00Z'), "aujourd'hui");
  assert.equal(q('2026-08-20T09:00:00Z'), 'hier');
  assert.equal(q('2026-08-18T12:00:00Z'), 'il y a 3 j');
  assert.equal(q('2026-05-09T12:00:00Z'), 'il y a 3 mois');
  assert.equal(q(''), '');
  assert.equal(q('la semaine derniere'), '');
});

test('« recemment » veut dire moins d’une semaine', () => {
  const T = Date.parse('2026-08-21T12:00:00Z');
  assert.equal(V.estRecent('2026-08-18T12:00:00Z', T), true);
  assert.equal(V.estRecent('2026-08-10T12:00:00Z', T), false);
  assert.equal(V.estRecent('', T), false);
});

test('sans historique, la date retombe sur le manifeste', () => {
  // En CI, un checkout superficiel n'a pas les dates de commit. La page doit
  // rester juste plutot que vide.
  const p = { id: 'projet-qui-n-existe-pas-dans-git', widgets: [W('a', 'https://x.io/r/a/', { lastUpdatedAt: '2026-01-02T00:00:00Z' })] };
  assert.equal(V.majProjet(p).slice(0, 10), '2026-01-02');
});

/* ---------- la contrainte cardinale ---------- */

test('la vitrine n’ecrit jamais par-dessus un widget', () => {
  // `published/<projet>/index.html` EST le widget : c'est l'adresse enregistree
  // dans les instances Grist. Ecrire la presentation la casserait toutes les
  // installations, sans que rien ne le signale.
  const { faits } = V.generer();
  const permis = new Set(['index.html', 'sitemap.xml']);
  for (const f of faits) {
    assert.ok(permis.has(f) || f.startsWith('w/'), `${f} sort de la vitrine`);
  }
});

test('chaque projet du manifeste a sa page, et une seule', () => {
  const { projets, faits } = V.generer();
  const pages = faits.filter((f) => f.startsWith('w/'));
  assert.equal(pages.length, projets.length);
  for (const p of projets) {
    assert.ok(pages.includes(`w/${p.id}/index.html`), `page manquante pour ${p.id}`);
  }
});

test('la page d’un projet mene au widget et revient a l’accueil', () => {
  const { projets } = V.generer();
  const atlas = projets.find((p) => p.id === 'atlas');
  const html = fs.readFileSync(path.join(__dirname, '..', 'published', 'w', 'atlas', 'index.html'), 'utf8');
  assert.match(html, /href="\.\.\/\.\.\/"/, 'retour vers l’accueil');
  assert.ok(html.includes(atlas.widgets[0].url), 'lien vers le widget');
  assert.match(html, /<title>Atlas — widget Grist<\/title>/);
});

test('un projet sans fiche reste presentable', () => {
  // La fiche est facultative : sans elle, la description du manifeste suffit a
  // produire une page correcte, plutot qu'une page vide ou un plantage.
  const html = V.rendreProjet({
    id: 'nu',
    widgets: [W('nu', 'https://x.io/r/nu/', { description: 'Fait quelque chose', accessLevel: 'read table' })],
    presentation: {},
  }, Date.now());
  assert.match(html, /Fait quelque chose/);
  assert.match(html, /lecture seule/);
  assert.doesNotMatch(html, /undefined|\[object/);
});

test('le texte d’une fiche est echappe, pas injecte', () => {
  const html = V.rendreProjet({
    id: 'x',
    widgets: [W('x', 'https://x.io/r/x/')],
    presentation: { nom: '<script>alert(1)</script>', pitch: 'a & b' },
  }, Date.now());
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /a &amp; b/);
});

test('la fiche de presentation ne date pas le projet', () => {
  // Elle vit dans le dossier du widget : l'y avoir ajoutee avait date tous les
  // projets du jour ou la vitrine est nee. « Mis a jour aujourd'hui » partout
  // ne renseigne sur rien — c'est le defaut meme qu'on voulait corriger.
  const { projets } = V.generer();
  const dates = projets.map((p) => V.majProjet(p).slice(0, 10));
  assert.ok(new Set(dates).size > 1,
    `toutes les dates sont identiques (${dates[0]}) — la fiche les ecrase`);
});

/* ---------- ce que lisent les moteurs et les partages ---------- */

test('l’adresse publique se deduit du manifeste, jamais codee en dur', () => {
  // Le jour ou le depot change de nom ou de compte, une adresse ecrite ici
  // mentirait sans que rien ne le signale.
  assert.equal(V.baseDe([W('a', 'https://qui.github.io/Le-Depot/atlas/')]), 'https://qui.github.io/Le-Depot/');
  assert.equal(V.baseDe([W('a', 'pas une url'), W('b', 'https://x.io/r/t/')]), 'https://x.io/r/');
  assert.equal(V.baseDe([]), '');
});

test('chaque page se declare canonique et se presente aux partages', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'published', 'w', 'atlas', 'index.html'), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/[^"]+\/w\/atlas\/">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta property="og:description"/);
  assert.match(html, /<meta name="twitter:card"/);
});

test('un widget se decrit comme un logiciel, pas comme une page', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'published', 'w', 'atlas', 'index.html'), 'utf8');
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'donnees structurees absentes');
  const ld = JSON.parse(m[1]);
  assert.equal(ld['@type'], 'SoftwareApplication');
  assert.equal(ld.inLanguage, 'fr');
  assert.ok(ld.url.endsWith('/w/atlas/'));
  assert.equal(ld.offers.price, '0');
});

test('le plan du site liste l’accueil et chaque projet, une seule fois', () => {
  const xml = fs.readFileSync(path.join(__dirname, '..', 'published', 'sitemap.xml'), 'utf8');
  const { projets, base } = V.generer();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.length, projets.length + 1);
  assert.equal(new Set(locs).size, locs.length, 'une URL apparait deux fois');
  assert.ok(locs.includes(base));
  for (const p of projets) assert.ok(locs.includes(`${base}w/${p.id}/`), `${p.id} absent du plan`);
});

test('le plan date les pages d’apres le projet, pas d’apres la generation', () => {
  // Annoncer que tout a change a chaque deploiement apprend a un moteur a ne
  // plus croire ces dates.
  const xml = fs.readFileSync(path.join(__dirname, '..', 'published', 'sitemap.xml'), 'utf8');
  const dates = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
  assert.ok(dates.length >= 2);
  assert.ok(new Set(dates).size > 1, 'toutes les dates du plan sont identiques');
});

test('la fiche designe le widget mis en avant, pas l’ordre du manifeste', () => {
  // Une v2 arrive apres la v1 dans le manifeste, sans que l'ordre dise laquelle
  // compte. Et l'URL de la v1 ne peut pas etre reprise : elle est enregistree
  // dans des documents.
  const html = V.rendreProjet({
    id: 'x',
    widgets: [
      W('x-v1', 'https://s.io/r/x/', { name: 'Ancienne', description: 'v1' }),
      W('x-v2', 'https://s.io/r/x/v2/', { name: 'Nouvelle', description: 'v2' }),
    ],
    presentation: { principal: 'x-v2', archives: ['x-v1'] },
  }, Date.now(), 'https://s.io/r/');
  const bouton = html.match(/<a class="bouton" href="([^"]+)"/);
  assert.equal(bouton[1], 'https://s.io/r/x/v2/', 'le bouton ouvre la version mise en avant');
  assert.match(html, /class="vue passee"/, 'la v1 est signalee comme precedente');
  assert.match(html, /version précédente/);
  assert.ok(html.includes('https://s.io/r/x/'), 'la v1 reste atteignable');
});

/* ---------- la peau du produit ---------- */

test('une page prend la palette et la typographie de son widget', () => {
  const html = V.rendreProjet({
    id: 'x',
    widgets: [W('x', 'https://s.io/r/x/')],
    presentation: {
      couleur: '#3E5DE7',
      peau: { clair: { papier: '#F5F7FB', encre: '#1F2738' }, display: 'system-ui, sans-serif' },
    },
  }, Date.now(), 'https://s.io/r/');
  assert.match(html, /--papier: #F5F7FB/);
  assert.match(html, /--encre: #1F2738/);
  assert.match(html, /--accent: #3E5DE7/);
  assert.match(html, /font-family: system-ui, sans-serif/);
});

test('une peau qui ne declare qu’un theme l’impose', () => {
  // Un produit dont l'identite est un parti pris ne doit pas se retourner selon
  // le reglage du visiteur : il s'afficherait autrement qu'il n'est.
  const clairSeul = V.rendreProjet({
    id: 'x', widgets: [W('x', 'https://s.io/r/x/')],
    presentation: { peau: { clair: { papier: '#FFFFFF' } } },
  }, Date.now(), 'https://s.io/r/');
  assert.doesNotMatch(clairSeul, /prefers-color-scheme: dark/);

  const lesDeux = V.rendreProjet({
    id: 'y', widgets: [W('y', 'https://s.io/r/y/')],
    presentation: { peau: { clair: { papier: '#FFFFFF' }, sombre: { papier: '#101010' } } },
  }, Date.now(), 'https://s.io/r/');
  assert.match(lesDeux, /prefers-color-scheme: dark/);
  assert.match(lesDeux, /--papier: #101010/);
});

test('sans peau declaree, la page garde celle de la maison, dans les deux themes', () => {
  const html = V.rendreProjet({
    id: 'z', widgets: [W('z', 'https://s.io/r/z/')], presentation: {},
  }, Date.now(), 'https://s.io/r/');
  assert.match(html, /--papier: #FAF7F0/);
  assert.match(html, /prefers-color-scheme: dark/);
  assert.match(html, /Georgia/);
});

test('la structure ne bouge pas d’une peau a l’autre', () => {
  // On doit sentir qu'on est toujours sur le meme site : sinon revenir a
  // l'accueil ressemble a un depart.
  const faire = (peau) => V.rendreProjet({
    id: 'x', widgets: [W('x', 'https://s.io/r/x/')], presentation: { peau },
  }, Date.now(), 'https://s.io/r/');
  for (const html of [faire(undefined), faire({ clair: { papier: '#000' } })]) {
    assert.match(html, /class="retour"/);
    assert.match(html, /class="eyebrow"/);
    assert.match(html, /class="faits"/);
    assert.match(html, /class="pied"/);
  }
});

test('l’apercu lance le widget mis en avant, pas le premier du manifeste', () => {
  // Sur qgis2grist, il lancait la v1 que la page annonce elle-meme comme
  // depassee : la demonstration contredisait le texte.
  const html = V.rendreProjet({
    id: 'atlas',   // un projet qui a une image d'apercu dans published/w/
    widgets: [
      W('a-v1', 'https://s.io/r/atlas/', { name: 'v1' }),
      W('a-v2', 'https://s.io/r/atlas/v2/', { name: 'v2' }),
    ],
    presentation: { principal: 'a-v2' },
  }, Date.now(), 'https://s.io/r/');
  const m = html.match(/data-widget="([^"]+)"/);
  assert.ok(m, 'apercu absent');
  assert.equal(m[1], 'https://s.io/r/atlas/v2/?vitrine=1');
});

/* ---------- les blocs d une page produit ---------- */

test('les blocs produit sont facultatifs, et n’existent que remplis', () => {
  // Une page produit ne merite pas un gabarit a part : ce serait du code qui ne
  // sert qu'a un projet, et que le suivant devrait reecrire.
  const nu = V.rendreProjet({
    id: 'x', widgets: [W('x', 'https://s.io/r/x/')], presentation: {},
  }, Date.now(), 'https://s.io/r/');
  for (const marque of ['class="chiffres', 'class="galerie', 'class="sequence', 'class="reveler']) {
    assert.ok(!nu.includes(marque), `${marque} present sur une fiche vide`);
  }

  const plein = V.rendreProjet({
    id: 'x', widgets: [W('x', 'https://s.io/r/x/')],
    presentation: { produit: {
      accroche: 'Une phrase de plus',
      chiffres: [{ valeur: '3', libelle: 'cibles' }],
      contextes: [{ titre: 'Sur le terrain', texte: 'En application', format: 'mobile',
        images: [{ image: 'm.jpg', legende: 'Sur un téléphone' }] }],
      sequence: [{ titre: 'Ajouter', texte: 'Coller l’adresse' }],
    } },
  }, Date.now(), 'https://s.io/r/');
  assert.match(plein, /class="chiffres/);
  assert.match(plein, /class="telephone"/);
  assert.match(plein, /class="sequence/);
  assert.match(plein, /Une phrase de plus/);
});

test('l’animation ne conditionne pas la lecture', () => {
  // Une page dont le contenu depend d'une animation est une page vide pour qui
  // ne l'execute pas — et pour qui a demande moins de mouvement.
  const html = V.rendreProjet({
    id: 'x', widgets: [W('x', 'https://s.io/r/x/')],
    presentation: { produit: { chiffres: [{ valeur: '1', libelle: 'a' }] } },
  }, Date.now(), 'https://s.io/r/');
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /IntersectionObserver' in window/, 'repli si l’API manque');
});

test('un paquet prive ne figure ni au catalogue ni a la vitrine', () => {
  // Il a suffi de regenerer le manifeste pour un autre widget : un outil de
  // finances personnelles est entre au catalogue public, et la vitrine lui a
  // fait une page. Ce qui n'est pas destine au public doit le dire.
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'published', 'manifest.json'), 'utf8'));
  const widgets = Array.isArray(m) ? m : (m.widgets || []);
  assert.ok(!widgets.some((w) => /budget/i.test(w.widgetId || '')), 'budget est au catalogue');

  const { projets } = V.generer();
  assert.ok(!projets.some((p) => p.id === 'budget'), 'budget a une page de vitrine');
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'published', 'w', 'budget')),
    'la page de budget subsiste sur le disque');
});

test('la balise de verification n’apparait que si un code est depose', () => {
  // Sur une « project page », le domaine appartient a GitHub : on ne peut
  // declarer qu'un prefixe d'URL, et le prouver par cette balise sur sa page
  // d'accueil.
  const f = path.join(__dirname, '..', 'published', 'verification.json');
  const html = fs.readFileSync(path.join(__dirname, '..', 'published', 'index.html'), 'utf8');
  if (fs.existsSync(f)) {
    const code = JSON.parse(fs.readFileSync(f, 'utf8')).google;
    if (code) assert.ok(html.includes(`content="${code}"`), 'code depose mais balise absente');
  } else {
    assert.doesNotMatch(html, /google-site-verification/, 'balise posee sans code');
  }
});

test('un bouton d’aperçu a toujours un script qui l’écoute', () => {
  // Le script des cadres a ete sorti de la section d'apercu pour qu'une
  // demonstration placee ailleurs puisse en profiter — et il a cesse d'etre
  // injecte du tout. Les boutons ne faisaient plus rien, sans la moindre erreur
  // en console : c'est le genre de panne qu'aucune verification de generation
  // ne voit, seulement un clic.
  const { projets } = V.generer();
  for (const p of projets) {
    const html = fs.readFileSync(
      path.join(__dirname, '..', 'published', 'w', p.id, 'index.html'), 'utf8');
    if (!html.includes('class="cadre"')) continue;
    assert.match(html, /querySelectorAll\('\.cadre'\)/,
      `${p.id} : un cadre sans le script qui l’anime`);
    assert.match(html, /addEventListener\('click'/, `${p.id} : aucun écouteur de clic`);
  }
});

/* ---------- ce que la page doit aux autres ---------- */

test('l’accueil cite l’ecosysteme, et renvoie chaque equipe a son propre fil', () => {
  // La section existait dans le generateur mais n'etait renseignee nulle part :
  // la page ne parlait donc que d'elle-meme. Un lecteur pouvait en conclure
  // qu'aucun autre widget Grist francophone n'existe, ce qui est faux et
  // desservirait justement ceux qu'on veut voir trouves.
  const html = V.rendreAccueil([], new Date('2026-08-21T12:00:00Z'));
  assert.match(html, /betagouv\/grist-custom-widgets-fr-admin/,
    'les widgets de l’equipe Grist.gouv doivent etre cites');
  assert.match(html, /gristlabs\/grist-widget/, 'le depot officiel doit etre cite');
  assert.match(html, /maplibre\.org/, 'la brique de rendu doit etre creditee');
  // Les presenter a leur place serait deplace : on renvoie a ce qu'ils ont ecrit.
  assert.match(html, /les-widgets-proposes-par-lequipe-grist-gouv[^"]*"[^>]*>Leur fil sur le forum/,
    'l’equipe doit etre renvoyee a sa propre presentation');
});

/* ---------- la section de demonstration ---------- */

const projetDemo = (demo) => ({
  id: 'atlas',
  presentation: { nom: 'Atlas', produit: { demonstration: demo } },
});

test('sans declaration, aucune section de demonstration', () => {
  assert.equal(V.sectionDemo(projetDemo(undefined), __dirname), '');
  assert.equal(V.sectionDemo({ id: 'x', presentation: {} }, __dirname), '');
});

test('une demonstration incomplete est ignoree, pas rendue a moitie', () => {
  // Sans URL il n'y a rien a ouvrir ; sans image le cadre serait un rectangle
  // vide qu'on prendrait pour un widget casse.
  assert.equal(V.sectionDemo(projetDemo({ image: 'demo.jpg' }), __dirname), '');
  assert.equal(V.sectionDemo(projetDemo({ url: 'https://h.fr/a' }), __dirname), '');
});

test('une image absente du disque ecarte la demonstration', () => {
  // La page la proposerait, on cliquerait, et on jugerait le widget sur un
  // cadre vide : une demonstration cassee est pire qu'une demonstration absente.
  const html = V.sectionDemo(
    projetDemo({ url: 'https://h.fr/atlas/', image: 'introuvable.jpg' }), __dirname);
  assert.equal(html, '');
});

test('une scene locale absente ecarte aussi la demonstration', () => {
  // Le cas qui arrive vraiment : on renomme un dossier de demo et la page
  // continue de pointer sur l'ancien chemin.
  const racine = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vitrine-'));
  fs.mkdirSync(path.join(racine, 'w', 'atlas'), { recursive: true });
  fs.writeFileSync(path.join(racine, 'w', 'atlas', 'demo.jpg'), 'x');
  const html = V.sectionDemo(projetDemo({
    url: 'https://h.fr/atlas/?scene=' + encodeURIComponent('atlas/demos/partie/scene.json'),
    image: 'demo.jpg',
  }), racine);
  assert.equal(html, '');
});

test('une demonstration complete rend un cadre, un bouton et sa mention', () => {
  const racine = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vitrine-'));
  fs.mkdirSync(path.join(racine, 'w', 'atlas'), { recursive: true });
  fs.writeFileSync(path.join(racine, 'w', 'atlas', 'demo.jpg'), 'x');
  const html = V.sectionDemo(projetDemo({
    titre: 'La démonstration',
    texte: 'Une scène réelle.',
    url: 'https://h.fr/atlas/',
    image: 'demo.jpg',
    libelle: 'Ouvrir',
    mention: 'Données © OpenStreetMap',
  }), racine);
  assert.match(html, /<section class="demo">/);
  assert.match(html, /La démonstration/);
  assert.match(html, /data-widget="https:\/\/h\.fr\/atlas\/"/);
  assert.match(html, /Ouvrir<\/button>/);
  assert.match(html, /Données © OpenStreetMap/);
  // Le widget n'est pas charge d'emblee : une carte tire une bibliotheque, des
  // tuiles et un rendu 3D. L'image tient lieu d'apercu jusqu'au clic.
  assert.ok(!/<iframe/.test(html), 'le cadre ne doit pas contenir d’iframe');
});

test('le texte d’une demonstration est echappe, pas injecte', () => {
  const racine = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vitrine-'));
  fs.mkdirSync(path.join(racine, 'w', 'atlas'), { recursive: true });
  fs.writeFileSync(path.join(racine, 'w', 'atlas', 'demo.jpg'), 'x');
  const html = V.sectionDemo(projetDemo({
    titre: '<img src=x onerror="alert(1)">',
    url: 'https://h.fr/a',
    image: 'demo.jpg',
  }), racine);
  assert.ok(!/<img src=x/.test(html), 'le titre doit ressortir echappe');
  assert.match(html, /&lt;img/);
});
