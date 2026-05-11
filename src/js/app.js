import '../css/main.css';
import { CHICKEN_TYPES, GAME_CONFIG } from './config/chickens.js';

const gameRoot = document.querySelector('#game');
const spriteJsonUrls = import.meta.glob('../assets/sprites/gallinas/**/*.json', {
  eager: true,
  query: '?url',
  import: 'default',
});
const spriteImageUrls = import.meta.glob('../assets/sprites/gallinas/**/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomBetween = (min, max) => min + Math.random() * (max - min);

class ChickenMergeGame {
  constructor(root) {
    this.root = root;
    this.assets = new Map();
    this.chickens = [];
    this.effects = [];
    this.drag = null;
    this.score = 0;
    this.nextId = 1;
    this.spawnTimer = null;
    this.animationFrame = null;
    this.lastTime = 0;
    this.isReady = false;
    this.hasStarted = false;
    this.pixelRatio = window.devicePixelRatio || 1;
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
    this.root.innerHTML = `
      <section class="start-screen">
        <div class="start-content">
          <p class="eyebrow">Pipi's Game</p>
          <h1>Fusiona gallinas</h1>
          <p class="subtitle">Une huevos y gallinas iguales arrastrando una línea entre ellos para crear criaturas más grandes.</p>
          <button id="play-button" class="play-button" type="button" disabled>Cargando...</button>
        </div>
      </section>
    `;
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
    this.renderGame();
    this.resizeCanvas();
    this.bindEvents();
    this.reset();
    this.startSpawner();
    window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = window.requestAnimationFrame((time) => this.loop(time));
  }

  renderGame() {
    this.root.innerHTML = `
      <section class="play-screen">
        <canvas id="game-canvas" class="game-canvas" aria-label="Establo con huevos y gallinas"></canvas>

        <div class="hud">
          <div class="hud-score" aria-live="polite">
            <span>Puntos</span>
            <strong id="score">0</strong>
          </div>
          <div id="message" class="hud-message" role="status">Arrastra desde un huevo o gallina hasta otro igual.</div>
          <button id="reset-button" type="button" class="hud-button">Reiniciar</button>
        </div>
      </section>
    `;

    this.canvas = this.root.querySelector('#game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.scoreNode = this.root.querySelector('#score');
    this.messageNode = this.root.querySelector('#message');
    this.root.querySelector('#reset-button').addEventListener('click', () => this.reset());
  }

  async loadAssets() {
    await Promise.all(
      CHICKEN_TYPES.map(async (type) => {
        const jsonUrl = spriteJsonUrls[type.spriteJson];
        if (!jsonUrl) throw new Error(`No se encontró el sprite JSON configurado: ${type.spriteJson}`);

        const metadata = await fetch(jsonUrl).then((response) => {
          if (!response.ok) throw new Error(`No se pudo cargar ${jsonUrl}`);
          return response.json();
        });

        const folder = type.spriteJson.replace(/[^/]+$/, '');
        const imageKey = `${folder}${metadata.image}`;
        const imageUrl = spriteImageUrls[imageKey];
        if (!imageUrl) throw new Error(`No se encontró la imagen del sprite: ${imageKey}`);

        const image = await this.loadImage(imageUrl);
        const frameRects = this.createFrameRects(image, metadata);
        this.assets.set(type.id, { ...type, metadata, image, frameRects });
      }),
    );
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  createFrameRects(image, metadata) {
    const { columns, rows } = metadata;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = image.naturalWidth || metadata.imageWidth;
    canvas.height = image.naturalHeight || metadata.imageHeight;
    ctx.drawImage(image, 0, 0);

    const frameRects = [];

    for (let row = 0; row < rows; row += 1) {
      frameRects[row] = [];

      for (let column = 0; column < columns; column += 1) {
        const cellX = Math.round((column * canvas.width) / columns);
        const cellY = Math.round((row * canvas.height) / rows);
        const nextCellX = Math.round(((column + 1) * canvas.width) / columns);
        const nextCellY = Math.round(((row + 1) * canvas.height) / rows);
        const cellWidth = Math.max(1, nextCellX - cellX);
        const cellHeight = Math.max(1, nextCellY - cellY);
        const imageData = ctx.getImageData(cellX, cellY, cellWidth, cellHeight).data;
        let minX = cellWidth;
        let minY = cellHeight;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < cellHeight; y += 1) {
          for (let x = 0; x < cellWidth; x += 1) {
            const alpha = imageData[(y * cellWidth + x) * 4 + 3];
            if (alpha > 18) {
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }
        }

        if (maxX === -1) {
          frameRects[row][column] = { x: cellX, y: cellY, width: cellWidth, height: cellHeight };
          continue;
        }

        const padding = 2;
        const sourceX = cellX + Math.max(0, minX - padding);
        const sourceY = cellY + Math.max(0, minY - padding);
        const sourceMaxX = cellX + Math.min(cellWidth - 1, maxX + padding);
        const sourceMaxY = cellY + Math.min(cellHeight - 1, maxY + padding);
        frameRects[row][column] = {
          x: sourceX,
          y: sourceY,
          width: sourceMaxX - sourceX + 1,
          height: sourceMaxY - sourceY + 1,
        };
      }
    }

    return frameRects;
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resizeCanvas());
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

  startSpawner() {
    window.clearInterval(this.spawnTimer);
    this.spawnTimer = window.setInterval(() => {
      if (this.chickens.length < GAME_CONFIG.maxChickens) this.spawnChicken();
    }, GAME_CONFIG.spawnEveryMs);
  }

  reset() {
    this.chickens = [];
    this.effects = [];
    this.drag = null;
    this.score = 0;
    this.nextId = 1;
    this.scoreNode.textContent = '0';

    for (let index = 0; index < GAME_CONFIG.initialChickens; index += 1) this.spawnChicken();
    this.setMessage('Arrastra desde un huevo o gallina hasta otro igual.');
  }

  getBounds() {
    const rect = this.canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  getRandomType() {
    const totalWeight = CHICKEN_TYPES.reduce((total, type) => total + type.spawnWeight, 0);
    let roll = Math.random() * totalWeight;
    for (const type of CHICKEN_TYPES) {
      roll -= type.spawnWeight;
      if (roll <= 0) return type;
    }
    return CHICKEN_TYPES[0];
  }

  spawnChicken() {
    if (this.chickens.length >= GAME_CONFIG.maxChickens) return;

    const bounds = this.getBounds();
    const type = this.getRandomType();
    const level = type.initialLevel ?? 0;
    const frame = 0;
    const renderSize = this.getRenderSize(type.id, level, frame);
    const radius = this.getHitRadius(renderSize, level);
    const movement = this.getMovementForLevel(level);
    const marginX = renderSize.width / 2 + 8;
    const marginY = renderSize.height / 2 + 18;

    this.chickens.push({
      id: this.nextId,
      typeId: type.id,
      level,
      x: randomBetween(marginX, Math.max(marginX, bounds.width - marginX)),
      y: randomBetween(marginY, Math.max(marginY, bounds.height - marginY)),
      vx: movement.vx,
      vy: movement.vy,
      radius,
      frameTime: randomBetween(0, 1),
      mergedPulse: 0,
    });
    this.nextId += 1;
  }

  getMovementForLevel(level) {
    if (level === 0) return { vx: 0, vy: 0 };
    const direction = Math.random() > 0.5 ? 1 : -1;
    return {
      vx: randomBetween(GAME_CONFIG.minSpeed, GAME_CONFIG.maxSpeed) * direction,
      vy: randomBetween(-10, 10),
    };
  }

  getAnimation(typeId, level) {
    const asset = this.assets.get(typeId);
    return level === 0 ? asset.metadata.animations.egg_idle : asset.metadata.animations.walk;
  }

  getCurrentFrame(chicken) {
    const asset = this.assets.get(chicken.typeId);
    const animation = this.getAnimation(chicken.typeId, chicken.level);
    const frameIndex = Math.floor(chicken.frameTime * (animation.fps ?? asset.metadata.defaultFps ?? 8)) % animation.frames.length;
    return animation.frames[frameIndex];
  }

  getFrameRect(typeId, level, frame = 0) {
    const asset = this.assets.get(typeId);
    const stage = asset.metadata.stages[level];
    const column = clamp(frame, 0, asset.metadata.columns - 1);
    return asset.frameRects[stage.row]?.[column] ?? {
      x: 0,
      y: 0,
      width: asset.metadata.frameWidth,
      height: asset.metadata.frameHeight,
    };
  }

  getRenderSize(typeId, level, frame = 0) {
    const asset = this.assets.get(typeId);
    const stage = asset.metadata.stages[level];
    const rect = this.getFrameRect(typeId, level, frame);
    const bounds = this.getBounds();
    const baseWidth = clamp(bounds.width * 0.115, 58, 118);
    const scale = (baseWidth / rect.width) * (stage.scale ?? 1);
    return { width: rect.width * scale, height: rect.height * scale, scale };
  }

  getChickenSize(chicken) {
    return this.getRenderSize(chicken.typeId, chicken.level, this.getCurrentFrame(chicken));
  }

  getHitRadius(size, level) {
    const base = level === 0 ? Math.max(size.width, size.height) * 0.5 : Math.max(size.width, size.height) * 0.42;
    return Math.max(base, 34);
  }

  keepSpriteInside(chicken) {
    const bounds = this.getBounds();
    const size = this.getChickenSize(chicken);
    const halfWidth = size.width / 2 + 4;
    const halfHeight = size.height / 2 + 4;
    chicken.x = clamp(chicken.x, halfWidth, Math.max(halfWidth, bounds.width - halfWidth));
    chicken.y = clamp(chicken.y, halfHeight, Math.max(halfHeight, bounds.height - halfHeight));
  }

  keepAllSpritesInside() {
    if (!this.isReady || !this.canvas) return;
    for (const chicken of this.chickens) this.keepSpriteInside(chicken);
  }

  loop(time) {
    const delta = Math.min((time - this.lastTime) / 1000 || 0, 0.05);
    this.lastTime = time;

    if (this.isReady && this.hasStarted) {
      this.update(delta);
      this.draw();
    }

    this.animationFrame = window.requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  update(delta) {
    const bounds = this.getBounds();

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

      if (chicken.y < halfHeight || chicken.y > bounds.height - halfHeight) {
        chicken.vy *= -1;
        chicken.y = clamp(chicken.y, halfHeight, Math.max(halfHeight, bounds.height - halfHeight));
      }

      if (Math.random() < delta * 0.18) chicken.vy = randomBetween(-12, 12);
    }

    this.effects = this.effects
      .map((effect) => ({ ...effect, age: effect.age + delta }))
      .filter((effect) => effect.age < effect.duration);
  }

  draw() {
    const bounds = this.getBounds();
    this.ctx.clearRect(0, 0, bounds.width, bounds.height);
    this.drawStableFloor(bounds);

    const sorted = [...this.chickens].sort((a, b) => a.y - b.y);
    for (const chicken of sorted) this.drawChicken(chicken);
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
    for (let i = 0; i < 44; i += 1) {
      const x = (i * 97) % bounds.width;
      const y = (i * 53) % bounds.height;
      ctx.fillRect(x, y, 18, 3);
    }
    ctx.restore();
  }

  drawChicken(chicken) {
    const asset = this.assets.get(chicken.typeId);
    const { image } = asset;
    const frame = this.getCurrentFrame(chicken);
    const rect = this.getFrameRect(chicken.typeId, chicken.level, frame);
    const size = this.getRenderSize(chicken.typeId, chicken.level, frame);
    const pulse = 1 + chicken.mergedPulse * 0.2;
    const facingLeft = chicken.level > 0 && chicken.vx < 0;

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(chicken.x, chicken.y);

    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#3e230f';
    ctx.beginPath();
    ctx.ellipse(0, size.height * 0.38, size.width * 0.28, Math.max(size.height * 0.08, 5), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.scale(facingLeft ? -pulse : pulse, pulse);
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, -size.width / 2, -size.height / 2, size.width, size.height);

    if (this.drag?.source?.id === chicken.id) {
      ctx.strokeStyle = '#fff3a8';
      ctx.lineWidth = 5 / pulse;
      ctx.beginPath();
      ctx.arc(0, 0, chicken.radius / pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawDragLine() {
    const ctx = this.ctx;
    const { source, pointer } = this.drag;
    const target = this.getChickenAt(pointer.x, pointer.y, source.id);
    const canMerge = target && this.canMerge(source, target);

    ctx.save();
    ctx.strokeStyle = canMerge ? '#fff36d' : '#ffffff';
    ctx.globalAlpha = canMerge ? 1 : 0.72;
    ctx.lineWidth = canMerge ? 8 : 6;
    ctx.lineCap = 'round';
    ctx.setLineDash(canMerge ? [] : [12, 10]);
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(pointer.x, pointer.y);
    ctx.stroke();

    ctx.fillStyle = canMerge ? '#fff36d' : '#ffffff';
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, canMerge ? 11 : 8, 0, Math.PI * 2);
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

  onPointerDown(event) {
    const pointer = this.getPointer(event);
    const chicken = this.getChickenAt(pointer.x, pointer.y);
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
    const target = this.getChickenAt(pointer.x, pointer.y, source.id);

    if (target && this.canMerge(source, target)) {
      this.merge(source, target);
    } else if (target) {
      this.setMessage('No son iguales. Tienen que ser del mismo color y tamaño.');
    } else {
      this.setMessage('Suelta la línea encima de otro huevo o gallina igual.');
    }

    this.cancelDrag();
  }

  cancelDrag() {
    this.drag = null;
  }

  getChickenAt(x, y, excludeId = null) {
    return [...this.chickens].reverse().find((chicken) => {
      if (chicken.id === excludeId) return false;
      const size = this.getChickenSize(chicken);
      const hitWidth = Math.max(size.width * 0.62, chicken.radius);
      const hitHeight = Math.max(size.height * 0.62, chicken.radius);
      const dx = (x - chicken.x) / hitWidth;
      const dy = (y - chicken.y) / hitHeight;
      return dx * dx + dy * dy <= 1.25;
    });
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

    const newChicken = {
      id: this.nextId,
      typeId: first.typeId,
      level: nextLevel,
      x,
      y,
      vx: movement.vx,
      vy: movement.vy,
      radius,
      frameTime: 0,
      mergedPulse: 1,
    };
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
