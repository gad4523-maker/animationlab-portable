import { PIXI, rigbyPixi, Emitter, upgradeConfig } from '/pipeline/dist/pixi.mjs';
import { createSeededRng } from '/pipeline/core/assets.js';

export async function initShot({ glCanvas, width, height, fps, profile }) {
  const app = new PIXI.Application();
  await app.init({ canvas: glCanvas, width, height, autoStart: false, preference: 'webgl',
                   antialias: profile.effects > 0, background: '#172637' });
  const stage = new PIXI.Container();
  stage.scale.set(width / 360, height / 640);
  app.stage.addChild(stage);
  const far = new PIXI.Graphics().circle(262, 160, 71).fill(0x293950)
    .circle(262, 160, 49).fill(0xefcf9e)
    .poly([-90, 435, 7, 314, 76, 373, 177, 297, 299, 391, 452, 336, 510, 550, -90, 550]).fill(0x263e51)
    .poly([-90, 479, 11, 379, 123, 422, 198, 380, 275, 422, 420, 375, 495, 568, -90, 568]).fill(0x2f4b54);
  const platform = new PIXI.Graphics().poly([-80, 565, 46, 475, 250, 462, 500, 590, 500, 670, -80, 670])
    .fill(0x0f222e).moveTo(12, 500).lineTo(249, 465).lineTo(403, 521).stroke({ color: 0x658581, width: 2 })
    .ellipse(171, 480, 56, 12).fill(0x101821);
  stage.addChild(far, platform);

  const { loadRigby, RigbySkeleton } = rigbyPixi(PIXI);
  const assetUrl = name => new URL(name, import.meta.url).href;
  const rig = await loadRigby(assetUrl('scout.json'), assetUrl('scout.atlas'));
  const character = new RigbySkeleton(rig, { animation: 'signal', loop: false, autoUpdate: false });
  character.position.set(174, 477);
  character.scale.set(1.32);
  stage.addChild(character);
  const spriteAtlas = await PIXI.Assets.load(assetUrl('scout.png'));
  const glint = new PIXI.Sprite(new PIXI.Texture({ source: spriteAtlas.source,
    frame: new PIXI.Rectangle(164, 0, 12, 12) }));
  glint.anchor.set(.5);
  glint.scale.set(.82);
  character.attachToBone('forearm', glint, { x: 29, y: 0, scale: false });

  const particles = new PIXI.Container();
  stage.addChild(particles);
  const glow = app.renderer.generateTexture(new PIXI.Graphics()
    .circle(8, 8, 7).fill({ color: 0x7be4c8, alpha: 0.27 }).circle(8, 8, 3).fill(0xecffd2));
  const emitter = new Emitter(particles, upgradeConfig({
    alpha: {start: .95, end: 0}, scale: {start: .57, end: .1, minimumScaleMultiplier: 0.5},
    color: {start: 'fff2bb', end: '78c3b2'}, speed: {start: 130, end: 40},
    startRotation: {min: 195, max: 350}, lifetime: {min: .36, max: .78},
    frequency: .019, particlesPerWave: 3, maxParticles: Math.round(105*profile.particles),
    pos: {x: 0, y: 0}, spawnType: 'point', addAtBack: false,
  }, [glow]));
  emitter.emit = false;
  const random = createSeededRng(704);
  const naturalRandom = Math.random;
  return { renderFrame(frame, seconds) {
    far.x = -seconds * 8;
    platform.x = -seconds * 18;
    character.position.x = 174 + seconds * 6;
    character.position.y = 477 - Math.sin(seconds * 3.7) * 3;
    character.update(frame === 0 ? 0 : 1 / fps);
    const point = glint.getGlobalPosition();
    emitter.updateOwnerPos(point.x / stage.scale.x, point.y / stage.scale.y);
    emitter.emit = seconds >= 1.18 && seconds < 1.40;
    Math.random = random;
    try { emitter.update(frame === 0 ? 0 : 1/fps); }
    finally { Math.random = naturalRandom; }
    glint.visible = seconds >= 1.1;
    app.render();
  }};
}
