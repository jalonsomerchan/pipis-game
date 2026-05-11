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
  boardSize: 4,
  initialChickens: 5,
  maxChickens: 16,
  spawnEveryMs: 5500,
  mergeScoreBase: 10,
  maxQueue: 3,
};
