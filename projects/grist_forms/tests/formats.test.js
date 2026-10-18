'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const Formats = require('../shared/formats.js');

// ── des valeurs fabriquées, pas recopiées de mémoire ──

function cleLuhn(base) {
  for (let c = 0; c <= 9; c++) {
    const s = base + c;
    let somme = 0;
    for (let i = 0; i < s.length; i++) {
      let d = Number(s[s.length - 1 - i]);
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      somme += d;
    }
    if (somme % 10 === 0) return s;
  }
  throw new Error('inatteignable');
}

function ibanAvecCle(pays, bban) {
  const r = bban + pays + '00';
  let reste = 0;
  for (const ch of r) {
    for (const d of String(parseInt(ch, 36))) reste = (reste * 10 + Number(d)) % 97;
  }
  return pays + String(98 - reste).padStart(2, '0') + bban;
}

const IBAN_FR = ibanAvecCle('FR', '30006000011234567890189');
const IBAN_DE = ibanAvecCle('DE', '370400440532013000');
const SIREN = cleLuhn('73282932');          // 9 chiffres
const SIRET = cleLuhn('7328293200012');      // 14 chiffres
const SIRET_POSTE = '35600000000001';        // somme des chiffres (15) multiple de 5, établissement de La Poste

describe('Formats — JavaScript', () => {
  it('IBAN : clé et longueur du pays', () => {
    assert.equal(Formats.valide('iban', IBAN_FR), true);
    assert.equal(Formats.valide('iban', IBAN_FR.replace(/(.{4})/g, '$1 ')), true, 'avec espaces');
    assert.equal(Formats.valide('iban', IBAN_FR.toLowerCase()), true, 'en minuscules');
    assert.equal(Formats.valide('iban', IBAN_DE), true);
    assert.equal(Formats.valide('iban', IBAN_FR.slice(0, -1) + (IBAN_FR.slice(-1) === '0' ? '1' : '0')), false, 'un chiffre changé');
    assert.equal(Formats.valide('iban', IBAN_FR.slice(0, -1)), false, 'trop court pour la France');
    assert.equal(Formats.valide('iban', 'pas un iban'), false);
  });

  it('SIREN et SIRET : clé de Luhn, et le cas de La Poste', () => {
    assert.equal(Formats.valide('siren', SIREN), true);
    assert.equal(Formats.valide('siren', SIREN.slice(0, 8) + ((Number(SIREN[8]) + 1) % 10)), false);
    assert.equal(Formats.valide('siret', SIRET), true);
    assert.equal(Formats.valide('siret', SIRET.replace(/(...)/g, '$1 ')), true, 'avec espaces');
    assert.equal(Formats.valide('siret', SIRET_POSTE), true, 'La Poste suit une autre règle');
    assert.equal(Formats.valide('siret', '35600000000002'), false, 'La Poste : somme 16, pas un multiple de 5');
    assert.equal(Formats.valide('siret', SIRET.slice(0, 13) + ((Number(SIRET[13]) + 1) % 10)), false);
    assert.equal(Formats.valide('siren', '12345678'), false, '8 chiffres');
  });

  it('code postal, INSEE, courriel, téléphone', () => {
    assert.equal(Formats.valide('codePostal', '80000'), true);
    assert.equal(Formats.valide('codePostal', '00500'), false, 'sous 01000');
    assert.equal(Formats.valide('codePostal', '8000'), false);
    assert.equal(Formats.valide('insee', '80021'), true);
    assert.equal(Formats.valide('insee', '2A004'), true, 'Corse');
    assert.equal(Formats.valide('insee', '2C004'), false);
    assert.equal(Formats.valide('courriel', 'a.b@exemple.fr'), true);
    assert.equal(Formats.valide('courriel', 'a@b'), false);
    assert.equal(Formats.valide('courriel', 'a b@exemple.fr'), false);
    assert.equal(Formats.valide('telephone', '06 12 34 56 78'), true);
    assert.equal(Formats.valide('telephone', '+33 6 12 34 56 78'), true);
    assert.equal(Formats.valide('telephone', '0033612345678'), true);
    assert.equal(Formats.valide('telephone', '00 12 34 56 78'), false, 'ne commence pas par 01 à 09');
  });

  it('une valeur vide n’est pas un format faux, un format inconnu ne contrôle rien', () => {
    assert.equal(Formats.valide('iban', ''), true);
    assert.equal(Formats.valide('iban', null), true);
    assert.equal(Formats.valide('format-futur', 'n’importe quoi'), true);
    assert.equal(Formats.message('format-futur'), '');
  });

  it('normalise vers la forme qu’on enregistre', () => {
    assert.equal(Formats.normalise('iban', 'fr76 3000 6000 0112'), 'FR7630006000' + '0112');
    assert.equal(Formats.normalise('siret', '732 829 320 00012'), '73282932000012');
    assert.equal(Formats.normalise('telephone', '+33 6 12 34 56 78'), '0612345678');
    assert.equal(Formats.normalise('iban', ''), '');
  });

  it('une question déclare son format ; un nom inconnu est ignoré', () => {
    assert.equal(Formats.formatDeChamp({ options: { validation: { format: 'iban' } } }), 'iban');
    assert.equal(Formats.formatDeChamp({ options: { validation: { format: 'inconnu' } } }), null);
    assert.equal(Formats.formatDeChamp({ options: {} }), null);
    assert.equal(Formats.formatDeChamp({}), null);
  });
});

// ── la même règle en Python : exécutée, pas relue ──

function pythonDisponible() {
  const r = spawnSync('python', ['-I', '-c', 'print(1)'], { encoding: 'utf8' });
  return r.status === 0;
}

