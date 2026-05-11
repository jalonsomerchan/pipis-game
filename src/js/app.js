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

class ChickenMergeGame {
  constructor(root) {
    this.root = root;
    this.assets = new Map();
    this.chickens = [];
    this.selectedId = null;
    this.score = 0;
    this.nextId = 1;
    this.spawnTimer = null;
    this.isReady = false;
  }

  async init() {
    this.renderShell();
    await this.loadAssets();
    this.isReady = true;

    for (let index = 0; index < GAME_CONFIG.initialChickens; index += 1) {
      this.spawnChicken();
    }

    this.render();
    this.startSpawner();
  }

  renderShell() {
    this.root.innerHTML = `
      <section class="game-card">
        <div class="game-topbar">
          <div>
            <p class="eyebrow">Pipi's Game</p>
            <h1>Fusiona gallinas</h1>
            <p class="subtitle">Une dos gallinas del mismo color y tamaño para conseguir una más grande.</p>
          </div>

          <div class="score-card" aria-live="polite">
            <span>Puntos</span>
            <strong id="score">0</strong>
          </div>
        </div>

        <div class="stable-wrap">
          <div class="stable-roof"></div>
          <div id="board" class="board" aria-label="Establo de gallinas"></div>
        </div>

        <div class="game-actions">
          <button id="spawn-button" type="button">Añadir gallina</button>
          <button id="reset-button" type="button" class="button-secondary">Reiniciar</button>
        </div>

        <p id="message" class="message" role="status">Toca una gallina y después otra igual para fusionarla.</p>
      </section>
    `;

    this.board = this.root.querySelector('#board');
    this.scoreNode = this.root.querySelector('#score');
    this.messageNode = this.root.querySelector('#message');
    this.root.querySelector('#spawn-button').addEventListener('click', () => {
      this.spawnChicken(true);
      this.render();
    });
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

        this.assets.set(type.id, { ...type, metadata, imageUrl });
      }),
    );
  }

  startSpawner() {
    window.clearInterval(this.spawnTimer);
    this.spawnTimer = window.setInterval(() => {
      if (this.chickens.length < GAME_CONFIG.maxChickens) {
        this.spawnChicken();
        this.render();
      }
    }, GAME_CONFIG.spawnEveryMs);
  }

  reset() {
    this.chickens = [];
    this.selectedId = null;
    this.score = 0;
    this.nextId = 1;

    for (let index = 0; index < GAME_CONFIG.initialChickens; index += 1) {
      this.spawnChicken();
    }

    this.setMessage('Partida reiniciada. Busca parejas iguales.');
    this.render();
  }

  getRandomType() {
    const totalWeight = CHICKEN_TYPES.reduce((total, type) => total + type.spawnWeight, 0);
    let roll = Math.random() * totalWeight;

    for (const type of CHICKEN_TYPES) {
      roll -= type.spawnWeight;
      if (roll <= 0) {
        return type;
      }
    }

    return CHICKEN_TYPES[0];
  }

  spawnChicken(fromButton = false) {
    if (this.chickens.length >= GAME_CONFIG.maxChickens) {
      if (fromButton) {
        this.setMessage('El establo está lleno. Fusiona gallinas para hacer hueco.');
      }
      return;
    }

    const type = this.getRandomType();
    this.chickens.push({
      id: this.nextId,
      typeId: type.id,
      level: type.initialLevel ?? 0,
      createdAt: Date.now(),
    });
    this.nextId += 1;

    if (fromButton) {
      this.setMessage('Ha llegado una gallina nueva al establo.');
    }
  }

  onChickenClick(chickenId) {
    const chicken = this.chickens.find((item) => item.id === chickenId);
    if (!chicken) return;

    if (this.selectedId === null) {
      this.selectedId = chickenId;
      this.setMessage('Elige otra gallina igual para fusionarla.');
      this.render();
      return;
    }

    if (this.selectedId === chickenId) {
      this.selectedId = null;
      this.setMessage('Selección cancelada.');
      this.render();
      return;
    }

    const selected = this.chickens.find((item) => item.id === this.selectedId);

    if (!selected) {
      this.selectedId = chickenId;
      this.render();
      return;
    }

    if (this.canMerge(selected, chicken)) {
      this.merge(selected, chicken);
      this.selectedId = null;
      this.render();
      return;
    }

    this.selectedId = chickenId;
    this.setMessage('No son iguales. Ahora tienes seleccionada esta gallina.');
    this.render();
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
    this.chickens = this.chickens.filter((item) => item.id !== first.id && item.id !== second.id);
    this.chickens.push({
      id: this.nextId,
      typeId: first.typeId,
      level: nextLevel,
      createdAt: Date.now(),
      merged: true,
    });
    this.nextId += 1;

    const points = GAME_CONFIG.mergeScoreBase * (nextLevel + 1);
    this.score += points;

    const asset = this.assets.get(first.typeId);
    const stage = asset.metadata.stages[nextLevel];
    this.setMessage(`¡Fusión conseguida! Has creado: ${stage.name}. +${points} puntos.`);
  }

  render() {
    if (!this.isReady) return;

    this.scoreNode.textContent = this.score.toString();
    this.board.innerHTML = '';

    const cells = GAME_CONFIG.boardSize * GAME_CONFIG.boardSize;

    for (let index = 0; index < cells; index += 1) {
      const cell = document.createElement('button');
      cell.className = 'cell';
      cell.type = 'button';
      cell.setAttribute('aria-label', `Casilla ${index + 1}`);

      const chicken = this.chickens[index];
      if (chicken) {
        cell.append(this.createChickenNode(chicken));
        cell.addEventListener('click', () => this.onChickenClick(chicken.id));
      } else {
        cell.classList.add('cell-empty');
      }

      this.board.append(cell);
    }
  }

  createChickenNode(chicken) {
    const asset = this.assets.get(chicken.typeId);
    const { metadata, imageUrl } = asset;
    const stage = metadata.stages[chicken.level];
    const animation = chicken.level === 0 ? metadata.animations.egg_idle : metadata.animations.idle;
    const frame = animation.frames[0];
    const frameWidth = metadata.frameWidth;
    const frameHeight = metadata.frameHeight;
    const spriteScale = 0.42;
    const x = frame * frameWidth;
    const y = stage.row * frameHeight;
    const sizeScale = stage.scale ?? 1;

    const node = document.createElement('span');
    node.className = 'chicken';
    if (this.selectedId === chicken.id) node.classList.add('selected');
    if (chicken.merged) node.classList.add('merged');
    node.style.setProperty('--sprite-url', `url(${imageUrl})`);
    node.style.setProperty('--sprite-x', `${-x * spriteScale}px`);
    node.style.setProperty('--sprite-y', `${-y * spriteScale}px`);
    node.style.setProperty('--sprite-w', `${metadata.imageWidth * spriteScale}px`);
    node.style.setProperty('--sprite-h', `${metadata.imageHeight * spriteScale}px`);
    node.style.setProperty('--frame-w', `${frameWidth * spriteScale}px`);
    node.style.setProperty('--frame-h', `${frameHeight * spriteScale}px`);
    node.style.setProperty('--scale', sizeScale);
    node.title = `${asset.name}: ${stage.name}`;
    node.setAttribute('aria-label', `${asset.name}, ${stage.name}`);

    return node;
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
