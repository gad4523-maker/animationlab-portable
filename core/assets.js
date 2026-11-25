// 3D asset & procedural shader helpers:
// 1) Continuous 3D-noise FBM GLSL Earth (zero UV seam, land/ocean spec contrast, FBM clouds masking specular, dark-side city lights)
// 2) Smooth-outer-falloff BackSide Fresnel atmosphere/event-horizon shaders (no hard donut cutoffs)
// 3) GLSL FBM Doppler accretion disk + gravitationally lensed Einstein halo + radial glow particles + dipole splines.
import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

export async function loadGLB(url, { targetSize = 2.0, centerY = false, castShadow = true, receiveShadow = true } = {}) {
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = targetSize / maxDim;
  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, (centerY ? -center.y : -box.min.y) * scale, -center.z * scale);
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = castShadow;
      obj.receiveShadow = receiveShadow;
    }
  });
  return { root, animations: gltf.animations || [], rawGltf: gltf };
}

export function createSeededRng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createGlowSpriteTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const half = size * 0.5;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  g.addColorStop(0.25, 'rgba(255, 255, 255, 0.80)');
  g.addColorStop(0.58, 'rgba(255, 255, 255, 0.18)');
  g.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export function createStarfield(count = 1000, minR = 16, maxR = 52, size = 0.14, seed = 101) {
  const rand = createSeededRng(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = minR + rand() * (maxR - minR);
    const th = rand() * Math.PI * 2;
    const ph = Math.acos(2 * rand() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph);
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const tint = rand();
    tmp.setHSL(tint < 0.35 ? 0.58 : tint < 0.82 ? 0.12 : 0.08, 0.35, 0.55 + rand() * 0.35);
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size,
    map: createGlowSpriteTexture(64),
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    alphaTest: 0.005,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

// True 3D unit-sphere GLSL FBM Procedural Earth (zero equirectangular seams, soft swirled clouds masking ocean spec, dark-side city clusters)
export function createProceduralEarthMesh(radius = 1.0, { sunDir = [0.75, 0.35, 0.55] } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(...sunDir).normalize() },
      uTime: { value: 0.0 },
      uCloudOpacity: { value: 0.85 },
      uCollapse: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vObjPos;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vObjPos = normalize(position);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform float uTime, uCloudOpacity, uCollapse;
      varying vec3 vObjPos;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;

      float hash3(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise3(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
              mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
              mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise3(p);
          p = p * 2.07 + vec3(13.1, 7.7, 19.3);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 p = normalize(vObjPos);
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndl = dot(N, normalize(uSunDir));
        float dayFactor = smoothstep(-0.14, 0.22, ndl);

        // Domain-warped 3D continent elevation
        vec3 warp = vec3(fbm(p * 2.4), fbm(p * 2.4 + 4.2), fbm(p * 2.4 + 8.7));
        float elev = fbm(p * 2.6 + warp * 0.65);
        float detail = fbm(p * 11.0);
        float landMask = smoothstep(0.49, 0.53, elev);

        // Ocean depth & biome land palette
        vec3 deepOcean = vec3(0.03, 0.14, 0.38);
        vec3 shallowOcean = vec3(0.06, 0.28, 0.54);
        vec3 oceanCol = mix(deepOcean, shallowOcean, smoothstep(0.30, 0.49, elev));

        vec3 forestCol = vec3(0.14, 0.42, 0.20);
        vec3 desertCol = vec3(0.64, 0.51, 0.30);
        vec3 mountainCol = vec3(0.38, 0.36, 0.34);
        float desertMask = smoothstep(0.42, 0.65, fbm(p * 3.1 + 12.0)) * (1.0 - abs(p.y));
        vec3 landCol = mix(forestCol, desertCol, desertMask);
        landCol = mix(landCol, mountainCol, smoothstep(0.64, 0.78, elev + detail * 0.15));
        landCol = mix(landCol, vec3(0.55, 0.32, 0.16), uCollapse * 0.65);

        // Polar snow caps
        float polar = smoothstep(0.76, 0.90, abs(p.y) + (detail - 0.5) * 0.14) * (1.0 - uCollapse * 0.7);
        vec3 surface = mix(oceanCol, landCol, landMask);
        surface = mix(surface, vec3(0.86, 0.92, 0.98), polar);

        // Swirling FBM clouds masking underlying ocean specularity cleanly
        float rot = uTime * 0.08;
        vec3 cp = vec3(p.x * cos(rot) - p.z * sin(rot), p.y, p.x * sin(rot) + p.z * cos(rot));
        float cWarp = fbm(cp * 3.5);
        float cloud = smoothstep(0.50, 0.74, fbm(cp * 4.2 + vec3(cWarp * 1.1, 0.0, cWarp * 0.8))) * uCloudOpacity;

        // Diffuse + ocean-only Blinn-Phong specular (blocked by land & thick clouds)
        float diff = max(0.0, ndl);
        vec3 H = normalize(normalize(uSunDir) + V);
        float spec = pow(max(0.0, dot(N, H)), 48.0) * (1.0 - landMask) * (1.0 - cloud) * (1.0 - polar) * 0.55;

        // Atmospheric Rayleigh scatter along terminator rim
        float fresnel = pow(clamp(1.0 - max(0.0, dot(N, V)), 0.0, 1.0), 3.0);
        vec3 rimGlow = mix(vec3(0.22, 0.68, 1.0), vec3(1.0, 0.48, 0.14), uCollapse) * fresnel * (0.28 + 0.55 * dayFactor);

        // City lights strictly on night-side land clusters
        float cities = smoothstep(0.69, 0.76, fbm(p * 18.0)) * landMask * (1.0 - polar) * (1.0 - dayFactor);

        vec3 lit = surface * (0.045 + diff * 1.15) + vec3(1.0, 0.95, 0.85) * spec;
        lit = mix(lit, vec3(0.95, 0.97, 1.0) * (0.06 + diff * 1.18), cloud);
        lit += vec3(1.0, 0.72, 0.30) * cities * 1.15;
        lit += rimGlow;

        gl_FragColor = vec4(lit, 1.0);
      }
    `,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 72, 54), mat);
}

// Outer-feathered BackSide glow shader: peaks smoothly around inner horizon and dissolves cleanly to 0 at outer mesh edge (ZERO hard donut cutoff)
export function createFresnelGlowMaterial(color = '#38bdf8', intensity = 1.6, power = 2.6) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uPower: { value: power },
    },
    vertexShader: `
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormalW = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity, uPower;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        float ndv = clamp(abs(dot(normalize(vNormalW), normalize(vViewDir))), 0.0, 1.0);
        // Smoothly fades to 0.0 at ndv=0 (outer mesh boundary) AND concentrates softly near inner sphere!
        float halo = pow(ndv, uPower) * smoothstep(0.0, 0.42, ndv);
        gl_FragColor = vec4(uColor * uIntensity * halo, clamp(halo, 0.0, 1.0));
      }
    `,
  });
}

// Continuous GLSL Doppler-beamed FBM swirling accretion disk shader
export function createAccretionDiscMaterial({ innerR = 1.08, outerR = 3.1, hueWarm = '#fb923c', hueHot = '#fff6d6' } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uInner: { value: innerR },
      uOuter: { value: outerR },
      uWarm: { value: new THREE.Color(hueWarm) },
      uHot: { value: new THREE.Color(hueHot) },
    },
    vertexShader: `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime, uInner, uOuter;
      uniform vec3 uWarm, uHot;
      varying vec3 vLocal;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      void main() {
        float r = length(vLocal.xy);
        float rn = clamp((r - uInner) / max(0.01, uOuter - uInner), 0.0, 1.0);
        if (rn <= 0.001 || rn >= 0.999) discard;

        float ang = atan(vLocal.y, vLocal.x);
        float omega = uTime * (1.8 / (0.35 + rn * 1.4));
        float spiral = noise(vec2(rn * 11.0, ang * 3.0 + omega - rn * 7.5)) * 0.65
                     + noise(vec2(rn * 22.0, ang * 6.0 + omega * 1.3 - rn * 14.0)) * 0.35;

        float radEnv = smoothstep(0.0, 0.14, rn) * pow(1.0 - rn, 1.65);
        float doppler = 0.72 + 0.52 * sin(ang + 0.6);
        float glow = (0.35 + 1.15 * spiral) * radEnv * doppler * 1.25;
        vec3 col = mix(uWarm, uHot, clamp(glow * 0.62 + (1.0 - rn) * 0.5, 0.0, 1.0));
        gl_FragColor = vec4(col * glow, clamp(glow, 0.0, 1.0));
      }
    `,
  });
}

// Dipolar magnetic field spline r = L * sin^2(theta)
export function createDipoleFieldLines(count = 10, L = 1.95, color = '#38bdf8') {
  const group = new THREE.Group();
  const mats = [];
  for (let i = 0; i < count; i++) {
    const phi = (i / count) * Math.PI * 2;
    const pts = [];
    for (let s = 0; s <= 40; s++) {
      const th = (0.28 + (s / 40) * (Math.PI - 0.56));
      const r = Math.max(1.01, L * Math.sin(th) * Math.sin(th));
      pts.push(new THREE.Vector3(
        r * Math.sin(th) * Math.cos(phi),
        r * Math.cos(th),
        r * Math.sin(th) * Math.sin(phi)
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    mats.push(mat);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 44, 0.011, 6, false), mat));
  }
  return { group, mats };
}
