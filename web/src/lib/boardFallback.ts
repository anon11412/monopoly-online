import type { BoardTile } from '../types';

// Classic Monopoly US board definitions (facts: names, groups, prices, colors)
const CLASSIC_TILES: Array<Partial<BoardTile> & { name: string; type: string; price?: number; group?: string; color?: string | null }> = [
  { name: 'GO', type: 'go' },
  { name: 'Mediterranean Avenue', type: 'property', group: 'brown', price: 60, color: '#8B4513' },
  { name: 'Community Chest', type: 'chest' },
  { name: 'Baltic Avenue', type: 'property', group: 'brown', price: 60, color: '#8B4513' },
  { name: 'Income Tax', type: 'tax' },
  { name: 'Reading Railroad', type: 'railroad', group: 'railroad', price: 200 },
  { name: 'Oriental Avenue', type: 'property', group: 'light-blue', price: 100, color: '#ADD8E6' },
  { name: 'Chance', type: 'chance' },
  { name: 'Vermont Avenue', type: 'property', group: 'light-blue', price: 100, color: '#ADD8E6' },
  { name: 'Connecticut Avenue', type: 'property', group: 'light-blue', price: 120, color: '#ADD8E6' },
  { name: 'Jail / Just Visiting', type: 'jail' },
  { name: 'St. Charles Place', type: 'property', group: 'pink', price: 140, color: '#FF69B4' },
  { name: 'Electric Company', type: 'utility', group: 'utility', price: 150 },
  { name: 'States Avenue', type: 'property', group: 'pink', price: 140, color: '#FF69B4' },
  { name: 'Virginia Avenue', type: 'property', group: 'pink', price: 160, color: '#FF69B4' },
  { name: 'Pennsylvania Railroad', type: 'railroad', group: 'railroad', price: 200 },
  { name: 'St. James Place', type: 'property', group: 'orange', price: 180, color: '#FFA500' },
  { name: 'Community Chest', type: 'chest' },
  { name: 'Tennessee Avenue', type: 'property', group: 'orange', price: 180, color: '#FFA500' },
  { name: 'New York Avenue', type: 'property', group: 'orange', price: 200, color: '#FFA500' },
  { name: 'Free Parking', type: 'free' },
  { name: 'Kentucky Avenue', type: 'property', group: 'red', price: 220, color: '#FF0000' },
  { name: 'Chance', type: 'chance' },
  { name: 'Indiana Avenue', type: 'property', group: 'red', price: 220, color: '#FF0000' },
  { name: 'Illinois Avenue', type: 'property', group: 'red', price: 240, color: '#FF0000' },
  { name: 'B. & O. Railroad', type: 'railroad', group: 'railroad', price: 200 },
  { name: 'Atlantic Avenue', type: 'property', group: 'yellow', price: 260, color: '#FFFF00' },
  { name: 'Ventnor Avenue', type: 'property', group: 'yellow', price: 260, color: '#FFFF00' },
  { name: 'Water Works', type: 'utility', group: 'utility', price: 150 },
  { name: 'Marvin Gardens', type: 'property', group: 'yellow', price: 280, color: '#FFFF00' },
  { name: 'Go To Jail', type: 'gotojail' },
  { name: 'Pacific Avenue', type: 'property', group: 'green', price: 300, color: '#008000' },
  { name: 'North Carolina Avenue', type: 'property', group: 'green', price: 300, color: '#008000' },
  { name: 'Community Chest', type: 'chest' },
  { name: 'Pennsylvania Avenue', type: 'property', group: 'green', price: 320, color: '#008000' },
  { name: 'Short Line', type: 'railroad', group: 'railroad', price: 200 },
  { name: 'Chance', type: 'chance' },
  { name: 'Park Place', type: 'property', group: 'dark-blue', price: 350, color: '#00008B' },
  { name: 'Luxury Tax', type: 'tax' },
  { name: 'Boardwalk', type: 'property', group: 'dark-blue', price: 400, color: '#00008B' },
];

export function buildDefaultBoardTiles(): BoardTile[] {
  // Use the full classic dataset and compute coordinates per current orientation
  return CLASSIC_TILES.map((t, pos) => {
    const { x, y } = posToXY(pos);
    return {
      name: t.name,
      pos,
      x,
      y,
      color: t.color ?? null,
      type: t.type,
      price: t.price,
      group: t.group,
    } as BoardTile;
  });
}

export function posToXY(pos: number): { x: number; y: number } {
  // Match server: GO at top-left (0,0), movement clockwise around edges on 11x11 grid.
  if (pos < 0 || pos > 39) return { x: 0, y: 0 };
  // Base mapping (top-left, clockwise)
  if (pos === 0) return { x: 0, y: 0 };
  if (pos >= 1 && pos <= 9) return { x: pos, y: 0 };
  if (pos === 10) return { x: 10, y: 0 };
  if (pos >= 11 && pos <= 19) return { x: 10, y: pos - 10 };
  if (pos === 20) return { x: 10, y: 10 };
  if (pos >= 21 && pos <= 29) return { x: 10 - (pos - 20), y: 10 };
  if (pos === 30) return { x: 0, y: 10 };
  // 31..39
  return { x: 0, y: 10 - (pos - 30) };
}
