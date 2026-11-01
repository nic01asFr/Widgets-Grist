'use strict';

/*
 * Form Builder lit le thème du document (ThemeDef 1.0).
 *
 * La règle de lecture est celle de la spec (§3), la même que celle d'Atlas : table absente ou vide, aucune ligne active, rien et
 * sans bruit ; plusieurs lignes actives, rien et l'avertissement ; contenu non fiable, vérifié à chaque lecture ; jamais d'écriture.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const T = require('../shared/themedef.js');
const Theme = require('../shared/theme.js');

const td = (extra) => Object.assign({
  version: 'themedef-1.0', nom: 'Mon thème', graines: { principal: '#0b6e4f', secondaire: '#f4a259', encre: '#1b1b1b', fond: '#fdfaf3' },
  modes: { sombre: 'derive' }
}, extra || {});

const colonnes = (lignes) => {
  const c = { id: [], cle: [], themedef: [], actif: [] };
  lignes.forEach((l, i) => { c.id.push(i + 1); c.cle.push(l.cle); c.themedef.push(l.themedef); c.actif.push(l.actif); });
  return c;
};

/** Une API de document qui note ce qu'on lui demande, et refuse toute écriture. */
function apiFausse(tables, contenu) {
  const appels = [];
  return {
    appels,
    listTables: () => { appels.push('listTables'); return Promise.resolve(tables); },
    fetchTable: (t) => { appels.push('fetchTable:' + t); return Promise.resolve(contenu); },
    applyUserActions: () => { appels.push('ECRITURE'); throw new Error('un lecteur n\'écrit jamais'); }
  };
}

