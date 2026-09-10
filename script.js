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

// 左上角的像素图标属于背景层：小人物从其后方经过，大人物会遮住它们。
const iconSources = [
  'assets/icons/trash.png',
  'assets/icons/movie.png',
  'assets/icons/pages.png?v=2',
  'assets/icons/globe.png',
  'assets/icons/computer.png',
  'assets/icons/cards.png'
];
const backgroundIcons = iconSources.map(src => {
  const image = new Image();
  image.src = src;
  return image;
});
const trashLid = new Image();
trashLid.src = 'assets/icons/trash-lid.png';
const fallenTrash = new Image();
fallenTrash.src = 'assets/icons/trash-final.png';
const trashCore = new Image();
trashCore.src = 'assets/icons/trash-core.png';
const trashShadow = new Image();
trashShadow.src = 'assets/icons/trash-shadow.png';
const flowerBouquet = new Image();
flowerBouquet.src = 'assets/icons/flower-bouquet.png';
const lawnFlowerSprites = Array.from({ length: 21 }, (_, index) => {
  const image = new Image();
  image.src = `assets/icons/lawn-flowers/flower-${String(index + 1).padStart(2, '0')}.png`;
  return image;
});
const iconGrid = {
  unit: 100,
  left: 48,
  top: 42,
  columnGap: 32,
  rowGap: 28,
  layout: [
    { column: 0, row: 0 }, { column: 1, row: 0 }, { column: 2, row: 0 },
    { column: 0, row: 1 }, { column: 1, row: 1 }, { column: 2, row: 1 }
  ]
};
let trashState = 0;
let trashStarted = 0;
let trashFlow = [];
let computerShakeAt = 0;
const iconFirstShakeAt = Array(6).fill(-1);
let documentLidClicks = 0;
let lidMoveAt = 0;
let tapeLidClicks = 0;
let lidFallAt = 0;
let lawnFlowers = [];

function iconSlot(index) {
  const item = iconGrid.layout[index];
  return {
    x: iconGrid.left + item.column * (iconGrid.unit + iconGrid.columnGap),
    y: iconGrid.top + item.row * (iconGrid.unit + iconGrid.rowGap)
  };
}

function startTrashFall(now) {
  trashState = 2;
  trashStarted = now;
  computerShakeAt = now + 1250;
  // 从桶口依次掉出，不额外凭空生成；每支鼠标箭头都属于这股向下的箭头流。
  trashFlow = Array.from({ length: 46 }, (_, index) => ({
    id: index,
    delay: index * 22 + Math.random() * 150,
    drift: (Math.random() - .5) * 92,
    wobble: Math.random() * Math.PI * 2,
    scale: .3 + Math.random() * .23,
    turn: (Math.random() - .5) * .58
  }));
  glitchEnergy = 1;
}

function drawTrashFlow(now, layer) {
  if (trashState !== 2) return;
  const elapsed = now - trashStarted;
  const source = iconSlot(0);
  const globe = iconSlot(3);
  const computer = iconSlot(4);
  trashFlow.forEach(p => {
    const age = elapsed - p.delay;
    if (layer === 'pour') {
      if (age < 0 || age > 880) return;
      const progress = age / 880;
      const wobble = Math.sin(progress * 10 + p.wobble) * 7 * (1 - progress);
      // 从倒下垃圾桶画面中央的洞口持续倒出，再受重力向下流到地球。
      const outletX = source.x + 61;
      const outletY = source.y + 53;
      cursor({
        x: outletX + p.drift * .16 * progress + wobble,
        y: outletY + progress * (globe.y + 48 - outletY),
        scale: p.scale,
        rotation: p.turn + progress * .22
      }, Math.min(1, age / 110) * (1 - progress * .18));
    } else {
      // 落到地球后向右飞溅；此层随后被电脑覆盖，形成撞到电脑后消失的效果。
      const splashAge = age - 690;
      // 只有两支箭头从地球边缘飞溅到电脑；其余箭头都在地球后方结束。
      if (splashAge < 0 || splashAge > 640 || (p.id !== 8 && p.id !== 29)) return;
      const progress = splashAge / 640;
      cursor({
        x: globe.x + 52 + progress * (computer.x - globe.x + 15) + p.drift * .15,
        y: globe.y + 54 - Math.sin(progress * Math.PI) * (22 + Math.abs(p.drift) * .2) + p.drift * .08,
        scale: p.scale * (.9 + progress * .18),
        rotation: p.turn - progress * .7
      }, Math.min(1, splashAge / 90) * (1 - progress * .1));
    }
  });
}

