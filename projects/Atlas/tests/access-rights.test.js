/**
 * Tests Atlas v7 — le mode d'ouverture suit les droits Grist.
 * node --test projects/Atlas/tests/access-rights.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gristGrantFromSearch, resolveAccess, decodeAccessToken, initialsFrom, isWriteAclError } from '../lib/view-mode.js';

describe('gristGrantFromSearch', () => {
  it('lit ce que Grist transmet reellement', () => {
    // URL observee en production
    const g = gristGrantFromSearch('?access=full&readonly=false&culture=fr-FR&currency=USD');
    assert.deepEqual(g, { readonly: false, access: 'full' });
  });

  it('distingue « non transmis » de « false »', () => {
    assert.equal(gristGrantFromSearch('?access=full').readonly, null);
    assert.equal(gristGrantFromSearch('?readonly=false').readonly, false);
  });

  it('accepte les ecritures usuelles du booleen', () => {
    for (const v of ['true', 'TRUE', '1', 'yes']) {
      assert.equal(gristGrantFromSearch(`?readonly=${v}`).readonly, true, v);
    }
  });
});

describe('resolveAccess — les droits Grist font autorite', () => {
  it('« access=full » ne suffit pas : il faut sonder', () => {
    // `access` decrit le niveau accorde AU WIDGET, pas les droits de la
    // personne. Verifie en simulant un lecteur via `aclAsUser_` : l'iframe
    // recoit `access=full&readonly=false` malgre l'ACL, et Atlas ouvrait
    // l'edition a quelqu'un qui n'a pas le droit d'ecrire.
    const r = resolveAccess({ search: '?access=full&readonly=false' });
    assert.equal(r.viewMode, false, 'pas de blocage a priori : la sonde tranchera');
    assert.equal(r.needsProbe, true, 'seule la sonde d ecriture dit vrai');
  });

  it('les droits refuses par Grist restent sans appel', () => {
    // Ce sens-la est fiable : Grist ne declare pas la lecture a tort.
    for (const q of ['?readonly=true', '?access=none', '?access=read%20table']) {
      const r = resolveAccess({ search: q });
      assert.equal(r.viewMode, true, q);
      assert.equal(r.needsProbe, false, `inutile de sonder : ${q}`);
    }
  });

  it('document partage en lecture : mode visite, sans connexion ni parametre', () => {
    const r = resolveAccess({ search: '?access=read%20table&readonly=true' });
    assert.equal(r.viewMode, true);
    assert.equal(r.requiredAccess, 'read table');
  });

  it('lecteur authentifie non editeur : lecture', () => {
    assert.equal(resolveAccess({ search: '?access=full&readonly=true' }).viewMode, true);
  });

  it('?mode= ne peut PAS octroyer l\'ecriture', () => {
    // Quelqu'un ajoute mode=edit sur un document ou il est lecteur.
    const r = resolveAccess({ search: '?access=read%20table&readonly=true&mode=edit' });
    assert.equal(r.viewMode, true, 'les droits Grist priment sur l\'URL');
    assert.equal(r.reason, 'grist-readonly');
  });

  it('?mode=view peut restreindre un editeur qui previsualise', () => {
    const r = resolveAccess({ search: '?access=full&readonly=false&mode=view' });
    assert.equal(r.viewMode, true);
    assert.equal(r.reason, 'mode-view');
  });

  it('?mode=view masque les outils, il ne ferme pas l ecriture du widget', () => {
    // C'est le lien de terrain : lecture a l'ecran, saisie possible dans un
    // formulaire publie. Demander `read table` fermait l'ecriture AU WIDGET,
    // avant tout examen des droits de la personne — la sonde echouait alors
    // pour une raison qui n'avait rien a voir avec elle.
    const r = resolveAccess({ search: '?access=full&readonly=false&mode=view' });
    assert.equal(r.requiredAccess, 'full', 'le widget garde ce que le document lui accorde');
  });

  it('mais ?mode=view ne reclame jamais plus que ce qui est accorde', () => {
    const r = resolveAccess({ search: '?access=read%20table&readonly=false&mode=view' });
    assert.equal(r.requiredAccess, 'read table');
    // Et un document en lecture seule reste juge par Grist, pas par l'URL.
    const ro = resolveAccess({ search: '?access=full&readonly=true&mode=view' });
    assert.equal(ro.reason, 'grist-readonly');
    assert.equal(ro.requiredAccess, 'read table');
  });

  it('sans rien de transmis, ?mode=view reste prudent', () => {
    const r = resolveAccess({ search: '?mode=view' });
    assert.equal(r.viewMode, true);
    assert.equal(r.requiredAccess, 'read table');
  });

  it('rien de transmis : on retombe sur la sonde', () => {
    const r = resolveAccess({ search: '' });
    assert.equal(r.needsProbe, true);
    assert.equal(r.viewMode, false);
  });

  it('access=none : lecture', () => {
    assert.equal(resolveAccess({ search: '?access=none' }).viewMode, true);
  });
});

describe('decodeAccessToken — base64url', () => {
  const mk = (payload) => {
    const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${b64u({ alg: 'HS256' })}.${b64u(payload)}.sig`;
  };

  it('decode une charge utile simple', () => {
    assert.equal(decodeAccessToken(mk({ userId: 42 })).userId, 42);
  });

  it('decode une charge utile contenant - et _ apres encodage', () => {
    // Payload choisi pour produire des caracteres base64url : sans la
    // conversion, atob leve et l'identification tombe en silence.
    const p = { userId: 7, docId: 'g6MXJMbjseTn', scope: '~?~>>>???' };
    const jeton = mk(p);
    assert.ok(/[-_]/.test(jeton.split('.')[1]), 'le test doit bien exercer base64url');
    assert.equal(decodeAccessToken(jeton).userId, 7);
    assert.equal(decodeAccessToken(jeton).docId, 'g6MXJMbjseTn');
  });

  it('null sur un jeton absent ou malforme', () => {
    assert.equal(decodeAccessToken(null), null);
    assert.equal(decodeAccessToken('abc'), null);
    assert.equal(decodeAccessToken('a.b.c'), null);
  });
});

describe('initiales affichees', () => {
  it('initiales — nom compose, nom pointe, repli sur l\'email', () => {
    assert.equal(initialsFrom('Quentin Leroy', null), 'QL');
    assert.equal(initialsFrom('nicolas.laval', null), 'NL');
    assert.equal(initialsFrom(null, 'marie.dupont@cerema.fr'), 'MD');
    assert.equal(initialsFrom('Cher', null), 'C');
    assert.equal(initialsFrom(null, null), null);
  });
});

describe('isWriteAclError — les libelles que Grist renvoie vraiment', () => {
  it('reconnait le refus des regles d acces', () => {
    // Mesure sur le document de test, simulation `aclAsUser_` :
    //   403 {"error":"Blocked by table update access rules"}
    // Ni « blocked » ni « access rules » n'etaient dans le motif : la sonde
    // concluait a l'ecriture, et Atlas ouvrait l'edition a un lecteur.
    for (const m of [
      'Blocked by table update access rules',
      'Blocked by row update access rules',
      'Blocked by column update access rules',
      'Blocked by table create access rules',
      'Cannot modify a read-only document',
      'AUTH: user not authorized to modify',
      'Access denied',
    ]) assert.equal(isWriteAclError(new Error(m)), true, m);
  });

  it('ne prend pas une panne ordinaire pour un refus de droits', () => {
    // Un editeur ne doit jamais se retrouver bloque en lecture par erreur :
    // la sonde ecrit sur une ligne inexistante, « not found » est le cas NORMAL.
    for (const m of [
      'Record 999999999 not found',
      "[Sandbox] KeyError 'Maquette_Layers'",
      'Network error',
      'Invalid column type',
      'no such table: Foo',
    ]) assert.equal(isWriteAclError(new Error(m)), false, m);
  });
});