describe('ThemeDef : un contenu non fiable', () => {
  it('un thème valide se lit, en texte ou en objet', () => {
    assert.equal(T.lireThemeDef(JSON.stringify(td())).ok, true);
    assert.equal(T.lireThemeDef(td()).ok, true);
  });

  it('chaque défaut est dit par un mot', () => {
    assert.equal(T.lireThemeDef('{pas du json').erreur, 'json');
    assert.equal(T.lireThemeDef('[]').erreur, 'type');
    assert.equal(T.lireThemeDef('"texte"').erreur, 'type');
    assert.equal(T.lireThemeDef(null).erreur, 'type');
    assert.equal(T.lireThemeDef(td({ version: 'themedef-2.0' })).erreur, 'version');
    assert.equal(T.lireThemeDef(td({ graines: {} })).erreur, 'principal');
    assert.equal(T.lireThemeDef(td({ graines: { principal: 'bleu' } })).erreur, 'principal');
    assert.equal(T.lireThemeDef(JSON.stringify(td({ nom: 'x'.repeat(20000) }))).erreur, 'trop-gros');
    assert.equal(T.lireThemeDef(td({ nom: 'x'.repeat(20000) })).erreur, 'trop-gros');
    assert.equal(T.lireThemeDef(JSON.stringify(td({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } }))).erreur, 'profondeur');
    assert.equal(T.lireThemeDef('{"version":"themedef-1.0","graines":{"principal":"#112233"},"__proto__":{"x":1}}').erreur, 'cle-interdite');
    assert.equal(T.lireThemeDef('{"version":"themedef-1.0","graines":{"principal":"#112233"},"surcharges":{"clair":{"constructor":"x"}}}').erreur, 'cle-interdite');
  });

  it('arbitrage : les feuilles comptent dans la profondeur, la taille se mesure en octets', () => {
    // racine = niveau 1 ; chaque valeur, feuille comprise, un niveau de plus ; au-delà du sixième : refusé
    assert.equal(T.lireThemeDef(td({ a: { b: { c: { d: { e: 1 } } } } })).ok, true, 'la feuille au sixième niveau passe');
    assert.equal(T.lireThemeDef(td({ a: { b: { c: { d: { e: { f: 1 } } } } } })).erreur, 'profondeur', 'la feuille au septième : refusée');
    const accents = td({ nom: 'é'.repeat(9000) });
    assert.ok(JSON.stringify(accents).length < 16384, 'moins de 16 384 caractères…');
    assert.equal(T.lireThemeDef(accents).erreur, 'trop-gros', '…mais plus de 16 384 octets');
  });

  it('arbitrage : #RRGGBB strict, et les refus nets', () => {
    assert.equal(T.lireThemeDef(td({ graines: { principal: '#abc' } })).erreur, 'principal');
    assert.equal(T.lireThemeDef(td({ graines: [] })).erreur, 'section');
    assert.equal(T.lireThemeDef(td({ modes: 'derive' })).erreur, 'section');
    assert.equal(T.lireThemeDef(td({ modes: { sombre: 'bleu' } })).erreur, 'sombre');
    assert.equal(T.lireThemeDef(td({ modes: { sombre: 'explicite' } })).erreur, 'explicite-incomplet');
    assert.equal(T.lireThemeDef(td({ modes: { sombre: 'explicite' }, surcharges: { sombre: { fond: '#000000' } } })).erreur, 'explicite-incomplet');
    const complet = {};
    T.CLES.forEach((k) => { complet[k] = '#112233'; });
    assert.equal(T.lireThemeDef(td({ modes: { sombre: 'explicite' }, surcharges: { sombre: complet } })).ok, true);
    assert.equal(T.lireThemeDef(td({ exigences: { contrasteTexte: 4 } })).erreur, 'exigence');
    assert.equal(T.lireThemeDef(td({ exigences: { contrasteComposant: 2.9 } })).erreur, 'exigence');
    assert.equal(T.lireThemeDef(td({ exigences: { contrasteTexte: 'sept' } })).erreur, 'exigence');
    assert.equal(T.lireThemeDef(td({ exigences: { contrasteTexte: 7, contrasteComposant: 3 } })).ok, true, 'on peut renforcer');
  });

  it('vecteurs du kit : une graine qui n est pas un texte, des surcharges qui n en sont pas, un mode sombre aux valeurs refusées', () => {
    assert.equal(T.lireThemeDef(td({ graines: { principal: ['#3D4F63'] } })).erreur, 'principal', 'un tableau n est pas une couleur');
    assert.equal(T.lireThemeDef(td({ surcharges: { clair: [] } })).erreur, 'section');
    assert.equal(T.lireThemeDef(td({ surcharges: { sombre: null } })).erreur, 'section');
    const presque = {};
    T.CLES.forEach((k) => { presque[k] = '#112233'; });
    presque.accent = 'url(x)';
    assert.equal(T.lireThemeDef(td({ modes: { sombre: 'explicite' }, surcharges: { sombre: presque } })).erreur, 'explicite-incomplet', 'une valeur refusée manque');
    assert.deepEqual(T.choisirActif('x'), { ligne: null, avertissements: [] }, 'des lignes qui ne sont pas une liste : rien');
    assert.deepEqual(T.choisirActif({}), { ligne: null, avertissements: [] });
  });

  it('vecteurs du kit : les lignes au-delà de cinquante sont dites, une valeur ne porte aucun espace', () => {
    const lignes = Array.from({ length: 60 }, (_, i) => ({ cle: 't' + i, themedef: '{}', actif: i === 55 }));
    assert.deepEqual(T.choisirActif(lignes), { ligne: null, avertissements: [{ code: 'lignes-ignorees', nombre: 10 }] });
    const deux = Array.from({ length: 60 }, (_, i) => ({ cle: 't' + i, themedef: '{}', actif: i === 1 || i === 2 }));
    const r = T.choisirActif(deux);
    assert.equal(r.ligne, null);
    assert.deepEqual(r.avertissements.map((x) => [x.code, x.nombre]), [['lignes-ignorees', 10], ['plusieurs-actifs', 2]]);
    const un = Array.from({ length: 60 }, (_, i) => ({ cle: 'l' + i, themedef: '{}', actif: i === 3 || i === 55 }));
    assert.equal(T.choisirActif(un).ligne.cle, 'l3');
    const r2 = T.resoudre({ version: 'themedef-1.0', graines: { principal: '#112233' }, surcharges: { clair: { accent: ' #fff', texte: '#fff ', fond: '#fff\n', action: '#fff' } } }, 'clair');
    assert.equal(r2.vars['--kit-action'], '#fff');
    assert.notEqual(r2.vars['--kit-accent'], '#fff', 'avec un espace devant : refusée');
    assert.notEqual(r2.vars['--kit-texte'], '#fff', 'avec un espace derrière : refusée');
  });

  it('arbitrage : ce qui est écarté sans refuser le document', () => {
    assert.equal(T.lireThemeDef(td({ cle_inconnue: 1, police: 'comic', graines: { principal: '#112233', secondaire: 'pas-une-couleur' } })).ok, true);
    assert.equal(T.lireThemeDef(td({ resolu: 'illisible' })).ok, true);
  });

  it('la table est lue en lignes, cinquante au plus', () => {
    const c = colonnes(Array.from({ length: 70 }, (_, i) => ({ cle: 't' + i, themedef: '{}', actif: false })));
    assert.equal(T.lignesDeTable(c).length, 50);
    assert.deepEqual(T.lignesDeTable({}), []);
    assert.deepEqual(T.lignesDeTable(null), []);
  });
});

