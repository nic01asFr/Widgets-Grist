'use strict';

/*
 * Les limites d'un formulaire : un atelier de 12 places, une fenêtre d'ouverture, un plafond de réponses.
 * Le formulaire lit et ferme ; la formule de la table tranche. Les deux sont testées, la seconde en Python.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const L = require('../shared/limites.js');

const ok = (brut) => { const r = L.normaliser(brut); assert.deepEqual(r.erreurs, [], JSON.stringify(brut)); return r.limites; };
const lignes = (...specs) => specs.map((s, i) => Object.assign({ id: i + 1 }, s));
const le = (iso) => new Date(iso);

describe('Limites — ce qui est accepté, ce qui est dit', () => {
  it('rien à tenir : pas de limites', () => {
    assert.equal(L.normaliser(undefined).limites, null);
    assert.equal(L.normaliser({}).limites, null);
    assert.deepEqual(L.normaliser(null).erreurs, []);
  });

  it('retient total, fenêtre, limites par choix et lignes écartées', () => {
    const l = ok({
      total: 40, ouvertDu: '2026-11-01', jusquau: '2026-11-30T18:00',
      parChoix: [{ colId: 'Atelier', max: { A: 12, B: 8 } }, { colId: 'Salle', capaciteCol: 'Capacite' }, { colId: 'Repas', max: 30 }],
      sauf: { colId: 'Statut', valeurs: ['Annulé'] }
    });
    assert.equal(l.total, 40);
    assert.deepEqual(l.parChoix.map((p) => p.colId), ['Atelier', 'Salle', 'Repas']);
    assert.deepEqual(l.sauf, { colId: 'Statut', valeurs: ['Annulé'] });
  });

  it('dit et écarte ce qui est faux, sans le corriger', () => {
    const cas = [
      [{ total: 0 }, /entier d’au moins 1/],
      [{ total: 2.5 }, /entier/],
      [{ total: '10' }, /entier/],
      [{ ouvertDu: 'demain' }, /date d’ouverture/],
      [{ jusquau: '2026-13-45' }, /date de fermeture/],
      [{ ouvertDu: '2026-12-01', jusquau: '2026-11-01' }, /avant de s’ouvrir/],
      [{ parChoix: 'x' }, /liste/],
      [{ parChoix: [{ max: 3 }] }, /question visée manque/],
      [{ parChoix: [{ colId: 'A' }] }, /dites le maximum/],
      [{ parChoix: [{ colId: 'A', max: 3 }, { colId: 'A', max: 4 }] }, /déjà sa limite/],
      [{ parChoix: [{ colId: 'A', max: { x: -1 } }] }, /capacité de « x »/],
      [{ sauf: { colId: 'S' } }, /Ne comptent pas/]
    ];
    cas.forEach(([brut, motif]) => {
      const r = L.normaliser(brut);
      assert.ok(r.erreurs.some((e) => motif.test(e)), JSON.stringify(brut) + ' -> ' + JSON.stringify(r.erreurs));
    });
    assert.equal(L.normaliser({ ouvertDu: '2026-12-01', jusquau: '2026-11-01' }).limites, null, 'la fenêtre impossible n’est pas retenue');
  });

  it('un message est borné et le reste de ce qui n\'est pas dit est ignoré', () => {
    const l = ok({ total: 1, messages: { complet: 'x'.repeat(500), inconnu: 'y' } });
    assert.equal(l.messages.complet.length, 240);
    assert.ok(!('inconnu' in l.messages));
  });
});

describe('Limites — où en est le formulaire', () => {
  const l = ok({ total: 3, parChoix: [{ colId: 'Atelier', max: { A: 2, B: 1 } }], sauf: { colId: 'Statut', valeurs: ['Annulé'] } });

  it('compte les places prises, par choix, sans les lignes écartées', () => {
    const e = L.etat(l, lignes({ Atelier: 'A' }, { Atelier: 'A', Statut: 'Annulé' }, { Atelier: 'B' }), le('2026-11-10T10:00'));
    assert.equal(e.total.pris, 2);
    assert.deepEqual(L.place(e, 'Atelier', 'A'), { max: 2, pris: 1, restant: 1, complet: false });
    assert.deepEqual(L.place(e, 'Atelier', 'B'), { max: 1, pris: 1, restant: 0, complet: true });
    assert.equal(L.place(e, 'Atelier', 'C'), null, 'un choix sans limite n’est pas compté plein');
    assert.equal(e.ouvert, true);
  });

  it('se ferme quand le total est atteint', () => {
    const e = L.etat(l, lignes({ Atelier: 'A' }, { Atelier: 'A' }, { Atelier: 'B' }), le('2026-11-10'));
    assert.equal(e.ouvert, false);
    assert.equal(e.raison, 'complet');
    assert.equal(e.message, 'Le nombre maximum de réponses est atteint.');
  });

  it('une annulation libère une place', () => {
    const e = L.etat(l, lignes({ Atelier: 'A' }, { Atelier: 'A' }, { Atelier: 'B', Statut: 'Annulé' }), le('2026-11-10'));
    assert.equal(e.ouvert, true);
    assert.equal(L.place(e, 'Atelier', 'B').complet, false);
  });

  it('lit des colonnes aussi bien que des lignes, et une liste de choix multiples', () => {
    const colonnes = { id: [1, 2, 3], Atelier: [['L', 'A', 'B'], 'A', null] };
    const e = L.etat(ok({ parChoix: [{ colId: 'Atelier', max: 2 }] }), colonnes, le('2026-11-10'));
    assert.deepEqual(e.comptes.Atelier, { A: 2, B: 1 });
    assert.equal(L.place(e, 'Atelier', 'A').complet, true);
    assert.equal(L.place(e, 'Atelier', 'B').complet, false);
  });

  it('une capacité lue dans la table liée (capaciteCol)', () => {
    const lim = ok({ parChoix: [{ colId: 'Atelier', capaciteCol: 'Capacite' }] });
    const e = L.etat(lim, lignes({ Atelier: 7 }, { Atelier: 7 }, { Atelier: 9 }), le('2026-11-10'), { Atelier: { 7: 2, 9: 5 } });
    assert.equal(L.place(e, 'Atelier', 7).complet, true);
    assert.deepEqual(L.place(e, 'Atelier', 9), { max: 5, pris: 1, restant: 4, complet: false });
    assert.equal(L.place(L.etat(lim, [], le('2026-11-10')), 'Atelier', 7), null, 'sans capacité connue, aucune limite inventée');
  });
});

describe('Limites — la fenêtre d\'ouverture', () => {
  const l = ok({ ouvertDu: '2026-11-01', jusquau: '2026-11-30' });
  it('pas encore ouvert, ouvert, et « jusqu\'au 30 » inclut le 30', () => {
    assert.equal(L.etat(l, [], le('2026-10-31T23:59:00')).raison, 'pas-ouvert');
    assert.equal(L.etat(l, [], le('2026-11-01T00:00:00')).ouvert, true);
    assert.equal(L.etat(l, [], new Date(2026, 10, 30, 23, 30)).ouvert, true);
    const ferme = L.etat(l, [], new Date(2026, 11, 1, 0, 0, 1));
    assert.equal(ferme.raison, 'ferme');
    assert.equal(ferme.message, 'Ce formulaire est fermé.');
  });
  it('une heure précise vaut cette heure', () => {
    const t = ok({ jusquau: '2026-11-30T12:00' });
    assert.equal(L.etat(t, [], new Date(2026, 10, 30, 11, 59)).ouvert, true);
    assert.equal(L.etat(t, [], new Date(2026, 10, 30, 12, 1)).ouvert, false);
  });
  it('des messages au choix', () => {
    const m = ok({ jusquau: '2026-11-30', messages: { ferme: 'Rendez-vous à la prochaine session.' } });
    assert.equal(L.etat(m, [], new Date(2026, 11, 2)).message, 'Rendez-vous à la prochaine session.');
  });
});

describe('Limites — ce que dit l\'envoi', () => {
  const l = ok({ parChoix: [{ colId: 'Atelier', max: { A: 1 } }], total: 5 });
  it('laisse passer un choix libre', () => {
    const e = L.etat(l, lignes({ Atelier: 'B' }), le('2026-11-10'));
    assert.deepEqual(L.verifierEnvoi(e, { Atelier: 'A' }), { ok: true, motifs: [] });
  });
  it('refuse un choix plein, avec la phrase de l\'écran', () => {
    const e = L.etat(l, lignes({ Atelier: 'A' }), le('2026-11-10'));
    const v = L.verifierEnvoi(e, { Atelier: 'A' });
    assert.equal(v.ok, false);
    assert.deepEqual(v.motifs.map((m) => [m.code, m.valeur]), [['choix-complet', 'A']]);
    assert.equal(v.motifs[0].message, '« A » est complet. Choisissez-en un autre.');
  });
  it('refuse tout quand le formulaire est fermé ; vérifie chaque choix d\'une liste', () => {
    const plein = L.etat(ok({ total: 1 }), lignes({}), le('2026-11-10'));
    assert.equal(L.verifierEnvoi(plein, {}).motifs[0].code, 'complet');
    const e = L.etat(ok({ parChoix: [{ colId: 'Atelier', max: 1 }] }), lignes({ Atelier: ['L', 'A'] }), le('2026-11-10'));
    assert.deepEqual(L.verifierEnvoi(e, { Atelier: ['A', 'B'] }).motifs.map((m) => m.valeur), ['A']);
  });
  it('sans limites, tout passe', () => {
    assert.deepEqual(L.verifierEnvoi(L.etat(null, [], le('2026-11-10')), { Atelier: 'A' }), { ok: true, motifs: [] });
  });
  it('dit quelles colonnes il faut lire pour compter', () => {
    assert.deepEqual(L.colonnesComptees(ok({ parChoix: [{ colId: 'Atelier', max: 3 }], sauf: { colId: 'Statut', valeurs: ['x'] } })), ['Atelier', 'Statut']);
    assert.deepEqual(L.colonnesComptees(null), []);
  });
});

// ── la formule qui tranche : exécutée en Python, pas relue ──

function pythonDisponible() {
  return spawnSync('python', ['-I', '-c', 'print(1)'], { encoding: 'utf8' }).status === 0;
}

/** Exécute la formule sur des lignes fabriquées, comme Grist : `$X` devient `rec.X`, `Table.all` la liste. */
function placesPython(formule, tableId, rows) {
  const corps = formule.replace(/\$(\w+)/g, 'rec.$1').split('\n').map((l) => '    ' + l).join('\n');
  const source = [
    'import json, sys',
    'class R:',
    '    def __init__(self, d, refs):',
    '        self.__dict__.update(d)',
    '        for k, v in refs.items(): setattr(self, k, v)',
    'data = json.loads(sys.stdin.read())',
    'cibles = {int(k): R(v, {}) for k, v in data["cibles"].items()}',
    'rows = []',
    // Dans Grist chaque colonne existe sur chaque ligne (vide si rien n'y est) : le banc fait de même.
    'cols = set(k for d in data["rows"] for k in d)',
    'for d in data["rows"]:',
    '    for k in cols: d.setdefault(k, "")',
    'for d in data["rows"]:',
    '    ref = cibles.get(d.get("Salle")) if "Salle" in d else None',
    '    r = R(d, {"Salle": ref} if ref is not None else {})',
    '    rows.append(r)',
    'import types',
    tableId + ' = types.SimpleNamespace(all=rows)',
    'def f(rec):',
    corps,
    'print(json.dumps([f(r) for r in rows]))'
  ].join('\n');
  // ASCII échappé : sous Windows, Python lit l'entrée standard en cp1252 et abîmerait « é ».
  const entree = JSON.stringify(rows).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const r = spawnSync('python', ['-I', '-c', source], { input: entree, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('Python a échoué : ' + r.stderr + '\n' + source);
  return JSON.parse(r.stdout);
}

describe('Limites — la formule « Place » tranche par ordre d\'arrivée', { skip: !pythonDisponible() && 'Python indisponible' }, () => {
  const rows = (...r) => ({ rows: r.map((d, i) => Object.assign({ id: i + 1 }, d)), cibles: {} });

  it('rien à trancher sans limite', () => {
    assert.equal(L.formulePlace(ok({ ouvertDu: '2026-11-01' }), 'Inscriptions'), null);
    assert.equal(L.formulePlace(null, 'Inscriptions'), null);
    assert.equal(L.formulePlace(ok({ total: 3 }), 'Inscriptions; import os'), null, 'un nom de table n’est pas une porte d’entrée');
  });

  it('le total : les premiers arrivés sont confirmés, les suivants en liste d\'attente', () => {
    const f = L.formulePlace(ok({ total: 2 }), 'Inscriptions');
    assert.deepEqual(placesPython(f, 'Inscriptions', rows({}, {}, {}, {})), ['Confirmé', 'Confirmé', "Liste d'attente", "Liste d'attente"]);
  });

  it('par choix : chaque atelier a ses places, l\'ordre d\'arrivée tranche entre deux envois qui se croisent', () => {
    const f = L.formulePlace(ok({ parChoix: [{ colId: 'Atelier', max: { A: 1, B: 2 } }] }), 'Inscriptions');
    const r = placesPython(f, 'Inscriptions', rows({ Atelier: 'A' }, { Atelier: 'B' }, { Atelier: 'A' }, { Atelier: 'B' }, { Atelier: 'B' }, { Atelier: 'C' }));
    assert.deepEqual(r, ['Confirmé', 'Confirmé', "Liste d'attente", 'Confirmé', "Liste d'attente", 'Confirmé']);
  });

  it('les lignes écartées ne prennent pas de place, et sont dites écartées', () => {
    const f = L.formulePlace(ok({ total: 2, sauf: { colId: 'Statut', valeurs: ['Annulé'] } }), 'Inscriptions');
    const r = placesPython(f, 'Inscriptions', rows({}, { Statut: 'Annulé' }, {}, {}));
    assert.deepEqual(r, ['Confirmé', 'Écartée', 'Confirmé', "Liste d'attente"]);
  });

  it('le total et les choix se tiennent ensemble', () => {
    const f = L.formulePlace(ok({ total: 3, parChoix: [{ colId: 'Atelier', max: 2 }] }), 'Inscriptions');
    const r = placesPython(f, 'Inscriptions', rows({ Atelier: 'A' }, { Atelier: 'A' }, { Atelier: 'A' }, { Atelier: 'B' }, { Atelier: 'B' }));
    assert.deepEqual(r, ['Confirmé', 'Confirmé', "Liste d'attente", 'Confirmé', "Liste d'attente"]);
  });

  it('une capacité portée par la table liée (référence)', () => {
    const f = L.formulePlace(ok({ parChoix: [{ colId: 'Salle', capaciteCol: 'Capacite' }] }), 'Inscriptions');
    const donnees = { cibles: { 10: { id: 10, Capacite: 1 }, 20: { id: 20, Capacite: 2 } }, rows: [{ id: 1, Salle: 10 }, { id: 2, Salle: 10 }, { id: 3, Salle: 20 }, { id: 4, Salle: 20 }, { id: 5, Salle: 20 }] };
    assert.deepEqual(placesPython(f, 'Inscriptions', donnees), ['Confirmé', "Liste d'attente", 'Confirmé', 'Confirmé', "Liste d'attente"]);
  });

  it('une seule réponse par personne : la première est retenue, les suivantes sont des doublons qui ne prennent aucune place', () => {
    const f = L.formulePlace(ok({ total: 2, unique: 'Courriel' }), 'Inscriptions');
    const r = placesPython(f, 'Inscriptions', rows(
      { Courriel: 'a@x.fr' }, { Courriel: ' A@X.fr ' }, { Courriel: 'b@x.fr' }, { Courriel: 'a@x.fr' }, { Courriel: 'c@x.fr' }));
    assert.deepEqual(r, ['Confirmé', 'Doublon', 'Confirmé', 'Doublon', "Liste d'attente"]);
  });

  it('l\'unicité seule suffit à produire la formule, et une réponse sans courriel n\'est pas un doublon', () => {
    const f = L.formulePlace(ok({ unique: 'Courriel' }), 'Inscriptions');
    assert.ok(f);
    assert.deepEqual(placesPython(f, 'Inscriptions', rows({}, {}, { Courriel: 'a@x.fr' }, { Courriel: 'a@x.fr' })), ['Confirmé', 'Confirmé', 'Confirmé', 'Doublon']);
  });

  it('une inscription annulée libère l\'adresse : la personne peut se réinscrire', () => {
    const f = L.formulePlace(ok({ unique: 'Courriel', sauf: { colId: 'Statut', valeurs: ['Annulé'] } }), 'Inscriptions');
    const r = placesPython(f, 'Inscriptions', rows({ Courriel: 'a@x.fr', Statut: 'Annulé' }, { Courriel: 'a@x.fr' }, { Courriel: 'a@x.fr' }));
    assert.deepEqual(r, ['Écartée', 'Confirmé', 'Doublon']);
  });

  it('une colonne d\'unicité qui n\'est pas un identifiant est refusée', () => {
    assert.ok(L.normaliser({ unique: 'a; b' }).erreurs.length);
    assert.equal(L.normaliser({ unique: 'Courriel' }).limites.unique.colId, 'Courriel');
    assert.equal(L.formulePlace(ok({ unique: 'Courriel' }), 'Inscriptions; import os'), null);
  });

  it('une valeur d\'apostrophe ne casse pas la formule', () => {
    const f = L.formulePlace(ok({ total: 1, sauf: { colId: 'Statut', valeurs: ['Refusé d\'office'] } }), 'Inscriptions');
    assert.deepEqual(placesPython(f, 'Inscriptions', rows({ Statut: 'Refusé d\'office' }, {})), ['Écartée', 'Confirmé']);
  });
});

describe('Limites — la colonne « Place » rangée hors des places', () => {
  it('la liste d\'attente et les doublons ne comptent pas pour le plafond, et la colonne reste lisible', () => {
    const lim = ok({ total: 2, placeCol: 'Place', parChoix: [{ colId: 'Atelier', max: 1 }] });
    assert.ok(L.colonnesComptees(lim).includes('Place'));
    const lignes = [
      { id: 1, Atelier: 'A', Place: 'Confirmé' },
      { id: 2, Atelier: 'A', Place: "Liste d'attente" },
      { id: 3, Atelier: 'B', Place: 'Doublon' },
      { id: 4, Atelier: 'B', Place: 'Confirmé' }
    ];
    const e = L.etat(lim, lignes, new Date());
    assert.equal(e.total.pris, 2);
    assert.equal(e.total.complet, true);
    assert.equal(e.comptes.Atelier.A, 1);
    assert.equal(e.comptes.Atelier.B, 1);
  });

  it('sans colonne « Place », rien ne change', () => {
    const e = L.etat(ok({ total: 2 }), [{ id: 1, Place: 'Doublon' }, { id: 2 }], new Date());
    assert.equal(e.total.pris, 2);
  });
});
