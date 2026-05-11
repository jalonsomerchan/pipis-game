import '../css/main.css';
import { CHICKEN_TYPES, GAME_CONFIG } from './config/chickens.js';

const gameRoot = document.querySelector('#game');
const spriteImageUrls = import.meta.glob('../assets/sprites/gallinas/**/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' });
const foxImageUrls = import.meta.glob('../assets/sprites/**/*zorro*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' });

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomBetween = (min, max) => min + Math.random() * (max - min);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

class ChickenMergeGame {
  constructor(root) {
    this.root = root;
    this.assets = new Map();
    this.foxAsset = null;
    this.chickens = [];
    this.effects = [];
    this.drag = null;
    this.fox = null;
    this.score = 0;
    this.eggsSpawned = 0;
    this.nextId = 1;
    this.spawnTimer = null;
    this.foxTimer = null;
    this.animationFrame = null;
    this.lastTime = 0;
    this.isReady = false;
    this.hasStarted = false;
    this.pixelRatio = window.devicePixelRatio || 1;
    this.currentSpawnEveryMs = GAME_CONFIG.spawnEveryMs;
  }

  async init() {
    this.renderMenu();
    try {
      await this.loadAssets();
      this.isReady = true;
      this.enableMenuButton();
    } catch (error) {
      console.error(error);
      this.root.innerHTML = '<p class="error">No se ha podido cargar el juego. Revisa la ruta de los sprites.</p>';
    }
  }

  renderMenu() {
    this.root.innerHTML = `<section class="start-screen"><div class="start-content"><p class="eyebrow">Pipi's Game</p><h1>Fusiona gallinas</h1><p class="subtitle">Une huevos y gallinas iguales. Cada 16 huevos se desbloquea un nuevo color. Cuidado con el zorro.</p><button id="play-button" class="play-button" type="button" disabled>Cargando...</button></div></section>`;
  }

  enableMenuButton() {
    const button = this.root.querySelector('#play-button');
    if (!button) return;
    button.disabled = false;
    button.textContent = 'Jugar';
    button.addEventListener('click', () => this.startGame());
  }

  startGame() {
    this.hasStarted = true;
    this.root.innerHTML = `<section class="play-screen"><canvas id="game-canvas" class="game-canvas" aria-label="Establo"></canvas><div class="hud"><div class="hud-score" aria-live="polite"><span>Puntos</span><strong id="score">0</strong></div><div id="message" class="hud-message" role="status">Arrastra desde un huevo o gallina hasta otro igual. Pulsa Z para llamar al zorro.</div><button id="reset-button" type="button" class="hud-button">Reiniciar</button></div></section>`;
    this.canvas = this.root.querySelector('#game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.scoreNode = this.root.querySelector('#score');
    this.messageNode = this.root.querySelector('#message');
    this.root.querySelector('#reset-button').addEventListener('click', () => this.reset());
    this.resizeCanvas();
    this.bindEvents();
    this.reset();
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = requestAnimationFrame((time) => this.loop(time));
  }

  async loadAssets() {
    await Promise.all(CHICKEN_TYPES.map(async (type) => {
      const imageUrl = spriteImageUrls[type.spriteImage];
      if (!imageUrl) throw new Error(`No se encontró la imagen del sprite: ${type.spriteImage}`);
      const image = await this.loadImage(imageUrl);
      const metadata = { columns: type.columns, rows: type.rows, stages: type.stages, animations: type.animations, defaultFps: type.defaultFps ?? 8 };
      const frameRects = this.createGridFrameRects(image, metadata);
      this.assets.set(type.id, { ...type, metadata, image, frameRects });
    }));
    await this.loadFoxAsset();
  }

  async loadFoxAsset() {
    const foxUrl = Object.values(foxImageUrls)[0];
    if (!foxUrl) return;
    try {
      const image = await this.loadImage(foxUrl);
      this.foxAsset = { image, columns: 8, rows: 1, frames: Array.from({ length: 8 }, (_, index) => index), fps: 10 };
    } catch (error) {
      console.warn('No se pudo cargar el sprite del zorro. Se usará un fallback.', error);
    }
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  createGridFrameRects(image, metadata) {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    return Array.from({ length: metadata.rows }, (_, row) => {
      const y = Math.floor((row * height) / metadata.rows);
      const nextY = Math.floor(((row + 1) * height) / metadata.rows);
      return Array.from({ length: metadata.columns }, (_, column) => {
        const x = Math.floor((column * width) / metadata.columns);
        const nextX = Math.floor(((column + 1) * width) / metadata.columns);
        return { x, y, width: Math.max(1, nextX - x), height: Math.max(1, nextY - y) };
      });
    });
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('keydown', (event) => { if (event.key.toLowerCase() === 'z') this.spawnFox(true); });
    this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.canvas.addEventListener('pointercancel', () => this.cancelDrag());
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * this.pixelRatio);
    this.canvas.height = Math.round(rect.height * this.pixelRatio);
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.keepAllSpritesInside();
  }

  reset() {
    clearTimeout(this.spawnTimer);
    clearTimeout(this.foxTimer);
    this.chickens = [];
    this.effects = [];
    this.drag = null;
    this.fox = null;
    this.score = 0;
    this.eggsSpawned = 0;
    this.nextId = 1;
    this.currentSpawnEveryMs = GAME_CONFIG.spawnEveryMs;
    this.scoreNode.textContent = '0';
    for (let index = 0; index < GAME_CONFIG.initialChickens; index += 1) this.spawnChicken();
    this.setMessage('Primeros 16 huevos: un solo color. Después se desbloquean más colores.');
    this.scheduleSpawn();
    this.scheduleFox();
  }

  getBounds() {
    const rect = this.canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height, top: GAME_CONFIG.topSafeArea, bottom: rect.height };
  }

