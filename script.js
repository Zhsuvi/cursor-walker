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
  const skyHeight = height * .75;
  textureCtx.save();
  textureCtx.setTransform(1, 0, 0, 1, 0, 0);
  textureCtx.clearRect(0, 0, texture.width, texture.height);
  textureCtx.restore();
  textureCtx.fillStyle = '#087aba';
  textureCtx.fillRect(0, 0, width, skyHeight);
  const bands = 14;
  for (let i = 0; i < bands; i++) {
    const y = Math.random() * skyHeight;
    const h = 24 + Math.random() * 72;
    const alpha = 0.018 + Math.random() * 0.028;
    textureCtx.fillStyle = `rgba(${Math.random() > .55 ? '181,234,255' : '0,36,99'},${alpha})`;
    textureCtx.fillRect(0, y, width, h);
  }
  const count = Math.ceil(width * skyHeight / 180);
  for (let i = 0; i < count; i++) {
    const s = Math.random() < .85 ? 1 : 2;
    const a = 0.025 + Math.random() * 0.065;
    textureCtx.fillStyle = Math.random() < .62 ? `rgba(230,255,255,${a})` : `rgba(0,31,84,${a})`;
    textureCtx.fillRect(Math.random() * width, Math.random() * skyHeight, s, s);
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

function buildHuman(density = 1) {
  const particles = [];
  const add = (p, boost = 0, part = 'torso') => {
    const leftDensity = Math.max(.2, Math.min(1, .32 + ((145 - p.x) / 310) * .68 + boost));
    if (Math.random() < leftDensity) particles.push({
      ...p,
      part,
      scale: .54 + Math.random() * .3,
      flowX: (Math.random() * 2 - 1),
      flowY: (Math.random() * 2 - 1)
    });
  };
  const fill = (sampler, count, boost = 0, part = 'torso') => {
    let attempts = 0;
    const start = particles.length;
    const target = Math.max(1, Math.round(count * density));
    while (particles.length - start < target && attempts++ < target * 18) add(sampler(), boost, part);
  };

  // 头、躯干、双臂、双腿：组成饱满的奔跑人物外轮廓。
  fill(() => {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 28;
    return { x: 19 + Math.cos(angle) * r, y: -214 + Math.sin(angle) * r };
  }, 112, .06, 'head');
  fill(() => {
    const y = -184 + Math.random() * 104;
    const progress = (y + 184) / 104;
    const half = 28 + progress * 15;
    // 躯干左侧密度更高，形成清晰的左重右轻剪影。
    return { x: Math.random() < .72 ? -Math.random() * half : Math.random() * half * .55, y };
  }, 78, .12, 'torso');
  // 双臂减少箭头并拉长为更纤细的线性轮廓。
  fill(() => capsule({ x: -8, y: -166 }, { x: -146, y: -136 }, 9), 38, 0, 'armLeft');
  fill(() => capsule({ x: 35, y: -154 }, { x: 138, y: -130 }, 8), 7, .1, 'armRight');
  // 延长下方两组腿部箭头，让人物比例更修长。
  fill(() => capsule({ x: 0, y: -80 }, { x: -65, y: 66 }, 24), 96, 0, 'legLeft');
  // 右腿从形成时就明显更稀疏，后续再由左腿迁移的箭头补充并消耗。
  fill(() => capsule({ x: 25, y: -80 }, { x: 70, y: 72 }, 28), 8, .12, 'legRight');

  // 额外叠加填充：右侧自然比左侧更密，保留左侧稀疏的流动感。
  const regions = [
    { part: 'armLeft', make: () => capsule({ x: -8, y: -166 }, { x: -146, y: -136 }, 9) },
    { part: 'armRight', make: () => capsule({ x: 35, y: -154 }, { x: 138, y: -130 }, 8) },
    { part: 'legLeft', make: () => capsule({ x: 0, y: -80 }, { x: -65, y: 66 }, 24) },
    { part: 'legRight', make: () => capsule({ x: 25, y: -80 }, { x: 70, y: 72 }, 28) },
    { part: 'torso', make: () => ({ x: -24 + Math.random() * 70, y: -184 + Math.random() * 105 }) }
  ];
  for (let i = 0; i < Math.round(115 * density); i++) {
    const roll = Math.random();
    const region = roll < .22 ? regions[0] : roll < .28 ? regions[1] : roll < .60 ? regions[2] : roll < .64 ? regions[3] : regions[4];
    add(region.make(), .08, region.part);
  }
  return particles;
}

function rotateAround(p, pivot, radians) {
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { ...p, x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
}

// 只移动已经组成肢体的箭头群，让抽象轮廓保持完整而像人在行走。
function poseParticle(p, phase) {
  const stride = Math.sin(phase);
  if (p.part === 'armLeft') {
    const pivot = { x: -8, y: -166 };
    return rotateAround(p, pivot, -stride * .28);
  }
  if (p.part === 'armRight') {
    const pivot = { x: 35, y: -154 };
    return rotateAround(p, pivot, stride * .28);
  }
  if (p.part === 'legLeft') {
    // 左腿在右腿跨出时回收到屏幕右侧；下一拍再抬起、曲膝并跨到左侧。
    const posed = rotateAround(p, { x: 0, y: -80 }, -stride * .12);
    const foot = Math.max(0, (p.y + 80) / 152);
    const lift = Math.max(0, -stride);
    const knee = Math.sin(Math.PI * Math.min(1, foot));
    return {
      ...posed,
      // 位置整体向右回收；左腿抬起时，膝盖再向前（屏幕左侧）送出。
      x: posed.x + stride * foot * 44 - lift * knee * 13,
      y: posed.y - lift * knee * 42
    };
  }
  if (p.part === 'legRight') {
    // 右腿为第一拍的前腿：抬起、曲膝后从右侧跨到屏幕左侧。
    const posed = rotateAround(p, { x: 25, y: -80 }, stride * .12);
    const foot = Math.max(0, (p.y + 80) / 152);
    const lift = Math.max(0, stride);
    const knee = Math.sin(Math.PI * Math.min(1, foot));
    return {
      ...posed,
      x: posed.x - stride * foot * 44 - lift * knee * 13,
      y: posed.y - lift * knee * 42
    };
  }
  if (p.part === 'torso') return { ...p, x: p.x + Math.sin(phase) * 1.5, y: p.y + Math.cos(phase * 2) * 1.2 };
  return p;
}

function cursor(p, opacity) {
  const s = 28 * p.scale;
  ctx.save();
  ctx.translate(p.x, p.y);
  // 箭头朝左，形成逆向流动感。
  ctx.rotate(-Math.PI / 4 + (p.rotation || 0));
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

// 迁移会移除箭头原来的归属：它只会到达新部位，不会回到来源。
function migrateParticle(p, phase, part, x, y, age) {
  const from = poseParticle(p, phase);
  p.part = part;
  p.x = x;
  p.y = y;
  p.migration = { from, started: age };
}

function makeWalker(x, y) {
  const startX = Math.max(48, Math.min(width - 72, x));
  // 每个人只改变整体高度与箭头数量；骨架比例、步幅和行走节奏完全共用。
  const size = .56 + Math.random() * .58;
  const density = .20 + size * .70;
  walkers.push({ x: startX, startX, y: Math.max(250, Math.min(height - 16, y)), age: 0, duration: 5200 + Math.random() * 900, scale: Math.max(.75, Math.min(1.25, height / 760)) * size, seed: Math.random() * 10, particles: buildHuman(density), overlapActive: false, armScatterActive: false, leftArmMigrationActive: false, headMigrationActive: false, nextDissipation: 1150, dissipationIndex: 0, scatterBursts: [] });
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
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  ctx.drawImage(texture, 0, 0, width, height);
  glitchOverlay(glitchEnergy);
  walkers = walkers.filter(w => {
    w.age += dt;
    const travel = Math.max(0, Math.min(1, (w.age - 850) / (w.duration - 850)));
    w.x = w.startX - (w.startX + 140) * travel;
    const fadeIn = Math.min(1, w.age / 900);
    const fadeOut = Math.min(1, Math.max(0, (w.duration - w.age) / 650));
    const life = (fadeIn * fadeIn * (3 - 2 * fadeIn)) * fadeOut;
    const phase = w.age / 175 + w.seed;
    const bob = Math.cos(phase * 2) * 3;

    // 人物一出现就进入持续消耗：每隔一小段时间，真实的本体箭头会从各部位脱离，
    // 使人形从饱满开始逐步变稀，而不是始终维持固定数量。
    if (w.age >= w.nextDissipation) {
      const available = w.particles.filter(p => !p.scatter && !p.migration);
      // 每一轮同时消耗多个本体箭头，令掉落更明显。
      for (let i = 0; i < 3 && available.length; i++) {
        const p = available[(w.dissipationIndex + i * 13) % available.length];
        const posed = poseParticle(p, phase);
        p.scatter = {
          x: w.x + posed.x * w.scale,
          y: w.y + posed.y * w.scale + bob,
          scale: posed.scale * w.scale,
          dx: 30 + Math.abs(p.flowX) * 38,
          dy: p.flowY * 40 - 8,
          rotation: p.flowX * 1.15,
          age: 0
        };
      }
      w.dissipationIndex += 17;
      w.nextDissipation += 280;
    }
    // 前腿最后绘制以强调前后关系；交叉时两腿都保持实心，不改变透明度。
    // 右腿先成为左侧前腿；半拍后轮到左腿成为前腿。
    const frontLeg = Math.sin(phase) >= 0 ? 'legRight' : 'legLeft';
    const backLeg = frontLeg === 'legLeft' ? 'legRight' : 'legLeft';
    const overlap = Math.pow(Math.abs(Math.sin(phase)), 2);
    // 只有两腿进入明显交叠区，箭头才开始发生位置转移。
    const transfer = Math.max(0, (overlap - .58) / .42);
    let backParticles = w.particles.filter(p => p.part === backLeg);

    // 只有后腿从前方回摆到人物后方时，才产生一次向屏幕右侧的惯性散落。
    if (transfer > .02 && !w.overlapActive) {
      w.overlapActive = true;
      // 左腿的真实箭头单向进入右腿：位置完成迁移后只归属右腿，不会回到左腿。
      w.particles.filter(p => p.part === 'legLeft' && !p.migrated && !p.scatter).forEach((p, i) => {
        if (i % 8) return;
        const from = poseParticle(p, phase);
        const foot = Math.max(0, (p.y + 80) / 152);
        p.x += 30 + foot * 92;
        p.part = 'legRight';
        p.migrated = true;
        p.migration = { from, started: w.age };
      });

      backParticles = w.particles.filter(p => p.part === backLeg);
      // 只有已迁入右腿、并且右腿成为后腿时，才从右腿本体中散落并被消耗。
      if (backLeg === 'legRight') {
        backParticles.filter(p => p.migrated && !p.migration && !p.scatter).forEach((p, i) => {
          if (i % 3) return;
          const posed = poseParticle(p, phase);
          p.scatter = {
            x: w.x + posed.x * w.scale,
            y: w.y + posed.y * w.scale + bob,
            scale: posed.scale * w.scale,
            dx: 72 + Math.abs(p.flowX) * 56,
            dy: p.flowY * 44,
            rotation: p.flowX * 1.45,
            age: 0
          };
        });
      }

      // 重心切换时，躯干也有少量本体箭头向后脱离并被消耗。
      w.particles.filter(p => p.part === 'torso' && !p.scatter).forEach((p, i) => {
        if (i % 22) return;
        const posed = poseParticle(p, phase);
        p.scatter = {
          x: w.x + posed.x * w.scale,
          y: w.y + posed.y * w.scale + bob,
          scale: posed.scale * w.scale,
          dx: 44 + Math.abs(p.flowX) * 36,
          dy: p.flowY * 36,
          rotation: p.flowX * .9,
          age: 0
        };
      });
    }
    if (transfer <= .02) w.overlapActive = false;

    // 左手回摆时，手部末端的箭头被躯干吸收，原手臂轮廓随之变稀。
    const leftHandReturns = Math.max(0, Math.sin(phase));
    if (leftHandReturns > .76 && !w.leftArmMigrationActive) {
      w.leftArmMigrationActive = true;
      w.particles.filter(p => p.part === 'armLeft' && p.x < -62 && !p.scatter && !p.migration).forEach((p, i) => {
        if (i % 9) return;
        migrateParticle(p, phase, 'torso', -14 + p.flowX * 26, -142 + p.flowY * 38, w.age);
      });
    }
    if (leftHandReturns < .55) w.leftArmMigrationActive = false;

    // 头部高密度箭头受动作重力牵引，逐步向躯干和两侧手臂分流。
    const gravityPull = Math.max(0, -Math.sin(phase));
    if (gravityPull > .76 && !w.headMigrationActive) {
      w.headMigrationActive = true;
      w.particles.filter(p => p.part === 'head' && !p.scatter && !p.migration).forEach((p, i) => {
        if (i % 14) return;
        if (i % 3 === 0) {
          migrateParticle(p, phase, 'armRight', 45 + Math.abs(p.flowX) * 58, -150 + p.flowY * 16, w.age);
        } else if (i % 3 === 1) {
          migrateParticle(p, phase, 'armLeft', -34 - Math.abs(p.flowX) * 82, -160 + p.flowY * 16, w.age);
        } else {
          migrateParticle(p, phase, 'torso', -10 + p.flowX * 28, -144 + p.flowY * 42, w.age);
        }
      });
    }
    if (gravityPull < .55) w.headMigrationActive = false;

    // 右手与头部右侧的真实箭头在后摆时少量脱离并被消耗。
    const rightArmBack = Math.max(0, Math.sin(phase));
    if (rightArmBack > .76 && !w.armScatterActive) {
      w.armScatterActive = true;
      w.particles.filter(p => p.part === 'armRight' && !p.scatter).forEach((p, i) => {
        if (i % 10) return;
        const posed = poseParticle(p, phase);
        p.scatter = {
          x: w.x + posed.x * w.scale,
          y: w.y + posed.y * w.scale + bob,
          scale: posed.scale * w.scale,
          dx: 40 + Math.abs(p.flowX) * 28,
          dy: p.flowY * 26,
          rotation: p.flowX * 1.1,
          age: 0
        };
      });
    }
    if (rightArmBack < .55) w.armScatterActive = false;

    // 所有本体箭头脱离整体后飘移 0.6 秒并被删除，整体数量随之减少。
    w.particles = w.particles.filter(p => {
      if (!p.scatter) return true;
      p.scatter.age += dt;
      const progress = p.scatter.age / 600;
      if (progress >= 1) return false;
      cursor({
        x: p.scatter.x + p.scatter.dx * progress,
        y: p.scatter.y + p.scatter.dy * progress,
        scale: p.scatter.scale,
        rotation: p.scatter.rotation * progress
      }, life * (1 - progress));
      return true;
    });

    const orderedParticles = [...w.particles].sort((a, b) => {
      const layer = p => p.part === frontLeg ? 2 : p.part === backLeg ? 1 : 0;
      return layer(a) - layer(b);
    });
    orderedParticles.forEach((p, i) => {
      if (p.scatter) return;
      let posed = poseParticle(p, phase);
      let opacity = life * (.72 + (i % 5) * .045);

      if (p.migration) {
        const migration = Math.min(1, (w.age - p.migration.started) / 260);
        posed = {
          ...posed,
          x: p.migration.from.x + (posed.x - p.migration.from.x) * migration,
          y: p.migration.from.y + (posed.y - p.migration.from.y) * migration
        };
        if (migration >= 1) delete p.migration;
      }

      cursor({
        x: w.x + posed.x * w.scale,
        y: w.y + posed.y * w.scale + bob,
        scale: posed.scale * w.scale
      }, opacity);
    });
    return w.age < w.duration;
  });
  requestAnimationFrame(animate);
}
canvas.addEventListener('pointerdown', event => makeWalker(event.clientX, event.clientY));
requestAnimationFrame(animate);
