import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';

const v = () => new THREE.Vector3();
const q = () => new THREE.Quaternion();
const euler = new THREE.Euler();

function setRotation(node, base, angles) {
  euler.set(...angles, 'YXZ');
  node.quaternion.copy(base.quaternion).multiply(q().setFromEuler(euler));
}

function aim(node, child, target, base) {
  const origin = node.getWorldPosition(v());
  const parent = node.parent.getWorldQuaternion(q());
  const rest = parent.clone().multiply(base.quaternion);
  const direction = child.position.clone().applyQuaternion(rest).normalize();
  const goal = target.clone().sub(origin).normalize();
  node.quaternion.copy(parent.invert().multiply(q().setFromUnitVectors(direction, goal)).multiply(rest));
  node.updateWorldMatrix(false, true);
}

// Positions are world-space. The pole controls the side of the elbow or knee.
function solveLimb(nodes, target, pole, rest) {
  const [upper, lower, end] = nodes;
  const origin = upper.getWorldPosition(v());
  const a = lower.position.length();
  const b = end.position.length();
  const ray = target.clone().sub(origin);
  const distance = THREE.MathUtils.clamp(ray.length(), Math.abs(a - b) + .001, a + b - .001);
  ray.normalize();
  const along = (a*a - b*b + distance*distance) / (2*distance);
  const bend = pole.clone().sub(origin);
  bend.addScaledVector(ray, -bend.dot(ray));
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(ray, -ray.z);
  bend.normalize();
  const joint = origin.clone().addScaledVector(ray, along).addScaledVector(bend, Math.sqrt(Math.max(0, a*a - along*along)));
  aim(upper, lower, joint, rest.get(upper));
  aim(lower, end, origin.addScaledVector(ray, distance), rest.get(lower));
}

function toonMaterial(source, gradient, palette) {
  const color = palette(source.name, source.color.clone());
  return new THREE.MeshToonMaterial({
    name: source.name,
    color, map: source.map, gradientMap: gradient, side: source.side,
    transparent: source.transparent, opacity: source.opacity, alphaTest: source.alphaTest,
    depthWrite: source.depthWrite, vertexColors: source.vertexColors,
  });
}

function inkShell(mesh, source, width) {
  const outline = new THREE.MeshBasicMaterial({
    color: 0x0b1727, side: THREE.BackSide,
    map: source.map, alphaTest: source.map ? .50 : 0,
    fog: true,
  });
  outline.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed += normal * ' + width.toFixed(5) + ';');
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\ndiffuseColor.rgb = vec3(0.0034, 0.0086, 0.020);');
  };
  outline.customProgramCacheKey = () => 'ink-' + width;
  const shell = new THREE.SkinnedMesh(mesh.geometry, outline);
  shell.bindMode = THREE.DetachedBindMode;
  shell.bind(mesh.skeleton, mesh.bindMatrix);
  // Share the influence array so the silhouette and facial mesh use the same morph weights.
  shell.morphTargetInfluences = mesh.morphTargetInfluences;
  shell.frustumCulled = false;
  shell.renderOrder = -1;
  mesh.add(shell);
}

/**
 * Loads the embedded humanoid map, skin and morphs from a VRM 0.x GLB.
 * Scene performs all secondary animation on the frame clock. No VRM runtime physics is required.
 */
