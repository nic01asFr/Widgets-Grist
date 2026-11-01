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
  // Un projet peut avoir des annexes (un guide, par exemple) : une page de plus chacune, sous le dossier du projet.
  const annexes = projets.flatMap((p) => V.annexesDe(p).map((a) => `w/${p.id}/${a.id}/index.html`));
  assert.equal(pages.length, projets.length + annexes.length);
  for (const p of projets) {
    assert.ok(pages.includes(`w/${p.id}/index.html`), `page manquante pour ${p.id}`);
  }
  for (const a of annexes) assert.ok(pages.includes(a), `annexe manquante : ${a}`);
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
  const annexes = projets.flatMap((p) => V.annexesDe(p).map((a) => `${base}w/${p.id}/${a.id}/`));
  assert.equal(locs.length, projets.length + 1 + annexes.length);
  assert.equal(new Set(locs).size, locs.length, 'une URL apparait deux fois');
  assert.ok(locs.includes(base));
  for (const p of projets) assert.ok(locs.includes(`${base}w/${p.id}/`), `${p.id} absent du plan`);
  for (const a of annexes) assert.ok(locs.includes(a), `annexe absente du plan : ${a}`);
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

test('un chapitre dit qui agit et ce qu’il met en jeu, et les points se rangent par groupe', () => {
  const W1 = [W('x', 'https://s.io/r/x/')];
  const html = V.rendreProjet({ id: 'x', widgets: W1, presentation: {
    points: [{ groupe: 'Éditer', titre: 'Dessiner', texte: 'un point' }, { groupe: 'Montrer', titre: 'Lire', texte: 'un récit' }, { groupe: 'Éditer', titre: 'Annuler', texte: 'un geste' }],
    produit: { contextes: [{ role: 'L’agent de terrain', titre: 'Relever', texte: 'sur place', format: 'mobile',
      exemple: 'un piège de nuit', utilise: ['Formulaires', '<b>Contextes</b>'], images: [{ image: 'm.jpg', legende: 'x' }] }] },
  } }, Date.now(), 'https://s.io/r/');
  assert.match(html, /<p class="role">L’agent de terrain<\/p>/);
  assert.match(html, /<ul class="utilise"><li>Formulaires<\/li>/);
  assert.match(html, /<p class="exemple"><b>Dans l’exemple<\/b> un piège de nuit<\/p>/);
  assert.ok(!html.includes('<b>Contextes</b>'), 'une pastille est du texte, jamais du HTML');
  assert.equal((html.match(/class="groupe-points"/g) || []).length, 2);
  assert.ok(html.indexOf('Dessiner') < html.indexOf('Annuler') && html.indexOf('Annuler') < html.indexOf('>Montrer<'),
    'les points d’un groupe restent ensemble, dans l’ordre des groupes');
  const plat = V.rendreProjet({ id: 'x', widgets: W1, presentation: { points: [{ titre: 'A', texte: 'b' }] } }, Date.now(), 'https://s.io/r/');
  assert.ok(!plat.includes('groupe-points'), 'sans groupe, la liste reste à plat');
});

test('les facons de faire se rendent par groupe, sans numero, et un groupe vide disparait', () => {
  const W1 = [W('x', 'https://s.io/r/x/')];
  const nu = V.rendreProjet({ id: 'x', widgets: W1,
    presentation: { produit: { facons: [{ titre: 'Vide', items: [] }] } } }, Date.now(), 'https://s.io/r/');
  assert.ok(!nu.includes('class="facons'), 'un groupe sans porte ne fait pas de section');

  const html = V.rendreProjet({ id: 'x', widgets: W1, presentation: { produit: {
    titreFacons: 'Entrer, sortir',
    facons: [
      { titre: 'Charger', items: [{ titre: 'Une table', texte: 'reconnue', etiquette: 'Dans le document' }] },
      { titre: 'Diffuser', items: [{ titre: 'Une scène', texte: 'ouverte par `?scene=`' }] },
      { titre: 'Rien', items: [] },
    ],
  } } }, Date.now(), 'https://s.io/r/');
  assert.match(html, /<section class="facons reveler">/);
  assert.match(html, /<h2>Entrer, sortir<\/h2>/);
  assert.equal((html.match(/class="groupe"/g) || []).length, 2);
  assert.match(html, /<span class="ou">Dans le document<\/span>/);
  assert.ok(!/<ol>[^]*Une table/.test(html), 'des alternatives ne se numerotent pas');
});