function verdictsPython(id, echantillons) {
  const source = [
    'import json, sys',
    Formats.definitionsPython([id]),
    'valeurs = json.loads(sys.stdin.read())',
    'print(json.dumps([bool(fmt_' + id + '(v)) for v in valeurs]))'
  ].join('\n');
  const r = spawnSync('python', ['-I', '-c', source], { input: JSON.stringify(echantillons), encoding: 'utf8' });
  if (r.status !== 0) throw new Error('Python a échoué : ' + r.stderr);
  return JSON.parse(r.stdout);
}

describe('Formats — le Python donne le verdict du JavaScript', { skip: !pythonDisponible() && 'Python indisponible' }, () => {
  const modifie = (s, i) => s.slice(0, i) + String((Number(s[i]) + 1) % 10) + s.slice(i + 1);
  const ECHANTILLONS = {
    iban: [IBAN_FR, IBAN_DE, IBAN_FR.replace(/(.{4})/g, '$1 '), IBAN_FR.toLowerCase(), IBAN_FR.slice(0, -1), IBAN_FR + '0',
      'FR00', 'XX0000000000000000', 'pas un iban', '', ' ', ibanAvecCle('GB', 'WEST12345698765432'), modifie(IBAN_FR, 10)],
    siren: [SIREN, SIREN.replace(/(...)/g, '$1 '), modifie(SIREN, 3), '12345678', '1234567890', 'abcdefghi', ''],
    siret: [SIRET, SIRET.replace(/(...)/g, '$1 '), SIRET_POSTE, modifie(SIRET, 5), '1234', 'x'.repeat(14), '35600000000002'],
    codePostal: ['80000', '01000', '00500', '98999', '99000', '8000', '800000', 'abcde', '80 000', ''],
    insee: ['80021', '2A004', '2B033', '2C004', '8002', '800210', 'abcde', ' 80021 ', '2a004', ''],
    courriel: ['a.b@exemple.fr', 'a@b', 'a b@exemple.fr', '@exemple.fr', 'a@exemple.', 'x'.repeat(250) + '@e.fr', ' a@exemple.fr ', ''],
    heure: ['09:30', '00:00', '23:59', '24:00', '9:30', '12:60', '1230', 'midi', ' 08:15 ', ''],
    telephone: ['06 12 34 56 78', '+33 6 12 34 56 78', '0033612345678', '0612345678', '00 12 34 56 78', '0112345', '+44 7911 123456', '06.12.34.56.78', '']
  };

  Object.keys(ECHANTILLONS).forEach((id) => {
    it(id, () => {
      const valeurs = ECHANTILLONS[id];
      // Une valeur vide est écartée avant le contrôle (voir `appelPython`) ;
      // ici on compare la règle nue, vide compris.
      const py = verdictsPython(id, valeurs);
      const js = valeurs.map((v) => Formats.FORMATS[id].valider(v));
      valeurs.forEach((v, i) => {
        assert.equal(py[i], js[i], id + ' : « ' + v + ' » — JavaScript ' + js[i] + ', Python ' + py[i]);
      });
    });
  });

  it('l’appel de contrôle laisse passer une cellule vide', () => {
    assert.equal(Formats.appelPython('iban', '$Iban'), '(not $Iban or fmt_iban($Iban))');
  });
});

describe('Formats — dans le moteur', () => {
  const Engine = require('../runtime/engine.js');
  const { createRoot } = require('./helpers/fake-dom.js');

  const formulaire = (format) => ({
    id: 'don', title: 'Don', tableId: 'Dons',
    sections: [{ label: 'Vos coordonnées', fields: [
      { colId: 'Iban', label: 'Votre IBAN', type: 'Text', widget: 'text', required: true, options: { validation: { format } } },
      { colId: 'Tel', label: 'Téléphone', type: 'Text', widget: 'text', options: { validation: { format: 'telephone' } } }
    ] }]
  });

  async function envoyer(def, saisies) {
    const root = createRoot();
    let envoye = null;
    Engine.mount(root, def, { skipProbe: true, submit: (d) => { envoye = d; return Promise.resolve({ ok: true }); } });
    Object.keys(saisies).forEach((k) => { root.querySelector('[name="' + k + '"]').value = saisies[k]; });
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 5));
    return { envoye, root };
  }

  it('un IBAN faux ne part pas, et la question dit pourquoi', async () => {
    const { envoye, root } = await envoyer(formulaire('iban'), { Iban: 'FR00 1234' });
    assert.equal(envoye, null, 'rien n’est envoyé');
    const msg = root.querySelector('[data-error-for="Iban"]');
    assert.ok(msg, 'le message est sous la question');
    assert.match(msg.textContent, /IBAN/);
  });

  it('un IBAN juste part sous sa forme normalisée, sans espaces', async () => {
    const { envoye } = await envoyer(formulaire('iban'), { Iban: IBAN_FR.replace(/(.{4})/g, '$1 ').toLowerCase(), Tel: '06 12 34 56 78' });
    assert.ok(envoye);
    assert.equal(envoye.Iban, IBAN_FR);
    assert.equal(envoye.Tel, '0612345678');
  });

  it('une question facultative laissée vide n’est pas en faute', async () => {
    const { envoye } = await envoyer(formulaire('iban'), { Iban: IBAN_FR });
    assert.ok(envoye, 'le téléphone vide ne bloque pas');
  });

  it('un format que le moteur ne connaît pas ne contrôle rien', async () => {
    const { envoye } = await envoyer(formulaire('format-futur'), { Iban: 'peu importe' });
    assert.ok(envoye);
    assert.equal(envoye.Iban, 'peu importe');
  });
});
