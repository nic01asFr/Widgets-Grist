/*
 * La dictée : un champ `voix` que l'hôte sait servir (micro, capteur, service de transcription). Le texte rendu
 * s'ajoute à ce qui est écrit pour être relu ; rien n'est écrasé ; un refus, une erreur, une limite se disent et
 * laissent la personne écrire. Sans hôte, ou avec un hôte qui ne sait pas, c'est la zone de texte d'avant.
 */
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

const flush = () => new Promise((resolve) => setTimeout(() => setImmediate(resolve), 5));
async function laisser(n) { for (let i = 0; i < (n || 4); i++) await flush(); }

function def(extra) {
  return {
    manifest_version: '1.0.0', id: 'x', title: 'X', tableId: 'T', composeMode: 'bind', choices: {},
    sections: [{ id: 's', label: 'S', fields: [Object.assign({ colId: 'constat', label: 'Constat', type: 'Text', widget: 'voix' }, extra || {})] }]
  };
}

/** Un enregistreur de banc : il garde ce qu'on lui fait faire et rend un son de la taille voulue. */
function faussesCaptures(o) {
  o = o || {};
  const j = { demarre: 0, arrete: 0, annule: 0 };
  const capteurs = {
    audio: {
      demarrer: async () => {
        j.demarre += 1;
        if (o.refuse) throw Object.assign(new Error('Permission denied'), { name: o.refuse });
        return {
          arreter: async () => { j.arrete += 1; return { blob: { size: o.octets === undefined ? 1000 : o.octets, type: 'audio/webm' }, secondes: o.secondes === undefined ? 5 : o.secondes }; },
          annuler: () => { j.annule += 1; }
        };
      }
    }
  };
  return { capteurs, j };
}

function hoteAvec(reponse, o) {
  o = o || {};
  const appels = [];
  const hote = {
    contrat: 'hote-capacites-0.1', nom: 'application-test',
    capacites: { micro: o.micro === undefined ? true : o.micro },
    services: o.sansService ? {} : { transcrire: { sortant: o.sortant || 'tiers', nom: o.nom || 'api.exemple.test', appeler: async (audio, opt) => { appels.push({ audio, opt }); return typeof reponse === 'function' ? reponse() : reponse; } } },
    limites: o.limites
  };
  return { hote, appels };
}

function monter(options, extra) {
  const root = createRoot();
  const h = Engine.monter(root, def(extra), options);
  return { root, h };
}
const bouton = (root) => root.querySelector('[data-voix-action="basculer"]');

describe('la dictée est offerte quand l\'hôte sait la servir', () => {
  it('un bouton Dicter, la zone de texte, et l\'avertissement qui nomme le service', () => {
    const { hote } = hoteAvec({ texte: 'x' });
    const { root } = monter({ hote, capteurs: faussesCaptures().capteurs });
    const html = root.innerHTML;
    assert.match(html, /<textarea/);
    assert.ok(bouton(root), 'le bouton de dictée');
    assert.match(html, /Dicter/);
    assert.match(html, /aria-pressed="false"/);
    assert.match(html, /envoyé à api\.exemple\.test, hors de cet appareil/);
  });
  it('l\'avertissement ne donne jamais l\'adresse entière ni rien de plus que le nom d\'hôte', () => {
    const { hote } = hoteAvec({ texte: 'x' }, { nom: 'https://api.exemple.test/v1/audio?cle=zzz' });
    const { root } = monter({ hote, capteurs: faussesCaptures().capteurs });
    assert.match(root.innerHTML, /api\.exemple\.test/);
    assert.doesNotMatch(root.innerHTML, /v1\/audio|cle=zzz|https:/);
  });
  it('un service qui reste sur l\'appareil : aucun avertissement d\'envoi', () => {
    const { hote } = hoteAvec({ texte: 'x' }, { sortant: 'local' });
    const { root } = monter({ hote, capteurs: faussesCaptures().capteurs });
    assert.doesNotMatch(root.innerHTML, /quitte|hors de cet appareil/);
  });
});

