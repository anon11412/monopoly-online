from __future__ import annotations

import asyncio
import time
import math
import os
import random
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import socketio


# ---------------------------
# In-memory game structures
# ---------------------------

@dataclass
class Player:
    name: str
    cash: int = 1500
    position: int = 0
    in_jail: bool = False
    jail_turns: int = 0  # consecutive jail turns without doubles
    doubles_count: int = 0  # consecutive doubles in this turn
    jail_cards: int = 0  # Get Out of Jail Free cards held
    color: Optional[str] = None
    auto_mortgage: bool = False  # automatically mortgage properties when needed for purchases
    auto_buy_houses: bool = False  # automatically buy houses evenly after completing a color set


@dataclass
class PropertyState:
    pos: int
    owner: Optional[str] = None
    houses: int = 0
    hotel: bool = False
    mortgaged: bool = False


@dataclass
class Game:
    players: List[Player]
    current_turn: int = 0
    properties: Dict[int, PropertyState] = field(default_factory=dict)
    last_action: Optional[Dict[str, Any]] = None
    log: List[Dict[str, Any]] = field(default_factory=list)
    # Spending/income ledger entries: {ts, turn, round, type, from, to, amount, meta}
    ledger: List[Dict[str, Any]] = field(default_factory=list)
    rolls_left: int = 1  # remaining rolls in current turn (doubles grant extra)
    pending_trades: List[Dict[str, Any]] = field(default_factory=list)
    rolled_this_turn: bool = False
    # Recurring obligations created via advanced trades: {id, from, to, amount, turns_left}
    recurring: List[Dict[str, Any]] = field(default_factory=list)
    # Round counter: increments when turn cycles back to first player
    round: int = 0
    # Count landings per tile position
    land_counts: Dict[int, int] = field(default_factory=dict)
    # Total turns advanced (end_turns)
    turns: int = 0
    # Game over summary when finished
    game_over: Optional[Dict[str, Any]] = None
    # Per-player stocks system (cash-basis pricing)
    # owner -> { owner, total_shares, holdings: { investor: shares },
    #            allow_investing, enforce_min_buy, min_buy,
    #            enforce_min_pool, min_pool_total, min_pool_owner }
    stocks: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    # Property rental agreements: { id, renter, owner, properties: [pos], percentage, turns_left, cash_paid }
    property_rentals: List[Dict[str, Any]] = field(default_factory=list)
    # Cache of recently completed/declined trades for detail view (id -> trade dict)
    recent_trades: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    # Bonds settings per owner: owner -> { allow_bonds, rate_percent, period_turns, history: [{turn, rate}] }
    bonds: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    # Bonds investments: list of { owner, investor, principal }
    bond_investments: List[Dict[str, Any]] = field(default_factory=list)
    # Per-player turn counts to schedule periodic bond coupons
    turn_counts: Dict[str, int] = field(default_factory=dict)
    # Outstanding debts: debtor -> list of { creditor, amount }
    debts: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict)

    def snapshot(self) -> Dict[str, Any]:
        # Defensive: ensure pending_trades list exists
        if not isinstance(self.pending_trades, list):
            self.pending_trades = []
        # Defensive: ensure property_rentals list exists
        if not isinstance(self.property_rentals, list):
            self.property_rentals = []
        return {
            "players": [asdict(p) for p in self.players],
            "current_turn": self.current_turn,
            "board_len": 40,
            "properties": {str(k): asdict(v) for k, v in self.properties.items()},
            "last_action": self.last_action,
            "log": self.log[-200:],
            # Recent financial ledger entries for spending visuals
            "ledger": list(self.ledger[-500:]),
            "pending_trades": list(self.pending_trades)[-50:],
            "rolls_left": self.rolls_left,
            "rolled_this_turn": self.rolled_this_turn,
            "recurring": self.recurring,
            "round": self.round,
            "turns": self.turns,
            "game_over": self.game_over,
            # Include tile meta for client UIs (names/types/prices/colors)
            "tiles": build_board_meta(),
            # Include computed stocks view
            "stocks": _stocks_snapshot(self),
            # Include property rental agreements
            "property_rentals": list(self.property_rentals),
            # Include bonds settings snapshot for UI
            "bonds": _bonds_snapshot(self),
            # Include computed bond payouts summary for UI
            "bond_payouts": _bond_payouts_snapshot(self),
            # Provide list of recent trade ids for clients to prime caches
            "recent_trade_ids": list(self.recent_trades.keys())[-100:],
        }


@dataclass
class Lobby:
    id: str
    name: str
    host_sid: str
    players: List[str] = field(default_factory=list)  # display names
    sid_to_name: Dict[str, str] = field(default_factory=dict)
    ready: List[str] = field(default_factory=list)  # sids
    game: Optional[Game] = None
    bots: List[str] = field(default_factory=list)  # bot player names
    bot_task_running: bool = False
    # Disconnect timers per player display name
    disconnect_deadlines: Dict[str, float] = field(default_factory=dict)
    # Vote-kick: target -> set of voter names
    kick_votes: Dict[str, List[str]] = field(default_factory=dict)
    # Vote-kick timer state
    kick_target: Optional[str] = None
    kick_deadline: Optional[float] = None  # monotonic deadline seconds
    # Simple chat history for lobby (recent messages only)
    chat: List[Dict[str, Any]] = field(default_factory=list)
    # Game settings
    starting_cash: int = 1500
    # Optional per-player chosen colors (name -> hex)
    player_colors: Dict[str, str] = field(default_factory=dict)
    
def _now_ms() -> int:
    try:
        return int(time.time() * 1000)
    except Exception:
        return 0

def _ledger_add(g: Game, t: str, src: Optional[str], dst: Optional[str], amount: int, meta: Optional[Dict[str, Any]] = None) -> None:
    try:
        if amount is None:
            amount = 0
        amount = int(amount)
    except Exception:
        amount = 0
    try:
        entry = {
            "ts": _now_ms(),
            "turn": int(g.turns or 0),
            "round": int(g.round or 0),
            "type": str(t),
            "from": src,
            "to": dst,
            "amount": amount,
            "meta": dict(meta or {}),
        }
        g.ledger.append(entry)
        # Trim to a reasonable size to avoid unbounded growth
        if len(g.ledger) > 5000:
            del g.ledger[:len(g.ledger) - 5000]
    except Exception:
        pass


def _ensure_debts(g: Game) -> Dict[str, List[Dict[str, Any]]]:
    if not hasattr(g, 'debts') or not isinstance(g.debts, dict):
        g.debts = {}
    return g.debts


def _debt_total(g: Game, debtor: str) -> int:
    dmap = _ensure_debts(g)
    total = 0
    for rec in dmap.get(debtor, []) or []:
        try:
            total += max(0, int(rec.get('amount') or 0))
        except Exception:
            continue
    return total


def _debt_add(g: Game, debtor: str, creditor: Optional[str], amount: int, meta: Optional[Dict[str, Any]] = None) -> None:
    try:
        amt = int(amount or 0)
    except Exception:
        amt = 0
    if not debtor or amt <= 0:
        return
    dmap = _ensure_debts(g)
    arr = list(dmap.get(debtor) or [])
    # Coalesce adjacent same-creditor entries when possible
    if arr and (arr[-1].get('creditor') == creditor):
        arr[-1]['amount'] = int(arr[-1].get('amount') or 0) + amt
    else:
        arr.append({'creditor': creditor, 'amount': amt})
    dmap[debtor] = arr
    # Log and ledger for transparency
    try:
        who = debtor
        to = creditor or 'bank'
        _ledger_add(g, 'debt_add', who, to, int(amt), dict(meta or {}))
        g.log.append({'type': 'debt_add', 'text': f"{who} incurred ${amt} debt to {to}"})
    except Exception:
        pass


def _route_inflow(g: Game, receiver_name: Optional[str], amount: int, reason: str, meta: Optional[Dict[str, Any]] = None) -> int:
    """Route inflow to receiver. If receiver has outstanding debts, automatically pay creditors FIFO.
    Returns the amount retained by the receiver after routing.
    - No overpay: pay up to min(inflow_remaining, debt_amount)
    - Partial trickle: continue until inflow exhausted or debts cleared
    - Records ledger entries per routed payment
    """
    if not receiver_name:
        return amount
    try:
        inflow = max(0, int(amount or 0))
    except Exception:
        inflow = 0
    if inflow <= 0:
        return 0
    dmap = _ensure_debts(g)
    debts = list(dmap.get(receiver_name) or [])
    if not debts:
        return inflow
    routed_total = 0
    new_debts: List[Dict[str, Any]] = []
    for rec in debts:
        if inflow <= 0:
            # Keep remaining entries as-is
            if (int(rec.get('amount') or 0) > 0):
                new_debts.append(rec)
            continue
        owed = max(0, int(rec.get('amount') or 0))
        if owed <= 0:
            continue
        pay = min(inflow, owed)
        if pay > 0:
            inflow -= pay
            routed_total += pay
            creditor = rec.get('creditor') or 'bank'
            # Apply payment to creditor's cash if it is a player
            cred_p = _find_player(g, creditor)
            if cred_p:
                cred_p.cash += pay
            # Reduce debt record
            rem = owed - pay
            if rem > 0:
                new_debts.append({'creditor': rec.get('creditor'), 'amount': rem})
            # Ledger/log entry per routed amount
            try:
                _ledger_add(g, 'debt_payment', receiver_name, creditor, int(pay), {**dict(meta or {}), 'reason': reason})
                g.log.append({'type': 'debt_payment', 'text': f"{receiver_name} auto-routed ${pay} to {creditor} ({reason})"})
            except Exception:
                pass
        else:
            new_debts.append(rec)
    # Update debts map
    dmap[receiver_name] = new_debts
    # Return retained amount
    return max(0, inflow)


# ---------------------------
# Server setup
# ---------------------------

app = FastAPI()
origins_env = os.environ.get("ALLOWED_ORIGINS", "*")
allowed = [o.strip() for o in origins_env.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed if allowed else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    ping_timeout=25,
    ping_interval=20,
    engineio_logger=False,
)
asgi = socketio.ASGIApp(sio, other_asgi_app=app)

# Track background bot tasks per lobby
BOT_TASKS: Dict[str, asyncio.Task] = {}
# Track kick timer tasks per lobby
KICK_TASKS: Dict[str, asyncio.Task] = {}
# Periodic lobby consistency validator task handle
LOBBY_VALIDATOR_TASK: Optional[asyncio.Task] = None


# ---------------------------
# Board metadata
# ---------------------------

def monopoly_tiles() -> List[Dict[str, Any]]:
    """Updated Monopoly tiles with international property names, emojis for special spaces."""
    T = [
    {"name": "𝗦𝗧𝗔𝗥𝗧 ➡️➡️", "type": "go"},  # Bubbly font START with two arrows
    {"name": "Salvador", "type": "property", "group": "brown", "price": 60, "color": "#8B4513", "rent": 2, "country": "🇧🇷", "flag": "🇧🇷"},
        {"name": "Treasure 💰", "type": "chest"},
    {"name": "Rio", "type": "property", "group": "brown", "price": 60, "color": "#8B4513", "rent": 4, "country": "🇧🇷", "flag": "🇧🇷"},
        {"name": "Income Tax", "type": "tax"},
        {"name": "Reading Railroad", "type": "railroad", "group": "railroad", "price": 200},
    {"name": "Tel Aviv", "type": "property", "group": "light-blue", "price": 100, "color": "#ADD8E6", "rent": 6, "country": "🇮🇱", "flag": "🇮🇱"},
        {"name": "Chance ❓", "type": "chance"},
    {"name": "Haifa", "type": "property", "group": "light-blue", "price": 100, "color": "#ADD8E6", "rent": 6, "country": "🇮🇱", "flag": "🇮🇱"},
    {"name": "Jerusalem", "type": "property", "group": "light-blue", "price": 120, "color": "#ADD8E6", "rent": 8, "country": "🇮🇱", "flag": "🇮🇱"},
        {"name": "Just Visiting / In Prison 🚔", "type": "jail"},  # Keep upright
    {"name": "Venice", "type": "property", "group": "pink", "price": 140, "color": "#FF69B4", "rent": 10, "country": "🇮🇹", "flag": "🇮🇹"},
        {"name": "Electric Company ⚡", "type": "utility", "group": "utility", "price": 150},
    {"name": "Milan", "type": "property", "group": "pink", "price": 140, "color": "#FF69B4", "rent": 10, "country": "🇮🇹", "flag": "🇮🇹"},
    {"name": "Rome", "type": "property", "group": "pink", "price": 160, "color": "#FF69B4", "rent": 12, "country": "🇮🇹", "flag": "🇮🇹"},
        {"name": "Pennsylvania Railroad", "type": "railroad", "group": "railroad", "price": 200},
    {"name": "Frankfurt", "type": "property", "group": "orange", "price": 180, "color": "#FFA500", "rent": 14, "country": "🇩🇪", "flag": "🇩🇪"},
        {"name": "Treasure 💰", "type": "chest"},
    {"name": "Munich", "type": "property", "group": "orange", "price": 180, "color": "#FFA500", "rent": 14, "country": "🇩🇪", "flag": "🇩🇪"},
    {"name": "Berlin", "type": "property", "group": "orange", "price": 200, "color": "#FFA500", "rent": 16, "country": "🇩🇪", "flag": "🇩🇪"},
        {"name": "Vacation 🏖️", "type": "free"},  # Fixed: render upright
    {"name": "Shenzhen", "type": "property", "group": "red", "price": 220, "color": "#FF0000", "rent": 18, "country": "🇨🇳", "flag": "🇨🇳"},
        {"name": "Chance ❓", "type": "chance"},
    {"name": "Beijing", "type": "property", "group": "red", "price": 220, "color": "#FF0000", "rent": 18, "country": "🇨🇳", "flag": "🇨🇳"},
    {"name": "Shanghai", "type": "property", "group": "red", "price": 240, "color": "#FF0000", "rent": 20, "country": "🇨🇳", "flag": "🇨🇳"},
        {"name": "B. & O. Railroad", "type": "railroad", "group": "railroad", "price": 200},
    {"name": "Lyon", "type": "property", "group": "yellow", "price": 260, "color": "#FFFF00", "rent": 22, "country": "🇫🇷", "flag": "🇫🇷"},
    {"name": "Toulouse", "type": "property", "group": "yellow", "price": 260, "color": "#FFFF00", "rent": 22, "country": "🇫🇷", "flag": "🇫🇷"},
        {"name": "Water Works 🚰", "type": "utility", "group": "utility", "price": 150},
    {"name": "Paris", "type": "property", "group": "yellow", "price": 280, "color": "#FFFF00", "rent": 24, "country": "🇫🇷", "flag": "🇫🇷"},
        {"name": "Go to Prison 📜", "type": "gotojail"},  # Fixed: render upright with scroll icon
    {"name": "Liverpool", "type": "property", "group": "green", "price": 300, "color": "#008000", "rent": 26, "country": "🇬🇧", "flag": "🇬🇧"},
    {"name": "Manchester", "type": "property", "group": "green", "price": 300, "color": "#008000", "rent": 26, "country": "🇬🇧", "flag": "🇬🇧"},
        {"name": "Treasure 💰", "type": "chest"},
    {"name": "London", "type": "property", "group": "green", "price": 320, "color": "#008000", "rent": 28, "country": "🇬🇧", "flag": "🇬🇧"},
        {"name": "Short Line", "type": "railroad", "group": "railroad", "price": 200},
        {"name": "Chance ❓", "type": "chance"},
    {"name": "San Francisco", "type": "property", "group": "dark-blue", "price": 350, "color": "#00008B", "rent": 35, "country": "🇺🇸", "flag": "🇺🇸"},
        {"name": "Luxury Tax", "type": "tax"},
    {"name": "New York", "type": "property", "group": "dark-blue", "price": 400, "color": "#00008B", "rent": 50, "country": "🇺🇸", "flag": "🇺🇸"},
    ]
    for pos, t in enumerate(T):
        t["pos"] = pos
    return T

# Rent table for properties: pos -> [base, 1h, 2h, 3h, 4h, hotel]
RENT_TABLE: Dict[int, List[int]] = {
    1: [2, 10, 30, 90, 160, 250],
    3: [4, 20, 60, 180, 320, 450],
    6: [6, 30, 90, 270, 400, 550],
    8: [6, 30, 90, 270, 400, 550],
    9: [8, 40, 100, 300, 450, 600],
    11: [10, 50, 150, 450, 625, 750],
    13: [10, 50, 150, 450, 625, 750],
    14: [12, 60, 180, 500, 700, 900],
    16: [14, 70, 200, 550, 750, 950],
    18: [14, 70, 200, 550, 750, 950],
    19: [16, 80, 220, 600, 800, 1000],
    21: [18, 90, 250, 700, 875, 1050],
    23: [18, 90, 250, 700, 875, 1050],
    24: [20, 100, 300, 750, 925, 1100],
    26: [22, 110, 330, 800, 975, 1150],
    27: [22, 110, 330, 800, 975, 1150],
    29: [24, 120, 360, 850, 1025, 1200],
    31: [26, 130, 390, 900, 1100, 1275],
    32: [26, 130, 390, 900, 1100, 1275],
    34: [28, 150, 450, 1000, 1200, 1400],
    37: [35, 175, 500, 1100, 1300, 1500],
    39: [50, 200, 600, 1400, 1700, 2000],
}

# House cost per color group
HOUSE_COST_BY_GROUP: Dict[str, int] = {
    "brown": 50,
    "light-blue": 50,
    "pink": 100,
    "orange": 100,
    "red": 150,
    "yellow": 150,
    "green": 200,
    "dark-blue": 200,
}

def _group_positions(group: str) -> List[int]:
    return [t["pos"] for t in monopoly_tiles() if t.get("group") == group and t.get("type") == "property"]

def _mortgage_value(pos: int) -> int:
    tile = monopoly_tiles()[pos]
    price = int(tile.get("price") or 0)
    return price // 2


