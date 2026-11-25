// Cinematic camera rig: time-aware C1 Hermite paths, deterministic shake,
// aspect-aware portrait framing, and GLB auto-framing.
import * as THREE from '../vendor/three/three.module.min.js';

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { const x = clamp(t); return x * x * (3 - 2 * x); };
export const easeInOut = (t) => { const x = clamp(t); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const seg = (t, a, b) => clamp((t - a) / Math.max(1e-5, b - a));
export const ramp = (t, a, b) => smooth(seg(t, a, b));

// Monotone, time-aware cubic Hermite keeps velocity continuous across uneven keys.
// A key can set hold:true to settle to a stop, or pace:0..1.5 to tune travel.
// Camera timing always uses absolute seconds so a render is deterministic.
function keyValue(k, field, axis, fallback) {
  const value = k[field] ?? fallback;
  return axis === null ? value : value[axis];
}

function keyVelocity(keys, index, field, axis, fallback) {
  if (index === 0 || index === keys.length - 1 || keys[index].hold) return 0;
  const before = keys[index - 1], here = keys[index], after = keys[index + 1];
  const dt0 = here.t - before.t, dt1 = after.t - here.t;
  const d0 = (keyValue(here, field, axis, fallback) - keyValue(before, field, axis, fallback)) / dt0;
  const d1 = (keyValue(after, field, axis, fallback) - keyValue(here, field, axis, fallback)) / dt1;
  if (d0 * d1 <= 0) return 0; // Do not overshoot at an extremum or plateau.
  const w0 = 2 * dt1 + dt0, w1 = dt1 + 2 * dt0;
  const pace = clamp(Number(here.pace ?? 1), 0, 1.5);
  return pace * (w0 + w1) / (w0 / d0 + w1 / d1);
}

function timedHermite(keys, index, t, field, axis, fallback) {
  const a = keys[index], b = keys[index + 1];
  const dt = b.t - a.t;
  const u = clamp((t - a.t) / dt), u2 = u * u, u3 = u2 * u;
  const va = keyValue(a, field, axis, fallback);
  const vb = keyValue(b, field, axis, fallback);
  const ma = keyVelocity(keys, index, field, axis, fallback);
  const mb = keyVelocity(keys, index + 1, field, axis, fallback);
  return (2 * u3 - 3 * u2 + 1) * va +
    (u3 - 2 * u2 + u) * dt * ma +
    (-2 * u3 + 3 * u2) * vb +
    (u3 - u2) * dt * mb;
}

export function evalCameraTrack(keyframes, t) {
  if (keyframes?.length > 1) {
    for (let i = 1; i < keyframes.length; i++) {
      if (!(keyframes[i].t > keyframes[i - 1].t))
        throw new RangeError('Camera keyframe times must be strictly increasing');
    }
  }
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
  // Timed Hermite ensures adjoining camera segments share the same velocity.
  const vec = (field) => [0, 1, 2].map(c => timedHermite(keyframes, idx, t, field, c, [0, 0, 0]));
  const field = (name, fallback) => timedHermite(keyframes, idx, t, name, null, fallback);
  return {
    pos: vec('pos'),
    look: vec('look'),
    fov: field('fov', 40),
    roll: field('roll', 0),
    focus: Math.max(0.01, field('focus', 5.0)),
    aperture: Math.max(0, field('aperture', 0)),
    shake: Math.max(0, field('shake', 0)),
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
