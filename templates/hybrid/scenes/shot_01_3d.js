import * as THREE from '/pipeline/vendor/three/three.module.min.js';
import { evalCameraTrack, applyCameraState, clamp, ramp } from '/pipeline/core/camera.js';
import { createCinemaComposer } from '/pipeline/core/postprocess.js';
import { createStarfield, createProceduralEarthMesh, createFresnelGlowMaterial } from '/pipeline/core/assets.js';
import { drawTelemetryHUD } from '/pipeline/core/overlay_hud.js';

export async function initShot({ profile, glCanvas, hudCanvas, width, height, shot, params }) {
  const ctxHud = hudCanvas.getContext('2d');
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050914');
  const cam = new THREE.PerspectiveCamera(42, width / height, 0.05, 200);
  const composer = createCinemaComposer(renderer, width, height, { effects: profile?.effects ?? 2 });

  const stars = createStarfield(900);
  scene.add(stars);

  const earth = createProceduralEarthMesh(1.0);
  scene.add(earth);

  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.16, 48, 36), createFresnelGlowMaterial('#38bdf8', 2.2, 2.2)));

  const dur = Number(shot.duration_sec || 4.5);
  const keyframes = [
    { t: 0.0, pos: [2.2, -0.5, 6.2], look: [0, -0.05, 0], fov: 44, focus: 6.4, aperture: 0.20 },
    { t: dur * 0.5, pos: [0.4, 0.25, 5.4], look: [0, -0.05, 0], fov: 40, focus: 5.5, aperture: 0.35 },
    { t: dur, pos: [-1.6, 0.55, 5.8], look: [0, -0.05, 0], fov: 40, focus: 6.0, aperture: 0.20 },
  ];

  return {
    async renderFrame(_frame, t) {
      const cState = evalCameraTrack(keyframes, t);
      applyCameraState(cam, cState, t);
      earth.rotation.y = t * 0.25;
      earth.material.uniforms.uTime.value = t;
      stars.rotation.y = -t * 0.02;

      composer.render(scene, cam, { focus: cState.focus, aperture: cState.aperture, bloom: 0.72, time: t });

      ctxHud.clearRect(0, 0, width, height);
      drawTelemetryHUD(ctxHud, width, height, {
        badge: params.badge || 'SCENE // 3D',
        title: params.title || shot.id.toUpperCase(),
        progress: clamp(t / Math.max(0.1, dur)),
        fadeIn: ramp(t, 0.0, 0.35),
        t,
      });
    },
  };
}
