/**
 * La nuit dans le rendu (lot E2 du cadrage éclairage).
 *
 * Jusqu'au 24/09/2026, la nuit était un voile CSS (`#night-tint`, `rgba(16,
 * 24, 58, a)` en `mix-blend-mode: multiply`) posé au-dessus des deux canvas.
 * Un voile ne peut qu'assombrir : il aurait éteint toute lampe comme le reste.
 *
 * La même opération est maintenant faite **dans** le rendu, par une couche
 * MapLibre qui multiplie ce qui est déjà peint, posée juste **sous** le calque
 * three.js : le fond, les données et le ciel s'assombrissent exactement comme
 * avant ; les lampes, les lumières et leurs taches, dessinées ensuite par
 * three.js, restent lumineuses. Les modèles three.js ordinaires reçoivent le
 * même facteur sur leurs lumières (`Models3D.setSun`) : pour un matériau
 * diffus, multiplier la lumière revient à multiplier le pixel.
 *
 * Équivalence exacte avec le voile : pour un fond opaque `Cb`, le mode
 * `multiply` d'une couleur `Cs` d'opacité `a` donne
 * `(1 − a)·Cb + a·Cb·Cs = Cb · (1 − a + a·Cs)` — un facteur par canal, qu'un
 * mélange WebGL `DST_COLOR, ZERO` applique tel quel.
 */

export const VERSION = '0.1.0';

/** La teinte du voile, inchangée : un bleu nuit. */
export const TEINTE_NUIT = Object.freeze([16, 24, 58]);

/** Sous ce seuil d'opacité, le voile était retiré (`transparent`) : on ne peint rien. */
export const SEUIL_NUIT = 0.02;

/**
 * Opacité de la nuit selon la hauteur du soleil et la lune — la formule du
 * voile, reprise à l'identique (seuil large, 12°, pour que crépuscule et aube
 * se lisent aussi en récit ; atténuée par la lune levée).
 * @param {number} hauteurDeg hauteur du soleil (SunCalc, ambiance)
 * @param {{ isUp?: boolean, moonIntensity?: number }|null} lune
 */
export function opaciteNuit(hauteurDeg, lune) {
  const a = Math.max(0, Math.min(0.68, (12 - hauteurDeg) / 28));
  return a * (lune && lune.isUp ? (1 - lune.moonIntensity * 0.35) : 1);
}

/**
 * Le facteur par canal qui reproduit le voile d'opacité `a`.
 * Sous le seuil, exactement `[1, 1, 1]` : de jour, rien ne change.
 * @returns {[number, number, number]}
 */
export function facteursNuit(a, teinte = TEINTE_NUIT) {
  if (!(a > SEUIL_NUIT)) return [1, 1, 1];
  // Le voile arrondissait son opacité au millième (`toFixed(3)`) : même chose.
  const o = Math.round(a * 1000) / 1000;
  return teinte.map((c) => 1 - o + o * (c / 255));
}

/** Le facteur est-il neutre (jour) ? */
export function estNeutre(f) {
  return !f || (f[0] === 1 && f[1] === 1 && f[2] === 1);
}

const VS = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS = `
precision mediump float;
uniform vec3 uFacteur;
void main() { gl_FragColor = vec4(uFacteur, 1.0); }`;

/**
 * La couche MapLibre de la nuit : un quadrilatère plein écran qui multiplie le
 * tampon de couleur par `lireFacteurs()`. Rien n'est dessiné de jour.
 *
 * Aucune matrice : le quadrilatère est en coordonnées d'écran, il vaut pour le
 * globe, le mercator et le relief. Profondeur et pochoir sont coupés — la
 * nuit tombe sur tout ce qui est déjà peint. MapLibre remet son propre état
 * après une couche personnalisée ; on délie tout de même le VAO courant, pour
 * ne pas écrire nos attributs dans celui d'une couche de MapLibre.
 *
 * @param {string} id
 * @param {() => [number, number, number]} lireFacteurs
 */
