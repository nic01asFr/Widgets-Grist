'use strict';
/**
 * Aides des tests de lib/q2g-qgis2web.js (sans DOM, sans JSZip).
 *
 *  - lireZip(octets) : mini lecteur ZIP compatible avec l'usage qu'en fait le module
 *    (JSZip.loadAsync -> { files: { nom: { async(type) } } }), via zlib.
 *  - normaliser / normaliserCouche : copie conforme de la normalisation de
 *    tests/harness/golden-run.js (lignes 24-25 et 53-148), pour comparer la sortie du
 *    module aux golden tests/golden/parse/*.json captures dans le navigateur.
 *    Si golden-run.js change de format, recopier ce bloc.
 */
const zlib = require('node:zlib');

function lireZip(octets) {
  const buf = Buffer.isBuffer(octets) ? octets : Buffer.from(octets);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP invalide (fin de repertoire introuvable)');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP invalide (repertoire central)');
    const methode = buf.readUInt16LE(p + 10);
    const tailleComp = buf.readUInt32LE(p + 20);
    const lNom = buf.readUInt16LE(p + 28);
    const lExtra = buf.readUInt16LE(p + 30);
    const lCom = buf.readUInt16LE(p + 32);
    const posLocal = buf.readUInt32LE(p + 42);
    const nom = buf.toString('utf8', p + 46, p + 46 + lNom);
    p += 46 + lNom + lExtra + lCom;
    const debut = posLocal + 30 + buf.readUInt16LE(posLocal + 26) + buf.readUInt16LE(posLocal + 28);
    const brut = buf.subarray(debut, debut + tailleComp);
    const contenu = () => (methode === 0 ? Buffer.from(brut) : zlib.inflateRawSync(brut));
    if (nom.endsWith('/')) continue;
    files[nom] = {
      async(type) {
        const c = contenu();
        if (type === 'string') return Promise.resolve(c.toString('utf8'));
        if (type === 'arraybuffer') return Promise.resolve(c.buffer.slice(c.byteOffset, c.byteOffset + c.length));
        return Promise.resolve(c);
      },
    };
  }
  return { files };
}

/** Faux JSZip : loadAsync(octets) -> archive lisible. */
const FauxJSZip = { loadAsync: (octets) => Promise.resolve(lireZip(octets)) };

/** Archive en memoire { nom: texte } au meme format. */
function zipDepuisTextes(textes) {
  const files = {};
  for (const [nom, texte] of Object.entries(textes)) {
    files[nom] = { async: (type) => Promise.resolve(type === 'string' ? texte : Buffer.from(texte)) };
  }
  return { files };
}

const DECIMALES = 6;
const LIMITE_CHAINE = 400;

// ------------------------------------------------------- outils de hachage
// Hachage non cryptographique a deux voies 32 bits, sans dependance, synchrone.
function Hacheur() { this.h1 = 0xdeadbeef | 0; this.h2 = 0x41c6ce57 | 0; this.n = 0; }
Hacheur.prototype.maj = function (s) {
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    this.h1 = Math.imul(this.h1 ^ c, 2654435761);
    this.h2 = Math.imul(this.h2 ^ c, 1597334677);
  }
  this.n += s.length;
  // separateur : distingue ["ab","c"] de ["a","bc"]
  this.h1 = Math.imul(this.h1 ^ 0x1f, 2654435761);
  this.h2 = Math.imul(this.h2 ^ 0x1f, 1597334677);
};
Hacheur.prototype.digest = function () {
  var a = this.h1, b = this.h2;
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (b >>> 0).toString(16).padStart(8, '0') + (a >>> 0).toString(16).padStart(8, '0')
    + '-' + this.n.toString(36);
};
function empreinte(s) { var h = new Hacheur(); h.maj(String(s)); return h.digest(); }

// ---------------------------------------------------------- normalisation
function arrondi(n) {
  var r = Math.round(n * Math.pow(10, DECIMALES)) / Math.pow(10, DECIMALES);
  return r === 0 ? 0 : r; // supprime -0
}

function normaliser(v, vus) {
  if (v === null || v === undefined) return v === undefined ? undefined : null;
  switch (typeof v) {
    case 'number':
      return Number.isFinite(v) ? arrondi(v) : { __nombre: String(v) };
    case 'string':
      return v.length > LIMITE_CHAINE
        ? { __chaine: true, longueur: v.length, debut: v.slice(0, 120), empreinte: empreinte(v) }
        : v;
    case 'boolean':
      return v;
    case 'bigint':
      return { __bigint: String(v) };
    case 'function':
      return '[fonction]';
    case 'symbol':
      return '[symbole]';
  }
  vus = vus || new WeakSet();
  if (vus.has(v)) return '[cycle]';
  if (typeof Node !== 'undefined' && v instanceof Node) return '[noeud]';
  if (v instanceof ArrayBuffer) {
    return { __octets: v.byteLength, empreinte: empreinte(Array.prototype.join.call(new Uint8Array(v), ',')) };
  }
  if (ArrayBuffer.isView(v)) {
    return { __vue: v.constructor.name, longueur: v.byteLength,
      empreinte: empreinte(Array.prototype.join.call(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), ',')) };
  }
  vus.add(v);
  var sortie;
  if (Array.isArray(v)) {
    sortie = v.map(function (x) { var n = normaliser(x, vus); return n === undefined ? null : n; });
  } else if (v instanceof Map) {
    sortie = { __map: Array.from(v.entries()).map(function (e) { return [normaliser(e[0], vus), normaliser(e[1], vus)]; }) };
  } else if (v instanceof Set) {
    sortie = { __set: Array.from(v.values()).map(function (x) { return normaliser(x, vus); }) };
  } else {
    sortie = {};
    Object.keys(v).sort().forEach(function (k) {
      var n = normaliser(v[k], vus);
      if (n !== undefined) sortie[k] = n;
    });
  }
  vus.delete(v);
  return sortie;
}

function resumeEntites(entites) {
  entites = entites || [];
  var h = new Hacheur();
  for (var i = 0; i < entites.length; i++) h.maj(JSON.stringify(normaliser(entites[i])));
  return {
    compte: entites.length,
    premieres: entites.slice(0, 3).map(function (e) { return normaliser(e); }),
    derniere: entites.length > 3 ? normaliser(entites[entites.length - 1]) : null,
    empreinte: h.digest()
  };
}

function normaliserCouche(couche) {
  if (!couche || typeof couche !== 'object') return normaliser(couche);
  var reste = {};
  Object.keys(couche).forEach(function (k) { if (k !== 'features') reste[k] = couche[k]; });
  var out = normaliser(reste);
  out.features = resumeEntites(couche.features);
  return out;
}

module.exports = { lireZip, FauxJSZip, zipDepuisTextes, normaliser, normaliserCouche, empreinte };
