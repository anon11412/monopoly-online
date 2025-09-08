from __future__ import annotations

import asyncio
import math
import json
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

    def snapshot(self) -> Dict[str, Any]:
        return {
            "players": [asdict(p) for p in self.players],
            "current_turn": self.current_turn,
            "board_len": 40,
            "properties": {str(k): asdict(v) for k, v in self.properties.items()},
            "last_action": self.last_action,
            "log": self.log[-200:],
            "pending_trades": self.pending_trades[-50:],
            "rolls_left": self.rolls_left,
            "rolled_this_turn": self.rolled_this_turn,
            "recurring": self.recurring,
            "round": self.round,
            "turns": self.turns,
            "game_over": self.game_over,
            # Include tile meta for client UIs (names/types/prices/colors)
            "tiles": build_board_meta(),
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
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
asgi = socketio.ASGIApp(sio, other_asgi_app=app)

# Track background bot tasks per lobby
BOT_TASKS: Dict[str, asyncio.Task] = {}


# ---------------------------
# Board metadata
# ---------------------------

def monopoly_tiles() -> List[Dict[str, Any]]:
    """Classic Monopoly tiles with names, types, colors, and prices where applicable."""
    T = [
    {"name": "GO", "type": "go"},
    {"name": "Mediterranean Avenue", "type": "property", "group": "brown", "price": 60, "color": "#8B4513", "rent": 2},
        {"name": "Community Chest", "type": "chest"},
    {"name": "Baltic Avenue", "type": "property", "group": "brown", "price": 60, "color": "#8B4513", "rent": 4},
        {"name": "Income Tax", "type": "tax"},
        {"name": "Reading Railroad", "type": "railroad", "group": "railroad", "price": 200},
    {"name": "Oriental Avenue", "type": "property", "group": "light-blue", "price": 100, "color": "#ADD8E6", "rent": 6},
        {"name": "Chance", "type": "chance"},
    {"name": "Vermont Avenue", "type": "property", "group": "light-blue", "price": 100, "color": "#ADD8E6", "rent": 6},
    {"name": "Connecticut Avenue", "type": "property", "group": "light-blue", "price": 120, "color": "#ADD8E6", "rent": 8},
        {"name": "Jail / Just Visiting", "type": "jail"},
    {"name": "St. Charles Place", "type": "property", "group": "pink", "price": 140, "color": "#FF69B4", "rent": 10},
        {"name": "Electric Company", "type": "utility", "group": "utility", "price": 150},
    {"name": "States Avenue", "type": "property", "group": "pink", "price": 140, "color": "#FF69B4", "rent": 10},
    {"name": "Virginia Avenue", "type": "property", "group": "pink", "price": 160, "color": "#FF69B4", "rent": 12},
        {"name": "Pennsylvania Railroad", "type": "railroad", "group": "railroad", "price": 200},
    {"name": "St. James Place", "type": "property", "group": "orange", "price": 180, "color": "#FFA500", "rent": 14},
        {"name": "Community Chest", "type": "chest"},
    {"name": "Tennessee Avenue", "type": "property", "group": "orange", "price": 180, "color": "#FFA500", "rent": 14},
    {"name": "New York Avenue", "type": "property", "group": "orange", "price": 200, "color": "#FFA500", "rent": 16},
        {"name": "Free Parking", "type": "free"},
    {"name": "Kentucky Avenue", "type": "property", "group": "red", "price": 220, "color": "#FF0000", "rent": 18},
        {"name": "Chance", "type": "chance"},
    {"name": "Indiana Avenue", "type": "property", "group": "red", "price": 220, "color": "#FF0000", "rent": 18},
    {"name": "Illinois Avenue", "type": "property", "group": "red", "price": 240, "color": "#FF0000", "rent": 20},
        {"name": "B. & O. Railroad", "type": "railroad", "group": "railroad", "price": 200},
    {"name": "Atlantic Avenue", "type": "property", "group": "yellow", "price": 260, "color": "#FFFF00", "rent": 22},
    {"name": "Ventnor Avenue", "type": "property", "group": "yellow", "price": 260, "color": "#FFFF00", "rent": 22},
        {"name": "Water Works", "type": "utility", "group": "utility", "price": 150},
    {"name": "Marvin Gardens", "type": "property", "group": "yellow", "price": 280, "color": "#FFFF00", "rent": 24},
        {"name": "Go To Jail", "type": "gotojail"},
    {"name": "Pacific Avenue", "type": "property", "group": "green", "price": 300, "color": "#008000", "rent": 26},
    {"name": "North Carolina Avenue", "type": "property", "group": "green", "price": 300, "color": "#008000", "rent": 26},
        {"name": "Community Chest", "type": "chest"},
    {"name": "Pennsylvania Avenue", "type": "property", "group": "green", "price": 320, "color": "#008000", "rent": 28},
        {"name": "Short Line", "type": "railroad", "group": "railroad", "price": 200},
        {"name": "Chance", "type": "chance"},
    {"name": "Park Place", "type": "property", "group": "dark-blue", "price": 350, "color": "#00008B", "rent": 35},
        {"name": "Luxury Tax", "type": "tax"},
    {"name": "Boardwalk", "type": "property", "group": "dark-blue", "price": 400, "color": "#00008B", "rent": 50},
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


def lobby_state(l: Lobby) -> Dict[str, Any]:
    # Compute seconds remaining for any disconnect deadlines (monotonic clock)
    loop = asyncio.get_event_loop()
    now = loop.time() if loop else 0.0
    remain = {name: max(0, int(deadline - now)) for name, deadline in l.disconnect_deadlines.items()}
    return {
        "id": l.id,
        "name": l.name,
        "host_sid": l.host_sid,
        "players": l.players,
        "players_map": l.sid_to_name,
        "ready": l.ready,
    "bots": l.bots,
    "kick_votes": {k: list(set(v)) for k, v in l.kick_votes.items()},
        "disconnect_remain": remain,
    }


@sio.event
async def connect(sid, environ, auth):
    # Nothing on connect yet
    return


@sio.event
async def disconnect(sid):
    USERNAMES.pop(sid, None)
    # remove sid from lobbies
    for l in list(LOBBIES.values()):
        if sid in l.sid_to_name:
            name = l.sid_to_name.pop(sid)
            # If a game is not started yet, removing the player entirely is fine.
            # If a game is active, keep the name in the players list to support reconnection.
            if not l.game and name in l.players:
                l.players.remove(name)
            if sid in l.ready:
                l.ready.remove(sid)
            # If the host disconnected, transfer host to another connected sid if available
            if l.host_sid == sid:
                l.host_sid = next(iter(l.sid_to_name.keys()), l.host_sid)
            # Track disconnect deadline if game active
            if l.game and name:
                l.disconnect_deadlines[name] = asyncio.get_event_loop().time() + 120.0
                # schedule cleanup if not reconnected
                async def timeout_check(lobby_id: str, pname: str, due: float):
                    await asyncio.sleep(max(0, due - asyncio.get_event_loop().time()))
                    l2 = LOBBIES.get(lobby_id)
                    if not l2:
                        return
                    # If player still not reconnected
                    if l2.disconnect_deadlines.get(pname, 0) <= asyncio.get_event_loop().time():
                        # Keep their name in players list (spectator), but no active sid
                        l2.disconnect_deadlines.pop(pname, None)
                        await sio.emit("lobby_state", lobby_state(l2), room=lobby_id)
                asyncio.create_task(timeout_check(l.id, name, l.disconnect_deadlines[name]))
            await sio.emit("lobby_state", lobby_state(l), room=l.id)


@sio.event
async def auth(sid, data):
    USERNAMES[sid] = data.get("display") or f"User-{sid[:4]}"
    # Clear any pending disconnect deadline for this name in any lobby
    name = USERNAMES[sid]
    for l in LOBBIES.values():
        for k, v in list(l.disconnect_deadlines.items()):
            if k == name:
                l.disconnect_deadlines.pop(k, None)


@sio.event
async def lobby_list(sid):
    # Only include lobbies without an active game
    await sio.emit("lobby_list", {"lobbies": [lobby_state(l) for l in LOBBIES.values() if not l.game]}, to=sid)


@sio.event
async def lobby_create(sid, data):
    lobby_id = f"l{random.randint(1000, 9999)}"
    name = data.get("name") or lobby_id
    l = Lobby(id=lobby_id, name=name, host_sid=sid)
    LOBBIES[lobby_id] = l
    await lobby_join(sid, {"id": lobby_id})
    await sio.emit("lobby_list", {"lobbies": [lobby_state(x) for x in LOBBIES.values() if not x.game]})
    return {"ok": True, "lobby": lobby_state(l)}


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
    votes = set(l.kick_votes.get(target, []))
    votes.add(voter)
    l.kick_votes[target] = list(votes)
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
    await sio.emit("lobby_state", lobby_state(l), room=lobby_id)


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
    name = USERNAMES.get(sid) or f"User-{sid[:4]}"
    l.sid_to_name[sid] = name
    if name not in l.players:
        l.players.append(name)
    await sio.enter_room(sid, lobby_id)
    await sio.emit("lobby_joined", lobby_state(l), to=sid)
    await sio.emit("lobby_state", lobby_state(l), room=lobby_id)
    # If a game is already running, send the current snapshot to allow resume
    if l.game:
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
async def lobby_start(sid, data):
    lobby_id = data.get("id")
    if lobby_id not in LOBBIES:
        return {"ok": False, "error": "Lobby missing"}
    l = LOBBIES[lobby_id]
    if sid != l.host_sid:
        return {"ok": False, "error": "Only host"}
    if len(l.players) < 2:
        return {"ok": False, "error": "Need at least 2 players"}

    players = [Player(name=p) for p in l.players]
    game = Game(players=players)
    # Assign colors
    palette = [
        "#e74c3c", "#3498db", "#2ecc71", "#f1c40f",
        "#9b59b6", "#e67e22", "#1abc9c", "#e84393",
    ]
    for i, pl in enumerate(game.players):
        pl.color = palette[i % len(palette)]
    l.game = game
    game.log.append({"type": "info", "text": f"Game started with players: {', '.join(l.players)}"})
    await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": game.snapshot()}, room=lobby_id)
    # Update lobby list so started lobby disappears
    await sio.emit("lobby_list", {"lobbies": [lobby_state(x) for x in LOBBIES.values() if not x.game]})
    # Start bot runner if needed
    await _ensure_bot_runner(l)
    return {"ok": True}


# ---------------------------
# Game actions (minimal)
# ---------------------------

@sio.event
async def game_action(sid, data):
    lobby_id = data.get("id")
    action = data.get("action") or {}
    if lobby_id not in LOBBIES:
        return
    l = LOBBIES[lobby_id]
    g = l.game
    if not g:
        return
    t = action.get("type")
    cur = g.players[g.current_turn]

    # Resolve actor display name from sid
    actor = USERNAMES.get(sid) or l.sid_to_name.get(sid) or f"User-{sid[:4]}"
    is_turn_actor = (actor == cur.name)

    # Define which actions must be performed by the current-turn player
    turn_bound = {
        "roll_dice", "buy_property", "end_turn", "bankrupt", "use_jail_card",
        "mortgage", "unmortgage", "buy_house", "sell_house", "buy_hotel", "sell_hotel",
    }
    if t in turn_bound and not is_turn_actor:
        g.last_action = {"type": "not_your_turn", "by": actor, "expected": cur.name, "action": t}
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return

    if t == "roll_dice":
        # Gate rolls by remaining moves this turn
        if g.rolls_left <= 0:
            g.last_action = {"type": "no_rolls", "by": cur.name}
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        d1 = random.randint(1, 6)
        d2 = random.randint(1, 6)
        roll = d1 + d2

        # Mark that we've rolled this turn; set last_action first so UI can show dice consistently
    g.rolled_this_turn = True
    g.last_action = {"type": "rolled", "by": cur.name, "roll": roll, "d1": d1, "d2": d2, "doubles": bool(d1 == d2)}
        g.log.append({"type": "rolled", "text": f"{cur.name} rolled {d1} + {d2} = {roll}"})

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
                cur.cash -= 50
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
            cur.cash += 200
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
                cur.cash -= amount
                g.log.append({"type": "tax", "text": f"{cur.name} paid ${amount} in taxes"})

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
                    cur.cash -= amount
                    g.log.append({"type": "tax", "text": f"{cur.name} paid ${amount} in taxes (card move)"})

        # Rent payment
        try:
            _handle_rent(g, cur, new_pos, d1 + d2)
        except Exception:
            # Avoid crashing game on rent errors; continue
            pass

        # Rolls remaining logic
        if d1 == d2 and not was_in_jail:
            # Grant an extra roll for doubles (not when leaving jail by doubles)
            g.rolls_left += 1
        else:
            g.rolls_left = 0
        # Any activity cancels kick votes against current player
        for l in LOBBIES.values():
            if l.game is g:
                l.kick_votes.pop(cur.name, None)
                break

        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return

    # Buy current property (if eligible)
    if t == "buy_property":
        p = cur.position
        tiles = monopoly_tiles()
        tile = tiles[p]
        buyable = tile["type"] in {"property", "railroad", "utility"}
        price = int(tile.get("price") or 0)
        st = g.properties.get(p) or PropertyState(pos=p)
        if buyable and st.owner is None and price > 0 and cur.cash >= price:
            st.owner = cur.name
            g.properties[p] = st
            cur.cash -= price
            g.last_action = {"type": "buy", "by": cur.name, "pos": p, "price": price, "name": tile["name"]}
            g.log.append({"type": "buy", "text": f"{cur.name} bought {tile['name']} for ${price}"})
        else:
            reason = "not_buyable"
            if not buyable:
                reason = "not_buyable"
            elif st.owner is not None:
                reason = "owned"
            elif price <= 0:
                reason = "no_price"
            elif cur.cash < price:
                reason = "insufficient_cash"
            g.last_action = {"type": "buy_failed", "by": cur.name, "pos": p, "reason": reason}
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return

    # End turn (advance player, reset roll state)
    if t == "end_turn":
        # Only allow ending turn after at least one roll and no remaining rolls
        if not g.rolled_this_turn or g.rolls_left > 0:
            g.last_action = {"type": "end_turn_denied", "by": cur.name, "reason": "roll_required_or_pending"}
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        # Disallow ending turn with negative balance
        if cur.cash < 0:
            g.last_action = {"type": "end_turn_denied", "by": cur.name, "reason": "negative_balance"}
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        prev = g.current_turn
        g.current_turn = (g.current_turn + 1) % len(g.players)
        if g.current_turn == 0 and prev != 0:
            g.round += 1
        g.rolls_left = 1
        g.rolled_this_turn = False
        cur.doubles_count = 0
        g.last_action = {"type": "end_turn", "by": cur.name}
        g.log.append({"type": "end_turn", "text": f"{cur.name} ended their turn"})
        g.turns += 1
        # Process recurring for the new current player at start-of-turn
        nxt = g.players[g.current_turn]
        _process_recurring_for(g, nxt.name)
        # If game already over, broadcast and return
        if _check_and_finalize_game(g):
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return

    if t == "bankrupt":
        _handle_bankruptcy(g, cur.name)
        # Advance turn if necessary (only if game not ended and current player still exists index-wise)
        if g.game_over is None and len(g.players) > 0:
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
            if st.houses > 0 or st.hotel:
                g.last_action = {"type": "mortgage_denied", "by": cur.name, "pos": pos, "reason": "has_buildings"}
            elif st.mortgaged:
                g.last_action = {"type": "mortgage_denied", "by": cur.name, "pos": pos, "reason": "already_mortgaged"}
            else:
                st.mortgaged = True
                g.properties[pos] = st
                amt = _mortgage_value(pos)
                cur.cash += amt
                g.last_action = {"type": "mortgage", "by": cur.name, "pos": pos, "amount": amt}
                g.log.append({"type": "mortgage", "text": f"{cur.name} mortgaged {tile['name']} for ${amt}"})
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
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        if t == "buy_house":
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
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        if t == "sell_house":
            if st.houses <= 0 or st.hotel:
                g.last_action = {"type": "sell_house_denied", "by": cur.name, "pos": pos, "reason": "no_houses_or_hotel"}
            elif not can_build_even(pos, -1):
                g.last_action = {"type": "sell_house_denied", "by": cur.name, "pos": pos, "reason": "even_rule"}
            else:
                st.houses -= 1
                cur.cash += house_cost // 2
                g.properties[pos] = st
                g.last_action = {"type": "sell_house", "by": cur.name, "pos": pos, "refund": house_cost // 2}
                g.log.append({"type": "sell_house", "text": f"{cur.name} sold a house on {tile['name']} for ${house_cost//2}"})
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
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        if t == "sell_hotel":
            if not st.hotel:
                g.last_action = {"type": "sell_hotel_denied", "by": cur.name, "pos": pos}
            else:
                st.hotel = False
                st.houses = 4
                cur.cash += house_cost // 2
                g.properties[pos] = st
                g.last_action = {"type": "sell_hotel", "by": cur.name, "pos": pos, "refund": house_cost // 2}
                g.log.append({"type": "sell_hotel", "text": f"{cur.name} sold a hotel on {tile['name']} for ${house_cost//2}"})
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return

    # Trade flow (minimal protocol)
    if t == "offer_trade":
        give = action.get("give")
        receive = action.get("receive")
        # Back-compat: allow simple quick cash offer with { to, cash }
        if not give and not receive and (action.get("cash") is not None):
            give = {"cash": int(action.get("cash") or 0)}
            receive = {}
        offer = {
            "id": f"tr{random.randint(1000,9999)}",
            "type": "trade_offer",
            "from": actor,
            "to": action.get("to"),
            "give": give or {},
            "receive": receive or {},
        }
        g.pending_trades.append(offer)
        g.last_action = offer
        g.log.append({"type": "trade_created", "id": offer["id"], "text": f"{actor} offered a trade to {offer['to']} (#{offer['id']})"})
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return
    if t == "accept_trade":
        trade_id = action.get("trade_id")
        offer = action.get("offer") or next((o for o in g.pending_trades if o.get("id") == trade_id), None)
        if not offer:
            g.last_action = {"type": "trade_missing", "id": trade_id}
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        # Only the intended recipient may accept
        if actor != offer.get("to"):
            g.last_action = {"type": "trade_accept_denied", "by": actor, "expected": offer.get("to"), "id": trade_id}
            await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
            return
        # Transfer cash
        cash_a = int(offer.get("give", {}).get("cash") or 0)
        cash_b = int(offer.get("receive", {}).get("cash") or 0)
        a = _find_player(g, offer.get("from"))
        b = _find_player(g, offer.get("to"))
        if a and b:
            a.cash -= cash_a
            b.cash += cash_a
            b.cash -= cash_b
            a.cash += cash_b
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
        g.pending_trades = [o for o in g.pending_trades if o.get("id") != trade_id]
        g.last_action = {"type": "trade_accepted", "id": trade_id}
        g.log.append({"type": "trade_accepted", "id": trade_id, "text": f"Trade {trade_id} accepted by {actor}"})
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return
    if t == "decline_trade":
        trade_id = action.get("trade_id")
        offer = next((o for o in g.pending_trades if o.get("id") == trade_id), None)
        if not offer:
            g.last_action = {"type": "trade_missing", "id": trade_id}
        elif actor != offer.get("to"):
            g.last_action = {"type": "trade_decline_denied", "by": actor, "expected": offer.get("to"), "id": trade_id}
        else:
            g.pending_trades = [o for o in g.pending_trades if o.get("id") != trade_id]
            g.last_action = {"type": "trade_declined", "id": trade_id}
            g.log.append({"type": "trade_declined", "id": trade_id, "text": f"Trade {trade_id} declined by {actor}"})
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return
    if t == "cancel_trade":
        trade_id = action.get("trade_id")
        # Only cancel trades created by the same actor
        before = len(g.pending_trades)
        g.pending_trades = [o for o in g.pending_trades if not (o.get("id") == trade_id and o.get("from") == actor)]
        if len(g.pending_trades) < before:
            g.last_action = {"type": "trade_canceled", "id": trade_id}
            g.log.append({"type": "trade_canceled", "id": trade_id, "text": f"Trade {trade_id} canceled by {actor}"})
        else:
            g.last_action = {"type": "trade_cancel_denied", "id": trade_id}
        await sio.emit("game_state", {"lobby_id": lobby_id, "snapshot": g.snapshot()}, room=lobby_id)
        return


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


def _handle_rent(g: Game, cur: Player, pos: int, last_roll: int) -> None:
    tiles = monopoly_tiles()
    tile = tiles[pos]
    ttype = tile.get("type")
    if ttype not in {"property", "railroad", "utility"}:
        return

    st = g.properties.get(pos)
    owner_name = st.owner if st else None
    if not owner_name or owner_name == cur.name:
        return
    if st and st.mortgaged:
        return

    owner = _find_player(g, owner_name)
    if not owner:
        return

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
        return

    cur.cash -= rent
    owner.cash += rent
    g.log.append({"type": "rent", "text": f"{cur.name} paid ${rent} rent to {owner.name} for landing on {tile.get('name')}"})


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
            pay.cash -= amt
            rec.cash += amt
            g.log.append({"type": "recurring_pay", "text": f"{payer} paid ${amt} to {to_name} (recurring)"})
        left = int(r.get("turns_left") or 0) - 1
        if left > 0:
            r["turns_left"] = left
            remaining.append(r)
        else:
            g.log.append({"type": "recurring_done", "text": f"Recurring payment from {payer} to {to_name} completed"})
    g.recurring = remaining


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
            {"kind": "advance_to", "target": "GO"},
            {"kind": "advance_to", "target": "Illinois Avenue"},
            {"kind": "advance_to", "target": "St. Charles Place"},
            {"kind": "nearest", "target": "railroad", "special_rent": "double"},
            {"kind": "nearest", "target": "utility", "special_rent": "ten_x"},
            {"kind": "goto_jail"},
            {"kind": "collect", "amount": 50, "text": "Bank pays you dividend of $50"},
            {"kind": "pay", "amount": 15, "text": "Pay poor tax of $15"},
            {"kind": "repairs", "house": 25, "hotel": 100, "text": "Make general repairs: $25 per house, $100 per hotel"},
            {"kind": "jail_free", "text": "Get Out of Jail Free (Chance)"},
        ]
    else:
        cards = [
            {"kind": "advance_to", "target": "GO"},
            {"kind": "goto_jail"},
            {"kind": "collect", "amount": 200, "text": "You inherit $200"},
            {"kind": "pay", "amount": 50, "text": "Doctor's fees $50"},
            {"kind": "repairs", "house": 40, "hotel": 115, "text": "Street repairs: $40 per house, $115 per hotel"},
            {"kind": "jail_free", "text": "Get Out of Jail Free (Chest)"},
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
            cur.cash += 200
            g.log.append({"type": "card", "text": f"{cur.name} advanced to GO and collected $200"})
            _record_land(g, 0)
            return
        pos = _tile_pos_by_name(str(target))
        if pos is not None:
            # Award $200 if passing GO as part of move
            if (cur.position > pos):
                cur.cash += 200
                g.log.append({"type": "pass_go", "text": f"{cur.name} collected $200 for passing GO (card)"})
            cur.position = pos
            g.log.append({"type": "card", "text": f"{cur.name} advanced to {target}"})
            _record_land(g, pos)
        return
    if kind == "collect":
        amount = int(card.get("amount") or 0)
        cur.cash += amount
        g.log.append({"type": "card", "text": card.get("text") or f"Collected ${amount}"})
        return
    if kind == "pay":
        amount = int(card.get("amount") or 0)
        cur.cash -= amount
        g.log.append({"type": "card", "text": card.get("text") or f"Paid ${amount}"})
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
            cur.cash -= total
            g.log.append({"type": "card", "text": f"{cur.name} paid ${total} for repairs"})
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
            cur.cash += 200
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
                cur.cash -= rent
                p_owner = _find_player(g, owner)
                if p_owner:
                    p_owner.cash += rent
                g.log.append({"type": "rent", "text": f"{cur.name} paid ${rent} (double RR rent) to {owner}"})
        if special == "ten_x" and target == "utility":
            pos = cur.position
            st = g.properties.get(pos)
            owner = st.owner if st else None
            if owner and owner != cur.name and not (st and st.mortgaged):
                rent = 10 * max(2, min(12, int(last_roll or 0)))
                cur.cash -= rent
                p_owner = _find_player(g, owner)
                if p_owner:
                    p_owner.cash += rent
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
    # Add a simple bot as a named player; bots share lobby player list
    bot_name = f"Bot-{random.randint(100,999)}"
    l.players.append(bot_name)
    l.bots.append(bot_name)
    await sio.emit("lobby_state", lobby_state(l), room=lobby_id)
    # Ensure bot runner is active
    await _ensure_bot_runner(l)
    return {"ok": True, "name": bot_name}


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
        cur.cash += 200
        g.log.append({"type": "pass_go", "text": f"{cur.name} collected $200 for passing GO"})
    cur.position = new_pos

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

    # Chance/Chest
    if tile.get("type") in {"chance", "chest"}:
        card = _draw_card(tile.get("type"))
        _apply_card(g, cur, card, last_roll=roll)
        new_pos = cur.position
        tile = tiles[new_pos]
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

    # Rent
    try:
        _handle_rent(g, cur, cur.position, d1 + d2)
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

    # End turn (bots do not chain doubles in this simple AI)
    g.current_turn = (g.current_turn + 1) % len(g.players)
    g.rolls_left = 1
    g.rolled_this_turn = False
    cur.doubles_count = 0
    g.last_action = {"type": "end_turn", "by": cur.name}
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
    name = USERNAMES.get(sid) or f"User-{sid[:4]}"
    await sio.emit("lobby_chat", {"id": lobby_id, "from": name, "message": message}, room=lobby_id)


# ---------------------------
# Entrypoint
# ---------------------------

# To run:
#   uvicorn server.main:asgi --reload --host 127.0.0.1 --port 8000
