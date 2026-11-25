// Expressive 2D Anime Rig & VFX Engine (1080x1920 native ready)
// Round 2 Overhaul:
// - Outward knee IK (fixes crossed X-knees) + pelvis/gi bridge + feet staggered stance or cosmic unpinned tidal float
// - Two-pass seamless connected limbs (outer ink silhouette -> seamless joint-free cel fill, zero mannequin peg lines)
// - Proper torso twist + waist yaw scaling + matching gi sleeves on BOTH shoulders + knotted obi & twin sash tails
// - Fierce V-brows, ears, cranial hair mass, fierce gritted/snarl mouth (no combat smile), coupled jaw drop
// - Silhouette-hugging layered organic aura flames + soft bloom + velocity-swept crescent smear ribbon

const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

function makeRng(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeProjector(cam, W, H) {
  const yaw = (cam.yawDeg || 0) * (Math.PI / 180);
  const pitch = (cam.pitchDeg || 0) * (Math.PI / 180);
  const roll = (cam.rollDeg || 0) * (Math.PI / 180);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const dist = cam.dist || 1.15;
  const f = H * 0.78;
  const ox = cam.offsetX || 0;
  const oy = cam.offsetY || 0;

  return (x, y, z = 0) => {
    const rx = x * cy + z * sy;
    const rz1 = -x * sy + z * cy;
    const ry = y * cp - rz1 * sp;
    const rz = y * sp + rz1 * cp + dist * 2.1;
    const sc = f / Math.max(0.45, rz);
    const px = (rx + ox) * sc;
    const py = (ry + oy) * sc;
    return [
      W * 0.5 + px * cr - py * sr,
      H * 0.45 + px * sr + py * cr, // sits slightly higher so feet clear subtitles comfortably!
      sc,
    ];
  };
}

function solve2BoneIK(root, target, l1, l2, bendSign = 1) {
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const dz = target[2] - root[2];
  const planar = Math.hypot(dx, dy) || 1e-4;
  const d = Math.min(l1 + l2 - 0.002, Math.max(Math.abs(l1 - l2) + 0.002, planar));
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / planar;
  const uy = dy / planar;
  const mx = root[0] + ux * a;
  const my = root[1] + uy * a;
  // In screen-down (+Y) coordinates, perp = (-uy, ux): positive bendSign pushes toward -X for downward limbs!
  return [
    mx - uy * h * bendSign,
    my + ux * h * bendSign,
    root[2] + dz * 0.5 + 0.08,
  ];
}

function capsulePath(ctx, a, b, ra, rb) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const ang = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.arc(a[0], a[1], ra, ang + Math.PI * 0.5, ang - Math.PI * 0.5, false);
  ctx.lineTo(b[0] - nx * rb, b[1] - ny * rb);
  ctx.arc(b[0], b[1], rb, ang - Math.PI * 0.5, ang + Math.PI * 0.5, false);
  ctx.closePath();
}

