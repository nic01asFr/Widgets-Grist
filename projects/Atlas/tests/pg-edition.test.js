import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  champsEditables, texteDeValeur, lireSaisie, valeursModifiees, operationModifier, operationInserer, operationEtat,
  pointGeoJSON, droitsFiche, insertionPossible, interpreter, cleDeFeature, lireCle,
} from '../lib/pg-edition.js';

const decl = { schema: 'public', table: 'interventions', cle: ['id'], colonnes: ['type', 'cout', 'hauteur_mesuree', 'date_intervention', 'geom'], geometrie: 'geom', suppression: 'etat:actif', operations: ['inserer', 'modifier', 'desactiver', 'reactiver'] };
const table = { colonnes: [{ nom: 'type', type_grist: 'Text' }, { nom: 'cout', type_grist: 'Numeric' }, { nom: 'hauteur_mesuree', type_grist: 'Numeric' }, { nom: 'date_intervention', type_grist: 'Date' }, { nom: 'actif', type_grist: 'Bool' }] };
const valeurs = { type: 'entretien', cout: 137.5, hauteur_mesuree: null, date_intervention: '2026-01-08', geom: { type: 'Point', coordinates: [3.6, 43.4] } };

describe('pg-edition : champs', () => {
  it('propose les colonnes déclarées sauf la géométrie, avec leur type', () => {
    const c = champsEditables({ decl, table, valeurs });
    assert.deepEqual(c.map((x) => x.nom), ['type', 'cout', 'hauteur_mesuree', 'date_intervention']);
    assert.equal(c[1].type, 'Numeric');
    assert.equal(c[2].valeur, null);
  });

  it('montre les dates en ISO, qu’elles arrivent en texte ou en secondes', () => {
    assert.equal(texteDeValeur('2026-01-08', 'Date'), '2026-01-08');
    assert.equal(texteDeValeur(1767830400, 'Date'), '2026-01-08');
    assert.equal(texteDeValeur(null, 'Numeric'), '');
  });
});

describe('pg-edition : lecture de la saisie', () => {
  it('refuse une saisie illisible, avec sa raison, au lieu de la convertir', () => {
    assert.equal(lireSaisie('Int', 'abc').ok, false);
    assert.equal(lireSaisie('Int', '3.5').ok, false);
    assert.equal(lireSaisie('Numeric', '12x').ok, false);
    assert.equal(lireSaisie('Date', '08/01/2026').ok, false);
    assert.equal(lireSaisie('Bool', 'peut-être').ok, false);
  });

  it('lit les nombres, les dates et les booléens', () => {
    assert.deepEqual(lireSaisie('Int', ' 42 '), { ok: true, valeur: 42 });
    assert.deepEqual(lireSaisie('Numeric', '12,5'), { ok: true, valeur: 12.5 });
    assert.deepEqual(lireSaisie('Date', '2026-02-03'), { ok: true, valeur: '2026-02-03' });
    assert.deepEqual(lireSaisie('Bool', 'oui'), { ok: true, valeur: true });
    assert.deepEqual(lireSaisie('Bool', 'faux'), { ok: true, valeur: false });
  });

  it('une saisie vide est une absence (null) sauf pour un texte, qui reste un texte vide', () => {
    assert.deepEqual(lireSaisie('Numeric', ''), { ok: true, valeur: null });
    assert.deepEqual(lireSaisie('Date', '  '), { ok: true, valeur: null });
    assert.deepEqual(lireSaisie('Text', ''), { ok: true, valeur: '' });
  });
});

describe('pg-edition : ce qui a changé', () => {
  const champs = champsEditables({ decl, table, valeurs });
  const saisiesIdentiques = { type: 'entretien', cout: '137.5', hauteur_mesuree: '', date_intervention: '2026-01-08' };

  it('n’envoie rien quand rien n’a changé', () => {
    assert.deepEqual(valeursModifiees(champs, saisiesIdentiques), { valeurs: {}, erreurs: {} });
  });

  it('n’envoie que les colonnes changées', () => {
    const r = valeursModifiees(champs, { ...saisiesIdentiques, cout: '111', type: 'urgence' });
    assert.deepEqual(r.valeurs, { cout: 111, type: 'urgence' });
  });

  it('« 137,50 » n’est pas un changement de 137.5', () => {
    assert.deepEqual(valeursModifiees(champs, { ...saisiesIdentiques, cout: '137,50' }).valeurs, {});
  });

  it('vider un nombre le met à null ; remplir une absence est un changement', () => {
    assert.deepEqual(valeursModifiees(champs, { ...saisiesIdentiques, cout: '' }).valeurs, { cout: null });
    assert.deepEqual(valeursModifiees(champs, { ...saisiesIdentiques, hauteur_mesuree: '5' }).valeurs, { hauteur_mesuree: 5 });
  });

  it('rapporte les erreurs par colonne et n’envoie pas la colonne fautive', () => {
    const r = valeursModifiees(champs, { ...saisiesIdentiques, cout: 'beaucoup', type: 'urgence' });
    assert.deepEqual(Object.keys(r.erreurs), ['cout']);
    assert.deepEqual(r.valeurs, { type: 'urgence' });
  });

  it('une colonne non saisie (absente) n’est pas touchée', () => {
    assert.deepEqual(valeursModifiees(champs, { type: 'x' }).valeurs, { type: 'x' });
  });
});

