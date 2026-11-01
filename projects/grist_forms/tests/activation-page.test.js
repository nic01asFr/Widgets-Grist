'use strict';

/**
 * Le bouton « Appliquer ce thème au document » de design-system.html : les garanties se lisent dans le code de la page, parce que la page
 * est le seul endroit qui écrit. Ces tests tiennent la forme du geste ; le comportement a été mesuré dans un navigateur (démonstration)
 * puis dans un vrai document Grist.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PAGE = fs.readFileSync(path.join(__dirname, '..', 'design-system.html'), 'utf8');
const fonction = (nom) => {
  const debut = PAGE.indexOf('function ' + nom + '(');
  assert.ok(debut > -1, nom + ' existe');
  const suivante = PAGE.indexOf('\n  function ', debut + 10);
  return PAGE.slice(debut, suivante > -1 ? suivante : undefined);
};

describe('Page design-system : le geste d\'activation', () => {
  it('charge la copie du kit puis le geste, avant le script de la page', () => {
    const copie = PAGE.indexOf('<script src="shared/activation.js">');
    const geste = PAGE.indexOf('<script src="shared/activation-geste.js">');
    const themedef = PAGE.indexOf('<script src="shared/themedef.js">');
    const page = PAGE.indexOf('<script>\n/**\n * Saisir un design system');
    assert.ok(themedef > -1 && themedef < copie && copie < geste && geste < page);
  });

  it('un brouillon n\'écrit jamais dans Theme_document : seul le geste confirmé le fait', () => {
    const confirme = fonction('confirmerActivation');
    assert.ok(/S\.magasin\.appliquerLot\(/.test(confirme) && /S\.magasin\.creerThemeDocument\(/.test(confirme), 'le geste confirmé écrit');
    // Les seuls appels sont dans confirmerActivation.
    const hors = PAGE.replace(fonction('confirmerActivation'), '');
    assert.ok(!/S\.magasin\.appliquerLot\(/.test(hors), 'appliquerLot n\'est appelé que par le geste confirmé');
    assert.ok(!/S\.magasin\.creerThemeDocument\(/.test(hors), 'la table n\'est créée que par le geste confirmé');
    for (const nom of ['ouvrirActivation', 'afficherActifDoc', 'demarrer', 'ouvrir', 'brouillon', 'enregistrer']) {
      assert.ok(!/appliquerLot|creerThemeDocument/.test(fonction(nom)), nom + ' n\'écrit pas dans Theme_document');
    }
  });

  it('la lisibilité à revoir est dite avant d’écrire, mode par mode, et une ligne déjà active n’est pas présentée comme absente', () => {
    const f = fonction('ouvrirActivation');
    assert.match(f, /A\.modesDisponibles\(doc\)\.forEach/);
    assert.match(f, /A\.themeVars\(doc, m\)\.remarques/);
    assert.ok(f.indexOf('Lisibilité à revoir') > -1 && f.indexOf('Lisibilité à revoir') < f.indexOf('table-a-creer'), 'avant la demande de créer la table');
    assert.match(f, /déjà le thème actif du document/);
  });

  it('ouvrir le geste ne fait que lire et montrer', () => {
    const f = fonction('ouvrirActivation');
    assert.match(f, /lireThemeDocument\(\)/);
    assert.match(f, /G\.preparer\(/);
    assert.match(f, /G\.retrait\(/);
    assert.ok(!/applyUserActions|AddTable|AddRecord|UpdateRecord/.test(f));
  });

  it('le lot est refait sur la table telle qu\'elle est AU MOMENT de confirmer, et refusé s\'il n\'est plus applicable', () => {
    const f = fonction('confirmerActivation');
    assert.ok(f.indexOf('creerThemeDocument()') < f.indexOf('G.preparer('), 'la table est créée avant de préparer le lot');
    assert.match(f, /p2\.etat !== 'pret'/);
    assert.ok(f.indexOf("p2.etat !== 'pret'") < f.indexOf('appliquerLot(p2.actions)'));
    assert.match(f, /table-a-creer/);
    assert.ok(/tableCreee/.test(f), 'si le lot échoue après la création de la table, on le dit');
  });

  it('le résultat est relu après l\'écriture, avec la règle de lecture de tous les lecteurs', () => {
    const f = fonction('confirmerActivation');
    assert.ok(f.indexOf('lireThemeDocument()') > f.indexOf('appliquerLot'));
    assert.match(f, /G\.relire\(/);
    assert.match(PAGE, /plusieurs-actifs'\) return 'Écrit, mais plusieurs thèmes sont actifs/);
  });

  it('la clé de la ligne vient de l\'identifiant du design system, jamais d\'une saisie libre sans contrôle', () => {
    const f = fonction('ouvrirActivation');
    assert.match(f, /G\.cleDe\(/);
    assert.match(f, /doc\.identite && typeof doc\.identite\.id === 'string'/);
  });

  it('aucune suppression de ligne ni de table, nulle part dans le geste', () => {
    const bloc = PAGE.slice(PAGE.indexOf('// ── Appliquer ce thème au document'), PAGE.indexOf('// ── Le catalogue'));
    assert.ok(!/RemoveRecord|BulkRemoveRecord|RemoveTable|DeleteRecord/.test(bloc));
  });

  it('les boutons, le panneau de confirmation et l\'état actif du document existent', () => {
    for (const id of ['ds-activer', 'ds-retirer', 'ds-actif-doc', 'ds-activation', 'ds-activation-corps', 'ds-activation-erreur', 'ds-activation-confirmer', 'ds-activation-annuler']) {
      assert.ok(PAGE.includes('id="' + id + '"'), id);
    }
    assert.match(PAGE, /<section[^>]*id="ds-activation"[^>]*hidden/, 'le panneau est caché tant qu\'on ne l\'ouvre pas');
    assert.match(PAGE, /id="ds-activation-erreur"[^>]*role="alert"/);
  });

  it('le texte de la page ne dit plus que l\'activation est « ailleurs »', () => {
    assert.ok(!/l’activation relève de l’éditeur d’apparence/.test(PAGE));
    assert.ok(!/Seule une personne peut le rendre actif, ailleurs/.test(PAGE));
  });

  it('en démonstration, le même geste agit sur une table fictive gardée dans l\'onglet', () => {
    const local = PAGE.slice(PAGE.indexOf('function magasinLocal()'), PAGE.indexOf('function choisirMagasin()'));
    for (const m of ['lireThemeDocument', 'creerThemeDocument', 'appliquerLot']) assert.ok(local.includes(m + ':'), m);
    assert.match(local, /La table Theme_document n’existe pas/);
  });
});