export function creerCoucheNuit(id, lireFacteurs) {
  let prog = null;
  let buf = null;
  let locPos = -1;
  let locFact = null;
  return {
    id,
    type: 'custom',
    renderingMode: '2d',
    onAdd(_map, gl) {
      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      };
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      locPos = gl.getAttribLocation(prog, 'aPos');
      locFact = gl.getUniformLocation(prog, 'uFacteur');
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    },
    render(gl) {
      const f = lireFacteurs();
      if (!prog || estNeutre(f)) return;
      if (typeof gl.bindVertexArray === 'function') gl.bindVertexArray(null);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(locPos);
      gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3f(locFact, f[0], f[1], f[2]);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.CULL_FACE);
      gl.depthMask(false);
      gl.colorMask(true, true, true, false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.DST_COLOR, gl.ZERO);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.colorMask(true, true, true, true);
      gl.disableVertexAttribArray(locPos);
    },
    onRemove(_map, gl) {
      if (buf) gl.deleteBuffer(buf);
      if (prog) gl.deleteProgram(prog);
      prog = null;
      buf = null;
    },
  };
}

/**
 * Un matériau que les lumières n'éclairent pas (`MeshBasicMaterial`, ce que
 * `GLTFLoader` fait d'un glTF `KHR_materials_unlit` — la photogrammétrie, la
 * chapelle de la Vieille Charité) : multiplier les lumières ne l'assombrit
 * pas. Sous l'ancien voile CSS il s'assombrissait comme le reste ; sans
 * traitement, il restait en plein jour dans la nuit (mesuré le 24/09/2026 :
 * chapelle à 22 h 30, +8/255 en moyenne sur sa zone, couleurs de jour).
 * `Models3D.setSun` multiplie alors sa **couleur** par le facteur de nuit.
 */
export function estNonEclaire(materiau) {
  return !!materiau && (materiau.isMeshBasicMaterial === true || materiau.type === 'MeshBasicMaterial');
}

/**
 * La couleur d'un matériau non éclairé sous le facteur de nuit : la couleur
 * d'origine multipliée canal par canal. De jour (facteur neutre), la couleur
 * d'origine exactement.
 * @param {[number, number, number]} base couleur d'origine (linéaire)
 * @param {[number, number, number]} facteurLineaire
 */
export function couleurSousNuit(base, facteurLineaire) {
  if (estNeutre(facteurLineaire)) return [base[0], base[1], base[2]];
  return [base[0] * facteurLineaire[0], base[1] * facteurLineaire[1], base[2] * facteurLineaire[2]];
}

/**
 * La lumière de nuit du bâti MapLibre (`map.setLight`, couleur) et
 * l'ambiance nocturne des modèles three.js, sous le soleil à −6° (passe
 * « réalisme et performance », point P5, 24/09/2026).
 *
 * Jusque-là : `#141c3c` pour le bâti et `[16, 22, 52]` pour l'ambiance — un
 * bleu presque noir. Multiplié ensuite par la couche `atlas-nuit`, le bâti du
 * Jarret sortait à 38/40/45 sur 255 quand la chaussée non éclairée était à
 * 89/94/113 : des volumes plus sombres que la rue, sans faces lisibles. Une
 * ville la nuit n'est pas ainsi : le halo du ciel urbain (lumière renvoyée par
 * l'atmosphère, quelques dixièmes de lux) et la lune éclairent façades et toits
 * autant que le sol. Avec `[128, 128, 148]`, mesuré sur la même vue (22 h,
 * 15 janvier) : bâti ≈ 47/49/65 — toits et murs se distinguent, les taches des
 * lampes gardent leur contraste (sol inchangé). Le jour (soleil au-dessus de
 * 0°) n'est pas touché ; le crépuscule part de cette même valeur à −6°.
 */
export const LUMIERE_BATI_NUIT = Object.freeze([128, 128, 148]);
export const AMBIANCE_NUIT = Object.freeze([40, 44, 66]);