describe('pg-edition : opérations', () => {
  it('portent la version lue, jamais de « forcer »', () => {
    const op = operationModifier({ id: 1 }, 3, { cout: 1 });
    assert.deepEqual(op, { op: 'modifier', cle: { id: 1 }, valeurs: { cout: 1 }, version_attendue: 3 });
    assert.equal('force' in op, false);
    assert.deepEqual(operationEtat('desactiver', { id: 1 }, 3), { op: 'desactiver', cle: { id: 1 }, version_attendue: 3 });
    assert.deepEqual(operationInserer({ type: 'x' }), { op: 'inserer', valeurs: { type: 'x' } });
  });

  it('un point GeoJSON est (longitude, latitude)', () => {
    assert.deepEqual(pointGeoJSON(3.123456789, 43.987654321), { type: 'Point', coordinates: [3.1234568, 43.9876543] });
  });
});

describe('pg-edition : droits et insertion', () => {
  it('ne propose que ce que la déclaration ouvre', () => {
    const d = droitsFiche(decl);
    assert.equal(d.modifier && d.inserer && d.desactiver && d.reactiver, true);
    assert.equal(d.supprimer, false);
  });

  it('insertion : points et tables sans géométrie seulement', () => {
    assert.deepEqual(insertionPossible(decl, 'Point'), { ok: true, geometrie: 'point' });
    assert.deepEqual(insertionPossible({ ...decl, geometrie: null }, null), { ok: true, geometrie: null });
    assert.equal(insertionPossible(decl, 'Autre').ok, false);
    assert.equal(insertionPossible({ ...decl, operations: ['modifier'] }, 'Point').ok, false);
  });
});

describe('pg-edition : réponse de la passerelle', () => {
  it('ok', () => {
    assert.equal(interpreter({ resultats: [{ statut: 'ok', version: 4 }] }).ok, true);
  });

  it('conflit : dit que rien n’a été écrit et rend les valeurs actuelles', () => {
    const r = interpreter({ resultats: [{ statut: 'conflit', version_actuelle: 5, valeurs_actuelles: { cout: 9 } }] });
    assert.equal(r.ok, false);
    assert.equal(r.statut, 'conflit');
    assert.match(r.message, /Rien n’a été écrit/);
    assert.deepEqual(r.conflit.valeurs, { cout: 9 });
  });

  it('refus, introuvable, absence de réponse : dits, jamais « ok »', () => {
    assert.match(interpreter({ resultats: [{ statut: 'refuse', code: 'contrainte', message: 'cout négatif' }] }).message, /contrainte : cout négatif/);
    assert.equal(interpreter({ resultats: [{ statut: 'introuvable' }] }).statut, 'introuvable');
    assert.equal(interpreter({}).ok, false);
    assert.equal(interpreter(null).ok, false);
  });
});

describe('pg-edition : clé d’une entité de la carte', () => {
  it('lit la clé dans les propriétés, ou rend null si elle n’y est pas toute', () => {
    assert.deepEqual(cleDeFeature(decl, { properties: { id: 7, type: 'x' } }), { id: 7 });
    assert.equal(cleDeFeature(decl, { properties: { type: 'x' } }), null);
    assert.equal(cleDeFeature(decl, { properties: { id: null } }), null);
    assert.equal(cleDeFeature(decl, null), null);
  });
});

describe('pg-edition : clé tapée à la main', () => {
  const tbl = { colonnes: [{ nom: 'id', type_grist: 'Int' }] };
  it('lit la clé selon son type', () => {
    assert.deepEqual(lireCle(decl, tbl, { id: ' 7 ' }), { ok: true, cle: { id: 7 } });
  });
  it('refuse une clé vide ou illisible, avec sa raison', () => {
    assert.equal(lireCle(decl, tbl, { id: '' }).ok, false);
    assert.match(lireCle(decl, tbl, { id: 'x' }).erreur, /id : un nombre entier est attendu/);
    assert.equal(lireCle(decl, tbl, {}).ok, false);
  });
});
