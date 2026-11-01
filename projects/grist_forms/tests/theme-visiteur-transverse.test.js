'use strict';

/**
 * Le thème du visiteur est transverse : sa clé de stockage vit dans l'origine partagée par TOUS les widgets, toutes les vitrines et tous les
 * documents Grist. Ces tests ne regardent pas le socle, ils regardent le DÉPÔT : qui a le droit de lire la clé, ce qui ne doit jamais
 * l'embarquer, et que personne d'autre ne s'y installe. Cadrage : docs/CADRAGE-THEME-VISITEUR.md §3 et §4.
 *
 * Si l'un d'eux échoue parce qu'un nouveau fichier a été ajouté à la liste d'autorisés ci-dessous, c'est voulu : il faut le décider, le dire
 * à l'équipe du widget concerné, et mettre le cadrage à jour.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../shared/theme-visiteur.js');
const Publish = require('../shared/publish.js');
const Externe = require('../shared/externe.js');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const GRIST_FORMS = path.join(RACINE, 'projects', 'grist_forms');

/** Les seuls fichiers de code autorisés à nommer la clé ou le socle. Ajouter une ligne ici, c'est ouvrir l'étage « visiteur » à un nouveau lecteur. */
const AUTORISES = new Set([
  'projects/grist_forms/shared/theme-visiteur.js',
  'projects/grist_forms/design-system.html', // la page, hors Grist seulement (tests/activation-page.test.js garde le bloc)
  'scripts/generate-vitrine.js' // le pont des six variables, pour les seules fiches qui le demandent (voir plus bas)
  // Étape suivante du cadrage (à ajouter UNIQUEMENT quand elle est faite) :
  //   projects/grist_forms/demo/index.html      (la démonstration de formulaires)
]);

const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.html', '.htm', '.css']);
const A_SAUTER = new Set(['node_modules', '.git', 'tests', 'test', 'vendor', 'dist', 'models', 'objets', 'captures-vitrine', 'etudes-controles', 'etudes-scene-grist']);

function parcourir(dossier, sortie) {
  let entrees;
  try { entrees = fs.readdirSync(dossier, { withFileTypes: true }); } catch (e) { return sortie; }
  for (const e of entrees) {
    if (e.isDirectory()) { if (!A_SAUTER.has(e.name) && !e.name.startsWith('.')) parcourir(path.join(dossier, e.name), sortie); continue; }
    if (!EXTENSIONS.has(path.extname(e.name))) continue;
    if (/\.test\.[cm]?js$/.test(e.name)) continue;
    const complet = path.join(dossier, e.name);
    let taille = 0;
    try { taille = fs.statSync(complet).size; } catch (x) { continue; }
    if (taille > 3 * 1024 * 1024) continue;
    sortie.push(complet);
  }
  return sortie;
}

const FICHIERS = [...parcourir(path.join(RACINE, 'projects'), []), ...parcourir(path.join(RACINE, 'scripts'), [])];
const rel = (f) => path.relative(RACINE, f).split(path.sep).join('/');

