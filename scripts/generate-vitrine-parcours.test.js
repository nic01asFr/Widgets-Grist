/**
 * La page d'un produit organisee par usage (`produit.parcours`) : ce que le generateur en fait, et ce qu'il refuse de rendre.
 * node --test scripts/generate-vitrine-parcours.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const V = require('./generate-vitrine.js');

const W = (id, url, extra = {}) => ({ widgetId: id, name: id, url, ...extra });
const BASE = 'https://s.io/r/';

/** Une fiche minimale avec parcours ; `surcharge` remplace des morceaux du parcours. */
function fiche(surcharge = {}, journal) {
  const diapos = [1, 2, 3].map((k) => ({ titre: `Diapo ${k}`, image: `d${k}.jpg`, alt: `Alt ${k}`, legende: `Legende ${k}`, texte: `Texte ${k}`, etiquettes: ['a', 'b'] }));
  return {
    id: 'x',
    widgets: [W('x', 'https://s.io/r/x/')],
    presentation: {
      nom: 'X', pitch: 'Un produit', ...(journal ? { journal } : {}),
      produit: {
        parcours: {
          cta: [{ libelle: 'Voir un cas', ancre: 'cas' }, { libelle: 'Ouvrir le widget', widget: true }],
          statut: [{ niveau: 'En service', texte: 'dans Grist' }],
          comparaison: { titre: 'Classique ou X ?', colonnes: ['Classique', 'Avec X'], lignes: [['Un export', 'Rien à exporter']] },
          preuves: [{ valeur: '1', libelle: 'balise', preuve: 'voir le code' }],
          sections: [
            { id: 'cas', court: 'Un cas', titre: 'Un cas complet', intro: 'Une intro', chapitres: [
              { num: '1 · Voir', titre: 'Chapitre un', paragraphes: ['Un `code` ici'], pourquoi: 'Parce que', diapositives: diapos },
              { titre: 'Chapitre deux', paragraphes: ['Du texte'], figure: { image: 'f.jpg', alt: 'Une figure', legende: 'Sa légende' },
                code: { titre: 'HTML', langage: 'html', source: '<script src="x"></script>\n<atlas-bi src="y"></atlas-bi>' } },
            ] },
          ],
          savoir: [{ titre: 'Licences', liste: ['MIT'] }],
          ...surcharge,
        },
      },
    },
  };
}

const rendre = (p) => V.rendreProjet(p, Date.now(), BASE);

/** Ce que la generation dit sur la sortie d'erreur, sans polluer le rapport de test. */
function ecouter(fn) {
  const dits = [];
  const orig = console.error;
  console.error = (...a) => dits.push(a.join(' '));
  try { return { html: fn(), dits }; } finally { console.error = orig; }
}

test('une fiche sans parcours garde la page qu\'elle avait : ni sommaire, ni carrousel, ni section par usage', () => {
  const html = rendre({ id: 'x', widgets: [W('x', 'https://s.io/r/x/')], presentation: { nom: 'X', produit: { accroche: 'Une phrase' } } });
  for (const marque of ['class="ancres"', 'class="carrousel"', 'class="partie"', 'class="statut"', 'aria-roledescription']) {
    assert.ok(!html.includes(marque), `${marque} present sur une fiche sans parcours`);
  }
  assert.ok(!html.includes('.carrousel'), 'le style du parcours ne doit pas alourdir les autres pages');
  assert.match(html, />Ouvrir le widget</, 'le bouton d\'avant est conserve');
});

test('un parcours rend le haut de page : boutons de la fiche, statut, comparaison, preuves, sommaire collant', () => {
  const html = rendre(fiche());
  assert.match(html, /<a class="bouton" href="#cas">Voir un cas<\/a>/);
  assert.match(html, /<a class="bouton creux" href="https:\/\/s\.io\/r\/x\/" target="_blank" rel="noopener">Ouvrir le widget<\/a>/, 'widget:true vise le widget mis en avant');
  assert.match(html, /class="statut"[^>]*><span><b>En service<\/b> dans Grist/);
  assert.match(html, /<table class="comparaison">/);
  assert.match(html, /<th scope="col">Classique<\/th>/);
  assert.match(html, /class="preuves"/);
  assert.match(html, /<nav class="ancres" aria-label="Dans cette page"><a href="#cas">Un cas<\/a><a href="#savoir">À savoir<\/a><\/nav>/);
  assert.match(html, /<section class="partie" id="cas" aria-labelledby="t-cas">/);
});

