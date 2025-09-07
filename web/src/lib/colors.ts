const PALETTE = [
  '#e74c3c', // red
  '#3498db', // blue
  '#2ecc71', // green
  '#f1c40f', // yellow
  '#9b59b6', // purple
  '#e67e22', // orange
  '#1abc9c', // teal
  '#e84393', // pink
];

export function getPlayerColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

export function buildPlayerColorMap(players: { name: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  players.forEach((p, i) => { map[p.name] = getPlayerColor(i); });
  return map;
}
