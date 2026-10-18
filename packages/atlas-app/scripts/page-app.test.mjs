import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { retirerPluginGrist, verifierPageApp, STUB_API_GRIST } from './page-app.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const PAGE_ATLAS = path.join(ICI, '..', '..', '..', 'projects', 'Atlas', 'index_v7.html');

const CHARGEUR = `<script>
        (function () {
            if (/(?:^|[?&])bi=(?:1|true)(?:&|$)/.test(location.search)) { window.__gristApi = null; return; }
            window.__gristApi = new Promise(function (fini) {
                var s = document.createElement('script');
                s.src = 'https://docs.getgrist.com/grist-plugin-api.js';
                s.onload = s.onerror = function () { fini(); };
                document.head.appendChild(s);
            });
        })();
    </script>`;

test('le chargeur de l\'API de Grist est remplace par « rien a attendre »', () => {
  const html = retirerPluginGrist('<head><title>a</title>' + CHARGEUR + '<script src="b.js"></script></head>');
  assert.ok(html.includes(STUB_API_GRIST));
  assert.ok(!html.includes('docs.getgrist.com'));
  assert.ok(html.includes('<script src="b.js"></script>'), 'les autres scripts restent');
  assert.doesNotThrow(() => verifierPageApp(html));
});

test('l\'ancienne forme, une balise avec une adresse, est retiree elle aussi', () => {
  const html = retirerPluginGrist('<head><script src="https://docs.getgrist.com/grist-plugin-api.js"></script></head>');
  assert.ok(!html.includes('docs.getgrist.com'));
  assert.ok(html.includes(STUB_API_GRIST));
});

test('une page qui charge encore l\'API de Grist est refusee, et le dit', () => {
  assert.throws(() => verifierPageApp('<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>'), /docs\.getgrist\.com/);
  assert.throws(() => verifierPageApp('<head></head>'), /__gristApi/, 'sans la marque, l\'application attendrait une API qui n\'est pas la');
});

test('la page d\'Atlas telle qu\'elle est aujourd\'hui sort du rassemblement sans API de Grist', () => {
  const sortie = retirerPluginGrist(fs.readFileSync(PAGE_ATLAS, 'utf8'));
  assert.doesNotThrow(() => verifierPageApp(sortie));
  assert.equal((sortie.match(/window\.__gristApi = null;/g) || []).length, 1);
});