test('un parcours ne rend pas les blocs par fonction : leurs champs sont ceux d\'une autre page', () => {
  const p = fiche();
  p.presentation.produit.contextes = [{ titre: 'Ancien chapitre', texte: 'Ne doit pas paraitre' }];
  p.presentation.produit.sequence = [{ titre: 'Ancienne etape', texte: 'Non plus' }];
  const html = rendre(p);
  assert.ok(!html.includes('Ancien chapitre') && !html.includes('Ancienne etape'));
});

test('un carrousel annonce ses diapositives, montre la premiere tout de suite et differe les autres', () => {
  const html = rendre(fiche());
  assert.match(html, /<section class="carrousel" aria-roledescription="carrousel" aria-label="Chapitre un" id="c-cas-1">/);
  assert.equal((html.match(/class="diapo/g) || []).length, 3);
  assert.match(html, /aria-roledescription="diapositive" aria-label="1 sur 3"/);
  assert.match(html, /aria-label="3 sur 3"/);
  assert.match(html, /<img src="d1\.jpg" alt="Alt 1">/, 'la premiere image n\'est pas differee');
  assert.match(html, /<img src="d2\.jpg" alt="Alt 2" loading="lazy" decoding="async">/);
  assert.match(html, /class="compteur" aria-live="polite">1 \/ 3</);
  assert.match(html, /<button type="button" class="prec" aria-label="Diapositive précédente" disabled>/);
  assert.match(html, /<ul class="sommaire"[^>]*><li><button type="button" data-n="0" aria-current="true">Diapo 1<\/button>/);
  assert.match(html, /<ul class="etiquettes"><li>a<\/li><li>b<\/li><\/ul>/);
});

test('sans script, tout reste lisible : le bouton « Copier » est masque et les fleches ne s\'affichent qu\'une fois le script posé', () => {
  const html = rendre(fiche());
  assert.match(html, /<button type="button" class="copier" hidden>Copier<\/button>/);
  assert.match(html, /\.carrousel:not\(\.pret\) \.prec/);
  assert.match(html, /\.diapo\.actif img, \.carrousel:not\(\.pret\) \.diapo img \{ opacity: 1; \}/, 'avant le script, aucune image n\'est grisee');
  assert.doesNotMatch(html, /\.diapo \{[^}]*opacity/, 'seul le texte garde son contraste : on estompe les images voisines, pas la diapositive');
  assert.doesNotMatch(html, /<article class="diapo/, 'une diapositive est un groupe, pas un article');
  assert.match(html, /prefers-reduced-motion: reduce/);
});

test('un code est echappe, jamais interprete', () => {
  const html = rendre(fiche());
  assert.ok(!html.includes('<atlas-bi src="y">'), 'la balise du code ne doit pas etre rendue');
  assert.match(html, /&lt;atlas-bi src=&quot;y&quot;&gt;&lt;\/atlas-bi&gt;/);
  assert.match(html, /<code class="langage-html">&lt;script src=/);
});

test('un code et une figure : la figure accompagne le texte, le code s\'etale dessous', () => {
  const html = rendre(fiche());
  const i = html.indexOf('Chapitre deux');
  const figure = html.indexOf('<figure>', i);
  const pleine = html.indexOf('<div class="pleine">', i);
  assert.ok(figure > 0 && pleine > figure, 'la figure precede le code');
  assert.match(html, /<img src="f\.jpg" alt="Une figure" loading="lazy" decoding="async"><figcaption>Sa légende<\/figcaption>/);
});

test('une image sans texte alternatif n\'est pas rendue, et la generation le dit', () => {
  const p = fiche();
  p.presentation.produit.parcours.sections[0].chapitres[0].diapositives[1].alt = '';
  p.presentation.produit.parcours.sections[0].chapitres[1].figure.alt = '';
  const { html, dits } = ecouter(() => rendre(p));
  assert.equal((html.match(/class="diapo/g) || []).length, 2, 'la diapositive muette est ecartee');
  assert.ok(!html.includes('d2.jpg') && !html.includes('f.jpg'));
  assert.ok(dits.some((d) => d.includes('d2.jpg')) && dits.some((d) => d.includes('f.jpg')), 'chaque ecart est dit');
  assert.match(html, /aria-label="1 sur 2"/);
  assert.match(html, /aria-label="2 sur 2"/, 'la numerotation suit les diapositives retenues');
});

test('un chiffre sans preuve n\'est pas affiche, et la generation le dit', () => {
  const p = fiche({ preuves: [{ valeur: '99', libelle: 'inverifiable' }, { valeur: '1', libelle: 'balise', preuve: 'voir le code' }] });
  const { html, dits } = ecouter(() => rendre(p));
  assert.ok(!html.includes('inverifiable'));
  assert.match(html, /<b>1<\/b><span>balise<\/span><em>voir le code<\/em>/);
  assert.ok(dits.some((d) => d.includes('99')));
});

test('une demonstration en http(s) lance un cadre plein ecran ; une page locale absente l\'ecarte', () => {
  const avec = fiche();
  avec.presentation.produit.parcours.sections[0].demo = { image: 'cas.jpg', alt: 'Le cas', legende: 'Ouvert ici', demo: { url: 'https://h.fr/scene', libelle: 'Explorer', titre: 'Le cas' } };
  const html = rendre(avec);
  assert.match(html, /<figure class="vivante">/);
  assert.match(html, /data-widget="https:\/\/h\.fr\/scene" data-titre="Le cas"/);
  assert.match(html, /<button type="button" class="lancer">Explorer<\/button>/);
  assert.match(html, /function armer\(cadre\)/, 'le script des cadres est pose');

  const sans = fiche();
  sans.presentation.produit.parcours.sections[0].demo = { image: 'cas.jpg', alt: 'Le cas', demo: { url: '../../x/absente/index.html' } };
  const { html: h2, dits } = ecouter(() => rendre(sans));
  assert.ok(!h2.includes('class="cadre"'), 'une demonstration sans page ne rend pas de cadre');
  assert.ok(dits.some((d) => d.includes('absente')));
});

test('le journal montre les dernieres versions et replie les autres', () => {
  const journal = Array.from({ length: 8 }, (_, k) => ({ version: `v1.${8 - k}`, texte: `Note ${8 - k}` }));
  const p = fiche({ journalRecent: 3 }, journal);
  const html = rendre(p);
  assert.match(html, /<section class="partie" id="nouveautes"/);
  assert.match(html, /<summary>Toutes les versions \(8\)<\/summary>/);
  const avant = html.slice(html.indexOf('id="nouveautes"'), html.indexOf('Toutes les versions'));
  assert.equal((avant.match(/<b>v1\./g) || []).length, 3);
  assert.match(html, /<a href="#nouveautes">Nouveautés<\/a>/);
});

test('un texte de fiche est echappe dans le parcours aussi', () => {
  const p = fiche();
  p.presentation.produit.parcours.sections[0].chapitres[0].titre = '<img src=x onerror=alert(1)>';
  p.presentation.produit.parcours.sections[0].titre = 'a & b';
  const html = rendre(p);
  assert.ok(!html.includes('<img src=x onerror'));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, />a &amp; b</);
});

test('les dimensions d\'une image se lisent dans son en-tete, PNG comme JPEG', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'dim-'));
  try {
    const png = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.writeUInt32BE(13, 8); png.write('IHDR', 12, 'latin1'); png.writeUInt32BE(640, 16); png.writeUInt32BE(480, 20);
    fs.writeFileSync(path.join(dossier, 'a.png'), png);
    // JPEG : SOI, un segment APP0 de 16 octets, puis SOF0 (hauteur 300, largeur 500).
    const jpg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14),
      Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01, 0xf4, 0x03]), Buffer.alloc(12),
    ]);
    fs.writeFileSync(path.join(dossier, 'b.jpg'), jpg);
    fs.writeFileSync(path.join(dossier, 'c.txt'), 'pas une image');
    assert.deepEqual(V.dimensionsImage(path.join(dossier, 'a.png')), { w: 640, h: 480 });
    assert.deepEqual(V.dimensionsImage(path.join(dossier, 'b.jpg')), { w: 500, h: 300 });
    assert.equal(V.dimensionsImage(path.join(dossier, 'c.txt')), null);
    assert.equal(V.dimensionsImage(path.join(dossier, 'absente.png')), null, 'une image absente ne fait pas planter la page');
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});

