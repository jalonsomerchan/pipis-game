export const CHICKEN_TYPES = [
  {
    id: 'gallina_marron',
    name: 'Gallina marrón',
    spriteJson: '../assets/sprites/gallinas/gallina1/gallina1.json',
    spawnWeight: 1,
    initialLevel: 0,
  },
];

export const GAME_CONFIG = {
  initialChickens: 6,
  maxChickens: 18,
  spawnEveryMs: 6500,
  mergeScoreBase: 10,
  canvasWidth: 900,
  canvasHeight: 620,
  minSpeed: 12,
  maxSpeed: 28,
  mergeDistance: 62,
};
