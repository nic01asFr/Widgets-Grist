'use strict';

/*
 * Un lieu se renseigne par la carte, par une adresse, ou au choix.
 * La carte et le service d'adresses se mesurent dans un navigateur ; ici, la règle et le rendu.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Saisies = require('../shared/saisies.js');
const Engine = require('../runtime/engine.js');
const Ensure = require('../shared/ensure-schema.js');
const { createRoot } = require('./helpers/fake-dom.js');

const def = (champs) => ({ id: 'essai', title: 'Essai', tableId: 'T', sections: [{ label: 'S', fields: champs }] });
const geo = (options) => ({ colId: 'Lieu', label: 'Où ?', type: 'Text', widget: 'geo', kind: 'geometrie', options: Object.assign({ geometrie: 'Point' }, options) });

describe('Lieu — la règle', () => {
  it('sans réglage, la carte seule : rien ne change pour les formulaires existants', () => {
    assert.equal(Saisies.modeLieu(geo({}), true), 'carte');
  });

  it('les trois modes se lisent', () => {
    assert.equal(Saisies.modeLieu(geo({ saisieLieu: 'les-deux' }), true), 'les-deux');
    assert.equal(Saisies.modeLieu(geo({ saisieLieu: 'adresse' }), true), 'adresse');
    assert.equal(Saisies.modeLieu(geo({ saisieLieu: 'carte' }), true), 'carte');
  });

  it('une valeur inconnue retombe sur la carte', () => {
    assert.equal(Saisies.modeLieu(geo({ saisieLieu: 'telepathie' }), true), 'carte');
  });

  it('une ligne ou une surface reste à la carte : une adresse ne désigne qu\'un point', () => {
    assert.equal(Saisies.modeLieu(geo({ geometrie: 'LineString', saisieLieu: 'les-deux' }), true), 'carte');
    assert.equal(Saisies.modeLieu(geo({ geometrie: 'Polygon', saisieLieu: 'adresse' }), true), 'carte');
  });

  it('sans le service d\'adresses, la carte seule : on ne promet pas ce qu\'on ne tient pas', () => {
    assert.equal(Saisies.modeLieu(geo({ saisieLieu: 'les-deux' }), false), 'carte');
  });
});

describe('Lieu — le point qu\'une adresse désigne', () => {
  const adresse = { libelle: '8 Boulevard du Port 80000 Amiens', longitude: 2.301, latitude: 49.892 };

  it('donne le point au format de la colonne et le libellé à montrer', () => {
    assert.deepEqual(Saisies.lieuDepuisSuggestion(adresse), { wkt: 'POINT (2.301 49.892)', longitude: 2.301, latitude: 49.892, libelle: '8 Boulevard du Port 80000 Amiens' });
  });

  it('une adresse sans coordonnées ne désigne rien — et 0 n\'est pas « absent »', () => {
    assert.equal(Saisies.lieuDepuisSuggestion({ libelle: 'x', longitude: null, latitude: null }), null);
    assert.equal(Saisies.lieuDepuisSuggestion({ libelle: 'x' }), null);
    assert.equal(Saisies.lieuDepuisSuggestion(null), null);
    assert.ok(Saisies.lieuDepuisSuggestion({ libelle: 'équateur', longitude: 0, latitude: 0 }), 'le point (0 ; 0) existe');
  });

  it('des coordonnées hors du globe sont refusées', () => {
    assert.equal(Saisies.lieuDepuisSuggestion({ libelle: 'x', longitude: 200, latitude: 10 }), null);
    assert.equal(Saisies.lieuDepuisSuggestion({ libelle: 'x', longitude: 10, latitude: -91 }), null);
    assert.equal(Saisies.lieuDepuisSuggestion({ libelle: 'x', longitude: 'abc', latitude: 10 }), null);
  });

  it('le libellé est nettoyé : une ligne, sans caractères de commande, bornée', () => {
    const l = Saisies.lieuDepuisSuggestion({ libelle: 'a\u0000b\n  c' + 'x'.repeat(400), longitude: 1, latitude: 1 });
    assert.ok(l.libelle.startsWith('a b c'));
    assert.ok(l.libelle.length <= 200);
  });
});

describe('Lieu — dans le moteur', () => {
  it('par défaut le rendu est celui d\'avant : ni onglet, ni champ d\'adresse', () => {
    const html = Engine.renderFieldHtml(geo({}), {}, null, def([]));
    assert.ok(!/data-lieu-(onglet|panneau|adresse)|fr-lieu__/.test(html));
    assert.match(html, /data-widget="geo" data-lieu-mode="carte"/);
    assert.match(html, /data-carte-de="Lieu"/);
  });

  it('« les deux » donne deux onglets, la carte d\'abord, et un champ d\'adresse masqué', () => {
    const html = Engine.renderFieldHtml(geo({ saisieLieu: 'les-deux' }), {}, null, def([]));
    assert.match(html, /data-lieu-onglet="carte" aria-pressed="true">Sur la carte/);
    assert.match(html, /data-lieu-onglet="adresse" aria-pressed="false">Par adresse/);
    assert.match(html, /data-lieu-panneau="carte">/);
    assert.match(html, /data-lieu-panneau="adresse"[^>]*hidden/);
    assert.match(html, /<input[^>]*name="Lieu__adresse"[^>]*data-lieu-adresse/);
  });

  it('le texte du point est caché dès qu\'il y a une adresse ; la carte seule le laisse comme avant', () => {
    const deux = Engine.renderFieldHtml(geo({ saisieLieu: 'les-deux' }), {}, null, def([]));
    assert.match(deux, /<input[^>]*name="Lieu"[^>]*placeholder="POINT \(5\.37 43\.29\)" hidden/);
    const carte = Engine.renderFieldHtml(geo({}), {}, null, def([]));
    assert.ok(!/placeholder="POINT \(5\.37 43\.29\)" hidden/.test(carte));
  });

  it('« adresse » seule : pas de carte, pas d\'onglet, le champ d\'adresse visible', () => {
    const html = Engine.renderFieldHtml(geo({ saisieLieu: 'adresse' }), {}, null, def([]));
    assert.ok(!/data-carte-de|fr-lieu__bascule/.test(html));
    assert.ok(!/data-lieu-panneau="adresse"[^>]*hidden/.test(html));
  });

  it('une carte désactivée avec « les deux » ne laisse pas un onglet vers rien', () => {
    const html = Engine.renderFieldHtml(geo({ saisieLieu: 'les-deux', carte: false }), {}, null, def([]));
    assert.ok(!/fr-lieu__bascule/.test(html));
    assert.ok(!/data-lieu-panneau="adresse"[^>]*hidden/.test(html));
  });

  it('l\'onglet et le lieu choisi survivent à un redessin', () => {
    const html = Engine.renderFieldHtml(geo({ saisieLieu: 'les-deux' }),
      { Lieu: 'POINT(2.301 49.892)', Lieu__lieuOnglet: 'adresse', Lieu__lieuTexte: '8 boulevard', Lieu__lieuChoisi: '8 Boulevard du Port 80000 Amiens' }, null, def([]));
    assert.match(html, /data-lieu-onglet="adresse" aria-pressed="true"/);
    assert.match(html, /data-lieu-panneau="carte" hidden/);
    assert.match(html, /value="8 boulevard"/);
    assert.match(html, /Lieu choisi : 8 Boulevard du Port 80000 Amiens/);
  });

  it('le libellé choisi et le texte tapé sont échappés', () => {
    const html = Engine.renderFieldHtml(geo({ saisieLieu: 'les-deux' }),
      { Lieu__lieuTexte: '"><img src=x onerror=alert(1)>', Lieu__lieuChoisi: '<script>alert(1)</script>' }, null, def([]));
    assert.ok(!html.includes('<img') && !html.includes('<script>'), html);
  });

  it('un point posé par une adresse part comme n\'importe quel point, sans clé interne', async () => {
    const root = createRoot();
    let envoye = null;
    Engine.mount(root, def([geo({ saisieLieu: 'les-deux' })]), {
      skipProbe: true,
      values: { Lieu: 'POINT(2.301 49.892)', Lieu__lieuChoisi: '8 Boulevard du Port', Lieu__lieuTexte: '8 bd' },
      submit: (d) => { envoye = d; return Promise.resolve({ ok: true }); }
    });
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(envoye);
    assert.equal(envoye.Lieu, 'POINT(2.301 49.892)');
    assert.deepEqual(Object.keys(envoye).filter((k) => /lieu/i.test(k) && k !== 'Lieu'), []);
  });
});

describe('Lieu — une seule écriture du point', () => {
  const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

  it('aucun geste n\'écrit « POINT(x y) » sans espace : la carte écrit « POINT (x y) » et la colonne ne mélange pas deux formes', () => {
    ['runtime/engine.js', 'shared/saisies.js'].forEach((f) => {
      assert.ok(!/'POINT\(/.test(lire(f)), f + ' écrit un point sans espace');
    });
    assert.match(lire('runtime/engine.js'), /'POINT \(' \+ lon/);
  });
});

describe('Lieu — le contrat', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'runtime', 'formdef.schema.json'), 'utf8'));
  const options = schema.definitions.field.properties.options.properties;

  it('le schéma déclare saisieLieu, ses trois valeurs et la carte par défaut', () => {
    assert.deepEqual(options.saisieLieu.enum, ['carte', 'adresse', 'les-deux']);
    assert.equal(options.saisieLieu.default, 'carte');
  });

  it('la liste du moteur et celle du schéma sont la même', () => {
    assert.deepEqual(Saisies.MODES_LIEU, options.saisieLieu.enum);
  });

  it('une question de lieu à deux modes n\'ajoute aucune colonne : le point est dans la même colonne', () => {
    const r = Ensure.bindingIsComplete(Object.assign(def([geo({ saisieLieu: 'les-deux' })]), { composeMode: 'ensureSchema' }));
    assert.equal(r.ok, true, (r.errors || []).join(' / '));
  });
});
