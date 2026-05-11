# Pipi's Game

Juego casual de fusionar gallinas hecho con HTML, JavaScript, Vite y Tailwind CSS.

## Cómo jugar

Toca una gallina del establo y después otra gallina del mismo color y tamaño. Las dos se fusionarán en una gallina del siguiente nivel y sumarás puntos.

## Desarrollo local

```bash
npm install
npm run dev
```

## Build de producción

```bash
npm run build
npm run preview
```

## Añadir nuevas gallinas

1. Añade una carpeta nueva dentro de `src/assets/sprites/gallinas/`, por ejemplo:

```txt
src/assets/sprites/gallinas/gallina2/
  gallina2.png
  gallina2.json
```

2. El JSON debe seguir la estructura de `gallina1.json`: imagen, columnas, filas, tamaño de frame, `stages` y `animations`.

3. Registra la gallina en `src/js/config/chickens.js`:

```js
export const CHICKEN_TYPES = [
  {
    id: 'gallina_marron',
    name: 'Gallina marrón',
    spriteJson: '../assets/sprites/gallinas/gallina1/gallina1.json',
    spawnWeight: 1,
    initialLevel: 0,
  },
  {
    id: 'gallina_azul',
    name: 'Gallina azul',
    spriteJson: '../assets/sprites/gallinas/gallina2/gallina2.json',
    spawnWeight: 1,
    initialLevel: 0,
  },
];
```

`spawnWeight` controla la probabilidad de aparición. Un valor más alto hace que esa gallina salga más a menudo.

## GitHub Pages

El proyecto incluye `.github/workflows/deploy-pages.yml`. En GitHub, configura Pages con la fuente **GitHub Actions** y cada push a `main` publicará automáticamente la carpeta `dist`.

## Licencia

MIT