// Seamless two-pass 2-segment limb (outer stroke silhouette first, then joint-free cel fill -> ZERO internal mannequin peg circles!)
function drawSeamlessLimb(ctx, a, b, c, ra, rb, rc, fill, shade, rimCol, lineCol, lw) {
  // Pass 1: thickened outer ink silhouette around both segments
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = lw * 2.0;
  ctx.lineJoin = 'round';
  capsulePath(ctx, a, b, ra, rb);
  ctx.stroke();
  capsulePath(ctx, b, c, rb, rc);
  ctx.stroke();

  // Pass 2: clean base fill covering interior strokes completely
  ctx.fillStyle = fill;
  capsulePath(ctx, a, b, ra, rb);
  ctx.fill();
  capsulePath(ctx, b, c, rb, rc);
  ctx.fill();

  // Pass 3: clipped underside cel shadow & aura rim light along combined segments
  for (const [p0, p1, r0, r1] of [[a, b, ra, rb], [b, c, rb, rc]]) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    ctx.save();
    capsulePath(ctx, p0, p1, r0, r1);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p1[0] - nx * r1 * 1.4, p1[1] - ny * r1 * 1.4);
    ctx.lineTo(p0[0] - nx * r0 * 1.4, p0[1] - ny * r0 * 1.4);
    ctx.closePath();
    ctx.fillStyle = shade;
    ctx.fill();

    if (rimCol) {
      ctx.strokeStyle = rimCol;
      ctx.lineWidth = lw * 1.5;
      ctx.beginPath();
      ctx.moveTo(p0[0] + nx * (r0 - lw * 0.6), p0[1] + ny * (r0 - lw * 0.6));
      ctx.lineTo(p1[0] + nx * (r1 - lw * 0.6), p1[1] + ny * (r1 - lw * 0.6));
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawFist(ctx, pt, ang, radius, skin, shade, belt, lineCol, lw, handPose = 'fist') {
  ctx.save();
  ctx.translate(pt[0], pt[1]);
  ctx.rotate(ang);
  ctx.fillStyle = belt;
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.roundRect(-radius * 1.35, -radius * 0.72, radius * 0.80, radius * 1.44, radius * 0.22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = skin;
  ctx.beginPath();
  if (handPose === 'open') {
    ctx.roundRect(-radius * 0.6, -radius * 0.9, radius * 1.75, radius * 1.8, radius * 0.4);
  } else {
    ctx.roundRect(-radius * 0.6, -radius * 0.82, radius * 1.55, radius * 1.64, radius * 0.45);
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = shade;
  ctx.fillRect(-radius * 0.38, radius * 0.14, radius * 1.12, radius * 0.52);
  ctx.beginPath();
  ctx.moveTo(radius * 0.26, -radius * 0.74);
  ctx.lineTo(radius * 0.26, radius * 0.66);
  ctx.moveTo(radius * 0.56, -radius * 0.64);
  ctx.lineTo(radius * 0.56, radius * 0.60);
  ctx.stroke();
  ctx.restore();
}

function drawBoot(ctx, ankle, sc, belt, shade, lineCol, lw, dir = 1, grounded = true) {
  const w = sc * 0.066;
  const h = sc * 0.044;
  ctx.save();
  ctx.translate(ankle[0], ankle[1]);
  ctx.scale(dir, 1);
  if (grounded) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(w * 0.20, h * 0.82, w * 1.15, h * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = belt;
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(-w * 0.46, -h * 0.92);
  ctx.lineTo(w * 0.42, -h * 0.92);
  ctx.lineTo(w * 0.56, 0);
  ctx.quadraticCurveTo(w * 1.18, h * 0.2, w * 1.10, h * 0.68);
  ctx.lineTo(-w * 0.54, h * 0.68);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = shade;
  ctx.fillRect(-w * 0.48, h * 0.42, w * 1.54, h * 0.22);

  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = lw * 0.85;
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.85);
  ctx.lineTo(w * 0.12, h * 0.56);
  ctx.stroke();
  ctx.restore();
}

function drawCurvedSpike(ctx, bL, bR, tip, fill, shade, rimCol, lineCol, lw, bendX = 0) {
  const mxL = lerp(bL[0], tip[0], 0.5) + bendX;
  const myL = lerp(bL[1], tip[1], 0.45);
  const mxR = lerp(bR[0], tip[0], 0.5) + bendX * 0.7;
  const myR = lerp(bR[1], tip[1], 0.5);

  ctx.beginPath();
  ctx.moveTo(bL[0], bL[1]);
  ctx.quadraticCurveTo(mxL, myL, tip[0], tip[1]);
  ctx.quadraticCurveTo(mxR, myR, bR[0], bR[1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo((bL[0] + bR[0]) * 0.5, (bL[1] + bR[1]) * 0.5);
  ctx.quadraticCurveTo((mxL + mxR) * 0.5, (myL + myR) * 0.5, tip[0], tip[1]);
  ctx.quadraticCurveTo(mxR, myR, bR[0], bR[1]);
  ctx.closePath();
  ctx.fillStyle = shade;
  ctx.fill();
  if (rimCol) {
    ctx.strokeStyle = rimCol;
    ctx.lineWidth = lw * 1.1;
    ctx.beginPath();
    ctx.moveTo(bL[0], bL[1]);
    ctx.quadraticCurveTo(mxL, myL, tip[0], tip[1]);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = lineCol;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(bL[0], bL[1]);
  ctx.quadraticCurveTo(mxL, myL, tip[0], tip[1]);
  ctx.quadraticCurveTo(mxR, myR, bR[0], bR[1]);
  ctx.stroke();
}

function drawDynamicScarf(ctx, P, W, neck, t, intensity, dashVelX, col, shade, lineCol, lw) {
  const topPts = [];
  const botPts = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    const drag = -(0.20 + intensity * 0.14 + Math.min(0.18, Math.abs(dashVelX) * 0.12));
    const sag = 0.24 * (1 - intensity * 0.55) * Math.pow(u, 1.35);
    const waveX = Math.sin(t * (9 + intensity * 12) - u * 4.6) * (0.025 + intensity * 0.045) * u;
    const waveY = Math.cos(t * (7 + intensity * 10) - u * 3.8) * (0.03 + intensity * 0.045) * u;
    const ptTop = P(neck[0] + drag * u + waveX, neck[1] + sag + waveY - lerp(0.032, 0.012, u), neck[2] - u * 0.14);
    const ptBot = P(neck[0] + drag * u + waveX, neck[1] + sag + waveY + lerp(0.032, 0.012, u), neck[2] - u * 0.14);
    // Keep scarf safely inside left frame margin (>= 4% W)
    ptTop[0] = Math.max(W * 0.04, ptTop[0]);
    ptBot[0] = Math.max(W * 0.04, ptBot[0]);
    topPts.push(ptTop);
    botPts.unshift(ptBot);
  }
  const poly = [...topPts, ...botPts];
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1] + 5);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1] + 7);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = lineCol;
  ctx.lineWidth = lw * 0.85;
  ctx.stroke();
}

export function drawAnimeActionFrame(ctx, W, H, poseState) {
  const {
    t = 0,
    crouch = 0,
    squashX = 1.0,
    squashY = 1.0,
    punchExtend = 0,
    lArmAngle = null, // optional custom FK override
    rArmAngle = null,
    dashOffsetX = 0,
    dashVelX = 0,
    twist = 0,
    auraPower = 0.2,
    awakened = false,
    impactFlash = 0,
    shockwave = 0,
    smearArc = 0,
    expression = 'tense', // 'tense' | 'roar' | 'intense'
    mouthShape = 'X',
    backdropMode = 'crater', // 'crater' | 'cosmic'
    poseMode = 'combat',     // 'combat' | 'tidal'
    cam = { dist: 0.95, yawDeg: -14, pitchDeg: -10, rollDeg: 0, offsetX: 0, offsetY: 0 },
    palette = {},
  } = poseState;

  const isImpactBW = impactFlash > 0.5;
  const isCosmic = backdropMode === 'cosmic';
  const isTidal = poseMode === 'tidal';

  const colSkyTop = isImpactBW ? '#060609' : (awakened ? (palette.skyAwakenedTop || '#1f1103') : (palette.skyTop || '#091128'));
  const colSkyBot = isImpactBW ? '#ffffff' : (awakened ? (palette.skyAwakenedBot || '#61340a') : (palette.skyBot || '#233c70'));
  const colGround = isImpactBW ? '#060609' : (palette.ground || '#191b29');

  const P = makeProjector(cam, W, H);
  const horizonY = H * (0.56 - ((cam.pitchDeg || 0) / 45) * 0.14);

  // 1. Backdrop
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0.0, colSkyTop);
  skyGrad.addColorStop(0.60, colSkyBot);
  skyGrad.addColorStop(1.0, colGround);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  if (isCosmic && !isImpactBW) {
    const gCenter = P(dashOffsetX * 0.2, 0.25, -1.2);
    ctx.save();
    // Glowing warped singularity horizon underneath floating character
    const gravGlow = ctx.createRadialGradient(gCenter[0], H * 0.86, 20, gCenter[0], H * 0.86, W * 0.72);
    gravGlow.addColorStop(0.0, 'rgba(251, 146, 60, 0.52)');
    gravGlow.addColorStop(0.45, 'rgba(168, 85, 247, 0.22)');
    gravGlow.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = gravGlow;
    ctx.fillRect(0, 0, W, H);

    for (let ring = 1; ring <= 5; ring++) {
      ctx.strokeStyle = `rgba(251, 146, 60, ${0.24 - ring * 0.035})`;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.ellipse(gCenter[0], H * 0.86, ring * W * 0.22, ring * W * 0.09, t * 0.08, 0, Math.PI * 2);
      ctx.stroke();
    }
    const rStar = makeRng(404);
    for (let s = 0; s < 48; s++) {
      const rx = rStar() * W;
      const ry = ((rStar() + t * 0.65) % 1.0) * H;
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx, ry + 32);
      ctx.stroke();
    }
    ctx.restore();
  } else if (!isImpactBW) {
    ctx.fillStyle = awakened ? '#281508' : '#121b33';
    ctx.beginPath();
    ctx.moveTo(0, horizonY + 8);
    const ridgePts = [0, 0.15, 0.30, 0.46, 0.63, 0.79, 0.93, 1.0];
    const ridgeH = [0.05, 0.14, 0.07, 0.17, 0.09, 0.15, 0.06, 0.04];
    for (let i = 0; i < ridgePts.length; i++) {
      ctx.lineTo(ridgePts[i] * W - (cam.yawDeg || 0) * 1.5, horizonY - ridgeH[i] * H);
    }
    ctx.lineTo(W, horizonY + 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = colGround;
    ctx.fillRect(0, horizonY, W, H - horizonY);
  }

  const auraCol = isImpactBW ? '#ffffff' : (awakened ? (palette.auraAwakened || '#ffcf33') : (palette.auraBase || '#38bdf8'));
  const auraCore = isImpactBW ? '#ffffff' : (awakened ? '#fffbeb' : '#e0f2fe');

  // Ground bounce illumination (only on grounded combat shots)
  const groundCtr = P(dashOffsetX, 0.56, 0);
  if (!isCosmic && auraPower > 0.1 && !isImpactBW) {
    const gp = ctx.createRadialGradient(groundCtr[0], groundCtr[1], 10, groundCtr[0], groundCtr[1], groundCtr[2] * 0.55);
    gp.addColorStop(0.0, awakened ? 'rgba(251, 191, 36, 0.36)' : 'rgba(56, 189, 248, 0.28)');
    gp.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = gp;
    ctx.beginPath();
    ctx.ellipse(groundCtr[0], groundCtr[1], groundCtr[2] * 0.55, groundCtr[2] * 0.20, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Organic Silhouette-Hugging Energy Aura (soft layered halo + flowing side flame tongues, zero picket fence!)
  if (auraPower > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = isImpactBW ? 'source-over' : 'lighter';
    const bodyMid = P(dashOffsetX, 0.05, 0);
    const haloRad = bodyMid[2] * (0.48 + auraPower * 0.22);
    const halo = ctx.createRadialGradient(bodyMid[0], bodyMid[1], haloRad * 0.1, bodyMid[0], bodyMid[1], haloRad);
    halo.addColorStop(0.0, auraCore);
    halo.addColorStop(0.45, auraCol);
    halo.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.globalAlpha = clamp(0.18 + auraPower * 0.26);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(bodyMid[0], bodyMid[1], haloRad * 0.72, haloRad * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Flowing organic flame tongues curving up around shoulders & flanks
    const tongues = awakened ? 9 : 6;
    for (let i = 0; i < tongues; i++) {
      const side = (i / (tongues - 1)) * 2 - 1;
      const anchorX = dashOffsetX + side * (0.14 + Math.abs(side) * 0.14);
      const anchorY = 0.22 + (1 - Math.abs(side)) * 0.28;
      const hT = (0.48 + (1 - Math.abs(side)) * 0.36) * (0.45 + auraPower * 0.65);
      const wT = 0.08 + (1 - Math.abs(side)) * 0.05;
      const curl = Math.sin(t * 7.5 + i * 1.7) * 0.09 + side * 0.06;
      const pL = P(anchorX - wT, anchorY, -0.06);
      const pR = P(anchorX + wT, anchorY, -0.06);
      const pTip = P(anchorX + curl, anchorY - hT, -0.06);
      const fg = ctx.createLinearGradient(pTip[0], pTip[1], (pL[0] + pR[0]) * 0.5, pL[1]);
      fg.addColorStop(0.0, 'rgba(255,255,255,0)');
      fg.addColorStop(0.5, auraCore);
      fg.addColorStop(0.85, auraCol);
      fg.addColorStop(1.0, 'rgba(0,0,0,0)');
      ctx.globalAlpha = clamp(0.16 + auraPower * 0.24);
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(pL[0], pL[1]);
      ctx.quadraticCurveTo(lerp(pL[0], pTip[0], 0.5) - 18, lerp(pL[1], pTip[1], 0.5), pTip[0], pTip[1]);
      ctx.quadraticCurveTo(lerp(pR[0], pTip[0], 0.5) + 18, lerp(pR[1], pTip[1], 0.5), pR[0], pR[1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // 3. Articulated Anime Rig
  const groundFootY = 0.56;
  const pelvisY = (isTidal ? -0.05 : 0.10) + crouch * 0.11;
  const cx = dashOffsetX;
  const leanX = isTidal ? 0 : (punchExtend * 0.05 - crouch * 0.02);

  const skin = isImpactBW ? '#0c0c10' : (palette.skin || '#f2ba91');
  const skinShade = isImpactBW ? '#000000' : (palette.skinShade || '#cd875b');
  const gi = isImpactBW ? '#07070b' : (palette.gi || '#ea580c');
  const giShade = isImpactBW ? '#000000' : (palette.giShade || '#9a3412');
  const belt = isImpactBW ? '#ffffff' : (palette.belt || '#2563eb');
  const beltShade = isImpactBW ? '#cbd5e1' : '#1e3a8a';
  const hairCol = isImpactBW ? '#ffffff' : (awakened ? (palette.hairAwakened || '#fde047') : (palette.hairBase || '#141622'));
  const hairShade = isImpactBW ? '#cbd5e1' : (awakened ? '#ca8a04' : '#06070c');
  const rimCol = isImpactBW ? null : (isCosmic ? '#fdba74' : (awakened ? '#fef08a' : (auraPower > 0.25 ? '#7dd3fc' : null)));
  const lineCol = isImpactBW ? '#ffffff' : '#0a0910';

  const C = (x, y, z = 0) => [cx + x * squashX, pelvisY + (y - pelvisY) * squashY, z];
  const refPt = P(cx, pelvisY, 0);
  const sc = refPt[2];
  const lw = Math.max(2.3, sc * 0.0044);

  const yawCos = Math.max(0.76, Math.abs(Math.cos(twist * 0.72)));
  const hipL3 = C(-0.078 * yawCos + leanX * 0.25, 0.16, 0.03);
  const hipR3 = C(0.078 * yawCos + leanX * 0.25, 0.16, -0.02);

  // Legs: Grounded wide martial stance w/ OUTWARD knee IK (`L: +1`, `R: -1`), OR unpinned dangling tidal stretch!
  let footL3, footR3, kneeL3, kneeR3;
  if (isTidal) {
    const legStretch = 0.52 * squashY;
    footL3 = [hipL3[0] - 0.05 + Math.sin(t * 5.2) * 0.04, hipL3[1] + legStretch, 0.04];
    footR3 = [hipR3[0] + 0.05 - Math.sin(t * 5.2) * 0.04, hipR3[1] + legStretch * 1.04, -0.04];
    kneeL3 = solve2BoneIK(hipL3, footL3, legStretch * 0.54, legStretch * 0.54, 1);
    kneeR3 = solve2BoneIK(hipR3, footR3, legStretch * 0.54, legStretch * 0.54, -1);
  } else {
    footL3 = [cx - 0.19, groundFootY, 0.06];
    footR3 = [cx + 0.18, groundFootY, -0.06];
    kneeL3 = solve2BoneIK(hipL3, footL3, 0.25, 0.24, 1);   // bends LEFT (-X), outward!
    kneeR3 = solve2BoneIK(hipR3, footR3, 0.25, 0.24, -1);  // bends RIGHT (+X), outward!
  }

  const hipL = P(...hipL3), kneeL = P(...kneeL3), footL = P(...footL3);
  const hipR = P(...hipR3), kneeR = P(...kneeR3), footR = P(...footR3);

  // Scarf attached to neck collar
  const neckTop3 = C(leanX * 0.7, -0.22, -0.02);
  drawDynamicScarf(ctx, P, W, neckTop3, t, auraPower + punchExtend * 0.4, dashVelX, belt, beltShade, lineCol, lw);

  // Seamless Pelvis & Legs + Boots
  drawSeamlessLimb(ctx, hipR, kneeR, footR, sc * 0.058, sc * 0.044, sc * 0.032, gi, giShade, rimCol, lineCol, lw);
  drawBoot(ctx, footR, sc, belt, beltShade, lineCol, lw, 1, !isCosmic);

  drawSeamlessLimb(ctx, hipL, kneeL, footL, sc * 0.060, sc * 0.046, sc * 0.033, gi, giShade, rimCol, lineCol, lw);
  drawBoot(ctx, footL, sc, belt, beltShade, lineCol, lw, -1, !isCosmic);

  // Torso coordinates (preserve ribcage width under twist)
  const shL3 = C(-0.145 * yawCos + leanX, -0.17, 0.05 * Math.sin(twist));
  const shR3 = C(0.145 * yawCos + leanX, -0.17, -0.05 * Math.sin(twist));
  const waistL3 = C(-0.092 * yawCos + leanX * 0.35, 0.16, 0.03);
  const waistR3 = C(0.092 * yawCos + leanX * 0.35, 0.16, -0.03);

  const shL = P(...shL3), shR = P(...shR3);
  const wL = P(...waistL3), wR = P(...waistR3);
  const neckBase = P(...C(leanX * 0.65, -0.18, 0.02));
  const headPt = P(...C(leanX * 0.85, -0.29, 0.04));
  const hr = sc * 0.082 * Math.min(1.06, Math.max(0.92, squashX * 0.5 + 0.5));

  // Right Arm (either pulled back cleanly into guard behind hip or flailing upward in tidal mode)
  const rAng1 = rArmAngle !== null ? rArmAngle[0] : (isTidal ? -1.35 + Math.sin(t * 7) * 0.18 : lerp(0.55, 0.85, punchExtend));
  const rAng2 = rArmAngle !== null ? rArmAngle[1] : (isTidal ? -0.35 : lerp(-1.25, -1.65, punchExtend));
  const elbR3 = [shR3[0] + Math.cos(rAng1) * 0.16, shR3[1] + Math.sin(rAng1) * 0.16, shR3[2] - 0.04];
  const fistR3 = [elbR3[0] + Math.cos(rAng1 + rAng2) * 0.15, elbR3[1] + Math.sin(rAng1 + rAng2) * 0.15, elbR3[2] + 0.06];
  const elbR = P(...elbR3), fistR = P(...fistR3);

  // Matching Gi shoulder cap on Right shoulder BEFORE arm
  ctx.fillStyle = gi;
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(shR[0], shR[1], sc * 0.048, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  drawSeamlessLimb(ctx, shR, elbR, fistR, sc * 0.042, sc * 0.034, sc * 0.028, skin, skinShade, rimCol, lineCol, lw);
  drawFist(ctx, fistR, Math.atan2(fistR[1] - elbR[1], fistR[0] - elbR[0]), sc * 0.032, skin, skinShade, belt, lineCol, lw, isTidal ? 'open' : 'fist');

  // Neck cylinder
  capsulePath(ctx, neckBase, [headPt[0], headPt[1] + hr * 0.45], sc * 0.040, sc * 0.035);
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = lw;
  ctx.stroke();

  // Pelvis bridge connecting waist cleanly over hip sockets
  ctx.fillStyle = gi;
  ctx.beginPath();
  ctx.moveTo(wL[0], wL[1]);
  ctx.lineTo(wR[0], wR[1]);
  ctx.lineTo(hipR[0] + sc * 0.04, hipR[1] + sc * 0.04);
  ctx.lineTo((hipL[0] + hipR[0]) * 0.5, hipL[1] + sc * 0.06);
  ctx.lineTo(hipL[0] - sc * 0.04, hipL[1] + sc * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Torso Gi + Undershirt V-neck
  ctx.beginPath();
  ctx.moveTo(shL[0], shL[1]);
  ctx.lineTo(shR[0], shR[1]);
  ctx.lineTo(wR[0], wR[1]);
  ctx.lineTo(wL[0], wL[1]);
  ctx.closePath();
  ctx.fillStyle = gi;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = giShade;
  ctx.beginPath();
  ctx.moveTo((shL[0] + shR[0]) * 0.52, shR[1]);
  ctx.lineTo(shR[0] + 10, shR[1]);
  ctx.lineTo(wR[0] + 10, wR[1]);
  ctx.lineTo((wL[0] + wR[0]) * 0.48, wR[1]);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = lw;
  ctx.stroke();

  const chestV = P(...C(leanX * 0.65, -0.02, 0.06));
  const colL = P(...C(leanX * 0.7 - 0.055 * yawCos, -0.175, 0.05));
  const colR = P(...C(leanX * 0.7 + 0.055 * yawCos, -0.175, 0.02));
  ctx.fillStyle = belt;
  ctx.beginPath();
  ctx.moveTo(colL[0], colL[1]);
  ctx.lineTo(colR[0], colR[1]);
  ctx.lineTo(chestV[0], chestV[1]);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Obi Sash Belt + Knot + Twin Hanging Tails
  const knotX = (wL[0] + wR[0]) * 0.5 + twist * sc * 0.02;
  const knotY = (wL[1] + wR[1]) * 0.5 + sc * 0.02;
  ctx.fillStyle = belt;
  ctx.beginPath();
  ctx.moveTo(wL[0] - 4, wL[1] - 5);
  ctx.lineTo(wR[0] + 4, wR[1] - 5);
  ctx.lineTo(wR[0] + 2, wR[1] + sc * 0.044);
  ctx.lineTo(wL[0] - 2, wL[1] + sc * 0.044);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const tailSwing = Math.sin(t * 9) * sc * 0.02;
  for (const sgn of [-1, 1]) {
    ctx.fillStyle = belt;
    ctx.beginPath();
    ctx.moveTo(knotX, knotY);
    ctx.lineTo(knotX + sgn * sc * 0.042 + tailSwing, knotY + sc * 0.14);
    ctx.lineTo(knotX + sgn * sc * 0.012 + tailSwing, knotY + sc * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = belt;
  ctx.beginPath();
  ctx.roundRect(knotX - sc * 0.022, knotY - sc * 0.022, sc * 0.044, sc * 0.044, 6);
  ctx.fill();
  ctx.stroke();

  // Lead Left Arm (punch slightly down/forward toward viewer-left-to-center so silhouette pops cleanly!)
  const lAng1 = lArmAngle !== null ? lArmAngle[0] : (isTidal ? -1.85 - Math.cos(t * 6.5) * 0.18 : lerp(2.35, 0.15, punchExtend));
  const lAng2 = lArmAngle !== null ? lArmAngle[1] : (isTidal ? 0.35 : lerp(-1.55, 0.06, punchExtend));
  const elbL3 = [shL3[0] + Math.cos(lAng1) * 0.17, shL3[1] + Math.sin(lAng1) * 0.17, shL3[2] + 0.14 * punchExtend];
  const fistL3 = [elbL3[0] + Math.cos(lAng1 + lAng2) * 0.17, elbL3[1] + Math.sin(lAng1 + lAng2) * 0.17, elbL3[2] + 0.18 * punchExtend];
  const elbL = P(...elbL3), fistL = P(...fistL3);

  ctx.fillStyle = gi;
  ctx.strokeStyle = lineCol;
  ctx.beginPath();
  ctx.arc(shL[0], shL[1], sc * 0.050, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  drawSeamlessLimb(ctx, shL, elbL, fistL, sc * 0.044, sc * 0.036, sc * 0.030, skin, skinShade, rimCol, lineCol, lw);
  drawFist(ctx, fistL, Math.atan2(fistL[1] - elbL[1], fistL[0] - elbL[0]), sc * 0.035, skin, skinShade, belt, lineCol, lw, isTidal ? 'open' : 'fist');

  // Head + Ears + Cranial Hair Dome + Fierce V-Brows + Gritted/Roar Mouth
  const jawDrop = (expression === 'roar' || mouthShape === 'D') ? hr * 0.20 : 0;
  for (const sgn of [-1, 1]) {
    ctx.fillStyle = skinShade;
    ctx.beginPath();
    ctx.ellipse(headPt[0] + sgn * hr * 0.88, headPt[1] + hr * 0.06, hr * 0.16, hr * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(headPt[0] - hr * 0.84, headPt[1] - hr * 0.56);
  ctx.lineTo(headPt[0] + hr * 0.84, headPt[1] - hr * 0.56);
  ctx.quadraticCurveTo(headPt[0] + hr * 0.82, headPt[1] + hr * 0.48, headPt[0], headPt[1] + hr * 1.05 + jawDrop);
  ctx.quadraticCurveTo(headPt[0] - hr * 0.82, headPt[1] + hr * 0.48, headPt[0] - hr * 0.84, headPt[1] - hr * 0.56);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Base cranial hair mass
  ctx.fillStyle = hairCol;
  ctx.beginPath();
  ctx.ellipse(headPt[0], headPt[1] - hr * 0.62, hr * 0.90, hr * 0.42, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const eyeCol = isImpactBW ? '#ffffff' : (awakened ? '#10b981' : '#0f172a');
  for (const side of [-1, 1]) {
    const ex = headPt[0] + side * hr * 0.34;
    const ey = headPt[1] - hr * 0.04;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(ex - side * hr * 0.25, ey - hr * 0.11);
    ctx.lineTo(ex + side * hr * 0.22, ey - hr * 0.04);
    ctx.lineTo(ex + side * hr * 0.16, ey + hr * 0.12);
    ctx.lineTo(ex - side * hr * 0.21, ey + hr * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();

    ctx.fillStyle = eyeCol;
    ctx.beginPath();
    ctx.arc(ex + side * hr * 0.02, ey + hr * 0.02, hr * 0.085, 0, Math.PI * 2);
    ctx.fill();

    // Fierce angry V-brows: inner end near bridge sits LOWER than outer brow!
    ctx.strokeStyle = hairCol;
    ctx.lineWidth = lw * 1.3;
    ctx.beginPath();
    ctx.moveTo(ex - side * hr * 0.28, ey - hr * 0.11); // inner end (lower)
    ctx.lineTo(ex + side * hr * 0.28, ey - hr * 0.26); // outer wing (higher!)
    ctx.stroke();
  }

  ctx.strokeStyle = skinShade;
  ctx.lineWidth = lw * 0.85;
  ctx.beginPath();
  ctx.moveTo(headPt[0], headPt[1] + hr * 0.14);
  ctx.lineTo(headPt[0] - hr * 0.06, headPt[1] + hr * 0.28);
  ctx.lineTo(headPt[0] + hr * 0.04, headPt[1] + hr * 0.30);
  ctx.stroke();

  // Fierce mouths: roaring shout OR gritted clenched teeth (never calm combat smile!)
  const mx = headPt[0], my = headPt[1] + hr * 0.58 + jawDrop * 0.35;
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = lw * 0.75;
  if (expression === 'roar' || mouthShape === 'D' || mouthShape === 'C') {
    ctx.fillStyle = '#4c0d18';
    ctx.beginPath();
    ctx.ellipse(mx, my, hr * 0.28, hr * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(mx - hr * 0.17, my - hr * 0.17, hr * 0.34, hr * 0.07);
  } else {
    // Gritted determined clenched jaw
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(mx - hr * 0.23, my - hr * 0.07, hr * 0.46, hr * 0.14, 4);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx - hr * 0.20, my);
    ctx.lineTo(mx + hr * 0.20, my);
    ctx.stroke();
  }

  // Asymmetric spiky anime hair
  const hLift = awakened ? 1.38 : 1.0;
  const spikes = [
    [-0.92, -0.46, -2.02, -0.84 * hLift, -0.45, -0.90],
    [-0.64, -0.76, -1.58, -1.62 * hLift, -0.10, -1.04],
    [-0.24, -0.92, -0.22, -2.14 * hLift, 0.24, -0.92],
    [0.10, -1.04, 1.58, -1.64 * hLift, 0.64, -0.76],
    [0.45, -0.90, 2.02, -0.88 * hLift, 0.92, -0.46],
  ];
  for (let i = 0; i < spikes.length; i++) {
    const [x1, y1, tx, ty, x2, y2] = spikes[i];
    const sw = Math.sin(t * 14 + i * 1.35) * auraPower * hr * 0.16;
    drawCurvedSpike(
      ctx,
      [headPt[0] + x1 * hr, headPt[1] + y1 * hr],
      [headPt[0] + x2 * hr, headPt[1] + y2 * hr],
      [headPt[0] + tx * hr + sw, headPt[1] + ty * hr],
      hairCol, hairShade, rimCol, lineCol, lw, sw * 0.4
    );
  }
  drawCurvedSpike(ctx, [headPt[0] - hr * 0.48, headPt[1] - hr * 0.62], [headPt[0] - hr * 0.10, headPt[1] - hr * 0.62], [headPt[0] - hr * 0.24 + Math.sin(t * 11) * hr * 0.05, headPt[1] - hr * 0.12], hairCol, hairShade, rimCol, lineCol, lw * 0.8, hr * 0.10);
  drawCurvedSpike(ctx, [headPt[0] - hr * 0.08, headPt[1] - hr * 0.62], [headPt[0] + hr * 0.34, headPt[1] - hr * 0.62], [headPt[0] + hr * 0.20 - Math.sin(t * 12) * hr * 0.05, headPt[1] - hr * 0.06], hairCol, hairShade, rimCol, lineCol, lw * 0.8, -hr * 0.08);

  // 4. Motion-Swept Crescent Punch Smear + Lightning + Shockwave
  if (smearArc > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = awakened ? `rgba(254, 240, 138, ${0.72 * smearArc})` : `rgba(125, 211, 252, ${0.72 * smearArc})`;
    ctx.beginPath();
    ctx.moveTo(shL[0], shL[1]);
    ctx.quadraticCurveTo(elbL[0] + 24, elbL[1] - sc * 0.16, fistL[0] + 45, fistL[1] + 8);
    ctx.quadraticCurveTo(elbL[0] - 12, elbL[1] + sc * 0.06, shL[0], shL[1] + 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (auraPower > 0.35 || awakened) {
    const rB = makeRng(Math.floor(t * 14) * 997 + 19);
    ctx.save();
    for (let b = 0; b < (awakened ? 4 : 2); b++) {
      let bx = dashOffsetX + (rB() - 0.5) * 0.78;
      let by = -0.35 + rB() * 0.75;
      ctx.beginPath();
      const sPt = P(bx, by, 0.16);
      ctx.moveTo(sPt[0], sPt[1]);
      for (let s = 0; s < 5; s++) {
        bx += (rB() - 0.5) * 0.22;
        by += (rB() - 0.45) * 0.18;
        const nPt = P(bx, by, 0.16);
        ctx.lineTo(nPt[0], nPt[1]);
      }
      ctx.strokeStyle = isImpactBW ? '#ffffff' : 'rgba(125, 211, 252, 0.90)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  if (shockwave > 0.01 && shockwave < 0.99) {
    ctx.save();
    ctx.strokeStyle = isImpactBW ? '#ffffff' : `rgba(253, 224, 71, ${1 - shockwave})`;
    ctx.lineWidth = (18 * (W / 720)) * (1 - shockwave);
    ctx.beginPath();
    ctx.arc(fistL[0], fistL[1], 70 + shockwave * W * 0.95, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (!isImpactBW) {
    const vig = ctx.createRadialGradient(W * 0.5, H * 0.48, W * 0.25, W * 0.5, H * 0.5, H * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(2,4,12,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }
}