def _auto_mortgage_for_cash(game: Game, player: Player, needed_amount: int) -> int:
    """
    Auto-mortgage player's properties to raise cash for a purchase or debt payment.
    Returns the amount of cash raised through mortgaging.
    Mortgages properties without buildings, including color sets if no buildings exist.
    """
    if not player.auto_mortgage:
        return 0
    
    cash_raised = 0
    # Get all properties owned by this player that can be mortgaged
    owned_properties = []
    for pos, prop_state in game.properties.items():
        if prop_state.owner == player.name and not prop_state.mortgaged:
            tile = monopoly_tiles()[pos]
            group = tile.get("group")
            
            # Can mortgage if this property has no buildings AND no buildings in the group
            can_mortgage = prop_state.houses == 0 and not prop_state.hotel
            if can_mortgage and group:
                # Check if any property in the group has buildings
                for p in _group_positions(group):
                    ps = game.properties.get(p)
                    # Only the current player's buildings should block mortgaging this group's properties
                    if ps and ps.owner == player.name and (ps.houses > 0 or ps.hotel):
                        can_mortgage = False
                        break
            
            if can_mortgage:
                mortgage_value = _mortgage_value(pos)
                # Determine if this is a singleton (player does not own the full color set)
                is_singleton = True
                if group:
                    group_positions = _group_positions(group)
                    if group_positions:
                        owns_full_set = all((game.properties.get(p) or PropertyState(pos=p)).owner == player.name for p in group_positions)
                        is_singleton = not owns_full_set
                owned_properties.append((pos, mortgage_value, tile.get("name", f"Property {pos}"), is_singleton))
    
    # Sort by priority: singletons first, then by mortgage value (highest first)
    # Tuple format: (pos, mortgage_value, name, is_singleton)
    owned_properties.sort(key=lambda x: (not x[3], x[1]), reverse=True)
    
    # Mortgage properties until we have enough cash or run out of properties
    for pos, mortgage_value, prop_name, _is_single in owned_properties:
        # Stop if we've already met the cash requirement
        if player.cash >= needed_amount:
            break

        # Mortgage this property
        prop_state = game.properties[pos]
        prop_state.mortgaged = True
        retained = _route_inflow(game, player.name, int(mortgage_value), "mortgage", {"pos": pos})
        player.cash += retained
        cash_raised += mortgage_value

        # Add to game log
        game.log.append({
            "type": "auto_mortgage",
            "text": f"{player.name} auto-mortgaged {prop_name} for ${mortgage_value}"
        })
    
    return cash_raised


def _auto_buy_houses_even(game: Game, player: Player, group: str) -> int:
    """
    Attempt to buy houses evenly across a completed color group using available cash.
    Returns total spent. Respects mortgaged state (won't build if any mortgaged) and even-building rules.
    """
    if not group:
        return 0
    positions = _group_positions(group)
    if not positions:
        return 0
    # Must own all and none mortgaged
    states = [game.properties.get(p) or PropertyState(pos=p) for p in positions]
    if not all(s.owner == player.name for s in states):
        return 0
    if any(s.mortgaged for s in states):
        return 0
    house_cost = HOUSE_COST_BY_GROUP.get(group, 0)
    if house_cost <= 0:
        return 0

    def can_build_even_local(target_pos: int, delta: int) -> bool:
        counts = [s.houses + (5 if s.hotel else 0) for s in states]
        idx = [s.pos for s in states].index(target_pos)
        counts[idx] += delta
        return (max(counts) - min(counts)) <= 1 and all(0 <= c <= 5 for c in counts)

    spent = 0
    # Greedy even-building: repeatedly pass through properties adding 1 where allowed
    while player.cash >= house_cost:
        progressed = False
        for i, s in enumerate(states):
            if s.hotel:
                continue
            if s.houses >= 4:
                # Hotel requires special action in our rules; skip auto hotel
                continue
            if not can_build_even_local(s.pos, +1):
                continue
            # Buy one house
            s.houses += 1
            player.cash -= house_cost
            spent += house_cost
            game.properties[s.pos] = s
            tile = monopoly_tiles()[s.pos]
            game.log.append({"type": "auto_buy_house", "text": f"{player.name} auto-bought a house on {tile.get('name')} for ${house_cost}"})
            progressed = True
            if player.cash < house_cost:
                break
        if not progressed:
            break
    return spent


def _auto_sell_houses_for_cash(game: Game, player: Player, needed_amount: int) -> int:
    """
    Auto-sell houses/hotels to raise cash for debt payments.
    Sells buildings evenly across color groups to maintain property development balance.
    Returns the amount of cash raised through selling buildings.
    """
    if not player.auto_mortgage:
        return 0
    
    cash_raised = 0
    
    # Determine target cash threshold:
    # - If needed_amount > 0: raise cash until player.cash >= needed_amount (e.g., for purchases)
    # - If needed_amount <= 0: raise cash until player.cash >= 0 (clear debt)
    def need_more_cash() -> bool:
        target = needed_amount if needed_amount and needed_amount > 0 else 0
        return player.cash < target
    
    # Continue selling buildings until we have enough cash or no more buildings
    # Note: We only compare against player.cash to avoid double-counting with cash_raised.
    while need_more_cash():
        # Get all properties with buildings, grouped by color group
        groups_with_buildings = {}
        for pos, prop_state in game.properties.items():
            if prop_state.owner == player.name and (prop_state.houses > 0 or prop_state.hotel):
                tile = monopoly_tiles()[pos]
                group = tile.get("group", "unknown")
                if group not in groups_with_buildings:
                    groups_with_buildings[group] = []
                groups_with_buildings[group].append((pos, prop_state, tile))
        
        if not groups_with_buildings:
            break  # No more buildings to sell
        
        # For each color group, find the property with the most buildings and sell one
        sold_something = False
        for group, properties in groups_with_buildings.items():
            # Sort properties in this group by building count (hotels count as 5, houses as actual count)
            properties.sort(key=lambda x: (5 if x[1].hotel else x[1].houses), reverse=True)
            
            # Sell one building from the property with the most buildings in this group
            pos, prop_state, tile = properties[0]
            house_cost = HOUSE_COST_BY_GROUP.get(group, 50)
            
            if prop_state.hotel:
                # Sell hotel, convert to 4 houses
                sell_value = house_cost * 5 // 2
                prop_state.hotel = False
                prop_state.houses = 4
                building_type = "hotel"
            elif prop_state.houses > 0:
                # Sell one house
                sell_value = house_cost // 2
                prop_state.houses -= 1
                building_type = "house"
            else:
                continue  # No buildings on this property
            
            retained = _route_inflow(game, player.name, int(sell_value), "sell_building", {"pos": pos, "building": building_type})
            player.cash += retained
            cash_raised += sell_value
            sold_something = True
            
            # Add to game log
            game.log.append({
                "type": "auto_sell_building", 
                "text": f"{player.name} auto-sold {building_type} on {tile.get('name', f'Property {pos}')} for ${sell_value}"
            })
            
            # Check if we have enough cash now
            if not need_more_cash():
                break
        
        if not sold_something:
            break  # No buildings were sold this round, avoid infinite loop
    
    return cash_raised


def _auto_unmortgage_for_houses(game: Game, player: Player, group: str) -> int:
    """
    Auto-unmortgage properties in a color group to allow house building.
    Returns the amount of cash spent on unmortgaging.
    """
    if not player.auto_mortgage or not group:
        return 0
    
    cash_spent = 0
    group_positions = _group_positions(group)
    
    for pos in group_positions:
        prop_state = game.properties.get(pos) or PropertyState(pos=pos)
        if prop_state.owner == player.name and prop_state.mortgaged:
            principal = _mortgage_value(pos)
            payoff = principal + math.ceil(principal * 0.1)
            
            if player.cash >= payoff:
                player.cash -= payoff
                prop_state.mortgaged = False
                game.properties[pos] = prop_state
                cash_spent += payoff
                
                tile = monopoly_tiles()[pos]
                game.log.append({
                    "type": "auto_unmortgage",
                    "text": f"{player.name} auto-unmortgaged {tile.get('name', f'Property {pos}')} for ${payoff}"
                })
    
    return cash_spent


def _handle_negative_cash(game: Game, player: Player) -> bool:
    """
    Handle negative cash by automatically mortgaging properties first, then selling buildings if still negative.
    Returns True if the debt was resolved, False if bankruptcy is required.
    """
    if not player.auto_mortgage or player.cash >= 0:
        return True
    
    original_debt = -player.cash
    
    # First, try to mortgage properties
    mortgage_cash_raised = _auto_mortgage_for_cash(game, player, -player.cash)
    
    # If still negative after mortgaging, sell houses evenly
    houses_cash_raised = 0
    if player.cash < 0:
        # Sell buildings until player is no longer negative
        houses_cash_raised = _auto_sell_houses_for_cash(game, player, 0)
    
    total_raised = houses_cash_raised + mortgage_cash_raised
    if total_raised > 0:
        actions = []
        if mortgage_cash_raised > 0:
            actions.append(f"mortgaged: ${mortgage_cash_raised}")
        if houses_cash_raised > 0:
            actions.append(f"sold buildings: ${houses_cash_raised}")
        
        game.log.append({
            "type": "auto_debt_payment",
            "text": f"{player.name} auto-resolved ${original_debt} debt ({', '.join(actions)})"
        })
    
    return player.cash >= 0


def build_board_meta() -> List[Dict[str, Any]]:
    tiles = []
    for t in monopoly_tiles():
        x, y = pos_to_xy(t["pos"])
        tiles.append({**t, "x": x, "y": y, "color": t.get("color")})
    return tiles


def pos_to_xy(pos: int) -> tuple[int, int]:
    """Top-left origin, clockwise traversal.
    - GO is at (0,0).
    - Tiles 1..9 go left-to-right along the top row.
    - 10 at top-right (10,0), then 11..19 go down the right column.
    - 20 at bottom-right (10,10), then 21..29 go right-to-left along bottom.
    - 30 at bottom-left (0,10), then 31..39 go up the left column.
    """
    if pos < 0 or pos > 39:
        return 0, 0
    if pos == 0:
        return 0, 0
    if 1 <= pos <= 9:
        return pos, 0
    if pos == 10:
        return 10, 0
    if 11 <= pos <= 19:
        return 10, pos - 10
    if pos == 20:
        return 10, 10
    if 21 <= pos <= 29:
        return 10 - (pos - 20), 10
    if pos == 30:
        return 0, 10
    # 31..39
    return 0, 10 - (pos - 30)


@app.get("/board_meta")
async def board_meta():
    return JSONResponse({"tiles": build_board_meta()})

@app.get("/healthz")
async def healthz():
    return JSONResponse({"ok": True})

@app.get("/trade/{lobby_id}/{trade_id}")
async def get_trade(lobby_id: str, trade_id: str):
    l = LOBBIES.get(lobby_id)
    if not l or not l.game:
        return JSONResponse({"error": "lobby_or_game_missing"}, status_code=404)
    g = l.game
    # Look in pending first
    pending = next((t for t in g.pending_trades if str(t.get("id")) == str(trade_id)), None)
    if pending:
        return JSONResponse({"trade": pending, "status": "pending"})
    # Then recent cache
    recent = g.recent_trades.get(str(trade_id))
    if recent:
        return JSONResponse({"trade": recent, "status": "archived"})
    return JSONResponse({"error": "not_found"}, status_code=404)

# Optionally serve static frontend if directory is present
STATIC_DIR = os.environ.get("SERVE_STATIC_DIR", "/app/static")
try:
    if os.path.isdir(STATIC_DIR):
        app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
except Exception:
    pass


# ---------------------------
# Lobby management
# ---------------------------

LOBBIES: Dict[str, Lobby] = {}
USERNAMES: Dict[str, str] = {}  # sid -> display
# Track per-connection client IDs for multi-tab isolation
CLIENT_IDS: Dict[str, str] = {}  # sid -> client_id


