import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { htmlEdition, htmlConflitEdition } from '../lib/vue-edition-pg.js';
import { champsEditables } from '../lib/pg-edition.js';

const decl = { schema: 'public', table: 'interventions', cle: ['id'], colonnes: ['type', 'cout', 'geom'], geometrie: 'geom', operations: ['inserer', 'modifier', 'desactiver', 'reactiver'] };
const table = { colonnes: [{ nom: 'type', type_grist: 'Text' }, { nom: 'cout', type_grist: 'Numeric' }] };
const champs = champsEditables({ decl, table, valeurs: { type: '<b>x</b>', cout: 5 } });
const base = { libelle: 'public.interventions', decl, phase: 'ligne', ligne: { cle: { id: 7 }, version: 2, actif: true }, champs, insertion: { ok: true } };

describe('vue-edition-pg : htmlEdition', () => {
  it('choix : demande de toucher une entité', () => {
    assert.match(htmlEdition({ ...base, phase: 'choix' }), /Touchez une entité/);
  });

  it('ligne : un champ par colonne modifiable, tout échappé, Enregistrer proposé', () => {
    const h = htmlEdition(base);
    assert.equal((h.match(/data-champ=/g) || []).length, 2);
    assert.doesNotMatch(h, /<b>x/);
    assert.match(h, /data-act="enregistrer"/);
    assert.match(h, /Entité id = 7/);
  });

  it('document en lecture seule : champs en lecture seule, pas d’Enregistrer ni d’opérations', () => {
    const h = htmlEdition({ ...base, lectureSeule: true });
    assert.match(h, /lecture seule/);
    assert.match(h, /readonly/);
    assert.doesNotMatch(h, /data-act="enregistrer"/);
    assert.doesNotMatch(h, /data-act="desactiver"/);
    assert.doesNotMatch(h, /data-act="nouvelle"/);
  });

  it('désactiver proposé sur une ligne active, réactiver sur une ligne désactivée, supprimer jamais sans déclaration', () => {
    assert.match(htmlEdition(base), /data-act="desactiver"/);
    assert.doesNotMatch(htmlEdition(base), /data-act="reactiver"/);
    const off = htmlEdition({ ...base, ligne: { cle: { id: 7 }, version: 2, actif: false } });
    assert.match(off, /data-act="reactiver"/);
    assert.match(off, /désactivée/);
    assert.doesNotMatch(off, /data-act="supprimer"/);
  });

  it('modifier non ouvert : champs en lecture seule, pas d’Enregistrer', () => {
    const h = htmlEdition({ ...base, decl: { ...decl, operations: ['inserer'] } });
    assert.doesNotMatch(h, /data-act="enregistrer"/);
  });

  it('une erreur de saisie est montrée sur son champ', () => {
    const h = htmlEdition({ ...base, erreurs: { cout: 'un nombre est attendu' } });
    assert.match(h, /cout : un nombre est attendu/);
    assert.match(h, /aria-invalid="true"/);
  });

  it('conflit : valeurs actuelles montrées, « Relire » proposé, aucune option pour forcer', () => {
    const h = htmlEdition({ ...base, resultat: { ok: false, statut: 'conflit', message: 'Conflit.', conflit: { version: 3, valeurs: { cout: 9, type: 'autre' } } } });
    assert.match(h, /Valeurs actuelles/);
    assert.match(h, /data-act="relire"/);
    assert.doesNotMatch(h, /forcer|écraser/i);
  });

  it('insertion refusée : la raison est dite', () => {
    const h = htmlEdition({ ...base, phase: 'choix', insertion: { ok: false, raison: 'Cette table porte des lignes ou des surfaces' } });
    assert.match(h, /lignes ou des surfaces/);
    assert.doesNotMatch(h, /data-act="nouvelle"/);
  });

  it('erreur : message en alerte', () => {
    assert.match(htmlEdition({ ...base, phase: 'erreur', erreur: 'Lecture impossible' }), /role="alert">Lecture impossible/);
  });

  it('la saisie de la personne reste affichée après une erreur ou un conflit', () => {
    const h = htmlEdition({ ...base, saisies: { cout: 'abc', type: 'urgence-test' }, erreurs: { cout: 'un nombre est attendu' } });
    assert.match(h, /value="abc"/);
    assert.match(h, /value="urgence-test"/);
    assert.doesNotMatch(h, /value="5"/);
  });

  it('htmlConflitEdition échappe les valeurs', () => {
    assert.doesNotMatch(htmlConflitEdition({ valeurs: { type: '<i>' } }, champs), /<i>/);
  });
});
