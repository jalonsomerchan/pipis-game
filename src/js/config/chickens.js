const DEFAULT_STAGES = [
  { id: 'huevo', name: 'Huevo', row: 0, scale: 0.65 },
  { id: 'pollito', name: 'Pollito', row: 1, scale: 0.6 },
  { id: 'gallina_joven', name: 'Gallina joven', row: 2, scale: 0.75 },
  { id: 'gallina_mediana', name: 'Gallina mediana', row: 3, scale: 0.9 },
  { id: 'gallina_adulta', name: 'Gallina adulta', row: 4, scale: 1 },
  { id: 'gallina_grande', name: 'Gallina grande', row: 5, scale: 1.1 },
  { id: 'gallina_abuela', name: 'Gallina abuela', row: 6, scale: 1 },
];

export const CHICKEN_TYPES = [
  {
    id: 'gallina_amarilla',
    name: 'Gallina amarilla',
    spriteImage: '../assets/sprites/gallinas/gallina_1.png',
    columns: 8,
    rows: 7,
    spawnWeight: 1,
    initialLevel: 0,
    stages: DEFAULT_STAGES,
    animations: {
      egg_idle: { frames: [0, 1, 2, 3, 4, 5, 6, 7], fps: 4 },
      walk: { frames: [0, 1, 2, 3, 4, 5, 6, 7], fps: 8 },
    },
  },
  {
    id: 'gallina_blanca',
    name: 'Gallina blanca',
    spriteImage: '../assets/sprites/gallinas/gallina_2.png',
    columns: 8,
    rows: 7,
    spawnWeight: 1,
    initialLevel: 0,
    stages: DEFAULT_STAGES,
    animations: {
      egg_idle: { frames: [0, 1, 2, 3, 4, 5, 6, 7], fps: 4 },
      walk: { frames: [0, 1, 2, 3, 4, 5, 6, 7], fps: 8 },
    },
  },
  {
    id: 'gallina_negra',
    name: 'Gallina negra',
    spriteImage: '../assets/sprites/gallinas/gallina_3.png',
    columns: 8,
    rows: 7,
    spawnWeight: 1,
    initialLevel: 0,
    stages: DEFAULT_STAGES,
    animations: {
      egg_idle: { frames: [0, 1, 2, 3, 4, 5, 6, 7], fps: 4 },
      walk: { frames: [0, 1, 2, 3, 4, 5, 6, 7], fps: 8 },
    },
  },
  {
    id: 'gallina_marron',
    name: 'Gallina marrón',
    spriteImage: '../assets/sprites/gallinas/gallina_4.png',
    columns: 8,
    rows: 7,
    spawnWeight: 1,
    initialLevel: 0,
    stages: DEFAULT_STAGES,
    animations: {
      egg_idle: { frames: [0, 1, 2, 3, 4, 5, 6, 7], fps: 4 },
      walk: { frames: [0, 1, 2, 3, 4, 5, 6, 7], fps: 8 },
    },
  },
  {
    id: 'gallina_gris',
    name: 'Gallina gris',
    spriteImage: '../assets/sprites/gallinas/gallina_5.png',
    columns: 8,
    rows: 7,
    spawnWeight: 1,
    initialLevel: 0,
    stages: DEFAULT_STAGES,
    animations: {
      egg_idle: { frames: [0, 1, 2, 3, 4, 5, 6, 7], fps: 4 },
      walk: { frames: [0, 1, 2, 3, 4, 5, 6, 7], fps: 8 },
    },
  },
];

export const GAME_CONFIG = {
  initialChickens: 6,
  maxChickens: 18,
  spawnEveryMs: 6500,
  mergeScoreBase: 10,
  minSpeed: 12,
  maxSpeed: 28,
};