describe('ThemeDef : la ligne active', () => {
  const l = (cle, actif) => ({ cle, themedef: '{}', actif });

  it('aucune ligne active : rien, sans bruit ; une : elle ; plusieurs : rien et l\'avertissement', () => {
    assert.deepEqual(T.choisirActif([]), { ligne: null, avertissements: [] });
    assert.deepEqual(T.choisirActif([l('a', false), l('b', false)]), { ligne: null, avertissements: [] });
    assert.equal(T.choisirActif([l('a', false), l('b', true)]).ligne.cle, 'b');
    const deux = T.choisirActif([l('a', true), l('b', true)]);
    assert.equal(deux.ligne, null);
    assert.equal(deux.avertissements[0].code, 'plusieurs-actifs');
  });

  it('« actif » est strictement vrai, et la clé est conforme', () => {
    assert.equal(T.choisirActif([l('a', 1)]).ligne, null);
    assert.equal(T.choisirActif([l('a', 'true')]).ligne, null);
    assert.equal(T.choisirActif([l('A_mal', true)]).ligne, null);
    assert.equal(T.choisirActif([l('9a', true)]).ligne, null);
    assert.equal(T.choisirActif(null).ligne, null);
  });

  it('seules les cinquante premières lignes sont examinées', () => {
    const lignes = Array.from({ length: 60 }, (_, i) => l('t' + i, i === 55));
    assert.equal(T.choisirActif(lignes).ligne, null);
  });
});

