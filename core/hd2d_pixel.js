// HD-2D pixel-sprite sampling and parallax; optional, deterministic, no extra deps.
import * as THREE from '../vendor/three/three.module.min.js';

export function pixelTexture(texture, { mipmaps = false } = {}) {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = mipmaps ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter;
  texture.generateMipmaps = mipmaps;
  texture.needsUpdate = true;
  return texture;
}

export function pixelCanvas(ctx) {
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export const pixelSnap = (v, unit = 1) => {
  const step = Math.max(1, Math.abs(Number(unit) || 1));
  return Math.round(v / step) * step;
};

export function pixelParallax(cameraX, cameraY, depth = 1, snapUnit = 0) {
  const factor = Math.max(0, Number(depth) || 0);
  const x = -cameraX * factor, y = -cameraY * factor;
  return snapUnit > 0 ? { x: pixelSnap(x, snapUnit), y: pixelSnap(y, snapUnit) } : { x, y };
}