/* ---------- les pages annexes ---------- */

const ficheAvecAnnexe = (annexes) => ({
  id: 'x', widgets: [W('x', 'https://s.io/r/x/')],
  presentation: { nom: 'X', pitch: 'Un produit', produit: { annexes } },
});
const ANNEXE = {
  id: 'integrer', titre: 'Mettre X dans votre page', chapeau: 'Trois étapes avec `code`.',
  blocs: [
    { titre: 'Étape 1', paragraphes: ['Une ligne.'], code: { titre: 'HTML', langage: 'html', source: '<x-carte src="a"></x-carte>' } },
    { titre: 'Attributs', tableauTitre: 'Les attributs', tableau: { colonnes: ['Attribut', 'Rôle'], lignes: [['`src`', 'Adresse']] } },
    { titre: 'Limites', liste: ['Une limite'] },
    { titre: 'Plus loin', liens: [{ libelle: 'Le guide', url: 'https://h.fr/guide' }, { libelle: 'Un essai', url: '../../../x/essai/', bouton: true }] },
  ],
};

test('une annexe se rend sous le dossier du projet, renvoie a sa page, et echappe son code', () => {
  const p = ficheAvecAnnexe([ANNEXE]);
  const html = V.rendreAnnexe(p, V.annexesDe(p)[0], BASE);
  assert.match(html, /<title>Mettre X dans votre page — X<\/title>/);
  assert.match(html, /<a class="retour" href="\.\.\/">← X<\/a>/);
  assert.match(html, /<h1>Mettre X dans votre page<\/h1>/);
  assert.match(html, /<p class="chapeau">Trois étapes avec <code>code<\/code>\.<\/p>/);
  assert.match(html, /<h2>Étape 1<\/h2>/);
  assert.ok(!html.includes('<x-carte src="a">'), 'le code n\'est pas interprete');
  assert.match(html, /&lt;x-carte src=&quot;a&quot;&gt;&lt;\/x-carte&gt;/);
  assert.match(html, /<caption>Les attributs<\/caption>/);
  assert.match(html, /<th scope="row"><code>src<\/code><\/th>/);
  assert.match(html, /<li>Une limite<\/li>/);
  assert.match(html, /href="https:\/\/h\.fr\/guide" target="_blank" rel="noopener"/);
  assert.match(html, /class="bouton creux" href="\.\.\/\.\.\/\.\.\/x\/essai\/"/);
  assert.match(html, /class="copier" hidden/, 'le bouton Copier est present, masque sans script');
  assert.match(html, /<link rel="canonical" href="https:\/\/s\.io\/r\/w\/x\/integrer\/">/);
});

test('seule une annexe avec un identifiant sur, et un titre, est rendue ; sans annexe, aucune page de plus', () => {
  assert.deepEqual(V.annexesDe(ficheAvecAnnexe(undefined)), []);
  assert.deepEqual(V.annexesDe(ficheAvecAnnexe([{ titre: 'Sans identifiant' }, { id: 'x/../y', titre: 'Chemin dangereux' }, { id: 'ok-1', titre: 'Bon' }])).map((a) => a.id), ['ok-1']);
});

test('une annexe n\'ajoute rien a la page du projet, et un texte d\'annexe est echappe', () => {
  const p = ficheAvecAnnexe([{ ...ANNEXE, titre: '<script>alert(1)</script>' }]);
  const annexe = V.rendreAnnexe(p, V.annexesDe(p)[0], BASE);
  assert.ok(!annexe.includes('<script>alert'));
  assert.match(annexe, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  const page = rendre(p);
  assert.ok(!page.includes('Mettre X dans votre page'), 'la page principale ne reprend pas le contenu de l\'annexe');
});
