'use strict';

/**
 * L'étage « hôte » : le thème que Grist pousse dans un widget (mode et couleur d'action de la personne) sert de repli, dans le mode
 * `grist`, quand le document n'a rien dit. Ces tests n'ont ni Grist ni navigateur : un faux document et une fausse fenêtre portent
 * ce que `grist-plugin-api.js` pose (attributs sur <html>, variables `--grist-theme-*`), et un faux observateur rejoue les changements.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../shared/themedef.js');

/** Un faux <html> + une fausse fenêtre. `etat.attrs` et `etat.vars` se modifient en cours de test ; `declencher()` réveille l'observateur. */
function fauxHote(etat) {
  etat = etat || {};
  etat.attrs = etat.attrs || {};
  etat.vars = etat.vars || {};
  etat.couleursSonde = etat.couleursSonde || {};
  const observeurs = [];
  const style = { poses: {}, setProperty(k, v) { this.poses[k] = v; }, removeProperty(k) { delete this.poses[k]; } };
  const racine = {
    style,
    getAttribute: (k) => (k in etat.attrs ? etat.attrs[k] : null),
    appendChild() {}, removeChild() {}
  };
  const doc = { documentElement: racine, head: null, createElement: () => ({ style: {} }) };
  const fenetre = {
    getComputedStyle(el) {
      if (el === racine) return { getPropertyValue: (n) => (n in etat.vars ? etat.vars[n] : '') };
      return { color: etat.couleursSonde.valeur || '' };
    },
    MutationObserver: class {
      constructor(f) { this.f = f; this.actif = true; observeurs.push(this); }
      observe() {}
      disconnect() { this.actif = false; }
    }
  };
  return {
    doc, fenetre, racine, style, etat, observeurs,
    declencher() { observeurs.filter((o) => o.actif).forEach((o) => o.f()); }
  };
}

const grist = (appearance, primaire, extra) => fauxHote({
  attrs: { 'data-grist-appearance': appearance, 'data-grist-theme': appearance === 'dark' ? 'GristDark' : 'GristLight' },
  vars: Object.assign({ '--grist-theme-control-primary-bg': primaire || '' }, extra || {})
});

describe('Étage hôte : lire une couleur annoncée par Grist', () => {
  it('accepte l\'hexadécimal, rgb() opaque, white et black, et rend #rrggbb en minuscules', () => {
    assert.equal(T.lireCouleur('#3E5DE7'), '#3e5de7');
    assert.equal(T.lireCouleur('#3E5'), '#33ee55');
    assert.equal(T.lireCouleur('rgb(62, 93, 231)'), '#3e5de7');
    assert.equal(T.lireCouleur('rgb(62 93 231)'), '#3e5de7');
    assert.equal(T.lireCouleur('rgba(62, 93, 231, 1)'), '#3e5de7');
    assert.equal(T.lireCouleur('rgba(62, 93, 231, 100%)'), '#3e5de7');
    assert.equal(T.lireCouleur(' White '), '#ffffff');
    assert.equal(T.lireCouleur('black'), '#000000');
  });

  it('refuse tout ce qu\'elle ne sait pas lire sans le deviner', () => {
    ['', null, undefined, 42, {}, 'rgba(0, 0, 0, 0.5)', 'rgba(0,0,0,50%)', 'rgb(300, 0, 0)', 'transparent', 'red', 'var(--x)', 'color-mix(in srgb, red, blue)', '#12', '#12345', '#gggggg', 'hsl(0, 0%, 0%)']
      .forEach((brut) => assert.equal(T.lireCouleur(brut), '', String(brut)));
  });
});

