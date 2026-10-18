/*
 * referentiel-champ.test.js — le champ « adresse » dans le moteur.
 *
 * Le module (`referentiel.js`) sait chercher et proposer ; ici on vérifie ce
 * que le MOTEUR en fait : le champ qu'il dessine, ce qu'il écrit, et ce qu'il
 * n'écrit pas.
 *
 * La règle qui commande tout le reste : **les colonnes annexes ne valent que
 * pour l'adresse choisie.** Si quelqu'un choisit « 8 Boulevard du Port 80000
 * Amiens » puis corrige le numéro, le code postal et les coordonnées qui
 * restent dans la ligne sont ceux d'une autre porte. Mieux vaut des annexes
 * vides qu'une adresse et des coordonnées qui se contredisent.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

const ANNEXES = {
  codePostal: 'CP', commune: 'Ville', insee: 'INSEE',
  latitude: 'Lat', longitude: 'Lon', identifiant: 'BanId'
};

function champ(extra) {
  const f = {
    colId: 'Adresse', label: 'Adresse du désordre', type: 'Text', widget: 'text', kind: 'referentiel',
    options: { referentiel: { source: 'ban' }, colonnes: { annexes: ANNEXES } }
  };
  if (extra) Object.assign(f.options, extra);
  return f;
}

function formDef(f) {
  return {
    manifest_version: '1.0.0', id: 'f', title: 'T', tableId: 'T', composeMode: 'bind', choices: {},
    sections: [{ id: 's', label: 'Étape', fields: [f || champ()] }]
  };
}

const CHOISIE = '8 Boulevard du Port 80000 Amiens';
function valeursChoisies() {
  return {
    Adresse: CHOISIE, 'Adresse__choisi': CHOISIE,
    CP: '80000', Ville: 'Amiens', INSEE: '80021', Lat: 49.897442, Lon: 2.290084, BanId: 'abc-123'
  };
}

describe('le champ que le moteur dessine', () => {
  it('une saisie à liste de suggestions, repérable par le moteur', () => {
    const html = Engine.renderFieldHtml(champ(), {}, null, formDef());
    assert.ok(html.includes('data-referentiel-de="Adresse"'));
    assert.ok(html.includes('data-source="ban"'));
    assert.ok(html.includes('data-referentiel-champ'), 'le champ texte qui portera la liste');
    assert.ok(html.includes('autocomplete="off"'), 'le navigateur ne propose pas ses propres adresses par-dessus');
    assert.ok(html.includes('name="Adresse"'));
  });

  it('par défaut, la recherche part sur validation — un bouton la lance', () => {
    const html = Engine.renderFieldHtml(champ(), {}, null, formDef());
    assert.ok(html.includes('data-declenchement="validation"'));
    assert.ok(html.includes('fr-referentiel__bouton'), 'un bouton pour qui n’a pas de touche Entrée');
    assert.ok(html.includes('Rechercher'));
  });

  it('à la frappe, il n’y a pas de bouton à presser', () => {
    const html = Engine.renderFieldHtml(
      champ({ referentiel: { source: 'ban', declenchement: 'frappe' } }), {}, null, formDef());
    assert.ok(html.includes('data-declenchement="frappe"'));
    assert.ok(!html.includes('fr-referentiel__bouton'));
  });

  it('dit à la personne où partent ses caractères, et quand', () => {
    const validation = Engine.renderFieldHtml(champ(), {}, null, formDef());
    assert.ok(validation.includes('Géoplateforme'));
    assert.ok(validation.includes('lorsque vous la lancez'), 'rien ne part avant qu’elle ne le demande');
    const frappe = Engine.renderFieldHtml(
      champ({ referentiel: { source: 'ban', declenchement: 'frappe' } }), {}, null, formDef());
    assert.ok(frappe.includes('Géoplateforme'));
    assert.ok(!frappe.includes('lorsque vous la lancez'));
  });

  it('annonce ses résultats aux lecteurs d’écran', () => {
    const html = Engine.renderFieldHtml(champ(), {}, null, formDef());
    assert.ok(html.includes('role="status"'));
    assert.ok(html.includes('aria-live="polite"'));
  });

  it('une source que le moteur ne connaît pas reste un champ texte', () => {
    const html = Engine.renderFieldHtml(
      champ({ referentiel: { source: 'bdtopo' } }), {}, null, formDef());
    assert.ok(html.includes('type="text"'));
    assert.ok(html.includes('name="Adresse"'));
    assert.ok(!html.includes('data-referentiel-de'), 'rien n’est promis qu’on ne sait pas tenir');
  });

  it('sans source déclarée, c’est aussi un champ texte', () => {
    const f = champ();
    delete f.options.referentiel;
    const html = Engine.renderFieldHtml(f, {}, null, formDef(f));
    assert.ok(!html.includes('data-referentiel-de'));
    assert.ok(html.includes('name="Adresse"'));
  });

  it('remet la valeur saisie, échappée', () => {
    const html = Engine.renderFieldHtml(champ(), { Adresse: '8 "bd" <b>du port' }, null, formDef());
    assert.ok(html.includes('value="8 &quot;bd&quot; &lt;b&gt;du port"'));
    assert.ok(!html.includes('<b>du port'));
  });

  it('porte l’obligation comme les autres champs', () => {
    const f = champ();
    f.required = true;
    const html = Engine.renderFieldHtml(f, {}, null, formDef(f));
    assert.ok(/<input[^>]*\brequired\b/.test(html));
    assert.ok(html.includes('fr-obligatoire'));
  });
});

describe('ce que le moteur écrit', () => {
  it('une adresse choisie écrit son texte et ses annexes', () => {
    const out = Engine.collectSubmitData(formDef(), valeursChoisies(), {}, { creation: true });
    assert.equal(out.Adresse, CHOISIE);
    assert.equal(out.CP, '80000');
    assert.equal(out.Ville, 'Amiens');
    assert.equal(out.INSEE, '80021');
    assert.equal(out.BanId, 'abc-123');
  });

  it('les coordonnées restent des nombres, et le code INSEE un texte', () => {
    const out = Engine.collectSubmitData(formDef(), valeursChoisies(), {}, { creation: true });
    assert.equal(out.Lat, 49.897442);
    assert.equal(out.Lon, 2.290084);
    assert.equal(typeof out.Lat, 'number');
    assert.equal(typeof out.INSEE, 'string');
  });

  it('une adresse corrigée après le choix n’emporte plus les annexes de l’ancienne', () => {
    const v = valeursChoisies();
    v.Adresse = '18 Boulevard du Port 80000 Amiens';
    const out = Engine.collectSubmitData(formDef(), v, {}, { creation: true });
    assert.equal(out.Adresse, '18 Boulevard du Port 80000 Amiens', 'le texte tapé est gardé');
    ['CP', 'Ville', 'INSEE', 'Lat', 'Lon', 'BanId'].forEach((c) => {
      assert.equal(out[c], null, c + ' ne décrit plus l’adresse saisie');
    });
  });

  it('une adresse jamais choisie s’enregistre telle quelle, sans annexes', () => {
    const out = Engine.collectSubmitData(formDef(), { Adresse: '8 bd du port amiens' }, {}, { creation: true });
    assert.equal(out.Adresse, '8 bd du port amiens');
    assert.equal(out.CP, null);
    assert.equal(out.Lat, null);
  });

  it('des espaces en plus ne font pas perdre l’adresse choisie', () => {
    const v = valeursChoisies();
    v.Adresse = '  8  Boulevard du Port   80000 Amiens ';
    const out = Engine.collectSubmitData(formDef(), v, {}, { creation: true });
    assert.equal(out.CP, '80000', 'même adresse, blancs mis à part');
  });

  it('une annexe sans colonne n’est pas écrite', () => {
    const f = champ();
    f.options.colonnes.annexes = { codePostal: 'CP' };
    const out = Engine.collectSubmitData(formDef(f), valeursChoisies(), {}, { creation: true });
    assert.equal(out.CP, '80000');
    assert.ok(!('Ville' in out), 'aucune colonne n’a été désignée pour la commune');
  });

  it('une annexe dont la colonne est vide n’écrit nulle part', () => {
    const f = champ();
    f.options.colonnes.annexes = { codePostal: '', commune: 'Ville' };
    const out = Engine.collectSubmitData(formDef(f), valeursChoisies(), {}, { creation: true });
    assert.ok(!('' in out));
    assert.equal(out.Ville, 'Amiens');
  });

  it('une question cachée vide aussi ses annexes', () => {
    const f = champ();
    f.condition = { field: 'Cacher', operator: '==', value: 'non' };
    const v = Object.assign(valeursChoisies(), { Cacher: 'oui' });
    const out = Engine.collectSubmitData(formDef(f), v, {}, { creation: true });
    ['CP', 'Ville', 'INSEE', 'Lat', 'Lon', 'BanId'].forEach((c) => {
      assert.equal(out[c], null, c + ' d’une personne précédente ne reste pas dans la ligne');
    });
  });
});

describe('le champ dans un formulaire monté', () => {
  it('modifier une ligne garde ses annexes tant que l’adresse n’a pas bougé', async () => {
    const root = createRoot();
    let envoye = null;
    Engine.mount(root, formDef(), {
      values: { Adresse: CHOISIE, CP: '80000', Ville: 'Amiens', INSEE: '80021', Lat: 49.897442, Lon: 2.290084, BanId: 'abc-123' },
      editRowId: 7,
      submit: (data) => { envoye = data; return Promise.resolve({ ok: true }); }
    });
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 5));
    assert.ok(envoye, 'le formulaire est parti');
    assert.equal(envoye.CP, '80000', 'rien n’a changé : les annexes ne s’effacent pas en modifiant une autre question');
    assert.equal(envoye.Lat, 49.897442);
  });

  it('modifier l’adresse d’une ligne efface les annexes de l’ancienne', async () => {
    const root = createRoot();
    let envoye = null;
    Engine.mount(root, formDef(), {
      values: { Adresse: CHOISIE, CP: '80000', Ville: 'Amiens', INSEE: '80021', Lat: 49.897442, Lon: 2.290084, BanId: 'abc-123' },
      editRowId: 7,
      submit: (data) => { envoye = data; return Promise.resolve({ ok: true }); }
    });
    root.querySelector('[name="Adresse"]').value = '12 rue Neuve 80000 Amiens';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(envoye.Adresse, '12 rue Neuve 80000 Amiens');
    assert.equal(envoye.CP, null);
    assert.equal(envoye.Lat, null);
  });

  it('une ligne sans annexes ne se voit pas en prêter', async () => {
    const root = createRoot();
    let envoye = null;
    Engine.mount(root, formDef(), {
      values: { Adresse: '8 bd du port amiens' },
      editRowId: 7,
      submit: (data) => { envoye = data; return Promise.resolve({ ok: true }); }
    });
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(envoye.Adresse, '8 bd du port amiens');
    assert.equal(envoye.CP, null);
  });

  it('le champ échappe au redessin générique, qui détruirait la liste ouverte', () => {
    const root = createRoot();
    Engine.mount(root, formDef(), { submit: () => Promise.resolve() });
    const saisie = root.querySelector('[data-referentiel-champ]');
    assert.ok(saisie, 'le champ est monté');
    assert.ok(!(saisie.listeners.change && saisie.listeners.change.length),
      'un `change` redessine le formulaire : pressé sur Entrée, il emporterait la liste de suggestions');
  });

  it('les autres champs, eux, gardent leur redessin', () => {
    const root = createRoot();
    const autre = { colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text' };
    const def = formDef();
    def.sections[0].fields.push(autre);
    Engine.mount(root, def, { submit: () => Promise.resolve() });
    const nom = root.querySelector('[name="Nom"]');
    assert.ok(nom.listeners.change && nom.listeners.change.length, 'un champ ordinaire écoute toujours `change`');
  });
});