export async function loadCelHumanoid(url, { palette = (_name, color) => color, ink = .0024 } = {}) {
  const gltf = await new GLTFLoader().loadAsync(String(url));
  const metadata = gltf.parser.json.extensions?.VRM;
  if (!metadata?.humanoid) throw new Error('Cel characters require a VRM 0.x humanoid map');
  const entries = await Promise.all(metadata.humanoid.humanBones.map(async ({ bone, node }) =>
    [bone, await gltf.parser.getDependency('node', node)]));
  const bones = Object.fromEntries(entries);
  for (const bone of ['hips', 'spine', 'chest', 'neck', 'head']) {
    if (!bones[bone]) throw new Error('Missing humanoid bone ' + bone);
  }
  const rest = new Map();
  const expressions = new Map();
  const springRoots = [];
  const gradient = new THREE.DataTexture(new Uint8Array([41, 92, 204, 255]), 4, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  const meshes = [];
  gltf.scene.traverse((node) => {
    if (node.isBone) rest.set(node, { position: node.position.clone(), quaternion: node.quaternion.clone() });
    if (node.isSkinnedMesh) meshes.push(node);
  });
  const materials = new Map();
  for (const mesh of meshes) {
    mesh.frustumCulled = false;
    const original = mesh.material;
    if (!materials.has(original)) materials.set(original, toonMaterial(original, gradient, palette));
    mesh.material = materials.get(original);
    if (ink && /CLOTH|HAIR/.test(original.name) && !original.transparent) {
      inkShell(mesh, original, ink);
    }
  }

  for (const { presetName, binds } of metadata.blendShapeMaster?.blendShapeGroups ?? []) {
    const targets = binds.flatMap(({ mesh: id, index, weight }) => meshes
      .filter((mesh) => gltf.parser.associations.get(mesh)?.meshes === id && mesh.morphTargetInfluences?.[index] !== undefined)
      .map((mesh) => ({ mesh, index, weight: weight / 100 })));
    expressions.set(presetName, targets);
  }
  for (const group of metadata.secondaryAnimation?.boneGroups ?? []) {
    for (const index of group.bones ?? []) {
      const bone = await gltf.parser.getDependency('node', index);
      if (rest.has(bone) && !springRoots.includes(bone)) springRoots.push(bone);
    }
  }

  const root = new THREE.Group();
  root.name = metadata.meta?.title || 'Cel Humanoid';
  root.add(gltf.scene);

  function pose({ position, yaw = 0, pelvis = [0, 0, 0], turns = {}, limbs = {}, face = {}, grip = {}, hair = [0, 0, 0] }) {
    root.position.copy(position);
    root.rotation.y = yaw;
    for (const [node, base] of rest) node.quaternion.copy(base.quaternion);
    bones.hips.position.copy(rest.get(bones.hips).position).add(new THREE.Vector3(...pelvis));
    for (const [name, angles] of Object.entries(turns)) {
      if (bones[name]) setRotation(bones[name], rest.get(bones[name]), angles);
    }
    springRoots.forEach((node, i) => {
      setRotation(node, rest.get(node), hair.map((angle, axis) => angle * (.72 + .28 * Math.sin(i * 2.7 + axis))));
    });

    root.updateMatrixWorld(true);
    for (const [name, { target, pole, twist = 0 }] of Object.entries(limbs)) {
      const side = name.endsWith('L') ? 'left' : 'right';
      const leg = name.startsWith('foot');
      const chain = (leg ? ['UpperLeg', 'LowerLeg', 'Foot'] : ['UpperArm', 'LowerArm', 'Hand'])
        .map((part) => bones[side + part]);
      if (chain.every(Boolean)) {
        solveLimb(chain, target, pole, rest);
        if (leg) {
          const end = chain[2];
          end.quaternion.copy(end.parent.getWorldQuaternion(q()).invert()
            .multiply(root.getWorldQuaternion(q())).multiply(rest.get(end).quaternion));
          end.rotateY(twist);
        } else {
          chain[2].rotateX(twist);
        }
      }
    }

    for (const [name, node] of entries) {
      const match = name.match(/^(left|right)(Index|Middle|Ring|Little)(Proximal|Intermediate|Distal)$/);
      if (!match) continue;
      const side = match[1];
      const sign = side === 'left' ? 1 : -1;
      const curl = (grip[side] ?? 0) * (match[3] === 'Distal' ? .67 : 1);
      node.rotateZ(sign * curl);
    }
    for (const mesh of meshes) mesh.morphTargetInfluences?.fill(0);
    for (const [name, value] of Object.entries(face)) {
      for (const { mesh, index, weight } of expressions.get(name) ?? []) {
        mesh.morphTargetInfluences[index] = Math.min(1, mesh.morphTargetInfluences[index] + value * weight);
      }
    }
    root.updateMatrixWorld(true);
  }

  return { root, bones, pose };
}