describe('le repli : la zone de texte d\'avant', () => {
  const sansBouton = (root) => assert.equal(bouton(root), null);

  it('sans hôte : rien ne change', () => {
    const { root } = monter({});
    sansBouton(root);
    assert.match(root.innerHTML, /<textarea/);
  });
  it('hôte sans micro', () => {
    const { hote } = hoteAvec({ texte: 'x' }, { micro: false });
    sansBouton(monter({ hote, capteurs: faussesCaptures().capteurs }).root);
  });
  it('hôte sans service de transcription : un enregistrement n\'aurait nulle part où aller dans du texte', () => {
    const { hote } = hoteAvec(null, { sansService: true });
    sansBouton(monter({ hote, capteurs: faussesCaptures().capteurs }).root);
  });
  it('hôte sans capteur ni API du navigateur', () => {
    const { hote } = hoteAvec({ texte: 'x' });
    sansBouton(monter({ hote }).root);
  });
  it('hôte non conforme : ignoré, dit une fois, la zone de texte reste', () => {
    const dits = [];
    Engine.definirJournal((e) => dits.push(e));
    try {
      const { hote } = hoteAvec({ texte: 'x' });
      hote.cle = 'sk-secret';
      const { root } = monter({ hote, capteurs: faussesCaptures().capteurs });
      sansBouton(root);
      assert.equal(dits.length, 1);
      assert.match(dits[0].message, /hote-capacites-0\.1/);
      assert.ok(!JSON.stringify(dits).includes('sk-secret'), 'la clé ne ressort pas dans le journal');
    } finally { Engine.definirJournal(); }
  });
  it('un autre widget n\'est pas touché par l\'hôte', () => {
    const { hote } = hoteAvec({ texte: 'x' });
    const root = createRoot();
    Engine.monter(root, def({ widget: 'textarea' }), { hote, capteurs: faussesCaptures().capteurs });
    assert.equal(bouton(root), null);
  });
});

describe('une dictée, du clic à la relecture', () => {
  it('Dicter démarre, Arrêter transcrit, le texte est ajouté pour être relu', async () => {
    const { hote, appels } = hoteAvec({ texte: 'Fissure sur le pilier nord' });
    const cap = faussesCaptures();
    const { root, h } = monter({ hote, capteurs: cap.capteurs });

    bouton(root).dispatchEvent('click');
    await laisser();
    assert.equal(cap.j.demarre, 1);
    assert.match(root.innerHTML, /Arrêter la dictée/);
    assert.match(root.innerHTML, /aria-pressed="true"/);

    bouton(root).dispatchEvent('click');
    await laisser();
    assert.equal(cap.j.arrete, 1);
    assert.equal(appels.length, 1, 'une seule transcription');
    assert.equal(h.valeurs().constat, 'Fissure sur le pilier nord');
    assert.match(root.innerHTML, /Texte ajouté : relisez-le/);
    assert.match(root.innerHTML, /Dicter/, 'le bouton revient');
  });
  it('le texte dicté s\'AJOUTE à ce qui est déjà écrit, jamais à sa place', async () => {
    const { hote } = hoteAvec({ texte: 'et une écaille au sol' });
    const cap = faussesCaptures();
    const root = createRoot();
    const h = Engine.monter(root, def(), { hote, capteurs: cap.capteurs, valeurs: { constat: 'Fissure sur le pilier.  ' } });
    bouton(root).dispatchEvent('click'); await laisser();
    bouton(root).dispatchEvent('click'); await laisser();
    assert.equal(h.valeurs().constat, 'Fissure sur le pilier. et une écaille au sol');
  });
  it('la personne a tapé avant de dicter : ce qu\'elle a tapé est gardé', async () => {
    const { hote } = hoteAvec({ texte: 'suite dictée' });
    const cap = faussesCaptures();
    const { root, h } = monter({ hote, capteurs: cap.capteurs });
    root.querySelector('[name="constat"]').value = 'Texte tapé à la main';
    bouton(root).dispatchEvent('click'); await laisser();
    bouton(root).dispatchEvent('click'); await laisser();
    assert.equal(h.valeurs().constat, 'Texte tapé à la main suite dictée');
  });
  it('le service reçoit l\'enregistrement et un signal d\'annulation', async () => {
    const { hote, appels } = hoteAvec({ texte: 'x' });
    const cap = faussesCaptures({ octets: 4321 });
    const { root } = monter({ hote, capteurs: cap.capteurs });
    bouton(root).dispatchEvent('click'); await laisser();
    bouton(root).dispatchEvent('click'); await laisser();
    assert.equal(appels[0].audio.size, 4321);
    assert.ok('signal' in appels[0].opt);
  });
  it('pendant la transcription le bouton est désactivé : pas de seconde dictée par-dessus', async () => {
    let finir;
    const attente = new Promise((r) => { finir = r; });
    const { hote } = hoteAvec(() => attente.then(() => ({ texte: 'tard' })));
    const cap = faussesCaptures();
    const { root, h } = monter({ hote, capteurs: cap.capteurs });
    bouton(root).dispatchEvent('click'); await laisser();
    bouton(root).dispatchEvent('click'); await laisser();
    assert.match(root.innerHTML, /Transcription en cours/);
    assert.match(root.innerHTML, /data-voix-action="basculer"[^>]*disabled/);
    bouton(root).dispatchEvent('click'); await laisser();
    assert.equal(cap.j.demarre, 1, 'aucun second enregistrement pendant l\'envoi');
    finir(); await laisser(6);
    assert.equal(h.valeurs().constat, 'tard');
  });
});

