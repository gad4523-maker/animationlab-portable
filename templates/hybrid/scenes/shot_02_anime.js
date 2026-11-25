import { drawAnimeActionFrame } from '/pipeline/core/anime_rig.js';
import { clamp, lerp, ramp } from '/pipeline/core/camera.js';

export async function initShot({ glCanvas, hudCanvas, width, height }) {
  const ctx = glCanvas.getContext('2d', { alpha: false });
  const ctxHud = hudCanvas.getContext('2d');
  ctxHud.clearRect(0, 0, width, height);

  return {
    async renderFrame(_frame, t) {
      const surge = ramp(t, 0.0, 2.6);
      const strike = ramp(t, 2.6, 2.95);
      const impact = (t >= 2.68 && t < 2.75) ? 1.0 : 0.0;
      const shock = t >= 2.70 ? clamp((t - 2.70) / 0.8) : 0.0;

      drawAnimeActionFrame(ctx, width, height, {
        t,
        crouch: 0.45 * surge * (1 - strike) + 0.12 * strike,
        squashX: lerp(1.0, 1.12, surge * (1 - strike)),
        squashY: lerp(1.0, 0.90, surge * (1 - strike)),
        punchExtend: strike,
        dashOffsetX: lerp(-0.08, 0.16, strike),
        twist: lerp(-0.2, 0.45, strike),
        auraPower: clamp(0.25 + surge * 0.75),
        awakened: t >= 2.70,
        impactFlash: impact,
        shockwave: shock,
        smearArc: t >= 2.60 && t <= 3.05 ? Math.sin(((t - 2.60) / 0.45) * Math.PI) : 0,
        expression: t >= 2.55 ? 'roar' : 'tense',
        cam: {
          dist: lerp(1.22, 0.92, surge) + ramp(t, 2.85, 4.8) * 0.25,
          yawDeg: lerp(-18, 22, ramp(t, 0.4, 2.7)),
          pitchDeg: lerp(-14, -4, ramp(t, 0.0, 3.0)),
        },
      });
    },
  };
}
