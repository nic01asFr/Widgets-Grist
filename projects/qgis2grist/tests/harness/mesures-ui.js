// Mesures de l'interface de qgis2grist (index_v2.html) dans un navigateur : zones de la barre du haut, contrastes (couleurs
// composees), cibles tactiles, tailles de police. Charge par evaluate_script, comme golden-run.js :
//
//   await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = '/tests/harness/mesures-ui.js';
//     s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
//   window.__q2gMesures.barre()          // rectangles des zones de la barre, a la largeur courante
//   window.__q2gMesures.contrastes()     // paires texte / fond sous 4,5:1 (3:1 pour le grand texte), couleurs composees
//   window.__q2gMesures.cibles()         // boutons et champs de moins de 44 px (a lancer avec emulation tactile)
//   window.__q2gMesures.polices()        // textes visibles de moins de 11 px
//
// Ne modifie rien dans la page ; aucune ecriture.
(function () {
  'use strict';

  function analyser(c) {
    const m = /^rgba?\(([^)]+)\)$/.exec(String(c || '').trim());
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function composer(dessus, dessous) {
    const a = dessus.a;
    return { r: dessus.r * a + dessous.r * (1 - a), g: dessus.g * a + dessous.g * (1 - a), b: dessus.b * a + dessous.b * (1 - a), a: 1 };
  }
  function luminance(c) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function ratio(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function hex(c) { const h = (v) => Math.round(v).toString(16).padStart(2, '0'); return '#' + h(c.r) + h(c.g) + h(c.b); }

  /** Fond effectif d'un element : les fonds des ancetres composes du plus proche au plus lointain, sur blanc. */
  function fondEffectif(el) {
    const pile = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const c = analyser(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) { pile.push(c); if (c.a >= 1) break; }
    }
    let fond = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = pile.length - 1; i >= 0; i--) fond = composer(pile[i], fond);
    return fond;
  }
  /** Opacite cumulee des ancetres (opacity CSS). */
  function opacite(el) {
    let o = 1;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  }
  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    return true;
  }
  function aUnTexteDirect(el) {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    return false;
  }
  function chemin(el) {
    const p = [];
    for (let e = el; e && e.nodeType === 1 && p.length < 4; e = e.parentElement) {
      p.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : ''));
    }
    return p.join(' > ');
  }

  function contrastes(opts) {
    const o = opts || {};
    const racine = o.racine ? document.querySelector(o.racine) : document.body;
    const res = [];
    const vus = new Set();
    for (const el of racine.querySelectorAll('*')) {
      if (!aUnTexteDirect(el) || !visible(el)) continue;
      if (el.closest('iframe,script,style')) continue;
      const cs = getComputedStyle(el);
      let fg = analyser(cs.color);
      if (!fg) continue;
      const fond = fondEffectif(el);
      const op = opacite(el);
      if (op < 0.05) continue;   // element invisible (toast replie...)
      fg = composer({ r: fg.r, g: fg.g, b: fg.b, a: fg.a * op }, fond);
      const px = parseFloat(cs.fontSize);
      const gras = Number(cs.fontWeight) >= 700;
      const grand = px >= 24 || (px >= 18.66 && gras);
      const r = ratio(fg, fond);
      const seuil = grand ? 3 : 4.5;
      const cle = chemin(el) + '|' + hex(fg) + '|' + hex(fond);
      if (vus.has(cle)) continue;
      vus.add(cle);
      res.push({ el: chemin(el), texte: el.textContent.trim().slice(0, 28), fg: hex(fg), fond: hex(fond), ratio: Math.round(r * 100) / 100, px: Math.round(px * 10) / 10, seuil, ok: r >= seuil });
    }
    return o.tout ? res : res.filter((x) => !x.ok);
  }

  function cibles(opts) {
    const o = opts || {};
    const min = o.min || 44;
    const res = [];
    for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, summary, [role=button]')) {
      if (!visible(el)) continue;
      // une case a cocher dans un libelle cliquable : la cible est le libelle
      const cible = el.type === 'checkbox' && el.closest('label') ? el.closest('label') : el;
      const rc = cible.getBoundingClientRect();
      if (rc.width < min - 0.5 || rc.height < min - 0.5) {
        res.push({ el: chemin(el), texte: (el.textContent || el.getAttribute('aria-label') || el.placeholder || '').trim().slice(0, 28), w: Math.round(rc.width), h: Math.round(rc.height) });
      }
    }
    return res;
  }

  function polices(opts) {
    const o = opts || {};
    const min = o.min || 11;
    const racine = o.racine ? document.querySelector(o.racine) : document.body;
    const res = [];
    const vus = new Set();
    for (const el of racine.querySelectorAll('*')) {
      if (!aUnTexteDirect(el) || !visible(el)) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < min - 0.01) {
        const c = chemin(el);
        if (vus.has(c)) continue;
        vus.add(c);
        res.push({ el: c, texte: el.textContent.trim().slice(0, 24), px: Math.round(px * 100) / 100 });
      }
    }
    return res;
  }

  function rect(sel) {
    const e = document.querySelector(sel);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
  }

  function barre() {
    const vol = document.getElementById('map-volume');
    const sync = document.getElementById('map-sync');
    const ent = document.querySelector('#en-tete');
    const zones = {};
    for (const [nom, sel] of [['titre', '.hz-title'], ['couches', '.hz-view'], ['outils', '.hz-tools'], ['etat', '.hz-status'], ['sync', '#map-sync'], ['volume', '#map-volume'], ['actions', '.hz-actions']]) zones[nom] = rect(sel);
    const texteVisible = vol ? Array.from(vol.children).filter((n) => visible(n)).map((n) => n.textContent).join('') : '';
    // recouvrement entre zones de la barre (x, y, largeur, hauteur) : doit rester vide
    const noms = ['titre', 'couches', 'outils', 'etat', 'actions'];
    const recouvrements = [];
    for (let i = 0; i < noms.length; i++) {
      for (let j = i + 1; j < noms.length; j++) {
        const a = zones[noms[i]], b = zones[noms[j]];
        if (!a || !b || a[2] < 2 || b[2] < 2) continue;
        const dx = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
        const dy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
        if (dx > 1 && dy > 1) recouvrements.push(noms[i] + '/' + noms[j]);
      }
    }
    return {
      largeur: innerWidth,
      entete: rect('#en-tete'),
      zones,
      etatVisible: !!sync && visible(sync),
      etatDansEntete: !!(sync && ent && ent.contains(sync) && sync.getBoundingClientRect().bottom <= ent.getBoundingClientRect().bottom + 1),
      etatTronque: vol ? vol.scrollWidth > vol.clientWidth + 1 : null,
      libelle: (document.getElementById('map-sync-label') || {}).textContent,
      texteVisible,
      recouvrements,
      scrollHorizontalPage: document.documentElement.scrollWidth > innerWidth + 1,
    };
  }

  window.__q2gMesures = { contrastes, cibles, polices, barre, ratio, analyser, composer, hex };
})();
