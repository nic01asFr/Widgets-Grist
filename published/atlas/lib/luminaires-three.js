/**
 * Luminaires dans la scène three.js d'Atlas — lot E3 (premier affichage) et
 * amorce de E4/E5 du cadrage éclairage (`docs/CADRAGE-ECLAIRAGE-OBJETS-LUMINEUX.md`).
 *
 * Ce module ne sait rien de MapLibre ni de Grist : `app_v7.js` lui passe des
 * luminaires déjà placés (repère local de `Models3D`, mètres, Y en haut) et,
 * à chaque changement d'heure, leur état (`etatPointLumineux`). Il en fait :
 *
 * 1. **les modèles** — un `InstancedMesh` par pièce de modèle, comme les autres
 *    objets d'Atlas ; la vitre (`eclairage_vitre`) devient une lampe **émissive
 *    par instance**, allumée, abaissée ou éteinte ;
 * 2. **les vraies lumières** — un réservoir fixe de `SpotLight` (16 au plus),
 *    attribué aux sources allumées **les plus proches de la caméra** ; les 4
 *    premières portent ombre. Les `SpotLight` que `GLTFLoader` crée depuis les
 *    nœuds `emetteur_<k>` (`KHR_lights_punctual`) ne restent pas dans la
 *    scène : on en lit la position, l'axe (−Z du nœud) et les cônes, puis le
 *    réservoir les incarne. Cent lumières three.js, une par mât, recompileraient
 *    chaque matériau à cent lumières par pixel ;
 * 3. **la lumière au sol** — le fond MapLibre ne reçoit pas la lumière de
 *    three.js. Une **nappe calculée** la peint : un quadrilatère instancié
 *    par source, borné à sa tache, qui évalue E = I·spot·cos θ / d² (même cône,
 *    même atténuation que three.js) pour **sa seule** source, et l'ombre de
 *    cette source quand elle en porte une (shadow map du `SpotLight` qui
 *    l'incarne, lue dans le shader). Jusqu'au 24/09/2026 (passe « réalisme et
 *    performance »), les 16 vraies lumières passaient par un **récepteur**
 *    plan où chaque pixel évaluait les 16 spots et leurs 4 ombres : 3,7 ms de
 *    GPU sur ≈ 5,5 ms à l'échelle de la rue (Intel UHD, 1 440 × 900 à 1,5),
 *    contre ≈ 0,5 ms pour la nappe. Les vraies lumières n'éclairent plus que
 *    les modèles three.js.
 *    La nappe des sources à vraie lumière ne se peint pas sur un modèle (pochoir,
 *    `POCHOIR_MODELE`) : un sol de maquette GLB reçoit déjà ces spots, la tache
 *    s'y ajoutait (+49/255, point P2).
 * 4. **un halo** par source allumée, pour lire la lampe de loin.
 *
 * Relief : chaque tache est posée sur le sol **au pied de sa source** (`sol`
 * de l'item, altitude sondée), inclinée selon la pente locale (`pente`).
 */
import * as THREE from 'three';
import {
  kelvinVersRvb, fluxDuPoint, intensiteAffichee, repartirSources, BUDGET_DEFAUT,
} from './eclairage-rendu.js?v=1.12.2';

export const VERSION = '0.1.0';

/** Portée d'une source (m) : au-delà, ni lumière three.js ni nappe. */
export const PORTEE_M = 60;
/** Nombre maximal de sources dans la nappe calculée. */
const MAX_NAPPE = 4096;
/** Nombre maximal de halos (une source allumée = un halo). */
const MAX_HALOS = 4096;
/** Albédo du sol pour la tache : un enrobé clair, réglage d'œil. */
const ALBEDO_SOL = 0.35;
/** Albédo des façades recopiées : enduit clair, réglage d'œil. */
const ALBEDO_FACADE = 0.45;
/** Diamètre apparent du halo d'une lampe, en mètres. */
const HALO_M = 1.8;
/** Nombre maximal de sources ombrées lues par la nappe (samplers du shader). */
export const MAX_OMBRES_NAPPE = 4;
/**
 * Valeur de pochoir que les modèles three.js écrivent (`Models3D.fixGltfMaterial`)
 * et que la nappe des vraies lumières évite. Le calque efface le pochoir juste
 * avant son rendu : les valeurs laissées par MapLibre (identifiants de tuiles)
 * ne comptent pas.
 */
export const POCHOIR_MODELE = 1;

/* ------------------------------------------------------------------ *
 * Matériaux
 * ------------------------------------------------------------------ */

/**
 * La vitre : un matériau éclairé comme les autres (de jour, elle est du verre),
 * dont l'émission est **multipliée par la couleur d'instance** — noire éteinte,
 * teinte de la température de couleur allumée. `InstancedMesh.instanceColor`
 * teindrait sinon la couleur diffuse ; on la détourne vers l'émission.
 */
