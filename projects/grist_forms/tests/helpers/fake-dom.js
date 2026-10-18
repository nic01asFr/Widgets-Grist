// fake-dom.js — mini DOM (test-only) suffisant pour exercer Engine.mount sans
// dépendance jsdom : parseHtml + sélecteurs `tag`, `[attr="val"]`, `:checked`.
'use strict';

// Un style minimal : assez pour poser et retirer des variables CSS.
function createStyle() {
  var props = {};
  return {
    props: props,
    setProperty: function (name, value) { props[name] = String(value); },
    removeProperty: function (name) { var v = props[name]; delete props[name]; return v || ''; },
    getPropertyValue: function (name) { return Object.prototype.hasOwnProperty.call(props, name) ? props[name] : ''; }
  };
}

function createElement(tagName) {
  return {
    style: createStyle(),
    tagName: tagName,
    attrs: {},
    children: [],
    parentNode: null,
    listeners: {},
    value: '',
    checked: false,
    textContent: '',
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    setAttribute: function (name, val) { this.attrs[name] = val; },
    addEventListener: function (type, fn) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(fn);
    },
    removeEventListener: function (type, fn) {
      var l = this.listeners[type];
      if (!l) return;
      var i = l.indexOf(fn);
      if (i !== -1) l.splice(i, 1);
    },
    // Combien d'écouteurs restent posés : de quoi vérifier qu'un démontage ne fuit pas.
    nbEcouteurs: function () {
      var self = this;
      return Object.keys(this.listeners).reduce(function (n, t) { return n + self.listeners[t].length; }, 0);
    },
    dispatchEvent: function (type) {
      var self = this;
      (this.listeners[type] || []).forEach(function (fn) { fn({ target: self }); });
    },
    querySelector: function (sel) { return querySelectorImpl(this, sel, true); },
    querySelectorAll: function (sel) { return querySelectorImpl(this, sel, false); }
  };
}

function parseHtml(html) {
  var root = createElement('#root');
  var stack = [root];
  var tagRe = /<(\/?)([a-zA-Z0-9]+)((?:\s+[a-zA-Z0-9_-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  var m;
  while ((m = tagRe.exec(html))) {
    if (m[5] !== undefined) {
      var top = stack[stack.length - 1];
      top.textContent += m[5];
      continue;
    }
    var closing = m[1] === '/';
    var tag = m[2].toLowerCase();
    var attrStr = m[3] || '';
    var selfClose = m[4] === '/' || tag === 'input';
    if (closing) {
      for (var i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === tag) { stack.length = i; break; }
      }
      continue;
    }
    var el = createElement(tag);
    var attrRe = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
    var am;
    while ((am = attrRe.exec(attrStr))) {
      el.attrs[am[1]] = am[2] === undefined ? '' : am[2];
    }
    if (el.attrs.value !== undefined) el.value = el.attrs.value;
    if (el.attrs.checked !== undefined) el.checked = true;
    var parent = stack[stack.length - 1];
    el.parentNode = parent;
    parent.children.push(el);
    if (!selfClose) stack.push(el);
  }
  return root;
}

function matchesSimple(el, simple) {
  var m = /^([a-zA-Z0-9]*)((?:\[[^\]]+\])*)(:checked)?$/.exec(simple.trim());
  if (!m) return false;
  var tag = m[1], attrsPart = m[2], pseudo = m[3];
  if (tag && el.tagName !== tag) return false;
  if (attrsPart) {
    var attrRe = /\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g;
    var am;
    while ((am = attrRe.exec(attrsPart))) {
      var name = am[1], val = am[2];
      if (val === undefined) {
        if (el.getAttribute(name) === null) return false;
      } else if (el.getAttribute(name) !== val) {
        return false;
      }
    }
  }
  if (pseudo === ':checked' && !el.checked) return false;
  return true;
}

function collect(el, simple, results) {
  el.children.forEach(function (child) {
    if (matchesSimple(child, simple)) results.push(child);
    collect(child, simple, results);
  });
}

function querySelectorImpl(root, selector, single) {
  var parts = String(selector).split(',').map(function (s) { return s.trim(); });
  var results = [];
  parts.forEach(function (p) {
    var sub = [];
    collect(root, p, sub);
    results = results.concat(sub);
  });
  if (single) return results[0] || null;
  return results;
}

function createRoot() {
  var root = createElement('#root');
  root._html = '';
  Object.defineProperty(root, 'innerHTML', {
    get: function () { return root._html; },
    set: function (html) {
      root._html = html;
      var parsed = parseHtml(html);
      root.children = parsed.children;
    }
  });
  return root;
}

module.exports = { createRoot: createRoot, parseHtml: parseHtml };
