// Crisp 1080x1920 Canvas2D broadcast HUD overlay with top contrast scrim,
// YouTube Shorts right-rail safe bounds (12.5% right margin), auto-sized stat card, and clean fadeOut.

export function drawTelemetryHUD(ctx, W, H, state = {}) {
  const {
    badge = '',
    title = '',
    subtitle = '',
    statLabel = '',
    statValue = '',
    progress = 0,
    accent = '#38bdf8',
    warn = '#f97316',
    callout = null, // { x, y, tx, ty, label, value }
    t = 0,
    fadeIn = 1,
    fadeOut = 1,
  } = state;

  const alpha = Math.max(0, Math.min(1, fadeIn)) * Math.max(0, Math.min(1, fadeOut));
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  const padL = Math.round(W * 0.068);
  const padR = Math.round(W * 0.125); // matches YouTube Shorts right-rail safety margin
  const topY = Math.round(H * 0.072);

  // Protective top contrast scrim
  const scrim = ctx.createLinearGradient(0, 0, 0, H * 0.27);
  scrim.addColorStop(0.0, 'rgba(4, 8, 20, 0.86)');
  scrim.addColorStop(0.60, 'rgba(4, 8, 20, 0.50)');
  scrim.addColorStop(1.0, 'rgba(4, 8, 20, 0.0)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H * 0.27);

  // Subtle corner technical ticks
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.30)';
  ctx.lineWidth = Math.max(2, W * 0.0022);
  const bLen = Math.round(W * 0.032);
  ctx.beginPath();
  ctx.moveTo(padL - 16, topY - 16 + bLen); ctx.lineTo(padL - 16, topY - 16); ctx.lineTo(padL - 16 + bLen, topY - 16);
  ctx.moveTo(W - padR + 16 - bLen, topY - 16); ctx.lineTo(W - padR + 16, topY - 16); ctx.lineTo(W - padR + 16, topY - 16 + bLen);
  ctx.stroke();

  if (badge) {
    ctx.font = `700 ${Math.round(W * 0.022)}px "Segoe UI", Arial, sans-serif`;
    const bw = ctx.measureText(badge).width + Math.round(W * 0.044);
    const bh = Math.round(H * 0.024);
    ctx.fillStyle = 'rgba(8, 15, 34, 0.88)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(padL, topY, bw, bh, bh / 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, padL + Math.round(W * 0.022), topY + bh * 0.53);
  }

  if (title) {
    const titleY = topY + Math.round(H * 0.042);
    ctx.font = `900 ${Math.round(W * 0.052)}px "Segoe UI", Arial, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.fillText(title, padL + 2, titleY + 3);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(title, padL, titleY);
  }

  if (subtitle) {
    const subY = topY + Math.round(H * 0.082);
    ctx.font = `600 ${Math.round(W * 0.024)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(subtitle, padL, subY);
  }

  if (statLabel && statValue) {
    ctx.font = `700 ${Math.round(W * 0.018)}px "Segoe UI", Arial, sans-serif`;
    const lw = ctx.measureText(statLabel).width;
    ctx.font = `800 ${Math.round(W * 0.034)}px "Segoe UI", Arial, sans-serif`;
    const vw = ctx.measureText(statValue).width;
    const boxW = Math.min(Math.round(W * 0.38), Math.max(Math.round(W * 0.24), Math.round(Math.max(lw, vw) + 46)));
    const boxH = Math.round(H * 0.064);
    const bx = W - padR - boxW;
    const by = topY + Math.round(H * 0.118);

    ctx.fillStyle = 'rgba(6, 11, 24, 0.88)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = warn;
    ctx.fillRect(bx, by + 12, 6, boxH - 24);

    ctx.textBaseline = 'top';
    ctx.font = `700 ${Math.round(W * 0.018)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(statLabel, bx + 20, by + 13);

    ctx.font = `800 ${Math.round(W * 0.034)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(statValue, bx + 20, by + 40);
  }

  if (callout) {
    const { x, y, tx, ty, label, value } = callout;
    ctx.font = `800 ${Math.round(W * 0.022)}px "Segoe UI", Arial, sans-serif`;
    const cw = Math.max(Math.round(W * 0.27), Math.round(ctx.measureText(value).width + 32));
    const ch = Math.round(H * 0.048);
    const rx = Math.max(padL, Math.min(W - padR - cw, x < W * 0.5 ? x - cw : x));
    const clampedY = Math.max(H * 0.25, Math.min(H * 0.72, y));
    const anchorX = tx < rx ? rx : rx + cw;
    const pulse = 1 + Math.sin(t * 9) * 0.15;

    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(tx, ty, 9 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo((tx + anchorX) * 0.5, clampedY);
    ctx.lineTo(anchorX, clampedY);
    ctx.stroke();

    ctx.fillStyle = 'rgba(6, 11, 24, 0.90)';
    ctx.beginPath();
    ctx.roundRect(rx, clampedY - ch * 0.5, cw, ch, 10);
    ctx.fill();
    ctx.stroke();

    ctx.textBaseline = 'top';
    ctx.font = `700 ${Math.round(W * 0.017)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = accent;
    ctx.fillText(label, rx + 14, clampedY - ch * 0.5 + 10);
    ctx.font = `800 ${Math.round(W * 0.022)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(value, rx + 14, clampedY - ch * 0.5 + 34);
  }

  if (progress > 0) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.24)';
    ctx.fillRect(padL, H * 0.042, W - padL - padR, 5);
    const g = ctx.createLinearGradient(padL, 0, W - padR, 0);
    g.addColorStop(0, accent);
    g.addColorStop(1, warn);
    ctx.fillStyle = g;
    ctx.fillRect(padL, H * 0.042, (W - padL - padR) * Math.min(1, progress), 5);
  }

  ctx.restore();
}