function drawFlowerBouquet(now, earthShake = 0) {
  if (trashState !== 2 || !flowerBouquet.complete || !flowerBouquet.naturalWidth) return;
  // 最后一支箭头完全消失后，花从地球表面向上生长。
  const growthStart = trashStarted + 2250;
  if (now < growthStart) return;
  const progress = Math.min(1, (now - growthStart) / 720);
  const ease = 1 - Math.pow(1 - progress, 3);
  const globe = iconSlot(3);
  // 花束从地球中生长到前景，覆盖住上方倒下的垃圾桶。
  const fullHeight = 150;
  const fullWidth = fullHeight * flowerBouquet.naturalWidth / flowerBouquet.naturalHeight;
  const h = fullHeight * (.12 + ease * .88);
  const w = fullWidth * (.12 + ease * .88);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = Math.min(1, progress * 2.2);
  // 根部扎在地球上部，花在前景向上生长并遮住垃圾桶。
  ctx.drawImage(flowerBouquet, globe.x + 51 - w / 2 + earthShake, globe.y + 54 - h, w, h);
  ctx.restore();
}

function plantLawnFlowers(now) {
  // 草坪从远到近依次变大；每一朵的最高边都严格不超过 40px。
  const lawnTop = height * .75;
  const usableHeight = Math.max(40, height - lawnTop - 12);
  const count = 8 + Math.floor(Math.random() * 6);
  const planted = Array.from({ length: count }, (_, index) => {
    const depth = .12 + Math.random() * .88;
    const maxSide = 7 + depth * 33;
    return {
      image: lawnFlowerSprites[Math.floor(Math.random() * lawnFlowerSprites.length)],
      x: 16 + Math.random() * Math.max(1, width - 32),
      groundY: lawnTop + usableHeight * depth,
      maxSide,
      started: now,
      delay: index * 68 + Math.random() * 170,
      flip: Math.random() < .5 ? -1 : 1
    };
  });
  lawnFlowers.push(...planted);
  // 保留最近几次种下的花，避免连续点击后草坪变成密集贴图。
  lawnFlowers = lawnFlowers.slice(-72);
  glitchEnergy = Math.max(glitchEnergy, .45);
}

function drawLawnFlowers(now) {
  lawnFlowers.forEach(flower => {
    const image = flower.image;
    if (!image.complete || !image.naturalWidth) return;
    const progress = Math.max(0, Math.min(1, (now - flower.started - flower.delay) / 420));
    if (!progress) return;
    const ease = 1 - Math.pow(1 - progress, 3);
    const side = flower.maxSide * (.12 + ease * .88);
    const ratio = image.naturalWidth / image.naturalHeight;
    const w = ratio >= 1 ? side : side * ratio;
    const h = ratio >= 1 ? side / ratio : side;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = Math.min(1, progress * 2.4);
    ctx.translate(flower.x, flower.groundY);
    ctx.scale(flower.flip, 1);
    // 根部贴住草地，花朵向上长出。
    ctx.drawImage(image, -w / 2, -h, w, h);
    ctx.restore();
  });
}