function materiauVitre(base) {
  const m = base.clone();
  m.emissive = new THREE.Color(1, 1, 1);
  m.emissiveIntensity = 1;
  if (m.emissiveMap) m.emissiveMap = null;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n\ttotalEmissiveRadiance *= vColor.rgb;\n#endif');
  };
  m.customProgramCacheKey = () => 'atlas-vitre-emissive';
  m.needsUpdate = true;
  return m;
}

/**
 * La nappe calculée : pour chaque source, l'éclairement d'un sol plan
 * (incliné selon la pente au pied de la source), avec le cône (smoothstep
 * entre cônes extérieur et intérieur) et l'atténuation de portée de three.js.
 *
 * **Un quadrilatère instancié par source**, borné à sa tache (hauteur × tan
 * du cône, plafonnée à la portée) : chaque pixel ne calcule que la source qui
 * le couvre. La première version bouclait sur toutes les sources dans un plan
 * couvrant l'emprise — mesuré le 24/09/2026, 79 sources ramenaient la carte
 * de 60 à 32 images par seconde (Intel UHD, 1 280 × 800 à 1,5).
 *
 * `avecOmbres` : la variante des sources à vraie lumière, qui lit l'ombre de
 * la source (index 0 à 3 dans `iS.w`, −1 sans ombre) dans la shadow map de
 * son `SpotLight` — filtrage PCF doux, celui de three.js (`PCFSoftShadowMap`).
 */