  getUnlockedTypeCount() {
    return clamp(Math.floor(this.eggsSpawned / GAME_CONFIG.colorUnlockEveryEggs) + 1, 1, CHICKEN_TYPES.length);
  }

  getRandomType() {
    const unlockedTypes = CHICKEN_TYPES.slice(0, this.getUnlockedTypeCount());
    const totalWeight = unlockedTypes.reduce((total, type) => total + type.spawnWeight, 0);
    let roll = Math.random() * totalWeight;
    for (const type of unlockedTypes) {
      roll -= type.spawnWeight;
      if (roll <= 0) return type;
    }
    return unlockedTypes[0];
  }

  scheduleSpawn() {
    clearTimeout(this.spawnTimer);
    this.spawnTimer = setTimeout(() => {
      if (this.chickens.length < GAME_CONFIG.maxChickens) {
        this.spawnChicken();
        if (Math.random() < GAME_CONFIG.foxChancePerSpawn) this.spawnFox();
      }
      this.currentSpawnEveryMs = Math.min(GAME_CONFIG.maxSpawnEveryMs, this.currentSpawnEveryMs + GAME_CONFIG.spawnGrowthMs);
      this.scheduleSpawn();
    }, this.currentSpawnEveryMs);
  }

  spawnChicken() {
    if (this.chickens.length >= GAME_CONFIG.maxChickens) return;
    const bounds = this.getBounds();
    const type = this.getRandomType();
    const level = type.initialLevel ?? 0;
    const renderSize = this.getRenderSize(type.id, level, 0);
    const radius = this.getHitRadius(renderSize, level);
    const movement = this.getMovementForLevel(level);
    const marginX = renderSize.width / 2 + 8;
    const marginY = renderSize.height / 2 + 18;
    const position = this.findSpawnPosition(bounds, marginX, marginY, radius);
    this.chickens.push({ id: this.nextId, typeId: type.id, level, x: position.x, y: position.y, vx: movement.vx, vy: movement.vy, radius, frameTime: randomBetween(0, 1), mergedPulse: 0 });
    this.nextId += 1;
    this.eggsSpawned += 1;
  }

