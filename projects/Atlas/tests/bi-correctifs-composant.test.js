// Petits correctifs du composant BI relevés à la validation : sortie du survol, setHorsLigne('auto'). node --test tests/bi-correctifs-composant.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { carteSimulee, MANIFESTE, DONNEES } from './aide-carte-bi.js';

test('le pointeur quitte la carte : l\'hote recoit hover { featureId: null } et le curseur est rendu', async () => {
  const carte = carteSimulee();
  const conteneur = new EventTarget(); carte.getCanvasContainer = () => conteneur;
  const style = { cursor: '' }; carte.getCanvas = () => ({ style });
  const rt = attacher(carte);
  await rt.api.setScene(MANIFESTE, DONNEES);
  const recus = []; rt.on('hover', (c) => recus.push(c));
  // un point est survole : requestAnimationFrame immediat, un element sous le pointeur
  const vraiRaf = globalThis.requestAnimationFrame; globalThis.requestAnimationFrame = (f) => { f(); return 1; };
  try {
    const source = [...carte.sources.keys()].find((k) => k.includes('sites'));
    const calque = carte.calques.find((l) => l.source === source);
    assert.ok(source && calque, 'la scene a monte une source et un calque');
    carte.queryRenderedFeatures = () => [{ id: 1, layer: { id: calque.id }, source }];
    carte.emit('mousemove', { point: { x: 10, y: 10 } });
    assert.equal(recus.length, 1, 'un survol annonce');
    assert.equal(recus[0].featureId, 1);
    conteneur.dispatchEvent(new Event('mouseleave'));
    assert.equal(recus.length, 2, 'la sortie annonce un second survol');
    assert.equal(recus[1].featureId, null); assert.equal(recus[1].layer, null);
    assert.equal(style.cursor, '');
    conteneur.dispatchEvent(new Event('mouseleave'));
    assert.equal(recus.length, 2, 'une seconde sortie sans survol n\'emet rien');
  } finally { globalThis.requestAnimationFrame = vraiRaf; }
});

test('setHorsLigne(\'auto\') rend la main : un hors ligne force par l\'hote est leve', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  assert.deepEqual(await rt.api.setHorsLigne(true), { actif: true, auto: true });
  const evts = []; rt.on('connexion', (c) => evts.push(c));
  assert.deepEqual(await rt.api.setHorsLigne('auto'), { actif: false, auto: true }, 'le forcage de l\'hote ne reste pas vrai');
  assert.equal(evts.at(-1).etat, 'en_ligne');
});

test('setHorsLigne(\'auto\') garde le hors ligne quand le navigateur est reellement hors reseau', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  await rt.api.setHorsLigne(true);
  const avant = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  try { assert.deepEqual(await rt.api.setHorsLigne('auto'), { actif: true, auto: true }); }
  finally { if (avant) Object.defineProperty(globalThis, 'navigator', avant); else delete globalThis.navigator; }
});

test('setHorsLigne(\'auto\') sans forcage : l\'etat detecte n\'est pas touche', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  assert.deepEqual(await rt.api.setHorsLigne('auto'), { actif: false, auto: true });
});

test('manifest.attribution : la mention de l\'hote est posee sur les sources de points, sans HTML actif', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  await rt.api.setScene({ ...MANIFESTE, attribution: '© Les Sites <a href="https://exemple.test/licence">licence</a> <iframe srcdoc="<script>1</script>"></iframe>' }, DONNEES);
  const source = [...carte.sources.entries()].find(([k]) => k.includes('sites'))[1];
  assert.match(source.attribution, /© Les Sites/);
  assert.match(source.attribution, /<a href="https:\/\/exemple\.test\/licence"/);
  assert.doesNotMatch(source.attribution, /<iframe|srcdoc|<script/i, 'rien d\'actif ne passe a MapLibre');
});

test('manifest.attribution : absente, vide ou non textuelle, aucune attribution n\'est posee ; une scene suivante l\'oublie', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  for (const a of [undefined, '', '   ', 42, { x: 1 }]) {
    await rt.api.setScene({ ...MANIFESTE, ...(a === undefined ? {} : { attribution: a }) }, DONNEES);
    const source = [...carte.sources.entries()].find(([k]) => k.includes('sites'))[1];
    assert.equal(source.attribution, undefined, 'valeur ' + JSON.stringify(a));
  }
  await rt.api.setScene({ ...MANIFESTE, attribution: '© Une fois' }, DONNEES);
  await rt.api.setScene(MANIFESTE, DONNEES);
  assert.equal([...carte.sources.entries()].find(([k]) => k.includes('sites'))[1].attribution, undefined);
});