describe('Étage hôte : lire ce que Grist annonce', () => {
  it('hors de Grist (aucun attribut, aucune variable) : null', () => {
    const f = fauxHote();
    assert.equal(T.lireHote({ doc: f.doc, fenetre: f.fenetre }), null);
    assert.equal(T.lireHote({ doc: null, fenetre: null }), null);
  });

  it('lit le mode, le nom du thème et la couleur des boutons principaux', () => {
    const f = grist('dark', '#3e5de7', { '--grist-theme-control-primary-fg': 'white', '--grist-theme-control-primary-hover-bg': 'rgb(1, 2, 3)' });
    assert.deepEqual(T.lireHote({ doc: f.doc, fenetre: f.fenetre }), {
      apparence: 'sombre', nom: 'GristDark', couleurs: { fond: '#3e5de7', texte: '#ffffff', survol: '#010203' }
    });
  });

  it('une apparence inconnue n\'est pas un mode ; le nom est borné', () => {
    const f = fauxHote({ attrs: { 'data-grist-appearance': 'sepia', 'data-grist-theme': ' ' + 'x'.repeat(200) } , vars: { '--grist-theme-control-primary-bg': '#102030' } });
    const h = T.lireHote({ doc: f.doc, fenetre: f.fenetre });
    assert.equal(h.apparence, null);
    assert.equal(h.nom.length, 60);
  });

  it('une valeur que le navigateur sait calculer (var, color-mix) est lue par une sonde ; sinon refusée', () => {
    const f = grist('light', 'var(--grist-theme-primary)');
    f.etat.couleursSonde.valeur = 'rgb(10, 20, 30)';
    assert.equal(T.lireHote({ doc: f.doc, fenetre: f.fenetre }).couleurs.fond, '#0a141e');
    f.etat.couleursSonde.valeur = 'color(srgb 0.1 0.2 0.3)';
    assert.equal(T.lireHote({ doc: f.doc, fenetre: f.fenetre }).couleurs.fond, '');
  });
});

describe('Étage hôte : le thème qu\'on en tire', () => {
  const ratio = (a, b) => T.contraste(a, b);

  it('reprend la couleur d\'action de l\'instance, rendue lisible (H2), et le dit', () => {
    const t = T.themeHote({ apparence: 'clair', nom: 'GristLight', couleurs: { fond: '#3e5de7', texte: '', survol: '' } });
    assert.equal(t.mode, 'clair');
    assert.equal(t.nom, 'GristLight');
    ['fond', 'surface', 'surface-2'].forEach((f) => assert.ok(ratio(t.vars['--kit-action'], t.vars['--kit-' + f]) >= 4.5, 'action sur ' + f));
    assert.ok(ratio(t.vars['--kit-action-texte'], t.vars['--kit-action']) >= 4.5, 'H1');
    assert.ok(t.remarques.some((r) => /assombrie/.test(r)));
    assert.equal(Object.keys(t.vars).length, 26);
  });

  it('une couleur qui tient déjà les portes est gardée telle quelle, sans remarque', () => {
    const t = T.themeHote({ apparence: 'clair', couleurs: { fond: '#0b3d91' } });
    assert.equal(t.vars['--kit-action'], '#0b3d91');
    assert.deepEqual(t.remarques, []);
  });

  it('une couleur qui ne tient pas est ramenée jusqu\'à 4,5:1 sur le fond, la surface et la surface douce', () => {
    const t = T.themeHote({ apparence: 'clair', couleurs: { fond: '#ffff00' } });
    ['fond', 'surface', 'surface-2'].forEach((f) => assert.ok(ratio(t.vars['--kit-action'], t.vars['--kit-' + f]) >= 4.5, f));
    assert.ok(t.remarques.length >= 1);
  });

  it('en sombre, la couleur est éclaircie (jamais une action sombre sur fond sombre)', () => {
    const t = T.themeHote({ apparence: 'sombre', couleurs: { fond: '#0b3d91' } });
    assert.equal(t.mode, 'sombre');
    assert.equal(t.vars['--kit-fond'], '#161616');
    ['fond', 'surface', 'surface-2'].forEach((f) => assert.ok(ratio(t.vars['--kit-action'], t.vars['--kit-' + f]) >= 4.5, f));
  });

  it('clair sans couleur : rien à changer (null). Sombre sans couleur : le sombre de l\'origine, jamais une couleur inventée', () => {
    assert.equal(T.themeHote({ apparence: 'clair', couleurs: { fond: '', texte: '', survol: '' } }), null);
    const s = T.themeHote({ apparence: 'sombre', couleurs: {} });
    assert.equal(s.vars['--kit-fond'], '#161616');
    assert.ok(ratio(s.vars['--kit-action'], s.vars['--kit-surface']) >= 4.5);
    assert.equal(s.action, '');
  });

  it('le mode de l\'hôte prime sur celui du système ; à défaut d\'apparence, le mode demandé', () => {
    assert.equal(T.themeHote({ apparence: 'clair', couleurs: { fond: '#0b3d91' } }, { mode: 'sombre' }).mode, 'clair');
    assert.equal(T.themeHote({ apparence: null, couleurs: { fond: '#0b3d91' } }, { mode: 'sombre' }).mode, 'sombre');
    assert.equal(T.themeHote({ apparence: null, couleurs: { fond: '#0b3d91' } }).mode, 'clair');
  });

  it('refuse une entrée qui n\'est pas une lecture', () => {
    [null, undefined, 'x', 3].forEach((e) => assert.equal(T.themeHote(e), null));
  });

  it('ne dépend que de ce qui est lu : une couleur illisible ne passe jamais', () => {
    const t = T.themeHote({ apparence: 'clair', couleurs: { fond: 'rgba(0,0,0,.5)' } });
    assert.equal(t, null, 'une couleur qui n\'a pas passé la lecture est vide : rien à reprendre en clair');
  });
});

