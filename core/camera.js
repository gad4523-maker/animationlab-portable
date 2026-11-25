// Cinematic camera rig: C1-continuous Catmull-Rom spline paths, trauma shake,
// aspect-aware portrait framing, and GLB auto-framing.
import * as THREE from '../vendor/three/three.module.min.js';

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { const x = clamp(t); return x * x * (3 - 2 * x); };
export const easeInOut = (t) => { const x = clamp(t); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const seg = (t, a, b) => clamp((t - a) / Math.max(1e-5, b - a));
export const ramp = (t, a, b) => smooth(seg(t, a, b));

function catmull1(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

export function evalCameraTrack(keyframes, t) {
  if (!keyframes || keyframes.length === 0) {
    return { pos: [0, 1, 5], look: [0, 0, 0], fov: 40, roll: 0, focus: 5, aperture: 0, shake: 0 };
  }
  if (keyframes.length === 1 || t <= keyframes[0].t) {
    const k = keyframes[0];
    return {
      pos: k.pos, look: k.look, fov: k.fov ?? 40, roll: k.roll ?? 0,
      focus: k.focus ?? 5.0, aperture: k.aperture ?? 0.0, shake: k.shake ?? 0.0,
    };
  }
  const last = keyframes[keyframes.length - 1];
  if (t >= last.t) {
    return {
      pos: last.pos, look: last.look, fov: last.fov ?? 40, roll: last.roll ?? 0,
      focus: last.focus ?? 5.0, aperture: last.aperture ?? 0.0, shake: last.shake ?? 0.0,
    };
  }

  let idx = 0;
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (t >= keyframes[i].t && t <= keyframes[i + 1].t) {
      idx = i;
      break;
    }
  }
  const k0 = keyframes[Math.max(0, idx - 1)];
  const k1 = keyframes[idx];
  const k2 = keyframes[idx + 1];
  const k3 = keyframes[Math.min(keyframes.length - 1, idx + 2)];
  const rawU = clamp((t - k1.t) / Math.max(1e-5, k2.t - k1.t));

  // Pure Catmull-Rom u preserves C1 velocity through all interior keyframes
  const pos = [0, 1, 2].map((c) => catmull1(k0.pos[c], k1.pos[c], k2.pos[c], k3.pos[c], rawU));
  const look = [0, 1, 2].map((c) => catmull1(k0.look[c], k1.look[c], k2.look[c], k3.look[c], rawU));
  const s = smooth(rawU);
  return {
    pos,
    look,
    fov: lerp(k1.fov ?? 40, k2.fov ?? 40, s),
    roll: lerp(k1.roll ?? 0, k2.roll ?? 0, s),
    focus: lerp(k1.focus ?? 5.0, k2.focus ?? 5.0, s),
    aperture: lerp(k1.aperture ?? 0.0, k2.aperture ?? 0.0, s),
    shake: lerp(k1.shake ?? 0.0, k2.shake ?? 0.0, s),
  };
}

export function applyCameraState(cam, state, t = 0) {
  const s = state.shake || 0;
  const dx = s > 0 ? Math.sin(t * 53.7) * 0.032 * s : 0;
  const dy = s > 0 ? Math.cos(t * 67.3) * 0.028 * s : 0;
  const dz = s > 0 ? Math.sin(t * 41.9) * 0.018 * s : 0;

  cam.position.set(state.pos[0] + dx, state.pos[1] + dy, state.pos[2] + dz);
  cam.up.set(0, 1, 0);
  cam.lookAt(state.look[0] + dx * 0.4, state.look[1] + dy * 0.4, state.look[2]);
  if (state.roll) cam.rotateZ(state.roll + (s > 0 ? Math.sin(t * 47.1) * 0.015 * s : 0));
  if (Math.abs(cam.fov - state.fov) > 1e-3) {
    cam.fov = state.fov;
    cam.updateProjectionMatrix();
  }
  cam.updateMatrixWorld();
}

export function aspectAwareDist(radius, vfovDeg = 42, aspect = 9 / 16, fillRatio = 0.78) {
  const halfV = (vfovDeg * Math.PI) / 360;
  const tanHalfH = Math.tan(halfV) * aspect;
  return radius / Math.max(0.01, fillRatio * tanHalfH);
}

export function frameObject(cam, object3d, fillRatio = 0.78) {
  const box = new THREE.Box3().setFromObject(object3d);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z, 0.001) * 0.5;
  const dist = aspectAwareDist(r, cam.fov || 42, cam.aspect || 9 / 16, fillRatio);
  cam.position.set(center.x, center.y + r * 0.25, center.z + dist);
  cam.lookAt(center);
  cam.updateMatrixWorld();
  return { center: center.toArray(), size: size.toArray(), dist };
}