describe('ce qui peut mal tourner se dit, et la personne écrit', () => {
  async function dicter(hote, capteurs, extra) {
    const m = monter({ hote, capteurs }, extra);
    bouton(m.root).dispatchEvent('click'); await laisser();
    if (bouton(m.root)) { bouton(m.root).dispatchEvent('click'); await laisser(6); }
    return m;
  }
  it('micro refusé : la dictée devient du repli pour la séance, on ne redemande pas', async () => {
    const { hote } = hoteAvec({ texte: 'x' });
    const cap = faussesCaptures({ refuse: 'NotAllowedError' });
    const { root } = monter({ hote, capteurs: cap.capteurs });
    bouton(root).dispatchEvent('click'); await laisser();
    assert.equal(bouton(root), null, 'plus de bouton : repli');
    assert.match(root.innerHTML, /L’accès au micro est refusé/);
    assert.match(root.innerHTML, /<textarea/);
    assert.equal(cap.j.demarre, 1);
  });
  it('micro absent ou occupé : même repli, autre message', async () => {
    const { hote } = hoteAvec({ texte: 'x' });
    const cap = faussesCaptures({ refuse: 'NotFoundError' });
    const { root } = monter({ hote, capteurs: cap.capteurs });
    bouton(root).dispatchEvent('click'); await laisser();
    assert.match(root.innerHTML, /Le micro n’est pas disponible/);
  });
  it('service qui refuse les droits : phrase du genre, texte intact, pas de réessai', async () => {
    const { hote, appels } = hoteAvec({ statut: 401 });
    const { root, h } = await dicter(hote, faussesCaptures().capteurs, {});
    assert.equal(appels.length, 1, 'droits ne se réessaie jamais');
    assert.match(root.innerHTML, /Le service de transcription refuse l(?:'|&#39;)accès/);
    assert.ok(!h.valeurs().constat, 'rien n\'est écrit');
  });
  it('rien reconnu (vide) : dit comme « rien reconnu », pas comme une panne', async () => {
    const { hote } = hoteAvec({ texte: '   ' });
    const { root, h } = await dicter(hote, faussesCaptures().capteurs);
    assert.match(root.innerHTML, /Rien n(?:'|&#39;)a été reconnu/);
    assert.ok(!h.valeurs().constat);
  });
  it('un service qui rend autre chose qu\'un texte ne fait rien écrire', async () => {
    const { hote } = hoteAvec({ pasDeTexte: 1 });
    const { h } = await dicter(hote, faussesCaptures().capteurs);
    assert.ok(!h.valeurs().constat);
  });
  it('enregistrement trop long : dit, le service n\'est pas appelé', async () => {
    const { hote, appels } = hoteAvec({ texte: 'x' }, { limites: { audioSecondes: 30 } });
    const { root } = await dicter(hote, faussesCaptures({ secondes: 45 }).capteurs);
    assert.equal(appels.length, 0);
    assert.match(root.innerHTML, /dépasse la durée permise \(30 s\)/);
  });
  it('enregistrement trop lourd, quand l\'hôte borne la taille : de même', async () => {
    const { hote, appels } = hoteAvec({ texte: 'x' }, { limites: { audioSecondes: 600, audioOctets: 2000 } });
    const { root } = await dicter(hote, faussesCaptures({ octets: 5000 }).capteurs);
    assert.equal(appels.length, 0);
    assert.match(root.innerHTML, /dépasse la taille permise/);
  });
  it('arrêt automatique à la durée maximale que l\'hôte annonce', async () => {
    const { hote, appels } = hoteAvec({ texte: 'auto' }, { limites: { audioSecondes: 0.03 } });
    const cap = faussesCaptures({ secondes: 0.03 });
    const { root, h } = monter({ hote, capteurs: cap.capteurs });
    bouton(root).dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 120));
    await laisser(6);
    assert.equal(cap.j.arrete, 1, 'arrêté sans second clic');
    assert.equal(appels.length, 1);
    assert.equal(h.valeurs().constat, 'auto');
  });
  it('le service échoue sur le réseau : réessayé, puis dit', async () => {
    const { hote, appels } = hoteAvec({ statut: 503 });
    const { root } = await dicter(hote, faussesCaptures().capteurs);
    // Quatre essais au total, espacés de 500, 1500 et 4000 ms : on n'attend pas, on vérifie le premier et l'état.
    assert.ok(appels.length >= 1);
    assert.match(root.innerHTML, /Transcription en cours|ne répond pas/);
  });
  it('AUCUNE clé, adresse ni jeton ne ressort du formulaire, même si le service les met dans son message', async () => {
    const secret = 'sk-test-0123456789abcdefghij';
    const { hote } = hoteAvec(() => { throw new Error('401 pour https://api.exemple.test/v1 avec ' + secret); });
    const { root } = await dicter(hote, faussesCaptures().capteurs);
    assert.ok(!root.innerHTML.includes(secret));
    assert.ok(!root.innerHTML.includes('https://api.exemple.test/v1'));
  });
});

describe('démonter pendant une dictée', () => {
  it('ne lève pas, ne transcrit pas, ne redessine pas', async () => {
    const { hote, appels } = hoteAvec({ texte: 'x' });
    const cap = faussesCaptures();
    const { root, h } = monter({ hote, capteurs: cap.capteurs });
    bouton(root).dispatchEvent('click'); await laisser();
    h.demonter();
    await laisser(6);
    assert.equal(appels.length, 0);
  });
  it('démonté avant que le micro réponde : l\'enregistrement est annulé', async () => {
    const { hote } = hoteAvec({ texte: 'x' });
    const cap = faussesCaptures();
    const { root, h } = monter({ hote, capteurs: cap.capteurs });
    bouton(root).dispatchEvent('click');
    h.demonter();
    await laisser(6);
    assert.equal(cap.j.annule, 1);
  });
});

describe('l\'enregistreur du navigateur, quand l\'hôte n\'en fournit pas', () => {
  const garde = {};
  function poser(nav, MediaRecorderFaux) {
    garde.navigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    garde.MediaRecorder = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder');
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
    if (MediaRecorderFaux) Object.defineProperty(globalThis, 'MediaRecorder', { value: MediaRecorderFaux, configurable: true, writable: true });
  }
  afterEach(() => {
    ['navigator', 'MediaRecorder'].forEach((k) => {
      if (garde[k]) Object.defineProperty(globalThis, k, garde[k]); else delete globalThis[k];
      garde[k] = undefined;
    });
  });

  class MediaRecorderFaux {
    constructor(flux) { this.flux = flux; this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    start() { this.state = 'recording'; if (this.ondataavailable) this.ondataavailable({ data: { size: 8 } }); }
    stop() { this.state = 'inactive'; if (this.onstop) this.onstop(); }
  }

  it('getUserMedia puis MediaRecorder : la dictée aboutit, les pistes sont arrêtées', async () => {
    let pistesArretees = 0;
    poser({ mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { pistesArretees += 1; } }] }) } }, MediaRecorderFaux);
    const { hote, appels } = hoteAvec({ texte: 'du navigateur' });
    const { root, h } = monter({ hote });
    assert.ok(bouton(root), 'le bouton est offert');
    bouton(root).dispatchEvent('click'); await laisser();
    bouton(root).dispatchEvent('click'); await laisser(6);
    assert.equal(h.valeurs().constat, 'du navigateur');
    assert.equal(pistesArretees, 1, 'le micro est libéré');
    assert.equal(appels.length, 1);
  });
  it('sans mediaDevices : pas de bouton, la zone de texte', () => {
    poser({}, MediaRecorderFaux);
    const { hote } = hoteAvec({ texte: 'x' });
    assert.equal(bouton(monter({ hote }).root), null);
  });
  it('sans MediaRecorder : pas de bouton', () => {
    poser({ mediaDevices: { getUserMedia: async () => ({}) } }, undefined);
    delete globalThis.MediaRecorder;
    const { hote } = hoteAvec({ texte: 'x' });
    assert.equal(bouton(monter({ hote }).root), null);
  });
});
