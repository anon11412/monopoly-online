export type LobbyInfo = {
  id: string;
  name: string;
  host_sid: string;
  players: string[];
  players_map?: Record<string, string>;
  ready?: string[];
  bots?: string[];
};

export type BoardTile = {
  name: string;
  pos: number;
  x: number;
  y: number;
  color?: string | null;
  type?: string;
  price?: number;
  group?: string;
};

export type GamePlayer = {
  name: string;
  cash: number;
  position: number;
  in_jail?: boolean;
  jail_cards?: number;
  color?: string;
};

export type TradeSide = {
  cash?: number;
  properties?: number[];
  jail_card?: boolean;
};

export type TradeOffer = {
  id: string | number;
  from: string; // player name
  to: string;   // player name
  give?: TradeSide;
  receive?: TradeSide;
};

export type GameSnapshot = {
  players: GamePlayer[];
  current_turn: number;
  board_len: number;
  properties?: Record<string | number, PropertyStateLike>;
  last_action?: any;
  log?: Array<{ type: string; text?: string; [k: string]: any }>;
  // Optional rule/UI helpers
  rolled_this_turn?: boolean;
  rolls_left?: number;
  pending_trades?: TradeOffer[];
  // Optional tiles metadata included by server snapshot to avoid extra fetches
  tiles?: BoardTile[];
  // Advanced recurring obligations (if server includes them)
  recurring?: Array<{ id: string; from: string; to: string; amount: number; turns_left: number }>;
  // Stats & end state
  turns?: number;
  game_over?: { winner?: string | null; turns?: number; most_landed?: { pos?: number | null; name?: string | null; count?: number } | null } | null;
};

// Server may send variants; normalize into PropertyState
export type PropertyStateLike = Partial<PropertyState> & Record<string, any>;
export type PropertyState = {
  pos: number;
  owner?: string; // player name or id
  owner_color?: string; // hex color for owner
  houses: number; // 0-4
  hotel: boolean; // true if hotel present
  mortgaged: boolean;
};
