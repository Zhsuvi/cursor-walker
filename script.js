const canvas = document.querySelector('#scene');
const ctx = canvas.getContext('2d');
const texture = document.createElement('canvas');
const textureCtx = texture.getContext('2d');
let width = 0;
let height = 0;
let dpr = Math.min(devicePixelRatio || 1, 2);
let walkers = [];
let last = performance.now();
let lastTextureUpdate = 0;
let glitchEnergy = 0;

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  texture.width = canvas.width;
  texture.height = canvas.height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  textureCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawTexture();
}
addEventListener('resize', resize);
resize();

function drawTexture() {
  textureCtx.fillStyle = '#087aba';
  textureCtx.fillRect(0, 0, width, height);
  const bands = 14;
  for (let i = 0; i < bands; i++) {
    const y = Math.random() * height;
    const h = 24 + Math.random() * 72;
    const alpha = 0.018 + Math.random() * 0.028;
    textureCtx.fillStyle = `rgba(${Math.random() > .55 ? '181,234,255' : '0,36,99'},${alpha})`;
    textureCtx.fillRect(0, y, width, h);
  }
  const count = Math.ceil(width * height / 180);
  for (let i = 0; i < count; i++) {
    const s = Math.random() < .85 ? 1 : 2;
    const a = 0.025 + Math.random() * 0.065;
    textureCtx.fillStyle = Math.random() < .62 ? `rgba(230,255,255,${a})` : `rgba(0,31,84,${a})`;
    textureCtx.fillRect(Math.random() * width, Math.random() * height, s, s);
  }
}

function capsule(a, b, radius) {
  const t = Math.random();
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const offset = (Math.random() * 2 - 1) * radius * Math.sqrt(Math.random());
  return { x: x - (b.y - a.y) / length * offset, y: y + (b.x - a.x) / length * offset };
}

function buildHuman() {
  const particles = [];
  const add = (p, boost = 0) => {
    const rightDensity = Math.max(.2, Math.min(1, .32 + ((p.x + 145) / 310) * .68 + boost));
    if (Math.random() < rightDensity) particles.push({ ...p, scale: .54 + Math.random() * .3 });
  };
  const fill = (sampler, count, boost = 0) => {
    let attempts = 0;
    const start = particles.length;
    while (particles.length - start < count && attempts++ < count * 18) add(sampler(), boost);
  };

  // 头、躯干、双臂、双腿：组成饱满的奔跑人物外轮廓。
  fill(() => {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 28;
    return { x: 19 + Math.cos(angle) * r, y: -214 + Math.sin(angle) * r };
  }, 28, .06);
  fill(() => {
    const y = -184 + Math.random() * 104;
    const progress = (y + 184) / 104;
    const half = 28 + progress * 15;
    return { x: 7 + (Math.random() * 2 - 1) * half, y };
  }, 78, .12);
  fill(() => capsule({ x: -8, y: -166 }, { x: -132, y: -136 }, 19), 34);
  fill(() => capsule({ x: 35, y: -154 }, { x: 126, y: -130 }, 18), 50, .1);
  fill(() => capsule({ x: 0, y: -84 }, { x: -123, y: -17 }, 24), 42);
  fill(() => capsule({ x: 25, y: -80 }, { x: 140, y: -4 }, 28), 62, .12);

  // 额外叠加填充：右侧自然比左侧更密，保留左侧稀疏的流动感。
  const regions = [
    () => capsule({ x: -8, y: -166 }, { x: -132, y: -136 }, 19),
    () => capsule({ x: 35, y: -154 }, { x: 126, y: -130 }, 18),
    () => capsule({ x: 0, y: -84 }, { x: -123, y: -17 }, 24),
    () => capsule({ x: 25, y: -80 }, { x: 140, y: -4 }, 28),
    () => ({ x: -24 + Math.random() * 70, y: -184 + Math.random() * 105 })
  ];
  for (let i = 0; i < 115; i++) add(regions[Math.floor(Math.random() * regions.length)](), .08);
  return particles;
}

function cursor(p, opacity) {
  const s = 28 * p.scale;
  ctx.save();
  ctx.translate(p.x, p.y);
  // 箭头朝左，形成逆向流动感。
  ctx.rotate(-Math.PI / 4);
  ctx.scale(s / 30, s / 30);
  ctx.globalAlpha = opacity;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = '#07192b';
  ctx.fillStyle = '#f6f3e8';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 26);
  ctx.lineTo(6.8, 19.8);
  ctx.lineTo(12.3, 30);
  ctx.lineTo(18, 27.3);
  ctx.lineTo(12.1, 16.8);
  ctx.lineTo(24, 16.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function makeWalker(x, y) {
  const startX = Math.max(48, Math.min(width - 72, x));
  walkers.push({ x: startX, startX, y: Math.max(250, Math.min(height - 16, y)), age: 0, duration: 5200 + Math.random() * 900, scale: Math.max(.75, Math.min(1.25, height / 760)), seed: Math.random() * 10, particles: buildHuman() });
  glitchEnergy = 1;
}

function glitchOverlay(energy) {
  if (energy < .04) return;
  const flashes = 2 + Math.floor(energy * 6);
  for (let i = 0; i < flashes; i++) {
    const y = Math.random() * height;
    const h = 1 + Math.random() * (3 + energy * 15);
    const offset = (Math.random() - .5) * 32 * energy;
    ctx.fillStyle = Math.random() > .55 ? `rgba(235,130,255,${.025 * energy})` : `rgba(210,255,255,${.045 * energy})`;
    ctx.fillRect(offset, y, width, h);
  }
}

function animate(now) {
  const dt = Math.min(48, now - last);
  last = now;
  glitchEnergy = Math.max(0, glitchEnergy - dt / 1700);
  const textureInterval = glitchEnergy > .04 ? 85 : 1100;
  if (now - lastTextureUpdate > textureInterval) {
    drawTexture();
    lastTextureUpdate = now;
  }
  ctx.drawImage(texture, 0, 0, width, height);
  glitchOverlay(glitchEnergy);
  walkers = walkers.filter(w => {
    w.age += dt;
    const travel = Math.max(0, Math.min(1, (w.age - 850) / (w.duration - 850)));
    w.x = w.startX - (w.startX + 140) * travel;
    const fadeIn = Math.min(1, w.age / 900);
    const fadeOut = Math.min(1, Math.max(0, (w.duration - w.age) / 650));
    const life = (fadeIn * fadeIn * (3 - 2 * fadeIn)) * fadeOut;
    const bob = Math.sin(w.age / 170 + w.seed) * 3;
    // 向左行走时，拖影留在人物右侧并逐层淡去。
    for (let trail = 4; trail >= 1; trail--) {
      const offset = trail * 18;
      w.particles.forEach((p, i) => {
        if ((i + trail) % 2) return;
        cursor({
          x: w.x + offset + p.x * w.scale,
          y: w.y + p.y * w.scale + bob,
          scale: p.scale * w.scale
        }, life * (.035 + (4 - trail) * .022));
      });
    }
    w.particles.forEach((p, i) => cursor({
      x: w.x + p.x * w.scale,
      y: w.y + p.y * w.scale + bob,
      scale: p.scale * w.scale
    }, life * (.72 + (i % 5) * .045)));
    return w.age < w.duration;
  });
  requestAnimationFrame(animate);
}
canvas.addEventListener('pointerdown', event => makeWalker(event.clientX, event.clientY));
requestAnimationFrame(animate);