test('un parametre entre accents graves devient du code, sans rien injecter', () => {
  const html = V.rendreProjet({ id: 'x', widgets: [W('x', 'https://s.io/r/x/')], presentation: { produit: {
    sequence: [{ titre: 'Partager', texte: 'avec `?embed=true` ou `<img onerror=x>`' }],
  } } }, Date.now(), 'https://s.io/r/');
  assert.match(html, /<code>\?embed=true<\/code>/);
  assert.match(html, /<code>&lt;img onerror=x&gt;<\/code>/);
  assert.ok(!html.includes('`?embed'), 'plus d’accent grave affiche tel quel');
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

test('un contexte peut défiler à l’horizontale : diapositives, flèches, sommaire, et seulement quand la fiche le demande', () => {
  const W1 = [W('x', 'https://s.io/r/x/')];
  const fiche = (extra) => ({ id: 'x', widgets: W1, presentation: { produit: { contextes: [Object.assign({
    role: 'Pour qui', titre: 'Une identité', texte: 'dit tout', images: [
      { image: 'a.jpg', titre: 'Premier', alt: 'Une capture', legende: 'Ce qu’on voit en premier' },
      { image: 'b.jpg', titre: 'Second', legende: 'Ce qu’on voit ensuite' },
      { image: 'c.jpg', legende: 'Sans titre : écartée' },
    ] }, extra)] } } });

  const empile = V.rendreProjet(fiche({}), Date.now(), 'https://s.io/r/');
  assert.ok(!empile.includes('<section class="carrousel"') && !empile.includes('<article class="contexte avec-carrousel">'), 'sans demande, les figures restent en pile');
  assert.equal((empile.match(/<figure class="large">/g) || []).length, 3);

  const defile = V.rendreProjet(fiche({ carrousel: true }), Date.now(), 'https://s.io/r/');
  assert.match(defile, /<article class="contexte avec-carrousel">/);
  assert.match(defile, /<section class="carrousel" aria-roledescription="carrousel" aria-label="Une identité" id="contexte-1">/);
  assert.equal((defile.match(/class="diapo/g) || []).length, 2, 'une image sans titre n’est pas une diapositive');
  assert.match(defile, /<h4>Premier<\/h4><p>Ce qu’on voit en premier<\/p>/);
  assert.match(defile, /alt="Une capture"/);
  assert.match(defile, /alt="Ce qu’on voit ensuite"/, 'sans alt, la légende en tient lieu');
  assert.match(defile, /aria-label="Diapositive suivante"/);
  assert.match(defile, /<ul class="sommaire"[^>]*><li><button type="button" data-n="0" aria-current="true">Premier<\/button><\/li>/);
  assert.ok(defile.includes("querySelectorAll('.carrousel')"), 'le script du carrousel est embarqué');
  assert.ok(defile.includes('.diapo { flex: 0 0 88%'), 'et son style');
  assert.ok(!defile.includes('<figure class="large">'), 'plus de figures en pile pour ce contexte');
});

test('un contexte en carrousel dont plus rien n’est valide retombe sur ses figures', () => {
  const html = V.rendreProjet({ id: 'x', widgets: [W('x', 'https://s.io/r/x/')], presentation: { produit: { contextes: [{
    titre: 'Rien', texte: 't', carrousel: true, images: [{ image: 'a.jpg', legende: 'sans titre' }] }] } } }, Date.now(), 'https://s.io/r/');
  assert.ok(!html.includes('<section class="carrousel"') && !html.includes('<article class="contexte avec-carrousel">'));
  assert.match(html, /<figure class="large">/);
});

/* ---------- le thème du visiteur sur une page de vitrine ---------- */

const vm = require('node:vm');
const CLE_VISITEUR = 'widgets-grist:theme-visiteur';
const pageAvec = (extra) => V.rendreProjet({ id: 'x', widgets: [W('x', 'https://s.io/r/x/')], presentation: Object.assign({}, extra) }, Date.now(), 'https://s.io/r/');

test('une page qui ne le demande pas ne change pas d’un octet : rien n’est inséré entre la feuille et la fin de l’en-tête', () => {
  const html = pageAvec({});
  assert.ok(html.includes('</style>\n</head>'), 'adjacents, comme avant');
  assert.ok(!html.includes(CLE_VISITEUR));
  assert.ok(!pageAvec({ themeVisiteur: false }).includes(CLE_VISITEUR), 'et faux = comme absent');
  assert.ok(!pageAvec({ themeVisiteur: 'oui' }).includes(CLE_VISITEUR), 'seul le booléen vrai l’active');
});

test('une fiche qui le demande reçoit le script, dans l’en-tête, après la feuille', () => {
  const html = pageAvec({ themeVisiteur: true });
  const iStyle = html.indexOf('</style>');
  const iScript = html.indexOf(CLE_VISITEUR);
  const iFin = html.indexOf('</head>');
  assert.ok(iStyle > -1 && iScript > iStyle && iScript < iFin, 'script d’en-tête, pas de scintillement');
  for (const n of ['--papier', '--surface', '--encre', '--plume', '--filet', '--accent', '--sur-accent']) assert.ok(html.slice(iScript - 400, iFin).includes("'" + n + "'"), n);
});

/** Exécute le script de la page dans un faux navigateur et rend ce qu'il a posé sur <html>. */
function executerVisiteur(contenuStockage, { sombre = false, contraste = false, themeAttr = null } = {}) {
  const html = pageAvec({ themeVisiteur: true });
  const brut = html.slice(html.indexOf('</style>')).match(/<script>([\s\S]*?)<\/script>/)[1];
  const posees = {};
  const ecouteurs = {};
  const stock = { [CLE_VISITEUR]: contenuStockage === undefined ? null : contenuStockage };
  const racine = { getAttribute: (n) => (n === 'data-theme' ? themeAttr : null), style: { setProperty: (k, v) => { posees[k] = v; }, removeProperty: (k) => { delete posees[k]; } } };
  const fenetre = {
    document: { documentElement: racine },
    localStorage: { getItem: (k) => (k in stock ? stock[k] : null) },
    matchMedia: (q) => ({ matches: /forced-colors|prefers-contrast/.test(q) ? contraste : (/prefers-color-scheme: dark/.test(q) ? sombre : false), addEventListener: () => {} }),
    addEventListener: (nom, f) => { ecouteurs[nom] = f; }
  };
  fenetre.window = fenetre;
  vm.runInNewContext(brut, Object.assign(fenetre, { JSON, Math, parseInt, RegExp, Object, typeof: undefined }));
  return { posees, stock, ecouteurs };
}

const jeuClair = { '--papier': '#fdfaf3', '--surface': '#ffffff', '--encre': '#161616', '--plume': '#5c5c5c', '--filet': '#d0d0d0', '--accent': '#0b6e4f', '--sur-accent': '#ffffff' };
const jeuSombre = { '--papier': '#161616', '--surface': '#1e1e1e', '--encre': '#f6f6f6', '--plume': '#c0c0c0', '--filet': '#353535', '--accent': '#59b08f', '--sur-accent': '#161616' };
const cache = (extra) => JSON.stringify(Object.assign({ v: 1, maj: 1, themedef: {}, vitrine: { clair: jeuClair, sombre: jeuSombre } }, extra));

test('le script du visiteur pose les six variables du mode de la page, et seulement elles', () => {
  assert.deepEqual(executerVisiteur(cache()).posees, jeuClair);
  assert.deepEqual(executerVisiteur(cache(), { sombre: true }).posees, jeuSombre);
  assert.deepEqual(executerVisiteur(cache(), { sombre: true, themeAttr: 'light' }).posees, jeuClair, 'data-theme="light" l’emporte, comme dans la feuille');
});

test('sans clé, ou avec une clé inutilisable, le script ne pose rien', () => {
  for (const c of [undefined, '', '{pas du json', '[]', '"x"', JSON.stringify({ v: 2, vitrine: { clair: jeuClair } }), JSON.stringify({ v: 1 }), JSON.stringify({ v: 1, vitrine: 'x' })]) {
    assert.deepEqual(executerVisiteur(c).posees, {}, String(c));
  }
});

test('un cache fabriqué est refusé en entier : couleurs non strictes, texte illisible, accent invisible, variable manquante', () => {
  const casse = (changements) => executerVisiteur(cache({ vitrine: { clair: Object.assign({}, jeuClair, changements), sombre: null } })).posees;
  assert.deepEqual(casse({ '--encre': '#fdfaf3' }), {}, 'texte sur papier : 1,0:1');
  assert.deepEqual(casse({ '--plume': '#fcf9f1' }), {}, 'texte secondaire illisible');
  assert.deepEqual(casse({ '--plume': '#8a8a8a' }), {}, 'texte courant entre 3 et 4,5:1 : refusé (il sert partout)');
  assert.deepEqual(casse({ '--sur-accent': '#0b6e4f' }), {}, 'texte de bouton illisible sur l’accent');
  assert.deepEqual(casse({ '--accent': '#9a9a9a' }), {}, 'accent entre 3 et 4,5:1 : refusé');
  assert.deepEqual(casse({ '--accent': '#fefaf3' }), {}, 'accent invisible');
  assert.deepEqual(casse({ '--papier': 'red' }), {}, 'pas un #rrggbb');
  assert.deepEqual(casse({ '--papier': 'url(//x)' }), {});
  assert.deepEqual(casse({ '--papier': '#FDFAF3' }), {}, 'majuscules refusées : le cache est écrit en minuscules');
  const sans = Object.assign({}, jeuClair); delete sans['--filet'];
  assert.deepEqual(executerVisiteur(cache({ vitrine: { clair: sans, sombre: null } })).posees, {}, 'un jeu incomplet n’est jamais appliqué à moitié');
});

test('pas de jeu pour le mode de la page : la page garde sa peau', () => {
  assert.deepEqual(executerVisiteur(cache({ vitrine: { clair: jeuClair, sombre: null } }), { sombre: true }).posees, {});
});

test('la personne passe avant le thème : contraste forcé ou renforcé, rien n’est posé', () => {
  assert.deepEqual(executerVisiteur(cache(), { contraste: true }).posees, {});
});

test('un changement fait dans un autre onglet est repris, et un thème retiré rend la page à sa peau', () => {
  const r = executerVisiteur(cache());
  assert.deepEqual(r.posees, jeuClair);
  assert.equal(typeof r.ecouteurs.storage, 'function');
  r.stock[CLE_VISITEUR] = null;
  r.ecouteurs.storage({ key: CLE_VISITEUR });
  assert.deepEqual(r.posees, {}, 'retiré : les variables posées sont ôtées');
  r.stock[CLE_VISITEUR] = cache({ vitrine: { clair: Object.assign({}, jeuClair, { '--accent': '#7a1fa2' }), sombre: null } });
  r.ecouteurs.storage({ key: CLE_VISITEUR });
  assert.equal(r.posees['--accent'], '#7a1fa2');
  r.stock[CLE_VISITEUR] = cache({ vitrine: { clair: jeuClair, sombre: null } });
  r.ecouteurs.storage({ key: 'une-autre-cle' });
  assert.equal(r.posees['--accent'], '#7a1fa2', 'une autre clé ne déclenche rien');
});

test('le texte des boutons suit --sur-accent, pour les seules pages qui activent le thème du visiteur', () => {
  const avec = pageAvec({ themeVisiteur: true });
  assert.ok(avec.includes('.bouton:not(.creux), .lancer { color: var(--sur-accent, #fff); }'));
  assert.ok(avec.includes('.sequence li::before { color: var(--sur-accent, #fff); }'));
  // Sans thème posé, --sur-accent n'existe pas : le blanc d'avant reste (repli de var()).
  assert.ok(avec.indexOf('var(--sur-accent, #fff)') > avec.indexOf('.bouton { display: inline-block'), 'après la règle commune, pour l’emporter');
  const sans = pageAvec({});
  assert.ok(!sans.includes('--sur-accent'), 'une page qui ne le demande pas ne change pas d’un octet');
});
