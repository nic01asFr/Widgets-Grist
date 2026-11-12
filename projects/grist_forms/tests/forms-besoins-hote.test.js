/*
 * forms_besoins_hote — ce qu'un FormDef demande à son hôte, et ce qui manque. Commande pure : elle lit, elle calcule,
 * elle n'écrit rien. Une saisie qui manque de capacité retombe sur un champ ordinaire, jamais sur une erreur.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { monter } = require('../forms-registre/index.js');
const Noyau = require('../shared/noyau-saisies.js');

const registre = monter();
const appeler = (entree) => registre.appeler('forms_besoins_hote', entree);
const sortie = (entree) => { const r = appeler(entree); assert.equal(r.ok, true, JSON.stringify(r)); return r.sortie; };

function formdef(champs, extra) {
  return Object.assign({ manifest_version: '1.0.0', id: 'releve', title: 'Relevé', tableId: 'Releve', composeMode: 'bind', choices: {}, sections: [{ id: 's', label: 'S', fields: champs }] }, extra || {});
}
const VOIX = { colId: 'constat', label: 'Constat', type: 'Text', widget: 'voix', options: { extraction: { consigne: 'Relève le lieu.', champs: ['lieu'] } } };
const LIEU = { colId: 'lieu', label: 'Lieu', type: 'Text', widget: 'text' };
const PHOTO = { colId: 'vue', label: 'Photos', type: 'Attachments', widget: 'photo' };
const AUDIO = { colId: 'son', label: 'Son', type: 'Attachments', widget: 'audio' };
const SCAN = { colId: 'code', label: 'Code', type: 'Text', widget: 'scan' };
const POS = { colId: 'pos', label: 'Position', type: 'Text', widget: 'geo' };
const RELEVE = [VOIX, LIEU, PHOTO, AUDIO, SCAN, POS];

const HOTE_COMPLET = { capacites: { micro: true, camera: true, position: true, scanner: true }, services: { transcrire: { sortant: 'tiers', nom: 'api.exemple.test' }, extraire: { sortant: 'local' } } };

describe('la commande est déclarée comme une commande pure qui n\'écrit rien', () => {
  const c = registre.commandes.find((x) => x.nom === 'forms_besoins_hote');
  it('pure, sans écriture, avec des exemples', () => {
    assert.equal(c.nature, 'pure');
    assert.equal(c.ecrit, 'rien');
    assert.ok(c.exemples.length >= 2);
    assert.equal(c.verbe, 'structurer');
  });
  it('figure dans la fiche, et la fiche dit qu\'aucune capture ne se pilote par commande', () => {
    const f = registre.fiche();
    assert.ok(f.verbes.structurer.includes('forms_besoins_hote'));
    assert.ok(f.limites.some((l) => /Aucune capture ne se pilote par commande/.test(l)));
  });
  it('la description le dit : le repli, le widget Grist, aucun secret', () => {
    assert.match(c.description, /jamais sur une erreur/);
    assert.match(c.description, /widget Grist ne déclare aucune capacité/);
    assert.match(c.description, /ni clé, d’adresse ni de nom de modèle|ni de nom de modèle/);
  });
  it('les exemples du registre se rejouent sans erreur', () => {
    c.exemples.forEach((x) => assert.equal(registre.appeler('forms_besoins_hote', x.entree).ok, true, x.titre));
  });
});

describe('sans hôte : ce que le formulaire demande', () => {
  const s = sortie({ formdef: formdef(RELEVE) });
  it('chaque saisie mobile, avec son geste, sa capacité et son repli', () => {
    assert.deepEqual(s.saisies.map((x) => x.colId), ['constat', 'vue', 'son', 'code', 'pos']);
    const par = Object.fromEntries(s.saisies.map((x) => [x.colId, x]));
    assert.equal(par.constat.geste, 'voix');
    assert.equal(par.constat.capacite, 'micro');
    assert.equal(par.vue.capacite, 'camera');
    assert.equal(par.son.capacite, 'micro');
    assert.equal(par.code.capacite, 'scanner');
    assert.equal(par.pos.capacite, 'position');
    Object.keys(par).forEach((k) => assert.ok(par[k].repli && par[k].repli.length > 5, k + ' : un repli dit en français'));
  });
  it('les capacités et les services requis, sans doublon', () => {
    assert.deepEqual(s.capacites_requises, ['micro', 'camera', 'scanner', 'position']);
    assert.deepEqual(s.services_requis, ['transcrire', 'extraire']);
  });
  it('rien ne manque puisqu\'aucun hôte n\'est donné, et aucun mode n\'est annoncé', () => {
    assert.deepEqual(s.manquants, []);
    assert.equal(s.hote, null);
    s.saisies.forEach((x) => assert.equal('mode' in x, false));
  });
  it('un champ ordinaire n\'est pas une saisie mobile', () => {
    assert.ok(!s.saisies.some((x) => x.colId === 'lieu'));
  });
  it('conforme quand le FormDef l\'est', () => {
    assert.equal(s.conforme, true);
    assert.deepEqual(s.ecarts, []);
  });
  it('la lecture d\'un texte nomme les champs lus', () => {
    assert.deepEqual(s.saisies.find((x) => x.colId === 'constat').champs_lus, ['lieu']);
    assert.deepEqual(s.saisies.find((x) => x.colId === 'constat').services, ['transcrire', 'extraire']);
  });
});

describe('dans un widget Grist : aucune capacité de capteur, tout retombe sur le repli', () => {
  const s = sortie({ hote: { capacites: {}, services: {} }, formdef: formdef(RELEVE) });
  it('chaque saisie est remplacée, avec la raison', () => {
    s.saisies.forEach((x) => { assert.equal(x.mode, 'repli', x.colId); });
    assert.equal(s.saisies.find((x) => x.colId === 'vue').raison, 'capacite-absente');
  });
  it('les manquants disent quoi manque et par quoi la saisie est remplacée', () => {
    const besoins = s.manquants.map((m) => m.besoin);
    ['micro', 'camera', 'scanner', 'position', 'extraire'].forEach((b) => assert.ok(besoins.includes(b), b));
    s.manquants.forEach((m) => assert.ok(m.repli && m.repli.length > 5, m.besoin));
  });
  it('un manquant de service se distingue d\'un manquant de capacité', () => {
    assert.equal(s.manquants.find((m) => m.besoin === 'extraire').genre, 'service');
    assert.equal(s.manquants.find((m) => m.besoin === 'micro').genre, 'capacite');
  });
  it('conforme : un hôte qui ne sait rien n\'est pas une erreur', () => {
    assert.equal(s.conforme, true);
  });
});

describe('un hôte qui sait tout : rien ne manque', () => {
  const s = sortie({ hote: HOTE_COMPLET, formdef: formdef(RELEVE) });
  it('toutes les saisies sont servies', () => {
    s.saisies.forEach((x) => assert.equal(x.mode, 'direct', x.colId));
    assert.deepEqual(s.manquants, []);
  });
  it('la dictée et la lecture de la voix sont distinguées', () => {
    const v = s.saisies.find((x) => x.colId === 'constat');
    assert.equal(v.dictee, true);
    assert.equal(v.lecture, true);
  });
  it('la déclaration rendue garde ce qui est déclaré, sans fonction', () => {
    assert.deepEqual(s.hote.capacites, HOTE_COMPLET.capacites);
    assert.deepEqual(s.hote.services.extraire, { sortant: 'local' });
    assert.deepEqual(s.hote.services.transcrire, { sortant: 'tiers', nom: 'api.exemple.test' });
  });
});

describe('des hôtes partiels', () => {
  it('micro sans service de transcription : la dictée manque, la voix reste une zone de texte', () => {
    const s = sortie({ hote: { capacites: { micro: true }, services: {} }, formdef: formdef([Object.assign({}, VOIX, { options: {} })]) });
    const v = s.saisies[0];
    assert.equal(v.dictee, false);
    assert.equal(v.mode, 'repli');
    assert.ok(s.manquants.some((m) => m.besoin === 'transcrire' && m.genre === 'service'));
    assert.ok(!s.manquants.some((m) => m.besoin === 'micro'), 'le micro, lui, est là');
  });
  it('un service de lecture sans micro : le texte écrit à la main se lit, la saisie est servie en partie', () => {
    const s = sortie({ hote: { capacites: {}, services: { extraire: { sortant: 'tiers' } } }, formdef: formdef([VOIX, LIEU]) });
    const v = s.saisies[0];
    assert.equal(v.dictee, false);
    assert.equal(v.lecture, true);
    assert.equal(v.mode, 'direct');
    assert.ok(s.manquants.some((m) => m.besoin === 'micro'));
    assert.ok(!s.manquants.some((m) => m.besoin === 'extraire'));
  });
  it('la position déclarée à faux : manque, avec la carte comme repli', () => {
    const s = sortie({ hote: { capacites: { position: false } }, formdef: formdef([POS]) });
    assert.equal(s.saisies[0].mode, 'repli');
    assert.match(s.manquants[0].repli, /carte/);
  });
  it('la position déclarée : servie', () => {
    assert.equal(sortie({ hote: { capacites: { position: true } }, formdef: formdef([POS]) }).saisies[0].mode, 'direct');
  });
  it('un service dont le sortant n\'est pas indiqué est rendu comme tiers, par prudence', () => {
    const s = sortie({ hote: { capacites: { micro: true }, services: { extraire: {} } }, formdef: formdef([VOIX, LIEU]) });
    assert.equal(s.hote.services.extraire.sortant, 'tiers');
  });
});

describe('la lecture d\'un texte : ce qui compte', () => {
  it('sans consigne ou sans champs visés, pas de lecture et pas de service d\'extraction demandé', () => {
    const sansConsigne = sortie({ formdef: formdef([{ colId: 'c', label: 'C', type: 'Text', widget: 'voix', options: { extraction: { champs: ['lieu'] } } }, LIEU]) });
    assert.deepEqual(sansConsigne.services_requis, ['transcrire']);
    const sansChamps = sortie({ formdef: formdef([{ colId: 'c', label: 'C', type: 'Text', widget: 'voix', options: { extraction: { consigne: 'x' } } }, LIEU]) });
    assert.deepEqual(sansChamps.services_requis, ['transcrire']);
  });
  it('un champ visé qui n\'existe pas, ou le champ lui-même, ne compte pas', () => {
    const s = sortie({ formdef: formdef([{ colId: 'c', label: 'C', type: 'Text', widget: 'voix', options: { extraction: { consigne: 'x', champs: ['c', 'absent'] } } }, LIEU]) });
    assert.deepEqual(s.services_requis, ['transcrire']);
  });
  it('la consigne et les champs du formulaire servent par défaut', () => {
    const s = sortie({ formdef: formdef([{ colId: 'c', label: 'C', type: 'Text', widget: 'voix' }, LIEU], { extraction: { consigne: 'Relève.', champs: ['lieu'] } }) });
    assert.deepEqual(s.services_requis, ['transcrire', 'extraire']);
    assert.deepEqual(s.saisies[0].champs_lus, ['lieu']);
  });
  it('seul le widget voix lit un texte', () => {
    const s = sortie({ formdef: formdef([Object.assign({}, SCAN, { options: { capacite: 'scanner', extraction: { consigne: 'x', champs: [] } } })]) });
    assert.ok(!s.services_requis.includes('extraire'));
  });
});

describe('AUCUN SECRET : une déclaration d\'hôte n\'en porte jamais', () => {
  const SECRET = 'sk-test-0123456789abcdefghij';
  const s = sortie({
    hote: { cle: SECRET, capacites: { micro: true, token: true }, services: { extraire: { sortant: 'tiers', apiKey: SECRET, url: 'https://api.exemple.test/v1', modele: 'gpt' } } },
    formdef: formdef([VOIX, LIEU])
  });
  it('ce qui en porte est écarté et dit, avec le chemin', () => {
    assert.equal(s.conforme, false);
    const e = s.ecarts.join(' | ');
    ['hote.cle', 'hote.capacites.token', 'hote.services.extraire.apiKey', 'hote.services.extraire.url', 'hote.services.extraire.modele'].forEach((c) => assert.match(e, new RegExp(c.replace(/\./g, '\\.'))));
  });
  it('la déclaration rendue ne contient ni la clé, ni l\'adresse, ni le modèle', () => {
    const texte = JSON.stringify(s);
    assert.ok(!texte.includes(SECRET));
    assert.ok(!texte.includes('api.exemple.test'));
    assert.ok(!texte.includes('"gpt"'));
  });
  it('le reste de la déclaration est pris en compte malgré l\'écart', () => {
    assert.equal(s.saisies.find((x) => x.colId === 'constat').lecture, true);
  });
  it('un secret dans le FormDef est dit aussi', () => {
    const f = formdef([Object.assign({}, VOIX, { options: { extraction: { consigne: 'x', champs: ['lieu'], modele: 'gpt' } } }), LIEU]);
    assert.match(sortie({ formdef: f }).ecarts.join(' | '), /ne porte ni clé/);
  });
});

describe('les écarts du FormDef sont dits', () => {
  it('un widget mobile sur le mauvais type', () => {
    const s = sortie({ formdef: formdef([{ colId: 'a', label: 'A', type: 'Int', widget: 'voix' }]) });
    assert.equal(s.conforme, false);
    assert.match(s.ecarts.join(' | '), /« voix » écrit une colonne Text/);
  });
  it('une capacité inconnue dans les options', () => {
    const s = sortie({ formdef: formdef([{ colId: 'a', label: 'A', type: 'Text', widget: 'voix', options: { capacite: 'telepathie' } }]) });
    assert.match(s.ecarts.join(' | '), /telepathie/);
  });
});

describe('des entrées inattendues ne font pas lever', () => {
  it('un FormDef vide, sans sections, avec des champs qui ne sont pas des objets', () => {
    [{}, { sections: 'x' }, { sections: [null, { fields: [null, 3, 'a'] }] }].forEach((f) => {
      const r = appeler({ formdef: f });
      assert.equal(r.ok, true);
      assert.deepEqual(r.sortie.saisies, []);
    });
  });
  it('un hôte qui n\'est pas un objet est refusé par le schéma de la commande', () => {
    const r = appeler({ formdef: formdef([VOIX]), hote: 'micro' });
    assert.equal(r.ok, false);
    assert.equal(r.erreur.code, 'entree-invalide');
  });
  it('un hôte vide : conforme, rien de déclaré', () => {
    const s = sortie({ hote: {}, formdef: formdef([PHOTO]) });
    assert.equal(s.saisies[0].mode, 'repli');
  });
  it('sans formdef : refusé par le schéma', () => {
    assert.equal(appeler({}).ok, false);
  });
  it('déterministe : la même entrée rend la même sortie', () => {
    const e = { hote: HOTE_COMPLET, formdef: formdef(RELEVE) };
    assert.deepEqual(sortie(e), sortie(e));
  });
  it('n\'écrit rien : l\'entrée n\'est pas modifiée', () => {
    const e = { hote: JSON.parse(JSON.stringify(HOTE_COMPLET)), formdef: formdef(RELEVE) };
    const avant = JSON.stringify(e);
    sortie(e);
    assert.equal(JSON.stringify(e), avant);
  });
});

describe('d\'accord avec le noyau : la commande et le moteur disent la même chose', () => {
  it('pour chaque saisie, le mode rendu est celui que le noyau résout pour le même hôte', () => {
    const hote = { capacites: { micro: true, position: true }, services: { transcrire: { sortant: 'tiers' } } };
    const s = sortie({ hote, formdef: formdef([PHOTO, AUDIO, SCAN, POS]) });
    const pseudo = { contrat: 'hote-capacites-0.1', capacites: hote.capacites, services: { transcrire: { sortant: 'tiers', appeler() {} } } };
    [PHOTO, AUDIO, SCAN, POS].forEach((champ) => {
      const attendu = Noyau.resoudreSaisie(champ, pseudo, []);
      const rendu = s.saisies.find((x) => x.colId === champ.colId);
      assert.equal(rendu.mode, attendu.mode, champ.colId);
      assert.equal(rendu.capacite, attendu.capacite, champ.colId);
    });
  });
});

describe('le registre embarque les trois modules, côté page comme côté Node', () => {
  it('index.js, navigateur.js, webmcp.html et le point d\'entrée WebMCP les listent', () => {
    const lire = (f) => fs.readFileSync(path.join(__dirname, '..', 'forms-registre', f), 'utf8');
    assert.match(lire('index.js'), /noyau-saisies\.js/);
    assert.match(lire('index.js'), /hote-capacites\.js/);
    assert.match(lire('index.js'), /saisies-mobiles\.js/);
    assert.match(lire('navigateur.js'), /g\.NoyauSaisies/);
    ['noyau-saisies.js', 'hote-capacites.js', 'saisies-mobiles.js'].forEach((m) => {
      assert.match(lire('webmcp.html'), new RegExp(m.replace('.', '\\.')));
      assert.match(lire('webmcp-entree.js'), new RegExp(m.replace('.', '\\.')));
    });
  });
  it('le noyau se charge avant les modules qui en dépendent', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'forms-registre', 'webmcp.html'), 'utf8');
    assert.ok(html.indexOf('noyau-saisies.js') < html.indexOf('saisies-mobiles.js'));
  });
});
