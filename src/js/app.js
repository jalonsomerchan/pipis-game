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
    this.drag = null;
    this.score = 0;
    this.nextId = 1;
    this.spawnTimer = null;
    this.animationFrame = null;
    this.lastTime = 0;
    this.isReady = false;
    this.pixelRatio = window.devicePixelRatio || 1;
  }

  async init() {
    this.renderShell();
    await this.loadAssets();
    this.isReady = true;
    this.resizeCanvas();
    this.bindEvents();
    this.reset();
    this.startSpawner();
    this.animationFrame = window.requestAnimationFrame((time) => this.loop(time));
  }

  renderShell() {
    this.root.innerHTML = `
      <section class="game-card">
        <div class="game-topbar">
          <div>
            <p class="eyebrow">Pipi's Game</p>
            <h1>Fusiona gallinas</h1>
            <p class="subtitle">Las gallinas pasean por el establo. Pincha una y arrastra hasta otra igual para unirlas.</p>
          </div>

          <div class="score-card" aria-live="polite">
            <span>Puntos</span>
            <strong id="score">0</strong>
          </div>
        </div>

        <div class="stable-wrap">
          <div class="stable-roof"></div>
          <canvas id="game-canvas" class="game-canvas" aria-label="Establo con gallinas caminando"></canvas>
        </div>

        <div class="game-actions">
          <button id="spawn-button" type="button">Añadir gallina</button>
          <button id="reset-button" type="button" class="button-secondary">Reiniciar</button>
        </div>

        <p id="message" class="message" role="status">Arrastra desde una gallina hasta otra igual para fusionarlas.</p>
      </section>
    `;

    this.canvas = this.root.querySelector('#game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.scoreNode = this.root.querySelector('#score');
    this.messageNode = this.root.querySelector('#message');
    this.root.querySelector('#spawn-button').addEventListener('click', () => this.spawnChicken(true));
    this.root.querySelector('#reset-button').addEventListener('click', () => this.reset());
  }

  async loadAssets() {
    await Promise.all(
      CHICKEN_TYPES.map(async (type) => {
        const jsonUrl = spriteJsonUrls[type.spriteJson];
        if (!jsonUrl) {
          throw new Error(`No se encontró el sprite JSON configurado: ${type.spriteJson}`);
        }

        const metadata = await fetch(jsonUrl).then((response) => {
          if (!response.ok) {
            throw new Error(`No se pudo cargar ${jsonUrl}`);
          }

          return response.json();
        });

        const folder = type.spriteJson.replace(/[^/]+$/, '');
        const imageKey = `${folder}${metadata.image}`;
        const imageUrl = spriteImageUrls[imageKey];

        if (!imageUrl) {
          throw new Error(`No se encontró la imagen del sprite: ${imageKey}`);
        }

        const image = await this.loadImage(imageUrl);
        this.assets.set(type.id, { ...type, metadata, image });
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

  bindEvents() {
    window.addEventListener('resize', () => this.resizeCanvas());
    this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.canvas.addEventListener('pointercancel', () => this.cancelDrag());
    this.canvas.addEventListener('lostpointercapture', () => this.cancelDrag());
  }

  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.pixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * this.pixelRatio);
    this.canvas.height = Math.round(rect.height * this.pixelRatio);
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
  }

  startSpawner() {
    window.clearInterval(this.spawnTimer);
    this.spawnTimer = window.setInterval(() => {
      if (this.chickens.length < GAME_CONFIG.maxChickens) {
        this.spawnChicken();
      }
    }, GAME_CONFIG.spawnEveryMs);
  }

  reset() {
    this.chickens = [];
    this.drag = null;
    this.score = 0;
    this.nextId = 1;
    this.scoreNode.textContent = '0';

    for (let index = 0; index < GAME_CONFIG.initialChickens; index += 1) {
      this.spawnChicken();
    }

    this.setMessage('Partida reiniciada. Arrastra una gallina hasta otra igual.');
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

  spawnChicken(fromButton = false) {
    if (this.chickens.length >= GAME_CONFIG.maxChickens) {
      if (fromButton) this.setMessage('El establo está lleno. Fusiona gallinas para hacer hueco.');
      return;
    }

    const bounds = this.getBounds();
    const type = this.getRandomType();
    const level = type.initialLevel ?? 0;
    const renderSize = this.getRenderSize(type.id, level);
    const radius = renderSize.width * 0.34;
    const direction = Math.random() > 0.5 ? 1 : -1;
    const speed = randomBetween(GAME_CONFIG.minSpeed, GAME_CONFIG.maxSpeed) * direction;

    this.chickens.push({
      id: this.nextId,
      typeId: type.id,
      level,
      x: randomBetween(radius + 8, Math.max(radius + 8, bounds.width - radius - 8)),
      y: randomBetween(radius + 18, Math.max(radius + 18, bounds.height - radius - 18)),
      vx: speed,
      vy: randomBetween(-10, 10),
      radius,
      frameTime: randomBetween(0, 1),
      mergedPulse: 0,
    });
    this.nextId += 1;

    if (fromButton) this.setMessage('Ha entrado una gallina nueva al establo.');
  }

  getRenderSize(typeId, level) {
    const asset = this.assets.get(typeId);
    const stage = asset.metadata.stages[level];
    const frameWidth = asset.metadata.frameWidth;
    const frameHeight = asset.metadata.frameHeight;
    const baseWidth = clamp(this.getBounds().width * 0.16, 70, 118);
    const scale = (baseWidth / frameWidth) * (stage.scale ?? 1);

    return {
      width: frameWidth * scale,
      height: frameHeight * scale,
      scale,
    };
  }

  loop(time) {
    const delta = Math.min((time - this.lastTime) / 1000 || 0, 0.05);
    this.lastTime = time;

    if (this.isReady) {
      this.update(delta);
      this.draw();
    }

    this.animationFrame = window.requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  update(delta) {
    const bounds = this.getBounds();

    for (const chicken of this.chickens) {
      if (this.drag?.source?.id === chicken.id) {
        chicken.frameTime += delta;
        continue;
      }

      chicken.x += chicken.vx * delta;
      chicken.y += chicken.vy * delta;
      chicken.frameTime += delta;
      chicken.mergedPulse = Math.max(0, chicken.mergedPulse - delta * 3);

      if (chicken.x < chicken.radius || chicken.x > bounds.width - chicken.radius) {
        chicken.vx *= -1;
        chicken.x = clamp(chicken.x, chicken.radius, bounds.width - chicken.radius);
      }

      if (chicken.y < chicken.radius || chicken.y > bounds.height - chicken.radius) {
        chicken.vy *= -1;
        chicken.y = clamp(chicken.y, chicken.radius, bounds.height - chicken.radius);
      }

      if (Math.random() < delta * 0.18) {
        chicken.vy = randomBetween(-12, 12);
      }
    }
  }

  draw() {
    const bounds = this.getBounds();
    this.ctx.clearRect(0, 0, bounds.width, bounds.height);
    this.drawStableFloor(bounds);

    const sorted = [...this.chickens].sort((a, b) => a.y - b.y);

    for (const chicken of sorted) {
      this.drawChicken(chicken);
    }

    if (this.drag) {
      this.drawDragLine();
    }
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
    for (let i = 0; i < 34; i += 1) {
      const x = (i * 97) % bounds.width;
      const y = (i * 53) % bounds.height;
      ctx.fillRect(x, y, 18, 3);
    }
    ctx.restore();
  }

  drawChicken(chicken) {
    const asset = this.assets.get(chicken.typeId);
    const { metadata, image } = asset;
    const stage = metadata.stages[chicken.level];
    const animation = chicken.level === 0 ? metadata.animations.egg_idle : metadata.animations.walk;
    const frameIndex = Math.floor(chicken.frameTime * (animation.fps ?? metadata.defaultFps ?? 8)) % animation.frames.length;
    const frame = animation.frames[frameIndex];
    const frameWidth = metadata.frameWidth;
    const frameHeight = metadata.frameHeight;
    const sourceX = Math.round(frame * frameWidth);
    const sourceY = Math.round(stage.row * frameHeight);
    const size = this.getRenderSize(chicken.typeId, chicken.level);
    const pulse = 1 + chicken.mergedPulse * 0.16;
    const facingLeft = chicken.vx < 0;

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(chicken.x, chicken.y);

    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#3e230f';
    ctx.beginPath();
    ctx.ellipse(0, size.height * 0.34, size.width * 0.28, size.height * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.scale(facingLeft ? -pulse : pulse, pulse);
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      Math.floor(frameWidth),
      Math.floor(frameHeight),
      -size.width / 2,
      -size.height / 2,
      size.width,
      size.height,
    );

    if (this.drag?.source?.id === chicken.id) {
      ctx.strokeStyle = '#fff3a8';
      ctx.lineWidth = 5 / pulse;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(size.width, size.height) * 0.38, 0, Math.PI * 2);
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
    ctx.strokeStyle = canMerge ? '#fff3a8' : '#ffffff';
    ctx.globalAlpha = canMerge ? 0.95 : 0.62;
    ctx.lineWidth = canMerge ? 7 : 5;
    ctx.lineCap = 'round';
    ctx.setLineDash(canMerge ? [] : [12, 10]);
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(pointer.x, pointer.y);
    ctx.stroke();

    ctx.fillStyle = canMerge ? '#fff3a8' : '#ffffff';
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, canMerge ? 10 : 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  getPointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  onPointerDown(event) {
    const pointer = this.getPointer(event);
    const chicken = this.getChickenAt(pointer.x, pointer.y);
    if (!chicken) return;

    this.canvas.setPointerCapture(event.pointerId);
    this.drag = { pointerId: event.pointerId, source: chicken, pointer };
    chicken.vx *= 0.25;
    chicken.vy *= 0.25;
    this.setMessage('Arrastra la línea hasta una gallina igual.');
  }

  onPointerMove(event) {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    this.drag.pointer = this.getPointer(event);
  }

  onPointerUp(event) {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;

    const pointer = this.getPointer(event);
    const source = this.drag.source;
    const target = this.getChickenAt(pointer.x, pointer.y, source.id);

    if (target && this.canMerge(source, target)) {
      this.merge(source, target);
    } else if (target) {
      this.setMessage('No son iguales. Tienen que ser del mismo color y tamaño.');
    } else {
      this.setMessage('Suelta la línea encima de otra gallina igual.');
    }

    this.cancelDrag();
  }

  cancelDrag() {
    this.drag = null;
  }

  getChickenAt(x, y, excludeId = null) {
    return [...this.chickens]
      .reverse()
      .find((chicken) => {
        if (chicken.id === excludeId) return false;
        const dx = x - chicken.x;
        const dy = y - chicken.y;
        return Math.hypot(dx, dy) <= chicken.radius * 1.15;
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
    const speed = randomBetween(GAME_CONFIG.minSpeed, GAME_CONFIG.maxSpeed) * (Math.random() > 0.5 ? 1 : -1);
    const renderSize = this.getRenderSize(type.id, nextLevel);
    const radius = renderSize.width * 0.34;

    this.chickens.push({
      id: this.nextId,
      typeId: first.typeId,
      level: nextLevel,
      x,
      y,
      vx: speed,
      vy: randomBetween(-10, 10),
      radius,
      frameTime: 0,
      mergedPulse: 1,
    });
    this.nextId += 1;

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
  game.init().catch((error) => {
    console.error(error);
    gameRoot.innerHTML = '<p class="error">No se ha podido cargar el juego. Revisa la ruta de los sprites.</p>';
  });
}