function materiauNappe(avecOmbres) {
  const uniforms = {
    uAlbedo: { value: ALBEDO_SOL },
    uPortee: { value: PORTEE_M },
    // Relief : la tache est avancée vers la caméra de `uAvance` mètres dans le
    // tampon de profondeur seulement (même pixel, profondeur moindre), pour
    // passer devant les bosses du MNT qu'un plan incliné ne suit pas.
    uAvance: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    // Projection complète (les matrices de three.js ne sont pas visibles du
    // fragment shader) : posée par `onBeforeRender`.
    uMVP: { value: new THREE.Matrix4() },
  };
  if (avecOmbres) {
    uniforms.uMatOmbre = { value: Array.from({ length: MAX_OMBRES_NAPPE }, () => new THREE.Matrix4()) };
    for (let k = 0; k < MAX_OMBRES_NAPPE; k++) uniforms[`uCarte${k}`] = { value: null };
    uniforms.uOmbreOk = { value: new THREE.Vector4(0, 0, 0, 0) };
    uniforms.uBiais = { value: -0.0006 };
    uniforms.uBiaisNormal = { value: 0.03 };
    uniforms.uTailleCarte = { value: new THREE.Vector2(1024, 1024) };
  }
  const ombres = avecOmbres ? `
      #include <packing>
      uniform mat4 uMatOmbre[${MAX_OMBRES_NAPPE}];
      uniform sampler2D uCarte0;
      uniform sampler2D uCarte1;
      uniform sampler2D uCarte2;
      uniform sampler2D uCarte3;
      uniform vec4 uOmbreOk;
      uniform float uBiais;
      uniform float uBiaisNormal;
      uniform vec2 uTailleCarte;
      float cmp(sampler2D m, vec2 uv, float z) { return step(z, unpackRGBAToDepth(texture2D(m, uv))); }
      // Le PCF doux de three.js r160 (SHADOWMAP_TYPE_PCF_SOFT), à l'identique.
      float pcf(sampler2D m, vec4 c) {
        c.xyz /= c.w;
        c.z += uBiais;
        if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
        vec2 t = vec2(1.0) / uTailleCarte;
        float dx = t.x; float dy = t.y;
        vec2 uv = c.xy;
        vec2 f = fract(uv * uTailleCarte + 0.5);
        uv -= f * t;
        return (
          cmp(m, uv, c.z) + cmp(m, uv + vec2(dx, 0.0), c.z) + cmp(m, uv + vec2(0.0, dy), c.z) + cmp(m, uv + t, c.z) +
          mix(cmp(m, uv + vec2(-dx, 0.0), c.z), cmp(m, uv + vec2(2.0 * dx, 0.0), c.z), f.x) +
          mix(cmp(m, uv + vec2(-dx, dy), c.z), cmp(m, uv + vec2(2.0 * dx, dy), c.z), f.x) +
          mix(cmp(m, uv + vec2(0.0, -dy), c.z), cmp(m, uv + vec2(0.0, 2.0 * dy), c.z), f.y) +
          mix(cmp(m, uv + vec2(dx, -dy), c.z), cmp(m, uv + vec2(dx, 2.0 * dy), c.z), f.y) +
          mix(mix(cmp(m, uv + vec2(-dx, -dy), c.z), cmp(m, uv + vec2(2.0 * dx, -dy), c.z), f.x),
              mix(cmp(m, uv + vec2(-dx, 2.0 * dy), c.z), cmp(m, uv + vec2(2.0 * dx, 2.0 * dy), c.z), f.x), f.y)
        ) * (1.0 / 9.0);
      }
      float ombre(float k, vec3 pos, vec3 n) {
        if (k < -0.5) return 1.0;
        vec4 wp = vec4(pos + n * uBiaisNormal, 1.0);
        if (k < 0.5) return uOmbreOk.x > 0.5 ? pcf(uCarte0, uMatOmbre[0] * wp) : 1.0;
        if (k < 1.5) return uOmbreOk.y > 0.5 ? pcf(uCarte1, uMatOmbre[1] * wp) : 1.0;
        if (k < 2.5) return uOmbreOk.z > 0.5 ? pcf(uCarte2, uMatOmbre[2] * wp) : 1.0;
        return uOmbreOk.w > 0.5 ? pcf(uCarte3, uMatOmbre[3] * wp) : 1.0;
      }` : `
      float ombre(float k, vec3 pos, vec3 n) { return 1.0; }`;
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute vec4 iA;   // position de la source, intensité
      attribute vec4 iB;   // axe, cos du cône extérieur
      attribute vec4 iC;   // couleur linéaire, cos du cône intérieur
      attribute vec4 iS;   // sol au pied, pente x, pente z, index d'ombre (-1 : aucune)
      attribute float iR;  // rayon de la tache au sol
      varying vec3 vPos;
      varying vec4 vA;
      varying vec4 vB;
      varying vec4 vC;
      varying vec4 vS;
      void main() {
        float x = iA.x + position.x * iR;
        float z = iA.z + position.z * iR;
        // Sol au pied de la source, incliné selon la pente locale ; 4,5 cm
        // au-dessus pour ne pas se battre avec lui en profondeur.
        vec3 p = vec3(x, iS.x + iS.y * (x - iA.x) + iS.z * (z - iA.z) + 0.045, z);
        vPos = p;
        vA = iA; vB = iB; vC = iC; vS = iS;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      precision highp float;
      uniform float uAlbedo;
      uniform float uPortee;
      uniform float uAvance;
      uniform vec3 uCam;
      uniform mat4 uMVP;
      varying vec3 vPos;
      varying vec4 vA;
      varying vec4 vB;
      varying vec4 vC;
      varying vec4 vS;
      ${ombres}
      void main() {
        vec3 L = vA.xyz - vPos;
        float d = length(L);
        if (d > uPortee || d < 1e-3) discard;
        vec3 l = L / d;
        vec3 n = normalize(vec3(-vS.y, 1.0, -vS.z));
        float cosInc = max(dot(l, n), 0.0);
        float spot = smoothstep(vB.w, vC.w, dot(-l, vB.xyz));
        if (spot <= 0.0 || cosInc <= 0.0) discard;
        float r = d / uPortee;
        float fen = pow(clamp(1.0 - r * r * r * r, 0.0, 1.0), 2.0);
        float o = ombre(vS.w, vPos, n);
        vec3 e = vC.rgb * vA.w * spot * cosInc * fen * o / max(d * d, 0.01);
        gl_FragColor = vec4(e * uAlbedo / 3.141592653589793, 1.0);
        #include <colorspace_fragment>
        // Profondeur : celle du point avancé le long du rayon de vue (le pixel
        // ne bouge pas). Hors relief, uAvance = 0 : profondeur d'origine.
        float z = gl_FragCoord.z;
        if (uAvance > 0.0) {
          vec3 v = uCam - vPos;
          float dv = length(v);
          vec3 q = vPos + v / max(dv, 1e-3) * min(uAvance, dv * 0.5);
          vec4 cp = uMVP * vec4(vPos, 1.0);
          vec4 cq = uMVP * vec4(q, 1.0);
          z = clamp(z + 0.5 * (cq.z / cq.w - cp.z / cp.w), 0.0, 1.0);
        }
        gl_FragDepth = z;
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/**
 * Les façades recopiées (lib/facades-eclairees.js) : lambertiennes, mais
 * **aveugles** au soleil, au ciel et à l'ambiance — seuls les spots (et leurs
 * ombres) les éclairent. En fusion additive, elles ne peuvent rien voiler :
 * sans spot, elles ajoutent zéro au mur MapLibre qu'elles doublent.
 * La normale n'est jamais retournée (`faceDirection = 1`) : le repère de la
 * scène (échelle Y négative) inverse le sens des faces, la normale du fichier
 * dit seule où est la rue.
 */
function materiauFacade() {
  const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(ALBEDO_FACADE, ALBEDO_FACADE, ALBEDO_FACADE) });
  m.transparent = true;
  m.blending = THREE.AdditiveBlending;
  m.depthWrite = false;
  m.side = THREE.DoubleSide;
  m.onBeforeCompile = (sh) => {
    const debut = THREE.ShaderChunk.lights_fragment_begin
      .replace('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0')
      .replace('getAmbientLightIrradiance( ambientLightColor )', 'vec3( 0.0 )')
      .replace('#if ( NUM_HEMI_LIGHTS > 0 )', '#if 0');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_fragment_begin>', debut)
      .replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
  };
  m.customProgramCacheKey = () => 'atlas-facade-spots';
  return m;
}

/**
 * Une nappe : géométrie instanciée (un quadrilatère par source), maillage.
 * `pochoir` : ne pas se peindre là où un modèle three.js a écrit
 * `POCHOIR_MODELE` (sol de maquette déjà éclairé par les vrais spots).
 */
function creerNappe(avecOmbres, pochoir) {
  const quad = new THREE.PlaneGeometry(2, 2);
  quad.rotateX(-Math.PI / 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const attrs = {};
  for (const [nom, taille] of [['iA', 4], ['iB', 4], ['iC', 4], ['iS', 4], ['iR', 1]]) {
    attrs[nom] = new THREE.InstancedBufferAttribute(new Float32Array(MAX_NAPPE * taille), taille);
    attrs[nom].setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(nom, attrs[nom]);
  }
  geo.instanceCount = 0;
  const mat = materiauNappe(avecOmbres);
  if (pochoir) {
    mat.stencilWrite = true;   // active le test de pochoir (three.js)
    mat.stencilWriteMask = 0;  // sans rien écrire
    mat.stencilRef = POCHOIR_MODELE;
    mat.stencilFuncMask = 0xff;
    mat.stencilFunc = THREE.NotEqualStencilFunc;
    mat.stencilFail = THREE.KeepStencilOp;
    mat.stencilZFail = THREE.KeepStencilOp;
    mat.stencilZPass = THREE.KeepStencilOp;
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.onBeforeRender = (_r, _s, camera) => {
    mat.uniforms.uMVP.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld);
    mesh.userData.avantRendu?.();
  };
  mesh.visible = false;
  return { mesh, geo, attrs };
}

/**
 * Réglages de pochoir d'un matériau de modèle : il écrit `POCHOIR_MODELE`
 * partout où il se dessine (test de profondeur passé). À appliquer aux
 * matériaux des modèles glTF (`Models3D.fixGltfMaterial`).
 */
export function marquerPochoirModele(m) {
  if (!m) return m;
  m.stencilWrite = true;
  m.stencilWriteMask = 0xff;
  m.stencilRef = POCHOIR_MODELE;
  m.stencilFunc = THREE.AlwaysStencilFunc;
  m.stencilFail = THREE.KeepStencilOp;
  m.stencilZFail = THREE.KeepStencilOp;
  m.stencilZPass = THREE.ReplaceStencilOp;
  return m;
}

/** Le halo d'une lampe : un point additif, de taille constante en mètres. */
function materiauHalo() {
  return new THREE.ShaderMaterial({
    uniforms: { uTaille: { value: 100 } },
    vertexShader: `
      attribute vec3 couleur;
      uniform float uTaille;
      varying vec3 vCouleur;
      void main() {
        vCouleur = couleur;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(uTaille / max(gl_Position.w, 1e-6), 2.0, 96.0);
      }`,
    fragmentShader: `
      varying vec3 vCouleur;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        float a = exp(-r * r * 5.0);
        gl_FragColor = vec4(vCouleur * a, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/* ------------------------------------------------------------------ *
 * Prototypes de modèles
 * ------------------------------------------------------------------ */

/**
 * Luminaire de test, construit ici quand le catalogue ne donne rien : fût,
 * crosse, lanterne, vitre, un émetteur vers le bas. Hauteur de feu 6 m.
 */
function protoTest() {
  const gris = new THREE.MeshStandardMaterial({ color: 0x74777a, roughness: 0.5, metalness: 0.5 });
  const vitre = materiauVitre(new THREE.MeshStandardMaterial({ color: 0xf2e6c7, roughness: 0.2 }));
  const m = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  return {
    parts: [
      { geometry: new THREE.CylinderGeometry(0.05, 0.08, 6.2, 10), material: gris, mat: m(0, 3.1, 0), vitre: false },
      { geometry: new THREE.BoxGeometry(0.06, 0.06, 0.95), material: gris, mat: m(0, 6.15, 0.45), vitre: false },
      { geometry: new THREE.BoxGeometry(0.28, 0.14, 0.6), material: gris, mat: m(0, 6.1, 0.95), vitre: false },
      { geometry: new THREE.BoxGeometry(0.22, 0.02, 0.5), material: vitre, mat: m(0, 6.02, 0.95), vitre: true },
    ],
    emetteurs: [{
      pos: new THREE.Vector3(0, 6.0, 0.95), dir: new THREE.Vector3(0, -1, 0),
      angle: THREE.MathUtils.degToRad(70), penumbra: 0.35,
    }],
    test: true,
  };
}

/**
 * Un prototype depuis une scène glTF : les pièces (géométrie, matériau,
 * matrice dans le modèle) et les émetteurs. Les `SpotLight` créées par
 * `GLTFLoader` sont **lues**, jamais rendues : la scène glTF (partagée avec le
 * cache de `Models3D`) n'entre pas dans la scène d'Atlas, seules ses
 * géométries sont instanciées. Leur `intensity` n'est pas lue (décision 7) ;
 * leur rôle passe au réservoir.
 */
function protoDepuisGltf(scene, fixMateriau, nomVitre) {
  scene.updateMatrixWorld(true);
  const emetteurs = [];
  scene.traverse((o) => {
    if (!o.isSpotLight) return;
    const pos = new THREE.Vector3();
    o.getWorldPosition(pos);
    const cible = new THREE.Vector3();
    o.target.getWorldPosition(cible);
    const dir = cible.sub(pos).normalize();
    emetteurs.push({ nom: o.name, pos, dir, angle: o.angle, penumbra: o.penumbra });
  });
  const parts = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((mat, i) => {
      const estVitre = mat?.name === nomVitre || /vitre/i.test(mat?.name || '');
      const geometry = mats.length > 1 ? sousGeometrie(o.geometry, i) : o.geometry;
      if (!geometry) return;
      parts.push({
        geometry,
        material: estVitre ? materiauVitre(fixMateriau(mat)) : fixMateriau(mat),
        mat: o.matrixWorld.clone(),
        vitre: estVitre,
      });
    });
  });
  return { parts, emetteurs, test: false };
}

/** La part d'une géométrie à groupes qui porte le matériau `i`. */
function sousGeometrie(geo, i) {
  const g = geo.groups?.find((x) => x.materialIndex === i);
  if (!g || !geo.index) return geo;
  const out = geo.clone();
  out.setIndex(Array.from(geo.index.array.slice(g.start, g.start + g.count)));
  out.clearGroups();
  return out;
}

/* ------------------------------------------------------------------ *
 * Le gestionnaire
 * ------------------------------------------------------------------ */

/**
 * @param {{
 *   scene: THREE.Scene,
 *   camera: () => THREE.Camera,
 *   chargerGltf: (url: string) => Promise<THREE.Object3D|null>,
 *   fixMateriau: (m: THREE.Material) => THREE.Material,
 * }} o
 */
export function creerLuminaires3D(o) {
  const racine = new THREE.Group();
  racine.name = 'atlas-luminaires';
  o.scene.add(racine);

  const protos = new Map();   // url | '' → Promise<proto>
  let instances = [];         // InstancedMesh[]
  let vitres = [];            // { im, slotParItem: Map<itemId, slot> }
  let items = [];             // { id, props, place, protoKey, lighting }
  let sources = [];           // voir `construire`
  const parId = new Map();
  let jeton = 0;

  const budget = { ...BUDGET_DEFAUT };
  const reservoir = [];
  let dernierCam = null;
  let aReattribuer = true;
  let repartition = { ombrees: [], eclairantes: [], emissives: [] };

  // Deux nappes : celle des sources à vraie lumière (ombres lues, pochoir des
  // modèles) et celle des sources sans lumière réelle (ni l'un ni l'autre).
  const nappeReelle = creerNappe(true, true);
  const nappeCalculee = creerNappe(false, false);
  racine.add(nappeReelle.mesh, nappeCalculee.mesh);
  let versionOmbres = 0;
  let nbAllumees = 0;
  let cleOmbres = '';
  // Les uniformes d'ombre se lisent au moment du rendu : three.js crée la
  // shadow map d'un spot, et calcule sa matrice, dans la passe d'ombres qui
  // précède le dessin de la nappe dans le même `render`.
  nappeReelle.mesh.userData.avantRendu = () => {
    const u = nappeReelle.mesh.material.uniforms;
    const ok = [0, 0, 0, 0];
    for (let k = 0; k < MAX_OMBRES_NAPPE; k++) {
      const l = reservoir[k];
      const carte = l && l.visible && l.castShadow ? l.shadow.map?.texture : null;
      u[`uCarte${k}`].value = carte || null;
      if (carte) { u.uMatOmbre.value[k].copy(l.shadow.matrix); ok[k] = 1; }
    }
    u.uOmbreOk.value.set(ok[0], ok[1], ok[2], ok[3]);
  };

  const posHalos = new Float32Array(MAX_HALOS * 3);
  const coulHalos = new Float32Array(MAX_HALOS * 3);
  const geoHalos = new THREE.BufferGeometry();
  geoHalos.setAttribute('position', new THREE.BufferAttribute(posHalos, 3));
  geoHalos.setAttribute('couleur', new THREE.BufferAttribute(coulHalos, 3));
  geoHalos.setDrawRange(0, 0);
  const halos = new THREE.Points(geoHalos, materiauHalo());
  halos.frustumCulled = false;
  halos.renderOrder = 7;
  racine.add(halos);

  function proto(url, lighting) {
    const cle = url || '';
    if (!protos.has(cle)) {
      protos.set(cle, (async () => {
        if (!url) return protoTest();
        const sc = await o.chargerGltf(url);
        if (!sc) return protoTest();
        const p = protoDepuisGltf(sc, o.fixMateriau, lighting?.vitre || 'eclairage_vitre');
        return p.parts.length ? p : protoTest();
      })());
    }
    return protos.get(cle);
  }

  function vider() {
    for (const im of instances) { racine.remove(im); im.dispose?.(); }
    instances = [];
    vitres = [];
    items = [];
    sources = [];
    parId.clear();
    nappeReelle.mesh.visible = false;
    nappeCalculee.mesh.visible = false;
    geoHalos.setDrawRange(0, 0);
    facades.visible = false;
    aReattribuer = true;
  }

  /**
   * (Re)construit les luminaires.
   * @param {{ id: string, props: object, x: number, y: number, z: number,
   *   rotationRad: number, url: string|null, lighting: object|null }[]} liste
   */
  async function construire(liste) {
    const monJeton = ++jeton;
    const cles = [...new Set(liste.map((it) => it.url || ''))];
    const parCle = new Map();
    await Promise.all(cles.map(async (c) => {
      const it = liste.find((x) => (x.url || '') === c);
      parCle.set(c, await proto(c || null, it?.lighting));
    }));
    if (monJeton !== jeton) return;
    vider();

    const m4 = new THREE.Matrix4();
    const rot = new THREE.Matrix4();
    for (const c of cles) {
      const p = parCle.get(c);
      const lot = liste.filter((x) => (x.url || '') === c);
      if (!p || !lot.length) continue;
      const places = lot.map((it) => {
        rot.makeRotationY(it.rotationRad || 0);
        return new THREE.Matrix4().makeTranslation(it.x, it.y, it.z).multiply(rot);
      });
      for (const part of p.parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, lot.length);
        im.frustumCulled = false;
        im.castShadow = !part.vitre;
        im.receiveShadow = true;
        const slots = new Map();
        lot.forEach((it, slot) => {
          m4.multiplyMatrices(places[slot], part.mat);
          im.setMatrixAt(slot, m4);
          if (part.vitre) { im.setColorAt(slot, new THREE.Color(0, 0, 0)); slots.set(it.id, slot); }
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        racine.add(im);
        instances.push(im);
        if (part.vitre) vitres.push({ im, slots });
      }
      lot.forEach((it, slot) => {
        const place = places[slot];
        const item = { ...it, place, test: p.test };
        items.push(item);
        parId.set(it.id, item);
        p.emetteurs.forEach((e, k) => {
          const pos = e.pos.clone().applyMatrix4(place);
          const dir = e.dir.clone().transformDirection(place);
          sources.push({
            id: `${it.id}#${k}`, item, x: pos.x, y: pos.y, z: pos.z, pos, dir,
            // Sol au pied de la source (altitude sondée, relief) et pente locale.
            sol: Number.isFinite(it.sol) ? it.sol : 0,
            penteX: Number.isFinite(it.pente?.x) ? it.pente.x : 0,
            penteZ: Number.isFinite(it.pente?.z) ? it.pente.z : 0,
            angle: e.angle, penumbra: e.penumbra,
            allume: false, intensite: 0, couleur: new THREE.Color(1, 1, 1), rvb: [1, 1, 1],
          });
        });
      });
    }
    versionOmbres++;
    aReattribuer = true;
  }

  /**
   * L'état de chaque luminaire (clé = `id` de l'item) : couleur, intensité,
   * lampe. Rien ne se recompile ici ; la répartition suit au prochain rendu.
   * @param {Map<string, {allume: boolean, facteurFlux: number, facteurPuissance: number, temperatureCouleur: number|null}>} etats
   */
  function appliquerEtats(etats) {
    for (const s of sources) {
      const e = etats.get(s.item.id);
      const f = fluxDuPoint(s.item.props);
      s.allume = !!e?.allume;
      s.intensite = s.allume ? intensiteAffichee(f, s.angle, e) : 0;
      if (s.intensite <= 0) s.allume = false;
      const tc = e?.temperatureCouleur ?? s.item.props?.temperatureCouleur ?? 3000;
      s.rvb = kelvinVersRvb(tc);
      s.couleur.setRGB(s.rvb[0], s.rvb[1], s.rvb[2], THREE.SRGBColorSpace);
      s.facteur = s.allume ? (e.facteurFlux ?? 1) * (e.facteurPuissance ?? 1) : 0;
    }
    const c = new THREE.Color();
    const allumeeParItem = new Map();
    for (const s of sources) if (s.allume && !allumeeParItem.has(s.item.id)) allumeeParItem.set(s.item.id, s);
    for (const { im, slots } of vitres) {
      for (const [id, slot] of slots) {
        const s = allumeeParItem.get(id);
        if (s) {
          const g = 0.45 + 0.55 * s.facteur;
          c.setRGB(s.rvb[0] * g, s.rvb[1] * g, s.rvb[2] * g, THREE.SRGBColorSpace);
        } else c.setRGB(0, 0, 0);
        im.setColorAt(slot, c);
      }
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    // Halos : une lampe allumée, un halo, un peu sous la vitre.
    let n = 0;
    for (const s of sources) {
      if (!s.allume || n >= MAX_HALOS) continue;
      posHalos[n * 3] = s.x + s.dir.x * 0.12;
      posHalos[n * 3 + 1] = s.y + s.dir.y * 0.12;
      posHalos[n * 3 + 2] = s.z + s.dir.z * 0.12;
      const g = 0.35 + 0.65 * s.facteur;
      coulHalos[n * 3] = s.rvb[0] * g;
      coulHalos[n * 3 + 1] = s.rvb[1] * g;
      coulHalos[n * 3 + 2] = s.rvb[2] * g;
      n++;
    }
    geoHalos.attributes.position.needsUpdate = true;
    geoHalos.attributes.couleur.needsUpdate = true;
    geoHalos.setDrawRange(0, n);
    nbAllumees = n;
    aReattribuer = true;
  }

  function lampeDuReservoir(i) {
    while (reservoir.length <= i) {
      const l = new THREE.SpotLight(0xffffff, 0, PORTEE_M, Math.PI / 3, 0.35, 2);
      l.visible = false;
      l.shadow.mapSize.set(1024, 1024);
      l.shadow.camera.near = 0.3;
      l.shadow.camera.far = PORTEE_M;
      l.shadow.bias = -0.0006;
      l.shadow.normalBias = 0.03;
      racine.add(l, l.target);
      reservoir.push(l);
    }
    return reservoir[i];
  }

  /**
   * Remplit une nappe avec les sources `ids` qui éclairent le sol. `ombre(i)`
   * rend l'index de shadow map de la i-ème (−1 : aucune).
   */
  function remplirNappe(nappe, ids, byId, ombre) {
    const a = nappe.attrs;
    let n = 0;
    for (let i = 0; i < ids.length; i++) {
      if (n >= MAX_NAPPE) break;
      const s = byId.get(ids[i]);
      const h = s.y - s.sol;
      if (!(h > 0.05) || s.dir.y > -0.05) continue;
      // La tache s'étend jusqu'où le cône extérieur coupe le sol (axe incliné
      // compris : on prend l'angle au nadir de l'axe plus le demi-angle).
      const nadir = Math.acos(Math.min(1, -s.dir.y));
      const bord = Math.min(nadir + s.angle, Math.PI / 2 - 0.02);
      const rayon = Math.min(PORTEE_M, h * Math.tan(bord) + 1);
      a.iA.array.set([s.x, s.y, s.z, s.intensite], n * 4);
      a.iB.array.set([s.dir.x, s.dir.y, s.dir.z, Math.cos(s.angle)], n * 4);
      a.iC.array.set([s.couleur.r, s.couleur.g, s.couleur.b, Math.cos(s.angle * (1 - s.penumbra))], n * 4);
      a.iS.array.set([s.sol, s.penteX, s.penteZ, ombre(i)], n * 4);
      a.iR.array[n] = rayon;
      n++;
    }
    for (const x of Object.values(a)) x.needsUpdate = true;
    nappe.geo.instanceCount = n;
    nappe.mesh.visible = n > 0;
  }

  /** Répartit le budget : vraies lumières, ombres, nappes. */
  function reattribuer(cam) {
    repartition = repartirSources(sources, cam, budget, repartition);
    const { ombrees, eclairantes, emissives } = repartition;
    const nL = eclairantes.length;
    const byId = new Map(sources.map((s) => [s.id, s]));
    for (let i = 0; i < Math.max(nL, reservoir.length); i++) {
      const l = lampeDuReservoir(i);
      if (i >= nL) { l.visible = false; l.castShadow = false; l.intensity = 0; continue; }
      const s = byId.get(eclairantes[i]);
      l.visible = true;
      l.position.copy(s.pos);
      l.target.position.copy(s.pos).add(s.dir);
      l.target.updateMatrixWorld();
      l.angle = s.angle;
      l.penumbra = s.penumbra;
      l.color.copy(s.couleur);
      l.intensity = s.intensite;
      l.castShadow = i < ombrees.length;
    }
    // Les shadow maps ne se refont que si les sources ombrées changent
    // (`versionOmbres`, lue par le calque pour `shadowMap.needsUpdate`).
    const cle = ombrees.join('|');
    if (cle !== cleOmbres) { cleOmbres = cle; versionOmbres++; }
    // Nappes : vraies lumières (ombres en tête, index = lampe du réservoir),
    // puis les autres sources allumées.
    remplirNappe(nappeReelle, eclairantes, byId, (i) => (i < ombrees.length && i < MAX_OMBRES_NAPPE ? i : -1));
    remplirNappe(nappeCalculee, emissives, byId, () => -1);
  }

  /**
   * Avant chaque rendu : répartition si la caméra a bougé de plus de 2 m ou
   * si les états ont changé ; taille des halos.
   * @param {{x:number,y:number,z:number}} cam caméra en repère local
   * @param {number} kTaille pixels·w pour un mètre (voir `app_v7.js`)
   */
  function avantRendu(cam, kTaille) {
    if (!sources.length) return;
    const bouge = !dernierCam || Math.hypot(cam.x - dernierCam.x, cam.y - dernierCam.y, cam.z - dernierCam.z) > 2;
    if (aReattribuer || bouge) {
      reattribuer(cam);
      dernierCam = { ...cam };
      aReattribuer = false;
    }
    if (Number.isFinite(kTaille)) halos.material.uniforms.uTaille.value = kTaille * HALO_M;
    for (const n of [nappeReelle, nappeCalculee]) {
      n.mesh.material.uniforms.uCam.value.set(cam.x, cam.y, cam.z);
      n.mesh.material.uniforms.uAvance.value = avanceRelief;
    }
  }

  let avanceRelief = 0;
  /** Relief : avance des taches vers la caméra en profondeur (m), 0 à plat. */
  function definirAvanceRelief(m) { avanceRelief = Math.max(0, Number(m) || 0); }

  // Façades recopiées (bornées, lib/facades-eclairees.js) : un maillage,
  // remplacé à chaque nouvelle sélection de bâtiments.
  const facades = new THREE.Mesh(new THREE.BufferGeometry(), materiauFacade());
  // Sans ombres : avec elles, −10 % d'images/s mesurés (rue, 16 spots dont 4
  // ombrés) ; sans, −5,5 %. Voir CLAUDE.md (façades, non retenues par défaut).
  facades.receiveShadow = false;
  facades.frustumCulled = false;
  facades.renderOrder = 5;
  facades.visible = false;
  racine.add(facades);
  /**
   * Pose les murs à éclairer (`null` : aucun).
   * @param {{ positions: Float32Array, normales: Float32Array }|null} g
   */
  function definirFacades(g) {
    const ancienne = facades.geometry;
    if (!g || !g.positions?.length) {
      facades.visible = false;
      return;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(g.normales, 3));
    facades.geometry = geo;
    ancienne.dispose();
    facades.visible = true;
  }

  /** Change le budget (palier de qualité) ; rien ne bouge s'il est identique. */
  function definirBudget(b) {
    const ombres = Math.max(0, Math.min(MAX_OMBRES_NAPPE, Math.floor(b?.ombres ?? budget.ombres)));
    const lumieres = Math.max(0, Math.floor(b?.lumieres ?? budget.lumieres));
    if (ombres === budget.ombres && lumieres === budget.lumieres) return false;
    budget.ombres = ombres;
    budget.lumieres = lumieres;
    aReattribuer = true;
    return true;
  }

  return {
    racine,
    budget,
    definirBudget,
    definirAvanceRelief,
    definirFacades,
    /** Les sources qui portent une vraie lumière (repère local), pour choisir les façades. */
    sourcesEclairantes: () => {
      const byId = new Map(sources.map((s) => [s.id, s]));
      return repartition.eclairantes.map((id) => byId.get(id)).filter(Boolean);
    },
    /** Change quand la répartition des vraies lumières change. */
    cleEclairantes: () => repartition.eclairantes.join('|'),
    construire,
    appliquerEtats,
    avantRendu,
    vider,
    /** Des spots portent-ils ombre ? (le renderer doit alors garder ses shadow maps) */
    ombresActives: () => reservoir.some((l) => l.visible && l.castShadow),
    /** Forcer une nouvelle répartition (budget changé). */
    invalider: () => { aReattribuer = true; },
    /** Change quand les shadow maps des spots sont à refaire (sources ombrées, construction). */
    versionOmbres: () => versionOmbres,
    /** La nappe des vraies lumières lit-elle le pochoir des modèles ? (le calque l'efface alors) */
    besoinPochoir: () => nappeReelle.mesh.visible,
    /** Nombre de sources allumées (sans parcourir : tenu par `appliquerEtats`). */
    nbAllumees: () => nbAllumees,
    stats: () => ({
      luminaires: items.length,
      sources: sources.length,
      allumees: sources.filter((s) => s.allume).length,
      lumieres: repartition.eclairantes.length,
      ombres: repartition.ombrees.length,
      nappe: repartition.emissives.length,
      tachesReelles: nappeReelle.geo.instanceCount,
      tachesCalculees: nappeCalculee.geo.instanceCount,
      facadesTriangles: facades.visible ? facades.geometry.getAttribute('position').count / 3 : 0,
      modeleTest: items.filter((it) => it.test).length,
    }),
    items: () => items,
  };
}