  findSpawnPosition(bounds, marginX, marginY, radius) {
    let fallback = { x: randomBetween(marginX, Math.max(marginX, bounds.width - marginX)), y: randomBetween(bounds.top + marginY, Math.max(bounds.top + marginY, bounds.bottom - marginY)) };
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const position = { x: randomBetween(marginX, Math.max(marginX, bounds.width - marginX)), y: randomBetween(bounds.top + marginY, Math.max(bounds.top + marginY, bounds.bottom - marginY)) };
      fallback = position;
      if (!this.chickens.some((chicken) => dist(position, chicken) < (radius + chicken.radius) * 0.78)) return position;
    }
    return fallback;
  }

  getMovementForLevel(level) {
    if (level === 0) return { vx: 0, vy: 0 };
    const direction = Math.random() > 0.5 ? 1 : -1;
    return { vx: randomBetween(GAME_CONFIG.minSpeed, GAME_CONFIG.maxSpeed) * direction, vy: randomBetween(-14, 14) };
  }

  scheduleFox() {
    clearTimeout(this.foxTimer);
    this.foxTimer = setTimeout(() => { this.spawnFox(); this.scheduleFox(); }, randomBetween(GAME_CONFIG.foxMinDelayMs, GAME_CONFIG.foxMaxDelayMs));
  }

  spawnFox(forced = false) {
    if (this.fox && !forced) return;
    const bounds = this.getBounds();
    const fromLeft = Math.random() > 0.5;
    this.fox = { x: fromLeft ? -100 : bounds.width + 100, y: randomBetween(bounds.top + 70, Math.max(bounds.top + 70, bounds.bottom - 70)), vx: fromLeft ? GAME_CONFIG.foxSpeed : -GAME_CONFIG.foxSpeed, width: 124, height: 50, frameTime: 0, hits: 0, state: 'hunting', targetId: this.findFoxTarget()?.id ?? null };
    this.setMessage('¡Zorro! Púlsalo varias veces para espantarlo.');
  }

  findFoxTarget() {
    const candidates = this.chickens.filter((chicken) => chicken.level > 0);
    if (candidates.length === 0) return null;
    const origin = this.fox ?? { x: 0, y: GAME_CONFIG.topSafeArea };
    return candidates.reduce((closest, chicken) => (!closest || dist(origin, chicken) < dist(origin, closest) ? chicken : closest), null);
  }

  updateFox(delta) {
    if (!this.fox) return;
    const fox = this.fox;
    const bounds = this.getBounds();
    fox.frameTime += delta;
    if (fox.state === 'fleeing') {
      fox.x += fox.vx * delta * 1.8;
      if (fox.x < -180 || fox.x > bounds.width + 180) this.fox = null;
      return;
    }
    let target = this.chickens.find((chicken) => chicken.id === fox.targetId && chicken.level > 0);
    if (!target) {
      target = this.findFoxTarget();
      fox.targetId = target?.id ?? null;
    }
    if (target) {
      const dx = target.x - fox.x;
      const dy = target.y - fox.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      fox.x += (dx / length) * GAME_CONFIG.foxSpeed * delta;
      fox.y += (dy / length) * GAME_CONFIG.foxSpeed * delta;
      fox.vx = dx >= 0 ? GAME_CONFIG.foxSpeed : -GAME_CONFIG.foxSpeed;
      if (length < 40) {
        this.chickens = this.chickens.filter((chicken) => chicken.id !== target.id);
        fox.state = 'fleeing';
        fox.vx = fox.x < bounds.width / 2 ? -GAME_CONFIG.foxSpeed : GAME_CONFIG.foxSpeed;
        this.setMessage('El zorro se ha llevado una gallina. ¡Dale más rápido la próxima vez!');
      }
    } else {
      fox.x += fox.vx * delta;
    }
    fox.y = clamp(fox.y, bounds.top + 42, bounds.bottom - 42);
    if (fox.x < -180 || fox.x > bounds.width + 180) this.fox = null;
  }

  hitFox() {
    if (!this.fox) return;
    this.fox.hits += 1;
    this.effects.push({ x: this.fox.x, y: this.fox.y, radius: 34, age: 0, duration: 0.35 });
    if (this.fox.hits >= GAME_CONFIG.foxHitsToScare) {
      const bounds = this.getBounds();
      this.fox.state = 'fleeing';
      this.fox.vx = this.fox.x < bounds.width / 2 ? -GAME_CONFIG.foxSpeed : GAME_CONFIG.foxSpeed;
      this.setMessage('¡Has espantado al zorro!');
      return;
    }
    this.setMessage(`¡Dale al zorro! Faltan ${GAME_CONFIG.foxHitsToScare - this.fox.hits} golpes.`);
  }

  getAnimation(typeId, level) {
    const asset = this.assets.get(typeId);
    return level === 0 ? asset.metadata.animations.egg_idle : asset.metadata.animations.walk;
  }

  getCurrentFrame(chicken) {
    const asset = this.assets.get(chicken.typeId);
    const animation = this.getAnimation(chicken.typeId, chicken.level);
    return animation.frames[Math.floor(chicken.frameTime * (animation.fps ?? asset.metadata.defaultFps ?? 8)) % animation.frames.length];
  }

  getFrameRect(typeId, level, frame = 0) {
    const asset = this.assets.get(typeId);
    const stage = asset.metadata.stages[level];
    return asset.frameRects[stage.row]?.[clamp(frame, 0, asset.metadata.columns - 1)];
  }

  getRenderSize(typeId, level, frame = 0) {
    const asset = this.assets.get(typeId);
    const stage = asset.metadata.stages[level];
    const rect = this.getFrameRect(typeId, level, frame);
    const bounds = this.getBounds();
    const baseWidth = clamp(bounds.width * 0.13, 72, 132);
    const scale = (baseWidth / rect.width) * (stage.scale ?? 1);
    return { width: rect.width * scale, height: rect.height * scale, scale };
  }

  getChickenSize(chicken) {
    return this.getRenderSize(chicken.typeId, chicken.level, this.getCurrentFrame(chicken));
  }

  getHitRadius(size, level) {
    return Math.max(level === 0 ? Math.max(size.width, size.height) * 0.44 : Math.max(size.width, size.height) * 0.38, 34);
  }

  keepSpriteInside(chicken) {
    const bounds = this.getBounds();
    const size = this.getChickenSize(chicken);
    const halfWidth = size.width / 2 + 4;
    const halfHeight = size.height / 2 + 4;
    chicken.x = clamp(chicken.x, halfWidth, Math.max(halfWidth, bounds.width - halfWidth));
    chicken.y = clamp(chicken.y, bounds.top + halfHeight, Math.max(bounds.top + halfHeight, bounds.bottom - halfHeight));
  }

  keepAllSpritesInside() {
    if (!this.isReady || !this.canvas) return;
    for (const chicken of this.chickens) this.keepSpriteInside(chicken);
  }

  getSpriteBottomPoint(chicken) {
    const size = this.getChickenSize(chicken);
    return { x: chicken.x, y: chicken.y + size.height / 2 };
  }

  loop(time) {
    const delta = Math.min((time - this.lastTime) / 1000 || 0, 0.05);
    this.lastTime = time;
    if (this.isReady && this.hasStarted) {
      this.update(delta);
      this.draw();
    }
    this.animationFrame = requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  update(delta) {
    const bounds = this.getBounds();
    this.updateFox(delta);
    for (const chicken of this.chickens) {
      chicken.frameTime += delta;
      chicken.mergedPulse = Math.max(0, chicken.mergedPulse - delta * 3);
      if (chicken.level === 0 || this.drag?.source?.id === chicken.id) {
        this.keepSpriteInside(chicken);
        continue;
      }
      chicken.x += chicken.vx * delta;
      chicken.y += chicken.vy * delta;
      const size = this.getChickenSize(chicken);
      const halfWidth = size.width / 2 + 4;
      const halfHeight = size.height / 2 + 4;
      if (chicken.x < halfWidth || chicken.x > bounds.width - halfWidth) {
        chicken.vx *= -1;
        chicken.x = clamp(chicken.x, halfWidth, Math.max(halfWidth, bounds.width - halfWidth));
      }
      if (chicken.y < bounds.top + halfHeight || chicken.y > bounds.bottom - halfHeight) {
        chicken.vy *= -1;
        chicken.y = clamp(chicken.y, bounds.top + halfHeight, Math.max(bounds.top + halfHeight, bounds.bottom - halfHeight));
      }
      if (Math.random() < delta * 0.18) chicken.vy = randomBetween(-14, 14);
    }
    this.resolveOverlaps();
    this.effects = this.effects.map((effect) => ({ ...effect, age: effect.age + delta })).filter((effect) => effect.age < effect.duration);
  }

  resolveOverlaps() {
    const bounds = this.getBounds();
    for (let firstIndex = 0; firstIndex < this.chickens.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < this.chickens.length; secondIndex += 1) {
        const first = this.chickens[firstIndex];
        const second = this.chickens[secondIndex];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const currentDistance = Math.max(0.01, Math.hypot(dx, dy));
        const minimumDistance = Math.min(92, (first.radius + second.radius) * 0.62);
        if (currentDistance >= minimumDistance) continue;
        const push = (minimumDistance - currentDistance) * 0.18;
        const nx = dx / currentDistance;
        const ny = dy / currentDistance;
        first.x -= nx * push;
        first.y -= ny * push;
        second.x += nx * push;
        second.y += ny * push;
        first.x = clamp(first.x, first.radius, Math.max(first.radius, bounds.width - first.radius));
        second.x = clamp(second.x, second.radius, Math.max(second.radius, bounds.width - second.radius));
        first.y = clamp(first.y, bounds.top + first.radius, Math.max(bounds.top + first.radius, bounds.bottom - first.radius));
        second.y = clamp(second.y, bounds.top + second.radius, Math.max(bounds.top + second.radius, bounds.bottom - second.radius));
      }
    }
  }

  draw() {
    const bounds = this.getBounds();
    this.ctx.clearRect(0, 0, bounds.width, bounds.height);
    this.drawStableFloor(bounds);
    this.drawSafeArea(bounds);
    for (const chicken of [...this.chickens].sort((a, b) => a.y - b.y)) this.drawChicken(chicken);
    if (this.fox) this.drawFox();
    if (this.drag) this.drawDragLine();
    for (const effect of this.effects) this.drawMergeEffect(effect);
  }

  drawStableFloor(bounds) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = '#d99a4b';
    ctx.fillRect(0, 0, bounds.width, bounds.height);
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#875022';
    ctx.lineWidth = 2;
    for (let x = -bounds.height; x < bounds.width; x += 42) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + bounds.height, bounds.height);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#fff3c4';
    for (let i = 0; i < 44; i += 1) ctx.fillRect((i * 97) % bounds.width, bounds.top + ((i * 53) % Math.max(1, bounds.height - bounds.top)), 18, 3);
    ctx.restore();
  }

  drawSafeArea(bounds) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(99, 58, 22, 0.22)';
    ctx.fillRect(0, 0, bounds.width, bounds.top);
    ctx.strokeStyle = 'rgba(255, 244, 201, 0.38)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, bounds.top);
    ctx.lineTo(bounds.width, bounds.top);
    ctx.stroke();
    ctx.restore();
  }

  drawChicken(chicken) {
    const asset = this.assets.get(chicken.typeId);
    const frame = this.getCurrentFrame(chicken);
    const rect = this.getFrameRect(chicken.typeId, chicken.level, frame);
    const size = this.getRenderSize(chicken.typeId, chicken.level, frame);
    const isSelected = this.drag?.source?.id === chicken.id;
    const selectedPulse = isSelected ? 1.12 + Math.sin(performance.now() / 95) * 0.045 : 1;
    const pulse = (1 + chicken.mergedPulse * 0.2) * selectedPulse;
    const facingLeft = chicken.level > 0 && chicken.vx < 0;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(chicken.x, chicken.y);
    ctx.scale(facingLeft ? -pulse : pulse, pulse);
    if (isSelected) ctx.filter = 'brightness(1.28) saturate(1.55)';
    ctx.drawImage(asset.image, rect.x, rect.y, rect.width, rect.height, -size.width / 2, -size.height / 2, size.width, size.height);
    ctx.restore();
  }

  drawFox() {
    const fox = this.fox;
    const facingLeft = fox.vx < 0;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(fox.x, fox.y);
    ctx.scale(facingLeft ? -1 : 1, 1);
    if (this.foxAsset) {
      const frameIndex = Math.floor(fox.frameTime * this.foxAsset.fps) % this.foxAsset.frames.length;
      const frameWidth = this.foxAsset.image.naturalWidth / this.foxAsset.columns;
      ctx.drawImage(this.foxAsset.image, Math.floor(frameIndex * frameWidth), 0, Math.floor(frameWidth), this.foxAsset.image.naturalHeight, -fox.width / 2, -fox.height / 2, fox.width, fox.height);
    } else {
      this.drawFallbackFox(ctx, fox);
    }
    ctx.restore();
  }

  drawFallbackFox(ctx, fox) {
    ctx.fillStyle = fox.state === 'fleeing' ? '#f69a35' : '#e66a21';
    ctx.beginPath();
    ctx.ellipse(0, 0, fox.width * 0.34, fox.height * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-fox.width * 0.12, -fox.height * 0.24);
    ctx.lineTo(-fox.width * 0.02, -fox.height * 0.58);
    ctx.lineTo(fox.width * 0.08, -fox.height * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(fox.width * 0.08, -fox.height * 0.22);
    ctx.lineTo(fox.width * 0.18, -fox.height * 0.58);
    ctx.lineTo(fox.width * 0.28, -fox.height * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff2d5';
    ctx.beginPath();
    ctx.ellipse(fox.width * 0.2, fox.height * 0.1, fox.width * 0.12, fox.height * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d1608';
    ctx.beginPath();
    ctx.arc(fox.width * 0.2, -fox.height * 0.08, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e66a21';
    ctx.beginPath();
    ctx.ellipse(-fox.width * 0.44, 0, fox.width * 0.22, fox.height * 0.18, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff2d5';
    ctx.beginPath();
    ctx.ellipse(-fox.width * 0.58, -fox.height * 0.02, fox.width * 0.08, fox.height * 0.1, -0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  drawDragLine() {
    const { source, pointer } = this.drag;
    const target = this.getMergeTargetAt(pointer.x, pointer.y, source);
    const start = this.getSpriteBottomPoint(source);
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = target ? '#fff36d' : '#ffffff';
    ctx.globalAlpha = target ? 1 : 0.72;
    ctx.lineWidth = target ? 8 : 6;
    ctx.lineCap = 'round';
    ctx.setLineDash(target ? [] : [12, 10]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(pointer.x, pointer.y);
    ctx.stroke();
    ctx.fillStyle = target ? '#fff36d' : '#ffffff';
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, target ? 11 : 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawMergeEffect(effect) {
    const progress = effect.age / effect.duration;
    const alpha = 1 - progress;
    const radius = effect.radius + progress * 92;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#fff36d';
    ctx.lineWidth = 8 * alpha;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff8b8';
    for (let i = 0; i < 10; i += 1) {
      const angle = (Math.PI * 2 * i) / 10 + progress * 2;
      const sparkRadius = radius * 0.55 + progress * 36;
      ctx.beginPath();
      ctx.arc(effect.x + Math.cos(angle) * sparkRadius, effect.y + Math.sin(angle) * sparkRadius, 5 * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  getPointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  isFoxAt(x, y) {
    if (!this.fox) return false;
    return Math.abs(x - this.fox.x) <= this.fox.width * 0.58 && Math.abs(y - this.fox.y) <= this.fox.height * 0.78;
  }

  onPointerDown(event) {
    const pointer = this.getPointer(event);
    if (this.isFoxAt(pointer.x, pointer.y)) {
      event.preventDefault();
      this.hitFox();
      return;
    }
    const chicken = this.getBestSourceAt(pointer.x, pointer.y);
    if (!chicken) return;
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.drag = { pointerId: event.pointerId, source: chicken, pointer };
    this.setMessage('Arrastra la línea hasta otro igual.');
  }

  onPointerMove(event) {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.drag.pointer = this.getPointer(event);
  }

  onPointerUp(event) {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const pointer = this.getPointer(event);
    const source = this.drag.source;
    const target = this.getMergeTargetAt(pointer.x, pointer.y, source);
    if (target) this.merge(source, target);
    else if (this.getChickenAt(pointer.x, pointer.y, source.id)) this.setMessage('No son iguales. Tienen que ser del mismo color y tamaño.');
    else this.setMessage('Suelta la línea encima de otro huevo o gallina igual.');
    this.cancelDrag();
  }

  cancelDrag() {
    this.drag = null;
  }

  getChickensAt(x, y, excludeId = null) {
    if (y < GAME_CONFIG.topSafeArea) return [];
    return [...this.chickens].reverse().filter((chicken) => {
      if (chicken.id === excludeId) return false;
      const size = this.getChickenSize(chicken);
      const hitWidth = Math.max(size.width * 0.72, chicken.radius);
      const hitHeight = Math.max(size.height * 0.72, chicken.radius);
      const dx = (x - chicken.x) / hitWidth;
      const dy = (y - chicken.y) / hitHeight;
      return dx * dx + dy * dy <= 1.35;
    });
  }

  getChickenAt(x, y, excludeId = null) {
    return this.getChickensAt(x, y, excludeId)[0] ?? null;
  }

  getBestSourceAt(x, y) {
    const candidates = this.getChickensAt(x, y);
    if (candidates.length <= 1) return candidates[0] ?? null;
    return candidates.find((candidate) => this.chickens.some((chicken) => chicken.id !== candidate.id && this.canMerge(candidate, chicken))) ?? candidates[0];
  }

  getMergeTargetAt(x, y, source) {
    const directTargets = this.getChickensAt(x, y, source.id).filter((chicken) => this.canMerge(source, chicken));
    if (directTargets.length > 0) return directTargets[0];
    let bestTarget = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const chicken of this.chickens) {
      if (chicken.id === source.id || !this.canMerge(source, chicken)) continue;
      const size = this.getChickenSize(chicken);
      const allowedDistance = Math.max(58, Math.max(size.width, size.height) * 0.68);
      const pointerDistance = Math.hypot(x - chicken.x, y - chicken.y);
      if (pointerDistance < allowedDistance && pointerDistance < bestDistance) {
        bestTarget = chicken;
        bestDistance = pointerDistance;
      }
    }
    return bestTarget;
  }

  canMerge(first, second) {
    return first.typeId === second.typeId && first.level === second.level && this.hasNextLevel(first);
  }

  hasNextLevel(chicken) {
    const asset = this.assets.get(chicken.typeId);
    return chicken.level + 1 < asset.metadata.stages.length;
  }

  merge(first, second) {
    const nextLevel = first.level + 1;
    const x = (first.x + second.x) / 2;
    const y = (first.y + second.y) / 2;
    this.chickens = this.chickens.filter((item) => item.id !== first.id && item.id !== second.id);
    const type = CHICKEN_TYPES.find((item) => item.id === first.typeId);
    const movement = this.getMovementForLevel(nextLevel);
    const renderSize = this.getRenderSize(type.id, nextLevel);
    const radius = this.getHitRadius(renderSize, nextLevel);
    const newChicken = { id: this.nextId, typeId: first.typeId, level: nextLevel, x, y, vx: movement.vx, vy: movement.vy, radius, frameTime: 0, mergedPulse: 1 };
    this.nextId += 1;
    this.keepSpriteInside(newChicken);
    this.effects.push({ x: newChicken.x, y: newChicken.y, radius, age: 0, duration: 0.62 });
    this.chickens.push(newChicken);
    const points = GAME_CONFIG.mergeScoreBase * (nextLevel + 1);
    this.score += points;
    this.scoreNode.textContent = this.score.toString();
    const asset = this.assets.get(first.typeId);
    const stage = asset.metadata.stages[nextLevel];
    this.setMessage(`¡Fusión conseguida! Has creado: ${stage.name}. +${points} puntos.`);
  }

  setMessage(message) {
    this.messageNode.textContent = message;
  }
}

if (gameRoot) {
  const game = new ChickenMergeGame(gameRoot);
  game.init();
}
