// Classic Monopoly rent tables and costs.
// Values from standard US edition. Mortgage value is 50% of price.

export type StreetRent = {
  base: number;
  withSet: number; // double when you own full color set and no houses
  house1: number;
  house2: number;
  house3: number;
  house4: number;
  hotel: number;
};

export type GroupInfo = {
  houseCost: number;
};

export const GROUP_HOUSE_COST: Record<string, GroupInfo> = {
  brown: { houseCost: 50 },
  'light-blue': { houseCost: 50 },
  pink: { houseCost: 100 },
  orange: { houseCost: 100 },
  red: { houseCost: 150 },
  yellow: { houseCost: 150 },
  green: { houseCost: 200 },
  'dark-blue': { houseCost: 200 },
};

export const STREET_RENTS: Record<string, StreetRent> = {
  // brown
  'Mediterranean Avenue': { base: 2, withSet: 4, house1: 10, house2: 30, house3: 90, house4: 160, hotel: 250 },
  'Baltic Avenue': { base: 4, withSet: 8, house1: 20, house2: 60, house3: 180, house4: 320, hotel: 450 },
  // light blue
  'Oriental Avenue': { base: 6, withSet: 12, house1: 30, house2: 90, house3: 270, house4: 400, hotel: 550 },
  'Vermont Avenue': { base: 6, withSet: 12, house1: 30, house2: 90, house3: 270, house4: 400, hotel: 550 },
  'Connecticut Avenue': { base: 8, withSet: 16, house1: 40, house2: 100, house3: 300, house4: 450, hotel: 600 },
  // pink
  'St. Charles Place': { base: 10, withSet: 20, house1: 50, house2: 150, house3: 450, house4: 625, hotel: 750 },
  'States Avenue': { base: 10, withSet: 20, house1: 50, house2: 150, house3: 450, house4: 625, hotel: 750 },
  'Virginia Avenue': { base: 12, withSet: 24, house1: 60, house2: 180, house3: 500, house4: 700, hotel: 900 },
  // orange
  'St. James Place': { base: 14, withSet: 28, house1: 70, house2: 200, house3: 550, house4: 750, hotel: 950 },
  'Tennessee Avenue': { base: 14, withSet: 28, house1: 70, house2: 200, house3: 550, house4: 750, hotel: 950 },
  'New York Avenue': { base: 16, withSet: 32, house1: 80, house2: 220, house3: 600, house4: 800, hotel: 1000 },
  // red
  'Kentucky Avenue': { base: 18, withSet: 36, house1: 90, house2: 250, house3: 700, house4: 875, hotel: 1050 },
  'Indiana Avenue': { base: 18, withSet: 36, house1: 90, house2: 250, house3: 700, house4: 875, hotel: 1050 },
  'Illinois Avenue': { base: 20, withSet: 40, house1: 100, house2: 300, house3: 750, house4: 925, hotel: 1100 },
  // yellow
  'Atlantic Avenue': { base: 22, withSet: 44, house1: 110, house2: 330, house3: 800, house4: 975, hotel: 1150 },
  'Ventnor Avenue': { base: 22, withSet: 44, house1: 110, house2: 330, house3: 800, house4: 975, hotel: 1150 },
  'Marvin Gardens': { base: 24, withSet: 48, house1: 120, house2: 360, house3: 850, house4: 1025, hotel: 1200 },
  // green
  'Pacific Avenue': { base: 26, withSet: 52, house1: 130, house2: 390, house3: 900, house4: 1100, hotel: 1275 },
  'North Carolina Avenue': { base: 26, withSet: 52, house1: 130, house2: 390, house3: 900, house4: 1100, hotel: 1275 },
  'Pennsylvania Avenue': { base: 28, withSet: 56, house1: 150, house2: 450, house3: 1000, house4: 1200, hotel: 1400 },
  // dark blue
  'Park Place': { base: 35, withSet: 70, house1: 175, house2: 500, house3: 1100, house4: 1300, hotel: 1500 },
  'Boardwalk': { base: 50, withSet: 100, house1: 200, house2: 600, house3: 1400, house4: 1700, hotel: 2000 },
};

export const RAILROAD_RENTS = [25, 50, 100, 200];

export function mortgageValue(price?: number) {
  if (!price || price <= 0) return 0;
  return Math.floor(price / 2);
}

export function houseCostForGroup(group?: string) {
  if (!group) return 0;
  return GROUP_HOUSE_COST[group]?.houseCost || 0;
}

export function getStreetRent(name: string): StreetRent | undefined {
  return STREET_RENTS[name];
}
