import * as T from '/pipeline/vendor/three/three.module.min.js';
import { createCinemaComposer } from '/pipeline/core/postprocess.js';
import { createSeededRng } from '/pipeline/core/assets.js';

export function initShot({ glCanvas, width, height, profile }) {
  const renderer = new T.WebGLRenderer({ canvas: glCanvas, antialias: profile.effects === 2 });
  renderer.setSize(width, height, false);
  const scene = new T.Scene();
  scene.background = new T.Color(0x172837);
  scene.fog = new T.FogExp2(0x203744, 0.045);
  const camera = new T.PerspectiveCamera(33, width / height, 0.1, 70);
  const cinema = createCinemaComposer(renderer, width, height, { near: camera.near, far: 70, effects: profile.effects });
  const random = createSeededRng(172);
  const ease = (s, a, b) => T.MathUtils.smoothstep(s, a, b);

  function mesh(geometry, color, x, y, z, parent = scene) {
    const material = new T.MeshToonMaterial({ color });
    const object = new T.Mesh(geometry, material);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  }

  function box(w, h, d, color, x, y, z, parent) {
    return mesh(new T.BoxGeometry(w, h, d), color, x, y, z, parent);
  }

  box(50, 0.2, 50, 0x213947, 0, -0.13, -7);
  for (let i = 0; i < 43; i++) {
    const h = 1.2 + 4.8 * random();
    const x = (random() - .5) * 48;
    const z = -6 - 32 * random();
    box(.45 + random(), h, .5 + random(), 0x425b61, x, h / 2, z);
  }
  for (let i = -6; i <= 6; i++) {
    box(.029, .01, 13, 0x597378, i * .54, -.02, -.9);
  }

  const structure = new T.Group();
  scene.add(structure);
  for (let i = 0; i < 4; i++) {
    mesh(new T.CylinderGeometry(.73 - i*.13, .78 - i*.13, .19, 8),
         i % 2 ? 0x62797b : 0x39515b, .72, .08 + i*.19, 0, structure);
  }
  for (let i = 0; i < 4; i++) {
    const azimuth = i * Math.PI / 2 + Math.PI / 4;
    const prong = box(.09, .83, .10, 0x638a80, .72 + Math.cos(azimuth)*.29,
                      .91, Math.sin(azimuth)*.29, structure);
    prong.rotation.z = -.19 * Math.cos(azimuth);
  }
  const core = new T.Mesh(new T.IcosahedronGeometry(.27, 0),
    new T.MeshBasicMaterial({ color: new T.Color(.36, 1.3, .95) }));
  scene.add(core);
  const halo = new T.Mesh(new T.TorusGeometry(1, .016, 5, 42),
    new T.MeshBasicMaterial({ color: 0x9df3bf, transparent: true, depthWrite: false }));
  scene.add(halo);

  const actor = new T.Group();
  actor.position.set(-.85, 0, .35);
  scene.add(actor);
  const torso = box(.35, .52, .26, 0xb1d3b4, 0, .85, 0, actor);
  box(.35, .27, .31, 0x416477, .02, 1.24, 0, actor);
  box(.22, .035, .025, 0xebebad, .11, 1.265, .16, actor);
  for (const side of [-1, 1]) {
    const leg = box(.105, .59, .12, 0x42596a, .12*side, .33, .015*side, actor);
    leg.rotation.z = .15 * side;
  }
  const arm = new T.Group();
  arm.position.set(.16, 1.01, .08);
  actor.add(arm);
  box(.10, .33, .11, 0x7d9f88, 0, -.15, 0, arm);
  const fore = new T.Group();
  fore.position.y = -.28;
  arm.add(fore);
  box(.085, .29, .09, 0x597b70, 0, -.12, 0, fore);
  box(.105, .12, .10, 0xedc280, 0, -.27, 0, fore);
  const scarf = box(.4, .085, .13, 0xc65941, -.22, 1.09, -.06, actor);

  const ambient = new T.HemisphereLight(0xe8f0c8, 0x304c60, 1.3);
  const key = new T.DirectionalLight(0xf5d9a4, 2.4);
  key.position.set(-3, 5, 3);
  const accent = new T.PointLight(0x60e8b4, 4, 5);
  scene.add(ambient, key, accent);

  const particleCount = Math.round(100 * profile.particles);
  const position = new Float32Array(particleCount * 3);
  const vectors = Array.from({length: particleCount}, () => new T.Vector3(
    random() - .5, random() - .5, random() - .5).normalize().multiplyScalar(1.2 + random()*2.8));
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(position, 3));
  const points = new T.Points(geometry, new T.PointsMaterial({
    color: 0xbee6ab, size: .046, transparent: true, depthWrite: false,
  }));
  points.frustumCulled = false;
  scene.add(points);

  return { renderFrame(_f, sec) {
    const anticipation = ease(sec, .12, .64);
    const contact = ease(sec, .67, .83);
    const release = ease(sec, .84, 1.72);
    const pulse = contact * (1 - release);
    core.position.set(.72, 1.16 + Math.sin(sec*4)*.066, 0);
    accent.position.copy(core.position);
    accent.intensity = 4 + pulse * 23;
    core.rotation.set(sec*1.3, sec*2.2, sec*.4);
    core.scale.setScalar(1 + pulse*.35);
    halo.visible = sec > .83 && release < 1;
    halo.position.copy(core.position);
    halo.scale.setScalar(.27 + release*3.1);
    halo.material.opacity = 1 - release;
    halo.rotation.set(.15, sec*.65, .27);
    actor.position.x = -.85 + contact*.19;
    torso.rotation.z = -.14*anticipation;
    arm.rotation.z = .4 - anticipation*.72 + contact*2.12 - release*.72;
    fore.rotation.z = .36 + anticipation*.65 - contact*.48;
    scarf.rotation.z = .16 + .27*Math.sin(sec*11) * (.3 + pulse);
    points.material.opacity = sec > .82 ? (1 - release) * .9 : 0;
    vectors.forEach((vector, i) => {
      position[i*3] = .72 + vector.x * release;
      position[i*3+1] = 1.16 + vector.y * release;
      position[i*3+2] = vector.z * release;
    });
    geometry.attributes.position.needsUpdate = true;
    const shake = pulse * .035 * Math.sin(sec*96);
    camera.position.set(1.02 - 1.47*ease(sec, 0, 2.25) + shake,
                        1.67 + pulse*.09, 5.65 - ease(sec, 0, 2.25)*.63);
    camera.lookAt(.11, .85, 0);
    cinema.render(scene, camera, { bloom: .4 + pulse*.72, aperture: .25, grain: 0, time: sec });
  }};
}
