import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleCanon, cleComplete, hacher, cleDeLigneGrist, hachageGrist, valeursPourPg, colonnesSuivies, calculerEcarts, planifier, resumer,
  NATURES_CONFLIT, CHOIX, TABLE_SYNC,
} from '../lib/pg-sync.js';

const CONFIG = {
  genre: 'copie', url: 'https://pg.exemple.fr', connexion: 'metier', schema: 'public', table: 'interventions', tableGrist: 'Interventions',
  cles: [{ pg: 'id', grist: 'id_pg', type: 'Int' }],
  colonnes: [{ pg: 'type', grist: 'type', type: 'Text' }, { pg: 'cout', grist: 'cout', type: 'Numeric' }],
  geometrie: { pg: 'geom', mode: 'point', lat: 'latitude', lng: 'longitude' },
  suppression: 'etat:actif', version: 'colonne',
};

const g = (ligne, id, h, extra = {}) => ({ ligne, cle: id == null ? null : { id }, hachage: h, ...extra });
const p = (id, v, extra = {}) => ({ cle: { id }, version: v, ...extra });
const s = (id, v, h) => ({ cle: { id }, ligne: 1, version: v, hachage: h });

describe('pg-sync — clés et hachage', () => {
  it('une clé est la même quelle que soit la forme : 12, "12", ordre des colonnes', () => {
    assert.equal(cleCanon({ id: 12 }), cleCanon({ id: '12' }));
    assert.equal(cleCanon({ a: 1, b: 'x' }), cleCanon({ b: 'x', a: 1 }));
    assert.notEqual(cleCanon({ id: 12 }), cleCanon({ id: 13 }));
    assert.equal(cleCanon(null), null);
    assert.equal(cleCanon({ id: null }), '{"id":null}');
  });

  it('cleComplete : tous les champs renseignés', () => {
    assert.equal(cleComplete({ id: 1 }, ['id']), true);
    assert.equal(cleComplete({ id: null }, ['id']), false);
    assert.equal(cleComplete({ id: '' }, ['id']), false);
    assert.equal(cleComplete(null, ['id']), false);
    assert.equal(cleComplete({ a: 1 }, ['a', 'b']), false);
  });

  it('le hachage est stable, sensible, et insensible à l’ordre des clés d’un objet', () => {
    assert.equal(hacher([1, 'a', null]), hacher([1, 'a', null]));
    assert.notEqual(hacher([1, 'a', null]), hacher([1, 'a', 0]));
    assert.notEqual(hacher(['a ']), hacher(['a']));
    assert.equal(hacher({ x: 1, y: 2 }), hacher({ y: 2, x: 1 }));
    assert.match(hacher(['x']), /^[0-9a-f]{14}$/);
    assert.notEqual(hacher([null]), hacher(['']), 'une absence n’est pas une chaîne vide');
  });

  it('le hachage d’une ligne Grist ne dépend que des colonnes suivies (pas de la clé, ni de colonnes dérivées)', () => {
    assert.deepEqual(colonnesSuivies(CONFIG), ['type', 'cout', 'latitude', 'longitude']);
    const base = { id: 1, id_pg: 7, type: 'a', cout: 1.5, latitude: 43, longitude: 3, centroid_lat: 1 };
    const h = hachageGrist(CONFIG, base);
    assert.equal(hachageGrist(CONFIG, { ...base, id: 99, id_pg: 8, centroid_lat: 2 }), h);
    assert.notEqual(hachageGrist(CONFIG, { ...base, cout: 1.6 }), h);
    assert.notEqual(hachageGrist(CONFIG, { ...base, latitude: null }), h);
    assert.equal(hachageGrist(CONFIG, { id: 1, type: 'a', cout: 1.5, latitude: 43, longitude: 3 }), h, 'absent = indéfini = pas de valeur');
  });

  it('une cellule d’entier vide vaut 0 dans Grist : 0 en clé veut dire « pas de clé »', () => {
    assert.equal(cleDeLigneGrist(CONFIG, { id_pg: 0 }), null);
    assert.equal(cleDeLigneGrist(CONFIG, { id_pg: null }), null);
    assert.equal(cleDeLigneGrist(CONFIG, {}), null);
    assert.deepEqual(cleDeLigneGrist(CONFIG, { id_pg: 7 }), { id: 7 });
    const texte = { ...CONFIG, cles: [{ pg: 'code', grist: 'code', type: 'Text' }] };
    assert.deepEqual(cleDeLigneGrist(texte, { code: '0' }), { code: '0' });
    assert.equal(cleDeLigneGrist(texte, { code: '' }), null);
  });

  it('valeursPourPg : point reconstruit en GeoJSON (lng, lat), absence conservée', () => {
    assert.deepEqual(valeursPourPg(CONFIG, { type: 'a', cout: 2, latitude: 43.4, longitude: 3.7 }), {
      type: 'a', cout: 2, geom: { type: 'Point', coordinates: [3.7, 43.4] },
    });
    assert.deepEqual(valeursPourPg(CONFIG, { type: null, latitude: null, longitude: 3.7 }), { type: null, cout: null, geom: null });
    const json = { ...CONFIG, geometrie: { pg: 'geom', mode: 'json', grist: 'geometry_json', lat: 'centroid_lat', lng: 'centroid_lon' } };
    assert.equal(valeursPourPg(json, { geometry_json: '{"type":"Point"}' }).geom, '{"type":"Point"}');
    assert.equal(valeursPourPg(json, { geometry_json: '' }).geom, null);
    assert.equal(valeursPourPg({ ...CONFIG, geometrie: null }, { type: 'x' }).geom, undefined);
  });
});