describe('Étage hôte : suivre et attendre', () => {
  it('suivreHote ne rappelle que si la lecture change : poser ses propres variables ne réveille personne', () => {
    const f = grist('light', '#0b3d91');
    let n = 0;
    const arret = T.suivreHote(() => { n++; }, { doc: f.doc, fenetre: f.fenetre });
    f.declencher();
    assert.equal(n, 0, 'rien n\'a changé');
    f.etat.attrs['data-grist-appearance'] = 'dark';
    f.declencher();
    assert.equal(n, 1);
    f.declencher();
    assert.equal(n, 1, 'même lecture : pas de nouveau rappel');
    arret();
    assert.equal(f.observeurs[0].actif, false);
  });

  it('suivreHote sans observateur disponible : ne plante pas', () => {
    const f = grist('light', '#0b3d91');
    f.fenetre.MutationObserver = undefined;
    assert.equal(typeof T.suivreHote(() => {}, { doc: f.doc, fenetre: f.fenetre }), 'function');
  });

  it('attendreHote : tout de suite si Grist a déjà parlé, rien à attendre hors de Grist, la fin du délai sinon', async () => {
    const present = grist('dark', '#0b3d91');
    assert.equal((await T.attendreHote({ doc: present.doc, fenetre: present.fenetre }, 500)).apparence, 'sombre');
    const absent = fauxHote();
    const t0 = Date.now();
    assert.equal(await T.attendreHote({ doc: absent.doc, fenetre: absent.fenetre }, 0), null);
    assert.ok(Date.now() - t0 < 50, 'aucune attente sans délai');
    assert.equal(await T.attendreHote({ doc: absent.doc, fenetre: absent.fenetre }, 30), null);
  });

  it('attendreHote : rend la lecture dès que Grist envoie son thème, avant la fin du délai', async () => {
    const f = fauxHote();
    const p = T.attendreHote({ doc: f.doc, fenetre: f.fenetre }, 2000);
    f.etat.attrs['data-grist-appearance'] = 'light';
    f.etat.vars['--grist-theme-control-primary-bg'] = '#0b3d91';
    const t0 = Date.now();
    f.declencher();
    const h = await p;
    assert.ok(Date.now() - t0 < 500);
    assert.equal(h.couleurs.fond, '#0b3d91');
  });
});

// ── charger : le mode `grist` ─────────────────────────────────────────────────

const td = (extra) => Object.assign({ version: 'themedef-1.0', nom: 'Mon thème', graines: { principal: '#0b6e4f' }, modes: { sombre: 'derive' } }, extra || {});
const colonnes = (lignes) => {
  const c = { id: [], cle: [], themedef: [], actif: [] };
  lignes.forEach((l, i) => { c.id.push(i + 1); c.cle.push(l.cle); c.themedef.push(l.themedef); c.actif.push(l.actif); });
  return c;
};
function apiFausse(tables, table) {
  const appels = [];
  return {
    appels,
    listTables: async () => { appels.push('listTables'); return tables; },
    fetchTable: async (nom) => { appels.push('fetchTable ' + nom); if (table instanceof Error) throw table; return table; }
  };
}
const def = (apparence) => ({ id: 'f', title: 'F', tableId: 'T', sections: [], apparence });
const lecteur = (f) => ({ doc: f.doc, fenetre: f.fenetre });

