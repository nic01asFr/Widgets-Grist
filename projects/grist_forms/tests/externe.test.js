'use strict';

/*
 * Le schéma d'un formulaire servi hors de Grist.
 *
 * La formule `Motifs` n'est pas relue : elle est EXÉCUTÉE en Python sur des
 * lignes d'essai, avec un banc qui imite ce que Grist met à disposition d'une
 * formule (`$Col`, une référence qui a un `.id`). C'est le seul moyen de savoir
 * qu'elle juge comme le formulaire le voudrait, sans ouvrir Grist.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const Externe = require('../shared/externe.js');
const Formats = require('../shared/formats.js');

const IBAN_FR = (() => {
  const bban = '30006000011234567890189';
  const r = bban + 'FR00';
  let reste = 0;
  for (const ch of r) for (const d of String(parseInt(ch, 36))) reste = (reste * 10 + Number(d)) % 97;
  return 'FR' + String(98 - reste).padStart(2, '0') + bban;
})();

function formulaire() {
  return {
    id: 'gmao', title: 'Signaler un défaut', tableId: 'Signalements', composeMode: 'ensureSchema',
    sections: [{ label: 'Le défaut', fields: [
      { colId: 'Objet', label: 'Objet', type: 'Ref:Lampadaires', refTable: 'Lampadaires', widget: 'text', required: true,
        options: { prefill: { param: 'objet', verrouille: true } } },
      { colId: 'Nature', label: 'Nature', type: 'Choice', widget: 'select', required: true, options: { choices: ['Panne', 'Casse', 'Autre'] } },
      { colId: 'Detail', label: 'Détail', type: 'Text', widget: 'text', required: true,
        condition: { field: 'Nature', operator: '==', value: 'Autre' } },
      { colId: 'Gravite', label: 'Gravité', type: 'Int', widget: 'number', options: { min: 1, max: 5 } },
      { colId: 'Iban', label: 'IBAN', type: 'Text', widget: 'text', options: { validation: { format: 'iban' } } },
      { colId: 'Adresse', label: 'Adresse', type: 'Text', widget: 'text', kind: 'referentiel', required: true,
        options: { referentiel: { source: 'ban' }, colonnes: { annexes: { insee: 'CodeInsee' } } } }
    ] }]
  };
}

describe('Externe — le plan de schéma', () => {
  it('crée la réception, le traitement, puis les colonnes qui lisent le traitement', () => {
    const p = Externe.planExterne(formulaire(), {});
    assert.equal(p.ok, true, p.errors.join(' / '));
    assert.deepEqual(p.actions.map((a) => a[0] + ':' + a[1] + (a[0] === 'AddColumn' ? ':' + a[2] : '')),
      ['AddTable:Signalements', 'AddTable:Signalements_Traitements', 'AddColumn:Signalements:StatutAffiche', 'AddColumn:Signalements:ReponseAffichee'],
      'la réception, le traitement, puis les deux colonnes de lecture');
  });

  it('la réception ne porte que ce que la personne remplit, plus les colonnes de tri', () => {
    const p = Externe.planExterne(formulaire(), {});
    const colonnes = p.actions[0][2].map((c) => c.id);
    ['Objet', 'Nature', 'Detail', 'Gravite', 'Iban', 'Adresse', 'CodeInsee', 'Recu', 'Premier', 'Motifs', 'Conforme'].forEach((id) => {
      assert.ok(colonnes.includes(id), id + ' est dans la réception');
    });
    ['Statut', 'Reponse', 'Interne'].forEach((id) => {
      assert.ok(!colonnes.includes(id), id + ' ne doit PAS être dans la réception : la clé écrit toute colonne non formule');
    });
    const formules = p.actions[0][2].filter((c) => c.isFormula).map((c) => c.id);
    assert.deepEqual(formules.sort(), ['Conforme', 'Motifs', 'Premier']);
  });

  it('le statut, la réponse et les notes internes vivent dans la table de traitement', () => {
    const p = Externe.planExterne(formulaire(), {});
    const colonnes = p.actions[1][2].map((c) => c.id);
    assert.deepEqual(colonnes, ['Reception', 'Statut', 'Reponse', 'Interne']);
    assert.equal(p.actions[1][2][0].type, 'Ref:Signalements');
  });

  it('refuse un formulaire dont une question porte un nom réservé', () => {
    const def = formulaire();
    def.sections[0].fields.push({ colId: 'Conforme', label: 'Conforme ?', type: 'Bool', widget: 'ouinon' });
    const p = Externe.planExterne(def, {});
    assert.equal(p.ok, false);
    assert.match(p.errors.join(' '), /Conforme/);
  });

  it('prévient qu’une pièce jointe ne partira pas', () => {
    const def = formulaire();
    def.sections[0].fields.push({ colId: 'Photo', label: 'Photo', type: 'Attachments', widget: 'file' });
    const p = Externe.planExterne(def, {});
    assert.deepEqual(p.incompatibles, ['Photo']);
    assert.match(p.avertissements.join(' '), /pièce jointe/);
  });

  it('sur une table existante, n’ajoute que ce qui manque et rafraîchit ses formules', () => {
    const existant = { tables: {
      Signalements: [{ id: 'Objet', type: 'Ref:Lampadaires' }, { id: 'Nature', type: 'Choice' }, { id: 'Motifs', type: 'Text', formula: 'ancien' }],
      Signalements_Traitements: [{ id: 'Reception', type: 'Ref:Signalements' }]
    } };
    const p = Externe.planExterne(formulaire(), existant);
    assert.equal(p.ok, true, p.errors.join(' / '));
    const noms = p.actions.map((a) => a[0] + ':' + a[1] + ':' + a[2]);
    assert.ok(noms.includes('ModifyColumn:Signalements:Motifs'), 'la formule est mise à jour');
    assert.ok(!noms.some((n) => n.startsWith('AddColumn:Signalements:Objet')), 'une colonne présente n’est pas rajoutée');
    assert.ok(noms.includes('AddColumn:Signalements:Gravite'));
  });

  it('une condition qu’on ne sait pas traduire n’invente rien : la règle manque et le plan le dit', () => {
    const def = formulaire();
    def.sections[0].fields[2].condition = { op: 'or', rules: [{ field: 'Nature', value: 'Autre' }, { field: 'Nature', value: 'Casse' }] };
    const p = Externe.planExterne(def, {});
    assert.match(p.avertissements.join(' '), /Détail/);
    assert.ok(!Externe.formuleMotifs(def, 'Signalements').formule.includes('Détail : réponse absente'));
  });
});

// ── la formule, exécutée ──

function pythonDisponible() {
  const r = spawnSync('python', ['-I', '-c', 'print(1)'], { encoding: 'utf8' });
  return r.status === 0;
}

/**
 * Exécute la formule `Motifs` sur des lignes. Une valeur `{ ref: 3 }` est une
 * référence existante ; `{ ref: 999, absente: true }` une référence inventée,
 * « vraie » pour Grist mais sans identifiant (mesuré).
 */