describe('pg-sync — la comparaison à trois états', () => {
  const ecarts = (gl, pl, sn, config = CONFIG) => calculerEcarts(config, { gristLignes: gl, pgLignes: pl, snapshots: sn });

  it('rien n’a bougé : identiques', () => {
    const e = ecarts([g(1, 1, 'h')], [p(1, 3)], [s(1, 3, 'h')]);
    assert.equal(e.identiques, 1);
    assert.deepEqual([e.aPousser, e.aTirer, e.conflits].map((x) => x.length), [0, 0, 0]);
  });

  it('modifiée dans Grist seulement : à pousser, avec la version lue comme version attendue', () => {
    const e = ecarts([g(1, 1, 'NOUVEAU')], [p(1, 3)], [s(1, 3, 'h')]);
    assert.deepEqual(e.aPousser.map((x) => [x.action, x.version_attendue, x.ligne]), [['modifier', 3, 1]]);
    assert.equal(e.aTirer.length + e.conflits.length, 0);
  });

  it('modifiée dans PostgreSQL seulement : à tirer', () => {
    const e = ecarts([g(1, 1, 'h')], [p(1, 4)], [s(1, 3, 'h')]);
    assert.deepEqual(e.aTirer.map((x) => [x.action, x.version]), [['modifier', 4]]);
  });

  it('modifiée des deux côtés : conflit, jamais écrasement', () => {
    const e = ecarts([g(1, 1, 'NOUVEAU')], [p(1, 4)], [s(1, 3, 'h')]);
    assert.equal(e.conflits.length, 1);
    assert.equal(e.conflits[0].nature, 'modifie_des_deux_cotes');
    assert.equal(e.aPousser.length + e.aTirer.length, 0);
    assert.ok(NATURES_CONFLIT[e.conflits[0].nature]);
  });

  it('la version se compare comme du texte (3 et "3" sont la même version)', () => {
    assert.equal(ecarts([g(1, 1, 'h')], [p(1, '3')], [s(1, 3, 'h')]).identiques, 1);
    assert.equal(ecarts([g(1, 1, 'h')], [p(1, 'h:abc')], [s(1, 'h:abc', 'h')]).identiques, 1);
  });

  it('lignes nouvelles de Grist : sans clé, ou avec une clé inconnue de PostgreSQL : à insérer', () => {
    const e = ecarts([g(1, null, 'x'), g(2, 50, 'y')], [], []);
    assert.deepEqual(e.aPousser.map((x) => [x.action, x.ligne, x.cle]), [['inserer', 1, null], ['inserer', 2, { id: 50 }]]);
    assert.equal(e.nouvelles, 1);
  });

  it('ligne nouvelle dans PostgreSQL : à tirer (insertion dans Grist)', () => {
    const e = ecarts([], [p(9, 1)], []);
    assert.deepEqual(e.aTirer.map((x) => [x.action, x.cle]), [['inserer', { id: 9 }]]);
  });

  it('supprimée dans Grist, inchangée dans PostgreSQL : à désactiver (ou supprimer, selon la table)', () => {
    assert.deepEqual(ecarts([], [p(1, 3)], [s(1, 3, 'h')]).aPousser.map((x) => [x.action, x.version_attendue]), [['desactiver', 3]]);
    const reelle = { ...CONFIG, suppression: 'reelle' };
    assert.deepEqual(ecarts([], [p(1, 3)], [s(1, 3, 'h')], reelle).aPousser.map((x) => x.action), ['supprimer']);
    const interdite = { ...CONFIG, suppression: 'interdite' };
    const e = ecarts([], [p(1, 3)], [s(1, 3, 'h')], interdite);
    assert.equal(e.aPousser.length, 0);
    assert.match(e.impossibles[0].raison, /n'autorise pas la suppression/);
  });

  it('supprimée dans Grist mais modifiée dans PostgreSQL : conflit', () => {
    const e = ecarts([], [p(1, 9)], [s(1, 3, 'h')]);
    assert.equal(e.conflits[0].nature, 'supprime_grist_modifie_pg');
    assert.equal(e.conflits[0].version_pg, 9);
  });

  it('désactivée ou supprimée dans PostgreSQL, inchangée dans Grist : la ligne Grist disparaît (à tirer)', () => {
    assert.deepEqual(ecarts([g(1, 1, 'h')], [p(1, 4, { actif: false })], [s(1, 3, 'h')]).aTirer.map((x) => x.action), ['supprimer']);
    assert.deepEqual(ecarts([g(1, 1, 'h')], [], [s(1, 3, 'h')]).aTirer.map((x) => x.action), ['supprimer']);
  });

  it('désactivée dans PostgreSQL mais modifiée dans Grist : conflit, qui sait que la ligne est désactivée', () => {
    const e = ecarts([g(1, 1, 'NOUVEAU')], [p(1, 4, { actif: false })], [s(1, 3, 'h')]);
    assert.equal(e.conflits[0].nature, 'modifie_grist_supprime_pg');
    assert.equal(e.conflits[0].pgDesactive, true);
  });

  it('une ligne désactivée dans PostgreSQL ne compte pas comme présente', () => {
    const e = ecarts([], [p(5, 2, { actif: false })], []);
    assert.deepEqual([e.aTirer.length, e.aPousser.length, e.conflits.length], [0, 0, 0]);
  });

  it('pas de référence commune alors que les deux côtés ont la ligne : conflit (on ne devine pas)', () => {
    const e = ecarts([g(1, 1, 'h')], [p(1, 3)], []);
    assert.equal(e.conflits[0].nature, 'sans_reference');
  });

  it('disparue des deux côtés : on oublie son « vu »', () => {
    assert.deepEqual(ecarts([], [], [s(1, 3, 'h')]).nettoyage, [cleCanon({ id: 1 })]);
  });

  it('deux lignes Grist avec la même clé : doublon signalé, aucun plan possible', () => {
    const e = ecarts([g(1, 7, 'a'), g(2, 7, 'b')], [p(7, 1)], [s(7, 1, 'a')]);
    assert.equal(e.doublons.length, 1);
    assert.equal(planifier(CONFIG, e, {}).pret, false);
  });

  it('un cas de chaque, ensemble', () => {
    const e = ecarts(
      [g(1, 1, 'h'), g(2, 2, 'NOUVEAU'), g(3, 3, 'h'), g(4, 4, 'NOUVEAU'), g(5, null, 'n')],
      [p(1, 1), p(2, 1), p(3, 2), p(4, 2), p(6, 1)],
      [s(1, 1, 'h'), s(2, 1, 'h'), s(3, 1, 'h'), s(4, 1, 'h'), s(7, 1, 'h')],
    );
    const r = resumer(e);
    assert.deepEqual([r.identiques, r.modifications, r.insertions, r.aTirer, r.conflits], [1, 1, 1, 2, 1]);
    assert.equal(e.nettoyage.length, 1);
  });
});

describe('pg-sync — le plan, une fois les conflits tranchés', () => {
  const unConflit = (nature, extra = {}) => ({
    identiques: 0, aPousser: [], aTirer: [], nettoyage: [], impossibles: [], doublons: [], nouvelles: 0,
    conflits: [{ id: 'c1', nature, cleCanon: cleCanon({ id: 1 }), cle: { id: 1 }, ligne: 1, version_pg: 9, pgDesactive: false, ...extra }],
  });

  it('TOUJOURS DEMANDER : tant qu’un conflit n’a pas de choix, rien n’est prêt', () => {
    const e = unConflit('modifie_des_deux_cotes');
    for (const choix of [{}, { c1: undefined }, { c1: 'peut-etre' }, { c1: '' }, { c1: null }]) {
      const plan = planifier(CONFIG, e, choix);
      assert.equal(plan.pret, false);
      assert.deepEqual(plan.sansChoix, ['c1']);
      assert.equal(plan.push.length + plan.pull.length, 0, 'aucune opération n’est sortie');
    }
    assert.deepEqual([...CHOIX], ['pg', 'grist', 'ignorer']);
  });

  it('modifiée des deux côtés : « PostgreSQL gagne » tire, « Grist gagne » pousse avec la version lue, « ignorer » ne fait rien', () => {
    const e = unConflit('modifie_des_deux_cotes');
    assert.deepEqual(planifier(CONFIG, e, { c1: 'pg' }).pull.map((x) => [x.action, x.version]), [['modifier', 9]]);
    assert.deepEqual(planifier(CONFIG, e, { c1: 'grist' }).push.map((x) => [x.action, x.version_attendue]), [['modifier', 9]]);
    const ign = planifier(CONFIG, e, { c1: 'ignorer' });
    assert.deepEqual([ign.push.length, ign.pull.length, ign.ignores.length], [0, 0, 1]);
  });

  it('modifiée dans Grist, supprimée dans PostgreSQL : pg = la ligne Grist disparaît ; grist = réinsérée (ou réactivée)', () => {
    const e = unConflit('modifie_grist_supprime_pg');
    assert.deepEqual(planifier(CONFIG, e, { c1: 'pg' }).pull.map((x) => x.action), ['supprimer']);
    assert.deepEqual(planifier(CONFIG, e, { c1: 'grist' }).push.map((x) => x.action), ['inserer']);
    const des = unConflit('modifie_grist_supprime_pg', { pgDesactive: true });
    assert.deepEqual(planifier(CONFIG, des, { c1: 'grist' }).push.map((x) => [x.action, x.version_attendue]), [['reactiver_puis_modifier', 9]]);
  });

  it('supprimée dans Grist, modifiée dans PostgreSQL : pg = la ligne revient ; grist = désactivée/supprimée avec la version lue', () => {
    const e = unConflit('supprime_grist_modifie_pg', { ligne: null });
    assert.deepEqual(planifier(CONFIG, e, { c1: 'pg' }).pull.map((x) => x.action), ['inserer']);
    assert.deepEqual(planifier(CONFIG, e, { c1: 'grist' }).push.map((x) => [x.action, x.version_attendue]), [['desactiver', 9]]);
    assert.deepEqual(planifier({ ...CONFIG, suppression: 'reelle' }, e, { c1: 'grist' }).push.map((x) => x.action), ['supprimer']);
  });

  it('les écarts sans conflit passent tels quels dans le plan', () => {
    const e = { ...unConflit('sans_reference'), conflits: [], aPousser: [{ action: 'inserer', ligne: 4 }], aTirer: [{ action: 'modifier', ligne: 5 }] };
    const plan = planifier(CONFIG, e, {});
    assert.equal(plan.pret, true);
    assert.deepEqual([plan.push.length, plan.pull.length], [1, 1]);
  });

  it('la mémoire du « vu » est une table d’Atlas', () => {
    assert.equal(TABLE_SYNC, 'Atlas_PgSync');
  });
});