describe('Mode grist : apparenceDe', () => {
  it('le mode est reconnu ; sans apparence ou en « document », le formulaire ne prend PAS l\'hôte', () => {
    assert.equal(T.apparenceDe(def({ mode: 'grist' })).mode, 'grist');
    assert.equal(T.apparenceDe(def(undefined)).mode, 'document');
    assert.equal(T.apparenceDe(def({ mode: 'document' })).mode, 'document');
    assert.equal(T.apparenceDe(def({ mode: 'GRIST' })).mode, 'document', 'un mode inconnu retombe sur le document');
  });
});

describe('Mode grist : charger', () => {
  it('le thème actif du document passe avant celui de Grist, et l\'hôte n\'est même pas lu', async () => {
    const f = grist('dark', '#3e5de7');
    const api = apiFausse(['Theme_document'], colonnes([{ cle: 'doc', themedef: JSON.stringify(td({ nom: 'Document' })), actif: true }]));
    const r = await T.charger(api, { def: def({ mode: 'grist' }), lecteurHote: lecteur(f), attenteHote: 0, mode: 'clair' });
    assert.equal(r.raison, 'applique');
    assert.equal(r.nom, 'Document');
  });

  it('sans table, sans ligne active ou illisible à lire : le thème de Grist prend le relais', async () => {
    const f = grist('dark', '#3e5de7');
    for (const api of [
      apiFausse([], null),
      apiFausse(['Theme_document'], colonnes([{ cle: 'doc', themedef: JSON.stringify(td()), actif: false }])),
      apiFausse(['Theme_document'], new Error('accès refusé'))
    ]) {
      const r = await T.charger(api, { def: def({ mode: 'grist' }), lecteurHote: lecteur(f), attenteHote: 0 });
      assert.equal(r.raison, 'hote');
      assert.equal(r.mode, 'sombre');
      assert.equal(r.nom, 'GristDark');
      assert.equal(r.hote, true);
      assert.equal(Object.keys(r.theme).length, 26);
    }
  });

  it('un document qui dit quelque chose d\'illisible, ou de contradictoire, n\'est PAS remplacé par l\'hôte', async () => {
    const f = grist('dark', '#3e5de7');
    const casse = apiFausse(['Theme_document'], colonnes([{ cle: 'doc', themedef: '{pas du json', actif: true }]));
    const r1 = await T.charger(casse, { def: def({ mode: 'grist' }), lecteurHote: lecteur(f), attenteHote: 0 });
    assert.equal(r1.raison, 'invalide');
    assert.equal(r1.theme, null);
    const deux = apiFausse(['Theme_document'], colonnes([
      { cle: 'a', themedef: JSON.stringify(td()), actif: true }, { cle: 'b', themedef: JSON.stringify(td()), actif: true }]));
    const r2 = await T.charger(deux, { def: def({ mode: 'grist' }), lecteurHote: lecteur(f), attenteHote: 0 });
    assert.equal(r2.raison, 'plusieurs-actifs');
    assert.equal(r2.theme, null);
  });

  it('sans mode grist, l\'hôte n\'est JAMAIS repris : les formulaires existants ne changent pas', async () => {
    const f = grist('dark', '#3e5de7');
    for (const apparence of [undefined, { mode: 'document' }, { mode: 'aucune' }]) {
      const r = await T.charger(apiFausse([], null), { def: def(apparence), lecteurHote: lecteur(f), attenteHote: 0 });
      assert.equal(r.theme, null, JSON.stringify(apparence));
    }
  });

  it('un thème donné au formulaire passe avant tout, hôte compris', async () => {
    const f = grist('dark', '#3e5de7');
    const r = await T.charger(apiFausse([], null), { def: def({ mode: 'formulaire', themedef: td({ nom: 'Formulaire' }) }), lecteurHote: lecteur(f), attenteHote: 0 });
    assert.equal(r.raison, 'formulaire');
  });

  it('hors de Grist (pas d\'API de document) : aucune attente, aucun hôte', async () => {
    const t0 = Date.now();
    const r = await T.charger(null, { def: def({ mode: 'grist' }) });
    assert.equal(r.raison, 'pas-de-document');
    assert.ok(Date.now() - t0 < 50);
  });

  it('dans Grist mais sans thème annoncé : rien n\'est posé, l\'origine reste', async () => {
    const f = fauxHote();
    const r = await T.charger(apiFausse([], null), { def: def({ mode: 'grist' }), lecteurHote: lecteur(f), attenteHote: 0 });
    assert.equal(r.theme, null);
    assert.equal(r.raison, 'table-absente');
  });

  it('un hôte clair sans couleur d\'action ne change rien', async () => {
    const f = grist('light', '');
    const r = await T.charger(apiFausse([], null), { def: def({ mode: 'grist' }), lecteurHote: lecteur(f), attenteHote: 0 });
    assert.equal(r.theme, null);
  });

  it('la personne passe avant : contraste forcé, rien n\'est posé même avec un hôte', async () => {
    const avant = global.matchMedia;
    global.matchMedia = (q) => ({ matches: /forced-colors/.test(q) });
    try {
      const f = grist('dark', '#3e5de7');
      const r = await T.charger(apiFausse([], null), { def: def({ mode: 'grist' }), lecteurHote: lecteur(f), attenteHote: 0 });
      assert.equal(r.raison, 'preference-personne');
    } finally { if (avant === undefined) delete global.matchMedia; else global.matchMedia = avant; }
  });
});