function motifsPython(formule, lignes) {
  const corps = formule.split('\n').map((l) => '    ' + l).join('\n');
  const source = [
    'import json, sys',
    'class Ref:',
    '    def __init__(self, brut, absente=False):',
    '        self.brut = brut',
    '        self.id = 0 if (absente or not brut) else brut',
    '    def __bool__(self):',
    '        return bool(self.brut)',
    'class Ligne:',
    '    pass',
    'def fabriquer(d):',
    '    l = Ligne()',
    '    for k, v in d.items():',
    '        if isinstance(v, dict) and "ref" in v:',
    '            setattr(l, k, Ref(v["ref"], v.get("absente", False)))',
    '        else:',
    '            setattr(l, k, v)',
    '    return l',
    'def _f(row):',
    corps.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, 'row.$1'),
    'lignes = json.loads(sys.stdin.read())',
    'print(json.dumps([_f(fabriquer(d)) for d in lignes]))'
  ].join('\n');
  const r = spawnSync('python', ['-I', '-c', source], { input: JSON.stringify(lignes), encoding: 'utf8' });
  if (r.status !== 0) throw new Error('Python a échoué :\n' + r.stderr + '\n--- source ---\n' + source);
  return JSON.parse(r.stdout);
}

describe('Externe — la formule Motifs, exécutée en Python', { skip: !pythonDisponible() && 'Python indisponible' }, () => {
  const base = { Recu: 'R-1', Premier: true, Objet: { ref: 3 }, Nature: 'Panne', Detail: '', Gravite: 3, Iban: '', Adresse: '8 Boulevard du Port 80000 Amiens', CodeInsee: '80021' };
  const m = motifsPython(Externe.formuleMotifs(formulaire(), 'Signalements').formule, [
    base,                                                                         // 0 : tout va bien
    Object.assign({}, base, { Recu: '' }),                                        // 1 : pas de reçu
    Object.assign({}, base, { Premier: false }),                                  // 2 : reçu rejoué
    Object.assign({}, base, { Objet: { ref: 0 } }),                               // 3 : pas d'objet
    Object.assign({}, base, { Objet: { ref: 999, absente: true } }),              // 4 : objet inventé
    Object.assign({}, base, { Nature: 'Inconnue' }),                              // 5 : hors liste
    Object.assign({}, base, { Nature: 'Autre', Detail: '' }),                     // 6 : « Autre » sans détail
    Object.assign({}, base, { Nature: 'Autre', Detail: 'une plaque' }),           // 7 : « Autre » avec détail
    Object.assign({}, base, { Nature: 'Panne', Detail: '' }),                     // 8 : détail non demandé
    Object.assign({}, base, { Gravite: 9 }),                                      // 9 : hors bornes
    Object.assign({}, base, { Gravite: 0 }),                                      // 10 : absente (0), minimum positif
    Object.assign({}, base, { Iban: 'FR00 1234' }),                               // 11 : IBAN faux
    Object.assign({}, base, { Iban: IBAN_FR }),                                   // 12 : IBAN juste
    Object.assign({}, base, { CodeInsee: '' }),                                   // 13 : adresse tapée, pas choisie
    Object.assign({}, base, { Adresse: '', CodeInsee: '' })                       // 14 : adresse absente
  ]);

  it('une ligne en règle n’a aucun motif', () => assert.equal(m[0], ''));
  it('un reçu absent ou rejoué est dit', () => {
    assert.match(m[1], /reçu absent/);
    assert.match(m[2], /reçu déjà utilisé/);
  });
  it('un objet absent ou inventé est dit — l’inventé est démasqué par son identifiant', () => {
    assert.match(m[3], /Objet : réponse absente/);
    assert.match(m[4], /Objet : élément inconnu/);
    assert.ok(!/absente/.test(m[4]), 'un objet inventé n’est pas un objet absent : un seul message');
  });
  it('une valeur hors de la liste est dite', () => assert.match(m[5], /Nature : valeur hors de la liste/));
  it('une question conditionnelle n’est exigée que quand elle s’affiche', () => {
    assert.match(m[6], /Détail : réponse absente/);
    assert.equal(m[7], '');
    assert.equal(m[8], '', 'le détail n’est pas demandé pour une panne');
  });
  it('les bornes ne prennent pas un 0 absent pour une valeur fausse', () => {
    assert.match(m[9], /Gravité : hors des bornes/);
    assert.equal(m[10], '');
  });
  it('un IBAN faux est dit, un IBAN juste passe', () => {
    assert.match(m[11], /IBAN : ce n’est pas un IBAN valide/);
    assert.equal(m[12], '');
  });
  it('une adresse tapée sans être choisie est distinguée d’une adresse absente', () => {
    assert.match(m[13], /adresse non choisie dans la liste/);
    assert.match(m[14], /Adresse : réponse absente/);
    assert.ok(!/non choisie/.test(m[14]));
  });
});

