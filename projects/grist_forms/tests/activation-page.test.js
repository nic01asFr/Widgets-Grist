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
    const lisibilite = fonction('lisibiliteDe');
    assert.match(lisibilite, /A\.modesDisponibles\(doc\)\.forEach/);
    assert.match(lisibilite, /A\.themeVars\(doc, m\)\.remarques/);
    const f = fonction('ouvrirActivation');
    assert.match(f, /lisibiliteDe\(doc\)/);
    assert.ok(f.indexOf('Lisibilité à revoir') > -1 && f.indexOf('Lisibilité à revoir') < f.indexOf('table-a-creer'), 'avant la demande de créer la table');
    assert.match(f, /déjà le thème actif du document/);
    assert.match(fonction('ouvrirActivationAppareil'), /lisibiliteDe\(doc\)/, 'et pareil hors Grist');
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

  it('hors Grist, le thème va sur l’appareil : le magasin local n’a AUCUN geste de table, et ne ressemble plus à une démonstration', () => {
    const local = PAGE.slice(PAGE.indexOf('function magasinLocal()'), PAGE.indexOf('function choisirMagasin()'));
    for (const m of ['lireThemeDocument', 'creerThemeDocument', 'appliquerLot', 'Theme_document']) assert.ok(!local.includes(m), 'le magasin local ne parle pas de ' + m);
    assert.match(local, /cible: 'appareil'/);
    assert.match(local, /persiste: function \(\)/, 'il dit quand le navigateur refuse de garder');
    const grist = PAGE.slice(PAGE.indexOf('function magasinGrist('), PAGE.indexOf('function magasinLocal()'));
    assert.match(grist, /cible: 'document'/);
    for (const m of ['lireThemeDocument', 'creerThemeDocument', 'appliquerLot']) assert.ok(grist.includes(m + ':'), 'dans Grist : ' + m);
    assert.ok(!/Mode démonstration/.test(PAGE), 'plus de « mode démonstration »');
  });

  it('le thème du visiteur n’est touché que dans le bloc « sur cet appareil », jamais depuis le chemin de Grist', () => {
    const debut = PAGE.indexOf('// ── Hors Grist : le thème reste sur cet appareil');
    const fin = PAGE.indexOf('// ── Le catalogue ──');
    assert.ok(debut > -1 && fin > debut);
    const hors = PAGE.slice(0, debut) + PAGE.slice(fin);
    const dehors = (hors.match(/\bVIS\./g) || []).length;
    assert.equal(dehors, 0, 'aucun appel VIS. en dehors du bloc « sur cet appareil »');
    assert.ok((PAGE.slice(debut, fin).match(/\bVIS\./g) || []).length >= 5, 'et le bloc s’en sert');
    assert.equal((PAGE.match(/var VIS = window\.FormThemeVisiteur/g) || []).length, 1);
    // Les trois portes d'entrée n'y mènent que si la page est hors Grist.
    assert.match(fonction('afficherActifDoc'), /if \(surAppareil\(\)\) return afficherActifAppareil\(\)/);
    assert.match(fonction('ouvrirActivation'), /if \(surAppareil\(\)\) return ouvrirActivationAppareil\(sorte\)/);
    assert.match(fonction('confirmerActivation'), /if \(a\.appareil\) return confirmerActivationAppareil\(\)/);
    assert.match(fonction('surAppareil'), /S\.magasin\.cible === 'appareil'/);
    assert.match(PAGE, /<script src="shared\/theme-visiteur\.js"><\/script>/);
  });

  it('hors Grist, un thème refusé n’est pas gardé et le dit ; appliquer ne touche jamais à une table', () => {
    const f = fonction('ouvrirActivationAppareil');
    assert.match(f, /Ce thème ne peut pas être gardé/);
    assert.ok(!/applyUserActions|AddTable|AddRecord|UpdateRecord|appliquerLot|creerThemeDocument/.test(f + fonction('confirmerActivationAppareil')));
    assert.match(fonction('confirmerActivationAppareil'), /VIS\.ecrire\(a\.themedef\)/);
    assert.match(fonction('confirmerActivationAppareil'), /persiste === false/, 'jamais « gardé » quand le navigateur n’a rien retenu');
  });
});

describe('Page design-system : un thème refusé par les lecteurs est dit tel quel', () => {
  it('l’état du document et le verdict après écriture nomment le refus', () => {
    assert.match(PAGE, /'contraste-insuffisant': 'Le thème actif du document/);
    assert.match(PAGE, /'resolu-incomplet': 'Le thème actif du document/);
    assert.match(PAGE, /\['contraste-insuffisant', 'resolu-incomplet', 'version-inconnue'\]\.indexOf\(v\.raison\) !== -1\) return 'Écrit, mais les lecteurs le refusent/);
  });
});