describe('ThemeDef : résolu pour un mode', () => {
  it('des graines : les 26 variables, toutes admises par le juge du moteur', () => {
    for (const mode of ['clair', 'sombre']) {
      const r = T.resoudre(td(), mode);
      assert.equal(Object.keys(r.vars).length, 26, mode);
      assert.equal(r.source, 'graines');
      assert.equal(r.verifie, false, 'jamais présenté comme vérifié');
      assert.deepEqual(Theme.valider(r.vars).ignore, [], mode);
    }
  });

  // Un `resolu` complet et lisible, tel que le kit l'écrit (tiré de ses vecteurs de lecture).
  const resoluDuKit = () => JSON.parse(require('./fixtures/themedef-lecteur.vecteurs.json').lectures.find((x) => x.id === 'active-valide-clair').contenu[0].themedef).resolu;

  it('les valeurs mesurées de `resolu` priment quand elles sont complètes et tiennent les 22 paires', () => {
    const resolu = resoluDuKit();
    const r = T.resoudre(td({ resolu }), 'clair');
    assert.equal(r.source, 'resolu');
    assert.equal(r.refus, null);
    assert.equal(r.vars['--kit-action'].toLowerCase(), resolu.modes.clair.valeurs.action.toLowerCase());
    assert.equal(Object.keys(r.vars).length, 26);
    assert.equal(r.verifie, false);
  });

  it('un `resolu` incomplet ou aux valeurs interdites est refusé en entier : ni application partielle, ni retour sur les graines', () => {
    const complet = resoluDuKit();
    const sans = JSON.parse(JSON.stringify(complet)); delete sans.modes.clair.valeurs.action;
    const interdite = JSON.parse(JSON.stringify(complet)); interdite.modes.clair.valeurs.accent = 'url(x)';
    for (const resolu of [sans, interdite, { modes: { clair: { valeurs: { fond: '#ffffff', texte: '#000000' } } } }]) {
      const r = T.resoudre(td({ resolu }), 'clair');
      assert.equal(r.refus.code, 'resolu-incomplet');
      assert.deepEqual(r.vars, {}, 'rien n’est appliqué');
    }
  });

  it('un `resolu` qui rate une paire est refusé en entier, même si une surcharge le réparerait', () => {
    const resolu = resoluDuKit();
    resolu.modes.clair.valeurs.texte = '#ffffff';
    resolu.modes.clair.valeurs.fond = '#ffffff';
    const r = T.resoudre(td({ resolu, surcharges: { clair: { texte: '#000000' } } }), 'clair');
    assert.equal(r.refus.code, 'contraste-insuffisant');
    assert.ok(r.refus.echecs.some((e) => e.paire === 'texte-sur-fond' && e.mesure === 1 && e.seuil === 4.5));
    assert.deepEqual(r.vars, {});
  });

  it('une surcharge qui casse une paire après coup fait refuser le thème', () => {
    const r = T.resoudre(td({ resolu: resoluDuKit(), surcharges: { clair: { texte: '#ffffff' } } }), 'clair');
    assert.equal(r.refus.code, 'contraste-insuffisant');
  });

  it('les exigences du document renforcent chaque famille et ne la relâchent jamais', () => {
    assert.deepEqual(T.seuilsDe(td()), { texte: 4.5, composant: 3 });
    assert.deepEqual(T.seuilsDe(td({ exigences: { contrasteTexte: 7, contrasteComposant: 4.5 } })), { texte: 7, composant: 4.5 });
    assert.deepEqual(T.seuilsDe(td({ exigences: { contrasteTexte: 2, contrasteComposant: 1 } })), { texte: 4.5, composant: 3 }, 'jamais plus lâche');
    const exigeant = T.resoudre(td({ resolu: resoluDuKit(), exigences: { contrasteTexte: 21 } }), 'clair');
    assert.equal(exigeant.refus.code, 'contraste-insuffisant', 'un seuil impossible refuse un resolu pourtant correct');
  });

  it('les 22 paires sont celles du kit, et le seuil se choisit selon le premier plan', () => {
    const kit = require('./fixtures/themedef-lecteur.vecteurs.json').paires;
    assert.equal(T.PAIRES.length, 22);
    assert.deepEqual(T.PAIRES.map((p) => p.join('-sur-')), kit.map((p) => p.a + '-sur-' + p.b));
    const seuilKit = (a) => kit.find((p) => p.a === a).seuil;
    for (const [a] of T.PAIRES) assert.equal(['bord-champ', 'focus', 'attention-filet'].includes(a) ? 3 : 4.5, seuilKit(a), a);
  });

  it('les couleurs de la mesure sont celles du kit : #RGB, rgb() et hsl() avec pourcentages, jamais var() ni la transparence', () => {
    const base = resoluDuKit();
    const avec = (v) => { const r = JSON.parse(JSON.stringify(base)); Object.assign(r.modes.clair.valeurs, v); return r; };
    for (const blanc of ['#fff', 'rgb(255,255,255)', 'rgb(100%, 100%, 100%)', 'hsl(0, 0%, 100%)']) {
      const r = T.resoudre(td({ resolu: avec({ texte: blanc, fond: '#ffffff' }) }), 'clair');
      assert.equal(r.refus && r.refus.code, 'contraste-insuffisant', blanc + ' sur blanc est mesuré, donc refusé');
    }
    const nonMesurable = T.resoudre(td({ resolu: avec({ 'texte-2': 'var(--x)' }) }), 'clair');
    assert.equal(nonMesurable.refus, null, 'une valeur qu’on ne sait pas mesurer ne fait jamais échouer une paire');
  });

  it('les surcharges passent après, et seulement sur les 26 clés', () => {
    const r = T.resoudre(td({ surcharges: { clair: { 'bord-champ': '#6b6b6b', inconnue: '#ffffff' }, sombre: {} } }), 'clair');
    assert.equal(r.vars['--kit-bord-champ'], '#6b6b6b');
    assert.ok(!Object.keys(r.vars).some((k) => /inconnue/.test(k)));
  });

  it('le mode sombre : dérivé, ou absent (« aucun » : le clair reste)', () => {
    assert.equal(T.resoudre(td(), 'sombre').mode, 'sombre');
    assert.equal(T.resoudre(td({ modes: { sombre: 'aucun' } }), 'sombre').mode, 'clair');
    assert.deepEqual(T.modesDe(td({ modes: { sombre: 'aucun' } })), ['clair']);
    assert.notEqual(T.resoudre(td(), 'sombre').vars['--kit-fond'], T.resoudre(td(), 'clair').vars['--kit-fond']);
  });

  it('une valeur de graine qui n\'est pas #RRGGBB ne passe pas : le défaut reste', () => {
    const r = T.deriver({ principal: 'red;background:url(x)', encre: 'javascript:1', fond: '#GGGGGG' }, 'clair');
    Object.keys(r.vars).forEach((k) => assert.match(r.vars[k], /^(#[0-9a-f]{6}|rgba\(0, 0, 0, 0\.25\))$/, k));
  });
});

describe('ThemeDef : charger le thème d\'un document', () => {
  const contenu = (lignes) => colonnes(lignes);

  it('un thème actif s\'applique, et dit qu\'il n\'est pas vérifié', async () => {
    const api = apiFausse(['Reponses', 'Theme_document'], contenu([{ cle: 'maison', themedef: JSON.stringify(td()), actif: true }]));
    const r = await T.charger(api, { mode: 'clair' });
    assert.equal(r.raison, 'applique');
    assert.equal(r.ligne, 'maison');
    assert.equal(r.nom, 'Mon thème');
    assert.equal(Object.keys(r.theme).length, 26);
    assert.equal(r.verifie, false);
    assert.equal(r.avertissements[0].code, 'non-verifie');
  });

  it('table absente : rien n\'est lu, rien n\'est créé', async () => {
    const api = apiFausse(['Reponses'], contenu([]));
    const r = await T.charger(api);
    assert.equal(r.theme, null);
    assert.equal(r.raison, 'table-absente');
    assert.deepEqual(api.appels, ['listTables'], 'la table n\'est même pas relue');
  });

  it('table vide, sans actif, plusieurs actifs, contenu invalide : rien n\'est appliqué', async () => {
    const vides = await T.charger(apiFausse(['Theme_document'], contenu([])));
    assert.equal(vides.theme, null);
    assert.equal(vides.raison, 'aucun-actif');
    assert.deepEqual(vides.avertissements, []);

    const deux = await T.charger(apiFausse(['Theme_document'], contenu([
      { cle: 'a', themedef: JSON.stringify(td()), actif: true }, { cle: 'b', themedef: JSON.stringify(td()), actif: true }])));
    assert.equal(deux.theme, null);
    assert.equal(deux.raison, 'plusieurs-actifs');
    assert.equal(deux.avertissements[0].code, 'plusieurs-actifs');

    const casse = await T.charger(apiFausse(['Theme_document'], contenu([{ cle: 'a', themedef: '{cassé', actif: true }])));
    assert.equal(casse.theme, null);
    assert.equal(casse.raison, 'invalide');
    assert.equal(casse.avertissements[0].detail, 'json');
  });

  it('aucune écriture, jamais : seules la liste et la lecture de la table sont demandées', async () => {
    const api = apiFausse(['Theme_document'], contenu([{ cle: 'a', themedef: JSON.stringify(td()), actif: true }]));
    await T.charger(api);
    assert.deepEqual(api.appels, ['listTables', 'fetchTable:Theme_document']);
  });

  it('une API absente, ou en panne, ne casse rien', async () => {
    assert.equal((await T.charger(null)).raison, 'pas-de-document');
    assert.equal((await T.charger({})).raison, 'pas-de-document');
    const enPanne = { listTables: () => Promise.reject(new Error('hors ligne')), fetchTable: () => Promise.resolve({}) };
    assert.equal((await T.charger(enPanne)).raison, 'lecture-impossible');
    const lecturePanne = { listTables: () => Promise.resolve(['Theme_document']), fetchTable: () => { throw new Error('droits'); } };
    assert.equal((await T.charger(lecturePanne)).raison, 'lecture-impossible');
  });

  it('la personne passe avant le thème : contraste forcé ou renforcé, rien n\'est posé', async () => {
    const avant = global.matchMedia;
    global.matchMedia = (q) => ({ matches: /forced-colors/.test(q) });
    try {
      const api = apiFausse(['Theme_document'], contenu([{ cle: 'a', themedef: JSON.stringify(td()), actif: true }]));
      const r = await T.charger(api);
      assert.equal(r.theme, null);
      assert.equal(r.raison, 'preference-personne');
      assert.deepEqual(api.appels, [], 'rien n\'est même lu');
      global.matchMedia = (q) => ({ matches: /prefers-contrast: more/.test(q) });
      assert.equal((await T.charger(api)).raison, 'preference-personne');
      global.matchMedia = (q) => ({ matches: /prefers-color-scheme: dark/.test(q) });
      assert.equal(T.modeSysteme(), 'sombre');
    } finally {
      if (avant === undefined) delete global.matchMedia; else global.matchMedia = avant;
    }
  });
});

describe('ThemeDef : poser et retirer', () => {
  afterEach(() => { delete global.matchMedia; });

  const element = () => {
    const posees = {};
    return { posees, style: { setProperty: (k, v) => { posees[k] = v; }, removeProperty: (k) => { delete posees[k]; } } };
  };

  it('les variables se posent avec les noms que la page d\'origine lit, et se retirent', () => {
    const e = element();
    const noms = T.appliquer(e, T.resoudre(td(), 'clair').vars);
    assert.ok(e.posees['--kit-action']);
    assert.equal(e.posees['--fond-page'], e.posees['--kit-fond']);
    assert.equal(e.posees['--encre'], e.posees['--kit-texte']);
    assert.ok(noms.length >= 26);
    T.retirer(e, noms);
    assert.deepEqual(e.posees, {});
  });

  it('un élément sans style ne casse rien', () => {
    assert.deepEqual(T.appliquer(null, { '--kit-fond': '#ffffff' }), []);
    assert.deepEqual(T.appliquer({}, { '--kit-fond': '#ffffff' }), []);
    T.retirer(null, ['--kit-fond']);
  });
});

describe('ThemeDef : l\'apparence d\'un formulaire, et le thème donné en entrée', () => {
  const def = (apparence) => ({ id: 'f', title: 'F', tableId: 'T', sections: [], apparence });

  it('sans apparence, ou avec une apparence illisible, le formulaire suit le document', () => {
    assert.deepEqual(T.apparenceDe({}), { mode: 'document', themedef: null, erreur: null });
    assert.deepEqual(T.apparenceDe(null), { mode: 'document', themedef: null, erreur: null });
    assert.equal(T.apparenceDe(def('x')).mode, 'document');
    assert.equal(T.apparenceDe(def({ mode: 'inconnu' })).mode, 'document');
    assert.equal(T.apparenceDe(def({ mode: 'aucune' })).mode, 'aucune');
  });

  it('un thème donné au formulaire se lit comme une donnée non fiable, et retombe sur le document en le disant', () => {
    const ok = T.apparenceDe(def({ mode: 'formulaire', themedef: td() }));
    assert.equal(ok.mode, 'formulaire');
    assert.equal(ok.themedef.nom, 'Mon thème');
    const casse = T.apparenceDe(def({ mode: 'formulaire', themedef: td({ version: 'themedef-2.0' }) }));
    assert.equal(casse.mode, 'document', 'un thème illisible ne casse rien');
    assert.equal(casse.erreur, 'version');
    // Choisir « un thème pour ce formulaire » avant d'en donner un n'est pas une erreur : on attend, et le formulaire suit le document.
    assert.deepEqual(T.apparenceDe(def({ mode: 'formulaire' })), { mode: 'document', themedef: null, erreur: null, attente: true });
    assert.equal(T.apparenceDe(def({ mode: 'formulaire', themedef: null })).attente, true);
    assert.equal(T.apparenceDe(def({ mode: 'formulaire', themedef: 'pas un objet' })).erreur, 'json', 'donné mais illisible : une erreur');
  });

  it('le thème du formulaire est résolu sans rien lire, et le dit non vérifié', () => {
    const r = T.themeFormulaire(def({ mode: 'formulaire', themedef: td() }), 'clair');
    assert.equal(Object.keys(r.theme).length, 26);
    assert.equal(r.verifie, false);
    assert.equal(r.themedef.nom, 'Mon thème', 'de quoi le figer dans une page autonome');
    assert.equal(T.themeFormulaire(def({ mode: 'aucune' })), null);
    assert.equal(T.themeFormulaire({}), null);
  });

  it('charger : le thème du formulaire prime sur le document et ne lit aucune table', async () => {
    const api = apiFausse(['Theme_document'], colonnes([{ cle: 'doc', themedef: JSON.stringify(td({ nom: 'Document' })), actif: true }]));
    const r = await T.charger(api, { def: def({ mode: 'formulaire', themedef: td({ nom: 'Formulaire' }) }), mode: 'clair' });
    assert.equal(r.raison, 'formulaire');
    assert.equal(r.nom, 'Formulaire');
    assert.deepEqual(api.appels, [], 'aucune lecture');
  });

  it('charger : « aucune » ne pose rien, quoi que dise le document', async () => {
    const api = apiFausse(['Theme_document'], colonnes([{ cle: 'doc', themedef: JSON.stringify(td()), actif: true }]));
    const r = await T.charger(api, { def: def({ mode: 'aucune' }) });
    assert.equal(r.theme, null);
    assert.equal(r.raison, 'apparence-aucune');
    assert.deepEqual(api.appels, []);
  });

  it('charger : le thème donné en entrée marche hors de Grist (aucun document)', async () => {
    const r = await T.charger(null, { def: def({ mode: 'formulaire', themedef: td() }), mode: 'sombre' });
    assert.equal(r.raison, 'formulaire');
    assert.equal(r.mode, 'sombre');
    assert.equal((await T.charger(null, { def: def({ mode: 'document' }) })).raison, 'pas-de-document');
  });

  it('charger : un thème du document garde son ThemeDef, de quoi le figer dans une page autonome', async () => {
    const api = apiFausse(['Theme_document'], colonnes([{ cle: 'doc', themedef: JSON.stringify(td()), actif: true }]));
    const r = await T.charger(api, { def: def(undefined) });
    assert.equal(r.raison, 'applique');
    assert.equal(r.themedef.nom, 'Mon thème');
  });

  it('la personne passe avant : même un thème donné au formulaire cède au contraste forcé', async () => {
    const avant = global.matchMedia;
    global.matchMedia = (q) => ({ matches: /forced-colors/.test(q) });
    try {
      assert.equal((await T.charger(null, { def: def({ mode: 'formulaire', themedef: td() }) })).raison, 'preference-personne');
    } finally {
      if (avant === undefined) delete global.matchMedia; else global.matchMedia = avant;
    }
  });
});