describe('Externe — la page', () => {
  it('lit la clé dans le lien du formulaire publié', () => {
    const g = Externe.lireAdresseFormulaire('https://grist.exemple.fr/o/mon-org/forms/AbC123xyz/42');
    assert.deepEqual({ cle: g.cle, section: g.section, base: g.base },
      { cle: 'AbC123xyz', section: 42, base: 'https://grist.exemple.fr/o/mon-org/api/s/AbC123xyz' });
    assert.equal(Externe.lireAdresseFormulaire('https://grist.exemple.fr/forms/K1/2').base, 'https://grist.exemple.fr/api/s/K1');
    assert.equal(Externe.lireAdresseFormulaire('pas une adresse'), null);
    assert.equal(Externe.lireAdresseFormulaire(''), null);
  });

  it('refuse de construire une page sans adresse de formulaire valide', () => {
    assert.throws(() => Externe.buildExternalDocument(formulaire(), {}, { adresse: 'nimporte' }), /invalide/);
  });

  it('pose le formulaire figé et la clé dans la page, sans rien d’autre à demander', () => {
    const html = Externe.buildExternalDocument(formulaire(), { engineJs: '/*moteur*/', prefillJs: '/*prefill*/', formatsJs: '/*formats*/', cssText: 'body{}' },
      { adresse: 'https://g.exemple.fr/o/org/forms/CLE123/7' });
    assert.ok(html.includes('"/o/org/api/s/CLE123"'.replace('"/o', '"https://g.exemple.fr/o')));
    assert.ok(html.includes('"tableId":"Signalements"'));
    assert.ok(html.indexOf('/*formats*/') < html.indexOf('/*moteur*/'), 'les modules avant le moteur');
    assert.ok(html.includes('FormPrefill.lire'), 'lit l’adresse de la page');
    assert.ok(html.includes("'Recu'") || html.includes('Recu:'), 'envoie un reçu');
  });

  it('un titre ou un libellé piégé ne referme ni la balise ni le script', () => {
    const def = formulaire();
    def.title = '</title><script>alert(1)</script>';
    def.sections[0].label = '</script><img src=x onerror=alert(2)>';
    const html = Externe.buildExternalDocument(def, { engineJs: '' }, { adresse: 'https://g.exemple.fr/forms/K/1' });
    assert.ok(!html.includes('</title><script>alert(1)'), 'titre échappé');
    assert.ok(!/<\/script><img/.test(html), 'le JSON ne referme pas le script');
    // un seul <script> ouvrant et un seul fermant : celui de la page
    assert.equal((html.match(/<script>/g) || []).length, 1);
    assert.equal((html.match(/<\/script>/g) || []).length, 1);
  });
});