describe('Mode grist : habiller suit le thème de Grist à chaud', () => {
  it('pose le thème, puis le remplace quand la personne change de thème dans Grist, puis s\'arrête', async () => {
    const f = grist('light', '#0b3d91');
    const api = apiFausse([], null);
    const r = await T.habiller(f.racine, api, { def: def({ mode: 'grist' }), lecteurHote: lecteur(f), attenteHote: 0 });
    assert.equal(r.raison, 'hote');
    assert.equal(f.style.poses['--kit-fond'], '#f6f6f6');
    assert.equal(f.style.poses['--kit-action'], '#0b3d91');

    f.etat.attrs['data-grist-appearance'] = 'dark';
    f.declencher();
    await new Promise((resolu) => setTimeout(resolu, 20));
    assert.equal(f.style.poses['--kit-fond'], '#161616', 'le sombre est posé sans recharger');

    r.arreter();
    f.etat.attrs['data-grist-appearance'] = 'light';
    f.declencher();
    await new Promise((resolu) => setTimeout(resolu, 20));
    assert.equal(f.style.poses['--kit-fond'], '#161616', 'suivi arrêté : rien ne bouge');
  });

  it('les variables posées par le formulaire ne le réveillent pas (pas de boucle)', async () => {
    const f = grist('light', '#0b3d91');
    await T.habiller(f.racine, apiFausse([], null), { def: def({ mode: 'grist' }), lecteurHote: lecteur(f), attenteHote: 0 });
    const avant = JSON.stringify(f.style.poses);
    f.declencher();
    f.declencher();
    await new Promise((resolu) => setTimeout(resolu, 20));
    assert.equal(JSON.stringify(f.style.poses), avant);
  });

  it('hors du mode grist, aucun suivi n\'est installé', async () => {
    const f = grist('light', '#0b3d91');
    const r = await T.habiller(f.racine, apiFausse([], null), { def: def(undefined), lecteurHote: lecteur(f), attenteHote: 0 });
    assert.equal(f.observeurs.length, 0);
    assert.equal(r.theme, null);
    assert.deepEqual(f.style.poses, {});
  });

  it('un thème de document est posé aussi, et le suivi de Grist ne l\'écrase pas', async () => {
    const f = grist('light', '#3e5de7');
    const api = apiFausse(['Theme_document'], colonnes([{ cle: 'doc', themedef: JSON.stringify(td()), actif: true }]));
    await T.habiller(f.racine, api, { def: def({ mode: 'grist' }), lecteurHote: lecteur(f), attenteHote: 0 });
    const action = f.style.poses['--kit-action'];
    f.etat.attrs['data-grist-appearance'] = 'dark';
    f.declencher();
    await new Promise((resolu) => setTimeout(resolu, 20));
    assert.equal(f.style.poses['--kit-action'] !== undefined, true);
    assert.ok(action, 'le thème du document est posé');
  });
});