def lobby_state(l: Lobby) -> Dict[str, Any]:
    # Compute seconds remaining for any disconnect deadlines (monotonic clock)
    loop = asyncio.get_event_loop()
    now = loop.time() if loop else 0.0
    remain = {name: max(0, int(deadline - now)) for name, deadline in l.disconnect_deadlines.items()}
    # Remaining seconds for kick deadline
    kick_remaining = None
    if l.kick_deadline:
        kick_remaining = int(max(0, (l.kick_deadline - now)))
    # Compute vote-kick derived data
    # Active, non-bot player count for majority threshold
    total_players = len([p for p in l.players if p not in (l.bots or [])])
    required_votes = (total_players // 2) + 1 if total_players > 0 else 1
    # Count current votes for active target
    votes_count = 0
    if l.kick_target:
        votes_count = len(set(l.kick_votes.get(l.kick_target, []) or []))
    return {
        "id": l.id,
        "name": l.name,
        "host_sid": l.host_sid,
        "players": l.players,
        "players_map": l.sid_to_name,
        "ready": l.ready,
    "bots": l.bots,
    "kick_votes": {k: list(set(v)) for k, v in l.kick_votes.items()},
        "kick_target": l.kick_target,
        "kick_remaining": kick_remaining,
        "kick_required": required_votes,
        "kick_votes_count": votes_count,
        "disconnect_remain": remain,
        "chat": l.chat[-50:],
        "starting_cash": l.starting_cash,
        "player_colors": l.player_colors,
    }


@sio.event
async def connect(sid, environ, auth):
    # No implicit lobby join on bare connect
    # Keep optional client_id from auth for early availability
    try:
        cid = None
        if isinstance(auth, dict):
            cid = auth.get("client_id")
        if cid:
            CLIENT_IDS[sid] = str(cid)
    except Exception:
        pass
    return


@sio.event
async def disconnect(sid):
    USERNAMES.pop(sid, None)
    CLIENT_IDS.pop(sid, None)
    # remove sid from lobbies
    for l in list(LOBBIES.values()):
        if sid in l.sid_to_name:
            name = l.sid_to_name.pop(sid)
            # Is there another active connection for the same display name?
            still_connected = any(v == name for v in l.sid_to_name.values())
            # If a game is not started yet, removing the player entirely is fine.
            # If a game is active, keep the name in the players list to support reconnection.
            # If a game is finished, we can remove the player entirely.
            game_finished = l.game and getattr(l.game, "game_over", None)
            if (not l.game or game_finished) and name in l.players and not still_connected:
                l.players.remove(name)
            if sid in l.ready:
                l.ready.remove(sid)
            # If the host disconnected, transfer host to another connected sid if available
            if l.host_sid == sid:
                l.host_sid = next(iter(l.sid_to_name.keys()), l.host_sid)
            # Track disconnect deadline if game active
            if l.game and name and not still_connected:
                loop = asyncio.get_event_loop()
                deadline = loop.time() + 120.0
                l.disconnect_deadlines[name] = deadline
                # Log and broadcast to all players in-game
                try:
                    if l.game:
                        secs = int(max(0, deadline - loop.time()))
                        l.game.log.append({"type": "disconnect", "text": f"{name} disconnected — {secs}s to reconnect"})
                        await sio.emit("game_state", {"lobby_id": l.id, "snapshot": l.game.snapshot()}, room=l.id)
                except Exception:
                    pass
                # schedule cleanup if not reconnected (auto-remove from game)
                async def timeout_check(lobby_id: str, pname: str, due: float):
                    await asyncio.sleep(max(0, due - asyncio.get_event_loop().time()))
                    l2 = LOBBIES.get(lobby_id)
                    if not l2:
                        return
                    # If player still not reconnected
                    if l2.disconnect_deadlines.get(pname, 0) <= asyncio.get_event_loop().time():
                        l2.disconnect_deadlines.pop(pname, None)
                        # If a game is running, remove player from game and release assets
                        if l2.game:
                            g = l2.game
                            # Remove properties and the player
                            for pos, st in list(g.properties.items()):
                                if st.owner == pname:
                                    st.owner = None
                                    st.houses = 0
                                    st.hotel = False
                                    st.mortgaged = False
                                    g.properties[pos] = st
                            g.players = [pl for pl in g.players if pl.name != pname]
                            if len(g.players) > 0:
                                g.current_turn = g.current_turn % len(g.players)
                            # Log removal
                            g.log.append({"type": "disconnect_kick", "text": f"{pname} removed after disconnect timeout"})
                            try:
                                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                            except Exception:
                                pass
                        await sio.emit("lobby_state", lobby_state(l2), room=lobby_id)
                asyncio.create_task(timeout_check(l.id, name, l.disconnect_deadlines[name]))
            await sio.emit("lobby_state", lobby_state(l), room=l.id)


@sio.event
async def auth(sid, data):
    USERNAMES[sid] = data.get("display") or f"User-{sid[:4]}"
    cid = data.get("client_id")
    if cid:
        CLIENT_IDS[sid] = str(cid)
    # Clear any pending disconnect deadline for this name in any lobby
    name = USERNAMES[sid]
    for l in LOBBIES.values():
        for k, v in list(l.disconnect_deadlines.items()):
            if k == name:
                l.disconnect_deadlines.pop(k, None)


@sio.event
async def lobby_list(sid):
    # Reuse consistency pass (no broadcast unless changed)
    await _lobby_consistency_pass(broadcast=False)
    active_lobbies = [lobby_state(l) for l in LOBBIES.values() if _lobby_visible(l)]
    await sio.emit("lobby_list", {"lobbies": active_lobbies}, to=sid)

def _lobby_visible(l: Lobby) -> bool:
    """Visibility rules for advertising in main menu.
    We do NOT surface lobbies that have any game object attached — active or finished —
    to prevent ended-game lobbies from reappearing as joinable.
    """
    # Hide any lobby that currently has a game object (active or finished)
    if l.game is not None:
        return False
    # Hide zero-player pre-game lobbies
    if len(l.players) == 0:
        return False
    return True

async def _lobby_consistency_pass(broadcast: bool = True):
    """Validate lobby membership vs live connections, prune empties.
    Returns True if any structural change occurred."""
    changed = False
    to_remove: List[str] = []
    for lobby_id, l in list(LOBBIES.items()):
        # Rebuild live players from connected sids
        connected_players: List[str] = []
        for s, name in list(l.sid_to_name.items()):
            try:
                await sio.get_session(s)
                connected_players.append(name)
            except Exception:
                # stale sid mapping removed lazily below
                pass
        new_players = list(dict.fromkeys(connected_players + (l.bots or [])))
        if new_players != l.players:
            l.players = new_players
            changed = True
        # Drop sid mappings for names no longer present
        before_sid_map = set(l.sid_to_name.keys())
        l.sid_to_name = {s: n for s, n in l.sid_to_name.items() if n in l.players}
        if set(l.sid_to_name.keys()) != before_sid_map:
            changed = True
        # Do not auto-clear finished games; keep l.game set so lobby stays hidden
        # until host explicitly rematches or resets.
        # Schedule removal if empty pre-game lobby OR empty finished-game lobby
        if len(l.players) == 0 and (not l.game or getattr(l.game, "game_over", None)):
            to_remove.append(lobby_id)
    for lobby_id in to_remove:
        LOBBIES.pop(lobby_id, None)
        changed = True
        try:
            await sio.emit("lobby_deleted", {"id": lobby_id})
        except Exception:
            pass
        print(f"[LOBBY_CLEANUP] Removed empty lobby {lobby_id}", flush=True)
    if changed and broadcast:
        try:
            visible = [lobby_state(x) for x in LOBBIES.values() if _lobby_visible(x)]
            await sio.emit("lobby_list", {"lobbies": visible})
        except Exception:
            pass
    return changed

async def _ensure_lobby_validator():
    global LOBBY_VALIDATOR_TASK
    if LOBBY_VALIDATOR_TASK and not LOBBY_VALIDATOR_TASK.done():
        return
    async def _loop():
        try:
            while True:
                await asyncio.sleep(20)
                try:
                    await _lobby_consistency_pass(broadcast=True)
                except Exception:
                    pass
        except asyncio.CancelledError:
            pass
    LOBBY_VALIDATOR_TASK = asyncio.create_task(_loop())


@sio.event
async def lobby_create(sid, data):
    lobby_id = f"l{random.randint(1000, 9999)}"
    name = data.get("name") or lobby_id
    l = Lobby(id=lobby_id, name=name, host_sid=sid)
    LOBBIES[lobby_id] = l
    # Fire creation event early (optimistic)
    try:
        await sio.emit("lobby_created", {"lobby": lobby_state(l)})
    except Exception:
        pass
    await lobby_join(sid, {"id": lobby_id})
    await _lobby_consistency_pass(broadcast=True)
    await _ensure_lobby_validator()
    return {"ok": True, "lobby": lobby_state(l)}

@sio.event
async def leave_lobby(sid, data):
    """Explicit client intent to leave current lobby. Removes membership immediately if game not active.
    If game active, keeps player in list (spectator potential) unless they were never in a started game.
    """
    lobby_id = data.get("id") or data.get("lobby_id")
    if not lobby_id or lobby_id not in LOBBIES:
        return {"ok": False, "error": "missing_lobby"}
    l = LOBBIES[lobby_id]
    name = l.sid_to_name.get(sid)
    if not name:
        return {"ok": True}
    # Remove sid mapping
    l.sid_to_name.pop(sid, None)
    # If game not started, drop from players entirely
    if not l.game and name in l.players:
        l.players.remove(name)
    # Transfer host if host left
    if l.host_sid == sid:
        l.host_sid = next(iter(l.sid_to_name.keys()), l.host_sid)
    await sio.emit("lobby_state", lobby_state(l), room=lobby_id)
    # Auto-delete empty lobby (no game & no players) after short delay
    if not l.game and len(l.players) == 0:
        async def _delayed_delete(lid: str):
            await asyncio.sleep(5)
            l2 = LOBBIES.get(lid)
            if l2 and not l2.game and len(l2.players) == 0:
                LOBBIES.pop(lid, None)
                try:
                    await sio.emit("lobby_deleted", {"id": lid})
                except Exception:
                    pass
                await _lobby_consistency_pass(broadcast=True)
        asyncio.create_task(_delayed_delete(lobby_id))
    return {"ok": True}


@sio.event
async def vote_kick(sid, data):
    lobby_id = data.get("id") or data.get("lobby_id")
    target = data.get("target")
    if not lobby_id or lobby_id not in LOBBIES:
        return
    l = LOBBIES[lobby_id]
    voter = l.sid_to_name.get(sid)
    if not voter or not target or target not in l.players:
        return
    
    # Host can instantly kick any player in pre-game lobby
    is_host = (sid == l.host_sid)
    is_pregame = (l.game is None)
    
    if is_host and is_pregame:
        # Host instant kick in pre-game lobby
        if target in l.players:
            l.players.remove(target)
        # Remove from session mapping
        target_sid = None
        for s, name in l.sid_to_name.items():
            if name == target:
                target_sid = s
                break
        if target_sid:
            del l.sid_to_name[target_sid]
        # Clear any existing votes
        l.kick_votes.pop(target, None)
        await sio.emit("lobby_state", lobby_state(l), room=lobby_id)
        return
    
    # During game, only allow targeting current turn player and use majority vote
    if not l.game or target != (l.game.players[l.game.current_turn].name if (0 <= l.game.current_turn < len(l.game.players)) else None):
        return
    votes = set(l.kick_votes.get(target, []))
    votes.add(voter)
    l.kick_votes[target] = list(votes)
    # Start or adjust timer: 1 vote -> 5 min, 2 votes -> at most 2 min remaining
    loop = asyncio.get_event_loop()
    now = loop.time() if loop else 0.0
    if l.kick_target != target:
        l.kick_target = target
        l.kick_deadline = now + 300  # 5 minutes default
        await _ensure_kick_timer(l)
    else:
        # If second unique vote arrives and more than 2 minutes remain, clamp to 2 minutes
        if len(votes) >= 2 and (l.kick_deadline or 0) - now > 120:
            l.kick_deadline = now + 120
    # Majority of active players (excluding bots)
    total = len([p for p in l.players if p not in l.bots])
    if len(votes) > total // 2:
        # Remove target from game if present; otherwise from lobby
        if l.game:
            # If target is a player in the game, convert their properties to bank and skip their turns
            for p in list(l.game.players):
                if p.name == target:
                    # release properties
                    for pos, st in list(l.game.properties.items()):
                        if st.owner == target:
                            st.owner = None
                            st.houses = 0
                            st.hotel = False
                            st.mortgaged = False
                            l.game.properties[pos] = st
                    l.game.players = [pl for pl in l.game.players if pl.name != target]
                    l.game.current_turn = l.game.current_turn % max(1, len(l.game.players))
                    break
        if target in l.players:
            l.players.remove(target)
        l.kick_votes.pop(target, None)
        l.kick_target = None
        l.kick_deadline = None
        # Cancel any existing timer
        t = KICK_TASKS.pop(lobby_id, None)
        if t:
            t.cancel()
    await sio.emit("lobby_state", lobby_state(l), room=lobby_id)


async def _ensure_kick_timer(l: Lobby):
    lid = l.id
    if KICK_TASKS.get(lid):
        return
    async def loop():
        try:
            while True:
                await asyncio.sleep(1)
                lref = LOBBIES.get(lid)
                if not lref or not lref.kick_target or not lref.kick_deadline:
                    break
                loop = asyncio.get_event_loop()
                now = loop.time() if loop else 0.0
                if now >= (lref.kick_deadline or 0):
                    target = lref.kick_target
                    if target and lref.game:
                        g = lref.game
                        # Kick only if target is still current and hasn't rolled
                        if 0 <= g.current_turn < len(g.players) and g.players[g.current_turn].name == target and not g.rolled_this_turn:
                            for p in list(g.players):
                                if p.name == target:
                                    for pos, st in list(g.properties.items()):
                                        if st.owner == target:
                                            st.owner = None
                                            st.houses = 0
                                            st.hotel = False
                                            st.mortgaged = False
                                            g.properties[pos] = st
                                    g.players = [pl for pl in g.players if pl.name != target]
                                    g.current_turn = g.current_turn % max(1, len(g.players))
                                    break
                            if target in lref.players:
                                lref.players.remove(target)
                            lref.kick_votes.pop(target, None)
                            lref.kick_target = None
                            lref.kick_deadline = None
                            await sio.emit("lobby_state", lobby_state(lref), room=lid)
                            await sio.emit("game_state", {"lobby_id": lid, "snapshot": g.snapshot()}, room=lid)
                    break
        finally:
            KICK_TASKS.pop(lid, None)
    KICK_TASKS[lid] = asyncio.create_task(loop())


@sio.event
async def get_players(sid, data):
    lobby_id = data.get("id") or data.get("lobby_id")
    if lobby_id in LOBBIES:
        l = LOBBIES[lobby_id]
        await sio.emit("players_list", {"players": l.players}, to=sid)


@sio.event
async def lobby_join(sid, data):
    lobby_id = data.get("id") or data.get("lobby_id")
    if not lobby_id or lobby_id not in LOBBIES:
        return {"ok": False, "error": "Lobby not found"}
    l = LOBBIES[lobby_id]
    name = USERNAMES.get(sid)
    if not name:
        # Attempt to reuse existing display for same client_id within this lobby
        cid = CLIENT_IDS.get(sid)
        if cid:
            try:
                for other_sid, nm in list(l.sid_to_name.items()):
                    if CLIENT_IDS.get(other_sid) == cid and nm:
                        name = nm
                        break
            except Exception:
                pass
    if not name:
        name = f"User-{sid[:4]}"
    
    # Simple solution: reject duplicate names instead of creating suffixes
    if name in l.players:
        return {"ok": False, "error": f"Name '{name}' is already taken. Please choose a different name."}
    
    # Add player with their exact name
    l.players.append(name)
    l.sid_to_name[sid] = name
    USERNAMES[sid] = name
    await sio.enter_room(sid, lobby_id)
    await sio.emit("lobby_joined", lobby_state(l), to=sid)
    await sio.emit("lobby_state", lobby_state(l), room=lobby_id)
    # If a game is already running, send the current snapshot to allow resume
    if l.game:
        try:
            print(f"[REJOIN] {name} rejoining active game in lobby {lobby_id}", flush=True)
        except Exception:
            pass
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": l.game.snapshot()}, to=sid)
    return {"ok": True, "lobby": lobby_state(l)}


@sio.event
async def lobby_ready(sid, data):
    lobby_id = data.get("id")
    ready = bool(data.get("ready"))
    if lobby_id not in LOBBIES:
        return
    l = LOBBIES[lobby_id]
    if ready and sid not in l.ready:
        l.ready.append(sid)
    if not ready and sid in l.ready:
        l.ready.remove(sid)
    await sio.emit("lobby_state", lobby_state(l), room=lobby_id)


@sio.event
async def lobby_setting(sid, data):
    lobby_id = data.get("id")
    setting = data.get("setting")
    value = data.get("value")
    if lobby_id not in LOBBIES:
        return {"ok": False, "error": "Lobby not found"}
    l = LOBBIES[lobby_id]
    actor = USERNAMES.get(sid) or l.sid_to_name.get(sid)
    # Validate setting
    if setting == "starting_cash":
        # Only host can change starting cash
        if sid != l.host_sid:
            return {"ok": False, "error": "Only host can change settings"}
        if not isinstance(value, (int, float)) or value < 1 or value > 25000:
            return {"ok": False, "error": "Starting cash must be between $1 and $25,000"}
        l.starting_cash = int(value)
    elif setting == "player_color":
        # value is hex string; only self may change their own color
        # If client provides a different target, reject
        req_target = data.get("player")
        target = actor
        if req_target and req_target != actor:
            return {"ok": False, "error": "You can only change your own color"}
        if not isinstance(value, str) or not value.startswith("#") or len(value) not in (4, 7):
            return {"ok": False, "error": "Invalid color"}
        if target not in l.players:
            return {"ok": False, "error": "Player not in lobby"}
        l.player_colors[target] = value
    else:
        return {"ok": False, "error": "Unknown setting"}
    await sio.emit("lobby_state", lobby_state(l), room=lobby_id)
    return {"ok": True}


@sio.event
async def lobby_start(sid, data):
    lobby_id = data.get("id")
    if lobby_id not in LOBBIES:
        return {"ok": False, "error": "Lobby missing"}
    l = LOBBIES[lobby_id]
    if sid != l.host_sid:
        return {"ok": False, "error": "Only host"}
    if len(l.players) < 2:
        return {"ok": False, "error": "Need at least 2 players"}
    
    # Check if all players are ready
    ready_sids = set(l.ready)
    player_sids = set(l.sid_to_name.keys())
    # Filter out bots from ready check (they're always considered ready)
    non_bot_players = [p for p in l.players if p not in (l.bots or [])]
    non_bot_sids = {sid for sid, name in l.sid_to_name.items() if name in non_bot_players}
    
    if not non_bot_sids.issubset(ready_sids):
        unready_players = [l.sid_to_name.get(sid, sid) for sid in non_bot_sids - ready_sids]
        return {"ok": False, "error": f"Not all players ready: {', '.join(unready_players)}"}

    players = [Player(name=p, cash=l.starting_cash) for p in l.players]
    game = Game(players=players)
    # Assign colors
    palette = [
        "#e74c3c", "#3498db", "#2ecc71", "#f1c40f",
        "#9b59b6", "#e67e22", "#1abc9c", "#e84393",
    ]
    for i, pl in enumerate(game.players):
        pl.color = palette[i % len(palette)]
    l.game = game
    # Seed initial time-series so charts show real data from turn 0
    try:
        # Record starting stock pool values (owner cash) for each player at current global turn (0)
        for pl in game.players:
            _record_stock_history_for(game, pl.name, overwrite=True)
    except Exception:
        pass
    try:
        # Initialize bond rate history at current turn for each player (even if 0%)
        for pl in game.players:
            st = _bonds_ensure(game, pl.name)
            turn0 = int(game.turns or 0)
            hist = list(st.get("history") or [])
            if not hist or (hist and hist[-1].get("turn") != turn0):
                rate0 = float(st.get("rate_percent") or 0.0)
                hist.append({"turn": turn0, "rate": rate0})
                st["history"] = hist[-500:]
            game.bonds[pl.name] = st
    except Exception:
        pass
    game.log.append({"type": "info", "text": f"Game started with players: {', '.join(l.players)}"})
    await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": game.snapshot()}, room=lobby_id)
    # Update lobby list so started lobby disappears
    await sio.emit("lobby_list", {"lobbies": [lobby_state(x) for x in LOBBIES.values() if not x.game]})
    # Start bot runner if needed
    await _ensure_bot_runner(l)
    return {"ok": True}


@sio.event
async def lobby_reset(sid, data):
    lobby_id = data.get("id") or data.get("lobby_id")
    l = LOBBIES.get(lobby_id)
    if not l:
        return
    # Only host can reset
    if sid != l.host_sid:
        return {"ok": False, "error": "Only host"}
    # Clear game and vote-kick/session timers
    l.game = None
    l.kick_votes.clear()
    l.kick_target = None
    l.kick_deadline = None
    t = KICK_TASKS.pop(lobby_id, None)
    if t:
        try:
            t.cancel()
        except Exception:
            pass
    # Clear disconnect deadlines
    l.disconnect_deadlines.clear()
    await sio.emit("lobby_state", lobby_state(l), room=lobby_id)
    # Re-advertise in lobby list
    await sio.emit("lobby_list", {"lobbies": [lobby_state(x) for x in LOBBIES.values() if not x.game]})
    return {"ok": True}


@sio.event
async def lobby_rematch(sid, data):
    """Create a new lobby with the same members and move everyone there. Only host can trigger."""
    lobby_id = data.get("id") or data.get("lobby_id")
    l = LOBBIES.get(lobby_id)
    if not l:
        return {"ok": False, "error": "Lobby missing"}
    if sid != l.host_sid:
        return {"ok": False, "error": "Only host"}
    # Create new lobby
    new_id = f"l{random.randint(1000, 9999)}"
    new_name = f"{l.name} (Rematch)"
    l2 = Lobby(id=new_id, name=new_name, host_sid=sid)
    # Preserve settings like starting cash
    l2.starting_cash = getattr(l, 'starting_cash', 1500)
    # Copy player list and bots
    l2.players = list(dict.fromkeys(l.players))
    l2.bots = list(l.bots)
    LOBBIES[new_id] = l2
    # Move all current connections (sids) into the new lobby room and map names
    for osid, pname in list(l.sid_to_name.items()):
        l2.sid_to_name[osid] = pname
        try:
            await sio.enter_room(osid, new_id)
            await sio.emit("lobby_joined", lobby_state(l2), to=osid)
        except Exception:
            pass
    # Clear old lobby membership and optionally remove it to avoid phantom listings
    old_id = l.id
    l.players = []
    l.sid_to_name.clear()
    # Remove old lobby entirely; it's finished and will be recreated via rematch flow
    try:
        LOBBIES.pop(old_id, None)
        await sio.emit("lobby_deleted", {"id": old_id})
    except Exception:
        pass
    # Notify new lobby state and update lobby list (new lobby has no game; old is deleted)
    await sio.emit("lobby_state", lobby_state(l2), room=new_id)
    await sio.emit("lobby_list", {"lobbies": [lobby_state(x) for x in LOBBIES.values() if not x.game]})
    return {"ok": True, "lobby": lobby_state(l2)}


# ---------------------------
# Game actions (minimal)
# ---------------------------

@sio.event
async def game_action(sid, data):
    lobby_id = data.get("id")
    action = data.get("action") or {}
    print(f"[GAME_ACTION] sid={sid[:6]}, lobby_id={lobby_id}, action={action}", flush=True)
    if lobby_id not in LOBBIES:
        print(f"[GAME_ACTION] Lobby {lobby_id} not found", flush=True)
        return {"ok": False, "error": "Lobby not found"}
    l = LOBBIES[lobby_id]
    g = l.game
    if not g:
        print(f"[GAME_ACTION] No game in lobby {lobby_id}", flush=True)
        return {"ok": False, "error": "No active game"}
    t = action.get("type")
    cur = g.players[g.current_turn]

    # Resolve actor display name from sid
    actor = USERNAMES.get(sid) or l.sid_to_name.get(sid) or f"User-{sid[:4]}"
    is_turn_actor = actor == cur.name
    print(f"[GAME_ACTION] actor='{actor}', cur.name='{cur.name}', is_turn_actor={is_turn_actor}, action_type={t}", flush=True)

    # Define which actions must be performed by the current-turn player
    turn_bound = {
        "roll_dice", "buy_property", "end_turn", "use_jail_card",
        "mortgage", "unmortgage", "buy_house", "sell_house", "buy_hotel", "sell_hotel",
    }
    
    # TEMPORARY: Be more permissive for debugging - allow anyone to roll if it's a single player game
    if t == "roll_dice" and len(g.players) == 1:
        print(f"[GAME_ACTION] Single player game - allowing {actor} to roll", flush=True)
        is_turn_actor = True
    
    if t in turn_bound and not is_turn_actor:
        print(f"[GAME_ACTION] Not your turn: {actor} tried {t}, expected {cur.name}", flush=True)
        g.last_action = {"type": "not_your_turn", "by": actor, "expected": cur.name, "action": t}
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return {"ok": False, "error": f"Not your turn. Expected: {cur.name}, Got: {actor}"}

    # Toggle auto-mortgage setting (available to any player at any time)
    if t == "toggle_auto_mortgage":
        # Find the player by actor name
        player = None
        for p in g.players:
            if p.name == actor:
                player = p
                break
        
        if player:
            player.auto_mortgage = not player.auto_mortgage
            g.last_action = {"type": "auto_mortgage_toggled", "by": actor, "enabled": player.auto_mortgage}
            g.log.append({"type": "auto_mortgage", "text": f"{actor} {'enabled' if player.auto_mortgage else 'disabled'} auto-mortgage"})
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return {"ok": True}

    # Bond settings (owner only)
    if t == "bond_settings":
        owner = actor
        st = _bonds_ensure(g, owner)
        # Only owner can update
        if owner != actor:
            g.last_action = {"type": "bond_settings_denied", "by": actor, "expected": owner}
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        allow = bool((action or {}).get("allow_bonds")) if ("allow_bonds" in (action or {})) else bool(st.get("allow_bonds", False))
        try:
            rate = float((action or {}).get("rate_percent") or 0.0)
        except Exception:
            rate = float(st.get("rate_percent") or 0.0)
        try:
            period = int((action or {}).get("period_turns") or st.get("period_turns") or 1)
        except Exception:
            period = int(st.get("period_turns") or 1)
        rate = max(0.0, min(100.0, rate))
        period = max(1, min(20, period))
        st["allow_bonds"] = allow
        st["rate_percent"] = rate
        st["period_turns"] = period
        # record history of rate per global turn
        try:
            turn = int(g.turns or 0)
            hist = list(st.get("history") or [])
            if hist and hist[-1].get("turn") == turn:
                hist[-1] = {"turn": turn, "rate": rate}
            else:
                hist.append({"turn": turn, "rate": rate})
            st["history"] = hist[-500:]
        except Exception:
            pass
        g.bonds[owner] = st
        g.last_action = {"type": "bond_settings", "owner": owner, "allow_bonds": allow, "rate_percent": rate, "period_turns": period}
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return {"ok": True}

    # Bond invest (investor -> owner's bond pool; owner pays coupons each period)
    if t == "bond_invest":
        owner = str((action or {}).get("owner") or "")
        amount = int((action or {}).get("amount") or 0)
        investor = actor
        if not owner or amount <= 0:
            return {"ok": False, "error": "invalid_params"}
        if investor == owner:
            return {"ok": False, "error": "owner_cannot_invest_in_own_bond"}
        owner_p = _find_player(g, owner)
        inv_p = _find_player(g, investor)
        st = _bonds_ensure(g, owner)
        if not owner_p or not inv_p:
            return {"ok": False, "error": "player_missing"}
        if not bool(st.get("allow_bonds", False)):
            g.last_action = {"type": "bond_invest_denied", "by": investor, "owner": owner, "reason": "disabled"}
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return {"ok": False, "error": "disabled"}
        if inv_p.cash < amount:
            g.last_action = {"type": "bond_invest_denied", "by": investor, "owner": owner, "reason": "insufficient_cash", "needed": amount}
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return {"ok": False, "error": "insufficient_cash"}
        inv_p.cash -= amount
        retained = _route_inflow(g, owner, int(amount), "bond_invest_principal", {"note": "principal transfer"})
        owner_p.cash += retained
        try:
            _ledger_add(g, "bond_invest", investor, owner, amount, {"note": "principal transfer"})
        except Exception:
            pass
        merged = False
        for entry in g.bond_investments:
            if entry.get("owner") == owner and entry.get("investor") == investor:
                entry["principal"] = int(entry.get("principal") or 0) + amount
                merged = True
                break
        if not merged:
            g.bond_investments.append({"owner": owner, "investor": investor, "principal": amount})
        g.last_action = {"type": "bond_invest", "by": investor, "owner": owner, "amount": amount}
        g.log.append({"type": "bond_invest", "text": f"{investor} invested ${amount} in {owner} bonds"})
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return {"ok": True}

    if t == "roll_dice":
        # Gate rolls by remaining moves this turn
        if g.rolls_left <= 0:
            g.last_action = {"type": "no_rolls", "by": cur.name}
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return

        # Process recurring payments at start of turn (first roll only)
        recurring_processed = False
        if not g.rolled_this_turn:
            try:
                print(f"[RECURRING_START] Processing for {cur.name}", flush=True)
            except Exception:
                pass
            _process_recurring_for(g, cur.name)
            # Process bond coupons for this player at start of turn
            _process_bonds_for(g, cur.name)
            recurring_processed = True
            # Mark that we've rolled this turn IMMEDIATELY to prevent re-processing on rapid clicks
            g.rolled_this_turn = True
            # If recurring payments caused negative balance, deny the roll but keep rolled_this_turn = True
            if cur.cash < 0:
                g.last_action = {"type": "roll_denied", "by": cur.name, "reason": "negative_after_recurring"}
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return {"ok": False, "action": "roll_dice", "reasons": ["negative_after_recurring"]}

        d1 = random.randint(1, 6)
        d2 = random.randint(1, 6)
        roll = d1 + d2

        # Mark that we've rolled this turn; set last_action first so UI can show dice consistently
        # (Already set above for recurring payment protection)
        g.rolled_this_turn = True
        g.last_action = {"type": "rolled", "by": cur.name, "roll": roll, "d1": d1, "d2": d2, "doubles": bool(d1 == d2)}
        g.log.append({"type": "rolled", "text": f"{cur.name} rolled {d1} + {d2} = {roll}"})
        # Broadcast a dice rolled sound to all players in the lobby
        try:
            await sio.emit("sound", {"event": "dice_rolled", "by": cur.name, "d1": d1, "d2": d2, "roll": roll}, room=lobby_id)
        except Exception:
            pass

        was_in_jail = cur.in_jail
        # Jail handling (minimal)
        if cur.in_jail:
            if d1 == d2:
                # Leave jail immediately and move
                cur.in_jail = False
                cur.jail_turns = 0
            else:
                cur.jail_turns += 1
                if cur.jail_turns < 3:
                    g.log.append({"type": "jail", "text": f"{cur.name} did not roll doubles and remains in jail ({cur.jail_turns}/3)"})
                    g.rolls_left = 0
                    await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                    return
                # On 3rd attempt, pay $50 and leave
                pay_now = min(max(0, cur.cash), 50)
                cur.cash -= pay_now
                if 50 - pay_now > 0:
                    _debt_add(g, cur.name, "bank", int(50 - pay_now), {"kind": "jail_fee"})
                g.log.append({"type": "jail", "text": f"{cur.name} paid $50 to leave jail on the 3rd attempt"})
                cur.in_jail = False
                cur.jail_turns = 0

        # Triples rule: three consecutive doubles in a turn -> immediate jail, do not move
        if d1 == d2 and not was_in_jail:
            cur.doubles_count += 1
            if cur.doubles_count >= 3:
                # Go directly to jail
                cur.position = 10
                cur.in_jail = True
                cur.jail_turns = 0
                cur.doubles_count = 0
                g.rolls_left = 0
                g.log.append({"type": "gotojail", "text": f"{cur.name} rolled three consecutive doubles and was sent to Jail"})
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return
        else:
            # reset doubles chain when not doubles or when coming from jail
            cur.doubles_count = 0

        # Move token and handle GO collection
        old_pos = cur.position
        new_pos = (cur.position + roll) % 40
        if old_pos + roll >= 40:
            retained = _route_inflow(g, cur.name, 200, "pass_go", None)
            cur.cash += retained
            g.log.append({"type": "pass_go", "text": f"{cur.name} collected $200 for passing GO"})
        cur.position = new_pos
        _record_land(g, new_pos)

        tiles = monopoly_tiles()
        tile = tiles[new_pos]

        # Go To Jail
        if tile.get("type") == "gotojail":
            cur.position = 10
            cur.in_jail = True
            cur.jail_turns = 0
            g.log.append({"type": "gotojail", "text": f"{cur.name} was sent to Jail"})
            g.rolls_left = 0
            _record_land(g, 10)
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return

        # Taxes
        if tile.get("type") == "tax":
            name = tile.get("name", "")
            amount = 0
            if "Income Tax" in name:
                # Apply 10% of total worth or $200, whichever is less
                tenpct = math.floor(_total_worth(g, cur) * 0.1)
                amount = min(200, tenpct)
            elif "Luxury Tax" in name:
                amount = 100
            if amount:
                pay_now = min(max(0, cur.cash), int(amount))
                cur.cash -= pay_now
                unpaid = int(amount) - pay_now
                if unpaid > 0:
                    _debt_add(g, cur.name, "bank", int(unpaid), {"name": name, "kind": "tax"})
                g.log.append({"type": "tax", "text": f"{cur.name} paid ${amount} in taxes"})
                try:
                    _ledger_add(g, "tax", cur.name, "bank", int(pay_now), {"name": name, "unpaid": int(unpaid)})
                except Exception:
                    pass

        # Chance / Community Chest (minimal subset)
        if tile.get("type") in {"chance", "chest"}:
            card = _draw_card(tile.get("type"))
            _apply_card(g, cur, card, last_roll=roll)
            # After card resolution, update tile (may have moved)
            new_pos = cur.position
            tile = tiles[new_pos]
            _record_land(g, new_pos)
            # If card sent to jail, end turn
            if cur.in_jail:
                g.rolls_left = 0
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return

            # Handle taxes if a card moved us onto a tax tile
            if tile.get("type") == "tax":
                name = tile.get("name", "")
                amount = 0
                if "Income Tax" in name:
                    tenpct = math.floor(_total_worth(g, cur) * 0.1)
                    amount = min(200, tenpct)
                elif "Luxury Tax" in name:
                    amount = 100
                if amount:
                    pay_now = min(max(0, cur.cash), int(amount))
                    cur.cash -= pay_now
                    unpaid = int(amount) - pay_now
                    if unpaid > 0:
                        _debt_add(g, cur.name, "bank", int(unpaid), {"name": name, "kind": "tax", "card_move": True})
                    g.log.append({"type": "tax", "text": f"{cur.name} paid ${amount} in taxes (card move)"})
                    try:
                        _ledger_add(g, "tax", cur.name, "bank", int(pay_now), {"name": name, "card_move": True, "unpaid": int(unpaid)})
                    except Exception:
                        pass

        # Rent payment
        rent_paid = False
        try:
            rent_paid = _handle_rent(g, cur, new_pos, d1 + d2)
            # Force sync if rental payments were made to ensure immediate UI update
            if rent_paid and any(rental.get("last_payment_turn") == g.turns for rental in _ensure_rentals(g)):
                await _force_sync_all_clients(lobby_id, g)
        except Exception:
            # Avoid crashing game on rent errors; continue
            pass

        # Rolls remaining logic
        if d1 == d2 and not was_in_jail:
            # Grant exactly one extra roll for doubles (not when leaving jail by doubles)
            g.rolls_left = 1
        else:
            g.rolls_left = 0
        # Any activity cancels kick votes/timer against current player
        for l in LOBBIES.values():
            if l.game is g:
                l.kick_votes.pop(cur.name, None)
                if l.kick_target == cur.name:
                    l.kick_target = None
                    l.kick_deadline = None
                    task = KICK_TASKS.pop(l.id, None)
                    if task:
                        try:
                            task.cancel()
                        except Exception:
                            pass
                # Inform lobby about cleared votes/timer
                await sio.emit("lobby_state", lobby_state(l), room=l.id)
                break

        await _broadcast_state(lobby_id, g)
        return

    # Buy current property (if eligible)
    if t == "buy_property":
        p = cur.position
        tiles = monopoly_tiles()
        tile = tiles[p]
        buyable = tile["type"] in {"property", "railroad", "utility"}
        price = int(tile.get("price") or 0)
        st = g.properties.get(p) or PropertyState(pos=p)
        
        # Check basic conditions first
        if not buyable:
            reason = "not_buyable"
        elif st.owner is not None:
            reason = "owned"
        elif price <= 0:
            reason = "no_price"
        elif cur.cash < price:
            # For purchases, don't sell houses; only auto-mortgage eligible singles
            houses_cash_raised = 0
            mortgage_cash_raised = _auto_mortgage_for_cash(g, cur, price)
            total_cash_raised = mortgage_cash_raised
            
            if cur.cash >= price:
                # Success! Purchase the property
                st.owner = cur.name
                g.properties[p] = st
                cur.cash -= price
                auto_actions = []
                if mortgage_cash_raised > 0:
                    auto_actions.append(f"auto-mortgaged for ${mortgage_cash_raised}")
                auto_text = f" ({', '.join(auto_actions)})" if auto_actions else ""
                
                g.last_action = {"type": "buy", "by": cur.name, "pos": p, "price": price, "name": tile["name"], "auto_actions": total_cash_raised > 0}
                g.log.append({"type": "buy", "text": f"{cur.name} bought {tile['name']} for ${price}{auto_text}"})
                try:
                    _ledger_add(g, "buy_property", cur.name, "bank", int(price), {"pos": p, "name": tile.get("name")})
                except Exception:
                    pass
                # If this completes a set and auto_buy_houses is enabled, auto-unmortgage group then buy houses evenly
                group = tile.get("group")
                if group and (all((g.properties.get(pp) or PropertyState(pos=pp)).owner == cur.name for pp in _group_positions(group))):
                    if cur.auto_buy_houses:
                        # Unmortgage within the group first if needed
                        _auto_unmortgage_for_houses(g, cur, group)
                        _auto_buy_houses_even(g, cur, group)
                try:
                    await sio.emit("sound", {"event": "property_purchased", "by": cur.name, "pos": p, "price": price}, room=lobby_id)
                except Exception:
                    pass
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return
            else:
                reason = "insufficient_cash"
        else:
            # Player has enough cash, purchase normally
            st.owner = cur.name
            g.properties[p] = st
            cur.cash -= price
            g.last_action = {"type": "buy", "by": cur.name, "pos": p, "price": price, "name": tile["name"]}
            g.log.append({"type": "buy", "text": f"{cur.name} bought {tile['name']} for ${price}"})
            try:
                _ledger_add(g, "buy_property", cur.name, "bank", int(price), {"pos": p, "name": tile.get("name")})
            except Exception:
                pass
            # If this completes a set and auto_buy_houses is enabled, auto-unmortgage group then buy houses evenly
            group = tile.get("group")
            if group and (all((g.properties.get(pp) or PropertyState(pos=pp)).owner == cur.name for pp in _group_positions(group))):
                if cur.auto_buy_houses:
                    _auto_unmortgage_for_houses(g, cur, group)
                    _auto_buy_houses_even(g, cur, group)
            try:
                await sio.emit("sound", {"event": "property_purchased", "by": cur.name, "pos": p, "price": price}, room=lobby_id)
            except Exception:
                pass
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        
        # Purchase failed
        g.last_action = {"type": "buy_failed", "by": cur.name, "pos": p, "reason": reason}
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return

    # Toggle auto-buy-houses setting
    if t == "toggle_auto_buy_houses":
        # Anyone can toggle for themselves
        for p in g.players:
            if p.name == actor:
                p.auto_buy_houses = not p.auto_buy_houses
                g.last_action = {"type": "auto_buy_houses_toggled", "by": actor, "enabled": p.auto_buy_houses}
                g.log.append({"type": "auto_buy_houses", "text": f"{actor} {'enabled' if p.auto_buy_houses else 'disabled'} auto-buy houses"})
                break
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return

    # Stocks: invest/sell/settings (owner-only dilution/redemption, cash-basis)
    if t in {"stock_invest", "stock_sell", "stock_settings"}:
        payload = action or {}
        owner = str(payload.get("owner") or "")
        if not owner:
            g.last_action = {"type": f"{t}_denied", "reason": "missing_owner"}
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        # Ensure stock exists
        st = _stocks_ensure(g, owner)
        price = _stock_price(g, owner)
        
        if t == "stock_settings":
            # Only owner can update settings
            if actor != owner:
                g.last_action = {"type": "stock_settings_denied", "by": actor, "expected": owner}
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return
            try:
                min_buy = int(payload.get("min_buy") or 0)
                if min_buy < 0:
                    min_buy = 0
            except Exception:
                min_buy = int(st.get("min_buy") or 0)
            allow_investing = bool(payload.get("allow_investing")) if ("allow_investing" in payload) else bool(st.get("allow_investing", False))
            enforce_min_buy = bool(payload.get("enforce_min_buy")) if ("enforce_min_buy" in payload) else bool(st.get("enforce_min_buy", False))
            try:
                min_pool_total = int(payload.get("min_pool_total") or 0)
                if min_pool_total < 0:
                    min_pool_total = 0
            except Exception:
                min_pool_total = int(st.get("min_pool_total") or 0)
            try:
                min_pool_owner = int(payload.get("min_pool_owner") or 0)
                if min_pool_owner < 0:
                    min_pool_owner = 0
            except Exception:
                min_pool_owner = int(st.get("min_pool_owner") or 0)
            # Support both legacy single flag and new independent flags
            enforce_min_pool = bool(payload.get("enforce_min_pool")) if ("enforce_min_pool" in payload) else bool(st.get("enforce_min_pool", False))
            enforce_min_pool_total = bool(payload.get("enforce_min_pool_total")) if ("enforce_min_pool_total" in payload) else bool(st.get("enforce_min_pool_total", enforce_min_pool))
            enforce_min_pool_owner = bool(payload.get("enforce_min_pool_owner")) if ("enforce_min_pool_owner" in payload) else bool(st.get("enforce_min_pool_owner", enforce_min_pool))
            
            st["allow_investing"] = allow_investing
            st["enforce_min_buy"] = enforce_min_buy
            st["min_buy"] = min_buy
            st["enforce_min_pool"] = enforce_min_pool  # Keep for backwards compatibility
            st["enforce_min_pool_total"] = enforce_min_pool_total
            st["enforce_min_pool_owner"] = enforce_min_pool_owner
            st["min_pool_total"] = min_pool_total
            st["min_pool_owner"] = min_pool_owner
            g.stocks[owner] = st
            g.last_action = {"type": "stock_settings", "owner": owner, "allow_investing": allow_investing, "enforce_min_buy": enforce_min_buy, "min_buy": min_buy, "enforce_min_pool": enforce_min_pool, "enforce_min_pool_total": enforce_min_pool_total, "enforce_min_pool_owner": enforce_min_pool_owner, "min_pool_total": min_pool_total, "min_pool_owner": min_pool_owner}
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        
        # Invest / sell
        shares = int(payload.get("shares") or 0)
        amount = payload.get("amount")
        percent = payload.get("percent")
        investor = actor
        inv_p = _find_player(g, investor)
        own_p = _find_player(g, owner)
        if not inv_p or not own_p:
                g.last_action = {"type": f"{t}_denied", "reason": "player_missing"}
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return
        # Invest: percent-of-pool model (A dollars into pool P)
        if t == "stock_invest":
            if investor == owner:
                g.last_action = {"type": "stock_invest_denied", "by": investor, "reason": "owner_cannot_invest"}
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return
            if not bool(st.get("allow_investing", True)):
                g.last_action = {"type": "stock_invest_denied", "by": investor, "reason": "disabled"}
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return
            A = int(float(amount or 0)) if isinstance(amount, (int, float)) else 0
            if A <= 0:
                g.last_action = {"type": "stock_invest_denied", "by": investor, "reason": "invalid_amount"}
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return
            P = int(own_p.cash)
            hold = dict(st.get("holdings") or {})
            # current percent and dollar stake
            p_cur = float(hold.get(investor) or 0.0)
            outside_sum = sum(float(v or 0.0) for v in hold.values())
            owner_percent = max(0.0, 1.0 - outside_sum)
            E = p_cur * float(P)
            # Enforce independent pool gates
            min_pool_total = int(st.get("min_pool_total") or 0)
            min_pool_owner = int(st.get("min_pool_owner") or 0)
            enforce_min_pool_total = bool(st.get("enforce_min_pool_total", st.get("enforce_min_pool", False)))
            enforce_min_pool_owner = bool(st.get("enforce_min_pool_owner", st.get("enforce_min_pool", False)))
            
            if enforce_min_pool_total and min_pool_total > 0 and P < min_pool_total:
                g.last_action = {"type": "stock_invest_denied", "by": investor, "reason": "below_min_pool_total", "needed": min_pool_total, "pool_value": P}
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return
            owner_value = owner_percent * float(P)
            if enforce_min_pool_owner and min_pool_owner > 0 and owner_value < float(min_pool_owner):
                g.last_action = {"type": "stock_invest_denied", "by": investor, "reason": "below_min_pool_owner", "needed": min_pool_owner, "owner_value": int(owner_value)}
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return
            min_buy = int(st.get("min_buy") or 0)
            if bool(st.get("enforce_min_buy", False)) and min_buy > 0 and A < min_buy:
                g.last_action = {"type": "stock_invest_denied", "by": investor, "reason": "below_min", "needed": min_buy, "cost": A}
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return
            if inv_p.cash < A:
                g.last_action = {"type": "stock_invest_denied", "by": investor, "reason": "insufficient_cash", "needed": A}
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return
            # Cash transfer
            inv_p.cash -= A
            retained = _route_inflow(g, owner, int(A), "stock_invest", {"pool_before": P})
            own_p.cash += retained
            try:
                _ledger_add(g, "stock_invest", investor, owner, A, {"pool_before": P, "pool_after": int(P_new) if 'P_new' in locals() else None})
            except Exception:
                pass
            # Recalculate percents based on dollar stakes
            P_new = float(P + A)
            # First compute each investor's dollar stake E_k from old percents
            stakes: Dict[str, float] = {}
            for k, pv in hold.items():
                try:
                    stakes[k] = max(0.0, float(pv)) * float(P)
                except Exception:
                    stakes[k] = 0.0
            stakes[investor] = float(stakes.get(investor) or 0.0) + float(A)
            # Convert back to percents under new pool
            new_hold: Dict[str, float] = {}
            if P_new > 0:
                total_pct_accum = 0.0
                ordered = list(stakes.items())
                for idx, (k, Ek) in enumerate(ordered):
                    if Ek <= 0.0:
                        continue
                    pct = max(0.0, min(1.0, float(Ek) / P_new))
                    # Drop dust below 0.000001 to avoid lingering microscopic holders
                    if pct < 0.000001:
                        continue
                    # Round to 1e-9 for stability
                    pct = round(pct, 9)
                    new_hold[k] = pct
                    total_pct_accum += pct
                # Normalize if accumulated percent drifts from 1.0 significantly
                if 0.0001 < total_pct_accum < 1.9999:
                    # Owner implicit percent = 1 - outside sum; clamp if rounding error pushes outside sum >1
                    if total_pct_accum > 1.0:
                        scale = 1.0 / total_pct_accum
                        for k in list(new_hold.keys()):
                            new_hold[k] = round(new_hold[k] * scale, 9)
                # Final cleanup: remove any entries that became zero after scaling
                for k in list(new_hold.keys()):
                    if new_hold[k] <= 0.0:
                        del new_hold[k]
            st["holdings"] = new_hold
            g.stocks[owner] = st
            g.last_action = {"type": "stock_invest", "by": investor, "owner": owner, "amount": A, "pool_before": P, "pool_after": int(P_new)}
            g.log.append({"type": "stock_invest", "text": f"{investor} invested ${A} into {owner} pool (P: ${P} → ${int(P_new)})"})
            try:
                _record_stock_history_for(g, owner, overwrite=True)
            except Exception:
                pass
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        if t == "stock_sell":
            hold = dict(st.get("holdings") or {})
            P = int(own_p.cash)
            p_cur = float(hold.get(investor) or 0.0)
            E = p_cur * float(P)
            if P <= 0 or E <= 0:
                g.last_action = {"type": "stock_sell_denied", "by": investor, "reason": "no_stake_or_pool"}
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return
            # Determine S (cash to redeem)
            S = 0
            if isinstance(percent, (int, float)) and float(percent) > 0:
                portion = max(0.0, min(1.0, float(percent)))
                S = int(portion * E)
            elif isinstance(amount, (int, float)) and float(amount) > 0:
                S = int(float(amount))
            elif isinstance(shares, (int, float)) and float(shares) > 0:
                # legacy path: treat shares as percent-of-base (100), convert to dollar stake
                S = int((float(shares) / 100.0) * E)
            # Clamp S by my stake and owner cash
            S = max(0, min(S, int(E), int(P)))
            if S <= 0:
                g.last_action = {"type": "stock_sell_denied", "by": investor, "reason": "invalid_amount"}
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return
            # Cash transfer
            own_p.cash -= S
            retained = _route_inflow(g, investor, int(S), "stock_sell", {"pool_before": P})
            inv_p.cash += retained
            try:
                _ledger_add(g, "stock_sell", owner, investor, S, {"pool_before": P, "pool_after": int(P_new) if 'P_new' in locals() else None})
            except Exception:
                pass
            P_new = float(P - S)
            # Recompute percents from old dollar stakes
            if P_new <= 0:
                st["holdings"] = {}
                g.stocks[owner] = st
                g.last_action = {"type": "stock_sell", "by": investor, "owner": owner, "amount": S, "pool_before": P, "pool_after": 0}
                g.log.append({"type": "stock_sell", "text": f"{investor} redeemed ${S} from {owner} pool (P: ${P} → $0)"})
                try:
                    _record_stock_history_for(g, owner, overwrite=True)
                except Exception:
                    pass
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
                return
            stakes: Dict[str, float] = {}
            for k, pv in hold.items():
                try:
                    stakes[k] = max(0.0, float(pv)) * float(P)
                except Exception:
                    stakes[k] = 0.0
            stakes[investor] = max(0.0, float(stakes.get(investor) or 0.0) - float(S))
            new_hold: Dict[str, float] = {}
            total_pct_accum = 0.0
            for k, Ek in stakes.items():
                if Ek <= 0.0:
                    continue
                pct = max(0.0, min(1.0, float(Ek) / float(P_new)))
                if pct < 0.000001:
                    continue
                pct = round(pct, 9)
                new_hold[k] = pct
                total_pct_accum += pct
            if 0.0001 < total_pct_accum < 1.9999 and total_pct_accum > 1.0:
                scale = 1.0 / total_pct_accum
                for k in list(new_hold.keys()):
                    new_hold[k] = round(new_hold[k] * scale, 9)
            for k in list(new_hold.keys()):
                if new_hold[k] <= 0.0:
                    del new_hold[k]
            st["holdings"] = new_hold
            g.stocks[owner] = st
            g.last_action = {"type": "stock_sell", "by": investor, "owner": owner, "amount": S, "pool_before": P, "pool_after": int(P_new)}
            g.log.append({"type": "stock_sell", "text": f"{investor} redeemed ${S} from {owner} pool (P: ${P} → ${int(P_new)})"})
            try:
                _record_stock_history_for(g, owner, overwrite=True)
            except Exception:
                pass
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return

    # End turn (advance player, reset roll state)
    if t == "end_turn":
        # Only allow ending turn after at least one roll and no remaining rolls
        # Exception: if the player is currently in jail, allow immediate end of turn
        # and normalize rolls_left to 0 to avoid UI deadlocks after jail events.
        if cur.in_jail and g.rolls_left > 0:
            g.rolls_left = 0
        deny_reasons = []
        if not g.rolled_this_turn and not cur.in_jail:
            deny_reasons.append("no_roll_yet")
        if g.rolls_left > 0 and not cur.in_jail:
            deny_reasons.append(f"rolls_left_{g.rolls_left}")
        if cur.cash < 0:
            # Will also be caught by later negative balance check, but log early.
            pass
        if deny_reasons:
            g.last_action = {"type": "end_turn_denied", "by": cur.name, "reasons": deny_reasons}
            try:
                print(f"[ENDTURN][DENY] {cur.name} -> {deny_reasons}", flush=True)
            except Exception:
                pass
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return {"ok": False, "action": "end_turn", "reasons": deny_reasons}
        # Disallow ending turn with negative balance
        if cur.cash < 0:
            g.last_action = {"type": "end_turn_denied", "by": cur.name, "reason": "negative_balance"}
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return {"ok": False, "action": "end_turn", "reasons": ["negative_balance"]}
        # Recurring payments now handled at start of turn (in roll_dice), not here
        prev = g.current_turn
        g.current_turn = (g.current_turn + 1) % len(g.players)
        if g.current_turn == 0 and prev != 0:
            g.round += 1
        g.rolls_left = 1
        g.rolled_this_turn = False
        cur.doubles_count = 0
        # Increment per-player turn count for scheduling bond coupons
        try:
            g.turn_counts[cur.name] = int(g.turn_counts.get(cur.name) or 0) + 1
        except Exception:
            pass
        g.last_action = {"type": "end_turn", "by": cur.name}
        g.log.append({"type": "end_turn", "text": f"{cur.name} ended their turn"})
        g.turns += 1
        # Process property rental expiry
        _process_rental_turn_expiry(g)
        try:
            _record_stock_history(g)
        except Exception:
            pass
        # Cancel any active kick votes/timer targeting the player who just ended turn
        for l2 in LOBBIES.values():
            if l2.game is g:
                l2.kick_votes.pop(cur.name, None)
                if l2.kick_target == cur.name:
                    l2.kick_target = None
                    l2.kick_deadline = None
                    task = KICK_TASKS.pop(l2.id, None)
                    if task:
                        try:
                            task.cancel()
                        except Exception:
                            pass
                try:
                    await sio.emit("lobby_state", lobby_state(l2), room=l2.id)
                except Exception:
                    pass
                break
        # Note: recurring processed at start of turn (in roll_dice), not here
        # If game already over, broadcast and return
        if _check_and_finalize_game(g):
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return {"ok": True, "action": "end_turn", "game_over": True}
        # Force broadcast to ensure all clients get the turn change
        try:
            print(f"[TURN_CHANGE] {cur.name} -> {g.players[g.current_turn].name}", flush=True)
        except Exception:
            pass
        # Notify clients with a neutral "turn_started" sound for the next player
        try:
            next_player = g.players[g.current_turn].name if g.players else None
            if next_player:
                await sio.emit("sound", {"event": "turn_started", "currentPlayer": next_player, "prev": cur.name}, room=lobby_id)
        except Exception:
            pass
        await _force_sync_all_clients(lobby_id, g)
        return {"ok": True, "action": "end_turn"}

    if t == "bankrupt":
        # Find the player who is declaring bankruptcy (could be any player, not just current turn)
        bankrupt_player = _find_player(g, actor)
        if not bankrupt_player:
            g.last_action = {"type": "bankrupt_failed", "by": actor, "reason": "player_not_found"}
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        
        _handle_bankruptcy(g, actor)
        
        # If the current turn player went bankrupt, advance the turn
        if actor == cur.name and g.game_over is None and len(g.players) > 0:
            g.current_turn = g.current_turn % len(g.players)
            g.rolls_left = 1
            
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return

    # Use Get Out of Jail Free card
    if t == "use_jail_card":
        if cur.in_jail and cur.jail_cards > 0:
            cur.jail_cards -= 1
            cur.in_jail = False
            cur.jail_turns = 0
            g.last_action = {"type": "used_jail_card", "by": cur.name}
            g.log.append({"type": "jail", "text": f"{cur.name} used a Get Out of Jail Free card"})
        else:
            g.last_action = {"type": "use_jail_card_denied", "by": cur.name}
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return

    # Property management placeholders
    if t in {"mortgage", "unmortgage", "buy_house", "sell_house", "buy_hotel", "sell_hotel"}:
        pos = int(action.get("pos") or cur.position)
        tiles = monopoly_tiles()
        tile = tiles[pos]
        st = g.properties.get(pos) or PropertyState(pos=pos)
        group = tile.get("group")
        house_cost = HOUSE_COST_BY_GROUP.get(group or "", 0)
        if st.owner != cur.name:
            g.last_action = {"type": f"{t}_denied", "by": cur.name, "pos": pos, "reason": "not_owner"}
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return

        def owns_group() -> bool:
            if not group:
                return False
            return all((g.properties.get(p) or PropertyState(pos=p)).owner == cur.name for p in _group_positions(group))

        def group_mortgaged() -> bool:
            if not group:
                return False
            return any((g.properties.get(p) or PropertyState(pos=p)).mortgaged for p in _group_positions(group))

        def can_build_even(target_pos: int, delta: int) -> bool:
            # Even building rule enforcement
            if not group:
                return False
            states = [g.properties.get(p) or PropertyState(pos=p) for p in _group_positions(group)]
            counts = [s.houses + (5 if s.hotel else 0) for s in states]
            idx = [s.pos for s in states].index(target_pos)
            counts[idx] += delta
            # hotels treated as 5
            return (max(counts) - min(counts)) <= 1 and all(0 <= c <= 5 for c in counts)

        if t == "mortgage":
            # Disallow mortgaging any property in a color set if any property in the set has houses/hotel
            def group_has_buildings() -> bool:
                if not group:
                    return False
                for p in _group_positions(group):
                    ps = g.properties.get(p) or PropertyState(pos=p)
                    if ps.houses > 0 or ps.hotel:
                        return True
                return False
            if st.houses > 0 or st.hotel or group_has_buildings():
                g.last_action = {"type": "mortgage_denied", "by": cur.name, "pos": pos, "reason": "has_buildings"}
            elif st.mortgaged:
                g.last_action = {"type": "mortgage_denied", "by": cur.name, "pos": pos, "reason": "already_mortgaged"}
            else:
                st.mortgaged = True
                g.properties[pos] = st
                amt = _mortgage_value(pos)
                retained = _route_inflow(g, cur.name, int(amt), "mortgage", {"pos": pos})
                cur.cash += retained
                g.last_action = {"type": "mortgage", "by": cur.name, "pos": pos, "amount": amt}
                g.log.append({"type": "mortgage", "text": f"{cur.name} mortgaged {tile['name']} for ${amt}"})
                try:
                    _ledger_add(g, "mortgage", cur.name, "bank", -int(amt), {"pos": pos, "name": tile.get("name")})
                except Exception:
                    pass
                try:
                    await sio.emit("sound", {"event": "mortgage", "by": cur.name, "pos": pos, "amount": amt}, room=lobby_id)
                except Exception:
                    pass
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        if t == "unmortgage":
            if not st.mortgaged:
                g.last_action = {"type": "unmortgage_denied", "by": cur.name, "pos": pos, "reason": "not_mortgaged"}
            else:
                principal = _mortgage_value(pos)
                payoff = principal + math.ceil(principal * 0.1)
                if cur.cash < payoff:
                    g.last_action = {"type": "unmortgage_denied", "by": cur.name, "pos": pos, "reason": "insufficient_cash", "needed": payoff}
                else:
                    cur.cash -= payoff
                    st.mortgaged = False
                    g.properties[pos] = st
                    g.last_action = {"type": "unmortgage", "by": cur.name, "pos": pos, "amount": payoff}
                    g.log.append({"type": "unmortgage", "text": f"{cur.name} unmortgaged {tile['name']} paying ${payoff}"})
                    try:
                        _ledger_add(g, "unmortgage", cur.name, "bank", int(payoff), {"pos": pos, "name": tile.get("name")})
                    except Exception:
                        pass
                    try:
                        await sio.emit("sound", {"event": "unmortgage", "by": cur.name, "pos": pos, "amount": payoff}, room=lobby_id)
                    except Exception:
                        pass
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        if t == "buy_house":
            # Try auto-unmortgage first if some properties in the group are mortgaged
            if group and group_mortgaged():
                _auto_unmortgage_for_houses(g, cur, group)
            
            if tile.get("type") != "property" or not group or not owns_group() or group_mortgaged():
                g.last_action = {"type": "buy_house_denied", "by": cur.name, "pos": pos, "reason": "group_or_mortgage"}
            elif st.hotel:
                g.last_action = {"type": "buy_house_denied", "by": cur.name, "pos": pos, "reason": "has_hotel"}
            elif st.houses >= 4:
                g.last_action = {"type": "buy_house_denied", "by": cur.name, "pos": pos, "reason": "max_houses"}
            elif cur.cash < house_cost:
                g.last_action = {"type": "buy_house_denied", "by": cur.name, "pos": pos, "reason": "insufficient_cash", "needed": house_cost}
            elif not can_build_even(pos, +1):
                g.last_action = {"type": "buy_house_denied", "by": cur.name, "pos": pos, "reason": "even_rule"}
            else:
                cur.cash -= house_cost
                st.houses += 1
                g.properties[pos] = st
                g.last_action = {"type": "buy_house", "by": cur.name, "pos": pos, "cost": house_cost}
                g.log.append({"type": "buy_house", "text": f"{cur.name} bought a house on {tile['name']} for ${house_cost}"})
                try:
                    _ledger_add(g, "buy_house", cur.name, "bank", int(house_cost), {"pos": pos, "name": tile.get("name")})
                except Exception:
                    pass
                try:
                    await sio.emit("sound", {"event": "property_purchased", "by": cur.name, "pos": pos, "house": True}, room=lobby_id)
                except Exception:
                    pass
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        if t == "sell_house":
            if st.houses <= 0 or st.hotel:
                g.last_action = {"type": "sell_house_denied", "by": cur.name, "pos": pos, "reason": "no_houses_or_hotel"}
            elif not can_build_even(pos, -1):
                g.last_action = {"type": "sell_house_denied", "by": cur.name, "pos": pos, "reason": "even_rule"}
            else:
                st.houses -= 1
                retained = _route_inflow(g, cur.name, int(house_cost // 2), "sell_house", {"pos": pos})
                cur.cash += retained
                g.properties[pos] = st
                g.last_action = {"type": "sell_house", "by": cur.name, "pos": pos, "refund": house_cost // 2}
                g.log.append({"type": "sell_house", "text": f"{cur.name} sold a house on {tile['name']} for ${house_cost//2}"})
                try:
                    _ledger_add(g, "sell_house", "bank", cur.name, int(house_cost // 2), {"pos": pos, "name": tile.get("name")})
                except Exception:
                    pass
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        if t == "buy_hotel":
            if st.hotel or st.houses != 4 or cur.cash < house_cost:
                g.last_action = {"type": "buy_hotel_denied", "by": cur.name, "pos": pos}
            else:
                cur.cash -= house_cost
                st.houses = 0
                st.hotel = True
                g.properties[pos] = st
                g.last_action = {"type": "buy_hotel", "by": cur.name, "pos": pos, "cost": house_cost}
                g.log.append({"type": "buy_hotel", "text": f"{cur.name} bought a hotel on {tile['name']} for ${house_cost}"})
                try:
                    _ledger_add(g, "buy_hotel", cur.name, "bank", int(house_cost), {"pos": pos, "name": tile.get("name")})
                except Exception:
                    pass
                try:
                    await sio.emit("sound", {"event": "property_purchased", "by": cur.name, "pos": pos, "hotel": True}, room=lobby_id)
                except Exception:
                    pass
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        if t == "sell_hotel":
            if not st.hotel:
                g.last_action = {"type": "sell_hotel_denied", "by": cur.name, "pos": pos}
            else:
                st.hotel = False
                st.houses = 4
                retained = _route_inflow(g, cur.name, int(house_cost // 2), "sell_hotel", {"pos": pos})
                cur.cash += retained
                g.properties[pos] = st
                g.last_action = {"type": "sell_hotel", "by": cur.name, "pos": pos, "refund": house_cost // 2}
                g.log.append({"type": "sell_hotel", "text": f"{cur.name} sold a hotel on {tile['name']} for ${house_cost//2}"})
                try:
                    _ledger_add(g, "sell_hotel", "bank", cur.name, int(house_cost // 2), {"pos": pos, "name": tile.get("name")})
                except Exception:
                    pass
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return

    # Trade flow (minimal protocol)
    if t == "offer_trade":
        trades = _ensure_trades(g)
        target = action.get("to")
        if not target or target == actor:
            return {"ok": False, "error": "invalid_target"}
        give = action.get("give") or {}
        receive = action.get("receive") or {}
        if not (give or receive):
            return {"ok": False, "error": "empty_offer"}
        terms = action.get("terms") or {}
        offer = {"id": _new_trade_id(g), "type": "trade_offer", "from": actor, "to": target, "give": give, "receive": receive, "terms": terms, "created": asyncio.get_event_loop().time()}
        trades.append(offer)
        g.last_action = offer
        g.log.append({"type": "trade_created", "id": offer["id"], "text": f"{actor} offered a trade to {target} (#{offer['id']})"})
        try: print(f"[TRADE][OFFER] {offer}", flush=True)
        except Exception: pass
        await _broadcast_state(lobby_id, g)
        return {"ok": True, "trade": offer}
    if t == "accept_trade":
        trade_id = action.get("trade_id")
        trades = _ensure_trades(g)
        offer = next((o for o in trades if o.get("id") == trade_id), None)
        if not offer:
            g.last_action = {"type": "trade_missing", "id": trade_id}
            await _broadcast_state(lobby_id, g)
            return {"ok": False, "error": "missing"}
        if actor != offer.get("to"):
            g.last_action = {"type": "trade_accept_denied", "by": actor, "expected": offer.get("to"), "id": trade_id}
            await _broadcast_state(lobby_id, g)
            return {"ok": False, "error": "not_recipient"}
        # Transfer cash
        cash_a = int(offer.get("give", {}).get("cash") or 0)
        cash_b = int(offer.get("receive", {}).get("cash") or 0)
        a = _find_player(g, offer.get("from"))
        b = _find_player(g, offer.get("to"))
        if a and b:
            a.cash -= cash_a
            retained_ab = _route_inflow(g, b.name, int(cash_a), "trade_cash", {"trade_id": trade_id})
            b.cash += retained_ab
            if cash_a > 0:
                try:
                    _ledger_add(g, "trade_cash", a.name, b.name, cash_a, {"trade_id": trade_id})
                except Exception:
                    pass
            b.cash -= cash_b
            retained_ba = _route_inflow(g, a.name, int(cash_b), "trade_cash", {"trade_id": trade_id})
            a.cash += retained_ba
            if cash_b > 0:
                try:
                    _ledger_add(g, "trade_cash", b.name, a.name, cash_b, {"trade_id": trade_id})
                except Exception:
                    pass
            # Jail cards
            if offer.get("give", {}).get("jail_card"):
                if a.jail_cards > 0:
                    a.jail_cards -= 1
                    b.jail_cards += 1
            if offer.get("receive", {}).get("jail_card"):
                if b.jail_cards > 0:
                    b.jail_cards -= 1
                    a.jail_cards += 1
        # Advanced terms: per-turn payments
        terms = offer.get("terms") or {}
        payments = terms.get("payments") or []
        for pm in payments:
            try:
                frm = str(pm.get("from"))
                to = str(pm.get("to"))
                amt = int(pm.get("amount") or 0)
                turns = int(pm.get("turns") or 0)
            except Exception:
                continue
            if not frm or not to or amt <= 0 or turns <= 0:
                continue
            g.recurring.append({
                "id": f"rp{random.randint(1000,9999)}",
                "from": frm,
                "to": to,
                "amount": amt,
                "turns_left": turns,
            })
            g.log.append({"type": "recurring_created", "text": f"Recurring: {frm} pays ${amt} to {to} for {turns} turns"})
        
        # Advanced terms: rental agreements
        rentals = terms.get("rentals") or []
        for rental in rentals:
            try:
                properties = rental.get("properties") or []
                percentage = int(rental.get("percentage") or 0)
                turns = int(rental.get("turns") or 0)
                direction = rental.get("direction") # 'give' or 'receive'
            except Exception:
                continue
            if not properties or percentage <= 0 or turns <= 0:
                continue
            
            # Determine owner and renter based on direction
            if direction == "give":
                # Offer maker is giving rental rights (renting out their properties)
                owner = offer.get("from")
                renter = offer.get("to")
            else:
                # Offer maker is receiving rental rights (renting the other's properties)
                owner = offer.get("to") 
                renter = offer.get("from")
            
            g.property_rentals.append({
                "properties": properties,
                "owner": owner,
                "renter": renter,
                "percentage": percentage,
                "turns_left": turns,
                "cash_paid": 0,  # Cash is handled separately in the trade
            })
            g.log.append({"type": "rental_created", "text": f"Rental: {renter} gets {percentage}% rent from {len(properties)} properties owned by {owner} for {turns} turns"})
        # Transfer properties
        for pos in offer.get("give", {}).get("properties", []) or []:
            st = g.properties.get(pos) or PropertyState(pos=pos)
            st.owner = offer.get("to")
            g.properties[pos] = st
        for pos in offer.get("receive", {}).get("properties", []) or []:
            st = g.properties.get(pos) or PropertyState(pos=pos)
            st.owner = offer.get("from")
            g.properties[pos] = st
        # Remove from pending
        g.pending_trades = [o for o in trades if o.get("id") != trade_id]
        g.last_action = {"type": "trade_accepted", "id": trade_id}
        g.log.append({"type": "trade_accepted", "id": trade_id, "text": f"Trade {trade_id} accepted by {actor}"})
        try:
            # Cache final form of trade for later retrieval
            g.recent_trades[str(trade_id)] = dict(offer)
            # Trim cache size
            if len(g.recent_trades) > 300:
                for k in list(g.recent_trades.keys())[:len(g.recent_trades)-300]:
                    g.recent_trades.pop(k, None)
        except Exception:
            pass
        await _broadcast_state(lobby_id, g)
        return {"ok": True, "trade_id": trade_id, "accepted": True}
    if t == "decline_trade":
        trade_id = action.get("trade_id")
        trades = _ensure_trades(g)
        offer = next((o for o in trades if o.get("id") == trade_id), None)
        if not offer:
            g.last_action = {"type": "trade_missing", "id": trade_id}
        elif actor != offer.get("to"):
            g.last_action = {"type": "trade_decline_denied", "by": actor, "expected": offer.get("to"), "id": trade_id}
        else:
            g.pending_trades = [o for o in trades if o.get("id") != trade_id]
            g.last_action = {"type": "trade_declined", "id": trade_id}
            g.log.append({"type": "trade_declined", "id": trade_id, "text": f"Trade {trade_id} declined by {actor}"})
            try:
                g.recent_trades[str(trade_id)] = dict(offer)
            except Exception:
                pass
        await _broadcast_state(lobby_id, g)
        return {"ok": True, "trade_id": trade_id, "declined": g.last_action.get("type") == "trade_declined"}
    if t == "cancel_trade":
        trade_id = action.get("trade_id")
        trades = _ensure_trades(g)
        before = len(trades)
        g.pending_trades = [o for o in trades if not (o.get("id") == trade_id and o.get("from") == actor)]
        if len(g.pending_trades) < before:
            g.last_action = {"type": "trade_canceled", "id": trade_id}
            g.log.append({"type": "trade_canceled", "id": trade_id, "text": f"Trade {trade_id} canceled by {actor}"})
            # Cache canceled trade
            try:
                off = next((o for o in trades if o.get("id") == trade_id), None)
                if off:
                    g.recent_trades[str(trade_id)] = dict(off)
            except Exception:
                pass
        else:
            g.last_action = {"type": "trade_cancel_denied", "id": trade_id}
        await _broadcast_state(lobby_id, g)
        return {"ok": True, "trade_id": trade_id, "canceled": g.last_action.get("type") == "trade_canceled"}

    # Property rental trades
    if t == "offer_rental":
        trades = _ensure_trades(g)
        target = action.get("to")
        if not target or target == actor:
            return {"ok": False, "error": "invalid_target"}
        
        cash_amount = int(action.get("cash_amount") or 0)
        properties = action.get("properties") or []
        percentage = int(action.get("percentage") or 0)
        turns = int(action.get("turns") or 0)
        
        if cash_amount <= 0 or not properties or percentage <= 0 or percentage > 100 or turns <= 0:
            return {"ok": False, "error": "invalid_rental_terms"}
        
        # Validate that actor owns all specified properties
        tiles = monopoly_tiles()
        for pos in properties:
            st = g.properties.get(pos)
            if not st or st.owner != actor:
                return {"ok": False, "error": "property_not_owned"}
        
        # Validate that target has enough cash
        target_player = _find_player(g, target)
        if not target_player or target_player.cash < cash_amount:
            return {"ok": False, "error": "insufficient_cash"}
        
        offer = {
            "id": _new_trade_id(g),
            "type": "rental_offer",
            "from": actor,
            "to": target,
            "cash_amount": cash_amount,
            "properties": properties,
            "percentage": percentage,
            "turns": turns,
            "created": asyncio.get_event_loop().time()
        }
        
        trades.append(offer)
        g.last_action = offer
        
        property_names = [tiles[p].get("name", f"Property {p}") for p in properties]
        g.log.append({"type": "rental_offered", "id": offer["id"], "text": f"{actor} offered ${cash_amount} to {target} for {percentage}% of rent from {len(properties)} properties for {turns} turns"})
        
        try: 
            print(f"[RENTAL][OFFER] {offer}", flush=True)
        except Exception: 
            pass
        await _broadcast_state(lobby_id, g)
        return {"ok": True, "rental": offer}

    if t == "accept_rental":
        trade_id = action.get("trade_id")
        trades = _ensure_trades(g)
        offer = next((o for o in trades if o.get("id") == trade_id and o.get("type") == "rental_offer"), None)
        if not offer:
            g.last_action = {"type": "rental_missing", "id": trade_id}
            await _broadcast_state(lobby_id, g)
            return {"ok": False, "error": "missing"}
        if actor != offer.get("to"):
            g.last_action = {"type": "rental_accept_denied", "by": actor, "expected": offer.get("to"), "id": trade_id}
            await _broadcast_state(lobby_id, g)
            return {"ok": False, "error": "not_recipient"}
        
        # Execute the rental agreement
        cash_amount = offer.get("cash_amount")
        properties = offer.get("properties")
        percentage = offer.get("percentage")
        turns = offer.get("turns")
        
        renter = _find_player(g, offer.get("to"))
        owner = _find_player(g, offer.get("from"))
        
        # Precompute rental id so ledger/meta align
        rental_id = f"rental{random.randint(1000,9999)}"
        if renter and owner and renter.cash >= cash_amount:
            # Transfer cash immediately
            renter.cash -= cash_amount
            retained = _route_inflow(g, owner.name, int(cash_amount or 0), "rental_upfront", {"rental_id": rental_id})
            owner.cash += retained
            try:
                _ledger_add(g, "rental_upfront", renter.name, owner.name, int(cash_amount or 0), {
                    "rental_id": rental_id,
                    "properties": list(properties or []),
                    "percentage": int(percentage or 0),
                    "turns": int(turns or 0),
                })
            except Exception:
                pass
            
            # Create rental agreement
            rentals = _ensure_rentals(g)
            rentals.append({
                "id": rental_id,
                "renter": renter.name,
                "owner": owner.name,
                "properties": properties,
                "percentage": percentage,
                "turns_left": turns,
                "cash_paid": cash_amount,
                "total_received": 0,  # Running total of rental income
                "last_payment": 0,    # Last payment amount
                "last_payment_turn": 0,  # Turn when last payment was made
                "created": asyncio.get_event_loop().time()
            })
            
            tiles = monopoly_tiles()
            property_names = [tiles[p].get("name", f"Property {p}") for p in properties]
            g.log.append({"type": "rental_created", "id": rental_id, "text": f"Property rental: {renter.name} paid ${cash_amount} for {percentage}% rent from {len(properties)} properties for {turns} turns"})
        else:
            g.last_action = {"type": "rental_failed", "id": trade_id, "reason": "insufficient_funds"}
            await _broadcast_state(lobby_id, g)
            return {"ok": False, "error": "insufficient_funds"}
        
        # Remove from pending trades
        g.pending_trades = [o for o in trades if o.get("id") != trade_id]
        g.last_action = {"type": "rental_accepted", "id": trade_id}
        await _broadcast_state(lobby_id, g)
        return {"ok": True, "trade_id": trade_id, "rental_id": rental_id, "accepted": True}

    if t == "decline_rental":
        trade_id = action.get("trade_id")
        trades = _ensure_trades(g)
        offer = next((o for o in trades if o.get("id") == trade_id and o.get("type") == "rental_offer"), None)
        if not offer:
            g.last_action = {"type": "rental_missing", "id": trade_id}
        elif actor != offer.get("to"):
            g.last_action = {"type": "rental_decline_denied", "by": actor, "expected": offer.get("to"), "id": trade_id}
        else:
            g.pending_trades = [o for o in trades if o.get("id") != trade_id]
            g.last_action = {"type": "rental_declined", "id": trade_id}
            g.log.append({"type": "rental_declined", "id": trade_id, "text": f"Property rental {trade_id} declined by {actor}"})
        await _broadcast_state(lobby_id, g)
        return {"ok": True, "trade_id": trade_id, "declined": g.last_action.get("type") == "rental_declined"}

    if t == "cancel_rental":
        trade_id = action.get("trade_id")
        trades = _ensure_trades(g)
        before = len(trades)
        g.pending_trades = [o for o in trades if not (o.get("id") == trade_id and o.get("from") == actor and o.get("type") == "rental_offer")]
        if len(g.pending_trades) < before:
            g.last_action = {"type": "rental_canceled", "id": trade_id}
            g.log.append({"type": "rental_canceled", "id": trade_id, "text": f"Property rental {trade_id} canceled by {actor}"})
        else:
            g.last_action = {"type": "rental_cancel_denied", "id": trade_id}
        await _broadcast_state(lobby_id, g)
        return {"ok": True, "trade_id": trade_id, "canceled": g.last_action.get("type") == "rental_canceled"}


# ---------------------------
# Rent calculation helpers
# ---------------------------

def _find_player(g: Game, name: Optional[str]) -> Optional[Player]:
    if not name:
        return None
    for p in g.players:
        if p.name == name:
            return p
    return None

# ---- Trade helpers (robust) ----
def _ensure_trades(g: Game) -> List[Dict[str, Any]]:
    if not hasattr(g, 'pending_trades') or not isinstance(g.pending_trades, list):
        g.pending_trades = []
    return g.pending_trades

def _ensure_rentals(g: Game) -> List[Dict[str, Any]]:
    if not hasattr(g, 'property_rentals') or not isinstance(g.property_rentals, list):
        g.property_rentals = []
    return g.property_rentals

async def _force_sync_all_clients(lobby_id: str, g: Game):
    """Force synchronization for all clients in lobby - use for critical state changes"""
    try:
        if lobby_id not in LOBBIES:
            return
        l = LOBBIES[lobby_id]
        snapshot = g.snapshot()
        # Send to room first
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": snapshot}, room=lobby_id)
        # Also send individually to each known session to ensure delivery
        for sid in l.sid_to_name.keys():
            try:
                await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": snapshot}, to=sid)
            except Exception:
                pass
        print(f"[FORCE_SYNC] Lobby {lobby_id}, sent to {len(l.sid_to_name)} clients", flush=True)
    except Exception as e:
        print(f"[FORCE_SYNC_ERROR] {e}", flush=True)

async def _broadcast_state(lobby_id: str, g: Game):
    """Enhanced state broadcasting with debugging"""
    try:
        snapshot = g.snapshot()
        current_player = g.players[g.current_turn].name if g.players else "Unknown"
        print(f"[BROADCAST] Lobby {lobby_id}, turn: {current_player}, rolled: {g.rolled_this_turn}, rolls_left: {g.rolls_left}", flush=True)
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": snapshot}, room=lobby_id)
    except Exception as e:
        print(f"[BROADCAST_ERROR] {e}", flush=True)

def _new_trade_id(g: Game) -> str:
    return f"tr{len(_ensure_trades(g))}_{random.randint(1000,9999)}"


def _handle_rent(g: Game, cur: Player, pos: int, last_roll: int) -> bool:
    """Handle rent payment and return True if rent was paid"""
    tiles = monopoly_tiles()
    tile = tiles[pos]
    ttype = tile.get("type")
    if ttype not in {"property", "railroad", "utility"}:
        return False

    st = g.properties.get(pos)
    owner_name = st.owner if st else None
    if not owner_name or owner_name == cur.name:
        return False
    if st and st.mortgaged:
        return False

    owner = _find_player(g, owner_name)
    if not owner:
        return False

    # Compute rent
    rent = 0
    if ttype == "property":
        rents = RENT_TABLE.get(pos)
        if st.hotel:
            rent = (rents or [0,0,0,0,0,0])[5]
        elif st.houses > 0:
            idx = max(0, min(4, st.houses))
            rent = (rents or [0,0,0,0,0,0])[idx]
        else:
            base = int((rents or [int(tile.get("rent") or 0)])[0])
            rent = base
            # Monopoly double rule for unimproved
            if _is_monopoly(g, owner_name, tile.get("group")):
                rent = base * 2
    elif ttype == "railroad":
        count = _railroads_owned(g, owner_name)
        mapping = {1: 25, 2: 50, 3: 100, 4: 200}
        rent = mapping.get(count, 25)
    elif ttype == "utility":
        count = _utilities_owned(g, owner_name)
        mult = 10 if count >= 2 else 4
        rent = mult * max(2, min(12, int(last_roll or 0)))

    if rent <= 0:
        return False

    # Handle property rental agreements
    rental_redirected = 0
    rentals = _ensure_rentals(g)
    for rental in rentals[:]:  # Use slice to allow removal during iteration
        if pos in rental.get("properties", []) and rental.get("turns_left", 0) > 0:
            renter_name = rental.get("renter")
            percentage = rental.get("percentage", 0)
            if renter_name and 0 < percentage <= 100:
                renter = _find_player(g, renter_name)
                if renter:
                    redirected_amount = int((rent * percentage) / 100)
                    rental_redirected += redirected_amount
                    retained_r = _route_inflow(g, renter.name, int(redirected_amount), "rental_income_split", {"property": pos})
                    renter.cash += retained_r
                    
                    # Update rental tracking
                    rental["total_received"] = rental.get("total_received", 0) + redirected_amount
                    rental["last_payment"] = redirected_amount
                    rental["last_payment_turn"] = g.turns
                    
                    g.log.append({
                        "type": "rental_income", 
                        "text": f"{renter_name} received ${redirected_amount} ({percentage}%) from {tile.get('name')} rental",
                        "rental_id": rental.get("id"),
                        "property": pos,
                        "payer": cur.name,
                        "payee": renter_name,
                        "percentage": percentage,
                        "amount": redirected_amount,
                        "turn": g.turns
                    })

    # Owner receives the remaining rent
    remaining_rent = rent - rental_redirected
    if remaining_rent > 0:
        retained_o = _route_inflow(g, owner.name, int(remaining_rent), "rent_income", {"pos": pos})
        owner.cash += retained_o

    # Player pays what they can now; if short, record debt for remainder
    due = int(rent)
    # Try to raise automatically if enabled and short
    if cur.cash < due:
        _auto_sell_houses_for_cash(g, cur, due)
        _auto_mortgage_for_cash(g, cur, due)
    pay_now = min(max(0, cur.cash), due)
    cur.cash -= pay_now
    unpaid = due - pay_now
    if unpaid > 0:
        _debt_add(g, cur.name, owner.name, int(unpaid), {"pos": pos, "kind": "rent"})
    
    if rental_redirected > 0:
        g.log.append({"type": "rent", "text": f"{cur.name} paid ${rent} rent (${remaining_rent} to {owner.name}, ${rental_redirected} to renters) for {tile.get('name')}"})
        try:
            if remaining_rent > 0:
                _ledger_add(g, "rent", cur.name, owner.name, remaining_rent, {"pos": pos, "tile": tile.get("name")})
            _ledger_add(g, "rent_split", cur.name, "<renters>", rental_redirected, {"pos": pos, "tile": tile.get("name")})
        except Exception:
            pass
    else:
        g.log.append({"type": "rent", "text": f"{cur.name} paid ${rent} rent to {owner.name} for landing on {tile.get('name')}"})
        try:
            _ledger_add(g, "rent", cur.name, owner.name, rent, {"pos": pos, "tile": tile.get("name")})
        except Exception:
            pass

    return True


def _process_rental_turn_expiry(g: Game) -> None:
    """Decrement rental agreement turns and remove expired ones"""
    rentals = _ensure_rentals(g)
    for rental in rentals[:]:  # Use slice to allow removal during iteration
        if rental.get("turns_left", 0) > 0:
            rental["turns_left"] -= 1
            if rental["turns_left"] <= 0:
                renter_name = rental.get("renter", "Unknown")
                owner_name = rental.get("owner", "Unknown")
                property_count = len(rental.get("properties", []))
                total_received = rental.get("total_received", 0)
                g.log.append({
                    "type": "rental_expired", 
                    "text": f"Property rental expired: {renter_name} received ${total_received} total from {property_count} properties owned by {owner_name}",
                    "rental_id": rental.get("id"),
                    "renter": renter_name,
                    "owner": owner_name,
                    "total_received": total_received
                })
                g.property_rentals.remove(rental)


def _is_monopoly(g: Game, owner: str, group: Optional[str]) -> bool:
    if not group:
        return False
    tiles = monopoly_tiles()
    group_positions = [t["pos"] for t in tiles if t.get("group") == group and t.get("type") == "property"]
    if not group_positions:
        return False
    for p in group_positions:
        st = g.properties.get(p)
        if not st or st.owner != owner or st.mortgaged:
            return False
    return True


def _railroads_owned(g: Game, owner: str) -> int:
    tiles = monopoly_tiles()
    positions = [t["pos"] for t in tiles if t.get("type") == "railroad"]
    return sum(1 for p in positions if (g.properties.get(p) or PropertyState(pos=p)).owner == owner and not (g.properties.get(p) or PropertyState(pos=p)).mortgaged)


def _utilities_owned(g: Game, owner: str) -> int:
    tiles = monopoly_tiles()
    positions = [t["pos"] for t in tiles if t.get("type") == "utility"]
    return sum(1 for p in positions if (g.properties.get(p) or PropertyState(pos=p)).owner == owner and not (g.properties.get(p) or PropertyState(pos=p)).mortgaged)
    
def _total_worth(g: Game, player: Player) -> int:
    # Cash + purchase price of unmortgaged owned properties + building costs at cost values
    total = player.cash
    tiles = monopoly_tiles()
    for pos, st in g.properties.items():
        if st.owner == player.name:
            price = int(tiles[pos].get("price") or 0)
            if not st.mortgaged:
                total += price
            # include buildings at their cost (houses 0-4, hotel counted as 1 house cost here)
            group = tiles[pos].get("group")
            if tiles[pos].get("type") == "property" and group:
                house_cost = HOUSE_COST_BY_GROUP.get(group, 0)
                total += house_cost * max(0, int(st.houses or 0))
                if st.hotel:
                    total += house_cost  # treat hotel as one house cost for valuation
    return total


# ---------------------------
# Stocks helpers
# ---------------------------

def _player_cash(g: Game, name: str) -> int:
    p = _find_player(g, name)
    return int(p.cash) if p else 0


def _stock_price(g: Game, owner: str) -> int:
    # In the percent-based model, "price" reported in the snapshot is the owner's current cash (the pool P)
    # Ensure minimum price of 1 to avoid division by zero edge cases
    return max(1, int(_player_cash(g, owner)))


def _stocks_ensure(g: Game, owner: str) -> Dict[str, Any]:
    st = g.stocks.get(owner)
    if not st:
        st = {
            "owner": owner,
            # holdings will store percents per investor (0..1). Keep total_shares only for backward-compat snapshot base.
            "total_shares": 0.0,
            "holdings": {},
            "allow_investing": False,
            "enforce_min_buy": False,
            "min_buy": 0,
            "enforce_min_pool": False,
            "min_pool_total": 0,
            "min_pool_owner": 0,
            "history": [],
            "last_history_turn": None,
        }
        g.stocks[owner] = st
    # Ensure schema fields
    st.setdefault("owner", owner)
    st.setdefault("total_shares", 0.0)
    st.setdefault("holdings", {})
    # Migrate any share-based holdings (values > 1.0 while base might be embedded) to percents if we detect legacy form.
    try:
        vals = list((st.get("holdings") or {}).values())
        if any(isinstance(v, (int, float)) and float(v) > 1.0 for v in vals):
            # If legacy, infer base from total_shares or sum and normalize to percents conservatively
            base = float(st.get("total_shares") or 0.0) or max(1.0, sum(float(v or 0.0) for v in vals))
            new_hold = {}
            for k, v in (st.get("holdings") or {}).items():
                try:
                    new_hold[k] = max(0.0, min(1.0, float(v) / base))
                except Exception:
                    continue
            st["holdings"] = new_hold
    except Exception:
        pass
    st.setdefault("allow_investing", False)
    st.setdefault("enforce_min_buy", False)
    st.setdefault("min_buy", 0)
    st.setdefault("enforce_min_pool", False)
    st.setdefault("min_pool_total", 0)
    st.setdefault("min_pool_owner", 0)
    st.setdefault("history", [])
    st.setdefault("last_history_turn", None)
    return st


def _stocks_snapshot(g: Game) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for p in g.players:
        rec = _stocks_ensure(g, p.name)
        price = _stock_price(g, p.name)  # equals owner's cash P
        base = 100  # expose a constant base so UI can display pseudo-shares if desired
        # holdings are stored as percents (0..1). Build list and compute owner implicit percent.
        holdings = []
        for investor, perc in (rec.get("holdings") or {}).items():
            try:
                pr = max(0.0, min(1.0, float(perc)))
                holdings.append({"investor": investor, "shares": pr * base, "percent": pr})
            except Exception:
                continue
        # Keep order stable: sort by percent desc
        holdings.sort(key=lambda x: -float(x.get("percent") or 0.0))
        outside_percent = sum(float(h.get("percent") or 0.0) for h in holdings)
        owner_percent = max(0.0, 1.0 - outside_percent)
        out.append({
            "owner": p.name,
            "owner_color": p.color,
            "price": price,
            "total_shares": float(base),
            "allow_investing": bool(rec.get("allow_investing", True)),
            "enforce_min_buy": bool(rec.get("enforce_min_buy", False)),
            "min_buy": int(rec.get("min_buy") or 0),
            "enforce_min_pool": bool(rec.get("enforce_min_pool", False)),
            "min_pool_total": int(rec.get("min_pool_total") or 0),
            "min_pool_owner": int(rec.get("min_pool_owner") or 0),
            "base": base,
            "owner_percent": owner_percent,
            "holdings": holdings,
            "history": [
                {"turn": int(pt.get("turn") or 0), "pool": float(pt.get("pool") or 0.0)}
                for pt in (rec.get("history") or [])
            ][-200:],
        })
    return out

def _bonds_ensure(g: Game, owner: str) -> Dict[str, Any]:
    st = g.bonds.get(owner)
    if not st:
        st = {"owner": owner, "allow_bonds": False, "rate_percent": 0.0, "period_turns": 1, "history": []}
        g.bonds[owner] = st
    # sanity defaults
    st.setdefault("owner", owner)
    st.setdefault("allow_bonds", False)
    st.setdefault("rate_percent", 0.0)
    st.setdefault("period_turns", 1)
    st.setdefault("history", [])
    return st

def _bonds_snapshot(g: Game) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for p in g.players:
        st = _bonds_ensure(g, p.name)
        out.append({
            "owner": p.name,
            "owner_color": p.color,
            "allow_bonds": bool(st.get("allow_bonds", False)),
            "rate_percent": float(st.get("rate_percent", 0.0)),
            "period_turns": int(st.get("period_turns", 1)),
            "history": list(st.get("history") or [])[-300:],
        })
    return out


def _bond_payouts_snapshot(g: Game) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    # Build quick map: owner -> { rate_percent, period_turns }
    cfg: Dict[str, Dict[str, Any]] = {}
    for p in g.players:
        st = _bonds_ensure(g, p.name)
        cfg[p.name] = {
            "rate_percent": float(st.get("rate_percent") or 0.0),
            "period_turns": int(st.get("period_turns") or 1),
        }
    # Compute coupons for each investment entry
    for inv in g.bond_investments:
        owner = inv.get("owner")
        investor = inv.get("investor")
        principal = int(inv.get("principal") or 0)
        if not owner or not investor or principal <= 0:
            continue
        st = cfg.get(owner) or {"rate_percent": 0.0, "period_turns": 1}
        rate = float(st.get("rate_percent") or 0.0)
        period = max(1, int(st.get("period_turns") or 1))
        coupon = int(round(principal * (rate / 100.0) * period)) if rate > 0 else 0
        # Estimate next due in turns using owner's turn count modulo period
        cnt = int(g.turn_counts.get(owner) or 0)
        rem = (period - (cnt % period)) % period
        next_in = rem if rem != 0 else 0
        out.append({
            "owner": owner,
            "investor": investor,
            "principal": principal,
            "coupon": coupon,
            "period_turns": period,
            "rate_percent": rate,
            "next_due_in_turns": next_in,
            # deterministic display key; runtime payout ids set on events
            "key": f"{owner}|{investor}"
        })
    # Stable sort by owner then investor for consistent UI
    out.sort(key=lambda x: (str(x.get("owner") or "").lower(), str(x.get("investor") or "").lower()))
    return out


def _stock_pool_value(g: Game, owner: str) -> float:
    # Pool value is simply the owner's current cash
    return float(_player_cash(g, owner))


def _record_stock_history_for(g: Game, owner: str, overwrite: bool = True) -> None:
    st = _stocks_ensure(g, owner)
    turn = int(g.turns or 0)
    val = _stock_pool_value(g, owner)
    hist = list(st.get("history") or [])
    last_turn = st.get("last_history_turn")
    if overwrite and hist and (last_turn == turn or (hist[-1].get("turn") == turn)):
        hist[-1] = {"turn": turn, "pool": val}
    else:
        hist.append({"turn": turn, "pool": val})
    st["history"] = hist[-500:]
    st["last_history_turn"] = turn
    g.stocks[owner] = st


def _record_stock_history(g: Game) -> None:
    for p in g.players:
        _record_stock_history_for(g, p.name, overwrite=False)


def _process_recurring_for(g: Game, payer: str) -> None:
    # Charge all obligations where 'from' == payer
    remaining: List[Dict[str, Any]] = []
    for r in list(g.recurring):
        if r.get("from") != payer:
            remaining.append(r)
            continue
        amt = int(r.get("amount") or 0)
        to_name = r.get("to")
        pay = _find_player(g, payer)
        rec = _find_player(g, to_name)
        if pay and rec and amt > 0:
            pay_now = min(max(0, int(pay.cash)), int(amt))
            pay.cash -= pay_now
            if pay_now > 0:
                retained = _route_inflow(g, to_name, int(pay_now), "recurring_income", {"id": r.get("id")})
                rec.cash += retained
            unpaid = int(amt) - pay_now
            if unpaid > 0:
                _debt_add(g, payer, to_name, int(unpaid), {"id": r.get("id"), "kind": "recurring"})
            g.log.append({"type": "recurring_pay", "text": f"{payer} paid ${amt} to {to_name} (recurring)"})
            try:
                _ledger_add(g, "recurring", payer, to_name, int(pay_now), {"id": r.get("id"), "unpaid": int(unpaid)})
            except Exception:
                pass
        left = int(r.get("turns_left") or 0) - 1
        if left > 0:
            r["turns_left"] = left
            remaining.append(r)
        else:
            g.log.append({"type": "recurring_done", "text": f"Recurring payment from {payer} to {to_name} completed"})
    g.recurring = remaining

def _process_bonds_for(g: Game, owner: str) -> None:
    st = _bonds_ensure(g, owner)
    period = int(st.get("period_turns") or 1)
    rate = float(st.get("rate_percent") or 0.0)
    if rate <= 0.0:
        return
    # Increment owner's turn count (count turn starts)
    cnt = int(g.turn_counts.get(owner) or 0)
    # Pay when count % period == 0 (including first turn when cnt==0)
    due_now = (cnt % max(1, period)) == 0
    g.turn_counts[owner] = cnt + 1
    if not due_now:
        return
    # Sum investor principals for this owner
    total_paid = 0
    for inv in list(g.bond_investments):
        if inv.get("owner") != owner:
            continue
        principal = int(inv.get("principal") or 0)
        if principal <= 0:
            continue
        coupon = int(round(principal * (rate / 100.0) * max(1, period)))
        if coupon <= 0:
            continue
        pay = _find_player(g, owner)
        rec = _find_player(g, inv.get("investor"))
        if pay and rec:
            pay_now = min(max(0, int(pay.cash)), int(coupon))
            pay.cash -= pay_now
            if pay_now > 0:
                retained = _route_inflow(g, inv.get("investor"), int(pay_now), "bond_coupon", {"principal": principal})
                rec.cash += retained
            unpaid = int(coupon) - pay_now
            if unpaid > 0:
                _debt_add(g, owner, inv.get("investor"), int(unpaid), {"principal": principal, "kind": "bond_coupon"})
            total_paid += int(coupon)
            # Unique payout id: ts-owner-investor-random
            try:
                pid = f"{_now_ms()}:{owner}:{inv.get('investor')}:{random.randint(1000,9999)}"
            except Exception:
                pid = f"{owner}:{inv.get('investor')}:{int(time.time()*1000)}"
            g.log.append({"type": "bond_coupon", "text": f"{owner} paid ${coupon} bond coupon to {inv.get('investor')} (id {pid})", "payout_id": pid, "paid_now": int(pay_now), "unpaid": int(unpaid)})
            try:
                _ledger_add(g, "bond_coupon", owner, inv.get("investor"), int(pay_now), {"principal": principal, "payout_id": pid, "unpaid": int(unpaid)})
            except Exception:
                pass


def _record_land(g: Game, pos: int) -> None:
    try:
        g.land_counts[pos] = int(g.land_counts.get(pos, 0)) + 1
    except Exception:
        pass


def _handle_bankruptcy(g: Game, player_name: str) -> None:
    # Implements: sell all houses, mortgage properties, liquidate for half, pay debts (simplified), properties to bank, remove player, check game end
    debtor = _find_player(g, player_name)
    if not debtor:
        return
    tiles = monopoly_tiles()
    total_raised = 0
    # 1) Sell all houses/hotels for half cost
    for pos, st in list(g.properties.items()):
        if st.owner == player_name:
            t = tiles[pos]
            if t.get("type") == "property":
                group = t.get("group")
                cost = HOUSE_COST_BY_GROUP.get(group or "", 0)
                if st.hotel:
                    total_raised += cost // 2
                    st.hotel = False
                if st.houses > 0:
                    total_raised += (st.houses * (cost // 2))
                    st.houses = 0
                g.properties[pos] = st
    # 2) Mortgage properties for half value
    for pos, st in list(g.properties.items()):
        if st.owner == player_name:
            if not st.mortgaged:
                st.mortgaged = True
                mv = _mortgage_value(pos)
                total_raised += mv
                g.properties[pos] = st
    # 3) Apply raised funds to debts (simplified: add to cash, then zero)
    debtor.cash += total_raised
    # Apply to outstanding deficit if any, and do not let player retain cash on exit
    if debtor.cash < 0:
        # Still in deficit after liquidation; log remaining debt
        g.log.append({"type": "debt_unpaid", "text": f"{player_name} remains ${-debtor.cash} in debt after liquidation"})
    # Zero out cash to avoid leaving money with removed player
    debtor.cash = 0
    # 4) Return remaining properties to bank (clear ownership and mortgages)
    for pos, st in list(g.properties.items()):
        if st.owner == player_name:
            st.owner = None
            st.houses = 0
            st.hotel = False
            st.mortgaged = False
            g.properties[pos] = st
    # 5) Remove player from game
    g.players = [p for p in g.players if p.name != player_name]
    # Remove any recurring obligations involving this player
    g.recurring = [r for r in g.recurring if r.get("from") != player_name and r.get("to") != player_name]
    # Adjust current_turn to next valid index
    if len(g.players) == 0:
        g.current_turn = 0
    else:
        g.current_turn = g.current_turn % len(g.players)
    # Log event
    g.last_action = {"type": "bankrupt", "by": player_name, "raised": total_raised}
    g.log.append({"type": "bankrupt", "text": f"{player_name} declared bankruptcy and left the game"})
    # Check for game end
    _check_and_finalize_game(g)


def _check_and_finalize_game(g: Game) -> bool:
    # Game ends when only one player remains
    if g.game_over is not None:
        return True
    if len(g.players) <= 1:
        winner = g.players[0].name if g.players else None
        # Determine most-landed-on property
        most_pos = None
        most_cnt = -1
        for pos, cnt in (g.land_counts or {}).items():
            if cnt > most_cnt:
                most_cnt = cnt
                most_pos = pos
        tiles = monopoly_tiles()
        most_name = tiles[most_pos]["name"] if (most_pos is not None and 0 <= most_pos < len(tiles)) else None
        g.game_over = {
            "winner": winner,
            "turns": g.turns,
            "most_landed": {"pos": most_pos, "name": most_name, "count": max(0, most_cnt)},
        }
        g.log.append({"type": "game_over", "text": f"Game over. Winner: {winner or '—'}"})
        return True
    return False

    
# ---------------------------
# Chance / Chest helpers (minimal)
# ---------------------------

def _tile_pos_by_name(name: str) -> Optional[int]:
    for t in monopoly_tiles():
        if t.get("name") == name:
            return int(t.get("pos"))
    return None


def _draw_card(deck: str) -> Dict[str, Any]:
    # Minimal deck sampling; expand later
    if deck == "chance":
        cards = [
            {"kind": "advance_to", "target": "GO", "text": "Advance to GO (Collect $200)"},
            {"kind": "advance_to", "target": "Illinois Avenue", "text": "Advance to Illinois Avenue"},
            {"kind": "advance_to", "target": "St. Charles Place", "text": "Advance to St. Charles Place"},
            {"kind": "nearest", "target": "railroad", "special_rent": "double", "text": "Advance to the nearest Railroad (pay double rent)"},
            {"kind": "nearest", "target": "utility", "special_rent": "ten_x", "text": "Advance to the nearest Utility (pay 10x dice roll)"},
            {"kind": "goto_jail", "text": "Go to Jail (Do not pass GO, do not collect $200)"},
            {"kind": "collect", "amount": 50, "text": "Bank pays you dividend of $50"},
            {"kind": "pay", "amount": 15, "text": "Pay poor tax of $15"},
            {"kind": "repairs", "house": 25, "hotel": 100, "text": "Make general repairs: $25 per house, $100 per hotel"},
            {"kind": "jail_free", "text": "Get Out of Jail Free (Chance)"},
        ]
    else:
        cards = [
            {"kind": "advance_to", "target": "GO", "text": "Advance to GO (Collect $200)"},
            {"kind": "goto_jail", "text": "Go to Jail (Do not pass GO, do not collect $200)"},
            {"kind": "collect", "amount": 200, "text": "You inherit $200"},
            {"kind": "pay", "amount": 50, "text": "Doctor's fees $50"},
            {"kind": "repairs", "house": 40, "hotel": 115, "text": "Street repairs: $40 per house, $115 per hotel"},
            {"kind": "jail_free", "text": "Get Out of Jail Free (Community Chest)"},
        ]
    return random.choice(cards)


def _apply_card(g: Game, cur: Player, card: Dict[str, Any], last_roll: int = 0) -> None:
    kind = card.get("kind")
    if kind == "jail_free":
        cur.jail_cards += 1
        g.log.append({"type": "card", "text": f"{cur.name} received a Get Out of Jail Free card"})
        return
    if kind == "goto_jail":
        cur.position = 10
        cur.in_jail = True
        cur.jail_turns = 0
        g.log.append({"type": "card", "text": f"{cur.name} drew Go To Jail"})
        return
    if kind == "advance_to":
        target = card.get("target")
        if target == "GO":
            # Advance to GO and collect $200
            # Award $200 regardless of path per classic card
            cur.position = 0
            retained = _route_inflow(g, cur.name, 200, "advance_to_go", None)
            cur.cash += retained
            g.log.append({"type": "card", "text": f"{cur.name} advanced to GO and collected $200"})
            _record_land(g, 0)
            return
        pos = _tile_pos_by_name(str(target))
        if pos is not None:
            # Award $200 if passing GO as part of move
            if (cur.position > pos):
                retained = _route_inflow(g, cur.name, 200, "pass_go_card_move", None)
                cur.cash += retained
                g.log.append({"type": "pass_go", "text": f"{cur.name} collected $200 for passing GO (card)"})
            cur.position = pos
            g.log.append({"type": "card", "text": f"{cur.name} advanced to {target}"})
            _record_land(g, pos)
        return
    if kind == "collect":
        amount = int(card.get("amount") or 0)
        retained = _route_inflow(g, cur.name, int(amount), "card_collect", {"text": card.get("text")})
        cur.cash += retained
        g.log.append({"type": "card", "text": card.get("text") or f"Collected ${amount}"})
        return
    if kind == "pay":
        amount = int(card.get("amount") or 0)
        pay_now = min(max(0, cur.cash), int(amount))
        cur.cash -= pay_now
        unpaid = int(amount) - pay_now
        if unpaid > 0:
            _debt_add(g, cur.name, "bank", int(unpaid), {"kind": "card_pay"})
        g.log.append({"type": "card", "text": card.get("text") or f"Paid ${amount}"})
        try:
            _ledger_add(g, "card_pay", cur.name, "bank", int(pay_now), {"unpaid": int(unpaid), "text": card.get("text")})
        except Exception:
            pass
        return
    if kind == "repairs":
        per_house = int(card.get("house") or 0)
        per_hotel = int(card.get("hotel") or 0)
        total = 0
        for pos, st in g.properties.items():
            if st.owner == cur.name and not st.mortgaged:
                total += per_house * max(0, int(st.houses or 0))
                total += per_hotel * (1 if st.hotel else 0)
        if total > 0:
            pay_now = min(max(0, cur.cash), int(total))
            cur.cash -= pay_now
            unpaid = int(total) - pay_now
            if unpaid > 0:
                _debt_add(g, cur.name, "bank", int(unpaid), {"kind": "repairs"})
            g.log.append({"type": "card", "text": f"{cur.name} paid ${total} for repairs"})
            try:
                _ledger_add(g, "repairs", cur.name, "bank", int(pay_now), {"unpaid": int(unpaid)})
            except Exception:
                pass
        else:
            g.log.append({"type": "card", "text": f"{cur.name} had no repairs to pay"})
        return
    if kind == "nearest":
        target = card.get("target")
        tiles = monopoly_tiles()
        start = cur.position
        # find nearest ahead (wrapping)
        def nearest_pos(t: str) -> Optional[int]:
            candidates = [tinfo["pos"] for tinfo in tiles if tinfo.get("type") == t]
            if not candidates:
                return None
            ahead = [p for p in candidates if p > start]
            if ahead:
                return min(ahead)
            return min(candidates)
        np = nearest_pos("railroad" if target == "railroad" else "utility")
        if np is None:
            return
        # collect $200 if passing GO
        if np <= start:
            retained = _route_inflow(g, cur.name, 200, "pass_go_card_move", None)
            cur.cash += retained
            g.log.append({"type": "pass_go", "text": f"{cur.name} collected $200 for passing GO (card)"})
        cur.position = np
        g.log.append({"type": "card", "text": f"{cur.name} advanced to nearest {target}"})
        _record_land(g, np)
        # pay special rent next resolution; we can apply immediate rent here
        special = card.get("special_rent")
        if special == "double" and target == "railroad":
            # Pay double railroad rent
            pos = cur.position
            st = g.properties.get(pos)
            owner = st.owner if st else None
            if owner and owner != cur.name and not (st and st.mortgaged):
                count = _railroads_owned(g, owner)
                mapping = {1: 25, 2: 50, 3: 100, 4: 200}
                rent = mapping.get(count, 25) * 2
                # Partial payment with debt
                pay_now = min(max(0, cur.cash), rent)
                cur.cash -= pay_now
                unpaid = rent - pay_now
                p_owner = _find_player(g, owner)
                if p_owner and pay_now > 0:
                    retained = _route_inflow(g, p_owner.name, int(pay_now), "rent_income", {"pos": pos, "special": "double_rr"})
                    p_owner.cash += retained
                if unpaid > 0:
                    _debt_add(g, cur.name, owner, int(unpaid), {"pos": pos, "kind": "rent_double_rr"})
                g.log.append({"type": "rent", "text": f"{cur.name} paid ${rent} (double RR rent) to {owner}"})
        if special == "ten_x" and target == "utility":
            pos = cur.position
            st = g.properties.get(pos)
            owner = st.owner if st else None
            if owner and owner != cur.name and not (st and st.mortgaged):
                rent = 10 * max(2, min(12, int(last_roll or 0)))
                pay_now = min(max(0, cur.cash), rent)
                cur.cash -= pay_now
                unpaid = rent - pay_now
                p_owner = _find_player(g, owner)
                if p_owner and pay_now > 0:
                    retained = _route_inflow(g, p_owner.name, int(pay_now), "rent_income", {"pos": pos, "special": "ten_x_util"})
                    p_owner.cash += retained
                if unpaid > 0:
                    _debt_add(g, cur.name, owner, int(unpaid), {"pos": pos, "kind": "rent_tenx_util"})
                g.log.append({"type": "rent", "text": f"{cur.name} paid ${rent} (10x utility) to {owner}"})
        return


# ---------------------------
# Bots
# ---------------------------

@sio.event
async def bot_add(sid, data):
    lobby_id = data.get("id")
    if lobby_id not in LOBBIES:
        return {"ok": False, "error": "Lobby missing"}
    l = LOBBIES[lobby_id]
    # Only host can add bots and only before game start
    if l.host_sid and sid != l.host_sid:
        return {"ok": False, "error": "host_only"}
    if l.game:
        return {"ok": False, "error": "game_started"}
    # Add a simple bot as a named player; bots share lobby player list
    bot_name = f"Bot-{random.randint(100,999)}"
    l.players.append(bot_name)
    l.bots.append(bot_name)
    await sio.emit("lobby_state", lobby_state(l), room=lobby_id)
    # Ensure bot runner is active
    await _ensure_bot_runner(l)
    return {"ok": True, "name": bot_name}


@sio.event
async def bot_remove(sid, data):
    """Remove a previously added server bot (host only, pre-game)."""
    lobby_id = data.get("id")
    bot_name = (data.get("name") or "").strip()
    if not lobby_id or lobby_id not in LOBBIES:
        return {"ok": False, "error": "Lobby missing"}
    l = LOBBIES[lobby_id]
    if l.host_sid and sid != l.host_sid:
        return {"ok": False, "error": "host_only"}
    if l.game:
        return {"ok": False, "error": "game_started"}
    if not bot_name or bot_name not in l.bots:
        return {"ok": False, "error": "bot_not_found"}
    # Remove bot from lobby player list and bots list
    try:
        l.bots.remove(bot_name)
    except ValueError:
        pass
    # Remove all occurrences from players (there should be exactly one)
    l.players = [p for p in l.players if p != bot_name]
    await sio.emit("lobby_state", lobby_state(l), room=lobby_id)
    return {"ok": True, "removed": bot_name}


async def _ensure_bot_runner(l: Lobby):
    if l.bot_task_running:
        return
    l.bot_task_running = True
    lid = l.id
    async def loop():
        try:
            while True:
                await asyncio.sleep(0.6)
                lref = LOBBIES.get(lid)
                if not lref or not lref.game:
                    break
                g = lref.game
                # If current player is a bot, take a very simple turn
                if 0 <= g.current_turn < len(g.players):
                    cur = g.players[g.current_turn]
                    if cur.name in lref.bots:
                        await _bot_take_simple_turn(lref)
        finally:
            lref2 = LOBBIES.get(lid)
            if lref2:
                lref2.bot_task_running = False
            BOT_TASKS.pop(lid, None)
    task = asyncio.create_task(loop())
    BOT_TASKS[l.id] = task


async def _bot_take_simple_turn(l: Lobby):
    """Very basic bot: roll once, auto-handle effects, attempt buy if possible, end turn."""
    g = l.game
    if not g:
        return
    cur = g.players[g.current_turn]
    
    # Process recurring payments at start of bot turn
    _process_recurring_for(g, cur.name)
    if cur.cash < 0:
        # Bot cannot manage liquidation; trigger bankruptcy
        _handle_bankruptcy(g, cur.name)
        if _check_and_finalize_game(g):
            await sio.emit("game_state", {"lobby_id": l.id, "snapshot": g.snapshot()}, room=l.id)
            return
        # Adjust current_turn if player list changed
        if len(g.players) > 0:
            g.current_turn = g.current_turn % len(g.players)
        g.turns += 1
        g.rolls_left = 1
        g.rolled_this_turn = False
        await sio.emit("game_state", {"lobby_id": l.id, "snapshot": g.snapshot()}, room=l.id)
        return
    
    # Roll dice (reuse logic similar to game_action but simplified)
    d1 = random.randint(1, 6)
    d2 = random.randint(1, 6)
    roll = d1 + d2
    was_in_jail = cur.in_jail
    g.rolled_this_turn = True
    g.last_action = {"type": "rolled", "by": cur.name, "roll": roll, "d1": d1, "d2": d2}
    g.log.append({"type": "rolled", "text": f"{cur.name} rolled {d1} + {d2} = {roll}"})

    if cur.in_jail:
        if d1 == d2:
            cur.in_jail = False
            cur.jail_turns = 0
        else:
            cur.jail_turns += 1
            if cur.jail_turns < 3:
                g.log.append({"type": "jail", "text": f"{cur.name} did not roll doubles and remains in jail ({cur.jail_turns}/3)"})
                g.rolls_left = 0
                await sio.emit("game_state", {"lobby_id": l.id, "snapshot": g.snapshot()}, room=l.id)
                return
            cur.cash -= 50
            g.log.append({"type": "jail", "text": f"{cur.name} paid $50 to leave jail on the 3rd attempt"})
            cur.in_jail = False
            cur.jail_turns = 0

    if d1 == d2 and not was_in_jail:
        cur.doubles_count += 1
        if cur.doubles_count >= 3:
            cur.position = 10
            cur.in_jail = True
            cur.jail_turns = 0
            cur.doubles_count = 0
            g.rolls_left = 0
            g.log.append({"type": "gotojail", "text": f"{cur.name} rolled three consecutive doubles and was sent to Jail"})
            await sio.emit("game_state", {"lobby_id": l.id, "snapshot": g.snapshot()}, room=l.id)
            return
    else:
        cur.doubles_count = 0

    old_pos = cur.position
    new_pos = (cur.position + roll) % 40
    if old_pos + roll >= 40:
        retained = _route_inflow(g, cur.name, 200, "pass_go_bot", None)
        cur.cash += retained
        g.log.append({"type": "pass_go", "text": f"{cur.name} collected $200 for passing GO"})
    cur.position = new_pos
    _record_land(g, new_pos)

    tiles = monopoly_tiles()
    tile = tiles[new_pos]
    if tile.get("type") == "gotojail":
        cur.position = 10
        cur.in_jail = True
        cur.jail_turns = 0
        g.log.append({"type": "gotojail", "text": f"{cur.name} was sent to Jail"})
        g.rolls_left = 0
        await sio.emit("game_state", {"lobby_id": l.id, "snapshot": g.snapshot()}, room=l.id)
        return

    # Taxes
    if tile.get("type") == "tax":
        name = tile.get("name", "")
        amount = 0
        if "Income Tax" in name:
            tenpct = math.floor(_total_worth(g, cur) * 0.1)
            amount = min(200, tenpct)
        elif "Luxury Tax" in name:
            amount = 100
        if amount:
            cur.cash -= amount
            g.log.append({"type": "tax", "text": f"{cur.name} paid ${amount} in taxes"})
            # Check for negative cash after tax
            if cur.cash < 0:
                _handle_negative_cash(g, cur)
            # Force sync after tax payment to ensure client gets updated state
            await sio.emit("game_state", {"lobby_id": l.id, "snapshot": g.snapshot()}, room=l.id)

    # Chance/Chest
    if tile.get("type") in {"chance", "chest"}:
        card = _draw_card(tile.get("type"))
        card_name = "Chance" if tile.get("type") == "chance" else "Community Chest"
        card_text = card.get("text", f"Unknown {card_name} card")
        g.log.append({"type": "card_draw", "text": f"{cur.name} drew {card_name}: {card_text}"})
        _apply_card(g, cur, card, last_roll=roll)
        new_pos = cur.position
        tile = tiles[new_pos]
        _record_land(g, new_pos)
        
        # Force sync after card application to ensure client gets updated state
        await sio.emit("game_state", {"lobby_id": l.id, "snapshot": g.snapshot()}, room=l.id)
        
        if cur.in_jail:
            g.rolls_left = 0
            await sio.emit("game_state", {"lobby_id": l.id, "snapshot": g.snapshot()}, room=l.id)
            return
        if tile.get("type") == "tax":
            name = tile.get("name", "")
            amount = 0
            if "Income Tax" in name:
                tenpct = math.floor(_total_worth(g, cur) * 0.1)
                amount = min(200, tenpct)
            elif "Luxury Tax" in name:
                amount = 100
            if amount:
                cur.cash -= amount
                g.log.append({"type": "tax", "text": f"{cur.name} paid ${amount} in taxes (card move)"})
                # Check for negative cash after tax
                if cur.cash < 0:
                    _handle_negative_cash(g, cur)
                # Force sync after card-triggered tax payment
                await sio.emit("game_state", {"lobby_id": l.id, "snapshot": g.snapshot()}, room=l.id)

    # Rent
    try:
        rent_paid = _handle_rent(g, cur, cur.position, d1 + d2)
        # Force sync if rental payments were made to ensure immediate UI update
        if rent_paid and any(rental.get("last_payment_turn") == g.turns for rental in _ensure_rentals(g)):
            await _force_sync_all_clients(l.id, g)
    except Exception:
        pass

    # Simple buy decision
    p = cur.position
    tile = tiles[p]
    buyable = tile.get("type") in {"property", "railroad", "utility"}
    price = int(tile.get("price") or 0)
    st = g.properties.get(p) or PropertyState(pos=p)
    if buyable and st.owner is None and price > 0 and cur.cash >= price:
        st.owner = cur.name
        g.properties[p] = st
        cur.cash -= price
        g.last_action = {"type": "buy", "by": cur.name, "pos": p, "price": price, "name": tile.get("name")}
        g.log.append({"type": "buy", "text": f"{cur.name} bought {tile.get('name')} for ${price}"})

    # Process recurring obligations moved to start of turn (roll_dice)
    if cur.cash < 0:
        # Bots cannot manage liquidation; trigger bankruptcy to avoid stalling
        _handle_bankruptcy(g, cur.name)
        if _check_and_finalize_game(g):
            await sio.emit("game_state", {"lobby_id": l.id, "snapshot": g.snapshot()}, room=l.id)
            return
        # Adjust current_turn if player list changed
        if len(g.players) > 0:
            g.current_turn = g.current_turn % len(g.players)
        g.turns += 1
    else:
        # End turn (bots do not chain doubles in this simple AI)
        g.current_turn = (g.current_turn + 1) % len(g.players)
        g.last_action = {"type": "end_turn", "by": cur.name}
        g.turns += 1
    g.rolls_left = 1
    g.rolled_this_turn = False
    cur.doubles_count = 0
    await sio.emit("game_state", {"lobby_id": l.id, "snapshot": g.snapshot()}, room=l.id)


# ---------------------------
# Chat and misc
# ---------------------------

@sio.event
async def chat_send(sid, data):
    lobby_id = data.get("id")
    message = (data.get("message") or "").strip()
    if not lobby_id or not message:
        return
    if lobby_id not in LOBBIES:
        return
    l = LOBBIES[lobby_id]
    name = USERNAMES.get(sid) or l.sid_to_name.get(sid) or f"User-{sid[:4]}"
    payload = {"id": lobby_id, "from": name, "message": message, "ts": int(asyncio.get_event_loop().time())}
    try:
        l.chat.append(payload)
        if len(l.chat) > 200:
            l.chat = l.chat[-200:]
    except Exception:
        pass
    # Emit legacy lobby chat event (kept for backward compatibility)
    await sio.emit("lobby_chat", payload, room=lobby_id)
    # Always emit unified chat_message event so clients can rely on it regardless of game state
    await sio.emit("chat_message", {"from": name, "message": message, "lobby_id": lobby_id, "ts": payload["ts"]}, room=lobby_id)


# ---------------------------
# Entrypoint
# ---------------------------

# To run:
#   uvicorn server.main:asgi --reload --host 127.0.0.1 --port 8000