describe('Externe — une question de lieu', { skip: !pythonDisponible() && 'Python indisponible' }, () => {
  const def = {
    id: 'l', title: 'Lieu', tableId: 'Lieux', composeMode: 'ensureSchema',
    sections: [{ label: 'S', fields: [
      { colId: 'Lieu', label: 'Où ?', type: 'Text', widget: 'geo', kind: 'geometrie', required: true,
        options: { geometrie: 'Point', enrichir: { colonnes: { insee: 'CodeInsee', adresse: 'Adresse', altitude: 'Alt' } } } }
    ] }]
  };

  it('crée les colonnes que le lieu remplit, avec leur type', () => {
    const p = Externe.planExterne(def, {});
    assert.equal(p.ok, true, p.errors.join(' / '));
    const cols = p.actions[0][2];
    const parId = {};
    cols.forEach((c) => { parId[c.id] = c.type; });
    assert.equal(parId.CodeInsee, 'Text');
    assert.equal(parId.Adresse, 'Text');
    assert.equal(parId.Alt, 'Numeric', 'une altitude est un nombre');
  });

  it('un texte qui n’est pas un point est dit « lieu illisible » ; un point, ou une absence, sont jugés à part', () => {
    const f = Externe.formuleMotifs(def, 'Lieux').formule;
    const m = motifsPython(f, [
      { Recu: 'R', Premier: true, Lieu: 'POINT(2.29 49.89)' },
      { Recu: 'R', Premier: true, Lieu: 'SRID=4326;POINT (2.29 49.89)' },
      { Recu: 'R', Premier: true, Lieu: 'quelque part' },
      { Recu: 'R', Premier: true, Lieu: 'LINESTRING(0 0, 1 1)' },
      { Recu: 'R', Premier: true, Lieu: '' }
    ]);
    assert.equal(m[0], '');
    assert.equal(m[1], '');
    assert.match(m[2], /lieu illisible/);
    assert.match(m[3], /lieu illisible/);
    assert.match(m[4], /Où \? : réponse absente/);
    assert.ok(!/illisible/.test(m[4]), 'un lieu absent n’est pas un lieu illisible');
  });
});
