import { PIXI, rigbyPixi, Emitter } from './pixi.mjs';

window.probePixi = async () => {
  const app = new PIXI.Application();
  try {
    await app.init({ width: 32, height: 32, preference: 'webgl', autoStart: false });
    const rig = rigbyPixi(PIXI);
    const emitter = new Emitter(new PIXI.Container(), {
      lifetime: {min: 1, max: 1}, frequency: 0.2, particlesPerWave: 1, maxParticles: 5, behaviors: [],
    });
    emitter.update(0.1);
    emitter.destroy();
    app.stage.addChild(new PIXI.Graphics().circle(16, 16, 8).fill(0xffb944));
    app.render();
    return Boolean(rig.loadRigby && rig.RigbySkeleton);
  } catch (error) {
    console.error(error);
    return false;
  } finally {
    if (app.renderer) app.destroy();
  }
};
