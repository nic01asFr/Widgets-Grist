'use strict';

/**
 * Le registre de commandes de Form Builder (widgets auto-descriptifs, v1, lecture seule) : chaque commande est décrite, exécutable sur son
 * exemple, et n'écrit rien ; la fiche de capacités se déduit du registre et le fichier versionné la reflète ; le CLI rend les mêmes commandes.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { monter } = require('../forms-registre/index.js');
const { contenu, CHEMIN, contenuCommandes, CHEMIN_COMMANDES } = require('../forms-registre/generer-fiche.js');
const { main } = require('../forms-registre/cli.js');
const Registre = require('../forms-registre/registre.js');
const { validerFiche } = require('../../../scripts/valider-fiche.js');
const { verifierParite } = require('../../../scripts/parite-interfaces.js');
const { spawnSync } = require('node:child_process');
const os = require('node:os');

const registre = monter();
const fiche = registre.fiche();
const CATALOGUE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'published', 'schemas', 'index.json'), 'utf8'));
const DOSSIER = path.join(__dirname, '..', 'forms-registre');

describe('Registre Form Builder : les commandes', () => {
  it('chaque commande a un nom forms_*, un verbe du cycle de vie, une description, des schémas et une nature', () => {
    assert.ok(registre.commandes.length >= 12);
    const noms = new Set();
    for (const c of registre.commandes) {
      assert.match(c.nom, /^forms_[a-z0-9_]+$/, c.nom);
      assert.ok(!noms.has(c.nom), 'nom unique : ' + c.nom);
      noms.add(c.nom);
      assert.ok(Registre.VERBES.includes(c.verbe), c.nom + ' : verbe ' + c.verbe);
      assert.ok(c.description.length > 30, c.nom + ' : description');
      assert.equal(c.entree.type, 'object', c.nom);
      assert.ok(c.sortie && typeof c.sortie === 'object', c.nom);
      assert.ok(['pure', 'exige-la-page'].includes(c.nature), c.nom);
    }
  });

  it('v1 est en lecture seule : aucune commande n’écrit, aucune n’exige la page', () => {
    for (const c of registre.commandes) {
      assert.equal(c.ecrit, 'rien', c.nom);
      assert.equal(c.nature, 'pure', c.nom);
    }
  });

  it('le registre n’approche ni Grist, ni le DOM, ni le réseau', () => {
    const src = fs.readFileSync(path.join(DOSSIER, 'registre.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    assert.ok(!/\bgrist\.|\bdocument\.|\bwindow\.|\bfetch\(|XMLHttpRequest|localStorage/.test(src));
  });

  it('chaque commande a au moins un exemple, et l’exemple s’exécute sans erreur', () => {
    for (const c of registre.commandes) {
      assert.ok(c.exemples.length >= 1, c.nom + ' : un exemple au moins');
      for (const x of c.exemples) {
        const r = registre.appeler(c.nom, x.entree);
        assert.equal(r.ok, true, c.nom + ' / ' + x.titre + ' : ' + JSON.stringify(r.erreur));
      }
    }
  });

  it('les exemples décrits portent leur sortie', () => {
    for (const d of registre.lister()) for (const x of d.exemples) assert.notEqual(x.sortie, undefined, d.nom);
  });

  it('une entrée qui ne suit pas le schéma est refusée avec des écarts, pas une exception', () => {
    const r = registre.appeler('forms_verifier_format', {});
    assert.equal(r.ok, false);
    assert.equal(r.erreur.code, 'entree-invalide');
    assert.ok(r.erreur.details.length >= 1);
  });

  it('une commande inconnue est refusée avec son code', () => {
    const r = registre.appeler('forms_nexiste_pas', {});
    assert.deepEqual([r.ok, r.erreur.code], [false, 'commande-inconnue']);
  });

  it('un opérateur inconnu est une faute, pas « vrai »', () => {
    const r = registre.appeler('forms_valider_condition', { condition: { field: 'a', operator: 'presque', value: 1 } });
    assert.equal(r.sortie.valide, false);
    assert.equal(r.sortie.erreurs[0].bloquant, true);
  });

  it('un format inconnu se dit inconnu', () => {
    const r = registre.appeler('forms_verifier_format', { format: 'inexistant', valeur: 'x' });
    assert.equal(r.sortie.connu, false);
  });

  it('un thème de départ illisible est refusé en entier, un thème correct est résolu', () => {
    const bon = registre.appeler('forms_resoudre_theme', { themedef: { version: 'themedef-1.0', nom: 'a', graines: { principal: '#0b6e4f' } }, mode: 'sombre' });
    assert.equal(bon.sortie.ok, true);
    assert.match(bon.sortie.vars['--kit-fond'], /^#[0-9a-f]{6}$/);
    const mauvais = registre.appeler('forms_resoudre_theme', { themedef: { version: 'themedef-1.0', nom: 'a', graines: { principal: 'rouge' } } });
    assert.equal(mauvais.sortie.ok, false);
  });

  it('le plan de schéma est rendu sans être appliqué, et refuse une table incomplète', () => {
    const r = registre.appeler('forms_plan_schema', { formdef: {}, colonnes_existantes: [] });
    assert.equal(r.sortie.ok, false);
    assert.ok(r.sortie.errors.length >= 1);
  });

  it('la synthèse relit les réponses avec le FormDef', () => {
    const ex = registre.decrire('forms_synthese').exemples[0];
    assert.equal(ex.sortie.reponses, 2);
  });
});

describe('Registre Form Builder : la fiche de capacités', () => {
  it('respecte le contrat fiche-capacites-0.1 et ses règles (validateur commun du dépôt)', () => {
    assert.deepEqual(validerFiche(fiche, { catalogue: CATALOGUE.contrats }), []);
  });

  it('un verbe sans commande est listé dans non_couverts : aucun silence, aucun recouvrement', () => {
    const couverts = Object.keys(fiche.verbes);
    for (const v of Registre.VERBES) {
      assert.ok(couverts.includes(v) !== fiche.non_couverts.includes(v), v + ' : couvert ou non couvert, pas les deux, pas aucun');
    }
    assert.deepEqual([...fiche.non_couverts].sort(), ['editer', 'exploiter', 'recolter']);
  });

  it('toutes les commandes du registre sont dans la fiche, sous leur verbe', () => {
    for (const c of registre.commandes) assert.ok(fiche.verbes[c.verbe].includes(c.nom), c.nom);
  });

  it('les contrats du catalogue sont déclarés catalogue=true et existent au catalogue ; les autres portent leur empreinte', () => {
    const noms = CATALOGUE.contrats.map((c) => c.nom + ' ' + c.version);
    for (const c of [...fiche.contrats.produit, ...fiche.contrats.lit]) {
      if (c.catalogue) assert.ok(noms.includes(c.nom + ' ' + c.version), c.nom + ' est au catalogue');
      else assert.match(c.empreinte, /^sha256:[0-9a-f]{16}$/, c.nom);
    }
  });

  it('ThemeDef est lu, non catalogué, et déclaré avec empreinte', () => {
    const t = fiche.contrats.lit.find((c) => c.nom === 'ThemeDef');
    assert.equal(t.catalogue, false);
    assert.ok(t.empreinte);
  });

  it('les limites disent la lecture seule', () => {
    assert.ok(fiche.limites.some((l) => /lecture seule/.test(l)));
  });

  it('forms_capacites rend la fiche elle-même', () => {
    assert.deepEqual(registre.appeler('forms_capacites', {}).sortie, fiche);
  });

  it('le fichier versionné est ce que le registre rend (relancer generer-fiche.js sinon)', () => {
    assert.equal(fs.readFileSync(CHEMIN, 'utf8'), contenu());
  });

  it('commandes.json est ce que le registre rend, avec son identité (relancer generer-fiche.js sinon)', () => {
    assert.equal(fs.readFileSync(CHEMIN_COMMANDES, 'utf8'), contenuCommandes());
    const c = JSON.parse(fs.readFileSync(CHEMIN_COMMANDES, 'utf8'));
    assert.equal(c.contrat, 'commandes-0.1');
    assert.equal(c.widget, fiche.widget);
    assert.equal(c.version, fiche.version);
  });

  it('commandes.json et la fiche disent la même chose : mêmes noms, mêmes verbes, aucun écart', () => {
    const c = JSON.parse(fs.readFileSync(CHEMIN_COMMANDES, 'utf8'));
    const depuisFiche = Object.entries(fiche.verbes).flatMap(([verbe, noms]) => noms.map((n) => n + ':' + verbe)).sort();
    const depuisCommandes = c.commandes.map((k) => k.nom + ':' + k.verbe).sort();
    assert.deepEqual(depuisCommandes, depuisFiche);
  });

  it('la fiche et les exemples ne contiennent ni jeton ni clé', () => {
    const tout = JSON.stringify(registre.lister()) + JSON.stringify(fiche);
    assert.ok(!/[A-Za-z0-9]{32,}/.test(tout.replace(/sha256:[0-9a-f]{16}/g, '')), 'pas de longue chaîne opaque');
    assert.ok(!/api[_-]?key|token|secret|password/i.test(tout));
  });
});

describe('Registre Form Builder : le CLI', () => {
  const flux = () => { const s = { texte: '', write(t) { this.texte += t; } }; return s; };

  it('--liste imprime les commandes avec leur verbe et sort à 0', () => {
    const out = flux(); const err = flux();
    assert.equal(main(['--liste'], out, err), 0);
    for (const c of registre.commandes) assert.ok(out.texte.includes(c.nom), c.nom);
  });

  it('--decrire rend la commande, exemples compris', () => {
    const out = flux();
    assert.equal(main(['--decrire', 'forms_synthese'], out, flux()), 0);
    assert.equal(JSON.parse(out.texte).nom, 'forms_synthese');
  });

  it('une commande inconnue sort à 1 ; sans argument, à 2', () => {
    assert.equal(main(['forms_nexiste_pas'], flux(), flux()), 1);
    assert.equal(main([], flux(), flux()), 2);
  });

  it('une entrée invalide sort à 1 avec les écarts, une entrée illisible à 2', () => {
    const f = path.join(require('node:os').tmpdir(), 'forms-cli-entree-invalide.json');
    fs.writeFileSync(f, '{}');
    const err = flux();
    assert.equal(main(['forms_verifier_format', f], flux(), err), 1);
    assert.equal(JSON.parse(err.texte).code, 'entree-invalide');
    fs.writeFileSync(f, '{pas du json');
    assert.equal(main(['forms_verifier_format', f], flux(), flux()), 2);
    fs.rmSync(f);
  });

  it('une entrée correcte imprime exactement la sortie du registre et sort à 0', () => {
    const f = path.join(require('node:os').tmpdir(), 'forms-cli-entree-correcte.json');
    fs.writeFileSync(f, JSON.stringify({ format: 'codePostal', valeur: '13001' }));
    const out = flux();
    assert.equal(main(['forms_verifier_format', f], out, flux()), 0);
    assert.deepEqual(JSON.parse(out.texte), registre.appeler('forms_verifier_format', { format: 'codePostal', valeur: '13001' }).sortie);
    fs.rmSync(f);
  });
});

describe('Registre Form Builder : parité registre / fiche / CLI', () => {
  const CLI = path.join(DOSSIER, 'cli.js');
  const lancer = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

  it('le CLI lancé comme processus dit la même chose que le registre', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forms-parite-'));
    try {
      const adaptateur = {
        registre,
        fiche,
        listeCli: () => lancer(['--liste']).stdout.split(/\r?\n/).filter(Boolean).map((l) => l.trim().split(/\s+/).pop()),
        cli: (nom, entree) => {
          const f = path.join(dir, 'entree.json');
          fs.writeFileSync(f, JSON.stringify(entree));
          const r = lancer([nom, f]);
          const texte = r.status === 0 ? r.stdout : r.stderr;
          let sortie = null;
          try { sortie = JSON.parse(texte); } catch (e) { /* une sortie illisible fera échouer la parité */ }
          return { code: r.status, sortie };
        }
      };
      assert.deepEqual(verifierParite(adaptateur), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