function drawTrashLid(now) {
  if (trashState !== 2 || !trashLid.complete || !trashLid.naturalWidth) return;
  const source = iconSlot(0);
  const target = iconSlot(2);
  const tape = iconSlot(5);
  const base = { x: target.x + 50, y: target.y + 20, rotation: 0 };
  const stages = [
    base,
    { x: target.x + 65, y: target.y + 22, rotation: .15 },
    { x: target.x + 80, y: target.y + 25, rotation: .3 },
    { x: tape.x + 50, y: tape.y + 22, rotation: 0 }
  ];
  let x;
  let y;
  let rotation;
  if (documentLidClicks === 0) {
    const flight = Math.min(1, (now - trashStarted) / 720);
    x = source.x + 44 + (base.x - (source.x + 44)) * flight;
    y = source.y + 18 - Math.sin(flight * Math.PI) * 82 + (base.y - (source.y + 18)) * flight;
    rotation = Math.sin(flight * Math.PI) * Math.PI * .8;
  } else {
    const move = Math.min(1, (now - lidMoveAt) / 320);
    const from = stages[documentLidClicks - 1];
    const to = stages[documentLidClicks];
    x = from.x + (to.x - from.x) * move;
    y = from.y + (to.y - from.y) * move;
    rotation = from.rotation + (to.rotation - from.rotation) * move;
  }
  // 桶盖落在磁带后，第三次点击磁带会把它震落到下方。
  if (tapeLidClicks >= 3) {
    const fall = Math.min(1, (now - lidFallAt) / 520);
    const lawnY = height * .75 + 34;
    y += (lawnY - y) * fall;
    x += fall * 14;
    rotation += fall * .32;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(trashLid, -43, -22, 86, 43);
  ctx.restore();
}

function drawBackgroundIcons(now) {
  // 2 行 × 3 列；保持原比例，让每个图标最长的一边达到 100 像素。
  const { unit } = iconGrid;
  const drawIcon = (index, shake = 0) => {
    const image = backgroundIcons[index];
    if (!image.complete || !image.naturalWidth) return;
    const item = iconSlot(index);
    const ratio = unit / Math.max(image.naturalWidth, image.naturalHeight);
    const w = image.naturalWidth * ratio;
    const h = image.naturalHeight * ratio;
    const elapsed = now - iconFirstShakeAt[index];
    const firstShake = iconFirstShakeAt[index] >= 0 && elapsed < 240
      ? Math.sin(elapsed * Math.PI * 2 / 240) * 3.5
      : 0;
    ctx.drawImage(image, item.x + (unit - w) / 2 + shake + firstShake, item.y + (unit - h) / 2, w, h);
  };

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = .94;
  // 顶行先绘制；地球、电脑将在箭头流的不同层级中再绘制。
  if (trashState < 2) drawIcon(0);
  drawIcon(1);
  drawIcon(2);
  if (trashState === 2) {
    const source = iconSlot(0);
    const progress = Math.min(1, (now - trashStarted) / 600);
    const body = fallenTrash.complete && fallenTrash.naturalWidth ? fallenTrash : backgroundIcons[0];
    const fallY = source.y + progress * 18;
    // 最终状态直接使用用户指定的完整垃圾桶图，保持其原有层次和轮廓。
    ctx.drawImage(body, source.x, fallY, 100, 100);

  }
  ctx.restore();

  // 下落流先画在地球后面，形成落到地球表面的遮挡关系。
  drawTrashFlow(now, 'pour');
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = .94;
  drawIcon(3);
  ctx.restore();
  const earthElapsed = now - iconFirstShakeAt[3];
  const earthShake = iconFirstShakeAt[3] >= 0 && earthElapsed < 240
    ? Math.sin(earthElapsed * Math.PI * 2 / 240) * 3.5
    : 0;
  drawFlowerBouquet(now, earthShake);
  // 飞溅箭头覆盖地球但会被随后的电脑图标遮住。
  drawTrashFlow(now, 'splash');
  const computerElapsed = Math.min(300, Math.max(0, now - computerShakeAt));
  const computerShake = now >= computerShakeAt ? Math.sin(computerElapsed * Math.PI * 4 / 300) * 2.5 : 0;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = .94;
  drawIcon(4, computerShake);
  drawIcon(5);
  ctx.restore();
  // 桶盖必须在所有图标之上，最终才能明确盖在磁带图标上方。
  drawTrashLid(now);
}

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
  const lawnHeight = height - skyHeight;
  textureCtx.save();
  textureCtx.setTransform(1, 0, 0, 1, 0, 0);
  textureCtx.clearRect(0, 0, texture.width, texture.height);
  textureCtx.restore();
  textureCtx.fillStyle = '#087aba';
  textureCtx.fillRect(0, 0, width, skyHeight);
  const bands = 25;
  for (let i = 0; i < bands; i++) {
    const y = Math.random() * skyHeight;
    const h = 2 + Math.random() * 46;
    const alpha = 0.018 + Math.random() * 0.05;
    textureCtx.fillStyle = `rgba(${Math.random() > .55 ? '181,234,255' : '0,36,99'},${alpha})`;
    textureCtx.fillRect(0, y, width, h);
  }
  // 明显可见的复古方形像素噪点：每次刷新都会跳帧改变位置与亮度。
  const count = Math.ceil(width * skyHeight / 260);
  for (let i = 0; i < count; i++) {
    const s = 1 + Math.floor(Math.random() * 3);
    const a = 0.025 + Math.random() * 0.1;
    textureCtx.fillStyle = Math.random() < .62 ? `rgba(230,255,255,${a})` : `rgba(0,31,84,${a})`;
    textureCtx.fillRect(Math.random() * width, Math.random() * skyHeight, s, s);
  }
  // 透明的草地区域上只叠加颗粒与短扫描线，让图像本身仍然清晰可见。
  const lawnNoise = Math.ceil(width * lawnHeight / 210);
  for (let i = 0; i < lawnNoise; i++) {
    const s = 1 + Math.floor(Math.random() * 3);
    const alpha = .025 + Math.random() * .09;
    textureCtx.fillStyle = Math.random() < .58 ? `rgba(191,255,119,${alpha})` : `rgba(0,20,7,${alpha})`;
    textureCtx.fillRect(Math.random() * width, skyHeight + Math.random() * lawnHeight, s, s);
  }
  for (let i = 0; i < 14; i++) {
    const y = skyHeight + Math.random() * lawnHeight;
    textureCtx.fillStyle = `rgba(${Math.random() < .5 ? '168,255,101' : '0,24,9'},${.035 + Math.random() * .07})`;
    textureCtx.fillRect(Math.random() * width, y, 30 + Math.random() * width * .3, 1 + Math.random() * 2);
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
  // 最大人物保持现有尺寸；其他人物至少比它矮 100px，取消接近最大人物的中间尺寸。
  const viewportScale = Math.max(.75, Math.min(1.25, height / 760));
  const largestSize = 1.14;
  const humanHeight = 314;
  const smallerSizeLimit = Math.max(.56, largestSize - 100 / (humanHeight * viewportScale));
  const size = .56 + Math.random() * Math.max(0, smallerSizeLimit - .56);
  const density = .20 + size * .70;
  walkers.push({ x: startX, startX, y: Math.max(250, Math.min(height - 16, y)), age: 0, duration: 5200 + Math.random() * 900, scale: viewportScale * size, size, seed: Math.random() * 10, particles: buildHuman(density), overlapActive: false, armScatterActive: false, leftArmMigrationActive: false, headMigrationActive: false, nextDissipation: 1150, dissipationIndex: 0, scatterBursts: [] });
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
  const textureInterval = glitchEnergy > .04 ? 85 : 430;
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
  const behindIconDraws = [];
  const frontIconDraws = [];
  walkers = walkers.filter(w => {
    // 人物只按整体高度和箭头数量分层；动作与比例不受层级影响。
    const drawQueue = w.size < .82 ? behindIconDraws : frontIconDraws;
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
      const scatterCursor = {
        x: p.scatter.x + p.scatter.dx * progress,
        y: p.scatter.y + p.scatter.dy * progress,
        scale: p.scatter.scale,
        rotation: p.scatter.rotation * progress
      };
      const scatterOpacity = life * (1 - progress);
      drawQueue.push(() => cursor(scatterCursor, scatterOpacity));
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

      const bodyCursor = {
        x: w.x + posed.x * w.scale,
        y: w.y + posed.y * w.scale + bob,
        scale: posed.scale * w.scale
      };
      drawQueue.push(() => cursor(bodyCursor, opacity));
    });
    return w.age < w.duration;
  });
  // 图标夹在两组人物之间，小人物隐在图标后，大人物覆盖在图标上。
  behindIconDraws.forEach(draw => draw());
  drawBackgroundIcons(now);
  drawLawnFlowers(now);
  frontIconDraws.forEach(draw => draw());
  requestAnimationFrame(animate);
}
canvas.addEventListener('pointerdown', event => {
  const clickedIcon = iconGrid.layout.findIndex((_, index) => {
    const icon = iconSlot(index);
    return event.clientX >= icon.x && event.clientX <= icon.x + iconGrid.unit
      && event.clientY >= icon.y && event.clientY <= icon.y + iconGrid.unit;
  });
  // 图标本体和周围 30px 都不生成行走人物，只有图标本体会触发各自互动。
  const inIconSafeZone = iconGrid.layout.some((_, index) => {
    const icon = iconSlot(index);
    const padding = 30;
    return event.clientX >= icon.x - padding && event.clientX <= icon.x + iconGrid.unit + padding
      && event.clientY >= icon.y - padding && event.clientY <= icon.y + iconGrid.unit + padding;
  });
  if (clickedIcon !== -1) {
    const now = performance.now();
    if (iconFirstShakeAt[clickedIcon] < 0) iconFirstShakeAt[clickedIcon] = now;
    if (clickedIcon === 0) {
      if (trashState === 0) {
        trashState = 1;
        trashStarted = now;
        glitchEnergy = .65;
      } else if (trashState === 1) {
        startTrashFall(now);
      }
    }
    // 桶盖落到文档后，文档每次被点击都会抖动并把桶盖向右推；第三次让它落到磁带上。
    if (clickedIcon === 2 && trashState === 2 && documentLidClicks < 3 && now - trashStarted > 720) {
      documentLidClicks += 1;
      lidMoveAt = now;
      iconFirstShakeAt[2] = now;
      glitchEnergy = Math.max(glitchEnergy, .4);
    }
    // 磁带上的桶盖也接受三次震动；第三次将桶盖震落。
    if (clickedIcon === 5 && trashState === 2 && documentLidClicks === 3 && tapeLidClicks < 3) {
      tapeLidClicks += 1;
      iconFirstShakeAt[5] = now;
      if (tapeLidClicks === 3) lidFallAt = now;
      glitchEnergy = Math.max(glitchEnergy, .4);
    }
    // 地球上的花完整长出后，点击这颗开花地球，会把小花随机种到下方草坪。
    if (clickedIcon === 3 && trashState === 2 && now >= trashStarted + 2970) {
      plantLawnFlowers(now);
      iconFirstShakeAt[3] = now;
    }
    return;
  }
  // 只有地球完成开花后，点击它才会把透明像素花种到草坪上。
  if (inIconSafeZone) return;
  makeWalker(event.clientX, event.clientY);
});
requestAnimationFrame(animate);
