import type { BoardTile } from '../types';

// Updated international Monopoly board with emoji-enhanced special spaces
const CLASSIC_TILES: Array<Partial<BoardTile> & { name: string; type: string; price?: number; group?: string; color?: string | null; flag?: string }> = [
  { name: 'START ➡️', type: 'go' },
  { name: 'Salvador', type: 'property', group: 'brown', price: 60, color: '#8B4513', flag: '🇧🇷' },
  { name: 'Treasure 💰', type: 'chest' },
  { name: 'Rio', type: 'property', group: 'brown', price: 60, color: '#8B4513', flag: '🇧🇷' },
  { name: 'Income Tax', type: 'tax' },
  { name: 'Reading Railroad', type: 'railroad', group: 'railroad', price: 200 },
  { name: 'Tel Aviv', type: 'property', group: 'light-blue', price: 100, color: '#ADD8E6', flag: '🇮🇱' },
  { name: 'Chance ❓', type: 'chance' },
  { name: 'Haifa', type: 'property', group: 'light-blue', price: 100, color: '#ADD8E6', flag: '🇮🇱' },
  { name: 'Jerusalem', type: 'property', group: 'light-blue', price: 120, color: '#ADD8E6', flag: '🇮🇱' },
  { name: 'Just Visiting / In Prison 🚔', type: 'jail' },
  { name: 'Venice', type: 'property', group: 'pink', price: 140, color: '#FF69B4', flag: '🇮🇹' },
  { name: 'Electric Company ⚡', type: 'utility', group: 'utility', price: 150 },
  { name: 'Milan', type: 'property', group: 'pink', price: 140, color: '#FF69B4', flag: '🇮🇹' },
  { name: 'Rome', type: 'property', group: 'pink', price: 160, color: '#FF69B4', flag: '🇮🇹' },
  { name: 'Pennsylvania Railroad', type: 'railroad', group: 'railroad', price: 200 },
  { name: 'Frankfurt', type: 'property', group: 'orange', price: 180, color: '#FFA500', flag: '🇩🇪' },
  { name: 'Treasure 💰', type: 'chest' },
  { name: 'Munich', type: 'property', group: 'orange', price: 180, color: '#FFA500', flag: '🇩🇪' },
  { name: 'Berlin', type: 'property', group: 'orange', price: 200, color: '#FFA500', flag: '🇩🇪' },
  { name: 'Vacation 🏖️', type: 'free' },
  { name: 'Shenzhen', type: 'property', group: 'red', price: 220, color: '#FF0000', flag: '🇨🇳' },
  { name: 'Chance ❓', type: 'chance' },
  { name: 'Beijing', type: 'property', group: 'red', price: 220, color: '#FF0000', flag: '🇨🇳' },
  { name: 'Shanghai', type: 'property', group: 'red', price: 240, color: '#FF0000', flag: '🇨🇳' },
  { name: 'B. & O. Railroad', type: 'railroad', group: 'railroad', price: 200 },
  { name: 'Lyon', type: 'property', group: 'yellow', price: 260, color: '#FFFF00', flag: '🇫🇷' },
  { name: 'Toulouse', type: 'property', group: 'yellow', price: 260, color: '#FFFF00', flag: '🇫🇷' },
  { name: 'Water Works 🚰', type: 'utility', group: 'utility', price: 150 },
  { name: 'Paris', type: 'property', group: 'yellow', price: 280, color: '#FFFF00', flag: '🇫🇷' },
  { name: 'Go to Prison 📜', type: 'gotojail' },
  { name: 'Liverpool', type: 'property', group: 'green', price: 300, color: '#008000', flag: '🇬🇧' },
  { name: 'Manchester', type: 'property', group: 'green', price: 300, color: '#008000', flag: '🇬🇧' },
  { name: 'Treasure 💰', type: 'chest' },
  { name: 'London', type: 'property', group: 'green', price: 320, color: '#008000', flag: '🇬🇧' },
  { name: 'Short Line', type: 'railroad', group: 'railroad', price: 200 },
  { name: 'Chance ❓', type: 'chance' },
  { name: 'San Francisco', type: 'property', group: 'dark-blue', price: 350, color: '#00008B', flag: '🇺🇸' },
  { name: 'Luxury Tax', type: 'tax' },
  { name: 'New York', type: 'property', group: 'dark-blue', price: 400, color: '#00008B', flag: '🇺🇸' },
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
      flag: (t as any).flag,
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