describe('Thème du visiteur (transverse) : qui a le droit de le lire', () => {
  it('le dépôt est bien parcouru (le test ne passe pas à vide)', () => {
    assert.ok(FICHIERS.length > 200, 'trouvé ' + FICHIERS.length + ' fichiers');
    assert.ok(FICHIERS.some((f) => rel(f) === 'projects/grist_forms/shared/themedef.js'));
    assert.ok(FICHIERS.some((f) => rel(f).startsWith('projects/Atlas/')), 'Atlas aussi');
    assert.ok(FICHIERS.some((f) => rel(f).startsWith('projects/tasks_app/')), 'TaskFlow aussi');
    assert.ok(FICHIERS.some((f) => rel(f) === 'scripts/generate-vitrine.js'));
  });

  it('aucun fichier du dépôt, hors liste, ne nomme la clé, le socle ou son interface', () => {
    const motifs = [V.CLE, 'FormThemeVisiteur', 'theme-visiteur'];
    const intrus = [];
    for (const f of FICHIERS) {
      if (AUTORISES.has(rel(f))) continue;
      const texte = fs.readFileSync(f, 'utf8');
      for (const m of motifs) if (texte.includes(m)) { intrus.push(rel(f) + ' → ' + m); break; }
    }
    assert.deepEqual(intrus, [], 'fichiers qui lisent ou écrivent le thème du visiteur sans y être autorisés');
  });

  it('personne d’autre ne s’installe sous le préfixe du dépôt dans le stockage', () => {
    const REGISTRE = new Set(['widgets-grist:theme-visiteur']);
    const trouvees = new Set();
    const re = /['"`](widgets-grist:[a-z0-9:_-]+)['"`]/g;
    for (const f of FICHIERS) {
      const texte = fs.readFileSync(f, 'utf8');
      let m;
      while ((m = re.exec(texte))) trouvees.add(m[1]);
    }
    for (const k of trouvees) assert.ok(REGISTRE.has(k), k + ' : une clé « widgets-grist: » qui n’est pas au registre du cadrage');
  });

  it('aucune clé de stockage existante du dépôt ne porte déjà ce nom', () => {
    const re = /(?:localStorage|sessionStorage)\.(?:get|set|remove)Item\(\s*['"`]([^'"`]+)['"`]/g;
    const clesParFichier = [];
    for (const f of FICHIERS) {
      const texte = fs.readFileSync(f, 'utf8');
      let m;
      while ((m = re.exec(texte))) clesParFichier.push([rel(f), m[1]]);
    }
    assert.ok(clesParFichier.length > 20, 'les clés existantes sont bien relevées (' + clesParFichier.length + ')');
    for (const [fichier, cle] of clesParFichier) {
      if (AUTORISES.has(fichier)) continue;
      assert.notEqual(cle, V.CLE, fichier + ' utilise déjà ' + V.CLE);
    }
  });
});

describe('Thème du visiteur (transverse) : ce qui ne l’embarque jamais', () => {
  const lire = (f) => fs.readFileSync(path.join(GRIST_FORMS, f), 'utf8');
  const bundles = () => ({
    bridgeJs: lire('shared/grist-bridge.js'), typesJs: lire('shared/types.js'), attachmentsJs: lire('shared/attachments.js'),
    sessionContextJs: lire('shared/session-context.js'), carteJs: lire('shared/carte-geometrie.js'), dessinJs: lire('shared/dessin.js'),
    referentielJs: lire('shared/referentiel.js'), formatsJs: lire('shared/formats.js'), enrichirJs: lire('shared/enrichir.js'),
    saisiesJs: lire('shared/saisies.js'), conditionsJs: lire('shared/conditions.js'), limitesJs: lire('shared/limites.js'),
    themeJs: lire('shared/theme.js'), themeDefJs: lire('shared/themedef.js'), engineJs: lire('runtime/engine.js'), cssText: lire('shared/dsfr-like.css')
  });
  const defMini = { manifest_version: '1.0.0', id: 'f', title: 'F', tableId: 'T', composeMode: 'ensureSchema', sections: [{ id: 's', label: 'S', fields: [] }] };
  const marques = [V.CLE, 'FormThemeVisiteur', 'theme-visiteur'];

  it('le formulaire publié dans un document Grist (le document HTML de « Mettre en ligne »)', () => {
    const html = Publish.buildRuntimeDocument(defMini, bundles());
    assert.ok(html.length > 100000, 'le bundle est bien construit en entier');
    for (const m of marques) assert.ok(!html.includes(m), 'le formulaire publié contient « ' + m + ' »');
  });

  it('avec un thème de formulaire ou de Grist demandé, le formulaire publié ne lit toujours pas le visiteur', () => {
    for (const apparence of [{ mode: 'grist' }, { mode: 'document' }, { mode: 'formulaire', themedef: { version: 'themedef-1.0', graines: { principal: '#0b6e4f' } } }]) {
      const html = Publish.buildRuntimeDocument(Object.assign({}, defMini, { apparence }), bundles());
      for (const m of marques) assert.ok(!html.includes(m), apparence.mode + ' : « ' + m + ' »');
    }
  });

  it('la page autonome hors Grist', () => {
    const html = Externe.buildExternalDocument(defMini, bundles(), { adresse: 'https://g.exemple.fr/o/org/forms/CLE123/7' });
    for (const m of marques) assert.ok(!html.includes(m), 'page autonome : « ' + m + ' »');
  });

  it('le moteur, le lecteur de thème de production, le thème et le compositeur', () => {
    for (const f of ['runtime/engine.js', 'shared/themedef.js', 'shared/theme.js', 'shared/publish.js', 'shared/externe.js', 'builder.html']) {
      const texte = lire(f);
      for (const m of marques) assert.ok(!texte.includes(m), f + ' contient « ' + m + ' »');
    }
  });

  it('le lecteur de production ne dépend pas du socle : l’inverse seulement', () => {
    assert.ok(!/require\(['"]\.\/theme-visiteur/.test(lire('shared/themedef.js')));
    assert.match(lire('shared/theme-visiteur.js'), /require\('\.\/themedef\.js'\)/, 'le socle dépend du lecteur, pas l’inverse');
  });

  it('le socle n’écrit ni ne lit autre chose que sa clé', () => {
    const texte = lire('shared/theme-visiteur.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const appels = texte.match(/\.(getItem|setItem|removeItem)\(([^)]*)\)/g) || [];
    assert.ok(appels.length >= 3);
    for (const a of appels) assert.match(a, /\(CLE\b/, a);
    assert.ok(!/document\.cookie|indexedDB|sessionStorage|caches\.|XMLHttpRequest|fetch\(|navigator\.sendBeacon/.test(texte), 'aucun autre canal : cookie, réseau, base locale');
  });
});

describe('Thème du visiteur (transverse) : les pages de vitrine ne le lisent que si leur fiche le demande', () => {
  const generateur = fs.readFileSync(path.join(RACINE, 'scripts', 'generate-vitrine.js'), 'utf8');
  const bloc = generateur.slice(generateur.indexOf('const JS_VISITEUR'), generateur.indexOf('/** Le carrousel et le bouton'));

  it('le générateur n’embarque pas le socle : il ne fait que LIRE la clé, jamais l’écrire ni l’effacer', () => {
    assert.ok(bloc.length > 500, 'le script est bien repéré');
    assert.ok(!generateur.includes('FormThemeVisiteur'));
    assert.ok(!/setItem|removeItem|\.clear\(/.test(bloc), 'lecture seule');
    assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|document\.cookie/.test(bloc), 'aucun autre canal');
    // La clé n'apparaît dans le générateur que dans ce script.
    const hors = generateur.replace(bloc, '');
    assert.ok(!hors.includes(V.CLE), 'la clé n’est nommée que dans le script du visiteur');
  });

  it('seules les pages dont la fiche le demande le mentionnent', () => {
    const demandeurs = new Set();
    for (const e of fs.readdirSync(path.join(RACINE, 'published'), { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const fiche = path.join(RACINE, 'published', e.name, 'vitrine.json');
      if (!fs.existsSync(fiche)) continue;
      if (JSON.parse(fs.readFileSync(fiche, 'utf8')).themeVisiteur === true) demandeurs.add(e.name);
    }
    assert.ok(demandeurs.has('grist_forms'), 'Form Builder le demande');
    const dossier = path.join(RACINE, 'published', 'w');
    const pages = [];
    (function marche(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) marche(path.join(d, e.name));
        else if (e.name.endsWith('.html')) pages.push(path.join(d, e.name));
      }
    }(dossier));
    assert.ok(pages.length >= 5, 'les pages de vitrine sont trouvées (' + pages.length + ')');
    for (const p of pages) {
      const projet = path.relative(dossier, p).split(path.sep)[0];
      const texte = fs.readFileSync(p, 'utf8');
      const mentionne = texte.includes(V.CLE);
      assert.equal(mentionne, demandeurs.has(projet) && path.basename(p) === 'index.html' && path.dirname(p) === path.join(dossier, projet), path.relative(RACINE, p));
    }
  });
});
